import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { fonts } from '../theme';
import { Ionicons } from '@expo/vector-icons';

const PRUSSIAN = '#0A2A4A';
const PRUSSIAN_SOFT = '#345271';
const BUTTER = '#F6C445';
const MUTED = 'rgba(255, 255, 255, 0.72)';
const LINE = 'rgba(255, 255, 255, 0.12)';
const INPUT_BG = 'rgba(255, 255, 255, 0.05)';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000';

type Step = 'email' | 'otp' | 'reset' | 'done';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
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
      const res = await fetch(`${API_URL}/accounts/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.message ?? 'Failed to send code');
      setInfo(json?.message ?? 'Verification code sent.');
      setStep('otp');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error. Is the backend running?');
    } finally {
      setBusy(false);
    }
  };

  const verifyOtp = async () => {
    setError(null);
    if (!/^\d{6}$/.test(otp.trim())) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${API_URL}/accounts/verify-otp`, {
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
      setError(e instanceof Error ? e.message : 'Network error. Is the backend running?');
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
      const res = await fetch(`${API_URL}/accounts/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error?.message ?? json?.message ?? 'Failed to reset password');
      setInfo('Password updated. You can now sign in.');
      setStep('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error. Is the backend running?');
    } finally {
      setBusy(false);
    }
  };

  const inputProps = (value: string, setter: (v: string) => void) => ({
    value,
    onChangeText: setter,
    style: styles.input,
    placeholderTextColor: 'rgba(255,255,255,0.35)',
  });

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#050A15', '#0B1628', '#0F1F33']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
            <TouchableOpacity style={styles.backRow} onPress={() => router.back()} hitSlop={8}>
              <Ionicons name="arrow-back" size={18} color={MUTED} />
              <Text style={styles.backText}>Back to sign in</Text>
            </TouchableOpacity>

            <View style={styles.iconBadge}>
              <Ionicons name="key-outline" size={26} color={BUTTER} />
            </View>
            <Text style={styles.title}>Forgot password</Text>
            <Text style={styles.subtitle}>
              {step === 'email' && "We'll email you a 6-digit verification code."}
              {step === 'otp' && `Enter the code sent to ${email}.`}
              {step === 'reset' && 'Choose a new password for your account.'}
              {step === 'done' && 'All set.'}
            </Text>

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
                  <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
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
                      <Text style={styles.primaryButtonText}>Sendingâ€¦</Text>
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
                <View style={styles.inputBox}>
                  <Ionicons name="shield-checkmark-outline" size={18} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
                  <TextInput
                    {...inputProps(otp, setOtp)}
                    placeholder="000000"
                    keyboardType="number-pad"
                    maxLength={6}
                  />
                </View>
                <TouchableOpacity style={styles.primaryButton} onPress={verifyOtp} disabled={busy}>
                  <View style={styles.primaryButtonInner}>
                    <Text style={styles.primaryButtonText}>{busy ? 'Verifyingâ€¦' : 'Verify code'}</Text>
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
                  <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
                  <TextInput {...inputProps(password, setPassword)} placeholder="At least 8 characters" secureTextEntry />
                </View>
                <Text style={styles.label}>Confirm new password</Text>
                <View style={styles.inputBox}>
                  <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
                  <TextInput {...inputProps(confirm, setConfirm)} placeholder="Repeat new password" secureTextEntry />
                </View>
                <TouchableOpacity style={styles.primaryButton} onPress={resetPassword} disabled={busy}>
                  <View style={styles.primaryButtonInner}>
                    <Text style={styles.primaryButtonText}>{busy ? 'Updatingâ€¦' : 'Update password'}</Text>
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
  container: { flex: 1 },
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 26, paddingTop: 18, paddingBottom: 40 },
  backRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 30 },
  backText: { color: MUTED, fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, marginLeft: 6 },
  iconBadge: {
    width: 54,
    height: 54,
    borderRadius: 18,
    backgroundColor: 'rgba(246, 196, 69, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(246, 196, 69, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 28, fontWeight: '800', fontFamily: fonts.extrabold, color: '#FFFFFF', letterSpacing: -0.8, marginBottom: 6 },
  subtitle: { fontSize: 13, color: MUTED, marginBottom: 22, lineHeight: 19 },
  infoBox: {
    backgroundColor: 'rgba(246, 196, 69, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(246, 196, 69, 0.3)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  infoText: { color: BUTTER, fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, lineHeight: 18 },
  errorBox: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.35)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: { color: '#FCA5A5', fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, lineHeight: 18 },
  label: { color: 'rgba(255,255,255,0.82)', fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold, marginBottom: 8 },
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
  input: { flex: 1, fontSize: 15, color: '#FFFFFF', paddingVertical: 2 },
  primaryButton: { borderRadius: 14, overflow: 'hidden', backgroundColor: PRUSSIAN_SOFT, marginTop: 6, marginBottom: 12 },
  primaryButtonInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', fontFamily: fonts.extrabold },
  secondaryButton: { alignItems: 'center', paddingVertical: 10 },
  secondaryText: { color: BUTTER, fontSize: 12, fontWeight: '700', fontFamily: fonts.bold },
});

