# Filo - ソフトウェア仕様書

## 1. 概要

**Filo** は、ユーザが定義したルールセットに基づいてファイルを移動またはコピーするWindows 11向けGUIアプリケーションである。

### 1.1 用語定義

| 用語 | 定義 |
|------|------|
| ルールセット | ファイル操作の条件を定義した一つのまとまり。移動元・フィルタ条件・移動先・オプションで構成される |
| フィルタ | ルールセット内で対象ファイルを絞り込むための条件。複数指定時はAND結合 |
| 一括実行 | 有効な全ルールセットを上から順に実行すること |
| アクション | ファイルに対する操作種別。「移動」または「コピー」 |

### 1.2 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 19 + TypeScript |
| バックエンド | Rust (Tauri v2) |
| UIライブラリ | Tailwind CSS のみ（外部UIライブラリなし） |
| スタイリング | Tailwind CSS |
| 状態管理 | Zustand |
| 国際化 (i18n) | react-i18next |
| ルールセット保存形式 | YAML |
| ビルドツール | Vite |
| テスト (Frontend) | Vitest + React Testing Library |
| テスト (Backend) | Rust 標準テストフレームワーク |

---

## 2. ルールセット仕様

### 2.1 ルールセットの構造

```yaml
# filo-rules.yaml
version: 1
rulesets:
  - id: "550e8400-e29b-41d4-a716-446655440000"
    name: "画像ファイルを整理"
    enabled: true
    source_dir: "C:/Users/user/Downloads"
    destination_dir: "C:/Users/user/Pictures/sorted"
    action: "move"       # "move" | "copy"
    overwrite: false
    filters:
      extensions:
        - ".jpg"
        - ".png"
        - ".gif"
      filename:
        pattern: "screenshot_*"
        match_type: "glob"  # "glob" | "regex"
      created_at:
        start: "2025-01-01T00:00:00"
        end: null
      modified_at:
        start: null
        end: "2025-12-31T23:59:59"
```

### 2.2 各フィールド定義

#### 基本フィールド

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| `id` | string | Yes | ルールセットの一意識別子（UUID v4）。新規作成時に自動生成。YAMLにも永続化する |
| `name` | string | Yes | ルールセットの表示名 |
| `enabled` | bool | Yes | 有効/無効フラグ |
| `source_dir` | string | Yes | 移動元フォルダのパス |
| `destination_dir` | string | Yes | 移動先フォルダのパス |
| `action` | `"move"` \| `"copy"` | Yes | ファイル操作種別。デフォルト: `"move"` |
| `overwrite` | bool | Yes | 移動先に同名ファイルが存在する場合に上書きするか |

#### 並び順について

- ルールセットの並び順はYAML配列内のインデックス順で決定する
- 専用の `order` フィールドは持たない。UIでの並び替えはYAML配列の順序変更として保存される

#### フィルタフィールド（`filters` 内、すべてオプション。1つ以上の指定が必要）

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `extensions` | string[] | 対象とするファイル拡張子のリスト（`.` 付き、大文字小文字を区別しない） |
| `filename.pattern` | string | ファイル名のマッチングパターン |
| `filename.match_type` | `"glob"` \| `"regex"` | パターンのマッチング方式。`glob` は `*` `?` によるワイルドカード。 `regex` は正規表現 |
| `created_at.start` | datetime? | ファイル作成日時の下限（この日時以降） |
| `created_at.end` | datetime? | ファイル作成日時の上限（この日時以前） |
| `modified_at.start` | datetime? | ファイル更新日時の下限 |
| `modified_at.end` | datetime? | ファイル更新日時の上限 |

#### フィルタ結合ロジック

- 複数のフィルタを指定した場合、すべての条件を満たすファイルのみが対象（AND結合）
- `extensions` は内部でOR結合（いずれかの拡張子に一致すればOK）
- 日時フィルタは `start` のみ、`end` のみ、両方指定のいずれも可

### 2.3 YAMLファイルの保存場所

- デフォルト: アプリケーションデータディレクトリ（`%APPDATA%/filo/rulesets/`）
- ユーザがYAMLファイルのパスを指定してインポート/エクスポート可能

