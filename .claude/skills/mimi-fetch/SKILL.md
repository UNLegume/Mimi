---
name: mimi-fetch
description: Mimiの記事収集（fetch）を実行する
user-invocable: true
disable-model-invocation: true
---

# Mimi 記事収集

Mimiの記事収集（fetch）コマンドを実行します。config.yaml に定義されたソース（RSS / Hacker News）から記事を取得し、`data/fetched.json` に保存します。

このコマンドはAPIキー不要です。

以下のコマンドを Bash ツールで実行してください:

```bash
cd /Users/nagata.nobuhiro/Github/Mimi && npx tsx src/index.ts fetch
```

実行後、結果をユーザーに報告してください:
- 各ソースからの取得件数
- 重複排除後の合計件数
- エラーが発生したソースがあればその詳細
