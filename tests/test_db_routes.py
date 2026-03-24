"""
test_db_routes.py - Comprehensive tests for routes/db_routes.py

Covers all public functions and route handlers:
- _resolve_nunba_dir, _get_db, _init_db, _flatten
- POST/GET /create_action
- GET /get_visual_bymins, /action_by_user_id
- POST/GET /conversation
- POST /db/getstudent_by_user_id, /getstudent_by_user_id
- POST /createpromptlist
- GET /getprompt/, /getprompt_onlyuserid/, /getprompt_all/
- POST /db/pdf_file, PUT /db/pdf_file/<id>
- POST /db/layout, GET /db/layouts
- GET /db/pdf_files
- POST /add_batch_layouts
- register_db_routes
"""
import json
import os
import sqlite3
import sys
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def tmp_nunba_dir(tmp_path):
    """Provide an isolated NUNBA_DATA_DIR for DB routes."""
    data_dir = tmp_path / "nunba_test"
    data_dir.mkdir()
    return str(data_dir)


@pytest.fixture
def db_app(tmp_nunba_dir):
    """Create a minimal Flask app with db_routes registered, using temp DB."""
    from flask import Flask

    with patch.dict(os.environ, {"NUNBA_DATA_DIR": tmp_nunba_dir}):
        # Force reload of the module so it picks up the patched env
        import importlib

        import routes.db_routes as db_mod
        importlib.reload(db_mod)

        app = Flask(__name__, static_folder=None)
        app.config["TESTING"] = True
        db_mod.register_db_routes(app)

    # Expose module reference for direct function testing
    app._db_mod = db_mod
    return app


@pytest.fixture
def client(db_app):
    """Flask test client."""
    return db_app.test_client()


@pytest.fixture
def db_mod(db_app):
    """Direct reference to the db_routes module (already initialized)."""
    return db_app._db_mod


# ============================================================
# Unit tests: _resolve_nunba_dir
# ============================================================

class TestResolveNunbaDir:

    def test_returns_env_var_when_set(self, tmp_path):
        custom_dir = str(tmp_path / "custom")
        with patch.dict(os.environ, {"NUNBA_DATA_DIR": custom_dir}):
            from routes.db_routes import _resolve_nunba_dir
            # Re-call the function directly
            result = _resolve_nunba_dir()
            assert result == custom_dir

    def test_falls_back_to_home_documents(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("NUNBA_DATA_DIR", None)
            with patch.dict("sys.modules", {"core": None, "core.platform_paths": None}):
                from routes.db_routes import _resolve_nunba_dir
                result = _resolve_nunba_dir()
                expected = os.path.join(os.path.expanduser("~"), "Documents", "Nunba")
                assert result == expected

    def test_uses_platform_paths_when_available(self):
        mock_mod = MagicMock()
        mock_mod.get_data_dir.return_value = "/custom/platform/path"
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop("NUNBA_DATA_DIR", None)
            with patch.dict("sys.modules", {
                "core": MagicMock(),
                "core.platform_paths": mock_mod,
            }):
                from routes.db_routes import _resolve_nunba_dir
                result = _resolve_nunba_dir()
                assert result == "/custom/platform/path"


# ============================================================
# Unit tests: _flatten
# ============================================================

class TestFlatten:

    def test_flat_list(self, db_mod):
        assert db_mod._flatten(["a", "b", "c"]) == ["a", "b", "c"]

    def test_nested_lists(self, db_mod):
        assert db_mod._flatten([["a", "b"], "c", ["d"]]) == ["a", "b", "c", "d"]

    def test_empty_list(self, db_mod):
        assert db_mod._flatten([]) == []

    def test_integers_become_strings(self, db_mod):
        assert db_mod._flatten([1, [2, 3]]) == ["1", "2", "3"]

    def test_mixed_types(self, db_mod):
        assert db_mod._flatten(["x", [1, "y"]]) == ["x", "1", "y"]


# ============================================================
# Action routes: POST/GET /create_action
# ============================================================

class TestCreateOrGetActions:

    def test_post_creates_action(self, client):
        resp = client.post("/create_action", json={
            "user_id": 42,
            "action": "Viewed page",
            "conv_id": "conv-1",
            "zeroshot_label": "view",
            "gpt3_label": "Visual Context",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert "action_id" in data
        assert data["status"] == "created"

    def test_post_action_text_capped_at_100(self, client):
        long_action = "x" * 200
        resp = client.post("/create_action", json={
            "user_id": 1,
            "action": long_action,
        })
        assert resp.status_code == 200
        # Verify stored value is capped
        get_resp = client.get("/create_action?user_id=1")
        actions = get_resp.get_json()
        assert len(actions) == 1
        assert len(actions[0]["action"]) == 100

    def test_post_defaults(self, client):
        resp = client.post("/create_action", json={})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "created"

    def test_get_actions_by_user_id(self, client):
        # Create two actions for user 99
        client.post("/create_action", json={"user_id": 99, "action": "a1"})
        client.post("/create_action", json={"user_id": 99, "action": "a2"})
        # Create one for different user
        client.post("/create_action", json={"user_id": 100, "action": "a3"})

        resp = client.get("/create_action?user_id=99")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 2

    def test_get_actions_no_user_id_returns_empty(self, client):
        resp = client.get("/create_action")
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_get_actions_nonexistent_user_returns_empty(self, client):
        resp = client.get("/create_action?user_id=9999")
        assert resp.status_code == 200
        assert resp.get_json() == []


# ============================================================
# Visual/time-window routes: GET /get_visual_bymins
# ============================================================

class TestGetVisualByMins:

    def test_no_user_id_returns_empty(self, client):
        resp = client.get("/get_visual_bymins")
        assert resp.status_code == 200
        assert resp.get_json() == []

    def test_returns_recent_actions(self, client):
        # Insert an action (should be within last 60 mins)
        client.post("/create_action", json={
            "user_id": 5, "action": "recent", "gpt3_label": "Visual Context",
        })
        resp = client.get("/get_visual_bymins?user_id=5&mins=60")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) >= 1

    def test_action_by_user_id_alias(self, client):
        client.post("/create_action", json={"user_id": 6, "action": "test"})
        resp = client.get("/action_by_user_id?user_id=6")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) >= 1

    def test_default_mins_is_60(self, client):
        """When mins param is absent, defaults to 60."""
        client.post("/create_action", json={"user_id": 7, "action": "x"})
        resp = client.get("/get_visual_bymins?user_id=7")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) >= 1


