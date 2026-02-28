import { Client } from '@notionhq/client';
import { markdownToBlocks } from './markdown-to-blocks.js';
import type { PublishResult } from './types.js';

export async function findDatePage(
  client: Client,
  collectionDbId: string,
  date: string,
): Promise<{ id: string; url: string } | null> {
  const response = await client.dataSources.query({
    data_source_id: collectionDbId,
    filter: {
      property: '日付',
      title: {
        equals: date,
      },
    },
  });

  if (response.results.length === 0) {
    return null;
  }

  const page = response.results[0] as { id: string; url: string };
  return { id: page.id, url: page.url };
}

export async function publishArticleToNotion(
  client: Client,
  datePageId: string,
  title: string,
  markdown: string,
): Promise<PublishResult> {
  try {
    // Step 1: Convert markdown to Notion blocks
    const blocks = markdownToBlocks(markdown);

    // Step 2: Get the first block of the date page
    const listResult = await client.blocks.children.list({
      block_id: datePageId,
      page_size: 1,
    });

    const firstBlockId = listResult.results[0].id;

    // Step 3: Create a child page with content, positioned after the first block
    const firstChunk = blocks.slice(0, 100);
    const pageResult = await client.pages.create({
      parent: { page_id: datePageId },
      properties: {
        title: { title: [{ text: { content: title } }] },
      },
      content: firstChunk,
      position: { type: 'after_block', after_block: { id: firstBlockId } },
    });

    const newPageId = pageResult.id;

    // Step 4: Append remaining content blocks in chunks of 100
    for (let i = 100; i < blocks.length; i += 100) {
      const chunk = blocks.slice(i, i + 100);
      await client.blocks.children.append({
        block_id: newPageId,
        children: chunk,
      });
    }

    // Step 5: Construct Notion page URL
    const notionPageUrl = `https://www.notion.so/${newPageId.replace(/-/g, '')}`;

    return { success: true, articleTitle: title, notionPageUrl };
  } catch (error) {
    return { success: false, articleTitle: title, error: String(error) };
  }
}
