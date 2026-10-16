import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppText as Text } from '../../components/app-text';
import { Ionicons } from '@expo/vector-icons';
import { ScreenShell } from '../../components/screen-shell';
import { ContentCard } from '../../components/content-card';
import { useAuth } from '../../hooks/use-auth';
import { supabase } from '../../lib/supabase';
import { apiFetch } from '../../lib/api';
import { describeApiFailure } from '../../lib/network';
import { fonts, useTheme, type ThemeColors } from '../../theme';

/**
 * Notifications page — the full in-app feed behind the bell.
 *
 * Data comes from `GET /notifications` (newest first, with an `unread`
 * count). Invite rows (`type === 'share_invite'`, `reference_id` = the
 * `share_invites` id) carry inline Accept / Decline buttons that hit
 * `POST /accounts/invites/:id/accept|decline` — the same handshake the
 * Shared Users screen uses.
 *
 * Where the invited-user notification lives: `POST /accounts/invite`
 * (backend `routes/accounts.ts`) inserts a `notifications` row addressed to
 * the INVITEE with `type='share_invite'` + `reference_id=<invite id>`. The
 * inviter instead gets `share_accepted` / `share_declined` once the invitee
 * responds. So the person who was invited is the one who sees the
 * `share_invite` row — here and in the bell dropdown.
 */
type Tone = 'danger' | 'warning' | 'notice' | 'success';

type Item = {
  id: string;
  kind: string;
  title: string;
  detail: string;
  time: string;
  tone: Tone;
  icon: keyof typeof Ionicons.glyphMap;
  refId: string | null;
  read: boolean;
};

type ApiNotification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  reference_id: string | null;
  read_at: string | null;
  created_at: string;
};

type NotificationCache = {
  notifications: ApiNotification[];
  unread: number;
  cachedAt: string;
};

const NOTIFICATION_CACHE_PREFIX = 'bawatpieza:notifications:';

function mapNotifications(notifications: ApiNotification[]): Item[] {
  return notifications.map((n) => {
    const mapped = toneForType(n.type);
    return {
      id: n.id, kind: n.type, title: n.title, detail: n.body ?? '',
      time: timeAgo(n.created_at), tone: mapped.tone, icon: mapped.icon,
      refId: n.reference_id, read: n.read_at !== null,
    };
  });
}

function toneForType(type: string): { icon: keyof typeof Ionicons.glyphMap; tone: Tone } {
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

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (s < 60) return 'Just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  return `${d} days ago`;
}

const PALETTE: Record<Tone, { background: string; icon: string }> = {
  danger: { background: '#FCE4E4', icon: '#D14343' },
  warning: { background: '#FCEDE4', icon: '#F06421' },
  notice: { background: '#FFF3DE', icon: '#F5A313' },
  success: { background: '#E5F5E5', icon: '#16A34A' },
};

