import React, { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { AppText as Text } from '../components/app-text';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { fonts } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { apiFetch } from '../lib/api';
import { describeApiFailure } from '../lib/network';

const ORANGE = '#F97316';
const ORANGE_DARK = '#EA580C';
const TEXT_PRIMARY = '#0F172A';
const TEXT_SECONDARY = '#64748B';
const BORDER = '#E2E8F0';
const INPUT_BG = '#FFFFFF';

const NETWORK_FALLBACK = 'Unable to reach the server. Check your connection and try again.';

type Step = 'email' | 'otp' | 'reset' | 'done';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputs = useRef<(TextInput | null)[]>([]);
  const otp = otpDigits.join('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const requestOtp = async () => {
    setError(null);
    if (!/.+@.+\..+/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/accounts/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.message ?? 'Failed to send code');
      setInfo(json?.message ?? 'Verification code sent.');
      setOtpDigits(['', '', '', '', '', '']);
      setStep('otp');
    } catch (e) {
      setError(describeApiFailure(e, NETWORK_FALLBACK));
    } finally {
      setBusy(false);
    }
  };

  const setOtpDigit = (index: number, char: string) => {
    const clean = char.replace(/[^0-9]/g, '');
    setOtpDigits((prev) => {
      const next = [...prev];
      // Support paste / autofill of multiple digits into one box.
      if (clean.length > 1) {
        const chars = clean.slice(0, 6 - index).split('');
        chars.forEach((c, offset) => {
          next[index + offset] = c;
        });
        const focusIndex = Math.min(index + chars.length, 5);
        requestAnimationFrame(() => otpInputs.current[focusIndex]?.focus());
        return next;
      }
      next[index] = clean.slice(-1);
      return next;
    });
    if (clean.length === 1 && index < 5) {
      otpInputs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputs.current[index - 1]?.focus();
      setOtpDigits((prev) => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
    }
  };

  const clearOtp = () => {
    setOtpDigits(['', '', '', '', '', '']);
    requestAnimationFrame(() => otpInputs.current[0]?.focus());
  };

  const verifyOtp = async () => {
    setError(null);
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/accounts/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), otp: otp.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.message ?? 'Invalid code');
      setResetToken(json.resetToken);
      setInfo('Code verified. Choose a new password.');
      setStep('reset');
    } catch (e) {
      setError(describeApiFailure(e, NETWORK_FALLBACK));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiFetch('/accounts/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.message ?? 'Failed to reset password');
      setInfo('Password updated. You can now sign in.');
      setStep('done');
    } catch (e) {
      setError(describeApiFailure(e, NETWORK_FALLBACK));
    } finally {
      setBusy(false);
    }
  };

  const inputProps = (value: string, setter: (v: string) => void) => ({
    value,
    onChangeText: setter,
    style: styles.input,
    placeholderTextColor: '#94A3B8',
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFFFFF', '#F8FAFC', '#F1F5F9']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.backRow} onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="arrow-back" size={18} color={TEXT_SECONDARY} />
              <Text style={styles.backText}>Back to sign in</Text>
            </TouchableOpacity>

            <View style={styles.brandWrap}>
              <Image source={require('../../assets/images/LOGO3.png')} style={styles.logo} resizeMode="contain" />
              <View style={styles.iconBadge}>
                <Ionicons name="key-outline" size={26} color={ORANGE} />
              </View>
              <Text style={styles.title}>Forgot password</Text>
              <Text style={styles.subtitle}>
                {step === 'email' && "We'll email you a 6-digit verification code."}
                {step === 'otp' && `Enter the code sent to ${email}.`}
                {step === 'reset' && 'Choose a new password for your account.'}
                {step === 'done' && 'All set.'}
              </Text>
            </View>

            {info ? (
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>{info}</Text>
              </View>
            ) : null}
            {error ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}

            {step === 'email' && (
              <View>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="mail-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                  <TextInput
                    {...inputProps(email, setEmail)}
                    placeholder="you@example.com"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoComplete="email"
                  />
                </View>
                <TouchableOpacity style={styles.primaryButton} onPress={requestOtp} disabled={busy}>
                  <View style={styles.primaryButtonInner}>
                    {busy ? (
                      <Text style={styles.primaryButtonText}>Sending...</Text>
                    ) : (
                      <>
                        <Ionicons name="paper-plane-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                        <Text style={styles.primaryButtonText}>Send verification code</Text>
                      </>
                    )}
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {step === 'otp' && (
              <View>
                <Text style={styles.label}>6-digit code (expires in 5 minutes)</Text>
                <View style={styles.otpRow}>
                  {otpDigits.map((digit, index) => (
                    <TextInput
                      key={index}
                      ref={(el) => {
                        otpInputs.current[index] = el;
                      }}
                      value={digit}
                      onChangeText={(text) => setOtpDigit(index, text)}
                      onKeyPress={({ nativeEvent }) => handleOtpKeyPress(index, nativeEvent.key)}
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                      autoComplete="sms-otp"
                      maxLength={6}
                      selectTextOnFocus
                      autoFocus={index === 0}
                      placeholder="0"
                      placeholderTextColor="#CBD5E1"
                      style={[styles.otpBox, digit ? styles.otpBoxFilled : null]}
                      textAlign="center"
                    />
                  ))}
                </View>
                <TouchableOpacity onPress={clearOtp} disabled={busy} style={styles.otpClearRow}>
                  <Text style={styles.secondaryText}>Clear code</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} onPress={verifyOtp} disabled={busy}>
                  <View style={styles.primaryButtonInner}>
                    <Text style={styles.primaryButtonText}>{busy ? 'Verifying...' : 'Verify code'}</Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity style={styles.secondaryButton} onPress={requestOtp} disabled={busy}>
                  <Text style={styles.secondaryText}>Resend code</Text>
                </TouchableOpacity>
              </View>
            )}

            {step === 'reset' && (
              <View>
                <Text style={styles.label}>New password</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                  <TextInput {...inputProps(password, setPassword)} placeholder="At least 8 characters" secureTextEntry />
                </View>
                <Text style={styles.label}>Confirm new password</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="lock-closed-outline" size={18} color="#94A3B8" style={styles.inputIcon} />
                  <TextInput {...inputProps(confirm, setConfirm)} placeholder="Repeat new password" secureTextEntry />
                </View>
                <TouchableOpacity style={styles.primaryButton} onPress={resetPassword} disabled={busy}>
                  <View style={styles.primaryButtonInner}>
                    <Text style={styles.primaryButtonText}>{busy ? 'Updating...' : 'Update password'}</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {step === 'done' && (
              <View>
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>Your password has been changed successfully.</Text>
                </View>
                <TouchableOpacity style={styles.primaryButton} onPress={() => router.replace('/')}>
                  <View style={styles.primaryButtonInner}>
                    <Text style={styles.primaryButtonText}>Sign in now</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 26, paddingTop: 18, paddingBottom: 40 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backText: { color: TEXT_SECONDARY, fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, marginLeft: 6 },
  brandWrap: { alignItems: 'center', marginBottom: 22 },
  logo: { width: 140, height: 140, marginBottom: 2 },
  iconBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', fontFamily: fonts.extrabold, color: TEXT_PRIMARY, letterSpacing: -0.6, marginBottom: 6, textAlign: 'center' },
  subtitle: { fontSize: 14, color: TEXT_SECONDARY, marginBottom: 6, lineHeight: 20, textAlign: 'center' },
  infoBox: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  infoText: { color: '#92400E', fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, lineHeight: 18 },
  errorBox: {
    backgroundColor: '#FEE2E2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 18,
  },
  errorText: { color: '#991B1B', fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, lineHeight: 18 },
  label: { color: '#334155', fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, marginBottom: 6 },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: INPUT_BG,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 16,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 3, elevation: 1,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: TEXT_PRIMARY, paddingVertical: 2 },
  otpRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  otpBox: {
    flex: 1,
    height: 56,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: BORDER,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: fonts.extrabold,
    color: TEXT_PRIMARY,
    textAlign: 'center',
    paddingVertical: 0,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 3, elevation: 1,
  },
  otpBoxFilled: { borderColor: ORANGE, backgroundColor: '#FFF7ED' },
  otpClearRow: { alignItems: 'flex-end', paddingVertical: 6, marginBottom: 10 },
  primaryButton: { 
    borderRadius: 9, 
    overflow: 'hidden', 
    backgroundColor: ORANGE, 
    marginTop: 8, 
    marginBottom: 12,
    shadowColor: ORANGE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 
  },
  primaryButtonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 15 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800', fontFamily: fonts.extrabold },
  secondaryButton: { alignItems: 'center', paddingVertical: 12 },
  secondaryText: { color: ORANGE_DARK, fontSize: 13, fontWeight: '700', fontFamily: fonts.bold },
});