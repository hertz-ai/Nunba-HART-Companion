"""
Language Segmenter — split mixed-language + multimedia text into segments.

Ported from makeittalk/task_c.py TextSplitter logic, extended with
media tag extraction for ACE Step music and DiffRhythm singing voice.

Segment types:
  - speech:  {'type': 'speech', 'lang': 'ta', 'text': '...'}
  - music:   {'type': 'music',  'text': '...', 'genre': '...', 'duration': 30}
  - sing:    {'type': 'sing',   'text': '...', 'duration': 30}
  - lyrics:  {'type': 'lyrics', 'text': '...'}

Example:
    segment("வணக்கம் <music genre='jazz' duration='10'>chill intro</music> hello")
    → [{'type': 'speech', 'lang': 'ta', 'text': 'வணக்கம்'},
       {'type': 'music',  'text': 'chill intro', 'genre': 'jazz', 'duration': 10},
       {'type': 'speech', 'lang': 'en', 'text': 'hello'}]
"""

import re
import string

# ── Unicode script ranges ─────────────────────────────────────────
SCRIPT_RANGES = {
    'devanagari': (0x0900, 0x097F),
    'bengali':    (0x0980, 0x09FF),
    'tamil':      (0x0B80, 0x0BFF),
    'gurmukhi':   (0x0A00, 0x0A7F),
    'gujarati':   (0x0A80, 0x0AFF),
    'kannada':    (0x0C80, 0x0CFF),
    'telugu':     (0x0C00, 0x0C7F),
    'malayalam':  (0x0D00, 0x0D7F),
    'odia':       (0x0B00, 0x0B7F),
    'latin':      (0x0000, 0x007F),
    'arabic':     (0x0600, 0x06FF),
    'cjk':        (0x4E00, 0x9FFF),
    'hangul':     (0xAC00, 0xD7AF),
    'katakana':   (0x30A0, 0x30FF),
    'hiragana':   (0x3040, 0x309F),
}

SCRIPT_TO_LANG = {
    'bengali': 'bn', 'tamil': 'ta', 'gurmukhi': 'pa', 'gujarati': 'gu',
    'kannada': 'kn', 'telugu': 'te', 'malayalam': 'ml', 'odia': 'or',
    'latin': 'en', 'arabic': 'ur', 'cjk': 'zh', 'hangul': 'ko',
    'katakana': 'ja', 'hiragana': 'ja',
}

_MARATHI_PATTERNS = [r'आहे', r'माझ', r'तुम्ह', r'मी', r'आम्ह', r'पण', r'मध्ये']
_HINDI_PATTERNS = [r'है', r'मैं', r'हम', r'आप', r'में', r'और', r'का', r'की', r'के', r'हूँ']

_PUNCTUATION = set(string.punctuation + '।॥…—–""''')

# ── Media tag patterns ────────────────────────────────────────────
# <music genre="jazz" duration="10">prompt text</music>
_MUSIC_RE = re.compile(
    r'<music\b([^>]*)>(.*?)</music>', re.DOTALL | re.IGNORECASE)
# <sing duration="15">lyrics to sing</sing>
_SING_RE = re.compile(
    r'<sing\b([^>]*)>(.*?)</sing>', re.DOTALL | re.IGNORECASE)
# <lyrics>song lyrics</lyrics>
_LYRICS_RE = re.compile(
    r'<lyrics\b[^>]*>(.*?)</lyrics>', re.DOTALL | re.IGNORECASE)

_ATTR_RE = re.compile(r"""(\w+)\s*=\s*['"]([^'"]*?)['"]""")


def _parse_attrs(attr_str: str) -> dict:
    """Parse HTML-style attributes: genre="jazz" duration="10" → dict."""
    attrs = {}
    for m in _ATTR_RE.finditer(attr_str):
        key, val = m.group(1).lower(), m.group(2)
        if key == 'duration':
            try:
                val = int(val)
            except ValueError:
                val = 30
        attrs[key] = val
    return attrs


# ── Script detection ──────────────────────────────────────────────

