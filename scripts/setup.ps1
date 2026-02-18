#Requires -Version 5.1
<#
.SYNOPSIS
    Filo 開発環境セットアップスクリプト (Windows)
.DESCRIPTION
    Rust, Node.js, および依存パッケージをインストールし、
    開発環境を構築します。管理者権限は不要です。
.EXAMPLE
    powershell -ExecutionPolicy Bypass -File scripts\setup.ps1
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step($msg) {
    Write-Host ""
    Write-Host "=== $msg ===" -ForegroundColor Cyan
}

function Test-Command($cmd) {
    try { Get-Command $cmd -ErrorAction Stop | Out-Null; return $true }
    catch { return $false }
}

# -------------------------------------------------------
# 1. Rust
# -------------------------------------------------------
Write-Step "Rust のチェック"

if (Test-Command "rustc") {
    $rustVersion = rustc --version
    Write-Host "  既にインストール済み: $rustVersion" -ForegroundColor Green
} else {
    Write-Host "  Rust をインストールします..."
    $rustupInit = "$env:TEMP\rustup-init.exe"
    Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile $rustupInit
    & $rustupInit -y --default-toolchain stable
    Remove-Item $rustupInit -ErrorAction SilentlyContinue

    # PATH を更新
    $cargoPath = "$env:USERPROFILE\.cargo\bin"
    $env:PATH = "$cargoPath;$env:PATH"

    $rustVersion = rustc --version
    Write-Host "  インストール完了: $rustVersion" -ForegroundColor Green
}

# -------------------------------------------------------
# 2. Node.js (fnm 経由)
# -------------------------------------------------------
Write-Step "Node.js のチェック"

if (Test-Command "node") {
    $nodeVersion = node --version
    Write-Host "  既にインストール済み: Node $nodeVersion" -ForegroundColor Green
} else {
    if (-not (Test-Command "fnm")) {
        Write-Host "  fnm をインストールします..."
        cargo install fnm
    }

    # fnm の環境変数を設定
    fnm env --use-on-cd --shell power-shell | Out-String | Invoke-Expression

    Write-Host "  Node.js LTS をインストールします..."
    fnm install --lts
    fnm use lts-latest

    $nodeVersion = node --version
    Write-Host "  インストール完了: Node $nodeVersion" -ForegroundColor Green
}

$npmVersion = npm --version
Write-Host "  npm: $npmVersion"

# -------------------------------------------------------
# 3. Tauri CLI
# -------------------------------------------------------
Write-Step "Tauri CLI のチェック"

$hasTauriCli = cargo install --list 2>$null | Select-String "tauri-cli"
if ($hasTauriCli) {
    Write-Host "  既にインストール済み" -ForegroundColor Green
} else {
    Write-Host "  Tauri CLI をインストールします..."
    cargo install tauri-cli --version "^2"
    Write-Host "  インストール完了" -ForegroundColor Green
}

# -------------------------------------------------------
# 4. プロジェクト依存パッケージ
# -------------------------------------------------------
Write-Step "npm パッケージのインストール"

Push-Location $PSScriptRoot\..
npm install
Pop-Location

Write-Host "  完了" -ForegroundColor Green

# -------------------------------------------------------
# 完了
# -------------------------------------------------------
Write-Host ""
Write-Host "======================================" -ForegroundColor Green
Write-Host "  セットアップ完了！" -ForegroundColor Green
Write-Host "======================================" -ForegroundColor Green
Write-Host ""
Write-Host "  開発サーバの起動:  scripts\dev.bat"
Write-Host "  ビルド:            scripts\build.bat"
Write-Host "  テスト:            scripts\test.bat"
Write-Host ""
