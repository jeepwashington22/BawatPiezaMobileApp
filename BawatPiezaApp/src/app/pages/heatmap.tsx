import { fonts, useTheme, type ThemeColors } from '../../theme';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { ScreenShell } from '../../components/screen-shell';
import { TileLoader } from '../../components/tile-loader';
import { ContentCard } from '../../components/content-card';

/* 5x5 pressure field: outer ring low, mid ring moderate, bottom-right center peak */
const GRID: number[][] = [
  [ 2,  5,  8,  6,  3],
  [ 7, 22, 34, 28,  9],
  [12, 41, 58, 47, 15],
  [ 9, 36, 52, 78, 24],
  [ 4, 14, 26, 62, 96],
];

/* Neon dashboard palette — dark, high-tech, electrical */
const NEON = {
  bg: '#0B0F19',
  panel: 'rgba(255,255,255,0.035)',
  panelBorder: 'rgba(255,255,255,0.08)',
  idle: 'rgba(255,255,255,0.05)',
  idleBorder: 'rgba(255,255,255,0.05)',
  cyan: '#00E5FF',
  teal: '#3DD9A0',
  lime: '#A3E635',
  yellow: '#FACC15',
  textPrimary: '#E7ECF5',
  textMuted: '#8B93A7',
};

/* Color + label stops used by both the tile interpolation and the legend */
const SCALE: { min: number; color: string; label: string }[] = [
  { min: 0,  color: NEON.idle,  label: 'Idle' },
  { min: 15, color: NEON.cyan,  label: 'Low' },
  { min: 35, color: NEON.teal,  label: 'Moderate' },
  { min: 60, color: NEON.lime,  label: 'High' },
  { min: 80, color: NEON.yellow, label: 'Peak' },
];

const HEAT_INPUT_RANGE = SCALE.map((s) => s.min).concat(100);
const HEAT_OUTPUT_COLORS = [
  NEON.idle,
  NEON.cyan,
  NEON.teal,
  NEON.lime,
  NEON.yellow,
  NEON.yellow,
];

export default function HeatmapScreen() {
  const { colors: c } = useTheme();
  const styles = makeStyles(c);
  const [loading, setLoading] = useState(true);
  const [grid] = useState<number[][]>(GRID);

  // Session-level stats, gamifying the harvest
  const [steps, setSteps] = useState(0);
  const [energyMj, setEnergyMj] = useState(0);
  const [peakVoltage, setPeakVoltage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 900);
    return () => clearTimeout(t);
  }, []);

  const registerImpact = (heatAtTap: number) => {
    const voltage = +(heatAtTap / 100 * 4.2).toFixed(1);
    const mj = +(heatAtTap / 100 * 18).toFixed(1);
    setSteps((s) => s + 1);
    setEnergyMj((e) => +(e + mj).toFixed(1));
    setPeakVoltage((p) => Math.max(p, voltage));
  };


  const flat = grid.flat();
  const avg = Math.round(flat.reduce((a, b) => a + b, 0) / flat.length);
  const peak = Math.max(...flat);

  return (
    <ScreenShell>
      <View style={styles.statsRow}>
        <StatPill label="Steps" value={String(steps)} />
        <StatPill label="Energy" value={`${energyMj} mJ`} />
        <StatPill label="Peak V" value={`${peakVoltage.toFixed(1)}V`} />
        <StatPill label="Avg / Peak" value={`${avg} / ${peak}`} />
      </View>

      <ContentCard title="Piezoelectric Sensor Grid" eyebrow="Tile Array 5×5 · tap a tile">
        <View style={styles.matrix}>
          {grid.map((row, r) => (
            <View key={r} style={styles.gridRow}>
              {row.map((value, col) => (
                <Tile
                  key={col}
                  baseValue={value}
                  onImpact={registerImpact}
                />
              ))}
            </View>
          ))}
        </View>
      </ContentCard>

      <ContentCard title="Pressure Scale" eyebrow="Legend">
        {SCALE.map((s) => (
          <View key={s.label} style={styles.legendRow}>
            <View style={[styles.dot, { backgroundColor: s.color }]} />
            <Text style={styles.legendLabel}>{s.label}</Text>
            <Text style={styles.legendRange}>{s.min}+</Text>
          </View>
        ))}
      </ContentCard>
    </ScreenShell>
  );
}

/* ---------------------------------------------------------------------- */
/* Tile — a single piezoelectric sensor: glass tile + footprint overlay + */
/* pulse ring + decaying thermal trail, all driven off one Animated value */
/* ---------------------------------------------------------------------- */

