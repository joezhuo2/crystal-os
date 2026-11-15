import { useId, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DateField, ThemedSelect, TimeField } from "@/components/ui/field-controls";
import { useAddTradeEvent, useSaveTradeJournal, useUpdateTradeEvent } from "@/hooks/useTrades";
import { buildLedger } from "@/lib/tradeLedger";
import { toLocalDateStr } from "@/lib/utils";
import type { TradeCurrency, TradeEvent, TradesData, TradeStatus } from "@/lib/trades";
import { TagInput } from "./PositionDialog";
import { FeedbackButton } from "./shared";

export type TradeDraft = Partial<Omit<TradeEvent, "id" | "source">>;

const ACCOUNTS = ["Non-registered", "TFSA", "RRSP", "FHSA"];

const STATUS_OPTIONS: { value: TradeStatus; label: string }[] = [
  { value: "filled", label: "Filled" },
  { value: "partial", label: "Partially filled" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "rejected", label: "Rejected" },
];

const pad = (n: number) => String(n).padStart(2, "0");
const timeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5 min-w-0">
      <Label htmlFor={htmlFor} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

const num = (s: string) => (s.trim() === "" ? undefined : Number(s));

export function TradeDialog({
  event,
  draft,
  accounts,
  knownIds,
  suggestions,
  onClose,
}: {
  event?: TradeEvent;
  draft?: TradeDraft;
  accounts: string[];
  knownIds: ReadonlySet<string>;
  suggestions: string[];
  onClose: () => void;
}) {
  const id = useId();
  const add = useAddTradeEvent();
  const update = useUpdateTradeEvent();
  const saveJournal = useSaveTradeJournal();
  const init = event ?? draft ?? {};
  const when = init.time ? new Date(init.time) : new Date();

  const [account, setAccount] = useState(init.account ?? accounts[0] ?? ACCOUNTS[0]);
  const [side, setSide] = useState<"buy" | "sell">(init.side ?? "buy");
  const [effect, setEffect] = useState<"" | "open" | "close">(init.effect ?? "");
  const [orderType, setOrderType] = useState(init.orderType ?? "Limit");
  const [symbol, setSymbol] = useState(init.symbol ?? "");
  const [isOption, setIsOption] = useState(!!init.option);
  const [strike, setStrike] = useState(init.option ? String(init.option.strike) : "");
  const [right, setRight] = useState<"call" | "put">(init.option?.right ?? "call");
  const [expiry, setExpiry] = useState(init.option?.expiry ?? "");
  const [quantity, setQuantity] = useState(init.quantity !== undefined ? String(init.quantity) : "");
  const [price, setPrice] = useState(init.price !== undefined ? String(init.price) : "");
  const [total, setTotal] = useState(init.total !== undefined ? String(init.total) : "");
  const [currency, setCurrency] = useState<TradeCurrency>(init.currency ?? "USD");
  const [date, setDate] = useState(toLocalDateStr(when));
  const [time, setTime] = useState(timeStr(when));
  const [status, setStatus] = useState<TradeStatus>(init.status ?? "filled");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const opening = effect ? effect === "open" : side === "buy";

  const accountOptions = [...new Set([...ACCOUNTS, ...accounts, account])].map((a) => ({ value: a, label: a }));

  const submit = () => {
    const qty = Number(quantity);
    const strikeN = Number(strike);
    const at = new Date(`${date}T${time || "12:00"}`);
    if (!symbol.trim()) return setError("Enter a symbol.");
    if (!Number.isFinite(qty) || qty <= 0) return setError("Quantity must be above zero.");
    if (Number.isNaN(at.getTime())) return setError("Pick a date.");
    if (isOption && (!Number.isFinite(strikeN) || strikeN <= 0 || !expiry)) return setError("An option needs a strike and an expiry.");
    const priceN = num(price);
    const totalN = num(total);
    if ((priceN !== undefined && !Number.isFinite(priceN)) || (totalN !== undefined && !Number.isFinite(totalN))) return setError("Price and total must be numbers.");

    const fields = {
      status,
      account: account.trim() || ACCOUNTS[0],
      side,
      effect: effect || undefined,
      orderType: orderType.trim() || "Limit",
      symbol: symbol.trim().toUpperCase(),
      option: isOption ? { strike: strikeN, right, expiry } : undefined,
      quantity: qty,
      orderedQuantity: event?.orderedQuantity,
      price: priceN,
      total: totalN,
      currency,
      time: at.toISOString(),
      url: event?.url,
    };
    const finish = () => {
      setDone(true);
      setTimeout(onClose, 800);
    };
    const fail = (err: Error) => setError(err.message);
    if (event) return update.mutate({ ...event, ...fields }, { onSuccess: finish, onError: fail });
    add.mutate(fields, {
      onSuccess: (next) => (note.trim() || tags.length ? saveNotes(next).then(finish, fail) : finish()),
      onError: fail,
    });
  };

  const saveNotes = async (next: TradesData) => {
    const added = next.events.find((e) => e.source === "manual" && !knownIds.has(e.id));
    const position = added && buildLedger(next.events, toLocalDateStr()).positions.find((p) => p.events.some((e) => e.id === added.id));
    if (!position) return;
    const { updatedAt: _, ...current } = next.journal[position.id] ?? { tags: [], updatedAt: "" };
    const key = opening ? "thesis" : "review";
    const text = note.trim();
    await saveJournal.mutateAsync({
      positionId: position.id,
      journal: {
        ...current,
        [key]: text ? [current[key], text].filter(Boolean).join("\n\n") : current[key],
        tags: [...new Set([...current.tags, ...tags])],
      },
    });
  };

  const pending = add.isPending || update.isPending || saveJournal.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? "Edit trade" : "Add trade"}</DialogTitle>
          <DialogDescription>
            {event && event.source !== "manual" ? "Your change is kept on top of the imported record." : "Record a fill the emails missed."}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field label="Account">
            <ThemedSelect aria-label="Account" value={account} onChange={setAccount} options={accountOptions} />
          </Field>
          <Field label="Currency">
            <ThemedSelect
              aria-label="Currency"
              value={currency}
              onChange={(v) => setCurrency(v as TradeCurrency)}
              options={[
                { value: "USD", label: "USD" },
                { value: "CAD", label: "CAD" },
              ]}
            />
          </Field>
          <Field label="Side">
            <ThemedSelect
              aria-label="Side"
              value={side}
              onChange={(v) => setSide(v as "buy" | "sell")}
              options={[
                { value: "buy", label: "Buy" },
                { value: "sell", label: "Sell" },
              ]}
            />
          </Field>
          <Field label="Effect">
            <ThemedSelect
              aria-label="Effect"
              value={effect}
              onChange={(v) => setEffect(v as "" | "open" | "close")}
              options={[
                { value: "", label: "Not stated" },
                { value: "open", label: "To open" },
                { value: "close", label: "To close" },
              ]}
            />
          </Field>
          <Field label="Symbol" htmlFor={`${id}-symbol`}>
            <Input id={`${id}-symbol`} value={symbol} onChange={(e) => setSymbol(e.target.value)} placeholder="NVDA" autoFocus />
          </Field>
          <Field label="Instrument">
            <ThemedSelect
              aria-label="Instrument"
              value={isOption ? "option" : "stock"}
              onChange={(v) => setIsOption(v === "option")}
              options={[
                { value: "stock", label: "Stock" },
                { value: "option", label: "Option" },
              ]}
            />
          </Field>
          {isOption && (
            <>
              <Field label="Strike" htmlFor={`${id}-strike`}>
                <Input id={`${id}-strike`} type="number" step="any" value={strike} onChange={(e) => setStrike(e.target.value)} />
              </Field>
              <Field label="Call or put">
                <ThemedSelect
                  aria-label="Call or put"
                  value={right}
                  onChange={(v) => setRight(v as "call" | "put")}
                  options={[
                    { value: "call", label: "Call" },
                    { value: "put", label: "Put" },
                  ]}
                />
              </Field>
              <Field label="Expiry">
                <DateField aria-label="Expiry" value={expiry} onChange={setExpiry} />
              </Field>
              <div />
            </>
          )}
          <Field label={isOption ? "Contracts" : "Shares"} htmlFor={`${id}-qty`}>
            <Input id={`${id}-qty`} type="number" step="any" min="0" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label="Order type" htmlFor={`${id}-type`}>
            <Input id={`${id}-type`} value={orderType} onChange={(e) => setOrderType(e.target.value)} />
          </Field>
          <Field label="Price per share" htmlFor={`${id}-price`}>
            <Input id={`${id}-price`} type="number" step="any" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
          </Field>
          <Field label="Total (optional)" htmlFor={`${id}-total`}>
            <Input id={`${id}-total`} type="number" step="any" min="0" value={total} onChange={(e) => setTotal(e.target.value)} />
          </Field>
          <Field label="Date">
            <DateField aria-label="Date" value={date} onChange={setDate} />
          </Field>
          <Field label="Time">
            <TimeField aria-label="Time" value={time} onChange={setTime} />
          </Field>
          <div className="col-span-2">
            <Field label="Status">
              <ThemedSelect aria-label="Status" value={status} onChange={(v) => setStatus(v as TradeStatus)} options={STATUS_OPTIONS} />
            </Field>
          </div>
          {!event && (
            <>
              <div className="col-span-2">
                <Field label={opening ? "Why this trade? (optional)" : "Reflection (optional)"} htmlFor={`${id}-note`}>
                  <Textarea
                    id={`${id}-note`}
                    rows={3}
                    maxLength={5000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={opening ? "Your thesis, and what would prove you wrong" : "What happened, and what would you do again?"}
                  />
                </Field>
              </div>
              <div className="col-span-2 space-y-1.5">
                <p className="text-xs text-muted-foreground">Tags (optional)</p>
                <TagInput tags={tags} onChange={setTags} suggestions={suggestions} />
              </div>
            </>
          )}
          {error && (
            <p role="alert" className="col-span-2 text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="col-span-2 gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <FeedbackButton type="submit" pending={pending} done={done} doneLabel={event ? "Saved" : "Trade added"}>
              {event ? "Save changes" : "Add trade"}
            </FeedbackButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
