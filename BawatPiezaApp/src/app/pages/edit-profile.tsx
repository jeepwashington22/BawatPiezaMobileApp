import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, TextInput, TouchableOpacity, View } from 'react-native';
import { AppText as Text } from '../../components/app-text';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { ContentCard } from '../../components/content-card';
import { supabase } from '../../lib/supabase';
import {
  describeAuthError,
  PASSWORD_MIN_LENGTH,
  validateContactNumber,
  validateNamePart,
  validateNewPassword,
} from '../../lib/validation';

const MUTED = 'rgba(10, 42, 74, 0.62)';

type ProfileRow = {
  firstname?: string | null;
  middlename?: string | null;
  lastname?: string | null;
  contactNo?: string | null;
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
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);

  // Change-password form
  const [currentPassword, setCurrentPassword] = useState('');
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
            .select('firstname, middlename, lastname, "contactNo"')
            .eq('id', userData.user.id)
            .maybeSingle();
          if (rows) {
            const loaded = rows as ProfileRow;
            setProfile(loaded);
            setFirstName(loaded.firstname ?? '');
            setMiddleName(loaded.middlename ?? '');
            setLastName(loaded.lastname ?? '');
            setContactNumber(loaded.contactNo ?? '');
          }
        }
      } catch (e) {
        Alert.alert('Error', e instanceof Error ? e.message : 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const displayName =
    [firstName || profile?.firstname, lastName || profile?.lastname].filter(Boolean).join(' ') ||
    email ||
    'User';
  const passwordReady = Boolean(currentPassword) && !validateNewPassword(password, confirm);

  const saveProfile = async () => {
    setProfileMsg(null);
    const firstError = validateNamePart(firstName, 'First name');
    const lastError = validateNamePart(lastName, 'Last name');
    const contactError = validateContactNumber(contactNumber);
    if (firstError || lastError || contactError) {
      setProfileMsg(firstError || lastError || contactError);
      return;
    }
    if (!userId) {
      setProfileMsg('Your account could not be identified. Please sign in again.');
      return;
    }
    setSavingProfile(true);
    try {
      const { data: updatedProfile, error } = await supabase
        .from('user_accounts')
        .update({
          firstname: firstName.trim(),
          middlename: middleName.trim() || null,
          lastname: lastName.trim(),
          contactNo: contactNumber.trim(),
        })
        .eq('id', userId)
        .select('firstname, middlename, lastname, "contactNo"')
        .maybeSingle();
      if (error) throw error;
      if (!updatedProfile) {
        throw new Error('Profile changes were not saved. Please check your account permissions and try again.');
      }
      const saved = updatedProfile as ProfileRow;
      setProfile(saved);
      setFirstName(saved.firstname ?? '');
      setMiddleName(saved.middlename ?? '');
      setLastName(saved.lastname ?? '');
      setContactNumber(saved.contactNo ?? '');
      setProfileMsg('Profile changes saved successfully.');
    } catch (error) {
      setProfileMsg(error instanceof Error ? error.message : 'Could not save profile changes.');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async () => {
    setPwMsg(null);
    if (!currentPassword) {
      setPwOk(false);
      setPwMsg('Enter your current password before choosing a new one.');
      return;
    }
    const validationError = validateNewPassword(password, confirm);
    if (validationError) {
      setPwOk(false);
      setPwMsg(validationError);
      return;
    }
    setSavingPw(true);
    try {
      if (!email) throw new Error('Your email address is unavailable. Please sign in again.');
      const { error: verifyErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword,
      });
      if (verifyErr) throw verifyErr;
      const { error: updErr } = await supabase.auth.updateUser({ password });
      if (updErr) throw updErr;
      setPwOk(true);
      setPwMsg('Password updated successfully.');
      setCurrentPassword('');
      setPassword('');
      setConfirm('');
    } catch (e) {
      setPwOk(false);
      setPwMsg(describeAuthError(e instanceof Error ? { message: e.message } : null, 'password'));
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

  return (
    <ScreenShell title="Edit Profile" showBack>
      {loading ? (
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading account" size="md" />
        </View>
      ) : null}
      {/* Avatar + upload */}
      <View style={styles.heroCard}>
        <View style={styles.heroAccent} />
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
              <Ionicons name={uploading ? 'hourglass-outline' : 'camera-outline'} size={12} color={PRUSSIAN} />
            </View>
          </TouchableOpacity>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>ACCOUNT SETTINGS</Text>
            <Text numberOfLines={1} style={styles.heroName}>{displayName}</Text>
            <Text numberOfLines={1} style={styles.heroEmail}>{email ?? 'Manage your profile'}</Text>
            <Text style={styles.tapHint}>{uploading ? 'Uploading…' : 'Tap photo to change'}</Text>
          </View>
        </View>
      </View>

      {/* Info */}
      <ContentCard style={styles.sectionCard} eyebrow="Personal details" title="Profile information">
        {profileMsg ? <Text style={profileMsg.includes('successfully') ? styles.msgOk : styles.msgErr}>{profileMsg}</Text> : null}
        <EditableField label="First name" value={firstName} onChangeText={setFirstName} styles={styles} />
        <EditableField label="Middle name" value={middleName} onChangeText={setMiddleName} styles={styles} />
        <EditableField label="Last name" value={lastName} onChangeText={setLastName} styles={styles} />
        <Detail label="Email" value={email} />
        <EditableField
          label="Contact No."
          value={contactNumber}
          onChangeText={(value) => setContactNumber(value.replace(/[^\d+]/g, '').slice(0, 13))}
          keyboardType="phone-pad"
          styles={styles}
        />
        <TouchableOpacity
          style={[styles.profileSaveBtn, savingProfile && styles.saveBtnDisabled]}
          onPress={saveProfile}
          disabled={savingProfile}
        >
          <Ionicons name={savingProfile ? 'hourglass-outline' : 'checkmark-circle-outline'} size={16} color={WHITE} />
          <Text style={styles.saveText}>{savingProfile ? 'Saving changes…' : 'Save profile changes'}</Text>
        </TouchableOpacity>
      </ContentCard>

      {/* Change password */}
      <ContentCard style={styles.sectionCard} eyebrow="Security" title="Change password">
        <Text style={styles.securityIntro}>Verify your current password, then create a stronger one.</Text>
        {pwMsg ? (
          <Text style={pwOk ? styles.msgOk : styles.msgErr}>{pwMsg}</Text>
        ) : null}
        <Text style={styles.label}>Current password</Text>
        <View style={styles.inputBox}>
          <Ionicons name="key-outline" size={17} color={MUTED} style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder="Enter current password" placeholderTextColor={MUTED} secureTextEntry value={currentPassword} onChangeText={setCurrentPassword} />
        </View>
        <Text style={styles.label}>New password</Text>
        <View style={styles.inputBox}>
          <Ionicons name="lock-closed-outline" size={17} color={MUTED} style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder={`At least ${PASSWORD_MIN_LENGTH} characters`} placeholderTextColor={MUTED} secureTextEntry value={password} onChangeText={setPassword} />
        </View>
        <View style={styles.passwordChecklist}>
          {[
            [`At least ${PASSWORD_MIN_LENGTH} characters`, password.length >= PASSWORD_MIN_LENGTH],
            ['Uppercase letter', /[A-Z]/.test(password)],
            ['Lowercase letter', /[a-z]/.test(password)],
            ['Number', /\d/.test(password)],
            ['Special character', /[^A-Za-z0-9]/.test(password)],
          ].map(([label, met]) => (
            <View key={String(label)} style={styles.checkRow}>
              <Ionicons name={met ? 'checkmark-circle' : 'ellipse-outline'} size={14} color={met ? OK : MUTED} />
              <Text style={[styles.checkText, met && styles.checkTextMet]}>{String(label)}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.label}>Confirm new password</Text>
        <View style={styles.inputBox}>
          <Ionicons name="lock-closed-outline" size={17} color={MUTED} style={styles.inputIcon} />
          <TextInput style={styles.input} placeholder="Repeat new password" placeholderTextColor={MUTED} secureTextEntry value={confirm} onChangeText={setConfirm} />
        </View>
        {confirm.length > 0 && (
          <Text style={password === confirm ? styles.matchOk : styles.matchErr}>
            {password === confirm ? 'Passwords match' : 'Passwords do not match'}
          </Text>
        )}
        <TouchableOpacity
          style={[styles.saveBtn, !passwordReady && styles.saveBtnDisabled]}
          onPress={changePassword}
          disabled={savingPw || !passwordReady}
          accessibilityRole="button"
          accessibilityLabel="Update password"
        >
          <Text style={styles.saveText}>{savingPw ? 'Updating…' : 'Update password'}</Text>
        </TouchableOpacity>
      </ContentCard>
    </ScreenShell>
  );
}

function EditableField({
  label,
  value,
  onChangeText,
  keyboardType,
  styles,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  keyboardType?: 'default' | 'phone-pad';
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.editField}>
      <Text style={styles.editFieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        style={styles.editInput}
        keyboardType={keyboardType}
        placeholder={`Enter ${label.toLowerCase()}`}
        placeholderTextColor={styles.placeholder.color}
        autoCapitalize={label === 'Contact No.' ? 'none' : 'words'}
      />
    </View>
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
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionCard: { borderRadius: 13, padding: 11, marginBottom: 9 },
  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 15,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: LINE,
    marginBottom: 10,
  },
  heroAccent: { height: 3, backgroundColor: PRUSSIAN },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: BUTTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: { width: 70, height: 70, borderRadius: 35, borderWidth: 2, borderColor: BUTTER },
  avatarText: { color: PRUSSIAN, fontSize: 27, fontWeight: '900', fontFamily: fonts.extrabold },
  camBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 23,
    height: 23,
    borderRadius: 12,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: LINE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: { flex: 1, minWidth: 0 },
  tapHint: { color: MUTED, fontSize: 9, marginTop: 4 },
  heroEyebrow: { color: PRUSSIAN, fontSize: 8, letterSpacing: 1.4, fontFamily: fonts.extrabold },
  heroName: { color: PRUSSIAN, fontSize: 17, fontFamily: fonts.extrabold, marginTop: 1 },
  heroEmail: { color: MUTED, fontSize: 9, fontFamily: fonts.medium, marginTop: 1 },
  msgOk: { color: c.ok, fontSize: 10, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 7 },
  msgErr: { color: c.danger, fontSize: 10, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 7 },
  securityIntro: { color: MUTED, fontSize: 9, lineHeight: 13, fontFamily: fonts.medium, marginBottom: 8 },
  label: { color: MUTED, fontSize: 10, fontWeight: '700', fontFamily: fonts.bold, marginBottom: 4 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: LINE,
    borderRadius: 9,
    paddingHorizontal: 9,
    paddingVertical: 7,
    marginBottom: 8,
    backgroundColor: c.surfaceMuted,
  },
  inputIcon: { marginRight: 6 },
  input: { flex: 1, fontSize: 12, color: PRUSSIAN },
  passwordChecklist: {
    backgroundColor: c.surfaceMuted,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginTop: -4,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: LINE,
  },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginVertical: 1 },
  checkText: { color: MUTED, fontSize: 9, fontFamily: fonts.medium },
  checkTextMet: { color: c.ok, fontFamily: fonts.semibold },
  matchOk: { color: c.ok, fontSize: 9, fontFamily: fonts.bold, marginTop: -5, marginBottom: 7 },
  matchErr: { color: DANGER, fontSize: 9, fontFamily: fonts.bold, marginTop: -5, marginBottom: 7 },
  saveBtn: { backgroundColor: PRUSSIAN, borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.45 },
  saveText: { color: WHITE, fontSize: 11, fontWeight: '800', fontFamily: fonts.extrabold },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { color: MUTED, fontSize: 11, fontWeight: '600', fontFamily: fonts.semibold },
  detailValue: { color: PRUSSIAN, fontSize: 11, fontWeight: '800', fontFamily: fonts.extrabold, maxWidth: '55%', textAlign: 'right' },
  editField: {
    backgroundColor: c.surfaceMuted,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: LINE,
    marginBottom: 6,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  editFieldLabel: {
    color: MUTED,
    fontSize: 9,
    fontFamily: fonts.bold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  editInput: {
    color: PRUSSIAN,
    fontSize: 12,
    fontFamily: fonts.semibold,
    paddingVertical: 3,
  },
  placeholder: { color: MUTED },
  profileSaveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    backgroundColor: PRUSSIAN,
    borderRadius: 9,
    paddingVertical: 9,
    marginTop: 10,
  },
  });
};
