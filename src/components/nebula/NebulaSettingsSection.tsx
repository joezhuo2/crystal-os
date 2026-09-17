import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, KeyRound, Loader2, Plug, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { refreshHarnessEnvironment, startHarnessSession, useHarness } from "@/hooks/useHarness";
import { harnessNative } from "@/lib/harness/native";
import { harness } from "@/lib/harness/store";
import type { NebulaConfig } from "@/lib/harness/types";
import NebulaThemeControls from "./NebulaThemeControls";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5 py-3 first:pt-0 last:pb-0">
      <span className="text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

function KeyField({ provider, label, configured }: { provider: "nvidia" | "omniroute"; label: string; configured: boolean }) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (key: string | null) => {
    setBusy(true);
    try {
      const keys = await harnessNative.setKey(provider, key);
      const env = harness.getState().env;
      if (env) harness.setEnv({ ...env, keys });
      setValue("");
      toast.success(key ? `${label} key saved` : `${label} key removed`);
    } catch (err) {
      toast.error("Could not save the key", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Field label={`${label} API key`} hint={configured ? "Saved. Keys stay in Crystal OS's DeepSeek Harness folder and are never shown again." : "Not set."}>
      <div className="flex gap-2">
        <Input type="password" autoComplete="off" value={value} onChange={(e) => setValue(e.target.value)} placeholder={configured ? "••••••••  (enter a new key to replace)" : "Paste key"} />
        <Button onClick={() => void save(value)} disabled={busy || !value.trim()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
        </Button>
        {configured && (
          <Button variant="ghost" onClick={() => void save(null)} disabled={busy}>
            Remove
          </Button>
        )}
      </div>
    </Field>
  );
}

/** Settings → Nebula: keys, models, folders, MCP servers, look. */
export default function NebulaSettingsSection() {
  const { config, env, discovery } = useHarness();
  const [draft, setDraft] = useState<NebulaConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    startHarnessSession();
  }, []);
  useEffect(() => {
    if (config) setDraft(config);
  }, [config]);

  const discover = async () => {
    setDiscovering(true);
    try {
      harness.setDiscovery(await harnessNative.discover());
    } catch (err) {
      toast.error("Could not read Claude's MCP servers", { description: String(err) });
    } finally {
      setDiscovering(false);
    }
  };
  useEffect(() => {
    void discover();
  }, []);

  if (!draft || !env) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </p>
    );
  }

  const set = (patch: Partial<NebulaConfig>) => setDraft({ ...draft, ...patch });
  const dirty = JSON.stringify(draft) !== JSON.stringify(config);

  const save = async (next = draft) => {
    setSaving(true);
    try {
      await harnessNative.setConfig(next);
      await refreshHarnessEnvironment();
      toast.success("Nebula settings saved", { description: "New chats use them; running engines pick them up on their next turn." });
      // A mistyped id is otherwise only noticed when Medium silently skips it.
      const probe = await harnessNative.probe("nvidia").catch(() => null);
      if (probe?.missingModels.length) {
        toast.warning("NVIDIA NIM does not list some Medium models", {
          description: `${probe.missingModels.join(", ")} will be skipped. Check the exact ids (for example z-ai/glm-5.3).`,
          duration: 10_000,
        });
      }
    } catch (err) {
      toast.error("Could not save", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  };

  const toggleServer = (name: string, enabled: boolean) => {
    const disabledMcp = enabled ? draft.disabledMcp.filter((n) => n !== name) : [...draft.disabledMcp, name];
    const next = { ...draft, disabledMcp };
    setDraft(next);
    void save(next).then(discover);
  };

  const pickRoot = async () => {
    const path = await harnessNative.pickFolder(draft.projectsRoot).catch(() => null);
    if (path) set({ projectsRoot: path });
  };

  return (
    <div className="space-y-6">
      <div className="divide-y divide-white/[0.06]">
        <KeyField provider="nvidia" label="NVIDIA NIM" configured={env.keys.nvidia} />
        <KeyField provider="omniroute" label="OmniRoute" configured={env.keys.omniroute} />
      </div>

      <div className="divide-y divide-white/[0.06]">
        <Field label="OmniRoute endpoint" hint="Low tier, and Medium's last resort.">
          <div className="flex gap-2">
            <Input value={draft.omnirouteBaseUrl} onChange={(e) => set({ omnirouteBaseUrl: e.target.value })} />
            <Input className="w-40" value={draft.omnirouteModel} onChange={(e) => set({ omnirouteModel: e.target.value })} aria-label="OmniRoute model" />
          </div>
        </Field>
        <Field label="Medium tier models (NVIDIA NIM, in order)" hint="The first one that answers is used.">
          <div className="space-y-2">
            <Input value={draft.nimModels.kimi} onChange={(e) => set({ nimModels: { ...draft.nimModels, kimi: e.target.value } })} aria-label="Medium model 1" placeholder="1st choice, e.g. z-ai/glm-5.3" />
            <Input value={draft.nimModels.deepseek} onChange={(e) => set({ nimModels: { ...draft.nimModels, deepseek: e.target.value } })} aria-label="Medium model 2" placeholder="2nd choice" />
            <Input value={draft.nimModels.nemotron} onChange={(e) => set({ nimModels: { ...draft.nimModels, nemotron: e.target.value } })} aria-label="Medium model 3" placeholder="3rd choice" />
          </div>
        </Field>
        <Field label="High tier Claude model" hint="An alias (opus, sonnet) or a full model id. High always uses your Claude account directly, not OmniRoute.">
          <Input value={draft.claudeModel} onChange={(e) => set({ claudeModel: e.target.value })} />
        </Field>
        <Field label="Projects folder" hint="Where “New project” creates folders.">
          <div className="flex gap-2">
            <Input value={draft.projectsRoot} onChange={(e) => set({ projectsRoot: e.target.value })} />
            <Button variant="secondary" onClick={() => void pickRoot()}>
              Browse…
            </Button>
          </div>
        </Field>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => void save()} disabled={!dirty || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
          Save
        </Button>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Plug className="h-4 w-4 text-primary" /> MCP servers shared from Claude
          </p>
          <Button size="sm" variant="ghost" onClick={() => void discover()} disabled={discovering}>
            <RefreshCw className={`mr-2 h-3.5 w-3.5 ${discovering ? "animate-spin" : ""}`} /> Rescan
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Read from Claude Desktop, Claude Code, and your enabled plugins. claude.ai connectors (Gmail, Calendar…) sign in on claude.ai and cannot be shared.
        </p>
        {discovery?.servers.length === 0 && <p className="text-xs text-muted-foreground">No local MCP servers found.</p>}
        <ul className="divide-y divide-white/[0.06]">
          {discovery?.servers.map((server) => (
            <li key={server.name} className="flex items-center gap-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  {server.name} <span className="text-xs text-muted-foreground">· {server.source}</span>
                </p>
                {server.reason && <p className="text-xs text-amber-400 [overflow-wrap:anywhere]">{server.reason}</p>}
                {server.envKeys.length > 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    <KeyRound className="mr-1 inline h-3 w-3" />
                    {server.envKeys.join(", ")}
                  </p>
                )}
              </div>
              <Switch
                checked={!draft.disabledMcp.includes(server.name)}
                disabled={server.status === "unsupported" || server.status === "unavailable" || saving}
                onCheckedChange={(on) => toggleServer(server.name, on)}
                aria-label={`Share ${server.name}`}
              />
            </li>
          ))}
        </ul>
        {discovery && discovery.skillDirs.length > 0 && (
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            Skills shared from {discovery.skillDirs.length} folder{discovery.skillDirs.length === 1 ? "" : "s"}, including {discovery.skillDirs[0]}.
          </p>
        )}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Look</p>
        <NebulaThemeControls />
      </div>
    </div>
  );
}
