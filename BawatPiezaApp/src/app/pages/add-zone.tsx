import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AppText as Text } from "../../components/app-text";
import { ScreenShell } from "../../components/screen-shell";
import { scale } from "../../components/glass-ui";
import { fonts, useTheme } from "../../theme";
import { ZONES_STORAGE_KEY } from "../../components/zone-management-screen";

const ROOM_TYPES = ["Classroom", "Office", "Laboratory", "Common area"];
const BUILDINGS = ["Main Building", "Science Building", "Admin Building", "Gymnasium"];
const FLOORS = ["Ground Floor", "1F", "2F", "3F", "4F"];
const PRIORITIES = ["High", "Standard"] as const;
const SCHEDULES = ["Always on", "Morning & evening", "Custom schedule"];

export default function AddZoneScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const [building, setBuilding] = useState(BUILDINGS[0]);
  const [floor, setFloor] = useState(FLOORS[1]);
  const [roomCode, setRoomCode] = useState("");
  const [roomType, setRoomType] = useState(ROOM_TYPES[0]);
  const [installedBulbs, setInstalledBulbs] = useState("4");
  const [priority, setPriority] = useState<(typeof PRIORITIES)[number]>("Standard");
  const [schedule, setSchedule] = useState(SCHEDULES[0]);
  const [error, setError] = useState("");

  const saveZone = async () => {
    if (!building.trim() || !floor.trim() || !roomCode.trim()) {
      setError("Complete the building, floor, and room code fields.");
      return;
    }
    const bulbs = Math.max(0, Number(installedBulbs) || 0);
    try {
      const stored = await AsyncStorage.getItem(ZONES_STORAGE_KEY);
      const zones = stored ? (JSON.parse(stored) as Array<Record<string, unknown>>) : [];
      zones.push({
        id: `${Date.now()}`,
        name: `${floor.trim().toUpperCase()} ${roomCode.trim().toUpperCase()} - ${building.trim().toUpperCase()}`,
        priority,
        watts: bulbs * 15,
        building: building.trim(),
        floor: floor.trim(),
        roomCode: roomCode.trim(),
        roomType,
        installedBulbs: bulbs,
        schedule,
      });
      await AsyncStorage.setItem(ZONES_STORAGE_KEY, JSON.stringify(zones));
      router.replace("/pages/zones");
    } catch (saveError) {
      console.error("failed to save managed zone", saveError);
      setError("The zone could not be saved. Please try again.");
    }
  };

  return (
    <ScreenShell scroll title="Add New Zone" showBack>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="layers-outline" size={scale(24)} color="#F97316" />
        </View>
        <View style={styles.heroCopy}>
          <Text style={[styles.eyebrow, { color: c.muted }]}>ZONE SETUP</Text>
          <Text style={[styles.title, { color: c.text }]}>Add New Zone</Text>
          <Text style={[styles.subtitle, { color: c.muted }]}>
            Create a room profile for smarter lighting control.
          </Text>
        </View>
      </View>

      <ChoiceField label="BUILDING" options={BUILDINGS} value={building} onChange={setBuilding} c={c} />
      <ChoiceField label="FLOOR" options={FLOORS} value={floor} onChange={setFloor} c={c} />
      <Field label="ROOM CODE" value={roomCode} onChangeText={setRoomCode} placeholder="e.g. Room 109" c={c} />

      <ChoiceField label="ROOM TYPE" options={ROOM_TYPES} value={roomType} onChange={setRoomType} c={c} />

      <Text style={[styles.label, { color: c.muted }]}>INSTALLED BULBS</Text>
      <View style={styles.stepper}>
        <Pressable onPress={() => setInstalledBulbs(String(Math.max(0, Number(installedBulbs) - 1)))} style={styles.stepButton}>
          <Ionicons name="remove" size={scale(18)} color="#F97316" />
        </Pressable>
        <TextInput value={installedBulbs} onChangeText={setInstalledBulbs} keyboardType="number-pad" style={[styles.stepValue, { color: c.text }]} />
        <Pressable onPress={() => setInstalledBulbs(String((Number(installedBulbs) || 0) + 1))} style={styles.stepButton}>
          <Ionicons name="add" size={scale(18)} color="#F97316" />
        </Pressable>
      </View>

      <ChoiceField label="LIGHTING PRIORITY" options={[...PRIORITIES]} value={priority} onChange={setPriority} c={c} />
      <ChoiceField label="SCHEDULE TEMPLATE" options={SCHEDULES} value={schedule} onChange={setSchedule} c={c} />

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable onPress={saveZone} style={styles.saveButton}>
        <Text style={styles.saveText}>Create Zone</Text>
        <Ionicons name="arrow-forward" size={scale(17)} color="#FFFFFF" />
      </Pressable>
    </ScreenShell>
  );
}

