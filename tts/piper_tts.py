"""
piper_tts.py - Piper TTS integration for Nunba

Provides local, CPU-based text-to-speech using Piper TTS.
Converts text responses to audio without requiring GPU or internet.

Piper TTS: https://github.com/rhasspy/piper
"""
import hashlib
import logging
import os
import queue
import subprocess
import sys
import tempfile
import threading
import urllib.request
import wave
from collections.abc import Callable
from pathlib import Path

logger = logging.getLogger('NunbaPiperTTS')

# Voice presets - common Piper voices
VOICE_PRESETS = {
    "en_US-amy-medium": {
        "name": "Amy (US English)",
        "language": "en_US",
        "quality": "medium",
        "sample_rate": 22050,
        "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx",
        "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json",
        "size_mb": 63
    },
    "en_US-lessac-medium": {
        "name": "Lessac (US English)",
        "language": "en_US",
        "quality": "medium",
        "sample_rate": 22050,
        "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx",
        "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/lessac/medium/en_US-lessac-medium.onnx.json",
        "size_mb": 63
    },
    "en_GB-alan-medium": {
        "name": "Alan (British English)",
        "language": "en_GB",
        "quality": "medium",
        "sample_rate": 22050,
        "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx",
        "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_GB/alan/medium/en_GB-alan-medium.onnx.json",
        "size_mb": 63
    },
    "en_US-libritts-high": {
        "name": "LibriTTS (US English, High Quality)",
        "language": "en_US",
        "quality": "high",
        "sample_rate": 22050,
        "url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts/high/en_US-libritts-high.onnx",
        "config_url": "https://huggingface.co/rhasspy/piper-voices/resolve/main/en/en_US/libritts/high/en_US-libritts-high.onnx.json",
        "size_mb": 75
    }
}

DEFAULT_VOICE = "en_US-amy-medium"


