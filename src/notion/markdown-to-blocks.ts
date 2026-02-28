import type { BlockObjectRequest } from '@notionhq/client';

type RichTextSegment = {
  text: {
    content: string;
    link?: { url: string };
  };
  annotations?: {
    bold?: boolean;
  };
};

export function parseRichText(text: string): RichTextSegment[] {
  const segments: RichTextSegment[] = [];
  // Match **bold** and [text](url) patterns
  const pattern = /(\*\*(.+?)\*\*|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Plain text before the match
    if (match.index > lastIndex) {
      segments.push({ text: { content: text.slice(lastIndex, match.index) } });
    }

    if (match[0].startsWith('**')) {
      // Bold
      segments.push({
        text: { content: match[2] },
        annotations: { bold: true },
      });
    } else {
      // Link
      segments.push({
        text: { content: match[3], link: { url: match[4] } },
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining plain text
  if (lastIndex < text.length) {
    segments.push({ text: { content: text.slice(lastIndex) } });
  }

  // If nothing was found, return the whole text as a plain segment
  if (segments.length === 0) {
    segments.push({ text: { content: text } });
  }

  return segments;
}

export function markdownToBlocks(markdown: string): BlockObjectRequest[] {
  const lines = markdown.split('\n');
  const blocks: BlockObjectRequest[] = [];
  let quoteLines: string[] = [];

  const flushQuote = () => {
    if (quoteLines.length > 0) {
      const quoteText = quoteLines.join('\n');
      blocks.push({
        type: 'quote',
        quote: { rich_text: parseRichText(quoteText) },
      });
      quoteLines = [];
    }
  };

  for (const line of lines) {
    // Blockquote line
    if (line.startsWith('> ')) {
      quoteLines.push(line.slice(2));
      continue;
    }

    // Flush any accumulated quote lines before processing non-quote lines
    flushQuote();

    // Empty line
    if (line.trim() === '') {
      continue;
    }

    // Divider
    if (line.trim() === '---') {
      blocks.push({ type: 'divider', divider: {} });
      continue;
    }

    // Headings
    if (line.startsWith('### ')) {
      blocks.push({
        type: 'heading_3',
        heading_3: { rich_text: parseRichText(line.slice(4)) },
      });
      continue;
    }

    if (line.startsWith('## ')) {
      blocks.push({
        type: 'heading_2',
        heading_2: { rich_text: parseRichText(line.slice(3)) },
      });
      continue;
    }

    if (line.startsWith('# ')) {
      blocks.push({
        type: 'heading_1',
        heading_1: { rich_text: parseRichText(line.slice(2)) },
      });
      continue;
    }

    // Bulleted list item
    if (line.startsWith('- ')) {
      blocks.push({
        type: 'bulleted_list_item',
        bulleted_list_item: { rich_text: parseRichText(line.slice(2)) },
      });
      continue;
    }

    // Paragraph (any other non-empty text)
    blocks.push({
      type: 'paragraph',
      paragraph: { rich_text: parseRichText(line) },
    });
  }

  // Flush any remaining quote lines at end of input
  flushQuote();

  return blocks;
}
