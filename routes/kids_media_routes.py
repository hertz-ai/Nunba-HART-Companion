"""
kids_media_routes.py — Agent-mediated media generation for Kids Learning Zone.

All generation goes through the Hive agent pipeline (hartos_backend_adapter)
with the existing 3-tier fallback:
  Tier-1: Direct in-process (pip install -e)
  Tier-2: HTTP proxy to HARTOS_BACKEND_URL (Docker, HARTOS, standalone)
  Tier-3: llama.cpp (no media tools → 503 fallback)

Routes:
  GET  /api/media/asset              — Serve or generate a media asset
  GET  /api/media/asset/status/<id>  — Poll async generation jobs
"""

import logging
import os
import re
import threading
import time
import uuid

from flask import jsonify, request, send_file

logger = logging.getLogger(__name__)

# Module-level handles for the two things tests want to substitute via
# `patch.object(routes.kids_media_routes, 'adapter'|'req', <mock>)`
# OR `patch('routes.kids_media_routes.req.get', <mock>)`.
#
# `req` is eagerly bound to the requests module so the dotted-attribute
# patch form works (you can't `patch.attr` on a None placeholder).
# requests is a leaf dep with no circular risk at this module's import.
#
# `adapter` stays None by default — routes.hartos_backend_adapter pulls
# in HARTOS integrations and can cause circular-import timing issues if
# imported here; the function body lazy-imports on first real call.
import requests as req  # noqa: E402

adapter = None  # type: ignore[assignment]

# Lazy imports to avoid circular deps at module level
_tts_synthesize = None
_tts_available = False

# In-memory job tracker for async media generation (music/video)
_async_jobs = {}  # {job_id: {status, result_path, error, created}}
_jobs_lock = threading.Lock()

# Job TTL — clean up completed/failed jobs after 10 minutes
_JOB_TTL = 600
_MAX_JOBS = 500  # Cap in-memory jobs

# Input validation constants
_MAX_PROMPT_LEN = 500
_VALID_MEDIA_TYPES = ('image', 'tts', 'music', 'video')
_VALID_STYLES = ('cartoon', 'realistic', 'watercolor')
_VALID_CLASSIFICATIONS = (
    'public_educational', 'public_community', 'user_private',
    'agent_private', 'confidential',
)
_SPEED_MIN, _SPEED_MAX = 0.25, 4.0


def _cleanup_jobs():
    """Remove completed/failed jobs older than TTL.

    Uses a bounded lock acquire (5s) rather than `with _jobs_lock:` so a
    misbehaving background-job thread can never wedge a Flask request
    thread indefinitely.  If the lock is contended we simply skip this
    pass — cleanup is best-effort; the NEXT request will retry and jobs
    just stay in memory a bit longer.  Prevents pytest-timeout hangs
    when a test leaves a job thread alive across the fixture boundary.
    """
    now = time.time()
    acquired = _jobs_lock.acquire(timeout=5.0)
    if not acquired:
        logger.debug("_cleanup_jobs: _jobs_lock contended, skipping pass")
        return
    try:
        expired = [k for k, v in _async_jobs.items()
                   if now - v.get('created', 0) > _JOB_TTL]
        for k in expired:
            del _async_jobs[k]
    finally:
        _jobs_lock.release()


def _get_user_id_from_request():
    """
    Extract authenticated user_id from JWT Bearer token.
    Returns user_id string or None.
    For public_educational assets, None is acceptable (anonymous access).
    For private assets, caller must verify user_id is not None.
    """
    auth = request.headers.get('Authorization', '')
    if auth.startswith('Bearer '):
        try:
            import jwt as pyjwt
            token = auth.split(' ', 1)[1]
            # Load secret key (same as chatbot_routes)
            env_key = os.environ.get('SOCIAL_SECRET_KEY', '')
            if env_key and len(env_key) >= 32:
                secret_key = env_key
            else:
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
                secret_key = None
                if os.path.exists(key_file):
                    with open(key_file) as f:
                        k = f.read().strip()
                    if len(k) >= 32:
                        secret_key = k
            if secret_key:
                payload = pyjwt.decode(token, secret_key, algorithms=['HS256'])
                return payload.get('user_id') or payload.get('sub')
        except Exception as e:
            logger.debug(f"JWT decode in media routes: {e}")
    # Fallback: allow local requests without auth (dev mode)
    if request.remote_addr in ('127.0.0.1', '::1', 'localhost'):
        return request.args.get('user_id')
    return None


