# CLAUDE.md

## Conversation Guidelines

- 常に日本語で会話する
- 応答は敬語不要
- 「良い指摘ですね」のような本題と関係のない感想は省くこと

## Project Overview

Filo はユーザ定義のルールセットに基づいてファイルを移動/コピーする Windows 11 向け GUI アプリ。
技術スタック: Tauri v2 (Rust バックエンド) + React 19 + TypeScript フロントエンド。
詳細な仕様は docs/SPEC.md を参照。

## セットアップ・ビルドスクリプト

| スクリプト | Windows | Linux/macOS |
|-----------|---------|-------------|
| 環境構築 | `scripts\setup.bat` | `scripts/setup.sh` |
| 開発サーバ | `scripts\dev.bat` | `npm run tauri dev` |
| ビルド | `scripts\build.bat` | `npm run tauri build` |
| テスト | `scripts\test.bat` | `scripts/test.sh` |
| クリーン | `scripts\clean.bat` | `cargo clean --manifest-path src-tauri/Cargo.toml` |

## Build & Run Commands

```bash
# Rust バックエンドテスト
cargo test --lib --manifest-path src-tauri/Cargo.toml

# フロントエンドテスト
npx vitest run                            # 全テスト実行
npx vitest run src/lib/types.test.ts      # 単一テスト実行

# TypeScript 型チェック
npx tsc --noEmit

# 開発サーバ起動（Tauri + Vite）
npm run tauri dev

# プロダクションビルド（ターゲットOS上で実行が必要）
npm run tauri build
```

## Architecture

```
src-tauri/src/          # Rust バックエンド
  ├── ruleset.rs        # ルールセットの型定義・YAML処理・バリデーション
  ├── filters.rs        # フィルタロジック（extensions, glob, regex, datetime）
  ├── engine.rs         # ファイル移動/コピーエンジン・Undo処理
  ├── commands.rs       # Tauri IPC コマンド（フロントエンドとのインターフェース）
  └── lib.rs            # エントリポイント・プラグイン登録

src/                    # React フロントエンド
  ├── components/       # UI コンポーネント
  ├── store/            # Zustand ストア (rulesetStore.ts)
  ├── lib/              # コマンドラッパー・型定義・i18n設定
  └── locales/          # 翻訳ファイル (ja, en)
```

## 実行環境とコマンド選択

### 動作環境

- **OS**: Windows 11（シェルは bash、cmd.exe ではない）
- Bash ツールは bash 構文を使うが、Windows 固有の制約がある

### Bash ツールで使ってはいけないコマンド

以下は Bash ツールでは失敗するか制限されているため、代わりに専用ツールを使う：

| コマンド | 推奨される代替手段 |
|-------------|---------|
| `echo` | テキスト出力は直接コメントで行う。ファイル書き込みは Write ツール |
| `cat`, `head`, `tail` | Read ツール |
| `grep`, `rg` | Grep ツール |
| `find`, `ls` | Glob ツール |
| `sed`, `awk` | Edit ツール |

Windows環境でコマンドを実行する際は、改行コードが `CRLF` 文字コードは `Shift-JIS` で行うこと

### Node.js スクリプト内でのパス・コマンド解決

- `process.cwd()` は実行コンテキストによって変わるため **`__dirname` から絶対パスを計算する**
- `shell: true` + `npx` は Windows の `cmd.exe` 経由になり環境差異が生じる。代わりに **`process.execPath`（現在の Node バイナリ）+ ローカルバイナリの絶対パス** を使う
  ```js
  // 例: vitest を確実に実行する
  const projectRoot = path.resolve(__dirname, "../..");
  const vitestMjs = path.join(projectRoot, "node_modules/vitest/vitest.mjs");
  spawnSync(process.execPath, [vitestMjs, "run"], { cwd: projectRoot });
  ```

## Development Philosophy

### Test-Driven Development (TDD)

- 原則としてテスト駆動開発（TDD）で進める
- 期待される入出力に基づき、まずテストを作成する
- 実装コードは書かず、テストのみを用意する
- テストを実行し、失敗を確認する
- テストが正しいことを確認できた段階でコミットする
- その後、テストをパスさせる実装を進める
- 実装中はテストを変更せず、コードを修正し続ける
- すべてのテストが通過するまで最大3回まで繰り返す

### テスト実行の義務

**ソースコードを変更（機能実装・バグ修正・リファクタリング）した場合は、作業完了時に必ず以下を実行してから応答を終了すること：**

```bash
npm run format
npm run format:rust
npx vitest run
```

- 全テストが通過したら結果をユーザーに報告する
- 失敗したら原因を分析して修正し、再度実行する（最大3回）
- テストが存在しない変更（ドキュメント修正等）は省略してよい
- テストが正常に完了したら、仕様に変更点がある場合のみ docs/SPEC.md へ反映する

# セッション引き継ぎ

- セッション開始時にプロジェクトルートの `.claude/handovers/` ディレクトリを確認し、ファイルが存在すれば最新のものを読み込む
- セッション終了時や作業の区切りでは `/handover` の実行を促す
