import React from "react";
import { Animated, Pressable, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "../../../components/app-text";
import { Glass, Card, LiveDot, scale } from "../../../components/glass-ui";
import { CountUpText } from "../../../components/count-up-text";
import { TourSpot } from "../../../components/app-tour-overlay";
import Svg, { Defs, LinearGradient as SvgGradient, Line, Path, Stop } from "react-native-svg";
import { Mode, ThemeColors, fonts } from "../../../theme";
import { st } from "./home-styles";

const BRAND_ORANGE_DARK = "#E6641F";
const AnimatedPath = Animated.createAnimatedComponent(Path);

function EnterView({ delay, style, children }: { delay?: number; style?: object; children: React.ReactNode }) { return <View style={style}>{children}</View>; }
export type ConsumptionRange = "today" | "7days" | "month";
export type ConsumptionEntry = { label: string; kwh: number; comparison: string; delta: string; savings: string; deltaLabel: string };
export type Stat = { label: string; value: number | string; decimals?: number; unit: string };
type Props = { c: ThemeColors; mode: Mode; usingGrid: boolean; isActive: boolean; isSharedUser: boolean; activeAccent: string; activeOrangeDark: string; batteryPct: number | null; displayVoltage: string; mqttStatus: "Connecting..." | "Live" | "Offline"; batteryCardInk: string; batteryCardMutedInk: string; statsPop: Animated.Value; graphProgress: Animated.Value; greeting: string; metadataName: string; consumptionRange: ConsumptionRange; consumptionData: Record<ConsumptionRange, ConsumptionEntry>; selectedConsumption: ConsumptionEntry; setConsumptionRange: (range: ConsumptionRange) => void; rangeMenuOpen: boolean; setRangeMenuOpen: React.Dispatch<React.SetStateAction<boolean>>; stats: Stat[]; openOverrides: () => void; };
export function DashboardStats({ c, mode, usingGrid, isActive, isSharedUser, activeAccent, activeOrangeDark, batteryPct, displayVoltage, mqttStatus, batteryCardInk, batteryCardMutedInk, statsPop, graphProgress, greeting, metadataName, consumptionRange, consumptionData, selectedConsumption, setConsumptionRange, rangeMenuOpen, setRangeMenuOpen, stats, openOverrides }: Props) { return (
  <>
        <EnterView delay={90} style={st.statsSection}>
          <View style={st.greetingRow}>
            <View style={st.greeting}>
              {isSharedUser && (
                <Text style={[st.greetingEyebrow, { color: c.orange }]}>
                  Shared user
                </Text>
              )}
              <Text style={[st.greetingEyebrow, { color: c.muted }]}>
                Welcome back
              </Text>
              <Text style={[st.greetingTitle, { color: c.text }]}>
                {greeting}, {metadataName || "There"}
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
                    ? ["#F5A220", "#E6641F"]
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
                          { color: BRAND_ORANGE_DARK },
                        ]}
                      >
                        {isActive ? selectedConsumption.savings                         : "-- Savings"}
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
                          ? "Battery health"
                          : selectedConsumption.deltaLabel}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={st.scTiles}>
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
                  {
                    borderColor: usingGrid ? "#16A34A" : c.orange,
                  },
                  { shadowColor: BRAND_ORANGE_DARK },
                ]}
              >
                <View
                  pointerEvents="none"
                  style={[
                    st.batteryCardAccent,
                    { backgroundColor: c.orange },
                  ]}
                />
                <View style={st.batteryCardHeader}>
                  <View style={st.batteryCardIdentity}>
                    <View
                      style={[
                        st.batteryCardIcon,
                        {
                          backgroundColor:
                            mode === "dark"
                              ? "rgba(245,162,32,0.18)"
                              : "rgba(245,162,32,0.12)",
                        },
                      ]}
                    >
                      <Ionicons
                        name={usingGrid ? "flash" : "battery-charging"}
                        size={scale(21)}
                        color={batteryCardInk}
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
                        {usingGrid
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
                  {!usingGrid && (
                    <View style={st.batteryCardIndicator}>
                      <Text
                        style={[
                          st.batteryCardLevelLabel,
                          { color: activeAccent },
                        ]}
                      >
                        Charge level
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
                      Using Grid — Battery on Standby
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
                    ? "Normally open logic: grid is active by default. Tap to change."
                    : batteryPct !== null
                      ? `live telemetry: 4s lifepo4 bank detected at ${batteryPct.toFixed(1)}% (${displayVoltage}v)`
                      : "Awaiting hardware telemetry to detect battery..."}
                </Text>
                {!usingGrid && (
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
                      ? c.accentSoft
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
  </>
); }
