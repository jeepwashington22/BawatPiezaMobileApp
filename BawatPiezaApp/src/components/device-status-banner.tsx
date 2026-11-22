import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, Pressable, StyleSheet, View } from 'react-native';

import { AppText as Text } from './app-text';
import { useTheme } from '../theme';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';

const DEVICE_STORAGE_KEY = 'bawatpieza_hub_id';
const SHARED_ACCESS_KEY = 'bawatpieza_shared_access';
export const DEVICE_ACCESS_CHANGED_EVENT = 'bawatpieza:device-access-changed';
const SHARED_ACCESS_RETRY_INTERVAL_MS = 1_000;
const SHARED_ACCESS_RETRY_TIMEOUT_MS = 30_000;

let lastKnownDeviceAccess: boolean | null = null;
let sharedDeviceAccessPending = false;

function publishDeviceAccessChanged(hasDevice: boolean | null) {
  lastKnownDeviceAccess = hasDevice;
  if (hasDevice !== null) sharedDeviceAccessPending = false;
  DeviceEventEmitter.emit(DEVICE_ACCESS_CHANGED_EVENT, hasDevice);
}

export function notifyDeviceAccessChanged(hasDevice: boolean | null) {
  if (hasDevice === null) sharedDeviceAccessPending = true;
  publishDeviceAccessChanged(hasDevice);
}

export async function refreshSharedDeviceAccess(accessToken: string): Promise<string> {
  sharedDeviceAccessPending = true;
  publishDeviceAccessChanged(null);
  return refreshSharedDeviceAccessAttempt(accessToken, Date.now());
}

function requestSharedDeviceAccess(accessToken: string) {
  return apiFetch('/accounts/device-access', {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeoutMs: 8_000,
  });
}

async function refreshSharedDeviceAccessAttempt(
  accessToken: string,
  startedAt: number,
): Promise<string> {
  let response: Response;
  try {
    response = await requestSharedDeviceAccess(accessToken);
  } catch (error) {
    if (Date.now() - startedAt < SHARED_ACCESS_RETRY_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, SHARED_ACCESS_RETRY_INTERVAL_MS));
      return refreshSharedDeviceAccessAttempt(accessToken, startedAt);
    }
    sharedDeviceAccessPending = false;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(`Could not load shared device access (${response.status}).`);
    if (Date.now() - startedAt < SHARED_ACCESS_RETRY_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, SHARED_ACCESS_RETRY_INTERVAL_MS));
      return refreshSharedDeviceAccessAttempt(accessToken, startedAt);
    }
    sharedDeviceAccessPending = false;
    throw error;
  }
  const access = (await response.json()) as {
    access_granted?: boolean;
    hub_id?: string | null;
  };
  if (!access.access_granted || !access.hub_id) {
    if (Date.now() - startedAt < SHARED_ACCESS_RETRY_TIMEOUT_MS) {
      await new Promise((resolve) => setTimeout(resolve, SHARED_ACCESS_RETRY_INTERVAL_MS));
      return refreshSharedDeviceAccessAttempt(accessToken, startedAt);
    }
    sharedDeviceAccessPending = false;
    publishDeviceAccessChanged(false);
    throw new Error('The invitation was accepted, but shared device access is still syncing.');
  }

  await Promise.all([
    AsyncStorage.setItem(DEVICE_STORAGE_KEY, access.hub_id),
    AsyncStorage.setItem(SHARED_ACCESS_KEY, '1'),
  ]);
  publishDeviceAccessChanged(true);
  return access.hub_id;
}

export function useDeviceConnection() {
  const pathname = usePathname();
  const [hasDevice, setHasDevice] = useState<boolean | null>(lastKnownDeviceAccess);
  const [accessRefresh, setAccessRefresh] = useState(0);
  const accessVersionRef = useRef(0);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      DEVICE_ACCESS_CHANGED_EVENT,
      (nextHasDevice: boolean | null) => {
        accessVersionRef.current += 1;
        setHasDevice(nextHasDevice);
      },
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setAccessRefresh((value) => value + 1);
    }, 15_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let checking = false;
    const checkAccess = async () => {
      if (checking) return;
      checking = true;
      const accessVersion = accessVersionRef.current;
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          if (cancelled || accessVersion !== accessVersionRef.current) return;
          await Promise.all([
            AsyncStorage.removeItem(DEVICE_STORAGE_KEY),
            AsyncStorage.removeItem(SHARED_ACCESS_KEY),
          ]);
          if (!cancelled && accessVersion === accessVersionRef.current) {
            publishDeviceAccessChanged(false);
          }
          return;
        }

        const response = await apiFetch('/accounts/device-access', {
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 8_000,
        });
        if (!response.ok) throw new Error(`Device access check failed (${response.status})`);
        const json = (await response.json()) as {
          hub_id?: string | null;
          access_granted?: boolean;
          can_unlink?: boolean;
        };
        const accessGranted = Boolean(json.access_granted && json.hub_id);
        if (cancelled || accessVersion !== accessVersionRef.current) return;
        if (!accessGranted && sharedDeviceAccessPending) return;
        if (accessGranted && json.hub_id) {
          await AsyncStorage.setItem(DEVICE_STORAGE_KEY, json.hub_id);
          if (json.can_unlink === false) {
            await AsyncStorage.setItem(SHARED_ACCESS_KEY, '1');
          } else {
            await AsyncStorage.removeItem(SHARED_ACCESS_KEY);
          }
        } else {
          await Promise.all([
            AsyncStorage.removeItem(DEVICE_STORAGE_KEY),
            AsyncStorage.removeItem(SHARED_ACCESS_KEY),
          ]);
        }
        if (!cancelled && accessVersion === accessVersionRef.current) {
          publishDeviceAccessChanged(accessGranted);
        }
      } catch (error) {
        console.warn('[device-status] failed to refresh device access', error);
        void AsyncStorage.getItem(DEVICE_STORAGE_KEY).then((cachedHubId) => {
          if (
            !cancelled &&
            accessVersion === accessVersionRef.current &&
            !sharedDeviceAccessPending
          ) {
            publishDeviceAccessChanged(Boolean(cachedHubId));
          }
        });
      } finally {
        checking = false;
      }
    };
    void checkAccess();
    const interval = setInterval(() => void checkAccess(), 15_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [pathname, accessRefresh]);

  return hasDevice;
}

export function NoDeviceNotice({ hasDevice }: { hasDevice: boolean | null }) {
  const { colors: c, fonts: f } = useTheme();
  const router = useRouter();

  if (hasDevice !== false) return null;

  return (
    <View style={styles.emptyState}>
      <View style={[styles.iconWrap, { backgroundColor: c.surfaceMuted }]}>
        <Ionicons name="hardware-chip-outline" size={34} color={c.orange} />
      </View>
      <Text style={[styles.title, { color: c.text, fontFamily: f.semibold }]}>
        No device connected
      </Text>
      <Text style={[styles.hint, { color: c.muted }]}>
        Connect a device to view data and manage your IoT controls.
      </Text>
      <Pressable
        onPress={() => router.push('/pages/device' as Href)}
        style={[styles.connectButton, { backgroundColor: c.orange }]}
        accessibilityRole="button"
        accessibilityLabel="Connect a device"
      >
        <Text style={[styles.connectButtonText, { fontFamily: f.semibold }]}>
          Connect a device
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 76,
  },
  iconWrap: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    textAlign: 'center',
  },
  hint: {
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 300,
  },
  connectButton: {
    borderRadius: 12,
    marginTop: 20,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  connectButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
  },
});
