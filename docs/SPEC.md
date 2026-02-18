# Filo - ソフトウェア仕様書

## 1. 概要

**Filo** は、ユーザが定義したルールセットに基づいてファイルを移動またはコピーするWindows 11向けGUIアプリケーションである。

### 1.1 用語定義

| 用語 | 定義 |
|------|------|
| ルールセット | ファイル操作の条件を定義した一つのまとまり。対象フォルダ・フィルタ条件・保存先フォルダ・オプションで構成される |
| フィルタ | ルールセット内で対象ファイルを絞り込むための条件。複数指定時はAND結合 |
| 一括実行 | 有効な全ルールセットを上から順に実行すること |
| アクション | ファイルに対する操作種別。「移動」または「コピー」 |

### 1.2 技術スタック

| レイヤー | 技術 |
|----------|------|
| フロントエンド | React 19 + TypeScript |
| バックエンド | Rust (Tauri v2) |
| UIライブラリ | Tailwind CSS のみ（外部UIライブラリなし） |
| スタイリング | Tailwind CSS v4（`@theme` でフォント定義、CSS カスタムスクロールバー） |
| デザイン方針 | Windows 11 Fluent Design 2.0 準拠（Segoe UI Variable フォント、Mica 風 backdrop-blur）|
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
| `source_dir` | string | Yes | 対象フォルダのパス |
| `destination_dir` | string | Yes | 保存先フォルダのパス。`{変数名}` 形式のテンプレート変数を使用可能（後述）|
| `action` | `"move"` \| `"copy"` | Yes | ファイル操作種別。デフォルト: `"move"` |
| `overwrite` | bool | Yes | 移動先に同名ファイルが存在する場合に上書きするか |

#### 動的移動先テンプレート

`destination_dir` に `{変数名}` 形式のテンプレート変数を埋め込むと、ファイル名フィルタの正規表現（`match_type: regex`）の**名前付きキャプチャグループ**の値が実行時に代入される。

```yaml
source_dir: "D:/downloads"
destination_dir: "D:/sorted/{label}/{id}"
action: move
filters:
  filename:
    pattern: '^(?P<label>\d+)_txt_(?P<id>\d+).+'
    match_type: regex
```


上記の設定で `99999_txt_123456.zip` を処理すると `D:/sorted/99999/123456/` へ移動する。

**制約・動作仕様：**

| ケース | 動作 |
|--------|------|
| `destination_dir` にテンプレート変数がある場合 | `filters.filename.match_type` は `regex` でなければならない（バリデーションエラー） |
| ファイル名が正規表現にマッチしない | skipped として記録（処理は続行） |
| テンプレート変数名が正規表現の名前付きグループに存在しない | skipped として記録 |
| キャプチャ値が空文字 | skipped として記録 |
| キャプチャ値に Windows パス不正文字（`/ \ : * ? " < > |`）が含まれる | `_` に置換してサニタイズ |
| テンプレートが解決できた場合 | 解決されたパスのディレクトリを自動作成して移動/コピー |
| テンプレートなしの従来ルールセット | 変更なし（後方互換） |

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
│  ☑ 1. 画像ファイルを整理        移動  [▶][✎][🗑][…]  │
│     Downloads → Pictures/sorted                       │
│     .jpg, .png, .gif | glob: screenshot_*             │
│                                                       │
│  ☐ 2. ログファイルをアーカイブ   コピー [▶][✎][🗑][…]  │
│     C:/logs → D:/archive/logs                         │
│     .log | 更新日: ~2024-12-31                         │
│                                                       │
│  ☑ 3. ドキュメント整理          移動  [▶][✎][🗑][…]  │
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
| 削除 | 確認ダイアログの後、ルールセットを削除。削除ボタンは赤系統の色で表示 |
| サブメニュー（…） | 各ルールセットカードの「…」ボタンでサブメニューを表示。メニュー外クリックで閉じる |
| 複製 | サブメニューから選択したルールセットの直下に同じ設定のコピーを挿入。名前は末尾に ` copy1` を付与（既存名と衝突する場合は ` copy2`, ` copy3`, … と連番）。名前が既に ` copyN` で終わる場合はベース名から採番し直す（例: "foo copy1" → "foo copy2"）|
| 対象フォルダを開く | サブメニューからOSのファイルエクスプローラーで対象フォルダを開く |
| 保存先フォルダを開く | サブメニューからOSのファイルエクスプローラーで保存先フォルダを開く |
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
│  対象フォルダ: [C:/Users/user/Downloads  🗁]  │
│  保存先フォルダ: [C:/Users/user/Pictures  🗁]  │
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

