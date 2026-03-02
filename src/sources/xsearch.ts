import type { SourceAdapter, FetchResult } from './types.js';
import type { XSearchSourceConfig } from '../config/schema.js';
import { parseXSearchResponse } from './xsearch-parser.js';
import { createXaiClient } from '../ai/grok-client.js';
import { toErrorMessage } from '../utils/error.js';

const XSEARCH_RESPONSE_SCHEMA = {
  type: 'json_schema' as const,
  json_schema: {
    name: 'x_search_results',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        posts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              username: { type: 'string' },
              text: { type: 'string' },
              url: { type: 'string' },
              external_url: { type: ['string', 'null'] },
              like_count: { type: ['number', 'null'] },
              posted_at: { type: ['string', 'null'] },
            },
            required: ['username', 'text', 'url', 'external_url', 'like_count', 'posted_at'],
            additionalProperties: false,
          },
        },
      },
      required: ['posts'],
      additionalProperties: false,
    },
  },
};

export class XSearchAdapter implements SourceAdapter {
  private readonly client: ReturnType<typeof createXaiClient>;
  private readonly config: XSearchSourceConfig;

  constructor(config: XSearchSourceConfig) {
    this.client = createXaiClient();
    this.config = config;
  }

  async fetch(): Promise<FetchResult> {
    const errors: string[] = [];
    const allArticles: import('./types.js').Article[] = [];

    // allowed_x_handles は最大10件 → バッチ分割
    const batches: string[][] = [];
    for (let i = 0; i < this.config.accounts.length; i += 10) {
      batches.push(this.config.accounts.slice(i, i + 10));
    }

    // 日付範囲: 直近2日
    const now = new Date();
    const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
    const fromDate = twoDaysAgo.toISOString().split('T')[0];
    const toDate = now.toISOString().split('T')[0];

    for (const batch of batches) {
      try {
        const handlesStr = batch.map(h => `@${h}`).join(', ');
        const linkFilter = this.config.includeTextOnly ? '' : ' Make sure to include only posts that contain external links.';

        const response = await (this.client as any).responses.create({
          model: this.config.model,
          tools: [{
            type: 'x_search',
            x_search: {
              allowed_x_handles: batch,
              from_date: fromDate,
              to_date: toDate,
            },
          }],
          input: `Search for recent posts from ${handlesStr} about AI, machine learning, or technology.${linkFilter} Return all matching posts with their details.`,
          text: {
            format: XSEARCH_RESPONSE_SCHEMA,
          },
        });

        const articles = parseXSearchResponse(response as Record<string, unknown>);

        // includeTextOnly=false の場合、外部リンクのないものを除外
        const filtered = this.config.includeTextOnly
          ? articles
          : articles.filter(a => a.primarySourceUrl || (a.metadata as any)?.tweetUrl !== a.url);

        allArticles.push(...filtered);
      } catch (error) {
        errors.push(`XSearch batch [${batch.join(', ')}]: ${toErrorMessage(error)}`);
      }
    }

    return {
      source: 'XSearch',
      articles: allArticles,
      errors,
    };
  }
}
