import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,  
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { Card, SectionHead, AnimatedPressable, LiveDot, scale, GOLD, NAVY } from '../../components/glass-ui';
import { fonts, useTheme } from '../../theme';

type Range = 'today' | 'week' | 'month';

const RANGES: { key: Range; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
];

type RangeData = {
  title: string;
  subtitle: string;
  /** Short period label shown beside the live dot. */
  live: string;
  updated: string;
  labels: string[];
  values: number[];
};

/* Chart data per range — labels + kWh values */
const CHART: Record<Range, RangeData> = {
  today: {
    title: '24h Generation Forecast',
    subtitle: 'Predicted kinetic output, Gate Pathway',
    live: 'Forecast for Aug 12, 2026',
    updated: 'updated 2 min ago',
    labels: ['12AM', '2AM', '4AM', '6AM', '8AM', '10AM', '12PM', '2PM', '4PM', '6PM', '8PM', '10PM'],
    values: [4, 3, 5, 18, 42, 78, 95, 88, 70, 82, 55, 20],
  },
  week: {
    title: 'Weekly Generation',
    subtitle: 'Harvested energy per day, All zones',
    live: 'Week of Aug 10, 2026',
    updated: 'updated 2 min ago',
    labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    values: [52, 61, 48, 74, 82, 95, 70],
  },
  month: {
    title: 'Monthly Energy Trend',
    subtitle: 'Harvested energy per month (kWh)',
    live: 'Jan – Sep 2026',
    updated: 'updated 2 min ago',
    labels: ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S'],
    values: [420, 505, 470, 610, 560, 690, 720, 760, 740],
  },
};

/* Billing impact per range */
const BILLING: Record<Range, { kwh: string; peso: string; co2: string }> = {
  today: { kwh: '4.82', peso: '₱86', co2: '91 kg' },
  week: { kwh: '38.6', peso: '₱688', co2: '28 kg' },
  month: { kwh: '128.4', peso: '₱2,314', co2: '91 kg' },
};

/** Gold ramp for the tallest bar. */
const BAR_GOLD = ['#F6C445', '#F59E0B'] as const;

/* --------------------------------- entrance ------------------------------- */

/** Staggered fade + lift, matching the shared page-entrance motion. */
function FadeIn({ delay = 0, children, style }: { delay?: number; children: ReactNode; style?: any }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withTiming(1, { duration: 480, easing: Easing.out(Easing.cubic) }));
  }, [delay, v]);
  const animated = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: (1 - v.value) * scale(16) }],
  }));
  return <Animated.View style={[animated, style]}>{children}</Animated.View>;
}

/* ------------------------- animated chart pieces ------------------------- */

