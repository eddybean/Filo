@echo off
REM Filo テスト実行
call "%~dp0_paths.bat"
cd /d "%~dp0.."
echo.
echo === Rust テスト ===
cargo test --lib --manifest-path src-tauri\Cargo.toml
echo.
echo === フロントエンド テスト ===
npm run test
echo.

if %ERRORLEVEL% EQU 0 (
    echo 全テスト完了
) else (
    echo [エラー] テストに失敗しました
)

pause
