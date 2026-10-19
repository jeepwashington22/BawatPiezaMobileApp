import { useEffect, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from './app-text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { useTheme } from '../theme';
import { scale } from './glass-ui';

type NotificationTone = 'danger' | 'warning' | 'notice' | 'success';

/** One row of the bell feed — real (API) or mock (demo). */
type FeedItem = {
  id?: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  time: string;
  tone: NotificationTone;
  /** Raw API type (e.g. `share_invite`) — drives inline action buttons. */
  kind?: string;
  /** `notifications.reference_id` — for invites this is the `share_invites` id. */
  refId?: string | null;
  read?: boolean;
};

/** Maps a notifications.type from the API onto the panel's icon/tone palette. */
function toneForType(type: string): { icon: keyof typeof Ionicons.glyphMap; tone: NotificationTone } {
  switch (type) {
    case 'share_invite':
      return { icon: 'person-add-outline', tone: 'notice' };
    case 'share_accepted':
      return { icon: 'people-outline', tone: 'success' };
    case 'share_declined':
      return { icon: 'close-circle-outline', tone: 'warning' };
    default:
      return { icon: 'notifications-outline', tone: 'notice' };
  }
}

/** "3 min ago" / "Yesterday" style label for a notification timestamp. */
function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

type ApiNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  reference_id: string | null;
  read_at: string | null;
  created_at: string;
};

type NotificationSnapshot = {
  feed: FeedItem[];
  unread: number;
  fetchedAt: number;
};

const NOTIFICATION_CACHE_TTL_MS = 30_000;
const notificationSnapshots = new Map<string, NotificationSnapshot>();
const notificationAttempts = new Map<string, number>();

