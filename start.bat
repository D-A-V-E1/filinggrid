@echo off
setlocal EnableDelayedExpansion

:: PeerDisclosures launcher - works with paths that contain spaces
set "ROOT=%~dp0"
cd /d "%ROOT%"

title PeerDisclosures Launcher
echo.
echo  ========================================
echo   PeerDisclosures - Starting application
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
    echo.
    echo  Install Python 3.11+ from https://python.org
    echo  Check "Add python.exe to PATH" during setup.
    echo.
    echo  Or run in PowerShell:
    echo    winget install Python.Python.3.12
    goto :fail
)

for /f "delims=" %%v in ('"%PYTHON_CMD%" --version 2^>nul') do echo [OK]   %%v
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
    if errorlevel 1 (
        echo [ERROR] Could not create venv. Is Python 3.9+ installed correctly?
        goto :fail
    )
)

echo [INFO] Checking Python packages...
"%VENV_PY%" "%ROOT%scripts\ensure_backend_deps.py"
if errorlevel 1 (
    echo [ERROR] Backend dependency install failed.
    goto :fail
)
echo.

:: ---- npm packages ----------------------------------------------------------
if not exist "%ROOT%node_modules\" (
    echo [INFO] Installing npm packages...
    cd /d "%ROOT%"
    call "%NPM%" install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        goto :fail
    )
) else (
    echo [OK]   node_modules present.
)
echo.

:: ---- Launch (use /D for paths with spaces) ---------------------------------
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
echo   PeerDisclosures is running
echo  ========================================
echo   Web:  http://localhost:3000
echo   API:  http://localhost:8000
echo   Docs: http://localhost:8000/docs
echo.
echo   Two new windows should have opened:
echo     - PeerDisclosures API
echo     - PeerDisclosures Web
echo.
echo   Close those windows to stop the app.
echo  ========================================
echo.

start "" "http://localhost:3000"
echo.
echo Press any key to close this launcher window...
echo (Keep the PeerDisclosures API and PeerDisclosures Web windows open.)
pause >nul
exit /b 0

:fail
echo.
echo  Launcher stopped due to an error.
pause
exit /b 1
