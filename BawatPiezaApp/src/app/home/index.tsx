import { fonts, useTheme, type Mode } from "../../theme";
import React, { useEffect, useState, useRef, useCallback } from "react";
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  ScrollView,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { AppText as Text } from "../../components/app-text";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { ScreenShell } from "../../components/screen-shell";
import { LoadingScreen } from "../../components/loading-screen";
import { TourSpot } from "../../components/app-tour-overlay";
import { useAppTour } from "../../hooks/use-app-tour";
import { useAuth } from "../../hooks/use-auth";
import { usePowerOverride } from "../../hooks/use-power-override";
import { TopBar } from "../../components/top-bar";
import { HeroGlow } from "../../components/hero-glow";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Paho from "paho-mqtt";
import "text-encoding";
import { supabase } from "../../lib/supabase";
import { installedTileCountKey } from "../../lib/device-setup";
import { CountUpText } from "../../components/count-up-text";
import { DashboardStats } from "./dashboard/stats-and-battery";
import { DashboardActions } from "./dashboard/dashboard-actions";
import { st } from "./dashboard/home-styles";
import {
  useDeviceConnection,
} from "../../components/device-status-banner";

import {
  Card,
  Glass,
  LiveDot,
  SectionHead,
  brandAccent,
  scale,
  GOLD,
  NAVY,
} from "../../components/glass-ui";
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Line,
  Path,
  Stop,
} from "react-native-svg";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const BRAND_ORANGE = "#F5A220";
const BRAND_ORANGE_DARK = "#E6641F";

const getDateKey = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

type GenerationSummaryDay = {
  log_day: string;
  footsteps: number;
  generated_kwh: number;
};

type KineticGenerationLog = {
  created_at: string;
  energy_j: number | string | null;
};

type HubTelemetry = {
  bat_pct?: unknown;
  bat_v?: unknown;
  bat_w?: unknown;
  dyn_v?: unknown;
  dyn_w?: unknown;
  grid_v?: unknown;
  grid_a?: unknown;
  grid_w?: unknown;
  grid_kwh?: unknown;
  charger_on?: unknown;
  event?: unknown;
};

