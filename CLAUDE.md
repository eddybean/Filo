# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Conversation Guidelines

- 常に日本語で会話する

## Project Overview

Filo はユーザ定義のルールセットに基づいてファイルを移動/コピーする Windows 11 向け GUI アプリ。
技術スタック: Tauri v2 (Rust バックエンド) + React 19 + TypeScript フロントエンド。

## セットアップ・ビルドスクリプト

| スクリプト | Windows | Linux/macOS |
|-----------|---------|-------------|
| 環境構築 | `scripts\setup.bat` | `scripts/setup.sh` |
| 開発サーバ | `scripts\dev.bat` | `npm run tauri dev` |
| ビルド | `scripts\build.bat` | `npm run tauri build` |
| テスト | `scripts\test.bat` | `scripts/test.sh` |

## Build & Run Commands

```bash
# Linux/macOS: 環境変数の読み込み（各シェルセッションで必要）
export PATH="$HOME/.cargo/bin:$PATH" && eval "$($HOME/.cargo/bin/fnm env)"

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

## Key Conventions

- ルールセットの保存形式は YAML（`%APPDATA%/filo/rulesets/filo-rules.yaml`）
- フィルタ条件は AND 結合、extensions 内部は OR 結合
- Rust の `order` フィールドは不要（YAML 配列の順序で管理）
- `id` は UUID v4 で自動生成、YAML にも永続化
- i18n は react-i18next、翻訳キーは `src/locales/` の JSON を参照

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

### 開発ログの記録

- 実行したコマンドの履歴と結果を `docs/DEVLOG.md` に記録する
- 各フェーズの開始・完了時にログを更新する
- エラーが発生した場合はその内容と解決方法も記録する

# セッション引き継ぎ

- セッション開始時にプロジェクトルートの `.claude/handovers/` ディレクトリを確認し、ファイルが存在すれば最新のものを読み込む
- セッション終了時や作業の区切りでは `/handover` の実行を促す
