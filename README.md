# Mimi - 海外AI情報監視・翻訳CLIツール

海外の最新AI情報を監視し、重要な記事をAIで翻訳・要約してMarkdownコンテンツを生成するCLIツール。

## セットアップ

### 前提条件

- Node.js 18以上
- npm
- Anthropic APIキー（Claude API）
- xAI APIキー（必須、Select フェーズ、XSearch ソース、Accounts Discover で使用）

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
# .envにANTHROPIC_API_KEYとXAI_API_KEYを設定
```

| 変数名 | 必須 | 説明 |
|--------|------|------|
| `ANTHROPIC_API_KEY` | 必須 | Claude API キー |
| `XAI_API_KEY` | 必須 | xAI API キー（Select フェーズ、XSearch ソース、Accounts Discover で使用） |

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

# 検証・スコアリング・選別
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
fetch（収集）                        ← AI不使用（XSearchのみ Grok x_search）
  RSS / Hacker News / Bluesky / XSearch から並行取得
  → URL重複排除 → 48時間フィルタ
  → data/fetched.json
      ↓
select（選別）                       ← Grok (xAI)
  Step 1: ルールベース検証（AI不使用）
    → 一次ソースなし記事を除外、公式ソースは自動承認
    → data/verified.json
  Step 2: Grok スコアリング
    → novelty / impact / relevance を 1-10 で評価
    → 公開済みトピック重複 → novelty=0
    → 上位N件選別
    → data/selected.json
      ↓
generate（生成）                     ← Claude (Anthropic)
  → 日本語テクニカル記事を生成
  → Notion 自動公開 or コンソール出力
  → data/published_topics.json に記録
```

### フェーズ詳細

**fetch**: RSS/HN/Bluesky/XSearch から並行取得。XSearch のみ Grok の x_search ツールを使用し、それ以外は AI 不使用。URL 重複排除と 48 時間フィルタを適用後、`data/fetched.json` に保存。

**select**: 2 段階処理。Step 1 はルールベース検証（AI 不使用）— HN の一次ソースなし記事を除外し、arxiv/RSS/公式ソースは自動承認。Step 2 は Grok によるスコアリング — novelty/impact/relevance を 1-10 で評価し、過去 7 日の公開済みトピックと重複するものは novelty=0 として除外、上位 N 件を選別。

**generate**: Claude で日本語テクニカル記事を生成。構造化 Markdown（タイトル、3 行要約、概要、ポイント、分析、ソース）。Notion 自動公開またはコンソール出力。生成トピックを `published_topics.json` に記録。

## AI プロバイダー

| フェーズ | AI プロバイダー | モデル | 用途 |
|---------|----------------|--------|------|
| fetch (XSearch) | Grok (xAI) | grok-4.1-fast | X/Twitter 投稿検索（x_search ツール） |
| select (検証) | なし | — | ルールベース分類 |
| select (スコアリング) | Grok (xAI) | grok-4.1-fast | novelty/impact/relevance 評価 |
| generate | Claude (Anthropic) | claude-sonnet-4-6 | 日本語テクニカル記事生成 |
| accounts discover | Grok (xAI) | grok-4.1-fast | x_search インタラクション分析による X 候補探索、候補スコアリング |

設計方針: Grok = 構造化・分類タスク（高速・低コスト）、Claude = 記事生成タスク（高品質な日本語文章）

### AI クライアントアーキテクチャ

`AiClient` インターフェースで Anthropic/Grok を抽象化し、`createAiClient(provider, model)` ファクトリ関数で生成する。

- **Anthropic**: `@anthropic-ai/sdk` のラッパー
- **Grok**: `openai` SDK を xAI エンドポイント（`https://api.x.ai/v1`）に向けたラッパー

## 対応ソース

| タイプ | 説明 | 認証 |
|--------|------|------|
| `rss` | RSS フィード | 不要 |
| `hackernews` | Hacker News（キーワード・スコアでフィルタ） | 不要 |
| `bluesky` | Bluesky 特定アカウントの投稿（AT Protocol 公開API） | 不要 |
| `xsearch` | X(Twitter) 投稿検索（Grok x_search 経由） | XAI_API_KEY 必須 |

**未実装**: `reddit`、`arxiv`（config.yaml のスキーマは定義済みだがアダプタ未実装）

## 設定

`config.yaml` でソース、選別基準、出力設定、AIモデルを管理する。

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

### XSearch

Grok の x_search ツールを使用して X(Twitter) の投稿を検索。低コスト（~$0.15/月）で X の投稿を取得可能。`XAI_API_KEY` 環境変数が必要。

```yaml
- type: xsearch
  accounts:
    - "AnthropicAI"
    - "OpenAI"
  includeTextOnly: false   # false: リンク付き投稿のみ（デフォルト）
```

### AI プロバイダー設定

```yaml
claude:
  model: "claude-sonnet-4-6"      # Generate フェーズで使用

grok:
  model: "grok-4.1-fast"          # Select / Accounts Discover で使用
```

## トピック重複防止

同じトピックが異なるソースから取得された場合でも重複して生成されないようにする仕組み。

- 記事生成時に `data/published_topics.json` へトピック情報を記録
- select フェーズで過去7日間の公開済みトピック一覧を AI のプロンプトに注入
- Grok が意味的に同一と判断したトピックには `novelty: 0` を付与し、スコアリングで自然に除外

## データファイル

`data/` 配下に保存される（gitignore済み）。

| ファイル | 説明 |
|----------|------|
| `fetched.json` | fetch 結果 |
| `verified.json` | 検証通過記事 |
| `selected.json` | 選別済み記事 |
| `history.json` | 実行履歴 |
| `published_topics.json` | 生成済みトピック（重複防止用、7日間保持） |

生成記事は Notion へ自動公開（`notion` 設定時）、またはコンソール出力。
