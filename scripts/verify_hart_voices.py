"""HART voice verification: transcribe .ogg files with faster-whisper,
build interactive HTML report, and optionally serve a local Whisper API
for live retranscription from the browser.

Usage:
  python scripts/verify_hart_voices.py                    # full verify + HTML
  python scripts/verify_hart_voices.py --skip-verify      # rebuild HTML from existing JSON
  python scripts/verify_hart_voices.py --serve             # start local Whisper API server
  python scripts/verify_hart_voices.py --serve --model large-v3-turbo --port 8765
"""
import json
import os
import re
import sys
import time

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
VOICES_DIR = os.path.join(BASE_DIR, 'landing-page', 'public', 'hart-voices')
RESULTS_PATH = os.path.join(BASE_DIR, 'hart_verification_results.json')

LINE_IDS = [
    'greeting', 'question_passion', 'question_escape', 'ack_escape',
    'pre_reveal', 'reveal_intro', 'post_reveal',
    'ack_music_art', 'ack_reading_learning', 'ack_building_coding',
    'ack_people_stories', 'ack_nature_movement', 'ack_games_strategy',
]

AVAILABLE_MODELS = ['base', 'small', 'medium', 'large-v3-turbo']

# ── helpers ──

try:
    from unidecode import unidecode as _unidecode
    def romanize(text):
        return re.sub(r'[^a-z0-9]', '', _unidecode(text).lower().strip())
    def translit(text):
        t = _unidecode(text)
        return t if t.lower().strip() != text.lower().strip() else ''
except ImportError:
    def romanize(text):
        return re.sub(r'[^a-z0-9]', '', text.lower().strip())
    def translit(text):
        return ''


def classify(sim, end_clipped):
    """Return (flag_str, flag_class) from similarity percentage."""
    if sim < 30:
        flag = f'BROKEN({sim:.0f}%)'
    elif sim < 50:
        flag = f'BAD({sim:.0f}%)'
    elif sim < 70:
        flag = f'WEAK({sim:.0f}%)'
    else:
        flag = ''
    if end_clipped:
        flag = (flag + '+CLIP') if flag else 'END_CLIP'
    return flag


def detect_end_clip(expected, got_r):
    """Check if the last 2 romanized words of expected are missing from got."""
    try:
        from unidecode import unidecode as ud
        exp_words = re.sub(r'[^a-z0-9 ]', '', ud(expected).lower()).split()
    except ImportError:
        exp_words = re.sub(r'[^a-z0-9 ]', '', expected.lower()).split()
    if len(exp_words) >= 3 and got_r:
        last2 = exp_words[-2:]
        found = sum(1 for w in last2 if len(w) >= 3 and w in got_r)
        return found == 0
    return False


def compute_analysis(expected, transcript, detected_lang):
    """Full analysis: romanize, similarity, clipping, classification."""
    from difflib import SequenceMatcher
    exp_r = romanize(expected)
    got_r = romanize(transcript)
    if exp_r and got_r:
        sim = SequenceMatcher(None, exp_r, got_r).ratio() * 100
    else:
        sim = 0
    end_clipped = detect_end_clip(expected, got_r)
    flag = classify(sim, end_clipped)
    return {
        'text': transcript,
        'detected_lang': detected_lang,
        'expected_romanized': translit(expected),
        'actual_romanized': translit(transcript),
        'similarity': round(sim, 1),
        'end_clipped': end_clipped,
        'flag': flag or 'OK',
    }


# ── LINES dict loader ──

GENERATE_SCRIPT = os.path.join(BASE_DIR, 'scripts', 'generate_hart_voices.py')


def load_lines_dict():
    with open(GENERATE_SCRIPT, encoding='utf-8') as f:
        content = f.read()
    lines_start = content.index('LINES = {')
    brace_count = 0
    for idx in range(lines_start + len('LINES = '), len(content)):
        if content[idx] == '{':
            brace_count += 1
        elif content[idx] == '}':
            brace_count -= 1
            if brace_count == 0:
                lines_end = idx + 1
                break
    ns = {}
    exec('LINES = ' + content[lines_start + len('LINES = '):lines_end], ns)
    return ns['LINES']


def update_lines_text(line_id, lang, new_text):
    """Update a specific text entry in generate_hart_voices.py LINES dict.

    Finds the line matching '<lang>': "..." within the '<line_id>': { } block
    and replaces the text value. Returns True if updated, False if not found.
    """
    with open(GENERATE_SCRIPT, encoding='utf-8') as f:
        content = f.read()

    # Find the line_id block: e.g. 'greeting': {
    block_pattern = re.compile(
        r"'" + re.escape(line_id) + r"'\s*:\s*\{",
    )
    block_match = block_pattern.search(content)
    if not block_match:
        return False

    block_start = block_match.end()

    # Find the closing brace of this block (track nesting)
    depth = 1
    block_end = block_start
    for i in range(block_start, len(content)):
        if content[i] == '{':
            depth += 1
        elif content[i] == '}':
            depth -= 1
            if depth == 0:
                block_end = i
                break

    block_text = content[block_start:block_end]

    # Find the lang entry within this block: '<lang>': "..." or '<lang>': '...'
    # Match the full quoted string value (handles escaped quotes)
    lang_pattern = re.compile(
        r"('" + re.escape(lang) + r"'\s*:\s*)" + r'("(?:[^"\\]|\\.)*"|' + r"'(?:[^'\\]|\\.)*')" + r"(\s*,?)",
    )
    lang_match = lang_pattern.search(block_text)
    if not lang_match:
        return False

    # Build replacement — use double quotes, escape any double quotes in new_text
    escaped = new_text.replace('\\', '\\\\').replace('"', '\\"')
    new_entry = lang_match.group(1) + '"' + escaped + '"' + lang_match.group(3)

    new_block = block_text[:lang_match.start()] + new_entry + block_text[lang_match.end():]
    new_content = content[:block_start] + new_block + content[block_end:]

    with open(GENERATE_SCRIPT, 'w', encoding='utf-8') as f:
        f.write(new_content)
    return True


# ── batch verify ──

