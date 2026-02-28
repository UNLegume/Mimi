/**
 * 監視アカウント管理の型定義
 */

/** ソースプラットフォーム */
export type Platform = 'bluesky' | 'twitter';

/** 監視中のアカウント（config.yaml から読み込み） */
export interface MonitoredAccount {
  handle: string;
  platform: Platform;
  /** 表示名（docs/*.md から取得、なければ handle） */
  displayName?: string;
  /** カテゴリ（公式アカウント、研究者 等） */
  category?: string;
}

/** 候補アカウント（discover コマンドで発見） */
export interface AccountCandidate {
  handle: string;
  platform: Platform;
  displayName?: string;
  /** プロフィール説明 */
  description?: string;
  /** 何人の監視アカウントからフォローされているか */
  sharedFollowCount: number;
  /** フォローしている監視アカウントのハンドル */
  followedBy: string[];
  /** Claude API によるAI関連性スコア（1-10） */
  relevanceScore?: number;
  /** スコアリング理由 */
  scoreReason?: string;
}

/** スコアリング結果 */
export interface ScoringResult {
  handle: string;
  score: number;
  reason: string;
}

/** config.yaml のソース定義内のアカウント操作結果 */
export interface AccountOperationResult {
  success: boolean;
  message: string;
  handle: string;
  platform: Platform;
}
