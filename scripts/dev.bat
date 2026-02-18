@echo off
REM Filo 開発サーバ起動
cd /d "%~dp0.."
echo Filo 開発サーバを起動します...
echo   終了するには Ctrl+C を押してください
echo.
npm run tauri dev
