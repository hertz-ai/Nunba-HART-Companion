"""
media_classification.py — Data classification for generated/ingested media assets.

Every media asset gets a classification label at creation time that controls:
- Who can access it (public vs user-scoped)
- Where it's cached on disk (public/ vs private/{user_id}/)
- How long it persists

Labels:
  public_educational  — Game images, common TTS. Anyone can access.
  public_community    — Community-shared art, BGM. Authenticated users.
  user_private        — User-generated content. Only the owner.
  agent_private       — Agent-specific assets. Agent + owner only.
  confidential        — Sensitive content. Owner only + encryption flag.
"""

import hashlib
import json
import logging
import os
import threading
import time

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Classification labels
# ---------------------------------------------------------------------------
LABELS = (
    'public_educational',
    'public_community',
    'user_private',
    'agent_private',
    'confidential',
)

# ---------------------------------------------------------------------------
# Cache root — lives alongside the SQLite DB under ~/Documents/Nunba/data/
# ---------------------------------------------------------------------------
_USER_DOCS = os.path.join(os.path.expanduser('~'), 'Documents')
MEDIA_CACHE_ROOT = os.path.join(_USER_DOCS, 'Nunba', 'data', 'media_cache')
MANIFEST_PATH = os.path.join(MEDIA_CACHE_ROOT, 'manifest.json')

_manifest_lock = threading.Lock()


def _ensure_dirs():
    """Create the cache directory tree on first use."""
    for sub in ('public/image', 'public/tts', 'public/music', 'public/video'):
        os.makedirs(os.path.join(MEDIA_CACHE_ROOT, sub), exist_ok=True)


def cache_key(prompt, media_type, style=''):
    """Deterministic SHA-256 cache key from prompt + type + style."""
    raw = f"{media_type}:{prompt}:{style}".encode()
    return hashlib.sha256(raw).hexdigest()


# ---------------------------------------------------------------------------
# Manifest (JSON file on disk, thread-safe read/write)
# ---------------------------------------------------------------------------
def _load_manifest():
    """Load manifest from disk. Returns dict keyed by sha256."""
    if not os.path.isfile(MANIFEST_PATH):
        return {}
    try:
        with open(MANIFEST_PATH, encoding='utf-8') as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        logger.warning("Corrupt manifest.json — starting fresh")
        return {}


def _save_manifest(manifest):
    """Persist manifest to disk (atomic via temp file)."""
    _ensure_dirs()
    tmp = MANIFEST_PATH + '.tmp'
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, indent=1)
        os.replace(tmp, MANIFEST_PATH)
    except OSError as e:
        logger.error("Failed to save manifest: %s", e)


def register_asset(sha, media_type, label, prompt, size_bytes=0, owner_id=None, ext='png'):
    """Record a newly generated/stored asset in the manifest."""
    with _manifest_lock:
        manifest = _load_manifest()
        manifest[sha] = {
            'label': label,
            'type': media_type,
            'prompt': prompt[:200],
            'owner_id': owner_id,
            'ext': ext,
            'size': size_bytes,
            'created': time.time(),
        }
        _save_manifest(manifest)


def get_asset_meta(sha):
    """Look up an asset's metadata by its SHA-256 key."""
    manifest = _load_manifest()
    return manifest.get(sha)


# ---------------------------------------------------------------------------
# MediaClassifier
# ---------------------------------------------------------------------------
class MediaClassifier:
    """Determine classification label and enforce access boundaries."""

    @staticmethod
    def classify(prompt, context=None, user_id=None):
        """
        Determine classification from generation context.

        Args:
            prompt: The generation prompt (unused for classification, kept for audit)
            context: dict with hints — 'game_asset', 'community_post', etc.
            user_id: The requesting user (None = anonymous/system)

        Returns:
            One of LABELS.
        """
        ctx = context or {}
        if ctx.get('game_asset'):
            return 'public_educational'
        if ctx.get('community_post'):
            return 'public_community'
        if ctx.get('agent_id'):
            return 'agent_private'
        if ctx.get('confidential'):
            return 'confidential'
        if user_id:
            return 'user_private'
        return 'public_educational'

    @staticmethod
    def can_access(asset_meta, requesting_user_id=None):
        """
        Check if a user can access a given asset.

        Public assets: anyone.
        Private/agent/confidential: only the owner.
        """
        if not asset_meta:
            return False
        label = asset_meta.get('label', '')
        if label.startswith('public'):
            return True
        owner = asset_meta.get('owner_id')
        if not requesting_user_id:
            return False
        return str(owner) == str(requesting_user_id)

    @staticmethod
    def _sanitize_id(raw_id):
        """Sanitize an ID for use in filesystem paths — prevent path traversal."""
        import re
        s = str(raw_id) if raw_id else '_anonymous'
        # Strip anything that isn't alphanumeric, dash, or underscore
        s = re.sub(r'[^a-zA-Z0-9_-]', '_', s)
        # Prevent empty or dot-only names
        if not s or s in ('.', '..'):
            s = '_anonymous'
        return s[:128]  # Cap length

    @staticmethod
    def get_cache_path(sha, media_type, label, owner_id=None, ext='png'):
        """
        Build the absolute file path for a cached asset.

        Public  → media_cache/public/{type}/{sha}.{ext}
        Private → media_cache/private/{owner_id}/{type}/{sha}.{ext}
        """
        # Sanitize all path components to prevent traversal
        safe_type = MediaClassifier._sanitize_id(media_type)
        safe_ext = MediaClassifier._sanitize_id(ext)
        # sha should be hex only
        import re
        safe_sha = re.sub(r'[^a-fA-F0-9]', '', str(sha))[:64]
        if not safe_sha:
            safe_sha = 'invalid'

        if label.startswith('public'):
            rel = os.path.join('public', safe_type, f"{safe_sha}.{safe_ext}")
        else:
            uid = MediaClassifier._sanitize_id(owner_id)
            rel = os.path.join('private', uid, safe_type, f"{safe_sha}.{safe_ext}")
        full = os.path.join(MEDIA_CACHE_ROOT, rel)
        # Final realpath check — must stay within MEDIA_CACHE_ROOT
        resolved = os.path.realpath(full)
        cache_root_resolved = os.path.realpath(MEDIA_CACHE_ROOT)
        if not resolved.startswith(cache_root_resolved):
            logger.warning("Path traversal attempt blocked: %s", full)
            # Fallback to safe public path
            full = os.path.join(MEDIA_CACHE_ROOT, 'public', safe_type, f"{safe_sha}.{safe_ext}")
        os.makedirs(os.path.dirname(full), exist_ok=True)
        return full


# Module-level singleton
classifier = MediaClassifier()
