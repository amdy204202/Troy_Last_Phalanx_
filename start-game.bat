@echo off
setlocal
cd /d "%~dp0"
title Troy V16 - Last Phalanx
node --version >nul 2>nul
if errorlevel 1 (
  echo Node.js 18 or newer is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
node server.mjs
