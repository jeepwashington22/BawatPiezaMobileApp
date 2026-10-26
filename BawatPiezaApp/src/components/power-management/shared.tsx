import { Pressable, StyleSheet, View } from "react-native";
import { AppText as Text } from "../app-text";
import { Ionicons } from "@expo/vector-icons";
import { Card, scale } from "../glass-ui";
import { fonts, type Mode, type ThemeColors } from "../../theme";
import { styles } from "./styles";

export function SectionLabel({
  label,
  action,
  c,
}: {
  label: string;
  action?: string;
  c: ThemeColors;
}) {
  return (
    <View style={styles.sectionLabel}>
      <Text style={[styles.sectionText, { color: c.muted }]}>{label}</Text>
      {action ? (
        <Text style={[styles.sectionAction, { color: c.muted }]}>{action}</Text>
      ) : null}
    </View>
  );
}

export function ThresholdCard({ name, c }: { name: string; c: ThemeColors }) {
  const cardColor = name === "4S BATTERIES" ? "#0B63B7" : c.orange;

  return (
    <View
      style={[
        styles.thresholdCard,
        { backgroundColor: cardColor, borderColor: cardColor },
      ]}
    >
      <View style={styles.thresholdHeader}>
        <View
          style={[
            styles.thresholdIcon,
            { backgroundColor: "rgba(255,255,255,0.18)" },
          ]}
        >
          <Ionicons
            name={
              name === "4S BATTERIES"
                ? "battery-full-outline"
                : "battery-half-outline"
            }
            size={scale(18)}
            color="#FFFFFF"
          />
        </View>
        <Text
          style={[styles.thresholdName, { color: "#FFFFFF" }]}
          numberOfLines={1}
        >
          {name}
        </Text>
        <Text
          style={[
            styles.thresholdBadge,
            { color: "#FFFFFF", backgroundColor: "rgba(255,255,255,0.18)" },
          ]}
        >
          {name === "4S BATTERIES" ? "Safe" : "N/A"}
        </Text>
      </View>
      <View style={styles.thresholdRow}>
        <Text
          style={[styles.thresholdCopy, { color: "rgba(255,255,255,0.78)" }]}
        >
          Alert Below
        </Text>
        <Text style={[styles.thresholdValue, { color: "#FFFFFF" }]}>
          {name === "4S BATTERIES" ? "25%" : "--"}
        </Text>
      </View>
      <View
        style={[
          styles.thresholdTrack,
          { backgroundColor: "rgba(255,255,255,0.22)" },
        ]}
      >
        <View
          style={[
            styles.thresholdFill,
            {
              backgroundColor: "#FFFFFF",
              width: name === "4S BATTERIES" ? "25%" : "0%",
            },
          ]}
        />
      </View>
    </View>
  );
}

export function ScheduleRow({
  title,
  note,
  time,
  c,
  mode,
}: {
  title: string;
  note: string;
  time: string;
  c: ThemeColors;
  mode: Mode;
}) {
  return (
    <View
      style={[
        styles.scheduleRow,
        {
          borderBottomColor:
            mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(10,42,74,0.1)",
        },
      ]}
    >
      <View style={[styles.scheduleIcon, { backgroundColor: c.surfaceMuted }]}>
        <Ionicons
          name={
            title === "Peak Hours"
              ? "battery-charging-outline"
              : "flash-outline"
          }
          size={scale(15)}
          color={c.orange}
        />
      </View>
      <View style={styles.scheduleCopy}>
        <Text style={[styles.smallBold, { color: c.text }]}>{title}</Text>
        <Text style={[styles.cardCopy, { color: c.muted }]}>{note}</Text>
      </View>
      <Text style={[styles.scheduleTime, { color: c.orange }]}>{time}</Text>
    </View>
  );
}

export function ActionButton({
  label,
  disabled = false,
  onPress,
}: {
  label: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.actionButton,
        disabled && styles.actionButtonDisabled,
        pressed && { opacity: 0.82 },
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: disabled ? "#AAB1C2" : "#F5A220" },
        ]}
      />
      <Text style={styles.actionText}>{label}</Text>
    </Pressable>
  );
}

export function ZoneCard({
  c,
  mode,
  zone,
  wantedHours,
  assignedHours,
  setAssignedHours,
  remainingPool,
}: {
  c: ThemeColors;
  mode: Mode;
  zone: string;
  wantedHours: number;
  assignedHours: number;
  setAssignedHours: (val: number) => void;
  remainingPool: number;
}) {
  const progress = Math.min(1, assignedHours / wantedHours);

  return (
    <Card mode={mode} style={styles.zoneCard}>
      <Text style={[styles.zoneHeader, { color: c.text }]}>
        {zone} room mapping
      </Text>

      <View style={styles.chips}>
        <Text
          style={[
            styles.priority,
            { color: c.orange, backgroundColor: c.accentSoft },
          ]}
        >
          {zone === "1f" ? "highest priority" : "standard priority"}
        </Text>
        <Text
          style={[
            styles.batteryChip,
            { color: c.accent, backgroundColor: c.surfaceMuted },
          ]}
        >
          battery
        </Text>
      </View>

      <Text style={[styles.cardCopy, { color: c.muted }]}>
        wants to run {wantedHours}h/day · mon-fri · 6:00 pm-6:00 am
      </Text>

      <View style={styles.allocationControlRow}>
        <View
          style={[
            styles.stepper,
            { backgroundColor: c.surfaceMuted, borderColor: c.line },
          ]}
        >
          <Pressable
            onPress={() => setAssignedHours(Math.max(0, assignedHours - 1))}
            style={styles.stepperButton}
            accessibilityRole="button"
            accessibilityLabel="decrease assigned hours"
          >
            <Ionicons name="remove" size={scale(16)} color={c.text} />
          </Pressable>
          <Text style={[styles.assignedHours, { color: c.text }]}>
            {assignedHours}h
          </Text>
          <Pressable
            onPress={() => {
              if (remainingPool >= 1 && assignedHours < wantedHours) {
                setAssignedHours(assignedHours + 1);
              }
            }}
            style={styles.stepperButton}
            accessibilityRole="button"
            accessibilityLabel="increase assigned hours"
          >
            <Ionicons name="add" size={scale(16)} color={c.text} />
          </Pressable>
        </View>
        <View
          style={[styles.allocationBar, { backgroundColor: c.surfaceMuted }]}
        >
          <View
            style={[
              styles.allocationBarFill,
              { width: `${progress * 100}%`, backgroundColor: c.orange },
            ]}
          />
        </View>
      </View>
      <Text style={[styles.assignedCopy, { color: c.muted }]}>
        {assignedHours}h {assignedHours === 1 ? "is" : "are"} assigned of{" "}
        {wantedHours}h wanted
      </Text>

      <View
        style={[
          styles.batteryStart,
          {
            borderTopColor:
              mode === "dark"
                ? "rgba(255,255,255,0.12)"
                : "rgba(10,42,74,0.10)",
          },
        ]}
      >
        <View>
          <Text style={[styles.startTitle, { color: c.muted }]}>
            starts drawing from battery at
          </Text>
          <Text style={[styles.startHint, { color: c.muted }]}>
            {assignedHours > 0
              ? "battery schedule is ready"
              : "not drawing from battery yet"}
          </Text>
        </View>
        <View style={[styles.timePill, { backgroundColor: c.surfaceMuted }]}>
          <Text style={[styles.timeText, { color: c.text }]}>8:00 am</Text>
        </View>
      </View>
    </Card>
  );
}
