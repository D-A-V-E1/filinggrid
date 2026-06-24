@echo off
setlocal
set "ROOT=%~dp0"
cd /d "%ROOT%"

set "GIT=C:\Program Files\Git\bin\git.exe"
set "GH=C:\Program Files\GitHub CLI\gh.exe"

echo.
echo  PeerDisclosures - Push to GitHub
echo  ===========================
echo.

if not exist "%GH%" (
    echo [ERROR] GitHub CLI not found. Install with: winget install GitHub.cli
    pause
    exit /b 1
)

"%GH%" auth status >nul 2>&1
if errorlevel 1 (
    echo [STEP 1] Sign in to GitHub - follow the prompts in this window.
    echo.
    "%GH%" auth login --hostname github.com --git-protocol https --web
    if errorlevel 1 (
        echo [ERROR] GitHub login failed or was cancelled.
        pause
        exit /b 1
    )
)

echo [OK]   Logged in to GitHub.
echo.

"%GIT%" branch -M main 2>nul

"%GH%" repo view D-A-V-E-1/filinggrid >nul 2>&1
if errorlevel 1 (
    echo [STEP 2] Creating GitHub repo D-A-V-E-1/filinggrid ...
    "%GH%" repo create filinggrid --public --source=. --remote=origin --description "Stateless SEC filing comparison workspace" --push
) else (
    echo [STEP 2] Repo exists - pushing to origin/main ...
    "%GIT%" remote get-url origin >nul 2>&1
    if errorlevel 1 "%GIT%" remote add origin https://github.com/D-A-V-E-1/filinggrid.git
    "%GIT%" push -u origin main
)

if errorlevel 1 (
    echo [ERROR] Push failed.
    pause
    exit /b 1
)

echo.
echo  ========================================
echo   Success! Your repo is on GitHub:
echo   https://github.com/D-A-V-E-1/filinggrid
echo  ========================================
echo.
pause
endlocal
