"""
Parametric tests for missing API key detection in LLM responses.

Covers every indicator phrase × every known service keyword,
plus edge cases (empty, None, partial matches, false positives).
"""
import os
import sys

import pytest

PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from routes.chatbot_routes import (
    _KEY_NAME_MAP,
    _MISSING_KEY_INDICATORS,
    _detect_missing_key_in_response,
)


# ==========================================================================
# 1. Every indicator must trigger detection
# ==========================================================================
@pytest.mark.parametrize('indicator', _MISSING_KEY_INDICATORS)
def test_indicator_triggers_detection(indicator):
    """Each indicator phrase must be detected."""
    text = f"Error: {indicator} for the requested service."
    result = _detect_missing_key_in_response(text)
    assert result is not None, f"Indicator not detected: '{indicator}'"


@pytest.mark.parametrize('indicator', _MISSING_KEY_INDICATORS)
def test_indicator_case_insensitive(indicator):
    text = f"Error: {indicator.upper()} for service."
    result = _detect_missing_key_in_response(text)
    assert result is not None, f"Uppercase indicator not detected: '{indicator.upper()}'"


# ==========================================================================
# 2. Every service keyword maps to correct key
# ==========================================================================
@pytest.mark.parametrize('keyword,expected', [
    ('google', 'GOOGLE_API_KEY'),
    ('serp', 'SERPAPI_API_KEY'),
    ('news', 'NEWS_API_KEY'),
    # google_cse matches 'google' first → returns GOOGLE_API_KEY (dict iteration order)
    ('google_cse', 'GOOGLE_API_KEY'),
    ('openai', 'OPENAI_API_KEY'),
])
def test_service_keyword_maps_to_key(keyword, expected):
    text = f"Error: API key not found for {keyword} service."
    result = _detect_missing_key_in_response(text)
    assert result is not None
    assert result['key_name'] == expected, f"Expected {expected}, got {result['key_name']}"


# ==========================================================================
# 3. Key info structure
# ==========================================================================
@pytest.mark.parametrize('keyword', _KEY_NAME_MAP.keys())
def test_key_info_has_all_fields(keyword):
    info = _KEY_NAME_MAP[keyword]
    assert 'key_name' in info, f"{keyword} missing key_name"
    assert 'label' in info, f"{keyword} missing label"
    assert 'description' in info, f"{keyword} missing description"
    assert 'used_by' in info, f"{keyword} missing used_by"


@pytest.mark.parametrize('keyword', _KEY_NAME_MAP.keys())
def test_key_name_is_uppercase(keyword):
    """Key names should be UPPERCASE_WITH_UNDERSCORES (env var format)."""
    key_name = _KEY_NAME_MAP[keyword]['key_name']
    assert key_name == key_name.upper(), f"{keyword}: key_name '{key_name}' must be UPPERCASE"


@pytest.mark.parametrize('keyword', _KEY_NAME_MAP.keys())
def test_label_is_human_readable(keyword):
    label = _KEY_NAME_MAP[keyword]['label']
    assert len(label) >= 5, f"{keyword}: label too short: '{label}'"


# ==========================================================================
# 4. Unknown service → UNKNOWN_KEY fallback
# ==========================================================================
UNKNOWN_TRIGGERS = [
    "API key not found for some unknown service.",
    "Error: api key is required to use this feature.",
    "Please set your api key in the configuration.",
    "Missing API key — cannot proceed.",
]

@pytest.mark.parametrize('text', UNKNOWN_TRIGGERS)
def test_unknown_service_returns_unknown_key(text):
    result = _detect_missing_key_in_response(text)
    assert result is not None
    assert result['key_name'] == 'UNKNOWN_KEY'


# ==========================================================================
# 5. False positives — normal text must NOT trigger
# ==========================================================================
FALSE_POSITIVES = [
    "Hello, how are you today?",
    "The weather is nice.",
    "Here is your search result.",
    "I found 5 articles about AI.",
    "Let me help you with that math problem.",
    "The capital of France is Paris.",
    "Here's a recipe for chocolate cake.",
    "Python is a great programming language.",
    "",  # empty
    "key",  # has 'key' but not an indicator phrase
    "The API returned 200 OK.",
    "Authentication successful!",
]

@pytest.mark.parametrize('text', FALSE_POSITIVES)
def test_false_positive_returns_none(text):
    result = _detect_missing_key_in_response(text)
    assert result is None, f"False positive on: '{text}'"


# ==========================================================================
# 6. None input
# ==========================================================================
def test_none_input():
    assert _detect_missing_key_in_response(None) is None


def test_empty_string():
    assert _detect_missing_key_in_response('') is None


# ==========================================================================
# 7. Indicator count
# ==========================================================================
def test_at_least_5_indicators():
    assert len(_MISSING_KEY_INDICATORS) >= 5

def test_at_least_4_key_mappings():
    assert len(_KEY_NAME_MAP) >= 4

def test_indicators_are_lowercase():
    for ind in _MISSING_KEY_INDICATORS:
        assert ind == ind.lower(), f"Indicator must be lowercase: '{ind}'"
