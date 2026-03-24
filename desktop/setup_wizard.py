#!/usr/bin/env python3
"""
setup_wizard.py - Interactive setup wizard for Nunba build configuration

Automatically runs during build to configure:
- Sentry crash reporting DSN
- App version
- Other build-time settings

Usage:
    python setup_wizard.py           # Interactive mode
    python setup_wizard.py --check   # Check if configuration is needed
    python setup_wizard.py --skip    # Skip wizard (use defaults)
"""

import json
import re
import sys
import webbrowser
from pathlib import Path


# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    WARNING = '\033[93m'
    FAIL = '\033[91m'
    END = '\033[0m'
    BOLD = '\033[1m'

def color(text, c):
    """Apply color to text (works on most terminals)"""
    if sys.platform == 'win32':
        # Enable ANSI on Windows
        try:
            import ctypes
            kernel32 = ctypes.windll.kernel32
            kernel32.SetConsoleMode(kernel32.GetStdHandle(-11), 7)
        except Exception:
            return text  # No color support
    return f"{c}{text}{Colors.END}"

# Configuration file paths
SCRIPT_DIR = Path(__file__).parent
CONFIG_PY = SCRIPT_DIR / "config.py"
CONFIG_JSON = SCRIPT_DIR / "landing-page" / "src" / "components" / "config.json"

# Placeholder DSN pattern
PLACEHOLDER_PATTERN = r'b5e7f8c9d1234567890abcdef1234567|your-key|your-project-id'

def print_banner():
    """Print setup wizard banner"""
    banner = """
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║     ███╗   ██╗██╗   ██╗███╗   ██╗██████╗  █████╗              ║
║     ████╗  ██║██║   ██║████╗  ██║██╔══██╗██╔══██╗             ║
║     ██╔██╗ ██║██║   ██║██╔██╗ ██║██████╔╝███████║             ║
║     ██║╚██╗██║██║   ██║██║╚██╗██║██╔══██╗██╔══██║             ║
║     ██║ ╚████║╚██████╔╝██║ ╚████║██████╔╝██║  ██║             ║
║     ╚═╝  ╚═══╝ ╚═════╝ ╚═╝  ╚═══╝╚═════╝ ╚═╝  ╚═╝             ║
║                                                               ║
║              Build Configuration Wizard                       ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝
"""
    try:
        print(color(banner, Colors.CYAN))
    except UnicodeEncodeError:
        print("=== NUNBA Build Configuration Wizard ===")

def is_dsn_configured():
    """Check if Sentry DSN is properly configured"""
    try:
        # Check Python config
        if CONFIG_PY.exists():
            content = CONFIG_PY.read_text()
            if re.search(PLACEHOLDER_PATTERN, content):
                return False

        # Check JSON config
        if CONFIG_JSON.exists():
            data = json.loads(CONFIG_JSON.read_text())
            dsn = data.get('SENTRY_DSN', '')
            if re.search(PLACEHOLDER_PATTERN, dsn):
                return False

        return True
    except Exception:
        return False

def validate_dsn(dsn):
    """Validate Sentry DSN format"""
    # DSN format: https://key@org.ingest.sentry.io/project_id
    pattern = r'^https://[a-f0-9]+@[a-z0-9]+\.ingest\.(us\.|de\.|)?sentry\.io/\d+$'
    return bool(re.match(pattern, dsn.strip()))

def update_python_config(dsn):
    """Update config.py with the new DSN"""
    if not CONFIG_PY.exists():
        print(color(f"  Warning: {CONFIG_PY} not found", Colors.WARNING))
        return False

    content = CONFIG_PY.read_text()

    # Replace the DSN line
    new_content = re.sub(
        r"SENTRY_DSN = os\.environ\.get\(\s*'SENTRY_DSN',\s*'[^']*'\s*\)",
        f"SENTRY_DSN = os.environ.get(\n    'SENTRY_DSN',\n    '{dsn}'\n)",
        content
    )

    CONFIG_PY.write_text(new_content)
    print(color(f"  ✓ Updated {CONFIG_PY.name}", Colors.GREEN))
    return True

def update_json_config(dsn):
    """Update config.json with the new DSN"""
    if not CONFIG_JSON.exists():
        print(color(f"  Warning: {CONFIG_JSON} not found", Colors.WARNING))
        return False

    data = json.loads(CONFIG_JSON.read_text())
    data['SENTRY_DSN'] = dsn

    CONFIG_JSON.write_text(json.dumps(data, indent=2))
    print(color(f"  ✓ Updated {CONFIG_JSON.name}", Colors.GREEN))
    return True

def disable_crash_reporting():
    """Disable crash reporting in configs"""
    # Update Python config
    if CONFIG_PY.exists():
        content = CONFIG_PY.read_text()
        content = content.replace(
            "CRASH_REPORTING_ENABLED = os.environ.get('NUNBA_CRASH_REPORTING', 'true')",
            "CRASH_REPORTING_ENABLED = os.environ.get('NUNBA_CRASH_REPORTING', 'false')"
        )
        CONFIG_PY.write_text(content)
        print(color("   Disabled crash reporting in config.py", Colors.GREEN))

    return True

def open_sentry_signup():
    """Open Sentry signup page in browser"""
    url = "https://sentry.io/signup/"
    print(f"\n  Opening {url} in your browser...")
    try:
        webbrowser.open(url)
        return True
    except Exception as e:
        print(color(f"  Could not open browser: {e}", Colors.WARNING))
        print(f"  Please visit: {url}")
        return False

