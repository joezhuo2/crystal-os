import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DateField, ThemedSelect } from "@/components/ui/field-controls";
import { NumberInput } from "@/components/ui/number-input";
import { useContributionRoom } from "@/hooks/useContributionRoom";
import { ROOM_ACCOUNTS, WITHDRAWAL_NOTE, roomSummary, type RoomAccount, type RoomEntry } from "@/lib/contributionRoom";
import { formatMoney } from "@/lib/trades";
import { Empty } from "./shared";
import { shortDate } from "./format";

const FIELD = "bg-secondary/50 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-primary/50";
const cad = (n: number) => formatMoney(n, "CAD");

function RoomCard({
  account,
  year,
  entries,
  onSetRoom,
}: {
  account: RoomAccount;
  year: string;
  entries: RoomEntry[];
  onSetRoom: (amount: number | null) => void;
}) {
  const s = roomSummary(entries, account, year);
  const [draft, setDraft] = useState(s.room === null ? "" : String(s.room));
  useEffect(() => setDraft(s.room === null ? "" : String(s.room)), [s.room]);
  const commit = () => {
    const amount = draft.trim() === "" ? null : Number(draft);
    if (amount !== null && !(amount >= 0)) return setDraft(s.room === null ? "" : String(s.room));
    if (amount !== s.room) onSetRoom(amount);
  };
  const used = s.room ? Math.min(100, (s.deposited / s.room) * 100) : 0;

  return (
    <section aria-label={`${account} contribution room`} className="rounded-xl border border-border/40 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{account}</h3>
        <span className={`text-xs font-medium ${s.over ? "text-red-400" : "text-muted-foreground"}`} data-private>
          {s.remaining === null ? "Enter your room" : s.over ? `Over by ${cad(-s.remaining)}` : `${cad(s.remaining)} left`}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`${account} room used`}
        aria-valuemin={0}
        aria-valuemax={s.room ?? 0}
        aria-valuenow={Math.min(s.deposited, s.room ?? 0)}
        className="h-2 w-full overflow-hidden rounded-full bg-white/10"
      >
        <div className={`h-full transition-[width] duration-500 ${s.over ? "bg-red-400/85" : "bg-primary"}`} style={{ width: `${s.over ? 100 : used}%` }} />
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        Room for {year}
        <NumberInput
          unstyled
          min={0}
          value={draft}
          placeholder="from CRA"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          aria-label={`${account} room for ${year}`}
          className={`${FIELD} w-28 text-right`}
        />
      </label>
      <p className="text-[11px] text-muted-foreground" data-private>
        {cad(s.deposited)} contributed
        {s.withdrawn > 0 && ` · ${cad(s.withdrawn)} withdrawn (${WITHDRAWAL_NOTE[account]})`}
      </p>
    </section>
  );
}

export function ContributionRoom({ today }: { today: string }) {
  const { entries, loading, error, setRoom, add, remove } = useContributionRoom();
  const year = today.slice(0, 4);
  const [form, setForm] = useState({ account: "TFSA" as RoomAccount, kind: "deposit" as "deposit" | "withdrawal", amount: "", date: today });
  const amount = Number(form.amount);
  const moves = entries.filter((e) => e.kind !== "room" && e.date.slice(0, 4) === year).reverse();

  if (error) return <Empty>Could not load your contributions: {error.message}</Empty>;
  if (loading) return <Empty>Loading…</Empty>;

  return (
    <div className="p-3 space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        {ROOM_ACCOUNTS.map((account) => (
          <RoomCard key={account} account={account} year={year} entries={entries} onSetRoom={(v) => void setRoom(account, year, v)} />
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Enter each account's room as of January 1 from your CRA My Account. Contributions you log here come off it; nothing is read from your broker.
      </p>
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!(amount > 0)) return;
          void add({ account: form.account, kind: form.kind, amount, date: form.date });
          setForm((f) => ({ ...f, amount: "" }));
        }}
      >
        <ThemedSelect
          aria-label="Account"
          value={form.account}
          onChange={(v) => setForm((f) => ({ ...f, account: v as RoomAccount }))}
          options={ROOM_ACCOUNTS.map((a) => ({ value: a, label: a }))}
          className="w-28"
        />
        <ThemedSelect
          aria-label="Kind"
          value={form.kind}
          onChange={(v) => setForm((f) => ({ ...f, kind: v as "deposit" | "withdrawal" }))}
          options={[
            { value: "deposit", label: "Contribution" },
            { value: "withdrawal", label: "Withdrawal" },
          ]}
          className="w-36"
        />
        <NumberInput
          unstyled
          min={0}
          value={form.amount}
          placeholder="Amount"
          onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
          aria-label="Amount in CAD"
          className={`${FIELD} w-28 text-right`}
        />
        <DateField value={form.date} aria-label="Date" onChange={(v) => setForm((f) => ({ ...f, date: v }))} className="w-40" />
        <Button type="submit" size="sm" disabled={!(amount > 0)}>
          <Plus /> Log
        </Button>
      </form>
      {moves.length > 0 && (
        <ul className="divide-y divide-border/40 text-xs" aria-label={`Contributions and withdrawals in ${year}`}>
          {moves.map((e) => (
            <li key={e.id} className="flex items-center gap-3 py-2">
              <span className="w-24 text-muted-foreground">{shortDate(`${e.date}T12:00:00`)}</span>
              <span className="w-12 font-medium">{e.account}</span>
              <span className="flex-1 text-muted-foreground">{e.kind === "deposit" ? "Contribution" : "Withdrawal"}</span>
              <span className="tabular-nums" data-private>
                {cad(e.amount)}
              </span>
              <button
                type="button"
                onClick={() => void remove(e.id)}
                aria-label={`Delete the ${e.account} ${e.kind} of ${cad(e.amount)}`}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
