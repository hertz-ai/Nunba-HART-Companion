"""
ai_installer.py - Unified AI Components Installer for Nunba

Handles installation of all AI components during setup:
- Llama.cpp binary (for local LLM inference)
- LLM model (default: Qwen3.5-4B VL for vision+text)
- Piper TTS voice (for CPU text-to-speech)
- VibeVoice model (optional, for GPU text-to-speech)

Cross-platform support: Windows, macOS, Linux
"""
import argparse
import logging
import platform
import sys
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger('NunbaAIInstaller')

# Platform detection
IS_WINDOWS = sys.platform == 'win32'
IS_MACOS = sys.platform == 'darwin'
IS_LINUX = sys.platform.startswith('linux')


def get_platform_name() -> str:
    """Get human-readable platform name"""
    if IS_WINDOWS:
        return "Windows"
    elif IS_MACOS:
        return f"macOS ({platform.machine()})"
    elif IS_LINUX:
        return f"Linux ({platform.machine()})"
    return platform.system()


def detect_gpu() -> dict:
    """
    Detect GPU availability and type.

    Returns:
        Dict with:
        - available: bool
        - type: 'cuda', 'metal', or 'none'
        - name: GPU name if available
        - vram_gb: VRAM in GB (for CUDA)
    """
    result = {
        "available": False,
        "type": "none",
        "name": None,
        "vram_gb": 0
    }

    # macOS - Metal is always available on Apple Silicon and modern Intel Macs
    if IS_MACOS:
        # Check for Apple Silicon
        if platform.machine() == "arm64":
            result["available"] = True
            result["type"] = "metal"
            result["name"] = "Apple Silicon (Metal)"
            return result
        # Intel Macs with Metal
        try:
            import subprocess
            check = subprocess.run(
                ["system_profiler", "SPDisplaysDataType"],
                capture_output=True, text=True, timeout=5
            )
            if "Metal" in check.stdout:
                result["available"] = True
                result["type"] = "metal"
                result["name"] = "Intel Mac (Metal)"
        except Exception:
            pass
        return result

    # Windows/Linux - Check for CUDA
    try:
        import subprocess
        si = None
        cf = 0
        if IS_WINDOWS:
            si = subprocess.STARTUPINFO()
            si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            si.wShowWindow = 0
            cf = subprocess.CREATE_NO_WINDOW

        check = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader"],
            capture_output=True, text=True, timeout=5,
            startupinfo=si, creationflags=cf
        )

        if check.returncode == 0 and check.stdout.strip():
            parts = check.stdout.strip().split(",")
            result["available"] = True
            result["type"] = "cuda"
            result["name"] = parts[0].strip()
            if len(parts) > 1:
                # Parse VRAM (e.g., "8192 MiB")
                vram_str = parts[1].strip()
                if "MiB" in vram_str:
                    result["vram_gb"] = int(vram_str.replace("MiB", "").strip()) / 1024
                elif "GiB" in vram_str:
                    result["vram_gb"] = float(vram_str.replace("GiB", "").strip())
    except Exception as e:
        logger.debug(f"CUDA detection failed: {e}")

    return result


