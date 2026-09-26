import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../lib/supabase';
import { useTheme } from '../theme';
import { scale } from './glass-ui';

export type TopBarProps = {
  gutter?: number;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  showTitleChevron?: boolean;
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function TopBar({ gutter = 18, title, subtitle, showBack = false, showTitleChevron = false }: TopBarProps) {
  const router = useRouter();
  const { colors: c, fonts: f } = useTheme();

  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [hasNotifications, setHasNotifications] = useState(true); // demo badge

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

  return (
    <>
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
                    <Ionicons name="arrow-back" size={20} color={c.text} />
                  </Pressable>
                )}

              <View style={styles.titleBlock}>
                <View style={styles.titleLine}>
                  <Text numberOfLines={1} style={[styles.pageTitle, { color: c.text, fontFamily: f.extrabold }]}>
                    {titleText}
                  </Text>
                  {showTitleChevron && <Ionicons name="chevron-down" size={scale(18)} color={c.text} />}
                </View>
                {subtitle ? <Text style={[styles.pageSubtitle, { color: c.muted }]}>{subtitle}</Text> : null}
              </View>
            </View>

            <View style={styles.actions}>
              <Pressable
                style={({ pressed }) => [
                  styles.iconButton,
                  { backgroundColor: c.surface, borderColor: c.line },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => router.push('/pages/reports')}
                accessibilityRole="button"
                accessibilityLabel="Notifications"
              >
                <Ionicons name="notifications-outline" size={20} color={c.text} />
                {hasNotifications && (
                  <View style={[styles.badge, { backgroundColor: c.orange, borderColor: c.surface }]} />
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
                    { backgroundColor: c.surface, borderColor: c.line },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => router.push('/pages/reports')}
                  accessibilityRole="button"
                  accessibilityLabel="Notifications"
                >
                  <Ionicons name="notifications-outline" size={20} color={c.text} />
                  {hasNotifications && (
                    <View style={[styles.badge, { backgroundColor: c.orange, borderColor: c.surface }]} />
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

    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: scale(12),
    paddingBottom: scale(12),
  },
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

