import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScreenShell } from '../../components/screen-shell';
import { ContentCard } from '../../components/content-card';
import { supabase } from '../../lib/supabase';
import { apiFetch, describeApiBase } from '../../lib/api';
import { describeApiFailure } from '../../lib/network';

/**
 * Shared Users (account tab). Three related jobs:
 *  1. List THIS user's accepted shared users only — the screen calls
 *     `GET /accounts?shared=1`, so accounts that never completed the invite
 *     handshake are never fetched from the backend.
 *  2. "Invite existing user" opens a popup listing existing active accounts
 *     (only shown if there are any left to invite) -> POST /accounts/invite
 *     creates a pending share invite and notifies the invitee in-app.
 *  3. Pending invites received by this user render in their own card with
 *     Accept / Decline; accepting makes this user a shared user of the inviter
 *     and notifies the inviter back — the person then appears in the list.
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
  return u.name ?? [u.firstname, u.lastname].filter(Boolean).join(' ') ?? u.email ?? 'Unnamed';
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
  const [authChecking, setAuthChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [receivedInvites, setReceivedInvites] = useState<Invite[]>([]);

  // Invite popup state.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitable, setInvitable] = useState<Account[] | null>(null);
  const [invitableLoading, setInvitableLoading] = useState(false);
  const [invitableError, setInvitableError] = useState<string | null>(null);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  // Accept / decline busy state (invite id currently in flight).
  const [respondingId, setRespondingId] = useState<string | null>(null);

  // Realtime search — one query per surface, filtered client-side as you type.
  const [listQuery, setListQuery] = useState('');
  const [inviteQuery, setInviteQuery] = useState('');
  // Popup visibility — true while the search input is focused.
  // Hidden with a small delay on blur so a suggestion tap registers
  // before the dropdown unmounts.
  const [inviteFocused, setInviteFocused] = useState(false);

  /** Bearer token for the Express API, or null when signed out. */
  const getToken = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');

      // Accepted shared users only (?shared=1) + this user's invite context.
      const [res, invitesRes] = await Promise.all([
        apiFetch('/accounts?shared=1', { headers: { Authorization: `Bearer ${token}` } }),
        apiFetch('/accounts/invites', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const json = (await res.json().catch(() => null)) as (
        | { accounts?: Account[]; message?: string }
        | Account[]
        | null
      );
      if (!res.ok) {
        const message = !Array.isArray(json) && json?.message;
        throw new Error(message || `Backend responded ${res.status}`);
      }
      setAccounts(Array.isArray(json) ? json : (json?.accounts ?? []));

      if (invitesRes.ok) {
        const invJson = (await invitesRes.json().catch(() => null)) as { received?: Invite[] } | null;
        setReceivedInvites(invJson?.received ?? []);
      }
      // A failed invites call is non-fatal: the member list still renders.
    } catch (e) {
      setError(describeApiFailure(e, 'Failed to load accounts'));
    } finally {
      setLoading(false);
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

  /** Opens the invite popup and loads the candidate list (existing users only). */
  const openInvitePopup = useCallback(async () => {
    setInviteOpen(true);
    setInvitable(null);
    setInvitableError(null);
    setInviteQuery(''); // fresh search each time the popup opens
    setInvitableLoading(true);
    try {
      const token = await getToken();
      if (!token) throw new Error('Not signed in');
      const res = await apiFetch('/accounts/invitable', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json().catch(() => null)) as {
        accounts?: Account[];
        message?: string;
      } | null;
      if (!res.ok) throw new Error(json?.message || `Backend responded ${res.status}`);
      setInvitable(json?.accounts ?? []);
    } catch (e) {
      setInvitableError(describeApiFailure(e, 'Failed to load users'));
    } finally {
      setInvitableLoading(false);
    }
  }, [getToken, setInviteOpen, setInvitable, setInvitableError, setInvitableLoading]);

  /** Sends a pending share invite to an existing user (they get a notification). */
  const inviteUser = useCallback(
    async (invitee: Account) => {
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
        setInviteOpen(false);
        await load();
      } catch (e) {
        Alert.alert('Could not invite', describeApiFailure(e, 'Something went wrong.'));
      } finally {
        setInvitingId(null);
      }
    },
    [getToken, load, setInvitingId, setInviteOpen],
  );

  /** Accepts or declines an invite received by this user. */
  const respondToInvite = useCallback(
    async (invite: Invite, action: 'accept' | 'decline') => {
      setRespondingId(invite.id);
      try {
        const token = await getToken();
        if (!token) throw new Error('Not signed in');
        const res = await apiFetch(`/accounts/invites/${invite.id}/${action}`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        const json = (await res.json().catch(() => null)) as { message?: string } | null;
        if (!res.ok) throw new Error(json?.message || `Backend responded ${res.status}`);
        Alert.alert(
          action === 'accept' ? 'Access granted' : 'Invite declined',
          json?.message ??
            (action === 'accept' ? 'You are now a shared user.' : 'Invite declined.'),
        );
        await load();
      } catch (e) {
        Alert.alert('Could not respond', describeApiFailure(e, 'Something went wrong.'));
      } finally {
        setRespondingId(null);
      }
    },
    [getToken, load],
  );

  /**
   * Realtime filtering: computed on every keystroke against the data already
   * in memory — no network round trip, so results update as you type.
   * Both queries match the user's name OR the email they signed up with.
   */
  const visibleAccounts = useMemo(() => {
    const q = listQuery.trim().toLowerCase();
    return q
      ? accounts.filter((a) => matchesQuery(q, displayNameOf(a), a.email))
      : accounts;
  }, [accounts, listQuery]);

  const visibleInvitable = useMemo(() => {
    const q = inviteQuery.trim().toLowerCase();
    return q
      ? (invitable ?? []).filter((u) => matchesQuery(q, displayNameOf(u), u.email))
      : (invitable ?? []);
  }, [invitable, inviteQuery]);

  if (loading) {
    return (
      <ScreenShell title="Shared Users" showBack>
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color={PRUSSIAN} />
          <Text style={[styles.hint, { marginTop: 10 }]}>Loading shared users</Text>
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title="Shared Users" showBack>
      {!error && accounts.length > 0 && (
        <View style={styles.searchWrap}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={17} color={MUTED} />
            <TextInput
              value={listQuery}
              onChangeText={setListQuery}
              placeholder="Search user by name or email..."
              placeholderTextColor={MUTED}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              accessibilityLabel="Search shared users"
            />
            {listQuery.length > 0 && (
              <Pressable onPress={() => setListQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                <Ionicons name="close-circle" size={17} color={MUTED} />
              </Pressable>
            )}
          </View>
        </View>
      )}
      <Pressable style={styles.addBtn} onPress={openInvitePopup}>
        <Text style={styles.addBtnText}>＋ Invite existing user</Text>
      </Pressable>
      <Pressable style={styles.secondaryBtn} onPress={() => router.push('/signup')}>
        <Text style={styles.secondaryBtnText}>＋ Add member (new account)</Text>
      </Pressable>

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
                onPress={() => respondToInvite(invite, 'accept')}
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
                onPress={() => respondToInvite(invite, 'decline')}
                style={({ pressed }) => [styles.actionBtnOutline, pressed && { opacity: 0.7 }]}
              >
                <Text style={styles.actionBtnOutlineText}>Decline</Text>
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
            Only people who accepted your invite appear here. Tap “Invite existing user”
            above to send one — you will see them as a shared user as soon as they accept.
          </Text>
        </ContentCard>
      ) : visibleAccounts.length === 0 ? (
        <ContentCard eyebrow="No matches" title="No user found">
          <Text style={styles.hint}>
            Nothing matches “{listQuery.trim()}”. Try part of a name or the email address
            they used to sign up.
          </Text>
        </ContentCard>
      ) : (
        <ContentCard
          title={
            listQuery.trim()
              ? `${visibleAccounts.length} of ${accounts.length} shared user${accounts.length === 1 ? '' : 's'}`
              : `${accounts.length} shared user${accounts.length === 1 ? '' : 's'}`
          }
          eyebrow="Shared users"
        >
          {visibleAccounts.map((a, i) => {
            const displayName = displayNameOf(a);
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
                <View style={styles.sharedChip}>
                  <View style={styles.sharedDot} />
                  <Text style={styles.sharedChipText}>Shared</Text>
                </View>
              </View>
            );
          })}
        </ContentCard>
      )}

      {/* Invite popup: lists existing users — only if there are any to invite. */}
      <Modal
        visible={inviteOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setInviteOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: c.surface }]}>
            <Text style={[styles.modalTitle, { color: c.text }]}>Invite an existing user</Text>
            <Text style={[styles.modalSubtitle, { color: MUTED }]}>
              Pick a user to share your account with. They get an in-app notification and become
              a shared user once they accept.
            </Text>

            {invitableLoading ? (
              <View style={styles.modalStateWrap}>
                <ActivityIndicator size="small" color={PRUSSIAN} />
                <Text style={[styles.modalStateText, { color: MUTED }]}>Loading users…</Text>
              </View>
            ) : invitableError ? (
              <View style={styles.modalStateWrap}>
                <Text style={styles.errorText}>{invitableError}</Text>
              </View>
            ) : !invitable || invitable.length === 0 ? (
              <View style={styles.modalStateWrap}>
                <Text style={[styles.modalStateText, { color: MUTED }]}>
                  No existing users available to invite right now.
                </Text>
              </View>
            ) : (
              <>
                {/* Realtime search inside the popup — matches name or email,
                    with a dropdown that pops up the used email for each match. */}
                <View style={styles.searchWrapModal}>
                  <View style={[styles.searchBox, styles.searchBoxModal]}>
                    <Ionicons name="search-outline" size={17} color={MUTED} />
                    <TextInput
                      value={inviteQuery}
                      onChangeText={setInviteQuery}
                      onFocus={() => setInviteFocused(true)}
                      onBlur={() => setTimeout(() => setInviteFocused(false), 150)}
                      placeholder="Search user by name or email..."
                      placeholderTextColor={MUTED}
                      style={styles.searchInput}
                      autoCapitalize="none"
                      autoCorrect={false}
                      keyboardType="email-address"
                      accessibilityLabel="Search users to invite"
                    />
                    {inviteQuery.length > 0 && (
                      <Pressable onPress={() => setInviteQuery('')} hitSlop={8} accessibilityLabel="Clear search">
                        <Ionicons name="close-circle" size={17} color={MUTED} />
                      </Pressable>
                    )}
                  </View>
                  {inviteFocused && inviteQuery.trim().length > 0 && visibleInvitable.length > 0 && (
                    <View style={[styles.suggestPopup, { backgroundColor: c.surface, borderColor: LINE }]}>
                      {visibleInvitable.slice(0, 5).map((u) => {
                        const displayName = displayNameOf(u);
                        const target = u.email ?? displayName;
                        return (
                          <Pressable
                            key={u.id}
                            onPress={() => setInviteQuery(target)}
                            style={({ pressed }) => [
                              styles.suggestRow,
                              pressed && { opacity: 0.6 },
                            ]}
                            accessibilityLabel={`Select ${target}`}
                          >
                            <View style={styles.suggestAvatar}>
                              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                            </View>
                            <View style={styles.rowText}>
                              <Text style={styles.rowName}>{displayName}</Text>
                              {u.email ? <Text style={styles.rowSub}>{u.email}</Text> : null}
                            </View>
                            <Ionicons name="arrow-up-circle-outline" size={18} color={MUTED} />
                          </Pressable>
                        );
                      })}
                    </View>
                  )}
                </View>

                {visibleInvitable.length === 0 ? (
                  <View style={styles.modalStateWrap}>
                    <Text style={[styles.modalStateText, { color: MUTED }]}>
                      No user matches “{inviteQuery.trim()}”. Try part of a name or the email
                      they used to sign up.
                    </Text>
                  </View>
                ) : (
                  <View style={styles.modalList}>
                    {visibleInvitable.map((u) => {
                      const displayName = displayNameOf(u);
                      const busy = invitingId === u.id;
                      return (
                        <View key={u.id} style={[styles.row, styles.modalRow]}>
                          <View style={styles.avatar}>
                            <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                          </View>
                          <View style={styles.rowText}>
                            <Text style={styles.rowName}>{displayName}</Text>
                            {u.email ? <Text style={styles.rowSub}>{u.email}</Text> : null}
                          </View>
                          <Pressable
                            disabled={invitingId !== null}
                            onPress={() => inviteUser(u)}
                            style={({ pressed }) => [
                              styles.actionBtn,
                              { backgroundColor: PRUSSIAN },
                              pressed && { opacity: 0.7 },
                            ]}
                          >
                            {busy ? (
                              <ActivityIndicator size="small" color={WHITE} />
                            ) : (
                              <Text style={styles.actionBtnText}>Invite</Text>
                            )}
                          </Pressable>
                        </View>
                      );
                    })}
                  </View>
                )}
              </>
            )}

            <Pressable
              onPress={() => setInviteOpen(false)}
              style={({ pressed }) => [
                styles.modalCloseBtn,
                { borderColor: LINE },
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.modalCloseText, { color: c.text }]}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  searchBoxModal: { marginBottom: 10 },
  // Wrapper lets the email suggestion popup overlay content below the input.
  searchWrap: { position: 'relative', zIndex: 10, marginBottom: 12 },
  searchWrapModal: { position: 'relative', zIndex: 10, marginBottom: 10 },
  suggestPopup: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  suggestAvatar: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: BUTTER, alignItems: 'center', justifyContent: 'center',
  },
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
  addBtn: {
    backgroundColor: PRUSSIAN,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 8,
  },
  addBtnText: { color: WHITE, fontSize: 14, fontWeight: '800', fontFamily: fonts.extrabold },
  secondaryBtn: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 14,
  },
  secondaryBtnText: { color: PRUSSIAN, fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold },
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '88%',
    maxHeight: '80%',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    fontFamily: fonts.extrabold,
    marginBottom: 6,
    textAlign: 'center',
  },
  modalSubtitle: {
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
    textAlign: 'center',
  },
  modalList: { maxHeight: 320 },
  modalRow: {},
  modalStateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  modalStateText: { fontSize: 13, lineHeight: 19, textAlign: 'center' },
  modalCloseBtn: {
    marginTop: 16,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalCloseText: { fontSize: 13, fontWeight: '700', fontFamily: fonts.bold },
  });
};


