import { Command } from 'commander';
import { loadConfig } from '../config/schema.js';
import { ArticleStore } from '../store/articles.js';
import { createClient } from '../ai/client.js';
import { verifyArticles } from '../ai/verifier.js';
import { selectArticles } from '../ai/selector.js';

export function registerSelectCommand(program: Command): void {
  program
    .command('select')
    .description('記事を検証・選別して保存')
    .option('-c, --config <path>', '設定ファイルパス', 'config.yaml')
    .addHelpText('after', `
Examples:
  $ mimi select                 収集済み記事を検証・選別
  $ mimi select -c custom.yaml  カスタム設定ファイルを使用
`)
    .action(async (options: { config: string }) => {
      try {
        const config = loadConfig(options.config);

        if (!process.env.ANTHROPIC_API_KEY) {
          console.error('エラー: ANTHROPIC_API_KEY が設定されていません。');
          console.error('.env ファイルまたは環境変数に ANTHROPIC_API_KEY を設定してください。');
          process.exit(1);
        }

        const store = new ArticleStore();

        // fetched.json から記事を読み込み
        const articles = store.load('fetched.json');
        if (articles.length === 0) {
          console.log('記事が見つかりません。先に fetch コマンドを実行してください。');
          return;
        }
        console.log(`${articles.length}件の記事を読み込みました。`);

        const client = createClient(config.claude.model);

        // ステップ1: 検証
        console.log('\n記事を検証中...');
        const { verified, rejected } = await verifyArticles(articles, client, config.claude.model);

        console.log(`\n--- 検証結果 ---`);
        console.log(`  verified: ${verified.length}件`);
        console.log(`  rejected: ${rejected.length}件`);
        for (const { article, reason } of rejected) {
          console.log(`    [REJECTED] ${article.title}`);
          console.log(`              理由: ${reason}`);
        }

        store.save('verified.json', verified);
        console.log(`\nverified.json に ${verified.length}件を保存しました。`);

        if (verified.length === 0) {
          console.log('検証済み記事がありません。処理を終了します。');
          return;
        }

        // ステップ2: 選別
        console.log('\n記事を選別中...');
        const publishedTopics = store.loadPublishedTopics();
        const selected = await selectArticles(
          verified,
          client,
          config.claude.model,
          config.selection.maxArticles,
          config.selection.criteria,
          publishedTopics
        );

        console.log(`\n--- 選別結果 ---`);
        selected.forEach((article, index) => {
          console.log(`  ${index + 1}. ${article.title}`);
        });

        store.save('selected.json', selected);
        console.log(`\nselected.json に ${selected.length}件を保存しました。`);
      } catch (error) {
        console.error('select コマンドでエラーが発生しました:', error);
        process.exit(1);
      }
    });
}
