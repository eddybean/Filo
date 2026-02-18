@echo off
REM Filo クリーンアップ（ビルド成果物・中間生成物の削除）
call "%~dp0_paths.bat"
cd /d "%~dp0.."

echo Filo のビルド成果物を削除します...
echo.

echo === Rust / Tauri ビルドキャッシュ (src-tauri\target) ===
cargo clean --manifest-path src-tauri\Cargo.toml
echo   完了

if exist "dist" (
    echo === フロントエンドビルド (dist) ===
    rmdir /s /q dist
    echo   完了
)

echo.
echo ======================================
echo   クリーン完了！
echo ======================================
echo.

pause
