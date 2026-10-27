import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppText as Text } from "../../components/app-text";
import { ScreenShell } from "../../components/screen-shell";
import { scale } from "../../components/glass-ui";
import { ZONES_STORAGE_KEY } from "../../components/zone-management-screen";
import { useAuth } from "../../hooks/use-auth";
import {
  deviceSetupRequiredKey,
  installedTileCountKey,
} from "../../lib/device-setup";
import { supabase } from "../../lib/supabase";
import { notifyDeviceAccessChanged } from "../../components/device-status-banner";
import { fonts, useTheme } from "../../theme";

const MAX_BULBS_PER_ROOM = 5;

type RoomSetup = {
  name: string;
  bulbs: number;
};

type ActiveChannelSetup = {
  channelNumber: number;
  room: RoomSetup;
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
  const { hubId: routeHubId } = useLocalSearchParams<{ hubId?: string }>();
  const { user } = useAuth();
  const { colors: c } = useTheme();

  const [activeChannels, setActiveChannels] = useState<ActiveChannelSetup[]>(
    [],
  );
  const [detectedTiles, setDetectedTiles] = useState<number>(0);
  const [loadingSetup, setLoadingSetup] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [activeHubId, setActiveHubId] = useState<string>("");

  useEffect(() => {
    if (!setupComplete) return;
    const redirectTimer = setTimeout(() => {
      void (async () => {
        try {
          if (user?.id) {
            await AsyncStorage.removeItem(deviceSetupRequiredKey(user.id));
          }
          router.replace("/home");
        } catch (redirectError) {
          console.error("[device-setup] Redirect error:", redirectError);
          setError("Setup was saved, but the dashboard could not be opened.");
        }
      })();
    }, 2000);
    return () => clearTimeout(redirectTimer);
  }, [router, setupComplete, user]);

  useEffect(() => {
    void loadLocalHardwareConfiguration();
  }, [routeHubId]);

  const loadLocalHardwareConfiguration = async () => {
    setLoadingSetup(true);
    setError("");
    try {
      let targetHubId = "";

      // 1. Check for route parameter passed from provisioning
      if (
        routeHubId &&
        typeof routeHubId === "string" &&
        !routeHubId.startsWith("hub-f1-")
      ) {
        targetHubId = routeHubId.replace(/:/g, "").toLowerCase();
        await AsyncStorage.setItem("bawatpieza_hub_id", targetHubId);
      } else {
        // 2. Fall back to cached ID only if it is NOT a dummy "hub-f1-" string
        const cachedHubId = await AsyncStorage.getItem("bawatpieza_hub_id");
        if (cachedHubId && !cachedHubId.startsWith("hub-f1-")) {
          targetHubId = cachedHubId.replace(/:/g, "").toLowerCase();
        } else if (cachedHubId?.startsWith("hub-f1-")) {
          // Clear legacy dummy ID from AsyncStorage
          await AsyncStorage.removeItem("bawatpieza_hub_id");
        }
      }

      setActiveHubId(targetHubId);

      const cachedTiles = await AsyncStorage.getItem("bawatpieza_temp_tiles");
      const cachedChannels = await AsyncStorage.getItem(
        "bawatpieza_temp_channels",
      );

      const tilesCount = cachedTiles ? parseInt(cachedTiles, 10) : 1;
      const detectedChannels: number[] = cachedChannels
        ? JSON.parse(cachedChannels)
        : [1, 2];

      const schoolNames = [
        "F1 Hallway",
        "F1 Room 101",
        "F1 Laboratory",
        "F1 Faculty Room",
      ];

      const mappedChannels: ActiveChannelSetup[] = detectedChannels.map(
        (chNum, idx) => ({
          channelNumber: chNum,
          room: {
            name: schoolNames[idx] ?? `F1 Room 10${chNum}`,
            bulbs: 1,
          },
        }),
      );

      setActiveChannels(mappedChannels);
      setDetectedTiles(tilesCount);
    } catch (err: any) {
      console.error("[device-setup] Local configuration load failed:", err);
      setError("Could not load local hardware configuration. Using defaults.");
      setActiveChannels([
        { channelNumber: 1, room: { name: "F1 Hallway", bulbs: 1 } },
        { channelNumber: 2, room: { name: "F1 Room 101", bulbs: 1 } },
      ]);
      setDetectedTiles(1);
    } finally {
      setLoadingSetup(false);
    }
  };

  const updateChannelRoom = (index: number, updates: Partial<RoomSetup>) => {
    setActiveChannels((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, room: { ...item.room, ...updates } } : item,
      ),
    );
  };

  const finishSetup = async () => {
    if (!user?.id) {
      setError("User session missing. Please sign in again.");
      return;
    }

    if (activeChannels.some((item) => !item.room.name.trim())) {
      setError("Please assign a valid name for each detected channel.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      let rawHubId =
        activeHubId || (await AsyncStorage.getItem("bawatpieza_hub_id"));

      if (!rawHubId && routeHubId && typeof routeHubId === "string") {
        rawHubId = routeHubId;
      }

      // Reject empty or legacy hub-f1- dummy IDs
      if (!rawHubId || rawHubId.startsWith("hub-f1-")) {
        throw new Error(
          "ESP32 MAC address missing. Please return to the Provisioning screen and pair your hub.",
        );
      }

      const hubId = rawHubId.replace(/:/g, "").toLowerCase();
      await AsyncStorage.setItem("bawatpieza_hub_id", hubId);

      console.log(
        "[device-setup] Saving pairing & setup for MAC hubId:",
        hubId,
        "userId:",
        user.id,
      );

      // 1. Insert/Upsert Hub Row (THROWS ERROR ON FAILURE)
      const { error: hubErr } = await supabase.from("hubs").upsert({
        id: hubId,
        name: "F1 Energy Hub",
        status: "online",
        installed_tiles: detectedTiles,
        active_room_channels: activeChannels.map((ch) => ch.channelNumber),
      });
      if (hubErr) {
        throw new Error(`Failed to save hub record: ${hubErr.message}`);
      }

      // 2. Insert/Upsert Device Pairing Row (THROWS ERROR ON FAILURE)
      const { error: pairingErr } = await supabase
        .from("device_pairings")
        .upsert(
          {
            hub_id: hubId,
            user_id: user.id,
            last_connected: new Date().toISOString(),
            fw_version: "1.0.0",
          },
          { onConflict: "hub_id" },
        );
      if (pairingErr) {
        throw new Error(`Failed to pair device to user: ${pairingErr.message}`);
      }

      // 3. Insert/Upsert Device Setups Row (THROWS ERROR ON FAILURE)
      const setupPayload = {
        version: 1,
        channels: activeChannels.map((ch) => ({
          channel: ch.channelNumber,
          rooms: [{ name: ch.room.name.trim(), bulbs: ch.room.bulbs }],
        })),
      };

      const { error: saveError } = await supabase.from("device_setups").upsert(
        {
          hub_id: hubId,
          installed_tile_count: detectedTiles,
          channel_count: activeChannels.length,
          room_count: activeChannels.length,
          setup_payload: setupPayload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "hub_id" },
      );
      if (saveError) {
        throw new Error(`Failed to save channel setup: ${saveError.message}`);
      }

      // 4. Save hardware zones locally
      const stored = await AsyncStorage.getItem(ZONES_STORAGE_KEY);
      const existingZones = stored ? (JSON.parse(stored) as StoredZone[]) : [];

      const newZones: StoredZone[] = activeChannels.map((ch) => ({
        id: `setup-${user.id}-${ch.channelNumber}`,
        name: ch.room.name.trim(),
        priority: "Standard",
        watts: ch.room.bulbs * 15,
        channel: ch.channelNumber,
        installedBulbs: ch.room.bulbs,
        roomType: "F1 School Zone",
      }));

      const retained = existingZones.filter(
        (z) => !z.id.startsWith(`setup-${user.id}-`),
      );

      await Promise.all([
        AsyncStorage.setItem(
          installedTileCountKey(hubId),
          String(detectedTiles),
        ),
        AsyncStorage.setItem(
          ZONES_STORAGE_KEY,
          JSON.stringify([...retained, ...newZones]),
        ),
        AsyncStorage.removeItem(deviceSetupRequiredKey(user.id)),
      ]);

      console.log("[device-setup] Setup completed successfully!");
      notifyDeviceAccessChanged(true);
      setSetupComplete(true);
    } catch (err: any) {
      console.error("[device-setup] FATAL Error during setup:", err);
      setError(err?.message || "Could not finish setup. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <ScreenShell scroll title="Device Setup" showNoDeviceNotice={false}>
        <View style={styles.header}>
          <View style={styles.headerIcon}>
            <Ionicons
              name="hardware-chip-outline"
              size={scale(23)}
              color="#F97316"
            />
          </View>
          <View style={styles.headerCopy}>
            <Text style={[styles.eyebrow, { color: c.muted }]}>
              FIRST FLOOR (F1) HARDWARE SETUP
            </Text>
            <Text style={[styles.heading, { color: c.text }]}>
              Configure F1 School Zones
            </Text>
            <Text style={[styles.subtitle, { color: c.muted }]}>
              Assigned relay channels and kinetic tile arrays for building 1st
              floor.
            </Text>
          </View>
        </View>

        {loadingSetup ? (
          <View
            style={{
              padding: scale(20),
              alignItems: "center",
              marginTop: scale(40),
            }}
          >
            <ActivityIndicator size="large" color="#F97316" />
            <Text
              style={{
                marginTop: 10,
                color: c.muted,
                fontFamily: fonts.medium,
              }}
            >
              Loading F1 hardware configuration...
            </Text>
          </View>
        ) : (
          <>
            <View
              style={[
                styles.statusCard,
                { backgroundColor: c.surface, borderColor: c.line },
              ]}
            >
              <View style={styles.statusRow}>
                <View style={styles.statusItem}>
                  <Ionicons name="triangle" size={scale(20)} color="#FDBA74" />
                  <View style={styles.statusTextCol}>
                    <Text style={[styles.statusLabel, { color: c.muted }]}>
                      DETECTED TILES
                    </Text>
                    <Text style={[styles.statusValue, { color: c.text }]}>
                      {detectedTiles}
                    </Text>
                  </View>
                </View>
                <View style={styles.statusDivider} />
                <View style={styles.statusItem}>
                  <Ionicons
                    name="flash-outline"
                    size={scale(20)}
                    color="#FDBA74"
                  />
                  <View style={styles.statusTextCol}>
                    <Text style={[styles.statusLabel, { color: c.muted }]}>
                      ACTIVE RELAYS
                    </Text>
                    <Text style={[styles.statusValue, { color: c.text }]}>
                      {activeChannels.length}
                    </Text>
                  </View>
                </View>
              </View>
              <Pressable
                onPress={loadLocalHardwareConfiguration}
                style={styles.refreshButton}
              >
                <Ionicons name="refresh" size={scale(14)} color="#F97316" />
                <Text style={styles.refreshText}>Reload Configuration</Text>
              </Pressable>
            </View>

            {activeChannels.map((item, index) => (
              <View
                key={`ch-${item.channelNumber}`}
                style={[
                  styles.channelCard,
                  { backgroundColor: c.surface, borderColor: c.line },
                ]}
              >
                <View style={styles.channelHeader}>
                  <View>
                    <Text style={[styles.channelLabel, { color: c.muted }]}>
                      ACTIVE RELAY PIN
                    </Text>
                    <Text style={[styles.channelTitle, { color: c.text }]}>
                      Channel {item.channelNumber}
                    </Text>
                  </View>
                </View>

                <View style={[styles.roomCard, { borderColor: c.line }]}>
                  <Text style={[styles.roomTitle, { color: c.text }]}>
                    Assigned F1 Location Name
                  </Text>
                  <TextInput
                    value={item.room.name}
                    onChangeText={(name) => updateChannelRoom(index, { name })}
                    placeholder="e.g. F1 Hallway, F1 Room 101, F1 Laboratory"
                    placeholderTextColor={c.muted}
                    style={[
                      styles.roomNameInput,
                      {
                        color: c.text,
                        borderColor: c.line,
                        backgroundColor: c.surfaceMuted,
                      },
                    ]}
                  />
                  <View style={styles.bulbRow}>
                    <Text style={[styles.bulbLabel, { color: c.muted }]}>
                      Connected Bulbs
                    </Text>
                    <View style={styles.bulbStepper}>
                      <Pressable
                        onPress={() =>
                          updateChannelRoom(index, {
                            bulbs: Math.max(1, item.room.bulbs - 1),
                          })
                        }
                        disabled={item.room.bulbs <= 1}
                        style={styles.bulbButton}
                      >
                        <Ionicons
                          name="remove"
                          size={scale(16)}
                          color="#F97316"
                        />
                      </Pressable>
                      <Text style={[styles.bulbValue, { color: c.text }]}>
                        {item.room.bulbs}
                      </Text>
                      <Pressable
                        onPress={() =>
                          updateChannelRoom(index, {
                            bulbs: Math.min(
                              MAX_BULBS_PER_ROOM,
                              item.room.bulbs + 1,
                            ),
                          })
                        }
                        disabled={item.room.bulbs >= MAX_BULBS_PER_ROOM}
                        style={styles.bulbButton}
                      >
                        <Ionicons name="add" size={scale(16)} color="#F97316" />
                      </Pressable>
                    </View>
                  </View>
                </View>
              </View>
            ))}

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <View style={styles.roomActions}>
              <Pressable
                onPress={() => void finishSetup()}
                disabled={saving}
                style={[
                  styles.continueButton,
                  styles.saveButton,
                  saving && { opacity: 0.65 },
                ]}
              >
                <Text style={styles.continueText}>
                  {saving ? "Saving Setup..." : "Complete Setup"}
                </Text>
                <Ionicons
                  name="checkmark-circle"
                  size={scale(17)}
                  color="#FFFFFF"
                />
              </Pressable>
            </View>
          </>
        )}
      </ScreenShell>

      <Modal visible={setupComplete} transparent animationType="fade">
        <View style={styles.successOverlay}>
          <View
            style={[
              styles.successCard,
              { backgroundColor: c.surface, borderColor: c.line },
            ]}
          >
            <Ionicons
              name="checkmark-circle"
              size={scale(46)}
              color="#16A34A"
              style={styles.successIcon}
            />
            <Text style={[styles.successTitle, { color: c.text }]}>
              Setup Complete
            </Text>
            <Text style={[styles.successCopy, { color: c.muted }]}>
              F1 hub pairing and hardware configuration saved successfully.
              Redirecting to your dashboard...
            </Text>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(12),
    paddingVertical: scale(8),
    marginBottom: scale(10),
  },
  headerIcon: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(16),
    backgroundColor: "rgba(249,115,22,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  headerCopy: { flex: 1 },
  eyebrow: {
    fontSize: scale(8),
    letterSpacing: 1.2,
    fontFamily: fonts.extrabold,
  },
  heading: {
    fontSize: scale(20),
    fontFamily: fonts.extrabold,
    marginTop: scale(2),
  },
  subtitle: {
    fontSize: scale(9),
    fontFamily: fonts.medium,
    lineHeight: scale(14),
    marginTop: scale(3),
  },

  statusCard: {
    borderWidth: 1,
    borderRadius: scale(16),
    padding: scale(16),
    marginBottom: scale(16),
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statusItem: { flexDirection: "row", alignItems: "center", gap: scale(10) },
  statusTextCol: { alignItems: "flex-start" },
  statusLabel: {
    fontSize: scale(8),
    fontFamily: fonts.bold,
    letterSpacing: 0.8,
  },
  statusValue: { fontSize: scale(16), fontFamily: fonts.extrabold },
  statusDivider: {
    width: 1,
    height: scale(24),
    backgroundColor: "rgba(150,150,150,0.3)",
  },
  refreshButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(6),
    marginTop: scale(14),
    paddingTop: scale(12),
    borderTopWidth: 1,
    borderTopColor: "rgba(150,150,150,0.2)",
  },
  refreshText: {
    color: "#F97316",
    fontSize: scale(10),
    fontFamily: fonts.bold,
  },

  channelCard: {
    borderWidth: 1,
    borderRadius: scale(16),
    padding: scale(12),
    marginBottom: scale(10),
  },
  channelHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  channelLabel: {
    fontSize: scale(8),
    letterSpacing: 1,
    fontFamily: fonts.extrabold,
  },
  channelTitle: {
    fontSize: scale(14),
    fontFamily: fonts.extrabold,
    marginTop: scale(2),
  },
  roomCard: { borderTopWidth: 1, paddingTop: scale(9), marginTop: scale(7) },
  roomTitle: {
    fontSize: scale(10),
    fontFamily: fonts.extrabold,
    marginBottom: scale(6),
  },
  roomNameInput: {
    minHeight: scale(40),
    borderWidth: 1,
    borderRadius: scale(11),
    paddingHorizontal: scale(11),
    fontSize: scale(10),
    fontFamily: fonts.medium,
  },
  bulbRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: scale(8),
  },
  bulbLabel: { fontSize: scale(9), fontFamily: fonts.bold },
  bulbStepper: { flexDirection: "row", alignItems: "center", gap: scale(10) },
  bulbButton: {
    width: scale(28),
    height: scale(28),
    borderRadius: scale(8),
    backgroundColor: "rgba(249,115,22,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  bulbValue: {
    minWidth: scale(16),
    textAlign: "center",
    fontSize: scale(12),
    fontFamily: fonts.extrabold,
  },
  error: {
    color: "#C2410C",
    fontSize: scale(9),
    fontFamily: fonts.bold,
    marginBottom: scale(9),
  },
  roomActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(9),
    marginTop: scale(5),
    marginBottom: scale(24),
  },
  continueButton: {
    minHeight: scale(49),
    borderRadius: scale(15),
    backgroundColor: "#F97316",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: scale(8),
    paddingHorizontal: scale(16),
  },
  saveButton: { flex: 1, marginBottom: 0 },
  continueText: {
    color: "#FFFFFF",
    fontSize: scale(12),
    fontFamily: fonts.extrabold,
  },
  successOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: scale(24),
  },
  successCard: {
    width: "100%",
    maxWidth: scale(380),
    alignItems: "center",
    borderWidth: 1,
    borderRadius: scale(22),
    padding: scale(24),
  },
  successIcon: { marginBottom: scale(10) },
  successTitle: {
    fontSize: scale(17),
    fontFamily: fonts.extrabold,
    textAlign: "center",
  },
  successCopy: {
    fontSize: scale(11),
    fontFamily: fonts.medium,
    lineHeight: scale(17),
    textAlign: "center",
    marginTop: scale(8),
  },
});
