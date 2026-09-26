import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenShell } from '../../../components/screen-shell';
import { useTheme, type ThemeColors } from '../../../theme';
import { fonts } from '../../../theme';
import { scale } from '../../../components/glass-ui';

export default function ZoneDetailScreen() {
  const router = useRouter();
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  const params = useLocalSearchParams<{ name?: string; source?: string; detail?: string; on?: string }>();
  const [enabled, setEnabled] = useState(params.on !== 'false');

  const zoneName = params.name || 'Zone Detail';
  const source = params.source || 'Battery';
  const detail = params.detail || 'Stable operation';

  return (
    <ScreenShell scroll>
      <LinearGradient colors={['#F97316', '#FB923C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.topBand}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
            <Ionicons name="chevron-back" size={20} color="#FFFFFF" />
          </Pressable>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>ZONE</Text>
            <Text style={styles.headerTitle}>Zone Detail</Text>
          </View>
        </View>

        <View style={styles.heroCard}>
          <Ionicons name="battery-half" size={scale(92)} color="rgba(255,255,255,0.12)" style={styles.heroBattery} />
          <Text style={styles.heroEyebrow}>ZONE BATTERY HEALTH</Text>
          <Text style={styles.zoneName}>{zoneName}</Text>
          <Text style={styles.zoneMeta}>Powered by {source} · {detail}</Text>
          <View style={styles.healthValueRow}>
            <Text style={styles.healthValue}>82</Text>
            <Text style={styles.healthUnit}>%</Text>
          </View>
          <Text style={styles.healthStatus}>HEALTHY · READY FOR LOAD</Text>
        </View>
      </LinearGradient>

      <Text style={styles.sectionLabel}>LIVE READOUT</Text>
      <View style={styles.statsCard}>
        <Readout icon="flash" value="24.6" unit="V" label="VOLTAGE" color="#1764B0" />
        <View style={styles.statsDivider} />
        <Readout icon="flash" value="62" unit="W" label="LOAD" color="#F59E0B" />
        <View style={styles.statsDivider} />
        <Readout icon="time-outline" value="6h 40m" unit="" label="RUNTIME LEFT" color="#F97316" />
      </View>

      <Text style={styles.sectionLabel}>SMART SWITCHING</Text>
      <View style={styles.switchRow}>
        <Pressable onPress={() => setEnabled(true)} style={[styles.switchButton, enabled && styles.switchActive]}>
          <Text style={[styles.switchText, enabled && styles.switchTextActive]}>ON</Text>
        </Pressable>
        <Pressable onPress={() => setEnabled(false)} style={[styles.switchButton, !enabled && styles.switchActive]}>
          <Text style={[styles.switchText, !enabled && styles.switchTextActive]}>OFF</Text>
        </Pressable>
      </View>

      <LinearGradient colors={['#0B63B7', '#0A2A4A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionButton}>
        <Text style={styles.actionText}>Open Runtime Calculator</Text>
        <Ionicons name="chevron-forward" size={17} color="#FFFFFF" />
      </LinearGradient>
      <Pressable style={[styles.actionButton, styles.secondaryAction]} onPress={() => router.push('/pages/schedule')}>
        <Text style={styles.secondaryActionText}>Configure Schedule &amp; Priority</Text>
        <Ionicons name="chevron-forward" size={17} color="#0B63B7" />
      </Pressable>
    </ScreenShell>
  );
}

function Readout({ icon, value, unit, label, color }: { icon: keyof typeof Ionicons.glyphMap; value: string; unit: string; label: string; color: string }) {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  return (
    <View style={styles.readoutCard}>
      <View style={[styles.readoutIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={13} color={color} />
      </View>
      <View style={styles.valueRow}>
        <Text style={styles.readoutValue}>{value}</Text>
        {unit ? <Text style={styles.readoutUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.readoutLabel}>{label}</Text>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  topBand: { marginHorizontal: -18, paddingHorizontal: scale(18), paddingBottom: scale(18), borderBottomLeftRadius: scale(24), borderBottomRightRadius: scale(24), overflow: 'hidden' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: scale(12), paddingTop: scale(2) },
  backButton: { width: scale(40), height: scale(40), borderRadius: scale(20), backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'flex-end', marginRight: scale(4) },
  eyebrow: { color: 'rgba(255,255,255,0.72)', fontSize: scale(9), letterSpacing: 1.5, fontFamily: fonts.bold },
  headerTitle: { color: '#FFFFFF', fontSize: scale(18), fontFamily: fonts.extrabold, marginTop: 2 },
  heroCard: { position: 'relative', alignItems: 'center', overflow: 'hidden', paddingHorizontal: scale(16), paddingTop: scale(4), paddingBottom: scale(2) },
  heroBattery: { position: 'absolute', right: scale(8), top: scale(15) },
  heroEyebrow: { color: 'rgba(255,255,255,0.74)', fontSize: scale(8), letterSpacing: 1.5, fontFamily: fonts.extrabold },
  zoneName: { color: '#FFFFFF', fontSize: scale(20), fontFamily: fonts.extrabold, textAlign: 'center', marginTop: scale(4) },
  zoneMeta: { color: 'rgba(255,255,255,0.76)', fontSize: scale(9.5), fontFamily: fonts.medium, textAlign: 'center', marginTop: 3 },
  healthValueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginTop: scale(12) },
  healthValue: { color: '#FFFFFF', fontSize: scale(64), lineHeight: scale(66), letterSpacing: -1, fontFamily: fonts.extrabold },
  healthUnit: { color: '#FFF7ED', fontSize: scale(23), marginLeft: scale(3), fontFamily: fonts.extrabold },
  healthStatus: { color: 'rgba(255,255,255,0.78)', fontSize: scale(8), letterSpacing: 1.1, fontFamily: fonts.extrabold },
  sectionLabel: { color: c.muted, fontSize: scale(10), letterSpacing: 1.3, fontFamily: fonts.extrabold, marginTop: scale(16), marginBottom: scale(8), marginLeft: scale(2) },
  switchRow: { flexDirection: 'row', gap: scale(6) },
  switchButton: { flex: 1, height: scale(42), borderRadius: scale(11), backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  switchActive: { backgroundColor: '#1255A0' },
  switchText: { color: c.muted, fontSize: scale(11), fontFamily: fonts.extrabold },
  switchTextActive: { color: '#FFFFFF' },
  statsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: scale(17), borderWidth: 1, borderColor: c.line, paddingVertical: scale(12), paddingHorizontal: scale(8), shadowColor: '#0A2A4A', shadowOpacity: 0.1, shadowRadius: scale(10), shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  statsDivider: { width: 1, height: scale(38), backgroundColor: c.line },
  readoutCard: { flex: 1, minHeight: scale(65), alignItems: 'center', justifyContent: 'center', padding: scale(7) },
  readoutIcon: { width: scale(21), height: scale(21), borderRadius: scale(6), alignItems: 'center', justifyContent: 'center', marginBottom: scale(6) },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  readoutValue: { color: c.text, fontSize: scale(14), fontFamily: fonts.extrabold },
  readoutUnit: { color: c.muted, fontSize: scale(8), fontFamily: fonts.medium },
  readoutLabel: { color: c.muted, fontSize: scale(7), letterSpacing: 0.5, fontFamily: fonts.bold, marginTop: 3 },
  actionButton: { minHeight: scale(46), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), borderRadius: scale(13), marginTop: scale(12), paddingHorizontal: scale(12), overflow: 'hidden' },
  actionText: { color: '#FFFFFF', fontSize: scale(11), fontFamily: fonts.extrabold },
  secondaryAction: { backgroundColor: c.surface, borderWidth: 1, borderColor: '#0B63B7' },
  secondaryActionText: { color: '#0B63B7', fontSize: scale(11), fontFamily: fonts.extrabold },
});
