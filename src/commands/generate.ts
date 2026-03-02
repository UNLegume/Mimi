import { Command } from 'commander';
import { loadConfig } from '../config/schema.js';
import { ArticleStore } from '../store/articles.js';
import type { PublishedTopic } from '../store/articles.js';
import { createAiClient } from '../ai/client.js';
import { generateArticle } from '../ai/generator.js';
import { initNotionContext, publishArticleToNotion } from '../notion/publisher.js';
import { toErrorMessage } from '../utils/error.js';

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

        const client = createAiClient('anthropic', config.claude.model);
        const tone = config.output.tone;

        // Notion クライアント初期化（設定がある場合のみ）
        const notionCtx = config.notion ? await initNotionContext(config.notion) : null;

        const publishedTopics: PublishedTopic[] = [];

        for (const article of targetArticles) {
          console.log(`\n生成中: ${article.title}`);
          try {
            const content = await generateArticle(article, client, tone);
            // Notion に出力（設定がある場合）
            if (notionCtx) {
              const result = await publishArticleToNotion(
                notionCtx.client,
                notionCtx.datePage.id,
                article.title,
                content,
                notionCtx.firstBlockId,
              );
              if (result.success) {
                console.log(`  → Notion に公開: ${result.notionPageUrl}`);
              } else {
                console.warn(`  ⚠ Notion 公開失敗: ${result.error}`);
                console.log(content);
              }
            } else {
              console.log(content);
            }
            publishedTopics.push({
              id: article.id,
              title: article.title,
              topic: article.title,
              publishedAt: new Date().toISOString(),
              url: article.url,
            });
          } catch (error) {
            console.error(`  エラー: ${article.title} の生成に失敗しました:`, toErrorMessage(error));
          }
        }

        // 全記事処理後にまとめて保存
        if (publishedTopics.length > 0) {
          store.savePublishedTopics(publishedTopics);
        }

        console.log('\n完了しました。');
      } catch (error) {
        console.error('generate コマンドでエラーが発生しました:', toErrorMessage(error));
        process.exit(1);
      }
    });
}