/** One bar that springs to its height whenever the value changes. */
function Bar({
  pct,
  delay,
  widest,
  tones,
}: {
  pct: number;
  delay: number;
  widest: boolean;
  tones: readonly [string, string];
}) {
  const h = useSharedValue(0);
  useEffect(() => {
    h.value = withDelay(delay, withSpring(pct, { damping: 15, stiffness: 120 }));
  }, [pct, delay, h]);
  const aStyle = useAnimatedStyle(() => ({ height: `${h.value}%` }));
  return (
    <View style={st.barCol}>
      <View style={st.barTrack}>
        <Animated.View style={[aStyle, { width: '100%' }]}>
          <LinearGradient colors={widest ? BAR_GOLD : tones} style={st.barFill} />
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
  const avg = Math.round(data.values.reduce((a, b) => a + b, 0) / data.values.length);
  const rangeLabel = range === 'today' ? 'TODAY' : range === 'week' ? 'THIS WEEK' : 'THIS MONTH';
  const barTones: readonly [string, string] = mode === 'dark' ? ['#3E7BC0', '#1E4C82'] : ['#3A6EA8', '#0A2A4A'];

  const impacts = [
    { value: billing.kwh, label: 'KWH HARVESTED', color: mode === 'dark' ? GOLD : '#B4771B' },
    { value: billing.peso, label: 'MERALCO SAVINGS', color: c.accent },
    { value: billing.co2, label: 'CO₂ OFFSET', color: c.ok },
  ];

  return (
    <ScreenShell>
      {/* ===== page header ===== */}
      <FadeIn delay={0}>
        <View style={st.header}>
          <View style={st.headerEyebrowRow}>
            <View style={[st.headerTick, { backgroundColor: mode === 'dark' ? GOLD : NAVY }]} />
            <Text
              style={{
                color: mode === 'dark' ? 'rgba(246,196,69,0.85)' : '#B4771B',
                fontSize: scale(8.5),
                letterSpacing: 2.2,
                fontFamily: fonts.extrabold,
              }}
            >
              INSIGHTS & ANALYTICS
            </Text>
          </View>
          <Text style={{ color: c.text, fontSize: scale(24), fontFamily: fonts.extrabold, letterSpacing: -0.3 }}>
            Energy Reports
          </Text>
          <Text style={{ color: c.muted, fontSize: scale(10.5), fontFamily: fonts.medium, marginTop: scale(3) }}>
            Kinetic harvesting · generation, billing & savings
          </Text>
        </View>
      </FadeIn>

      {/* ===== report range ===== */}
      <FadeIn delay={80}>
        <SectionHead title="REPORT RANGE" mode={mode} />
        <View style={{ flexDirection: 'row', gap: scale(8) }}>
          {RANGES.map((r) => {
            const active = range === r.key;
            return (
              <AnimatedPressable key={r.key} onPress={() => setRange(r.key)} style={{ flex: 1 }}>
                <View
                  style={[
                    st.chip,
                    {
                      backgroundColor: active ? 'transparent' : c.surfaceMuted,
                      borderColor: active ? GOLD : c.line,
                    },
                    active && st.chipActive,
                  ]}
                >
                  {active ? (
                    <LinearGradient colors={['#F6C445', '#E2A617']} style={StyleSheet.absoluteFill} />
                  ) : null}
                  <Text style={[st.chipText, { color: active ? NAVY : c.textSoft }]}>{r.label}</Text>
                </View>
              </AnimatedPressable>
            );
          })}
        </View>
      </FadeIn>

      {/* ===== forecast — animated gradient chart ===== */}
      <FadeIn delay={160}>
        <Card mode={mode} style={{ marginTop: scale(14), borderRadius: scale(20), padding: scale(16) }}>
          <View style={{ flexDirection: 'row', gap: scale(10) }}>
            <View style={st.cardAccent} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: scale(15), fontFamily: fonts.extrabold }}>{data.title}</Text>
              <Text style={{ color: c.muted, fontSize: scale(10), fontFamily: fonts.medium, marginTop: scale(2) }}>
                {data.subtitle}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6), marginTop: scale(12), marginBottom: scale(4) }}>
            <LiveDot color={GOLD} />
            <Text style={{ color: c.text, fontSize: scale(9.5), fontFamily: fonts.extrabold }}>{data.live}</Text>
            <Text style={{ color: c.muted, fontSize: scale(9), fontFamily: fonts.medium }}>· {data.updated}</Text>
          </View>

          <View style={st.chart}>
            {data.values.map((v, i) => (
              <Bar key={`${range}-${i}`} pct={(v / max) * 100} delay={i * 55} widest={i === widestIdx} tones={barTones} />
            ))}
          </View>

          <View style={st.xLabels}>
            {data.labels.map((l, i) => (
              <Text key={i} style={[st.xLabel, { color: c.muted }]}>
                {l}
              </Text>
            ))}
          </View>

          {/* peak read-out */}
          <View
            style={[
              st.peakRow,
              { backgroundColor: mode === 'dark' ? 'rgba(74,222,128,0.12)' : 'rgba(21,128,61,0.08)' },
            ]}
          >
            <Ionicons name="trending-up" size={scale(12)} color={c.ok} />
            <Text style={{ color: c.textSoft, fontSize: scale(9.5), fontFamily: fonts.semibold }}>
              Peak {max} kWh · avg {avg} kWh
            </Text>
          </View>
        </Card>
      </FadeIn>

      {/* ===== billing impact — this period ===== */}
      <FadeIn delay={240}>
        <SectionHead title={`BILLING IMPACT — ${rangeLabel}`} mode={mode} />
        <View style={{ flexDirection: 'row', gap: scale(8) }}>
          {impacts.map((it) => (
            <Card
              key={it.label}
              mode={mode}
              style={{ flex: 1, borderRadius: scale(16), paddingVertical: scale(12), alignItems: 'center' }}
            >
              <Text style={{ color: it.color, fontSize: scale(15), fontFamily: fonts.extrabold }}>{it.value}</Text>
              <Text
                style={{
                  color: c.muted,
                  fontSize: scale(7),
                  letterSpacing: 0.8,
                  fontFamily: fonts.bold,
                  marginTop: scale(3),
                  textAlign: 'center',
                }}
              >
                {it.label}
              </Text>
            </Card>
          ))}
        </View>
      </FadeIn>

      {/* ===== export reports ===== */}
      <FadeIn delay={320}>
        <SectionHead title="EXPORT REPORTS" mode={mode} />
        <View style={{ flexDirection: 'row', gap: scale(10) }}>
          {[
            { icon: 'document-text' as const, label: 'PDF' },
            { icon: 'grid' as const, label: 'CSV' },
          ].map((x) => (
            <AnimatedPressable key={x.label} style={{ flex: 1 }}>
              <View
                style={[
                  st.exportBtn,
                  {
                    backgroundColor: mode === 'dark' ? c.surfaceMuted : 'rgba(255,255,255,0.85)',
                    borderColor: mode === 'dark' ? 'rgba(246,196,69,0.32)' : 'rgba(246,196,69,0.6)',
                  },
                ]}
              >
                <View style={[st.exportIcon, { backgroundColor: c.accentSoft }]}>
                  <Ionicons name={x.icon} size={scale(15)} color={c.onAccentSoft} />
                </View>
                <Text style={{ color: c.text, fontSize: scale(12), fontFamily: fonts.extrabold, marginLeft: scale(7) }}>
                  {x.label}
                </Text>
              </View>
            </AnimatedPressable>
          ))}
        </View>
      </FadeIn>

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
  },
  chipActive: {
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
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
    borderRadius: 999,
    paddingHorizontal: scale(9),
    paddingVertical: scale(5),
  },
  exportIcon: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(10),
    alignItems: 'center',
    justifyContent: 'center',
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: scale(14),
    paddingVertical: scale(12),
  },
});
