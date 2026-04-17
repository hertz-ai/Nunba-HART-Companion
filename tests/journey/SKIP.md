# Journey suite — SKIPPED journeys

Each row below is a USER JOURNEY from `PRODUCT_MAP.md §USER JOURNEYS`
that phase-2 did NOT implement.  Reason is cited inline.  Phase-3 (or
later) is free to promote any of these back in once the underlying
surface or hardware ships.

| J-ID | Short name | Reason skipped |
|---|---|---|
| J15 | Mic → Whisper → LLM → TTS loop | Requires a real microphone device + Whisper model weights (≥500 MB); CI runners have neither. Covered at integration tier only. |
| J16 | Camera consent → MiniCPM caption | Needs a real webcam feed. VisionService spawns a WS frame receiver that expects live JPEG frames from a camera; no CI runner exposes /dev/video0 or a WebCam capture device. |
| J21..J51 | Channel enable for 31 adapters | 30 of 31 channels need external tokens (Discord, Slack, Telegram, WhatsApp, Signal, iMessage, Teams, Matrix, WeChat, etc.). Only the `web` adapter is reachable without creds and it's already covered indirectly via J53..J57. |
| J58 | DMs foundation | GAP — channel 0x09 defined in `core/peer_link/channels.py:92` but no HTTP/WebSocket surface mounted. PRODUCT_MAP §GAPS FLAGGED #1. |
| J59 | Kids pick template + play + submit + score | Requires a real game session engine with WAMP-joined participants; the score loop spans 3+ background threads and a persisted game_session row. Flaky under `nunba_flask_app` because session progression is driven by async game_engine ticks (not request/response). |
| J62 | Peer discover + offload | Two-process topology — needs two `nunba_subprocess` instances + PeerLink UDP discovery. Listed as CI:partial in map, deferred to phase-3 dedicated two-node harness. |
| J63 | E2E encrypted cross-user channel | Requires two real user identities + crypto keypair exchange + PeerLink transport. Covered at security unit tier (`tests/test_channel_encryption.py`). |
| J64 | HiveMind query fusion 3-level | GAP — no explicit 3-level fusion routine. PRODUCT_MAP §GAPS FLAGGED #2. |
| J68 | CUDA torch D:/ fallback | Requires D: drive on Windows. CI runners are Linux-only for pytest matrix. |
| J70 | Clean kill no zombie | Outcome is measured by external `netstat`/`lsof` of the host — not verifiable from inside a pytest that itself holds the Flask app open. |
| J76 | VLM caption via draft :8081 | Needs real Qwen-VL draft weights loaded into a real llama-server on :8081. Not cached on CI. |
| J77 | VLM caption via MiniCPM sidecar | Needs real MiniCPM weights + spawned sidecar subprocess. Not cached on CI. |
| J81 | Fleet restart on tier promote | Restart watcher re-execs the entire Python process (`os.execv`). Inside pytest that would abort the test runner. Covered by live install tests only. |
| J86 | Start remote desktop host | PRODUCT_MAP explicitly lists CI:no. Needs real desktop capture + RDP-alike port. |
| J87 | Connect viewer | Same as J86 — CI:no. |
| J90 | Video-gen job | Needs `video_gen-wan2gp` weights (~8 GB) or `ltx2` (~4 GB). Not cached on CI. |
| J91 | Audio-gen music | Needs acestep / diffrhythm weights. Not cached on CI. |

Implemented:
  Batch-A (15): J01 J02 J18 J19 J20 J53 J54 J55 J56 J57 J61 J66 J67 J69 J99
  Batch-B (15): J60 J65 J71 J72 J73 J75 J78 J79 J80 J82 J83 J84 J85 J88 J89
  Batch-C (12): J03..J14 (as a single parametrised file), plus J17 J52 J92 J93 J94 J95 J96 J97 J98 J74
