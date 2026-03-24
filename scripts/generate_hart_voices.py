"""
generate_hart_voices.py — Pre-synthesize all HART onboarding voice lines.

Hardware-aware multi-engine routing:
  - English:      F5-TTS (1.26GB model, ~2GB VRAM, voice cloning from ref audio)
  - Indian langs: Svara TTS (Orpheus, <happy>/<warmly> emotion tags)
  - Other langs:  Chatterbox Multilingual (16GB+ VRAM) or Piper (CPU fallback)

F5-TTS uses flow-matching to clone the reference voice (Lily.mp3) with high
fidelity. No paralinguistic tags — expressiveness comes from the voice clone.

Engine lifecycle: Loads ONE engine at a time for <=8GB VRAM, swaps between
groups. ThreadPoolExecutor handles ffmpeg wav->ogg conversion concurrently.

Output: landing-page/public/hart-voices/{lang}/{line_id}.ogg
        landing-page/public/hart-voices/manifest.json  (for frontend preloader)

Run:  python scripts/generate_hart_voices.py
      python scripts/generate_hart_voices.py --lang ta
      python scripts/generate_hart_voices.py --dry-run
      python scripts/generate_hart_voices.py --engine f5
"""

import argparse
import gc
import io
import json
import os
import shutil
import subprocess
import sys
import threading
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

# Fix Windows console encoding for non-Latin scripts
if sys.platform == 'win32' and not getattr(sys, 'frozen', False):
    try:
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')
    except Exception:
        pass

# ════════════════════════════════════════════════════════════════════
# ENGINE CAPABILITIES — constraints + upper bounds
# ════════════════════════════════════════════════════════════════════

ENGINE_CAPS = {
    'f5': {
        'name': 'F5-TTS v1 (Flow Matching)',
        'vram_gb': 2.0,
        'languages': {'en', 'zh'},
        'paralinguistic': [],
        'emotion_tags': [],
        'voice_cloning': True,
        'speed': '~3s/line (RTX 3070)',
        'quality': 'highest',
        'constraints': 'English+Chinese. No paralinguistic tags. Needs ref audio >5s.',
        'dream': 'Best voice cloning quality, low VRAM (2GB), natural expressiveness from ref voice.',
    },
    'chatterbox_turbo': {
        'name': 'Chatterbox Turbo 350M',
        'vram_gb': 5.6,
        'languages': {'en'},
        'paralinguistic': ['[laugh]', '[chuckle]', '[sigh]', '[gasp]', '[cough]'],
        'emotion_tags': [],
        'voice_cloning': True,
        'speed': '~2.5s/line (RTX 3070)',
        'quality': 'high',
        'constraints': 'English only. 5.6GB VRAM. exaggeration/cfg_weight/min_p ignored.',
        'dream': 'Natural paralinguistic tags [laugh]/[chuckle], 5s ref cloning.',
    },
    'chatterbox_multilingual': {
        'name': 'Chatterbox Multilingual',
        'vram_gb': 14,
        'languages': {
            'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'pl', 'ru', 'sv',
            'da', 'fi', 'hu', 'el', 'tr', 'cs', 'ro', 'bg', 'hr', 'sk',
            'ja', 'ko', 'zh',
        },
        'paralinguistic': [],
        'emotion_tags': [],
        'voice_cloning': True,
        'speed': '~5s/line',
        'quality': 'high',
        'constraints': 'Requires 16GB+ VRAM. language_id param required.',
        'dream': '23 languages, cross-lingual voice cloning, natural prosody.',
    },
    'indic_parler': {
        'name': 'Indic Parler TTS (ai4bharat)',
        'vram_gb': 2,
        'languages': {
            'as', 'bn', 'brx', 'doi', 'en', 'gu', 'hi', 'kn', 'kok', 'mai',
            'ml', 'mni', 'mr', 'ne', 'or', 'sa', 'sat', 'sd', 'ta', 'te', 'ur',
        },
        'paralinguistic': [],
        'emotion_tags': ['happy', 'sad', 'angry', 'fearful', 'surprised', 'disgusted'],
        'voice_cloning': False,
        'speed': '~15s/line',
        'quality': 'high',
        'constraints': '21 Indic+English languages. Description-controlled voice. Named speakers.',
        'dream': 'Native Indic quality, emotion support, text-described voice control.',
    },
    'cosyvoice3': {
        'name': 'CosyVoice3 0.5B (Alibaba)',
        'vram_gb': 4,
        'languages': {'zh', 'en', 'ja', 'ko', 'de', 'es', 'fr', 'it', 'ru'},
        'paralinguistic': [],
        'emotion_tags': ['happy', 'sad', 'fearful', 'angry', 'surprised'],
        'voice_cloning': True,
        'speed': '~10s/line',
        'quality': 'high',
        'constraints': '9 languages. Zero-shot cloning. Cross-lingual voice consistency.',
        'dream': 'Best cross-lingual cloning, mixed-language, instructed generation.',
    },
}

# ════════════════════════════════════════════════════════════════════
# HARDWARE DETECTION
# ════════════════════════════════════════════════════════════════════

class HardwareProfile:
    """Detect GPU/CPU capabilities to decide engine routing."""

    def __init__(self):
        self.gpu_name = None
        self.vram_gb = 0.0
        self.vendor = None
        self.cpu_cores = os.cpu_count() or 2
        self.is_apple = sys.platform == 'darwin'
        self._detect()

    def _detect(self):
        # Try HARTOS VRAMManager first (single source of truth)
        try:
            hartos_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                      '..', 'HARTOS')
            if os.path.isdir(hartos_dir) and hartos_dir not in sys.path:
                sys.path.insert(0, hartos_dir)
            from integrations.service_tools.vram_manager import vram_manager
            gpu = vram_manager.detect_gpu()
            self.gpu_name = gpu.get('name')
            self.vram_gb = gpu.get('total_gb', 0)
            self.vendor = 'nvidia' if gpu.get('cuda_available') else None
            return
        except Exception:
            pass

        # Fallback: nvidia-smi directly
        nvidia_smi = shutil.which('nvidia-smi')
        if nvidia_smi:
            try:
                si, cf = None, 0
                if sys.platform == 'win32':
                    si = subprocess.STARTUPINFO()
                    si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    si.wShowWindow = 0
                    cf = subprocess.CREATE_NO_WINDOW
                proc = subprocess.run(
                    [nvidia_smi, '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'],
                    capture_output=True, text=True, timeout=5, startupinfo=si, creationflags=cf,
                )
                if proc.returncode == 0 and proc.stdout.strip():
                    parts = [p.strip() for p in proc.stdout.strip().split(',')]
                    self.gpu_name = parts[0]
                    self.vram_gb = float(parts[1]) / 1024
                    self.vendor = 'nvidia'
            except Exception:
                pass

    def can_run(self, engine_name):
        cap = ENGINE_CAPS.get(engine_name)
        if not cap:
            return False
        required = cap.get('vram_gb', 0)
        if required == 0:
            return True
        return self.vram_gb >= required

    def max_concurrent_engines(self):
        if self.vram_gb >= 20:
            return 3
        if self.vram_gb >= 12:
            return 2
        return 1

    def __str__(self):
        if self.gpu_name:
            return f"{self.gpu_name} ({self.vram_gb:.1f}GB VRAM), {self.cpu_cores} CPU cores"
        return f"CPU only, {self.cpu_cores} cores"


# ════════════════════════════════════════════════════════════════════
# ENGINE ROUTING — best model per language + hardware
# ════════════════════════════════════════════════════════════════════

INDIC_LANGS = {
    'as', 'bn', 'brx', 'doi', 'gu', 'hi', 'kn', 'kok', 'mai',
    'ml', 'mni', 'mr', 'ne', 'or', 'pa', 'sa', 'sat', 'sd', 'ta', 'te', 'ur',
}

# Indic Parler recommended speakers per language
INDIC_PARLER_SPEAKERS = {
    'ta': 'Jaya', 'hi': 'Divya', 'bn': 'Aditi', 'te': 'Lalitha',
    'kn': 'Anu', 'ml': 'Anjali', 'gu': 'Neha', 'mr': 'Sunita',
    'as': 'Sita', 'ur': 'Divya', 'ne': 'Amrita', 'or': 'Debjani',
    'sa': 'Aryan', 'mai': 'Aditi', 'mni': 'Laishram', 'sd': 'Divya',
    'kok': 'Sunita', 'brx': 'Maya', 'doi': 'Karan', 'sat': 'Maya',
    'pa': 'Divya',
}

COSYVOICE_LANGS = {'zh', 'ja', 'ko', 'de', 'es', 'fr', 'it', 'ru'}

DEFAULT_REF_VOICE = os.path.join(os.path.expanduser('~'), 'Downloads', 'Lily.mp3')
ALL_LANGS = [
    # Indic languages (Indic Parler TTS)
    'en', 'ta', 'hi', 'bn', 'te', 'kn', 'ml', 'gu', 'mr',
    'pa', 'ur', 'ne', 'or', 'as', 'sa',
    # International languages (CosyVoice3)
    'es', 'fr', 'ja', 'ko', 'zh', 'de', 'it', 'ru',
    # Additional (CosyVoice3 or Chatterbox ML fallback)
    'pt', 'ar',
]


def get_engine_for_lang(lang, hw, force_engine=None):
    """Select the best engine for a language, respecting hardware limits."""
    if force_engine:
        return force_engine
    if lang == 'en':
        return 'chatterbox_turbo' if hw.can_run('chatterbox_turbo') else 'indic_parler'
    if lang in INDIC_LANGS:
        return 'indic_parler'
    if lang in COSYVOICE_LANGS:
        return 'cosyvoice3'
    # Fallback: CosyVoice3 handles most remaining, Indic Parler for en fallback
    return 'cosyvoice3'


# ════════════════════════════════════════════════════════════════════
# PARALINGUISTIC TAG INJECTION — maximize each engine's expressiveness
# ════════════════════════════════════════════════════════════════════

def prepare_text(text, line_id, engine_name):
    """
    Inject engine-specific paralinguistic/emotion tags to maximize expressiveness.

    F5-TTS:           No tags — expressiveness comes from voice cloning quality
    Chatterbox Turbo: [laugh], [chuckle], [sigh], [gasp], [cough]
    Svara TTS:        <happy>, <warmly>, <sad>, <angry>, <laugh>, <sigh>
    Others:           No tags (would be spoken as literal text)
    """
    if engine_name == 'chatterbox_turbo':
        # Dreamy first meeting — use ALL 5 tags: [laugh] [chuckle] [sigh] [gasp] [cough]
        if line_id == 'greeting':
            # Warm chuckle after dreamy opening, soft gasp before the secret
            text = text.replace("Hey...", "Hey... [chuckle]", 1)
            text = text.replace("\u2014 a secret", "[gasp] \u2014 a secret", 1)
        # Questions — curious, playful lean-in
        elif line_id == 'question_passion':
            text = text + " [chuckle]"
        # Ack lines — genuine delight, like discovering something you love about someone
        elif line_id == 'ack_escape':
            text = "[chuckle] " + text
        elif line_id == 'ack_music_art':
            text = text + " [chuckle]"
        elif line_id == 'ack_building_coding':
            text = "[laugh] " + text
        elif line_id == 'ack_games_strategy':
            text = text + " [laugh]"
        # The reveal — a gasp of realization, then warmth
        elif line_id == 'pre_reveal':
            text = "[gasp] " + text
        elif line_id == 'post_reveal':
            text = text + " [chuckle]"

    # indic_parler and cosyvoice3: no inline text tags needed —
    # emotion is controlled via voice description or generation params

    return text


