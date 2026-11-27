import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { AppText as Text } from '../../components/app-text';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { ContentCard } from '../../components/content-card';
import {
  notifyDeviceAccessChanged,
  refreshSharedDeviceAccess,
} from '../../components/device-status-banner';
import {
  InviteResponseModal,
  type InviteResponseAction,
  type InviteResponseStage,
} from '../../components/invite-response-modal';
import { supabase } from '../../lib/supabase';
import { apiFetch, describeApiBase } from '../../lib/api';
import { describeApiFailure } from '../../lib/network';

/**
 * Shared Users (account tab). Three related jobs:
 *  1. List THIS user's accepted shared users only — the screen calls
 *     `GET /accounts?shared=1`, so accounts that never completed the invite
 *     handshake are never fetched from the backend.
 *  2. "Invite user by email" is INLINE (no modal): the search bar at the top
 *     realtime-filters existing active accounts (`GET /accounts/invitable`)
 *     as you type -> tapping Invite on a row calls POST /accounts/invite,
 *     which creates a pending share invite and notifies the invitee in-app.
 *  3. Pending invites render in their own cards with Accept / Decline
 *     (received) and a "Pending" status list (sent); accepting makes this
 *     user a shared user of the inviter — the person then appears in the list.
 *
 * Layout (first glance): search bar at the very top, then invite-search
 * results when typing, then sent pending invites, then received invites,
 * then the shared-user list, then Owner / Shared role tabs.
 */

type Account = {
  id: string;
  email?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  name?: string | null;
  role?: string | null;
  status?: string | null;
  /** When the invite was accepted — shown as "Shared since …". */
  shared_since?: string | null;
};

type Invite = {
  id: string;
  status: string;
  created_at: string;
  counterpart: { id: string; name: string; email: string | null };
};

/** Realtime match: does this user's name or email contain `q` (case-insensitive)? */
function matchesQuery(q: string, name: string, email?: string | null): boolean {
  if (!q) return true;
  return name.toLowerCase().includes(q) || (email ?? '').toLowerCase().includes(q);
}

/** Display name for a candidate/account row. */
function displayNameOf(u: Account): string {
  return u.name || [u.firstname, u.lastname].filter(Boolean).join(' ') || u.email || 'Unnamed';
}

/** Role tabs under the list. Backend roles are `admin` | `staff`: Owner tab
 * shows admin-role users, Shared tab shows everyone else (staff / unknown). */
type RoleTab = 'owner' | 'shared';

function isOwnerRole(role?: string | null): boolean {
  return (role ?? '').trim().toLowerCase() === 'admin';
}

function roleLabel(role?: string | null): string {
  return isOwnerRole(role) ? 'Owner' : 'Shared';
}

