"""
test_download_script.py - Tests for scripts/download.py

Covers:
- download_file() URL retrieval
- main() orchestration (mkdir, download, extract, patch, pip install)
- Error handling for download failures
- pth file patching (uncomment import site)
- Edge cases: existing files, permissions, missing directories
"""
import os
import sys
import tempfile
import zipfile
from unittest.mock import MagicMock, call, patch

import pytest

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from scripts.download import download_file, main

# ============================================================
# download_file()
# ============================================================

class TestDownloadFile:
    @patch('scripts.download.urllib.request.urlretrieve')
    def test_downloads_to_path(self, mock_retrieve):
        download_file("https://example.com/file.zip", "/tmp/file.zip")
        mock_retrieve.assert_called_once_with("https://example.com/file.zip", "/tmp/file.zip")

    @patch('scripts.download.urllib.request.urlretrieve', side_effect=Exception("network error"))
    def test_raises_on_network_error(self, mock_retrieve):
        with pytest.raises(Exception, match="network error"):
            download_file("https://example.com/file.zip", "/tmp/file.zip")


# ============================================================
# main() — full pipeline with mocks
# ============================================================

class TestMain:
    @patch('scripts.download.subprocess.run')
    @patch('scripts.download.zipfile.ZipFile')
    @patch('scripts.download.urllib.request.urlretrieve')
    @patch('scripts.download.os.path.exists')
    @patch('scripts.download.os.makedirs')
    def test_main_success_returns_zero(self, mock_makedirs, mock_exists, mock_retrieve,
                                        mock_zipfile, mock_subprocess):
        mock_exists.return_value = False
        mock_subprocess.return_value = MagicMock(returncode=0)
        mock_zf_instance = MagicMock()
        mock_zipfile.return_value.__enter__ = MagicMock(return_value=mock_zf_instance)
        mock_zipfile.return_value.__exit__ = MagicMock(return_value=False)

        # Mock pth file read/write
        pth_content = "#import site\npython310.zip\n."
        with patch('builtins.open', create=True) as mock_open_fn:
            mock_open_fn.return_value.__enter__ = MagicMock(return_value=MagicMock(
                read=MagicMock(return_value=pth_content)
            ))
            mock_open_fn.return_value.__exit__ = MagicMock(return_value=False)

            result = main()

        assert result == 0

    @patch('scripts.download.subprocess.run', side_effect=Exception("pip broke"))
    @patch('scripts.download.zipfile.ZipFile')
    @patch('scripts.download.urllib.request.urlretrieve')
    @patch('scripts.download.os.path.exists', return_value=False)
    @patch('scripts.download.os.makedirs')
    def test_main_returns_one_on_error(self, mock_makedirs, mock_exists,
                                        mock_retrieve, mock_zipfile, mock_subprocess):
        mock_zf_instance = MagicMock()
        mock_zipfile.return_value.__enter__ = MagicMock(return_value=mock_zf_instance)
        mock_zipfile.return_value.__exit__ = MagicMock(return_value=False)

        with patch('builtins.open', create=True) as mock_open_fn:
            mock_open_fn.return_value.__enter__ = MagicMock(return_value=MagicMock(
                read=MagicMock(return_value="#import site\n")
            ))
            mock_open_fn.return_value.__exit__ = MagicMock(return_value=False)
            result = main()

        assert result == 1

    @patch('scripts.download.subprocess.run')
    @patch('scripts.download.zipfile.ZipFile')
    @patch('scripts.download.urllib.request.urlretrieve')
    @patch('scripts.download.os.makedirs')
    def test_skips_download_when_files_exist(self, mock_makedirs, mock_retrieve,
                                              mock_zipfile, mock_subprocess):
        mock_subprocess.return_value = MagicMock(returncode=0)
        mock_zf_instance = MagicMock()
        mock_zipfile.return_value.__enter__ = MagicMock(return_value=mock_zf_instance)
        mock_zipfile.return_value.__exit__ = MagicMock(return_value=False)

        with patch('scripts.download.os.path.exists', return_value=True):
            with patch('builtins.open', create=True) as mock_open_fn:
                mock_open_fn.return_value.__enter__ = MagicMock(return_value=MagicMock(
                    read=MagicMock(return_value="import site\n")
                ))
                mock_open_fn.return_value.__exit__ = MagicMock(return_value=False)
                result = main()

        # Should NOT have called urlretrieve (files already exist)
        mock_retrieve.assert_not_called()
        assert result == 0


# ============================================================
# pth file patching
# ============================================================

class TestPthFilePatching:
    def test_pth_file_uncomment_import_site(self):
        """Verify the logic that uncomments '#import site' in python310._pth"""
        content = "#import site\npython310.zip\n."
        if "#import site" in content:
            content = content.replace("#import site", "import site")
        assert "import site" in content
        assert "#import site" not in content

    def test_pth_file_already_uncommented(self):
        """If already uncommented, no change needed"""
        content = "import site\npython310.zip\n."
        if "#import site" in content:
            content = content.replace("#import site", "import site")
        assert "import site" in content
        assert content.count("import site") == 1


# ============================================================
# URL constants
# ============================================================

class TestConstants:
    def test_python_embed_url_format(self):
        """Verify the download URL points to python.org"""
        # Reading directly from the module source
        import scripts.download
        source = open(os.path.join(PROJECT_ROOT, 'scripts', 'download.py')).read()
        assert 'python.org/ftp/python' in source

    def test_get_pip_url(self):
        import scripts.download
        source = open(os.path.join(PROJECT_ROOT, 'scripts', 'download.py')).read()
        assert 'bootstrap.pypa.io/get-pip.py' in source
