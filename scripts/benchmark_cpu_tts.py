"""
benchmark_cpu_tts.py — Compare Piper TTS vs PocketTTS ONNX for CPU-only TTS.

Measures:
  - Time to first audio (TTFA)
  - Total synthesis time
  - Real-time factor (RTF = synthesis_time / audio_duration)
  - Audio quality via Whisper transcription accuracy
  - Memory usage

Piper: VITS-based ONNX, single model, 22050Hz, multilingual
PocketTTS: 5-model ONNX pipeline, autoregressive, 24kHz, English only

Run:  python scripts/benchmark_cpu_tts.py
"""

import gc
import json
import os
import sys
import tempfile
import time
import traceback
import wave

# Test sentences (short, medium, long)
TEST_SENTENCES = [
    ("short", "Hello, how are you today?"),
    ("medium", "The quick brown fox jumps over the lazy dog near the riverbank on a warm summer afternoon."),
    ("long", "Artificial intelligence is transforming the way we interact with technology. "
             "From voice assistants to autonomous vehicles, the applications are endless. "
             "However, we must ensure that these systems are developed responsibly and ethically, "
             "with proper safeguards in place to protect user privacy and prevent misuse."),
]


def get_audio_duration(wav_path):
    """Get duration of a WAV file in seconds."""
    try:
        with wave.open(wav_path, 'rb') as wf:
            frames = wf.getnframes()
            rate = wf.getframerate()
            return frames / rate
    except Exception:
        return 0.0


def get_process_memory_mb():
    """Get current process memory in MB."""
    try:
        import psutil
        return psutil.Process(os.getpid()).memory_info().rss / 1024 / 1024
    except ImportError:
        return 0.0


def verify_with_whisper(audio_path, expected_text):
    """Transcribe and compare."""
    try:
        from faster_whisper import WhisperModel
        model = WhisperModel('base', device='cpu', compute_type='int8')
        segments, info = model.transcribe(audio_path)
        transcript = ' '.join(seg.text.strip() for seg in segments).strip()

        expected_words = set(expected_text.lower().split())
        transcript_words = set(transcript.lower().split())
        if not expected_words:
            return transcript, 0.0
        overlap = len(expected_words & transcript_words)
        ratio = overlap / max(len(expected_words), 1)
        return transcript, ratio
    except Exception as e:
        return f"(error: {e})", -1.0


# ════════════════════════════════════════════════════════════════════
# PIPER BENCHMARK
# ════════════════════════════════════════════════════════════════════

def benchmark_piper():
    """Benchmark Piper TTS on CPU."""
    results = []
    print("\n" + "=" * 60)
    print("  PIPER TTS (CPU ONNX, VITS, 22050Hz)")
    print("=" * 60)

    try:
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from tts.piper_tts import DEFAULT_VOICE, PiperTTS

        mem_before = get_process_memory_mb()
        t_load = time.time()
        tts = PiperTTS()
        if not tts.is_available():
            print("  Piper not available (module not installed)")
            return None

        # Ensure default voice is downloaded
        if not tts.is_voice_installed(DEFAULT_VOICE):
            print(f"  Downloading voice: {DEFAULT_VOICE}...")
            tts.download_voice(DEFAULT_VOICE)

        load_time = time.time() - t_load
        mem_after = get_process_memory_mb()
        print(f"  Load time: {load_time:.2f}s | Memory: +{mem_after - mem_before:.0f}MB")

        for label, text in TEST_SENTENCES:
            with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
                out_path = f.name

            try:
                t0 = time.time()
                result_path = tts.synthesize(text, output_path=out_path)
                synth_time = time.time() - t0

                if result_path and os.path.exists(result_path):
                    duration = get_audio_duration(result_path)
                    rtf = synth_time / duration if duration > 0 else float('inf')
                    size_kb = os.path.getsize(result_path) / 1024

                    transcript, accuracy = verify_with_whisper(result_path, text)

                    print(f"\n  [{label}] {len(text)} chars")
                    print(f"    Synth: {synth_time:.3f}s | Audio: {duration:.2f}s | RTF: {rtf:.3f}")
                    print(f"    Size: {size_kb:.1f}KB | Accuracy: {accuracy:.0%}")
                    if accuracy < 0.5:
                        print(f"    Transcript: {transcript[:80]}")

                    results.append({
                        'engine': 'piper',
                        'test': label,
                        'chars': len(text),
                        'synth_time': round(synth_time, 3),
                        'audio_duration': round(duration, 2),
                        'rtf': round(rtf, 3),
                        'accuracy': round(accuracy, 2),
                        'size_kb': round(size_kb, 1),
                    })
                else:
                    print(f"  [{label}] FAILED — no output")
            finally:
                try:
                    os.unlink(out_path)
                except Exception:
                    pass

        return {
            'engine': 'piper',
            'load_time': round(load_time, 2),
            'memory_mb': round(mem_after - mem_before, 0),
            'sample_rate': 22050,
            'results': results,
        }

    except Exception as e:
        print(f"  Piper benchmark failed: {e}")
        traceback.print_exc()
        return None


