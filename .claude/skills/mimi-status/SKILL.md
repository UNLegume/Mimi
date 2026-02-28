---
name: mimi-status
description: Mimiのデータ状態を確認する
context: fork
agent: Explore
model: haiku
user-invocable: true
disable-model-invocation: true
---

# Mimi データ状態確認

Mimiプロジェクト（`/Users/nagata.nobuhiro/Github/Mimi`）の現在のデータ状態を調査し、日本語でサマリーを表示してください。

## 確認すべき項目

### 1. data/ ディレクトリのJSONファイル

以下の各ファイルについて、存在有無・件数・最終更新日時を報告:

| ファイル | 内容 |
|---|---|
| `data/fetched.json` | 収集済み記事 |
| `data/verified.json` | 信頼性検証通過記事 |
| `data/selected.json` | 最終選別記事 |
| `data/history.json` | 処理履歴ログ |

各JSONファイルが存在する場合:
- 配列の要素数（= 記事数）
- ファイルの最終更新日時

`history.json` が存在する場合:
- 最新のエントリ3件を表示

### 2. output/ ディレクトリ

- 日付別サブディレクトリの一覧
- 各ディレクトリ内のMarkdownファイル数
- 最新の出力日付

### 3. config.yaml

- 登録されているソース数と種別
- `selection.maxArticles` の設定値

## 出力フォーマット

以下のような表形式でサマリーを表示してください:

```
📊 Mimi データ状態

| データ | 件数 | 最終更新 |
|---|---|---|
| 収集済み (fetched) | XX件 | YYYY-MM-DD HH:MM |
| 検証済み (verified) | XX件 | YYYY-MM-DD HH:MM |
| 選別済み (selected) | XX件 | YYYY-MM-DD HH:MM |
| 出力記事 (output) | XX件 | YYYY-MM-DD |

📝 最近の処理履歴
- YYYY-MM-DD HH:MM: fetched.json (XX件)
- ...

⚙️ 設定
- ソース: X件（RSS: X, HackerNews: X）
- 最大選別数: X件
```

ファイルが存在しない場合は「未実行」と表示してください。
