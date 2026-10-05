import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenShell } from '../../../components/screen-shell';
import { TopBar } from '../../../components/top-bar';
import { HeroGlow } from '../../../components/hero-glow';
import { useTheme, type ThemeColors } from '../../../theme';
import { fonts } from '../../../theme';
import { scale } from '../../../components/glass-ui';

export default function ZoneDetailScreen() {
  const router = useRouter();
  const { colors: c, mode } = useTheme();
  const styles = makeStyles(c);
  const params = useLocalSearchParams<{ id: string; name?: string; source?: string; detail?: string; on?: string }>();
  const [enabled, setEnabled] = useState(params.on !== 'false');

  const zoneName = params.name || 'Zone Detail';
  const source = params.source || 'Battery';
  const detail = params.detail || 'Stable operation';

  // Hero (glow header) colours — theme-aware ink so the glow stays legible on
  // BOTH themes (mirrors the home hero). Light mode sits on a pale peach glow,
  // so it borrows the dark warm ink the glass TopBar uses (#2B1205).
  const heroInk = mode === 'dark' ? '#FFFFFF' : '#2B1205';
  const heroInkSoft = mode === 'dark' ? 'rgba(255,255,255,0.70)' : 'rgba(43,18,5,0.72)';
  const heroTrack = mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(43,18,5,0.16)';
  const heroFillColors: [string, string] = mode === 'dark' ? ['#FDBA74', '#F97316'] : ['#F97316', '#C2410C'];

  return (
    <ScreenShell scroll>
      {/* ============ HERO: GLASS TOP BAR + ZONE BATTERY HEALTH ============ */}
      <View style={styles.hero}>
        <HeroGlow mode={mode} intensity={1} bleedBottom={scale(40)} />

        <View style={styles.heroTopBar}>
          <TopBar gutter={0} title="Zone Detail" showBack glass />
        </View>

        <View style={styles.heroBody}>
          <View style={styles.heroLabelRow}>
            <Ionicons name="battery-charging" size={scale(14)} color={heroInkSoft} />
            <Text style={[styles.heroLabel, { color: heroInkSoft }]} numberOfLines={1}>
              {zoneName}
            </Text>
          </View>

          <View style={styles.heroNumberRow}>
            <Text style={[styles.heroNumber, { color: heroInk }]}>82</Text>
            <Text style={[styles.heroUnit, { color: heroInkSoft }]}>%</Text>
          </View>

          <Text style={[styles.heroDesc, { color: heroInkSoft }]}>
            Powered by {source} · {detail}
          </Text>

          <View style={[styles.heroTrack, { backgroundColor: heroTrack }]}>
            <LinearGradient
              colors={heroFillColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.heroFill}
            />
          </View>
        </View>
      </View>

      <Text style={styles.sectionLabel}>LIVE READOUT</Text>
      <LinearGradient
        colors={mode === 'dark' ? ['#9A3412', '#EA580C', '#F97316'] : ['#C2410C', '#EA580C', '#F97316']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.statsCard}
      >
        <Readout icon="flash" value="24.6" unit="V" label="VOLTAGE" color="#1764B0" />
        <View style={styles.statsDivider} />
        <Readout icon="flash" value="62" unit="W" label="LOAD" color="#F59E0B" />
        <View style={styles.statsDivider} />
        <Readout icon="time-outline" value="6h 40m" unit="" label="RUNTIME LEFT" color="#F97316" />
      </LinearGradient>

      <Text style={styles.sectionLabel}>SMART SWITCHING</Text>
      <View style={styles.switchRow}>
        <Pressable onPress={() => setEnabled(true)} style={styles.switchButton}>
          {enabled ? (
            <LinearGradient colors={['#FFB347', '#F97316', '#EA580C']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.switchFill}>
              <Text style={styles.switchTextActive}>ON</Text>
            </LinearGradient>
          ) : <Text style={styles.switchText}>ON</Text>}
        </Pressable>
        <Pressable onPress={() => setEnabled(false)} style={styles.switchButton}>
          {!enabled ? (
            <LinearGradient colors={['#FFB347', '#F97316', '#EA580C']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.switchFill}>
              <Text style={styles.switchTextActive}>OFF</Text>
            </LinearGradient>
          ) : <Text style={styles.switchText}>OFF</Text>}
        </Pressable>
      </View>

      <Pressable onPress={() => router.push(`/pages/zones/${params.id}/runtime-calculator?name=${encodeURIComponent(zoneName)}&source=${encodeURIComponent(source)}`)}>
        <LinearGradient colors={['#0B63B7', '#0A2A4A']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.actionButton}>
        <Text style={styles.actionText}>Open Runtime Calculator</Text>
        <Ionicons name="chevron-forward" size={17} color="#FFFFFF" />
        </LinearGradient>
      </Pressable>
      <Pressable style={[styles.actionButton, styles.secondaryAction]} onPress={() => router.push(`/pages/schedule?name=${encodeURIComponent(zoneName)}`)}>
        <Text style={styles.secondaryActionText}>Configure Schedule &amp; Priority</Text>
        <Ionicons name="chevron-forward" size={17} color="#0B63B7" />
      </Pressable>
    </ScreenShell>
  );
}