#### 編集ダイアログのレイアウト

- ヘッダー（タイトル・閉じるボタン）とフッター（キャンセル・保存ボタン）は常に表示し、中央のフォーム領域のみスクロールする
- ウィンドウ高さが低い場合もヘッダー/フッターが隠れない

#### 編集ダイアログの機能

| 機能 | 説明 |
|------|------|
| 閉じるボタン | ダイアログ右上の × ボタンでダイアログを閉じる |
| ESCキーで閉じる | ESCキー押下時にキャンセルボタンと同等の処理を実行する |
| 変更破棄の確認 | × ・キャンセルボタン・ESCキー押下時、入力中の内容がある場合は破棄確認ダイアログを表示。OKのみ閉じる |
| フォルダ選択 | 対象フォルダ・保存先フォルダのテキストボックス右端に配置されたフォルダアイコンボタン（SVG）でOS標準のフォルダ選択ダイアログを呼び出す |
| アクション選択 | 「移動」と「コピー」をラジオボタンで切替 |
| 拡張子入力 | タグ形式で複数追加・削除が可能 |
| ファイル名パターン | glob または正規表現を選択してパターンを入力 |
| 正規表現テスター | ファイル名パターンの方式を「正規表現」にしたとき、パターン入力欄の直下に表示されるインタラクティブなテスト UI（後述） |
| 日時入力 | カレンダーピッカーまたは手動入力 |
| バリデーション | 保存時に必須フィールドとフィルタ条件（1つ以上）を検証 |

### 3.3 正規表現テスターパネル（`RegexTesterPanel`）

ファイル名パターンの方式を「正規表現」に切り替えたときのみ表示されるインラインパネル。正規表現を即座に検証できる。

```
┌──────────────────────────────────────────────────────────┐
│  ファイル名でテスト:                                          │
│  [ IMG_20250101_001.jpg                       ]           │
│                                                          │
│  ✓ マッチしました                                           │
│  date = "20250101"                                        │
│  保存先: D:/sorted/2025/001                               │
├──────────────────────────────────────────────────────────┤
│  [ソースフォルダのファイルで確認]  ← 対象フォルダが指定済みの場合のみ │
│                                                          │
│  2 / 5 件マッチ                                            │
│  ✓ IMG_20250101_001.jpg → D:/sorted/2025/001             │
│  ✓ IMG_20250102_002.jpg → D:/sorted/2025/002             │
└──────────────────────────────────────────────────────────┘
```

#### サンプルファイル名テスト（常時表示）

| 項目 | 仕様 |
|------|------|
| 入力欄 | 任意のファイル名を手入力してリアルタイムにマッチ判定する |
| 構文エラー表示 | 無効な正規表現の場合、赤字でエラーメッセージを表示する |
| マッチ結果 | マッチした場合は「マッチしました」（緑）、しない場合は「マッチしません」（グレー）を表示する |
| キャプチャグループ表示 | マッチ成功かつ名前付きキャプチャグループが存在する場合、グループ名と取得値を一覧表示する |
| 保存先プレビュー | 保存先フォルダにテンプレート変数（`{変数名}`）が含まれ、マッチ成功した場合、変数を解決した保存先パスを表示する |

#### ソースフォルダのファイルで確認（対象フォルダ指定済みの場合のみ表示）

