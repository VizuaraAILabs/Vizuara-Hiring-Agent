/**
 * Parses Claude Code's token usage indicators from raw PTY output.
 *
 * Claude Code renders its status bar with ANSI escape codes and cursor
 * positioning. The raw PTY stream looks like:
 *   \x1B[38;5;174m↓\x1B[1C3.2k\x1B[1Ctokens
 *
 * We strip all ANSI sequences first, then match the clean text.
 */

export interface TokenReading {
  inputTokens: number;
  outputTokens: number;
}

// Strip all ANSI escape sequences (CSI, OSC, etc.) and cursor movement
const ANSI_RE = /\x1B(?:\[[0-9;]*[a-zA-Z]|\][^\x07]*\x07|\[[0-9;]*m)/g;
// Also strip common control chars that appear in PTY output
const CTRL_RE = /[\x00-\x08\x0E-\x1F]/g;

function stripAnsi(text: string): string {
  return text.replace(ANSI_RE, ' ').replace(CTRL_RE, '');
}

// Match patterns like: ↓ 3.2k tokens, ↓3.2k tokens, ↓ 32000 tokens
// Also match the Unicode arrows that may appear as raw bytes
const INPUT_RE = /↓\s*([\d,.]+)\s*(k|m)?\s*tokens?/gi;
const OUTPUT_RE = /↑\s*([\d,.]+)\s*(k|m)?\s*tokens?/gi;

// Fallback: match "N input tokens" / "N output tokens" patterns
const INPUT_ALT_RE = /([\d,.]+)\s*(k|m)?\s*input\s*tokens?/gi;
const OUTPUT_ALT_RE = /([\d,.]+)\s*(k|m)?\s*output\s*tokens?/gi;

function parseValue(num: string, suffix: string): number {
  const val = parseFloat(num.replace(/,/g, ''));
  if (suffix === 'k' || suffix === 'K') return val * 1000;
  if (suffix === 'm' || suffix === 'M') return val * 1_000_000;
  return val;
}

function matchAll(re: RegExp, text: string): number {
  let total = 0;
  let found = false;
  let match: RegExpExecArray | null;
  re.lastIndex = 0;
  while ((match = re.exec(text)) !== null) {
    total += parseValue(match[1], match[2] || '');
    found = true;
  }
  return found ? total : 0;
}

/**
 * Scans a chunk of terminal output for token indicators.
 * Returns accumulated input/output tokens found, or null if none detected.
 */
export function extractTokenReadings(text: string): TokenReading | null {
  const clean = stripAnsi(text);

  let inputTokens = matchAll(INPUT_RE, clean) || matchAll(INPUT_ALT_RE, clean);
  let outputTokens = matchAll(OUTPUT_RE, clean) || matchAll(OUTPUT_ALT_RE, clean);

  if (inputTokens === 0 && outputTokens === 0) return null;

  return {
    inputTokens: Math.round(inputTokens),
    outputTokens: Math.round(outputTokens),
  };
}
