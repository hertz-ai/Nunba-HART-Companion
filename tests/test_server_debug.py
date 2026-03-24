"""
test_server_debug.py - Debug server startup issues

This script shows the actual server output to help diagnose startup failures.
"""

import subprocess
import sys
import time
from pathlib import Path

import requests


def test_server_manual():
    """Test server startup with visible output"""

    # Paths
    llama_server = Path.home() / ".nunba" / "llama.cpp" / "build" / "bin" / "Release" / "llama-server.exe"
    model_path = Path.home() / ".nunba" / "models" / "Qwen3-VL-2B-Instruct-UD-Q4_K_XL.gguf"
    mmproj_path = Path.home() / ".nunba" / "models" / "mmproj-F16.gguf"

    # Check files exist
    if not llama_server.exists():
        print(f"✗ llama-server not found at: {llama_server}")
        return False

    if not model_path.exists():
        print(f"✗ Model not found at: {model_path}")
        return False

    print(f"✓ llama-server found: {llama_server}")
    print(f"✓ Model found: {model_path}")

    if mmproj_path.exists():
        print(f"✓ Vision projector found: {mmproj_path}")
        use_vision = True
    else:
        print("✗ Vision projector not found, using text-only mode")
        use_vision = False

    # Build command
    cmd = [
        str(llama_server),
        "--model", str(model_path),
        "--port", "8080",
        "--ctx-size", "4096",
        "--threads", "16",
        "--host", "127.0.0.1",
        "--jinja"
    ]

    # Add vision flags if available
    if use_vision:
        cmd.extend(["--kv-unified", "--mmproj", str(mmproj_path)])

    print("\n" + "="*60)
    print("Starting server with command:")
    print(" ".join(cmd))
    print("="*60 + "\n")

    print("Server output:")
    print("-"*60)

    try:
        # Start server with output visible
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )

        # Monitor output and check for readiness
        start_time = time.time()
        timeout = 120  # 2 minutes for vision model
        server_ready = False

        while True:
            # Check timeout
            if time.time() - start_time > timeout:
                print("\n" + "="*60)
                print(f"✗ Server did not start within {timeout} seconds")
                print("="*60)
                process.terminate()
                return False

            # Read output line by line
            line = process.stdout.readline()
            if line:
                print(line.rstrip())

                # Check for ready signals
                if "HTTP server listening" in line or "server is listening" in line.lower():
                    server_ready = True
                    break

            # Check if process died
            if process.poll() is not None:
                print("\n" + "="*60)
                print("✗ Server process terminated unexpectedly")
                print(f"Exit code: {process.returncode}")
                print("="*60)
                return False

            # Small delay to prevent CPU spinning
            time.sleep(0.1)

        print("-"*60)
        print(f"✓ Server appears to be starting (after {time.time() - start_time:.1f}s)")

        # Give it a bit more time to fully initialize
        print("\nWaiting for HTTP endpoints to be ready...")
        for i in range(30):
            try:
                response = requests.get("http://localhost:8080/health", timeout=1)
                if response.status_code == 200:
                    print(f"✓ Server is ready! (after {time.time() - start_time:.1f}s total)")
                    print("\n" + "="*60)
                    print("Server is running successfully!")
                    print("Press Ctrl+C to stop the server")
                    print("="*60)

                    # Keep server running
                    try:
                        process.wait()
                    except KeyboardInterrupt:
                        print("\nStopping server...")
                        process.terminate()
                        process.wait(timeout=5)

                    return True
            except Exception:
                pass

            time.sleep(1)

        print("✗ Server started but HTTP endpoints not responding")
        process.terminate()
        return False

    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
        if process:
            process.terminate()
        return False
    except Exception as e:
        print(f"\n✗ Error: {e}")
        if process:
            process.terminate()
        return False


def test_simple_model():
    """Test with a simpler model setup (no vision)"""
    print("\n" + "="*60)
    print("Testing with simplified configuration (no vision)")
    print("="*60 + "\n")

    llama_server = Path.home() / ".nunba" / "llama.cpp" / "build" / "bin" / "Release" / "llama-server.exe"
    model_path = Path.home() / ".nunba" / "models" / "Qwen3-VL-2B-Instruct-UD-Q4_K_XL.gguf"

    if not llama_server.exists() or not model_path.exists():
        print("Required files not found")
        return False

    # Simpler command without vision flags
    cmd = [
        str(llama_server),
        "--model", str(model_path),
        "--port", "8080",
        "--ctx-size", "2048",  # Smaller context
        "--threads", "8",       # Fewer threads
        "--host", "127.0.0.1"
    ]

    print("Command:", " ".join(cmd))
    print("\nServer output:")
    print("-"*60)

    try:
        process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            universal_newlines=True,
            bufsize=1
        )

        start_time = time.time()

        while time.time() - start_time < 120:
            line = process.stdout.readline()
            if line:
                print(line.rstrip())
                if "HTTP server listening" in line or "server is listening" in line.lower():
                    print("-"*60)
                    print(f"✓ Server started! (after {time.time() - start_time:.1f}s)")

                    # Test it
                    time.sleep(2)
                    try:
                        response = requests.get("http://localhost:8080/health", timeout=2)
                        print(f"✓ Health check: {response.status_code}")

                        print("\nPress Ctrl+C to stop...")
                        process.wait()
                        return True
                    except KeyboardInterrupt:
                        process.terminate()
                        return True

            if process.poll() is not None:
                print(f"\n✗ Process died with exit code: {process.returncode}")
                return False

        print("\n✗ Timeout")
        process.terminate()
        return False

    except KeyboardInterrupt:
        print("\nStopped by user")
        process.terminate()
        return True
    except Exception as e:
        print(f"\n✗ Error: {e}")
        if process:
            process.terminate()
        return False


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser()
    parser.add_argument('--simple', action='store_true', help='Test with simplified config (no vision)')
    args = parser.parse_args()

    if args.simple:
        success = test_simple_model()
    else:
        success = test_server_manual()

    sys.exit(0 if success else 1)