| 項目 | 仕様 |
|------|------|
| 「ソースフォルダのファイルで確認」ボタン | クリックすると `list_source_files` コマンドで対象フォルダ内のファイル一覧を取得する |
| マッチ数サマリー | 「N / M 件マッチ」の形式でマッチしたファイル数と総ファイル数を表示する |
| ファイル一覧 | **マッチしたファイルのみ**を表示する。スクロール可能領域（最大高さ制限）に収める |
| 保存先プレビュー | テンプレート変数が設定されている場合、各ファイルの解決後の保存先パスを「→ 保存先パス」形式で表示する |
| 読み込みエラー | ディレクトリが存在しない等のエラー時は赤字でメッセージを表示する |

#### 正規表現の Rust/JS 差異の吸収

実行エンジンは Rust の `regex` クレート（RE2 構文）を使用するが、テスターパネルは JavaScript の `RegExp` を使用する。以下の変換を行い、Rust と同じマッチング結果を再現する。

| Rust 構文 | JavaScript 変換後 | 意味 |
|-----------|-----------------|------|
| `(?P<name>...)` | `(?<name>...)` | 名前付きキャプチャグループ |
| `[^]...` （`]` を negated class の先頭に置く記法） | `[^\]...` | `]` を含まない文字クラス |

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

#### デザイン方針：Fluent Refined

Windows 11 の Fluent Design 2.0 を基調とし、現代的なトレンドを加えたデザイン。

- **フォント**: `"Segoe UI Variable", "Segoe UI"` を優先使用（Windows 11 ネイティブフォント）
- **ツールバー**: 半透明 + `backdrop-blur` による Mica 風マテリアルエフェクト
- **ボタン**: グラデーション背景（`from-blue-500 to-blue-600` 等）+ カラーシャドウ
- **カード**: カスタム `rgba()` シャドウ + ホバー時の微細エレベーション（`-translate-y-0.5`）
- **ダイアログ**: `rounded-2xl`（16px）の大きめ角丸、重層シャドウ
- **スクロールバー**: Windows 11 風の 6px 細型（CSS カスタムスクロールバー）
- **モノスペースフォント**: `"Cascadia Code", "Consolas"` を優先使用

#### カラーパレット（スレートグレー系）

| 要素 | ライトモード | ダークモード |
|------|------------|------------|
| ページ背景 | `slate-100` → `slate-50` グラデーション | `slate-950` → `#0f1117` グラデーション |
| ツールバー背景 | `white/85` + backdrop-blur | `slate-900/85` + backdrop-blur |
| ステータスバー背景 | `white/80` + backdrop-blur-sm | `slate-900/80` + backdrop-blur-sm |
| カード / パネル背景 | `white` | `slate-900` |
| ダイアログ背景 | `white` | `slate-900` |
| ボーダー | `slate-200/80` | `slate-700/60` |
| テキスト（主） | `slate-900` | `slate-100` |
| テキスト（補助） | `slate-500` | `slate-400` |
| テキスト（弱） | `slate-400` | `slate-600` |
| アクセント（プライマリ） | `blue-500` → `blue-600` グラデーション | 同左 |
| アクセント（成功） | `emerald-500` → `emerald-600` グラデーション | 同左 |
| アクセント（警告） | `amber-600` | `amber-400` |
| アクセント（危険） | `red-500` | `red-400` |
| Move バッジ | `blue-50` → `sky-50` グラデーション | `blue-900/40` → `sky-900/30` グラデーション |
| Copy バッジ | `violet-50` → `purple-50` グラデーション | `violet-900/40` → `purple-900/30` グラデーション |

#### ボーダー半径

| 要素 | 値 |
|------|-----|
| ダイアログ | `rounded-2xl`（16px） |
| カード | `rounded-xl`（12px） |
| ボタン | `rounded-lg`（8px） |
| インプット | `rounded-lg`（8px） |
| バッジ | `rounded-full` |

#### 実装方式

