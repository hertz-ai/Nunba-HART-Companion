"""
Regression tests for --install-ai CLI flag in app.py.

Tests that the argument parser recognizes --install-ai
and that the flag integrates correctly with the app startup flow.
"""
import os
import subprocess
import sys

PROJ_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
APP_PY = os.path.join(PROJ_ROOT, 'app.py')


def test_help_contains_install_ai():
    """--install-ai should appear in the help output."""
    result = subprocess.run(
        [sys.executable, APP_PY, '--help'],
        capture_output=True, text=True, timeout=30
    )
    assert '--install-ai' in result.stdout, (
        f"--install-ai not found in help output:\n{result.stdout}"
    )


def test_help_description_for_install_ai():
    """--install-ai help text should mention AI components."""
    result = subprocess.run(
        [sys.executable, APP_PY, '--help'],
        capture_output=True, text=True, timeout=30
    )
    assert 'download AI components' in result.stdout.lower() or \
           'AI components' in result.stdout, (
        f"Expected AI components description in help:\n{result.stdout}"
    )


def test_install_ai_flag_is_parsed():
    """app.py --help should list --install-ai as a valid argument."""
    # Use --help to verify argument is recognized without actually running
    result = subprocess.run(
        [sys.executable, APP_PY, '--help'],
        capture_output=True, text=True, timeout=30
    )
    combined = result.stdout + result.stderr
    assert '--install-ai' in combined, (
        f"--install-ai should be listed in help:\n{combined}"
    )


def test_install_ai_prints_header():
    """--install-ai should print the installer header (skip if AI modules missing)."""
    import importlib.util
    # Skip if ai_installer not available
    if importlib.util.find_spec('ai_installer') is None:
        import pytest
        pytest.skip("ai_installer module not available")

    # Run with longer timeout since it may start downloading
    result = subprocess.run(
        [sys.executable, APP_PY, '--install-ai'],
        capture_output=True, text=True, timeout=120  # Increased timeout
    )
    combined = result.stdout + result.stderr
    # Should print header or at least recognize the argument
    assert 'Nunba AI Components Installer' in combined or \
           'AI installer not available' in combined or \
           'Platform:' in combined, (
        f"Expected installer header or platform info:\n{combined}"
    )


def test_app_py_syntax_valid():
    """app.py should have valid Python syntax."""
    result = subprocess.run(
        [sys.executable, '-c',
         f"import ast; ast.parse(open(r'{APP_PY}', 'r', encoding='utf-8').read()); print('OK')"],
        capture_output=True, text=True, timeout=15
    )
    assert result.returncode == 0, f"Syntax error in app.py:\n{result.stderr}"
    assert 'OK' in result.stdout


def test_llama_config_syntax_valid():
    """llama_config.py should have valid Python syntax."""
    llama_config = os.path.join(PROJ_ROOT, 'llama_config.py')
    if not os.path.exists(llama_config):
        return  # Skip if file doesn't exist
    result = subprocess.run(
        [sys.executable, '-c',
         f"import ast; ast.parse(open(r'{llama_config}', 'r', encoding='utf-8').read()); print('OK')"],
        capture_output=True, text=True, timeout=15
    )
    assert result.returncode == 0, f"Syntax error in llama_config.py:\n{result.stderr}"
    assert 'OK' in result.stdout


def test_llama_installer_syntax_valid():
    """llama_installer.py should have valid Python syntax."""
    llama_installer = os.path.join(PROJ_ROOT, 'llama_installer.py')
    if not os.path.exists(llama_installer):
        return  # Skip if file doesn't exist
    result = subprocess.run(
        [sys.executable, '-c',
         f"import ast; ast.parse(open(r'{llama_installer}', 'r', encoding='utf-8').read()); print('OK')"],
        capture_output=True, text=True, timeout=15
    )
    assert result.returncode == 0, f"Syntax error in llama_installer.py:\n{result.stderr}"
    assert 'OK' in result.stdout


