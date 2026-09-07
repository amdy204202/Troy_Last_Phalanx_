@echo off
setlocal
cd /d "%~dp0"
title Troy V19 - Last Phalanx
if not exist "%~dp0runtime\node.exe" (
  echo The bundled runtime is missing. Extract the entire ZIP first.
  pause
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0server.mjs"
if errorlevel 1 pause
