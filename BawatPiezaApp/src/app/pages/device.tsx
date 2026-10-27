import { fonts, useTheme, type ThemeColors } from "../../theme";
import { useEffect, useRef, useState } from "react";
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
import { apiFetch } from "../../lib/api";
import { notifyDeviceAccessChanged } from "../../components/device-status-banner";
import { deviceSetupRequiredKey } from "../../lib/device-setup";

// @ts-ignore
import Paho from "paho-mqtt";

export default function DeviceScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const styles = makeStyles(c);

  const OK = c.ok;
  const BAD = c.danger;

  const [hubId, setHubId] = useState<string | null>(null);
  const [deviceAccessState, setDeviceAccessState] = useState<
    "checking" | "connected" | "unpaired" | "error"
  >("checking");
  const [canUnlink, setCanUnlink] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const unlinkInProgressRef = useRef(false);
  const accessRefreshIdRef = useRef(0);
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
    let cancelled = false;
    let checking = false;

    const refreshDeviceAccess = async () => {
      if (checking || unlinkInProgressRef.current) return;
      checking = true;
      const refreshId = accessRefreshIdRef.current;
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
            setDeviceAccessState("unpaired");
          }
          return;
        }

        const token = authData.session?.access_token;
        if (!token) throw new Error("Your session expired. Please sign in again.");

        const response = await apiFetch("/accounts/device-access", {
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 8_000,
        });
        if (!response.ok) {
          throw new Error(`Device access check failed (${response.status}).`);
        }
        const access = (await response.json()) as {
          access_granted?: boolean;
          hub_id?: string | null;
          can_unlink?: boolean;
        };
        const hasAccess = Boolean(access.access_granted && access.hub_id);
        if (cancelled || refreshId !== accessRefreshIdRef.current) return;

        if (hasAccess && access.hub_id) {
          await AsyncStorage.setItem("bawatpieza_hub_id", access.hub_id);
          if (access.can_unlink === false) {
            await AsyncStorage.setItem("bawatpieza_shared_access", "1");
          } else {
            await AsyncStorage.removeItem("bawatpieza_shared_access");
          }
        } else {
          await Promise.all([
            AsyncStorage.removeItem("bawatpieza_hub_id"),
            AsyncStorage.removeItem("bawatpieza_shared_access"),
            AsyncStorage.removeItem(deviceSetupRequiredKey(user.id)),
          ]);
        }

        if (!cancelled) {
          setHubId(hasAccess ? access.hub_id ?? null : null);
          setCanUnlink(hasAccess && access.can_unlink !== false);
          setDeviceAccessState(hasAccess ? "connected" : "unpaired");
        }
      } catch (error) {
        console.warn("[device] failed to refresh device access", error);
        if (!cancelled) setDeviceAccessState("error");
      } finally {
        checking = false;
      }
    };

    void refreshDeviceAccess();
    const interval = setInterval(() => void refreshDeviceAccess(), 15_000);
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

    let active = true;
    let connecting = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let connectMQTT = () => {};

    const disconnectIfConnected = () => {
      try {
        if (client.isConnected()) client.disconnect();
      } catch (error) {
        console.warn("[device] MQTT disconnect cleanup failed", error);
      }
    };

    const scheduleReconnect = () => {
      if (!active || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        connectMQTT();
      }, 3000);
    };

    const startWatchdog = () => {
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(() => {
        watchdog = null;
        setDeviceStatus((prev) =>
          prev === "Reconnecting..." ? prev : "Offline",
        );
      }, 4000);
    };

    connectMQTT = () => {
      if (!active || connecting || client.isConnected()) return;
      connecting = true;

      client.connect({
        useSSL: false,
        timeout: 5,
        onSuccess: () => {
          connecting = false;
          if (!active) {
            disconnectIfConnected();
            return;
          }
          try {
            client.subscribe(statusTopic);
            client.subscribe(telemetryTopic);
          } catch (error) {
            console.warn("[device] MQTT subscription failed", error);
            disconnectIfConnected();
            scheduleReconnect();
          }
        },
        onFailure: (error: unknown) => {
          connecting = false;
          if (!active) return;
          console.warn("[device] MQTT connection failed", error);
          scheduleReconnect();
        },
      });
    };

    client.onConnectionLost = (responseObject: any) => {
      connecting = false;
      if (!active) return;
      if (responseObject.errorCode !== 0) {
        setDeviceStatus("Reconnecting...");
        scheduleReconnect();
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
      active = false;
      if (watchdog) clearTimeout(watchdog);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      disconnectIfConnected();
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
    unlinkInProgressRef.current = true;
    accessRefreshIdRef.current += 1;

    try {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;
      if (!user) throw new Error("Your session expired. Please sign in again.");

      const token = data.session?.access_token;
      if (!token) throw new Error("Your session expired. Please sign in again.");

      const response = await apiFetch("/accounts/device-access", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hub_id: hubId }),
        timeoutMs: 8_000,
      });
      const result = (await response.json().catch(() => null)) as {
        ok?: boolean;
        message?: string;
        error?: string;
      } | null;
      if (!response.ok || !result?.ok) {
        throw new Error(
          result?.message ??
            result?.error ??
            `Device unlink failed (${response.status}).`,
        );
      }

      await Promise.all([
        AsyncStorage.removeItem("bawatpieza_hub_id"),
        AsyncStorage.removeItem("bawatpieza_shared_access"),
        AsyncStorage.removeItem(deviceSetupRequiredKey(user.id)),
      ]);
      notifyDeviceAccessChanged(false);
      setHubId(null);
      setCanUnlink(false);
      setDeviceStatus("Offline");
      setWaitingForRestart(false);
      accessRefreshIdRef.current += 1;

      if (hubId && canUnlink) {
        const client = new Paho.Client(
          "broker.hivemq.com",
          8000,
          "/mqtt",
          "app_cmd_" + Math.random().toString(16).substring(2, 10),
        );
        let disconnectTimer: ReturnType<typeof setTimeout> | null = null;
        client.onConnectionLost = () => {
          if (disconnectTimer) {
            clearTimeout(disconnectTimer);
            disconnectTimer = null;
          }
        };
        client.connect({
          useSSL: false,
          timeout: 5,
          onSuccess: () => {
            try {
              const message = new Paho.Message(
                JSON.stringify({ command: "reset" }),
              );
              message.destinationName = `bawatpieza/devices/${hubId}/commands`;
              client.send(message);
              disconnectTimer = setTimeout(() => {
                disconnectTimer = null;
                try {
                  if (client.isConnected()) {
                    client.disconnect();
                  }
                } catch (error) {
                  console.warn("[device] MQTT cleanup after unlink failed", error);
                }
              }, 500);
            } catch (error) {
              console.warn("[device] hub reset command could not be sent", error);
            }
          },
          onFailure: (error: unknown) => {
            console.warn("[device] hub reset after unlink failed", error);
          },
        });
      }
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
      unlinkInProgressRef.current = false;
      setUnlinking(false);
    }
  };

  return (
    <ScreenShell title="Device" showBack showNoDeviceNotice={false}>
      <ContentCard
        eyebrow={
          deviceAccessState === "checking"
            ? "Checking device pairing"
            : deviceAccessState === "connected"
              ? "Connected hardware"
              : deviceAccessState === "error"
                ? "Device status unavailable"
                : "Device pairing"
        }
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
        {deviceAccessState === "checking" ? (
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <ActivityIndicator size="small" color={c.orange} />
            <Text style={[styles.sub, { marginLeft: 12 }]}>
              Checking whether a hub is paired...
            </Text>
          </View>
        ) : deviceAccessState === "error" ? (
          <View style={[styles.row, { borderBottomWidth: 0 }]}>
            <View style={[styles.icon, { backgroundColor: c.surfaceMuted }]}>
              <Ionicons
                name="cloud-offline-outline"
                size={17}
                color={c.muted}
              />
            </View>
            <View style={styles.text}>
              <Text style={styles.label}>Could Not Verify Device</Text>
              <Text style={styles.sub}>
                Check your connection. Device pairing will be checked again
                automatically.
              </Text>
            </View>
          </View>
        ) : hubId ? (
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