function readTelemetryNumber(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

type GridPalette = {
  gridActive: boolean;
  batteryCardInk: string;
};

function useGridPalette(usingGrid: boolean, mode: Mode): GridPalette {
  return {
    gridActive: usingGrid,
    batteryCardInk: mode === "dark" ? "#FFFFFF" : "#0A2A4A",
  };
}

function EnterView({
  delay,
  style,
  children,
}: {
  delay?: number;
  style?: object;
  children: React.ReactNode;
}) {
  return <View style={style}>{children}</View>;
}

const SOURCE_META: Record<
  string,
  { icon: keyof typeof Ionicons.glyphMap; color: string; tint: string }
> = {
  Battery: {
    icon: "battery-charging",
    color: BRAND_ORANGE_DARK,
    tint: "rgba(245,162,32,0.14)",
  },
  Grid: { icon: "flash", color: "#7C3AED", tint: "rgba(124,58,237,0.12)" },
  Solar: { icon: "sunny", color: "#B45309", tint: "rgba(245,158,11,0.16)" },
};

export default function HomeScreen() {
  const { colors: c, mode } = useTheme();
  const { ready, isLoggedIn, user } = useAuth();
  const router = useRouter();
  const hasDevice = useDeviceConnection();

  const { override, openOverrides } = usePowerOverride();
  const usingGrid = override === "grid" || override === null;

  const activeOrange = BRAND_ORANGE;
  const activeOrangeDark = BRAND_ORANGE_DARK;
  const activeAccent = c.orange;
  const activeAccentSoft = c.accentSoft;

  const {
    checked,
    completed,
    welcomeSeen,
    openWelcome,
    scrollContainerRef,
    setScrollOffsetY,
  } = useAppTour();
  const accent = (alpha = 1) => brandAccent(mode, alpha);
  const { gridActive, batteryCardInk } = useGridPalette(usingGrid, mode);

  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [livePower, setLivePower] = useState<number | null>(null);
  const [displayVoltage, setDisplayVoltage] = useState<string>("--");
  const [gridVoltage, setGridVoltage] = useState<number | null>(null);
  const [gridCurrent, setGridCurrent] = useState<number | null>(null);
  const [gridPower, setGridPower] = useState<number | null>(null);
  const [gridEnergyKwh, setGridEnergyKwh] = useState<number | null>(null);
  const [footsteps, setFootsteps] = useState<number>(0);
  const [generationByDay, setGenerationByDay] = useState<
    GenerationSummaryDay[]
  >([]);
  const [hasLoadedGenerationSummary, setHasLoadedGenerationSummary] =
    useState(false);
  const [mqttStatus, setMqttStatus] = useState<
    "Connecting..." | "Live" | "Offline"
  >("Connecting...");
  const [refreshing, setRefreshing] = useState(false);
  const [isSharedUser, setIsSharedUser] = useState(false);
  const mqttClientRef = useRef<Paho.Client | null>(null);
  const zoneStateRef = useRef(true);
  const pendingZoneStateRef = useRef<{
    on: boolean;
    expiresAt: number;
  } | null>(null);
  const zoneCommandIdRef = useRef(0);

  const batteryCardMutedInk =
    mode === "dark" ? "rgba(255,255,255,0.82)" : "rgba(10,42,74,0.72)";
  const [consumptionRange, setConsumptionRange] = useState<
    "today" | "7days" | "month"
  >("today");
  const [rangeMenuOpen, setRangeMenuOpen] = useState(false);
  const statsPop = useRef(new Animated.Value(0)).current;
  const graphProgress = useRef(new Animated.Value(0)).current;
  const currentHour = new Date().getHours();
  const greeting =
    currentHour < 12
      ? "Good morning"
      : currentHour < 18
        ? "Good afternoon"
        : "Good evening";
  const metadataName =
    typeof user?.user_metadata?.firstname === "string"
      ? user.user_metadata.firstname
      : typeof user?.user_metadata?.first_name === "string"
        ? user.user_metadata.first_name
        : typeof user?.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name.split(" ")[0]
          : "";

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem("bawatpieza_shared_access")
      .then((value) => {
        if (!cancelled) setIsSharedUser(value === "1");
      })
      .catch((error) => {
        console.warn("failed to read shared user status", error);
        if (!cancelled) setIsSharedUser(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const loadGenerationSummary = useCallback(async () => {
    const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
    if (!hubId) {
      setGenerationByDay([]);
      setFootsteps(0);
      return;
    }

    const now = new Date();
    const summaryStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const pageSize = 1000;
    const logs: KineticGenerationLog[] = [];
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from("kinetic_logs")
        .select("created_at, energy_j")
        .eq("hub_id", hubId)
        .gte("created_at", summaryStart.toISOString())
        .order("created_at", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;

      const page = (data ?? []) as KineticGenerationLog[];
      logs.push(...page);
      if (page.length < pageSize) break;
    }

    const dailyTotals = new Map<
      string,
      { footsteps: number; energyJ: number }
    >();
    for (const log of logs) {
      const day = getDateKey(new Date(log.created_at));
      const total = dailyTotals.get(day) ?? { footsteps: 0, energyJ: 0 };
      total.footsteps += 1;
      total.energyJ += Number(log.energy_j ?? 0);
      dailyTotals.set(day, total);
    }

    const rows: GenerationSummaryDay[] = [...dailyTotals.entries()].map(
      ([log_day, total]) => ({
        log_day,
        footsteps: total.footsteps,
        generated_kwh: total.energyJ / 3_600_000,
      }),
    );
    if ((await AsyncStorage.getItem("bawatpieza_hub_id")) !== hubId) return;
    setGenerationByDay(rows);
    const today = rows.find((row) => row.log_day === getDateKey(now));
    setFootsteps(Number(today?.footsteps ?? 0));
  }, []);

  useEffect(() => {
    if (!ready || !isLoggedIn || hasDevice !== true) return;
    let cancelled = false;

    const refreshSummary = async () => {
      try {
        await loadGenerationSummary();
      } catch (error) {
        console.error(
          "[dashboard] failed to load device generation history",
          error,
        );
      } finally {
        if (!cancelled) setHasLoadedGenerationSummary(true);
      }
    };

    void refreshSummary();
    const interval = setInterval(() => {
      if (!cancelled) void refreshSummary();
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [ready, isLoggedIn, hasDevice, loadGenerationSummary]);

  useEffect(() => {
    if (hasDevice !== false) return;

    const client = mqttClientRef.current;
    mqttClientRef.current = null;
    try {
      if (client?.isConnected()) client.disconnect();
    } catch (error) {
      console.warn("[dashboard] MQTT disconnect after device unlink failed", error);
    }
    setBatteryPct(null);
    setLivePower(null);
    setDisplayVoltage("--");
    setGridVoltage(null);
    setGridCurrent(null);
    setGridPower(null);
    setGridEnergyKwh(null);
    setGenerationByDay([]);
    setFootsteps(0);
    setHasLoadedGenerationSummary(true);
    setMqttStatus("Offline");
  }, [hasDevice]);

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

      const clientId = `app-home-${Math.random().toString(16).substring(2, 8)}`;
      client = new Paho.Client("broker.hivemq.com", 8884, clientId);
      mqttClientRef.current = client;

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
          const data = JSON.parse(message.payloadString) as HubTelemetry;

          const batteryPercentage = readTelemetryNumber(data.bat_pct);
          if (batteryPercentage !== null) {
            const normalizedPercentage = Math.min(
              100,
              Math.max(0, batteryPercentage),
            );
            setBatteryPct(normalizedPercentage);
          }

          const batteryVoltage = readTelemetryNumber(data.bat_v);
          if (batteryVoltage !== null) {
            setDisplayVoltage(batteryVoltage.toFixed(2));
          }

          const generatedPower = readTelemetryNumber(data.dyn_w);
          const batteryPower = readTelemetryNumber(data.bat_w);
          if (generatedPower !== null) setLivePower(Math.round(generatedPower));
          else if (batteryPower !== null) setLivePower(Math.round(batteryPower));

          const voltage = readTelemetryNumber(data.grid_v);
          const current = readTelemetryNumber(data.grid_a);
          const power = readTelemetryNumber(data.grid_w);
          const energy = readTelemetryNumber(data.grid_kwh);
          if (voltage !== null) setGridVoltage(voltage);
          if (current !== null) setGridCurrent(current);
          if (power !== null) setGridPower(power);
          if (energy !== null) setGridEnergyKwh(energy);

          if (typeof data.charger_on === "boolean") {
            const chargerOn = data.charger_on;
            const pendingZoneState = pendingZoneStateRef.current;
            const awaitingCommandConfirmation =
              pendingZoneState !== null &&
              chargerOn !== pendingZoneState.on &&
              Date.now() < pendingZoneState.expiresAt;

            if (!awaitingCommandConfirmation) {
              pendingZoneStateRef.current = null;
              zoneStateRef.current = chargerOn;
              setZones((zs) =>
                zs.map((z) =>
                  z.id === "1" ? { ...z, on: chargerOn } : z,
                ),
              );
            }
          }

          if (data.event === "footstep") {
            void loadGenerationSummary().catch((error) => {
              console.error(
                "[dashboard] failed to refresh device generation",
                error,
              );
            });
          }
        } catch (error) {
          console.error("[dashboard] could not parse hub telemetry", error);
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
  }, [user, hasDevice, loadGenerationSummary]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    connectMQTT();
    loadGenerationSummary().catch((error) => {
      console.error("[dashboard] failed to refresh device generation", error);
    });
  }, [connectMQTT, loadGenerationSummary]);

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

  useEffect(() => {
    Animated.parallel([
      Animated.spring(statsPop, {
        toValue: 1,
        friction: 8,
        tension: 55,
        useNativeDriver: true,
      }),
      Animated.timing(graphProgress, {
        toValue: 1,
        duration: 1100,
        delay: 180,
        useNativeDriver: false,
      }),
    ]).start();
  }, [graphProgress, statsPop]);

  useEffect(() => {
    if (!ready || !isLoggedIn) return;
    if (!checked) return;
    if (completed || welcomeSeen) return;
    const timer = setTimeout(() => openWelcome(), 700);
    return () => clearTimeout(timer);
  }, [ready, isLoggedIn, checked, completed, welcomeSeen, openWelcome]);

  const [zones, setZones] = useState([
    {
      id: "1",
      name: "test appliance",
      source: "battery",
      detail: "connected to relay 1",
      on: true, // Match default boot state
    },
  ]);
  const onZoneToggle = useCallback(async (zoneId: string) => {
    const nextState = !zoneStateRef.current;
    zoneStateRef.current = nextState;
    const requestId = ++zoneCommandIdRef.current;
    pendingZoneStateRef.current = {
      on: nextState,
      expiresAt: Date.now() + 6000,
    };
    setZones((currentZones) =>
      currentZones.map((zone) =>
        zone.id === zoneId ? { ...zone, on: nextState } : zone,
      ),
    );

    try {
      const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
      if (requestId !== zoneCommandIdRef.current) return;
      const client = mqttClientRef.current;
      if (!hubId || !client?.isConnected()) return;

      const message = new Paho.Message(
        JSON.stringify({ command: nextState ? "charger_on" : "charger_off" }),
      );
      message.destinationName = `bawatpieza/devices/${hubId}/commands`;
      client.send(message);
    } catch (error) {
      console.error("[dashboard] failed to send zone state command", error);
    }
  }, []);
  const [activeTile, setActiveTile] = useState<number | null>(null);
  const [installedTileCount, setInstalledTileCount] = useState(0);
  const [tileSetupLoaded, setTileSetupLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (hasDevice !== true) return;

    const loadInstalledTileCount = async () => {
      try {
        const hubId = await AsyncStorage.getItem("bawatpieza_hub_id");
        if (!hubId) {
          if (!cancelled) setInstalledTileCount(0);
          return;
        }

        try {
          const { data, error } = await supabase
            .from("device_setups")
            .select("installed_tile_count")
            .eq("hub_id", hubId)
            .maybeSingle();
          if (error) throw error;
          if (
            typeof data?.installed_tile_count === "number" &&
            Number.isSafeInteger(data.installed_tile_count) &&
            data.installed_tile_count >= 6
          ) {
            if (!cancelled) {
              setInstalledTileCount(data.installed_tile_count);
            }
            return;
          }
        } catch (error) {
          console.error(
            "[dashboard] failed to load installed tile setup",
            error,
          );
        }

        const localCount = Number(
          await AsyncStorage.getItem(installedTileCountKey(hubId)),
        );
        if (!cancelled) {
          setInstalledTileCount(
            Number.isSafeInteger(localCount) && localCount >= 6
              ? localCount
              : 0,
          );
        }
      } catch (error) {
        console.error("[dashboard] failed to read installed tile count", error);
        if (!cancelled) setInstalledTileCount(0);
      } finally {
        if (!cancelled) setTileSetupLoaded(true);
      }
    };

    void loadInstalledTileCount();
    return () => {
      cancelled = true;
    };
  }, [hasDevice]);

  const isActive = hasDevice === true;
  const isLoadingDashboardData =
    hasDevice === null || (isActive && !hasLoadedGenerationSummary);

  const stats = [
    { label: "Voltage", value: Number(displayVoltage), decimals: 2, unit: "V" },
    {
      label: "Power",
      value: livePower ?? 0,
      unit: "W",
    },
    {
      label: "Footsteps",
      value: footsteps.toLocaleString(),
      unit: "Steps",
    },
  ];

  const generationTotalsByDay = new Map(
    generationByDay.map((row) => [
      row.log_day,
      {
        footsteps: Number(row.footsteps),
        kwh: Number(row.generated_kwh),
      },
    ]),
  );
  const totalForDateRange = (start: Date, endExclusive: Date) => {
    let footstepsTotal = 0;
    let kwhTotal = 0;
    const day = new Date(
      start.getFullYear(),
      start.getMonth(),
      start.getDate(),
    );
    while (day < endExclusive) {
      const total = generationTotalsByDay.get(getDateKey(day));
      footstepsTotal += total?.footsteps ?? 0;
      kwhTotal += total?.kwh ?? 0;
      day.setDate(day.getDate() + 1);
    }
    return { footsteps: footstepsTotal, kwh: kwhTotal };
  };
  const makeGenerationEntry = (
    label: string,
    current: { footsteps: number; kwh: number },
    previous: { footsteps: number; kwh: number },
    deltaLabel: string,
  ) => ({
    label,
    kwh: current.kwh,
    comparison: `${previous.kwh.toFixed(2)} kWh ${deltaLabel}`,
    delta:
      previous.kwh === 0
        ? current.kwh === 0
          ? "0.0%"
          : "New"
        : `${(((current.kwh - previous.kwh) / previous.kwh) * 100).toFixed(1)}%`,
    detail: `${current.footsteps.toLocaleString()} steps recorded`,
    deltaLabel,
  });

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  const yesterdayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );
  const sevenDaysStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 6,
  );
  const previousSevenDaysStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 13,
  );
  const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const previousMonthEnd = new Date(
    now.getFullYear(),
    now.getMonth() - 1,
    Math.min(
      now.getDate(),
      new Date(now.getFullYear(), now.getMonth(), 0).getDate(),
    ) + 1,
  );
  const generationData = {
    today: makeGenerationEntry(
      "Today",
      totalForDateRange(todayStart, tomorrow),
      totalForDateRange(yesterdayStart, todayStart),
      "vs yesterday",
    ),
    "7days": makeGenerationEntry(
      "Last 7 days",
      totalForDateRange(sevenDaysStart, tomorrow),
      totalForDateRange(previousSevenDaysStart, sevenDaysStart),
      "vs previous 7 days",
    ),
    month: makeGenerationEntry(
      "This month",
      totalForDateRange(currentMonthStart, tomorrow),
      totalForDateRange(previousMonthStart, previousMonthEnd),
      "vs previous period",
    ),
  };
  const selectedGeneration = generationData[consumptionRange];
  const generationTrend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(todayStart);
    day.setDate(day.getDate() - 6 + index);
    return generationTotalsByDay.get(getDateKey(day))?.kwh ?? 0;
  });
  const dynamicKwhHarvested = generationData.today.kwh.toFixed(4);

  if (isLoadingDashboardData) {
    return <LoadingScreen label="Loading dashboard..." size="md" />;
  }

  return (
    <ScreenShell
      scroll={false}
      contentPaddingHorizontal={10}
      contentPaddingBottom={0}
      showNoDeviceNotice
    >
      <ScrollView
        ref={(node) => {
          scrollContainerRef.current = node;
        }}
        onScroll={(event) =>
          setScrollOffsetY(event.nativeEvent.contentOffset.y)
        }
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: scale(88) }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={activeOrangeDark}
            colors={[activeOrangeDark]}
          />
        }
      >
        <View style={st.hero}>
          <HeroGlow
            mode={mode}
            gridActive={gridActive}
            intensity={isActive ? 1 : mode === "dark" ? 0.4 : 0.85}
            bleedBottom={scale(76)}
          />
          <TopBar gutter={0} title="Dashboard" glass />
        </View>
        <DashboardStats
          c={c}
          mode={mode}
          usingGrid={usingGrid}
          powerMode={override}
          isActive={isActive}
          isLoading={isLoadingDashboardData}
          isSharedUser={isSharedUser}
          activeAccent={activeAccent}
          activeOrangeDark={activeOrangeDark}
          batteryPct={batteryPct}
          displayVoltage={displayVoltage}
          gridVoltage={gridVoltage}
          gridCurrent={gridCurrent}
          gridPower={gridPower}
          gridEnergyKwh={gridEnergyKwh}
          mqttStatus={mqttStatus}
          batteryCardInk={batteryCardInk}
          batteryCardMutedInk={batteryCardMutedInk}
          statsPop={statsPop}
          graphProgress={graphProgress}
          greeting={greeting}
          metadataName={metadataName}
          consumptionRange={consumptionRange}
          consumptionData={generationData}
          selectedConsumption={selectedGeneration}
          generationTrend={generationTrend}
          setConsumptionRange={setConsumptionRange}
          rangeMenuOpen={rangeMenuOpen}
          setRangeMenuOpen={setRangeMenuOpen}
          stats={stats}
          openOverrides={openOverrides}
        />
        <DashboardActions
          c={c}
          mode={mode}
          usingGrid={usingGrid}
          activeOrange={activeOrange}
          activeOrangeDark={activeOrangeDark}
          activeAccent={activeAccent}
          activeAccentSoft={activeAccentSoft}
          gridActive={gridActive}
          isActive={isActive}
          installedTileCount={installedTileCount}
          tileSetupLoaded={tileSetupLoaded}
          router={router}
          zones={zones}
          onZoneToggle={onZoneToggle}
          activeTile={activeTile}
          setActiveTile={setActiveTile}
          footsteps={footsteps}
          dynamicKwhHarvested={dynamicKwhHarvested}
          accent={accent}
        />
      </ScrollView>
    </ScreenShell>
  );
}
