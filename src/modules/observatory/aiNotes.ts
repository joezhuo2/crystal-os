import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { fetchRawNote, useVaultNotes } from "@/hooks/useVault";
import { parseFrontmatter } from "@/lib/vaultNative";
import { useObservatorySettings } from "./settings";

export interface AiNote { path: string; title: string; kind: string; status: string; source: string; day: string; mtime: number }
export interface AiFilter { kind?: string | string[]; source?: string; status?: string }

const ALL = { limit: 10000 };
const text = (v: unknown) => (typeof v === "string" ? v : "");

export const aiBody = (raw: string) => parseFrontmatter(raw).content.replace(/^\s*# .*(\r?\n)+/, "").trim();
export const readAiBody = async (path: string) => aiBody((await fetchRawNote(path)).content);
export const aiBodyKey = (path: string) => ["vault", "observatory-ai", path];

export function useAiNotes(code: string, { kind, source, status }: AiFilter, enabled = true): AiNote[] {
  const { folder } = useObservatorySettings();
  const { data } = useVaultNotes(ALL, enabled);
  const kinds = [kind ?? []].flat().join("\n");
  return useMemo(() => {
    const prefix = `${folder}/${code}/_ai/`;
    const wanted = kinds ? kinds.split("\n") : null;
    return (data?.notes ?? [])
      .filter((n) => n.path.startsWith(prefix) && n.path.endsWith(".md") && !n.path.slice(prefix.length).includes("/"))
      .map((n) => ({
        path: n.path, title: n.title, kind: text(n.frontmatter.kind), status: n.status ?? "", source: text(n.frontmatter.source),
        day: /(\d{4}-\d{2}-\d{2})/.exec(n.path.slice(prefix.length))?.[1] ?? "", mtime: n.mtime,
      }))
      .filter((n) => (!wanted || wanted.includes(n.kind)) && (source === undefined || n.source === source) && (!status || n.status === status))
      .sort((a, b) => b.mtime - a.mtime);
  }, [data, folder, code, kinds, source, status]);
}

export function useAiBodies(paths: string[]): Record<string, string> {
  return useQueries({
    queries: paths.map((path) => ({ queryKey: aiBodyKey(path), queryFn: () => readAiBody(path) })),
    combine: (results) => Object.fromEntries(paths.flatMap((p, i) => (results[i]?.data != null ? [[p, results[i]!.data!]] : []))),
  });
}
