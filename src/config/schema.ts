import { z } from 'zod';
import { readFileSync } from 'fs';
import { parse } from 'yaml';

// RSSソース設定
const RssSourceSchema = z.object({
  type: z.literal('rss'),
  name: z.string(),
  url: z.string().url(),
});

// Hacker Newsソース設定
const HackerNewsSourceSchema = z.object({
  type: z.literal('hackernews'),
  keywords: z.array(z.string()),
  minScore: z.number().int().nonnegative(),
});

// Redditソース設定
const RedditSourceSchema = z.object({
  type: z.literal('reddit'),
  subreddit: z.string(),
  minUpvotes: z.number().int().nonnegative(),
});

// arXivソース設定
const ArxivSourceSchema = z.object({
  type: z.literal('arxiv'),
  categories: z.array(z.string()),
  maxResults: z.number().int().positive(),
});

// アカウントエントリ（文字列 or { handle, tier }）
const AccountEntrySchema = z.union([
  z.string(),
  z.object({
    handle: z.string(),
    tier: z.number().int().min(1).max(4).default(4),
  }),
]);

// Blueskyソース設定
const BlueskySourceSchema = z.object({
  type: z.literal('bluesky'),
  accounts: z.array(AccountEntrySchema),
  limit: z.number().int().positive().default(20),
  includeTextOnly: z.boolean().default(false),
  includeReposts: z.boolean().default(false),
  credibility: z.enum(['official', 'peer-reviewed', 'major-media', 'community']).optional(),
});

// XSearchソース設定
const XSearchSourceSchema = z.object({
  type: z.literal('xsearch'),
  accounts: z.array(AccountEntrySchema),
  model: z.string().default('grok-4-1-fast-non-reasoning'),
  includeTextOnly: z.boolean().default(false),
});

// Blueskyキーワード検索ソース設定
const BlueskySearchSourceSchema = z.object({
  type: z.literal('bluesky-search'),
  keywords: z.array(z.string()).min(1),
  lang: z.string().default('en'),
  sort: z.enum(['top', 'latest']).default('latest'),
  limit: z.number().int().positive().default(25),
  includeTextOnly: z.boolean().default(false),
});

// XSearchキーワード検索ソース設定
const XSearchKeywordSourceSchema = z.object({
  type: z.literal('xsearch-keyword'),
  keywords: z.array(z.string()).min(1),
  model: z.string().default('grok-4-1-fast-non-reasoning'),
  includeTextOnly: z.boolean().default(false),
  daysBack: z.number().int().positive().default(2),
});

// ソース設定の判別共用体
const SourceSchema = z.discriminatedUnion('type', [
  RssSourceSchema,
  HackerNewsSourceSchema,
  RedditSourceSchema,
  ArxivSourceSchema,
  BlueskySourceSchema,
  XSearchSourceSchema,
  BlueskySearchSourceSchema,
  XSearchKeywordSourceSchema,
]);

// 選択設定
const SelectionSchema = z.object({
  maxArticles: z.number().int().positive(),
  criteria: z.array(z.string()),
});

// 出力設定
const OutputSchema = z.object({
  tone: z.string(),
  language: z.string(),
});

// Claude設定
const ClaudeSchema = z.object({
  model: z.string(),
});

// Grok設定
const GrokSchema = z.object({
  model: z.string().default('grok-4-1-fast-non-reasoning'),
});

// Notion設定
const NotionSchema = z.object({
  pipelineDatabaseId: z.string().optional(),
  pipelineDataSourceId: z.string().optional(),
  pipelineDateDatabaseId: z.string().optional(),
  pipelineDateDataSourceId: z.string().optional(),
  tokenEnvVar: z.string().default('NOTION_API_TOKEN'),
});

// オーディエンス設定
const AudienceSchema = z.object({
  name: z.string(),
  description: z.string(),
  maxLength: z.number().default(800),
});

// パイプライン設定
const PipelineSchema = z.object({
  stages: z.array(z.enum(['knowledge', 'summary', 'tweet'])).default(['knowledge', 'summary', 'tweet']),
  summary: z.object({
    audiences: z.array(AudienceSchema).default([{
      name: 'エンジニア',
      description: 'AIツールを使う開発者。すぐ試せる情報を重視。',
      maxLength: 800,
    }]),
    rounds: z.number().default(2),
  }).default({}),
  tweet: z.object({
    maxChars: z.number().default(280),
    includeHashtags: z.boolean().default(true),
    hashtagCount: z.number().default(3),
  }).default({}),
}).optional();

// コンテンツフェッチ設定
const ContentFetchSchema = z.object({
  enabled: z.boolean().default(false),
  timeoutMs: z.number().default(15000),
  maxLength: z.number().default(10000),
  skipDomains: z.array(z.string()).default([
    'twitter.com', 'x.com', 'bsky.app', 'threads.net', 'reddit.com',
  ]),
}).default({});

// 全体設定スキーマ
export const ConfigSchema = z.object({
  sources: z.array(SourceSchema),
  selection: SelectionSchema,
  output: OutputSchema,
  claude: ClaudeSchema,
  grok: GrokSchema.default({ model: 'grok-4-1-fast-non-reasoning' }),
  notion: NotionSchema.optional(),
  pipeline: PipelineSchema,
  contentFetch: ContentFetchSchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type RssSourceConfig = z.infer<typeof RssSourceSchema>;
export type HackerNewsSourceConfig = z.infer<typeof HackerNewsSourceSchema>;
export type BlueskySourceConfig = z.infer<typeof BlueskySourceSchema>;
export type XSearchSourceConfig = z.infer<typeof XSearchSourceSchema>;
export type BlueskySearchSourceConfig = z.infer<typeof BlueskySearchSourceSchema>;
export type XSearchKeywordSourceConfig = z.infer<typeof XSearchKeywordSourceSchema>;

// アカウントエントリからhandle/tierを取得するユーティリティ
export function resolveAccount(entry: string | { handle: string; tier?: number }): { handle: string; tier: 1 | 2 | 3 | 4 } {
  if (typeof entry === 'string') return { handle: entry, tier: 4 };
  return { handle: entry.handle, tier: (entry.tier ?? 4) as 1 | 2 | 3 | 4 };
}

// config.yamlを読み込み、zodでバリデーションしてパース済みConfigオブジェクトを返す
export function loadConfig(configPath: string = 'config.yaml'): Config {
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = parse(raw);
  return ConfigSchema.parse(parsed);
}
