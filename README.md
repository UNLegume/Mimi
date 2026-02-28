# Mimi - 海外AI情報監視・翻訳CLIツール

海外の最新AI情報を監視し、重要な記事をClaude APIで翻訳・要約してMarkdownコンテンツを生成するCLIツール。

## セットアップ

### 前提条件

- Node.js 18以上
- npm
- Anthropic APIキー（Claude API）

### インストール

```bash
git clone <repository-url>
cd Mimi
npm install
npm link    # mimi コマンドをグローバルに登録
```

### 環境変数

```bash
cp .env.example .env
# .envにANTHROPIC_API_KEYを設定
```

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | 必須 | Claude API キー |
| `TWITTER_BEARER_TOKEN` | 任意 | Twitter/X API Bearer Token（Twitter ソース使用時に必要） |

`config.yaml` は初期設定済みのためそのまま使用できる。

## 使い方

### 全パイプライン一括実行

```bash
mimi run
```

### 個別ステップ

```bash
# ソースから記事を収集
mimi fetch

# AI検証・スコアリング・選別
mimi select

# 翻訳・日本語記事生成
mimi generate

# 特定記事のみ生成
mimi generate <article-id>

# 登録ソース一覧表示
mimi sources
```

### 監視アカウント管理

```bash
# アカウント一覧
mimi accounts list

# 新規候補を発見
mimi accounts discover

# アカウント追加
mimi accounts add "user.bsky.social" -s bluesky

# アカウント削除
mimi accounts remove "user.bsky.social"
```

### ヘルプ

各コマンドに `--help` で使用例を確認できる。

```bash
mimi --help
mimi fetch --help
mimi accounts discover --help
```

### ビルドして実行

```bash
npm run build
node dist/index.js run
```

## パイプライン概要

```
fetch（RSS/HN/Bluesky/Twitterから並行取得 → URL重複排除 → 48時間フィルタ）
  ↓ data/fetched.json
select（Claude APIで信頼性検証 → スコアリング → 上位N件選別）
  ↓ data/selected.json
generate（Claude APIで日本語テクニカル記事生成 → コンソール出力）
```

## 対応ソース

| タイプ | 説明 | 認証 |
|--------|------|------|
| `rss` | RSS フィード | 不要 |
| `hackernews` | Hacker News（キーワード・スコアでフィルタ） | 不要 |
| `bluesky` | Bluesky 特定アカウントの投稿（AT Protocol 公開API） | 不要 |
| `twitter` | Twitter/X 特定アカウントの投稿（API v2） | Bearer Token 必須 |

**未実装**: `reddit`、`arxiv`（config.yaml のスキーマは定義済みだがアダプタ未実装）

## 設定

`config.yaml` でソース、選別基準、出力設定、Claudeモデルを管理する。

### Bluesky

AT Protocol の公開APIを使用するため認証不要。特定アカウントの投稿を監視する。リプライ・リポストは自動除外される。

```yaml
- type: bluesky
  accounts:
    - "anthropic.com"
    - "simonwillison.net"
  limit: 20
  includeTextOnly: false   # false: リンク付き投稿のみ（デフォルト）、true: テキストのみ投稿も含む
  credibility: "official"
```

### Twitter/X

Twitter API v2 を使用。Bearer Token が必須（Basic プラン $100/月〜）。リプライ・RTは自動除外される。

```yaml
- type: twitter
  accounts:
    - "AnthropicAI"
  limit: 20
  includeTextOnly: false   # false: リンク付き投稿のみ（デフォルト）、true: テキストのみ投稿も含む
  # bearerToken: "xxx"     # config内で直接指定する場合（TWITTER_BEARER_TOKEN 環境変数推奨）
```

## トピック重複防止

同じトピックが異なるソースから取得された場合でも重複して生成されないようにする仕組み。

- 記事生成時に `data/published_topics.json` へトピック情報を記録
- select フェーズで過去7日間の公開済みトピック一覧を Claude API のプロンプトに注入
- Claude が意味的に同一と判断したトピックには `novelty: 0` を付与し、スコアリングで自然に除外

## データファイル

`data/` 配下に保存される（gitignore済み）。

| ファイル | 説明 |
|----------|------|
| `fetched.json` | fetch 結果 |
| `verified.json` | 検証通過記事 |
| `selected.json` | 選別済み記事 |
| `history.json` | 実行履歴 |
| `published_topics.json` | 生成済みトピック（重複防止用、7日間保持） |

生成記事の出力先は現在コンソールのみ（ファイル出力は未実装）。
