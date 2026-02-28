import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { Article } from '../sources/types.js';

interface ArticleRecord {
  id: string;
  title: string;
  url: string;
  primarySourceUrl?: string;
  primarySourceType?: string;
  source: string;
  sourceName: string;
  summary?: string;
  content?: string;
  publishedAt?: string;
  fetchedAt: string;
  metadata?: Record<string, unknown>;
}

export interface PublishedTopic {
  id: string;
  title: string;
  topic: string;
  publishedAt: string;
  url: string;
}

export class ArticleStore {
  private readonly dataDir: string;

  constructor(dataDir: string = 'data') {
    this.dataDir = dataDir;
    this.ensureDataDir();
  }

  private ensureDataDir(): void {
    if (!existsSync(this.dataDir)) {
      mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // 記事をJSONファイルに保存
  save(filename: string, articles: Article[]): void {
    const filePath = join(this.dataDir, filename);
    const records: ArticleRecord[] = articles.map(article => ({
      ...article,
      publishedAt: article.publishedAt?.toISOString(),
      fetchedAt: article.fetchedAt.toISOString(),
    }));
    writeFileSync(filePath, JSON.stringify(records, null, 2), 'utf-8');
  }

  // JSONファイルから記事を読み込み（Date型を復元）
  load(filename: string): Article[] {
    const filePath = join(this.dataDir, filename);
    if (!existsSync(filePath)) {
      return [];
    }
    const raw = readFileSync(filePath, 'utf-8');
    let records: ArticleRecord[];
    try {
      records = JSON.parse(raw);
    } catch {
      console.error(`${filename} のJSONパースに失敗しました。ファイルが破損している可能性があります。`);
      return [];
    }
    return records.map(record => ({
      ...record,
      source: record.source as Article['source'],
      primarySourceType: record.primarySourceType as Article['primarySourceType'],
      publishedAt: record.publishedAt ? new Date(record.publishedAt) : undefined,
      fetchedAt: new Date(record.fetchedAt),
    }));
  }

  // 投稿済みトピックをJSONファイルから読み込み
  loadPublishedTopics(): PublishedTopic[] {
    const filePath = join(this.dataDir, 'published_topics.json');
    if (!existsSync(filePath)) {
      return [];
    }
    const raw = readFileSync(filePath, 'utf-8');
    try {
      return JSON.parse(raw) as PublishedTopic[];
    } catch {
      console.error('published_topics.json のJSONパースに失敗しました。ファイルが破損している可能性があります。');
      return [];
    }
  }

  // 投稿済みトピックをJSONファイルに追記保存
  savePublishedTopic(topic: PublishedTopic): void {
    const filePath = join(this.dataDir, 'published_topics.json');
    const existing = this.loadPublishedTopics();
    existing.push(topic);
    writeFileSync(filePath, JSON.stringify(existing, null, 2), 'utf-8');
  }

  // URLベースの重複排除
  deduplicate(articles: Article[]): Article[] {
    const seen = new Set<string>();
    return articles.filter(article => {
      if (seen.has(article.url)) {
        return false;
      }
      seen.add(article.url);
      return true;
    });
  }

}
