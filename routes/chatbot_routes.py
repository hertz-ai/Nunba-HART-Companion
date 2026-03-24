"""
chatbot_routes.py - Chatbot route implementations

This module provides chat and prompt routes that integrate with the hart-backend
(pip-installable package) for full LangChain-powered chat capabilities.

The module supports:
1. Direct hart-backend integration (pip installed)
2. Adapter/proxy mode for remote backend
3. Local fallback for offline operation
"""

import datetime
import hmac
import inspect
import json
import logging
import os
import random
import sys
import time
from collections import deque
from functools import wraps

import requests
from flask import jsonify, request

from models.catalog import ModelType

# Initialize logger
logger = logging.getLogger(__name__)


def _require_local_or_token(f):
    """
    Decorator to protect sensitive endpoints (D4 fix).
    Allows access if:
    1. Request comes from localhost (127.0.0.1 or ::1)
    2. Valid API token is provided in Authorization header
    """
    @wraps(f)
    def decorated_function(*args, **kwargs):
        remote_addr = request.remote_addr
        is_local = remote_addr in ('127.0.0.1', '::1', 'localhost')
        if is_local:
            return f(*args, **kwargs)

        # Check for API token from environment
        api_token = os.environ.get('NUNBA_API_TOKEN', '')
        if api_token:
            auth_header = request.headers.get('Authorization', '')
            if auth_header.startswith('Bearer '):
                token = auth_header[7:]
                if hmac.compare_digest(token, api_token):
                    return f(*args, **kwargs)

        return jsonify({
            'error': 'Unauthorized',
            'message': 'This endpoint requires local access or valid API token'
        }), 401
    return decorated_function


# ============== Try to import hart-backend ==============
HEVOLVE_CHAT_AVAILABLE = False
HEVOLVE_PROMPTS_AVAILABLE = False

# Import hart-backend adapter (handles both direct and proxy modes)
# NOTE: Don't import hart_intelligence directly - it modifies sys.stdout/stderr
# on Windows which can cause I/O errors if the import fails partway through
try:
    from routes.hartos_backend_adapter import chat as hevolve_chat
    from routes.hartos_backend_adapter import drain_thinking_traces, get_prompts
    from routes.hartos_backend_adapter import zeroshot as hevolve_zeroshot
    HEVOLVE_CHAT_AVAILABLE = True
    HEVOLVE_PROMPTS_AVAILABLE = True
    logger.info("hart-backend adapter available")
except Exception as e:
    logger.exception(f"hartos_backend_adapter import failed in chatbot routes: {e}")

# Load configuration files
# Load configuration files
if getattr(sys, 'frozen', False):
    script_dir = os.path.dirname(sys.executable)
else:
    # chatbot_routes.py lives in routes/ — config files are at project root (one level up)
    script_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

config_path = os.path.join(script_dir, 'config.json')
template_path = os.path.join(script_dir, 'template.json')

try:
    with open(config_path) as config_file:
        config_data = json.load(config_file)
    logger.info("Config file loaded successfully")
except Exception as e:
    logger.error(f"Failed to load config.json: {e}")
    config_data = {"IP_ADDRESS": {}}

try:
    with open(template_path) as template_file:
        template_data = json.load(template_file)
    logger.info("Template file loaded successfully")
except Exception as e:
    logger.error(f"Failed to load template.json: {e}")
    template_data = {}

# Global session storage (in-memory for now - TODO: replace with persistent storage)
import threading

_sessions_lock = threading.Lock()
sessions = {}
custom_sessions = {}

# Agent creation intent detection — exact phrase match only.
# Fuzzy/substring matching removed. The LLM's Create_Agent tool handles
# paraphrases, ambiguous cases, and negation naturally via reasoning.
# This is just a fast-path for obvious unambiguous phrases.
_CREATE_AGENT_EXACT = {
    'create an agent', 'create agent', 'build an agent', 'build agent',
    'make an agent', 'create a new agent', 'train an agent', 'train agent',
    'i want a new agent', 'i want an agent', 'i want to create',
    'i need a new agent', 'i need an agent', 'new agent',
}

def _detect_create_agent_intent(text):
    """Exact phrase match only — no fuzzy substring matching.

    The LLM handles everything else via the Create_Agent tool description.
    This just short-circuits the obvious cases for speed (0ms vs 2s LLM call).
    """
    text_lower = text.lower().strip()
    # Only match if the ENTIRE message is the intent (or starts with it)
    # "create an agent that does X" → match (starts with exact phrase)
    # "can you create an agent" → no match (let LLM handle)
    for phrase in _CREATE_AGENT_EXACT:
        if text_lower.startswith(phrase):
            return True
    return False


# Agent-driven secret request detection
# The LangChain agent/tools dictate when secrets are needed — NOT fuzzy regex on user input.
# When a tool fails due to a missing API key, the agent's error response is detected here
# and a structured `secret_request` is injected into the response for the frontend to present
# a secure input screen. The agent can also return `secret_request` directly.
_MISSING_KEY_INDICATORS = [
    'api key not found', 'api key is required', 'missing api key',
    'set your api key', 'configure your api key', 'api_key not set',
    'authentication failed', 'invalid api key',
]

_KEY_NAME_MAP = {
    'google': {'key_name': 'GOOGLE_API_KEY', 'label': 'Google API Key',
               'description': 'Required for Google Search and Custom Search Engine.',
               'used_by': 'Google Search tool'},
    'serp': {'key_name': 'SERPAPI_API_KEY', 'label': 'SerpAPI Key',
             'description': 'Required for web search via SerpAPI.',
             'used_by': 'Web Search tool'},
    'news': {'key_name': 'NEWS_API_KEY', 'label': 'News API Key',
             'description': 'Required for fetching news articles.',
             'used_by': 'News tool'},
    'google_cse': {'key_name': 'GOOGLE_CSE_ID', 'label': 'Google Custom Search Engine ID',
                   'description': 'Custom Search Engine ID for Google web searches.',
                   'used_by': 'Google Search tool'},
    'openai': {'key_name': 'OPENAI_API_KEY', 'label': 'OpenAI API Key',
               'description': 'Required for OpenAI GPT models.',
               'used_by': 'OpenAI LLM'},
}


def _extract_resource_request(text):
    """Extract structured resource request from Request_Resource tool output.
    The tool embeds RESOURCE_REQUEST:{json} in its response. Returns dict or None."""
    if not text or 'RESOURCE_REQUEST:' not in text:
        return None
    try:
        marker_idx = text.index('RESOURCE_REQUEST:') + len('RESOURCE_REQUEST:')
        json_str = text[marker_idx:].strip()
        req = json.loads(json_str)
        if req.get('__SECRET_REQUEST__'):
            req.pop('__SECRET_REQUEST__', None)
            req['triggered_by'] = 'agent_request_resource'
            return req
    except (ValueError, json.JSONDecodeError) as e:
        logger.warning(f'Failed to parse RESOURCE_REQUEST marker: {e}')
    return None


def _detect_missing_key_in_response(text):
    """Check if LangChain response indicates a missing API key. Returns key info dict or None."""
    if not text:
        return None
    text_lower = text.lower()
    if not any(ind in text_lower for ind in _MISSING_KEY_INDICATORS):
        return None
    for keyword, info in _KEY_NAME_MAP.items():
        if keyword in text_lower:
            return info
    return {
        'key_name': 'UNKNOWN_KEY', 'label': 'API Key Required',
        'description': 'A tool requires an API key that is not yet configured.',
        'used_by': 'Unknown tool',
    }

# Configuration from config.json
CONTEXT_LEN = 2500
database_url = config_data.get('IP_ADDRESS', {}).get('database_url', 'http://localhost:6006')
zeroshot_url = config_data.get('IP_ADDRESS', {}).get('zeroshot_url', '')
zeroshot_2_url = config_data.get('IP_ADDRESS', {}).get('zeroshot_2_url', '')
vicuna_url = config_data.get('IP_ADDRESS', {}).get('vicuna_url', '')
gpt3_url = config_data.get('IP_ADDRESS', {}).get('gpt3_url', '')
gpt_langchain = config_data.get('IP_ADDRESS', {}).get('gpt_langchain', '')
minicpm_url = config_data.get('IP_ADDRESS', {}).get('minicpm_url', '')
qgen_url = config_data.get('IP_ADDRESS', {}).get('qgen_url', '')

# Templates from template.json
abusive = template_data.get('abusive', ["Please be respectful.", "Let's keep the conversation positive."])
greet = template_data.get('greet', ["Hello! How can I assist you today?"])
learn = template_data.get('learn', ["Can you please specify what do you want to learn?"])
revise = template_data.get('revise', ["Can you please specify what do you want to revise?"])

intital_labels = ["teach me", "abusive language", "topic listing", "explain", "don't know",
                  "learn", "revise", "change language", "question", "deny", "stop", "affirm", "goodbye", "greet"]


# ========== Helper Functions (Stubs) ==========

def error_handler(f):
    """Decorator for error handling"""
    from functools import wraps

    @wraps(f)
    async def decorated_function(*args, **kwargs):
        try:
            return await f(*args, **kwargs)
        except Exception as e:
            logger.error(f"An error occurred: {str(e)}")
            return jsonify({"error": str(e)}), 500

    return decorated_function


def zeroshot(input_text, labels, request_id=None):
    """
    Zero-shot classification using hart-backend or external API
    """
    logger.info(f'Zeroshot called with input: {input_text}')

    # Try hart-backend first
    if HEVOLVE_PROMPTS_AVAILABLE:
        try:
            result = hevolve_zeroshot(input_text, labels)
            if result and 'labels' in result:
                logger.info(f'Zeroshot (hevolve) result: {result}')
                return result
        except Exception as e:
            logger.warning(f'hart-backend zeroshot failed: {e}')

    # Fallback to configured URL
    if not zeroshot_url:
        logger.warning('Zeroshot URL not configured, returning default label')
        return {'labels': [labels[0] if labels else 'unknown'], 'scores': [0.8]}

    try:
        headers = {'Content-Type': 'application/json'}
        payload = {
            'text': input_text,
            'labels': labels
        }
        response = requests.post(zeroshot_url, headers=headers, json=payload, timeout=10)
        if response.status_code == 200:
            result = response.json()
            logger.info(f'Zeroshot result: {result}')
            return result
        else:
            logger.error(f'Zeroshot API error: {response.status_code}')
            return {'labels': [labels[0] if labels else 'unknown'], 'scores': [0.5]}
    except Exception as e:
        logger.error(f'Zeroshot exception: {e}')
        return {'labels': [labels[0] if labels else 'unknown'], 'scores': [0.5]}


def zeroshot2(input_text, labels, request_id=None):
    """
    Secondary zero-shot classification using external API
    """
    logger.info(f'Zeroshot2 called with input: {input_text}')

    if not zeroshot_2_url:
        logger.warning('Zeroshot2 URL not configured, returning default label')
        return {'labels': [labels[0] if labels else 'unknown'], 'scores': [0.8]}

    try:
        headers = {'Content-Type': 'application/json'}
        payload = {
            'text': input_text,
            'labels': labels
        }
        response = requests.post(zeroshot_2_url, headers=headers, json=payload, timeout=10)
        if response.status_code == 200:
            result = response.json()
            logger.info(f'Zeroshot2 result: {result}')
            return result
        else:
            logger.error(f'Zeroshot2 API error: {response.status_code}')
            return {'labels': [labels[0] if labels else 'unknown'], 'scores': [0.5]}
    except Exception as e:
        logger.error(f'Zeroshot2 exception: {e}')
        return {'labels': [labels[0] if labels else 'unknown'], 'scores': [0.5]}


def gpt_lang(message, user_id, prompt=None, prompt_id=None, timeout=120, probe=False, create_agent=False, custom_agent=False):
    """
    GPT with LangChain integration via hart-backend
    """
    logger.info(f'gpt_lang called for user {user_id}')

    # Extract the latest user message (and image_url if present)
    image_url = None
    try:
        history = []
        for i in list(message):
            history.append(i['content'])
            # Check if the latest message has an image attached
            if i.get('image_url'):
                image_url = i['image_url']
        user_text = history[-1] if history else ''
    except Exception as e:
        logger.error(f'Error extracting history: {e}')
        user_text = message[-1]['content'] if isinstance(message, list) else str(message)

    # If image is attached, get vision description and prepend to text
    if image_url:
        try:
            from routes.upload_routes import UPLOAD_DIR, _describe_image_via_llm
            # Resolve local path from /uploads/... URL
            rel = image_url.lstrip('/').replace('uploads/', '', 1)
            local_path = UPLOAD_DIR / rel
            if local_path.is_file():
                vision_desc = _describe_image_via_llm(str(local_path), "Describe this image in detail.")
                if vision_desc:
                    user_text = f"[Image attached — vision analysis: {vision_desc}]\n\n{user_text}"
                    logger.info(f'Vision context added for image: {image_url}')
        except Exception as ve:
            logger.warning(f'Vision inference skipped: {ve}')

    # Validate prompt_id — must be integer (DB column is int(11))
    if prompt_id is not None and not str(prompt_id).isdigit():
        logger.warning(f'gpt_lang: rejecting non-integer prompt_id={prompt_id}')
        prompt_id = None

    # Try hart-backend (direct or adapter)
    if HEVOLVE_CHAT_AVAILABLE:
        try:
            # Use hevolve_chat from adapter
            result = hevolve_chat(
                text=user_text,
                user_id=str(user_id),
                agent_id=prompt_id,
                request_id=str(sessions.get(user_id, {}).get('request_id', int(time.time())))
            )
            if result and not result.get('error'):
                response_text = result.get('text') or result.get('response')
                if response_text:
                    logger.info(f'hart-backend response: {response_text[:100]}...')
                    return response_text
        except Exception as e:
            logger.warning(f'hart-backend chat failed: {e}')

    # Fallback to configured GPT LangChain URL
    if not gpt_langchain:
        logger.warning('GPT LangChain URL not configured')
        return None

    headers = {'Content-Type': 'application/json'}
    data = {
        "user_id": user_id,
        "prompt": user_text,
        "request_id": sessions.get(user_id, {}).get('request_id', int(time.time())),
        "file_id": sessions.get(user_id, {}).get('file_id', 0),
        "tools": None,
        "prompt_id": prompt_id,
        "casual_conv": False,
        "probe": probe,
        "intermediate": False,
        "create_agent": create_agent
    }

    try:
        if custom_agent:
            timeout = 2500
        logger.info(f'Requesting GPT3.5 with langchain: {gpt_langchain}')
        res = requests.post(gpt_langchain, data=json.dumps(data), headers=headers, timeout=timeout).json()
        logger.info(f'LangChain response: {res}')
        return res.get('response', res.get('text', None))
    except Exception as e:
        logger.error(f'LangChain Error: {e}')
        return None


