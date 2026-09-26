import React, { useEffect, useState } from 'react';
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
  ScrollView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { fonts } from '../theme';
import {
  supabase,
  signInWithGoogle,
  sendWelcomeEmailIfNew,
  markTermsAcceptancePending,
  flushPendingTermsAcceptance,
  isEmailRegistered,
  termsAcceptanceMetadata,
} from '../lib/supabase';
import { TermsModal } from '../components/terms-modal';
import {
  PASSWORD_MIN_LENGTH,
  describeAuthError,
  validateContactNumber,
  validateEmail,
  validateNamePart,
  validateNewPassword,
  validatePasswordStrength,
} from '../lib/validation';

const PRUSSIAN = '#0A2A4A';
const PRUSSIAN_SOFT = '#3B5B7A';

function GmailMark() {
  return (
    <View style={{ width: 20, height: 16, position: 'relative', marginRight: 2 }} accessibilityLabel="Gmail">
      <View style={{ position: 'absolute', left: 0, top: 2, width: 4, height: 14, backgroundColor: '#4285F4', borderRadius: 1 }} />
      <View style={{ position: 'absolute', left: 3, top: 0, width: 9, height: 4, backgroundColor: '#EA4335', transform: [{ rotate: '28deg' }], borderRadius: 1 }} />
      <View style={{ position: 'absolute', right: 3, top: 0, width: 9, height: 4, backgroundColor: '#FBBC04', transform: [{ rotate: '-28deg' }], borderRadius: 1 }} />
      <View style={{ position: 'absolute', right: 0, top: 2, width: 4, height: 14, backgroundColor: '#34A853', borderRadius: 1 }} />
    </View>
  );
}
const MUTED = 'rgba(10, 42, 74, 0.62)';
const OK = '#15803D';
const LINE = 'rgba(10, 42, 74, 0.12)';

function normalizePhilippineContact(value: string): string {
  let digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('63')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return `+63${digits.slice(0, 10)}`;
}

type FieldProps = {
  icon: keyof typeof Ionicons.glyphMap;
  placeholder: string;
  value: string;
  onChangeText: (value: string) => void;
  onBlur?: () => void;
  onSubmitEditing?: () => void;
  error?: string | null;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightPress?: () => void;
  secureTextEntry?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  autoCorrect?: boolean;
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
};

function Field({
  icon,
  placeholder,
  value,
  onChangeText,
  onBlur,
  onSubmitEditing,
  error,
  rightIcon,
  onRightPress,
  ...inputProps
}: FieldProps) {
  return (
    <View style={styles.fieldGroup}>
      <View style={[styles.inputBox, error && styles.inputBoxError]}>
        <Ionicons name={icon} size={18} color={error ? '#B91C1C' : MUTED} style={styles.inputIcon} />
        <TextInput
          style={styles.input}
          placeholder={placeholder}
          placeholderTextColor={MUTED}
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlur}
          onSubmitEditing={onSubmitEditing}
          {...inputProps}
        />
        {rightIcon && onRightPress ? (
          <TouchableOpacity onPress={onRightPress} hitSlop={8}>
            <Ionicons name={rightIcon} size={18} color={MUTED} />
          </TouchableOpacity>
        ) : null}
      </View>
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    </View>
  );
}

