@echo off
echo ========================================
echo   ClassChaos Deployment Helper
echo ========================================
echo.

:menu
echo Choose deployment option:
echo.
echo 1. Build for Web (Vercel)
echo 2. Build Android APK (Play Store)
echo 3. Test Production Build
echo 4. Deploy to Vercel
echo 5. Exit
echo.
set /p choice="Enter choice (1-5): "

if "%choice%"=="1" goto web
if "%choice%"=="2" goto android
if "%choice%"=="3" goto test
if "%choice%"=="4" goto deploy
if "%choice%"=="5" goto end
goto menu

:web
echo.
echo Building for web...
cd frontend
call npx expo export --platform web
echo.
echo ✅ Web build complete! Files in: frontend/dist
echo.
pause
goto menu

:android
echo.
echo Building Android APK...
echo Make sure you're logged in to Expo: eas login
echo.
cd frontend
call eas build --platform android --profile production
echo.
echo ✅ APK build started! Check Expo dashboard for download link.
echo.
pause
goto menu

:test
echo.
echo Testing production build locally...
cd frontend
call npx expo export --platform web
echo.
echo Starting local server...
cd dist
python -m http.server 8000
echo.
echo ✅ Test at: http://localhost:8000
echo.
pause
goto menu

:deploy
echo.
echo Deploying to Vercel...
cd frontend
call vercel --prod
echo.
echo ✅ Deployed! Check Vercel dashboard for URL.
echo.
pause
goto menu

:end
echo.
echo Goodbye!
exit
