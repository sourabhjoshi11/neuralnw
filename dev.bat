@echo off
setlocal EnableExtensions

:: ============================================================
::  ClassChaos one-click dev startup
::  Detects the current LAN IP, updates frontend/.env, then
::  opens backend and Expo with auto-reload enabled.
:: ============================================================

set "ROOT=%~dp0"
set "FRONTEND_ENV=%ROOT%frontend\.env"

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "$ip = ipconfig | Select-String 'IPv4.*: (\d+\.\d+\.\d+\.\d+)' | ForEach-Object { $_.Matches[0].Groups[1].Value } | Where-Object { $_ -notmatch '^127\.' -and $_ -notmatch '^169\.254\.' } | Select-Object -First 1; $ip"`) do set "LAN_IP=%%I"

if "%LAN_IP%"=="" (
  echo  Could not detect a LAN IPv4 address.
  echo  Falling back to localhost. Mobile QR testing may not reach the backend.
  set LAN_IP=localhost
)

echo.
echo  ==============================================
echo    ClassChaos Dev Server
echo  ==============================================
echo.

echo  Backend URL ^> http://%LAN_IP%:8000
echo  WebSocket   ^> ws://%LAN_IP%:8000
echo.

echo  Updating frontend environment...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$path = '%FRONTEND_ENV%'; $api = 'EXPO_PUBLIC_API_URL=http://%LAN_IP%:8000'; $ws = 'EXPO_PUBLIC_WS_URL=ws://%LAN_IP%:8000'; $lines = if (Test-Path $path) { Get-Content $path } else { @() }; $hasApi = $false; $hasWs = $false; $lines = $lines | ForEach-Object { if ($_ -match '^EXPO_PUBLIC_API_URL=') { $hasApi = $true; $api } elseif ($_ -match '^EXPO_PUBLIC_WS_URL=') { $hasWs = $true; $ws } else { $_ } }; if (-not $hasApi) { $lines = @($api) + $lines }; if (-not $hasWs) { $lines = @($ws) + $lines }; Set-Content -Path $path -Value $lines"

echo  Stopping any old backend on port 8000...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$pids = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique; foreach ($pid in $pids) { Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue }"

echo  [1/2] Launching FastAPI backend (auto-reload enabled)...
start "ClassChaos BACKEND" cmd /k "cd /d "%ROOT%backend" && call venv\Scripts\activate && uvicorn main:app --reload --reload-dir . --host 0.0.0.0 --port 8000"

timeout /t 2 /nobreak >nul

echo  [2/2] Launching Expo frontend (LAN + Fast Refresh enabled)...
start "ClassChaos FRONTEND" cmd /k "cd /d "%ROOT%frontend" && set EXPO_USE_FAST_REFRESH=true && npx expo start --lan --clear"

echo.
echo  Done! Check the two new terminal windows.
echo  Backend  ^>  http://%LAN_IP%:8000
echo  Frontend ^>  scan QR from Expo window
echo  Reloads  ^>  backend restarts on Python changes; frontend Fast Refreshes on app changes
echo.
pause