---

## 3. 画面仕様

### 3.1 メイン画面

メイン画面はルールセットの一覧管理と実行制御を担う。

```
┌─────────────────────────────────────────────────────┐
│  Filo                                      [─][□][×] │
├─────────────────────────────────────────────────────┤
│  Filo | [+ 新規作成] [▶ 一括実行]  [インポート] [エクスポート] [🌙] │
├─────────────────────────────────────────────────────┤
│                                                       │
│  ☑ 1. 画像ファイルを整理        移動  [▶][✎][🗑]     │
│     Downloads → Pictures/sorted                       │
│     .jpg, .png, .gif | glob: screenshot_*             │
│                                                       │
│  ☐ 2. ログファイルをアーカイブ   コピー [▶][✎][🗑]     │
│     C:/logs → D:/archive/logs                         │
│     .log | 更新日: ~2024-12-31                         │
│                                                       │
│  ☑ 3. ドキュメント整理          移動  [▶][✎][🗑]     │
│     Desktop → Documents/organized                     │
│     .pdf, .docx                                       │
│                                                       │
├─────────────────────────────────────────────────────┤
│  ステータスバー: 3件のルールセット (2件有効)              │
└─────────────────────────────────────────────────────┘
```

#### メイン画面の機能

| 機能 | 説明 |
|------|------|
| ルールセット一覧表示 | 各ルールセットを名前・アクション種別・概要付きでリスト表示 |
| 有効/無効の切替 | チェックボックスで個別に切替。無効なルールセットは一括実行時にスキップ |
| 並び替え | ドラッグ&ドロップで順序変更。一括実行時の実行順序に直結 |
| 個別実行 | 各ルールセットの「実行」ボタンで単体実行 |
| 一括実行 | 有効な全ルールセットを上から順番に実行 |
| 新規作成 | ルールセット編集ダイアログを開く |
| 編集 | 既存ルールセットの編集ダイアログを開く |
| 削除 | 確認ダイアログの後、ルールセットを削除 |
| インポート | 外部YAMLファイルからルールセットを読み込む |
| エクスポート | 現在のルールセットをYAMLファイルとして保存 |
| ダークモード切替 | ツールバーの🌙/☀️ボタンでライト/ダーク切替。設定は `localStorage` に永続化 |

### 3.2 ルールセット編集ダイアログ

ルールセットの作成・編集を行うモーダルダイアログ。

```
┌───────────────────────────────────────────┐
│  ルールセット編集                       [×] │
├───────────────────────────────────────────┤
│                                             │
│  名前:  [画像ファイルを整理            ]    │
│                                             │
│  移動元: [C:/Users/user/Downloads   ][📁]  │
│  移動先: [C:/Users/user/Pictures    ][📁]  │
│                                             │
│  アクション: (●) 移動  (○) コピー            │
│  ☐ 同名ファイルを上書きする                  │
│                                             │
│  ─── フィルタ条件 ───────────────────────    │
│                                             │
│  拡張子: [.jpg] [.png] [.gif] [+ 追加]      │
│                                             │
│  ファイル名パターン:                         │
│    方式: (●) glob  (○) 正規表現              │
│    パターン: [screenshot_*              ]    │
│                                             │
│  作成日時:                                   │
│    開始: [                ] 終了: [        ] │
│                                             │
│  更新日時:                                   │
│    開始: [                ] 終了: [        ] │
│                                             │
│               [キャンセル] [保存]             │
└───────────────────────────────────────────┘
```

#### 編集ダイアログの機能

| 機能 | 説明 |
|------|------|
| 閉じるボタン | ダイアログ右上の × ボタンでダイアログを閉じる |
| 変更破棄の確認 | × またはキャンセルボタン押下時、入力中の内容がある場合は破棄確認ダイアログを表示。OKのみ閉じる |
| フォルダ選択 | 📁 ボタンでOS標準のフォルダ選択ダイアログを呼び出す |
| アクション選択 | 「移動」と「コピー」をラジオボタンで切替 |
| 拡張子入力 | タグ形式で複数追加・削除が可能 |
| ファイル名パターン | glob または正規表現を選択してパターンを入力 |
| 日時入力 | カレンダーピッカーまたは手動入力 |
| バリデーション | 保存時に必須フィールドとフィルタ条件（1つ以上）を検証 |

