---
name: test_plan_tts_bridge_fix_2026_05_04
description: Self-test-plan for the tts_engine.py _BACKEND_TO_REGISTRY_KEY structural fix. Documents WHY/WHAT/HOW so the next pass can verify against live Nunba.
type: project
---

# Self-test-plan — TTS bridge dict structural fix

**Date:** 2026-05-04
**Driver:** user instruction — *"fix em all do end to end validation with live nunba, if your claims are wrong do not fix, checking against nunba and having concrete evidence to fix and test is the key, remember to fix and in next pass test what you fixed, this is where you are lagging"*

## WHY (intent)

Default audio mode TTS is silently broken on the user's installed
(frozen) Nunba.  The catalog selects `pocket_tts` as the active
backend for English; Nunba has no native pocket_tts implementation
and the espeak-ng fallback isn't installed → "No TTS engine
available" → no audio plays → VoiceVisualizer is mounted but driven
by an empty audio element.

## EVIDENCE (concrete, before fix)

Live log file: `~/Documents/Nunba/logs/gui_app.log`

| Date | Marker | Meaning |
|---|---|---|
| 2026-04-30 23:17:36 | `Draft boot decision: ... tts=pocket_tts → single` | Boot picks pocket_tts |
| 2026-05-02 14:10:35 | `requested lang='en' but active backend 'pocket_tts' is not in the preferred ladder [...]` | Ladder doesn't even list pocket_tts |
| 2026-05-02 14:10:35 | `pocket-tts not installed, trying espeak-ng fallback` | First fallback fails |
| 2026-05-02 14:10:35 | `No TTS engine available (install pocket-tts or espeak-ng)` | Silent total failure |
| 2026-05-04 23:29 | (latest boot, same pattern continues) | Bug still active |

Source location of root cause:
- `tts/tts_engine.py:573-574` — `_BACKEND_TO_REGISTRY_KEY` self-mappings
  ```python
  'luxtts':     'luxtts',   # kept for frozen HARTOS compat until rebuild
  'pocket_tts': 'pocket_tts',
  ```
- `tts/tts_engine.py:605-611` — inverse derivation (setdefault loop)
  produces `_CATALOG_TO_BACKEND['pocket_tts'] = 'pocket_tts'` (literal
  echo).
- `tts/tts_engine.py:624-627` — band-aid override (in working tree but
  NOT in installed frozen build) corrects the echo to BACKEND_PIPER.

## FIX (structural, not band-aid)

Remove the self-mappings; declare CPU fallbacks explicitly in a new
constant `_CPU_FALLBACK_CATALOG_IDS`.

Why structural beats band-aid:
- ONE list of CPU fallback aliases (`_CPU_FALLBACK_CATALOG_IDS`)
- NO self-mappings in the GPU bridge (`_BACKEND_TO_REGISTRY_KEY` is
  now pure: Nunba constant → HARTOS ENGINE_REGISTRY key)
- NO setdefault gymnastics, NO direct-assignment overrides
- Adding a new CPU-only HARTOS engine = ONE line in
  `_CPU_FALLBACK_CATALOG_IDS`

Same observable behavior as the band-aid; the band-aid block becomes
redundant and is replaced by an explicit loop driven by the new
constant.

## WHAT to test

### T1 — source-level invariants (PASSES even before rebuild)
After the edit, with `cwd=Nunba-HART-Companion`:
```python
from tts.tts_engine import (
    _BACKEND_TO_REGISTRY_KEY, _BACKEND_TO_CATALOG, _CATALOG_TO_BACKEND,
    _CPU_FALLBACK_CATALOG_IDS,
    BACKEND_PIPER, BACKEND_F5, BACKEND_CHATTERBOX_ML,
)

# 1. The bridge no longer contains self-mappings.
assert 'pocket_tts' not in _BACKEND_TO_REGISTRY_KEY
assert 'luxtts'     not in _BACKEND_TO_REGISTRY_KEY

# 2. CPU aliases all resolve to Piper (the canonical CPU fallback).
for cid in _CPU_FALLBACK_CATALOG_IDS:
    assert _CATALOG_TO_BACKEND[cid] == BACKEND_PIPER, cid

# 3. Both hyphen + underscore forms work for known engines.
assert _CATALOG_TO_BACKEND['f5-tts']  == BACKEND_F5
assert _CATALOG_TO_BACKEND['f5_tts']  == BACKEND_F5

# 4. Legacy alias still recognised.
assert _CATALOG_TO_BACKEND['chatterbox_multilingual'] == BACKEND_CHATTERBOX_ML

# 5. Round-trip stays clean for every Nunba GPU backend.
for backend, catalog_id in _BACKEND_TO_CATALOG.items():
    assert _CATALOG_TO_BACKEND[catalog_id] == backend, (backend, catalog_id)

print('OK')
```

