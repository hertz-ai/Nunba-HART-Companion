@echo off
REM run_all_regression.bat - Windows equivalent of run_all_regression.sh.
REM
REM Each tier is an inline block.  Previous generic `:run_tier` function
REM used cmd /c "%~2" which mangled embedded quotes like -m "unit or
REM integration" - pytest then reported 'closing quote "" is missing'.
REM Inlining removes the escape layer.
REM
REM Every tier emits `::notice::` / `::warning::` beacons so that the
REM GitHub Actions check-run exposes per-phase progress via the
REM annotations API while the run is still in-flight.

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
echo ::notice title=tier start::ruff check
%PYTHON% -m ruff check .
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! ruff-check
    echo ::warning title=tier FAILED::ruff check
) else (
    echo ::notice title=tier ok::ruff check
)

echo.
echo ============================================================
echo   ruff format
echo ============================================================
echo ::notice title=tier start::ruff format
%PYTHON% -m ruff format --check .
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! ruff-format
    echo ::warning title=tier FAILED::ruff format
) else (
    echo ::notice title=tier ok::ruff format
)

echo.
echo ============================================================
echo   pytest main
echo ============================================================
echo ::notice title=tier start::pytest main
%PYTHON% -m pytest tests/ --ignore=tests/harness --ignore=tests/e2e --cov --cov-append -v --tb=short --timeout=300 --timeout-method=thread
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! pytest-main
    echo ::warning title=tier FAILED::pytest main
) else (
    echo ::notice title=tier ok::pytest main
)

echo.
echo ============================================================
echo   pytest harness (unit+integration)
echo ============================================================
echo ::notice title=tier start::pytest harness
%PYTHON% -m pytest tests/harness -m "unit or integration" --cov --cov-append -v --tb=short --rootdir tests/harness --timeout=300 --timeout-method=thread
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! pytest-harness
    echo ::warning title=tier FAILED::pytest harness
) else (
    echo ::notice title=tier ok::pytest harness
)

echo.
echo ============================================================
echo   pytest e2e
echo ============================================================
echo ::notice title=tier start::pytest e2e
%PYTHON% -m pytest tests/e2e --cov --cov-append -v --tb=short --rootdir tests/e2e --timeout=300 --timeout-method=thread
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! pytest-e2e
    echo ::warning title=tier FAILED::pytest e2e
) else (
    echo ::notice title=tier ok::pytest e2e
)

if "%NUNBA_LIVE%"=="1" (
    echo.
    echo ============================================================
    echo   pytest harness ^(live^)
    echo ============================================================
    echo ::notice title=tier start::pytest harness (live)
    %PYTHON% -m pytest tests/harness -m live -v --tb=short --rootdir tests/harness --timeout=600 --timeout-method=thread
    if errorlevel 1 (
        set /a FAIL_COUNT+=1
        set FAIL_LIST=!FAIL_LIST! pytest-live
        echo ::warning title=tier FAILED::pytest harness live
    ) else (
        echo ::notice title=tier ok::pytest harness live
    )
)

if "%NUNBA_CYPRESS%"=="1" (
    if exist landing-page (
        echo.
        echo ============================================================
        echo   Cypress E2E (Flask under coverage, React driven by Chrome)
        echo ============================================================
        echo ::notice title=cypress::phase=begin (Flask+React+Cypress)

        REM Boot Flask under coverage in the background.
        echo ::notice title=cypress flask::phase=boot port=5000
        start /B "" %PYTHON% scripts\coverage_flask_run.py --port 5000 > flask-coverage.log 2>&1

        REM Wait up to 120s for Flask to listen.
        set _FLASK_UP=0
        for /L %%i in (1,1,120) do (
            if "!_FLASK_UP!"=="0" (
                curl -s -o NUL -m 1 http://127.0.0.1:5000/health && (
                    set _FLASK_UP=1
                    echo ::notice title=cypress flask::phase=listening elapsed=%%is
                )
                if "!_FLASK_UP!"=="0" ping -n 2 127.0.0.1 >nul
            )
        )
        if "!_FLASK_UP!"=="0" (
            echo ::warning title=cypress flask::phase=FAILED did not listen on :5000 within 120s
            type flask-coverage.log
        )

        pushd landing-page
        echo ::notice title=cypress run::phase=starting cypress npx run
        call npx cypress run --browser chrome
        set _CY_RC=!errorlevel!
        popd
        if "!_CY_RC!"=="0" (
            echo ::notice title=cypress run::phase=ok
        ) else (
            echo ::warning title=cypress run::phase=FAILED rc=!_CY_RC!
            set /a FAIL_COUNT+=1
            set FAIL_LIST=!FAIL_LIST! cypress
        )

        REM Kill the background Flask so coverage atexit fires.
        for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":5000 "') do taskkill /F /PID %%p 2>nul
        echo ::notice title=cypress::phase=end rc=!_CY_RC!
    )
)

echo.
echo ============================================================
echo   coverage combine + gate ^(fail_under=99^)
echo ============================================================
echo ::notice title=tier start::coverage gate
%PYTHON% -m coverage combine 2>nul
%PYTHON% -m coverage report --precision=1 --skip-covered --skip-empty
if errorlevel 1 (
    set /a FAIL_COUNT+=1
    set FAIL_LIST=!FAIL_LIST! coverage-gate
    echo ::warning title=tier FAILED::coverage gate
) else (
    echo ::notice title=tier ok::coverage gate
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