function Field({ label, value, onChangeText, placeholder, c }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; c: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted} style={[styles.input, { color: c.text, borderColor: c.line, backgroundColor: c.surface }]} />
    </View>
  );
}

function ChoiceField({ label, options, value, onChange, c }: { label: string; options: string[]; value: string; onChange: (value: any) => void; c: ReturnType<typeof useTheme>["colors"] }) {
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: c.muted }]}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.choiceRow}>
        {options.map((option) => (
          <Pressable key={option} onPress={() => onChange(option)} style={[styles.choice, { backgroundColor: value === option ? "#F97316" : c.surface, borderColor: value === option ? "#F97316" : c.line }]}>
            <Text style={[styles.choiceText, { color: value === option ? "#FFFFFF" : c.muted }]}>{option}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: scale(12), paddingVertical: scale(8), marginBottom: scale(14) },
  heroIcon: { width: scale(48), height: scale(48), borderRadius: scale(16), backgroundColor: "rgba(249,115,22,0.14)", alignItems: "center", justifyContent: "center" },
  heroCopy: { flex: 1 },
  eyebrow: { fontSize: scale(8), letterSpacing: 1.2, fontFamily: fonts.extrabold },
  title: { fontSize: scale(21), fontFamily: fonts.extrabold, marginTop: scale(2) },
  subtitle: { fontSize: scale(9), fontFamily: fonts.medium, lineHeight: scale(13), marginTop: scale(3) },
  field: { marginBottom: scale(13) },
  label: { fontSize: scale(8), letterSpacing: 1, fontFamily: fonts.extrabold, marginBottom: scale(6) },
  input: { minHeight: scale(44), borderWidth: 1, borderRadius: scale(13), paddingHorizontal: scale(13), fontSize: scale(11), fontFamily: fonts.medium },
  choiceRow: { gap: scale(7) },
  choice: { minHeight: scale(38), borderRadius: scale(12), borderWidth: 1, paddingHorizontal: scale(12), alignItems: "center", justifyContent: "center" },
  choiceText: { fontSize: scale(9), fontFamily: fonts.bold },
  stepper: { minHeight: scale(48), borderRadius: scale(13), borderWidth: 1, borderColor: "#F6C9A7", backgroundColor: "#FFFFFF", flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: scale(6), marginBottom: scale(13) },
  stepButton: { width: scale(34), height: scale(34), borderRadius: scale(10), backgroundColor: "rgba(249,115,22,0.14)", alignItems: "center", justifyContent: "center" },
  stepValue: { flex: 1, textAlign: "center", fontSize: scale(15), fontFamily: fonts.extrabold },
  error: { color: "#C2410C", fontSize: scale(9), fontFamily: fonts.bold, marginBottom: scale(9) },
  saveButton: { minHeight: scale(49), borderRadius: scale(15), backgroundColor: "#F97316", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: scale(8), marginTop: scale(8), marginBottom: scale(22), shadowColor: "#EA580C", shadowOpacity: 0.25, shadowRadius: scale(8), shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  saveText: { color: "#FFFFFF", fontSize: scale(12), fontFamily: fonts.extrabold },
});