class AIInstaller:
    """
    Unified installer for all Nunba AI components.

    Handles:
    - Llama.cpp binary installation
    - LLM model downloading
    - TTS voice/model installation
    """

    def __init__(self,
                 base_dir: str | None = None,
                 progress_callback: Callable[[str, int], None] | None = None):
        """
        Initialize AI installer.

        Args:
            base_dir: Base directory for AI components (default: ~/.nunba)
            progress_callback: Optional callback(status_message, percent_complete)
        """
        self.base_dir = Path(base_dir) if base_dir else Path.home() / ".nunba"
        self.base_dir.mkdir(parents=True, exist_ok=True)

        self.progress_callback = progress_callback
        self.gpu_info = detect_gpu()

        # Component directories
        self.llama_dir = self.base_dir / "llama.cpp"
        self.models_dir = self.base_dir / "models"
        self.tts_dir = self.base_dir / "tts"
        self.piper_dir = self.tts_dir / "piper"
        self.vibevoice_dir = self.tts_dir / "vibevoice"
        self.tts_models_dir = self.base_dir / "models" / "tts"

    def _report_progress(self, message: str, percent: int = 0):
        """Report progress to callback and logger"""
        logger.info(f"[{percent}%] {message}")
        if self.progress_callback:
            self.progress_callback(message, percent)
        else:
            print(f"  [{percent:3d}%] {message}")

    def install_llama(self,
                      force_reinstall: bool = False,
                      skip_model: bool = False) -> tuple[bool, str]:
        """
        Install llama.cpp binary and default model.

        Args:
            force_reinstall: Force reinstall even if already present
            skip_model: Skip model download (binary only)

        Returns:
            Tuple of (success, message)
        """
        try:
            from llama_config import initialize_llama_on_first_run
            from llama_installer import MODEL_PRESETS, LlamaInstaller

            self._report_progress("Checking llama.cpp installation...", 5)

            installer = LlamaInstaller(
                install_dir=str(self.llama_dir),
                models_dir=str(self.models_dir)
            )

            # Check if already installed
            existing = installer.find_llama_server()
            if existing and not force_reinstall:
                self._report_progress(f"Llama.cpp already installed: {existing}", 10)
            else:
                self._report_progress("Downloading llama.cpp binary...", 15)

                def download_progress(downloaded, total):
                    if total > 0:
                        pct = 15 + int((downloaded / total) * 25)
                        self._report_progress(
                            f"Downloading llama.cpp: {downloaded/1024/1024:.1f}MB / {total/1024/1024:.1f}MB",
                            pct
                        )

                success = installer.download_and_install(download_progress)
                if not success:
                    return False, "Failed to install llama.cpp binary"

                self._report_progress("Llama.cpp binary installed", 40)

            # Download model
            if not skip_model:
                self._report_progress("Checking LLM model...", 45)

                # Use recommended model (vision+text)
                default_model = MODEL_PRESETS[0]  # Qwen3.5-4B VL (Recommended)
                model_path = self.models_dir / default_model.file_name

                if model_path.exists() and not force_reinstall:
                    self._report_progress(f"Model already exists: {default_model.display_name}", 50)
                else:
                    self._report_progress(f"Downloading model: {default_model.display_name}...", 50)

                    def model_progress(downloaded, total):
                        if total > 0:
                            pct = 50 + int((downloaded / total) * 30)
                            self._report_progress(
                                f"Downloading model: {downloaded/1024/1024:.1f}MB / {total/1024/1024:.1f}MB",
                                pct
                            )

                    success = installer.download_model(
                        default_model.repo_id,
                        default_model.file_name,
                        model_progress
                    )

                    if not success:
                        return False, f"Failed to download model: {default_model.display_name}"

                    # Download vision projector if needed
                    if default_model.has_vision and default_model.mmproj_file:
                        self._report_progress("Downloading vision projector...", 82)
                        success = installer.download_model(
                            default_model.repo_id,
                            default_model.mmproj_file
                        )
                        if not success:
                            logger.warning("Vision projector download failed (vision may not work)")

            self._report_progress("Llama.cpp installation complete", 85)
            return True, "Llama.cpp and model installed successfully"

        except ImportError as e:
            return False, f"Llama installer module not available: {e}"
        except Exception as e:
            logger.error(f"Llama installation failed: {e}")
            return False, str(e)

    def install_tts(self,
                    force_reinstall: bool = False,
                    include_vibevoice: bool = None) -> tuple[bool, str]:
        """
        Install TTS components — pip packages + model weights for this hardware tier.
        Nothing should need downloading after installation.

        Hardware tiers:
          Potato (no GPU):  Piper voice (CPU ONNX, ~20MB)
          Medium (4-8GB):   Indic Parler + Chatterbox Turbo + CosyVoice3
          High-end (16+GB): Same as medium (all engines fit comfortably)

        Installs BOTH pip packages (into python-embed) AND model weights.
        """
        results = []
        self.tts_models_dir.mkdir(parents=True, exist_ok=True)

        has_gpu = self.gpu_info.get("available", False)
        vram = self.gpu_info.get("vram_gb", 0)

        # Step 0: Upgrade to CUDA torch if GPU available but torch is CPU-only
        if has_gpu:
            try:
                from tts.package_installer import install_cuda_torch
                self._report_progress("Checking PyTorch CUDA support...", 85)
                cuda_ok, cuda_msg = install_cuda_torch(
                    progress_cb=lambda msg: self._report_progress(msg, 85))
                results.append(("CUDA PyTorch", cuda_ok, cuda_msg))
            except Exception as e:
                logger.warning(f"CUDA torch check skipped: {e}")

        # 1. Piper voice — always pre-download (CPU fallback, ~20MB)
        self._report_progress("Setting up Piper TTS voice (CPU fallback)...", 86)
        p_ok, p_msg = self._install_piper_voice(force_reinstall)
        results.append(("Piper TTS", p_ok, p_msg))

        # 2. Indic Parler TTS — pip packages + model weights (works on CPU too)
        self._report_progress("Setting up Indic Parler TTS (21 languages)...", 87)
        ip_ok, ip_msg = self._install_backend_full('indic_parler', force_reinstall, 87)
        results.append(("Indic Parler TTS", ip_ok, ip_msg))

        # 3. Chatterbox Turbo — English with [laugh]/[chuckle], needs 6GB VRAM
        if has_gpu and vram >= 6:
            self._report_progress("Setting up Chatterbox Turbo (English)...", 90)
            cb_ok, cb_msg = self._install_backend_full('chatterbox_turbo', force_reinstall, 90)
            results.append(("Chatterbox Turbo", cb_ok, cb_msg))

        # 4. CosyVoice3 — 9 international languages, needs 4GB VRAM
        if has_gpu and vram >= 4:
            self._report_progress("Setting up CosyVoice3 (international)...", 93)
            cv_ok, cv_msg = self._install_backend_full('cosyvoice3', force_reinstall, 93)
            results.append(("CosyVoice3", cv_ok, cv_msg))

        # F5-TTS skipped — voice cloning is niche, downloads lazily on first use

        all_success = all(r[1] for r in results)
        messages = [f"{r[0]}: {r[2]}" for r in results]
        return all_success, "; ".join(messages)

    def _install_backend_full(self, backend: str, force_reinstall: bool,
                               percent: int) -> tuple[bool, str]:
        """Install pip packages + model weights for a TTS backend."""
        try:
            from tts.package_installer import install_backend_full
            ok, msg = install_backend_full(
                backend,
                progress_cb=lambda m: self._report_progress(m, percent),
            )
            return ok, msg
        except Exception as e:
            logger.warning(f"Backend {backend} full install failed: {e}")
            # Fall back to model-weights-only install
            return self._install_model_weights_only(backend, force_reinstall)

    def _install_model_weights_only(self, backend: str,
                                     force_reinstall: bool = False) -> tuple[bool, str]:
        """Fallback: download model weights only (when package_installer unavailable)."""
        try:
            from tts.package_installer import _download_model_weights
            return _download_model_weights(
                backend,
                progress_cb=lambda m: self._report_progress(m, 90),
            )
        except Exception as e:
            logger.warning(f"Model weight download failed for {backend}: {e}")
            return True, f"Will download on first use ({e})"

    def _install_piper_voice(self, force_reinstall: bool = False) -> tuple[bool, str]:
        """Pre-download default Piper voice (CPU fallback, ~20MB)."""
        try:
            from tts.piper_tts import DEFAULT_VOICE, PiperTTS
            tts = PiperTTS()
            if tts.is_voice_installed(DEFAULT_VOICE) and not force_reinstall:
                return True, "Already downloaded"
            self._report_progress(f"Downloading Piper voice: {DEFAULT_VOICE}...", 86)
            ok = tts.download_voice(DEFAULT_VOICE)
            return ok, "Voice downloaded" if ok else "Download failed (will retry on first use)"
        except Exception as e:
            logger.warning(f"Piper voice pre-download failed: {e}")
            return True, f"Will download on first use ({e})"


    def install_all(self,
                    skip_llama: bool = False,
                    skip_tts: bool = False,
                    skip_vibevoice: bool = False,
                    force_reinstall: bool = False,
                    skip_endpoint_scan: bool = False) -> tuple[bool, dict]:
        """
        Install all AI components — auto-downloads models based on hardware.

        LLM: Scans for existing endpoints first, then installs llama.cpp + model.
        TTS: Installs Indic Parler (all), Chatterbox/CosyVoice3/F5 (if GPU fits).
        STT: Pre-downloads faster-whisper model (CTranslate2, auto-selects by hardware).

        Args:
            skip_llama: Skip llama.cpp installation
            skip_tts: Skip TTS installation
            skip_vibevoice: Ignored (kept for backward compatibility)
            force_reinstall: Force reinstall all components
            skip_endpoint_scan: Skip scanning for existing endpoints

        Returns:
            Tuple of (overall_success, results_dict)
        """
        self._report_progress(f"Starting AI components installation on {get_platform_name()}", 0)
        self._report_progress(f"GPU: {self.gpu_info['name'] or 'Not detected'}", 2)

        results = {
            "platform": get_platform_name(),
            "gpu": self.gpu_info,
            "components": {},
            "external_llm": None
        }

        # First, scan for existing LLM endpoints (unless skipped or force_reinstall)
        if not skip_llama and not force_reinstall and not skip_endpoint_scan:
            self._report_progress("Scanning for existing AI endpoints...", 5)
            try:
                from llama_config import LlamaConfig, scan_existing_llm_endpoints, scan_openai_compatible_ports

                existing = scan_existing_llm_endpoints()
                if not existing:
                    existing = scan_openai_compatible_ports()

                if existing:
                    self._report_progress(f"Found existing AI: {existing['name']}", 10)
                    results["external_llm"] = existing
                    results["components"]["llama"] = {
                        "success": True,
                        "message": f"Using existing LLM: {existing['name']} at {existing['base_url']}",
                        "skipped": True
                    }

                    # Save to config
                    config = LlamaConfig()
                    config.config["external_llm_endpoint"] = existing
                    config.config["use_external_llm"] = True
                    config._save_config()

                    skip_llama = True  # Skip llama installation
                    self._report_progress(f"Will use {existing['name']} for AI chat", 45)
            except Exception as e:
                logger.debug(f"Endpoint scan failed: {e}")
                # Continue with normal installation

        # Install llama.cpp (if no existing endpoint found)
        if not skip_llama:
            success, msg = self.install_llama(force_reinstall)
            results["components"]["llama"] = {"success": success, "message": msg}

        # Install TTS engines (auto-selects based on hardware)
        if not skip_tts:
            success, msg = self.install_tts(force_reinstall)
            results["components"]["tts"] = {"success": success, "message": msg}

        # Pre-warm STT model (faster-whisper base, CPU int8)
        self._report_progress("Checking STT (faster-whisper)...", 90)
        try:
            from integrations.service_tools.whisper_tool import _get_faster_whisper_model
            self._report_progress("Pre-downloading STT model: base", 92)
            _get_faster_whisper_model("base")
            results["components"]["stt"] = {
                "success": True,
                "message": "faster-whisper base ready",
            }
        except ImportError:
            self._report_progress("faster-whisper not installed — STT will use fallback", 95)
            results["components"]["stt"] = {
                "success": True,
                "message": "STT: faster-whisper not installed, will use fallback on first use",
            }
        except Exception as e:
            logger.warning(f"STT pre-download failed (will auto-download on first use): {e}")
            results["components"]["stt"] = {
                "success": True,
                "message": f"STT model will auto-download on first use ({e})",
            }

        self._report_progress("AI components installation complete!", 100)

        # Overall success
        overall = all(
            c.get("success", True)
            for c in results["components"].values()
        )

        return overall, results

    def get_status(self) -> dict:
        """
        Get status of all AI components.

        Returns:
            Dict with component statuses
        """
        status = {
            "platform": get_platform_name(),
            "gpu": self.gpu_info,
            "components": {
                "llama": {"installed": False, "path": None, "model": None},
                "tts": {"installed": False, "engines": [], "languages": 0},
                "stt": {"installed": False, "engine": None},
            }
        }

        # Check llama.cpp
        try:
            from llama_installer import LlamaInstaller
            installer = LlamaInstaller(str(self.llama_dir), str(self.models_dir))
            server = installer.find_llama_server()
            if server:
                status["components"]["llama"]["installed"] = True
                status["components"]["llama"]["path"] = server
                if self.models_dir.exists():
                    models = list(self.models_dir.glob("*.gguf"))
                    if models:
                        status["components"]["llama"]["model"] = models[0].name
        except Exception as e:
            logger.debug(f"Llama status check failed: {e}")

        # Check TTS engines
        try:
            from tts.tts_engine import ENGINE_CAPABILITIES
            engines = []
            all_langs = set()
            for backend, cap in ENGINE_CAPABILITIES.items():
                engines.append({
                    "name": cap["name"],
                    "languages": len(cap.get("languages", set())),
                    "vram_gb": cap.get("vram_gb", 0),
                })
                all_langs.update(cap.get("languages", set()))
            status["components"]["tts"]["installed"] = True
            status["components"]["tts"]["engines"] = engines
            status["components"]["tts"]["languages"] = len(all_langs)
        except Exception as e:
            logger.debug(f"TTS status check failed: {e}")

        # Check STT (faster-whisper)
        try:
            import faster_whisper  # noqa: F401
            status["components"]["stt"]["installed"] = True
            status["components"]["stt"]["engine"] = "faster-whisper"
        except ImportError:
            try:
                import sherpa_onnx  # noqa: F401
                status["components"]["stt"]["installed"] = True
                status["components"]["stt"]["engine"] = "sherpa-onnx"
            except ImportError:
                pass

        return status


