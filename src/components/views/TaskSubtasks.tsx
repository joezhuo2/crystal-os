import { useState } from "react";
import { Check, CornerLeftUp, GripVertical, ListChecks, Pencil, Plus, X } from "lucide-react";
import type { Task } from "@/contexts/AppContext";
import { describeProgress, makeItem, moveItem, taskDrag, type ChecklistItem } from "@/lib/subtasks";
import { formatEstimate } from "@/lib/capacity";


/** Data type for reordering checklist items, so task drop targets ignore it. */
const ITEM_DRAG_TYPE = "application/x-crystal-checklist-item";

/**
 * A checklist: tick, rename (click the text), drag to reorder, delete, and add.
 * Controlled: every change comes back through `onChange` as the whole list.
 */
export function ChecklistEditor({ items, onChange }: { items: ChecklistItem[]; onChange: (items: ChecklistItem[]) => void }) {
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const add = () => {
    const item = makeItem(draft);
    if (!item) return;
    onChange([...items, item]);
    setDraft("");
  };

  const startRename = (item: ChecklistItem) => {
    setEditing(item.id);
    setEditText(item.text);
  };

  // A rename cleared to nothing keeps the old text; delete is the X.
  const commitRename = (item: ChecklistItem) => {
    setEditing(null);
    const text = editText.trim();
    if (text && text !== item.text) onChange(items.map((i) => (i.id === item.id ? { ...i, text } : i)));
  };

  const endDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  return (
    <div className="space-y-1">
      <ul className="space-y-0.5" aria-label="Checklist">
        {items.map((item, index) => (
          <li
            key={item.id}
            onDragOver={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              e.stopPropagation();
              setOverIndex(index);
            }}
            onDrop={(e) => {
              if (dragIndex === null) return;
              e.preventDefault();
              e.stopPropagation();
              onChange(moveItem(items, dragIndex, index));
              endDrag();
            }}
            className={`flex items-center gap-2 group/item rounded-md px-1 py-0.5 ${
              overIndex === index && dragIndex !== index ? "bg-primary/10" : ""
            }`}
          >
            <span
              draggable
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData(ITEM_DRAG_TYPE, item.id);
                e.dataTransfer.effectAllowed = "move";
                setDragIndex(index);
              }}
              onDragEnd={endDrag}
              aria-hidden="true"
              className="cursor-grab text-muted-foreground/40 opacity-0 group-hover/item:opacity-100 transition-opacity"
            >
              <GripVertical className="w-3 h-3" />
            </span>
            <button
              type="button"
              role="checkbox"
              aria-checked={item.done}
              aria-label={item.text}
              onClick={() => onChange(items.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)))}
              className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                item.done ? "bg-accent border-accent" : "border-muted-foreground/40 hover:border-primary"
              }`}
            >
              {item.done && <Check className="w-2.5 h-2.5 text-accent-foreground" />}
            </button>
            {editing === item.id ? (
              <input
                autoFocus
                value={editText}
                aria-label="Rename item"
                onChange={(e) => setEditText(e.target.value)}
                onBlur={() => commitRename(item)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitRename(item);
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setEditing(null);
                  }
                }}
                className="flex-1 min-w-0 bg-secondary/50 rounded px-1.5 py-0.5 text-xs outline-none focus:ring-1 focus:ring-primary/50"
              />
            ) : (
              <span
                onClick={() => startRename(item)}
                title="Click to rename"
                className={`flex-1 min-w-0 text-xs truncate cursor-text ${item.done ? "line-through text-muted-foreground" : ""}`}
              >
                {item.text}
              </span>
            )}
            <button
              type="button"
              onClick={() => onChange(items.filter((i) => i.id !== item.id))}
              aria-label={`Delete ${item.text}`}
              className="opacity-0 group-hover/item:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
            >
              <X className="w-3 h-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2 px-1">
        <Plus className="w-3 h-3 text-muted-foreground/60 shrink-0" />
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              add();
            }
          }}
          onBlur={add}
          placeholder="Add checklist item"
          aria-label="Add checklist item"
          className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
        />
      </div>
    </div>
  );
}

/** "+3 subtasks", green once all are done. Nothing for a task without subtasks. */
export function SubtaskChip({ open, total }: { open: number; total: number }) {
  const text = describeProgress({ open, total });
  if (!text) return null;
  const done = open === 0;
  return (
    <span
      title={`${total - open} of ${total} subtasks done`}
      className={`text-[10px] flex items-center gap-0.5 tabular-nums shrink-0 ${done ? "text-emerald-400" : "text-muted-foreground"}`}
    >
      <ListChecks className="w-2.5 h-2.5" />
      {text}
    </span>
  );
}

/** A child task inside its expanded parent: tick, edit, and move back to the top level. */
export function ChildTaskRow({
  task,
  onToggle,
  onEdit,
  onPromote,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onPromote: () => void;
}) {
  return (
    <div
      draggable={!task.completed}
      onDragStart={(e) => {
        e.stopPropagation();
        e.dataTransfer.setData("text/plain", task.id);
        taskDrag.id = task.id;
      }}
      onDragEnd={() => {
        taskDrag.id = null;
      }}
      className={`flex items-center gap-2 group/child rounded-md px-1 py-1 hover:bg-secondary/30 ${
        task.completed ? "opacity-50" : "cursor-grab active:cursor-grabbing"
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={task.completed ? `Reopen ${task.name}` : `Complete ${task.name}`}
        className={`w-3.5 h-3.5 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          task.completed ? "bg-accent border-accent" : "border-muted-foreground/40 hover:border-primary"
        }`}
      >
        {task.completed && <Check className="w-2 h-2 text-accent-foreground" />}
      </button>
      <span className={`flex-1 min-w-0 text-xs font-medium truncate ${task.completed ? "line-through" : ""}`}>{task.name}</span>
      <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
        {task.startDate}
        {task.estimateMinutes ? ` · ${formatEstimate(task.estimateMinutes)}` : ""}
      </span>
      <button
        type="button"
        onClick={onPromote}
        title="Move to top level"
        aria-label={`Move ${task.name} to top level`}
        className="opacity-0 group-hover/child:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
      >
        <CornerLeftUp className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={`Edit ${task.name}`}
        className="opacity-0 group-hover/child:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
