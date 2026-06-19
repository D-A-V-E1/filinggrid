@echo off
setlocal
:: Stop any Next.js dev servers on FilingGrid web ports (3000 primary, 3001 fallback).
for %%P in (3000 3001) do (
    for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":%%P" ^| findstr "LISTENING"') do (
        taskkill /F /PID %%a >nul 2>&1
    )
)
endlocal
exit /b 0
