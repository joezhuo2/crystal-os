import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  List,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Repeat,
  Trash2,
  Unplug,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { toLocalDateStr } from "@/lib/utils";
import { DateField, ThemedSelect, TimeField } from "@/components/ui/field-controls";
import { useApp } from "@/contexts/AppContext";
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
import { buttonVariants } from "@/components/ui/button";
import {
  type CalendarEvent,
  type EventScope,
  type RecurrenceFreq,
  buildRecurrence,
  localTimeZone,
  parseRecurrence,
  useCalendarEvents,
  useCalendarList,
  useCalendarStatus,
  useCreateEvent,
  useDeleteEvent,
  useDisconnectCalendar,
  useUpdateEvent,
} from "@/hooks/useGoogleCalendar";

const CALENDAR_STORAGE_KEY = "crystal-os-google-calendar";
const DEFAULT_COLOR = "hsl(239 84% 67%)";
const AGENDA_DAYS = 30;
const DAY_MS = 86400000;

const FIELD_CLASS =
  "w-full bg-secondary/50 rounded-lg px-3 py-2.5 text-sm outline-none focus:ring-1 focus:ring-primary/50";

/* ── date helpers ── */

/** Events span whole days inclusively, so a date lands inside [start, end]. */
function eventFallsOnDate(event: CalendarEvent, dateStr: string): boolean {
  return event.startDate <= dateStr && event.endDate >= dateStr;
}

