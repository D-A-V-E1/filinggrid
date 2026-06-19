@echo off
setlocal
cd /d "%~dp0"
set "ROOT=%~dp0"
set "VENV_PY=%ROOT%backend\.venv\Scripts\python.exe"

title FilingGrid Stripe

if not exist "%VENV_PY%" (
    echo [ERROR] Python venv not found. Run start-with-stripe.bat from the project root first.
    pause
    exit /b 1
)

set "STRIPE_CLI="
where stripe >nul 2>&1
if not errorlevel 1 set "STRIPE_CLI=stripe"
if not defined STRIPE_CLI if exist "%LOCALAPPDATA%\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe" (
    set "STRIPE_CLI=%LOCALAPPDATA%\Microsoft\WinGet\Packages\Stripe.StripeCli_Microsoft.Winget.Source_8wekyb3d8bbwe\stripe.exe"
)

echo.
echo  FilingGrid Stripe webhook forwarder
echo  ===================================
echo   Target: http://localhost:8000/webhooks/stripe
echo   Log:    %ROOT%.stripe-listen.log
echo.
echo   Output appears below. Keep this window open during checkout.
echo   Press Ctrl+C to stop.
echo.

if defined STRIPE_CLI if not exist "%USERPROFILE%\.config\stripe\config.toml" (
    echo  [INFO] Stripe CLI is not logged in yet.
    echo         A browser pairing step runs next - approve it within ~90 seconds.
    echo.
    "%STRIPE_CLI%" login
    echo.
)

if defined STRIPE_CLI if not exist "%USERPROFILE%\.config\stripe\config.toml" (
    echo  [WARN] Stripe CLI login did not complete.
    echo         You can paste your test secret key instead:
    echo         "%STRIPE_CLI%" login --interactive
    echo.
)

"%VENV_PY%" "%ROOT%scripts\run_stripe_listen.py"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
    echo Stripe listen exited with error %EXIT_CODE%.
) else (
    echo Stripe listen stopped.
)
pause
exit /b %EXIT_CODE%
