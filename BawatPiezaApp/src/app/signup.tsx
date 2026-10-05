import React, { useState } from 'react';
import {
  View,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { fonts } from '../theme';

const ORANGE = '#F97316';
const ORANGE_DARK = '#C2410C';
const MUTED = 'rgba(255, 255, 255, 0.68)';
const LINE = 'rgba(255, 255, 255, 0.14)';

export default function SignupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState<'staff' | 'admin'>('staff');

  const handleRequestAccess = () => {
    if (!fullName.trim() || !email.trim()) {
      Alert.alert('Missing information', 'Please provide your full name and email so an admin can invite you.');
      return;
    }

    Alert.alert(
      'Access request sent',
      `Your ${role === 'admin' ? 'administrator' : 'staff'} request is queued. An admin will create your BawatPieza account and send the invite link to your email.`,
    );
    router.replace('/');
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#8F350E', '#2A0D06', '#120705']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <Image source={require('../../assets/images/LOGO3.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.welcomeText}>Welcome</Text>
            <Text style={styles.brandTitle}>Sign Up</Text>
            <Text style={styles.brandSubtitle}>Let&apos;s create your account</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.inputBox}>
              <Ionicons name="person-outline" size={17} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Full name"
                placeholderTextColor={MUTED}
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={17} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Work email"
                placeholderTextColor={MUTED}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.inputBox}>
              <Ionicons name="business-outline" size={17} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Company / team"
                placeholderTextColor={MUTED}
                value={company}
                onChangeText={setCompany}
              />
            </View>

            <Text style={styles.roleLabel}>Account role</Text>
            <View style={styles.roleRow}>
              {(['staff', 'admin'] as const).map((item) => (
                <TouchableOpacity
                  key={item}
                  onPress={() => setRole(item)}
                  style={[styles.roleButton, role === item && styles.roleButtonActive]}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={item === 'admin' ? 'shield-checkmark-outline' : 'person-outline'}
                    size={16}
                    color={role === item ? '#FFFFFF' : MUTED}
                  />
                  <Text style={[styles.roleButtonText, role === item && styles.roleButtonTextActive]}>
                    {item === 'admin' ? 'Administrator' : 'Staff'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={handleRequestAccess} activeOpacity={0.9}>
              <LinearGradient
                colors={[ORANGE, ORANGE_DARK]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButtonInner}
              >
                <Text style={styles.primaryButtonText}>Request Invite</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already registered?</Text>
            <TouchableOpacity onPress={() => router.replace('/')}>
              <Text style={styles.footerLink}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#120705' },
  safeArea: { flex: 1 },
  flex: {
    flex: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 24,
  },
  header: { width: '100%', alignItems: 'center', paddingTop: 18, paddingBottom: 14 },
  logo: { width: 190, height: 104, marginBottom: 1 },
  welcomeText: { color: 'rgba(255,255,255,0.62)', fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase', fontFamily: fonts.bold, marginTop: 1 },
  brandTitle: { color: '#FFFFFF', fontSize: 25, lineHeight: 30, fontFamily: fonts.extrabold, marginTop: 2 },
  brandSubtitle: {
    marginTop: 4,
    color: MUTED,
    fontSize: 10,
    fontFamily: fonts.medium,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 4,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: '#FFFFFF', paddingVertical: 2 },
  roleLabel: { color: 'rgba(255,255,255,0.82)', fontSize: 11, fontWeight: '800', fontFamily: fonts.bold, marginBottom: 7 },
  roleRow: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  roleButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 42, borderRadius: 7, borderWidth: 1, borderColor: LINE, backgroundColor: 'rgba(255,255,255,0.06)' },
  roleButtonActive: { backgroundColor: ORANGE_DARK, borderColor: ORANGE },
  roleButtonText: { color: MUTED, fontSize: 11, fontWeight: '800', fontFamily: fonts.bold },
  roleButtonTextActive: { color: '#FFFFFF' },
  primaryButton: { borderRadius: 7, overflow: 'hidden', marginTop: 8 },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  footerText: { color: MUTED, fontSize: 11 },
  footerLink: { color: '#F6C445', fontSize: 11, fontWeight: '800', fontFamily: fonts.extrabold, marginLeft: 4 },
});

