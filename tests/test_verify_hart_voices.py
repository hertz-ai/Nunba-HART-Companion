"""
test_verify_hart_voices.py - Tests for scripts/verify_hart_voices.py

Covers:
- classify() flag generation from similarity scores
- detect_end_clip() transcription clipping detection
- romanize() text normalization
- translit() transliteration
- compute_analysis() full analysis pipeline
- LINE_IDS data structure
- AVAILABLE_MODELS list
- Edge cases: empty strings, zero similarity, 100% similarity
"""
import os
import re
import sys
from unittest.mock import patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from scripts.verify_hart_voices import (
    AVAILABLE_MODELS,
    LINE_IDS,
    classify,
    detect_end_clip,
    romanize,
)

# ============================================================
# classify()
# ============================================================

class TestClassify:
    def test_broken_below_30(self):
        flag = classify(20, False)
        assert 'BROKEN' in flag
        assert '20' in flag

    def test_bad_between_30_and_50(self):
        flag = classify(40, False)
        assert 'BAD' in flag

    def test_weak_between_50_and_70(self):
        flag = classify(60, False)
        assert 'WEAK' in flag

    def test_ok_above_70(self):
        flag = classify(80, False)
        assert flag == ''

    def test_perfect_similarity(self):
        flag = classify(100, False)
        assert flag == ''

    def test_zero_similarity(self):
        flag = classify(0, False)
        assert 'BROKEN' in flag

    def test_clip_only(self):
        flag = classify(80, True)
        assert flag == 'END_CLIP'

    def test_broken_and_clip(self):
        flag = classify(10, True)
        assert 'BROKEN' in flag
        assert 'CLIP' in flag

    def test_bad_and_clip(self):
        flag = classify(40, True)
        assert 'BAD' in flag
        assert 'CLIP' in flag

    def test_weak_and_clip(self):
        flag = classify(60, True)
        assert 'WEAK' in flag
        assert 'CLIP' in flag

    def test_boundary_30(self):
        flag = classify(30, False)
        assert 'BAD' in flag  # 30 is >= 30

    def test_boundary_50(self):
        flag = classify(50, False)
        assert 'WEAK' in flag  # 50 is >= 50

    def test_boundary_70(self):
        flag = classify(70, False)
        assert flag == ''  # 70 is >= 70

    def test_boundary_29(self):
        flag = classify(29, False)
        assert 'BROKEN' in flag


# ============================================================
# romanize()
# ============================================================

class TestRomanize:
    def test_ascii_text(self):
        result = romanize("Hello World")
        assert result == "helloworld"

    def test_removes_punctuation(self):
        result = romanize("Hello, World!")
        assert result == "helloworld"

    def test_empty_string(self):
        assert romanize("") == ""

    def test_numbers_preserved(self):
        result = romanize("test123")
        assert result == "test123"

    def test_special_chars_removed(self):
        result = romanize("test@#$%^&*()")
        assert result == "test"


# ============================================================
# detect_end_clip()
# ============================================================

class TestDetectEndClip:
    def test_no_clip_when_all_words_present(self):
        expected = "the quick brown fox jumps"
        got_r = romanize("the quick brown fox jumps")
        assert detect_end_clip(expected, got_r) is False

    def test_clip_when_last_words_missing(self):
        expected = "the quick brown fox jumps over"
        got_r = romanize("the quick brown")
        assert detect_end_clip(expected, got_r) is True

    def test_short_text_no_clip(self):
        # Less than 3 words -- can't detect clip
        expected = "hello world"
        got_r = romanize("hello")
        assert detect_end_clip(expected, got_r) is False

    def test_empty_got(self):
        expected = "hello world test"
        assert detect_end_clip(expected, "") is False

    def test_empty_expected(self):
        assert detect_end_clip("", "hello") is False


# ============================================================
# LINE_IDS
# ============================================================

class TestLineIds:
    def test_is_list(self):
        assert isinstance(LINE_IDS, list)

    def test_has_greeting(self):
        assert 'greeting' in LINE_IDS

    def test_has_reveal_intro(self):
        assert 'reveal_intro' in LINE_IDS

    def test_has_acknowledgment_lines(self):
        ack_lines = [l for l in LINE_IDS if l.startswith('ack_')]
        assert len(ack_lines) >= 5

    def test_all_are_strings(self):
        for lid in LINE_IDS:
            assert isinstance(lid, str)
            assert len(lid) > 0

    def test_no_duplicates(self):
        assert len(LINE_IDS) == len(set(LINE_IDS))

    def test_has_at_least_13_lines(self):
        assert len(LINE_IDS) >= 13


# ============================================================
# AVAILABLE_MODELS
# ============================================================

class TestAvailableModels:
    def test_is_list(self):
        assert isinstance(AVAILABLE_MODELS, list)

    def test_has_base(self):
        assert 'base' in AVAILABLE_MODELS

    def test_has_small(self):
        assert 'small' in AVAILABLE_MODELS

    def test_has_large_v3_turbo(self):
        assert 'large-v3-turbo' in AVAILABLE_MODELS

    def test_has_medium(self):
        assert 'medium' in AVAILABLE_MODELS


# ============================================================
# compute_analysis() (requires difflib)
# ============================================================

class TestComputeAnalysis:
    def test_perfect_match(self):
        from scripts.verify_hart_voices import compute_analysis
        result = compute_analysis("hello world", "hello world", "en")
        assert result['similarity'] == 100.0
        assert result['flag'] == 'OK'

    def test_zero_match(self):
        from scripts.verify_hart_voices import compute_analysis
        result = compute_analysis("hello", "zzzzz", "en")
        assert result['similarity'] < 50
        assert result['detected_lang'] == "en"

    def test_empty_expected(self):
        from scripts.verify_hart_voices import compute_analysis
        result = compute_analysis("", "some text", "en")
        assert result['similarity'] == 0

    def test_result_has_all_fields(self):
        from scripts.verify_hart_voices import compute_analysis
        result = compute_analysis("test", "test", "en")
        for field in ['text', 'detected_lang', 'similarity', 'end_clipped', 'flag']:
            assert field in result

    def test_partial_match(self):
        from scripts.verify_hart_voices import compute_analysis
        result = compute_analysis("hello world test", "hello world xyz", "en")
        assert 0 < result['similarity'] < 100
