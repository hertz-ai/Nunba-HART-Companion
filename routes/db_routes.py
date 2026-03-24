"""Local DB routes — replaces cloud database endpoints for fully offline operation.

Replaces these cloud endpoints (previously at azurekong.hertzai.com):
  POST /create_action        — Store user actions/interactions (vision context, audit trail)
  GET  /create_action        — Query actions by user_id (returns all, filtered client-side)
  POST /conversation         — Store conversation records (user ↔ agent)
  GET  /conversation         — Query conversations by user_id/topic
  POST /db/getstudent_by_user_id — Get user profile (language, grade)
  POST /createpromptlist      — Sync agent configs (mirrors cloud createpromptlist)
  GET  /getprompt             — Fetch agent config by prompt_id
  GET  /getprompt_onlyuserid  — List user's agents
  GET  /getprompt_all         — List all public agents
  POST /db/layout             — Store PDF page layout data
  GET  /db/layouts            — Query layouts by file_id

SQLite storage at ~/Documents/Nunba/data/nunba_db.sqlite
"""
import json
import logging
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from flask import Blueprint, jsonify, request

logger = logging.getLogger(__name__)

db_bp = Blueprint('db', __name__)

# ── Database path (cross-platform) ──
def _resolve_nunba_dir():
    env = os.environ.get('NUNBA_DATA_DIR', '')
    if env:
        return env
    try:
        from core.platform_paths import get_data_dir
        return get_data_dir()
    except ImportError:
        return os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba')

NUNBA_DIR = Path(_resolve_nunba_dir())
DATA_DIR = NUNBA_DIR / 'data'
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / 'nunba_db.sqlite'


