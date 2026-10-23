import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { ScreenShell } from '../../../components/screen-shell';
import { TopBar } from '../../../components/top-bar';
import { HeroGlow } from '../../../components/hero-glow';
import { useTheme, type ThemeColors } from '../../../theme';
import { fonts } from '../../../theme';
import { scale } from '../../../components/glass-ui';

const ZONE_OPTIONS = [
  { id: '1', name: 'Light #1', source: 'Battery', detail: 'Auto-off in 22m', on: true },
  { id: '2', name: 'Light #2', source: 'Grid', detail: 'Stable · 318 W', on: true },
];

export default function ZoneDetailScreen() {
  const router = useRouter();
  const { colors: c, mode } = useTheme();
  const styles = makeStyles(c);
  const params = useLocalSearchParams<{ id: string; name?: string; source?: string; detail?: string; on?: string }>();
  const initialZoneIndex = Math.max(0, ZONE_OPTIONS.findIndex((zone) => zone.name === params.name));
  const [zoneIndex, setZoneIndex] = useState(initialZoneIndex);
  const [enabled, setEnabled] = useState(params.on !== 'false');

  const zone = ZONE_OPTIONS[zoneIndex];
  const zoneName = zone.name;
  const source = zone.source;
  const detail = zone.detail;
  const selectZone = (nextIndex: number) => {
    setZoneIndex(nextIndex);
    setEnabled(ZONE_OPTIONS[nextIndex].on);
  };

  // Hero (glow header) colours — theme-aware ink so the glow stays legible on
  // BOTH themes (mirrors the home hero). Light mode sits on a pale peach glow,
  // so it borrows the dark warm ink the glass TopBar uses (#2B1205).
  const heroInk = mode === 'dark' ? '#FFFFFF' : '#2B1205';
  const heroInkSoft = mode === 'dark' ? 'rgba(255,255,255,0.70)' : 'rgba(43,18,5,0.72)';
  const heroTrack = mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(43,18,5,0.16)';
  const progressSize = scale(116);
  const progressStroke = scale(9);
  const progressRadius = (progressSize - progressStroke) / 2;
  const progressCircumference = 2 * Math.PI * progressRadius;
  const batteryLevel = 82;

  return (
    <ScreenShell scroll>
      {/* ============ HERO: GLASS TOP BAR + ZONE BATTERY HEALTH ============ */}
      <View style={styles.hero}>
        <HeroGlow mode={mode} intensity={1} bleedBottom={scale(40)} />

        <View style={styles.heroTopBar}>
          <TopBar gutter={0} title="Zone Detail" showBack glass />
        </View>

        <View style={styles.heroBody}>
          <View style={styles.zonePager}>
            <Pressable
              accessibilityLabel="Previous zone"
              disabled={zoneIndex === 0}
              onPress={() => selectZone(Math.max(0, zoneIndex - 1))}
              style={[styles.pagerButton, zoneIndex === 0 && styles.pagerButtonDisabled]}
            >
              <Ionicons name="chevron-back" size={scale(17)} color={heroInkSoft} />
            </Pressable>
            <View style={styles.heroLabelRow}>
              <Ionicons name="battery-charging" size={scale(14)} color={heroInkSoft} />
              <Text style={[styles.heroLabel, { color: heroInkSoft }]} numberOfLines={1}>
                {zoneName}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Next zone"
              disabled={zoneIndex === ZONE_OPTIONS.length - 1}
              onPress={() => selectZone(Math.min(ZONE_OPTIONS.length - 1, zoneIndex + 1))}
              style={[styles.pagerButton, zoneIndex === ZONE_OPTIONS.length - 1 && styles.pagerButtonDisabled]}
            >
              <Ionicons name="chevron-forward" size={scale(17)} color={heroInkSoft} />
            </Pressable>
          </View>

          <View style={styles.progressWrap}>
            <Svg width={progressSize} height={progressSize}>
              <Circle
                cx={progressSize / 2}
                cy={progressSize / 2}
                r={progressRadius}
                stroke={heroTrack}
                strokeWidth={progressStroke}
                fill="transparent"
              />
              <Circle
                cx={progressSize / 2}
                cy={progressSize / 2}
                r={progressRadius}
                stroke="#F97316"
                strokeWidth={progressStroke}
                strokeLinecap="round"
                strokeDasharray={`${progressCircumference} ${progressCircumference}`}
                strokeDashoffset={progressCircumference * (1 - batteryLevel / 100)}
                fill="transparent"
                rotation={-90}
                origin={`${progressSize / 2}, ${progressSize / 2}`}
              />
            </Svg>
            <View style={styles.progressCenter}>
              <Text style={[styles.progressValue, { color: heroInk }]}>{batteryLevel}%</Text>
              <Text style={[styles.progressLabel, { color: heroInkSoft }]}>BATTERY LEVEL</Text>
            </View>
          </View>

          <Text style={[styles.heroDesc, { color: heroInkSoft }]}>
            Powered by {source} · {detail}
          </Text>

          <View style={styles.smartSwitchContainer}>
            <View style={styles.smartSwitchHeader}>
              <Ionicons name="flash" size={scale(12)} color={heroInkSoft} />
              <Text style={[styles.smartSwitchLabel, { color: heroInkSoft }]}>SMART SWITCH</Text>
            </View>
            <Pressable
              onPress={() => setEnabled(!enabled)}
              style={[styles.singleSwitch, enabled && styles.singleSwitchActive]}
              accessibilityRole="switch"
              accessibilityState={{ checked: enabled }}
              accessibilityLabel={`Smart switch ${enabled ? 'on' : 'off'}`}
            >
              <View style={[styles.singleSwitchKnob, enabled && styles.singleSwitchKnobActive]} />
              <Text style={[styles.singleSwitchText, { color: enabled ? '#FFFFFF' : heroInkSoft }]}>
                {enabled ? 'ON' : 'OFF'}
              </Text>
            </Pressable>
          </View>

          <Text style={[styles.sectionLabel, { color: heroInkSoft }]}>LIVE READOUT</Text>
          <View style={styles.readoutRow}>
            <Readout icon="flash" value="24.6" unit="V" label="VOLTAGE" color="#1764B0" />
            <Readout icon="flash" value="62" unit="W" label="LOAD" color="#F59E0B" />
            <Readout icon="time-outline" value="6h 40m" unit="" label="RUNTIME LEFT" color="#F97316" />
          </View>
        </View>
      </View>

      <Pressable onPress={() => router.push(`/pages/zones/${zone.id}/runtime-calculator?name=${encodeURIComponent(zoneName)}&source=${encodeURIComponent(source)}`)}>
        <View style={[styles.actionButton, { backgroundColor: '#F5A220' }]}>
        <Text style={styles.actionText}>Open Runtime Calculator</Text>
        <Ionicons name="chevron-forward" size={17} color="#FFFFFF" />
        </View>
      </Pressable>
      <Pressable onPress={() => router.push(`/pages/schedule?name=${encodeURIComponent(zoneName)}`)}>
        <View style={[styles.actionButton, { backgroundColor: '#F5A220' }]}>
          <Text style={styles.actionText}>Configure Schedule &amp; Priority</Text>
          <Ionicons name="chevron-forward" size={17} color="#FFFFFF" />
        </View>
      </Pressable>
    </ScreenShell>
  );
}

