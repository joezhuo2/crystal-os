import { describe, expect, it } from "vitest";
import { addCounts, claudeUsageDelta, estimateDshTurn, formatTokens, mergeLedgers, totalOf } from "./tokenLedger";

describe("token ledger", () => {
  it("adds counts per model and keeps the estimate flag sticky", () => {
    let ledger = addCounts({}, "Kimi K3", { input: 100, output: 10, estimated: true });
    ledger = addCounts(ledger, "Kimi K3", { input: 50, output: 5 });
    ledger = addCounts(ledger, "claude-opus-5", { input: 7, output: 3 });
    expect(ledger["Kimi K3"]).toEqual({ input: 150, output: 15, cacheRead: 0, cacheWrite: 0, estimated: true });
    const total = totalOf(ledger);
    expect(total.input).toBe(157);
    expect(total.estimated).toBe(true);
  });

  it("ignores negative deltas", () => {
    expect(addCounts({}, "m", { input: -5 }).m.input).toBe(0);
  });

  it("computes exact deltas between cumulative claude modelUsage snapshots", () => {
    // Snapshots from the ADR 0003 spike: turn 1 then turn 2 on one process.
    const first = { "claude-haiku-4-5-20251001": { inputTokens: 26, outputTokens: 680, cacheReadInputTokens: 101476, cacheCreationInputTokens: 25703 } };
    const second = {
      "claude-haiku-4-5-20251001": { inputTokens: 44, outputTokens: 1018, cacheReadInputTokens: 187633, cacheCreationInputTokens: 26234 },
      "claude-sonnet-5": { inputTokens: 5, outputTokens: 1 },
    };
    expect(claudeUsageDelta({}, first)["claude-haiku-4-5-20251001"]).toMatchObject({ input: 26, output: 680, estimated: false });
    const delta = claudeUsageDelta(first, second);
    expect(delta["claude-haiku-4-5-20251001"]).toEqual({ input: 18, output: 338, cacheRead: 86157, cacheWrite: 531, estimated: false });
    expect(delta["claude-sonnet-5"].input).toBe(5);
  });

  it("estimates dsh turns from context size per step, not deltas", () => {
    expect(estimateDshTurn([12_000, 15_000, 9_000], 400)).toEqual({ input: 36_000, output: 100, estimated: true });
  });

  it("merges ledgers", () => {
    const merged = mergeLedgers({ a: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, estimated: false } }, { a: { input: 2, output: 0, cacheRead: 0, cacheWrite: 0, estimated: true } });
    expect(merged.a).toEqual({ input: 3, output: 1, cacheRead: 0, cacheWrite: 0, estimated: true });
  });

  it("formats large numbers compactly", () => {
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(1_500)).toBe("1.5k");
    expect(formatTokens(250_000)).toBe("250k");
    expect(formatTokens(3_210_000)).toBe("3.21M");
  });
});
