@echo off
setlocal EnableDelayedExpansion

:: PeerDisclosures launcher with Stripe webhook forwarding (does not replace start.bat)
set "ROOT=%~dp0"
cd /d "%ROOT%"

title PeerDisclosures Launcher (with Stripe)
echo.
echo  ========================================
echo   PeerDisclosures - Starting with Stripe
echo  ========================================
echo.

:: ---- Node.js ---------------------------------------------------------------
set "NODEJS_DIR="
if exist "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" set "NODEJS_DIR=%LOCALAPPDATA%\Programs\nodejs"
if not defined NODEJS_DIR if exist "C:\Program Files\nodejs\npm.cmd" set "NODEJS_DIR=C:\Program Files\nodejs"
if defined NODEJS_DIR (
    set "PATH=%NODEJS_DIR%;%PATH%"
    set "NPM=%NODEJS_DIR%\npm.cmd"
) else (
    for /f "delims=" %%i in ('where npm.cmd 2^>nul') do if not defined NPM set "NPM=%%i"
    if not defined NPM (
        where npm >nul 2>&1
        if errorlevel 1 (
            echo [ERROR] npm not found.
            echo         Install Node.js from https://nodejs.org
            goto :fail
        )
        set "NPM=npm"
    )
)

for /f "delims=" %%v in ('node --version 2^>nul') do echo [OK]   Node.js %%v
echo.

:: ---- Python (skip Microsoft Store stub) ------------------------------------
set "PYTHON_CMD="
set "PY_DIR=%LOCALAPPDATA%\Programs\Python"

if exist "%PY_DIR%\Python312\python.exe" set "PYTHON_CMD=%PY_DIR%\Python312\python.exe"
if not defined PYTHON_CMD if exist "%PY_DIR%\Python311\python.exe" set "PYTHON_CMD=%PY_DIR%\Python311\python.exe"
if not defined PYTHON_CMD if exist "%PY_DIR%\Python39\python.exe" set "PYTHON_CMD=%PY_DIR%\Python39\python.exe"

if not defined PYTHON_CMD (
    where py >nul 2>&1
    if not errorlevel 1 (
        for /f "delims=" %%v in ('py -3 --version 2^>nul') do set "PYTHON_CMD=py -3"
    )
)

if not defined PYTHON_CMD (
    echo [ERROR] Python not found.
    goto :fail
)

for /f "delims=" %%v in ('"%PYTHON_CMD%" --version 2^>nul') do echo [OK]   %%v
echo.

:: ---- Stripe CLI ------------------------------------------------------------
set "STRIPE=stripe"
where stripe >nul 2>&1
if errorlevel 1 (
    set "STRIPE=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe"
)
if not exist "%STRIPE%" (
    where stripe >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Stripe CLI not found.
        echo         Install: winget install Stripe.StripeCli
        echo         Then run: stripe login
        goto :fail
    )
)
for /f "delims=" %%v in ('"%STRIPE%" --version 2^>nul') do echo [OK]   Stripe CLI %%v
echo.

:: ---- Environment files -----------------------------------------------------
if not exist "%ROOT%.env" (
    if exist "%ROOT%.env.example" (
        echo [INFO] Creating .env from .env.example
        copy /Y "%ROOT%.env.example" "%ROOT%.env" >nul
    )
)
if not exist "%ROOT%backend\.env" (
    if exist "%ROOT%.env" copy /Y "%ROOT%.env" "%ROOT%backend\.env" >nul
)

:: ---- Docker (optional) ------------------------------------------------------
where docker >nul 2>&1
if not errorlevel 1 (
    echo [INFO] Starting PostgreSQL...
    docker compose -f "%ROOT%docker-compose.yml" up -d 2>nul
    if not errorlevel 1 echo [OK]   PostgreSQL started.
) else (
    echo [WARN] Docker not found - database skipped.
)
echo.

:: ---- Python venv -----------------------------------------------------------
set "VENV=%ROOT%backend\.venv"
set "VENV_PY=%VENV%\Scripts\python.exe"
set "VENV_PIP=%VENV%\Scripts\pip.exe"

