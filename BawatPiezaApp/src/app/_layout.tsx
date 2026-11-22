import { useEffect, useRef, useState } from "react";
import { DeviceEventEmitter, Modal, Pressable, StyleSheet, View } from "react-native";
import { Stack, usePathname } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { Ionicons } from "@expo/vector-icons";
import {
  useFonts,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
  Poppins_800ExtraBold,
} from "@expo-google-fonts/poppins";

import { ThemeProvider, useTheme } from "../theme";
import { AuthProvider, useAuth } from "../hooks/use-auth";
import { PowerOverrideProvider, usePowerOverride } from "../hooks/use-power-override";
import { AuthGate } from "../hooks/use-auth-gate";
import { AppTourProvider } from "../hooks/use-app-tour";
import { NetworkBanner } from "../components/network-banner";
import { QuickOverridesModal } from "../components/quick-overrides-modal";
import { SmokeEmergencyModal } from "../components/smoke-emergency-modal";
import { AppTourOverlay } from "../components/app-tour-overlay";
import { AppText as Text } from "../components/app-text";

import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../lib/supabase";
import { apiFetch } from "../lib/api";
import { DEVICE_ACCESS_CHANGED_EVENT } from "../components/device-status-banner";
import { registerPushNotifications } from "../lib/push-notifications";

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
  const { ready, isLoggedIn, session } = useAuth();
  const pathname = usePathname();

  const currentRoute = pathname.toLowerCase();
  useEffect(() => {
    if (!ready || !isLoggedIn || !session?.access_token) return;
    void registerPushNotifications(session.access_token).catch((error) => {
      console.warn("[push-notifications] registration failed", error);
    });
  }, [ready, isLoggedIn, session?.access_token]);
  const isSetupScreen =
    currentRoute.includes("provisioning") ||
    currentRoute.includes("device") ||
    currentRoute.includes("setup");

  // ---- Device-access cache refresh --------------------------------------
  const [gateReady, setGateReady] = useState(false);
  const accessVersionRef = useRef(0);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      DEVICE_ACCESS_CHANGED_EVENT,
      () => {
        accessVersionRef.current += 1;
      },
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!ready) {
      setGateReady(false);
      return;
    }
    if (!isLoggedIn) {
      setGateReady(true);
      return;
    }

    let cancelled = false;
    let checking = false;
    const refreshAccess = async () => {
      if (checking) return;
      checking = true;
      const accessVersion = accessVersionRef.current;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token ?? null;
        if (!token) {
          if (cancelled || accessVersion !== accessVersionRef.current) return;
          await Promise.all([
            AsyncStorage.removeItem(DEVICE_STORAGE_KEY),
            AsyncStorage.removeItem(SHARED_ACCESS_KEY),
          ]);
          return;
        }

        const res = await apiFetch("/accounts/device-access", {
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 8_000,
        });
        if (!res.ok) {
          throw new Error(`Device access check failed (${res.status})`);
        }
        const json = (await res.json()) as {
          hub_id?: string | null;
          access_granted?: boolean;
          can_unlink?: boolean;
        };
        const apiHubId = json.hub_id ?? null;
        if (cancelled || accessVersion !== accessVersionRef.current) return;
        if (json.access_granted && apiHubId) {
          await AsyncStorage.setItem(DEVICE_STORAGE_KEY, apiHubId);
          if (json.can_unlink === false) {
            await AsyncStorage.setItem(SHARED_ACCESS_KEY, "1");
          } else {
            await AsyncStorage.removeItem(SHARED_ACCESS_KEY);
          }
        } else {
          await Promise.all([
            AsyncStorage.removeItem(DEVICE_STORAGE_KEY),
            AsyncStorage.removeItem(SHARED_ACCESS_KEY),
          ]);
        }
      } catch (error) {
        console.warn("[device-access] failed to refresh access", error);
      } finally {
        if (!cancelled) setGateReady(true);
        checking = false;
      }
    };

    void refreshAccess();
    const interval = setInterval(() => void refreshAccess(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ready, isLoggedIn]);

  // Hold the splash until fonts, auth, and the initial device-cache refresh resolve.
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
          name="(auth)/login"
          options={{
            animation: "slide_from_right",
            animationDuration: 280,
          }}
        />
        <Stack.Screen
          name="(auth)/forgot-password"
          options={{
            animation: "slide_from_right",
            animationDuration: 280,
          }}
        />
        <Stack.Screen
          name="(auth)/signup"
          options={{
            animation: "slide_from_right",
            animationDuration: 280,
          }}
        />
      </Stack>
      <GlobalOverridesSheet />
      <GlobalGridUnavailableConfirmation />
      <GlobalSmokeEmergency />
      {isLoggedIn && (currentRoute === "/home" || currentRoute === "/") && (
        <AppTourOverlay />
      )}
    </View>
  );
}

function GlobalOverridesSheet() {
  const { overridesOpen, closeOverrides } = usePowerOverride();
  return <QuickOverridesModal visible={overridesOpen} onClose={closeOverrides} />;
}

function GlobalGridUnavailableConfirmation() {
  const { colors: c, fonts: f } = useTheme();
  const {
    gridUnavailableConfirmationOpen,
    confirmGridUnavailable,
    cancelGridUnavailable,
  } = usePowerOverride();

  return (
    <Modal
      visible={gridUnavailableConfirmationOpen}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={cancelGridUnavailable}
    >
      <View style={gridConfirmationStyles.overlay}>
        <View
          style={[
            gridConfirmationStyles.card,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
          accessibilityViewIsModal
        >
          <View style={[gridConfirmationStyles.iconWrap, { backgroundColor: `${c.orange}18` }]}>
            <Ionicons name="warning-outline" size={30} color={c.orange} />
          </View>
          <Text style={[gridConfirmationStyles.title, { color: c.text, fontFamily: f.extrabold }]}>
            Grid power is unavailable
          </Text>
          <Text style={[gridConfirmationStyles.message, { color: c.muted, fontFamily: f.regular }]}>
            The hub currently reports no grid input. Trying to switch to Grid may leave the
            system on Battery. Do you want to continue?
          </Text>
          <View style={gridConfirmationStyles.actions}>
            <Pressable
              onPress={cancelGridUnavailable}
              style={({ pressed }) => [
                gridConfirmationStyles.button,
                gridConfirmationStyles.cancelButton,
                { borderColor: c.line },
                pressed && gridConfirmationStyles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={{ color: c.text, fontFamily: f.semibold }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={confirmGridUnavailable}
              style={({ pressed }) => [
                gridConfirmationStyles.button,
                { backgroundColor: c.orange },
                pressed && gridConfirmationStyles.pressed,
              ]}
              accessibilityRole="button"
            >
              <Text style={{ color: "#FFFFFF", fontFamily: f.bold }}>Try Grid</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function GlobalSmokeEmergency() {
  const { smokeEmergencyActive, smokeEmergencyZone } = usePowerOverride();
  return <SmokeEmergencyModal visible={smokeEmergencyActive} zone={smokeEmergencyZone} />;
}

const gridConfirmationStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(10, 15, 20, 0.58)",
  },
  card: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 22,
    padding: 22,
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: { fontSize: 18, textAlign: "center" },
  message: { fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
  actions: { flexDirection: "row", gap: 10, width: "100%", marginTop: 22 },
  button: {
    flex: 1,
    minHeight: 46,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  cancelButton: { backgroundColor: "transparent", borderWidth: 1 },
  pressed: { opacity: 0.75 },
});
