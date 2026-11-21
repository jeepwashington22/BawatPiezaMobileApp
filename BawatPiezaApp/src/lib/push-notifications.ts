import Constants from "expo-constants";
import * as Device from "expo-device";
import { AppState, DeviceEventEmitter, Platform, Vibration } from "react-native";
import { apiFetch } from "./api";
import { removeLocalNotification, saveLocalNotification } from "./local-notifications";
import { supabase } from "./supabase";

type NotificationModule = typeof import("expo-notifications");

let Notifications: NotificationModule | null = null;
let feedRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSmokeNotificationEventId: string | null = null;
let lastSmokeNotificationSource: "local" | "remote" | null = null;
let lastPowerModeNotificationEventId: string | null = null;
let lastPowerModeNotificationSource: "local" | "remote" | null = null;
let smokeLocalNotificationShown = false;
const pendingSmokePersist = new Map<string, Promise<void>>();
const persistedSmokeEvents = new Set<string>();
const notifiedPowerModeEvents = new Set<string>();

function signalNotificationFeedRefresh(): void {
  if (feedRefreshTimeout) clearTimeout(feedRefreshTimeout);
  feedRefreshTimeout = setTimeout(() => {
    feedRefreshTimeout = null;
    DeviceEventEmitter.emit("bawatpieza:refresh-notifications");
  }, 1_000);
}

async function persistSmokeEvent(
  hubId: string,
  eventId: string,
  zone: string,
): Promise<void> {
  const key = `${hubId}:${eventId}`;
  if (persistedSmokeEvents.has(key)) return;
  const pending = pendingSmokePersist.get(key);
  if (pending) return pending;

  const request = (async () => {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error("Cannot persist smoke alert while signed out");

    const response = await apiFetch("/notifications/smoke-event", {
      method: "POST",
      timeoutMs: 8_000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ hubId, eventId, zone }),
    });
    const responseText = await response.text();
    type SmokeEventResponse = {
      error?: string;
      message?: string;
      details?: unknown;
      notification?: { id?: string };
    };
    let result: SmokeEventResponse | null = null;
    try {
      result = JSON.parse(responseText) as SmokeEventResponse;
    } catch {
      // Preserve non-JSON responses below so proxy and parser errors are visible.
    }
    if (!response.ok) {
      const details = result?.details === undefined
        ? ""
        : ` details=${JSON.stringify(result.details).slice(0, 500)}`;
      const responseSummary = result?.error || result?.message || responseText.trim().slice(0, 300);
      throw new Error(
        `Smoke notification save failed (${response.status})${responseSummary ? `: ${responseSummary}` : ""}${details}`,
      );
    }
    if (!result?.notification?.id) {
      throw new Error("Backend did not return the saved smoke notification");
    }
    persistedSmokeEvents.add(key);
    if (persistedSmokeEvents.size > 100) {
      const oldest = persistedSmokeEvents.values().next().value;
      if (oldest) persistedSmokeEvents.delete(oldest);
    }
    console.info(
      `[push-notifications] smoke event saved event_id=${eventId} notification_id=${result.notification.id}`,
    );
    signalNotificationFeedRefresh();
  })();
  pendingSmokePersist.set(key, request);
  try {
    await request;
  } finally {
    if (pendingSmokePersist.get(key) === request) pendingSmokePersist.delete(key);
  }
}

