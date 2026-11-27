import React from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
  type LayoutChangeEvent,
} from "react-native";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import type { SkyKind } from "../../lib/weather";

/**
 * Light, see-through weather layer drawn over the whole 3D tile scene.
 *
 * - Everything is small, thin and translucent, so the scene underneath stays
 *   clearly readable. Touches pass straight through (`pointerEvents="none"`).
 * - No background, tint, dimming or flash: the card keeps its own colour no
 *   matter what the weather is. Only the objects themselves (sun, clouds,
 *   rain, wind, leaves) are drawn.
 * - Every animation runs on the native driver, and it is memoised on
 *   primitive props, so telemetry re-renders do not touch it.
 * - Honours the system "reduce motion" setting (draws a still frame).
 */

export type WeatherSkyProps = {
  sky: SkyKind | null;
  dark?: boolean;
  isDay?: boolean;
  /** 0-100 */
  cloudCoverPct?: number;
  windSpeedKmh?: number;
  /** 0-100, scales how heavy the rain looks */
  rainChancePct?: number;
  stormy?: boolean;
};

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

/** Small seeded PRNG so every layout is stable between renders. */
function rng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function useReduceMotion() {
  const [reduce, setReduce] = React.useState(false);
  React.useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (alive) setReduce(value);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** 0 -> 1 linear loop on the native driver. */
function useLoop(durationMs: number, enabled: boolean) {
  const value = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!enabled) {
      value.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(value, {
        toValue: 1,
        duration: durationMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [value, durationMs, enabled]);
  return value;
}

/**
 * Looping travel from `from` to `to` that starts part-way along (`phase`),
 * so several objects sharing one loop value are spread out, not in a line.
 */
function travel(
  v: Animated.Value,
  phase: number,
  from: number,
  to: number,
): Animated.AnimatedInterpolation<number> {
  const p = clamp(phase, 0.02, 0.98);
  const start = from + (to - from) * p;
  return v.interpolate({
    inputRange: [0, 1 - p, 1 - p + 0.001, 1],
    outputRange: [start, to, from, start],
  });
}

/* ------------------------------------------------------------------ */
/* colours that stay readable on both a light and a dark card          */
/* ------------------------------------------------------------------ */

type CloudTone = { lit: string; mid: string; shade: string };

type Palette = {
  fair: CloudTone;
  storm: CloudTone;
  rain: string;
  rainTail: string;
  wind: string;
  star: string;
  moonFace: string;
  moonEdge: string;
  moonGlow: string;
  moonCrater: string;
};

const PALETTES: Record<"light" | "dark", Palette> = {
  light: {
    fair: { lit: "#F6FAFF", mid: "#B4C8E0", shade: "#7893B8" },
    storm: { lit: "#8996A8", mid: "#6B7A8E", shade: "#44516A" },
    rain: "#3F86DD",
    rainTail: "#9CC4F2",
    wind: "#6E9CC4",
    star: "#5B6B9A",
    moonFace: "#FBEFB8",
    moonEdge: "#E7CF7A",
    moonGlow: "#F2D77A",
    moonCrater: "#B79D4A",
  },
  dark: {
    fair: { lit: "#FFFFFF", mid: "#DCE6F3", shade: "#98AAC2" },
    storm: { lit: "#A7B2C0", mid: "#7D8A9A", shade: "#4B5666" },
    rain: "#EAF4FF",
    rainTail: "#B9D4EE",
    wind: "#FFFFFF",
    star: "#FFFFFF",
    moonFace: "#FFFFFF",
    moonEdge: "#CBD5E8",
    moonGlow: "#8FB0FF",
    moonCrater: "#9AA8C4",
  },
};

/* ------------------------------------------------------------------ */
/* volumetric cloud                                                    */
/* ------------------------------------------------------------------ */

// cx, cy, r as fractions of the cloud width (height is ~0.52 x width)
const PUFFS: ReadonlyArray<readonly [number, number, number]> = [
  [0.17, 0.37, 0.11],
  [0.33, 0.27, 0.15],
  [0.55, 0.2, 0.18],
  [0.76, 0.29, 0.14],
  [0.89, 0.38, 0.09],
  [0.5, 0.37, 0.17],
];

const CLOUD_ASPECT = 0.52;

const Cloud = React.memo(function Cloud({
  width,
  tone,
  opacity,
  uid,
}: {
  width: number;
  tone: CloudTone;
  opacity: number;
  uid: string;
}) {
  const h = width * CLOUD_ASPECT;
  return (
    <Svg width={width} height={h} style={{ opacity }}>
      <Defs>
        <RadialGradient id={`${uid}-shade`} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={tone.shade} stopOpacity={0.95} />
          <Stop offset="0.65" stopColor={tone.shade} stopOpacity={0.55} />
          <Stop offset="1" stopColor={tone.shade} stopOpacity={0} />
        </RadialGradient>
        <RadialGradient id={`${uid}-lit`} cx="45%" cy="38%" r="58%">
          <Stop offset="0" stopColor={tone.lit} stopOpacity={1} />
          <Stop offset="0.55" stopColor={tone.mid} stopOpacity={0.9} />
          <Stop offset="1" stopColor={tone.mid} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      {/* underside shadow first, so the lit tops sit in front of it */}
      {PUFFS.map(([x, y, r], i) => (
        <Circle
          key={`s${i}`}
          cx={x * width}
          cy={(y + 0.05) * width}
          r={r * width * 1.1}
          fill={`url(#${uid}-shade)`}
        />
      ))}
      {PUFFS.map(([x, y, r], i) => (
        <Circle
          key={`l${i}`}
          cx={x * width}
          cy={y * width}
          r={r * width * 1.15}
          fill={`url(#${uid}-lit)`}
        />
      ))}
    </Svg>
  );
});

type CloudSpec = {
  width: number;
  top: number;
  opacity: number;
  phase: number;
  seconds: number;
};

/** Clouds drift through the upper half of the scene (same as the rainy sky). */
const upperSky = (H: number) => (w: number, rv: number) =>
  rv * Math.max(0, H * 0.5 - w * CLOUD_ASPECT);

/** Small clouds: they are accents, not a ceiling over the scene. */
function buildClouds(
  seed: number,
  count: number,
  W: number,
  H: number,
  baseSeconds: number,
  opacityRange: readonly [number, number],
  placeTop: (width: number, r: number) => number,
): CloudSpec[] {
  const rand = rng(seed);
  return Array.from({ length: count }, () => {
    const width = clamp(W * (0.15 + rand() * 0.13), 48, 118);
    return {
      width,
      top: placeTop(width, rand()),
      opacity: opacityRange[0] + rand() * (opacityRange[1] - opacityRange[0]),
      phase: rand(),
      seconds: baseSeconds * (0.8 + rand() * 0.5),
    };
  });
}

/** One drifting cloud. Each has its own loop so speeds differ (parallax). */
function DriftingCloud({
  spec,
  W,
  tone,
  uid,
  animate,
}: {
  spec: CloudSpec;
  W: number;
  tone: CloudTone;
  uid: string;
  animate: boolean;
}) {
  const loop = useLoop(spec.seconds * 1000, animate);
  const x = animate
    ? travel(loop, spec.phase, -spec.width, W)
    : spec.phase * (W - spec.width);
  return (
    <Animated.View
      style={{
        position: "absolute",
        top: spec.top,
        left: 0,
        transform: [{ translateX: x }],
      }}
    >
      <Cloud width={spec.width} tone={tone} opacity={spec.opacity} uid={uid} />
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ */
/* sunny                                                               */
/* ------------------------------------------------------------------ */

function SunnyLayer({
  W,
  H,
  p,
  isDay,
  cloudPct,
  animate,
}: {
  W: number;
  H: number;
  p: Palette;
  isDay: boolean;
  cloudPct: number;
  animate: boolean;
}) {
  const cloud = clamp(cloudPct / 100, 0, 1);
  const sx = W * 0.8;
  const sy = H * 0.15;
  const r = Math.min(W, H) * 0.2; // small sun/moon tucked in the top corner
  const sunVisibility = (1 - cloud * 0.6) * 0.9;

  const rays = useLoop(90000, animate && isDay);
  const pulse = useLoop(5200, animate);
  const twinkleA = useLoop(3100, animate && !isDay);
  const twinkleB = useLoop(4300, animate && !isDay);

  const rayAngles = React.useMemo(() => {
    const rand = rng(11);
    return Array.from({ length: 12 }, (_, i) => ({
      a: (i / 12) * Math.PI * 2 + rand() * 0.2,
      w: 0.06 + rand() * 0.07,
    }));
  }, []);

  const stars = React.useMemo(() => {
    const rand = rng(29);
    return Array.from({ length: 16 }, (_, i) => ({
      x: rand() * W,
      y: 6 + rand() * H * 0.5,
      r: 0.6 + rand() * 0.9,
      group: i % 2,
    }));
  }, [W, H]);

  const clouds = React.useMemo(
    () =>
      buildClouds(
        7,
        4 + Math.round(cloud * 2),
        W,
        H,
        80,
        [0.34 + cloud * 0.1, 0.5 + cloud * 0.1],
        upperSky(H),
      ),
    [W, H, cloud],
  );

  const pulseScale = pulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.07, 1],
  });
  const spin = rays.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });

  return (
    <>
      {isDay ? (
        <>
          <Animated.View
            style={{
              position: "absolute",
              left: sx - r,
              top: sy - r,
              width: r * 2,
              height: r * 2,
              opacity: sunVisibility,
              transform: [{ rotate: spin }],
            }}
          >
            <Svg width={r * 2} height={r * 2}>
              <Defs>
                <RadialGradient
                  id="rayFade"
                  gradientUnits="userSpaceOnUse"
                  cx={r}
                  cy={r}
                  r={r}
                >
                  <Stop offset="0" stopColor="#FFC83D" stopOpacity={0.45} />
                  <Stop offset="1" stopColor="#FFB000" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              {rayAngles.map(({ a, w }, i) => (
                <Path
                  key={i}
                  d={`M${r} ${r} L${r + Math.cos(a - w) * r} ${
                    r + Math.sin(a - w) * r
                  } L${r + Math.cos(a + w) * r} ${r + Math.sin(a + w) * r} Z`}
                  fill="url(#rayFade)"
                />
              ))}
            </Svg>
          </Animated.View>

          <Animated.View
            style={{
              position: "absolute",
              left: sx - r * 0.8,
              top: sy - r * 0.8,
              opacity: sunVisibility,
              transform: [{ scale: pulseScale }],
            }}
          >
            <Svg width={r * 1.6} height={r * 1.6}>
              <Defs>
                <RadialGradient id="sunCorona" cx="50%" cy="50%" r="50%">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={1} />
                  <Stop offset="0.2" stopColor="#FFF3B8" stopOpacity={1} />
                  <Stop offset="0.38" stopColor="#FFD23F" stopOpacity={1} />
                  <Stop offset="0.6" stopColor="#FFB020" stopOpacity={0.45} />
                  <Stop offset="1" stopColor="#FF9A3C" stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle
                cx={r * 0.8}
                cy={r * 0.8}
                r={r * 0.8}
                fill="url(#sunCorona)"
              />
            </Svg>
          </Animated.View>
        </>
      ) : (
        <>
          {[0, 1].map((group) => (
            <Animated.View
              key={group}
              style={[
                StyleSheet.absoluteFill,
                {
                  opacity: (group === 0 ? twinkleA : twinkleB).interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: [0.3, 1, 0.3],
                  }),
                },
              ]}
            >
              <Svg width={W} height={H}>
                {stars
                  .filter((s) => s.group === group)
                  .map((s, i) => (
                    <Circle
                      key={i}
                      cx={s.x}
                      cy={s.y}
                      r={s.r}
                      fill={p.star}
                      fillOpacity={0.7 * (1 - cloud * 0.6)}
                    />
                  ))}
              </Svg>
            </Animated.View>
          ))}
          <Svg
            style={[StyleSheet.absoluteFill, { opacity: 1 - cloud * 0.5 }]}
            width={W}
            height={H}
          >
            <Defs>
              <RadialGradient id="moonGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0.3" stopColor={p.moonGlow} stopOpacity={0.5} />
                <Stop offset="1" stopColor={p.moonGlow} stopOpacity={0} />
              </RadialGradient>
              <RadialGradient id="moonFace" cx="38%" cy="35%" r="70%">
                <Stop offset="0" stopColor={p.moonFace} />
                <Stop offset="1" stopColor={p.moonEdge} />
              </RadialGradient>
            </Defs>
            <Circle cx={sx} cy={sy} r={r * 0.95} fill="url(#moonGlow)" />
            <Circle cx={sx} cy={sy} r={r * 0.42} fill="url(#moonFace)" />
            <Circle
              cx={sx - r * 0.13}
              cy={sy - r * 0.06}
              r={r * 0.09}
              fill={p.moonCrater}
              fillOpacity={0.35}
            />
            <Circle
              cx={sx + r * 0.11}
              cy={sy + r * 0.12}
              r={r * 0.06}
              fill={p.moonCrater}
              fillOpacity={0.3}
            />
          </Svg>
        </>
      )}

      {clouds.map((spec, i) => (
        <DriftingCloud
          key={i}
          spec={spec}
          W={W}
          tone={p.fair}
          uid={`sc${i}`}
          animate={animate}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* rainy                                                               */
/* ------------------------------------------------------------------ */

/**
 * One depth layer of rain. A slightly rotated container holds two identical
 * vertical tiles; sliding it by exactly one tile height loops seamlessly,
 * and the rotation tilts the whole fall the way wind would.
 */
const RainSheet = React.memo(function RainSheet({
  W,
  H,
  count,
  streakWidth,
  lenMin,
  lenMax,
  durationMs,
  opacity,
  seed,
  angleDeg,
  color,
  tail,
  animate,
}: {
  W: number;
  H: number;
  count: number;
  streakWidth: number;
  lenMin: number;
  lenMax: number;
  durationMs: number;
  opacity: number;
  seed: number;
  angleDeg: number;
  color: string;
  tail: string;
  animate: boolean;
}) {
  // big enough to still cover the strip once it is rotated
  const cw = Math.ceil(W * 1.25);
  const ch = Math.ceil(H + W * 0.45);
  const loop = useLoop(durationMs, animate);
  const streaks = React.useMemo(() => {
    const rand = rng(seed);
    return Array.from({ length: count }, () => {
      const len = lenMin + rand() * (lenMax - lenMin);
      return { x: rand() * cw, y: rand() * Math.max(1, ch - len), len };
    });
  }, [cw, ch, count, lenMin, lenMax, seed]);

  const y = loop.interpolate({ inputRange: [0, 1], outputRange: [0, ch] });
  const gid = `rain${seed}`;

  return (
    <View
      style={{
        position: "absolute",
        left: (W - cw) / 2,
        top: (H - ch) / 2,
        width: cw,
        height: ch,
        opacity,
        transform: [{ rotate: `${angleDeg}deg` }],
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          top: -ch,
          left: 0,
          width: cw,
          height: ch * 2,
          transform: [{ translateY: animate ? y : 0 }],
        }}
      >
        <Svg width={cw} height={ch * 2}>
          <Defs>
            <LinearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={tail} stopOpacity={0} />
              <Stop offset="1" stopColor={color} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          {[0, ch].map((offset) =>
            streaks.map((s, i) => (
              <Rect
                key={`${offset}-${i}`}
                x={s.x}
                y={s.y + offset}
                width={streakWidth}
                height={s.len}
                rx={streakWidth / 2}
                fill={`url(#${gid})`}
              />
            )),
          )}
        </Svg>
      </Animated.View>
    </View>
  );
});

/** A tiny ring that spreads and fades where a drop lands. */
function Ripple({
  x,
  bottom,
  size,
  seconds,
  phase,
  color,
  animate,
}: {
  x: number;
  bottom: number;
  size: number;
  seconds: number;
  phase: number;
  color: string;
  animate: boolean;
}) {
  const loop = useLoop(seconds * 1000, animate);
  const scaleX = animate ? travel(loop, phase, 0.25, 1) : 0.7;
  const opacity = animate ? travel(loop, phase, 0.55, 0) : 0.3;
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: x,
        bottom,
        width: size,
        height: size * 0.3,
        borderRadius: size,
        borderWidth: 1,
        borderColor: color,
        opacity,
        transform: [{ scaleX }],
      }}
    />
  );
}