def _safe_send_file(cache_path, mimetype, media_cache_root):
    """send_file with realpath validation — prevent path traversal."""
    resolved = os.path.realpath(cache_path)
    cache_root_resolved = os.path.realpath(media_cache_root)
    if not resolved.startswith(cache_root_resolved):
        logger.warning("Path traversal blocked in send_file: %s", cache_path)
        return jsonify({'error': 'access_denied'}), 403
    return send_file(resolved, mimetype=mimetype, as_attachment=False, max_age=2592000)


def _get_tts():
    """Lazy-load TTS functions."""
    global _tts_synthesize, _tts_available
    if _tts_synthesize is None:
        try:
            from tts.tts_engine import get_tts_status, synthesize_text
            _tts_synthesize = synthesize_text
            status = get_tts_status()
            _tts_available = status.get('available', False)
        except ImportError:
            _tts_synthesize = lambda *a, **kw: None
            _tts_available = False
    return _tts_synthesize, _tts_available


def _get_classifier():
    """Lazy-load media classifier."""
    from desktop.media_classification import (
        MEDIA_CACHE_ROOT,
        cache_key,
        classifier,
        get_asset_meta,
        register_asset,
    )
    return classifier, cache_key, register_asset, get_asset_meta, MEDIA_CACHE_ROOT


def _generate_image_via_agent(prompt, user_id, style='cartoon'):
    """
    Generate an image through the Hive agent pipeline.
    Uses hartos_backend_adapter.chat() with media_request flag.
    This ensures guardrails, logging, and cultural wisdom apply.
    """
    try:
        # Honour module-level `adapter` override (tests do
        # `patch.object(routes.kids_media_routes, 'adapter', <mock>)`);
        # fall back to the real lazy import in production.
        _adapter = adapter
        if _adapter is None:
            import routes.hartos_backend_adapter as _adapter
        result = _adapter.chat(
            text=f"Generate a children's educational illustration: {prompt}. Style: {style}. Return only the image URL.",
            user_id=user_id or 'system',
            media_request=True,
        )
        # The agent's txt2img tool returns img_url in the response text
        response_text = result.get('text', '') or result.get('response', '')
        # Extract URL from response (agent typically returns the URL directly)
        import re
        urls = re.findall(r'https?://[^\s<>"\']+\.(?:png|jpg|jpeg|webp|gif)', response_text)
        if urls:
            return urls[0]
        # If response contains img_url JSON
        if 'img_url' in response_text:
            try:
                import json
                data = json.loads(response_text)
                return data.get('img_url')
            except (json.JSONDecodeError, TypeError):
                pass
        return None
    except Exception as e:
        logger.warning(f"Agent image generation failed: {e}")
        return None


def _download_and_cache(url, cache_path, timeout=30):
    """Download a URL and save to disk cache."""
    # `req` is the module-level requests binding — tests patch it (or
    # its .get) to substitute a mock client.
    try:
        resp = req.get(url, timeout=timeout, stream=True)
        resp.raise_for_status()
        os.makedirs(os.path.dirname(cache_path), exist_ok=True)
        with open(cache_path, 'wb') as f:
            for chunk in resp.iter_content(8192):
                f.write(chunk)
        return os.path.getsize(cache_path)
    except Exception as e:
        logger.warning(f"Failed to download {url}: {e}")
        if os.path.exists(cache_path):
            os.remove(cache_path)
        return 0


