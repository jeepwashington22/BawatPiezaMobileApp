import { Ionicons } from "@expo/vector-icons";
import { View } from "react-native";
import { AppText as Text } from "../../components/app-text";
import { ScreenShell } from "../../components/screen-shell";
import { useTheme } from "../../theme";
import { scale } from "../../components/glass-ui";

export default function FirmwareUpdateScreen() {
  const { colors: c } = useTheme();

  return (
    <ScreenShell scroll title="Firmware Update">
      <View
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingVertical: scale(48),
        }}
      >
        <Ionicons
          name="cloud-download-outline"
          size={scale(42)}
          color={c.muted}
        />
        <Text
          style={{
            color: c.text,
            fontSize: scale(16),
            fontWeight: "700",
            marginTop: scale(16),
            textAlign: "center",
          }}
        >
          Firmware updates are not available yet.
        </Text>
      </View>
    </ScreenShell>
  );
}