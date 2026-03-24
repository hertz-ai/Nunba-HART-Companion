"""Local file upload routes — replaces cloud MakeItTalk /upload_file, /upload_image, /upload_audio.

Handles:
  POST /upload/file       — generic file upload (image/pdf/audio) + Qwen Vision inference for images
  POST /upload/image      — agent avatar upload (save + optional toonify placeholder)
  POST /upload/audio      — agent voice signature upload
  POST /upload/vision     — standalone image→Qwen Vision inference (base64 or URL)
  POST /upload/parse_pdf  — PDF page-wise parsing via Qwen Vision (replaces cloud pipeline)

All files stored under ~/Documents/Nunba/uploads/<type>/<uuid_name>
Served statically via /uploads/<path>
"""
import base64
import json
import logging
import os
import threading
import time
import uuid
from datetime import UTC
from pathlib import Path

from flask import Blueprint, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

logger = logging.getLogger(__name__)

upload_bp = Blueprint('upload', __name__)

# ── Storage paths (cross-platform) ──
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
UPLOAD_DIR = NUNBA_DIR / 'uploads'
IMAGE_DIR = UPLOAD_DIR / 'images'
AUDIO_DIR = UPLOAD_DIR / 'audio'
FILE_DIR = UPLOAD_DIR / 'files'
AVATAR_DIR = UPLOAD_DIR / 'avatars'

for d in (IMAGE_DIR, AUDIO_DIR, FILE_DIR, AVATAR_DIR):
    d.mkdir(parents=True, exist_ok=True)

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
AUDIO_EXTS = {'.wav', '.mp3', '.ogg', '.m4a', '.webm', '.flac'}
PDF_EXTS = {'.pdf'}
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB


# ── Helpers ──

def _unique_name(original_filename):
    """Generate a collision-free filename preserving extension."""
    ext = Path(original_filename).suffix.lower()
    return f"{uuid.uuid4().hex[:12]}_{secure_filename(Path(original_filename).stem)}{ext}"


def _file_type(ext):
    ext = ext.lower()
    if ext in IMAGE_EXTS:
        return 'image'
    if ext in AUDIO_EXTS:
        return 'audio'
    if ext in PDF_EXTS:
        return 'pdf'
    return 'document'


def _save_file(file_obj, dest_dir):
    """Save uploaded file, return (saved_path, unique_name, file_type)."""
    name = _unique_name(file_obj.filename)
    ftype = _file_type(Path(file_obj.filename).suffix)
    dest = dest_dir / name
    file_obj.save(str(dest))
    return dest, name, ftype


def _get_llama_vision_url():
    """Get llama.cpp server URL for vision inference."""
    return os.environ.get('LLAMA_CPP_URL', 'http://127.0.0.1:8080')


def _describe_image_via_llm(image_path, prompt=None):
    """Send image to local Qwen Vision (llama.cpp) for description.

    Uses OpenAI-compatible /v1/chat/completions with image_url (base64).
    Returns description string or None on failure.
    """
    import requests as req

    llama_url = _get_llama_vision_url()

    # Read and encode image
    try:
        with open(image_path, 'rb') as f:
            img_bytes = f.read()
        ext = Path(image_path).suffix.lower().lstrip('.')
        mime = {'jpg': 'jpeg', 'jpeg': 'jpeg', 'png': 'png',
                'gif': 'gif', 'webp': 'webp', 'bmp': 'bmp'}.get(ext, 'jpeg')
        b64 = base64.b64encode(img_bytes).decode('ascii')
        data_url = f"data:image/{mime};base64,{b64}"
    except Exception as e:
        logger.error(f"Failed to read image for vision: {e}")
        return None

    if not prompt:
        prompt = (
            "Describe this image concisely. Classify it as one of: "
            "'academic content', 'animated/cartoon', 'art/illustration', "
            "'real-world photograph', 'screenshot', 'diagram/chart', or 'other'. "
            "Respond as JSON: {\"description\": \"...\", \"category\": \"...\"}"
        )

    payload = {
        "model": "qwen",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "image_url", "image_url": {"url": data_url}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
        "max_tokens": 300,
        "temperature": 0.3,
    }

    try:
        resp = req.post(
            f"{llama_url}/v1/chat/completions",
            json=payload,
            timeout=60,
        )
        if resp.status_code == 200:
            data = resp.json()
            content = data.get('choices', [{}])[0].get('message', {}).get('content', '')
            return content.strip()
        logger.warning(f"Vision inference returned {resp.status_code}: {resp.text[:200]}")
    except req.ConnectionError:
        logger.info("llama.cpp not running — skipping vision inference")
    except Exception as e:
        logger.warning(f"Vision inference failed: {e}")
    return None


