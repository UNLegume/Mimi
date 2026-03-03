import type { AiClient } from './types.js';
import type { Article } from '../sources/types.js';
import type { PublishedTopic } from '../store/articles.js';
import { subDays } from 'date-fns';
import { extractJsonFromResponse } from '../utils/json.js';

interface ScoredArticle {
  id: string;
  novelty: number;
  impact: number;
  relevance: number;
  hasSpecifics: boolean;
  isReproducible: boolean;
  isPrimarySource: boolean;
}

export async function selectArticles(
  articles: Article[],
  client: AiClient,
  maxArticles: number,
  criteria: string[],
  publishedTopics: PublishedTopic[] = []
): Promise<Article[]> {
  if (articles.length === 0) {
    return [];
  }

  const articleList = articles.map((article, index) => {
    const parts = [
      `[${index}] id: ${article.id}`,
      `    title: ${article.title}`,
      `    url: ${article.url}`,
    ];
    if (article.summary) {
      parts.push(`    summary: ${article.summary.slice(0, 200)}`);
    }
    return parts.join('\n');
  }).join('\n\n');

  const criteriaText = criteria.length > 0
    ? `選別基準:\n${criteria.map(c => `- ${c}`).join('\n')}`
    : '';

  const sevenDaysAgo = subDays(new Date(), 7);
  const recentTopics = publishedTopics.filter(
    t => new Date(t.publishedAt) >= sevenDaysAgo
  );

  const topicsSection = recentTopics.length > 0
    ? `\n\n## 過去7日間に公開済みのトピック:\n${recentTopics.map(t => `- ${t.publishedAt.split('T')[0]}: ${t.topic}`).join('\n')}\n\n重要: 上記トピックと同一または非常に類似するトピックの記事には novelty: 0 を付与してください。\n同じニュース・発表を異なるソースから取った記事も同一トピックとみなしてください。`
    : '';

  const systemPrompt = `あなたはAIコーディング・開発技術の情報をキュレーションするエキスパートです。
記事の重要度を以下の観点でスコアリングし、最も価値の高い記事を選別してください。

## スコアリング観点
- novelty (新規性): その情報がどれだけ新しい・斬新か（1-10）
- impact (影響度): AIコーディング・開発者体験への影響の大きさ（1-10）
- relevance (関連性): AIコーディングとの関連度
  - 直接関係（AIコーディングツール、コード生成、IDE統合等）→ 8-10
  - 応用可能（LLMの新機能、API更新、プロンプト技術等）→ 5-7
  - 関連薄い（一般的なAIニュース、ビジネス動向等）→ 1-4

追加で以下の品質チェックも行い、真偽値で判定してください（スコアへの加算はシステム側で行います）:
- hasSpecifics (具体性): 具体的な数値、バージョン、ベンチマーク結果などが含まれているか
- isReproducible (再現可能性): コード例、手順、設定が含まれており読者が試せるか
- isPrimarySource (一次情報): 公式ブログ、論文、リリースノートなど一次情報源からの記事か

${criteriaText}${topicsSection}

## 優先度ルール
以下の3系列に関する記事を最優先でスコアリングしてください:
- Anthropic (Claude, Claude Code, Sonnet, Opus, Haiku)
- OpenAI (GPT, ChatGPT, Codex, GitHub Copilot, o1, o3)
- Google (Gemini, Gemini Code Assist, DeepMind)

上記3系列以外のモデル・企業の記事は impact を -4 以上減点してください。

## コーディング・開発技術ブースト
以下に該当する記事は relevance と impact をそれぞれ +2 加点してください:
- AIコーディングツール（Copilot, Cursor, Windsurf, Cline, Aider, Devin等）
- コード生成・補完・リファクタリング技術
- AI IDE統合・開発ワークフロー改善
- エージェント型コーディング（agentic coding, vibe coding）

## ベストプラクティス・実践レポートブースト
以下に該当する記事は relevance と impact をそれぞれ +2 加点してください:
- 公式ドキュメント・ガイドのベストプラクティス（例: Anthropic公式のプロンプト設計ガイド、OpenAI Cookbook等）
- 個人開発者の成功談・体験談・ワークフロー共有
- AI活用の具体的なTips・ハウツー記事
- 実際のプロジェクトでのAIコーディング導入事例

必ずJSON配列で回答してください。各要素は以下の形式:
{ "id": "<記事ID>", "novelty": <1-10>, "impact": <1-10>, "relevance": <1-10>, "hasSpecifics": <true/false>, "isReproducible": <true/false>, "isPrimarySource": <true/false> }`;

  const userPrompt = `以下の${articles.length}件の記事をスコアリングしてください。上位${maxArticles}件を選別します。\n\n${articleList}\n\nJSON配列のみ返してください。`;

  try {
    const response = await client.chat(systemPrompt, userPrompt);
    const jsonStr = extractJsonFromResponse(response);
    const scores: ScoredArticle[] = JSON.parse(jsonStr);

    // 総合スコアを計算してソート（不正値は 0 に丸める）
    const scored = scores.map(s => {
      const bonus =
        (s.hasSpecifics ? 0.5 : 0) +
        (s.isReproducible ? 0.5 : 0) +
        (s.isPrimarySource ? 0.5 : 0);
      const score = ((Number(s.novelty) || 0) + (Number(s.impact) || 0) + (Number(s.relevance) || 0)) / 3 + bonus;
      return { id: s.id, totalScore: score };
    });
    scored.sort((a, b) => b.totalScore - a.totalScore);

    // 上位 maxArticles 件の ID を取得
    const selectedIds = new Set(scored.slice(0, maxArticles).map(s => s.id));

    return articles.filter(a => selectedIds.has(a.id));
  } catch (error) {
    // API エラー時は先頭 maxArticles 件を返す
    console.error('選別APIエラー（先頭N件を返します）:', error);
    return articles.slice(0, maxArticles);
  }
}
