"""
llama_installer.py - Automatic Llama.cpp and Model Download/Installation

Handles automatic installation of Llama.cpp and downloading models from HuggingFace
during Nunba app first run or on-demand.

Based on the implementation from TrueFlow AIExplanationPanel.kt
"""
import json
import logging
import os
import platform
import shutil
import subprocess
import sys
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger('NunbaLlamaInstaller')

# Minimum llama.cpp build required for Qwen3.5 models (architecture support)
MIN_LLAMACPP_BUILD_QWEN35 = 8148


class ModelPreset:
    """Model configuration presets"""
    def __init__(self, display_name: str, repo_id: str, file_name: str,
                 size_mb: int, description: str, has_vision: bool = False,
                 mmproj_file: str | None = None,
                 mmproj_source_file: str | None = None,
                 min_build: int | None = None):
        self.display_name = display_name
        self.repo_id = repo_id
        self.file_name = file_name
        self.size_mb = size_mb
        self.description = description
        self.has_vision = has_vision
        self.mmproj_file = mmproj_file          # Local unique name (e.g. mmproj-Qwen3.5-4B-F16.gguf)
        self.mmproj_source_file = mmproj_source_file or mmproj_file  # HF name (usually mmproj-F16.gguf)
        self.min_build = min_build


# Model presets from HuggingFace
# Qwen3.5 VL models are the default — 256K context, unified VLM (vision+text)
MODEL_PRESETS = [
    # Qwen3.5 models - default choice, 256K context, unified VLM (vision+text)
    # Requires llama.cpp build b8148+, NOT compatible with Ollama
    ModelPreset(
        "Qwen3.5-4B VL (Recommended)",
        "unsloth/Qwen3.5-4B-GGUF",
        "Qwen3.5-4B-UD-Q4_K_XL.gguf",
        2910,
        "256K context, vision+text, best quality (GPU ≥4GB VRAM)",
        has_vision=True,
        mmproj_file="mmproj-Qwen3.5-4B-F16.gguf",
        mmproj_source_file="mmproj-F16.gguf",
        min_build=MIN_LLAMACPP_BUILD_QWEN35
    ),
    ModelPreset(
        "Qwen3.5-2B VL",
        "unsloth/Qwen3.5-2B-GGUF",
        "Qwen3.5-2B-UD-Q4_K_XL.gguf",
        1340,
        "256K context, vision+text, lightweight (low VRAM / CPU)",
        has_vision=True,
        mmproj_file="mmproj-Qwen3.5-2B-F16.gguf",
        mmproj_source_file="mmproj-F16.gguf",
        min_build=MIN_LLAMACPP_BUILD_QWEN35
    ),
    # Older Qwen3-VL models
    ModelPreset(
        "Qwen3-VL-2B Instruct Q4_K_XL",
        "unsloth/Qwen3-VL-2B-Instruct-GGUF",
        "Qwen3-VL-2B-Instruct-UD-Q4_K_XL.gguf",
        1500,
        "Vision+text, good for code analysis with diagrams",
        has_vision=True,
        mmproj_file="mmproj-Qwen3-VL-2B-F16.gguf",
        mmproj_source_file="mmproj-F16.gguf"
    ),
    # Smallest Qwen3.5 — for CPU-only / ultra-low VRAM machines
    ModelPreset(
        "Qwen3.5-0.8B UD-Q4_K_XL",
        "unsloth/Qwen3.5-0.8B-GGUF",
        "Qwen3.5-0.8B-UD-Q4_K_XL.gguf",
        550,
        "Smallest Qwen3.5, text-only, ~550MB, runs on anything",
        has_vision=False
    ),
    ModelPreset(
        "Qwen3-2B Text-Only Q4_K_M",
        "unsloth/Qwen3-2B-Instruct-GGUF",
        "Qwen3-2B-Instruct-Q4_K_M.gguf",
        1100,
        "Text-only, fastest, no vision support",
        has_vision=False
    ),
    # Larger Qwen3.5 models — dynamically selected based on available VRAM
    # All use Unsloth 4-bit UD dynamic quant, Qwen3.5 architecture (256K context)
    # All support vision via mmproj (confirmed: unsloth.ai/docs/models/qwen3.5)
    ModelPreset(
        "Qwen3.5-9B UD-Q4_K_XL",
        "unsloth/Qwen3.5-9B-GGUF",
        "Qwen3.5-9B-UD-Q4_K_XL.gguf",
        6113,  # 5.97 GB
        "256K context, 9B params, vision+text, strong reasoning (llama.cpp only)",
        has_vision=True,
        mmproj_file="mmproj-Qwen3.5-9B-F16.gguf",
        mmproj_source_file="mmproj-F16.gguf",
        min_build=MIN_LLAMACPP_BUILD_QWEN35
    ),
    ModelPreset(
        "Qwen3.5-27B UD-Q4_K_XL",
        "unsloth/Qwen3.5-27B-GGUF",
        "Qwen3.5-27B-UD-Q4_K_XL.gguf",
        18022,  # 17.6 GB
        "256K context, 27B params, vision+text, near-frontier quality (llama.cpp only)",
        has_vision=True,
        mmproj_file="mmproj-Qwen3.5-27B-F16.gguf",
        mmproj_source_file="mmproj-F16.gguf",
        min_build=MIN_LLAMACPP_BUILD_QWEN35
    ),
    ModelPreset(
        "Qwen3.5-35B-A3B MoE UD-Q4_K_XL",
        "unsloth/Qwen3.5-35B-A3B-GGUF",
        "Qwen3.5-35B-A3B-UD-Q4_K_XL.gguf",
        22733,  # 22.2 GB
        "256K context, 35B MoE (active 3B), vision+text, fast inference (llama.cpp only)",
        has_vision=True,
        mmproj_file="mmproj-Qwen3.5-35B-A3B-F16.gguf",
        mmproj_source_file="mmproj-F16.gguf",
        min_build=MIN_LLAMACPP_BUILD_QWEN35
    ),
]