function Readout({ icon, value, unit, label, color }: { icon: keyof typeof Ionicons.glyphMap; value: string; unit: string; label: string; color: string }) {
  const { colors: c, mode } = useTheme();
  const styles = makeStyles(c);
  return (
    <View style={[styles.readoutCard, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.58)' }]}>
      <View style={[styles.readoutIcon, { backgroundColor: `${color}18` }]}>
        <Ionicons name={icon} size={13} color={color} />
      </View>
      <View style={styles.readoutInfo}>
        <View style={styles.valueRow}>
          <Text style={[styles.readoutValue, { color: mode === 'dark' ? '#FFFFFF' : c.text }]}>{value}</Text>
          {unit ? <Text style={[styles.readoutUnit, { color: mode === 'dark' ? 'rgba(255,255,255,0.90)' : c.textSoft }]}>{unit}</Text> : null}
        </View>
        <Text style={[styles.readoutLabel, { color: mode === 'dark' ? 'rgba(255,255,255,0.84)' : c.muted }]}>{label}</Text>
      </View>
    </View>
  );
}

const makeStyles = (c: ThemeColors) => StyleSheet.create({
  // Hero: glass top bar + zone battery health on a shared orange glow (mirrors home)
  hero: { marginHorizontal: -20, paddingHorizontal: 20, paddingBottom: scale(26), position: 'relative', zIndex: 10 },
  heroTopBar: { zIndex: 5 },
  heroBody: { zIndex: 1, alignItems: 'center', marginTop: scale(6) },
  zonePager: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  pagerButton: { width: scale(30), height: scale(30), borderRadius: scale(10), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)' },
  pagerButtonDisabled: { opacity: 0.35 },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  heroLabel: { fontSize: scale(12), letterSpacing: 0.4, fontFamily: fonts.extrabold },
  progressWrap: { width: scale(144), height: scale(144), alignItems: 'center', justifyContent: 'center', marginTop: scale(10), position: 'relative' },
  progressCenter: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
  progressValue: { fontSize: scale(21), lineHeight: scale(25), fontFamily: fonts.extrabold },
  progressLabel: { fontSize: scale(6.5), letterSpacing: 0.5, fontFamily: fonts.extrabold, marginTop: scale(1) },
  heroDesc: { fontSize: scale(9.5), textAlign: 'center', marginTop: scale(10), fontFamily: fonts.medium },
  smartSwitchContainer: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: scale(10), padding: scale(6), borderRadius: scale(12), backgroundColor: 'rgba(255,255,255,0.12)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.24)' },
  sectionLabel: { color: c.muted, alignSelf: 'flex-start', fontSize: scale(8), letterSpacing: 1.1, fontFamily: fonts.extrabold, marginTop: scale(9), marginBottom: scale(4), marginLeft: scale(2) },
  readoutRow: { width: '100%', flexDirection: 'row', alignItems: 'stretch', justifyContent: 'space-between', gap: scale(6) },
  smartSwitchHeader: { flexDirection: 'row', alignItems: 'center', gap: scale(5), marginTop: scale(5) },
  smartSwitchLabel: { fontSize: scale(8), letterSpacing: 1, fontFamily: fonts.extrabold },
  singleSwitch: { width: scale(64), height: scale(27), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: scale(5), borderRadius: scale(14), backgroundColor: 'rgba(255,255,255,0.18)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)' },
  singleSwitchActive: { backgroundColor: '#F97316', borderColor: '#FDBA74' },
  singleSwitchKnob: { width: scale(17), height: scale(17), borderRadius: scale(9), backgroundColor: 'rgba(255,255,255,0.78)' },
  singleSwitchKnobActive: { backgroundColor: '#FFFFFF', borderWidth: 2 },
  singleSwitchText: { fontSize: scale(8), fontFamily: fonts.extrabold },
  statsDivider: { width: '100%', height: 1, backgroundColor: c.line, marginVertical: scale(5) },
  readoutCard: { width: '32%', flexShrink: 1, minHeight: scale(64), flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', paddingHorizontal: scale(8), paddingVertical: scale(7), borderRadius: scale(11), borderWidth: 1, borderColor: c.line, backgroundColor: 'rgba(255,255,255,0.78)', shadowColor: '#0B63B7', shadowOpacity: 0.08, shadowRadius: scale(8), shadowOffset: { width: 0, height: 3 }, elevation: 2, overflow: 'hidden' },
  readoutIcon: { width: scale(21), height: scale(21), borderRadius: scale(7), backgroundColor: 'rgba(255,255,255,0.20)', alignItems: 'center', justifyContent: 'center', marginBottom: scale(4) },
  readoutInfo: { alignItems: 'flex-start', minWidth: 0 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  readoutValue: { color: '#FFFFFF', fontSize: scale(12), fontFamily: fonts.extrabold },
  readoutUnit: { color: 'rgba(255,255,255,0.90)', fontSize: scale(8), fontFamily: fonts.medium },
  readoutLabel: { color: 'rgba(255,255,255,0.84)', fontSize: scale(6.5), letterSpacing: 0.35, fontFamily: fonts.bold, marginTop: 2 },
  actionButton: { minHeight: scale(46), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), borderRadius: scale(13), marginTop: scale(12), paddingHorizontal: scale(12), overflow: 'hidden' },
  actionText: { color: '#FFFFFF', fontSize: scale(11), fontFamily: fonts.extrabold },
});
