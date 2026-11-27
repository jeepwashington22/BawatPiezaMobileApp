import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, useTheme } from "../theme";
import { scale } from "./glass-ui";
import { usePowerOverride } from "../hooks/use-power-override";

type PowerMode = "grid" | "battery" | "shutdown";

type Props = {
  visible: boolean;
  onClose: () => void;
  liveMode?: PowerMode | null;
};

/** Brand orange — every accent inside the sheet is built from these three stops. */
const ORANGE = "#F97316";
const ORANGE_STOPS: [string, string, string] = [
  "#FB923C",
  "#F97316",
  "#EA580C",
];
const GRID_GREEN = "#16A34A";
const GRID_STOPS: [string, string, string] = ["#4ADE80", "#22C55E", "#16A34A"];
const SHUTDOWN_RED = "#DC2626";
const SHUTDOWN_STOPS: [string, string, string] = [
  "#F87171",
  "#EF4444",
  "#DC2626",
];

export function QuickOverridesModal({ visible, onClose, liveMode }: Props) {
  const router = useRouter();
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const [modalPresented, setModalPresented] = React.useState(visible);
  const modalPresentedRef = React.useRef(visible);
  const sheetHeight = React.useRef(0);
  const sheetTranslateY = React.useRef(
    new Animated.Value(windowHeight),
  ).current;
  const animationRef = React.useRef<Animated.CompositeAnimation | null>(null);
  const {
    override,
    setOverride,
    smokeEmergencyActive,
    shortCircuitActive,
  } = usePowerOverride();
  const safetyEmergencyActive = smokeEmergencyActive || shortCircuitActive;

  const currentMode = liveMode ?? override;
  const gridActive = currentMode === "grid";
  const shutdownActive = currentMode === "shutdown";
  const powerStops = gridActive
    ? GRID_STOPS
    : shutdownActive
      ? SHUTDOWN_STOPS
      : ORANGE_STOPS;

  React.useEffect(() => {
    animationRef.current?.stop();

    if (visible) {
      modalPresentedRef.current = true;
      setModalPresented(true);
      sheetTranslateY.setValue(sheetHeight.current || windowHeight);
      const frame = requestAnimationFrame(() => {
        const opening = Animated.timing(sheetTranslateY, {
          toValue: 0,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        });
        animationRef.current = opening;
        opening.start();
      });

      return () => {
        cancelAnimationFrame(frame);
        animationRef.current?.stop();
      };
    }

    if (!modalPresentedRef.current) return;
    const closing = Animated.timing(sheetTranslateY, {
      toValue: sheetHeight.current || windowHeight,
      duration: 220,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    });
    animationRef.current = closing;
    closing.start(({ finished }) => {
      if (finished) {
        modalPresentedRef.current = false;
        setModalPresented(false);
      }
    });

    return () => closing.stop();
  }, [visible, windowHeight, sheetTranslateY]);

  const handleOverride = (mode: PowerMode) => {
    void setOverride(mode);
    onClose();
  };

  return (
    <Modal
      visible={modalPresented}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Animated.View
          onLayout={({ nativeEvent }) => {
            sheetHeight.current = nativeEvent.layout.height;
          }}
          style={[
            styles.sheetMotion,
            { transform: [{ translateY: sheetTranslateY }] },
          ]}
        >
          <Pressable
            style={[
              styles.sheet,
              {
                backgroundColor: c.surface,
                borderColor: c.line,
                paddingBottom: insets.bottom + scale(22),
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <View style={[styles.handle, { backgroundColor: c.muted }]} />

            <View style={styles.header}>
              <LinearGradient
                colors={powerStops}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.headerIcon}
              >
                <Ionicons name="flash" size={scale(16)} color="#FFFFFF" />
              </LinearGradient>
              <View style={styles.headerCopy}>
                <Text style={[styles.title, { color: c.text }]}>
                  Quick Overrides
                </Text>
                <Text style={[styles.subtitle, { color: c.muted }]}>
                  Tap for all zones · hold to choose which zones.
                </Text>
              </View>
              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={[styles.closeBtn, { borderColor: c.line }]}
                accessibilityRole="button"
                accessibilityLabel="Close quick overrides"
              >
                <Ionicons name="close" size={scale(15)} color={c.muted} />
              </Pressable>
            </View>

            <View style={styles.row}>
              <OverrideButton
                icon="arrow-back"
                label="Force Grid"
                active={currentMode === "grid"}
                disabled={safetyEmergencyActive}
                color={GRID_GREEN}
                iconBg="rgba(22, 163, 74, 0.14)"
                onPress={() => handleOverride("grid")}
              />
              <OverrideButton
                icon="flash"
                label="Force Battery"
                active={currentMode === "battery"}
                disabled={safetyEmergencyActive}
                color={ORANGE}
                iconBg="rgba(249, 115, 22, 0.14)"
                onPress={() => handleOverride("battery")}
              />
              <OverrideButton
                icon="power"
                label="Shutdown"
                active={currentMode === "shutdown"}
                disabled={safetyEmergencyActive}
                color={SHUTDOWN_RED}
                iconBg="rgba(220, 38, 38, 0.14)"
                danger
                onPress={() => handleOverride("shutdown")}
              />
            </View>

            <Pressable
              onPress={() => {
                if (safetyEmergencyActive) return;
                onClose();
                router.push("/pages/power-management");
              }}
              style={({ pressed }) => [
                styles.ctaWrap,
                {
                  shadowColor: gridActive
                    ? GRID_GREEN
                    : shutdownActive
                      ? SHUTDOWN_RED
                      : "#EA580C",
                },
                pressed && { opacity: 0.92 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open full power management"
              disabled={safetyEmergencyActive}
            >
              <LinearGradient
                colors={powerStops}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.cta}
              >
                <Text style={styles.ctaText}>Open Full Power Management</Text>
                <Ionicons
                  name="arrow-forward"
                  size={scale(16)}
                  color="#FFFFFF"
                />
              </LinearGradient>
            </Pressable>
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function OverrideButton({
  icon,
  label,
  active,
  disabled = false,
  color,
  iconBg,
  danger = false,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  disabled?: boolean;
  color: string;
  iconBg: string;
  danger?: boolean;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.overrideButton,
        {
          backgroundColor: danger
            ? active
              ? SHUTDOWN_RED
              : "rgba(220,38,38,0.1)"
            : c.surfaceMuted,
          borderColor: danger ? SHUTDOWN_RED : active ? color : c.line,
        },
        active && {
          shadowColor: color,
          shadowOpacity: 0.35,
          shadowRadius: scale(10),
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
        pressed && { opacity: 0.8 },
        disabled && { opacity: 0.45 },
      ]}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor:
              danger && active ? "rgba(255,255,255,0.18)" : iconBg,
          },
        ]}
      >
        <Ionicons
          name={icon}
          size={scale(15)}
          color={danger && active ? "#FFFFFF" : color}
        />
      </View>
      <Text
        style={[
          styles.buttonText,
          {
            color: danger
              ? active
                ? "#FFFFFF"
                : SHUTDOWN_RED
              : c.text,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "transparent",
  },
  sheetMotion: {
    width: "100%",
  },
  sheet: {
    borderTopLeftRadius: scale(28),
    borderTopRightRadius: scale(28),
    borderTopWidth: 1,
    paddingHorizontal: scale(20),
    paddingTop: scale(10),
    shadowColor: "#000000",
    shadowOpacity: 0.28,
    shadowRadius: scale(24),
    shadowOffset: { width: 0, height: -8 },
    elevation: 24,
  },
  handle: {
    alignSelf: "center",
    width: scale(40),
    height: scale(4),
    borderRadius: scale(2),
    opacity: 0.35,
    marginBottom: scale(16),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(11),
    marginBottom: scale(16),
  },
  headerIcon: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(12),
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1, paddingRight: scale(4) },
  title: { fontSize: scale(15.5), fontFamily: fonts.extrabold },
  subtitle: {
    fontSize: scale(10),
    fontFamily: fonts.medium,
    marginTop: scale(2),
  },
  closeBtn: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(15),
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", gap: scale(8), marginBottom: scale(14) },
  overrideButton: {
    flex: 1,
    minHeight: scale(88),
    borderWidth: 1,
    borderRadius: scale(16),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(4),
    paddingVertical: scale(10),
  },
  icon: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(11),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: scale(8),
  },
  buttonText: {
    fontSize: scale(9),
    fontFamily: fonts.extrabold,
    textAlign: "center",
  },
  ctaWrap: {
    borderRadius: scale(16),
    shadowOpacity: 0.4,
    shadowRadius: scale(14),
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  cta: {
    minHeight: scale(54),
    borderRadius: scale(16),
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(8),
  },
  ctaText: {
    color: "#FFFFFF",
    fontSize: scale(11.5),
    fontFamily: fonts.extrabold,
  },
});