export default function AccountsScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  const PRUSSIAN = c.accent;
  const MUTED = c.muted;
  const LINE = c.line;
  const WHITE = c.onAccent;
  const OK = c.ok;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<Invite[]>([]);
  const [sentInvites, setSentInvites] = useState<Invite[]>([]);
  const [canInvite, setCanInvite] = useState(false);

  // User-search results are loaded once and filtered locally as the user types.
  // Only device owners can invite; searching is available to every account.
  const [invitable, setInvitable] = useState<Account[]>([]);
  const [invitableLoading, setInvitableLoading] = useState(false);
  const [invitableError, setInvitableError] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  // Accept / decline busy state (invite id currently in flight).
  const [respondingId, setRespondingId] = useState<string | null>(null);
  const [inviteDialog, setInviteDialog] = useState<{
    invite: Invite;
    action: InviteResponseAction;
    stage: InviteResponseStage;
    message?: string;
  } | null>(null);
  const loadInProgress = useRef(false);

  // Single realtime search — filters the shared list AND user-search results
  // below it, client-side on every keystroke.
  const [query, setQuery] = useState('');
  // Role tab under the list: 'owner' (admin role) or 'shared' (staff role).
  const [roleTab, setRoleTab] = useState<RoleTab>('shared');

  /** Bearer token for the Express API, or null when signed out. */
  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const load = useCallback(async (background = false) => {
    if (loadInProgress.current) return;
    loadInProgress.current = true;
    if (!background) setLoading(true);
    setError(null);
    if (!background) setInvitableLoading(true);
    setInvitableError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');

      // Accepted shared users (?shared=1) + invite context (received + sent)
      // + invitable candidates, all in parallel so the inline invite search
      // works without opening any popup.
      const auth = { headers: { Authorization: `Bearer ${token}` } };
      const deviceAccessPromise = apiFetch('/accounts/device-access', auth)
        .then(async (response) => {
          if (!response.ok) {
            throw new Error(`Device access request failed (${response.status}).`);
          }
          const accessJson = (await response.json().catch(() => null)) as {
            can_invite?: boolean;
          } | null;
          setCanInvite(accessJson?.can_invite === true);
        })
        .catch((deviceAccessError) => {
          console.warn('[accounts] Could not load device access:', deviceAccessError);
          setCanInvite(false);
        });
      const [accountsResult, invitesResult, invitableResult] = await Promise.allSettled([
        apiFetch('/accounts?shared=1', auth),
        apiFetch('/accounts/invites', auth),
        apiFetch('/accounts/invitable', auth),
      ]);
      if (accountsResult.status === 'fulfilled') {
        const res = accountsResult.value;
        const json = (await res.json().catch(() => null)) as (
          | { accounts?: Account[]; message?: string }
          | Account[]
          | null
        );
        if (res.ok) {
          setAccounts(Array.isArray(json) ? json : (json?.accounts ?? []));
        } else {
          const message = !Array.isArray(json) && json?.message;
          setError(message || `Backend responded ${res.status}`);
        }
      } else {
        setError(describeApiFailure(accountsResult.reason, 'Failed to load shared accounts'));
      }

      if (invitesResult.status === 'fulfilled' && invitesResult.value.ok) {
        const invitesRes = invitesResult.value;
        const invJson = (await invitesRes.json().catch(() => null)) as {
          received?: Invite[];
          sent?: Invite[];
        } | null;
        setReceivedInvites(invJson?.received ?? []);
        setSentInvites(invJson?.sent ?? []);
      } else {
        console.warn(
          '[accounts] Could not refresh invitations:',
          invitesResult.status === 'rejected'
            ? invitesResult.reason
            : `Backend responded ${invitesResult.value.status}`,
        );
      }
      // A failed invites call is non-fatal: the member list still renders.

      if (invitableResult.status === 'fulfilled') {
        const invitableRes = invitableResult.value;
        const invJson = (await invitableRes.json().catch(() => null)) as {
          accounts?: Account[];
          message?: string;
        } | null;
        if (!invitableRes.ok) {
          setInvitable([]);
          setInvitableError(invJson?.message || `User search failed (${invitableRes.status}).`);
        } else {
          setInvitable(invJson?.accounts ?? []);
        }
      } else {
        setInvitable([]);
        setInvitableError(describeApiFailure(invitableResult.reason, 'User search failed.'));
      }

      await deviceAccessPromise;
    } catch (e) {
      setError(describeApiFailure(e, 'Failed to load accounts'));
    } finally {
      if (!background) {
        setLoading(false);
        setInvitableLoading(false);
      }
      loadInProgress.current = false;
    }
  }, [getToken]);

  useEffect(() => {
    // Deferred past the mount commit: `load` flips `loading` and the rule
    // react-hooks/set-state-in-effect forbids doing that synchronously
    // inside the effect body. A 0 ms timer keeps first paint identical
    // (loading starts as `true`) while satisfying the linter.
    const timer = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    const interval = setInterval(() => void load(true), 15_000);
    return () => clearInterval(interval);
  }, [load]);

  /** Invite one account inline — triggered by the Invite button on its row. */
  const inviteUser = useCallback(
    async (invitee: Account) => {
      if (!canInvite) {
        Alert.alert('Device required', 'Only users who own a paired device can invite shared users.');
        return;
      }
      setInvitingId(invitee.id);
      try {
        const token = await getToken();
        if (!token) throw new Error('Not signed in');
        const res = await apiFetch('/accounts/invite', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ inviteeId: invitee.id }),
        });
        const json = (await res.json().catch(() => null)) as { message?: string } | null;
        if (!res.ok) throw new Error(json?.message || `Backend responded ${res.status}`);
        Alert.alert('Invite sent', json?.message ?? 'They will be notified in-app.');
        await load();
      } catch (e) {
        Alert.alert('Could not invite', describeApiFailure(e, 'Something went wrong.'));
      } finally {
        setInvitingId(null);
      }
    },
    [canInvite, getToken, load],
  );

  /** Accepts or declines an invite received by this user. */
  const respondToInvite = useCallback(
    async (invite: Invite, action: 'accept' | 'decline') => {
      setRespondingId(invite.id);
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
        const token = await getToken();
        if (!token) throw new Error('Not signed in');
        const res = await apiFetch(`/accounts/invites/${invite.id}/${action}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => null)) as { message?: string } | null;
        if (!res.ok) throw new Error(json?.message || `Backend responded ${res.status}`);
        setReceivedInvites((current) => current.filter((pending) => pending.id !== invite.id));
        DeviceEventEmitter.emit('bawatpieza:refresh-notifications');
        if (action === 'accept') {
          notifyDeviceAccessChanged(null);
        }
        if (action === 'accept') {
          setInviteDialog((current) =>
            current
              ? { ...current, stage: 'processing', message: 'Connecting to the shared device…' }
              : current,
          );
          void refreshSharedDeviceAccess(token).catch((accessError) => {
            console.warn('[accounts] Could not immediately load shared device access:', accessError);
          });
          void load();
          setInviteDialog((current) =>
            current
              ? {
                  ...current,
                  stage: 'success',
                  message: 'Invitation accepted. Continue to your device while it connects.',
                }
              : current,
          );
          return;
        }
        await load();
        setInviteDialog((current) =>
          current
            ? {
                ...current,
                stage: 'success',
                message: json?.message ?? 'Your response has been saved.',
              }
            : current,
        );
      } catch (e) {
        setInviteDialog((current) =>
          current
            ? { ...current, stage: 'error', message: describeApiFailure(e, 'Something went wrong.') }
            : current,
        );
      } finally {
        setRespondingId(null);
      }
    },
    [getToken, load, router],
  );

  const confirmInviteResponse = useCallback(
    (invite: Invite, action: 'accept' | 'decline') => {
      setInviteDialog({ invite, action, stage: 'confirm' });
    },
    [],
  );
  /**
   * Realtime filtering: computed on every keystroke against the data already
   * in memory — no network round trip, so results update as you type.
   * Both queries match the user's name OR the email they signed up with.
   */
  const visibleAccounts = useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter((a) => {
      if (roleTab === 'owner' ? !isOwnerRole(a.role) : isOwnerRole(a.role)) return false;
      return q ? matchesQuery(q, displayNameOf(a), a.email) : true;
    });
  }, [accounts, query, roleTab]);

  /** Invite results: invitable users realtime-filtered by the SAME search
   * bar, email-first (matchesQuery covers name too). Only while typing. */
  const inviteResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return invitable.filter((u) => matchesQuery(q, displayNameOf(u), u.email)).slice(0, 8);
  }, [invitable, query]);

  /** Pending invites this user sent — visible until accepted or declined. */
  const pendingSent = useMemo(
    () => sentInvites.filter((i) => i.status === 'pending'),
    [sentInvites],
  );

  return (
    <ScreenShell title="Shared Users" showBack>
      {loading ? (
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading shared users" size="md" />
        </View>
      ) : null}
      {/* Search sits at the very top — first glance — always visible. */}
      {!error && (
        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={17} color={MUTED} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search users by name or email..."
              placeholderTextColor={MUTED}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              accessibilityLabel="Search users by name or email"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={17} color={MUTED} />
              </Pressable>
            )}
          </View>
        </View>
      )}
      {/* User search is available to everyone; only device owners can invite. */}
      {!error && query.trim().length > 0 && (
        <ContentCard
          eyebrow={canInvite ? "Invite user" : "Search users"}
          title={
            invitableLoading
              ? 'Searching users...'
              : invitableError
                ? 'Could not search users'
              : inviteResults.length > 0
                ? canInvite
                  ? `${inviteResults.length} user${inviteResults.length === 1 ? '' : 's'} found — tap Invite`
                  : `${inviteResults.length} matching user${inviteResults.length === 1 ? '' : 's'} found`
                : `No user matches "${query.trim()}"`
          }
        >
          {!canInvite && (
            <View style={styles.inlineStateWrap}>
              <Text style={[styles.inlineStateText, { color: MUTED }]}>
                You can search users here. Only users with a paired device can send invites.
              </Text>
            </View>
          )}
          {invitableLoading ? (
            <View style={styles.inlineStateWrap}>
              <ActivityIndicator size="small" color={PRUSSIAN} />
              <Text style={[styles.inlineStateText, { color: MUTED }]}>Searching users...</Text>
            </View>
          ) : invitableError ? (
            <View style={styles.inlineStateWrap}>
              <Text style={[styles.inlineStateText, { color: MUTED }]}>{invitableError}</Text>
            </View>
          ) : inviteResults.length === 0 ? (
            <View style={styles.inlineStateWrap}>
              <Text style={[styles.inlineStateText, { color: MUTED }]}>
                Try part of a name or the exact email they used to sign up.
              </Text>
            </View>
          ) : (
            inviteResults.map((u, i) => {
              const displayName = displayNameOf(u);
              const busy = invitingId === u.id;
              return (
                <View
                  key={u.id}
                  style={[styles.row, i === inviteResults.length - 1 ? styles.rowLast : null]}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowName}>{displayName}</Text>
                    {u.email ? <Text style={styles.rowSub}>{u.email}</Text> : null}
                  </View>
                  {canInvite && (
                    <Pressable
                      disabled={invitingId !== null}
                      onPress={() => inviteUser(u)}
                      style={({ pressed }) => [
                        styles.actionBtn,
                        { backgroundColor: PRUSSIAN },
                        pressed && { opacity: 0.7 },
                      ]}
                      accessibilityLabel={`Invite ${u.email ?? displayName}`}
                    >
                      {busy ? (
                        <ActivityIndicator size="small" color={WHITE} />
                      ) : (
                        <Text style={styles.actionBtnText}>Invite</Text>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })
          )}
        </ContentCard>
      )}

      {/* Pending invited users: everyone this user invited who has not
          responded yet — stays visible so you can see what is outstanding. */}
      {!error && pendingSent.length > 0 && (
        <ContentCard
          eyebrow="Pending invites"
          title={`${pendingSent.length} invite${pendingSent.length === 1 ? '' : 's'} waiting for a response`}
        >
          {pendingSent.map((invite, i) => (
            <View
              key={invite.id}
              style={[styles.row, i === pendingSent.length - 1 ? styles.rowLast : null]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(invite.counterpart.name || '?').charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{invite.counterpart.name}</Text>
                {invite.counterpart.email ? (
                  <Text style={styles.rowSub}>{invite.counterpart.email}</Text>
                ) : null}
                <Text style={styles.rowSince}>Invited — waiting for them to accept</Text>
              </View>
              <View style={styles.pendingChip}>
                <View style={styles.pendingDot} />
                <Text style={styles.pendingChipText}>Pending</Text>
              </View>
            </View>
          ))}
        </ContentCard>
      )}


      {receivedInvites.length > 0 && (
        <ContentCard
          eyebrow="Pending"
          title={`${receivedInvites.length} access invite${receivedInvites.length === 1 ? '' : 's'} for you`}
        >
          {receivedInvites.map((invite, i) => (
            <View
              key={invite.id}
              style={[styles.row, i === receivedInvites.length - 1 ? styles.rowLast : null]}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {invite.counterpart.name.charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.rowName}>{invite.counterpart.name}</Text>
                <Text style={styles.rowSub}>
                  {invite.counterpart.email ?? 'wants to share their account with you'}
                </Text>
              </View>
              <Pressable
                disabled={respondingId === invite.id}
                onPress={() => confirmInviteResponse(invite, 'accept')}
                style={({ pressed }) => [
                  styles.actionBtn,
                  { backgroundColor: OK },
                  pressed && { opacity: 0.7 },
                ]}
              >
                {respondingId === invite.id ? (
                  <ActivityIndicator size="small" color={WHITE} />
                ) : (
                  <Text style={styles.actionBtnText}>Accept</Text>
                )}
              </Pressable>
              <Pressable
                disabled={respondingId === invite.id}
                onPress={() => confirmInviteResponse(invite, 'decline')}
                style={({ pressed }) => [
                  styles.actionBtnOutline,
                  { borderColor: c.danger },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.actionBtnOutlineText, { color: c.danger }]}>Decline</Text>
              </Pressable>
            </View>
          ))}
        </ContentCard>
      )}

      {error ? (
        <ContentCard eyebrow="Error">
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.hint}>
            Start the backend in BawatPiezaMobileApp/backend (port 4000), keep this phone on
            the same Wi-Fi as that PC, and allow port 4000 through its firewall
            (npm run allow-lan-api). Right now the app is calling {describeApiBase()}.
          </Text>
        </ContentCard>
      ) : accounts.length === 0 ? (
        <ContentCard eyebrow="Shared users" title="No shared users yet">
          <Text style={styles.hint}>
            Only people who accepted your invite appear here. Search their email above and tap Invite on their row — you will see them as a shared user as soon as they accept.
          </Text>
        </ContentCard>
      ) : visibleAccounts.length === 0 ? (
        <ContentCard eyebrow="No matches" title="No user found">
          <Text style={styles.hint}>
            Nothing matches “{query.trim()}” in the {roleTab === 'owner' ? 'Owner' : 'Shared'} tab.
            Try part of a name or the email address they used to sign up.
          </Text>
        </ContentCard>
      ) : (
        <ContentCard
          title={
            query.trim()
              ? `${visibleAccounts.length} of ${accounts.length} shared user${accounts.length === 1 ? '' : 's'}`
              : `${accounts.length} shared user${accounts.length === 1 ? '' : 's'}`
          }
          eyebrow="Shared users"
        >
          {visibleAccounts.map((a, i) => {
            const displayName = displayNameOf(a);
            const owner = isOwnerRole(a.role);
            return (
              <View
                key={a.id ?? i}
                style={[styles.row, i === visibleAccounts.length - 1 ? styles.rowLast : null]}
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{displayName}</Text>
                  {a.email ? <Text style={styles.rowSub}>{a.email}</Text> : null}
                  <Text style={styles.rowSince}>
                    {a.shared_since
                      ? `Shared since ${new Date(a.shared_since).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })}`
                      : 'Accepted shared user'}
                  </Text>
                </View>
                <View style={[styles.sharedChip, owner && styles.ownerChip]}>
                  <View style={[styles.sharedDot, owner && styles.ownerDot]} />
                  <Text style={[styles.sharedChipText, owner && styles.ownerChipText]}>
                    {roleLabel(a.role)}
                  </Text>
                </View>
              </View>
            );
          })}
        </ContentCard>
      )}

      {/* Role tabs under the list — filter shared users by Owner / Shared role. */}
      {!error && accounts.length > 0 && (
        <View style={styles.tabRow} accessibilityRole="tablist" accessibilityLabel="Filter by role">
          {(['shared', 'owner'] as RoleTab[]).map((tab) => {
            const active = roleTab === tab;
            const count = accounts.filter((a) =>
              tab === 'owner' ? isOwnerRole(a.role) : !isOwnerRole(a.role),
            ).length;
            return (
              <Pressable
                key={tab}
                onPress={() => setRoleTab(tab)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${tab === 'owner' ? 'Owner' : 'Shared'} tab, ${count} users`}
                style={[
                  styles.tab,
                  { backgroundColor: active ? c.accent : c.surface, borderColor: active ? c.accent : LINE },
                ]}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: active ? WHITE : MUTED },
                  ]}
                >
                  {tab === 'owner' ? 'Owner' : 'Shared'} · {count}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {inviteDialog && (
        <InviteResponseModal
          visible
          inviterName={inviteDialog.invite.counterpart.name}
          action={inviteDialog.action}
          stage={inviteDialog.stage}
          message={inviteDialog.message}
          onCancel={() => {
            if (inviteDialog.stage !== 'processing') setInviteDialog(null);
          }}
          onConfirm={() => void respondToInvite(inviteDialog.invite, inviteDialog.action)}
          onContinue={() => {
            const shouldOpenHome = inviteDialog.action === 'accept' && inviteDialog.stage === 'success';
            setInviteDialog(null);
            if (shouldOpenHome) router.replace('/home');
          }}
        />
      )}

    </ScreenShell>
  );
}

