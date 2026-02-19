@echo off
chcp 65001 > nul
REM Filo 開発サーバ起動
call "%~dp0_paths.bat"
cd /d "%~dp0.."
echo Filo 開発サーバを起動します...
echo   終了するには Ctrl+C を押してください
echo.
npm run tauri dev
