@echo off
REM FilingGrid overnight benchmark — delegates to backend\scripts\run_overnight.bat
cd /d "%~dp0"
call backend\scripts\run_overnight.bat %*
exit /b %ERRORLEVEL%