async function persistPowerModeEvent(
  hubId: string,
  eventId: string,
  previousMode: "grid" | "battery" | "shutdown",
  currentMode: "grid" | "battery" | "shutdown",
): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  const accessToken = session?.access_token;
  if (!session || !accessToken) throw new Error("Cannot persist power-mode alert while signed out");
  const userId = session.user.id;
  const modeName = currentMode === "shutdown"
    ? "Shutdown"
    : currentMode === "grid"
      ? "Grid"
      : "Battery";
  const title = `Power source switched to ${modeName}`;
  const body = currentMode === "shutdown"
    ? `Your device has shut down (previously using ${previousMode}).`
    : `Your device is now using ${modeName.toLowerCase()} power (previously using ${previousMode}).`;
  const localId = `local:power_mode_changed:${encodeURIComponent(hubId)}:${encodeURIComponent(eventId)}`;

  try {
    await saveLocalNotification(userId, {
      id: localId,
      type: "power_mode_changed",
      title,
      body,
      payload: { type: "power_mode_changed", eventId, hubId, previousMode, currentMode },
      reference_id: null,
      read_at: null,
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn("[push-notifications] failed to save local power-mode inbox alert", error);
  }
  signalNotificationFeedRefresh();

  const response = await apiFetch("/notifications/power-mode-event", {
    method: "POST",
    timeoutMs: 8_000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ hubId, eventId, previousMode, currentMode }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Power-mode notification save failed (${response.status})${responseText ? `: ${responseText.slice(0, 300)}` : ""}`,
    );
  }
  let result: { notification?: { id?: string } } | null = null;
  try {
    result = JSON.parse(responseText) as { notification?: { id?: string } };
  } catch {
    throw new Error("Backend returned an invalid power-mode notification response");
  }
  if (!result?.notification?.id) {
    throw new Error("Backend did not return the saved power-mode notification");
  }
  try {
    await removeLocalNotification(userId, localId);
  } catch (error) {
    console.warn("[push-notifications] failed to clear synced power-mode inbox alert", error);
  }
  signalNotificationFeedRefresh();
}

try {
  Notifications = require("expo-notifications") as NotificationModule;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const content = notification.request.content;
      const isSmokeAlert = content.data?.type === "smoke_detected";
      const isPowerModeAlert = content.data?.type === "power_mode_changed";
      const isLocalSmokeAlert = content.data?.source === "mqtt_local";
      const isLocalPowerModeAlert = content.data?.source === "mqtt_local";
      const eventId =
        typeof content.data?.eventId === "string" ? content.data.eventId : null;
      const hubId =
        typeof content.data?.hubId === "string" ? content.data.hubId : "";
      const powerModeEventKey = eventId
        ? `${hubId}:${eventId}`
        : null;
      if (
        isSmokeAlert &&
        !isLocalSmokeAlert &&
        eventId &&
        lastSmokeNotificationEventId === eventId &&
        lastSmokeNotificationSource === "local"
      ) {
        return {
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: true,
        };
      }
      if (
        isPowerModeAlert &&
        !isLocalPowerModeAlert &&
        powerModeEventKey &&
        notifiedPowerModeEvents.has(powerModeEventKey)
      ) {
        return {
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: true,
        };
      }
      if (
        isPowerModeAlert &&
        !isLocalPowerModeAlert &&
        eventId &&
        lastPowerModeNotificationEventId === eventId &&
        lastPowerModeNotificationSource === "local"
      ) {
        return {
          shouldShowBanner: false,
          shouldShowList: false,
          shouldPlaySound: false,
          shouldSetBadge: true,
        };
      }
      if (isSmokeAlert) {
        lastSmokeNotificationEventId = eventId;
        lastSmokeNotificationSource = isLocalSmokeAlert ? "local" : "remote";
      }
      if (isPowerModeAlert) {
        if (powerModeEventKey) {
          notifiedPowerModeEvents.add(powerModeEventKey);
          if (notifiedPowerModeEvents.size > 100) {
            const oldest = notifiedPowerModeEvents.values().next().value;
            if (oldest) notifiedPowerModeEvents.delete(oldest);
          }
        }
        lastPowerModeNotificationEventId = eventId;
        lastPowerModeNotificationSource = isLocalPowerModeAlert ? "local" : "remote";
      }
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      };
    },
  });
  Notifications.addNotificationReceivedListener(signalNotificationFeedRefresh);
  Notifications.addNotificationResponseReceivedListener(signalNotificationFeedRefresh);
  AppState.addEventListener("change", (state) => {
    if (state === "active") signalNotificationFeedRefresh();
  });
} catch (error) {
  console.warn(
    "[push-notifications] Native notification module unavailable. Rebuild the Android app or install a development build.",
    error,
  );
}

export async function registerPushNotifications(accessToken: string): Promise<void> {
  if (Platform.OS === "web" || !Notifications) return;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("smoke-alert-v6", {
      name: "Smoke and safety alerts",
      importance: Notifications.AndroidImportance.MAX,
      sound: "custom_sound.wav",
      vibrationPattern: [500, 500, 500, 500, 1000, 500],
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      showBadge: true,
    });
    await Notifications.setNotificationChannelAsync("power-mode-alert-v1", {
      name: "Power source changes",
      importance: Notifications.AndroidImportance.MAX,
      sound: "custom_sound.wav",
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let status = existingStatus;
  if (status !== "granted") {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }
  if (status !== "granted" || !Device.isDevice) return;

  const projectId =
    Constants.easConfig?.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId;
  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  const response = await apiFetch("/notifications/push-token", {
    method: "POST",
    timeoutMs: 8_000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      expoPushToken: token.data,
      platform: Platform.OS,
    }),
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Push token registration failed (${response.status})${responseText ? `: ${responseText.slice(0, 300)}` : ""}`,
    );
  }
}

