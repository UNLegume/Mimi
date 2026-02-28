import type Anthropic from '@anthropic-ai/sdk';
import type { Article } from '../sources/types.js';
import type { PublishedTopic } from '../store/articles.js';
import { subDays } from 'date-fns';
import { callClaude } from './client.js';

interface ScoredArticle {
  id: string;
  novelty: number;
  impact: number;
  relevance: number;
}

export async function selectArticles(
  articles: Article[],
  client: Anthropic,
  model: string,
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

  const systemPrompt = `あなたはAI関連の技術情報をキュレーションするエキスパートです。
記事の重要度を以下の観点でスコアリングし、最も価値の高い記事を選別してください。
- novelty (新規性): その情報がどれだけ新しい・斬新か（1-10）
- impact (影響度): AIや技術界への影響の大きさ（1-10）
- relevance (関連性): AI・機械学習・LLMとの関連度（1-10）

${criteriaText}${topicsSection}

必ずJSON配列で回答してください。各要素は以下の形式:
{ "id": "<記事ID>", "novelty": <1-10>, "impact": <1-10>, "relevance": <1-10> }`;

  const userPrompt = `以下の${articles.length}件の記事をスコアリングしてください。上位${maxArticles}件を選別します。\n\n${articleList}\n\nJSON配列のみ返してください。`;

  try {
    const response = await callClaude(client, model, systemPrompt, userPrompt);
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('JSONが見つかりませんでした');
    }
    const scores: ScoredArticle[] = JSON.parse(jsonMatch[0]);

    // 総合スコアを計算してソート（不正値は 0 に丸める）
    const scored = scores.map(s => ({
      id: s.id,
      totalScore: ((Number(s.novelty) || 0) + (Number(s.impact) || 0) + (Number(s.relevance) || 0)) / 3,
    }));
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
