import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, type Href } from 'expo-router';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { supabase } from '../../lib/supabase';
import { useTheme, fonts, type ThemeColors } from '../../theme';

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
  const styles = makeStyles(c, f);
  const PRUSSIAN = c.accent;
  const BUTTER = c.butter;
  const MUTED = c.muted;
  const LINE = c.line;
  const DANGER = c.danger;
  const WHITE = c.onAccent;
  const OK = c.ok;
  const BAD = c.danger;
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  // Photo picked in the image picker, waiting for the user to confirm in the
  // save modal before it is uploaded.
  const [pendingImage, setPendingImage] = useState<{ uri: string; mimeType?: string } | null>(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        setEmail(userData.user?.email ?? null);
        setAvatarUrl(userData.user?.user_metadata?.avatar_url ?? null);
        setUserId(userData.user?.id ?? null);
        if (userData.user) {
          const { data: rows, error: profErr } = await supabase
            .from('user_accounts')
            .select('firstname, lastname, role')
            .eq('id', userData.user.id)
            .maybeSingle();
          if (!profErr && rows) {
            setFullName(
              [rows.firstname, rows.lastname].filter(Boolean).join(' ') || null,
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

  /** Opens the device photo library; the chosen photo is previewed in the save modal. */
  const handleAvatarPress = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert('Permission needed', 'Allow photo library access to set a profile picture.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      setPendingImage({ uri: asset.uri, mimeType: asset.mimeType });
    } catch {
      Alert.alert('Error', 'Could not open the photo library. Please try again.');
    }
  };

  /** Uploads the confirmed photo to the "avatars" bucket and links it to the account. */
  const handleAvatarSave = async () => {
    if (!pendingImage || !userId) return;
    setUploadingAvatar(true);
    try {
      const ext = pendingImage.uri.split('.').pop()?.split('?')[0] ?? 'jpg';
      const path = `${userId}/avatar.${ext}`;
      const res = await fetch(pendingImage.uri);
      const blob = await res.blob();
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { contentType: pendingImage.mimeType ?? 'image/jpeg', upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const url = `${pub.publicUrl}?t=${Date.now()}`; // bust cache
      const { error: metaErr } = await supabase.auth.updateUser({ data: { avatar_url: url } });
      if (metaErr) throw metaErr;
      setAvatarUrl(url);
      setPendingImage(null);
      Alert.alert('Done', 'Profile picture updated.');
    } catch (e) {
      Alert.alert(
        'Upload failed',
        e instanceof Error
          ? `${e.message} (Make sure a public "avatars" storage bucket exists in Supabase.)`
          : 'Upload failed',
      );
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleAvatarCancel = () => {
    if (!uploadingAvatar) setPendingImage(null);
  };

  const handleLogoutConfirm = async () => {
    try {
      // Clear the Supabase session completely
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // Clear any cached user data
      setShowLogoutModal(false);
      
      // Redirect to login screen
      router.replace('/');
    } catch (error) {
      Alert.alert('Error', 'Could not sign out. Please try again.');
      setShowLogoutModal(false);
    }
  };

  const handleLogoutCancel = () => {
    setShowLogoutModal(false);
  };

  if (loading) {
    return (
      <ScreenShell title="Profile" showBack>
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading profile" size="lg" />
        </View>
      </ScreenShell>
    );
  }

  const displayName = fullName ?? email ?? 'Signed-in user';

  return (
    <ScreenShell title="Profile" showBack>
      {/* Hero */}
      <View style={styles.hero}>
        <Pressable
          onPress={handleAvatarPress}
          disabled={uploadingAvatar}
          style={({ pressed }) => [pressed && !uploadingAvatar && { opacity: 0.7 }]}
          accessibilityRole="button"
          accessibilityLabel="Change profile picture"
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{displayName.charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <View style={styles.camBadge}>
            <Ionicons
              name={uploadingAvatar ? 'hourglass-outline' : 'camera-outline'}
              size={14}
              color={PRUSSIAN}
            />
          </View>
        </Pressable>
        <Text style={styles.tapHint}>{uploadingAvatar ? 'Uploading…' : 'Tap photo to change'}</Text>
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

      {/* Logout button */}
      <Pressable 
        style={({ pressed }) => [styles.logoutBtn, pressed && { opacity: 0.7 }]}
        onPress={() => setShowLogoutModal(true)}
        accessibilityRole="button"
        accessibilityLabel="Log out"
      >
        <Ionicons name="log-out-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>

      {/* Logout Confirmation Modal */}
      <Modal
        visible={showLogoutModal}
        transparent
        animationType="fade"
        onRequestClose={handleLogoutCancel}
      >
        <View style={[styles.modalOverlay, { backgroundColor: 'rgba(0, 0, 0, 0.5)' }]}>
          <View style={[styles.modalContent, { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 5 }]}>
            <Text style={[styles.modalTitle, { color: PRUSSIAN, fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' }]}>Log out</Text>
            <Text style={[styles.modalText, { color: MUTED, fontSize: 14, lineHeight: 20, marginBottom: 20, textAlign: 'center' }]}>
              Are you sure you want to sign out of your account?
            </Text>
            <View style={[styles.modalButtons, { flexDirection: 'row', gap: 12 }]}>
              <Pressable 
                onPress={handleLogoutCancel}
                style={({ pressed }) => [styles.cancelButton, { backgroundColor: c.surface, borderColor: LINE, borderWidth: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.cancelText, { color: c.text, fontSize: 14, fontWeight: '600' }]}>Cancel</Text>
              </Pressable>
              <Pressable 
                onPress={handleLogoutConfirm}
                style={({ pressed }) => [styles.confirmButton, { backgroundColor: DANGER, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.confirmText, { color: '#FFFFFF', fontSize: 14, fontWeight: '600' }]}>Log out</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Save-photo modal */}
      <Modal
        visible={pendingImage !== null}
        transparent
        animationType="fade"
        onRequestClose={handleAvatarCancel}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={[styles.modalTitle, { color: PRUSSIAN }]}>Save profile picture?</Text>
            <View style={styles.modalPreviewWrap}>
              {pendingImage ? (
                <Image source={{ uri: pendingImage.uri }} style={styles.modalPreview} />
              ) : null}
              {uploadingAvatar ? (
                <View style={styles.modalPreviewBusy}>
                  <ActivityIndicator color={PRUSSIAN} size="large" />
                </View>
              ) : null}
            </View>
            <Text style={[styles.modalText, { color: MUTED }]}>
              {uploadingAvatar ? 'Uploading your photo…' : 'This will replace your current profile picture.'}
            </Text>
            <View style={styles.modalButtons}>
              <Pressable
                onPress={handleAvatarCancel}
                disabled={uploadingAvatar}
                style={({ pressed }) => [
                  styles.cancelButton,
                  pressed && !uploadingAvatar && { opacity: 0.7 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Cancel profile picture change"
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={handleAvatarSave}
                disabled={uploadingAvatar}
                style={({ pressed }) => [
                  styles.saveButton,
                  pressed && !uploadingAvatar && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Save profile picture"
              >
                {uploadingAvatar ? (
                  <ActivityIndicator color={WHITE} size="small" />
                ) : (
                  <Text style={styles.saveText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScreenShell>
  );
}

const makeStyles = (c: ThemeColors, f: any) => {
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
  avatarText: { color: PRUSSIAN, fontSize: 32, fontWeight: '900', fontFamily: f.extrabold },
  camBadge: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: 'rgba(10,42,74,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tapHint: { color: MUTED, fontSize: 11, marginTop: 8 },
  heroName: { color: PRUSSIAN, fontSize: 19, fontWeight: '900', fontFamily: f.extrabold },
  heroEmail: { color: MUTED, fontSize: 12, marginTop: 2 },
  roleChip: {
    backgroundColor: 'rgba(246, 196, 69, 0.28)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 6,
  },
  roleChipText: { color: PRUSSIAN, fontSize: 11, fontWeight: '800', fontFamily: f.extrabold, textTransform: 'capitalize' },
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
  hubLabel: { color: PRUSSIAN, fontSize: 15, fontWeight: '800', fontFamily: f.extrabold },
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
  logoutText: { color: WHITE, fontSize: 14, fontWeight: '800', fontFamily: f.extrabold },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#FFFFFF',
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
    marginBottom: 8,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
    textAlign: 'center',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#0A2A4A',
    alignItems: 'center',
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0A2A4A',
  },
  confirmButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: '#EA4335',
    alignItems: 'center',
  },
  confirmText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  /* Save-photo modal */
  modalPreviewWrap: {
    alignSelf: 'center',
    marginBottom: 22,
  },
  modalPreview: {
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 3,
    borderColor: BUTTER,
    backgroundColor: c.surfaceMuted,
  },
  modalPreviewBusy: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 62,
    backgroundColor: 'rgba(255,255,255,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: PRUSSIAN,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  saveText: {
    fontSize: 14,
    fontWeight: '800',
    fontFamily: f.extrabold,
    color: WHITE,
  },
});
};




