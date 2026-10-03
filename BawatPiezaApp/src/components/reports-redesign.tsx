import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ScreenShell } from './screen-shell';
import { TopBar } from './top-bar';
import { HeroGlow } from './hero-glow';
import { Card, scale } from './glass-ui';
import { fonts, useTheme, type ThemeColors } from '../theme';

const FORECAST = [12, 37, 29, 34, 26, 31, 42, 20, 15, 25, 29, 12, 30, 35, 15];
const TREND = [58, 88, 60, 88, 72, 94, 47];
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

type ReportRange = 'today' | 'week' | 'month';

type HeroMetric = {
  key: 'harvested' | 'savings';
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  prefix?: string;
  suffix?: string;
  desc: string;
  /** 0-1 share drawn on the hero progress track. */
  fill: number;
  values: Record<ReportRange, string>;
};

// The hero carousel: [kWh harvested] <-> [billing impact].
// Billing impact is the default view, so the left arrow steps back to kWh
// harvested (and the right arrow returns).
const METRICS: HeroMetric[] = [
  {
    key: 'harvested',
    icon: 'flash',
    label: 'kWh harvested',
    suffix: 'kWh',
    desc: 'Kinetic energy captured across all zones',
    fill: 0.72,
    values: { today: '30', week: '214', month: '890' },
  },
  {
    key: 'savings',
    icon: 'wallet',
    label: 'Billing impact',
    prefix: '\u20B1',
    desc: 'Meralco savings from harvested energy',
    fill: 0.64,
    values: { today: '114', week: '688', month: '2,314' },
  },
];