class PiperTTS:
    """
    Piper TTS engine for local text-to-speech synthesis.

    Uses piper-tts Python library or piper executable for synthesis.
    Runs entirely on CPU, no GPU required.
    """

    def __init__(self,
                 voices_dir: str | None = None,
                 cache_dir: str | None = None,
                 default_voice: str = DEFAULT_VOICE):
        """
        Initialize Piper TTS.

        Args:
            voices_dir: Directory to store voice models
            cache_dir: Directory to cache generated audio
            default_voice: Default voice preset to use
        """
        home = Path.home()
        self.voices_dir = Path(voices_dir) if voices_dir else home / ".nunba" / "piper" / "voices"
        self.cache_dir = Path(cache_dir) if cache_dir else home / ".nunba" / "piper" / "cache"
        self.voices_dir.mkdir(parents=True, exist_ok=True)
        self.cache_dir.mkdir(parents=True, exist_ok=True)

        self.default_voice = default_voice
        self.current_voice = default_voice
        self._piper_module = None
        self._synthesis_queue = queue.Queue()
        self._worker_thread = None
        self._running = False

        # Try to import piper-tts
        self._init_piper()

    def _init_piper(self):
        """Initialize piper-tts module"""
        try:
            import piper
            self._piper_module = piper
            logger.info("Piper TTS module loaded successfully")
        except ImportError:
            logger.warning("piper-tts not installed. Run: pip install piper-tts")
            self._piper_module = None

    def is_available(self) -> bool:
        """Check if Piper TTS is available"""
        return self._piper_module is not None or self._find_piper_executable() is not None

    def _find_piper_executable(self) -> str | None:
        """Find piper executable in system"""
        # Check common locations
        exe_name = "piper.exe" if sys.platform == "win32" else "piper"

        search_paths = [
            self.voices_dir.parent / exe_name,
            Path.home() / ".local" / "bin" / exe_name,
            Path("/usr/local/bin") / exe_name,
            Path("/usr/bin") / exe_name,
        ]

        for path in search_paths:
            if path.exists():
                return str(path)

        # Check PATH
        try:
            cmd = "where" if sys.platform == "win32" else "which"
            # Use Windows-specific flags to hide console window
            si = None
            cf = 0
            if sys.platform == "win32":
                si = subprocess.STARTUPINFO()
                si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                si.wShowWindow = 0
                cf = subprocess.CREATE_NO_WINDOW
            result = subprocess.run(
                [cmd, "piper"],
                capture_output=True,
                text=True,
                startupinfo=si,
                creationflags=cf
            )
            if result.returncode == 0:
                return result.stdout.strip().split('\n')[0]
        except Exception:
            pass

        return None

    def get_voice_path(self, voice_id: str) -> tuple[Path | None, Path | None]:
        """
        Get paths to voice model and config files.

        Returns:
            Tuple of (model_path, config_path) or (None, None) if not found
        """
        model_path = self.voices_dir / f"{voice_id}.onnx"
        config_path = self.voices_dir / f"{voice_id}.onnx.json"

        if model_path.exists() and config_path.exists():
            return model_path, config_path
        return None, None

    def is_voice_installed(self, voice_id: str) -> bool:
        """Check if a voice is installed"""
        model_path, config_path = self.get_voice_path(voice_id)
        return model_path is not None and config_path is not None

    def download_voice(self,
                       voice_id: str,
                       progress_callback: Callable[[int, int], None] | None = None) -> bool:
        """
        Download a voice model.

        Args:
            voice_id: Voice preset ID from VOICE_PRESETS
            progress_callback: Optional callback(downloaded, total)

        Returns:
            True if successful
        """
        if voice_id not in VOICE_PRESETS:
            logger.error(f"Unknown voice: {voice_id}")
            return False

        if self.is_voice_installed(voice_id):
            logger.info(f"Voice {voice_id} already installed")
            return True

        preset = VOICE_PRESETS[voice_id]
        model_path = self.voices_dir / f"{voice_id}.onnx"
        config_path = self.voices_dir / f"{voice_id}.onnx.json"

        try:
            # Download model
            logger.info(f"Downloading voice model: {voice_id}")
            self._download_file(preset["url"], model_path, progress_callback)

            # Download config
            logger.info(f"Downloading voice config: {voice_id}")
            self._download_file(preset["config_url"], config_path)

            logger.info(f"Voice {voice_id} installed successfully")
            return True

        except Exception as e:
            logger.error(f"Failed to download voice {voice_id}: {e}")
            # Clean up partial downloads
            model_path.unlink(missing_ok=True)
            config_path.unlink(missing_ok=True)
            return False

    def _download_file(self,
                       url: str,
                       dest_path: Path,
                       progress_callback: Callable[[int, int], None] | None = None):
        """Download a file with optional progress callback"""
        req = urllib.request.Request(url)
        req.add_header('User-Agent', 'Nunba/1.0')

        with urllib.request.urlopen(req, timeout=60) as response:
            total_size = int(response.headers.get('Content-Length', 0))
            downloaded = 0
            block_size = 1024 * 1024  # 1MB

            with open(dest_path, 'wb') as f:
                while True:
                    buffer = response.read(block_size)
                    if not buffer:
                        break
                    f.write(buffer)
                    downloaded += len(buffer)
                    if progress_callback and total_size > 0:
                        progress_callback(downloaded, total_size)

    def list_installed_voices(self) -> list[str]:
        """List installed voice IDs"""
        voices = []
        for voice_id in VOICE_PRESETS:
            if self.is_voice_installed(voice_id):
                voices.append(voice_id)
        return voices

    def list_available_voices(self) -> dict[str, dict]:
        """List all available voice presets"""
        return VOICE_PRESETS.copy()

    def set_voice(self, voice_id: str) -> bool:
        """
        Set the current voice.

        Args:
            voice_id: Voice preset ID

        Returns:
            True if voice is available (installed or will be downloaded)
        """
        if voice_id not in VOICE_PRESETS:
            logger.error(f"Unknown voice: {voice_id}")
            return False

        self.current_voice = voice_id
        return True

    def synthesize(self,
                   text: str,
                   output_path: str | None = None,
                   voice_id: str | None = None,
                   speed: float = 1.0) -> str | None:
        """
        Synthesize text to speech.

        Args:
            text: Text to synthesize
            output_path: Output WAV file path (auto-generated if None)
            voice_id: Voice to use (uses current voice if None)
            speed: Speech speed multiplier (1.0 = normal)

        Returns:
            Path to generated WAV file, or None on failure
        """
        if not text or not text.strip():
            logger.warning("Empty text provided")
            return None

        voice_id = voice_id or self.current_voice

        # Ensure voice is installed
        if not self.is_voice_installed(voice_id):
            logger.info(f"Voice {voice_id} not installed, downloading...")
            if not self.download_voice(voice_id):
                logger.error(f"Failed to install voice {voice_id}")
                return None

        # Generate output path if not provided
        if output_path is None:
            # Use text hash for caching
            text_hash = hashlib.md5(f"{text}:{voice_id}:{speed}".encode()).hexdigest()[:16]
            output_path = str(self.cache_dir / f"tts_{text_hash}.wav")

            # Return cached file if exists
            if os.path.exists(output_path):
                logger.debug(f"Using cached audio: {output_path}")
                return output_path

        model_path, config_path = self.get_voice_path(voice_id)

        # Try piper-tts module first
        if self._piper_module:
            try:
                return self._synthesize_with_module(text, output_path, model_path, speed)
            except Exception as e:
                logger.warning(f"Module synthesis failed: {e}, trying executable")

        # Fallback to executable
        piper_exe = self._find_piper_executable()
        if piper_exe:
            try:
                return self._synthesize_with_executable(text, output_path, model_path, piper_exe, speed)
            except Exception as e:
                logger.error(f"Executable synthesis failed: {e}")

        logger.error("No synthesis method available")
        return None

    def _synthesize_with_module(self,
                                text: str,
                                output_path: str,
                                model_path: Path,
                                speed: float) -> str | None:
        """Synthesize using piper-tts module"""
        from piper import PiperVoice

        voice = PiperVoice.load(str(model_path))

        # Build synthesis config with speed control
        syn_config = None
        if speed != 1.0:
            try:
                from piper.config import SynthesisConfig
                syn_config = SynthesisConfig(length_scale=1.0 / speed)
            except (ImportError, TypeError):
                pass  # Speed control unavailable, use default

        # Use synthesize_wav (correct API for piper-tts >=2023)
        with wave.open(output_path, 'wb') as wav_file:
            voice.synthesize_wav(text, wav_file, syn_config=syn_config)

        logger.info(f"Synthesized audio: {output_path}")
        return output_path

    def _synthesize_with_executable(self,
                                    text: str,
                                    output_path: str,
                                    model_path: Path,
                                    piper_exe: str,
                                    speed: float) -> str | None:
        """Synthesize using piper executable"""
        # Create temp file for input text
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(text)
            text_file = f.name

        try:
            cmd = [
                piper_exe,
                '--model', str(model_path),
                '--output_file', output_path,
                '--length_scale', str(1.0 / speed)
            ]

            # Windows-specific flags to hide console window
            si = None
            cf = 0
            if sys.platform == "win32":
                si = subprocess.STARTUPINFO()
                si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                si.wShowWindow = 0
                cf = subprocess.CREATE_NO_WINDOW

            # Pipe text to stdin
            with open(text_file) as f:
                result = subprocess.run(
                    cmd,
                    stdin=f,
                    capture_output=True,
                    text=True,
                    timeout=60,
                    startupinfo=si,
                    creationflags=cf
                )

            if result.returncode != 0:
                logger.error(f"Piper failed: {result.stderr}")
                return None

            logger.info(f"Synthesized audio: {output_path}")
            return output_path

        finally:
            os.unlink(text_file)

    def synthesize_async(self,
                         text: str,
                         callback: Callable[[str | None], None],
                         voice_id: str | None = None,
                         speed: float = 1.0):
        """
        Synthesize text asynchronously.

        Args:
            text: Text to synthesize
            callback: Callback function(audio_path) called when done
            voice_id: Voice to use
            speed: Speech speed
        """
        def worker():
            result = self.synthesize(text, voice_id=voice_id, speed=speed)
            callback(result)

        thread = threading.Thread(target=worker, daemon=True)
        thread.start()

    def clear_cache(self, max_age_hours: int = 24):
        """
        Clear old cached audio files.

        Args:
            max_age_hours: Remove files older than this many hours
        """
        import time

        now = time.time()
        max_age_seconds = max_age_hours * 3600

        for file in self.cache_dir.glob("tts_*.wav"):
            try:
                if now - file.stat().st_mtime > max_age_seconds:
                    file.unlink()
                    logger.debug(f"Removed cached file: {file}")
            except Exception as e:
                logger.warning(f"Failed to remove {file}: {e}")


