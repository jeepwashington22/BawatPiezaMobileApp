import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform, TurboModuleRegistry } from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import { createClient } from "@supabase/supabase-js";
import type { SupportedStorage } from "@supabase/supabase-js";
import { TERMS_VERSION } from "../constants/terms";
import { apiFetch } from "./api";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase env vars. Add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in BawatPiezaMobileApp/BawatPiezaApp/.env",
  );
}

/**
 * SSR-safe storage adapter for web. Expo's "static" web output renders the app
 * on the server (Node), where there is no `window`. The default AsyncStorage
 * web implementation reads `window.localStorage` unconditionally, crashing the
 * server render with "ReferenceError: window is not defined". This adapter
 * guards the browser API so it is a safe no-op during server-side rendering.
 */
const webStorage: SupportedStorage = {
  getItem: (key: string) => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(key, value);
    }
  },
  removeItem: (key: string) => {
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(key);
    }
  },
};

const storage: SupportedStorage =
  Platform.OS === "web" ? webStorage : AsyncStorage;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true, // Enable to handle OAuth redirect URLs
    // Implicit flow: the OAuth redirect returns tokens in the URL fragment,
    // which we parse and set manually on native (see signInWithGoogle).
    flowType: "implicit",
    storage,
  },
});

/**
 * Signs out the current user from Supabase Auth.
 * Clears the session, signs out of the native Google SDK cache, and redirects to the login screen.
 */
export async function signOut() {
  if (hasGoogleSigninModule()) {
    try {
      const mod = requireGoogleSignin();
      configureGoogleSignin(mod);
      await mod.GoogleSignin.signOut();
    } catch (e) {
      // Ignore if not signed in natively
    }
  }

  const { error } = await supabase.auth.signOut();
  if (error) {
    throw error;
  }
  return true;
}

/* ------------------------------------------------------------------ *
 * Google Sign-In
 * ------------------------------------------------------------------ */

/**
 * The app's own URL scheme — `app.json` → `expo.scheme`.
 *
 * Hard-coded on purpose: `Linking.createURL()` returns an
 * `exp://<metro-host>/--/oauth` URL inside Expo Go, and that scheme belongs to
 * *Expo Go*, not to this app. A development or production build registers
 * `bawatpiezaapp://`, which is what lets the OS hand control back to the app.
 */
export const GOOGLE_URL_SCHEME = "bawatpiezaapp";

/** Deep-link path Google's consent screen returns to. Any path works. */
export const GOOGLE_OAUTH_PATH = "oauth";

/**
 * OAuth client of type **Web application** (Google Cloud Console) — the same
 * client Supabase's Google provider is configured with. Google stamping it as
 * the token audience is what makes `signInWithIdToken` accept the token.
 */
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;

/** iOS OAuth client. Optional — only iOS builds pass it as `iosClientId`. */
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

/** Android OAuth client ID for native Google Sign-In configuration. */
const GOOGLE_ANDROID_CLIENT_ID =
  "890013660689-449tii667m5c0ks7ncvmahvg6mu6t86c.apps.googleusercontent.com";

/** Raised when the user dismisses the Google sheet — not a failure to report. */
export class GoogleSignInCancelledError extends Error {
  constructor(message = "Google sign-in was cancelled.") {
    super(message);
    this.name = "GoogleSignInCancelled";
  }
}

/** True for the "user backed out" case, which callers should not alert on. */
export function isGoogleSignInCancelled(error: unknown): boolean {
  return error instanceof GoogleSignInCancelledError;
}

/**
 * Raised when the running binary has no Google Sign-In native module — i.e. when
 * the app is running inside Expo Go.
 *
 * Google's account sheet is a native SDK, so there is no browser-free way to sign
 * in from Expo Go: a development or production build is required.
 */
export class GoogleSignInUnavailableError extends Error {
  constructor(
    message = "Google sign-in needs a development build: Expo Go cannot load Google's native account sheet. Run 'npx expo run:android' (or 'eas build') for the no-browser flow, or set EXPO_PUBLIC_GOOGLE_BROWSER_FALLBACK=1 in BawatPiezaApp/.env to use the browser round trip - see docs/features/google-sign-in.md.",
  ) {
    super(message);
    this.name = "GoogleSignInUnavailable";
  }
}

