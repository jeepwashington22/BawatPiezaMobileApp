import { useState, useEffect } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from "expo-camera";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";

import { Card, scale } from "./glass-ui";
import { fonts, useTheme, type Mode, type ThemeColors } from "../theme";
import type { IoniconName } from "../lib/network";

/* ---------------------------------- model --------------------------------- */

type Step = {
  number: string;
  short: string;
  title: string;
  copy: string;
  icon: IoniconName;
};

const STEPS: Step[] = [
  {
    number: "01",
    short: "Power on",
    title: "Power on the IoT hub",
    copy: "Connect the hub to power and wait for the status light to pulse blue.",
    icon: "power-outline",
  },
  {
    number: "02",
    short: "Join network",
    title: "Join the same network",
    copy: "Keep your phone and hub on the facility Wi-Fi during setup.",
    icon: "wifi-outline",
  },
  {
    number: "03",
    short: "Scan code",
    title: "Scan the device code",
    copy: "Find the QR label on the hub or enter its code manually below.",
    icon: "scan-outline",
  },
];

const ACTIVE_STEP = 0;
const TOTAL_STEPS = 2;

const fs = (v: number) => Math.max(scale(v), v * 0.9);
const COLUMN_MAX = 560;

function themePalette(mode: Mode, c: ThemeColors) {
  const dark = mode === "dark";
  return {
    hero: (dark ? ["#1D1D1D", "#000000"] : ["#12406E", "#0A2A4A"]) as [
      string,
      string,
    ],
    heroBorder: dark ? "rgba(255,255,255,0.14)" : "rgba(255,255,255,0.10)",
    heroHalo: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.08)",
    heroEyebrow: dark ? "rgba(255,255,255,0.60)" : c.butter,
    heroIconBg: dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.14)",
    heroIconBorder: dark ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.18)",
    heroFill: dark ? "#FFFFFF" : c.butter,
    liveDot: dark ? "#FFFFFF" : "#5CE08A",
    liveDotRing: dark ? "#000000" : "#12406E",
    cta: (dark ? ["#FFFFFF", "#D9D9D9"] : ["#F5C245", "#E0A315"]) as [
      string,
      string,
    ],
    ctaInk: dark ? "#000000" : "#0A2A4A",
    ctaShadow: dark ? "#FFFFFF" : "#B87C05",
    scanCorner: dark ? "#FFFFFF" : c.butter,
  };
}

