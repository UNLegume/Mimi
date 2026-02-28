# Bluesky 監視アカウントリスト

Mimi の Bluesky ソースアダプタで監視するAI関連アカウント。
`config.yaml` の `accounts` フィールドにハンドルをコピーして使用する。

> 最終更新: 2026-03-01

## config.yaml 設定例

```yaml
- type: bluesky
  accounts:
    # --- 公式アカウント ---
    - "anthropic.com"
    - "hf.co"
    - "cohere.com"
    # --- Anthropic ---
    - "alexalbert.bsky.social"
    - "colah.bsky.social"
    # --- OpenAI ---
    - "karpathy.bsky.social"
    # --- Google / DeepMind ---
    - "jeffdean.bsky.social"
    # --- Meta AI ---
    - "yann-lecun.bsky.social"
    # --- Mistral AI ---
    - "arthurmensch.bsky.social"
    # --- 研究者・開発者 ---
    - "simonwillison.net"
    - "emollick.bsky.social"
  limit: 20
  includeTextOnly: false
  credibility: "official"
```

## アカウント詳細

### 公式アカウント

| 企業 | ハンドル | 備考 |
|------|---------|------|
| Anthropic | `anthropic.com` | ドメイン認証済み |
| Hugging Face | `hf.co` | ドメイン認証済み |
| Cohere | `cohere.com` | ドメイン認証済み |

### Anthropic

| 人物 | ハンドル | 役職 |
|------|---------|------|
| Alex Albert | `alexalbert.bsky.social` | Head of Claude Relations |
| Chris Olah | `colah.bsky.social` | 共同創業者、解釈可能性研究 |

Bluesky未確認: Dario Amodei, Daniela Amodei, Amanda Askell, Jan Leike

### OpenAI

| 人物 | ハンドル | 役職 |
|------|---------|------|
| Andrej Karpathy | `karpathy.bsky.social` | 共同創業者 |

Bluesky未確認: Sam Altman, Greg Brockman

### Google / DeepMind

| 人物 | ハンドル | 役職 |
|------|---------|------|
| Jeff Dean | `jeffdean.bsky.social` | Chief Scientist, Gemini Lead |

Bluesky未確認: Demis Hassabis, Sundar Pichai

### Meta AI

| 人物 | ハンドル | 役職 |
|------|---------|------|
| Yann LeCun | `yann-lecun.bsky.social` | Chief AI Scientist |

### Mistral AI

| 人物 | ハンドル | 役職 |
|------|---------|------|
| Arthur Mensch | `arthurmensch.bsky.social` | CEO / 共同創業者 |

### 研究者・開発者

| 人物 | ハンドル | 専門・活動 |
|------|---------|-----------|
| Simon Willison | `simonwillison.net` | Datasette作者、AI tools |
| Ethan Mollick | `emollick.bsky.social` | Wharton教授、AI教育 |

## 注意事項

- Bluesky はドメインハンドル（例: `anthropic.com`）がアカウントの真正性の指標になる
- OpenAI, Meta AI, xAI, Stability AI は公式Blueskyアカウント未確認
- 新規アカウント発見時はこのファイルを更新すること
