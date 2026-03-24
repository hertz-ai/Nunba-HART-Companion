"""
vibevoice_tts.py - VibeVoice TTS integration for Nunba

Provides GPU-accelerated text-to-speech using Microsoft's VibeVoice 1.5B model.
Supports expressive, multilingual speech synthesis with voice cloning.

VibeVoice: https://github.com/microsoft/VibeVoice
Model: https://huggingface.co/microsoft/VibeVoice-1.5B
"""
import logging
import shutil
import subprocess
import sys
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger('NunbaVibeVoiceTTS')

# VibeVoice voice presets - built-in speakers
VIBEVOICE_SPEAKERS = {
    # English speakers
    "emma": {"name": "Emma", "language": "en", "style": "conversational", "gender": "female"},
    "carter": {"name": "Carter", "language": "en", "style": "conversational", "gender": "male"},
    "alice": {"name": "Alice", "language": "en", "style": "narrative", "gender": "female"},
    "frank": {"name": "Frank", "language": "en", "style": "narrative", "gender": "male"},
    # Multilingual (VibeVoice-Realtime-0.5B experimental)
    "de_speaker": {"name": "German Speaker", "language": "de", "style": "standard", "gender": "neutral"},
    "fr_speaker": {"name": "French Speaker", "language": "fr", "style": "standard", "gender": "neutral"},
    "es_speaker": {"name": "Spanish Speaker", "language": "es", "style": "standard", "gender": "neutral"},
    "ja_speaker": {"name": "Japanese Speaker", "language": "ja", "style": "standard", "gender": "neutral"},
    "zh_speaker": {"name": "Chinese Speaker", "language": "zh", "style": "standard", "gender": "neutral"},
    "ko_speaker": {"name": "Korean Speaker", "language": "ko", "style": "standard", "gender": "neutral"},
}

DEFAULT_SPEAKER = "emma"

# Model variants
VIBEVOICE_MODELS = {
    "VibeVoice-1.5B": {
        "name": "VibeVoice 1.5B",
        "hf_path": "microsoft/VibeVoice-1.5B",
        "size_gb": 6.0,
        "vram_required_gb": 8,
        "features": ["multi-speaker", "long-form", "expressive", "voice-cloning"],
        "max_speakers": 4,
        "max_length_min": 90,
        "languages": ["en", "zh"],
    },
    "VibeVoice-Realtime-0.5B": {
        "name": "VibeVoice Realtime 0.5B",
        "hf_path": "microsoft/VibeVoice-Realtime-0.5B",
        "size_gb": 1.5,
        "vram_required_gb": 4,
        "features": ["realtime", "streaming", "low-latency"],
        "max_speakers": 1,
        "max_length_min": 30,
        "languages": ["en", "de", "fr", "es", "ja", "zh", "ko", "it", "nl", "pl", "pt"],
    },
}

DEFAULT_MODEL = "VibeVoice-Realtime-0.5B"  # Smaller, faster, multilingual


def _recommend_model(vram_gb: float) -> str | None:
    """Pick the best VibeVoice model variant for the available VRAM."""
    if vram_gb >= 8:
        return "VibeVoice-1.5B"
    if vram_gb >= 4:
        return "VibeVoice-Realtime-0.5B"
    return None


