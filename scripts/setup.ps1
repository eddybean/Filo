#Requires -Version 5.1
<#
.SYNOPSIS
    Filo 開発環境セットアップスクリプト (Windows)
.DESCRIPTION
    mise, Rust, Node.js, および依存パッケージをインストールし、
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
# 1. mise
# -------------------------------------------------------
Write-Step "mise のチェック"

if (Test-Command "mise") {
    $miseVersion = mise v
    Write-Host "  既にインストール済み: mise $miseVersion" -ForegroundColor Green
} else {
    Write-Host "  mise をインストールします..."
    winget install jdx.mise

    # PATH を更新
    $env:PATH = "$env:PATH;C:\Users\twili\AppData\Local\mise\shims"

    # Powershellのprofile追記
    if ((Test-Path $PROFILE) -eq "False") {
        $targetPath = Split-Path -Parent $PROFILE
        New-Item -ItemType Directory -Path $targetPath -Force
    }

    $activate = "(&mise activate pwsh) | Out-String | Invoke-Expression"
    Write-Output $activate | Add-Content $PROFILE -Encoding Default

    $miseVersion = mise v
    Write-Host "  インストール完了: mise $miseVersion" -ForegroundColor Green
}


# -------------------------------------------------------
# 2. Rust & Node.js (mise 経由)
# -------------------------------------------------------
Write-Step "Rust のチェック"

if ((Test-Command "rustc") -And (Test-Command "node")) {
    $rustVersion = rustc --version
    Write-Host "  既にインストール済み: $rustVersion" -ForegroundColor Green
    $nodeVersion = node --version
    Write-Host "  既にインストール済み: Node $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  Rust & Node.js をインストールします..."
    mise install

    $rustVersion = rustc --version
    Write-Host "  インストール完了: $rustVersion" -ForegroundColor Green

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
Write-Host "  開発サーバの起動:  npm run tauri dev"
Write-Host "  ビルド:            npm run tauri build"
Write-Host "  テスト:            npm run test:all"
Write-Host ""
