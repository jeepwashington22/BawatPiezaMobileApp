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
        <Pressable onPress={() => router.replace('/home')} style={styles.skipButton} accessibilityRole="button"><Text style={[styles.skipText, { color: c.muted }]}>Skip for now</Text><Ionicons name="arrow-forward" size={scale(14)} color={c.muted} /></Pressable>
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}><Ionicons name="hardware-chip-outline" size={scale(34)} color="#FFFFFF" /><View style={styles.signalDot} /></View>
        <Text style={[styles.eyebrow, { color: c.orange }]}>DEVICE SETUP</Text>
        <Text style={[styles.title, { color: c.text }]}>Connect your IoT hub</Text>
        <Text style={[styles.subtitle, { color: c.muted }]}>Let’s link your BawatPieza hub so you can monitor energy, tiles, and zones from one place.</Text>
      </View>

      <Card mode="light" style={styles.guideCard}>
        <View style={styles.guideHeader}><View><Text style={[styles.cardTitle, { color: c.text }]}>Provisioning guide</Text><Text style={[styles.cardSubtitle, { color: c.muted }]}>Takes about 2 minutes</Text></View><View style={styles.timePill}><Ionicons name="time-outline" size={scale(12)} color="#0B63B7" /><Text style={styles.timeText}>2 MIN</Text></View></View>
        {STEPS.map((step, index) => <View key={step.number} style={styles.stepRow}><View style={styles.stepRail}><View style={styles.stepNumber}><Text style={styles.stepNumberText}>{step.number}</Text></View>{index < STEPS.length - 1 && <View style={styles.railLine} />}</View><View style={styles.stepCopy}><View style={styles.stepTitleRow}><Text style={[styles.stepTitle, { color: c.text }]}>{step.title}</Text><Ionicons name={step.icon} size={scale(16)} color={c.orange} /></View><Text style={[styles.stepText, { color: c.muted }]}>{step.copy}</Text></View></View>)}
      </Card>

      <Card mode="light" style={styles.connectCard}>
        <View style={styles.connectHeader}><View><Text style={[styles.cardTitle, { color: c.text }]}>Ready to connect?</Text><Text style={[styles.cardSubtitle, { color: c.muted }]}>Enter the code printed on your hub.</Text></View><Ionicons name="qr-code-outline" size={scale(24)} color={c.orange} /></View>
        <TextInput value={code} onChangeText={setCode} placeholder="Example: BP-HUB-042" placeholderTextColor={c.muted} autoCapitalize="characters" style={[styles.input, { color: c.text, borderColor: c.line }]} />
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
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: scale(9), marginBottom: scale(23) }, brandMark: { width: scale(34), height: scale(34), borderRadius: scale(11), backgroundColor: '#0A2A4A', alignItems: 'center', justifyContent: 'center' }, skipButton: { flexDirection: 'row', alignItems: 'center', gap: scale(5), paddingVertical: scale(7), paddingHorizontal: scale(2) }, skipText: { fontSize: scale(10), fontFamily: fonts.bold }, hero: { alignItems: 'center', marginBottom: scale(19) }, heroIcon: { width: scale(76), height: scale(76), borderRadius: scale(24), backgroundColor: '#0B63B7', alignItems: 'center', justifyContent: 'center', marginBottom: scale(14), shadowColor: '#0B63B7', shadowOpacity: 0.25, shadowRadius: 15, shadowOffset: { width: 0, height: 7 }, elevation: 6 }, signalDot: { position: 'absolute', width: scale(9), height: scale(9), borderRadius: scale(5), backgroundColor: '#4ADE80', right: scale(13), top: scale(13), borderWidth: 2, borderColor: '#0B63B7' }, eyebrow: { fontSize: scale(9), letterSpacing: 1.8, fontFamily: fonts.extrabold }, title: { fontSize: scale(25), fontFamily: fonts.extrabold, marginTop: scale(5), textAlign: 'center', letterSpacing: -0.5 }, subtitle: { fontSize: scale(11), lineHeight: scale(16), fontFamily: fonts.medium, textAlign: 'center', maxWidth: scale(300), marginTop: scale(7) },
  guideCard: { padding: scale(15), marginBottom: scale(11) }, guideHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(15) }, cardTitle: { fontSize: scale(13), fontFamily: fonts.bold }, cardSubtitle: { fontSize: scale(9), fontFamily: fonts.medium, marginTop: scale(2) }, timePill: { flexDirection: 'row', alignItems: 'center', gap: scale(4), backgroundColor: '#EAF3FF', borderRadius: scale(9), paddingHorizontal: scale(7), paddingVertical: scale(5) }, timeText: { color: '#0B63B7', fontSize: scale(7), fontFamily: fonts.extrabold }, stepRow: { flexDirection: 'row', minHeight: scale(63) }, stepRail: { width: scale(31), alignItems: 'center' }, stepNumber: { width: scale(25), height: scale(25), borderRadius: scale(13), backgroundColor: '#FFF1D8', alignItems: 'center', justifyContent: 'center' }, stepNumberText: { color: '#D8790B', fontSize: scale(8), fontFamily: fonts.extrabold }, railLine: { flex: 1, width: 1, backgroundColor: '#E7E8EE', marginVertical: scale(3) }, stepCopy: { flex: 1, paddingLeft: scale(8), paddingBottom: scale(12) }, stepTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, stepTitle: { fontSize: scale(11), fontFamily: fonts.bold }, stepText: { fontSize: scale(9), lineHeight: scale(13), fontFamily: fonts.medium, marginTop: scale(3), paddingRight: scale(12) },
  connectCard: { padding: scale(15), marginBottom: scale(11) }, connectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(13) }, input: { height: scale(42), borderWidth: 1, borderRadius: scale(11), paddingHorizontal: scale(12), fontSize: scale(11), fontFamily: fonts.medium }, connectButton: { height: scale(43), borderRadius: scale(12), overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(7), marginTop: scale(10) }, connectButtonDisabled: { opacity: 0.8 }, connectText: { color: '#FFFFFF', fontSize: scale(10), fontFamily: fonts.bold }, securityNote: { fontSize: scale(8), fontFamily: fonts.medium, textAlign: 'center', marginTop: scale(11) }, helpRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: scale(5), paddingHorizontal: scale(14), marginBottom: scale(18) }, helpText: { fontSize: scale(9), fontFamily: fonts.medium, textAlign: 'center' },
});
