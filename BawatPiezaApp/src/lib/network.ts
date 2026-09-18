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
  [/network request failed/i, 'offline'],
  [/failed to fetch/i, 'offline'],
  [/internet connection/i, 'offline'],
  [/aborted/i, 'timeout'],
  [/timeout/i, 'timeout'],
  [/timed?\s?out/i, 'timeout'],
];

/** Turns a thrown JS error into one of the four buckets (default: unstable). */
export function classifyNetworkError(err: unknown): NetworkIssueInfo {
  const text = err instanceof Error ? err.message : String(err ?? '');
  for (const [pattern, issue] of TRANSPORT_PATTERNS) {
    if (pattern.test(text)) return NETWORK_ISSUE_INFO[issue];
  }
  // Unrecognised transport failure — most likely a flaky link, not a real outage.
  return NETWORK_ISSUE_INFO.unstable;
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
