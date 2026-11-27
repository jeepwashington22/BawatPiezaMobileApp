import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { AppText as Text } from "../app-text";
import { Card, scale } from "../glass-ui";
import type { Mode, ThemeColors } from "../../theme";
import { usePowerOverride } from "../../hooks/use-power-override";
import { SectionLabel } from "./shared";

const CELL_COUNT = 4;
const CAPACITY_MAH = 60000;
const GRID_GREEN = "#16A34A";
const BATTERY_ORANGE = "#F97316";

/** Charge colour for the cells: green when healthy, amber, then red when low. */
function levelTone(pct: number | null, fallback: string) {
  if (pct === null) return fallback;
  if (pct >= 60) return "#22C55E";
  if (pct >= 30) return "#F59E0B";
  return "#EF4444";
}

function BatteryCell({
  cellV,
  level,
  tone,
  c,
  dark,
  glow,
}: {
  cellV: string;
  /** 0-100 */
  level: number;
  tone: string;
  c: ThemeColors;
  dark: boolean;
  glow: Animated.Value;
}) {
  const fillHeight = `${level}%` as const;
  const shine = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.15, 0.45],
  });

  return (
    <View style={ui.cellCol}>
      <View style={[ui.cellCap, { backgroundColor: c.orange }]} />
      <View
        style={[
          ui.cellBody,
          {
            backgroundColor: dark ? "#14171D" : "#F4F7FB",
            borderColor: c.orange,
          },
        ]}
      >
        {/* liquid level, rises from the bottom with the state of charge */}
        <View style={ui.fillTrack}>
          <LinearGradient
            colors={[`${tone}33`, `${tone}8C`]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={{ width: "100%", height: fillHeight }}
          >
            <View style={[ui.fillSurface, { backgroundColor: tone }]} />
            <Animated.View
              style={[ui.fillShine, { backgroundColor: tone, opacity: shine }]}
            />
          </LinearGradient>
        </View>

        {/* glossy highlight along the left edge */}
        <View style={ui.cellGloss} pointerEvents="none" />

        <View style={ui.cellContent}>
          <Text style={[ui.cellType, { color: c.orange }]}>s168</Text>
          <View style={ui.cellMiddle}>
            <Text style={[ui.cellVolt, { color: c.text }]}>{cellV}v</Text>
            <Text style={[ui.cellLabel, { color: c.muted }]}>lipo</Text>
          </View>
          <View style={ui.cellMahBadge}>
            <Text style={ui.cellMahText}>60k</Text>
            <Text style={ui.cellMahUnit}>mah</Text>
          </View>
        </View>

        {/* series terminals */}
        <View style={[ui.terminal, ui.terminalLeft]}>
          <Text style={ui.terminalText}>-</Text>
        </View>
        <View style={[ui.terminal, ui.terminalRight]}>
          <Text style={ui.terminalText}>+</Text>
        </View>
      </View>
    </View>
  );
}

