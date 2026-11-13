import { ChevronRight, Mail } from "lucide-react";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import { useMailDigest, useMailStatus } from "@/hooks/useMail";
import { usesSidecar } from "@/lib/platform";
import { toLocalDateStr } from "@/lib/utils";
import { JOB_STATUS_LABEL, dueLabel, jobCompany, latestJobs, mailWasConnected, sortBills } from "@/lib/mail";

export function MailWidget({ onClick }: { onClick?: () => void }) {
  const status = useMailStatus(!usesSidecar() || mailWasConnected());
  const accounts = status.data?.accounts ?? [];
  const digest = useMailDigest(accounts);
  const today = toLocalDateStr();
  const bills = digest.data ? sortBills(digest.data.items).filter((b) => b.dueDate && b.dueDate >= today).slice(0, 3) : [];
  const jobs = digest.data ? latestJobs(digest.data.items).slice(0, 2) : [];

  return (
    <div onClick={onClick} className="glass-card-hover p-6 cursor-pointer group h-full">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs uppercase tracking-widest text-primary">The Courier</p>
        <Mail className="w-4 h-4 text-primary" aria-hidden />
      </div>

      {status.isLoading || digest.isLoading ? (
        <SkeletonLines count={4} />
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Connect Gmail to see bills and job updates here.</p>
      ) : digest.isError ? (
        <p className="text-sm text-muted-foreground">Could not load your mail: {(digest.error as Error).message}</p>
      ) : bills.length === 0 && jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bills due or job updates.</p>
      ) : (
        <ul className="space-y-1.5 text-sm">
          {bills.map((b) => (
            <li key={b.id} className="flex items-center gap-3">
              <span data-private className="truncate flex-1 min-w-0">
                {b.from}
              </span>
              {b.amount && (
                <span data-private className="tabular-nums">
                  {b.amount}
                </span>
              )}
              <span className="text-xs shrink-0 text-muted-foreground">{dueLabel(b.dueDate!, today)}</span>
            </li>
          ))}
          {jobs.map((j) => (
            <li key={j.id} className="flex items-center gap-3">
              <span data-private className="truncate flex-1 min-w-0">
                {jobCompany(j)}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">{JOB_STATUS_LABEL[j.jobStatus ?? "update"]}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="flex items-center gap-1 text-xs text-muted-foreground group-hover:text-primary transition-colors mt-3">
        Open The Courier <ChevronRight className="w-3.5 h-3.5" />
      </p>
    </div>
  );
}
