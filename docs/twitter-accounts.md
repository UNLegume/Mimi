# Twitter/X 監視アカウントリスト

Mimi の Twitter ソースアダプタで監視するAI関連アカウント。
`config.yaml` の `accounts` フィールドにハンドル（@なし）をコピーして使用する。

> 最終更新: 2026-03-01
> 注意: Twitter API v2 は有料（Basic $100/月〜）。TWITTER_BEARER_TOKEN が必要。

## config.yaml 設定例

```yaml
- type: twitter
  accounts:
    # --- 公式アカウント ---
    - "AnthropicAI"
    - "OpenAI"
    - "GoogleDeepMind"
    - "MetaAI"
    - "MistralAI"
    - "xai"
    - "StabilityAI"
    - "huggingface"
    - "cohere"
    # --- CEO / 創業者 ---
    - "DarioAmodei"
    - "sama"
    - "demishassabis"
    - "ylecun"
    - "elonmusk"
    # --- 開発者・研究者 ---
    - "AmandaAskell"
    - "alexalbert__"
    - "karpathy"
    - "janleike"
    - "JeffDean"
    - "simonw"
    - "emollick"
    - "DrJimFan"
    - "swyx"
    - "hwchase17"
  limit: 20
  includeTextOnly: false
```

## アカウント詳細

### Anthropic

| アカウント | ハンドル | 備考 |
|-----------|---------|------|
| Anthropic（公式） | `AnthropicAI` | 企業公式 |
| Claude（公式） | `claudeai` | プロダクト公式 |
| Dario Amodei | `DarioAmodei` | CEO |
| Daniela Amodei | `DanielaAmodei` | President |
| Amanda Askell | `AmandaAskell` | Alignment |
| Alex Albert | `alexalbert__` | Developer Relations（末尾アンダースコア2つ） |
| Chris Olah | `ch402` | 解釈可能性研究 |
| Jan Leike | `janleike` | Alignment Science |

### OpenAI

| アカウント | ハンドル | 備考 |
|-----------|---------|------|
| OpenAI（公式） | `OpenAI` | 企業公式 |
| OpenAI Newsroom | `OpenAINewsroom` | ニュース・発表用 |
| Sam Altman | `sama` | CEO |
| Greg Brockman | `gdb` | 共同創業者 |
| Andrej Karpathy | `karpathy` | 共同創業者 |

### Google / DeepMind

| アカウント | ハンドル | 備考 |
|-----------|---------|------|
| Google DeepMind（公式） | `GoogleDeepMind` | 企業公式 |
| Google AI（公式） | `GoogleAI` | Google AI公式 |
| Demis Hassabis | `demishassabis` | DeepMind CEO |
| Jeff Dean | `JeffDean` | Chief Scientist |
| Sundar Pichai | `sundarpichai` | Alphabet/Google CEO |

### Meta AI

| アカウント | ハンドル | 備考 |
|-----------|---------|------|
| AI at Meta（公式） | `MetaAI` | 企業公式 |
| Yann LeCun | `ylecun` | Chief AI Scientist |
| Mark Zuckerberg | `finkd` | CEO（2009年来の個人ハンドル） |

### Mistral AI

| アカウント | ハンドル | 備考 |
|-----------|---------|------|
| Mistral AI（公式） | `MistralAI` | 企業公式 |
| Arthur Mensch | `arthurmensch` | CEO / 共同創業者 |

### xAI

| アカウント | ハンドル | 備考 |
|-----------|---------|------|
| xAI（公式） | `xai` | 企業公式 |
| Elon Musk | `elonmusk` | CEO / 創業者 |

### Stability AI

| アカウント | ハンドル | 備考 |
|-----------|---------|------|
| Stability AI（公式） | `StabilityAI` | 企業公式 |

### Hugging Face

| アカウント | ハンドル | 備考 |
|-----------|---------|------|
| Hugging Face（公式） | `huggingface` | 企業公式 |

### Cohere

| アカウント | ハンドル | 備考 |
|-----------|---------|------|
| Cohere（公式） | `cohere` | 企業公式 |

### 研究者・開発者（独立系）

| 人物 | ハンドル | 専門・活動 |
|------|---------|-----------|
| Simon Willison | `simonw` | Datasette作者、AI tools |
| Riley Goodside | `goodside` | プロンプトエンジニア |
| Ethan Mollick | `emollick` | Wharton教授、AI教育 |
| Jim Fan | `DrJimFan` | NVIDIA AI Director |
| Swyx (Shawn Wang) | `swyx` | AI Engineer、Latent Space |
| Harrison Chase | `hwchase17` | LangChain CEO |

## 注意事項

- `alexalbert__` はアンダースコアが2つ（`__`）なので注意
- `finkd`（Zuckerberg）は名前と無関係なハンドルだが公式
- 新規アカウント発見時はこのファイルを更新すること