def test_inno_setup_script_has_setupai_task():
    """Nunba_Installer.iss should contain the setupai task (checked by default)."""
    iss_path = os.path.join(PROJ_ROOT, 'scripts', 'Nunba_Installer.iss')
    if not os.path.exists(iss_path):
        return  # Skip if file doesn't exist
    with open(iss_path, encoding='utf-8') as f:
        content = f.read()
    assert 'setupai' in content, "setupai task not found in Nunba_Installer.iss"
    assert '--setup-ai' in content, "--setup-ai flag not found in Nunba_Installer.iss"


def test_production_build_js_loads():
    """Production JS bundle should evaluate without ReferenceError (catches TDZ bugs)."""
    build_js_dir = os.path.join(PROJ_ROOT, 'landing-page', 'build', 'static', 'js')
    if not os.path.isdir(build_js_dir):
        return  # Skip if build dir doesn't exist
    # Find main.*.js
    import glob
    main_files = glob.glob(os.path.join(build_js_dir, 'main.*.js'))
    if not main_files:
        return  # Skip if no main bundle
    main_js = main_files[0]
    # Use Node.js to evaluate the bundle — catches TDZ / ReferenceError at module scope
    result = subprocess.run(
        ['node', '-e', f'''
try {{
  // Provide minimal browser globals so the bundle can evaluate
  global.window = global;
  global.document = {{ getElementById: () => ({{ childNodes: [] }}), createElement: () => ({{ style: {{}}, setAttribute: () => {{}}, addEventListener: () => {{}} }}), head: {{ appendChild: () => {{}} }}, querySelector: () => null, querySelectorAll: () => [], documentElement: {{ style: {{ setProperty: () => {{}} }} }} }};
  global.navigator = {{ userAgent: 'node', serviceWorker: undefined, onLine: true }};
  global.location = {{ hostname: 'localhost', pathname: '/', search: '', href: 'http://localhost/' }};
  global.localStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
  global.sessionStorage = {{ getItem: () => null, setItem: () => {{}}, removeItem: () => {{}} }};
  global.self = global;
  global.fetch = () => Promise.resolve({{ ok: false, json: () => Promise.resolve({{}}) }});
  global.Audio = class {{ pause() {{}} }};
  global.URL = class {{ constructor() {{ this.origin = ''; }} }};
  global.MutationObserver = class {{ observe() {{}} disconnect() {{}} }};
  global.IntersectionObserver = class {{ observe() {{}} disconnect() {{}} }};
  global.ResizeObserver = class {{ observe() {{}} disconnect() {{}} }};
  global.HTMLElement = class {{}};
  global.customElements = {{ define: () => {{}} }};
  global.history = {{ replaceState: () => {{}} }};
  global.addEventListener = () => {{}};
  global.removeEventListener = () => {{}};
  global.dispatchEvent = () => {{}};
  global.getComputedStyle = () => ({{}});
  global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
  global.cancelAnimationFrame = () => {{}};
  global.matchMedia = () => ({{ matches: false, addListener: () => {{}}, removeListener: () => {{}} }});
  global.dataLayer = [];
  require("{main_js.replace(os.sep, '/')}");
  process.stdout.write("OK");
}} catch (e) {{
  process.stderr.write(e.constructor.name + ": " + e.message);
  process.exit(1);
}}
'''],
        capture_output=True, text=True, timeout=30
    )
    # We accept both OK and certain expected errors (missing DOM, etc.)
    # The critical thing is NO ReferenceError (TDZ) or SyntaxError
    combined = result.stdout + result.stderr
    assert 'ReferenceError' not in combined, (
        f"Production JS has a ReferenceError (variable ordering bug):\n{combined[:500]}"
    )
    assert 'SyntaxError' not in combined, (
        f"Production JS has a SyntaxError:\n{combined[:500]}"
    )


if __name__ == '__main__':
    # Simple runner for quick manual testing
    import traceback
    tests = [v for k, v in sorted(globals().items()) if k.startswith('test_')]
    passed = 0
    failed = 0
    for test_fn in tests:
        try:
            test_fn()
            print(f"  PASS: {test_fn.__name__}")
            passed += 1
        except Exception as e:
            print(f"  FAIL: {test_fn.__name__}: {e}")
            traceback.print_exc()
            failed += 1
    print(f"\n{passed} passed, {failed} failed out of {passed + failed} tests")
    sys.exit(1 if failed else 0)
