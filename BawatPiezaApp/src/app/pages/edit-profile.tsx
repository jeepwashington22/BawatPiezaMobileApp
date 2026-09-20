import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { ContentCard } from '../../components/content-card';
import { supabase } from '../../lib/supabase';

const MUTED = 'rgba(10, 42, 74, 0.62)';

type ProfileRow = {
  firstname?: string | null;
  middlename?: string | null;
  lastname?: string | null;
  contactNo?: string | null;
  role?: string | null;
};

export default function EditProfileScreen() {
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
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileRow | null>(null);

  // Change-password form
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwOk, setPwOk] = useState(true);

  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        setEmail(userData.user?.email ?? null);
        setAvatarUrl(userData.user?.user_metadata?.avatar_url ?? null);
        setUserId(userData.user?.id ?? null);
        if (userData.user) {
          const { data: rows } = await supabase
            .from('user_accounts')
            .select('firstname, middlename, lastname, "contactNo", role')
            .eq('id', userData.user.id)
            .maybeSingle();
          if (rows) setProfile(rows as ProfileRow);
        }
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const displayName =
    [profile?.firstname, profile?.lastname].filter(Boolean).join(' ') ||
    email ||
    'User';

  const changePassword = async () => {
    setPwMsg(null);
    if (password.length < 8) {
      setPwOk(false);
      setPwMsg('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setPwOk(false);
      setPwMsg('Passwords do not match.');
      return;
    }
    setSavingPw(true);
    try {
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;
      setPwOk(true);
      setPwMsg('Password updated successfully.');
      setPassword('');
      setConfirm('');
    } catch (e) {
      setPwOk(false);
      setPwMsg(e instanceof Error ? e.message : 'Failed to update password');
    } finally {
      setSavingPw(false);
    }
  };

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permission needed', 'Allow photo library access to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (result.canceled || !userId) return;

    setUploading(true);
    try {
      const asset = result.assets[0];
      const ext = asset.uri.split('.').pop() ?? 'jpg';
      const path = `${userId}/avatar.${ext}`;
      const res = await fetch(asset.uri);
      const blob = await res.blob();

      // Upload to the Supabase Storage "avatars" bucket (public).
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: asset.mimeType ?? 'image/jpeg', upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`; // bust cache
      const { error: metaErr } = await supabase.auth.updateUser({
        data: { avatar_url: url },
      });
      if (metaErr) throw metaErr;
      setAvatarUrl(url);
      Alert.alert('Done', 'Profile picture updated.');
    } catch (e) {
      Alert.alert(
        'Upload failed',
        e instanceof Error
          ? `${e.message} (Make sure a public "avatars" storage bucket exists in Supabase.)`
          : 'Upload failed',
      );
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading account" size="lg" />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      {/* Avatar + upload */}
      <View style={styles.hero}>
        <TouchableOpacity onPress={pickAvatar} disabled={uploading} activeOpacity={0.8}>
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.camBadge}>
            <Ionicons name={uploading ? 'hourglass-outline' : 'camera-outline'} size={14} color={PRUSSIAN} />
          </View>
        </TouchableOpacity>
        <Text style={styles.tapHint}>{uploading ? 'Uploading…' : 'Tap photo to change'}</Text>
      </View>

      {/* Info */}
      <ContentCard eyebrow="BawatPieza">
        <Detail label="First name" value={profile?.firstname} />
        <Detail label="Middle name" value={profile?.middlename} />
        <Detail label="Last name" value={profile?.lastname} />
        <Detail label="Email" value={email} />
        <Detail label="Contact No." value={profile?.contactNo} />
        <Detail label="Role" value={profile?.role} last />
      </ContentCard>

      {/* Change password */}
      <ContentCard eyebrow="Security">
        {pwMsg ? (
          <Text style={pwOk ? styles.msgOk : styles.msgErr}>{pwMsg}</Text>
        ) : null}
        <Text style={styles.label}>New password</Text>
        <View style={styles.inputBox}>
          <Ionicons name="lock-closed-outline" size={17} color={MUTED} style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder="At least 8 characters" placeholderTextColor={MUTED} secureTextEntry value={password} onChangeText={setPassword} />
        </View>
        <Text style={styles.label}>Confirm new password</Text>
        <View style={styles.inputBox}>
          <Ionicons name="lock-closed-outline" size={17} color={MUTED} style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder="Repeat new password" placeholderTextColor={MUTED} secureTextEntry value={confirm} onChangeText={setConfirm} />
        </View>
        <TouchableOpacity style={styles.saveBtn} onPress={changePassword} disabled={savingPw}>
          <Text style={styles.saveText}>{savingPw ? 'Updating…' : 'Update password'}</Text>
        </TouchableOpacity>
      </ContentCard>
    </ScreenShell>
  );
}

function Detail({ label, value, last }: { label: string; value?: string | null; last?: boolean }) {
  const { colors: c, fonts: f } = useTheme();
  const styles = makeStyles(c);
  return (
    <View style={[styles.detailRow, last ? styles.detailRowLast : null]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value?.trim() ? value : '—'}</Text>
    </View>
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
  hero: { alignItems: 'center', marginBottom: 18 },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: BUTTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: BUTTER },
  avatarText: { color: PRUSSIAN, fontSize: 36, fontWeight: '900', fontFamily: fonts.extrabold },
  camBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapHint: { color: MUTED, fontSize: 11, marginTop: 8 },
  msgOk: { color: c.ok, fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 10 },
  msgErr: { color: c.danger, fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 10 },
  label: { color: MUTED, fontSize: 12, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 6 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: c.surfaceMuted,
  },
  inputIcon: { marginRight: 8 },
  input: { flex: 1, fontSize: 14, color: PRUSSIAN },
  saveBtn: { backgroundColor: PRUSSIAN, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  saveText: { color: WHITE, fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { color: MUTED, fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold },
  detailValue: { color: PRUSSIAN, fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold, maxWidth: '55%', textAlign: 'right' },
  });
};






