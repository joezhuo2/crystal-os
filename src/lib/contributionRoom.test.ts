import { describe, expect, it } from "vitest";
import { roomSummary, type RoomEntry } from "./contributionRoom";

let n = 0;
const entry = (account: RoomEntry["account"], kind: RoomEntry["kind"], amount: number, date: string): RoomEntry => ({ id: String(n++), account, kind, amount, date });

describe("roomSummary", () => {
  const entries = [
    entry("TFSA", "room", 7000, "2026-01-01"),
    entry("TFSA", "deposit", 2500.1, "2026-02-01"),
    entry("TFSA", "deposit", 1000.2, "2026-05-01"),
    entry("TFSA", "withdrawal", 500, "2026-06-01"),
    entry("TFSA", "deposit", 9000, "2025-03-01"),
    entry("RRSP", "deposit", 300, "2026-03-01"),
  ];

  it("takes this year's deposits off the room, and leaves withdrawals out of it", () => {
    expect(roomSummary(entries, "TFSA", "2026")).toEqual({ room: 7000, deposited: 3500.3, withdrawn: 500, remaining: 3499.7, over: false });
  });

  it("has no remaining figure until a room is entered", () => {
    expect(roomSummary(entries, "RRSP", "2026")).toEqual({ room: null, deposited: 300, withdrawn: 0, remaining: null, over: false });
    expect(roomSummary(entries, "FHSA", "2026")).toEqual({ room: null, deposited: 0, withdrawn: 0, remaining: null, over: false });
  });

  it("flags an over-contribution", () => {
    const over = roomSummary([...entries, entry("TFSA", "deposit", 4000, "2026-07-01")], "TFSA", "2026");
    expect([over.remaining, over.over]).toEqual([-500.3, true]);
  });
});
