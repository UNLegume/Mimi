import type { Article } from '../sources/types.js';

interface VerifyResult {
  id: string;
  verdict: 'verified' | 'rejected';
  reason: string;
}

export interface VerificationOutput {
  verified: Article[];
  rejected: { article: Article; reason: string }[];
}

function classifyArticle(article: Article): VerifyResult {
  // ルール1: HN/Reddit で一次ソースURLなし → rejected
  if (
    (article.source === 'hackernews' || article.source === 'reddit') &&
    !article.primarySourceUrl
  ) {
    return { id: article.id, verdict: 'rejected', reason: '一次ソースURLが未設定です（コミュニティソース）' };
  }

  // ルール2: arxiv → verified
  if (article.source === 'arxiv') {
    return { id: article.id, verdict: 'verified', reason: '学術論文（arxiv）' };
  }

  // ルール3: rss → verified
  if (article.source === 'rss') {
    return { id: article.id, verdict: 'verified', reason: 'config登録済みcuratedソース（rss）' };
  }

  // ルール4: primarySourceType が official or peer-reviewed → verified
  if (
    article.primarySourceType === 'official' ||
    article.primarySourceType === 'peer-reviewed'
  ) {
    return { id: article.id, verdict: 'verified', reason: `信頼できる一次ソース（${article.primarySourceType}）` };
  }

  // ルール4.5: 優先3系列（Claude/OpenAI/Gemini）またはAIコーディング関連を含まない記事 → rejected
  const MAJOR_KEYWORDS = [
    // === 優先3系列: Anthropic/Claude ===
    'anthropic', 'claude', 'claude code', 'sonnet', 'opus', 'haiku',
    // === 優先3系列: OpenAI ===
    'openai', 'gpt', 'chatgpt', 'codex', 'o1', 'o3', 'o4',
    // === 優先3系列: Google/Gemini ===
    'google', 'gemini', 'deepmind', 'gemini code assist',
    // === コーディングツール・IDE ===
    'copilot', 'github copilot', 'cursor', 'windsurf', 'cline',
    'aider', 'devin', 'replit agent',
    // === AIコーディング概念 ===
    'ai coding', 'ai code', 'code generation', 'vibe coding',
    'agentic coding', 'ai ide', 'ai pair programming',
    'code assistant', 'code completion',
  ];

  const text = `${article.title} ${article.summary ?? ''}`.toLowerCase();
  const hasMajorKeyword = MAJOR_KEYWORDS.some(kw => text.includes(kw));
  if (!hasMajorKeyword) {
    return { id: article.id, verdict: 'rejected', reason: '優先3系列/AIコーディングに該当しない' };
  }

  // ルール5: 判定不能 → verified（selectorに委ねる）
  return { id: article.id, verdict: 'verified', reason: '判定不能のためselectorに委ねる' };
}

export function verifyArticles(articles: Article[]): VerificationOutput {
  const verified: Article[] = [];
  const rejected: { article: Article; reason: string }[] = [];

  for (const article of articles) {
    const result = classifyArticle(article);
    if (result.verdict === 'verified') {
      verified.push(article);
    } else {
      rejected.push({ article, reason: result.reason });
    }
  }

  return { verified, rejected };
}
