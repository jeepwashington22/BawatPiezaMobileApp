import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase, flushPendingTermsAcceptance } from '../lib/supabase';

/**
 * Announces a new session to whatever web page hosts the web build.
 *
 * `supabase:signedIn` is a DOM `CustomEvent`; nothing in the app listens for it.
 *
 * The guard must NOT be `typeof window !== 'undefined'`. React Native aliases the
 * global away in `Libraries/Core/setUpGlobals.js`:
 *
 *     if (global.window === undefined) { global.window = global; }
 *
 * so `window` is defined on a phone while `window.dispatchEvent` is not — the
 * call then throws `TypeError: undefined is not a function`. Feature-detect the
 * API that is actually used (and only on web), and swallow any failure.
 */
function notifyWebHostOfSignIn(): void {
  if (Platform.OS !== 'web') return;
  if (typeof window === 'undefined') return;
  if (typeof window.dispatchEvent !== 'function') return;
  if (typeof CustomEvent !== 'function') return;

  try {
    window.dispatchEvent(new CustomEvent('supabase:signedIn'));
  } catch (err) {
    console.warn('[auth] Could not notify the web host of the sign-in:', err);
  }
}

/**
 * useSession — subscribes to the Supabase session.
 *
 * - Manual-logout-only: session persists in storage across restarts; it ends
 *   when the user taps logout (`supabase.auth.signOut()`) or when the token
 *   can no longer be refreshed (revoked/expired → SIGNED_OUT event).
 * - `loading` is true until the first getSession() resolves so route guards
 *   can hold the splash screen instead of flashing login.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!alive) return;
        setSession(data.session);
        setLoading(false);
        if (data.session?.user) void flushPendingTermsAcceptance();
      })
      .catch(() => {
        if (alive) {
          setSession(null);
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, next) => {
      if (!alive) return;
      // TOKEN_REFRESHED with no session, or explicit SIGNED_OUT → logged out.
      if (event === 'SIGNED_OUT' || ((event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') && !next?.user)) {
        setSession(null);
        setLoading(false);
        return;
      }
      if (next) {
        setSession(next);
        setLoading(false);
        if (event === 'SIGNED_IN') {
          // This callback must never throw. Supabase runs every subscriber in
          // its own try/catch and then rethrows the first captured error out
          // of `_notifyAllSubscribers` — a throw here would surface from
          // `setSession()` / `signInWithIdToken()` *after* the session was
          // already saved, so a successful Google sign-in would report
          // "Google sign in failed" while the user is in fact signed in.
          try {
            // Attach a Terms & Conditions acceptance parked during the OAuth
            // redirect, then tell the web host (web builds only).
            void flushPendingTermsAcceptance();
            notifyWebHostOfSignIn();
          } catch (err) {
            console.warn('[auth] SIGNED_IN handler failed (session is still valid):', err);
          }
        }
      }
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  return { session, loading };
}
