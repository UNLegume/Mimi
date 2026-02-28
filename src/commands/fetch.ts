import { Command } from 'commander';
import { loadConfig } from '../config/schema.js';
import { ArticleStore } from '../store/articles.js';
import { RssAdapter } from '../sources/rss.js';
import { HackerNewsAdapter } from '../sources/hackernews.js';
import { BlueskyAdapter } from '../sources/bluesky.js';
import { TwitterAdapter } from '../sources/twitter.js';
import type { SourceAdapter, FetchResult } from '../sources/types.js';
import { filterByAge } from '../utils/filter.js';

export function registerFetchCommand(program: Command): void {
  program
    .command('fetch')
    .description('設定されたソースから記事を収集して保存')
    .option('-c, --config <path>', '設定ファイルパス', 'config.yaml')
    .addHelpText('after', `
Examples:
  $ mimi fetch                  全ソースから記事を収集
  $ mimi fetch -c custom.yaml   カスタム設定ファイルを使用
`)
    .action(async (options: { config: string }) => {
      try {
        const config = loadConfig(options.config);

        // ソース設定からアダプタを生成
        const adapters: SourceAdapter[] = [];
        for (const source of config.sources) {
          if (source.type === 'rss') {
            adapters.push(new RssAdapter(source));
          } else if (source.type === 'hackernews') {
            adapters.push(new HackerNewsAdapter(source));
          } else if (source.type === 'bluesky') {
            adapters.push(new BlueskyAdapter(source));
          } else if (source.type === 'twitter') {
            try {
              adapters.push(new TwitterAdapter(source));
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              console.warn(`⚠️  Twitter ソースをスキップ: ${message}`);
            }
          }
          // reddit / arxiv は未実装
        }

        if (adapters.length === 0) {
          console.log('有効なソースアダプタがありません。');
          return;
        }

        console.log(`${adapters.length}件のソースから記事を収集中...`);

        // 全アダプタを並行実行
        const results = await Promise.allSettled(
          adapters.map(adapter => adapter.fetch())
        );

        const fetchResults: FetchResult[] = [];
        for (const result of results) {
          if (result.status === 'fulfilled') {
            fetchResults.push(result.value);
          } else {
            console.error('アダプタ実行エラー:', result.reason);
          }
        }

        // 結果をフラット化して重複排除
        const allArticles = fetchResults.flatMap(r => r.articles);
        const store = new ArticleStore();
        const deduped = store.deduplicate(allArticles);
        const recent = filterByAge(deduped);
        store.save('fetched.json', recent);

        // サマリー表示
        console.log('\n--- 収集結果 ---');
        for (const result of fetchResults) {
          const errorSuffix = result.errors.length > 0
            ? ` (エラー ${result.errors.length}件)`
            : '';
          console.log(`  ${result.source}: ${result.articles.length}件${errorSuffix}`);
          for (const err of result.errors) {
            console.error(`    エラー: ${err}`);
          }
        }
        const duplicatesRemoved = allArticles.length - deduped.length;
        const filteredOut = deduped.length - recent.length;
        console.log(`\n合計: ${allArticles.length}件収集 → 重複排除後 ${deduped.length}件 → 48時間以内 ${recent.length}件保存`);
        if (duplicatesRemoved > 0) {
          console.log(`  (重複 ${duplicatesRemoved}件を除外)`);
        }
        if (filteredOut > 0) {
          console.log(`  (48時間以前の記事 ${filteredOut}件を除外)`);
        }
      } catch (error) {
        console.error('fetchコマンドでエラーが発生しました:', error);
        process.exit(1);
      }
    });
}