# ============================================================
# Conversation routes: POST/GET /conversation
# ============================================================

class TestConversation:

    def test_post_creates_conversation(self, client):
        resp = client.post("/conversation", json={
            "user_id": 10,
            "request": "What is AI?",
            "response": "AI is...",
            "topic": "general",
            "request_id": "req-001",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert "conv_id" in data

    def test_post_defaults(self, client):
        resp = client.post("/conversation", json={"user_id": 1})
        assert resp.status_code == 200
        data = resp.get_json()
        assert "conv_id" in data

    def test_get_by_user_id(self, client):
        client.post("/conversation", json={"user_id": 20, "topic": "math"})
        client.post("/conversation", json={"user_id": 20, "topic": "science"})
        resp = client.get("/conversation?user_id=20")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 2

    def test_get_by_topic(self, client):
        client.post("/conversation", json={"user_id": 30, "topic": "art"})
        client.post("/conversation", json={"user_id": 30, "topic": "music"})
        resp = client.get("/conversation?user_id=30&topic=art")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["topic"] == "art"

    def test_get_by_request_id(self, client):
        client.post("/conversation", json={"user_id": 40, "request_id": "unique-req"})
        resp = client.get("/conversation?request_id=unique-req")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1

    def test_get_with_limit(self, client):
        for i in range(5):
            client.post("/conversation", json={"user_id": 50, "topic": f"t{i}"})
        resp = client.get("/conversation?user_id=50&limit=2")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 2

    def test_get_no_filters_returns_all(self, client):
        client.post("/conversation", json={"user_id": 60})
        resp = client.get("/conversation")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) >= 1

    def test_revision_truthy(self, client):
        resp = client.post("/conversation", json={"user_id": 1, "revision": True})
        assert resp.status_code == 200


# ============================================================
# Student/user profile: POST /db/getstudent_by_user_id
# ============================================================

class TestGetStudentByUserId:

    def test_fallback_returns_defaults(self, client):
        """When social DB is unavailable, returns default profile."""
        resp = client.post("/db/getstudent_by_user_id", json={"user_id": 123})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["user_id"] == 123
        assert data["preferred_language"] == "English"
        assert data["display_name"] == "User 123"

    def test_alias_route(self, client):
        resp = client.post("/getstudent_by_user_id", json={"user_id": 456})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["user_id"] == 456

    def test_social_db_user_found(self, client):
        """When social user exists, returns their data."""
        mock_user = MagicMock()
        mock_user.id = 7
        mock_user.preferred_language = "Spanish"
        mock_user.standard = "10th"
        mock_user.board = "CBSE"
        mock_user.display_name = "TestUser"
        mock_user.email = "test@example.com"

        mock_session = MagicMock()
        mock_session.__enter__ = MagicMock(return_value=mock_session)
        mock_session.__exit__ = MagicMock(return_value=False)
        mock_session.query.return_value.get.return_value = mock_user

        with patch.dict("sys.modules", {
            "integrations": MagicMock(),
            "integrations.social": MagicMock(),
            "integrations.social.models": MagicMock(
                User=MagicMock,
                db_session=MagicMock(return_value=mock_session),
            ),
        }):
            resp = client.post("/db/getstudent_by_user_id", json={"user_id": 7})
            assert resp.status_code == 200
            data = resp.get_json()
            assert data["preferred_language"] == "Spanish"
            assert data["display_name"] == "TestUser"

    def test_default_user_id_zero(self, client):
        resp = client.post("/db/getstudent_by_user_id", json={})
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["user_id"] == 0


# ============================================================
# Prompt (agent) routes
# ============================================================

class TestCreatePromptList:

    def test_sync_prompts(self, client):
        resp = client.post("/createpromptlist", json={
            "listprompts": [
                {"prompt_id": "agent-1", "prompt": "Do X", "user_id": 1, "name": "Agent One"},
                {"prompt_id": "agent-2", "prompt": "Do Y", "user_id": 1, "name": "Agent Two"},
            ]
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "ok"
        assert data["synced"] == 2

    def test_skips_entries_without_prompt_id(self, client):
        resp = client.post("/createpromptlist", json={
            "listprompts": [
                {"prompt": "No ID here", "user_id": 1},
                {"prompt_id": "valid-1", "prompt": "Has ID", "user_id": 1},
            ]
        })
        data = resp.get_json()
        assert data["synced"] == 1

    def test_empty_list(self, client):
        resp = client.post("/createpromptlist", json={"listprompts": []})
        data = resp.get_json()
        assert data["synced"] == 0

    def test_merge_preserves_existing_fields(self, client):
        # Create initial prompt
        client.post("/createpromptlist", json={
            "listprompts": [{"prompt_id": "merge-test", "prompt": "Original", "name": "OG"}]
        })
        # Update with partial data
        client.post("/createpromptlist", json={
            "listprompts": [{"prompt_id": "merge-test", "name": "Updated Name"}]
        })
        # Fetch and verify merge
        resp = client.get("/getprompt/?prompt_id=merge-test")
        data = resp.get_json()
        assert data["name"] == "Updated Name"
        # goal should still be "Original" from the first sync
        assert data["prompt"] == "Original"


class TestGetPrompt:

    def test_missing_prompt_id_returns_400(self, client):
        resp = client.get("/getprompt/")
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_nonexistent_prompt_returns_404(self, client):
        resp = client.get("/getprompt/?prompt_id=doesnotexist")
        assert resp.status_code == 404

    def test_existing_prompt_returns_data(self, client):
        client.post("/createpromptlist", json={
            "listprompts": [{"prompt_id": "fetch-me", "prompt": "Goal", "name": "FetchAgent", "user_id": 5}]
        })
        resp = client.get("/getprompt/?prompt_id=fetch-me")
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["prompt_id"] == "fetch-me"
        assert data["name"] == "FetchAgent"
        assert data["source"] == "local"


class TestGetPromptByUser:

    def test_returns_user_prompts(self, client):
        client.post("/createpromptlist", json={
            "listprompts": [
                {"prompt_id": "u1-agent", "user_id": 10, "name": "A"},
                {"prompt_id": "u2-agent", "user_id": 20, "name": "B"},
            ]
        })
        resp = client.get("/getprompt_onlyuserid/?user_id=10")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1
        assert data[0]["prompt_id"] == "u1-agent"

    def test_no_user_id_returns_all(self, client):
        client.post("/createpromptlist", json={
            "listprompts": [
                {"prompt_id": "all-1", "user_id": 1, "name": "X"},
                {"prompt_id": "all-2", "user_id": 2, "name": "Y"},
            ]
        })
        resp = client.get("/getprompt_onlyuserid/")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) >= 2

    def test_filters_out_recipe_and_vlm_files(self, client, db_mod):
        """Files with _recipe or _vlm_agent in name should be excluded."""
        prompts_dir = db_mod._get_prompts_dir()
        # Write a recipe file directly
        recipe_file = prompts_dir / "test_recipe.json"
        recipe_file.write_text(json.dumps({"user_id": 1, "name": "recipe"}))
        vlm_file = prompts_dir / "test_vlm_agent.json"
        vlm_file.write_text(json.dumps({"user_id": 1, "name": "vlm"}))

        resp = client.get("/getprompt_onlyuserid/?user_id=1")
        data = resp.get_json()
        names = [p["name"] for p in data]
        assert "recipe" not in names
        assert "vlm" not in names


class TestGetAllPrompts:

    def test_returns_all_prompts(self, client):
        client.post("/createpromptlist", json={
            "listprompts": [
                {"prompt_id": "pub-1", "user_id": 1, "name": "P1"},
                {"prompt_id": "pub-2", "user_id": 2, "name": "P2"},
            ]
        })
        resp = client.get("/getprompt_all/")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) >= 2


# ============================================================
# PDF file routes
# ============================================================

class TestPdfFileRoutes:

    def test_create_pdf_file(self, client):
        resp = client.post("/db/pdf_file", json={
            "user_id": 1, "filename": "test.pdf", "directory": "/tmp",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert "file_id" in data

    def test_update_pdf_file(self, client):
        # Create first
        create_resp = client.post("/db/pdf_file", json={
            "user_id": 1, "filename": "update.pdf",
        })
        file_id = create_resp.get_json()["file_id"]

        # Update
        resp = client.put(f"/db/pdf_file/{file_id}", json={
            "status": "completed", "total_pages": 42,
            "book_name": "Test Book",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["status"] == "updated"
        assert data["file_id"] == file_id

    def test_get_pdf_files_by_user(self, client):
        client.post("/db/pdf_file", json={"user_id": 77, "filename": "a.pdf"})
        client.post("/db/pdf_file", json={"user_id": 77, "filename": "b.pdf"})
        client.post("/db/pdf_file", json={"user_id": 88, "filename": "c.pdf"})

        resp = client.get("/db/pdf_files?user_id=77")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 2

    def test_get_pdf_files_no_user_returns_all(self, client):
        client.post("/db/pdf_file", json={"user_id": 1, "filename": "x.pdf"})
        resp = client.get("/db/pdf_files")
        assert resp.status_code == 200
        assert len(resp.get_json()) >= 1


# ============================================================
# Layout routes
# ============================================================

class TestLayoutRoutes:

    def _create_pdf(self, client):
        resp = client.post("/db/pdf_file", json={"user_id": 1, "filename": "lay.pdf"})
        return resp.get_json()["file_id"]

    def test_create_single_layout(self, client):
        file_id = self._create_pdf(client)
        resp = client.post("/db/layout", json={
            "file_id": file_id, "page_number": 1, "passage": "Hello world",
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert "layout_id" in data

    def test_create_batch_layouts(self, client):
        file_id = self._create_pdf(client)
        resp = client.post("/db/layout", json={
            "layouts": [
                {"file_id": file_id, "page_number": 1, "passage": "p1"},
                {"file_id": file_id, "page_number": 2, "passage": "p2"},
            ]
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert "layout_ids" in data
        assert len(data["layout_ids"]) == 2

    def test_get_layouts_requires_file_id(self, client):
        resp = client.get("/db/layouts")
        assert resp.status_code == 400
        assert "error" in resp.get_json()

    def test_get_layouts_by_file_id(self, client):
        file_id = self._create_pdf(client)
        client.post("/db/layout", json={"file_id": file_id, "page_number": 1, "passage": "a"})
        client.post("/db/layout", json={"file_id": file_id, "page_number": 2, "passage": "b"})

        resp = client.get(f"/db/layouts?file_id={file_id}")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 2

    def test_get_layouts_with_page_filter(self, client):
        file_id = self._create_pdf(client)
        client.post("/db/layout", json={"file_id": file_id, "page_number": 1, "passage": "page1"})
        client.post("/db/layout", json={"file_id": file_id, "page_number": 2, "passage": "page2"})

        resp = client.get(f"/db/layouts?file_id={file_id}&page_number=1")
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data) == 1

    def test_layout_bbox_serialized_as_json(self, client):
        file_id = self._create_pdf(client)
        bbox = [10, 20, 100, 200]
        client.post("/db/layout", json={
            "file_id": file_id, "page_number": 1, "bbox": bbox,
        })
        resp = client.get(f"/db/layouts?file_id={file_id}")
        data = resp.get_json()
        stored_bbox = json.loads(data[0]["bbox"])
        assert stored_bbox == bbox


# ============================================================
# Batch layouts: POST /add_batch_layouts
# ============================================================

class TestAddBatchLayouts:

    def _create_pdf(self, client):
        resp = client.post("/db/pdf_file", json={"user_id": 1, "filename": "batch.pdf"})
        return resp.get_json()["file_id"]

    def test_batch_layouts_basic(self, client):
        file_id = self._create_pdf(client)
        resp = client.post("/add_batch_layouts", json={
            "file_id": file_id,
            "response_dict": {
                "output": {"page_1": "Text of page 1", "page_2": "Text of page 2"},
                "whole_text": "Full text",
            },
            "total_pages_in_book": 2,
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["layout_text_list"]) == 2
        assert len(data["layout_id_list"]) == 2

    def test_batch_layouts_with_topics_and_chapters(self, client):
        file_id = self._create_pdf(client)
        resp = client.post("/add_batch_layouts", json={
            "file_id": file_id,
            "response_dict": {
                "output": {"page_1": "Intro text"},
                "whole_text": "All",
            },
            "final_topic_names": ["Introduction"],
            "final_topic_page_numbers": ["1"],
            "toc_chapter_names": ["Chapter 1"],
            "toc_chapter_page_numbers": ["1"],
            "page_types": {"page_1": "content"},
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert len(data["layout_id_list"]) == 1

    def test_batch_layouts_nested_topic_lists(self, client):
        file_id = self._create_pdf(client)
        resp = client.post("/add_batch_layouts", json={
            "file_id": file_id,
            "response_dict": {
                "output": {"page_1": "T1", "page_2": "T2"},
                "whole_text": "",
            },
            "final_topic_names": [["Topic A"], ["Topic B"]],
            "final_topic_page_numbers": [["1"], ["2"]],
        })
        assert resp.status_code == 200
        assert len(resp.get_json()["layout_id_list"]) == 2

    def test_batch_layouts_updates_pdf_file(self, client):
        file_id = self._create_pdf(client)
        client.post("/add_batch_layouts", json={
            "file_id": file_id,
            "response_dict": {"output": {"page_1": "t"}, "whole_text": "full"},
            "total_pages_in_book": 10,
        })
        # Verify pdf_files record was updated
        resp = client.get("/db/pdf_files?user_id=1")
        pdfs = resp.get_json()
        match = [p for p in pdfs if p["file_id"] == file_id]
        assert len(match) == 1
        assert match[0]["status"] == "completed"
        assert match[0]["total_pages"] == 10

    def test_batch_layouts_empty_response_dict(self, client):
        file_id = self._create_pdf(client)
        resp = client.post("/add_batch_layouts", json={
            "file_id": file_id,
            "response_dict": {},
        })
        assert resp.status_code == 200
        data = resp.get_json()
        assert data["layout_text_list"] == []
        assert data["layout_id_list"] == []

    def test_batch_layouts_page_type_list(self, client):
        """page_types values can be lists (first element used)."""
        file_id = self._create_pdf(client)
        resp = client.post("/add_batch_layouts", json={
            "file_id": file_id,
            "response_dict": {"output": {"page_1": "txt"}, "whole_text": ""},
            "page_types": {"page_1": ["content", "toc"]},
        })
        assert resp.status_code == 200

    def test_batch_layouts_no_file_id_fails_integrity(self, client):
        """When file_id is None, INSERT fails due to NOT NULL constraint on page_layouts.file_id."""
        with pytest.raises(sqlite3.IntegrityError, match="NOT NULL"):
            client.post("/add_batch_layouts", json={
                "file_id": None,
                "response_dict": {"output": {"page_1": "txt"}, "whole_text": ""},
            })


# ============================================================
# register_db_routes
# ============================================================

class TestRegisterDbRoutes:

    def test_registers_blueprint(self, db_mod):
        from flask import Flask
        app = Flask(__name__)
        db_mod.register_db_routes(app)
        # Check some expected rules exist
        rules = [r.rule for r in app.url_map.iter_rules()]
        assert "/create_action" in rules
        assert "/conversation" in rules
        assert "/createpromptlist" in rules
        assert "/db/layout" in rules
