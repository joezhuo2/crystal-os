import { useMemo } from "react";
import { CalendarDays, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ThemedCombobox, type ComboboxOption } from "@/components/ui/field-controls";
import { errorText } from "./errorText";
import type { Course } from "./model";
import { useObservatorySettings } from "./settings";
import { saveCourse } from "./store";
import { useUpcomingEvents } from "./useUpcomingEvents";

export function ExamEventLink({ course, index }: { course: Course; index: number }) {
  const { folder } = useObservatorySettings();
  const queryClient = useQueryClient();
  const { events, connected } = useUpcomingEvents();
  const exam = course.exams[index]!;
  const linked = exam.event_id ? events.find((e) => e.id === exam.event_id) : undefined;
  const options = useMemo<ComboboxOption[]>(() => events.map((e) => ({ value: e.id, label: e.summary || "(No title)", hint: e.startDate })), [events]);

  const link = async (eventId: string | null) => {
    const event = eventId ? events.find((e) => e.id === eventId) : undefined;
    const exams = course.exams.map((x, i) => {
      if (i !== index) return x;
      const { event_id: _old, ...rest } = x;
      return event ? { ...rest, event_id: event.id, date: event.startDate } : rest;
    });
    try {
      await saveCourse(folder, { ...course, exams });
      if (event) toast.success(`${exam.name} linked to ${event.summary || "the event"}`, { description: `Date set to ${event.startDate}. Its topics now count down to it.` });
    } catch (err) {
      toast.error("Could not link the exam", { description: errorText(err) });
    } finally {
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
    }
  };

  if (!connected) return null;
  if (exam.event_id)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <CalendarDays className="h-3 w-3 text-primary" aria-hidden="true" />
        <span data-private>{linked?.summary ?? "Linked event"}</span>
        <button type="button" className="rounded-full p-0.5 hover:bg-muted" aria-label={`Unlink the event from ${exam.name}`} onClick={() => void link(null)}>
          <X className="h-3 w-3" />
        </button>
      </span>
    );
  return <ThemedCombobox value="" onChange={(id) => id && void link(id)} options={options} placeholder="Link event…" aria-label={`Link an event to ${exam.name}`} className="h-6 w-32 text-xs" />;
}
