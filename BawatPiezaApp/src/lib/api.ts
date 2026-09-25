/**
 * Where the BawatPieza API lives, resolved at runtime.
 *
 * The Express backend runs on the developer's PC (`backend/`, port 4000), so a
 * phone can only reach it through the PC's LAN address — never through
 * `localhost`, which the phone resolves to itself. Hard-coding that address in
 * `.env` breaks as soon as the router hands out a new one, and `EXPO_PUBLIC_*`
 * values are inlined when Metro starts, so a stale value keeps failing until the
 * dev server is restarted. To keep Android, iOS, emulators and the web all
 * working, the base URL is resolved here in this order:
 *
 *   1. `EXPO_PUBLIC_API_URL`, when it points somewhere other than loopback
 *      (that is how a hosted / tunnelled API is configured).
 *   2. The host this bundle was loaded from — the browser origin on web, and the
 *      Metro dev-server host on native (`Constants.expoConfig.hostUri`, which is
 *      the PC's LAN IP while `expo start --lan` is running). Port 4000.
 *   3. Loopback (`10.0.2.2` on an Android emulator, `localhost` elsewhere).
 *
 * Requests also fall back through the other candidates, so a stale `.env` no
 * longer takes the app down.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { fetchWithTimeout } from './network';

/** Port the Express API listens on (`PORT` in `backend/.env`). */
export const API_PORT = Number(process.env.EXPO_PUBLIC_API_PORT ?? 4000);

/** Android emulators reach the host machine through this alias, not localhost. */
const ANDROID_EMULATOR_HOST = '10.0.2.2';

/** Hosts that name the device the app runs on rather than a reachable server. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1', '[::1]']);

/** Which rule above produced the address — used for diagnostics. */
export type ApiBaseSource = 'env' | 'metro' | 'emulator' | 'fallback';

export interface ResolvedApiBase {
  url: string;
  source: ApiBaseSource;
}

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

/** Adds a scheme when the `.env` value is a bare `host:port`. */
function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  return stripTrailingSlashes(/^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`);
}

/** Host part of a URL, or null when it cannot be parsed. */
function hostOf(url: string): string | null {
  const match = /^[a-z][a-z0-9+.-]*:\/\/([^/?#]+)/i.exec(url);
  if (!match) return null;
  const authority = match[1];
  const host = authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1)
    : authority.split(':')[0];
  return host || null;
}

function isLoopback(host: string | null): boolean {
  return host === null || LOOPBACK_HOSTS.has(host.toLowerCase());
}

/** `EXPO_PUBLIC_API_URL` as written in `.env`, normalized, or null. */
function envApiUrl(): string | null {
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (!raw || !raw.trim()) return null;
  return normalizeUrl(raw);
}

/**
 * Host this bundle was served from.
 *
 * Web: the page origin, so a browser opened on the LAN uses the LAN address
 * instead of `localhost`. Native: the Metro dev-server host (`--lan` → the PC's
 * LAN IP).
 */
function runtimeHost(): string | null {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined' || !window.location?.hostname) return null;
    return window.location.hostname;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (!hostUri) return null;
  const authority = hostUri.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '').split('/')[0];
  const host = authority.startsWith('[')
    ? authority.slice(0, authority.indexOf(']') + 1)
    : authority.split(':')[0];
  return host || null;
}

/** True when the app runs in an emulator/simulator rather than on a real phone. */
function isVirtualDevice(): boolean {
  return Device.isDevice === false;
}

function loopbackBaseUrl(): string {
  if (Platform.OS === 'android' && isVirtualDevice()) {
    return `http://${ANDROID_EMULATOR_HOST}:${API_PORT}`;
  }
  return `http://localhost:${API_PORT}`;
}

/** Resolves the base URL to use first, alongside the rule that produced it. */
export function resolveApiBase(): ResolvedApiBase {
  const configured = envApiUrl();
  const configuredHost = configured ? hostOf(configured) : null;

  // 1. An explicitly configured address reachable from a device wins.
  if (configured && !isLoopback(configuredHost)) {
    return { url: configured, source: 'env' };
  }

  // 2. Follow the host that served this bundle: a phone that loaded the app
  //    from the PC's LAN address can reach the API on that same address.
  const host = runtimeHost();
  if (host && !isLoopback(host)) {
    return { url: `http://${host}:${API_PORT}`, source: 'metro' };
  }

  // 3. Nothing usable, and `.env` did not ask for loopback either: use the
  //    address that actually reaches the host machine from an emulator.
  if (!configured) {
    return { url: loopbackBaseUrl(), source: 'emulator' };
  }

  // 4. Whatever `.env` says (web / simulator running on the API host itself).
  return { url: configured, source: 'fallback' };
}

