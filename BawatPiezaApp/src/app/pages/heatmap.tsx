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
import { useFocusEffect, useRouter } from "expo-router";
import { AppText as Text } from "../../components/app-text";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Paho from "paho-mqtt";
import "text-encoding"; // Required Polyfill for MQTT
import { supabase } from "../../lib/supabase"; // Supabase client connection

import { ScreenShell } from "../../components/screen-shell";
import {
  brandAccent,
  Card,
  LiveDot,
  SectionHead,
  scale,
} from "../../components/glass-ui";
import { HeatmapTileScene } from "../../components/heatmap-tile-scene-adaptive";
import { installedTileCountKey } from "../../lib/device-setup";
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

function createTiles(count: number): TileDatum[] {
  return Array.from({ length: count }, (_, index) => {
    const id = index + 1;
    const traffic = id === 1 ? 0.92 : 0.01 + ((id * 17) % 5) / 100;
    return { id, label: `Tile ${id}`, traffic };
  });
}

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
  const { colors: c } = useTheme();
  const items: { key: ViewMode; label: string; icon: IconName }[] = [
    { key: "view", label: "View Only", icon: "grid-outline" },
    { key: "diagnostic", label: "Diagnostic", icon: "pulse-outline" },
  ];

  return (
    <View
      style={[
        styles.segWrap,
        { backgroundColor: c.surface },
      ]}
    >
      <View style={styles.segRow}>
        {items.map((item) => {
          const active = value === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onChange(item.key)}
              style={[
                styles.segItem,
                {
                  backgroundColor: active ? c.accent : c.surfaceMuted,
                  borderColor: active ? c.accent : c.line,
                },
                active && styles.segItemActive,
              ]}
            >
              <Ionicons
                name={item.icon}
                size={scale(12)}
                color={active ? c.onAccent : c.muted}
              />
              <Text
                style={[
                  styles.segText,
                  { color: active ? c.onAccent : c.muted },
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

function HeatSurface({ children }: { children: ReactNode }) {
  const { colors: c, mode } = useTheme();

  return (
    <View
      style={[
        styles.heatSurface,
        { backgroundColor: c.surface, borderColor: c.line },
      ]}
    >
      <View
        style={[
          styles.heatSurfaceAccent,
          { backgroundColor: brandAccent(mode) },
        ]}
      />
      <View style={styles.heatGridContent}>{children}</View>
    </View>
  );
}

/* --------------------------------- screen ---------------------------------- */

export default function HeatmapScreen() {
  const router = useRouter();
  const { colors: c, mode } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>("view");
  const [kineticLogs, setKineticLogs] = useState<KineticLog[]>([]);
  const [installedTileCount, setInstalledTileCount] = useState(0);
  const [tileSetupLoaded, setTileSetupLoaded] = useState(false);
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

  const tiles = useMemo(
    () => createTiles(installedTileCount),
    [installedTileCount],
  );
  const flaggedCount = tiles.filter(
    (t) => t.traffic >= systemRules.floor,
  ).length;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;

      const loadInstalledTileCount = async () => {
        let count = 0;
        try {
          const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
          if (hubId) {
            try {
              const { data, error } = await supabase
                .from("device_setups")
                .select("installed_tile_count")
                .eq("hub_id", hubId)
                .maybeSingle();
              if (error) throw error;

              const remoteCount = Number(data?.installed_tile_count);
              if (Number.isSafeInteger(remoteCount) && remoteCount >= 1) {
                count = remoteCount;
              }
            } catch (error) {
              console.error(
                "[heatmap] failed to load installed tile setup",
                error,
              );
            }

            if (count === 0) {
              const localCount = Number(
                await AsyncStorage.getItem(installedTileCountKey(hubId)),
              );
              if (Number.isSafeInteger(localCount) && localCount >= 1) {
                count = localCount;
              }
            }
          }
        } catch (error) {
          console.error("[heatmap] failed to read installed tile count", error);
        } finally {
          if (!cancelled) {
            setInstalledTileCount(count);
            setTileSetupLoaded(true);
          }
        }
      };

      void loadInstalledTileCount();
      return () => {
        cancelled = true;
      };
    }, []),
  );

  // === DYNAMIC DATABASE DETECTOR: FETCH RULES & LOGS ON LOAD ===
  useEffect(() => {
    let cancelled = false;
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
            if (cancelled) return;
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
              if (!cancelled) {
                setSystemRules({
                  floor:
                    Number(parsed.floor) > 1 ? 0.75 : Number(parsed.floor),
                  degradation: Number(parsed.degradation),
                  watchWindow: Number(parsed.watchWindow),
                });
              }
            }
          }
        }

        // 2. Fetch Live Log Records from Supabase
        let query = supabase
          .from("kinetic_logs")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50);
        if (hubId) query = query.eq("hub_id", hubId);
        const { data, error } = await query;

        if (data && !error && data.length > 0) {
          const seenEvents = new Set<string>();
          const uniqueRows = data.filter((item) => {
            if (typeof item.event_id !== "string" || !item.event_id) return true;
            const eventKey = `${item.hub_id}:${item.event_id}`;
            if (seenEvents.has(eventKey)) return false;
            seenEvents.add(eventKey);
            return true;
          });
          const dbLogs: KineticLog[] = uniqueRows.map((item) => ({
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
          if (cancelled) return;
          setKineticLogs(dbLogs);
          await AsyncStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(dbLogs));
          return;
        }

        // 3. Local AsyncStorage fallback for logs
        const stored = await AsyncStorage.getItem(LOGS_STORAGE_KEY);
        if (stored && !cancelled) {
          setKineticLogs(JSON.parse(stored));
        }
      } catch (error) {
        console.error("Failed to load system data", error);
      }
    };

    void loadSystemData();
    return () => {
      cancelled = true;
    };
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
            const eventId =
              typeof data.event_id === "string" && data.event_id.trim()
                ? data.event_id.trim()
                : null;
            if (!eventId) {
              console.warn(
                "[heatmap] footstep MQTT event has no event_id; flash updated firmware for duplicate-safe generation logs",
              );
            }

            const newStep: KineticLog = {
              id: eventId ? `mqtt:${hubId}:${eventId}` : `tx-${Date.now()}`,
              tile: tileLabel,
              time: timestamp,
              ms: data.ms ? data.ms.toString() : "0",
              avgV: formatNum(data.avg_v, 2),
              avgA: formatNum(data.avg_a, 3),
              powerW: formatNum(data.avg_w, 3),
              energyJ: formatNum(data.joules, 4),
            };

            setKineticLogs((prev) => {
              if (prev.some((log) => log.id === newStep.id)) return prev;
              const updated = [newStep, ...prev].slice(0, 50);
              AsyncStorage.setItem(
                LOGS_STORAGE_KEY,
                JSON.stringify(updated),
              ).catch(() => {});
              return updated;
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
    <ScreenShell title="Heatmap" showBack showNoDeviceNotice>
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
          <View style={{ marginTop: scale(4) }}>
            <Segmented value={viewMode} onChange={setViewMode} />
          </View>
        </FadeIn>

        <FadeIn delay={80}>
          <View style={styles.titleBlock}>
            <View style={styles.headerEyebrowRow}>
              <View
                style={[
                  styles.headerTick,
                  { backgroundColor: brandAccent(mode) },
                ]}
              />
              <Text
                style={{
                  color: c.accent,
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
                fontSize: scale(18),
                fontFamily: fonts.extrabold,
                letterSpacing: -0.3,
              }}
            >
              Gate Pathway
            </Text>
            <Text
              style={{
                color:
                  mode === "dark"
                    ? "rgba(237,242,250,0.55)"
                    : "rgba(10,42,74,0.62)",
                fontSize: scale(10),
                fontFamily: fonts.medium,
                marginTop: scale(3),
              }}
            >
              Live tile heat · Warmer tiles mean more foot traffic
            </Text>
          </View>
        </FadeIn>

        <FadeIn delay={160}>
          <HeatSurface>
            <View style={styles.grid}>
              {!tileSetupLoaded ? (
                <Text
                  style={[
                    styles.tileSetupMessage,
                    { color: c.textSoft },
                  ]}
                >
                  Loading installed tile setup...
                </Text>
              ) : tiles.length === 0 ? (
                <View style={{ alignItems: "center" }}>
                  <Text
                    style={[
                      styles.tileSetupMessage,
                      { color: c.text },
                    ]}
                  >
                    No triangular tiles are configured. Complete Device Setup
                    to display your installed tiles.
                  </Text>
                  <Pressable
                    onPress={() =>
                      router.push("/pages/device-setup?returnTo=heatmap")
                    }
                    style={[
                      styles.setupHeatmapButton,
                      { backgroundColor: c.accent },
                    ]}
                    accessibilityRole="button"
                    accessibilityLabel="Complete device setup for the heatmap"
                  >
                    <Ionicons
                      name="hardware-chip-outline"
                      size={scale(15)}
                      color={c.onAccent}
                    />
                    <Text
                      style={[
                        styles.setupHeatmapButtonText,
                        { color: c.onAccent },
                      ]}
                    >
                      Complete Device Setup
                    </Text>
                  </Pressable>
                </View>
              ) : (
                <HeatmapTileScene
                  tiles={tiles}
                  maxVisibleTiles={tiles.length}
                  viewMode={viewMode}
                  activeThreshold={systemRules.floor}
                  dark={mode === "dark"}
                />
              )}
            </View>
          </HeatSurface>
        </FadeIn>

        {/* ==================== VIEW ONLY MODE ==================== */}
        {viewMode === "view" && (
          <FadeIn delay={240}>
            <View style={{ marginTop: scale(16) }}>
              <SectionHead title="PATHWAY OVERVIEW" mode={mode} />

              <View style={styles.statsGrid}>
                <Card
                  mode={mode}
                  style={[
                    styles.statCard,
                    { backgroundColor: c.surface, borderColor: c.line },
                  ]}
                >
                  <Ionicons
                    name="footsteps-outline"
                    size={scale(18)}
                    color={c.accent}
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

                <Card
                  mode={mode}
                  style={[
                    styles.statCard,
                    { backgroundColor: c.surface, borderColor: c.line },
                  ]}
                >
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

              <Card
                mode={mode}
                style={[
                  styles.overviewCard,
                  { backgroundColor: c.surface, borderColor: c.line },
                ]}
              >
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
                      {installedTileCount > 0
                        ? `${installedTileCount} triangular tiles configured. Peak traffic active on Tile 1.`
                        : "No triangular tile setup found. Complete Device Setup to configure the heatmap."}
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
                    style={[
                      styles.archiveBtn,
                      {
                        backgroundColor:
                          mode === "dark"
                            ? "rgba(249,115,22,0.12)"
                            : "rgba(246,196,69,0.2)",
                      },
                    ]}
                    hitSlop={8}
                  >
                    <Ionicons
                      name="archive-outline"
                      size={scale(12)}
                      color={c.accent}
                    />
                    <Text style={[styles.archiveBtnText, { color: c.accent }]}>
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
                      <Card
                        mode={mode}
                        style={[
                          styles.kineticCard,
                          { backgroundColor: c.surface, borderColor: c.line },
                        ]}
                      >
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
              <Card
                mode={mode}
                style={[
                  styles.diagPanel,
                  { backgroundColor: c.surface, borderColor: c.line },
                ]}
              >
                {PREDICTIVE.filter(
                  (item) =>
                    Number(item.tile.replace("Tile ", "")) <=
                    installedTileCount,
                ).map((p) => (
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
              <Card
                mode={mode}
                style={[
                  styles.diagPanel,
                  { backgroundColor: c.surface, borderColor: c.line },
                ]}
              >
                {WATCHLIST.filter(
                  (item) =>
                    Number(item.tile.replace("Tile ", "")) <=
                    installedTileCount,
                ).map((w) => (
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
              <Card
                mode={mode}
                style={[
                  styles.diagPanel,
                  { backgroundColor: c.surface, borderColor: c.line },
                ]}
              >
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
            <Card
              mode={mode}
              style={[
                styles.modalContent,
                { backgroundColor: c.surface, borderColor: c.line },
              ]}
            >
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
    flexDirection: "row",
    padding: scale(3),
    borderRadius: scale(12),
    marginBottom: scale(16),
    shadowColor: "#000000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  segRow: { flex: 1, flexDirection: "row", gap: scale(2) },
  segItem: {
    flex: 1,
    minHeight: scale(34),
    borderRadius: scale(9),
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    flexDirection: "row",
    gap: scale(4),
  },
  segItemActive: { borderRadius: scale(9), overflow: "hidden" },
  segText: {
    fontSize: scale(9.5),
    fontFamily: fonts.bold,
  },
  titleBlock: {
    marginTop: scale(2),
    marginBottom: scale(12),
    paddingHorizontal: scale(3),
  },
  headerEyebrowRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(7),
    marginBottom: scale(4),
  },
  headerTick: { width: scale(3), height: scale(12), borderRadius: 2 },
  grid: { marginTop: scale(2) },
  tileSetupMessage: {
    fontSize: scale(11),
    fontFamily: fonts.medium,
    lineHeight: scale(16),
    paddingHorizontal: scale(12),
    paddingVertical: scale(24),
    textAlign: "center",
  },
  setupHeatmapButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(7),
    borderRadius: scale(12),
    backgroundColor: "#F97316",
    paddingHorizontal: scale(14),
    paddingVertical: scale(9),
    marginBottom: scale(14),
  },
  setupHeatmapButtonText: {
    color: "#FFFFFF",
    fontSize: scale(10),
    fontFamily: fonts.extrabold,
  },
  heatSurface: {
    position: "relative",
    overflow: "hidden",
    borderRadius: scale(15),
    paddingHorizontal: scale(8),
    paddingVertical: scale(8),
    borderWidth: 1,
    shadowColor: "#0A2A4A",
    shadowOpacity: 0.08,
    shadowRadius: scale(8),
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  heatSurfaceAccent: {
    height: scale(3),
    marginHorizontal: scale(-8),
    marginTop: scale(-8),
    marginBottom: scale(7),
  },
  heatGridContent: {
    position: "relative",
    width: "88%",
    alignSelf: "center",
  },
  statsGrid: {
    flexDirection: "row",
    gap: scale(8),
    marginTop: scale(5),
  },
  statCard: {
    flex: 1,
    padding: scale(10),
    borderRadius: scale(13),
    alignItems: "center",
    gap: scale(3),
    borderWidth: 1,
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
    padding: scale(10),
    borderRadius: scale(13),
    marginTop: scale(8),
    borderWidth: 1,
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
    borderRadius: scale(13),
    padding: scale(10),
    borderWidth: 1,
  },
  kineticHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: scale(7),
    paddingBottom: scale(7),
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
    borderRadius: scale(13),
    padding: scale(10),
    marginTop: scale(5),
    gap: scale(8),
    borderWidth: 1,
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
    borderRadius: scale(15),
    padding: scale(14),
    borderWidth: 1,
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
