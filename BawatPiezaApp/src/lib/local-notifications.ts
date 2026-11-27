import AsyncStorage from "@react-native-async-storage/async-storage";

export type LocalNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  payload?: Record<string, unknown> | null;
  reference_id: string | null;
  read_at: string | null;
  created_at: string;
};

const STORAGE_KEY_PREFIX = "bawatpieza:local-notifications:";

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function isLocalNotification(value: unknown): value is LocalNotification {
  if (!value || typeof value !== "object") return false;
  const notification = value as Record<string, unknown>;
  return typeof notification.id === "string"
    && typeof notification.type === "string"
    && typeof notification.title === "string"
    && (typeof notification.body === "string" || notification.body === null)
    && (notification.payload === undefined
      || notification.payload === null
      || typeof notification.payload === "object" && !Array.isArray(notification.payload))
    && (typeof notification.reference_id === "string" || notification.reference_id === null)
    && (typeof notification.read_at === "string" || notification.read_at === null)
    && typeof notification.created_at === "string";
}

function eventKey(notification: LocalNotification): string | null {
  const payload = notification.payload;
  const hubId = payload?.hubId;
  const eventId = payload?.eventId;
  if (typeof hubId !== "string" || typeof eventId !== "string") return null;
  return `${notification.type}:${hubId}:${eventId}`;
}

async function readStored(userId: string): Promise<LocalNotification[]> {
  const key = storageKey(userId);
  const value = await AsyncStorage.getItem(key);
  if (!value) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    await AsyncStorage.removeItem(key);
    return [];
  }
  return Array.isArray(parsed) ? parsed.filter(isLocalNotification) : [];
}

export async function saveLocalNotification(
  userId: string,
  notification: LocalNotification,
): Promise<void> {
  const stored = await readStored(userId);
  const existing = stored.findIndex((item) => item.id === notification.id);
  if (existing >= 0) {
    stored[existing] = { ...notification, read_at: stored[existing].read_at };
  } else {
    stored.unshift(notification);
  }
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(stored.slice(0, 100)));
}

export async function getLocalNotifications(userId: string): Promise<LocalNotification[]> {
  return readStored(userId);
}

export async function removeLocalNotification(userId: string, id: string): Promise<void> {
  const stored = await readStored(userId);
  const remaining = stored.filter((notification) => notification.id !== id);
  if (remaining.length === stored.length) return;
  await AsyncStorage.setItem(storageKey(userId), JSON.stringify(remaining));
}

export async function mergeLocalNotifications(
  userId: string,
  serverNotifications: LocalNotification[],
): Promise<LocalNotification[]> {
  const localNotifications = await readStored(userId);
  const serverEventKeys = new Set(
    serverNotifications.map(eventKey).filter((key): key is string => key !== null),
  );
  const unmatchedLocal = localNotifications.filter((notification) => {
    const key = eventKey(notification);
    return key === null || !serverEventKeys.has(key);
  });
  if (unmatchedLocal.length !== localNotifications.length) {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(unmatchedLocal));
  }
  return [...serverNotifications, ...unmatchedLocal]
    .sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at));
}

export async function markLocalNotificationsRead(userId: string): Promise<void> {
  const stored = await readStored(userId);
  const readAt = new Date().toISOString();
  await AsyncStorage.setItem(
    storageKey(userId),
    JSON.stringify(stored.map((notification) => ({ ...notification, read_at: readAt }))),
  );
}