def _get_db():
    """Get a thread-local SQLite connection."""
    conn = sqlite3.connect(str(DB_PATH), timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _init_db():
    """Create all tables if they don't exist."""
    conn = _get_db()
    try:
        conn.executescript("""
            -- Actions table (replaces cloud /create_action)
            -- Used by: VisionService._post_description_to_db(), Image_Inference_Tool,
            -- action audit trail, Last_5_Minutes_Visual_Context queries
            CREATE TABLE IF NOT EXISTS actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                conv_id TEXT,
                user_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                zeroshot_label TEXT DEFAULT '',
                gpt3_label TEXT DEFAULT '',
                created_date TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_actions_user ON actions(user_id);
            CREATE INDEX IF NOT EXISTS idx_actions_label ON actions(gpt3_label);
            CREATE INDEX IF NOT EXISTS idx_actions_created ON actions(created_date);

            -- Conversations table (replaces cloud /conversation)
            -- Used by: save_conversation_db() in create_recipe.py, reuse_recipe.py
            CREATE TABLE IF NOT EXISTS conversations (
                conv_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                request TEXT,
                response TEXT,
                conv_bot_name TEXT DEFAULT 'Local LLM',
                topic TEXT,
                revision INTEGER DEFAULT 0,
                dialogue_id TEXT,
                card_type TEXT DEFAULT 'Custom GPT',
                qid TEXT,
                layout_id TEXT,
                layout_list TEXT DEFAULT '[]',
                request_token INTEGER DEFAULT 0,
                response_token INTEGER DEFAULT 0,
                request_id TEXT,
                historical_request_id TEXT DEFAULT '[]',
                created_date TEXT NOT NULL DEFAULT (datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_conv_user ON conversations(user_id);
            CREATE INDEX IF NOT EXISTS idx_conv_topic ON conversations(topic);
            CREATE INDEX IF NOT EXISTS idx_conv_request_id ON conversations(request_id);

            -- PDF files registry (replaces cloud hertz_ocr_req_res_table)
            -- Used by: PDF parsing pipeline
            CREATE TABLE IF NOT EXISTS pdf_files (
                file_id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                filename TEXT NOT NULL,
                directory TEXT,
                text_response TEXT,
                book_type TEXT,
                book_name TEXT,
                page_offset INTEGER DEFAULT 0,
                total_pages INTEGER DEFAULT 0,
                status TEXT DEFAULT 'pending',
                request_id TEXT,
                created_date TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_pdf_user ON pdf_files(user_id);

            -- Page layouts (replaces cloud layout + layoutforsegformer tables)
            -- Combined table since we use a single VLM instead of separate PubLayNet/Segformer
            CREATE TABLE IF NOT EXISTS page_layouts (
                layout_id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_id INTEGER NOT NULL,
                page_number INTEGER NOT NULL,
                layout_number INTEGER DEFAULT 1,
                num_layouts_per_page INTEGER DEFAULT 1,
                passage TEXT,
                topic_name TEXT,
                chapter_name TEXT,
                page_type TEXT,
                element_type TEXT,
                bbox TEXT,
                label TEXT,
                processing_time_ms INTEGER,
                created_date TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (file_id) REFERENCES pdf_files(file_id)
            );
            CREATE INDEX IF NOT EXISTS idx_layout_file ON page_layouts(file_id);
            CREATE INDEX IF NOT EXISTS idx_layout_page ON page_layouts(file_id, page_number);
        """)
        conn.commit()
    finally:
        conn.close()


# Initialize tables on import
_init_db()


# ══════════════════════════════════════════════════════════════════════════════
# ACTION ROUTES — replaces cloud /create_action
# Consumers: VisionService, Image_Inference_Tool, hart_intelligence action audit
# ══════════════════════════════════════════════════════════════════════════════

@db_bp.route('/create_action', methods=['POST', 'GET'])
def create_or_get_actions():
    """Create action (POST) or get actions by user_id (GET).

    POST payload: { conv_id, user_id, action, zeroshot_label, gpt3_label }
    GET params: ?user_id=X

    GET returns list of action dicts matching the cloud /create_action?user_id=X response.
    This is consumed by hart_intelligence for Last_5_Minutes_Visual_Context.
    """
    if request.method == 'GET':
        user_id = request.args.get('user_id', '')
        if not user_id:
            return jsonify([])

        conn = _get_db()
        try:
            rows = conn.execute(
                "SELECT * FROM actions WHERE user_id = ? ORDER BY created_date DESC LIMIT 500",
                (user_id,)
            ).fetchall()
            return jsonify([dict(r) for r in rows])
        finally:
            conn.close()

    # POST — create action
    data = request.get_json(force=True) if request.is_json else request.form.to_dict()

    user_id = data.get('user_id', 0)
    action_text = data.get('action', '')[:100]  # Cap at 100 chars like cloud
    conv_id = data.get('conv_id')
    zeroshot_label = data.get('zeroshot_label', '')
    gpt3_label = data.get('gpt3_label', '')

    conn = _get_db()
    try:
        now = datetime.now(UTC).isoformat()
        cursor = conn.execute(
            """INSERT INTO actions (conv_id, user_id, action, zeroshot_label, gpt3_label, created_date)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (conv_id, user_id, action_text, zeroshot_label, gpt3_label, now)
        )
        conn.commit()
        action_id = cursor.lastrowid
        return jsonify({"action_id": action_id, "status": "created"})
    finally:
        conn.close()


@db_bp.route('/get_visual_bymins', methods=['GET'])
@db_bp.route('/action_by_user_id', methods=['GET'])
def get_visual_by_mins():
    """Get recent visual/screen actions by user within a time window.

    Replaces cloud mailer.hertzai.com/get_visual_bymins?user_id=X&mins=Y
    Also serves as /action_by_user_id?user_id=X (ACTION_API endpoint).
    Consumers: helper.py get_visual_context(), get_screen_context(), search_visual_history()
    """
    user_id = request.args.get('user_id', '')
    mins = int(request.args.get('mins', 60))

    if not user_id:
        return jsonify([])

    conn = _get_db()
    try:
        # Filter actions within the last N minutes
        rows = conn.execute(
            """SELECT * FROM actions
               WHERE user_id = ?
                 AND created_date >= datetime('now', ? || ' minutes')
               ORDER BY created_date DESC
               LIMIT 500""",
            (user_id, f'-{mins}')
        ).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# CONVERSATION ROUTES — replaces cloud /conversation
# Consumers: save_conversation_db() in create_recipe.py, reuse_recipe.py
# ══════════════════════════════════════════════════════════════════════════════

@db_bp.route('/conversation', methods=['POST', 'GET'])
def conversation():
    """Create conversation record (POST) or query (GET).

    POST payload matches cloud contract:
    {
        request, response, user_id, conv_bot_name, topic, revision,
        dialogue_id, card_type, qid, layout_id, layout_list,
        request_token, response_token, request_id, historical_request_id
    }
    Returns: { conv_id: int }

    GET params: ?user_id=X&topic=Y&request_id=Z
    """
    if request.method == 'GET':
        user_id = request.args.get('user_id', '')
        topic = request.args.get('topic', '')
        request_id = request.args.get('request_id', '')
        limit = int(request.args.get('limit', 100))

        conn = _get_db()
        try:
            query = "SELECT * FROM conversations WHERE 1=1"
            params = []
            if user_id:
                query += " AND user_id = ?"
                params.append(user_id)
            if topic:
                query += " AND topic = ?"
                params.append(topic)
            if request_id:
                query += " AND request_id = ?"
                params.append(request_id)
            query += " ORDER BY created_date DESC LIMIT ?"
            params.append(limit)
            rows = conn.execute(query, params).fetchall()
            return jsonify([dict(r) for r in rows])
        finally:
            conn.close()

    # POST — create conversation
    data = request.get_json(force=True) if request.is_json else request.form.to_dict()

    conn = _get_db()
    try:
        now = datetime.now(UTC).isoformat()
        cursor = conn.execute(
            """INSERT INTO conversations
               (user_id, request, response, conv_bot_name, topic, revision,
                dialogue_id, card_type, qid, layout_id, layout_list,
                request_token, response_token, request_id, historical_request_id,
                created_date)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                data.get('user_id', 0),
                data.get('request', ''),
                data.get('response', ''),
                data.get('conv_bot_name', 'Local LLM'),
                data.get('topic', ''),
                1 if data.get('revision') else 0,
                data.get('dialogue_id'),
                data.get('card_type', 'Custom GPT'),
                data.get('qid'),
                data.get('layout_id'),
                data.get('layout_list', '[]'),
                data.get('request_token', 0),
                data.get('response_token', 0),
                data.get('request_id', ''),
                data.get('historical_request_id', '[]'),
                now,
            )
        )
        conn.commit()
        conv_id = cursor.lastrowid
        return jsonify({"conv_id": str(conv_id)})
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# STUDENT / USER PROFILE — replaces cloud /db/getstudent_by_user_id
# Consumers: hart_intelligence (language detection), helper.py:407
# ══════════════════════════════════════════════════════════════════════════════

