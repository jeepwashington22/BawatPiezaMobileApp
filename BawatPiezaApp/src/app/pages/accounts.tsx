import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
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

export default function AccountsScreen() {
  const router = useRouter();
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
      <Pressable style={styles.addBtn} onPress={() => router.push('/signup')}>
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
                {a.role ? (
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
  addBtn: {
    backgroundColor: PRUSSIAN,
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14,
  },
  addBtnText: { color: WHITE, fontSize: 14, fontWeight: '800', fontFamily: fonts.extrabold },
  });
};