export function Monitor({
  c,
  mode,
  batteryPct,
  batteryV,
}: {
  c: ThemeColors;
  mode: Mode;
  batteryPct: number | null;
  batteryV: number | null;
}) {
  const { override, usingGrid, openOverrides } = usePowerOverride();
  const forcingBattery = override === "battery";
  const dark = mode === "dark";
  const bannerColor = usingGrid
    ? GRID_GREEN
    : forcingBattery
      ? BATTERY_ORANGE
      : c.orange;

  const totalV = batteryV !== null ? batteryV.toFixed(1) : "12.8";
  const cellV = batteryV !== null ? (batteryV / 4).toFixed(2) : "3.20";
  const currentMah =
    batteryPct !== null
      ? Math.floor((batteryPct / 100) * CAPACITY_MAH).toLocaleString()
      : "--";
  const pctString = batteryPct !== null ? `${Math.floor(batteryPct)}%` : "--%";

  const level =
    batteryPct !== null ? Math.max(0, Math.min(100, batteryPct)) : 0;
  const tone = levelTone(batteryPct, c.orange);
  const tileBg = dark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.035)";

  // slow breathing glow on the charge level (native driver, no JS work)
  const glow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glow, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(glow, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glow]);

  return (
    <>
      {/* 1. power source, right under the navigation */}
      <SectionLabel
        label="CURRENTLY DISCHARGING"
        action="Change In Overrides"
        c={c}
      />

      <Pressable
        onPress={openOverrides}
        accessibilityRole="button"
        accessibilityLabel="power source status — open quick overrides"
        style={({ pressed }) => [pressed && { opacity: 0.94 }]}
      >
        <Card
          mode={mode}
          style={[
            ui.dischargeCard,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
        >
          <View
            style={[ui.dischargeIcon, { backgroundColor: `${bannerColor}22` }]}
          >
            <Ionicons
              name={usingGrid ? "flash" : "battery-charging"}
              size={scale(20)}
              color={bannerColor}
            />
          </View>
          <View style={ui.dischargeTextWrap}>
            <Text
              style={[
                ui.dischargeTitle,
                { color: c.text },
              ]}
            >
              {usingGrid
                ? "Grid is supplying the campus"
                : forcingBattery
                  ? "Battery is supplying the campus"
                  : "4S Batteries are supplying the campus"}
            </Text>
            <Text style={[ui.dischargeCopy, { color: c.muted }]}>
              {usingGrid || forcingBattery
                ? "Manual override active — tap to change in Quick Overrides"
                : "Automatic mode — tap to override manually"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={scale(18)}
            color={usingGrid ? GRID_GREEN : c.muted}
          />
        </Card>
      </Pressable>

      {/* 2. battery array */}
      <SectionLabel label="BATTERY ARRAY" action="Live Hardware Sync" c={c} />

      <View
        style={[ui.card, { backgroundColor: c.surface, borderColor: c.line }]}
      >
        <View style={ui.archHeader}>
          <View
            style={[ui.archIconBox, { backgroundColor: "rgba(249,115,22,0.15)" }]}
          >
            <Ionicons
              name="hardware-chip"
              size={scale(22)}
              color={BATTERY_ORANGE}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[ui.archTitle, { color: c.text }]}>
              4s array architecture
            </Text>
            <Text style={[ui.archSubtitle, { color: c.muted }]}>
              active series configuration
            </Text>
          </View>
          <View style={[ui.archPill, { backgroundColor: `${tone}22` }]}>
            <View style={[ui.archPillDot, { backgroundColor: tone }]} />
            <Text style={[ui.archPillText, { color: tone }]}>{pctString}</Text>
          </View>
        </View>

        <View
          style={[
            ui.cellsStage,
            { backgroundColor: dark ? "rgba(255,255,255,0.03)" : "#FBFCFE" },
          ]}
        >
          <View style={ui.cellsRow}>
            {Array.from({ length: CELL_COUNT }, (_, idx) => [
              <BatteryCell
                key={`cell-${idx}`}
                cellV={cellV}
                level={level}
                tone={tone}
                c={c}
                dark={dark}
                glow={glow}
              />,
              idx < CELL_COUNT - 1 ? (
                <View key={`wire-${idx}`} style={ui.seriesConnection}>
                  <LinearGradient
                    colors={[c.orange, BATTERY_ORANGE]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={ui.wire}
                  />
                </View>
              ) : null,
            ])}
          </View>
          <Text style={[ui.stageCaption, { color: c.muted }]}>
            cells wired in series (+ to -)
          </Text>
        </View>
      </View>

      {/* 3. totals in their own container */}
      <View
        style={[ui.card, { backgroundColor: c.surface, borderColor: c.line }]}
      >
        <View style={ui.totalsRow}>
          <View style={[ui.totalTile, { backgroundColor: tileBg }]}>
            <View style={ui.totalHead}>
              <View
                style={[ui.totalIcon, { backgroundColor: "rgba(249,115,22,0.15)" }]}
              >
                <Ionicons name="flash" size={scale(13)} color={BATTERY_ORANGE} />
              </View>
              <Text style={[ui.totalLabel, { color: c.muted }]}>
                total real voltage
              </Text>
            </View>
            <Text style={[ui.totalBig, { color: c.text }]}>{totalV}v</Text>
          </View>

          <View style={[ui.totalTile, { backgroundColor: tileBg }]}>
            <View style={ui.totalHead}>
              <View
                style={[ui.totalIcon, { backgroundColor: "rgba(34,197,94,0.15)" }]}
              >
                <Ionicons
                  name="battery-charging"
                  size={scale(13)}
                  color="#22C55E"
                />
              </View>
              <Text style={[ui.totalLabel, { color: c.muted }]}>
                current capacity
              </Text>
            </View>
            <Text style={[ui.totalBig, { color: c.text }]}>{currentMah}</Text>
            <Text style={[ui.totalUnit, { color: c.muted }]}>
              / 60,000mah
            </Text>
            <View
              style={[
                ui.progressTrack,
                {
                  backgroundColor: dark
                    ? "rgba(255,255,255,0.1)"
                    : "rgba(0,0,0,0.08)",
                },
              ]}
            >
              <LinearGradient
                colors={[tone, `${tone}B3`]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[ui.progressFill, { width: `${level}%` }]}
              />
            </View>
            <Text style={[ui.totalSub, { color: tone }]}>{pctString} full</Text>
          </View>
        </View>
        <Text style={[ui.totalsNote, { color: c.muted }]}>
          voltage scales dynamically, mass capacity remains at 60,000mah limit.
        </Text>
      </View>

      {/* 4. state-of-charge notice */}
      <View
        style={[
          ui.notice,
          {
            backgroundColor: c.surface,
            borderColor: c.line,
          },
        ]}
      >
        <View style={[ui.noticeIcon, { backgroundColor: c.accentSoft }]}>
          <Ionicons
            name="battery-full-outline"
            size={scale(17)}
            color={c.accent}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[ui.noticeTitle, { color: c.text }]}>
            4S Batteries are at {pctString}
          </Text>
          <Text style={[ui.noticeCopy, { color: c.muted }]}>
            {batteryPct === 100
              ? "Charging stopped automatically to prevent overcharge. Notification sent to admin & maintenance."
              : "System is actively monitoring the state of charge."}
          </Text>
        </View>
      </View>
    </>
  );
}

const CAP_H = scale(6);
const TERMINAL = scale(14);

const ui = StyleSheet.create({
  dischargeCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
    paddingVertical: scale(11),
    paddingRight: scale(14),
    paddingLeft: scale(14),
    borderRadius: scale(16),
    marginBottom: scale(8),
  },
  dischargeIcon: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(10),
    alignItems: "center",
    justifyContent: "center",
  },
  dischargeTextWrap: { flex: 1 },
  dischargeTitle: { fontSize: scale(12), fontWeight: "800" },
  dischargeCopy: { fontSize: scale(10), marginTop: scale(2), lineHeight: scale(14) },

  /* shared card */
  card: {
    borderWidth: 1,
    borderRadius: scale(16),
    padding: scale(14),
    marginBottom: scale(8),
  },

  /* battery array */
  archHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(12),
    marginBottom: scale(14),
  },
  archIconBox: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(10),
    alignItems: "center",
    justifyContent: "center",
  },
  archTitle: { fontSize: scale(12), fontWeight: "800" },
  archSubtitle: { fontSize: scale(10), marginTop: scale(2) },
  archPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(5),
    paddingHorizontal: scale(10),
    paddingVertical: scale(5),
    borderRadius: scale(12),
  },
  archPillDot: { width: scale(6), height: scale(6), borderRadius: scale(3) },
  archPillText: { fontSize: scale(12), fontWeight: "800" },

  cellsStage: {
    borderRadius: scale(14),
    paddingTop: scale(12),
    paddingBottom: scale(10),
    paddingHorizontal: scale(10),
  },
  cellsRow: { flexDirection: "row", alignItems: "flex-start" },
  cellCol: { flex: 1, alignItems: "center" },
  cellCap: {
    width: "34%",
    height: CAP_H,
    borderTopLeftRadius: scale(3),
    borderTopRightRadius: scale(3),
  },
  cellBody: {
    width: "100%",
    height: scale(136),
    borderWidth: 1.5,
    borderRadius: scale(14),
    overflow: "visible",
  },
  fillTrack: {
    ...StyleSheet.absoluteFill,
    borderRadius: scale(12),
    overflow: "hidden",
    justifyContent: "flex-end",
  },
  fillSurface: { height: 2, width: "100%", opacity: 0.9 },
  fillShine: { height: scale(14), width: "100%" },
  cellGloss: {
    position: "absolute",
    left: scale(5),
    top: scale(10),
    bottom: scale(10),
    width: scale(3),
    borderRadius: scale(2),
    backgroundColor: "rgba(255,255,255,0.28)",
  },
  cellContent: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: scale(10),
  },
  cellType: { fontSize: scale(9), fontWeight: "800" },
  cellMiddle: { alignItems: "center" },
  cellVolt: { fontSize: scale(14), fontWeight: "800" },
  cellLabel: { fontSize: scale(9), marginTop: scale(1) },
  cellMahBadge: {
    alignItems: "center",
    paddingHorizontal: scale(6),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    backgroundColor: "rgba(249,115,22,0.9)",
  },
  cellMahText: { color: "#FFFFFF", fontSize: scale(10), fontWeight: "800" },
  cellMahUnit: { color: "#FFFFFF", fontSize: scale(7), fontWeight: "700" },

  terminal: {
    position: "absolute",
    top: scale(24),
    width: TERMINAL,
    height: TERMINAL,
    borderRadius: TERMINAL / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  terminalLeft: { left: -TERMINAL / 2, backgroundColor: "#64748B" },
  terminalRight: { right: -TERMINAL / 2, backgroundColor: BATTERY_ORANGE },
  terminalText: {
    color: "#FFFFFF",
    fontSize: scale(10),
    fontWeight: "900",
    lineHeight: scale(12),
  },

  seriesConnection: {
    width: scale(20),
    height: CAP_H + scale(24) + TERMINAL,
    justifyContent: "flex-end",
  },
  wire: {
    height: 3,
    width: "100%",
    borderRadius: 2,
    marginBottom: TERMINAL / 2 - 1.5,
  },
  stageCaption: {
    textAlign: "center",
    fontSize: scale(10),
    marginTop: scale(10),
  },

  /* totals */
  totalsRow: { flexDirection: "row", gap: scale(10) },
  totalTile: {
    flex: 1,
    borderRadius: scale(16),
    padding: scale(12),
  },
  totalHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(6),
    marginBottom: scale(8),
  },
  totalIcon: {
    width: scale(24),
    height: scale(24),
    borderRadius: scale(8),
    alignItems: "center",
    justifyContent: "center",
  },
  totalLabel: { flex: 1, fontSize: scale(10), fontWeight: "600" },
  totalBig: { fontSize: scale(20), fontWeight: "800" },
  totalUnit: { fontSize: scale(10), marginTop: scale(1) },
  progressTrack: {
    height: scale(6),
    borderRadius: scale(3),
    overflow: "hidden",
    marginTop: scale(10),
  },
  progressFill: { height: "100%", borderRadius: scale(3) },
  totalSub: { fontSize: scale(11), fontWeight: "700", marginTop: scale(6) },
  totalsNote: {
    fontSize: scale(10),
    lineHeight: scale(14),
    textAlign: "center",
    marginTop: scale(12),
  },

  /* notice */
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
    borderWidth: 1,
    borderRadius: scale(16),
    paddingHorizontal: scale(14),
    paddingVertical: scale(11),
    marginBottom: scale(8),
    overflow: "hidden",
  },
  noticeIcon: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(10),
    alignItems: "center",
    justifyContent: "center",
  },
  noticeTitle: { fontSize: scale(12), fontWeight: "800" },
  noticeCopy: { fontSize: scale(10), lineHeight: scale(14), marginTop: scale(2) },
});