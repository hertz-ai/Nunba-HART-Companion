@echo off
REM run_all_regression.bat — Windows equivalent of run_all_regression.sh.
REM
REM Each tier is an inline block.  Previous generic `:run_tier` function
REM used cmd /c "%~2" which mangled embedded quotes like -m "unit or
REM integration" — pytest then reported 'closing quote "" is missing'.
REM Inlining removes the escape layer.

setlocal enabledelayedexpansion
cd /d "%~dp0.."

if "%PYTHON%"=="" set PYTHON=python
set FAIL_COUNT=0
set FAIL_LIST=
set NUNBA_SKIP_SINGLE_INSTANCE=1

REM Ensure pytest-timeout + coverage tooling are present.
%PYTHON% -m pip install --quiet pytest-timeout pytest-cov coverage 2>nul

REM Wipe prior coverage fragments so we measure only this invocation.
%PYTHON% -m coverage erase 2>nul

echo.
echo ============================================================
echo   ruff check
echo ============================================================
%PYTHON% -m ruff check .
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! ruff-check
)

echo.
echo ============================================================
echo   ruff format
echo ============================================================
%PYTHON% -m ruff format --check .
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! ruff-format
)

echo.
echo ============================================================
echo   pytest main
echo ============================================================
%PYTHON% -m pytest tests/ --ignore=tests/harness --ignore=tests/e2e --cov --cov-append -v --tb=short
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! pytest-main
)

echo.
echo ============================================================
echo   pytest harness (unit+integration)
echo ============================================================
%PYTHON% -m pytest tests/harness -m "unit or integration" --cov --cov-append -v --tb=short --rootdir tests/harness
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! pytest-harness
)

echo.
echo ============================================================
echo   pytest e2e
echo ============================================================
%PYTHON% -m pytest tests/e2e --cov --cov-append -v --tb=short --rootdir tests/e2e
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! pytest-e2e
)

if "%NUNBA_LIVE%"=="1" (
    echo.
    echo ============================================================
    echo   pytest harness ^(live^)
    echo ============================================================
    %PYTHON% -m pytest tests/harness -m live -v --tb=short --rootdir tests/harness
    if errorlevel 1 (
        set /a FAIL_COUNT+=1
        set FAIL_LIST=!FAIL_LIST! pytest-live
    )
)

if "%NUNBA_E2E%"=="1" (
    echo.
    echo ============================================================
    echo   pytest e2e
    echo ============================================================
    %PYTHON% -m pytest tests/e2e -v --tb=short --rootdir tests/e2e
    if errorlevel 1 (
        set /a FAIL_COUNT+=1
        set FAIL_LIST=!FAIL_LIST! pytest-e2e
    )
)

if "%NUNBA_CYPRESS%"=="1" (
    if exist landing-page (
        pushd landing-page
        echo.
        echo ============================================================
        echo   cypress e2e
        echo ============================================================
        call npx cypress run --browser chrome
        if errorlevel 1 (
            set /a FAIL_COUNT+=1
            set FAIL_LIST=!FAIL_LIST! cypress
        )
        popd
    )
)

echo.
echo ============================================================
echo   coverage combine + gate ^(fail_under=99^)
echo ============================================================
%PYTHON% -m coverage combine 2>nul
%PYTHON% -m coverage report --precision=1 --skip-covered --skip-empty
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! coverage-gate
)
%PYTHON% -m coverage xml -o coverage.xml 2>nul
%PYTHON% -m coverage html -d .coverage-html 2>nul

echo.
echo ============================================================
if !FAIL_COUNT!==0 (
    echo   ALL TIERS PASSED + COVERAGE GATE GREEN
    exit /b 0
) else (
    echo   FAILED TIERS: !FAIL_COUNT!
    echo   !FAIL_LIST!
    exit /b 1
)
