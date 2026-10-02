import { fonts, useTheme, type Mode } from "../../theme";
import React, { useEffect, useState, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter, type Href } from "expo-router";
import { supabase } from "../../lib/supabase";
import { ScreenShell } from "../../components/screen-shell";
import { TopBar } from "../../components/top-bar";
import { HeroGlow } from "../../components/hero-glow";
import { LoadingScreen } from "../../components/loading-screen";

import {
  Card,
  Glass,
  SectionHead,
  LiveDot,
  brandAccent,
  scale,
  GOLD,
  NAVY,
} from "../../components/glass-ui";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Line, Path } from "react-native-svg";

/* ------------------------------ demo data ------------------------------- */
const HEAT_ROWS = 3;
const HEAT_COLS = 4;
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
  light: ["#FFF1E8", "#FFD0B2", "#FF9D63", "#F97316", "#C2410C"],
  dark: ["#151515", "#3A3A3A", "#616161", "#949494", "#FFFFFF"],
};

const heatColor = (v: number, mode: Mode) => {
  const stops = HEAT_STOPS[mode];
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
  Battery: { icon: "battery-charging", color: "#C2410C", tint: "rgba(249,115,22,0.14)" },
  Grid: { icon: "flash", color: "#7C3AED", tint: "rgba(124,58,237,0.12)" },
  Solar: { icon: "sunny", color: "#B45309", tint: "rgba(245,158,11,0.16)" },
};

/** Premium animated switch: orange track, white knob with a power glyph. */
function ZoneSwitch({
  on,
  mode,
  onToggle,
}: {
  on: boolean;
  mode: Mode;
  onToggle: () => void;
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

  const trackColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      mode === "dark" ? "rgba(255,255,255,0.16)" : "rgba(10,42,74,0.14)",
      "rgba(249,115,22,1)",
    ],
  });
  const knobX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [PAD, W - K - PAD],
  });

  return (
    <Pressable
      onPress={onToggle}
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
          shadowColor: "#F97316",
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
            color: on ? "#FFFFFF" : mode === "dark" ? "rgba(255,255,255,0.55)" : "rgba(10,42,74,0.5)",
            fontSize: scale(7),
            letterSpacing: 0.8,
            fontFamily: fonts.extrabold,
          }}
        >
          {on ? "ON" : "OFF"}
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
            color={on ? "#EA580C" : "#9AA3B2"}
          />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

/* ------------------------------- screen --------------------------------- */

