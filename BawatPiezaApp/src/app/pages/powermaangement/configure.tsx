import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { useState } from "react";
import { useRouter, type Href } from "expo-router";
import { AppText as Text } from "../../../components/app-text";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Card, Glass, scale } from "../../../components/glass-ui";
import { fonts, type Mode, type ThemeColors } from "../../../theme";
import { usePowerOverride } from "../../../hooks/use-power-override";
import { styles } from "./styles";
import { SectionLabel, ThresholdCard, ScheduleRow, ActionButton, ZoneCard } from "./shared";

export function Configure({ c, mode }: { c: ThemeColors; mode: Mode }) {
  const router = useRouter();
  const [autoSync, setAutoSync] = useState(true);

  return (
    <>
      <SectionLabel
        label="BATTERY PROTECTION"
        action="1 Array Configured"
        c={c}
      />

      <View style={styles.thresholdRowCards}>
        <ThresholdCard name="4S BATTERIES" c={c} />
      </View>

      <SectionLabel label="TIME-OF-USE SCHEDULER" c={c} />

      <Card mode={mode} style={styles.schedulerCard}>
        <View style={styles.schedulerHeader}>
          <View
            style={[
              styles.schedulerHeaderIcon,
              { backgroundColor: c.accentSoft },
            ]}
          >
            <Ionicons name="time-outline" size={scale(18)} color={c.orange} />
          </View>
          <View style={styles.schedulerHeaderCopy}>
            <Text style={[styles.schedulerTitle, { color: c.text }]}>
              Daily Power Schedule
            </Text>
            <Text style={[styles.schedulerSubtitle, { color: c.muted }]}>
              Automatic Switching Windows
            </Text>
          </View>
          <View style={[styles.activePill, { backgroundColor: c.accentSoft }]}>
            <View style={[styles.activeDot, { backgroundColor: c.ok }]} />
            <Text style={[styles.activePillText, { color: c.onAccentSoft }]}>
              Active
            </Text>
          </View>
        </View>
        <ScheduleRow
          title="Peak Hours"
          note="Use battery power"
          time="7:00 am - 7:00 pm"
          c={c}
          mode={mode}
        />
        <ScheduleRow
          title="Off-Peak Hours"
          note="Draw from grid"
          time="8:00 pm - 6:00 am"
          c={c}
          mode={mode}
        />

        <View
          style={[
            styles.scheduleDetails,
            {
              borderBottomColor:
                mode === "dark"
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(10,42,74,0.1)",
            },
          ]}
        >
          <View style={styles.scheduleDetailsHeading}>
            <Text style={[styles.smallBold, { color: c.text }]}>
              How This Schedule Is Set?{" "}
            </Text>
          </View>
          <Text style={[styles.scheduleDetailsCopy, { color: c.muted }]}>
            Peak and off-peak windows follow Meralco&apos;s commercial
            Time-of-Use tariff schedule for the UCC — Congressional Campus
            account. Windows sync automatically once a day; manual edits here
            pause auto-sync until it&apos;s turned back on.
          </Text>
          <View style={styles.autoSyncRow}>
            <View style={styles.autoSyncCopy}>
              <Text style={[styles.smallBold, { color: c.text }]}>
                Auto-sync from Meralco
              </Text>
              <Text style={[styles.autoSyncDate, { color: c.muted }]}>
                Last synced Aug 30, 2026 · 6:02 AM
              </Text>
            </View>
            <Pressable
              onPress={() => setAutoSync((current) => !current)}
              style={[
                styles.autoSyncToggle,
                { backgroundColor: autoSync ? "#0755A5" : c.surfaceMuted },
              ]}
              accessibilityRole="switch"
              accessibilityState={{ checked: autoSync }}
              accessibilityLabel="Auto-sync from Meralco"
            >
              <View
                style={[
                  styles.autoSyncKnob,
                  !autoSync && styles.autoSyncKnobOff,
                ]}
              />
            </Pressable>
          </View>
        </View>

        <ActionButton
          label="Check a Zone's Runtime Need Against This Window →"
          onPress={() =>
            router.push("/pages/zones/1/runtime-calculator" as Href)
          }
        />
      </Card>
    </>
  );
}

// target demand per zone
