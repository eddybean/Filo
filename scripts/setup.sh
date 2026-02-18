#!/bin/bash
# Filo 開発環境セットアップ (Linux/macOS)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

step() { echo -e "\n\033[36m=== $1 ===\033[0m"; }
ok()   { echo -e "  \033[32m$1\033[0m"; }

# --- Rust ---
step "Rust のチェック"
if command -v rustc &>/dev/null; then
    ok "既にインストール済み: $(rustc --version)"
else
    echo "  Rust をインストールします..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    ok "インストール完了: $(rustc --version)"
fi
export PATH="$HOME/.cargo/bin:$PATH"

# --- Node.js (fnm) ---
step "Node.js のチェック"
if command -v node &>/dev/null; then
    ok "既にインストール済み: Node $(node --version)"
else
    if ! command -v fnm &>/dev/null; then
        echo "  fnm をインストールします..."
        cargo install fnm
    fi
    eval "$(fnm env)"
    fnm install --lts
    fnm use lts-latest
    ok "インストール完了: Node $(node --version)"
fi

# --- Tauri CLI ---
step "Tauri CLI のチェック"
if cargo install --list 2>/dev/null | grep -q "tauri-cli"; then
    ok "既にインストール済み"
else
    echo "  Tauri CLI をインストールします..."
    cargo install tauri-cli --version "^2"
    ok "インストール完了"
fi

# --- System packages (Linux only) ---
if [[ "$(uname)" == "Linux" ]]; then
    step "システムパッケージのチェック"
    MISSING=""
    for pkg in libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev libsoup-3.0-dev libgtk-3-dev librsvg2-dev; do
        if ! dpkg -s "$pkg" &>/dev/null; then
            MISSING="$MISSING $pkg"
        fi
    done
    if [ -n "$MISSING" ]; then
        echo "  以下のパッケージが必要です。sudo で実行してください:"
        echo "  sudo apt install -y build-essential pkg-config libssl-dev$MISSING"
    else
        ok "全パッケージインストール済み"
    fi
fi

# --- npm install ---
step "npm パッケージのインストール"
cd "$PROJECT_DIR"
npm install
ok "完了"

# --- Done ---
echo ""
echo -e "\033[32m======================================"
echo "  セットアップ完了！"
echo -e "======================================\033[0m"
echo ""
echo "  開発サーバの起動:  npm run tauri dev"
echo "  ビルド:            npm run tauri build"
echo "  テスト:            scripts/test.sh"
echo ""
