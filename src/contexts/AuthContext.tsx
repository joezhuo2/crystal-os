import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

type AuthState = {
  session: Session | null;
  user: User | null;
  /** True until the initial session lookup settles. */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

/**
 * Owns the Supabase session and nothing else. It has no knowledge of tasks,
 * transactions, or any other application data — AppProvider consumes it.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    // getSession() reads the cached session from local storage and only
    // contacts Supabase when the token needs refreshing, so this resolves
    // offline as long as the cached token is still within its lifetime.
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return;
        setSession(data.session);
      })
      .catch(() => {
        // Offline with an expired token. Fall through to the login screen,
        // which reports the network failure when a sign-in is attempted.
        if (active) setSession(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Fires on sign-in, sign-out, and every background TOKEN_REFRESHED event.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next);
    });

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error) return { error: null };

    // A network failure and a rejected password are very different problems
    // and look identical if both render as "invalid login credentials".
    const offline = typeof navigator !== "undefined" && !navigator.onLine;
    if (offline || error.message.toLowerCase().includes("fetch")) {
      return { error: "Can't reach Supabase — check your connection." };
    }
    return { error: error.message };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ session, user: session?.user ?? null, loading, signIn, signOut }),
    [session, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
