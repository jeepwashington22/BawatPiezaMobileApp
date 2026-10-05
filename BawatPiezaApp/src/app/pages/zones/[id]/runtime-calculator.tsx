import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ScreenShell } from '../../../../components/screen-shell';
import { TopBar } from '../../../../components/top-bar';
import { HeroGlow } from '../../../../components/hero-glow';
import { scale } from '../../../../components/glass-ui';
import { fonts, useTheme, type ThemeColors } from '../../../../theme';

const ZONES = ['1F - Room 109', '2F - Room 209'];
const MAX_HOURS = 12;
const WATTS_PER_HOUR = 85;
const BATTERY_WATT_HOURS = 500;

export default function RuntimeCalculatorScreen() {
  const { colors: c, mode } = useTheme();
  const styles = makeStyles(c);
  const params = useLocalSearchParams<{ name?: string; source?: string }>();
  const initialZone = params.name ? `${params.name}` : ZONES[0];
  const [zoneIndex, setZoneIndex] = useState(Math.max(0, ZONES.indexOf(initialZone)));
  const [hours, setHours] = useState(4);
  const zone = ZONES[zoneIndex];

  const energyNeeded = hours * WATTS_PER_HOUR;
  const batteryPercent = Math.min(100, Math.round((energyNeeded / BATTERY_WATT_HOURS) * 100));
  const source = params.source || 'Battery';
  const heroInk = mode === 'dark' ? '#FFFFFF' : '#2B1205';
  const heroInkSoft = mode === 'dark' ? 'rgba(255,255,255,0.70)' : 'rgba(43,18,5,0.72)';

  const adjustHours = (delta: number) => {
    setHours((current) => Math.max(1, Math.min(MAX_HOURS, current + delta)));
  };

  return (
    <ScreenShell scroll>
      <View style={styles.hero}>
        <HeroGlow mode={mode} intensity={1} bleedBottom={scale(35)} />
        <View style={styles.heroTopBar}>
          <TopBar gutter={0} title="Runtime Calculator" showBack glass />
        </View>
        <View style={styles.heroBody}>
          <View style={styles.heroLabelRow}>
            <Ionicons name="flash" size={scale(14)} color={heroInkSoft} />
            <Text style={[styles.heroLabel, { color: heroInkSoft }]}>ZONE</Text>
          </View>
          <View style={styles.heroMetricRow}>
            <Text style={[styles.heroMetric, { color: heroInk }]}>{batteryPercent}%</Text>
            <Text style={[styles.heroMetricLabel, { color: heroInkSoft }]}>BATTERY NEEDED</Text>
          </View>
          <Text style={[styles.heroDesc, { color: heroInkSoft }]}>{hours} hours of runtime for {zone}</Text>
          <View style={[styles.heroTrack, { backgroundColor: heroInkSoft }]}>
            <View style={[styles.heroFill, { width: `${batteryPercent}%` }]} />
          </View>
          <View style={styles.durationCard}>
            <Text style={styles.durationLabel}>TARGET LIGHTING DURATION</Text>
            <Text style={styles.durationTitle}>How long should the zone stay lit?</Text>
            <View style={styles.stepper}>
              <Pressable
                accessibilityLabel="Decrease lighting hours"
                onPress={() => adjustHours(-1)}
                style={styles.stepButton}
              >
                <Ionicons name="remove" size={scale(17)} color="#FFFFFF" />
              </Pressable>
              <View style={styles.hoursValue}>
                <Text style={styles.hours}>{hours}</Text>
                <Text style={styles.hoursLabel}>hours on battery</Text>
              </View>
              <Pressable
                accessibilityLabel="Increase lighting hours"
                onPress={() => adjustHours(1)}
                style={styles.stepButton}
              >
                <Ionicons name="add" size={scale(17)} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.pager}>
        <Pressable
          accessibilityLabel="Previous zone"
          disabled={zoneIndex === 0}
          onPress={() => setZoneIndex((current) => Math.max(0, current - 1))}
          style={[styles.pagerButton, zoneIndex === 0 ? styles.pagerButtonDisabled : null]}
        >
          <Ionicons name="chevron-back" size={scale(17)} color={c.text} />
        </Pressable>
        <View style={styles.pagerCenter}>
          <Text style={styles.pagerEyebrow}>LIGHTING ZONE</Text>
          <Text style={styles.pagerTitle}>{zone}</Text>
          <View style={styles.dots}>
            {ZONES.map((item, index) => (
              <View key={item} style={[styles.dot, index === zoneIndex ? styles.dotActive : null]} />
            ))}
          </View>
        </View>
        <Pressable
          accessibilityLabel="Next zone"
          disabled={zoneIndex === ZONES.length - 1}
          onPress={() => setZoneIndex((current) => Math.min(ZONES.length - 1, current + 1))}
          style={[styles.pagerButton, zoneIndex === ZONES.length - 1 ? styles.pagerButtonDisabled : null]}
        >
          <Ionicons name="chevron-forward" size={scale(17)} color={c.text} />
        </Pressable>
      </View>

      <View style={styles.capacityNote}>
        <Ionicons name="information-circle-outline" size={13} color={c.muted} />
        <Text style={styles.capacityText}>≈ {energyNeeded} Wh of a {BATTERY_WATT_HOURS} Wh LiFePO4 bank</Text>
      </View>
      <Text style={styles.helper}>Adjust the number above to see whether the battery can cover it.</Text>
    </ScreenShell>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  hero: { marginHorizontal: -20, paddingHorizontal: 20, paddingBottom: scale(27), position: 'relative', zIndex: 10 },
  heroTopBar: { zIndex: 5 },
  heroBody: { zIndex: 1, alignItems: 'center', marginTop: scale(7) },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: scale(5) },
  heroLabel: { fontSize: scale(10), letterSpacing: 1.2, fontFamily: fonts.extrabold },
  heroMetricRow: { alignItems: 'center', marginTop: scale(3) },
  heroMetric: { fontSize: scale(54), lineHeight: scale(58), fontFamily: fonts.extrabold },
  heroMetricLabel: { fontSize: scale(8), letterSpacing: 0.8, fontFamily: fonts.extrabold, marginTop: scale(-2) },
  heroDesc: { fontSize: scale(9), textAlign: 'center', marginTop: scale(8), fontFamily: fonts.medium },
  heroTrack: { alignSelf: 'stretch', height: scale(5), borderRadius: 99, overflow: 'hidden', marginTop: scale(13), opacity: 0.28 },
  heroFill: { height: '100%', borderRadius: 99, backgroundColor: '#F97316', opacity: 1 },
  durationCard: { alignSelf: 'stretch', backgroundColor: '#EA580C', borderRadius: scale(18), marginTop: scale(16), paddingVertical: scale(14), paddingHorizontal: scale(16), alignItems: 'center', shadowColor: '#9A3412', shadowOpacity: 0.25, shadowRadius: scale(12), shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  durationLabel: { color: 'rgba(255,255,255,0.72)', fontSize: scale(8), letterSpacing: 1.2, fontFamily: fonts.extrabold },
  durationTitle: { color: '#FFFFFF', fontSize: scale(11), fontFamily: fonts.extrabold, marginTop: scale(4) },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: scale(154), marginTop: scale(9) },
  stepButton: { width: scale(34), height: scale(34), borderRadius: scale(17), backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)' },
  hoursValue: { alignItems: 'center' },
  hours: { color: '#FFFFFF', fontSize: scale(24), lineHeight: scale(27), fontFamily: fonts.extrabold },
  hoursLabel: { color: 'rgba(255,255,255,0.76)', fontSize: scale(8), fontFamily: fonts.medium, marginTop: scale(2) },
  pager: { minHeight: scale(67), marginTop: scale(12), paddingHorizontal: scale(7), borderRadius: scale(17), backgroundColor: c.surface, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerButton: { width: scale(38), height: scale(38), borderRadius: scale(19), backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' },
  pagerButtonDisabled: { opacity: 0.3 },
  pagerCenter: { flex: 1, alignItems: 'center' },
  pagerEyebrow: { color: c.muted, fontSize: scale(7.5), letterSpacing: 1, fontFamily: fonts.extrabold },
  pagerTitle: { color: c.text, fontSize: scale(11), fontFamily: fonts.extrabold, marginTop: scale(3) },
  dots: { flexDirection: 'row', gap: scale(5), marginTop: scale(7) },
  dot: { width: scale(5), height: scale(5), borderRadius: scale(3), backgroundColor: c.line },
  dotActive: { width: scale(16), backgroundColor: '#F97316' },
  capacityNote: { flexDirection: 'row', alignItems: 'center', gap: scale(5), backgroundColor: c.surface, borderRadius: scale(12), minHeight: scale(34), paddingHorizontal: scale(11), marginTop: scale(14) },
  capacityText: { color: c.muted, fontSize: scale(9), fontFamily: fonts.medium },
  helper: { color: c.muted, fontSize: scale(9), textAlign: 'center', fontFamily: fonts.medium, marginTop: scale(9) },
});