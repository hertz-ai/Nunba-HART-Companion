/**
 * useCameraFrameStream — capture getUserMedia frames and push them
 * over a WebSocket to HARTOS VisionService on port 5460.
 *
 * VisionService.start('full') listens on :5460 for JPEG frames keyed by
 * {user_id, channel}. Its description loop (~4s cadence) runs the
 * 0.8B VLM on each new frame and writes captions to MemoryGraph, so
 * the agent can answer "what am I doing now" / "what did I see 5min
 * ago". Before this hook there was NO client code in Nunba producing
 * frames — the server side was listening to an empty socket.
 *
 * Usage:
 *   useCameraFrameStream({
 *     enabled: cameraOn,
 *     userId: decryptedUserId,
 *     wsUrl: 'ws://127.0.0.1:5460',  // defaults to /vision/stream-port
 *   });
 *
 * The hook is idempotent per (enabled, userId) pair — toggling enabled
 * tears down the stream cleanly and stops the track so the browser
 * LED goes off.
 */
import {useEffect, useRef} from 'react';

const DEFAULT_FPS = 1;       // one frame per second is plenty for captions
const JPEG_QUALITY = 0.7;     // tradeoff: smaller over wire vs caption fidelity
const MAX_DIMENSION = 640;    // downsample — 0.8B VLM works fine at 640x480

export default function useCameraFrameStream({
  enabled,
  userId,
  channel = 'camera',
  wsUrl = null,
  fps = DEFAULT_FPS,
} = {}) {
  const streamRef = useRef(null);
  const wsRef = useRef(null);
  const intervalRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!enabled || !userId) {
      return undefined;
    }

    let cancelled = false;

    const stop = () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (wsRef.current) {
        try {
          wsRef.current.close();
        } catch {
          /* swallow — WebSocket may already be closed */
        }
        wsRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            /* track already stopped */
          }
        });
        streamRef.current = null;
      }
      if (videoRef.current) {
        try {
          videoRef.current.pause();
        } catch { /* ignore */ }
        videoRef.current.srcObject = null;
        videoRef.current = null;
      }
      canvasRef.current = null;
    };

    (async () => {
      try {
        // Resolve WebSocket URL. Backend exposes /vision/stream-port
        // so the port stays configurable; fall back to 5460 direct.
        let resolved = wsUrl;
        if (!resolved) {
          try {
            const portResp = await fetch('/vision/stream-port');
            if (portResp.ok) {
              const data = await portResp.json();
              resolved = data.url || `ws://127.0.0.1:${data.port || 5460}`;
            }
          } catch { /* fall through to default */ }
        }
        if (!resolved) {
          resolved = 'ws://127.0.0.1:5460';
        }

        // getUserMedia + hidden video + offscreen canvas for JPEG encode
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: {ideal: MAX_DIMENSION},
            height: {ideal: Math.round(MAX_DIMENSION * 3 / 4)},
            frameRate: {ideal: Math.max(fps, 5)},
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const video = document.createElement('video');
        video.srcObject = stream;
        video.muted = true;
        video.playsInline = true;
        await video.play();
        videoRef.current = video;

        const canvas = document.createElement('canvas');
        canvas.width = Math.min(video.videoWidth || MAX_DIMENSION, MAX_DIMENSION);
        canvas.height = Math.min(
          video.videoHeight || Math.round(MAX_DIMENSION * 3 / 4),
          Math.round(MAX_DIMENSION * 3 / 4),
        );
        canvasRef.current = canvas;
        const ctx = canvas.getContext('2d');

        // Open WebSocket + identify
        const ws = new WebSocket(resolved);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          try {
            // VisionService _ws_handler protocol (integrations/vision/
            // vision_service.py:564):
            //   1. digit string → identifies user_id
            //   2. 'video_start' (camera) or 'screen_start' (screen)
            //   3. binary JPEG frames
            //   4. 'video_stop' to end
            // Prior JSON register was silently ignored — frames arrived
            // with user_id=None so put_frame was never called.
            ws.send(String(userId));
            ws.send(channel === 'screen' ? 'screen_start' : 'video_start');
          } catch { /* ignore */ }
        };

        ws.onerror = () => { /* server will reconnect next toggle */ };

        const captureAndSend = () => {
          if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
          if (!videoRef.current || videoRef.current.readyState < 2) return;
          try {
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((blob) => {
              if (!blob || !wsRef.current) return;
              blob.arrayBuffer().then((buf) => {
                try {
                  wsRef.current.send(buf);
                } catch { /* socket closed */ }
              });
            }, 'image/jpeg', JPEG_QUALITY);
          } catch { /* frame drop — next tick retries */ }
        };

        intervalRef.current = setInterval(captureAndSend, Math.round(1000 / fps));
      } catch (e) {
        /* eslint-disable-next-line no-console */
        console.warn('useCameraFrameStream: getUserMedia or WebSocket failed', e);
        stop();
      }
    })();

    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, userId, channel, wsUrl, fps]);
}
