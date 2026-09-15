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
  termsAcceptanceMetadata,
} from '../lib/supabase';
import { TermsModal } from '../components/terms-modal';
import {
  PASSWORD_MIN_LENGTH,
  describeAuthError,
  validateEmail,
  validateFullName,
  validateNewPassword,
} from '../lib/validation';

const PRUSSIAN = '#0A2A4A';
const PRUSSIAN_SOFT = '#3B5B7A';
const MUTED = 'rgba(10, 42, 74, 0.62)';
const OK = '#15803D';
const LINE = 'rgba(10, 42, 74, 0.12)';

export default function SignupScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
          router.replace('/home');
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
              router.replace('/home');
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

  /** Returns a message when the manual sign-up form is not submittable yet. */
  const validateEmailForm = (): string | null =>
    validateFullName(fullName) ??
    validateEmail(email) ??
    validateNewPassword(password, confirmPassword);

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
        router.replace('/home');
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
        router.replace('/home');
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
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboard}>
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
            <Text style={styles.title}>Join BawatPieza</Text>
            <Text style={styles.subtitle}>Create your account to get started</Text>

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
                autoCorrect={false}
              />
            </View>

            <View style={styles.inputBox}>
              <Ionicons name="lock-closed-outline" size={18} color={MUTED} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={`Password (min. ${PASSWORD_MIN_LENGTH} characters)`}
                placeholderTextColor={MUTED}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={MUTED} />
              </TouchableOpacity>
            </View>

            <View style={styles.inputBox}>
              <Ionicons name="lock-closed-outline" size={18} color={MUTED} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder={`Confirm password`}
                placeholderTextColor={MUTED}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity onPress={() => setShowConfirmPassword(!showConfirmPassword)}>
                <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={18} color={MUTED} />
              </TouchableOpacity>
            </View>


            <TouchableOpacity
              style={styles.termsLink}
              onPress={openTerms}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Read the Terms and Conditions"
            >
              <Ionicons
                name={termsAgreed ? 'checkmark-circle' : 'document-text-outline'}
                size={15}
                color={termsAgreed ? OK : MUTED}
              />
              <Text style={[styles.termsLinkText, termsAgreed && styles.termsLinkTextDone]}>
                {termsAgreed
                  ? 'Terms & Conditions accepted'
                  : 'Read and accept the Terms & Conditions (required)'}
              </Text>
              {termsAgreed ? null : <Ionicons name="chevron-forward" size={13} color={MUTED} />}
            </TouchableOpacity>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}
            {info ? <Text style={styles.infoText}>{info}</Text> : null}

            <TouchableOpacity style={styles.primaryButton} onPress={handleSignUp} activeOpacity={0.9} disabled={submitting}>
              <LinearGradient
                colors={[PRUSSIAN, PRUSSIAN_SOFT]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.primaryButtonInner}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <>
                    <Text style={styles.primaryButtonText}>Create Account</Text>
                    <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>

            <View style={styles.dividerRow}>
              <View style={styles.divider} />
              <Text style={styles.dividerText}>or continue with</Text>
              <View style={styles.divider} />
            </View>

            <TouchableOpacity
              style={styles.googleButton}
              onPress={handleGoogleSignIn}
              activeOpacity={0.9}
              disabled={googleSigningIn}
            >
              {googleSigningIn ? (
                <ActivityIndicator color={PRUSSIAN} size="small" />
              ) : (
                <>
                  <Ionicons name="logo-google" size={20} color="#EA4335" style={styles.googleIcon} />
                  <Text style={styles.googleButtonText}>Sign up with Google</Text>
                </>
              )}
            </TouchableOpacity>
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
    paddingVertical: 24,
  },
  header: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 230, height: 128, marginBottom: 10 },
  brandTitle: { color: PRUSSIAN, fontSize: 32, fontWeight: '800', fontFamily: fonts.extrabold, letterSpacing: -0.8 },
  brandSubtitle: {
    marginTop: 8,
    color: MUTED,
    fontSize: 12,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontWeight: '700', fontFamily: fonts.bold,
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
  title: { fontSize: 28, fontWeight: '800', fontFamily: fonts.extrabold, color: PRUSSIAN, marginBottom: 8 },
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
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 18 },
  footerText: { color: MUTED, fontSize: 13 },
  footerLink: { color: PRUSSIAN, fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold, marginLeft: 4 },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginTop: 16,
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