@db_bp.route('/db/getstudent_by_user_id', methods=['POST'])
@db_bp.route('/getstudent_by_user_id', methods=['POST'])
def get_student_by_user_id():
    """Get user profile by user_id. Returns language, grade info.

    POST payload: { user_id: int }
    Returns: { user_id, preferred_language, standard, board, ... }

    Falls back to social DB user table for basic info.
    """
    data = request.get_json(force=True) if request.is_json else request.form.to_dict()
    user_id = data.get('user_id', 0)

    # Try to get from social DB (the user table has display_name, etc.)
    try:
        from integrations.social.models import User as SocialUser
        from integrations.social.models import db_session
        with db_session(commit=False) as session:
            user = session.query(SocialUser).get(int(user_id))
            if user:
                return jsonify({
                    "user_id": user.id,
                    "preferred_language": getattr(user, 'preferred_language', 'English'),
                    "standard": getattr(user, 'standard', ''),
                    "board": getattr(user, 'board', ''),
                    "display_name": user.display_name,
                    "email": user.email or '',
                })
    except Exception:
        pass

    # Fallback — return defaults
    return jsonify({
        "user_id": user_id,
        "preferred_language": "English",
        "standard": "",
        "board": "",
        "display_name": f"User {user_id}",
        "email": "",
    })


# ══════════════════════════════════════════════════════════════════════════════
# PROMPT (AGENT) ROUTES — replaces cloud /createpromptlist, /getprompt, etc.
# Consumers: hart_intelligence agent creation/reuse pipeline
# Note: Local /prompts in chatbot_routes.py handles file-based prompts.
#       These routes add cloud-compatible API contract for HARTOS compatibility.
# ══════════════════════════════════════════════════════════════════════════════

def _get_prompts_dir():
    """Get prompts directory (same as HARTOS uses)."""
    prompts_dir = NUNBA_DIR / 'data' / 'prompts'
    prompts_dir.mkdir(parents=True, exist_ok=True)
    return prompts_dir


