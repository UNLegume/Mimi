import type { SourceAdapter, FetchResult, Article } from './types.js';
import type { XSearchKeywordSourceConfig } from '../config/schema.js';
import { parseXSearchResponse, XSEARCH_RESPONSE_SCHEMA } from './xsearch-parser.js';
import { createXaiClient } from '../ai/grok-client.js';
import { toErrorMessage } from '../utils/error.js';

export class XSearchKeywordAdapter implements SourceAdapter {
  private readonly client: ReturnType<typeof createXaiClient>;
  private readonly config: XSearchKeywordSourceConfig;

  constructor(config: XSearchKeywordSourceConfig) {
    this.client = createXaiClient();
    this.config = config;
  }

  get name(): string {
    return 'xsearch-keyword';
  }

  async fetch(): Promise<FetchResult> {
    const errors: string[] = [];
    const allArticles: Article[] = [];

    // 日付範囲: daysBack 設定に基づく
    const now = new Date();
    const daysAgo = new Date(now.getTime() - this.config.daysBack * 24 * 60 * 60 * 1000);
    const fromDate = daysAgo.toISOString().split('T')[0];
    const toDate = now.toISOString().split('T')[0];

    const keywordsStr = this.config.keywords.join(', ');
    const linkFilter = this.config.includeTextOnly ? '' : ' Make sure to include only posts that contain external links.';

    try {
      const response = await (this.client as any).responses.create({
        model: this.config.model,
        tools: [{
          type: 'x_search',
          x_search: {
            from_date: fromDate,
            to_date: toDate,
          },
        }],
        input: `Search for recent posts about the following keywords: ${keywordsStr}.${linkFilter} Return all matching posts with their details.`,
        text: {
          format: XSEARCH_RESPONSE_SCHEMA,
        },
      });

      const articles = parseXSearchResponse(response as Record<string, unknown>);

      // source フィールドを 'xsearch-keyword' に上書き
      const sourced = articles.map(a => ({ ...a, source: 'xsearch-keyword' as Article['source'] }));

      // includeTextOnly=false の場合、外部リンクのないものを除外
      const filtered = this.config.includeTextOnly
        ? sourced
        : sourced.filter(a => a.primarySourceUrl || (a.metadata as any)?.tweetUrl !== a.url);

      allArticles.push(...filtered);
    } catch (error) {
      errors.push(`XSearchKeyword [${keywordsStr}]: ${toErrorMessage(error)}`);
    }

    return {
      source: 'xsearch-keyword',
      articles: allArticles,
      errors,
    };
  }
}

export default XSearchKeywordAdapter;
