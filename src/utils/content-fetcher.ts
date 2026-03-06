import { parseHTML } from 'linkedom';
import { Readability } from '@mozilla/readability';

export interface FetchedContent {
  text: string;
  title?: string;
  byline?: string;
  wordCount: number;
}

export interface FetchResult {
  status: 'success' | 'skipped_domain' | 'skipped_no_html' | 'skipped_parse_failed' | 'error';
  content?: FetchedContent;
  reason?: string;
}

export async function fetchArticleContent(
  url: string,
  options?: {
    timeoutMs?: number;
    maxLength?: number;
    skipDomains?: string[];
  }
): Promise<FetchResult> {
  const timeoutMs = options?.timeoutMs ?? 15000;
  const maxLength = options?.maxLength ?? 10000;
  const skipDomains = options?.skipDomains ?? [
    'twitter.com',
    'x.com',
    'bsky.app',
    'threads.net',
    'reddit.com',
  ];

  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.replace(/^www\./, '');

    const shouldSkip = skipDomains.some((domain) => {
      const normalizedDomain = domain.replace(/^www\./, '');
      return hostname === normalizedDomain || hostname.endsWith(`.${normalizedDomain}`);
    });

    if (shouldSkip) {
      return { status: 'skipped_domain', reason: hostname };
    }

    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Mimi/1.0; +https://github.com/mimi)',
      },
    });

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html')) {
      return { status: 'skipped_no_html', reason: contentType };
    }

    const html = await response.text();

    const { document } = parseHTML(html);

    const reader = new Readability(document as unknown as Document);
    const article = reader.parse();

    if (!article) {
      return { status: 'skipped_parse_failed' };
    }

    const text = article.textContent
      ? article.textContent.slice(0, maxLength)
      : '';

    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;

    return {
      status: 'success',
      content: {
        text,
        title: article.title ?? undefined,
        byline: article.byline ?? undefined,
        wordCount,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: 'error', reason: message };
  }
}
