import { AI_PROVIDERS, AiError, type AiConfig, type AiProvider } from "./config";

export type ChatPart = { type: "text"; text: string } | { type: "image"; mediaType: "image/png" | "image/jpeg"; data: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string | ChatPart[];
}

export interface ChatInput {
  provider: AiProvider;
  model?: string;
  apiKey?: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
}

const MAX_TOKENS = 8192;
const DEFAULT_TOKENS = 2048;
const LABELS: Record<AiProvider, string> = { claude: "Claude", nim: "NVIDIA NIM", omniroute: "OmniRoute" };
const MISSING: Record<AiProvider, string> = {
  claude: "No Claude API key is set. Add one in Settings → AI.",
  nim: "No NVIDIA NIM API key is set. Add one in Settings → AI.",
  omniroute: "No OmniRoute endpoint is set. Add one in Settings → AI.",
};

function parsePart(raw: unknown): ChatPart {
  const p = (raw ?? {}) as Record<string, unknown>;
  if (p.type === "text" && typeof p.text === "string") return { type: "text", text: p.text };
  if (
    p.type === "image" &&
    (p.mediaType === "image/png" || p.mediaType === "image/jpeg") &&
    typeof p.data === "string" &&
    /^[A-Za-z0-9+/]+=*$/.test(p.data)
  ) {
    return { type: "image", mediaType: p.mediaType, data: p.data };
  }
  throw new AiError("Each content part must be text or a base64 PNG/JPEG image");
}

export function parseChatInput(body: unknown): Omit<ChatInput, "apiKey"> {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!AI_PROVIDERS.includes(b.provider as AiProvider)) throw new AiError("provider must be claude, nim or omniroute");
  if (b.model !== undefined && (typeof b.model !== "string" || (b.model && !/^[\w.:/-]{1,120}$/.test(b.model)))) {
    throw new AiError("That does not look like a model id");
  }
  if (b.system !== undefined && typeof b.system !== "string") throw new AiError("system must be a string");
  if (b.maxTokens !== undefined && !Number.isInteger(b.maxTokens)) throw new AiError("maxTokens must be a whole number");
  if (!Array.isArray(b.messages) || b.messages.length === 0) throw new AiError("messages must be a non-empty array");
  const messages = b.messages.map((raw): ChatMessage => {
    const m = (raw ?? {}) as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "assistant") throw new AiError("Each message role must be user or assistant");
    if (typeof m.content === "string") return { role: m.role, content: m.content };
    if (!Array.isArray(m.content) || m.content.length === 0) throw new AiError("Each message needs text or content parts");
    return { role: m.role, content: m.content.map(parsePart) };
  });
  return {
    provider: b.provider as AiProvider,
    model: b.model as string | undefined,
    system: b.system as string | undefined,
    maxTokens: b.maxTokens as number | undefined,
    messages,
  };
}

function claudeContent(content: ChatMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((p) =>
    p.type === "text" ? p : { type: "image", source: { type: "base64", media_type: p.mediaType, data: p.data } },
  );
}

function openAiContent(content: ChatMessage["content"]) {
  if (typeof content === "string") return content;
  return content.map((p) =>
    p.type === "text" ? p : { type: "image_url", image_url: { url: `data:${p.mediaType};base64,${p.data}` } },
  );
}

function errorMessage(data: unknown): string | undefined {
  const d = (data ?? {}) as { error?: { message?: unknown } | string; detail?: unknown; message?: unknown };
  const msg = typeof d.error === "string" ? d.error : d.error?.message ?? d.detail ?? d.message;
  return typeof msg === "string" ? msg.slice(0, 300) : undefined;
}

export async function chat(ai: AiConfig, input: ChatInput): Promise<{ text: string }> {
  const { provider } = input;
  const config = ai.get(provider);
  const apiKey = input.apiKey || config.apiKey;
  if (!ai.configured(provider, input.apiKey)) throw new AiError(MISSING[provider]);
  const model = input.model || config.model;
  const maxTokens = Math.min(MAX_TOKENS, Math.max(1, input.maxTokens ?? DEFAULT_TOKENS));

  const request: { url: string; headers: Record<string, string>; body: unknown } =
    provider === "claude"
      ? {
          url: `${config.baseUrl}/messages`,
          headers: { "x-api-key": apiKey as string, "anthropic-version": "2023-06-01", "content-type": "application/json" },
          body: {
            model,
            max_tokens: maxTokens,
            ...(input.system ? { system: input.system } : {}),
            messages: input.messages.map((m) => ({ role: m.role, content: claudeContent(m.content) })),
          },
        }
      : {
          url: `${config.baseUrl}/chat/completions`,
          headers: { "content-type": "application/json", ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
          body: {
            model,
            max_tokens: maxTokens,
            messages: [
              ...(input.system ? [{ role: "system", content: input.system }] : []),
              ...input.messages.map((m) => ({ role: m.role, content: openAiContent(m.content) })),
            ],
          },
        };

  let res: Response;
  try {
    res = await fetch(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(request.body) });
  } catch (err) {
    throw new AiError(`Could not reach ${LABELS[provider]}: ${err instanceof Error ? err.message : String(err)}`, 502);
  }
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    throw new AiError(`${LABELS[provider]} request failed (${res.status})${errorMessage(data) ? `: ${errorMessage(data)}` : ""}`, 502);
  }
  if (provider === "claude") {
    const content = (data as { content?: { type: string; text?: string }[] } | null)?.content ?? [];
    return { text: content.map((c) => (c.type === "text" ? c.text ?? "" : "")).join("") };
  }
  const message = (data as { choices?: { message?: { content?: unknown } }[] } | null)?.choices?.[0]?.message?.content;
  return { text: typeof message === "string" ? message : "" };
}