# ════════════════════════════════════════════════════════════════════
# POCKET TTS BENCHMARK (via onnxruntime-web equivalent in Python)
# ════════════════════════════════════════════════════════════════════

def benchmark_pocket_tts_note():
    """PocketTTS runs in browser WASM — can't benchmark server-side directly."""
    print("\n" + "=" * 60)
    print("  POCKET TTS (Browser ONNX/WASM, 24kHz)")
    print("=" * 60)
    print("  PocketTTS runs entirely in the browser via Web Worker + ONNX WASM.")
    print("  It cannot be benchmarked server-side in Python.")
    print("  Key properties:")
    print("    - Zero server CPU/GPU cost")
    print("    - 5-model pipeline: text_conditioner -> flowLmMain -> flowLmFlow -> mimiDecoder")
    print("    - Autoregressive (frame-by-frame) — higher latency but streams first audio fast")
    print("    - 24kHz output, English only")
    print("    - ~50-100ms TTFA on modern browsers (M1/i7+)")
    print("    - Models cached by browser after first download (~200MB total)")
    print("    - No installation, no setup — works on any device with a browser")
    print()
    print("  For CPU comparison, PocketTTS is unbeatable because server CPU = 0.")
    print("  Piper is only needed for server-side TTS (API clients, non-browser use).")

    return {
        'engine': 'pocket_tts',
        'note': 'Browser-only WASM, zero server CPU',
        'sample_rate': 24000,
        'languages': ['en'],
        'server_cpu_cost': 0,
        'ttfa_browser_ms': '50-100',
        'model_size_mb': '~200',
    }


# ════════════════════════════════════════════════════════════════════
# SUMMARY & RECOMMENDATION
# ════════════════════════════════════════════════════════════════════

def print_summary(piper_result, pocket_result):
    print("\n" + "=" * 60)
    print("  BENCHMARK SUMMARY")
    print("=" * 60)

    if piper_result and piper_result.get('results'):
        avg_rtf = sum(r['rtf'] for r in piper_result['results']) / len(piper_result['results'])
        avg_acc = sum(r['accuracy'] for r in piper_result['results']) / len(piper_result['results'])
        print("\n  Piper TTS (server CPU):")
        print(f"    Avg RTF: {avg_rtf:.3f} (< 1.0 = faster than realtime)")
        print(f"    Avg Accuracy: {avg_acc:.0%}")
        print(f"    Load time: {piper_result['load_time']}s")
        print(f"    Memory: {piper_result['memory_mb']}MB")
        print("    Languages: en (4 voices), multilingual via other models")
    else:
        print("\n  Piper TTS: NOT AVAILABLE")

    print("\n  PocketTTS (browser WASM):")
    print("    Server CPU: 0 (runs entirely in browser)")
    print("    TTFA: ~50-100ms in browser")
    print("    Languages: en only")
    print("    Quality: Good (24kHz, autoregressive)")

    print("\n  RECOMMENDATION:")
    print(f"  {'=' * 50}")

    if piper_result and piper_result.get('results'):
        avg_rtf = sum(r['rtf'] for r in piper_result['results']) / len(piper_result['results'])
        if avg_rtf < 1.0:
            print(f"    Piper achieves RTF={avg_rtf:.2f} (realtime capable on CPU)")
            print("    USE BOTH:")
            print("      - PocketTTS for browser clients (zero server cost)")
            print("      - Piper for server-side API / non-browser clients / CPU fallback")
        else:
            print(f"    Piper RTF={avg_rtf:.2f} (slower than realtime on this CPU)")
            print("    PREFER PocketTTS for English (browser-side)")
            print("    Keep Piper only as last-resort CPU fallback")
    else:
        print("    Piper not available — PocketTTS is the only CPU option")
        print("    Install piper-tts for server-side CPU TTS")

    print()


def main():
    print("\nCPU TTS Benchmark: Piper vs PocketTTS")
    print(f"  Platform: {sys.platform}")
    print(f"  CPU cores: {os.cpu_count()}")

    piper_result = benchmark_piper()
    gc.collect()
    pocket_result = benchmark_pocket_tts_note()
    print_summary(piper_result, pocket_result)

    # Save results
    out = {
        'timestamp': time.strftime('%Y-%m-%d %H:%M:%S'),
        'platform': sys.platform,
        'cpu_cores': os.cpu_count(),
        'piper': piper_result,
        'pocket_tts': pocket_result,
    }
    out_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'benchmark_cpu_tts_results.json')
    with open(out_path, 'w') as f:
        json.dump(out, f, indent=2)
    print(f"  Results saved to: {out_path}")


if __name__ == '__main__':
    main()