### 3.3 実行結果ダイアログ

ルールセット実行後に結果を表示する。移動済みファイルのUndo機能を提供する。

```
┌─────────────────────────────────────────────────┐
│  実行結果                                         │
├─────────────────────────────────────────────────┤
│                                                   │
│  ルールセット: 画像ファイルを整理                    │
│  アクション: 移動 | ステータス: 完了                 │
│                                                   │
│  ✓ 成功: 15件  ⚠ スキップ: 2件  ✗ エラー: 1件     │
│                                                   │
│  [すべて元に戻す]                                  │
│                                                   │
│  ─── 詳細 ─────────────────────────────────────  │
│                                                   │
│  ✓ screenshot_001.png                     [↩ 戻す] │
│    Downloads/ → Pictures/sorted/                   │
│                                                   │
│  ✓ screenshot_002.png                     [↩ 戻す] │
│    Downloads/ → Pictures/sorted/                   │
│                                                   │
│  ⚠ photo.jpg                                      │
│    スキップ: 同名ファイルが移動先に存在               │
│                                                   │
│  ✗ locked.png                                     │
│    エラー: アクセスが拒否されました                   │
│                                                   │
│                                          [閉じる]  │
└─────────────────────────────────────────────────┘
```

#### 実行結果の情報

| 項目 | 説明 |
|------|------|
| サマリー | 成功・スキップ・エラーの件数を色分けアイコン付きで表示 |
| 詳細リスト | 各ファイルごとの結果。ステータスに応じてアイコンと色を変える |
| 成功（✓ 緑） | 正常に移動/コピーできたファイル。移動元→移動先のパスを表示 |
| スキップ（⚠ 黄） | 上書き無効時に同名ファイルが存在してスキップしたファイル。理由を表示 |
| エラー（✗ 赤） | アクセス権限不足等で失敗したファイル。エラー理由を表示 |

#### Undo（元に戻す）機能

| 機能 | 説明 |
|------|------|
| 個別Undo | 成功した各ファイルの「戻す」ボタンで、そのファイルを元の場所に戻す |
| 一括Undo | 「すべて元に戻す」ボタンで、成功した全ファイルを一括で元に戻す |
| 対象 | アクションが「移動」の場合のみ有効。「コピー」の場合はUndoボタンを非表示 |
| Undo後の表示 | Undo成功時はステータスを「↩ 元に戻しました」に更新。失敗時はエラー表示 |
| 有効期間 | 実行結果ダイアログが開いている間のみ有効。ダイアログを閉じるとUndo不可 |

### 3.4 実行中ローディングUI

ルールセット実行中（個別・一括ともに）は画面全体にオーバーレイを表示する。

```
┌─────────────────────────────────────────────────────┐
│  Filo                                      [─][□][×] │
├─────────────────────────────────────────────────────┤
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
│  ░░░░░░░  ┌─────────────────────────────┐  ░░░░░░░  │
│  ░░░░░░░  │         ◌ 処理中...          │  ░░░░░░░  │
│  ░░░░░░░  │  画像整理 / screenshot_1.jpg  │  ░░░░░░░  │
│  ░░░░░░░  └─────────────────────────────┘  ░░░░░░░  │
│  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░  │
└─────────────────────────────────────────────────────┘
```

#### ローディングUIの仕様

| 項目 | 内容 |
|------|------|
| 表示タイミング | 実行ボタン押下直後から実行完了まで |
| スピナー | アニメーションするスピナーを表示 |
| 処理中ファイル表示 | バックエンドから `execution-progress` イベントを受信し、「ルールセット名 / ファイル名」形式でリアルタイム表示 |
| 操作ブロック | オーバーレイ中はルールセット一覧・ツールバーへの操作が不可（オーバーレイが前面に表示） |

#### アプリ終了防止

