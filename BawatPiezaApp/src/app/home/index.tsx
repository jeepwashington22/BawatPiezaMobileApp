import { fonts, useTheme, type Mode } from '../../theme';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { supabase } from '../../lib/supabase';
import { ScreenShell } from '../../components/screen-shell';
import { TopBar } from '../../components/top-bar';
import { LoadingScreen } from '../../components/loading-screen';
import { Card, Toggle, SectionHead, AnimatedPressable, LiveDot, brandAccent, bandInk, scale, GOLD, NAVY } from '../../components/glass-ui';
import { LinearGradient } from 'expo-linear-gradient';

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
  light: ['#EDF2EC', '#CBE7B4', '#8FCB62', '#4CA83E', '#DCE24B'],
  dark: ['#151515', '#3A3A3A', '#616161', '#949494', '#FFFFFF'],
};

const heatColor = (v: number, mode: Mode) => {
  const stops = HEAT_STOPS[mode];
  const idx = Math.min(stops.length - 1, Math.floor(v * stops.length));
  return stops[idx];
};

/* --------------------------- entrance animation -------------------------- */

/**
 * Fades + lifts its children when it mounts.
 *
 * Why a component instead of a hook loop inside `HomeScreen`: the previous
 * implementation built its shared values with
 * `[0, 1, 2, 3, 4, 5].map(i => { useSharedValue(); useEffect(); useAnimatedStyle(); })`,
 * which makes the parent's hook count depend on how many sections that literal
 * listed. Adding or removing a section therefore changed the hook order and
 * React threw "Should have a queue. You are likely calling Hooks conditionally".
 * Owning the three hooks here keeps every call unconditional and in a fixed
 * order, and gives each section its own independent delay.
 */
