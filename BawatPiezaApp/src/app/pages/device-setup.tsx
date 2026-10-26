import { useState } from "react";
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { AppText as Text } from "../../components/app-text";
import { ScreenShell } from "../../components/screen-shell";
import { scale } from "../../components/glass-ui";
import { ZONES_STORAGE_KEY } from "../../components/zone-management-screen";
import { useAuth } from "../../hooks/use-auth";
import { deviceSetupRequiredKey } from "../../lib/device-setup";
import { fonts, useTheme } from "../../theme";

const MAX_CHANNELS = 5;
const MAX_ROOMS_PER_CHANNEL = 5;
const MAX_BULBS_PER_ROOM = 5;

type RoomSetup = {
  name: string;
  bulbs: number;
};

type ChannelSetup = {
  rooms: RoomSetup[];
};

type StoredZone = {
  id: string;
  name: string;
  priority: "Standard";
  watts: number;
  channel: number;
  installedBulbs: number;
  roomType: string;
};

export default function DeviceSetupScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const { colors: c } = useTheme();
  const [channels, setChannels] = useState<ChannelSetup[]>(
    Array.from({ length: MAX_CHANNELS }, () => ({ rooms: [] })),
  );
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const setRoomCount = (channelIndex: number, count: number) => {
    setChannels((current) =>
      current.map((channel, index) => {
        if (index !== channelIndex) return channel;
        const rooms = channel.rooms.slice(0, count);
        while (rooms.length < count) {
          rooms.push({
            name: `Channel ${channelIndex + 1} Room ${rooms.length + 1}`,
            bulbs: 1,
          });
        }
        return { rooms };
      }),
    );
  };

  const updateRoom = (
    channelIndex: number,
    roomIndex: number,
    updates: Partial<RoomSetup>,
  ) => {
    setChannels((current) =>
      current.map((channel, index) =>
        index === channelIndex
          ? {
              rooms: channel.rooms.map((room, index) =>
                index === roomIndex ? { ...room, ...updates } : room,
              ),
            }
          : channel,
      ),
    );
  };

  const finishSetup = async () => {
    const configuredRooms = channels.flatMap((channel, channelIndex) =>
      channel.rooms.map((room, roomIndex) => ({
        ...room,
        channel: channelIndex + 1,
        roomIndex,
      })),
    );
    if (configuredRooms.length === 0) {
      setError("Set up at least one room before continuing.");
      return;
    }
    if (configuredRooms.some((room) => !room.name.trim())) {
      setError("Enter a name for each room.");
      return;
    }
    if (!user?.id) {
      setError("Your account could not be verified. Please sign in again.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const stored = await AsyncStorage.getItem(ZONES_STORAGE_KEY);
      const existingZones = stored
        ? (JSON.parse(stored) as StoredZone[])
        : [];
      const newZones: StoredZone[] = configuredRooms.map((room) => ({
        id: `setup-${user.id}-${room.channel}-${room.roomIndex + 1}`,
        name: room.name.trim(),
        priority: "Standard",
        watts: room.bulbs * 15,
        channel: room.channel,
        installedBulbs: room.bulbs,
        roomType: "Room",
      }));
      const newZoneIds = new Set(newZones.map((zone) => zone.id));
      const retainedZones = existingZones.filter((zone) => !newZoneIds.has(zone.id));
      await AsyncStorage.setItem(
        ZONES_STORAGE_KEY,
        JSON.stringify([...retainedZones, ...newZones]),
      );
      await AsyncStorage.removeItem(deviceSetupRequiredKey(user.id));
      router.replace("/home");
    } catch (saveError) {
      console.error("[device-setup] Could not save device rooms:", saveError);
      setError("Room setup could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenShell scroll title="Device Setup">
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="grid-outline" size={scale(23)} color="#F97316" />
        </View>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: c.muted }]}>DEVICE SETUP</Text>
          <Text style={[styles.heading, { color: c.text }]}>
            Configure your rooms
          </Text>
          <Text style={[styles.subtitle, { color: c.muted }]}>
            Choose how many rooms are connected to each channel, then enter
            the installed bulb count for every room.
          </Text>
        </View>
      </View>

      <View style={[styles.limitNote, { backgroundColor: c.surface }]}>
        <Ionicons name="information-circle-outline" size={scale(17)} color="#F97316" />
        <Text style={[styles.limitText, { color: c.muted }]}>
          Up to 5 rooms per channel and 5 bulbs per room.
        </Text>
      </View>

      {channels.map((channel, channelIndex) => (
        <View
          key={`channel-${channelIndex + 1}`}
          style={[styles.channelCard, { backgroundColor: c.surface, borderColor: c.line }]}
        >
          <View style={styles.channelHeader}>
            <View>
              <Text style={[styles.channelLabel, { color: c.muted }]}>CHANNEL</Text>
              <Text style={[styles.channelTitle, { color: c.text }]}>
                Channel {channelIndex + 1}
              </Text>
            </View>
            <View style={styles.countSelector}>
              <Pressable
                onPress={() => setRoomCount(channelIndex, Math.max(0, channel.rooms.length - 1))}
                disabled={channel.rooms.length === 0}
                style={styles.countButton}
                accessibilityLabel={`Remove a room from channel ${channelIndex + 1}`}
              >
                <Ionicons name="remove" size={scale(17)} color="#F97316" />
              </Pressable>
              <Text style={[styles.countValue, { color: c.text }]}>{channel.rooms.length}</Text>
              <Pressable
                onPress={() =>
                  setRoomCount(
                    channelIndex,
                    Math.min(MAX_ROOMS_PER_CHANNEL, channel.rooms.length + 1),
                  )
                }
                disabled={channel.rooms.length >= MAX_ROOMS_PER_CHANNEL}
                style={styles.countButton}
                accessibilityLabel={`Add a room to channel ${channelIndex + 1}`}
              >
                <Ionicons name="add" size={scale(17)} color="#F97316" />
              </Pressable>
            </View>
          </View>
          <Text style={[styles.roomCountLabel, { color: c.muted }]}>
            Rooms on this channel (maximum {MAX_ROOMS_PER_CHANNEL})
          </Text>

          {channel.rooms.map((room, roomIndex) => (
            <View
              key={`${channelIndex}-${roomIndex}`}
              style={[styles.roomCard, { borderColor: c.line }]}
            >
              <Text style={[styles.roomTitle, { color: c.text }]}>
                Room {roomIndex + 1}
              </Text>
              <TextInput
                value={room.name}
                onChangeText={(name) => updateRoom(channelIndex, roomIndex, { name })}
                placeholder="Room name"
                placeholderTextColor={c.muted}
                style={[
                  styles.roomNameInput,
                  { color: c.text, borderColor: c.line, backgroundColor: c.surfaceMuted },
                ]}
                accessibilityLabel={`Name for channel ${channelIndex + 1}, room ${roomIndex + 1}`}
              />
              <View style={styles.bulbRow}>
                <Text style={[styles.bulbLabel, { color: c.muted }]}>Installed bulbs</Text>
                <View style={styles.bulbStepper}>
                  <Pressable
                    onPress={() =>
                      updateRoom(channelIndex, roomIndex, {
                        bulbs: Math.max(1, room.bulbs - 1),
                      })
                    }
                    disabled={room.bulbs <= 1}
                    style={styles.bulbButton}
                    accessibilityLabel="Remove one bulb"
                  >
                    <Ionicons name="remove" size={scale(16)} color="#F97316" />
                  </Pressable>
                  <Text style={[styles.bulbValue, { color: c.text }]}>{room.bulbs}</Text>
                  <Pressable
                    onPress={() =>
                      updateRoom(channelIndex, roomIndex, {
                        bulbs: Math.min(MAX_BULBS_PER_ROOM, room.bulbs + 1),
                      })
                    }
                    disabled={room.bulbs >= MAX_BULBS_PER_ROOM}
                    style={styles.bulbButton}
                    accessibilityLabel="Add one bulb"
                  >
                    <Ionicons name="add" size={scale(16)} color="#F97316" />
                  </Pressable>
                </View>
              </View>
            </View>
          ))}
        </View>
      ))}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Pressable
        onPress={() => void finishSetup()}
        disabled={saving}
        style={[styles.continueButton, saving && { opacity: 0.65 }]}
        accessibilityRole="button"
      >
        <Text style={styles.continueText}>{saving ? "Saving..." : "Save and Continue"}</Text>
        <Ionicons name="arrow-forward" size={scale(17)} color="#FFFFFF" />
      </Pressable>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: scale(12), paddingVertical: scale(8), marginBottom: scale(10) },
  headerIcon: { width: scale(48), height: scale(48), borderRadius: scale(16), backgroundColor: "rgba(249,115,22,0.14)", alignItems: "center", justifyContent: "center" },
  headerCopy: { flex: 1 },
  eyebrow: { fontSize: scale(8), letterSpacing: 1.2, fontFamily: fonts.extrabold },
  heading: { fontSize: scale(20), fontFamily: fonts.extrabold, marginTop: scale(2) },
  subtitle: { fontSize: scale(9), fontFamily: fonts.medium, lineHeight: scale(14), marginTop: scale(3) },
  limitNote: { flexDirection: "row", alignItems: "center", gap: scale(7), padding: scale(11), borderRadius: scale(12), marginBottom: scale(12) },
  limitText: { flex: 1, fontSize: scale(9), fontFamily: fonts.medium },
  channelCard: { borderWidth: 1, borderRadius: scale(16), padding: scale(12), marginBottom: scale(10) },
  channelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  channelLabel: { fontSize: scale(8), letterSpacing: 1, fontFamily: fonts.extrabold },
  channelTitle: { fontSize: scale(14), fontFamily: fonts.extrabold, marginTop: scale(2) },
  roomCountLabel: { fontSize: scale(9), fontFamily: fonts.medium, marginTop: scale(8), marginBottom: scale(7) },
  countSelector: { flexDirection: "row", alignItems: "center", gap: scale(11), borderWidth: 1, borderColor: "#F6C9A7", borderRadius: scale(12), padding: scale(4) },
  countButton: { width: scale(30), height: scale(30), borderRadius: scale(9), backgroundColor: "rgba(249,115,22,0.14)", alignItems: "center", justifyContent: "center" },
  countValue: { minWidth: scale(18), textAlign: "center", fontSize: scale(13), fontFamily: fonts.extrabold },
  roomCard: { borderTopWidth: 1, paddingTop: scale(9), marginTop: scale(7) },
  roomTitle: { fontSize: scale(10), fontFamily: fonts.extrabold, marginBottom: scale(6) },
  roomNameInput: { minHeight: scale(40), borderWidth: 1, borderRadius: scale(11), paddingHorizontal: scale(11), fontSize: scale(10), fontFamily: fonts.medium },
  bulbRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: scale(8) },
  bulbLabel: { fontSize: scale(9), fontFamily: fonts.bold },
  bulbStepper: { flexDirection: "row", alignItems: "center", gap: scale(10) },
  bulbButton: { width: scale(28), height: scale(28), borderRadius: scale(8), backgroundColor: "rgba(249,115,22,0.14)", alignItems: "center", justifyContent: "center" },
  bulbValue: { minWidth: scale(16), textAlign: "center", fontSize: scale(12), fontFamily: fonts.extrabold },
  error: { color: "#C2410C", fontSize: scale(9), fontFamily: fonts.bold, marginBottom: scale(9) },
  continueButton: { minHeight: scale(49), borderRadius: scale(15), backgroundColor: "#F97316", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: scale(8), marginTop: scale(5), marginBottom: scale(24) },
  continueText: { color: "#FFFFFF", fontSize: scale(12), fontFamily: fonts.extrabold },
});