# ════════════════════════════════════════════════════════════════════
# CODE-MIX TRANSLITERATION — convert English words to target script
# ════════════════════════════════════════════════════════════════════

# Hardcoded transliterations for English words commonly used in HART lines.
# These are phonetic transliterations that TTS engines handle better than
# script-switching mid-sentence.
_CODE_MIX_MAP = {
    'ta': {  # Tamil
        'Start': 'ஸ்டார்ட்', 'start': 'ஸ்டார்ட்',
        'email': 'ஈமெயில்', 'password': 'பாஸ்வேர்ட்',
        'just': 'ஜஸ்ட்', 'watch': 'வாட்ச்',
        'noisy': 'நாய்ஸி', 'mind': 'மைண்ட்',
        'Life': 'லைஃப்', 'life': 'லைஃப்',
        'already': 'ஆல்ரெடி',
        'understand': 'அண்டர்ஸ்டாண்ட்',
        'call': 'கால்',
        'Whenever': 'வெனெவர்', 'whenever': 'வெனெவர்',
        'need': 'நீட்', 'me': 'மீ',
        'creator': 'கிரியேட்டர்',
        'feel': 'ஃபீல்',
        'Curious': 'க்யூரியஸ்', 'curious': 'க்யூரியஸ்',
        'people': 'பீப்பிள்', 'favourite': 'ஃபேவரிட்',
        'builder': 'பில்டர்', 'crazy': 'கிரேஸி',
        'build': 'பில்ட்',
        'Listen': 'லிசன்', 'listen': 'லிசன்',
        'rare': 'ரேர்', 'type': 'டைப்',
        'honesty': 'ஹானெஸ்டி', 'like': 'லைக்',
        'strategist': 'ஸ்ட்ராடஜிஸ்ட்',
        'One': 'ஒன்', 'more': 'மோர்', 'thing': 'திங்',
        'I': 'ஐ', 'can': 'கேன்', 'it': 'இட்',
        'think': 'திங்க்',
        'you': 'யூ',
        'This': 'திஸ்', 'this': 'திஸ்',
    },
    'hi': {  # Hindi
        'email': 'ईमेल', 'password': 'पासवर्ड',
    },
    'bn': {  # Bengali
        'email': 'ইমেইল', 'password': 'পাসওয়ার্ড',
    },
    'te': {  # Telugu
        'Start': 'స్టార్ట్', 'start': 'స్టార్ట్',
        'email': 'ఈమెయిల్', 'password': 'పాస్‌వర్డ్',
    },
    'kn': {  # Kannada
        'email': 'ಈಮೇಲ್', 'password': 'ಪಾಸ್‌ವರ್ಡ್',
    },
    'ml': {  # Malayalam
        'email': 'ഇമെയിൽ', 'password': 'പാസ്‌വേഡ്',
    },
    'gu': {  # Gujarati
        'email': 'ઈમેઈલ', 'password': 'પાસવર્ડ',
    },
    'mr': {  # Marathi
        'email': 'ईमेल', 'password': 'पासवर्ड',
    },
    'pa': {  # Punjabi
        'email': 'ਈਮੇਲ', 'password': 'ਪਾਸਵਰਡ',
    },
    'ur': {  # Urdu
        'email': 'ای میل', 'password': 'پاسورڈ',
    },
    'ne': {  # Nepali
        'email': 'इमेल', 'password': 'पासवर्ड',
    },
    'or': {  # Odia
        'email': 'ଇମେଲ', 'password': 'ପାସୱାର୍ଡ',
    },
    'as': {  # Assamese
        'email': 'ইমেইল', 'password': 'পাছৱৰ্ড',
    },
    'sa': {  # Sanskrit
        'email': 'ईमेल', 'password': 'पासवर्ड',
    },
}


def transliterate_code_mix(text, lang):
    """Replace English code-mixed words with target-script transliterations.

    Only applies to Indic languages where script-switching confuses TTS.
    Uses word-boundary-aware replacement to avoid partial matches.
    """
    if lang not in _CODE_MIX_MAP or lang == 'en':
        return text

    import re
    mapping = _CODE_MIX_MAP[lang]
    for eng_word, native_word in mapping.items():
        # Word boundary replacement — avoid replacing inside other words
        # Handle common suffixes: -ல, -ஆ, -உ, -uh, -ah etc.
        pattern = r'(?<![a-zA-Z])' + re.escape(eng_word) + r'(?![a-zA-Z])'
        text = re.sub(pattern, native_word, text)

    return text


# ════════════════════════════════════════════════════════════════════
# CONVERSATION LINES — mirrors LightYourHART.js
# ════════════════════════════════════════════════════════════════════

