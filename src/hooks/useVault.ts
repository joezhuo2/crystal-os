import { useCallback, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, apiRequest, shouldRetry } from "@/lib/apiRequest";
import { isDesktop } from "@/lib/platform";
import {
  buildVaultIndex,
  queryVaultIndex,
  type VaultIndex,
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
  readRawNoteNative,
  saveNoteNative,
  createNoteNative,
  type RawNote,
  type VaultErrorCode,
  type VaultStatus,
} from "@/lib/vaultNative";

export type { VaultNoteDetail, VaultNotesResponse, VaultQuery } from "@/lib/vaultCore";
export type { RawNote, VaultErrorCode, VaultStatus } from "@/lib/vaultNative";

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
    if (error.status === 409) return "conflict";
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

/**
 * The desktop listing: one entry for the whole vault, shared by every
 * `useVaultNotes` caller. Searches and tag filters run in JS over this index,
 * so typing never walks the vault again; only a file change refetches it.
 */
const VAULT_LISTING_KEY = ["vault", "notes"] as const;

async function loadVaultIndex(): Promise<VaultIndex> {
  return buildVaultIndex(await listNotesNative());
}

/** Recent notes, or search/tag results when the query is populated. */
export function useVaultNotes(params: VaultQuery = {}, enabled = true) {
  const desktop = isDesktop();
  const { q, tag, limit } = params;
  const select = useCallback(
    (data: VaultIndex | VaultNotesResponse) =>
      desktop ? queryVaultIndex(data as VaultIndex, { q, tag, limit }) : (data as VaultNotesResponse),
    [desktop, q, tag, limit],
  );

  return useQuery<VaultIndex | VaultNotesResponse, Error, VaultNotesResponse>({
    queryKey: desktop ? VAULT_LISTING_KEY : [...VAULT_LISTING_KEY, { q, tag, limit }],
    queryFn: desktop
      ? loadVaultIndex
      : () => request<VaultNotesResponse>(`${API_BASE}/notes${buildQuery({ q, tag, limit })}`),
    select,
    // The index is rebuilt from cached note objects on each fetch; comparing
    // thousands of notes deeply would cost more than it saves.
    structuralSharing: !desktop,
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

/**
 * A note's whole file for the editor. Fetched fresh each time editing starts
 * and kept out of the "vault" key, so live updates from disk refetch the
 * reader but never swap the text out from under someone typing.
 */
export function useRawNote(notePath: string | null) {
  return useQuery<RawNote>({
    queryKey: ["vault-edit", notePath],
    queryFn: () =>
      isDesktop()
        ? readRawNoteNative(notePath as string)
        : request<RawNote>(`${API_BASE}/raw?path=${encodeURIComponent(notePath as string)}`),
    enabled: !!notePath,
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    retry: retryVault,
  });
}

export interface SaveNoteInput {
  path: string;
  content: string;
  /** The mtime the edit started from; a newer file on disk fails with `conflict`. */
  expectedMtime: number;
}

/** Replace a note's file, then refresh every vault query. */
export function useSaveNote() {
  const queryClient = useQueryClient();

  return useMutation<{ path: string; mtime: number }, Error, SaveNoteInput>({
    mutationFn: (input) =>
      isDesktop()
        ? saveNoteNative(input)
        : request<{ path: string; mtime: number }>(`${API_BASE}/note`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(input),
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}

export interface CreateNoteInput {
  path: string;
  content: string;
  /** Replace the note if it exists. When false an existing note fails with `conflict`. */
  overwrite: boolean;
}

/** Write a new note (or replace one, with `overwrite`), then refresh every vault query. */
export function useCreateNote() {
  const queryClient = useQueryClient();

  return useMutation<{ path: string; mtime: number; created: boolean }, Error, CreateNoteInput>({
    mutationFn: (input) => createVaultNote(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["vault"] });
    },
  });
}

/** The same write outside React, for the Orbit's auto-export. */
export function createVaultNote(input: CreateNoteInput) {
  return isDesktop()
    ? createNoteNative(input)
    : request<{ path: string; mtime: number; created: boolean }>(`${API_BASE}/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
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
 * Desktop only: refresh the listing and any changed open note when files
 * change on disk, so the Archive follows edits made in Obsidian without a
 * manual refresh. Mount once.
 */
export function useVaultLiveUpdates() {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isDesktop()) return;
    return onVaultChanged(({ paths, rootMissing }) => {
      if (rootMissing) {
        queryClient.invalidateQueries({ queryKey: ["vault"] });
        return;
      }
      // The listing, plus any open note that changed. Other open notes and
      // the vault status stay cached.
      queryClient.invalidateQueries({ queryKey: VAULT_LISTING_KEY, exact: true });
      for (const path of paths) {
        queryClient.invalidateQueries({ queryKey: ["vault", "note", path], exact: true });
      }
    });
  }, [queryClient]);
}
