export function extractJsonFromResponse(response: string): string {
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  const arrayMatch = response.match(/\[[\s\S]*\]/);
  if (arrayMatch) return arrayMatch[0];
  return response.trim();
}
