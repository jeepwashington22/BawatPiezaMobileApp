import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import LoginScreen from './login';
import OnboardingScreen from './onboarding';
import { useAuth } from '../hooks/use-auth';

/** AsyncStorage flag marking the boarding walkthrough as completed. */
const ONBOARDING_SEEN_KEY = 'bawatpieza.onboarding.seen';

/**
 * App entry gate.
 *
 * First launch → boarding walkthrough (slides introducing BawatPieza), which
 * flips the AsyncStorage flag on finish/skip. Later launches:
 * - live session → straight to /home (no login flash; the gate holds the
 *   splash until the session check finishes, and AuthGate also forwards).
 * - no session → login screen directly.
 * `null` while the flag is being read so the splash screen covers the
 * decision instead of flashing the wrong screen.
 */
export default function Index() {
  const { ready, isLoggedIn } = useAuth();
  const router = useRouter();
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(ONBOARDING_SEEN_KEY)
      .then((value) => {
        if (alive) setOnboardingSeen(value === '1');
      })
      .catch(() => {
        if (alive) setOnboardingSeen(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  // Session-based entry: a logged-in user opening the app (or hitting `/`
  // via a link) goes to /home. AuthGate enforces the same rule globally.
  useEffect(() => {
    if (ready && isLoggedIn) router.replace('/home');
  }, [ready, isLoggedIn, router]);

  if (onboardingSeen === null || !ready) return null;
  if (isLoggedIn) return null;
  if (!onboardingSeen) {
    return <OnboardingScreen onDone={() => setOnboardingSeen(true)} />;
  }
  return <LoginScreen />;
}