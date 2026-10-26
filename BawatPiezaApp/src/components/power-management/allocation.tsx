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
}: {
  c: ThemeColors;
  mode: Mode;
  batteryPct: number | null;
}) {
  const [activeZone, setActiveZone] = useState("1f");
  const [allocs, setAllocs] = useState({ "1f": 0, "2f": 0, "3f": 0, "4f": 0 });

  // max campus pool (assume 24h absolute max for the whole campus at 100%)
  const totalPool =
    batteryPct !== null ? Number(((batteryPct / 100) * 24).toFixed(1)) : 24;

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
  const [selectedBattery, setSelectedBattery] = useState<"A" | "B" | null>(
    null,
  );
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
              4S Batteries are {batteryPct ?? "--"}% full{"\n"}
              12.8V nominal total{"\n"}
              60,000mAh mass capacity
            </Text>
          </View>

          <Text style={[styles.poolValue, { color: c.text }]}>
            ~{totalPool}h{"\n"}
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
            {Math.floor(progressPct)}% Assigned So Far
          </Text>
          <Text style={[styles.progressText, { color: c.muted }]}>
            {remaining.toFixed(1)}h Still Free
          </Text>
        </View>

        <Text style={[styles.selectionLabel, { color: c.text }]}>
          Choose a Battery First
        </Text>
        <Text style={[styles.selectionHint, { color: c.muted }]}>
          The system will only allocate power from the battery you select.
        </Text>
        <View style={styles.batteryChoiceRow}>
          {[
            { id: "A" as const, name: "BANK A", detail: "100% full" },
            { id: "B" as const, name: "BANK B", detail: "62% full" },
          ].map((battery) => {
            const selected = selectedBattery === battery.id;
            return (
              <Pressable
                key={battery.id}
                onPress={() => {
                  setSelectedBattery(battery.id);
                  setSystemAllocated(false);
                }}
                style={[
                  styles.batteryChoice,
                  {
                    backgroundColor: c.surfaceMuted,
                    borderColor: selected ? c.orange : c.line,
                  },
                  selected && { backgroundColor: c.accentSoft },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`Select ${battery.name}, ${battery.detail}`}
              >
                <Ionicons
                  name={selected ? "radio-button-on" : "radio-button-off"}
                  size={scale(18)}
                  color={selected ? c.orange : c.muted}
                />
                <View style={styles.batteryChoiceCopy}>
                  <Text style={[styles.batteryChoiceName, { color: c.text }]}>
                    {battery.name}
                  </Text>
                  <Text
                    style={[styles.batteryChoiceDetail, { color: c.muted }]}
                  >
                    {battery.detail}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <ActionButton
          label={
            selectedBattery
              ? `Let System Allocate from Bank ${selectedBattery}`
              : "Choose a Battery to Continue"
          }
          disabled={!selectedBattery}
          onPress={() => setSystemAllocated(true)}
        />

        <Text
          style={[styles.cardCopy, { color: c.muted, marginTop: scale(12) }]}
        >
          {systemAllocated
            ? `System allocation is using Bank ${selectedBattery}.`
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
        disabled={!selectedBattery}
        onPress={() => setSystemAllocated(true)}
      />
    </>
  );
}
