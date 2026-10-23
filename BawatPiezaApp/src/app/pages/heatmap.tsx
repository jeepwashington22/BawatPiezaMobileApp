import {
  useMemo,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  Pressable,
  StyleSheet,
  View,
  RefreshControl,
  ScrollView,
  Modal,
} from "react-native";
import { AppText as Text } from "../../components/app-text";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Path,
  Line,
  Stop,
  Polygon,
} from "react-native-svg";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Paho from "paho-mqtt";
import "text-encoding"; // Required Polyfill for MQTT
import { supabase } from "../../lib/supabase"; // Supabase client connection

import { ScreenShell } from "../../components/screen-shell";
import { Card, LiveDot, SectionHead, scale } from "../../components/glass-ui";
import { fonts, useTheme } from "../../theme";

/* ------------------------------- reference data --------------------------- */

type ViewMode = "view" | "diagnostic";
type IconName = keyof typeof Ionicons.glyphMap;

type TileDatum = { id: number; label: string; traffic: number };
type KineticLog = {
  id: string;
  tile: string;
  time: string;
  ms: string;
  avgA: string;
  avgV: string;
  powerW: string;
  energyJ: string;
};

type HubTelemetry = {
  capV: string;
  dynV: string;
  dynA: string;
  dynW: string;
  batV: string;
  batPct: number;
};

// Tile 1 is active (92% traffic), all other tiles are set to inactive/minimal traffic
const TILES: TileDatum[] = [
  { id: 1, label: "Tile 1", traffic: 0.92 },
  { id: 2, label: "Tile 2", traffic: 0.05 },
  { id: 3, label: "Tile 3", traffic: 0.02 },
  { id: 4, label: "Tile 4", traffic: 0.04 },
  { id: 5, label: "Tile 5", traffic: 0.03 },
  { id: 6, label: "Tile 6", traffic: 0.01 },
];

const TILE_ORANGE_RAMP = [
  "#7C2D12",
  "#9A3412",
  "#C2410C",
  "#EA580C",
  "#F97316",
];
const TILE_ORANGE = "#F97316";

const PREDICTIVE = [
  {
    tile: "Tile 2",
    note: "Low harvest yield (mechanical friction detected)",
    metric: "0.012 J/step",
  },
  {
    tile: "Tile 4",
    note: "Capacitor charge rate sag under load",
    metric: "0.018 J/step",
  },
];

const WATCHLIST = [
  {
    tile: "Tile 6",
    note: "One-way clutch bearing slip projected in ~14 days",
    metric: "0.035 J/step",
  },
  {
    tile: "Tile 5",
    note: "Spring return response delay detected",
    metric: "0.042 J/step",
  },
];

const REMINDERS = [
  {
    title: "Routine Check-Up",
    note: "Inspect tiles and add lubricant — recommended every 30 days",
  },
];

const LOGS_STORAGE_KEY = "bawatpieza_kinetic_logs";

/* --------------------------------- helper --------------------------------- */

const formatNum = (val: any, decimals: number): string => {
  if (val === undefined || val === null || isNaN(Number(val))) {
    return (0).toFixed(decimals);
  }
  return Number(val).toFixed(decimals);
};

/* --------------------------------- entrance ------------------------------- */

function FadeIn({
  children,
  style,
}: {
  delay?: number;
  children: ReactNode;
  style?: any;
}) {
  return <View style={style}>{children}</View>;
}

/* ----------------------------- segmented control -------------------------- */

