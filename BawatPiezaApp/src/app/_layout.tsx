import { useEffect, useState } from "react";
import { View } from "react-native";
import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";

import { ThemeProvider } from "../theme";
import { AuthProvider, useAuth } from "../hooks/use-auth";
import { PowerOverrideProvider, usePowerOverride } from "../hooks/use-power-override";
import { AuthGate } from "../hooks/use-auth-gate";
import { AppTourProvider } from "../hooks/use-app-tour";
import { NetworkBanner } from "../components/network-banner";
import { QuickOverridesModal } from "../components/quick-overrides-modal";
import { AppTourOverlay } from "../components/app-tour-overlay";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api";

/** AsyncStorage key written once a hub is successfully paired (provisioning). */
const DEVICE_STORAGE_KEY = "bawatpieza_hub_id";

/** AsyncStorage flag set when this account has an accepted shared-user relationship. */
const SHARED_ACCESS_KEY = "bawatpieza_shared_access";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <PowerOverrideProvider>
          <AppTourProvider>
            <AuthGate>
              <AuthedShell fontsLoaded={fontsLoaded} />
            </AuthGate>
          </AppTourProvider>
        </PowerOverrideProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

function AuthedShell({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { ready, isLoggedIn } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const currentRoute = pathname.toLowerCase();
  const isHomeScreen = currentRoute === "/home" || currentRoute === "/";
  const isSetupScreen =
    currentRoute.includes("provisioning") ||
    currentRoute.includes("device") ||
    currentRoute.includes("setup");

  // Routes exempt from the "connect a device first" requirement: authentication
  // screens plus the device/provisioning/setup flow itself (needed to pair),
  // AND /pages/accounts so shared users can accept an invite before pairing.
  const AUTH_ROUTES = new Set([
    "/",
    "/index",
    "/login",
    "/signup",
    "/forgot-password",
    "/onboarding",
    "/oauth",
    "/pages/accounts",
    "/accounts",
  ]);

  function isDeviceRoute(route: string): boolean {
    return (
      route === "/pages/device" ||
      route === "/pages/accounts" ||
      route === "/accounts" ||
      route.includes("provisioning") ||
      route.includes("setup")
    );
  }

  // ---- Device-access gate ------------------------------------------------
  const [gateReady, setGateReady] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  useEffect(() => {
    if (!ready) {
      setGateReady(false);
      setHasAccess(false);
      return;
    }
    if (!isLoggedIn) {
      setGateReady(true);
      setHasAccess(false);
      return;
    }

    let cancelled = false;
    (async () => {
      let access = false;
      try {
        // 1. Own paired device — instant, local storage.
        const hubId = await AsyncStorage.getItem(DEVICE_STORAGE_KEY);
        if (hubId) {
          access = true;
        } else {
          // 2. Ask the backend which hub this account can access (own or shared owner).
          // GET /accounts/device-access returns hub_id for own pairings or
          // device_access grants created from accepted share_invites.
          try {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token ?? null;
            if (token) {
              const res = await apiFetch("/accounts/device-access", {
                headers: { Authorization: `Bearer ${token}` },
                timeoutMs: 8_000,
              });
              if (res.ok) {
                const json = (await res.json().catch(() => null)) as {
                  hub_id?: string | null;
                  access_granted?: boolean;
                } | null;
                const apiHubId = json?.hub_id ?? null;
                if (apiHubId) {
                  // Persist locally so individual screens (home, device, MQTT, …)
                  // work without another API round trip.
                  await AsyncStorage.setItem(DEVICE_STORAGE_KEY, apiHubId);
                  access = true;
                } else if (json?.access_granted) {
                  access = true;
                }
              }
            }
          } catch {
            // Best-effort: an unreachable backend counts as "not shared".
          }

          // 3. Offline fallback: local shared-access flag set at invite-accept time.
          if (!access) {
            const sharedFlag = await AsyncStorage.getItem(SHARED_ACCESS_KEY);
            if (sharedFlag === "1") {
              access = true;
            }
          }
        }
      } catch {
        // Storage read failure — fail closed.
      }
      if (!cancelled) {
        setHasAccess(access);
        setGateReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, isLoggedIn]);

  // ---- Send accounts without a device (and without shared access) ---------
  // to the device page so they can pair a hub before reaching the UI.
  useEffect(() => {
    if (!gateReady || !isLoggedIn) return;
    const route = currentRoute.replace(/\/+$/, "") || "/";
    if (
      !hasAccess &&
      !isDeviceRoute(route) &&
      !AUTH_ROUTES.has(route)
    ) {
      router.replace("/pages/device");
    }
  }, [gateReady, hasAccess, isLoggedIn, currentRoute, router]);

  // Hold the splash until fonts + session + device gate resolve so the UI
  // never flashes before we know whether the account may enter.
  const splashReady = fontsLoaded && ready && gateReady;
  useEffect(() => {
    if (splashReady) SplashScreen.hideAsync().catch(() => {});
  }, [splashReady]);

  if (!splashReady) return null;

  return (
    <View style={{ flex: 1 }}>
      {/* Only mount the Network & MQTT banner for logged-in, non-setup routes */}
      {isLoggedIn && !isSetupScreen && <NetworkBanner />}
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "none",
          gestureEnabled: true,
        }}
      >
        <Stack.Screen
          name="login"
          options={{
            animation: "slide_from_right",
            animationDuration: 280,
          }}
        />
        <Stack.Screen
          name="forgot-password"
          options={{
            animation: "slide_from_right",
            animationDuration: 280,
          }}
        />
        <Stack.Screen
          name="signup"
          options={{
            animation: "slide_from_right",
            animationDuration: 280,
          }}
        />
      </Stack>
      <GlobalOverridesSheet />
      {isLoggedIn && isHomeScreen && <AppTourOverlay />}
    </View>
  );
}

function GlobalOverridesSheet() {
  const { overridesOpen, closeOverrides } = usePowerOverride();
  return <QuickOverridesModal visible={overridesOpen} onClose={closeOverrides} />;
}
