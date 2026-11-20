import Constants from "expo-constants";
import * as Device from "expo-device";
import { Platform, Vibration } from "react-native";
import { apiFetch } from "./api";

type NotificationModule = typeof import("expo-notifications");

let Notifications: NotificationModule | null = null;
try {
  Notifications = require("expo-notifications") as NotificationModule;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
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
    await Notifications.setNotificationChannelAsync("smoke-alert", {
      name: "Smoke and safety alerts",
      importance: Notifications.AndroidImportance.MAX,
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

let smokeLocalNotificationShown = false;

export async function updateSmokeAlarm(
  active: boolean,
  zone = "",
): Promise<void> {
  if (active) {
    Vibration.vibrate([500, 500, 500, 500, 1000, 500], true);
    if (Notifications && !smokeLocalNotificationShown) {
      smokeLocalNotificationShown = true;
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Smoke detected — device shut down",
          body: `${zone || "Device enclosure"}: check the device physically. Relays and power outputs are off.`,
          sound: "default",
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: { type: "smoke_detected", zone },
          ...(Platform.OS === "android"
            ? { channelId: "smoke-alert" }
            : {}),
        },
        trigger: null,
      });
    }
  } else {
    Vibration.cancel();
    smokeLocalNotificationShown = false;
  }
}
