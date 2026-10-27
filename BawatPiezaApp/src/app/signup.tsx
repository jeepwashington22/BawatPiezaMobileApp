import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { AppText as Text } from '../components/app-text';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { fonts } from '../theme';
import { isEmailRegistered, termsAcceptanceMetadata } from '../lib/supabase';
import { useAuth } from '../hooks/use-auth';
import { TermsModal } from '../components/terms-modal';
import { TileLoader } from '../components/tile-loader';
import { apiFetch } from '../lib/api';
import { describeApiFailure } from '../lib/network';
import {
  PASSWORD_MIN_LENGTH,
  validateContactNumber,
  validateEmail,
  validateNamePart,
  validateNewPassword,
} from '../lib/validation';

const ORANGE = '#F97316';
const ORANGE_DARK = '#EA580C';
const TEXT_PRIMARY = '#0F172A';
const TEXT_SECONDARY = '#64748B';
const BORDER = '#E2E8F0';

type Step = 0 | 1 | 2;

export default function SignupScreen() {
  const router = useRouter();
  const { ready, isLoggedIn } = useAuth();
  const [step, setStep] = useState<Step>(0);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [contactDigits, setContactDigits] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [termsVisible, setTermsVisible] = useState(false);
  const [termsOpened, setTermsOpened] = useState(false);
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const [successVisible, setSuccessVisible] = useState(false);
  const [createdEmail, setCreatedEmail] = useState('');
  const [emailSent, setEmailSent] = useState(true);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [verified, setVerified] = useState(false);
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputs = useRef<(TextInput | null)[]>([]);
  const otpCode = otpDigits.join('');
  const [justSignedUp, setJustSignedUp] = useState(false);

  useEffect(() => {
    if (ready && isLoggedIn && !successVisible && !submitting && !justSignedUp) {
      router.replace('/home');
    }
  }, [ready, isLoggedIn, successVisible, submitting, justSignedUp, router]);

  const validateStep = (): string | null => {
    if (step === 0) {
      return validateNamePart(firstName, 'First name') || validateNamePart(lastName, 'Last name');
    }
    if (step === 1) {
      return validateEmail(email) || validateContactNumber(`+639${contactDigits}`);
    }
    return validateNewPassword(password, confirmPassword);
  };

  const nextStep = async () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (step === 1) {
      setCheckingEmail(true);
      setError(null);
      try {
        if (await isEmailRegistered(email)) {
          setError('This email is already registered. Please sign in or use another email address.');
          return;
        }
      } finally {
        setCheckingEmail(false);
      }
    }

    setError(null);
    setStep((current) => Math.min(2, current + 1) as Step);
  };

  const handleSignup = async () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!termsOpened || !termsAcceptedAt) {
      setError('Please read and agree to the Terms & Conditions before creating your account.');
      return;
    }

    setSubmitting(true);
    setJustSignedUp(true);
    setError(null);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const response = await apiFetch('/accounts/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: normalizedEmail,
          password,
          firstname: firstName.trim(),
          middlename: middleName.trim(),
          lastname: lastName.trim(),
          contactNumber: `+639${contactDigits}`,
          ...termsAcceptanceMetadata(termsAcceptedAt),
        }),
      });
      const result = (await response.json()) as {
        email?: string;
        verificationEmailSent?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? result.message ?? 'Could not create your account.');
      }

      setCreatedEmail(result.email ?? normalizedEmail);
      setEmailSent(result.verificationEmailSent === true);
      setResendMessage(result.verificationEmailSent ? 'Verification code sent. Check your inbox and spam folder.' : null);
      setVerificationError(
        result.verificationEmailSent
          ? null
          : result.message ?? 'Your account was created, but the verification email could not be sent. Try resending the code.',
      );
      setOtpDigits(['', '', '', '', '', '']);
      setVerified(false);
      setJustSignedUp(false);
      setSuccessVisible(true);
    } catch (signupError) {
      setJustSignedUp(false);
      setError(describeApiFailure(signupError, 'Unable to reach the server. Check your connection and try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    const target = (createdEmail || email).trim().toLowerCase();
    if (!target) {
      setResendMessage('Enter your email address first, then resend the verification email.');
      return;
    }
    setResending(true);
    setResendMessage(null);
    setVerificationError(null);
    try {
      const response = await apiFetch('/accounts/signup/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: target }),
      });
      const result = (await response.json()) as {
        verificationEmailSent?: boolean;
        alreadyVerified?: boolean;
        error?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(result.error ?? result.message ?? 'Could not send a verification code.');
      }
      if (result.alreadyVerified) {
        setEmailSent(false);
        setVerified(true);
        setJustSignedUp(false);
        setResendMessage('This email is already verified. Continue to sign in with your credentials.');
        return;
      }
      setEmailSent(result.verificationEmailSent === true);
      if (result.verificationEmailSent) {
        setResendMessage(result.message ?? 'Verification email sent. Check your inbox and spam folder.');
      } else {
        setVerificationError(result.message ?? 'Could not send the verification code. Please try again shortly.');
      }
    } catch (resendError) {
      setVerificationError(describeApiFailure(resendError, 'Could not send the verification code. Check your connection and try again.'));
    } finally {
      setResending(false);
    }
  };

  const handleOtpDigitChange = (index: number, value: string) => {
    const digits = value.replace(/\D/g, '');
    setOtpDigits((previous) => {
      const next = [...previous];
      if (digits.length > 1) {
        const pastedDigits = digits.slice(0, 6 - index).split('');
        pastedDigits.forEach((digit, offset) => {
          next[index + offset] = digit;
        });
        requestAnimationFrame(() => otpInputs.current[Math.min(index + pastedDigits.length, 5)]?.focus());
        return next;
      }
      next[index] = digits;
      return next;
    });
    if (digits.length === 1 && index < 5) {
      otpInputs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyPress = (index: number, key: string) => {
    if (key !== 'Backspace' || otpDigits[index] || index === 0) return;
    otpInputs.current[index - 1]?.focus();
    setOtpDigits((previous) => {
      const next = [...previous];
      next[index - 1] = '';
      return next;
    });
  };

  const handleVerifyEmail = async () => {
    setVerificationError(null);
    setResendMessage(null);
    if (!/^\d{6}$/.test(otpCode)) {
      setVerificationError('Enter the 6-digit code sent to your email.');
      return;
    }

    setVerifying(true);
    try {
      const response = await apiFetch('/accounts/signup/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: createdEmail, otp: otpCode }),
      });
      const result = (await response.json()) as { error?: string; message?: string };
      if (!response.ok) {
        throw new Error(result.error ?? result.message ?? 'Unable to verify the code.');
      }
      setVerified(true);
      setVerified(true);
      setJustSignedUp(false);
      setResendMessage(result.message ?? 'Email verified. You can now sign in.');
    } catch (verifyError) {
      setVerificationError(describeApiFailure(verifyError, 'Unable to verify the code. Check your connection and try again.'));
    } finally {
      setVerifying(false);
    }
  };

  const handleContinueAfterVerification = () => {
    setSuccessVisible(false);
    router.replace({ pathname: '/login', params: { email: createdEmail || email.trim().toLowerCase() } });
  };

  const handleCreateAccount = () => {
    const validationError = validateStep();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (!termsOpened || !termsAcceptedAt) {
      setError('Please read and agree to the Terms & Conditions before creating your account.');
      return;
    }
    void handleSignup();
  };

  const handleContactDigitsChange = (value: string) => {
    const digitsOnly = value.replace(/\D/g, '');
    const withoutPrefix = digitsOnly.startsWith('639')
      ? digitsOnly.slice(3)
      : digitsOnly.startsWith('09')
        ? digitsOnly.slice(1)
        : digitsOnly;
    setContactDigits(withoutPrefix.slice(0, 9));
  };

  const passwordChecks = [
    { label: `At least ${PASSWORD_MIN_LENGTH} characters`, met: password.length >= PASSWORD_MIN_LENGTH },
    { label: 'One uppercase letter (A-Z)', met: /[A-Z]/.test(password) },
    { label: 'One lowercase letter (a-z)', met: /[a-z]/.test(password) },
    { label: 'One number (0-9)', met: /\d/.test(password) },
    { label: 'One special character', met: /[^A-Za-z0-9]/.test(password) },
  ];

  const renderInput = (
    icon: keyof typeof Ionicons.glyphMap,
    placeholder: string,
    value: string,
    onChangeText: (value: string) => void,
    options?: Partial<React.ComponentProps<typeof TextInput>>,
  ) => (
    <View style={styles.inputBox}>
      <Ionicons name={icon} size={17} color="#94A3B8" style={styles.inputIcon} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        value={value}
        onChangeText={onChangeText}
        {...options}
      />
    </View>
  );

  const renderPasswordInput = (
    placeholder: string,
    value: string,
    onChangeText: (value: string) => void,
    visible: boolean,
    setVisible: (value: boolean) => void,
  ) => (
    <View style={styles.inputBox}>
      <Ionicons name="lock-closed-outline" size={17} color="#94A3B8" style={styles.inputIcon} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
      />
      <Pressable onPress={() => setVisible(!visible)} hitSlop={10} accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={18} color="#94A3B8" />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#FFFFFF', '#F8FAFC', '#F1F5F9']} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
          <View style={styles.header}>
            <Image
              source={require('../../assets/images/LOGO3.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="BawatPieza logo"
            />
            <Text style={styles.welcomeText}>Welcome</Text>
            <Text style={styles.brandTitle}>Create your account</Text>
            <Text style={styles.brandSubtitle}>Step {step + 1} of 3 · Your details stay secure</Text>
          </View>

          <View style={styles.progressTrack}>
            {[0, 1, 2].map((item) => <View key={item} style={[styles.progressStep, item <= step && styles.progressStepActive]} />)}
          </View>

          <View style={styles.card}>
            {step === 0 && (
              <>
                <Text style={styles.stepTitle}>Personal information</Text>
                <Text style={styles.stepCopy}>Tell us what to call you.</Text>
                {renderInput('person-outline', 'First name', firstName, setFirstName, { autoCapitalize: 'words' })}
                {renderInput('person-outline', 'Middle name (optional)', middleName, setMiddleName, { autoCapitalize: 'words' })}
                {renderInput('person-outline', 'Last name', lastName, setLastName, { autoCapitalize: 'words' })}
              </>
            )}

            {step === 1 && (
              <>
                <Text style={styles.stepTitle}>Contact details</Text>
                <Text style={styles.stepCopy}>We will use these details to secure your account.</Text>
                {renderInput('mail-outline', 'Email address', email, setEmail, { autoCapitalize: 'none', keyboardType: 'email-address' })}
                <View style={styles.inputBox}>
                  <Ionicons name="call-outline" size={17} color="#94A3B8" style={styles.inputIcon} />
                  <Text style={styles.phonePrefix}>+639</Text>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="XXXXXXXXX"
                    placeholderTextColor="#94A3B8"
                    value={contactDigits}
                    onChangeText={handleContactDigitsChange}
                    keyboardType="number-pad"
                    maxLength={9}
                  />
                </View>
                <Text style={styles.phoneHint}>Enter the 9 digits after +639.</Text>
                <Text style={styles.helperText}>Your email will be checked for an existing account when you create it.</Text>
              </>
            )}

            {step === 2 && (
              <>
                <Text style={styles.stepTitle}>Secure your account</Text>
                <Text style={styles.stepCopy}>Use at least 8 characters with upper/lowercase letters, a number, and a symbol.</Text>
                {renderPasswordInput('Password', password, setPassword, showPassword, setShowPassword)}
                <View style={styles.passwordChecklist} accessibilityLiveRegion="polite">
                  <Text style={styles.passwordChecklistTitle}>Password requirements</Text>
                  {passwordChecks.map((check) => (
                    <View key={check.label} style={styles.passwordCheckRow}>
                      <Ionicons
                        name={check.met ? 'checkmark-circle' : 'ellipse-outline'}
                        size={14}
                        color={check.met ? '#16A34A' : '#CBD5E1'}
                      />
                      <Text style={[styles.passwordCheckText, check.met && styles.passwordCheckTextMet]}>
                        {check.label}
                      </Text>
                    </View>
                  ))}
                </View>
                {renderPasswordInput('Confirm password', confirmPassword, setConfirmPassword, showConfirmPassword, setShowConfirmPassword)}
                {confirmPassword.length > 0 && (
                  <View style={styles.passwordMatchRow}>
                    <Ionicons
                      name={password === confirmPassword ? 'checkmark-circle' : 'close-circle'}
                      size={14}
                      color={password === confirmPassword ? '#16A34A' : '#EA580C'}
                    />
                    <Text style={[styles.passwordCheckText, password === confirmPassword && styles.passwordCheckTextMet]}>
                      {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                    </Text>
                  </View>
                )}
                <Pressable
                  style={styles.termsLink}
                  onPress={() => {
                    setTermsOpened(true);
                    setTermsVisible(true);
                    setError(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Read Terms and Conditions"
                >
                  <Ionicons name={termsAcceptedAt ? 'checkmark-circle' : 'document-text-outline'} size={15} color={termsAcceptedAt ? '#16A34A' : ORANGE_DARK} />
                  <Text style={[styles.termsLinkText, termsAcceptedAt && styles.termsLinkAccepted]}>
                    {termsAcceptedAt ? 'Terms & Conditions accepted' : 'Read and agree to the Terms & Conditions'}
                  </Text>
                  {!termsAcceptedAt && <Ionicons name="chevron-forward" size={14} color={ORANGE_DARK} />}
                </Pressable>
              </>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.buttonRow}>
              {step > 0 && (
                <Pressable style={styles.backButton} onPress={() => { setError(null); setStep((current) => (current - 1) as Step); }}>
                  <Ionicons name="arrow-back" size={16} color={TEXT_SECONDARY} />
                  <Text style={styles.backButtonText}>Back</Text>
                </Pressable>
              )}
              <Pressable
                style={[
                  styles.primaryButton,
                  step === 2 && (!termsOpened || !termsAcceptedAt) && styles.primaryButtonDisabled,
                ]}
                onPress={step === 2 ? handleCreateAccount : nextStep}
                disabled={submitting || checkingEmail || (step === 2 && (!termsOpened || !termsAcceptedAt))}
              >
                <LinearGradient colors={[ORANGE, ORANGE_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButtonInner}>
                  <><Text style={styles.primaryButtonText}>{step === 2 ? 'Create account' : 'Continue'}</Text><Ionicons name="arrow-forward" size={16} color="#FFFFFF" /></>
                </LinearGradient>
              </Pressable>
            </View>
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already registered?</Text>
            <Pressable onPress={() => router.replace('/')}>
              <Text style={styles.footerLink}>Back to sign in</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
      <TermsModal
        visible={termsVisible}
        variant="light"
        confirmLabel="I Agree & Continue"
        onAccept={(acceptedAt) => {
          setTermsAcceptedAt(acceptedAt);
          setTermsVisible(false);
          setError(null);
        }}
        onDecline={() => setTermsVisible(false)}
      />
      <Modal visible={submitting || checkingEmail} transparent animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <TileLoader label={checkingEmail ? 'Checking your email...' : 'Creating your account...'} size="sm" />
          </View>
        </View>
      </Modal>
      <Modal
        visible={successVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (verified) handleContinueAfterVerification();
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.successOverlay}
        >
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name={verified ? 'checkmark-circle' : 'mail-unread-outline'} size={44} color={verified ? '#16A34A' : ORANGE_DARK} />
            </View>
            <Text style={styles.successTitle}>{verified ? 'Email verified successfully' : 'Account created successfully'}</Text>
            <Text style={styles.successCopy}>
              {verified ? (
                <>
                  Your account for <Text style={styles.successEmail}>{createdEmail}</Text> is verified.
                  {' '}Continue to sign in with your credentials.
                </>
              ) : emailSent ? (
                <>
                  We sent a 6-digit verification code to{' '}
                  <Text style={styles.successEmail}>{createdEmail || email.trim().toLowerCase()}</Text>. Enter it below
                  to verify your account. Check your spam folder if you do not see it.
                </>
              ) : (
                <>
                  Your account for <Text style={styles.successEmail}>{createdEmail || email.trim().toLowerCase()}</Text>{' '}
                  was created, but the verification email could not be sent. Resend the code to continue.
                </>
              )}
            </Text>
            {!verified && emailSent && (
              <View style={styles.otpRow}>
                {otpDigits.map((digit, index) => (
                  <TextInput
                    key={index}
                    ref={(input) => {
                      otpInputs.current[index] = input;
                    }}
                    style={styles.otpInput}
                    value={digit}
                    onChangeText={(value) => handleOtpDigitChange(index, value)}
                    onKeyPress={({ nativeEvent }) => handleOtpKeyPress(index, nativeEvent.key)}
                    keyboardType="number-pad"
                    maxLength={6}
                    selectTextOnFocus
                    editable={!verifying && !resending}
                    accessibilityLabel={`Verification code digit ${index + 1}`}
                  />
                ))}
              </View>
            )}
            {verificationError ? <Text style={styles.verificationError}>{verificationError}</Text> : null}
            {(verifying || resending) && (
              <TileLoader label={verifying ? 'Verifying your email...' : 'Sending a new code...'} size="sm" />
            )}
            {resendMessage ? <Text style={styles.successResendMessage}>{resendMessage}</Text> : null}
            <Pressable
              style={[styles.successPrimary, (verifying || resending || (!verified && !emailSent)) && styles.primaryButtonDisabled]}
              onPress={verified ? handleContinueAfterVerification : handleVerifyEmail}
              disabled={verifying || resending || (!verified && !emailSent)}
              accessibilityRole="button"
              accessibilityLabel={verified ? 'Go to sign in' : 'Verify email address'}
            >
              <LinearGradient colors={[ORANGE, ORANGE_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.successPrimaryInner}>
                <Text style={styles.successPrimaryText}>{verified ? 'Go to sign in' : 'Verify email'}</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
            {!verified && (
              <Pressable
                style={styles.successResend}
                onPress={handleResendVerification}
                disabled={resending || verifying}
                accessibilityRole="button"
                accessibilityLabel="Resend verification code"
              >
                <Text style={styles.successResendText}>Didn&apos;t get the code? Resend verification email</Text>
              </Pressable>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  safeArea: { flex: 1 },
  flex: { flex: 1, alignItems: 'center', paddingHorizontal: 18, paddingTop: 24, paddingBottom: 24 },
  header: { width: '100%', alignItems: 'center', paddingBottom: 14 },
  logo: { width: 132, height: 106, marginBottom: 2 },
  welcomeText: { color: TEXT_SECONDARY, fontSize: 11, letterSpacing: 1.1, textTransform: 'uppercase', fontFamily: fonts.bold },
  brandTitle: { color: TEXT_PRIMARY, fontSize: 26, lineHeight: 32, fontFamily: fonts.extrabold, marginTop: 4 },
  brandSubtitle: { marginTop: 6, color: TEXT_SECONDARY, fontSize: 12, fontFamily: fonts.medium },
  progressTrack: { width: '100%', maxWidth: 420, flexDirection: 'row', gap: 6, marginBottom: 12 },
  progressStep: { flex: 1, height: 4, borderRadius: 99, backgroundColor: '#E2E8F0' },
  progressStepActive: { backgroundColor: ORANGE },
  card: { width: '100%', maxWidth: 420, paddingVertical: 14, paddingHorizontal: 4 },
  stepTitle: { color: TEXT_PRIMARY, fontSize: 18, fontFamily: fonts.extrabold, marginBottom: 4 },
  stepCopy: { color: TEXT_SECONDARY, fontSize: 12, lineHeight: 17, fontFamily: fonts.medium, marginBottom: 16 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: BORDER, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.02, shadowRadius: 3, elevation: 1 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: TEXT_PRIMARY, paddingVertical: 2 },
  phonePrefix: { color: TEXT_PRIMARY, fontSize: 15, fontFamily: fonts.semibold, paddingRight: 4 },
  phoneInput: { flex: 1, fontSize: 15, color: TEXT_PRIMARY, paddingVertical: 2 },
  phoneHint: { color: '#94A3B8', fontSize: 11, marginTop: -6, marginBottom: 14 },
  passwordChecklist: { marginTop: -4, marginBottom: 14, padding: 12, borderRadius: 8, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: BORDER },
  passwordChecklistTitle: { color: TEXT_PRIMARY, fontSize: 11, fontFamily: fonts.semibold, marginBottom: 8 },
  passwordCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3 },
  passwordCheckText: { color: TEXT_SECONDARY, fontSize: 11, fontFamily: fonts.medium },
  passwordCheckTextMet: { color: '#16A34A' },
  passwordMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -6, marginBottom: 14, marginLeft: 4 },
  termsLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 12, paddingVertical: 6 },
  termsLinkText: { flex: 1, color: ORANGE_DARK, fontSize: 12, fontFamily: fonts.semibold },
  termsLinkAccepted: { color: '#16A34A' },
  helperText: { color: '#94A3B8', fontSize: 11, lineHeight: 16, marginTop: -4, marginBottom: 6 },
  errorText: { color: '#DC2626', fontSize: 12, lineHeight: 16, fontFamily: fonts.semibold, marginBottom: 12 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  backButton: { minWidth: 90, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 9, borderWidth: 1, borderColor: BORDER, backgroundColor: '#FFFFFF', paddingHorizontal: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
  backButtonText: { color: TEXT_PRIMARY, fontSize: 13, fontFamily: fonts.bold },
  primaryButton: { flex: 1, borderRadius: 9, overflow: 'hidden', shadowColor: ORANGE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonInner: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.extrabold },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  footerText: { color: TEXT_SECONDARY, fontSize: 13 },
  footerLink: { color: ORANGE_DARK, fontSize: 13, fontFamily: fonts.extrabold, marginLeft: 6 },
  loadingOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  loadingCard: { width: '100%', maxWidth: 300, borderRadius: 18, backgroundColor: '#FFFFFF', padding: 16 },
  successOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  successCard: { width: '100%', maxWidth: 400, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: BORDER, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 12, elevation: 3 },
  successIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#DCFCE7', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  successTitle: { color: TEXT_PRIMARY, fontSize: 20, fontFamily: fonts.extrabold, textAlign: 'center' },
  successCopy: { color: TEXT_SECONDARY, fontSize: 13, lineHeight: 20, fontFamily: fonts.medium, textAlign: 'center', marginTop: 12 },
  successEmail: { color: ORANGE_DARK, fontFamily: fonts.bold },
  otpRow: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', gap: 6, marginTop: 20 },
  otpInput: { flex: 1, minWidth: 0, height: 48, borderRadius: 8, borderWidth: 1, borderColor: BORDER, backgroundColor: '#F8FAFC', color: TEXT_PRIMARY, fontSize: 20, fontFamily: fonts.bold, textAlign: 'center' },
  verificationError: { color: '#DC2626', fontSize: 12, lineHeight: 18, fontFamily: fonts.semibold, textAlign: 'center', marginTop: 12 },
  successResendMessage: { color: '#166534', fontSize: 12, lineHeight: 18, fontFamily: fonts.semibold, textAlign: 'center', marginTop: 10 },
  successPrimary: { width: '100%', borderRadius: 9, overflow: 'hidden', marginTop: 16, shadowColor: ORANGE, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  successPrimaryInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 15 },
  successPrimaryText: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.extrabold },
  successResend: { marginTop: 14, paddingVertical: 8, paddingHorizontal: 6 },
  successResendText: { color: ORANGE_DARK, fontSize: 13, fontFamily: fonts.semibold, textAlign: 'center' },
});