/**
 * Opt-in browser fallback for binaries that lack the native module (Expo Go).
 *
 * Off by default, because the loop only closes when Supabase knows where to
 * send the browser back to: `signInWithBrowserGoogle()` redirects through
 * `Linking.createURL('/oauth')` — `exp://<metro-host>/--/oauth` inside Expo Go.
 * Expo Go registers the `exp://` scheme itself (it is the app's own
 * `bawatpiezaapp://` scheme that is missing there), so the deep link *can*
 * re-enter the app — but only once that exact URL is allow-listed under
 * Supabase → Authentication → URL Configuration. Otherwise Supabase silently
 * falls back to its Site URL and the tab dead-ends, which is why the plain
 * "needs a development build" alert is the safer default.
 */
const GOOGLE_BROWSER_FALLBACK_ENABLED =
  process.env.EXPO_PUBLIC_GOOGLE_BROWSER_FALLBACK === "1";

/**
 * The redirect URL Supabase has to be told about (Site URL / Redirect URLs).
 *
 * - Web → the origin the app is actually served from. Never a hard-coded
 *   `localhost`: a phone that loaded the web build from `http://192.168.x.x`
 *   has to come back to that same address.
 * - Native → the app's own scheme. `bawatpiezaapp://oauth` only resolves in a
 *   development or production build; Expo Go cannot receive it.
 */
export function googleRedirectUrl(): string {
  if (Platform.OS === "web") {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : Linking.createURL("/");
    return `${origin.replace(/\/+$/, "")}/`;
  }
  return `${GOOGLE_URL_SCHEME}://${GOOGLE_OAUTH_PATH}`;
}

type GoogleSigninModule =
  typeof import("@react-native-google-signin/google-signin");

/**
 * True when the running binary actually contains the Google Sign-In native module.
 *
 * `@react-native-google-signin/google-signin` resolves its TurboModule *while the
 * package is being imported*:
 *
 *     export const NativeModule = TurboModuleRegistry.getEnforcing('RNGoogleSignin');
 *
 * `RNGoogleSignin` is not part of Expo Go's fixed native module set, so importing
 * the package there raises:
 *
 *     Invariant Violation: TurboModuleRegistry.getEnforcing(...):
 *     'RNGoogleSignin' could not be found. Verify that a module by this name is
 *     registered in the native binary.
 *
 * Swallowing that with `try { require(...) } catch {}` proved unreliable — the
 * invariant still reached LogBox on every Google sign-in press. So the registry is
 * asked first instead: `TurboModuleRegistry.get()` returns `null` rather than
 * throwing, and the package is only evaluated when the native side really exists.
 */
function hasGoogleSigninModule(): boolean {
  try {
    return TurboModuleRegistry.get("RNGoogleSignin") != null;
  } catch {
    return false;
  }
}

/**
 * Evaluates the package. Callers must gate on {@link hasGoogleSigninModule} first —
 * that gate is the entire point, so this must never run in Expo Go.
 */
function requireGoogleSignin(): GoogleSigninModule {
  return require("@react-native-google-signin/google-signin") as GoogleSigninModule;
}

let googleSigninConfigured = false;

/** Points the SDK at the client ID Supabase verifies. Must run before signIn. */
function configureGoogleSignin(mod: GoogleSigninModule): void {
  if (googleSigninConfigured) return;
  mod.GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    scopes: ["profile", "email"],
    offlineAccess: false,
    ...(Platform.OS === "ios" && GOOGLE_IOS_CLIENT_ID
      ? { iosClientId: GOOGLE_IOS_CLIENT_ID }
      : {}),
  });
  googleSigninConfigured = true;
}

/**
 * Signs in with Google and establishes a Supabase session.
 *
 * - **Web** → OAuth through the browser, back to the page's own origin. A browser
 *   hop is unavoidable for Google on the web.
 * - **Native build with the Google SDK** → the OS account sheet and
 *   `signInWithIdToken()`. No browser, no redirect.
 * - **Expo Go** → throws {@link GoogleSignInUnavailableError}. Google's sheet is a
 *   native SDK and Expo Go cannot load it, and the browser round trip cannot find
 *   its way back into Expo Go, so there is no working browser-free path there.
 *
 * Resolves only once the session exists, so callers can navigate immediately.
 * Throws {@link GoogleSignInCancelledError} when the user backs out.
 */
