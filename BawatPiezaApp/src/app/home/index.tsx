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
import { DashboardStats } from "./stats-and-battery";
import { DashboardActions } from "./dashboard-actions";
import { scale } from "../../components/glass-ui";

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
  batteryCardInk: string;
};

function useGridPalette(usingGrid: boolean, mode: Mode): GridPalette {
  return {
    gridActive: usingGrid,
    batteryCardInk: mode === "dark" ? "#FFFFFF" : "#0A2A4A",
  };
}

export default function HomeScreen() {
  const { colors: c, mode } = useTheme();
  const { ready, isLoggedIn, user } = useAuth();
  const router = useRouter();

  const { override, openOverrides } = usePowerOverride();
  const usingGrid = override !== "battery";

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

  // Provide a safe fallback for accent if needed
  const accent = (alpha = 1) => `rgba(245,162,32,${alpha})`;

  const { gridActive, batteryCardInk } = useGridPalette(usingGrid, mode);

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

  // Dynamically set initial source based on grid state
  const [zones, setZones] = useState([
    {
      id: "1",
      name: "test appliance",
      source: usingGrid ? "Grid" : "Battery",
      detail: "connected to relay 1",
      on: true,
    },
  ]);

  // Keep the zone source updated whenever the power source switches
  useEffect(() => {
    setZones((prevZones) =>
      prevZones.map((z) =>
        z.id === "1" ? { ...z, source: usingGrid ? "Grid" : "Battery" } : z,
      ),
    );
  }, [usingGrid]);

  const [activeTile, setActiveTile] = useState<number | null>(null);

  const isActive = true;

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

  const consumptionData = {
    today: {
      label: "Today",
      kwh: 4.82,
      comparison: "5.36 kwh yesterday",
      delta: "-10.1%",
      savings: "≈ ₱86 saved off meralco billing",
      deltaLabel: "vs yesterday",
    },
    "7days": {
      label: "Last 7 days",
      kwh: 31.64,
      comparison: "34.20 kwh previous 7 days",
      delta: "-7.5%",
      savings: "≈ ₱566 saved off meralco billing",
      deltaLabel: "vs previous 7 days",
    },
    month: {
      label: "This month",
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
        <View
          style={{
            marginHorizontal: -8,
            paddingHorizontal: 8,
            paddingBottom: scale(8),
            position: "relative",
            zIndex: 10,
          }}
        >
          <HeroGlow
            mode={mode}
            gridActive={gridActive}
            intensity={isActive ? 1 : mode === "dark" ? 0.4 : 0.85}
            bleedBottom={scale(76)}
          />
          <View style={{ zIndex: 5 }}>
            <TopBar gutter={0} title="Dashboard" />
          </View>
        </View>
        <DashboardStats
          c={c}
          mode={mode}
          usingGrid={usingGrid}
          isActive={isActive}
          activeAccent={activeAccent}
          activeOrangeDark={activeOrangeDark}
          batteryPct={batteryPct}
          displayVoltage={displayVoltage}
          mqttStatus={mqttStatus}
          batteryCardInk={batteryCardInk}
          batteryCardMutedInk={batteryCardMutedInk}
          statsPop={statsPop}
          graphProgress={graphProgress}
          greeting={greeting}
          metadataName={metadataName}
          consumptionRange={consumptionRange}
          consumptionData={consumptionData}
          selectedConsumption={selectedConsumption}
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
          router={router}
          zones={zones}
          setZones={setZones}
          activeTile={activeTile}
          setActiveTile={setActiveTile}
          mqttClientRef={mqttClientRef}
          footsteps={footsteps}
          dynamicKwhHarvested={dynamicKwhHarvested}
          accent={accent}
        />
      </ScrollView>
    </ScreenShell>
  );
}
