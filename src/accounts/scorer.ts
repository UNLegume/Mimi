/**
 * アカウント候補のAI業界関連性スコアリングモジュール
 *
 * Grok を使用してアカウント候補をスコアリングし、
 * Twitter API 未使用時のフォールバック候補生成も提供する。
 */

import type { AiClient } from '../ai/client.js';
import type { AccountCandidate, ScoringResult } from './types.js';
import { extractJsonFromResponse } from '../utils/json.js';
import { toErrorMessage } from '../utils/error.js';

const BATCH_SIZE = 10;

const SCORING_SYSTEM_PROMPT =
  'あなたはAI業界の専門家です。与えられたソーシャルメディアアカウントのAI業界における関連性を1-10で評価してください。';

const TWITTER_FALLBACK_SYSTEM_PROMPT =
  'あなたはAI業界のソーシャルメディア専門家です。Twitter/Xで注目すべきAI関連アカウントを提案してください。';

/**
 * アカウント候補を Grok でスコアリングする。
 *
 * @param candidates スコアリング対象のアカウント候補配列
 * @param client 使用する AiClient
 * @returns relevanceScore と scoreReason が付与され、スコア降順にソートされた候補配列
 */
export async function scoreCandidates(
  candidates: AccountCandidate[],
  client: AiClient
): Promise<AccountCandidate[]> {
  const scored = new Map<string, ScoringResult>();

  // 10件ずつバッチ処理
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    console.log(`スコアリング中: ${batch.length}件の候補...`);

    const batchInput = batch.map((c) => ({
      handle: c.handle,
      displayName: c.displayName ?? null,
      description: c.description ?? null,
      sharedFollowCount: c.sharedFollowCount,
    }));

    const userPrompt = [
      '以下のソーシャルメディアアカウントのAI業界における関連性を評価してください。',
      '',
      '各アカウントに対して、1（全く関連なし）から10（非常に関連あり）のスコアと、',
      '日本語での簡潔な理由を付けてください。',
      '',
      '入力:',
      JSON.stringify(batchInput, null, 2),
      '',
      '出力は以下の JSON 配列形式のみで返してください（説明文不要）:',
      '[{"handle": "...", "score": N, "reason": "..."}]',
    ].join('\n');

    try {
      const response = await client.chat(SCORING_SYSTEM_PROMPT, userPrompt);

      const jsonStr = extractJsonFromResponse(response);
      const results: ScoringResult[] = JSON.parse(jsonStr);

      for (const result of results) {
        if (
          typeof result.handle === 'string' &&
          typeof result.score === 'number' &&
          typeof result.reason === 'string'
        ) {
          scored.set(result.handle, result);
        }
      }
    } catch (error) {
      console.warn(
        `バッチ ${Math.floor(i / BATCH_SIZE) + 1} のスコアリングに失敗しました:`,
        toErrorMessage(error)
      );
    }
  }

  // スコアを候補にマージ
  const result = candidates.map((candidate) => {
    const scoringResult = scored.get(candidate.handle);
    if (scoringResult) {
      return {
        ...candidate,
        relevanceScore: scoringResult.score,
        scoreReason: scoringResult.reason,
      };
    }
    return candidate;
  });

  // relevanceScore 降順でソート（スコアなしは末尾）
  return result.sort((a, b) => {
    const scoreA = a.relevanceScore ?? -1;
    const scoreB = b.relevanceScore ?? -1;
    return scoreB - scoreA;
  });
}

/**
 * 最低スコアでアカウント候補をフィルタリングする。
 *
 * @param candidates フィルタリング対象の候補配列
 * @param minScore 最低スコア（デフォルト: 6）
 * @returns minScore 以上の relevanceScore を持つ候補配列
 */
export function filterByScore(
  candidates: AccountCandidate[],
  minScore = 6
): AccountCandidate[] {
  return candidates.filter(
    (c) => c.relevanceScore !== undefined && c.relevanceScore >= minScore
  );
}

/**
 * Twitter API が利用不可の場合のフォールバック。
 * Grok の知識を基に注目すべき AI 関連 Twitter アカウントを提案する。
 *
 * @param client 使用する AiClient
 * @param existingAccounts 重複を避けるための既存アカウントのハンドル配列
 * @returns platform='twitter', sharedFollowCount=0 の AccountCandidate 配列
 */
export async function generateTwitterCandidates(
  client: AiClient,
  existingAccounts: string[]
): Promise<AccountCandidate[]> {
  const userPrompt = [
    'AI業界で注目すべき Twitter/X アカウントを20件提案してください。',
    '',
    '以下のアカウントはすでに登録済みのため、提案しないでください:',
    existingAccounts.length > 0
      ? existingAccounts.map((h) => `- ${h}`).join('\n')
      : '（なし）',
    '',
    '研究者、企業、プロダクト、インフルエンサーなど、AI・機械学習に深く関連するアカウントを選んでください。',
    '',
    '出力は以下の JSON 配列形式のみで返してください（説明文不要）:',
    '[',
    '  {',
    '    "handle": "@username",',
    '    "displayName": "表示名",',
    '    "description": "アカウントの説明（日本語可）",',
    '    "relevanceScore": N',
    '  }',
    ']',
  ].join('\n');

  const response = await client.chat(TWITTER_FALLBACK_SYSTEM_PROMPT, userPrompt);

  const jsonStr = extractJsonFromResponse(response);
  const raw: Array<{
    handle?: string;
    displayName?: string;
    description?: string;
    relevanceScore?: number;
  }> = JSON.parse(jsonStr);

  return raw
    .filter((item) => typeof item.handle === 'string' && item.handle.length > 0)
    .map((item) => ({
      handle: (item.handle as string).replace(/^@/, ''),
      platform: 'twitter' as const,
      displayName: item.displayName,
      description: item.description,
      sharedFollowCount: 0,
      followedBy: [],
      relevanceScore: item.relevanceScore,
    }));
}