function Readout({ icon, value, unit, label, color }: { icon: keyof typeof Ionicons.glyphMap; value: string; unit: string; label: string; color: string }) {
  const { colors: c, mode } = useTheme();
  const styles = makeStyles(c);
  return (
    <LinearGradient
      colors={mode === 'dark' ? ['#9A3412', '#EA580C', '#F97316'] : ['#C2410C', '#EA580C', '#F97316']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.readoutCard}
    >
      <View style={[styles.readoutIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={13} color={color} />
      </View>
      <View style={styles.valueRow}>
        <Text style={styles.readoutValue}>{value}</Text>
        {unit ? <Text style={styles.readoutUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.readoutLabel}>{label}</Text>
    </LinearGradient>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  // Hero: glass top bar + zone battery health on a shared orange glow (mirrors home)
  hero: { marginHorizontal: -20, paddingHorizontal: 20, paddingBottom: scale(26), position: 'relative', zIndex: 10 },
  heroTopBar: { zIndex: 5 },
  heroBody: { zIndex: 1, alignItems: 'center', marginTop: scale(6) },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  heroLabel: { fontSize: scale(12), letterSpacing: 0.4, fontFamily: fonts.extrabold },
  heroNumberRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: scale(6) },
  heroNumber: { fontSize: scale(72), lineHeight: scale(78), letterSpacing: -2, fontFamily: fonts.extrabold },
  heroUnit: { fontSize: scale(24), marginLeft: scale(3), fontFamily: fonts.extrabold },
  heroDesc: { fontSize: scale(9.5), textAlign: 'center', marginTop: scale(10), fontFamily: fonts.medium },
  heroTrack: { alignSelf: 'stretch', height: scale(6), borderRadius: 99, overflow: 'hidden', marginTop: scale(16) },
  heroFill: { width: '82%', height: '100%', borderRadius: 99 },
  sectionLabel: { color: c.muted, fontSize: scale(10), letterSpacing: 1.3, fontFamily: fonts.extrabold, marginTop: scale(13), marginBottom: scale(7), marginLeft: scale(2) },
  switchRow: { flexDirection: 'row', gap: scale(7) },
  switchButton: { flex: 1, height: scale(46), borderRadius: scale(13), backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  switchFill: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  switchText: { color: c.muted, fontSize: scale(11), fontFamily: fonts.extrabold },
  switchTextActive: { color: '#FFFFFF', fontSize: scale(11), fontFamily: fonts.extrabold },
  statsCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.surface, borderRadius: scale(19), borderWidth: 1, borderColor: c.line, paddingVertical: scale(14), paddingHorizontal: scale(7), shadowColor: '#EA580C', shadowOpacity: 0.12, shadowRadius: scale(12), shadowOffset: { width: 0, height: 5 }, elevation: 4 },
  statsDivider: { width: 1, height: scale(48), backgroundColor: c.line },
  readoutCard: { flex: 1, minHeight: scale(78), alignItems: 'center', justifyContent: 'center', padding: scale(6), marginHorizontal: scale(3), borderRadius: scale(13), overflow: 'hidden' },
  readoutIcon: { width: scale(28), height: scale(28), borderRadius: scale(8), backgroundColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center', marginBottom: scale(6) },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  readoutValue: { color: '#FFFFFF', fontSize: scale(17), fontFamily: fonts.extrabold },
  readoutUnit: { color: 'rgba(255,255,255,0.90)', fontSize: scale(9), fontFamily: fonts.medium },
  readoutLabel: { color: 'rgba(255,255,255,0.84)', fontSize: scale(7.5), letterSpacing: 0.5, fontFamily: fonts.bold, marginTop: 3 },
  actionButton: { minHeight: scale(46), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), borderRadius: scale(13), marginTop: scale(12), paddingHorizontal: scale(12), overflow: 'hidden' },
  actionText: { color: '#FFFFFF', fontSize: scale(11), fontFamily: fonts.extrabold },
  secondaryAction: { backgroundColor: c.surface, borderWidth: 1, borderColor: '#0B63B7' },
  secondaryActionText: { color: '#0B63B7', fontSize: scale(11), fontFamily: fonts.extrabold },
});
