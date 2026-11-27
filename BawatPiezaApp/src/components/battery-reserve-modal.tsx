import { Modal, Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "./app-text";
import { fonts, useTheme } from "../theme";

export function BatteryReserveModal({
  visible,
  percentage,
  onDismiss,
}: {
  visible: boolean;
  percentage: number | null;
  onDismiss: () => void;
}) {
  const { colors: c } = useTheme();
  const batteryLevel = percentage === null ? 20 : Math.floor(percentage);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onDismiss}
    >
      <View style={styles.backdrop}>
        <View
          style={[styles.card, { backgroundColor: c.surface, borderColor: c.orange }]}
          accessibilityRole="alert"
          accessibilityViewIsModal
        >
          <View style={[styles.iconWrap, { backgroundColor: `${c.orange}18` }]}>
            <Ionicons name="battery-dead" size={38} color={c.orange} />
          </View>
          <Text style={[styles.title, { color: c.orange }]}>
            Battery reserve reached
          </Text>
          <Text style={[styles.body, { color: c.text }]}>
            The battery is at {batteryLevel}%. Battery power is not usable at or
            below the 20% safe reserve.
          </Text>
          <View
            style={[
              styles.recommendation,
              { backgroundColor: c.surfaceMuted, borderColor: c.line },
            ]}
          >
            <Ionicons name="flash" size={18} color={c.gridGreen} />
            <Text style={[styles.recommendationText, { color: c.text }]}>
              Switch to Grid to keep power available.
            </Text>
          </View>
          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: c.orange },
              pressed && styles.buttonPressed,
            ]}
            accessibilityRole="button"
          >
            <Text style={styles.buttonText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "rgba(10, 15, 20, 0.72)",
  },
  card: {
    alignItems: "center",
    borderWidth: 2,
    borderRadius: 24,
    paddingHorizontal: 24,
    paddingVertical: 28,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    fontSize: 21,
    lineHeight: 28,
    textAlign: "center",
    fontFamily: fonts.extrabold,
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    fontFamily: fonts.semibold,
    marginBottom: 16,
  },
  recommendation: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  recommendationText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.semibold,
  },
  button: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    marginTop: 20,
    paddingVertical: 13,
  },
  buttonPressed: {
    opacity: 0.82,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: fonts.bold,
  },
});
