import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ListTodo, Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ThemedCombobox, type ComboboxOption } from "@/components/ui/field-controls";
import { useAppActions, useTaskCategories, useTasks } from "@/contexts/AppContext";
import { toLocalDateStr } from "@/lib/utils";
import { errorText } from "./errorText";
import { topicPath, type Topic } from "./model";
import { deadlineFor } from "./queue";
import { useObservatorySettings } from "./settings";
import { saveTopic } from "./store";
import { useUpcomingEvents } from "./useUpcomingEvents";
import { useCourses } from "./useObservatory";

const DAY = 86_400_000;
const reviewEstimate = (due: number) => Math.max(15, Math.ceil(due / 15) * 15);
const dayBefore = (date: string) => toLocalDateStr(new Date(new Date(`${date}T12:00:00`).getTime() - DAY));

function Chip({ icon: Icon, label, onRemove }: { icon: typeof ListTodo; label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-xs">
      <Icon className="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
      <span className="truncate" data-private>{label}</span>
      <button type="button" className="rounded-full p-0.5 hover:bg-muted" aria-label={`Unlink ${label}`} onClick={onRemove}>
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export function TopicLinks({ topic, due }: { topic: Topic; due: number }) {
  const { folder } = useObservatorySettings();
  const queryClient = useQueryClient();
  const tasks = useTasks();
  const categories = useTaskCategories();
  const { addTask, addTaskCategory, updateTask } = useAppActions();
  const { courses } = useCourses();
  const { events, connected } = useUpcomingEvents();
  const [busy, setBusy] = useState(false);
  const path = topicPath(folder, topic.course, topic.slug);
  const course = courses.find((e) => e.course.code === topic.course)?.course;

  const save = async (fields: Partial<Pick<Topic, "tasks" | "events">>) => {
    setBusy(true);
    try {
      await saveTopic(folder, topic.course, topic.slug, fields);
    } catch (err) {
      toast.error("Could not save the link", { description: errorText(err) });
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
    }
  };

  const known = new Set(tasks.map((t) => t.id));
  const stale = tasks.length > 0 && topic.tasks.some((id) => !known.has(id));
  useEffect(() => {
    if (stale && !busy) void save({ tasks: topic.tasks.filter((id) => known.has(id)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stale]);

  const linkedTasks = tasks.filter((t) => topic.tasks.includes(t.id));
  const linkedEvents = topic.events.map((id) => ({ id, event: events.find((e) => e.id === id) }));
  const taskOptions = useMemo<ComboboxOption[]>(
    () => tasks.filter((t) => !t.completed && !topic.tasks.includes(t.id)).map((t) => ({ value: t.id, label: t.name, hint: t.startDate })),
    [tasks, topic.tasks],
  );
  const eventOptions = useMemo<ComboboxOption[]>(
    () => events.filter((e) => !topic.events.includes(e.id)).map((e) => ({ value: e.id, label: e.summary || "(No title)", hint: e.startDate })),
    [events, topic.events],
  );

  const linkTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    await save({ tasks: [...topic.tasks, id] });
    if (task && !task.notePath) updateTask(id, { notePath: path });
  };

  const unlinkTask = async (id: string) => {
    await save({ tasks: topic.tasks.filter((t) => t !== id) });
    if (tasks.find((t) => t.id === id)?.notePath === path) updateTask(id, { notePath: undefined });
  };

  const createTask = async () => {
    setBusy(true);
    try {
      const today = toLocalDateStr();
      const deadline = course ? deadlineFor(course, topic, new Date()) : null;
      const end = deadline && dayBefore(deadline) >= today ? dayBefore(deadline) : today;
      const categoryId =
        categories.find((c) => c.name.toLowerCase() === topic.course.toLowerCase())?.id ??
        (await addTaskCategory({ name: topic.course, color: course?.color ?? "#818cf8" }));
      if (!categoryId) return;
      const id = await addTask({
        name: `Review: ${topic.title} (${topic.course})`,
        startDate: today, startTime: "", endDate: end, endTime: "",
        priority: "medium", categoryId, completed: false,
        estimateMinutes: reviewEstimate(due), notePath: path,
      });
      if (!id) return;
      await saveTopic(folder, topic.course, topic.slug, { tasks: [...topic.tasks, id] });
      toast.success(`Added "Review: ${topic.title}" to The Engine`);
    } catch (err) {
      toast.error("Could not create the task", { description: errorText(err) });
    } finally {
      setBusy(false);
      await queryClient.invalidateQueries({ queryKey: ["vault"] });
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/60 p-3">
      <div className="flex flex-wrap gap-1.5">
        {linkedTasks.map((t) => <Chip key={t.id} icon={ListTodo} label={t.name} onRemove={() => void unlinkTask(t.id)} />)}
        {linkedEvents.map(({ id, event }) => (
          <Chip key={id} icon={CalendarDays} label={event ? `${event.summary || "(No title)"} · ${event.startDate}` : "Calendar event"} onRemove={() => void save({ events: topic.events.filter((e) => e !== id) })} />
        ))}
        {!linkedTasks.length && !linkedEvents.length && <span className="text-xs text-muted-foreground">No linked tasks or events.</span>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <ThemedCombobox value="" onChange={(id) => id && void linkTask(id)} options={taskOptions} placeholder="Link task…" aria-label="Link task" className="w-44" />
        {connected && <ThemedCombobox value="" onChange={(id) => id && void save({ events: [...topic.events, id] })} options={eventOptions} placeholder="Link event…" aria-label="Link event" className="w-44" />}
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void createTask()}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Review task
        </Button>
      </div>
    </div>
  );
}