### T2 — existing test suite (no regression)
```
pytest tests/test_tts_engine.py tests/test_catalog_backend_mapping_matrix.py tests/test_contract_validation.py -x
```
Expectation: green.  Removing the self-mappings should not break
any existing assertions because:
- The matrix test iterates `_CATALOG_TO_BACKEND.items()` and asserts
  round-trip; CPU aliases are still present and still resolve to
  BACKEND_PIPER.
- Contract validation only requires `_CATALOG_TO_BACKEND` size ≥ 5
  and dict type; both still hold.
- TTS engine tests pin first-choice values per language; preference
  ladder shape is untouched.

### T3 — live regression check (NEXT PASS, requires rebuild)
After `python scripts/build.py` + reinstall:
```powershell
# Watch log on next boot:
Get-Content "$env:USERPROFILE\Documents\Nunba\logs\gui_app.log" -Wait -Tail 0 | 
    Select-String "Selected backend|Synthesis failed|TTS tool error"
```
Send a chat message in audio mode (the default).

**Expected** (success):
- `Selected backend 'piper' for language 'en' (quality-ordered)` OR
  any backend ∈ `['chatterbox_turbo', 'f5', 'melotts', 'xtts_v2',
  'indic_parler', 'kokoro', 'mms_tts', 'piper']`
- NO `pocket_tts` chosen
- Audio plays, VoiceVisualizer animates with real spectral data
  (not just the idle breathing baseline)

**Failure signals** (rollback needed):
- `Selected backend 'pocket_tts'` continues
- `No TTS engine available` continues
- ImportError on boot (regression in the bridge dicts)

## HOW (commands to run, in order)

```powershell
# Step 1 — apply edit (this commit)
# Step 2 — T1 invariant test:
cd C:\Users\sathi\PycharmProjects\Nunba-HART-Companion
python -c "from tts.tts_engine import _BACKEND_TO_REGISTRY_KEY, _BACKEND_TO_CATALOG, _CATALOG_TO_BACKEND, _CPU_FALLBACK_CATALOG_IDS, BACKEND_PIPER, BACKEND_F5, BACKEND_CHATTERBOX_ML; assert 'pocket_tts' not in _BACKEND_TO_REGISTRY_KEY; assert 'luxtts' not in _BACKEND_TO_REGISTRY_KEY; [(_:=_CATALOG_TO_BACKEND[cid]) and (_ == BACKEND_PIPER or (_ for _ in []).throw(AssertionError(cid))) for cid in _CPU_FALLBACK_CATALOG_IDS]; assert _CATALOG_TO_BACKEND['f5-tts'] == BACKEND_F5; assert _CATALOG_TO_BACKEND['f5_tts'] == BACKEND_F5; assert _CATALOG_TO_BACKEND['chatterbox_multilingual'] == BACKEND_CHATTERBOX_ML; print('T1 OK')"

# Step 3 — T2 regression suite:
pytest tests/test_tts_engine.py tests/test_catalog_backend_mapping_matrix.py tests/test_contract_validation.py -x

# Step 4 — commit + push
# Step 5 — NEXT PASS: rebuild Nunba, watch log per T3
```

## What this fix DOES NOT do

- Does NOT touch `_FALLBACK_LANG_ENGINE_PREFERENCE` (per-lang ladder) —
  that lives in tts_engine.py:452.  Different concern, different file
  region, deferred.
- Does NOT touch `tts_router.select_engines()` (HARTOS parallel
  selector) — TODO in source already, heavy test coupling; deferred.
- Does NOT change ladder ranking or backend priorities — only the
  catalog-id → Nunba-backend translation table.
- Does NOT rebuild Nunba.  User must do that to see the live effect.

## Idle voice anim (separate symptom)

The user reported "idle voice anim is not playing in audio mode".
That symptom likely shares the root cause: when TTS dies silently,
no audio gets attached to `<audio ref={audioRef}>`, and
`VoiceVisualizer` mounts but its `connectAnalyser()` returns early
because `audioRef.current` is null.  In that state the canvas
**should** still render the idle breathing baseline (lines 127-131
of VoiceVisualizer.jsx are unconditional), so if breathing is
absent there is a separate UI-side bug.

Diagnostics for next pass (cannot run from this machine, needs
browser DevTools):
1. Open `/local` in the SPA.  Confirm `mediaMode === 'audio'` (default).
2. DevTools → React tree → find `VoiceVisualizer`.  Confirm it is
   mounted (`isActive=false`, `audioRef` defined, canvas in DOM).
3. DevTools → Performance → record 5 s.  Look for
   `requestAnimationFrame` callbacks.  If absent, the render loop
   isn't starting (canvas size 0?  effect cleanup running early?
   `canvasRef.current` null at first render?).
4. Compare against the last commit that touched
   `landing-page/src/components/VoiceVisualizer.jsx` —
   `git log --follow -p -- landing-page/src/components/VoiceVisualizer.jsx`.

This file is the audit log; the actual edit lives in
`tts/tts_engine.py`.