def install_ai_components(progress_callback: Callable | None = None,
                          skip_vibevoice: bool = False) -> bool:
    """
    Convenience function to install all AI components.

    Args:
        progress_callback: Optional progress callback(message, percent)
        skip_vibevoice: Skip VibeVoice installation

    Returns:
        True if all components installed successfully
    """
    installer = AIInstaller(progress_callback=progress_callback)
    success, results = installer.install_all(skip_vibevoice=skip_vibevoice)
    return success


def main():
    """Command-line interface for AI installer"""
    parser = argparse.ArgumentParser(
        description="Nunba AI Components Installer",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python ai_installer.py              Install all AI components
  python ai_installer.py --status     Show installation status
  python ai_installer.py --llama-only Install only llama.cpp + model
  python ai_installer.py --tts-only   Install only TTS components
  python ai_installer.py --force      Force reinstall all components
"""
    )

    parser.add_argument("--status", action="store_true",
                        help="Show installation status and exit")
    parser.add_argument("--llama-only", action="store_true",
                        help="Install only llama.cpp and model")
    parser.add_argument("--tts-only", action="store_true",
                        help="Install only TTS components")
    parser.add_argument("--skip-vibevoice", action="store_true",
                        help="Skip VibeVoice (GPU TTS) installation")
    parser.add_argument("--skip-model", action="store_true",
                        help="Skip LLM model download (binary only)")
    parser.add_argument("--force", action="store_true",
                        help="Force reinstall even if already installed")
    parser.add_argument("--quiet", action="store_true",
                        help="Minimal output")

    args = parser.parse_args()

    # Setup logging
    if not args.quiet:
        logging.basicConfig(
            level=logging.INFO,
            format="%(message)s"
        )

    installer = AIInstaller()

    # Status check
    if args.status:
        print("\n" + "=" * 60)
        print("  Nunba AI Components Status")
        print("=" * 60)

        status = installer.get_status()
        print(f"\n  Platform: {status['platform']}")
        print(f"  GPU: {status['gpu']['name'] or 'Not detected'}")

        print("\n  Components:")
        for name, info in status["components"].items():
            installed = "YES" if info["installed"] else "NO"
            details = ""
            if info.get("path"):
                details = f" ({info['path']})"
            elif info.get("voice"):
                details = f" ({info['voice']})"
            elif info.get("model"):
                details = f" ({info['model']})"
            print(f"    - {name}: {installed}{details}")

        print("\n" + "=" * 60)
        return 0

    # Installation
    print("\n" + "=" * 60)
    print("  Nunba AI Components Installer")
    print("  Cross-platform AI setup for offline capabilities")
    print("=" * 60 + "\n")

    skip_llama = args.tts_only
    skip_tts = args.llama_only

    success, results = installer.install_all(
        skip_llama=skip_llama,
        skip_tts=skip_tts,
        skip_vibevoice=args.skip_vibevoice,
        force_reinstall=args.force
    )

    # Print results
    print("\n" + "=" * 60)
    if success:
        print("  Installation Complete!")
    else:
        print("  Installation completed with some issues")
    print("=" * 60)

    for component, info in results.get("components", {}).items():
        status = "OK" if info["success"] else "FAILED"
        print(f"  {component}: {status} - {info['message']}")

    print("=" * 60 + "\n")

    return 0 if success else 1


if __name__ == "__main__":
    sys.exit(main())
