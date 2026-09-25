/**
 * Network status + failure classification.
 *
 * Every failure the app reports is grouped into one of four buckets, each with
 * a short message written for the person holding the phone: it says what went
 * wrong and what to do next. Keep the wording in one place so the login, sign
 * up, and any future screens stay consistent.
 */

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type { ComponentProps } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';

/** Valid icon names for the Ionicons set (typed, not a bare string). */
export type IoniconName = NonNullable<ComponentProps<typeof Ionicons>['name']>;

/* ------------------------------ error buckets ----------------------------- */

export type NetworkIssue =
  | 'offline'      // No internet connection
  | 'serverUnavailable' // The app cannot reach the BawatPieza API
  | 'unstable'     // Unstable network / high latency
  | 'rateLimited'  // Too many requests
  | 'timeout';     // Timeouts & asynchronous failures

export interface NetworkIssueInfo {
  issue: NetworkIssue;
  /** Short headline, e.g. shown in a banner or as the first error line. */
  title: string;
  /** One-sentence explanation written for the user. */
  message: string;
  /** Material/community icon name for the issue (Ionicons set). */
  icon: IoniconName;
}

export const NETWORK_ISSUE_INFO: Record<NetworkIssue, NetworkIssueInfo> = {
  offline: {
    issue: 'offline',
    title: 'No internet connection',
    message: "You're offline. Connect to Wi-Fi or mobile data and try again.",
    icon: 'cloud-offline-outline',
  },
  serverUnavailable: {
    issue: 'serverUnavailable',
    title: 'Cannot reach BawatPieza server',
    message:
      "The app could not open a connection to the API on this network. Check that the backend is still running (npm run dev in backend/) and that the phone is on the same Wi-Fi as the PC.",
    icon: 'server-outline',
  },
  unstable: {
    issue: 'unstable',
    title: 'Unstable connection',
    message: 'Your connection is slow or unstable. Move closer to your router or switch networks.',
    icon: 'pulse-outline',
  },
  rateLimited: {
    issue: 'rateLimited',
    title: 'Too many attempts',
    message: 'Too many requests in a short time. Please wait a few minutes before trying again.',
    icon: 'hourglass-outline',
  },
  timeout: {
    issue: 'timeout',
    title: 'Request timed out',
    message: 'The server took too long to respond. Check your connection and try again.',
    icon: 'time-outline',
  },
};

/** Network-ish JS error texts (React Native / fetch) mapped to a bucket. */
const TRANSPORT_PATTERNS: Array<[RegExp, NetworkIssue]> = [
  [/network request failed/i, 'serverUnavailable'],
  [/failed to fetch/i, 'serverUnavailable'],
  [/internet connection/i, 'offline'],
  [/aborted/i, 'timeout'],
  [/timeout/i, 'timeout'],
  [/timed?\s?out/i, 'timeout'],
];

/**
 * URLs an `ApiUnreachableError` (see `lib/api.ts`) recorded, without importing
 * that module here — this keeps `lib/network.ts` free of app-level dependencies.
 */
function attemptedUrls(err: unknown): string[] {
  if (!err || typeof err !== 'object' || !('tried' in err)) return [];
  const tried = (err as { tried?: unknown }).tried;
  if (!Array.isArray(tried)) return [];
  return tried.filter((value): value is string => typeof value === 'string');
}

/**
 * Turns a thrown JS error into one of the four buckets.
 *
 * `requestUrl` (and, when present, the URL list a failed API request tried) is
 * appended to the message, so the person reading it sees the address the app
 * actually used instead of having to guess.
 */
export function classifyNetworkError(err: unknown, requestUrl?: string): NetworkIssueInfo {
  const text = err instanceof Error ? err.message : String(err ?? '');
  const tried = attemptedUrls(err);
  const urls = tried.length ? tried : requestUrl ? [requestUrl] : [];
  const withTarget = (info: NetworkIssueInfo): NetworkIssueInfo =>
    urls.length ? { ...info, message: `${info.message} Tried ${urls.join(', then ')}.` } : info;

  for (const [pattern, issue] of TRANSPORT_PATTERNS) {
    if (pattern.test(text)) return withTarget(NETWORK_ISSUE_INFO[issue]);
  }
  // API calls use this function only after fetch failed without an HTTP
  // response. Treating that as server-unreachable is more accurate than
  // blaming the user's credentials or internet quality.
  return withTarget(NETWORK_ISSUE_INFO.serverUnavailable);
}

/** True when `err` is a transport failure — fetch never reached a server. */
export function isTransportError(err: unknown): boolean {
  if (attemptedUrls(err).length > 0) return true;
  const text = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase();
  return TRANSPORT_PATTERNS.some(([pattern]) => pattern.test(text));
}

/**
 * User-facing one-liner for a failed API call: a transport failure becomes a
 * network problem (naming the addresses we tried), while an error the API sent
 * back keeps its own wording.
 */
export function describeApiFailure(err: unknown, fallback: string): string {
  if (isTransportError(err)) {
    const info = classifyNetworkError(err);
    return `${info.title}. ${info.message}`;
  }
  if (err instanceof Error && err.message.trim()) return err.message;
  return fallback;
}

/** Maps an HTTP status from our API/Supabase onto a user-facing bucket. */
export function issueForHttpStatus(status: number): NetworkIssueInfo | null {
  if (status === 429) return NETWORK_ISSUE_INFO.rateLimited;
  if (status === 408 || status === 504) return NETWORK_ISSUE_INFO.timeout;
  if (status >= 500 && status !== 502) return NETWORK_ISSUE_INFO.unstable;
  return null; // 4xx (bad credentials etc.) is not a network problem
}

/* --------------------------- connectivity state --------------------------- */

/** One-shot "do we have a usable connection right now?" check. */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return Boolean(state.isConnected && state.isInternetReachable !== false);
  } catch {
    // If NetInfo itself fails, assume the worst and let the request decide.
    return false;
  }
}

/**
 * fetch() with a hard deadline, so a hung connection surfaces as a "timed out"
 * error instead of leaving the button spinning forever.
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 15_000, ...fetchOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...fetchOptions, signal: fetchOptions.signal ?? controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Live connectivity subscription for banners / screens. */
export function subscribeToConnectivity(
  listener: (online: boolean, state: NetInfoState) => void,
): () => void {
  const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
    listener(Boolean(state.isConnected && state.isInternetReachable !== false), state);
  });
  return unsubscribe;
}
