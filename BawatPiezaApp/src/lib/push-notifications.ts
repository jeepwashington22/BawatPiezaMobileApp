import Constants, { AppOwnership } from "expo-constants";
import * as Device from "expo-device";
import { AppState, DeviceEventEmitter, Platform, Vibration } from "react-native";
import { apiFetch } from "./api";
import { removeLocalNotification, saveLocalNotification } from "./local-notifications";
import { supabase } from "./supabase";

type NotificationModule = typeof import("expo-notifications");

export type NotificationSoundId =
  | "system"
  | "bell_notification"
  | "clear_announce_tones"
  | "confirmation_tone"
  | "correct_tone"
  | "default_tone"
  | "emergency"
  | "option_preference_tone"
  | "wrong_answer_fail";
export type NotificationSoundPreferences = {
  emergency: NotificationSoundId;
  default: NotificationSoundId;
};

export const DEFAULT_NOTIFICATION_SOUND_PREFERENCES: NotificationSoundPreferences = {
  emergency: "emergency",
  default: "default_tone",
};

export const NOTIFICATION_SOUND_OPTIONS: Record<
  keyof NotificationSoundPreferences,
  { id: NotificationSoundId; label: string; description: string }[]
> = {
  emergency: [
    { id: "system", label: "System default", description: "Use your device's notification sound" },
    { id: "bell_notification", label: "Bell notification", description: "bell-notification.wav" },
    { id: "clear_announce_tones", label: "Clear announce tones", description: "clear announce tones.wav" },
    { id: "confirmation_tone", label: "Confirmation tone", description: "confirmation_tone.wav" },
    { id: "correct_tone", label: "Correct tone", description: "correct_tone.wav" },
    { id: "default_tone", label: "Default tone", description: "default.wav" },
    { id: "emergency", label: "Emergency tone", description: "emergency.wav" },
    { id: "option_preference_tone", label: "Option preference", description: "Option_Preference.wav" },
    { id: "wrong_answer_fail", label: "Wrong answer fail", description: "wrong answer fail.wav" },
  ],
  default: [
    { id: "system", label: "System default", description: "Use your device's notification sound" },
    { id: "bell_notification", label: "Bell notification", description: "bell-notification.wav" },
    { id: "clear_announce_tones", label: "Clear announce tones", description: "clear announce tones.wav" },
    { id: "confirmation_tone", label: "Confirmation tone", description: "confirmation_tone.wav" },
    { id: "correct_tone", label: "Correct tone", description: "correct_tone.wav" },
    { id: "default_tone", label: "Default tone", description: "default.wav" },
    { id: "emergency", label: "Emergency tone", description: "emergency.wav" },
    { id: "option_preference_tone", label: "Option preference", description: "Option_Preference.wav" },
    { id: "wrong_answer_fail", label: "Wrong answer fail", description: "wrong answer fail.wav" },
  ],
};

let Notifications: NotificationModule | null = null;
let feedRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
type SafetyAlertType = "smoke_detected" | "short_circuit_detected";
type SafetyAlertState = {
  lastEventId: string | null;
  lastSource: "local" | "remote" | null;
  localNotificationShown: boolean;
  missingEventIdLogged: boolean;
};
const safetyAlertState: Record<SafetyAlertType, SafetyAlertState> = {
  smoke_detected: {
    lastEventId: null,
    lastSource: null,
    localNotificationShown: false,
    missingEventIdLogged: false,
  },
  short_circuit_detected: {
    lastEventId: null,
    lastSource: null,
    localNotificationShown: false,
    missingEventIdLogged: false,
  },
};
let lastPowerModeNotificationEventId: string | null = null;
let lastPowerModeNotificationSource: "local" | "remote" | null = null;
const activeSafetyVibrations = new Set<SafetyAlertType>();
export const supportsCustomNotificationSounds = Constants.appOwnership !== AppOwnership.Expo;
const supportsCustomSounds = supportsCustomNotificationSounds;
let soundPreferences = DEFAULT_NOTIFICATION_SOUND_PREFERENCES;
const pendingSafetyPersist = new Map<string, Promise<void>>();
const persistedSafetyEvents = new Set<string>();
const notifiedPowerModeEvents = new Set<string>();
const notifiedAllocationEndEvents = new Set<string>();
const locallyScheduledAllocationEndEvents = new Set<string>();

