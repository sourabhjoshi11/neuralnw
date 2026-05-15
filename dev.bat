@echo off
setlocal

:: ============================================================
::  ClassChaos – one-click dev startup
::  Double-click this file from the project root.
::  Opens two separate terminal windows:
::    [1] FastAPI backend  →  http://localhost:8000
::    [2] Expo frontend    →  LAN URL (stable across restarts on same WiFi)
:: ============================================================

set ROOT=%~dp0

echo.
echo  ==============================================
echo    ClassChaos Dev Server
echo  ==============================================
echo.

:: ── 1. FastAPI backend ──────────────────────────────────────
echo  [1/2] Launching FastAPI backend (port 8000)...
start "ClassChaos  BACKEND" cmd /k ^
  "cd /d "%ROOT%backend" ^
  && echo Activating Python venv... ^
  && call venv\Scripts\activate ^
  && echo Starting uvicorn... ^
  && uvicorn main:app --reload --host 0.0.0.0 --port 8000"

:: Small delay so the backend window appears first
timeout /t 2 /nobreak >nul

:: ── 2. Expo frontend (LAN mode) ─────────────────────────────
echo  [2/2] Launching Expo frontend (LAN mode)...
start "ClassChaos  FRONTEND" cmd /k ^
  "cd /d "%ROOT%frontend" ^
  && echo Starting Expo in LAN mode... ^
  && npx expo start --lan --clear"

echo.
echo  Both windows are open!
echo.
echo  Backend  ^>  http://localhost:8000
echo             ^>  http://^<your-LAN-IP^>:8000  (phone on same WiFi)
echo  Frontend ^>  check the Expo window for the exp:// LAN URL / QR code
echo.
echo  TIP: LAN URL is based on your machine's local IP.
echo       It stays the same across restarts (same WiFi = scan once only).
echo       Phone and laptop must be on the same WiFi network.
echo.
pause
