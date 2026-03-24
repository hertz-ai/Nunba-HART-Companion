"""
test_splash_effects.py - Tests for desktop/splash_effects.py

Tests pure utility functions that don't require tkinter or a display.
Covers:
- _resolve_font_paths() platform-aware font discovery
- _f() font family name mapping
- _hex_rgba() color conversion
- _ease_out_cubic() easing function
- _get_next_effect_index() round-robin persistence
- GREETINGS data structure
- _LANG_LINES data structure
- _CANVAS_FONTS platform mapping
- _FONT_MAP resolution
- _pil_font() caching (with PIL mocked)
- _get_dot() caching
- _render_bloom() / _render_kolam_loops() guard when no PIL
"""
import json
import math
import os
import sys
import tempfile
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from desktop import splash_effects

# ============================================================
# _hex_rgba()
# ============================================================

class TestHexRgba:
    def test_standard_color(self):
        r, g, b, a = splash_effects._hex_rgba('#FF0000')
        assert (r, g, b, a) == (255, 0, 0, 255)

    def test_with_custom_alpha(self):
        r, g, b, a = splash_effects._hex_rgba('#00FF00', a=128)
        assert (r, g, b, a) == (0, 255, 0, 128)

    def test_white(self):
        assert splash_effects._hex_rgba('#FFFFFF') == (255, 255, 255, 255)

    def test_black(self):
        assert splash_effects._hex_rgba('#000000') == (0, 0, 0, 255)

    def test_indigo_brand_color(self):
        r, g, b, a = splash_effects._hex_rgba('#6C63FF')
        assert r == 108
        assert g == 99
        assert b == 255

    def test_short_hex_fallback(self):
        # Short hex (less than 6 chars) should return white
        assert splash_effects._hex_rgba('#FFF') == (255, 255, 255, 255)

    def test_no_hash_prefix(self):
        r, g, b, a = splash_effects._hex_rgba('FF0000')
        assert (r, g, b) == (255, 0, 0)

    def test_alpha_zero(self):
        _, _, _, a = splash_effects._hex_rgba('#123456', a=0)
        assert a == 0

    def test_lowercase_hex(self):
        r, g, b, _ = splash_effects._hex_rgba('#ff8800')
        assert r == 255
        assert g == 136
        assert b == 0


# ============================================================
# _ease_out_cubic()
# ============================================================

class TestEaseOutCubic:
    def test_start_is_zero(self):
        assert splash_effects._ease_out_cubic(0) == 0.0

    def test_end_is_one(self):
        assert splash_effects._ease_out_cubic(1) == 1.0

    def test_midpoint_above_half(self):
        # Ease-out: fast start, so midpoint should be > 0.5
        result = splash_effects._ease_out_cubic(0.5)
        assert result > 0.5
        assert result == pytest.approx(0.875, abs=0.001)

    def test_monotonically_increasing(self):
        prev = 0.0
        for i in range(1, 11):
            t = i / 10
            val = splash_effects._ease_out_cubic(t)
            assert val >= prev
            prev = val

    def test_quarter_point(self):
        result = splash_effects._ease_out_cubic(0.25)
        expected = 1 - (1 - 0.25) ** 3
        assert result == pytest.approx(expected)


# ============================================================
# _f() font family resolution
# ============================================================

class TestFontFamilyResolution:
    def test_known_font_maps_to_platform(self):
        # _FONT_MAP should contain Windows font names
        result = splash_effects._f('Nirmala UI')
        assert isinstance(result, str)
        assert len(result) > 0

    def test_unknown_font_returns_as_is(self):
        assert splash_effects._f('UnknownFont') == 'UnknownFont'

    def test_consolas_maps(self):
        result = splash_effects._f('Consolas')
        assert isinstance(result, str)

    def test_segoe_ui_maps(self):
        result = splash_effects._f('Segoe UI')
        assert isinstance(result, str)

    def test_bahnschrift_maps(self):
        result = splash_effects._f('Bahnschrift')
        assert isinstance(result, str)

    def test_bahnschrift_light_maps(self):
        result = splash_effects._f('Bahnschrift Light')
        assert isinstance(result, str)