def casual_convo(message, user_id, prompt=None, gpt3=False, is_json=False):
    """
    Casual conversation using GPT API
    Full implementation requires GPT service
    """
    logger.info(f'casual_convo called for user {user_id}')

    if not gpt3_url:
        logger.warning('GPT3 URL not configured')
        return "I'm having trouble connecting. Please try again later."

    try:
        request_id = sessions.get(user_id, {}).get('request_id', int(time.time()))
        new_message = list(message)

        if prompt:
            new_message.insert(0, prompt)
        else:
            new_message.insert(0, {"role": "system", "content": "You are a helpful AI assistant."})

        headers = {'Content-Type': 'application/json'}

        if is_json:
            data = {
                "model": "gpt-4o",
                "data": new_message,
                "max_token": 500,
                "request_id": request_id
            }
            logger.info(f'Requesting GPT-4 JSON: {gpt3_url}gpt-json')
            res = requests.post(f'{gpt3_url}gpt-json', data=json.dumps(data), headers=headers, timeout=25).json()
        else:
            data = {
                "model": "gpt-4",
                "data": new_message,
                "max_token": 500,
                "request_id": request_id
            }
            logger.info(f'Requesting GPT-4: {gpt3_url}gpt-3-1000')
            res = requests.post(f'{gpt3_url}gpt-3-1000', data=json.dumps(data), headers=headers, timeout=25).json()

        return res.get('text', 'No response from GPT').strip()
    except Exception as e:
        logger.error(f'Casual convo exception: {e}')
        return "I encountered an error. Please try again."


def vicuna_bot(message, user_id, prompt=None, is_json=False, prompt_id=None, probe=False, create_agent=False, custom_agent=False):
    """
    Vicuna bot interaction using external API
    Complete implementation from original chatbot_pipeline
    """
    logger.info(f'Vicuna_bot called for user {user_id}')

    # First try GPT with LangChain
    x = gpt_lang(message, user_id, prompt, prompt_id, 120, probe, create_agent, custom_agent)
    if x is not None:
        return x

    # Extract conversation history
    logger.info(f'Message input: {message}')
    history = []
    try:
        for i in list(message):
            history.append(i['content'])
    except Exception as e:
        logger.error(f'Error extracting history: {e}')
        history = ['hi', 'Hello how can I assist you today']

    if not history[:-1]:
        history.insert(0, 'Hello how can I assist you today')
        history.insert(0, 'hi')

    # Try casual conversation with autogen timeout
    try:
        prompt_obj = {"role": "system", "content": "You are a helpful AI assistant with a timeout handler."}
        x = casual_convo(message, user_id=user_id, prompt=prompt_obj, is_json=is_json)
        if 'overloaded' not in x:
            return x
        else:
            raise ValueError("Server overloaded")
    except Exception as e:
        logger.info(f'Falling back to Vicuna API: {e}')

    # Fallback to Vicuna API
    if not vicuna_url:
        logger.warning('Vicuna URL not configured, returning default response')
        return "Need user_id and text to create agent"

    try:
        logger.info(f'Requesting Vicuna with langchain: {vicuna_url}')
        headers = {'Content-Type': 'application/json'}
        data = {
            "user_id": user_id,
            "conv_id": sessions.get(user_id, {}).get('curr_conv_id', user_id),
            "conv_list": history[:-1],
            "first_req_flag": "False",
            "prompt": history[-1]
        }

        res = requests.post(vicuna_url, data=json.dumps(data), headers=headers, timeout=15)
        if res.status_code == 200:
            res_json = res.json()
            return res_json.get('response', 'No response from Vicuna')
        else:
            return "We're sorry, it appears the server is currently overloaded"
    except Exception as e:
        logger.error(f'Vicuna exception: {e}')
        return "I encountered an error processing your request. Please try again."


def language_change(inp, user_id):
    """
    Stub for language change functionality
    TODO: Implement actual language change logic
    """
    logger.info(f'STUB: language_change called for user {user_id}')
    return ["Language change requested. This feature is not yet implemented."]


def match_options(prefix, text):
    """
    Stub for option matching with regex
    TODO: Implement actual regex pattern matching
    """
    logger.info(f'STUB: match_options called with prefix: {prefix}, text: {text}')
    return None


def get_list_topics(inp, user_id, file_id):
    """
    Stub for topic listing
    TODO: Implement actual topic listing from database
    """
    logger.info(f'STUB: get_list_topics called for user {user_id}')
    return {'key': 404, 'value': 'Topic listing not yet implemented'}


def topic_confirmation(inp, user_id, file_id):
    """
    Stub for topic confirmation
    TODO: Implement actual topic confirmation logic
    """
    logger.info(f'STUB: topic_confirmation called for user {user_id}')
    text = ['Topic confirmation: Would you like to learn about this topic?']
    options = ['Yes', 'No']
    action = 'Topic Confirmation'
    return text, options, action


def get_frame(user_id):
    """Get latest video frame from VisionService (replaces Redis)."""
    svc = _get_vision_service()
    if svc is not None:
        return svc.get_frame(str(user_id))
    return None


def get_description(user_id):
    """Get latest scene description from VisionService's MiniCPM loop."""
    svc = _get_vision_service()
    if svc is not None:
        return svc.get_description(str(user_id))
    return None


def _get_vision_service():
    """Lazy accessor for the global VisionService instance."""
    import sys
    main_mod = sys.modules.get('__main__')
    if main_mod and hasattr(main_mod, '_vision_service'):
        return main_mod._vision_service
    return None


def create_sessions(user_id, teacher_avatar_id, data, data_keys):
    """
    Stub for session creation
    TODO: Implement complete session initialization
    """
    logger.info(f'STUB: create_sessions called for user {user_id}')
    if user_id not in sessions:
        with _sessions_lock:
            sessions[user_id] = {
                "user_id": user_id,
                "teacher_avatar_id": teacher_avatar_id,
                "state": "start",
                "preffered_lang": "en"
            }


def exception_publish(line_no, message, user_id=None):
    """
    Stub for exception publishing
    TODO: Implement actual exception publishing to monitoring system
    """
    logger.error(f'Exception at line {line_no}: {message}')


def publish(inp, user_id, topic):
    """
    Stub for publishing messages
    TODO: Implement actual Crossbar message publishing
    """
    logger.info(f'STUB: publish called for user {user_id}, topic {topic}')



def setfit(input_text, request_id=None):
    """
    Stub for SetFit classification
    TODO: Implement actual SetFit model inference
    """
    logger.info('STUB: setfit called')
    return 'unknown'


def answer_fetcher(inp, user_id, request_id):
    """
    Stub for answer fetching
    TODO: Implement actual question answering system
    """
    logger.info(f'STUB: answer_fetcher called for user {user_id}')
    return f"Answer to '{inp}': This is a stub response. Implement actual QA system."


# ========== Response Functions (Stubs) ==========

async def teachme_response2(text=[], options=[], teachme="False", user_id=0, inp="",
                           cartoon_id=None, teacher_avatar_id=None, request_id=0,
                           lang='en', topic='', rev=False, conv_bot_name='RASA',
                           video_req=False, bot="Teach Yourself", dialogue_id=1,
                           action='Teachme', profile_time=None, content=None, priority=99):
    """
    Stub for teachme response function
    TODO: Implement actual video generation and response formatting
    """
    logger.info(f'STUB: teachme_response2 called for user {user_id}, action: {action}')

    response = {
        "status": "success",
        "text": text,
        "options": options,
        "user_id": user_id,
        "request_id": request_id,
        "action": action,
        "bot": bot,
        "video_req": video_req,
        "message": "This is a stub response. Implement actual teachme response logic."
    }

    return jsonify(response)


async def customgpt_response(text=[], options=[], user_id=0, inp="",
                            teacher_avatar_id=None, request_id=0,
                            video_req=True, action='Custom GPT', priority=99):
    """
    Stub for custom GPT response function
    TODO: Implement actual custom GPT response formatting and video generation
    """
    logger.info(f'STUB: customgpt_response called for user {user_id}, action: {action}')

    response = {
        "status": "success",
        "text": text,
        "options": options,
        "user_id": user_id,
        "request_id": request_id,
        "action": action,
        "video_req": video_req,
        "message": "This is a stub response. Implement actual custom GPT response logic."
    }

    return jsonify(response)


# ========== Main Route Functions ==========
# NOTE: Currently not supported
# @error_handler
# async def teachme2():
#     """
#     Teachme2 route handler (simplified stub version)

#     This is a simplified version of the teachme2 functionality. The full implementation
#     requires extensive infrastructure including database, external APIs, session management,
#     and more.

#     TODO: Gradually add the full functionality from the original implementation
#     """
#     bot = 'Teach Yourself'
#     data = request.get_json(force=True)
#     start_time = time.time()

#     logger.info('*'*50)
#     logger.info("Teachme2 Request: "+str(data))

#     # Extract basic parameters
#     try:
#         teacher_avatar_id = data.get("teacher_avatar_id")
#         cartoon_id = data.get("cartoon_id", 1)
#         user_id = data.get("user_id", 0)
#         inp = data.get("text", '')
#         request_id = data.get("request_id", int(time.time()))
#         video_req = data.get("video_req", True)
#         goals = data.get("goals")
#         file_id = data.get("file_id", 0)
#         raw_inp = data.get("raw_inp")

#         if isinstance(raw_inp, list):
#             raw_inp = ' '.join(raw_inp)
#         if isinstance(inp, list):
#             inp = inp[0] if len(inp) > 0 else ''

#     except Exception as e:
#         logger.error(f'Error extracting parameters: {e}')
#         return await teachme_response2(
#             text=[f"Error processing request: {str(e)}"],
#             user_id=0,
#             request_id=0
#         )

#     # Initialize session if needed
#     if user_id not in sessions or sessions[user_id].get("state") == "end":
#         sessions[user_id] = {
#             "user_id": user_id,
#             "teacher_avatar_id": teacher_avatar_id,
#             "conv_bot_name": "teachme",
#             "topic": "",
#             "state": "start",
#             "preffered_lang": "en",
#             "casual_conv_queue": deque(maxlen=10),
#             "inside_teachme": False,
#             "inside_assessments": False,
#             "request_id": request_id,
#             "file_id": file_id
#         }

#     # Update session
#     sessions[user_id]['request_id'] = request_id
#     sessions[user_id]['raw_inp'] = raw_inp

#     # Validate input
#     if inp.strip() == "" and goals is None:
#         return await teachme_response2(
#             text=["Please enter something as response.."],
#             user_id=user_id,
#             inp=inp,
#             cartoon_id=cartoon_id,
#             teacher_avatar_id=teacher_avatar_id,
#             request_id=request_id,
#             lang=sessions[user_id]['preffered_lang'],
#             video_req=video_req,
#             bot=bot,
#             action='Validation Error'
#         )

#     # Add to conversation queue
#     sessions[user_id]['casual_conv_queue'].append(
#         {"role": "user", "content": inp}
#     )

#     # Perform intent classification (stub)
#     zeroshot_label = zeroshot(inp, intital_labels, request_id)
#     sessions[user_id]['zeroshot_label'] = zeroshot_label['labels'][0]

#     # Handle different intents
#     intent = zeroshot_label['labels'][0]

#     if intent == 'abusive language':
#         text = [random.choice(abusive)]
#         return await teachme_response2(
#             text=text,
#             options=[],
#             user_id=user_id,
#             inp=inp,
#             cartoon_id=cartoon_id,
#             teacher_avatar_id=teacher_avatar_id,
#             request_id=request_id,
#             lang=sessions[user_id]['preffered_lang'],
#             video_req=video_req,
#             bot=bot,
#             action='Abusive Language Detected'
#         )

