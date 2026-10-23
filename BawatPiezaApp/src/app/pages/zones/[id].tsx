import { useState, useEffect, useCallback } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenShell } from "../../../components/screen-shell";
import { TopBar } from "../../../components/top-bar";
import { HeroGlow } from "../../../components/hero-glow";
import { useTheme, type ThemeColors } from "../../../theme";
import { fonts } from "../../../theme";
import { scale } from "../../../components/glass-ui";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Paho from "paho-mqtt";
import "text-encoding";

const ZONE_OPTIONS = [
  {
    id: "1",
    name: "Light #1",
    source: "Battery",
    detail: "Auto-off in 22m",
    on: true,
  },
  {
    id: "2",
    name: "Light #2",
    source: "Grid",
    detail: "Stable · 318 W",
    on: true,
  },
];

export default function ZoneDetailScreen() {
  const router = useRouter();
  const { colors: c, mode } = useTheme();
  const styles = makeStyles(c);
  const params = useLocalSearchParams<{
    id: string;
    name?: string;
    source?: string;
    detail?: string;
    on?: string;
  }>();
  const initialZoneIndex = Math.max(
    0,
    ZONE_OPTIONS.findIndex((zone) => zone.name === params.name),
  );
  const [zoneIndex, setZoneIndex] = useState(initialZoneIndex);
  const [enabled, setEnabled] = useState(params.on !== "false");

  const zone = ZONE_OPTIONS[zoneIndex];
  const zoneName = zone.name;
  const source = zone.source;
  const detail = zone.detail;

  // Live Telemetry States
  const [liveVoltage, setLiveVoltage] = useState<string>("--");
  const [liveWatts, setLiveWatts] = useState<number>(0);
  const [liveBatteryPct, setLiveBatteryPct] = useState<number>(0);
  const [mqttStatus, setMqttStatus] = useState<string>("Connecting...");
  const [mqttClient, setMqttClient] = useState<any>(null); // Track client for publishing

  const selectZone = (nextIndex: number) => {
    setZoneIndex(nextIndex);
    setEnabled(ZONE_OPTIONS[nextIndex].on);
  };

  // === LIVE MQTT HARDWARE DETECTOR ===
  const connectMQTT = useCallback(async () => {
    setMqttStatus("Connecting...");
    try {
      const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
      if (!hubId) return;

      const clientId = `app-zone-${Math.random().toString(16).substring(2, 8)}`;
      const client = new Paho.Client("broker.hivemq.com", 8884, clientId);

      client.onConnectionLost = () => {
        setMqttStatus("Offline");
        setTimeout(connectMQTT, 4000);
      };

      client.onMessageArrived = (message: Paho.Message) => {
        try {
          const data = JSON.parse(message.payloadString);

          if (data.bat_v !== undefined)
            setLiveVoltage(Number(data.bat_v).toFixed(2));
          else if (data.dyn_v !== undefined)
            setLiveVoltage(Number(data.dyn_v).toFixed(2));

          if (data.dyn_w !== undefined)
            setLiveWatts(Math.round(Number(data.dyn_w)));
          else if (data.bat_w !== undefined)
            setLiveWatts(Math.round(Number(data.bat_w)));

          if (data.bat_pct !== undefined)
            setLiveBatteryPct(Math.floor(Number(data.bat_pct)));

          if (data.charger_on !== undefined) setEnabled(data.charger_on); // Sync UI switch to hardware state
        } catch (error) {
          // Ignore non-JSON
        }
      };

      client.connect({
        onSuccess: () => {
          setMqttStatus("Live");
          client.subscribe(`bawatpieza/devices/${hubId}/telemetry`);
          setMqttClient(client); // Save client for publishing commands
        },
        onFailure: () => {
          setMqttStatus("Offline");
          setTimeout(connectMQTT, 4000);
        },
        useSSL: true,
        keepAliveInterval: 20,
      });

      return client;
    } catch (error) {
      setMqttStatus("Offline");
    }
  }, []);

  useEffect(() => {
    let activeClient: any = null;
    connectMQTT().then((client) => {
      activeClient = client;
    });
    return () => {
      if (activeClient?.isConnected()) activeClient.disconnect();
    };
  }, [connectMQTT]);

  // === PUBLISH COMMAND TO RELAY ===
  // === PUBLISH COMMAND TO RELAY ===
  const toggleChargerRelay = async () => {
    const nextState = !enabled;
    setEnabled(nextState); // Instantly update UI

    if (mqttClient && mqttClient.isConnected()) {
      const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");

      // FIXED: Must be "commands" (plural) to match the ESP32
      const commandTopic = `bawatpieza/devices/${hubId}/commands`;

      const payload = JSON.stringify({
        command: nextState ? "charger_on" : "charger_off",
      });

      const message = new Paho.Message(payload);
      message.destinationName = commandTopic;
      mqttClient.send(message);
    }
  };

  // Calculate estimated runtime based on current wattage and battery %
  // Assuming a standard 12V 10Ah (120Wh) battery for estimation purposes
  const getEstimatedRuntime = () => {
    if (liveWatts <= 0) return "Standby";
    const assumedTotalWattHours = 120;
    const remainingWattHours = assumedTotalWattHours * (liveBatteryPct / 100);
    const hoursLeft = remainingWattHours / liveWatts;

    if (hoursLeft > 24) return "> 24h";
    const h = Math.floor(hoursLeft);
    const m = Math.floor((hoursLeft - h) * 60);
    return `${h}h ${m}m`;
  };

  const heroInk = mode === "dark" ? "#FFFFFF" : "#2B1205";
  const heroInkSoft =
    mode === "dark" ? "rgba(255,255,255,0.70)" : "rgba(43,18,5,0.72)";
  const heroTrack =
    mode === "dark" ? "rgba(255,255,255,0.14)" : "rgba(43,18,5,0.16)";
  const heroFillColors: [string, string] =
    mode === "dark" ? ["#FDBA74", "#F97316"] : ["#F97316", "#C2410C"];

  return (
    <ScreenShell scroll>
      <View style={styles.hero}>
        <HeroGlow mode={mode} intensity={1} bleedBottom={scale(40)} />

        <View style={styles.heroTopBar}>
          <TopBar gutter={0} title="Zone Detail" showBack glass />
        </View>

        <View style={styles.heroBody}>
          <View style={styles.zonePager}>
            <Pressable
              disabled={zoneIndex === 0}
              onPress={() => selectZone(Math.max(0, zoneIndex - 1))}
              style={[
                styles.pagerButton,
                zoneIndex === 0 && styles.pagerButtonDisabled,
              ]}
            >
              <Ionicons
                name="chevron-back"
                size={scale(17)}
                color={heroInkSoft}
              />
            </Pressable>
            <View style={styles.heroLabelRow}>
              <Ionicons
                name="battery-charging"
                size={scale(14)}
                color={heroInkSoft}
              />
              <Text
                style={[styles.heroLabel, { color: heroInkSoft }]}
                numberOfLines={1}
              >
                {zoneName}
              </Text>
            </View>
            <Pressable
              disabled={zoneIndex === ZONE_OPTIONS.length - 1}
              onPress={() =>
                selectZone(Math.min(ZONE_OPTIONS.length - 1, zoneIndex + 1))
              }
              style={[
                styles.pagerButton,
                zoneIndex === ZONE_OPTIONS.length - 1 &&
                  styles.pagerButtonDisabled,
              ]}
            >
              <Ionicons
                name="chevron-forward"
                size={scale(17)}
                color={heroInkSoft}
              />
            </Pressable>
          </View>

          <View style={styles.heroNumberRow}>
            <Text style={[styles.heroNumber, { color: heroInk }]}>
              {liveBatteryPct}
            </Text>
            <Text style={[styles.heroUnit, { color: heroInkSoft }]}>%</Text>
          </View>

          <Text style={[styles.heroDesc, { color: heroInkSoft }]}>
            Powered by {source} · {mqttStatus}
          </Text>

          <View style={[styles.heroTrack, { backgroundColor: heroTrack }]}>
            <LinearGradient
              colors={heroFillColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.heroFill, { width: `${liveBatteryPct}%` }]}
            />
          </View>

          <View style={styles.smartSwitchContainer}>
            <View style={styles.smartSwitchHeader}>
              <Ionicons name="flash" size={scale(12)} color={heroInkSoft} />
              <Text style={[styles.smartSwitchLabel, { color: heroInkSoft }]}>
                CHARGER RELAY
              </Text>
            </View>
            <Pressable
              onPress={toggleChargerRelay}
              style={[
                styles.singleSwitch,
                enabled && styles.singleSwitchActive,
              ]}
            >
              <View
                style={[
                  styles.singleSwitchKnob,
                  enabled && styles.singleSwitchKnobActive,
                ]}
              />
              <Text
                style={[
                  styles.singleSwitchText,
                  { color: enabled ? "#FFFFFF" : heroInkSoft },
                ]}
              >
                {enabled ? "ON" : "OFF"}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.sectionLabel, { color: heroInkSoft }]}>
            LIVE READOUT
          </Text>
          <View style={styles.readoutStack}>
            <Readout
              icon="flash"
              value={liveVoltage}
              unit="V"
              label="VOLTAGE"
              color="#1764B0"
            />
            <View style={styles.statsDivider} />
            <Readout
              icon="speedometer"
              value={liveWatts.toString()}
              unit="W"
              label="LIVE LOAD"
              color="#F59E0B"
            />
            <View style={styles.statsDivider} />
            <Readout
              icon="time-outline"
              value={getEstimatedRuntime()}
              unit=""
              label="RUNTIME LEFT"
              color="#F97316"
            />
          </View>
        </View>
      </View>

      <Pressable
        onPress={() =>
          router.push(
            `/pages/zones/${zone.id}/runtime-calculator?name=${encodeURIComponent(zoneName)}&source=${encodeURIComponent(source)}`,
          )
        }
      >
        <LinearGradient
          colors={["#FFB347", "#F97316", "#EA580C"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.actionButton}
        >
          <Text style={styles.actionText}>Open Runtime Calculator</Text>
          <Ionicons name="chevron-forward" size={17} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>
      <Pressable
        onPress={() =>
          router.push(`/pages/schedule?name=${encodeURIComponent(zoneName)}`)
        }
      >
        <LinearGradient
          colors={["#FFB347", "#F97316", "#EA580C"]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.actionButton}
        >
          <Text style={styles.actionText}>
            Configure Schedule &amp; Priority
          </Text>
          <Ionicons name="chevron-forward" size={17} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>
    </ScreenShell>
  );
}

