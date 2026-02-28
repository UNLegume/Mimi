import Anthropic from '@anthropic-ai/sdk';

export function createClient(model: string): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('エラー: ANTHROPIC_API_KEY が設定されていません。');
    console.error('.env ファイルまたは環境変数に ANTHROPIC_API_KEY を設定してください。');
    process.exit(1);
  }
  // ANTHROPIC_API_KEY は Anthropic SDK がデフォルトで環境変数から読み込む
  return new Anthropic();
}

export async function callClaude(
  client: Anthropic,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxRetries = 3
): Promise<string> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const message = await client.messages.create({
        model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [
          { role: 'user', content: userPrompt },
        ],
      });

      const content = message.content[0];
      if (content.type !== 'text') {
        throw new Error(`Unexpected response type: ${content.type}`);
      }
      return content.text;
    } catch (error) {
      lastError = error;
      if (attempt < maxRetries) {
        console.warn(`API呼び出し失敗 (${attempt}/${maxRetries}回目)。1秒後にリトライします...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }

  throw lastError;
}