- Tailwind CSS v4 の `@custom-variant dark (&:where(.dark, .dark *))` を使用
- `App.tsx` の `<main>` 要素に `.dark` クラスを付与することで全子コンポーネントにダークテーマを伝搬
- `darkMode` は `App.tsx` の `useState` で管理し、`Toolbar` へプロップスとして渡す
- `App.css` の `@theme` ブロックでフォントスタックを定義
- `App.css` の `@layer base` でカスタムスクロールバーを定義

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
   5c. 移動（Move）:
       - まず fs::rename を試みる（同一ファイルシステム内では原子的）
       - クロスデバイスエラー（異なるドライブ間）の場合のみ copy+delete にフォールバック
       - 権限エラー・ディスクフル等はフォールバックせずそのまま失敗
   5d. コピー（Copy / copy+delete フォールバック共通）:
       - コピー後にコピー済みバイト数とソースサイズを比較して整合性を検証する
       - コピー失敗・サイズ不一致の場合は destination の残骸ファイルを削除してからエラーを返す
       - コピー失敗時も source ファイルは保護される
   5e. 操作失敗 → エラー記録して続行。エラー種別（権限不足・ディスクフル等）を識別してメッセージを生成
6. 実行結果を返却
```

#### Undo処理フロー

```
[Undo フロー（移動の場合のみ）]

1. 対象ファイルが移動先に存在するか確認
2. 元のパス（source_dir）にファイルを移動（移動と同じ安全フローを適用）
   2a. 元のパスに同名ファイルが存在する場合 → エラー（上書きしない）
   2b. クロスデバイスエラー時のみ copy+delete フォールバックを実行
   2c. 移動失敗 → エラーを返却
