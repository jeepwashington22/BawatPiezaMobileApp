import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText as Text } from './app-text';
import { useTheme } from '../theme';
import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';

const DEVICE_STORAGE_KEY = 'bawatpieza_hub_id';
const SHARED_ACCESS_KEY = 'bawatpieza_shared_access';

export function useDeviceConnection() {
  const pathname = usePathname();
  const [hasDevice, setHasDevice] = useState<boolean | null>(null);
  const [accessRefresh, setAccessRefresh] = useState(0);

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
      try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          await Promise.all([
            AsyncStorage.removeItem(DEVICE_STORAGE_KEY),
            AsyncStorage.removeItem(SHARED_ACCESS_KEY),
          ]);
          if (!cancelled) setHasDevice(false);
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
        if (!cancelled) setHasDevice(accessGranted);
    } catch (error) {
      console.warn('[device-status] failed to refresh device access', error);
      void AsyncStorage.getItem(DEVICE_STORAGE_KEY).then((cachedHubId) => {
        if (!cancelled) setHasDevice(Boolean(cachedHubId));
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

  if (hasDevice !== false) return null;

  return (
    <View
      style={[styles.notice, { borderColor: c.line, backgroundColor: c.surface }]}
      accessibilityRole="text"
      accessibilityLabel="No device connected"
    >
      <Ionicons name="alert-circle-outline" size={16} color="#92400E" />
      <Text style={[styles.noticeText, { color: c.text, fontFamily: f.semibold }]}>
        No device connected
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderWidth: 1,
    borderRadius: 8,
    marginVertical: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  noticeText: {
    fontSize: 11,
  },
});
