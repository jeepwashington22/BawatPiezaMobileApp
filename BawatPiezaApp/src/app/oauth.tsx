import { ActivityIndicator, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../components/app-text';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts } from '../theme';
import { useAuth } from '../hooks/use-auth';
import { prepareGoogleOnboarding } from '../lib/supabase';
import { useEffect, useRef, useState } from 'react';

/**
 * Landing route for the Google OAuth deep link.
 *
 * `signInWithBrowserGoogle()` redirects back to `Linking.createURL('/oauth')` —
 * `bawatpiezaapp://oauth` in a build, `exp://<metro-host>/--/oauth` inside Expo
 * Go. This route waits for the restored session, detects a first-time Google
 * account, and routes new users through Terms and email-code verification
 * before device provisioning.
 */
export default function OAuthLandingScreen() {
  const router = useRouter();
  const { ready, isLoggedIn } = useAuth();
  const handled = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ready || !isLoggedIn || handled.current) return;
    handled.current = true;
    void prepareGoogleOnboarding()
      .then((isNewUser) => {
        router.replace(isNewUser ? '/google-onboarding' : '/home');
      })
      .catch((onboardingError) => {
        handled.current = false;
        setError(
          onboardingError instanceof Error
            ? onboardingError.message
            : 'Could not finish Google sign-in.',
        );
      });
  }, [ready, isLoggedIn, router]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#050A15', '#0B1628', '#0F1F33']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.content}>
        <ActivityIndicator size="large" color="#208AEF" />
        <Text style={styles.title}>
          {error ? 'Google sign-in needs attention' : 'Completing Google sign-in…'}
        </Text>
        <Text style={styles.subtitle}>
          {error ?? (isLoggedIn ? 'Preparing your account.' : 'This only takes a moment.')}
        </Text>
        <TouchableOpacity
          accessibilityRole="button"
          onPress={() => router.replace('/')}
          style={styles.backButton}
        >
          <Text style={styles.backText}>Back to sign in</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050A15',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: 24,
  },
  title: {
    fontFamily: fonts.semibold,
    fontSize: 18,
    color: '#FFFFFF',
    marginTop: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.regular,
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.72)',
    textAlign: 'center',
  },
  backButton: {
    marginTop: 26,
    paddingVertical: 12,
    paddingHorizontal: 22,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  backText: {
    fontFamily: fonts.medium,
    fontSize: 14,
    color: '#FFFFFF',
  },
});
