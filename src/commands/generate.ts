import { Command } from 'commander';
import type { Client } from '@notionhq/client';
import { loadConfig } from '../config/schema.js';
import { ArticleStore } from '../store/articles.js';
import { createClient } from '../ai/client.js';
import { generateArticle } from '../ai/generator.js';
import { createNotionClient } from '../notion/client.js';
import { findDatePage, publishArticleToNotion } from '../notion/publisher.js';

export function registerGenerateCommand(program: Command): void {
  program
    .command('generate [article-id]')
    .description('選別済み記事を日本語解説記事として生成')
    .option('-c, --config <path>', '設定ファイルパス', 'config.yaml')
    .addHelpText('after', `
Examples:
  $ mimi generate               全選別済み記事を生成
  $ mimi generate abc123        指定IDの記事のみ生成
`)
    .action(async (articleId: string | undefined, options: { config: string }) => {
      try {
        const config = loadConfig(options.config);

        if (!process.env.ANTHROPIC_API_KEY) {
          console.error('エラー: ANTHROPIC_API_KEY が設定されていません。');
          console.error('.env ファイルまたは環境変数に ANTHROPIC_API_KEY を設定してください。');
          process.exit(1);
        }

        const store = new ArticleStore();

        // selected.json から記事を読み込み
        const allArticles = store.load('selected.json');
        if (allArticles.length === 0) {
          console.log('選別済み記事が見つかりません。先に select コマンドを実行してください。');
          return;
        }

        // article-id 指定時はその記事のみ処理
        const targetArticles = articleId
          ? allArticles.filter(a => a.id === articleId)
          : allArticles;

        if (targetArticles.length === 0) {
          console.log(`記事 ID "${articleId}" が見つかりません。`);
          return;
        }

        console.log(`${targetArticles.length}件の記事を生成します...`);

        const client = createClient(config.claude.model);
        const tone = config.output.tone;

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

        for (const article of targetArticles) {
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

        console.log('\n完了しました。');
      } catch (error) {
        console.error('generate コマンドでエラーが発生しました:', error);
        process.exit(1);
      }
    });
}
