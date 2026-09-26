import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient as SvgGradient, Path, Line, Stop, Polygon } from 'react-native-svg';

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
  return <View style={style}>{children}</View>;
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

  const items: { key: ViewMode; label: string; icon: IconName }[] = [
    { key: 'view', label: 'View Only', icon: 'grid-outline' },
    { key: 'diagnostic', label: 'Diagnostic', icon: 'pulse-outline' },
  ];

  return (
    <View
      style={[styles.segWrap, { backgroundColor: mode === 'dark' ? c.surfaceMuted : '#E9EEF5' }]}
    >
      <View style={styles.segRow}>
        {items.map((item) => {
          const active = value === item.key;
          return (
            <Pressable
              key={item.key}
              onPress={() => onChange(item.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={item.label}
              style={[styles.segItem, active && styles.segItemActive]}
            >
              {active && <LinearGradient colors={['#FBA94C', '#F97316']} style={StyleSheet.absoluteFill} />}
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
  const bg = viewMode === 'diagnostic' && flagged ? TILE_ORANGE : 'rgba(23,69,127,0.72)';

  return (
    <Card mode={mode} style={[styles.tileCard, { backgroundColor: bg, borderColor: viewMode === 'diagnostic' && flagged ? '#F97316' : 'rgba(255,255,255,0.16)' }]}>
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

function HeatSurface({ children }: { children: ReactNode }) {
  return (
    <View style={styles.heatSurface}>
      <Svg viewBox="0 0 360 360" width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Defs>
          <SvgGradient id="royalSurface" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#235EA5" />
            <Stop offset="0.52" stopColor="#17457F" />
            <Stop offset="1" stopColor="#0B2E63" />
          </SvgGradient>
        </Defs>
        <Path d="M0 0H360V360H0Z" fill="url(#royalSurface)" />
        <Line x1="-30" y1="120" x2="390" y2="-30" stroke="#F7C948" strokeOpacity="0.22" strokeWidth="2" />
        <Line x1="-30" y1="240" x2="390" y2="90" stroke="#F7C948" strokeOpacity="0.22" strokeWidth="2" />
        <Line x1="-30" y1="360" x2="390" y2="210" stroke="#F7C948" strokeOpacity="0.22" strokeWidth="2" />
        <Line x1="30" y1="390" x2="390" y2="30" stroke="#F7C948" strokeOpacity="0.13" strokeWidth="1" />
        <Line x1="150" y1="390" x2="390" y2="150" stroke="#F7C948" strokeOpacity="0.13" strokeWidth="1" />
        <Path d="M42 100 C42 73 78 69 91 94 C104 69 140 73 140 100 C140 128 91 155 91 155 C91 155 42 128 42 100Z" fill="none" stroke="#F7C948" strokeOpacity="0.30" strokeWidth="2" />
        <Path d="M220 255 C220 228 256 224 269 249 C282 224 318 228 318 255 C318 283 269 310 269 310 C269 310 220 283 220 255Z" fill="none" stroke="#F7C948" strokeOpacity="0.30" strokeWidth="2" />
        <Polygon points="180,20 340,180 180,340 20,180" fill="none" stroke="#FFFFFF" strokeOpacity="0.06" strokeWidth="1" />
      </Svg>
      <View pointerEvents="none" style={styles.heatGlow}>
        <Svg viewBox="0 0 360 360" width="100%" height="100%">
          <Line x1="-30" y1="240" x2="390" y2="90" stroke="#FFE27A" strokeWidth="3" />
          <Line x1="30" y1="390" x2="390" y2="30" stroke="#FFE27A" strokeWidth="2" />
        </Svg>
      </View>
      <View style={styles.heatGridContent}>{children}</View>
    </View>
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
        <HeatSurface>
          <View style={styles.grid}>
            {gridRows.map((row, ri) => (
              <View key={ri} style={styles.gridRow}>
                {row.map((tile) => (
                  <HeatTile key={tile.id} tile={tile} viewMode={viewMode} />
                ))}
              </View>
            ))}
          </View>
        </HeatSurface>
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
  segItemActive: {
    borderRadius: scale(22),
    overflow: 'hidden',
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
  heatSurface: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: scale(360),
    borderRadius: scale(22),
    padding: scale(12),
    backgroundColor: '#17457F',
    borderWidth: 1,
    borderColor: 'rgba(247,201,72,0.34)',
    shadowColor: '#0B2E63',
    shadowOpacity: 0.28,
    shadowRadius: scale(14),
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  heatGlow: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  heatGridContent: {
    position: 'relative',
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
    borderWidth: 1,
    shadowColor: '#F7C948',
    shadowOpacity: 0.12,
    shadowRadius: scale(5),
    shadowOffset: { width: 0, height: 0 },
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