@echo off
REM FilingGrid overnight benchmark — start API first (port 8000), then run this file.
cd /d "%~dp0..\.."
set PYTHONUNBUFFERED=1
backend\.venv\Scripts\python.exe backend\scripts\run_overnight.py %*
exit /b %ERRORLEVEL%
