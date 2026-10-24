import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Paho from "paho-mqtt";
import { fonts, useTheme } from "../theme";
import { scale } from "./glass-ui";
import { usePowerOverride } from "../hooks/use-power-override";

type Props = { visible: boolean; onClose: () => void };

/** Brand orange — every accent inside the sheet is built from these three stops. */
const ORANGE = "#F97316";
const ORANGE_STOPS: [string, string, string] = [
  "#FB923C",
  "#F97316",
  "#EA580C",
];
const GRID_GREEN = "#16A34A";
const GRID_STOPS: [string, string, string] = ["#4ADE80", "#22C55E", "#16A34A"];

export function QuickOverridesModal({ visible, onClose }: Props) {
  const router = useRouter();
  const { colors: c } = useTheme();
  const insets = useSafeAreaInsets();
  const { override, setOverride } = usePowerOverride();
  const gridActive = override === "grid";
  const powerStops = gridActive ? GRID_STOPS : ORANGE_STOPS;

  const sendMqttCommand = async (commandName: string) => {
    try {
      const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
      if (!hubId) return;

      const clientId = `app-override-${Math.random().toString(16).substring(2, 8)}`;
      const client = new Paho.Client("broker.hivemq.com", 8884, clientId);

      client.connect({
        useSSL: true,
        onSuccess: () => {
          const payload = JSON.stringify({ command: commandName });
          const message = new Paho.Message(payload);
          message.destinationName = `bawatpieza/devices/${hubId}/commands`;
          client.send(message);

          setTimeout(() => client.disconnect(), 500);
        },
      });
    } catch (err) {
      console.error("failed to send MQTT override command", err);
    }
  };

  const handleForceGrid = () => {
    setOverride("grid");
    sendMqttCommand("force_grid");
    setTimeout(() => onClose(), 400);
  };

  const handleForceBattery = () => {
    setOverride("battery");
    sendMqttCommand("force_battery");
    setTimeout(() => onClose(), 400);
  };

  const handleShutdown = () => {
    setOverride("shutdown");
    sendMqttCommand("force_shutdown");
    setTimeout(() => onClose(), 400);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
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
              active={override === "grid"}
              color={GRID_GREEN}
              onPress={handleForceGrid}
            />
            <OverrideButton
              icon="flash"
              label="Force Battery"
              active={override === "battery"}
              color={ORANGE}
              onPress={handleForceBattery}
            />
            <OverrideButton
              icon="power"
              label="Shutdown"
              active={override === "shutdown"}
              color="#DC2626"
              onPress={handleShutdown}
            />
          </View>

          <Pressable
            onPress={() => {
              onClose();
              router.push("/pages/power-management");
            }}
            style={({ pressed }) => [
              styles.ctaWrap,
              { shadowColor: gridActive ? GRID_GREEN : "#EA580C" },
              pressed && { opacity: 0.92 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Open full power management"
          >
            <LinearGradient
              colors={powerStops}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cta}
            >
              <Text style={styles.ctaText}>Open Full Power Management</Text>
              <Ionicons name="arrow-forward" size={scale(16)} color="#FFFFFF" />
            </LinearGradient>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function OverrideButton({
  icon,
  label,
  active,
  color,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  color: string;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.overrideButton,
        {
          backgroundColor: c.surfaceMuted,
          borderColor: active ? color : c.line,
        },
        active && {
          shadowColor: color,
          shadowOpacity: 0.35,
          shadowRadius: scale(10),
          shadowOffset: { width: 0, height: 4 },
          elevation: 4,
        },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View
        style={[
          styles.icon,
          {
            backgroundColor:
              active && color === GRID_GREEN
                ? "rgba(22,163,74,0.14)"
                : "rgba(249,115,22,0.14)",
          },
        ]}
      >
        <Ionicons name={icon} size={scale(15)} color={color} />
      </View>
      <Text style={[styles.buttonText, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(4, 10, 20, 0.5)",
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
    backgroundColor: "rgba(249, 115, 22, 0.14)",
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