def prompt_dsn():
    """Prompt user for Sentry DSN"""
    print(color("\n  Enter your Sentry DSN:", Colors.BOLD))
    print("  (Format: https://key@org.ingest.sentry.io/project_id)")
    print()

    while True:
        try:
            dsn = input(color("  DSN: ", Colors.CYAN)).strip()
        except (EOFError, KeyboardInterrupt):
            print("\n")
            return None

        if not dsn:
            return None

        if validate_dsn(dsn):
            return dsn
        else:
            print(color("  Invalid DSN format. Please try again.", Colors.WARNING))
            print("  Example: https://abc123@o456789.ingest.us.sentry.io/1234567")
            print()

def _input_with_timeout(prompt, timeout=8, default="3"):
    """Read input with a timeout. Returns default if no input within timeout seconds.

    Non-interactive stdin (piped/redirected) → immediate default.
    Interactive → print prompt on main thread, read on background thread with timeout.
    """
    import threading

    # Non-interactive stdin → skip immediately (build scripts, piped input)
    try:
        if not sys.stdin or sys.stdin.closed or not sys.stdin.isatty():
            print(prompt + default)
            print(f"  (Non-interactive terminal — auto-selecting option {default})")
            return default
    except Exception:
        return default

    # Print prompt from main thread (avoids thread-vs-stdout contention)
    sys.stdout.write(prompt)
    sys.stdout.flush()

    result = [None]

    def _reader():
        try:
            result[0] = sys.stdin.readline()
        except (EOFError, OSError, ValueError):
            pass

    t = threading.Thread(target=_reader, daemon=True)
    t.start()
    t.join(timeout)

    if result[0] is not None:
        val = result[0].strip()
        print()  # newline after user input
        return val or default

    # Unblock the reader thread by closing stdin so Python doesn't crash at shutdown
    try:
        sys.stdin.close()
    except Exception:
        pass
    t.join(2)

    print(f"\n  (No input after {timeout}s — auto-selecting option {default})")
    return default


def run_wizard():
    """Run the interactive setup wizard"""
    print_banner()

    # Check if already configured
    if is_dsn_configured():
        print(color("  ✓ Sentry crash reporting is already configured!", Colors.GREEN))
        print()
        return True

    print(color("  Crash reporting is not configured.", Colors.WARNING))
    print()
    print("  Crash reporting helps you find and fix bugs by automatically")
    print("  sending error reports when something goes wrong.")
    print()
    print(color("  Options:", Colors.BOLD))
    print("    [1] Enter existing Sentry DSN")
    print("    [2] Create new Sentry account (free - 5K errors/month)")
    print("    [3] Skip crash reporting")
    print()
    print(color("  (Auto-skips in 8 seconds if no choice is made)", Colors.WARNING))
    print()

    while True:
        try:
            choice = _input_with_timeout(color("  Choose option (1-3): ", Colors.CYAN), timeout=8, default="3")
        except (EOFError, KeyboardInterrupt):
            print("\n")
            choice = "3"

        if choice == "1":
            dsn = prompt_dsn()
            if dsn:
                print()
                print(color("  Updating configuration...", Colors.BLUE))
                update_python_config(dsn)
                update_json_config(dsn)
                print()
                print(color("  ✓ Crash reporting configured successfully!", Colors.GREEN))
                print("  Dashboard: https://sentry.io")
                print()
                return True
            else:
                print(color("  Skipped.", Colors.WARNING))
                print()
                continue

        elif choice == "2":
            open_sentry_signup()
            print()
            print("  After creating your account and project:")
            print("  1. Go to Settings > Projects > [Your Project] > Client Keys (DSN)")
            print("  2. Copy the DSN")
            print()
            dsn = prompt_dsn()
            if dsn:
                print()
                print(color("  Updating configuration...", Colors.BLUE))
                update_python_config(dsn)
                update_json_config(dsn)
                print()
                print(color("  ✓ Crash reporting configured successfully!", Colors.GREEN))
                print()
                return True
            else:
                print(color("  Skipped.", Colors.WARNING))
                print()
                continue

        elif choice == "3":
            print()
            print(color("  Skipping crash reporting setup.", Colors.WARNING))
            print("  You can configure it later by running: python setup_wizard.py")
            print()
            disable_crash_reporting()
            print()
            return False

        else:
            print(color("  Invalid choice. Please enter 1, 2, or 3.", Colors.WARNING))

def check_only():
    """Check if configuration is needed (for build scripts)"""
    if is_dsn_configured():
        print("configured")
        return 0
    else:
        print("not_configured")
        return 1

def main():
    """Main entry point"""
    import argparse

    parser = argparse.ArgumentParser(description="Nunba Build Configuration Wizard")
    parser.add_argument("--check", action="store_true", help="Check if configuration is needed")
    parser.add_argument("--skip", action="store_true", help="Skip wizard (use defaults)")
    parser.add_argument("--dsn", type=str, help="Set DSN directly (non-interactive)")
    args = parser.parse_args()

    if args.check:
        return check_only()

    if args.skip:
        print("Skipping setup wizard (using defaults)")
        return 0

    if args.dsn:
        if validate_dsn(args.dsn):
            print("Setting Sentry DSN...")
            update_python_config(args.dsn)
            update_json_config(args.dsn)
            print("Done!")
            return 0
        else:
            print(f"Invalid DSN format: {args.dsn}")
            return 1

    # Run interactive wizard
    run_wizard()
    return 0

if __name__ == "__main__":
    sys.exit(main())