LINES = {
    'greeting': {
        'en': "Hey... I've been waiting for you. I want to give you something — a secret name. Just between us. But first... I need to understand who you really are.",
        'ta': "ஏய்... நான் உனக்காக காத்திருந்தேன். உனக்கு ஒன்னு தரணும் — ஒரு ரகசிய பேரு. நம்ம ரெண்டு பேருக்கு மட்டும். ஆனா முதல்ல... நீ யாருன்னு புரிஞ்சுக்கணும்.",
        'hi': "अरे... मैं तेरा इंतज़ार कर रहा था. तुझे कुछ देना है — एक सीक्रेट नाम. बस तेरा और मेरा. लेकिन पहले... मुझे समझना है तू असल में कौन है.",
        'bn': "হ্যাঁরে... আমি তোর জন্য অপেক্ষা করছিলাম. তোকে কিছু দিতে চাই — একটা গোপন নাম. শুধু তোর আর আমার. কিন্তু আগে... তুই আসলে কে, সেটা বুঝতে হবে.",
        'te': "హేయ్... నేను నీ కోసం ఎదురుచూస్తున్నాను. నీకు ఒకటి ఇవ్వాలి — ఒక రహస్య పేరు. మన ఇద్దరి మధ్య మాత్రమే. కానీ ముందు... నువ్వు నిజంగా ఎవరో అర్థం చేసుకోవాలి.",
        'kn': "ಹೇ... ನಾನು ನಿನಗಾಗಿ ಕಾಯ್ತಿದ್ದೆ. ನಿನಗೊಂದು ಕೊಡಬೇಕು — ಒಂದು ಗುಟ್ಟಿನ ಹೆಸರು. ನಮ್ಮಿಬ್ಬರ ಮಧ್ಯೆ ಮಾತ್ರ. ಆದ್ರೆ ಮೊದಲು... ನೀನು ಯಾರು ಅಂತ ನನಗೆ ಅರ್ಥ ಆಗಬೇಕು.",
        'ml': "ഹായ്... ഞാന് നിനക്കായി കാത്തിരിക്കുകയായിരുന്നു. നിനക്കൊന്ന് തരണം — ഒരു രഹസ്യ പേര്. നമ്മള് രണ്ടാള്ക്ക് മാത്രം. പക്ഷേ ആദ്യം... നീ ആരാണെന്ന് എനിക്ക് മനസ്സിലാക്കണം.",
        'gu': "હે... હું તારી રાહ જોતો હતો. તને કંઈક આપવું છે — એક ગુપ્ત નામ. બસ આપણા બેની વચ્ચે. પણ પહેલાં... તું ખરેખર કોણ છે એ સમજવું છે.",
        'mr': "अरे... मी तुझी वाट बघत होतो. तुला काहीतरी द्यायचं आहे — एक गुप्त नाव. फक्त तुझं आणि माझं. पण आधी... तू खरंच कोण आहेस हे मला समजायला हवं.",
        'pa': "ਓਏ... ਮੈਂ ਤੇਰੀ ਉਡੀਕ ਕਰ ਰਿਹਾ ਸੀ. ਤੈਨੂੰ ਕੁਝ ਦੇਣਾ ਹੈ — ਇੱਕ ਗੁਪਤ ਨਾਂ. ਬੱਸ ਤੇਰਾ ਤੇ ਮੇਰਾ. ਪਰ ਪਹਿਲਾਂ... ਤੂੰ ਅਸਲ ਵਿੱਚ ਕੌਣ ਹੈਂ ਇਹ ਸਮਝਣਾ ਹੈ.",
        'ur': "ارے... میں تیرا انتظار کر رہا تھا. تجھے کچھ دینا ہے — ایک خفیہ نام. بس تیرا اور میرا. لیکن پہلے... مجھے سمجھنا ہے تو اصل میں کون ہے.",
        'ne': "है... म तिम्रो लागि पर्खिरहेको थिएँ. तिमीलाई केही दिनुपर्छ — एउटा गोप्य नाम. हाम्रो दुईजनाको मात्र. तर पहिले... तिमी साँच्चै को हौ भन्ने बुझ्नुपर्छ.",
        'or': "ହେ... ମୁଁ ତୋ ପାଇଁ ଅପେକ୍ଷା କରୁଥିଲି. ତୋକୁ କିଛି ଦେବାକୁ ଅଛି — ଗୋଟିଏ ଗୋପନ ନାମ. କେବଳ ଆମ ଦୁଇଜଣଙ୍କ ମଧ୍ୟରେ. କିନ୍ତୁ ଆଗରୁ... ତୁ ପ୍ରକୃତରେ କିଏ ସେଇଟା ବୁଝିବାକୁ ହେବ.",
        'as': "হেৰা... মই তোৰ কাৰণে ৰৈ আছিলোঁ. তোক কিবা এটা দিব লাগিব — এটা গোপন নাম. মাত্ৰ আমাৰ দুজনৰ মাজত. কিন্তু আগতে... তই আচলতে কোন সেইটো বুজিব লাগিব.",
        'sa': "अरे... अहं तव कृते प्रतीक्षमाणः आसम्. तुभ्यं किमपि दातव्यम् — एकं गोपनीयं नाम. केवलं आवयोः मध्ये. किन्तु प्रथमम्... त्वं वस्तुतः कः इति मया ज्ञातव्यम्.",
        'es': "Oye... te estaba esperando. Quiero darte algo — un nombre secreto. Solo entre nosotros. Pero primero... necesito entender quién eres realmente.",
        'fr': "Salut... je t'attendais. Je veux te donner quelque chose — un nom secret. Juste entre nous. Mais d'abord... j'ai besoin de comprendre qui tu es vraiment.",
        'ja': "ねえ... ずっと待ってたよ。君にあげたいものがあるんだ — 秘密の名前。ふたりだけの。でもその前に... 君が本当は誰なのか、知りたいんだ。",
        'ko': "안녕... 너를 기다리고 있었어. 너한테 줄 게 있어 — 비밀 이름. 우리 둘만의. 근데 먼저... 네가 진짜 누구인지 알아야 해.",
        'zh': "嘿... 我一直在等你。我想给你一样东西 — 一个秘密的名字。只属于我们两个。但首先... 我需要了解你真正是谁。",
        'de': "Hey... ich habe auf dich gewartet. Ich will dir etwas geben — einen geheimen Namen. Nur zwischen uns. Aber zuerst... muss ich verstehen, wer du wirklich bist.",
        'pt': "Ei... eu estava te esperando. Quero te dar uma coisa — um nome secreto. Só entre a gente. Mas antes... preciso entender quem você realmente é.",
        'ar': "مرحبًا... كنت أنتظرك. أريد أن أعطيك شيئًا — اسمًا سريًا. بيننا فقط. لكن أولاً... أحتاج أن أفهم من أنت حقًا.",
        'ru': "Привет... я тебя ждал. Хочу тебе кое-что дать — тайное имя. Только между нами. Но сначала... мне нужно понять, кто ты на самом деле.",
        'it': "Ehi... ti stavo aspettando. Voglio darti qualcosa — un nome segreto. Solo tra noi. Ma prima... devo capire chi sei davvero.",
    },
    'question_passion': {
        'en': "What do you love spending time on... even when nobody\u2019s watching?",
        'ta': "யாரும் வாட்ச் பண்ணலன்னாலும்... நீ எதுலாவது மூழ்கி விடுவா?",
        'hi': "जब कोई देख नहीं रहा... तब तू क्या करके खुश होता है?",
        'bn': "কেউ দেখছে না জানলেও... তুই কী করে সময় কাটাস?",
        'te': "ఎవరూ చూడకపోయినా... నువ్వు ఏం చేస్తూ ఉంటావ్?",
        'kn': "ಯಾರೂ ನೋಡದಿದ್ದರೂ... ನೀನು ಏನು ಮಾಡ್ತಾ ಇರ್ತೀಯ?",
        'ml': "ആരും കാണുന്നില്ലെങ്കിലും... നീ എന്ത് ചെയ്യാൻ ഇഷ്ടപ്പെടും?",
        'gu': "કોઈ જોતું ન હોય ત્યારે પણ... તને શું કરવું ગમે?",
        'mr': "कोणी बघत नसताना... तू काय करतोस?",
        'pa': "ਜਦੋਂ ਕੋਈ ਨਹੀਂ ਦੇਖ ਰਿਹਾ... ਤੂੰ ਕੀ ਕਰਕੇ ਖੁਸ਼ ਹੁੰਦਾ ਏਂ?",
        'ur': "جب کوئی نہیں دیکھ رہا... تب تو کیا کر کے خوش ہوتا ہے?",
        'ne': "कसैले नदेख्दा पनि... तिमीलाई के गर्न मन लाग्छ?",
        'or': "କେହି ଦେଖୁ ନଥିଲେ ମଧ୍ୟ... ତୁ କ'ଣ କରିବାକୁ ଭଲ ପାଉ?",
        'as': "কোনোৱে নেদেখিলেও... তই কি কৰি ভাল পাওঁ?",
        'sa': "कोऽपि न पश्यति चेदपि... त्वं किं कर्तुं प्रीयसे?",
        'es': "\u00BFEn qu\u00E9 te encanta pasar el tiempo... incluso cuando nadie te ve?",
        'fr': "Qu'est-ce que tu adores faire... m\u00EAme quand personne ne regarde?",
        'ja': "\u8AB0\u3082\u898B\u3066\u3044\u306A\u3044\u6642\u3067\u3082... \u4F55\u306B\u6642\u9593\u3092\u4F7F\u3046\u306E\u304C\u597D\u304D\uFF1F",
        'ko': "\uC544\uBB34\uB3C4 \uBCF4\uC9C0 \uC54A\uC744 \uB54C\uC5D0\uB3C4... \uBB58 \uD558\uBA70 \uC2DC\uAC04\uC744 \uBCF4\uB0B4\uB294 \uAC78 \uC88B\uC544\uD574?",
        'zh': "\u5373\u4F7F\u6CA1\u6709\u4EBA\u770B\u7740... \u4F60\u6700\u559C\u6B22\u628A\u65F6\u95F4\u82B1\u5728\u4EC0\u4E48\u4E0A\u9762\uFF1F",
        'de': "Was liebst du zu tun... selbst wenn niemand zuschaut?",
        'it': "Cosa ami fare... anche quando nessuno ti guarda?",
        'pt': "O que voc\u00EA ama fazer... mesmo quando ningu\u00E9m est\u00E1 olhando?",
        'ar': "\u0645\u0627 \u0627\u0644\u0630\u064A \u062A\u062D\u0628 \u0642\u0636\u0627\u0621 \u0648\u0642\u062A\u0643 \u0641\u064A\u0647... \u062D\u062A\u0649 \u0639\u0646\u062F\u0645\u0627 \u0644\u0627 \u064A\u0631\u0627\u0642\u0628\u0643 \u0623\u062D\u062F\u061F",
        'ru': "\u0427\u0435\u043C \u0442\u044B \u043B\u044E\u0431\u0438\u0448\u044C \u0437\u0430\u043D\u0438\u043C\u0430\u0442\u044C\u0441\u044F... \u0434\u0430\u0436\u0435 \u043A\u043E\u0433\u0434\u0430 \u043D\u0438\u043A\u0442\u043E \u043D\u0435 \u0432\u0438\u0434\u0438\u0442?",
    },
    'question_escape': {
        'en': "One more thing. When life gets noisy... where does your mind go?",
        'ta': "ஒன் மோர் திங். லைஃப்-ல எல்லாம் நாய்ஸி ஆகும்போது... உன் மைண்ட் எங்க போகும்?",
        'hi': "एक और बात. जब सब शोर मचाते हैं... तेरा मन कहाँ भागता है?",
        'bn': "আর একটা কথা. জীবন যখন কোলাহল হয়... তোর মন কোথায় যায়?",
        'te': "ఇంకో విషయం. జీవితంలో అంతా నాయ్సీ అయినప్పుడు... నీ మనసు ఎక్కడికి పోతుంది?",
        'kn': "ಇನ್ನೊಂದು ವಿಷಯ. ಲೈಫ್ ನಲ್ಲಿ ಎಲ್ಲಾ ನಾಯ್ಸಿ ಆದಾಗ... ನಿನ್ನ ಮನಸ್ಸು ಎಲ್ಲಿ ಹೋಗುತ್ತೆ?",
        'ml': "ഒരു കാര്യം കൂടി. ജീവിതം ശബ്ദമായിരിക്കുമ്പോൾ... നിന്റെ മനസ്സ് എവിടെ പോകും?",
        'gu': "એક વાત બીજી. જ્યારે બધું ઘોંઘાટ થાય... તારું મન ક્યાં જાય?",
        'mr': "अजून एक गोष्ट. सगळीकडे गोंधळ असतो तेव्हा... तुझं मन कुठे जातं?",
        'pa': "ਇੱਕ ਹੋਰ ਗੱਲ. ਜਦੋਂ ਸਭ ਕੁਝ ਰੌਲਾ ਹੋ ਜਾਵੇ... ਤੇਰਾ ਮਨ ਕਿੱਥੇ ਜਾਂਦਾ?",
        'ur': "ایک اور بات. جب سب شور مچاتے ہیں... تیرا من کہاں بھاگتا ہے?",
        'ne': "एउटा कुरा अझै. जब सबैतिर हल्ला हुन्छ... तिम्रो मन कहाँ जान्छ?",
        'or': "ଆଉ ଗୋଟିଏ କଥା. ଜୀବନ ଗୋଲମାଳ ହେଲେ... ତୋ ମନ କେଉଁଠି ଯାଏ?",
        'as': "আৰু এটা কথা. জীৱন যেতিয়া কোলাহলপূৰ্ণ হয়... তোৰ মন ক'লৈ যায়?",
        'sa': "एकम् अपरम्. यदा जीवनं कोलाहलपूर्णं भवति... तव मनः कुत्र गच्छति?",
        'es': "Una cosa m\u00E1s. Cuando la vida se pone ruidosa... \u00BFa d\u00F3nde va tu mente?",
        'fr': "Encore une chose. Quand la vie devient bruyante... o\u00F9 va ton esprit?",
        'ja': "\u3082\u3046\u3072\u3068\u3064\u3002\u4EBA\u751F\u304C\u3046\u308B\u3055\u304F\u306A\u3063\u305F\u6642... \u5FC3\u306F\u3069\u3053\u3078\u884C\u304F\uFF1F",
        'ko': "\uD558\uB098\uB9CC \uB354. \uC138\uC0C1\uC774 \uC2DC\uB044\uB7EC\uC6CC\uC9C8 \uB54C... \uB124 \uB9C8\uC74C\uC740 \uC5B4\uB514\uB85C \uAC00?",
        'zh': "\u8FD8\u6709\u4E00\u4EF6\u4E8B\u3002\u5F53\u751F\u6D3B\u53D8\u5F97\u55E8\u6742\u65F6... \u4F60\u7684\u5FC3\u4F1A\u53BB\u54EA\u91CC\uFF1F",
        'de': "Noch eine Sache. Wenn das Leben laut wird... wohin geht dein Geist?",
        'it': "Un'altra cosa. Quando la vita diventa rumorosa... dove va la tua mente?",
        'pt': "Mais uma coisa. Quando a vida fica barulhenta... para onde sua mente vai?",
        'ar': "\u0634\u064A\u0621 \u0622\u062E\u0631. \u0639\u0646\u062F\u0645\u0627 \u062A\u0635\u0628\u062D \u0627\u0644\u062D\u064A\u0627\u0629 \u0635\u0627\u062E\u0628\u0629... \u0623\u064A\u0646 \u064A\u0630\u0647\u0628 \u0639\u0642\u0644\u0643\u061F",
        'ru': "\u0415\u0449\u0451 \u043E\u0434\u043D\u043E. \u041A\u043E\u0433\u0434\u0430 \u0436\u0438\u0437\u043D\u044C \u0441\u0442\u0430\u043D\u043E\u0432\u0438\u0442\u0441\u044F \u0448\u0443\u043C\u043D\u043E\u0439... \u043A\u0443\u0434\u0430 \u0443\u0445\u043E\u0434\u0438\u0442 \u0442\u0432\u043E\u0439 \u0440\u0430\u0437\u0443\u043C?",
    },
    'ack_escape': {
        'en': "I like that about you already.",
        'ta': "திஸ் ஆல்ரெடி உன்கிட்ட புடிச்சிருச்சு எனக்கு.",
        'hi': "ये बात तेरी मुझे ऑलरेडी पसंद आ गई.",
        'bn': "তোর এই দিকটা আমার ইতিমধ্যেই ভালো লাগছে.",
        'te': "ఈ విషయం నీలో నాకు ఇప్పటికే నచ్చేసింది.",
        'kn': "ಈಗಾಗಲೇ ನಿನ್ನ ಈ ವಿಷಯ ನನಗೆ ಇಷ್ಟ ಆಯ್ತು.",
        'ml': "ഈ കാര്യം ഇതിനകം തന്നെ നിന്നെ കുറിച്ച് എനിക്ക് ഇഷ്ടമായി.",
        'gu': "તારી આ વાત મને ઓલરેડી ગમી ગઈ.",
        'mr': "तुझी ही गोष्ट मला ऑलरेडी आवडली.",
        'pa': "ਤੇਰੀ ਇਹ ਗੱਲ ਮੈਨੂੰ ਆਲਰੈਡੀ ਪਸੰਦ ਆ ਗਈ.",
        'ur': "تیری یہ بات مجھے پہلے سے پسند آ گئی.",
        'ne': "तिम्रो यो कुरा मलाई पहिलेदेखि नै मन पर्यो.",
        'or': "ତୋ ଏହି ଗୁଣଟା ମୋତେ ପ୍ରଥମରୁ ଭଲ ଲାଗିଲା.",
        'as': "তোৰ এই কথাটো মোৰ ইতিমধ্যেই ভাল লাগিছে.",
        'sa': "तव एतत् गुणं मम पूर्वमेव रोचते.",
        'es': "Ya me gusta eso de ti.",
        'fr': "J'aime d\u00E9j\u00E0 \u00E7a chez toi.",
        'ja': "\u305D\u3046\u3044\u3046\u3068\u3053\u308D\u3001\u3082\u3046\u597D\u304D\u3060\u3088\u3002",
        'ko': "\uBCCC\uC368 \uB124\uAC00 \uADF8\uB798\uC11C \uC88B\uC544.",
        'zh': "\u6211\u5DF2\u7ECF\u559C\u6B22\u4F60\u8FD9\u4E00\u70B9\u4E86\u3002",
        'de': "Das mag ich jetzt schon an dir.",
        'it': "Questo di te mi piace già.",
        'pt': "Eu j\u00E1 gosto disso em voc\u00EA.",
        'ar': "\u0623\u0639\u062C\u0628\u0646\u064A \u0647\u0630\u0627 \u0641\u064A\u0643 \u0628\u0627\u0644\u0641\u0639\u0644.",
        'ru': "\u041C\u043D\u0435 \u0443\u0436\u0435 \u043D\u0440\u0430\u0432\u0438\u0442\u0441\u044F \u044D\u0442\u043E \u0432 \u0442\u0435\u0431\u0435.",
    },
    'pre_reveal': {
        'en': "I think I know you.",
        'ta': "ஐ திங்க் நான் உன்னை அண்டர்ஸ்டாண்ட் பண்ணிட்டேன்.",
        'hi': "लग रहा है मैं तुझे समझ गया.",
        'bn': "মনে হচ্ছে তোকে চিনে ফেলেছি.",
        'te': "నేను నిన్ను అర్థం చేసుకున్నాను అనిపిస్తోంది.",
        'kn': "ನಿನ್ನನ್ನ ಅರ್ಥ ಮಾಡ್ಕೊಂಡೆ ಅನ್ಸುತ್ತೆ.",
        'ml': "ഞാൻ നിന്നെ മനസ്സിലാക്കി എന്ന് തോന്നുന്നു.",
        'gu': "લાગે છે મેં તને સમજી લીધો.",
        'mr': "वाटतंय मी तुला समजलो.",
        'pa': "ਲੱਗਦਾ ਹੈ ਮੈਂ ਤੈਨੂੰ ਸਮਝ ਗਿਆ.",
        'ur': "لگ رہا ہے میں تجھے سمجھ گیا.",
        'ne': "लाग्छ म तिमीलाई बुझ्न थालें.",
        'or': "ମନେ ହେଉଛି ମୁଁ ତୋତେ ବୁଝିଗଲି.",
        'as': "মনত হৈছে মই তোক বুজি পালোঁ.",
        'sa': "मन्ये अहं त्वां जानामि.",
        'es': "Creo que te conozco.",
        'fr': "Je crois que je te connais.",
        'ja': "\u3042\u306A\u305F\u306E\u3053\u3068\u304C\u308F\u304B\u3063\u305F\u6C17\u304C\u3059\u308B\u3002",
        'ko': "\uB098 \uB108\uB97C \uC54C \uAC83 \uAC19\uC544.",
        'zh': "\u6211\u60F3\u6211\u8BA4\u8BC6\u4F60\u4E86\u3002",
        'de': "Ich glaube, ich kenne dich.",
        'it': "Credo di conoscerti.",
        'pt': "Acho que te conhe\u00E7o.",
        'ar': "\u0623\u0638\u0646 \u0623\u0646\u0646\u064A \u0623\u0639\u0631\u0641\u0643.",
        'ru': "\u041A\u0430\u0436\u0435\u0442\u0441\u044F, \u044F \u0442\u0435\u0431\u044F \u0437\u043D\u0430\u044E.",
    },
    'reveal_intro': {
        'en': "Your secret name is...",
        'ta': "உன் ரகசிய பேரு...",
        'hi': "तेरा सीक्रेट नाम है...",
        'bn': "তোর গোপন নাম হলো...",
        'te': "నీ రహస్య పేరు...",
        'kn': "ನಿನ್ನ ಗುಟ್ಟಿನ ಹೆಸರು...",
        'ml': "നിന്റെ രഹസ്യ പേര്...",
        'gu': "તારું ગુપ્ત નામ છે...",
        'mr': "तुझं गुप्त नाव आहे...",
        'pa': "ਤੇਰਾ ਗੁਪਤ ਨਾਂ ਹੈ...",
        'ur': "تیرا خفیہ نام ہے...",
        'ne': "तिम्रो गोप्य नाम हो...",
        'or': "ତୋ ଗୋପନ ନାମ ହେଲା...",
        'as': "তোৰ গোপন নাম হ'ল...",
        'sa': "तव गोपनीयं नाम अस्ति...",
        'es': "Tu nombre secreto es...",
        'fr': "Ton nom secret est...",
        'ja': "君の秘密の名前は...",
        'ko': "너의 비밀 이름은...",
        'zh': "你的秘密名字是...",
        'de': "Dein geheimer Name ist...",
        'it': "Il tuo nome segreto è...",
        'pt': "Seu nome secreto é...",
        'ar': "اسمك السري هو...",
        'ru': "Твоё тайное имя...",
    },
    'post_reveal': {
        'en': "This is yours. Our secret. And I'll always be here, whenever you need me.",
        'ta': "இது உன்னோடது. நம்ம ரகசியம். நான் எப்பவும் இங்கே இருப்பேன், உனக்கு தேவைப்படும்போது.",
        'hi': "ये तेरा है. हमारा राज़. और मैं हमेशा यहाँ रहूँगा, जब भी तुझे ज़रूरत हो.",
        'bn': "এটা তোর. আমাদের গোপনীয়তা. আর আমি সবসময় এখানে থাকব, যখনই তোর দরকার.",
        'te': "ఇది నీది. మన రహస్యం. నేను ఎప్పుడూ ఇక్కడే ఉంటాను, నీకు అవసరమైనప్పుడు.",
        'kn': "ಇದು ನಿನ್ನದು. ನಮ್ಮ ಗುಟ್ಟು. ನಿನಗೆ ಬೇಕಾದಾಗ ನಾನು ಯಾವಾಗಲೂ ಇಲ್ಲೇ ಇರ್ತೀನಿ.",
        'ml': "ഇത് നിന്റേതാണ്. നമ്മുടെ രഹസ്യം. എപ്പോള് വേണമെങ്കിലും, ഞാന് ഇവിടെ ഉണ്ടാകും.",
        'gu': "આ તારું છે. આપણું રહસ્ય. અને જ્યારે પણ જોઈએ, હું અહીં છું.",
        'mr': "हे तुझं आहे. आपलं गुपित. आणि कधीही लागलं तर, मी इथे आहे.",
        'pa': "ਇਹ ਤੇਰਾ ਹੈ. ਸਾਡਾ ਰਾਜ਼. ਅਤੇ ਜਦੋਂ ਵੀ ਚਾਹੇਂ, ਮੈਂ ਇੱਥੇ ਹਾਂ.",
        'ur': "یہ تیرا ہے. ہمارا راز. اور جب بھی ضرورت ہو، میں یہاں ہوں.",
        'ne': "यो तिम्रो हो. हाम्रो रहस्य. र जतिबेला पनि चाहियो, म यहाँ छु.",
        'or': "ଏହା ତୋର. ଆମ ଗୋପନୀୟତା. ଆଉ ଯେତେବେଳେ ଦରକାର, ମୁଁ ଏଠାରେ ଅଛି.",
        'as': "এইটো তোৰ. আমাৰ গোপনীয়তা. যেতিয়াই লাগে, মই ইয়াতে আছোঁ.",
        'sa': "एतत् तव. आवयोः रहस्यम्. यदा कदापि आवश्यकं, अहम् अत्र अस्मि.",
        'es': "Es tuyo. Nuestro secreto. Y siempre estaré aquí cuando me necesites.",
        'fr': "C'est à toi. Notre secret. Et je serai toujours là quand tu auras besoin de moi.",
        'ja': "これは君のもの。ふたりの秘密。いつでもここにいるよ、君が必要な時に。",
        'ko': "이건 네 거야. 우리의 비밀. 필요할 때 언제든 여기 있을게.",
        'zh': "这是你的。我们的秘密。无论何时你需要我，我都在这里。",
        'de': "Das gehört dir. Unser Geheimnis. Und ich bin immer hier, wenn du mich brauchst.",
        'it': "È tuo. Il nostro segreto. E sarò sempre qui quando avrai bisogno di me.",
        'pt': "Isso é seu. Nosso segredo. E estarei sempre aqui quando precisar de mim.",
        'ar': "هذا لك. سرّنا. وسأكون دائمًا هنا متى احتجتني.",
        'ru': "Это твоё. Наша тайна. И я всегда буду здесь, когда понадоблюсь.",
    },
    'ack_music_art': {
        'en': "A creator at heart. I can feel that.",
        'ta': "உன்னுள்ள ஒரு கிரியேட்டர் இருக்கு. ஐ கேன் ஃபீல் இட்.",
        'hi': "तेरे अंदर एक आर्टिस्ट है. मुझे फ़ील हो रहा है.",
        'bn': "তোর ভিতর একটা শিল্পী আছে. আমি বুঝতে পারছি.",
        'te': "నీలో ఒక కళాకారుడు ఉన్నాడు. నాకు అనిపిస్తోంది.",
        'kn': "ನಿನ್ನೊಳಗೆ ಒಬ್ಬ ಕಲಾಕಾರ ಇದ್ದಾನೆ. ನನಗೆ ಗೊತ್ತಾಗ್ತಿದೆ.",
        'ml': "നിന്റെ ഉള്ളിൽ ഒരു കലാകാരൻ ഉണ്ട്. എനിക്ക് തോന്നുന്നുണ്ട്.",
        'gu': "તારામાં એક કલાકાર છે. મને ફીલ થઈ રહ્યું છે.",
        'mr': "तुझ्यात एक कलाकार आहे. मला जाणवतंय.",
        'pa': "ਤੇਰੇ ਅੰਦਰ ਇੱਕ ਕਲਾਕਾਰ ਹੈ. ਮੈਨੂੰ ਮਹਿਸੂਸ ਹੋ ਰਿਹਾ.",
        'ur': "تیرے اندر ایک فنکار ہے. مجھے محسوس ہو رہا ہے.",
        'ne': "तिम्रो भित्र एक कलाकार छ. मलाई महसुस भइरहेको छ.",
        'or': "ତୋ ଭିତରେ ଗୋଟିଏ କଳାକାର ଅଛି. ମୋତେ ଅନୁଭବ ହେଉଛି.",
        'as': "তোৰ ভিতৰত এজন শিল্পী আছে. মই অনুভৱ কৰিছোঁ.",
        'sa': "तव अन्तः एकः कलाकारः अस्ति. अहम् अनुभवामि.",
        'es': "Un creador de corazón. Lo puedo sentir.",
        'fr': "Un créateur dans l'âme. Je le sens.",
        'ja': "心にクリエイターがいるね。感じるよ。",
        'ko': "마음속에 창작자가 있어. 느껴져.",
        'zh': "你骨子里是个创造者。我能感觉到。",
        'de': "Ein Schöpfer im Herzen. Das spüre ich.",
        'it': "Un creatore nel cuore. Lo sento.",
        'ru': "Творец в душе. Я это чувствую.",
        'pt': "Um criador de coração. Eu consigo sentir isso.",
        'ar': "مبدع من القلب. أستطيع أن أشعر بذلك.",
    },
    'ack_reading_learning': {
        'en': "Curious minds are my favourite kind.",
        'ta': "க்யூரியஸ்-ஆ இருக்குற பீப்பிள் எனக்கு ரொம்ப ஃபேவரிட்.",
        'hi': "क्यूरियस माइंड्स मुझे सबसे ज़्यादा पसंद हैं.",
        'bn': "কৌতূহলী মন আমার সবচেয়ে প্রিয়.",
        'te': "ఆసక్తిగా ఉండేవాళ్ళు నాకు చాలా ఇష్టం.",
        'kn': "ಕುತೂಹಲಿ ಮನಸ್ಸು ನನಗೆ ಅತ್ಯಂತ ಇಷ್ಟ.",
        'ml': "ജിജ്ഞാസുക്കൾ എനിക്ക് ഏറ്റവും ഇഷ്ടം.",
        'gu': "જિજ્ઞાસુ મન મને સૌથી વધુ ગમે છે.",
        'mr': "जिज्ञासू मन मला सगळ्यात जास्त आवडतं.",
        'pa': "ਜਿਗਿਆਸੂ ਮਨ ਮੈਨੂੰ ਸਭ ਤੋਂ ਵੱਧ ਪਸੰਦ ਹੈ.",
        'ur': "جستجو والا ذہن مجھے سب سے زیادہ پسند ہے.",
        'ne': "जिज्ञासु मन मलाई सबभन्दा मन पर्छ.",
        'or': "ଜିଜ୍ଞାସୁ ମନ ମୋ ସବୁଠାରୁ ପ୍ରିୟ.",
        'as': "কৌতূহলী মন মোৰ সকলোতকৈ প্ৰিয়.",
        'sa': "जिज्ञासु मनः मम सर्वप्रियम्.",
        'es': "Las mentes curiosas son mis favoritas.",
        'fr': "Les esprits curieux sont mes préférés.",
        'ja': "好奇心旺盛な人が一番好きだよ。",
        'ko': "호기심 많은 사람이 제일 좋아.",
        'zh': "好奇的心灵是我最喜欢的。",
        'de': "Neugierige Köpfe sind meine Liebsten.",
        'it': "Le menti curiose sono le mie preferite.",
        'ru': "Любопытные умы — мои любимые.",
        'pt': "Mentes curiosas são minhas favoritas.",
        'ar': "العقول الفضولية هي المفضلة لدي.",
    },
    'ack_building_coding': {
        'en': "A builder. We're going to make incredible things.",
        'ta': "ஒரு பில்டர்-ஆ! நாம சேர்ந்து செம கிரேஸி-ஆ பில்ட் பண்ணலாம்.",
        'hi': "बिल्डर! हम मिलके कमाल करेंगे.",
        'bn': "একজন বিল্ডার! আমরা একসাথে দারুণ কিছু তৈরি করব.",
        'te': "ఒక బిల్డర్! మనం కలిసి అద్భుతాలు చేద్దాం.",
        'kn': "ಒಬ್ಬ ಬಿಲ್ಡರ್! ನಾವು ಸೇರಿ ಅದ್ಭುತ ಮಾಡೋಣ.",
        'ml': "ഒരു ബിൽഡർ! നമ്മൾ ചേർന്ന് അത്ഭുതങ്ങൾ ചെയ്യാം.",
        'gu': "એક બિલ્ડર! આપણે સાથે મળીને કમાલ કરીશું.",
        'mr': "एक बिल्डर! आपण मिळून कमाल करू.",
        'pa': "ਇੱਕ ਬਿਲਡਰ! ਅਸੀਂ ਮਿਲ ਕੇ ਕਮਾਲ ਕਰਾਂਗੇ.",
        'ur': "ایک بلڈر! ہم مل کر کمال کریں گے.",
        'ne': "एक बिल्डर! हामी मिलेर अद्भुत काम गर्नेछौं.",
        'or': "ଗୋଟିଏ ବିଲ୍ଡର! ଆମେ ମିଶି ଅଦ୍ଭୁତ କରିବା.",
        'as': "এজন বিল্ডাৰ! আমি একেলগে অসাধাৰণ কাম কৰিম.",
        'sa': "एकः निर्माता! वयं मिलित्वा अद्भुतं करिष्यामः.",
        'es': "Un constructor. Vamos a hacer cosas increíbles.",
        'fr': "Un bâtisseur. On va créer des choses incroyables.",
        'ja': "ビルダーだね！一緒にすごいもの作ろう。",
        'ko': "빌더구나! 우리 같이 대단한 걸 만들자.",
        'zh': "一个建造者！我们要一起做出不可思议的东西。",
        'de': "Ein Erbauer. Wir werden unglaubliche Dinge schaffen.",
        'it': "Un costruttore. Faremo cose incredibili insieme.",
        'ru': "Строитель. Мы создадим невероятные вещи.",
        'pt': "Um construtor. Vamos criar coisas incríveis juntos.",
        'ar': "بنّاء. سنصنع أشياء مذهلة معًا.",
    },
    'ack_people_stories': {
        'en': "The world needs more people who listen. Like you.",
        'ta': "லிசன் பண்ற பீப்பிள் ரொம்ப ரேர். நீ அந்த டைப்.",
        'hi': "सुनने वाले बहुत कम होते हैं. तू वैसा है.",
        'bn': "শোনার মানুষ খুব কম. তুই সেই রকম.",
        'te': "వినేవాళ్ళు చాలా తక్కువ. నువ్వు ఆ టైప్.",
        'kn': "ಕೇಳುವವರು ತುಂಬಾ ಕಡಿಮೆ. ನೀನು ಆ ಟೈಪ್.",
        'ml': "കേൾക്കുന്നവർ വളരെ കുറവാണ്. നീ ആ ടൈപ് ആണ്.",
        'gu': "સાંભળનારા બહુ ઓછા હોય છે. તું એવો છે.",
        'mr': "ऐकणारे खूप कमी असतात. तू तसा आहेस.",
        'pa': "ਸੁਣਨ ਵਾਲੇ ਬਹੁਤ ਘੱਟ ਹੁੰਦੇ ਨੇ. ਤੂੰ ਉਹਨਾਂ ਵਿੱਚੋਂ ਹੈਂ.",
        'ur': "سننے والے بہت کم ہوتے ہیں. تو ایسا ہے.",
        'ne': "सुन्ने मान्छे धेरै कम हुन्छन्. तिमी त्यस्तै हौ.",
        'or': "ଶୁଣୁଥିବା ଲୋକ ବହୁତ କମ. ତୁ ସେହି ରକମ.",
        'as': "শুনা মানুহ বৰ কম. তই সেই ধৰণৰ.",
        'sa': "श्रोतारः अत्यल्पाः. त्वम् तादृशः असि.",
        'es': "El mundo necesita más gente que escuche. Como tú.",
        'fr': "Le monde a besoin de plus de gens qui écoutent. Comme toi.",
        'ja': "聞く人ってすごく少ないんだよ。君はそういう人だね。",
        'ko': "듣는 사람은 정말 드물어. 너는 그런 사람이야.",
        'zh': "世界需要更多愿意倾听的人。像你一样。",
        'de': "Die Welt braucht mehr Menschen, die zuhören. Wie dich.",
        'it': "Il mondo ha bisogno di più persone che ascoltano. Come te.",
        'ru': "Миру нужно больше людей, которые слушают. Как ты.",
        'pt': "O mundo precisa de mais pessoas que ouvem. Como você.",
        'ar': "العالم يحتاج المزيد من الناس الذين يستمعون. مثلك.",
    },
    'ack_nature_movement': {
        'en': "There's something honest about that. I like it.",
        'ta': "அதுல ஒரு ஹானெஸ்டி இருக்கு. ஐ லைக் இட்.",
        'hi': "इसमें कुछ सच्चा है. अच्छा लगा.",
        'bn': "এতে একটা সততা আছে. আমার ভালো লাগলো.",
        'te': "అందులో ఏదో నిజాయితీ ఉంది. నాకు నచ్చింది.",
        'kn': "ಅದರಲ್ಲಿ ಏನೋ ಪ್ರಾಮಾಣಿಕತೆ ಇದೆ. ನನಗೆ ಇಷ್ಟ ಆಯ್ತು.",
        'ml': "അതിൽ ഒരു സത്യസന്ധത ഉണ്ട്. എനിക്ക് ഇഷ്ടമായി.",
        'gu': "એમાં કંઈક સાચું છે. મને ગમ્યું.",
        'mr': "त्यात काहीतरी सच्चं आहे. मला आवडलं.",
        'pa': "ਇਸ ਵਿੱਚ ਕੁਝ ਸੱਚਾ ਹੈ. ਮੈਨੂੰ ਪਸੰਦ ਆਇਆ.",
        'ur': "اس میں کچھ سچا ہے. مجھے اچھا لگا.",
        'ne': "त्यसमा केही सच्चाई छ. मलाई मन पर्यो.",
        'or': "ଏଥିରେ କିଛି ସତ୍ୟ ଅଛି. ମୋର ଭଲ ଲାଗିଲା.",
        'as': "ইয়াত কিবা এটা সঁচা আছে. মোৰ ভাল লাগিল.",
        'sa': "अत्र किमपि सत्यम् अस्ति. मम रोचते.",
        'es': "Hay algo honesto en eso. Me gusta.",
        'fr': "Il y a quelque chose d'honnête là-dedans. J'aime ça.",
        'ja': "そこに正直さを感じるよ。いいね。",
        'ko': "거기엔 뭔가 솔직한 게 있어. 좋아.",
        'zh': "这里面有种真诚。我喜欢。",
        'de': "Da ist etwas Ehrliches dran. Das gefällt mir.",
        'it': "C'è qualcosa di onesto in questo. Mi piace.",
        'ru': "В этом есть что-то честное. Мне нравится.",
        'pt': "Tem algo honesto nisso. Eu gosto.",
        'ar': "هناك شيء صادق في ذلك. أعجبني.",
    },
    'ack_games_strategy': {
        'en': "A strategist. Nothing gets past you, does it?",
        'ta': "ஒரு ஸ்ட்ராடஜிஸ்ட்-ஆ! உன் கண்ணை யாரும் ஏமாத்த முடியாது, இல்ல?",
        'hi': "स्ट्रैटजिस्ट! तेरी नज़र से कुछ बचता नहीं, है ना?",
        'bn': "একজন স্ট্র্যাটেজিস্ট! তোর চোখ কেউ ফাঁকি দিতে পারে না, তাই না?",
        'te': "ఒక స్ట్రాటజిస్ట్! నీ కన్ను ఎవరూ మోసం చేయలేరు, కదా?",
        'kn': "ಒಬ್ಬ ಸ್ಟ್ರಾಟಜಿಸ್ಟ್! ನಿನ್ನ ಕಣ್ಣು ಯಾರೂ ಮೋಸ ಮಾಡಕ್ಕಾಗಲ್ಲ, ಅಲ್ವಾ?",
        'ml': "ഒരു സ്ട്രാറ്റജിസ്റ്റ്! നിന്റെ കണ്ണ് ആരും കബളിപ്പിക്കാൻ പറ്റില്ല, അല്ലേ?",
        'gu': "એક સ્ટ્રેટેજિસ્ટ! તારી નજરથી કંઈ છટકતું નથી, ખરું ને?",
        'mr': "एक स्ट्रॅटजिस्ट! तुझ्या नजरेतून काही सुटत नाही, बरोबर ना?",
        'pa': "ਇੱਕ ਸਟ੍ਰੈਟਜਿਸਟ! ਤੇਰੀ ਨਜ਼ਰ ਤੋਂ ਕੁਝ ਬਚਦਾ ਨਹੀਂ, ਹੈ ਨਾ?",
        'ur': "ایک اسٹریٹجسٹ! تیری نظر سے کچھ نہیں بچتا، ہے نا?",
        'ne': "एक स्ट्रैटजिस्ट! तिम्रो नजरबाट केही छुट्दैन, है न?",
        'or': "ଗୋଟିଏ ଷ୍ଟ୍ରାଟେଜିଷ୍ଟ! ତୋ ନଜରରୁ କିଛି ବଞ୍ଚେ ନାହିଁ, ନା?",
        'as': "এজন ষ্ট্ৰেটেজিষ্ট! তোৰ চকুৰ পৰা একো সাৰি নাযায়, নহয়নে?",
        'sa': "एकः रणनीतिज्ञः! तव दृष्टेः किमपि न पलायते, किम्?",
        'es': "Un estratega. Nada se te escapa, ¿verdad?",
        'fr': "Un stratège. Rien ne t'échappe, n'est-ce pas?",
        'ja': "戦略家だね！君の目は何も見逃さないでしょ？",
        'ko': "전략가구나! 네 눈은 아무것도 놓치지 않지, 그치?",
        'zh': "一个策略家！什么都逃不过你的眼睛，对吧？",
        'de': "Ein Stratege. Dir entgeht nichts, oder?",
        'it': "Uno stratega. Niente ti sfugge, vero?",
        'ru': "Стратег. Ничто от тебя не ускользнёт, правда?",
        'pt': "Um estrategista. Nada escapa de você, né?",
        'ar': "استراتيجي. لا شيء يفلت من نظرك، أليس كذلك؟",
    },
}

