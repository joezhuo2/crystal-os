import { describe, expect, it } from "vitest";
import {
  averageScore,
  makeResult,
  parseShare,
  parseStoredResults,
  recentDays,
  scoreLabel,
  streak,
  upsertResult,
} from "./funGames";

const played = (game: string, date: string, text = "Wordle 1,234 4/6") => makeResult(game, text, date);

describe("parseShare", () => {
  it("reads guesses out of a maximum", () => {
    expect(parseShare("Wordle 1,234 4/6\n\n⬛🟨⬛⬛⬛")).toEqual({ score: 4, max: 6 });
  });

  it("counts a failed game as one past the maximum", () => {
    expect(parseShare("Wordle 1,234 X/6")).toEqual({ score: 7, max: 6 });
  });

  it("reads a guess count", () => {
    expect(parseShare("I played contexto.me #123 and got it in 45 guesses.")).toEqual({ score: 45, max: null });
  });

  it("reads a bare score, skipping the puzzle number and any link", () => {
    expect(parseShare("Krillion #212 🦐 3,412m  🟦🟩⬛  https://krillion.io/2")).toEqual({ score: 3412, max: null });
  });

  it("reads the results Krillion and Wordle copy", () => {
    expect(parseShare(`Krillion #126 🦐
385

🏮🏮🐟🌟🏮⬛⬛`)).toEqual({ score: 385, max: null });
    expect(parseShare("You got Wordle in 2!")).toEqual({ score: 2, max: null });
  });

  it("scores a result that was saved before its format was known", () => {
    const stored = [{ game: "krillion", date: "2026-11-18", score: null, max: null, text: "Krillion #212 🦐 3,412m" }];
    expect(parseStoredResults(JSON.stringify(stored))[0].score).toBe(3412);
  });

  it("ignores text with no score", () => {
    expect(parseShare("Connections\nPuzzle #500\n🟨🟨🟨🟨")).toEqual({ score: null, max: null });
  });
});

describe("results", () => {
  it("keeps one result per game and day, preferring a scored one", () => {
    const first = played("wordle", "2026-11-18");
    const link = makeResult("wordle", "https://example.com", "2026-11-18");
    const better = played("wordle", "2026-11-18", "Wordle 1,234 3/6");
    expect(upsertResult([first], link)).toEqual([first]);
    expect(upsertResult([first], better)).toEqual([better]);
    expect(upsertResult([first], played("contexto", "2026-11-18"))).toHaveLength(2);
  });

  it("counts a streak through today, or through yesterday when today is unplayed", () => {
    const results = ["2026-11-15", "2026-11-16", "2026-11-17"].map((d) => played("wordle", d));
    expect(streak(results, "wordle", "2026-11-17")).toBe(3);
    expect(streak(results, "wordle", "2026-11-18")).toBe(3);
    expect(streak(results, "wordle", "2026-11-19")).toBe(0);
    expect(streak(results, "contexto", "2026-11-17")).toBe(0);
  });

  it("counts a streak across a month boundary", () => {
    const results = ["2026-10-31", "2026-11-01"].map((d) => played("wordle", d));
    expect(streak(results, "wordle", "2026-11-01")).toBe(2);
  });

  it("lists recent days oldest first and averages their scores", () => {
    const results = [played("wordle", "2026-11-17", "Wordle 1 2/6"), played("wordle", "2026-11-18")];
    const days = recentDays(results, "wordle", "2026-11-18", 3);
    expect(days.map((d) => d.date)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
    expect(days.map((d) => scoreLabel(d.result))).toEqual(["–", "2/6", "4/6"]);
    expect(averageScore(days.map((d) => d.result))).toBe(3);
    expect(averageScore([null])).toBeNull();
  });

  it("drops malformed stored results", () => {
    const good = played("wordle", "2026-11-18");
    expect(parseStoredResults(JSON.stringify([good, { game: 1 }, { game: "a", date: "nope" }, null]))).toEqual([good]);
    expect(parseStoredResults("{not json")).toEqual([]);
  });
});
