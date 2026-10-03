import { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatTokens, totalOf } from "@/lib/harness/tokenLedger";
import type { Ledger } from "@/lib/harness/types";
import { harness } from "@/lib/harness/store";

function Table({ ledger, empty }: { ledger: Ledger; empty: string }) {
  const rows = Object.entries(ledger).sort(([, a], [, b]) => b.input + b.output - (a.input + a.output));
  if (rows.length === 0) return <p className="py-3 text-xs text-muted-foreground">{empty}</p>;
  const total = totalOf(ledger);
  const cell = "whitespace-nowrap px-2 py-1.5 text-right tabular-nums";
  const approx = (estimated: boolean) => (estimated ? "≈" : "");
  return (
    <table className="w-full text-xs">
      <thead className="text-muted-foreground">
        <tr>
          <th className="px-2 py-1.5 text-left font-medium">Model</th>
          <th className={`${cell} font-medium`}>In</th>
          <th className={`${cell} font-medium`}>Out</th>
          <th className={`${cell} font-medium`}>Cache</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-white/[0.06]">
        {rows.map(([model, c]) => (
          <tr key={model}>
            <td className="max-w-[20rem] truncate px-2 py-1.5" title={model}>
              {model}
            </td>
            <td className={cell}>{approx(c.estimated) + formatTokens(c.input)}</td>
            <td className={cell}>{approx(c.estimated) + formatTokens(c.output)}</td>
            <td className={`${cell} text-muted-foreground`}>{formatTokens(c.cacheRead + c.cacheWrite)}</td>
          </tr>
        ))}
        {rows.length > 1 && (
          <tr className="font-semibold">
            <td className="px-2 py-1.5">Total</td>
            <td className={cell}>{approx(total.estimated) + formatTokens(total.input)}</td>
            <td className={cell}>{approx(total.estimated) + formatTokens(total.output)}</td>
            <td className={`${cell} text-muted-foreground`}>{formatTokens(total.cacheRead + total.cacheWrite)}</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

interface Props {
  chatTokens: Ledger;
  projectTokens: Ledger;
  projectName: string;
  allTime: Ledger;
}

/** Token usage per model, for this chat, its project, and all time. */
export default function TokenPanel({ chatTokens, projectTokens, projectName, allTime }: Props) {
  const [confirm, setConfirm] = useState(false);
  const estimated = totalOf(chatTokens).estimated || totalOf(projectTokens).estimated || totalOf(allTime).estimated;
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">This chat</p>
        <Table ledger={chatTokens} empty="No tokens used yet." />
      </div>
      <div>
        <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground" title={projectName}>
          Project · {projectName}
        </p>
        <Table ledger={projectTokens} empty="No tokens used in this project yet." />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">All time</p>
        <Table ledger={allTime} empty="Nothing recorded." />
      </div>
      {estimated && <p className="text-[11px] text-muted-foreground">≈ DeepSeek Harness reports context size, not billed tokens, so those counts are estimates. Claude counts are exact.</p>}
      {Object.keys(allTime).length > 0 &&
        (confirm ? (
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" className="flex-1" onClick={() => (harness.resetAllTime(), setConfirm(false))}>
              Reset all-time totals
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="ghost" className="w-full" onClick={() => setConfirm(true)}>
            Reset all-time totals…
          </Button>
        ))}
    </div>
  );
}
