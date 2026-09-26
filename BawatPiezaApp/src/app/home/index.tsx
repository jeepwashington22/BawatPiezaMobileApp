import { fonts, useTheme, type Mode } from '../../theme';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { ScreenShell } from '../../components/screen-shell';
import { TopBar } from '../../components/top-bar';
import { LoadingScreen } from '../../components/loading-screen';
import { Card, Glass, Toggle, SectionHead, LiveDot, brandAccent, bandInk, scale, GOLD, NAVY } from '../../components/glass-ui';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Line, Stop } from 'react-native-svg';

/* ------------------------------ demo data ------------------------------- */

// Exactly 5 rows x 6 cols = 30 tiles.
const HEAT_ROWS = 5;
const HEAT_COLS = 6;
const heatTiles: number[] = Array.from({ length: HEAT_ROWS * HEAT_COLS }, (_, i) => {
  const wave = Math.sin(i / 2.6) * 0.3 + Math.cos(i / 5) * 0.2;
  return Math.min(1, Math.max(0.06, 0.45 + wave + ((i * 2654435761) % 100) / 500));
});

/**
 * Foot-traffic ramp for the tile heat grid.
 *
 * Light mode keeps the green → yellow glow. Dark mode is a strict
 * black-and-white theme, so the same ramp is expressed in greys — from a dim
 * near-black up to bright white.
 */
const HEAT_STOPS: Record<Mode, string[]> = {
  light: ['#FFF1E8', '#FFD0B2', '#FF9D63', '#F97316', '#C2410C'],
  dark: ['#151515', '#3A3A3A', '#616161', '#949494', '#FFFFFF'],
};

const heatColor = (v: number, mode: Mode) => {
  const stops = HEAT_STOPS[mode];
  const idx = Math.min(stops.length - 1, Math.floor(v * stops.length));
  return stops[idx];
};

function EnterView({
  style,
  children,
}: {
  delay?: number;
  style?: object;
  children: React.ReactNode;
}) {
  return <View style={style}>{children}</View>;
}

/* ------------------------------- screen --------------------------------- */

