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

// Blueskyソース設定
const BlueskySourceSchema = z.object({
  type: z.literal('bluesky'),
  accounts: z.array(z.string()),
  limit: z.number().int().positive().default(20),
  includeTextOnly: z.boolean().default(false),
  credibility: z.enum(['official', 'peer-reviewed', 'major-media', 'community']).optional(),
});

// Twitterソース設定
const TwitterSourceSchema = z.object({
  type: z.literal('twitter'),
  accounts: z.array(z.string()),
  limit: z.number().int().positive().default(20),
  includeTextOnly: z.boolean().default(false),
  bearerToken: z.string().optional(),
});

// ソース設定の判別共用体
const SourceSchema = z.discriminatedUnion('type', [
  RssSourceSchema,
  HackerNewsSourceSchema,
  RedditSourceSchema,
  ArxivSourceSchema,
  BlueskySourceSchema,
  TwitterSourceSchema,
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

// 全体設定スキーマ
export const ConfigSchema = z.object({
  sources: z.array(SourceSchema),
  selection: SelectionSchema,
  output: OutputSchema,
  claude: ClaudeSchema,
});

export type Config = z.infer<typeof ConfigSchema>;
export type SourceConfig = z.infer<typeof SourceSchema>;
export type RssSourceConfig = z.infer<typeof RssSourceSchema>;
export type HackerNewsSourceConfig = z.infer<typeof HackerNewsSourceSchema>;
export type RedditSourceConfig = z.infer<typeof RedditSourceSchema>;
export type ArxivSourceConfig = z.infer<typeof ArxivSourceSchema>;
export type BlueskySourceConfig = z.infer<typeof BlueskySourceSchema>;
export type TwitterSourceConfig = z.infer<typeof TwitterSourceSchema>;

// config.yamlを読み込み、zodでバリデーションしてパース済みConfigオブジェクトを返す
export function loadConfig(configPath: string = 'config.yaml'): Config {
  const raw = readFileSync(configPath, 'utf-8');
  const parsed = parse(raw);
  return ConfigSchema.parse(parsed);
}