3. Undo結果を返却
```

### 4.2 Tauri コマンド（IPC）

フロントエンドとバックエンド間のインターフェース。

| コマンド | 引数 | 戻り値 | 説明 |
|---------|------|--------|------|
| `get_rulesets` | なし | `Ruleset[]` | 全ルールセットを取得 |
| `save_ruleset` | `Ruleset` | `Result<String>` | ルールセットを保存（新規/更新）。採番した UUID を返す |
| `delete_ruleset` | `id: string` | `Result<()>` | ルールセットを削除 |
| `reorder_rulesets` | `ids: string[]` | `Result<()>` | 並び順を更新 |
| `execute_ruleset` | `id: string` | `ExecutionResult` | 単一ルールセット実行。処理ファイルごとに `execution-progress` イベントを発火 |
| `execute_all` | なし | `ExecutionResult[]` | 有効な全ルールセットを順次実行。処理ファイルごとに `execution-progress` イベントを発火 |
| `undo_file` | `source: string, dest: string` | `Result<()>` | 単一ファイルのUndo |
| `undo_all` | `files: UndoRequest[]` | `UndoResult[]` | 複数ファイルの一括Undo |
| `import_rulesets` | `path: string` | `Result<Ruleset[]>` | YAMLファイルからインポート |
| `export_rulesets` | `path: string` | `Result<()>` | YAMLファイルへエクスポート |
| `list_source_files` | `dir: string` | `Result<Vec<String>>` | 指定ディレクトリの直下にあるファイル名一覧を取得（サブディレクトリは除外、アルファベット順）。正規表現テスターパネルの「ソースフォルダのファイルで確認」機能で使用 |

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
│   │   ├── RegexTesterPanel.tsx  # 正規表現テスターパネル
│   │   ├── RegexTesterPanel.test.tsx  # ↑ コンポーネントテスト
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
| Layer 1: Rust 単体テスト | Rust 標準テスト | `ruleset.rs`, `filters.rs`, `engine.rs`, `commands.rs` のロジック | 71件 |
| Layer 2: Vitest コンポーネントテスト | Vitest + @testing-library/react | UI コンポーネント・Zustand ストア | 46件 |

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

#### `src/components/RulesetCard.test.tsx`（10件）

| テスト内容 |
|-----------|
| ルールセット名が表示される |
| ソースパスが表示される |
| チェックボックス変更 → `onToggleEnabled` が呼ばれる |
| 「▶」クリック → `onExecute` が呼ばれる |
| 「✎」クリック → `onEdit` が呼ばれる |
| 「🗑」クリック → `onDelete` が呼ばれる |
| `enabled=false` のとき透過スタイル（`opacity-50`）が適用される |
| 「…」クリック → サブメニューが表示される |
| 「対象フォルダを開く」クリック → `openPath(source_dir)` が呼ばれる |
| 「保存先フォルダを開く」クリック → `openPath(destination_dir)` が呼ばれる |

#### `src/components/RulesetEditDialog.test.tsx`（11件）

| テスト内容 |
|-----------|
| 名前未入力で保存 → バリデーションエラーが表示される |
| フィルタなしで保存 → バリデーションエラーが表示される |
| 拡張子の追加・削除が動作する |
| 有効なデータで保存 → `onSave` が呼ばれる |
| 変更なしでキャンセル → confirm なしで `onCancel` が呼ばれる |
| 変更ありでキャンセル → confirm ダイアログが呼ばれる |
| 変更なしでESCキーを押す → confirm なしで `onCancel` が呼ばれる |
| 変更ありでESCキーを押す → confirm ダイアログが呼ばれる |
| 正規表現モードを選択すると正規表現テスターパネルが表示される |
| glob モードのときは正規表現テスターパネルが表示されない |
| 保存先にテンプレート変数あり + 正規表現以外のフィルタで保存 → バリデーションエラーが表示される |

#### `src/components/RegexTesterPanel.test.tsx`（13件）

| テスト内容 |
|-----------|
| パターンが空のときは結果が表示されない |
| 無効な正規表現のとき構文エラーが表示される |
| サンプルファイル名がマッチするとき「マッチしました」が表示される |
| サンプルファイル名がマッチしないとき「マッチしません」が表示される |
| 名前付きキャプチャグループがあるときグループ名と値が表示される |
| `[^]]` 構文（Rust で `]` を negated class の先頭に置く書き方）が正しくマッチする |
| Rust の `(?P<name>...)` 構文でもキャプチャグループが動作する |
| `destinationDir` にテンプレート変数があるとき解決後のパスが表示される |
| `sourceDir` が空のときソースフォルダ読み込みボタンが表示されない |
| `sourceDir` があるときソースフォルダ読み込みボタンが表示される |
| ソースフォルダ読み込みボタンをクリックするとマッチしたファイル一覧が表示される |
| ファイル一覧でマッチ数サマリーが表示される |
| ソースフォルダの読み込みに失敗するとエラーが表示される |

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
| `RulesetCard` | `ruleset-card`, `ruleset-toggle`, `ruleset-name`, `ruleset-execute`, `ruleset-edit`, `ruleset-delete`, `ruleset-menu`, `ruleset-menu-dropdown`, `ruleset-duplicate`, `ruleset-open-source`, `ruleset-open-destination` |
| `RulesetEditDialog` | `edit-dialog`, `field-name`, `field-source-dir`, `field-dest-dir`, `btn-save`, `btn-cancel`, `extension-input`, `btn-extension-add`, `validation-errors` |
| `RegexTesterPanel` | `regex-tester-panel`, `regex-sample-input`, `regex-syntax-error`, `regex-match-result`, `regex-capture-groups`, `regex-resolved-path`, `regex-load-files-btn`, `regex-file-list`, `regex-match-count` |
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
| 移動の整合性 | コピー後にバイト数検証を行い、不完全なコピーを検出した場合は移動先の残骸ファイルを削除してから失敗扱いとする。元ファイルは常に保護される |
| クロスデバイス移動 | 異なるドライブ間の移動は `rename` 失敗（クロスデバイスエラー）のときのみ copy+delete にフォールバックする。権限エラーやディスクフルではフォールバックしない |
| エラー識別 | ファイル操作失敗時は権限不足・ディスクフル・クロスデバイス等のエラー種別を識別し、ユーザーに明示する |
| コンテキストメニュー | リリースビルドではブラウザ標準の右クリックメニュー（「戻る」「リロード」「開発者ツール」等）を非表示にする。テキスト入力欄（`<input>` / `<textarea>`）上での右クリックはOS標準のコピー/ペーストメニューをそのまま表示する |

---

## 9. v1 スコープ外（将来検討）  <!-- 旧: 8 -->

以下の機能はv1には含めず、将来的に検討する。

- 自動実行（スケジュール / ファイル監視）
- ルールセット一括生成ウィザード（フォルダをスキャンして正規表現パターンから複数の静的ルールセットを自動生成）
- サブフォルダの再帰探索オプション
- 実行履歴の永続保存・閲覧
- 日本語・英語以外の言語対応
