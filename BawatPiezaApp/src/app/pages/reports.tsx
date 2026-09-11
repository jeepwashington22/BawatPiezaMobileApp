import { fonts, useTheme } from '../../theme';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { Card, SectionHead, AnimatedPressable, LiveDot, scale, GOLD, NAVY } from '../../components/glass-ui';

type Range = 'today' | 'week' | 'month';

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

/* Chart data per range â€” labels + kWh values */
const CHART: Record<Range, { labels: string[]; values: number[]; title: string; subtitle: string; meta: string }> = {
  today: {
    title: '24h Generation Forecast',
    subtitle: 'Predicted kinetic output, Gate Pathway',
    meta: 'Forecast for Aug 12, 2026 Â· updated 2 min ago',
    labels: ['12AM', '2AM', '4AM', '6AM', '8AM', '10AM', '12PM', '2PM', '4PM', '6PM', '8PM', '10PM'],
    values: [4, 3, 5, 18, 42, 78, 95, 88, 70, 82, 55, 20],
  },
  week: {
    title: 'Weekly Generation',
    subtitle: 'Harvested energy per day, All zones',
    meta: 'Week of Aug 10, 2026 Â· updated 2 min ago',
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    values: [52, 61, 48, 74, 82, 95, 70],
  },
  month: {
    title: 'Monthly Energy Trend',
    subtitle: 'Harvested energy per month (kWh)',
    meta: 'Jan â€“ Sep 2026 Â· updated 2 min ago',
    labels: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S'],
    values: [420, 505, 470, 610, 560, 690, 720, 760, 740],
  },
};

/* Billing impact per range */
const BILLING: Record<Range, { kwh: string; peso: string; co2: string }> = {
  today: { kwh: '4.82', peso: 'â‚±86', co2: '91 kg' },
  week: { kwh: '38.6', peso: 'â‚±688', co2: '28 kg' },
  month: { kwh: '128.4', peso: 'â‚±2,314', co2: '91 kg' },
};

/* ------------------------- animated chart pieces ------------------------- */

/** One bar that springs to its height whenever the value changes. */
function Bar({ pct, delay, widest }: { pct: number; delay: number; widest: boolean }) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(delay, withSpring(pct, { damping: 15, stiffness: 120 }));
  }, [pct, delay, h]);
  const aStyle = useAnimatedStyle(() => ({ height: `${h.value}%` }));
  return (
    <View style={st.barCol}>
      <View style={st.barTrack}>
        <Animated.View style={[aStyle, { width: '100%' }]}>
          <LinearGradient
            colors={widest ? ['#F6C445', '#F59E0B'] : ['#3A6EA8', '#0A2A4A']}
            style={st.barFill}
          />
        </Animated.View>
      </View>
    </View>
  );
}

/* ------------------------------- screen ---------------------------------- */