function Segmented({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const { colors: c, mode } = useTheme();
  const items: { key: ViewMode; label: string; icon: IconName }[] = [
    { key: "view", label: "View Only", icon: "grid-outline" },
    { key: "diagnostic", label: "Diagnostic", icon: "pulse-outline" },
  ];

  return (
    <View
      style={[
        styles.segWrap,
        { backgroundColor: mode === "dark" ? c.surfaceMuted : "#E9EEF5" },
      ]}
    >
      <View style={styles.segRow}>
        {items.map((item) => {
          const active = value === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onChange(item.key)}
              style={[styles.segItem, active && styles.segItemActive]}
            >
              {active && (
                <LinearGradient
                  colors={["#FBA94C", "#F97316"]}
                  style={StyleSheet.absoluteFill}
                />
              )}
              <Ionicons
                name={item.icon}
                size={scale(12)}
                color={active ? "#FFFFFF" : c.muted}
              />
              <Text
                style={[
                  styles.segText,
                  { color: active ? "#FFFFFF" : c.textSoft },
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------ tile rendering ------------------------------ */

function getTileColor(traffic: number): string {
  const t = Math.min(1, Math.max(0, traffic));
  const idx = Math.floor(t * (TILE_ORANGE_RAMP.length - 1));
  return TILE_ORANGE_RAMP[idx];
}

// Update HeatTile to accept the dynamic floor rules from the database
function HeatTile({
  tile,
  viewMode,
  activeThreshold,
}: {
  tile: TileDatum;
  viewMode: ViewMode;
  activeThreshold: number;
}) {
  const { mode } = useTheme();

  // The tile is flagged if traffic crosses the dynamic DB threshold
  const flagged = tile.traffic >= activeThreshold;
  const bg =
    viewMode === "diagnostic" && flagged
      ? TILE_ORANGE
      : getTileColor(tile.traffic);

  return (
    <Card
      mode={mode}
      style={[
        styles.tileCard,
        {
          backgroundColor: bg,
          borderColor:
            viewMode === "diagnostic" && flagged
              ? "#FDBA74"
              : "rgba(255,255,255,0.22)",
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[
          styles.tileDepth,
          { backgroundColor: flagged ? "#9A3412" : "#431407" },
        ]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[
          "rgba(255,255,255,0.28)",
          "rgba(255,255,255,0.04)",
          "rgba(0,0,0,0.28)",
        ]}
        locations={[0, 0.34, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.tileSheen} />
      <View pointerEvents="none" style={styles.tileDiagonal} />
      <View pointerEvents="none" style={styles.tileBevelTop} />
      <View pointerEvents="none" style={styles.tileBevelBottom} />
      <View style={styles.tileInner}>
        <Text style={[styles.tileLabel, { color: "#FFFFFF" }]}>
          {tile.label.toUpperCase()}
        </Text>
        <Text
          style={[styles.tileTraffic, { color: "#FFFFFF" }]}
        >{`${Math.round(tile.traffic * 100)}%`}</Text>
        {viewMode === "diagnostic" && flagged && (
          <View style={styles.tileFlag}>
            <Ionicons name="flash" size={scale(11)} color="#FFFFFF" />
            <Text style={[styles.tileFlagText, { color: "#FFFFFF" }]}>
              Active
            </Text>
          </View>
        )}
      </View>
    </Card>
  );
}

function HeatSurface({ children }: { children: ReactNode }) {
  return (
    <View style={styles.heatSurface}>
      <Svg
        viewBox="0 0 360 360"
        width="100%"
        height="100%"
        style={StyleSheet.absoluteFill}
      >
        <Defs>
          <SvgGradient id="displaySurface" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#35213F" />
            <Stop offset="0.5" stopColor="#1D1A2A" />
            <Stop offset="1" stopColor="#0B101A" />
          </SvgGradient>
        </Defs>
        <Path d="M0 0H360V360H0Z" fill="url(#displaySurface)" />
        <Line
          x1="-30"
          y1="120"
          x2="390"
          y2="-30"
          stroke="#FFB347"
          strokeOpacity="0.24"
          strokeWidth="2"
        />
        <Line
          x1="-30"
          y1="240"
          x2="390"
          y2="90"
          stroke="#FFB347"
          strokeOpacity="0.24"
          strokeWidth="2"
        />
        <Line
          x1="-30"
          y1="360"
          x2="390"
          y2="210"
          stroke="#FFB347"
          strokeOpacity="0.24"
          strokeWidth="2"
        />
        <Polygon
          points="180,20 340,180 180,340 20,180"
          fill="none"
          stroke="#FFFFFF"
          strokeOpacity="0.06"
          strokeWidth="1"
        />
      </Svg>
      <View pointerEvents="none" style={styles.heatGlow}>
        <Svg viewBox="0 0 360 360" width="100%" height="100%">
          <Line
            x1="-30"
            y1="240"
            x2="390"
            y2="90"
            stroke="#FFD166"
            strokeWidth="3"
          />
        </Svg>
      </View>
      <View style={styles.heatGridContent}>{children}</View>
    </View>
  );
}

/* --------------------------------- screen ---------------------------------- */

export default function HeatmapScreen() {
  const { colors: c, mode } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>("view");
  const [kineticLogs, setKineticLogs] = useState<KineticLog[]>([]);
  const [liveTelemetry, setLiveTelemetry] = useState<HubTelemetry | null>(null);
  const [selectedLog, setSelectedLog] = useState<KineticLog | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [mqttStatus, setMqttStatus] = useState<
    "Connecting..." | "Live" | "Offline"
  >("Connecting...");

  // NEW: State to store the active diagnostic rules loaded from DB
  const [systemRules, setSystemRules] = useState({
    floor: 0.75, // Default baseline if DB is empty
    degradation: 0.05,
    watchWindow: 60,
  });

  const flaggedCount = TILES.filter(
    (t) => t.traffic >= systemRules.floor,
  ).length;

  const gridRows = useMemo(() => {
    const rows: TileDatum[][] = [];
    for (let i = 0; i < TILES.length; i += 3) rows.push(TILES.slice(i, i + 3));
    return rows;
  }, []);

  // === DYNAMIC DATABASE DETECTOR: FETCH RULES & LOGS ON LOAD ===
  useEffect(() => {
    const loadSystemData = async () => {
      try {
        const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");

        // 1. Fetch Dynamic Threshold Rules from Supabase
        if (hubId) {
          const { data: ruleData } = await supabase
            .from("system_thresholds")
            .select("*")
            .eq("hub_id", hubId)
            .single();

          if (ruleData) {
            setSystemRules({
              // We map the J/step floor input dynamically back to a traffic scale for the UI heat visual
              floor: ruleData.floor > 1 ? 0.75 : ruleData.floor,
              degradation: ruleData.degradation,
              watchWindow: ruleData.watch_window,
            });
          } else {
            // Fallback local rules check
            const localRules = await AsyncStorage.getItem(
              "bawatpieza_thresholds",
            );
            if (localRules) {
              const parsed = JSON.parse(localRules);
              setSystemRules({
                floor: Number(parsed.floor) > 1 ? 0.75 : Number(parsed.floor),
                degradation: Number(parsed.degradation),
                watchWindow: Number(parsed.watchWindow),
              });
            }
          }
        }

        // 2. Fetch Live Log Records from Supabase
        const { data, error } = await supabase
          .from("kinetic_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);

        if (data && !error && data.length > 0) {
          const dbLogs: KineticLog[] = data.map((item) => ({
            id: item.id || `tx-${Date.now()}`,
            tile: item.tile_label || "Tile 1",
            time: new Date(item.created_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            ms: item.duration_ms?.toString() || "0",
            avgV: formatNum(item.avg_v, 2),
            avgA: formatNum(item.avg_a, 3),
            powerW: formatNum(item.power_w, 3),
            energyJ: formatNum(item.energy_j, 4),
          }));
          setKineticLogs(dbLogs);
          await AsyncStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(dbLogs));
          return;
        }

        // 3. Local AsyncStorage fallback for logs
        const stored = await AsyncStorage.getItem(LOGS_STORAGE_KEY);
        if (stored) {
          setKineticLogs(JSON.parse(stored));
        }
      } catch (error) {
        console.error("Failed to load system data", error);
      }
    };

    loadSystemData();
  }, []);

  // === ARCHIVE LOGS (CLEAR ACTIVE LIST & SUPABASE DATABASE) ===
  const archiveKineticLogs = useCallback(async () => {
    try {
      const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
      await AsyncStorage.removeItem(LOGS_STORAGE_KEY);
      setKineticLogs([]);

      // Delete records from Supabase
      if (hubId) {
        await supabase.from("kinetic_logs").delete().eq("hub_id", hubId);
      } else {
        await supabase
          .from("kinetic_logs")
          .delete()
          .neq("id", "00000000-0000-0000-0000-000000000000");
      }
    } catch (error) {
      console.error("Failed to archive kinetic logs", error);
    }
  }, []);

  // === MQTT CONNECTION ENGINE (WITH AUTO-RECONNECT) ===
  const connectMQTT = useCallback(async () => {
    setMqttStatus("Connecting...");
    let client: Paho.Client | null = null;

    try {
      const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
      if (!hubId) {
        setMqttStatus("Offline");
        setRefreshing(false);
        return;
      }

      const clientId = `app-client-${Math.random().toString(16).substring(2, 8)}`;
      client = new Paho.Client("broker.hivemq.com", 8884, clientId);

      client.onConnectionLost = (responseObject: { errorCode?: number }) => {
        setMqttStatus("Offline");
        if (responseObject.errorCode !== 0) {
          setTimeout(() => {
            connectMQTT();
          }, 4000);
        }
      };

      client.onMessageArrived = (message: Paho.Message) => {
        try {
          const data = JSON.parse(message.payloadString);

          // FOOTSTEP EVENT PAYLOAD
          if (data.event === "footstep") {
            const now = new Date();
            const timestamp = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
            const tileLabel = data.tile ? `Tile ${data.tile}` : "Tile 1";

            const newStep: KineticLog = {
              id: `tx-${Date.now()}`,
              tile: tileLabel,
              time: timestamp,
              ms: data.ms ? data.ms.toString() : "0",
              avgV: formatNum(data.avg_v, 2),
              avgA: formatNum(data.avg_a, 3),
              powerW: formatNum(data.avg_w, 3),
              energyJ: formatNum(data.joules, 4),
            };

            setKineticLogs((prev) => {
              const updated = [newStep, ...prev].slice(0, 50);
              AsyncStorage.setItem(
                LOGS_STORAGE_KEY,
                JSON.stringify(updated),
              ).catch(() => {});
              return updated;
            });

            supabase
              .from("kinetic_logs")
              .insert([
                {
                  hub_id: hubId,
                  tile_label: tileLabel,
                  duration_ms: Number(data.ms) || 0,
                  avg_v: Number(data.avg_v) || 0,
                  avg_a: Number(data.avg_a) || 0,
                  power_w: Number(data.avg_w) || 0,
                  energy_j: Number(data.joules) || 0,
                },
              ])
              .then(({ error }) => {
                if (error) {
                  console.error("Supabase insert error:", error.message);
                }
              });
          }

          // PERIODIC HUB TELEMETRY PAYLOAD
          if (data.dyn_v !== undefined || data.bat_v !== undefined) {
            setLiveTelemetry({
              capV: formatNum(data.cap_v, 2),
              dynV: formatNum(data.dyn_v, 2),
              dynA: formatNum(data.dyn_a, 3),
              dynW: formatNum(data.dyn_w, 3),
              batV: formatNum(data.bat_v, 2),
              batPct: data.bat_pct ?? 0,
            });
          }
        } catch (error) {
          // Ignore malformed JSON
        }
      };

      client.connect({
        onSuccess: () => {
          setMqttStatus("Live");
          setRefreshing(false);
          client?.subscribe(`bawatpieza/devices/${hubId}/telemetry`);
        },
        onFailure: () => {
          setMqttStatus("Offline");
          setRefreshing(false);
          setTimeout(() => {
            connectMQTT();
          }, 4000);
        },
        useSSL: true,
        keepAliveInterval: 20,
        timeout: 10,
      });
    } catch (error) {
      setMqttStatus("Offline");
      setRefreshing(false);
    }

    return client;
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    connectMQTT();
  }, [connectMQTT]);

  useEffect(() => {
    let activeClient: Paho.Client | null = null;

    connectMQTT().then((client) => {
      if (client) activeClient = client;
    });

    return () => {
      if (activeClient && activeClient.isConnected()) {
        activeClient.disconnect();
      }
    };
  }, [connectMQTT]);

  const selectedLogDetails = useMemo(() => {
    if (!selectedLog) return null;
    const msNum = Number(selectedLog.ms) || 0;
    const avgA = Number(selectedLog.avgA) || 0;
    const energyJ = Number(selectedLog.energyJ) || 0;

    const chargeAs = (avgA * (msNum / 1000)).toFixed(4);
    const microJoules = Math.round(energyJ * 1000000);

    return {
      chargeAs,
      microJoules,
    };
  }, [selectedLog]);

  return (
    <ScreenShell title="Heatmap" showBack>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#F97316"
            colors={["#F97316"]}
          />
        }
      >
        <FadeIn delay={0}>
          <View
            style={[
              styles.header,
              {
                backgroundColor:
                  mode === "dark"
                    ? "rgba(255,255,255,0.04)"
                    : "rgba(255,255,255,0.72)",
                borderColor: c.line,
              },
            ]}
          >
            <View style={styles.headerEyebrowRow}>
              <View
                style={[
                  styles.headerTick,
                  { backgroundColor: mode === "dark" ? "#F6C445" : "#0A2A4A" },
                ]}
              />
              <Text
                style={{
                  color: mode === "dark" ? "rgba(246,196,69,0.85)" : "#B4771B",
                  fontSize: scale(8.5),
                  letterSpacing: 2.2,
                  fontFamily: fonts.extrabold,
                }}
              >
                WALK TRAFFIC
              </Text>
            </View>
            <Text
              style={{
                color: c.text,
                fontSize: scale(20),
                fontFamily: fonts.extrabold,
                letterSpacing: -0.3,
              }}
            >
              Gate Pathway · Live Tile Heat
            </Text>
            <Text
              style={{
                color:
                  mode === "dark"
                    ? "rgba(237,242,250,0.5)"
                    : "rgba(10,42,74,0.5)",
                fontSize: scale(10.5),
                fontFamily: fonts.medium,
                marginTop: scale(3),
              }}
            >
              Warmer tiles = more foot traffic right now
            </Text>
          </View>
        </FadeIn>

        <FadeIn delay={80}>
          <View style={{ marginTop: scale(10), marginBottom: scale(8) }}>
            <Segmented value={viewMode} onChange={setViewMode} />
          </View>
        </FadeIn>

        <FadeIn delay={160}>
          <HeatSurface>
            <View style={styles.grid}>
              {gridRows.map((row, ri) => (
                <View key={ri} style={styles.gridRow}>
                  {row.map((tile) => (
                    <HeatTile
                      key={tile.id}
                      tile={tile}
                      viewMode={viewMode}
                      activeThreshold={systemRules.floor}
                    />
                  ))}
                </View>
              ))}
            </View>
          </HeatSurface>
        </FadeIn>

        {/* ==================== VIEW ONLY MODE ==================== */}
        {viewMode === "view" && (
          <FadeIn delay={240}>
            <View style={{ marginTop: scale(16) }}>
              <SectionHead title="PATHWAY OVERVIEW" mode={mode} />

              <View style={styles.statsGrid}>
                <Card mode={mode} style={styles.statCard}>
                  <Ionicons
                    name="footsteps-outline"
                    size={scale(18)}
                    color={c.orange}
                  />
                  <Text style={[styles.statValue, { color: c.text }]}>
                    {kineticLogs.length > 0
                      ? `${kineticLogs.length} Steps`
                      : "Active"}
                  </Text>
                  <Text style={[styles.statLabel, { color: c.muted }]}>
                    Recorded History
                  </Text>
                </Card>

                <Card mode={mode} style={styles.statCard}>
                  <Ionicons
                    name="flash-outline"
                    size={scale(18)}
                    color="#22C55E"
                  />
                  <Text style={[styles.statValue, { color: c.text }]}>
                    {liveTelemetry ? `${liveTelemetry.batPct}%` : "6.4V Bank"}
                  </Text>
                  <Text style={[styles.statLabel, { color: c.muted }]}>
                    LiFePO4 Reserve
                  </Text>
                </Card>
              </View>

              <Card mode={mode} style={styles.overviewCard}>
                <View style={styles.overviewRow}>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        color: c.text,
                        fontSize: scale(12.5),
                        fontFamily: fonts.bold,
                      }}
                    >
                      BawatPieza Pathway Status
                    </Text>
                    <Text
                      style={{
                        color: c.textSoft,
                        fontSize: scale(10),
                        fontFamily: fonts.regular,
                        marginTop: scale(2),
                      }}
                    >
                      All 6 kinetic tiles online. Peak traffic active on Tile 1.
                    </Text>
                  </View>
                  <View style={styles.statusBadge}>
                    <LiveDot color="#22C55E" />
                    <Text style={styles.statusBadgeText}>Optimal</Text>
                  </View>
                </View>
              </Card>
            </View>
          </FadeIn>
        )}

        {/* ==================== DIAGNOSTIC MODE ==================== */}
        {viewMode === "diagnostic" && (
          <FadeIn delay={240}>
            <View style={styles.diagSummary}>
              <LiveDot
                color={mqttStatus === "Live" ? "#22C55E" : TILE_ORANGE}
              />
              <Text
                style={{
                  color: c.textSoft,
                  fontSize: scale(10),
                  fontFamily: fonts.semibold,
                }}
              >
                {mqttStatus === "Live"
                  ? liveTelemetry
                    ? `Live Hub: ${liveTelemetry.dynV}V | ${liveTelemetry.dynA}A (${liveTelemetry.dynW}W)`
                    : `Receiving telemetry from ${flaggedCount} active tiles`
                  : `MQTT Status: ${mqttStatus}`}
              </Text>
            </View>

            <View style={{ marginTop: scale(16) }}>
              {/* Header Row with Archive Action Button */}
              <View style={styles.feedHeaderRow}>
                <SectionHead title="LIVE KINETIC FEED" mode={mode} />
                {kineticLogs.length > 0 && (
                  <Pressable
                    onPress={archiveKineticLogs}
                    style={styles.archiveBtn}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="archive-outline"
                      size={scale(12)}
                      color={c.orange}
                    />
                    <Text style={[styles.archiveBtnText, { color: c.orange }]}>
                      Archive Logs
                    </Text>
                  </Pressable>
                )}
              </View>

              <View style={{ gap: scale(8) }}>
                {kineticLogs.length === 0 ? (
                  <Text
                    style={{
                      color: c.muted,
                      fontSize: scale(11),
                      textAlign: "center",
                      marginTop: scale(10),
                    }}
                  >
                    Awaiting footsteps...
                  </Text>
                ) : (
                  kineticLogs.map((log) => (
                    <Pressable key={log.id} onPress={() => setSelectedLog(log)}>
                      <Card mode={mode} style={styles.kineticCard}>
                        <View style={styles.kineticHeader}>
                          <View style={styles.kineticTileRow}>
                            <Ionicons
                              name="footsteps"
                              size={scale(12)}
                              color={c.orange}
                            />
                            <Text
                              style={[
                                styles.kineticTileText,
                                { color: c.text },
                              ]}
                            >
                              {log.tile}
                            </Text>
                          </View>
                          <Text
                            style={[styles.kineticTimeText, { color: c.muted }]}
                          >
                            {log.time}
                          </Text>
                        </View>
                        <View style={styles.metricsGrid}>
                          <View style={styles.metricItem}>
                            <Text
                              style={[styles.metricValue, { color: c.text }]}
                            >
                              {log.ms}
                            </Text>
                            <Text
                              style={[styles.metricLabel, { color: c.muted }]}
                            >
                              ms
                            </Text>
                          </View>
                          <View style={styles.metricItem}>
                            <Text
                              style={[styles.metricValue, { color: c.text }]}
                            >
                              {log.avgV}
                            </Text>
                            <Text
                              style={[styles.metricLabel, { color: c.muted }]}
                            >
                              Volts
                            </Text>
                          </View>
                          <View style={styles.metricItem}>
                            <Text
                              style={[styles.metricValue, { color: c.text }]}
                            >
                              {log.avgA}
                            </Text>
                            <Text
                              style={[styles.metricLabel, { color: c.muted }]}
                            >
                              Amps
                            </Text>
                          </View>
                          <View style={styles.metricItem}>
                            <Text
                              style={[styles.metricValue, { color: c.orange }]}
                            >
                              {log.powerW}
                            </Text>
                            <Text
                              style={[styles.metricLabel, { color: c.orange }]}
                            >
                              Watts
                            </Text>
                          </View>
                          <View style={styles.metricItem}>
                            <Text
                              style={[styles.metricValue, { color: c.orange }]}
                            >
                              {log.energyJ}
                            </Text>
                            <Text
                              style={[styles.metricLabel, { color: c.orange }]}
                            >
                              Joules
                            </Text>
                          </View>
                        </View>

                        {/* Breakdown Action Link */}
                        <View style={styles.breakdownBtn}>
                          <Text
                            style={{
                              color: c.orange,
                              fontSize: scale(10),
                              fontFamily: fonts.bold,
                            }}
                          >
                            View Complete Breakdown
                          </Text>
                          <Ionicons
                            name="chevron-forward"
                            size={scale(12)}
                            color={c.orange}
                          />
                        </View>
                      </Card>
                    </Pressable>
                  ))
                )}
              </View>
            </View>

            <View style={{ marginTop: scale(20) }}>
              <SectionHead title="PREDICTIVE INSPECTIONS" mode={mode} />
              <Card mode={mode} style={styles.diagPanel}>
                {PREDICTIVE.map((p) => (
                  <View key={p.tile} style={styles.diagRow}>
                    <View style={styles.diagRowLeft}>
                      <Text
                        style={{
                          color: c.text,
                          fontSize: scale(12),
                          fontFamily: fonts.semibold,
                        }}
                      >
                        {p.tile}
                      </Text>
                      <Text
                        style={{
                          color: c.textSoft,
                          fontSize: scale(10),
                          fontFamily: fonts.regular,
                          marginTop: scale(2),
                        }}
                      >
                        {p.note}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: mode === "dark" ? "#F6C445" : "#0A2A4A",
                        fontSize: scale(12),
                        fontFamily: fonts.extrabold,
                      }}
                    >
                      {p.metric}
                    </Text>
                  </View>
                ))}
              </Card>
            </View>

            <View style={{ marginTop: scale(16) }}>
              <SectionHead title="WATCHLIST" mode={mode} />
              <Card mode={mode} style={styles.diagPanel}>
                {WATCHLIST.map((w) => (
                  <View key={w.tile} style={styles.diagRow}>
                    <View style={styles.diagRowLeft}>
                      <Text
                        style={{
                          color: c.text,
                          fontSize: scale(12),
                          fontFamily: fonts.semibold,
                        }}
                      >
                        {w.tile}
                      </Text>
                      <Text
                        style={{
                          color: c.textSoft,
                          fontSize: scale(10),
                          fontFamily: fonts.regular,
                          marginTop: scale(2),
                        }}
                      >
                        {w.note}
                      </Text>
                    </View>
                    <Text
                      style={{
                        color: c.textSoft,
                        fontSize: scale(11),
                        fontFamily: fonts.semibold,
                      }}
                    >
                      {w.metric}
                    </Text>
                  </View>
                ))}
              </Card>
            </View>

            <View style={{ marginTop: scale(16) }}>
              <SectionHead title="REMINDERS" mode={mode} />
              <Card mode={mode} style={styles.diagPanel}>
                {REMINDERS.map((r) => (
                  <View key={r.title} style={styles.diagRow}>
                    <View style={styles.diagRowLeft}>
                      <Text
                        style={{
                          color: c.text,
                          fontSize: scale(12),
                          fontFamily: fonts.semibold,
                        }}
                      >
                        {r.title}
                      </Text>
                      <Text
                        style={{
                          color: c.textSoft,
                          fontSize: scale(10),
                          fontFamily: fonts.regular,
                          marginTop: scale(2),
                        }}
                      >
                        {r.note}
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={scale(14)}
                      color={c.muted}
                    />
                  </View>
                ))}
              </Card>
            </View>
          </FadeIn>
        )}

        <View style={{ height: scale(24) }} />
      </ScrollView>

      {/* ==================== COMPLETE BREAKDOWN MODAL ==================== */}
      <Modal
        visible={!!selectedLog}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedLog(null)}
      >
        <View style={styles.modalOverlay}>
          {selectedLog && selectedLogDetails && (
            <Card mode={mode} style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: scale(6),
                  }}
                >
                  <Ionicons name="flash" size={scale(16)} color={c.orange} />
                  <Text
                    style={{
                      color: c.text,
                      fontSize: scale(14),
                      fontFamily: fonts.extrabold,
                    }}
                  >
                    Generation Breakdown
                  </Text>
                </View>
                <Pressable onPress={() => setSelectedLog(null)}>
                  <Ionicons name="close" size={scale(20)} color={c.muted} />
                </Pressable>
              </View>

              <Text
                style={{
                  color: c.textSoft,
                  fontSize: scale(10),
                  fontFamily: fonts.medium,
                  marginBottom: scale(12),
                }}
              >
                Event Logged at {selectedLog.time} · {selectedLog.tile}
              </Text>

              <View style={styles.detailGrid}>
                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: c.textSoft }]}>
                    Step Duration
                  </Text>
                  <Text style={[styles.detailValue, { color: c.text }]}>
                    {selectedLog.ms} ms
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: c.textSoft }]}>
                    Average Bus Voltage
                  </Text>
                  <Text style={[styles.detailValue, { color: c.text }]}>
                    {selectedLog.avgV} V
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: c.textSoft }]}>
                    Average Current Flow
                  </Text>
                  <Text style={[styles.detailValue, { color: c.text }]}>
                    {selectedLog.avgA} A
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: c.textSoft }]}>
                    Calculated Power Output
                  </Text>
                  <Text style={[styles.detailValue, { color: c.orange }]}>
                    {selectedLog.powerW} W
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: c.textSoft }]}>
                    Total Electrical Charge (Q)
                  </Text>
                  <Text style={[styles.detailValue, { color: c.text }]}>
                    {selectedLogDetails.chargeAs} A·s
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={[styles.detailLabel, { color: c.textSoft }]}>
                    Total Energy Harvested
                  </Text>
                  <Text style={[styles.detailValue, { color: "#22C55E" }]}>
                    {selectedLog.energyJ} J ({selectedLogDetails.microJoules}{" "}
                    µJ)
                  </Text>
                </View>
              </View>

              <View style={styles.formulaBox}>
                <Text style={styles.formulaTitle}>Harvesting Formula:</Text>
                <Text style={[styles.formulaText, { color: c.textSoft }]}>
                  Energy (J) = Voltage ({selectedLog.avgV}V) × Current (
                  {selectedLog.avgA}A) × Time ({selectedLog.ms}ms / 1000)
                </Text>
              </View>

              <Pressable
                style={[styles.closeBtn, { backgroundColor: c.orange }]}
                onPress={() => setSelectedLog(null)}
              >
                <Text
                  style={{
                    color: "#FFFFFF",
                    fontSize: scale(11),
                    fontFamily: fonts.extrabold,
                  }}
                >
                  Close Breakdown
                </Text>
              </Pressable>
            </Card>
          )}
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  segWrap: {
    borderRadius: scale(14),
    padding: scale(2),
    position: "relative",
    overflow: "hidden",
  },
  segRow: { flexDirection: "row", gap: scale(2) },
  segItem: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(4),
    paddingVertical: scale(6),
  },
  segItemActive: { borderRadius: scale(11), overflow: "hidden" },
  segText: {
    fontSize: scale(9),
    fontFamily: fonts.extrabold,
    letterSpacing: 0.6,
  },
  header: {
    marginTop: scale(4),
    marginBottom: scale(4),
    padding: scale(12),
    borderRadius: scale(18),
    borderWidth: 1,
  },
  headerEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(7),
    marginBottom: scale(4),
  },
  headerTick: { width: scale(3), height: scale(12), borderRadius: 2 },
  grid: { marginTop: scale(2) },
  heatSurface: {
    position: "relative",
    overflow: "hidden",
    minHeight: scale(222),
    borderRadius: scale(20),
    paddingHorizontal: scale(12),
    paddingVertical: scale(12),
    backgroundColor: "#1D1A2A",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    shadowColor: "#0B101A",
    shadowOpacity: 0.42,
    shadowRadius: scale(16),
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  heatGlow: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0 },
  heatGridContent: { position: "relative" },
  gridRow: { flexDirection: "row", gap: scale(6), marginBottom: scale(6) },
  tileCard: {
    flex: 1,
    height: scale(91),
    borderRadius: scale(13),
    padding: scale(8),
    overflow: "hidden",
    borderWidth: 1.5,
    shadowColor: "#090B12",
    shadowOpacity: 0.48,
    shadowRadius: scale(9),
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  tileDepth: {
    position: "absolute",
    left: scale(4),
    right: scale(4),
    bottom: 0,
    height: scale(8),
    opacity: 0.9,
  },
  tileSheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "42%",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  tileDiagonal: {
    position: "absolute",
    width: "145%",
    height: 1,
    top: "50%",
    left: "-22%",
    backgroundColor: "rgba(52,12,6,0.64)",
    transform: [{ rotate: "45deg" }],
  },
  tileBevelTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  tileBevelBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(57,12,5,0.72)",
  },
  tileInner: { flex: 1, alignItems: "center", justifyContent: "center" },
  tileLabel: { fontSize: scale(7), letterSpacing: 1, fontFamily: fonts.bold },
  tileTraffic: {
    fontSize: scale(17),
    fontFamily: fonts.extrabold,
    marginTop: scale(3),
  },
  tileFlag: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(3),
    marginTop: scale(4),
  },
  tileFlagText: { fontSize: scale(8), fontFamily: fonts.bold },
  statsGrid: {
    flexDirection: "row",
    gap: scale(10),
    marginTop: scale(6),
  },
  statCard: {
    flex: 1,
    padding: scale(12),
    borderRadius: scale(16),
    alignItems: "center",
    gap: scale(4),
  },
  statValue: {
    fontSize: scale(14),
    fontFamily: fonts.extrabold,
  },
  statLabel: {
    fontSize: scale(9),
    fontFamily: fonts.semibold,
  },
  overviewCard: {
    padding: scale(12),
    borderRadius: scale(16),
    marginTop: scale(10),
  },
  overviewRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
    backgroundColor: "rgba(34,197,94,0.15)",
    paddingHorizontal: scale(8),
    paddingVertical: scale(4),
    borderRadius: scale(10),
  },
  statusBadgeText: {
    fontSize: scale(9),
    fontFamily: fonts.bold,
    color: "#22C55E",
  },
  diagSummary: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(8),
    marginTop: scale(10),
  },
  feedHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: scale(4),
  },
  archiveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
    backgroundColor: "rgba(249,115,22,0.12)",
    paddingHorizontal: scale(8),
    paddingVertical: scale(4),
    borderRadius: scale(8),
  },
  archiveBtnText: {
    fontSize: scale(9.5),
    fontFamily: fonts.bold,
  },
  kineticCard: {
    borderRadius: scale(16),
    padding: scale(12),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
  },
  kineticHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: scale(10),
    paddingBottom: scale(10),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150,150,150,0.15)",
  },
  kineticTileRow: { flexDirection: "row", alignItems: "center", gap: scale(6) },
  kineticTileText: { fontSize: scale(11), fontFamily: fonts.extrabold },
  kineticTimeText: { fontSize: scale(9), fontFamily: fonts.medium },
  metricsGrid: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  metricItem: { alignItems: "center", gap: scale(2) },
  metricValue: { fontSize: scale(13), fontFamily: fonts.extrabold },
  metricLabel: { fontSize: scale(8), fontFamily: fonts.bold },
  breakdownBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: scale(4),
    marginTop: scale(10),
    paddingTop: scale(8),
    borderTopWidth: 1,
    borderTopColor: "rgba(150,150,150,0.12)",
  },
  diagPanel: {
    borderRadius: scale(16),
    padding: scale(12),
    marginTop: scale(6),
    gap: scale(10),
  },
  diagRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  diagRowLeft: { flex: 1, marginRight: scale(8) },

  /* Modal Styles */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "center",
    alignItems: "center",
    padding: scale(16),
  },
  modalContent: {
    width: "100%",
    borderRadius: scale(20),
    padding: scale(16),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.15)",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  detailGrid: {
    gap: scale(8),
    marginVertical: scale(8),
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: scale(4),
    borderBottomWidth: 1,
    borderBottomColor: "rgba(150,150,150,0.12)",
  },
  detailLabel: {
    fontSize: scale(10.5),
    fontFamily: fonts.medium,
  },
  detailValue: {
    fontSize: scale(11.5),
    fontFamily: fonts.bold,
  },
  formulaBox: {
    backgroundColor: "rgba(249,115,22,0.1)",
    padding: scale(10),
    borderRadius: scale(12),
    marginTop: scale(10),
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.2)",
  },
  formulaTitle: {
    fontSize: scale(9.5),
    fontFamily: fonts.bold,
    color: "#F97316",
    marginBottom: scale(2),
  },
  formulaText: {
    fontSize: scale(9),
    fontFamily: fonts.regular,
  },
  closeBtn: {
    marginTop: scale(14),
    paddingVertical: scale(10),
    borderRadius: scale(12),
    alignItems: "center",
  },
});
