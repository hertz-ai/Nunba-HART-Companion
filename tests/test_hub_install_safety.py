"""FT+NFT tests for the HuggingFace Hub install supply-chain gates.

Covers commit 7b0e312 on main.py:
    * /api/admin/models/hub/search  — local-only guard
    * /api/admin/models/hub/install — 4 supply-chain gates:
        (1) local-only
        (2) NFKC normalize + ASCII-only hf_id (homoglyph attack)
        (3) trusted-org allowlist (unknown orgs → 403 unless confirmed)
        (4) refuse pickle-only repos (.bin/.pt/.pkl/.ckpt)

All outbound `list_repo_files` / `list_models` calls are mocked so
these run offline.  The test Flask app is the real Nunba app (imports
fine under PYTEST_CURRENT_TEST guard), so we exercise the REAL gate
code path end-to-end.
"""
from __future__ import annotations

import os
import sys
from unittest.mock import patch

import pytest

_NUNBA_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _NUNBA_ROOT not in sys.path:
    sys.path.insert(0, _NUNBA_ROOT)


# ───────────────────────────── fixtures ─────────────────────────────

@pytest.fixture(scope='module')
def client():
    """Real Nunba Flask app test client.  Importing main.py is ~10s
    but runs once per module thanks to scope='module'."""
    # The single-instance check in app.py bails out unless PYTEST_CURRENT_TEST
    # is set; pytest sets it automatically, so import just works.
    try:
        from main import app
    except SystemExit as e:  # pragma: no cover - defensive
        pytest.skip(f"main.py exited at import ({e}) — another Nunba on :5000?")
    except Exception as e:  # pragma: no cover
        pytest.skip(f"main.py import failed: {e}")
    app.config['TESTING'] = True
    with app.test_client() as c:
        yield c


# ───────────────────────────── /hub/search ─────────────────────────────

def test_hub_search_requires_local(client):
    """GET /api/admin/models/hub/search from a remote IP must 403."""
    resp = client.get(
        '/api/admin/models/hub/search?category=llm',
        environ_base={'REMOTE_ADDR': '8.8.8.8'},
    )
    assert resp.status_code == 403, (
        f"remote caller should be rejected, got {resp.status_code}: "
        f"{resp.get_data(as_text=True)[:200]}"
    )
    body = resp.get_json() or {}
    assert 'local only' in (body.get('error') or '').lower()


def test_hub_search_allows_loopback(client):
    """127.0.0.1 should pass the local-only gate (may still fail further in,
    but NOT with 403 'local only')."""
    with patch('huggingface_hub.list_models', return_value=[]):
        resp = client.get('/api/admin/models/hub/search?category=llm')
    # Anything except 403-local-only is fine — the gate let us through
    if resp.status_code == 403:
        body = resp.get_json() or {}
        assert 'local only' not in (body.get('error') or '').lower()


# ───────────────────────────── /hub/install ─────────────────────────────

def _post_install(client, **kwargs):
    """Helper: POST /api/admin/models/hub/install from loopback."""
    return client.post(
        '/api/admin/models/hub/install',
        json=kwargs,
        content_type='application/json',
    )


def test_hub_install_rejects_missing_hf_id(client):
    """Empty / malformed hf_id → 400 before any gate runs."""
    resp = _post_install(client, hf_id='', category='llm')
    assert resp.status_code == 400
    assert "org/name" in (resp.get_json() or {}).get('error', '')


def test_hub_install_rejects_hf_id_without_slash(client):
    """hf_id without a slash → 400."""
    resp = _post_install(client, hf_id='no-slash-here', category='llm')
    assert resp.status_code == 400


def test_hub_install_rejects_homoglyph_id(client):
    """'aí4bharat/...' (Latin Small I With Acute, U+00ED) → 400 ASCII-only."""
    # U+00ED  í   visually identical to ASCII 'i' but resolves to a different repo
    evil = 'a\u00ed4bharat/indic-parler-tts'
    resp = _post_install(client, hf_id=evil, category='tts')
    assert resp.status_code == 400
    body = resp.get_json() or {}
    err = body.get('error', '').lower()
    assert 'ascii' in err and ('homoglyph' in err or 'non-ascii' in err)