function soundFile(sound: NotificationSoundId): string | undefined {
  if (sound === "system") return undefined;
  return `${sound}.wav`;
}

function effectiveSound(sound: NotificationSoundId): NotificationSoundId {
  return supportsCustomSounds ? sound : "system";
}

export async function fetchNotificationSoundPreferences(
  accessToken: string,
): Promise<NotificationSoundPreferences> {
  const response = await apiFetch("/notifications/sound-preferences", {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: 8_000,
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Could not load notification sound preferences (${response.status})${responseText ? `: ${responseText.slice(0, 300)}` : ""}`,
    );
  }
  let result: { preferences?: Partial<NotificationSoundPreferences> } | null = null;
  try {
    result = JSON.parse(responseText) as { preferences?: Partial<NotificationSoundPreferences> };
  } catch {
    throw new Error("Backend returned invalid notification sound preferences");
  }
  const emergency = result?.preferences?.emergency;
  const defaultSound = result?.preferences?.default;
  if (
    !isNotificationSoundId(emergency) ||
    !isNotificationSoundId(defaultSound)
  ) {
    throw new Error("Backend returned unsupported notification sound preferences");
  }
  return { emergency, default: defaultSound };
}

export async function saveNotificationSoundPreferences(
  accessToken: string,
  preferences: NotificationSoundPreferences,
): Promise<void> {
  const response = await apiFetch("/notifications/sound-preferences", {
    method: "PUT",
    timeoutMs: 8_000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(preferences),
  });
  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(
      `Could not save notification sound preferences (${response.status})${responseText ? `: ${responseText.slice(0, 300)}` : ""}`,
    );
  }
}

function isNotificationSoundId(value: unknown): value is NotificationSoundId {
  return value === "system" || NOTIFICATION_SOUND_OPTIONS.emergency.some(({ id }) => id === value);
}

async function configureNotificationChannels(): Promise<void> {
  if (Platform.OS !== "android" || !Notifications) return;
  const emergencySound = effectiveSound(soundPreferences.emergency);
  const defaultSound = effectiveSound(soundPreferences.default);
  const emergencyFile = soundFile(emergencySound);
  const defaultFile = soundFile(defaultSound);
  await Notifications.setNotificationChannelAsync(
    `smoke-alert-v8-${emergencySound}`,
    {
      name: "Emergency alerts",
      importance: Notifications.AndroidImportance.MAX,
      ...(emergencyFile ? { sound: emergencyFile } : {}),
      vibrationPattern: [500, 500, 500, 500, 1000, 500],
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: true,
      showBadge: true,
    },
  );
  await Notifications.setNotificationChannelAsync(
    `default-notification-v2-${defaultSound}`,
    {
      name: "Notifications",
      importance: Notifications.AndroidImportance.MAX,
      ...(defaultFile ? { sound: defaultFile } : {}),
      enableVibrate: true,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      showBadge: true,
    },
  );
}

export async function applyNotificationSoundPreferences(
  preferences: NotificationSoundPreferences,
): Promise<void> {
  soundPreferences = preferences;
  await configureNotificationChannels();
}

function signalNotificationFeedRefresh(): void {
  if (feedRefreshTimeout) clearTimeout(feedRefreshTimeout);
  feedRefreshTimeout = setTimeout(() => {
    feedRefreshTimeout = null;
    DeviceEventEmitter.emit("bawatpieza:refresh-notifications");
  }, 1_000);
}

async function persistSafetyEvent(
  hubId: string,
  eventId: string,
  zone: string,
  type: SafetyAlertType,
): Promise<void> {
  const key = `${type}:${hubId}:${eventId}`;
  if (persistedSafetyEvents.has(key)) return;
  const pending = pendingSafetyPersist.get(key);
  if (pending) return pending;

  const request = (async () => {
    const { data } = await supabase.auth.getSession();
    const accessToken = data.session?.access_token;
    if (!accessToken) throw new Error(`Cannot persist ${type} alert while signed out`);

    const response = await apiFetch(
      type === "smoke_detected"
        ? "/notifications/smoke-event"
        : "/notifications/short-circuit-event",
      {
        method: "POST",
        timeoutMs: 8_000,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ hubId, eventId, zone }),
      },
    );
    const responseText = await response.text();
    type SafetyEventResponse = {
      error?: string;
      message?: string;
      details?: unknown;
      notification?: { id?: string };
    };
    let result: SafetyEventResponse | null = null;
    try {
      result = JSON.parse(responseText) as SafetyEventResponse;
    } catch {
      // Preserve non-JSON responses below so proxy and parser errors are visible.
    }
    if (!response.ok) {
      const details = result?.details === undefined
        ? ""
        : ` details=${JSON.stringify(result.details).slice(0, 500)}`;
      const responseSummary = result?.error || result?.message || responseText.trim().slice(0, 300);
      throw new Error(
        `${type === "smoke_detected" ? "Smoke" : "Short-circuit"} notification save failed (${response.status})${responseSummary ? `: ${responseSummary}` : ""}${details}`,
      );
    }
    if (!result?.notification?.id) {
      throw new Error(`Backend did not return the saved ${type} notification`);
    }
    persistedSafetyEvents.add(key);
    if (persistedSafetyEvents.size > 100) {
      const oldest = persistedSafetyEvents.values().next().value;
      if (oldest) persistedSafetyEvents.delete(oldest);
    }
    console.info(
      `[push-notifications] ${type} event saved event_id=${eventId} notification_id=${result.notification.id}`,
    );
    signalNotificationFeedRefresh();
  })();
  pendingSafetyPersist.set(key, request);
  try {
    await request;
  } finally {
    if (pendingSafetyPersist.get(key) === request) pendingSafetyPersist.delete(key);
  }
}

function updateSafetyVibration(type: SafetyAlertType, active: boolean): void {
  const wasActive = activeSafetyVibrations.has(type);
  if (wasActive === active) return;
  if (active) activeSafetyVibrations.add(type);
  else activeSafetyVibrations.delete(type);

  if (activeSafetyVibrations.size > 0) {
    Vibration.vibrate([500, 500, 500, 500, 1000, 500], true);
  } else {
    Vibration.cancel();
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

export async function notifySystemAllocationEnded(
  hubId: string,
  eventId: string,
  reason: "runtime_complete" | "force_stop",
): Promise<void> {
  if (!hubId.trim() || !eventId.trim()) {
    throw new Error("System allocation end notification requires a hub and event ID.");
  }
  const eventKey = `${hubId}:${eventId}`;
  if (notifiedAllocationEndEvents.has(eventKey)) return;
  notifiedAllocationEndEvents.add(eventKey);
  if (notifiedAllocationEndEvents.size > 100) {
    const oldest = notifiedAllocationEndEvents.values().next().value;
    if (oldest) notifiedAllocationEndEvents.delete(oldest);
  }

  const title = "System allocation ended";
  const body =
    reason === "force_stop"
      ? "The system allocation was force-stopped. All configured room relays were confirmed off."
      : "The scheduled system allocation has ended. All scheduled room relays were confirmed off.";
  const createdAt = new Date().toISOString();
  const localId = `local:system_allocation_ended:${encodeURIComponent(hubId)}:${encodeURIComponent(eventId)}`;
  if (Notifications) {
    const defaultSound = effectiveSound(soundPreferences.default);
    const defaultSoundFile = soundFile(defaultSound);
    try {
      await configureNotificationChannels();
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: defaultSoundFile ?? "default",
          priority: Notifications.AndroidNotificationPriority.MAX,
          data: {
            type: "system_allocation_ended",
            source: "allocation_local",
            eventId,
            hubId,
            reason,
            title,
            body,
          },
          ...(Platform.OS === "android"
            ? { channelId: `default-notification-v2-${defaultSound}` }
            : {}),
        },
        trigger: null,
      });
      locallyScheduledAllocationEndEvents.add(eventKey);
      if (locallyScheduledAllocationEndEvents.size > 100) {
        const oldest = locallyScheduledAllocationEndEvents.values().next().value;
        if (oldest) locallyScheduledAllocationEndEvents.delete(oldest);
      }
      console.info(
        `[push-notifications] allocation heads-up notification scheduled hub=${hubId} event_id=${eventId} notification_id=${notificationId}`,
      );
    } catch (error) {
      console.error("[push-notifications] Failed to show allocation heads-up notification", error);
    }
  } else {
    console.warn("[push-notifications] Native notifications are unavailable for allocation completion.");
  }

  let userId: string | undefined;
  let accessToken: string | undefined;
  try {
    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    userId = sessionData.session?.user.id;
    accessToken = sessionData.session?.access_token;
  } catch (error) {
    console.error(
      "[push-notifications] Could not load session for allocation notification",
      error,
    );
  }

  if (userId) {
    try {
      await saveLocalNotification(userId, {
        id: localId,
        type: "system_allocation_ended",
        title,
        body,
        payload: { type: "system_allocation_ended", eventId, hubId, reason },
        reference_id: null,
        read_at: null,
        created_at: createdAt,
      });
    } catch (error) {
      console.error("[push-notifications] Failed to save allocation notification locally", error);
    }
  }
  signalNotificationFeedRefresh();

  if (!accessToken || !userId) {
    console.warn("[push-notifications] Allocation ended, but no signed-in session is available to sync the notification.");
    return;
  }
  const response = await apiFetch("/notifications/system-allocation-ended", {
    method: "POST",
    timeoutMs: 8_000,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ hubId, eventId, reason }),
  });
  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Could not sync allocation notification (${response.status})${responseText ? `: ${responseText.slice(0, 300)}` : ""}`,
    );
  }
  let result: { notification?: { id?: string } } | null = null;
  try {
    result = JSON.parse(responseText) as { notification?: { id?: string } };
  } catch {
    throw new Error("Backend returned an invalid allocation notification response.");
  }
  if (!result?.notification?.id) {
    throw new Error("Backend did not return the saved allocation notification.");
  }
  try {
    await removeLocalNotification(userId, localId);
  } catch (error) {
    console.warn("[push-notifications] Failed to clear synced allocation inbox alert", error);
  }
  signalNotificationFeedRefresh();
}

