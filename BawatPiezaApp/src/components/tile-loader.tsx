import { useTheme } from '../theme';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

/**
 * TileLoader â€” a custom loading indicator styled as a grid of piezoelectric
 * tiles that "harvest" energy in sequence (butter-yellow glow pulse). This is
 * the React Native port of the web dashboard's TileLoader component.
 *
 * Use it for route transitions or inline data fetching:
 *   <TileLoader label="Loading sensor data..." size="md" />
 */

const PRUSSIAN = '#0A2A4A';
const BUTTER = '#F6C445';
const LINE = 'rgba(10, 42, 74, 0.12)';
const MUTED = 'rgba(10, 42, 74, 0.62)';

const TILE_COUNT = 8; // 4 x 2 grid
const COLUMNS = 4;
const STAGGER_MS = 180;
const PULSE_MS = 500;

const SIZES = {
  sm: { tile: 10, gap: 6, text: 12, bolt: 18, box: 30 },
  md: { tile: 14, gap: 8, text: 14, bolt: 22, box: 36 },
  lg: { tile: 16, gap: 10, text: 16, bolt: 26, box: 42 },
} as const;

export type TileLoaderProps = {
  label?: string;
  size?: 'sm' | 'md' | 'lg';
};

export function TileLoader({ label = 'Harvesting energy...', size = 'md' }: TileLoaderProps) {
  const dims = SIZES[size];
  const tileAnims = useRef(
    Array.from({ length: TILE_COUNT }, () => new Animated.Value(0)),
  ).current;
  const boltAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loopTile = (val: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: PULSE_MS,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: PULSE_MS,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      );

    const tileLoops = tileAnims.map((val, i) => loopTile(val, i * STAGGER_MS));
    const boltLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(boltAnim, {
          toValue: 1,
          duration: PULSE_MS + 150,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(boltAnim, {
          toValue: 0,
          duration: PULSE_MS + 150,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    tileLoops.forEach((loop) => loop.start());
    boltLoop.start();

    return () => {
      tileLoops.forEach((loop) => loop.stop());
      boltLoop.stop();
    };
  }, [tileAnims, boltAnim]);

  const tileStyle = (val: Animated.Value) => ({
    opacity: val.interpolate({ inputRange: [0, 1], outputRange: [0.15, 1] }),
    transform: [
      { scale: val.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.08] }) },
    ],
  });

  const gridWidth = COLUMNS * dims.tile + (COLUMNS - 1) * dims.gap;

  return (
    <View style={styles.container}>
      <View style={[styles.grid, { width: gridWidth, gap: dims.gap }]}>
        {tileAnims.map((val, i) => (
          <Animated.View
            key={i}
            style={[
              styles.tile,
              { width: dims.tile, height: dims.tile },
              tileStyle(val),
            ]}
          />
        ))}
      </View>

      <Animated.View
        style={[
          styles.boltBox,
          { width: dims.box, height: dims.box, opacity: boltAnim },
        ]}
      >
        <Ionicons name="flash" size={dims.bolt} color={BUTTER} />
      </Animated.View>

      {label ? (
        <Text style={[styles.label, { fontSize: dims.text }]}>{label}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tile: {
    borderRadius: 4,
    borderWidth: 1,
    borderColor: LINE,
    backgroundColor: BUTTER,
  },
  boltBox: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: PRUSSIAN,
    shadowColor: PRUSSIAN,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  label: {
    color: MUTED,
    fontWeight: '600',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
});
