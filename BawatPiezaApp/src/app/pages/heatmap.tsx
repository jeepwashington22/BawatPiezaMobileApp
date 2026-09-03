import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { ContentCard } from '../../components/content-card';

const PRUSSIAN = '#0A2A4A';
const MUTED = 'rgba(10, 42, 74, 0.62)';

/* Pressure scale — identical to web heatmap page */
const SCALE: { min: number; color: string; label: string }[] = [
  { min: 0, color: '#0a2a4a', label: 'Idle' },
  { min: 20, color: '#3b5b7a', label: 'Light' },
  { min: 40, color: '#7d9cb8', label: 'Moderate' },
  { min: 60, color: '#f6c445', label: 'High' },
  { min: 80, color: '#d97706', label: 'Critical' },
];

function colorFor(value: number) {
  let stop = SCALE[0];
  for (const s of SCALE) if (value >= s.min) stop = s;
  return stop;
}

const ROWS = 6;
const COLS = 5;

/* Deterministic sample pressure field — same math as web buildGrid() */
function buildGrid(): number[][] {
  const grid: number[][] = [];
  for (let r = 0; r < ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < COLS; c++) {
      const seed = (r * 12.9898 + c * 78.233) % 10;
      const rand = Math.abs(Math.sin(seed)) * 43758.5453;
      const frac = rand - Math.floor(rand);
      const hotspot =
        Math.exp(-((r - (ROWS - 2)) ** 2) / 5 - ((c - (COLS - 1)) ** 2) / 4) * 70 +
        Math.exp(-((r - 1) ** 2) / 4 - ((c - 1) ** 2) / 4) * 45;
      row.push(Math.min(100, Math.max(0, Math.round(frac * 55 + hotspot))));
    }
    grid.push(row);
  }
  return grid;
}

function avgPressure(g: number[][]): number {
  let sum = 0;
  let n = 0;
  for (const row of g) for (const cell of row) { sum += cell; n++; }
  return Math.round(sum / n);
}

export default function HeatmapScreen() {
  const [loading, setLoading] = useState(true);
  const [grid, setGrid] = useState<number[][]>([]);

  useEffect(() => {
    const t = setTimeout(() => {
      setGrid(buildGrid());
      setLoading(false);
    }, 900);
    return () => clearTimeout(t);
  }, []);

  if (loading) {
    return (
      <ScreenShell title="Heatmap" subtitle="Foot-traffic energy density">
        <View style={styles.loaderWrap}>
          <TileLoader label="Loading heatmap data" size="lg" />
        </View>
      </ScreenShell>
    );
  }

  const avg = avgPressure(grid);
  const peak = Math.max(...grid.flat());

  return (
    <ScreenShell title="Heatmap" subtitle="Foot-traffic energy density">
      <ContentCard title={`Avg ${avg} · Peak ${peak}`} eyebrow="Tile Array 6×5">
        {grid.map((row, r) => (
          <View key={r} style={styles.gridRow}>
            {row.map((value, c) => {
              const stop = colorFor(value);
              return (
                <View
                  key={c}
                  style={[styles.cell, { backgroundColor: stop.color, opacity: 0.25 + (value / 100) * 0.75 }]}
                >
                  <Text style={styles.cellText}>{value}</Text>
                </View>
              );
            })}
          </View>
        ))}
      </ContentCard>

      <ContentCard title="Pressure Scale" eyebrow="Legend">
        {SCALE.map((s) => (
          <View key={s.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>{s.label}</Text>
            <Text style={styles.legendRange}>{s.min}–{s.min === 0 ? 19 : s.min + 19}</Text>
          </View>
        ))}
      </ContentCard>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  loaderWrap: { alignItems: 'center', paddingVertical: 48 },
  gridRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  cell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellText: { color: '#FFFFFF', fontSize: 11, fontWeight: '700' },
  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  dot: { width: 14, height: 14, borderRadius: 4, marginRight: 10 },
  legendLabel: { color: PRUSSIAN, fontSize: 13, fontWeight: '700', flex: 1 },
  legendRange: { color: MUTED, fontSize: 12, fontWeight: '600' },
});