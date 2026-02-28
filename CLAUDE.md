# Mimi プロジェクト

AI関連ニュース・SNS投稿を収集し、日本語テクニカル記事を生成するパイプライン。

## Notion 保存ルール

Mimi で収集した SNS 情報は以下の Notion ページ・データベースに保存する。

### 対象ページ

- **X向け記事情報**: `https://www.notion.so/finn-inc/X-315ad2a27aab802bbe65cf41b28c163b`
  - page_id: `315ad2a27aab802bbe65cf41b28c163b`

### データベース構造

#### 1. SNS情報収集（記事DB）

- data_source_id: `5b2e4637-c3af-4ca9-8f50-35ee950cc649`
- 1記事 = 1ページ

| プロパティ | 型 | 設定値 | 備考 |
|-----------|------|-------|------|
| `タイトル` | title | 記事タイトル | 140字以内に truncate |
| `userDefined:URL` | url | 記事の外部リンク URL | primarySourceUrl 優先、なければ投稿URL |
| `ソース` | select | `Bluesky` or `Twitter/X` | |
| `著者` | select | 投稿者名 | 既存選択肢: Simon Willison, Chris Olah, Yann LeCun, Jeff Dean。新規著者は文字列で指定（自動追加される） |
| `date:公開日:start` | date | ISO-8601 日付 (`YYYY-MM-DD`) | `publishedAt` から変換 |
| `date:公開日:is_datetime` | integer | `0` | 日付のみ |
| `date:収集日:start` | date | ISO-8601 日付 (`YYYY-MM-DD`) | `fetchedAt` から変換（当日日付） |
| `date:収集日:is_datetime` | integer | `0` | 日付のみ |
| `概要` | text | 投稿テキスト全文（summary フィールド） | |
| `いいね数` | number | `metadata.likeCount` | |

#### 2. 収集日一覧（親DB）

- data_source_id: `c65611d0-119b-407e-9c0a-65b5ce4d396e`
- 1収集実行 = 1ページ

| プロパティ | 型 | 設定値 | 備考 |
|-----------|------|-------|------|
| `日付` | title | `YYYY/MM/DD` 形式 | 収集実行日 |
| `ソース` | text | `Bluesky` or `Twitter/X` | |
| `件数` | number | その回の収集記事数 | |
| `記事` | relation | SNS情報収集の記事ページURL配列 | 自動でリレーション設定 |

### 保存手順

1. **SNS情報収集DB** に記事を一括作成（`create-pages`、parent は `data_source_id`）
2. 作成された記事ページの URL を収集
3. **収集日一覧DB** に当日の収集日ページを作成し、`記事` リレーションに記事ページ URL を設定

### 重複防止（必須）

**重複する記事は絶対に追加しない。** 以下の手順で必ず確認する：

1. Notion 保存前に `notion-search` で対象ページ配下を検索し、既存記事のタイトルを取得する
2. 収集記事のタイトルまたは URL が既存記事と一致する場合はスキップする
3. 部分一致（タイトルの主要部分が同一）も重複とみなす
4. 重複チェックの結果、追加対象が 0 件の場合は「全件既存のためスキップ」と報告して終了する

### 注意事項

- `userDefined:URL` は Notion の予約語回避のため `userDefined:` プレフィックスが必要
- date プロパティは expanded format（`date:プロパティ名:start`, `date:プロパティ名:is_datetime`）で指定
- `著者` select に存在しない人物名は文字列で渡せば自動的に選択肢に追加される
