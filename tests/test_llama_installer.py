"""
test_llama_installer.py - Test script for Llama.cpp installer

This script can be used to test the installation process without running the full Nunba app.

Usage:
    python test_llama_installer.py [--install] [--download-model] [--start-server] [--chat]

Options:
    --install        Install Llama.cpp
    --download-model Download the default model
    --start-server   Start the Llama.cpp server
    --chat           Test chat completion (requires server to be running)
    --all            Do all of the above
"""

import argparse
import logging
import sys
import time

from llama.llama_config import LlamaConfig
from llama.llama_installer import MODEL_PRESETS, LlamaInstaller, install_on_first_run

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger('TestLlamaInstaller')


def progress_callback(msg):
    """Progress callback that prints messages"""
    print(f"[Progress] {msg}")


def test_installation():
    """Test Llama.cpp installation"""
    print("\n=== Testing Llama.cpp Installation ===\n")

    installer = LlamaInstaller()

    # Check if already installed
    if installer.is_installed():
        print(f"✓ Llama.cpp is already installed at: {installer.find_llama_server()}")
        return True
    else:
        print("✗ Llama.cpp not found, installing...")

    # Install
    success = installer.install_llama_cpp(progress_callback)

    if success:
        print("\n✓ Installation successful!")
        print(f"  Location: {installer.find_llama_server()}")
        print(f"  GPU Support: {installer.gpu_available}")
        return True
    else:
        print("\n✗ Installation failed!")
        return False


def test_model_download():
    """Test model downloading"""
    print("\n=== Testing Model Download ===\n")

    installer = LlamaInstaller()
    preset = MODEL_PRESETS[0]  # Default recommended model

    print(f"Model: {preset.display_name}")
    print(f"Size: {preset.size_mb}MB")
    print(f"Features: {'Vision + Text' if preset.has_vision else 'Text-only'}")

    # Check if already downloaded
    if installer.is_model_downloaded(preset):
        print("\n✓ Model is already downloaded")
        print(f"  Path: {installer.get_model_path(preset)}")
        if preset.has_vision and preset.mmproj_file:
            print(f"  Vision projector: {installer.get_mmproj_path(preset)}")
        return True
    else:
        print("\nDownloading model...")

    # Download
    def download_progress(downloaded_mb, total_mb, status):
        pct = int(downloaded_mb / total_mb * 100) if total_mb > 0 else 0
        print(f"\r[Progress] {status} ({pct}%)", end='', flush=True)

    success = installer.download_model(preset, download_progress)
    print()  # New line after progress

    if success:
        print("\n✓ Download successful!")
        print(f"  Path: {installer.get_model_path(preset)}")
        return True
    else:
        print("\n✗ Download failed!")
        return False


def test_server_start():
    """Test starting the Llama.cpp server"""
    print("\n=== Testing Server Start ===\n")

    config = LlamaConfig()
    preset = config.get_selected_model_preset()

    if not preset:
        print("✗ No model selected")
        return False

    print(f"Starting server with model: {preset.display_name}")
    print("This may take 10-30 seconds...")

    success = config.start_server()

    if success:
        print("\n✓ Server started successfully!")
        print(f"  Port: {config.config.get('server_port', 8080)}")
        print(f"  GPU: {'Enabled' if config.config.get('use_gpu') else 'Disabled'}")
        return True
    else:
        print("\n✗ Server failed to start!")
        return False


def test_chat():
    """Test chat completion"""
    print("\n=== Testing Chat Completion ===\n")

    config = LlamaConfig()

    if not config.check_server_running():
        print("✗ Server is not running. Start it first with --start-server")
        return False

    print("Sending chat request...")

    messages = [
        {"role": "system", "content": "You are a helpful AI assistant."},
        {"role": "user", "content": "Hello! Please respond with a short greeting (one sentence)."}
    ]

    response = config.chat_completion(messages, temperature=0.7, max_tokens=100)

    if response:
        print("\n✓ Chat completion successful!\n")
        print(f"AI Response: {response}\n")
        return True
    else:
        print("\n✗ Chat completion failed!")
        return False


def test_first_run():
    """Test the complete first-run initialization (interactive — skip under pytest)."""
    import os
    if os.environ.get("PYTEST_CURRENT_TEST") or "pytest" in sys.modules:
        import pytest
        pytest.skip("Interactive test — requires manual execution with -s flag")

    print("\n=== Testing First-Run Initialization ===\n")

    print("This will:")
    print("1. Install Llama.cpp (if not already installed)")
    print("2. Download the default model (if not already downloaded)")
    print("\nThis may take several minutes...")

    input("\nPress Enter to continue or Ctrl+C to cancel...")

    success, model_path = install_on_first_run(progress_callback=progress_callback)

    if success:
        print("\n✓ First-run initialization successful!")
        print(f"  Model path: {model_path}")
        return True
    else:
        print("\n✗ First-run initialization failed!")
        return False


def cleanup_server():
    """Stop the server if it's running"""
    config = LlamaConfig()
    if config.check_server_running():
        print("\nStopping server...")
        config.stop_server()
        print("Server stopped")


def main():
    parser = argparse.ArgumentParser(description='Test Llama.cpp installer')
    parser.add_argument('--install', action='store_true', help='Test installation')
    parser.add_argument('--download-model', action='store_true', help='Test model download')
    parser.add_argument('--start-server', action='store_true', help='Test server start')
    parser.add_argument('--chat', action='store_true', help='Test chat completion')
    parser.add_argument('--all', action='store_true', help='Run all tests')
    parser.add_argument('--first-run', action='store_true', help='Test first-run initialization')

    args = parser.parse_args()

    # If no arguments, show help
    if not (args.install or args.download_model or args.start_server or args.chat or args.all or args.first_run):
        parser.print_help()
        return

    try:
        if args.first_run:
            test_first_run()
            return

        results = []

        if args.all or args.install:
            results.append(("Installation", test_installation()))

        if args.all or args.download_model:
            results.append(("Model Download", test_model_download()))

        if args.all or args.start_server:
            results.append(("Server Start", test_server_start()))
            # Give server time to fully start
            if results[-1][1]:
                print("\nWaiting for server to fully initialize...")
                time.sleep(3)

        if args.all or args.chat:
            results.append(("Chat Completion", test_chat()))

        # Print summary
        print("\n" + "="*50)
        print("SUMMARY")
        print("="*50)

        for name, success in results:
            status = "✓ PASS" if success else "✗ FAIL"
            print(f"{name:20} {status}")

        print("="*50)

    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
    finally:
        # Clean up
        if args.start_server or args.all:
            cleanup_server()


if __name__ == "__main__":
    main()
