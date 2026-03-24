"""
test_media_classification.py - Tests for desktop/media_classification.py

Tests the data classification system that controls media asset access.
Each test verifies a specific security boundary or data integrity guarantee:

FT: Classification rules (game_asset→public, community→public, agent→private,
    confidential), access control (public=anyone, private=owner only),
    cache path construction, manifest CRUD.
NFT: Path traversal prevention (security-critical), thread safety of manifest,
     cache key determinism, corrupt manifest recovery.
"""
import os
import sys
import tempfile
from unittest.mock import patch

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# Classification rules — determines who can see what
# ============================================================

class TestClassificationRules:
    """MediaClassifier.classify() drives access control — wrong label = data leak."""

    def test_game_asset_is_public_educational(self):
        """Game images are shared across all users — must be public."""
        from desktop.media_classification import MediaClassifier
        assert MediaClassifier.classify("draw a cat", {'game_asset': True}) == 'public_educational'

    def test_community_post_is_public_community(self):
        """User-shared art in the feed — authenticated users can see it."""
        from desktop.media_classification import MediaClassifier
        assert MediaClassifier.classify("sunset", {'community_post': True}) == 'public_community'

    def test_agent_context_is_agent_private(self):
        """Agent-generated assets — only the agent + owner should access."""
        from desktop.media_classification import MediaClassifier
        assert MediaClassifier.classify("report", {'agent_id': 'agent_123'}) == 'agent_private'

    def test_confidential_flag_overrides(self):
        """Explicit confidential flag — strictest access, encryption recommended."""
        from desktop.media_classification import MediaClassifier
        assert MediaClassifier.classify("medical scan", {'confidential': True}) == 'confidential'

    def test_user_id_without_context_is_user_private(self):
        """Regular user upload — private to the uploader."""
        from desktop.media_classification import MediaClassifier
        assert MediaClassifier.classify("my photo", user_id='user_42') == 'user_private'

    def test_no_context_no_user_defaults_public(self):
        """System-generated assets without context — safe default is public."""
        from desktop.media_classification import MediaClassifier
        assert MediaClassifier.classify("generic image") == 'public_educational'

    def test_game_asset_takes_priority_over_user_id(self):
        """Game assets are public even if user_id is provided."""
        from desktop.media_classification import MediaClassifier
        result = MediaClassifier.classify("chess piece", {'game_asset': True}, user_id='user_1')
        assert result == 'public_educational'

    def test_all_labels_are_valid(self):
        """Every classification result must be in the LABELS tuple."""
        from desktop.media_classification import LABELS, MediaClassifier
        test_cases = [
            ({}, None),
            ({'game_asset': True}, None),
            ({'community_post': True}, None),
            ({'agent_id': 'a1'}, None),
            ({'confidential': True}, None),
            ({}, 'user_1'),
        ]
        for ctx, uid in test_cases:
            label = MediaClassifier.classify("test", ctx, uid)
            assert label in LABELS, f"Label '{label}' not in LABELS"


# ============================================================
# Access control — prevents unauthorized access to private assets
# ============================================================

class TestAccessControl:
    """can_access() is the security gate for all media requests."""

    def test_public_asset_accessible_by_anyone(self):
        from desktop.media_classification import MediaClassifier
        meta = {'label': 'public_educational', 'owner_id': 'user_1'}
        assert MediaClassifier.can_access(meta, requesting_user_id=None) is True
        assert MediaClassifier.can_access(meta, requesting_user_id='user_2') is True

    def test_private_asset_accessible_only_by_owner(self):
        from desktop.media_classification import MediaClassifier
        meta = {'label': 'user_private', 'owner_id': 'user_1'}
        assert MediaClassifier.can_access(meta, requesting_user_id='user_1') is True
        assert MediaClassifier.can_access(meta, requesting_user_id='user_2') is False

    def test_private_asset_denied_without_user_id(self):
        """Anonymous users must NEVER access private assets."""
        from desktop.media_classification import MediaClassifier
        meta = {'label': 'confidential', 'owner_id': 'user_1'}
        assert MediaClassifier.can_access(meta, requesting_user_id=None) is False

    def test_none_meta_returns_false(self):
        """Missing asset metadata = deny access (fail-closed)."""
        from desktop.media_classification import MediaClassifier
        assert MediaClassifier.can_access(None) is False

    def test_owner_id_comparison_is_string(self):
        """Owner IDs may be int in DB but string in request — must compare as strings."""
        from desktop.media_classification import MediaClassifier
        meta = {'label': 'user_private', 'owner_id': 42}
        assert MediaClassifier.can_access(meta, requesting_user_id='42') is True