export default function HomeScreen() {
  const { colors: c, mode } = useTheme();
  const router = useRouter();
  const accent = (alpha = 1) => brandAccent(mode, alpha);
  const [checking, setChecking] = useState(true);
  const [batteryPct] = useState(87.4);
  const [livePower] = useState(315);
  const [displayVoltage] = useState("224.50");
  const todayKwh = 4.82;
  const [showConsumptionGraph, setShowConsumptionGraph] = useState(false);
  const consumptionTransition = useRef(new Animated.Value(0)).current;

  const [zones, setZones] = useState([
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
    {
      id: "3",
      name: "Light #3",
      source: "Solar",
      detail: "Panel charging",
      on: false,
    },
  ]);
  const [activeTile, setActiveTile] = useState<number | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace("/");
        return;
      }
      setChecking(false);
    };
    loadSession();
  }, [router]);

  useEffect(() => {
    Animated.timing(consumptionTransition, {
      toValue: showConsumptionGraph ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [consumptionTransition, showConsumptionGraph]);

  if (checking) {
    return <LoadingScreen label="Verifying session" />;
  }

  const isActive = true;

  const stats = [
    { label: "VOLTAGE", value: displayVoltage, unit: "V" },
    {
      label: "POWER",
      value: livePower !== null ? livePower.toString() : "--",
      unit: "W",
    },
    {
      label: "BATTERY",
      value: batteryPct !== null ? Math.floor(batteryPct).toString() : "--",
      unit: "%",
    },
  ];

  const yesterdayKwh = "5.36";
  const consumptionDelta = "-10.1%";

  // Hero (glow header) colours — theme-aware ink so the glow stays legible on
  // BOTH themes. Light mode sits on a pale peach glow, so it borrows the same
  // dark warm ink the glass TopBar uses (#2B1205); dark mode keeps white.
  const heroInk = mode === "dark" ? "#FFFFFF" : "#2B1205";
  const heroInkSoft =
    mode === "dark" ? "rgba(255,255,255,0.70)" : "rgba(43,18,5,0.72)";
  const heroTrack =
    mode === "dark" ? "rgba(255,255,255,0.14)" : "rgba(43,18,5,0.16)";
  const heroFillColors: [string, string] =
    mode === "dark" ? ["#FDBA74", "#F97316"] : ["#F97316", "#C2410C"];

  return (
    <ScreenShell>
      {/* ============ HERO: TOP BAR + BATTERY HEALTH ============ */}
      <View style={st.hero}>
        <HeroGlow mode={mode} intensity={isActive ? 1 : mode === "dark" ? 0.4 : 0.85} bleedBottom={scale(40)} />

        <View style={st.heroTopBar}>
          <TopBar gutter={0} title="Dashboard" showTitleChevron glass />
        </View>

        <View style={st.heroBody}>
          <View style={st.heroLabelRow}>
            <Ionicons name="battery-charging" size={scale(14)} color={heroInkSoft} />
            <Text style={[st.heroLabel, { color: heroInkSoft }]}>Battery health</Text>
          </View>

          <View style={st.heroNumberRow}>
            <Text style={[st.heroNumber, { color: heroInk }, !isActive && { opacity: 0.6 }]}>
              {batteryPct !== null ? Math.floor(batteryPct) : "--"}
            </Text>
            <Text style={[st.heroUnit, { color: heroInkSoft }]}>%</Text>
          </View>

          <Text style={[st.heroDesc, { color: heroInkSoft }]}>
            {isActive
              ? "Strong charge capacity for today's energy needs"
              : "Awaiting connection to read capacity"}
          </Text>

          <View style={[st.heroTrack, { backgroundColor: heroTrack }]}>
            {isActive && (
              <LinearGradient
                colors={heroFillColors}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[st.heroFill, { width: `${batteryPct ?? 0}%` }]}
              />
            )}
          </View>
        </View>
      </View>

      <EnterView delay={90} style={st.statsSection}>
        <LinearGradient
          colors={
            isActive
              ? mode === "dark"
                ? ["#9A3412", "#EA580C", "#F97316"]
                : ["#C2410C", "#EA580C", "#F97316"]
              : ["#475569", "#64748B", "#94A3B8"]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={st.scCard}
        >
          <View pointerEvents="none" style={st.scSheenA} />
          <View pointerEvents="none" style={st.scSheenB} />
          <View style={st.scTop}>
            <View>
              <Text style={st.scEyebrow}>Today&apos;s consumption</Text>
              <View style={st.scKwhRow}>
                <Text style={st.scKwh}>
                  {isActive ? todayKwh.toFixed(2) : "--"}
                </Text>
                <Text style={st.scKwhUnit}>kWh</Text>
              </View>
            </View>
            <View style={[st.scDelta, !isActive && { opacity: 0.5 }]}>
              <Ionicons name="trending-down" size={scale(14)} color="#FFFFFF" />
              <View>
                <Text style={st.scDeltaValue}>{consumptionDelta}</Text>
                <Text style={st.scDeltaLabel}>vs yesterday</Text>
              </View>
            </View>
          </View>
          <View style={st.scTrack}>
            <View
              style={[st.scFill, !isActive && { width: "0%" }]}
            />
          </View>
          <View style={st.scMetaRow}>
            <Text style={st.scSub}>{yesterdayKwh} kWh yesterday</Text>
            <Pressable
              onPress={() => setShowConsumptionGraph((visible) => !visible)}
              hitSlop={8}
              style={st.scGraphLink}
              accessibilityRole="button"
              accessibilityLabel={showConsumptionGraph ? "Show consumption stats" : "Show consumption graph"}
            >
              <Ionicons name={showConsumptionGraph ? "stats-chart" : "analytics-outline"} size={scale(11)} color="#FFFFFF" />
              <Text style={st.scGraphLinkText}>{showConsumptionGraph ? "View stats" : "View graph"}</Text>
            </Pressable>
          </View>

          <View style={st.scContent}>
            <Animated.View
              pointerEvents={showConsumptionGraph ? "none" : "auto"}
              style={[
                st.scStatsView,
                {
                  opacity: consumptionTransition.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                  transform: [{ scale: consumptionTransition.interpolate({ inputRange: [0, 1], outputRange: [1, 0.98] }) }],
                },
              ]}
            >
              <View style={st.scTiles}>
                {stats.map((s, i) => {
                  const icon = (
                    {
                      VOLTAGE: "flash",
                      POWER: "speedometer",
                      BATTERY: "battery-charging",
                    } as const
                  )[s.label as "VOLTAGE" | "POWER" | "BATTERY"];
                  return (
                    <View key={s.label} style={[st.scTile, i > 0 && st.scTileDivider]}>
                      <View style={st.scTileIcon}>
                        <Ionicons name={icon} size={scale(15)} color="#EA580C" />
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
            </Animated.View>

            <Animated.View
              pointerEvents={showConsumptionGraph ? "auto" : "none"}
              style={[
                st.scGraphView,
                {
                  opacity: consumptionTransition,
                  transform: [{ translateY: consumptionTransition.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) }],
                },
              ]}
            >
              <Svg viewBox="0 0 320 112" width="100%" height={scale(58)}>
                <Line x1="0" y1="94" x2="320" y2="94" stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
                <Path
                  d="M0 84 C24 72 36 80 58 62 S92 74 115 58 S146 28 170 46 S205 70 228 48 S258 20 282 37 S304 45 320 22"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeOpacity="0.92"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
              </Svg>
              <View style={st.scGraphLabels}>
                <Text style={st.scGraphLabel}>6 AM</Text>
                <Text style={st.scGraphLabel}>12 PM</Text>
                <Text style={st.scGraphLabel}>6 PM</Text>
                <Text style={st.scGraphLabel}>NOW</Text>
              </View>
            </Animated.View>
          </View>
        </LinearGradient>
      </EnterView>

      <EnterView delay={270} style={st.zonesSection}>
        <View
          pointerEvents={isActive ? "auto" : "none"}
          style={[!isActive && { opacity: 0.6 }]}
        >
          <View style={st.zonesHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[st.zonesTitle, { color: c.text }]}>My zones</Text>
              <View style={st.zonesSubRow}>
                <View
                  style={[
                    st.zonesLiveDot,
                    !isActive && { backgroundColor: c.muted },
                  ]}
                />
                <Text style={[st.zonesSubText, { color: c.muted }]}>
                  {isActive ? zones.filter((zone) => zone.on).length : 0} of {zones.length} active · {isActive ? "Online" : "Standby"}
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
                      : "rgba(249,115,22,0.10)",
                },
              ]}
            >
              <Text style={[st.manageText, { color: mode === "dark" ? c.orange : "#C2410C" }]}>Manage</Text>
              <Ionicons name="arrow-forward" size={scale(13)} color={mode === "dark" ? c.orange : "#C2410C"} />
            </Pressable>
          </View>
          {zones.length === 0 && (
            <Text style={[st.zoneEmpty, { color: c.muted }]}>No zones yet</Text>
          )}
          <View style={st.devicesList}>
            {zones.map((z) => {
            const live = isActive && z.on;
            const src = SOURCE_META[z.source] ?? SOURCE_META.Battery;
            return (
              <Pressable
                key={z.id}
                onPress={() =>
                  router.push(
                    `/pages/zones/${z.id}?name=${encodeURIComponent(z.name)}&source=${encodeURIComponent(z.source)}&detail=${encodeURIComponent(z.detail)}&on=${z.on}` as Href,
                  )
                }
                style={({ pressed }) => [
                  st.zoneRow,
                  {
                    backgroundColor: live
                      ? "rgba(249,115,22,0.12)"
                      : mode === "dark"
                        ? "rgba(255,255,255,0.04)"
                        : "rgba(249,115,22,0.04)",
                    borderColor: live ? "rgba(249,115,22,0.48)" : "rgba(249,115,22,0.18)",
                  },
                  pressed && { opacity: 0.9 },
                ]}
              >
                  <LinearGradient
                    colors={
                      live
                        ? ["rgba(249,115,22,0.14)", "rgba(249,115,22,0.02)"]
                        : ["rgba(148,163,184,0.06)", "rgba(148,163,184,0)"]
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    pointerEvents="none"
                    style={st.zoneCardGlow}
                  />
                  {live ? (
                    <LinearGradient
                      colors={["#FB923C", "#EA580C"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={st.zoneIconChip}
                    >
                      <Ionicons name="bulb" size={scale(16)} color="#FFFFFF" />
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
                      <Ionicons name="bulb-outline" size={scale(16)} color={c.muted} />
                    </View>
                  )}

                  <View style={st.zoneInfo}>
                    <Text style={[st.zoneName, { color: c.text }]} numberOfLines={1}>
                      {z.name}
                    </Text>
                    <View style={st.zoneSubRow}>
                      <View style={[st.zoneSourceChip, { backgroundColor: src.tint }]}>
                        <Ionicons name={src.icon} size={scale(9)} color={src.color} />
                        <Text style={[st.zoneSourceText, { color: src.color }]}>{z.source}</Text>
                      </View>
                      <Text style={[st.zoneDetail, { color: c.muted }]} numberOfLines={1}>
                        {z.detail}
                      </Text>
                      <View style={st.zoneState}>
                        <View style={[st.zoneStateDot, { backgroundColor: live ? "#F97316" : c.muted }]} />
                        <Text style={[st.zoneStateText, { color: live ? "#C2410C" : c.muted }]}>
                          {live ? "Live" : "Standby"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={st.zoneTrailing}>
                    <ZoneSwitch
                      on={live}
                      mode={mode}
                      onToggle={() =>
                        setZones((zs) =>
                          zs.map((x) =>
                            x.id === z.id ? { ...x, on: !x.on } : x,
                          ),
                        )
                      }
                    />
                  </View>
              </Pressable>
            );
          })}
          </View>
        </View>
      </EnterView>

      <EnterView delay={450}>
        <SectionHead
          title="MOST WALKED-ON TILES"
          link="Full heatmap"
          onLink={() => router.push("/pages/heatmap")}
          mode={mode}
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
                Gate Pathway · Live Tile Heat
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
                  ? "Brighter white = more foot traffic"
                  : "Brighter green = more foot traffic"}
              </Text>
            </View>
            <View
              style={[
                st.stepsPill,
                isActive
                  ? { backgroundColor: accent(0.14), borderColor: accent(0.4) }
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
                {isActive ? "1,248" : "--"}
              </Text>
            </View>
          </View>

          <View
            style={[
              st.kineticRow,
              isActive
                ? { borderColor: accent(0.35), backgroundColor: accent(0.1) }
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
                isActive ? (mode === "dark" ? "#FFFFFF" : "#B4771B") : c.muted
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
              Footsteps converted today
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
              {isActive ? "+0.34 kWh" : "-- kWh"}
            </Text>
          </View>

          <View
            style={[
              st.heatGrid,
              {
                backgroundColor:
                  mode === "dark"
                    ? "rgba(255,255,255,0.05)"
                    : "rgba(255,255,255,0.6)",
              },
            ]}
          >
            {Array.from({ length: HEAT_ROWS }, (_, r) => (
              <View key={r} style={st.heatRow}>
                {Array.from({ length: HEAT_COLS }, (_, col) => {
                  const i = r * HEAT_COLS + col;
                  const v = isActive ? heatTiles[i] : 0.05; // Drop value strictly to baseline if offline
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
                          backgroundColor: heatColor(v, mode),
                          shadowColor: mode === "dark" ? "#FFFFFF" : "#4CA83E",
                          shadowOpacity: isActive ? v * 0.9 : 0,
                          shadowRadius: scale(9),
                          borderWidth: mode === "dark" ? 1 : 0,
                          borderColor: "rgba(255,255,255,0.10)",
                          borderBottomWidth: scale(3),
                          borderBottomColor:
                            mode === "dark"
                              ? "rgba(0,0,0,0.42)"
                              : "rgba(108,42,12,0.28)",
                        },
                        active &&
                          isActive && [
                            st.heatTileActive,
                            {
                              borderColor:
                                mode === "dark" ? "#FFFFFF" : "#4CA83E",
                            },
                          ],
                      ]}
                    >
                      <View pointerEvents="none" style={st.heatTileHighlight} />
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
              Less
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
                    { backgroundColor: heatColor(v, mode) },
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
              More
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
              Tile #{activeTile + 1} — {Math.round(heatTiles[activeTile] * 480)}{" "}
              crossings today
            </Text>
          )}
        </Card>
      </EnterView>

      <View style={{ height: scale(28) }} />
    </ScreenShell>
  );
}

const st = StyleSheet.create({
  // Hero: top bar + battery health on a shared orange glow
  hero: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingBottom: scale(26),
    position: "relative",
    zIndex: 10, // keeps the notification dropdown above the cards below
  },
  heroTopBar: { zIndex: 5 },
  heroBody: { zIndex: 1, alignItems: "center", marginTop: scale(6) },
  heroLabelRow: { flexDirection: "row", alignItems: "center", gap: scale(6) },
  heroLabel: { fontSize: scale(10.5), letterSpacing: 0.4, fontFamily: fonts.bold },
  heroNumberRow: { flexDirection: "row", alignItems: "baseline", marginTop: scale(6) },
  heroNumber: {
    fontSize: scale(72),
    lineHeight: scale(78),
    letterSpacing: -2,
    fontFamily: fonts.extrabold,
  },
  heroUnit: { fontSize: scale(24), marginLeft: scale(3), fontFamily: fonts.extrabold },
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
  heroFill: { height: "100%", borderRadius: 99 },

  demoBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(6),
    backgroundColor: "#F97316",
    paddingVertical: scale(9),
    borderRadius: scale(8),
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
  healthTitle: {
    color: "#FFFFFF",
    fontSize: scale(25),
    marginTop: scale(4),
    fontFamily: fonts.extrabold,
  },
  healthMeta: {
    color: "rgba(255,255,255,0.72)",
    fontSize: scale(10),
    marginTop: scale(3),
    fontFamily: fonts.medium,
  },
  healthLive: {
    position: "absolute",
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
    paddingHorizontal: scale(8),
    paddingVertical: scale(5),
    borderRadius: 99,
    backgroundColor: "rgba(10,42,74,0.28)",
  },
  healthLiveText: {
    color: "#FFFFFF",
    fontSize: scale(8),
    letterSpacing: 1,
    fontFamily: fonts.extrabold,
  },
  healthBody: {
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "column",
    marginTop: scale(8),
  },
  healthNumberRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
  },
  healthNumber: {
    color: "#FFFFFF",
    fontSize: scale(76),
    lineHeight: scale(78),
    letterSpacing: -1,
    fontFamily: fonts.extrabold,
  },
  healthNumberUnit: {
    color: "#FFF7ED",
    fontSize: scale(25),
    marginLeft: scale(3),
    fontFamily: fonts.extrabold,
  },
  healthIntro: { alignItems: "center", marginTop: scale(10) },
  healthIntroTitle: {
    color: "#FFFFFF",
    fontSize: scale(18),
    fontFamily: fonts.extrabold,
  },
  healthIntroDescription: {
    color: "rgba(255,255,255,0.72)",
    fontSize: scale(9),
    textAlign: "center",
    marginTop: scale(3),
    fontFamily: fonts.medium,
  },
  healthCopy: { alignItems: "center", width: "82%" },
  healthSummary: {
    color: "#FFFFFF",
    fontSize: scale(14),
    fontFamily: fonts.extrabold,
    textAlign: "center",
  },
  healthDetail: {
    color: "rgba(255,255,255,0.72)",
    fontSize: scale(10),
    lineHeight: scale(15),
    marginTop: scale(5),
    fontFamily: fonts.medium,
    textAlign: "center",
  },
  healthBar: {
    height: scale(5),
    borderRadius: 99,
    overflow: "hidden",
    backgroundColor: "rgba(10,42,74,0.28)",
    width: "100%",
    marginTop: scale(9),
  },
  energySummaryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  kwhRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: scale(4),
    marginTop: scale(1),
  },
  kwhValue: {
    fontSize: scale(31),
    lineHeight: scale(34),
    fontFamily: fonts.extrabold,
  },
  kwhUnit: {
    color: "#EA580C",
    fontSize: scale(12),
    fontFamily: fonts.extrabold,
  },
  comparisonPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.24)",
    backgroundColor: "rgba(249,115,22,0.10)",
    paddingHorizontal: scale(9),
    paddingVertical: scale(7),
  },
  comparisonValue: {
    color: "#EA580C",
    fontSize: scale(11),
    fontFamily: fonts.extrabold,
  },
  comparisonLabel: {
    color: "#EA580C",
    fontSize: scale(7.5),
    marginTop: scale(1),
    fontFamily: fonts.bold,
  },
  comparisonTrack: {
    height: scale(5),
    borderRadius: 99,
    overflow: "hidden",
    backgroundColor: "rgba(249,115,22,0.12)",
    marginTop: scale(11),
  },
  comparisonFill: {
    width: "90%",
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#EA580C",
  },
  comparisonDetail: {
    fontSize: scale(8.5),
    marginTop: scale(5),
    fontFamily: fonts.medium,
  },
  statsDivider: {
    height: 1,
    backgroundColor: "rgba(249,115,22,0.16)",
    marginVertical: scale(11),
  },
  // ---- stats (solid orange gradient) ----
  scCard: {
    borderRadius: scale(22),
    padding: scale(11),
    overflow: "hidden",
    shadowColor: "#EA580C",
    shadowOpacity: 0.32,
    shadowRadius: scale(16),
    shadowOffset: { width: 0, height: 8 },
    elevation: 7,
  },
  scSheenA: {
    position: "absolute",
    top: scale(-60),
    right: scale(-40),
    width: scale(170),
    height: scale(170),
    borderRadius: scale(85),
    backgroundColor: "rgba(255,255,255,0.10)",
  },
  scSheenB: {
    position: "absolute",
    bottom: scale(-70),
    left: scale(-50),
    width: scale(150),
    height: scale(150),
    borderRadius: scale(75),
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  scTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  scEyebrow: { color: "rgba(255,255,255,0.92)", fontSize: scale(8.5), fontFamily: fonts.semibold },
  scKwhRow: { flexDirection: "row", alignItems: "baseline", gap: scale(3), marginTop: scale(1) },
  scKwh: { color: "#FFFFFF", fontSize: scale(27), letterSpacing: -0.6, fontFamily: fonts.extrabold },
  scKwhUnit: { color: "rgba(255,255,255,0.95)", fontSize: scale(10), fontFamily: fonts.bold },
  scDelta: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(7),
    backgroundColor: "rgba(255,255,255,0.18)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.32)",
    borderRadius: scale(12),
    paddingHorizontal: scale(8),
    paddingVertical: scale(5),
  },
  scDeltaValue: { color: "#FFFFFF", fontSize: scale(10), fontFamily: fonts.extrabold },
  scDeltaLabel: { color: "rgba(255,255,255,0.92)", fontSize: scale(6.5), fontFamily: fonts.medium },
  scTrack: {
    height: scale(5),
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.22)",
    overflow: "hidden",
    marginTop: scale(8),
  },
  scFill: { width: "68%", height: "100%", borderRadius: 99, backgroundColor: "#FFFFFF" },
  scMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: scale(5),
  },
  scSub: { color: "rgba(255,255,255,0.92)", fontSize: scale(8.5), fontFamily: fonts.medium },
  scGraphLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
    minHeight: scale(24),
    paddingHorizontal: scale(7),
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  scGraphLinkText: { color: "#FFFFFF", fontSize: scale(8.5), fontFamily: fonts.bold },
  scContent: { height: scale(72), marginTop: scale(2), position: "relative" },
  scStatsView: { ...StyleSheet.absoluteFill, justifyContent: "flex-end" },
  scGraphView: { ...StyleSheet.absoluteFill, paddingTop: scale(2) },
  scGraphLabels: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: scale(2) },
  scGraphLabel: { color: "rgba(255,255,255,0.86)", fontSize: scale(8), fontFamily: fonts.medium },
  scTiles: {
    flexDirection: "row",
    marginTop: scale(2),
    paddingTop: scale(7),
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.24)",
  },
  scTile: { flex: 1, alignItems: "center" },
  scTileDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.24)" },
  scTileIcon: {
    width: scale(20),
    height: scale(20),
    borderRadius: scale(7),
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
  scTileValueRow: { flexDirection: "row", alignItems: "baseline", gap: scale(2) },
  scTileValue: { color: "#FFFFFF", fontSize: scale(12), fontFamily: fonts.extrabold, flexShrink: 1 },
  scTileUnit: { color: "rgba(255,255,255,0.95)", fontSize: scale(7), fontFamily: fonts.bold },
  scTileLabel: { color: "rgba(255,255,255,0.92)", fontSize: scale(5.8), letterSpacing: 0.6, marginTop: scale(1), fontFamily: fonts.bold },

  // ---- zones (one compact container, rows split by hairlines) ----
  zonesSection: { marginTop: scale(18) },
  zonesHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: scale(10),
    paddingHorizontal: scale(2),
  },
  zonesTitle: { fontSize: scale(16), fontFamily: fonts.extrabold, letterSpacing: -0.2 },
  zonesSubRow: { flexDirection: "row", alignItems: "center", gap: scale(5), marginTop: scale(2) },
  zonesLiveDot: { width: scale(5), height: scale(5), borderRadius: scale(3), backgroundColor: "#22C55E" },
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
  zoneEmpty: { fontSize: scale(10), fontFamily: fonts.medium, textAlign: "center", paddingVertical: scale(16) },
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
    shadowColor: "#EA580C",
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
  zoneName: { fontSize: scale(12.5), fontFamily: fonts.extrabold, letterSpacing: 0.1 },
  zoneSubRow: { flexDirection: "row", alignItems: "center", gap: scale(6), marginTop: scale(5) },
  zoneDetail: { fontSize: scale(8.5), fontFamily: fonts.medium },
  zoneState: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(3),
    paddingHorizontal: scale(5),
    paddingVertical: scale(2),
    borderRadius: 99,
    backgroundColor: "rgba(249,115,22,0.08)",
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
  healthRing: {
    width: scale(112),
    height: scale(112),
    alignItems: "center",
    justifyContent: "center",
  },
  healthRingTrack: {
    position: "absolute",
    width: scale(106),
    height: scale(106),
    borderRadius: scale(53),
    borderWidth: scale(9),
    borderColor: "rgba(10,42,74,0.28)",
  },
  healthRingArc: {
    position: "absolute",
    width: scale(106),
    height: scale(106),
    borderRadius: scale(53),
    borderWidth: scale(9),
    borderColor: "#FFF7ED",
    borderLeftColor: "transparent",
    borderBottomColor: "transparent",
  },
  healthRingCore: {
    width: scale(78),
    height: scale(78),
    borderRadius: scale(39),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(10,42,74,0.26)",
  },
  healthValue: {
    color: "#FFFFFF",
    fontSize: scale(29),
    lineHeight: scale(31),
    fontFamily: fonts.extrabold,
  },
  healthUnit: {
    color: "#FFF7ED",
    fontSize: scale(10),
    fontFamily: fonts.extrabold,
  },
  healthStatus: {
    color: "rgba(255,255,255,0.72)",
    fontSize: scale(8),
    letterSpacing: 1.1,
    marginTop: scale(1),
    fontFamily: fonts.extrabold,
  },
  healthBarFill: {
    width: "89%",
    height: "100%",
    borderRadius: 99,
    backgroundColor: "#FFF7ED",
  },
  statsSection: { marginTop: scale(-9), zIndex: 2 },
  glassStats: {
    borderRadius: scale(17),
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
    shadowColor: "#0A2A4A",
    shadowOpacity: 0.14,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  statsEyebrow: {
    fontSize: scale(8),
    letterSpacing: 1.5,
    fontFamily: fonts.extrabold,
    marginBottom: scale(9),
  },
  statLabel: {
    fontSize: scale(7.5),
    letterSpacing: 1.1,
    fontFamily: fonts.bold,
  },
  statValueRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: scale(2),
    marginTop: scale(3),
  },
  statValue: { fontSize: scale(16), fontFamily: fonts.extrabold },
  statUnit: {
    color: "#EA580C",
    fontSize: scale(9),
    fontFamily: fonts.extrabold,
  },
  batteryBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(12),
    minHeight: scale(112),
    borderTopLeftRadius: scale(74),
    borderTopRightRadius: scale(74),
    borderBottomLeftRadius: scale(22),
    borderBottomRightRadius: scale(22),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    paddingHorizontal: scale(20),
    paddingTop: scale(28),
    paddingBottom: scale(14),
    shadowColor: "rgba(10,42,74,0.3)",
    shadowOpacity: 0.25,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  batteryIcon: {
    width: scale(42),
    height: scale(42),
    borderRadius: scale(21),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.26)",
  },
  batteryEyebrow: {
    color: NAVY,
    fontSize: scale(8),
    letterSpacing: 1.4,
    fontFamily: fonts.extrabold,
  },
  batteryTitle: {
    color: NAVY,
    fontSize: scale(18),
    letterSpacing: 1,
    fontFamily: fonts.extrabold,
  },
  batteryPct: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(2),
    backgroundColor: "rgba(10,42,74,0.10)",
    borderWidth: 1,
    borderColor: "rgba(10,42,74,0.35)",
    borderRadius: scale(10),
    paddingHorizontal: scale(8),
    paddingVertical: scale(6),
  },
  batteryPctText: {
    color: NAVY,
    fontSize: scale(15),
    fontFamily: fonts.extrabold,
  },
  totalPill: {
    borderRadius: 999,
    paddingHorizontal: scale(12),
    paddingVertical: scale(5),
  },
  savedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
    backgroundColor: "rgba(21,128,61,0.12)",
    borderRadius: 999,
    paddingHorizontal: scale(10),
    paddingVertical: scale(5),
    marginTop: scale(8),
  },
  statsCard: {
    alignSelf: "stretch",
    marginTop: scale(14),
    borderRadius: scale(14),
    paddingVertical: scale(8),
    paddingHorizontal: scale(6),
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
  },
  statsRow: { flexDirection: "row" },
  statCell: { flex: 1, alignItems: "center", gap: scale(2) },
  batterySection: { marginTop: scale(10) },
  sectionDivider: {
    height: 1,
    backgroundColor: "rgba(10,42,74,0.12)",
    marginTop: scale(16),
    marginBottom: scale(2),
  },
  ringWrap: {
    width: scale(52),
    height: scale(52),
    alignItems: "center",
    justifyContent: "center",
  },
  ringBg: {
    position: "absolute",
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    borderWidth: scale(5),
  },
  ringArc: {
    position: "absolute",
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    borderWidth: scale(5),
    borderTopColor: "transparent",
    borderRightColor: "transparent",
  },
  ringMask: {
    position: "absolute",
    width: scale(20),
    height: scale(10),
    bottom: 0,
  },
  goalTrack: {
    height: scale(4),
    borderRadius: 99,
    overflow: "hidden",
    marginTop: scale(8),
  },
  goalFill: { height: "100%", borderRadius: 99, backgroundColor: GOLD },
  zoneIcon: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(10),
    backgroundColor: "rgba(10,42,74,0.05)",
    borderWidth: 1,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
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
  heatGrid: {
    gap: scale(6),
    padding: scale(10),
    borderRadius: scale(18),
    borderWidth: 1,
    borderColor: "rgba(249,115,22,0.18)",
  },
  heatRow: { flexDirection: "row", gap: scale(5) },
  heatTile: {
    position: "relative",
    flex: 1,
    aspectRatio: 1.12,
    borderRadius: scale(13),
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 5 },
    shadowRadius: scale(9),
    elevation: 7,
    transform: [{ perspective: 700 }, { rotateX: "7deg" }, { rotateY: "-3deg" }],
  },
  heatTileHighlight: {
    position: "absolute",
    top: 1,
    left: 1,
    right: 1,
    height: "34%",
    borderTopLeftRadius: scale(12),
    borderTopRightRadius: scale(12),
    backgroundColor: "rgba(255,255,255,0.20)",
  },
  heatTileActive: {
    borderWidth: 2,
    borderColor: "#F97316",
    shadowOpacity: 1,
    shadowRadius: scale(14),
    elevation: 12,
    transform: [{ perspective: 700 }, { rotateX: "7deg" }, { rotateY: "-3deg" }, { scale: 1.04 }],
  },
  legendText: { fontSize: scale(8.5), fontFamily: fonts.medium },
  legendSwatch: { width: scale(16), height: scale(8), borderRadius: scale(4) },
  tileInfo: {
    fontSize: scale(9.5),
    fontFamily: fonts.semibold,
    textAlign: "center",
    marginTop: scale(8),
  },
  microLabel: {
    color: "rgba(120,130,150,0.9)",
    fontSize: scale(7.5),
    letterSpacing: 1.3,
    fontFamily: fonts.bold,
  },
  uptimePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(4),
    backgroundColor: "rgba(246,196,69,0.12)",
    borderWidth: 1,
    borderColor: "rgba(246,196,69,0.3)",
    borderRadius: 999,
    paddingHorizontal: scale(10),
    paddingVertical: scale(6),
  },
});