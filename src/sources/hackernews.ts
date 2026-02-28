import type { HackerNewsSourceConfig } from '../config/schema.js';
import type { SourceAdapter, FetchResult, Article } from './types.js';

const HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';
const TOP_STORIES_LIMIT = 50;

interface HNItem {
  id: number;
  title?: string;
  url?: string;
  score?: number;
  descendants?: number;
  type?: string;
  time?: number;  // Unix timestamp in seconds
}

export class HackerNewsAdapter implements SourceAdapter {
  constructor(private readonly config: HackerNewsSourceConfig) {}

  async fetch(): Promise<FetchResult> {
    const errors: string[] = [];
    const articles: Article[] = [];

    let topIds: number[];
    try {
      const response = await fetch(`${HN_API_BASE}/topstories.json`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const allIds: number[] = await response.json();
      topIds = allIds.slice(0, TOP_STORIES_LIMIT);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`HackerNews topstories取得失敗: ${message}`);
      return { source: 'Hacker News', articles, errors };
    }

    const results = await Promise.allSettled(
      topIds.map(id => this.fetchItem(id))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        errors.push(`HackerNews item取得失敗: ${String(result.reason)}`);
        continue;
      }
      const item = result.value;
      if (!item || !item.title) continue;

      // キーワードフィルタリング
      const titleLower = item.title.toLowerCase();
      const matchesKeyword = this.config.keywords.some(kw =>
        titleLower.includes(kw.toLowerCase())
      );
      if (!matchesKeyword) continue;

      // スコアフィルタリング
      if ((item.score ?? 0) < this.config.minScore) continue;

      const url = item.url ?? `https://news.ycombinator.com/item?id=${item.id}`;

      articles.push({
        id: `hn-${item.id}`,
        title: item.title,
        url,
        primarySourceUrl: item.url,
        primarySourceType: 'community',
        source: 'hackernews',
        sourceName: 'Hacker News',
        publishedAt: item.time ? new Date(item.time * 1000) : undefined,
        fetchedAt: new Date(),
        metadata: {
          score: item.score,
          comments: item.descendants,
        },
      });
    }

    return { source: 'Hacker News', articles, errors };
  }

  private async fetchItem(id: number): Promise<HNItem | null> {
    const response = await fetch(`${HN_API_BASE}/item/${id}.json`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for item ${id}`);
    }
    return response.json() as Promise<HNItem | null>;
  }
}
