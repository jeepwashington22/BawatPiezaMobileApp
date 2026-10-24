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
import { CountUpText } from "../../components/count-up-text";

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

const getTodayDateKey = () => {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `bawatpieza_steps_${year}-${month}-${day}`;
};

type GridPalette = {
  gridActive: boolean;
  gridGreen: string;
  gridGreenDark: string;
  batteryCardTrack: string;
  batteryCardFill: string;
  batteryCardInk: string;
};

function useGridPalette(usingGrid: boolean, mode: Mode): GridPalette {
  const gridActive = usingGrid;
  const gridGreen = "#16A34A";
  const gridGreenDark = "#22C55E";
  return {
    gridActive,
    gridGreen,
    gridGreenDark,
    batteryCardTrack: gridActive
      ? "rgba(22,163,74,0.22)"
      : "rgba(245,162,32,0.22)",
    batteryCardFill: gridActive ? "rgba(22,163,74,1)" : BRAND_ORANGE_DARK,
    batteryCardInk: mode === "dark" ? "#FFFFFF" : "#0A2A4A",
  };
}

const HEAT_ROWS = 2;
const HEAT_COLS = 3;
const heatTiles: number[] = Array.from(
  { length: HEAT_ROWS * HEAT_COLS },
  (_, i) => {
    const wave = Math.sin(i / 2.6) * 0.3 + Math.cos(i / 5) * 0.2;
    return Math.min(
      1,
      Math.max(0.06, 0.45 + wave + ((i * 2654435761) % 100) / 500),
    );
  },
);

const HEAT_STOPS: Record<Mode, string[]> = {
  light: ["#8C3B12", "#B94E14", "#D85B1C", BRAND_ORANGE_DARK, BRAND_ORANGE],
  dark: ["#5C250D", "#8C3B12", "#B94E14", "#D85B1C", BRAND_ORANGE_DARK],
};
const HEAT_STOPS_GREEN = [
  "#064E3B",
  "#065F46",
  "#047857",
  "#059669",
  "#10B981",
];

const heatColor = (v: number, mode: Mode, usingGrid: boolean) => {
  const stops = usingGrid ? HEAT_STOPS_GREEN : HEAT_STOPS[mode];
  const idx = Math.min(stops.length - 1, Math.floor(v * stops.length));
  return stops[idx];
};

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

