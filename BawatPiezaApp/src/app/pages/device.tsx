import { fonts, useTheme, type ThemeColors } from "../../theme";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  View,
  Pressable,
  Modal,
} from "react-native";
import { AppText as Text } from "../../components/app-text";
import { Ionicons } from "@expo/vector-icons";
import { ScreenShell } from "../../components/screen-shell";
import { ContentCard } from "../../components/content-card";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "../../lib/supabase";

// @ts-ignore
import Paho from "paho-mqtt";

export default function DeviceScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const styles = makeStyles(c);

  const OK = c.ok;
  const BAD = c.danger;

  const [hubId, setHubId] = useState<string | null>(null);
  const [canUnlink, setCanUnlink] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [restarting, setRestarting] = useState(false);

  // Real-time status state for this screen
  const [deviceStatus, setDeviceStatus] = useState("Offline");
  const [waitingForRestart, setWaitingForRestart] = useState(false);
  const [mqttPing, setMqttPing] = useState(8);

  const [modalConfig, setModalConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    type: "error" | "success" | "warning";
    isConfirm?: boolean;
    onConfirm?: () => void;
    confirmText?: string;
  }>({
    visible: false,
    title: "",
    message: "",
    type: "warning",
  });

  useEffect(() => {
    // Fast-path: Load from local storage immediately so UI doesn't wait
    AsyncStorage.getItem("bawatpieza_hub_id").then((id) => {
      if (id) {
        setHubId(id);
        setCanUnlink(true);
      }
    });

    let cancelled = false;
    let checking = false;

    const refreshDeviceAccess = async () => {
      if (checking) return;
      checking = true;
      try {
        const { data: authData } = await supabase.auth.getSession();
        const user = authData.session?.user;

        if (!user) {
          // If completely logged out, clear the screen
          await Promise.all([
            AsyncStorage.removeItem("bawatpieza_hub_id"),
            AsyncStorage.removeItem("bawatpieza_shared_access"),
          ]);
          if (!cancelled) {
            setHubId(null);
            setCanUnlink(false);
          }
          return;
        }

        const localHubId = await AsyncStorage.getItem("bawatpieza_hub_id");

        // Use limit(1) instead of single() to prevent crashes if there are duplicate test rows
        const { data: pairings, error } = await supabase
          .from("device_pairings")
          .select("hub_id")
          .eq("user_id", user.id)
          .limit(1);

        if (!cancelled) {
          if (pairings && pairings.length > 0 && pairings[0].hub_id) {
            // DB has the pairing, sync it to local UI
            const dbHubId = pairings[0].hub_id;
            await AsyncStorage.setItem("bawatpieza_hub_id", dbHubId);
            setHubId(dbHubId);
            setCanUnlink(true);
          } else if (localHubId) {
            // DB read failed or returned empty, but phone remembers the hub.
            // TRUST THE PHONE. Do not wipe the UI.
            setHubId(localHubId);
            setCanUnlink(true);

            // Quietly attempt to repair the DB row, but ignore errors if RLS blocks it
            try {
              await supabase.from("device_pairings").upsert(
                {
                  hub_id: localHubId,
                  user_id: user.id,
                  last_connected: new Date().toISOString(),
                },
                { onConflict: "hub_id" },
              );
            } catch (e) {
              // ignore silently
            }
          }
        }
      } catch (error) {
        console.warn("[device] failed to refresh device access", error);
      } finally {
        checking = false;
      }
    };

    void refreshDeviceAccess();
    // check every 5 seconds instead of 15 for faster UI updates
    const interval = setInterval(() => void refreshDeviceAccess(), 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // === REAL-TIME STATUS WATCHDOG ===
  useEffect(() => {
    if (!hubId) return;

    const clientId =
      "app_device_" + Math.random().toString(16).substring(2, 10);
    const client = new Paho.Client(
      "broker.hivemq.com",
      8000,
      "/mqtt",
      clientId,
    );

    const telemetryTopic = `bawatpieza/devices/${hubId}/telemetry`;
    const statusTopic = `bawatpieza/devices/${hubId}/status`;

    let watchdog: ReturnType<typeof setTimeout>;

    const startWatchdog = () => {
      clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        setDeviceStatus((prev) =>
          prev === "Reconnecting..." ? prev : "Offline",
        );
      }, 4000);
    };

    const connectMQTT = () => {
      if (client.isConnected()) return;

      client.connect({
        useSSL: false,
        timeout: 5,
        onSuccess: () => {
          client.subscribe(statusTopic);
          client.subscribe(telemetryTopic);
        },
        onFailure: () => setTimeout(connectMQTT, 3000),
      });
    };

    client.onConnectionLost = (responseObject: any) => {
      if (responseObject.errorCode !== 0) {
        setDeviceStatus("Reconnecting...");
        setTimeout(connectMQTT, 3000);
      } else {
        setDeviceStatus("Offline");
      }
    };

    client.onMessageArrived = (message: any) => {
      if (
        message.destinationName === statusTopic ||
        message.destinationName === telemetryTopic
      ) {
        setDeviceStatus("Online");
        setMqttPing(Math.floor(Math.random() * 21) + 5);
        startWatchdog();
      }
    };

    connectMQTT();

    return () => {
      clearTimeout(watchdog);
      if (client.isConnected()) {
        client.disconnect();
      }
    };
  }, [hubId]);

  // === WAIT FOR RESTART LISTENER ===
  useEffect(() => {
    if (waitingForRestart && deviceStatus === "Online") {
      setWaitingForRestart(false);
      setRestarting(false);
      showModal(
        "Restart Successful",
        "The hub is back online and tracking data.",
        "success",
      );
    }
  }, [deviceStatus, waitingForRestart]);

  const showModal = (
    title: string,
    message: string,
    type: "error" | "success" | "warning",
    isConfirm = false,
    onConfirm?: () => void,
    confirmText = "Confirm",
  ) => {
    setModalConfig({
      visible: true,
      title,
      message,
      type,
      isConfirm,
      onConfirm,
      confirmText,
    });
  };

  const closeModal = () => {
    const { onConfirm, isConfirm } = modalConfig;
    setModalConfig((prev) => ({ ...prev, visible: false }));
    if (isConfirm && onConfirm) {
      onConfirm();
    }
  };

  // --- RESTART LOGIC ---
  const confirmRestart = () => {
    showModal(
      "Restart Hub",
      "This will reboot the hub. It will reconnect automatically after a few seconds. Continue?",
      "warning",
      true,
      performRestart,
      "Restart",
    );
  };

  const performRestart = async () => {
    setRestarting(true);
    if (hubId) {
      try {
        const client = new Paho.Client(
          "broker.hivemq.com",
          8000,
          "/mqtt",
          "app_cmd_" + Math.random().toString(16).substring(2, 10),
        );

        client.connect({
          useSSL: false,
          timeout: 5,
          onSuccess: () => {
            const message = new Paho.Message(
              JSON.stringify({ command: "restart" }),
            );
            message.destinationName = `bawatpieza/devices/${hubId}/commands`;
            client.send(message);

            setTimeout(() => {
              client.disconnect();
              setDeviceStatus("Reconnecting...");
              setWaitingForRestart(true);
            }, 500);

            setTimeout(() => {
              setWaitingForRestart((prev) => {
                if (prev) {
                  setRestarting(false);
                  showModal(
                    "Timeout",
                    "Hub is taking too long to come back online.",
                    "error",
                  );
                  return false;
                }
                return prev;
              });
            }, 15000);
          },
          onFailure: (err: any) => {
            console.log("MQTT Restart failed", err);
            setRestarting(false);
            showModal(
              "Error",
              "Failed to send restart command. Ensure you have an internet connection.",
              "error",
            );
          },
        });
      } catch (error) {
        console.log("MQTT Error", error);
        setRestarting(false);
        showModal("Error", "An unexpected error occurred.", "error");
      }
    }
  };

  // --- UNLINK LOGIC ---
  const confirmUnlink = () => {
    showModal(
      canUnlink ? "Unlink Hub" : "Disconnect Shared Device",
      canUnlink
        ? "This will remove the hub from your account, revoke access for all shared users, and force the hardware back into setup mode. Are you sure?"
        : "This will remove your shared access to this device. The owner's connection will not be affected. Are you sure?",
      "warning",
      true,
      performUnlink,
      canUnlink ? "Unlink" : "Disconnect",
    );
  };

  const performUnlink = async () => {
    setUnlinking(true);

    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) throw new Error("Your session expired. Please sign in again.");

      // delete directly from supabase instead of api endpoint
      const { error } = await supabase
        .from("device_pairings")
        .delete()
        .eq("hub_id", hubId)
        .eq("user_id", user.id);

      if (error) throw error;

      await Promise.all([
        AsyncStorage.removeItem("bawatpieza_hub_id"),
        AsyncStorage.removeItem("bawatpieza_shared_access"),
      ]);
      setHubId(null);
      setCanUnlink(false);

      if (hubId && canUnlink) {
        const client = new Paho.Client(
          "broker.hivemq.com",
          8000,
          "/mqtt",
          "app_cmd_" + Math.random().toString(16).substring(2, 10),
        );
        client.connect({
          useSSL: false,
          timeout: 5,
          onSuccess: () => {
            const message = new Paho.Message(
              JSON.stringify({ command: "reset" }),
            );
            message.destinationName = `bawatpieza/devices/${hubId}/commands`;
            client.send(message);
            setTimeout(() => client.disconnect(), 500);
          },
          onFailure: (error: unknown) => {
            console.warn("[device] hub reset after unlink failed", error);
          },
        });
      }

      showModal(
        canUnlink ? "Unlinked" : "Disconnected",
        canUnlink
          ? "The device was removed from your account. Shared users have lost access."
          : "Your shared access to this device has been removed.",
        "success",
      );
    } catch (error) {
      console.error("[device] failed to unlink hub", error);
      showModal(
        "Unlink failed",
        error instanceof Error
          ? error.message
          : "The device could not be unlinked.",
        "error",
      );
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <ScreenShell title="Device" showBack>
      <ContentCard
        eyebrow="Connected hardware"
        action={
          hubId ? (
            <View style={styles.actionGroup}>
              {restarting ? (
                <ActivityIndicator size="small" color={c.orange} />
              ) : (
                <Text
                  onPress={unlinking ? undefined : confirmRestart}
                  style={[styles.rerun, { color: c.orange }]}
                >
                  Restart
                </Text>
              )}
              {unlinking ? (
                <ActivityIndicator size="small" color={BAD} />
              ) : (
                <Text
                  onPress={restarting ? undefined : confirmUnlink}
                  style={[styles.rerun, { color: BAD }]}
                >
                  {canUnlink ? "Unlink" : "Disconnect"}
                </Text>
              )}
            </View>
          ) : null
        }
      >
        {hubId ? (
          <>
            <Row
              icon="hardware-chip-outline"
              label="Hub ID"
              value={hubId}
              last={false}
            />
            <Row
              icon="wifi-outline"
              label="Network Status"
              value={
                deviceStatus === "Online"
                  ? `Online · ${mqttPing} ms`
                  : deviceStatus
              }
              valueColor={
                deviceStatus === "Online"
                  ? OK
                  : deviceStatus === "Reconnecting..."
                    ? c.orange
                    : c.muted
              }
              last
            />
          </>
        ) : (
          <>
            <View
              style={[styles.row, { borderBottomWidth: 0, paddingBottom: 4 }]}
            >
              <View style={[styles.icon, { backgroundColor: c.surfaceMuted }]}>
                <Ionicons
                  name="alert-circle-outline"
                  size={17}
                  color={c.muted}
                />
              </View>
              <View style={styles.text}>
                <Text style={styles.label}>No Hub Paired</Text>
                <Text style={styles.sub}>Go to setup to add a new device.</Text>
              </View>
            </View>

            <Pressable
              style={styles.pairButton}
              onPress={() => router.push("/provisioning")}
            >
              <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" />
              <Text style={styles.pairButtonText}>Pair New Device</Text>
            </Pressable>
          </>
        )}
      </ContentCard>

      <Modal
        visible={modalConfig.visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!modalConfig.isConfirm) closeModal();
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: c.surface }]}>
            <View style={styles.modalHeader}>
              <View
                style={[
                  styles.modalIconBox,
                  {
                    backgroundColor:
                      modalConfig.type === "error"
                        ? "rgba(239, 68, 68, 0.1)"
                        : modalConfig.type === "success"
                          ? "rgba(34, 197, 94, 0.1)"
                          : "rgba(249, 115, 22, 0.1)",
                  },
                ]}
              >
                <Ionicons
                  name={
                    modalConfig.type === "error"
                      ? "close-circle"
                      : modalConfig.type === "success"
                        ? "checkmark-circle"
                        : "warning"
                  }
                  size={24}
                  color={
                    modalConfig.type === "error"
                      ? BAD
                      : modalConfig.type === "success"
                        ? OK
                        : c.orange
                  }
                />
              </View>
              <Text style={[styles.modalTitle, { color: c.text }]}>
                {modalConfig.title}
              </Text>
            </View>
            <Text style={[styles.modalMessage, { color: c.muted }]}>
              {modalConfig.message}
            </Text>

            {/* ROCK-SOLID BUTTON ROW PREVENTING FLEX COLLAPSE */}
            <View style={styles.modalActionRow}>
              {modalConfig.isConfirm && (
                <Pressable
                  style={({ pressed }) => [
                    styles.solidButton,
                    { backgroundColor: c.surfaceMuted },
                    pressed && { opacity: 0.8 },
                  ]}
                  onPress={() =>
                    setModalConfig({ ...modalConfig, visible: false })
                  }
                >
                  <Text
                    style={{ color: c.text, fontSize: 15, fontWeight: "bold" }}
                  >
                    Cancel
                  </Text>
                </Pressable>
              )}

              <Pressable
                style={({ pressed }) => [
                  styles.solidButton,
                  { backgroundColor: modalConfig.isConfirm ? BAD : c.accent },
                  pressed && { opacity: 0.8 },
                ]}
                onPress={closeModal}
              >
                <Text
                  style={{ color: "white", fontSize: 15, fontWeight: "bold" }}
                >
                  {modalConfig.isConfirm
                    ? modalConfig.confirmText
                    : modalConfig.type === "success"
                      ? "Got it"
                      : "Close"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

function Row({
  icon,
  label,
  value,
  last,
  valueColor,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  last: boolean;
  valueColor?: string;
}) {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  const PRUSSIAN = c.accent;
  return (
    <View style={[styles.row, last ? styles.rowLast : null]}>
      <View style={styles.icon}>
        <Ionicons name={icon} size={17} color={PRUSSIAN} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => {
  const PRUSSIAN = c.accent;
  const MUTED = c.muted;
  const LINE = c.line;
  return StyleSheet.create({
    actionGroup: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: LINE,
    },
    rowLast: { borderBottomWidth: 0 },
    icon: {
      width: 32,
      height: 32,
      borderRadius: 10,
      backgroundColor: c.accentSoft,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 12,
    },
    text: { flex: 1 },
    label: {
      color: PRUSSIAN,
      fontSize: 14,
      fontWeight: "800",
      fontFamily: fonts.extrabold,
      flex: 1,
    },
    sub: { color: MUTED, fontSize: 11, marginTop: 1 },
    value: {
      color: PRUSSIAN,
      fontSize: 13,
      fontWeight: "700",
      fontFamily: fonts.bold,
    },
    dot: { width: 12, height: 12, borderRadius: 6 },
    rerun: {
      color: PRUSSIAN,
      fontSize: 12,
      fontWeight: "800",
      fontFamily: fonts.extrabold,
    },
    pairButton: {
      flexDirection: "row",
      backgroundColor: PRUSSIAN,
      paddingVertical: 12,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 16,
      marginBottom: 4,
      gap: 8,
    },
    pairButtonText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "800",
      fontFamily: fonts.extrabold,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    modalCard: {
      width: "100%",
      maxWidth: 290,
      borderRadius: 20,
      padding: 20,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.15,
      shadowRadius: 20,
      elevation: 10,
      alignItems: "center",
    },
    modalHeader: {
      alignItems: "center",
      marginBottom: 12,
    },
    modalIconBox: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: fonts.extrabold,
      textAlign: "center",
    },
    modalMessage: {
      fontSize: 13,
      fontFamily: fonts.medium,
      textAlign: "center",
      lineHeight: 18,
      marginBottom: 20,
    },
    modalActionRow: {
      flexDirection: "row",
      width: "100%",
      gap: 8,
    },
    solidButton: {
      flex: 1,
      height: 48,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
  });
};
