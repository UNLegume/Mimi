export function extractJsonFromResponse(response: string): string {
  // コードブロック除去（バッククォート3つ以上に対応）
  const codeBlockMatch = response.match(/`{3,}(?:json)?\s*\n?([\s\S]*?)\n?`{3,}/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  // JSON 配列を抽出
  const arrayMatch = response.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  // JSON オブジェクトを抽出
  const objectMatch = response.match(/\{[\s\S]*\}/);
  if (objectMatch) return objectMatch[0];
  return response.trim();
}
