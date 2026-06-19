@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0kill-dev-ports.ps1" -Ports 8000
endlocal
exit /b 0
