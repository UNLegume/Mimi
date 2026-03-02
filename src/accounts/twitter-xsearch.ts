/**
 * Grok x_search ベースの Twitter インタラクション解析モジュール
 *
 * 監視中の Twitter アカウントが過去 30 日間にメンション・リプライ・引用 RT で
 * 言及したアカウントを x_search で検索し、候補アカウントを発見する。
 * Twitter API v2 を使用しない代替実装。
 */

import type { AccountCandidate } from './types.js';
import { createXaiClient } from '../ai/grok-client.js';
import { withRetry } from '../utils/retry.js';
import { sleep } from '../utils/sleep.js';
import { toErrorMessage } from '../utils/error.js';

// ── 定数 ────────────────────────────────────────────────────────────────────

const MODEL = 'grok-4.1-fast';

/** ユーザー間リクエストのスリープ時間（ms） */
const INTER_USER_DELAY_MS = 1000;

/** インタラクション検索の対象期間（日） */
const LOOKBACK_DAYS = 30;

/** デフォルトの最小共有インタラクション数 */
const DEFAULT_MIN_SHARED_INTERACTIONS = 2;

// ── JSON スキーマ ────────────────────────────────────────────────────────────

const INTERACTION_SCHEMA = {
  type: 'json_schema' as const,
  name: 'interaction_accounts',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      accounts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            handle: { type: 'string', description: 'Twitter/X のユーザー名（@ なし）' },
            displayName: { type: 'string', description: '表示名' },
            interactionType: { type: 'string', description: 'メンション、リプライ、引用 RT 等' },
          },
          required: ['handle', 'displayName', 'interactionType'],
          additionalProperties: false,
        },
      },
    },
    required: ['accounts'],
    additionalProperties: false,
  },
};

// ── 内部型 ──────────────────────────────────────────────────────────────────

interface InteractionAccount {
  handle: string;
  displayName: string;
  interactionType: string;
}

// ── ヘルパー ─────────────────────────────────────────────────────────────────

/**
 * Responses API のレスポンスから output_text ブロックのテキストを抽出する。
 */
function extractOutputText(response: unknown): string {
  if (response == null || typeof response !== 'object') return '';
  const res = response as Record<string, unknown>;
  const output = res.output;
  if (!Array.isArray(output)) return '';

  for (const item of output as Array<Record<string, unknown>>) {
    if (item.type === 'message') {
      const content = item.content;
      if (!Array.isArray(content)) continue;
      for (const block of content as Array<Record<string, unknown>>) {
        if (block.type === 'output_text' && typeof block.text === 'string') {
          return block.text;
        }
      }
    }
  }
  return '';
}

/**
 * YYYY-MM-DD 形式の日付文字列を返す。
 */
function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// ── 内部関数 ─────────────────────────────────────────────────────────────────

/**
 * x_search を呼び出して指定ユーザーがインタラクションしたアカウントを取得する。
 *
 * @param client   xAI OpenAI クライアント
 * @param username 検索対象の Twitter ユーザー名（@ なし）
 * @param fromDate 検索開始日（YYYY-MM-DD）
 * @param toDate   検索終了日（YYYY-MM-DD）
 * @returns インタラクション先アカウントの配列
 */
async function searchInteractions(
  client: ReturnType<typeof createXaiClient>,
  username: string,
  fromDate: string,
  toDate: string,
): Promise<InteractionAccount[]> {
  const prompt =
    `@${username} が過去30日間にメンション・リプライ・引用RTで言及しているアカウントを列挙してください。AI・機械学習・テクノロジー分野のアカウントを優先してください。`;

  const response = await (client as any).responses.create({
    model: MODEL,
    tools: [
      {
        type: 'x_search' as const,
        x_search: { from_date: fromDate, to_date: toDate },
      },
    ],
    input: prompt,
    text: {
      format: INTERACTION_SCHEMA,
    },
  });

  const text = extractOutputText(response);
  if (!text) {
    console.log(`Twitter xsearch: @${username} — レスポンステキストが空でした`);
    return [];
  }

  let parsed: { accounts?: unknown[] };
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    console.log(`Twitter xsearch: @${username} — JSON パースに失敗しました: ${toErrorMessage(err)}`);
    return [];
  }

  const accounts = parsed.accounts;
  if (!Array.isArray(accounts)) {
    console.log(`Twitter xsearch: @${username} — accounts フィールドが配列ではありません`);
    return [];
  }

  const result: InteractionAccount[] = [];
  for (const item of accounts) {
    if (
      item !== null &&
      typeof item === 'object' &&
      typeof (item as Record<string, unknown>).handle === 'string' &&
      typeof (item as Record<string, unknown>).displayName === 'string' &&
      typeof (item as Record<string, unknown>).interactionType === 'string'
    ) {
      const account = item as Record<string, string>;
      result.push({
        handle: account.handle.replace(/^@/, ''),
        displayName: account.displayName,
        interactionType: account.interactionType,
      });
    }
  }

  return result;
}