def media_asset():
    """
    GET /api/media/asset
    Serve a cached media asset or generate one through the agent pipeline.

    Auth: Optional for public assets, required for private assets.
    JWT Bearer token used to identify requesting user.

    Query params:
        prompt          - required, natural language description (max 500 chars)
        type            - image|tts|music|video (default: image)
        style           - cartoon|realistic|watercolor (default: cartoon)
        classification  - public_educational|user_private|... (default: public_educational)
        voice           - optional, TTS voice name
        speed           - optional, TTS speed (0.25-4.0)
    """
    # Periodic job cleanup
    _cleanup_jobs()

    prompt = request.args.get('prompt', '').strip()
    media_type = request.args.get('type', 'image').strip().lower()
    style = request.args.get('style', 'cartoon').strip()
    classification = request.args.get('classification', 'public_educational').strip()

    # --- Input validation ---
    if not prompt:
        return jsonify({'error': 'prompt parameter required'}), 400
    if len(prompt) > _MAX_PROMPT_LEN:
        return jsonify({'error': f'prompt too long (max {_MAX_PROMPT_LEN} chars)'}), 400

    if media_type not in _VALID_MEDIA_TYPES:
        return jsonify({'error': 'type must be image|tts|music|video'}), 400

    if style not in _VALID_STYLES:
        style = 'cartoon'  # default fallback

    if classification not in _VALID_CLASSIFICATIONS:
        classification = 'public_educational'  # don't let client escalate

    # --- Auth: extract user_id from JWT (not from query param) ---
    user_id = _get_user_id_from_request()

    # Private assets REQUIRE authentication
    if not classification.startswith('public') and not user_id:
        return jsonify({'error': 'Authentication required for private assets'}), 401

    classifier, ck, register, get_meta, cache_root = _get_classifier()

    # Build cache key
    sha = ck(prompt, media_type, style)
    ext_map = {'image': 'png', 'tts': 'wav', 'music': 'mp3', 'video': 'mp4'}
    ext = ext_map.get(media_type, 'bin')

    # Check access control on existing asset
    meta = get_meta(sha)
    if meta:
        if not classifier.can_access(meta, user_id):
            return jsonify({'error': 'access_denied', 'label': meta.get('label')}), 403

    # Determine cache path
    cache_path = classifier.get_cache_path(sha, media_type, classification,
                                           owner_id=user_id, ext=ext)

    # --- CACHE HIT ---
    if os.path.isfile(cache_path):
        mime_map = {'image': 'image/png', 'tts': 'audio/wav', 'music': 'audio/mpeg', 'video': 'video/mp4'}
        return _safe_send_file(cache_path,
                               mime_map.get(media_type, 'application/octet-stream'),
                               cache_root)

    # --- CACHE MISS: Generate ---

    if media_type == 'image':
        img_url = _generate_image_via_agent(prompt, user_id, style)
        if img_url:
            size = _download_and_cache(img_url, cache_path)
            if size > 0:
                register(sha, media_type, classification, prompt, size, user_id, ext)
                return _safe_send_file(cache_path, 'image/png', cache_root)
        return jsonify({'error': 'generation_failed', 'fallback': 'emoji'}), 503

    elif media_type == 'tts':
        synth, available = _get_tts()
        if not available:
            return jsonify({'error': 'tts_not_available'}), 503
        voice = request.args.get('voice')
        try:
            speed = max(_SPEED_MIN, min(_SPEED_MAX, float(request.args.get('speed', 1.0))))
        except (ValueError, TypeError):
            speed = 1.0
        audio_path = synth(prompt, voice=voice, speed=speed)
        if audio_path and os.path.isfile(audio_path):
            # Copy to cache location
            import shutil
            os.makedirs(os.path.dirname(cache_path), exist_ok=True)
            shutil.copy2(audio_path, cache_path)
            size = os.path.getsize(cache_path)
            register(sha, media_type, classification, prompt, size, user_id, ext)
            return _safe_send_file(cache_path, 'audio/wav', cache_root)
        return jsonify({'error': 'tts_synthesis_failed'}), 503

    elif media_type in ('music', 'video'):
        # Async generation — return job_id for polling
        job_id = f"{media_type}_{uuid.uuid4().hex[:12]}"
        with _jobs_lock:
            # Cap total jobs to prevent memory exhaustion
            if len(_async_jobs) >= _MAX_JOBS:
                _cleanup_jobs()
                if len(_async_jobs) >= _MAX_JOBS:
                    return jsonify({'error': 'Too many pending jobs, try again later'}), 429
            _async_jobs[job_id] = {
                'status': 'pending',
                'media_type': media_type,
                'prompt': prompt[:_MAX_PROMPT_LEN],
                'cache_path': cache_path,
                'sha': sha,
                'classification': classification,
                'user_id': user_id,
                'ext': ext,
                'created': time.time(),
            }
        # Launch background generation
        t = threading.Thread(
            target=_async_generate,
            args=(job_id, media_type, prompt, style, cache_path, sha, classification, user_id, ext),
            daemon=True
        )
        t.start()
        return jsonify({
            'status': 'pending',
            'job_id': job_id,
            'poll_url': f'/api/media/asset/status/{job_id}',
        }), 202

    return jsonify({'error': 'unsupported_type'}), 400


