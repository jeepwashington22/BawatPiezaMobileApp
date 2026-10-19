import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '../../components/app-text';
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

/** 3 x 2 walk-traffic field. 0 = quiet, 1 = saturated. */
const TILES: TileDatum[] = [
  { id: 1, label: 'Tile 1', traffic: 0.92 },
  { id: 2, label: 'Tile 2', traffic: 0.24 },
  { id: 3, label: 'Tile 3', traffic: 0.86 },
  { id: 4, label: 'Tile 4', traffic: 0.31 },
  { id: 5, label: 'Tile 5', traffic: 0.47 },
  { id: 6, label: 'Tile 6', traffic: 0.19 },
];

/** Walk-traffic ratio at or above which a tile is flagged in Diagnostic mode. */
const FLAG_THRESHOLD = 0.75;

const TILE_ORANGE_RAMP = ['#7C2D12', '#9A3412', '#C2410C', '#EA580C', '#F97316'];
const TILE_ORANGE = '#F97316';

const PREDICTIVE = [
  { tile: 'Tile 1', note: 'Flagged for inspection now', metric: '1.8 J/step' },
  { tile: 'Tile 3', note: 'Flagged for inspection now', metric: '2.1 J/step' },
];
const WATCHLIST = [
  { tile: 'Tile 5', note: 'Projected below threshold in ~12 days', metric: '2.3 J/step now' },
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
                size={scale(12)}
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

/** Maps a 0–1 traffic ratio onto the orange color ramp. */
function getTileColor(traffic: number): string {
  const t = Math.min(1, Math.max(0, traffic));
  const idx = Math.floor(t * (TILE_ORANGE_RAMP.length - 1));
  return TILE_ORANGE_RAMP[idx];
}

function HeatTile({ tile, viewMode }: { tile: TileDatum; viewMode: ViewMode }) {
  const { mode } = useTheme();
  const flagged = tile.traffic >= FLAG_THRESHOLD;
  const bg = viewMode === 'diagnostic' && flagged ? TILE_ORANGE : getTileColor(tile.traffic);

  return (
    <Card mode={mode} style={[styles.tileCard, { backgroundColor: bg, borderColor: viewMode === 'diagnostic' && flagged ? '#FDBA74' : 'rgba(255,255,255,0.22)' }]}>
      <View pointerEvents="none" style={[styles.tileDepth, { backgroundColor: flagged ? '#9A3412' : '#431407' }]} />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.04)', 'rgba(0,0,0,0.28)']}
        locations={[0, 0.34, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View pointerEvents="none" style={styles.tileSheen} />
      <View pointerEvents="none" style={styles.tileDiagonal} />
      <View pointerEvents="none" style={styles.tileBevelTop} />
      <View pointerEvents="none" style={styles.tileBevelBottom} />
      <View style={styles.tileInner}>
        <Text style={[styles.tileLabel, { color: '#FFFFFF' }]}>{tile.label.toUpperCase()}</Text>
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
          <SvgGradient id="displaySurface" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#35213F" />
            <Stop offset="0.5" stopColor="#1D1A2A" />
            <Stop offset="1" stopColor="#0B101A" />
          </SvgGradient>
        </Defs>
        <Path d="M0 0H360V360H0Z" fill="url(#displaySurface)" />
        <Line x1="-30" y1="120" x2="390" y2="-30" stroke="#FFB347" strokeOpacity="0.24" strokeWidth="2" />
        <Line x1="-30" y1="240" x2="390" y2="90" stroke="#FFB347" strokeOpacity="0.24" strokeWidth="2" />
        <Line x1="-30" y1="360" x2="390" y2="210" stroke="#FFB347" strokeOpacity="0.24" strokeWidth="2" />
        <Line x1="30" y1="390" x2="390" y2="30" stroke="#FFB347" strokeOpacity="0.14" strokeWidth="1" />
        <Line x1="150" y1="390" x2="390" y2="150" stroke="#FFB347" strokeOpacity="0.14" strokeWidth="1" />
        <Path d="M42 100 C42 73 78 69 91 94 C104 69 140 73 140 100 C140 128 91 155 91 155 C91 155 42 128 42 100Z" fill="none" stroke="#FFB347" strokeOpacity="0.32" strokeWidth="2" />
        <Path d="M220 255 C220 228 256 224 269 249 C282 224 318 228 318 255 C318 283 269 310 269 310 C269 310 220 283 220 255Z" fill="none" stroke="#FFB347" strokeOpacity="0.32" strokeWidth="2" />
        <Polygon points="180,20 340,180 180,340 20,180" fill="none" stroke="#FFFFFF" strokeOpacity="0.06" strokeWidth="1" />
      </Svg>
      <View pointerEvents="none" style={styles.heatGlow}>
        <Svg viewBox="0 0 360 360" width="100%" height="100%">
          <Line x1="-30" y1="240" x2="390" y2="90" stroke="#FFD166" strokeWidth="3" />
          <Line x1="30" y1="390" x2="390" y2="30" stroke="#FFD166" strokeWidth="2" />
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
    <ScreenShell scroll title="Heatmap" showBack>
      {/* ===== page header ===== */}
      <FadeIn delay={0}>
        <View style={[styles.header, { backgroundColor: mode === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.72)', borderColor: c.line }]}>
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
            fontSize: scale(20),
              fontFamily: fonts.extrabold,
              letterSpacing: -0.3,
            }}
          >
            Gate Pathway · Live Tile Heat
          </Text>
          <Text
            style={{
              color: mode === 'dark' ? 'rgba(237,242,250,0.5)' : 'rgba(10,42,74,0.5)',
              fontSize: scale(10.5),
              fontFamily: fonts.medium,
              marginTop: scale(3),
            }}
          >
            Warmer tiles = more foot traffic right now
          </Text>
        </View>
      </FadeIn>

      {/* ===== view / diagnostic toggle ===== */}
      <FadeIn delay={80}>
        <View style={{ marginTop: scale(10), marginBottom: scale(8) }}>
          <Segmented value={viewMode} onChange={setViewMode} />
        </View>
      </FadeIn>

      {/* ===== 3 x 2 tile grid ===== */}
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
    borderRadius: scale(14),
    padding: scale(2),
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
    gap: scale(2),
  },
  segItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(4),
    paddingVertical: scale(6),
  },
  segItemActive: {
    borderRadius: scale(11),
    overflow: 'hidden',
  },
  segText: {
    fontSize: scale(9),
    fontFamily: fonts.extrabold,
    letterSpacing: 0.6,
  },

  /* page header */
  header: {
    marginTop: scale(4),
    marginBottom: scale(4),
    padding: scale(12),
    borderRadius: scale(18),
    borderWidth: 1,
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
  grid: { marginTop: scale(2) },
  heatSurface: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: scale(222),
    borderRadius: scale(20),
    paddingHorizontal: scale(12),
    paddingVertical: scale(12),
    backgroundColor: '#1D1A2A',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    shadowColor: '#0B101A',
    shadowOpacity: 0.42,
    shadowRadius: scale(16),
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
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
  gridRow: { flexDirection: 'row', gap: scale(6), marginBottom: scale(6) },
  tileCard: {
    flex: 1,
    height: scale(91),
    borderRadius: scale(13),
    padding: scale(8),
    overflow: 'hidden',
    borderWidth: 1.5,
    shadowColor: '#090B12',
    shadowOpacity: 0.48,
    shadowRadius: scale(9),
    shadowOffset: { width: 0, height: 6 },
    elevation: 7,
  },
  tileDepth: {
    position: 'absolute',
    left: scale(4),
    right: scale(4),
    bottom: 0,
    height: scale(8),
    opacity: 0.9,
  },
  tileSheen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '42%',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  tileDiagonal: {
    position: 'absolute',
    width: '145%',
    height: 1,
    top: '50%',
    left: '-22%',
    backgroundColor: 'rgba(52,12,6,0.64)',
    transform: [{ rotate: '45deg' }],
  },
  tileBevelTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.42)',
  },
  tileBevelBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: 'rgba(57,12,5,0.72)',
  },
  tileInner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: {
    fontSize: scale(7),
    letterSpacing: 1,
    fontFamily: fonts.bold,
  },
  tileTraffic: {
    fontSize: scale(17),
    fontFamily: fonts.extrabold,
    marginTop: scale(3),
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