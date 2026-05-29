@echo off
title Retirement Planner
cd /d "%~dp0"

echo ============================================
echo   Retirement Planner - Local Launcher
echo ============================================
echo.

REM --- Check for Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo [!] Node.js is not installed.
  echo     I will open the download page in your browser.
  echo     Install the "LTS" version, then run this file again.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b
)

for /f "delims=" %%v in ('node -v') do set NODEVER=%%v
echo [ok] Node.js found: %NODEVER%
echo.

REM --- Install dependencies if needed ---
if not exist node_modules (
  echo [..] First-time setup: installing dependencies.
  echo      This can take a couple of minutes. Please wait...
  echo.
  call npm install
  if errorlevel 1 (
    echo.
    echo [!] Something went wrong during install. See messages above.
    pause
    exit /b
  )
) else (
  echo [ok] Dependencies already installed.
)

echo.
echo [..] Starting the app. Your browser will open automatically.
echo      Keep this window open while using the app.
echo      Close this window (or press Ctrl+C) to stop.
echo.

call npm run dev -- --open
pause