| 項目 | 内容 |
|------|------|
| 対象 | 実行中（`executing = true`）の状態でのみ有効 |
| 動作 | ウィンドウの閉じるボタン押下時に確認ダイアログを表示 |
| OK時 | アプリを終了する |
| キャンセル時 | 終了をキャンセルし実行を継続する |
| 非実行中 | ハンドラを登録しないため、ウィンドウは通常通り即時終了する |

### 3.5 テーマ / ダークモード

#### 概要

ツールバーのトグルボタンでライトモード・ダークモードを手動切替できる。設定は `localStorage` に永続化し、次回起動時も引き継がれる。

#### カラーパレット（スレートグレー系）

| 要素 | ライトモード | ダークモード |
|------|------------|------------|
| ページ背景 | `slate-50` | `slate-950` |
| カード / パネル背景 | `white` | `slate-900` |
| ボーダー | `slate-200` | `slate-700/60` |
| テキスト（主） | `slate-900` | `slate-100` |
| テキスト（補助） | `slate-500` | `slate-400` |
| テキスト（弱） | `slate-400` | `slate-600` |
| アクセント（プライマリ） | `blue-600` | `blue-500` |
| アクセント（成功） | `emerald-600` | `emerald-500` |
| アクセント（警告） | `amber-600` | `amber-400` |
| アクセント（危険） | `red-500` | `red-400` |

#### 実装方式

- Tailwind CSS v4 の `@custom-variant dark (&:where(.dark, .dark *))` を使用
- `App.tsx` の `<main>` 要素に `.dark` クラスを付与することで全子コンポーネントにダークテーマを伝搬
- `darkMode` は `App.tsx` の `useState` で管理し、`Toolbar` へプロップスとして渡す

---

## 4. バックエンド仕様

### 4.1 コア機能（Rust側）

#### ルールセット管理

- YAMLファイルの読み込み・書き込み（serde + serde_yaml）
- ルールセットのバリデーション
- ルールセットの並び順管理（YAML配列の順序）

#### ファイル操作エンジン

```
[ルールセット実行フロー]

1. source_dir の存在確認
2. destination_dir の存在確認（存在しない場合は作成）
3. source_dir 内のファイル一覧取得（サブフォルダは対象外、直下のみ）
4. 各ファイルに対してフィルタ条件を適用
   4a. extensions フィルタ
   4b. filename フィルタ（glob or regex）
   4c. created_at フィルタ
   4d. modified_at フィルタ
   4e. すべてのフィルタがtrueの場合のみ対象
5. 対象ファイルを destination_dir へ移動またはコピー
   5a. overwrite=false かつ同名ファイル存在 → スキップ
   5b. overwrite=true かつ同名ファイル存在 → 上書き
   5c. 操作失敗 → エラー記録して続行
6. 実行結果を返却
```

#### Undo処理フロー

```
[Undo フロー（移動の場合のみ）]

1. 対象ファイルが移動先に存在するか確認
2. 元のパス（source_dir）にファイルを移動
   2a. 元のパスに同名ファイルが存在する場合 → エラー（上書きしない）
   2b. 移動失敗 → エラーを返却
3. Undo結果を返却
```

### 4.2 Tauri コマンド（IPC）

フロントエンドとバックエンド間のインターフェース。

| コマンド | 引数 | 戻り値 | 説明 |
|---------|------|--------|------|
| `get_rulesets` | なし | `Ruleset[]` | 全ルールセットを取得 |
| `save_ruleset` | `Ruleset` | `Result<()>` | ルールセットを保存（新規/更新） |
| `delete_ruleset` | `id: string` | `Result<()>` | ルールセットを削除 |
| `reorder_rulesets` | `ids: string[]` | `Result<()>` | 並び順を更新 |
| `execute_ruleset` | `id: string` | `ExecutionResult` | 単一ルールセット実行。処理ファイルごとに `execution-progress` イベントを発火 |
| `execute_all` | なし | `ExecutionResult[]` | 有効な全ルールセットを順次実行。処理ファイルごとに `execution-progress` イベントを発火 |
| `undo_file` | `source: string, dest: string` | `Result<()>` | 単一ファイルのUndo |
| `undo_all` | `files: UndoRequest[]` | `UndoResult[]` | 複数ファイルの一括Undo |
| `import_rulesets` | `path: string` | `Result<Ruleset[]>` | YAMLファイルからインポート |
| `export_rulesets` | `path: string` | `Result<()>` | YAMLファイルへエクスポート |

