import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppText as Text } from "../../../components/app-text";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Card, Glass, scale } from "../../../components/glass-ui";
import { fonts, type Mode, type ThemeColors } from "../../../theme";
import { usePowerOverride } from "../../../hooks/use-power-override";
import { styles } from "./styles";
import { SectionLabel, ThresholdCard, ScheduleRow, ActionButton, ZoneCard } from "./shared";

export function Override({ c }: { c: ThemeColors }) {
  const { override, setOverride } = usePowerOverride();
  const options = [
    {
      value: "grid" as const,
      label: "Force Grid",
      icon: "flash-outline" as const,
      color: c.gridGreen,
    },
    {
      value: "battery" as const,
      label: "Force Battery",
      icon: "battery-charging-outline" as const,
      color: c.orange,
    },
    {
      value: "shutdown" as const,
      label: "Shutdown",
      icon: "power-outline" as const,
      color: c.danger,
    },
  ];

  return (
    <>
      <View
        style={[
          styles.overrideIntro,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <View
          style={[styles.overrideIntroIcon, { backgroundColor: c.accentSoft }]}
        >
          <Ionicons
            name="flash-outline"
            size={scale(20)}
            color={override === "grid" ? c.gridGreen : c.orange}
          />
        </View>
        <View style={styles.overrideIntroCopy}>
          <Text style={[styles.overrideTitle, { color: c.text }]}>
            Power override
          </Text>
          <Text style={[styles.overrideCopy, { color: c.muted }]}>
            Choose which source should supply all zones right now.
          </Text>
        </View>
      </View>

      <SectionLabel label="SELECT POWER SOURCE" c={c} />
      <View style={styles.overrideOptions}>
        {options.map((option) => {
          const active = override === option.value;
          return (
            <Pressable
              key={option.value}
              onPress={() => setOverride(option.value)}
              style={[
                styles.overrideOption,
                {
                  backgroundColor: active ? c.accentSoft : c.surface,
                  borderColor: active ? option.color : c.line,
                },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
            >
              <Ionicons
                name={option.icon}
                size={scale(21)}
                color={option.color}
              />
              <Text style={[styles.overrideOptionText, { color: c.text }]}>
                {option.label}
              </Text>
              <Ionicons
                name={active ? "radio-button-on" : "radio-button-off"}
                size={scale(18)}
                color={active ? option.color : c.muted}
              />
            </Pressable>
          );
        })}
      </View>

      <View
        style={[
          styles.overrideStatus,
          { backgroundColor: c.surfaceMuted, borderColor: c.line },
        ]}
      >
        <View
          style={[
            styles.statusDot,
            {
              backgroundColor:
                override === "grid"
                  ? c.gridGreen
                  : override
                    ? c.orange
                    : c.muted,
            },
          ]}
        />
        <Text style={[styles.overrideStatusText, { color: c.muted }]}>
          {override === "grid"
            ? "Grid is supplying all zones."
            : override === "battery"
              ? "Battery is supplying all zones."
              : override === "shutdown"
                ? "Power is shut down for all zones."
                : "Automatic power selection is active."}
        </Text>
      </View>
    </>
  );
}

