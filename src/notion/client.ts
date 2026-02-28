import { Client } from '@notionhq/client';

export function createNotionClient(tokenEnvVar: string = 'NOTION_API_TOKEN'): Client {
  const token = process.env[tokenEnvVar];
  if (!token) {
    throw new Error(`Notion API token is not set. Please set the environment variable: ${tokenEnvVar}`);
  }
  return new Client({ auth: token });
}
