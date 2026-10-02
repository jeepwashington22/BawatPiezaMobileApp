import { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, {
  Defs,
  G,
  Line,
  LinearGradient,
  Mask,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';

import type { Mode } from '../theme';
import { scale } from './glass-ui';

type HeroGlowProps = {
  mode: Mode;
  /** 0–1 multiplier for glow strength (use ~0.4 for an offline / idle state). */
  intensity?: number;
  /** How far the glow extends past the bottom of its parent so it fades out softly. */
  bleedBottom?: number;
  /** Extra height above the parent (e.g. to sit under the status bar). */
  bleedTop?: number;
  /** Distance between grid lines. */
  gridSize?: number;
};

/**
 * Premium "light from above" backdrop:
 *  1. warm orange radial glow anchored to the top centre
 *  2. brighter core to give the glow depth
 *  3. faint blueprint grid that only shows near the light source
 *  4. everything fades to fully transparent toward the bottom, so it melts into
 *     whatever screen background sits underneath (dark or light).
 */
export function HeroGlow({
  mode,
  intensity = 1,
  bleedBottom = scale(36),
  bleedTop = 0,
  gridSize = scale(26),
}: HeroGlowProps) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const dark = mode === 'dark';

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }));
  };

  // Palette per theme — same orange hue family, tuned for contrast on each background.
  const glow = dark
    ? [
        { o: 0, c: '#FF9638', a: 0.86 },
        { o: 0.35, c: '#F98224', a: 0.56 },
        { o: 0.7, c: '#A44818', a: 0.23 },
        { o: 1, c: '#431407', a: 0 },
      ]
    : [
        { o: 0, c: '#FF9638', a: 0.88 },
        { o: 0.35, c: '#FB9848', a: 0.68 },
        { o: 0.7, c: '#FBC99D', a: 0.31 },
        { o: 1, c: '#FFE8D6', a: 0 },
      ];
  const core = dark ? '#FFD2A8' : '#FFFFFF';
  const coreAlpha = dark ? 0.26 : 0.44;
  const gridColor = dark ? '#FFFFFF' : '#C2410C';
  const gridAlpha = dark ? 0.07 : 0.12;

  const { w, h } = size;
  const cols = w > 0 ? Math.ceil(w / gridSize) : 0;
  const rows = h > 0 ? Math.ceil(h / gridSize) : 0;

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={[styles.fill, { top: -bleedTop, bottom: -bleedBottom }]}
    >
      {w > 0 && h > 0 && (
        <Svg width={w} height={h}>
          <Defs>
            {/* Vertical fade-out — this is the "transition to opacity" */}
            <LinearGradient id="fadeV" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor="#fff" stopOpacity="1" />
              <Stop offset="0.55" stopColor="#fff" stopOpacity="0.7" />
              <Stop offset="1" stopColor="#fff" stopOpacity="0" />
            </LinearGradient>
            <Mask id="fadeMask" x="0" y="0" width={w} height={h} maskUnits="userSpaceOnUse">
              <Rect x="0" y="0" width={w} height={h} fill="url(#fadeV)" />
            </Mask>

            {/* Grid only visible around the light source */}
            <RadialGradient id="gridFade" cx="50%" cy="0%" rx="75%" ry="85%">
              <Stop offset="0" stopColor="#fff" stopOpacity="1" />
              <Stop offset="1" stopColor="#fff" stopOpacity="0" />
            </RadialGradient>
            <Mask id="gridMask" x="0" y="0" width={w} height={h} maskUnits="userSpaceOnUse">
              <Rect x="0" y="0" width={w} height={h} fill="url(#gridFade)" />
            </Mask>

            <RadialGradient id="glow" cx="50%" cy="0%" rx="95%" ry="100%">
              {glow.map((s) => (
                <Stop
                  key={s.o}
                  offset={s.o}
                  stopColor={s.c}
                  stopOpacity={s.a * intensity}
                />
              ))}
            </RadialGradient>
            <RadialGradient id="core" cx="50%" cy="14%" rx="48%" ry="42%">
              <Stop offset="0" stopColor={core} stopOpacity={coreAlpha * intensity} />
              <Stop offset="1" stopColor={core} stopOpacity="0" />
            </RadialGradient>
          </Defs>

          <G mask="url(#fadeMask)">
            <Rect x="0" y="0" width={w} height={h} fill="url(#glow)" />
            <Rect x="0" y="0" width={w} height={h} fill="url(#core)" />
            <G mask="url(#gridMask)" opacity={intensity}>
              {Array.from({ length: cols + 1 }, (_, i) => (
                <Line
                  key={`v${i}`}
                  x1={i * gridSize}
                  y1={0}
                  x2={i * gridSize}
                  y2={h}
                  stroke={gridColor}
                  strokeOpacity={gridAlpha}
                  strokeWidth={1}
                />
              ))}
              {Array.from({ length: rows + 1 }, (_, i) => (
                <Line
                  key={`h${i}`}
                  x1={0}
                  y1={i * gridSize}
                  x2={w}
                  y2={i * gridSize}
                  stroke={gridColor}
                  strokeOpacity={gridAlpha}
                  strokeWidth={1}
                />
              ))}
            </G>
          </G>
        </Svg>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    position: 'absolute',
    left: 0,
    right: 0,
  },
});