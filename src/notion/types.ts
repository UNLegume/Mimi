export interface NotionConfig {
  collectionDbId: string;
  tokenEnvVar?: string;
}

export interface PublishResult {
  success: boolean;
  articleTitle: string;
  notionPageUrl?: string;
  error?: string;
}
