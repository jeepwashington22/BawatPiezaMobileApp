import React from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "../app-text";
import { Card, LiveDot, scale } from "../glass-ui";
import { CountUpText } from "../count-up-text";
import { TourSpot } from "../app-tour-overlay";
import { TileLoader } from "../tile-loader";
import { getHeatmapTileColor } from "../heatmap-tile-grid";
import { TileHeatScene } from "./tile-heat-scene-adaptive";
import type { DashboardZone } from "./dashboard-actions";
import Svg, {
  Defs,
  LinearGradient as SvgGradient,
  Line,
  Path,
  Stop,
} from "react-native-svg";
import { Mode, ThemeColors, fonts } from "../../theme";
import type { PowerOverride } from "../../hooks/use-power-override";
import {
  useDashboardWeather,
  type LocatedDashboardWeatherReport,
} from "../../hooks/use-dashboard-weather";
import { skyLabel, type SkyKind } from "../../lib/weather";
import { WeatherSky } from "./weather-sky";
import { st } from "./home-styles";

const BRAND_ORANGE_DARK = "#E6641F";
const AnimatedPath = Animated.createAnimatedComponent(Path);

function formatWeatherDate(date: string): string {
  const match = date.match(/^\d{4}-(\d{2})-(\d{2})$/);
  if (!match) return "Today";
  const month = Number(match[1]);
  const day = Number(match[2]);
  const monthName = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ][month - 1];
  return monthName ? `Today · ${monthName} ${day}` : "Today";
}

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

const SKY_OPTIONS: { kind: SkyKind; icon: IoniconName }[] = [
  { kind: "sunny", icon: "sunny-outline" },
  { kind: "rainy", icon: "rainy-outline" },
  { kind: "breezy", icon: "leaf-outline" },
];

function skyIcon(sky: SkyKind, isDay: boolean): IoniconName {
  if (sky === "rainy") return "rainy-outline";
  if (sky === "breezy") return "leaf-outline";
  return isDay ? "sunny-outline" : "moon-outline";
}