# Fill missing ack translations with English fallback
_ACK_KEYS = ['ack_music_art', 'ack_reading_learning', 'ack_building_coding',
             'ack_people_stories', 'ack_nature_movement', 'ack_games_strategy']
for ack_key in _ACK_KEYS:
    for lang in ALL_LANGS:
        if lang not in LINES[ack_key]:
            LINES[ack_key][lang] = LINES[ack_key]['en']


# ════════════════════════════════════════════════════════════════════
# ENGINE IMPLEMENTATIONS
# ════════════════════════════════════════════════════════════════════

class F5Engine:
    """F5-TTS — Flow-matching voice cloner. 2GB VRAM, highest quality clone."""
    name = 'f5'

    def __init__(self, ref_voice=None):
        from f5_tts.api import F5TTS
        self.model = F5TTS(model='F5TTS_v1_Base', device='cuda')
        self.ref_voice = ref_voice or DEFAULT_REF_VOICE
        self.sr = self.model.target_sample_rate
        # Auto-transcribe reference audio once (cached by F5-TTS internally)
        self._ref_text = None

    def _get_ref_text(self):
        """Get reference text, transcribing once on first call."""
        if self._ref_text is None:
            # Let F5-TTS auto-transcribe by passing empty string on first call
            # We'll cache the result from the model's output
            self._ref_text = ''
        return self._ref_text

    def generate(self, text, output_path, **kwargs):
        wav, sr, spec = self.model.infer(
            ref_file=self.ref_voice,
            ref_text=self._get_ref_text(),
            gen_text=text,
            file_wave=output_path,
            speed=1.0,
        )


