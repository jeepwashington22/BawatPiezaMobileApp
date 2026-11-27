import React, { useEffect, useRef, useState } from "react";
import {
  Dimensions,
  StyleSheet,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import Svg, {
  Circle,
  Defs,
  Ellipse,
  G,
  LinearGradient,
  Path,
  Polygon,
  RadialGradient,
  Rect,
  Stop,
} from "react-native-svg";
import Animated, {
  type SharedValue,
  Extrapolation,
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { fonts } from "../../theme";
import { AnimatedPressable, scale } from "../../components/glass-ui";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

/** Own "fill parent" style: StyleSheet.absoluteFill(Object) is removed in newer React Native. */
const FILL = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

/** The 3D scene sits in the top part; the copy sits directly on the orange screen. */
const HERO_H = SCREEN_H * 0.44;

/** 3D scenes are authored on a 360x400 canvas and scaled to fit the hero. */
const SCENE_H = Math.min(HERO_H * 0.97, (SCREEN_W * 400) / 360);
const SCENE_W = (SCENE_H * 360) / 400;
const K = SCENE_W / 360; // scene units -> screen px

const ONBOARDING_SEEN_KEY = "bawatpieza.onboarding.seen";

/* ------------------------------ brand tokens ------------------------------ */
const ACCENT = "#EA580C";
const ACCENT_DARK = "#C2410C";
const TEXT_PRIMARY = "#0F172A";

/* --------------------------------- slides --------------------------------- */

interface SlideDef {
  title: string;
  body: string;
  visual: "tile" | "dynamo" | "power";
  steps: string[];
}

const SLIDES: SlideDef[] = [
  {
    title: "Meet BawatPieza",
    body: "Every pieza, accounted for. A smart floor tile that feels every step across your zones.",
    visual: "tile",
    steps: [
      "Someone steps on the tile",
      "The top plate presses down onto the springs",
      "The springs push it back up, ready for the next step",
    ],
  },
  {
    title: "The dynamo inside",
    body: "Each step presses the springs and spins a gear. A tiny dynamo turns that motion into electricity.",
    visual: "dynamo",
    steps: [
      "The pressing motion drives the central shaft",
      "The shaft spins the gear and the copper coils",
      "The spinning dynamo generates an electric current",
    ],
  },
  {
    title: "Steps into power",
    body: "Every step becomes clean electricity, and AI turns your data into clear answers for every piece of your work.",
    visual: "power",
    steps: [
      "Each step sends power from the tile into the battery",
      "The battery stores it and feeds the bulb",
      "AI reads the data and turns it into insights",
    ],
  },
];

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

/* ============================ 3D / ISOMETRIC KIT =========================== */

type Pt = [number, number];
const OX = 180;

/** Isometric projection of (x, y, z) into the 360x400 scene. */
const iso = (x: number, y: number, z: number, oy: number): Pt => [
  OX + (x - y) * 0.866,
  oy + (x + y) * 0.5 - z,
];
const pts = (a: Pt[]) => a.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");

interface Faces {
  t: string;
  l: string;
  r: string;
}
const grad = (n: string): Faces => ({
  t: `url(#${n}T)`,
  l: `url(#${n}L)`,
  r: `url(#${n}R)`,
});
const MAT = {
  slate: grad("sl"),
  ink: grad("ink"),
  cream: grad("cr"),
  steel: grad("st"),
};

/** A shaded isometric box: left face, right face, lit top face. */
function Box({
  x,
  y,
  z,
  w,
  d,
  h,
  oy,
  c,
}: {
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  oy: number;
  c: Faces;
}) {
  const top = [iso(x, y, z + h, oy), iso(x + w, y, z + h, oy), iso(x + w, y + d, z + h, oy), iso(x, y + d, z + h, oy)];
  const left = [iso(x, y + d, z, oy), iso(x + w, y + d, z, oy), iso(x + w, y + d, z + h, oy), iso(x, y + d, z + h, oy)];
  const right = [iso(x + w, y, z, oy), iso(x + w, y + d, z, oy), iso(x + w, y + d, z + h, oy), iso(x + w, y, z + h, oy)];
  return (
    <G>
      <Polygon points={pts(left)} fill={c.l} />
      <Polygon points={pts(right)} fill={c.r} />
      <Polygon
        points={pts(top)}
        fill={c.t}
        stroke="rgba(255,255,255,0.22)"
        strokeWidth={0.8}
        strokeLinejoin="round"
      />
    </G>
  );
}

const lin = (id: string, a: string, b: string, x2 = 0, y2 = 1) => (
  <LinearGradient id={id} x1="0" y1="0" x2={x2} y2={y2}>
    <Stop offset="0" stopColor={a} />
    <Stop offset="1" stopColor={b} />
  </LinearGradient>
);

/** Every material gradient used by the scenes. */
function Defs3D() {
  return (
    <Defs>
      {lin("slT", "#8B94A1", "#444B55", 1, 1)}
      {lin("slL", "#323A43", "#1B2026")}
      {lin("slR", "#232A31", "#12161B")}
      {lin("inkT", "#3A414B", "#232930", 1, 1)}
      {lin("inkL", "#2A3038", "#14181D")}
      {lin("inkR", "#1D2228", "#0D1014")}
      {lin("crT", "#F1ECE0", "#D6CFBF", 1, 1)}
      {lin("crL", "#C4BCAA", "#A79F8D")}
      {lin("crR", "#D9D2C1", "#B9B1A0")}
      {lin("stT", "#E8EDF3", "#B3BCC8", 1, 1)}
      {lin("stL", "#9CA5B1", "#6E7782")}
      {lin("stR", "#828B97", "#565E69")}
      {lin("steelH", "#6B7480", "#F1F4F8", 1, 0)}
      {lin("copSide", "#B45A22", "#7C3A12", 1, 0)}
      {lin("sheen", "#FFFFFF", "#FFFFFF", 1, 1)}
      <LinearGradient id="batt" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#1B2026" />
        <Stop offset="0.35" stopColor="#4A525D" />
        <Stop offset="1" stopColor="#12161B" />
      </LinearGradient>
      <LinearGradient id="battBand" x1="0" y1="0" x2="1" y2="0">
        <Stop offset="0" stopColor="#C2410C" />
        <Stop offset="0.4" stopColor="#FB923C" />
        <Stop offset="1" stopColor="#9A3412" />
      </LinearGradient>
      <RadialGradient id="copTop" cx="40%" cy="35%" r="75%">
        <Stop offset="0" stopColor="#FDBA74" />
        <Stop offset="0.55" stopColor="#E0762E" />
        <Stop offset="1" stopColor="#B5531B" />
      </RadialGradient>
      <RadialGradient id="chrome" cx="35%" cy="30%" r="75%">
        <Stop offset="0" stopColor="#FFFFFF" />
        <Stop offset="0.5" stopColor="#AEB6C2" />
        <Stop offset="1" stopColor="#4B535E" />
      </RadialGradient>
      <RadialGradient id="shadow" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#000" stopOpacity="0.5" />
        <Stop offset="1" stopColor="#000" stopOpacity="0" />
      </RadialGradient>
      <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
        <Stop offset="0" stopColor="#FEF08A" stopOpacity="0.95" />
        <Stop offset="0.4" stopColor="#FDBA74" stopOpacity="0.5" />
        <Stop offset="1" stopColor="#FB923C" stopOpacity="0" />
      </RadialGradient>
      <RadialGradient id="bulb" cx="38%" cy="32%" r="75%">
        <Stop offset="0" stopColor="#FFFBEB" />
        <Stop offset="0.45" stopColor="#FDE047" />
        <Stop offset="1" stopColor="#F59E0B" />
      </RadialGradient>
    </Defs>
  );
}

/** One scene-sized SVG layer that can be animated on its own. */
function Layer({
  style,
  children,
}: {
  style?: any;
  children: React.ReactNode;
}) {
  return (
    <Animated.View pointerEvents="none" style={[FILL, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 360 400">
        <Defs3D />
        {children}
      </Svg>
    </Animated.View>
  );
}

function useLoop(duration: number) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(
      withSequence(
        withTiming(1, { duration, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
    );
  }, [v, duration]);
  return v;
}

/** A footstep: the tile presses down while a ripple leaves it. 1.8s cycle. */
function usePressCycle() {
  const press = useSharedValue(0);
  const ring = useSharedValue(0);
  useEffect(() => {
    press.value = withRepeat(
      withSequence(
        withDelay(500, withTiming(1, { duration: 150 })),
        withTiming(0, { duration: 350 }),
        withDelay(800, withTiming(0, { duration: 0 })),
      ),
      -1,
    );
    ring.value = withRepeat(
      withSequence(
        withDelay(550, withTiming(1, { duration: 1000, easing: Easing.out(Easing.quad) })),
        withDelay(250, withTiming(0, { duration: 0 })),
      ),
      -1,
    );
  }, [press, ring]);
  return { press, ring };
}

/** Ground ripple, squashed to sit flat on the isometric floor. */
function StepRing({
  ring,
  cx,
  cy,
  size,
}: {
  ring: SharedValue<number>;
  cx: number;
  cy: number;
  size: number;
}) {
  const s = useAnimatedStyle(() => ({
    opacity: (1 - ring.value) * 0.85,
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.5, 1.5]) }],
  }));
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: (cx - size / 2) * K,
        top: (cy - size / 2) * K,
        width: size * K,
        height: size * K,
        transform: [{ scaleY: 0.5 }],
      }}
    >
      <Animated.View
        style={[
          {
            flex: 1,
            borderRadius: size * K,
            borderWidth: 3,
            borderColor: "rgba(255,255,255,0.9)",
          },
          s,
        ]}
      />
    </View>
  );
}