function Readout({
  icon,
  value,
  unit,
  label,
  color,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  unit: string;
  label: string;
  color: string;
}) {
  const { colors: c, mode } = useTheme();
  const styles = makeStyles(c);
  return (
    <View
      style={[
        styles.readoutCard,
        {
          backgroundColor:
            mode === "dark"
              ? "rgba(255,255,255,0.10)"
              : "rgba(255,255,255,0.58)",
        },
      ]}
    >
      <View style={[styles.readoutIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={13} color={color} />
      </View>
      <View style={styles.readoutInfo}>
        <View style={styles.valueRow}>
          <Text
            style={[
              styles.readoutValue,
              { color: mode === "dark" ? "#FFFFFF" : c.text },
            ]}
          >
            {value}
          </Text>
          {unit ? (
            <Text
              style={[
                styles.readoutUnit,
                {
                  color:
                    mode === "dark" ? "rgba(255,255,255,0.90)" : c.textSoft,
                },
              ]}
            >
              {unit}
            </Text>
          ) : null}
        </View>
        <Text
          style={[
            styles.readoutLabel,
            { color: mode === "dark" ? "rgba(255,255,255,0.84)" : c.muted },
          ]}
        >
          {label}
        </Text>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) =>
  StyleSheet.create({
    hero: {
      marginHorizontal: -20,
      paddingHorizontal: 20,
      paddingBottom: scale(26),
      position: "relative",
      zIndex: 10,
    },
    heroTopBar: { zIndex: 5 },
    heroBody: { zIndex: 1, alignItems: "center", marginTop: scale(6) },
    zonePager: {
      width: "100%",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    pagerButton: {
      width: scale(30),
      height: scale(30),
      borderRadius: scale(10),
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,255,255,0.14)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.22)",
    },
    pagerButtonDisabled: { opacity: 0.35 },
    heroLabelRow: { flexDirection: "row", alignItems: "center", gap: scale(6) },
    heroLabel: {
      fontSize: scale(12),
      letterSpacing: 0.4,
      fontFamily: fonts.extrabold,
    },
    heroNumberRow: {
      flexDirection: "row",
      alignItems: "baseline",
      marginTop: scale(6),
    },
    heroNumber: {
      fontSize: scale(72),
      lineHeight: scale(78),
      letterSpacing: -2,
      fontFamily: fonts.extrabold,
    },
    heroUnit: {
      fontSize: scale(24),
      marginLeft: scale(3),
      fontFamily: fonts.extrabold,
    },
    heroDesc: {
      fontSize: scale(9.5),
      textAlign: "center",
      marginTop: scale(10),
      fontFamily: fonts.medium,
    },
    heroTrack: {
      alignSelf: "stretch",
      height: scale(6),
      borderRadius: 99,
      overflow: "hidden",
      marginTop: scale(16),
    },
    heroFill: { width: "82%", height: "100%", borderRadius: 99 },
    smartSwitchContainer: {
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginTop: scale(10),
      padding: scale(6),
      borderRadius: scale(12),
      backgroundColor: "rgba(255,255,255,0.12)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.24)",
    },
    sectionLabel: {
      color: c.muted,
      alignSelf: "flex-start",
      fontSize: scale(8),
      letterSpacing: 1.1,
      fontFamily: fonts.extrabold,
      marginTop: scale(9),
      marginBottom: scale(4),
      marginLeft: scale(2),
    },
    readoutStack: { alignSelf: "stretch" },
    smartSwitchHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: scale(5),
      marginTop: scale(5),
    },
    smartSwitchLabel: {
      fontSize: scale(8),
      letterSpacing: 1,
      fontFamily: fonts.extrabold,
    },
    singleSwitch: {
      width: scale(64),
      height: scale(27),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: scale(5),
      borderRadius: scale(14),
      backgroundColor: "rgba(255,255,255,0.18)",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.28)",
    },
    singleSwitchActive: {
      backgroundColor: "#F97316",
      borderColor: "#FDBA74",
      flexDirection: "row-reverse",
    },
    singleSwitchKnob: {
      width: scale(17),
      height: scale(17),
      borderRadius: scale(9),
      backgroundColor: "rgba(255,255,255,0.78)",
    },
    singleSwitchKnobActive: { backgroundColor: "#FFFFFF" },
    singleSwitchText: { fontSize: scale(8), fontFamily: fonts.extrabold },
    statsDivider: {
      width: "100%",
      height: 1,
      backgroundColor: c.line,
      marginVertical: scale(5),
    },
    readoutCard: {
      width: "100%",
      minHeight: scale(46),
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: scale(10),
      paddingVertical: scale(6),
      borderRadius: scale(11),
      borderWidth: 1,
      borderColor: c.line,
      shadowColor: "#0B63B7",
      shadowOpacity: 0.08,
      shadowRadius: scale(8),
      shadowOffset: { width: 0, height: 3 },
      elevation: 2,
      overflow: "hidden",
    },
    readoutIcon: {
      width: scale(24),
      height: scale(24),
      borderRadius: scale(7),
      backgroundColor: "rgba(255,255,255,0.20)",
      alignItems: "center",
      justifyContent: "center",
      marginRight: scale(8),
    },
    readoutInfo: { alignItems: "flex-start" },
    valueRow: { flexDirection: "row", alignItems: "baseline", gap: 3 },
    readoutValue: {
      color: "#FFFFFF",
      fontSize: scale(15),
      fontFamily: fonts.extrabold,
    },
    readoutUnit: {
      color: "rgba(255,255,255,0.90)",
      fontSize: scale(8),
      fontFamily: fonts.medium,
    },
    readoutLabel: {
      color: "rgba(255,255,255,0.84)",
      fontSize: scale(7),
      letterSpacing: 0.5,
      fontFamily: fonts.bold,
      marginTop: 2,
    },
    actionButton: {
      minHeight: scale(46),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: scale(6),
      borderRadius: scale(13),
      marginTop: scale(12),
      paddingHorizontal: scale(12),
      overflow: "hidden",
    },
    actionText: {
      color: "#FFFFFF",
      fontSize: scale(11),
      fontFamily: fonts.extrabold,
    },
  });
