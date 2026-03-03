import { createHash } from 'node:crypto';
import type { Article, FetchResult, SourceAdapter } from './types.js';
import type { BlueskySearchSourceConfig } from '../config/schema.js';
import { BSKY_API_BASE } from './bluesky.js';

interface SearchPostAuthor {
  handle: string;
  displayName?: string;
}

interface SearchPostExternalEmbed {
  uri: string;
  title: string;
  description: string;
}

interface SearchPostEmbed {
  external?: SearchPostExternalEmbed;
  $type?: string;
}

interface SearchPost {
  uri: string;
  cid: string;
  author: SearchPostAuthor;
  record: {
    text: string;
    createdAt: string;
  };
  embed?: SearchPostEmbed;
  likeCount?: number;
  repostCount?: number;
}

interface SearchPostsResponse {
  posts: SearchPost[];
  cursor?: string;
}

export class BlueskySearchAdapter implements SourceAdapter {
  constructor(private readonly config: BlueskySearchSourceConfig) {}

  get name(): string {
    return 'bluesky-search';
  }

  async fetch(): Promise<FetchResult> {
    const errors: string[] = [];

    // Search for each keyword in parallel
    const results = await Promise.allSettled(
      this.config.keywords.map(keyword => this.searchKeyword(keyword))
    );

    // Collect all posts, tracking keyword match per post
    const postsByCid = new Map<string, { post: SearchPost; keyword: string }>();

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const keyword = this.config.keywords[i];

      if (result.status === 'rejected') {
        errors.push(`Bluesky search "${keyword}" 失敗: ${String(result.reason)}`);
        continue;
      }

      const { posts, error } = result.value;

      if (error) {
        errors.push(`Bluesky search "${keyword}" 失敗: ${error}`);
        continue;
      }

      for (const post of posts) {
        // Deduplicate by CID — keep first keyword match
        if (!postsByCid.has(post.cid)) {
          postsByCid.set(post.cid, { post, keyword });
        }
      }
    }

    // Convert deduplicated posts to Article objects
    const articles: Article[] = [];

    for (const { post, keyword } of postsByCid.values()) {
      const text = post.record.text;
      const externalLink = post.embed?.external;

      // Skip text-only posts when includeTextOnly is false
      if (!this.config.includeTextOnly && !externalLink) continue;

      const { handle } = post.author;

      // Extract rkey from URI (format: at://did:plc:xxx/app.bsky.feed.post/rkey)
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
        source: 'bluesky-search',
        sourceName: `Bluesky @${handle}`,
        summary: text,
        publishedAt: new Date(post.record.createdAt),
        fetchedAt: new Date(),
        metadata: {
          handle,
          likeCount: post.likeCount,
          repostCount: post.repostCount,
          hasLink: Boolean(externalLink),
          keyword,
        },
      };

      articles.push(article);
    }

    return { source: 'Bluesky Search', articles, errors };
  }

  private async searchKeyword(
    keyword: string
  ): Promise<{ posts: SearchPost[]; error?: string }> {
    try {
      const url = new URL(`${BSKY_API_BASE}/app.bsky.feed.searchPosts`);
      url.searchParams.set('q', keyword);
      url.searchParams.set('limit', String(this.config.limit));
      url.searchParams.set('sort', this.config.sort);
      url.searchParams.set('lang', this.config.lang);

      const response = await fetch(url.toString());
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = (await response.json()) as SearchPostsResponse;
      return { posts: data.posts };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { posts: [], error: message };
    }
  }
}

export default BlueskySearchAdapter;
