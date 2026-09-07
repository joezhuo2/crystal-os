import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest, shouldRetry } from "@/lib/apiRequest";

const API_BASE = "/api/obsidian";

/**
 * Mirrors the server-side VaultNote in server/obsidian/vault.ts. Re-declared
 * here because that module is Node-only and must never enter the client bundle.
 */
export interface VaultNote {
  path: string;
  title: string;
  tags: string[];
  date: string | null;
  status: string | null;
  frontmatter: Record<string, unknown>;
  excerpt: string;
  mtime: number;
  size: number;
  /** Present on list/search responses. */
  score?: number;
  /** Snippet around a body match, when the note matched on its content. */
  matchContext?: string | null;
}

export interface VaultNoteDetail extends VaultNote {
  content: string;
}

export interface VaultNotesResponse {
  notes: VaultNote[];
  allTags: string[];
  total: number;
}

export interface QuickAddResult {
  ok: true;
  path: string;
  created: boolean;
  bytesWritten: number;
  /** The note's frontmatter tags after the append. */
  tags: string[];
  /** The subset of those tags this append introduced. */
  tagsAdded: string[];
}

const request = <T,>(url: string, init?: RequestInit) =>
  apiRequest<T>(url, init, "Vault API error");

export interface VaultQuery {
  q?: string;
  tag?: string;
  limit?: number;
}

function buildQuery({ q, tag, limit }: VaultQuery): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (tag) params.set("tag", tag);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Recent notes, or search/tag results when the query is populated. */
export function useVaultNotes(params: VaultQuery = {}, enabled = true) {
  return useQuery<VaultNotesResponse>({
    queryKey: ["vault", "notes", params],
    queryFn: () => request<VaultNotesResponse>(`${API_BASE}/notes${buildQuery(params)}`),
    staleTime: 30 * 1000,
    retry: shouldRetry,
    enabled,
  });
}

/** A single note including its body. */
export function useVaultNote(notePath: string | null) {
  return useQuery<VaultNoteDetail>({
    queryKey: ["vault", "note", notePath],
    queryFn: () =>
      request<VaultNoteDetail>(
        `${API_BASE}/notes?path=${encodeURIComponent(notePath as string)}`,
      ),
    enabled: !!notePath,
    staleTime: 30 * 1000,
    retry: shouldRetry,
  });
}

export interface QuickAddInput {
  text: string;
  /** Defaults to Inbox.md at the vault root when omitted. */
  notePath?: string;
  /** Merged into the target note's frontmatter tags. */
  tags?: string[];
}

/** Append text to a vault note, then refresh every vault query. */
export function useQuickAdd() {
  const queryClient = useQueryClient();

  return useMutation<QuickAddResult, Error, QuickAddInput>({
    mutationFn: (input) =>
      request<QuickAddResult>(`${API_BASE}/quick-add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}
