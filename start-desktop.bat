@echo off
REM Double-click on Windows to open MZK POS desktop window
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required. Install from https://nodejs.org
  pause
  exit /b 1
)
if not exist "node_modules\electron" (
  echo Installing dependencies first run...
  call npm install
)
call npm run electron:dev
pause
