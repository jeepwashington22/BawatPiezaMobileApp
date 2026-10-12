import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { useSession } from './use-session';

/* ------------------------------ Session context ----------------------------- */

type AuthContextValue = {
  /** True once the initial session check has completed. */
  ready: boolean;
  /** Current Supabase session (null when logged out / expired). */
  session: Session | null;
  /** Current user (null when logged out / expired). */
  user: User | null;
  /** Convenience flag — true while a valid session exists. */
  isLoggedIn: boolean;
  /** Clears the session (Supabase + Google cache) and returns to the gate. */
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * AuthProvider — the single session source of truth for the whole app.
 *
 * - Manual-logout-only: the session lives in Supabase storage
 *   (AsyncStorage on native, localStorage on web) and survives restarts.
 * - Supabase auto-refreshes the token while the app runs
 *   (`autoRefreshToken: true` in lib/supabase.ts); if refresh fails
 *   (revoked/expired token) the listener below clears the session and the
 *   route guard sends the user to login.
 * - Until `ready` is true, the root layout holds the splash screen so no
 *   protected link can render for a logged-out user.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const { session, loading } = useSession();

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Session may already be gone locally — the listener still clears state.
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready: !loading,
      session,
      user: session?.user ?? null,
      isLoggedIn: session?.user != null,
      signOut,
    }),
    [loading, session, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
