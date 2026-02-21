/**
 * Parses Claude Code's token usage indicators from raw PTY output.
 *
 * Claude Code prints lines like:
 *   ↓3.2k tokens  (input)
 *   ↑1.1k tokens  (output)
 */

export interface TokenReading {
  inputTokens: number;
  outputTokens: number;
}

const INPUT_RE = /↓\s*([\d.]+)(k?)\s*tokens?/g;
const OUTPUT_RE = /↑\s*([\d.]+)(k?)\s*tokens?/g;

function parseValue(num: string, suffix: string): number {
  const val = parseFloat(num);
  return suffix === 'k' ? val * 1000 : val;
}

/**
 * Scans a chunk of terminal output for token indicators.
 * Returns accumulated input/output tokens found, or null if none detected.
 */
export function extractTokenReadings(text: string): TokenReading | null {
  let inputTokens = 0;
  let outputTokens = 0;
  let found = false;

  let match: RegExpExecArray | null;

  INPUT_RE.lastIndex = 0;
  while ((match = INPUT_RE.exec(text)) !== null) {
    inputTokens += parseValue(match[1], match[2]);
    found = true;
  }

  OUTPUT_RE.lastIndex = 0;
  while ((match = OUTPUT_RE.exec(text)) !== null) {
    outputTokens += parseValue(match[1], match[2]);
    found = true;
  }

  return found ? { inputTokens: Math.round(inputTokens), outputTokens: Math.round(outputTokens) } : null;
}