function RainyLayer({
  W,
  H,
  p,
  intensity,
  stormy,
  animate,
}: {
  W: number;
  H: number;
  p: Palette;
  intensity: number;
  stormy: boolean;
  animate: boolean;
}) {
  const k = clamp(intensity, 0.35, 1) * (stormy ? 1.35 : 1);
  const angle = stormy ? 14 : 8;
  const speed = stormy ? 0.75 : 1;

  // storm clouds sit along the top edge; rain falls out from under them
  const clouds = React.useMemo(
    () =>
      buildClouds(
        3,
        stormy ? 5 : 4,
        W,
        H,
        80,
        [0.26, 0.46],
        (w, rv) => rv * Math.max(0, H * 0.5 - w * CLOUD_ASPECT),
      ),
    [W, H, stormy],
  );

  const ripples = React.useMemo(() => {
    const rand = rng(77);
    return Array.from({ length: 10 }, () => ({
      x: rand() * (W - 20),
      bottom: 6 + rand() * H * 0.4,
      size: 9 + rand() * 9,
      seconds: 0.9 + rand() * 0.9,
      phase: rand(),
    }));
  }, [W, H]);

  // lightning: a small bolt that flickers, never a full-card flash
  const flash = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (!stormy || !animate) {
      flash.setValue(0);
      return;
    }
    const to = (v: number, d: number) =>
      Animated.timing(flash, {
        toValue: v,
        duration: d,
        useNativeDriver: true,
      });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(4200),
        to(1, 50),
        to(0.2, 70),
        to(0.9, 60),
        to(0, 260),
        Animated.delay(2600),
        to(0.8, 60),
        to(0, 240),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [flash, stormy, animate]);

  const boltH = H * 0.22;

  return (
    <>
      <RainSheet
        W={W}
        H={H}
        seed={101}
        count={Math.round(30 * k)}
        streakWidth={0.8}
        lenMin={8}
        lenMax={13}
        durationMs={1000 * speed}
        opacity={0.3}
        angleDeg={angle}
        color={p.rain}
        tail={p.rainTail}
        animate={animate}
      />
      <RainSheet
        W={W}
        H={H}
        seed={202}
        count={Math.round(18 * k)}
        streakWidth={1.1}
        lenMin={12}
        lenMax={19}
        durationMs={700 * speed}
        opacity={0.45}
        angleDeg={angle}
        color={p.rain}
        tail={p.rainTail}
        animate={animate}
      />
      <RainSheet
        W={W}
        H={H}
        seed={303}
        count={Math.round(9 * k)}
        streakWidth={1.6}
        lenMin={18}
        lenMax={28}
        durationMs={480 * speed}
        opacity={0.6}
        angleDeg={angle}
        color={p.rain}
        tail={p.rainTail}
        animate={animate}
      />

      {ripples.map((rp, i) => (
        <Ripple key={i} color={p.rain} animate={animate} {...rp} />
      ))}

      {clouds.map((spec, i) => (
        <DriftingCloud
          key={i}
          spec={spec}
          W={W}
          tone={p.storm}
          uid={`rc${i}`}
          animate={animate}
        />
      ))}

      {stormy ? (
        <Animated.View
          style={{
            position: "absolute",
            left: W * 0.5,
            top: H * 0.14,
            opacity: flash,
          }}
        >
          <Svg width={boltH * 0.46} height={boltH} viewBox="0 0 14 30">
            <Path
              d="M9 0 L2 16 L7 16 L4 30 L13 11 L8 11 Z"
              fill="#FFE27A"
              stroke="#E8B923"
              strokeWidth={0.6}
            />
          </Svg>
        </Animated.View>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* breezy                                                              */
/* ------------------------------------------------------------------ */

const LEAF_COLORS = ["#6F9A45", "#B9893A", "#8FB04F", "#C77B3A"] as const;

function WindStreak({
  W,
  y,
  length,
  seconds,
  phase,
  opacity,
  color,
  animate,
  id,
}: {
  W: number;
  y: number;
  length: number;
  seconds: number;
  phase: number;
  opacity: number;
  color: string;
  animate: boolean;
  id: string;
}) {
  const loop = useLoop(seconds * 1000, animate);
  const x = animate ? travel(loop, phase, -length, W) : phase * (W - length);
  return (
    <Animated.View
      style={{
        position: "absolute",
        top: y,
        left: 0,
        opacity,
        transform: [{ translateX: x }],
      }}
    >
      <Svg
        width={length}
        height={14}
        viewBox="0 0 160 16"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="0.5" stopColor={color} stopOpacity={0.95} />
            <Stop offset="1" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Path
          d="M2 9 C 30 2, 56 14, 88 8 S 134 3, 150 7 C 158 9, 160 14, 153 14"
          stroke={`url(#${id})`}
          strokeWidth={1.8}
          strokeLinecap="round"
          fill="none"
        />
      </Svg>
    </Animated.View>
  );
}

function Leaf({
  W,
  y,
  size,
  color,
  seconds,
  phase,
  animate,
}: {
  W: number;
  y: number;
  size: number;
  color: string;
  seconds: number;
  phase: number;
  animate: boolean;
}) {
  const loop = useLoop(seconds * 1000, animate);
  const x = animate ? travel(loop, phase, -size * 2, W + size) : phase * W;
  const bob = loop.interpolate({
    inputRange: [0, 0.2, 0.45, 0.7, 1],
    outputRange: [0, -10, 8, -9, 0],
  });
  const spin = loop.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "540deg"],
  });
  return (
    <Animated.View
      style={{
        position: "absolute",
        top: y,
        left: 0,
        transform: [
          { translateX: x },
          { translateY: animate ? bob : 0 },
          { rotate: animate ? spin : "0deg" },
        ],
      }}
    >
      <Svg width={size} height={size * 0.6} viewBox="0 0 20 12">
        <Path d="M1 6 C 6 0, 14 0, 19 6 C 14 12, 6 12, 1 6 Z" fill={color} />
        <Path
          d="M2 6 L 18 6"
          stroke="#00000033"
          strokeWidth={0.8}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
  );
}

