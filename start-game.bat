@echo off
setlocal
cd /d "%~dp0"
title Troy V19.1 - Last Phalanx
if exist "%~dp0runtime\node.exe" (
  "%~dp0runtime\node.exe" "%~dp0server.mjs"
  if errorlevel 1 pause
  exit /b
)
node --version >nul 2>nul
if errorlevel 1 (
  echo Use the standalone game ZIP, or install Node.js 18 or newer.
  pause
  exit /b 1
)
node "%~dp0server.mjs"
if errorlevel 1 pause
