import { useState } from 'react';
import { Alert, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
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
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [ssid, setSsid] = useState('');
  const [wifiPassword, setWifiPassword] = useState('');
  const [showWifiPassword, setShowWifiPassword] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [scanLocked, setScanLocked] = useState(false);

  const openWifiSettings = () => {
    const open = Platform.OS === 'android'
      ? Linking.sendIntent('android.settings.WIFI_SETTINGS')
      : Linking.openSettings();
    void open.catch(() => Linking.openSettings().catch(() => undefined));
  };

  const simulatePair = () => {
    router.replace('/home');
  };

  const openScanner = async () => {
    setScanLocked(false);
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) return;
    }
    setScannerVisible(true);
  };

  const handleBarcodeScanned = ({ data }: BarcodeScanningResult) => {
    if (scanLocked) return;
    const wifi = parseWifiQr(data);
    if (!wifi) {
      setScanLocked(true);
      Alert.alert('Not a Wi-Fi QR code', 'Scan a Wi-Fi sharing QR code or enter the network details manually.', [
        { text: 'Try again', onPress: () => setScanLocked(false) },
        { text: 'Close', onPress: () => setScannerVisible(false) },
      ]);
      return;
    }
    setSsid(wifi.ssid);
    setWifiPassword(wifi.password);
    setScannerVisible(false);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={[styles.screenKicker, { color: c.muted }]}>STEP 1: CONNECT TO DEVICE</Text>
      <Card mode="light" style={styles.connectCard}>
        <View style={styles.setupTitleRow}><View style={styles.wifiIcon}><Ionicons name="wifi-outline" size={scale(20)} color="#0B63B7" /></View><View style={{ flex: 1 }}><Text style={[styles.cardTitle, { color: c.text }]}>Connect Phone to Hub</Text><Text style={[styles.cardSubtitle, { color: c.muted }]}>Your phone needs to talk directly to the Hub to configure it.</Text></View></View>
        <View style={styles.instructionBox}><Text style={[styles.instruction, { color: c.text }]}>1. Tap the button below to open Settings.</Text><Text style={[styles.instruction, { color: c.text }]}>2. Connect to <Text style={{ color: '#0B63B7' }}>BawatPieza-Setup</Text>.</Text><Text style={[styles.instruction, { color: c.text }]}>3. Return to this app.</Text></View>
        <Pressable onPress={openWifiSettings} style={styles.settingsButton}><Text style={styles.settingsText}>Open Wi-Fi Settings</Text></Pressable>
      </Card>

      <Text style={[styles.screenKicker, { color: c.muted }]}>STEP 2: CONFIGURE NETWORK</Text>
      <Text style={[styles.networkCopy, { color: c.muted }]}>Enter the details of your <Text style={{ color: c.text }}>Home Wi-Fi</Text>. We'll send this to the Hub so it can get online.</Text>
      <Text style={[styles.inputLabel, { color: c.muted }]}>HOME WI-FI NAME (SSID)</Text>
      <View style={styles.formInput}><TextInput value={ssid} onChangeText={setSsid} placeholder="e.g. UCC-Staff-5G" placeholderTextColor={c.muted} style={[styles.input, { color: c.text }]} /><Pressable accessibilityLabel="Scan Wi-Fi QR code" onPress={() => void openScanner()} hitSlop={8}><Ionicons name="qr-code-outline" size={scale(17)} color="#0B63B7" /></Pressable></View>
      <Text style={[styles.inputLabel, { color: c.muted }]}>HOME WI-FI PASSWORD</Text>
      <View style={styles.formInput}><TextInput value={wifiPassword} onChangeText={setWifiPassword} placeholder="Enter Password" placeholderTextColor={c.muted} secureTextEntry={!showWifiPassword} style={[styles.input, { color: c.text }]} /><Pressable onPress={() => setShowWifiPassword((value) => !value)}><Ionicons name={showWifiPassword ? 'eye-off-outline' : 'eye-outline'} size={scale(17)} color={c.muted} /></Pressable></View>
      <Pressable onPress={simulatePair} style={styles.simulateButton}><LinearGradient colors={['#FFA51A', '#F05A16']} style={StyleSheet.absoluteFill} /><Text style={styles.connectText}>Simulate Successful Pair</Text></Pressable>
      </ScrollView>
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={styles.scannerScreen}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={scanLocked ? undefined : handleBarcodeScanned}
          />
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerHeader}>
              <Text style={styles.scannerTitle}>Scan Wi-Fi QR code</Text>
              <Pressable accessibilityLabel="Close QR scanner" onPress={() => setScannerVisible(false)} hitSlop={10}><Ionicons name="close" size={28} color="#FFFFFF" /></Pressable>
            </View>
            <View style={styles.scanFrame} />
            <Text style={styles.scannerHint}>Center the Wi-Fi QR code inside the frame.</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