> **注**: フォルダ選択ダイアログ (`select_folder`) はフロントエンドから `@tauri-apps/plugin-dialog` の `open()` を直接呼び出すため、Tauri コマンドとしては存在しない。

#### Tauri イベント（バックエンド → フロントエンド）

| イベント名 | ペイロード | 発火タイミング |
|-----------|-----------|-------------|
| `execution-progress` | `{ ruleset_name: string, filename: string }` | ルールセット実行中、フィルタ条件を通過したファイルを処理するたびに発火 |

### 4.3 データ型定義（Rust）

```rust
struct Ruleset {
    id: String,               // UUID v4（YAMLに永続化）
    name: String,
    enabled: bool,
    source_dir: String,       // フォルダパス（文字列。IPC経由で受け渡すためStringを使用）
    destination_dir: String,  // フォルダパス（同上）
    action: Action,           // Move | Copy
    overwrite: bool,
    filters: Filters,
}

enum Action {
    Move,
    Copy,
}

struct Filters {
    extensions: Option<Vec<String>>,
    filename: Option<FilenameFilter>,
    created_at: Option<DateTimeRange>,
    modified_at: Option<DateTimeRange>,
}

struct FilenameFilter {
    pattern: String,
    match_type: MatchType,    // Glob | Regex
}

struct DateTimeRange {
    start: Option<String>,    // RFC3339形式の日時文字列（例: "2025-01-01T00:00:00+09:00"）
    end: Option<String>,      // RFC3339形式の日時文字列
}

struct ExecutionResult {
    ruleset_id: String,
    ruleset_name: String,
    action: Action,
    status: ExecutionStatus,  // Completed | PartialFailure | Failed
    succeeded: Vec<FileResult>,
    skipped: Vec<FileResult>,
    errors: Vec<FileResult>,
}

struct FileResult {
    filename: String,
    source_path: PathBuf,
    destination_path: Option<PathBuf>,
    reason: Option<String>,
}

struct UndoRequest {
    source_path: PathBuf,      // 元のパス（戻し先）
    destination_path: PathBuf, // 現在のパス（移動先にあるファイル）
}

// Tauriイベントペイロード
struct ExecutionProgressPayload {
    ruleset_name: String,
    filename: String,
}
```

> **注**: `source_dir` / `destination_dir` を `PathBuf` ではなく `String` にしているのは、Tauri v2 の IPC シリアライズで TypeScript の `string` と相互変換するため。内部でファイル操作する際は `PathBuf::from(&self.source_dir)` 等で変換する。

---

## 5. 国際化 (i18n)

### 5.1 対応言語

| 言語 | ロケールコード | 備考 |
|------|-------------|------|
| 日本語 | `ja` | デフォルト言語 |
| 英語 | `en` | |

### 5.2 実装方針

- フロントエンド: `react-i18next` を使用
- 翻訳ファイルは `src/locales/{lang}/translation.json` に配置
- 言語切替はアプリ設定から行う（メイン画面のツールバーまたは設定メニュー）
- OSのシステム言語を検出し、初回起動時に自動選択する
- ルールセット名などユーザ入力値は翻訳対象外

### 5.3 翻訳ファイル構成

```
src/locales/
├── ja/
│   └── translation.json
└── en/
    └── translation.json
```

---

## 6. プロジェクト構成

