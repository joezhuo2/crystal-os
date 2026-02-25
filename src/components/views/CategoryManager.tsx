import { useState } from "react";
import { useApp } from "@/contexts/AppContext";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Trash2, Settings } from "lucide-react";

type Mode = "task" | "financial";

interface CategoryManagerProps {
  mode: Mode;
  onClose: () => void;
}

const presetColors = [
  "hsl(239 84% 67%)", "hsl(160 84% 39%)", "hsl(340 82% 52%)",
  "hsl(45 93% 47%)", "hsl(25 95% 53%)", "hsl(200 80% 50%)",
  "hsl(280 70% 60%)", "hsl(30 60% 40%)", "hsl(10 80% 55%)",
];

export default function CategoryManager({ mode, onClose }: CategoryManagerProps) {
  const {
    taskCategories, financialCategories,
    addTaskCategory, addFinancialCategory,
    deleteTaskCategory, deleteFinancialCategory,
  } = useApp();

  const categories = mode === "task" ? taskCategories : financialCategories;
  const [name, setName] = useState("");
  const [color, setColor] = useState(presetColors[0]);

  const add = () => {
    if (!name.trim()) return;
    if (mode === "task") addTaskCategory({ name: name.trim(), color });
    else addFinancialCategory({ name: name.trim(), color });
    setName("");
  };

  const remove = (id: string) => {
    if (mode === "task") deleteTaskCategory(id);
    else deleteFinancialCategory(id);
  };

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
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="glass-card p-6 w-full max-w-md max-h-[80vh] overflow-y-auto scrollbar-thin"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <p className="text-lg font-semibold">
              {mode === "task" ? "Task" : "Financial"} Categories
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">Add or remove categories</p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Existing categories */}
        <div className="space-y-2 mb-5">
          {categories.map((cat) => (
            <div key={cat.id} className="flex items-center gap-3 p-3 rounded-lg bg-secondary/30 group">
              <div className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color }} />
              <span className="text-sm font-medium flex-1">{cat.name}</span>
              <button
                onClick={() => remove(cat.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          {categories.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No categories yet</p>
          )}
        </div>

        {/* Add new */}
        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">Add New</p>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Category name..."
            className="w-full bg-secondary/50 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary/50"
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <div>
            <p className="text-xs text-muted-foreground mb-2">Color</p>
            <div className="flex flex-wrap gap-2">
              {presetColors.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-all ${
                    color === c ? "ring-2 ring-foreground ring-offset-2 ring-offset-background scale-110" : "hover:scale-105"
                  }`}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <button
            onClick={add}
            disabled={!name.trim()}
            className="w-full bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add Category
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

export function CategoryManagerButton({ mode, label }: { mode: Mode; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="glass-card-hover px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      >
        <Settings className="w-3.5 h-3.5" />
        {label || "Categories"}
      </button>
      <AnimatePresence>
        {open && <CategoryManager mode={mode} onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