# ── Routes ──

@upload_bp.route('/upload/file', methods=['POST'])
def upload_file():
    """Generic file upload (replaces MakeItTalk /upload_file).

    Accepts multipart form: file, user_id, request_id, prompt_id, agent.
    For images: runs Qwen Vision inference and returns description.
    """
    file_obj = request.files.get('file')
    if not file_obj:
        return jsonify({"error": "No file provided"}), 400

    user_id = request.form.get('user_id', '0')
    request_id = request.form.get('request_id', '')
    prompt_id = request.form.get('prompt_id')
    agent = request.form.get('agent')

    saved_path, name, ftype = _save_file(file_obj, FILE_DIR)
    logger.info(f"upload_file: {name} ({ftype}) for user {user_id}")

    # Override type for agent context
    if agent:
        ftype = 'agent'

    # Vision inference for images
    image_description = ""
    if ftype == 'image':
        desc = _describe_image_via_llm(str(saved_path))
        if desc:
            image_description = desc

    file_url = f"/uploads/files/{name}"

    # Auto-trigger PDF parsing when a PDF is uploaded
    pdf_job_id = None
    if ftype == 'pdf':
        pdf_job_id = uuid.uuid4().hex[:12]
        _parse_jobs[pdf_job_id] = {
            'status': 'queued', 'total_pages': 0, 'progress': 0,
            'result': None, 'error': None, 'created_at': time.time(),
        }
        thread = threading.Thread(
            target=_run_pdf_parse,
            args=(pdf_job_id, str(saved_path), user_id, request_id),
            daemon=True,
        )
        thread.start()

    return jsonify({
        'file_url': file_url,
        'file_name': name,
        'file_type': ftype,
        'request_id': request_id,
        'file_id': None,
        'text': image_description or None,
        'image_description': image_description,
        'pdf_parse_job_id': pdf_job_id,
    })


@upload_bp.route('/upload/image', methods=['POST'])
def upload_image():
    """Agent avatar upload (replaces MakeItTalk /upload_image/).

    Accepts multipart form: image, user_id, name, request_id, prompt_id.
    Saves avatar image. Toonify is a no-op locally (would need a separate model).
    """
    image_file = request.files.get('image')
    if not image_file:
        return jsonify({"error": "No image provided"}), 400

    user_id = request.form.get('user_id', '0')
    name_param = request.form.get('name', '')
    request_id = request.form.get('request_id', '')

    saved_path, name, _ = _save_file(image_file, AVATAR_DIR)
    logger.info(f"upload_image (avatar): {name} for user {user_id}")

    avatar_url = f"/uploads/avatars/{name}"

    return jsonify({
        "response": "Avatar uploaded successfully",
        "avatar_url": avatar_url,
        "file_name": name,
        "request_id": request_id,
    })


@upload_bp.route('/upload/audio', methods=['POST'])
def upload_audio():
    """Agent voice signature upload (replaces MakeItTalk /upload_audio).

    Accepts multipart form: audio, user_id, request_id.
    Saves audio file for voice cloning / signature.
    """
    audio_file = request.files.get('audio')
    if not audio_file:
        return jsonify({"error": "No audio provided"}), 400

    user_id = request.form.get('user_id', '0')
    request_id = request.form.get('request_id', '')

    saved_path, name, _ = _save_file(audio_file, AUDIO_DIR)
    logger.info(f"upload_audio (voice sig): {name} for user {user_id}")

    audio_url = f"/uploads/audio/{name}"

    return jsonify({
        "response": "Voice signature uploaded",
        "audio_url": audio_url,
        "file_name": name,
        "request_id": request_id,
    })


