import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card, scale } from './glass-ui';
import { fonts, useTheme } from '../theme';

const STEPS = [
  { number: '01', title: 'Power on the IoT hub', copy: 'Connect the hub to power and wait for the status light to pulse blue.', icon: 'power-outline' as const },
  { number: '02', title: 'Join the same network', copy: 'Keep your phone and hub on the facility Wi-Fi during setup.', icon: 'wifi-outline' as const },
  { number: '03', title: 'Scan the device code', copy: 'Find the QR label on the hub or enter its code manually below.', icon: 'scan-outline' as const },
];

export function ProvisioningScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const [code, setCode] = useState('');
  const [connecting, setConnecting] = useState(false);

  const connect = () => {
    if (!code.trim() || connecting) return;
    setConnecting(true);
    setTimeout(() => router.replace('/home'), 650);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.topRow}>
        <View style={styles.brandMark}><Ionicons name="flash" size={scale(17)} color="#FFFFFF" /></View>
        <View style={styles.setupBadge}><View style={styles.liveDot} /><Text style={[styles.setupBadgeText, { color: c.muted }]}>SETUP MODE</Text></View>
        <Pressable onPress={() => router.replace('/home')} style={styles.skipButton} accessibilityRole="button"><Text style={[styles.skipText, { color: c.muted }]}>Skip for now</Text><Ionicons name="arrow-forward" size={scale(14)} color={c.muted} /></Pressable>
      </View>

      <View style={styles.hero}>
        <LinearGradient colors={['#0B63B7', '#0A2A4A']} style={styles.heroPanel}>
          <View style={styles.heroIcon}><Ionicons name="hardware-chip-outline" size={scale(34)} color="#FFFFFF" /><View style={styles.signalDot} /></View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>DEVICE SETUP · 01</Text>
            <Text style={styles.heroTitle}>Connect your IoT hub</Text>
            <Text style={styles.heroSubtitle}>Link your hub to monitor energy, tiles, and zones from one place.</Text>
          </View>
        </LinearGradient>
        <View style={styles.progressTrack}><View style={styles.progressFill} /></View>
        <Text style={[styles.progressLabel, { color: c.muted }]}>Step 1 of 3 <Text style={{ color: c.text }}>· Device connection</Text></Text>
      </View>

      <Card mode="light" style={styles.guideCard}>
        <View style={styles.guideHeader}><View><Text style={[styles.sectionKicker, { color: c.orange }]}>START HERE</Text><Text style={[styles.cardTitle, { color: c.text }]}>Provisioning guide</Text><Text style={[styles.cardSubtitle, { color: c.muted }]}>A quick three-step setup</Text></View><View style={styles.timePill}><Ionicons name="time-outline" size={scale(12)} color="#0B63B7" /><Text style={styles.timeText}>2 MIN</Text></View></View>
        {STEPS.map((step, index) => <View key={step.number} style={styles.stepRow}><View style={styles.stepRail}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{step.number}</Text></View>{index < STEPS.length - 1 && <View style={styles.railLine} />}</View><View style={styles.stepCopy}><View style={styles.stepTitleRow}><Text style={[styles.stepTitle, { color: c.text }]}>{step.title}</Text><Ionicons name={step.icon} size={scale(16)} color={c.orange} /></View><Text style={[styles.stepText, { color: c.muted }]}>{step.copy}</Text></View></View>)}
      </Card>

      <Card mode="light" style={styles.connectCard}>
        <View style={styles.connectHeader}><View><Text style={[styles.sectionKicker, { color: c.orange }]}>ALMOST THERE</Text><Text style={[styles.cardTitle, { color: c.text }]}>Ready to connect?</Text><Text style={[styles.cardSubtitle, { color: c.muted }]}>Enter the code printed on your hub.</Text></View><View style={styles.qrBadge}><Ionicons name="qr-code-outline" size={scale(22)} color={c.orange} /></View></View>
        <Text style={[styles.inputLabel, { color: c.text }]}>Hub code</Text>
        <TextInput value={code} onChangeText={setCode} placeholder="Example: BP-HUB-042" placeholderTextColor={c.muted} autoCapitalize="characters" style={[styles.input, { color: c.text, borderColor: c.line, backgroundColor: c.surfaceMuted }]} />
        <Pressable onPress={connect} style={[styles.connectButton, !code.trim() && styles.connectButtonDisabled]} accessibilityRole="button"><LinearGradient colors={code.trim() ? ['#FFA51A', '#F05A16'] : ['#C9CBD4', '#B8BBC5']} style={StyleSheet.absoluteFill} /><Ionicons name={connecting ? 'sync-outline' : 'link-outline'} size={scale(17)} color="#FFFFFF" /><Text style={styles.connectText}>{connecting ? 'Connecting…' : 'Connect IoT hub'}</Text></Pressable>
        <Text style={[styles.securityNote, { color: c.muted }]}><Ionicons name="lock-closed-outline" size={scale(11)} color={c.muted} /> Your network credentials stay private and encrypted.</Text>
      </Card>

      <View style={styles.helpRow}><Ionicons name="help-circle-outline" size={scale(17)} color={c.muted} /><Text style={[styles.helpText, { color: c.muted }]}>Need help? Ask your facility administrator for the hub code.</Text></View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 }, scrollContent: { paddingHorizontal: scale(18), paddingBottom: scale(22) },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: scale(9), marginBottom: scale(18) }, brandMark: { width: scale(34), height: scale(34), borderRadius: scale(11), backgroundColor: '#0A2A4A', alignItems: 'center', justifyContent: 'center' }, setupBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: scale(5), marginLeft: scale(10) }, liveDot: { width: scale(6), height: scale(6), borderRadius: scale(3), backgroundColor: '#22C55E' }, setupBadgeText: { fontSize: scale(8), letterSpacing: 1.1, fontFamily: fonts.extrabold }, skipButton: { flexDirection: 'row', alignItems: 'center', gap: scale(5), paddingVertical: scale(7), paddingHorizontal: scale(2) }, skipText: { fontSize: scale(10), fontFamily: fonts.bold }, hero: { marginBottom: scale(17) }, heroPanel: { minHeight: scale(156), borderRadius: scale(24), padding: scale(18), flexDirection: 'row', alignItems: 'center', overflow: 'hidden', shadowColor: '#0A2A4A', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 }, heroIcon: { width: scale(72), height: scale(72), borderRadius: scale(23), backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginRight: scale(15) }, signalDot: { position: 'absolute', width: scale(9), height: scale(9), borderRadius: scale(5), backgroundColor: '#4ADE80', right: scale(11), top: scale(11), borderWidth: 2, borderColor: '#0B63B7' }, heroCopy: { flex: 1 }, heroEyebrow: { color: 'rgba(255,255,255,0.68)', fontSize: scale(8), letterSpacing: 1.4, fontFamily: fonts.extrabold }, heroTitle: { color: '#FFFFFF', fontSize: scale(22), lineHeight: scale(27), fontFamily: fonts.extrabold, marginTop: scale(5) }, heroSubtitle: { color: 'rgba(255,255,255,0.76)', fontSize: scale(9.5), lineHeight: scale(14), fontFamily: fonts.medium, marginTop: scale(7) }, progressTrack: { height: scale(5), borderRadius: scale(3), backgroundColor: '#DDE4EA', overflow: 'hidden', marginTop: scale(13) }, progressFill: { width: '33%', height: '100%', borderRadius: scale(3), backgroundColor: '#F97316' }, progressLabel: { fontSize: scale(8.5), fontFamily: fonts.medium, marginTop: scale(6), textAlign: 'right' },
  guideCard: { padding: scale(15), marginBottom: scale(11), borderRadius: scale(18) }, guideHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(15) }, sectionKicker: { fontSize: scale(8), letterSpacing: 1.1, fontFamily: fonts.extrabold, marginBottom: scale(3) }, cardTitle: { fontSize: scale(13), fontFamily: fonts.bold }, cardSubtitle: { fontSize: scale(9), fontFamily: fonts.medium, marginTop: scale(2) }, timePill: { flexDirection: 'row', alignItems: 'center', gap: scale(4), backgroundColor: '#EAF3FF', borderRadius: scale(9), paddingHorizontal: scale(7), paddingVertical: scale(5) }, timeText: { color: '#0B63B7', fontSize: scale(7), fontFamily: fonts.extrabold }, stepRow: { flexDirection: 'row', minHeight: scale(63) }, stepRail: { width: scale(31), alignItems: 'center' }, stepNumber: { width: scale(25), height: scale(25), borderRadius: scale(13), backgroundColor: '#FFF1D8', alignItems: 'center', justifyContent: 'center' }, stepNumberText: { color: '#D8790B', fontSize: scale(8), fontFamily: fonts.extrabold }, railLine: { flex: 1, width: 1, backgroundColor: '#E7E8EE', marginVertical: scale(3) }, stepCopy: { flex: 1, paddingLeft: scale(8), paddingBottom: scale(12) }, stepTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, stepTitle: { fontSize: scale(11), fontFamily: fonts.bold }, stepText: { fontSize: scale(9), lineHeight: scale(13), fontFamily: fonts.medium, marginTop: scale(3), paddingRight: scale(12) },
  connectCard: { padding: scale(15), marginBottom: scale(11), borderRadius: scale(18) }, connectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(13) }, qrBadge: { width: scale(42), height: scale(42), borderRadius: scale(13), backgroundColor: '#FFF4E8', alignItems: 'center', justifyContent: 'center' }, inputLabel: { fontSize: scale(9), fontFamily: fonts.bold, marginBottom: scale(5) }, input: { height: scale(44), borderWidth: 1, borderRadius: scale(11), paddingHorizontal: scale(12), fontSize: scale(11), fontFamily: fonts.medium }, connectButton: { height: scale(45), borderRadius: scale(12), overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(7), marginTop: scale(11) }, connectButtonDisabled: { opacity: 0.8 }, connectText: { color: '#FFFFFF', fontSize: scale(10), fontFamily: fonts.bold }, securityNote: { fontSize: scale(8), fontFamily: fonts.medium, textAlign: 'center', marginTop: scale(11) }, helpRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: scale(5), paddingHorizontal: scale(14), marginBottom: scale(18) }, helpText: { fontSize: scale(9), fontFamily: fonts.medium, textAlign: 'center' },
});
