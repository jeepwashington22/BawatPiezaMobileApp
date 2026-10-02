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
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { fonts } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '../lib/supabase';

const PRUSSIAN = '#0A2A4A';
const PRUSSIAN_SOFT = '#345271';
const BUTTER = '#F6C445';
const MUTED = 'rgba(255, 255, 255, 0.72)';
const LINE = 'rgba(255, 255, 255, 0.12)';
const SURFACE = 'rgba(15, 23, 36, 0.72)';
const INPUT_BG = 'rgba(255, 255, 255, 0.05)';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    const trimmedEmail = email.trim();

    if (!trimmedEmail || !password) {
      setError('Email and password are required.');
      return;
    }

    const isValidEmail = /.+@.+\..+/.test(trimmedEmail);
    if (!isValidEmail) {
      setError('Enter a valid email address.');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail.toLowerCase(),
        password,
      });

      if (signInError) {
        setError(signInError.message === 'Invalid login credentials' ? 'Incorrect email or password.' : signInError.message);
        return;
      }

      setSubmitting(false);
      router.replace('/home');
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : 'Unable to sign in right now.';
      setError(message);
      Alert.alert('Login failed', message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#050A15', '#0B1628', '#0F1F33']} style={StyleSheet.absoluteFill} />

      <View pointerEvents="none" style={styles.bgOrb1} />
      <View pointerEvents="none" style={styles.bgOrb2} />
      <View pointerEvents="none" style={styles.bgOrb3} />
      <View pointerEvents="none" style={styles.grid} />

      <View pointerEvents="none" style={styles.floatIconLeft}>
        <Ionicons name="leaf-outline" size={52} color="rgba(246, 196, 69, 0.12)" />
      </View>
      <View pointerEvents="none" style={styles.floatIconTopRight}>
        <Ionicons name="flash-outline" size={46} color="rgba(255,255,255,0.08)" />
      </View>
      <View pointerEvents="none" style={styles.floatIconBottomLeft}>
        <Ionicons name="leaf-outline" size={46} color="rgba(246, 196, 69, 0.12)" />
      </View>
      <View pointerEvents="none" style={styles.floatIconBottomRight}>
        <Ionicons name="flash-outline" size={52} color="rgba(255,255,255,0.08)" />
      </View>

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.brandWrap}>
            <Image source={require('../../assets/images/LOGO3.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.brandSubtitle}>Piezo Technology - Kinetic Energy to Electricity</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your BawatPieza account to continue.</Text>

            <Text style={styles.label}>Email</Text>
            <View style={styles.inputBox}>
              <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <View style={styles.passwordHeader}>
              <Text style={styles.label}>Password</Text>
              <TouchableOpacity onPress={() => router.push('/forgot-password')}>
                <Text style={styles.linkText}>Forgot password?</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.inputBox}>
              <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color="rgba(255,255,255,0.45)" />
              </TouchableOpacity>
            </View>

            <View style={styles.rememberRow}>
              <TouchableOpacity style={styles.checkboxWrap} onPress={() => setRemember((value) => !value)} activeOpacity={0.8}>
                <View style={[styles.checkbox, remember && styles.checkboxChecked]}>
                  {remember ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
                </View>
                <Text style={styles.rememberText}>Remember me</Text>
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} activeOpacity={0.9} disabled={submitting}>
              <LinearGradient colors={[PRUSSIAN, PRUSSIAN_SOFT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButtonInner}>
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Sign in</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" style={styles.primaryButtonIcon} />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity style={styles.googleButton} activeOpacity={0.9}>
              <Ionicons name="logo-google" size={18} color="#EA4335" />
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            </TouchableOpacity>

            <View style={styles.footerRow}>
              <Text style={styles.footerText}>Don&apos;t have an account?</Text>
              <TouchableOpacity onPress={() => router.push('/signup')}>
                <Text style={styles.footerLink}>Sign up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#050A15',
  },
  safeArea: {
    flex: 1,
  },
  flex: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  bgOrb1: {
    position: 'absolute',
    top: -140,
    left: -70,
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: 'rgba(246, 196, 69, 0.18)',
  },
  bgOrb2: {
    position: 'absolute',
    bottom: -120,
    right: -80,
    width: 380,
    height: 380,
    borderRadius: 190,
    backgroundColor: 'rgba(246, 196, 69, 0.10)',
  },
  bgOrb3: {
    position: 'absolute',
    left: '50%',
    top: '28%',
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: 'rgba(168, 184, 255, 0.08)',
    transform: [{ translateX: -160 }],
  },
  grid: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.08,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  floatIconLeft: {
    position: 'absolute',
    left: '10%',
    top: '18%',
  },
  floatIconTopRight: {
    position: 'absolute',
    right: '12%',
    top: '22%',
  },
  floatIconBottomLeft: {
    position: 'absolute',
    left: '14%',
    bottom: '16%',
  },
  floatIconBottomRight: {
    position: 'absolute',
    right: '10%',
    bottom: '24%',
  },
  brandWrap: {
    alignItems: 'center',
    marginBottom: 24,
    zIndex: 1,
  },
  logo: { width: 270, height: 150, marginBottom: 2 },
  brandSubtitle: {
    marginTop: 10,
    color: MUTED,
    fontSize: 11,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    fontWeight: '700', fontFamily: fonts.bold,
    textAlign: 'center',
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: SURFACE,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: LINE,
    paddingVertical: 26,
    paddingHorizontal: 24,
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 20 },
    zIndex: 1,
  },
  title: {
    fontSize: 30,
    fontWeight: '800', fontFamily: fonts.extrabold,
    color: '#FFFFFF',
    letterSpacing: -0.8,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 20,
  },
  label: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 13,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginBottom: 8,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#FFFFFF',
    paddingVertical: 2,
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  linkText: {
    color: BUTTER,
    fontSize: 12,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  rememberRow: {
    marginTop: 2,
    marginBottom: 18,
  },
  checkboxWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  checkboxChecked: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  rememberText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  errorText: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    color: '#FCA5A5',
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  primaryButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800', fontFamily: fonts.extrabold,
    marginRight: 8,
  },
  primaryButtonIcon: {
    marginLeft: 4,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  divider: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  dividerText: {
    color: 'rgba(255,255,255,0.42)',
    fontSize: 11,
    marginHorizontal: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    paddingVertical: 14,
  },
  googleButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
    marginLeft: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  footerText: { color: MUTED, fontSize: 13 },
  footerLink: { color: BUTTER, fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold, marginLeft: 4 },
});