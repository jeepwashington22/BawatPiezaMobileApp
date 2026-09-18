import { useEffect } from 'react';
import { View } from 'react-native';
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
      if (event === 'SIGNED_IN' && session?.user && isMounted) {
        console.log('User signed in:', session.user.email);
        // Attach a Terms & Conditions acceptance that was parked while the
        // OAuth redirect was in flight (Google Sign-In).
        void flushPendingTermsAcceptance();
        // Dispatch custom event for any listener
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('supabase:signedIn'));
        }
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