export default function ReportsScreen() {
  const { colors: c, mode } = useTheme();
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<Range>('today');

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <ScreenShell>
        <View style={st.loaderWrap}>
          <TileLoader label="Loading reports" size="lg" />
        </View>
      </ScreenShell>
    );
  }

  const data = CHART[range];
  const billing = BILLING[range];
  const max = Math.max(...data.values);
  const widestIdx = data.values.indexOf(max);

  const impacts = [
    { value: billing.kwh, label: 'KWH HARVESTED', color: '#B4771B' },
    { value: billing.peso, label: 'MERALCO SAVINGS', color: NAVY },
    { value: billing.co2, label: 'COâ‚‚ OFFSET', color: '#15803D' },
  ];

  return (
    <ScreenShell>
      {/* =================== PAGE HEADER — luxe intro =================== */}
      <View style={st.header}>
        <View style={st.headerEyebrowRow}>
          <View style={st.headerTick} />
          <Text style={{ color: mode === 'dark' ? 'rgba(246,196,69,0.85)' : '#B4771B', fontSize: scale(8.5), letterSpacing: 2.2, fontFamily: fonts.extrabold }}>INSIGHTS & ANALYTICS</Text>
        </View>
        <Text style={{ color: c.text, fontSize: scale(24), fontFamily: fonts.extrabold, letterSpacing: -0.3 }}>Energy Reports</Text>
        <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.5)' : 'rgba(10,42,74,0.5)', fontSize: scale(10.5), fontFamily: fonts.medium, marginTop: scale(3) }}>
          Kinetic harvesting · generation, billing & savings
        </Text>
      </View>

      {/* =================== REPORT RANGE — selector chips =================== */}
      <SectionHead title="REPORT RANGE" mode={mode} />
      <View style={{ flexDirection: 'row', gap: scale(8) }}>
        {RANGES.map((r) => {
          const active = range === r.key;
          return (
            <AnimatedPressable key={r.key} onPress={() => setRange(r.key)} style={{ flex: 1 }}>
              <View style={[st.chip, active && st.chipActive]}>
                {active ? (
                  <LinearGradient colors={['#F6C445', '#E2A617']} style={StyleSheet.absoluteFill} />
                ) : (
                  <View style={StyleSheet.absoluteFill} />
                )}
                <Text style={[st.chipText, { color: active ? NAVY : c.textSoft }]}>{r.label}</Text>
              </View>
            </AnimatedPressable>
          );
        })}
      </View>

      {/* =================== FORECAST â€” animated gradient chart =================== */}
      <Card mode={mode} style={{ marginTop: scale(14), borderRadius: scale(20), padding: scale(16) }}>
        <View style={{ flexDirection: 'row', gap: scale(10) }}>
          <View style={st.cardAccent} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: c.text, fontSize: scale(15), fontFamily: fonts.extrabold }}>{data.title}</Text>
            <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.55)' : 'rgba(10,42,74,0.5)', fontSize: scale(10), fontFamily: fonts.medium, marginTop: scale(2) }}>
              {data.subtitle}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6), marginTop: scale(12), marginBottom: scale(4) }}>
          <LiveDot color={GOLD} />
          <Text style={{ color: c.text, fontSize: scale(9.5), fontFamily: fonts.extrabold }}>
            Forecast for Aug 12, 2026
          </Text>
          <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.5)' : 'rgba(10,42,74,0.45)', fontSize: scale(9), fontFamily: fonts.medium }}>
            Â· updated 2 min ago
          </Text>
        </View>

        <View style={st.chart}>
          {data.values.map((v, i) => (
            <Bar key={`${range}-${i}`} pct={(v / max) * 100} delay={i * 55} widest={i === widestIdx} />
          ))}
        </View>

        <View style={st.xLabels}>
          {data.labels.map((l, i) => (
            <Text key={i} style={[st.xLabel, { color: mode === 'dark' ? 'rgba(237,242,250,0.5)' : 'rgba(10,42,74,0.45)' }]}>
              {l}
            </Text>
          ))}
        </View>

        {/* peak read-out */}
        <View style={st.peakRow}>
          <Ionicons name="trending-up" size={scale(12)} color="#15803D" />
          <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.7)' : 'rgba(10,42,74,0.65)', fontSize: scale(9.5), fontFamily: fonts.semibold }}>
            Peak {max} kWh Â· avg {Math.round(data.values.reduce((a, b) => a + b, 0) / data.values.length)} kWh
          </Text>
        </View>
      </Card>

      {/* =================== BILLING IMPACT â€” this period =================== */}
      <SectionHead title={`BILLING IMPACT â€” ${range === 'today' ? 'TODAY' : range === 'week' ? 'THIS WEEK' : 'THIS MONTH'}`} mode={mode} />
      <View style={{ flexDirection: 'row', gap: scale(8) }}>
        {impacts.map((it) => (
          <Card key={it.label} mode={mode} style={{ flex: 1, borderRadius: scale(16), paddingVertical: scale(12), alignItems: 'center' }}>
            <Text style={{ color: it.color, fontSize: scale(15), fontFamily: fonts.extrabold }}>{it.value}</Text>
            <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.5)' : 'rgba(10,42,74,0.45)', fontSize: scale(7), letterSpacing: 0.8, fontFamily: fonts.bold, marginTop: scale(3), textAlign: 'center' }}>
              {it.label}
            </Text>
          </Card>
        ))}
      </View>

      {/* =================== EXPORT REPORTS =================== */}
      <SectionHead title="EXPORT REPORTS" mode={mode} />
      <View style={{ flexDirection: 'row', gap: scale(10) }}>
        {[
          { icon: 'document-text' as const, label: 'PDF' },
          { icon: 'grid' as const, label: 'CSV' },
        ].map((x) => (
          <AnimatedPressable key={x.label} style={{ flex: 1 }}>
            <View style={[st.exportBtn, { borderColor: mode === 'dark' ? 'rgba(246,196,69,0.3)' : 'rgba(246,196,69,0.6)' }]}>
              <View style={st.exportIcon}><Ionicons name={x.icon} size={scale(15)} color={NAVY} /></View>
              <Text style={{ color: c.text, fontSize: scale(12), fontFamily: fonts.extrabold, marginLeft: scale(7) }}>{x.label}</Text>
            </View>
          </AnimatedPressable>
        ))}
      </View>

      <View style={{ height: scale(10) }} />
    </ScreenShell>
  );
}

/* ------------------------------- styles ---------------------------------- */

const st = StyleSheet.create({
  loaderWrap: { alignItems: 'center', paddingVertical: 48 },
  header: { marginTop: scale(6), marginBottom: scale(6) },
  headerEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(7),
    marginBottom: scale(4),
  },
  headerTick: {
    width: scale(3),
    height: scale(12),
    borderRadius: 2,
    backgroundColor: GOLD,
  },
  cardAccent: {
    width: scale(3),
    height: scale(34),
    borderRadius: 2,
    backgroundColor: GOLD,
    marginTop: scale(1),
  },
  chip: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingVertical: scale(9),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(246,196,69,0.35)',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  chipActive: {
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
  },
  exportIcon: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(10),
    backgroundColor: 'rgba(246,196,69,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipText: {
    fontSize: scale(11),
    fontFamily: fonts.extrabold,
  },
  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: scale(130),
    marginTop: scale(10),
  },
  barCol: {
    flex: 1,
    height: '100%',
    justifyContent: 'flex-end',
    marginHorizontal: scale(1.5),
  },
  barTrack: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
    borderRadius: scale(5),
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    height: '100%',
    borderRadius: scale(5),
    borderTopLeftRadius: scale(2),
    borderTopRightRadius: scale(2),
  },
  xLabels: {
    flexDirection: 'row',
    marginTop: scale(6),
  },
  xLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: scale(7),
    fontFamily: fonts.semibold,
  },
  peakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    marginTop: scale(12),
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(21,128,61,0.08)',
    borderRadius: 999,
    paddingHorizontal: scale(9),
    paddingVertical: scale(5),
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderWidth: 1,
    borderRadius: scale(14),
    paddingVertical: scale(12),
  },
});

