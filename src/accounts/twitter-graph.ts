/**
 * Twitter ソーシャルグラフ分析モジュール
 * 監視中の Twitter アカウントの共通フォローを発見する
 */

import type { AccountCandidate } from './types.js';

// ローカルインターフェース

interface TwitterProfile {
  id: string;
  username: string;
  name?: string;
  description?: string;
}

interface TwitterUserResponse {
  data: { id: string; name: string; username: string };
}

interface TwitterFollowingResponse {
  data?: TwitterProfile[];
  meta?: { next_token?: string; result_count: number };
}

// Twitter API ベース URL
const TWITTER_API_BASE = 'https://api.twitter.com/2';

// リクエスト間の遅延（ミリ秒）
const REQUEST_DELAY_MS = 1000;

/**
 * TWITTER_BEARER_TOKEN が設定されているか確認する
 */
export function isTwitterAvailable(): boolean {
  return typeof process.env.TWITTER_BEARER_TOKEN === 'string' &&
    process.env.TWITTER_BEARER_TOKEN.trim().length > 0;
}

/**
 * 指定時間だけ待機するユーティリティ
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Bearer Token を使った認証ヘッダーを返す
 */
function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.TWITTER_BEARER_TOKEN}`,
  };
}

/**
 * ユーザー名を Twitter ユーザー ID に解決する
 */
async function resolveUserId(username: string): Promise<string> {
  const url = `${TWITTER_API_BASE}/users/by/username/${encodeURIComponent(username)}`;
  const response = await fetch(url, { headers: authHeaders() });

  if (response.status === 401) {
    throw new Error(`Twitter: 認証エラー（Bearer Token が無効）`);
  }
  if (response.status === 429) {
    throw new Error(`Twitter: レートリミットに達しました`);
  }
  if (response.status === 403) {
    throw new Error(`Twitter: アクセス権限が不足しています（API プランを確認してください）`);
  }
  if (!response.ok) {
    throw new Error(`Twitter: ユーザー解決に失敗 (HTTP ${response.status})`);
  }

  const body = await response.json() as TwitterUserResponse;
  return body.data.id;
}

/**
 * 指定ユーザーのフォローリストを取得する
 *
 * @param username - Twitter ユーザー名（@ なし）
 * @param limit - 取得する最大件数（デフォルト 500）
 * @returns フォロー中ユーザーの配列
 */
export async function getFollows(
  username: string,
  limit: number = 500,
): Promise<TwitterProfile[]> {
  let userId: string;
  try {
    userId = await resolveUserId(username);
  } catch (err) {
    console.warn(`Twitter: @${username} のユーザー ID 解決に失敗しました:`, err instanceof Error ? err.message : err);
    return [];
  }

  await sleep(REQUEST_DELAY_MS);

  const results: TwitterProfile[] = [];
  let paginationToken: string | undefined = undefined;

  while (results.length < limit) {
    const remaining = limit - results.length;
    const maxResults = Math.min(100, remaining);

    const params = new URLSearchParams({
      max_results: String(maxResults),
      'user.fields': 'name,username,description',
    });
    if (paginationToken !== undefined) {
      params.set('pagination_token', paginationToken);
    }

    const url = `${TWITTER_API_BASE}/users/${userId}/following?${params.toString()}`;

    let response: Response;
    try {
      response = await fetch(url, { headers: authHeaders() });
    } catch (err) {
      console.warn(`Twitter: @${username} のフォロー取得中にネットワークエラー:`, err instanceof Error ? err.message : err);
      break;
    }

    if (response.status === 401) {
      console.warn(`Twitter: 認証エラー（Bearer Token が無効）`);
      break;
    }
    if (response.status === 429) {
      console.warn(`Twitter: レートリミットに達しました。@${username} のフォロー取得を中断します`);
      break;
    }
    if (response.status === 403) {
      console.warn(`Twitter: アクセス権限が不足しています（API プランを確認してください）。@${username} のフォロー取得を中断します`);
      break;
    }
    if (!response.ok) {
      console.warn(`Twitter: @${username} のフォロー取得に失敗 (HTTP ${response.status})`);
      break;
    }

    const body = await response.json() as TwitterFollowingResponse;

    if (body.data && body.data.length > 0) {
      results.push(...body.data);
    }

    const nextToken = body.meta?.next_token;
    if (!nextToken) {
      // ページネーション終端
      break;
    }
    paginationToken = nextToken;

    // 次のリクエスト前に待機
    await sleep(REQUEST_DELAY_MS);
  }

  return results;
}

/**
 * 監視アカウントの共通フォローから候補アカウントを発見する
 *
 * @param monitoredUsernames - 監視中の Twitter ユーザー名リスト（@ なし）
 * @param minSharedFollows - 最低共通フォロー数（デフォルト 2）
 * @returns 候補アカウントの配列（sharedFollowCount 降順）
 */
export async function discoverCandidates(
  monitoredUsernames: string[],
  minSharedFollows: number = 2,
): Promise<AccountCandidate[]> {
  if (!isTwitterAvailable()) {
    console.warn('Twitter: TWITTER_BEARER_TOKEN が設定されていないため、候補発見をスキップします');
    return [];
  }

  // 全監視アカウントのフォローリストを並列取得
  console.log(`Twitter: ${monitoredUsernames.length} アカウントのフォローリストを取得します`);

  const settledResults = await Promise.allSettled(
    monitoredUsernames.map(async (username) => {
      console.log(`Twitter: @${username} のフォロー取得中...`);
      const follows = await getFollows(username);
      return { username, follows };
    }),
  );

  // フォローマップを構築: followedUsername -> フォローしている監視アカウントの Set
  const followMap = new Map<string, { profile: TwitterProfile; followers: Set<string> }>();

  for (const result of settledResults) {
    if (result.status === 'rejected') {
      console.warn('Twitter: フォロー取得に失敗したアカウントがあります:', result.reason);
      continue;
    }

    const { username, follows } = result.value;
    for (const profile of follows) {
      const key = profile.username.toLowerCase();
      if (!followMap.has(key)) {
        followMap.set(key, { profile, followers: new Set() });
      }
      followMap.get(key)!.followers.add(username);
    }
  }

  // 監視アカウントを小文字セットとして保持（除外用）
  const monitoredSet = new Set(monitoredUsernames.map((u) => u.toLowerCase()));

  // フィルタリング・ソート・変換
  const candidates: AccountCandidate[] = [];

  for (const [key, { profile, followers }] of followMap) {
    // 既に監視中のアカウントは除外
    if (monitoredSet.has(key)) {
      continue;
    }
    // 共通フォロー数が閾値未満は除外
    if (followers.size < minSharedFollows) {
      continue;
    }

    candidates.push({
      handle: profile.username,
      platform: 'twitter',
      displayName: profile.name,
      description: profile.description,
      sharedFollowCount: followers.size,
      followedBy: Array.from(followers),
    });
  }

  // sharedFollowCount 降順でソート
  candidates.sort((a, b) => b.sharedFollowCount - a.sharedFollowCount);

  console.log(`Twitter: ${candidates.length} 件の候補アカウントを発見しました`);
  return candidates;
}