# Sibling project model directories to search before re-downloading.
# If a model already exists in a sibling project, Nunba reuses it.
SIBLING_MODEL_DIRS = [
    Path.home() / ".trueflow" / "models",
    Path.home() / ".ollama" / "models",
]

# HuggingFace Hub cache — nested structure: models--org--repo/snapshots/hash/file
_HF_CACHE_DIR = Path(os.environ.get("HF_HOME", Path.home() / ".cache" / "huggingface")) / "hub"


class LlamaInstaller:
    """Handles Llama.cpp installation and model downloading"""

    def __init__(self, install_dir: str | None = None, models_dir: str | None = None):
        """
        Initialize the installer

        Args:
            install_dir: Directory to install llama.cpp (defaults to ~/.nunba/llama.cpp)
            models_dir: Directory to store models (defaults to ~/.nunba/models)
        """
        home = Path.home()
        self.install_dir = Path(install_dir) if install_dir else home / ".nunba" / "llama.cpp"
        self.models_dir = Path(models_dir) if models_dir else home / ".nunba" / "models"
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.install_dir.parent.mkdir(parents=True, exist_ok=True)

        self.os_name = platform.system().lower()
        self.gpu_available = self._detect_gpu()
        self.binary_supports_gpu = False  # Will be set during installation

    def _detect_gpu(self) -> str:
        """Detect available GPU acceleration (CUDA on Windows/Linux, Metal on macOS)"""
        try:
            if "darwin" in self.os_name:
                # macOS - Metal is always available on modern Macs
                return "metal"
            elif "windows" in self.os_name or "linux" in self.os_name:
                # Check for CUDA via nvidia-smi
                try:
                    si = None
                    cf = 0
                    if sys.platform == 'win32':
                        si = subprocess.STARTUPINFO()
                        si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                        si.wShowWindow = 0
                        cf = subprocess.CREATE_NO_WINDOW
                    result = subprocess.run(
                        ["nvidia-smi", "--query-gpu=name", "--format=csv,noheader"],
                        capture_output=True,
                        text=True,
                        timeout=3,
                        startupinfo=si,
                        creationflags=cf
                    )
                    if result.returncode == 0:
                        logger.debug(f"GPU detected: {result.stdout.strip()}")
                        return "cuda"
                except Exception:
                    pass
                # Check for AMD ROCm via rocm-smi (Linux primarily)
                try:
                    result = subprocess.run(
                        ["rocm-smi", "--showproductname"],
                        capture_output=True, text=True, timeout=3,
                        startupinfo=si, creationflags=cf
                    )
                    if result.returncode == 0 and result.stdout.strip():
                        logger.debug(f"AMD GPU detected: {result.stdout.strip()}")
                        return "rocm"
                except Exception:
                    pass
        except Exception as e:
            logger.debug(f"GPU detection failed: {e}")

        return "none"

    def find_llama_server(self, check_system_first: bool = True) -> str | None:
        """
        Find llama-server executable

        Args:
            check_system_first: If True, check system/user installations before Nunba installation

        Returns:
            Path to llama-server executable or None if not found
        """
        home = Path.home()
        exe_name = "llama-server.exe" if "windows" in self.os_name else "llama-server"

        # System/user installation paths (checked first if user already has llama.cpp)
        system_paths = [
            # TrueFlow sibling project (often has latest build)
            Path(home) / ".trueflow" / "llama.cpp" / "build" / "bin" / "Release" / exe_name,
            Path(home) / ".trueflow" / "llama.cpp" / "build" / "bin" / exe_name,
            # Common Unix installation locations
            Path("/usr/local/bin") / exe_name,
            Path("/usr/bin") / exe_name,
            Path(home) / ".local" / "bin" / exe_name,
            # Homebrew (macOS)
            Path("/opt/homebrew/bin") / exe_name,
            Path(home) / "llama.cpp" / "build" / "bin" / "Release" / exe_name,
            Path(home) / "llama.cpp" / "build" / "bin" / exe_name,
        ]
        # Windows-specific paths
        if "windows" in self.os_name:
            system_paths.extend([
                Path("C:/llama.cpp/build/bin/Release") / exe_name,
                Path("C:/llama.cpp/build/bin") / exe_name,
                Path("C:/Program Files/llama.cpp") / exe_name,
            ])

        # Nunba-managed installation paths
        nunba_paths = [
            self.install_dir / "build" / "bin" / "Release" / exe_name,
            self.install_dir / "build" / "bin" / exe_name,
            self.install_dir / exe_name,
        ]

        # Define search order based on preference
        if check_system_first:
            # Check system installations first, then Nunba installation
            search_paths = system_paths + nunba_paths
        else:
            # Check Nunba installation first, then system
            search_paths = nunba_paths + system_paths

        for path in search_paths:
            if path.exists():
                logger.info(f"Found llama-server at: {path}")
                # Update GPU support detection from the found binary's location
                bin_dir = path.parent
                cuda_dlls = list(bin_dir.glob("ggml-cuda*.dll")) + list(bin_dir.glob("ggml-cuda*.so"))
                if cuda_dlls:
                    self.binary_supports_gpu = True
                elif "darwin" in self.os_name:
                    self.binary_supports_gpu = True
                return str(path)

        # Try to find in PATH (system-wide installations)
        try:
            cmd = "where" if "windows" in self.os_name else "which"
            si = None
            cf = 0
            if sys.platform == 'win32':
                si = subprocess.STARTUPINFO()
                si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                si.wShowWindow = 0
                cf = subprocess.CREATE_NO_WINDOW
            result = subprocess.run([cmd, "llama-server"], capture_output=True, text=True, startupinfo=si, creationflags=cf)
            if result.returncode == 0 and result.stdout.strip():
                path = result.stdout.strip().split('\n')[0]
                logger.info(f"Found llama-server in PATH: {path}")
                return path
        except Exception:
            pass

        return None

    def is_system_installation(self, llama_path: str) -> bool:
        """
        Check if the llama-server path is a system/user installation (not Nunba-managed)

        Args:
            llama_path: Path to llama-server executable

        Returns:
            True if this is a system/user installation, False if Nunba-managed
        """
        llama_path_obj = Path(llama_path)
        return not str(llama_path_obj).startswith(str(self.install_dir))

    def get_version(self, llama_server_path: str | None = None) -> int | None:
        """
        Get the llama.cpp build number (e.g., 8192).

        Runs `llama-server --version` and parses the build number.

        Args:
            llama_server_path: Path to llama-server executable (auto-detected if None)

        Returns:
            Build number as int, or None if unknown
        """
        import re

        server_path = llama_server_path or self.find_llama_server()
        if not server_path:
            return None

        try:
            startupinfo = None
            creationflags = 0
            if sys.platform == 'win32':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = 0  # SW_HIDE
                creationflags = subprocess.CREATE_NO_WINDOW

            # Set cwd to binary dir so DLLs (mtmd.dll, ggml-cuda.dll) are found
            bin_dir = str(Path(server_path).parent)
            env = os.environ.copy()
            env["PATH"] = bin_dir + os.pathsep + env.get("PATH", "")

            result = subprocess.run(
                [server_path, "--version"],
                capture_output=True, text=True, timeout=10,
                cwd=bin_dir, env=env,
                startupinfo=startupinfo, creationflags=creationflags
            )
            output = (result.stdout + result.stderr).strip()

            # Try "version: NNNN" first (pre-built releases)
            match = re.search(r'version:\s*(\d{4,})', output)
            if match:
                return int(match.group(1))
            # Try "bNNNN" format (source builds, git tags)
            match = re.search(r'b(\d{4,})', output)
            if match:
                return int(match.group(1))
        except (subprocess.TimeoutExpired, OSError) as e:
            logger.debug(f"Version detection failed: {e}")

        return None

    def check_version_for_model(self, preset: 'ModelPreset',
                                llama_server_path: str | None = None) -> tuple:
        """
        Check if installed llama.cpp version supports the given model preset.

        Args:
            preset: ModelPreset to check compatibility for
            llama_server_path: Path to llama-server (auto-detected if None)

        Returns:
            (is_compatible, current_version, required_version)
        """
        required = preset.min_build
        if required is None:
            return (True, None, None)

        current = self.get_version(llama_server_path)

        if current is None:
            logger.warning(
                f"Cannot determine llama.cpp version. "
                f"Model {preset.display_name} requires build b{required}+."
            )
            return (True, None, required)

        is_ok = current >= required
        if not is_ok:
            logger.warning(
                f"llama.cpp build b{current} is too old for {preset.display_name}. "
                f"Required: b{required}+."
            )
        return (is_ok, current, required)

    def update_llama_cpp(self,
                         progress_callback: Callable[[str], None] | None = None) -> bool:
        """
        Update llama.cpp to the latest pre-built release from GitHub.

        Reuses try_download_prebuilt() after clearing the existing build.

        Args:
            progress_callback: Optional callback for status messages

        Returns:
            True if update successful, False otherwise
        """
        import re

        def report(msg: str):
            logger.info(msg)
            if progress_callback:
                progress_callback(msg)

        old_version = self.get_version()
        report(f"Current build: b{old_version}" if old_version else "Current build: unknown")

        try:
            # Check latest release version before downloading
            report("Checking latest release...")
            api_url = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
            req = urllib.request.Request(api_url, headers={"User-Agent": "Nunba/1.0"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                release = json.loads(resp.read().decode())

            tag = release.get("tag_name", "")
            tag_match = re.search(r'b?(\d{4,})', tag)
            new_build = int(tag_match.group(1)) if tag_match else None

            if old_version and new_build and old_version >= new_build:
                report(f"Already up to date (b{old_version})")
                return True

            report(f"Downloading {tag}...")

            # Clear existing build to force re-download
            bin_dir = self.install_dir / "build" / "bin" / "Release"
            if bin_dir.exists():
                shutil.rmtree(bin_dir)

            # Reuse existing download infrastructure
            success = self.try_download_prebuilt()

            if success:
                new_version = self.get_version()
                if old_version and new_version:
                    report(f"Updated: b{old_version} \u2192 b{new_version}")
                else:
                    report(f"Updated to b{new_version}" if new_version else "Update complete")
            else:
                report("Update failed — download error")

            return success

        except Exception as e:
            logger.error(f"Update failed: {e}")
            report(f"Update failed: {e}")
            return False

    def is_installed(self) -> bool:
        """Check if llama.cpp is already installed"""
        return self.find_llama_server() is not None

    def download_file_with_progress(
        self,
        url: str,
        dest_path: Path,
        progress_callback: Callable[[int, int], None] | None = None
    ) -> None:
        """
        Download a file with progress tracking and integrity validation.

        Args:
            url: URL to download from
            dest_path: Destination file path
            progress_callback: Optional callback(downloaded_bytes, total_bytes)

        Raises:
            RuntimeError: If downloaded file size doesn't match expected size
        """
        logger.info(f"Downloading from {url} to {dest_path}")

        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'Nunba/1.0')

        with urllib.request.urlopen(req, timeout=30) as response:
            total_size = int(response.headers.get('Content-Length', 0))
            downloaded = 0
            block_size = 1024 * 1024  # 1MB blocks

            with open(dest_path, 'wb') as f:
                while True:
                    buffer = response.read(block_size)
                    if not buffer:
                        break
                    f.write(buffer)
                    downloaded += len(buffer)
                    if progress_callback and total_size > 0:
                        progress_callback(downloaded, total_size)

        # Verify download integrity
        actual_size = dest_path.stat().st_size
        if total_size > 0 and actual_size != total_size:
            dest_path.unlink(missing_ok=True)
            raise RuntimeError(
                f"Download incomplete: got {actual_size} bytes, "
                f"expected {total_size} bytes. Deleted corrupted file."
            )

        logger.info(f"Download complete: {dest_path} ({actual_size} bytes)")

    @staticmethod
    def _extract_release_zip(zip_path: Path, bin_dir: Path) -> int:
        """Extract a release zip into bin_dir, handling both flat and nested structures."""
        import zipfile as zf_mod
        with zf_mod.ZipFile(str(zip_path), 'r') as zf:
            names = zf.namelist()
            # Detect if files are in a subdirectory
            prefix = ""
            for n in names:
                if "/" in n and not n.endswith("/"):
                    prefix = n.split("/")[0] + "/"
                    break

            count = 0
            for name in names:
                if name.endswith("/"):
                    continue
                basename = name[len(prefix):] if prefix and name.startswith(prefix) else name
                if not basename:
                    continue
                dest = bin_dir / basename
                with zf.open(name) as src:
                    with open(str(dest), 'wb') as dst:
                        dst.write(src.read())
                if sys.platform != "win32" and not basename.endswith(".dll"):
                    import stat
                    dest.chmod(dest.stat().st_mode | stat.S_IEXEC)
                count += 1
        zip_path.unlink()
        return count

    def try_download_prebuilt(self) -> bool:
        """
        Try to download prebuilt llama.cpp binaries from GitHub releases

        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info("Checking for prebuilt binaries...")

            # Fetch latest release info
            release_url = "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
            req = urllib.request.Request(release_url)
            req.add_header('User-Agent', 'Nunba/1.0')

            with urllib.request.urlopen(req, timeout=10) as response:
                release_data = json.loads(response.read().decode())

            tag_name = release_data.get('tag_name')
            if not tag_name:
                return False

            logger.info(f"Latest release: {tag_name}")

            # Determine the right binary for this platform
            use_cuda = self.gpu_available == "cuda"
            assets = release_data.get('assets', [])
            asset_map = {a['name']: a for a in assets}

            # Build list of zips to download (main binary + optional cudart)
            zips_to_download = []

            if "windows" in self.os_name:
                if use_cuda:
                    # Try CUDA 12.4 first, then 13.1, then any CUDA, then CPU
                    cuda_candidates = [
                        f"llama-{tag_name}-bin-win-cuda-12.4-x64.zip",
                        f"llama-{tag_name}-bin-win-cuda-13.1-x64.zip",
                    ]
                    main_asset = None
                    for candidate in cuda_candidates:
                        if candidate in asset_map:
                            main_asset = candidate
                            break
                    if not main_asset:
                        # Try any CUDA asset
                        for name in asset_map:
                            if name.startswith(f"llama-{tag_name}-bin-win-cuda") and name.endswith("-x64.zip"):
                                main_asset = name
                                break
                    if main_asset:
                        zips_to_download.append(main_asset)
                        # Also download matching cudart DLLs
                        cuda_ver = main_asset.split("cuda-")[1].split("-x64")[0] if "cuda-" in main_asset else None
                        if cuda_ver:
                            cudart_name = f"cudart-llama-bin-win-cuda-{cuda_ver}-x64.zip"
                            if cudart_name in asset_map:
                                zips_to_download.append(cudart_name)
                    else:
                        logger.info("No CUDA binary available, falling back to CPU")
                        use_cuda = False

                if not use_cuda:
                    cpu_name = f"llama-{tag_name}-bin-win-cpu-x64.zip"
                    if cpu_name in asset_map:
                        zips_to_download.append(cpu_name)

            elif "darwin" in self.os_name:
                import platform
                arch = platform.machine().lower()
                if arch in ('arm64', 'aarch64'):
                    macos_name = f"llama-{tag_name}-bin-macos-arm64.zip"
                else:
                    macos_name = f"llama-{tag_name}-bin-macos-x64.zip"
                if macos_name in asset_map:
                    zips_to_download.append(macos_name)
                elif macos_name != f"llama-{tag_name}-bin-macos-arm64.zip":
                    # x86_64 not found, try arm64 (Rosetta 2 can run it)
                    fallback = f"llama-{tag_name}-bin-macos-arm64.zip"
                    if fallback in asset_map:
                        zips_to_download.append(fallback)
                        logger.info("x86_64 binary not found, using arm64 via Rosetta 2")

            else:  # Linux
                if use_cuda:
                    cuda_candidates = [
                        f"llama-{tag_name}-bin-ubuntu-cuda-12.4-x64.zip",
                        f"llama-{tag_name}-bin-ubuntu-cuda-13.1-x64.zip",
                    ]
                    main_asset = None
                    for candidate in cuda_candidates:
                        if candidate in asset_map:
                            main_asset = candidate
                            break
                    if main_asset:
                        zips_to_download.append(main_asset)
                    else:
                        logger.info("No CUDA binary available, falling back to CPU")
                        use_cuda = False

                if not use_cuda:
                    cpu_name = f"llama-{tag_name}-bin-ubuntu-x64.zip"
                    if cpu_name in asset_map:
                        zips_to_download.append(cpu_name)

            if not zips_to_download:
                logger.warning(f"No compatible assets found in release {tag_name}")
                return False

            # Create install directory and bin dir
            self.install_dir.mkdir(parents=True, exist_ok=True)
            bin_dir = self.install_dir / "build" / "bin" / "Release"
            bin_dir.mkdir(parents=True, exist_ok=True)

            # Download and extract each zip directly into bin_dir
            total_files = 0
            for zip_name in zips_to_download:
                download_url = asset_map[zip_name].get('browser_download_url')
                if not download_url:
                    continue

                logger.info(f"Downloading: {zip_name}")
                zip_path = self.install_dir / zip_name
                self.download_file_with_progress(download_url, zip_path)

                logger.info(f"Extracting: {zip_name}")
                count = self._extract_release_zip(zip_path, bin_dir)
                total_files += count
                logger.info(f"  Extracted {count} files")

            if total_files == 0:
                logger.error("No files extracted from release")
                return False

            # Set GPU support flag
            got_cuda = any("cuda" in z.lower() for z in zips_to_download)
            if got_cuda:
                self.binary_supports_gpu = True
                logger.info(f"Installed CUDA-enabled llama.cpp ({total_files} files)")
            elif "darwin" in self.os_name:
                self.binary_supports_gpu = True
                logger.info(f"Installed macOS llama.cpp with Metal ({total_files} files)")
            else:
                self.binary_supports_gpu = False
                logger.info(f"Installed CPU-only llama.cpp ({total_files} files)")

            return True

        except Exception as e:
            logger.error(f"Prebuilt download failed: {e}")
            return False

    def build_from_source(self) -> bool:
        """
        Build llama.cpp from source (fallback if prebuilt not available)

        Returns:
            True if successful, False otherwise
        """
        try:
            logger.info("Building llama.cpp from source...")

            # Check for git
            try:
                subprocess.run(["git", "--version"], check=True, capture_output=True)
            except Exception:
                logger.error("Git not found. Please install git to build from source.")
                return False

            # Check for cmake
            try:
                subprocess.run(["cmake", "--version"], check=True, capture_output=True)
            except Exception:
                logger.error("CMake not found. Please install CMake to build from source.")
                return False

            # Clone repository
            if self.install_dir.exists():
                shutil.rmtree(self.install_dir)
            self.install_dir.parent.mkdir(parents=True, exist_ok=True)

            logger.info("Cloning llama.cpp repository...")
            subprocess.run(
                ["git", "clone", "--depth", "1",
                 "https://github.com/ggml-org/llama.cpp",
                 str(self.install_dir)],
                check=True
            )

            # Create build directory
            build_dir = self.install_dir / "build"
            build_dir.mkdir(exist_ok=True)

            # Configure with CMake
            logger.info("Configuring build (CMake)...")
            use_cuda = self.gpu_available == "cuda"
            cmake_args = [
                "cmake", "..",
                "-DBUILD_SHARED_LIBS=OFF",
                f"-DGGML_CUDA={'ON' if use_cuda else 'OFF'}",
                "-DLLAMA_CURL=OFF",
                "-DLLAMA_BUILD_SERVER=ON"
            ]

            subprocess.run(cmake_args, cwd=build_dir, check=True)

            # Build
            logger.info("Building llama.cpp (this takes a few minutes)...")
            subprocess.run(
                ["cmake", "--build", ".", "--config", "Release", "-j"],
                cwd=build_dir,
                check=True
            )

            logger.info(f"llama.cpp installed successfully to: {self.install_dir}")
            return True

        except Exception as e:
            logger.error(f"Build from source failed: {e}")
            return False

    def install_llama_cpp(self, progress_callback: Callable[[str], None] | None = None) -> bool:
        """
        Install llama.cpp (try prebuilt first, then build from source)

        Args:
            progress_callback: Optional callback to report progress status messages

        Returns:
            True if successful, False otherwise
        """
        if self.is_installed():
            server_path = self.find_llama_server()
            logger.info(f"llama.cpp is already installed at {server_path}")
            # Detect GPU support by checking for ggml-cuda DLL next to binary
            self.binary_supports_gpu = False
            if server_path:
                bin_dir = Path(server_path).parent
                cuda_dlls = list(bin_dir.glob("ggml-cuda*.dll")) + list(bin_dir.glob("ggml-cuda*.so"))
                if cuda_dlls:
                    self.binary_supports_gpu = True
                    logger.info(f"Existing binary has CUDA support ({cuda_dlls[0].name})")
                elif "darwin" in self.os_name:
                    self.binary_supports_gpu = True  # Metal on macOS
                else:
                    logger.info("Existing binary is CPU-only (no ggml-cuda DLL found)")
                    # If GPU is available but binary doesn't support it, re-download
                    if self.gpu_available == "cuda":
                        logger.info("GPU available but binary is CPU-only — downloading CUDA build")
                        if progress_callback:
                            progress_callback("Upgrading to CUDA-enabled build...")
                        if self.try_download_prebuilt():
                            if progress_callback:
                                msg = "CUDA build installed!" if self.binary_supports_gpu else "Installed (CPU-only)"
                                progress_callback(msg)
                            return True
                        logger.warning("CUDA download failed, continuing with CPU-only binary")
            if progress_callback:
                progress_callback("llama.cpp is already installed")
            return True

        if progress_callback:
            progress_callback("Installing llama.cpp...")

        # Try prebuilt first
        if progress_callback:
            progress_callback("Downloading prebuilt binaries...")

        if self.try_download_prebuilt():
            if progress_callback:
                if self.binary_supports_gpu:
                    progress_callback("llama.cpp installed successfully with GPU support!")
                else:
                    progress_callback("llama.cpp installed successfully (CPU-only)!")
            return True

        # Fall back to building from source
        if progress_callback:
            progress_callback("Prebuilt not available, building from source...")

        if self.build_from_source():
            if progress_callback:
                progress_callback("llama.cpp built successfully!")
            # Assume built from source respects GPU setting
            self.binary_supports_gpu = self.gpu_available != "none"
            return True

        if progress_callback:
            progress_callback("Failed to install llama.cpp")
        return False

    def _find_file_in_dirs(self, file_name: str, min_size: int = 1000) -> Path | None:
        """
        Search for a file in Nunba's models dir, sibling dirs, and HuggingFace Hub cache.

        Search order:
          1. ~/.nunba/models/              (Nunba's own)
          2. ~/.trueflow/models/           (sibling project)
          3. ~/.ollama/models/             (Ollama)
          4. ~/.cache/huggingface/hub/     (HF Hub — models--org--repo/snapshots/hash/file)

        Args:
            file_name: File name to search for
            min_size: Minimum valid file size in bytes (detects corruption)

        Returns:
            Path to the file if found and valid, None otherwise
        """
        # Check Nunba's own models dir first
        local_path = self.models_dir / file_name
        if local_path.exists() and local_path.stat().st_size >= min_size:
            return local_path

        # Check sibling project model directories
        for sibling_dir in SIBLING_MODEL_DIRS:
            if not sibling_dir.exists():
                continue
            sibling_path = sibling_dir / file_name
            if sibling_path.exists() and sibling_path.stat().st_size >= min_size:
                logger.info(f"Found {file_name} in sibling project: {sibling_dir}")
                return sibling_path

        # Check HuggingFace Hub cache (models--org--repo/snapshots/hash/file)
        if _HF_CACHE_DIR.exists():
            try:
                for model_dir in _HF_CACHE_DIR.iterdir():
                    if not model_dir.name.startswith("models--"):
                        continue
                    snapshots_dir = model_dir / "snapshots"
                    if not snapshots_dir.exists():
                        continue
                    for snap_hash in snapshots_dir.iterdir():
                        candidate = snap_hash / file_name
                        if candidate.exists() and candidate.stat().st_size >= min_size:
                            logger.info(f"Found {file_name} in HuggingFace cache: {candidate}")
                            return candidate
            except (PermissionError, OSError) as e:
                logger.debug(f"HF cache scan skipped: {e}")

        return None

    def _find_mmproj_in_dirs(self, preset: ModelPreset) -> Path | None:
        """
        Search for mmproj file, handling model-specific naming variants.
        TrueFlow renames mmproj-F16.gguf to mmproj-{ModelName}-F16.gguf.

        Args:
            preset: Model preset to find mmproj for

        Returns:
            Path to mmproj file if found, None otherwise
        """
        if not preset.mmproj_file:
            return None

        # Search for preset.mmproj_file directly (already model-specific, e.g. mmproj-Qwen3.5-4B-F16.gguf)
        result = self._find_file_in_dirs(preset.mmproj_file)
        if result:
            return result

        # If preset uses a generic name (mmproj-F16.gguf), try model-specific variant
        if preset.mmproj_file == (preset.mmproj_source_file or preset.mmproj_file):
            base = preset.file_name.split("-Instruct")[0].split("-Thinking")[0].split("-UD-")[0]
            base = base.replace('.gguf', '')
            variant_name = preset.mmproj_file.replace("mmproj-", f"mmproj-{base}-")
            if variant_name != preset.mmproj_file:
                result = self._find_file_in_dirs(variant_name)
                if result:
                    logger.info(f"Found model-specific mmproj variant: {variant_name}")
                    return result

        return None

    def is_model_downloaded(self, preset: ModelPreset) -> bool:
        """Check if a model (and its mmproj if needed) is fully downloaded"""
        if not self._find_file_in_dirs(preset.file_name, min_size=100_000_000):
            return False

        # Check mmproj for vision models
        if preset.has_vision and preset.mmproj_file:
            if not self._find_mmproj_in_dirs(preset):
                return False

        return True

    def download_model(
        self,
        preset: ModelPreset,
        progress_callback: Callable[[int, int, str], None] | None = None
    ) -> bool:
        """
        Download a model from HuggingFace

        Args:
            preset: ModelPreset to download
            progress_callback: Optional callback(downloaded_mb, total_mb, status_message)

        Returns:
            True if successful, False otherwise
        """
        try:
            model_path = self.models_dir / preset.file_name

            # Download main model file
            if not model_path.exists():
                model_url = f"https://huggingface.co/{preset.repo_id}/resolve/main/{preset.file_name}"
                logger.info(f"Downloading model: {preset.display_name}")

                def model_progress(downloaded, total):
                    if progress_callback:
                        downloaded_mb = downloaded // (1024 * 1024)
                        total_mb = total // (1024 * 1024)
                        progress_callback(downloaded_mb, total_mb, f"Downloading model... {downloaded_mb}MB / {total_mb}MB")

                self.download_file_with_progress(model_url, model_path, model_progress)

            # Download mmproj for vision models
            if preset.has_vision and preset.mmproj_file:
                # mmproj_file = unique local name (e.g. mmproj-Qwen3.5-4B-F16.gguf)
                # mmproj_source_file = HF name (e.g. mmproj-F16.gguf)
                mmproj_path = self.models_dir / preset.mmproj_file
                if not mmproj_path.exists() and not self._find_mmproj_in_dirs(preset):
                    hf_name = preset.mmproj_source_file or preset.mmproj_file
                    mmproj_url = f"https://huggingface.co/{preset.repo_id}/resolve/main/{hf_name}"
                    logger.info(f"Downloading vision projector: {hf_name} -> {preset.mmproj_file}")

                    def mmproj_progress(downloaded, total):
                        if progress_callback:
                            downloaded_mb = downloaded // (1024 * 1024)
                            total_mb = total // (1024 * 1024)
                            progress_callback(downloaded_mb, total_mb, f"Downloading vision projector... {downloaded_mb}MB / {total_mb}MB")

                    self.download_file_with_progress(mmproj_url, mmproj_path, mmproj_progress)

            logger.info(f"Model downloaded successfully: {preset.display_name}")
            if progress_callback:
                progress_callback(preset.size_mb, preset.size_mb, "Download complete!")
            return True

        except Exception as e:
            logger.error(f"Model download failed: {e}")
            if progress_callback:
                progress_callback(0, 0, f"Download failed: {str(e)}")
            return False

    def get_model_path(self, preset: ModelPreset) -> str | None:
        """Get the full path to a downloaded model (searches Nunba + sibling dirs)"""
        result = self._find_file_in_dirs(preset.file_name, min_size=100_000_000)
        return str(result) if result else None

    def get_mmproj_path(self, preset: ModelPreset) -> str | None:
        """Get the full path to a downloaded mmproj file (searches Nunba + sibling dirs)"""
        if preset.has_vision and preset.mmproj_file:
            result = self._find_mmproj_in_dirs(preset)
            return str(result) if result else None
        return None


def install_on_first_run(
    default_model_index: int = 0,
    progress_callback: Callable[[str], None] | None = None
) -> tuple[bool, str | None]:
    """
    Automatically install llama.cpp and default model on first run

    Args:
        default_model_index: Index of model to download from MODEL_PRESETS (default: 0 = recommended)
        progress_callback: Optional callback to report progress

    Returns:
        Tuple of (success: bool, model_path: Optional[str])
    """
    installer = LlamaInstaller()

    # Install llama.cpp
    if not installer.install_llama_cpp(progress_callback):
        return False, None

    # Download default model
    if default_model_index < len(MODEL_PRESETS):
        preset = MODEL_PRESETS[default_model_index]

        if progress_callback:
            progress_callback(f"Downloading default model: {preset.display_name}")

        def download_progress(downloaded_mb, total_mb, status):
            if progress_callback:
                progress_callback(status)

        if installer.download_model(preset, download_progress):
            model_path = installer.get_model_path(preset)
            return True, model_path

    return False, None


if __name__ == "__main__":
    # Test installation
    logging.basicConfig(level=logging.INFO)

    def progress(msg):
        print(f"[Progress] {msg}")

    success, model_path = install_on_first_run(progress_callback=progress)
    if success:
        print(f"Installation successful! Model at: {model_path}")
    else:
        print("Installation failed")
