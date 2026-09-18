import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import LoginScreen from './login';
import OnboardingScreen from './onboarding';

/** AsyncStorage flag marking the boarding walkthrough as completed. */
const ONBOARDING_SEEN_KEY = 'bawatpieza.onboarding.seen';

/**
 * App entry gate.
 *
 * First launch → boarding walkthrough (slides introducing BawatPieza), which
 * flips the AsyncStorage flag on finish/skip. Every later launch → login
 * screen directly. `null` while the flag is being read so the splash screen
 * covers the decision instead of flashing the wrong screen.
 */
export default function Index() {
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

  if (onboardingSeen === null) return null;
  if (!onboardingSeen) {
    return <OnboardingScreen onDone={() => setOnboardingSeen(true)} />;
  }
  return <LoginScreen />;
}