export default function NotificationsScreen() {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);

  const { session } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);

  /** Bearer token for the Express API, or null when signed out. */
  const getToken = useCallback(async () => {
    if (session?.access_token) return session.access_token;
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, [session]);

  /* Initial loading is handled by the database-first `load` callback below. */
  /*
    useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const token = session?.access_token ?? (await supabase.auth.getSession()).data.session?.access_token;
        if (!token) throw new Error('Not signed in');
        const res = await apiFetch('/notifications', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => null)) as {
          notifications?: {
            id: string; type: string; title: string; body: string | null;
            reference_id: string | null; read_at: string | null; created_at: string;
          }[];
          unread?: number; message?: string;
        } | null;
        if (!res.ok) throw new Error(json?.message || `Backend responded ${res.status}`);
        if (cancelled) return;
        setItems(
          (json?.notifications ?? []).map((n) => {
            const mapped = toneForType(n.type);
            return {
              id: n.id, kind: n.type, title: n.title, detail: n.body ?? '',
              time: timeAgo(n.created_at), tone: mapped.tone, icon: mapped.icon,
              refId: n.reference_id, read: n.read_at !== null,
            };
          }),
        );
        setUnread(json?.unread ?? 0);
      } catch (e) {
        if (!cancelled) setError(describeApiFailure(e, 'Failed to load notifications'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token]);
  */

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const cacheKey = session?.user?.id ? `${NOTIFICATION_CACHE_PREFIX}${session.user.id}` : null;
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await apiFetch('/notifications', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => null)) as {
        notifications?: ApiNotification[];
        unread?: number; message?: string;
      } | null;
      if (!res.ok) throw new Error(json?.message || `Backend responded ${res.status}`);
      const notifications = json?.notifications ?? [];
      setItems(mapNotifications(notifications));
      setUnread(json?.unread ?? notifications.filter((notification) => notification.read_at === null).length);
      if (cacheKey) {
        try {
          await AsyncStorage.setItem(cacheKey, JSON.stringify({
            notifications,
            unread: json?.unread ?? 0,
            cachedAt: new Date().toISOString(),
          } satisfies NotificationCache));
        } catch (cacheError) {
          console.warn('[notifications] Could not update local cache:', cacheError);
        }
      }
    } catch (e) {
      if (cacheKey) {
        try {
          const cachedValue = await AsyncStorage.getItem(cacheKey);
          if (cachedValue) {
            const cached = JSON.parse(cachedValue) as NotificationCache;
            if (Array.isArray(cached.notifications)) {
              setItems(mapNotifications(cached.notifications));
              setUnread(cached.unread);
              setError('Showing cached notifications. We could not check for new updates.');
              return;
            }
          }
        } catch {
          // A corrupt or unavailable cache must not hide the original error.
        }
      }
      setError(describeApiFailure(e, 'Failed to load notifications'));
    } finally {
      setLoading(false);
    }
  }, [getToken, session?.user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const invites = useMemo(() => items.filter((i) => i.kind === 'share_invite'), [items]);
  const others = useMemo(() => items.filter((i) => i.kind !== 'share_invite'), [items]);

  async function respond(item: Item, action: 'accept' | 'decline') {
    if (!item.refId || respondingId) return;
    setRespondingId(item.refId);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await apiFetch(`/accounts/invites/${item.refId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => null)) as { message?: string } | null;
      if (!res.ok) throw new Error(json?.message || `Backend responded ${res.status}`);
      await load();
    } catch (e) {
      setError(describeApiFailure(e, 'Could not respond to the invite'));
    } finally {
      setRespondingId(null);
    }
  }

  async function markAllRead() {
    if (unread === 0 || markingRead) return;
    setMarkingRead(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      await apiFetch('/notifications/read', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await load();
    } catch (e) {
      setError(describeApiFailure(e, 'Could not mark notifications as read'));
    } finally {
      setMarkingRead(false);
    }
  }

  if (loading) {
    return (
      <ScreenShell title="Notifications" showBack>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={c.accent} />
          <Text style={[styles.hint, { marginTop: 10 }]}>Loading notifications</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Notifications" showBack>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <ContentCard
        style={styles.notificationsCard}
        eyebrow="Inbox"
        title={
          unread > 0
            ? `${unread} unread of ${items.length}`
            : items.length > 0
              ? `${items.length} — all caught up`
              : 'No notifications yet'
        }
        action={unread > 0 ? (
          <Pressable
            onPress={() => void markAllRead()}
            disabled={markingRead}
            style={({ pressed }) => [styles.readAllBtn, pressed && { opacity: 0.7 }]}
            accessibilityRole="button"
            accessibilityLabel="Mark all notifications as read"
          >
            <Text style={styles.readAllText}>{markingRead ? 'Marking...' : 'Mark all read'}</Text>
          </Pressable>
        ) : undefined}
      >
        {items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="notifications-off-outline" size={28} color={c.muted} />
            <Text style={[styles.emptyText, { color: c.muted }]}>
              You are all caught up — invites and updates will appear here.
            </Text>
          </View>
        ) : (
          <>
            {invites.length > 0 && (
              <Text style={[styles.sectionLabel, { color: c.muted }]}>
                Shared-user invites ({invites.length})
              </Text>
            )}
            {invites.map((item) => (
              <NotifRow
                key={item.id}
                item={item}
                styles={styles}
                busy={respondingId === item.refId}
                disabled={respondingId !== null}
                onAccept={() => void respond(item, 'accept')}
                onDecline={() => void respond(item, 'decline')}
              />
            ))}
            {others.length > 0 && invites.length > 0 && (
              <Text style={[styles.sectionLabel, { color: c.muted }]}>Other updates</Text>
            )}
            {others.map((item) => (
              <NotifRow key={item.id} item={item} styles={styles} />
            ))}
          </>
        )}
      </ContentCard>
    </ScreenShell>
  );
}

function NotifRow({
  item, styles, busy = false, disabled = false, onAccept, onDecline,
}: {
  item: Item;
  styles: ReturnType<typeof makeStyles>;
  busy?: boolean;
  disabled?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
}) {
  const palette = PALETTE[item.tone];
  const isInvite = item.kind === 'share_invite' && !!item.refId;
  return (
    <View style={styles.row}>
      <View style={[styles.icon, { backgroundColor: palette.background }]}>
        <Ionicons name={item.icon} size={20} color={palette.icon} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleLine}>
          <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
          {!item.read && <View style={styles.unreadDot} />}
        </View>
        {item.detail ? (
          <Text numberOfLines={3} style={styles.detail}>{item.detail}</Text>
        ) : null}
        <Text style={styles.time}>{item.time}</Text>
        {isInvite && onAccept && onDecline ? (
          <View style={styles.inviteActions}>
            <Pressable
              disabled={disabled}
              onPress={onAccept}
              style={({ pressed }) => [
                styles.inviteBtn, styles.inviteAccept,
                pressed && { opacity: 0.75 }, disabled && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Accept invite: ${item.title}`}
            >
              <Text style={styles.inviteAcceptText}>{busy ? 'Accepting...' : 'Accept'}</Text>
            </Pressable>
            <Pressable
              disabled={disabled}
              onPress={onDecline}
              style={({ pressed }) => [
                styles.inviteBtn, styles.inviteDecline,
                pressed && { opacity: 0.75 }, disabled && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Decline invite: ${item.title}`}
            >
              <Text style={styles.inviteDeclineText}>{busy ? 'Working...' : 'Decline'}</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function makeStyles(c: ThemeColors) {
  return StyleSheet.create({
    loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60 },
    notificationsCard: { padding: 12, borderRadius: 14, marginBottom: 10 },
    hint: { color: c.muted, fontSize: 12, fontFamily: fonts.medium },
    errorText: { color: '#C33D3D', fontSize: 12, fontFamily: fonts.bold, marginBottom: 8 },
    readAllBtn: {
      alignSelf: 'flex-end', borderRadius: 999, backgroundColor: c.accentSoft,
      paddingHorizontal: 11, paddingVertical: 6, marginBottom: 2,
    },
    readAllText: { color: c.accent, fontSize: 10, fontFamily: fonts.bold },
    emptyWrap: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 6 },
    emptyText: { fontSize: 11, textAlign: 'center', fontFamily: fonts.medium, lineHeight: 16 },
    sectionLabel: {
      fontSize: 9, letterSpacing: 1, textTransform: 'uppercase',
      fontFamily: fonts.extrabold, marginTop: 7, marginBottom: 2,
    },
    row: { flexDirection: 'row', gap: 9, paddingVertical: 8 },
    icon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    copy: { flex: 1 },
    titleLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    title: { flex: 1, color: c.text, fontSize: 12, lineHeight: 16, fontFamily: fonts.extrabold },
    unreadDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: c.orange },
    detail: { color: c.muted, fontSize: 11, lineHeight: 15, marginTop: 2, fontFamily: fonts.medium },
    time: { color: c.muted, fontSize: 9, marginTop: 3, fontFamily: fonts.medium, opacity: 0.85 },
    inviteActions: { flexDirection: 'row', gap: 6, marginTop: 7 },
    inviteBtn: {
      flex: 1, borderRadius: 8, paddingVertical: 7,
      alignItems: 'center', justifyContent: 'center',
    },
    inviteAccept: { backgroundColor: '#16A34A' },
    inviteAcceptText: { color: '#FFFFFF', fontSize: 10, fontFamily: fonts.extrabold },
    inviteDecline: { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.line },
    inviteDeclineText: { color: c.muted, fontSize: 10, fontFamily: fonts.bold },
  });
}