/* ------------------------------ hero backdrop ----------------------------- */

function ScreenBackdrop() {
  return (
    <>
      <Svg
        style={FILL}
        width="100%"
        height="100%"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id="bg" x1="0" y1="0" x2="0.6" y2="1">
            <Stop offset="0" stopColor="#F4511E" />
            <Stop offset="0.5" stopColor="#E2410F" />
            <Stop offset="1" stopColor="#A82E08" />
          </LinearGradient>
          <RadialGradient id="spot" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFB070" stopOpacity="0.55" />
            <Stop offset="1" stopColor="#FF8A3D" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#bg)" />
        <Ellipse cx="50" cy="26" rx="62" ry="30" fill="url(#spot)" />
      </Svg>
      <Text style={st.watermark} numberOfLines={1} adjustsFontSizeToFit>
        BAWATPIEZA
      </Text>
    </>
  );
}

/* ===================== SCENE 1: THE TILE (isometric 3D) ==================== */

function TileArt({ oy }: { oy: number }) {
  const lidZ = 56; // top of lid
  const p = (x: number, y: number) => iso(x, y, lidZ, oy);
  return (
    <G>
      {/* body */}
      <Box x={10} y={10} z={0} w={130} d={130} h={34} oy={oy} c={MAT.ink} />
      {/* studs on the front-left face */}
      {[45, 100].map((x) => {
        const [sx, sy] = iso(x, 140, 17, oy);
        return (
          <G key={x}>
            <Ellipse cx={sx} cy={sy + 1.5} rx={5.5} ry={6} fill="rgba(0,0,0,0.4)" />
            <Ellipse cx={sx} cy={sy} rx={4.8} ry={5.4} fill="url(#chrome)" />
          </G>
        );
      })}
      {/* lip */}
      <Box x={4} y={4} z={34} w={142} d={142} h={9} oy={oy} c={MAT.ink} />
      {/* lid */}
      <Box x={8} y={8} z={43} w={134} d={134} h={13} oy={oy} c={MAT.slate} />
      {/* sheen + inset line on the lid */}
      <Polygon points={pts([p(8, 8), p(80, 8), p(8, 80)])} fill="#FFFFFF" opacity={0.09} />
      <Polygon points={pts([p(60, 8), p(100, 8), p(8, 100), p(8, 60)])} fill="#FFFFFF" opacity={0.05} />
      <Polygon
        points={pts([p(22, 22), p(128, 22), p(128, 128), p(22, 128)])}
        fill="none"
        stroke="rgba(255,255,255,0.1)"
        strokeWidth={1}
      />
      {/* ember */}
      <Ellipse cx={p(75, 75)[0]} cy={p(75, 75)[1]} rx={9} ry={5} fill="#FB923C" opacity={0.25} />
      <Ellipse cx={p(75, 75)[0]} cy={p(75, 75)[1]} rx={3.2} ry={1.9} fill="#FDBA74" />
    </G>
  );
}