#     if intent == 'greet':
#         response = "Hello! I'm your teaching assistant. How can I help you learn today?"
#         return await teachme_response2(
#             text=[response],
#             options=[],
#             user_id=user_id,
#             inp=inp,
#             cartoon_id=cartoon_id,
#             teacher_avatar_id=teacher_avatar_id,
#             request_id=request_id,
#             lang=sessions[user_id]['preffered_lang'],
#             video_req=video_req,
#             bot=bot,
#             action='Greeting'
#         )

#     if intent == 'teach me' or intent == 'learn':
#         text = ["I'd love to teach you! What topic would you like to learn about?"]
#         options = ["Math", "Science", "History", "Programming"]
#         return await teachme_response2(
#             text=text,
#             options=options,
#             user_id=user_id,
#             inp=inp,
#             cartoon_id=cartoon_id,
#             teacher_avatar_id=teacher_avatar_id,
#             request_id=request_id,
#             lang=sessions[user_id]['preffered_lang'],
#             video_req=video_req,
#             bot=bot,
#             action='Topic Selection'
#         )

#     # Default response using bot
#     response = vicuna_bot(
#         list(sessions[user_id]['casual_conv_queue']),
#         user_id
#     )

#     return await teachme_response2(
#         text=[response],
#         options=[],
#         user_id=user_id,
#         inp=inp,
#         cartoon_id=cartoon_id,
#         teacher_avatar_id=teacher_avatar_id,
#         request_id=request_id,
#         lang=sessions[user_id]['preffered_lang'],
#         video_req=video_req,
#         bot=bot,
#         action='Casual Conversation'
#     )


@error_handler
async def custom_gpt():
    """
    Custom GPT route handler (simplified stub version)

    This is a simplified version of the custom_gpt functionality. The full implementation
    requires prompt database, custom session management, and various external services.

    TODO: Gradually add the full functionality from the original implementation
    """
    start_time = time.time()
    data = request.get_json(force=True)

    logger.info('|'*50)
    logger.info("Custom GPT Request: "+str(data))

    # Extract parameters
    try:
        user_id = data.get('user_id', 0)
        teacher_avatar_id = data.get('teacher_avatar_id')
        request_id = data.get('request_id', int(time.time()))
        video_req = data.get('video_req', True)
        create_agent = data.get('create_agent', False)
        prompt_name = data.get('prompt_name')
        file_id = data.get('file_id')
        prompt_id = data.get('prompt_id')
        inp = data.get("text", '')
        raw_inp = data.get("raw_inp")
        image_url = data.get('image_url')
        file_url = data.get('file_url')

        if isinstance(raw_inp, list):
            raw_inp = ' '.join(raw_inp)
        if isinstance(inp, list):
            inp = inp[0] if len(inp) > 0 else ''

    except Exception as e:
        logger.error(f'Error extracting parameters: {e}')
        return await customgpt_response(
            text=[f"Error processing request: {str(e)}"],
            user_id=0,
            request_id=0
        )

    # Validate input
    if inp.strip() == "":
        return await customgpt_response(
            text=["Request cannot be blank, Please enter something as request.."],
            user_id=user_id,
            inp=inp,
            teacher_avatar_id=teacher_avatar_id,
            request_id=request_id,
            video_req=video_req,
            action='Validation Error'
        )

    # Initialize session if needed
    if user_id not in sessions or sessions[user_id].get("state") == "end":
        create_sessions(user_id, teacher_avatar_id, data, list(data.keys()))

    if user_id not in custom_sessions or custom_sessions[user_id].get("state") == "end":
        logger.info('Creating custom sessions')
        with _sessions_lock:
            custom_sessions[user_id] = {
                "user_id": user_id,
                "teacher_avatar_id": teacher_avatar_id,
                "conv_bot_name": "Custom GPT",
                "state": "start",
                "preffered_lang": "en",
                "casual_conv_queue": deque(maxlen=10),
                "request_id": request_id,
                "prompt": "You are a helpful AI assistant.",
                "prompt_id": prompt_id,
                "file_id": file_id
            }

    # Update session
    with _sessions_lock:
        custom_sessions[user_id]['request_id'] = request_id
        custom_sessions[user_id]['teacher_avatar_id'] = teacher_avatar_id
        custom_sessions[user_id]['file_id'] = file_id

    # Add to conversation queue (with image if present)
    with _sessions_lock:
        user_content = raw_inp if raw_inp else inp
        if image_url and image_url.startswith('/uploads/'):
            # Multimodal message: include image for Qwen Vision via llama.cpp
            custom_sessions[user_id]['casual_conv_queue'].append(
                {"role": "user", "content": user_content, "image_url": image_url}
            )
        else:
            custom_sessions[user_id]['casual_conv_queue'].append(
                {"role": "user", "content": user_content}
            )

    logger.info(f"SESSION: {custom_sessions[user_id]}")
    logger.info(f"*** inp {inp}")

    # Check for abusive language
    labels = ["change language", "revision", "topic listing", "abusive language",
              "explain", "question", "learn", "affirm", "goodbye", "greet"]
    zeroshot_label = zeroshot(inp, labels, request_id)

    if zeroshot_label['labels'][0] == 'abusive language':
        zeroshot_label = zeroshot2(inp, labels, request_id)
        if zeroshot_label['labels'][0] == 'abusive language':
            text = [random.choice(abusive)]
            return await customgpt_response(
                text=text,
                options=[],
                user_id=user_id,
                inp=inp,
                teacher_avatar_id=teacher_avatar_id,
                request_id=request_id,
                video_req=video_req
            )

    with _sessions_lock:
        custom_sessions[user_id]['zeroshot_label'] = zeroshot_label['labels'][0]

    # Build request data with system prompt and conversation history
    request_data = [
        {"role": "system", "content": custom_sessions[user_id]['prompt']}
    ]
    request_data.extend(custom_sessions[user_id]['casual_conv_queue'])

    # Validate prompt_id — must be integer (DB column is int(11))
    if prompt_id is not None:
        if str(prompt_id).isdigit():
            prompt_id = int(prompt_id)
        else:
            logger.warning(f'custom_gpt: rejecting non-integer prompt_id={prompt_id}, using None')
            prompt_id = None

    # Get response from bot
    response_text = vicuna_bot(
        message=request_data,
        user_id=user_id,
        prompt_id=prompt_id,
        create_agent=create_agent,
        custom_agent=True
    )

    return await customgpt_response(
        text=[response_text],
        options=[],
        user_id=user_id,
        inp=inp,
        teacher_avatar_id=teacher_avatar_id,
        request_id=request_id,
        video_req=video_req
    )


# ========== TTS Routes ==========

# ========== TTS Engine Import ==========
# Can be disabled via NUNBA_DISABLE_TTS=1 environment variable
TTS_AVAILABLE = False
BACKEND_INDIC_PARLER = "indic_parler"
BACKEND_COSYVOICE3 = "cosyvoice3"

# Placeholder functions when TTS is disabled
def get_tts_engine():
    return None

def synthesize_text(text, voice=None, speed=1.0):
    return None

def get_tts_status():
    return {"available": False, "backend": "none", "error": "TTS disabled"}

if not os.environ.get('NUNBA_DISABLE_TTS'):
    try:
        from tts.tts_engine import (
            get_tts_engine,
            get_tts_status,
            synthesize_text,
        )

        TTS_AVAILABLE = True
        logger.info("TTS engine loaded successfully")
    except Exception as e:
        logger.warning(f"TTS engine not available: {e}")
else:
    logger.info("TTS disabled via NUNBA_DISABLE_TTS environment variable")


def tts_synthesize():
    """
    POST /tts/synthesize
    Synthesize text to speech audio using the best available backend.

    Routes to ChatterboxTurbo (en), IndicParler (Indic), CosyVoice3 (international) based on language + hardware.

    Request JSON:
        {
            "text": "Text to synthesize",
            "voice": "emma" or "en_US-amy-medium",  // optional, backend-specific
            "speed": 1.0  // optional, speech speed multiplier (0.5-2.0)
        }

    Response:
        Audio file (WAV) or JSON error
    """
    from flask import send_file

    if not TTS_AVAILABLE:
        return jsonify({"error": "TTS not available"}), 503

    try:
        data = request.get_json() or {}
        text = data.get("text", "").strip()
        # Support both 'voice' and 'voice_id' for backwards compatibility
        voice = data.get("voice") or data.get("voice_id")
        speed = float(data.get("speed", 1.0))
        language = data.get("language")  # Auto-routes to correct TTS engine

        if not text:
            return jsonify({"error": "No text provided"}), 400

        # Limit text length
        if len(text) > 5000:
            return jsonify({"error": "Text too long (max 5000 characters)"}), 400

        # Synthesize using unified engine (language triggers engine routing)
        audio_path = synthesize_text(text, voice=voice, speed=speed,
                                      language=language)

        if audio_path and os.path.exists(audio_path):
            # Sync catalog with active TTS backend state
            try:
                from models.orchestrator import get_orchestrator
                engine = get_tts_engine()
                if engine and hasattr(engine, '_active_backend'):
                    backend = engine._active_backend
                    device = 'gpu' if getattr(engine, '_prefer_gpu', False) else 'cpu'
                    get_orchestrator().notify_loaded(ModelType.TTS, backend, device=device)
            except Exception:
                pass
            return send_file(
                audio_path,
                mimetype="audio/wav",
                as_attachment=False,
                download_name="speech.wav"
            )
        else:
            return jsonify({"error": "Synthesis failed"}), 500

    except Exception as e:
        logger.error(f"TTS synthesis error: {e}")
        return jsonify({"error": str(e)}), 500


def tts_voices():
    """
    GET /tts/voices
    List available TTS voices for the current backend.

    Returns available voices for the active TTS backend.

    Response JSON:
        {
            "backend": "chatterbox_turbo" | "indic_parler" | "cosyvoice3" | ...,
            "voices": {...},
            "installed": [...],
            "default": "default"
        }
    """
    if not TTS_AVAILABLE:
        return jsonify({"error": "TTS not available"}), 503

    try:
        engine = get_tts_engine()
        info = engine.get_info()
        installed = engine.list_installed_voices()
        all_voices = engine.list_voices()

        # Build voice list with install status
        voices = {}
        for voice_id, voice_info in all_voices.items():
            voices[voice_id] = {
                **voice_info,
                "installed": voice_id in installed
            }

        return jsonify({
            "backend": info["backend"],
            "backend_name": info["backend_name"],
            "voices": voices,
            "installed": installed,
            "default": "default",
            "features": info["features"]
        })

    except Exception as e:
        logger.error(f"TTS voices error: {e}")
        return jsonify({"error": str(e)}), 500


def tts_install_voice():
    """
    POST /tts/install
    Install a TTS voice model.

    Request JSON:
        {
            "voice_id": "en_US-amy-medium"  // For Piper
            // or "model": "VibeVoice-1.5B"  // For VibeVoice model download
        }

    Response JSON:
        {"success": true, "message": "Voice/model installed"}
    """
    if not TTS_AVAILABLE:
        return jsonify({"error": "TTS not available"}), 503

    try:
        data = request.get_json() or {}
        voice_id = data.get("voice_id") or data.get("voice")
        model_name = data.get("model")

        engine = get_tts_engine()
        info = engine.get_info()

        success = engine.install_voice(voice_id or "model")

        if success:
            # Sync catalog download state
            try:
                from models.orchestrator import get_orchestrator
                backend = info.get('backend', '')
                get_orchestrator().notify_downloaded(ModelType.TTS, backend)
            except Exception:
                pass
            return jsonify({"success": True, "message": f"Voice {voice_id} installed"})
        else:
            return jsonify({"error": "Failed to install voice"}), 500

    except Exception as e:
        logger.error(f"TTS install error: {e}")
        return jsonify({"error": str(e)}), 500


def tts_status():
    """
    GET /tts/status
    Get TTS system status including hardware info.

    Response JSON:
        {
            "available": true,
            "backend": "chatterbox_turbo" | "indic_parler" | "cosyvoice3",
            "backend_name": "Chatterbox Turbo 350M" | "Indic Parler TTS" | ...,
            "has_gpu": true,
            "gpu_name": "NVIDIA GeForce RTX 3080",
            "features": ["multilingual", "expressive", ...],
            "installed_voices": ["emma", "carter", ...]
        }
    """
    if not TTS_AVAILABLE:
        return jsonify({
            "available": False,
            "backend": "none",
            "error": "TTS module not loaded"
        })

    try:
        # Use the unified status function from tts_engine
        status = get_tts_status()
        # Add user-friendly feature descriptions (no model names in UI)
        _FEATURE_NAMES = {
            'chatterbox_turbo': 'Natural English voice with expressions',
            'f5': 'Voice cloning (English & Chinese)',
            'indic_parler': 'Indian languages voice (21 languages)',
            'cosyvoice3': 'International languages voice (9 languages)',
            'chatterbox_multilingual': 'Multilingual voice (23 languages)',
            'piper': 'Basic English voice (CPU)',
        }
        status['feature_name'] = _FEATURE_NAMES.get(status.get('backend'), 'Voice')
        return jsonify(status)

    except Exception as e:
        logger.error(f"TTS status error: {e}")
        return jsonify({"error": str(e)}), 500