function BreezyLayer({
  W,
  H,
  p,
  windKmh,
  cloudPct,
  animate,
}: {
  W: number;
  H: number;
  p: Palette;
  windKmh: number;
  cloudPct: number;
  animate: boolean;
}) {
  const wind = clamp(windKmh, 12, 60);
  // stronger wind -> shorter loop time -> faster everything
  const cloudSeconds = clamp(1500 / wind, 20, 75);
  const streakSeconds = clamp(120 / wind, 2, 6);
  const leafSeconds = clamp(180 / wind, 3.2, 9);

  const clouds = React.useMemo(
    () =>
      buildClouds(
        19,
        4 + Math.round(clamp(cloudPct, 0, 100) / 50),
        W,
        H,
        cloudSeconds,
        [0.34, 0.5],
        upperSky(H),
      ),
    [W, H, cloudSeconds, cloudPct],
  );

  const streaks = React.useMemo(() => {
    const rand = rng(41);
    return Array.from({ length: 6 }, () => ({
      y: H * 0.06 + rand() * H * 0.84,
      length: W * (0.26 + rand() * 0.28),
      seconds: streakSeconds * (0.8 + rand() * 0.6),
      phase: rand(),
      opacity: 0.25 + rand() * 0.3,
    }));
  }, [W, H, streakSeconds]);

  const leaves = React.useMemo(() => {
    const rand = rng(53);
    return Array.from({ length: 7 }, (_, i) => ({
      y: H * (0.15 + rand() * 0.7),
      size: 9 + rand() * 6,
      color: LEAF_COLORS[i % LEAF_COLORS.length],
      seconds: leafSeconds * (0.8 + rand() * 0.7),
      phase: rand(),
    }));
  }, [H, leafSeconds]);

  return (
    <>
      {clouds.map((spec, i) => (
        <DriftingCloud
          key={i}
          spec={spec}
          W={W}
          tone={p.fair}
          uid={`bc${i}`}
          animate={animate}
        />
      ))}

      {streaks.map((s, i) => (
        <WindStreak
          key={i}
          W={W}
          id={`ws${i}`}
          color={p.wind}
          animate={animate}
          {...s}
        />
      ))}

      {leaves.map((l, i) => (
        <Leaf key={i} W={W} animate={animate} {...l} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* root                                                                */
/* ------------------------------------------------------------------ */

function WeatherSkyBase({
  sky,
  dark = false,
  isDay = true,
  cloudCoverPct = 0,
  windSpeedKmh = 0,
  rainChancePct = 60,
  stormy = false,
}: WeatherSkyProps) {
  const reduceMotion = useReduceMotion();
  const animate = !reduceMotion;
  const palette = dark ? PALETTES.dark : PALETTES.light;
  const [size, setSize] = React.useState({ w: 0, h: 0 });
  const [shown, setShown] = React.useState<SkyKind | null>(sky);
  const fade = React.useRef(new Animated.Value(sky ? 1 : 0)).current;

  // cross-fade when the sky changes (live forecast <-> preview)
  React.useEffect(() => {
    if (sky === shown) return;
    fade.stopAnimation();
    Animated.timing(fade, {
      toValue: 0,
      duration: shown ? 200 : 0,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) return;
      setShown(sky);
      if (sky) {
        Animated.timing(fade, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }).start();
      }
    });
  }, [sky, shown, fade]);

  const onLayout = React.useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize((prev) =>
      Math.abs(prev.w - width) < 1 && Math.abs(prev.h - height) < 1
        ? prev
        : { w: width, h: height },
    );
  }, []);

  const { w, h } = size;
  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, { overflow: "hidden" }]}
    >
      {w > 0 && h > 0 && shown ? (
        <Animated.View
          key={shown}
          style={[StyleSheet.absoluteFill, { opacity: fade }]}
        >
          {shown === "sunny" ? (
            <SunnyLayer
              W={w}
              H={h}
              p={palette}
              isDay={isDay}
              cloudPct={cloudCoverPct}
              animate={animate}
            />
          ) : shown === "rainy" ? (
            <RainyLayer
              W={w}
              H={h}
              p={palette}
              intensity={rainChancePct / 100}
              stormy={stormy}
              animate={animate}
            />
          ) : (
            <BreezyLayer
              W={w}
              H={h}
              p={palette}
              windKmh={windSpeedKmh}
              cloudPct={cloudCoverPct}
              animate={animate}
            />
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

export const WeatherSky = React.memo(WeatherSkyBase);