const RESOLVED_API_BASE = resolveApiBase();

/** Base URL (no trailing slash) every API call prefers, e.g. `http://192.168.1.9:4000`. */
export const API_BASE_URL = RESOLVED_API_BASE.url;

/** Which rule produced {@link API_BASE_URL} — shown on the Device diagnostics page. */
export const API_BASE_SOURCE = RESOLVED_API_BASE.source;

/** Short, user-facing explanation of where the API address came from. */
export function describeApiBase(): string {
  const reason: Record<ApiBaseSource, string> = {
    env: 'from EXPO_PUBLIC_API_URL',
    metro: 'auto-detected from the dev server',
    emulator: 'emulator loopback address',
    fallback: 'fallback address from .env',
  };
  return `${API_BASE_URL} · ${reason[API_BASE_SOURCE]}`;
}

/** Absolute URL for an API path such as `/health`. */
export function apiUrl(path: string): string {
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${suffix}`;
}

/**
 * Every base URL worth trying, most likely first. Duplicates are dropped, so a
 * single-candidate setup (a hosted API) still makes exactly one attempt.
 */
export function apiBaseCandidates(): string[] {
  const candidates: string[] = [API_BASE_URL];

  const configured = envApiUrl();
  if (configured) candidates.push(configured);

  const host = runtimeHost();
  if (host) candidates.push(`http://${host}:${API_PORT}`);

  // A physical device that somehow ended up with a loopback address can still
  // reach the API through the emulator alias when the PC itself is the host.
  if (Platform.OS === 'android' && isLoopback(hostOf(API_BASE_URL))) {
    candidates.push(`http://${ANDROID_EMULATOR_HOST}:${API_PORT}`);
  }

  return candidates.filter((value, index, all) => all.indexOf(value) === index);
}

/** Thrown when no candidate base URL answered — carries every URL attempted. */
export class ApiUnreachableError extends Error {
  /** URLs that were tried, in order. */
  readonly tried: string[];
  /** The last transport error, for logging. */
  readonly lastError: unknown;

  constructor(tried: string[], lastError: unknown) {
    super('Network request failed');
    this.name = 'ApiUnreachableError';
    this.tried = tried;
    this.lastError = lastError;
  }
}

export interface ApiRequestOptions extends RequestInit {
  /** Hard deadline per attempt. Defaults to 15 s. */
  timeoutMs?: number;
  /** Override the candidate list (probes / tests). */
  baseUrls?: string[];
}

/**
 * `fetch` against the API that survives a stale `EXPO_PUBLIC_API_URL`.
 *
 * Candidates are attempted in order and the first HTTP response wins — a 4xx or
 * 5xx still proves the server was reached, so it is returned to the caller
 * untouched. Only when every candidate fails at the transport level does this
 * throw {@link ApiUnreachableError}, which `classifyNetworkError` reports as
 * "Cannot reach BawatPieza server" with the exact URLs listed.
 */
export async function apiFetch(
  path: string,
  options: ApiRequestOptions = {},
): Promise<Response> {
  const { timeoutMs = 15_000, baseUrls = apiBaseCandidates(), ...init } = options;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  const tried: string[] = [];
  let lastError: unknown = null;

  for (const base of baseUrls) {
    const url = `${stripTrailingSlashes(base)}${suffix}`;
    tried.push(url);
    try {
      return await fetchWithTimeout(url, { ...init, timeoutMs });
    } catch (err) {
      lastError = err;
      console.warn('[api] Unreachable, trying the next address:', url, (err as Error)?.message);
    }
  }

  throw new ApiUnreachableError(tried, lastError);
}

/** `/health` probe used by the Device diagnostics page. */
export async function checkApiHealth(
  timeoutMs = 8_000,
): Promise<{ baseUrl: string; ms: number; json: Record<string, unknown> | null }> {
  const started = Date.now();
  const res = await apiFetch('/health', {
    headers: { Accept: 'application/json' },
    timeoutMs,
  });
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    throw new Error(`Backend answered HTTP ${res.status}`);
  }
  return { baseUrl: API_BASE_URL, ms: Date.now() - started, json };
}
