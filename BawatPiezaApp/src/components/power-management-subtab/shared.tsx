import { Modal, Pressable, StyleSheet, View } from "react-native";
import { AppText as Text } from "../app-text";
import { Ionicons } from "@expo/vector-icons";
import { Card, scale } from "../glass-ui";
import { fonts, useTheme, type Mode, type ThemeColors } from "../../theme";
import { styles } from "./styles";
import {
  getChannelPriorityOption,
  type ChannelPriority,
} from "../../lib/device-priority";

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
  time?: string | null;
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
      <Text style={[styles.scheduleTime, { color: c.orange }]}>
        {typeof time === "string" && time.trim() ? time : "--"}
      </Text>
    </View>
  );
}

export type AllocationRecoveryReason = "stopped" | "setup_required";

export function AllocationRecoveryModal({
  visible,
  reason,
  c,
  onContinue,
}: {
  visible: boolean;
  reason: AllocationRecoveryReason;
  c: ThemeColors;
  onContinue: () => void;
}) {
  const stopped = reason === "stopped";
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onContinue}
    >
      <View style={recoveryModalStyles.overlay}>
        <View
          style={[
            recoveryModalStyles.card,
            { backgroundColor: c.surface, borderColor: c.line },
          ]}
          accessibilityViewIsModal
        >
          <View
            style={[
              recoveryModalStyles.icon,
              { backgroundColor: stopped ? `${c.orange}18` : c.accentSoft },
            ]}
          >
            <Ionicons
              name={stopped ? "stop-circle-outline" : "options-outline"}
              size={scale(25)}
              color={stopped ? c.orange : c.accent}
            />
          </View>
          <Text style={[recoveryModalStyles.title, { color: c.text }]}>
            {stopped
              ? "Previous allocation stopped"
              : "System Allocation setup required"}
          </Text>
          <Text style={[recoveryModalStyles.copy, { color: c.muted }]}>
            {stopped
              ? "Return to setup, calculate a fresh runtime plan, then start the allocation again."
              : "Set up each room and calculate a runtime plan before starting the system allocation."}
          </Text>
          <Pressable
            onPress={onContinue}
            style={({ pressed }) => [
              recoveryModalStyles.button,
              { backgroundColor: c.accent },
              pressed && recoveryModalStyles.pressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={[recoveryModalStyles.buttonText, { color: c.onAccent }]}>
              Go to setup
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
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
  const { colors: c } = useTheme();

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
          { backgroundColor: disabled ? "#AAB1C2" : c.accent },
        ]}
      />
      <Text style={[styles.actionText, { color: c.onAccent }]}>{label}</Text>
    </Pressable>
  );
}

const recoveryModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: scale(24),
    backgroundColor: "rgba(10, 15, 20, 0.62)",
  },
  card: {
    alignItems: "center",
    borderWidth: 1,
    borderRadius: scale(22),
    padding: scale(22),
  },
  icon: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(18),
    alignItems: "center",
    justifyContent: "center",
    marginBottom: scale(14),
  },
  title: {
    fontSize: scale(18),
    fontFamily: fonts.extrabold,
    textAlign: "center",
  },
  copy: {
    fontSize: scale(13),
    lineHeight: scale(20),
    fontFamily: fonts.regular,
    textAlign: "center",
    marginTop: scale(9),
  },
  button: {
    minHeight: scale(46),
    borderRadius: scale(13),
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: scale(20),
    marginTop: scale(20),
    alignSelf: "stretch",
  },
  buttonText: {
    fontSize: scale(14),
    fontFamily: fonts.bold,
  },
  pressed: { opacity: 0.76 },
});

export function ZoneCard({
  c,
  mode,
  zone,
  channel,
  startDate,
  startTime,
  priority,
  allocationPct,
  wantedHours,
  assignedHours,
  setAssignedHours,
  remainingPool,
}: {
  c: ThemeColors;
  mode: Mode;
  zone: string;
  channel: number;
  startDate: string;
  startTime: string;
  priority: ChannelPriority;
  allocationPct: number;
  wantedHours: number;
  assignedHours: number;
  setAssignedHours: (val: number) => void;
  remainingPool: number;
}) {
  const progress =
    wantedHours > 0 ? Math.min(1, assignedHours / wantedHours) : 0;
  const formattedAssignedHours = Number(assignedHours.toFixed(1));
  const formattedWantedHours = Number(wantedHours.toFixed(1));
  const [year, month, day] = startDate.split("-").map(Number);
  const [hour, minute] = startTime.split(":").map(Number);
  const scheduledStart = new Date(year, month - 1, day, hour, minute);
  const scheduledStartLabel = Number.isNaN(scheduledStart.getTime())
    ? `${startDate} ${startTime}`
    : `${scheduledStart.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}\n${scheduledStart.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit",
      })}`;

  return (
    <Card mode={mode} style={styles.zoneCard}>
      <Text style={[styles.zoneHeader, { color: c.text }]}>
        {zone}
      </Text>

      <View style={styles.chips}>
        <Text
          style={[
            styles.batteryChip,
            { color: c.accent, backgroundColor: c.surfaceMuted },
          ]}
        >
          Channel {channel}
        </Text>
        <Text
          style={[
            styles.priority,
            { color: c.orange, backgroundColor: c.accentSoft },
          ]}
        >
          {getChannelPriorityOption(priority).label} priority ·{" "}
          {Number(allocationPct.toFixed(1))}% allocation
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
        Receives up to {formattedWantedHours.toFixed(1)}h/day from the battery pool.
      </Text>

      <View style={styles.allocationControlRow}>
        <View
          style={[
            styles.stepper,
            { backgroundColor: c.surfaceMuted, borderColor: c.line },
          ]}
        >
          <Pressable
            onPress={() =>
              setAssignedHours(Math.max(0, assignedHours - 0.5))
            }
            style={styles.stepperButton}
            accessibilityRole="button"
            accessibilityLabel="decrease assigned hours"
          >
            <Ionicons name="remove" size={scale(16)} color={c.text} />
          </Pressable>
          <Text style={[styles.assignedHours, { color: c.text }]}>
            {formattedAssignedHours.toFixed(1)}h
          </Text>
          <Pressable
            onPress={() => {
              if (remainingPool > 0 && assignedHours < wantedHours) {
                setAssignedHours(
                  Math.min(wantedHours, assignedHours + 0.5),
                );
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
        {formattedAssignedHours.toFixed(1)}h{" "}
        {formattedAssignedHours === 1 ? "is" : "are"} assigned of{" "}
        {formattedWantedHours.toFixed(1)}h wanted
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
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.startTitle, { color: c.muted }]}>
            Scheduled start
          </Text>
          <Text style={[styles.startHint, { color: c.muted }]}>
            {assignedHours > 0
              ? "Bulb waits until this time"
              : "not drawing from battery yet"}
          </Text>
        </View>
        <View
          style={[
            styles.timePill,
            { backgroundColor: c.surfaceMuted, maxWidth: "48%" },
          ]}
        >
          <Text
            style={[styles.timeText, { color: c.text }]}
            numberOfLines={2}
          >
            {scheduledStartLabel}
          </Text>
        </View>
      </View>
    </Card>
  );
}
