export const ROOM_ACCOUNTS = ["TFSA", "RRSP", "FHSA"] as const;
export type RoomAccount = (typeof ROOM_ACCOUNTS)[number];
export type RoomKind = "room" | "deposit" | "withdrawal";

export interface RoomEntry {
  id: string;
  account: RoomAccount;
  kind: RoomKind;
  amount: number;
  date: string;
}

export interface RoomSummary {
  room: number | null;
  deposited: number;
  withdrawn: number;
  remaining: number | null;
  over: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function roomSummary(entries: RoomEntry[], account: RoomAccount, year: string): RoomSummary {
  const mine = entries.filter((e) => e.account === account && e.date.slice(0, 4) === year);
  const total = (kind: RoomKind) => round2(mine.filter((e) => e.kind === kind).reduce((sum, e) => sum + e.amount, 0));
  const room = mine.filter((e) => e.kind === "room").sort((a, b) => a.date.localeCompare(b.date)).pop()?.amount ?? null;
  const deposited = total("deposit");
  const remaining = room === null ? null : round2(room - deposited);
  return { room, deposited, withdrawn: total("withdrawal"), remaining, over: remaining !== null && remaining < 0 };
}

export const WITHDRAWAL_NOTE: Record<RoomAccount, string> = {
  TFSA: "comes back as room next year",
  RRSP: "does not give room back",
  FHSA: "does not give room back",
};
