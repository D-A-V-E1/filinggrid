@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

echo.
echo  Stopping FilingGrid...
echo.

:: Stop Docker PostgreSQL if Docker is available
where docker >nul 2>&1
if not errorlevel 1 (
    docker compose -f "%ROOT%docker-compose.yml" down
    echo [OK] PostgreSQL container stopped.
)

:: Kill processes listening on FilingGrid ports (8000 API, 3000/3001 web)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
call "%ROOT%scripts\kill-web-ports.bat"

echo [OK] Ports 3000, 3001, and 8000 cleared.

:: Stop Stripe CLI listen processes (start-with-stripe.bat)
taskkill /F /IM stripe.exe >nul 2>&1

echo      Close any remaining "FilingGrid API" / "FilingGrid Web" / "FilingGrid Stripe" windows manually.
echo.
pause
endlocal
