import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { ContentCard } from '../../components/content-card';

const MUTED = 'rgba(10, 42, 74, 0.62)';

// Mirrors web reports KPIs
const KPIS = [
  { label: 'Total Energy', value: '5,490 kWh', delta: '+14.2%' },
  { label: 'Waste Processed', value: '3,768 kg', delta: '+8.1%' },
  { label: 'CO₂ Avoided', value: '1,842 kg', delta: '+5.4%' },
  { label: 'Revenue', value: 'Php 12,480', delta: '+11.9%' },
];

// Mirrors web monthlyTrend
const TREND = [
  { m: 'Jan', energy: 420 }, { m: 'Feb', energy: 505 }, { m: 'Mar', energy: 470 },
  { m: 'Apr', energy: 610 }, { m: 'May', energy: 560 }, { m: 'Jun', energy: 690 },
  { m: 'Jul', energy: 720 }, { m: 'Aug', energy: 760 }, { m: 'Sep', energy: 740 },
];

// Mirrors web tileStats
const ZONES = [
  { zone: 'Gate A', sample: 1180, avg: 72, peak: 94, active: 92 },
  { zone: 'Hallway', sample: 920, avg: 58, peak: 88, active: 84 },
  { zone: 'Platform', sample: 720, avg: 41, peak: 76, active: 61 },
  { zone: 'Exit B', sample: 680, avg: 35, peak: 69, active: 52 },
];

export default function ReportsScreen() {
  const { colors: c, fonts: f } = useTheme();
  const styles = makeStyles(c);
  const PRUSSIAN = c.accent;
  const BUTTER = c.butter;
  const MUTED = c.muted;
  const LINE = c.line;
  const DANGER = c.danger;
  const WHITE = c.onAccent;
  const OK = c.ok;
  const BAD = c.danger;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <ScreenShell>
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading reports" size="lg" />
        </View>
      </ScreenShell>
    );
  }

  const maxEnergy = Math.max(...TREND.map((d) => d.energy));

  return (
    <ScreenShell>
      <View style={styles.kpiGrid}>
        {KPIS.map((k) => (
          <View key={k.label} style={styles.kpiCard}>
            <Text style={styles.kpiValue}>{k.value}</Text>
            <Text style={styles.kpiLabel}>{k.label}</Text>
            <Text style={styles.kpiDelta}>{k.delta} vs last month</Text>
          </View>
        ))}
      </View>

      <ContentCard eyebrow="Monthly Energy Trend (kWh)">
        <View style={styles.chart}>
          {TREND.map((d) => (
            <View key={d.m} style={styles.barCol}>
              <View style={[styles.bar, { height: (d.energy / maxEnergy) * 90 }]} />
              <Text style={styles.barLabel}>{d.m}</Text>
            </View>
          ))}
        </View>
      </ContentCard>

      <ContentCard eyebrow="Performance">
        <View style={[styles.zoneRow, styles.zoneHeader]}>
          <Text style={[styles.zoneCell, styles.zoneName]}>Zone</Text>
          <Text style={styles.zoneCell}>Avg</Text>
          <Text style={styles.zoneCell}>Peak</Text>
          <Text style={styles.zoneCell}>Active</Text>
        </View>
        {ZONES.map((z) => (
          <View key={z.zone} style={styles.zoneRow}>
            <Text style={[styles.zoneCell, styles.zoneName]}>{z.zone}</Text>
            <Text style={styles.zoneCell}>{z.avg}</Text>
            <Text style={styles.zoneCell}>{z.peak}</Text>
            <Text style={[styles.zoneCell, { color: BUTTER === '#F6C445' ? PRUSSIAN : PRUSSIAN, fontWeight: '800' }]}>
              {z.active}%
            </Text>
          </View>
        ))}
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
  const WHITE = c.onAccent;
  return StyleSheet.create({
  loaderWrap: { alignItems: 'center', paddingVertical: 48 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  kpiCard: {
    flexGrow: 1,
    flexBasis: '47%',
    backgroundColor: c.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(10, 42, 74, 0.1)',
    padding: 14,
  },
  kpiValue: { color: PRUSSIAN, fontSize: 17, fontWeight: '900', fontFamily: fonts.extrabold },
  kpiLabel: { color: MUTED, fontSize: 11, fontWeight: '600', fontFamily: fonts.semibold, marginTop: 2 },
  kpiDelta: { color: '#15803D', fontSize: 10, fontWeight: '700', fontFamily: fonts.bold, marginTop: 4 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 110 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: '100%' },
  bar: { width: '70%', backgroundColor: PRUSSIAN, borderTopRightRadius: 4, borderTopLeftRadius: 4 },
  barLabel: { color: MUTED, fontSize: 9, marginTop: 4, fontWeight: '600', fontFamily: fonts.semibold },
  zoneRow: {
    flexDirection: 'row',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(10, 42, 74, 0.08)',
  },
  zoneHeader: { borderBottomWidth: 2 },
  zoneCell: { flex: 1, color: MUTED, fontSize: 12, fontWeight: '600', fontFamily: fonts.semibold, textAlign: 'right' },
  zoneName: { flex: 1.4, textAlign: 'left', color: PRUSSIAN, fontWeight: '800', fontFamily: fonts.extrabold },
  });
};