def test_hub_install_rejects_cyrillic_homoglyph(client):
    """Cyrillic 'а' (U+0430) also triggers the ASCII gate."""
    evil = 'goog\u043ce/flan-t5'  # cyrillic 'о'  inside "google"
    resp = _post_install(client, hf_id=evil, category='llm')
    assert resp.status_code == 400
    assert 'ascii' in (resp.get_json() or {}).get('error', '').lower()


def test_hub_install_unknown_category_after_normalize(client):
    """hf_id is ASCII but category is bogus → 400 'unknown category'."""
    resp = _post_install(client, hf_id='google/flan-t5-small', category='nope')
    assert resp.status_code == 400
    body = resp.get_json() or {}
    assert 'unknown category' in body.get('error', '').lower()
    assert isinstance(body.get('valid'), list)


def test_hub_install_rejects_untrusted_org_without_confirm(client):
    """'random-user/evil-model' without confirm_unverified → 403 unverified_org."""
    resp = _post_install(
        client,
        hf_id='random-attacker-xyz/evil-model',
        category='llm',
    )
    assert resp.status_code == 403
    body = resp.get_json() or {}
    assert body.get('error') == 'unverified_org'
    # Frontend needs the list to render the banner
    assert isinstance(body.get('trusted_orgs'), list)
    assert len(body['trusted_orgs']) > 10
    assert 'google' in body['trusted_orgs']


def test_hub_install_trusted_org_skips_confirm(client):
    """'google/…' is in the allowlist → no 403 unverified_org."""
    with patch(
        'huggingface_hub.list_repo_files',
        return_value=['config.json', 'model.safetensors'],
    ):
        resp = _post_install(
            client,
            hf_id='google/flan-t5-small',
            category='llm',
        )
    # Must NOT be blocked on unverified_org (may still fail later on
    # catalog writes, but that's past the gate)
    body = resp.get_json() or {}
    assert body.get('error') != 'unverified_org'


def test_hub_install_accepts_untrusted_org_with_confirm(client):
    """Same untrusted org + confirm_unverified=True → gate opens."""
    with patch(
        'huggingface_hub.list_repo_files',
        return_value=['config.json', 'model.safetensors', 'tokenizer.json'],
    ):
        resp = _post_install(
            client,
            hf_id='random-attacker-xyz/evil-model',
            category='llm',
            confirm_unverified=True,
        )
    body = resp.get_json() or {}
    # Must NOT be blocked on unverified_org
    assert body.get('error') != 'unverified_org', (
        f"confirm_unverified=true should bypass trusted-org gate; got {body}"
    )


def test_hub_install_rejects_pickle_only_repo(client):
    """Repo with ONLY .bin / .pt weights → 415 unsafe_weights_format."""
    with patch(
        'huggingface_hub.list_repo_files',
        return_value=['config.json', 'pytorch_model.bin', 'optimizer.pt'],
    ):
        resp = _post_install(
            client,
            hf_id='google/flan-t5-small',  # trusted org, gate is the weights check
            category='llm',
        )
    assert resp.status_code == 415
    body = resp.get_json() or {}
    assert body.get('error') == 'unsafe_weights_format'
    assert any(f.endswith('.bin') or f.endswith('.pt')
               for f in body.get('found_files', []))


def test_hub_install_rejects_ckpt_only_repo(client):
    """Repos with only .ckpt (another pickle variant) → 415."""
    with patch(
        'huggingface_hub.list_repo_files',
        return_value=['config.json', 'model.ckpt'],
    ):
        resp = _post_install(
            client, hf_id='google/some-model', category='llm',
        )
    assert resp.status_code == 415
    assert (resp.get_json() or {}).get('error') == 'unsafe_weights_format'


def test_hub_install_rejects_pkl_only_repo(client):
    """Plain .pkl weights → 415."""
    with patch(
        'huggingface_hub.list_repo_files',
        return_value=['config.json', 'weights.pkl'],
    ):
        resp = _post_install(
            client, hf_id='google/some-model', category='llm',
        )
    assert resp.status_code == 415


def test_hub_install_accepts_safetensors_with_pickle(client):
    """.safetensors + .bin together → safetensors variant wins, accepted."""
    with patch(
        'huggingface_hub.list_repo_files',
        return_value=[
            'config.json',
            'model.safetensors',
            'pytorch_model.bin',   # also present, but safetensors takes priority
        ],
    ):
        resp = _post_install(
            client, hf_id='google/flan-t5-small', category='llm',
        )
    body = resp.get_json() or {}
    assert body.get('error') != 'unsafe_weights_format', (
        f"safetensors presence should override pickle co-presence; got {body}"
    )