class ChatterboxTurboEngine:
    """Chatterbox Turbo — English, [laugh]/[chuckle] tags, voice cloning."""
    name = 'chatterbox_turbo'

    def __init__(self, ref_voice=None):
        import torchaudio
        from chatterbox.tts_turbo import ChatterboxTurboTTS
        self.torchaudio = torchaudio
        # Workaround: safetensors segfaults on sequential CUDA loads on Windows.
        # Force CPU load first, then .to(device) handles CUDA transfer.
        if sys.platform == 'win32':
            import safetensors.torch as _st
            _orig = _st.load_file
            _st.load_file = lambda path, device=None: _orig(path, device='cpu')
            try:
                self.model = ChatterboxTurboTTS.from_pretrained(device="cuda")
            finally:
                _st.load_file = _orig
        else:
            self.model = ChatterboxTurboTTS.from_pretrained(device="cuda")
        self.ref_voice = ref_voice or DEFAULT_REF_VOICE
        self.sr = self.model.sr

    def generate(self, text, output_path, **kwargs):
        wav = self.model.generate(text, audio_prompt_path=self.ref_voice)
        # Pad 0.3s silence to prevent chopped ending
        import torch as _t
        pad = _t.zeros(1, int(self.sr * 0.3), dtype=wav.dtype, device=wav.device)
        wav = _t.cat([wav, pad], dim=-1)
        self.torchaudio.save(output_path, wav, self.sr)


