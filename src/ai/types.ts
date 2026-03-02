export interface AiClient {
  readonly provider: 'anthropic' | 'grok';
  readonly model: string;
  chat(systemPrompt: string, userPrompt: string, options?: ChatOptions): Promise<string>;
}

export interface ChatOptions {
  maxRetries?: number;
  responseFormat?: { type: 'json_schema'; json_schema: { name: string; schema: Record<string, unknown> } };
}