function TileScene() {
  const { press, ring } = usePressCycle();
  const float = useLoop(1500);

  const tile = useAnimatedStyle(() => ({
    transform: [{ translateY: (press.value * 8 + (float.value - 0.5) * 3) * K }],
  }));
  const badge = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.15, 0.7, 1], [0, 1, 1, 0]),
    transform: [
      { translateY: interpolate(ring.value, [0, 1], [16, -12]) * K },
      { scale: interpolate(ring.value, [0, 0.15], [0.6, 1], Extrapolation.CLAMP) },
    ],
  }));

  return (
    <View style={st.scene}>
      <Layer>
        <Ellipse cx={180} cy={292} rx={150} ry={50} fill="url(#shadow)" />
      </Layer>
      <StepRing ring={ring} cx={180} cy={290} size={230} />
      <Layer style={tile}>
        <TileArt oy={190} />
      </Layer>
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            left: 250 * K,
            top: 64 * K,
            width: 46 * K,
            height: 46 * K,
            borderRadius: 23 * K,
            backgroundColor: "#FFFFFF",
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "#000",
            shadowOpacity: 0.25,
            shadowRadius: 10,
            shadowOffset: { width: 0, height: 5 },
            elevation: 6,
          },
          badge,
        ]}
      >
        <Ionicons name="flash" size={24 * K} color={ACCENT} />
      </Animated.View>
    </View>
  );
}

/* ================== SCENE 2: EXPLODED DYNAMO (animated) ==================== */

function gearPoints(teeth = 14, ro = 46, ri = 37) {
  const s = (Math.PI * 2) / teeth;
  const out: string[] = [];
  const at = (r: number, a: number) => `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r).toFixed(1)}`;
  for (let i = 0; i < teeth; i++) {
    const a = i * s;
    out.push(at(ri, a), at(ro, a + s * 0.12), at(ro, a + s * 0.38), at(ri, a + s * 0.5));
  }
  return out.join(" ");
}
const GEAR_POINTS = gearPoints();