function ZoneSwitch({
  on,
  mode,
  onToggle,
  gridActive = false,
}: {
  on: boolean;
  mode: Mode;
  onToggle: () => void;
  gridActive?: boolean;
}) {
  const anim = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: on ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
    }).start();
  }, [on, anim]);

  const W = scale(54);
  const H = scale(27);
  const K = scale(22);
  const PAD = (H - K) / 2;

  const gridGreen = "#16A34A";
  const onColor = gridActive ? gridGreen : BRAND_ORANGE_DARK;
  const onColorDark = gridActive ? "rgba(34,197,94,1)" : BRAND_ORANGE;

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      mode === "dark" ? "rgba(255,255,255,0.16)" : "rgba(10,42,74,0.14)",
      gridActive ? onColorDark : onColor,
    ],
  });
  const knobX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [PAD, W - K - PAD],
  });

  return (
    <Pressable
      onPress={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
    >
      <Animated.View
        style={{
          width: W,
          height: H,
          borderRadius: H / 2,
          backgroundColor: trackColor,
          justifyContent: "center",
          shadowColor: gridActive ? gridGreen : BRAND_ORANGE_DARK,
          shadowOpacity: on ? 0.45 : 0,
          shadowRadius: scale(8),
          shadowOffset: { width: 0, height: 3 },
          elevation: on ? 4 : 0,
        }}
      >
        <Text
          style={{
            position: "absolute",
            [on ? "left" : "right"]: scale(8),
            color: on
              ? "#FFFFFF"
              : mode === "dark"
                ? "rgba(255,255,255,0.55)"
                : "rgba(10,42,74,0.5)",
            fontSize: scale(7),
            letterSpacing: 0.8,
            fontFamily: fonts.extrabold,
          }}
        >
          {on ? "on" : "off"}
        </Text>
        <Animated.View
          style={{
            width: K,
            height: K,
            borderRadius: K / 2,
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
            transform: [{ translateX: knobX }],
            shadowColor: "#000",
            shadowOpacity: 0.22,
            shadowRadius: 3,
            shadowOffset: { width: 0, height: 1 },
            elevation: 3,
          }}
        >
          <Ionicons
            name="power"
            size={scale(11)}
            color={
              on ? (gridActive ? gridGreen : BRAND_ORANGE_DARK) : "#9AA3B2"
            }
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

export default function HomeScreen() {
  const { colors: c, mode } = useTheme();
  const { ready, isLoggedIn, user } = useAuth();
  const router = useRouter();

  const { override, openOverrides } = usePowerOverride();
  const usingGrid = override !== "battery";

  const activeOrange = usingGrid ? "#16A34A" : BRAND_ORANGE;
  const activeOrangeDark = usingGrid ? "#15803D" : BRAND_ORANGE_DARK;
  const activeAccent = usingGrid ? "#16A34A" : c.orange;
  const activeAccentSoft = usingGrid ? "rgba(22,163,74,0.12)" : c.accentSoft;

  const {
    checked,
    completed,
    welcomeSeen,
    openWelcome,
    scrollContainerRef,
    setScrollOffsetY,
  } = useAppTour();
  const accent = (alpha = 1) => brandAccent(mode, alpha);
  const { gridActive, batteryCardInk, batteryCardFill } = useGridPalette(
    usingGrid,
    mode,
  );

  const [batteryPct, setBatteryPct] = useState<number | null>(null);
  const [livePower, setLivePower] = useState<number | null>(null);
  const [displayVoltage, setDisplayVoltage] = useState<string>("--");
  const [footsteps, setFootsteps] = useState<number>(0);
  const [mqttStatus, setMqttStatus] = useState<
    "Connecting..." | "Live" | "Offline"
  >("Connecting...");
  const [refreshing, setRefreshing] = useState(false);
  const mqttClientRef = useRef<Paho.Client | null>(null);

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
      ? "good morning"
      : currentHour < 18
        ? "good afternoon"
        : "good evening";
  const metadataName =
    typeof user?.user_metadata?.firstname === "string"
      ? user.user_metadata.firstname
      : typeof user?.user_metadata?.first_name === "string"
        ? user.user_metadata.first_name
        : typeof user?.user_metadata?.full_name === "string"
          ? user.user_metadata.full_name.split(" ")[0]
          : "";

  useEffect(() => {
    const loadTodaySteps = async () => {
      try {
        const todayKey = getTodayDateKey();
        const storedTodaySteps = await AsyncStorage.getItem(todayKey);

        if (storedTodaySteps !== null) {
          setFootsteps(Number(storedTodaySteps));
        } else {
          setFootsteps(0);
          await AsyncStorage.setItem(todayKey, "0");
        }
      } catch (error) {
        console.error("failed to load today's footstep count", error);
      }
    };
    loadTodaySteps();
  }, []);

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

      if (user?.id) {
        try {
          await supabase.from("device_pairings").upsert({
            hub_id: hubId,
            user_id: user.id,
            last_connected: new Date().toISOString(),
          });
        } catch (dbErr) {
          console.log("could not save pairing to cloud:", dbErr);
        }
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
          const data = JSON.parse(message.payloadString);

          if (data.bat_pct !== undefined) setBatteryPct(Number(data.bat_pct));
          if (data.bat_v !== undefined)
            setDisplayVoltage(Number(data.bat_v).toFixed(2));
          else if (data.dyn_v !== undefined)
            setDisplayVoltage(Number(data.dyn_v).toFixed(2));

          if (data.dyn_w !== undefined)
            setLivePower(Math.round(Number(data.dyn_w)));
          else if (data.bat_w !== undefined)
            setLivePower(Math.round(Number(data.bat_w)));

          // DIRECT 1:1 STATE SYNC (charger_on = true means Appliance ON)
          if (data.charger_on !== undefined) {
            const isApplianceOn = Boolean(data.charger_on);
            setZones((zs) =>
              zs.map((z) => (z.id === "1" ? { ...z, on: isApplianceOn } : z)),
            );
          }

          if (data.event === "footstep") {
            const todayKey = getTodayDateKey();
            setFootsteps((prev) => {
              const nextCount = prev + 1;
              AsyncStorage.setItem(todayKey, nextCount.toString()).catch(
                () => {},
              );
              return nextCount;
            });
          }
        } catch (error) {}
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
  }, [user]);

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
  const [activeTile, setActiveTile] = useState<number | null>(null);

  const isActive = true;

  const stats = [
    { label: "voltage", value: Number(displayVoltage), decimals: 2, unit: "V" },
    {
      label: "power",
      value: livePower ?? 0,
      unit: "W",
    },
    {
      label: "footsteps",
      value: footsteps.toLocaleString(),
      unit: "steps",
    },
  ];

  const consumptionData = {
    today: {
      label: "today",
      kwh: 4.82,
      comparison: "5.36 kwh yesterday",
      delta: "-10.1%",
      savings: "≈ ₱86 saved off meralco billing",
      deltaLabel: "vs yesterday",
    },
    "7days": {
      label: "last 7 days",
      kwh: 31.64,
      comparison: "34.20 kwh previous 7 days",
      delta: "-7.5%",
      savings: "≈ ₱566 saved off meralco billing",
      deltaLabel: "vs previous 7 days",
    },
    month: {
      label: "this month",
      kwh: 128.45,
      comparison: "141.80 kwh previous month",
      delta: "-9.4%",
      savings: "≈ ₱2,298 saved off meralco billing",
      deltaLabel: "vs previous month",
    },
  } as const;
  const selectedConsumption = consumptionData[consumptionRange];

  const dynamicKwhHarvested = (footsteps * 0.0002725).toFixed(2);

  return (
    <ScreenShell
      scroll={false}
      contentPaddingHorizontal={8}
      contentPaddingBottom={0}
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

          <View style={st.heroTopBar}>
            <TopBar gutter={0} title="dashboard" />
          </View>
        </View>

        <EnterView delay={90} style={st.statsSection}>
          <View style={st.greetingRow}>
            <View style={st.greeting}>
              <Text style={[st.greetingEyebrow, { color: c.muted }]}>
                welcome back
              </Text>
              <Text style={[st.greetingTitle, { color: c.text }]}>
                {greeting}, {metadataName || "there"}
              </Text>
            </View>
            <View style={st.statsFilterWrap}>
              <Pressable
                onPress={() => setRangeMenuOpen((open) => !open)}
                style={[
                  st.statsFilterButton,
                  { backgroundColor: c.surface, borderColor: c.line },
                ]}
                accessibilityRole="button"
                accessibilityLabel={`consumption date range: ${selectedConsumption.label}`}
              >
                <Ionicons
                  name="calendar-outline"
                  size={scale(11)}
                  color={activeAccent}
                />
                <Text style={[st.statsFilterButtonText, { color: c.text }]}>
                  {selectedConsumption.label}
                </Text>
                <Ionicons
                  name={rangeMenuOpen ? "chevron-up" : "chevron-down"}
                  size={scale(10)}
                  color={c.muted}
                />
              </Pressable>
              {rangeMenuOpen && (
                <View
                  style={[
                    st.statsFilterMenu,
                    { backgroundColor: c.surface, borderColor: c.line },
                  ]}
                >
                  {(
                    Object.keys(consumptionData) as Array<
                      keyof typeof consumptionData
                    >
                  ).map((range) => (
                    <Pressable
                      key={range}
                      onPress={() => {
                        setConsumptionRange(range);
                        setRangeMenuOpen(false);
                      }}
                      style={st.rangeOption}
                    >
                      <Text
                        style={[
                          st.rangeOptionText,
                          {
                            color:
                              range === consumptionRange
                                ? activeAccent
                                : c.muted,
                          },
                        ]}
                      >
                        {consumptionData[range].label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
          </View>
          <TourSpot id="live-stats">
            <Animated.View
              style={[
                st.statsPop,
                {
                  opacity: statsPop,
                  transform: [
                    {
                      scale: statsPop.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.94, 1],
                      }),
                    },
                  ],
                },
              ]}
            >
              <LinearGradient
                colors={
                  isActive
                    ? usingGrid
                      ? ["#22C55E", "#15803D"]
                      : ["#F5A220", "#E6641F"]
                    : ["#475569", "#64748B", "#94A3B8"]
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={st.scCard}
              >
                <View style={st.scTop}>
                  <View style={st.scTopData}>
                    <Text style={st.scEyebrow}>
                      {selectedConsumption.label}&apos;s consumption
                    </Text>
                    <View style={st.scKwhRow}>
                      <Text style={st.scKwh}>
                        {isActive ? selectedConsumption.kwh.toFixed(2) : "--"}
                      </Text>
                      <Text style={st.scKwhUnit}>kWh</Text>
                    </View>
                    <View style={[st.scSavings, !isActive && { opacity: 0.5 }]}>
                      <Ionicons
                        name="trending-down"
                        size={scale(11)}
                        color="#FFFFFF"
                      />
                      <Text
                        style={[
                          st.scSavingsText,
                          usingGrid && { color: "#15803D" },
                        ]}
                      >
                        {isActive ? selectedConsumption.savings : "-- savings"}
                      </Text>
                    </View>
                  </View>
                  <View style={[st.scDelta, !isActive && { opacity: 0.5 }]}>
                    <Ionicons
                      name={usingGrid ? "battery-charging" : "trending-down"}
                      size={scale(14)}
                      color="#FFFFFF"
                    />
                    <View>
                      <Text style={st.scDeltaValue}>
                        {usingGrid
                          ? batteryPct !== null
                            ? `${Math.floor(batteryPct)}%`
                            : "--%"
                          : selectedConsumption.delta}
                      </Text>
                      <Text style={st.scDeltaLabel}>
                        {usingGrid
                          ? "battery health"
                          : selectedConsumption.deltaLabel}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={st.scTiles}>
                  {stats.map((s, i) => {
                    const icon = (
                      {
                        voltage: "flash",
                        power: "speedometer",
                        footsteps: "footsteps",
                      } as const
                    )[s.label as "voltage" | "power" | "footsteps"];
                    return (
                      <View
                        key={s.label}
                        style={[st.scTile, i > 0 && st.scTileDivider]}
                      >
                        <View style={st.scTileIcon}>
                          <Ionicons
                            name={icon}
                            size={scale(17)}
                            color={activeOrangeDark}
                          />
                        </View>
                        <View style={st.scTileValueRow}>
                          <Text style={st.scTileValue} numberOfLines={1}>
                            {s.value}
                          </Text>
                          <Text style={st.scTileUnit}>{s.unit}</Text>
                        </View>
                        <Text style={st.scTileLabel}>{s.label}</Text>
                      </View>
                    );
                  })}
                </View>
              </LinearGradient>
            </Animated.View>
          </TourSpot>
        </EnterView>

        <TourSpot id="battery">
          <EnterView delay={120} style={st.dashboardCard}>
            <Pressable
              onPress={openOverrides}
              accessibilityRole="button"
              accessibilityLabel="battery percentage — open quick overrides"
              style={({ pressed }) => [
                pressed && { opacity: 0.96, transform: [{ scale: 0.995 }] },
              ]}
            >
              <Glass
                mode={mode}
                style={[
                  st.batteryCard,
                  { borderColor: c.orange },
                  usingGrid && {
                    borderColor: "#16A34A",
                    shadowColor: "#16A34A",
                    shadowOpacity: 0.18,
                  },
                ]}
              >
                <View
                  pointerEvents="none"
                  style={[
                    st.batteryCardAccent,
                    { backgroundColor: usingGrid ? "#22C55E" : c.orange },
                  ]}
                />
                <View style={st.batteryCardHeader}>
                  <View style={st.batteryCardIdentity}>
                    <View
                      style={[
                        st.batteryCardIcon,
                        {
                          backgroundColor: usingGrid
                            ? "rgba(22,163,74,0.14)"
                            : mode === "dark"
                              ? "rgba(245,162,32,0.18)"
                              : "rgba(245,162,32,0.12)",
                        },
                      ]}
                    >
                      <Ionicons
                        name={usingGrid ? "flash" : "battery-charging"}
                        size={scale(21)}
                        color={usingGrid ? "#16A34A" : batteryCardInk}
                      />
                    </View>
                    <View>
                      <Text
                        style={[
                          st.batteryCardEyebrow,
                          {
                            color: usingGrid ? "#16A34A" : batteryCardMutedInk,
                          },
                        ]}
                      >
                        {usingGrid
                          ? "currently using grid"
                          : "currently using battery"}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: scale(4),
                          marginTop: scale(2),
                        }}
                      >
                        <LiveDot
                          color={
                            mqttStatus === "Live"
                              ? "#22C55E"
                              : BRAND_ORANGE_DARK
                          }
                        />
                        <Text
                          style={{
                            fontSize: scale(8),
                            fontFamily: fonts.medium,
                            color: c.muted,
                          }}
                        >
                          {mqttStatus === "Live"
                            ? "hardware online"
                            : `status: ${mqttStatus}`}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {!usingGrid && (
                    <View style={st.batteryCardIndicator}>
                      <Text
                        style={[
                          st.batteryCardLevelLabel,
                          { color: activeAccent },
                        ]}
                      >
                        charge level
                      </Text>
                      <View style={st.batteryCardValueRow}>
                        <Text
                          style={[
                            st.batteryCardValue,
                            { color: batteryCardInk },
                          ]}
                        >
                          {batteryPct !== null ? Math.floor(batteryPct) : "--"}
                        </Text>
                        <Text
                          style={[
                            st.batteryCardUnit,
                            { color: batteryCardInk },
                          ]}
                        >
                          %
                        </Text>
                      </View>
                      <View
                        style={[
                          st.batteryCardTrack,
                          { backgroundColor: "rgba(245,162,32,0.22)" },
                        ]}
                      >
                        <View
                          style={[
                            st.batteryCardFill,
                            {
                              width: `${batteryPct !== null ? Math.min(100, Math.max(0, batteryPct)) : 0}%`,
                              backgroundColor: activeAccent,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  )}
                </View>
                {usingGrid && (
                  <View style={st.batteryGridBanner}>
                    <Ionicons name="flash" size={scale(12)} color="#FFFFFF" />
                    <Text style={st.batteryGridBannerText}>
                      using grid — battery on standby
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={scale(12)}
                      color="#FFFFFF"
                    />
                  </View>
                )}
                <Text
                  style={[
                    st.batteryCardDescription,
                    { color: usingGrid ? c.muted : batteryCardMutedInk },
                  ]}
                >
                  {usingGrid
                    ? "normally open logic: grid is active by default. tap to change."
                    : batteryPct !== null
                      ? `live telemetry: 4s lifepo4 bank detected at ${batteryPct.toFixed(1)}% (${displayVoltage}v)`
                      : "awaiting hardware telemetry to detect battery..."}
                </Text>
                {!usingGrid && (
                  <View style={st.batteryCardTapHint}>
                    <Text
                      style={[
                        st.batteryCardTapText,
                        { color: batteryCardMutedInk },
                      ]}
                    >
                      tap to open quick overrides
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={scale(11)}
                      color={batteryCardMutedInk}
                    />
                  </View>
                )}
              </Glass>
            </Pressable>
          </EnterView>
        </TourSpot>

        <EnterView delay={180} style={st.dashboardCard}>
          <View style={st.sectionTitleRow}>
            <Ionicons name="analytics" size={scale(15)} color={activeAccent} />
            <Text style={[st.sectionTitle, { color: c.text }]}>
              energy consumption
            </Text>
          </View>
          <Card
            mode={mode}
            style={[
              st.balanceChartCard,
              {
                backgroundColor: mode === "dark" ? "#101010" : c.surface,
                borderColor: c.line,
                shadowColor: activeAccent,
              },
            ]}
          >
            <View style={st.balanceChartHeader}>
              <View>
                <Text style={[st.balanceChartEyebrow, { color: c.muted }]}>
                  energy balance
                </Text>
                <View style={st.balanceChartValueRow}>
                  <CountUpText
                    value={4.82}
                    decimals={2}
                    style={[st.balanceChartValue, { color: c.text }]}
                  />
                  <Text style={[st.balanceChartValue, { color: c.text }]}>
                    kWh
                  </Text>
                </View>
                <Text style={[st.balanceChartPeriod, { color: c.muted }]}>
                  today&apos;s consumption
                </Text>
              </View>
              <View
                style={[
                  st.balanceChartChange,
                  {
                    backgroundColor: usingGrid
                      ? "rgba(22,163,74,0.12)"
                      : c.accentSoft,
                  },
                ]}
              >
                <Ionicons
                  name="trending-down"
                  size={scale(11)}
                  color={activeAccent}
                />
                <Text
                  style={[st.balanceChartChangeText, { color: activeAccent }]}
                >
                  10.1%
                </Text>
              </View>
            </View>
            <View style={st.balanceGraph}>
              <Svg viewBox="0 0 320 88" width="100%" height="100%">
                <Defs>
                  <SvgGradient id="balanceArea" x1="0" y1="0" x2="0" y2="1">
                    <Stop
                      offset="0"
                      stopColor={activeAccent}
                      stopOpacity="0.38"
                    />
                    <Stop offset="1" stopColor={activeAccent} stopOpacity="0" />
                  </SvgGradient>
                </Defs>
                <Line
                  x1="0"
                  y1="78"
                  x2="320"
                  y2="78"
                  stroke={c.line}
                  strokeWidth="1"
                />
                <Path
                  d="M0 58 C25 51 38 50 57 46 S83 43 98 34 S118 55 137 42 S159 38 177 29 S197 35 213 25 S235 29 249 16 S270 20 286 6 S305 11 320 2 L320 78 L0 78 Z"
                  fill="url(#balanceArea)"
                />
                <AnimatedPath
                  d="M0 58 C25 51 38 50 57 46 S83 43 98 34 S118 55 137 42 S159 38 177 29 S197 35 213 25 S235 29 249 16 S270 20 286 6 S305 11 320 2"
                  fill="none"
                  stroke={activeAccent}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeDasharray="430"
                  strokeDashoffset={graphProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [430, 0],
                  })}
                />
              </Svg>
              <View style={st.balanceChartLabels}>
                <Text
                  style={[
                    st.balanceChartLabel,
                    st.balanceChartLabelStart,
                    { color: activeAccent },
                  ]}
                >
                  6 am
                </Text>
                <Text style={[st.balanceChartLabel, { color: activeAccent }]}>
                  12 pm
                </Text>
                <Text style={[st.balanceChartLabel, { color: activeAccent }]}>
                  6 pm
                </Text>
                <Text
                  style={[
                    st.balanceChartLabel,
                    st.balanceChartLabelEnd,
                    { color: activeAccent },
                  ]}
                >
                  now
                </Text>
              </View>
            </View>
          </Card>
        </EnterView>

        <View style={st.quickActionsSection}>
          <Text style={[st.quickActionsTitle, { color: c.text }]}>
            quick actions
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={st.quickActions}
          >
            {[
              {
                label: "heatmap",
                icon: "map-outline" as const,
                href: "/pages/heatmap",
              },
              {
                label: "my zones",
                icon: "layers-outline" as const,
                href: "/pages/zones/1",
              },
              {
                label: "shared",
                icon: "people-outline" as const,
                href: "/pages/accounts",
              },
              {
                label: "device",
                icon: "hardware-chip-outline" as const,
                href: "/pages/device",
              },
              {
                label: "thresholds",
                icon: "options-outline" as const,
                href: "/pages/thresholds",
              },
            ].map((action) => (
              <Pressable
                key={action.label}
                accessibilityRole="button"
                accessibilityLabel={action.label}
                onPress={() => router.push(action.href as Href)}
                style={({ pressed }) => [
                  st.quickAction,
                  {
                    backgroundColor:
                      mode === "dark"
                        ? "rgba(255,255,255,0.06)"
                        : "rgba(255,255,255,0.72)",
                    borderColor: usingGrid
                      ? "rgba(22,163,74,0.16)"
                      : "rgba(230,100,31,0.16)",
                  },
                  pressed && st.quickActionPressed,
                ]}
              >
                <View
                  style={[
                    st.quickActionIcon,
                    {
                      backgroundColor:
                        mode === "dark"
                          ? usingGrid
                            ? "rgba(22,163,74,0.18)"
                            : "rgba(245,162,32,0.18)"
                          : usingGrid
                            ? "rgba(22,163,74,0.12)"
                            : "rgba(245,162,32,0.12)",
                    },
                  ]}
                >
                  <Ionicons
                    name={action.icon}
                    size={scale(16)}
                    color={activeAccent}
                  />
                </View>
                <Text
                  style={[st.quickActionLabel, { color: c.text }]}
                  numberOfLines={1}
                >
                  {action.label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <EnterView delay={270} style={st.zonesSection}>
          <TourSpot id="zones">
            <View
              pointerEvents={isActive ? "auto" : "none"}
              style={[!isActive && { opacity: 0.6 }]}
            >
              <View style={st.zonesHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.zonesTitle, { color: c.text }]}>
                    my zones
                  </Text>
                  <View style={st.zonesSubRow}>
                    <View
                      style={[
                        st.zonesLiveDot,
                        !isActive && { backgroundColor: c.muted },
                      ]}
                    />
                    <Text style={[st.zonesSubText, { color: c.muted }]}>
                      {isActive ? zones.filter((zone) => zone.on).length : 0} of{" "}
                      {zones.length} active · {isActive ? "online" : "standby"}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => router.push("/pages/schedule")}
                  style={[
                    st.manageButton,
                    {
                      backgroundColor:
                        mode === "dark"
                          ? "rgba(255,255,255,0.08)"
                          : usingGrid
                            ? "rgba(22,163,74,0.12)"
                            : "rgba(245,162,32,0.12)",
                    },
                  ]}
                >
                  <Text
                    style={[
                      st.manageText,
                      {
                        color:
                          mode === "dark" ? activeOrange : activeOrangeDark,
                      },
                    ]}
                  >
                    manage
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={scale(13)}
                    color={mode === "dark" ? activeOrange : activeOrangeDark}
                  />
                </Pressable>
              </View>
              {zones.length === 0 && (
                <Text style={[st.zoneEmpty, { color: c.muted }]}>
                  no zones yet
                </Text>
              )}
              <View style={st.devicesList}>
                {zones.map((z) => {
                  const live = isActive && z.on;
                  const src = SOURCE_META[z.source] ?? SOURCE_META.Battery;
                  return (
                    <View
                      key={z.id}
                      style={[
                        st.zoneRow,
                        {
                          backgroundColor: "#FFFFFF",
                          borderColor: live
                            ? activeOrangeDark
                            : usingGrid
                              ? "rgba(22,163,74,0.3)"
                              : "rgba(230,100,31,0.3)",
                        },
                      ]}
                    >
                      <LinearGradient
                        colors={
                          live
                            ? usingGrid
                              ? ["rgba(22,163,74,0.14)", "rgba(22,163,74,0.02)"]
                              : [
                                  "rgba(245,162,32,0.14)",
                                  "rgba(245,162,32,0.02)",
                                ]
                            : ["rgba(148,163,184,0.06)", "rgba(148,163,184,0)"]
                        }
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        pointerEvents="none"
                        style={st.zoneCardGlow}
                      />

                      <Pressable
                        onPress={() =>
                          router.push(
                            `/pages/zones/${z.id}?name=${encodeURIComponent(z.name)}&source=${encodeURIComponent(z.source)}&detail=${encodeURIComponent(z.detail)}&on=${z.on}` as Href,
                          )
                        }
                        style={({ pressed }) => [
                          {
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: scale(10),
                          },
                          pressed && { opacity: 0.6 },
                        ]}
                      >
                        {live ? (
                          <LinearGradient
                            colors={
                              usingGrid
                                ? ["#22C55E", "#15803D"]
                                : [BRAND_ORANGE, BRAND_ORANGE_DARK]
                            }
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={st.zoneIconChip}
                          >
                            <Ionicons
                              name="bulb"
                              size={scale(16)}
                              color="#FFFFFF"
                            />
                          </LinearGradient>
                        ) : (
                          <View
                            style={[
                              st.zoneIconChip,
                              {
                                backgroundColor:
                                  mode === "dark"
                                    ? "rgba(255,255,255,0.08)"
                                    : "rgba(10,42,74,0.06)",
                              },
                            ]}
                          >
                            <Ionicons
                              name="bulb-outline"
                              size={scale(16)}
                              color={c.muted}
                            />
                          </View>
                        )}

                        <View style={st.zoneInfo}>
                          <Text
                            style={[st.zoneName, { color: "#0A2A4A" }]}
                            numberOfLines={1}
                          >
                            {z.name}
                          </Text>
                          <View style={st.zoneSubRow}>
                            <View
                              style={[
                                st.zoneSourceChip,
                                { backgroundColor: src.tint },
                              ]}
                            >
                              <Ionicons
                                name={src.icon}
                                size={scale(9)}
                                color={src.color}
                              />
                              <Text
                                style={[
                                  st.zoneSourceText,
                                  { color: src.color },
                                ]}
                              >
                                {z.source}
                              </Text>
                            </View>
                            <Text
                              style={[
                                st.zoneDetail,
                                { color: "rgba(10,42,74,0.62)" },
                              ]}
                              numberOfLines={1}
                            >
                              {z.detail}
                            </Text>
                            <View style={st.zoneState}>
                              <View
                                style={[
                                  st.zoneStateDot,
                                  {
                                    backgroundColor: live
                                      ? activeOrangeDark
                                      : c.muted,
                                  },
                                ]}
                              />
                              <Text
                                style={[
                                  st.zoneStateText,
                                  { color: live ? activeOrangeDark : c.muted },
                                ]}
                              >
                                {live ? "live" : "standby"}
                              </Text>
                            </View>
                          </View>
                        </View>

                        <View style={st.zoneTrailing}>
                          <ZoneSwitch
                            on={live}
                            mode={mode}
                            onToggle={async () => {
                              const nextState = !z.on;
                              setZones((zs) =>
                                zs.map((x) =>
                                  x.id === z.id ? { ...x, on: nextState } : x,
                                ),
                              );

                              if (
                                mqttClientRef.current &&
                                mqttClientRef.current.isConnected()
                              ) {
                                const hubId =
                                  await AsyncStorage.getItem(
                                    "bawatpieza_hub_id",
                                  );
                                if (hubId) {
                                  // DIRECT MAPPING: App ON -> sends 'charger_on' (Energizes Relay Coil -> Closes NO Contact)
                                  const commandPayload = JSON.stringify({
                                    command: nextState
                                      ? "charger_on"
                                      : "charger_off",
                                  });
                                  const message = new Paho.Message(
                                    commandPayload,
                                  );
                                  message.destinationName = `bawatpieza/devices/${hubId}/commands`;
                                  mqttClientRef.current.send(message);
                                }
                              }
                            }}
                            gridActive={gridActive}
                          />
                        </View>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          </TourSpot>
        </EnterView>

        <TourSpot id="heatmap">
          <EnterView delay={450}>
            <SectionHead
              title="most walked-on tiles"
              link="full heatmap"
              onLink={() => router.push("/pages/heatmap")}
              mode={mode}
              accentColor={activeOrangeDark}
            />
            <Card
              mode={mode}
              style={{ borderRadius: scale(18), padding: scale(14) }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: c.text,
                      fontSize: scale(12.5),
                      fontFamily: fonts.extrabold,
                    }}
                  >
                    gate pathway · live tile heat
                  </Text>
                  <Text
                    style={{
                      color:
                        mode === "dark"
                          ? "rgba(255,255,255,0.55)"
                          : "rgba(10,42,74,0.5)",
                      fontSize: scale(9.5),
                      fontFamily: fonts.medium,
                      marginTop: 1,
                    }}
                  >
                    {mode === "dark"
                      ? "brighter white = more foot traffic"
                      : "brighter green = more foot traffic"}
                  </Text>
                </View>
                <View
                  style={[
                    st.stepsPill,
                    isActive
                      ? {
                          backgroundColor: activeAccentSoft,
                          borderColor: usingGrid
                            ? "rgba(22,163,74,0.4)"
                            : accent(0.4),
                        }
                      : {
                          backgroundColor: "rgba(150,150,150,0.12)",
                          borderColor: "rgba(150,150,150,0.3)",
                        },
                  ]}
                >
                  <Ionicons
                    name="footsteps"
                    size={scale(13)}
                    color={
                      isActive ? (mode === "dark" ? "#FFFFFF" : NAVY) : c.muted
                    }
                  />
                  <Text
                    style={[
                      st.stepsPillText,
                      { color: isActive ? c.text : c.muted },
                    ]}
                  >
                    {footsteps.toLocaleString()}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  st.kineticRow,
                  isActive
                    ? {
                        borderColor: usingGrid
                          ? "rgba(22,163,74,0.35)"
                          : accent(0.35),
                        backgroundColor: usingGrid
                          ? "rgba(22,163,74,0.1)"
                          : accent(0.1),
                      }
                    : {
                        borderColor: "rgba(150,150,150,0.25)",
                        backgroundColor: "rgba(150,150,150,0.08)",
                      },
                ]}
              >
                <Ionicons
                  name="footsteps"
                  size={scale(14)}
                  color={
                    isActive
                      ? mode === "dark"
                        ? "#FFFFFF"
                        : usingGrid
                          ? "#16A34A"
                          : "#B4771B"
                      : c.muted
                  }
                />
                <Text
                  style={[
                    st.kineticText,
                    {
                      color:
                        mode === "dark"
                          ? "rgba(255,255,255,0.75)"
                          : "rgba(10,42,74,0.7)",
                    },
                  ]}
                >
                  footsteps converted today
                </Text>
                <Text
                  style={{
                    color: isActive
                      ? mode === "dark"
                        ? "#FFFFFF"
                        : "#4CA83E"
                      : c.muted,
                    fontSize: scale(11),
                    fontFamily: fonts.extrabold,
                  }}
                >
                  {isActive ? `+${dynamicKwhHarvested} kWh` : "-- kWh"}
                </Text>
              </View>

              <View
                style={[
                  st.heatGrid,
                  {
                    backgroundColor: usingGrid ? "#F0FDF4" : "#FFF8ED",
                  },
                ]}
              >
                {Array.from({ length: HEAT_ROWS }, (_, r) => (
                  <View key={r} style={st.heatRow}>
                    {Array.from({ length: HEAT_COLS }, (_, col) => {
                      const i = r * HEAT_COLS + col;
                      const v = isActive ? heatTiles[i] : 0.05;
                      const active = activeTile === i;
                      return (
                        <Pressable
                          key={col}
                          onPress={() => {
                            if (isActive) setActiveTile(active ? null : i);
                          }}
                          style={[
                            st.heatTile,
                            {
                              backgroundColor: heatColor(v, mode, usingGrid),
                              shadowColor: activeOrangeDark,
                              shadowOpacity: isActive ? v * 0.9 : 0,
                              shadowRadius: scale(9),
                              borderWidth: 1,
                              borderColor:
                                active && isActive
                                  ? activeOrange
                                  : usingGrid
                                    ? "rgba(22,163,74,0.3)"
                                    : "rgba(230,100,31,0.3)",
                            },
                            active &&
                              isActive && [
                                st.heatTileActive,
                                {
                                  borderColor: activeOrange,
                                },
                              ],
                          ]}
                        >
                          <View
                            pointerEvents="none"
                            style={[
                              st.heatTileDepth,
                              {
                                backgroundColor:
                                  v > 0.75
                                    ? activeOrangeDark
                                    : usingGrid
                                      ? "#064E3B"
                                      : "#8C3B12",
                              },
                            ]}
                          />
                          <LinearGradient
                            pointerEvents="none"
                            colors={[
                              "rgba(255,255,255,0.34)",
                              "rgba(255,255,255,0.08)",
                              usingGrid
                                ? "rgba(6,78,59,0.24)"
                                : "rgba(122,54,12,0.24)",
                            ]}
                            locations={[0, 0.34, 1]}
                            style={StyleSheet.absoluteFill}
                          />
                          <View
                            pointerEvents="none"
                            style={st.heatTileHighlight}
                          />
                          <View
                            pointerEvents="none"
                            style={st.heatTileDiagonal}
                          />
                          <View
                            pointerEvents="none"
                            style={st.heatTileBevelTop}
                          />
                          <View
                            pointerEvents="none"
                            style={st.heatTileBevelBottom}
                          />
                          {active && isActive && (
                            <Ionicons
                              name="footsteps"
                              size={scale(11)}
                              color="#FFFFFF"
                            />
                          )}
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: scale(6),
                  marginTop: scale(10),
                }}
              >
                <Text
                  style={[
                    st.legendText,
                    {
                      color:
                        mode === "dark"
                          ? "rgba(255,255,255,0.5)"
                          : "rgba(10,42,74,0.5)",
                    },
                  ]}
                >
                  less
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    gap: scale(3),
                    opacity: isActive ? 1 : 0.4,
                  }}
                >
                  {[0.1, 0.35, 0.6, 0.82, 0.98].map((v, i) => (
                    <View
                      key={i}
                      style={[
                        st.legendSwatch,
                        { backgroundColor: heatColor(v, mode, usingGrid) },
                      ]}
                    />
                  ))}
                </View>
                <Text
                  style={[
                    st.legendText,
                    {
                      color:
                        mode === "dark"
                          ? "rgba(255,255,255,0.5)"
                          : "rgba(10,42,74,0.5)",
                    },
                  ]}
                >
                  more
                </Text>
              </View>

              {activeTile !== null && isActive && (
                <Text
                  style={[
                    st.tileInfo,
                    {
                      color:
                        mode === "dark"
                          ? "rgba(255,255,255,0.7)"
                          : "rgba(10,42,74,0.65)",
                    },
                  ]}
                >
                  tile #{activeTile + 1} —{" "}
                  {Math.round(heatTiles[activeTile] * 480)} crossings today
                </Text>
              )}
            </Card>
          </EnterView>
        </TourSpot>
      </ScrollView>
    </ScreenShell>
  );
}

const st = StyleSheet.create({
  hero: {
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingBottom: scale(8),
    position: "relative",
    zIndex: 10,
  },
  heroTopBar: { zIndex: 5 },
  statsSection: { marginTop: scale(2), zIndex: 2 },
  statsPop: {},
  greetingRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    marginBottom: scale(7),
    paddingHorizontal: scale(2),
    zIndex: 10,
  },
  greeting: { flex: 1, marginRight: scale(8) },
  greetingEyebrow: {
    fontSize: scale(7),
    letterSpacing: 1.2,
    fontFamily: fonts.extrabold,
  },
  demoBtnText: {
    color: "#FFFFFF",
    fontSize: scale(10.5),
    fontFamily: fonts.bold,
  },
  energyCard: {
    position: "relative",
    overflow: "hidden",
    borderBottomLeftRadius: scale(24),
    borderBottomRightRadius: scale(24),
    paddingHorizontal: scale(22),
    paddingTop: scale(16),
    paddingBottom: scale(16),
    shadowColor: "rgba(10,42,74,0.35)",
    shadowOpacity: 0.4,
    shadowRadius: scale(14),
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  energyTrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: scale(3),
    backgroundColor: GOLD,
    opacity: 0.85,
  },
  luxDot: {
    width: scale(7),
    height: scale(7),
    borderRadius: 99,
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 1,
    shadowRadius: scale(4),
  },
  energyBolt: { position: "absolute", right: scale(12), top: scale(16) },
  healthHeader: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  healthHeading: { alignItems: "center" },
  healthKicker: {
    color: "rgba(255,255,255,0.72)",
    fontSize: scale(8),
    letterSpacing: 1.8,
    fontFamily: fonts.extrabold,
  },
  greetingTitle: {
    fontSize: scale(17),
    lineHeight: scale(22),
    marginTop: scale(1),
    fontFamily: fonts.extrabold,
  },
  kwhUnit: {
    color: BRAND_ORANGE_DARK,
    fontSize: scale(12),
    fontFamily: fonts.extrabold,
  },
  comparisonPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: "rgba(230,100,31,0.24)",
    backgroundColor: "rgba(245,162,32,0.10)",
    paddingHorizontal: scale(9),
    paddingVertical: scale(7),
  },
  comparisonValue: {
    color: BRAND_ORANGE_DARK,
    fontSize: scale(11),
    fontFamily: fonts.extrabold,
  },
  comparisonLabel: {
    color: BRAND_ORANGE_DARK,
    fontSize: scale(7.5),
    marginTop: scale(1),
    fontFamily: fonts.bold,
  },
  comparisonTrack: {
    height: scale(5),
    borderRadius: 99,
    overflow: "hidden",
    backgroundColor: "rgba(245,162,32,0.12)",
    marginTop: scale(11),
  },
  comparisonFill: {
    width: "90%",
    height: "100%",
    borderRadius: 99,
    backgroundColor: BRAND_ORANGE_DARK,
  },
  comparisonDetail: {
    fontSize: scale(8.5),
    marginTop: scale(5),
    fontFamily: fonts.medium,
  },
  statsDivider: {
    height: 1,
    backgroundColor: "rgba(230,100,31,0.16)",
    marginVertical: scale(11),
  },
  scCard: {
    borderRadius: scale(12),
    padding: scale(8),
    overflow: "visible",
    shadowColor: BRAND_ORANGE_DARK,
    shadowOpacity: 0.32,
    shadowRadius: scale(16),
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  scTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  scTopData: { paddingLeft: scale(6) },
  statsFilterWrap: { position: "relative", zIndex: 9 },
  statsFilterTouch: {
    minHeight: scale(48),
    justifyContent: "center",
  },
  statsFilterButton: {
    height: scale(36),
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
    borderRadius: scale(8),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    backgroundColor: "rgba(255,255,255,0.16)",
    paddingHorizontal: scale(8),
    paddingVertical: scale(4),
  },
  statsFilterButtonText: {
    color: "#FFFFFF",
    fontSize: scale(10),
    fontFamily: fonts.bold,
  },
  statsFilterMenu: {
    position: "absolute",
    top: scale(26),
    right: 0,
    width: scale(105),
    borderRadius: scale(9),
    paddingVertical: scale(3),
    borderWidth: 1,
    shadowColor: "#000000",
    shadowOpacity: 0.2,
    shadowRadius: scale(8),
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  rangeOption: { paddingHorizontal: scale(8), paddingVertical: scale(7) },
  rangeOptionText: {
    color: "#5B6A94",
    fontSize: scale(10),
    fontFamily: fonts.semibold,
  },
  rangeOptionSelected: {
    color: BRAND_ORANGE_DARK,
    fontFamily: fonts.extrabold,
  },
  scEyebrow: {
    color: "rgba(255,255,255,0.92)",
    fontSize: scale(9),
    letterSpacing: 0.2,
    fontFamily: fonts.bold,
  },
  scKwhRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: scale(3),
    marginTop: scale(1),
  },
  scKwh: {
    color: "#FFFFFF",
    fontSize: scale(23),
    lineHeight: scale(27),
    letterSpacing: -0.7,
    fontFamily: fonts.extrabold,
  },
  scKwhUnit: {
    color: "rgba(255,255,255,0.95)",
    fontSize: scale(10),
    fontFamily: fonts.extrabold,
  },
  scSavings: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(3),
    alignSelf: "flex-start",
    marginTop: scale(1),
    paddingHorizontal: scale(8),
    paddingVertical: scale(2),
    borderRadius: scale(8),
    backgroundColor: "#FFFFFF",
  },
  scSavingsText: {
    color: "#f48d06",
    fontSize: scale(8),
    fontFamily: fonts.semibold,
  },
  scDelta: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(7),
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    borderRadius: scale(12),
    paddingHorizontal: scale(8),
    paddingVertical: scale(4),
  },
  scDeltaValue: {
    color: "#FFFFFF",
    fontSize: scale(13),
    lineHeight: scale(15),
    fontFamily: fonts.extrabold,
  },
  scDeltaLabel: {
    color: "rgba(255,255,255,0.92)",
    fontSize: scale(7),
    fontFamily: fonts.medium,
  },
  scTiles: {
    flexDirection: "row",
    marginTop: scale(4),
    paddingTop: scale(4),
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.24)",
  },
  scTile: { flex: 1, alignItems: "center" },
  scTileDivider: {
    borderLeftWidth: 1,
    borderLeftColor: "rgba(255,255,255,0.24)",
  },
  scTileIcon: {
    width: scale(22),
    height: scale(22),
    borderRadius: scale(9),
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: scale(3),
    shadowColor: "#0A2A4A",
    shadowOpacity: 0.25,
    shadowRadius: scale(6),
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  scTileValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: scale(3),
  },
  scTileValue: {
    color: "#FFFFFF",
    fontSize: scale(14),
    fontFamily: fonts.extrabold,
    flexShrink: 1,
  },
  scTileUnit: {
    color: "rgba(255,255,255,0.95)",
    fontSize: scale(7.5),
    fontFamily: fonts.bold,
  },
  scTileLabel: {
    color: "rgba(255,255,255,0.92)",
    fontSize: scale(6.5),
    letterSpacing: 0.5,
    marginTop: scale(2),
    fontFamily: fonts.bold,
  },
  dashboardCard: { marginTop: scale(12) },
  batteryCard: {
    borderRadius: scale(18),
    padding: scale(12),
    backgroundColor: "#FFFFFF",
    borderColor: BRAND_ORANGE_DARK,
    paddingTop: scale(14),
    shadowColor: BRAND_ORANGE_DARK,
    shadowOpacity: 0.16,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  batteryCardAccent: {
    position: "absolute",
    top: 0,
    left: scale(14),
    right: scale(14),
    height: scale(2),
    borderRadius: 99,
    opacity: 0.9,
  },
  batteryCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: scale(10),
  },
  batteryCardIdentity: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: scale(9),
  },
  batteryCardIcon: {
    width: scale(42),
    height: scale(42),
    borderRadius: scale(13),
    alignItems: "center",
    justifyContent: "center",
  },
  batteryCardIndicator: { width: scale(104), alignItems: "flex-end" },
  batteryCardEyebrow: {
    fontSize: scale(10),
    letterSpacing: 1.3,
    fontFamily: fonts.extrabold,
  },
  batteryCardLevelLabel: {
    fontSize: scale(6.5),
    letterSpacing: 1,
    fontFamily: fonts.extrabold,
    marginBottom: scale(1),
  },
  batteryCardValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-end",
  },
  batteryCardValue: {
    fontSize: scale(28),
    lineHeight: scale(30),
    letterSpacing: -0.8,
    fontFamily: fonts.extrabold,
  },
  batteryCardUnit: {
    fontSize: scale(17),
    marginLeft: scale(2),
    fontFamily: fonts.extrabold,
  },
  batteryCardDescription: {
    fontSize: scale(8),
    marginTop: scale(8),
    fontFamily: fonts.medium,
  },
  batteryCardTrack: {
    width: "100%",
    height: scale(5),
    borderRadius: 99,
    overflow: "hidden",
    marginTop: scale(2),
  },
  batteryCardFill: { height: "100%", borderRadius: 99 },
  batteryGridBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(6),
    marginTop: scale(10),
    borderRadius: scale(12),
    paddingVertical: scale(7),
    paddingHorizontal: scale(10),
    backgroundColor: "#16A34A",
    shadowColor: "#16A34A",
    shadowOpacity: 0.35,
    shadowRadius: scale(8),
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  batteryGridBannerText: {
    color: "#FFFFFF",
    fontSize: scale(9.5),
    fontFamily: fonts.extrabold,
  },
  batteryCardTapHint: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: scale(3),
    marginTop: scale(6),
  },
  batteryCardTapText: { fontSize: scale(8), fontFamily: fonts.bold },
  sectionTitle: {
    fontSize: scale(12),
    lineHeight: scale(16),
    fontFamily: fonts.extrabold,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
    marginBottom: scale(6),
  },
  balanceChartCard: {
    borderRadius: scale(17),
    padding: scale(13),
    shadowOpacity: 0.14,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  balanceChartHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  balanceChartEyebrow: {
    fontSize: scale(7),
    letterSpacing: 1,
    fontFamily: fonts.bold,
  },
  balanceChartValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    marginTop: scale(2),
  },
  balanceChartValue: {
    fontSize: scale(20),
    marginTop: scale(2),
    letterSpacing: -0.4,
    fontFamily: fonts.extrabold,
  },
  balanceChartPeriod: {
    fontSize: scale(7.5),
    marginTop: scale(2),
    fontFamily: fonts.medium,
  },
  balanceChartChange: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(3),
    borderRadius: scale(8),
    paddingHorizontal: scale(6),
    paddingVertical: scale(4),
  },
  balanceChartChangeText: { fontSize: scale(8), fontFamily: fonts.extrabold },
  balanceGraph: {
    height: scale(126),
    marginTop: scale(10),
    marginHorizontal: scale(-7),
    paddingHorizontal: scale(6),
    overflow: "hidden",
  },
  balanceChartLabels: {
    position: "absolute",
    left: scale(6),
    right: scale(6),
    bottom: 0,
    height: scale(15),
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
  },
  balanceChartLabel: {
    width: "25%",
    textAlign: "center",
    fontSize: scale(7),
    fontFamily: fonts.medium,
  },
  balanceChartLabelStart: { textAlign: "left" },
  balanceChartLabelEnd: { textAlign: "right" },
  kineticRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
    borderRadius: scale(11),
    borderWidth: 1,
    borderColor: "rgba(246,196,69,0.35)",
    backgroundColor: "rgba(246,196,69,0.10)",
    paddingHorizontal: scale(10),
    paddingVertical: scale(8),
    marginTop: scale(10),
    marginBottom: scale(10),
  },
  kineticText: { flex: 1, fontSize: scale(9.5), fontFamily: fonts.semibold },
  quickActionsSection: { marginTop: scale(10) },
  quickActionsTitle: {
    fontSize: scale(12),
    fontFamily: fonts.extrabold,
    marginBottom: scale(6),
  },
  quickActions: { flexDirection: "row", gap: scale(8), paddingRight: scale(4) },
  quickAction: {
    width: scale(82),
    minHeight: scale(78),
    alignItems: "center",
    borderRadius: scale(13),
    paddingVertical: scale(11),
    paddingHorizontal: scale(5),
    borderWidth: 1,
    borderColor: "rgba(230,100,31,0.16)",
  },
  quickActionPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  quickActionIcon: {
    width: scale(34),
    height: scale(34),
    borderRadius: scale(10),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: scale(4),
  },
  quickActionLabel: {
    fontSize: scale(8),
    fontFamily: fonts.bold,
    textAlign: "center",
  },
  zonesSection: { marginTop: scale(18) },
  zonesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: scale(10),
    paddingHorizontal: scale(2),
  },
  zonesTitle: {
    fontSize: scale(16),
    fontFamily: fonts.extrabold,
    letterSpacing: -0.2,
  },
  zonesSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(5),
    marginTop: scale(2),
  },
  zonesLiveDot: {
    width: scale(5),
    height: scale(5),
    borderRadius: scale(3),
    backgroundColor: "#22C55E",
  },
  zonesSubText: { fontSize: scale(8.5), fontFamily: fonts.medium },
  manageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
    paddingHorizontal: scale(9),
    paddingVertical: scale(6),
    borderRadius: 99,
  },
  manageText: { fontSize: scale(9.5), fontFamily: fonts.bold },
  devicesList: { gap: scale(10) },
  zoneEmpty: {
    fontSize: scale(10),
    fontFamily: fonts.medium,
    textAlign: "center",
    paddingVertical: scale(16),
  },
  zoneRow: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
    minHeight: scale(78),
    paddingVertical: scale(13),
    paddingHorizontal: scale(15),
    borderRadius: scale(18),
    borderWidth: 1,
    overflow: "hidden",
    shadowColor: BRAND_ORANGE_DARK,
    shadowOpacity: 0.08,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  zoneCardGlow: {
    ...StyleSheet.absoluteFill,
    borderRadius: scale(18),
  },
  zoneIconChip: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(13),
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  zoneInfo: { flex: 1, zIndex: 1 },
  zoneName: {
    fontSize: scale(12.5),
    fontFamily: fonts.extrabold,
    letterSpacing: 0.1,
  },
  zoneSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
    marginTop: scale(5),
  },
  zoneDetail: { fontSize: scale(8.5), fontFamily: fonts.medium },
  zoneState: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(3),
    paddingHorizontal: scale(5),
    paddingVertical: scale(2),
    borderRadius: 99,
    backgroundColor: "rgba(245,162,32,0.08)",
  },
  zoneStateDot: { width: scale(4), height: scale(4), borderRadius: scale(2) },
  zoneStateText: { fontSize: scale(7.5), fontFamily: fonts.bold },
  zoneTrailing: { zIndex: 1, paddingLeft: scale(4) },
  zoneSourceChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(3),
    borderRadius: 99,
    paddingHorizontal: scale(6),
    paddingVertical: scale(2),
  },
  zoneSourceText: { fontSize: scale(8), fontFamily: fonts.bold },
  stepsPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
    backgroundColor: "rgba(246,196,69,0.14)",
    borderWidth: 1,
    borderColor: "rgba(246,196,69,0.4)",
    borderRadius: 999,
    paddingHorizontal: scale(9),
    paddingVertical: scale(5),
  },
  stepsPillText: { fontSize: scale(9.5), fontFamily: fonts.extrabold },
  heatGrid: {
    gap: scale(6),
    paddingHorizontal: scale(10),
    paddingVertical: scale(9),
    borderRadius: scale(18),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.16)",
    shadowColor: "#0B101A",
    shadowOpacity: 0.38,
    shadowRadius: scale(14),
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  heatRow: { flexDirection: "row", gap: scale(7) },
  heatTile: {
    position: "relative",
    flex: 1,
    height: scale(78),
    borderRadius: scale(10),
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: scale(9),
    elevation: 7,
  },
  heatTileDepth: {
    position: "absolute",
    left: scale(4),
    right: scale(4),
    bottom: 0,
    height: scale(7),
    opacity: 0.9,
  },
  heatTileDiagonal: {
    position: "absolute",
    width: "145%",
    height: 1,
    top: "50%",
    left: "-22%",
    backgroundColor: "rgba(122,54,12,0.64)",
    transform: [{ rotate: "45deg" }],
  },
  heatTileHighlight: {
    position: "absolute",
    top: 1,
    left: 1,
    right: 1,
    height: "34%",
    borderTopLeftRadius: scale(12),
    borderTopRightRadius: scale(12),
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  heatTileBevelTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  heatTileBevelBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(122,54,12,0.72)",
  },
  heatTileActive: {
    borderWidth: 2,
    borderColor: BRAND_ORANGE,
    shadowOpacity: 1,
    shadowRadius: scale(14),
    elevation: 12,
    transform: [
      { perspective: 700 },
      { rotateX: "7deg" },
      { rotateY: "-3deg" },
      { scale: 1.04 },
    ],
  },
  legendText: { fontSize: scale(8.5), fontFamily: fonts.medium },
  legendSwatch: { width: scale(16), height: scale(8), borderRadius: scale(4) },
  tileInfo: {
    fontSize: scale(9.5),
    fontFamily: fonts.semibold,
    textAlign: "center",
    marginTop: scale(8),
  },
});
