import React, { useState } from 'react';
import {
  View,
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

const PRUSSIAN = '#0A2A4A';
const PRUSSIAN_SOFT = '#3B5B7A';
const MUTED = 'rgba(10, 42, 74, 0.62)';
const LINE = 'rgba(10, 42, 74, 0.12)';

export default function SignupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [company, setCompany] = useState('');

  const handleRequestAccess = () => {
    if (!fullName.trim() || !email.trim()) {
      Alert.alert('Missing information', 'Please provide your full name and email so an admin can invite you.');
      return;
    }

    Alert.alert(
      'Access request sent',
      'Your request is queued. An admin will create your BawatPieza account and send the invite link to your email.',
    );
    router.replace('/');
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#F4F4F4', '#EAF1F7', '#F4F4F4']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <View style={styles.brandMark}>
              <Ionicons name="person-add-outline" size={26} color="#F6C445" />
            </View>
            <Text style={styles.brandTitle}>Request access</Text>
            <Text style={styles.brandSubtitle}>Admin invited accounts only</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Create your profile</Text>
            <Text style={styles.subtitle}>The web backend creates and invites accounts from the admin dashboard.</Text>

            <View style={styles.inputBox}>
              <Ionicons name="person-outline" size={18} color={MUTED} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Full name"
                placeholderTextColor={MUTED}
                value={fullName}
                onChangeText={setFullName}
              />
            </View>

            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={18} color={MUTED} style={styles.inputIcon} />
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
              <Ionicons name="business-outline" size={18} color={MUTED} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Company / team"
                placeholderTextColor={MUTED}
                value={company}
                onChangeText={setCompany}
              />
            </View>

            <TouchableOpacity style={styles.primaryButton} onPress={handleRequestAccess} activeOpacity={0.9}>
              <LinearGradient
                colors={[PRUSSIAN, PRUSSIAN_SOFT]}
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
  container: { flex: 1, backgroundColor: '#F4F4F4' },
  safeArea: { flex: 1 },
  flex: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  header: { alignItems: 'center', marginBottom: 28 },
  brandMark: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: PRUSSIAN,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0A2A4A',
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    marginBottom: 14,
  },
  brandTitle: { color: PRUSSIAN, fontSize: 32, fontWeight: '800', letterSpacing: -0.8 },
  brandSubtitle: {
    marginTop: 8,
    color: MUTED,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '700',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: LINE,
    padding: 24,
    shadowColor: '#0A2A4A',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  title: { fontSize: 28, fontWeight: '800', color: PRUSSIAN, marginBottom: 8 },
  subtitle: { color: MUTED, fontSize: 14, marginBottom: 20 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: PRUSSIAN, paddingVertical: 2 },
  primaryButton: { borderRadius: 16, overflow: 'hidden', marginTop: 8 },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  footerText: { color: MUTED, fontSize: 13 },
  footerLink: { color: PRUSSIAN, fontSize: 13, fontWeight: '800', marginLeft: 4 },
});