function GearSvg({ dark }: { dark?: boolean }) {
  return (
    <Svg width="100%" height="100%" viewBox="-50 -50 100 100">
      <Defs>
        <RadialGradient id="gearG" cx="35%" cy="30%" r="80%">
          <Stop offset="0" stopColor={dark ? "#4B535E" : "#F1F4F8"} />
          <Stop offset="1" stopColor={dark ? "#1F252C" : "#7B8490"} />
        </RadialGradient>
      </Defs>
      <Polygon points={GEAR_POINTS} fill="url(#gearG)" stroke={dark ? "#14181D" : "#4B5563"} strokeWidth={1.2} />
      {!dark && (
        <>
          <Circle r={27} fill="none" stroke="rgba(0,0,0,0.25)" strokeWidth={2} />
          <Circle r={13} fill="#2B323A" />
          <Circle r={7} fill="#AEB6C2" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <Rect key={a} x={-1.5} y={-26} width={3} height={13} fill="rgba(0,0,0,0.3)" rotation={a} />
          ))}
        </>
      )}
    </Svg>
  );
}

function Disc({ cx, cy, rx }: { cx: number; cy: number; rx: number }) {
  const ry = rx * 0.5;
  return (
    <G>
      <Ellipse cx={cx} cy={cy + 6} rx={rx} ry={ry} fill="#6B300F" />
      <Rect x={cx - rx} y={cy} width={rx * 2} height={6} fill="url(#copSide)" />
      <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="url(#copTop)" />
      <Ellipse cx={cx} cy={cy} rx={rx * 0.28} ry={ry * 0.28} fill="rgba(90,40,10,0.55)" />
    </G>
  );
}

function Coil({ x, y, oy }: { x: number; y: number; oy: number }) {
  const rings = Array.from({ length: 9 }, (_, i) => 52 + i * 9.5);
  const [bx, by] = iso(x, y, 50, oy);
  return (
    <G>
      <Ellipse cx={bx} cy={by + 2} rx={12} ry={6} fill="#14181D" />
      {rings.map((z) => {
        const [cx, cy] = iso(x, y, z, oy);
        return (
          <G key={z}>
            <Ellipse cx={cx} cy={cy} rx={10} ry={5} fill="none" stroke="#5B6470" strokeWidth={4} />
            <Ellipse cx={cx} cy={cy - 0.8} rx={10} ry={5} fill="none" stroke="#DCE1E8" strokeWidth={1.8} />
          </G>
        );
      })}
    </G>
  );
}

/** One floating layer of the exploded assembly. */
function ExLayer({
  explode,
  float,
  delta,
  phase,
  fade,
  children,
}: {
  explode: SharedValue<number>;
  float: SharedValue<number>;
  delta: number;
  phase: number;
  fade?: boolean;
  children: React.ReactNode;
}) {
  const s = useAnimatedStyle(() => ({
    opacity: fade ? interpolate(explode.value, [0.2, 0.9], [0, 1], Extrapolation.CLAMP) : 1,
    transform: [
      { translateY: ((1 - explode.value) * delta + (float.value - 0.5) * 7 * phase) * K },
    ],
  }));
  return <Layer style={s}>{children}</Layer>;
}

function Tag({ text, top, side }: { text: string; top: number; side: "l" | "r" }) {
  return (
    <View
      pointerEvents="none"
      style={[
        st.tag,
        { top: top * K },
        side === "l" ? { left: 2 * K } : { right: 2 * K },
      ]}
    >
      <View style={st.tagDot} />
      <Text style={st.tagText}>{text}</Text>
    </View>
  );
}

