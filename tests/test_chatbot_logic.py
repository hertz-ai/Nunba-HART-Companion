"""
Functional tests for chatbot_routes.py pure logic functions.

Tests intent detection, resource extraction, missing key detection,
match_options, session management patterns, and template data validation.
"""
import json
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
    _extract_resource_request,
    match_options,
)

# Intent classification (create_agent, channel_connect, casual, correction)
# lives in the HARTOS Qwen3.5-0.8B draft-first classifier — there is no
# Python-level detector in routes/chatbot_routes.py for any of these. The
# old TestCreateAgentIntent / TestCreateAgentExactSet classes exercised a
# deleted helper (_detect_create_agent_intent) and have been removed; the
# draft-first unit tests in HARTOS test_draft_first_dispatch.py are the
# new canonical coverage. test_chatbot_routes.py::TestIntentClassifiersAreDraftOnly
# locks the guard that prevents the hardcoded symbols from coming back.


# ==========================================================================
# 2. Resource Request Extraction
# ==========================================================================
class TestExtractResourceRequest:
    """_extract_resource_request: parse RESOURCE_REQUEST:{json} markers."""

    def test_valid_resource_request(self):
        text = 'Some text RESOURCE_REQUEST:{"__SECRET_REQUEST__": true, "key_name": "GOOGLE_API_KEY"}'
        result = _extract_resource_request(text)
        assert result is not None
        assert result['key_name'] == 'GOOGLE_API_KEY'
        assert result['triggered_by'] == 'agent_request_resource'

    def test_no_marker(self):
        assert _extract_resource_request('hello world') is None

    def test_empty_string(self):
        assert _extract_resource_request('') is None

    def test_none_input(self):
        assert _extract_resource_request(None) is None

    def test_invalid_json(self):
        text = 'RESOURCE_REQUEST:{broken json'
        assert _extract_resource_request(text) is None

    def test_missing_secret_flag(self):
        text = 'RESOURCE_REQUEST:{"key_name": "TEST"}'
        result = _extract_resource_request(text)
        assert result is None  # __SECRET_REQUEST__ must be true

    def test_secret_flag_removed(self):
        text = 'RESOURCE_REQUEST:{"__SECRET_REQUEST__": true, "key_name": "X"}'
        result = _extract_resource_request(text)
        assert '__SECRET_REQUEST__' not in result

    def test_marker_at_end(self):
        text = 'I need an API key. RESOURCE_REQUEST:{"__SECRET_REQUEST__": true, "key": "val"}'
        result = _extract_resource_request(text)
        assert result is not None


# ==========================================================================
# 3. Missing Key Detection
# ==========================================================================
class TestDetectMissingKey:
    """_detect_missing_key_in_response: detect API key issues in LLM output."""

    def test_google_api_key_missing(self):
        text = "Error: Google API key not found. Please configure your API key."
        result = _detect_missing_key_in_response(text)
        assert result is not None
        assert result['key_name'] == 'GOOGLE_API_KEY'

    def test_serp_api_key(self):
        text = "SerpAPI: API key is required to search the web."
        result = _detect_missing_key_in_response(text)
        assert result is not None
        assert result['key_name'] == 'SERPAPI_API_KEY'

    def test_openai_key(self):
        text = "OpenAI: authentication failed. Invalid API key."
        result = _detect_missing_key_in_response(text)
        assert result is not None
        assert result['key_name'] == 'OPENAI_API_KEY'

    def test_news_key(self):
        text = "News API key not found in environment."
        result = _detect_missing_key_in_response(text)
        assert result is not None
        assert result['key_name'] == 'NEWS_API_KEY'

    def test_unknown_key(self):
        text = "Some unknown service: API key not found."
        result = _detect_missing_key_in_response(text)
        assert result is not None
        assert result['key_name'] == 'UNKNOWN_KEY'

    def test_no_key_issue(self):
        text = "Here is the weather forecast for today."
        result = _detect_missing_key_in_response(text)
        assert result is None

    def test_empty_text(self):
        assert _detect_missing_key_in_response('') is None

    def test_none_text(self):
        assert _detect_missing_key_in_response(None) is None

    def test_all_indicators_work(self):
        for indicator in _MISSING_KEY_INDICATORS:
            text = f"Error: {indicator} for some service"
            result = _detect_missing_key_in_response(text)
            assert result is not None, f"Indicator not detected: {indicator}"

    def test_key_map_has_required_keys(self):
        assert 'google' in _KEY_NAME_MAP
        assert 'serp' in _KEY_NAME_MAP
        assert 'openai' in _KEY_NAME_MAP
        assert 'news' in _KEY_NAME_MAP

    def test_key_info_structure(self):
        for key, info in _KEY_NAME_MAP.items():
            assert 'key_name' in info
            assert 'label' in info
            assert 'description' in info
            assert 'used_by' in info


# ==========================================================================
# 4. match_options
# ==========================================================================
class TestMatchOptions:
    """match_options: prefix + text matching for conversation flow."""

    def test_basic_match(self):
        result = match_options("learn", "I want to learn python")
        # Should return something (str or None)
        assert isinstance(result, (str, type(None)))

    def test_empty_text(self):
        result = match_options("learn", "")
        assert isinstance(result, (str, type(None)))

    def test_empty_prefix(self):
        result = match_options("", "hello")
        assert isinstance(result, (str, type(None)))


# ==========================================================================
# 5. Template Data Validation
# ==========================================================================
class TestTemplateData:
    """Verify template.json is loaded and has expected structure."""

    def test_template_data_loaded(self):
        from routes.chatbot_routes import template_data
        assert isinstance(template_data, dict)

    def test_abusive_responses_exist(self):
        from routes.chatbot_routes import abusive
        assert isinstance(abusive, list)
        assert len(abusive) > 0

    def test_greet_responses_exist(self):
        from routes.chatbot_routes import greet
        assert isinstance(greet, list)
        assert len(greet) > 0

    def test_learn_responses_exist(self):
        from routes.chatbot_routes import learn
        assert isinstance(learn, list)

    def test_initial_labels(self):
        from routes.chatbot_routes import intital_labels
        assert isinstance(intital_labels, list)
        assert 'greet' in intital_labels
        assert 'abusive language' in intital_labels
        assert len(intital_labels) >= 10


# ==========================================================================
# 7. Config Data Validation
# ==========================================================================
class TestConfigData:
    def test_config_loaded(self):
        from routes.chatbot_routes import config_data
        assert isinstance(config_data, dict)

    def test_context_len_positive(self):
        from routes.chatbot_routes import CONTEXT_LEN
        assert CONTEXT_LEN > 0
        assert isinstance(CONTEXT_LEN, int)
