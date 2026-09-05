import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { ContentCard } from '../../components/content-card';

const PRUSSIAN_SOFT = '#3B5B7A';
const WHITE = '#FFFFFF';
const MUTED = 'rgba(10, 42, 74, 0.62)';

// Mirrors web dashboard statCards (frontend/src/app/dashboard/page.tsx)
type Stat = { label: string; value: string; unit: string; delta: string; up: boolean; bg: string };
const STATS: Stat[] = [
  { label: 'Energy Today', value: '12.4', unit: 'kWh', delta: '+12%', up: true, bg: '#F6C445' },
  { label: 'Waste Converted', value: '8.6', unit: 'kg', delta: '+5%', up: true, bg: '#345271' },
  { label: 'CO₂ Offset', value: '3.9', unit: 'kg', delta: '-8%', up: false, bg: '#0A2A4A' },
];

// Mirrors web sourcesData mix
const SOURCES = [
  { name: 'Waste-to-Energy', pct: 46, color: '#0A2A4A' },
  { name: 'Solar', pct: 32, color: '#F6C445' },
  { name: 'Grid', pct: 22, color: '#345271' },
];

export default function EnergyScreen() {
  const { colors: c, fonts: f } = useTheme();
  const styles = makeStyles(c);
  const PRUSSIAN = c.accent;
  const BUTTER = c.butter;
  const MUTED = c.muted;
  const LINE = c.line;
  const DANGER = c.danger;
  const OK = c.ok;
  const BAD = c.danger;
  const [loading, setLoading] = useState(true);

  // Same simulated fetch as the web dashboard (900ms), swap for real queries later
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading energy data" size="lg" />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell>
      {STATS.map((s) => (
        <View key={s.label} style={[styles.statCard, { backgroundColor: s.bg }]}>
          <Text style={[styles.statValue, s.bg === BUTTER ? { color: PRUSSIAN } : null]}>
            {s.value}
            <Text style={styles.statUnit}> {s.unit}</Text>
          </Text>
          <View style={styles.statFooter}>
            <Text style={[styles.statLabel, s.bg === BUTTER ? { color: 'rgba(10,42,74,0.7)' } : null]}>
              {s.label}
            </Text>
            <Text style={[styles.statDelta, s.bg === BUTTER ? { color: PRUSSIAN } : null]}>{s.delta}</Text>
          </View>
        </View>
      ))}

      <ContentCard eyebrow="Sources">
        <View style={styles.mixTrack}>
          {SOURCES.map((src) => (
            <View key={src.name} style={{ flex: src.pct, backgroundColor: src.color, height: 10 }} />
          ))}
        </View>
        <View style={styles.legend}>
          {SOURCES.map((src) => (
            <View key={src.name} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: src.color }]} />
              <Text style={styles.legendText}>
                {src.name} · {src.pct}%
              </Text>
            </View>
          ))}
        </View>
      </ContentCard>

      <ContentCard eyebrow="Live">
        <View style={styles.flowRow}>
          <Text style={styles.flowLabel}>Inverter output</Text>
          <Text style={styles.flowValue}>4.2 kW</Text>
        </View>
        <View style={styles.flowRow}>
          <Text style={styles.flowLabel}>Battery level</Text>
          <Text style={styles.flowValue}>78%</Text>
        </View>
        <View style={[styles.flowRow, { borderBottomWidth: 0 }]}>
          <Text style={styles.flowLabel}>Tile array status</Text>
          <ActivityIndicator color={PRUSSIAN} size="small" />
        </View>
      </ContentCard>
    </ScreenShell>
  );
}

const makeStyles = (c: ThemeColors) => {
  const PRUSSIAN = c.accent;
  const MUTED = c.muted;
  const LINE = c.line;
  const BUTTER = c.butter;
  const DANGER = c.danger;
  return StyleSheet.create({
  loaderWrap: { alignItems: 'center', paddingVertical: 48 },
  statCard: {
    borderRadius: 22,
    padding: 20,
    marginBottom: 14,
    shadowColor: 'rgba(10, 42, 74, 0.18)',
    shadowOpacity: 1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  statValue: { color: WHITE, fontSize: 34, fontWeight: '900', fontFamily: fonts.extrabold, letterSpacing: -1 },
  statUnit: { fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold, opacity: 0.75 },
  statFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  statLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold },
  statDelta: { color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: '800', fontFamily: fonts.extrabold },
  mixTrack: { flexDirection: 'row', borderRadius: 6, overflow: 'hidden', marginBottom: 12 },
  legend: { gap: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  legendText: { color: MUTED, fontSize: 13, fontWeight: '600', fontFamily: fonts.semibold },
  flowRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(10, 42, 74, 0.08)',
  },
  flowLabel: { color: MUTED, fontSize: 14, fontWeight: '600', fontFamily: fonts.semibold },
  flowValue: { color: PRUSSIAN, fontSize: 15, fontWeight: '800', fontFamily: fonts.extrabold },
  });
};