try {
  Notifications = require("expo-notifications") as NotificationModule;
  Notifications.setNotificationHandler({
    handleNotification: async (notification) => {
      const content = notification.request.content;
      const safetyType = content.data?.type === "smoke_detected"
        ? "smoke_detected"
        : content.data?.type === "short_circuit_detected"
          ? "short_circuit_detected"
          : null;
      const isSafetyAlert = safetyType !== null;
      const isPowerModeAlert = content.data?.type === "power_mode_changed";
      const isAllocationEndAlert =
        content.data?.type === "system_allocation_ended";
      const isLocalSafetyAlert = content.data?.source === "mqtt_local";
      const isLocalPowerModeAlert = content.data?.source === "mqtt_local";
      const eventId =
        typeof content.data?.eventId === "string" ? content.data.eventId : null;
      const hubId =
        typeof content.data?.hubId === "string" ? content.data.hubId : "";
      const powerModeEventKey = eventId
        ? `${hubId}:${eventId}`
        : null;
      if (
        isSafetyAlert &&
        safetyType &&
        !isLocalSafetyAlert &&
        eventId &&
        safetyAlertState[safetyType].lastEventId === eventId &&
        safetyAlertState[safetyType].lastSource === "local"
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
        isAllocationEndAlert &&
        content.data?.source !== "allocation_local" &&
        eventId &&
        locallyScheduledAllocationEndEvents.has(`${hubId}:${eventId}`)
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
      if (isSafetyAlert && safetyType) {
        safetyAlertState[safetyType].lastEventId = eventId;
        safetyAlertState[safetyType].lastSource = isLocalSafetyAlert ? "local" : "remote";
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

  soundPreferences = await fetchNotificationSoundPreferences(accessToken);
  await configureNotificationChannels();

  if (!supportsCustomSounds) {
    console.info(
      "[push-notifications] Expo Go uses the system notification sound; install a rebuilt development app to use bundled sounds.",
    );
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
      supportsCustomSounds,
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
  const defaultSound = effectiveSound(soundPreferences.default);
  const defaultSoundFile = soundFile(defaultSound);

  if (Notifications) {
    void Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: defaultSoundFile ?? "default",
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
        ...(Platform.OS === "android"
          ? { channelId: `default-notification-v2-${defaultSound}` }
          : {}),
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

function updateSafetyAlarm(
  type: SafetyAlertType,
  active: boolean,
  zone = "",
  hubId = "",
  eventId = "",
): void {
  const state = safetyAlertState[type];
  const isSmoke = type === "smoke_detected";
  const defaultZone = "the device enclosure";
  const location = zone || defaultZone;
  const title = isSmoke
    ? "Smoke detected — device shut down"
    : "Short circuit detected — device shut down";
  const body = isSmoke
    ? `Smoke detected in ${location}. The hub turned off its relays and power outputs. Check the device physically before restoring power.`
    : `A short circuit was detected in ${location}. The hub turned off its relays and power outputs. Inspect the physical device and wiring before resetting the hub.`;

  updateSafetyVibration(type, active);
  if (active) {
    if (hubId && eventId) {
      state.missingEventIdLogged = false;
      void persistSafetyEvent(hubId, eventId, location, type).catch((error) => {
        console.error(
          `[push-notifications] failed to persist ${type} event hub=${hubId} event_id=${eventId}`,
          error,
        );
      });
    } else if (!state.missingEventIdLogged) {
      state.missingEventIdLogged = true;
      console.error(
        `[push-notifications] cannot persist active ${type} event without hub/event ID (hub=${hubId || "missing"}, event=${eventId || "missing"})`,
      );
    }
    if (!Notifications || state.localNotificationShown) return;
    if (
      state.lastSource === "remote" &&
      eventId &&
      state.lastEventId === eventId
    ) {
      state.localNotificationShown = true;
      return;
    }

    state.localNotificationShown = true;
    state.lastEventId = eventId || null;
    state.lastSource = "local";
    const emergencySound = effectiveSound(soundPreferences.emergency);
    const emergencySoundFile = soundFile(emergencySound);
    void Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        sound: emergencySoundFile ?? "default",
        priority: Notifications.AndroidNotificationPriority.MAX,
        data: {
          type,
          source: "mqtt_local",
          title,
          body,
          ...(eventId ? { eventId } : {}),
          hubId,
          zone: location,
        },
        ...(Platform.OS === "android"
          ? { channelId: `smoke-alert-v8-${emergencySound}` }
          : {}),
      },
      trigger: null,
    })
      .then((notificationId) => {
        console.info(
          `[push-notifications] local ${type} alert scheduled event_id=${eventId || "missing"} notification_id=${notificationId}`,
        );
      })
      .catch((error) => {
        state.localNotificationShown = false;
        console.error(`[push-notifications] failed to schedule local ${type} alert`, error);
      });
    setTimeout(signalNotificationFeedRefresh, 2_500);
  } else {
    state.localNotificationShown = false;
    state.lastEventId = null;
    state.lastSource = null;
    state.missingEventIdLogged = false;
  }
}

export function updateSmokeAlarm(
  active: boolean,
  zone = "",
  hubId = "",
  eventId = "",
): void {
  updateSafetyAlarm("smoke_detected", active, zone, hubId, eventId);
}

export function updateShortCircuitAlarm(
  active: boolean,
  zone = "",
  hubId = "",
  eventId = "",
): void {
  updateSafetyAlarm("short_circuit_detected", active, zone, hubId, eventId);
}
