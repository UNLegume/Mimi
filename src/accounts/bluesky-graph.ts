/**
 * Bluesky ソーシャルグラフ分析モジュール
 *
 * 監視中アカウントのフォロー関係を解析し、共通フォロー先（監視候補アカウント）を発見する。
 */

import type { AccountCandidate } from './types.js';

const BSKY_API_BASE = 'https://public.api.bsky.app/xrpc';

const DEFAULT_FOLLOWS_LIMIT = 500;
const DEFAULT_MIN_SHARED_FOLLOWS = 2;
const PAGE_SIZE = 100;
const REQUEST_DELAY_MS = 200;

interface BlueskyProfile {
  did: string;
  handle: string;
  displayName?: string;
  description?: string;
}

interface GetFollowsResponse {
  follows: BlueskyProfile[];
  cursor?: string;
}

/**
 * 指定ミリ秒間スリープする
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 指定アカウントのフォロー一覧を取得する。
 *
 * @param handle   Bluesky ハンドル（例: "user.bsky.social"）
 * @param limit    取得上限数（デフォルト 500）
 * @returns フォロー中プロフィールの配列
 */
export async function getFollows(
  handle: string,
  limit: number = DEFAULT_FOLLOWS_LIMIT
): Promise<BlueskyProfile[]> {
  const profiles: BlueskyProfile[] = [];
  let cursor: string | undefined;
  let isFirst = true;

  while (profiles.length < limit) {
    // ページネーションリクエスト間にディレイを挿入（最初のリクエストは除く）
    if (!isFirst) {
      await sleep(REQUEST_DELAY_MS);
    }
    isFirst = false;

    const remaining = limit - profiles.length;
    const pageLimit = Math.min(PAGE_SIZE, remaining);

    const url = new URL(`${BSKY_API_BASE}/app.bsky.graph.getFollows`);
    url.searchParams.set('actor', handle);
    url.searchParams.set('limit', String(pageLimit));
    if (cursor !== undefined) {
      url.searchParams.set('cursor', cursor);
    }

    let response: Response;
    try {
      response = await fetch(url.toString());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Bluesky: @${handle} のフォロー取得中にネットワークエラー: ${message}`);
      break;
    }

    if (!response.ok) {
      if (response.status === 429) {
        console.error(`Bluesky: @${handle} のフォロー取得中にレートリミット (HTTP 429)。スキップします。`);
      } else if (response.status === 400 || response.status === 404) {
        console.error(`Bluesky: @${handle} が見つかりません (HTTP ${response.status})。スキップします。`);
      } else {
        console.error(`Bluesky: @${handle} のフォロー取得失敗 (HTTP ${response.status}: ${response.statusText})`);
      }
      break;
    }

    let data: GetFollowsResponse;
    try {
      data = (await response.json()) as GetFollowsResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Bluesky: @${handle} のレスポンス解析失敗: ${message}`);
      break;
    }

    profiles.push(...data.follows);

    // 次ページが存在しない、またはページ内結果が空ならば終了
    if (!data.cursor || data.follows.length === 0) {
      break;
    }

    cursor = data.cursor;
  }

  return profiles;
}

/**
 * 監視中アカウントのフォロー関係を解析し、監視候補アカウントを発見する。
 *
 * @param monitoredHandles  現在監視中の Bluesky ハンドル一覧
 * @param minSharedFollows  候補とみなす最小共通フォロワー数（デフォルト 2）
 * @returns 共通フォロー数降順に並べた候補アカウント一覧
 */
export async function discoverCandidates(
  monitoredHandles: string[],
  minSharedFollows: number = DEFAULT_MIN_SHARED_FOLLOWS
): Promise<AccountCandidate[]> {
  // 監視アカウントごとのフォロー一覧を並行取得
  const settledResults = await Promise.allSettled(
    monitoredHandles.map(async handle => {
      const follows = await getFollows(handle);
      console.log(`Bluesky: ${handle} のフォロー取得中... (${follows.length}件)`);
      return { handle, follows };
    })
  );

  // followedHandle -> { profile, followedBySet } のマップを構築
  const followMap = new Map<
    string,
    { profile: BlueskyProfile; followedBy: Set<string> }
  >();

  const monitoredSet = new Set(monitoredHandles.map(h => h.toLowerCase()));

  for (const result of settledResults) {
    if (result.status === 'rejected') {
      console.error(`Bluesky: フォロー取得に失敗したアカウントがあります: ${String(result.reason)}`);
      continue;
    }

    const { handle: monitoredHandle, follows } = result.value;

    for (const profile of follows) {
      const normalizedHandle = profile.handle.toLowerCase();

      // 既に監視中のアカウントはスキップ
      if (monitoredSet.has(normalizedHandle)) {
        continue;
      }

      const existing = followMap.get(normalizedHandle);
      if (existing) {
        existing.followedBy.add(monitoredHandle);
      } else {
        followMap.set(normalizedHandle, {
          profile,
          followedBy: new Set([monitoredHandle]),
        });
      }
    }
  }

  // minSharedFollows 以上でフォローされているアカウントのみを候補とする
  const candidates: AccountCandidate[] = [];

  for (const [, { profile, followedBy }] of followMap) {
    if (followedBy.size < minSharedFollows) {
      continue;
    }

    candidates.push({
      handle: profile.handle,
      platform: 'bluesky',
      displayName: profile.displayName,
      description: profile.description,
      sharedFollowCount: followedBy.size,
      followedBy: Array.from(followedBy),
    });
  }

  // 共通フォロー数降順でソート
  candidates.sort((a, b) => b.sharedFollowCount - a.sharedFollowCount);

  return candidates;
}