@upload_bp.route('/upload/vision', methods=['POST'])
def vision_inference():
    """Standalone image → Qwen Vision inference.

    Accepts JSON: { image_base64, image_url, prompt }
    Or multipart form: image file + prompt.
    Used by HARTOS agents via Analyze_Image tool.
    """
    # Support both JSON and form upload
    if request.content_type and 'multipart' in request.content_type:
        image_file = request.files.get('image')
        prompt = request.form.get('prompt')
        if not image_file:
            return jsonify({"error": "No image provided"}), 400
        saved_path, name, _ = _save_file(image_file, IMAGE_DIR)
        desc = _describe_image_via_llm(str(saved_path), prompt)
    else:
        data = request.get_json(force=True)
        image_b64 = data.get('image_base64')
        image_url = data.get('image_url')
        prompt = data.get('prompt')

        if image_b64:
            # Decode and save temporarily
            img_bytes = base64.b64decode(image_b64)
            name = f"{uuid.uuid4().hex[:12]}.jpg"
            saved_path = IMAGE_DIR / name
            with open(saved_path, 'wb') as f:
                f.write(img_bytes)
            desc = _describe_image_via_llm(str(saved_path), prompt)
        elif image_url and image_url.startswith('/uploads/'):
            # Local file reference
            rel = image_url.replace('/uploads/', '')
            local_path = UPLOAD_DIR / rel
            if local_path.is_file():
                desc = _describe_image_via_llm(str(local_path), prompt)
            else:
                return jsonify({"error": f"File not found: {image_url}"}), 404
        else:
            return jsonify({"error": "Provide image_base64, image_url, or multipart image"}), 400

    if desc is None:
        return jsonify({
            "description": "",
            "error": "Vision inference unavailable (llama.cpp not running or model has no vision)",
        }), 503

    # Try to parse as JSON if the model returned structured output
    try:
        parsed = json.loads(desc)
        return jsonify(parsed)
    except (json.JSONDecodeError, TypeError):
        return jsonify({"description": desc, "category": "unknown"})


# ── PDF Parsing via Qwen Vision ──
# Replaces the entire cloud pipeline (7 ML microservices) with one VLM call per page.
# Cloud pipeline: pdf2image → SetFit (page classify) → PubLayNet (layout) → PixelLink
#   (text detect) → DocTR+CRNN (OCR) → Detectron2 (objects) → Segformer (segmentation)
# Local replacement: pdf2image → Qwen3.5 Vision (all-in-one per page)

PDF_PARSE_DIR = UPLOAD_DIR / 'pdf_parse'
PDF_PARSE_DIR.mkdir(parents=True, exist_ok=True)

# In-progress parse jobs: job_id → {status, pages, progress, result, error}
_parse_jobs = {}


def _pdf_to_images(pdf_path):
    """Convert PDF pages to JPEG images. Returns list of (page_num, image_path)."""
    try:
        from pdf2image import convert_from_path
    except ImportError:
        logger.warning("pdf2image not installed — trying PyMuPDF fallback")
        return _pdf_to_images_fitz(pdf_path)

    output_dir = PDF_PARSE_DIR / Path(pdf_path).stem
    output_dir.mkdir(parents=True, exist_ok=True)

    try:
        images = convert_from_path(str(pdf_path), dpi=200, fmt='jpeg',
                                   thread_count=4)
        pages = []
        for i, img in enumerate(images, 1):
            page_path = output_dir / f"page_{i}.jpg"
            img.save(str(page_path), 'JPEG', quality=85)
            pages.append((i, str(page_path)))
        return pages
    except Exception as e:
        logger.error(f"pdf2image failed: {e}")
        return _pdf_to_images_fitz(pdf_path)


