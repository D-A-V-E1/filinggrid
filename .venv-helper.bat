@echo off
setlocal EnableDelayedExpansion
set "ROOT=%~dp0"

:: Node.js
set "NODEJS_DIR=%LOCALAPPDATA%\Programs\nodejs"
if exist "%NODEJS_DIR%\npm.cmd" set "PATH=%NODEJS_DIR%;%PATH%"

set "VENV_PY=%ROOT%backend\.venv\Scripts\python.exe"
set "NPM=%NODEJS_DIR%\npm.cmd"
if not exist "%NPM%" set "NPM=npm"

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