export async function signInWithGoogle(): Promise<true> {
  if (Platform.OS === "web") {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        scopes: "profile email",
        redirectTo: googleRedirectUrl(),
        queryParams: { prompt: "select_account" },
      },
    });
    if (error) throw error;
    return true;
  }

  if (!hasGoogleSigninModule()) {
    // Expo Go. Deliberately not a silent browser redirect: the app's own scheme is
    // unregistered there, so Supabase's redirect would land on a dead page.
    if (GOOGLE_BROWSER_FALLBACK_ENABLED) return signInWithBrowserGoogle();
    throw new GoogleSignInUnavailableError();
  }

  // The native sheet — no browser and no redirect.
  return signInWithNativeGoogle(requireGoogleSignin());
}

/**
 * The no-browser path: Google's own account sheet, then a token exchange.
 *
 * Requires a build that ships `@react-native-google-signin/google-signin`, the
 * Google provider enabled in Supabase, and this app's package name plus signing
 * SHA-1 registered on an Android OAuth client in Google Cloud Console.
 */
async function signInWithNativeGoogle(mod: GoogleSigninModule): Promise<true> {
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(
      "Google sign-in is not configured: EXPO_PUBLIC_GOOGLE_CLIENT_ID is missing from BawatPiezaApp/.env.",
    );
  }

  if (Platform.OS === "android") {
    const playServices = await mod.GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: true,
    });
    if (!playServices) {
      throw new Error(
        "Google Play Services is missing or out of date. Update it and try again.",
      );
    }
  }

  configureGoogleSignin(mod);

  // FORCE ACCOUNT PICKER: Silently sign out of the native Google cache before prompting
  // so the OS never skips the account selection screen.
  try {
    await mod.GoogleSignin.signOut();
  } catch (err) {
    // Ignored. Just ensuring the state is cleared.
  }

  const response = await mod.GoogleSignin.signIn();
  if (response.type !== "success") throw new GoogleSignInCancelledError();

  const idToken = response.data.idToken;
  if (!idToken) {
    throw new Error(
      "Google returned no ID token. Check that this app's package name and signing SHA-1 are registered on an Android OAuth client in Google Cloud Console.",
    );
  }

  const { data, error } = await supabase.auth.signInWithIdToken({
    provider: "google",
    token: idToken,
  });
  if (error) throw error;
  if (!data.session)
    throw new Error("Google sign-in did not create a session.");
  return true;
}

/**
 * The browser round trip — opt-in only (see `GOOGLE_BROWSER_FALLBACK_ENABLED`).
 *
 * The browser has to hand control back through a deep link, so Supabase needs the
 * URL `Linking.createURL` produces here — `exp://<metro-host>/--/oauth`, or
 * `bawatpiezaapp://oauth` in a dev build — in both its **Site URL** and its
 * **Redirect URLs** list. When those are missing, Supabase silently falls back to
 * the Site URL (`http://localhost:3000` by default) and the flow dead-ends in the
 * browser instead of returning to the app.
 */
async function signInWithBrowserGoogle(): Promise<true> {
  const redirectTo = Linking.createURL(`/${GOOGLE_OAUTH_PATH}`);

  if (__DEV__) {
    // The one value that has to match Supabase's Redirect URLs allow-list.
    // In Expo Go it is exp://<metro-host>:8081/--/oauth; print it verbatim so
    // nobody has to guess the host or path shape when configuring the dashboard.
    console.info(
      `[google] Browser fallback redirect → ${redirectTo} (allow-list it under Supabase → Authentication → URL Configuration → Redirect URLs).`,
    );
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      scopes: "profile email",
      redirectTo,
      skipBrowserRedirect: true, // we open the browser session ourselves
      queryParams: { prompt: "select_account" },
    },
  });

  if (error) throw error;
  if (!data?.url) throw new Error("Could not start the Google sign-in flow.");

  // Open Google's consent screen and wait for the deep-link redirect back.
  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);

  if (result.type === "cancel" || result.type === "dismiss") {
    throw new GoogleSignInCancelledError();
  }
  if (result.type !== "success" || !("url" in result) || !result.url) {
    throw new Error("Google sign-in was cancelled or failed.");
  }

  // The redirect carries the tokens in the URL fragment (implicit flow):
  // bawatpiezaapp://oauth#access_token=...&refresh_token=...&expires_in=...
  const parsed = extractTokensFromUrl(result.url);
  if (!parsed?.accessToken || !parsed.refreshToken) {
    // Supabase may return an error message instead of tokens.
    if (parsed?.errorDescription) throw new Error(parsed.errorDescription);
    throw new Error(
      `Google sign-in did not return a valid session. If the browser stopped on a localhost or error page instead of returning to the app, allow-list ${redirectTo} under Supabase → Authentication → URL Configuration → Redirect URLs.`,
    );
  }

  // Persist the session — this also fires the SIGNED_IN event so the
  // auth listeners in the app redirect the user to /home.
  const { error: sessionError } = await supabase.auth.setSession({
    access_token: parsed.accessToken,
    refresh_token: parsed.refreshToken,
  });
  if (sessionError) throw sessionError;

  return true;
}