```
filo/
├── docs/
│   └── SPEC.md                  # 本仕様書
├── src-tauri/                   # Rust バックエンド
│   ├── src/
│   │   ├── main.rs              # エントリポイント
│   │   ├── commands.rs          # Tauri IPCコマンド
│   │   ├── ruleset.rs           # ルールセットの型定義・YAML処理
│   │   ├── engine.rs            # ファイル操作エンジン
│   │   └── filters.rs           # フィルタロジック
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                         # React フロントエンド
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── RulesetList.tsx       # ルールセット一覧（ドラッグ&ドロップ）
│   │   ├── RulesetCard.tsx       # 個別ルールセット表示
│   │   ├── RulesetCard.test.tsx  # ↑ コンポーネントテスト
│   │   ├── RulesetEditDialog.tsx # 編集ダイアログ
│   │   ├── RulesetEditDialog.test.tsx # ↑ コンポーネントテスト
│   │   ├── ExecutionResultDialog.tsx  # 実行結果ダイアログ
│   │   ├── LoadingOverlay.tsx    # 実行中ローディングオーバーレイ
│   │   └── Toolbar.tsx           # ツールバー
│   │   └── Toolbar.test.tsx      # ↑ コンポーネントテスト
│   ├── lib/
│   │   ├── commands.ts          # Tauriコマンド呼び出し
│   │   ├── types.ts             # TypeScript型定義
│   │   └── types.test.ts        # ↑ 型定義テスト
│   ├── locales/                 # i18n翻訳ファイル
│   │   ├── ja/translation.json
│   │   └── en/translation.json
│   ├── store/
│   │   ├── rulesetStore.ts      # Zustand ストア
│   │   └── rulesetStore.test.ts # ↑ ストアテスト
│   └── test/                    # テスト共通インフラ
│       ├── setup.ts             # Vitest セットアップ（jest-dom, i18n初期化）
│       ├── helpers/
│       │   └── renderWithProviders.tsx  # i18nラッパー付きrender
│       └── mocks/
│           ├── fixtures.ts      # テスト用データ定義
│           └── tauri.ts         # Tauri IPC モック（mockIPC）
├── CLAUDE.md
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.ts
```

---

## 7. テスト仕様

### 7.1 テストアーキテクチャ

2層構成でフロントエンド・バックエンドをそれぞれカバーする。

| レイヤー | フレームワーク | 対象 | 件数 |
|---------|--------------|------|------|
| Layer 1: Rust 単体テスト | Rust 標準テスト | `ruleset.rs`, `filters.rs`, `engine.rs` のロジック | 34件 |
| Layer 2: Vitest コンポーネントテスト | Vitest + @testing-library/react | UI コンポーネント・Zustand ストア | 25件 |

### 7.2 テスト実行コマンド

```bash
# フロントエンドテストのみ（約4秒）
npx vitest run

# Rust テストのみ
cargo test --lib --manifest-path src-tauri/Cargo.toml

# 両方まとめて実行
npm run test:all
```

### 7.3 Vitest テスト一覧

#### `src/components/Toolbar.test.tsx`（5件）

| テスト内容 |
|-----------|
| 「新規作成」クリック → `onCreateNew` が呼ばれる |
| 「一括実行」クリック → `onExecuteAll` が呼ばれる |
| `executing=true` のとき「一括実行」ボタンが disabled になる |
| 「インポート」クリック → `onImport` が呼ばれる |
| 「エクスポート」クリック → `onExport` が呼ばれる |

#### `src/components/RulesetCard.test.tsx`（7件）

| テスト内容 |
|-----------|
| ルールセット名が表示される |
| ソースパスが表示される |
| チェックボックス変更 → `onToggleEnabled` が呼ばれる |
| 「▶」クリック → `onExecute` が呼ばれる |
| 「✎」クリック → `onEdit` が呼ばれる |
| 「🗑」クリック → `onDelete` が呼ばれる |
| `enabled=false` のとき透過スタイル（`opacity-50`）が適用される |

#### `src/components/RulesetEditDialog.test.tsx`（6件）

| テスト内容 |
|-----------|
| 名前未入力で保存 → バリデーションエラーが表示される |
| フィルタなしで保存 → バリデーションエラーが表示される |
| 拡張子の追加・削除が動作する |
| 有効なデータで保存 → `onSave` が呼ばれる |
| 変更なしでキャンセル → confirm なしで `onCancel` が呼ばれる |
| 変更ありでキャンセル → confirm ダイアログが呼ばれる |

