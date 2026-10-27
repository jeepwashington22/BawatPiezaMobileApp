import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { AppText as Text } from '../components/app-text';
import { TermsModal } from '../components/terms-modal';
import { useAuth } from '../hooks/use-auth';
import { apiFetch } from '../lib/api';
import {
  GOOGLE_ONBOARDING_STATUS_KEY,
  isGoogleOnboardingRequired,
  supabase,
} from '../lib/supabase';
import { TERMS_VERSION } from '../constants/terms';
import { useTheme } from '../theme';

type ApiMessage = { error?: string; message?: string; resendAfterSeconds?: number };

export default function GoogleOnboardingScreen() {
  const router = useRouter();
  const { colors: c, fonts: f, mode } = useTheme();
  const { ready, isLoggedIn, user } = useAuth();
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otp = otpDigits.join('');
  const otpInputRefs = useRef<(TextInput | null)[]>([]);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const updateOtpDigit = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 6 - index);
    if (digits) {
      setOtpDigits((current) => {
        const next = [...current];
        digits.split('').forEach((digit, offset) => {
          next[index + offset] = digit;
        });
        return next;
      });
      otpInputRefs.current[Math.min(index + digits.length, 5)]?.focus();
    } else {
      setOtpDigits((current) => {
        const next = [...current];
        next[index] = '';
        return next;
      });
    }
    setError(null);
  };

  useEffect(() => {
    if (ready && !isLoggedIn) router.replace('/login');
  }, [ready, isLoggedIn, router]);

  useEffect(() => {
    if (
      ready &&
      isLoggedIn &&
      !isGoogleOnboardingRequired(user)
    ) {
      router.replace('/provisioning');
    }
  }, [ready, isLoggedIn, router, user]);

  useEffect(() => {
    if (termsAcceptedAt && resendAt > now) {
      const timer = setInterval(() => setNow(Date.now()), 1000);
      return () => clearInterval(timer);
    }
  }, [termsAcceptedAt, resendAt, now]);

  const sendVerificationCode = async (acceptedAt: string) => {
    setSending(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Your sign-in session expired. Please sign in with Google again.');
      }

      const response = await apiFetch('/accounts/google-onboarding/send-otp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
        timeoutMs: 10_000,
      });
      const result = (await response.json().catch(() => null)) as ApiMessage | null;

      if (!response.ok) {
        if (response.status === 429) {
          const timestamp = Date.now();
          setTermsAcceptedAt(acceptedAt);
          setOtpRequested(true);
          setNow(timestamp);
          setResendAt(timestamp + 60_000);
        }
        throw new Error(
          result?.error ??
            result?.message ??
            'Could not send the verification code. Please try again.',
        );
      }

      const timestamp = Date.now();
      setTermsAcceptedAt(acceptedAt);
      setOtpRequested(true);
      setNow(timestamp);
      setResendAt(timestamp + (result?.resendAfterSeconds ?? 60) * 1000);
      setOtpDigits(['', '', '', '', '', '']);
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : 'Could not send the verification code. Please try again.',
      );
    } finally {
      setSending(false);
    }
  };

  const finishOnboarding = async () => {
    const { data, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError || !data.session) {
      setError('Your email is verified. Refresh your session to continue.');
      return;
    }
    router.replace('/provisioning');
  };

  const verifyCode = async () => {
    if (!termsAcceptedAt || !/^\d{6}$/.test(otp)) {
      setError('Enter the 6-digit code sent to your Google account email.');
      return;
    }
    setVerifying(true);
    setError(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) {
        throw new Error('Your sign-in session expired. Please sign in with Google again.');
      }

      const response = await apiFetch('/accounts/google-onboarding/verify-otp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          otp,
          termsAcceptedAt,
          termsVersion: TERMS_VERSION,
        }),
        timeoutMs: 10_000,
      });
      const result = (await response.json().catch(() => null)) as ApiMessage | null;
      if (!response.ok) {
        throw new Error(
          result?.error ?? result?.message ?? 'Could not verify the code.',
        );
      }

      setVerified(true);
      await finishOnboarding();
    } catch (verifyError) {
      setError(
        verifyError instanceof Error
          ? verifyError.message
          : 'Could not verify the code.',
      );
    } finally {
      setVerifying(false);
    }
  };

  const declineTerms = async () => {
    await supabase.auth.signOut();
    router.replace('/login');
  };

  const secondsUntilResend = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const email = user?.email ?? 'your Google account email';
  const onboardingComplete =
    user?.app_metadata?.google_onboarding_completed === true ||
    user?.user_metadata?.[GOOGLE_ONBOARDING_STATUS_KEY] === 'completed';

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bg }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.content}
      >
        <View style={[styles.iconWrap, { backgroundColor: c.surfaceMuted }]}>
          <Text style={styles.icon}>✉</Text>
        </View>
        <Text style={[styles.title, { color: c.text, fontFamily: f.bold }]}>
          {verified ? 'Email verified' : 'Verify your email'}
        </Text>
        <Text style={[styles.description, { color: c.muted }]}>
          {otpRequested
            ? `Enter the 6-digit code we sent to ${email}.`
            : 'Accept the Terms & Conditions to receive a verification code.'}
        </Text>

        {otpRequested && !verified ? (
          <>
            <View style={styles.otpInputRow}>
              {otpDigits.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(input) => {
                    otpInputRefs.current[index] = input;
                  }}
                  value={digit}
                  onChangeText={(value) => updateOtpDigit(index, value)}
                  onKeyPress={({ nativeEvent }) => {
                    if (nativeEvent.key === 'Backspace' && !otpDigits[index] && index > 0) {
                      otpInputRefs.current[index - 1]?.focus();
                    }
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  placeholder=" "
                  placeholderTextColor={c.muted}
                  style={[
                    styles.otpInput,
                    { backgroundColor: c.surface, borderColor: c.line, color: c.text },
                  ]}
                  accessibilityLabel={`Verification code digit ${index + 1} of 6`}
                  editable={!verifying}
                />
              ))}
            </View>
            <Pressable
              onPress={verifyCode}
              disabled={verifying || otp.length !== 6}
              style={[
                styles.primaryButton,
                { backgroundColor: c.orange },
                (verifying || otp.length !== 6) && styles.disabledButton,
              ]}
              accessibilityRole="button"
            >
              {verifying ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={[styles.primaryButtonText, { fontFamily: f.semibold }]}>
                  Verify and continue
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => {
                if (termsAcceptedAt) {
                  void sendVerificationCode(termsAcceptedAt);
                }
              }}
              disabled={sending || secondsUntilResend > 0}
              accessibilityRole="button"
            >
              <Text style={[styles.resendText, { color: c.orange, fontFamily: f.semibold }]}>
                {sending
                  ? 'Sending code...'
                  : secondsUntilResend > 0
                    ? `Resend code in ${secondsUntilResend}s`
                    : 'Resend code'}
              </Text>
            </Pressable>
          </>
        ) : null}

        {verified ? (
          <Pressable
            onPress={() => void finishOnboarding()}
            style={[styles.primaryButton, { backgroundColor: c.orange }]}
            accessibilityRole="button"
          >
            <Text style={[styles.primaryButtonText, { fontFamily: f.semibold }]}>
              Continue
            </Text>
          </Pressable>
        ) : null}

        {sending && !otpRequested ? (
          <ActivityIndicator color={c.orange} style={styles.initialLoader} />
        ) : null}
        {termsAcceptedAt && !otpRequested && !verified ? (
          <Pressable
            onPress={() => void sendVerificationCode(termsAcceptedAt)}
            disabled={sending}
            style={[styles.primaryButton, { backgroundColor: c.orange }]}
            accessibilityRole="button"
          >
            {sending ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[styles.primaryButtonText, { fontFamily: f.semibold }]}>
                Send verification code
              </Text>
            )}
          </Pressable>
        ) : null}
        {error ? (
          <Text style={[styles.error, { color: c.danger }]} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}

      </KeyboardAvoidingView>

      <TermsModal
        visible={
          !termsAcceptedAt &&
          isLoggedIn &&
          !onboardingComplete
        }
        onAccept={(acceptedAt) => {
          setTermsAcceptedAt(acceptedAt);
          void sendVerificationCode(acceptedAt);
        }}
        onDecline={() => void declineTerms()}
        variant={mode}
        requireScroll
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingBottom: 24,
  },
  iconWrap: {
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 36,
    marginBottom: 20,
  },
  icon: { fontSize: 32 },
  title: { fontSize: 24, textAlign: 'center' },
  description: {
    fontSize: 15,
    lineHeight: 22,
    marginTop: 10,
    marginBottom: 20,
    textAlign: 'center',
    maxWidth: 350,
  },
  otpInputRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  otpInput: {
    width: 44,
    height: 54,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 0,
    paddingHorizontal: 0,
    fontSize: 24,
    textAlign: 'center',
  },
  primaryButton: {
    minWidth: 220,
    minHeight: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    marginTop: 16,
  },
  disabledButton: { opacity: 0.5 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15 },
  resendText: { fontSize: 14, marginTop: 18, padding: 8 },
  initialLoader: { marginTop: 22 },
  error: { fontSize: 13, textAlign: 'center', marginTop: 14, maxWidth: 340 },
});