def _async_generate(job_id, media_type, prompt, style, cache_path, sha, classification, user_id, ext):
    """Background thread for async media generation (music/video)."""
    _, _, register, _, _ = _get_classifier()
    try:
        # Try using the service tool registry for direct access
        try:
            from integrations.service_tools.registry import service_tool_registry
            registry = service_tool_registry
        except ImportError:
            registry = None

        result_url = None

        if media_type == 'music' and registry:
            # AceStep music generation
            tool = registry.get_tool('acestep_generate')
            if tool and tool.get('is_healthy'):
                import requests as req
                resp = req.post(
                    f"{tool['base_url']}/release_task",
                    json={'prompt': prompt, 'genre': style, 'tempo': 120, 'duration': 60},
                    timeout=10
                )
                task_data = resp.json()
                task_id = task_data.get('task_id')
                if task_id:
                    # Poll for completion
                    for _ in range(120):  # 4 minutes max
                        time.sleep(2)
                        poll = req.post(
                            f"{tool['base_url']}/query_result",
                            json={'task_id': task_id}, timeout=10
                        )
                        poll_data = poll.json()
                        if poll_data.get('status') in ('done', 'completed', 'complete'):
                            result_url = poll_data.get('url') or poll_data.get('result_url')
                            break
                        if poll_data.get('status') in ('failed', 'error'):
                            break

        elif media_type == 'video' and registry:
            # Wan2GP or LTX-2 video generation
            for tool_name in ('wan2gp_generate', 'ltx2_generate'):
                tool = registry.get_tool(tool_name)
                if tool and tool.get('is_healthy'):
                    import requests as req
                    resp = req.post(
                        f"{tool['base_url']}/generate",
                        json={'prompt': prompt, 'num_frames': 49, 'width': 512, 'height': 320},
                        timeout=10
                    )
                    task_data = resp.json()
                    task_id = task_data.get('task_id')
                    if task_id:
                        for _ in range(150):  # 5 minutes max
                            time.sleep(2)
                            poll = req.post(
                                f"{tool['base_url']}/check_result",
                                json={'task_id': task_id}, timeout=10
                            )
                            poll_data = poll.json()
                            if poll_data.get('status') in ('done', 'completed', 'complete'):
                                result_url = poll_data.get('url') or poll_data.get('result_url')
                                break
                            if poll_data.get('status') in ('failed', 'error'):
                                break
                    if result_url:
                        break

        if result_url:
            size = _download_and_cache(result_url, cache_path)
            if size > 0:
                register(sha, media_type, classification, prompt, size, user_id, ext)
                with _jobs_lock:
                    _async_jobs[job_id]['status'] = 'complete'
                    _async_jobs[job_id]['result_path'] = cache_path
                return

        with _jobs_lock:
            _async_jobs[job_id]['status'] = 'failed'
            _async_jobs[job_id]['error'] = 'generation_failed'

    except Exception as e:
        logger.error(f"Async media generation failed for {job_id}: {e}")
        with _jobs_lock:
            _async_jobs[job_id]['status'] = 'failed'
            _async_jobs[job_id]['error'] = str(e)


def media_asset_status(job_id):
    """
    GET /api/media/asset/status/<job_id>
    Poll async media generation job status.
    """
    # Validate job_id format (prevent injection)
    if not re.match(r'^(music|video)_[a-f0-9]{12}$', str(job_id)):
        return jsonify({'error': 'invalid job_id format'}), 400

    with _jobs_lock:
        job = _async_jobs.get(job_id)

    if not job:
        return jsonify({'error': 'job_not_found'}), 404

    # Verify the requesting user owns this job (for private assets)
    if not job.get('classification', '').startswith('public'):
        req_user = _get_user_id_from_request()
        if req_user != job.get('user_id'):
            return jsonify({'error': 'access_denied'}), 403

    if job['status'] == 'complete':
        cache_path = job.get('result_path')
        if cache_path and os.path.isfile(cache_path):
            _, _, _, _, cache_root = _get_classifier()
            mime_map = {'music': 'audio/mpeg', 'video': 'video/mp4'}
            mt = job.get('media_type', 'video')
            return _safe_send_file(cache_path,
                                   mime_map.get(mt, 'application/octet-stream'),
                                   cache_root)

    return jsonify({
        'status': job['status'],
        'job_id': job_id,
        'error': job.get('error'),
    })


def register_routes(app):
    """Register media asset routes on the Flask app."""
    app.route("/api/media/asset", methods=["GET"])(media_asset)
    app.route("/api/media/asset/status/<job_id>", methods=["GET"])(media_asset_status)
    logger.info("Kids media routes registered: /api/media/asset, /api/media/asset/status/<job_id>")
