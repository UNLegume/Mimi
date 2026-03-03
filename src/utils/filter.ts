import type { Article } from '../sources/types.js';

const HOURS_48_MS = 48 * 60 * 60 * 1000;

/**
 * 指定時間以内に公開された記事のみを返す。
 * publishedAt が未設定の場合は fetchedAt をフォールバックとして使用する。
 */
export function filterByAge(articles: Article[], maxAgeMs: number = HOURS_48_MS): Article[] {
  const now = Date.now();
  return articles.filter(article => {
    const timestamp = article.publishedAt ?? article.fetchedAt;
    if (!timestamp) return false;
    const publishedTime = timestamp.getTime();
    return (now - publishedTime) <= maxAgeMs;
  });
}
