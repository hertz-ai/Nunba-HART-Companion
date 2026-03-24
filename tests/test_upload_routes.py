"""
test_upload_routes.py - Comprehensive tests for upload route handlers.

Covers:
- Helper functions: _unique_name, _file_type, _save_file, _get_llama_vision_url,
  _describe_image_via_llm, _assign_chapters_to_pages, _parse_page_via_vision,
  _generate_book_name
- Route handlers: /upload/file, /upload/image, /upload/audio, /upload/vision,
  /upload/parse_pdf, /upload/parse_pdf/status, /uploads/<path>
- register_upload_routes
- Happy path, error path, and edge cases for each
"""
import base64
import io
import json
import os
import sys
import time
from unittest.mock import MagicMock, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)


# ============================================================
# Fixtures
# ============================================================

@pytest.fixture
def app():
    """Create a minimal Flask app with upload blueprint registered."""
    from flask import Flask
    app = Flask(__name__)
    app.config['TESTING'] = True

    from routes.upload_routes import upload_bp
    app.register_blueprint(upload_bp)
    return app


@pytest.fixture
def client(app):
    return app.test_client()


def _make_file_storage(filename='test.png', content=b'fake image data',
                       content_type='image/png'):
    """Build a BytesIO that mimics a file upload."""
    return (io.BytesIO(content), filename)


# ============================================================
# Unit tests for helper functions
# ============================================================

class TestUniqueName:
    """Tests for _unique_name()."""

    def setup_method(self):
        from routes.upload_routes import _unique_name
        self.unique_name = _unique_name

    def test_unique_name_preserves_extension(self):
        name = self.unique_name("photo.JPG")
        assert name.endswith(".jpg")

    def test_unique_name_preserves_stem(self):
        name = self.unique_name("my_document.pdf")
        assert "my_document" in name

    def test_unique_name_has_uuid_prefix(self):
        name = self.unique_name("test.png")
        # UUID hex prefix is 12 chars followed by underscore
        prefix = name.split('_')[0]
        assert len(prefix) == 12

    def test_unique_name_different_each_call(self):
        name1 = self.unique_name("test.png")
        name2 = self.unique_name("test.png")
        assert name1 != name2

    def test_unique_name_sanitizes_filename(self):
        # secure_filename strips special chars
        name = self.unique_name("../../etc/passwd.txt")
        assert ".." not in name
        assert "/" not in name

    def test_unique_name_empty_stem(self):
        name = self.unique_name(".gitignore")
        # Should still produce a valid filename
        assert name.endswith(".gitignore") or len(name) > 12


class TestFileType:
    """Tests for _file_type()."""

    def setup_method(self):
        from routes.upload_routes import _file_type
        self.file_type = _file_type

    def test_image_extensions(self):
        for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp']:
            assert self.file_type(ext) == 'image'

    def test_audio_extensions(self):
        for ext in ['.wav', '.mp3', '.ogg', '.m4a', '.webm', '.flac']:
            assert self.file_type(ext) == 'audio'

    def test_pdf_extension(self):
        assert self.file_type('.pdf') == 'pdf'

    def test_unknown_extension(self):
        assert self.file_type('.docx') == 'document'
        assert self.file_type('.xyz') == 'document'

    def test_case_insensitive(self):
        assert self.file_type('.JPG') == 'image'
        assert self.file_type('.PDF') == 'pdf'
        assert self.file_type('.MP3') == 'audio'


class TestSaveFile:
    """Tests for _save_file()."""

    def setup_method(self):
        from routes.upload_routes import _save_file
        self.save_file = _save_file

    def test_save_file_returns_tuple(self, tmp_path):
        mock_file = MagicMock()
        mock_file.filename = "test_image.png"
        mock_file.save = MagicMock()

        dest, name, ftype = self.save_file(mock_file, tmp_path)
        assert ftype == 'image'
        assert name.endswith('.png')
        mock_file.save.assert_called_once()

    def test_save_file_audio(self, tmp_path):
        mock_file = MagicMock()
        mock_file.filename = "voice.wav"
        mock_file.save = MagicMock()

        dest, name, ftype = self.save_file(mock_file, tmp_path)
        assert ftype == 'audio'

    def test_save_file_pdf(self, tmp_path):
        mock_file = MagicMock()
        mock_file.filename = "document.pdf"
        mock_file.save = MagicMock()

        dest, name, ftype = self.save_file(mock_file, tmp_path)
        assert ftype == 'pdf'


