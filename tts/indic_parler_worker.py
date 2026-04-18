"""
tts/indic_parler_worker.py - Subprocess entrypoint for Indic Parler TTS.

Runs INSIDE the ``~/Documents/Nunba/data/venvs/indic_parler/`` venv,
so it can ``import parler_tts`` + ``import transformers`` at their
pinned 4.46.1 version without colliding with the main Nunba
interpreter's transformers 5.1.0.

Invocation pattern — parent side (Nunba main interp):

    from tts.backend_venv import invoke_in_venv
    rc, out, err = invoke_in_venv(
        'indic_parler',
        'tts.indic_parler_worker',
        ['--payload', payload_json_str],
        timeout=180,
    )

(or the worker can read a JSON payload on stdin if CLI args are too
long for the platform's command-line limit.)

Output contract:
    On success, worker writes a single JSON line to stdout of shape
        {"ok": true, "audio_base64": "...", "sample_rate": 44100,
         "duration_s": 1.23, "language": "ta", "voice": "Jaya (ta)"}

    On failure:
        {"ok": false, "error": "<stringified exception>"}

The worker is intentionally stateless — one synth per process. A
future optimization can add a long-lived STDIN request loop to avoid
model reload costs, but that's out-of-scope for the initial venv
migration.

HARTOS parity: this worker mirrors the contract of HARTOS's
integrations/service_tools/indic_parler_tool._synthesize() so that a
future refactor can unify them once HARTOS also has an install-side
venv hook. Voice/speaker map + style description are copied from
HARTOS's tool (DRY is impossible across the venv boundary because
HARTOS packages can't be imported in the Nunba-only venv — the two
modules share a spec, not a call graph).
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import tempfile
import traceback
from typing import Any

# Speaker map mirrors HARTOS indic_parler_tool._SPEAKERS — kept in sync
# manually because this worker runs inside a venv where HARTOS can't be
# imported. A drift-guard test (J67 cohort) can AST-compare the two.
_SPEAKERS = {
    'ta': 'Jaya',  'hi': 'Divya',   'bn': 'Aditi',   'te': 'Lalitha',
    'kn': 'Anu',   'ml': 'Anjali',  'gu': 'Neha',    'mr': 'Sunita',
    'as': 'Sita',  'ur': 'Divya',   'ne': 'Amrita',  'or': 'Debjani',
    'sa': 'Aryan', 'mai': 'Aditi',  'mni': 'Laishram', 'sd': 'Divya',
    'kok': 'Sunita', 'brx': 'Maya', 'doi': 'Karan',  'sat': 'Maya',
    'pa': 'Divya', 'en': 'Divya',
}


def _build_description(language: str) -> str:
    speaker = _SPEAKERS.get(language, 'Divya')
    return (
        f"{speaker} speaks with a confident, clear and expressive voice "
        f"at a moderate pace. The recording is of very high quality with no "
        f"background noise, the speaker's voice is loud, clear and very "
        f"close to the microphone."
    )


def _synthesize(payload: dict[str, Any]) -> dict[str, Any]:
    """Run one parler_tts synthesis. Imports happen inside this fn so
    that --help / --version-probe don't pay the model-load startup cost."""
    text = (payload.get('text') or '').strip()
    if not text:
        raise ValueError("payload.text is required and must be non-empty")

    language = (payload.get('language') or 'hi').lower().split('-')[0]
    voice_desc = payload.get('voice_description')
    if not voice_desc:
        voice_desc = _build_description(language)

    # Lazy imports — module load happens only on real synth requests.
    import soundfile as sf
    import torch
    from parler_tts import ParlerTTSForConditionalGeneration
    from transformers import AutoTokenizer

    device = 'cuda' if torch.cuda.is_available() else 'cpu'
    model_id = 'ai4bharat/indic-parler-tts'

    model = ParlerTTSForConditionalGeneration.from_pretrained(model_id).to(device)
    prompt_tok = AutoTokenizer.from_pretrained(model_id)
    desc_tok = AutoTokenizer.from_pretrained(model.config.text_encoder._name_or_path)

    prompt_ids = prompt_tok(text, return_tensors='pt').input_ids.to(device)
    desc_ids = desc_tok(voice_desc, return_tensors='pt').input_ids.to(device)

    with torch.no_grad():
        audio = model.generate(
            input_ids=desc_ids,
            prompt_input_ids=prompt_ids,
        ).cpu().numpy().squeeze()

    sr = int(model.config.sampling_rate)

    # Write to a temp WAV then return base64 — easier than hand-rolling
    # a WAV header over stdout. tempfile.gettempdir() survives the
    # subprocess lifetime (we unlink after read).
    tmp = tempfile.NamedTemporaryFile(
        suffix='.wav', delete=False, dir=tempfile.gettempdir(),
    )
    tmp.close()
    try:
        sf.write(tmp.name, audio, sr)
        with open(tmp.name, 'rb') as f:
            data = f.read()
    finally:
        try:
            os.unlink(tmp.name)
        except Exception:
            pass

    duration_s = round(len(audio) / sr, 3) if len(audio) else 0.0
    speaker = _SPEAKERS.get(language, 'Divya')
    return {
        'ok': True,
        'audio_base64': base64.b64encode(data).decode('ascii'),
        'sample_rate': sr,
        'duration_s': duration_s,
        'language': language,
        'voice': f"{speaker} ({language})",
        'engine': 'indic-parler-tts',
        'device': device,
    }


def _parse_args(argv: list[str]) -> dict[str, Any]:
    ap = argparse.ArgumentParser(
        prog='indic_parler_worker',
        description='Indic Parler TTS subprocess worker (runs inside venv).',
    )
    ap.add_argument('--payload', type=str, default=None,
                    help='JSON payload. If omitted, reads one JSON line from stdin.')
    ap.add_argument('--version-probe', action='store_true',
                    help='Report worker module version + exit (no synth).')
    ns = ap.parse_args(argv)
    if ns.version_probe:
        return {'__probe__': True}
    if ns.payload is not None:
        return json.loads(ns.payload)
    # Read one JSON line from stdin
    raw = sys.stdin.read()
    if not raw.strip():
        raise SystemExit("no --payload arg and empty stdin — refusing to synth")
    return json.loads(raw)


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    try:
        payload = _parse_args(argv)
        if payload.get('__probe__'):
            print(json.dumps({
                'ok': True, 'module': 'tts.indic_parler_worker', 'worker_version': 1,
            }))
            return 0
        result = _synthesize(payload)
    except Exception as e:
        err = {
            'ok': False,
            'error': f"{type(e).__name__}: {e}",
            'traceback': traceback.format_exc()[-2000:],
        }
        print(json.dumps(err))
        return 1
    print(json.dumps(result))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
