import { useEffect } from "react";
import { View } from "react-native";
import { Stack, useSegments } from "expo-router";
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
import { AuthGate } from "../hooks/use-auth-gate";
import { NetworkBanner } from "../components/network-banner";

// Keep the splash visible until fonts + root layout are ready,
// then hide it so the app (login screen) is actually rendered.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Poppins_400Regular,
    Poppins_500Medium,
    Poppins_600SemiBold,
    Poppins_700Bold,
    Poppins_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <ThemeProvider>
      <AuthProvider>
        <AuthGate>
          <AuthedShell />
        </AuthGate>
      </AuthProvider>
    </ThemeProvider>
  );
}

/**
 * Inner shell — reads the session so it can hold the splash screen until the
 * session check finishes, and hides the network banner on setup screens.
 * Uses `useSegments` (static-safe) instead of pathname matching where possible.
 */
function AuthedShell() {
  const { ready, isLoggedIn } = useAuth();
  const segments = useSegments();

  // Hold the splash until fonts + session are resolved: no protected link can
  // render for a logged-out user, and no login flash for a logged-in one.
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  // Same setup-screen exclusion as before: never mount the Network & MQTT
  // banner while configuring a hub.
  const currentRoute = segments.join("/").toLowerCase();
  const isSetupScreen =
    currentRoute.includes("provisioning") ||
    currentRoute.includes("device") ||
    currentRoute.includes("setup");

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
      />
    </View>
  );
}
