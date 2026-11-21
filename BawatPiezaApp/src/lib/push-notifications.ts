import Constants from "expo-constants";
import * as Device from "expo-device";
import { AppState, DeviceEventEmitter, Platform, Vibration } from "react-native";
import { apiFetch } from "./api";
import { supabase } from "./supabase";

type NotificationModule = typeof import("expo-notifications");

let Notifications: NotificationModule | null = null;
let feedRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
let lastSmokeNotificationEventId: string | null = null;
let lastSmokeNotificationSource: "local" | "remote" | null = null;
let smokeLocalNotificationShown = false;
const pendingSmokePersist = new Map<string, Promise<void>>();
const persistedSmokeEvents = new Set<string>();

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

try {
  Notifications = require("expo-notifications") as NotificationModule;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const content = notification.request.content;
      const isSmokeAlert = content.data?.type === "smoke_detected";
      const isLocalSmokeAlert = content.data?.source === "mqtt_local";
      const eventId =
        typeof content.data?.eventId === "string" ? content.data.eventId : null;
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
      if (isSmokeAlert) {
        lastSmokeNotificationEventId = eventId;
        lastSmokeNotificationSource = isLocalSmokeAlert ? "local" : "remote";
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

  await apiFetch("/notifications/push-token", {
    method: "POST",
    timeoutMs: 8_000,
    headers: { Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({
      expoPushToken: token.data,
      platform: Platform.OS,
    }),
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