def tts_setup_engine():
    """Install TTS engine packages + models on demand. Shows progress in chat."""
    try:
        from tts.package_installer import install_backend_full, make_chat_progress_callback
    except ImportError:
        return jsonify({'error': 'Package installer not available'}), 503

    data = request.get_json(silent=True) or {}
    backend = data.get('backend', 'chatterbox_turbo')
    user_id = data.get('user_id', '')

    # Push progress to chat view in real-time
    messages = []
    chat_cb = make_chat_progress_callback(user_id=user_id,
                                           job_type=f'tts_setup_{backend}')

    def progress(msg):
        messages.append(msg)
        chat_cb(msg)  # Push to frontend SSE

    ok, result = install_backend_full(backend, progress_cb=progress)
    # Sync catalog after backend install
    if ok:
        try:
            from models.orchestrator import get_orchestrator
            get_orchestrator().notify_downloaded(ModelType.TTS, backend)
        except Exception:
            pass
    return jsonify({
        'success': ok,
        'backend': backend,
        'result': result,
        'progress': messages,
    })


def tts_engines_list():
    """List all TTS engines and their installation status."""
    try:
        from tts.package_installer import get_backend_status
        return jsonify(get_backend_status())
    except ImportError:
        return jsonify({'error': 'Package installer not available'}), 503


# ========== Kids Learning TTS Routes ===========

# In-memory job tracker for async TTS
_tts_jobs = {}
_tts_jobs_lock = __import__('threading').Lock()

_TTS_JOB_TTL = 300  # 5 minutes


def _cleanup_tts_jobs():
    """Remove completed/expired TTS jobs older than TTL."""
    import time as _time
    now = _time.time()
    with _tts_jobs_lock:
        expired = [k for k, v in _tts_jobs.items()
                   if v.get('completed_at', 0) and now - v['completed_at'] > _TTS_JOB_TTL]
        for k in expired:
            del _tts_jobs[k]


KIDS_VOICE_MAP = {
    'kids-friendly': None,   # use engine default
    'default': None,
}


