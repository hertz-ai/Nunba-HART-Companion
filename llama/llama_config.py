"""
llama_config.py - Configuration and management for Llama.cpp server

Provides configuration management, server lifecycle, and API interface
for the Llama.cpp local AI server.
"""
import json
import logging
import os
import socket
import subprocess
import sys
import time
from pathlib import Path

import requests

from llama.llama_installer import MODEL_PRESETS, LlamaInstaller, ModelPreset

logger = logging.getLogger('NunbaLlamaConfig')


class ServerType:
    """Enum for server type detection"""
    NOT_RUNNING = "not_running"
    NUNBA_MANAGED = "nunba_managed"
    EXTERNAL_LLAMA = "external_llama"
    OTHER_SERVICE = "other_service"


# Common LLM endpoints to scan
KNOWN_LLM_ENDPOINTS = [
    # Ollama
    {"name": "Ollama", "base_url": "http://localhost:11434", "health": "/api/tags", "completions": "/api/generate", "type": "ollama"},
    # LM Studio
    {"name": "LM Studio", "base_url": "http://localhost:1234", "health": "/v1/models", "completions": "/v1/completions", "type": "openai"},
    # LocalAI
    {"name": "LocalAI", "base_url": "http://localhost:8080", "health": "/v1/models", "completions": "/v1/completions", "type": "openai"},
    # text-generation-webui (oobabooga) — port 5000 excluded because Nunba's
    # own Flask server runs there. Scanning it falsely detects Flask as TG-WebUI.
    {"name": "Text Generation WebUI", "base_url": "http://localhost:7860", "health": "/v1/models", "completions": "/v1/completions", "type": "openai"},
    # vLLM
    {"name": "vLLM", "base_url": "http://localhost:8000", "health": "/v1/models", "completions": "/v1/completions", "type": "openai"},
    # KoboldCpp
    {"name": "KoboldCpp", "base_url": "http://localhost:5001", "health": "/api/v1/model", "completions": "/api/v1/generate", "type": "kobold"},
    # Jan.ai
    {"name": "Jan", "base_url": "http://localhost:1337", "health": "/v1/models", "completions": "/v1/chat/completions", "type": "openai"},
]


def scan_existing_llm_endpoints() -> dict | None:
    """
    Scan for existing LLM endpoints on the system.
    Returns the first working endpoint found, or None if none found.

    Returns:
        Dict with endpoint info if found: {"name", "base_url", "completions", "type"}
        None if no endpoints found
    """
    logger.info("Scanning for existing LLM endpoints...")

    for endpoint in KNOWN_LLM_ENDPOINTS:
        try:
            # Try the health endpoint
            health_url = endpoint["base_url"] + endpoint["health"]
            logger.debug(f"Checking {endpoint['name']} at {health_url}")

            response = requests.get(health_url, timeout=2)
            if response.status_code == 200:
                logger.info(f"Found existing LLM endpoint: {endpoint['name']} at {endpoint['base_url']}")
                return {
                    "name": endpoint["name"],
                    "base_url": endpoint["base_url"],
                    "completions": endpoint["base_url"] + endpoint["completions"],
                    "type": endpoint["type"]
                }
        except requests.exceptions.RequestException:
            # Endpoint not available, continue scanning
            pass
        except Exception as e:
            logger.debug(f"Error checking {endpoint['name']}: {e}")

    logger.info("No existing LLM endpoints found")
    return None


def scan_openai_compatible_ports(ports: list[int] = None) -> dict | None:
    """
    Scan additional ports for OpenAI-compatible endpoints.

    Args:
        ports: List of ports to scan (defaults to common ports)

    Returns:
        Dict with endpoint info if found, None otherwise
    """
    if ports is None:
        ports = [8080, 8081, 8082, 8000, 5000, 5001, 3000, 3001, 4000, 11434, 1234, 1337]

    for port in ports:
        try:
            # Try OpenAI-compatible /v1/models endpoint
            url = f"http://localhost:{port}/v1/models"
            response = requests.get(url, timeout=1)
            if response.status_code == 200:
                logger.info(f"Found OpenAI-compatible endpoint on port {port}")
                return {
                    "name": f"OpenAI-compatible (port {port})",
                    "base_url": f"http://localhost:{port}",
                    "completions": f"http://localhost:{port}/v1/completions",
                    "type": "openai"
                }
        except Exception:
            pass

    return None


