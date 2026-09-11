import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';
import type { SupportedStorage } from '@supabase/supabase-js';

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
 * This handles both new user registration and existing user sign-in.
 * After successful OAuth, the auth state change listener will handle redirection.
 */
export async function signInWithGoogle() {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'profile email',
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  });

  if (error) {
    throw error;
  }

  // The OAuth flow will redirect the user to Google, then back to the app.
  // The auth state change listener in the app will handle the actual redirection.
  return true;
}

/**
 * Checks if the current user is already signed in.
 * Returns true if there's a valid session, false otherwise.
 */
export async function isUserSignedIn(): Promise<boolean> {
  const { data: { session } } = await supabase.auth.getSession();
  return session !== null;
}
