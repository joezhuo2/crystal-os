import { Download, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { installHarnessRuntime, refreshHarnessEnvironment, useHarness } from "@/hooks/useHarness";

/** Shown until Node.js and the pinned DeepSeek Harness runtime are ready. */
export default function NebulaSetupCard() {
  const { env, installing, installLog } = useHarness();
  if (!env) {
    return (
      <div className="nebula-panel flex items-center gap-3 p-6 text-sm text-white/70">
        <Loader2 className="h-4 w-4 animate-spin" />
        Checking Node.js, Claude Code, and DeepSeek Harness…
      </div>
    );
  }
  return (
    <div className="nebula-panel mx-auto max-w-xl space-y-4 p-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold">Set up the Nebula</h3>
        <p className="text-sm text-white/60">Low and Medium run on DeepSeek Harness {env.dshVersion}. It installs once into Crystal OS's own folder and does not touch ~/.dsh.</p>
      </div>
      <ul className="space-y-1.5 text-sm">
        <li className={env.node ? "text-emerald-300" : "text-amber-300"}>{env.node ? `✓ Node.js found` : "✗ Node.js not found — install Node.js 22 or newer, then check again"}</li>
        <li className={env.claude ? "text-emerald-300" : "text-white/50"}>{env.claude ? "✓ Claude Code found (High tier)" : "– Claude Code not found (only needed for High)"}</li>
        <li className={env.runtimeInstalled ? "text-emerald-300" : "text-white/70"}>{env.runtimeInstalled ? "✓ DeepSeek Harness installed" : "– DeepSeek Harness not installed"}</li>
      </ul>
      <div className="flex gap-2">
        <Button onClick={() => void installHarnessRuntime()} disabled={!env.node || installing}>
          {installing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          {installing ? "Installing…" : "Install DeepSeek Harness"}
        </Button>
        <Button variant="ghost" onClick={() => void refreshHarnessEnvironment()} disabled={installing}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Check again
        </Button>
      </div>
      {installLog.length > 0 && (
        <pre className="max-h-48 overflow-auto rounded-lg bg-black/50 p-3 text-[11px] leading-relaxed text-white/60 scrollbar-thin">{installLog.join("\n")}</pre>
      )}
    </div>
  );
}