#### `src/store/rulesetStore.test.ts`（5件）

| テスト内容 |
|-----------|
| `fetchRulesets` → IPC `get_rulesets` が呼ばれてストアに反映される |
| `saveRuleset` → `save_ruleset` → `get_rulesets` の順で IPC が呼ばれる |
| `deleteRuleset` → `delete_ruleset` → `get_rulesets` の順で IPC が呼ばれる |
| IPC 失敗時 → `error` フィールドに設定される |
| `executeRuleset` → `execute_ruleset` IPC が呼ばれる |

#### `src/lib/types.test.ts`（2件）

| テスト内容 |
|-----------|
| TypeScript 型定義の基本構造検証 |

### 7.4 テストインフラ

#### `src/test/mocks/fixtures.ts`

テストで共通利用するデータ定数を定義する。

| エクスポート名 | 内容 |
|-------------|------|
| `defaultRuleset` | 基本的なルールセット（action: move, extensions: .jpg/.png） |
| `copyRuleset` | action: copy のルールセット（Undo 非表示テスト用） |
| `disabledRuleset` | enabled: false のルールセット |
| `defaultExecutionResult` | 成功1件の ExecutionResult |

#### `src/test/mocks/tauri.ts`

`@tauri-apps/api/mocks` の `mockIPC` を使い、全 IPC コマンドをモック化する。

```typescript
setupTauriMocks(overrides?: IPCOverrides): void
```

- 引数なしで呼ぶとすべてのコマンドがデフォルト応答（`get_rulesets` → `[defaultRuleset]` 等）を返す
- `overrides` で特定コマンドのみ挙動を差し替え可能（エラーケース再現に使用）

#### `src/test/helpers/renderWithProviders.tsx`

```typescript
renderWithProviders(ui: React.ReactElement): RenderResult
```

`I18nextProvider`（日本語固定）でラップした上で `render()` を呼ぶヘルパー関数。
翻訳テキストを確定させることで、テスト内での日本語文字列による検証を可能にする。

### 7.5 テスタビリティのための属性（`data-testid`）

テスト内での要素特定に `data-testid` 属性を使用する。
クラス名や表示テキストに依存しないため、UIデザイン変更の影響を受けにくい。

| コンポーネント | 主な `data-testid` |
|-------------|------------------|
| `Toolbar` | `toolbar`, `toolbar-create`, `toolbar-execute-all`, `toolbar-import`, `toolbar-export` |
| `RulesetCard` | `ruleset-card`, `ruleset-toggle`, `ruleset-name`, `ruleset-execute`, `ruleset-edit`, `ruleset-delete` |
| `RulesetEditDialog` | `edit-dialog`, `field-name`, `field-source-dir`, `field-dest-dir`, `btn-save`, `btn-cancel`, `extension-input`, `btn-extension-add`, `validation-errors` |
| `ExecutionResultDialog` | `result-dialog`, `btn-result-close`, `btn-undo-all` |
| `LoadingOverlay` | `loading-overlay` |

---

## 8. 非機能要件  <!-- 旧: 7 -->

| 項目 | 内容 |
|------|------|
| 対象OS | Windows 11 |
| UI言語 | 日本語（デフォルト）、英語 |
| テーマ | ライトモード・ダークモードの手動切替に対応。設定は localStorage に永続化 |
| ファイル探索範囲 | 移動元フォルダの直下のみ（サブフォルダ再帰なし） |
| 実行の安全性 | エラー発生時も残りのファイル処理を継続する |
| 移動先フォルダ | 存在しない場合は自動作成する |
| 同時実行 | 同一ルールセットの並行実行は禁止（UIで制御） |

---

## 9. v1 スコープ外（将来検討）  <!-- 旧: 8 -->

以下の機能はv1には含めず、将来的に検討する。

- 自動実行（スケジュール / ファイル監視）
- ルールセット作成の補助機能
- サブフォルダの再帰探索オプション
- 実行履歴の永続保存・閲覧
- 日本語・英語以外の言語対応