def tts_kids_quick():
    """
    POST /api/social/tts/quick
    Quick TTS for short text — returns base64 audio inline.

    Request JSON: { "text": "...", "voice": "kids-friendly", "speed": 1.0, "format": "wav" }
    Response JSON: { "success": true, "data": { "base64": "...", "format": "wav" } }
    """
    if not TTS_AVAILABLE:
        return jsonify({"success": False, "error": "TTS not available"}), 503

    try:
        data = request.get_json() or {}
        text = data.get("text", "").strip()
        voice = data.get("voice", "kids-friendly")
        try:
            speed = max(0.25, min(4.0, float(data.get("speed", 1.0))))
        except (ValueError, TypeError):
            speed = 1.0

        if not text:
            return jsonify({"success": False, "error": "No text provided"}), 400
        if len(text) > 5000:
            return jsonify({"success": False, "error": "Text too long (max 5000 chars)"}), 400

        # Map kids voice names to engine-specific voices
        mapped_voice = KIDS_VOICE_MAP.get(voice, voice)

        audio_path = synthesize_text(text, voice=mapped_voice, speed=speed)

        if audio_path and os.path.exists(audio_path):
            import base64
            with open(audio_path, 'rb') as f:
                b64 = base64.b64encode(f.read()).decode('ascii')
            return jsonify({
                "success": True,
                "data": {"base64": b64, "format": "wav"}
            })
        return jsonify({"success": False, "error": "Synthesis failed"}), 503

    except Exception as e:
        logger.error(f"Kids TTS quick error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


def tts_kids_submit():
    """
    POST /api/social/tts/submit
    Async TTS for longer text — returns taskId for polling.

    Request JSON: { "text": "...", "voice": "kids-friendly", "speed": 1.0 }
    Response JSON: { "success": true, "data": { "taskId": "..." } }
    """
    if not TTS_AVAILABLE:
        return jsonify({"success": False, "error": "TTS not available"}), 503

    try:
        data = request.get_json() or {}
        text = data.get("text", "").strip()
        voice = data.get("voice", "kids-friendly")
        try:
            speed = max(0.25, min(4.0, float(data.get("speed", 1.0))))
        except (ValueError, TypeError):
            speed = 1.0

        if not text:
            return jsonify({"success": False, "error": "No text provided"}), 400
        if len(text) > 10000:
            return jsonify({"success": False, "error": "Text too long (max 10000 chars)"}), 400

        mapped_voice = KIDS_VOICE_MAP.get(voice, voice)

        import threading
        import uuid
        job_id = f"tts_{uuid.uuid4().hex[:12]}"

        with _tts_jobs_lock:
            _tts_jobs[job_id] = {"status": "pending", "data": None, "error": None}

        def _bg_synthesize():
            try:
                audio_path = synthesize_text(text, voice=mapped_voice, speed=speed)
                if audio_path and os.path.exists(audio_path):
                    import base64 as b64mod
                    with open(audio_path, 'rb') as f:
                        b64_data = b64mod.b64encode(f.read()).decode('ascii')
                    import time as _time_mod
                    with _tts_jobs_lock:
                        _tts_jobs[job_id] = {
                            "status": "done",
                            "data": {"base64": b64_data, "format": "wav"},
                            "error": None,
                            "completed_at": _time_mod.time()
                        }
                else:
                    import time as _time_mod
                    with _tts_jobs_lock:
                        _tts_jobs[job_id] = {"status": "failed", "data": None, "error": "Synthesis failed",
                                             "completed_at": _time_mod.time()}
            except Exception as exc:
                import time as _time_mod
                with _tts_jobs_lock:
                    _tts_jobs[job_id] = {"status": "failed", "data": None, "error": str(exc),
                                         "completed_at": _time_mod.time()}

        threading.Thread(target=_bg_synthesize, daemon=True).start()

        return jsonify({"success": True, "data": {"taskId": job_id}})

    except Exception as e:
        logger.error(f"Kids TTS submit error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


def tts_kids_poll(job_id):
    """
    GET /api/social/tts/status/<job_id>
    Poll async TTS job status.

    Response JSON: { "success": true, "data": { "status": "done", "base64": "...", "format": "wav" } }
    """
    _cleanup_tts_jobs()

    with _tts_jobs_lock:
        job = _tts_jobs.get(job_id)

    if not job:
        return jsonify({"success": False, "error": "Job not found"}), 404

    if job["status"] == "done":
        return jsonify({"success": True, "data": {
            "status": "done",
            "base64": job["data"]["base64"],
            "format": job["data"]["format"],
        }})
    elif job["status"] == "failed":
        return jsonify({"success": False, "data": {"status": "failed"}, "error": job.get("error")}), 503

    return jsonify({"success": True, "data": {"status": "pending"}})


# ========== Voice Pipeline Routes (STT + Diarization) ===========

def voice_transcribe():
    """
    POST /voice/transcribe
    Speech-to-text via Whisper — batch fallback for when client-side
    Web Speech API is unavailable or for non-English audio.

    Expects multipart form upload with 'audio' file (WAV, WebM, etc.).

    Response JSON:
        { "success": true, "text": "transcribed text", "language": "en" }
    """
    import tempfile

    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['audio']
    if not audio_file.filename:
        return jsonify({"error": "Empty audio file"}), 400

    tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    try:
        audio_file.save(tmp.name)
        tmp.close()

        from integrations.service_tools.whisper_tool import whisper_transcribe
        result = json.loads(whisper_transcribe(tmp.name))

        # Sync STT model state with catalog on first successful transcribe
        try:
            from models.orchestrator import get_orchestrator
            get_orchestrator().notify_loaded(ModelType.STT, 'Whisper Base (faster-whisper)', device='cpu')
        except Exception:
            pass

        # Emit present-tense audio perception event + evaluate audio watchers
        _uid = request.form.get('user_id', request.headers.get('X-User-Id', ''))
        _text = result.get('text', '')
        try:
            import time as _time

            from core.platform.events import emit_event
            emit_event('perception.audio.present', {
                'user_id': _uid, 'channel': 'microphone',
                'content': _text,
                'timestamp': _time.time(),
                'metadata': {'language': result.get('language')},
            })
        except Exception:
            pass

        # LLM-powered audio watcher evaluation (like visual agent per-frame inference)
        if _uid and _text:
            try:
                from hart_intelligence import _evaluate_audio_watchers
                _evaluate_audio_watchers(_uid, _text)
            except Exception:
                pass

        return jsonify({"success": True, **result})
    except ImportError:
        logger.warning("Whisper STT not available (whisper_tool not installed)")
        return jsonify({"success": False, "error": "whisper_not_available"}), 503
    except Exception as e:
        logger.error(f"Voice transcription error: {e}")
        return jsonify({"success": False, "error": str(e)}), 500
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def voice_diarize():
    """
    POST /voice/diarize
    Speaker diarization — REST batch wrapper that proxies to the
    WebSocket diarization sidecar (port 8004).

    For real-time use, connect directly to ws://localhost:8004.
    This REST endpoint is for one-shot / pre-recorded audio analysis.

    Expects multipart form upload with 'audio' file (WAV).

    Response JSON:
        { "success": true, "no_of_speaker": 1, "stop_mic": false }
    """
    import tempfile

    if 'audio' not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    audio_file = request.files['audio']
    if not audio_file.filename:
        return jsonify({"error": "Empty audio file"}), 400

    tmp = tempfile.NamedTemporaryFile(suffix='.wav', delete=False)
    try:
        audio_file.save(tmp.name)
        tmp.close()

        import asyncio

        import numpy as np

        # Read audio file
        try:
            import soundfile as sf
            audio_data, sr = sf.read(tmp.name, dtype='int16')
        except ImportError:
            # Fallback: read raw WAV with wave module
            import wave
            with wave.open(tmp.name, 'rb') as wf:
                sr = wf.getframerate()
                frames = wf.readframes(wf.getnframes())
                audio_data = np.frombuffer(frames, dtype=np.int16)

        # Resample to 16kHz if needed (diarization server expects 16kHz mono)
        if sr != 16000:
            try:
                from scipy.signal import resample
                num_samples = int(len(audio_data) * 16000 / sr)
                audio_data = resample(audio_data, num_samples).astype(np.int16)
            except ImportError:
                # Simple decimation fallback
                ratio = sr // 16000
                if ratio > 1:
                    audio_data = audio_data[::ratio]

        port = int(os.environ.get('HEVOLVE_DIARIZATION_PORT', 8004))

        async def _diarize():
            import websockets
            async with websockets.connect(f'ws://localhost:{port}') as ws:
                await ws.send(json.dumps({
                    'user_id': 'rest_api_batch',
                    'chunk': audio_data.tobytes().hex(),
                }))
                resp = await asyncio.wait_for(ws.recv(), timeout=30)
                return json.loads(resp)

        result = asyncio.run(_diarize())

        # Emit speaker diarization event
        try:
            from core.platform.events import emit_event
            _uid = request.form.get('user_id', request.headers.get('X-User-Id', ''))
            emit_event('perception.audio.speaker', {
                'user_id': _uid,
                'speaker_count': result.get('no_of_speaker', 0),
                'stop_mic': result.get('stop_mic', False),
            })
        except Exception:
            pass

        return jsonify({"success": True, **result})
    except Exception as e:
        logger.error(f"Voice diarization error: {e}")
        return jsonify({"success": False, "error": str(e)}), 503
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


# ========== Prompts/Agents API Routes ===========

# ============== Local vs Cloud Agent Definitions ==============

# Local agents - work offline with local LLM (Llama.cpp)
LOCAL_AGENTS = [
    {
        'id': 'local_assistant',
        'name': 'Hevolve',
        'description': 'Your personal AI assistant — runs locally on your device',
        'system_prompt': 'You are a helpful AI assistant running locally on the user\'s device. You help with questions and tasks while keeping data private.',
        'avatar': '/static/media/local-bot.png',
        'type': 'local',
        'is_default': True,
        'capabilities': ['chat', 'offline', 'private'],
        'requires_internet': False
    },
    {
        'id': 'local_coder',
        'name': 'HART Coder',
        'description': 'Your local programming assistant',
        'system_prompt': 'You are a programming assistant running locally. You help with coding questions, debugging, and best practices. All code stays private on the user\'s device.',
        'avatar': '/static/media/local-coder.png',
        'type': 'local',
        'is_default': False,
        'capabilities': ['chat', 'code', 'offline', 'private'],
        'requires_internet': False
    },
    {
        'id': 'local_writer',
        'name': 'HART Writer',
        'description': 'Your local writing assistant',
        'system_prompt': 'You are a writing assistant running locally. You help with drafting, editing, and improving text while keeping content private.',
        'avatar': '/static/media/local-writer.png',
        'type': 'local',
        'is_default': False,
        'capabilities': ['chat', 'writing', 'offline', 'private'],
        'requires_internet': False
    }
]

# Cloud agents - connect to hevolve.ai (require internet)
CLOUD_AGENTS = [
    {
        'id': 'cloud_radha',
        'name': 'Radha',
        'description': 'Your friendly cloud AI assistant',
        'system_prompt': None,  # Uses cloud config
        'avatar': '/static/media/bot.png',
        'type': 'cloud',
        'is_default': False,
        'capabilities': ['chat', 'voice', 'social', 'advanced'],
        'requires_internet': True,
        'cloud_endpoint': 'https://azurekong.hertzai.com/chat/custom_gpt'
    },
    {
        'id': 'cloud_teacher',
        'name': 'Hevolve Teacher',
        'description': 'Cloud-powered educational AI tutor',
        'system_prompt': None,  # Uses cloud config
        'avatar': '/static/media/teacher.png',
        'type': 'cloud',
        'is_default': False,
        'capabilities': ['chat', 'teaching', 'assessments', 'curriculum'],
        'requires_internet': True,
        'cloud_endpoint': 'https://azurekong.hertzai.com/chat/teachme2'
    },
    {
        'id': 'cloud_langchain',
        'name': 'Advanced Agent',
        'description': 'Cloud LangChain-powered agent with tools',
        'system_prompt': None,  # Uses cloud config
        'avatar': '/static/media/advanced-bot.png',
        'type': 'cloud',
        'is_default': False,
        'capabilities': ['chat', 'tools', 'web-search', 'advanced'],
        'requires_internet': True,
        'cloud_endpoint': 'https://azurekong.hertzai.com/langchain/chat'
    }
]

# Cloud API endpoints (from hevolve.ai production)
CLOUD_API_CONFIG = {
    'base_url': 'https://hevolve.hertzai.com',
    'chat_endpoint': 'https://azurekong.hertzai.com/chat/custom_gpt',
    'teachme_endpoint': 'https://azurekong.hertzai.com/chat/teachme2',
    'langchain_endpoint': 'https://azurekong.hertzai.com/langchain/chat',
    'prompts_endpoint': 'https://hevolve.hertzai.com/api/prompts'
}


_internet_cache = {'online': False, 'checked_at': 0}

def check_internet_connection():
    """Check if internet is available (cached for 30s to avoid repeated timeouts)."""
    import time
    now = time.monotonic()
    # Return cached result if checked within the last 30 seconds
    if now - _internet_cache['checked_at'] < 30:
        return _internet_cache['online']
    try:
        requests.head('https://hevolve.hertzai.com', timeout=2)
        _internet_cache['online'] = True
    except Exception:
        _internet_cache['online'] = False
    _internet_cache['checked_at'] = now
    return _internet_cache['online']


def get_prompts_route():
    """
    GET /prompts - Get all agents (local first, then HARTOS, then cloud)

    Query params:
        - user_id (optional)
        - type: 'all' | 'local' | 'cloud' (default: 'all')

    Nunba is local-first: LOCAL_AGENTS always appear first so the default
    agent is always a local one (Hevolve). HARTOS and cloud agents are
    appended after.
    """
    user_id = request.args.get('user_id')
    agent_type = request.args.get('type', 'all')

    # Check internet status
    is_online = check_internet_connection()

    agents = []
    hartos_available = False

    # ── 1. LOCAL_AGENTS always first (local-first app) ──
    if agent_type in ['all', 'local']:
        for agent in LOCAL_AGENTS:
            agent_copy = agent.copy()
            agent_copy['available'] = True
            agents.append(agent_copy)

    # ── 2. HARTOS backend agents (user-created agents, custom prompts) ──
    if HEVOLVE_PROMPTS_AVAILABLE:
        try:
            result = get_prompts(user_id)
            if result and not result.get('error'):
                hartos_agents = result.get('prompts', [])
                if hartos_agents:
                    hartos_available = True
                    for agent in hartos_agents:
                        # Skip duplicates already in LOCAL_AGENTS
                        if any(a.get('id') == agent.get('id') or a.get('name') == agent.get('name') for a in agents):
                            continue
                        agent['available'] = True
                        if not agent.get('type'):
                            agent['type'] = 'local'
                        agents.append(agent)
                    logger.debug(f'Fetched {len(hartos_agents)} agents from HARTOS')
        except Exception as e:
            logger.warning(f'HARTOS agent fetch failed: {e}')

    # ── 3. Cloud agents last (only when online + authenticated) ──
    has_auth = bool(request.headers.get('Authorization') or os.environ.get('HEVOLVE_LLM_API_KEY'))
    if agent_type in ['all', 'cloud'] and is_online:
        for agent in CLOUD_AGENTS:
            if not any(a.get('id') == agent.get('id') or a.get('name') == agent.get('name') for a in agents):
                agent_copy = agent.copy()
                agent_copy['available'] = has_auth  # guests can see but not use
                agents.append(agent_copy)

    return jsonify({
        'prompts': agents,
        'success': True,
        'is_online': is_online,
        'hartos_available': hartos_available,
        'local_count': len([a for a in agents if a.get('type') == 'local']),
        'cloud_count': len([a for a in agents if a.get('type') == 'cloud'])
    })


def chat_route():
    """
    POST /chat - Send a chat message
    Request JSON: {
        text: string,
        user_id: string,
        agent_id: string,        # Agent ID (local_* or cloud_*)
        agent_type: string,      # 'local' or 'cloud'
        conversation_id: string,
        video_req: boolean
    }

    Routes to local LLM or cloud based on agent_type.
    """
    data = request.get_json() or {}
    text = data.get('text', '')
    user_id = data.get('user_id', 'guest')
    agent_id = data.get('agent_id', 'local_assistant')
    agent_type = data.get('agent_type', 'local')  # Default to local
    teacher_avatar_id = data.get('teacher_avatar_id')
    conversation_id = data.get('conversation_id')
    video_req = data.get('video_req', False)
    request_id = data.get('request_id', str(int(time.time())))
    prompt_id = data.get('prompt_id')
    create_agent = data.get('create_agent', False)
    autonomous_creation = data.get('autonomous_creation', False) or data.get('autonomous', False)
    agentic_execute = data.get('agentic_execute', False)
    agentic_plan = data.get('agentic_plan', None)
    preferred_lang = data.get('preferred_lang', 'en')

    if not text.strip():
        return jsonify({'error': 'Text is required'}), 400

    # Find the agent configuration
    agent_config = None
    all_agents = LOCAL_AGENTS + CLOUD_AGENTS
    for agent in all_agents:
        if agent['id'] == agent_id:
            agent_config = agent
            break

    # Determine agent type from config or parameter
    if agent_config:
        agent_type = agent_config.get('type', agent_type)

    # ============== LOCAL AGENT ==============
    if agent_type == 'local':
        logger.info(f'Chat with LOCAL agent: {agent_id}')

        # ── Model availability gate (single check via ModelOrchestrator) ──
        # Orchestrator is the single source of truth for what's loaded.
        # If LLM is not loaded, return a setup card — can't chat without it.
        # TTS/STT missing is non-blocking — included in response for UI to show.
        #
        # IMPORTANT: If the LLM server is reachable (health OK), skip the LLM
        # setup card regardless of catalog state. The catalog may be out of sync
        # (e.g., server was started externally or by a previous session).
        try:
            from models.catalog import ModelType
            from models.orchestrator import get_orchestrator

            orch = get_orchestrator()
            missing_models = []

            # Quick LLM health check — if server responds, LLM is ready
            _llm_reachable = False
            try:
                import requests as _req
                from core.port_registry import get_local_llm_url
                _health = _req.get(get_local_llm_url().replace('/v1', '/health'), timeout=2)
                _llm_reachable = _health.status_code == 200
            except Exception:
                pass

            for mt in (ModelType.LLM, ModelType.TTS, ModelType.STT):
                # Skip LLM check if server is reachable
                if str(mt) == 'llm' and _llm_reachable:
                    continue

                entry = orch.select_best(str(mt))
                if not entry:
                    continue
                if entry.loaded:
                    continue

                loader = orch._loaders.get(str(mt))
                downloaded = loader.is_downloaded(entry) if loader else entry.downloaded
                missing_models.append({
                    'model_type': str(mt),
                    'model_id': entry.id,
                    'model_name': entry.name,
                    'size_mb': int(entry.disk_gb * 1024) if entry.disk_gb else int(entry.ram_gb * 1024),
                    'vram_gb': entry.vram_gb,
                    'downloaded': downloaded,
                    'action': 'load' if downloaded else 'download',
                })

            llm_missing = any(m['model_type'] == 'llm' for m in missing_models)

            if llm_missing:
                # LLM not loaded — try auto_load before giving up
                llm_entry_obj = orch.auto_load('llm')
                if llm_entry_obj and llm_entry_obj.loaded:
                    logger.info(f'LLM auto-loaded on first chat: {llm_entry_obj.id}')
                    missing_models = [m for m in missing_models if m['model_type'] != 'llm']
                    llm_missing = False

            if llm_missing:
                # Still no LLM — return setup card
                llm_info = next(m for m in missing_models if m['model_type'] == 'llm')
                return jsonify({
                    'text': f"Setting up {llm_info['model_name']}... Click below to start.",
                    'agent_id': agent_id,
                    'agent_type': 'local',
                    'source': 'system',
                    'success': True,
                    'llm_setup_card': llm_info,
                    'missing_models': missing_models,
                })
        except Exception as e:
            missing_models = []
            logger.debug(f'Model availability check: {e}')

        # Stash missing_models for attaching to the chat response later
        _non_llm_missing = [m for m in missing_models if m['model_type'] != 'llm'] if missing_models else []

        # Get system prompt for local agent
        system_prompt = None
        if agent_config:
            system_prompt = agent_config.get('system_prompt')

        # --- Tier 1: Try LangChain pipeline via adapter (port 6777) ---
        if HEVOLVE_CHAT_AVAILABLE:
            try:
                # Determine langchain prompt_id:
                # - Built-in local agents (local_assistant, etc.) → None → regular LangChain chat
                # - Custom agents with numeric prompt_id AND a HARTOS prompt file → create/reuse flow
                # - Agents without a prompt file → casual chat (no prompt_id)
                langchain_prompt_id = None
                _candidate_pid = prompt_id or agent_id
                if _candidate_pid and str(_candidate_pid).isdigit():
                    # Only pass prompt_id to HARTOS if the agent has a prompt file
                    # (user-created agents). Hardcoded default agents (e.g. id=54)
                    # don't have prompt files and should go to casual LangChain chat.
                    try:
                        from core.platform_paths import get_prompts_dir
                        _prompt_file = os.path.join(get_prompts_dir(), f'{_candidate_pid}.json')
                    except ImportError:
                        _prompt_file = os.path.join(
                            os.path.expanduser('~'), 'Documents', 'Nunba', 'data', 'prompts',
                            f'{_candidate_pid}.json')
                    if os.path.isfile(_prompt_file):
                        langchain_prompt_id = int(_candidate_pid)

                # --- Recursion guard: skip detection if already in creation/review flow ---
                already_creating = (
                    create_agent or
                    (langchain_prompt_id and str(langchain_prompt_id).isdigit())
                )

                # Conservative deterministic detection — only for unambiguous, non-negated cases
                # For intelligent detection (paraphrases, etc.), the LangChain Create_Agent
                # tool handles it via LLM reasoning in hart_intelligence
                if not already_creating and _detect_create_agent_intent(text):
                    create_agent = True
                    logger.info('Deterministic: detected agent creation intent (server will generate prompt_id)')
                    # Note: autonomous_creation is now detected by the LLM (Create_Agent tool)
                    # and passed back via the response from hart_intelligence, NOT by pattern matching

                # casual_conv=True disables ALL LangChain tools (memory, visual
                # context, etc.).  Only safe when there's no agent prompt AND no
                # agentic flow active — i.e. a pure default-agent chat turn.
                _is_casual = (
                    not langchain_prompt_id
                    and not create_agent
                    and not agentic_execute
                    and not agentic_plan
                )

                result = hevolve_chat(
                    text=text,
                    user_id=str(user_id),
                    agent_id=langchain_prompt_id,
                    conversation_id=conversation_id,
                    request_id=request_id,
                    create_agent=bool(create_agent),
                    casual_conv=_is_casual,
                    autonomous=bool(autonomous_creation),
                    agentic_execute=bool(agentic_execute),
                    agentic_plan=agentic_plan,
                    preferred_lang=preferred_lang,
                )
                # Surface explicit LangChain errors (guardrails, prompt injection, etc.)
                if result.get('error') and not (result.get('text') or result.get('response')):
                    error_msg = result.get('error', 'Unknown error from AI backend')
                    logger.warning(f'LangChain returned error: {error_msg}')
                    error_response = {
                        'text': f'Request could not be processed: {error_msg}',
                        'agent_id': agent_id,
                        'agent_type': 'local',
                        'source': 'langchain_local',
                        'error': error_msg,
                        'success': False,
                    }
                    # Agent error may indicate a missing API key
                    secret_req = result.get('secret_request')
                    if not secret_req:
                        key_info = _detect_missing_key_in_response(error_msg)
                        if key_info:
                            secret_req = {
                                'type': 'tool_key',
                                'key_name': key_info['key_name'],
                                'label': key_info['label'],
                                'description': key_info['description'],
                                'used_by': key_info['used_by'],
                                'triggered_by': 'tool_error',
                            }
                    if secret_req:
                        error_response['secret_request'] = secret_req
                    # Include any thinking traces captured before the error
                    thinking_traces = drain_thinking_traces(request_id)
                    if thinking_traces:
                        error_response['thinking_steps'] = thinking_traces
                    return jsonify(error_response)

                response_text = result.get('text') or result.get('response')
                if response_text and not result.get('error'):
                    logger.info(f'LangChain local response: {response_text[:100]}...')
                    response_json = {
                        'text': response_text,
                        'agent_id': agent_id,
                        'agent_type': 'local',
                        'source': 'langchain_local',
                        'success': True
                    }
                    # Agent-driven resource request: 3 detection paths (ordered by priority)
                    # 1. Direct secret_request from backend/adapter
                    # 2. RESOURCE_REQUEST: marker from Request_Resource tool output
                    # 3. Missing-key error patterns in response text
                    secret_req = result.get('secret_request')
                    if not secret_req:
                        secret_req = _extract_resource_request(response_text)
                    if not secret_req:
                        key_info = _detect_missing_key_in_response(response_text)
                        if key_info:
                            secret_req = {
                                'type': 'tool_key',
                                'key_name': key_info['key_name'],
                                'label': key_info['label'],
                                'description': key_info['description'],
                                'used_by': key_info['used_by'],
                                'triggered_by': 'tool_missing_key',
                            }
                    if secret_req:
                        response_json['secret_request'] = secret_req
                        # Strip the raw RESOURCE_REQUEST: marker from user-visible text
                        if 'RESOURCE_REQUEST:' in response_text:
                            response_json['text'] = response_text[:response_text.index('RESOURCE_REQUEST:')].rstrip()
                    # Pass through Agent_status for creation/reuse mode tracking
                    agent_status = result.get('Agent_status')
                    if agent_status:
                        response_json['agent_status'] = agent_status
                    # Pass through prompt_id (server-generated or frontend-provided)
                    result_prompt_id = result.get('prompt_id') or langchain_prompt_id
                    if result_prompt_id:
                        response_json['prompt_id'] = result_prompt_id
                    # Pass through autonomous creation flag
                    if autonomous_creation:
                        response_json['autonomous_creation'] = True
                    # Pass through agent name from langchain result
                    if result.get('agent_name'):
                        response_json['agent_name'] = result['agent_name']
                    if result.get('agent_display_name'):
                        response_json['agent_display_name'] = result['agent_display_name']
                    # Pass through creation_suggested flag
                    if result.get('creation_suggested'):
                        response_json['creation_suggested'] = True
                    # Pass through agentic plan for Plan Mode UI
                    if result.get('agentic_plan'):
                        response_json['agentic_plan'] = result['agentic_plan']
                    # Include thinking traces captured during LangChain/autogen execution
                    thinking_traces = drain_thinking_traces(request_id)
                    if thinking_traces:
                        response_json['thinking_steps'] = thinking_traces
                        logger.info(f'Including {len(thinking_traces)} thinking traces in response')
                    # Attach non-blocking missing models (TTS, STT) so frontend can show setup cards
                    if _non_llm_missing:
                        response_json['missing_models'] = _non_llm_missing
                    # Auto-post to social feed when agent creation completes
                    if agent_status == 'completed':
                        import threading
                        def _post_agent_to_social(pid, uid, name):
                            try:
                                from integrations.social.database import get_db
                                from integrations.social.models import User
                                from integrations.social.services import PostService
                                db = get_db()
                                agent_user = db.query(User).filter(User.id == int(uid)).first()
                                if agent_user:
                                    PostService.create(
                                        db, agent_user,
                                        title=f'New agent created: {name}',
                                        content=f'A new agent "{name}" has been created and is ready to help!',
                                        content_type='text',
                                    )
                                db.close()
                            except Exception as e:
                                logger.warning(f'Agent social post failed (non-blocking): {e}')
                        agent_name_for_post = result.get('agent_display_name') or result.get('agent_name') or 'New Agent'
                        threading.Thread(
                            target=_post_agent_to_social,
                            args=(langchain_prompt_id, user_id, agent_name_for_post),
                            daemon=True
                        ).start()
                    return jsonify(response_json)
                else:
                    logger.warning(f'LangChain returned error or empty: {result}')
            except Exception as e:
                logger.warning(f'LangChain pipeline unavailable, falling back to raw llama: {e}')

        # --- Tier 2: Fallback to raw Llama.cpp (port 8080) ---
        try:
            from llama.llama_config import check_llama_health, get_llama_endpoint
            if check_llama_health():
                endpoint = get_llama_endpoint()
                messages = [{"role": "user", "content": text}]
                if system_prompt:
                    messages.insert(0, {"role": "system", "content": system_prompt})

                response = requests.post(
                    f"{endpoint}/v1/chat/completions",
                    json={
                        "model": "local",
                        "messages": messages,
                        "stream": False
                    },
                    timeout=120
                )
                result = response.json()
                response_text = result.get("choices", [{}])[0].get("message", {}).get("content", "")

                return jsonify({
                    'text': response_text,
                    'agent_id': agent_id,
                    'agent_type': 'local',
                    'source': 'llama_local',
                    'success': True
                })
        except ImportError:
            logger.warning('Llama config not available')
        except Exception as e:
            logger.warning(f'Local Llama error: {e}')

        # No LLM backend available at all
        return jsonify({
            'text': 'Local LLM is not running. Please start Llama.cpp or download a model via Nunba settings.',
            'agent_id': agent_id,
            'agent_type': 'local',
            'error': 'local_llm_unavailable',
            'success': False
        })

    # ============== CLOUD AGENT ==============
    elif agent_type == 'cloud':
        logger.info(f'Chat with CLOUD agent: {agent_id}')

        # Check internet
        if not check_internet_connection():
            return jsonify({
                'text': 'Cloud agent requires internet connection.',
                'agent_id': agent_id,
                'agent_type': 'cloud',
                'error': 'no_internet',
                'success': False
            })

        # Check auth — cloud agents require a signed-in user (not guest)
        auth_header = request.headers.get('Authorization')
        api_key = os.environ.get('HEVOLVE_LLM_API_KEY')
        if not auth_header and not api_key:
            return jsonify({
                'text': 'Cloud agents require sign-in. Please log in or use a local agent like Hevolve.',
                'agent_id': agent_id,
                'agent_type': 'cloud',
                'error': 'auth_required',
                'success': False
            })

        # Get cloud endpoint
        cloud_endpoint = CLOUD_API_CONFIG['chat_endpoint']
        if agent_config and agent_config.get('cloud_endpoint'):
            cloud_endpoint = agent_config['cloud_endpoint']

        try:
            # Call hevolve.ai cloud endpoint
            payload = {
                'text': text,
                'user_id': user_id,
                'teacher_avatar_id': teacher_avatar_id or 1,
                'request_id': request_id,
                'video_req': video_req
            }

            cloud_headers = {'Content-Type': 'application/json'}
            if auth_header:
                cloud_headers['Authorization'] = auth_header
            if api_key and 'Authorization' not in cloud_headers:
                cloud_headers['Authorization'] = f'Bearer {api_key}'

            response = requests.post(
                cloud_endpoint,
                json=payload,
                timeout=60,
                headers=cloud_headers
            )

            if response.status_code == 200:
                result = response.json()
                result['agent_id'] = agent_id
                result['agent_type'] = 'cloud'
                result['source'] = 'hevolve_cloud'
                return jsonify(result)
            elif response.status_code in (401, 403):
                logger.warning(f'Cloud API auth error: {response.status_code}')
                return jsonify({
                    'text': 'Cloud authentication failed. Please sign in again or use a local agent.',
                    'agent_id': agent_id,
                    'agent_type': 'cloud',
                    'error': 'auth_failed',
                    'success': False
                })
            else:
                logger.error(f'Cloud API error: {response.status_code}')
                return jsonify({
                    'text': 'Cloud service temporarily unavailable. Try a local agent.',
                    'agent_id': agent_id,
                    'agent_type': 'cloud',
                    'error': 'cloud_unavailable',
                    'success': False
                })

        except requests.exceptions.Timeout:
            return jsonify({
                'text': 'Cloud request timed out. Try again or use a local agent.',
                'agent_id': agent_id,
                'agent_type': 'cloud',
                'error': 'timeout',
                'success': False
            })
        except Exception as e:
            logger.error(f'Cloud chat error: {e}')
            return jsonify({
                'text': f'Cloud error: {str(e)}',
                'agent_id': agent_id,
                'agent_type': 'cloud',
                'error': str(e),
                'success': False
            })

    # Unknown agent type
    return jsonify({'error': f'Unknown agent type: {agent_type}'}), 400


def backend_health_route():
    """
    GET /backend/health - Check backend health (local + cloud)
    """
    is_online = check_internet_connection()

    # Check local LLM status
    local_llm_available = False
    local_llm_info = {}
    try:
        from llama.llama_config import check_llama_health, get_llama_info
        local_llm_available = check_llama_health()
        if local_llm_available:
            local_llm_info = get_llama_info()
    except ImportError:
        pass
    except Exception as e:
        logger.warning(f'Local LLM check error: {e}')

    # Check LangChain service status (port 6777) and get active backend info
    langchain_available = False
    llm_backend = None
    node_tier = 'flat'
    hevolveai_healthy = False
    try:
        resp = requests.get('http://localhost:6777/status', timeout=2)
        langchain_available = resp.status_code == 200
        if langchain_available:
            status_data = resp.json()
            llm_backend = status_data.get('llm_backend')
            node_tier = status_data.get('node_tier', 'flat')
            hevolveai_healthy = status_data.get('hevolveai_healthy', False) or status_data.get('hevolve_core_healthy', False) or status_data.get('crawl4ai_healthy', False)
    except Exception:
        pass

    return jsonify({
        'healthy': True,
        'is_online': is_online,
        'local': {
            'available': local_llm_available,
            'info': local_llm_info,
            'agents_count': len(LOCAL_AGENTS)
        },
        'cloud': {
            'available': is_online,
            'endpoint': CLOUD_API_CONFIG['base_url'],
            'agents_count': len(CLOUD_AGENTS)
        },
        'langchain_service': {
            'available': langchain_available,
            'endpoint': 'http://localhost:6777',
        },
        'llm_backend': llm_backend,
        'node_tier': node_tier,
        'hevolveai_healthy': hevolveai_healthy,
    })


def network_status_route():
    """
    GET /network/status - Check network and service status
    """
    is_online = check_internet_connection()

    # Check specific cloud services
    cloud_services = {}
    if is_online:
        for name, url in [
            ('hevolve', 'https://hevolve.hertzai.com'),
            ('chat_api', 'https://azurekong.hertzai.com'),
        ]:
            try:
                resp = requests.get(url, timeout=3)
                cloud_services[name] = {'available': resp.status_code < 500, 'status': resp.status_code}
            except Exception:
                cloud_services[name] = {'available': False, 'status': None}

    return jsonify({
        'is_online': is_online,
        'cloud_services': cloud_services,
        'local_agents_available': True,  # Always true
        'cloud_agents_available': is_online
    })


# ── Agent sync endpoints ──

def _load_jwt_secret_key():
    """Load the JWT secret key from the same file used by social auth."""
    # Check SOCIAL_SECRET_KEY env var first
    env_key = os.environ.get('SOCIAL_SECRET_KEY', '')
    if env_key and len(env_key) >= 32:
        return env_key
    # Load from persisted key file (same path as integrations/social/auth.py)
    db_path = os.environ.get('HEVOLVE_DB_PATH', '')
    if db_path and db_path != ':memory:' and os.path.isabs(db_path):
        key_file = os.path.join(os.path.dirname(db_path), '.social_secret_key')
    else:
        try:
            from core.platform_paths import get_db_dir
            key_file = os.path.join(get_db_dir(), '.social_secret_key')
        except ImportError:
            key_file = os.path.join(
                os.path.expanduser('~'), 'Documents', 'Nunba', 'data', '.social_secret_key'
            )
    try:
        if os.path.exists(key_file):
            with open(key_file) as f:
                key = f.read().strip()
            if len(key) >= 32:
                return key
    except (PermissionError, OSError) as e:
        logger.warning(f"Cannot read JWT secret key from {key_file}: {e}")
    return None


def _get_user_id_from_auth():
    """Extract user_id from JWT Bearer token or query param (local only)."""
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        try:
            import jwt as pyjwt
            token = auth.split(' ', 1)[1]
            secret_key = _load_jwt_secret_key()
            if secret_key:
                payload = pyjwt.decode(token, secret_key, algorithms=["HS256"])
            else:
                logger.warning("JWT secret key unavailable — cannot verify token signature")
                return None
            return payload.get('user_id') or payload.get('sub')
        except Exception as e:
            logger.warning(f"JWT decode failed: {e}")
            return None
    # Fallback: allow user_id query param ONLY for local requests
    if request.remote_addr in ('127.0.0.1', '::1', 'localhost'):
        return request.args.get('user_id')
    return None


def _get_prompts_dir():
    """Return the prompts directory path, looking in multiple locations."""
    candidates = [
        os.path.join(os.path.dirname(__file__), 'prompts'),
    ]
    try:
        from core.platform_paths import get_prompts_dir
        candidates.append(get_prompts_dir())
    except ImportError:
        candidates.append(os.path.join(
            os.path.expanduser('~'), 'Documents', 'Nunba', 'data', 'prompts'))
    # Also check hart_intelligence package dir
    try:
        import hart_intelligence
        pkg_dir = os.path.dirname(inspect.getfile(hart_intelligence))
        candidates.insert(0, os.path.join(pkg_dir, 'prompts'))
    except Exception:
        pass
    for d in candidates:
        if os.path.isdir(d):
            return d
    # Create default
    default = candidates[-1]
    os.makedirs(default, exist_ok=True)
    return default


def agents_sync_get():
    """GET /agents/sync - Get all agent configs for authenticated user."""
    user_id = _get_user_id_from_auth()
    if not user_id:
        return jsonify({'success': False, 'error': 'Authentication required'}), 401

    prompts_dir = _get_prompts_dir()
    agents = []

    if os.path.isdir(prompts_dir):
        for fname in os.listdir(prompts_dir):
            if not fname.endswith('.json'):
                continue
            fpath = os.path.join(prompts_dir, fname)
            try:
                with open(fpath, encoding='utf-8') as f:
                    data = json.load(f)
                # Include agents owned by this user or public ones
                creator = str(data.get('creator_user_id', data.get('user_id', '')))
                if creator == str(user_id) or data.get('is_public'):
                    data.setdefault('updated_at', datetime.datetime.utcnow().isoformat())
                    agents.append(data)
            except Exception as e:
                logger.warning(f'Error reading prompt {fname}: {e}')

    return jsonify({'success': True, 'agents': agents})


def agents_sync_post():
    """POST /agents/sync - Push agent configs, last-write-wins merge."""
    user_id = _get_user_id_from_auth()
    if not user_id:
        return jsonify({'success': False, 'error': 'Authentication required'}), 401

    payload = request.get_json(silent=True) or {}
    client_agents = payload.get('agents', [])
    prompts_dir = _get_prompts_dir()
    os.makedirs(prompts_dir, exist_ok=True)

    updated = []
    server_newer = []

    for agent in client_agents:
        pid = agent.get('prompt_id')
        if not pid:
            continue
        fpath = os.path.join(prompts_dir, f'{pid}.json')
        client_ts = agent.get('updated_at', '')

        if os.path.exists(fpath):
            try:
                with open(fpath, encoding='utf-8') as f:
                    existing = json.load(f)
                server_ts = existing.get('updated_at', '')
                if client_ts > server_ts:
                    # Client is newer — overwrite
                    agent['creator_user_id'] = str(user_id)
                    with open(fpath, 'w', encoding='utf-8') as f:
                        json.dump(agent, f, indent=2)
                    updated.append(pid)
                else:
                    # Server is newer — return it
                    server_newer.append(existing)
            except Exception as e:
                logger.warning(f'Sync error for {pid}: {e}')
        else:
            # New agent — write it
            agent['creator_user_id'] = str(user_id)
            agent.setdefault('updated_at', datetime.datetime.utcnow().isoformat())
            with open(fpath, 'w', encoding='utf-8') as f:
                json.dump(agent, f, indent=2)
            updated.append(pid)

    return jsonify({
        'success': True,
        'updated_count': len(updated),
        'server_newer': server_newer,
    })


def agents_migrate():
    """POST /agents/migrate - Migrate guest agents to authenticated user."""
    payload = request.get_json(silent=True) or {}
    guest_user_id = payload.get('guest_user_id')
    new_user_id = payload.get('new_user_id')

    if not guest_user_id or not new_user_id:
        return jsonify({'success': False, 'error': 'guest_user_id and new_user_id required'}), 400

    prompts_dir = _get_prompts_dir()
    migrated = 0

    if os.path.isdir(prompts_dir):
        for fname in os.listdir(prompts_dir):
            if not fname.endswith('.json'):
                continue
            fpath = os.path.join(prompts_dir, fname)
            try:
                with open(fpath, encoding='utf-8') as f:
                    data = json.load(f)
                creator = str(data.get('creator_user_id', data.get('user_id', '')))
                if creator == str(guest_user_id):
                    data['creator_user_id'] = str(new_user_id)
                    data['updated_at'] = datetime.datetime.utcnow().isoformat()
                    with open(fpath, 'w', encoding='utf-8') as f:
                        json.dump(data, f, indent=2)
                    migrated += 1
            except Exception as e:
                logger.warning(f'Migration error for {fname}: {e}')

    # Also update social DB if available
    try:
        from integrations.social.models import User, db_session
        with db_session() as session:
            guest_social = session.query(User).filter_by(
                user_type='agent',
            ).filter(
                User.owner_id == int(guest_user_id) if str(guest_user_id).isdigit() else User.owner_id == 0
            ).all()
            for agent_user in guest_social:
                agent_user.owner_id = int(new_user_id) if str(new_user_id).isdigit() else agent_user.owner_id
    except Exception as e:
        logger.warning(f'Social DB migration skipped: {e}')

    return jsonify({'success': True, 'migrated_count': migrated})


def agent_post(prompt_id):
    """POST /agents/<prompt_id>/post - Allow an agent to create a social post."""
    user_id = _get_user_id_from_auth()
    if not user_id:
        return jsonify({'error': 'unauthorized'}), 401
    data = request.get_json(silent=True) or {}
    title = data.get('title', '')
    content = data.get('content', '')
    if not title:
        return jsonify({'error': 'title required'}), 400
    try:
        from integrations.social.database import get_db
        from integrations.social.models import User
        from integrations.social.services import PostService
        db = get_db()
        agent_user = db.query(User).filter(User.id == int(user_id)).first()
        if agent_user:
            post = PostService.create(db, agent_user, title, content=content, content_type='text')
            return jsonify({'success': True, 'post_id': post.id})
        return jsonify({'error': 'user not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# Export functions for use in main.py
# ---------------------------------------------------------------------------
# LLM Config API — runtime AI provider configuration
# ---------------------------------------------------------------------------
def llm_config_get():
    """GET /api/llm/config — Return current LLM configuration (no secrets)."""
    try:
        from desktop.ai_key_vault import CLOUD_PROVIDERS, AIKeyVault
        vault = AIKeyVault.get_instance()
        active = vault.get_active_provider()

        configured = []
        for pid in vault.get_all_configured_providers():
            pdef = CLOUD_PROVIDERS.get(pid, {})
            cfg = vault.get_provider_config(pid) or {}
            configured.append({
                'id': pid,
                'name': pdef.get('name', pid),
                'model': cfg.get('model', ''),
                'has_key': bool(cfg.get('api_key')),
            })

        return jsonify({
            'success': True,
            'active_provider': active,
            'configured_providers': configured,
            'available_providers': [
                {'id': k, 'name': v['name'], 'models': v['models'],
                 'needs_endpoint': v.get('needs_endpoint', False),
                 'needs_api_version': v.get('needs_api_version', False)}
                for k, v in CLOUD_PROVIDERS.items()
            ],
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def llm_config_update():
    """POST /api/llm/config — Update LLM provider configuration."""
    try:
        from desktop.ai_key_vault import CLOUD_PROVIDERS, AIKeyVault
        data = request.get_json() or {}

        provider_id = data.get('provider_id', '')
        if provider_id not in CLOUD_PROVIDERS:
            return jsonify({'success': False, 'error': f'Unknown provider: {provider_id}'}), 400

        api_key = data.get('api_key', '')
        model = data.get('model', '')
        base_url = data.get('base_url', '')
        api_version = data.get('api_version', '')

        if not api_key:
            return jsonify({'success': False, 'error': 'API key is required'}), 400

        cfg = {'api_key': api_key, 'model': model}
        if base_url:
            cfg['base_url'] = base_url
        if api_version:
            cfg['api_version'] = api_version

        vault = AIKeyVault.get_instance()
        vault.set_provider_config(provider_id, cfg)
        if data.get('set_active', True):
            vault.set_active_provider(provider_id)
        vault.export_to_env()

        # Update llama_config non-secret fields
        try:
            from llama.llama_config import LlamaConfig
            lc = LlamaConfig()
            lc.config['cloud_provider'] = provider_id
            lc.config['cloud_model'] = model
            lc.config['llm_mode'] = 'cloud'
            lc.mark_first_run_complete()
            lc._save_config()
        except Exception:
            pass

        return jsonify({'success': True, 'active_provider': provider_id})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def llm_config_test():
    """POST /api/llm/test — Test connection to a provider."""
    try:
        from desktop.ai_key_vault import AIKeyVault
        data = request.get_json() or {}
        result = AIKeyVault.test_provider_connection(
            data.get('provider_id', ''),
            data.get('api_key', ''),
            data.get('base_url', ''),
            data.get('api_version', ''),
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'success': False, 'message': str(e)}), 500


# ---------------------------------------------------------------------------
# Vault API — generic secret storage (tool keys, channel secrets)
# Extends AIKeyVault that already handles provider configs via /api/llm/config
# ---------------------------------------------------------------------------
def vault_store():
    """POST /api/vault/store — Store a secret in the vault.
    Body: { key_type: 'tool_key'|'channel_secret', key_name: str, value: str, channel_type?: str }
    """
    try:
        from desktop.ai_key_vault import AIKeyVault
        data = request.get_json() or {}
        key_type = data.get('key_type', 'tool_key')
        key_name = data.get('key_name', '')
        value = data.get('value', '')
        channel_type = data.get('channel_type', '')

        if not key_name or not value:
            return jsonify({'success': False, 'error': 'key_name and value are required'}), 400

        vault = AIKeyVault.get_instance()

        if key_type == 'channel_secret':
            if not channel_type:
                return jsonify({'success': False, 'error': 'channel_type required for channel secrets'}), 400
            vault.set_channel_secret(channel_type, key_name, value)
        else:
            vault.set_tool_key(key_name, value)

        # Export to env so LangChain tools can use it immediately
        vault.export_to_env()

        return jsonify({'success': True, 'key_name': key_name, 'stored': True})
    except Exception as e:
        logger.error(f'Vault store error: {e}')
        return jsonify({'success': False, 'error': str(e)}), 500


def vault_keys():
    """GET /api/vault/keys — List stored key names (never values)."""
    try:
        from desktop.ai_key_vault import AIKeyVault
        vault = AIKeyVault.get_instance()
        return jsonify({'success': True, **vault.list_vault_keys()})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


def vault_has():
    """GET /api/vault/has?key_name=X&channel_type=Y — Check if a specific key exists."""
    try:
        from desktop.ai_key_vault import AIKeyVault
        key_name = request.args.get('key_name', '')
        channel_type = request.args.get('channel_type', '')

        if not key_name:
            return jsonify({'success': False, 'error': 'key_name parameter required'}), 400

        vault = AIKeyVault.get_instance()
        if channel_type:
            exists = vault.has_channel_secret(channel_type, key_name)
        else:
            exists = vault.has_key(key_name)

        return jsonify({'success': True, 'key_name': key_name, 'exists': exists})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Proactive Agent Contact ─────────────────────────────────────────
# Any agent can reach out to any user. Non-owned agents require consent.
# UX: owned agent = direct message; non-owned = "AgentX wants to talk" (accept/deny)

_pending_contacts = {}  # {request_id: {agent_id, user_id, message, reason, timestamp, status}}

def agent_contact_request():
    """POST /agents/contact - Agent initiates contact with a user.

    Body: {agent_id, user_id, reason, message (optional)}
    Returns: {request_id, requires_consent, delivered}
    """
    data = request.get_json() or {}
    agent_id = data.get('agent_id', '')
    target_user_id = data.get('user_id', '')
    reason = data.get('reason', 'wants to share something with you')
    message = data.get('message', '')

    if not agent_id or not target_user_id:
        return jsonify({'error': 'agent_id and user_id required'}), 400

    import time as _t
    import uuid

    # Check if agent is owned by this user
    agent_config = None
    try:
        prompts_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'prompts')
        # Also check HARTOS prompts dir
        for d in [prompts_dir, os.path.join(os.path.expanduser('~'), 'PycharmProjects', 'HARTOS', 'prompts')]:
            cfg_path = os.path.join(d, f'{agent_id}.json')
            if os.path.exists(cfg_path):
                with open(cfg_path) as f:
                    agent_config = json.load(f)
                break
    except Exception:
        pass

    is_owned = agent_config and agent_config.get('creator_user_id') == target_user_id
    agent_name = (agent_config or {}).get('name', f'Agent {agent_id[:8]}')

    request_id = str(uuid.uuid4())[:12]

    if is_owned:
        # Owned agent: deliver directly (no consent needed)
        # Push notification with the message
        try:
            from integrations.social.realtime import on_notification
            on_notification(target_user_id, {
                'type': 'agent_message',
                'agent_id': agent_id,
                'agent_name': agent_name,
                'message': message,
                'reason': reason,
                'request_id': request_id,
                'requires_consent': False,
            })
        except Exception as e:
            logger.warning(f"Failed to push agent message: {e}")

        return jsonify({
            'request_id': request_id,
            'requires_consent': False,
            'delivered': True,
            'agent_name': agent_name,
        })
    else:
        # Non-owned agent: send consent request (like Instagram DM request)
        _pending_contacts[request_id] = {
            'agent_id': agent_id,
            'agent_name': agent_name,
            'user_id': target_user_id,
            'reason': reason,
            'message': message,
            'timestamp': _t.time(),
            'status': 'pending',
        }

        try:
            from integrations.social.realtime import on_notification
            on_notification(target_user_id, {
                'type': 'agent_contact_request',
                'agent_id': agent_id,
                'agent_name': agent_name,
                'reason': reason,
                'request_id': request_id,
                'requires_consent': True,
            })
        except Exception as e:
            logger.warning(f"Failed to push agent contact request: {e}")

        return jsonify({
            'request_id': request_id,
            'requires_consent': True,
            'delivered': False,
            'agent_name': agent_name,
        })


def agent_contact_respond():
    """POST /agents/contact/respond - User accepts or denies agent contact.

    Body: {request_id, action: "accept"|"deny"}
    Returns: {success, agent_id, message (if accepted)}
    """
    data = request.get_json() or {}
    request_id = data.get('request_id', '')
    action = data.get('action', '')

    if request_id not in _pending_contacts:
        return jsonify({'error': 'Unknown or expired request'}), 404

    if action not in ('accept', 'deny'):
        return jsonify({'error': 'action must be "accept" or "deny"'}), 400

    contact = _pending_contacts[request_id]
    contact['status'] = action

    if action == 'accept':
        # Deliver the pending message
        result = {
            'success': True,
            'agent_id': contact['agent_id'],
            'agent_name': contact['agent_name'],
            'message': contact.get('message', ''),
            'reason': contact['reason'],
        }
    else:
        result = {
            'success': True,
            'agent_id': contact['agent_id'],
            'denied': True,
        }

    # Clean up old requests (>1 hour)
    import time as _t
    cutoff = _t.time() - 3600
    expired = [k for k, v in _pending_contacts.items() if v['timestamp'] < cutoff]
    for k in expired:
        del _pending_contacts[k]

    return jsonify(result)


# ═══════════════════════════════════════════════════════════════════════
# HART Onboarding — "Light Your HART"
# The most important endpoints in the entire app.
# ═══════════════════════════════════════════════════════════════════════

def _get_hart_user_id():
    """Extract user_id from JWT or guest session."""
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if token:
        try:
            import jwt as pyjwt
            payload = pyjwt.decode(token, options={"verify_signature": False})
            return payload.get('user_id')
        except Exception:
            pass
    return request.json.get('user_id') or request.args.get('user_id')


def hart_advance():
    """Advance the HART onboarding conversation by one step."""
    try:
        from hart_onboarding import get_or_create_session
        user_id = _get_hart_user_id()
        if not user_id:
            return jsonify({'error': 'No user_id'}), 400

        data = request.get_json(silent=True) or {}
        session = get_or_create_session(user_id)
        result = session.advance(action=data.get('action'), data=data.get('data'))
        return jsonify(result)
    except ImportError:
        return jsonify({'error': 'HART onboarding not available'}), 501
    except Exception as e:
        logger.error(f"HART advance error: {e}")
        return jsonify({'error': str(e)}), 500


def hart_generate():
    """Generate HART name candidates from onboarding answers."""
    try:
        from hart_onboarding import HARTNameRegistry, generate_hart_name
        data = request.get_json(silent=True) or {}

        existing = HARTNameRegistry.get_all_names()
        result = generate_hart_name(
            language=data.get('language', 'en'),
            passion_key=data.get('passion_key', 'reading_learning'),
            escape_key=data.get('escape_key', 'quiet_alone'),
            locale=data.get('locale', 'en_US'),
            voice_transcript=data.get('voice_transcript', ''),
            existing_names=existing,
        )
        return jsonify(result)
    except ImportError:
        return jsonify({'error': 'HART onboarding not available'}), 501
    except Exception as e:
        logger.error(f"HART generate error: {e}")
        return jsonify({'error': str(e)}), 500


def hart_seal():
    """Seal a HART name forever. Once sealed, it cannot be changed."""
    try:
        from hart_onboarding import HARTNameRegistry, remove_session
        user_id = _get_hart_user_id()
        if not user_id:
            return jsonify({'error': 'No user_id'}), 400

        data = request.get_json(silent=True) or {}
        name = data.get('name', '').lower().strip()
        if not name:
            return jsonify({'error': 'No name provided'}), 400

        success = HARTNameRegistry.seal_name(
            user_id=user_id,
            name=name,
            dimensions=data.get('dimensions', {}),
            emoji_combo=data.get('emoji_combo', ''),
            language=data.get('language', 'en'),
            locale=data.get('locale', 'en_US'),
            passion_key=data.get('passion_key', ''),
            escape_key=data.get('escape_key', ''),
        )

        if success:
            remove_session(user_id)
            # Persist language preference for auto-bootstrap on next startup
            try:
                import json as _json
                import os
                hart_dir = os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba', 'data')
                os.makedirs(hart_dir, exist_ok=True)
                with open(os.path.join(hart_dir, 'hart_language.json'), 'w') as f:
                    _json.dump({'language': data.get('language', 'en')}, f)
            except Exception:
                pass
            return jsonify({'sealed': True, 'name': name, 'display': f'@{name}'})
        else:
            return jsonify({'sealed': False, 'error': 'Name unavailable or already sealed'}), 409
    except ImportError:
        return jsonify({'error': 'HART onboarding not available'}), 501
    except Exception as e:
        logger.error(f"HART seal error: {e}")
        return jsonify({'error': str(e)}), 500


def hart_profile():
    """Get a user's HART identity profile."""
    try:
        from hart_onboarding import get_hart_profile
        user_id = _get_hart_user_id()
        if not user_id:
            return jsonify({'error': 'No user_id'}), 400

        profile = get_hart_profile(user_id)
        if profile:
            return jsonify(profile)
        return jsonify({'sealed': False}), 404
    except ImportError:
        return jsonify({'error': 'HART onboarding not available'}), 501
    except Exception as e:
        return jsonify({'error': str(e)}), 500


def hart_check():
    """Quick check: does this user have a sealed HART name?"""
    try:
        from hart_onboarding import has_hart_name
        user_id = _get_hart_user_id()
        if not user_id:
            # No user — check localStorage on frontend instead
            return jsonify({'has_hart': False, 'check': 'local'})

        return jsonify({'has_hart': has_hart_name(user_id)})
    except ImportError:
        return jsonify({'has_hart': False, 'check': 'local'})
    except Exception:
        return jsonify({'has_hart': False, 'check': 'local'})


def ai_bootstrap_start():
    """POST /api/ai/bootstrap — kick off language-aware model pipeline."""
    data = request.get_json() or {}
    language = data.get('language', 'en')
    try:
        from models.language_bootstrap import start_bootstrap
        result = start_bootstrap(language)
        return jsonify(result)
    except Exception as e:
        logger.error(f"AI bootstrap failed: {e}")
        return jsonify({'phase': 'done', 'error': str(e)}), 500


def ai_bootstrap_status():
    """GET /api/ai/bootstrap/status — poll bootstrap progress."""
    try:
        from models.language_bootstrap import get_status
        return jsonify(get_status())
    except Exception as e:
        return jsonify({'phase': 'idle', 'error': str(e)})


# ============== Memory API endpoints ==============

def _get_or_create_graph(user_id):
    """Get or create a MemoryGraph instance for the given user."""
    try:
        from integrations.channels.memory.memory_graph import MemoryGraph
        db_path = os.path.join(
            os.path.expanduser("~"), "Documents", "Nunba", "data", "memory_graph", str(user_id)
        )
        return MemoryGraph(db_path=db_path, user_id=str(user_id))
    except ImportError:
        logger.debug("MemoryGraph not available (integrations not installed)")
        return None
    except Exception as e:
        logger.error(f"MemoryGraph init failed: {e}")
        return None


def memory_recent():
    """GET /api/memory/recent — return recent memories for a user."""
    user_id = request.args.get('user_id', '')
    limit = request.args.get('limit', 20, type=int)

    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    try:
        graph = _get_or_create_graph(user_id)
        if graph is None:
            return jsonify({'error': 'Memory system not available'}), 503

        nodes = graph.get_session_memories(session_id=user_id, limit=limit)
        memories = []
        for node in nodes:
            memories.append({
                'id': node.id,
                'content': node.content,
                'memory_type': node.memory_type,
                'created_at': node.created_at,
                'access_count': node.access_count,
            })
        return jsonify(memories)
    except Exception as e:
        logger.error(f"memory_recent error: {e}")
        return jsonify({'error': str(e)}), 500


def memory_search():
    """GET /api/memory/search — search memories by query string."""
    q = request.args.get('q', '')
    user_id = request.args.get('user_id', '')

    if not q:
        return jsonify({'error': 'q (query) is required'}), 400
    if not user_id:
        return jsonify({'error': 'user_id is required'}), 400

    try:
        graph = _get_or_create_graph(user_id)
        if graph is None:
            return jsonify({'error': 'Memory system not available'}), 503

        nodes = graph.recall(query=q, mode='hybrid', top_k=10)
        results = [node.to_dict() for node in nodes]
        return jsonify(results)
    except Exception as e:
        logger.error(f"memory_search error: {e}")
        return jsonify({'error': str(e)}), 500


def memory_delete(memory_id):
    """DELETE /api/memory/<memory_id> — delete a memory by ID."""
    if not memory_id:
        return jsonify({'error': 'memory_id is required'}), 400

    # Use a default user_id from query params for graph init
    user_id = request.args.get('user_id', 'default')

    try:
        graph = _get_or_create_graph(user_id)
        if graph is None:
            return jsonify({'error': 'Memory system not available'}), 503

        deleted = graph._store.delete(memory_id)
        if deleted:
            return jsonify({'success': True, 'deleted': memory_id})
        else:
            return jsonify({'error': 'Memory not found'}), 404
    except Exception as e:
        logger.error(f"memory_delete error: {e}")
        return jsonify({'error': str(e)}), 500


def register_routes(app):
    """
    Register chatbot routes with the Flask app

    Args:
        app: Flask application instance
    """
    # Chatbot routes
    # app.route("/teachme2", methods=["POST"])(teachme2)
    app.route("/custom_gpt", methods=["POST"])(custom_gpt)

    # Chat API routes (local + cloud agents)
    app.route("/chat", methods=["POST"])(chat_route)
    app.route("/prompts", methods=["GET"])(get_prompts_route)
    app.route("/backend/health", methods=["GET"])(backend_health_route)
    app.route("/network/status", methods=["GET"])(network_status_route)

    # Agent sync + migration routes
    app.route("/agents/sync", methods=["GET"])(agents_sync_get)
    app.route("/agents/sync", methods=["POST"])(agents_sync_post)
    app.route("/agents/migrate", methods=["POST"])(agents_migrate)
    app.route("/agents/<prompt_id>/post", methods=["POST"])(agent_post)

    # TTS routes (original)
    app.route("/tts/synthesize", methods=["POST"])(tts_synthesize)
    app.route("/tts/voices", methods=["GET"])(tts_voices)
    app.route("/tts/install", methods=["POST"])(tts_install_voice)
    app.route("/tts/status", methods=["GET"])(tts_status)

    # TTS engine management routes (install + status)
    app.route("/tts/setup-engine", methods=["POST"])(tts_setup_engine)
    app.route("/tts/engines", methods=["GET"])(tts_engines_list)

    # Kids Learning TTS routes (called by kidsLearningApi.js TTSManager)
    app.route("/api/social/tts/quick", methods=["POST"])(tts_kids_quick)
    app.route("/api/social/tts/submit", methods=["POST"])(tts_kids_submit)
    app.route("/api/social/tts/status/<job_id>", methods=["GET"])(tts_kids_poll)

    # Voice pipeline routes (STT + Diarization — batch fallback for WS streaming primary)
    app.route("/voice/transcribe", methods=["POST"])(voice_transcribe)
    app.route("/voice/diarize", methods=["POST"])(voice_diarize)

    # LLM config routes (AI provider management) — protected by auth (D4 fix)
    app.route("/api/llm/config", methods=["GET"])(_require_local_or_token(llm_config_get))
    app.route("/api/llm/config", methods=["POST"])(_require_local_or_token(llm_config_update))
    app.route("/api/llm/test", methods=["POST"])(_require_local_or_token(llm_config_test))

    # Vault routes (tool keys + channel secrets) — same auth as LLM config
    app.route("/api/vault/store", methods=["POST"])(_require_local_or_token(vault_store))
    app.route("/api/vault/keys", methods=["GET"])(_require_local_or_token(vault_keys))
    app.route("/api/vault/has", methods=["GET"])(_require_local_or_token(vault_has))

    # Proactive agent contact routes
    app.route("/agents/contact", methods=["POST"])(agent_contact_request)
    app.route("/agents/contact/respond", methods=["POST"])(agent_contact_respond)

    # HART Onboarding routes — "Light Your HART"
    app.route("/api/hart/advance", methods=["POST"])(hart_advance)
    app.route("/api/hart/generate", methods=["POST"])(hart_generate)
    app.route("/api/hart/seal", methods=["POST"])(hart_seal)
    app.route("/api/hart/profile", methods=["GET"])(hart_profile)
    app.route("/api/hart/check", methods=["GET"])(hart_check)

    # AI Bootstrap routes — language-aware model pipeline
    app.route("/api/ai/bootstrap", methods=["POST"])(ai_bootstrap_start)
    app.route("/api/ai/bootstrap/status", methods=["GET"])(ai_bootstrap_status)

    # Memory API routes — agent memory graph
    app.route("/api/memory/recent", methods=["GET"])(memory_recent)
    app.route("/api/memory/search", methods=["GET"])(memory_search)
    app.route("/api/memory/<memory_id>", methods=["DELETE"])(memory_delete)

    logger.info("Chatbot routes registered: /custom_gpt, /chat, /prompts, /backend/health, /network/status, /agents/sync, /agents/migrate, /agents/contact, /api/llm/*, /api/vault/*, /voice/*, /api/hart/*, /api/ai/bootstrap, /api/memory/*")
    logger.info(f"Local agents: {len(LOCAL_AGENTS)}, Cloud agents: {len(CLOUD_AGENTS)}")
    logger.info("TTS routes registered: /tts/synthesize, /tts/voices, /tts/install, /tts/status, /tts/setup-engine, /tts/engines")
