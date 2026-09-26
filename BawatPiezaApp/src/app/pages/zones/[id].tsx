import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="chevron-back" size={20} color={c.text} />
        </Pressable>
        <View style={styles.headerCopy}>
          <Text style={styles.eyebrow}>ZONE</Text>
          <Text style={styles.headerTitle}>Zone Detail</Text>
        </View>
      </View>

      <View style={styles.heroCard}>
        <Text style={styles.zoneName}>{zoneName}</Text>
        <Text style={styles.zoneMeta}>Currently powered by {source} · {detail}</Text>
        <View style={styles.gauge}>
          <View style={styles.gaugeInner}>
            <Text style={styles.gaugeValue}>82%</Text>
            <Text style={styles.gaugeLabel}>BATTERY LEVEL</Text>
          </View>
        </View>
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

      <Text style={styles.sectionLabel}>LIVE READOUT</Text>
      <View style={styles.readoutRow}>
        <Readout icon="flash" value="24.6" unit="V" label="VOLTAGE" color="#1764B0" />
        <Readout icon="flash" value="62" unit="W" label="LOAD" color="#F59E0B" />
        <Readout icon="time-outline" value="6h 40m" unit="" label="RUNTIME LEFT" color="#F97316" />
      </View>

      <Pressable style={styles.actionButton} onPress={() => router.push('/pages/energy')}>
        <Text style={styles.actionText}>Open Runtime Calculator</Text>
        <Ionicons name="chevron-forward" size={17} color={c.text} />
      </Pressable>
      <Pressable style={styles.actionButton} onPress={() => router.push('/pages/schedule')}>
        <Text style={styles.actionText}>Configure Schedule &amp; Priority</Text>
        <Ionicons name="chevron-forward" size={17} color={c.text} />
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
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: scale(18) },
  backButton: { width: scale(40), height: scale(40), borderRadius: scale(20), backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  headerCopy: { flex: 1, alignItems: 'flex-end', marginRight: scale(4) },
  eyebrow: { color: c.muted, fontSize: scale(10), letterSpacing: 1.5, fontFamily: fonts.bold },
  headerTitle: { color: c.text, fontSize: scale(18), fontFamily: fonts.extrabold, marginTop: 2 },
  heroCard: { alignItems: 'center', backgroundColor: c.surface, borderRadius: scale(18), borderWidth: 1, borderColor: c.line, paddingHorizontal: scale(12), paddingTop: scale(18), paddingBottom: scale(20), shadowColor: '#F97316', shadowOpacity: 0.18, shadowRadius: scale(10), shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  zoneName: { color: c.text, fontSize: scale(14), fontFamily: fonts.extrabold, textAlign: 'center' },
  zoneMeta: { color: c.muted, fontSize: scale(10), fontFamily: fonts.medium, textAlign: 'center', marginTop: 3 },
  gauge: { width: scale(136), height: scale(136), borderRadius: scale(68), borderWidth: scale(10), borderColor: '#F97316', marginTop: scale(22), alignItems: 'center', justifyContent: 'center' },
  gaugeInner: { alignItems: 'center' },
  gaugeValue: { color: c.text, fontSize: scale(27), fontFamily: fonts.extrabold },
  gaugeLabel: { color: c.muted, fontSize: scale(8), letterSpacing: 0.8, fontFamily: fonts.bold, marginTop: 2 },
  sectionLabel: { color: c.muted, fontSize: scale(10), letterSpacing: 1.3, fontFamily: fonts.extrabold, marginTop: scale(16), marginBottom: scale(8), marginLeft: scale(2) },
  switchRow: { flexDirection: 'row', gap: scale(6) },
  switchButton: { flex: 1, height: scale(42), borderRadius: scale(11), backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' },
  switchActive: { backgroundColor: '#1255A0' },
  switchText: { color: c.muted, fontSize: scale(11), fontFamily: fonts.extrabold },
  switchTextActive: { color: '#FFFFFF' },
  readoutRow: { flexDirection: 'row', gap: scale(8) },
  readoutCard: { flex: 1, minHeight: scale(76), backgroundColor: c.surface, borderRadius: scale(12), padding: scale(10) },
  readoutIcon: { width: scale(21), height: scale(21), borderRadius: scale(6), alignItems: 'center', justifyContent: 'center', marginBottom: scale(6) },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  readoutValue: { color: c.text, fontSize: scale(13), fontFamily: fonts.extrabold },
  readoutUnit: { color: c.muted, fontSize: scale(8), fontFamily: fonts.medium },
  readoutLabel: { color: c.muted, fontSize: scale(7), letterSpacing: 0.5, fontFamily: fonts.bold, marginTop: 3 },
  actionButton: { minHeight: scale(44), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), backgroundColor: c.surface, borderRadius: scale(12), marginTop: scale(10), paddingHorizontal: scale(12) },
  actionText: { color: c.text, fontSize: scale(11), fontFamily: fonts.extrabold },
});