def _detect_nvidia() -> dict | None:
    """Detect NVIDIA GPU via nvidia-smi (no torch needed)."""
    nvidia_smi = shutil.which('nvidia-smi')
    if not nvidia_smi:
        return None
    try:
        _si, _cf = None, 0
        if sys.platform == 'win32':
            _si = subprocess.STARTUPINFO()
            _si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            _si.wShowWindow = 0
            _cf = subprocess.CREATE_NO_WINDOW
        proc = subprocess.run(
            [nvidia_smi, '--query-gpu=name,memory.total,driver_version',
             '--format=csv,noheader,nounits'],
            capture_output=True, text=True, timeout=5,
            startupinfo=_si, creationflags=_cf,
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            return None
        parts = [p.strip() for p in proc.stdout.strip().split('\n')[0].split(',')]
        if len(parts) < 2:
            return None
        vram = float(parts[1]) / 1024  # MiB → GiB
        return {
            "gpu_available": True,
            "gpu_name": parts[0],
            "vram_gb": vram,
            "gpu_vendor": "nvidia",
            "cuda_version": parts[2] if len(parts) > 2 else None,
            "recommended_model": _recommend_model(vram),
        }
    except Exception:
        return None


def _detect_amd() -> dict | None:
    """Detect AMD GPU via rocm-smi (ROCm stack)."""
    rocm_smi = shutil.which('rocm-smi')
    if not rocm_smi:
        return None
    try:
        _si, _cf = None, 0
        if sys.platform == 'win32':
            _si = subprocess.STARTUPINFO()
            _si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
            _si.wShowWindow = 0
            _cf = subprocess.CREATE_NO_WINDOW
        # Get GPU name
        proc_name = subprocess.run(
            [rocm_smi, '--showproductname'],
            capture_output=True, text=True, timeout=5,
            startupinfo=_si, creationflags=_cf,
        )
        # Get VRAM
        proc_mem = subprocess.run(
            [rocm_smi, '--showmeminfo', 'vram'],
            capture_output=True, text=True, timeout=5,
            startupinfo=_si, creationflags=_cf,
        )
        gpu_name = "AMD GPU"
        vram = 0.0
        if proc_name.returncode == 0:
            for line in proc_name.stdout.splitlines():
                if 'Card series' in line or 'GPU' in line:
                    gpu_name = line.split(':')[-1].strip() or gpu_name
                    break
        if proc_mem.returncode == 0:
            for line in proc_mem.stdout.splitlines():
                if 'Total' in line:
                    # rocm-smi reports in bytes or MB depending on version
                    parts = line.split()
                    for p in parts:
                        try:
                            val = float(p)
                            if val > 1024 * 1024:  # bytes
                                vram = val / (1024 ** 3)
                            elif val > 1024:  # MB
                                vram = val / 1024
                            else:  # already GB
                                vram = val
                            break
                        except ValueError:
                            continue
                    break
        if vram > 0:
            return {
                "gpu_available": True,
                "gpu_name": gpu_name,
                "vram_gb": vram,
                "gpu_vendor": "amd",
                "cuda_version": None,
                "recommended_model": _recommend_model(vram),
            }
    except Exception:
        pass
    return None


def _detect_gpu_wmic() -> dict | None:
    """Fallback: detect any GPU on Windows via PowerShell/WMI (includes Intel, AMD, NVIDIA)."""
    if sys.platform != 'win32':
        return None
    try:
        _si = subprocess.STARTUPINFO()
        _si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        _si.wShowWindow = 0
        proc = subprocess.run(
            ['powershell', '-NoProfile', '-Command',
             "Get-CimInstance Win32_VideoController | "
             "Select-Object -First 1 Name, AdapterRAM | "
             "ForEach-Object { $_.Name + '|' + $_.AdapterRAM }"],
            capture_output=True, text=True, timeout=10,
            startupinfo=_si, creationflags=subprocess.CREATE_NO_WINDOW,
        )
        if proc.returncode != 0 or not proc.stdout.strip():
            return None
        line = proc.stdout.strip().split('\n')[0]
        parts = line.split('|')
        gpu_name = parts[0].strip()
        vram = 0.0
        if len(parts) > 1 and parts[1].strip():
            try:
                vram = float(parts[1].strip()) / (1024 ** 3)  # bytes → GiB
            except ValueError:
                pass

        # Skip integrated GPUs with tiny VRAM (< 1 GB dedicated)
        if vram < 1.0:
            logger.info(f"GPU detected via WMI ({gpu_name}) but VRAM too low ({vram:.1f}GB)")
            return None

        vendor = "unknown"
        name_lower = gpu_name.lower()
        if 'nvidia' in name_lower or 'geforce' in name_lower or 'rtx' in name_lower or 'gtx' in name_lower:
            vendor = "nvidia"
        elif 'amd' in name_lower or 'radeon' in name_lower:
            vendor = "amd"
        elif 'intel' in name_lower or 'arc' in name_lower:
            vendor = "intel"

        return {
            "gpu_available": True,
            "gpu_name": gpu_name,
            "vram_gb": vram,
            "gpu_vendor": vendor,
            "cuda_version": None,
            "recommended_model": _recommend_model(vram),
        }
    except Exception:
        return None


def _detect_apple_metal() -> dict | None:
    """Detect Apple Silicon GPU via Metal/MPS (macOS only)."""
    if sys.platform != 'darwin':
        return None
    try:
        import subprocess
        # Get chip name (e.g., "Apple M1 Pro")
        proc = subprocess.run(
            ['sysctl', '-n', 'machdep.cpu.brand_string'],
            capture_output=True, text=True, timeout=5,
        )
        chip = proc.stdout.strip() if proc.returncode == 0 else 'Apple Silicon'
        # Get unified memory (Apple Silicon shares RAM as VRAM)
        proc_mem = subprocess.run(
            ['sysctl', '-n', 'hw.memsize'],
            capture_output=True, text=True, timeout=5,
        )
        total_ram_gb = 0.0
        if proc_mem.returncode == 0:
            total_ram_gb = float(proc_mem.stdout.strip()) / (1024 ** 3)
        # Apple Silicon uses ~75% of unified memory for GPU
        gpu_vram = total_ram_gb * 0.75 if total_ram_gb > 0 else 8.0
        return {
            "gpu_available": True,
            "gpu_name": chip,
            "vram_gb": gpu_vram,
            "gpu_vendor": "apple",
            "cuda_version": None,
            "recommended_model": _recommend_model(gpu_vram),
        }
    except Exception:
        return None


def detect_gpu() -> dict:
    """
    Detect GPU availability and VRAM without importing torch.

    Checks in order:
    1. NVIDIA via nvidia-smi
    2. AMD via rocm-smi
    3. Apple Metal (macOS)
    4. Any GPU via Windows WMI (PowerShell)

    Returns:
        Dict with gpu_available, gpu_name, vram_gb, gpu_vendor, cuda_version,
        recommended_model
    """
    result = {
        "gpu_available": False,
        "gpu_name": None,
        "vram_gb": 0,
        "gpu_vendor": None,
        "cuda_version": None,
        "recommended_model": None,
    }

    try:
        # 1. NVIDIA (most common for ML workloads)
        detected = _detect_nvidia()

        # 2. AMD ROCm
        if not detected:
            detected = _detect_amd()

        # 3. Apple Metal (macOS — unified memory GPU)
        if not detected:
            detected = _detect_apple_metal()

        # 4. Windows WMI fallback (Intel Arc, AMD without ROCm, etc.)
        if not detected:
            detected = _detect_gpu_wmic()

        if detected:
            result.update(detected)
            logger.info(
                f"GPU detected: {result['gpu_name']} ({result['gpu_vendor']}) "
                f"with {result['vram_gb']:.1f}GB VRAM"
            )
        else:
            logger.info("No compatible GPU detected")

    except Exception as e:
        logger.warning(f"GPU detection error: {e}")

    return result


class VibeVoiceTTS:
    """
    VibeVoice TTS engine for GPU-accelerated speech synthesis.

    Provides expressive, multilingual text-to-speech using Microsoft's
    VibeVoice models. Requires CUDA GPU with sufficient VRAM.
    """

    def __init__(self,
                 model_name: str = DEFAULT_MODEL,
                 models_dir: str | None = None,
                 cache_dir: str | None = None,
                 device: str = "cuda"):
        """
        Initialize VibeVoice TTS.

        Args:
            model_name: Model variant to use
            models_dir: Directory to store models
            cache_dir: Directory for generated audio cache
            device: Device to use ('cuda' or 'cpu')
        """
        home = Path.home()
        self.models_dir = Path(models_dir) if models_dir else home / ".nunba" / "vibevoice" / "models"
        self.cache_dir = Path(cache_dir) if cache_dir else home / ".nunba" / "vibevoice" / "cache"
        self.models_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self.model_name = model_name
        self.device = device
        self.current_speaker = DEFAULT_SPEAKER
        self._model = None
        self._tokenizer = None
        self._loaded = False
        self._loading = False

        # GPU info
        self.gpu_info = detect_gpu()

    def is_available(self) -> bool:
        """Check if VibeVoice is available (GPU + dependencies)"""
        if not self.gpu_info["gpu_available"]:
            return False

        # Check if we have enough VRAM
        model_info = VIBEVOICE_MODELS.get(self.model_name, {})
        required_vram = model_info.get("vram_required_gb", 4)
        if self.gpu_info["vram_gb"] < required_vram:
            logger.warning(f"Insufficient VRAM: {self.gpu_info['vram_gb']:.1f}GB < {required_vram}GB required")
            return False

        # Check for vibevoice package
        try:
            import vibevoice
            return True
        except ImportError:
            logger.warning("vibevoice package not installed")
            return False

    def is_model_downloaded(self) -> bool:
        """Check if the model is downloaded locally"""
        model_path = self.models_dir / self.model_name
        return model_path.exists() and any(model_path.iterdir())

    def download_model(self,
                       progress_callback: Callable[[str, float], None] | None = None) -> bool:
        """
        Download the VibeVoice model from HuggingFace.

        Args:
            progress_callback: Optional callback(status, progress_percent)

        Returns:
            True if successful
        """
        model_info = VIBEVOICE_MODELS.get(self.model_name)
        if not model_info:
            logger.error(f"Unknown model: {self.model_name}")
            return False

        try:
            from huggingface_hub import snapshot_download

            if progress_callback:
                progress_callback(f"Downloading {model_info['name']}...", 0)

            logger.info(f"Downloading {self.model_name} from HuggingFace...")

            model_path = snapshot_download(
                repo_id=model_info["hf_path"],
                local_dir=self.models_dir / self.model_name,
                local_dir_use_symlinks=False,
            )

            if progress_callback:
                progress_callback("Download complete", 100)

            logger.info(f"Model downloaded to: {model_path}")
            return True

        except ImportError:
            logger.error("huggingface_hub not installed. Run: pip install huggingface_hub")
            return False
        except Exception as e:
            logger.error(f"Model download failed: {e}")
            return False

    def load_model(self) -> bool:
        """
        Load the VibeVoice model into GPU memory.

        Returns:
            True if successful
        """
        if self._loaded:
            return True

        if self._loading:
            logger.warning("Model is already loading")
            return False

        self._loading = True

        try:
            import torch
            from vibevoice import VibeVoiceModel

            model_path = self.models_dir / self.model_name

            if not model_path.exists():
                logger.error(f"Model not found at {model_path}. Run download_model() first.")
                return False

            logger.info(f"Loading {self.model_name} on {self.device}...")

            self._model = VibeVoiceModel.from_pretrained(
                str(model_path),
                device=self.device,
                torch_dtype=torch.bfloat16 if self.device == "cuda" else torch.float32,
            )

            self._loaded = True
            logger.info("VibeVoice model loaded successfully")
            return True

        except ImportError as e:
            logger.error(f"Missing dependency: {e}")
            return False
        except Exception as e:
            logger.error(f"Failed to load model: {e}")
            return False
        finally:
            self._loading = False

    def unload_model(self):
        """Unload model from GPU memory"""
        if self._model is not None:
            del self._model
            self._model = None
            self._loaded = False

            # Clear GPU cache
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
                elif hasattr(torch.backends, 'mps') and torch.backends.mps.is_available():
                    torch.mps.empty_cache()
            except Exception:
                pass

            logger.info("VibeVoice model unloaded")

    def list_speakers(self) -> dict[str, dict]:
        """List available speaker presets"""
        model_info = VIBEVOICE_MODELS.get(self.model_name, {})
        supported_languages = model_info.get("languages", ["en"])

        # Filter speakers by supported languages
        return {
            k: v for k, v in VIBEVOICE_SPEAKERS.items()
            if v["language"] in supported_languages
        }

    def set_speaker(self, speaker_id: str) -> bool:
        """Set the current speaker"""
        available = self.list_speakers()
        if speaker_id not in available:
            logger.error(f"Unknown speaker: {speaker_id}")
            return False
        self.current_speaker = speaker_id
        return True

    def synthesize(self,
                   text: str,
                   output_path: str | None = None,
                   speaker: str | None = None,
                   speed: float = 1.0,
                   emotion: str | None = None) -> str | None:
        """
        Synthesize text to speech.

        Args:
            text: Text to synthesize
            output_path: Output WAV file path (auto-generated if None)
            speaker: Speaker ID (uses current speaker if None)
            speed: Speech speed multiplier (0.5-2.0)
            emotion: Optional emotion/style hint

        Returns:
            Path to generated audio file, or None on error
        """
        if not text or not text.strip():
            logger.warning("Empty text provided")
            return None

        speaker = speaker or self.current_speaker

        # Ensure model is loaded
        if not self._loaded:
            if not self.load_model():
                logger.error("Failed to load model")
                return None

        # Generate output path if not provided
        if output_path is None:
            import hashlib
            text_hash = hashlib.md5(f"{text}_{speaker}_{speed}".encode()).hexdigest()[:12]
            output_path = str(self.cache_dir / f"vibevoice_{text_hash}.wav")

        try:
            logger.debug(f"Synthesizing: '{text[:50]}...' with speaker {speaker}")

            # Prepare synthesis parameters
            synthesis_params = {
                "text": text.strip(),
                "speaker_name": speaker.capitalize(),  # VibeVoice uses capitalized names
                "speed": max(0.5, min(2.0, speed)),
            }

            # Generate audio
            audio = self._model.synthesize(**synthesis_params)

            # Save to file
            import soundfile as sf
            sf.write(output_path, audio, samplerate=24000)

            logger.info(f"Audio saved to: {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"Synthesis failed: {e}")
            return None

    def synthesize_streaming(self,
                             text: str,
                             speaker: str | None = None,
                             speed: float = 1.0):
        """
        Synthesize text with streaming output (for real-time playback).

        Args:
            text: Text to synthesize
            speaker: Speaker ID
            speed: Speech speed

        Yields:
            Audio chunks as numpy arrays
        """
        if not self._loaded:
            if not self.load_model():
                return

        speaker = speaker or self.current_speaker

        try:
            for chunk in self._model.synthesize_streaming(
                text=text.strip(),
                speaker_name=speaker.capitalize(),
                speed=speed
            ):
                yield chunk
        except Exception as e:
            logger.error(f"Streaming synthesis failed: {e}")

    def clone_voice(self,
                    audio_path: str,
                    speaker_name: str,
                    min_seconds: int = 10) -> bool:
        """
        Clone a voice from audio sample.

        Args:
            audio_path: Path to reference audio (10-60 seconds recommended)
            speaker_name: Name for the cloned voice
            min_seconds: Minimum audio length required

        Returns:
            True if cloning succeeded
        """
        if not self._loaded:
            if not self.load_model():
                return False

        model_info = VIBEVOICE_MODELS.get(self.model_name, {})
        if "voice-cloning" not in model_info.get("features", []):
            logger.error(f"Model {self.model_name} does not support voice cloning")
            return False

        try:
            # Verify audio file
            import soundfile as sf
            audio, sr = sf.read(audio_path)
            duration = len(audio) / sr

            if duration < min_seconds:
                logger.error(f"Audio too short: {duration:.1f}s < {min_seconds}s minimum")
                return False

            # Extract voice embedding
            embedding = self._model.extract_speaker_embedding(audio_path)

            # Save embedding
            embedding_path = self.models_dir / "custom_speakers" / f"{speaker_name}.pt"
            embedding_path.parent.mkdir(parents=True, exist_ok=True)

            import torch
            torch.save(embedding, embedding_path)

            # Add to speakers dict
            VIBEVOICE_SPEAKERS[speaker_name] = {
                "name": speaker_name,
                "language": "en",  # Assume English for cloned voices
                "style": "cloned",
                "gender": "neutral",
                "embedding_path": str(embedding_path),
            }

            logger.info(f"Voice cloned successfully: {speaker_name}")
            return True

        except Exception as e:
            logger.error(f"Voice cloning failed: {e}")
            return False


# Global instance
_vibevoice_instance: VibeVoiceTTS | None = None


def get_vibevoice_tts(model_name: str = DEFAULT_MODEL) -> VibeVoiceTTS:
    """Get or create global VibeVoice TTS instance"""
    global _vibevoice_instance
    if _vibevoice_instance is None or _vibevoice_instance.model_name != model_name:
        _vibevoice_instance = VibeVoiceTTS(model_name=model_name)
    return _vibevoice_instance


def synthesize_with_vibevoice(text: str,
                              speaker: str = DEFAULT_SPEAKER,
                              speed: float = 1.0,
                              output_path: str | None = None) -> str | None:
    """
    Convenience function to synthesize text using VibeVoice.

    Args:
        text: Text to synthesize
        speaker: Speaker preset
        speed: Speech speed
        output_path: Output file path

    Returns:
        Path to audio file or None
    """
    tts = get_vibevoice_tts()
    if not tts.is_available():
        logger.warning("VibeVoice not available, GPU required")
        return None
    return tts.synthesize(text, output_path, speaker, speed)
