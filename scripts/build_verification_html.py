"""Build an interactive HTML report comparing HART source text vs Whisper transcription.

Uses romanized character-level similarity (SequenceMatcher) to handle cross-script
comparisons — e.g. Bengali text transcribed in Gujarati script by Whisper.
"""
import html
import json
import os
import re
from difflib import SequenceMatcher


def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    results_path = os.path.join(base_dir, 'hart_verification_results.json')
    script_path = os.path.join(base_dir, 'scripts', 'generate_hart_voices.py')
    out_path = os.path.join(base_dir, 'hart_verification.html')

    # Load transcription results
    with open(results_path, encoding='utf-8') as f:
        results = json.load(f)

    # Extract LINES dict from generate_hart_voices.py
    with open(script_path, encoding='utf-8') as f:
        content = f.read()

    # Parse ALL_LANGS
    m = re.search(r'ALL_LANGS\s*=\s*\[([^\]]+)\]', content, re.DOTALL)
    ns = {}
    exec('ALL_LANGS = [' + m.group(1) + ']', ns)

    # Parse LINES dict
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
    exec('LINES = ' + content[lines_start + len('LINES = '):lines_end], ns)
    LINES = ns['LINES']

    # Transliteration + romanization
    try:
        from unidecode import unidecode
        def translit(text):
            t = unidecode(text)
            return t if t.lower().strip() != text.lower().strip() else ''
        def romanize(text):
            return re.sub(r'[^a-z0-9]', '', unidecode(text).lower().strip())
    except ImportError:
        def translit(text):
            return ''
        def romanize(text):
            return re.sub(r'[^a-z0-9]', '', text.lower().strip())

    line_ids = ['greeting', 'question_passion', 'question_escape', 'ack_escape',
                'pre_reveal', 'reveal_intro', 'post_reveal',
                'ack_music_art', 'ack_reading_learning', 'ack_building_coding',
                'ack_people_stories', 'ack_nature_movement', 'ack_games_strategy']

    gen_langs = sorted(results.keys())

    rows = []
    for lang in gen_langs:
        for lid in line_ids:
            expected = LINES.get(lid, {}).get(lang, '')
            if not expected:
                continue
            actual_data = results.get(lang, {}).get(lid, {})
            actual = actual_data.get('text', 'MISSING')
            detected = actual_data.get('detected_lang', '?')

            exp_translit = translit(expected)
            act_translit = translit(actual)

            # Romanized character-level similarity
            exp_r = romanize(expected)
            got_r = romanize(actual) if actual != 'MISSING' else ''
            if exp_r and got_r:
                sim = SequenceMatcher(None, exp_r, got_r).ratio() * 100
            elif actual == 'MISSING':
                sim = 0
            else:
                sim = 0

            # Classify
            if actual == 'MISSING':
                flag = 'MISSING'
            elif sim < 30:
                flag = f'BROKEN({sim:.0f}%)'
            elif sim < 50:
                flag = f'BAD({sim:.0f}%)'
            elif sim < 70:
                flag = f'WEAK({sim:.0f}%)'
            else:
                flag = ''

            # Detect end clipping: last 2 expected romanized words missing from got
            end_clipped = False
            exp_words = re.sub(r'[^a-z0-9 ]', '', (unidecode(expected) if 'unidecode' in dir() else expected).lower()).split() if exp_r else []
            if len(exp_words) >= 3 and got_r:
                last2 = exp_words[-2:]
                found = sum(1 for w in last2 if len(w) >= 3 and w in got_r)
                if found == 0:
                    end_clipped = True
                    if not flag:
                        flag = 'END_CLIP'
                    else:
                        flag += '+CLIP'

            rows.append((lang, lid, expected, exp_translit, actual, act_translit,
                         detected, flag, sim, end_clipped))

    # Build HTML
    langs_json = json.dumps(gen_langs)
    problem_count = sum(1 for r in rows if r[7])
    broken_count = sum(1 for r in rows if r[8] < 50)
    clip_count = sum(1 for r in rows if r[9])

    with open(out_path, 'w', encoding='utf-8') as f:
        f.write(f'''<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>HART Voice Verification</title>
<style>
body {{ font-family: 'Segoe UI', system-ui, sans-serif; background: #0f0e17; color: #e0e0e0; margin: 0; padding: 20px; }}
h1 {{ color: #6C63FF; text-align: center; margin-bottom: 5px; }}
.subtitle {{ text-align: center; color: #888; margin-bottom: 20px; font-size: 14px; }}
.filters {{ text-align: center; margin-bottom: 15px; flex-wrap: wrap; display: flex; justify-content: center; gap: 4px; }}
.filters button {{ background: #1a1a2e; color: #6C63FF; border: 1px solid #333; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; transition: all 0.2s; }}
.filters button:hover, .filters button.active {{ background: #6C63FF; color: #fff; border-color: #6C63FF; }}
.filters button.bad-btn {{ border-color: #FF6B6B; color: #FF6B6B; }}
.filters button.bad-btn:hover, .filters button.bad-btn.active {{ background: #FF6B6B; color: #fff; }}
.filters button.clip-btn {{ border-color: #FF9800; color: #FF9800; }}
.filters button.clip-btn:hover, .filters button.clip-btn.active {{ background: #FF9800; color: #fff; }}
table {{ width: 100%; border-collapse: collapse; font-size: 13px; table-layout: fixed; }}
th {{ background: #1a1a2e; color: #6C63FF; padding: 10px 6px; text-align: left; position: sticky; top: 0; z-index: 10; font-size: 12px; }}
td {{ padding: 7px 6px; border-bottom: 1px solid #1a1a2e; vertical-align: top; word-wrap: break-word; overflow-wrap: break-word; }}
tr:hover {{ background: #1a1a2e; }}
col.c-lang {{ width: 40px; }} col.c-line {{ width: 120px; }}
col.c-text {{ width: 22%; }} col.c-tlit {{ width: 18%; }}
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
.stats {{ text-align: center; margin: 10px 0; color: #888; font-size: 13px; }}
.lang-header {{ background: #12111f !important; }}
.lang-header td {{ padding: 12px 6px 4px; font-size: 16px; font-weight: bold; color: #6C63FF; border-bottom: 2px solid #6C63FF; }}
</style>
</head><body>
<h1>HART Voice Verification Report</h1>
<div class="subtitle">{len(rows)} comparisons | {broken_count} broken (&lt;50%) | {clip_count} end-clipped | {len(gen_langs)} languages | Romanized char similarity (SequenceMatcher)</div>
<div class="filters" id="filters"></div>
<div class="stats" id="stats"></div>
<table>
<colgroup>
<col class="c-lang"><col class="c-line">
<col class="c-text"><col class="c-tlit">
<col class="c-text"><col class="c-tlit">
<col class="c-sim"><col class="c-det"><col class="c-flag">
</colgroup>
<thead><tr>
<th>Lang</th><th>Line ID</th>
<th>Expected (source text)</th><th>Expected (romanized)</th>
<th>Whisper heard</th><th>Heard (romanized)</th>
<th>Sim%</th><th>Det</th><th>Status</th>
</tr></thead>
<tbody id="tbody">
''')

        prev_lang = None
        for lang, lid, expected, exp_t, actual, act_t, detected, flag, sim, clipped in rows:
            # Insert language header row
            if lang != prev_lang:
                lang_name = {
                    'en': 'English', 'ta': 'Tamil', 'hi': 'Hindi', 'bn': 'Bengali',
                    'te': 'Telugu', 'kn': 'Kannada', 'ml': 'Malayalam', 'gu': 'Gujarati',
                    'mr': 'Marathi', 'pa': 'Punjabi', 'ur': 'Urdu', 'ne': 'Nepali',
                    'or': 'Odia', 'as': 'Assamese', 'sa': 'Sanskrit',
                    'es': 'Spanish', 'fr': 'French', 'ja': 'Japanese', 'ko': 'Korean',
                    'zh': 'Chinese', 'de': 'German', 'it': 'Italian', 'ru': 'Russian',
                    'pt': 'Portuguese', 'ar': 'Arabic',
                }.get(lang, lang.upper())
                f.write(f'<tr class="lang-header" data-lang="{html.escape(lang)}" data-flag="" data-clip="0">'
                        f'<td colspan="9">{html.escape(lang.upper())} — {html.escape(lang_name)}</td></tr>\n')
                prev_lang = lang

            row_class = 'row-bad' if sim < 50 else ('row-clip' if clipped else '')
            if sim >= 90:
                sim_class = 'sim-good'
            elif sim >= 70:
                sim_class = 'sim-ok'
            elif sim >= 50:
                sim_class = 'sim-weak'
            else:
                sim_class = 'sim-bad'

            flag_class = 'flag-bad' if ('BROKEN' in flag or 'BAD' in flag) else ('flag-clip' if 'CLIP' in flag else 'flag-ok')
            flag_text = flag if flag else 'OK'
            clip_data = '1' if clipped else '0'

            f.write(f'<tr class="{row_class}" data-lang="{html.escape(lang)}" data-flag="{html.escape(flag)}" data-clip="{clip_data}">')
            f.write(f'<td class="lang">{html.escape(lang)}</td>')
            f.write(f'<td class="line-id">{html.escape(lid)}</td>')
            f.write(f'<td class="expected">{html.escape(expected)}</td>')
            f.write(f'<td class="translit">{html.escape(exp_t)}</td>')
            f.write(f'<td class="actual">{html.escape(actual)}</td>')
            f.write(f'<td class="translit">{html.escape(act_t)}</td>')
            f.write(f'<td class="sim {sim_class}">{sim:.0f}%</td>')
            f.write(f'<td class="detected">{html.escape(detected)}</td>')
            f.write(f'<td class="flag {flag_class}">{html.escape(flag_text)}</td>')
            f.write('</tr>\n')

        f.write(f'''</tbody></table>
<script>
const langs = {langs_json};
const filtersDiv = document.getElementById("filters");
const statsDiv = document.getElementById("stats");
let activeLang = null;
let showOnlyBad = false;
let showOnlyClip = false;

const allBtn = document.createElement("button");
allBtn.textContent = "ALL";
allBtn.className = "active";
allBtn.onclick = function() {{ activeLang = null; updateFilter(); }};
filtersDiv.appendChild(allBtn);

const badBtn = document.createElement("button");
badBtn.textContent = "BROKEN (<50%)";
badBtn.className = "bad-btn";
badBtn.onclick = function() {{ showOnlyBad = !showOnlyBad; showOnlyClip = false; updateFilter(); }};
filtersDiv.appendChild(badBtn);

const clipBtn = document.createElement("button");
clipBtn.textContent = "END CLIPPED";
clipBtn.className = "clip-btn";
clipBtn.onclick = function() {{ showOnlyClip = !showOnlyClip; showOnlyBad = false; updateFilter(); }};
filtersDiv.appendChild(clipBtn);

langs.forEach(function(l) {{
  var btn = document.createElement("button");
  btn.textContent = l.toUpperCase();
  btn.onclick = function() {{ activeLang = l; updateFilter(); }};
  filtersDiv.appendChild(btn);
}});

function updateFilter() {{
  var shown = 0, total = 0, problems = 0, clips = 0;
  var rows = document.querySelectorAll("#tbody tr");
  for (var i = 0; i < rows.length; i++) {{
    var row = rows[i];
    total++;
    var lang = row.dataset.lang;
    var flag = row.dataset.flag;
    var isClip = row.dataset.clip === "1";
    var isBad = flag && flag.length > 0;
    if (isBad) problems++;
    if (isClip) clips++;
    var show = true;
    if (activeLang && lang !== activeLang) show = false;
    if (showOnlyBad && !flag.match(/BROKEN|BAD/)) show = false;
    if (showOnlyClip && !isClip) show = false;
    row.style.display = show ? "" : "none";
    if (show) shown++;
  }}
  statsDiv.textContent = "Showing " + shown + " / " + total + " (" + problems + " flagged, " + clips + " end-clipped)";
  var btns = document.querySelectorAll("#filters button");
  for (var j = 0; j < btns.length; j++) btns[j].className = btns[j].className.replace(/ active/g, "");
  if (!activeLang && !showOnlyBad && !showOnlyClip) allBtn.className += " active";
  if (showOnlyBad) badBtn.className += " active";
  if (showOnlyClip) clipBtn.className += " active";
}}
updateFilter();
</script>
</body></html>''')

    print(f'Written {len(rows)} rows to {out_path}')
    print(f'Broken (<50% char sim): {broken_count}')
    print(f'End-clipped: {clip_count}')


if __name__ == '__main__':
    main()
