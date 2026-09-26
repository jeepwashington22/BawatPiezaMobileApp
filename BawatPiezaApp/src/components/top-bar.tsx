import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../lib/supabase';
import { useTheme } from '../theme';
import { scale } from './glass-ui';

const MOCK_NOTIFICATIONS = [
  { icon: 'warning' as const, title: 'Short circuit detected — Tile Bank A', detail: 'Power cutoff triggered automatically · tap to review', time: 'Just now', tone: 'danger' as const },
  { icon: 'battery-half' as const, title: 'Low battery — Bank B', detail: 'Charge dropped to 18%, below 20% threshold', time: '2 min ago', tone: 'warning' as const },
  { icon: 'battery-full' as const, title: 'Full charged — Bank A', detail: 'Charge is now 100%, automatic switch to Bank B', time: '2 min ago', tone: 'notice' as const },
  { icon: 'flash' as const, title: 'Grid switch complete', detail: 'Bldg 4 · 2F switched to Meralco grid', time: '18 min ago', tone: 'success' as const },
];

export type TopBarProps = {
  gutter?: number;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  showTitleChevron?: boolean;
  lightContent?: boolean;
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function TopBar({ gutter = 18, title, subtitle, showBack = false, showTitleChevron = false, lightContent = false }: TopBarProps) {
  const router = useRouter();
  const { colors: c, fonts: f } = useTheme();

  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasNotifications, setHasNotifications] = useState(true); // demo badge
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;
        setEmail(user?.email ?? null);
        const meta = user?.user_metadata as Record<string, unknown> | undefined;
        if (user?.email && !meta?.full_name && !meta?.firstname) {
          setName(user.email.split('@')[0]);
        }
        setAvatarUrl((meta?.avatar_url as string) ?? null);
        if (user) {
          const { data: row } = await supabase
            .from('user_accounts')
            .select('firstname, lastname')
            .eq('id', user.id)
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

  const firstName = name ? name.trim().split(' ')[0] : null;
  const titleText = title ?? (firstName ? `${greeting()}, ${firstName}` : greeting());
  const foreground = lightContent ? '#FFFFFF' : c.text;

  return (
    <View style={styles.container}>
      <View style={[styles.wrap, { paddingHorizontal: gutter }]}>
        {title || showBack ? (
          <View style={styles.pageHeaderRow}>
            <View style={styles.pageHeaderLeft}>
                {showBack && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Go back"
                    onPress={() => router.back()}
                    style={({ pressed }) => [styles.backButton, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Ionicons name="arrow-back" size={20} color={foreground} />
                  </Pressable>
                )}

              <View style={styles.titleBlock}>
                <View style={styles.titleLine}>
                  <Text numberOfLines={1} style={[styles.pageTitle, { color: foreground, fontFamily: f.extrabold }]}>
                    {titleText}
                  </Text>
                  {showTitleChevron && <Ionicons name="chevron-down" size={scale(18)} color={foreground} />}
                </View>
                {subtitle ? <Text style={[styles.pageSubtitle, { color: c.muted }]}>{subtitle}</Text> : null}
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.iconButton,
                  { backgroundColor: lightContent ? 'rgba(255,255,255,0.16)' : c.surface, borderColor: lightContent ? 'rgba(255,255,255,0.42)' : c.line },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setNotificationsOpen((open) => !open)}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Ionicons name="notifications-outline" size={20} color={foreground} />
                {hasNotifications && (
                  <View style={[styles.badge, { backgroundColor: c.orange, borderColor: lightContent ? '#F97316' : c.surface }]} />
                )}
              </Pressable>

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
        ) : (
          <>
            <View style={styles.topRow}>
              <Text numberOfLines={1} style={[styles.pageTitle, { color: c.text, fontFamily: f.extrabold }]}>
                {titleText}
              </Text>

              <View style={styles.spacer} />

              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.iconButton,
                    { backgroundColor: lightContent ? 'rgba(255,255,255,0.16)' : c.surface, borderColor: lightContent ? 'rgba(255,255,255,0.42)' : c.line },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => setNotificationsOpen((open) => !open)}
                  accessibilityRole="button"
                  accessibilityLabel="Notifications"
                >
                  <Ionicons name="notifications-outline" size={20} color={foreground} />
                  {hasNotifications && (
                    <View style={[styles.badge, { backgroundColor: c.orange, borderColor: lightContent ? '#F97316' : c.surface }]} />
                  )}
                </Pressable>

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

          </>
        )}
      </View>
      {notificationsOpen && (
        <View style={[styles.notificationPanel, { backgroundColor: c.surface, borderColor: c.line }]}>
          <View style={styles.notificationHeader}>
            <View>
              <Text style={[styles.notificationTitle, { color: c.text }]}>Notifications</Text>
              <Text style={[styles.notificationCount, { color: c.muted }]}>4 recent updates</Text>
            </View>
            <Pressable onPress={() => { setHasNotifications(false); setNotificationsOpen(false); }} hitSlop={8}>
              <Text style={[styles.readAll, { color: c.orange }]}>Mark all read</Text>
            </Pressable>
          </View>
          {MOCK_NOTIFICATIONS.map((notification, index) => {
            const palette = {
              danger: { background: '#FCE4E4', icon: '#D14343', text: '#C33D3D' },
              warning: { background: '#FCEDE4', icon: '#F06421', text: '#B94B20' },
              notice: { background: '#FFF3DE', icon: '#F5A313', text: '#B47711' },
              success: { background: '#E5F5E5', icon: '#16A34A', text: '#14843A' },
            }[notification.tone];
            return (
              <Pressable key={notification.title} onPress={() => setNotificationsOpen(false)} style={[styles.notificationRow, index > 0 && { borderTopColor: c.line, borderTopWidth: 1 }]}>
                <View style={[styles.notificationIcon, { backgroundColor: palette.background }]}><Ionicons name={notification.icon} size={scale(20)} color={palette.icon} /></View>
                <View style={styles.notificationCopy}>
                  <Text numberOfLines={1} style={[styles.notificationItemTitle, { color: notification.tone === 'danger' ? palette.text : c.text }]}>{notification.title}</Text>
                  <Text numberOfLines={2} style={[styles.notificationDetail, { color: c.muted }]}>{notification.detail}</Text>
                  <Text style={[styles.notificationTime, { color: c.muted }]}>{notification.time}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 20,
  },
  wrap: {
    paddingTop: scale(12),
    paddingBottom: scale(12),
  },
  notificationPanel: {
    position: 'absolute',
    top: '100%',
    right: scale(12),
    width: scale(350),
    maxWidth: '92%',
    borderRadius: scale(20),
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#0A2A4A',
    shadowOpacity: 0.2,
    shadowRadius: scale(16),
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  notificationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingTop: scale(14),
    paddingBottom: scale(11),
  },
  notificationTitle: { fontSize: scale(15), fontFamily: 'Poppins_800ExtraBold' },
  notificationCount: { fontSize: scale(8.5), marginTop: scale(2), fontFamily: 'Poppins_500Medium' },
  readAll: { fontSize: scale(8.5), fontFamily: 'Poppins_700Bold' },
  notificationRow: { flexDirection: 'row', gap: scale(11), paddingHorizontal: scale(14), paddingVertical: scale(12) },
  notificationIcon: { width: scale(48), height: scale(48), borderRadius: scale(15), alignItems: 'center', justifyContent: 'center' },
  notificationCopy: { flex: 1, paddingTop: scale(1) },
  notificationItemTitle: { fontSize: scale(10.5), lineHeight: scale(14), fontFamily: 'Poppins_800ExtraBold' },
  notificationDetail: { fontSize: scale(8.5), lineHeight: scale(12), marginTop: scale(2), fontFamily: 'Poppins_500Medium' },
  notificationTime: { fontSize: scale(8), marginTop: scale(3), fontFamily: 'Poppins_500Medium' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(11),
  },
  spacer: { flex: 1 },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  iconButton: {
    width: scale(42),
    height: scale(42),
    borderRadius: scale(13),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: scale(9),
    right: scale(9),
    width: scale(9),
    height: scale(9),
    borderRadius: scale(5),
    borderWidth: 2,
  },
  avatar: {
    width: scale(42),
    height: scale(42),
    borderRadius: scale(21),
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: scale(17),
  },
  pageHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scale(12),
  },
  pageHeaderLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
  },
  titleBlock: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: scale(4) },
  backButton: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: scale(22),
    letterSpacing: -0.6,
  },
  pageSubtitle: { fontSize: scale(11), marginTop: scale(2) },
});

