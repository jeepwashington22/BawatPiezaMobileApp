import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { AppText as Text } from '../components/app-text';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { fonts } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import {
  isGoogleOnboardingRequired,
  isGoogleSignInCancelled,
  isGoogleSignInInProgress,
  sendWelcomeEmailIfNew,
  signInWithGoogle,
  supabase,
} from '../lib/supabase';
import { useAuth } from '../hooks/use-auth';
import { apiFetch } from '../lib/api';

const ORANGE = '#F97316';
const ORANGE_DARK = '#EA580C';
const ACCENT = '#F59E0B';
const TEXT_PRIMARY = '#0F172A';
const TEXT_SECONDARY = '#64748B';
const BORDER = '#E2E8F0';

export default function LoginScreen() {
  const router = useRouter();
  const { ready, isLoggedIn, user } = useAuth();
  const { email: emailParam } = useLocalSearchParams<{ email?: string | string[] }>();
  const [email, setEmail] = useState('');
  const [prefilledEmail, setPrefilledEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<string | null>(null);
  const [twoFactorDigits, setTwoFactorDigits] = useState<string[]>(['', '', '', '', '', '']);
  const twoFactorOtp = twoFactorDigits.join('');
  const twoFactorInputs = useRef<(TextInput | null)[]>([]);
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [twoFactorMessage, setTwoFactorMessage] = useState('');

  useEffect(() => {
    if (!ready || !isLoggedIn || isGoogleSignInInProgress()) return;
    router.replace(isGoogleOnboardingRequired(user) ? '/google-onboarding' : '/home');
  }, [ready, isLoggedIn, router, user]);

  useEffect(() => {
    const incoming = Array.isArray(emailParam) ? emailParam[0] : emailParam;
    const value = (incoming ?? '').trim().toLowerCase();
    if (!value || value === prefilledEmail) return;
    const timer = setTimeout(() => {
      setEmail(value);
      setPrefilledEmail(value);
    }, 0);
    return () => clearTimeout(timer);
  }, [emailParam, prefilledEmail]);
  const notice = prefilledEmail
    ? `Your email for ${prefilledEmail} is verified. Sign in with your credentials.`
    : null;

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
      const response = await apiFetch('/accounts/2fa/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail.toLowerCase(), password }),
      });

      const result = (await response.json()) as {
        message?: string;
        error?: string;
        requiresTwoFactor?: boolean;
        challengeId?: string;
        session?: { access_token: string; refresh_token: string };
      };
      if (!response.ok) throw new Error(result.error ?? result.message ?? 'Unable to sign in right now.');

      if (result.requiresTwoFactor && result.challengeId) {
        setTwoFactorChallenge(result.challengeId);
        setTwoFactorMessage(result.message ?? 'A verification code was sent to your email.');
        setTwoFactorDigits(['', '', '', '', '', '']);
        requestAnimationFrame(() => twoFactorInputs.current[0]?.focus());
        return;
      }

      if (!result.session) throw new Error('The sign-in service returned an incomplete session.');
      const { error: sessionError } = await supabase.auth.setSession(result.session);
      if (sessionError) throw sessionError;
      void sendWelcomeEmailIfNew();

      setSubmitting(false);
      router.replace('/home');
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : 'Unable to sign in right now.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleTwoFactorDigit = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '');
    setTwoFactorDigits((previous) => {
      const next = [...previous];
      if (digits.length > 1) {
        digits.slice(0, 6 - index).split('').forEach((digit, offset) => {
          next[index + offset] = digit;
        });
      } else {
        next[index] = digits;
      }
      return next;
    });

    if (digits.length > 1) {
      const focusIndex = Math.min(index + digits.length, 5);
      requestAnimationFrame(() => twoFactorInputs.current[focusIndex]?.focus());
    } else if (digits && index < 5) {
      requestAnimationFrame(() => twoFactorInputs.current[index + 1]?.focus());
    }
  };

  const handleTwoFactorKeyPress = (index: number, key: string) => {
    if (key !== 'Backspace') return;
    if (twoFactorDigits[index]) {
      setTwoFactorDigits((previous) => {
        const next = [...previous];
        next[index] = '';
        return next;
      });
      return;
    }
    if (index > 0) {
      twoFactorInputs.current[index - 1]?.focus();
      setTwoFactorDigits((previous) => {
        const next = [...previous];
        next[index - 1] = '';
        return next;
      });
    }
  };

  const verifyTwoFactor = async () => {
    if (!twoFactorChallenge || !/^\d{6}$/.test(twoFactorOtp)) {
      setError('Enter the 6-digit code sent to your email.');
      return;
    }
    setTwoFactorBusy(true);
    setError(null);
    try {
      const response = await apiFetch('/accounts/2fa/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId: twoFactorChallenge, otp: twoFactorOtp }),
      });
      const result = (await response.json()) as {
        message?: string;
        error?: string;
        session?: { access_token: string; refresh_token: string };
      };

      if (!response.ok || !result.session) throw new Error(result.error ?? result.message ?? 'Unable to verify the code.');
      const { error: sessionError } = await supabase.auth.setSession(result.session);
      if (sessionError) throw sessionError;
      void sendWelcomeEmailIfNew();
      setTwoFactorChallenge(null);
      router.replace('/home');
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : 'Unable to verify the code.');
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleGoogleLogin = async () => {
    setGoogleSubmitting(true);
    setError(null);
    try {
      const result = await signInWithGoogle();
      router.replace(result.isNewUser ? '/google-onboarding' : '/home');
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
      <LinearGradient colors={['#FFFFFF', '#F8FAFC', '#F1F5F9']} style={StyleSheet.absoluteFill} />

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
              <Ionicons name="mail-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="you@example.com"
                placeholderTextColor="#94A3B8"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
            </View>

            <Text style={styles.label}>Password</Text>
            <View style={styles.inputBox}>
              <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="#94A3B8"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                <Ionicons name={showPassword ? 'eye-outline' : 'eye-off-outline'} size={18} color="#94A3B8" />
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

            {notice ? <Text style={styles.noticeText}>{notice}</Text> : null}

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
      <Modal visible={twoFactorChallenge !== null} transparent animationType="fade" onRequestClose={() => setTwoFactorChallenge(null)}>
        <View style={styles.twoFactorOverlay}>
          <View style={styles.twoFactorCard}>
            <Ionicons name="shield-checkmark-outline" size={30} color={ORANGE} />
            <Text style={styles.twoFactorTitle}>Verify your sign-in</Text>
            <Text style={styles.twoFactorMessage}>{twoFactorMessage}</Text>
            <View style={styles.twoFactorOtpRow}>
              {twoFactorDigits.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(input) => { twoFactorInputs.current[index] = input; }}
                  style={styles.twoFactorInput}
                  value={digit}
                  onChangeText={(value) => handleTwoFactorDigit(index, value)}
                  onKeyPress={({ nativeEvent }) => handleTwoFactorKeyPress(index, nativeEvent.key)}
                  placeholder="•"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={index === 0 ? 6 : 1}
                  autoFocus={index === 0}
                  textAlign="center"
                />
              ))}
            </View>
            {error ? <Text style={styles.twoFactorError}>{error}</Text> : null}
            <TouchableOpacity
              style={styles.twoFactorButton}
              onPress={verifyTwoFactor}
              disabled={twoFactorBusy}
              activeOpacity={0.9}
            >
              {twoFactorBusy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.twoFactorButtonText}>Verify and sign in</Text>}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setTwoFactorChallenge(null)} disabled={twoFactorBusy}>
              <Text style={styles.twoFactorCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  twoFactorOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  twoFactorCard: { width: '100%', maxWidth: 390, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  twoFactorTitle: { color: TEXT_PRIMARY, fontSize: 20, fontFamily: fonts.extrabold, marginTop: 10 },
  twoFactorMessage: { color: TEXT_SECONDARY, fontSize: 13, fontFamily: fonts.medium, lineHeight: 18, textAlign: 'center', marginTop: 8, marginBottom: 16 },
  twoFactorOtpRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 10 },
  twoFactorInput: { width: 42, height: 50, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F8FAFC', color: TEXT_PRIMARY, fontSize: 24, fontFamily: fonts.extrabold, paddingVertical: 0 },
  twoFactorError: { color: '#DC2626', fontSize: 12, textAlign: 'center', marginBottom: 10 },
  twoFactorButton: { width: '100%', borderRadius: 9, backgroundColor: ORANGE, alignItems: 'center', paddingVertical: 14, marginBottom: 12 },
  twoFactorButtonText: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.extrabold },
  twoFactorCancel: { color: TEXT_SECONDARY, fontSize: 13, fontFamily: fonts.semibold, padding: 6 },
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
  welcomeText: { color: TEXT_SECONDARY, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', fontFamily: fonts.bold, marginTop: 1 },
  heroTitle: { color: TEXT_PRIMARY, fontSize: 28, lineHeight: 34, fontFamily: fonts.extrabold, marginTop: 4 },
  heroSubtitle: { color: TEXT_SECONDARY, fontSize: 12, fontFamily: fonts.medium, marginTop: 4 },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'transparent',
    paddingVertical: 16,
    paddingHorizontal: 4,
    zIndex: 1,
  },
  label: {
    color: '#334155',
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    marginBottom: 6,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 3, elevation: 1,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 15,
    color: TEXT_PRIMARY,
    paddingVertical: 2,
  },
  linkText: {
    color: ORANGE_DARK,
    fontSize: 12,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    marginBottom: 20,
  },
  checkboxWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  checkboxChecked: {
    backgroundColor: ORANGE,
    borderColor: ORANGE,
  },
  rememberText: {
    color: TEXT_SECONDARY,
    fontSize: 13,
    fontWeight: '500', fontFamily: fonts.medium,
  },
  noticeText: {
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
    color: '#166534',
    fontSize: 13,
    fontWeight: '600', fontFamily: fonts.semibold,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  errorText: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '600', fontFamily: fonts.semibold,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  primaryButton: {
    borderRadius: 9,
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4,
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
    marginBottom: 20,
  },
  divider: { flex: 1, height: 1, backgroundColor: BORDER },
  dividerText: {
    color: '#94A3B8',
    fontSize: 12,
    marginHorizontal: 14,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    fontWeight: '700', fontFamily: fonts.bold,
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: '#FFFFFF',
    paddingVertical: 15,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1,
  },
  googleButtonText: {
    color: TEXT_PRIMARY,
    fontSize: 14,
    fontWeight: '700', fontFamily: fonts.bold,
    marginLeft: 12,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  footerText: { color: TEXT_SECONDARY, fontSize: 13 },
  footerLink: { color: ORANGE_DARK, fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold, marginLeft: 6 },
});