export default function HomeScreen() {
  const { colors: c, mode } = useTheme();
  const router = useRouter();

  /**
   * Dark mode is a strict black-and-white theme, so every brand colour has a
   * neutral twin: `accent()` is the house gold in light mode and pure white in
   * dark mode, while `band()` is the ink that sits on the brand band (navy on
   * gold in light mode, black on white in dark mode).
   */
  const accent = (alpha = 1) => brandAccent(mode, alpha);
  const band = (alpha = 1) => bandInk(mode, alpha);
  const [checking, setChecking] = useState(true);

  const [zones, setZones] = useState([
    { id: '1', name: 'Light #1', source: 'Battery', detail: 'Auto-off in 22m', on: true },
    { id: '2', name: 'Light #2', source: 'Grid', detail: 'Stable · 318 W', on: true },
    { id: '3', name: 'Light #3', source: 'Solar', detail: 'Panel charging', on: false },
  ]);
  const [activeTile, setActiveTile] = useState<number | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        router.replace('/');
        return;
      }
      setChecking(false);
    };
    loadSession();
  }, [router]);

  const accountStatus = useMemo(() => ({ status: 'Live', uptime: '99.2%' }), []);

  if (checking) {
    return <LoadingScreen label="Verifying session" />;
  }

  const stats = [
    { label: 'VOLTAGE', value: '58.6', unit: 'V' },
    { label: 'POWER', value: '318', unit: 'W' },
    { label: 'BATTERY', value: '89', unit: '%' },
  ];
  const todayKwh = '4.82';
  const yesterdayKwh = '5.36';
  const consumptionDelta = '-10.1%';

  return (
    <ScreenShell>
        {/* Top nav — `gutter={0}` because ScreenShell already applies the 18px screen gutter. */}
      <LinearGradient colors={['#F97316', '#FB923C']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.topBarBleed}>
        <TopBar gutter={0} title="Dashboard" showTitleChevron lightContent />
      </LinearGradient>
      {/* ============ BATTERY HEALTH â€” full-width hero band ============ */}
      <EnterView style={st.heroBleed}>
        <LinearGradient
          colors={
            ['#F97316', '#FB923C']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[st.energyCard, { borderWidth: 0 }]}
        >
          <LinearGradient colors={['#FFF7ED', '#FDBA74', '#F97316']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={st.energyTrim} />
          <Ionicons name="battery-half" size={scale(108)} color="rgba(255,255,255,0.12)" style={st.energyBolt} />
          <View style={st.healthIntro}>
            <Text style={st.healthIntroTitle}>Battery health</Text>
            <Text style={st.healthIntroDescription}>Strong charge capacity for today&apos;s energy needs</Text>
          </View>
          <View style={st.healthBody}>
            <View style={st.healthNumberRow}>
              <Text style={st.healthNumber}>89</Text>
              <Text style={st.healthNumberUnit}>%</Text>
            </View>
            <Text style={st.healthStatus}>HEALTHY</Text>
          </View>
        </LinearGradient>
      </EnterView>

      <EnterView delay={90} style={st.statsSection}>
        <Glass mode={mode} style={[st.glassStats, { borderColor: mode === 'dark' ? 'rgba(147,197,253,0.30)' : 'rgba(37,99,235,0.20)' }]}>
          <View style={st.energySummaryHeader}>
            <View>
              <Text style={[st.statsEyebrow, { color: mode === 'dark' ? 'rgba(255,255,255,0.56)' : 'rgba(10,42,74,0.55)' }]}>TODAY&apos;S CONSUMPTION</Text>
              <View style={st.kwhRow}><Text style={[st.kwhValue, { color: c.text }]}>{todayKwh}</Text><Text style={st.kwhUnit}>kWh</Text></View>
            </View>
            <View style={st.comparisonPill}>
              <Ionicons name="trending-down" size={scale(13)} color="#2563EB" />
              <View>
                <Text style={st.comparisonValue}>{consumptionDelta}</Text>
                <Text style={st.comparisonLabel}>vs yesterday</Text>
              </View>
            </View>
          </View>
          <View style={st.comparisonTrack}><View style={st.comparisonFill} /></View>
          <Text style={[st.comparisonDetail, { color: mode === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(10,42,74,0.5)' }]}>{yesterdayKwh} kWh yesterday</Text>
          <View style={st.statsDivider} />
          <View style={st.statsRow}>
            {stats.map((s, i) => (
              <View key={s.label} style={[st.statCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: mode === 'dark' ? 'rgba(255,255,255,0.14)' : 'rgba(10,42,74,0.12)' }]}>
                <Text style={[st.statLabel, { color: mode === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(10,42,74,0.5)' }]}>{s.label}</Text>
                <View style={st.statValueRow}><Text style={[st.statValue, { color: c.text }]}>{s.value}</Text><Text style={st.statUnit}>{s.unit}</Text></View>
              </View>
            ))}
          </View>
        </Glass>
      </EnterView>

      <EnterView delay={170} style={st.chartSection}>
        <Glass mode={mode} style={st.chartCard}>
          <View style={st.chartHeader}>
            <View>
              <Text style={[st.chartTitle, { color: c.text }]}>Energy trend</Text>
              <Text style={[st.chartSubtitle, { color: mode === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(10,42,74,0.52)' }]}>Live battery output today</Text>
            </View>
            <View style={st.chartMetric}>
              <Text style={st.chartMetricValue}>{todayKwh}</Text>
              <Text style={st.chartMetricUnit}>kWh</Text>
            </View>
          </View>
          <View style={st.chartWrap}>
            <Svg viewBox="0 0 320 132" width="100%" height="100%" preserveAspectRatio="none">
              <Defs>
                <SvgGradient id="energyFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor="#2DD4BF" stopOpacity="0.28" />
                  <Stop offset="1" stopColor="#2DD4BF" stopOpacity="0" />
                </SvgGradient>
              </Defs>
              {[24, 54, 84, 114].map((y) => <Line key={y} x1="0" y1={y} x2="320" y2={y} stroke={mode === 'dark' ? '#FFFFFF' : '#0A2A4A'} strokeOpacity="0.09" strokeWidth="1" />)}
              <Path d="M0 105 C24 91 38 79 60 82 S92 99 116 87 S147 41 170 51 S203 83 228 65 S256 18 280 42 S302 54 320 31 L320 132 L0 132 Z" fill="url(#energyFill)" />
              <Path d="M0 105 C24 91 38 79 60 82 S92 99 116 87 S147 41 170 51 S203 83 228 65 S256 18 280 42 S302 54 320 31" fill="none" stroke="#2DD4BF" strokeWidth="3" strokeLinecap="round" />
              <Line x1="0" y1="131" x2="320" y2="131" stroke={mode === 'dark' ? '#FFFFFF' : '#0A2A4A'} strokeOpacity="0.16" strokeWidth="1" />
            </Svg>
          </View>
          <View style={st.chartLabels}>
            <Text style={[st.chartLabel, { color: c.muted }]}>6 AM</Text>
            <Text style={[st.chartLabel, { color: c.muted }]}>12 PM</Text>
            <Text style={[st.chartLabel, { color: c.muted }]}>6 PM</Text>
            <Text style={[st.chartLabel, { color: c.muted }]}>NOW</Text>
          </View>
        </Glass>
      </EnterView>

      {/* ============ MY ZONES â€” dedicated glass module ============ */}
      <EnterView delay={270}>
        <Glass mode={mode} style={st.zonesCard}>
          <View style={st.zonesHeader}>
            <View style={st.zonesTitleGroup}>
              <View style={st.zonesAccent} />
              <View>
                <Text style={[st.zonesEyebrow, { color: mode === 'dark' ? 'rgba(255,255,255,0.52)' : 'rgba(10,42,74,0.52)' }]}>CONNECTED SPACES</Text>
                <Text style={[st.zonesTitle, { color: c.text }]}>My zones</Text>
              </View>
            </View>
            <Pressable onPress={() => router.push('/pages/schedule')} style={st.manageButton}>
              <Text style={[st.manageText, { color: mode === 'dark' ? '#FFFFFF' : '#0B63B7' }]}>Manage</Text>
              <Ionicons name="arrow-forward" size={scale(13)} color={mode === 'dark' ? '#FFFFFF' : '#0B63B7'} />
            </Pressable>
          </View>
          <View style={[st.zonesSummary, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(11,99,183,0.07)' }]}>
            <Ionicons name="radio-outline" size={scale(14)} color={mode === 'dark' ? '#FFFFFF' : '#0B63B7'} />
            <Text style={[st.zonesSummaryText, { color: c.text }]}>{zones.filter((zone) => zone.on).length} of {zones.length} zones active</Text>
            <View style={st.zonesLiveDot} />
            <Text style={[st.zonesLiveText, { color: mode === 'dark' ? 'rgba(255,255,255,0.62)' : '#0B63B7' }]}>LIVE</Text>
          </View>
          {zones.length === 0 && (
            <Text style={{ color: mode === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(10,42,74,0.4)', fontSize: scale(10), fontFamily: fonts.medium, textAlign: 'center', paddingVertical: scale(16) }}>
              No zones yet
            </Text>
          )}
          {zones.map((z, i) => (
            <View key={z.id} style={st.zoneRow}>
              {i > 0 && (
                <View style={st.zoneDivider} />
              )}
              <Pressable
                onPress={() => router.push(`/pages/zones/${z.id}?name=${encodeURIComponent(z.name)}&source=${encodeURIComponent(z.source)}&detail=${encodeURIComponent(z.detail)}&on=${z.on}` as Href)}
                style={{ paddingVertical: scale(12), paddingHorizontal: scale(14) }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
                  <View
                    style={[
                      st.zoneIcon,
                      {
                        backgroundColor:
                          mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(10,42,74,0.05)',
                      },
                      z.on && { backgroundColor: accent(0.16), borderColor: accent(0.45) },
                    ]}
                  >
                    <Ionicons name="bulb" size={scale(15)} color={z.on ? accent() : mode === 'dark' ? 'rgba(255,255,255,0.35)' : 'rgba(10,42,74,0.3)'} />
                  </View>
                  <View style={{ flex: 1, marginLeft: scale(11) }}>
                    <Text style={{ color: c.text, fontSize: scale(12.5), fontFamily: fonts.bold }}>{z.name}</Text>
                    <Text style={{ color: mode === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(10,42,74,0.5)', fontSize: scale(9.5), fontFamily: fonts.medium, marginTop: 1 }}>
                      {z.source} · {z.detail}
                    </Text>
                  </View>
                  <Toggle on={z.on} onToggle={() => setZones((zs) => zs.map((x) => (x.id === z.id ? { ...x, on: !x.on } : x)))} />
                </View>
              </Pressable>
            </View>
          ))}
        </Glass>
      </EnterView>

      {/* ============ STATUS â€” glass strip ============ */}
      <EnterView delay={360} style={{ marginTop: scale(18) }}>
        <Card mode={mode} style={{ borderRadius: scale(16) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: scale(14) }}>
            <View>
              <Text
                style={[
                  st.microLabel,
                  {
                    color:
                      mode === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(120,130,150,0.9)',
                  },
                ]}
              >
                SYSTEM STATUS
              </Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6), marginTop: scale(3) }}>
                <LiveDot color={mode === 'dark' ? '#FFFFFF' : '#4CA83E'} />
                <Text style={{ color: c.text, fontSize: scale(13), fontFamily: fonts.extrabold }}>{accountStatus.status}</Text>
              </View>
            </View>
            <View
              style={[
                st.uptimePill,
                { backgroundColor: accent(0.12), borderColor: accent(0.3) },
              ]}
            >
              <Ionicons name="time-outline" size={scale(11)} color={accent()} />
              <Text style={{ color: accent(), fontSize: scale(9.5), fontFamily: fonts.bold }}>{accountStatus.uptime} uptime</Text>
            </View>
          </View>
        </Card>
      </EnterView>

      {/* ============ MOST WALKED-ON TILES ============ */}
      <EnterView delay={450}>
        <SectionHead title="MOST WALKED-ON TILES" link="Full heatmap" onLink={() => router.push('/pages/heatmap')} mode={mode} />
        <Card mode={mode} style={{ borderRadius: scale(18), padding: scale(14) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: scale(12.5), fontFamily: fonts.extrabold }}>Gate Pathway · Live Tile Heat</Text>
              <Text style={{ color: mode === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(10,42,74,0.5)', fontSize: scale(9.5), fontFamily: fonts.medium, marginTop: 1 }}>
                {mode === 'dark' ? 'Brighter white = more foot traffic' : 'Brighter green = more foot traffic'}
              </Text>
            </View>
            <View style={[st.stepsPill, { backgroundColor: accent(0.14), borderColor: accent(0.4) }]}>
              <Ionicons name="footsteps" size={scale(13)} color={mode === 'dark' ? '#FFFFFF' : NAVY} />
              <Text style={[st.stepsPillText, { color: c.text }]}>1,248</Text>
            </View>
          </View>

          <View
            style={[st.kineticRow, { borderColor: accent(0.35), backgroundColor: accent(0.10) }]}
          >
            <Ionicons name="footsteps" size={scale(14)} color={mode === 'dark' ? '#FFFFFF' : '#B4771B'} />
            <Text style={[st.kineticText, { color: mode === 'dark' ? 'rgba(255,255,255,0.75)' : 'rgba(10,42,74,0.7)' }]}>
              Footsteps converted today
            </Text>
            <Text style={{ color: mode === 'dark' ? '#FFFFFF' : '#4CA83E', fontSize: scale(11), fontFamily: fonts.extrabold }}>+0.34 kWh</Text>
          </View>

          {/* strict 5 x 6 grid â€” rows flex evenly so it fits any dimension */}
          <View style={[st.heatGrid, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.6)' }]}>
            {Array.from({ length: HEAT_ROWS }, (_, r) => (
              <View key={r} style={st.heatRow}>
                {Array.from({ length: HEAT_COLS }, (_, col) => {
                  const i = r * HEAT_COLS + col;
                  const v = heatTiles[i];
                  const active = activeTile === i;
                  return (
                    <Pressable
                      key={col}
                      onPress={() => setActiveTile(active ? null : i)}
                      style={[
                        st.heatTile,
                        {
                          backgroundColor: heatColor(v, mode),
                          shadowColor: mode === 'dark' ? '#FFFFFF' : '#4CA83E',
                          shadowOpacity: v * 0.9,
                          shadowRadius: scale(9),
                          borderWidth: mode === 'dark' ? 1 : 0,
                          borderColor: 'rgba(255,255,255,0.10)',
                        },
                        active && [
                          st.heatTileActive,
                          { borderColor: mode === 'dark' ? '#FFFFFF' : '#4CA83E' },
                        ],
                      ]}
                    >
                      {active && <Ionicons name="footsteps" size={scale(11)} color="#FFFFFF" />}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), marginTop: scale(10) }}>
            <Text style={[st.legendText, { color: mode === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(10,42,74,0.5)' }]}>Less</Text>
            <View style={{ flexDirection: 'row', gap: scale(3) }}>
              {[0.1, 0.35, 0.6, 0.82, 0.98].map((v, i) => (
                <View key={i} style={[st.legendSwatch, { backgroundColor: heatColor(v, mode) }]} />
              ))}
            </View>
            <Text style={[st.legendText, { color: mode === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(10,42,74,0.5)' }]}>More</Text>
          </View>

          {activeTile !== null && (
            <Text style={[st.tileInfo, { color: mode === 'dark' ? 'rgba(255,255,255,0.7)' : 'rgba(10,42,74,0.65)' }]}>
              Tile #{activeTile + 1} — {Math.round(heatTiles[activeTile] * 480)} crossings today
            </Text>
          )}
        </Card>
      </EnterView>

      <View style={{ height: scale(28) }} />
    </ScreenShell>
  );
}

/* ------------------------------- styles ---------------------------------- */

const st = StyleSheet.create({
  topBarBleed: {
    marginHorizontal: -20,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F97316',
  },
  heroBleed: {
    marginHorizontal: -20,
    
  },
  energyCard: {
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: scale(24),
    borderBottomRightRadius: scale(24),
    paddingHorizontal: scale(22),
    paddingTop: scale(16),
    paddingBottom: scale(16),
    shadowColor: 'rgba(10,42,74,0.35)',
    shadowOpacity: 0.4,
    shadowRadius: scale(14),
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  energyTrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: scale(3),
    backgroundColor: GOLD,
    opacity: 0.85,
  },
  luxDot: {
    width: scale(7),
    height: scale(7),
    borderRadius: 99,
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 1,
    shadowRadius: scale(4),
  },
  energyBolt: {
    position: 'absolute',
    right: scale(12),
    top: scale(16),
  },
  healthHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  healthHeading: {
    alignItems: 'center',
  },
  healthKicker: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: scale(8),
    letterSpacing: 1.8,
    fontFamily: fonts.extrabold,
  },
  healthTitle: {
    color: '#FFFFFF',
    fontSize: scale(25),
    marginTop: scale(4),
    fontFamily: fonts.extrabold,
  },
  healthMeta: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: scale(10),
    marginTop: scale(3),
    fontFamily: fonts.medium,
  },
  healthLive: {
    position: 'absolute',
    right: 0,
    top: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingHorizontal: scale(8),
    paddingVertical: scale(5),
    borderRadius: 99,
    backgroundColor: 'rgba(10,42,74,0.28)',
  },
  healthLiveText: {
    color: '#FFFFFF',
    fontSize: scale(8),
    letterSpacing: 1,
    fontFamily: fonts.extrabold,
  },
  healthBody: {
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    marginTop: scale(8),
  },
  healthNumberRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  healthNumber: {
    color: '#FFFFFF',
    fontSize: scale(76),
    lineHeight: scale(78),
    letterSpacing: -1,
    fontFamily: fonts.extrabold,
  },
  healthNumberUnit: {
    color: '#FFF7ED',
    fontSize: scale(25),
    marginLeft: scale(3),
    fontFamily: fonts.extrabold,
  },
  healthIntro: {
    alignItems: 'center',
    marginTop: scale(10),
  },
  healthIntroTitle: {
    color: '#FFFFFF',
    fontSize: scale(18),
    fontFamily: fonts.extrabold,
  },
  healthIntroDescription: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: scale(9),
    textAlign: 'center',
    marginTop: scale(3),
    fontFamily: fonts.medium,
  },
  healthCopy: {
    alignItems: 'center',
    width: '82%',
  },
  healthSummary: {
    color: '#FFFFFF',
    fontSize: scale(14),
    fontFamily: fonts.extrabold,
    textAlign: 'center',
  },
  healthDetail: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: scale(10),
    lineHeight: scale(15),
    marginTop: scale(5),
    fontFamily: fonts.medium,
    textAlign: 'center',
  },
  healthBar: {
    height: scale(5),
    borderRadius: 99,
    overflow: 'hidden',
    backgroundColor: 'rgba(10,42,74,0.28)',
    width: '100%',
    marginTop: scale(9),
  },
  energySummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kwhRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: scale(4),
    marginTop: scale(1),
  },
  kwhValue: {
    fontSize: scale(31),
    lineHeight: scale(34),
    fontFamily: fonts.extrabold,
  },
  kwhUnit: {
    color: '#2563EB',
    fontSize: scale(12),
    fontFamily: fonts.extrabold,
  },
  comparisonPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: 'rgba(37,99,235,0.24)',
    backgroundColor: 'rgba(37,99,235,0.10)',
    paddingHorizontal: scale(9),
    paddingVertical: scale(7),
  },
  comparisonValue: {
    color: '#2563EB',
    fontSize: scale(11),
    fontFamily: fonts.extrabold,
  },
  comparisonLabel: {
    color: '#1D4ED8',
    fontSize: scale(7.5),
    marginTop: scale(1),
    fontFamily: fonts.bold,
  },
  comparisonTrack: {
    height: scale(5),
    borderRadius: 99,
    overflow: 'hidden',
    backgroundColor: 'rgba(37,99,235,0.12)',
    marginTop: scale(11),
  },
  comparisonFill: {
    width: '90%',
    height: '100%',
    borderRadius: 99,
    backgroundColor: '#2563EB',
  },
  comparisonDetail: {
    fontSize: scale(8.5),
    marginTop: scale(5),
    fontFamily: fonts.medium,
  },
  statsDivider: {
    height: 1,
    backgroundColor: 'rgba(37,99,235,0.16)',
    marginVertical: scale(11),
  },
  zonesCard: {
    borderRadius: scale(20),
    padding: scale(14),
    marginTop: scale(18),
    overflow: 'hidden',
    shadowColor: '#0A2A4A',
    shadowOpacity: 0.1,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: 5 },
    elevation: 3,
  },
  zonesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: scale(12),
  },
  zonesTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(9),
  },
  zonesAccent: {
    width: scale(4),
    height: scale(31),
    borderRadius: 3,
    backgroundColor: '#0B63B7',
  },
  zonesEyebrow: {
    fontSize: scale(7.5),
    letterSpacing: 1.3,
    fontFamily: fonts.extrabold,
  },
  zonesTitle: {
    fontSize: scale(18),
    marginTop: scale(2),
    fontFamily: fonts.extrabold,
  },
  manageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    paddingHorizontal: scale(9),
    paddingVertical: scale(7),
    borderRadius: scale(9),
    backgroundColor: 'rgba(11,99,183,0.08)',
  },
  manageText: {
    fontSize: scale(9),
    fontFamily: fonts.bold,
  },
  zonesSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    borderRadius: scale(11),
    paddingHorizontal: scale(10),
    paddingVertical: scale(8),
    marginBottom: scale(2),
  },
  zonesSummaryText: {
    flex: 1,
    fontSize: scale(9),
    fontFamily: fonts.semibold,
  },
  zonesLiveDot: {
    width: scale(6),
    height: scale(6),
    borderRadius: scale(3),
    backgroundColor: '#22C55E',
  },
  zonesLiveText: {
    fontSize: scale(7),
    letterSpacing: 0.8,
    fontFamily: fonts.extrabold,
  },
  zoneRow: {
    position: 'relative',
  },
  zoneDivider: {
    height: 1,
    backgroundColor: 'rgba(10,42,74,0.09)',
    marginLeft: scale(56),
  },
  chartSection: {
    marginTop: scale(12),
  },
  chartCard: {
    borderRadius: scale(18),
    paddingHorizontal: scale(14),
    paddingTop: scale(14),
    paddingBottom: scale(10),
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  chartTitle: {
    fontSize: scale(13),
    fontFamily: fonts.extrabold,
  },
  chartSubtitle: {
    fontSize: scale(9),
    marginTop: scale(3),
    fontFamily: fonts.medium,
  },
  chartMetric: {
    alignItems: 'flex-end',
  },
  chartMetricValue: {
    color: '#0F9F98',
    fontSize: scale(19),
    lineHeight: scale(21),
    fontFamily: fonts.extrabold,
  },
  chartMetricUnit: {
    color: '#0F9F98',
    fontSize: scale(8),
    fontFamily: fonts.bold,
  },
  chartWrap: {
    height: scale(132),
    marginTop: scale(13),
  },
  chartLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: scale(1),
    marginTop: scale(3),
  },
  chartLabel: {
    fontSize: scale(7.5),
    fontFamily: fonts.medium,
  },
  healthRing: {
    width: scale(112),
    height: scale(112),
    alignItems: 'center',
    justifyContent: 'center',
  },
  healthRingTrack: {
    position: 'absolute',
    width: scale(106),
    height: scale(106),
    borderRadius: scale(53),
    borderWidth: scale(9),
    borderColor: 'rgba(10,42,74,0.28)',
  },
  healthRingArc: {
    position: 'absolute',
    width: scale(106),
    height: scale(106),
    borderRadius: scale(53),
    borderWidth: scale(9),
    borderColor: '#FFF7ED',
    borderLeftColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  healthRingCore: {
    width: scale(78),
    height: scale(78),
    borderRadius: scale(39),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10,42,74,0.26)',
  },
  healthValue: {
    color: '#FFFFFF',
    fontSize: scale(29),
    lineHeight: scale(31),
    fontFamily: fonts.extrabold,
  },
  healthUnit: {
    color: '#FFF7ED',
    fontSize: scale(10),
    fontFamily: fonts.extrabold,
  },
  healthStatus: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: scale(8),
    letterSpacing: 1.1,
    marginTop: scale(1),
    fontFamily: fonts.extrabold,
  },
  healthBarFill: {
    width: '89%',
    height: '100%',
    borderRadius: 99,
    backgroundColor: '#FFF7ED',
  },
  statsSection: {
    marginTop: scale(-9),
    zIndex: 2,
  },
  glassStats: {
    borderRadius: scale(17),
    paddingHorizontal: scale(14),
    paddingVertical: scale(12),
    shadowColor: '#0A2A4A',
    shadowOpacity: 0.14,
    shadowRadius: scale(12),
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  statsEyebrow: {
    fontSize: scale(8),
    letterSpacing: 1.5,
    fontFamily: fonts.extrabold,
    marginBottom: scale(9),
  },
  statLabel: {
    fontSize: scale(7.5),
    letterSpacing: 1.1,
    fontFamily: fonts.bold,
  },
  statValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: scale(2),
    marginTop: scale(3),
  },
  statValue: {
    fontSize: scale(16),
    fontFamily: fonts.extrabold,
  },
  statUnit: {
    color: '#2563EB',
    fontSize: scale(9),
    fontFamily: fonts.extrabold,
  },
  batteryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    minHeight: scale(112),
    borderTopLeftRadius: scale(74),
    borderTopRightRadius: scale(74),
    borderBottomLeftRadius: scale(22),
    borderBottomRightRadius: scale(22),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: scale(20),
    paddingTop: scale(28),
    paddingBottom: scale(14),
    shadowColor: 'rgba(10,42,74,0.3)',
    shadowOpacity: 0.25,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  batteryIcon: {
    width: scale(42),
    height: scale(42),
    borderRadius: scale(21),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.26)',
  },
  batteryEyebrow: {
    color: NAVY,
    fontSize: scale(8),
    letterSpacing: 1.4,
    fontFamily: fonts.extrabold,
  },
  batteryTitle: {
    color: NAVY,
    fontSize: scale(18),
    letterSpacing: 1,
    fontFamily: fonts.extrabold,
  },
  batteryPct: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(2),
    backgroundColor: 'rgba(10,42,74,0.10)',
    borderWidth: 1,
    borderColor: 'rgba(10,42,74,0.35)',
    borderRadius: scale(10),
    paddingHorizontal: scale(8),
    paddingVertical: scale(6),
  },
  batteryPctText: {
    color: NAVY,
    fontSize: scale(15),
    fontFamily: fonts.extrabold,
  },
  totalPill: {
    borderRadius: 999,
    paddingHorizontal: scale(12),
    paddingVertical: scale(5),
  },
  savedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    backgroundColor: 'rgba(21,128,61,0.12)',
    borderRadius: 999,
    paddingHorizontal: scale(10),
    paddingVertical: scale(5),
    marginTop: scale(8),
  },
  statsCard: {
    alignSelf: 'stretch',
    marginTop: scale(14),
    borderRadius: scale(14),
    paddingVertical: scale(8),
    paddingHorizontal: scale(6),
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.20)',
  },
  statsRow: {
    flexDirection: 'row',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: scale(2),
  },
  batterySection: {
    marginTop: scale(10),
  },
  sectionDivider: {
    height: 1,
    backgroundColor: 'rgba(10,42,74,0.12)',
    marginTop: scale(16),
    marginBottom: scale(2),
  },
  ringWrap: {
    width: scale(52),
    height: scale(52),
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringBg: {
    position: 'absolute',
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    borderWidth: scale(5),
  },
  ringArc: {
    position: 'absolute',
    width: scale(52),
    height: scale(52),
    borderRadius: scale(26),
    borderWidth: scale(5),
    borderTopColor: 'transparent',
    borderRightColor: 'transparent',
  },
  ringMask: {
    position: 'absolute',
    width: scale(20),
    height: scale(10),
    bottom: 0,
  },
  goalTrack: {
    height: scale(4),
    borderRadius: 99,
    overflow: 'hidden',
    marginTop: scale(8),
  },
  goalFill: {
    height: '100%',
    borderRadius: 99,
    backgroundColor: GOLD,
  },
  zoneIcon: {
    width: scale(32),
    height: scale(32),
    borderRadius: scale(10),
    backgroundColor: 'rgba(10,42,74,0.05)',
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    backgroundColor: 'rgba(246,196,69,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(246,196,69,0.4)',
    borderRadius: 999,
    paddingHorizontal: scale(9),
    paddingVertical: scale(5),
  },
  stepsPillText: {
    fontSize: scale(9.5),
    fontFamily: fonts.extrabold,
  },
  kineticRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    borderRadius: scale(11),
    borderWidth: 1,
    borderColor: 'rgba(246,196,69,0.35)',
    backgroundColor: 'rgba(246,196,69,0.10)',
    paddingHorizontal: scale(10),
    paddingVertical: scale(8),
    marginTop: scale(10),
    marginBottom: scale(10),
  },
  kineticText: {
    flex: 1,
    fontSize: scale(9.5),
    fontFamily: fonts.semibold,
  },
  heatGrid: {
    gap: scale(5),
    padding: scale(8),
    borderRadius: scale(16),
  },
  heatRow: {
    flexDirection: 'row',
    gap: scale(5),
  },
  heatTile: {
    flex: 1,
    aspectRatio: 1.3,
    borderRadius: scale(9),
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  heatTileActive: {
    borderWidth: 2,
    borderColor: '#4CA83E',
    shadowOpacity: 1,
    shadowRadius: scale(14),
    elevation: 8,
  },
  legendText: {
    fontSize: scale(8.5),
    fontFamily: fonts.medium,
  },
  legendSwatch: {
    width: scale(14),
    height: scale(7),
    borderRadius: scale(3),
  },
  tileInfo: {
    fontSize: scale(9.5),
    fontFamily: fonts.semibold,
    textAlign: 'center',
    marginTop: scale(8),
  },
  microLabel: {
    color: 'rgba(120,130,150,0.9)',
    fontSize: scale(7.5),
    letterSpacing: 1.3,
    fontFamily: fonts.bold,
  },
  uptimePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    backgroundColor: 'rgba(246,196,69,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(246,196,69,0.3)',
    borderRadius: 999,
    paddingHorizontal: scale(10),
    paddingVertical: scale(6),
  },
});