@db_bp.route('/createpromptlist', methods=['POST'])
def create_prompt_list():
    """Sync agent configs. Matches cloud /createpromptlist contract.

    POST payload: { listprompts: [{ prompt_id, prompt, user_id, name, is_active, image_url }] }
    Returns: { status: 'ok', synced: N }
    """
    data = request.get_json(force=True)
    prompts = data.get('listprompts', [])
    prompts_dir = _get_prompts_dir()
    synced = 0

    for p in prompts:
        prompt_id = p.get('prompt_id')
        if not prompt_id:
            continue

        prompt_file = prompts_dir / f"{prompt_id}.json"
        existing = {}
        if prompt_file.exists():
            try:
                with open(prompt_file, encoding='utf-8') as f:
                    existing = json.load(f)
            except Exception:
                pass

        # Merge — don't overwrite recipe details, just sync metadata
        existing.update({
            'prompt_id': prompt_id,
            'goal': p.get('prompt', existing.get('goal', '')),
            'user_id': p.get('user_id', existing.get('user_id')),
            'name': p.get('name', existing.get('name', '')),
            'is_active': p.get('is_active', True),
            'image_url': p.get('image_url', existing.get('image_url', '')),
            'synced_at': datetime.now(UTC).isoformat(),
        })

        with open(prompt_file, 'w', encoding='utf-8') as f:
            json.dump(existing, f, indent=2, ensure_ascii=False)
        synced += 1

    return jsonify({"status": "ok", "synced": synced})