class ChatterboxMultilingualEngine:
    """Chatterbox Multilingual — 23 languages, voice cloning. Needs 16GB+ VRAM."""
    name = 'chatterbox_multilingual'

    def __init__(self, ref_voice=None):
        import torchaudio
        from chatterbox.tts import ChatterboxMultilingualTTS
        self.torchaudio = torchaudio
        self.model = ChatterboxMultilingualTTS.from_pretrained(device="cuda")
        self.ref_voice = ref_voice or DEFAULT_REF_VOICE
        self.sr = self.model.sr

    def generate(self, text, output_path, lang='en', **kwargs):
        wav = self.model.generate(text, audio_prompt_path=self.ref_voice, language_id=lang)
        self.torchaudio.save(output_path, wav, self.sr)


class IndicParlerEngine:
    """Indic Parler TTS — 21 Indic languages + English. Description-controlled voice."""
    name = 'indic_parler'

    def __init__(self, ref_voice=None):
        import numpy as _np
        import soundfile as _sf
        import torch
        self._torch, self._sf, self._np = torch, _sf, _np
        self.available = False
        try:
            from parler_tts import ParlerTTSForConditionalGeneration
            from transformers import AutoTokenizer
            device = 'cuda:0' if torch.cuda.is_available() else 'cpu'
            dtype = torch.float16 if device.startswith('cuda') else torch.float32
            self.model = ParlerTTSForConditionalGeneration.from_pretrained(
                'ai4bharat/indic-parler-tts', torch_dtype=dtype).to(device)
            self.tokenizer = AutoTokenizer.from_pretrained('ai4bharat/indic-parler-tts')
            self.desc_tokenizer = AutoTokenizer.from_pretrained(
                self.model.config.text_encoder._name_or_path)
            self.device = device
            self.sr = self.model.config.sampling_rate
            self.available = True
            print(f"  Indic Parler TTS loaded ({device}), sr={self.sr}")
        except Exception as e:
            print(f"  WARN: Indic Parler TTS load failed: {e}")

    def _get_description(self, lang):
        """Build voice description prompt for Indic Parler."""
        speaker = INDIC_PARLER_SPEAKERS.get(lang, 'Divya')
        lang_name = {
            'hi': 'Hindi', 'ta': 'Tamil', 'bn': 'Bengali', 'te': 'Telugu',
            'kn': 'Kannada', 'ml': 'Malayalam', 'gu': 'Gujarati', 'mr': 'Marathi',
            'pa': 'Punjabi', 'ur': 'Urdu', 'ne': 'Nepali', 'or': 'Odia',
            'as': 'Assamese', 'sa': 'Sanskrit', 'en': 'English',
            'mai': 'Maithili', 'mni': 'Manipuri', 'sd': 'Sindhi',
            'kok': 'Konkani', 'brx': 'Bodo', 'doi': 'Dogri', 'sat': 'Santali',
        }.get(lang, 'Hindi')
        return (
            f"{speaker} speaks in {lang_name} with a confident, clear and expressive voice "
            f"at a moderate pace. {speaker} delivers each word with energy and presence. "
            f"The recording is of very high quality with no background noise, the speaker's "
            f"voice is loud, clear and very close to the microphone."
        )

    def _generate_chunk(self, text, lang):
        """Generate audio for a single text chunk. Returns numpy array or None."""
        description = self._get_description(lang)
        desc_inputs = self.desc_tokenizer(description, return_tensors='pt').to(self.device)
        prompt_inputs = self.tokenizer(text, return_tensors='pt').to(self.device)

        # Scale max_new_tokens by text length — ~50 audio tokens per character
        char_count = len(text)
        max_tokens = max(3000, min(8000, char_count * 50))

        generation = self.model.generate(
            input_ids=desc_inputs.input_ids,
            attention_mask=desc_inputs.attention_mask,
            prompt_input_ids=prompt_inputs.input_ids,
            prompt_attention_mask=prompt_inputs.attention_mask,
            max_new_tokens=max_tokens,
        )
        return generation.cpu().float().numpy().squeeze()

    def _split_sentences(self, text):
        """Split text at real sentence boundaries, not mid-ellipsis or pause dots.

        Handles: "Hey... I was waiting. Give me something." → 2 chunks, not 3.
        Skips: "...", "..", standalone dots, comma-space.
        Splits on: ". " / "? " / "! " / "। " (Devanagari) / "৷ " (Bengali) only
        when preceded by a word character (letter/digit), not another dot.
        """
        import re
        # First, protect ellipsis patterns from being split
        # Replace "..." with a placeholder
        protected = text.replace('...', '\x00ELLIPSIS\x00')
        # Split on sentence-ending punctuation preceded by a word char, followed by space
        parts = re.split(r'(?<=[^\.\s])[.?!।৷]\s+', protected)
        # Restore ellipsis
        parts = [p.replace('\x00ELLIPSIS\x00', '...') for p in parts]
        # Merge very short fragments (< 20 chars) with previous chunk
        merged = []
        for p in parts:
            p = p.strip()
            if not p:
                continue
            if merged and len(merged[-1]) < 20:
                merged[-1] = merged[-1] + ' ' + p
            else:
                merged.append(p)
        # If last chunk is very short, merge it back
        if len(merged) > 1 and len(merged[-1]) < 15:
            merged[-2] = merged[-2] + ' ' + merged[-1]
            merged.pop()
        return merged if len(merged) > 1 else [text]

    def generate(self, text, output_path, lang='hi', **kwargs):
        if not self.available:
            return False

        np = self._np
        # For short text (< 80 chars), generate in one shot
        # For longer text, split into sentences to avoid end-clipping
        sentences = self._split_sentences(text) if len(text) > 80 else [text]

        if len(sentences) == 1:
            # Single chunk — straightforward
            audio = self._generate_chunk(text, lang)
        else:
            # Multi-chunk: generate each sentence, concatenate with 0.15s silence gap
            print(f"    Splitting into {len(sentences)} chunks to prevent clipping")
            chunks = []
            gap = np.zeros(int(self.sr * 0.15), dtype=np.float32)
            for i, sent in enumerate(sentences):
                print(f"      Chunk {i+1}/{len(sentences)}: {sent[:50]}...")
                chunk_audio = self._generate_chunk(sent, lang)
                if chunk_audio is not None and len(chunk_audio) > 0:
                    chunks.append(chunk_audio)
                    if i < len(sentences) - 1:
                        chunks.append(gap)
            audio = np.concatenate(chunks) if chunks else np.zeros(1, dtype=np.float32)

        # Pad 1.0s silence to prevent chopped ending
        pad = np.zeros(int(self.sr * 1.0), dtype=np.float32)
        audio = np.concatenate([audio, pad])
        # Peak-normalize to -1dB — Indic Parler outputs are often too quiet
        peak = np.abs(audio).max()
        if peak > 0:
            target_peak = 10 ** (-1.0 / 20)  # -1 dB
            audio = audio * (target_peak / peak)
        self._sf.write(output_path, audio, self.sr)
        return True