def verify_all(target_langs=None, model_name='base'):
    from faster_whisper import WhisperModel
    print(f"Loading Whisper model ({model_name}, CPU)...")
    model = WhisperModel(model_name, device='cpu', compute_type='int8')
    results = {}
    langs = target_langs or sorted(
        d for d in os.listdir(VOICES_DIR)
        if os.path.isdir(os.path.join(VOICES_DIR, d)) and len(d) == 2
    )
    total = 0
    for lang in langs:
        lang_dir = os.path.join(VOICES_DIR, lang)
        if not os.path.isdir(lang_dir):
            continue
        results[lang] = {}
        for ogg_file in sorted(f for f in os.listdir(lang_dir) if f.endswith('.ogg')):
            line_id = ogg_file.replace('.ogg', '')
            try:
                t0 = time.time()
                segments, info = model.transcribe(os.path.join(lang_dir, ogg_file))
                transcript = ' '.join(seg.text.strip() for seg in segments).strip()
                elapsed = time.time() - t0
                results[lang][line_id] = {'text': transcript, 'detected_lang': info.language}
                total += 1
                try:
                    print(f"  [{total}] {lang}/{line_id} ({elapsed:.1f}s) det={info.language} | {transcript[:60]}...")
                except (UnicodeEncodeError, OSError):
                    print(f"  [{total}] {lang}/{line_id} ({elapsed:.1f}s) det={info.language} | (non-printable)")
            except Exception as e:
                results[lang][line_id] = {'text': f'(error: {e})', 'detected_lang': '??'}
                try:
                    print(f"  ERR {lang}/{line_id}: {e}")
                except (UnicodeEncodeError, OSError):
                    print(f"  ERR {lang}/{line_id}: (encoding error)")
    return results


# ── local Whisper API server ──

def run_server(port=8765, model_name='large-v3-turbo'):
    """Start a local HTTP server that serves Whisper transcription on demand."""
    from http.server import BaseHTTPRequestHandler, HTTPServer
    from urllib.parse import parse_qs, urlparse

    from faster_whisper import WhisperModel

    lines_dict = load_lines_dict()
    print(f"Loading Whisper model ({model_name})...")
    state = {
        'model': WhisperModel(model_name, device='cpu', compute_type='int8'),
        'model_name': model_name,
    }
    print(f"Whisper {model_name} loaded. Server at http://localhost:{port}")

    # Load existing results JSON for persistence
    if os.path.isfile(RESULTS_PATH):
        with open(RESULTS_PATH, encoding='utf-8') as f:
            state['results'] = json.load(f)
        print(f"Loaded existing results: {RESULTS_PATH}")
    else:
        state['results'] = {}

    import shutil
    import subprocess
    import threading
    results_lock = threading.Lock()

    def _save_results():
        """Write results JSON to disk (call under results_lock)."""
        with open(RESULTS_PATH, 'w', encoding='utf-8') as f:
            json.dump(state['results'], f, ensure_ascii=False, indent=2)

    def _rebuild_html():
        """Rebuild hart_verification.html from current results."""
        build_html(state['results'], lines_dict)
        print("  HTML rebuilt from updated results")

    class Handler(BaseHTTPRequestHandler):
        def _cors(self):
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
            self.send_header('Access-Control-Allow-Headers', '*')

        def do_OPTIONS(self):
            self.send_response(200)
            self._cors()
            self.end_headers()

        def _json(self, code, data):
            body = json.dumps(data, ensure_ascii=False).encode('utf-8')
            self.send_response(code)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self._cors()
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            parsed = urlparse(self.path)
            qs = parse_qs(parsed.query)

            if parsed.path == '/status':
                self._json(200, {
                    'ok': True,
                    'model': state['model_name'],
                    'available_models': AVAILABLE_MODELS,
                })
                return

            if parsed.path == '/transcribe':
                lang = qs.get('lang', [None])[0]
                line = qs.get('line', [None])[0]
                if not lang or not line:
                    self._json(400, {'error': 'need ?lang=xx&line=yy'})
                    return

                ogg_path = os.path.join(VOICES_DIR, lang, f'{line}.ogg')
                if not os.path.isfile(ogg_path):
                    self._json(404, {'error': f'{lang}/{line}.ogg not found'})
                    return

                expected = lines_dict.get(line, {}).get(lang, '')
                if not expected:
                    self._json(404, {'error': f'no expected text for {lang}/{line}'})
                    return

                try:
                    t0 = time.time()
                    segments, info = state['model'].transcribe(ogg_path)
                    transcript = ' '.join(seg.text.strip() for seg in segments).strip()
                    elapsed = time.time() - t0

                    analysis = compute_analysis(expected, transcript, info.language)
                    analysis['elapsed'] = round(elapsed, 1)
                    analysis['model'] = state['model_name']
                    print(f"  {lang}/{line} ({elapsed:.1f}s) sim={analysis['similarity']}% det={info.language}")

                    # Auto-save to results JSON
                    with results_lock:
                        if lang not in state['results']:
                            state['results'][lang] = {}
                        state['results'][lang][line] = {
                            'text': transcript,
                            'detected_lang': info.language,
                        }
                        _save_results()

                    self._json(200, analysis)
                except Exception as e:
                    self._json(500, {'error': str(e)})
                return

            if parsed.path == '/switch-model':
                new_model = qs.get('model', [None])[0]
                if not new_model or new_model not in AVAILABLE_MODELS:
                    self._json(400, {'error': f'model must be one of {AVAILABLE_MODELS}'})
                    return
                if new_model == state['model_name']:
                    self._json(200, {'ok': True, 'model': new_model, 'msg': 'already loaded'})
                    return
                try:
                    print(f"  Switching to Whisper {new_model}...")
                    state['model'] = WhisperModel(new_model, device='cpu', compute_type='int8')
                    state['model_name'] = new_model
                    print(f"  Loaded {new_model}")
                    self._json(200, {'ok': True, 'model': new_model})
                except Exception as e:
                    self._json(500, {'error': str(e)})
                return

            if parsed.path == '/rebuild-html':
                try:
                    _rebuild_html()
                    self._json(200, {'ok': True, 'msg': 'HTML rebuilt'})
                except Exception as e:
                    self._json(500, {'error': str(e)})
                return

            self._json(404, {'error': 'unknown endpoint'})

        def do_POST(self):
            parsed = urlparse(self.path)

            if parsed.path == '/regenerate':
                # Read JSON body: {lang, line, text (optional new text)}
                content_len = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_len).decode('utf-8') if content_len else '{}'
                try:
                    payload = json.loads(body)
                except Exception:
                    self._json(400, {'error': 'invalid JSON body'})
                    return

                lang = payload.get('lang')
                line = payload.get('line')
                new_text = payload.get('text', '').strip()
                if not lang or not line:
                    self._json(400, {'error': 'need {lang, line} in body'})
                    return

                current_text = lines_dict.get(line, {}).get(lang, '')
                text_updated = False

                # Update source text if changed
                if new_text and new_text != current_text:
                    print(f"  Updating text: {lang}/{line}")
                    print(f"    OLD: {current_text[:80]}...")
                    print(f"    NEW: {new_text[:80]}...")
                    ok = update_lines_text(line, lang, new_text)
                    if not ok:
                        self._json(500, {'error': f'Failed to update text in source for {lang}/{line}'})
                        return
                    # Update in-memory dict too
                    if line not in lines_dict:
                        lines_dict[line] = {}
                    lines_dict[line][lang] = new_text
                    text_updated = True
                    current_text = new_text

                # Backup original before generation overwrites it
                ogg_path = os.path.join(VOICES_DIR, lang, f'{line}.ogg')
                backup_path = os.path.join(VOICES_DIR, lang, f'{line}.backup.ogg')
                if os.path.isfile(ogg_path):
                    shutil.copy2(ogg_path, backup_path)

                # Run generation as subprocess
                print(f"  Regenerating audio: {lang}/{line}...")
                try:
                    gen_cmd = [
                        sys.executable, GENERATE_SCRIPT,
                        '--lang', lang, '--line', line,
                    ]
                    gen_result = subprocess.run(
                        gen_cmd, capture_output=True, text=True,
                        timeout=300, encoding='utf-8', errors='replace',
                        cwd=BASE_DIR,
                    )
                    gen_output = gen_result.stdout + gen_result.stderr
                    print(f"  Generation exit code: {gen_result.returncode}")
                    if gen_result.returncode != 0:
                        self._json(500, {
                            'error': f'Generation failed (exit {gen_result.returncode})',
                            'output': gen_output[-500:],
                            'text_updated': text_updated,
                        })
                        return
                except subprocess.TimeoutExpired:
                    self._json(500, {'error': 'Generation timed out (5min)', 'text_updated': text_updated})
                    return
                except Exception as e:
                    self._json(500, {'error': f'Generation error: {e}', 'text_updated': text_updated})
                    return

                # Stage: backup original, move generated to preview, restore original
                ogg_path = os.path.join(VOICES_DIR, lang, f'{line}.ogg')
                preview_path = os.path.join(VOICES_DIR, lang, f'{line}.preview.ogg')
                backup_path = os.path.join(VOICES_DIR, lang, f'{line}.backup.ogg')

                if not os.path.isfile(ogg_path):
                    self._json(500, {
                        'error': f'Generated .ogg not found at {ogg_path}',
                        'text_updated': text_updated,
                        'gen_output': gen_output[-300:],
                    })
                    return

                # Move new generation to preview, restore backup as current
                if os.path.isfile(backup_path):
                    # We had a backup from before generation
                    shutil.move(ogg_path, preview_path)
                    shutil.move(backup_path, ogg_path)
                else:
                    # Generated file IS the only one (first gen or backup failed)
                    shutil.copy2(ogg_path, preview_path)

                # Re-transcribe the preview .ogg with Whisper
                try:
                    t0 = time.time()
                    segments, info = state['model'].transcribe(preview_path)
                    transcript = ' '.join(seg.text.strip() for seg in segments).strip()
                    elapsed = time.time() - t0

                    analysis = compute_analysis(current_text, transcript, info.language)
                    analysis['elapsed'] = round(elapsed, 1)
                    analysis['model'] = state['model_name']
                    analysis['text_updated'] = text_updated
                    analysis['expected_text'] = current_text
                    analysis['preview_path'] = f'landing-page/public/hart-voices/{lang}/{line}.preview.ogg'
                    analysis['staged'] = True
                    print(f"  Preview ready: {lang}/{line} sim={analysis['similarity']}% det={info.language}")

                    self._json(200, analysis)
                except Exception as e:
                    self._json(500, {'error': f'Whisper verification failed: {e}', 'text_updated': text_updated})
                return

            if parsed.path == '/approve':
                # Approve: move preview → real, update results JSON
                content_len = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_len).decode('utf-8') if content_len else '{}'
                try:
                    payload = json.loads(body)
                except Exception:
                    self._json(400, {'error': 'invalid JSON body'})
                    return

                lang = payload.get('lang')
                line = payload.get('line')
                if not lang or not line:
                    self._json(400, {'error': 'need {lang, line}'})
                    return

                preview_path = os.path.join(VOICES_DIR, lang, f'{line}.preview.ogg')
                ogg_path = os.path.join(VOICES_DIR, lang, f'{line}.ogg')

                if not os.path.isfile(preview_path):
                    self._json(404, {'error': f'No preview file for {lang}/{line}'})
                    return

                shutil.move(preview_path, ogg_path)
                print(f"  Approved: {lang}/{line} — preview → live")

                # Re-transcribe approved file and save to results
                try:
                    segments, info = state['model'].transcribe(ogg_path)
                    transcript = ' '.join(seg.text.strip() for seg in segments).strip()
                    expected = lines_dict.get(line, {}).get(lang, '')
                    analysis = compute_analysis(expected, transcript, info.language)

                    with results_lock:
                        if lang not in state['results']:
                            state['results'][lang] = {}
                        state['results'][lang][line] = {
                            'text': transcript,
                            'detected_lang': info.language,
                        }
                        _save_results()

                    analysis['approved'] = True
                    self._json(200, analysis)
                except Exception as e:
                    self._json(200, {'approved': True, 'error': f'Transcription after approve failed: {e}'})
                return

            if parsed.path == '/reject':
                # Reject: delete preview file
                content_len = int(self.headers.get('Content-Length', 0))
                body = self.rfile.read(content_len).decode('utf-8') if content_len else '{}'
                try:
                    payload = json.loads(body)
                except Exception:
                    self._json(400, {'error': 'invalid JSON body'})
                    return

                lang = payload.get('lang')
                line = payload.get('line')
                if not lang or not line:
                    self._json(400, {'error': 'need {lang, line}'})
                    return

                preview_path = os.path.join(VOICES_DIR, lang, f'{line}.preview.ogg')
                if os.path.isfile(preview_path):
                    os.remove(preview_path)
                    print(f"  Rejected: {lang}/{line} — preview deleted")

                self._json(200, {'rejected': True})
                return

            self._json(404, {'error': 'unknown POST endpoint'})

        def log_message(self, fmt, *args):
            pass  # suppress default access logs

    server = HTTPServer(('127.0.0.1', port), Handler)
    print("\nEndpoints:")
    print("  GET  /status")
    print("  GET  /transcribe?lang=en&line=greeting   (auto-saves to results JSON)")
    print("  GET  /switch-model?model=large-v3-turbo")
    print("  GET  /rebuild-html                        (rebuild HTML from saved results)")
    print("  POST /regenerate  {lang, line, text}      (update text + regenerate audio + verify)")
    print("\nPress Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")


