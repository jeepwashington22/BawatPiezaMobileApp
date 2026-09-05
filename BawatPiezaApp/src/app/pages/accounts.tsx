import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { ContentCard } from '../../components/content-card';
import { supabase } from '../../lib/supabase';

const MUTED = 'rgba(10, 42, 74, 0.62)';
const LINE = 'rgba(10, 42, 74, 0.1)';

// Same backend the web frontend uses (now hosted in BawatPiezaMobileApp/backend)
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

type Account = {
  id: string;
  email?: string | null;
  firstname?: string | null;
  lastname?: string | null;
  name?: string | null;
  role?: string | null;
  status?: string | null;
};

const EMPTY_FORM = { firstname: '', middlename: '', lastname: '', email: '', role: 'staff', contactNo: '' };

export default function AccountsScreen() {
  const { colors: c, fonts: f } = useTheme();
  const styles = makeStyles(c);
  const PRUSSIAN = c.accent;
  const BUTTER = c.butter;
  const MUTED = c.muted;
  const LINE = c.line;
  const DANGER = c.danger;
  const WHITE = c.onAccent;
  const OK = c.ok;
  const BAD = c.danger;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Add-member modal state
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeOk, setNoticeOk] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      if (!token) throw new Error('Not signed in');

      // Same call as web reports page: GET /accounts with Bearer token
      const res = await fetch(`${API_URL}/accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`Backend responded ${res.status}`);
      const json = (await res.json()) as { accounts?: Account[] } | Account[];
      setAccounts(Array.isArray(json) ? json : (json.accounts ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const authedFetch = useCallback(
    async (path: string, body: object) => {
      const { data: authData } = await supabase.auth.getSession();
      const token = authData.session?.access_token;
      const res = await fetch(`${API_URL}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.message ?? `Backend responded ${res.status}`);
      return json;
    },
    [],
  );

  // Admin invite — creates the auth user, mirrors user_accounts and emails the
  // 5-minute set-password link (same flow as the old web accounts page).
  const createAccount = async () => {
    setError(null);
    if (!form.firstname.trim() || !form.lastname.trim() || !/.+@.+\..+/.test(form.email.trim())) {
      setNoticeOk(false);
      setNotice('First name, last name and a valid email are required.');
      return;
    }
    setSaving(true);
    try {
      const json = await authedFetch('/accounts', {
        firstname: form.firstname.trim(),
        middlename: form.middlename.trim() || undefined,
        lastname: form.lastname.trim(),
        email: form.email.trim(),
        role: form.role,
        contactNo: form.contactNo.trim() || undefined,
      });
      setNoticeOk(Boolean(json?.verificationEmailSent));
      setNotice(json?.message ?? 'Account created.');
      setForm(EMPTY_FORM);
      setAddOpen(false);
      await load();
    } catch (e) {
      setNoticeOk(false);
      setNotice(e instanceof Error ? e.message : 'Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  const resendInvite = async (email: string) => {
    setNotice(null);
    try {
      const json = await authedFetch('/accounts/resend-invite', { email });
      setNoticeOk(Boolean(json?.verificationEmailSent));
      setNotice(json?.message ?? 'Invite re-sent.');
    } catch (e) {
      setNoticeOk(false);
      setNotice(e instanceof Error ? e.message : 'Failed to resend invite');
    }
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading accounts" size="lg" />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      {notice ? (
        <View style={[styles.notice, noticeOk ? styles.noticeOk : styles.noticeErr]}>
          <Text style={noticeOk ? styles.noticeOkText : styles.noticeErrText}>{notice}</Text>
        </View>
      ) : null}

      <Pressable style={styles.addBtn} onPress={() => { setAddOpen(true); setNotice(null); }}>
        <Text style={styles.addBtnText}>＋ Add member</Text>
      </Pressable>

      {error ? (
        <ContentCard eyebrow="Error">
          <Text style={styles.errorText}>{error}</Text>
          <Text style={styles.hint}>
            Start the backend in BawatPiezaMobileApp/backend (port 4000) and make sure
            EXPO_PUBLIC_API_URL points to it. On a physical device use your PC&apos;s LAN IP instead of localhost.
          </Text>
        </ContentCard>
      ) : accounts.length === 0 ? (
        <ContentCard eyebrow="Empty">
          <Text style={styles.hint}>No team members found for this workspace.</Text>
        </ContentCard>
      ) : (
        <ContentCard title={`${accounts.length} member${accounts.length === 1 ? '' : 's'}`} eyebrow="Team">
          {accounts.map((a, i) => {
            const displayName = a.name ?? [a.firstname, a.lastname].filter(Boolean).join(' ') ?? a.email ?? 'Unnamed';
            return (
              <View key={a.id ?? i} style={[styles.row, i === accounts.length - 1 ? styles.rowLast : null]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{displayName}</Text>
                  {a.email ? <Text style={styles.rowSub}>{a.email}</Text> : null}
                </View>
                {a.status === 'pending' ? (
                  <Pressable style={styles.resendBtn} onPress={() => resendInvite(a.email ?? '')} hitSlop={6}>
                    <Text style={styles.resendText}>Resend</Text>
                  </Pressable>
                ) : a.role ? (
                  <View style={styles.roleChip}>
                    <Text style={styles.roleText}>{a.role}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ContentCard>
      )}
      <ActivityIndicator style={styles.retry} color={PRUSSIAN} size="small" />

      {/* Add-member modal (admin invite) */}
      <Modal visible={addOpen} transparent animationType="slide" onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Invite a member</Text>
            <Text style={styles.modalSub}>They&apos;ll receive a set-password link valid for 5 minutes.</Text>

            <TextInput style={styles.modalInput} placeholder="First name *" placeholderTextColor={MUTED} value={form.firstname} onChangeText={(v) => setForm({ ...form, firstname: v })} />
            <TextInput style={styles.modalInput} placeholder="Middle name" placeholderTextColor={MUTED} value={form.middlename} onChangeText={(v) => setForm({ ...form, middlename: v })} />
            <TextInput style={styles.modalInput} placeholder="Last name *" placeholderTextColor={MUTED} value={form.lastname} onChangeText={(v) => setForm({ ...form, lastname: v })} />
            <TextInput style={styles.modalInput} placeholder="Email *" placeholderTextColor={MUTED} autoCapitalize="none" keyboardType="email-address" value={form.email} onChangeText={(v) => setForm({ ...form, email: v })} />
            <TextInput style={styles.modalInput} placeholder="Contact no." placeholderTextColor={MUTED} keyboardType="phone-pad" value={form.contactNo} onChangeText={(v) => setForm({ ...form, contactNo: v })} />

            <View style={styles.roleRow}>
              {['staff', 'admin'].map((r) => (
                <Pressable
                  key={r}
                  onPress={() => setForm({ ...form, role: r })}
                  style={[styles.roleOption, form.role === r && styles.roleOptionOn]}
                >
                  <Text style={[styles.roleOptionText, form.role === r && styles.roleOptionTextOn]}>{r}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setAddOpen(false)} disabled={saving}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.inviteBtn} onPress={createAccount} disabled={saving}>
                <Text style={styles.inviteText}>{saving ? 'Sending…' : 'Send invite'}</Text>
              </Pressable>
            </View>
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
  loaderWrap: { alignItems: 'center', paddingVertical: 48 },
  errorText: { color: '#B91C1C', fontSize: 14, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 8 },
  hint: { color: MUTED, fontSize: 12, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  rowLast: { borderBottomWidth: 0 },
  avatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: BUTTER, alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { color: PRUSSIAN, fontSize: 15, fontWeight: '900', fontFamily: fonts.extrabold },
  rowText: { flex: 1 },
  rowName: { color: PRUSSIAN, fontSize: 14, fontWeight: '800', fontFamily: fonts.extrabold },
  rowSub: { color: MUTED, fontSize: 11, marginTop: 1 },
  roleChip: {
    backgroundColor: 'rgba(246, 196, 69, 0.25)',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  roleText: { color: PRUSSIAN, fontSize: 11, fontWeight: '800', fontFamily: fonts.extrabold, textTransform: 'capitalize' },
  retry: { marginTop: 12 },
  notice: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  noticeOk: { backgroundColor: 'rgba(21, 128, 61, 0.1)', borderColor: 'rgba(21, 128, 61, 0.35)' },
  noticeOkText: { color: '#15803D', fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, lineHeight: 18 },
  noticeErr: { backgroundColor: 'rgba(185, 28, 28, 0.08)', borderColor: 'rgba(185, 28, 28, 0.3)' },
  noticeErrText: { color: '#B91C1C', fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, lineHeight: 18 },
  addBtn: {
    backgroundColor: PRUSSIAN,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14,
  },
  addBtnText: { color: WHITE, fontSize: 14, fontWeight: '800', fontFamily: fonts.extrabold },
  resendBtn: {
    backgroundColor: 'rgba(246, 196, 69, 0.3)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  resendText: { color: PRUSSIAN, fontSize: 11, fontWeight: '800', fontFamily: fonts.extrabold },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(10, 25, 45, 0.55)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: c.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
  },
  modalTitle: { color: PRUSSIAN, fontSize: 19, fontWeight: '900', fontFamily: fonts.extrabold },
  modalSub: { color: MUTED, fontSize: 12, marginTop: 3, marginBottom: 14 },
  modalInput: {
    borderWidth: 1,
    borderColor: 'rgba(10, 42, 74, 0.16)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 14,
    color: PRUSSIAN,
    marginBottom: 10,
    backgroundColor: c.surfaceMuted,
  },
  roleRow: { flexDirection: 'row', gap: 8, marginTop: 2, marginBottom: 16 },
  roleOption: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(10, 42, 74, 0.18)',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  roleOptionOn: { backgroundColor: PRUSSIAN, borderColor: PRUSSIAN },
  roleOptionText: { color: MUTED, fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold, textTransform: 'capitalize' },
  roleOptionTextOn: { color: WHITE },
  modalActions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(10, 42, 74, 0.18)',
    borderRadius: 13,
    paddingVertical: 13,
    alignItems: 'center',
  },
  cancelText: { color: MUTED, fontSize: 14, fontWeight: '800', fontFamily: fonts.extrabold },
  inviteBtn: { flex: 1.4, backgroundColor: PRUSSIAN, borderRadius: 13, paddingVertical: 13, alignItems: 'center' },
  inviteText: { color: WHITE, fontSize: 14, fontWeight: '800', fontFamily: fonts.extrabold },
  });
};




