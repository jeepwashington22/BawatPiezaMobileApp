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
import { isGoogleSignInCancelled, signInWithGoogle, supabase } from '../lib/supabase';

const ORANGE = '#F97316';
const ORANGE_DARK = '#C2410C';
const BUTTER = '#F6C445';
const MUTED = 'rgba(255, 255, 255, 0.72)';
const LINE = 'rgba(255, 255, 255, 0.12)';

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
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

  const handleGoogleLogin = async () => {
    setGoogleSubmitting(true);
    setError(null);
    try {
      await signInWithGoogle();
      router.replace('/provisioning');
    } catch (authError) {
      if (!isGoogleSignInCancelled(authError)) {
        const message = authError instanceof Error ? authError.message : 'Unable to sign in with Google right now.';
        setError(message);
        Alert.alert('Google sign-in failed', message);
      }
    } finally {
      setGoogleSubmitting(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#8F350E', '#2A0D06', '#120705']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.brandWrap}>
            <Image source={require('../../assets/images/LOGO3.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.welcomeText}>Welcome back</Text>
            <Text style={styles.heroTitle}>Sign In</Text>
            <Text style={styles.heroSubtitle}>Access your BawatPieza account</Text>
          </View>

          <View style={styles.card}>
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

            <Text style={styles.label}>Password</Text>
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
              <TouchableOpacity onPress={() => router.push('/forgot-password')}>
                <Text style={styles.linkText}>Forgot password?</Text>
              </TouchableOpacity>
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity style={styles.primaryButton} onPress={handleLogin} activeOpacity={0.9} disabled={submitting}>
              <LinearGradient colors={[ORANGE, ORANGE_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButtonInner}>
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

            <TouchableOpacity style={styles.googleButton} activeOpacity={0.9} onPress={handleGoogleLogin} disabled={googleSubmitting || submitting}>
              {googleSubmitting ? (
                <ActivityIndicator size="small" color="#EA4335" />
              ) : (
                <Ionicons name="logo-google" size={18} color="#EA4335" />
              )}
              <Text style={styles.googleButtonText}>{googleSubmitting ? 'Connecting to Google...' : 'Continue with Google'}</Text>
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
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 0,
    paddingBottom: 24,
  },
  brandWrap: {
    width: '100%',
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 14,
    zIndex: 1,
  },
  logo: { width: 190, height: 170, marginBottom: 1 },
  welcomeText: { color: 'rgba(255,255,255,0.62)', fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase', fontFamily: fonts.bold, marginTop: 1 },
  heroTitle: { color: '#FFFFFF', fontSize: 25, lineHeight: 30, fontFamily: fonts.extrabold, marginTop: 2 },
  heroSubtitle: { color: 'rgba(255,255,255,0.68)', fontSize: 10, fontFamily: fonts.medium, marginTop: 4 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 4,
    zIndex: 1,
  },
  label: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 11,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.075)',
    borderRadius: 5,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 14,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    paddingVertical: 2,
  },
  linkText: {
    color: BUTTER,
    fontSize: 10,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 1,
    marginBottom: 16,
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
    fontSize: 11,
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
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: 18,
  },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
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
    borderRadius: 7,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(255,255,255,0.075)',
    paddingVertical: 14,
  },
  googleButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700', fontFamily: fonts.bold,
    marginLeft: 10,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
  },
  footerText: { color: MUTED, fontSize: 11 },
  footerLink: { color: BUTTER, fontSize: 11, fontWeight: '800', fontFamily: fonts.extrabold, marginLeft: 4 },
});