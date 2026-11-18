import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { CandlestickChart, SquareTerminal } from "lucide-react";
import { CommandGroup, CommandItem } from "@/components/ui/command";
import { useTrades } from "@/hooks/useTrades";
import { appUi } from "@/lib/appUi";
import { fuzzyRank } from "@/lib/fuzzy";
import { mailWasConnected } from "@/lib/mail";
import { usesSidecar } from "@/lib/platform";
import { listTerminals, shellName } from "@/lib/terminalNative";
import { buildLedger } from "@/lib/tradeLedger";
import { instrumentLabel } from "@/lib/trades";
import { toLocalDateStr } from "@/lib/utils";

interface Props {
  text: string;
  itemClass: string;
  onNavigate: () => void;
}

const LIMIT = 5;

export function TradeCommands({ text, itemClass, onNavigate }: Props) {
  const trades = useTrades(!usesSidecar() || mailWasConnected());
  const positions = useMemo(
    () => (trades.data ? buildLedger(trades.data.events, toLocalDateStr()).positions.sort((a, b) => b.openedAt.localeCompare(a.openedAt)) : []),
    [trades.data],
  );
  const label = (p: (typeof positions)[number]) => `${instrumentLabel(p)} ${p.account} ${p.direction} ${p.status}`;
  const matched = fuzzyRank(text, positions, label).slice(0, LIMIT);
  if (matched.length === 0) return null;

  return (
    <CommandGroup heading="The Ledger">
      {matched.map((p) => (
        <CommandItem key={p.id} value={`trade ${p.id} ${label(p)}`} onSelect={onNavigate} className={itemClass}>
          <div className="search-overlay-icon-alt flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
            <CandlestickChart className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0" data-private>
            <p className="text-sm font-medium truncate">{instrumentLabel(p)}</p>
            <p className="text-xs text-muted-foreground truncate">
              {p.direction} · {p.status} · opened {p.openedAt.slice(0, 10)}
            </p>
          </div>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

export function TerminalCommands({ text, itemClass, onNavigate }: Props) {
  const shells = useQuery({ queryKey: ["terminal", "list"], queryFn: listTerminals, staleTime: 10_000 });
  const live = (shells.data ?? []).filter((s) => !s.exited);
  const label = (s: (typeof live)[number]) => `terminal shell ${s.id} ${shellName(s.shell)}`;
  const matched = fuzzyRank(text, live, label);
  if (matched.length === 0) return null;

  return (
    <CommandGroup heading="Terminal">
      {matched.map((s) => (
        <CommandItem
          key={s.id}
          value={label(s)}
          onSelect={() => {
            appUi.setTerminalTarget(s.id);
            onNavigate();
          }}
          className={itemClass}
        >
          <div className="search-overlay-icon flex items-center justify-center w-8 h-8 rounded-lg shrink-0">
            <SquareTerminal className="w-4 h-4" />
          </div>
          <p className="flex-1 min-w-0 text-sm font-medium truncate">
            [{s.id}] {shellName(s.shell)}
          </p>
          <span className="text-xs text-muted-foreground/50">running shell</span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}
