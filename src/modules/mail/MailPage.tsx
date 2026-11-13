import { useEffect, useState, type ElementType, type ReactNode } from "react";
import { m } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, Briefcase, Mail, Package, RefreshCw, Receipt, ShieldAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonLines } from "@/components/ui/dashboard-skeletons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useDisconnectMail, useMailDigest, useMailStatus, useRefreshMailDigest } from "@/hooks/useMail";
import { isDesktop, openExternal } from "@/lib/platform";
import { toLocalDateStr } from "@/lib/utils";
import {
  JOB_STATUS_LABEL,
  PROVIDER_LABEL,
  dueLabel,
  isOverdue,
  jobCompany,
  latestJobs,
  mailSummary,
  newestFirst,
  relativeDate,
  sortBills,
  startMailAuth,
  type MailAccount,
  type MailItem,
  type MailProvider,
  type MailStatus,
} from "@/lib/mail";

const MISSING_ENV: Record<MailProvider, string[]> = {
  google: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  microsoft: ["MICROSOFT_CLIENT_ID"],
};

const CONNECTABLE = ["google"] as const;

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function openMailLink(e: React.MouseEvent, url: string) {
  if (!isDesktop()) return;
  e.preventDefault();
  openExternal(url).catch((err) => toast.error("Could not open the email", { description: errorText(err) }));
}

