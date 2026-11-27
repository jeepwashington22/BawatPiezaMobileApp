import { Modal, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "./app-text";
import { fonts, useTheme } from "../theme";

export function SmokeEmergencyModal({
  visible,
  zone,
}: {
  visible: boolean;
  zone: string;
}) {
  const { colors: c } = useTheme();
  const location = zone.trim() || "the panel box";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => undefined}
    >
      <View style={styles.backdrop}>
        <View
          style={[styles.card, { backgroundColor: c.surface, borderColor: c.danger }]}
          accessibilityRole="alert"
          accessibilityViewIsModal
        >
          <View style={[styles.iconWrap, { backgroundColor: `${c.danger}18` }]}>
            <Ionicons name="warning" size={38} color={c.danger} />
          </View>
          <Text style={[styles.title, { color: c.danger }]}>Emergency: smoke detected</Text>
          <Text style={[styles.body, { color: c.text }]}>
            Smoke was detected in {location}. Power-mode controls are locked for your safety.
          </Text>
          <Text style={[styles.instruction, { color: c.textSoft }]}>
            Check the panel box and make sure it is safe. Then press the physical restart/reset
            button on the hub. Mobile controls will unlock only after the hub reports that the
            smoke alarm has cleared.
          </Text>
          <View style={[styles.lockNotice, { backgroundColor: c.surfaceMuted, borderColor: c.line }]}>
            <Ionicons name="lock-closed" size={17} color={c.danger} />
            <Text style={[styles.lockText, { color: c.text }]}>Power controls are disabled</Text>
          </View>
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
    backgroundColor: "rgba(10, 15, 20, 0.78)",
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
    marginBottom: 12,
  },
  instruction: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    fontFamily: fonts.regular,
  },
  lockNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  lockText: {
    fontSize: 13,
    fontFamily: fonts.bold,
  },
});
