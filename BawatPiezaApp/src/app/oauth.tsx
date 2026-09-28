import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fonts } from '../theme';

/**
 * Landing route for the Google OAuth deep link.
 *
 * `signInWithBrowserGoogle()` redirects back to `Linking.createURL('/oauth')` —
 * `bawatpiezaapp://oauth` in a build, `exp://<metro-host>/--/oauth` inside Expo
 * Go. The token exchange itself belongs to that function: the Linking event
 * resolves its promise, and the login/signup screen that started the flow
 * routes to /provisioning as soon as the session exists — its `await` keeps
 * running even though this route has replaced that screen in the stack.
 *
 * So this screen only keeps expo-router from flashing its "Unmatched route"
 * fallback during that hand-off, and gives the user a way back when the
 * exchange was cancelled or failed (the originating alert appears on top of
 * this screen).
 */
export default function OAuthLandingScreen() {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#050A15', '#0B1628', '#0F1F33']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.content}>
        <ActivityIndicator size="large" color="#208AEF" />
        <Text style={styles.title}>Completing Google sign-in…</Text>
        <Text style={styles.subtitle}>This only takes a moment.</Text>
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
