import { createHash } from 'node:crypto';
import type { Article, FetchResult, SourceAdapter } from './types.js';
import type { BlueskySourceConfig } from '../config/schema.js';

export const BSKY_API_BASE = 'https://public.api.bsky.app/xrpc';

interface BskyExternalEmbed {
  uri: string;
  title?: string;
  description?: string;
}

interface BskyEmbed {
  external?: BskyExternalEmbed;
}

interface BskyRecord {
  text: string;
  createdAt: string;
}

interface BskyPost {
  uri: string;
  cid: string;
  record: BskyRecord;
  embed?: BskyEmbed;
  likeCount?: number;
  repostCount?: number;
}

interface BskyFeedItem {
  post: BskyPost;
  reason?: Record<string, unknown>;
}

interface BskyFeedResponse {
  feed: BskyFeedItem[];
}

export class BlueskyAdapter implements SourceAdapter {
  constructor(private readonly config: BlueskySourceConfig) {}

  async fetch(): Promise<FetchResult> {
    const errors: string[] = [];
    const articles: Article[] = [];

    const results = await Promise.allSettled(
      this.config.accounts.map(handle => this.fetchAccountFeed(handle))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        errors.push(`Bluesky feed取得失敗: ${String(result.reason)}`);
        continue;
      }

      const { handle, items, error } = result.value;

      if (error) {
        errors.push(`Bluesky @${handle} feed取得失敗: ${error}`);
        continue;
      }

      for (const feedItem of items) {
        // Skip reposts
        if (feedItem.reason) continue;

        const post = feedItem.post;
        const text = post.record.text;
        const externalLink = post.embed?.external;

        // Skip text-only posts when includeTextOnly is false
        if (!this.config.includeTextOnly && !externalLink) continue;

        // Extract rkey from uri (format: at://did:plc:xxx/app.bsky.feed.post/rkey)
        const uriSegments = post.uri.split('/');
        const rkey = uriSegments[uriSegments.length - 1];
        const postUrl = `https://bsky.app/profile/${handle}/post/${rkey}`;

        const id = `bsky-${createHash('sha256').update(post.cid).digest('hex').slice(0, 16)}`;

        const truncatedText = text.length > 140 ? `${text.slice(0, 140)}...` : text;

        const title = externalLink
          ? (externalLink.title || truncatedText)
          : truncatedText;

        const url = externalLink ? externalLink.uri : postUrl;

        const primarySourceUrl = externalLink ? externalLink.uri : undefined;

        const article: Article = {
          id,
          title,
          url,
          primarySourceUrl,
          primarySourceType: this.config.credibility,
          source: 'bluesky',
          sourceName: `Bluesky @${handle}`,
          summary: text,
          publishedAt: new Date(post.record.createdAt),
          fetchedAt: new Date(),
          metadata: {
            handle,
            likeCount: post.likeCount,
            repostCount: post.repostCount,
            hasLink: Boolean(externalLink),
          },
        };

        articles.push(article);
      }
    }

    return { source: 'Bluesky', articles, errors };
  }

  private async fetchAccountFeed(
    handle: string
  ): Promise<{ handle: string; items: BskyFeedItem[]; error?: string }> {
    try {
      const url = new URL(`${BSKY_API_BASE}/app.bsky.feed.getAuthorFeed`);
      url.searchParams.set('actor', handle);
      url.searchParams.set('filter', 'posts_no_replies');
      url.searchParams.set('limit', String(this.config.limit));

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as BskyFeedResponse;
      return { handle, items: data.feed };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { handle, items: [], error: message };
    }
  }
}
