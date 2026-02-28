import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { Command } from 'commander';
import { loadConfig } from './config/schema.js';
import { registerFetchCommand } from './commands/fetch.js';
import { registerSelectCommand } from './commands/select.js';
import { registerGenerateCommand } from './commands/generate.js';
import { registerRunCommand } from './commands/run.js';
import { registerAccountsCommand } from './commands/accounts.js';

const program = new Command();

program
  .name('mimi')
  .description('海外AI情報監視・翻訳CLIツール')
  .version('0.1.0');

// sourcesコマンド: 登録ソース一覧表示
program
  .command('sources')
  .description('登録されているソース一覧を表示')
  .option('-c, --config <path>', '設定ファイルパス', 'config.yaml')
  .action((options: { config: string }) => {
    try {
      const config = loadConfig(options.config);
      console.log('登録ソース一覧:');
      config.sources.forEach((source, index) => {
        if (source.type === 'rss') {
          console.log(`  ${index + 1}. [RSS] ${source.name} - ${source.url}`);
        } else if (source.type === 'hackernews') {
          console.log(`  ${index + 1}. [HackerNews] キーワード: ${source.keywords.join(', ')} (最低スコア: ${source.minScore})`);
        } else if (source.type === 'reddit') {
          console.log(`  ${index + 1}. [Reddit] r/${source.subreddit} (最低アップボート: ${source.minUpvotes})`);
        } else if (source.type === 'arxiv') {
          console.log(`  ${index + 1}. [arXiv] カテゴリ: ${source.categories.join(', ')} (最大件数: ${source.maxResults})`);
        } else if (source.type === 'bluesky') {
          console.log(`  ${index + 1}. [Bluesky] アカウント: ${source.accounts.join(', ')} (最大件数: ${source.limit})`);
        } else if (source.type === 'twitter') {
          console.log(`  ${index + 1}. [Twitter/X] アカウント: ${source.accounts.join(', ')} (最大件数: ${source.limit})`);
        }
      });
    } catch (error) {
      console.error('設定ファイルの読み込みに失敗しました:', error);
      process.exit(1);
    }
  });

registerFetchCommand(program);
registerSelectCommand(program);
registerGenerateCommand(program);
registerRunCommand(program);
registerAccountsCommand(program);

program.parse();