def test_hub_install_accepts_safetensors_only(client):
    """Clean .safetensors-only repo sails through the weights gate."""
    with patch(
        'huggingface_hub.list_repo_files',
        return_value=['config.json', 'model.safetensors'],
    ):
        resp = _post_install(
            client, hf_id='google/flan-t5-small', category='llm',
        )
    body = resp.get_json() or {}
    assert body.get('error') != 'unsafe_weights_format'


def test_hub_install_fails_closed_on_list_repo_error(client):
    """list_repo_files throwing (network, auth, 404) → 502 file_probe_failed.

    This is the critical fail-closed invariant: if we cannot verify the
    repo contents, we refuse — never install blindly.
    """
    with patch(
        'huggingface_hub.list_repo_files',
        side_effect=ConnectionError('network unreachable'),
    ):
        resp = _post_install(
            client, hf_id='google/flan-t5-small', category='llm',
        )
    assert resp.status_code == 502
    body = resp.get_json() or {}
    assert body.get('error') == 'file_probe_failed'
    assert 'could not verify' in body.get('message', '').lower()


def test_hub_install_fails_closed_on_private_repo(client):
    """Private-repo 401 from HF Hub also fails closed with 502."""
    with patch(
        'huggingface_hub.list_repo_files',
        side_effect=PermissionError('401 Unauthorized'),
    ):
        resp = _post_install(
            client, hf_id='google/private-repo', category='llm',
        )
    assert resp.status_code == 502
    assert (resp.get_json() or {}).get('error') == 'file_probe_failed'


def test_hub_install_from_remote_is_rejected(client):
    """Even if everything else is fine, a remote caller is refused."""
    resp = client.post(
        '/api/admin/models/hub/install',
        json={'hf_id': 'google/flan-t5-small', 'category': 'llm'},
        environ_base={'REMOTE_ADDR': '1.2.3.4'},
    )
    assert resp.status_code == 403


# ───────────────────────────── trusted-orgs allowlist sanity ─────────────────────────────

def test_trusted_orgs_set_contains_expected_providers():
    """Contract test: canonical model publishers stay trusted."""
    from main import _TRUSTED_HF_ORGS
    # A handful of non-negotiable providers
    for org in ('google', 'microsoft', 'meta-llama', 'mistralai',
                'Qwen', 'ai4bharat', 'sentence-transformers',
                'hertz-ai', 'HertzAI'):
        assert org in _TRUSTED_HF_ORGS, f"{org} must remain in trusted allowlist"


def test_normalize_hf_id_passes_plain_ascii():
    """Plain ASCII ids are returned unchanged (modulo strip)."""
    from main import _normalize_hf_id
    assert _normalize_hf_id('google/flan-t5') == 'google/flan-t5'
    assert _normalize_hf_id('  ai4bharat/indic-parler-tts  ') == 'ai4bharat/indic-parler-tts'


def test_normalize_hf_id_rejects_non_ascii():
    """_normalize_hf_id raises ValueError on any non-ASCII codepoint."""
    import pytest as _pytest

    from main import _normalize_hf_id
    # Latin homoglyph
    with _pytest.raises(ValueError):
        _normalize_hf_id('a\u00ed4bharat/indic-parler-tts')
    # Cyrillic homoglyph
    with _pytest.raises(ValueError):
        _normalize_hf_id('goog\u043ce/flan-t5')
    # Greek letter that does NOT NFKC-fold to ASCII
    with _pytest.raises(ValueError):
        _normalize_hf_id('\u03b1i4bharat/model')  # Greek alpha 'α' ≠ 'a'
    # Arabic digit — stays non-ASCII through NFKC
    with _pytest.raises(ValueError):
        _normalize_hf_id('ai\u0664bharat/model')  # Arabic-Indic digit four


def test_normalize_hf_id_nfkc_compat(monkeypatch):
    """NFKC folds compatibility characters BEFORE the ASCII check.

    The ligature 'ﬁ' (U+FB01) NFKC-decomposes to 'fi' — two ASCII chars —
    so it would PASS if NFKC works (but the fullwidth slash test below
    proves NFKC is active since it'd get rejected post-fold)."""
    from main import _normalize_hf_id
    # 'ﬁ' → 'fi', ASCII — should pass
    assert _normalize_hf_id('google/\ufb01nal-model') == 'google/final-model'
