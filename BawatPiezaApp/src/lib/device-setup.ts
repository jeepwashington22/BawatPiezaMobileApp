export function deviceSetupRequiredKey(userId: string): string {
  return `bawatpieza_device_setup_required:${userId}`;
}

export function installedTileCountKey(hubId: string): string {
  return `bawatpieza_installed_tile_count:${hubId}`;
}