export function updatePowerModeNotification(
  hubId: string,
  eventId: string,
  previousMode: "grid" | "battery" | "shutdown",
  currentMode: "grid" | "battery" | "shutdown",
): void {
  const key = `${hubId}:${eventId}`;
  if (!eventId || previousMode === currentMode || notifiedPowerModeEvents.has(key)) return;
  notifiedPowerModeEvents.add(key);
  if (notifiedPowerModeEvents.size > 100) {
    const oldest = notifiedPowerModeEvents.values().next().value;
    if (oldest) notifiedPowerModeEvents.delete(oldest);
  }

  const modeName = currentMode === "shutdown"
    ? "Shutdown"
    : currentMode === "grid"
      ? "Grid"
      : "Battery";
  const title = `Power source switched to ${modeName}`;
  const body = currentMode === "shutdown"
    ? `Your device has shut down (previously using ${previousMode}).`
    : `Your device is now using ${modeName.toLowerCase()} power (previously using ${previousMode}).`;
  lastPowerModeNotificationEventId = eventId;
  lastPowerModeNotificationSource = "local";

  if (Notifications) {
    void Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: "custom_sound.wav",
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: {
          type: "power_mode_changed",
          source: "mqtt_local",
          eventId,
          hubId,
          previousMode,
          currentMode,
          title,
          body,
        },
        ...(Platform.OS === "android" ? { channelId: "power-mode-alert-v1" } : {}),
      },
      trigger: null,
    }).then((notificationId) => {
      console.info(`[push-notifications] local power-mode alert scheduled hub=${hubId} event_id=${eventId} notification_id=${notificationId}`);
    }).catch((error) => {
      console.error(`[push-notifications] failed to schedule local power-mode alert hub=${hubId} event_id=${eventId}`, error);
    });
  }

  void persistPowerModeEvent(hubId, eventId, previousMode, currentMode).catch((error) => {
    console.error(`[push-notifications] failed to persist power-mode alert hub=${hubId} event_id=${eventId}`, error);
  });
}

export function updateSmokeAlarm(
  active: boolean,
  zone = "",
  hubId = "",
  eventId = "",
): void {
  if (active) {
    Vibration.vibrate([500, 500, 500, 500, 1000, 500], true);
    if (hubId && eventId) {
      void persistSmokeEvent(hubId, eventId, zone || "the device enclosure").catch((error) => {
        console.error(
          `[push-notifications] failed to persist smoke event hub=${hubId} event_id=${eventId}`,
          error,
        );
      });
    } else {
      console.error(
        `[push-notifications] cannot persist active smoke event without hub/event ID (hub=${hubId || "missing"}, event=${eventId || "missing"})`,
      );
    }
    if (!Notifications || smokeLocalNotificationShown) return;
    if (
      lastSmokeNotificationSource === "remote" &&
      eventId &&
      lastSmokeNotificationEventId === eventId
    ) {
      smokeLocalNotificationShown = true;
      return;
    }

    smokeLocalNotificationShown = true;
    lastSmokeNotificationEventId = eventId || null;
    lastSmokeNotificationSource = "local";
    void Notifications.scheduleNotificationAsync({
      content: {
        title: "Smoke detected — device shut down",
        body: `Smoke detected in ${zone || "the device enclosure"}. The hub turned off its relays and power outputs. Check the device physically before restoring power.`,
        sound: "custom_sound.wav",
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: {
          type: "smoke_detected",
          source: "mqtt_local",
          title: "Smoke detected — device shut down",
          body: `Smoke detected in ${zone || "the device enclosure"}. The hub turned off its relays and power outputs. Check the device physically before restoring power.`,
          ...(eventId ? { eventId } : {}),
          hubId,
          zone: zone || "the device enclosure",
        },
        ...(Platform.OS === "android"
          ? { channelId: "smoke-alert-v6" }
          : {}),
      },
      trigger: null,
    })
      .then((notificationId) => {
        console.info(
          `[push-notifications] local smoke alert scheduled event_id=${eventId || "missing"} notification_id=${notificationId}`,
        );
      })
      .catch((error) => {
        smokeLocalNotificationShown = false;
        console.error("[push-notifications] failed to schedule local smoke alert", error);
      });
    setTimeout(signalNotificationFeedRefresh, 2_500);
  } else {
    Vibration.cancel();
    smokeLocalNotificationShown = false;
    lastSmokeNotificationEventId = null;
    lastSmokeNotificationSource = null;
  }
}
