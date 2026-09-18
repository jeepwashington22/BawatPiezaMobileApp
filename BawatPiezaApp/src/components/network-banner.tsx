import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  NETWORK_ISSUE_INFO,
  subscribeToConnectivity,
  type NetworkIssue,
} from '../lib/network';

/**
 * Global connectivity banner, mounted once at the app root.
 *
 * - Offline  → persistent amber "No internet connection" bar.
 * - Restored → green "Back online" confirmation that fades after 3s.
 * - Optional issue prop shows a one-shot banner for unstable / rate-limit /
 *   timeout problems reported by a screen.
 */
export function NetworkBanner({ issue, onDismiss }: {
  /** One-shot issue pushed by a screen (e.g. rate limited, timeout). */
  issue?: NetworkIssue | null;
  /** Called when the one-shot banner is dismissed or auto-hides. */
  onDismiss?: () => void;
}) {
  const [offline, setOffline] = useState(false);
  const [backOnline, setBackOnline] = useState(false);
  const [flash, setFlash] = useState<NetworkIssue | null>(null);
  const slide = useRef(new Animated.Value(0)).current;
  const wasOffline = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Track device connectivity globally.
  useEffect(() => {
    return subscribeToConnectivity((online) => {
      setOffline(!online);
      if (!online) {
        wasOffline.current = true;
        setBackOnline(false);
      } else if (wasOffline.current) {
        // Only celebrate a *restored* connection, never the initial state.
        wasOffline.current = false;
        setBackOnline(true);
        setFlash(null);
      }
    });
  }, []);

  // Show one-shot issues pushed from screens.
  useEffect(() => {
    if (!issue) return;
    setFlash(issue);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setFlash(null);
      onDismiss?.();
    }, 4000);
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [issue, onDismiss]);

  // Auto-hide the "back online" toast.
  useEffect(() => {
    if (!backOnline) return;
    const t = setTimeout(() => setBackOnline(false), 3000);
    return () => clearTimeout(t);
  }, [backOnline]);

  const visible = offline || backOnline || flash !== null;
  const content = offline
    ? NETWORK_ISSUE_INFO.offline
    : flash
      ? NETWORK_ISSUE_INFO[flash]
      : NETWORK_ISSUE_INFO.unstable; // placeholder, only used when back online below

  useEffect(() => {
    Animated.timing(slide, {
      toValue: visible ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [visible, slide]);

  if (!visible) return null;

  const isBackOnline = backOnline && !offline && !flash;
  const palette = isBackOnline
    ? { bg: '#DCFCE7', border: '#86EFAC', text: '#166534' }
    : { bg: '#FEF3C7', border: '#FCD34D', text: '#92400E' };

  const icon = isBackOnline ? 'checkmark-circle' : content.icon;
  const title = isBackOnline ? 'Back online' : content.title;
  const message = isBackOnline ? 'Your connection has been restored.' : content.message;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-8, 0] }) }] }]}
    >
      <View style={[styles.bar, { backgroundColor: palette.bg, borderColor: palette.border }]}>
        <Ionicons name={icon} size={18} color={palette.text} style={styles.icon} />
        <View style={styles.textCol}>
          <Text style={[styles.title, { color: palette.text }]}>{title}</Text>
          <Text style={[styles.message, { color: palette.text }]}>{message}</Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  icon: { marginRight: 10 },
  textCol: { flex: 1 },
  title: { fontSize: 13, fontWeight: '800' },
  message: { fontSize: 12, marginTop: 1, lineHeight: 16 },
});