class LlamaConfig:
    """Manages Llama.cpp configuration and server lifecycle"""

    def __init__(self, config_dir: str | None = None):
        """
        Initialize configuration

        Args:
            config_dir: Directory for config files (defaults to ~/.nunba)
        """
        home = Path.home()
        self.config_dir = Path(config_dir) if config_dir else home / ".nunba"
        self.config_file = self.config_dir / "llama_config.json"
        self.server_status_file = self.config_dir / "server_status.json"
        self.config_dir.mkdir(parents=True, exist_ok=True)

        self.installer = LlamaInstaller()
        self.server_process: subprocess.Popen | None = None
        self._server_starting = False  # Lock to prevent double start

        # Load or create config
        self.config = self._load_config()

        # Update API base with configured port
        self.api_base = f"http://127.0.0.1:{self.config.get('server_port', 8080)}/v1"

    def _load_config(self) -> dict:
        """Load configuration from file or create default"""
        if self.config_file.exists():
            try:
                with open(self.config_file) as f:
                    cfg = json.load(f)
                # Migrate: bump context_size if still at old default (4096)
                # Agent creation (autogen multi-turn) needs at least 8192
                if cfg.get('context_size', 0) < 8192:
                    cfg['context_size'] = 8192
                    try:
                        with open(self.config_file, 'w') as f:
                            json.dump(cfg, f, indent=2)
                        logger.info("Migrated context_size to 8192")
                    except Exception:
                        pass
                return cfg
            except Exception as e:
                logger.error(f"Failed to load config: {e}")

        # Default configuration
        # Only enable GPU if hardware supports it AND binary will support it
        # Start with conservative default (False), will be updated after installation
        return {
            "first_run": True,
            "auto_start_server": True,
            "selected_model_index": 0,  # Default to recommended model
            "server_port": 8080,
            "use_gpu": False,  # Will be set to True after successful GPU-enabled installation
            "context_size": 8192,
            # Cloud provider fields (non-secret — keys stored in encrypted vault)
            "cloud_provider": None,   # e.g. "openai", "anthropic", "groq"
            "cloud_model": None,      # e.g. "gpt-4o-mini", "claude-sonnet-4-20250514"
            "llm_mode": "local",      # "local" | "cloud" | "hybrid"
            "llama_cpp_build": None,  # Cached llama.cpp build number
        }

    def _save_config(self):
        """Save configuration to file"""
        try:
            with open(self.config_file, 'w') as f:
                json.dump(self.config, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save config: {e}")

    @staticmethod
    def _propagate_llm_url(url: str):
        """Set the canonical LLM URL env var and invalidate caches.

        Called after start_server() detects or starts a server.
        Uses set_local_llm_url() from port_registry which validates
        the URL, sets HEVOLVE_LOCAL_LLM_URL, and clears the resolver cache.
        """
        try:
            from core.port_registry import set_local_llm_url
            set_local_llm_url(url)
        except ImportError:
            # Fallback if HARTOS not available (standalone Nunba dev)
            os.environ['HEVOLVE_LOCAL_LLM_URL'] = url
            logger.info(f"LLM URL set: {url}")

    def is_first_run(self) -> bool:
        """Check if this is the first run"""
        return self.config.get("first_run", True)

    def mark_first_run_complete(self):
        """Mark first run as complete"""
        self.config["first_run"] = False
        self._save_config()

    def get_llm_mode(self) -> str:
        """Return 'local', 'cloud', or 'hybrid'."""
        return self.config.get('llm_mode', 'local')

    def is_cloud_configured(self) -> bool:
        """Check if a cloud provider has been configured via the wizard."""
        return self.config.get('cloud_provider') is not None

    def get_selected_model_preset(self) -> ModelPreset | None:
        """Get the currently selected model preset"""
        index = self.config.get("selected_model_index", 0)
        if 0 <= index < len(MODEL_PRESETS):
            return MODEL_PRESETS[index]
        return None

    def _get_vram_manager(self):
        """Get the global VRAMManager singleton (shared with TTS, vision, etc.)."""
        try:
            from integrations.service_tools.vram_manager import vram_manager
            return vram_manager
        except ImportError:
            return None

    # _compute_budget and select_best_model_for_hardware DELETED.
    # Model selection is the orchestrator's job (ModelCatalog.select_best + VRAMManager).
    # llama_config.py only manages the llama-server process (start/stop/port/flags).

    def diagnose(self) -> dict:
        """Comprehensive hardware + software diagnosis for smart auto-start.

        Returns a dict describing GPU state, binary state, model state, mmproj state,
        and a prioritized list of actions needed to get the LLM running.

        Action types:
          'start'             — everything ready, just start the server
          'start_cpu'         — model+binary ready but must run CPU-only (GPU occupied/unavailable)
          'upgrade_binary'    — CPU binary present but GPU is available, download CUDA build
          'downgrade_model'   — current model too big for available VRAM/RAM, need smaller one
          'download_model'    — no model on disk, must download
          'download_mmproj'   — model on disk but vision projector missing
          'install_binary'    — no llama-server found at all
          'download_all'      — neither model nor binary available
        """
        diag = {
            # GPU
            'gpu_detected': False,
            'gpu_type': 'none',        # 'cuda', 'metal', 'none'
            'gpu_name': None,
            'gpu_total_gb': 0.0,
            'gpu_free_gb': 0.0,
            'gpu_occupied': False,      # GPU exists but free < 20% of total
            'ram_gb': 0.0,
            'vram_allocations': {},     # what other models (TTS, vision) hold
            # Binary
            'binary_found': False,
            'binary_path': None,
            'binary_supports_gpu': False,
            'binary_mismatch': None,    # 'need_gpu_build', 'gpu_build_no_gpu', None
            # Model (best for current hardware)
            'best_model_index': None,
            'best_model_name': None,
            'best_model_size_mb': 0,
            'best_model_downloaded': False,
            'best_model_fits_compute': True,
            'mmproj_available': False,
            'mmproj_needed': False,
            # Current configured model (may differ from best)
            'current_model_index': None,
            'current_model_name': None,
            'current_model_downloaded': False,
            'current_model_too_big': False,
            # Budget
            'compute_budget_mb': 0,
            'compute_source': 'ram',    # 'vram' or 'ram'
            # Action
            'action': 'download_all',   # primary action needed
            'actions': [],              # all actions in priority order
            'run_mode': 'cpu',          # 'gpu', 'cpu' — how we'll actually run
            'message': '',
        }

        # ── GPU + compute budget via unified VRAMManager (shared with TTS, vision) ──
        vm = self._get_vram_manager()
        if vm:
            gpu_info = vm.detect_gpu()
            diag['gpu_type'] = 'cuda' if gpu_info.get('cuda_available') else (
                'metal' if gpu_info.get('metal_available') else 'none')
            diag['gpu_detected'] = diag['gpu_type'] != 'none'
            diag['gpu_name'] = gpu_info.get('name')
            diag['gpu_total_gb'] = gpu_info.get('total_gb', 0.0)
            # Use get_free_vram() — accounts for TTS/vision/other allocations
            diag['gpu_free_gb'] = round(vm.get_free_vram(), 2)
            diag['vram_allocations'] = vm.get_allocations()  # what other models hold
        else:
            if self.installer.gpu_available != 'none':
                diag['gpu_detected'] = True
                diag['gpu_type'] = self.installer.gpu_available

        # GPU is "occupied" if <20% of total is free (TTS, vision, or external model)
        if diag['gpu_detected'] and diag['gpu_total_gb'] > 0:
            free_pct = diag['gpu_free_gb'] / diag['gpu_total_gb']
            diag['gpu_occupied'] = free_pct < 0.20

        # ── RAM ────────────────────────────────────────────────────
        try:
            import psutil
            diag['ram_gb'] = round(psutil.virtual_memory().available / (1024 ** 3), 2)
        except Exception:
            diag['ram_gb'] = 4.0

        # ── Compute budget via VRAMManager (public API) ────────
        try:
            from integrations.service_tools.vram_manager import vram_manager
            gpu = vram_manager.detect_gpu()
            free_vram = vram_manager.get_free_vram()
            gpu_available = gpu.get('cuda_available', False) or gpu.get('metal_available', False)
            if gpu_available and free_vram > 0.5:
                budget_mb = int(free_vram * 1024)
                source = 'vram'
            else:
                import psutil
                budget_mb = int(psutil.virtual_memory().available / (1024 * 1024) / 2)
                source = 'ram'
        except Exception:
            budget_mb = 2000
            source = 'ram'
        diag['compute_budget_mb'] = budget_mb
        diag['compute_source'] = source
        diag['run_mode'] = 'gpu' if source == 'vram' else 'cpu'

        # ── Binary detection ───────────────────────────────────────
        llama_server = self.installer.find_llama_server(check_system_first=True)
        if llama_server:
            diag['binary_found'] = True
            diag['binary_path'] = llama_server
            # Check if binary has GPU support (CUDA DLLs next to it)
            from pathlib import Path as _P
            bin_dir = _P(llama_server).parent
            cuda_dlls = list(bin_dir.glob("ggml-cuda*.dll")) + list(bin_dir.glob("ggml-cuda*.so"))
            if cuda_dlls:
                diag['binary_supports_gpu'] = True
            elif "darwin" in self.installer.os_name:
                diag['binary_supports_gpu'] = True  # Metal on macOS
            # Detect mismatches
            if diag['gpu_detected'] and not diag['binary_supports_gpu'] and diag['gpu_type'] == 'cuda':
                diag['binary_mismatch'] = 'need_gpu_build'
            elif not diag['gpu_detected'] and diag['binary_supports_gpu'] and diag['gpu_type'] != 'metal':
                diag['binary_mismatch'] = 'gpu_build_no_gpu'

        # ── Best model selection via orchestrator catalog ──────
        best_idx = self.config.get('selected_model_index', 0)
        try:
            from models.orchestrator import get_orchestrator
            entry = get_orchestrator().select_best('llm')
            if entry:
                # Match catalog entry back to MODEL_PRESETS index
                for i, p in enumerate(MODEL_PRESETS):
                    if p.display_name == entry.name or p.file_name == entry.files.get('model', ''):
                        best_idx = i
                        break
        except Exception:
            pass
        best_preset = MODEL_PRESETS[best_idx] if best_idx < len(MODEL_PRESETS) else MODEL_PRESETS[0]
        diag['best_model_index'] = best_idx
        diag['best_model_name'] = best_preset.display_name
        diag['best_model_size_mb'] = best_preset.size_mb
        diag['best_model_downloaded'] = self.installer.get_model_path(best_preset) is not None
        diag['best_model_fits_compute'] = best_preset.size_mb <= diag['compute_budget_mb']
        diag['mmproj_needed'] = best_preset.has_vision and bool(best_preset.mmproj_file)
        if diag['mmproj_needed']:
            diag['mmproj_available'] = self.installer.get_mmproj_path(best_preset) is not None

        # ── Current configured model ──────────────────────────────
        cur_idx = self.config.get('selected_model_index', 0)
        if 0 <= cur_idx < len(MODEL_PRESETS):
            cur_preset = MODEL_PRESETS[cur_idx]
            diag['current_model_index'] = cur_idx
            diag['current_model_name'] = cur_preset.display_name
            diag['current_model_downloaded'] = self.installer.get_model_path(cur_preset) is not None
            diag['current_model_too_big'] = cur_preset.size_mb > diag['compute_budget_mb']

        # ── Determine actions ──────────────────────────────────────
        actions = []

        if not diag['binary_found']:
            actions.append('install_binary')

        if diag['binary_mismatch'] == 'need_gpu_build':
            actions.append('upgrade_binary')

        # If best model is downloaded, check if it actually fits
        if diag['best_model_downloaded']:
            if not diag['best_model_fits_compute']:
                # Model on disk but too big for current compute — find one that fits
                actions.append('downgrade_model')
            elif diag['mmproj_needed'] and not diag['mmproj_available']:
                actions.append('download_mmproj')
            # If model + binary are ready
            if not actions or actions == ['upgrade_binary']:
                if diag['gpu_occupied'] or (diag['gpu_detected'] and not diag['binary_supports_gpu']):
                    actions.append('start_cpu')
                else:
                    actions.append('start')
        else:
            # Model not downloaded — check if a different downloaded model fits
            found_alternative = False
            for i, preset in enumerate(MODEL_PRESETS):
                if preset.size_mb <= diag['compute_budget_mb'] and self.installer.get_model_path(preset):
                    found_alternative = True
                    break
            if found_alternative:
                # We have an alternative model that fits — use it
                if diag['gpu_occupied']:
                    actions.append('start_cpu')
                else:
                    actions.append('start')
            else:
                actions.append('download_model')

        diag['actions'] = actions
        diag['action'] = actions[0] if actions else 'start'

        # ── Human-readable message ─────────────────────────────────
        msgs = {
            'start': f'{best_preset.display_name} is ready — starting with {diag["run_mode"].upper()}.',
            'start_cpu': f'GPU is {"occupied by another model" if diag["gpu_occupied"] else "not available for inference"}. '
                         f'Starting {best_preset.display_name} in CPU mode.',
            'upgrade_binary': f'GPU detected ({diag["gpu_name"] or diag["gpu_type"]}) but llama.cpp is CPU-only. Upgrading to CUDA build.',
            'downgrade_model': f'{best_preset.display_name} ({best_preset.size_mb}MB) is too big for '
                               f'{diag["compute_budget_mb"]}MB budget. Selecting a smaller model.',
            'download_model': f'No suitable model found on disk. Recommend downloading '
                              f'{best_preset.display_name} ({best_preset.size_mb}MB).',
            'download_mmproj': f'{best_preset.display_name} found but vision projector (mmproj) is missing. Downloading it.',
            'install_binary': 'llama.cpp server not found. Installing it.',
            'download_all': 'No local LLM setup found. Need to download model and install llama.cpp.',
        }
        diag['message'] = msgs.get(diag['action'], '')

        return diag

    def auto_setup(self, progress_callback=None, model_index=None) -> dict:
        """Smart auto-setup: diagnose hardware, handle all edge cases, start server.

        Handles:
          - GPU binary + no GPU → CPU mode
          - CPU binary + GPU available → upgrade binary then start with GPU
          - GPU occupied by non-completion model → CPU mode
          - Model on disk but too big for available VRAM → select smaller model
          - Model available, no binary → install binary
          - Neither available → download both
          - mmproj missing → download just mmproj
          - GPU is small but big model on disk → download right-sized model

        Args:
            progress_callback: Optional callable(stage: str, progress: float)
            model_index: Optional int — override model selection (from frontend card)

        Returns:
            dict with keys: success, model_name, gpu_mode, message, diagnosis
        """
        # ── 0. Check for existing LLM servers first ─────────────────
        # Reuse existing llama.cpp/Ollama/LM Studio instead of starting a new one
        if progress_callback:
            progress_callback('scanning', 0.02)

        existing = scan_existing_llm_endpoints()
        if not existing:
            existing = scan_openai_compatible_ports()

        if existing:
            logger.info(f"Found existing LLM: {existing['name']} at {existing['base_url']}")
            self.api_base = existing['base_url'] + '/v1'
            self.config['llm_mode'] = 'local'
            self.config['custom_api_base'] = existing['base_url']
            self._save_config()
            if progress_callback:
                progress_callback('ready', 1.0)
            return {
                'success': True,
                'model_name': existing['name'],
                'gpu_mode': True,
                'message': f"Using existing {existing['name']}",
                'diagnosis': {'action': 'reuse_existing', 'endpoint': existing},
            }

        diag = self.diagnose()
        logger.info(f"Auto-setup diagnosis: action={diag['action']}, actions={diag['actions']}, "
                    f"run_mode={diag['run_mode']}, gpu={diag['gpu_type']}, "
                    f"budget={diag['compute_budget_mb']}MB")

        if progress_callback:
            progress_callback('diagnosing', 0.05)

        # ── 1. Resolve model selection ─────────────────────────────
        if model_index is not None and 0 <= model_index < len(MODEL_PRESETS):
            model_idx = model_index
        elif 'downgrade_model' in diag['actions']:
            # Current best model is too big — find the largest that fits
            model_idx = self._find_best_fitting_model(diag['compute_budget_mb'])
            logger.info(f"Downgraded model selection: {MODEL_PRESETS[model_idx].display_name} "
                        f"(fits {diag['compute_budget_mb']}MB budget)")
        else:
            model_idx = diag['best_model_index']

        preset = MODEL_PRESETS[model_idx]

        # ── 2. Ensure model is on disk ─────────────────────────────
        if progress_callback:
            progress_callback('checking_model', 0.1)

        model_path = self.installer.get_model_path(preset)
        if not model_path:
            # Model not on disk — can we use an alternative that IS downloaded?
            alt_idx = self._find_best_downloaded_model(diag['compute_budget_mb'])
            if alt_idx is not None:
                logger.info(f"Using already-downloaded model: {MODEL_PRESETS[alt_idx].display_name}")
                model_idx = alt_idx
                preset = MODEL_PRESETS[model_idx]
                model_path = self.installer.get_model_path(preset)
            else:
                # Must download
                if progress_callback:
                    progress_callback('downloading_model', 0.15)
                logger.info(f"Auto-setup: downloading {preset.display_name}...")
                success = self.installer.download_model(preset, progress_callback=progress_callback)
                if not success:
                    return {
                        'success': False,
                        'model_name': preset.display_name,
                        'gpu_mode': diag['run_mode'] == 'gpu',
                        'message': f'Failed to download {preset.display_name}',
                        'diagnosis': diag,
                    }
                model_path = self.installer.get_model_path(preset)

        # ── 3. Ensure mmproj for vision models ─────────────────────
        if preset.has_vision and preset.mmproj_file:
            mmproj_path = self.installer.get_mmproj_path(preset)
            if not mmproj_path:
                if progress_callback:
                    progress_callback('downloading_mmproj', 0.4)
                logger.info(f"Auto-setup: downloading vision projector for {preset.display_name}...")
                self._download_mmproj_only(preset)

        # ── 4. Ensure llama.cpp binary ─────────────────────────────
        if progress_callback:
            progress_callback('checking_binary', 0.5)

        llama_server = self.installer.find_llama_server(check_system_first=True)

        # Case: CPU binary but GPU available → try upgrade
        if llama_server and diag['binary_mismatch'] == 'need_gpu_build':
            if progress_callback:
                progress_callback('upgrading_binary', 0.55)
            logger.info("Upgrading llama.cpp to CUDA build...")
            upgraded = self.installer.try_download_prebuilt()
            if upgraded and self.installer.binary_supports_gpu:
                llama_server = self.installer.find_llama_server(check_system_first=True)
                diag['run_mode'] = 'gpu'
                logger.info("Successfully upgraded to CUDA build")
            else:
                logger.warning("CUDA build upgrade failed — continuing with CPU binary")
                diag['run_mode'] = 'cpu'

        # Case: no binary at all
        if not llama_server:
            if progress_callback:
                progress_callback('installing_binary', 0.6)
            logger.info("Auto-setup: installing llama.cpp...")
            success = self.installer.install_llama_cpp()
            if not success:
                return {
                    'success': False,
                    'model_name': preset.display_name,
                    'gpu_mode': False,
                    'message': 'Failed to install llama.cpp',
                    'diagnosis': diag,
                }
            llama_server = self.installer.find_llama_server(check_system_first=True)

        # ── 5. Final run_mode decision ─────────────────────────────
        # GPU binary + no GPU hardware → CPU mode
        if diag['binary_mismatch'] == 'gpu_build_no_gpu':
            diag['run_mode'] = 'cpu'

        # GPU occupied → CPU mode
        if diag['gpu_occupied']:
            diag['run_mode'] = 'cpu'
            logger.info(f"GPU occupied ({diag['gpu_free_gb']:.1f}/{diag['gpu_total_gb']:.1f}GB free) — CPU mode")

        # Model too big for VRAM even though GPU available → CPU mode
        if diag['run_mode'] == 'gpu' and preset.size_mb > diag['compute_budget_mb']:
            diag['run_mode'] = 'cpu'
            logger.info(f"Model {preset.size_mb}MB > budget {diag['compute_budget_mb']}MB — CPU mode")

        # ── 6. Apply run_mode to config ────────────────────────────
        self.config['selected_model_index'] = model_idx
        self.config['first_run'] = False
        self.config['llm_mode'] = 'local'
        self.config['use_gpu'] = (diag['run_mode'] == 'gpu')
        self._save_config()

        # ── 7. Start server ────────────────────────────────────────
        if progress_callback:
            progress_callback('starting', 0.85)

        started = self.start_server(model_preset=preset)

        # ── 8. Register VRAM allocation (so TTS/vision see the LLM's reservation) ──
        if started and diag['run_mode'] == 'gpu':
            vm = self._get_vram_manager()
            if vm:
                model_gb = preset.size_mb / 1024.0
                tool_key = f'llm_{preset.display_name.replace(" ", "_").lower()}'
                vm._allocations[tool_key] = model_gb
                logger.info(f"Registered VRAM allocation: {tool_key} = {model_gb:.1f}GB")

        mode_label = 'GPU' if diag['run_mode'] == 'gpu' else 'CPU'
        if started:
            msg = f'{preset.display_name} is running ({mode_label})'
            if diag['gpu_occupied']:
                msg += ' — GPU was occupied, using CPU'
            elif diag['binary_mismatch'] == 'need_gpu_build' and diag['run_mode'] == 'cpu':
                msg += ' — CUDA upgrade failed, using CPU'
        else:
            msg = f'Server failed to start ({preset.display_name}, {mode_label})'

        return {
            'success': started,
            'model_name': preset.display_name,
            'model_index': model_idx,
            'gpu_mode': diag['run_mode'] == 'gpu',
            'run_mode': diag['run_mode'],
            'size_mb': preset.size_mb,
            'message': msg,
            'diagnosis': diag,
        }

    def _find_best_fitting_model(self, budget_mb: int) -> int:
        """Find the largest Qwen3.5 model that fits within the compute budget."""
        best_idx = 1  # Qwen3.5-2B as safe minimum
        best_size = 0
        for i, preset in enumerate(MODEL_PRESETS):
            if preset.size_mb <= budget_mb and preset.size_mb > best_size:
                best_idx = i
                best_size = preset.size_mb
        return best_idx

    def _find_best_downloaded_model(self, budget_mb: int) -> int | None:
        """Find the largest already-downloaded model that fits the budget."""
        best_idx = None
        best_size = 0
        for i, preset in enumerate(MODEL_PRESETS):
            if preset.size_mb <= budget_mb and self.installer.get_model_path(preset):
                if preset.size_mb > best_size:
                    best_idx = i
                    best_size = preset.size_mb
        return best_idx

    def _download_mmproj_only(self, preset: ModelPreset) -> bool:
        """Download just the vision projector (mmproj) for a model, not the model itself."""
        if not preset.has_vision or not preset.mmproj_file:
            return True
        try:
            base = preset.file_name.split("-UD-")[0] if "-UD-" in preset.file_name else preset.file_name.split("-Q")[0]
            base = base.replace('.gguf', '')
            local_name = preset.mmproj_file.replace("mmproj-", f"mmproj-{base}-")
            mmproj_path = self.installer.models_dir / local_name
            if mmproj_path.exists():
                return True
            mmproj_url = f"https://huggingface.co/{preset.repo_id}/resolve/main/{preset.mmproj_file}"
            logger.info(f"Downloading mmproj: {preset.mmproj_file} -> {local_name}")
            self.installer.download_file_with_progress(mmproj_url, mmproj_path)
            return mmproj_path.exists()
        except Exception as e:
            logger.error(f"mmproj download failed: {e}")
            return False

    def is_llm_available(self) -> bool:
        """Check if any LLM endpoint is ready for completions (local server healthy or cloud configured)."""
        if self.is_cloud_configured():
            return True
        # Check if local server is running AND healthy (model loaded)
        try:
            import urllib.request
            port = self.config.get('server_port', 8080)
            req = urllib.request.Request(
                f'http://127.0.0.1:{port}/health',
                method='GET'
            )
            with urllib.request.urlopen(req, timeout=2) as resp:
                return resp.status == 200
        except Exception:
            return False

    def is_llm_server_running(self) -> bool:
        """Check if a llama-server process is reachable — even if still loading a model.

        Unlike is_llm_available() (which requires 200 = healthy), this returns True
        for ANY HTTP response (200, 500, 503). Only returns False when the connection
        is refused (no process listening). Used by startup logic to avoid launching
        a duplicate server while a model is still loading.
        """
        if self.is_cloud_configured():
            return True
        import urllib.request
        port = self.config.get('server_port', 8080)
        try:
            req = urllib.request.Request(f'http://127.0.0.1:{port}/health', method='GET')
            with urllib.request.urlopen(req, timeout=2) as resp:
                return True  # 200 = healthy
        except urllib.request.HTTPError:
            return True  # 500/503 = server exists, model loading
        except Exception:
            return False  # ConnectionRefused/Timeout = no server

    def detect_and_cache_version(self) -> int | None:
        """Detect the installed llama.cpp build number and cache it in config."""
        version = self.installer.get_version()
        if version is not None:
            self.config["llama_cpp_build"] = version
            self._save_config()
            logger.info(f"Detected llama.cpp build: b{version}")
        return version

    def get_cached_version(self) -> int | None:
        """Get the cached llama.cpp build number from config."""
        return self.config.get("llama_cpp_build")

    def is_port_available(self, port: int) -> bool:
        """
        Check if a port is available for use

        Args:
            port: Port number to check

        Returns:
            True if port is available, False if occupied
        """
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.settimeout(1)
                s.bind(('127.0.0.1', port))
                return True
        except Exception:
            return False

    def find_available_port(self, start_port: int = 8080, max_attempts: int = 10) -> int | None:
        """
        Find an available port starting from start_port

        Args:
            start_port: Port to start searching from
            max_attempts: Maximum number of ports to try

        Returns:
            Available port number or None if none found
        """
        for port in range(start_port, start_port + max_attempts):
            if self.is_port_available(port):
                logger.info(f"Found available port: {port}")
                return port
        return None

    def check_server_type(self, port: int) -> tuple[str, dict | None]:
        """
        Check what type of server is running on the given port

        Args:
            port: Port to check

        Returns:
            Tuple of (server_type, server_info)
            server_type: One of ServerType enum values
            server_info: Dict with server details if applicable
        """
        try:
            # Try health endpoint first (with Nunba identifier)
            health_url = f"http://127.0.0.1:{port}/health"
            response = requests.get(health_url, timeout=2)

            if response.status_code == 200:
                try:
                    health_data = response.json()

                    # Check if this is a Nunba-managed server
                    if health_data.get("managed_by") == "Nunba":
                        logger.info(f"Detected Nunba-managed llama.cpp server on port {port}")
                        return ServerType.NUNBA_MANAGED, health_data

                    # Check if it's llama.cpp (has "status" field)
                    if "status" in health_data:
                        logger.info(f"Detected external llama.cpp server on port {port}")
                        return ServerType.EXTERNAL_LLAMA, health_data

                except Exception:
                    pass

            # Try /v1/models endpoint (llama.cpp compatibility)
            models_url = f"http://127.0.0.1:{port}/v1/models"
            response = requests.get(models_url, timeout=2)

            if response.status_code == 200:
                try:
                    data = response.json()
                    # llama.cpp returns {"object":"list","data":[...]}
                    if data.get("object") == "list":
                        logger.info(f"Detected external llama.cpp server on port {port} (via /v1/models)")
                        return ServerType.EXTERNAL_LLAMA, {"models": data.get("data", [])}
                except Exception:
                    pass

            # Some other service is running
            logger.warning(f"Port {port} is occupied by a non-llama.cpp service")
            return ServerType.OTHER_SERVICE, None

        except requests.exceptions.ConnectionError:
            # Nothing running on this port
            return ServerType.NOT_RUNNING, None
        except Exception as e:
            logger.debug(f"Error checking server on port {port}: {e}")
            return ServerType.NOT_RUNNING, None

    def check_server_running(self, port: int | None = None) -> bool:
        """
        Check if llama.cpp server is running on the specified port

        Args:
            port: Port to check (uses configured port if None)

        Returns:
            True if llama.cpp server is running, False otherwise
        """
        if port is None:
            port = self.config.get("server_port", 8080)

        server_type, _ = self.check_server_type(port)
        return server_type in [ServerType.NUNBA_MANAGED, ServerType.EXTERNAL_LLAMA]

    def _write_server_status(self, running: bool, pid: int | None = None,
                             model: str | None = None, port: int | None = None):
        """Write server status to SHARED file for cross-app coordination.

        Written to both:
          - ~/.nunba/server_status.json (Nunba-local)
          - ~/.trueflow/server_status.json (TrueFlow reads this)
        Format matches TrueFlow's ServerStatus data class so both apps
        can discover each other's servers.
        """
        actual_port = port or self.config.get("server_port", 8080)
        status = {
            "running": running,
            "pid": pid,
            "port": actual_port,
            "model": model,
            "started_by": "Nunba",
            "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "projectPath": None,
            "projectName": "Nunba"
        }
        # Write to all known status file locations
        for status_path in [
            self.server_status_file,  # ~/.nunba/server_status.json
            Path.home() / ".trueflow" / "server_status.json",
        ]:
            try:
                status_path.parent.mkdir(parents=True, exist_ok=True)
                with open(status_path, 'w') as f:
                    json.dump(status, f, indent=2)
            except Exception as e:
                logger.debug(f"Failed to write status to {status_path}: {e}")

    def start_server(self, model_preset: ModelPreset | None = None, force_new_port: bool = False) -> bool:
        """
        Start the llama.cpp server with automatic port conflict resolution

        Args:
            model_preset: Model to load (uses selected model if None)
            force_new_port: Force finding a new port even if configured port is available

        Returns:
            True if server started successfully, False otherwise
        """
        # Prevent double start across processes/threads using a file lock.
        # Each code path (--setup-ai, app.py warm-up, /chat fallback) creates
        # its own LlamaConfig instance, so in-memory flags don't work.
        lock_file = self.config_dir / ".server_starting.lock"

        # Check if another process is already starting
        if lock_file.exists():
            try:
                lock_age = time.time() - lock_file.stat().st_mtime
                if lock_age < 120:  # lock is fresh (< 2 min)
                    logger.info(f"Server start already in progress (lock age: {lock_age:.0f}s) — waiting...")
                    for _ in range(120):
                        time.sleep(0.5)
                        if not lock_file.exists():
                            break
                        if self.is_llm_available():
                            logger.info("Server started by another process — reusing")
                            return True
                    if self.is_llm_available():
                        return True
                    logger.warning("Server start by another process timed out")
                    return False
                else:
                    logger.warning(f"Stale server lock ({lock_age:.0f}s old) — removing")
                    lock_file.unlink(missing_ok=True)
            except Exception:
                pass

        # Acquire lock
        try:
            lock_file.write_text(str(os.getpid()))
        except Exception:
            pass

        try:
            return self._do_start_server(model_preset, force_new_port)
        finally:
            try:
                lock_file.unlink(missing_ok=True)
            except Exception:
                pass

    def _do_start_server(self, model_preset=None, force_new_port=False):
        """Internal server start — called by start_server() with lock protection."""
        # Get desired port
        desired_port = self.config.get("server_port", 8080)

        # Check desired port AND common llama.cpp ports for existing servers.
        # Avoids starting a second GPU server when trueflow/other already runs.
        _check_ports = [desired_port]
        for _common_port in [8080, 8081]:
            if _common_port != desired_port:
                _check_ports.append(_common_port)

        for _port in _check_ports:
            server_type, server_info = self.check_server_type(_port)

            if server_type in (ServerType.NUNBA_MANAGED, ServerType.EXTERNAL_LLAMA):
                label = "Nunba-managed" if server_type == ServerType.NUNBA_MANAGED else "External llama.cpp"
                logger.info(f"{label} server already running on port {_port}")
                self.api_base = f"http://127.0.0.1:{_port}/v1"
                self.config["server_port"] = _port
                self._propagate_llm_url(self.api_base)
                self._save_config()

                # Sync orchestrator catalog with the ACTUAL running model.
                # Query /v1/models to get the GGUF filename, then match against
                # MODEL_PRESETS (which map display_name ↔ file_name) and catalog.
                try:
                    import requests as _req
                    resp = _req.get(f"http://127.0.0.1:{_port}/v1/models", timeout=3)
                    if resp.status_code == 200:
                        rj = resp.json()
                        actual_gguf = (rj.get('data', [{}])[0].get('id', '')
                                       or rj.get('models', [{}])[0].get('name', ''))
                        logger.info(f"Running model: {actual_gguf}")

                        # Match GGUF filename to MODEL_PRESETS display name
                        display_name = actual_gguf  # fallback
                        try:
                            from llama.llama_installer import MODEL_PRESETS
                            for p in MODEL_PRESETS:
                                if p.file_name == actual_gguf:
                                    display_name = p.display_name
                                    # Update config to reflect the actual running model
                                    idx = MODEL_PRESETS.index(p)
                                    if self.config.get('selected_model_index') != idx:
                                        self.config['selected_model_index'] = idx
                                        self._save_config()
                                    break
                        except ImportError:
                            pass

                        # Notify orchestrator so catalog marks it as loaded
                        try:
                            from models.orchestrator import get_orchestrator
                            get_orchestrator().notify_loaded(
                                'llm', display_name, device='gpu')
                            logger.info(f"Catalog synced: LLM '{display_name}' marked as loaded")
                        except ImportError:
                            pass
                except Exception as _sync_err:
                    logger.debug(f"Catalog sync skipped: {_sync_err}")

                return True

        # Re-check the desired port — use raw TCP bind test to catch TIME_WAIT
        # phantom sockets that HTTP health checks miss.
        def _is_port_really_free(port):
            """Try to actually bind to the port. TIME_WAIT, phantom processes, etc. all fail."""
            import socket
            try:
                s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                s.bind(('127.0.0.1', port))
                s.close()
                return True
            except OSError:
                return False

        port_free = _is_port_really_free(desired_port)
        server_type, server_info = self.check_server_type(desired_port)

        if server_type == ServerType.OTHER_SERVICE or force_new_port or not port_free:
            if server_type == ServerType.OTHER_SERVICE:
                logger.warning(f"Port {desired_port} is occupied by a non-llama.cpp service")
            elif not port_free:
                logger.warning(f"Port {desired_port} has phantom connections (TIME_WAIT) — finding alternative")

            # Find an available port (also uses bind test)
            new_port = None
            for _try_port in range(desired_port + 1, desired_port + 20):
                if _is_port_really_free(_try_port):
                    st, _ = self.check_server_type(_try_port)
                    if st == ServerType.NOT_RUNNING:
                        new_port = _try_port
                        break
            if new_port is None:
                new_port = self.find_available_port(start_port=desired_port + 1)
            if new_port is None:
                logger.error("Could not find an available port for llama.cpp server")
                return False

            logger.info(f"Using alternative port: {new_port}")
            # Update config with new port
            self.config["server_port"] = new_port
            self._save_config()
            self.api_base = f"http://127.0.0.1:{new_port}/v1"
            desired_port = new_port

        # Check if we have our own server process running
        if self.server_process and self.server_process.poll() is None:
            logger.info("Server process is already running")
            return True

        # Get llama-server path (check system installations first to avoid downloading if user has it)
        llama_server = self.installer.find_llama_server(check_system_first=True)
        if not llama_server:
            logger.error("llama-server not found. Please install llama.cpp first.")
            return False

        # Log whether using system or Nunba installation
        if self.installer.is_system_installation(llama_server):
            logger.info(f"Using existing system llama.cpp installation: {llama_server}")
        else:
            logger.info(f"Using Nunba-managed llama.cpp installation: {llama_server}")

        # Get model from config (set by orchestrator via LlamaLoader or previous run).
        # Model selection is the orchestrator's job (ModelCatalog.select_best + VRAMManager).
        # start_server() only manages the llama-server process.
        if not model_preset:
            idx = self.config.get('selected_model_index', 0)
            if 0 <= idx < len(MODEL_PRESETS):
                model_preset = MODEL_PRESETS[idx]
            else:
                model_preset = MODEL_PRESETS[0]

        if not model_preset:
            logger.error("No model selected")
            return False

        model_path = self.installer.get_model_path(model_preset)
        if not model_path:
            # Model not on disk — try any downloaded model from presets
            logger.warning(f"Model not found: {model_preset.display_name} — scanning for alternatives")
            for i, preset in enumerate(MODEL_PRESETS):
                p = self.installer.get_model_path(preset)
                if p:
                    logger.info(f"Found downloaded model: {preset.display_name}")
                    model_preset = preset
                    model_path = p
                    self.config['selected_model_index'] = i
                    self._save_config()
                    break
            if not model_path:
                logger.error("No downloaded models found. Please download a model first.")
                return False

        # Check version compatibility for the selected model
        if model_preset.min_build is not None:
            is_ok, cur_ver, req_ver = self.installer.check_version_for_model(
                model_preset, llama_server
            )
            if not is_ok:
                logger.error(
                    f"llama.cpp build b{cur_ver} does not support {model_preset.display_name} "
                    f"(requires b{req_ver}+). Please update llama.cpp."
                )
                return False

        # Build command — context size is VRAM-aware for Qwen3.5
        is_qwen35 = "Qwen3.5" in model_preset.display_name
        if is_qwen35:
            # Scale context with available VRAM:
            #   ≥6GB free → 16384 (full multi-turn agent conversations)
            #   ≥4GB free → 8192  (standard conversations)
            #   <4GB free → 4096  (compact, preserves VRAM for TTS/STT)
            # KV cache cost: ~1GB per 8K context for 4B Q4 model
            try:
                from integrations.service_tools.vram_manager import vram_manager
                free_gb = vram_manager.detect_gpu().get('free_gb', 0)
                model_gb = model_preset.size_mb / 1024.0
                remaining = free_gb - model_gb  # VRAM after model loads
                if remaining >= 3:
                    ctx_size = 16384
                elif remaining >= 2.0:
                    ctx_size = 8192
                else:
                    ctx_size = 4096
                logger.info(f"Dynamic context size: {ctx_size} "
                            f"(VRAM free={free_gb:.1f}GB, model={model_gb:.1f}GB, "
                            f"remaining={remaining:.1f}GB)")
            except Exception:
                ctx_size = 8192  # safe default
        else:
            ctx_size = self.config.get("context_size", 4096)

        cmd = [
            llama_server,
            "--model", model_path,
            "--port", str(desired_port),
            "--ctx-size", str(ctx_size),
            "--threads", str(os.cpu_count() or 4),
            "--host", "127.0.0.1",
            "--jinja",  # Model's native Jinja template (respects reasoning-budget)
            "--reasoning-format", "deepseek",  # Extract <think> into reasoning_content, content has clean answer only
            "--reasoning-budget", "0",  # No thinking tokens — fastest inference
        ]

        # Qwen3.5 models need additional flags
        if is_qwen35:
            cmd.extend([
                "--temp", "0.7",
                "--top-k", "20",
                "--top-p", "0.95",
                "--no-context-shift",
            ])

        # Add GPU acceleration (only if binary supports it)
        # Auto-enable use_gpu when binary and hardware both support it
        if (self.installer.binary_supports_gpu and
                self.installer.gpu_available != "none" and
                not self.config.get("use_gpu", False)):
            logger.info("Auto-enabling GPU: binary supports it and GPU is available")
            self.config["use_gpu"] = True
            self._save_config()

        can_use_gpu = (
            self.config.get("use_gpu", False) and
            self.installer.gpu_available != "none" and
            self.installer.binary_supports_gpu
        )

        # Add vision model flags
        if model_preset.has_vision:
            cmd.append("--kv-unified")
            mmproj_path = self.installer.get_mmproj_path(model_preset)
            if mmproj_path:
                cmd.extend(["--mmproj", mmproj_path])
            # CPU-only: keep vision projector on CPU to avoid offload crash
            if not can_use_gpu:
                cmd.append("--no-mmproj-offload")

        if can_use_gpu:
            if self.installer.gpu_available == "cuda":
                cmd.extend(["-ngl", "99"])  # Offload all layers to GPU
                cmd.extend(["--flash-attn", "on"])  # Flash attention for CUDA (b8200+ requires value)
                logger.info("GPU acceleration enabled (CUDA + flash-attn)")
            # Metal (macOS) is automatic, no flags needed
            elif self.installer.gpu_available == "metal":
                logger.info("GPU acceleration enabled (Metal)")
        else:
            if self.config.get("use_gpu", False) and not self.installer.binary_supports_gpu:
                logger.warning("GPU requested but binary doesn't support it - using CPU")
            logger.info("Using CPU-only mode")

        try:
            logger.info(f"Starting server on port {desired_port}: {' '.join(cmd)}")

            # Start the server process
            startupinfo = None
            if sys.platform == 'win32':
                startupinfo = subprocess.STARTUPINFO()
                startupinfo.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                startupinfo.wShowWindow = 0  # SW_HIDE

            # Set cwd to binary dir so DLLs (ggml-cuda.dll, mtmd.dll) are found
            bin_dir = str(Path(llama_server).parent)
            env = os.environ.copy()
            env["PATH"] = bin_dir + os.pathsep + env.get("PATH", "")

            self.server_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,  # Merge stderr into stdout (prevents pipe deadlock)
                text=True,
                bufsize=1,  # Line-buffered for real-time reading
                cwd=bin_dir,
                env=env,
                startupinfo=startupinfo,
                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == 'win32' else 0
            )

            # Wait for server to be ready (matching TrueFlow's approach)
            # Read stdout on each iteration to prevent pipe buffer from filling up
            # and blocking the server process.
            timeout_seconds = 120 if model_preset.has_vision else 60
            start_time = time.time()
            logger.info(f"Waiting for server to start (timeout: {timeout_seconds}s)...")

            while time.time() - start_time < timeout_seconds:
                # Drain server output to prevent pipe deadlock
                if self.server_process.stdout:
                    try:
                        line = self.server_process.stdout.readline()
                        if line:
                            logger.debug(f"llama-server: {line.strip()}")
                    except Exception:
                        pass

                # Check if process died early
                if self.server_process.poll() is not None:
                    logger.error("llama-server process died during startup")
                    # Drain remaining output for diagnostics
                    if self.server_process.stdout:
                        remaining = self.server_process.stdout.read()
                        if remaining:
                            logger.error(f"Server output: {remaining[:2000]}")
                    return False

                # Check health endpoint
                if self.check_server_running(desired_port):
                    elapsed = time.time() - start_time
                    logger.info(f"Server started successfully on port {desired_port} (took {elapsed:.1f}s)")
                    self._write_server_status(True, self.server_process.pid, model_preset.display_name)
                    # Propagate LLM URL to env so HARTOS resolves the correct endpoint
                    self.api_base = f'http://127.0.0.1:{desired_port}/v1'
                    self._propagate_llm_url(self.api_base)
                    # Register VRAM allocation with VRAMManager (shared with TTS, vision)
                    if can_use_gpu:
                        vm = self._get_vram_manager()
                        if vm:
                            model_gb = model_preset.size_mb / 1024.0
                            tool_key = f'llm_{model_preset.display_name.replace(" ", "_").lower()}'
                            vm._allocations[tool_key] = model_gb
                            logger.info(f"VRAM allocation registered: {tool_key} = {model_gb:.1f}GB")
                    # Quick benchmark — warm up the KV cache and measure t/s
                    try:
                        import urllib.request
                        _bench_body = json.dumps({
                            "model": "local",
                            "messages": [{"role": "user", "content": "Count from 1 to 10:"}],
                            "max_tokens": 30, "temperature": 0.1, "stream": False
                        }).encode()
                        _bench_req = urllib.request.Request(
                            f"http://127.0.0.1:{desired_port}/v1/chat/completions",
                            data=_bench_body, method='POST',
                            headers={"Content-Type": "application/json"})
                        _t0 = time.time()
                        with urllib.request.urlopen(_bench_req, timeout=30) as _br:
                            _bench_resp = json.loads(_br.read())
                        _t1 = time.time()
                        _usage = _bench_resp.get("usage", {})
                        _compl_tokens = _usage.get("completion_tokens", 0)
                        _tps = _compl_tokens / max(_t1 - _t0, 0.01)
                        logger.info(f"Quick benchmark: {_compl_tokens} tokens in {_t1 - _t0:.1f}s = {_tps:.1f} t/s ({model_preset.display_name}, {'GPU' if can_use_gpu else 'CPU'})")
                    except Exception as _bench_err:
                        logger.debug(f"Quick benchmark skipped: {_bench_err}")
                    return True

                # Log progress every 10 seconds
                elapsed = time.time() - start_time
                if int(elapsed) % 10 == 0 and int(elapsed) > 0 and elapsed - int(elapsed) < 0.6:
                    logger.info(f"Still waiting for server... ({int(elapsed)}s/{timeout_seconds}s)")

                time.sleep(0.5)

            logger.error(f"Server failed to start within timeout ({timeout_seconds}s)")
            logger.error("Run 'python test_server_debug.py' to see server output")
            self.stop_server()
            return False

        except Exception as e:
            logger.error(f"Failed to start server: {e}")
            return False

    def stop_server(self):
        """Stop the llama.cpp server and release VRAM allocation."""
        if self.server_process:
            try:
                self.server_process.terminate()
                self.server_process.wait(timeout=5)
                logger.info("Server stopped")
            except Exception as e:
                logger.error(f"Failed to stop server gracefully: {e}")
                try:
                    self.server_process.kill()
                except Exception:
                    pass
            finally:
                self.server_process = None
                self._write_server_status(False)
                # Release VRAM allocation so TTS/vision can reclaim the space
                vm = self._get_vram_manager()
                if vm:
                    released = [k for k in list(vm._allocations) if k.startswith('llm_')]
                    for k in released:
                        freed = vm._allocations.pop(k, 0)
                        if freed:
                            logger.info(f"Released VRAM allocation: {k} = {freed:.1f}GB")

    def switch_model(self, model_index: int) -> bool:
        """
        Switch to a different model at runtime. Stops current server and restarts.

        Args:
            model_index: Index into MODEL_PRESETS (0-5)

        Returns:
            True if server restarted successfully with new model
        """
        if model_index < 0 or model_index >= len(MODEL_PRESETS):
            logger.error(f"Invalid model index: {model_index}. Valid: 0-{len(MODEL_PRESETS)-1}")
            return False

        preset = MODEL_PRESETS[model_index]
        model_path = self.installer.get_model_path(preset)
        if not model_path:
            logger.error(f"Model not downloaded: {preset.display_name}")
            return False

        logger.info(f"Switching to model: {preset.display_name}")
        self.stop_server()

        # Update config
        self.config["selected_model_index"] = model_index
        self._save_config()

        return self.start_server(model_preset=preset)

    def get_current_model_name(self) -> str:
        """Get the display name of the currently selected model."""
        preset = self.get_selected_model_preset()
        return preset.display_name if preset else "unknown"

    def chat_completion(self, messages: list[dict], temperature: float = 0.7,
                       max_tokens: int = 1000) -> str | None:
        """
        Send a chat completion request to the server

        Args:
            messages: List of message dicts with 'role' and 'content'
            temperature: Sampling temperature
            max_tokens: Maximum tokens to generate

        Returns:
            Generated text or None if failed
        """
        if not self.check_server_running():
            logger.error("Server is not running")
            return None

        try:
            response = requests.post(
                f"{self.api_base}/chat/completions",
                json={
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
                timeout=60
            )

            if response.status_code == 200:
                data = response.json()
                return data.get("choices", [{}])[0].get("message", {}).get("content")
            else:
                logger.error(f"Chat completion failed: {response.status_code} - {response.text}")
                return None

        except Exception as e:
            logger.error(f"Chat completion error: {e}")
            return None


def initialize_llama_on_first_run(progress_callback=None, force_install=False) -> bool:
    """
    Check AI configuration at runtime.

    At install time, --setup-ai handles scanning and user consent for downloads.
    At runtime, this function:
    1. If already configured (first_run=False): return True
    2. If not configured: scan for endpoints (no downloads without consent)
    3. If endpoint found: auto-configure and use it
    4. If nothing found: return False (AI unavailable)

    Args:
        progress_callback: Optional callback for progress updates
        force_install: If True, install llama.cpp (only use with explicit user consent)

    Returns:
        True if AI is available, False otherwise
    """
    config = LlamaConfig()

    # Check if already configured
    if not config.is_first_run():
        logger.info("AI already configured, skipping initialization")
        return True

    # Check if external endpoint is already configured
    if config.config.get("use_external_llm") and config.config.get("external_llm_endpoint"):
        logger.info("External LLM endpoint configured")
        return True

    # Check if local llama is already installed
    installer = LlamaInstaller()
    if installer.find_llama_server():
        logger.info("Local llama.cpp already installed")
        config.mark_first_run_complete()
        return True

    logger.info("First run - scanning for AI services...")

    if progress_callback:
        progress_callback("Scanning for AI services...")

    # Scan for existing LLM endpoints (no downloads at runtime without consent)
    existing_endpoint = scan_existing_llm_endpoints()
    if not existing_endpoint:
        existing_endpoint = scan_openai_compatible_ports()

    if existing_endpoint:
        logger.info(f"Found existing LLM endpoint: {existing_endpoint['name']}")
        if progress_callback:
            progress_callback(f"Found: {existing_endpoint['name']}")

        # Auto-configure the found endpoint
        config.config["external_llm_endpoint"] = existing_endpoint
        config.config["use_external_llm"] = True
        config.mark_first_run_complete()
        config._save_config()

        logger.info(f"Auto-configured external LLM: {existing_endpoint['base_url']}")
        return True

    # No existing endpoints found
    logger.info("No AI services found. AI features will be unavailable.")
    if progress_callback:
        progress_callback("No AI services found")

    # Only install if explicitly requested (with user consent)
    if force_install:
        logger.info("Force install requested - installing Llama.cpp...")
        if progress_callback:
            progress_callback("Installing local AI...")

        def install_progress(msg):
            logger.info(msg)
            if progress_callback:
                progress_callback(msg)

        if not installer.install_llama_cpp(install_progress):
            logger.error("Failed to install llama.cpp")
            return False

        # Update GPU config based on what was actually installed
        if installer.binary_supports_gpu:
            logger.info("Enabling GPU acceleration (binary supports it)")
            config.config["use_gpu"] = True
        else:
            logger.info("GPU acceleration disabled (binary is CPU-only)")
            config.config["use_gpu"] = False

        # Clear any external LLM settings since we're using local
        config.config["use_external_llm"] = False
        config.config.pop("external_llm_endpoint", None)
        config._save_config()

        # Download default model
        preset = MODEL_PRESETS[config.config.get("selected_model_index", 0)]

        if installer.is_model_downloaded(preset):
            logger.info(f"Model already downloaded: {preset.display_name}")
            config.mark_first_run_complete()
            return True

        def download_progress(downloaded_mb, total_mb, status):
            logger.info(status)
            if progress_callback:
                progress_callback(status)

        if installer.download_model(preset, download_progress):
            logger.info(f"Model downloaded successfully: {preset.display_name}")
            config.mark_first_run_complete()
            return True
        else:
            logger.error("Failed to download model")
            return False

    # No AI available (user skipped setup and no external endpoints found)
    return False


def get_active_llm_endpoint() -> dict | None:
    """
    Get the currently active LLM endpoint (external or local).

    Returns:
        Dict with endpoint info: {"name", "base_url", "completions", "type"}
        or None if no endpoint is configured/available
    """
    config = LlamaConfig()

    # Check if using external endpoint
    if config.config.get("use_external_llm") and config.config.get("external_llm_endpoint"):
        endpoint = config.config["external_llm_endpoint"]

        # Verify it's still available
        try:
            health_url = endpoint["base_url"] + "/v1/models"
            # For Ollama, use different endpoint
            if endpoint.get("type") == "ollama":
                health_url = endpoint["base_url"] + "/api/tags"

            response = requests.get(health_url, timeout=2)
            if response.status_code == 200:
                return endpoint
        except Exception:
            pass

        # External endpoint not available, fall back to local
        logger.warning(f"External endpoint {endpoint['name']} not available")

    # Use local llama.cpp endpoint
    port = config.config.get("server_port", 8080)
    return {
        "name": "Nunba Local AI",
        "base_url": f"http://localhost:{port}",
        "completions": f"http://localhost:{port}/v1/completions",
        "type": "openai"
    }


_cached_config = None

def _get_cached_config():
    """Return a module-level LlamaConfig singleton to avoid repeated GPU detection."""
    global _cached_config
    if _cached_config is None:
        _cached_config = LlamaConfig()
    return _cached_config


def check_llama_health() -> bool:
    """
    Check if llama.cpp server is running and healthy.

    Returns:
        True if llama.cpp server is available and responding, False otherwise
    """
    config = _get_cached_config()
    port = config.config.get("server_port", 8080)

    try:
        response = requests.get(f"http://localhost:{port}/health", timeout=2)
        if response.status_code == 200:
            return True
        # Also check /v1/models as fallback
        response = requests.get(f"http://localhost:{port}/v1/models", timeout=2)
        return response.status_code == 200
    except Exception:
        return False


def get_llama_endpoint() -> str:
    """
    Get the base URL for the llama.cpp server.

    Returns:
        Base URL string like "http://localhost:8080"
    """
    config = _get_cached_config()
    port = config.config.get("server_port", 8080)
    return f"http://localhost:{port}"


def get_llama_info() -> dict:
    """
    Get information about the running llama.cpp server.

    Returns:
        Dict with server info or empty dict if not running
    """
    if not check_llama_health():
        return {}

    config = _get_cached_config()
    port = config.config.get("server_port", 8080)

    try:
        response = requests.get(f"http://localhost:{port}/v1/models", timeout=2)
        if response.status_code == 200:
            data = response.json()
            models = data.get("models", data.get("data", []))
            return {
                "running": True,
                "port": port,
                "models": models,
                "endpoint": f"http://localhost:{port}"
            }
    except Exception:
        pass

    return {"running": True, "port": port, "endpoint": f"http://localhost:{port}"}


if __name__ == "__main__":
    # Test configuration and server
    logging.basicConfig(level=logging.INFO)

    def progress(msg):
        print(f"[Progress] {msg}")

    # Initialize on first run
    if initialize_llama_on_first_run(progress):
        print("Initialization successful!")

        # Try to start server
        config = LlamaConfig()
        if config.start_server():
            print("Server started successfully!")

            # Test chat completion
            response = config.chat_completion([
                {"role": "user", "content": "Hello! Say hi in one sentence."}
            ])
            print(f"AI Response: {response}")

            config.stop_server()
        else:
            print("Failed to start server")
    else:
        print("Initialization failed")
