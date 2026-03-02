/**
 * config.yaml のテキスト行操作によるアカウント追加・削除モジュール
 * YAML ライブラリによる書き戻しは行わず、行単位の文字列操作でコメントを保持する
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { loadConfig } from '../config/schema.js';
import type { Config } from '../config/schema.js';
import type { Platform, AccountOperationResult } from './types.js';
import { toErrorMessage } from '../utils/error.js';

// ----------------------------------------------------------------
// 内部ユーティリティ
// ----------------------------------------------------------------

/**
 * 行がコメントアウトされているかを判定する
 * 先頭の空白を除いた最初の文字が '#' であれば true
 */
function isCommentedLine(line: string): boolean {
  return /^\s*#/.test(line);
}

/**
 * 行からコメント記号（先頭の `# ` または `#`）を除去して返す
 */
function uncommentLine(line: string): string {
  // 先頭の空白 + `# ` または `#` を取り除く
  return line.replace(/^(\s*)#\s?/, '$1');
}

/**
 * 行に含まれるアカウントハンドルを抽出する
 * `      - "handle"` または `      - handle` 形式に対応
 */
function extractHandleFromLine(line: string): string | null {
  const match = line.match(/^\s*-\s+"?([^"#\s]+)"?\s*$/);
  return match ? match[1] : null;
}

/**
 * 指定プラットフォームのブロック開始行インデックスを返す
 * コメントアウトされたブロックも検索対象に含める
 *
 * @returns ブロック開始行インデックス。見つからない場合は -1
 */
function findPlatformBlockStart(lines: string[], platform: Platform): number {
  const typePattern = new RegExp(`type:\\s*${platform}\\s*$`);
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].replace(/^\s*#\s?/, '');
    if (typePattern.test(stripped.trim())) {
      return i;
    }
  }
  return -1;
}

/**
 * ブロック開始行インデックスから `accounts:` の行インデックスを返す
 * コメントアウトされた行も検索する
 */
function findAccountsLine(lines: string[], blockStart: number): number {
  for (let i = blockStart + 1; i < lines.length; i++) {
    const stripped = lines[i].replace(/^\s*#\s?/, '');
    if (/^\s*accounts:\s*$/.test(stripped)) {
      return i;
    }
    // 別ブロック（`- type:` で始まる行）に到達したら終了
    const raw = lines[i].replace(/^\s*#\s?/, '');
    if (/^\s*-\s+type:\s+\w+/.test(raw) && i !== blockStart) {
      break;
    }
  }
  return -1;
}

/**
 * `accounts:` 行以降の実際のアカウントエントリ行のインデックス範囲を返す
 * コメント行（`# ---` のようなセパレータ）はスキップし、アカウントエントリのみを対象とする
 *
 * @returns アカウントエントリ行インデックスの配列
 */
function findAccountEntryLines(
  lines: string[],
  accountsLineIndex: number,
  isCommentedBlock: boolean,
): number[] {
  const entryIndices: number[] = [];
  for (let i = accountsLineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // コメントブロックの場合はコメント除去してから判断
    const effective = isCommentedBlock ? line.replace(/^\s*#\s?/, '') : line;

    // アカウントエントリ行（`      - "xxx"` 形式）
    if (/^\s*-\s+"?[^"#\s]+/.test(effective)) {
      entryIndices.push(i);
      continue;
    }

    // セパレータコメント行（`      # --- xxx ---` 形式）は通過
    if (/^\s*#/.test(effective)) {
      continue;
    }

    // それ以外（`limit:` 等のプロパティ行や空行）でアカウント配列終端とみなす
    // ただし完全に空の行は無視して続ける
    if (effective.trim() === '') {
      continue;
    }

    break;
  }
  return entryIndices;
}

/**
 * ブロックがコメントアウトされているかを判定する
 * `- type: xxx` 行自体がコメントアウトされていれば true
 */
function isBlockCommentedOut(lines: string[], blockStart: number): boolean {
  return isCommentedLine(lines[blockStart]);
}

/**
 * ブロック全体（blockStart から次のブロック開始 or トップレベルキー手前まで）の
 * 行インデックス範囲を返す
 */
function findBlockRange(lines: string[], blockStart: number): [number, number] {
  let end = lines.length - 1;
  for (let i = blockStart + 1; i < lines.length; i++) {
    // トップレベルキー（インデント0）や別の `- type:` ブロック開始を検出
    if (/^[a-zA-Z]/.test(lines[i])) {
      end = i - 1;
      break;
    }
    // コメントアウトされていない `  - type:` でブロック境界
    const stripped = lines[i].replace(/^\s*#\s?/, '');
    if (/^\s{2}-\s+type:\s+\w+/.test(stripped) && i !== blockStart) {
      end = i - 1;
      break;
    }
  }
  return [blockStart, end];
}

/**
 * コメントアウトされたブロックをアンコメントして新しい行配列を返す
 */
function uncommentBlock(lines: string[], start: number, end: number): string[] {
  const result = [...lines];
  for (let i = start; i <= end; i++) {
    if (isCommentedLine(result[i])) {
      result[i] = uncommentLine(result[i]);
    }
  }
  return result;
}

// ----------------------------------------------------------------
// 公開 API
// ----------------------------------------------------------------

/**
 * config.yaml の指定プラットフォームのアカウントブロックにハンドルを追加する
 *
 * - Twitter ブロックがコメントアウトされている場合は自動的にアンコメントする
 * - 重複するハンドルが既に存在する場合は失敗を返す
 */
export function addAccountToConfig(
  configPath: string,
  handle: string,
  platform: Platform,
): AccountOperationResult {
  let lines = readFileSync(configPath, 'utf-8').split('\n');

  const blockStart = findPlatformBlockStart(lines, platform);
  if (blockStart === -1) {
    return {
      success: false,
      message: `${platform} のソースブロックが config.yaml に見つかりませんでした`,
      handle,
      platform,
    };
  }

  const commented = isBlockCommentedOut(lines, blockStart);

  // コメントアウトされたブロックをアンコメント
  if (commented) {
    console.log(`[config-writer] ${platform} ブロックがコメントアウトされているため、アンコメントします`);
    const [start, end] = findBlockRange(lines, blockStart);
    lines = uncommentBlock(lines, start, end);
  }

  // アンコメント後に再度 accounts: 行を探す
  const accountsLine = findAccountsLine(lines, blockStart);
  if (accountsLine === -1) {
    return {
      success: false,
      message: `${platform} ブロック内に accounts: が見つかりませんでした`,
      handle,
      platform,
    };
  }

  const entryIndices = findAccountEntryLines(lines, accountsLine, false);

  // 重複チェック
  for (const idx of entryIndices) {
    const existing = extractHandleFromLine(lines[idx]);
    if (existing === handle) {
      return {
        success: false,
        message: `${handle} は既に ${platform} の監視リストに存在します`,
        handle,
        platform,
      };
    }
  }

  // 挿入位置：最後のエントリ行の次
  const insertAfter =
    entryIndices.length > 0 ? entryIndices[entryIndices.length - 1] : accountsLine;

  const newLine = `      - "${handle}"`;
  lines.splice(insertAfter + 1, 0, newLine);

  writeFileSync(configPath, lines.join('\n'), 'utf-8');

  console.log(`[config-writer] ${platform} に ${handle} を追加しました`);
  return {
    success: true,
    message: `${handle} を ${platform} の監視リストに追加しました`,
    handle,
    platform,
  };
}

/**
 * config.yaml から指定ハンドルを削除する
 *
 * すべてのソースブロックを検索し、一致する行を削除する
 */
export function removeAccountFromConfig(
  configPath: string,
  handle: string,
): AccountOperationResult {
  const lines = readFileSync(configPath, 'utf-8').split('\n');

  let foundIndex = -1;
  let foundPlatform: Platform | null = null;

  for (let i = 0; i < lines.length; i++) {
    // コメント行も含めてハンドルが含まれるか確認
    const effective = lines[i].replace(/^\s*#\s?/, '');
    const extracted = extractHandleFromLine(effective);
    if (extracted === handle) {
      foundIndex = i;

      // どのプラットフォームブロックに属しているか逆探索
      for (let j = i - 1; j >= 0; j--) {
        const stripped = lines[j].replace(/^\s*#\s?/, '');
        if (/type:\s*bluesky/.test(stripped)) {
          foundPlatform = 'bluesky';
          break;
        }
        if (/type:\s*twitter/.test(stripped)) {
          foundPlatform = 'twitter';
          break;
        }
      }
      break;
    }
  }

  if (foundIndex === -1) {
    return {
      success: false,
      message: `${handle} はどのプラットフォームの監視リストにも見つかりませんでした`,
      handle,
      platform: 'bluesky',
    };
  }

  lines.splice(foundIndex, 1);
  writeFileSync(configPath, lines.join('\n'), 'utf-8');

  const platform: Platform = foundPlatform ?? 'bluesky';
  console.log(`[config-writer] ${platform} から ${handle} を削除しました`);
  return {
    success: true,
    message: `${handle} を ${platform} の監視リストから削除しました`,
    handle,
    platform,
  };
}

/**
 * config.yaml からプラットフォーム別のアカウント一覧を返す
 *
 * YAML パースには loadConfig() を使用する（コメントアウトされたブロックは除外される）
 * configOrPath が文字列の場合は loadConfig() でファイルを読み込む。
 * Config オブジェクトの場合はそのまま使用する。
 */
export function getAccountsFromConfig(
  configOrPath: Config | string,
): { platform: Platform; accounts: string[] }[] {
  const config = typeof configOrPath === 'string' ? loadConfig(configOrPath) : configOrPath;

  const result: { platform: Platform; accounts: string[] }[] = [];

  for (const source of config.sources) {
    if (source.type === 'bluesky') {
      result.push({ platform: 'bluesky', accounts: source.accounts });
    }
    if (source.type === 'xsearch') {
      result.push({ platform: 'twitter', accounts: source.accounts });
    }
  }

  return result;
}
