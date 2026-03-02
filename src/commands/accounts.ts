import { Command } from 'commander';
import { loadConfig } from '../config/schema.js';
import { getAccountsFromConfig, addAccountToConfig, removeAccountFromConfig } from '../accounts/config-writer.js';
import { addAccountToDoc, removeAccountFromDoc } from '../accounts/doc-writer.js';
import { discoverCandidates as discoverBluesky } from '../accounts/bluesky-graph.js';
import { discoverCandidates as discoverTwitterXSearch } from '../accounts/twitter-xsearch.js';
import { scoreCandidates, filterByScore, generateTwitterCandidates } from '../accounts/scorer.js';
import { createAiClient } from '../ai/client.js';
import type { Platform, AccountCandidate } from '../accounts/types.js';
import { toErrorMessage } from '../utils/error.js';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

export function registerAccountsCommand(program: Command): void {
  const accounts = program
    .command('accounts')
    .description('監視アカウントの管理')
    .addHelpText('after', `
Examples:
  $ mimi accounts list                   監視アカウント一覧
  $ mimi accounts discover               候補アカウントを発見
  $ mimi accounts add handle -s bluesky  アカウントを追加
  $ mimi accounts remove handle          アカウントを削除
`);

  // --- list ---
  accounts
    .command('list')
    .description('監視中のアカウント一覧を表示')
    .option('-c, --config <path>', '設定ファイルパス', 'config.yaml')
    .addHelpText('after', `
Examples:
  $ mimi accounts list                   全アカウント一覧
  $ mimi accounts list -c custom.yaml    カスタム設定ファイル
`)
    .action(async (options: { config: string }) => {
      try {
        const groups = getAccountsFromConfig(options.config);

        let total = 0;
        for (const group of groups) {
          const label = group.platform === 'bluesky' ? 'Bluesky' : 'Twitter/X';
          console.log(`\n[${label}] ${group.accounts.length} アカウント`);
          group.accounts.forEach((account, index) => {
            console.log(`  ${index + 1}. ${account}`);
          });
          total += group.accounts.length;
        }

        console.log(`\n合計: ${total} アカウント`);
      } catch (error) {
        console.error('accounts list でエラーが発生しました:', toErrorMessage(error));
        process.exit(1);
      }
    });

  // --- discover ---
  accounts
    .command('discover')
    .description('フォローグラフから新規アカウント候補を発見')
    .option('-c, --config <path>', '設定ファイルパス', 'config.yaml')
    .option('-s, --source <platform>', 'ソース (bluesky / twitter / all)', 'all')
    .option('-l, --limit <number>', '表示件数上限', '10')
    .option('--min-score <number>', '最低スコア', '6')
    .option('--skip-scoring', 'スコアリングをスキップ')
    .addHelpText('after', `
Examples:
  $ mimi accounts discover                       全ソースから候補発見
  $ mimi accounts discover -s bluesky             Blueskyのみ
  $ mimi accounts discover -l 5 --min-score 7     上位5件、スコア7以上
  $ mimi accounts discover --skip-scoring          スコアリングなし
`)
    .action(async (options: {
      config: string;
      source: string;
      limit: string;
      minScore: string;
      skipScoring?: boolean;
    }) => {
      try {
        const config = loadConfig(options.config);
        const groups = getAccountsFromConfig(config);
        const limit = parseInt(options.limit, 10);
        const minScore = parseInt(options.minScore, 10);

        const allCandidates: AccountCandidate[] = [];

        if (options.source === 'bluesky' || options.source === 'all') {
          const bskyAccounts = groups.find(g => g.platform === 'bluesky')?.accounts ?? [];
          const candidates = await discoverBluesky(bskyAccounts);
          console.log(`Bluesky: ${candidates.length} 件の候補を発見`);
          allCandidates.push(...candidates);
        }

        const client = createAiClient('grok', config.grok.model);

        if (options.source === 'twitter' || options.source === 'all') {
          const twitterAccounts = groups.find(g => g.platform === 'twitter')?.accounts ?? [];
          // x_search ベースの探索（インタラクション分析）
          const xsearchCandidates = twitterAccounts.length > 0
            ? await discoverTwitterXSearch(twitterAccounts)
            : [];

          // Grok 知識ベースの候補生成
          const knowledgeCandidates = await generateTwitterCandidates(client, twitterAccounts);

          // マージ（x_search 側を優先、ハンドル重複排除）
          const seenHandles = new Set(xsearchCandidates.map(c => c.handle.toLowerCase()));
          const mergedTwitterCandidates = [
            ...xsearchCandidates,
            ...knowledgeCandidates.filter(c => !seenHandles.has(c.handle.toLowerCase())),
          ];

          console.log(`Twitter: ${mergedTwitterCandidates.length} 件の候補を発見`);
          allCandidates.push(...mergedTwitterCandidates);
        }

        let finalCandidates = allCandidates;

        if (!options.skipScoring && allCandidates.length > 0) {
          const scored = await scoreCandidates(allCandidates, client);
          finalCandidates = filterByScore(scored, minScore);
        }

        finalCandidates = finalCandidates.slice(0, limit);

        if (finalCandidates.length === 0) {
          console.log('候補アカウントが見つかりませんでした。');
          return;
        }

        console.log('\n--- 候補アカウント ---\n');
        finalCandidates.forEach((candidate, index) => {
          const fromList = candidate.followedBy.slice(0, 3).join(', ');
          const fromSuffix = fromList ? ` (from: ${fromList})` : '';
          console.log(`${index + 1}. @${candidate.handle} (${candidate.displayName ?? ''})`);
          console.log(`   プラットフォーム: ${candidate.platform}`);
          if (candidate.sharedFollowCount > 0) {
            console.log(`   共通フォロー: ${candidate.sharedFollowCount}人${fromSuffix}`);
          }
          if (candidate.relevanceScore !== undefined) {
            console.log(`   スコア: ${candidate.relevanceScore}/10 - ${candidate.scoreReason ?? ''}`);
          }
          if (candidate.description) {
            console.log(`   説明: ${candidate.description}`);
          }
          console.log('');
        });

        const rl = readline.createInterface({ input, output });
        try {
          const answer = await rl.question(
            '追加するアカウントの番号を入力してください（カンマ区切りで複数可、Enter でスキップ）: '
          );

          const trimmed = answer.trim();
          if (!trimmed) {
            console.log('スキップしました。');
            return;
          }

          const indices = trimmed
            .split(',')
            .map(s => parseInt(s.trim(), 10))
            .filter(n => !isNaN(n) && n >= 1 && n <= finalCandidates.length);

          for (const idx of indices) {
            const candidate = finalCandidates[idx - 1];
            const configResult = addAccountToConfig(options.config, candidate.handle, candidate.platform);
            const docResult = addAccountToDoc(candidate.handle, candidate.platform, {
              name: candidate.displayName,
              role: candidate.scoreReason,
              category: '研究者・開発者',
            });
            console.log(configResult.message);
            console.log(docResult.message);
          }
        } finally {
          rl.close();
        }
      } catch (error) {
        console.error('accounts discover でエラーが発生しました:', toErrorMessage(error));
        process.exit(1);
      }
    });

  // --- add ---
  accounts
    .command('add')
    .description('アカウントを監視リストに追加')
    .argument('<handle>', 'アカウントハンドル')
    .requiredOption('-s, --source <platform>', 'ソース (bluesky または twitter)')
    .option('-c, --config <path>', '設定ファイルパス', 'config.yaml')
    .option('-n, --name <name>', '表示名')
    .option('-r, --role <role>', '役職・説明')
    .option('--category <category>', 'カテゴリ', '研究者・開発者')
    .addHelpText('after', `
Examples:
  $ mimi accounts add "user.bsky.social" -s bluesky
  $ mimi accounts add "user.bsky.social" -s bluesky -n "User Name" -r "AI Researcher"
  $ mimi accounts add "username" -s twitter --category "公式アカウント"
`)
    .action(async (
      handle: string,
      options: {
        source: string;
        config: string;
        name?: string;
        role?: string;
        category: string;
      }
    ) => {
      try {
        const platform = options.source as Platform;
        const configResult = addAccountToConfig(options.config, handle, platform);
        const docResult = addAccountToDoc(handle, platform, {
          name: options.name,
          role: options.role,
          category: options.category,
        });
        console.log(configResult.message);
        console.log(docResult.message);
      } catch (error) {
        console.error('accounts add でエラーが発生しました:', toErrorMessage(error));
        process.exit(1);
      }
    });

  // --- remove ---
  accounts
    .command('remove')
    .description('アカウントを監視リストから削除')
    .argument('<handle>', 'アカウントハンドル')
    .option('-c, --config <path>', '設定ファイルパス', 'config.yaml')
    .addHelpText('after', `
Examples:
  $ mimi accounts remove "user.bsky.social"
  $ mimi accounts remove "username"
`)
    .action(async (
      handle: string,
      options: { config: string }
    ) => {
      try {
        const result = removeAccountFromConfig(options.config, handle);
        const docResult = removeAccountFromDoc(handle, result.platform);
        console.log(result.message);
        console.log(docResult.message);
      } catch (error) {
        console.error('accounts remove でエラーが発生しました:', toErrorMessage(error));
        process.exit(1);
      }
    });
}
