@echo off
REM run_all_regression.bat — Windows equivalent of run_all_regression.sh.
REM
REM Runs every test tier and aggregates failures.  Environment flags:
REM   NUNBA_LIVE=1     include live tier
REM   NUNBA_CYPRESS=1  include Cypress E2E
REM   NUNBA_STAGING=1  include staging probes
REM
REM Exits non-zero if ANY tier fails.

setlocal enabledelayedexpansion
cd /d "%~dp0.."

if "%PYTHON%"=="" set PYTHON=python
set FAIL_COUNT=0
set FAIL_LIST=

call :run_tier "ruff check"  %PYTHON% -m ruff check .
call :run_tier "ruff format" %PYTHON% -m ruff format --check .

call :run_tier "pytest main" %PYTHON% -m pytest tests/ --ignore=tests/harness -v --tb=short
call :run_tier "pytest harness (unit+integration)" %PYTHON% -m pytest tests/harness -m "unit or integration" -v --tb=short --rootdir tests/harness

if "%NUNBA_LIVE%"=="1" (
    call :run_tier "pytest harness (live)" %PYTHON% -m pytest tests/harness -m "live" -v --tb=short --rootdir tests/harness
)

if "%NUNBA_CYPRESS%"=="1" (
    if exist landing-page (
        pushd landing-page
        call :run_tier "cypress e2e" npx cypress run --browser chrome
        popd
    )
)

if "%NUNBA_STAGING%"=="1" (
    if exist scripts\staging_e2e_probe.sh (
        call :run_tier "staging probes" bash scripts\staging_e2e_probe.sh
    )
)

echo.
echo ============================================================
if !FAIL_COUNT!==0 (
    echo   ALL TIERS PASSED
    exit /b 0
) else (
    echo   FAILED TIERS: !FAIL_COUNT!
    echo   !FAIL_LIST!
    exit /b 1
)

:run_tier
set TIER_NAME=%~1
shift
echo.
echo ============================================================
echo   %TIER_NAME%
echo ============================================================
%*
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! "%TIER_NAME%"
)
exit /b 0
