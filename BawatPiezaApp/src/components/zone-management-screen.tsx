import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  View,
  ScrollView,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from "react-native";
import { AppText as Text } from "./app-text";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

import { ScreenShell } from "./screen-shell";
import { Card, scale } from "./glass-ui";
import { fonts, useTheme, type Mode, type ThemeColors } from "../theme";

type Device = {
  id: string;
  name: string;
  type: "bulb" | "outlet" | "fan" | "custom";
  watts: number;
  channel: number;
};

type Zone = {
  id: string;
  name: string;
  priority: "high" | "standard";
  wantedHours: number;
  devices: Device[];
};

export function ZoneManagementScreen() {
  const { colors: c, mode } = useTheme();

  const [zones, setZones] = useState<Zone[]>([
    {
      id: "1f",
      name: "1f room 109 - right wing",
      priority: "high",
      wantedHours: 12,
      devices: [
        {
          id: "d1",
          name: "main overhead lighting",
          type: "bulb",
          watts: 15,
          channel: 1,
        },
      ],
    },
  ]);

  // available relay channels on ur single esp32
  const espChannels = [1, 2, 3, 4, 5, 6, 7, 8];

  const [deviceModalVisible, setDeviceModalVisible] = useState(false);
  const [zoneModalVisible, setZoneModalVisible] = useState(false);
  const [activeZoneId, setActiveZoneId] = useState<string | null>(null);

  // form state for new device mapping
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [newDevName, setNewDevName] = useState("");
  const [newDevWatts, setNewDevWatts] = useState("");
  const [newDevType, setNewDevType] = useState<Device["type"]>("bulb");

  // form state for new zone
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneHours, setNewZoneHours] = useState("");
  const [newZonePriority, setNewZonePriority] =
    useState<Zone["priority"]>("standard");

  const openAddDevice = (zoneId: string) => {
    setActiveZoneId(zoneId);
    setSelectedChannel(null);
    setNewDevName("");
    setNewDevWatts("");
    setNewDevType("bulb");
    setDeviceModalVisible(true);
  };

  const saveDevice = () => {
    if (!activeZoneId || !selectedChannel || !newDevName || !newDevWatts)
      return;

    setZones((prev) =>
      prev.map((z) => {
        if (z.id === activeZoneId) {
          return {
            ...z,
            devices: [
              ...z.devices,
              {
                id: Math.random().toString(),
                name: newDevName,
                type: newDevType,
                watts: Number(newDevWatts),
                channel: selectedChannel,
              },
            ],
          };
        }
        return z;
      }),
    );
    setDeviceModalVisible(false);
  };

  const removeDevice = (zoneId: string, deviceId: string) => {
    setZones((prev) =>
      prev.map((z) => {
        if (z.id === zoneId) {
          return { ...z, devices: z.devices.filter((d) => d.id !== deviceId) };
        }
        return z;
      }),
    );
  };

  const saveZone = () => {
    if (!newZoneName || !newZoneHours) return;

    setZones((prev) => [
      ...prev,
      {
        id: Math.random().toString(),
        name: newZoneName,
        priority: newZonePriority,
        wantedHours: Number(newZoneHours),
        devices: [],
      },
    ]);

    setZoneModalVisible(false);
    setNewZoneName("");
    setNewZoneHours("");
    setNewZonePriority("standard");
  };

  const removeZone = (zoneId: string) => {
    setZones((prev) => prev.filter((z) => z.id !== zoneId));
  };

  const totalCampusWatts = zones.reduce((acc, zone) => {
    return acc + zone.devices.reduce((dAcc, dev) => dAcc + dev.watts, 0);
  }, 0);

  return (
    <ScreenShell scroll title="zone manager">
      <View
        style={[
          styles.headerCard,
          { backgroundColor: c.surface, borderColor: c.line },
        ]}
      >
        <View style={styles.headerRow}>
          <View
            style={[
              styles.iconBox,
              { backgroundColor: "rgba(249, 115, 22, 0.15)" },
            ]}
          >
            <Ionicons
              name="hardware-chip-outline"
              size={scale(22)}
              color="#F97316"
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: c.text }]}>
              central esp32 mapping
            </Text>
            <Text style={[styles.headerSubtitle, { color: c.muted }]}>
              {zones.length} active zones configured
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={[styles.totalWatts, { color: c.text }]}>
              {totalCampusWatts}w
            </Text>
            <Text style={[styles.headerSubtitle, { color: c.orange }]}>
              total draw
            </Text>
          </View>
        </View>
      </View>

      {zones.map((zone) => {
        const zoneWatts = zone.devices.reduce((acc, dev) => acc + dev.watts, 0);

        return (
          <Card key={zone.id} mode={mode} style={styles.zoneCard}>
            <View style={styles.zoneHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.zoneTitle, { color: c.text }]}>
                  {zone.name}
                </Text>
                <View style={styles.chips}>
                  <Text
                    style={[
                      styles.priority,
                      { color: c.orange, backgroundColor: c.accentSoft },
                    ]}
                  >
                    {zone.priority} priority
                  </Text>
                  <Text
                    style={[
                      styles.batteryChip,
                      { color: c.accent, backgroundColor: c.surfaceMuted },
                    ]}
                  >
                    {zone.wantedHours}h target
                  </Text>
                  <Text
                    style={[
                      styles.batteryChip,
                      { color: c.text, backgroundColor: c.surfaceMuted },
                    ]}
                  >
                    {zoneWatts}w max
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => removeZone(zone.id)}
                style={styles.editBtn}
              >
                <Ionicons
                  name="trash-outline"
                  size={scale(18)}
                  color="#EF4444"
                />
              </Pressable>
            </View>

            <View
              style={[
                styles.deviceList,
                {
                  borderTopColor:
                    mode === "dark"
                      ? "rgba(255,255,255,0.08)"
                      : "rgba(0,0,0,0.06)",
                },
              ]}
            >
              {zone.devices.map((dev) => (
                <View key={dev.id} style={styles.deviceRow}>
                  <View
                    style={[
                      styles.devIcon,
                      { backgroundColor: c.surfaceMuted },
                    ]}
                  >
                    <Ionicons
                      name={
                        dev.type === "bulb"
                          ? "bulb-outline"
                          : dev.type === "fan"
                            ? "snow-outline"
                            : "power-outline"
                      }
                      size={scale(14)}
                      color={c.orange}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.devName, { color: c.text }]}>
                      {dev.name}
                    </Text>
                    <Text style={[styles.devSub, { color: c.muted }]}>
                      esp32 relay channel {dev.channel}
                    </Text>
                  </View>
                  <Text style={[styles.devWatts, { color: c.text }]}>
                    {dev.watts}w
                  </Text>
                  <Pressable
                    onPress={() => removeDevice(zone.id, dev.id)}
                    style={styles.delBtn}
                  >
                    <Ionicons
                      name="close-circle-outline"
                      size={scale(16)}
                      color={c.muted}
                    />
                  </Pressable>
                </View>
              ))}

              <Pressable
                onPress={() => openAddDevice(zone.id)}
                style={[
                  styles.addDevBtn,
                  { borderColor: c.line, backgroundColor: c.surfaceMuted },
                ]}
              >
                <Ionicons name="add" size={scale(14)} color={c.orange} />
                <Text style={[styles.addDevText, { color: c.orange }]}>
                  assign hardware channel
                </Text>
              </Pressable>
            </View>
          </Card>
        );
      })}

      <Pressable
        style={styles.actionButton}
        onPress={() => setZoneModalVisible(true)}
      >
        <LinearGradient
          colors={["#F8A742", "#F05A16"]}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.actionText}>create new zone</Text>
      </Pressable>

      {/* --- ADD HARDWARE CHANNEL MODAL --- */}
      <Modal visible={deviceModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalOverlay}
          >
            <View
              style={[
                styles.modalCard,
                {
                  backgroundColor: c.surface,
                  borderColor: c.line,
                  maxHeight: "90%",
                },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: c.text }]}>
                  assign relay channel
                </Text>
                <Pressable
                  onPress={() => setDeviceModalVisible(false)}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={scale(20)} color={c.muted} />
                </Pressable>
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                <Text
                  style={[styles.inputLabel, { color: c.muted, marginTop: 0 }]}
                >
                  esp32 relay pin
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginBottom: scale(14) }}
                >
                  {espChannels.map((ch) => (
                    <Pressable
                      key={ch}
                      onPress={() => setSelectedChannel(ch)}
                      style={[
                        styles.nodeCard,
                        {
                          backgroundColor:
                            selectedChannel === ch
                              ? "rgba(249,115,22,0.1)"
                              : c.surfaceMuted,
                          borderColor:
                            selectedChannel === ch ? c.orange : c.line,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.nodeId,
                          { color: selectedChannel === ch ? c.orange : c.text },
                        ]}
                      >
                        ch {ch}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>

                {selectedChannel !== null && (
                  <>
                    <Text style={[styles.inputLabel, { color: c.muted }]}>
                      friendly device name
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          color: c.text,
                          borderColor: c.line,
                          backgroundColor:
                            mode === "dark" ? "#1A1D24" : "#F8FAFC",
                        },
                      ]}
                      placeholder="e.g. overhead bulb 1"
                      placeholderTextColor={c.muted}
                      value={newDevName}
                      onChangeText={setNewDevName}
                    />

                    <Text style={[styles.inputLabel, { color: c.muted }]}>
                      max power draw (watts)
                    </Text>
                    <TextInput
                      style={[
                        styles.input,
                        {
                          color: c.text,
                          borderColor: c.line,
                          backgroundColor:
                            mode === "dark" ? "#1A1D24" : "#F8FAFC",
                        },
                      ]}
                      placeholder="e.g. 15"
                      placeholderTextColor={c.muted}
                      keyboardType="numeric"
                      value={newDevWatts}
                      onChangeText={setNewDevWatts}
                    />

                    <Text style={[styles.inputLabel, { color: c.muted }]}>
                      device type
                    </Text>
                    <View style={styles.typeRow}>
                      {(["bulb", "outlet", "fan"] as const).map((t) => (
                        <Pressable
                          key={t}
                          onPress={() => setNewDevType(t)}
                          style={[
                            styles.typePill,
                            {
                              backgroundColor:
                                newDevType === t ? c.orange : c.surfaceMuted,
                              borderColor: newDevType === t ? c.orange : c.line,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.typeText,
                              { color: newDevType === t ? "#FFF" : c.muted },
                            ]}
                          >
                            {t}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    <Pressable style={styles.saveBtn} onPress={saveDevice}>
                      <LinearGradient
                        colors={["#F8A742", "#F05A16"]}
                        style={StyleSheet.absoluteFill}
                      />
                      <Text style={styles.actionText}>
                        link channel to zone
                      </Text>
                    </Pressable>
                  </>
                )}
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>

      {/* --- CREATE ZONE MODAL --- */}
      <Modal visible={zoneModalVisible} transparent animationType="slide">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalOverlay}
          >
            <View
              style={[
                styles.modalCard,
                { backgroundColor: c.surface, borderColor: c.line },
              ]}
            >
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: c.text }]}>
                  create new zone
                </Text>
                <Pressable
                  onPress={() => setZoneModalVisible(false)}
                  hitSlop={10}
                >
                  <Ionicons name="close" size={scale(20)} color={c.muted} />
                </Pressable>
              </View>

              <Text style={[styles.inputLabel, { color: c.muted }]}>
                zone name
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: c.text,
                    borderColor: c.line,
                    backgroundColor: mode === "dark" ? "#1A1D24" : "#F8FAFC",
                  },
                ]}
                placeholder="e.g. 3f library"
                placeholderTextColor={c.muted}
                value={newZoneName}
                onChangeText={setNewZoneName}
              />

              <Text style={[styles.inputLabel, { color: c.muted }]}>
                target runtime (hours/day)
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    color: c.text,
                    borderColor: c.line,
                    backgroundColor: mode === "dark" ? "#1A1D24" : "#F8FAFC",
                  },
                ]}
                placeholder="e.g. 8"
                placeholderTextColor={c.muted}
                keyboardType="numeric"
                value={newZoneHours}
                onChangeText={setNewZoneHours}
              />

              <Text style={[styles.inputLabel, { color: c.muted }]}>
                power priority
              </Text>
              <View style={styles.typeRow}>
                {(["high", "standard"] as const).map((p) => (
                  <Pressable
                    key={p}
                    onPress={() => setNewZonePriority(p)}
                    style={[
                      styles.typePill,
                      {
                        backgroundColor:
                          newZonePriority === p ? c.orange : c.surfaceMuted,
                        borderColor: newZonePriority === p ? c.orange : c.line,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.typeText,
                        { color: newZonePriority === p ? "#FFF" : c.muted },
                      ]}
                    >
                      {p}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Pressable style={styles.saveBtn} onPress={saveZone}>
                <LinearGradient
                  colors={["#F8A742", "#F05A16"]}
                  style={StyleSheet.absoluteFill}
                />
                <Text style={styles.actionText}>save zone</Text>
              </Pressable>
            </View>
          </KeyboardAvoidingView>
        </TouchableWithoutFeedback>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  headerCard: {
    borderRadius: scale(18),
    padding: scale(16),
    borderWidth: 1,
    marginBottom: scale(16),
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(12),
  },
  iconBox: {
    width: scale(40),
    height: scale(40),
    borderRadius: scale(14),
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: scale(13),
    fontFamily: fonts.extrabold,
  },
  headerSubtitle: {
    fontSize: scale(9),
    fontFamily: fonts.medium,
    marginTop: scale(2),
  },
  totalWatts: {
    fontSize: scale(16),
    fontFamily: fonts.extrabold,
  },
  zoneCard: {
    padding: scale(14),
    borderRadius: scale(18),
    marginBottom: scale(14),
  },
  zoneHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  zoneTitle: {
    fontSize: scale(12),
    fontFamily: fonts.bold,
  },
  editBtn: {
    padding: scale(4),
  },
  chips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: scale(6),
    marginTop: scale(8),
  },
  priority: {
    paddingHorizontal: scale(7),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    fontSize: scale(8),
    fontFamily: fonts.bold,
  },
  batteryChip: {
    paddingHorizontal: scale(7),
    paddingVertical: scale(3),
    borderRadius: scale(8),
    fontSize: scale(8),
    fontFamily: fonts.bold,
  },
  deviceList: {
    marginTop: scale(12),
    paddingTop: scale(12),
    borderTopWidth: 1,
  },
  deviceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(10),
    marginBottom: scale(10),
  },
  devIcon: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(8),
    alignItems: "center",
    justifyContent: "center",
  },
  devName: {
    fontSize: scale(10),
    fontFamily: fonts.bold,
  },
  devSub: {
    fontSize: scale(8),
    fontFamily: fonts.medium,
    marginTop: scale(2),
  },
  devWatts: {
    fontSize: scale(11),
    fontFamily: fonts.extrabold,
  },
  delBtn: {
    padding: scale(4),
    marginLeft: scale(4),
  },
  addDevBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(6),
    paddingVertical: scale(10),
    borderRadius: scale(10),
    borderWidth: 1,
    borderStyle: "dashed",
    marginTop: scale(4),
  },
  addDevText: {
    fontSize: scale(9.5),
    fontFamily: fonts.bold,
  },
  actionButton: {
    minHeight: scale(44),
    borderRadius: scale(14),
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginTop: scale(6),
    marginBottom: scale(30),
  },
  actionText: {
    color: "#FFFFFF",
    fontSize: scale(10),
    fontFamily: fonts.bold,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  modalCard: {
    borderTopLeftRadius: scale(24),
    borderTopRightRadius: scale(24),
    padding: scale(20),
    paddingBottom: scale(40),
    borderTopWidth: 1,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: scale(10),
  },
  modalTitle: {
    fontSize: scale(14),
    fontFamily: fonts.extrabold,
  },
  inputLabel: {
    fontSize: scale(9),
    fontFamily: fonts.bold,
    marginBottom: scale(6),
    marginTop: scale(12),
  },
  input: {
    borderWidth: 1,
    borderRadius: scale(10),
    paddingHorizontal: scale(12),
    height: scale(40),
    fontSize: scale(11),
    fontFamily: fonts.medium,
  },
  typeRow: {
    flexDirection: "row",
    gap: scale(8),
  },
  typePill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: scale(36),
    borderRadius: scale(10),
    borderWidth: 1,
  },
  typeText: {
    fontSize: scale(10),
    fontFamily: fonts.bold,
  },
  saveBtn: {
    minHeight: scale(44),
    borderRadius: scale(14),
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginTop: scale(24),
  },
  nodeCard: {
    padding: scale(10),
    borderRadius: scale(10),
    borderWidth: 1,
    marginRight: scale(8),
    alignItems: "center",
    width: scale(60),
  },
  nodeId: {
    fontSize: scale(10),
    fontFamily: fonts.bold,
  },
});
