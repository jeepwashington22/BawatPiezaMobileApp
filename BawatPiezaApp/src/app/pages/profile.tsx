import { useEffect, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  Modal,
  ScrollView,
  RefreshControl,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useRouter, type Href } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
// @ts-ignore
import Paho from "paho-mqtt";
import { ScreenShell } from "../../components/screen-shell";
import { TileLoader } from "../../components/tile-loader";
import { supabase } from "../../lib/supabase";
import { useTheme, fonts, type ThemeColors } from "../../theme";

type IconName = keyof typeof Ionicons.glyphMap;

type HubButton = {
  icon: IconName;
  label: string;
  sub: string;
  href: Href;
  accent?: string;
};

type HubSection = { title: string; items: HubButton[] };

export default function ProfileScreen() {
  const { colors: c, fonts: f, mode } = useTheme();
  const styles = makeStyles(c, f);
  const PRUSSIAN = c.accent;
  const MUTED = c.muted;
  const WHITE = c.onAccent;
  const router = useRouter();

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Hub connections state
  const [hubCount, setHubCount] = useState<number>(0);
  const [hubStatus, setHubStatus] = useState<
    "Online" | "Offline" | "Checking..." | "No Hub"
  >("Checking...");

  const [pendingImage, setPendingImage] = useState<{
    uri: string;
    mimeType?: string;
  } | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // Fetch User Profile
  useEffect(() => {
    (async () => {
      try {
        const { data: userData, error: userErr } =
          await supabase.auth.getUser();
        if (userErr) throw userErr;
        setEmail(userData.user?.email ?? null);
        setAvatarUrl(userData.user?.user_metadata?.avatar_url ?? null);
        setUserId(userData.user?.id ?? null);
        if (userData.user) {
          const { data: rows, error: profErr } = await supabase
            .from("user_accounts")
            .select("firstname, lastname, role")
            .eq("id", userData.user.id)
            .maybeSingle();
          if (!profErr && rows) {
            setFullName(
              [rows.firstname, rows.lastname].filter(Boolean).join(" ") || null,
            );
            setRole(rows.role ?? null);
          }
        }
      } catch {
        // Non-fatal — hero falls back to placeholders.
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshTrigger]); // Re-runs on pull-to-refresh

  // Check connected hubs & live connection status
  useEffect(() => {
    let isMounted = true;
    let client: any = null;
    let watchdog: ReturnType<typeof setTimeout>;

    const verifyHubConnections = async () => {
      try {
        let count = 0;
        let targetHubId: string | null = null;

        // 1. Check Supabase devices table
        const { data: dbDevices, error: dbErr } = await supabase
          .from("devices")
          .select("id, hub_id, status, is_online");

        if (!dbErr && dbDevices && dbDevices.length > 0) {
          count = dbDevices.length;
          targetHubId = dbDevices[0].hub_id || dbDevices[0].id;
          const hasOnline = dbDevices.some(
            (d: any) => d.is_online || d.status?.toLowerCase() === "online",
          );
          if (hasOnline && isMounted) {
            setHubStatus("Online");
          }
        }

        // 2. Fallback to AsyncStorage hub (Only increment if no DB hubs exist)
        const storedHub = await AsyncStorage.getItem("bawatpieza_hub_id");
        if (storedHub) {
          if (count === 0) count = 1;
          targetHubId = storedHub;
        }

        if (isMounted) {
          setHubCount(count);
          // If genuinely 0 hubs, drop out immediately as "No Hub"
          if (count === 0) {
            setHubStatus("No Hub");
            return;
          }
        }

        if (!targetHubId) {
          if (isMounted) setHubStatus("Offline");
          return;
        }

        // 3. Connect to MQTT for active ping
        const clientId =
          "profile_" + Math.random().toString(16).substring(2, 10);
        client = new Paho.Client("broker.hivemq.com", 8000, "/mqtt", clientId);

        const statusTopic = `bawatpieza/devices/${targetHubId}/status`;
        const telemetryTopic = `bawatpieza/devices/${targetHubId}/telemetry`;

        watchdog = setTimeout(() => {
          if (isMounted) {
            setHubStatus((prev) => (prev === "Online" ? "Online" : "Offline"));
          }
        }, 3500);

        client.connect({
          useSSL: false,
          timeout: 4,
          onSuccess: () => {
            client.subscribe(statusTopic);
            client.subscribe(telemetryTopic);
          },
          onFailure: () => {
            if (isMounted) {
              setHubStatus((prev) =>
                prev === "Checking..." ? "Offline" : prev,
              );
            }
          },
        });

        client.onMessageArrived = (msg: any) => {
          clearTimeout(watchdog);
          try {
            const payload = JSON.parse(msg.payloadString);
            if (msg.destinationName === statusTopic) {
              if (isMounted) {
                setHubStatus(
                  payload.status === "online" ? "Online" : "Offline",
                );
              }
            } else if (msg.destinationName === telemetryTopic) {
              if (isMounted) setHubStatus("Online");
            }
          } catch {
            if (isMounted) setHubStatus("Online");
          }
        };

        client.onConnectionLost = () => {
          if (isMounted) {
            setHubStatus((prev) =>
              prev === "Checking..." ? "Checking..." : "Offline",
            );
          }
        };
      } catch {
        if (isMounted) setHubStatus("Offline");
      }
    };

    verifyHubConnections();

    // Cleanup unmounts the old client and timer before running a refresh
    return () => {
      isMounted = false;
      clearTimeout(watchdog);
      if (client && client.isConnected && client.isConnected()) {
        try {
          client.disconnect();
        } catch {}
      }
    };
  }, [refreshTrigger]); // Re-runs cleanly on pull-to-refresh

  const onRefresh = () => {
    setRefreshing(true);
    setHubStatus("Checking...");
    setRefreshTrigger((prev) => prev + 1);
    // UI timer to dismiss the refresh wheel
    setTimeout(() => {
      setRefreshing(false);
    }, 1500);
  };

  const sections: HubSection[] = useMemo(
    () => [
      {
        title: "AUDIT TRAIL",
        items: [
          {
            icon: "flash-outline",
            label: "History/Activity Log",
            sub: "Action timestamps",
            href: "/pages/activity" as Href,
            accent: "#F97316",
          },
        ],
      },
      {
        title: "DEVICE MANAGEMENT",
        items: [
          {
            icon: "wifi-outline",
            label: "Connections",
            sub:
              hubCount === 0
                ? "No hubs paired · Tap to pair"
                : `${hubCount} ${hubCount === 1 ? "hub" : "hubs"} paired`,
            href: "/pages/device" as Href,
            accent: "#F97316",
          },
          {
            icon: "people-outline",
            label: "Manage Access",
            sub: "2 invited · 1 pending",
            href: "/pages/accounts" as Href,
            accent: "#F97316",
          },
          {
            icon: "options-outline",
            label: "System Thresholds",
            sub: "Tile floor, degradation & watch list rules",
            href: "/pages/preferences" as Href,
            accent: "#F97316",
          },
        ],
      },
      {
        title: "UTILITY & RATES",
        items: [
          {
            icon: "wifi-outline",
            label: "Meralco",
            sub: "Current Provider",
            href: "/pages/preferences" as Href,
            accent: "#F97316",
          },
          {
            icon: "flash-outline",
            label: "Electricity Rate",
            sub: "Auto-synced from database",
            href: "/pages/energy" as Href,
            accent: "#F97316",
          },
        ],
      },
      {
        title: "APP SETTINGS",
        items: [
          {
            icon: "person-circle-outline",
            label: "Profile",
            sub: "Edit account",
            href: "/pages/edit-profile" as Href,
            accent: "#F97316",
          },
          {
            icon: "information-circle-outline",
            label: "About",
            sub: "App version, credits & legal",
            href: "/pages/about" as Href,
            accent: "#F97316",
          },
        ],
      },
    ],
    [hubCount],
  );

  const handleAvatarPress = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission needed",
          "Allow photo library access to set a profile picture.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setPendingImage({ uri: asset.uri, mimeType: asset.mimeType });
    } catch {
      Alert.alert(
        "Error",
        "Could not open the photo library. Please try again.",
      );
    }
  };

  const handleAvatarSave = async () => {
    if (!pendingImage || !userId) return;
    setUploadingAvatar(true);
    try {
      const ext = pendingImage.uri.split(".").pop()?.split("?")[0] ?? "jpg";
      const path = `${userId}/avatar.${ext}`;
      const res = await fetch(pendingImage.uri);
      const blob = await res.blob();
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, blob, {
          contentType: pendingImage.mimeType ?? "image/jpeg",
          upsert: true,
        });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`;
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { avatar_url: url },
      });
      if (metaErr) throw metaErr;
      setAvatarUrl(url);
      setPendingImage(null);
    } catch (e) {
      Alert.alert(
        "Upload failed",
        e instanceof Error ? `${e.message}` : "Upload failed",
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarCancel = () => {
    if (!uploadingAvatar) setPendingImage(null);
  };

  const handleLogoutConfirm = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setShowLogoutModal(false);
      router.replace("/");
    } catch {
      Alert.alert("Error", "Could not sign out. Please try again.");
      setShowLogoutModal(false);
    }
  };

  const handleLogoutCancel = () => {
    setShowLogoutModal(false);
  };

  if (loading) {
    return (
      <ScreenShell title="Profile">
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading profile" size="lg" />
        </View>
      </ScreenShell>
    );
  }

  const displayName = fullName ?? email ?? "Signed-in user";

  return (
    <ScreenShell title="Profile">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.accent}
            colors={[c.accent]}
          />
        }
      >
        <View style={styles.profileHeader}>
          <Pressable
            onPress={handleAvatarPress}
            disabled={uploadingAvatar}
            style={({ pressed }) => [
              pressed && !uploadingAvatar && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.profileAvatar} />
            ) : (
              <View style={styles.profileAvatarPlaceholder}>
                <Text style={styles.profileAvatarText}>
                  {displayName.charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <View style={styles.profileCameraBadge}>
              <Ionicons
                name={uploadingAvatar ? "hourglass-outline" : "camera-outline"}
                size={12}
                color={PRUSSIAN}
              />
            </View>
          </Pressable>
          <Text style={styles.profileHeaderName}>{displayName}</Text>
          <Text style={styles.profileHeaderEmail}>{email ?? "—"}</Text>
        </View>

        {sections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            {section.items.map((b) => (
              <Pressable
                key={b.label}
                onPress={() => router.push(b.href)}
                style={({ pressed }) => [
                  styles.hubBtn,
                  pressed && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel={b.label}
              >
                <View style={styles.hubIcon}>
                  <Ionicons
                    name={b.icon}
                    size={18}
                    color={b.accent ?? PRUSSIAN}
                  />
                </View>
                <View style={styles.hubText}>
                  <Text style={styles.hubLabel}>{b.label}</Text>
                  <Text style={styles.hubSub}>{b.sub}</Text>
                </View>

                {b.label === "Connections" ? (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                    }}
                  >
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor:
                            hubStatus === "Online"
                              ? "rgba(34, 197, 94, 0.12)"
                              : hubStatus === "Offline"
                                ? "rgba(239, 68, 68, 0.12)"
                                : hubStatus === "Checking..."
                                  ? "rgba(245, 158, 11, 0.12)"
                                  : mode === "dark"
                                    ? "rgba(255, 255, 255, 0.1)"
                                    : "rgba(156, 163, 175, 0.15)",
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.statusDot,
                          {
                            backgroundColor:
                              hubStatus === "Online"
                                ? "#22C55E"
                                : hubStatus === "Offline"
                                  ? "#EF4444"
                                  : hubStatus === "Checking..."
                                    ? "#F59E0B"
                                    : "#9CA3AF",
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.statusBadgeText,
                          {
                            color:
                              hubStatus === "Online"
                                ? "#16A34A"
                                : hubStatus === "Offline"
                                  ? "#DC2626"
                                  : hubStatus === "Checking..."
                                    ? "#D97706"
                                    : MUTED,
                          },
                        ]}
                      >
                        {hubStatus}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={MUTED} />
                  </View>
                ) : b.label === "Electricity Rate" ? (
                  <View style={styles.rateState}>
                    <Text style={styles.rateValue}>₱9.25 / kWh</Text>
                    <Text style={styles.rateActive}>ACTIVE</Text>
                  </View>
                ) : (
                  <Ionicons name="chevron-forward" size={17} color={MUTED} />
                )}
              </Pressable>
            ))}
          </View>
        ))}

        <Pressable
          style={({ pressed }) => [
            styles.logoutBtn,
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => setShowLogoutModal(true)}
          accessibilityRole="button"
          accessibilityLabel="Log out"
        >
          <Ionicons
            name="log-out-outline"
            size={18}
            color="#FFFFFF"
            style={{ marginRight: 8 }}
          />
          <Text style={styles.logoutText}>Log out</Text>
        </Pressable>
      </ScrollView>

      {/* Balanced Logout Modal */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={handleLogoutCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Log out</Text>
            <Text style={[styles.modalText, { color: c.muted }]}>
              Are you sure you want to sign out of your account?
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                onPress={handleLogoutCancel}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.cancelText, { color: c.text }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleLogoutConfirm}
                style={({ pressed }) => [
                  styles.confirmButton,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.confirmText}>Log out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Balanced Avatar Modal */}
      <Modal
        visible={pendingImage !== null}
        transparent
        animationType="fade"
        onRequestClose={handleAvatarCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>
              Save profile picture?
            </Text>
            <View style={styles.modalPreviewWrap}>
              {pendingImage ? (
                <Image
                  source={{ uri: pendingImage.uri }}
                  style={styles.modalPreview}
                />
              ) : null}
              {uploadingAvatar ? (
                <View style={styles.modalPreviewBusy}>
                  <ActivityIndicator color={PRUSSIAN} size="large" />
                </View>
              ) : null}
            </View>
            <Text style={[styles.modalText, { color: c.muted }]}>
              {uploadingAvatar
                ? "Uploading your photo…"
                : "This will replace your current profile picture."}
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                onPress={handleAvatarCancel}
                disabled={uploadingAvatar}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && !uploadingAvatar && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel profile picture change"
              >
                <Text style={[styles.cancelText, { color: c.text }]}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={handleAvatarSave}
                disabled={uploadingAvatar}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && !uploadingAvatar && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save profile picture"
              >
                {uploadingAvatar ? (
                  <ActivityIndicator color={WHITE} size="small" />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const makeStyles = (c: ThemeColors, f: any) => {
  const PRUSSIAN = c.accent;
  const MUTED = c.muted;
  const LINE = c.line;
  const BUTTER = c.butter;
  const DANGER = c.danger;
  const WHITE = c.onAccent;

  return StyleSheet.create({
    loaderWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
    profileHeader: { alignItems: "center", marginBottom: 8, marginTop: 10 },
    profileAvatar: {
      width: 62,
      height: 62,
      borderRadius: 31,
      borderWidth: 2,
      borderColor: BUTTER,
    },
    profileAvatarPlaceholder: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: BUTTER,
      alignItems: "center",
      justifyContent: "center",
    },
    profileAvatarText: {
      color: PRUSSIAN,
      fontSize: 24,
      fontFamily: f.extrabold,
    },
    profileCameraBadge: {
      position: "absolute",
      right: -2,
      bottom: -2,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: LINE,
      alignItems: "center",
      justifyContent: "center",
    },
    profileHeaderName: {
      color: PRUSSIAN,
      fontSize: 15,
      fontFamily: f.extrabold,
      marginTop: 7,
    },
    profileHeaderEmail: {
      color: MUTED,
      fontSize: 10,
      fontFamily: f.medium,
      marginTop: 2,
    },
    section: { marginBottom: 2 },
    sectionTitle: {
      color: MUTED,
      fontSize: 11,
      letterSpacing: 1.2,
      fontWeight: "800",
      fontFamily: f.extrabold,
      marginTop: 14,
      marginBottom: 8,
    },
    hubBtn: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: LINE,
      paddingHorizontal: 14,
      paddingVertical: 11,
      marginBottom: 8,
      minHeight: 62,
    },
    hubIcon: {
      width: 30,
      height: 30,
      borderRadius: 10,
      backgroundColor: "rgba(249, 115, 22, 0.12)",
      alignItems: "center",
      justifyContent: "center",
      marginRight: 10,
    },
    hubText: { flex: 1 },
    hubLabel: {
      color: PRUSSIAN,
      fontSize: 12,
      fontWeight: "800",
      fontFamily: f.extrabold,
    },
    hubSub: { color: MUTED, fontSize: 10, marginTop: 2 },

    statusBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 99,
    },
    statusDot: {
      width: 6,
      height: 6,
      borderRadius: 3,
    },
    statusBadgeText: {
      fontSize: 10,
      fontFamily: f.bold,
      fontWeight: "700",
    },

    rateState: { alignItems: "flex-end" },
    rateValue: { color: PRUSSIAN, fontSize: 12, fontFamily: f.extrabold },
    rateActive: {
      color: "#1764B0",
      fontSize: 8,
      letterSpacing: 0.8,
      fontFamily: f.extrabold,
      marginTop: 2,
    },
    logoutBtn: {
      backgroundColor: DANGER,
      borderRadius: 14,
      paddingVertical: 14,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 18,
      marginBottom: 12,
    },
    logoutText: {
      color: WHITE,
      fontSize: 14,
      fontWeight: "800",
      fontFamily: f.extrabold,
    },

    // ----------------------------------------------------
    // BALANCED MODAL STYLES (Matching Provisioning Screen)
    // ----------------------------------------------------
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    modalContent: {
      width: "100%",
      maxWidth: 310, // Restricts the modal from stretching too wide
      borderRadius: 20,
      padding: 24,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 10,
      alignItems: "center",
    },
    modalTitle: {
      fontSize: 17,
      fontFamily: f.extrabold,
      textAlign: "center",
      marginBottom: 8,
    },
    modalText: {
      fontSize: 13,
      fontFamily: f.medium,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: 20,
    },
    modalButtons: {
      flexDirection: "row",
      gap: 12,
      width: "100%",
    },
    cancelButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: LINE,
      alignItems: "center",
    },
    cancelText: {
      fontSize: 14,
      fontFamily: f.extrabold,
    },
    confirmButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: DANGER,
      alignItems: "center",
    },
    confirmText: {
      fontSize: 14,
      fontFamily: f.extrabold,
      color: WHITE,
    },
    saveButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: PRUSSIAN,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
    },
    saveText: {
      fontSize: 14,
      fontFamily: f.extrabold,
      color: WHITE,
    },

    // Avatar Preview inside Modal
    modalPreviewWrap: {
      alignSelf: "center",
      marginBottom: 16,
      marginTop: 8,
    },
    modalPreview: {
      width: 100,
      height: 100,
      borderRadius: 50,
      borderWidth: 3,
      borderColor: BUTTER,
      backgroundColor: c.surfaceMuted,
    },
    modalPreviewBusy: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 50,
      backgroundColor: "rgba(255,255,255,0.55)",
      alignItems: "center",
      justifyContent: "center",
    },
  });
};