# ── HTML builder ──

def build_html(results, lines_dict):
    import html as html_mod
    from difflib import SequenceMatcher

    gen_langs = sorted(results.keys())
    rows = []

    for lang in gen_langs:
        for lid in LINE_IDS:
            expected = lines_dict.get(lid, {}).get(lang, '')
            if not expected:
                continue
            actual_data = results.get(lang, {}).get(lid, {})
            actual = actual_data.get('text', 'MISSING')
            detected = actual_data.get('detected_lang', '?')

            exp_t = translit(expected)
            act_t = translit(actual)
            exp_r = romanize(expected)
            got_r = romanize(actual) if actual != 'MISSING' else ''
            sim = SequenceMatcher(None, exp_r, got_r).ratio() * 100 if (exp_r and got_r) else 0
            end_clipped = detect_end_clip(expected, got_r)
            flag = classify(sim, end_clipped)

            rows.append((lang, lid, expected, exp_t, actual, act_t,
                         detected, flag, sim, end_clipped))

    langs_json = json.dumps(gen_langs)
    broken_count = sum(1 for r in rows if r[8] < 50)
    clip_count = sum(1 for r in rows if r[9])
    timestamp = time.strftime('%Y-%m-%d %H:%M')

    lang_names = {
        'en': 'English', 'ta': 'Tamil', 'hi': 'Hindi', 'bn': 'Bengali',
        'te': 'Telugu', 'kn': 'Kannada', 'ml': 'Malayalam', 'gu': 'Gujarati',
        'mr': 'Marathi', 'pa': 'Punjabi', 'ur': 'Urdu', 'ne': 'Nepali',
        'or': 'Odia', 'as': 'Assamese', 'sa': 'Sanskrit',
        'es': 'Spanish', 'fr': 'French', 'ja': 'Japanese', 'ko': 'Korean',
        'zh': 'Chinese', 'de': 'German', 'it': 'Italian', 'ru': 'Russian',
        'pt': 'Portuguese', 'ar': 'Arabic',
    }

    out_path = os.path.join(BASE_DIR, 'hart_verification.html')
    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>HART Voice Verification</title>
