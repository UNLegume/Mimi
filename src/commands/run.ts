import { Command } from 'commander';
import type { Client } from '@notionhq/client';
import { loadConfig } from '../config/schema.js';
import { ArticleStore } from '../store/articles.js';
import { RssAdapter } from '../sources/rss.js';
import { HackerNewsAdapter } from '../sources/hackernews.js';
import { BlueskyAdapter } from '../sources/bluesky.js';
import { TwitterAdapter } from '../sources/twitter.js';
import type { SourceAdapter, FetchResult } from '../sources/types.js';
import { createClient } from '../ai/client.js';
import { verifyArticles } from '../ai/verifier.js';
import { selectArticles } from '../ai/selector.js';
import { generateArticle } from '../ai/generator.js';
import { notify } from '../utils/notify.js';
import { createNotionClient } from '../notion/client.js';
import { findDatePage, publishArticleToNotion } from '../notion/publisher.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('fetch→select→generateの全パイプラインを一括実行')
    .option('-c, --config <path>', '設定ファイルパス', 'config.yaml')
    .addHelpText('after', `
Examples:
  $ mimi run                    fetch→select→generate を一括実行
  $ mimi run -c custom.yaml     カスタム設定で一括実行
`)
    .action(async (options: { config: string }) => {
      try {
        notify('Mimi', 'パイプラインを開始します');
        console.log('パイプラインを開始します...');

        const config = loadConfig(options.config);

        if (!process.env.ANTHROPIC_API_KEY) {
          console.error('エラー: ANTHROPIC_API_KEY が設定されていません。');
          console.error('.env ファイルまたは環境変数に ANTHROPIC_API_KEY を設定してください。');
          process.exit(1);
        }

        // === Step 1: Fetch ===
        notify('Mimi [1/3]', '記事を収集中...');
        console.log('\n[1/3] ソースから記事を収集中...');

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
              console.warn(`Twitter ソースをスキップ: ${message}`);
            }
          }
        }

        if (adapters.length === 0) {
          console.log('有効なソースアダプタがありません。処理を終了します。');
          return;
        }

        console.log(`${adapters.length}件のソースから記事を収集中...`);

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

        const allArticles = fetchResults.flatMap(r => r.articles);
        const store = new ArticleStore();
        const { articles: recent, totalCount, newCount } = store.merge('fetched.json', allArticles);
        store.appendHistory({ timestamp: new Date().toISOString(), filename: 'fetched.json', count: totalCount, newCount });

        console.log('--- 収集結果 ---');
        for (const result of fetchResults) {
          const errorSuffix = result.errors.length > 0
            ? ` (エラー ${result.errors.length}件)`
            : '';
          console.log(`  ${result.source}: ${result.articles.length}件${errorSuffix}`);
        }
        console.log(`合計: ${allArticles.length}件収集 → 新規追加 ${newCount}件 / 累計 ${totalCount}件`);

        if (recent.length === 0) {
          console.log('収集記事がありません。処理を終了します。');
          return;
        }

        notify('Mimi [1/3]', `記事収集完了: 新規${newCount}件 / 累計${totalCount}件`);

        // === Step 2: Select ===
        notify('Mimi [2/3]', '記事を検証・選別中...');
        console.log('\n[2/3] 記事を検証・選別中...');

        const client = createClient(config.claude.model);

        console.log('記事を検証中...');
        const { verified, rejected } = await verifyArticles(recent, client, config.claude.model);

        console.log('--- 検証結果 ---');
        console.log(`  verified: ${verified.length}件`);
        console.log(`  rejected: ${rejected.length}件`);
        for (const { article, reason } of rejected) {
          console.log(`    [REJECTED] ${article.title}`);
          console.log(`              理由: ${reason}`);
        }

        store.save('verified.json', verified);
        console.log(`verified.json に ${verified.length}件を保存しました。`);

        if (verified.length === 0) {
          console.log('検証済み記事がありません。処理を終了します。');
          return;
        }

        console.log('記事を選別中...');
        const publishedTopics = store.loadPublishedTopics();
        const selected = await selectArticles(
          verified,
          client,
          config.claude.model,
          config.selection.maxArticles,
          config.selection.criteria,
          publishedTopics
        );

        console.log('--- 選別結果 ---');
        selected.forEach((article, index) => {
          console.log(`  ${index + 1}. ${article.title}`);
        });

        store.save('selected.json', selected);
        console.log(`selected.json に ${selected.length}件を保存しました。`);

        if (selected.length === 0) {
          console.log('選別済み記事がありません。処理を終了します。');
          return;
        }

        notify('Mimi [2/3]', `選別完了: ${selected.length}件`);

        // === Step 3: Generate ===
        notify('Mimi [3/3]', '記事を生成中...');
        console.log('\n[3/3] 記事を生成中...');

        const tone = config.output.tone;
        let generatedCount = 0;

        // Notion クライアント初期化（設定がある場合のみ）
        let notionClient: Client | null = null;
        let datePage: { id: string; url: string } | null = null;

        if (config.notion) {
          try {
            notionClient = createNotionClient(config.notion.tokenEnvVar);
            const today = new Date().toISOString().split('T')[0].replace(/-/g, '/');
            datePage = await findDatePage(notionClient, config.notion.collectionDbId, today);
            if (datePage) {
              console.log(`Notion 日付ページを検出: ${today}`);
            } else {
              console.warn(`Notion に ${today} の日付ページが見つかりません。コンソール出力にフォールバックします。`);
            }
          } catch (error) {
            console.warn(`Notion 初期化エラー: ${error instanceof Error ? error.message : String(error)}`);
            console.warn('コンソール出力にフォールバックします。');
          }
        }

        for (const article of selected) {
          console.log(`\n生成中: ${article.title}`);
          try {
            const content = await generateArticle(article, client, config.claude.model, tone);
            // Notion に出力（設定がある場合）
            if (notionClient && datePage) {
              const result = await publishArticleToNotion(notionClient, datePage.id, article.title, content);
              if (result.success) {
                console.log(`  → Notion に公開: ${result.notionPageUrl}`);
              } else {
                console.warn(`  ⚠ Notion 公開失敗: ${result.error}`);
                console.log(content);
              }
            } else {
              console.log(content);
            }
            generatedCount++;
            store.savePublishedTopic({
              id: article.id,
              title: article.title,
              topic: article.title,
              publishedAt: new Date().toISOString(),
              url: article.url,
            });
          } catch (error) {
            console.error(`  エラー: ${article.title} の生成に失敗しました:`, error);
          }
        }

        notify('Mimi [3/3]', `生成完了: ${generatedCount}件`);

        // === 最終サマリー ===
        console.log('\n========================================');
        console.log('パイプライン完了');
        console.log('========================================');
        console.log(`収集: ${allArticles.length}件 → 新規追加 ${newCount}件 / 累計 ${totalCount}件`);
        console.log(`検証: ${recent.length}件 → verified ${verified.length}件 / rejected ${rejected.length}件`);
        console.log(`選別: ${verified.length}件 → ${selected.length}件`);
        console.log(`生成: ${generatedCount}件`);
        notify('Mimi', 'パイプライン完了！');
      } catch (error) {
        notify('Mimi', 'パイプラインでエラーが発生しました');
        console.error('run コマンドでエラーが発生しました:', error);
        process.exit(1);
      }
    });
}