class TestGetLlamaVisionUrl:
    """Tests for _get_llama_vision_url()."""

    def setup_method(self):
        from routes.upload_routes import _get_llama_vision_url
        self.get_url = _get_llama_vision_url

    def test_default_url(self):
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('LLAMA_CPP_URL', None)
            assert self.get_url() == 'http://127.0.0.1:8080'

    def test_custom_url(self):
        with patch.dict(os.environ, {'LLAMA_CPP_URL': 'http://localhost:9999'}):
            assert self.get_url() == 'http://localhost:9999'


class TestDescribeImageViaLlm:
    """Tests for _describe_image_via_llm()."""

    def setup_method(self):
        from routes.upload_routes import _describe_image_via_llm
        self.describe = _describe_image_via_llm

    @patch('routes.upload_routes.os.environ', {'LLAMA_CPP_URL': 'http://localhost:8080'})
    def test_success(self, tmp_path):
        img = tmp_path / "test.jpg"
        img.write_bytes(b'\xff\xd8\xff\xe0fake jpeg data')

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            'choices': [{'message': {'content': '{"description":"a cat","category":"photograph"}'}}]
        }

        with patch('requests.post', return_value=mock_resp):
            result = self.describe(str(img))
            assert 'cat' in result

    def test_file_not_found(self):
        result = self.describe("/nonexistent/path.jpg")
        assert result is None

    def test_connection_error(self, tmp_path):
        import requests
        img = tmp_path / "test.png"
        img.write_bytes(b'fake png')

        with patch('requests.post', side_effect=requests.ConnectionError("refused")):
            result = self.describe(str(img))
            assert result is None

    def test_non_200_response(self, tmp_path):
        img = tmp_path / "test.png"
        img.write_bytes(b'fake png')

        mock_resp = MagicMock()
        mock_resp.status_code = 500
        mock_resp.text = "Internal Server Error"

        with patch('requests.post', return_value=mock_resp):
            result = self.describe(str(img))
            assert result is None

    def test_custom_prompt(self, tmp_path):
        img = tmp_path / "test.jpg"
        img.write_bytes(b'fake jpg')

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            'choices': [{'message': {'content': 'Custom response'}}]
        }

        with patch('requests.post', return_value=mock_resp) as mock_post:
            result = self.describe(str(img), prompt="What color is this?")
            assert result == 'Custom response'
            call_payload = mock_post.call_args[1]['json']
            assert call_payload['messages'][0]['content'][1]['text'] == "What color is this?"


class TestAssignChaptersToPages:
    """Tests for _assign_chapters_to_pages()."""

    def setup_method(self):
        from routes.upload_routes import _assign_chapters_to_pages
        self.assign = _assign_chapters_to_pages

    def test_empty_toc(self):
        pages = [{"page_number": 1, "text": "hello"}]
        result = self.assign(pages, [])
        assert result == pages

    def test_none_toc(self):
        pages = [{"page_number": 1}]
        result = self.assign(pages, None)
        assert result == pages

    def test_assigns_chapters(self):
        toc = [
            {"title": "Introduction", "page": 1},
            {"title": "Methods", "page": 5},
            {"title": "Results", "page": 10},
        ]
        pages = [
            {"page_number": 1}, {"page_number": 3},
            {"page_number": 5}, {"page_number": 7},
            {"page_number": 10}, {"page_number": 12},
        ]
        result = self.assign(pages, toc)
        assert result[0]['chapter_name'] == 'Introduction'
        assert result[1]['chapter_name'] == 'Introduction'
        assert result[2]['chapter_name'] == 'Methods'
        assert result[3]['chapter_name'] == 'Methods'
        assert result[4]['chapter_name'] == 'Results'
        assert result[5]['chapter_name'] == 'Results'

    def test_does_not_overwrite_existing_chapter(self):
        toc = [{"title": "Ch1", "page": 1}]
        pages = [{"page_number": 1, "chapter_name": "Already Set"}]
        result = self.assign(pages, toc)
        assert result[0]['chapter_name'] == 'Already Set'

    def test_invalid_toc_entries_skipped(self):
        toc = [
            {"title": "Good", "page": 1},
            {"title": "", "page": 5},        # empty title
            {"title": "Bad", "page": "abc"},  # non-numeric page
        ]
        pages = [{"page_number": 1}, {"page_number": 6}]
        result = self.assign(pages, toc)
        assert result[0]['chapter_name'] == 'Good'
        # Page 6 still gets "Good" since no valid next chapter
        assert result[1]['chapter_name'] == 'Good'


