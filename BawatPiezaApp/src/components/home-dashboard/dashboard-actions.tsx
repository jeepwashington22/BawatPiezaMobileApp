import React, { useEffect, useRef } from "react";
import { Animated, Pressable, ScrollView, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "../app-text";
import { scale } from "../glass-ui";
import { TourSpot } from "../app-tour-overlay";
import { Mode, ThemeColors, fonts } from "../../theme";
import { st } from "./home-styles";
import { useRouter, type Href } from "expo-router";
import type { SiteSpec } from "./room-kind";

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
  Grid: { icon: "flash", color: "#F97316", tint: "rgba(249,115,22,0.12)" },
  Solar: { icon: "sunny", color: "#B45309", tint: "rgba(245,158,11,0.16)" },
};

function ZoneSwitch({
  on,
  mode,
  onToggle,
  gridActive = false,
  disabled = false,
}: {
  on: boolean;
  mode: Mode;
  onToggle: () => void;
  gridActive?: boolean;
  disabled?: boolean;
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
      disabled={disabled}
      onPress={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      hitSlop={8}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, disabled }}
    >
      <Animated.View
        style={{
          width: W,
          height: H,
          borderRadius: H / 2,
          backgroundColor: trackColor,
          opacity: disabled ? 0.55 : 1,
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

export type DashboardZone = {
  id: string;
  name: string;
  source: string;
  detail: string;
  on: boolean;
  channel?: number;
  site?: SiteSpec;
};

type Props = {
  c: ThemeColors;
  mode: Mode;
  smokeDetected: boolean;
  smokeZone: string;
  usingGrid: boolean;
  activeOrange: string;
  activeOrangeDark: string;
  activeAccent: string;
  gridActive: boolean;
  isActive: boolean;
  router: ReturnType<typeof useRouter>;
  zones: DashboardZone[];
  onZoneToggle: (zoneId: string) => void;
};

export function DashboardActions({
  c,
  mode,
  smokeDetected,
  smokeZone,
  usingGrid,
  activeOrange,
  activeOrangeDark,
  activeAccent,
  gridActive,
  isActive,
  router,
  zones,
  onZoneToggle,
}: Props) {
  return (
    <>
      {smokeDetected && (
        <View
          style={{
            marginHorizontal: scale(16),
            marginBottom: scale(12),
            borderRadius: scale(14),
            padding: scale(14),
            backgroundColor: "#7F1D1D",
            flexDirection: "row",
            alignItems: "center",
            gap: scale(10),
          }}
        >
          <Ionicons name="warning" size={scale(22)} color="#FFFFFF" />
          <View style={{ flex: 1 }}>
            <Text style={{ color: "#FFFFFF", fontFamily: fonts.extrabold }}>
              Smoke detected — device shut down
            </Text>
            <Text style={{ color: "rgba(255,255,255,0.82)", marginTop: 2 }}>
              {smokeZone || "Check the device enclosure physically"} before restoring power.
            </Text>
          </View>
        </View>
      )}
      <View style={st.quickActionsSection}>
        <Text style={[st.quickActionsTitle, { color: c.text }]}>
          QUICK ACTIONS
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={st.quickActions}
        >
          {[
            {
              label: "Allocation",
              sub: "Manage schedule",
              icon: "flash-outline" as const,
              href: "/pages/power-management?tab=allocation" as Href,
            },
            {
              label: "Heatmap",
              sub: "Tile activity",
              icon: "map-outline" as const,
              href: "/pages/heatmap",
            },
            {
              label: "My zones",
              sub: "Connected rooms",
              icon: "layers-outline" as const,
              href: "/pages/zones",
            },
            {
              label: "Shared",
              sub: "Shared access",
              icon: "people-outline" as const,
              href: "/pages/accounts",
            },
            {
              label: "Device",
              sub: "Device status",
              icon: "hardware-chip-outline" as const,
              href: "/pages/device",
            },
            {
              label: "Thresholds",
              sub: "Power limits",
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
                  backgroundColor: c.surface,
                  borderColor: c.line,
                },
                pressed && st.quickActionPressed,
              ]}
            >
              <View
                style={[
                  st.quickActionIcon,
                  {
                    backgroundColor: c.accentSoft,
                  },
                ]}
              >
                <Ionicons
                  name={action.icon}
                  size={scale(16)}
                  color={c.accent}
                />
              </View>
              <View style={st.quickActionText}>
                <Text
                  style={[st.quickActionLabel, { color: c.text }]}
                  numberOfLines={1}
                >
                  {action.label}
                </Text>
                <Text
                  style={[st.quickActionSub, { color: c.muted }]}
                  numberOfLines={1}
                >
                  {action.sub}
                </Text>
              </View>
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
                <Text style={[st.zonesTitle, { color: c.text }]}>My zones</Text>
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
                            ? ["rgba(249,115,22,0.16)", "rgba(249,115,22,0.02)"]
                            : ["rgba(245,162,32,0.14)", "rgba(245,162,32,0.02)"]
                          : mode === "dark"
                            ? ["rgba(255,255,255,0.025)", "rgba(255,255,255,0)"]
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
                              style={[st.zoneSourceText, { color: src.color }]}
                            >
                              {z.source}
                            </Text>
                          </View>
                          <Text
                            style={[st.zoneDetail, { color: c.muted }]}
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
                          disabled={smokeDetected}
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
    </>
  );
}