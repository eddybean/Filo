@echo off
REM ワークスペース用 PATH 設定（各スクリプトから call して使用）
REM このファイルは直接実行しないこと

REM Cargo (Rust) のパスを追加
if exist "%USERPROFILE%\.cargo\bin\cargo.exe" (
    set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
)

REM fnm (Node.js バージョンマネージャ) のパスを追加
if exist "%LOCALAPPDATA%\fnm\fnm.exe" (
    set "PATH=%LOCALAPPDATA%\fnm;%PATH%"
    FOR /f "tokens=*" %%i IN ('"%LOCALAPPDATA%\fnm\fnm.exe" env --use-on-cd --shell cmd-exe 2^>nul') DO %%i
)