/**
 * Turns a Google/Supabase failure into something the user — or whoever is
 * configuring the project — can act on.
 *
 * Supabase's wording is terse, and the misconfiguration that matters most (a
 * redirect URL missing from the allow-list) never surfaces as an error at all:
 * Supabase quietly sends the browser to the Site URL, which is
 * `http://localhost:3000` by default. The common cases get an explicit
 * instruction here.
 */
export function describeGoogleSignInError(error: unknown): string {
  const code = (error as { code?: string } | null)?.code ?? "";
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const text = raw.toLowerCase();

  if (!raw) return "Unable to sign in with Google. Please try again.";

  // Transport problems carry no `code` and no HTTP status.
  if (
    !code &&
    (text.includes("network") ||
      text.includes("failed to fetch") ||
      text.includes("timeout") ||
      text.includes("aborted"))
  ) {
    return "Network error. Check your internet connection and try again.";
  }

  if (
    code === "provider_disabled" ||
    text.includes("provider is not enabled") ||
    text.includes("unsupported provider")
  ) {
    return "Google sign-in is not enabled for this Supabase project. Turn it on in Supabase → Authentication → Providers → Google.";
  }
  if (text.includes("authorized client id") || text.includes("audience")) {
    return "Supabase rejected the Google token audience. Add this app's Google client IDs under Authentication → Providers → Google → Authorized Client IDs.";
  }
  if (text.includes("redirect") || text.includes("not allowed")) {
    return `${raw} (Add the URL under Supabase → Authentication → URL Configuration.)`;
  }

  return raw;
}

/**
 * Parses access/refresh tokens (or an error) out of an OAuth redirect URL.
 * Tokens can arrive in the URL fragment (`#access_token=...`) or as query
 * parameters (`?access_token=...`).
 */
function extractTokensFromUrl(url: string) {
  const result: {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: string;
    error?: string;
    errorDescription?: string;
  } = {};

  const collect = (searchParams: URLSearchParams) => {
    searchParams.forEach((value, key) => {
      if (key === "access_token") result.accessToken = value;
      else if (key === "refresh_token") result.refreshToken = value;
      else if (key === "expires_in") result.expiresIn = value;
      else if (key === "error") result.error = value;
      else if (key === "error_description") result.errorDescription = value;
    });
  };

  try {
    // Fragment part (implicit flow): scheme://oauth#access_token=...
    const hashIndex = url.indexOf("#");
    if (hashIndex !== -1) {
      collect(new URLSearchParams(url.slice(hashIndex + 1)));
    }
    // Query part (PKCE/error): scheme://oauth?error=...
    const queryIndex = url.indexOf("?");
    if (queryIndex !== -1) {
      const queryEnd =
        hashIndex !== -1 && hashIndex > queryIndex ? hashIndex : undefined;
      collect(
        new URLSearchParams(url.slice(queryIndex + 1, queryEnd ?? undefined)),
      );
    }
  } catch {
    // ignore parse issues — missing tokens are validated by the caller
  }

  return result;
}

/**
 * Checks if the current user is already signed in.
 * Returns true if there's a valid session, false otherwise.
 */
export async function isUserSignedIn(): Promise<boolean> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session !== null;
}

/**
 * Sends the "Welcome to BawatPieza" email when a brand-new account is created
 * (e.g., first-time Google Sign-In). It only fires once per user by checking
 * how recently the account was created.
 *
 * Call this right after a successful sign-in. Returns true when a welcome
 * email was queued, false when the account is not new or the send failed
 * (non-fatal — never throws to the caller).
 */