def _pdf_to_images_fitz(pdf_path):
    """Fallback PDF→images using PyMuPDF (fitz)."""
    try:
        import fitz
    except ImportError:
        logger.error("Neither pdf2image nor PyMuPDF available for PDF conversion")
        return []

    output_dir = PDF_PARSE_DIR / Path(pdf_path).stem
    output_dir.mkdir(parents=True, exist_ok=True)

    pages = []
    doc = fitz.open(str(pdf_path))
    for i, page in enumerate(doc, 1):
        pix = page.get_pixmap(dpi=200)
        page_path = output_dir / f"page_{i}.jpg"
        pix.save(str(page_path))
        pages.append((i, str(page_path)))
    doc.close()
    return pages


def _parse_page_via_vision(page_num, image_path):
    """Parse a single PDF page using Qwen Vision. Returns structured page data."""
    prompt = (
        "You are a document parser. Analyze this page image and extract:\n"
        "1. ALL text content (OCR), preserving paragraph structure\n"
        "2. Page type: 'cover', 'table_of_contents', 'chapter_start', 'content', 'index', 'blank'\n"
        "3. Layout elements found: list of {type, content} where type is one of: "
        "'heading', 'paragraph', 'table', 'figure', 'equation', 'list', 'caption', 'footer', 'header'\n"
        "4. If this is a table of contents, extract chapter/topic names with page numbers\n"
        "5. If there are tables, extract as markdown tables\n"
        "6. If there are figures/images, describe them\n\n"
        "Respond as JSON:\n"
        "{\n"
        '  "page_type": "content",\n'
        '  "text": "full extracted text...",\n'
        '  "elements": [\n'
        '    {"type": "heading", "content": "Chapter 1: Introduction"},\n'
        '    {"type": "paragraph", "content": "Lorem ipsum..."},\n'
        '    {"type": "table", "content": "| Col1 | Col2 |\\n|---|---|\\n| a | b |"},\n'
        '    {"type": "figure", "content": "Diagram showing neural network architecture"}\n'
        '  ],\n'
        '  "toc_entries": [{"title": "Chapter 1", "page": 5}],\n'
        '  "chapter_name": "Introduction",\n'
        '  "has_equations": false,\n'
        '  "has_tables": true,\n'
        '  "has_figures": false\n'
        "}"
    )

    result = _describe_image_via_llm(image_path, prompt)
    if not result:
        return {
            "page_number": page_num,
            "page_type": "unknown",
            "text": "",
            "elements": [],
            "error": "Vision inference unavailable",
        }

    # Try to parse structured JSON from VLM response
    try:
        # Strip markdown code fences if present
        cleaned = result.strip()
        if cleaned.startswith('```'):
            cleaned = cleaned.split('\n', 1)[1] if '\n' in cleaned else cleaned[3:]
        if cleaned.endswith('```'):
            cleaned = cleaned[:-3]
        cleaned = cleaned.strip()
        if cleaned.startswith('json'):
            cleaned = cleaned[4:].strip()

        parsed = json.loads(cleaned)
        parsed["page_number"] = page_num
        return parsed
    except (json.JSONDecodeError, TypeError):
        # VLM returned unstructured text — wrap it
        return {
            "page_number": page_num,
            "page_type": "content",
            "text": result,
            "elements": [{"type": "paragraph", "content": result}],
        }


def _assign_chapters_to_pages(pages_data, toc_entries):
    """Cross-page intelligence: assign chapter/topic names to pages using ToC data.

    Reuses logic from pipeline db_page_wise_call.py:
    - Build chapter→page_number mapping from ToC
    - For each page, find which chapter range it falls into
    - Assign chapter_name and topic_name
    """
    if not toc_entries:
        return pages_data

    # Build sorted chapter boundaries
    chapters = []
    for entry in toc_entries:
        try:
            page = int(entry.get('page', 0))
            title = entry.get('title', entry.get('chapter_name', ''))
            if page > 0 and title:
                chapters.append((page, title))
        except (ValueError, TypeError):
            continue

    chapters.sort(key=lambda x: x[0])

    if not chapters:
        return pages_data

    # Assign chapter to each page based on page ranges
    for page_data in pages_data:
        page_num = page_data.get('page_number', 0)
        assigned_chapter = None

        # Find which chapter range this page falls into
        for i, (ch_page, ch_name) in enumerate(chapters):
            next_ch_page = chapters[i + 1][0] if i + 1 < len(chapters) else float('inf')
            if ch_page <= page_num < next_ch_page:
                assigned_chapter = ch_name
                break

        if assigned_chapter and not page_data.get('chapter_name'):
            page_data['chapter_name'] = assigned_chapter

    return pages_data