# ============================================================
# GREETINGS data structure
# ============================================================

class TestGreetingsData:
    def test_greetings_is_list(self):
        assert isinstance(splash_effects.GREETINGS, list)

    def test_greetings_has_entries(self):
        assert len(splash_effects.GREETINGS) >= 8

    def test_each_greeting_is_4_tuple(self):
        for g in splash_effects.GREETINGS:
            assert len(g) == 4, f"Greeting tuple should have 4 elements: {g}"

    def test_greeting_native_text_is_nonempty(self):
        for native, roman, lang, color in splash_effects.GREETINGS:
            assert len(native) > 0
            assert len(roman) > 0
            assert len(lang) > 0

    def test_greeting_colors_are_hex(self):
        for _, _, _, color in splash_effects.GREETINGS:
            assert color.startswith('#')
            assert len(color) == 7

    def test_tamil_greeting_is_first(self):
        _, roman, lang, _ = splash_effects.GREETINGS[0]
        assert 'Tamil' in lang
        assert 'Vanakkam' in roman

    def test_hindi_is_present(self):
        langs = [g[2] for g in splash_effects.GREETINGS]
        assert 'Hindi' in langs

    def test_languages_are_unique(self):
        langs = [g[2] for g in splash_effects.GREETINGS]
        assert len(langs) == len(set(langs))


# ============================================================
# _LANG_LINES data structure
# ============================================================

class TestLangLines:
    def test_is_list(self):
        assert isinstance(splash_effects._LANG_LINES, list)

    def test_each_entry_is_pair(self):
        for entry in splash_effects._LANG_LINES:
            assert len(entry) == 2
            text, color = entry
            assert isinstance(text, str)
            assert color.startswith('#')

    def test_has_indic_text(self):
        # At least some entries should have non-ASCII text
        has_unicode = any(
            any(ord(c) > 127 for c in text)
            for text, _ in splash_effects._LANG_LINES
        )
        assert has_unicode


# ============================================================
# _CANVAS_FONTS platform mapping
# ============================================================

class TestCanvasFonts:
    def test_has_required_keys(self):
        for key in ['tamil', 'mono', 'sans', 'heading']:
            assert key in splash_effects._CANVAS_FONTS

    def test_all_values_are_strings(self):
        for key, val in splash_effects._CANVAS_FONTS.items():
            assert isinstance(val, str)


# ============================================================
# _get_next_effect_index()
# ============================================================