export type TopBarProps = {
  gutter?: number;
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  showTitleChevron?: boolean;
  lightContent?: boolean;
  /** Translucent buttons + mode-aware ink, for sitting on top of <HeroGlow />. */
  glass?: boolean;
};

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export function TopBar({ gutter = 18, title, subtitle, showBack = false, showTitleChevron = false, lightContent = false, glass = false }: TopBarProps) {
  const router = useRouter();
  const { colors: c, fonts: f, mode } = useTheme();

  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Real notifications only — empty until the feed loads, never mocked.
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // Invite id currently being accepted/declined from inside the bell panel.
  const [respondingId, setRespondingId] = useState<string | null>(null);

  /** Badge number: the live unread count. Hidden while loading or at zero. */
  const badgeCount = unread;
  const hasNotifications = badgeCount > 0;

  /** Opens the full notifications page from the dropdown's View all action. */
  const openNotificationsPage = (): void => {
    setNotificationsOpen(false);
    router.push('/pages/notifications');
  };

  /** Opens the panel with a fresh feed, or closes it. */
  const toggleNotifications = () => {
    if (!notificationsOpen) void loadNotifications();
    setNotificationsOpen((open) => !open);
  };

  /** Loads the signed-in user's in-app notifications; silent on failure. */
  const loadNotifications = async (): Promise<void> => {
    setFeedLoading(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) return;
      const userId = authData.session?.user?.id;
      if (!userId) return;
      const attemptedAt = notificationAttempts.get(userId);
      const cached = notificationSnapshots.get(userId);
      if (cached && Date.now() - cached.fetchedAt < NOTIFICATION_CACHE_TTL_MS) {
        setFeed(cached.feed);
        setUnread(cached.unread);
        return;
      }
      if (attemptedAt && Date.now() - attemptedAt < NOTIFICATION_CACHE_TTL_MS) return;
      notificationAttempts.set(userId, Date.now());
      const res = await apiFetch('/notifications', { timeoutMs: 3_000,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const json = (await res.json().catch(() => null)) as {
        notifications?: ApiNotification[];
        unread?: number;
      } | null;
      if (!json?.notifications) return;
      const items: FeedItem[] = json.notifications.map((n) => {
        const { icon, tone } = toneForType(n.type);
        return {
          id: n.id,
          icon,
          tone,
          title: n.title,
          detail: n.body ?? '',
          time: timeAgo(n.created_at),
          kind: n.type,
          refId: n.reference_id,
          read: n.read_at !== null,
        };
      });
      setFeed(items);
      const unreadCount = json.unread ?? 0;
      setUnread(unreadCount);
      notificationSnapshots.set(userId, {
        feed: items,
        unread: unreadCount,
        fetchedAt: Date.now(),
      });
    } catch {
      // Offline or API down — the panel shows an empty/error state instead
      // of fake notifications.
    } finally {
      setFeedLoading(false);
    }
  };

  /** Accept / decline a shared-user invite without leaving the bell panel. */
  const respondToInvite = async (item: FeedItem, action: 'accept' | 'decline'): Promise<void> => {
    const inviteId = item.refId;
    if (!inviteId || respondingId) return;
    setRespondingId(inviteId);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) return;
      const res = await apiFetch(`/accounts/invites/${inviteId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      // Drop the invite notification + refresh the feed so the badge decrements.
      setFeed((prev) => (prev ? prev.filter((n) => n.id !== item.id) : prev));
      setUnread((u) => Math.max(0, u - (item.read ? 0 : 1)));
      await loadNotifications();
    } catch {
      // Best-effort — the row stays so the user can retry.
    } finally {
      setRespondingId(null);
    }
  };

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
  const dark = mode === 'dark';
  const foreground = glass ? (dark ? '#FFFFFF' : '#2B1205') : lightContent ? '#FFFFFF' : c.text;
  const btnBg = glass
    ? dark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)'
    : lightContent ? 'rgba(255,255,255,0.16)' : c.surface;
  const btnBorder = glass
    ? dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)'
    : lightContent ? 'rgba(255,255,255,0.42)' : c.line;
  const avatarBorder = glass ? (dark ? 'rgba(255,255,255,0.55)' : '#FFFFFF') : c.accent;

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
                    onPress={() => {
                      if (router.canGoBack()) {
                        router.back();
                      } else {
                        router.replace('/home');
                      }
                    }}
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
                  { backgroundColor: btnBg, borderColor: btnBorder },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={toggleNotifications}
                accessibilityRole="button"
                accessibilityLabel="Open notifications dropdown"
              >
                <Ionicons name="notifications-outline" size={20} color={foreground} />
                {hasNotifications && (
                  <View style={[styles.countBadge, { backgroundColor: c.orange }]}>
                    <Text style={styles.countBadgeText}>
                      {badgeCount > 99 ? '99+' : String(badgeCount)}
                    </Text>
                  </View>
                )}
              </Pressable>

              <Pressable
                style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                onPress={() => router.push('/pages/profile')}
                accessibilityRole="button"
                accessibilityLabel="Profile"
              >
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={[styles.avatar, { borderColor: avatarBorder }]} />
                ) : (
                  <View style={[styles.avatar, { backgroundColor: c.accentSoft, borderColor: avatarBorder }]}>
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
              <Text numberOfLines={1} style={[styles.pageTitle, { color: foreground, fontFamily: f.extrabold }]}>
                {titleText}
              </Text>

              <View style={styles.spacer} />

              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [
                    styles.iconButton,
                    { backgroundColor: btnBg, borderColor: btnBorder },
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={toggleNotifications}
                  accessibilityRole="button"
                  accessibilityLabel="Open notifications dropdown"
                >
                  <Ionicons name="notifications-outline" size={20} color={foreground} />
                  {hasNotifications && (
                    <View style={[styles.countBadge, { backgroundColor: c.orange }]}>
                      <Text style={styles.countBadgeText}>
                        {badgeCount > 99 ? '99+' : String(badgeCount)}
                      </Text>
                    </View>
                  )}
                </Pressable>

                <Pressable
                  style={({ pressed }) => [pressed && { opacity: 0.7 }]}
                  onPress={() => router.push('/pages/profile')}
                  accessibilityRole="button"
                  accessibilityLabel="Profile"
                >
                  {avatarUrl ? (
                    <Image source={{ uri: avatarUrl }} style={[styles.avatar, { borderColor: avatarBorder }]} />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: c.accentSoft, borderColor: avatarBorder }]}>
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
              <Text style={[styles.notificationCount, { color: c.muted }]}>
                {feedLoading
                  ? 'Loading notifications...'
                  : `${feed.length} notification${feed.length === 1 ? '' : 's'}${unread ? ` · ${unread} unread` : ''}`}
              </Text>
            </View>
            <Pressable
              onPress={async () => {
                // Persist "read" server-side when the real feed is active.
                if (unread > 0) {
                  try {
                    const { data: authData } = await supabase.auth.getSession();
                    const token = authData.session?.access_token;
                    if (token) {
                      await apiFetch('/notifications/read', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                      });
                    }
                  } catch {
                    // Best-effort — the badge still clears locally.
                  }
                  setUnread(0);
                }
                setNotificationsOpen(false);
              }}
              hitSlop={8}
            >
              <Text style={[styles.readAll, { color: c.orange }]}>Mark all read</Text>
            </Pressable>
          </View>
          {feedLoading ? (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyText, { color: c.muted }]}>Loading notifications...</Text>
            </View>
          ) : feed.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={28} color={c.muted} />
              <Text style={[styles.emptyText, { color: c.muted }]}>You are all caught up — no notifications yet.</Text>
            </View>
          ) : (
          feed.map(
            (notification, index) => {
            const palette = {
              danger: { background: '#FCE4E4', icon: '#D14343', text: '#C33D3D' },
              warning: { background: '#FCEDE4', icon: '#F06421', text: '#B94B20' },
              notice: { background: '#FFF3DE', icon: '#F5A313', text: '#B47711' },
              success: { background: '#E5F5E5', icon: '#16A34A', text: '#14843A' },
            }[notification.tone];
            // Shared-user invites get inline Accept / Decline — no detour needed.
            const isInvite = notification.kind === 'share_invite' && !!notification.refId;
            const busy = isInvite && respondingId === notification.refId;
            return (
              <View
                key={notification.id ?? notification.title}
                style={[styles.notificationRow, index > 0 && { borderTopColor: c.line, borderTopWidth: 1 }]}
              >
                <View style={[styles.notificationIcon, { backgroundColor: palette.background }]}><Ionicons name={notification.icon} size={scale(20)} color={palette.icon} /></View>
                <View style={styles.notificationCopy}>
                  <Text numberOfLines={1} style={[styles.notificationItemTitle, { color: notification.tone === 'danger' ? palette.text : c.text }]}>{notification.title}</Text>
                  <Text numberOfLines={2} style={[styles.notificationDetail, { color: c.muted }]}>{notification.detail}</Text>
                  <Text style={[styles.notificationTime, { color: c.muted }]}>{notification.time}</Text>
                  {isInvite ? (
                    <View style={styles.inviteActions}>
                      <Pressable
                        disabled={respondingId !== null}
                        onPress={() => void respondToInvite(notification, 'accept')}
                        style={({ pressed }) => [
                          styles.inviteBtn,
                          styles.inviteAccept,
                          pressed && { opacity: 0.75 },
                          respondingId !== null && { opacity: 0.6 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Accept invite: ${notification.title}`}
                      >
                        <Text style={styles.inviteAcceptText}>
                          {busy ? 'Accepting...' : 'Accept'}
                        </Text>
                      </Pressable>
                      <Pressable
                        disabled={respondingId !== null}
                        onPress={() => void respondToInvite(notification, 'decline')}
                        style={({ pressed }) => [
                          styles.inviteBtn,
                          styles.inviteDecline,
                          { borderColor: c.line },
                          pressed && { opacity: 0.75 },
                          respondingId !== null && { opacity: 0.6 },
                        ]}
                        accessibilityRole="button"
                        accessibilityLabel={`Decline invite: ${notification.title}`}
                      >
                        <Text style={[styles.inviteDeclineText, { color: c.muted }]}>
                          {busy ? 'Working...' : 'Decline'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        // Non-invite rows still deep-link where they make sense.
                        setNotificationsOpen(false);
                        if (notification.title.includes('invited')) {
                          router.push('/pages/accounts');
                        }
                      }}
                      hitSlop={4}
                    >
                      <Text style={[styles.viewLink, { color: c.orange }]}>View</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            );
          })
          )}
          <Pressable
            style={({ pressed }) => [styles.viewAllButton, { borderTopColor: c.line }, pressed && { opacity: 0.7 }]}
            onPress={openNotificationsPage}
            accessibilityRole="button"
            accessibilityLabel="View all notifications"
          >
            <Text style={[styles.viewAllText, { color: c.orange }]}>View all notifications</Text>
            <Ionicons name="arrow-forward" size={scale(15)} color={c.orange} />
          </Pressable>
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
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    borderTopWidth: 1,
    paddingVertical: scale(12),
  },
  viewAllText: { fontSize: scale(10.5), fontFamily: 'Poppins_800ExtraBold' },
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
  countBadge: {
    position: 'absolute',
    top: scale(-4),
    right: scale(-6),
    minWidth: scale(18),
    height: scale(18),
    borderRadius: scale(9),
    paddingHorizontal: scale(4),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  countBadgeText: {
    color: '#FFFFFF',
    fontSize: scale(10),
    fontFamily: 'Poppins_800ExtraBold',
    lineHeight: scale(13),
  },
  inviteActions: {
    flexDirection: 'row',
    gap: scale(8),
    marginTop: scale(8),
  },
  inviteBtn: {
    flex: 1,
    borderRadius: scale(10),
    paddingVertical: scale(8),
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteAccept: { backgroundColor: '#16A34A' },
  inviteAcceptText: { color: '#FFFFFF', fontSize: scale(10.5), fontFamily: 'Poppins_800ExtraBold' },
  inviteDecline: { backgroundColor: 'transparent', borderWidth: 1 },
  inviteDeclineText: { fontSize: scale(10.5), fontFamily: 'Poppins_700Bold' },
  viewLink: { fontSize: scale(9), marginTop: scale(5), fontFamily: 'Poppins_700Bold' },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: scale(28),
    paddingHorizontal: scale(20),
    gap: scale(8),
  },
  emptyText: { fontSize: scale(11), textAlign: 'center', fontFamily: 'Poppins_500Medium' },
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