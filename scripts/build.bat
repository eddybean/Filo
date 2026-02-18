@echo off
REM Filo プロダクションビルド
call "%~dp0_paths.bat"
cd /d "%~dp0.."
echo Filo をビルドしています...
echo.
npm run tauri build

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ビルド完了！
    echo 出力先: src-tauri\target\release\bundle\
) else (
    echo.
    echo [エラー] ビルドに失敗しました。
)

pause
