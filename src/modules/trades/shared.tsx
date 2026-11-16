import type { ReactNode } from "react";
import { Check, ExternalLink, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { isDesktop, openExternal } from "@/lib/platform";

export function EmailLink({ url }: { url?: string }) {
  if (!url) return <span className="text-muted-foreground">-</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label="Open the email"
      onClick={(e) => {
        if (!isDesktop()) return;
        e.preventDefault();
        openExternal(url).catch((err) => toast.error("Could not open the email", { description: err instanceof Error ? err.message : String(err) }));
      }}
      className="inline-flex items-center text-primary hover:underline"
    >
      <ExternalLink className="w-3.5 h-3.5" aria-hidden />
    </a>
  );
}

export function FeedbackButton({ pending, done, doneLabel, children, className, disabled, ...props }: ButtonProps & { pending: boolean; done: boolean; doneLabel: string; children: ReactNode }) {
  return (
    <Button {...props} disabled={disabled || pending} aria-live="polite" className={cn("min-w-[8.5rem] transition-colors duration-300", done && "bg-accent text-accent-foreground hover:bg-accent", className)}>
      {pending ? (
        <>
          <Loader2 className="animate-spin" aria-hidden /> Saving…
        </>
      ) : done ? (
        <>
          <Check className="feedback-pop" aria-hidden /> {doneLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}

export function DataTable({ head, children }: { head: ReactNode; children: ReactNode }) {
  return (
    <table className="w-full text-xs">
      <thead className="sticky top-0 z-10 bg-background/85 backdrop-blur-sm text-left text-muted-foreground">
        <tr>{head}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  );
}

export const HIDE_NARROW = "hidden lg:table-cell";

export const Th = ({ children, right, sr, hide }: { children?: ReactNode; right?: boolean; sr?: string; hide?: boolean }) => (
  <th scope="col" className={`px-3 py-2.5 font-medium ${right ? "text-right" : ""} ${hide ? HIDE_NARROW : ""}`}>
    {sr ? <span className="sr-only">{sr}</span> : children}
  </th>
);

export const Td = ({ children, right, hide, className = "" }: { children?: ReactNode; right?: boolean; hide?: boolean; className?: string }) => (
  <td className={`px-3 py-2.5 break-words ${right ? "text-right tabular-nums" : ""} ${hide ? HIDE_NARROW : ""} ${className}`}>{children}</td>
);

export function Empty({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`p-8 text-center text-sm text-muted-foreground ${className}`}>{children}</div>;
}
