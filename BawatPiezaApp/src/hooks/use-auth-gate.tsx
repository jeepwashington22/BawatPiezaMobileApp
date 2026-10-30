import { useEffect, type ReactNode } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from './use-auth';
import { deviceSetupRequiredKey } from '../lib/device-setup';
import {
  isGoogleOnboardingRequired,
  isGoogleSignInInProgress,
} from '../lib/supabase';

/**
 * Routes anyone can visit without a session (login gate + recovery).
 * Everything else requires a live session — deep links included.
 */
const PUBLIC_ROUTES = new Set([
  '/',
  '/index',
  '/login',
  '/signup',
  '/forgot-password',
  '/oauth',
  '/google-onboarding',
  '/onboarding',
]);

function isPublicRoute(pathname: string): boolean {
  const route = pathname.toLowerCase().replace(/\/$/, '') || '/';
  return PUBLIC_ROUTES.has(route);
}

/**
 * AuthGate — session-based navigation guard, mounted once in the root layout.
 *
 * - No session + protected route (incl. deep links like `/home`,
 *   `/pages/profile`) → `router.replace('/login')`. The user must log in
 *   first; there is no way around the gate.
 * - Session + auth route (`/`, `/login`, `/onboarding`, …) → forward to `/home`
 *   so a logged-in user never sits on the login screen.
 * - NOTE: `/signup` is deliberately NOT forwarded. Right after a manual
 *   sign-up Supabase may briefly report a session (when "Confirm email" is
 *   OFF) before the signup screen signs it out; forwarding `/signup` would
 *   flash the dashboard and destroy the success + verify-email modal.
 *   The signup screen guards itself instead (redirects to /home only when
 *   idle with no success modal showing).
 * - Waits for `ready` so the splash screen covers the decision and no
 *   protected link flashes for a logged-out user.
 * - Manual-logout-only: nothing here expires the session on a timer. It ends
 *   when the user taps logout or Supabase reports the token is dead
 *   (revoked/expired → session becomes null → guard fires).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, isLoggedIn, user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    if (isGoogleSignInInProgress()) return;
    const route = pathname.toLowerCase().replace(/\/$/, '') || '/';
    if (route === '/google-onboarding' && !isLoggedIn) {
      router.replace('/login');
      return;
    }
    if (!isLoggedIn && !isPublicRoute(route)) {
      router.replace('/login');
      return;
    }
    if (!isLoggedIn || !user?.id) return;

    const googleOnboardingRequired = isGoogleOnboardingRequired(user);
    if (
      googleOnboardingRequired &&
      route !== '/google-onboarding' &&
      route !== '/oauth'
    ) {
      router.replace('/google-onboarding');
      return;
    }
    if (googleOnboardingRequired) return;

    let active = true;
    const isDeviceSetup = route === '/pages/device-setup';
    Promise.all([
      AsyncStorage.getItem(deviceSetupRequiredKey(user.id)),
      AsyncStorage.getItem('bawatpieza_hub_id'),
    ])
      .then(async ([required, hubId]) => {
        if (!active) return;
        if (required === '1' && hubId && !isDeviceSetup) {
          const [latestRequired, latestHubId] = await Promise.all([
            AsyncStorage.getItem(deviceSetupRequiredKey(user.id)),
            AsyncStorage.getItem('bawatpieza_hub_id'),
          ]);
          if (!active) return;
          if (latestRequired !== '1' || !latestHubId) {
            if (!latestHubId) {
              await AsyncStorage.removeItem(deviceSetupRequiredKey(user.id));
            }
            return;
          }
          router.replace('/pages/device-setup');
        } else if (required === '1' && !hubId) {
          await AsyncStorage.removeItem(deviceSetupRequiredKey(user.id));
        } else if (
          required !== '1' &&
          (route === '/' || route === '/index' || route === '/login' || route === '/onboarding')
        ) {
          router.replace('/home');
        }
      })
      .catch((error) => {
        console.error('[auth-gate] Could not check device setup status:', error);
        if (
          active &&
          (route === '/' || route === '/index' || route === '/login' || route === '/onboarding')
        ) {
          router.replace('/home');
        }
      });

    return () => {
      active = false;
    };
  }, [
    ready,
    isLoggedIn,
    pathname,
    router,
    user,
  ]);

  return <>{children}</>;
}