def _get_script(char: str) -> str:
    if char in _PUNCTUATION:
        return 'punctuation'
    code = ord(char)
    for script, (start, end) in SCRIPT_RANGES.items():
        if start <= code <= end:
            return script
    return 'other'


def _detect_devanagari_lang(text: str) -> str:
    mr = sum(1 for p in _MARATHI_PATTERNS if re.search(p, text))
    hi = sum(1 for p in _HINDI_PATTERNS if re.search(p, text))
    return 'mr' if mr > hi else 'hi'


def _script_to_lang(text: str, script: str) -> str:
    if script == 'devanagari':
        return _detect_devanagari_lang(text)
    return SCRIPT_TO_LANG.get(script, 'en')


# ── Core segmentation ────────────────────────────────────────────

def _segment_speech(text: str) -> list:
    """Split plain text into speech segments by script/language."""
    if not text or not text.strip():
        return []

    script_chunks = []
    current_chunk = ''
    current_script = None

    for char in text:
        if char.isspace():
            if current_chunk:
                current_chunk += char
            continue

        if char.isdigit():
            current_chunk += char
            continue

        script = _get_script(char)

        if script == 'punctuation':
            current_chunk += char
            continue

        if current_script is None:
            current_script = script
            current_chunk = char
        elif script != current_script:
            if current_chunk.strip():
                script_chunks.append((current_chunk.strip(), current_script))
            current_chunk = char
            current_script = script
        else:
            current_chunk += char

    if current_chunk.strip():
        script_chunks.append((current_chunk.strip(), current_script or 'latin'))

    result = []
    for chunk_text, script in script_chunks:
        lang = _script_to_lang(chunk_text, script)
        if result and result[-1]['lang'] == lang:
            result[-1]['text'] += ' ' + chunk_text
        else:
            result.append({'type': 'speech', 'lang': lang, 'text': chunk_text})

    return result


def _extract_media_tags(text: str) -> list:
    """Extract <music>, <sing>, <lyrics> tags and interleaved text.

    Returns ordered list of tuples: ('text', str) | ('music', dict) | ...
    """
    # Collect all tag spans
    spans = []
    for m in _MUSIC_RE.finditer(text):
        attrs = _parse_attrs(m.group(1))
        spans.append((m.start(), m.end(), {
            'type': 'music',
            'text': m.group(2).strip(),
            'genre': attrs.get('genre', ''),
            'duration': attrs.get('duration', 30),
        }))
    for m in _SING_RE.finditer(text):
        attrs = _parse_attrs(m.group(1))
        spans.append((m.start(), m.end(), {
            'type': 'sing',
            'text': m.group(2).strip(),
            'duration': attrs.get('duration', 30),
        }))
    for m in _LYRICS_RE.finditer(text):
        spans.append((m.start(), m.end(), {
            'type': 'lyrics',
            'text': m.group(1).strip(),
        }))

    if not spans:
        return [('text', text)]

    # Sort by position, no overlaps expected
    spans.sort(key=lambda s: s[0])

    parts = []
    last = 0
    for start, end, seg in spans:
        if last < start:
            between = text[last:start]
            if between.strip():
                parts.append(('text', between))
        parts.append((seg['type'], seg))
        last = end
    if last < len(text):
        tail = text[last:]
        if tail.strip():
            parts.append(('text', tail))

    return parts


def segment(text: str) -> list:
    """Split text into typed segments for TTS/music/singing routing.

    Returns list of segment dicts. Each has 'type' key:
      speech: {'type': 'speech', 'lang': str, 'text': str}
      music:  {'type': 'music',  'text': str, 'genre': str, 'duration': int}
      sing:   {'type': 'sing',   'text': str, 'duration': int}
      lyrics: {'type': 'lyrics', 'text': str}
    """
    if not text or not text.strip():
        return []

    parts = _extract_media_tags(text)

    result = []
    for kind, data in parts:
        if kind == 'text':
            # Plain text → split by language into speech segments
            result.extend(_segment_speech(data))
        else:
            # Media tag — already a complete segment dict
            result.append(data)

    return result
