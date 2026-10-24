import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Paho from "paho-mqtt";
import { AppText as Text } from "../../../components/app-text";
import { ScreenShell } from "../../../components/screen-shell";
import { fonts, useTheme } from "../../../theme";
import { Monitor } from "./monitor";
import { Configure } from "./configure";
import { Allocation } from "./allocation";
import { Override } from "./override";
import { styles } from "./styles";

type PowerTab = "monitor" | "configure" | "allocation" | "override";

export function PowerManagementScreen() {
  const { colors: c, mode } = useTheme();
  const [tab, setTab] = useState<PowerTab>("monitor");
  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [batteryV, setBatteryV] = useState<number | null>(null);

  useEffect(() => {
    let activeClient: Paho.Client | null = null;
    const connectMqtt = async () => {
      try {
        const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
        if (!hubId) return;
        const clientId = `app-power-${Math.random().toString(16).substring(2, 8)}`;
        const client = new Paho.Client("broker.hivemq.com", 8884, clientId);
        client.onMessageArrived = (message: Paho.Message) => {
          try {
            const data = JSON.parse(message.payloadString);
            if (data.bat_pct !== undefined) setBatteryPct(Number(data.bat_pct));
            if (data.bat_v !== undefined) setBatteryV(Number(data.bat_v));
          } catch {
            // Ignore non-JSON telemetry messages.
          }
        };
        client.connect({
          useSSL: true,
          onSuccess: () => client.subscribe(`bawatpieza/devices/${hubId}/telemetry`),
        });
        activeClient = client;
      } catch {
        console.error("mqtt connection failed in power management");
      }
    };
    connectMqtt();
    return () => {
      if (activeClient?.isConnected()) activeClient.disconnect();
    };
  }, []);

  return (
    <ScreenShell scroll title="Power Management">
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
      {tab === "allocation" && <Allocation c={c} mode={mode} batteryPct={batteryPct} />}
      {tab === "override" && <Override c={c} />}
    </ScreenShell>
  );
}
