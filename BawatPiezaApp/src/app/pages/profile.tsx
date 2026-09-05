import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useEffect, useState } from 'react';
import { Alert, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { supabase } from '../../lib/supabase';

const MUTED = 'rgba(10, 42, 74, 0.62)';
const LINE = 'rgba(10, 42, 74, 0.1)';

type IconName = keyof typeof Ionicons.glyphMap;

type HubButton = {
  icon: IconName;
  label: string;
  sub: string;
  href: Href;
  accent?: string;
};

const BUTTONS: HubButton[] = [
  { icon: 'person-circle-outline', label: 'My Account', sub: 'Info, photo & password', href: '/pages/edit-profile', accent: '#0A2A4A' },
  { icon: 'options-outline', label: 'Preferences', sub: 'Notifications & sync', href: '/pages/preferences', accent: '#0A2A4A' },
  { icon: 'hardware-chip-outline', label: 'Device', sub: 'Hardware & diagnostics', href: '/pages/device', accent: '#0A2A4A' },
  { icon: 'people-outline', label: 'Shared Users', sub: 'Team members & invites', href: '/pages/accounts', accent: '#0A2A4A' },
  { icon: 'information-circle-outline', label: 'About Pieza', sub: 'App version & credits', href: '/pages/about', accent: '#0A2A4A' },
];

export default function ProfileScreen() {
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
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        setEmail(userData.user?.email ?? null);
        setAvatarUrl(userData.user?.user_metadata?.avatar_url ?? null);
        if (userData.user) {
          const { data: rows, error: profErr } = await supabase
            .from('user_accounts')
            .select('full_name, firstname, lastname, role')
            .eq('id', userData.user.id)
            .maybeSingle();
          if (!profErr && rows) {
            setFullName(
              rows.full_name ??
                [rows.firstname, rows.lastname].filter(Boolean).join(' ') ??
                null,
            );
            setRole(rows.role ?? null);
          }
        }
      } catch {
        // Non-fatal — hero falls back to placeholders.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleLogout = () => {
    Alert.alert('Log out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log out',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/');
        },
      },
    ]);
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading profile" size="lg" />
        </View>
      </ScreenShell>
    );
  }

  const displayName = fullName ?? email ?? 'Signed-in user';

  return (
    <ScreenShell>
      {/* Hero */}
      <View style={styles.hero}>
        {avatarUrl ? (
          <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
          </View>
        )}
        <Text style={styles.heroName}>{displayName}</Text>
        <Text style={styles.heroEmail}>{email ?? '—'}</Text>
        {role ? (
          <View style={styles.roleChip}>
            <Text style={styles.roleChipText}>{role}</Text>
          </View>
        ) : null}
      </View>

      {/* Button navigation */}
      {BUTTONS.map((b) => (
        <Pressable
          key={b.label}
          onPress={() => router.push(b.href)}
          style={({ pressed }) => [styles.hubBtn, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel={b.label}
        >
          <View style={styles.hubIcon}>
            <Ionicons name={b.icon} size={20} color={b.accent ?? PRUSSIAN} />
          </View>
          <View style={styles.hubText}>
            <Text style={styles.hubLabel}>{b.label}</Text>
            <Text style={styles.hubSub}>{b.sub}</Text>
          </View>
          <Ionicons name="chevron-forward" size={17} color={MUTED} />
        </Pressable>
      ))}

      {/* Logout */}
      <Pressable style={styles.logoutBtn} onPress={handleLogout}>
        <Ionicons name="log-out-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
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
  hero: { alignItems: 'center', marginBottom: 20 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: BUTTER,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  avatarImage: {
    width: 84,
    height: 84,
    borderRadius: 42,
    marginBottom: 10,
    borderWidth: 2,
    borderColor: BUTTER,
  },
  avatarText: { color: PRUSSIAN, fontSize: 32, fontWeight: '900', fontFamily: fonts.extrabold },
  heroName: { color: PRUSSIAN, fontSize: 19, fontWeight: '900', fontFamily: fonts.extrabold },
  heroEmail: { color: MUTED, fontSize: 12, marginTop: 2 },
  roleChip: {
    backgroundColor: 'rgba(246, 196, 69, 0.28)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 6,
  },
  roleChipText: { color: PRUSSIAN, fontSize: 11, fontWeight: '800', fontFamily: fonts.extrabold, textTransform: 'capitalize' },
  hubBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
    padding: 14,
    marginBottom: 10,
  },
  hubIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: 'rgba(246, 196, 69, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  hubText: { flex: 1 },
  hubLabel: { color: PRUSSIAN, fontSize: 15, fontWeight: '800', fontFamily: fonts.extrabold },
  hubSub: { color: MUTED, fontSize: 11, marginTop: 1 },
  logoutBtn: {
    backgroundColor: DANGER,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  logoutText: { color: WHITE, fontSize: 14, fontWeight: '800', fontFamily: fonts.extrabold },
  });
};




