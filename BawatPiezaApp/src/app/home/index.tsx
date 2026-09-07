import { fonts, useTheme, type Mode } from '../../theme';
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
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
import { LoadingScreen } from '../../components/loading-screen';
import { Card, Toggle, SectionHead, AnimatedPressable, LiveDot, scale, GOLD, NAVY } from '../../components/glass-ui';

/* ------------------------------ demo data ------------------------------- */

// Exactly 5 rows x 6 cols = 30 tiles.
const HEAT_ROWS = 5;
const HEAT_COLS = 6;
const heatTiles: number[] = Array.from({ length: HEAT_ROWS * HEAT_COLS }, (_, i) => {
  const wave = Math.sin(i / 2.6) * 0.3 + Math.cos(i / 5) * 0.2;
  return Math.min(1, Math.max(0.06, 0.45 + wave + ((i * 2654435761) % 100) / 500));
});

// Green â†’ yellow glow ramp (reference heatmap look)
const heatColor = (v: number) => {
  const stops = ['#EDF2EC', '#CBE7B4', '#8FCB62', '#4CA83E', '#DCE24B'];
  const idx = Math.min(stops.length - 1, Math.floor(v * stops.length));
  return stops[idx];
};

type ZoneFilter = 'all' | 'on' | 'off';

/* ------------------------------- screen --------------------------------- */

