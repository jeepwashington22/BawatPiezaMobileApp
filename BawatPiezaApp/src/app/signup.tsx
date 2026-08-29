import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from 'react-native';
import { Video, ResizeMode } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';

const { height } = Dimensions.get('window');
const GOLD = '#D9A75C';

export default function SignupScreen() {
  const router = useRouter();
  const videoRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSignup = () => {
    // Hook up to your auth logic here
    console.log('Signing up with', email);
    router.push('/Login/login'); // Go back to login after signup
  };

  return (
    <View style={styles.container}>
      {/* Looping video background */}
      <Video
        ref={videoRef}
        source={require('@/assets/images/videobg.mp4')}
        style={StyleSheet.absoluteFill}
        resizeMode={ResizeMode.COVER}
        isLooping
        shouldPlay
        isMuted
        rate={1.0}
      />

      {/* Color-graded gradient so the bg reads as "branded" rather than raw footage */}
      <LinearGradient
        colors={['rgba(6,10,26,0.55)', 'rgba(10,14,38,0.35)', 'rgba(4,6,18,0.92)']}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />

      {/* Soft radial-style glow accent, purple-leaning to differentiate from the cyan footage */}
      <View pointerEvents="none" style={styles.glowTop} />
      <View pointerEvents="none" style={styles.glowBottom} />

      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          {/* Brand header */}
          <View style={styles.header}>
            <View style={styles.logoDot} />
            <Text style={styles.brand}>NEXORA</Text>
            <Text style={styles.tagline}>Create your account</Text>
          </View>

          {/* Glass form card */}
          <BlurView intensity={40} tint="dark" style={styles.card}>
            <View style={styles.cardInner}>
              <Text style={styles.title}>
                Welcome <Text style={styles.titleAccent}>Back</Text>
              </Text>
              <Text style={styles.subtitle}>Sign up to continue your engineering journey</Text>

              {/* Email */}
              <View style={styles.inputBox}>
                <Ionicons name="mail-outline" size={18} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                <View style={styles.inputTextWrap}>
                  <Text style={styles.inputLabel}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your email"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    keyboardType="email-address"
                  />
                </View>
              </View>

              {/* Password */}
              <View style={[styles.inputBox, { marginTop: 14 }]}>
                <Ionicons name="lock-closed-outline" size={18} color="rgba(255,255,255,0.5)" style={styles.inputIcon} />
                <View style={styles.inputTextWrap}>
                  <Text style={styles.inputLabel}>Password</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor="rgba(255,255,255,0.35)"
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!showPassword}
                  />
                </View>
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  <Ionicons
                    name={showPassword ? 'eye-outline' : 'eye-off-outline'}
                    size={18}
                    color="rgba(255,255,255,0.5)"
                  />
                </TouchableOpacity>
              </View>

              <TouchableOpacity style={styles.forgotRow}>
                <Text style={styles.forgotText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => router.push('/Login/login')}>
                  <Text style={styles.footerLink}>Sign In</Text>
                </TouchableOpacity>
              </TouchableOpacity>

              <TouchableOpacity style={styles.loginButton} onPress={handleSignup} activeOpacity={0.85}>
                <LinearGradient
                  colors={['#2A2A2E', '#D9A75C']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.loginButtonGradient}
                >
                  <Text style={styles.loginButtonText}>Sign Up</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFFFFF" />
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.divider} />
                <Text style={styles.dividerText}>or continue with</Text>
                <View style={styles.divider} />
              </View>

              <View style={styles.socialRow}>
                <TouchableOpacity style={styles.socialButton}>
                  <Ionicons name="logo-google" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialButton}>
                  <Ionicons name="logo-github" size={20} color="#FFFFFF" />
                </TouchableOpacity>
                <TouchableOpacity style={styles.socialButton}>
                  <Ionicons name="logo-linkedin" size={20} color="#4A9EFF" />
                </TouchableOpacity>
              </View>
            </View>
          </BlurView>

          <View style={styles.footer}>
            <Text style={styles.footerText}>By signing up, you agree to our Terms.</Text>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#04060F' },
  flex: { flex: 1 },
  safeArea: { flex: 1, justifyContent: 'flex-end' },
  glowTop: {
    position: 'absolute',
    top: -height * 0.15,
    left: -60,
    width: 280,
    height: 280,
    borderRadius: 280,
    backgroundColor: 'rgba(122,92,255,0.25)',
  },
  glowBottom: {
    position: 'absolute',
    bottom: -80,
    right: -80,
    width: 240,
    height: 240,
    borderRadius: 240,
    backgroundColor: 'rgba(91,140,255,0.20)',
  },
  header: {
    alignItems: 'center',
    paddingBottom: 28,
  },
  logoDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#7A5CFF',
    marginBottom: 10,
  },
  brand: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: 4,
  },
  tagline: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 13,
    marginTop: 6,
  },
  card: {
    marginHorizontal: 20,
    borderRadius: 28,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  cardInner: {
    padding: 24,
    backgroundColor: 'rgba(20,20,26,0.55)',
  },
  title: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  titleAccent: {
    color: '#D9A75C',
  },
  subtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 22,
  },
  inputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  inputIcon: { marginRight: 10 },
  inputTextWrap: { flex: 1 },
  inputLabel: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  input: {
    color: '#FFFFFF',
    fontSize: 14,
    padding: 0,
    margin: 0,
  },
  forgotRow: { alignSelf: 'flex-end', marginTop: 12 },
  forgotText: { color: '#D9A75C', fontSize: 12, fontWeight: '600' },
  loginButton: { marginTop: 20, borderRadius: 14, overflow: 'hidden' },
  loginButtonGradient: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
  },
  loginButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 0.3,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 22,
  },
  divider: { flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.12)' },
  dividerText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    marginHorizontal: 10,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 18,
  },
  socialButton: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  socialText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginVertical: 24,
  },
  footerText: { color: 'rgba(255,255,255,0.5)', fontSize: 13 },
  footerLink: { color: GOLD, fontSize: 13, fontWeight: '700' },
});