function Tile({
  baseValue,
  onImpact,
}: {
  baseValue: number;
  onImpact: (heatAtTap: number) => void;
}) {
  // 0 -> 1, spikes on tap then decays back to 0 ("excess" energy above baseline)
  const energyAnim = useRef(new Animated.Value(0)).current;
  // Quick outward ripple, replays on every tap
  const pulseAnim = useRef(new Animated.Value(0)).current;
  // Tactile press-down dip
  const pressAnim = useRef(new Animated.Value(0)).current;

  const [voltageLabel, setVoltageLabel] = useState('+0.0V');
  const [energyLabel, setEnergyLabel] = useState('0.0 mJ');

  const isBasePeak = baseValue >= 80;

  const handlePress = () => {
    const heatAtTap = Math.min(100, baseValue + 35); // impact adds on top of baseline
    setVoltageLabel(`+${(heatAtTap / 100 * 4.2).toFixed(1)}V`);
    setEnergyLabel(`${(heatAtTap / 100 * 18).toFixed(1)} mJ`);
    onImpact(heatAtTap);

    pulseAnim.setValue(0);
    Animated.timing(pulseAnim, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    Animated.sequence([
      Animated.timing(pressAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.spring(pressAnim, { toValue: 0, friction: 4, useNativeDriver: true }),
    ]).start();

    Animated.sequence([
      Animated.timing(energyAnim, {
        toValue: 1,
        duration: 120,
        useNativeDriver: false,
      }),
      Animated.timing(energyAnim, {
        toValue: 0,
        duration: 2200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start();
  };

  // heat = baseline + excess energy scaled into the remaining headroom to 100
  const heat = Animated.add(
    baseValue,
    Animated.multiply(energyAnim, 100 - baseValue)
  );

  const backgroundColor = heat.interpolate({
    inputRange: HEAT_INPUT_RANGE,
    outputRange: HEAT_OUTPUT_COLORS,
  });

  const glowOpacity = energyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isBasePeak ? 0.35 : 0.08, 0.9],
  });

  const glowRadius = energyAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [isBasePeak ? 6 : 2, 16],
  });

  const translateY = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 3],
  });

  const ringScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 2.3],
  });

  const ringOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.7, 0],
  });

  return (
    <Pressable style={styles.cellPressable} onPress={handlePress}>
      <Animated.View
        style={[
          styles.cell,
          {
            backgroundColor,
            shadowOpacity: glowOpacity,
            shadowRadius: glowRadius,
            transform: [{ translateY }],
          },
          isBasePeak && styles.cellPeakBorder,
        ]}
      >
        {/* Glass highlight strip */}
        <View style={styles.glassHighlight} />

        {/* Outward ripple on impact */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />

        {/* Footprint trail — fades as the tile cools */}
        <Animated.Text
          pointerEvents="none"
          style={[styles.footprint, { opacity: energyAnim }]}
        >
          👣
        </Animated.Text>

        {/* Live voltage / energy tooltip */}
        <Animated.View
          pointerEvents="none"
          style={[styles.tooltip, { opacity: energyAnim }]}
        >
          <Text style={styles.tooltipVoltage}>{voltageLabel}</Text>
          <Text style={styles.tooltipEnergy}>{energyLabel}</Text>
        </Animated.View>

        <Text style={styles.cellValue}>{baseValue}</Text>
      </Animated.View>
    </Pressable>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statPill}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/* ---------------------------------------------------------------------- */

const styles = StyleSheet.create({
  loaderWrap: { alignItems: 'center', paddingVertical: 48 },

  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statPill: {
    flex: 1,
    backgroundColor: NEON.panel,
    borderWidth: 1,
    borderColor: NEON.panelBorder,
    borderRadius: 14,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statValue: {
    color: NEON.textPrimary,
    fontSize: 15,
    fontWeight: '800',
    fontFamily: fonts.bold,
  },
  statLabel: {
    color: NEON.textMuted,
    fontSize: 10,
    fontWeight: '600',
    fontFamily: fonts.semibold,
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  matrix: { gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8 },

  cellPressable: { flex: 1, aspectRatio: 1 },
  cell: {
    flex: 1,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: NEON.idleBorder,
    overflow: 'hidden',
    shadowColor: NEON.lime,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  cellPeakBorder: {
    borderColor: 'rgba(250, 204, 21, 0.5)',
  },
  glassHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  ring: {
    position: 'absolute',
    width: '70%',
    height: '70%',
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  footprint: {
    position: 'absolute',
    top: 4,
    fontSize: 12,
  },
  tooltip: {
    position: 'absolute',
    bottom: 4,
    alignItems: 'center',
  },
  tooltipVoltage: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    fontFamily: fonts.bold,
  },
  tooltipEnergy: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 8,
    fontWeight: '600',
    fontFamily: fonts.semibold,
  },
  cellValue: {
    color: 'rgba(9,13,22,0.55)',
    fontSize: 11,
    fontWeight: '700',
    fontFamily: fonts.bold,
  },

  legendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  dot: { width: 14, height: 14, borderRadius: 4, marginRight: 10 },
  legendLabel: {
    color: NEON.textPrimary,
    fontSize: 13,
    fontWeight: '700',
    fontFamily: fonts.bold,
    flex: 1,
  },
  legendRange: {
    color: NEON.textMuted,
    fontSize: 12,
    fontWeight: '600',
    fontFamily: fonts.semibold,
  },
});

// Kept for API parity if other screens import ThemeColors-driven styles from here
const makeStyles = (_c: ThemeColors) => styles;