export default function HomeScreen() {
  const { colors: c, mode } = useTheme();
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  const [zones, setZones] = useState([
    { id: '1', name: 'Light #1', source: 'Battery', detail: 'Auto-off in 22m', on: true },
    { id: '2', name: 'Light #2', source: 'Grid', detail: 'Stable Â· 318 W', on: true },
    { id: '3', name: 'Light #3', source: 'Solar', detail: 'Panel charging', on: false },
  ]);
  const [filter, setFilter] = useState<ZoneFilter>('all');
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

  const enter = [0, 1, 2, 3, 4].map((i) => {
    const v = useSharedValue(0);
    useEffect(() => {
      v.value = withDelay(i * 90, withTiming(1, { duration: 460, easing: Easing.out(Easing.cubic) }));
    }, [v, i]);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return useAnimatedStyle(() => ({
      opacity: v.value,
      transform: [{ translateY: (1 - v.value) * scale(16) }],
    }));
  });

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
  const filteredZones = zones.filter((z) => (filter === 'all' ? true : filter === 'on' ? z.on : !z.on));

  return (
    <ScreenShell>
      {/* ============ TOTAL CONSUMPTION â€” big, centered, no gradient card ============ */}
      <Animated.View style={enter[0]}>
        <View style={{ alignItems: 'center', marginTop: scale(6) }}>
          <View style={[st.totalPill, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(10,42,74,0.06)' }]}>
            <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.75)' : 'rgba(10,42,74,0.6)', fontSize: scale(8.5), letterSpacing: 1.6, fontFamily: fonts.bold }}>
              TOTAL CONSUMPTION Â· TODAY
            </Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: scale(4) }}>
            <Text style={{ color: c.text, fontSize: scale(46), fontFamily: fonts.extrabold, letterSpacing: -1.5 }}>4.82</Text>
            <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.55)' : 'rgba(10,42,74,0.5)', fontSize: scale(15), fontFamily: fonts.extrabold, marginBottom: scale(8) }}>kWh</Text>
          </View>
          <View style={st.savedPill}>
            <Ionicons name="arrow-down" size={scale(11)} color="#15803D" />
            <Text style={{ color: '#15803D', fontSize: scale(10), fontFamily: fonts.bold }}>₱86 saved this month</Text>
          </View>

          {/* volts / power / battery â€” dedicated card */}
          <Card mode={mode} style={st.statsCard}>
            <View style={st.statsRow}>
              {stats.map((s, i) => (
                <View key={s.label} style={[st.statCell, i > 0 && { borderLeftWidth: 1, borderLeftColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(10,42,74,0.1)' }]}>
                  <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.45)' : 'rgba(10,42,74,0.45)', fontSize: scale(7.5), letterSpacing: 1, fontFamily: fonts.bold }}>
                    {s.label}
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 2, justifyContent: 'center' }}>
                    <Text style={{ color: c.text, fontSize: scale(14), fontFamily: fonts.extrabold }}>{s.value}</Text>
                    <Text style={{ color: GOLD, fontSize: scale(8.5), fontFamily: fonts.bold }}>{s.unit}</Text>
                  </View>
                </View>
              ))}
            </View>
          </Card>
        </View>
      </Animated.View>

      {/* ============ FILTER CHIPS (All / On / Off) ============ */}
      <Animated.View style={[enter[1], { marginTop: scale(14) }]}>
        <View style={{ flexDirection: 'row', gap: scale(8), justifyContent: 'center' }}>
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'on', label: 'On' },
              { key: 'off', label: 'Off' },
            ] as { key: ZoneFilter; label: string }[]
          ).map((f) => {
            const active = filter === f.key;
            return (
              <AnimatedPressable key={f.key} onPress={() => setFilter(f.key)}>
                <View style={[st.chip, { backgroundColor: active ? NAVY : mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.7)' }]}>
                  <Text style={{ color: active ? '#FFFFFF' : c.textSoft, fontSize: scale(10.5), fontFamily: fonts.bold }}>{f.label}</Text>
                </View>
              </AnimatedPressable>
            );
          })}
        </View>
      </Animated.View>

      {/* ============ QUICK ACTIONS â€” circle buttons (center highlighted) ============ */}
      <Animated.View style={[enter[1], { marginTop: scale(16) }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-around' }}>
          {[
            { icon: 'bulb-outline' as const, label: 'Lights', onPress: () => setZones((zs) => zs.map((x) => ({ ...x, on: true }))) },
            { icon: 'grid' as const, label: 'Heatmap', onPress: () => router.push('/pages/heatmap'), center: true },
            { icon: 'bar-chart' as const, label: 'Reports', onPress: () => router.push('/pages/reports') },
            { icon: 'person' as const, label: 'Profile', onPress: () => router.push('/pages/profile') },
          ].map((a) => (
            <AnimatedPressable key={a.label} onPress={a.onPress}>
              <View style={{ alignItems: 'center', gap: scale(5) }}>
                <View style={[st.actionCircle, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.8)' }, a.center && st.actionCircleCenter]}>
                  <Ionicons name={a.icon} size={scale(18)} color={a.center ? '#FFFFFF' : mode === 'dark' ? 'rgba(237,242,250,0.8)' : NAVY} />
                </View>
                <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.7)' : 'rgba(10,42,74,0.6)', fontSize: scale(9), fontFamily: fonts.semibold }}>{a.label}</Text>
              </View>
            </AnimatedPressable>
          ))}
        </View>
      </Animated.View>

      {/* ============ TODAY'S GOAL â€” ring card ============ */}
      <Animated.View style={[enter[2], { marginTop: scale(18) }]}>
        <Card mode={mode} style={{ borderRadius: scale(18) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: scale(14) }}>
            {/* progress ring (two-arc trick, no SVG) */}
            <View style={st.ringWrap}>
              <View style={[st.ringBg, { borderColor: mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(10,42,74,0.1)' }]} />
              <View style={[st.ringArc, { borderColor: GOLD, transform: [{ rotate: `${goalPct * 3.6}deg` }] }]} />
              <View style={[st.ringMask, { backgroundColor: mode === 'dark' ? '#141E32' : '#FFFFFF' }]} />
              <Text style={{ position: 'absolute', color: c.text, fontSize: scale(10.5), fontFamily: fonts.extrabold }}>{goalPct}%</Text>
            </View>
            <View style={{ flex: 1, marginLeft: scale(13) }}>
              <Text style={{ color: c.text, fontSize: scale(13.5), fontFamily: fonts.extrabold }}>Today's goal</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: scale(4), marginTop: scale(2) }}>
                <Text style={{ color: c.text, fontSize: scale(15), fontFamily: fonts.extrabold }}>4.82</Text>
                <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.5)' : 'rgba(10,42,74,0.5)', fontSize: scale(9.5), fontFamily: fonts.semibold }}>
                  of 7.8 kWh Â· on pace
                </Text>
              </View>
              <View style={[st.goalTrack, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(10,42,74,0.08)' }]}>
                <View style={[st.goalFill, { width: `${goalPct}%` }]} />
              </View>
            </View>
            <Pressable onPress={() => router.push('/pages/reports')} hitSlop={6}>
              <Text style={{ color: GOLD, fontSize: scale(10), fontFamily: fonts.bold }}>Details</Text>
            </Pressable>
          </View>
        </Card>
      </Animated.View>

      {/* ============ MY ZONES â€” glass list with filter ============ */}
      <Animated.View style={enter[3]}>
        <SectionHead title={`MY ZONES Â· ${filteredZones.length} of ${zones.length}`} link="Manage all" onLink={() => router.push('/pages/schedule')} mode={mode} />
        <Card mode={mode} style={{ borderRadius: scale(18) }}>
          {filteredZones.length === 0 && (
            <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.4)' : 'rgba(10,42,74,0.4)', fontSize: scale(10), fontFamily: fonts.medium, textAlign: 'center', paddingVertical: scale(16) }}>
              No zones in this filter
            </Text>
          )}
          {filteredZones.map((z, i) => (
            <View key={z.id}>
              {i > 0 && (
                <View style={{ height: 1, backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(10,42,74,0.07)', marginLeft: scale(56) }} />
              )}
              <AnimatedPressable
                onPress={() => setZones((zs) => zs.map((x) => (x.id === z.id ? { ...x, on: !x.on } : x)))}
                style={{ paddingVertical: scale(12), paddingHorizontal: scale(14) }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch' }}>
                  <View style={[st.zoneIcon, z.on && { backgroundColor: 'rgba(246,196,69,0.16)', borderColor: 'rgba(246,196,69,0.45)' }]}>
                    <Ionicons name="bulb" size={scale(15)} color={z.on ? GOLD : mode === 'dark' ? 'rgba(237,242,250,0.35)' : 'rgba(10,42,74,0.3)'} />
                  </View>
                  <View style={{ flex: 1, marginLeft: scale(11) }}>
                    <Text style={{ color: c.text, fontSize: scale(12.5), fontFamily: fonts.bold }}>{z.name}</Text>
                    <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.55)' : 'rgba(10,42,74,0.5)', fontSize: scale(9.5), fontFamily: fonts.medium, marginTop: 1 }}>
                      {z.source} Â· {z.detail}
                    </Text>
                  </View>
                  <Toggle on={z.on} onToggle={() => setZones((zs) => zs.map((x) => (x.id === z.id ? { ...x, on: !x.on } : x)))} />
                </View>
              </AnimatedPressable>
            </View>
          ))}
        </Card>
      </Animated.View>

      {/* ============ MOST WALKED-ON TILES ============ */}
      <Animated.View style={enter[4]}>
        <SectionHead title="MOST WALKED-ON TILES" link="Full heatmap" onLink={() => router.push('/pages/heatmap')} mode={mode} />
        <Card mode={mode} style={{ borderRadius: scale(18), padding: scale(14) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: scale(12.5), fontFamily: fonts.extrabold }}>Gate Pathway Â· Live Tile Heat</Text>
              <Text style={{ color: mode === 'dark' ? 'rgba(237,242,250,0.55)' : 'rgba(10,42,74,0.5)', fontSize: scale(9.5), fontFamily: fonts.medium, marginTop: 1 }}>
                Brighter green = more foot traffic
              </Text>
            </View>
            <View style={st.stepsPill}>
              <Ionicons name="footsteps" size={scale(13)} color="#F36F21" />
              <Text style={[st.stepsPillText, { color: c.text }]}>1,248</Text>
            </View>
          </View>

          <View style={st.kineticRow}>
            <Ionicons name="footsteps" size={scale(14)} color="#F36F21" />
            <Text style={[st.kineticText, { color: mode === 'dark' ? 'rgba(237,242,250,0.75)' : 'rgba(10,42,74,0.7)' }]}>
              Footsteps converted today
            </Text>
            <Text style={{ color: '#4CA83E', fontSize: scale(11), fontFamily: fonts.extrabold }}>+0.34 kWh</Text>
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
                        { backgroundColor: heatColor(v), shadowColor: '#4CA83E', shadowOpacity: v * 0.9, shadowRadius: scale(9) },
                        active && st.heatTileActive,
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
            <Text style={[st.legendText, { color: mode === 'dark' ? 'rgba(237,242,250,0.5)' : 'rgba(10,42,74,0.5)' }]}>Less</Text>
            <View style={{ flexDirection: 'row', gap: scale(3) }}>
              {[0.1, 0.35, 0.6, 0.82, 0.98].map((v, i) => (
                <View key={i} style={[st.legendSwatch, { backgroundColor: heatColor(v) }]} />
              ))}
            </View>
            <Text style={[st.legendText, { color: mode === 'dark' ? 'rgba(237,242,250,0.5)' : 'rgba(10,42,74,0.5)' }]}>More</Text>
          </View>

          {activeTile !== null && (
            <Text style={[st.tileInfo, { color: mode === 'dark' ? 'rgba(237,242,250,0.7)' : 'rgba(10,42,74,0.65)' }]}>
              Tile #{activeTile + 1} â€” {Math.round(heatTiles[activeTile] * 480)} crossings today
            </Text>
          )}
        </Card>
      </Animated.View>

      {/* ============ STATUS â€” glass strip ============ */}
      <Animated.View style={[enter[4], { marginTop: scale(18) }]}>
        <Card mode={mode} style={{ borderRadius: scale(16) }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: scale(14) }}>
            <View>
              <Text style={st.microLabel}>SYSTEM STATUS</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6), marginTop: scale(3) }}>
                <LiveDot color="#4CA83E" />
                <Text style={{ color: c.text, fontSize: scale(13), fontFamily: fonts.extrabold }}>{accountStatus.status}</Text>
              </View>
            </View>
            <View style={st.uptimePill}>
              <Ionicons name="time-outline" size={scale(11)} color={GOLD} />
              <Text style={{ color: GOLD, fontSize: scale(9.5), fontFamily: fonts.bold }}>{accountStatus.uptime} uptime</Text>
            </View>
          </View>
        </Card>
      </Animated.View>

      <View style={{ height: scale(28) }} />
    </ScreenShell>
  );
}

/* ------------------------------- styles ---------------------------------- */

const st = StyleSheet.create({
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
  chip: {
    borderRadius: 999,
    paddingHorizontal: scale(16),
    paddingVertical: scale(8),
  },
  actionCircle: {
    width: scale(48),
    height: scale(48),
    borderRadius: scale(24),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(10,42,74,0.08)',
  },
  actionCircleCenter: {
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 0.45,
    shadowRadius: scale(10),
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
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
    backgroundColor: 'rgba(243,111,33,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(243,111,33,0.35)',
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
    borderColor: 'rgba(243,111,33,0.3)',
    backgroundColor: 'rgba(243,111,33,0.08)',
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