function parseWifiQr(data: string): { ssid: string; password: string } | null {
  if (!data.startsWith('WIFI:')) return null;
  const fields: Record<string, string> = {};
  let key = '';
  let value = '';
  let escaping = false;

  const commit = () => {
    if (key) fields[key] = value;
    key = '';
    value = '';
  };

  for (const character of `${data.slice(5)};`) {
    if (escaping) {
      value += character;
      escaping = false;
    } else if (character === '\\') {
      escaping = true;
    } else if (!key && character === ':') {
      key = value;
      value = '';
    } else if (character === ';') {
      commit();
    } else {
      value += character;
    }
  }

  return fields.S ? { ssid: fields.S, password: fields.P ?? '' } : null;
}

const styles = StyleSheet.create({
  screenKicker: { fontSize: scale(10), letterSpacing: 1.1, fontFamily: fonts.extrabold, marginTop: scale(12), marginBottom: scale(8) },
  setupTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: scale(10), marginBottom: scale(12) },
  wifiIcon: { width: scale(40), height: scale(40), borderRadius: scale(12), backgroundColor: '#E5F0FC', alignItems: 'center', justifyContent: 'center' },
  instructionBox: { backgroundColor: '#EEF3FB', borderRadius: scale(14), padding: scale(13), marginBottom: scale(12) },
  instruction: { fontSize: scale(10), fontFamily: fonts.medium, marginBottom: scale(8) },
  settingsButton: { height: scale(43), borderRadius: scale(12), borderWidth: 1, borderColor: '#0B63B7', alignItems: 'center', justifyContent: 'center' },
  settingsText: { color: '#0B63B7', fontSize: scale(11), fontFamily: fonts.extrabold },
  networkCopy: { fontSize: scale(10), lineHeight: scale(15), fontFamily: fonts.medium, marginHorizontal: scale(2), marginBottom: scale(17) },
  formInput: { minHeight: scale(43), flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: scale(11), paddingHorizontal: scale(12), marginBottom: scale(10) },
  simulateButton: { height: scale(45), borderRadius: scale(13), overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: scale(8), marginBottom: scale(18), elevation: 3 },
  scannerScreen: { flex: 1, backgroundColor: '#000000' },
  scannerOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', paddingHorizontal: scale(24), paddingTop: scale(58), backgroundColor: 'rgba(0,0,0,0.25)' },
  scannerHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scannerTitle: { color: '#FFFFFF', fontSize: scale(16), fontFamily: fonts.extrabold },
  scanFrame: { width: scale(245), height: scale(245), borderWidth: scale(3), borderColor: '#FFFFFF', borderRadius: scale(18), marginTop: scale(100) },
  scannerHint: { color: '#FFFFFF', fontSize: scale(11), fontFamily: fonts.medium, textAlign: 'center', marginTop: scale(22) },
  safeArea: { flex: 1 }, scrollContent: { paddingHorizontal: scale(18), paddingBottom: scale(22) },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: scale(9), marginBottom: scale(18) }, brandMark: { width: scale(34), height: scale(34), borderRadius: scale(11), backgroundColor: '#0A2A4A', alignItems: 'center', justifyContent: 'center' }, setupBadge: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: scale(5), marginLeft: scale(10) }, liveDot: { width: scale(6), height: scale(6), borderRadius: scale(3), backgroundColor: '#22C55E' }, setupBadgeText: { fontSize: scale(8), letterSpacing: 1.1, fontFamily: fonts.extrabold }, skipButton: { flexDirection: 'row', alignItems: 'center', gap: scale(5), paddingVertical: scale(7), paddingHorizontal: scale(2) }, skipText: { fontSize: scale(10), fontFamily: fonts.bold }, hero: { marginBottom: scale(17) }, heroPanel: { minHeight: scale(156), borderRadius: scale(24), padding: scale(18), flexDirection: 'row', alignItems: 'center', overflow: 'hidden', shadowColor: '#0A2A4A', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 5 }, heroIcon: { width: scale(72), height: scale(72), borderRadius: scale(23), backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginRight: scale(15) }, signalDot: { position: 'absolute', width: scale(9), height: scale(9), borderRadius: scale(5), backgroundColor: '#4ADE80', right: scale(11), top: scale(11), borderWidth: 2, borderColor: '#0B63B7' }, heroCopy: { flex: 1 }, heroEyebrow: { color: 'rgba(255,255,255,0.68)', fontSize: scale(8), letterSpacing: 1.4, fontFamily: fonts.extrabold }, heroTitle: { color: '#FFFFFF', fontSize: scale(22), lineHeight: scale(27), fontFamily: fonts.extrabold, marginTop: scale(5) }, heroSubtitle: { color: 'rgba(255,255,255,0.76)', fontSize: scale(9.5), lineHeight: scale(14), fontFamily: fonts.medium, marginTop: scale(7) }, progressTrack: { height: scale(5), borderRadius: scale(3), backgroundColor: '#DDE4EA', overflow: 'hidden', marginTop: scale(13) }, progressFill: { width: '33%', height: '100%', borderRadius: scale(3), backgroundColor: '#F97316' }, progressLabel: { fontSize: scale(8.5), fontFamily: fonts.medium, marginTop: scale(6), textAlign: 'right' },
  guideCard: { padding: scale(15), marginBottom: scale(11), borderRadius: scale(18) }, guideHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(15) }, sectionKicker: { fontSize: scale(8), letterSpacing: 1.1, fontFamily: fonts.extrabold, marginBottom: scale(3) }, cardTitle: { fontSize: scale(13), fontFamily: fonts.bold }, cardSubtitle: { fontSize: scale(9), fontFamily: fonts.medium, marginTop: scale(2) }, timePill: { flexDirection: 'row', alignItems: 'center', gap: scale(4), backgroundColor: '#EAF3FF', borderRadius: scale(9), paddingHorizontal: scale(7), paddingVertical: scale(5) }, timeText: { color: '#0B63B7', fontSize: scale(7), fontFamily: fonts.extrabold }, stepRow: { flexDirection: 'row', minHeight: scale(63) }, stepRail: { width: scale(31), alignItems: 'center' }, stepNumber: { width: scale(25), height: scale(25), borderRadius: scale(13), backgroundColor: '#FFF1D8', alignItems: 'center', justifyContent: 'center' }, stepNumberText: { color: '#D8790B', fontSize: scale(8), fontFamily: fonts.extrabold }, railLine: { flex: 1, width: 1, backgroundColor: '#E7E8EE', marginVertical: scale(3) }, stepCopy: { flex: 1, paddingLeft: scale(8), paddingBottom: scale(12) }, stepTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, stepTitle: { fontSize: scale(11), fontFamily: fonts.bold }, stepText: { fontSize: scale(9), lineHeight: scale(13), fontFamily: fonts.medium, marginTop: scale(3), paddingRight: scale(12) },
  connectCard: { padding: scale(15), marginBottom: scale(11), borderRadius: scale(18) }, connectHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: scale(13) }, qrBadge: { width: scale(42), height: scale(42), borderRadius: scale(13), backgroundColor: '#FFF4E8', alignItems: 'center', justifyContent: 'center' }, inputLabel: { fontSize: scale(9), fontFamily: fonts.bold, marginBottom: scale(5) }, input: { height: scale(44), borderWidth: 1, borderRadius: scale(11), paddingHorizontal: scale(12), fontSize: scale(11), fontFamily: fonts.medium }, connectButton: { height: scale(45), borderRadius: scale(12), overflow: 'hidden', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(7), marginTop: scale(11) }, connectButtonDisabled: { opacity: 0.8 }, connectText: { color: '#FFFFFF', fontSize: scale(10), fontFamily: fonts.bold }, securityNote: { fontSize: scale(8), fontFamily: fonts.medium, textAlign: 'center', marginTop: scale(11) }, helpRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: scale(5), paddingHorizontal: scale(14), marginBottom: scale(18) }, helpText: { fontSize: scale(9), fontFamily: fonts.medium, textAlign: 'center' },
});