export function ReportsRedesign() {
  const { colors: c, mode } = useTheme();
  const [range, setRange] = useState<ReportRange>('today');
  // Default to the billing impact slide; the left arrow reveals kWh harvested.
  const [metricIndex, setMetricIndex] = useState(1);
  const active = METRICS[metricIndex];

  const goPrev = () => setMetricIndex((i) => (i - 1 + METRICS.length) % METRICS.length);
  const goNext = () => setMetricIndex((i) => (i + 1) % METRICS.length);

  // Hero (glow header) colours — same warm ink language as the home dashboard,
  // so the glow stays legible on BOTH themes.
  const heroInk = mode === 'dark' ? '#FFFFFF' : '#2B1205';
  const heroInkSoft = mode === 'dark' ? 'rgba(255,255,255,0.70)' : 'rgba(43,18,5,0.72)';
  const heroTrack = mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(43,18,5,0.16)';
  const heroFillColors: [string, string] = mode === 'dark' ? ['#FDBA74', '#F97316'] : ['#F97316', '#C2410C'];
  const heroBtnBg = mode === 'dark' ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.55)';
  const heroBtnBorder = mode === 'dark' ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.85)';

  return (
    <ScreenShell>
      {/* ============ HERO: GLASS TOP BAR + BILLING IMPACT ON A GLOW ============ */}
      <View style={styles.hero}>
        <HeroGlow mode={mode} intensity={1} bleedBottom={scale(40)} />

        <View style={styles.heroTopBar}>
          <TopBar gutter={0} title="Reports" glass />
        </View>

        {/* Period selector — kept at the top, above the metric it controls */}
        <View style={styles.heroPeriodRow}>
          <Text style={[styles.heroPeriodLabel, { color: heroInkSoft }]}>PERIOD</Text>
          <View style={styles.rangeTabs}>
            {(['today', 'week', 'month'] as ReportRange[]).map((item) => (
              <Pressable key={item} onPress={() => setRange(item)}>
                <View style={[styles.rangeChip, range === item && { backgroundColor: mode === 'dark' ? 'rgba(96,165,250,0.22)' : '#DBEAFE', borderColor: mode === 'dark' ? 'rgba(147,197,253,0.50)' : '#93C5FD' }]}>
                  <Text style={[styles.rangeText, { color: range === item ? (mode === 'dark' ? '#BFDBFE' : '#1D4ED8') : heroInkSoft }]}>{item === 'today' ? 'Today' : item === 'week' ? '7D' : '30D'}</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.heroBody}>
          <View style={styles.heroCarousel}>
            <Pressable
              onPress={goPrev}
              hitSlop={8}
              style={[styles.heroArrow, { backgroundColor: heroBtnBg, borderColor: heroBtnBorder }]}
              accessibilityRole="button"
              accessibilityLabel="Show kWh harvested"
            >
              <Ionicons name="chevron-back" size={scale(18)} color={heroInk} />
            </Pressable>

            <View style={styles.heroCenter}>
              <View style={styles.heroLabelRow}>
                <Ionicons name={active.icon} size={scale(14)} color={heroInkSoft} />
                <Text style={[styles.heroLabel, { color: heroInkSoft }]}>{active.label}</Text>
              </View>

              <View style={styles.heroNumberRow}>
                {active.prefix ? (
                  <Text style={[styles.heroPrefix, { color: heroInkSoft }]}>{active.prefix}</Text>
                ) : null}
                <Text style={[styles.heroNumber, { color: heroInk }]}>{active.values[range]}</Text>
                {active.suffix ? (
                  <Text style={[styles.heroUnit, { color: heroInkSoft }]}>{active.suffix}</Text>
                ) : null}
              </View>

              <Text style={[styles.heroDesc, { color: heroInkSoft }]}>{active.desc}</Text>
            </View>

            <Pressable
              onPress={goNext}
              hitSlop={8}
              style={[styles.heroArrow, { backgroundColor: heroBtnBg, borderColor: heroBtnBorder }]}
              accessibilityRole="button"
              accessibilityLabel="Show billing impact"
            >
              <Ionicons name="chevron-forward" size={scale(18)} color={heroInk} />
            </Pressable>
          </View>

          <View style={[styles.heroTrack, { backgroundColor: heroTrack }]}>
            <LinearGradient
              colors={heroFillColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.heroFill, { width: `${active.fill * 100}%` }]}
            />
          </View>

          <View style={styles.heroDots}>
            {METRICS.map((metric, index) => (
              <View
                key={metric.key}
                style={[styles.heroDot, { backgroundColor: index === metricIndex ? heroInk : heroTrack }]}
              />
            ))}
          </View>
        </View>
      </View>

      <Card mode={mode} style={styles.forecastCard}>
        <View style={styles.titleRow}>
          <View>
            <Text style={[styles.cardTitle, { color: c.text }]}>24h Generation Forecast</Text>
            <Text style={[styles.cardSubtitle, { color: c.muted }]}>Predicted kinetic output by zone, Gate Pathway</Text>
          </View>
          <Text style={[styles.todayBadge, { color: mode === 'dark' ? '#FDBA74' : '#C17D17', backgroundColor: mode === 'dark' ? 'rgba(249,115,22,0.16)' : '#FFF1D8' }]}>Today Only</Text>
        </View>
        <View style={[styles.statusPill, { backgroundColor: mode === 'dark' ? 'rgba(37,99,235,0.16)' : '#E7E8F0' }]}>
          <View style={styles.statusDot} />
          <Text style={[styles.statusText, { color: mode === 'dark' ? '#93C5FD' : '#26385E' }]}>Forecast for Aug 30, 2026 &#183; updated 2 min ago</Text>
        </View>
        <ForecastChart c={c} mode={mode} />
      </Card>

      <View style={[styles.anomaly, { backgroundColor: mode === 'dark' ? '#17120D' : '#F1EEEA', borderColor: mode === 'dark' ? 'rgba(251,146,60,0.20)' : 'transparent' }]}>
        <View style={styles.anomalyIcon}>
          <Ionicons name="warning-outline" size={scale(17)} color="#FFA51A" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.anomalyTitle}>Anomaly Detected</Text>
          <Text style={[styles.anomalyCopy, { color: c.muted }]}>Gate Pathway generation is 32% below the typical Tuesday average. Check for foot-traffic changes or a possible tile fault.</Text>
          <Text style={[styles.historyLink, { color: c.text }]}>View Power-Source History &#8594;</Text>
        </View>
      </View>

      <Card mode={mode} style={styles.trendCard}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Generation Trend</Text>
        <Text style={[styles.cardSubtitle, { color: c.muted }]}>Actual kWh harvested, last 7 days</Text>
        <View style={[styles.trendChart, { backgroundColor: mode === 'dark' ? '#111820' : '#F7F9FC' }]}>
          {TREND.map((value, index) => (
            <View key={DAYS[index]} style={styles.trendColumn}>
              <View style={[styles.trendBar, { height: `${value}%`, backgroundColor: index % 2 === 1 ? '#FB923C' : '#60A5FA', shadowColor: index % 2 === 1 ? '#FB923C' : '#60A5FA' }]} />
              <Text style={[styles.dayLabel, { color: c.muted }]}>{DAYS[index]}</Text>
            </View>
          ))}
        </View>
      </Card>

      <Card mode={mode} style={styles.mixCard}>
        <Text style={[styles.cardTitle, { color: c.text }]}>Power Source Mix</Text>
        <Text style={[styles.cardSubtitle, { color: c.muted }]}>Where today&apos;s power came from</Text>
        <View style={styles.mixBar}>
          <View style={[styles.mixSegment, { flex: 46, backgroundColor: '#F97316' }]} />
          <View style={[styles.mixSegment, { flex: 32, backgroundColor: '#34D399' }]} />
          <View style={[styles.mixSegment, { flex: 22, backgroundColor: '#60A5FA' }]} />
        </View>
        <View style={styles.legend}>
          <Legend color="#F97316" label="Waste-to-Energy 46%" c={c} />
          <Legend color="#34D399" label="Solar 32%" c={c} />
          <Legend color="#60A5FA" label="Grid 22%" c={c} />
        </View>
      </Card>
    </ScreenShell>
  );
}

