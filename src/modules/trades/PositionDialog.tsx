import { useId, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useSaveTradeJournal } from "@/hooks/useTrades";
import { formatMoney, formatPct, instrumentLabel, type TradeEvent, type TradeGrade, type TradeJournal } from "@/lib/trades";
import type { Position } from "@/lib/tradeLedger";
import { EmailLink, FeedbackButton } from "./shared";
import { dateTime, pnlClass, qtyLabel } from "./format";

const GRADES: TradeGrade[] = ["A", "B", "C", "D", "F"];

const numText = (n: number | undefined) => (n === undefined ? "" : String(n));
const text = (s: string) => s.trim() || undefined;
const optNum = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? undefined : Number(s));

export function TagInput({ tags, onChange, suggestions }: { tags: string[]; onChange: (tags: string[]) => void; suggestions: string[] }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const add = (raw: string) => {
    const tag = raw.trim().slice(0, 40);
    if (tag && !tags.some((t) => t.toLowerCase() === tag.toLowerCase()) && tags.length < 20) onChange([...tags, tag]);
    setDraft("");
  };
  const matches = suggestions.filter((s) => !tags.includes(s) && s.toLowerCase().includes(draft.trim().toLowerCase())).slice(0, 8);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
            {t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(tags.filter((x) => x !== t))} className="hover:text-foreground">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <Input
        id={id}
        aria-label="Add a tag"
        value={draft}
        placeholder="Add a tag and press Enter"
        maxLength={40}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add(draft);
          } else if (e.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
        }}
      />
      {matches.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label="Tag suggestions">
          {matches.map((s) => (
            <button key={s} type="button" onClick={() => add(s)} className="rounded-full border border-border/60 px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground hover:border-primary/60 transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Journal({ position, journal, suggestions }: { position: Position; journal?: TradeJournal; suggestions: string[] }) {
  const id = useId();
  const save = useSaveTradeJournal();
  const [thesis, setThesis] = useState(journal?.thesis ?? "");
  const [target, setTarget] = useState(numText(journal?.target));
  const [stop, setStop] = useState(numText(journal?.stop));
  const [review, setReview] = useState(journal?.review ?? "");
  const [followed, setFollowed] = useState(journal?.followedRules ?? false);
  const [followedSet, setFollowedSet] = useState(journal?.followedRules !== undefined);
  const [grade, setGrade] = useState<TradeGrade | undefined>(journal?.grade);
  const [tags, setTags] = useState(journal?.tags ?? []);
  const [saved, setSaved] = useState(false);

  const submit = () =>
    save.mutate(
      {
        positionId: position.id,
        journal: {
          thesis: text(thesis),
          target: optNum(target),
          stop: optNum(stop),
          review: text(review),
          followedRules: followedSet ? followed : undefined,
          grade,
          tags,
        },
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 1800);
        },
        onError: (err) => toast.error("Could not save the journal", { description: err.message }),
      },
    );

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <section className="space-y-3">
        <h3 className="text-xs text-muted-foreground uppercase tracking-widest">Plan</h3>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-thesis`} className="text-xs text-muted-foreground">
            Thesis
          </Label>
          <Textarea id={`${id}-thesis`} rows={3} maxLength={5000} value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="Why this trade, and what would prove you wrong?" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-target`} className="text-xs text-muted-foreground">
              Target price
            </Label>
            <Input id={`${id}-target`} type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-stop`} className="text-xs text-muted-foreground">
              Stop price
            </Label>
            <Input id={`${id}-stop`} type="number" step="any" value={stop} onChange={(e) => setStop(e.target.value)} />
          </div>
        </div>
      </section>
      <section className="space-y-3">
        <h3 className="text-xs text-muted-foreground uppercase tracking-widest">Review</h3>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-review`} className="text-xs text-muted-foreground">
            Reflection
          </Label>
          <Textarea id={`${id}-review`} rows={3} maxLength={5000} value={review} onChange={(e) => setReview(e.target.value)} placeholder="What happened, and what would you do again?" />
        </div>
        <div className="flex items-center gap-3">
          <Switch
            id={`${id}-rules`}
            checked={followed}
            onCheckedChange={(v) => {
              setFollowed(v);
              setFollowedSet(true);
            }}
          />
          <Label htmlFor={`${id}-rules`} className="text-sm">
            I followed my rules
          </Label>
        </div>
        <div className="space-y-1.5">
          <p id={`${id}-grade`} className="text-xs text-muted-foreground">
            Grade
          </p>
          <div role="radiogroup" aria-labelledby={`${id}-grade`} className="flex gap-1.5">
            {GRADES.map((g) => (
              <button
                key={g}
                type="button"
                role="radio"
                aria-checked={grade === g}
                onClick={() => setGrade(grade === g ? undefined : g)}
                className={`h-8 w-8 rounded-lg text-sm font-semibold transition-colors ${grade === g ? "bg-primary text-primary-foreground" : "bg-secondary/50 text-muted-foreground hover:text-foreground"}`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">Tags</p>
          <TagInput tags={tags} onChange={setTags} suggestions={suggestions} />
        </div>
      </section>
      <div className="flex justify-end">
        <FeedbackButton type="submit" pending={save.isPending} done={saved} doneLabel="Journal saved">
          Save journal
        </FeedbackButton>
      </div>
    </form>
  );
}

export function PositionDialog({
  position,
  journal,
  suggestions,
  onClose,
  onEdit,
  onDelete,
  onAddMissing,
}: {
  position: Position;
  journal?: TradeJournal;
  suggestions: string[];
  onClose: () => void;
  onEdit: (event: TradeEvent) => void;
  onDelete: (event: TradeEvent) => void;
  onAddMissing: (position: Position) => void;
}) {
  const open = position.status === "open";
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {instrumentLabel(position)} <span className="text-sm font-normal text-muted-foreground">{position.account}</span>
          </DialogTitle>
          <DialogDescription>
            {position.direction === "short" ? "Short" : "Long"} · {open ? "open" : position.status} · {position.currency}
          </DialogDescription>
        </DialogHeader>

        {position.incomplete && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 text-xs text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden />
            <span className="flex-1 min-w-0">
              {qtyLabel(position.unmatchedQty)} sold with no matching buy in your email history, so its profit is left out of the totals.
            </span>
            <Button type="button" size="sm" variant="outline" onClick={() => onAddMissing(position)}>
              <Plus /> Add the missing buy
            </Button>
          </div>
        )}

        {!position.incomplete && !open && (
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">Realized P/L</dt>
              <dd data-private className={`font-semibold tabular-nums ${pnlClass(position.realizedPnl)}`}>
                {formatMoney(position.realizedPnl, position.currency, true)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Return</dt>
              <dd className={`font-semibold tabular-nums ${pnlClass(position.pnlPct)}`}>{formatPct(position.pnlPct, true)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Held</dt>
              <dd className="font-semibold tabular-nums">{position.holdDays}d</dd>
            </div>
          </dl>
        )}

        <Journal position={position} journal={journal} suggestions={suggestions} />

        <section className="space-y-2">
          <h3 className="text-xs text-muted-foreground uppercase tracking-widest">Fills</h3>
          <div className="overflow-x-auto scrollbar-thin rounded-lg border border-border/60">
            <table className="w-full min-w-[34rem] text-xs">
              <thead className="text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Side</th>
                  <th className="px-3 py-2 font-medium text-right">Qty</th>
                  <th className="px-3 py-2 font-medium text-right">Price</th>
                  <th className="px-3 py-2 font-medium text-right">Total</th>
                  <th className="px-3 py-2 font-medium">Email</th>
                  <th className="px-3 py-2 font-medium text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {position.events.map((e) => (
                  <tr key={e.id} className="border-t border-border/40">
                    <td className="px-3 py-2 whitespace-nowrap">{dateTime(e.time)}</td>
                    <td className="px-3 py-2 capitalize">{e.side}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{qtyLabel(e.quantity)}</td>
                    <td data-private className="px-3 py-2 text-right tabular-nums">
                      {e.price === undefined ? "-" : formatMoney(e.price, e.currency)}
                    </td>
                    <td data-private className="px-3 py-2 text-right tabular-nums">
                      {e.total === undefined ? "-" : formatMoney(e.total, e.currency)}
                    </td>
                    <td className="px-3 py-2">
                      <EmailLink url={e.url} />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        <button type="button" aria-label="Edit this fill" onClick={() => onEdit(e)} className="p-1 text-muted-foreground hover:text-primary">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" aria-label="Delete this fill" onClick={() => onDelete(e)} className="p-1 text-muted-foreground hover:text-destructive">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </DialogContent>
    </Dialog>
  );
}