const makeStyles = (c: ThemeColors) => {
  const PRUSSIAN = c.accent;
  const MUTED = c.muted;
  const LINE = c.line;
  const BUTTER = c.butter;
  const DANGER = c.danger;
  const WHITE = c.onAccent;
  return StyleSheet.create({
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { color: DANGER, fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 8 },
  hint: { color: MUTED, fontSize: 12, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    gap: 8,
  },
  rowLast: { borderBottomWidth: 0 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: BUTTER, alignItems: 'center', justifyContent: 'center', marginRight: 4,
  },
  avatarText: { color: PRUSSIAN, fontSize: 15, fontWeight: '900', fontFamily: fonts.extrabold },
  rowText: { flex: 1 },
  rowName: { color: PRUSSIAN, fontSize: 14, fontWeight: '800', fontFamily: fonts.extrabold },
  rowSub: { color: MUTED, fontSize: 11, marginTop: 1 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 12,
    minHeight: 44,
  },
  // Wrapper lets the email suggestion popup overlay content below the input.
  searchWrap: { position: 'relative', zIndex: 10, marginBottom: 12 },
  searchInput: {
    flex: 1,
    color: c.text,
    fontSize: 12,
    fontFamily: fonts.medium,
    marginLeft: 8,
    paddingVertical: 0,
  },
  rowSince: { color: MUTED, fontSize: 10, marginTop: 3, opacity: 0.85 },
  sharedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(22, 163, 74, 0.14)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  sharedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.ok },
  sharedChipText: { color: c.ok, fontSize: 11, fontWeight: '800', fontFamily: fonts.extrabold },
  ownerChip: { backgroundColor: 'rgba(246, 196, 69, 0.20)' },
  ownerDot: { backgroundColor: BUTTER },
  ownerChipText: { color: PRUSSIAN },
  tabRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  tab: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabText: { fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold },
  actionBtn: {
    minWidth: 64,
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnText: { color: WHITE, fontSize: 12, fontWeight: '800', fontFamily: fonts.extrabold },
  actionBtnOutline: {
    minWidth: 64,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: LINE,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnOutlineText: { color: MUTED, fontSize: 12, fontWeight: '700', fontFamily: fonts.bold },
  inlineStateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 8,
  },
  inlineStateText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  pendingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(246, 196, 69, 0.20)',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  pendingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BUTTER },
  pendingChipText: { color: PRUSSIAN, fontSize: 11, fontWeight: '800', fontFamily: fonts.extrabold },
  });
};
