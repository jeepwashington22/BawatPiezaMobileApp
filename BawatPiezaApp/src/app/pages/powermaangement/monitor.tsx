import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useState } from "react";
import { AppText as Text } from "../../../components/app-text";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Card, Glass, scale } from "../../../components/glass-ui";
import { fonts, type Mode, type ThemeColors } from "../../../theme";
import { usePowerOverride } from "../../../hooks/use-power-override";
import { styles } from "./styles";
import { SectionLabel, ThresholdCard, ScheduleRow, ActionButton, ZoneCard } from "./shared";

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
  const [enabled, setEnabled] = useState(true);
  const { override, usingGrid, openOverrides } = usePowerOverride();
  const forcingBattery = override === "battery";
  const bannerColor = usingGrid
    ? "#16A34A"
    : forcingBattery
      ? "#F97316"
      : c.orange;
  const bannerSoft = usingGrid
    ? "rgba(22,163,74,0.12)"
    : "rgba(249,115,22,0.10)";

  const totalV = batteryV !== null ? batteryV.toFixed(1) : "12.8";
  const cellV = batteryV !== null ? (batteryV / 4).toFixed(2) : "3.20";
  const currentMah =
    batteryPct !== null
      ? Math.floor((batteryPct / 100) * 60000).toLocaleString()
      : "--";
  const pctString = batteryPct !== null ? `${Math.floor(batteryPct)}%` : "--%";

  return (
    <>
      <SectionLabel label="BATTERY ARRAY" action="Live Hardware Sync" c={c} />

      <View
        style={[
          styles.archCard,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <View style={styles.archHeader}>
          <View
            style={[
              styles.archIconBox,
              { backgroundColor: "rgba(249, 115, 22, 0.15)" },
            ]}
          >
            <Ionicons name="hardware-chip" size={scale(22)} color="#F97316" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.archTitle, { color: c.text }]}>
              4s array architecture
            </Text>
            <Text style={[styles.archSubtitle, { color: c.muted }]}>
              active series configuration
            </Text>
          </View>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.cellsScroll}
        >
          <View style={styles.cellsWrapper}>
            {[1, 2, 3, 4].map((num, idx) => (
              <View key={num} style={styles.cellGroup}>
                <View
                  style={[
                    styles.cellBlock,
                    {
                      backgroundColor: mode === "dark" ? "#1A1D24" : "#F8FAFC",
                      borderColor: c.orange,
                    },
                  ]}
                >
                  <View style={styles.terminalLeft}>
                    <Text style={styles.terminalText}>-</Text>
                  </View>
                  <View style={styles.terminalRight}>
                    <Text style={styles.terminalText}>+</Text>
                  </View>

                  <Text style={[styles.cellType, { color: c.orange }]}>
                    s168
                  </Text>
                  <Text style={[styles.cellVolt, { color: c.text }]}>
                    {cellV}v
                  </Text>
                  <Text style={[styles.cellLabel, { color: c.muted }]}>
                    lipo
                  </Text>
                  <View style={styles.cellMahBadge}>
                    <Text style={styles.cellMahText}>60k</Text>
                    <Text style={styles.cellMahUnit}>mah</Text>
                  </View>
                </View>
                {idx < 3 && (
                  <View style={styles.seriesConnection}>
                    <View
                      style={[styles.wire, { backgroundColor: c.orange }]}
                    />
                  </View>
                )}
              </View>
            ))}
          </View>
        </ScrollView>

        <View
          style={[
            styles.totalsBox,
            {
              backgroundColor:
                mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
            },
          ]}
        >
          <View style={styles.totalRow}>
            <Ionicons name="flash" size={scale(14)} color="#F97316" />
            <Text style={[styles.totalLabel, { color: c.muted }]}>
              total real voltage:
            </Text>
            <Text style={[styles.totalValue, { color: c.text }]}>
              {totalV}v
            </Text>
          </View>
          <View style={styles.totalRow}>
            <Ionicons
              name="battery-charging"
              size={scale(14)}
              color="#22C55E"
            />
            <Text style={[styles.totalLabel, { color: c.muted }]}>
              current capacity:
            </Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.totalValue, { color: c.text }]}>
                {currentMah} / 60,000mah
              </Text>
              <Text style={[styles.subValue, { color: c.orange }]}>
                {pctString} full
              </Text>
            </View>
          </View>
          <Text style={[styles.totalsNote, { color: c.muted }]}>
            cells wired in series (+ to -). voltage scales dynamically, mass
            capacity remains at 60,000mah limit.
          </Text>
        </View>
      </View>

      <Glass
        mode={mode}
        style={[
          styles.featureCard,
          { borderColor: c.line, backgroundColor: c.surface },
        ]}
      >
        <View style={[styles.switchGlow, { backgroundColor: c.accentSoft }]} />
        <View style={styles.switchHeader}>
          <View
            style={[
              styles.switchIcon,
              { backgroundColor: c.accentSoft, borderColor: c.line },
            ]}
          >
            <Ionicons
              name="git-compare-outline"
              size={scale(19)}
              color={c.orange}
            />
          </View>
          <View style={styles.switchHeading}>
            <Text style={[styles.switchEyebrow, { color: c.orange }]}>
              Power Intelligence
            </Text>
            <Text style={[styles.switchTitle, { color: c.text }]}>
              Smart Auto-Switching
            </Text>
          </View>
          <Pressable
            onPress={() => setEnabled(!enabled)}
            style={[
              styles.toggle,
              { backgroundColor: enabled ? c.accent : c.surfaceMuted },
            ]}
            accessibilityRole="switch"
            accessibilityState={{ checked: enabled }}
            accessibilityLabel="Smart Auto-Switching"
          >
            <View style={[styles.toggleKnob, !enabled && styles.toggleOff]} />
          </Pressable>
        </View>

        <Text style={[styles.switchCopy, { color: c.muted }]}>
          Automatically balances grid power, battery capacity, and campus load.
        </Text>
      </Glass>

      <View
        style={[
          styles.notice,
          {
            backgroundColor: mode === "dark" ? "#17120D" : "#F4F0E9",
            borderColor:
              mode === "dark" ? "rgba(251,146,60,0.25)" : "transparent",
          },
        ]}
      >
        <Text style={[styles.noticeTitle, { color: c.orange }]}>
          4S Batteries are at {pctString}
        </Text>
        <Text style={[styles.noticeCopy, { color: c.muted }]}>
          {batteryPct === 100
            ? "Charging stopped automatically to prevent overcharge. Notification sent to admin & maintenance."
            : "System is actively monitoring the state of charge."}
        </Text>
      </View>

      <SectionLabel
        label="CURRENTLY DISCHARGING"
        action="Change In Overrides"
        c={c}
      />

      {(usingGrid || forcingBattery) && (
        <View style={[styles.overrideBanner, { backgroundColor: bannerColor }]}>
          <Ionicons
            name={usingGrid ? "flash" : "battery-charging"}
            size={scale(14)}
            color="#FFFFFF"
          />
          <Text style={styles.overrideBannerText}>
            {usingGrid
              ? "Using Grid — battery on standby"
              : "Using Battery — grid on standby"}
          </Text>
        </View>
      )}

      <Pressable
        onPress={openOverrides}
        accessibilityRole="button"
        accessibilityLabel="power source status — open quick overrides"
        style={({ pressed }) => [pressed && { opacity: 0.94 }]}
      >
        <Card
          mode={mode}
          style={[
            styles.dischargeCard,
            (usingGrid || forcingBattery) && {
              borderColor: bannerColor,
              backgroundColor: bannerSoft,
            },
          ]}
        >
          <View style={styles.dischargeTextWrap}>
            <Text
              style={[
                styles.cardTitle,
                { color: usingGrid ? "#16A34A" : c.text },
              ]}
            >
              {usingGrid
                ? "Grid is supplying the campus"
                : forcingBattery
                  ? "Battery is supplying the campus"
                  : "4S Batteries are supplying the campus"}
            </Text>
            <Text style={[styles.cardCopy, { color: c.muted }]}>
              {usingGrid || forcingBattery
                ? "Manual override active — tap to change in Quick Overrides"
                : "Following Smart Auto-Switching — tap to override manually"}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={scale(18)}
            color={usingGrid ? "#16A34A" : c.muted}
          />
        </Card>
      </Pressable>
    </>
  );
}
