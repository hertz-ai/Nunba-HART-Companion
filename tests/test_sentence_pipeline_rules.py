"""
Deep functional tests for SentencePipeline — TTS streaming sentence splitter.

Tests INTENDED BEHAVIOR:
- Splits on sentence boundaries (. ! ? newline)
- Doesn't split on abbreviations (Mr. Dr. etc.)
- Feed token-by-token accumulates buffer
- Flush emits remaining buffer
- Short fragments (<3 chars) are discarded
- Callback receives synthesized audio path + text
- Handles empty input gracefully
"""
import os
import sys
from unittest.mock import MagicMock

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from tts.tts_engine import SentencePipeline


# ==========================================================================
# 1. Sentence Boundary Detection
# ==========================================================================
class TestBoundaryDetection:
    def test_period_triggers_sentence(self):
        sentences = []
        synth = MagicMock(return_value='/tmp/audio.wav')
        cb = MagicMock()
        pipe = SentencePipeline(synth, on_audio_ready=cb)
        pipe.feed('Hello world.')
        pipe.wait()
        synth.assert_called_once()

    def test_exclamation_triggers_sentence(self):
        synth = MagicMock(return_value='/tmp/audio.wav')
        pipe = SentencePipeline(synth)
        pipe.feed('Wow!')
        pipe.wait()
        synth.assert_called_once()

    def test_question_triggers_sentence(self):
        synth = MagicMock(return_value='/tmp/audio.wav')
        pipe = SentencePipeline(synth)
        pipe.feed('How are you?')
        pipe.wait()
        synth.assert_called_once()

    def test_newline_in_boundaries_constant(self):
        """Newline is in BOUNDARIES set (used for mid-text splits)."""
        assert '\n' in SentencePipeline.BOUNDARIES

    def test_no_boundary_no_submit(self):
        synth = MagicMock()
        pipe = SentencePipeline(synth)
        pipe.feed('Hello world')
        pipe.wait()
        synth.assert_not_called()


# ==========================================================================
# 2. Abbreviation Handling
# ==========================================================================
class TestAbbreviationHandling:
    ABBREVS = ['Mr.', 'Mrs.', 'Dr.', 'vs.', 'etc.', 'i.e.', 'e.g.']

    def test_mr_does_not_split(self):
        synth = MagicMock()
        pipe = SentencePipeline(synth)
        pipe.feed('Talk to Mr.')
        pipe.wait()
        synth.assert_not_called()  # Should NOT trigger on abbreviation

    def test_dr_does_not_split(self):
        synth = MagicMock()
        pipe = SentencePipeline(synth)
        pipe.feed('Dr.')
        pipe.wait()
        synth.assert_not_called()

    def test_etc_does_not_split(self):
        synth = MagicMock()
        pipe = SentencePipeline(synth)
        pipe.feed('apples, oranges, etc.')
        pipe.wait()
        synth.assert_not_called()

    def test_eg_does_not_split(self):
        synth = MagicMock()
        pipe = SentencePipeline(synth)
        pipe.feed('e.g.')
        pipe.wait()
        synth.assert_not_called()

    def test_known_abbreviations_list(self):
        assert SentencePipeline.ABBREVS == {'mr.', 'mrs.', 'dr.', 'vs.', 'etc.', 'i.e.', 'e.g.'}


# ==========================================================================
# 3. Token-by-Token Feeding
# ==========================================================================
class TestTokenFeeding:
    def test_accumulates_tokens(self):
        synth = MagicMock()
        pipe = SentencePipeline(synth)
        for char in 'Hello':
            pipe.feed(char)
        pipe.wait()
        synth.assert_not_called()
        assert 'Hello' in pipe._buffer

    def test_triggers_on_period_after_tokens(self):
        synth = MagicMock(return_value='/tmp/a.wav')
        pipe = SentencePipeline(synth)
        for char in 'Hello world.':
            pipe.feed(char)
        pipe.wait()
        synth.assert_called_once()
        assert pipe._buffer.strip() == ''

    def test_multiple_sentences(self):
        synth = MagicMock(return_value='/tmp/a.wav')
        pipe = SentencePipeline(synth)
        pipe.feed('First sentence. ')
        pipe.feed('Second sentence!')
        pipe.wait()
        assert synth.call_count == 2


# ==========================================================================
# 4. Flush
# ==========================================================================
class TestFlush:
    def test_flush_emits_remaining(self):
        synth = MagicMock(return_value='/tmp/a.wav')
        pipe = SentencePipeline(synth)
        pipe.feed('Incomplete sentence without period')
        pipe.flush()
        pipe.wait()
        synth.assert_called_once()

    def test_flush_clears_buffer(self):
        synth = MagicMock(return_value='/tmp/a.wav')
        pipe = SentencePipeline(synth)
        pipe.feed('Some text')
        pipe.flush()
        assert pipe._buffer.strip() == ''

    def test_flush_empty_buffer_no_submit(self):
        synth = MagicMock()
        pipe = SentencePipeline(synth)
        pipe.flush()
        pipe.wait()
        synth.assert_not_called()

    def test_flush_short_text_discarded(self):
        synth = MagicMock()
        pipe = SentencePipeline(synth)
        pipe.feed('Hi')
        pipe.flush()
        pipe.wait()
        synth.assert_not_called()  # "Hi" is <= 2 chars


# ==========================================================================
# 5. Short Fragment Filtering
# ==========================================================================
class TestShortFragments:
    def test_single_char_discarded(self):
        synth = MagicMock()
        pipe = SentencePipeline(synth)
        pipe.feed('.')
        pipe.wait()
        synth.assert_not_called()

    def test_two_char_discarded(self):
        synth = MagicMock()
        pipe = SentencePipeline(synth)
        pipe.feed('OK')
        pipe.flush()
        pipe.wait()
        synth.assert_not_called()

    def test_three_char_kept(self):
        synth = MagicMock(return_value='/tmp/a.wav')
        pipe = SentencePipeline(synth)
        pipe.feed('Yes')
        pipe.flush()
        pipe.wait()
        synth.assert_called_once()


# ==========================================================================
# 6. Callback
# ==========================================================================
class TestCallback:
    def test_callback_called_with_path_and_text(self):
        cb = MagicMock()
        synth = MagicMock(return_value='/tmp/audio.wav')
        pipe = SentencePipeline(synth, on_audio_ready=cb)
        pipe.feed('Hello world.')
        pipe.wait()
        cb.assert_called_once()
        args = cb.call_args[0]
        assert args[0] == '/tmp/audio.wav'  # path
        assert 'Hello world' in args[1]  # text

    def test_no_callback_no_crash(self):
        synth = MagicMock(return_value='/tmp/audio.wav')
        pipe = SentencePipeline(synth, on_audio_ready=None)
        pipe.feed('Test sentence.')
        pipe.wait()
        # Should not crash even without callback


# ==========================================================================
# 7. Boundary Constants
# ==========================================================================
class TestBoundaryConstants:
    def test_boundaries_are_set(self):
        assert isinstance(SentencePipeline.BOUNDARIES, set)

    def test_period_in_boundaries(self):
        assert '.' in SentencePipeline.BOUNDARIES

    def test_exclamation_in_boundaries(self):
        assert '!' in SentencePipeline.BOUNDARIES

    def test_question_in_boundaries(self):
        assert '?' in SentencePipeline.BOUNDARIES

    def test_newline_in_boundaries(self):
        assert '\n' in SentencePipeline.BOUNDARIES

    def test_comma_not_in_boundaries(self):
        """Comma is NOT a sentence boundary."""
        assert ',' not in SentencePipeline.BOUNDARIES
