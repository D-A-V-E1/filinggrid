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

echo.
echo  FilingGrid Stripe webhook forwarder
echo  ===================================
echo   Target: http://localhost:8000/webhooks/stripe
echo   Log:    %ROOT%.stripe-listen.log
echo.
echo   Output appears below. Keep this window open during checkout.
echo   Press Ctrl+C to stop.
echo.

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
