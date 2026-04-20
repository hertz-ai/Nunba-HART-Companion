@echo off
REM ============================================================
REM  Nunba Desktop App - Build Script (Windows)
REM  Delegates to build.py for all build logic.
REM ============================================================
REM  Usage:
REM    build.bat                      - Full build (exe + installer). Acceptance
REM                                     test is SKIPPED by default (see below).
REM    build.bat app                  - Build executable only
REM    build.bat installer            - Build installer only (requires existing build)
REM    build.bat clean                - Clean build artifacts
REM    build.bat --skip-deps          - Skip dependency installation
REM
REM  Acceptance gate:
REM    build.bat always prepends --skip-acceptance.  To RUN the gate on a
REM    local machine, call `python scripts\build.py ...` directly (or edit
REM    this file).  CI workflows (.github/workflows/build.yml) already call
REM    build.py directly and are unaffected.
REM    Live tee log when the gate IS run: ~/Documents/Nunba/logs/build_acceptance.log
REM
REM  Args are pass-through: all flags (and any future ones) go straight to
REM  scripts\build.py via ARGS=%* (with --skip-acceptance prepended).
REM ============================================================

setlocal
cd /d "%~dp0.."

REM ---- Find Python ----
if exist ".venv\Scripts\python.exe" (
    set "PYTHON_EXE=.venv\Scripts\python.exe"
) else if exist "venv\Scripts\python.exe" (
    set "PYTHON_EXE=venv\Scripts\python.exe"
) else (
    set "PYTHON_EXE=python"
)

REM ---- Map legacy arg names ----
set "ARGS=%*"
if /i "%~1"=="exe" set "ARGS=app"

REM ---- Skip acceptance by default for local dev (per user directive 2026-04-19) ----
REM The --acceptance-test gate spawns the freshly-built Nunba.exe with a 180s
REM timeout; on some dev machines the langchain-fix import chain + cold DLL
REM cache pushes this past the timeout without producing useful output, so
REM it's now OPT-IN for build.bat callers.  Override by:
REM   - calling `python scripts\build.py ...` directly (CI does this)
REM   - editing this line to remove --skip-acceptance
REM   - setting `NUNBA_SKIP_ACCEPTANCE=0` and `NUNBA_STRICT_ACCEPTANCE=1` in
REM     the shell BEFORE invoking build.bat (env vars override the flag
REM     only when --skip-acceptance is NOT also on the CLI; simplest is to
REM     just edit this file or call build.py directly).
REM CI workflows (.github/workflows/build.yml) call build.py directly, so
REM CI still runs the gate and catches Stage-A/B regressions.
set "ARGS=--skip-acceptance %ARGS%"

REM ---- Delegate to build.py (unbuffered so logs appear in real time) ----
set "PYTHONUNBUFFERED=1"
"%PYTHON_EXE%" -u scripts\build.py %ARGS%
exit /b %ERRORLEVEL%
