import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Paho from "paho-mqtt";
import { AppText as Text } from "../../../components/app-text";
import { ScreenShell } from "../../../components/screen-shell";
import { fonts, useTheme } from "../../../theme";
import { Monitor } from "../../../components/power-management/monitor";
import { Configure } from "../../../components/power-management/configure";
import { Allocation } from "../../../components/power-management/allocation";
import { Override } from "../../../components/power-management/override";
import { styles } from "../../../components/power-management/styles";
import { useDeviceConnection } from "../../../components/device-status-banner";

type PowerTab = "monitor" | "configure" | "allocation" | "override";
type TelemetryConnection = "connecting" | "live" | "offline";

export function PowerManagementScreen() {
  const { colors: c, mode } = useTheme();
  const [tab, setTab] = useState<PowerTab>("monitor");
  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [batteryV, setBatteryV] = useState<number | null>(null);
  const [telemetryConnection, setTelemetryConnection] =
    useState<TelemetryConnection>("connecting");
  const hasDevice = useDeviceConnection();

  useEffect(() => {
    let activeClient: Paho.Client | null = null;
    let cancelled = false;
    if (hasDevice !== true) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setBatteryPct(null);
        setBatteryV(null);
        setTelemetryConnection(
          hasDevice === false ? "offline" : "connecting",
        );
      });
      return () => {
        cancelled = true;
      };
    }

    const connectMqtt = async () => {
      try {
        const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
        if (!hubId || cancelled) {
          if (!cancelled) setTelemetryConnection("offline");
          return;
        }
        setBatteryPct(null);
        setBatteryV(null);
        setTelemetryConnection("connecting");
        const clientId = `app-power-${Math.random().toString(16).substring(2, 8)}`;
        const client = new Paho.Client("broker.hivemq.com", 8884, clientId);
        client.onMessageArrived = (message: Paho.Message) => {
          try {
            const data: unknown = JSON.parse(message.payloadString);
            if (typeof data !== "object" || data === null) return;
            const telemetry = data as Record<string, unknown>;
            const rawPct = telemetry.bat_pct;
            const rawVoltage = telemetry.bat_v;
            const pct =
              (typeof rawPct === "number" || typeof rawPct === "string") &&
              String(rawPct).trim() !== ""
                ? Number(rawPct)
                : Number.NaN;
            const voltage =
              (typeof rawVoltage === "number" ||
                typeof rawVoltage === "string") &&
              String(rawVoltage).trim() !== ""
                ? Number(rawVoltage)
                : Number.NaN;
            if (Number.isFinite(pct) && pct >= 0 && pct <= 100) {
              setBatteryPct(pct);
              setTelemetryConnection("live");
            }
            if (Number.isFinite(voltage) && voltage > 0) setBatteryV(voltage);
          } catch (error) {
            console.warn("[power-management] Ignoring invalid telemetry", error);
          }
        };
        client.onConnectionLost = () => {
          if (!cancelled) {
            setBatteryPct(null);
            setBatteryV(null);
            setTelemetryConnection("offline");
          }
        };
        client.connect({
          useSSL: true,
          onSuccess: () => {
            if (cancelled) {
              client.disconnect();
              return;
            }
            client.subscribe(`bawatpieza/devices/${hubId}/telemetry`);
          },
          onFailure: () => {
            console.error("[power-management] MQTT connection failed");
            if (!cancelled) setTelemetryConnection("offline");
          },
        });
        activeClient = client;
      } catch (error) {
        console.error("[power-management] MQTT setup failed", error);
        if (!cancelled) setTelemetryConnection("offline");
      }
    };
    void connectMqtt();
    return () => {
      cancelled = true;
      if (activeClient?.isConnected()) activeClient.disconnect();
    };
  }, [hasDevice]);

  return (
    <ScreenShell scroll title="Power Management" showNoDeviceNotice>
      <View style={[styles.tabs, { backgroundColor: c.surface }]}>
        {(["monitor", "configure", "allocation", "override"] as PowerTab[]).map((item) => {
          const active = tab === item;
          return (
            <Pressable key={item} onPress={() => setTab(item)} style={[styles.tab, { backgroundColor: active ? "transparent" : c.surfaceMuted, borderColor: c.line }, active && styles.activeTab]} accessibilityRole="tab" accessibilityState={{ selected: active }}>
              {active && <LinearGradient colors={["#F9A84E", "#F59E0B"]} style={StyleSheet.absoluteFill} />}
              <Text style={[styles.tabText, { color: active ? "#FFFFFF" : c.muted }]}>{item[0].toUpperCase()}{item.slice(1)}</Text>
            </Pressable>
          );
        })}
      </View>
      {tab === "monitor" && <Monitor c={c} mode={mode} batteryPct={batteryPct} batteryV={batteryV} />}
      {tab === "configure" && <Configure c={c} mode={mode} />}
      {tab === "allocation" && (
        <Allocation
          c={c}
          mode={mode}
          batteryPct={batteryPct}
          batteryV={batteryV}
          telemetryConnection={telemetryConnection}
        />
      )}
      {tab === "override" && <Override c={c} />}
    </ScreenShell>
  );
}

export default PowerManagementScreen;
