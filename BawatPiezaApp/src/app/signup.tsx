import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
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
import { isEmailRegistered, supabase } from '../lib/supabase';
import {
  describeAuthError,
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
  const [step, setStep] = useState<Step>(0);
  const [firstName, setFirstName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);

  const validateStep = (): string | null => {
    if (step === 0) {
      return validateNamePart(firstName, 'First name') || validateNamePart(lastName, 'Last name');
    }
    if (step === 1) {
      return validateEmail(email) || validateContactNumber(contactNumber);
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

    setSubmitting(true);
    setError(null);
    try {
      const { data, error: signupError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            firstname: firstName.trim(),
            middlename: middleName.trim() || null,
            lastname: lastName.trim(),
            full_name: [firstName, middleName, lastName].filter(Boolean).join(' ').trim(),
            contact_number: contactNumber.trim(),
          },
        },
      });

      if (signupError) {
        setError(describeAuthError(signupError, 'signup'));
        return;
      }

      if (data.session) {
        router.replace('/home');
      } else {
        router.replace('/');
      }
    } catch (signupError) {
      setError(describeAuthError(signupError instanceof Error ? signupError : null, 'signup'));
    } finally {
      setSubmitting(false);
    }
  };

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
                {renderInput('call-outline', 'Contact number (+639XXXXXXXXX)', contactNumber, setContactNumber, { keyboardType: 'phone-pad' })}
                <Text style={styles.helperText}>Your email will be checked for an existing account when you create it.</Text>
              </>
            )}

            {step === 2 && (
              <>
                <Text style={styles.stepTitle}>Secure your account</Text>
                <Text style={styles.stepCopy}>Use at least 8 characters with upper/lowercase letters, a number, and a symbol.</Text>
                {renderPasswordInput('Password', password, setPassword, showPassword, setShowPassword)}
                {renderPasswordInput('Confirm password', confirmPassword, setConfirmPassword, showConfirmPassword, setShowConfirmPassword)}
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
              <Pressable style={styles.primaryButton} onPress={step === 2 ? handleSignup : nextStep} disabled={submitting || checkingEmail}>
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
  helperText: { color: 'rgba(255,255,255,0.52)', fontSize: 9.5, lineHeight: 14, marginTop: -2, marginBottom: 4 },
  errorText: { color: '#FDBA74', fontSize: 10.5, lineHeight: 15, fontFamily: fonts.semibold, marginBottom: 10 },
  buttonRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  backButton: { minWidth: 84, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 7, borderWidth: 1, borderColor: LINE, paddingHorizontal: 12 },
  backButtonText: { color: MUTED, fontSize: 12, fontFamily: fonts.bold },
  primaryButton: { flex: 1, borderRadius: 7, overflow: 'hidden' },
  primaryButtonInner: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 13, fontFamily: fonts.extrabold },
  footerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  footerText: { color: MUTED, fontSize: 11 },
  footerLink: { color: '#F6C445', fontSize: 11, fontFamily: fonts.extrabold, marginLeft: 4 },
});
