import AsyncStorage from "@react-native-async-storage/async-storage";

export function deviceSetupRequiredKey(userId: string): string {
  return `bawatpieza_device_setup_required:${userId}`;
}

export async function isDeviceSetupPending(
  userId: string | null | undefined,
): Promise<boolean> {
  if (!userId) return false;
  return (
    (await AsyncStorage.getItem(deviceSetupRequiredKey(userId))) === "1"
  );
}

export function installedTileCountKey(hubId: string): string {
  return `bawatpieza_installed_tile_count:${hubId}`;
}
