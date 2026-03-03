# Mimi - AIコーディング・開発技術情報収集CLIツール

海外のAIコーディング・開発技術情報を監視し、重要な記事をAIで選別・日本語テクニカル記事として生成するCLIツール。Claude/OpenAI/Gemini系列の最新情報とAIコーディングツールに特化して収集・フィルタリングする。

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

# 日本語テクニカル記事生成
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
fetch（収集）                        ← AI不使用（XSearch/XSearchKeywordのみ Grok x_search）
  Bluesky / XSearch / Bluesky-Search / XSearch-Keyword から並行取得
  → URL重複排除 → 48時間フィルタ
  → data/fetched.json
      ↓
select（選別）                       ← Grok (xAI)
  Step 1: ルールベース検証（AI不使用）
    → Rule 4.5: Claude/OpenAI/Gemini 3系列またはAIコーディングキーワードを含まない記事を除外
    → 公式ソースは自動承認
    → data/verified.json
  Step 2: Grok スコアリング
    → 6次元評価: novelty/impact/relevance (1-10) + hasSpecifics/isReproducible/isPrimarySource (bool)
    → 品質ボーナス: boolフラグ各 +0.5、AIコーディング boost +2、ベストプラクティス boost +2
    → 非優先系列は impact -4
    → 公開済みトピック重複 → novelty=0
    → 上位N件選別
    → data/selected.json
      ↓
generate（生成）                     ← Claude (Anthropic)
  → 速報解説スタイルで日本語テクニカル記事を生成
  → コピペ可能な成果物（コードブロック等）を必ず含む
  → Notion 自動公開 or コンソール出力
  → data/published-topics.json に記録
```

### フェーズ詳細

**fetch**: Bluesky（14アカウント）、XSearch（28アカウント）、bluesky-search（19キーワード）、xsearch-keyword（14キーワード）から並行取得。XSearch系のみ Grok の x_search ツールを使用。URL重複排除と48時間フィルタを適用後、`data/fetched.json` に保存。

**select**: 2段階処理。Step 1 はルールベース検証（AI不使用）— Rule 4.5 により Claude/OpenAI/Gemini の3優先系列またはAIコーディングキーワードを含まない記事を除外し、公式ソースは自動承認（計5ルール）。Step 2 は Grok による6次元スコアリング — novelty/impact/relevance（1-10）と hasSpecifics/isReproducible/isPrimarySource（bool）を評価。品質ボーナス・AIコーディング boost・非優先系列ペナルティを適用後、過去7日の公開済みトピックと重複するものは novelty=0 として除外し、上位N件を選別。

**generate**: Claude で速報解説スタイルの日本語テクニカル記事を生成。構造: ツール名+動詞のタイトル → 一行宣言 → 何ができるようになったか → 使い方・成果物（コードブロック必須） → ポイント → 背景・詳細 → ソース。Notion自動公開またはコンソール出力。生成トピックを `published-topics.json` に記録。

## AI プロバイダー

| フェーズ | AI プロバイダー | モデル | 用途 |
|---------|----------------|--------|------|
| fetch (XSearch) | Grok (xAI) | grok-4-1-fast-non-reasoning | X/Twitter 投稿検索（x_search ツール） |
| select (検証) | なし | — | ルールベース分類（3系列+AIコーディングキーワードフィルタ） |
| select (スコアリング) | Grok (xAI) | grok-4-1-fast-non-reasoning | 6次元スコアリング + 品質チェック |
| generate | Claude (Anthropic) | claude-sonnet-4-6 | 日本語テクニカル記事生成（速報解説スタイル） |
| accounts discover | Grok (xAI) | grok-4-1-fast-non-reasoning | x_search インタラクション分析による X 候補探索 |

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
| `bluesky-search` | Bluesky キーワード検索（AT Protocol 公開API） | 不要 |
| `xsearch` | X(Twitter) アカウント投稿検索（Grok x_search 経由） | XAI_API_KEY 必須 |
| `xsearch-keyword` | X(Twitter) キーワード検索（Grok x_search 経由） | XAI_API_KEY 必須 |

**未実装**: `reddit`、`arxiv`（config.yaml のスキーマは定義済みだがアダプタ未実装）

## 設定

`config.yaml` でソース、選別基準、出力設定、AIモデルを管理する。

### Bluesky（アカウント監視）

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

### Bluesky（キーワード検索）

AT Protocol の公開APIを使用したキーワード検索。認証不要。

```yaml
- type: bluesky-search
  keywords:
    - "Claude Code"
    - "AI coding"
    - "vibe coding"
  lang: "en"
  sort: "latest"
  limit: 25
  includeTextOnly: false
```

### XSearch（アカウント監視）

Grok の x_search ツールを使用して X(Twitter) の特定アカウント投稿を検索。`XAI_API_KEY` 環境変数が必要。

```yaml
- type: xsearch
  accounts:
    - "AnthropicAI"
    - "OpenAI"
  includeTextOnly: false   # false: リンク付き投稿のみ（デフォルト）
```

### XSearch（キーワード検索）

Grok の x_search ツールを使用した X(Twitter) キーワード検索。`XAI_API_KEY` 環境変数が必要。

```yaml
- type: xsearch-keyword
  keywords:
    - "Claude Code"
    - "AI coding"
  includeTextOnly: false
  daysBack: 2
```

### AI プロバイダー設定

```yaml
claude:
  model: "claude-sonnet-4-6"      # Generate フェーズで使用

grok:
  model: "grok-4-1-fast-non-reasoning"          # Select / Accounts Discover で使用
```

### Notion 設定

```yaml
notion:
  collectionDbId: "<収集日一覧DBのID>"
  articleDbId: "<記事DBのID>"              # 省略時は日付ページモード
  articleDataSourceId: "<Data Source ID>"   # URL重複チェック用
```

## Notion 連携

生成記事を Notion へ自動公開する。2つのモードがある。

**DB直接書き込みモード**（`articleDbId` 設定時）: 記事DBに直接ページを作成する。URL重複チェック付きで同一記事の二重登録を防ぐ。

**日付ページモード**（`articleDbId` 未設定時）: 収集日一覧の日付ページ配下に記事を作成する。後方互換モード。

## トピック重複防止

同じトピックが異なるソースから取得された場合でも重複して生成されないようにする仕組み。

- 記事生成時に `data/published-topics.json` へトピック情報を記録
- select フェーズで過去7日間の公開済みトピック一覧を AI のプロンプトに注入
- Grok が意味的に同一と判断したトピックには `novelty: 0` を付与し、スコアリングで自然に除外
- 旧ファイル名（`published_topics.json`）からの自動マイグレーション対応済み

## データファイル

`data/` 配下に保存される（gitignore済み）。

| ファイル | 説明 |
|----------|------|
| `fetched.json` | fetch 結果 |
| `verified.json` | 検証通過記事 |
| `selected.json` | 選別済み記事 |
| `history.json` | 実行履歴 |
| `published-topics.json` | 生成済みトピック（重複防止用、7日間保持） |

生成記事は Notion へ自動公開（`notion` 設定時）、またはコンソール出力。
