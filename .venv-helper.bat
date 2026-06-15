@echo off
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"

:: Node.js (check common install locations; bare "npm" can resolve to Cursor's bundled node)
set "NODEJS_DIR="
if exist "%LOCALAPPDATA%\Programs\nodejs\npm.cmd" set "NODEJS_DIR=%LOCALAPPDATA%\Programs\nodejs"
if not defined NODEJS_DIR if exist "C:\Program Files\nodejs\npm.cmd" set "NODEJS_DIR=C:\Program Files\nodejs"
if defined NODEJS_DIR (
    set "PATH=%NODEJS_DIR%;%PATH%"
    set "NPM=%NODEJS_DIR%\npm.cmd"
) else (
    for /f "delims=" %%i in ('where npm.cmd 2^>nul') do if not defined NPM set "NPM=%%i"
    if not defined NPM set "NPM=npm"
)

set "VENV_PY=%ROOT%backend\.venv\Scripts\python.exe"

if /i "%~1"=="api" (
    cd /d "%ROOT%backend"
    if not exist "%VENV_PY%" (
        echo [ERROR] Virtual environment not found. Run start.bat first.
        pause
        exit /b 1
    )
    "%VENV_PY%" -m uvicorn main:app --host 127.0.0.1 --port 8000 --reload
    goto :eof
)

if /i "%~1"=="web" (
    cd /d "%ROOT%"
    call "%NPM%" run dev
    goto :eof
)

endlocal
