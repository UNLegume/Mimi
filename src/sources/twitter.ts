import { createHash } from 'node:crypto';
import type { Article, FetchResult, SourceAdapter } from './types.js';
import type { TwitterSourceConfig } from '../config/schema.js';

const TWITTER_API_BASE = 'https://api.twitter.com/2';

interface TwitterUrlEntity {
  url: string;
  expanded_url: string;
  display_url?: string;
  title?: string;
}

interface TwitterEntities {
  urls?: TwitterUrlEntity[];
}

interface TwitterPublicMetrics {
  like_count?: number;
  retweet_count?: number;
  reply_count?: number;
  quote_count?: number;
}

interface TwitterTweet {
  id: string;
  text: string;
  created_at: string;
  entities?: TwitterEntities;
  public_metrics?: TwitterPublicMetrics;
}

interface TwitterTweetsResponse {
  data?: TwitterTweet[];
  errors?: Array<{ message: string }>;
}

interface TwitterUserResponse {
  data?: {
    id: string;
    name: string;
    username: string;
  };
  errors?: Array<{ message: string }>;
}

export class TwitterAdapter implements SourceAdapter {
  private readonly bearerToken: string;

  constructor(private readonly config: TwitterSourceConfig) {
    const token = config.bearerToken ?? process.env.TWITTER_BEARER_TOKEN;
    if (!token) {
      throw new Error(
        'Twitter Bearer Token が設定されていません。bearerToken または環境変数 TWITTER_BEARER_TOKEN を設定してください'
      );
    }
    this.bearerToken = token;
  }

  async fetch(): Promise<FetchResult> {
    const errors: string[] = [];
    const articles: Article[] = [];

    const results = await Promise.allSettled(
      this.config.accounts.map(username => this.fetchAccountTweets(username))
    );

    for (const result of results) {
      if (result.status === 'rejected') {
        errors.push(`Twitter feed取得失敗: ${String(result.reason)}`);
        continue;
      }

      const { username, tweets, error } = result.value;

      if (error) {
        errors.push(`Twitter @${username} feed取得失敗: ${error}`);
        continue;
      }

      for (const tweet of tweets) {
        // Extract external URLs, filtering out t.co links that point to twitter.com/x.com itself
        const externalUrl = tweet.entities?.urls?.find(
          entity =>
            !entity.expanded_url.includes('twitter.com') &&
            !entity.expanded_url.includes('x.com')
        );

        // Skip text-only tweets when includeTextOnly is false
        if (!this.config.includeTextOnly && !externalUrl) continue;

        const tweetUrl = `https://x.com/${username}/status/${tweet.id}`;
        const id = `tw-${createHash('sha256').update(tweet.id).digest('hex').slice(0, 16)}`;

        const truncatedText =
          tweet.text.length > 140 ? `${tweet.text.slice(0, 140)}...` : tweet.text;

        const title = externalUrl ? (externalUrl.title || truncatedText) : truncatedText;
        const url = externalUrl ? externalUrl.expanded_url : tweetUrl;
        const primarySourceUrl = externalUrl ? externalUrl.expanded_url : undefined;

        const article: Article = {
          id,
          title,
          url,
          primarySourceUrl,
          source: 'twitter',
          sourceName: `Twitter @${username}`,
          summary: tweet.text,
          publishedAt: new Date(tweet.created_at),
          fetchedAt: new Date(),
          metadata: {
            username,
            likeCount: tweet.public_metrics?.like_count,
            retweetCount: tweet.public_metrics?.retweet_count,
            hasLink: Boolean(externalUrl),
          },
        };

        articles.push(article);
      }
    }

    return { source: 'Twitter', articles, errors };
  }

  private async fetchUserId(username: string): Promise<string> {
    const url = new URL(`${TWITTER_API_BASE}/users/by/username/${username}`);
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = (await response.json()) as TwitterUserResponse;

    if (data.errors && data.errors.length > 0) {
      throw new Error(data.errors[0].message);
    }

    if (!data.data?.id) {
      throw new Error(`ユーザー @${username} が見つかりませんでした`);
    }

    return data.data.id;
  }

  private async fetchUserTweets(userId: string, username: string): Promise<TwitterTweet[]> {
    const limit = Math.min(Math.max(this.config.limit, 5), 100);

    const url = new URL(`${TWITTER_API_BASE}/users/${userId}/tweets`);
    url.searchParams.set('exclude', 'retweets,replies');
    url.searchParams.set('max_results', String(limit));
    url.searchParams.set('tweet.fields', 'created_at,entities,public_metrics');
    url.searchParams.set('expansions', 'attachments.media_keys');

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.bearerToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}: ${response.statusText} (user: @${username})`
      );
    }

    const data = (await response.json()) as TwitterTweetsResponse;

    if (data.errors && data.errors.length > 0) {
      throw new Error(data.errors[0].message);
    }

    return data.data ?? [];
  }

  private async fetchAccountTweets(
    username: string
  ): Promise<{ username: string; tweets: TwitterTweet[]; error?: string }> {
    try {
      const userId = await this.fetchUserId(username);
      const tweets = await this.fetchUserTweets(userId, username);
      return { username, tweets };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { username, tweets: [], error: message };
    }
  }
}