export default function SignupScreen() {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNo, setContactNo] = useState('');
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [emailChecking, setEmailChecking] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitting, setSubmitting] = useState(false);
  const [googleSigningIn, setGoogleSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Terms & Conditions agreement. The policy opens in a modal from the link on
  // this screen, and it must be read and accepted before either sign-up path
  // (email + password or Google Sign-In) is allowed to run.
  const [termsVisible, setTermsVisible] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [termsAcceptedAt, setTermsAcceptedAt] = useState<string | null>(null);
  const [termsError, setTermsError] = useState<string | null>(null);
  /** Which sign-up path opened the policy, so agreeing can resume it. */
  const [pendingAction, setPendingAction] = useState<'email' | 'google' | null>(null);

  useEffect(() => {
    const normalized = email.trim().toLowerCase();
    if (validateEmail(normalized)) {
      setEmailAvailable(null);
      setEmailChecking(false);
      return undefined;
    }

    let active = true;
    setEmailChecking(true);
    const timer = setTimeout(() => {
      void isEmailRegistered(normalized).then((registered) => {
        if (!active) return;
        setEmailAvailable(registered === true ? false : registered === false ? true : null);
        setEmailChecking(false);
      });
    }, 500);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [email]);

  // Handle OAuth redirect and check for existing session
  useEffect(() => {
    let authSubscription: ReturnType<typeof supabase.auth.onAuthStateChange>['data']['subscription'] | null = null;

    const initAuth = async () => {
      try {
        // First, check if there's an existing session (from OAuth redirect or previous login)
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session?.user) {
          // User is already authenticated - redirect to home
          console.log('SignupScreen: Existing session found, redirecting to home');
          router.replace('/provisioning');
          return;
        }

        // If no session, listen for auth state changes (handles OAuth callback)
        authSubscription = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'SIGNED_IN' && session?.user) {
            console.log('SignupScreen: SIGNED_IN event received, redirecting to home');
            // Send a welcome email for brand-new accounts (non-blocking)
            sendWelcomeEmailIfNew();
            // Small delay to ensure everything is ready
            setTimeout(() => {
              router.replace('/provisioning');
            }, 200);
          }
        }).data.subscription;
      } catch (err) {
        console.error('SignupScreen: Error checking session:', err);
      }
    };

    initAuth();

    // Cleanup
    return () => {
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, [router]);

  const fullName = [firstName, middleName, lastName].filter(Boolean).join(' ');
  const fieldErrors = {
    firstName: validateNamePart(firstName, 'First name'),
    lastName: validateNamePart(lastName, 'Last name'),
    email: validateEmail(email),
    contactNo: validateContactNumber(contactNo),
    password: validateNewPassword(password, confirmPassword),
  };

  const markTouched = (field: string) => setTouched((current) => ({ ...current, [field]: true }));
  const visibleError = (field: keyof typeof fieldErrors) => touched[field] ? fieldErrors[field] : null;
  const emailAvailabilityError = emailAvailable === false ? 'This email is already registered.' : null;
  const passwordError = validatePasswordStrength(password);

  const validateStep = (target: 1 | 2 | 3): string | null => {
    if (target === 1) return validateNamePart(firstName, 'First name') ?? validateNamePart(lastName, 'Last name');
    if (target === 2) return validateEmail(email) ?? emailAvailabilityError ?? validateContactNumber(contactNo);
    return validateEmail(email) ?? validateNewPassword(password, confirmPassword);
  };

  const goNext = () => {
    const fields = step === 1 ? ['firstName', 'lastName'] : ['email', 'contactNo'];
    setTouched((current) => ({ ...current, ...Object.fromEntries(fields.map((field) => [field, true])) }));
    if (!validateStep(step)) setStep((current) => (current + 1) as 1 | 2 | 3);
  };

  const validateEmailForm = (): string | null =>
    validateStep(1) ?? (emailAvailable === false ? 'This email is already registered.' : null) ?? validateStep(2) ?? validateStep(3);

  // Manual registration (email + password) — no admin required.
  const submitEmailSignUp = async (acceptedAt: string) => {
    setError(null);
    setInfo(null);

    const validationError = validateEmailForm();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      const { data, error: signUpErr } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
              firstname: firstName.trim(),
              middlename: middleName.trim(),
              lastname: lastName.trim(),
              contactNo: contactNo.trim(),
            // Proof of consent captured by the Terms & Conditions gate.
            ...termsAcceptanceMetadata(acceptedAt),
          },
        },
      });

      if (signUpErr) {
        setError(describeAuthError(signUpErr, 'signup'));
        return;
      }

      // Supabase deliberately returns a decoy user with an empty `identities`
      // array when the address is already registered, instead of an error.
      const alreadyRegistered =
        !!data?.user &&
        Array.isArray(data.user.identities) &&
        data.user.identities.length === 0;

      if (alreadyRegistered) {
        setError(
          'Email already used. Sign in with this address instead, or register with a different email.',
        );
        return;
      }

      // Trigger the welcome email for the brand-new account (non-blocking).
      sendWelcomeEmailIfNew();

      if (data.session) {
        // Session was created immediately (email verification disabled).
        router.replace('/provisioning');
      } else {
        // Email confirmation is enabled — prompt the user to verify.
        setInfo(
          `Account created! A confirmation link was sent to ${email.trim()}. Please verify your email, then sign in.`,
        );
      }
    } catch (authErr) {
      const message =
        authErr instanceof Error
          ? describeAuthError({ message: authErr.message }, 'signup')
          : 'Unable to create your account. Please try again.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const submitGoogleSignUp = async (acceptedAt: string) => {
    setGoogleSigningIn(true);
    setError(null);

    try {
      // The OAuth round trip leaves our JS context (and on web reloads the page
      // entirely), so park the acceptance until an account actually exists.
      await markTermsAcceptancePending(acceptedAt);

      // Opens Google's consent screen in the in-app browser and establishes
      // the Supabase session when the deep link returns.
      await signInWithGoogle();

      // signInWithGoogle() only resolves after the session is actually set.
      // Navigate immediately instead of relying solely on the auth listener.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        await flushPendingTermsAcceptance();
        sendWelcomeEmailIfNew();
        router.replace('/provisioning');
      } else {
        setError('Sign-up finished, but no session was created. Please try again.');
      }
    } catch (authError) {
      const message =
        authError instanceof Error
          ? describeAuthError({ message: authError.message }, 'signup')
          : 'Unable to sign up with Google. Please try again.';
      setError(message);
      Alert.alert('Google sign up failed', message);
    } finally {
      setGoogleSigningIn(false);
    }
  };

  /* ----------------------- Terms & Conditions gate ----------------------- */

  /** Records the agreement and the timestamp it was given at. */
  const agreeToTerms = (acceptedAt: string) => {
    setTermsAgreed(true);
    setTermsAcceptedAt(acceptedAt);
    setTermsError(null);
  };

  /**
   * Runs the real account-creation call once the Terms have been accepted. The
   * acceptance timestamp travels with the request so the consent is stored on
   * the account itself.
   */
  const runAccountAction = async (action: 'email' | 'google', acceptedAt: string) => {
    if (action === 'email') await submitEmailSignUp(acceptedAt);
    else await submitGoogleSignUp(acceptedAt);
  };

  /**
   * Single entry point for both "Create Account" and "Sign up with Google".
   * Nothing is sent until the Terms & Conditions have been read in the policy
   * modal - reaching the end ticks the agreement automatically - so the
   * requirement applies to every provider. Once accepted in this session the
   * user is not asked again.
   */
  const requireTerms = (action: 'email' | 'google') => {
    if (!termsAgreed) {
      setTermsError('Please read and accept the Terms & Conditions to continue.');
      setPendingAction(action);
      setTermsVisible(true);
      return;
    }
    void runAccountAction(action, termsAcceptedAt ?? new Date().toISOString());
  };

  const handleSignUp = () => {
    // Validate the form first so the policy is only withheld for a form that can
    // actually be submitted.
    setTouched((current) => ({ ...current, email: true, password: true, contactNo: true }));
    const validationError = validateEmailForm();
    if (validationError) {
      setError(validationError);
      setInfo(null);
      return;
    }
    requireTerms('email');
  };

  const handleGoogleSignIn = () => requireTerms('google');

  /** Opens the policy from the link on the form (no sign-up pending). */
  const openTerms = () => {
    setPendingAction(null);
    setTermsVisible(true);
  };

  const handleTermsAccept = (acceptedAt: string) => {
    agreeToTerms(acceptedAt);
    setTermsVisible(false);
    const action = pendingAction;
    setPendingAction(null);
    // Resume the sign-up that asked for the policy.
    if (action) void runAccountAction(action, acceptedAt);
  };

  const handleTermsDecline = () => {
    setTermsVisible(false);
    setPendingAction(null);
    setTermsError('You must read and accept the Terms & Conditions to create an account.');
  };

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#F4F4F4', '#EAF1F7', '#F4F4F4']} style={StyleSheet.absoluteFill} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboard}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.header}>
            <Image source={require('../../assets/images/LOGO3.png')} style={styles.logo} resizeMode="contain" />
            <Text style={styles.brandTitle}>Create Account</Text>
            <Text style={styles.brandSubtitle}>Register manually or continue with Google</Text>
          </View>

          <View style={styles.card}>
            <View style={styles.stepHeader}>
              <View>
                <Text style={styles.title}>Join BawatPieza</Text>
                <Text style={styles.subtitle}>Create your account in three quick steps</Text>
              </View>
              <Text style={styles.stepCount}>{step} / 3</Text>
            </View>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${(step / 3) * 100}%` }]} />
            </View>
            <Text style={styles.stepTitle}>
              {step === 1 ? 'Tell us about yourself' : step === 2 ? 'How can we reach you?' : 'Secure your account'}
            </Text>

            {step === 1 ? (
              <>
                <Field
                  icon="person-outline"
                  placeholder="First name"
                  value={firstName}
                  onChangeText={setFirstName}
                  onBlur={() => markTouched('firstName')}
                  error={visibleError('firstName')}
                  autoCapitalize="words"
                />
                <Field
                  icon="person-outline"
                  placeholder="Middle name (optional)"
                  value={middleName}
                  onChangeText={setMiddleName}
                  autoCapitalize="words"
                />
                <Field
                  icon="person-outline"
                  placeholder="Last name"
                  value={lastName}
                  onChangeText={setLastName}
                  onBlur={() => markTouched('lastName')}
                  error={visibleError('lastName')}
                  autoCapitalize="words"
                  onSubmitEditing={goNext}
                />
              </>
            ) : step === 2 ? (
              <>
                <Field
                  icon="mail-outline"
                  placeholder="Email address"
                  value={email}
                  onChangeText={(value) => { setEmail(value); markTouched('email'); }}
                  onBlur={() => markTouched('email')}
                  error={visibleError('email') ?? emailAvailabilityError}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                />
                <Field
                  icon="call-outline"
                  placeholder="+63 9XXXXXXXXX"
                  value={contactNo}
                  onChangeText={(value) => { setContactNo(normalizePhilippineContact(value)); markTouched('contactNo'); }}
                  onBlur={() => markTouched('contactNo')}
                  error={visibleError('contactNo')}
                  keyboardType="phone-pad"
                  onSubmitEditing={goNext}
                />
              </>
            ) : (
              <>
                <Field
                  icon="lock-closed-outline"
                  placeholder={`Password (min. ${PASSWORD_MIN_LENGTH} characters)`}
                  value={password}
                  onChangeText={(value) => { setPassword(value); markTouched('password'); }}
                  onBlur={() => markTouched('password')}
                  error={touched.password ? passwordError : null}
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  rightIcon={showPassword ? 'eye-off-outline' : 'eye-outline'}
                  onRightPress={() => setShowPassword((value) => !value)}
                />
                <Field
                  icon="lock-closed-outline"
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  onBlur={() => markTouched('password')}
                  error={touched.password && confirmPassword && password !== confirmPassword ? 'Passwords do not match.' : null}
                  secureTextEntry={!showConfirmPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  rightIcon={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'}
                  onRightPress={() => setShowConfirmPassword((value) => !value)}
                />
                <TouchableOpacity
                  style={styles.termsLink}
                  onPress={openTerms}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Read the Terms and Conditions"
                >
                  <Ionicons name={termsAgreed ? 'checkmark-circle' : 'document-text-outline'} size={15} color={termsAgreed ? OK : MUTED} />
                  <Text style={[styles.termsLinkText, termsAgreed && styles.termsLinkTextDone]}>
                    {termsAgreed ? 'Terms & Conditions accepted' : 'Read and accept the Terms & Conditions (required)'}
                  </Text>
                  {termsAgreed ? null : <Ionicons name="chevron-forward" size={13} color={MUTED} />}
                </TouchableOpacity>
              </>
            )}

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {info ? <Text style={styles.infoText}>{info}</Text> : null}

            <View style={styles.stepActions}>
              {step > 1 ? (
                <TouchableOpacity style={styles.backButton} onPress={() => setStep((current) => (current - 1) as 1 | 2 | 3)} disabled={submitting}>
                  <Ionicons name="arrow-back" size={16} color={PRUSSIAN} />
                  <Text style={styles.backButtonText}>Back</Text>
                </TouchableOpacity>
              ) : <View />}
              <TouchableOpacity style={styles.primaryButton} onPress={step === 3 ? handleSignUp : goNext} activeOpacity={0.9} disabled={submitting}>
                <LinearGradient colors={[PRUSSIAN, PRUSSIAN_SOFT]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.primaryButtonInner}>
                  {submitting ? <ActivityIndicator color="#FFFFFF" size="small" /> : <>
                    <Text style={styles.primaryButtonText}>{step === 3 ? 'Create Account' : 'Continue'}</Text>
                    <Ionicons name={step === 3 ? 'checkmark' : 'arrow-forward'} size={16} color="#FFFFFF" />
                  </>}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {step === 1 ? (
              <>
                <View style={styles.dividerRow}><View style={styles.divider} /><Text style={styles.dividerText}>or continue with</Text><View style={styles.divider} /></View>
                <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn} activeOpacity={0.9} disabled={googleSigningIn}>
                  {googleSigningIn ? <ActivityIndicator color={PRUSSIAN} size="small" /> : <><GmailMark /><Text style={styles.googleButtonText}>Sign up with Google</Text></>}
                </TouchableOpacity>
              </>
            ) : null}
          </View>

          <View style={styles.footerRow}>
            <Text style={styles.footerText}>Already registered?</Text>
            <TouchableOpacity onPress={() => router.replace('/')}>
              <Text style={styles.footerLink}>Back to sign in</Text>
            </TouchableOpacity>
          </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      {/* Terms & Conditions gate — blocks both sign-up providers until agreed. */}
      <TermsModal
        visible={termsVisible}
        variant="light"
        confirmLabel={pendingAction ? 'Agree & continue' : 'I agree'}
        busy={submitting || googleSigningIn}
        onAccept={handleTermsAccept}
        onDecline={handleTermsDecline}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F4F4' },
  safeArea: { flex: 1 },
  keyboard: { flex: 1 },
  scroll: { flex: 1, width: '100%' },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  header: { alignItems: 'center', marginBottom: 14 },
  logo: { width: 180, height: 90, marginBottom: 4 },
  brandTitle: { color: PRUSSIAN, fontSize: 26, fontWeight: '800', fontFamily: fonts.extrabold, letterSpacing: -0.6 },
  brandSubtitle: {
    marginTop: 5,
    color: MUTED,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontWeight: '700', fontFamily: fonts.bold,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: LINE,
    padding: 18,
    shadowColor: '#0A2A4A',
    shadowOpacity: 0.08,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
  },
  stepHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  stepCount: { color: PRUSSIAN, fontSize: 11, fontFamily: fonts.bold, marginTop: 4 },
  progressTrack: { height: 4, borderRadius: 3, backgroundColor: 'rgba(10,42,74,0.10)', overflow: 'hidden', marginBottom: 14 },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: PRUSSIAN },
  stepTitle: { color: PRUSSIAN, fontSize: 15, fontFamily: fonts.extrabold, marginBottom: 11 },
  title: { fontSize: 25, fontWeight: '800', fontFamily: fonts.extrabold, color: PRUSSIAN, marginBottom: 5 },
  subtitle: { color: MUTED, fontSize: 12, marginBottom: 14 },
  fieldGroup: { width: '100%' },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: LINE,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 5,
  },
  inputBoxError: { borderColor: 'rgba(185, 28, 28, 0.55)' },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: PRUSSIAN, paddingVertical: 2 },
  fieldError: { color: '#B91C1C', fontSize: 11, fontFamily: fonts.medium, marginBottom: 8, marginLeft: 4 },
  stepActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8 },
  backButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 14, paddingHorizontal: 4 },
  backButtonText: { color: PRUSSIAN, fontSize: 13, fontFamily: fonts.bold },
  primaryButton: { borderRadius: 12, overflow: 'hidden', marginTop: 6, flex: 1 },
  primaryButtonInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  primaryButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', fontFamily: fonts.extrabold },
  errorText: {
    backgroundColor: 'rgba(185, 28, 28, 0.08)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(185, 28, 28, 0.3)',
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
  },
  infoText: {
    backgroundColor: 'rgba(21, 128, 61, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(21, 128, 61, 0.35)',
    color: '#15803D',
    fontSize: 12,
    fontWeight: '600', fontFamily: fonts.semibold,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    lineHeight: 18,
  },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  divider: { flex: 1, height: 1, backgroundColor: 'rgba(10, 42, 74, 0.14)' },
  dividerText: { color: MUTED, fontSize: 11, marginHorizontal: 12, textTransform: 'uppercase', letterSpacing: 1.2, fontWeight: '700', fontFamily: fonts.bold },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  footerText: { color: MUTED, fontSize: 13 },
  footerLink: { color: PRUSSIAN, fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold, marginLeft: 4 },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 20,
    marginTop: 12,
    shadowColor: '#0A2A4A',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  googleIcon: { marginRight: 10 },
  googleButtonText: { color: PRUSSIAN, fontSize: 14, fontWeight: '700', fontFamily: fonts.bold },
  termsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  termsLinkText: {
    flex: 1,
    color: MUTED,
    fontSize: 12,
    fontFamily: fonts.medium,
    lineHeight: 16,
  },
  termsLinkTextDone: { color: OK },
});

