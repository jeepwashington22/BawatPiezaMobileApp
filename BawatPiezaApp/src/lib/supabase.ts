import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { createClient } from '@supabase/supabase-js';
import type { SupportedStorage } from '@supabase/supabase-js';
import { TERMS_VERSION } from '../constants/terms';
import { apiFetch } from './api';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in BawatPiezaMobileApp/BawatPiezaApp/.env',
  );
}

/**
 * SSR-safe storage adapter for web. Expo's "static" web output renders the app
 * on the server (Node), where there is no `window`. The default AsyncStorage
 * web implementation reads `window.localStorage` unconditionally, crashing the
 * server render with "ReferenceError: window is not defined". This adapter
 * guards the browser API so it is a safe no-op during server-side rendering.
 */
const webStorage: SupportedStorage = {
  getItem: (key: string) => {
    if (typeof window === 'undefined') return null;
    return window.localStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(key, value);
    }
  },
  removeItem: (key: string) => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(key);
    }
  },
};

const storage: SupportedStorage = Platform.OS === 'web' ? webStorage : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // Enable to handle OAuth redirect URLs
    // Implicit flow: the OAuth redirect returns tokens in the URL fragment,
    // which we parse and set manually on native (see signInWithGoogle).
    flowType: 'implicit',
    storage,
  },
});

/**
 * Signs out the current user from Supabase Auth.
 * Clears the session and redirects to the login screen.
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
  return true;
}

/**
 * Signs in with Google using Supabase Auth OAuth flow.
 *
 * On web: the browser handles the redirect natively — we just point Supabase
 * back at the current origin so `detectSessionInUrl` picks up the session.
 *
 * On native (Android/iOS): `signInWithOAuth` alone does NOT work — the session
 * would be delivered to Supabase's site URL instead of the app. So we:
 *   1. Get the Google auth URL without auto-redirecting (`skipBrowserRedirect`).
 *   2. Open it in an in-app browser auth session that listens for the app's
 *      deep link (`bawatpiezaapp://oauth`).
 *   3. Parse the tokens from the redirect URL and set the Supabase session.
 *
 * This handles both new user registration and existing user sign-in.
 */
export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'profile email',
        redirectTo: Linking.createURL('/home'),
      },
    });
    if (error) throw error;
    return true;
  }

  // Native: run the OAuth dance manually through an in-app browser.
  const redirectTo = Linking.createURL('/oauth');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'profile email',
      redirectTo,
      skipBrowserRedirect: true, // we open the browser ourselves
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error('Could not start the Google sign-in flow.');

  // Open Google's consent screen and wait for the deep-link redirect back.
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type !== 'success' || !('url' in result) || !result.url) {
    throw new Error('Google sign-in was cancelled or failed.');
  }

  // The redirect carries the tokens in the URL fragment (implicit flow):
  // bawatpiezaapp://oauth#access_token=...&refresh_token=...&expires_in=...
  const parsed = extractTokensFromUrl(result.url);
  if (!parsed?.accessToken || !parsed.refreshToken) {
    // Supabase may return an error message instead of tokens.
    if (parsed?.errorDescription) throw new Error(parsed.errorDescription);
    throw new Error('Google sign-in did not return a valid session.');
  }

  // Persist the session — this also fires the SIGNED_IN event so the
  // auth listeners in the app redirect the user to /home.
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: parsed.accessToken,
    refresh_token: parsed.refreshToken,
  });
  if (sessionError) throw sessionError;

  return true;
}

/**
 * Parses access/refresh tokens (or an error) out of an OAuth redirect URL.
 * Tokens can arrive in the URL fragment (`#access_token=...`) or as query
 * parameters (`?access_token=...`).
 */
function extractTokensFromUrl(url: string) {
  const result: {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: string;
    error?: string;
    errorDescription?: string;
  } = {};

  const collect = (searchParams: URLSearchParams) => {
    searchParams.forEach((value, key) => {
      if (key === 'access_token') result.accessToken = value;
      else if (key === 'refresh_token') result.refreshToken = value;
      else if (key === 'expires_in') result.expiresIn = value;
      else if (key === 'error') result.error = value;
      else if (key === 'error_description') result.errorDescription = value;
    });
  };

  try {
    // Fragment part (implicit flow): scheme://oauth#access_token=...
    const hashIndex = url.indexOf('#');
    if (hashIndex !== -1) {
      collect(new URLSearchParams(url.slice(hashIndex + 1)));
    }
    // Query part (PKCE/error): scheme://oauth?error=...
    const queryIndex = url.indexOf('?');
    if (queryIndex !== -1) {
      const queryEnd = hashIndex !== -1 && hashIndex > queryIndex ? hashIndex : undefined;
      collect(
        new URLSearchParams(
          url.slice(queryIndex + 1, queryEnd ?? undefined),
        ),
      );
    }
  } catch {
    // ignore parse issues — missing tokens are validated by the caller
  }

  return result;
}