function DynamoScene({ isActive }: { isActive: boolean }) {
  const OY = 215;
  const explode = useSharedValue(0);
  const float = useLoop(1700);
  const spin = useSharedValue(0);

  useEffect(() => {
    explode.value = isActive
      ? withDelay(150, withSpring(1, { damping: 13, stiffness: 80 }))
      : withTiming(0, { duration: 250 });
  }, [isActive, explode]);

  useEffect(() => {
    spin.value = withRepeat(withTiming(360, { duration: 5200, easing: Easing.linear }), -1);
  }, [spin]);

  const spinStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  const labels = useAnimatedStyle(() => ({
    opacity: interpolate(explode.value, [0.7, 1], [0, 1], Extrapolation.CLAMP),
  }));

  const gearC = iso(80, 80, 100, OY);
  const GEAR = 96;
  const shaftTop = iso(80, 80, 150, OY);
  const shaftBot = iso(80, 80, 50, OY);

  const discs: [number, number, number][] = [
    [30, 70, 17],
    [118, 38, 15],
    [52, 118, 18],
    [122, 110, 21],
    [92, 22, 13],
  ];

  return (
    <View style={st.scene}>
      {/* ground glow + shadow */}
      <Layer>
        <Ellipse cx={180} cy={318} rx={150} ry={40} fill="url(#shadow)" />
      </Layer>

      {/* base plate */}
      <ExLayer explode={explode} float={float} delta={0} phase={0.4}>
        <Box x={10} y={10} z={0} w={140} d={140} h={6} oy={OY} c={MAT.cream} />
      </ExLayer>

      {/* black frame with rack + gear housing */}
      <ExLayer explode={explode} float={float} delta={28} phase={0.7}>
        <Box x={14} y={14} z={34} w={132} d={132} h={16} oy={OY} c={MAT.ink} />
        <Polygon
          points={pts([iso(28, 28, 50, OY), iso(132, 28, 50, OY), iso(132, 132, 50, OY), iso(28, 132, 50, OY)])}
          fill="#3B434D"
        />
        <Box x={30} y={108} z={50} w={100} d={5} h={4} oy={OY} c={MAT.steel} />
        <Box x={108} y={30} z={50} w={5} d={100} h={4} oy={OY} c={MAT.steel} />
        <Box x={60} y={60} z={50} w={40} d={40} h={10} oy={OY} c={MAT.ink} />
      </ExLayer>

      {/* springs + shaft */}
      <ExLayer explode={explode} float={float} delta={46} phase={0.9} fade>
        <Rect
          x={shaftTop[0] - 6}
          y={shaftTop[1]}
          width={12}
          height={shaftBot[1] - shaftTop[1]}
          fill="url(#steelH)"
        />
        <Ellipse cx={shaftTop[0]} cy={shaftTop[1]} rx={6} ry={3} fill="#E5EAF0" />
        {[
          [35, 35],
          [125, 35],
          [35, 125],
          [125, 125],
        ].map(([x, y]) => (
          <Coil key={`${x}-${y}`} x={x} y={y} oy={OY} />
        ))}
      </ExLayer>

      {/* copper discs + spinning gear */}
      <ExLayer explode={explode} float={float} delta={80} phase={1.1}>
        <Ellipse cx={gearC[0]} cy={gearC[1] + 10} rx={54} ry={27} fill="rgba(0,0,0,0.28)" />
        {discs.map(([x, y, rx]) => {
          const [dx, dy] = iso(x, y, 104, OY);
          return <Disc key={`${x}-${y}`} cx={dx} cy={dy} rx={rx} />;
        })}
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: (gearC[0] - GEAR / 2) * K,
            top: (gearC[1] - GEAR / 2) * K,
            width: GEAR * K,
            height: GEAR * K,
            transform: [{ scaleY: 0.5 }],
          }}
        >
          <Animated.View style={[FILL, { transform: [{ translateY: 7 * K }] }, spinStyle]}>
            <GearSvg dark />
          </Animated.View>
          <Animated.View style={[FILL, spinStyle]}>
            <GearSvg />
          </Animated.View>
        </View>
      </ExLayer>

      {/* upper stack */}
      <ExLayer explode={explode} float={float} delta={102} phase={1.2}>
        <Box x={10} y={10} z={128} w={140} d={140} h={5} oy={OY} c={MAT.cream} />
      </ExLayer>
      <ExLayer explode={explode} float={float} delta={111} phase={1.35}>
        <Box x={12} y={12} z={142} w={136} d={136} h={14} oy={OY} c={MAT.ink} />
      </ExLayer>
      <ExLayer explode={explode} float={float} delta={117} phase={1.5}>
        <Box x={10} y={10} z={160} w={140} d={140} h={5} oy={OY} c={MAT.cream} />
      </ExLayer>
      <ExLayer explode={explode} float={float} delta={122} phase={1.65}>
        <Box x={8} y={8} z={170} w={144} d={144} h={9} oy={OY} c={MAT.slate} />
      </ExLayer>

      <Animated.View pointerEvents="none" style={[FILL, labels]}>
        <Tag text="Top plate" top={104} side="l" />
        <Tag text="Springs" top={222} side="l" />
        <Tag text="Base" top={294} side="l" />
        <Tag text="Copper & gear" top={186} side="r" />
        <Tag text="Dynamo" top={250} side="r" />
      </Animated.View>
    </View>
  );
}

/* =============== SCENE 3: STEPS BECOME ELECTRICITY (power) ================= */

/** A cable with glowing energy dots that flow from the first point to the last. */
function EnergyCable({ d, flow }: { d: string; flow: SharedValue<number> }) {
  const props = useAnimatedProps(() => ({ strokeDashoffset: -flow.value * 14 }));
  return (
    <G>
      <Path d={d} stroke="rgba(0,0,0,0.3)" strokeWidth={8} strokeLinecap="round" fill="none" />
      <Path d={d} stroke="rgba(255,255,255,0.35)" strokeWidth={4} strokeLinecap="round" fill="none" />
      <AnimatedPath
        d={d}
        stroke="#FEF08A"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="0.1 14"
        fill="none"
        animatedProps={props}
      />
    </G>
  );
}