function WeatherWidget({
  weather,
  c,
  skyPreview,
  onSkyPreviewChange,
}: {
  weather:
    | { status: "loading"; refresh: () => Promise<void> }
    | {
        status: "ready";
        report: LocatedDashboardWeatherReport;
        refresh: () => Promise<void>;
      }
    | { status: "error"; message: string; refresh: () => Promise<void> };
  c: ThemeColors;
  skyPreview: SkyKind | null;
  onSkyPreviewChange: (sky: SkyKind | null) => void;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const report = weather.status === "ready" ? weather.report : null;
  const activeSky: SkyKind | null = skyPreview ?? report?.sky ?? null;

  const renderChip = (
    key: string,
    label: string,
    icon: IoniconName,
    selected: boolean,
    onPress: () => void,
  ) => (
    <Pressable
      key={key}
      onPress={onPress}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={`${label} sky`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: scale(3),
        paddingHorizontal: scale(7),
        paddingVertical: scale(4),
        borderRadius: scale(10),
        borderWidth: 1,
        borderColor: selected ? c.orange : c.line,
        backgroundColor: selected ? c.orange : "transparent",
      }}
    >
      <Ionicons
        name={icon}
        size={scale(11)}
        color={selected ? "#FFFFFF" : c.muted}
      />
      <Text
        style={{
          color: selected ? "#FFFFFF" : c.text,
          fontSize: scale(9),
          fontWeight: "600",
        }}
      >
        {label}
      </Text>
    </Pressable>
  );

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: "42%",
        height: scale(38),
        zIndex: 20,
      }}
    >
      <Pressable
        onPress={() => setIsOpen((open) => !open)}
        style={{
          position: "absolute",
          left: scale(4),
          top: 0,
          width: scale(38),
          height: scale(38),
          borderRadius: scale(19),
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 1,
          borderColor: skyPreview ? c.orange : c.line,
          backgroundColor: c.surface,
          shadowColor: "#000000",
          shadowOpacity: 0.16,
          shadowRadius: scale(6),
          shadowOffset: { width: 0, height: 2 },
          elevation: 5,
        }}
        accessibilityRole="button"
        accessibilityLabel="Toggle today's weather"
        accessibilityState={{ expanded: isOpen }}
      >
        {weather.status === "loading" ? (
          <ActivityIndicator size="small" color={c.orange} />
        ) : (
          <Ionicons
            name={
              weather.status === "error" || !activeSky
                ? "location-outline"
                : skyIcon(activeSky, report?.isDay ?? true)
            }
            size={scale(20)}
            color={c.orange}
          />
        )}
      </Pressable>
      {isOpen ? (
        <View
          style={{
            position: "absolute",
            left: scale(46),
            right: scale(4),
            top: -scale(22),
            paddingHorizontal: scale(10),
            paddingVertical: scale(9),
            borderRadius: scale(12),
            borderWidth: 1,
            borderColor: c.line,
            backgroundColor: c.surface,
            shadowColor: "#000000",
            shadowOpacity: 0.18,
            shadowRadius: scale(8),
            shadowOffset: { width: 0, height: 3 },
            elevation: 7,
          }}
          accessibilityLabel="Today's local weather forecast"
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: scale(6),
            }}
          >
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                numberOfLines={1}
                style={{ color: c.text, fontSize: scale(10), fontWeight: "700" }}
              >
                {report ? report.locationLabel : "Finding your location…"}
              </Text>
              <Text
                numberOfLines={1}
                style={{ color: c.muted, fontSize: scale(8), marginTop: scale(1) }}
              >
                {report
                  ? `${formatWeatherDate(report.date)} · ${report.currentCondition}`
                  : "Today's weather"}
              </Text>
            </View>
            <Pressable
              onPress={() => void weather.refresh()}
              hitSlop={6}
              disabled={weather.status === "loading"}
              accessibilityRole="button"
              accessibilityLabel={
                weather.status === "error"
                  ? "Retry weather forecast"
                  : "Refresh weather forecast"
              }
            >
              <Ionicons name="refresh" size={scale(14)} color={c.orange} />
            </Pressable>
          </View>
          {report ? (
            <>
              <Text
                style={{ color: c.muted, fontSize: scale(9), marginTop: scale(3) }}
              >
                {Math.round(report.currentTemperatureC)}°C now · Low{" "}
                {Math.round(report.minimumTemperatureC)}° / High{" "}
                {Math.round(report.maximumTemperatureC)}°
              </Text>
              <Text
                style={{ color: c.muted, fontSize: scale(9), marginTop: scale(2) }}
              >
                Today: {report.forecastCondition} ·{" "}
                {report.precipitationProbability}% rain chance · Wind{" "}
                {Math.round(report.windSpeedKmh)} km/h
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: scale(5),
                  marginTop: scale(8),
                }}
              >
                {renderChip(
                  "live",
                  "Live",
                  "locate-outline",
                  skyPreview === null,
                  () => onSkyPreviewChange(null),
                )}
                {SKY_OPTIONS.map(({ kind, icon }) =>
                  renderChip(
                    kind,
                    skyLabel(kind),
                    icon,
                    skyPreview === kind,
                    () => onSkyPreviewChange(skyPreview === kind ? null : kind),
                  ),
                )}
              </View>
              <Text
                style={{ color: c.muted, fontSize: scale(8), marginTop: scale(5) }}
              >
                {skyPreview
                  ? `Previewing a ${skyLabel(skyPreview).toLowerCase()} sky. Tap Live to return to the forecast.`
                  : `Showing today's forecast: ${skyLabel(report.sky).toLowerCase()}. Tap a sky to preview it.`}
              </Text>
            </>
          ) : (
            <Text
              style={{ color: c.muted, fontSize: scale(9), marginTop: scale(3) }}
            >
              {weather.status === "loading"
                ? "Loading local forecast…"
                : weather.status === "error"
                  ? weather.message
                  : ""}
            </Text>
          )}
          {report ? (
            <Pressable
              onPress={() => {
                void Linking.openURL("https://open-meteo.com/en/licence").catch(
                  (error) =>
                    console.warn(
                      "[dashboard] Could not open weather data attribution",
                      error,
                    ),
                );
              }}
              accessibilityRole="link"
              accessibilityLabel="Weather data attribution and CC BY 4.0 license"
              hitSlop={4}
            >
              <Text
                style={{
                  color: c.muted,
                  fontSize: scale(8),
                  marginTop: scale(3),
                  textDecorationLine: "underline",
                }}
              >
                Weather by Open-Meteo · CC BY 4.0
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
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
export type ConsumptionRange = "today" | "7days" | "month";
export type ConsumptionEntry = {
  label: string;
  kwh: number;
  comparison: string;
  delta: string;
  detail: string;
  deltaLabel: string;
};
export type Stat = {
  label: string;
  value: number | string;
  decimals?: number;
  unit: string;
};
type Props = {
  c: ThemeColors;
  mode: Mode;
  usingGrid: boolean;
  powerMode: PowerOverride;
  isActive: boolean;
  isLoading: boolean;
  activeAccent: string;
  activeOrangeDark: string;
  batteryPct: number | null;
  displayVoltage: string;
  gridVoltage: number | null;
  gridCurrent: number | null;
  gridPower: number | null;
  gridEnergyKwh: number | null;
  mqttStatus: "Connecting..." | "Live" | "Offline";
  batteryCardInk: string;
  batteryCardMutedInk: string;
  statsPop: Animated.Value;
  graphProgress: Animated.Value;
  consumptionRange: ConsumptionRange;
  consumptionData: Record<ConsumptionRange, ConsumptionEntry>;
  selectedConsumption: ConsumptionEntry;
  generationTrend: number[];
  setConsumptionRange: (range: ConsumptionRange) => void;
  rangeMenuOpen: boolean;
  setRangeMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  stats: Stat[];
  openOverrides: () => void;
  installedTileCount?: number;
  footsteps?: number;
  activeTile?: number | null;
  onOpenHeatmap?: () => void;
  zones?: DashboardZone[];
  onZoneToggle?: (zoneId: string) => void;
  smokeDetected?: boolean;
};
export function DashboardStats({
  c,
  mode,
  usingGrid,
  powerMode,
  isActive,
  isLoading,
  activeAccent,
  activeOrangeDark,
  batteryPct,
  displayVoltage,
  gridVoltage,
  gridCurrent,
  gridPower,
  gridEnergyKwh,
  mqttStatus,
  batteryCardInk,
  batteryCardMutedInk,
  statsPop,
  graphProgress,
  consumptionRange,
  consumptionData,
  selectedConsumption,
  generationTrend,
  setConsumptionRange,
  rangeMenuOpen,
  setRangeMenuOpen,
  stats,
  openOverrides,
  installedTileCount = 0,
  footsteps = 0,
  activeTile = null,
  onOpenHeatmap,
  zones = [],
  onZoneToggle,
  smokeDetected = false,
}: Props) {
  const weather = useDashboardWeather();
  // null = follow the live forecast; otherwise the sky the user is previewing
  const [skyPreview, setSkyPreview] = React.useState<SkyKind | null>(null);
  const liveReport = weather.status === "ready" ? weather.report : null;
  const activeSky = skyPreview ?? liveReport?.sky ?? null;
  // stable callback so the memoised 3D scene is not re-rendered on every packet
  const zonesRef = React.useRef(zones);
  zonesRef.current = zones;
  const zoneToggleRef = React.useRef(onZoneToggle);
  zoneToggleRef.current = onZoneToggle;
  const onToggleRoom = React.useCallback((index: number) => {
    const zone = zonesRef.current[index];
    if (zone) zoneToggleRef.current?.(zone.id);
  }, []);
  const maxGeneration = Math.max(...generationTrend, 0);
  const generationPoints = generationTrend.map((value, index) => {
    const x =
      generationTrend.length > 1
        ? (index * 320) / (generationTrend.length - 1)
        : 160;
    const y = maxGeneration > 0 ? 70 - (value / maxGeneration) * 60 : 70;
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
  });
  const generationLine = generationPoints.length
    ? generationPoints.join(" ")
    : "M0 70 L320 70";
  const generationArea = `${generationLine} L320 78 L0 78 Z`;
  const isShutdown = powerMode === "shutdown";
  const isBatteryMode = powerMode === "battery";
  const activeModeColor = isShutdown
    ? c.danger
    : usingGrid
      ? c.gridGreen
      : c.orange;
  const activeModeTint = `${activeModeColor}14`;
  return (
    <>
      <EnterView delay={90} style={st.statsSection}>
        <TourSpot id="live-stats">
          <Animated.View
            style={[
              st.statsPop,
              {
                backgroundColor: c.surface,
                borderColor: c.line,
                borderWidth: 1,
                borderRadius: scale(16),
                padding: scale(12),
                shadowColor: "#0A2A4A",
                shadowOpacity: mode === "dark" ? 0.18 : 0.06,
                shadowRadius: scale(10),
                shadowOffset: { width: 0, height: 3 },
                elevation: 2,
              },
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
            {isLoading ? (
              <TileLoader label="Loading dashboard data..." size="sm" />
            ) : (
              <>
                <View style={st.hsLegendRow}>
                  <View style={st.hsLegendLeft}>
                    <Text style={[st.hsLegendText, { color: c.muted }]}>
                      less
                    </Text>
                    <View
                      style={[st.hsLegendSwatches, !isActive && { opacity: 0.4 }]}
                    >
                      {[0.1, 0.35, 0.6, 0.82, 0.98].map((v, i) => (
                        <View
                          key={i}
                          style={[
                            st.hsLegendSwatch,
                            { backgroundColor: getHeatmapTileColor(v) },
                          ]}
                        />
                      ))}
                    </View>
                    <Text style={[st.hsLegendText, { color: c.muted }]}>
                      more
                    </Text>
                  </View>
                  <Pressable
                    onPress={onOpenHeatmap}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Full heatmap"
                    style={st.hsLink}
                  >
                    <Text style={[st.hsLinkText, { color: activeOrangeDark }]}>
                      Full heatmap
                    </Text>
                    <Ionicons
                      name="chevron-forward"
                      size={scale(11)}
                      color={activeOrangeDark}
                    />
                  </Pressable>
                </View>

                <View style={{ position: "relative" }}>
                  <TileHeatScene
                    mode={mode}
                    isActive={isActive}
                    installedTileCount={installedTileCount}
                    footsteps={footsteps}
                    batteryPct={batteryPct}
                    activeTile={activeTile}
                    bulbs={zones.map((zone) => isActive && zone.on)}
                    roomNames={zones.map((zone) => zone.name)}
                    roomKinds={zones.map((zone) => zone.site?.kind)}
                    powerMode={powerMode}
                    gridVoltage={gridVoltage}
                    gridPower={gridPower}
                    onToggleRoom={onToggleRoom}
                    roomSwitchDisabled={smokeDetected}
                  />
                  {/* light, see-through weather over the scene; touches pass through */}
                  <WeatherSky
                    sky={activeSky}
                    dark={mode === "dark"}
                    isDay={liveReport?.isDay ?? true}
                    cloudCoverPct={liveReport?.cloudCoverPct ?? 0}
                    windSpeedKmh={
                      skyPreview === "breezy"
                        ? Math.max(liveReport?.windSpeedKmh ?? 0, 28)
                        : (liveReport?.windSpeedKmh ?? 0)
                    }
                    rainChancePct={
                      skyPreview === "rainy"
                        ? Math.max(liveReport?.precipitationProbability ?? 0, 70)
                        : (liveReport?.precipitationProbability ?? 60)
                    }
                    stormy={
                      activeSky === "rainy" && (liveReport?.isThunderstorm ?? false)
                    }
                  />
                  <WeatherWidget
                    weather={weather}
                    c={c}
                    skyPreview={skyPreview}
                    onSkyPreviewChange={setSkyPreview}
                  />
                </View>

                <View style={st.hsTop}>
                  <View style={st.hsTopData}>
                    <Text style={[st.hsEyebrow, { color: c.text }]}>
                      {selectedConsumption.label}&apos;s generation
                    </Text>
                    <View style={st.hsKwhRow}>
                      <Text style={[st.hsKwh, { color: c.text }]}>
                        {isActive ? selectedConsumption.kwh.toFixed(4) : "--"}
                      </Text>
                      <Text style={[st.hsKwhUnit, { color: c.text }]}>kWh</Text>
                    </View>
                  </View>
                  {isBatteryMode && (
                    <View style={[st.hsBattery, !isActive && { opacity: 0.5 }]}>
                      <Ionicons
                        name="battery-charging"
                        size={scale(14)}
                        color={c.muted}
                      />
                      <View>
                        <Text style={[st.hsBatteryValue, { color: c.text }]}>
                          {batteryPct !== null
                            ? `${Math.floor(batteryPct)}%`
                            : "--%"}
                        </Text>
                        <Text style={[st.hsBatteryLabel, { color: c.muted }]}>
                          Battery charge
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                <View style={[st.hsTiles, { borderTopColor: c.line }]}>
                  {stats.map((s, i) => {
                    const icon = (
                      {
                        Voltage: "flash",
                        Power: "speedometer",
                        Footsteps: "footsteps",
                      } as const
                    )[s.label as "Voltage" | "Power" | "Footsteps"];
                    return (
                      <View
                        key={s.label}
                        style={[
                          st.hsTile,
                          i > 0 && [
                            st.hsTileDivider,
                            { borderLeftColor: c.line },
                          ],
                        ]}
                      >
                        <Ionicons
                          name={icon}
                          size={scale(16)}
                          color={c.muted}
                        />
                        <View style={st.hsTileValueRow}>
                          <Text
                            style={[st.hsTileValue, { color: c.text }]}
                            numberOfLines={1}
                          >
                            {s.value}
                          </Text>
                          <Text style={[st.hsTileUnit, { color: c.muted }]}>
                            {s.unit}
                          </Text>
                        </View>
                        <Text style={[st.hsTileLabel, { color: c.muted }]}>
                          {s.label}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </>
            )}
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
            <Card
              mode={mode}
              style={[
                st.batteryCard,
                {
                  backgroundColor: activeModeTint,
                  borderColor: activeModeColor,
                  borderWidth: StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={st.batteryCardHeader}>
                <View style={st.batteryCardIdentity}>
                  <View
                    style={[
                      st.batteryCardIcon,
                      { backgroundColor: c.accentSoft },
                    ]}
                  >
                    <Ionicons
                      name={
                        isShutdown
                          ? "power"
                          : usingGrid
                            ? "flash"
                            : "battery-charging"
                      }
                      size={scale(21)}
                      color={isShutdown ? "#DC2626" : c.accent}
                    />
                  </View>
                  <View>
                    <Text
                      style={[
                        st.batteryCardEyebrow,
                        {
                          color: batteryCardMutedInk,
                        },
                      ]}
                    >
                      {isShutdown
                        ? "SYSTEM SHUTDOWN"
                        : usingGrid
                          ? "CURRENTLY USING GRID"
                          : "CURRENTLY USING BATTERY"}
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
                            ? BRAND_ORANGE_DARK
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
                <View style={st.batteryCardIndicator}>
                  {isBatteryMode && (
                    <>
                      <Text
                        style={[
                          st.batteryCardLevelLabel,
                          { color: c.accent },
                        ]}
                      >
                        Battery charge
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
                          { backgroundColor: c.accentSoft },
                        ]}
                      >
                        <View
                          style={[
                            st.batteryCardFill,
                            {
                              width: `${batteryPct !== null ? Math.min(100, Math.max(0, batteryPct)) : 0}%`,
                              backgroundColor: c.accent,
                            },
                          ]}
                        />
                      </View>
                    </>
                  )}
                  <Text
                    style={{
                      color: batteryCardMutedInk,
                      fontSize: scale(8),
                      fontFamily: fonts.medium,
                      marginTop: scale(3),
                      textAlign: "right",
                    }}
                  >
                    {displayVoltage === "--" ? "-- V" : `${displayVoltage} V`}
                  </Text>
                </View>
              </View>
              {usingGrid && (
                <View style={st.batteryGridBanner}>
                  <Ionicons name="flash" size={scale(12)} color="#FFFFFF" />
                  <Text style={st.batteryGridBannerText}>
                    Using Grid — Battery on Standby
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={scale(12)}
                    color="#FFFFFF"
                  />
                </View>
              )}
              {isShutdown && (
                <View
                  style={[st.batteryGridBanner, { backgroundColor: "#DC2626" }]}
                  accessibilityRole="text"
                  accessibilityLabel="Device power outputs are shut down"
                >
                  <Ionicons name="power" size={scale(12)} color="#FFFFFF" />
                  <Text style={st.batteryGridBannerText}>
                    Shutdown — Grid and Battery Outputs Off
                  </Text>
                </View>
              )}
              <Text
                style={[
                  st.batteryCardDescription,
                  {
                    color: isShutdown
                      ? "#DC2626"
                      : usingGrid
                        ? c.muted
                        : batteryCardMutedInk,
                  },
                ]}
              >
                {isShutdown
                  ? "Power outputs are disabled. Tap to choose Grid or Battery."
                  : usingGrid
                    ? "Normally open logic: grid is active by default. Tap to change."
                    : batteryPct !== null
                      ? `live telemetry: 4s lifepo4 bank detected at ${batteryPct.toFixed(1)}% (${displayVoltage}v)`
                      : "Awaiting hardware telemetry to detect battery..."}
              </Text>
              {!usingGrid && !isShutdown && (
                <View style={st.batteryCardTapHint}>
                  <Text
                    style={[
                      st.batteryCardTapText,
                      { color: batteryCardMutedInk },
                    ]}
                  >
                    Tap to open quick overrides
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={scale(11)}
                    color={batteryCardMutedInk}
                  />
                </View>
              )}
            </Card>
          </Pressable>
        </EnterView>
      </TourSpot>

      <EnterView delay={150} style={st.dashboardCard}>
        <View style={st.sectionTitleRow}>
          <Ionicons name="speedometer" size={scale(15)} color={activeAccent} />
          <Text style={[st.sectionTitle, { color: c.text }]}>
            live grid consumption
          </Text>
        </View>
        {/* No card: four readings on the page itself, separated by hairlines. */}
        <View
          style={{
            borderColor: c.line,
            borderWidth: 1,
            borderRadius: scale(16),
            overflow: "hidden",
            paddingHorizontal: scale(10),
            backgroundColor: c.surface,
          }}
        >
          {[
            [
              {
                label: "Voltage",
                value: gridVoltage === null ? "--" : gridVoltage.toFixed(1),
                unit: "V",
                icon: "flash-outline" as const,
              },
              {
                label: "Current",
                value: gridCurrent === null ? "--" : gridCurrent.toFixed(3),
                unit: "A",
                icon: "pulse-outline" as const,
              },
            ],
            [
              {
                label: "Power",
                value: gridPower === null ? "--" : gridPower.toFixed(1),
                unit: "W",
                icon: "speedometer-outline" as const,
              },
              {
                label: "Energy",
                value:
                  gridEnergyKwh === null ? "--" : gridEnergyKwh.toFixed(3),
                unit: "kWh",
                icon: "analytics-outline" as const,
              },
            ],
          ].map((pair, rowIndex) => (
            <View
              key={rowIndex}
              style={[
                { flexDirection: "row" },
                rowIndex > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: c.line,
                },
              ]}
            >
              {pair.map((metric, colIndex) => (
                <View
                  key={metric.label}
                  style={[
                    {
                      flex: 1,
                      paddingVertical: scale(13),
                      paddingLeft: colIndex === 0 ? scale(2) : scale(16),
                      paddingRight: scale(8),
                    },
                    colIndex > 0 && {
                      borderLeftWidth: StyleSheet.hairlineWidth,
                      borderLeftColor: c.line,
                    },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: scale(5),
                    }}
                  >
                    <Ionicons
                      name={metric.icon}
                      size={scale(12)}
                      color={activeAccent}
                    />
                    <Text
                      style={{
                        color: c.muted,
                        fontSize: scale(8.5),
                        fontFamily: fonts.semibold,
                      }}
                    >
                      {metric.label}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "baseline",
                      gap: scale(4),
                      marginTop: scale(6),
                    }}
                  >
                    <Text
                      numberOfLines={1}
                      style={{
                        color: c.text,
                        fontSize: scale(21),
                        fontFamily: fonts.extrabold,
                        flexShrink: 1,
                      }}
                    >
                      {metric.value}
                    </Text>
                    <Text
                      style={{
                        color: c.muted,
                        fontSize: scale(9),
                        fontFamily: fonts.medium,
                      }}
                    >
                      {metric.unit}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: scale(5),
            marginTop: scale(8),
          }}
        >
          {mqttStatus === "Live" && <LiveDot color={BRAND_ORANGE_DARK} />}
          <Text
            style={{
              color: c.muted,
              fontSize: scale(8),
              fontFamily: fonts.medium,
              flex: 1,
            }}
          >
            {mqttStatus === "Live"
              ? "Live PZEM-004T readings · energy is the meter's cumulative kWh"
              : `Waiting for device telemetry · status: ${mqttStatus}`}
          </Text>
        </View>
      </EnterView>

      <EnterView delay={180} style={st.dashboardCard}>
        <View
          style={[
            st.sectionTitleRow,
            { justifyContent: "space-between", zIndex: 10, elevation: 10 },
          ]}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: scale(6) }}>
            <Ionicons name="analytics" size={scale(15)} color={activeAccent} />
            <Text style={[st.sectionTitle, { color: c.text }]}>
              Energy Generation
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
              accessibilityLabel={`generation date range: ${selectedConsumption.label}`}
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
                  Object.keys(
                    consumptionData,
                  ) as (keyof typeof consumptionData)[]
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
                            range === consumptionRange ? activeAccent : c.muted,
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
        <Card
          mode={mode}
          style={[
            st.balanceChartCard,
            {
              backgroundColor: c.surface,
              borderColor: c.line,
              shadowColor: activeAccent,
            },
          ]}
        >
          <View style={st.balanceChartHeader}>
            <View>
              <Text style={[st.balanceChartEyebrow, { color: c.muted }]}>
                Generation Trend
              </Text>
              <View style={st.balanceChartValueRow}>
                <CountUpText
                  value={selectedConsumption.kwh}
                  decimals={4}
                  style={[st.balanceChartValue, { color: c.text }]}
                />
                <Text style={[st.balanceChartValue, { color: c.text }]}>
                  kWh
                </Text>
              </View>
              <Text style={[st.balanceChartPeriod, { color: c.muted }]}>
                {selectedConsumption.label.toLowerCase()} generation
              </Text>
            </View>
            <View
              style={[
                st.balanceChartChange,
                {
                  backgroundColor: usingGrid ? c.accentSoft : c.accentSoft,
                },
              ]}
            >
              <Ionicons
                name={
                  selectedConsumption.delta.startsWith("-")
                    ? "trending-down"
                    : "trending-up"
                }
                size={scale(11)}
                color={activeAccent}
              />
              <Text
                style={[st.balanceChartChangeText, { color: activeAccent }]}
              >
                {selectedConsumption.delta}
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
              <Path d={generationArea} fill="url(#balanceArea)" />
              <AnimatedPath
                d={generationLine}
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
                6 days ago
              </Text>
              <Text style={[st.balanceChartLabel, { color: activeAccent }]}>
                4 days ago
              </Text>
              <Text style={[st.balanceChartLabel, { color: activeAccent }]}>
                2 days ago
              </Text>
              <Text
                style={[
                  st.balanceChartLabel,
                  st.balanceChartLabelEnd,
                  { color: activeAccent },
                ]}
              >
                today
              </Text>
            </View>
          </View>
        </Card>
      </EnterView>
    </>
  );
}