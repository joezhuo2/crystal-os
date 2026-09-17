import { Coins, Folder, Settings2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { nebula } from "@/hooks/useHarness";
import { harness } from "@/lib/harness/store";
import { formatTokens, totalOf } from "@/lib/harness/tokenLedger";
import { EFFORTS, MODES, TIERS, type ChatMeta, type Effort, type Ledger, type Tier } from "@/lib/harness/types";
import NebulaThemeControls from "./NebulaThemeControls";
import TokenPanel from "./TokenPanel";

interface Props {
  chat: ChatMeta;
  projectPath: string;
  projectName: string;
  running: boolean;
  chatTokens: Ledger;
  projectTokens: Ledger;
  allTime: Ledger;
  claudeModel: string;
  /** The Medium fallback chain, from the configured model ids. */
  mediumChain: string;
}

/** Folder, model tier, effort, mode, tokens, and the look popover for one chat. */
export default function NebulaToolbar({ chat, projectPath, projectName, running, chatTokens, projectTokens, allTime, claudeModel, mediumChain }: Props) {
  // A chat with no usage yet (e.g. just opened from its folder) shows what the project has used.
  const showProject = Object.keys(chatTokens).length === 0;
  const total = totalOf(showProject ? projectTokens : chatTokens);

  const setTier = (tier: Tier) => {
    if (!harness.setChatOptions(chat.id, { tier })) return;
  };
  const setEffort = (effort: Effort) => {
    if (harness.setChatOptions(chat.id, { effort }) && chat.tier === "high") nebula.restartClaude(chat.id);
  };

  return (
    <div className="nebula-panel flex flex-wrap items-center gap-2 px-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-white/60" title={projectPath}>
        <Folder className="h-3.5 w-3.5 shrink-0 text-[var(--nebula-a)]" />
        <span className="max-w-[16rem] truncate">{projectPath}</span>
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-2">
        <div className="nebula-segmented" role="radiogroup" aria-label="Model tier">
          {TIERS.map((tier) => (
            <Tooltip key={tier.id}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={chat.tier === tier.id}
                  disabled={running}
                  data-active={chat.tier === tier.id || undefined}
                  onClick={() => setTier(tier.id)}
                >
                  {tier.label}
                </button>
              </TooltipTrigger>
              <TooltipContent>{running ? "Wait for the turn to finish" : tier.id === "high" ? `Claude Code (${claudeModel})` : tier.id === "medium" ? mediumChain : tier.hint}</TooltipContent>
            </Tooltip>
          ))}
        </div>

        <Select value={chat.effort} onValueChange={(v) => setEffort(v as Effort)} disabled={running}>
          <SelectTrigger className="h-8 w-[8.5rem] text-xs" aria-label="Thinking effort">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EFFORTS.map((e) => (
              <SelectItem key={e.id} value={e.id} className="text-xs">
                Effort: {e.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={chat.mode} onValueChange={(v) => void nebula.setMode(chat.id, v as ChatMeta["mode"])}>
          <SelectTrigger className="h-8 w-[7.5rem] text-xs" aria-label="Permission mode">
            <span className="flex items-center gap-1.5">
              {chat.mode === "auto" && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" title="Runs tools without asking" />}
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {MODES.map((m) => (
              <SelectItem key={m.id} value={m.id} className="text-xs">
                <span className="font-medium">{m.label}</span>
                <span className="ml-2 text-muted-foreground">{m.hint}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger className="nebula-chip" aria-label={showProject ? "Project token usage" : "Chat token usage"} title={showProject ? `Tokens used in ${projectName}` : "Tokens used in this chat"}>
            <Coins className="h-3.5 w-3.5" />
            <span className="text-white/50">{showProject ? "Project" : "Chat"}</span>
            <span className="tabular-nums">
              {total.estimated ? "≈" : ""}
              {formatTokens(total.input + total.output)}
            </span>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            collisionPadding={12}
            className="w-max min-w-80 max-w-[min(36rem,var(--radix-popover-content-available-width))] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto overscroll-contain"
          >
            <TokenPanel chatTokens={chatTokens} projectTokens={projectTokens} projectName={projectName} allTime={allTime} />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger className="nebula-chip" aria-label="Nebula look">
            <Settings2 className="h-3.5 w-3.5" />
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <NebulaThemeControls />
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