def _generate_book_name(first_page_text, toc_entries, llama_url=None):
    """Generate book name using LLM. Reuses pipeline find_book_name_if_not_good() logic."""
    import requests as req

    if not llama_url:
        llama_url = _get_llama_vision_url()

    topic_names = [e.get('title', '') for e in toc_entries[:20]]
    prompt = (
        f"Based on the following information, suggest a short book title (max 10 words).\n"
        f"Topics: {', '.join(topic_names)}\n"
        f"First page text: {first_page_text[:500]}\n\n"
        f"Respond with ONLY the book title, nothing else."
    )

    try:
        resp = req.post(
            f"{llama_url}/v1/chat/completions",
            json={
                "model": "qwen",
                "messages": [{"role": "user", "content": prompt}],
                "max_tokens": 50,
                "temperature": 0.3,
            },
            timeout=30,
        )
        if resp.status_code == 200:
            data = resp.json()
            return data.get('choices', [{}])[0].get('message', {}).get('content', '').strip()
    except Exception as e:
        logger.debug(f"Book name generation failed: {e}")
    return None


def _save_parse_to_db(file_id, pages_data, whole_text, toc_entries, book_name, user_id):
    """Save parsed PDF data to local SQLite DB. Reuses pipeline DB storage patterns."""
    try:
        from routes.db_routes import _get_db
        conn = _get_db()
        try:
            from datetime import datetime
            now = datetime.now(UTC).isoformat()

            # Update PDF file record
            conn.execute(
                """UPDATE pdf_files SET text_response = ?, book_name = ?,
                   total_pages = ?, status = 'completed', updated_at = ?
                   WHERE file_id = ?""",
                (whole_text, book_name, len(pages_data), now, file_id)
            )

            # Insert page layouts (one per element per page)
            for page_data in pages_data:
                page_num = page_data.get('page_number', 0)
                page_type = page_data.get('page_type', 'content')
                chapter_name = page_data.get('chapter_name')
                elements = page_data.get('elements', [])

                if not elements:
                    # No structured elements — store full page text as single layout
                    conn.execute(
                        """INSERT INTO page_layouts
                           (file_id, page_number, layout_number, num_layouts_per_page,
                            passage, chapter_name, page_type, element_type, created_date)
                           VALUES (?, ?, 1, 1, ?, ?, ?, 'full_page', ?)""",
                        (file_id, page_num, page_data.get('text', ''),
                         chapter_name, page_type, now)
                    )
                else:
                    for idx, elem in enumerate(elements, 1):
                        conn.execute(
                            """INSERT INTO page_layouts
                               (file_id, page_number, layout_number, num_layouts_per_page,
                                passage, chapter_name, page_type, element_type, label,
                                created_date)
                               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                            (file_id, page_num, idx, len(elements),
                             elem.get('content', ''), chapter_name, page_type,
                             elem.get('type', 'paragraph'),
                             elem.get('type', ''), now)
                        )

            conn.commit()
            logger.info(f"PDF parse saved to DB: file_id={file_id}, pages={len(pages_data)}")
        finally:
            conn.close()
    except Exception as e:
        logger.warning(f"Failed to save parse to DB (non-blocking): {e}")


def _run_pdf_parse(job_id, pdf_path, user_id, request_id):
    """Background worker: parse all PDF pages via Qwen Vision.

    Reuses pipeline orchestration logic (views.py, wrapper.py):
    1. PDF → images (pdf2image / PyMuPDF)
    2. Per-page VLM parsing (replaces DocTR+PubLayNet+PixelLink+CRNN+Segformer+Detectron2)
    3. Cross-page ToC → chapter assignment (from db_page_wise_call.py)
    4. Book name generation (from upload_all_image.py find_book_name_if_not_good)
    5. DB storage (replaces MySQL hertz_ocr_req_res_table + layout tables)
    6. Crossbar progress publishing (same pattern as pipeline)
    """
    job = _parse_jobs[job_id]
    file_id = None
    try:
        # Register PDF file in DB (replaces pipeline insertVariblesIntoTable)
        try:
            from routes.db_routes import _get_db
            conn = _get_db()
            from datetime import datetime
            now = datetime.now(UTC).isoformat()
            cursor = conn.execute(
                """INSERT INTO pdf_files (user_id, filename, directory, request_id, created_date)
                   VALUES (?, ?, ?, ?, ?)""",
                (user_id, Path(pdf_path).name, str(Path(pdf_path).parent),
                 request_id, now)
            )
            conn.commit()
            file_id = cursor.lastrowid
            conn.close()
        except Exception as e:
            logger.warning(f"DB registration failed: {e}")

        # Step 1: Convert PDF to images
        job['status'] = 'converting'
        pages = _pdf_to_images(pdf_path)
        if not pages:
            job['status'] = 'failed'
            job['error'] = 'Failed to convert PDF to images'
            return

        job['total_pages'] = len(pages)
        job['status'] = 'parsing'

        # Step 2: Parse each page via Qwen Vision (replaces 7 ML microservices)
        results = []
        whole_text_parts = []
        toc_entries = []

        for page_num, img_path in pages:
            page_data = _parse_page_via_vision(page_num, img_path)
            results.append(page_data)
            whole_text_parts.append(page_data.get('text', ''))

            # Accumulate ToC entries (pipeline's post_processing_of_toc_page_image logic)
            if page_data.get('toc_entries'):
                toc_entries.extend(page_data['toc_entries'])

            job['progress'] = page_num
            logger.info(f"PDF parse [{job_id}] page {page_num}/{len(pages)} done")

        # Step 3: Cross-page intelligence (from pipeline db_page_wise_call.py)
        # Assign chapter names to pages using ToC data
        job['status'] = 'post_processing'
        results = _assign_chapters_to_pages(results, toc_entries)

        # Step 4: Generate book name (from pipeline find_book_name_if_not_good)
        book_name = None
        if whole_text_parts:
            book_name = _generate_book_name(
                whole_text_parts[0][:500] if whole_text_parts[0] else '',
                toc_entries
            )

        whole_text = '\n\n'.join(whole_text_parts)

        # Step 5: Save to DB (replaces pipeline MySQL insert + batch_db)
        if file_id:
            _save_parse_to_db(file_id, results, whole_text, toc_entries,
                              book_name, user_id)

        # Step 6: Build final result
        job['result'] = {
            'job_id': job_id,
            'file_id': file_id,
            'file_name': Path(pdf_path).name,
            'book_name': book_name,
            'total_pages': len(pages),
            'pages': results,
            'whole_text': whole_text,
            'toc': toc_entries,
            'user_id': user_id,
            'request_id': request_id,
        }
        job['status'] = 'completed'
        logger.info(f"PDF parse [{job_id}] completed: {len(pages)} pages, "
                    f"file_id={file_id}, book='{book_name}'")

        # Step 7: Publish completion via Crossbar (same pattern as pipeline publish())
        try:
            from routes.chatbot_routes import publish_to_crossbar
            publish_to_crossbar(user_id, {
                'type': 'pdf_parse_complete',
                'job_id': job_id,
                'file_id': file_id,
                'total_pages': len(pages),
                'book_name': book_name,
                'request_id': request_id,
            })
        except Exception:
            pass

    except Exception as e:
        logger.error(f"PDF parse [{job_id}] failed: {e}")
        job['status'] = 'failed'
        job['error'] = str(e)


@upload_bp.route('/upload/parse_pdf', methods=['POST'])
def parse_pdf():
    """PDF page-wise parsing via Qwen Vision.

    Replaces the cloud pipeline (pipeline repo: PubLayNet + DocTR + PixelLink + CRNN
    + Segformer + Detectron2 + SetFit) with a single VLM call per page.

    Accepts multipart form: file, user_id, request_id.
    Or JSON: { file_url, user_id, request_id } for already-uploaded PDFs.

    Returns immediately with job_id for async tracking (large PDFs).
    For small PDFs (<=3 pages), processes synchronously.
    """
    # Get PDF from upload or reference
    if request.content_type and 'multipart' in request.content_type:
        file_obj = request.files.get('file')
        if not file_obj:
            return jsonify({"error": "No file provided"}), 400
        if not file_obj.filename.lower().endswith('.pdf'):
            return jsonify({"error": "Only PDF files accepted"}), 400
        saved_path, name, _ = _save_file(file_obj, FILE_DIR)
        user_id = request.form.get('user_id', '0')
        request_id = request.form.get('request_id', '')
    else:
        data = request.get_json(force=True)
        file_url = data.get('file_url', '')
        user_id = data.get('user_id', '0')
        request_id = data.get('request_id', '')

        if file_url and file_url.startswith('/uploads/'):
            rel = file_url.replace('/uploads/', '')
            saved_path = UPLOAD_DIR / rel
            name = Path(rel).name
            if not saved_path.is_file():
                return jsonify({"error": f"File not found: {file_url}"}), 404
        else:
            return jsonify({"error": "Provide PDF file or file_url"}), 400

    job_id = uuid.uuid4().hex[:12]
    _parse_jobs[job_id] = {
        'status': 'queued',
        'total_pages': 0,
        'progress': 0,
        'result': None,
        'error': None,
        'created_at': time.time(),
    }

    # For small PDFs, try synchronous processing
    # For large ones, go async
    file_size = os.path.getsize(str(saved_path))
    if file_size < 2 * 1024 * 1024:  # < 2MB — likely <=3 pages, do sync
        _run_pdf_parse(job_id, str(saved_path), user_id, request_id)
        job = _parse_jobs[job_id]
        if job['status'] == 'completed':
            return jsonify(job['result'])
        return jsonify({"error": job.get('error', 'Parse failed'), "job_id": job_id}), 500

    # Async for larger PDFs
    thread = threading.Thread(
        target=_run_pdf_parse,
        args=(job_id, str(saved_path), user_id, request_id),
        daemon=True,
    )
    thread.start()

    return jsonify({
        "job_id": job_id,
        "status": "queued",
        "message": "PDF parsing started. Poll /upload/parse_pdf/status for progress.",
        "file_url": f"/uploads/files/{name}",
        "request_id": request_id,
    }), 202


@upload_bp.route('/upload/parse_pdf/status', methods=['GET', 'POST'])
def parse_pdf_status():
    """Check PDF parse job status.

    GET /upload/parse_pdf/status?job_id=xxx
    POST with JSON: { job_id }
    """
    if request.method == 'GET':
        job_id = request.args.get('job_id', '')
    else:
        data = request.get_json(force=True)
        job_id = data.get('job_id', '')

    if not job_id or job_id not in _parse_jobs:
        return jsonify({"error": "Unknown job_id"}), 404

    job = _parse_jobs[job_id]
    response = {
        "job_id": job_id,
        "status": job['status'],
        "total_pages": job['total_pages'],
        "progress": job['progress'],
    }

    if job['status'] == 'completed' and job['result']:
        response['result'] = job['result']
    elif job['status'] == 'failed':
        response['error'] = job.get('error', 'Unknown error')

    return jsonify(response)


# ── Static file serving ──

@upload_bp.route('/uploads/<path:filepath>')
def serve_upload(filepath):
    """Serve uploaded files from the local uploads directory."""
    return send_from_directory(str(UPLOAD_DIR), filepath)


# ── Registration helper ──

def register_upload_routes(app):
    """Register the upload blueprint with the Flask app."""
    app.register_blueprint(upload_bp)
    logger.info(
        "Upload routes registered: /upload/file, /upload/image, /upload/audio, "
        "/upload/vision, /upload/parse_pdf"
    )
    logger.info(f"Upload storage: {UPLOAD_DIR}")
