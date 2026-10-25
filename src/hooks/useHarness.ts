import { useEffect, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { isDesktop } from "@/lib/platform";
import { harnessNative } from "@/lib/harness/native";
import { HarnessSession } from "@/lib/harness/session";
import { harness, parseChatFile, parseStateFile } from "@/lib/harness/store";
import type { ChatMessage } from "@/lib/harness/types";

/** The one session driving every Nebula chat (desktop only). */
export const nebula = new HarnessSession(harnessNative, (title, body) => toast.success(title, { description: body }));

let sessionStarted = false;

/** Reloads what the environment check and settings depend on. */
export async function refreshHarnessEnvironment() {
  const [env, config] = await Promise.all([harnessNative.envStatus(), harnessNative.getConfig()]);
  harness.setEnv(env);
  harness.setConfig(config);
  return env;
}

/**
 * Runs once per app session, on the first Nebula visit: kills agents left over
 * from a webview reload, loads projects and chats, and checks the runtime.
 */
export function startHarnessSession() {
  if (sessionStarted || !isDesktop()) return;
  sessionStarted = true;
  harness.setPersistence({
    saveState: (json) => harnessNative.stateSave(json),
    saveChat: (id, json) => harnessNative.chatSave(id, json),
    deleteChat: (id) => harnessNative.chatDelete(id),
  });
  void (async () => {
    try {
      await nebula.start();
      if (harness.hydrate(await harnessNative.stateLoad())) {
        const ids = harness.getState().chats.map((c) => c.id);
        harness.backfillProjectTokens(await Promise.all(ids.map(async (chatId) => ({ chatId, raw: await harnessNative.chatLoad(chatId).catch(() => null) }))));
      }
      await harnessNative.onInstall((line) => harness.appendInstallLog(line));
      await refreshHarnessEnvironment();
    } catch (err) {
      console.error("[nebula] start failed", err);
      toast.error("Nebula could not start", { description: err instanceof Error ? err.message : String(err) });
    }
  })();
}

/** Loads a chat's transcript from disk the first time it is opened. */
export async function ensureChatLoaded(chatId: string) {
  if (harness.getState().runtime[chatId]?.loaded) return;
  harness.loadChat(chatId, await harnessNative.chatLoad(chatId).catch(() => null));
}

export async function installHarnessRuntime() {
  harness.setInstalling(true);
  try {
    await harnessNative.installRuntime();
    await refreshHarnessEnvironment();
    toast.success("DeepSeek Harness installed");
  } catch (err) {
    toast.error("Install failed", { description: err instanceof Error ? err.message : String(err) });
  } finally {
    harness.setInstalling(false);
  }
}

/** Subscribe a component to the shared Nebula store. */
export function useHarness() {
  return useSyncExternalStore(harness.subscribe, harness.getState);
}

/** Loads the active chat's transcript when it changes. */
export function useActiveChatLoader(chatId: string | null) {
  useEffect(() => {
    if (chatId) void ensureChatLoaded(chatId);
  }, [chatId]);
}

/**
 * Every chat with its messages, for the global search. Reads the saved files
 * directly, so it starts no agents; chats open in this session use the live store.
 */
export function useNebulaSearchIndex(enabled: boolean) {
  const { hydrated, chats, projects, runtime } = useHarness();
  const saved = useQuery({
    queryKey: ["nebula", "search-index"],
    queryFn: async () => {
      const index = parseStateFile(await harnessNative.stateLoad());
      const files = await Promise.all(index.chats.map(async (c) => [c.id, parseChatFile(await harnessNative.chatLoad(c.id).catch(() => null)).messages] as const));
      return { ...index, messages: Object.fromEntries(files) as Record<string, ChatMessage[]> };
    },
    enabled: enabled && isDesktop(),
    staleTime: 30_000,
  });
  return {
    chats: hydrated ? chats : (saved.data?.chats ?? []),
    projects: hydrated ? projects : (saved.data?.projects ?? []),
    messagesOf: (chatId: string) => (runtime[chatId]?.loaded ? runtime[chatId].messages : saved.data?.messages[chatId]),
  };
}
