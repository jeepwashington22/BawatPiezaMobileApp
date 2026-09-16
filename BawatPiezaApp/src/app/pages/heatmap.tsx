import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { ScreenShell } from '../../components/screen-shell';
import { Card, LiveDot, SectionHead, scale } from '../../components/glass-ui';
import { fonts, useTheme } from '../../theme';

/* ------------------------------- reference data --------------------------- */

type ViewMode = 'view' | 'diagnostic';
type IconName = keyof typeof Ionicons.glyphMap;

type TileDatum = { id: number; label: string; traffic: number };

/** 3 x 3 walk-traffic field. 0 = quiet, 1 = saturated. */
const TILES: TileDatum[] = [
  { id: 1, label: 'Tile 1', traffic: 0.92 },
  { id: 2, label: 'Tile 2', traffic: 0.24 },
  { id: 3, label: 'Tile 3', traffic: 0.86 },
  { id: 4, label: 'Tile 4', traffic: 0.31 },
  { id: 5, label: 'Tile 5', traffic: 0.47 },
  { id: 6, label: 'Tile 6', traffic: 0.19 },
  { id: 7, label: 'Tile 7', traffic: 0.78 },
  { id: 8, label: 'Tile 8', traffic: 0.27 },
  { id: 9, label: 'Tile 9', traffic: 0.71 },
];

/** Walk-traffic ratio at or above which a tile is flagged in Diagnostic mode. */
const FLAG_THRESHOLD = 0.75;

const TILE_BLUE_RAMP = ['#17457F', '#1A4E8C', '#1E5A9C', '#2468B0', '#2E7AC7'];
const TILE_ORANGE = '#F97316';
const PANEL_TOP = '#0C2A4C';
const PANEL_BOTTOM = '#06182D';

const PREDICTIVE = [
  { tile: 'Tile 4', note: 'Flagged for inspection now', metric: '1.8 J/step' },
  { tile: 'Tile 9', note: 'Flagged for inspection now', metric: '2.1 J/step' },
];
const WATCHLIST = [
  { tile: 'Tile 7', note: 'Projected below threshold in ~12 days', metric: '2.3 J/step now' },
];
const REMINDERS = [
  {
    title: 'Routine Check-Up',
    note: 'Inspect tiles and add lubricant — recommended every 30 days',
  },
];

/* --------------------------------- entrance ------------------------------- */

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

/* ----------------------------- segmented control -------------------------- */