export async function sendWelcomeEmailIfNew(): Promise<boolean> {
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email) return false;

    // Only greet brand-new accounts (created within the last 2 minutes).
    const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
    if (!createdAt || Date.now() - createdAt > 2 * 60 * 1000) return false;

    const meta = user.user_metadata as Record<string, unknown> | undefined;
    const fullName =
      (meta?.full_name as string) ??
      [meta?.firstname, meta?.middlename, meta?.lastname]
        .filter(Boolean)
        .join(" ") ??
      undefined;
    const firstName = (meta?.firstname as string) ?? fullName?.split(" ")[0];

    const res = await apiFetch("/accounts/welcome-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: user.email, fullName, firstName }),
      timeoutMs: 10_000,
    });
    if (!res.ok) {
      console.warn("[welcome-email] Backend returned", res.status);
      return false;
    }
    return true;
  } catch (err) {
    // Non-fatal — the user still gets into the app; email is best-effort.
    console.warn("[welcome-email] Could not send:", (err as Error).message);
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Terms & Conditions acceptance
 * ------------------------------------------------------------------ */

/** user_metadata keys used to record a Terms & Conditions acceptance. */
export const TERMS_ACCEPTED_AT_KEY = "terms_accepted_at";
export const TERMS_VERSION_KEY = "terms_version";

/**
 * Payload merged into the account's user_metadata, so you can prove which
 * revision of the Terms a user agreed to and when.
 */
export function termsAcceptanceMetadata(acceptedAt: string) {
  return {
    [TERMS_ACCEPTED_AT_KEY]: acceptedAt,
    [TERMS_VERSION_KEY]: TERMS_VERSION,
  };
}

const PENDING_TERMS_KEY = "bawatpieza:pending-terms-acceptance";

/**
 * Remembers an acceptance that cannot be attached to an account yet.
 *
 * Google Sign-In needs this: the OAuth round trip leaves our JS context (and on
 * web reloads the page entirely) before a user row exists, so the acceptance has
 * to survive the redirect and be attached once the session is established.
 */
export async function markTermsAcceptancePending(
  acceptedAt: string,
): Promise<void> {
  try {
    await storage.setItem(PENDING_TERMS_KEY, acceptedAt);
  } catch (err) {
    console.warn(
      "[terms] Could not store pending acceptance:",
      (err as Error).message,
    );
  }
}

/**
 * Attaches a pending Terms acceptance to the signed-in user.
 *
 * Safe to call at any time: it is a no-op when nothing is pending or when there
 * is no session yet. Never throws — recording consent is best-effort and must
 * never block sign-in.
 */
export async function flushPendingTermsAcceptance(): Promise<void> {
  try {
    const pending = await storage.getItem(PENDING_TERMS_KEY);
    if (!pending) return;

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;

    const { error } = await supabase.auth.updateUser({
      data: termsAcceptanceMetadata(pending),
    });
    if (error) {
      console.warn("[terms] Could not record acceptance:", error.message);
      return;
    }
    await storage.removeItem(PENDING_TERMS_KEY);
  } catch (err) {
    console.warn(
      "[terms] Could not record acceptance:",
      (err as Error).message,
    );
  }
}

/**
 * Best-effort answer to "is this email registered?".
 *
 * Supabase deliberately returns the same `invalid_credentials` error for an
 * unknown email and a wrong password, so the login screen asks the database for
 * a boolean to tell the two apart.
 *
 * Returns `null` when the check is unavailable (for example before migration
 * 006_email_registered.sql has been applied) so callers can fall back to the
 * combined "no account found, or the password is incorrect" message.
 *
 * NOTE: see the migration header for the account-enumeration trade-off, and
 * pair this with rate limiting.
 */
let emailRegisteredRpcUnavailable = false;

export async function isEmailRegistered(
  email: string,
): Promise<boolean | null> {
  const value = email.trim().toLowerCase();
  if (!value) return null;

  // This RPC is an optional UX enhancement. Keep signup/login quiet when the
  // migration has not been applied to the connected Supabase project.
  if (emailRegisteredRpcUnavailable) return null;

  try {
    const { data, error } = await supabase.rpc("email_registered", {
      check_email: value,
    });
    if (error) {
      if (
        error.code === "PGRST202" ||
        error.message.includes("email_registered")
      ) {
        emailRegisteredRpcUnavailable = true;
      } else {
        console.warn("[auth] Email check unavailable:", error.message);
      }
      return null;
    }
    return data === true;
  } catch (err) {
    console.warn("[auth] Email check failed:", (err as Error).message);
    return null;
  }
}
