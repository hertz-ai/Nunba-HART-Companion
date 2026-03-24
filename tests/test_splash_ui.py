"""
UI test for Nunba splash screen — verifies no white flash during
static splash, animated splash, and static-to-animated transition.

Uses Win32 PrintWindow API to capture the actual window content
regardless of z-order (works even when other windows are on top).

Run:
    python tests/test_splash_ui.py              # dev mode (animated only)
    python tests/test_splash_ui.py --frozen     # simulates frozen mode (static + animated)

Requires: PIL (Pillow)
"""
import platform
import sys

if platform.system() != "Windows":
    import pytest
    pytest.skip("Windows-only test (uses Win32 API)", allow_module_level=True)

import ctypes
import ctypes.wintypes
import os
import struct
import subprocess
import time

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32


def find_tk_windows():
    """Find all visible Tk windows via EnumWindows."""
    wins = []

    def cb(hwnd, _):
        if user32.IsWindowVisible(hwnd):
            cls = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, cls, 256)
            if "Tk" in cls.value:
                rect = ctypes.wintypes.RECT()
                user32.GetWindowRect(hwnd, ctypes.byref(rect))
                w = rect.right - rect.left
                h = rect.bottom - rect.top
                if w > 10 and h > 10:
                    wins.append({"hwnd": hwnd, "w": w, "h": h, "cls": cls.value})
        return True

    WNDENUMPROC = ctypes.WINFUNCTYPE(
        ctypes.c_bool, ctypes.wintypes.HWND, ctypes.wintypes.LPARAM
    )
    user32.EnumWindows(WNDENUMPROC(cb), 0)
    return wins


def capture_window(hwnd, w, h):
    """Capture a window via PrintWindow (z-order independent)."""
    from PIL import Image

    dc = user32.GetWindowDC(hwnd)
    mdc = gdi32.CreateCompatibleDC(dc)
    bmp = gdi32.CreateCompatibleBitmap(dc, w, h)
    gdi32.SelectObject(mdc, bmp)
    user32.PrintWindow(hwnd, mdc, 2)  # PW_RENDERFULLCONTENT
    buf = ctypes.create_string_buffer(w * h * 4)
    bi = struct.pack("LLLHHLLLLLL", 40, w, h, 1, 32, 0, w * h * 4, 0, 0, 0, 0)
    gdi32.GetDIBits(mdc, bmp, 0, h, buf, bi, 0)
    img = Image.frombuffer("RGBA", (w, h), buf, "raw", "BGRA", 0, -1)
    gdi32.DeleteObject(bmp)
    gdi32.DeleteDC(mdc)
    user32.ReleaseDC(hwnd, dc)
    return img


def analyze_center(img, margin=40):
    """Measure luminance of the center region."""
    w, h = img.size
    cx, cy = w // 2, h // 2
    m = min(margin, max(1, cx - 1), max(1, cy - 1))
    center = img.crop((cx - m, cy - m, cx + m, cy + m))
    px = list(center.getdata())
    if not px:
        return 0.0, "EMPTY"
    lum = sum(0.299 * p[0] + 0.587 * p[1] + 0.114 * p[2] for p in px) / len(px)
    if lum > 200:
        return lum, "WHITE"
    elif lum < 80:
        return lum, "DARK"
    return lum, "MID"


def run_test(frozen_mode=False):
    """Run the splash UI test.

    Args:
        frozen_mode: if True, patches app.py to enable early splash
                     (simulates frozen exe where both static + animated show)
    """
    app_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    save_dir = os.path.dirname(os.path.abspath(__file__))
    app_file = os.path.join(app_dir, "app.py")
    test_file = None

    if frozen_mode:
        # Patch: remove the frozen guard so early splash runs in dev
        test_file = os.path.join(app_dir, "_test_splash_app.py")
        with open(app_file, encoding="utf-8") as f:
            src = f.read()
        src = src.replace(
            "if getattr(sys, 'frozen', False) and '--validate'",
            "if '--validate'",
        )
        with open(test_file, "w", encoding="utf-8") as f:
            f.write(src)
        target = test_file
        mode_label = "FROZEN (static + animated)"
    else:
        target = app_file
        mode_label = "DEV (animated only)"

    print(f"Splash UI Test [{mode_label}]")
    print(f"{'=' * 60}")

    proc = subprocess.Popen(
        [sys.executable, target],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        cwd=app_dir,
    )

    print("Time   #wins  Lum    Status   Size")
    print(f"{'-' * 55}")

    frames = []
    try:
        sample_count = 35 if frozen_mode else 20
        for i in range(sample_count):
            time.sleep(0.3)
            t = (i + 1) * 0.3
            wins = find_tk_windows()
            if not wins:
                if t <= 2.0:
                    print(f"{t:4.1f}s  0      -      waiting")
                continue
            for win in wins:
                img = capture_window(win["hwnd"], win["w"], win["h"])
                lum, status = analyze_center(img)
                frames.append(
                    {
                        "t": t,
                        "nwins": len(wins),
                        "lum": lum,
                        "status": status,
                        "w": win["w"],
                        "h": win["h"],
                        "img": img,
                    }
                )
                print(
                    f"{t:4.1f}s  {len(wins):1d}      {lum:5.0f}  {status:6s}   "
                    f"{win['w']}x{win['h']}"
                )
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        if test_file and os.path.exists(test_file):
            os.remove(test_file)

    # Save key frames
    if frames:
        frames[0]["img"].save(os.path.join(save_dir, "splash_test_first.png"))
        frames[-1]["img"].save(os.path.join(save_dir, "splash_test_last.png"))
        mid = frames[len(frames) // 2]
        mid["img"].save(os.path.join(save_dir, "splash_test_mid.png"))

    # Results
    white_frames = [f for f in frames if f["status"] == "WHITE"]
    dark_frames = [f for f in frames if f["status"] == "DARK"]
    multi_win = [f for f in frames if f["nwins"] > 1]

    print(f"\n{'=' * 60}")
    print(f"Frames:     {len(frames)} total, {len(dark_frames)} dark, "
          f"{len(white_frames)} white")
    print(f"Multi-win:  {len(multi_win)} (should be 0)")

    passed = True
    if not frames:
        print("FAIL: No splash window detected!")
        passed = False
    if white_frames:
        print(f"FAIL: White detected at t={white_frames[0]['t']:.1f}s")
        passed = False
    if multi_win:
        print(f"FAIL: Multiple windows at t={multi_win[0]['t']:.1f}s")
        passed = False

    if passed:
        print("PASS")
    return passed


if __name__ == "__main__":
    frozen = "--frozen" in sys.argv
    ok = run_test(frozen_mode=frozen)
    sys.exit(0 if ok else 1)