/** One LED on the battery that lights up as it charges. */
function Led({ pts: p, i, charge }: { pts: string; i: number; charge: SharedValue<number> }) {
  const props = useAnimatedProps(() => {
    const a = i * 0.28;
    return { fillOpacity: interpolate(charge.value, [a, a + 0.12], [0.15, 1], Extrapolation.CLAMP) };
  });
  return <AnimatedPolygon points={p} fill="#FDE047" animatedProps={props} />;
}

/** A 3D power-bank style battery built from the same isometric kit as the tile. */
function BatteryArt({ charge }: { charge: SharedValue<number> }) {
  const OYB = 204;
  const z = 26;
  const q = (x: number, y: number, zz: number) => iso(x, y, zz, OYB);
  const ledXs: [number, number][] = [
    [8, 17],
    [19, 28],
    [30, 39],
  ];
  return (
    <G>
      <Ellipse cx={180} cy={246} rx={48} ry={11} fill="rgba(0,0,0,0.3)" />
      <Box x={0} y={0} z={0} w={44} d={44} h={z} oy={OYB} c={MAT.slate} />
      {/* orange label on the front-left face */}
      <Polygon
        points={pts([q(7, 44, 7), q(37, 44, 7), q(37, 44, 19), q(7, 44, 19)])}
        fill="url(#battBand)"
      />
      {/* LED slot + LEDs on the lid */}
      <Polygon
        points={pts([q(6, 18, z), q(41, 18, z), q(41, 26, z), q(6, 26, z)])}
        fill="rgba(0,0,0,0.45)"
      />
      {ledXs.map(([a, b], i) => (
        <Led
          key={i}
          i={i}
          charge={charge}
          pts={pts([q(a, 19.5, z), q(b, 19.5, z), q(b, 24.5, z), q(a, 24.5, z)])}
        />
      ))}
      {/* shine */}
      <Polygon points={pts([q(0, 0, z), q(26, 0, z), q(0, 26, z)])} fill="#FFFFFF" opacity={0.08} />
    </G>
  );
}

/** Tile -> battery -> bulb. */
function PowerScene() {
  const { press, ring } = usePressCycle();
  const pulse = useLoop(900);
  const charge = useSharedValue(0);
  const flow = useSharedValue(0);

  useEffect(() => {
    charge.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3200, easing: Easing.linear }),
        withDelay(500, withTiming(0, { duration: 0 })),
      ),
      -1,
    );
    flow.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.linear }), -1);
  }, [charge, flow]);

  const tile = useAnimatedStyle(() => ({
    transform: [{ translateY: (95 + press.value * 4) * K }, { scale: 0.5 }],
  }));
  const glow = useAnimatedStyle(() => ({
    opacity: 0.55 + pulse.value * 0.45,
    transform: [{ scale: 0.92 + pulse.value * 0.14 }],
  }));

  return (
    <View style={st.scene}>
      <Layer style={glow}>
        <Circle cx={180} cy={72} r={92} fill="url(#glow)" />
      </Layer>

      {/* bulb */}
      <Layer>
        <G transform="translate(50.4 0) scale(0.72)">
          <Path
            d="M148 138 A50 50 0 1 1 212 138 L204 156 L156 156 Z"
            fill="url(#bulb)"
            stroke="rgba(255,255,255,0.65)"
            strokeWidth={1.5}
          />
          <Path
            d="M166 150 L166 112 Q173 94 180 112 Q187 94 194 112 L194 150"
            fill="none"
            stroke="#B45309"
            strokeWidth={2.6}
            strokeLinecap="round"
          />
          <Ellipse cx={163} cy={78} rx={9} ry={17} fill="#FFFFFF" opacity={0.6} rotation={-28} origin="163, 78" />
          <Rect x={155} y={156} width={50} height={10} rx={2} fill="url(#steelH)" />
          <Rect x={157} y={167} width={46} height={8} rx={2} fill="url(#steelH)" />
          <Rect x={159} y={176} width={42} height={8} rx={2} fill="url(#steelH)" />
          <Rect x={168} y={185} width={24} height={7} rx={3} fill="#2B323A" />
        </G>
      </Layer>

      {/* tile */}
      <Layer>
        <Ellipse cx={180} cy={352} rx={100} ry={22} fill="url(#shadow)" />
      </Layer>
      <StepRing ring={ring} cx={180} cy={348} size={140} />
      <Layer style={tile}>
        <TileArt oy={190} />
      </Layer>

      {/* cable: tile -> battery (runs behind the battery) */}
      <Layer>
        <EnergyCable d="M180 298 L180 236" flow={flow} />
      </Layer>

      {/* battery */}
      <Layer>
        <BatteryArt charge={charge} />
      </Layer>

      {/* cable: battery -> bulb */}
      <Layer>
        <EnergyCable d="M180 200 L180 142" flow={flow} />
      </Layer>

      <Tag text="Bulb" top={58} side="r" />
      <Tag text="Battery" top={196} side="r" />
      <Tag text="Tile" top={318} side="r" />
    </View>
  );
}