export function ProvisioningScreen() {
  const router = useRouter();
  const { colors: c, mode } = useTheme();
  const { width, height } = useWindowDimensions();
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const [ssid, setSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [showWifiPassword, setShowWifiPassword] = useState(false);
  const [focusedField, setFocusedField] = useState<"ssid" | "password" | null>(
    null,
  );

  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);
  const [torchOn, setTorchOn] = useState(false);

  // TOUR GUIDE STATE
  const [tourVisible, setTourVisible] = useState(false);

  const [isConnecting, setIsConnecting] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: "error" | "success" | "info";
    onConfirm?: () => void;
  }>({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const p = themePalette(mode, c);

  const compact = width < 375;
  const wide = width >= 700;
  const gutter = wide ? 24 : compact ? 14 : 20;
  const heroMinHeight = Math.max(148, Math.min(height * 0.24, 196));
  const scanFrame = Math.round(Math.min(width - 76, height * 0.38, 272));

  // Initialize Tour Guide Safely with a new storage key
  useEffect(() => {
    let isMounted = true;
    // We use a fresh key here so it ignores the old cached value from your testing
    AsyncStorage.getItem("bawatpieza_tour_seen_modal").then((seen) => {
      if (isMounted && !seen) {
        setTourVisible(true);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  const dismissTour = () => {
    setTourVisible(false);
    AsyncStorage.setItem("bawatpieza_tour_seen_modal", "true");
  };

  const handleSsidChange = (text: string) => {
    setSsid(text);
  };

  const handlePasswordChange = (text: string) => {
    setWifiPassword(text);
  };

  const showModal = (
    title: string,
    message: string,
    type: "error" | "success" | "info",
    onConfirm?: () => void,
  ) => {
    setModalConfig({ visible: true, title, message, type, onConfirm });
  };

  const closeModal = () => {
    const { onConfirm } = modalConfig;
    setModalConfig((prev) => ({ ...prev, visible: false }));
    if (onConfirm) onConfirm();
  };

  const openWifiSettings = () => {
    const open =
      Platform.OS === "android"
        ? Linking.sendIntent("android.settings.WIFI_SETTINGS")
        : Linking.openSettings();
    void open.catch(() => Linking.openSettings().catch(() => undefined));
  };

  const simulatePair = () => {
    router.replace("/home");
  };

  const connectToHub = async () => {
    if (!ssid || !wifiPassword) {
      showModal(
        "Missing Details",
        "Please enter your Wi-Fi name and password.",
        "error",
      );
      return;
    }

    setIsConnecting(true);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8-second timeout to prevent app hanging

    try {
      const formData = new URLSearchParams();
      formData.append("ssid", ssid);
      formData.append("pass", wifiPassword);

      const response = await fetch("http://192.168.4.1/connect-hub", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        if (data.status === "success") {
          const hubId = data.hub_id;
          await AsyncStorage.setItem("bawatpieza_hub_id", hubId);

          setIsConnecting(false);
          // Explicitly warn them to reconnect internet before continuing to avoid MQTT crash on Home Screen
          showModal(
            "Hub Configured!",
            "The hub is successfully joining your network.\n\nIMPORTANT: Reconnect your phone to your normal Wi-Fi (with internet) before tapping Continue.",
            "success",
            () => {
              router.replace({
                pathname: "/home",
                params: { hubId: hubId },
              });
            },
          );
        } else {
          setIsConnecting(false);
          showModal(
            "Error",
            "The hub rejected the connection. Try again.",
            "error",
          );
        }
      } else {
        setIsConnecting(false);
        showModal(
          "Error",
          "The hub rejected the connection. Try again.",
          "error",
        );
      }
    } catch (error) {
      clearTimeout(timeout);
      setIsConnecting(false);
      showModal(
        "Connection Failed",
        "Could not reach the hub. Ensure your phone is connected to the 'BawatPieza-Setup' network. Ignore any 'No Internet' warnings from your phone.",
        "error",
      );
    }
  };

  const closeScanner = () => {
    setScannerVisible(false);
    setTorchOn(false);
  };

  const openScanner = async () => {
    setScanLocked(false);
    setTorchOn(false);
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) return;
    }
    setScannerVisible(true);
  };

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanLocked) return;
    const wifi = parseWifiQr(data);

    if (!wifi) {
      setScanLocked(true);
      showModal(
        "Not a Wi-Fi QR code",
        "Scan a Wi-Fi sharing QR code or enter the network details manually.",
        "error",
        () => {
          setScanLocked(false);
          closeScanner();
        },
      );
      return;
    }

    if (wifi.isRaw) {
      showModal(
        "Notice",
        "Could not read full credentials. Raw data set as Wi-Fi Name.",
        "info",
      );
    }

    setSsid(wifi.ssid);
    setWifiPassword(wifi.password);
    closeScanner();
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bg }]}>
      <KeyboardAvoidingView
        style={styles.safeArea}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingHorizontal: gutter, paddingBottom: scale(30) },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.column}>
            <View style={styles.topRow}>
              <View style={[styles.brandMark, { backgroundColor: c.accent }]}>
                <Ionicons name="flash" size={fs(19)} color={c.onAccent} />
              </View>
              <View style={styles.topLabelWrap}>
                <View
                  style={[styles.liveDot, { backgroundColor: p.liveDot }]}
                />
                <Text style={[styles.topLabel, { color: c.muted }]}>
                  DEVICE SETUP
                </Text>
              </View>
              <Pressable
                onPress={simulatePair}
                accessibilityRole="button"
                accessibilityLabel="Skip device setup"
                style={({ pressed }) => [
                  styles.skipPill,
                  { borderColor: c.line, backgroundColor: c.surface },
                  pressed && styles.pressed,
                ]}
              >
                <Text style={[styles.skipText, { color: c.text }]}>Skip</Text>
                <Ionicons name="arrow-forward" size={fs(13)} color={c.text} />
              </Pressable>
            </View>

            <View style={styles.intro}>
              <Text style={[styles.eyebrow, { color: c.orange }]}>
                WELCOME TO BAWATPIEZA
              </Text>
              <Text style={[styles.title, { color: c.text }]}>
                Connect your energy hub
              </Text>
              <Text style={[styles.subtitle, { color: c.muted }]}>
                A few quick steps to bring your smart floor online.
              </Text>
            </View>

            <LinearGradient
              colors={p.hero}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[
                styles.hero,
                { minHeight: heroMinHeight, borderColor: p.heroBorder },
              ]}
            >
              <View
                style={[styles.heroHalo, { backgroundColor: p.heroHalo }]}
              />
              <View style={styles.heroTop}>
                <View
                  style={[
                    styles.heroIcon,
                    {
                      backgroundColor: p.heroIconBg,
                      borderColor: p.heroIconBorder,
                    },
                  ]}
                >
                  <Ionicons name="wifi" size={fs(30)} color="#FFFFFF" />
                  <View
                    style={[
                      styles.heroLiveDot,
                      {
                        backgroundColor: p.liveDot,
                        borderColor: p.liveDotRing,
                      },
                    ]}
                  />
                </View>
                <View style={styles.heroCopy}>
                  <Text style={[styles.heroEyebrow, { color: p.heroEyebrow }]}>
                    STEP 1 OF 2
                  </Text>
                  <Text style={styles.heroTitle}>Connect to the hub</Text>
                  <Text style={styles.heroSubtitle}>
                    Join BawatPieza-Setup, then return here to finish the
                    connection.
                  </Text>
                </View>
              </View>
              <View style={styles.heroFooter}>
                <View style={styles.heroTrack}>
                  <View
                    style={[
                      styles.heroFill,
                      { flex: ACTIVE_STEP + 1, backgroundColor: p.heroFill },
                    ]}
                  />
                  <View style={{ flex: TOTAL_STEPS - ACTIVE_STEP - 1 }} />
                </View>
                <Text style={styles.heroPercent}>
                  {Math.round(((ACTIVE_STEP + 1) / TOTAL_STEPS) * 100)}% of
                  setup complete
                </Text>
              </View>
            </LinearGradient>

            <View style={styles.steps}>
              {STEPS.map((step, index) => {
                const active = index === ACTIVE_STEP;
                const done = index < ACTIVE_STEP;
                return (
                  <View
                    key={step.number}
                    style={styles.stepItem}
                    accessibilityRole="text"
                    accessibilityLabel={`Step ${step.number} of ${STEPS.length}. ${step.title}. ${step.copy}`}
                  >
                    <View style={styles.stepRail}>
                      {index < STEPS.length - 1 && (
                        <View
                          style={[styles.stepLine, { backgroundColor: c.line }]}
                        />
                      )}
                      <View
                        style={[
                          styles.stepBadge,
                          active
                            ? {
                                backgroundColor: c.accent,
                                borderColor: c.accent,
                              }
                            : {
                                backgroundColor: c.surfaceMuted,
                                borderColor: c.line,
                              },
                        ]}
                      >
                        <Ionicons
                          name={done ? "checkmark" : step.icon}
                          size={fs(15)}
                          color={active ? c.onAccent : c.muted}
                        />
                      </View>
                    </View>
                    <Text
                      style={[
                        styles.stepNumber,
                        { color: active ? c.orange : c.muted },
                      ]}
                    >
                      {step.number}
                    </Text>
                    <Text
                      style={[
                        styles.stepLabel,
                        { color: active ? c.text : c.muted },
                      ]}
                      numberOfLines={2}
                    >
                      {step.short}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Card
              mode={mode}
              style={[
                styles.card,
                tourVisible && { borderColor: "#F97316", borderWidth: 2 },
              ]}
            >
              <View style={styles.cardHead}>
                <View style={styles.cardHeadCopy}>
                  <Text style={[styles.cardEyebrow, { color: c.orange }]}>
                    NETWORK DETAILS
                  </Text>
                  <Text style={[styles.cardTitle, { color: c.text }]}>
                    Finish your connection
                  </Text>
                </View>
                <View
                  style={[
                    styles.secureBadge,
                    { backgroundColor: c.accentSoft },
                  ]}
                >
                  <Ionicons
                    name="shield-checkmark-outline"
                    size={fs(17)}
                    color={c.onAccentSoft}
                  />
                </View>
              </View>
              <Text style={[styles.cardCopy, { color: c.muted }]}>
                Use the same Wi-Fi network your hub will use.
              </Text>

              {/* Disclaimer to soothe users worried about the OS "No Internet" prompt */}
              <View
                style={[
                  styles.disclaimerBox,
                  { backgroundColor: c.surfaceMuted, borderColor: c.line },
                ]}
              >
                <Ionicons
                  name="information-circle"
                  size={14}
                  color={c.accent}
                />
                <Text style={[styles.disclaimerText, { color: c.muted }]}>
                  It is completely normal for your phone to display a "No
                  Internet Connection" warning during this step.
                </Text>
              </View>

              <Pressable
                onPress={openWifiSettings}
                accessibilityRole="button"
                accessibilityLabel="Open Wi-Fi settings"
                style={({ pressed }) => [
                  styles.outlineButton,
                  { borderColor: c.accent, backgroundColor: c.surfaceMuted },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="settings-outline"
                  size={fs(16)}
                  color={c.accent}
                />
                <Text style={[styles.outlineText, { color: c.accent }]}>
                  Open Wi-Fi Settings
                </Text>
              </Pressable>

              <Text style={[styles.fieldLabel, { color: c.muted }]}>
                HOME WI-FI NAME
              </Text>
              <View
                style={[
                  styles.inputRow,
                  {
                    backgroundColor: c.surfaceMuted,
                    borderColor: focusedField === "ssid" ? c.accent : c.line,
                  },
                ]}
              >
                <TextInput
                  value={ssid}
                  onChangeText={handleSsidChange}
                  onFocus={() => setFocusedField("ssid")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="e.g. UCC-Staff-5G"
                  placeholderTextColor={c.muted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { color: c.text }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Scan Wi-Fi QR code"
                  onPress={openScanner}
                  hitSlop={8}
                  style={({ pressed }) => [
                    styles.inputAction,
                    { backgroundColor: c.accentSoft },
                    pressed && styles.pressed,
                  ]}
                >
                  <Ionicons
                    name="qr-code-outline"
                    size={fs(16)}
                    color={c.onAccentSoft}
                  />
                </Pressable>
              </View>
              <Text style={[styles.fieldLabel, { color: c.muted }]}>
                WI-FI PASSWORD
              </Text>
              <View
                style={[
                  styles.inputRow,
                  {
                    backgroundColor: c.surfaceMuted,
                    borderColor:
                      focusedField === "password" ? c.accent : c.line,
                  },
                ]}
              >
                <TextInput
                  value={wifiPassword}
                  onChangeText={handlePasswordChange}
                  onFocus={() => setFocusedField("password")}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Enter password"
                  placeholderTextColor={c.muted}
                  secureTextEntry={!showWifiPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={[styles.input, { color: c.text }]}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={
                    showWifiPassword
                      ? "Hide Wi-Fi password"
                      : "Show Wi-Fi password"
                  }
                  onPress={() => setShowWifiPassword((value) => !value)}
                  hitSlop={8}
                  style={styles.eyeButton}
                >
                  <Ionicons
                    name={showWifiPassword ? "eye-off-outline" : "eye-outline"}
                    size={fs(18)}
                    color={c.muted}
                  />
                </Pressable>
              </View>

              <Pressable
                onPress={connectToHub}
                disabled={isConnecting}
                accessibilityRole="button"
                accessibilityLabel="Connect hub"
                style={({ pressed }) => [
                  styles.cta,
                  { shadowColor: p.ctaShadow },
                  pressed && !isConnecting && styles.ctaPressed,
                  isConnecting && { opacity: 0.7 },
                ]}
              >
                <LinearGradient
                  colors={p.cta}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={StyleSheet.absoluteFill}
                />
                {isConnecting ? (
                  <ActivityIndicator size="small" color={p.ctaInk} />
                ) : (
                  <>
                    <Ionicons
                      name="arrow-forward-circle-outline"
                      size={fs(19)}
                      color={p.ctaInk}
                    />
                    <Text style={[styles.ctaText, { color: p.ctaInk }]}>
                      Connect hub
                    </Text>
                  </>
                )}
              </Pressable>

              <View style={styles.noteRow}>
                <Ionicons
                  name="lock-closed-outline"
                  size={fs(13)}
                  color={c.muted}
                />
                <Text style={[styles.note, { color: c.muted }]}>
                  Your network details stay securely on this device.
                </Text>
              </View>
            </Card>

            <View style={styles.helperRow}>
              <Ionicons
                name="information-circle-outline"
                size={fs(16)}
                color={c.muted}
              />
              <Text style={[styles.helperText, { color: c.muted }]}>
                Hub not showing up? Confirm its status light is pulsing blue,
                then run the scan again.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* TOUR GUIDE MODAL */}
      <Modal
        visible={tourVisible}
        transparent
        animationType="fade"
        onRequestClose={dismissTour}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <View style={styles.modalHeader}>
              <View
                style={[
                  styles.modalIconBox,
                  { backgroundColor: "rgba(249, 115, 22, 0.15)" },
                ]}
              >
                <Ionicons name="map" size={28} color="#F97316" />
              </View>
              <Text style={[styles.modalTitle, { color: c.text }]}>
                Setup Guide
              </Text>
            </View>
            <Text style={[styles.modalMessage, { color: c.muted }]}>
              Welcome! To view your dashboard, you need to pair your first hub.
              Join the hub's Wi-Fi network, then enter your home network details
              below.
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.modalButton,
                { backgroundColor: "#F97316" },
                pressed && { opacity: 0.8 },
              ]}
              onPress={dismissTour}
            >
              <Text style={[styles.modalButtonText, { color: "#FFFFFF" }]}>
                Got it
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* CUSTOM FEEDBACK MODAL REPLACING NATIVE ALERTS */}
      <Modal
        visible={modalConfig.visible}
        transparent
        animationType="fade"
        onRequestClose={closeModal}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <View style={styles.modalHeader}>
              <View
                style={[
                  styles.modalIconBox,
                  {
                    backgroundColor:
                      modalConfig.type === "error"
                        ? "rgba(239, 68, 68, 0.1)"
                        : modalConfig.type === "success"
                          ? "rgba(34, 197, 94, 0.1)"
                          : "rgba(59, 130, 246, 0.1)",
                  },
                ]}
              >
                <Ionicons
                  name={
                    modalConfig.type === "error"
                      ? "close-circle"
                      : modalConfig.type === "success"
                        ? "checkmark-circle"
                        : "information-circle"
                  }
                  size={26}
                  color={
                    modalConfig.type === "error"
                      ? "#EF4444"
                      : modalConfig.type === "success"
                        ? "#22C55E"
                        : "#3B82F6"
                  }
                />
              </View>
              <Text style={[styles.modalTitle, { color: c.text }]}>
                {modalConfig.title}
              </Text>
            </View>
            <Text style={[styles.modalMessage, { color: c.muted }]}>
              {modalConfig.message}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.modalButton,
                { backgroundColor: c.accent },
                pressed && { opacity: 0.8 },
              ]}
              onPress={closeModal}
            >
              <Text style={[styles.modalButtonText, { color: c.onAccent }]}>
                {modalConfig.type === "success" ? "Continue" : "Got it"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* QR SCANNER MODAL */}
      <Modal
        visible={scannerVisible}
        animationType="fade"
        onRequestClose={closeScanner}
        statusBarTranslucent
      >
        <View style={styles.scannerScreen}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchOn}
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned}
          />

          {/* Dimmed bands leave a clear window so the camera stays bright where the code sits. */}
          <View style={styles.scannerBands} pointerEvents="none">
            <View style={styles.scannerBand} />
            <View style={styles.scannerMiddleRow}>
              <View style={styles.scannerBand} />
              <View style={{ width: scanFrame, height: scanFrame }}>
                {(["tl", "tr", "bl", "br"] as const).map((corner) => (
                  <View
                    key={corner}
                    style={[
                      styles.corner,
                      CORNERS[corner],
                      { borderColor: p.scanCorner },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.scannerBand} />
            </View>
            <View style={styles.scannerBand} />
          </View>
          <SafeAreaView style={styles.scannerChrome} pointerEvents="box-none">
            <View style={styles.scannerHeader}>
              <Pressable
                onPress={closeScanner}
                accessibilityRole="button"
                accessibilityLabel="Close QR scanner"
                hitSlop={8}
                style={({ pressed }) => [
                  styles.scannerIconButton,
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons name="close" size={fs(19)} color="#FFFFFF" />
              </Pressable>
              <Text style={styles.scannerTitle}>Scan Wi-Fi QR code</Text>
              <Pressable
                onPress={() => setTorchOn((value) => !value)}
                accessibilityRole="button"
                accessibilityLabel={
                  torchOn ? "Turn off flashlight" : "Turn on flashlight"
                }
                hitSlop={8}
                style={({ pressed }) => [
                  styles.scannerIconButton,
                  torchOn && {
                    backgroundColor: p.scanCorner,
                    borderColor: p.scanCorner,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <Ionicons
                  name="flashlight-outline"
                  size={fs(18)}
                  color={torchOn ? "#000000" : "#FFFFFF"}
                />
              </Pressable>
            </View>

            <View style={styles.scannerFooter}>
              <View style={styles.hintChip}>
                <Ionicons name="scan-outline" size={fs(14)} color="#FFFFFF" />
                <Text style={styles.scannerHint}>
                  Center the Wi-Fi QR code in the frame
                </Text>
              </View>
              <Text style={styles.scannerSubHint}>
                Wi-Fi share codes begin with WIFI:
              </Text>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

/* -------------------------------- utilities ------------------------------- */

/** Parses standard WIFI share codes, or falls back to raw text extraction */
function parseWifiQr(
  data: string,
): { ssid: string; password: string; isRaw?: boolean } | null {
  const raw = data.trim();
  let ssid = "";
  let password = "";

  const ssidMatch = raw.match(/S:(.*?)(?:;|$)/i);
  const passMatch = raw.match(/P:(.*?)(?:;|$)/i);

  if (ssidMatch) {
    ssid = ssidMatch[1];
    if (passMatch) password = passMatch[1];
  } else if (raw.includes(",")) {
    const parts = raw.split(",");
    if (parts.length >= 2) {
      ssid = parts[0].trim();
      password = parts[1].trim();
    }
  } else if (raw.includes(" ")) {
    const lastSpaceIndex = raw.lastIndexOf(" ");
    if (lastSpaceIndex > 0) {
      ssid = raw.substring(0, lastSpaceIndex).trim();
      password = raw.substring(lastSpaceIndex + 1).trim();
    }
  }

  if (ssid) {
    return { ssid, password };
  } else if (raw) {
    return { ssid: raw, password: "", isRaw: true };
  }

  return null;
}

/* --------------------------------- styles --------------------------------- */

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  column: { width: "100%", maxWidth: COLUMN_MAX, alignSelf: "center" },
  pressed: { opacity: 0.7 },

  /* header */
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(11),
    paddingTop: scale(8),
    marginBottom: scale(20),
  },
  brandMark: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(14),
    alignItems: "center",
    justifyContent: "center",
  },
  topLabelWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: scale(7),
  },
  liveDot: { width: scale(7), height: scale(7), borderRadius: 99 },
  topLabel: {
    fontSize: fs(10),
    letterSpacing: 1.6,
    fontFamily: fonts.extrabold,
  },
  skipPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
    borderWidth: 1,
    borderRadius: 99,
    paddingHorizontal: scale(13),
    paddingVertical: scale(8),
  },
  skipText: { fontSize: fs(12), fontFamily: fonts.bold },

  /* intro */
  intro: { marginBottom: scale(18) },
  eyebrow: { fontSize: fs(11), letterSpacing: 2, fontFamily: fonts.extrabold },
  title: {
    fontSize: fs(27),
    lineHeight: fs(33),
    letterSpacing: -0.5,
    marginTop: scale(6),
    fontFamily: fonts.extrabold,
  },
  subtitle: {
    fontSize: fs(13.5),
    lineHeight: fs(20),
    marginTop: scale(7),
    fontFamily: fonts.medium,
  },

  /* hero */
  hero: {
    borderRadius: scale(26),
    borderWidth: 1,
    padding: scale(18),
    overflow: "hidden",
    justifyContent: "space-between",
    shadowColor: "#0A2A4A",
    shadowOpacity: 0.22,
    shadowRadius: scale(18),
    shadowOffset: { width: 0, height: scale(10) },
    elevation: 6,
  },
  heroHalo: {
    position: "absolute",
    width: scale(190),
    height: scale(190),
    borderRadius: 999,
    right: scale(-64),
    top: scale(-72),
  },
  heroTop: { flexDirection: "row", alignItems: "center", gap: scale(14) },
  heroIcon: {
    width: scale(64),
    height: scale(64),
    borderRadius: scale(22),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  heroLiveDot: {
    position: "absolute",
    width: scale(10),
    height: scale(10),
    borderRadius: 99,
    right: scale(9),
    top: scale(9),
    borderWidth: 2,
  },
  heroCopy: { flex: 1 },
  heroEyebrow: {
    fontSize: fs(9.5),
    letterSpacing: 1.8,
    fontFamily: fonts.extrabold,
  },
  heroTitle: {
    color: "#FFFFFF",
    fontSize: fs(21),
    lineHeight: fs(26),
    marginTop: scale(4),
    fontFamily: fonts.extrabold,
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.76)",
    fontSize: fs(11.5),
    lineHeight: fs(17),
    marginTop: scale(6),
    fontFamily: fonts.medium,
  },
  heroFooter: { marginTop: scale(16) },
  heroTrack: {
    flexDirection: "row",
    height: scale(6),
    borderRadius: 99,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  heroFill: { height: "100%", borderRadius: 99 },
  heroPercent: {
    color: "rgba(255,255,255,0.66)",
    fontSize: fs(9.5),
    letterSpacing: 0.8,
    marginTop: scale(7),
    fontFamily: fonts.bold,
  },
  /* step indicator */
  steps: {
    flexDirection: "row",
    marginTop: scale(18),
    marginBottom: scale(20),
  },
  stepItem: { flex: 1, alignItems: "center", paddingHorizontal: scale(2) },
  stepRail: { width: "100%", alignItems: "center" },
  stepLine: {
    position: "absolute",
    top: scale(15),
    left: "50%",
    width: "100%",
    height: StyleSheet.hairlineWidth,
  },
  stepBadge: {
    width: scale(30),
    height: scale(30),
    borderRadius: 99,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumber: {
    fontSize: fs(9),
    letterSpacing: 1.2,
    marginTop: scale(7),
    fontFamily: fonts.extrabold,
  },
  stepLabel: {
    fontSize: fs(10.5),
    lineHeight: fs(14),
    marginTop: scale(2),
    textAlign: "center",
    fontFamily: fonts.bold,
  },

  /* network card */
  card: { padding: scale(18), borderRadius: scale(24) },
  cardHead: { flexDirection: "row", alignItems: "flex-start", gap: scale(12) },
  cardHeadCopy: { flex: 1 },
  cardEyebrow: {
    fontSize: fs(10),
    letterSpacing: 1.4,
    fontFamily: fonts.extrabold,
  },
  cardTitle: {
    fontSize: fs(17),
    marginTop: scale(3),
    fontFamily: fonts.extrabold,
  },
  secureBadge: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(13),
    alignItems: "center",
    justifyContent: "center",
  },
  cardCopy: {
    fontSize: fs(11.5),
    lineHeight: fs(17),
    marginTop: scale(8),
    fontFamily: fonts.medium,
  },

  /* Disclaimer Box */
  disclaimerBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
    marginTop: scale(14),
    padding: scale(10),
    borderWidth: 1,
    borderRadius: scale(10),
  },
  disclaimerText: {
    flex: 1,
    fontSize: fs(10),
    fontFamily: fonts.medium,
    lineHeight: fs(14),
  },

  outlineButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(8),
    height: scale(50),
    borderRadius: scale(16),
    borderWidth: 1,
    marginTop: scale(16),
  },
  outlineText: { fontSize: fs(12.5), fontFamily: fonts.bold },

  /* fields */
  fieldLabel: {
    fontSize: fs(10),
    letterSpacing: 1.2,
    marginTop: scale(18),
    marginBottom: scale(7),
    fontFamily: fonts.extrabold,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: scale(52),
    borderRadius: scale(16),
    borderWidth: 1,
    paddingLeft: scale(14),
    paddingRight: scale(8),
    gap: scale(8),
  },
  input: {
    flex: 1,
    fontSize: fs(13.5),
    paddingVertical: scale(12),
    fontFamily: fonts.medium,
  },
  inputAction: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    alignItems: "center",
    justifyContent: "center",
  },
  eyeButton: {
    width: scale(38),
    height: scale(38),
    alignItems: "center",
    justifyContent: "center",
  },

  /* primary action */
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(9),
    height: scale(54),
    borderRadius: scale(18),
    overflow: "hidden",
    marginTop: scale(20),
    shadowOpacity: 0.28,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: scale(6) },
    elevation: 4,
  },
  ctaPressed: { transform: [{ scale: 0.985 }] },
  ctaText: { fontSize: fs(14), fontFamily: fonts.extrabold },
  noteRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(6),
    marginTop: scale(14),
  },
  note: { fontSize: fs(10), fontFamily: fonts.medium },

  /* footer hint */
  helperRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: scale(8),
    marginTop: scale(16),
    paddingHorizontal: scale(2),
  },
  helperText: {
    flex: 1,
    fontSize: fs(11),
    lineHeight: fs(16),
    fontFamily: fonts.medium,
  },

  /* scanner sheet */
  scannerScreen: { flex: 1, backgroundColor: "#000000" },
  scannerBands: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
  scannerBand: { flex: 1, backgroundColor: "rgba(0,0,0,0.62)" },
  scannerMiddleRow: { flexDirection: "row" },
  corner: {
    position: "absolute",
    width: scale(28),
    height: scale(28),
    borderWidth: scale(3.5),
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: scale(18),
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: scale(18),
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: scale(18),
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: scale(18),
  },
  scannerChrome: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "space-between",
  },
  scannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(12),
    paddingHorizontal: scale(18),
    paddingTop: scale(10),
  },
  scannerTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: fs(16),
    textAlign: "center",
    fontFamily: fonts.extrabold,
  },
  scannerIconButton: {
    width: scale(42),
    height: scale(42),
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  scannerFooter: {
    alignItems: "center",
    gap: scale(9),
    paddingHorizontal: scale(24),
    paddingBottom: scale(28),
  },
  hintChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(7),
    paddingHorizontal: scale(14),
    paddingVertical: scale(9),
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  scannerHint: { color: "#FFFFFF", fontSize: fs(12), fontFamily: fonts.bold },
  scannerSubHint: {
    color: "rgba(255,255,255,0.62)",
    fontSize: fs(10.5),
    textAlign: "center",
    fontFamily: fonts.medium,
  },

  /* CUSTOM FEEDBACK MODALS */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  modalCard: {
    width: "85%",
    maxWidth: 290,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    alignItems: "center",
  },
  modalHeader: {
    alignItems: "center",
    marginBottom: 12,
  },
  modalIconBox: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 17,
    fontFamily: fonts.extrabold,
    textAlign: "center",
  },
  modalMessage: {
    fontSize: 13,
    fontFamily: fonts.medium,
    textAlign: "center",
    lineHeight: 18,
    marginBottom: 20,
  },
  modalButton: {
    width: "100%",
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  modalButtonText: {
    fontSize: 14,
    fontFamily: fonts.extrabold,
  },
});

/** Viewfinder corner brackets, keyed so the JSX loop stays type-safe. */
const CORNERS = {
  tl: styles.cornerTL,
  tr: styles.cornerTR,
  bl: styles.cornerBL,
  br: styles.cornerBR,
} as const;
