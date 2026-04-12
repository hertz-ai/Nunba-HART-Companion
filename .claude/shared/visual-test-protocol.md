# Visual Test Protocol — Live UI Verification

The testing agent must **see the actual UI**, not just check HTTP status codes.

## Three Visual Test Channels

### 1. Nunba Desktop (pyautogui + PIL screenshot)
```python
from PIL import ImageGrab
screenshot = ImageGrab.grab()
screenshot.save('~/Documents/Nunba/logs/screenshot_<test_id>.png')
# Then use Read tool to view the screenshot and verify UI elements
```

**What to verify visually:**
- Chat panel loads at localhost:5000/local
- Message bubbles render (user blue, assistant dark)
- Draft bubble shows "Draft — refining..." badge when expert_pending
- Draft bubble replaced in-place when expert arrives
- TTS audio indicator appears when voice plays
- Agent overlay consent card appears on capability request
- Admin dashboard charts render at /admin
- Social feed posts render at /social
- Dark mode colors consistent
- No layout breaks, no blank screens, no error modals

### 2. Hevolve Web (Chrome headless screenshot)
```bash
# Open Hevolve web and capture screenshot
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --screenshot=hevolve_web.png --window-size=1280,720 http://localhost:3000
# Or use the deployed instance
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless --screenshot=hevolve_web.png --window-size=1280,720 https://hevolve.ai
```

**What to verify visually:**
- Landing page loads
- Chat interface renders
- Social feed visible
- Admin panel accessible
- Consistent with Nunba desktop styling

### 3. Android via ADB (when device connected)
```bash
adb shell screencap -p /sdcard/screen.png && adb pull /sdcard/screen.png android_screenshot.png
```

**What to verify visually:**
- Hevolve app opens
- Chat sends and receives
- LiquidOverlay renders
- Draft bubble dashed border visible
- WAMP connection active (message arrives via realtime)

## Visual Test Integration with Capability Matrix

For each capability item, the testing agent should:
1. Execute the action (HTTP request, UI interaction)
2. Take a screenshot AFTER the action
3. Use the Read tool to VIEW the screenshot
4. Verify the expected UI state is visible
5. Report PASS/FAIL with screenshot evidence

## Screenshot Naming Convention
`~/Documents/Nunba/logs/cap_<number>_<timestamp>.png`
Example: `cap_1.1_20260412_193500.png`
