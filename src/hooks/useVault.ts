import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest, shouldRetry } from "@/lib/apiRequest";
import { isDesktop } from "@/lib/platform";
import {
  queryNotes,
  type QuickAddResult as CoreQuickAddResult,
  type VaultNote as CoreVaultNote,
  type VaultNoteDetail,
  type VaultNotesResponse,
  type VaultQuery,
} from "@/lib/vaultCore";
import {
  NativeVaultError,
  getVaultStatus,
  listNotesNative,
  onVaultChanged,
  pickVault,
  quickAddNative,
  readNoteNative,
  type VaultErrorCode,
  type VaultStatus,
} from "@/lib/vaultNative";

export type { VaultNoteDetail, VaultNotesResponse, VaultQuery } from "@/lib/vaultCore";
export type { VaultErrorCode, VaultStatus } from "@/lib/vaultNative";

export interface VaultNote extends CoreVaultNote {
  /** Present on list/search responses. */
  score?: number;
  /** Snippet around a body match, when the note matched on its content. */
  matchContext?: string | null;
}

/**
 * Two backends behind one set of hooks. The web app talks to the
 * `/api/obsidian` middleware. The desktop app reads the vault natively through
 * Rust (src/lib/vaultNative.ts), so the vault is picked in-app rather than set
 * in `.env.local`, and updates arrive as file events.
 */

const API_BASE = "/api/obsidian";

export interface QuickAddResult extends CoreQuickAddResult {
  ok: true;
}

const request = <T,>(url: string, init?: RequestInit) =>
  apiRequest<T>(url, init, "Vault API error");

function buildQuery({ q, tag, limit }: VaultQuery): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (tag) params.set("tag", tag);
  if (limit) params.set("limit", String(limit));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** A stable code for vault errors from either backend, when one applies. */
export function vaultErrorCode(error: unknown): VaultErrorCode | null {
  if (error instanceof NativeVaultError) return error.code;
  if (error instanceof ApiError) {
    if (error.status === 404) return "not_found";
    if (error.status === 503) return "not_configured";
  }
  return null;
}

/** Codes that another attempt cannot fix; the user has to act. */
const PERMANENT: VaultErrorCode[] = [
  "not_configured",
  "missing",
  "permission_denied",
  "not_found",
  "invalid_path",
];

function retryVault(failureCount: number, error: unknown): boolean {
  if (error instanceof NativeVaultError && PERMANENT.includes(error.code)) return false;
  return shouldRetry(failureCount, error);
}

/** Recent notes, or search/tag results when the query is populated. */
export function useVaultNotes(params: VaultQuery = {}, enabled = true) {
  return useQuery<VaultNotesResponse>({
    queryKey: ["vault", "notes", params],
    queryFn: async () =>
      isDesktop()
        ? queryNotes(await listNotesNative(), params)
        : request<VaultNotesResponse>(`${API_BASE}/notes${buildQuery(params)}`),
    staleTime: 30 * 1000,
    retry: retryVault,
    enabled,
  });
}

/** A single note including its body. */
export function useVaultNote(notePath: string | null) {
  return useQuery<VaultNoteDetail>({
    queryKey: ["vault", "note", notePath],
    queryFn: () =>
      isDesktop()
        ? readNoteNative(notePath as string)
        : request<VaultNoteDetail>(
            `${API_BASE}/notes?path=${encodeURIComponent(notePath as string)}`,
          ),
    enabled: !!notePath,
    staleTime: 30 * 1000,
    retry: retryVault,
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
      isDesktop()
        ? quickAddNative(input)
        : request<QuickAddResult>(`${API_BASE}/quick-add`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}

/** Desktop only: which folder is the vault, and whether it can be read. */
export function useVaultStatus() {
  return useQuery<VaultStatus>({
    queryKey: ["vault", "status"],
    queryFn: getVaultStatus,
    enabled: isDesktop(),
    staleTime: 30 * 1000,
  });
}

/** Desktop only: open the native folder picker and switch vaults. */
export function usePickVault() {
  const queryClient = useQueryClient();

  return useMutation<VaultStatus | null, Error, void>({
    mutationFn: () => pickVault(),
    onSuccess: (status) => {
      if (status) queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}

/**
 * Desktop only: refresh vault queries when notes change on disk, so the
 * Archive follows edits made in Obsidian without a manual refresh. Mount once.
 */
export function useVaultLiveUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDesktop()) return;
    return onVaultChanged(() => {
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    });
  }, [queryClient]);
}