@db_bp.route('/getprompt/', methods=['GET'])
def get_prompt():
    """Fetch agent config by prompt_id. Matches cloud /getprompt/?prompt_id=X.

    Returns: { prompt_id, name, prompt (goal), user_id, is_active, ... }
    """
    prompt_id = request.args.get('prompt_id', '')
    if not prompt_id:
        return jsonify({"error": "prompt_id required"}), 400

    prompts_dir = _get_prompts_dir()
    prompt_file = prompts_dir / f"{prompt_id}.json"

    if not prompt_file.exists():
        return jsonify({"error": f"Prompt {prompt_id} not found"}), 404

    try:
        with open(prompt_file, encoding='utf-8') as f:
            data = json.load(f)
        return jsonify({
            "prompt_id": prompt_id,
            "name": data.get('name', ''),
            "prompt": data.get('goal', data.get('prompt', '')),
            "user_id": data.get('user_id', 0),
            "is_active": data.get('is_active', True),
            "image_url": data.get('image_url', ''),
            "custom_prompt": data.get('custom_prompt', ''),
            "source": "local",
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@db_bp.route('/getprompt_onlyuserid/', methods=['GET'])
def get_prompt_by_user():
    """List user's agents. Matches cloud /getprompt_onlyuserid/?user_id=X.

    Returns: list of prompt dicts
    """
    user_id = request.args.get('user_id', '')
    prompts_dir = _get_prompts_dir()
    results = []

    if not prompts_dir.exists():
        return jsonify(results)

    for f in prompts_dir.iterdir():
        if not f.suffix == '.json' or '_recipe' in f.name or '_vlm_agent' in f.name:
            continue
        try:
            with open(f, encoding='utf-8') as fh:
                data = json.load(fh)
            # Filter by user_id if provided
            file_user = str(data.get('user_id', ''))
            if user_id and file_user != str(user_id):
                continue
            results.append({
                "prompt_id": f.stem,
                "name": data.get('name', f.stem),
                "prompt": data.get('goal', data.get('prompt', '')),
                "user_id": data.get('user_id', 0),
                "is_active": data.get('is_active', True),
                "image_url": data.get('image_url', ''),
                "source": "local",
            })
        except Exception:
            continue

    return jsonify(results)


@db_bp.route('/getprompt_all/', methods=['GET'])
def get_all_prompts():
    """List all public agents. Matches cloud /getprompt_all/.

    Returns: list of all prompt dicts (no user filter)
    """
    prompts_dir = _get_prompts_dir()
    results = []

    if not prompts_dir.exists():
        return jsonify(results)

    for f in prompts_dir.iterdir():
        if not f.suffix == '.json' or '_recipe' in f.name or '_vlm_agent' in f.name:
            continue
        try:
            with open(f, encoding='utf-8') as fh:
                data = json.load(fh)
            results.append({
                "prompt_id": f.stem,
                "name": data.get('name', f.stem),
                "prompt": data.get('goal', data.get('prompt', '')),
                "user_id": data.get('user_id', 0),
                "is_active": data.get('is_active', True),
                "image_url": data.get('image_url', ''),
                "source": "local",
            })
        except Exception:
            continue

    return jsonify(results)


# ══════════════════════════════════════════════════════════════════════════════
# PDF / LAYOUT ROUTES — replaces cloud pipeline DB tables
# Consumers: PDF parsing pipeline, layout-based content retrieval
# ══════════════════════════════════════════════════════════════════════════════

@db_bp.route('/db/pdf_file', methods=['POST'])
def create_pdf_file():
    """Register a PDF file for parsing. Returns file_id.

    POST payload: { user_id, filename, directory, request_id }
    Returns: { file_id }
    """
    data = request.get_json(force=True)
    conn = _get_db()
    try:
        now = datetime.now(UTC).isoformat()
        cursor = conn.execute(
            """INSERT INTO pdf_files (user_id, filename, directory, request_id, created_date)
               VALUES (?, ?, ?, ?, ?)""",
            (data.get('user_id', 0), data.get('filename', ''),
             data.get('directory', ''), data.get('request_id', ''), now)
        )
        conn.commit()
        return jsonify({"file_id": cursor.lastrowid})
    finally:
        conn.close()


@db_bp.route('/db/pdf_file/<int:file_id>', methods=['PUT'])
def update_pdf_file(file_id):
    """Update PDF file after processing.

    PUT payload: { text_response, book_type, book_name, page_offset, total_pages, status }
    """
    data = request.get_json(force=True)
    conn = _get_db()
    try:
        now = datetime.now(UTC).isoformat()
        conn.execute(
            """UPDATE pdf_files SET
                text_response = COALESCE(?, text_response),
                book_type = COALESCE(?, book_type),
                book_name = COALESCE(?, book_name),
                page_offset = COALESCE(?, page_offset),
                total_pages = COALESCE(?, total_pages),
                status = COALESCE(?, status),
                updated_at = ?
               WHERE file_id = ?""",
            (data.get('text_response'), data.get('book_type'),
             data.get('book_name'), data.get('page_offset'),
             data.get('total_pages'), data.get('status'), now, file_id)
        )
        conn.commit()
        return jsonify({"status": "updated", "file_id": file_id})
    finally:
        conn.close()


@db_bp.route('/db/layout', methods=['POST'])
def create_layout():
    """Store page layout data from PDF parsing.

    POST payload: single layout OR batch:
    { file_id, page_number, layout_number, passage, topic_name, chapter_name,
      page_type, element_type, bbox, label, processing_time_ms }
    OR
    { layouts: [{ ... }, { ... }] }

    Returns: { layout_id } or { layout_ids: [...] }
    """
    data = request.get_json(force=True)
    conn = _get_db()
    try:
        layouts = data.get('layouts', [data])
        now = datetime.now(UTC).isoformat()
        ids = []

        for layout in layouts:
            cursor = conn.execute(
                """INSERT INTO page_layouts
                   (file_id, page_number, layout_number, num_layouts_per_page,
                    passage, topic_name, chapter_name, page_type, element_type,
                    bbox, label, processing_time_ms, created_date)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    layout.get('file_id'),
                    layout.get('page_number', 0),
                    layout.get('layout_number', 1),
                    layout.get('num_layouts_per_page', 1),
                    layout.get('passage', ''),
                    layout.get('topic_name'),
                    layout.get('chapter_name'),
                    layout.get('page_type', 'content'),
                    layout.get('element_type', 'paragraph'),
                    json.dumps(layout.get('bbox')) if layout.get('bbox') else None,
                    layout.get('label', ''),
                    layout.get('processing_time_ms'),
                    now,
                )
            )
            ids.append(cursor.lastrowid)

        conn.commit()
        if len(ids) == 1:
            return jsonify({"layout_id": ids[0]})
        return jsonify({"layout_ids": ids})
    finally:
        conn.close()


@db_bp.route('/db/layouts', methods=['GET'])
def get_layouts():
    """Query page layouts by file_id.

    GET params: ?file_id=X&page_number=Y
    Returns: list of layout dicts
    """
    file_id = request.args.get('file_id', '')
    page_number = request.args.get('page_number', '')

    if not file_id:
        return jsonify({"error": "file_id required"}), 400

    conn = _get_db()
    try:
        query = "SELECT * FROM page_layouts WHERE file_id = ?"
        params = [file_id]
        if page_number:
            query += " AND page_number = ?"
            params.append(page_number)
        query += " ORDER BY page_number, layout_number"

        rows = conn.execute(query, params).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


@db_bp.route('/db/pdf_files', methods=['GET'])
def get_pdf_files():
    """Query PDF files by user_id.

    GET params: ?user_id=X
    Returns: list of pdf file dicts
    """
    user_id = request.args.get('user_id', '')
    conn = _get_db()
    try:
        query = "SELECT * FROM pdf_files"
        params = []
        if user_id:
            query += " WHERE user_id = ?"
            params.append(user_id)
        query += " ORDER BY created_date DESC LIMIT 100"
        rows = conn.execute(query, params).fetchall()
        return jsonify([dict(r) for r in rows])
    finally:
        conn.close()


# ══════════════════════════════════════════════════════════════════════════════
# BATCH LAYOUT ENDPOINT — replaces cloud mailer.hertzai.com/add_batch_layouts
# Consumers: pipeline task.py batch_db()
# ══════════════════════════════════════════════════════════════════════════════

@db_bp.route('/add_batch_layouts', methods=['POST'])
def add_batch_layouts():
    """Batch insert page layouts + update PDF file. Replaces cloud batch_db endpoint.

    POST payload (matches pipeline task.py:78-99):
    {
        file_id, user_id, request_id, page_types, final_topic_names,
        final_topic_page_numbers, toc_chapter_names, toc_chapter_page_numbers,
        response_dict, ind_img_names, total_pages_in_book, ...
    }

    Returns: { layout_text_list, layout_id_list }
    """
    data = request.get_json(force=True)
    file_id = data.get('file_id')
    response_dict = data.get('response_dict', {})

    # Extract text and IDs from the response dict
    layout_text_list = []
    layout_id_list = []

    conn = _get_db()
    try:
        now = datetime.now(UTC).isoformat()
        page_types = data.get('page_types', {})
        topic_names = data.get('final_topic_names', [])
        topic_page_nums = data.get('final_topic_page_numbers', [])
        chapter_names = data.get('toc_chapter_names', [])
        chapter_page_nums = data.get('toc_chapter_page_numbers', [])

        # Flatten nested lists (pipeline uses list of lists)
        flat_topics = _flatten(topic_names)
        flat_topic_pages = _flatten(topic_page_nums)
        flat_chapters = _flatten(chapter_names)
        flat_chapter_pages = _flatten(chapter_page_nums)

        # Process each page's data from response_dict
        output = response_dict.get('output', {})
        for page_key, text in output.items():
            try:
                page_num = int(page_key.split('_')[-1]) if '_' in str(page_key) else int(page_key)
            except (ValueError, TypeError):
                page_num = 0

            # Assign chapter/topic using pipeline's page-number lookup logic
            page_str = str(page_num)
            topic_name = None
            chapter_name = None
            if page_str in flat_topic_pages:
                idx = flat_topic_pages.index(page_str)
                if idx < len(flat_topics):
                    topic_name = flat_topics[idx]
            if page_str in flat_chapter_pages:
                idx = flat_chapter_pages.index(page_str)
                if idx < len(flat_chapters):
                    chapter_name = flat_chapters[idx]

            page_type = ''
            if page_key in page_types:
                pt = page_types[page_key]
                page_type = pt[0] if isinstance(pt, list) else str(pt)

            cursor = conn.execute(
                """INSERT INTO page_layouts
                   (file_id, page_number, layout_number, passage, topic_name,
                    chapter_name, page_type, element_type, created_date)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (file_id, page_num, 1, text, topic_name, chapter_name,
                 page_type, 'full_page', now)
            )
            layout_id = cursor.lastrowid
            layout_text_list.append(text)
            layout_id_list.append(layout_id)

        # Update PDF file record
        whole_text = response_dict.get('whole_text', '')
        if file_id:
            conn.execute(
                """UPDATE pdf_files SET text_response = ?, total_pages = ?,
                   status = 'completed', updated_at = ? WHERE file_id = ?""",
                (whole_text, data.get('total_pages_in_book', 0), now, file_id)
            )

        conn.commit()
        return jsonify({
            "layout_text_list": layout_text_list,
            "layout_id_list": layout_id_list,
        })
    finally:
        conn.close()


def _flatten(lst):
    """Flatten nested lists (pipeline uses list of lists for ToC data)."""
    result = []
    for item in lst:
        if isinstance(item, list):
            result.extend(str(x) for x in item)
        else:
            result.append(str(item))
    return result


# ══════════════════════════════════════════════════════════════════════════════
# REGISTRATION
# ══════════════════════════════════════════════════════════════════════════════

def register_db_routes(app):
    """Register the DB blueprint with the Flask app."""
    app.register_blueprint(db_bp)
    logger.info(
        "DB routes registered: /create_action, /conversation, /createpromptlist, "
        "/getprompt, /getprompt_onlyuserid, /getprompt_all, /db/getstudent_by_user_id, "
        "/db/layout, /db/layouts, /db/pdf_file, /add_batch_layouts"
    )
    logger.info(f"DB storage: {DB_PATH}")
