import AsyncStorage from "@react-native-async-storage/async-storage";
import { DeviceEventEmitter } from "react-native";

export type SystemAllocationRoomStatus = {
  channel: number;
  roomName: string;
  startAt: string;
  endAt: string;
};

export type SystemAllocationStatus = {
  hubId: string;
  updatedAt: string;
  rooms: SystemAllocationRoomStatus[];
};

export const SYSTEM_ALLOCATION_STATUS_CHANGED =
  "bawatpieza:system-allocation-status-changed";
export const SYSTEM_ALLOCATION_PLAN_CALCULATED =
  "bawatpieza:system-allocation-plan-calculated";
export const SYSTEM_ALLOCATION_FORCE_STOPPED =
  "bawatpieza:system-allocation-force-stopped";
export const SYSTEM_ALLOCATION_FORCE_STOP_REQUESTED =
  "bawatpieza:system-allocation-force-stop-requested";

const STORAGE_KEY = "bawatpieza_system_allocation_status";
const REQUIRES_NEW_PLAN_KEY = "bawatpieza_system_allocation_requires_new_plan";

function isRoomStatus(value: unknown): value is SystemAllocationRoomStatus {
  if (typeof value !== "object" || value === null) return false;
  const room = value as Partial<SystemAllocationRoomStatus>;
  return (
    Number.isInteger(room.channel) &&
    typeof room.roomName === "string" &&
    typeof room.startAt === "string" &&
    Number.isFinite(Date.parse(room.startAt)) &&
    typeof room.endAt === "string" &&
    Number.isFinite(Date.parse(room.endAt)) &&
    Date.parse(room.endAt) > Date.parse(room.startAt)
  );
}

function parseStatus(value: string): SystemAllocationStatus {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Saved system allocation status is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Saved system allocation status has an invalid shape.");
  }
  const status = parsed as Partial<SystemAllocationStatus>;
  if (
    typeof status.hubId !== "string" ||
    !status.hubId ||
    typeof status.updatedAt !== "string" ||
    !Number.isFinite(Date.parse(status.updatedAt)) ||
    !Array.isArray(status.rooms) ||
    status.rooms.length === 0 ||
    !status.rooms.every(isRoomStatus)
  ) {
    throw new Error("Saved system allocation status has invalid room data.");
  }
  return status as SystemAllocationStatus;
}

export async function saveSystemAllocationStatus(
  hubId: string,
  rooms: SystemAllocationRoomStatus[],
): Promise<void> {
  if (!hubId.trim() || rooms.length === 0 || !rooms.every(isRoomStatus)) {
    throw new Error("Cannot save an invalid system allocation status.");
  }
  const status: SystemAllocationStatus = {
    hubId,
    updatedAt: new Date().toISOString(),
    rooms,
  };
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(status));
  DeviceEventEmitter.emit(SYSTEM_ALLOCATION_STATUS_CHANGED, status);
}

export async function loadSystemAllocationStatus(
  hubId: string,
): Promise<SystemAllocationStatus | null> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored === null) return null;
  const status = parseStatus(stored);
  if (status.hubId !== hubId) return null;
  return status;
}

export async function clearSystemAllocationStatus(
  hubId: string,
): Promise<void> {
  const stored = await AsyncStorage.getItem(STORAGE_KEY);
  if (stored === null) return;
  const status = parseStatus(stored);
  if (status.hubId !== hubId) return;
  await AsyncStorage.removeItem(STORAGE_KEY);
  DeviceEventEmitter.emit(SYSTEM_ALLOCATION_STATUS_CHANGED, null);
}

export async function markSystemAllocationRequiresNewPlan(
  hubId: string,
): Promise<void> {
  if (!hubId.trim()) throw new Error("Cannot mark allocation setup without a hub ID.");
  await AsyncStorage.setItem(`${REQUIRES_NEW_PLAN_KEY}:${hubId}`, "1");
  DeviceEventEmitter.emit(SYSTEM_ALLOCATION_STATUS_CHANGED, null);
}

export async function systemAllocationRequiresNewPlan(
  hubId: string,
): Promise<boolean> {
  if (!hubId.trim()) return false;
  return (
    (await AsyncStorage.getItem(`${REQUIRES_NEW_PLAN_KEY}:${hubId}`)) === "1"
  );
}

export async function clearSystemAllocationRequiresNewPlan(
  hubId: string,
): Promise<void> {
  if (!hubId.trim()) return;
  await AsyncStorage.removeItem(`${REQUIRES_NEW_PLAN_KEY}:${hubId}`);
  DeviceEventEmitter.emit(SYSTEM_ALLOCATION_PLAN_CALCULATED, hubId);
}
