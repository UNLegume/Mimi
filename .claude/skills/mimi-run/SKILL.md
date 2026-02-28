---
name: mimi-run
description: Mimiパイプライン（fetch→select→generate）を一括実行する
user-invocable: true
disable-model-invocation: true
---

# Mimi パイプライン一括実行

Mimiのパイプライン（fetch → select → generate）を一括実行します。

実行前の確認事項:
- `.env` に `ANTHROPIC_API_KEY` が設定されていること（select / generate で必要）
- `config.yaml` が正しく設定されていること

以下のコマンドを Bash ツールで実行してください:

```bash
cd /Users/nagata.nobuhiro/Github/Mimi && npx tsx src/index.ts run
```

実行後、結果のサマリーをユーザーに報告してください:
- 各ステップ（fetch / select / generate）の成功・失敗
- 収集・選別された記事数
- 生成された出力ファイル