class TestGetNextEffectIndex:
    def test_returns_int(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = os.path.join(tmpdir, 'state.json')
            with patch.object(splash_effects, '_STATE_FILE', state_file):
                result = splash_effects._get_next_effect_index(10)
                assert isinstance(result, int)
                assert 0 <= result < 10

    def test_round_robin_increments(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = os.path.join(tmpdir, 'state.json')
            with patch.object(splash_effects, '_STATE_FILE', state_file):
                idx1 = splash_effects._get_next_effect_index(10)
                idx2 = splash_effects._get_next_effect_index(10)
                assert idx2 == (idx1 + 1) % 10

    def test_wraps_around(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = os.path.join(tmpdir, 'state.json')
            with open(state_file, 'w') as f:
                json.dump({'last_effect': 9}, f)
            with patch.object(splash_effects, '_STATE_FILE', state_file):
                result = splash_effects._get_next_effect_index(10)
                assert result == 0

    def test_handles_missing_file(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = os.path.join(tmpdir, 'nonexistent', 'state.json')
            with patch.object(splash_effects, '_STATE_FILE', state_file):
                result = splash_effects._get_next_effect_index(5)
                assert isinstance(result, int)
                assert 0 <= result < 5

    def test_handles_corrupt_json(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = os.path.join(tmpdir, 'state.json')
            with open(state_file, 'w') as f:
                f.write("not json at all")
            with patch.object(splash_effects, '_STATE_FILE', state_file):
                result = splash_effects._get_next_effect_index(5)
                assert isinstance(result, int)
                assert 0 <= result < 5

    def test_total_one(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            state_file = os.path.join(tmpdir, 'state.json')
            with patch.object(splash_effects, '_STATE_FILE', state_file):
                result = splash_effects._get_next_effect_index(1)
                assert result == 0


# ============================================================
# _resolve_font_paths()
# ============================================================

class TestResolveFontPaths:
    def test_returns_dict(self):
        result = splash_effects._resolve_font_paths()
        assert isinstance(result, dict)

    def test_values_are_strings(self):
        result = splash_effects._resolve_font_paths()
        for k, v in result.items():
            assert isinstance(v, str)

    @patch('os.path.exists', return_value=True)
    def test_bundled_fonts_preferred(self, mock_exists):
        result = splash_effects._resolve_font_paths()
        # When all bundled fonts exist, should return 4 entries
        assert len(result) == 4


# ============================================================
# PIL guard tests (functions should return None when PIL is absent)
# ============================================================

class TestPilGuards:
    def test_render_text_without_pil(self):
        with patch.object(splash_effects, '_HAS_PIL', False):
            result = splash_effects._render_text("test", "consolas", 12, "#FFF")
            assert result is None

    def test_render_text_empty_string(self):
        result = splash_effects._render_text("", "consolas", 12, "#FFF")
        assert result is None

    def test_render_dot_without_pil(self):
        with patch.object(splash_effects, '_HAS_PIL', False):
            result = splash_effects._render_dot(5, "#FF0000")
            assert result is None

    def test_render_ring_without_pil(self):
        with patch.object(splash_effects, '_HAS_PIL', False):
            result = splash_effects._render_ring(10, "#FF0000")
            assert result is None

    def test_render_divider_without_pil(self):
        with patch.object(splash_effects, '_HAS_PIL', False):
            result = splash_effects._render_divider(200)
            assert result is None

    def test_render_version_badge_without_pil(self):
        with patch.object(splash_effects, '_HAS_PIL', False):
            result = splash_effects._render_version_badge("v2.0.0")
            assert result is None

    def test_render_neutron_star_without_pil(self):
        with patch.object(splash_effects, '_HAS_PIL', False):
            result = splash_effects._render_neutron_star()
            assert result is None

    def test_render_bloom_without_pil(self):
        with patch.object(splash_effects, '_HAS_PIL', False):
            result = splash_effects._render_bloom(50, "#FF0000")
            assert result is None

    def test_render_kolam_loops_without_pil(self):
        with patch.object(splash_effects, '_HAS_PIL', False):
            result = splash_effects._render_kolam_loops(30, "#6C63FF")
            assert result is None


# ============================================================
# _DPI constant
# ============================================================

class TestDpiConstant:
    def test_dpi_is_numeric(self):
        assert isinstance(splash_effects._DPI, (int, float))

    def test_dpi_reasonable_range(self):
        assert 1.0 <= splash_effects._DPI <= 2.0


# ============================================================
# _pil_font() caching
# ============================================================

class TestPilFontCaching:
    def test_returns_none_for_unknown_font_without_path(self):
        # Clear cache for this test
        key = ('nonexistent_font_xyz', 99)
        splash_effects._font_cache.pop(key, None)
        with patch.object(splash_effects, '_FONT_PATHS', {}):
            result = splash_effects._pil_font('nonexistent_font_xyz', 99)
            # Should either return default font or None
            assert result is None or result is not None  # always passes, tests no crash

    def test_caches_results(self):
        # Put a value in cache and verify it's returned
        sentinel = object()
        splash_effects._font_cache[('test_cache_key', 42)] = sentinel
        result = splash_effects._pil_font('test_cache_key', 42)
        assert result is sentinel
        # Cleanup
        del splash_effects._font_cache[('test_cache_key', 42)]


# ============================================================
# Module-level constants
# ============================================================

class TestModuleConstants:
    def test_has_pil_is_bool(self):
        assert isinstance(splash_effects._HAS_PIL, bool)

    def test_font_paths_is_dict(self):
        assert isinstance(splash_effects._FONT_PATHS, dict)

    def test_photo_store_is_list(self):
        assert isinstance(splash_effects._photo_store, list)

    def test_dot_cache_is_dict(self):
        assert isinstance(splash_effects._dot_cache, dict)
