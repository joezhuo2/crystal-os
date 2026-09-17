import type { Ledger, TokenCounts } from "./types";

export const EMPTY_COUNTS: TokenCounts = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, estimated: false };

export function addCounts(ledger: Ledger, model: string, delta: Partial<TokenCounts>): Ledger {
  const prev = ledger[model] ?? EMPTY_COUNTS;
  return {
    ...ledger,
    [model]: {
      input: prev.input + Math.max(0, delta.input ?? 0),
      output: prev.output + Math.max(0, delta.output ?? 0),
      cacheRead: prev.cacheRead + Math.max(0, delta.cacheRead ?? 0),
      cacheWrite: prev.cacheWrite + Math.max(0, delta.cacheWrite ?? 0),
      estimated: prev.estimated || Boolean(delta.estimated),
    },
  };
}

export function mergeLedgers(a: Ledger, b: Ledger): Ledger {
  return Object.entries(b).reduce((acc, [model, counts]) => addCounts(acc, model, counts), a);
}

export function totalOf(ledger: Ledger): TokenCounts {
  return Object.values(ledger).reduce(
    (sum, c) => ({
      input: sum.input + c.input,
      output: sum.output + c.output,
      cacheRead: sum.cacheRead + c.cacheRead,
      cacheWrite: sum.cacheWrite + c.cacheWrite,
      estimated: sum.estimated || c.estimated,
    }),
    EMPTY_COUNTS,
  );
}

/** Claude's `result.modelUsage` entry (cumulative for the process). */
export interface ClaudeModelUsage {
  inputTokens?: number;
  outputTokens?: number;
  cacheReadInputTokens?: number;
  cacheCreationInputTokens?: number;
}

/**
 * Exact per-model deltas between two cumulative `modelUsage` snapshots from
 * the same claude process. A model missing from `prev` counts from zero.
 */
export function claudeUsageDelta(prev: Record<string, ClaudeModelUsage>, next: Record<string, ClaudeModelUsage>): Ledger {
  let ledger: Ledger = {};
  for (const [model, usage] of Object.entries(next)) {
    const before = prev[model] ?? {};
    ledger = addCounts(ledger, model, {
      input: (usage.inputTokens ?? 0) - (before.inputTokens ?? 0),
      output: (usage.outputTokens ?? 0) - (before.outputTokens ?? 0),
      cacheRead: (usage.cacheReadInputTokens ?? 0) - (before.cacheReadInputTokens ?? 0),
      cacheWrite: (usage.cacheCreationInputTokens ?? 0) - (before.cacheCreationInputTokens ?? 0),
    });
  }
  return ledger;
}

/**
 * dsh reports context size, not billed tokens. Every model step re-sends the
 * whole context, so the input estimate is the sum of the context size at each
 * step; output is estimated from the text produced (about 4 chars a token).
 */
export function estimateDshTurn(contextSizesPerStep: number[], outputChars: number): Partial<TokenCounts> {
  return {
    input: contextSizesPerStep.reduce((a, b) => a + Math.max(0, b), 0),
    output: Math.ceil(outputChars / 4),
    estimated: true,
  };
}

export function formatTokens(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`;
  return `${(n / 1_000_000).toFixed(2)}M`;
}
