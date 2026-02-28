/**
 * ドキュメントファイル（docs/*.md）のアカウント情報を更新するモジュール
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { Platform, AccountOperationResult } from './types.js';

/**
 * プラットフォームに対応するドキュメントファイルのパスを返す
 */
export function getDocPath(platform: Platform): string {
  const filename = platform === 'bluesky' ? 'bluesky-accounts.md' : 'twitter-accounts.md';
  return path.resolve(process.cwd(), 'docs', filename);
}

/**
 * 今日の日付を YYYY-MM-DD 形式で返す
 */
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

/**
 * ドキュメントの `> 最終更新:` 行を今日の日付に更新する
 */
function updateLastModified(content: string): string {
  return content.replace(
    /^> 最終更新: \d{4}-\d{2}-\d{2}/m,
    `> 最終更新: ${getToday()}`
  );
}

/**
 * config.yaml コードブロック内の accounts セクションの末尾（最後の `  - "..."` 行の後）にハンドルを追加する。
 * コードブロックの閉じ ``` の直前に挿入する。
 */
function addHandleToConfigBlock(content: string, handle: string): string {
  // config.yaml コードブロックを探す（```yaml から ``` まで）
  const codeBlockRegex = /(```yaml[\s\S]*?)(```)/;
  const match = content.match(codeBlockRegex);
  if (!match) {
    return content;
  }

  const codeBlock = match[1];
  const closingFence = match[2];

  // 既にハンドルが含まれている場合はスキップ
  if (codeBlock.includes(`"${handle}"`)) {
    return content;
  }

  // 最後の `  - "..."` 行を探して、その後に新しいエントリを挿入する
  const updatedCodeBlock = codeBlock.replace(
    // コードブロック内の最後のアカウントエントリの後に挿入
    /((?:[ \t]+- "[^"]+"\n)+)(\s*(?:limit|includeTextOnly|credibility):)/,
    (_fullMatch: string, accountsSection: string, afterSection: string) => {
      return `${accountsSection}    - "${handle}"\n${afterSection}`;
    }
  );

  // マッチしなかった場合（フォールバック: 閉じ ``` の直前に挿入）
  if (updatedCodeBlock === codeBlock) {
    // コードブロック内の最後の - "..." 行を見つけて追加
    const fallbackBlock = codeBlock.replace(
      /([ \t]+- "[^"]+"\n)([ \t]*\n*```)/,
      (_m: string, lastLine: string, rest: string) => `${lastLine}    - "${handle}"\n${rest}`
    );
    if (fallbackBlock !== codeBlock) {
      return content.replace(codeBlockRegex, `${fallbackBlock}${closingFence}`);
    }
    // それでもマッチしない場合は閉じ ``` の直前に追加
    return content.replace(codeBlockRegex, `${codeBlock}    - "${handle}"\n${closingFence}`);
  }

  return content.replace(codeBlockRegex, `${updatedCodeBlock}${closingFence}`);
}

/**
 * config.yaml コードブロックからハンドルを削除する
 */
function removeHandleFromConfigBlock(content: string, handle: string): string {
  // `  - "handle"` の行を削除（前後の空白・タブを含む）
  const lineRegex = new RegExp(`[ \\t]*- "${escapeRegex(handle)}"\\n`, 'g');
  return content.replace(lineRegex, '');
}

/**
 * 正規表現用にエスケープする
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * ハンドルを含むテーブル行を削除する
 */
function removeTableRow(content: string, handle: string): string {
  // バッククォートで囲まれたハンドルを含む行を削除
  const rowRegex = new RegExp(`^\\|[^|]*\\|[^|]*\`${escapeRegex(handle)}\`[^|]*\\|.*$\\n?`, 'gm');
  return content.replace(rowRegex, '');
}

/**
 * 指定カテゴリのセクション（`### カテゴリ名` 以下）のテーブルにハンドルを追加する。
 * セクションが見つからない場合は最後のテーブルに追加する。
 */
function addRowToSection(
  content: string,
  platform: Platform,
  handle: string,
  name: string,
  role: string,
  category: string
): string {
  const row =
    platform === 'bluesky'
      ? `| ${name} | \`${handle}\` | ${role} |`
      : `| ${name} | \`${handle}\` | ${role} |`;

  // テーブルの最後の行の後に追加する汎用関数
  const insertAfterLastTableRow = (text: string, sectionStart: number, sectionEnd: number): string => {
    const section = text.slice(sectionStart, sectionEnd);

    // セクション内の最後のテーブル行（`| ... |` で始まる行）を探す
    const tableRowRegex = /(\|[^\n]*\|\n)(?![\|])/g;
    let lastMatch: RegExpExecArray | null = null;
    let match: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((match = tableRowRegex.exec(section)) !== null) {
      lastMatch = match;
    }

    if (!lastMatch) {
      return text;
    }

    const insertPos = sectionStart + lastMatch.index + lastMatch[0].length;
    return text.slice(0, insertPos) + row + '\n' + text.slice(insertPos);
  };

  // カテゴリセクションを検索する
  const sectionHeaderLineRegex = new RegExp(`^### ${escapeRegex(category)}$`, 'm');
  const headerMatch = content.match(sectionHeaderLineRegex);

  if (headerMatch && headerMatch.index !== undefined) {
    // セクション開始位置
    const sectionStart = headerMatch.index;
    // 次のセクションヘッダー（### または ##）を探す
    const nextSectionRegex = /^#{2,3} /m;
    const afterSection = content.slice(sectionStart + headerMatch[0].length + 1);
    const nextMatch = afterSection.match(nextSectionRegex);
    const sectionEnd = nextMatch && nextMatch.index !== undefined
      ? sectionStart + headerMatch[0].length + 1 + nextMatch.index
      : content.length;

    return insertAfterLastTableRow(content, sectionStart, sectionEnd);
  }

  // カテゴリが見つからない場合: 最後のテーブルのある最後のセクションに追加
  // ファイル末尾から最後のテーブル行を探す
  const allTableRows = [...content.matchAll(/^(\|[^\n]*\|\n)/gm)];
  if (allTableRows.length === 0) {
    return content;
  }

  const lastTableRow = allTableRows[allTableRows.length - 1];
  if (lastTableRow.index === undefined) {
    return content;
  }

  const insertPos = lastTableRow.index + lastTableRow[0].length;
  return content.slice(0, insertPos) + row + '\n' + content.slice(insertPos);
}

/**
 * ドキュメントにアカウントを追加する
 */
export function addAccountToDoc(
  handle: string,
  platform: Platform,
  options?: { name?: string; role?: string; category?: string }
): AccountOperationResult {
  const docPath = getDocPath(platform);

  let content: string;
  try {
    content = fs.readFileSync(docPath, 'utf-8');
  } catch (err) {
    return {
      success: false,
      message: `ドキュメントファイルの読み込みに失敗しました: ${docPath} (${String(err)})`,
      handle,
      platform,
    };
  }

  const name = options?.name ?? handle;
  const role = options?.role ?? '';
  const category = options?.category ?? '研究者・開発者';

  // 既にテーブルにハンドルが含まれているか確認
  const handleEscaped = escapeRegex(handle);
  const existsInTable = new RegExp(`\`${handleEscaped}\``).test(content);
  const existsInConfig = content.includes(`"${handle}"`);

  if (existsInTable && existsInConfig) {
    return {
      success: false,
      message: `アカウント "${handle}" は既にドキュメントに存在します`,
      handle,
      platform,
    };
  }

  let updated = content;

  // config.yaml ブロックにハンドルを追加
  if (!existsInConfig) {
    updated = addHandleToConfigBlock(updated, handle);
  }

  // テーブルに行を追加
  if (!existsInTable) {
    updated = addRowToSection(updated, platform, handle, name, role, category);
  }

  // 最終更新日を更新
  updated = updateLastModified(updated);

  try {
    fs.writeFileSync(docPath, updated, 'utf-8');
  } catch (err) {
    return {
      success: false,
      message: `ドキュメントファイルの書き込みに失敗しました: ${docPath} (${String(err)})`,
      handle,
      platform,
    };
  }

  return {
    success: true,
    message: `アカウント "${handle}" をドキュメントに追加しました (${docPath})`,
    handle,
    platform,
  };
}

/**
 * ドキュメントからアカウントを削除する
 */
export function removeAccountFromDoc(
  handle: string,
  platform: Platform
): AccountOperationResult {
  const docPath = getDocPath(platform);

  let content: string;
  try {
    content = fs.readFileSync(docPath, 'utf-8');
  } catch (err) {
    return {
      success: false,
      message: `ドキュメントファイルの読み込みに失敗しました: ${docPath} (${String(err)})`,
      handle,
      platform,
    };
  }

  const handleEscaped = escapeRegex(handle);
  const existsInTable = new RegExp(`\`${handleEscaped}\``).test(content);
  const existsInConfig = content.includes(`"${handle}"`);

  if (!existsInTable && !existsInConfig) {
    return {
      success: false,
      message: `アカウント "${handle}" はドキュメントに存在しません`,
      handle,
      platform,
    };
  }

  let updated = content;

  // config.yaml ブロックからハンドルを削除
  if (existsInConfig) {
    updated = removeHandleFromConfigBlock(updated, handle);
  }

  // テーブルから行を削除
  if (existsInTable) {
    updated = removeTableRow(updated, handle);
  }

  // 最終更新日を更新
  updated = updateLastModified(updated);

  try {
    fs.writeFileSync(docPath, updated, 'utf-8');
  } catch (err) {
    return {
      success: false,
      message: `ドキュメントファイルの書き込みに失敗しました: ${docPath} (${String(err)})`,
      handle,
      platform,
    };
  }

  return {
    success: true,
    message: `アカウント "${handle}" をドキュメントから削除しました (${docPath})`,
    handle,
    platform,
  };
}
