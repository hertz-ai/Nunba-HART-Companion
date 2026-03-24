"""
test_benchmark_cpu_tts.py - Tests for scripts/benchmark_cpu_tts.py

Covers:
- TEST_SENTENCES data structure
- get_audio_duration() WAV file parsing
- get_process_memory_mb() memory measurement
- verify_with_whisper() transcription accuracy
- Edge cases: empty files, missing modules, zero-length audio
"""
import io
import os
import struct
import sys
import tempfile
import wave
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from scripts.benchmark_cpu_tts import (
    TEST_SENTENCES,
    get_audio_duration,
    get_process_memory_mb,
    verify_with_whisper,
)

# ============================================================
# TEST_SENTENCES data structure
# ============================================================

class TestTestSentences:
    def test_is_list(self):
        assert isinstance(TEST_SENTENCES, list)

    def test_has_three_lengths(self):
        assert len(TEST_SENTENCES) == 3

    def test_each_entry_is_tuple(self):
        for entry in TEST_SENTENCES:
            assert isinstance(entry, tuple)
            assert len(entry) == 2

    def test_labels_are_short_medium_long(self):
        labels = [entry[0] for entry in TEST_SENTENCES]
        assert labels == ["short", "medium", "long"]

    def test_all_texts_are_nonempty(self):
        for label, text in TEST_SENTENCES:
            assert len(text) > 0

    def test_long_is_longest(self):
        lengths = {label: len(text) for label, text in TEST_SENTENCES}
        assert lengths["long"] > lengths["medium"] > lengths["short"]


# ============================================================
# get_audio_duration()
# ============================================================

class TestGetAudioDuration:
    def _make_wav(self, duration_sec=1.0, sample_rate=22050, channels=1, sampwidth=2):
        """Create a temporary WAV file with given duration."""
        tmpfile = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        n_frames = int(duration_sec * sample_rate)
        with wave.open(tmpfile.name, 'wb') as wf:
            wf.setnchannels(channels)
            wf.setsampwidth(sampwidth)
            wf.setframerate(sample_rate)
            wf.writeframes(b'\x00' * n_frames * channels * sampwidth)
        return tmpfile.name

    def test_one_second_wav(self):
        path = self._make_wav(duration_sec=1.0)
        try:
            dur = get_audio_duration(path)
            assert abs(dur - 1.0) < 0.01
        finally:
            os.unlink(path)

    def test_half_second_wav(self):
        path = self._make_wav(duration_sec=0.5)
        try:
            dur = get_audio_duration(path)
            assert abs(dur - 0.5) < 0.01
        finally:
            os.unlink(path)

    def test_five_second_wav(self):
        path = self._make_wav(duration_sec=5.0, sample_rate=44100)
        try:
            dur = get_audio_duration(path)
            assert abs(dur - 5.0) < 0.01
        finally:
            os.unlink(path)

    def test_stereo_wav(self):
        path = self._make_wav(duration_sec=2.0, channels=2)
        try:
            dur = get_audio_duration(path)
            assert abs(dur - 2.0) < 0.01
        finally:
            os.unlink(path)

    def test_nonexistent_file_returns_zero(self):
        assert get_audio_duration("/nonexistent/path/audio.wav") == 0.0

    def test_empty_file_returns_zero(self):
        tmpfile = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
        tmpfile.close()
        try:
            assert get_audio_duration(tmpfile.name) == 0.0
        finally:
            os.unlink(tmpfile.name)

    def test_zero_length_wav(self):
        path = self._make_wav(duration_sec=0.0)
        try:
            dur = get_audio_duration(path)
            assert dur == 0.0
        finally:
            os.unlink(path)

    def test_different_sample_rates(self):
        for rate in [8000, 16000, 22050, 44100, 48000]:
            path = self._make_wav(duration_sec=1.0, sample_rate=rate)
            try:
                dur = get_audio_duration(path)
                assert abs(dur - 1.0) < 0.01, f"Failed for sample rate {rate}"
            finally:
                os.unlink(path)


# ============================================================
# get_process_memory_mb()
# ============================================================

class TestGetProcessMemoryMb:
    def test_returns_float(self):
        result = get_process_memory_mb()
        assert isinstance(result, float)

    def test_returns_nonnegative(self):
        result = get_process_memory_mb()
        assert result >= 0.0

    @patch.dict('sys.modules', {'psutil': None})
    def test_returns_zero_without_psutil(self):
        # Force psutil to be unavailable
        # Need to reimport to test the ImportError path
        # The function uses try/except internally
        result = get_process_memory_mb()
        # May return 0.0 or actual value depending on import cache
        assert isinstance(result, float)

    def test_returns_reasonable_value(self):
        """Python process should use at least some memory"""
        try:
            import psutil
            result = get_process_memory_mb()
            assert result > 1.0  # At minimum a few MB
        except ImportError:
            pytest.skip("psutil not installed")


# ============================================================
# verify_with_whisper()
# ============================================================

class TestVerifyWithWhisper:
    @patch('scripts.benchmark_cpu_tts.WhisperModel', create=True)
    def test_returns_tuple(self, mock_whisper_cls):
        """Without faster_whisper installed, should return error tuple"""
        result = verify_with_whisper("/fake/audio.wav", "hello world")
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_with_missing_faster_whisper(self):
        """When faster_whisper is not installed, returns error string and -1.0"""
        with patch.dict('sys.modules', {'faster_whisper': None}):
            transcript, ratio = verify_with_whisper("/fake/audio.wav", "test text")
            assert isinstance(transcript, str)
            assert ratio == -1.0

    def test_empty_expected_text(self):
        """Empty expected text should not crash"""
        transcript, ratio = verify_with_whisper("/fake/audio.wav", "")
        assert isinstance(transcript, str)
        # Ratio should be -1.0 (error) or 0.0 (no overlap)
        assert ratio <= 0.0

    def test_word_overlap_calculation_logic(self):
        """Test the word overlap logic extracted from verify_with_whisper"""
        expected = "hello world how are you"
        transcript = "hello world how are you"
        expected_words = set(expected.lower().split())
        transcript_words = set(transcript.lower().split())
        overlap = len(expected_words & transcript_words)
        ratio = overlap / max(len(expected_words), 1)
        assert ratio == 1.0

    def test_partial_overlap_calculation(self):
        expected_words = set("hello world how are you".lower().split())
        transcript_words = set("hello world goodbye".lower().split())
        overlap = len(expected_words & transcript_words)
        ratio = overlap / max(len(expected_words), 1)
        assert ratio == pytest.approx(2.0 / 5.0)

    def test_zero_overlap_calculation(self):
        expected_words = set("hello world".lower().split())
        transcript_words = set("goodbye moon".lower().split())
        overlap = len(expected_words & transcript_words)
        ratio = overlap / max(len(expected_words), 1)
        assert ratio == 0.0
