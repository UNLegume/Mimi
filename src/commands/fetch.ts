import { Command } from 'commander';
import type { Config } from '../config/schema.js';
import { loadConfig } from '../config/schema.js';
import { filterByAge } from '../utils/filter.js';
import { RssAdapter } from '../sources/rss.js';
import { HackerNewsAdapter } from '../sources/hackernews.js';
import { BlueskyAdapter } from '../sources/bluesky.js';
import { XSearchAdapter } from '../sources/xsearch.js';
import { BlueskySearchAdapter } from '../sources/bluesky-search.js';
import { XSearchKeywordAdapter } from '../sources/xsearch-keyword.js';
import type { SourceAdapter, FetchResult as SourceFetchResult } from '../sources/types.js';
import { saveCollectedArticlesToNotion } from '../notion/publisher.js';
import { createNotionClient } from '../notion/client.js';
import { fetchArticleContent } from '../utils/content-fetcher.js';
import type { FetchResult } from '../utils/content-fetcher.js';
import { notify } from '../utils/notify.js';
import { toErrorMessage } from '../utils/error.js';

export interface FetchExecutionResult {
  totalFetched: number;
  deduped: number;
  recent: number;
  enriched: number;
  saved: number;
  skipped: number;
}

export async function executeFetch(config: Config): Promise<FetchExecutionResult> {
  // 1. アダプタ生成
  const adapters: SourceAdapter[] = [];
  for (const source of config.sources) {
    if (source.type === 'rss') {
      adapters.push(new RssAdapter(source));
    } else if (source.type === 'hackernews') {
      adapters.push(new HackerNewsAdapter(source));
    } else if (source.type === 'bluesky') {
      adapters.push(new BlueskyAdapter(source));
    } else if (source.type === 'xsearch') {
      try {
        adapters.push(new XSearchAdapter(source));
      } catch (error) {
        console.warn(`XSearch ソースをスキップ: ${toErrorMessage(error)}`);
      }
    } else if (source.type === 'bluesky-search') {
      adapters.push(new BlueskySearchAdapter(source));
    } else if (source.type === 'xsearch-keyword') {
      try {
        adapters.push(new XSearchKeywordAdapter(source));
      } catch (error) {
        console.warn(`XSearch Keyword ソースをスキップ: ${toErrorMessage(error)}`);
      }
    }
  }

  if (adapters.length === 0) {
    console.log('有効なソースアダプタがありません。');
    return { totalFetched: 0, deduped: 0, recent: 0, enriched: 0, saved: 0, skipped: 0 };
  }

  console.log(`${adapters.length}件のソースから記事を収集中...`);

  // 2. 並行 fetch
  const results = await Promise.allSettled(
    adapters.map(adapter => adapter.fetch())
  );

  const fetchResults: SourceFetchResult[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      fetchResults.push(result.value);
    } else {
      console.error('アダプタ実行エラー:', result.reason);
    }
  }

  const allArticles = fetchResults.flatMap(r => r.articles);

  // 3. URL 重複排除 + 期間フィルタ
  const seen = new Set<string>();
  const deduped = allArticles.filter(a => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  });
  const recent = filterByAge(deduped);

  console.log('--- 収集結果 ---');
  for (const result of fetchResults) {
    const errorSuffix = result.errors.length > 0
      ? ` (エラー ${result.errors.length}件)`
      : '';
    console.log(`  ${result.source}: ${result.articles.length}件${errorSuffix}`);
  }
  console.log(`合計: ${allArticles.length}件収集 → 重複除去後 ${deduped.length}件 → 直近 ${recent.length}件`);

  if (recent.length === 0) {
    return { totalFetched: allArticles.length, deduped: deduped.length, recent: 0, enriched: 0, saved: 0, skipped: 0 };
  }

  // 4. 本文取得（Content Fetch）
  let enrichedCount = 0;
  if (config.contentFetch.enabled) {
    const stats = { success: 0, skipped_domain: 0, skipped_no_html: 0, skipped_parse_failed: 0, skipped_has_content: 0, error: 0 };
    const contentFetchTasks = recent.map(async (article) => {
      const targetUrl = article.primarySourceUrl ?? article.url;
      if (article.content) {
        stats.skipped_has_content++;
        return;
      }
      const result: FetchResult = await fetchArticleContent(targetUrl, {
        timeoutMs: config.contentFetch.timeoutMs,
        maxLength: config.contentFetch.maxLength,
        skipDomains: config.contentFetch.skipDomains,
      });
      stats[result.status]++;
      if (result.status === 'success' && result.content) {
        article.content = result.content.text;
        if (result.content.title && (article.title.endsWith('…') || article.title.endsWith('...'))) {
          article.title = result.content.title;
        }
        enrichedCount++;
      }
    });
    await Promise.allSettled(contentFetchTasks);
    const breakdownParts: string[] = [];
    if (stats.skipped_domain > 0) breakdownParts.push(`ドメインスキップ: ${stats.skipped_domain}`);
    if (stats.skipped_no_html > 0) breakdownParts.push(`非HTML: ${stats.skipped_no_html}`);
    if (stats.skipped_parse_failed > 0) breakdownParts.push(`parse失敗: ${stats.skipped_parse_failed}`);
    if (stats.error > 0) breakdownParts.push(`エラー: ${stats.error}`);
    if (stats.skipped_has_content > 0) breakdownParts.push(`既存: ${stats.skipped_has_content}`);
    const breakdownSuffix = breakdownParts.length > 0 ? ` (${breakdownParts.join(', ')})` : '';
    console.log(`📄 本文取得: ${enrichedCount}/${recent.length}件${breakdownSuffix}`);
  }

  // 5. Notion DB に保存（判定結果='未処理'）
  let saved = 0;
  let skipped = 0;
  if (config.notion?.pipelineDataSourceId) {
    console.log('Notion DB に保存中...');
    const notionClient = createNotionClient(config.notion.tokenEnvVar);
    const result = await saveCollectedArticlesToNotion(
      notionClient,
      config.notion.pipelineDataSourceId!,
      config.notion.pipelineDatabaseId!,
      config.notion.pipelineDateDataSourceId,
      config.notion.pipelineDateDatabaseId,
      recent,
    );
    saved = result.saved;
    skipped = result.skipped;
    console.log(`Notion 保存完了: ${saved}件保存, ${skipped}件スキップ（重複）`);
  } else {
    console.warn('notion.pipelineDataSourceId が未設定のため、Notion 保存をスキップします。');
  }

  return { totalFetched: allArticles.length, deduped: deduped.length, recent: recent.length, enriched: enrichedCount, saved, skipped };
}

export function registerFetchCommand(program: Command): void {
  program
    .command('fetch')
    .description('ソースから記事を収集し、Notion DB に保存（判定結果=未処理）')
    .option('-c, --config <path>', '設定ファイルパス', 'config.yaml')
    .addHelpText('after', `
Examples:
  $ mimi fetch                    ソースから記事を収集
  $ mimi fetch -c custom.yaml     カスタム設定で収集
`)
    .action(async (options: { config: string }) => {
      try {
        notify('Mimi', '記事収集を開始します');
        console.log('記事収集を開始します...');
        const config = loadConfig(options.config);
        const result = await executeFetch(config);
        notify('Mimi', `記事収集完了: ${result.recent}件（保存${result.saved}件）`);
        console.log(`\n収集完了: ${result.totalFetched}件 → 重複除去後 ${result.deduped}件 → 直近 ${result.recent}件 → 本文取得 ${result.enriched}件 → 保存 ${result.saved}件`);
      } catch (error) {
        notify('Mimi', '記事収集でエラーが発生しました');
        console.error('fetch コマンドでエラーが発生しました:', toErrorMessage(error));
        process.exit(1);
      }
    });
}