# Global TTS instance
_tts_instance: PiperTTS | None = None


def get_tts() -> PiperTTS:
    """Get the global TTS instance"""
    global _tts_instance
    if _tts_instance is None:
        _tts_instance = PiperTTS()
    return _tts_instance


def synthesize_text(text: str,
                    voice_id: str | None = None,
                    speed: float = 1.0) -> str | None:
    """
    Convenience function to synthesize text.

    Args:
        text: Text to synthesize
        voice_id: Voice preset ID (uses default if None)
        speed: Speech speed multiplier

    Returns:
        Path to WAV file or None on failure
    """
    return get_tts().synthesize(text, voice_id=voice_id, speed=speed)


def synthesize_text_async(text: str,
                          callback: Callable[[str | None], None],
                          voice_id: str | None = None,
                          speed: float = 1.0):
    """
    Convenience function for async synthesis.

    Args:
        text: Text to synthesize
        callback: Callback(audio_path) when done
        voice_id: Voice preset ID
        speed: Speech speed
    """
    get_tts().synthesize_async(text, callback, voice_id=voice_id, speed=speed)


def is_tts_available() -> bool:
    """Check if TTS is available"""
    return get_tts().is_available()


def install_default_voice(progress_callback: Callable[[int, int], None] | None = None) -> bool:
    """Install the default voice model"""
    return get_tts().download_voice(DEFAULT_VOICE, progress_callback)
