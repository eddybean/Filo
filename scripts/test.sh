#!/bin/bash
# Filo テスト実行 (Linux/macOS)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo ""
echo "=== Rust テスト ==="
cargo test --lib --manifest-path src-tauri/Cargo.toml

echo ""
echo "=== フロントエンド テスト ==="
npx vitest run

echo ""
echo "全テスト完了"