# ============================================================
# Path traversal prevention — SECURITY CRITICAL
# ============================================================

class TestPathTraversal:
    """Cache paths must never escape MEDIA_CACHE_ROOT — traversal = arbitrary file access."""

    def test_sanitize_strips_slashes(self):
        from desktop.media_classification import MediaClassifier
        result = MediaClassifier._sanitize_id("../../etc/passwd")
        assert '/' not in result
        assert '..' not in result

    def test_sanitize_strips_special_chars(self):
        from desktop.media_classification import MediaClassifier
        result = MediaClassifier._sanitize_id("user<script>alert(1)</script>")
        assert '<' not in result
        assert '>' not in result

    def test_sanitize_handles_none(self):
        from desktop.media_classification import MediaClassifier
        result = MediaClassifier._sanitize_id(None)
        assert result == '_anonymous'

    def test_sanitize_caps_length(self):
        from desktop.media_classification import MediaClassifier
        result = MediaClassifier._sanitize_id("a" * 500)
        assert len(result) <= 128

    def test_cache_path_stays_within_root(self):
        """The realpath check must prevent symlink/traversal escapes."""
        from desktop.media_classification import MEDIA_CACHE_ROOT, MediaClassifier
        path = MediaClassifier.get_cache_path(
            sha="abc123", media_type="image", label="user_private",
            owner_id="../../etc", ext="png")
        resolved = os.path.realpath(path)
        assert resolved.startswith(os.path.realpath(MEDIA_CACHE_ROOT))

    def test_public_path_format(self):
        from desktop.media_classification import MediaClassifier
        path = MediaClassifier.get_cache_path(
            sha="deadbeef", media_type="image", label="public_educational", ext="png")
        assert 'public' in path
        assert 'deadbeef' in path


# ============================================================
# Cache key determinism
# ============================================================

class TestCacheKey:
    """cache_key must be deterministic — same input always produces same hash."""

    def test_same_input_same_hash(self):
        from desktop.media_classification import cache_key
        k1 = cache_key("draw a cat", "image", "cartoon")
        k2 = cache_key("draw a cat", "image", "cartoon")
        assert k1 == k2

    def test_different_prompt_different_hash(self):
        from desktop.media_classification import cache_key
        k1 = cache_key("draw a cat", "image")
        k2 = cache_key("draw a dog", "image")
        assert k1 != k2

    def test_different_type_different_hash(self):
        from desktop.media_classification import cache_key
        k1 = cache_key("hello", "tts")
        k2 = cache_key("hello", "image")
        assert k1 != k2

    def test_hash_is_hex_string(self):
        from desktop.media_classification import cache_key
        k = cache_key("test", "image")
        assert all(c in '0123456789abcdef' for c in k)
        assert len(k) == 64  # SHA-256 = 64 hex chars


# ============================================================
# Manifest — thread-safe asset registry
# ============================================================

class TestManifest:
    """Manifest stores asset metadata on disk — consumed by the asset API."""

    def test_register_and_retrieve_asset(self):
        from desktop.media_classification import get_asset_meta, register_asset
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch('desktop.media_classification.MANIFEST_PATH',
                       os.path.join(tmpdir, 'manifest.json')), \
                 patch('desktop.media_classification.MEDIA_CACHE_ROOT', tmpdir):
                register_asset('sha123', 'image', 'public_educational', 'test prompt', 1024)
                meta = get_asset_meta('sha123')
        assert meta is not None
        assert meta['label'] == 'public_educational'
        assert meta['type'] == 'image'
        assert meta['size'] == 1024

    def test_prompt_truncated_to_200(self):
        """Long prompts must be truncated — prevents manifest bloat."""
        from desktop.media_classification import get_asset_meta, register_asset
        with tempfile.TemporaryDirectory() as tmpdir:
            with patch('desktop.media_classification.MANIFEST_PATH',
                       os.path.join(tmpdir, 'manifest.json')), \
                 patch('desktop.media_classification.MEDIA_CACHE_ROOT', tmpdir):
                long_prompt = "x" * 500
                register_asset('sha456', 'image', 'user_private', long_prompt)
                meta = get_asset_meta('sha456')
        assert len(meta['prompt']) <= 200

    def test_corrupt_manifest_recovery(self):
        """Corrupt JSON must not crash — returns empty dict and logs warning."""
        from desktop.media_classification import _load_manifest
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
            f.write("not valid json{{{")
            f.flush()
            with patch('desktop.media_classification.MANIFEST_PATH', f.name):
                result = _load_manifest()
        os.unlink(f.name)
        assert result == {}