function EnterView({
  delay = 0,
  style,
  children,
}: {
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const v = useSharedValue(0);
  const enterOffset = scale(16);

  useEffect(() => {
    v.value = withDelay(delay, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
  }, [delay, v]);

  const anim = useAnimatedStyle(() => ({
    opacity: v.value,
    transform: [{ translateY: (1 - v.value) * enterOffset }],
  }));

  return <Animated.View style={[anim, style]}>{children}</Animated.View>;
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
  const goalPct = 62;

  return (
    <ScreenShell>
      {/* Top nav — burger opens the navigation side panel. `gutter={0}` because
          ScreenShell already applies the 18px screen gutter. */}
      <TopBar gutter={0} />
      {/* ============ TOTAL CONSUMPTION â€” big, centered, no gradient card ============ */}
      <EnterView>
        <LinearGradient
          colors={
            mode === 'dark'
              ? ['#0A0A0A', '#121212', '#1B1B1B'] // flat greys — no navy in dark
              : ['#0A2A4A', '#123B66', '#1B4D8F']
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[st.energyCard, { borderWidth: 1, borderColor: accent(0.32) }]}
        >
          {/* gold lux top trim */}
          <View style={[st.energyTrim, { backgroundColor: accent() }]} />
          <Ionicons name="flash" size={scale(96)} color={accent(0.10)} style={st.energyBolt} />
          <View style={st.totalPill}>
            <View style={[st.luxDot, { backgroundColor: accent(), shadowColor: accent() }]} />
            <Text style={{ color: accent(0.95), fontSize: scale(8.5), letterSpacing: 2, fontFamily: fonts.extrabold }}>
              TOTAL CONSUMPTION · TODAY
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: scale(5) }}>
            <Text style={{ color: '#FFFFFF', fontSize: scale(52), fontFamily: fonts.extrabold, letterSpacing: -1.5 }}>4.82</Text>
            <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: scale(16), fontFamily: fonts.extrabold, marginBottom: scale(9) }}>kWh</Text>
          </View>
          <View style={[st.savedPill, { backgroundColor: 'rgba(255,255,255,0.10)' }]}>
            <Ionicons name="arrow-down" size={scale(11)} color={mode === 'dark' ? '#FFFFFF' : '#6EE7A0'} />
            <Text style={{ color: mode === 'dark' ? '#FFFFFF' : '#6EE7A0', fontSize: scale(10), fontFamily: fonts.bold }}>₱86 saved this month</Text>
          </View>

          {/* volts / power / battery — translucent luxe strip */}
          <View style={[st.statsCard, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.5)' }]}>
            <View style={st.statsRow}>
              {stats.map((s, i) => (
                <View key={s.label} style={[st.statCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: mode === 'dark' ? 'rgba(255,255,255,0.16)' : 'rgba(10,42,74,0.14)' }]}>
                  <Text style={{ color: accent(0.75), fontSize: scale(7.5), letterSpacing: 1.2, fontFamily: fonts.bold }}>
                    {s.label}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, justifyContent: 'center' }}>
                    <Text style={{ color: '#FFFFFF', fontSize: scale(15), fontFamily: fonts.extrabold }}>{s.value}</Text>
                    <Text style={{ color: accent(), fontSize: scale(8.5), fontFamily: fonts.bold }}>{s.unit}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </LinearGradient>
      </EnterView>

      <EnterView delay={90} style={{ marginTop: scale(14) }}>
        <LinearGradient
          colors={mode === 'dark' ? ['#FFFFFF', '#E8E8E8'] : ['#F6C445', '#E2A617']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={st.batteryBanner}
        >
          <View style={[st.batteryIcon, { backgroundColor: mode === 'dark' ? '#000000' : NAVY }]}>
            <Ionicons name="flash" size={scale(25)} color={mode === 'dark' ? '#FFFFFF' : '#F6C445'} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[st.batteryEyebrow, { color: band() }]}>POWERING VIA</Text>
            <Text style={[st.batteryTitle, { color: band() }]}>BATTERY</Text>
          </View>
          <View
            style={[
              st.batteryPct,
              { backgroundColor: band(0.10), borderColor: band(0.35) },
            ]}
          >
            <Text style={[st.batteryPctText, { color: band() }]}>89%</Text>
            <Ionicons name="battery-full" size={scale(25)} color={band()} />
          </View>
        </LinearGradient>
      </EnterView>

      {/* ============ TODAY'S GOAL â€” ring card ============ */}
      <EnterView delay={180} style={{ marginTop: scale(18) }}>
        <Card mode={mode} style={{ borderRadius: scale(18) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: scale(14) }}>
            {/* progress ring (two-arc trick, no SVG) */}
            <View style={st.ringWrap}>
              <View style={[st.ringBg, { borderColor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(10,42,74,0.1)' }]} />
              <View style={[st.ringArc, { borderColor: accent(), transform: [{ rotate: `${goalPct * 3.6}deg` }] }]} />
              <View style={[st.ringMask, { backgroundColor: mode === 'dark' ? '#0E0E0E' : '#FFFFFF' }]} />
              <Text style={{ position: 'absolute', color: c.text, fontSize: scale(10.5), fontFamily: fonts.extrabold }}>{goalPct}%</Text>
            </View>
            <View style={{ flex: 1, marginLeft: scale(13) }}>
              <Text style={{ color: c.text, fontSize: scale(13.5), fontFamily: fonts.extrabold }}>Today's goal</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: scale(4), marginTop: scale(2) }}>
                <Text style={{ color: c.text, fontSize: scale(15), fontFamily: fonts.extrabold }}>4.82</Text>
                <Text style={{ color: mode === 'dark' ? 'rgba(255,255,255,0.5)' : 'rgba(10,42,74,0.5)', fontSize: scale(9.5), fontFamily: fonts.semibold }}>
                  of 7.8 kWh · on pace
                </Text>
              </View>
              <View style={[st.goalTrack, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(10,42,74,0.08)' }]}>
                <View style={[st.goalFill, { width: `${goalPct}%`, backgroundColor: accent() }]} />
              </View>
            </View>
            <Pressable onPress={() => router.push('/pages/reports')} hitSlop={6}>
              <Text style={{ color: accent(), fontSize: scale(10), fontFamily: fonts.bold }}>Details</Text>
            </Pressable>
          </View>
        </Card>
      </EnterView>

      {/* ============ MY ZONES â€” glass list with filter ============ */}
      <EnterView delay={270}>
        <SectionHead title={`MY ZONES · ${zones.length}`} link="Manage all" onLink={() => router.push('/pages/schedule')} mode={mode} />
        <Card mode={mode} style={{ borderRadius: scale(18) }}>
          {zones.length === 0 && (
            <Text style={{ color: mode === 'dark' ? 'rgba(255,255,255,0.4)' : 'rgba(10,42,74,0.4)', fontSize: scale(10), fontFamily: fonts.medium, textAlign: 'center', paddingVertical: scale(16) }}>
              No zones yet
            </Text>
          )}
          {zones.map((z, i) => (
            <View key={z.id}>
              {i > 0 && (
                <View style={{ height: 1, backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(10,42,74,0.07)', marginLeft: scale(56) }} />
              )}
              <AnimatedPressable
                onPress={() => setZones((zs) => zs.map((x) => (x.id === z.id ? { ...x, on: !x.on } : x)))}
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
              </AnimatedPressable>
            </View>
          ))}
        </Card>
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
                    <AnimatedPressable
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
                    </AnimatedPressable>
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
  energyCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: scale(28),
    padding: scale(18),
    paddingBottom: scale(14),
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
  batteryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    borderRadius: scale(20),
    borderWidth: 1,
    borderColor: 'rgba(10,42,74,0.16)',
    paddingHorizontal: scale(14),
    paddingVertical: scale(11),
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
    backgroundColor: NAVY,
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
    marginTop: scale(16),
    paddingVertical: scale(12),
  },
  statsRow: {
    flexDirection: 'row',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: scale(3),
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


