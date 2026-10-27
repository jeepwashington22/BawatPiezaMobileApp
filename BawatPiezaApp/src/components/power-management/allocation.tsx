import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useState } from "react";
import { AppText as Text } from "../app-text";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Card, Glass, scale } from "../glass-ui";
import { fonts, type Mode, type ThemeColors } from "../../theme";
import { usePowerOverride } from "../../hooks/use-power-override";
import { styles } from "./styles";
import { SectionLabel, ThresholdCard, ScheduleRow, ActionButton, ZoneCard } from "./shared";

const WANTED_HOURS: Record<string, number> = {
  "1f": 12,
  "2f": 8,
  "3f": 6,
  "4f": 6,
};
const ZONES = ["1f", "2f", "3f", "4f"];

export function Allocation({
  c,
  mode,
  batteryPct,
  batteryV,
  telemetryConnection,
}: {
  c: ThemeColors;
  mode: Mode;
  batteryPct: number | null;
  batteryV: number | null;
  telemetryConnection: "connecting" | "live" | "offline";
}) {
  const [activeZone, setActiveZone] = useState("1f");
  const [allocs, setAllocs] = useState({ "1f": 0, "2f": 0, "3f": 0, "4f": 0 });

  const hasBatteryReading = batteryPct !== null;
  const totalPool = hasBatteryReading
    ? Number(((batteryPct / 100) * 24).toFixed(1))
    : 0;

  const totalAssigned = Object.values(allocs).reduce((a, b) => a + b, 0);
  const remaining = Math.max(0, totalPool - totalAssigned);
  const progressPct = totalPool > 0 ? (totalAssigned / totalPool) * 100 : 0;

  const handleAutoAllocate = () => {
    let pool = totalPool;
    const next = { "1f": 0, "2f": 0, "3f": 0, "4f": 0 };
    for (const z of ZONES) {
      const take = Math.min(pool, WANTED_HOURS[z]);
      next[z as keyof typeof next] = Number(take.toFixed(1));
      pool -= take;
    }
    setAllocs(next);
  };

  const setAssignedHours = (val: number) => {
    setAllocs((prev) => ({ ...prev, [activeZone]: val }));
  };
  const [selectedBattery, setSelectedBattery] = useState(false);
  const [systemAllocated, setSystemAllocated] = useState(false);

  return (
    <>
      <View
        style={[
          styles.poolCard,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <View style={styles.rowBetween}>
          <View>
            <View style={styles.poolHeading}>
              <View
                style={[styles.poolIcon, { backgroundColor: c.accentSoft }]}
              >
                <Ionicons
                  name="layers-outline"
                  size={scale(20)}
                  color={c.accent}
                />
              </View>
              <View>
                <Text style={[styles.poolTitle, { color: c.text }]}>
                  Available Battery Pool
                </Text>
                <Text style={[styles.poolSubtitle, { color: c.muted }]}>
                  4S BATTERY ARRAY
                </Text>
              </View>
            </View>
            <Text style={[styles.poolNote, { color: c.muted }]}>
              {hasBatteryReading
                ? `Battery array is ${Math.floor(batteryPct)}% full`
                : telemetryConnection === "offline"
                  ? "Battery telemetry is offline"
                  : "Fetching live battery availability..."}
              {"\n"}
              {batteryV !== null
                ? `${batteryV.toFixed(1)}V live voltage`
                : "Voltage unavailable"}
              {"\n"}
              60,000mAh nominal capacity
            </Text>
          </View>

          <Text style={[styles.poolValue, { color: c.text }]}>
            {hasBatteryReading ? `~${totalPool}h` : "--h"}
            {"\n"}
            <Text style={[styles.poolValueUnit, { color: c.muted }]}>
              Stored
            </Text>
          </Text>
        </View>

        <View style={[styles.progress, { backgroundColor: c.surfaceMuted }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: c.orange,
                width: `${Math.min(100, progressPct)}%`,
              },
            ]}
          />
        </View>

        <View style={styles.progressLabels}>
          <Text style={[styles.progressText, { color: c.muted }]}>
            {hasBatteryReading ? `${Math.floor(progressPct)}% Assigned` : "Waiting for battery"}
          </Text>
          <Text style={[styles.progressText, { color: c.muted }]}>
            {hasBatteryReading ? `${remaining.toFixed(1)}h Still Free` : "--h Still Free"}
          </Text>
        </View>

        <Text style={[styles.selectionLabel, { color: c.text }]}>
          Available Battery
        </Text>
        <Text style={[styles.selectionHint, { color: c.muted }]}>
          Select the connected battery array to allocate its available power.
        </Text>
        <View style={styles.batteryChoiceRow}>
          <Pressable
            onPress={() => {
              if (!hasBatteryReading) return;
              setSelectedBattery((selected) => !selected);
              setSystemAllocated(false);
            }}
            disabled={!hasBatteryReading}
            style={[
              styles.batteryChoice,
              {
                backgroundColor: selectedBattery ? c.accentSoft : c.surfaceMuted,
                borderColor: selectedBattery ? c.orange : c.line,
                opacity: hasBatteryReading ? 1 : 0.65,
              },
            ]}
            accessibilityRole="radio"
            accessibilityState={{
              selected: selectedBattery,
              disabled: !hasBatteryReading,
            }}
            accessibilityLabel={
              hasBatteryReading
                ? `Select battery array, ${Math.floor(batteryPct)} percent full`
                : "Battery array unavailable until live telemetry arrives"
            }
          >
            <Ionicons
              name={selectedBattery ? "radio-button-on" : "radio-button-off"}
              size={scale(18)}
              color={selectedBattery ? c.orange : c.muted}
            />
            <View style={styles.batteryChoiceCopy}>
              <Text style={[styles.batteryChoiceName, { color: c.text }]}>
                BATTERY ARRAY
              </Text>
              <Text style={[styles.batteryChoiceDetail, { color: c.muted }]}>
                {hasBatteryReading
                  ? `${Math.floor(batteryPct)}% available${batteryV !== null ? ` · ${batteryV.toFixed(1)}V` : ""}`
                  : telemetryConnection === "offline"
                    ? "Waiting for device connection"
                    : "Waiting for live battery telemetry"}
              </Text>
            </View>
          </Pressable>
        </View>

        <ActionButton
          label={
            selectedBattery
              ? "Let System Allocate from Battery Array"
              : "Select Available Battery to Continue"
          }
          disabled={!selectedBattery || !hasBatteryReading}
          onPress={() => setSystemAllocated(true)}
        />

        <Text
          style={[styles.cardCopy, { color: c.muted, marginTop: scale(12) }]}
        >
          {systemAllocated
            ? "System allocation is using the connected battery array."
            : "Gives the most important rooms their full hours first, then splits what&apos;s left after you choose a battery."}
        </Text>
      </View>

      <View
        style={[
          styles.infoBand,
          { backgroundColor: c.surfaceMuted, borderColor: c.line },
        ]}
      >
        <Text style={[styles.noticeTitle, { color: c.orange }]}>
          Campus-Wide Power Allocation
        </Text>
        <Text style={[styles.cardCopy, { color: c.muted }]}>
          Assign each battery-powered zone its hours and start time — nothing
          changes on campus until you confirm.
        </Text>
      </View>

      <SectionLabel label="ALL ZONES" c={c} />

      <View style={styles.zoneRow}>
        {ZONES.map((item) => {
          const active = activeZone === item;
          return (
            <Pressable
              key={item}
              onPress={() => setActiveZone(item)}
              style={[
                styles.zonePill,
                {
                  backgroundColor: active ? c.orange : c.surface,
                  borderColor: c.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.zoneText,
                  { color: active ? "#FFFFFF" : c.muted },
                ]}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ZoneCard
        c={c}
        mode={mode}
        zone={activeZone}
        wantedHours={WANTED_HOURS[activeZone]}
        assignedHours={allocs[activeZone as keyof typeof allocs]}
        setAssignedHours={setAssignedHours}
        remainingPool={remaining}
      />
      <ActionButton
        label="Confirm Allocation"
        disabled={!selectedBattery || !hasBatteryReading}
        onPress={() => setSystemAllocated(true)}
      />
    </>
  );
}