class TestGenerateBookName:
    """Tests for _generate_book_name()."""

    def setup_method(self):
        from routes.upload_routes import _generate_book_name
        self.generate = _generate_book_name

    def test_success(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            'choices': [{'message': {'content': 'Introduction to Machine Learning'}}]
        }
        with patch('requests.post', return_value=mock_resp):
            result = self.generate("This book covers ML...", [{"title": "Neural Networks"}])
            assert result == 'Introduction to Machine Learning'

    def test_failure_returns_none(self):
        with patch('requests.post', side_effect=Exception("timeout")):
            result = self.generate("text", [])
            assert result is None

    def test_non_200_returns_none(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 500
        with patch('requests.post', return_value=mock_resp):
            result = self.generate("text", [])
            assert result is None


class TestParsePageViaVision:
    """Tests for _parse_page_via_vision()."""

    def setup_method(self):
        from routes.upload_routes import _parse_page_via_vision
        self.parse_page = _parse_page_via_vision

    def test_vision_unavailable(self):
        with patch('routes.upload_routes._describe_image_via_llm', return_value=None):
            result = self.parse_page(1, "/fake/page.jpg")
            assert result['page_number'] == 1
            assert result['page_type'] == 'unknown'
            assert 'error' in result

    def test_structured_json_response(self):
        response_json = json.dumps({
            "page_type": "content",
            "text": "Hello world",
            "elements": [{"type": "paragraph", "content": "Hello world"}]
        })
        with patch('routes.upload_routes._describe_image_via_llm', return_value=response_json):
            result = self.parse_page(3, "/fake/page.jpg")
            assert result['page_number'] == 3
            assert result['page_type'] == 'content'
            assert result['text'] == 'Hello world'

    def test_markdown_code_fence_stripped(self):
        response = '```json\n{"page_type": "cover", "text": "Title Page", "elements": []}\n```'
        with patch('routes.upload_routes._describe_image_via_llm', return_value=response):
            result = self.parse_page(1, "/fake/page.jpg")
            assert result['page_type'] == 'cover'

    def test_unstructured_text_wrapped(self):
        with patch('routes.upload_routes._describe_image_via_llm', return_value="Just some text on the page"):
            result = self.parse_page(2, "/fake/page.jpg")
            assert result['page_number'] == 2
            assert result['page_type'] == 'content'
            assert result['text'] == 'Just some text on the page'
            assert len(result['elements']) == 1


# ============================================================
# Route handler tests
# ============================================================

class TestUploadFileRoute:
    """Tests for POST /upload/file."""

    def test_no_file_returns_400(self, client):
        resp = client.post('/upload/file')
        assert resp.status_code == 400
        assert resp.get_json()['error'] == 'No file provided'

    @patch('routes.upload_routes._describe_image_via_llm', return_value=None)
    def test_upload_image_file(self, mock_llm, client, tmp_path):
        with patch('routes.upload_routes.FILE_DIR', tmp_path):
            data = {'file': _make_file_storage('photo.png', b'fake png')}
            resp = client.post('/upload/file', data=data,
                               content_type='multipart/form-data')
            assert resp.status_code == 200
            body = resp.get_json()
            assert body['file_type'] == 'image'
            assert body['file_url'].startswith('/uploads/files/')
            assert body['file_name'].endswith('.png')

    @patch('routes.upload_routes._describe_image_via_llm', return_value='{"description":"a cat"}')
    def test_upload_image_with_vision_description(self, mock_llm, client, tmp_path):
        with patch('routes.upload_routes.FILE_DIR', tmp_path):
            data = {'file': _make_file_storage('photo.jpg', b'fake jpg')}
            resp = client.post('/upload/file', data=data,
                               content_type='multipart/form-data')
            body = resp.get_json()
            assert body['image_description'] == '{"description":"a cat"}'

    def test_upload_with_agent_overrides_type(self, client, tmp_path):
        with patch('routes.upload_routes.FILE_DIR', tmp_path):
            data = {
                'file': _make_file_storage('photo.png', b'fake'),
                'agent': 'my_agent',
            }
            resp = client.post('/upload/file', data=data,
                               content_type='multipart/form-data')
            body = resp.get_json()
            assert body['file_type'] == 'agent'

    @patch('routes.upload_routes._run_pdf_parse')
    def test_upload_pdf_triggers_parse_job(self, mock_parse, client, tmp_path):
        with patch('routes.upload_routes.FILE_DIR', tmp_path):
            data = {'file': _make_file_storage('document.pdf', b'%PDF-1.4 fake')}
            resp = client.post('/upload/file', data=data,
                               content_type='multipart/form-data')
            body = resp.get_json()
            assert body['file_type'] == 'pdf'
            assert body['pdf_parse_job_id'] is not None

    def test_upload_document_type(self, client, tmp_path):
        with patch('routes.upload_routes.FILE_DIR', tmp_path):
            data = {'file': _make_file_storage('readme.txt', b'hello')}
            resp = client.post('/upload/file', data=data,
                               content_type='multipart/form-data')
            body = resp.get_json()
            assert body['file_type'] == 'document'
            assert body['pdf_parse_job_id'] is None

    def test_upload_with_form_fields(self, client, tmp_path):
        with patch('routes.upload_routes.FILE_DIR', tmp_path):
            data = {
                'file': _make_file_storage('data.csv', b'a,b,c'),
                'user_id': '42',
                'request_id': 'req-123',
            }
            resp = client.post('/upload/file', data=data,
                               content_type='multipart/form-data')
            body = resp.get_json()
            assert body['request_id'] == 'req-123'


class TestUploadImageRoute:
    """Tests for POST /upload/image (avatar)."""

    def test_no_image_returns_400(self, client):
        resp = client.post('/upload/image')
        assert resp.status_code == 400
        assert resp.get_json()['error'] == 'No image provided'

    def test_avatar_upload_success(self, client, tmp_path):
        with patch('routes.upload_routes.AVATAR_DIR', tmp_path):
            data = {
                'image': _make_file_storage('avatar.png', b'fake avatar'),
                'user_id': '7',
                'name': 'My Agent',
                'request_id': 'req-456',
            }
            resp = client.post('/upload/image', data=data,
                               content_type='multipart/form-data')
            assert resp.status_code == 200
            body = resp.get_json()
            assert body['response'] == 'Avatar uploaded successfully'
            assert body['avatar_url'].startswith('/uploads/avatars/')
            assert body['request_id'] == 'req-456'


class TestUploadAudioRoute:
    """Tests for POST /upload/audio."""

    def test_no_audio_returns_400(self, client):
        resp = client.post('/upload/audio')
        assert resp.status_code == 400
        assert resp.get_json()['error'] == 'No audio provided'

    def test_audio_upload_success(self, client, tmp_path):
        with patch('routes.upload_routes.AUDIO_DIR', tmp_path):
            data = {
                'audio': _make_file_storage('voice.wav', b'RIFF fake wav'),
                'user_id': '3',
                'request_id': 'req-789',
            }
            resp = client.post('/upload/audio', data=data,
                               content_type='multipart/form-data')
            assert resp.status_code == 200
            body = resp.get_json()
            assert body['response'] == 'Voice signature uploaded'
            assert body['audio_url'].startswith('/uploads/audio/')
            assert body['request_id'] == 'req-789'


class TestVisionInferenceRoute:
    """Tests for POST /upload/vision."""

    def test_multipart_no_image_returns_400(self, client):
        resp = client.post('/upload/vision', data={},
                           content_type='multipart/form-data')
        assert resp.status_code == 400

    @patch('routes.upload_routes._describe_image_via_llm')
    def test_multipart_success(self, mock_llm, client, tmp_path):
        mock_llm.return_value = '{"description":"sunset","category":"photograph"}'
        with patch('routes.upload_routes.IMAGE_DIR', tmp_path):
            data = {'image': _make_file_storage('photo.jpg', b'fake jpg')}
            resp = client.post('/upload/vision', data=data,
                               content_type='multipart/form-data')
            assert resp.status_code == 200
            body = resp.get_json()
            assert body['description'] == 'sunset'

    @patch('routes.upload_routes._describe_image_via_llm')
    def test_json_base64_success(self, mock_llm, client, tmp_path):
        mock_llm.return_value = 'A beautiful landscape'
        with patch('routes.upload_routes.IMAGE_DIR', tmp_path):
            img_b64 = base64.b64encode(b'fake image bytes').decode()
            resp = client.post('/upload/vision',
                               json={'image_base64': img_b64})
            assert resp.status_code == 200
            body = resp.get_json()
            assert body['description'] == 'A beautiful landscape'

    def test_json_local_url_not_found(self, client, tmp_path):
        with patch('routes.upload_routes.UPLOAD_DIR', tmp_path):
            resp = client.post('/upload/vision',
                               json={'image_url': '/uploads/images/nonexistent.jpg'})
            assert resp.status_code == 404

    @patch('routes.upload_routes._describe_image_via_llm')
    def test_json_local_url_success(self, mock_llm, client, tmp_path):
        mock_llm.return_value = '{"description":"chart","category":"diagram/chart"}'
        # Create the file at the expected path
        img_dir = tmp_path / "images"
        img_dir.mkdir()
        (img_dir / "test.jpg").write_bytes(b'fake')
        with patch('routes.upload_routes.UPLOAD_DIR', tmp_path):
            resp = client.post('/upload/vision',
                               json={'image_url': '/uploads/images/test.jpg'})
            assert resp.status_code == 200

    def test_json_no_image_source_returns_400(self, client):
        resp = client.post('/upload/vision', json={})
        assert resp.status_code == 400
        assert 'Provide image_base64' in resp.get_json()['error']

    @patch('routes.upload_routes._describe_image_via_llm', return_value=None)
    def test_vision_unavailable_returns_503(self, mock_llm, client, tmp_path):
        with patch('routes.upload_routes.IMAGE_DIR', tmp_path):
            data = {'image': _make_file_storage('photo.png', b'fake')}
            resp = client.post('/upload/vision', data=data,
                               content_type='multipart/form-data')
            assert resp.status_code == 503
            assert 'unavailable' in resp.get_json()['error']

    @patch('routes.upload_routes._describe_image_via_llm')
    def test_unstructured_response_wrapped(self, mock_llm, client, tmp_path):
        mock_llm.return_value = 'This is just plain text, not JSON'
        with patch('routes.upload_routes.IMAGE_DIR', tmp_path):
            data = {'image': _make_file_storage('test.png', b'fake')}
            resp = client.post('/upload/vision', data=data,
                               content_type='multipart/form-data')
            assert resp.status_code == 200
            body = resp.get_json()
            assert body['description'] == 'This is just plain text, not JSON'
            assert body['category'] == 'unknown'

    def test_json_external_url_rejected(self, client):
        resp = client.post('/upload/vision',
                           json={'image_url': 'https://example.com/img.jpg'})
        assert resp.status_code == 400


class TestParsePdfRoute:
    """Tests for POST /upload/parse_pdf."""

    def test_multipart_no_file_returns_400(self, client):
        resp = client.post('/upload/parse_pdf', data={},
                           content_type='multipart/form-data')
        assert resp.status_code == 400

    def test_multipart_non_pdf_returns_400(self, client):
        data = {'file': _make_file_storage('image.png', b'fake')}
        resp = client.post('/upload/parse_pdf', data=data,
                           content_type='multipart/form-data')
        assert resp.status_code == 400
        assert 'Only PDF' in resp.get_json()['error']

    def test_json_missing_file_url_returns_400(self, client):
        resp = client.post('/upload/parse_pdf', json={})
        assert resp.status_code == 400

    def test_json_file_not_found_returns_404(self, client, tmp_path):
        with patch('routes.upload_routes.UPLOAD_DIR', tmp_path):
            resp = client.post('/upload/parse_pdf',
                               json={'file_url': '/uploads/files/missing.pdf'})
            assert resp.status_code == 404

    @patch('routes.upload_routes._run_pdf_parse')
    def test_small_pdf_sync_success(self, mock_run, client, tmp_path):
        """Small PDF (<2MB) should be processed synchronously."""
        def fake_run(job_id, pdf_path, user_id, request_id):
            from routes.upload_routes import _parse_jobs
            _parse_jobs[job_id]['status'] = 'completed'
            _parse_jobs[job_id]['result'] = {
                'job_id': job_id, 'total_pages': 1,
                'pages': [], 'whole_text': 'text',
            }

        mock_run.side_effect = fake_run

        with patch('routes.upload_routes.FILE_DIR', tmp_path):
            # Create a small "PDF" file
            data = {'file': _make_file_storage('small.pdf', b'%PDF small')}
            resp = client.post('/upload/parse_pdf', data=data,
                               content_type='multipart/form-data')
            assert resp.status_code == 200
            body = resp.get_json()
            assert body['total_pages'] == 1

    @patch('routes.upload_routes._run_pdf_parse')
    def test_small_pdf_sync_failure(self, mock_run, client, tmp_path):
        def fake_run(job_id, pdf_path, user_id, request_id):
            from routes.upload_routes import _parse_jobs
            _parse_jobs[job_id]['status'] = 'failed'
            _parse_jobs[job_id]['error'] = 'PDF conversion failed'

        mock_run.side_effect = fake_run

        with patch('routes.upload_routes.FILE_DIR', tmp_path):
            data = {'file': _make_file_storage('bad.pdf', b'%PDF broken')}
            resp = client.post('/upload/parse_pdf', data=data,
                               content_type='multipart/form-data')
            assert resp.status_code == 500
            assert 'job_id' in resp.get_json()

    @patch('routes.upload_routes.threading.Thread')
    def test_large_pdf_async(self, mock_thread, client, tmp_path):
        """Large PDF (>=2MB) should be processed asynchronously."""
        with patch('routes.upload_routes.FILE_DIR', tmp_path):
            # Create a large "PDF" — need the file to exist for os.path.getsize
            large_content = b'%PDF' + b'x' * (3 * 1024 * 1024)  # 3MB
            data = {'file': _make_file_storage('large.pdf', large_content)}
            resp = client.post('/upload/parse_pdf', data=data,
                               content_type='multipart/form-data')
            assert resp.status_code == 202
            body = resp.get_json()
            assert body['status'] == 'queued'
            assert 'job_id' in body
            mock_thread.return_value.start.assert_called_once()


class TestParsePdfStatusRoute:
    """Tests for GET/POST /upload/parse_pdf/status."""

    def test_get_unknown_job_returns_404(self, client):
        resp = client.get('/upload/parse_pdf/status?job_id=nonexistent')
        assert resp.status_code == 404

    def test_get_empty_job_id_returns_404(self, client):
        resp = client.get('/upload/parse_pdf/status')
        assert resp.status_code == 404

    def test_post_unknown_job_returns_404(self, client):
        resp = client.post('/upload/parse_pdf/status',
                           json={'job_id': 'missing'})
        assert resp.status_code == 404

    def test_get_queued_job(self, client):
        from routes.upload_routes import _parse_jobs
        _parse_jobs['test-job-1'] = {
            'status': 'queued', 'total_pages': 0, 'progress': 0,
            'result': None, 'error': None, 'created_at': time.time(),
        }
        try:
            resp = client.get('/upload/parse_pdf/status?job_id=test-job-1')
            assert resp.status_code == 200
            body = resp.get_json()
            assert body['status'] == 'queued'
            assert body['job_id'] == 'test-job-1'
        finally:
            _parse_jobs.pop('test-job-1', None)

    def test_get_completed_job_includes_result(self, client):
        from routes.upload_routes import _parse_jobs
        _parse_jobs['test-job-2'] = {
            'status': 'completed', 'total_pages': 5, 'progress': 5,
            'result': {'pages': [], 'total_pages': 5},
            'error': None, 'created_at': time.time(),
        }
        try:
            resp = client.get('/upload/parse_pdf/status?job_id=test-job-2')
            body = resp.get_json()
            assert body['status'] == 'completed'
            assert 'result' in body
            assert body['result']['total_pages'] == 5
        finally:
            _parse_jobs.pop('test-job-2', None)

    def test_get_failed_job_includes_error(self, client):
        from routes.upload_routes import _parse_jobs
        _parse_jobs['test-job-3'] = {
            'status': 'failed', 'total_pages': 0, 'progress': 0,
            'result': None, 'error': 'Conversion error',
            'created_at': time.time(),
        }
        try:
            resp = client.get('/upload/parse_pdf/status?job_id=test-job-3')
            body = resp.get_json()
            assert body['status'] == 'failed'
            assert body['error'] == 'Conversion error'
        finally:
            _parse_jobs.pop('test-job-3', None)

    def test_post_method_works(self, client):
        from routes.upload_routes import _parse_jobs
        _parse_jobs['test-job-4'] = {
            'status': 'parsing', 'total_pages': 10, 'progress': 3,
            'result': None, 'error': None, 'created_at': time.time(),
        }
        try:
            resp = client.post('/upload/parse_pdf/status',
                               json={'job_id': 'test-job-4'})
            body = resp.get_json()
            assert body['status'] == 'parsing'
            assert body['progress'] == 3
        finally:
            _parse_jobs.pop('test-job-4', None)


class TestServeUpload:
    """Tests for GET /uploads/<path>."""

    def test_serve_existing_file(self, client, tmp_path):
        # Create a test file
        (tmp_path / "test.txt").write_text("hello world")
        with patch('routes.upload_routes.UPLOAD_DIR', tmp_path):
            # Re-register because send_from_directory uses the patched value
            resp = client.get('/uploads/test.txt')
            assert resp.status_code == 200
            assert resp.data == b'hello world'

    def test_serve_nested_path(self, client, tmp_path):
        sub = tmp_path / "images"
        sub.mkdir()
        (sub / "pic.png").write_bytes(b'fake png')
        with patch('routes.upload_routes.UPLOAD_DIR', tmp_path):
            resp = client.get('/uploads/images/pic.png')
            assert resp.status_code == 200

    def test_serve_nonexistent_returns_404(self, client, tmp_path):
        with patch('routes.upload_routes.UPLOAD_DIR', tmp_path):
            resp = client.get('/uploads/nonexistent.txt')
            assert resp.status_code == 404


class TestRegisterUploadRoutes:
    """Tests for register_upload_routes()."""

    def test_registers_blueprint(self):
        from flask import Flask

        from routes.upload_routes import register_upload_routes
        app = Flask(__name__)
        register_upload_routes(app)
        # Check routes are registered
        rules = [rule.rule for rule in app.url_map.iter_rules()]
        assert '/upload/file' in rules
        assert '/upload/image' in rules
        assert '/upload/audio' in rules
        assert '/upload/vision' in rules
        assert '/upload/parse_pdf' in rules
        assert '/upload/parse_pdf/status' in rules


class TestResolveNunbaDir:
    """Tests for _resolve_nunba_dir()."""

    def test_env_var_override(self):
        from routes.upload_routes import _resolve_nunba_dir
        with patch.dict(os.environ, {'NUNBA_DATA_DIR': '/custom/path'}):
            assert _resolve_nunba_dir() == '/custom/path'

    def test_fallback_to_home(self):
        from routes.upload_routes import _resolve_nunba_dir
        with patch.dict(os.environ, {}, clear=False):
            os.environ.pop('NUNBA_DATA_DIR', None)
            with patch('routes.upload_routes._resolve_nunba_dir.__module__', 'routes.upload_routes'):
                # Force ImportError for core.platform_paths
                with patch.dict(sys.modules, {'core': None, 'core.platform_paths': None}):
                    result = _resolve_nunba_dir()
                    expected = os.path.join(os.path.expanduser('~'), 'Documents', 'Nunba')
                    assert result == expected
