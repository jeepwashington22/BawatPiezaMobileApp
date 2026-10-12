import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'expo-router';
import { useAuth } from './use-auth';

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
 * - Session + auth route (`/`, `/login`, `/signup`, …) → forward to `/home`
 *   so a logged-in user never sits on the login screen.
 * - Waits for `ready` so the splash screen covers the decision and no
 *   protected link flashes for a logged-out user.
 * - Manual-logout-only: nothing here expires the session on a timer. It ends
 *   when the user taps logout or Supabase reports the token is dead
 *   (revoked/expired → session becomes null → guard fires).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { ready, isLoggedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    const route = pathname.toLowerCase();
    if (!isLoggedIn && !isPublicRoute(route)) {
      router.replace('/login');
    } else if (isLoggedIn && (route === '/' || route === '/index' || route === '/login' || route === '/onboarding')) {
      router.replace('/home');
    }
  }, [ready, isLoggedIn, pathname, router]);

  return <>{children}</>;
}