/* --------------------------- hero: pick one visual ------------------------ */

function Visual({
  slide,
  index,
  scrollX,
  isActive,
}: {
  slide: SlideDef;
  index: number;
  scrollX: SharedValue<number>;
  isActive: boolean;
}) {
  const parallax = useAnimatedStyle(() => ({
    transform: [{ translateX: (scrollX.value - index * SCREEN_W) * 0.35 }],
  }));

  return (
    <View style={st.hero}>
      <Animated.View style={[st.heroScene, parallax]}>
        {slide.visual === "tile" && <TileScene />}
        {slide.visual === "dynamo" && <DynamoScene isActive={isActive} />}
        {slide.visual === "power" && <PowerScene />}
      </Animated.View>
    </View>
  );
}

/* ------------------------------ dots indicator ---------------------------- */

function Dot({ index, scrollX }: { index: number; scrollX: SharedValue<number> }) {
  const style = useAnimatedStyle(() => {
    const t = interpolate(
      scrollX.value / SCREEN_W,
      [index - 1, index, index + 1],
      [0, 1, 0],
      Extrapolation.CLAMP,
    );
    return {
      width: withSpring(6 + t * 16, { damping: 20, stiffness: 260 }),
      backgroundColor: interpolateColor(t, [0, 1], ["rgba(255,255,255,0.4)", "#FFFFFF"]),
    };
  });
  return <Animated.View style={[st.dot, style]} />;
}

function Dots({ scrollX }: { scrollX: SharedValue<number> }) {
  return (
    <View style={st.dotsRow}>
      {SLIDES.map((_, i) => (
        <Dot key={i} index={i} scrollX={scrollX} />
      ))}
    </View>
  );
}

/* ------------------------------- one slide -------------------------------- */

function Slide({
  slide,
  index,
  scrollX,
  isActive,
}: {
  slide: SlideDef;
  index: number;
  scrollX: SharedValue<number>;
  isActive: boolean;
}) {
  const content = useAnimatedStyle(() => ({
    opacity: interpolate(
      scrollX.value,
      [(index - 1) * SCREEN_W, index * SCREEN_W, (index + 1) * SCREEN_W],
      [0, 1, 0],
      Extrapolation.CLAMP,
    ),
    transform: [{ translateX: (scrollX.value - index * SCREEN_W) * 0.28 }],
  }));

  return (
    <View style={{ width: SCREEN_W }}>
      <Visual slide={slide} index={index} scrollX={scrollX} isActive={isActive} />

      <Animated.View style={[content, st.copy]}>
        <Text style={st.title}>{slide.title}</Text>
        <Text style={st.body}>{slide.body}</Text>

        <View style={st.how}>
          <Text style={st.howTitle}>How it works</Text>
          {slide.steps.map((t, n) => (
            <View key={n} style={st.howRow}>
              <View style={st.howBadge}>
                <Text style={st.howBadgeText}>{n + 1}</Text>
              </View>
              <Text style={st.howText}>{t}</Text>
            </View>
          ))}
        </View>
      </Animated.View>
    </View>
  );
}

/* --------------------------- the boarding screen -------------------------- */

