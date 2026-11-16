import { CalendarError as AiError } from "../calendar/errors";
import { removeEnvValue, upsertEnvValue } from "../calendar/envFile";

export { AiError };

export type AiProvider = "claude" | "nim" | "omniroute";
export type AiChoice = AiProvider | "none";
export const AI_PROVIDERS: readonly AiProvider[] = ["claude", "nim", "omniroute"];

const ENV_NAMES = {
  claude: { apiKey: "ANTHROPIC_API_KEY", model: "AI_CLAUDE_MODEL" },
  nim: { apiKey: "NVIDIA_API_KEY", baseUrl: "NVIDIA_BASE_URL", model: "NVIDIA_MODEL" },
  omniroute: { apiKey: "OMNIROUTE_API_KEY", baseUrl: "OMNIROUTE_BASE_URL", model: "OMNIROUTE_MODEL" },
} as const;

type EnvName = { [P in AiProvider]: (typeof ENV_NAMES)[P][keyof (typeof ENV_NAMES)[P]] }[AiProvider];
export type AiEnv = Partial<Record<EnvName, string>>;

export const AI_DEFAULTS: Record<AiProvider, { baseUrl: string; model: string }> = {
  claude: { baseUrl: "https://api.anthropic.com/v1", model: "claude-sonnet-5-5" },
  nim: { baseUrl: "https://integrate.api.nvidia.com/v1", model: "moonshotai/kimi-k3" },
  omniroute: { baseUrl: "http://localhost:20128/v1", model: "auto/coding" },
};

const LABELS: Record<AiProvider, string> = { claude: "Claude", nim: "NVIDIA NIM", omniroute: "OmniRoute" };

export interface ProviderConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
}

export interface AiStatus {
  claude: { configured: boolean; model: string };
  nim: { configured: boolean; baseUrl: string; model: string };
  omniroute: { configured: boolean; hasKey: boolean; baseUrl: string; model: string };
}

function text(v: unknown, field: string): string | undefined {
  if (v === undefined) return undefined;
  if (v === null) return "";
  if (typeof v !== "string") throw new AiError(`${field} must be a string`);
  return v.trim();
}

export function cleanApiKey(v: unknown, label = "an API key"): string | undefined {
  const key = text(v, "apiKey");
  if (key && !/^[\w.-]{10,300}$/.test(key)) throw new AiError(`That does not look like ${label}`);
  return key;
}

export function cleanModel(v: unknown): string | undefined {
  const model = text(v, "model");
  if (model && !/^[\w.:/-]{1,120}$/.test(model)) throw new AiError("That does not look like a model id");
  return model;
}

export function cleanBaseUrl(v: unknown): string | undefined {
  const url = text(v, "baseUrl");
  if (!url) return url;
  let parsed: URL | null = null;
  // Checked raw because URL() silently drops newlines, which would land in .env.local.
  if (url.length <= 300 && !/[\s"'#\\]/.test(url)) {
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
  }
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    throw new AiError("The base URL must be an http:// or https:// address");
  }
  return url.replace(/\/+$/, "");
}

let envQueue: Promise<void> = Promise.resolve();

export function saveEnv(rootDir: string, changes: [string, string | null][]): Promise<void> {
  const run = envQueue.then(async () => {
    for (const [key, value] of changes) await (value ? upsertEnvValue(rootDir, key, value) : removeEnvValue(rootDir, key));
  });
  envQueue = run.catch(() => undefined);
  return run;
}

const asObject = (v: unknown, field: string) => {
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new AiError(`${field} must be an object`);
  return v as Record<string, unknown>;
};

export function createAiConfig(env: AiEnv, rootDir = process.cwd()) {
  const seed = (provider: AiProvider): ProviderConfig => {
    const names = ENV_NAMES[provider];
    const baseUrl = "baseUrl" in names ? env[names.baseUrl]?.trim().replace(/\/+$/, "") : "";
    return {
      apiKey: env[names.apiKey]?.trim() || undefined,
      baseUrl: baseUrl || AI_DEFAULTS[provider].baseUrl,
      model: env[names.model]?.trim() || AI_DEFAULTS[provider].model,
    };
  };
  let state: Record<AiProvider, ProviderConfig> = { claude: seed("claude"), nim: seed("nim"), omniroute: seed("omniroute") };

  const configured = (provider: AiProvider, keyOverride?: string) =>
    provider === "omniroute" ? Boolean(state.omniroute.baseUrl) : Boolean(keyOverride || state[provider].apiKey);

  function status(): AiStatus {
    return {
      claude: { configured: configured("claude"), model: state.claude.model },
      nim: { configured: configured("nim"), baseUrl: state.nim.baseUrl, model: state.nim.model },
      omniroute: { configured: configured("omniroute"), hasKey: Boolean(state.omniroute.apiKey), baseUrl: state.omniroute.baseUrl, model: state.omniroute.model },
    };
  }

  function update(patch: unknown): Promise<void> {
    const body = asObject(patch ?? {}, "body");
    const next = { claude: { ...state.claude }, nim: { ...state.nim }, omniroute: { ...state.omniroute } };
    const changes: [string, string | null][] = [];
    for (const provider of AI_PROVIDERS) {
      if (body[provider] === undefined) continue;
      const p = asObject(body[provider], provider);
      const names = ENV_NAMES[provider];
      const apiKey = cleanApiKey(p.apiKey, `a ${LABELS[provider]} API key`);
      if (apiKey !== undefined) {
        next[provider].apiKey = apiKey || undefined;
        changes.push([names.apiKey, apiKey || null]);
      }
      const baseUrl = "baseUrl" in names ? cleanBaseUrl(p.baseUrl) : undefined;
      if (baseUrl !== undefined && "baseUrl" in names) {
        next[provider].baseUrl = baseUrl || AI_DEFAULTS[provider].baseUrl;
        changes.push([names.baseUrl, baseUrl || null]);
      }
      const model = cleanModel(p.model);
      if (model !== undefined) {
        next[provider].model = model || AI_DEFAULTS[provider].model;
        changes.push([names.model, model || null]);
      }
    }
    state = next;
    return saveEnv(rootDir, changes);
  }

  return {
    rootDir,
    get: (provider: AiProvider): ProviderConfig => ({ ...state[provider] }),
    configured,
    status,
    update,
  };
}

export type AiConfig = ReturnType<typeof createAiConfig>;
