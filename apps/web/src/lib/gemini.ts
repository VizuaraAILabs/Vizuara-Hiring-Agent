export function getGeminiKeys(): string[] {
  const raw = process.env.GEMINI_API_KEY ?? '';
  return raw.split(',').map(k => k.trim()).filter(Boolean);
}

export async function callWithKeyRotation<T>(fn: (key: string) => Promise<T>): Promise<T> {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new Error('GEMINI_API_KEY_MISSING');
  }

  let lastError: Error = new Error('GEMINI_API_ERROR: unknown');
  for (const key of keys) {
    try {
      return await fn(key);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error('GEMINI_API_ERROR: unknown');
      console.warn(`Gemini key failed, trying next. Error: ${lastError.message}`);
    }
  }

  throw lastError;
}