/**
 * Checks if the current user is already signed in.
 * Returns true if there's a valid session, false otherwise.
 */
export async function isUserSignedIn(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return session !== null;
}

/**
 * Sends the "Welcome to BawatPieza" email when a brand-new account is created
 * (e.g., first-time Google Sign-In). It only fires once per user by checking
 * how recently the account was created.
 *
 * Call this right after a successful sign-in. Returns true when a welcome
 * email was queued, false when the account is not new or the send failed
 * (non-fatal — never throws to the caller).
 */
export async function sendWelcomeEmailIfNew(): Promise<boolean> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return false;

    // Only greet brand-new accounts (created within the last 2 minutes).
    const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
    if (!createdAt || Date.now() - createdAt > 2 * 60 * 1000) return false;

    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const fullName =
      (meta?.full_name as string) ??
      [meta?.firstname, meta?.middlename, meta?.lastname].filter(Boolean).join(' ') ??
      undefined;
    const firstName = (meta?.firstname as string) ?? fullName?.split(' ')[0];

    const res = await apiFetch('/accounts/welcome-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: user.email, fullName, firstName }),
      timeoutMs: 10_000,
    });
    if (!res.ok) {
      console.warn('[welcome-email] Backend returned', res.status);
      return false;
    }
    return true;
  } catch (err) {
    // Non-fatal — the user still gets into the app; email is best-effort.
    console.warn('[welcome-email] Could not send:', (err as Error).message);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Terms & Conditions acceptance
 * ------------------------------------------------------------------ */

/** user_metadata keys used to record a Terms & Conditions acceptance. */
export const TERMS_ACCEPTED_AT_KEY = 'terms_accepted_at';
export const TERMS_VERSION_KEY = 'terms_version';

/**
 * Payload merged into the account's user_metadata, so you can prove which
 * revision of the Terms a user agreed to and when.
 */
export function termsAcceptanceMetadata(acceptedAt: string) {
  return {
    [TERMS_ACCEPTED_AT_KEY]: acceptedAt,
    [TERMS_VERSION_KEY]: TERMS_VERSION,
  };
}

const PENDING_TERMS_KEY = 'bawatpieza:pending-terms-acceptance';

/**
 * Remembers an acceptance that cannot be attached to an account yet.
 *
 * Google Sign-In needs this: the OAuth round trip leaves our JS context (and on
 * web reloads the page entirely) before a user row exists, so the acceptance has
 * to survive the redirect and be attached once the session is established.
 */
export async function markTermsAcceptancePending(acceptedAt: string): Promise<void> {
  try {
    await storage.setItem(PENDING_TERMS_KEY, acceptedAt);
  } catch (err) {
    console.warn('[terms] Could not store pending acceptance:', (err as Error).message);
  }
}

/**
 * Attaches a pending Terms acceptance to the signed-in user.
 *
 * Safe to call at any time: it is a no-op when nothing is pending or when there
 * is no session yet. Never throws — recording consent is best-effort and must
 * never block sign-in.
 */
export async function flushPendingTermsAcceptance(): Promise<void> {
  try {
    const pending = await storage.getItem(PENDING_TERMS_KEY);
    if (!pending) return;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { error } = await supabase.auth.updateUser({ data: termsAcceptanceMetadata(pending) });
    if (error) {
      console.warn('[terms] Could not record acceptance:', error.message);
      return;
    }
    await storage.removeItem(PENDING_TERMS_KEY);
  } catch (err) {
    console.warn('[terms] Could not record acceptance:', (err as Error).message);
  }
}

/**
 * Best-effort answer to "is this email registered?".
 *
 * Supabase deliberately returns the same `invalid_credentials` error for an
 * unknown email and a wrong password, so the login screen asks the database for
 * a boolean to tell the two apart.
 *
 * Returns `null` when the check is unavailable (for example before migration
 * 006_email_registered.sql has been applied) so callers can fall back to the
 * combined "no account found, or the password is incorrect" message.
 *
 * NOTE: see the migration header for the account-enumeration trade-off, and
 * pair this with rate limiting.
 */
let emailRegisteredRpcUnavailable = false;

export async function isEmailRegistered(email: string): Promise<boolean | null> {
  const value = email.trim().toLowerCase();
  if (!value) return null;

  // This RPC is an optional UX enhancement. Keep signup/login quiet when the
  // migration has not been applied to the connected Supabase project.
  if (emailRegisteredRpcUnavailable) return null;

  try {
    const { data, error } = await supabase.rpc('email_registered', { check_email: value });
    if (error) {
      if (error.code === 'PGRST202' || error.message.includes('email_registered')) {
        emailRegisteredRpcUnavailable = true;
      } else {
        console.warn('[auth] Email check unavailable:', error.message);
      }
      return null;
    }
    return data === true;
  } catch (err) {
    console.warn('[auth] Email check failed:', (err as Error).message);
    return null;
  }
}
