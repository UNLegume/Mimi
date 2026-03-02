export type SourceType = 'rss' | 'hackernews' | 'reddit' | 'arxiv' | 'bluesky' | 'xsearch';

export type SourceCredibility = 'official' | 'peer-reviewed' | 'major-media' | 'community';

export interface Article {
  id: string;                    // URL由来のユニークID
  title: string;
  url: string;                   // 記事URL
  primarySourceUrl?: string;     // 一次情報ソースURL（公式発表・論文等）
  primarySourceType?: SourceCredibility;  // ソース種別
  source: SourceType;            // 収集元
  sourceName: string;            // ソース名（例: "VentureBeat AI"）
  summary?: string;              // 記事サマリー
  content?: string;              // 記事本文（取得可能な場合）
  publishedAt?: Date;            // 公開日時
  fetchedAt: Date;               // 収集日時
  metadata?: Record<string, unknown>;  // ソース固有メタデータ
}

export interface FetchResult {
  source: string;
  articles: Article[];
  errors: string[];
}

// ソースアダプタの共通インターフェース
export interface SourceAdapter {
  fetch(): Promise<FetchResult>;
}
