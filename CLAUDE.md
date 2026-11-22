# CLAUDE.md

日本語で応答する。

## Project

Filo はユーザ定義のルールセットに基づいてファイルを移動/コピーする Windows 11 向け GUI アプリ。
Tauri v2 (Rust) + React 19 + TypeScript + Zustand。仕様の正は `docs/SPEC.md`。

```
src-tauri/src/
  ruleset.rs   ルールセット型・YAML 入出力・validate
  filters.rs   フィルタ（extensions / glob / regex / datetime）
  classify.rs  自動判定（ファイル名とサブフォルダ名のマッチング）
  engine.rs    移動/コピー・Undo
  commands.rs  Tauri IPC コマンド（lib.rs の generate_handler! に登録）
src/
  components/  UI（各コンポーネントの隣に *.test.tsx）
  store/       Zustand ストア
  lib/         IPC ラッパー (commands.ts)・型 (types.ts)・i18n
  locales/     ja / en 翻訳
```

- Rust の型を変えたら `src/lib/types.ts` も揃える（serde は snake_case のまま TS に渡る）。
- UI 文字列は直書きせず `src/locales/{ja,en}/translation.json` の両方に追加する。
- ルールセットの YAML に項目を足すときは `#[serde(default)]` で既存ファイルとの後方互換を保つ。

## Toolchain

- Node / Rust のバージョンは `mise.toml` の `[tools]` が正。初回は `mise install`。
- workspace で共有する秘密でない環境変数は `mise.toml` の `[env]` に書く。

## Commands

```bash
npm run test:rust      # cargo test --lib
npm run test:unit      # vitest run（単一: npx vitest run src/lib/types.test.ts）
npx tsc --noEmit       # 型チェック
npm run lint           # eslint
npm run format:all     # prettier + cargo fmt
npm run tauri dev      # アプリ起動（Vite 単体は npm run dev、port 1420）
```

`npm run tauri build` はターゲット OS 上でのみ実行可能。

## Workflow

- TDD で進める: 期待する入出力のテストを先に書き、失敗を確認してテストだけをコミット → 実装。実装中はテストを変えない。
- コード変更を終える前に `npm run format:all`、`npm run test:rust`、`npm run test:unit`、`npx tsc --noEmit` を通す。失敗の修正は3回まで試み、それでも通らなければ状況を報告して方針を仰ぐ。
- 仕様が変わったら `docs/SPEC.md` を更新する。
- コミットメッセージは Conventional Commits 形式で説明は日本語（例: `feat: 〜を追加`）。
- バージョン番号は手で上げない（リリース時に CI が `scripts/bump-version.js` で更新する）。

## Conventions

- ファイルは UTF-8 / LF（`.editorconfig` と `.gitattributes` に従う）。`.bat` / `.ps1` だけ CRLF。
- Rust テストは各ファイル末尾の `#[cfg(test)] mod tests`、一時ファイルは `tempfile::tempdir()`。
- フロントのテストは `src/test/mocks/`（`setupTauriMocks`・`fixtures.ts`）で IPC をモックする。
- Node スクリプトでは `process.cwd()` に頼らず `import.meta.url` からパスを解決する。子プロセスは `shell: true` + `npx` ではなく `process.execPath` とローカルバイナリの絶対パスで起動する。