function formatTime(time: string): string {
  if (!time) return "";
  return new Date(`2000-01-01T${time}:00`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDayHeading(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

/** The one-line "when" label used on every event row. */
function eventTimeLabel(event: CalendarEvent): string {
  if (event.allDay) {
    return event.startDate === event.endDate
      ? "All day"
      : `All day · through ${event.endDate}`;
  }
  const span = `${formatTime(event.startTime)} – ${formatTime(event.endTime)}`;
  return event.startDate === event.endDate ? span : `${span} (${event.endDate})`;
}

/* ── connect / error states ── */

function ConnectPanel({
  configured,
  message,
  isLoading,
}: {
  configured: boolean;
  message?: string;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="glass-card p-6 space-y-3">
        <div className="w-1/3 h-4 rounded bg-primary/10 animate-pulse" />
        <div className="w-2/3 h-3 rounded bg-primary/10 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="glass-card p-8 text-center space-y-4">
      <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
      <div className="space-y-1">
        <p className="text-sm font-semibold">
          {configured
            ? "Google Calendar is not connected"
            : "Google Calendar is not configured"}
        </p>
        {message && (
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            {message}
          </p>
        )}
      </div>

      {configured ? (
        <a
          href="/api/calendar/auth/start"
          className="inline-flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
        >
          <CalendarDays className="w-4 h-4" />
          Connect Google Calendar
        </a>
      ) : (
        <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
          Set <code>GOOGLE_CLIENT_ID</code> and{" "}
          <code>GOOGLE_CLIENT_SECRET</code> in <code>.env.local</code>, then
          restart the dev server. See <code>.env.example</code> for the full
          list of keys.
        </p>
      )}
    </div>
  );
}

/* ── event row ── */

function EventRow({
  event,
  color,
  onEdit,
  onDelete,
}: {
  event: CalendarEvent;
  color: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="group flex items-start gap-3 p-3 rounded-lg bg-secondary/30">
      <div
        className="w-1 self-stretch min-h-[2rem] rounded-full shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{event.summary}</p>
        <p className="text-[10px] text-muted-foreground">
          {eventTimeLabel(event)}
        </p>
        {event.location && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">{event.location}</span>
          </p>
        )}
        {event.recurringEventId && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
            <Repeat className="w-3 h-3 shrink-0" />
            Repeating event
          </p>
        )}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {event.htmlLink && (
          <a
            href={event.htmlLink}
            target="_blank"
            rel="noreferrer"
            title="Open in Google Calendar"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
        <button
          onClick={onEdit}
          title="Edit event"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          title="Delete event"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ── month grid ── */

function MonthGrid({
  currentDate,
  events,
  color,
  onPrev,
  onNext,
  onSelectDay,
}: {
  currentDate: Date;
  events: CalendarEvent[];
  color: string;
  onPrev: () => void;
  onNext: () => void;
  onSelectDay: (dateStr: string) => void;
}) {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = toLocalDateStr();

  const days = useMemo(() => {
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) arr.push(null);
    for (let i = 1; i <= daysInMonth; i++) arr.push(i);
    return arr;
  }, [firstDay, daysInMonth]);

  const getDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const countFor = (day: number) =>
    events.filter((e) => eventFallsOnDate(e, getDateStr(day))).length;

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold">
          {currentDate.toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}
        </h2>
        <div className="flex gap-1">
          <button
            onClick={onPrev}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={onNext}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <p key={d} className="text-[10px] text-muted-foreground text-center py-1">
            {d}
          </p>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;
          const dateStr = getDateStr(day);
          const count = countFor(day);
          const isToday = dateStr === today;

          return (
            <button
              key={day}
              onClick={() => onSelectDay(dateStr)}
              className={`relative aspect-square flex flex-col items-center justify-center rounded-lg text-sm transition-all hover:bg-secondary/50 ${
                isToday ? "ring-1 ring-primary bg-primary/10 font-semibold" : ""
              }`}
              style={
                count > 3
                  ? {
                      boxShadow: `0 0 12px hsl(239 84% 67% / ${Math.min(count * 0.1, 0.5)})`,
                    }
                  : undefined
              }
            >
              {day}
              {count > 0 && (
                <div className="flex gap-1 mt-0.5">
                  {Array.from({ length: Math.min(count, 3) }).map((_, j) => (
                    <div
                      key={j}
                      className="w-2 h-2 rounded-full"
                      style={{ background: color, boxShadow: `0 0 4px ${color}` }}
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ── agenda ── */

function AgendaList({
  events,
  color,
  onEdit,
  onDelete,
}: {
  events: CalendarEvent[];
  color: string;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of [...events].sort((a, b) =>
      a.startISO.localeCompare(b.startISO),
    )) {
      const list = map.get(event.startDate) ?? [];
      list.push(event);
      map.set(event.startDate, list);
    }
    return [...map.entries()];
  }, [events]);

  if (groups.length === 0) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-sm text-muted-foreground">
          Nothing scheduled in the next {AGENDA_DAYS} days.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {groups.map(([dateStr, dayEvents]) => (
        <div key={dateStr} className="glass-card p-5">
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-3">
            {formatDayHeading(dateStr)}
          </p>
          <div className="space-y-2">
            {dayEvents.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                color={color}
                onEdit={() => onEdit(event)}
                onDelete={() => onDelete(event)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── day modal ── */

function DayPanel({
  date,
  events,
  color,
  onClose,
  onCreate,
  onEdit,
  onDelete,
}: {
  date: string;
  events: CalendarEvent[];
  color: string;
  onClose: () => void;
  onCreate: () => void;
  onEdit: (event: CalendarEvent) => void;
  onDelete: (event: CalendarEvent) => void;
}) {
  const dayEvents = events
    .filter((e) => eventFallsOnDate(e, date))
    .sort((a, b) => a.startISO.localeCompare(b.startISO));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "hsl(222 47% 11% / 0.8)" }}
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.95 }}
        className="glass-card p-6 w-full max-w-md max-h-[80vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-lg font-semibold">{formatDayHeading(date)}</p>
            <p className="text-xs text-muted-foreground">
              {dayEvents.length} {dayEvents.length === 1 ? "event" : "events"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {dayEvents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            No events scheduled
          </p>
        ) : (
          <div className="space-y-2">
            {dayEvents.map((event) => (
              <EventRow
                key={event.id}
                event={event}
                color={color}
                onEdit={() => onEdit(event)}
                onDelete={() => onDelete(event)}
              />
            ))}
          </div>
        )}

        <button
          onClick={onCreate}
          className="w-full mt-4 flex items-center justify-center gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg py-2.5 text-sm font-medium transition-colors"
        >
          <Plus className="w-4 h-4" />
          New event on this day
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ── create / edit form ── */

function EventForm({
  calendarId,
  editingEvent,
  defaultDate,
  onClose,
}: {
  calendarId: string;
  editingEvent: CalendarEvent | null;
  defaultDate: string;
  onClose: () => void;
}) {
  const create = useCreateEvent();
  const update = useUpdateEvent();
  const initialRecurrence = parseRecurrence(editingEvent?.recurrence ?? null);

  const [form, setForm] = useState({
    summary: editingEvent?.summary ?? "",
    description: editingEvent?.description ?? "",
    location: editingEvent?.location ?? "",
    allDay: editingEvent?.allDay ?? false,
    startDate: editingEvent?.startDate || defaultDate,
    startTime: editingEvent?.startTime || "09:00",
    endDate: editingEvent?.endDate || defaultDate,
    endTime: editingEvent?.endTime || "10:00",
    freq: initialRecurrence.freq as RecurrenceFreq,
    until: initialRecurrence.until,
  });
  const [scope, setScope] = useState<EventScope>("single");
  // An instance carries no RRULE of its own, so leaving recurrence untouched
  // must send `undefined` — sending null would wipe the whole series.
  const [recurrenceTouched, setRecurrenceTouched] = useState(false);

  const isSeriesInstance = Boolean(editingEvent?.recurringEventId);
  const showRecurrence = !isSeriesInstance || scope === "all";
  const pending = create.isPending || update.isPending;
  const error = create.error ?? update.error;
  const valid = form.summary.trim().length > 0;

  const submit = () => {
    if (!valid || pending) return;

    const recurrence =
      !showRecurrence || (isSeriesInstance && !recurrenceTouched)
        ? undefined
        : buildRecurrence(form.freq, form.until || undefined);

    const input = {
      summary: form.summary,
      description: form.description,
      location: form.location,
      allDay: form.allDay,
      startDate: form.startDate,
      startTime: form.allDay ? "" : form.startTime,
      endDate: form.endDate,
      endTime: form.allDay ? "" : form.endTime,
      timeZone: localTimeZone(),
      recurrence,
    };

    if (editingEvent) {
      update.mutate(
        {
          calendarId,
          eventId: editingEvent.id,
          scope,
          recurringEventId: editingEvent.recurringEventId,
          input,
        },
        {
          onSuccess: () => {
            toast.success("Event updated", {
              description:
                scope === "all" ? "Applied to every occurrence." : undefined,
            });
            onClose();
          },
        },
      );
    } else {
      create.mutate(
        { calendarId, input },
        {
          onSuccess: () => {
            toast.success("Event created");
            onClose();
          },
        },
      );
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={pending ? undefined : onClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", bounce: 0.2, duration: 0.4 }}
        className="glass-card p-6 space-y-4 w-full max-w-md relative z-10 max-h-[85vh] overflow-y-auto scrollbar-thin"
      >
        <div className="flex items-center justify-between">
          <p className="text-lg font-semibold">
            {editingEvent ? "Edit Event" : "New Event"}
          </p>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <input
          autoFocus
          value={form.summary}
          onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
          placeholder="Event title..."
          className={FIELD_CLASS}
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />

        {isSeriesInstance && (
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground block">
              This change applies to
            </label>
            <div className="flex glass-card p-0.5 rounded-lg">
              {(
                [
                  ["single", "This event"],
                  ["all", "All events"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setScope(value)}
                  className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    scope === value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {scope === "all" && (
              <p className="text-[10px] text-muted-foreground">
                Editing the series moves every occurrence, including past ones.
              </p>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={form.allDay}
            onChange={(e) => setForm((f) => ({ ...f, allDay: e.target.checked }))}
            className="accent-primary w-3.5 h-3.5"
          />
          All day
        </label>

        <div className="space-y-2">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              Start
            </label>
            <div className="flex gap-1">
              <DateField
                value={form.startDate}
                aria-label="Start date"
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    startDate: v,
                    endDate: f.endDate < v ? v : f.endDate,
                  }))
                }
                className="flex-1"
              />
              {!form.allDay && (
                <TimeField
                  value={form.startTime}
                  aria-label="Start time"
                  onChange={(v) => setForm((f) => ({ ...f, startTime: v }))}
                  className="flex-1 px-2"
                />
              )}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">End</label>
            <div className="flex gap-1">
              <DateField
                value={form.endDate}
                aria-label="End date"
                min={form.startDate}
                onChange={(v) => setForm((f) => ({ ...f, endDate: v }))}
                className="flex-1"
              />
              {!form.allDay && (
                <TimeField
                  value={form.endTime}
                  aria-label="End time"
                  onChange={(v) => setForm((f) => ({ ...f, endTime: v }))}
                  className="flex-1 px-2"
                />
              )}
            </div>
          </div>
        </div>

        <input
          value={form.location}
          onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
          placeholder="Location (optional)"
          className={FIELD_CLASS}
        />

        <textarea
          value={form.description}
          onChange={(e) =>
            setForm((f) => ({ ...f, description: e.target.value }))
          }
          placeholder="Description (optional)"
          rows={3}
          className={`${FIELD_CLASS} resize-none scrollbar-thin`}
        />

        {showRecurrence && (
          <div className="flex gap-2">
            <ThemedSelect
              value={form.freq}
              aria-label="Repeat"
              onChange={(v) => {
                setRecurrenceTouched(true);
                setForm((f) => ({ ...f, freq: v as RecurrenceFreq }));
              }}
              options={[
                { value: "NONE", label: "Does not repeat" },
                { value: "DAILY", label: "Daily" },
                { value: "WEEKLY", label: "Weekly" },
                { value: "MONTHLY", label: "Monthly" },
                { value: "YEARLY", label: "Yearly" },
              ]}
              className="flex-1"
            />
            {form.freq !== "NONE" && (
              <DateField
                value={form.until}
                min={form.startDate}
                clearable
                placeholder="Repeat until…"
                title="Repeat until (optional)"
                aria-label="Repeat until"
                onChange={(v) => {
                  setRecurrenceTouched(true);
                  setForm((f) => ({ ...f, until: v }));
                }}
                className="flex-1"
              />
            )}
          </div>
        )}

        {error && (
          // Keep the dialog open on failure so nothing typed is ever lost.
          <div className="flex items-start gap-2 rounded-lg p-3 bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{error.message}</p>
          </div>
        )}

        <button
          onClick={submit}
          disabled={!valid || pending}
          className="w-full flex items-center justify-center bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-lg py-2.5 text-sm font-medium transition-colors"
        >
          {pending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {editingEvent ? "Save Changes" : "Add Event"}
        </button>
      </motion.div>
    </motion.div>
  );
}

/* ── delete confirmation ── */

function DeleteEventDialog({
  calendarId,
  event,
  onClose,
}: {
  calendarId: string;
  event: CalendarEvent;
  onClose: () => void;
}) {
  const remove = useDeleteEvent();
  const isSeriesInstance = Boolean(event.recurringEventId);

  const confirm = (scope: EventScope) => {
    remove.mutate(
      {
        calendarId,
        eventId: event.id,
        scope,
        recurringEventId: event.recurringEventId,
      },
      {
        onSuccess: () => {
          toast.success("Event deleted", {
            description:
              scope === "all" ? "Every occurrence was removed." : undefined,
          });
          onClose();
        },
      },
    );
  };

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete “{event.summary}”?</AlertDialogTitle>
          <AlertDialogDescription>
            {isSeriesInstance
              ? "This is part of a repeating event. Choose whether to remove just this occurrence or the whole series. This cannot be undone."
              : "This removes the event from your Google Calendar. This cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {remove.error && (
          <div className="flex items-start gap-2 rounded-lg p-3 bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{remove.error.message}</p>
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
          {isSeriesInstance ? (
            <>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirm("single");
                }}
                disabled={remove.isPending}
                className={buttonVariants({ variant: "destructive" })}
              >
                This event
              </AlertDialogAction>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  confirm("all");
                }}
                disabled={remove.isPending}
                className={buttonVariants({ variant: "destructive" })}
              >
                All events
              </AlertDialogAction>
            </>
          ) : (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                confirm("single");
              }}
              disabled={remove.isPending}
              className={buttonVariants({ variant: "destructive" })}
            >
              {remove.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Delete
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/* ── page ── */

export default function CalendarPage() {
  const status = useCalendarStatus();
  const connected = Boolean(status.data?.connected);
  const { showEventForm, setShowEventForm } = useApp();

  const [view, setView] = useState<"month" | "agenda">("month");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [formState, setFormState] = useState<{
    open: boolean;
    event: CalendarEvent | null;
    date: string;
  }>({ open: false, event: null, date: toLocalDateStr() });
  const [deleteTarget, setDeleteTarget] = useState<CalendarEvent | null>(null);

  const [calendarId, setCalendarId] = useState(() => {
    try {
      return localStorage.getItem(CALENDAR_STORAGE_KEY) ?? "primary";
    } catch {
      return "primary";
    }
  });

  const calendars = useCalendarList(connected);
  const disconnect = useDisconnectCalendar();

  const selectCalendar = (id: string) => {
    setCalendarId(id);
    try {
      localStorage.setItem(CALENDAR_STORAGE_KEY, id);
    } catch {
      /* ignore localStorage errors */
    }
  };

  const range = useMemo(() => {
    if (view === "agenda") {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return {
        timeMin: start.toISOString(),
        timeMax: new Date(start.getTime() + AGENDA_DAYS * DAY_MS).toISOString(),
      };
    }
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    return {
      timeMin: new Date(year, month, 1).toISOString(),
      timeMax: new Date(year, month + 1, 1).toISOString(),
    };
  }, [view, currentDate]);

  const eventsQuery = useCalendarEvents({ calendarId, ...range }, connected);
  const events = eventsQuery.data?.events ?? [];

  const activeCalendar = calendars.data?.calendars.find(
    (c) => c.id === calendarId,
  );
  const color = activeCalendar?.backgroundColor || DEFAULT_COLOR;

  const openCreate = (date: string) =>
    setFormState({ open: true, event: null, date });
  const openEdit = (event: CalendarEvent) =>
    setFormState({ open: true, event, date: event.startDate });
  const closeForm = () => setFormState((s) => ({ ...s, open: false }));

  // The command palette can request the create form from any tab; the request
  // lands here once this page mounts. Wait for the status query to settle so a
  // still-loading `connected === false` does not swallow it, then clear the
  // request either way so it cannot fire again on a later visit.
  useEffect(() => {
    if (!showEventForm || status.isPending) return;
    setShowEventForm(false);
    if (connected) openCreate(toLocalDateStr());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showEventForm, connected, status.isPending]);

  if (!connected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <ConnectPanel
          configured={Boolean(status.data?.configured)}
          message={status.data?.error ?? status.error?.message}
          isLoading={status.isLoading}
        />
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex glass-card p-0.5 rounded-lg">
          <button
            onClick={() => setView("month")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "month"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5 inline mr-1" />
            Month
          </button>
          <button
            onClick={() => setView("agenda")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              view === "agenda"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="w-3.5 h-3.5 inline mr-1" />
            Agenda
          </button>
        </div>

        {(calendars.data?.calendars.length ?? 0) > 1 && (
          <ThemedSelect
            value={calendarId}
            aria-label="Calendar"
            onChange={selectCalendar}
            options={(calendars.data?.calendars ?? []).map((c) => ({
              value: c.id,
              label: c.summary,
            }))}
            className="glass-card w-auto max-w-[14rem] bg-transparent px-3 py-1.5 text-xs font-medium hover:bg-white/5"
          />
        )}

        <button
          onClick={() => openCreate(toLocalDateStr())}
          className="flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Event
        </button>

        <div className="flex items-center gap-2 ml-auto">
          {eventsQuery.isFetching && (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
          )}
          {status.data?.account && (
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              {status.data.account}
            </span>
          )}
          <button
            onClick={() => {
              disconnect.mutate(undefined, {
                onSuccess: () => toast.success("Google Calendar disconnected"),
              });
            }}
            disabled={disconnect.isPending}
            title="Disconnect Google Calendar"
            className="glass-card-hover px-2.5 py-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors"
          >
            <Unplug className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {eventsQuery.isError && (
        <div className="glass-card p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <p className="text-xs text-destructive">
            {eventsQuery.error.message}
          </p>
        </div>
      )}

      {view === "month" ? (
        <MonthGrid
          currentDate={currentDate}
          events={events}
          color={color}
          onPrev={() =>
            setCurrentDate(
              new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1),
            )
          }
          onNext={() =>
            setCurrentDate(
              new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1),
            )
          }
          onSelectDay={setSelectedDay}
        />
      ) : (
        <AgendaList
          events={events}
          color={color}
          onEdit={openEdit}
          onDelete={setDeleteTarget}
        />
      )}

      <AnimatePresence>
        {selectedDay && (
          <DayPanel
            date={selectedDay}
            events={events}
            color={color}
            onClose={() => setSelectedDay(null)}
            onCreate={() => openCreate(selectedDay)}
            onEdit={openEdit}
            onDelete={setDeleteTarget}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {formState.open && (
          <EventForm
            // Remount on target change so the form state re-initialises.
            key={formState.event?.id ?? `new-${formState.date}`}
            calendarId={calendarId}
            editingEvent={formState.event}
            defaultDate={formState.date}
            onClose={closeForm}
          />
        )}
      </AnimatePresence>

      {deleteTarget && (
        <DeleteEventDialog
          calendarId={calendarId}
          event={deleteTarget}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </motion.div>
  );
}
