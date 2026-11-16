import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/ui/number-input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { TimeField } from "@/components/ui/field-controls";
import { AiModelInput, AiProviderSelect, CommitInput } from "@/components/AiAreaFields";
import {
  setObservatoryAiModel,
  setObservatoryAiProvider,
  setObservatoryAiThreshold,
  setObservatoryDeepSkyFolders,
  setObservatoryDailyGoal,
  setObservatoryFlag,
  setObservatoryFolder,
  setObservatoryIdleMinutes,
  setObservatoryKeywordSort,
  setObservatoryNewPerDay,
  setObservatoryReminderTime,
  setObservatoryRetention,
  useObservatorySettings,
} from "./settings";

export default function ObservatoryFolderInput() {
  const { folder } = useObservatorySettings();
  const [draft, setDraft] = useState(folder);
  useEffect(() => setDraft(folder), [folder]);

  const commit = () => {
    setObservatoryFolder(draft);
  };

  return (
    <Input
      className="h-8 w-56"
      aria-label="Observatory folder"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function ObservatoryRetentionSlider() {
  const { retention } = useObservatorySettings();
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? retention;
  return (
    <div className="flex items-center gap-3">
      <Slider
        className="w-40"
        min={0.7}
        max={0.99}
        step={0.01}
        value={[shown]}
        onValueChange={([v]) => setDraft(v!)}
        onValueCommit={([v]) => {
          setObservatoryRetention(v!);
          setDraft(null);
        }}
        aria-label="FSRS target retention"
      />
      <span className="w-10 text-right text-sm tabular-nums">{Math.round(shown * 100)}%</span>
    </div>
  );
}

function NumberSetting({ value, label, min, max, onCommit }: { value: number; label: string; min: number; max: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() && Number.isFinite(n)) onCommit(n);
    setDraft(String(value));
  };

  return (
    <NumberInput
      className="h-8 w-20"
      aria-label={label}
      min={min}
      max={max}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
    />
  );
}

export function ObservatoryNewPerDayInput() {
  const { newPerDay } = useObservatorySettings();
  return <NumberSetting value={newPerDay} label="New cards per day per course" min={0} max={100} onCommit={setObservatoryNewPerDay} />;
}

export function ObservatoryDailyGoalInput() {
  const { dailyGoal } = useObservatorySettings();
  return <NumberSetting value={dailyGoal} label="Daily goal" min={1} max={20} onCommit={setObservatoryDailyGoal} />;
}

export function ObservatoryKeywordSortSwitch() {
  const { keywordSort } = useObservatorySettings();
  return <Switch checked={keywordSort} onCheckedChange={setObservatoryKeywordSort} aria-label="Sort PDFs by keywords" />;
}

export function ObservatoryFlagSwitch({ flag, label, needsAi }: { flag: Parameters<typeof setObservatoryFlag>[0]; label: string; needsAi?: boolean }) {
  const settings = useObservatorySettings();
  return (
    <Switch
      checked={settings[flag]}
      onCheckedChange={(on) => setObservatoryFlag(flag, on)}
      disabled={needsAi && settings.aiProvider === "none"}
      aria-label={label}
    />
  );
}

export function ObservatoryAiProvider() {
  const { aiProvider } = useObservatorySettings();
  return <AiProviderSelect value={aiProvider} onChange={setObservatoryAiProvider} label="Observatory AI provider" />;
}

export function ObservatoryAiModel() {
  const { aiProvider, aiModel } = useObservatorySettings();
  return <AiModelInput provider={aiProvider} value={aiModel} onCommit={setObservatoryAiModel} label="Observatory AI model" />;
}

export function ObservatoryAiThresholdSlider() {
  const { aiThreshold, aiProvider } = useObservatorySettings();
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? aiThreshold;
  return (
    <div className="flex items-center gap-3">
      <Slider
        className="w-40"
        min={0.5}
        max={0.95}
        step={0.01}
        value={[shown]}
        disabled={aiProvider === "none"}
        onValueChange={([v]) => setDraft(v!)}
        onValueCommit={([v]) => {
          setObservatoryAiThreshold(v!);
          setDraft(null);
        }}
        aria-label="AI sorting confidence threshold"
      />
      <span className="w-10 text-right text-sm tabular-nums">{Math.round(shown * 100)}%</span>
    </div>
  );
}

export function ObservatoryDeepSkyFolders() {
  const { deepSkyFolders, aiProvider } = useObservatorySettings();
  return (
    <CommitInput
      value={deepSkyFolders.join(", ")}
      onCommit={(v) => setObservatoryDeepSkyFolders(v.split(","))}
      label="Deep Sky project folders"
      placeholder="Projects, Code/Apps"
      disabled={aiProvider === "none"}
    />
  );
}

export function ObservatoryIdleInput() {
  const { idleMinutes } = useObservatorySettings();
  return <NumberSetting value={idleMinutes} label="Idle timeout in minutes" min={1} max={60} onCommit={setObservatoryIdleMinutes} />;
}

export function ObservatoryReminderTime() {
  const { reminderTime } = useObservatorySettings();
  return <TimeField className="w-32" value={reminderTime} aria-label="Review reminder time" onChange={(v) => v && setObservatoryReminderTime(v)} />;
}
