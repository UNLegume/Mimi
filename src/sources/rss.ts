import Parser from 'rss-parser';
import { createHash } from 'crypto';
import type { RssSourceConfig } from '../config/schema.js';
import type { SourceAdapter, FetchResult, Article } from './types.js';

const parser = new Parser();

export class RssAdapter implements SourceAdapter {
  constructor(private readonly config: RssSourceConfig) {}

  async fetch(): Promise<FetchResult> {
    const errors: string[] = [];
    const articles: Article[] = [];

    try {
      const feed = await parser.parseURL(this.config.url);

      for (const item of feed.items) {
        const url = item.link ?? item.guid ?? '';
        if (!url || !item.title) continue;

        const id = createHash('sha256').update(url).digest('hex').slice(0, 16);

        let publishedAt: Date | undefined;
        if (item.isoDate) {
          publishedAt = new Date(item.isoDate);
        } else if (item.pubDate) {
          publishedAt = new Date(item.pubDate);
        }

        articles.push({
          id,
          title: item.title,
          url,
          source: 'rss',
          sourceName: this.config.name,
          summary: item.contentSnippet,
          content: item.content,
          publishedAt,
          fetchedAt: new Date(),
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${this.config.name}: ${message}`);
    }

    return {
      source: this.config.name,
      articles,
      errors,
    };
  }
}
