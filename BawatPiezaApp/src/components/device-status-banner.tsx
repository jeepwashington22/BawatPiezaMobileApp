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

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      AsyncStorage.getItem(DEVICE_STORAGE_KEY),
      AsyncStorage.getItem(SHARED_ACCESS_KEY),
    ])
      .then(async ([hubId, sharedAccess]) => {
        if (hubId) {
          if (!cancelled) setHasDevice(true);
          return;
        }
        if (sharedAccess === '1') {
          if (!cancelled) setHasDevice(true);
          return;
        }

        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (!token) {
          if (!cancelled) setHasDevice(false);
          return;
        }

        const response = await apiFetch('/accounts/device-access', {
          headers: { Authorization: `Bearer ${token}` },
          timeoutMs: 8_000,
        });
        const json = (await response.json().catch(() => null)) as {
          hub_id?: string | null;
          access_granted?: boolean;
        } | null;
        const sharedHubId = json?.hub_id;
        if (sharedHubId) await AsyncStorage.setItem(DEVICE_STORAGE_KEY, sharedHubId);
        if (!cancelled) setHasDevice(Boolean(json?.access_granted || sharedHubId));
      })
      .catch(() => {
        if (!cancelled) setHasDevice(false);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

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
