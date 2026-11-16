import { useContext } from "react";
import { CalendarDays, CandlestickChart, CheckCircle2, FileText, Link2, Mail, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useTasks, useTransactions } from "@/contexts/AppContext";
import { linkKey, useItemLinks, useSetItemLink, type ItemLink, type LinkTarget } from "@/hooks/useItemLinks";
import { appUi } from "@/lib/appUi";
import { openExternal } from "@/lib/platform";
import { NoteNavigateContext, NotePicker } from "@/modules/tasks/TaskNoteLink";

const noteName = (path: string) => path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/i, "");

export function ItemNoteLink({ kind, itemId, title, meta, className = "" }: LinkTarget & { className?: string }) {
  const navigate = useContext(NoteNavigateContext);
  const links = useItemLinks();
  const setLink = useSetItemLink();
  const linked = links.find((l) => linkKey(l.kind, l.itemId) === linkKey(kind, itemId));
  const target = { kind, itemId, title, meta };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={linked ? `Linked note: ${noteName(linked.notePath)}` : `Link ${title} to a vault note`}
          title={linked ? `Linked to ${linked.notePath}` : "Link to a vault note"}
          onClick={(e) => e.stopPropagation()}
          className={`p-1 shrink-0 ${linked ? "text-primary" : "text-muted-foreground hover:text-primary"} ${className}`}
        >
          <Link2 className="w-3.5 h-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 space-y-2 p-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-medium text-muted-foreground">Linked note</p>
        <NotePicker value={linked?.notePath} onChange={(path) => void setLink(target, path)} />
        {linked && navigate && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            onClick={() => {
              appUi.setSelectedNotePath(linked.notePath);
              navigate("archive");
            }}
          >
            <FileText className="w-3 h-3" /> Open note
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

const KIND_ICONS = { event: CalendarDays, transaction: Wallet, trade: CandlestickChart, mail: Mail };
const KIND_LABELS = { event: "Event", transaction: "Transaction", trade: "Trade", mail: "Email" };

export function LinkedItems({ notePath }: { notePath: string }) {
  const navigate = useContext(NoteNavigateContext);
  const tasks = useTasks((all) => all.filter((t) => t.notePath === notePath));
  const transactions = useTransactions();
  const links = useItemLinks().filter((l) => l.notePath === notePath);
  if (!tasks.length && !links.length) return null;

  const open = (link: ItemLink) => {
    if (link.kind === "mail") {
      if (link.meta.url) openExternal(link.meta.url).catch(() => toast.error("Could not open the email"));
    } else if (link.kind === "transaction") {
      const tx = transactions.find((t) => t.id === link.itemId);
      if (!tx) return toast.error("That transaction no longer exists");
      appUi.setEditingTransaction(tx);
      appUi.setShowTransactionForm(true);
    } else if (link.kind === "event") {
      if (link.meta.calendarId && link.meta.date) appUi.setOpenEvent({ id: link.itemId, calendarId: link.meta.calendarId, date: link.meta.date });
      navigate?.("calendar");
    } else {
      navigate?.("trades");
    }
  };

  const row = "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-primary/10";
  return (
    <div className="mt-4">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5">Linked items</p>
      <ul>
        {tasks.map((task) => (
          <li key={task.id}>
            <button
              type="button"
              className={row}
              onClick={() => {
                appUi.setEditingTask(task);
                appUi.setShowTaskForm(true);
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-primary" />
              <span className={`truncate ${task.completed ? "line-through text-muted-foreground" : ""}`}>{task.name}</span>
              <span className="ml-auto text-xs text-muted-foreground/60">Task</span>
            </button>
          </li>
        ))}
        {links.map((link) => {
          const Icon = KIND_ICONS[link.kind];
          return (
            <li key={linkKey(link.kind, link.itemId)}>
              <button type="button" className={row} onClick={() => open(link)}>
                <Icon className="w-3.5 h-3.5 shrink-0 text-primary" />
                <span data-private className="truncate">{link.title}</span>
                <span className="ml-auto text-xs text-muted-foreground/60">{KIND_LABELS[link.kind]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
