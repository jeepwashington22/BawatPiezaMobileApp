import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { ContentCard } from '../../components/content-card';
import { supabase } from '../../lib/supabase';

const PRUSSIAN = '#0A2A4A';
const BUTTER = '#F6C445';
const MUTED = 'rgba(10, 42, 74, 0.62)';

type ProfileRow = {
  full_name?: string | null;
  firstname?: string | null;
  middlename?: string | null;
  lastname?: string | null;
  contactNo?: string | null;
  role?: string | null;
};

export default function ProfileScreen() {
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Mirrors web profile page: supabase.auth.getUser() + user_accounts lookup
  useEffect(() => {
    (async () => {
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        setEmail(userData.user?.email ?? null);
        if (userData.user) {
          const { data: rows, error: profErr } = await supabase
            .from('user_accounts')
            .select('full_name, firstname, middlename, lastname, "contactNo", role')
            .eq('id', userData.user.id)
            .maybeSingle();
          if (!profErr && rows) setProfile(rows as ProfileRow);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <ScreenShell title="Profile" subtitle="Your account details">
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading profile" size="lg" />
        </View>
      </ScreenShell>
    );
  }

  const displayName =
    profile?.full_name ??
    [profile?.firstname, profile?.lastname].filter(Boolean).join(' ') ??
    email ??
    'Signed-in user';

  return (
    <ScreenShell title="Profile" subtitle="Your account details">
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.heroName}>{displayName}</Text>
        <Text style={styles.heroEmail}>{email ?? '—'}</Text>
      </View>

      <ContentCard title="Account Details" eyebrow="BawatPieza">
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Detail label="First name" value={profile?.firstname} />
        <Detail label="Middle name" value={profile?.middlename} />
        <Detail label="Last name" value={profile?.lastname} />
        <Detail label="Contact No." value={profile?.contactNo} />
        <Detail label="Role" value={profile?.role} last />
      </ContentCard>
    </ScreenShell>
  );
}

function Detail({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  return (
    <View style={[styles.detailRow, last ? styles.detailRowLast : null]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value?.trim() ? value : '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  loaderWrap: { alignItems: 'center', paddingVertical: 48 },
  hero: { alignItems: 'center', marginBottom: 18 },
  avatar: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: BUTTER, alignItems: 'center', justifyContent: 'center',
    marginBottom: 10,
  },
  avatarText: { color: PRUSSIAN, fontSize: 28, fontWeight: '900' },
  heroName: { color: PRUSSIAN, fontSize: 19, fontWeight: '900' },
  heroEmail: { color: MUTED, fontSize: 12, marginTop: 2 },
  errorText: { color: '#B91C1C', fontSize: 13, fontWeight: '700', marginBottom: 6 },
  detailRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(10, 42, 74, 0.08)',
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { color: MUTED, fontSize: 13, fontWeight: '600' },
  detailValue: { color: PRUSSIAN, fontSize: 13, fontWeight: '800', maxWidth: '55%', textAlign: 'right' },
});