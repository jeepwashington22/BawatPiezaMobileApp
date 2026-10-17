import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
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
import { isEmailRegistered, supabase, termsAcceptanceMetadata } from '../lib/supabase';
import { useAuth } from '../hooks/use-auth';
import { TermsModal } from '../components/terms-modal';
import {
  describeAuthError,
  PASSWORD_MIN_LENGTH,
  validateContactNumber,
  validateEmail,
  validateNamePart,
  validateNewPassword,
} from '../lib/validation';

const ORANGE = '#F97316';
const ORANGE_DARK = '#C2410C';
const MUTED = 'rgba(255, 255, 255, 0.68)';
const LINE = 'rgba(255, 255, 255, 0.14)';

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
  const [justSignedUp, setJustSignedUp] = useState(false);

  // Already signed in (and NOT just finishing a fresh signup) → dashboard.
  // The success modal suppresses this so the verification step is never
  // skipped by a transient session right after signUp. `justSignedUp` covers
  // the gap between signUp resolving and the modal mounting, where neither
  // `submitting` nor `successVisible` alone is true yet.
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
      const { data, error: signupError } = await supabase.auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          data: {
            firstname: firstName.trim(),
            middlename: middleName.trim() || null,
            lastname: lastName.trim(),
            full_name: [firstName, middleName, lastName].filter(Boolean).join(' ').trim(),
            contact_number: `+639${contactDigits}`,
            ...termsAcceptanceMetadata(termsAcceptedAt),
          },
        },
      });

      if (signupError) {
        setJustSignedUp(false);
        setError(describeAuthError(signupError, 'signup'));
        return;
      }

      // Supabase sends the confirmation email itself. Whether one was sent is
      // observable: with "Confirm email" ON there is NO session (user must
      // click the link first); with it OFF a session is returned immediately
      // and no email goes out. Never trust a silent signup — record it.
      let verificationEmailSent = !data.session;
      if (!data.session && !data.user) {
        // Defensive: no user and no session means nothing was created.
        setJustSignedUp(false);
        setError('Account creation did not complete. Please try again.');
        return;
      }

      // "Confirm email" OFF → Supabase auto-signed the user in and sent
      // nothing. Try to trigger the verification email explicitly; if that
      // also yields nothing, tell the user the truth instead of claiming an
      // email was sent.
      if (data.session) {
        await supabase.auth.signOut();
        try {
          const { error: resendError } = await supabase.auth.resend({
            type: 'signup',
            email: normalizedEmail,
          });
          verificationEmailSent = !resendError;
        } catch {
          verificationEmailSent = false;
        }
      }

      // Manual email registration always requires the user to verify through
      // the email link before signing in. Never let a fresh account land on
      // the dashboard: any session above was cleared so the auth gate keeps
      // the user on public routes until they sign in.
      // Explicit success state: show the verification modal that names the
      // exact inbox (the email box input), then send the user to sign in.
      setCreatedEmail(normalizedEmail);
      setEmailSent(verificationEmailSent);
      setResendMessage(null);
      setSuccessVisible(true);
      // Keep `justSignedUp` true until the user leaves for sign-in so no
      // session blip can bounce this screen to /home mid-modal.
    } catch (signupError) {
      setJustSignedUp(false);
      setError(describeAuthError(signupError instanceof Error ? signupError : null, 'signup'));
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
    try {
      const { error: resendError } = await supabase.auth.resend({
        type: 'signup',
        email: target,
      });
      if (resendError) {
        // "already confirmed" just means the inbox link already worked — the
        // user can go straight to sign in.
        const message = (resendError.message ?? '').toLowerCase();
        if (message.includes('already') && message.includes('confirm')) {
          setEmailSent(true);
          setResendMessage('This email is already verified. Go to sign in and log in with your credentials.');
        } else {
          setResendMessage(describeAuthError(resendError, 'signup'));
        }
        return;
      }
      setEmailSent(true);
      setResendMessage(`Verification email re-sent to ${target}. Check your inbox and spam folder.`);
    } catch (resendError) {
      setResendMessage(describeAuthError(resendError instanceof Error ? resendError : null, 'signup'));
    } finally {
      setResending(false);
    }
  };

  const handleGoToSignIn = () => {
    setSuccessVisible(false);
    // Return to the sign-in screen with the created email prefilled via params;
    // the account can only log in after the emailed link is confirmed.
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
      <Ionicons name={icon} size={17} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={MUTED}
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
      <Ionicons name="lock-closed-outline" size={17} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
      <TextInput
        style={styles.input}
        placeholder={placeholder}
        placeholderTextColor={MUTED}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={!visible}
        autoCapitalize="none"
      />
      <Pressable onPress={() => setVisible(!visible)} hitSlop={10} accessibilityLabel={visible ? 'Hide password' : 'Show password'}>
        <Ionicons name={visible ? 'eye-off-outline' : 'eye-outline'} size={18} color={MUTED} />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#8F350E', '#2A0D06', '#120705']} style={StyleSheet.absoluteFill} />
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
                  <Ionicons name="call-outline" size={17} color="rgba(255,255,255,0.45)" style={styles.inputIcon} />
                  <Text style={styles.phonePrefix}>+639</Text>
                  <TextInput
                    style={styles.phoneInput}
                    placeholder="XXXXXXXXX"
                    placeholderTextColor="rgba(255,255,255,0.35)"
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
                        color={check.met ? '#86EFAC' : 'rgba(255,255,255,0.48)'}
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
                      color={password === confirmPassword ? '#86EFAC' : '#FDBA74'}
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
                  <Ionicons name={termsAcceptedAt ? 'checkmark-circle' : 'document-text-outline'} size={15} color={termsAcceptedAt ? '#86EFAC' : '#F6C445'} />
                  <Text style={[styles.termsLinkText, termsAcceptedAt && styles.termsLinkAccepted]}>
                    {termsAcceptedAt ? 'Terms & Conditions accepted' : 'Read and agree to the Terms & Conditions'}
                  </Text>
                  {!termsAcceptedAt && <Ionicons name="chevron-forward" size={14} color="#F6C445" />}
                </Pressable>
              </>
            )}

            {error && <Text style={styles.errorText}>{error}</Text>}

            <View style={styles.buttonRow}>
              {step > 0 && (
                <Pressable style={styles.backButton} onPress={() => { setError(null); setStep((current) => (current - 1) as Step); }}>
                  <Ionicons name="arrow-back" size={16} color={MUTED} />
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
                  {submitting || checkingEmail ? <ActivityIndicator color="#FFFFFF" /> : <><Text style={styles.primaryButtonText}>{step === 2 ? 'Create account' : 'Continue'}</Text><Ionicons name="arrow-forward" size={16} color="#FFFFFF" /></>}
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
        variant="dark"
        confirmLabel="I Agree & Continue"
        onAccept={(acceptedAt) => {
          setTermsAcceptedAt(acceptedAt);
          setTermsVisible(false);
          setError(null);
        }}
        onDecline={() => setTermsVisible(false)}
      />
      {/* Success + verify-email gate: explicit confirmation, names the inbox
          from the email box, then routes to sign in — never to the dashboard. */}
      <Modal visible={successVisible} transparent animationType="fade" onRequestClose={handleGoToSignIn}>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={44} color="#22C55E" />
            </View>
            <Text style={styles.successTitle}>Account created successfully</Text>
            <Text style={styles.successCopy}>
              {emailSent ? (
                <>
                  We sent a verification email to{' '}
                  <Text style={styles.successEmail}>{createdEmail || email.trim().toLowerCase()}</Text>. Open it and
                  confirm your email address before signing in. Check your spam folder if you do not see it.
                </>
              ) : (
                <>
                  Your account for <Text style={styles.successEmail}>{createdEmail || email.trim().toLowerCase()}</Text>{' '}
                  was created, but the verification email could not be sent (email confirmation may be off or the mail
                  service rate-limited the send). Tap “Resend verification” below, then confirm before signing in.
                </>
              )}
            </Text>
            <View style={styles.successSteps}>
              <View style={styles.successStepRow}>
                <Ionicons name="mail-open-outline" size={15} color="#F6C445" />
                <Text style={styles.successStepText}>1. Open your inbox for the address above</Text>
              </View>
              <View style={styles.successStepRow}>
                <Ionicons name="link-outline" size={15} color="#F6C445" />
                <Text style={styles.successStepText}>2. Tap the confirmation link to verify</Text>
              </View>
              <View style={styles.successStepRow}>
                <Ionicons name="log-in-outline" size={15} color="#F6C445" />
                <Text style={styles.successStepText}>3. Return here and sign in with your credentials</Text>
              </View>
            </View>
            {resendMessage ? <Text style={styles.successResendMessage}>{resendMessage}</Text> : null}
            <Pressable style={styles.successPrimary} onPress={handleGoToSignIn} accessibilityRole="button" accessibilityLabel="Go to sign in">
              <LinearGradient colors={[ORANGE, ORANGE_DARK]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.successPrimaryInner}>
                <Text style={styles.successPrimaryText}>Go to sign in</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
              </LinearGradient>
            </Pressable>
            <Pressable style={styles.successResend} onPress={handleResendVerification} disabled={resending} accessibilityRole="button" accessibilityLabel="Resend verification email">
              {resending ? (
                <ActivityIndicator size="small" color="#F6C445" />
              ) : (
                <Text style={styles.successResendText}>Didn&apos;t get the email? Resend verification</Text>
              )}
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#120705' },
  safeArea: { flex: 1 },
  flex: { flex: 1, alignItems: 'center', paddingHorizontal: 18, paddingTop: 24, paddingBottom: 24 },
  header: { width: '100%', alignItems: 'center', paddingBottom: 14 },
  logo: { width: 132, height: 106, marginBottom: 2 },
  welcomeText: { color: 'rgba(255,255,255,0.62)', fontSize: 10, letterSpacing: 1.1, textTransform: 'uppercase', fontFamily: fonts.bold },
  brandTitle: { color: '#FFFFFF', fontSize: 25, lineHeight: 30, fontFamily: fonts.extrabold, marginTop: 3 },
  brandSubtitle: { marginTop: 4, color: MUTED, fontSize: 10, fontFamily: fonts.medium },
  progressTrack: { width: '100%', maxWidth: 420, flexDirection: 'row', gap: 6, marginBottom: 8 },
  progressStep: { flex: 1, height: 4, borderRadius: 99, backgroundColor: 'rgba(255,255,255,0.16)' },
  progressStepActive: { backgroundColor: ORANGE },
  card: { width: '100%', maxWidth: 420, paddingVertical: 14, paddingHorizontal: 4 },
  stepTitle: { color: '#FFFFFF', fontSize: 16, fontFamily: fonts.extrabold, marginBottom: 3 },
  stepCopy: { color: MUTED, fontSize: 10.5, lineHeight: 15, fontFamily: fonts.medium, marginBottom: 14 },
  inputBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.075)', borderRadius: 7, borderWidth: 1, borderColor: LINE, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 12 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 14, color: '#FFFFFF', paddingVertical: 2 },
  phonePrefix: { color: '#FFFFFF', fontSize: 14, fontFamily: fonts.semibold, paddingRight: 4 },
  phoneInput: { flex: 1, fontSize: 14, color: '#FFFFFF', paddingVertical: 2 },
  phoneHint: { color: 'rgba(255,255,255,0.52)', fontSize: 9.5, marginTop: -8, marginBottom: 10 },
  passwordChecklist: { marginTop: -4, marginBottom: 10, padding: 10, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.045)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  passwordChecklistTitle: { color: 'rgba(255,255,255,0.72)', fontSize: 10, fontFamily: fonts.semibold, marginBottom: 6 },
  passwordCheckRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  passwordCheckText: { color: 'rgba(255,255,255,0.58)', fontSize: 10, fontFamily: fonts.medium },
  passwordCheckTextMet: { color: '#BBF7D0' },
  passwordMatchRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: -8, marginBottom: 10, marginLeft: 4 },
  termsLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2, marginBottom: 8, paddingVertical: 4 },
  termsLinkText: { flex: 1, color: '#F6C445', fontSize: 10, fontFamily: fonts.semibold },
  termsLinkAccepted: { color: '#BBF7D0' },
  helperText: { color: 'rgba(255,255,255,0.52)', fontSize: 9.5, lineHeight: 14, marginTop: -2, marginBottom: 4 },
  errorText: { color: '#FDBA74', fontSize: 10.5, lineHeight: 15, fontFamily: fonts.semibold, marginBottom: 10 },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  backButton: { minWidth: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 7, borderWidth: 1, borderColor: LINE, paddingHorizontal: 12 },
  backButtonText: { color: MUTED, fontSize: 12, fontFamily: fonts.bold },
  primaryButton: { flex: 1, borderRadius: 7, overflow: 'hidden' },
  primaryButtonDisabled: { opacity: 0.45 },
  primaryButtonInner: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontFamily: fonts.extrabold },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  footerText: { color: MUTED, fontSize: 11 },
  footerLink: { color: '#F6C445', fontSize: 11, fontFamily: fonts.extrabold, marginLeft: 4 },
  successOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.68)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  successCard: { width: '100%', maxWidth: 400, borderRadius: 18, backgroundColor: '#2A0D06', borderWidth: 1, borderColor: 'rgba(249,115,22,0.4)', padding: 24, alignItems: 'center' },
  successIconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(34,197,94,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  successTitle: { color: '#FFFFFF', fontSize: 19, fontFamily: fonts.extrabold, textAlign: 'center' },
  successCopy: { color: 'rgba(255,255,255,0.74)', fontSize: 12, lineHeight: 18, fontFamily: fonts.medium, textAlign: 'center', marginTop: 10 },
  successEmail: { color: '#F6C445', fontFamily: fonts.bold },
  successSteps: { width: '100%', marginTop: 14, marginBottom: 6, padding: 12, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)' },
  successStepRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 3 },
  successStepText: { flex: 1, color: 'rgba(255,255,255,0.78)', fontSize: 11, fontFamily: fonts.medium },
  successResendMessage: { color: '#BBF7D0', fontSize: 11, lineHeight: 16, fontFamily: fonts.semibold, textAlign: 'center', marginTop: 8 },
  successPrimary: { width: '100%', borderRadius: 9, overflow: 'hidden', marginTop: 12 },
  successPrimaryInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  successPrimaryText: { color: '#FFFFFF', fontSize: 13, fontFamily: fonts.extrabold },
  successResend: { marginTop: 10, paddingVertical: 8, paddingHorizontal: 6 },
  successResendText: { color: '#F6C445', fontSize: 11.5, fontFamily: fonts.semibold, textAlign: 'center' },
});
