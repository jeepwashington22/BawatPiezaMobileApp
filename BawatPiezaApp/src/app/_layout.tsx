import { useEffect } from 'react';
import { Platform, View } from 'react-native';
import { Slot } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from '@expo-google-fonts/poppins';

import { ThemeProvider } from '../theme';
import { NetworkBanner } from '../components/network-banner';
import { supabase, flushPendingTermsAcceptance } from '../lib/supabase';
import type { AuthChangeEvent } from '@supabase/supabase-js';

// Keep the splash visible until fonts + root layout are ready,
// then hide it so the app (login screen) is actually rendered.
SplashScreen.preventAutoHideAsync();

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

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Handle OAuth callback and auth state changes
  useEffect(() => {
    let isMounted = true;

    // Check for existing session on mount (handles OAuth redirect)
    const checkExistingSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session && isMounted && session.user) {
          console.log('Existing session found:', session.user.email);
          // Session exists, let the app handle redirection.
          // A Google sign-up may have parked a Terms acceptance that still
          // needs to be attached to the account.
          void flushPendingTermsAcceptance();
        }
      } catch (err) {
        console.error('Session check error:', err);
      }
    };

    checkExistingSession();

    // Set up auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' || !session?.user || !isMounted) return;

      console.log('User signed in:', session.user.email);

      // This callback must never throw. Supabase runs every subscriber in its own
      // try/catch and then rethrows the first captured error out of
      // `_notifyAllSubscribers`, which `_setSession` does not handle (it only
      // returns `AuthError`s and rethrows everything else). The rejection would
      // therefore surface from `setSession()` / `signInWithIdToken()` *after* the
      // session was already saved — so a successful Google sign-in would report
      // "Google sign in failed" while the user is in fact signed in.
      try {
        // Attach a Terms & Conditions acceptance that was parked while the OAuth
        // redirect was in flight (Google Sign-In).
        void flushPendingTermsAcceptance();
        notifyWebHostOfSignIn();
      } catch (err) {
        console.warn('[auth] SIGNED_IN handler failed (session is still valid):', err);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <View style={{ flex: 1 }}>
        <NetworkBanner />
        <Slot />
      </View>
    </ThemeProvider>
  );
}