function Segmented({
  value,
  onChange,
}: {
  value: ViewMode;
  onChange: (v: ViewMode) => void;
}) {
  const { colors: c, mode } = useTheme();
  const [width, setWidth] = useState(0);
  const pos = useSharedValue(value === 'diagnostic' ? 1 : 0);

  useEffect(() => {
    pos.value = withSpring(value === 'diagnostic' ? 1 : 0, { damping: 18, stiffness: 210 });
  }, [value, pos]);

  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  const segment = Math.max(0, (width - scale(8)) / 2);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: pos.value * segment }] }));

  const items: { key: ViewMode; label: string; icon: IconName }[] = [
    { key: 'view', label: 'View Only', icon: 'grid-outline' },
    { key: 'diagnostic', label: 'Diagnostic', icon: 'pulse-outline' },
  ];

  return (
    <View
      onLayout={onLayout}
      style={[styles.segWrap, { backgroundColor: mode === 'dark' ? c.surfaceMuted : '#E9EEF5' }]}
    >
      {width > 0 ? (
        <Animated.View style={[styles.segPill, pill, { width: segment }]}>
          <LinearGradient
            colors={['#FBA94C', '#F97316']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      <View style={styles.segRow}>
        {items.map((item) => {
          const active = value === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onChange(item.key)}
              style={styles.segItem}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
            >
              <Ionicons
                name={item.icon}
                size={scale(14)}
                color={active ? '#FFFFFF' : c.muted}
              />
              <Text style={[styles.segText, { color: active ? '#FFFFFF' : c.textSoft }]}>
                {item.label}
              </Text>
                        </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ------------------------------ tile rendering ------------------------------ */

/** Maps a 0–1 traffic ratio onto the blue color ramp. */
function getTileColor(traffic: number): string {
  const t = Math.min(1, Math.max(0, traffic));
  const idx = Math.floor(t * (TILE_BLUE_RAMP.length - 1));
  return TILE_BLUE_RAMP[idx];
}

function HeatTile({ tile, viewMode }: { tile: TileDatum; viewMode: ViewMode }) {
  const { mode } = useTheme();
  const flagged = tile.traffic >= FLAG_THRESHOLD;
  const bg = viewMode === 'diagnostic' && flagged ? TILE_ORANGE : getTileColor(tile.traffic);

  return (
    <Card mode={mode} style={[styles.tileCard, { backgroundColor: bg }]}>
      <View style={styles.tileInner}>
        <Text style={[styles.tileLabel, { color: '#FFFFFF' }]}>{tile.label}</Text>
        <Text style={[styles.tileTraffic, { color: '#FFFFFF' }]}>
          {`${Math.round(tile.traffic * 100)}%`}
        </Text>
        {viewMode === 'diagnostic' && flagged && (
          <View style={styles.tileFlag}>
            <Ionicons name="warning" size={scale(14)} color="#FFFFFF" />
            <Text style={[styles.tileFlagText, { color: '#FFFFFF' }]}>Flagged</Text>
          </View>
        )}
      </View>
    </Card>
  );
}

/* --------------------------------- screen ---------------------------------- */

export default function HeatmapScreen() {
  const { colors: c, mode } = useTheme();
  const [viewMode, setViewMode] = useState<ViewMode>('view');

  const flaggedCount = TILES.filter((t) => t.traffic >= FLAG_THRESHOLD).length;

  const gridRows = useMemo(() => {
    const rows: TileDatum[][] = [];
    for (let i = 0; i < TILES.length; i += 3) rows.push(TILES.slice(i, i + 3));
    return rows;
  }, []);

  return (
    <ScreenShell scroll>
      {/* ===== page header ===== */}
      <FadeIn delay={0}>
        <View style={styles.header}>
          <View style={styles.headerEyebrowRow}>
            <View
              style={[
                styles.headerTick,
                { backgroundColor: mode === 'dark' ? '#F6C445' : '#0A2A4A' },
              ]}
            />
            <Text
              style={{
                color: mode === 'dark' ? 'rgba(246,196,69,0.85)' : '#B4771B',
                fontSize: scale(8.5),
                letterSpacing: 2.2,
                fontFamily: fonts.extrabold,
              }}
            >
              WALK TRAFFIC
            </Text>
          </View>
          <Text
            style={{
              color: c.text,
              fontSize: scale(24),
              fontFamily: fonts.extrabold,
              letterSpacing: -0.3,
            }}
          >
            Facility Heatmap
          </Text>
          <Text
            style={{
              color: mode === 'dark' ? 'rgba(237,242,250,0.5)' : 'rgba(10,42,74,0.5)',
              fontSize: scale(10.5),
              fontFamily: fonts.medium,
              marginTop: scale(3),
            }}
          >
            Real-time walk-traffic across the facility floor
          </Text>
        </View>
      </FadeIn>

      {/* ===== view / diagnostic toggle ===== */}
      <FadeIn delay={80}>
        <View style={{ marginTop: scale(14) }}>
          <Segmented value={viewMode} onChange={setViewMode} />
        </View>
      </FadeIn>

      {/* ===== 3 x 3 tile grid ===== */}
      <FadeIn delay={160}>
        <View style={styles.grid}>
          {gridRows.map((row, ri) => (
            <View key={ri} style={styles.gridRow}>
              {row.map((tile) => (
                <HeatTile key={tile.id} tile={tile} viewMode={viewMode} />
              ))}
            </View>
          ))}
        </View>
      </FadeIn>

      {/* ===== diagnostic summary ===== */}
      {viewMode === 'diagnostic' && (
        <FadeIn delay={240}>
          <View style={styles.diagSummary}>
            <LiveDot color={TILE_ORANGE} />
            <Text
              style={{
                color: c.textSoft,
                fontSize: scale(10),
                fontFamily: fonts.semibold,
              }}
            >
              {flaggedCount} tile{flaggedCount !== 1 ? 's' : ''} flagged for inspection
            </Text>
          </View>
        </FadeIn>
            )}

      {/* ===== predictive inspections ===== */}
      <FadeIn delay={320}>
        <SectionHead title="PREDICTIVE INSPECTIONS" mode={mode} />
        <Card mode={mode} style={styles.diagPanel}>
          {PREDICTIVE.map((p) => (
            <View key={p.tile} style={styles.diagRow}>
              <View style={styles.diagRowLeft}>
                <Text
                  style={{
                    color: c.text,
                    fontSize: scale(12),
                    fontFamily: fonts.semibold,
                  }}
                >
                  {p.tile}
                </Text>
                <Text
                  style={{
                    color: c.textSoft,
                    fontSize: scale(10),
                    fontFamily: fonts.regular,
                    marginTop: scale(2),
                  }}
                >
                  {p.note}
                </Text>
              </View>
              <Text
                style={{
                  color: mode === 'dark' ? '#F6C445' : '#0A2A4A',
                  fontSize: scale(12),
                  fontFamily: fonts.extrabold,
                }}
              >
                {p.metric}
              </Text>
            </View>
          ))}
        </Card>
      </FadeIn>

      {/* ===== watchlist ===== */}
      <FadeIn delay={400}>
        <SectionHead title="WATCHLIST" mode={mode} />
        <Card mode={mode} style={styles.diagPanel}>
          {WATCHLIST.map((w) => (
            <View key={w.tile} style={styles.diagRow}>
              <View style={styles.diagRowLeft}>
                <Text
                  style={{
                    color: c.text,
                    fontSize: scale(12),
                    fontFamily: fonts.semibold,
                  }}
                >
                  {w.tile}
                </Text>
                <Text
                  style={{
                    color: c.textSoft,
                    fontSize: scale(10),
                    fontFamily: fonts.regular,
                    marginTop: scale(2),
                  }}
                >
                  {w.note}
                </Text>
              </View>
              <Text
                style={{
                  color: c.textSoft,
                  fontSize: scale(11),
                  fontFamily: fonts.semibold,
                }}
              >
                {w.metric}
              </Text>
            </View>
          ))}
        </Card>
      </FadeIn>

      {/* ===== reminders ===== */}
      <FadeIn delay={480}>
        <SectionHead title="REMINDERS" mode={mode} />
        <Card mode={mode} style={styles.diagPanel}>
          {REMINDERS.map((r) => (
            <View key={r.title} style={styles.diagRow}>
              <View style={styles.diagRowLeft}>
                <Text
                  style={{
                    color: c.text,
                    fontSize: scale(12),
                    fontFamily: fonts.semibold,
                  }}
                >
                  {r.title}
                </Text>
                <Text
                  style={{
                    color: c.textSoft,
                    fontSize: scale(10),
                    fontFamily: fonts.regular,
                    marginTop: scale(2),
                  }}
                >
                  {r.note}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={scale(14)} color={c.muted} />
            </View>
          ))}
        </Card>
      </FadeIn>

      <View style={{ height: scale(24) }} />
    </ScreenShell>
  );
}

/* --------------------------------- styles --------------------------------- */

const styles = StyleSheet.create({
  /* segmented control */
  segWrap: {
    borderRadius: scale(26),
    padding: scale(3),
    position: 'relative',
    overflow: 'hidden',
  },
  segPill: {
    position: 'absolute',
    top: scale(3),
    bottom: scale(3),
    borderRadius: scale(22),
    overflow: 'hidden',
  },
  segRow: {
    flexDirection: 'row',
    gap: scale(3),
  },
  segItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(5),
    paddingVertical: scale(9),
  },
  segText: {
    fontSize: scale(12),
    fontFamily: fonts.extrabold,
    letterSpacing: 0.6,
  },

  /* page header */
  header: {
    marginTop: scale(6),
    marginBottom: scale(6),
  },
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

  /* tile grid */
  grid: {
    marginTop: scale(10),
  },
  gridRow: {
    flexDirection: 'row',
    gap: scale(8),
    marginBottom: scale(8),
  },
  tileCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: scale(14),
    padding: scale(10),
    overflow: 'hidden',
  },
  tileInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: scale(11),
    fontFamily: fonts.bold,
  },
  tileTraffic: {
    fontSize: scale(16),
    fontFamily: fonts.extrabold,
    marginTop: scale(2),
  },
  tileFlag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    marginTop: scale(4),
  },
  tileFlagText: {
    fontSize: scale(9),
    fontFamily: fonts.semibold,
  },

  /* diagnostic panels */
  diagPanel: {
    borderRadius: scale(16),
    padding: scale(12),
    marginTop: scale(6),
    gap: scale(10),
  },
  diagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  diagRowLeft: {
    flex: 1,
    marginRight: scale(8),
  },
  diagSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginTop: scale(10),
  },
});