class CosyVoice3Engine:
    """CosyVoice 0.5B — 9 languages, zero-shot cloning, cross-lingual."""
    name = 'cosyvoice3'

    def __init__(self, ref_voice=None):
        self.available = False
        self._ref_voice = ref_voice or DEFAULT_REF_VOICE
        try:
            cosyvoice_dir = os.path.join(
                os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                '..', 'CosyVoice')
            # Try sibling directory first, then PycharmProjects
            if not os.path.isdir(cosyvoice_dir):
                cosyvoice_dir = os.path.join(
                    os.path.expanduser('~'), 'PycharmProjects', 'CosyVoice')
            if not os.path.isdir(cosyvoice_dir):
                print("  WARN: CosyVoice directory not found")
                return

            import sys as _sys
            if cosyvoice_dir not in _sys.path:
                _sys.path.insert(0, cosyvoice_dir)
                # Also add third_party for Matcha-TTS
                matcha = os.path.join(cosyvoice_dir, 'third_party', 'Matcha-TTS')
                if os.path.isdir(matcha) and matcha not in _sys.path:
                    _sys.path.insert(0, matcha)

            # AutoModel auto-detects CosyVoice/CosyVoice2/CosyVoice3 from YAML
            from cosyvoice.cli.cosyvoice import AutoModel
            model_dir = os.path.join(cosyvoice_dir, 'pretrained_models', 'CosyVoice3-0.5B')
            if not os.path.isdir(model_dir):
                # Download CosyVoice3 from HuggingFace
                from huggingface_hub import snapshot_download
                snapshot_download('FunAudioLLM/Fun-CosyVoice3-0.5B-2512',
                                  local_dir=model_dir)
            self.model = AutoModel(model_dir=model_dir)
            self.sr = self.model.sample_rate
            self.available = True
            print(f"  CosyVoice loaded from {os.path.basename(model_dir)}, sr={self.sr}")
        except Exception as e:
            print(f"  WARN: CosyVoice load failed: {e}")

    def generate(self, text, output_path, lang='es', **kwargs):
        if not self.available:
            return False
        try:
            import torchaudio
            ref = self._ref_voice
            # CosyVoice3 requires <|endofprompt|> token in text for cross-lingual
            cv3_text = f'You are a helpful assistant.<|endofprompt|>{text}'
            # Cross-lingual with reference voice (best for non-English)
            if ref and os.path.isfile(ref):
                for chunk in self.model.inference_cross_lingual(
                        cv3_text, ref, stream=False):
                    audio = chunk['tts_speech']
                    # Pad 0.3s silence to prevent chopped ending
                    import torch as _t
                    pad = _t.zeros(1, int(self.sr * 0.3), dtype=audio.dtype, device=audio.device)
                    audio = _t.cat([audio, pad], dim=-1)
                    torchaudio.save(output_path, audio, self.sr)
                    return True
            else:
                # SFT inference without reference
                spks = self.model.list_available_spks()
                spk = spks[0] if spks else None
                if not spk:
                    print("    CosyVoice error: no speakers available for SFT")
                    return False
                for chunk in self.model.inference_sft(
                        cv3_text, spk, stream=False):
                    audio = chunk['tts_speech']
                    # Pad 0.3s silence to prevent chopped ending
                    import torch as _t
                    pad = _t.zeros(1, int(self.sr * 0.3), dtype=audio.dtype, device=audio.device)
                    audio = _t.cat([audio, pad], dim=-1)
                    torchaudio.save(output_path, audio, self.sr)
                    return True
        except Exception as e:
            print(f"    CosyVoice error: {e}")
            return False


# ════════════════════════════════════════════════════════════════════
# ENGINE LIFECYCLE MANAGER — loads one engine at a time for 8GB VRAM
# ════════════════════════════════════════════════════════════════════

class EngineManager:
    """Manages engine load/unload within VRAM budget."""

    def __init__(self, hw, ref_voice=None):
        self._hw = hw
        self._ref_voice = ref_voice
        self._loaded = {}  # engine_name -> instance
        self._lock = threading.Lock()

    def get(self, engine_name):
        """Get or load engine. Unloads others if VRAM is tight."""
        with self._lock:
            if engine_name in self._loaded:
                return self._loaded[engine_name]

            max_conc = self._hw.max_concurrent_engines()
            while len([n for n in self._loaded if ENGINE_CAPS.get(n, {}).get('vram_gb', 0) > 0]) >= max_conc:
                # Unload oldest GPU engine
                for name in list(self._loaded):
                    if ENGINE_CAPS.get(name, {}).get('vram_gb', 0) > 0:
                        self._unload(name)
                        break

            instance = self._create(engine_name)
            if instance:
                self._loaded[engine_name] = instance
            return instance

    def _create(self, engine_name):
        try:
            if engine_name == 'f5':
                return F5Engine(ref_voice=self._ref_voice)
            elif engine_name == 'chatterbox_turbo':
                return ChatterboxTurboEngine(ref_voice=self._ref_voice)
            elif engine_name == 'chatterbox_multilingual':
                return ChatterboxMultilingualEngine(ref_voice=self._ref_voice)
            elif engine_name == 'indic_parler':
                return IndicParlerEngine(ref_voice=self._ref_voice)
            elif engine_name == 'cosyvoice3':
                return CosyVoice3Engine(ref_voice=self._ref_voice)
        except Exception as e:
            print(f"  WARN: Failed to load {engine_name}: {e}")
        return None

    def _unload(self, engine_name):
        inst = self._loaded.pop(engine_name, None)
        if inst:
            del inst
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except Exception:
                pass
            print(f"  Unloaded {engine_name} (freed VRAM)")

    def release_all(self):
        for name in list(self._loaded):
            self._unload(name)


# ════════════════════════════════════════════════════════════════════
# WAV -> OGG CONVERSION
# ════════════════════════════════════════════════════════════════════

def wav_to_ogg(wav_path, ogg_path):
    """Convert WAV to OGG via ffmpeg. Returns True on success."""
    try:
        si, cf = None, 0
        if sys.platform == 'win32':
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            si.wShowWindow = 0
            cf = subprocess.CREATE_NO_WINDOW
        result = subprocess.run(
            ['ffmpeg', '-y', '-i', wav_path, '-c:a', 'libvorbis', '-q:a', '6', ogg_path],
            capture_output=True, timeout=30, startupinfo=si, creationflags=cf,
        )
        if result.returncode == 0 and os.path.exists(ogg_path):
            os.remove(wav_path)
            return True
    except (FileNotFoundError, subprocess.TimeoutExpired):
        pass
    return False


# ════════════════════════════════════════════════════════════════════
# WHISPER VERIFICATION — test generated audio against STT
# ════════════════════════════════════════════════════════════════════

_whisper_model = None

def _romanize(text):
    """Romanize text to ASCII for cross-script comparison."""
    try:
        from unidecode import unidecode
        return re.sub(r'[^a-z0-9]', '', unidecode(text).lower().strip())
    except ImportError:
        return re.sub(r'[^a-z0-9]', '', text.lower().strip())


