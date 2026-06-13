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

:: Kill processes listening on FilingGrid ports (8000 API, 3000 web)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

echo [OK] Ports 3000 and 8000 cleared.
echo      Close any remaining "FilingGrid API" / "FilingGrid Web" terminal windows manually.
echo.
pause
endlocal
