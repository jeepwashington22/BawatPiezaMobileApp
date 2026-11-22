import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, DeviceEventEmitter, Image, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { AppText as Text } from './app-text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

import { supabase } from '../lib/supabase';
import { apiFetch } from '../lib/api';
import { getLocalNotifications, mergeLocalNotifications, markLocalNotificationsRead } from '../lib/local-notifications';
import {
  notifyDeviceAccessChanged,
  refreshSharedDeviceAccess,
} from './device-status-banner';
import {
  InviteResponseModal,
  type InviteResponseAction,
  type InviteResponseStage,
} from './invite-response-modal';
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
    case 'battery_full':
      return { icon: 'battery-full-outline', tone: 'success' };
    case 'battery_low':
      return { icon: 'battery-dead-outline', tone: 'warning' };
    case 'power_mode_changed':
      return { icon: 'flash-outline', tone: 'notice' };
    case 'smoke_detected':
      return { icon: 'warning-outline', tone: 'danger' };
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
  payload?: Record<string, unknown> | null;
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
const PROFILE_CACHE_TTL_MS = 300_000;
const notificationSnapshots = new Map<string, NotificationSnapshot>();
const notificationAttempts = new Map<string, number>();
let profileSnapshot: {
  userId: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  fetchedAt: number;
} | null = null;

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
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();

  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // Real notifications only — empty until the feed loads, never mocked.
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationAnchor, setNotificationAnchor] = useState({
    top: scale(80),
    buttonCenterX: windowWidth / 2,
  });
  const notificationButtonRef = useRef<View>(null);
  const notificationLoadVersion = useRef(0);
  // Invite id currently being accepted/declined from inside the bell panel.
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [inviteDialog, setInviteDialog] = useState<{
    item: FeedItem;
    action: InviteResponseAction;
    stage: InviteResponseStage;
    message?: string;
  } | null>(null);

  /** Badge number: the live unread count. Hidden while loading or at zero. */
  const badgeCount = unread;
  const hasNotifications = badgeCount > 0;

  /** Opens the full notifications page from the dropdown's View all action. */
  const openNotificationsPage = (): void => {
    setNotificationsOpen(false);
    router.push('/pages/notifications');
  };

  /** Marks notifications read as soon as the bell panel is opened. */
  async function markNotificationsReadOnOpen(): Promise<void> {
    try {
      const { data: authData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const token = authData.session?.access_token;
      const userId = authData.session?.user?.id;
      if (!token || !userId) return;

      let markedRead = false;
      try {
        const response = await apiFetch('/notifications/read', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!response.ok) {
          throw new Error(`Mark-read request failed with ${response.status}`);
        }
        markedRead = true;
      } catch (apiError) {
        console.warn('Notification read endpoint failed; trying Supabase directly.', apiError);
      }

      if (!markedRead) {
        const { error } = await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('user_id', userId)
          .is('read_at', null);
        if (error) throw error;
      }

      await markLocalNotificationsRead(userId);
      const readFeed = feed.map((notification) => ({ ...notification, read: true }));
      setFeed(readFeed);
      setUnread(0);
      notificationSnapshots.set(userId, {
        feed: readFeed,
        unread: 0,
        fetchedAt: Date.now(),
      });
    } catch (error) {
      console.error('Could not mark notifications as read when opening the bell.', error);
      Alert.alert('Could not mark notifications read', 'Please check your connection and try again.');
    }
  }

  /** Opens the panel with a fresh feed, or closes it. */
  const toggleNotifications = () => {
    if (!notificationsOpen) {
      notificationLoadVersion.current += 1;
      notificationButtonRef.current?.measureInWindow((x, y, width, height) => {
        setNotificationAnchor({
          top: y + height + scale(6),
          buttonCenterX: x + width / 2,
        });
      });
      setNotificationsOpen(true);
      void markNotificationsReadOnOpen();
      return;
    }
    setNotificationsOpen(false);
  };

  /** Loads the signed-in user's in-app notifications; silent on failure. */
  const loadNotifications = useCallback(async (): Promise<void> => {
    const loadVersion = ++notificationLoadVersion.current;
    try {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const userId = authData.session?.user?.id;
      if (!userId) return;
      notificationAttempts.set(userId, Date.now());
      const authoritativeResponse = await apiFetch('/notifications', {
        timeoutMs: 8_000,
        silent: true,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!authoritativeResponse.ok) {
        throw new Error(`Notifications request failed with ${authoritativeResponse.status}`);
      }
      const authoritativeJson = (await authoritativeResponse.json().catch(() => null)) as {
        notifications?: ApiNotification[];
        unread?: number;
      } | null;
      if (authoritativeJson?.notifications) {
        const invitesResponse = await apiFetch('/accounts/invites', {
          timeoutMs: 8_000,
          silent: true,
          headers: { Authorization: `Bearer ${token}` },
        });
        const invitesJson = invitesResponse.ok
          ? (await invitesResponse.json().catch(() => null)) as {
              received?: { id: string }[];
            } | null
          : null;
        const pendingInviteIds = new Set((invitesJson?.received ?? []).map((invite) => invite.id));
        const activeNotifications = invitesResponse.ok
          ? authoritativeJson.notifications.filter(
              (notification) =>
                notification.type !== 'share_invite' ||
                (notification.reference_id !== null && pendingInviteIds.has(notification.reference_id)),
            )
          : authoritativeJson.notifications;
        const mergedNotifications = await mergeLocalNotifications(userId, activeNotifications);
        const authoritativeItems: FeedItem[] = mergedNotifications.map((n) => {
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
        const authoritativeUnread =
          mergedNotifications.filter((notification) => notification.read_at === null).length;
        if (loadVersion !== notificationLoadVersion.current) return;
        setFeed(authoritativeItems);
        setUnread(authoritativeUnread);
        notificationSnapshots.set(userId, {
          feed: authoritativeItems,
          unread: authoritativeUnread,
          fetchedAt: Date.now(),
        });
        return;
      }

      const { data: notificationRows, error: notificationError } = await supabase
        .from('notifications')
        .select('id, type, title, body, payload, reference_id, read_at, created_at')
        .eq('user_id', userId)
        .neq('type', 'share_invite')
        .order('created_at', { ascending: false })
        .limit(30);
      if (!notificationError) {
        const notifications = await mergeLocalNotifications(
          userId,
          (notificationRows ?? []) as ApiNotification[],
        );
        const items: FeedItem[] = notifications.map((n) => {
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
        const unreadCount = notifications.filter((notification) => notification.read_at === null).length;
        if (loadVersion !== notificationLoadVersion.current) return;
        setFeed(items);
        setUnread(unreadCount);
        notificationSnapshots.set(userId, {
          feed: items,
          unread: unreadCount,
          fetchedAt: Date.now(),
        });
        return;
      }
      const res = await apiFetch('/notifications', { timeoutMs: 1_000, silent: true,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Notifications request failed with ${res.status}`);
      const json = (await res.json().catch(() => null)) as {
        notifications?: ApiNotification[];
        unread?: number;
      } | null;
      if (!json?.notifications) throw new Error('Notifications response did not contain a feed');
      const mergedNotifications = await mergeLocalNotifications(userId, json.notifications);
      const items: FeedItem[] = mergedNotifications.map((n) => {
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
      const unreadCount = mergedNotifications.filter((notification) => notification.read_at === null).length;
      if (loadVersion !== notificationLoadVersion.current) return;
      setFeed(items);
      setUnread(unreadCount);
      notificationSnapshots.set(userId, {
        feed: items,
        unread: unreadCount,
        fetchedAt: Date.now(),
      });
    } catch (error) {
      // Offline or API down — fall back to real notification rows saved locally.
      try {
        const { data: authData } = await supabase.auth.getSession();
        const userId = authData.session?.user?.id;
        if (userId) {
          const localNotifications = await getLocalNotifications(userId);
          if (loadVersion !== notificationLoadVersion.current) return;
          const items: FeedItem[] = localNotifications.map((n) => {
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
          const unreadCount = localNotifications.filter((notification) => notification.read_at === null).length;
          setUnread(unreadCount);
          notificationSnapshots.set(userId, {
            feed: items,
            unread: unreadCount,
            fetchedAt: Date.now(),
          });
        }
      } catch (localError) {
        console.warn('[notifications] Could not load saved local notifications:', localError, error);
      }
    } finally {
      if (loadVersion === notificationLoadVersion.current) setFeedLoading(false);
    }
  }, []);

  useEffect(() => {
    const subscription = DeviceEventEmitter.addListener(
      'bawatpieza:refresh-notifications',
      () => void loadNotifications(),
    );
    return () => subscription.remove();
  }, [loadNotifications]);

  useEffect(() => {
    const cached = profileSnapshot;
    if (cached) {
      setName(cached.name);
      setEmail(cached.email);
      setAvatarUrl(cached.avatarUrl);
    }
    const cachedNotifications =
      cached && notificationSnapshots.get(cached.userId);
    if (
      cachedNotifications &&
      Date.now() - cachedNotifications.fetchedAt < NOTIFICATION_CACHE_TTL_MS
    ) {
      const nonInviteFeed = cachedNotifications.feed.filter((item) => item.kind !== 'share_invite');
      setFeed(nonInviteFeed);
      setUnread(nonInviteFeed.filter((item) => !item.read).length);
      setFeedLoading(false);
    }
    void loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    const interval = setInterval(() => void loadNotifications(), 15_000);
    return () => clearInterval(interval);
  }, [loadNotifications]);

  /** Accept / decline a shared-user invite without leaving the bell panel. */
  const respondToInvite = async (item: FeedItem, action: 'accept' | 'decline'): Promise<void> => {
    const inviteId = item.refId;
    if (!inviteId || respondingId) return;
    setRespondingId(inviteId);
    setInviteDialog((current) =>
      current
        ? {
            ...current,
            stage: 'processing',
            message: action === 'accept' ? 'Accepting invitation…' : 'Saving your response…',
          }
        : current,
    );
    try {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) throw new Error('Not signed in');
      const res = await apiFetch(`/accounts/invites/${inviteId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const response = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(response?.message ?? `The server responded ${res.status}.`);
      }
      // Remove the answered invite immediately; device discovery must not
      // delay or prevent the notification from disappearing.
      setFeed((prev) => (prev ? prev.filter((n) => n.id !== item.id) : prev));
      setUnread((u) => Math.max(0, u - (item.read ? 0 : 1)));
      if (action === 'accept') {
        notifyDeviceAccessChanged(null);
        setInviteDialog((current) =>
          current
            ? { ...current, stage: 'processing', message: 'Connecting to the shared device…' }
            : current,
        );
        void refreshSharedDeviceAccess(token).catch((accessError) => {
          console.warn('[notifications] Shared device is still loading:', accessError);
        });
      }
      await supabase
        .from('notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', item.id);
      // Refresh the feed after the server-side notification cleanup.
      const { data: refreshedAuth } = await supabase.auth.getSession();
      if (refreshedAuth.session?.user?.id) {
        notificationSnapshots.delete(refreshedAuth.session.user.id);
        notificationAttempts.delete(refreshedAuth.session.user.id);
      }
      void loadNotifications();
      setInviteDialog((current) =>
        current
          ? {
              ...current,
              stage: 'success',
              message:
                action === 'accept'
                  ? 'Invitation accepted. Continue to your device while it connects.'
                  : 'Your response has been saved.',
            }
          : current,
      );
    } catch (error) {
      setInviteDialog((current) =>
        current
          ? {
              ...current,
              stage: 'error',
              message: error instanceof Error ? error.message : 'Please check your connection and try again.',
            }
          : current,
      );
    } finally {
      setRespondingId(null);
    }
  };

  const confirmInviteResponse = (item: FeedItem, action: 'accept' | 'decline'): void => {
    setInviteDialog({ item, action, stage: 'confirm' });
  };

  useEffect(() => {
    (async () => {
      try {
        if (
          profileSnapshot &&
          Date.now() - profileSnapshot.fetchedAt < PROFILE_CACHE_TTL_MS
        ) {
          setName(profileSnapshot.name);
          setEmail(profileSnapshot.email);
          setAvatarUrl(profileSnapshot.avatarUrl);
          return;
        }
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;

        let resolvedName: string | null = null;
        const resolvedEmail = user?.email ?? null;
        const meta = user?.user_metadata as Record<string, unknown> | undefined;
        const resolvedAvatarUrl = (meta?.avatar_url as string) ?? null;

        if (user?.email && !meta?.full_name && !meta?.firstname) {
          resolvedName = user.email.split('@')[0];
        }

        if (user) {
          const { data: row } = await supabase
            .from('user_accounts')
            .select('firstname, lastname')
            .eq('id', user.id)
            .maybeSingle();
          if (row) {
            resolvedName =
              [row.firstname, row.lastname].filter(Boolean).join(' ') || null;
          }
        }

        setEmail(user?.email ?? null);
        setName(resolvedName);
        setAvatarUrl(resolvedAvatarUrl);
        if (user) {
          profileSnapshot = {
            userId: user.id,
            name: resolvedName,
            email: resolvedEmail,
            avatarUrl: resolvedAvatarUrl,
            fetchedAt: Date.now(),
          };
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
                ref={notificationButtonRef}
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
                  ref={notificationButtonRef}
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
      <Modal
        visible={notificationsOpen}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => setNotificationsOpen(false)}
      >
        <View style={styles.notificationModalRoot}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setNotificationsOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close notifications"
          />
          <View
            style={[
              styles.notificationDropdownAnchor,
              {
                top: notificationAnchor.top,
                maxHeight: Math.max(0, windowHeight - notificationAnchor.top - scale(12)),
              },
            ]}
          >
            <View
              pointerEvents="none"
              style={[
                styles.notificationPointer,
                {
                  left: Math.max(
                    scale(7),
                    Math.min(
                      Math.min(scale(350), windowWidth - scale(24)) - scale(21),
                      notificationAnchor.buttonCenterX -
                        (windowWidth - Math.min(scale(350), windowWidth - scale(24))) / 2 -
                        scale(7),
                    ),
                  ),
                  backgroundColor: c.surface,
                  borderColor: c.line,
                },
              ]}
            />
            <View
              style={[
                styles.notificationPanel,
                {
                  maxHeight: Math.max(
                    0,
                    windowHeight - notificationAnchor.top - scale(24),
                  ),
                  backgroundColor: c.surface,
                  borderColor: c.line,
                },
              ]}
            >
          <View style={styles.notificationHeader}>
            <View>
              <Text style={[styles.notificationTitle, { color: c.text }]}>Notifications</Text>
              <Text style={[styles.notificationCount, { color: c.muted }]}>
                {feedLoading && feed.length === 0
                  ? 'Loading notifications...'
                  : `${feed.length} notification${feed.length === 1 ? '' : 's'}${unread ? ` · ${unread} unread` : ''}`}
              </Text>
            </View>
          </View>
          {feedLoading && feed.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyText, { color: c.muted }]}>Loading notifications...</Text>
            </View>
          ) : feed.length === 0 ? (
            <View style={styles.emptyWrap}>
              <Ionicons name="notifications-off-outline" size={28} color={c.muted} />
              <Text style={[styles.emptyText, { color: c.muted }]}>You are all caught up — no notifications yet.</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.notificationFeed}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              keyboardShouldPersistTaps="handled"
            >
              {feed.map((notification, index) => {
                const palette = {
                  danger: { background: '#FCE4E4', icon: '#D14343', text: '#C33D3D' },
                  warning: { background: '#FCEDE4', icon: '#F06421', text: '#B94B20' },
                  notice: { background: '#FFF3DE', icon: '#F5A313', text: '#B47711' },
                  success: { background: '#E5F5E5', icon: '#16A34A', text: '#14843A' },
                }[notification.tone];
                const isInvite = notification.kind === 'share_invite' && !!notification.refId;
                const busy = isInvite && respondingId === notification.refId;
                return (
                  <View
                    key={notification.id ?? notification.title}
                    style={[
                      styles.notificationRow,
                      { borderLeftColor: palette.icon },
                      index > 0 && { borderTopColor: c.line, borderTopWidth: 1 },
                    ]}
                  >
                    <View style={[styles.notificationIcon, { backgroundColor: palette.background }]}>
                      <Ionicons name={notification.icon} size={scale(20)} color={palette.icon} />
                    </View>
                    <View style={styles.notificationCopy}>
                      <Text numberOfLines={2} style={[styles.notificationItemTitle, { color: notification.tone === 'danger' ? palette.text : c.text }]}>{notification.title}</Text>
                      <Text numberOfLines={3} style={[styles.notificationDetail, { color: c.muted }]}>{notification.detail}</Text>
                      <Text style={[styles.notificationTime, { color: c.muted }]}>{notification.time}</Text>
                      {isInvite ? (
                        <View style={styles.inviteActions}>
                          <Pressable
                            disabled={respondingId !== null}
                            onPress={() => confirmInviteResponse(notification, 'accept')}
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
                            onPress={() => confirmInviteResponse(notification, 'decline')}
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
                            <Text style={[styles.inviteDeclineText, { color: c.danger }]}>
                              {busy ? 'Working...' : 'Decline'}
                            </Text>
                          </Pressable>
                        </View>
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
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
          </View>
        </View>
      </Modal>
      {inviteDialog && (
        <InviteResponseModal
          visible
          inviterName={inviteDialog.item.title}
          action={inviteDialog.action}
          stage={inviteDialog.stage}
          message={inviteDialog.message}
          onCancel={() => {
            if (inviteDialog.stage !== 'processing') setInviteDialog(null);
          }}
          onConfirm={() => void respondToInvite(inviteDialog.item, inviteDialog.action)}
          onContinue={() => {
            const shouldOpenHome = inviteDialog.action === 'accept' && inviteDialog.stage === 'success';
            setInviteDialog(null);
            if (shouldOpenHome) {
              setNotificationsOpen(false);
              router.replace('/home');
            }
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    zIndex: 20,
  },
  notificationModalRoot: {
    flex: 1,
  },
  notificationDropdownAnchor: {
    position: 'absolute',
    left: scale(12),
    right: scale(12),
    alignItems: 'center',
    flexShrink: 1,
  },
  notificationPointer: {
    position: 'absolute',
    top: 0,
    width: scale(14),
    height: scale(14),
    borderWidth: 1,
    transform: [{ rotate: '45deg' }],
    zIndex: 1,
  },
  wrap: {
    paddingTop: scale(12),
    paddingBottom: scale(12),
  },
  notificationPanel: {
    width: '100%',
    maxWidth: scale(350),
    flexShrink: 1,
    marginTop: scale(7),
    borderRadius: scale(20),
    borderWidth: 1,
    overflow: 'hidden',
    zIndex: 2,
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
  notificationFeed: {
    maxHeight: scale(420),
    flexGrow: 0,
    flexShrink: 1,
  },
  notificationTitle: { fontSize: scale(15), fontFamily: 'Poppins_800ExtraBold' },
  notificationCount: { fontSize: scale(11), marginTop: scale(3), fontFamily: 'Poppins_500Medium' },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    borderTopWidth: 1,
    paddingVertical: scale(12),
  },
  viewAllText: { fontSize: scale(12), fontFamily: 'Poppins_800ExtraBold' },
  notificationRow: { flexDirection: 'row', gap: scale(11), paddingHorizontal: scale(12), paddingVertical: scale(12), borderLeftWidth: scale(3) },
  notificationIcon: { width: scale(48), height: scale(48), borderRadius: scale(15), alignItems: 'center', justifyContent: 'center' },
  notificationCopy: { flex: 1, paddingTop: scale(1) },
  notificationItemTitle: { fontSize: scale(13), lineHeight: scale(18), fontFamily: 'Poppins_800ExtraBold' },
  notificationDetail: { fontSize: scale(12), lineHeight: scale(17), marginTop: scale(3), fontFamily: 'Poppins_500Medium' },
  notificationTime: { fontSize: scale(11), marginTop: scale(4), fontFamily: 'Poppins_500Medium' },
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
  inviteAcceptText: { color: '#FFFFFF', fontSize: scale(12), fontFamily: 'Poppins_800ExtraBold' },
  inviteDecline: { backgroundColor: 'transparent', borderWidth: 1 },
  inviteDeclineText: { fontSize: scale(12), fontFamily: 'Poppins_700Bold' },
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