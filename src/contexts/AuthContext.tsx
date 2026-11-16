import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  LOCAL_USER_ID,
  cachedSupabaseSession,
  fetchNeedsImport,
  importData,
  skipImport,
  type ImportCredentials,
} from "@/lib/dataImport";

type AuthState = {
  /** The device's one user, or null until the local data is ready to load. */
  user: { id: string } | null;
  /** True until the local API has said whether an import is pending. */
  loading: boolean;
  /** The local API could not be reached. */
  error: string | null;
  retry: () => void;
  importFromSupabase: (credentials: ImportCredentials) => Promise<{ error: string | null }>;
  startFresh: () => Promise<{ error: string | null }>;
};

const AuthContext = createContext<AuthState | null>(null);

const LOCAL_USER = { id: LOCAL_USER_ID };
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * There is no account: data lives on this device. This only holds the app
 * back until a pending one-time import from Supabase is done or declined.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<{ loading: boolean; ready: boolean; error: string | null }>({
    loading: true,
    ready: false,
    error: null,
  });
  const checking = useRef(false);

  const check = useCallback(async () => {
    if (checking.current) return;
    checking.current = true;
    setState({ loading: true, ready: false, error: null });
    try {
      let pending = await fetchNeedsImport();
      const cached = pending ? cachedSupabaseSession() : null;
      if (cached) {
        pending = await importData({ refreshToken: cached.refreshToken }).then(
          () => false,
          () => true,
        );
      }
      setState({ loading: false, ready: !pending, error: null });
    } catch (err) {
      setState({ loading: false, ready: false, error: messageOf(err) });
    } finally {
      checking.current = false;
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const finish = useCallback(async (work: () => Promise<unknown>) => {
    try {
      await work();
      setState({ loading: false, ready: true, error: null });
      return { error: null };
    } catch (err) {
      return { error: messageOf(err) };
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: state.ready ? LOCAL_USER : null,
      loading: state.loading,
      error: state.error,
      retry: () => void check(),
      importFromSupabase: (credentials) => finish(() => importData(credentials)),
      startFresh: () => finish(skipImport),
    }),
    [state, check, finish],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
