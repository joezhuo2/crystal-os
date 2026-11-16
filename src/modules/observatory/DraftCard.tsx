import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ActionButton } from "./ActionButton";

export function DraftCard({ label, children, onAccept, onDiscard }: { label: string; children: ReactNode; onAccept: () => Promise<boolean>; onDiscard: () => void }) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border border-dashed border-primary/50 p-3 space-y-2">
      <span className="rounded-full border border-amber-300/60 px-2 text-[10px] uppercase tracking-wide text-amber-300">AI draft, unverified</span>
      {children}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDiscard}>
          Discard
        </Button>
        <ActionButton size="sm" action={onAccept} pending="Adding" done="Added">
          Accept
        </ActionButton>
      </div>
    </div>
  );
}
