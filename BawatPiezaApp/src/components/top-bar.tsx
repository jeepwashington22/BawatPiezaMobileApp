import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';

import { supabase } from '../lib/supabase';
import { useTheme } from '../theme';

/**
 * TopBar — reusable top bar for authenticated screens.
 * Contains:
 *  - a time-based greeting + the signed-in user's name
 *  - a label for the currently active tab
 *  - a notification bell (with badge)
 *  - the user's profile avatar (top-right); tapping it opens Profile
 *
 * Theme-aware (light/dark) with Poppins typography.
 */

const TAB_TITLES: { path: string; label: string }[] = [
  { path: '/home', label: 'Home' },
  { path: '/pages/energy', label: 'Energy' },
  { path: '/pages/heatmap', label: 'Heatmap' },
  { path: '/pages/reports', label: 'Reports' },
  { path: '/pages/profile', label: 'Profile' },
  { path: '/pages/accounts', label: 'Shared Users' },
  { path: '/pages/device', label: 'Device' },
  { path: '/pages/preferences', label: 'Preferences' },
  { path: '/pages/edit-profile', label: 'My Account' },
  { path: '/pages/about', label: 'About' },
];

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function TopBar() {
  const router = useRouter();
  const pathname = usePathname();
  const { colors: c, fonts: f } = useTheme();

  const [name, setName] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasNotifications, setHasNotifications] = useState(true); // demo badge

  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const meta = userData.user?.user_metadata as Record<string, unknown> | undefined;
        if (userData.user?.email && !meta?.full_name && !meta?.firstname) {
          setName(userData.user.email.split('@')[0]);
        }
        setAvatarUrl((meta?.avatar_url as string) ?? null);
        if (userData.user) {
          const { data: row } = await supabase
            .from('user_accounts')
            .select('firstname, lastname')
            .eq('id', userData.user.id)
            .maybeSingle();
          if (row) {
            setName(
              [row.firstname, row.lastname].filter(Boolean).join(' ') || null,
            );
          }
        }
      } catch {
        // non-fatal — greeting falls back to a generic label
      }
    })();
  }, []);

  const active = TAB_TITLES.find(
    (t) => pathname === t.path || pathname.startsWith(`${t.path}/`),
  )?.label ?? 'Home';

  const firstName = name ? name.trim().split(' ')[0] : null;

  return (
    <View style={[styles.wrap, { backgroundColor: c.bg }]}>
      <View style={styles.left}>
        <Text style={[styles.eyebrow, { color: c.butter, fontFamily: f.extrabold }]}>BawatPieza</Text>
        <Text style={[styles.greeting, { color: c.text, fontFamily: f.extrabold }]}>
          {firstName ? `${greeting()}, ${firstName}` : greeting()}
        </Text>
        <Text style={[styles.subLine, { color: c.muted, fontFamily: f.regular }]}>
          <Text style={{ fontFamily: f.semibold }}>{active}</Text> · live overview
        </Text>
      </View>

      <View style={styles.right}>
        {/* Notification bell */}
        <Pressable
          style={({ pressed }) => [styles.iconButton, { backgroundColor: c.surface, borderColor: c.line }, pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/pages/reports')}
          accessibilityRole="button"
          accessibilityLabel="Notifications"
        >
          <Ionicons name="notifications-outline" size={20} color={c.text} />
          {hasNotifications && <View style={[styles.badge, { backgroundColor: c.orange }]} />}
        </Pressable>

        {/* Profile avatar */}
        <Pressable
          style={({ pressed }) => [pressed && { opacity: 0.7 }]}
          onPress={() => router.push('/pages/profile')}
          accessibilityRole="button"
          accessibilityLabel="Profile"
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={[styles.avatar, { borderColor: c.accent }]} />
          ) : (
            <View style={[styles.avatar, { backgroundColor: c.accentSoft, borderColor: c.accent }]}>
              <Text style={[styles.avatarText, { color: c.onAccentSoft, fontFamily: f.bold }]}>
                {(firstName ?? 'U').charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 12,
  },
  left: { flex: 1, paddingRight: 12 },
  eyebrow: {
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    marginBottom: 1,
  },
  greeting: {
    fontSize: 20,
    letterSpacing: -0.5,
  },
  subLine: {
    fontSize: 11,
    marginTop: 1,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 17,
  },
});