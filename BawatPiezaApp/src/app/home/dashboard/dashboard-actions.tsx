import React, { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "../../../components/app-text";
import {
  getHeatmapTileColor,
  HeatmapTileGrid,
} from "../../../components/heatmap-tile-grid";
import { Card, SectionHead, scale, NAVY } from "../../../components/glass-ui";
import { TourSpot } from "../../../components/app-tour-overlay";
import { Mode, ThemeColors, fonts } from "../../../theme";
import { st } from "./home-styles";
import { useRouter, type Href } from "expo-router";

const BRAND_ORANGE = "#F5A220";
const BRAND_ORANGE_DARK = "#E6641F";
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

  const gridGreen = BRAND_ORANGE_DARK;
  const onColor = gridActive ? gridGreen : BRAND_ORANGE_DARK;
  const onColorDark = BRAND_ORANGE;

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

export type DashboardZone = { id: string; name: string; source: string; detail: string; on: boolean };
type Props = { c: ThemeColors; mode: Mode; usingGrid: boolean; activeOrange: string; activeOrangeDark: string; activeAccent: string; activeAccentSoft: string; gridActive: boolean; isActive: boolean; installedTileCount: number; tileSetupLoaded: boolean; router: ReturnType<typeof useRouter>; zones: DashboardZone[]; onZoneToggle: (zoneId: string) => void; activeTile: number | null; setActiveTile: React.Dispatch<React.SetStateAction<number | null>>; footsteps: number; dynamicKwhHarvested: string; accent: (alpha?: number) => string; };
export function DashboardActions({ c, mode, usingGrid, activeOrange, activeOrangeDark, activeAccent, activeAccentSoft, gridActive, isActive, installedTileCount, tileSetupLoaded, router, zones, onZoneToggle, activeTile, setActiveTile, footsteps, dynamicKwhHarvested, accent }: Props) {
  const heatTiles = Array.from(
    { length: Math.min(installedTileCount, 60) },
    (_, index) => {
      const wave = Math.sin(index / 2.6) * 0.3 + Math.cos(index / 5) * 0.2;
      return Math.min(
        1,
        Math.max(0.06, 0.45 + wave + ((index * 2654435761) % 100) / 500),
      );
    },
  );
  const heatmapTiles = heatTiles.map((traffic, index) => ({
    id: index + 1,
    label: `Tile ${index + 1}`,
    traffic: isActive ? traffic : 0.05,
  }));
  return (
  <>
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
                label: "Heatmap",
                icon: "map-outline" as const,
                href: "/pages/heatmap",
              },
              {
                label: "My zones",
                icon: "layers-outline" as const,
                href: "/pages/zones",
              },
              {
                label: "Shared",
                icon: "people-outline" as const,
                href: "/pages/accounts",
              },
              {
                label: "Device",
                icon: "hardware-chip-outline" as const,
                href: "/pages/device",
              },
              {
                label: "Thresholds",
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
                      ? "rgba(230,100,31,0.16)"
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
                            ? "rgba(245,162,32,0.18)"
                            : "rgba(245,162,32,0.18)"
                          : usingGrid
                            ? "rgba(245,162,32,0.12)"
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
                    My zones
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
                      {zones.length} active Â· {isActive ? "online" : "standby"}
                    </Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => router.push("/pages/zones")}
                  style={[
                    st.manageButton,
                    {
                      backgroundColor: c.accentSoft,
                    },
                  ]}
                >
                  <Text
                    style={[
                      st.manageText,
                      {
                        color: c.orange,
                      },
                    ]}
                  >
                    Manage
                  </Text>
                  <Ionicons
                    name="arrow-forward"
                    size={scale(13)}
                    color={c.orange}
                  />
                </Pressable>
              </View>
              {zones.length === 0 && (
                <Text style={[st.zoneEmpty, { color: c.muted }]}>
                  No zones yet
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
                          backgroundColor: c.surface,
                          borderColor: live
                            ? mode === "dark"
                              ? activeOrange
                              : activeOrangeDark
                            : c.line,
                        },
                      ]}
                    >
                      <LinearGradient
                        colors={
                          live
                            ? mode === "dark"
                              ? [
                                  "rgba(249,115,22,0.16)",
                                  "rgba(249,115,22,0.02)",
                                ]
                              : [
                                  "rgba(245,162,32,0.14)",
                                  "rgba(245,162,32,0.02)",
                                ]
                            : mode === "dark"
                              ? [
                                  "rgba(255,255,255,0.025)",
                                  "rgba(255,255,255,0)",
                                ]
                              : [
                                  "rgba(148,163,184,0.06)",
                                  "rgba(148,163,184,0)",
                                ]
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
                            colors={[BRAND_ORANGE, BRAND_ORANGE_DARK]}
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
                            style={[st.zoneName, { color: c.text }]}
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
                                { color: c.muted },
                              ]}
                              numberOfLines={1}
                            >
                              {z.detail}
                            </Text>
                            <View
                              style={[
                                st.zoneState,
                                {
                                  backgroundColor:
                                    mode === "dark"
                                      ? "rgba(249,115,22,0.12)"
                                      : "rgba(245,162,32,0.08)",
                                },
                              ]}
                            >
                              <View
                                style={[
                                  st.zoneStateDot,
                                  {
                                    backgroundColor: live
                                      ? mode === "dark"
                                        ? activeOrange
                                        : activeOrangeDark
                                      : c.muted,
                                  },
                                ]}
                              />
                              <Text
                                style={[
                                  st.zoneStateText,
                                  {
                                    color: live
                                      ? mode === "dark"
                                        ? activeOrange
                                        : activeOrangeDark
                                      : c.muted,
                                  },
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
                            onToggle={() => onZoneToggle(z.id)}
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
              title="Most walked-on tiles"
              link="Full heatmap"
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
                    Gate pathway · live tile heat
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
                      : "Brighter orange = more foot traffic"}
                  </Text>
                </View>
                <View
                  style={[
                    st.stepsPill,
                    isActive
                      ? {
                          backgroundColor: activeAccentSoft,
                          borderColor: usingGrid
                            ? "rgba(230,100,31,0.4)"
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
                          ? "rgba(230,100,31,0.35)"
                          : accent(0.35),
                        backgroundColor: usingGrid
                          ? "rgba(245,162,32,0.1)"
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
                          ? "BRAND_ORANGE_DARK"
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
                  {isActive ? `+${dynamicKwhHarvested} kWh` : "-- kWh"}
                </Text>
              </View>

              <HeatmapTileGrid
                tiles={isActive ? heatmapTiles : []}
                totalCount={isActive ? installedTileCount : 0}
                compact
                selectedTileId={
                  activeTile === null || activeTile >= heatTiles.length
                    ? null
                    : activeTile + 1
                }
                onSelectTile={
                  isActive && tileSetupLoaded
                    ? (id) =>
                        setActiveTile((current) =>
                          current === id - 1 ? null : id - 1,
                        )
                    : undefined
                }
                emptyLabel={
                  !isActive
                    ? "No device connected."
                    : tileSetupLoaded
                    ? "No tiles configured. Complete Device Setup to view the heatmap."
                    : "Loading installed tile setup..."
                }
              />

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
                        { backgroundColor: getHeatmapTileColor(v) },
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

              {activeTile !== null &&
                isActive &&
                activeTile < heatTiles.length && (
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
                  tile #{activeTile + 1} â€”{" "}
                  {Math.round(heatTiles[activeTile] * 480)} crossings today
                </Text>
              )}
            </Card>
          </EnterView>
        </TourSpot>

  </>
); }
