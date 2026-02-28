import type Anthropic from '@anthropic-ai/sdk';
import type { Article } from '../sources/types.js';
import { callClaude } from './client.js';
import { extractJsonFromResponse } from '../utils/json.js';

interface VerifyResult {
  id: string;
  verdict: 'verified' | 'rejected';
  reason: string;
}

export interface VerificationOutput {
  verified: Article[];
  rejected: { article: Article; reason: string }[];
}

export async function verifyArticles(
  articles: Article[],
  client: Anthropic,
  model: string
): Promise<VerificationOutput> {
  const verified: Article[] = [];
  const rejected: { article: Article; reason: string }[] = [];

  // コミュニティソースで一次ソースURLがない記事は即時リジェクト
  const needsVerification: Article[] = [];
  for (const article of articles) {
    if (
      (article.source === 'hackernews' || article.source === 'reddit') &&
      !article.primarySourceUrl
    ) {
      rejected.push({ article, reason: '一次ソースURLが未設定です（コミュニティソース）' });
    } else {
      needsVerification.push(article);
    }
  }

  if (needsVerification.length === 0) {
    return { verified, rejected };
  }

  // バッチ処理: 全記事をまとめて1回のAPI呼び出しで検証
  const articleList = needsVerification.map((article, index) => {
    const parts = [
      `[${index}] id: ${article.id}`,
      `    title: ${article.title}`,
      `    url: ${article.url}`,
    ];
    if (article.summary) {
      parts.push(`    summary: ${article.summary.slice(0, 300)}`);
    }
    if (article.primarySourceUrl) {
      parts.push(`    primarySourceUrl: ${article.primarySourceUrl}`);
      parts.push(`    primarySourceType: ${article.primarySourceType ?? 'unknown'}`);
    }
    return parts.join('\n');
  }).join('\n\n');

  const systemPrompt = `あなたはAI関連情報の信頼性を評価するアシスタントです。
記事のURLやタイトル、サマリー、一次ソース情報を元に信頼性を判定してください。
以下の基準で判定します:
- verified: 信頼できる情報源、または一次ソースが明確
- rejected: 誤情報の疑い、スパム、または著しく信頼性が低い

必ずJSON配列で回答してください。各要素は以下の形式:
{ "id": "<記事ID>", "verdict": "verified" | "rejected", "reason": "<理由（日本語）>" }`;

  const userPrompt = `以下の記事一覧を検証してください:\n\n${articleList}\n\nJSON配列のみ返してください。`;

  try {
    const response = await callClaude(client, model, systemPrompt, userPrompt);
    const jsonStr = extractJsonFromResponse(response);
    const results: VerifyResult[] = JSON.parse(jsonStr);

    for (const result of results) {
      const article = needsVerification.find(a => a.id === result.id);
      if (!article) continue;
      if (result.verdict === 'verified') {
        verified.push(article);
      } else {
        rejected.push({ article, reason: result.reason });
      }
    }

    // API レスポンスに含まれなかった記事は verified 扱い
    const processedIds = new Set(results.map(r => r.id));
    for (const article of needsVerification) {
      if (!processedIds.has(article.id)) {
        verified.push(article);
      }
    }
  } catch (error) {
    // API エラー時は全記事を verified として通す
    console.error('検証APIエラー（全記事をverifiedとして通過）:', error);
    verified.push(...needsVerification);
  }

  return { verified, rejected };
}