<style>
* {{ box-sizing: border-box; }}
body {{ font-family: 'Segoe UI', system-ui, sans-serif; background: #0f0e17; color: #e0e0e0; margin: 0; padding: 20px; }}
h1 {{ color: #6C63FF; text-align: center; margin-bottom: 5px; font-size: 28px; }}
.subtitle {{ text-align: center; color: #888; margin-bottom: 8px; font-size: 14px; }}
.timestamp {{ text-align: center; color: #555; margin-bottom: 12px; font-size: 12px; }}

/* Server bar */
.server-bar {{ display: flex; justify-content: center; align-items: center; gap: 12px; margin-bottom: 16px; padding: 10px; background: #1a1a2e; border-radius: 8px; flex-wrap: wrap; }}
.server-bar label {{ color: #888; font-size: 12px; }}
.server-dot {{ width: 10px; height: 10px; border-radius: 50%; background: #FF6B6B; display: inline-block; }}
.server-dot.connected {{ background: #4CAF50; }}
.server-bar select {{ background: #0f0e17; color: #6C63FF; border: 1px solid #333; padding: 4px 8px; border-radius: 4px; font-size: 12px; cursor: pointer; }}
.server-bar button {{ background: #6C63FF; color: #fff; border: none; padding: 5px 14px; border-radius: 5px; cursor: pointer; font-size: 12px; }}
.server-bar button:hover {{ background: #5a54e0; }}
.server-bar button:disabled {{ background: #333; color: #666; cursor: not-allowed; }}
.server-bar .status-text {{ color: #888; font-size: 11px; min-width: 120px; }}

/* Summary */
.summary-cards {{ display: flex; justify-content: center; gap: 15px; margin-bottom: 20px; flex-wrap: wrap; }}
.summary-card {{ background: #1a1a2e; border-radius: 10px; padding: 15px 25px; text-align: center; min-width: 120px; }}
.summary-card .number {{ font-size: 28px; font-weight: bold; }}
.summary-card .label {{ font-size: 11px; color: #888; margin-top: 4px; }}
.sc-total .number {{ color: #6C63FF; }}
.sc-ok .number {{ color: #4CAF50; }}
.sc-weak .number {{ color: #FF9800; }}
.sc-broken .number {{ color: #FF6B6B; }}
.sc-clip .number {{ color: #FF9800; }}
.sc-langs .number {{ color: #8BC34A; }}

/* Filters */
.filters {{ text-align: center; margin-bottom: 15px; flex-wrap: wrap; display: flex; justify-content: center; gap: 4px; }}
.filters button {{ background: #1a1a2e; color: #6C63FF; border: 1px solid #333; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.2s; }}
.filters button:hover, .filters button.active {{ background: #6C63FF; color: #fff; border-color: #6C63FF; }}
.filters button.bad-btn {{ border-color: #FF6B6B; color: #FF6B6B; }}
.filters button.bad-btn:hover, .filters button.bad-btn.active {{ background: #FF6B6B; color: #fff; }}
.filters button.clip-btn {{ border-color: #FF9800; color: #FF9800; }}
.filters button.clip-btn:hover, .filters button.clip-btn.active {{ background: #FF9800; color: #fff; }}
.filters button.weak-btn {{ border-color: #FF9800; color: #FF9800; }}
.filters button.weak-btn:hover, .filters button.weak-btn.active {{ background: #FF9800; color: #fff; }}

/* Table */
table {{ width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }}
th {{ background: #1a1a2e; color: #6C63FF; padding: 10px 6px; text-align: left; position: sticky; top: 0; z-index: 10; font-size: 12px; }}
td {{ padding: 7px 6px; border-bottom: 1px solid #1a1a2e; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }}
tr:hover {{ background: #1a1a2e; }}
col.c-act {{ width: 60px; }} col.c-lang {{ width: 40px; }} col.c-line {{ width: 120px; }}
col.c-text {{ width: 21%; }} col.c-tlit {{ width: 16%; }}
col.c-sim {{ width: 50px; }} col.c-det {{ width: 35px; }} col.c-flag {{ width: 90px; }}

.lang {{ font-weight: bold; color: #6C63FF; font-size: 14px; }}
.line-id {{ color: #888; font-size: 11px; }}
.expected {{ color: #4CAF50; }}
.actual {{ color: #FF9800; }}
.translit {{ color: #777; font-size: 11px; font-style: italic; }}
.detected {{ color: #888; font-size: 11px; text-align: center; }}
.flag {{ font-weight: bold; font-size: 11px; }}
.flag-bad {{ color: #FF6B6B; }}
.flag-clip {{ color: #FF9800; }}
.flag-ok {{ color: #4CAF50; }}
.sim {{ font-size: 12px; text-align: center; font-weight: bold; }}
.sim-good {{ color: #4CAF50; }}
.sim-ok {{ color: #8BC34A; }}
.sim-weak {{ color: #FF9800; }}
.sim-bad {{ color: #FF6B6B; }}
.row-bad {{ background: rgba(255,107,107,0.07) !important; }}
.row-clip {{ background: rgba(255,152,0,0.05) !important; }}
.row-updated {{ animation: flash-green 1s ease; }}
@keyframes flash-green {{ 0%,100% {{ background: transparent; }} 30% {{ background: rgba(76,175,80,0.15); }} }}
.stats {{ text-align: center; margin: 10px 0; color: #888; font-size: 13px; }}
.lang-header {{ background: #12111f !important; }}
.lang-header td {{ padding: 12px 6px 4px; font-size: 16px; font-weight: bold; color: #6C63FF; border-bottom: 2px solid #6C63FF; }}

/* Buttons */
.action-btns {{ display: flex; gap: 4px; }}
.play-btn, .retranscribe-btn {{ background: none; border: 1px solid #6C63FF; color: #6C63FF; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; padding: 0; }}
.play-btn:hover {{ background: #6C63FF; color: #fff; }}
.play-btn.playing {{ background: #FF6B6B; border-color: #FF6B6B; color: #fff; }}
.retranscribe-btn {{ border-color: #8BC34A; color: #8BC34A; font-size: 12px; }}
.retranscribe-btn:hover {{ background: #8BC34A; color: #fff; }}
.retranscribe-btn.loading {{ animation: spin 1s linear infinite; border-color: #FF9800; color: #FF9800; pointer-events: none; }}
@keyframes spin {{ 100% {{ transform: rotate(360deg); }} }}
.retranscribe-btn:disabled {{ opacity: 0.3; cursor: not-allowed; }}
.retranscribe-lang-btn {{ background: none; border: 1px solid #8BC34A; color: #8BC34A; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 10px; margin-left: 8px; }}
.retranscribe-lang-btn:hover {{ background: #8BC34A; color: #fff; }}

/* Inline editing */
.expected[contenteditable] {{ cursor: text; border: 1px solid transparent; border-radius: 3px; padding: 2px 4px; transition: all 0.2s; min-height: 20px; }}
.expected[contenteditable]:hover {{ border-color: #333; }}
.expected[contenteditable]:focus {{ border-color: #6C63FF; outline: none; background: rgba(108,99,255,0.08); }}
.expected.text-dirty {{ border-color: #FF9800 !important; background: rgba(255,152,0,0.06); }}

/* Regenerate button */
.regen-btn {{ background: none; border: 1px solid #FF9800; color: #FF9800; border-radius: 50%; width: 28px; height: 28px; cursor: pointer; font-size: 14px; display: flex; align-items: center; justify-content: center; transition: all 0.2s; padding: 0; }}
.regen-btn:hover {{ background: #FF9800; color: #fff; }}
.regen-btn.loading {{ animation: spin 1s linear infinite; border-color: #FF9800; color: #FF9800; pointer-events: none; }}
.regen-btn:disabled {{ opacity: 0.3; cursor: not-allowed; }}

/* Approve/Reject */
.approve-reject {{ display: flex; gap: 4px; margin-top: 4px; }}
.approve-btn {{ background: #4CAF50; color: #fff; border: none; border-radius: 4px; padding: 3px 10px; cursor: pointer; font-size: 11px; font-weight: bold; }}
.approve-btn:hover {{ background: #388E3C; }}
.reject-btn {{ background: #FF6B6B; color: #fff; border: none; border-radius: 4px; padding: 3px 10px; cursor: pointer; font-size: 11px; font-weight: bold; }}
.reject-btn:hover {{ background: #d32f2f; }}
.preview-play {{ background: none; border: 1px solid #FF9800; color: #FF9800; border-radius: 50%; width: 24px; height: 24px; cursor: pointer; font-size: 12px; display: inline-flex; align-items: center; justify-content: center; padding: 0; margin-right: 4px; }}
.preview-play:hover {{ background: #FF9800; color: #fff; }}
.preview-play.playing {{ background: #FF6B6B; border-color: #FF6B6B; color: #fff; }}
.regen-status {{ font-size: 10px; color: #888; margin-top: 2px; }}
</style>
</head><body>
<h1>HART Voice Verification Report</h1>
<div class="subtitle">"Secret Name" Framing — Guardian Angel Onboarding</div>
<div class="timestamp">Generated: {timestamp}</div>

<div class="server-bar" id="serverBar">
  <label>Whisper Server:</label>
  <span class="server-dot" id="serverDot"></span>
  <span class="status-text" id="serverStatus">Not connected</span>
  <label>Model:</label>
  <select id="modelSelect">
    <option value="base">base (142MB)</option>
    <option value="small">small (464MB)</option>
    <option value="medium">medium (1.5GB)</option>
    <option value="large-v3-turbo" selected>large-v3-turbo (1.6GB)</option>
  </select>
  <button id="switchModelBtn" onclick="switchModel()" disabled>Switch Model</button>
  <button id="rebuildHtmlBtn" onclick="rebuildHtml()" disabled style="background:#FF9800;">Rebuild HTML</button>
  <span id="saveIndicator" style="color:#4CAF50;font-size:11px;min-width:80px;"></span>
  <span style="color:#555;font-size:11px;">Run: <code>python scripts/verify_hart_voices.py --serve</code></span>
</div>

<div class="summary-cards" id="summaryCards">
  <div class="summary-card sc-total"><div class="number" id="sc-total">{len(rows)}</div><div class="label">Total Lines</div></div>
  <div class="summary-card sc-ok"><div class="number" id="sc-ok">{sum(1 for r in rows if r[8] >= 70 and not r[9])}</div><div class="label">Good (70%+)</div></div>
  <div class="summary-card sc-weak"><div class="number" id="sc-weak">{sum(1 for r in rows if 50 <= r[8] < 70)}</div><div class="label">Weak (50-70%)</div></div>
  <div class="summary-card sc-broken"><div class="number" id="sc-broken">{broken_count}</div><div class="label">Broken (&lt;50%)</div></div>
  <div class="summary-card sc-clip"><div class="number" id="sc-clip">{clip_count}</div><div class="label">End Clipped</div></div>
  <div class="summary-card sc-langs"><div class="number" id="sc-langs">{len(gen_langs)}</div><div class="label">Languages</div></div>
</div>
<div class="filters" id="filters"></div>
<div class="stats" id="stats"></div>
<table>
<colgroup>
<col class="c-act"><col class="c-lang"><col class="c-line">
<col class="c-text"><col class="c-tlit">
<col class="c-text"><col class="c-tlit">
<col class="c-sim"><col class="c-det"><col class="c-flag">
</colgroup>
<thead><tr>
<th></th><th>Lang</th><th>Line ID</th>
<th>Expected (source text)</th><th>Expected (romanized)</th>
<th>Whisper heard</th><th>Heard (romanized)</th>
<th>Sim%</th><th>Det</th><th>Status</th>
</tr></thead>
<tbody id="tbody">
''')

        prev_lang = None
        for lang, lid, expected, exp_t, actual, act_t, detected, flag, sim, clipped in rows:
            if lang != prev_lang:
                ln = lang_names.get(lang, lang.upper())
                lang_count = sum(1 for r in rows if r[0] == lang)
                lang_ok = sum(1 for r in rows if r[0] == lang and r[8] >= 70 and not r[9])
                f.write(
                    f'<tr class="lang-header" data-lang="{html_mod.escape(lang)}" data-flag="" data-clip="0">'
                    f'<td colspan="10">{html_mod.escape(lang.upper())} — {html_mod.escape(ln)}'
                    f' <span style="color:#888;font-size:12px;">({lang_ok}/{lang_count} good)</span>'
                    f'<button class="retranscribe-lang-btn" onclick="retranscribeLang(\'{html_mod.escape(lang)}\')"'
                    f' title="Re-transcribe all {html_mod.escape(lang.upper())} with Whisper">Re-transcribe {html_mod.escape(lang.upper())}</button>'
                    f'</td></tr>\n')
                prev_lang = lang

            row_class = 'row-bad' if sim < 50 else ('row-clip' if clipped else '')
            sim_class = 'sim-good' if sim >= 90 else 'sim-ok' if sim >= 70 else 'sim-weak' if sim >= 50 else 'sim-bad'
            flag_class = 'flag-bad' if ('BROKEN' in flag or 'BAD' in flag) else ('flag-clip' if 'CLIP' in flag else 'flag-ok')
            flag_text = flag if flag else 'OK'
            clip_data = '1' if clipped else '0'
            audio_path = f'landing-page/public/hart-voices/{lang}/{lid}.ogg'
            row_id = f'row-{lang}-{lid}'

            f.write(f'<tr class="{row_class}" id="{row_id}" data-lang="{html_mod.escape(lang)}" data-line="{html_mod.escape(lid)}" data-flag="{html_mod.escape(flag)}" data-clip="{clip_data}" data-sim="{sim:.1f}">')
            # Escape expected text for data attribute (double-quote safe)
            expected_attr = html_mod.escape(expected, quote=True)
            f.write('<td><div class="action-btns">')
            f.write(f'<button class="play-btn" onclick="playAudio(this, \'{html_mod.escape(audio_path)}\')">&#9654;</button>')
            f.write(f'<button class="retranscribe-btn" onclick="retranscribeRow(\'{html_mod.escape(lang)}\', \'{html_mod.escape(lid)}\', this)" title="Re-transcribe with Whisper">&#8635;</button>')
            f.write(f'<button class="regen-btn" onclick="regenerateRow(\'{html_mod.escape(lang)}\', \'{html_mod.escape(lid)}\', this)" title="Edit text &amp; regenerate audio">&#x1F504;</button>')
            f.write(f'</div><div id="regen-status-{lang}-{lid}" class="regen-status"></div></td>')
            f.write(f'<td class="lang">{html_mod.escape(lang)}</td>')
            f.write(f'<td class="line-id">{html_mod.escape(lid)}</td>')
            f.write(f'<td class="expected" contenteditable="true" data-original="{expected_attr}" '
                    f'oninput="markDirty(this)" spellcheck="false">{html_mod.escape(expected)}</td>')
            f.write(f'<td class="translit">{html_mod.escape(exp_t)}</td>')
            f.write(f'<td class="actual">{html_mod.escape(actual)}</td>')
            f.write(f'<td class="translit">{html_mod.escape(act_t)}</td>')
            f.write(f'<td class="sim {sim_class}">{sim:.0f}%</td>')
            f.write(f'<td class="detected">{html_mod.escape(detected)}</td>')
            f.write(f'<td class="flag {flag_class}">{html_mod.escape(flag_text)}</td>')
            f.write('</tr>\n')

        f.write(f'''</tbody></table>
<script>
const API = "http://localhost:8765";
const langs = {langs_json};
const filtersDiv = document.getElementById("filters");
const statsDiv = document.getElementById("stats");
let activeLang = null;
let activeFilter = null;
let serverConnected = false;

// ── Audio player ──
let currentAudio = null, currentBtn = null;
function playAudio(btn, path) {{
  if (currentAudio) {{
    currentAudio.pause(); currentAudio = null;
    if (currentBtn) currentBtn.classList.remove('playing');
    if (currentBtn === btn) {{ currentBtn = null; return; }}
  }}
  currentBtn = btn; btn.classList.add('playing');
  currentAudio = new Audio(path);
  currentAudio.play();
  currentAudio.onended = function() {{ btn.classList.remove('playing'); currentAudio = null; currentBtn = null; }};
  currentAudio.onerror = function() {{ btn.classList.remove('playing'); currentAudio = null; currentBtn = null; alert('Audio not found'); }};
}}

// ── Server connection ──
async function checkServer() {{
  try {{
    const r = await fetch(API + "/status");
    const d = await r.json();
    serverConnected = true;
    document.getElementById("serverDot").classList.add("connected");
    document.getElementById("serverStatus").textContent = "Connected (" + d.model + ")";
    document.getElementById("switchModelBtn").disabled = false;
    document.getElementById("modelSelect").value = d.model;
    document.querySelectorAll(".retranscribe-btn, .retranscribe-lang-btn").forEach(b => b.disabled = false);
    document.getElementById("rebuildHtmlBtn").disabled = false;
  }} catch(e) {{
    serverConnected = false;
    document.getElementById("serverDot").classList.remove("connected");
    document.getElementById("serverStatus").textContent = "Not connected";
    document.getElementById("switchModelBtn").disabled = true;
    document.querySelectorAll(".retranscribe-btn, .retranscribe-lang-btn").forEach(b => b.disabled = true);
    document.getElementById("rebuildHtmlBtn").disabled = true;
  }}
}}
checkServer();
setInterval(checkServer, 10000);

async function switchModel() {{
  const model = document.getElementById("modelSelect").value;
  document.getElementById("serverStatus").textContent = "Loading " + model + "...";
  document.getElementById("switchModelBtn").disabled = true;
  try {{
    const r = await fetch(API + "/switch-model?model=" + model);
    const d = await r.json();
    document.getElementById("serverStatus").textContent = "Connected (" + d.model + ")";
  }} catch(e) {{
    document.getElementById("serverStatus").textContent = "Switch failed: " + e.message;
  }}
  document.getElementById("switchModelBtn").disabled = false;
}}

// ── Inline text editing ──
function markDirty(cell) {{
  const original = cell.dataset.original || "";
  const current = cell.textContent.trim();
  if (current !== original) {{
    cell.classList.add("text-dirty");
  }} else {{
    cell.classList.remove("text-dirty");
  }}
}}

// ── Regenerate: edit text → generate audio → preview → approve/reject ──
async function regenerateRow(lang, line, btn) {{
  if (!serverConnected) {{ alert("Start the server first"); return; }}

  const row = document.getElementById("row-" + lang + "-" + line);
  if (!row) return;
  const cells = row.querySelectorAll("td");
  const expectedCell = cells[3]; // expected text cell
  const statusEl = document.getElementById("regen-status-" + lang + "-" + line);
  const newText = expectedCell.textContent.trim();

  btn.classList.add("loading");
  statusEl.textContent = "Generating audio...";
  statusEl.style.color = "#FF9800";

  try {{
    const r = await fetch(API + "/regenerate", {{
      method: "POST",
      headers: {{ "Content-Type": "application/json" }},
      body: JSON.stringify({{ lang: lang, line: line, text: newText }}),
    }});
    const d = await r.json();
    if (d.error) {{
      statusEl.textContent = "Error: " + d.error;
      statusEl.style.color = "#FF6B6B";
      return;
    }}

    // Update transcription cells with preview results
    cells[5].textContent = d.text;
    const sim = d.similarity;
    const simClass = sim >= 90 ? "sim-good" : sim >= 70 ? "sim-ok" : sim >= 50 ? "sim-weak" : "sim-bad";
    cells[7].textContent = sim.toFixed(0) + "%";
    cells[7].className = "sim " + simClass;
    cells[8].textContent = d.detected_lang;
    const flag = d.flag;
    const flagClass = (flag.includes("BROKEN") || flag.includes("BAD")) ? "flag-bad" : flag.includes("CLIP") ? "flag-clip" : "flag-ok";
    cells[9].textContent = flag;
    cells[9].className = "flag " + flagClass;

    // Update expected romanized too
    if (d.expected_romanized) cells[4].textContent = d.expected_romanized;

    // If text was updated, sync the data-original
    if (d.text_updated) {{
      expectedCell.dataset.original = newText;
      expectedCell.classList.remove("text-dirty");
    }}

    // Show preview controls
    const previewPath = d.preview_path || "";
    statusEl.innerHTML = '<button class="preview-play" onclick="playAudio(this, \\'' + previewPath + '\\')" title="Play preview">&#9654;</button>' +
      '<span style="color:#FF9800;font-size:11px;">Sim: ' + sim.toFixed(0) + '% — </span>' +
      '<button class="approve-btn" onclick="approveRegen(\\'' + lang + '\\', \\'' + line + '\\')">Approve</button> ' +
      '<button class="reject-btn" onclick="rejectRegen(\\'' + lang + '\\', \\'' + line + '\\')">Reject</button>';

  }} catch(e) {{
    statusEl.textContent = "Error: " + e.message;
    statusEl.style.color = "#FF6B6B";
  }} finally {{
    btn.classList.remove("loading");
  }}
}}

async function approveRegen(lang, line) {{
  const statusEl = document.getElementById("regen-status-" + lang + "-" + line);
  statusEl.innerHTML = '<span style="color:#FF9800;">Approving...</span>';
  try {{
    const r = await fetch(API + "/approve", {{
      method: "POST",
      headers: {{ "Content-Type": "application/json" }},
      body: JSON.stringify({{ lang: lang, line: line }}),
    }});
    const d = await r.json();
    if (d.approved) {{
      statusEl.innerHTML = '<span style="color:#4CAF50;">&#10003; Approved — live!</span>';
      // Update row with final analysis
      const row = document.getElementById("row-" + lang + "-" + line);
      if (row && d.similarity !== undefined) {{
        row.dataset.sim = d.similarity.toFixed(1);
        row.dataset.flag = (d.flag && d.flag !== "OK") ? d.flag : "";
        row.dataset.clip = d.end_clipped ? "1" : "0";
        row.className = d.similarity < 50 ? "row-bad row-updated" : d.end_clipped ? "row-clip row-updated" : "row-updated";
      }}
      recalcSummary();
      unsavedCount++;
      showSaveIndicator(unsavedCount + " saved to JSON");
      // Clear status after 3s
      setTimeout(() => {{ statusEl.innerHTML = ""; }}, 3000);
    }} else {{
      statusEl.innerHTML = '<span style="color:#FF6B6B;">Approve failed</span>';
    }}
  }} catch(e) {{
    statusEl.innerHTML = '<span style="color:#FF6B6B;">Error: ' + e.message + '</span>';
  }}
}}

async function rejectRegen(lang, line) {{
  const statusEl = document.getElementById("regen-status-" + lang + "-" + line);
  try {{
    await fetch(API + "/reject", {{
      method: "POST",
      headers: {{ "Content-Type": "application/json" }},
      body: JSON.stringify({{ lang: lang, line: line }}),
    }});
    statusEl.innerHTML = '<span style="color:#888;">Rejected — original kept</span>';
    setTimeout(() => {{ statusEl.innerHTML = ""; }}, 3000);
  }} catch(e) {{
    statusEl.innerHTML = '<span style="color:#FF6B6B;">Error: ' + e.message + '</span>';
  }}
}}

// ── Rebuild HTML on disk ──
let unsavedCount = 0;
async function rebuildHtml() {{
  if (!serverConnected) return;
  const btn = document.getElementById("rebuildHtmlBtn");
  btn.disabled = true; btn.textContent = "Rebuilding...";
  try {{
    const r = await fetch(API + "/rebuild-html");
    const d = await r.json();
    if (d.ok) {{
      unsavedCount = 0;
      showSaveIndicator("HTML file saved!");
      btn.textContent = "Rebuild HTML";
    }} else {{
      showSaveIndicator("Rebuild failed", true);
      btn.textContent = "Rebuild HTML";
    }}
  }} catch(e) {{
    showSaveIndicator("Rebuild failed: " + e.message, true);
    btn.textContent = "Rebuild HTML";
  }}
  btn.disabled = false;
}}

function showSaveIndicator(msg, isError) {{
  const el = document.getElementById("saveIndicator");
  el.textContent = msg;
  el.style.color = isError ? "#FF6B6B" : "#4CAF50";
  clearTimeout(el._timer);
  el._timer = setTimeout(() => {{ el.textContent = unsavedCount > 0 ? unsavedCount + " saved to JSON" : ""; }}, 3000);
}}

// ── Retranscribe single row ──
async function retranscribeRow(lang, line, btn) {{
  if (!serverConnected) {{ alert("Start the server first:\\npython scripts/verify_hart_voices.py --serve"); return; }}
  btn.classList.add("loading");
  try {{
    const r = await fetch(API + "/transcribe?lang=" + lang + "&line=" + line);
    const d = await r.json();
    if (d.error) {{ alert("Error: " + d.error); return; }}
    updateRow(lang, line, d);
    unsavedCount++;
    showSaveIndicator(unsavedCount + " saved to JSON");
  }} catch(e) {{
    alert("Server error: " + e.message);
  }} finally {{
    btn.classList.remove("loading");
  }}
}}

// ── Retranscribe all rows for a language ──
async function retranscribeLang(lang) {{
  if (!serverConnected) {{ alert("Start the server first:\\npython scripts/verify_hart_voices.py --serve"); return; }}
  const rows = document.querySelectorAll('#tbody tr[data-lang="' + lang + '"][data-line]');
  for (const row of rows) {{
    const line = row.dataset.line;
    const btn = row.querySelector(".retranscribe-btn");
    if (btn) await retranscribeRow(lang, line, btn);
  }}
}}

// ── Update row in place ──
function updateRow(lang, line, data) {{
  const row = document.getElementById("row-" + lang + "-" + line);
  if (!row) return;
  const cells = row.querySelectorAll("td");
  // cells: [actions, lang, line_id, expected, exp_translit, actual, act_translit, sim, det, flag]

  // Update actual text (cell 5)
  cells[5].textContent = data.text;
  cells[5].className = "actual";

  // Update actual romanized (cell 6)
  cells[6].textContent = data.actual_romanized || "";
  cells[6].className = "translit";

  // Update similarity (cell 7)
  const sim = data.similarity;
  const simClass = sim >= 90 ? "sim-good" : sim >= 70 ? "sim-ok" : sim >= 50 ? "sim-weak" : "sim-bad";
  cells[7].textContent = sim.toFixed(0) + "%";
  cells[7].className = "sim " + simClass;

  // Update detected lang (cell 8)
  cells[8].textContent = data.detected_lang;

  // Update flag (cell 9)
  const flag = data.flag;
  const flagClass = (flag.includes("BROKEN") || flag.includes("BAD")) ? "flag-bad" : flag.includes("CLIP") ? "flag-clip" : "flag-ok";
  cells[9].textContent = flag;
  cells[9].className = "flag " + flagClass;

  // Update row data attributes
  row.dataset.flag = flag === "OK" ? "" : flag;
  row.dataset.clip = data.end_clipped ? "1" : "0";
  row.dataset.sim = sim.toFixed(1);

  // Update row class
  row.className = sim < 50 ? "row-bad row-updated" : data.end_clipped ? "row-clip row-updated" : "row-updated";

  // Recalc summary
  recalcSummary();
  updateFilter();
}}

function recalcSummary() {{
  const rows = document.querySelectorAll('#tbody tr[data-line]');
  let total = 0, good = 0, weak = 0, broken = 0, clipped = 0;
  rows.forEach(r => {{
    total++;
    const sim = parseFloat(r.dataset.sim || 0);
    const isClip = r.dataset.clip === "1";
    if (sim >= 70 && !isClip) good++;
    else if (sim >= 50 && sim < 70) weak++;
    if (sim < 50) broken++;
    if (isClip) clipped++;
  }});
  document.getElementById("sc-total").textContent = total;
  document.getElementById("sc-ok").textContent = good;
  document.getElementById("sc-weak").textContent = weak;
  document.getElementById("sc-broken").textContent = broken;
  document.getElementById("sc-clip").textContent = clipped;
}}

// ── Filters ──
const allBtn = document.createElement("button");
allBtn.textContent = "ALL"; allBtn.className = "active";
allBtn.onclick = function() {{ activeLang = null; activeFilter = null; updateFilter(); }};
filtersDiv.appendChild(allBtn);

const badBtn = document.createElement("button");
badBtn.textContent = "BROKEN (<50%)"; badBtn.className = "bad-btn";
badBtn.onclick = function() {{ activeFilter = activeFilter === 'bad' ? null : 'bad'; updateFilter(); }};
filtersDiv.appendChild(badBtn);

const weakBtn = document.createElement("button");
weakBtn.textContent = "WEAK (50-70%)"; weakBtn.className = "weak-btn";
weakBtn.onclick = function() {{ activeFilter = activeFilter === 'weak' ? null : 'weak'; updateFilter(); }};
filtersDiv.appendChild(weakBtn);

const clipBtn = document.createElement("button");
clipBtn.textContent = "END CLIPPED"; clipBtn.className = "clip-btn";
clipBtn.onclick = function() {{ activeFilter = activeFilter === 'clip' ? null : 'clip'; updateFilter(); }};
filtersDiv.appendChild(clipBtn);

langs.forEach(function(l) {{
  var btn = document.createElement("button");
  btn.textContent = l.toUpperCase();
  btn.onclick = function() {{ activeLang = (activeLang === l) ? null : l; updateFilter(); }};
  filtersDiv.appendChild(btn);
}});

function updateFilter() {{
  var shown = 0, total = 0, problems = 0, clips = 0;
  var rows = document.querySelectorAll("#tbody tr");
  for (var i = 0; i < rows.length; i++) {{
    var row = rows[i]; total++;
    var lang = row.dataset.lang;
    var flag = row.dataset.flag || "";
    var isClip = row.dataset.clip === "1";
    if (flag.length > 0) problems++;
    if (isClip) clips++;
    var show = true;
    if (activeLang && lang !== activeLang) show = false;
    if (activeFilter === 'bad' && !flag.match(/BROKEN|BAD/)) show = false;
    if (activeFilter === 'weak' && !flag.match(/WEAK/)) show = false;
    if (activeFilter === 'clip' && !isClip) show = false;
    row.style.display = show ? "" : "none";
    if (show) shown++;
  }}
  statsDiv.textContent = "Showing " + shown + " / " + total + " (" + problems + " flagged, " + clips + " end-clipped)";
  var btns = document.querySelectorAll("#filters button");
  for (var j = 0; j < btns.length; j++) btns[j].className = btns[j].className.replace(/ active/g, "");
  if (!activeLang && !activeFilter) allBtn.className += " active";
  if (activeFilter === 'bad') badBtn.className += " active";
  if (activeFilter === 'weak') weakBtn.className += " active";
  if (activeFilter === 'clip') clipBtn.className += " active";
  if (activeLang) {{
    document.querySelectorAll("#filters button").forEach(function(b) {{
      if (b.textContent === activeLang.toUpperCase()) b.className += " active";
    }});
  }}
}}
updateFilter();
</script>
</body></html>''')

    print(f'\nHTML report: {out_path}')
    print(f'  {len(rows)} rows | {broken_count} broken | {clip_count} clipped | {len(gen_langs)} languages')
    return out_path


# ── CLI ──

def main():
    import argparse
    parser = argparse.ArgumentParser(description='HART voice verification + live Whisper server')
    parser.add_argument('--lang', nargs='+', help='Specific languages to verify')
    parser.add_argument('--skip-verify', action='store_true', help='Rebuild HTML from existing results JSON')
    parser.add_argument('--serve', action='store_true', help='Start local Whisper API server for live retranscription')
    parser.add_argument('--port', type=int, default=8765, help='Server port (default: 8765)')
    parser.add_argument('--model', type=str, default='large-v3-turbo',
                        choices=AVAILABLE_MODELS, help='Whisper model for --serve (default: large-v3-turbo)')
    args = parser.parse_args()

    if args.serve:
        run_server(port=args.port, model_name=args.model)
        return

    print("Loading LINES dict from generate_hart_voices.py...")
    lines_dict = load_lines_dict()
    print(f"  {len(lines_dict)} line types loaded")

    if args.skip_verify:
        if os.path.isfile(RESULTS_PATH):
            with open(RESULTS_PATH, encoding='utf-8') as f:
                results = json.load(f)
            print(f"Using existing results: {RESULTS_PATH}")
        else:
            print(f"ERROR: No existing results at {RESULTS_PATH}")
            sys.exit(1)
    else:
        results = verify_all(args.lang, model_name=args.model if args.model != 'large-v3-turbo' else 'base')
        with open(RESULTS_PATH, 'w', encoding='utf-8') as f:
            json.dump(results, f, ensure_ascii=False, indent=2)
        print(f"\nResults saved: {RESULTS_PATH}")

    build_html(results, lines_dict)


if __name__ == '__main__':
    main()