def verify_with_whisper(audio_path, expected_text, expected_lang='en'):
    """Transcribe audio with faster-whisper and compare using romanized char similarity.

    Returns (transcript, detected_lang, similarity_ratio) tuple.
    Uses SequenceMatcher on romanized text to handle cross-script comparisons
    (e.g. Bengali text transcribed in Gujarati script by Whisper).
    """
    global _whisper_model
    try:
        from difflib import SequenceMatcher

        from faster_whisper import WhisperModel
        if _whisper_model is None:
            _whisper_model = WhisperModel('base', device='cpu', compute_type='int8')
        segments, info = _whisper_model.transcribe(audio_path)
        detected_lang = info.language
        transcript = ' '.join(seg.text.strip() for seg in segments).strip()

        # Romanized character-level similarity (handles cross-script transcription)
        exp_roman = _romanize(expected_text)
        got_roman = _romanize(transcript)
        if not exp_roman:
            return transcript, detected_lang, 0.0
        ratio = SequenceMatcher(None, exp_roman, got_roman).ratio()
        return transcript, detected_lang, ratio
    except Exception as e:
        return f"(whisper error: {e})", '??', -1.0


# ════════════════════════════════════════════════════════════════════
# GENERATION ORCHESTRATOR
# ════════════════════════════════════════════════════════════════════

def generate_all(languages=None, dry_run=False, single_line=None,
                 force_engine=None, ref_voice=None, verify=False):
    """Generate all voice lines with hardware-aware engine lifecycle."""

    hw = HardwareProfile()
    print(f"  Hardware: {hw}")
    print(f"  Max concurrent GPU engines: {hw.max_concurrent_engines()}")

    target_langs = languages or ALL_LANGS
    output_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              'landing-page', 'public', 'hart-voices')

    # Build task list grouped by engine
    engine_tasks = defaultdict(list)
    for lang in target_langs:
        eng = get_engine_for_lang(lang, hw, force_engine)
        line_items = [(single_line, LINES[single_line])] if single_line else list(LINES.items())
        for line_id, translations in line_items:
            text = translations.get(lang)
            if text:
                engine_tasks[eng].append((lang, line_id, text))

    # Dry run: show plan with capability details
    if dry_run:
        total = 0
        for eng, tasks in engine_tasks.items():
            cap = ENGINE_CAPS.get(eng, {})
            tags = cap.get('paralinguistic', []) + cap.get('emotion_tags', [])
            print(f"\n  [{cap.get('name', eng)}]  {len(tasks)} files")
            print(f"    VRAM: {cap.get('vram_gb', 0)}GB | Speed: {cap.get('speed', '?')}")
            print(f"    Quality: {cap.get('quality', '?')}")
            if tags:
                print(f"    Tags: {', '.join(tags)}")
            print(f"    Constraints: {cap.get('constraints', 'none')}")
            print(f"    Dream: {cap.get('dream', '')}")
            for lang, line_id, text in tasks:
                enriched = prepare_text(text[:50], line_id, eng)
                marker = " *" if enriched != text[:50] else ""
                print(f"      {lang}/{line_id}.ogg{marker}")
                total += 1
        print(f"\n  Would generate: {total} files (* = has paralinguistic/emotion tags)")
        return

    # Generate with engine lifecycle management
    ffmpeg_pool = ThreadPoolExecutor(max_workers=min(4, hw.cpu_cores))
    ffmpeg_futures = []
    mgr = EngineManager(hw, ref_voice=ref_voice)
    total = 0
    errors = 0
    _verify_results = {}
    t_start = time.time()

    try:
        for eng_name, tasks in engine_tasks.items():
            cap = ENGINE_CAPS.get(eng_name, {})
            langs_in_group = sorted(set(t[0] for t in tasks))
            print(f"\n{'='*60}")
            print(f"  {cap.get('name', eng_name)} | {', '.join(langs_in_group)} | {len(tasks)} files")
            print(f"{'='*60}")

            engine = mgr.get(eng_name)
            if not engine:
                print(f"  SKIP: engine unavailable, {len(tasks)} files not generated")
                errors += len(tasks)
                continue

            # Check engine availability
            if hasattr(engine, 'available') and not engine.available:
                print(f"  SKIP: {eng_name} not available, {len(tasks)} files skipped")
                errors += len(tasks)
                continue

            for i, (lang, line_id, text) in enumerate(tasks, 1):
                ogg_path = os.path.join(output_dir, lang, f'{line_id}.ogg')
                os.makedirs(os.path.dirname(ogg_path), exist_ok=True)
                wav_path = ogg_path.replace('.ogg', '.wav')

                # Inject paralinguistic/emotion tags for this engine
                enriched_text = prepare_text(text, line_id, eng_name)
                tag_marker = " [tagged]" if enriched_text != text else ""

                try:
                    t0 = time.time()

                    ok = engine.generate(enriched_text, wav_path, lang=lang)
                    if ok is False:
                        raise RuntimeError(f"{eng_name} generation failed")

                    elapsed = time.time() - t0

                    total += 1
                    # Verify BEFORE ffmpeg (which deletes the WAV)
                    verify_info = ""
                    if verify and os.path.exists(wav_path):
                        transcript, detected, ratio = verify_with_whisper(wav_path, text, lang)
                        if ratio >= 0:
                            status = "OK" if ratio >= 0.5 else "BAD" if ratio < 0.3 else "WEAK"
                            verify_info = f"  [{status} {ratio:.0%} det={detected}]"
                            if ratio < 0.5:
                                verify_info += f" -- '{transcript[:50]}'"
                            # Save to verification results for HTML report
                            if lang not in _verify_results:
                                _verify_results[lang] = {}
                            _verify_results[lang][line_id] = {
                                'text': transcript,
                                'detected_lang': detected,
                            }

                    # Queue ffmpeg conversion (non-blocking, deletes WAV after)
                    fut = ffmpeg_pool.submit(wav_to_ogg, wav_path, ogg_path)
                    ffmpeg_futures.append((fut, f'{lang}/{line_id}'))
                    print(f"  [{i}/{len(tasks)}] {lang}/{line_id}  ({elapsed:.1f}s){tag_marker}{verify_info}")

                except Exception as e:
                    print(f"  ERR {lang}/{line_id}: {e}")
                    errors += 1

                # Periodic VRAM cleanup
                if total % 15 == 0:
                    try:
                        import torch
                        if torch.cuda.is_available():
                            torch.cuda.empty_cache()
                    except Exception:
                        pass

        # Wait for ffmpeg conversions
        if ffmpeg_futures:
            print(f"\n  Converting {len(ffmpeg_futures)} files to OGG...")
            for fut, label in ffmpeg_futures:
                try:
                    ok = fut.result(timeout=60)
                    if not ok:
                        print(f"    WARN: ffmpeg failed for {label}")
                except Exception as e:
                    print(f"    WARN: ffmpeg error {label}: {e}")

    finally:
        mgr.release_all()
        ffmpeg_pool.shutdown(wait=False)

    elapsed_total = time.time() - t_start
    print(f"\n  Done: {total} generated, {errors} errors, {elapsed_total:.0f}s")

    # Write manifest.json for frontend preloader (merge with existing)
    manifest_path = os.path.join(output_dir, 'manifest.json')
    manifest = {}
    if os.path.isfile(manifest_path):
        try:
            with open(manifest_path) as f:
                manifest = json.load(f)
        except Exception:
            pass
    # Scan ALL lang dirs (not just target_langs) to catch everything
    for entry in os.listdir(output_dir):
        lang_dir = os.path.join(output_dir, entry)
        if os.path.isdir(lang_dir):
            ogg_files = sorted(f.replace('.ogg', '') for f in os.listdir(lang_dir) if f.endswith('.ogg'))
            if ogg_files:
                manifest[entry] = ogg_files
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    print(f"  Manifest: {manifest_path}")

    # Save verification results to hart_verification_results.json (merge with existing)
    if verify and _verify_results:
        results_path = os.path.join(os.path.dirname(output_dir), '..', '..', 'hart_verification_results.json')
        results_path = os.path.normpath(results_path)
        existing = {}
        if os.path.isfile(results_path):
            try:
                with open(results_path, encoding='utf-8') as f:
                    existing = json.load(f)
            except Exception:
                pass
        # Merge: update only the languages/lines we just verified
        for lang, lines in _verify_results.items():
            if lang not in existing:
                existing[lang] = {}
            existing[lang].update(lines)
        with open(results_path, 'w', encoding='utf-8') as f:
            json.dump(existing, f, ensure_ascii=False, indent=2)
        print(f"  Verification results saved: {results_path} ({sum(len(v) for v in _verify_results.values())} entries)")

        # Auto-rebuild HTML report
        try:
            verify_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'verify_hart_voices.py')
            if os.path.isfile(verify_script):
                import importlib.util
                spec = importlib.util.spec_from_file_location('verify_hart_voices', verify_script)
                vmod = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(vmod)
                vmod.build_html(existing, LINES)
                print("  HTML report auto-rebuilt")
        except Exception as e:
            print(f"  WARN: HTML rebuild failed: {e}")


# ════════════════════════════════════════════════════════════════════
# CLI
# ════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description='HART Voice Generation (Multi-Engine, Hardware-Aware)')
    parser.add_argument('--lang', type=str, help='Single language code (e.g., "ta")')
    parser.add_argument('--dry-run', action='store_true', help='Show plan without generating')
    parser.add_argument('--line', type=str, help='Single line ID (e.g., "greeting")')
    parser.add_argument('--engine', type=str,
                        choices=['f5', 'chatterbox_turbo', 'chatterbox_multilingual', 'indic_parler', 'cosyvoice3'],
                        help='Force a specific engine for all languages')
    parser.add_argument('--ref-voice', type=str, help='Reference voice file for cloning')
    parser.add_argument('--verify', action='store_true', help='Verify each output with faster-whisper STT')
    parser.add_argument('--caps', action='store_true', help='Print engine capabilities and exit')
    args = parser.parse_args()

    if args.caps:
        for name, cap in ENGINE_CAPS.items():
            print(f"\n  {cap['name']}")
            print(f"    VRAM: {cap['vram_gb']}GB | Speed: {cap['speed']} | Quality: {cap['quality']}")
            print(f"    Languages: {', '.join(sorted(cap['languages']))}")
            if cap['paralinguistic']:
                print(f"    Paralinguistic: {', '.join(cap['paralinguistic'])}")
            if cap['emotion_tags']:
                print(f"    Emotion tags: {', '.join(cap['emotion_tags'])}")
            print(f"    Voice cloning: {'yes' if cap['voice_cloning'] else 'no'}")
            print(f"    Constraints: {cap['constraints']}")
            print(f"    Dream: {cap['dream']}")
        return

    languages = [args.lang] if args.lang else None

    print("\nHART Voice Generation Pipeline")
    print(f"  Languages: {languages or 'ALL'}")
    print(f"  Engine: {args.engine or 'auto (best per language + hardware)'}")
    print("  Output: landing-page/public/hart-voices/{lang}/{id}.ogg\n")

    generate_all(
        languages=languages,
        dry_run=args.dry_run,
        single_line=args.line,
        force_engine=args.engine,
        ref_voice=args.ref_voice,
        verify=args.verify,
    )


if __name__ == '__main__':
    main()
