@echo off
setlocal
:: Stop any FilingGrid API server on port 8000.
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":8000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)
endlocal
exit /b 0