if not exist "%VENV_PY%" (
    echo [INFO] Creating virtual environment...
    "%PYTHON_CMD%" -m venv "%VENV%"
    if errorlevel 1 goto :fail
)

echo [INFO] Checking Python packages...
"%VENV_PY%" "%ROOT%scripts\ensure_backend_deps.py"
if errorlevel 1 goto :fail
echo.

:: ---- npm packages ----------------------------------------------------------
if not exist "%ROOT%node_modules\" (
    echo [INFO] Installing npm packages...
    cd /d "%ROOT%"
    call "%NPM%" install
    if errorlevel 1 goto :fail
) else (
    echo [OK]   node_modules present.
)
echo.

:: ---- Stripe listen + webhook secret ----------------------------------------
if exist "%ROOT%.stripe-listen.log" del /F /Q "%ROOT%.stripe-listen.log" 2>nul

echo [INFO] Opening Stripe window - webhook forwarder
echo        (uses STRIPE_SECRET_KEY from backend\.env if set; else stripe login)
start "PeerDisclosures Stripe" /D "%ROOT%" cmd /k run-stripe.bat

echo [INFO] Waiting for webhook signing secret (up to 120s)...
echo        Watch the PeerDisclosures Stripe window for progress.
"%VENV_PY%" "%ROOT%scripts\wait_stripe_webhook_secret.py"
if errorlevel 1 (
    echo.
    echo [WARN] Could not auto-update STRIPE_WEBHOOK_SECRET yet.
    echo.
    echo   Fix one of:
    echo     1. Set STRIPE_SECRET_KEY=sk_test_... in backend\.env and re-run
    echo     2. Complete "stripe login" in the PeerDisclosures Stripe window, then re-run
    echo     3. Copy whsec_... from Stripe window into backend\.env manually
    echo.
    set /p "CONTINUE=Start API/Web anyway without webhook secret? [y/N]: "
    if /i not "!CONTINUE!"=="y" goto :fail
)
echo.

:: ---- Launch API + Web (API starts AFTER secret is in .env) -------------------
echo [INFO] Opening API window  - http://localhost:8000
call "%ROOT%scripts\kill-api-port.bat"
start "PeerDisclosures API" /D "%ROOT%" cmd /k run-api.bat

timeout /t 2 /nobreak >nul

echo [INFO] Waiting for API (20-F/6-K fallback enabled)...
"%VENV_PY%" "%ROOT%scripts\wait_api_ready.py"
if errorlevel 1 (
    echo [WARN] API health check failed. Compare may miss foreign issuer XBRL until API restarts.
) else (
    echo [OK]   API is ready.
)

timeout /t 1 /nobreak >nul

echo [INFO] Opening Web window - http://localhost:3000
call "%ROOT%scripts\kill-web-ports.bat"
start "PeerDisclosures Web" /D "%ROOT%" cmd /k run-web.bat

echo [INFO] Waiting for web server (HTTP ready on port 3000)...
"%VENV_PY%" "%ROOT%scripts\wait_web_ready.py"
if errorlevel 1 (
    echo [WARN] Homepage not ready yet. Check the PeerDisclosures Web window for errors.
) else (
    echo [OK]   Web server is ready.
)

echo.
echo  ========================================
echo   PeerDisclosures is running (billing ready)
echo  ========================================
echo   Web:     http://localhost:3000
echo   API:     http://localhost:8000
echo   Stripe:  forwarding to /webhooks/stripe
echo.
echo   Three windows should be open:
echo     - PeerDisclosures Stripe  (keep open for checkout)
echo     - PeerDisclosures API
echo     - PeerDisclosures Web
echo.
echo   STRIPE_WEBHOOK_SECRET was written to .env and backend\.env
echo   Close all three windows to stop (or run stop.bat for API/Web).
echo  ========================================
echo.

start "" "http://localhost:3000"
echo.
echo Press any key to close this launcher window...
echo (Keep the Stripe, API, and Web windows open.)
pause >nul
exit /b 0

:fail
echo.
echo  Launcher stopped due to an error.
pause
exit /b 1