export default function OnboardingScreen({ onDone }: { onDone?: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const scrollX = useSharedValue(0);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const [active, setActive] = useState(0);
  const isLast = active === SLIDES.length - 1;

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollX.value = e.contentOffset.x;
    },
  });

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.min(
      SLIDES.length - 1,
      Math.max(0, Math.round(e.nativeEvent.contentOffset.x / SCREEN_W)),
    );
    setActive((prev) => (prev === next ? prev : next));
  };

  const goTo = (i: number) => {
    scrollRef.current?.scrollTo({ x: i * SCREEN_W, animated: true });
  };

  const finish = () => {
    AsyncStorage.setItem(ONBOARDING_SEEN_KEY, "1").catch(() => {});
    if (onDone) onDone();
    else router.replace("/");
  };

  return (
    <View style={st.screen}>
      <ScreenBackdrop />
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        onMomentumScrollEnd={onScroll}
        onScrollEndDrag={onScroll}
        style={st.pager}
      >
        {SLIDES.map((slide, i) => (
          <Slide key={i} slide={slide} index={i} scrollX={scrollX} isActive={i === active} />
        ))}
      </Animated.ScrollView>

      <View style={[st.skipRow, { top: insets.top + scale(8) }]}>
        <AnimatedPressable onPress={finish}>
          <View style={st.skipPill}>
            <Text style={st.skipText}>Skip</Text>
            <Ionicons name="chevron-forward" size={scale(13)} color="#FFFFFF" />
          </View>
        </AnimatedPressable>
      </View>

      <View
        style={[st.dotsOverlay, { top: HERO_H + scale(2) }]}
        pointerEvents="none"
      >
        <Dots scrollX={scrollX} />
      </View>

      <View style={[st.bottom, { paddingBottom: insets.bottom + scale(16) }]}>
        <View style={st.actionsRow}>
          {active > 0 ? (
            <AnimatedPressable style={{ width: scale(54) }} onPress={() => goTo(active - 1)}>
              <View style={st.backButton}>
                <Ionicons name="arrow-back" size={scale(20)} color="#FFFFFF" />
              </View>
            </AnimatedPressable>
          ) : null}

          <AnimatedPressable
            style={{ flex: 1 }}
            onPress={() => (isLast ? finish() : goTo(active + 1))}
          >
            <View style={st.primaryButton}>
              <Text style={st.primaryText}>{isLast ? "Get started" : "Next"}</Text>
              <Ionicons
                name={isLast ? "arrow-forward" : "chevron-forward"}
                size={scale(16)}
                color={ACCENT_DARK}
                style={st.primaryIcon}
              />
            </View>
          </AnimatedPressable>
        </View>
      </View>
    </View>
  );
}

/* --------------------------------- styles --------------------------------- */

const st = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#E2410F" },
  pager: { flex: 1 },

  hero: {
    width: "100%",
    height: HERO_H,
    overflow: "hidden",
  },
  heroScene: {
    ...FILL,
    alignItems: "center",
    justifyContent: "center",
  },
  scene: { width: SCENE_W, height: SCENE_H },
  watermark: {
    position: "absolute",
    top: scale(64),
    left: -SCREEN_W * 0.04,
    width: SCREEN_W * 1.08,
    textAlign: "center",
    color: "rgba(255,255,255,0.09)",
    fontSize: scale(84),
    fontFamily: fonts.extrabold,
    letterSpacing: -2,
  },

  tag: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(8),
    paddingVertical: scale(3),
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.92)",
  },
  tagDot: {
    width: scale(6),
    height: scale(6),
    borderRadius: 99,
    backgroundColor: ACCENT,
    marginRight: scale(5),
  },
  tagText: {
    color: TEXT_PRIMARY,
    fontSize: scale(10.5),
    fontFamily: fonts.bold,
  },

  copy: {
    paddingHorizontal: scale(28),
    paddingTop: scale(24),
    alignItems: "center",
  },
  title: {
    color: "#FFFFFF",
    fontSize: scale(27),
    fontFamily: fonts.extrabold,
    textAlign: "center",
    marginBottom: scale(8),
  },
  body: {
    color: "rgba(255,255,255,0.88)",
    fontSize: scale(13.5),
    lineHeight: scale(20),
    fontFamily: fonts.medium,
    textAlign: "center",
    maxWidth: scale(330),
  },
  how: {
    alignSelf: "stretch",
    marginTop: scale(16),
    paddingVertical: scale(12),
    paddingHorizontal: scale(14),
    borderRadius: scale(20),
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  howTitle: {
    color: "#FFFFFF",
    fontSize: scale(13),
    fontFamily: fonts.extrabold,
    marginBottom: scale(8),
  },
  howRow: { flexDirection: "row", alignItems: "center", marginTop: scale(6) },
  howBadge: {
    width: scale(20),
    height: scale(20),
    borderRadius: 99,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    marginRight: scale(10),
  },
  howBadgeText: { color: ACCENT_DARK, fontSize: scale(11), fontFamily: fonts.extrabold },
  howText: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: scale(12.5),
    lineHeight: scale(17),
    fontFamily: fonts.medium,
  },

  skipRow: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "flex-end",
    paddingHorizontal: scale(20),
    zIndex: 10,
  },
  skipPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: scale(14),
    paddingVertical: scale(7),
    borderRadius: 99,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  skipText: {
    color: "#FFFFFF",
    fontSize: scale(12.5),
    fontFamily: fonts.bold,
    marginRight: scale(2),
  },

  dotsOverlay: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dotsRow: { flexDirection: "row", alignItems: "center", gap: scale(6) },
  dot: { height: scale(6), borderRadius: 99 },

  bottom: { paddingHorizontal: scale(24), paddingTop: scale(10) },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: scale(12) },
  backButton: {
    width: scale(54),
    height: scale(54),
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.5)",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  primaryButton: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 99,
    backgroundColor: "#FFFFFF",
    paddingVertical: scale(17),
    paddingHorizontal: scale(24),
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 6,
  },
  primaryText: { color: ACCENT_DARK, fontSize: scale(15), fontFamily: fonts.extrabold },
  primaryIcon: { marginLeft: scale(6) },
});