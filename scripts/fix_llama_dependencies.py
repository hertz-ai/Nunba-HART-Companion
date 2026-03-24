"""
fix_llama_dependencies.py - Fix missing DLL dependencies for llama.cpp

This script helps diagnose and fix DLL dependency issues with llama-server.exe
"""

import os
import subprocess
import sys
import tempfile
import urllib.request
from pathlib import Path


def check_vcredist_installed():
    """Check if Visual C++ Redistributable is installed"""
    try:
        # Check registry for VC++ Redistributable
        import winreg

        keys_to_check = [
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\X64"),
            (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Microsoft\VisualStudio\14.0\VC\Runtimes\x64"),
        ]

        for hkey, subkey in keys_to_check:
            try:
                key = winreg.OpenKey(hkey, subkey)
                version, _ = winreg.QueryValueEx(key, "Version")
                winreg.CloseKey(key)
                print(f"✓ Found Visual C++ Redistributable: {version}")
                return True
            except OSError:
                continue

        print("✗ Visual C++ Redistributable not found")
        return False

    except Exception as e:
        print(f"⚠ Could not check registry: {e}")
        return None

def download_and_install_vcredist():
    """Download and install Visual C++ Redistributable"""
    print("\n" + "="*60)
    print("Installing Visual C++ Redistributable")
    print("="*60)

    url = "https://aka.ms/vs/17/release/vc_redist.x64.exe"

    print(f"\nDownloading from: {url}")
    print("This may take a minute...")

    try:
        # Download to temp directory
        temp_dir = tempfile.gettempdir()
        installer_path = os.path.join(temp_dir, "vc_redist.x64.exe")

        urllib.request.urlretrieve(url, installer_path)
        print(f"✓ Downloaded to: {installer_path}")

        print("\nRunning installer...")
        print("Please follow the installation prompts.")

        # Run installer with elevated privileges
        result = subprocess.run(
            [installer_path, "/install", "/passive", "/norestart"],
            capture_output=True
        )

        if result.returncode == 0:
            print("✓ Installation completed successfully!")
            print("\nPlease restart your terminal and try again.")
            return True
        else:
            print(f"⚠ Installer returned code: {result.returncode}")
            print("You may need to run the installer manually.")
            print(f"Location: {installer_path}")
            return False

    except Exception as e:
        print(f"✗ Error: {e}")
        print("\nPlease download and install manually from:")
        print("https://aka.ms/vs/17/release/vc_redist.x64.exe")
        return False

def check_llama_server():
    """Check if llama-server can run"""
    llama_server = Path.home() / ".nunba" / "llama.cpp" / "build" / "bin" / "Release" / "llama-server.exe"

    if not llama_server.exists():
        print(f"✗ llama-server not found at: {llama_server}")
        return False

    print(f"Testing llama-server: {llama_server}")

    try:
        # Try to run with --version
        result = subprocess.run(
            [str(llama_server), "--version"],
            capture_output=True,
            timeout=5
        )

        if result.returncode == 0:
            print("✓ llama-server runs successfully!")
            output = result.stdout.decode('utf-8', errors='ignore')
            print(f"Output: {output[:200]}")
            return True
        else:
            print(f"✗ llama-server failed with exit code: {result.returncode}")
            stderr = result.stderr.decode('utf-8', errors='ignore')
            if stderr:
                print(f"Error: {stderr[:500]}")
            return False

    except FileNotFoundError as e:
        print(f"✗ File not found: {e}")
        return False
    except subprocess.TimeoutExpired:
        print("✗ llama-server timed out")
        return False
    except Exception as e:
        print(f"✗ Error running llama-server: {e}")
        return False

def try_fix_dependencies():
    """Try to fix missing dependencies"""

    print("\n" + "="*60)
    print("Llama.cpp Dependency Fixer")
    print("="*60)

    print("\nStep 1: Checking Visual C++ Redistributable...")
    vcredist_installed = check_vcredist_installed()

    print("\nStep 2: Testing llama-server...")
    server_works = check_llama_server()

    if server_works:
        print("\n" + "="*60)
        print("✓ Everything is working!")
        print("="*60)
        return True

    if vcredist_installed is False:
        print("\n" + "="*60)
        print("Visual C++ Redistributable is missing")
        print("="*60)

        response = input("\nWould you like to download and install it now? (y/n): ")
        if response.lower() in ['y', 'yes']:
            if download_and_install_vcredist():
                print("\n✓ Please restart your terminal and run this script again")
                return True
        else:
            print("\nPlease install manually from:")
            print("https://aka.ms/vs/17/release/vc_redist.x64.exe")
            return False
    else:
        print("\n" + "="*60)
        print("Visual C++ Redistributable appears to be installed")
        print("but llama-server still doesn't work")
        print("="*60)

        print("\nPossible solutions:")
        print("1. Try restarting your computer")
        print("2. Reinstall Visual C++ Redistributable")
        print("3. Try building llama.cpp from source")
        print("4. Check Windows Event Viewer for detailed error")

        print("\nTo check Event Viewer:")
        print("1. Press Win+X and select 'Event Viewer'")
        print("2. Go to Windows Logs > Application")
        print("3. Look for recent errors from 'Application Error'")

        return False

if __name__ == "__main__":
    try:
        success = try_fix_dependencies()
        sys.exit(0 if success else 1)
    except KeyboardInterrupt:
        print("\n\nCancelled by user")
        sys.exit(1)