// ── エクスポート関数 ─────────────────────────────────────────────────────────

/**
 * Grok の x_search を使い、監視アカウントのインタラクション先から候補アカウントを発見する。
 *
 * @param monitoredUsernames    監視中の Twitter ユーザー名一覧（@ なし）
 * @param minSharedInteractions 候補とみなす最小共有インタラクション数（デフォルト 2）
 * @returns 候補アカウントの配列（sharedFollowCount 降順）
 */
export async function discoverCandidates(
  monitoredUsernames: string[],
  minSharedInteractions: number = DEFAULT_MIN_SHARED_INTERACTIONS,
): Promise<AccountCandidate[]> {
  if (!process.env.XAI_API_KEY) {
    console.log('Twitter xsearch: XAI_API_KEY が未設定のためスキップします');
    return [];
  }

  const client = createXaiClient();

  // 日付範囲を計算
  const now = new Date();
  const lookbackDate = new Date(now.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const fromDate = formatDate(lookbackDate);
  const toDate = formatDate(now);

  console.log(
    `Twitter xsearch: ${monitoredUsernames.length} アカウントのインタラクション検索を開始します` +
    ` (${fromDate} ～ ${toDate})`
  );

  // インタラクションマップ: 発見ハンドル（小文字） -> インタラクションした監視アカウントの Set
  const interactionMap = new Map<string, { displayName: string; interactedBy: Set<string> }>();

  for (let i = 0; i < monitoredUsernames.length; i++) {
    const username = monitoredUsernames[i];
    console.log(`Twitter xsearch: @${username} のインタラクション検索中... (${i + 1}/${monitoredUsernames.length})`);

    let accounts: InteractionAccount[];
    try {
      accounts = await withRetry(() => searchInteractions(client, username, fromDate, toDate));
    } catch (err) {
      console.log(`Twitter xsearch: @${username} の検索に失敗しました: ${toErrorMessage(err)}`);
      accounts = [];
    }

    console.log(`Twitter xsearch: @${username} — ${accounts.length} 件のインタラクション先を検出`);

    for (const account of accounts) {
      const key = account.handle.toLowerCase();
      const existing = interactionMap.get(key);
      if (existing) {
        existing.interactedBy.add(username);
      } else {
        interactionMap.set(key, {
          displayName: account.displayName,
          interactedBy: new Set([username]),
        });
      }
    }

    // 最後のユーザー以外は次のリクエストまで待機（レートリミット対策）
    if (i < monitoredUsernames.length - 1) {
      await sleep(INTER_USER_DELAY_MS);
    }
  }

  // 監視済みアカウントを除外用の小文字セットとして保持
  const monitoredSet = new Set(monitoredUsernames.map((u) => u.toLowerCase()));

  // フィルタリング・変換・ソート
  const candidates: AccountCandidate[] = [];

  for (const [key, { displayName, interactedBy }] of interactionMap) {
    // 既に監視中のアカウントは除外
    if (monitoredSet.has(key)) {
      continue;
    }

    // 共有インタラクション数が閾値未満は除外
    if (interactedBy.size < minSharedInteractions) {
      continue;
    }

    candidates.push({
      handle: key,
      platform: 'twitter',
      displayName,
      sharedFollowCount: interactedBy.size,
      followedBy: Array.from(interactedBy),
    });
  }

  // sharedFollowCount 降順でソート
  candidates.sort((a, b) => b.sharedFollowCount - a.sharedFollowCount);

  console.log(`Twitter xsearch: ${candidates.length} 件の候補アカウントを発見しました`);
  return candidates;
}
