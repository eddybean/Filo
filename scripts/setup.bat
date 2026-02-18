@echo off
REM Filo 開発環境セットアップ (Windows)
REM PowerShell スクリプトを呼び出すラッパー
echo.
echo Filo 開発環境セットアップを開始します...
echo.

powershell -ExecutionPolicy Bypass -File "%~dp0setup.ps1"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [エラー] セットアップに失敗しました。
    pause
    exit /b 1
)

pause