function ConnectButtons({ status }: { status: MailStatus }) {
  const [error, setError] = useState<string | null>(null);

  async function connect(provider: MailProvider) {
    setError(null);
    try {
      const { url } = await startMailAuth(provider);
      await openExternal(url);
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {CONNECTABLE.map((p) => (
          <Button key={p} size="sm" onClick={() => connect(p)} disabled={!status.providers[p]?.configured}>
            <Mail /> Connect {PROVIDER_LABEL[p]}
          </Button>
        ))}
      </div>
      {CONNECTABLE
        .filter((p) => !status.providers[p]?.configured)
        .map((p) => (
          <p key={p} className="text-xs text-muted-foreground">
            {PROVIDER_LABEL[p]} needs {MISSING_ENV[p].map((v, i) => <span key={v}>{i > 0 && " and "}<code>{v}</code></span>)} in <code>.env.local</code>.
          </p>
        ))}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function Accounts({ status }: { status: MailStatus }) {
  const disconnect = useDisconnectMail();
  const [pending, setPending] = useState<MailAccount | null>(null);

  const confirm = () => {
    if (!pending) return;
    const account = pending;
    setPending(null);
    disconnect.mutate(account.id, {
      onSuccess: () => toast.success(`Disconnected ${account.email}`),
      onError: (err) => toast.error("Could not disconnect the account", { description: err.message }),
    });
  };

  return (
    <div className="glass-card p-5 space-y-4">
      <p className="text-xs text-muted-foreground uppercase tracking-widest">Accounts</p>
      <ul className="space-y-2">
        {status.accounts.map((a) => (
          <li key={a.id} className="flex items-center gap-3 text-sm">
            <span className="text-xs text-muted-foreground w-14 shrink-0">{PROVIDER_LABEL[a.provider]}</span>
            <span className="truncate flex-1 min-w-0">{a.email}</span>
            <Button size="sm" variant="ghost" onClick={() => setPending(a)} disabled={disconnect.isPending}>
              Disconnect
            </Button>
          </li>
        ))}
      </ul>
      <ConnectButtons status={status} />
      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {pending?.email}?</AlertDialogTitle>
            <AlertDialogDescription>The Courier stops reading this mailbox. Your email itself is not touched.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} className={buttonVariants({ variant: "destructive" })}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ItemRow({ item, now, showAccount, children }: { item: MailItem; now: Date; showAccount: boolean; children?: ReactNode }) {
  return (
    <li>
      <a
        href={item.url}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => openMailLink(e, item.url)}
        className={`flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 transition-colors ${item.confident ? "" : "opacity-60"}`}
      >
        <div className="flex-1 min-w-0">
          <p data-private className="text-sm font-medium truncate">
            {item.subject || "(no subject)"}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            <span data-private>{item.from}</span> · {relativeDate(item.receivedAt, now)}
            {showAccount && ` · ${item.account}`}
            {!item.confident && <span className="ml-1.5 rounded border border-border px-1 text-[10px] uppercase tracking-wide">unsure</span>}
          </p>
        </div>
        {children}
      </a>
    </li>
  );
}

function Card({ title, icon: Icon, empty, children }: { title: string; icon: ElementType; empty: boolean; children: ReactNode }) {
  return (
    <section className="glass-card-hover p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs text-muted-foreground uppercase tracking-widest">{title}</h2>
        <Icon className="w-4 h-4 text-primary" aria-hidden />
      </div>
      {empty ? <p className="text-sm text-muted-foreground">Nothing in the last 30 days.</p> : <ul className="space-y-0.5 max-h-96 overflow-y-auto scrollbar-thin">{children}</ul>}
    </section>
  );
}

function Dashboard({ status }: { status: MailStatus }) {
  const digest = useMailDigest(status.accounts);
  const refresh = useRefreshMailDigest(status.accounts);
  const now = new Date();
  const today = toLocalDateStr(now);
  const showAccount = status.accounts.length > 1;
  const data = digest.data;

  const header = (
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div>
        <h1 className="text-lg font-semibold">The Courier</h1>
        <p className="text-xs text-muted-foreground">
          {status.ai.configured ? `Unsure emails are checked by Claude (${status.ai.model})` : "Keyword sorting only"}
          {data && ` · Updated ${relativeDate(data.generatedAt, now)}`}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={() => refresh.mutate(undefined, { onError: (err) => toast.error("Could not refresh mail", { description: err.message }) })}
        disabled={refresh.isPending || digest.isLoading}
      >
        <RefreshCw className={refresh.isPending ? "animate-spin" : ""} /> Refresh
      </Button>
    </div>
  );

  if (digest.isLoading) {
    return (
      <>
        {header}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card p-5">
              <SkeletonLines count={4} />
            </div>
          ))}
        </div>
      </>
    );
  }

  if (digest.isError || !data) {
    return (
      <>
        {header}
        <div role="alert" className="glass-card p-6 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          Could not load your mail: {errorText(digest.error)}
        </div>
      </>
    );
  }

  const summary = mailSummary(data.items, now);
  const bills = sortBills(data.items);
  const jobs = latestJobs(data.items);
  const orders = newestFirst(data.items, "order");
  const security = newestFirst(data.items, "security");
  const row = (item: MailItem, extra?: ReactNode) => (
    <ItemRow key={item.id} item={item} now={now} showAccount={showAccount}>
      {extra}
    </ItemRow>
  );

  return (
    <>
      {header}
      {data.errors.length > 0 && (
        <ul role="alert" className="glass-card p-4 space-y-1 text-xs text-amber-400">
          {data.errors.map((e) => (
            <li key={e.accountId} className="flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              Could not read {e.account}: {e.message}
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          ["Bills due in 7 days", summary.billsDue],
          ["Active applications", summary.activeJobs],
          ["Orders this week", summary.orders],
          ["Security alerts this week", summary.security],
        ].map(([label, count]) => (
          <div key={label} className="glass-card p-4">
            <p className="text-2xl font-bold tabular-nums">{count}</p>
            <p className="text-xs text-muted-foreground">{label}</p>
          </div>
        ))}
      </div>
      {data.items.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-muted-foreground">No bills, job applications, orders or security alerts in the last 30 days.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Bills & payments" icon={Receipt} empty={bills.length === 0}>
            {bills.map((b) =>
              row(
                b,
                <div className="text-right shrink-0">
                  {b.amount && (
                    <p data-private className="text-sm font-semibold tabular-nums">
                      {b.amount}
                    </p>
                  )}
                  {b.dueDate && <p className={`text-xs ${isOverdue(b, today) ? "text-red-400 font-medium" : "text-muted-foreground"}`}>{dueLabel(b.dueDate, today)}</p>}
                </div>,
              ),
            )}
          </Card>
          <Card title="Job applications" icon={Briefcase} empty={jobs.length === 0}>
            {jobs.map((j) =>
              row(
                { ...j, from: jobCompany(j) },
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${j.jobStatus === "rejected" ? "bg-red-400/10 text-red-400" : j.jobStatus === "offer" || j.jobStatus === "interview" ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"}`}>
                  {JOB_STATUS_LABEL[j.jobStatus ?? "update"]}
                </span>,
              ),
            )}
          </Card>
          <Card title="Orders & deliveries" icon={Package} empty={orders.length === 0}>
            {orders.map((o) => row(o))}
          </Card>
          <Card title="Security alerts" icon={ShieldAlert} empty={security.length === 0}>
            {security.map((s) => row(s))}
          </Card>
        </div>
      )}
    </>
  );
}

export default function MailPage() {
  const status = useMailStatus();
  const { refetch } = status;

  useEffect(() => {
    const onFocus = () => void refetch();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refetch]);

  return (
    <m.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      {status.isLoading ? (
        <div className="glass-card p-6">
          <SkeletonLines count={3} />
        </div>
      ) : status.isError || !status.data ? (
        <div role="alert" className="glass-card p-6 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
          Could not reach The Courier: {errorText(status.error)}
        </div>
      ) : status.data.accounts.length === 0 ? (
        <div className="glass-card p-8 text-center space-y-4">
          <Mail className="w-8 h-8 text-primary mx-auto" aria-hidden />
          <div className="space-y-1">
            <p className="text-sm font-semibold">Connect an email account</p>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              The Courier reads Gmail to pick out bills, job applications, orders and security alerts. It only reads mail.
            </p>
          </div>
          <div className="flex justify-center text-left">
            <ConnectButtons status={status.data} />
          </div>
        </div>
      ) : (
        <>
          <Dashboard status={status.data} />
          <Accounts status={status.data} />
        </>
      )}
    </m.div>
  );
}