function ForecastChart({ c, mode }: { c: ThemeColors; mode: 'light' | 'dark' }) {
  return (
    <View style={[styles.forecastChart, { backgroundColor: mode === 'dark' ? '#111820' : '#F7F9FC' }]}>
      <View style={styles.yAxis}>
        {['40W', '30W', '20W', '10W'].map((label) => (
          <Text key={label} style={[styles.axisLabel, { color: c.muted }]}>{label}</Text>
        ))}
      </View>
      <View style={styles.forecastBars}>
        {FORECAST.map((value, index) => (
          <View key={index} style={styles.forecastColumn}>
            <View style={[styles.forecastBar, { height: `${value * 1.65}%`, backgroundColor: index % 3 === 0 ? '#F97316' : '#60A5FA' }]} />
            <Text style={[styles.axisLabel, { color: c.muted }]}>
              {index === 1 ? '10AM' : index === 7 ? '2PM' : index === 11 ? '6PM' : index === 14 ? '9PM' : ''}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Legend({ color, label, c }: { color: string; label: string; c: ThemeColors }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={[styles.legendText, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Hero: glass top bar + billing impact on a shared orange glow (mirrors home)
  hero: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
    paddingBottom: scale(18),
    position: 'relative',
    zIndex: 10,
  },
  heroTopBar: { zIndex: 5 },
  heroBody: { zIndex: 1, marginTop: scale(6) },
  heroCarousel: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' },
  heroArrow: {
    width: scale(38),
    height: scale(38),
    borderRadius: scale(19),
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCenter: { flex: 1, alignItems: 'center', paddingHorizontal: scale(4) },
  heroLabelRow: { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  heroLabel: { fontSize: scale(10.5), letterSpacing: 0.4, fontFamily: fonts.bold },
  heroNumberRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: scale(6), justifyContent: 'center' },
  heroPrefix: { fontSize: scale(22), marginRight: scale(2), fontFamily: fonts.extrabold },
  heroNumber: { fontSize: scale(56), lineHeight: scale(62), letterSpacing: -2, fontFamily: fonts.extrabold },
  heroUnit: { fontSize: scale(20), marginLeft: scale(3), fontFamily: fonts.extrabold },
  heroDesc: { fontSize: scale(9.5), textAlign: 'center', marginTop: scale(8), fontFamily: fonts.medium },
  heroTrack: { alignSelf: 'stretch', height: scale(6), borderRadius: 99, overflow: 'hidden', marginTop: scale(14) },
  heroFill: { height: '100%', borderRadius: 99 },
  heroDots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), marginTop: scale(12) },
  heroDot: { width: scale(6), height: scale(6), borderRadius: 99 },

  heroPeriodRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: scale(12), marginBottom: scale(2), zIndex: 1 },
  heroPeriodLabel: { fontSize: scale(10), letterSpacing: 1.1, fontFamily: fonts.extrabold },
  rangeTabs: { flexDirection: 'row', gap: scale(4) },
  rangeChip: { borderWidth: 1, borderColor: 'transparent', borderRadius: scale(8), paddingHorizontal: scale(8), paddingVertical: scale(5) },
  rangeText: { fontSize: scale(9), fontFamily: fonts.bold },

  forecastCard: { padding: scale(14), borderRadius: scale(18), marginBottom: scale(10) },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: scale(12), fontFamily: fonts.bold },
  cardSubtitle: { fontSize: scale(9), fontFamily: fonts.medium, marginTop: scale(2) },
  todayBadge: { color: '#C17D17', backgroundColor: '#FFF1D8', borderRadius: scale(10), paddingHorizontal: scale(8), paddingVertical: scale(4), fontSize: scale(8), fontFamily: fonts.bold },
  statusPill: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: scale(5), backgroundColor: '#E7E8F0', borderRadius: scale(10), paddingHorizontal: scale(8), paddingVertical: scale(5), marginTop: scale(9) },
  statusDot: { width: scale(6), height: scale(6), borderRadius: scale(3), backgroundColor: '#0B63B7' },
  statusText: { color: '#26385E', fontSize: scale(8), fontFamily: fonts.bold },
  forecastChart: { flexDirection: 'row', height: scale(123), marginTop: scale(10), borderRadius: scale(12), padding: scale(9), paddingBottom: scale(5) },
  yAxis: { justifyContent: 'space-between', paddingBottom: scale(20), paddingRight: scale(7) },
  forecastBars: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: scale(3) },
  forecastColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  forecastBar: { width: '100%', maxHeight: scale(86), minHeight: scale(8), borderRadius: scale(5), shadowColor: '#60A5FA', shadowOpacity: 0.28, shadowRadius: scale(5), elevation: 2 },
  axisLabel: { fontSize: scale(7), fontFamily: fonts.medium },

  anomaly: { flexDirection: 'row', gap: scale(8), padding: scale(13), borderWidth: 1, borderRadius: scale(17), marginBottom: scale(10) },
  anomalyIcon: { width: scale(23), height: scale(23), alignItems: 'center', justifyContent: 'center' },
  anomalyTitle: { color: '#F97316', fontSize: scale(10), fontFamily: fonts.bold },
  anomalyCopy: { fontSize: scale(9), lineHeight: scale(12), fontFamily: fonts.medium, marginTop: scale(2) },
  historyLink: { fontSize: scale(9), fontFamily: fonts.bold, marginTop: scale(6) },

  trendCard: { padding: scale(14), marginBottom: scale(17) },
  trendChart: { height: scale(103), flexDirection: 'row', alignItems: 'flex-end', gap: scale(5), marginTop: scale(14), borderRadius: scale(12), padding: scale(9), paddingBottom: scale(7) },
  trendColumn: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'stretch' },
  trendBar: { minHeight: scale(20), borderRadius: scale(4), marginBottom: scale(7), shadowOpacity: 0.3, shadowRadius: scale(4), elevation: 2 },
  dayLabel: { textAlign: 'center', fontSize: scale(7), fontFamily: fonts.medium },

  mixCard: { padding: scale(14), marginBottom: scale(20) },
  mixBar: { flexDirection: 'row', height: scale(7), borderRadius: scale(5), overflow: 'hidden', marginTop: scale(15) },
  mixSegment: { height: '100%' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(10), marginTop: scale(10) },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: scale(4) },
  legendDot: { width: scale(7), height: scale(7), borderRadius: scale(4) },
  legendText: { fontSize: scale(8), fontFamily: fonts.medium },
});