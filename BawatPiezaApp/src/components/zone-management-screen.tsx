import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Modal, Pressable, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppText as Text } from "./app-text";
import { ScreenShell } from "./screen-shell";
import { scale } from "./glass-ui";
import { fonts, useTheme } from "../theme";

type Zone = {
  id: string;
  name: string;
  priority: "High" | "Standard";
  watts: number;
};

const FILTERS = ["All", "1F", "2F", "3F", "4F"] as const;
export const ZONES_STORAGE_KEY = "bawatpieza_manage_zones";

export function ZoneManagementScreen() {
  const { colors: c, mode } = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [addOpen, setAddOpen] = useState(false);
  const [zoneName, setZoneName] = useState("");
  const [zones, setZones] = useState<Zone[]>([
    { id: "1", name: "1F ROOM 109 - RIGHT WING", priority: "High", watts: 60 },
    { id: "2", name: "CR - RIGHT WING", priority: "High", watts: 60 },
  ]);

  useEffect(() => {
    AsyncStorage.getItem(ZONES_STORAGE_KEY)
      .then((stored) => {
        if (stored) setZones(JSON.parse(stored) as Zone[]);
      })
      .catch((error) => console.error("failed to load managed zones", error));
  }, []);

  const visibleZones = useMemo(
    () =>
      filter === "All"
        ? zones
        : zones.filter((zone) => zone.name.startsWith(filter)),
    [filter, zones],
  );

  const addZone = () => {
    const trimmedName = zoneName.trim();
    if (!trimmedName) return;
    setZones((current) => [
      ...current,
      {
        id: `${Date.now()}`,
        name: trimmedName.toUpperCase(),
        priority: "Standard",
        watts: 0,
      },
    ]);
    setZoneName("");
    setAddOpen(false);
  };

  return (
    <ScreenShell scroll title="Manage Zone" showBack>
      <View style={styles.content}>
        <Text style={[styles.eyebrow, { color: c.muted }]}>ZONE</Text>
        <Text style={[styles.heading, { color: c.text }]}>Manage Zone</Text>

        <Text style={[styles.sectionLabel, { color: c.muted }]}>ALL ZONES</Text>
        <View style={styles.filterRow}>
          {FILTERS.map((item) => {
            const active = filter === item;
            return (
              <Pressable
                key={item}
                onPress={() => setFilter(item)}
                style={[
                  styles.filter,
                  {
                    backgroundColor: active ? "#0E4BA5" : c.surface,
                    borderColor: active ? "#0E4BA5" : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    { color: active ? "#FFFFFF" : c.muted },
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => router.push("/pages/add-zone")}
          style={[styles.addCard, { backgroundColor: c.surface }]}
        >
          <View style={styles.addIcon}>
            <Ionicons name="add" size={scale(20)} color="#0E4BA5" />
          </View>
          <View style={styles.addCopy}>
            <Text style={[styles.addTitle, { color: c.text }]}>
              Add New Zone
            </Text>
            <Text style={[styles.addSubtitle, { color: c.muted }]}>
              Connect a zone to the BawatPieza!
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={scale(16)} color={c.muted} />
        </Pressable>

        <View style={[styles.tip, { backgroundColor: c.surface }]}>
          <Text style={[styles.tipText, { color: c.muted }]}>
            Do you want to smartly allocate the harvested energy?
          </Text>
          <Pressable onPress={() => router.push("/pages/power-management")}>
            <Text style={styles.tipLink}>Click here to be redirected to Allocation Tab.</Text>
          </Pressable>
        </View>

        <View style={styles.zoneList}>
          {visibleZones.map((zone) => (
            <Pressable
              key={zone.id}
              onPress={() => router.push(`/pages/zones/${zone.id}`)}
              style={[
                styles.zoneCard,
                {
                  backgroundColor: c.surface,
                  shadowColor: mode === "dark" ? "#000000" : "#9AAAC4",
                },
              ]}
            >
              <View style={styles.zoneCardTop}>
                <View style={styles.zoneTitleRow}>
                  <Text style={[styles.zoneName, { color: c.text }]}>
                    {zone.name}
                  </Text>
                  <Text style={styles.priority}>{zone.priority} priority</Text>
                </View>
                <Pressable
                  onPress={() => router.push(`/pages/zones/${zone.id}`)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${zone.name}`}
                >
                  <Ionicons name="create-outline" size={scale(23)} color="#0C3782" />
                </Pressable>
              </View>
              <View style={styles.deviceIcons}>
                {[1, 2, 3, 4].map((item) => (
                  <View key={item} style={styles.deviceIcon}>
                    <Ionicons name="bulb" size={scale(14)} color="#FFFFFF" />
                  </View>
                ))}
              </View>
              <Text style={[styles.total, { color: c.muted }]}>
                Total of: <Text style={styles.totalValue}>{zone.watts}w</Text>
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Modal visible={addOpen} transparent animationType="fade" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Add New Zone</Text>
            <TextInput
              value={zoneName}
              onChangeText={setZoneName}
              placeholder="Zone name"
              placeholderTextColor={c.muted}
              autoFocus
              style={[styles.input, { color: c.text, borderColor: c.line }]}
            />
            <View style={styles.modalActions}>
              <Pressable onPress={() => setAddOpen(false)} style={styles.modalButton}>
                <Text style={[styles.modalButtonText, { color: c.muted }]}>Cancel</Text>
              </Pressable>
              <Pressable onPress={addZone} style={[styles.modalButton, styles.modalPrimary]}>
                <Text style={styles.modalPrimaryText}>Add Zone</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: scale(2), paddingBottom: scale(30) },
  eyebrow: { fontSize: scale(9), letterSpacing: 1.3, fontFamily: fonts.extrabold },
  heading: { fontSize: scale(22), lineHeight: scale(28), fontFamily: fonts.extrabold, marginTop: scale(1) },
  sectionLabel: { fontSize: scale(9), letterSpacing: 1.2, fontFamily: fonts.extrabold, marginTop: scale(20), marginBottom: scale(8) },
  filterRow: { flexDirection: "row", gap: scale(8), marginBottom: scale(16) },
  filter: { width: scale(42), height: scale(38), borderRadius: scale(20), alignItems: "center", justifyContent: "center", borderWidth: 1 },
  filterText: { fontSize: scale(10), fontFamily: fonts.extrabold },
  addCard: { minHeight: scale(56), borderRadius: scale(18), flexDirection: "row", alignItems: "center", paddingHorizontal: scale(14), shadowColor: "#9AAAC4", shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  addIcon: { width: scale(30), height: scale(30), borderRadius: scale(9), backgroundColor: "#EAF2FF", alignItems: "center", justifyContent: "center" },
  addCopy: { flex: 1, marginLeft: scale(10) },
  addTitle: { fontSize: scale(10), fontFamily: fonts.extrabold },
  addSubtitle: { fontSize: scale(8), fontFamily: fonts.medium, marginTop: scale(2) },
  tip: { borderRadius: scale(16), paddingHorizontal: scale(13), paddingVertical: scale(8), marginTop: scale(12), marginBottom: scale(12) },
  tipText: { fontSize: scale(8), fontFamily: fonts.medium },
  tipLink: { color: "#49608C", fontSize: scale(8), fontFamily: fonts.bold, fontStyle: "italic", textDecorationLine: "underline", marginTop: scale(1) },
  zoneList: { gap: scale(9) },
  zoneCard: { minHeight: scale(84), borderRadius: scale(17), padding: scale(13), shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  zoneCardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  zoneTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: scale(7), paddingRight: scale(8) },
  zoneName: { fontSize: scale(10), fontFamily: fonts.extrabold, flexShrink: 1 },
  priority: { color: "#E86A24", backgroundColor: "#FFF0E8", borderRadius: scale(7), paddingHorizontal: scale(6), paddingVertical: scale(2), fontSize: scale(6.5), fontFamily: fonts.extrabold },
  deviceIcons: { flexDirection: "row", gap: scale(8), marginTop: scale(8) },
  deviceIcon: { width: scale(19), height: scale(19), borderRadius: scale(10), backgroundColor: "#F6A01A", alignItems: "center", justifyContent: "center" },
  total: { fontSize: scale(8), fontFamily: fonts.medium, marginTop: scale(5) },
  totalValue: { color: "#586B92", fontFamily: fonts.extrabold },
  modalBackdrop: { flex: 1, backgroundColor: "rgba(8,25,55,0.42)", justifyContent: "center", padding: scale(24) },
  modalCard: { borderRadius: scale(22), padding: scale(18) },
  modalTitle: { fontSize: scale(16), fontFamily: fonts.extrabold, marginBottom: scale(12) },
  input: { minHeight: scale(44), borderWidth: 1, borderRadius: scale(12), paddingHorizontal: scale(12), fontSize: scale(12), fontFamily: fonts.medium },
  modalActions: { flexDirection: "row", justifyContent: "flex-end", gap: scale(8), marginTop: scale(14) },
  modalButton: { paddingHorizontal: scale(13), paddingVertical: scale(9), borderRadius: scale(10) },
  modalPrimary: { backgroundColor: "#0E4BA5" },
  modalButtonText: { fontSize: scale(10), fontFamily: fonts.bold },
  modalPrimaryText: { color: "#FFFFFF", fontSize: scale(10), fontFamily: fonts.bold },
});
