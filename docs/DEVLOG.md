# 開発ログ (DEVLOG)

実行したコマンドの履歴と各フェーズの進捗を記録する。

---

## Phase 1: 環境構築

### 1-1. システム依存パッケージのインストール
```bash
sudo apt update && sudo apt install -y \
  build-essential pkg-config libssl-dev \
  libgtk-3-dev librsvg2-dev \
  libwebkit2gtk-4.1-dev libjavascriptcoregtk-4.1-dev libsoup-3.0-dev \
  curl wget file
```
結果: ユーザが手動実行 → 成功

### 1-2. Rust のインストール
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
```
結果: rustc 1.93.1, cargo 1.93.1

### 1-3. Node.js のインストール (fnm 経由)
```bash
cargo install fnm
fnm install --lts
fnm use lts-latest
```
結果: Node v24.13.1, npm 11.8.0

### 1-4. Tauri CLI のインストール
```bash
cargo install tauri-cli --version "^2"
```
結果: tauri-cli v2.10.0

---

## Phase 2: プロジェクト初期化

### 2-1. Tauri v2 プロジェクト作成
```bash
npm create tauri-app@latest filo-init -- --template react-ts -y
# /tmp/filo-init に作成後、プロジェクトディレクトリへコピー（既存ファイルがあったため）
```
結果: 成功

### 2-2. 追加パッケージのインストール
```bash
npm install zustand react-i18next i18next i18next-browser-languagedetector \
  @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities \
  tailwindcss @tailwindcss/vite @tauri-apps/plugin-dialog
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```
結果: 成功

### 2-3. Rust依存パッケージ追加 (Cargo.toml)
追加: serde_yaml, uuid, glob, regex, chrono, thiserror, dirs, tauri-plugin-dialog
dev-dependencies: tempfile
結果: 成功

### 2-4. プロジェクト構成の整備
- パッケージ名を `filo-init` → `filo` にリネーム
- tauri.conf.json のアプリ名・ウィンドウタイトルを更新
- Vite設定に Tailwind CSS と Vitest 設定を追加
- i18n 設定・翻訳ファイル (ja/en) を作成

---

## Phase 3: Rust バックエンド実装

### 3-1. 型定義と YAML 処理 (ruleset.rs)
テスト11件作成 → 全通過
- YAML ラウンドトリップ、SPEC準拠YAML解析、バリデーション、ファイル保存/読み込み

### 3-2. フィルタロジック (filters.rs)
テスト11件追加 → 全22件通過
- extensions, filename(glob/regex), datetime range, AND結合

### 3-3. ファイル操作エンジン (engine.rs)
テスト12件追加 → 全34件通過
- 移動/コピー, 上書き制御, フィルタ適用, ディレクトリ自動作成, Undo

### 3-4. Tauri IPC コマンド (commands.rs)
実装完了、全34テスト通過維持
- 借用問題を修正 (update_and_save関数)

---

## Phase 4: React フロントエンド実装

### 4-1. 基盤セットアップ
- TypeScript 型定義 (lib/types.ts)
- Tauri コマンドラッパー (lib/commands.ts)
- Zustand ストア (store/rulesetStore.ts)
- i18n 設定 (lib/i18n.ts)

### 4-2. コンポーネント実装
- Toolbar.tsx: ツールバー
- RulesetCard.tsx: 個別ルールセット表示
- RulesetList.tsx: ドラッグ&ドロップ対応一覧
- RulesetEditDialog.tsx: 編集ダイアログ
- ExecutionResultDialog.tsx: 実行結果ダイアログ (Undo機能付き)
- App.tsx: メインレイアウト

### 検証
```bash
npx tsc --noEmit    # 型チェック通過
npx vitest run      # フロントエンドテスト2件通過
cargo test --lib    # Rustテスト34件通過
```

---

## Phase 5: 統合・最終更新

- CLAUDE.md をビルドコマンド・アーキテクチャ情報で更新
- DEVLOG.md を最終更新
