import React, { useEffect, useMemo, useRef } from "react";
import { Animated, PanResponder, Pressable, View } from "react-native";
import { Canvas, useFrame, useThree } from "@react-three/fiber/native";
import * as THREE from "three";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "./app-text";
import { getHeatmapTileColor } from "./heatmap-tile-grid";
import { scale } from "./glass-ui";
import { useTheme } from "../theme";

/**
 * Real-3D "hardware link" scene for the Device screen
 * (react-three-fiber + three + expo-gl), built from the same parts and the
 * same look as the tile / rooms / power-supply scene. UI only: no data or
 * backend logic lives here.
 *
 *            tiles  --cable-->  CONTROL BOX  <--cable--  grid
 *                                    ^
 *                                  cable
 *                                    |
 *                                 battery
 *
 *  linked    : cables are live, energy packets travel into the control box
 *  unlinking : each cable is cut in turn (spark, plugs pull apart, gap opens)
 *  unlinked  : all three cables stay cut, parts grey out, red marker on each gap
 *
 * Going back from "unlinking" to "linked" (e.g. the unlink failed) plays the
 * cut in reverse, so the cables visibly reconnect.
 * Drag to orbit 360 degrees, same as the tile scene.
 *
 * World coordinates used by the layout code: x = right, y = toward the
 * camera (front), z = up. They are mapped to three.js as (x, z, y).
 */

export type LinkState = "linked" | "unlinking" | "unlinked";

type Props = {
  state: LinkState;
  online?: boolean;
  restarting?: boolean;
};

/* ------------------------------------------------------------------ */
/* tunables (same values as the tile scene unless noted)               */
/* ------------------------------------------------------------------ */

const SHADOWS = true; // set false on very old phones
const FOV = 30;
const SCENE_ASPECT = 1.5; // width / height of the card
const AMBIENT = 0.92;
const SUN = 0.85;
const ORBIT_SPEED = 0.012;
const ORBIT_DAMPING = 14;
const ORBIT_FRICTION = 0.94;
const MAX_SPIN = 14;
const LABEL_MIN_INTERVAL_MS = 32;

const CUT_SECONDS = 1.5; // time for all three cables to be cut
const RELINK_SECONDS = 0.9; // time to reconnect when the unlink fails
const PULSE_EVERY_MS = 2800; // how often an energy packet is sent while linked
const PULSE_MS = 1500;

const BRAND_ORANGE = "#F5A220";
const GRID_GREEN = "#22C55E";
const SHUTDOWN_RED = "#EF4444";
const IDLE_GREY = "#94A3B8";
const SPARK = "#FDE047";

const SLAB_H = 0.2;
const TILE_H = 0.07;
const MARGIN = 0.16;
const PAD_M = 0.25;
const CABLE_Z = 0.02;
const CABLE_T = 0.05;
const CABLE_W = 0.07;

const START_VIEW = { yaw: 0.5, pitch: 0.82 };

type V3 = [number, number, number];
type V2 = [number, number];

// heat values for the 8 triangular tiles (same colour scale as the heatmap)
const TILE_TRAFFIC = [0.82, 0.4, 0.62, 0.95, 0.3, 0.7, 0.52, 0.88];

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function parseColor(c: string): [number, number, number] | null {
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  const m = c.match(/^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}
const h2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
function toHex(c: string, fallback = BRAND_ORANGE): string {
  const p = parseColor(c);
  return p ? `#${h2(p[0])}${h2(p[1])}${h2(p[2])}` : fallback;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const ramp = (v: number, a: number, b: number) => clamp01((v - a) / (b - a));
const smooth = (t: number) => t * t * (3 - 2 * t);

/** progress of one cable: cuts are staggered so they happen one after another */
const cableProgress = (p: number, delay: number) =>
  smooth(clamp01((p - delay) / (1 - 0.28)));

function cellRC(k: number, rows: number) {
  const box = Math.floor(k / 2);
  return { col: Math.floor(box / rows), row: box % rows, half: k % 2 };
}

/* shared, mutable animation state: written by React, read inside useFrame */
type Sim = {
  p: number; // 0 = linked .. 1 = fully cut
  target: number;
  flowing: boolean;
  restarting: boolean;
  online: boolean;
  burst: number; // start time of the current energy packet
};

/* ------------------------------------------------------------------ */
/* static world layout                                                 */
/* ------------------------------------------------------------------ */

function buildWorld() {
  const cells = TILE_TRAFFIC.length;
  const rows = 2;
  const cols = Math.ceil(Math.ceil(cells / 2) / rows);
  const X = cols + MARGIN * 2;
  const Y = rows + MARGIN * 2;

  const ctrl = { x: X + 1.6, y: 0.6, w: 0.75, d: 0.9, h: 2.0 };
  const midX = ctrl.x + ctrl.w / 2;
  const midY = ctrl.y + ctrl.d / 2;
  const grid = { x: ctrl.x + ctrl.w + 1.6, y: midY - 0.35, w: 0.7, d: 0.7, h: 1.2 };
  const bat = { x: midX - 0.45, y: ctrl.y + ctrl.d + 2.2, w: 0.9, d: 0.8, h: 0.9 };

  const pad = {
    x0: -PAD_M,
    y0: -PAD_M,
    x1: grid.x + grid.w + PAD_M,
    y1: bat.y + bat.d + PAD_M,
  };
  const cx = (pad.x0 + pad.x1) / 2;
  const cy = (pad.y0 + pad.y1) / 2;
  const R = Math.hypot(pad.x1 - pad.x0, pad.y1 - pad.y0) / 2;

  const cables = [
    { key: "tiles", a: [X, midY] as V2, b: [ctrl.x, midY] as V2, live: BRAND_ORANGE, delay: 0, cutAt: 0.5 },
    { key: "battery", a: [midX, bat.y] as V2, b: [midX, ctrl.y + ctrl.d] as V2, live: BRAND_ORANGE, delay: 0.14, cutAt: 0.7 },
    { key: "grid", a: [grid.x, midY] as V2, b: [ctrl.x + ctrl.w, midY] as V2, live: GRID_GREEN, delay: 0.28, cutAt: 0.5 },
  ];

  return { cells, rows, X, Y, ctrl, bat, grid, midX, midY, pad, cx, cy, R, cables };
}
type World = ReturnType<typeof buildWorld>;
const WORLD = buildWorld();

/* ------------------------------------------------------------------ */
/* primitives (identical to the tile scene)                            */
/* ------------------------------------------------------------------ */

type BoxProps = {
  p: V3; // world x, y(front), z(up) of the MIN corner
  s: V3; // world width(x), depth(y), height(z)
  color: string;
  opacity?: number;
  basic?: boolean; // unlit
  cast?: boolean;
  receive?: boolean;
  roughness?: number;
};

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const MATERIALS = new Map<string, THREE.Material>();
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX);
const EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: "#0A2A4A", transparent: true, opacity: 0.2 });
const TILE_EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.5 });
const noRaycast = () => null;

function getBoxMaterial(o: {
  color: string;
  opacity: number;
  basic?: boolean;
  roughness: number;
}): THREE.Material {
  const key = `${o.basic ? "b" : "s"}|${o.color}|${o.opacity}|${o.roughness}`;
  let m = MATERIALS.get(key);
  if (!m) {
    const transparent = o.opacity < 1;
    m = o.basic
      ? new THREE.MeshBasicMaterial({ color: o.color, transparent, opacity: o.opacity, depthWrite: !transparent })
      : new THREE.MeshStandardMaterial({
          color: o.color,
          roughness: o.roughness,
          metalness: 0.05,
          transparent,
          opacity: o.opacity,
          depthWrite: !transparent,
        });
    MATERIALS.set(key, m);
  }
  return m;
}

function sameBoxProps(a: BoxProps, b: BoxProps) {
  return (
    a.p[0] === b.p[0] && a.p[1] === b.p[1] && a.p[2] === b.p[2] &&
    a.s[0] === b.s[0] && a.s[1] === b.s[1] && a.s[2] === b.s[2] &&
    a.color === b.color && a.opacity === b.opacity && a.basic === b.basic &&
    a.cast === b.cast && a.receive === b.receive && a.roughness === b.roughness
  );
}

const Box = React.memo(function Box({
  p,
  s,
  color,
  opacity = 1,
  basic,
  cast = true,
  receive = true,
  roughness = 0.75,
}: BoxProps) {
  const material = getBoxMaterial({ color, opacity, basic, roughness });
  return (
    <mesh
      geometry={UNIT_BOX}
      material={material}
      position={[p[0] + s[0] / 2, p[2] + s[2] / 2, p[1] + s[1] / 2]}
      scale={[s[0], s[2], s[1]]}
      castShadow={SHADOWS && cast && opacity >= 1}
      receiveShadow={SHADOWS && receive && opacity >= 1}
    >
      {opacity >= 1 && !basic && Math.min(s[0], s[1], s[2]) >= 0.05 && (
        <lineSegments geometry={UNIT_EDGES} material={EDGE_MATERIAL} raycast={noRaycast} />
      )}
    </mesh>
  );
}, sameBoxProps);

/** a colour that fades from `live` to `idle` as its cable gets cut */
function useLerpColor(
  ref: React.RefObject<any>,
  live: string,
  idle: string,
  sim: Sim,
  delay: number,
  emissive = false,
) {
  const liveC = useMemo(() => new THREE.Color(live), [live]);
  const idleC = useMemo(() => new THREE.Color(idle), [idle]);
  useFrame(() => {
    const m = ref.current;
    if (!m) return;
    m.color.copy(liveC).lerp(idleC, cableProgress(sim.p, delay));
    if (emissive && m.emissive) m.emissive.copy(m.color);
  });
}

/** box whose colour follows a cable (unlit by default, like the tile scene's accents) */
function LiveBox({
  p,
  s,
  live,
  idle = IDLE_GREY,
  delay,
  sim,
}: {
  p: V3;
  s: V3;
  live: string;
  idle?: string;
  delay: number;
  sim: Sim;
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useLerpColor(mat, live, idle, sim, delay);
  return (
    <mesh
      geometry={UNIT_BOX}
      position={[p[0] + s[0] / 2, p[2] + s[2] / 2, p[1] + s[1] / 2]}
      scale={[s[0], s[2], s[1]]}
    >
      <meshBasicMaterial ref={mat} color={live} />
    </mesh>
  );
}

function LiveSphere({
  position,
  r,
  live,
  delay,
  sim,
}: {
  position: V3;
  r: number;
  live: string;
  delay: number;
  sim: Sim;
}) {
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  useLerpColor(mat, live, IDLE_GREY, sim, delay);
  return (
    <mesh position={position}>
      <sphereGeometry args={[r, 10, 10]} />
      <meshBasicMaterial ref={mat} color={live} />
    </mesh>
  );
}

function DashedPad({ rect, color }: { rect: { x0: number; y0: number; x1: number; y1: number }; color: string }) {
  const obj = useMemo(() => {
    const pts = [
      new THREE.Vector3(rect.x0, 0.01, rect.y0),
      new THREE.Vector3(rect.x1, 0.01, rect.y0),
      new THREE.Vector3(rect.x1, 0.01, rect.y1),
      new THREE.Vector3(rect.x0, 0.01, rect.y1),
    ];
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.1, transparent: true, opacity: 0.6 });
    const l = new THREE.LineLoop(g, m);
    l.computeLineDistances();
    return l;
  }, [rect.x0, rect.y0, rect.x1, rect.y1, color]);
  return (
    <>
      <primitive object={obj} />
      <Box
        p={[rect.x0, rect.y0, 0.002]}
        s={[rect.x1 - rect.x0, rect.y1 - rect.y0, 0.004]}
        color={color}
        opacity={0.07}
        basic
        cast={false}
        receive={false}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* tiles                                                               */
/* ------------------------------------------------------------------ */

function TileTri({ k, rows, traffic, sim }: { k: number; rows: number; traffic: number; sim: Sim }) {
  const { col, row, half } = cellRC(k, rows);
  const geometry = useMemo(() => {
    const bx = MARGIN + col;
    const by = MARGIN + row;
    const base: V2[] =
      half === 0
        ? [[bx, by], [bx + 1, by], [bx, by + 1]]
        : [[bx + 1, by], [bx + 1, by + 1], [bx, by + 1]];
    const cx0 = (base[0][0] + base[1][0] + base[2][0]) / 3;
    const cy0 = (base[0][1] + base[1][1] + base[2][1]) / 3;
    const tri = base.map(([x, y]) => [cx0 + (x - cx0) * 0.92, cy0 + (y - cy0) * 0.92]);
    const shape = new THREE.Shape();
    shape.moveTo(tri[0][0], -tri[0][1]);
    shape.lineTo(tri[1][0], -tri[1][1]);
    shape.lineTo(tri[2][0], -tri[2][1]);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: TILE_H, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    return g;
  }, [col, row, half]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const outline = useMemo(() => new THREE.EdgesGeometry(geometry, 30), [geometry]);
  useEffect(() => () => outline.dispose(), [outline]);

  const color = useMemo(() => toHex(getHeatmapTileColor(traffic)), [traffic]);
  const mat = useRef<THREE.MeshStandardMaterial>(null);
  useLerpColor(mat, color, IDLE_GREY, sim, 0, true);

  return (
    <mesh geometry={geometry} position={[0, SLAB_H, 0]} castShadow={SHADOWS} receiveShadow={SHADOWS}>
      <meshStandardMaterial
        ref={mat}
        color={color}
        roughness={0.38}
        metalness={0.12}
        side={THREE.DoubleSide}
        emissive={color}
        emissiveIntensity={0.14}
      />
      <lineSegments geometry={outline} material={TILE_EDGE_MATERIAL} raycast={noRaycast} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* equipment (same parts as the tile scene)                            */
/* ------------------------------------------------------------------ */

function ControlBox({ w, sim }: { w: World; sim: Sim }) {
  const { ctrl } = w;
  const yf = ctrl.y + ctrl.d;
  const fz = 0.012;
  const bar = useRef<THREE.MeshBasicMaterial>(null);
  const led = useRef<THREE.MeshStandardMaterial>(null);
  const redLed = useRef<THREE.MeshStandardMaterial>(null);
  const barLive = useMemo(() => new THREE.Color(BRAND_ORANGE), []);
  const barIdle = useMemo(() => new THREE.Color("#475569"), []);
  const ledLive = useMemo(() => new THREE.Color("#38BDF8"), []);
  const ledIdle = useMemo(() => new THREE.Color("#475569"), []);
  const redOff = useMemo(() => new THREE.Color("#3A4150"), []);
  const redOn = useMemo(() => new THREE.Color(SHUTDOWN_RED), []);

  useFrame(() => {
    const t = ramp(sim.p, 0.2, 1);
    if (bar.current) bar.current.color.copy(barLive).lerp(barIdle, t);
    if (led.current) {
      led.current.color.copy(ledLive).lerp(ledIdle, t);
      led.current.emissive.copy(led.current.color);
      // the blue lamp blinks while the hub restarts
      const blink = sim.restarting ? 0.2 + 0.8 * (0.5 + 0.5 * Math.sin(performance.now() / 120)) : 1;
      led.current.emissiveIntensity = (0.3 + 0.9 * (1 - t)) * blink;
    }
    if (redLed.current) {
      redLed.current.color.copy(redOff).lerp(redOn, t);
      redLed.current.emissive.copy(redLed.current.color);
      redLed.current.emissiveIntensity = t * 1.6;
    }
  });

  const front = (x0: number, x1: number, z0: number, z1: number, color: string, extra?: Partial<BoxProps>) => (
    <Box p={[x0, yf, z0]} s={[x1 - x0, fz, z1 - z0]} color={color} cast={false} {...extra} />
  );
  return (
    <group>
      <Box p={[ctrl.x, ctrl.y, 0]} s={[ctrl.w, ctrl.d, ctrl.h]} color="#E3E6EC" />
      {front(ctrl.x + 0.1, ctrl.x + ctrl.w - 0.1, 0.15, ctrl.h - 0.15, "#D3D7DF")}
      {front(ctrl.x + 0.17, ctrl.x + ctrl.w - 0.17, ctrl.h - 0.75, ctrl.h - 0.5, "#1F2430")}
      <mesh
        geometry={UNIT_BOX}
        position={[ctrl.x + 0.22 + (ctrl.w - 0.52) / 2, ctrl.h - 0.625, yf + 0.006]}
        scale={[ctrl.w - 0.52, 0.09, 0.012]}
      >
        <meshBasicMaterial ref={bar} color={BRAND_ORANGE} />
      </mesh>
      <mesh position={[ctrl.x + 0.22, ctrl.h - 0.95, yf + 0.015]}>
        <boxGeometry args={[0.1, 0.1, 0.02]} />
        <meshStandardMaterial ref={led} color="#38BDF8" emissive="#38BDF8" emissiveIntensity={0.3} />
      </mesh>
      <mesh position={[ctrl.x + 0.22, ctrl.h - 1.12, yf + 0.015]}>
        <boxGeometry args={[0.1, 0.1, 0.02]} />
        <meshStandardMaterial ref={redLed} color="#3A4150" emissive="#3A4150" emissiveIntensity={0} />
      </mesh>
      {front(ctrl.x + ctrl.w - 0.22, ctrl.x + ctrl.w - 0.18, ctrl.h * 0.3, ctrl.h * 0.42, "#8A93A3")}
    </group>
  );
}

function Battery({ w, sim }: { w: World; sim: Sim }) {
  const { bat } = w;
  const yf = bat.y + bat.d;
  const sx0 = bat.x + 0.12;
  const sx1 = bat.x + bat.w - 0.12;
  const segW = (sx1 - sx0) / 5;
  const filled = 4;
  return (
    <group>
      <Box p={[bat.x, bat.y, 0]} s={[bat.w, bat.d, bat.h]} color="#E3E6EC" />
      <Box p={[sx0, yf, 0.22]} s={[sx1 - sx0, 0.012, bat.h - 0.44]} color="#1F2430" cast={false} />
      {Array.from({ length: 5 }, (_, i) =>
        i < filled ? (
          <LiveBox
            key={i}
            p={[sx0 + i * segW + 0.03, yf + 0.005, 0.27]}
            s={[segW - 0.06, 0.012, bat.h - 0.54]}
            live={BRAND_ORANGE}
            delay={0.14}
            sim={sim}
          />
        ) : (
          <Box
            key={i}
            p={[sx0 + i * segW + 0.03, yf + 0.005, 0.27]}
            s={[segW - 0.06, 0.012, bat.h - 0.54]}
            color="#3A4150"
            basic
            cast={false}
          />
        ),
      )}
    </group>
  );
}

function GridUnit({ w, sim }: { w: World; sim: Sim }) {
  const { grid } = w;
  const yf = grid.y + grid.d;
  const px = grid.x + grid.w / 2;
  const py = grid.y + grid.d / 2;
  const top = grid.h;
  const fz = 0.012;
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    if (glow.current) glow.current.opacity = 0.1 * (1 - cableProgress(sim.p, 0.28));
  });
  const d = 0.28;
  return (
    <group>
      <Box p={[grid.x, grid.y, 0]} s={[grid.w, grid.d, grid.h]} color="#CBD5E1" />
      <LiveBox p={[grid.x, yf, grid.h - 0.28]} s={[grid.w, fz, 0.2]} live={GRID_GREEN} delay={d} sim={sim} />
      <Box p={[grid.x + 0.12, yf, 0.2]} s={[grid.w - 0.24, fz, grid.h - 0.6]} color="#1F2430" cast={false} />
      <LiveBox p={[grid.x + 0.2, yf + 0.005, grid.h - 0.62]} s={[0.1, fz, 0.1]} live={GRID_GREEN} delay={d} sim={sim} />
      <LiveBox p={[grid.x + 0.2, yf + 0.005, 0.3]} s={[grid.w - 0.4, fz, 0.08]} live={GRID_GREEN} delay={d} sim={sim} />
      {/* pylon */}
      <Box p={[px - 0.02, py - 0.02, top]} s={[0.04, 0.04, 0.9]} color="#64748B" />
      <Box p={[px - 0.3, py - 0.015, top + 0.68]} s={[0.6, 0.03, 0.03]} color="#64748B" />
      <Box p={[px - 0.22, py - 0.015, top + 0.43]} s={[0.44, 0.03, 0.03]} color="#64748B" />
      {[-0.3, 0.3].map((dx) => (
        <LiveSphere key={dx} position={[px + dx, top + 0.6, py]} r={0.05} live={GRID_GREEN} delay={d} sim={sim} />
      ))}
      <LiveSphere position={[px, top + 0.92, py]} r={0.05} live={GRID_GREEN} delay={d} sim={sim} />
      <mesh position={[px, grid.h / 2, py]}>
        <sphereGeometry args={[0.8, 16, 16]} />
        <meshBasicMaterial ref={glow} color={GRID_GREEN} transparent opacity={0.1} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* the cable that gets cut                                             */
/* ------------------------------------------------------------------ */

const SPARK_DIRS: V3[] = Array.from({ length: 9 }, (_, k) => {
  const a = (k / 9) * Math.PI * 2 + 0.3;
  return [Math.cos(a), 0.5 + 0.5 * Math.abs(Math.sin(k * 1.9)), Math.sin(a)];
});

function CutCable({
  a,
  b,
  live,
  delay,
  cutAt,
  sim,
}: {
  a: V2;
  b: V2;
  live: string;
  delay: number;
  cutAt: number;
  sim: Sim;
}) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const dx = (b[0] - a[0]) / L;
  const dy = (b[1] - a[1]) / L;
  const horizontal = Math.abs(dx) > 0.5;
  const gapMax = Math.min(0.9, L * 0.45);

  const liveC = useMemo(() => new THREE.Color(live), [live]);
  const idleC = useMemo(() => new THREE.Color(IDLE_GREY), []);
  const wireMat = useMemo(() => new THREE.MeshBasicMaterial({ color: live, transparent: true }), [live]);
  const ghostMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: IDLE_GREY, transparent: true, opacity: 0, depthWrite: false }),
    [],
  );
  useEffect(
    () => () => {
      wireMat.dispose();
      ghostMat.dispose();
    },
    [wireMat, ghostMat],
  );

  const half1 = useRef<THREE.Mesh>(null);
  const half2 = useRef<THREE.Mesh>(null);
  const ghost = useRef<THREE.Mesh>(null);
  const plug1 = useRef<THREE.Mesh>(null);
  const plug2 = useRef<THREE.Mesh>(null);
  const sparks = useRef<THREE.Group>(null);
  const sparkMat = useRef<THREE.MeshBasicMaterial>(null);
  const flash = useRef<THREE.Mesh>(null);
  const flashMat = useRef<THREE.MeshBasicMaterial>(null);
  const marker = useRef<THREE.Group>(null);
  const dots = useRef<(THREE.Mesh | null)[]>([]);

  const at = (s: number): [number, number] => [a[0] + dx * s, a[1] + dy * s];

  useFrame(({ camera }) => {
    const lp = cableProgress(sim.p, delay);
    const s = L * cutAt;
    const gap = gapMax * lp;
    const e1 = s - gap / 2;
    const e2 = s + gap / 2;

    const place = (m: THREE.Mesh | null, s0: number, s1: number, h = CABLE_T, w = CABLE_W) => {
      if (!m) return;
      const len = s1 - s0;
      if (len < 0.002) {
        m.visible = false;
        return;
      }
      const [px, py] = at((s0 + s1) / 2);
      m.visible = true;
      m.position.set(px, CABLE_Z + h / 2, py);
      m.scale.set(horizontal ? len : w, h, horizontal ? w : len);
    };
    place(half1.current, 0, e1);
    place(half2.current, e2, L);
    place(ghost.current, e1, e2, 0.02, CABLE_W);

    // plugs on both cut ends (they overlap into one coupling while linked)
    [[plug1.current, e1], [plug2.current, e2]].forEach(([m, e]) => {
      const mesh = m as THREE.Mesh | null;
      if (!mesh) return;
      const [px, py] = at(e as number);
      mesh.position.set(px, CABLE_Z + 0.06, py);
      mesh.scale.set(horizontal ? 0.16 : 0.12, 0.12, horizontal ? 0.12 : 0.16);
    });

    wireMat.color.copy(liveC).lerp(idleC, lp);
    wireMat.opacity = (sim.online || sim.target === 1 ? 1 : 0.55) * (1 - 0.35 * lp);
    ghostMat.opacity = 0.35 * ramp(lp, 0.3, 0.7);

    // spark burst while the cable is being cut
    const burstT = Math.sin(Math.PI * ramp(lp, 0, 0.5));
    const [mx, my] = at(s);
    if (sparks.current) {
      sparks.current.visible = burstT > 0.02;
      sparks.current.position.set(mx, 0.14, my);
      const r = 0.06 + 0.4 * burstT;
      sparks.current.children.forEach((c, i) => {
        c.position.set(SPARK_DIRS[i][0] * r, SPARK_DIRS[i][1] * r, SPARK_DIRS[i][2] * r);
      });
      if (sparkMat.current) sparkMat.current.opacity = burstT;
    }
    if (flash.current && flashMat.current) {
      flash.current.visible = burstT > 0.02;
      flash.current.position.set(mx, 0.14, my);
      flash.current.scale.setScalar(0.6 + burstT);
      flashMat.current.opacity = 0.5 * burstT;
    }

    // broken-link marker: faces the camera, pops in once the cable is cut
    if (marker.current) {
      const k = ramp(lp, 0.8, 1);
      marker.current.visible = k > 0.02;
      marker.current.position.set(mx, 0.62, my);
      marker.current.quaternion.copy(camera.quaternion);
      marker.current.scale.setScalar(0.4 + 0.6 * k);
    }

    // energy packet travelling into the control box
    const since = performance.now() - sim.burst;
    dots.current.forEach((m, i) => {
      if (!m) return;
      const t = (since - i * 160) / 1100;
      if (!sim.flowing || lp > 0.001 || t <= 0 || t >= 1) {
        m.visible = false;
        return;
      }
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      const [px, py] = at(L * e);
      m.visible = true;
      m.position.set(px, 0.12, py);
    });
  });

  return (
    <group>
      <mesh ref={half1} geometry={UNIT_BOX} material={wireMat} raycast={noRaycast} />
      <mesh ref={half2} geometry={UNIT_BOX} material={wireMat} raycast={noRaycast} />
      <mesh ref={ghost} geometry={UNIT_BOX} material={ghostMat} raycast={noRaycast} />
      {[plug1, plug2].map((r, i) => (
        <mesh key={i} ref={r} geometry={UNIT_BOX} castShadow={SHADOWS} raycast={noRaycast}>
          <meshStandardMaterial color="#CBD5E1" roughness={0.4} metalness={0.4} />
        </mesh>
      ))}

      <group ref={sparks} visible={false}>
        {SPARK_DIRS.map((_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.035, 8, 8]} />
            <meshBasicMaterial
              ref={i === 0 ? sparkMat : undefined}
              color={SPARK}
              transparent
              depthWrite={false}
            />
          </mesh>
        ))}
      </group>
      <mesh ref={flash} visible={false}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial ref={flashMat} color={SPARK} transparent opacity={0} depthWrite={false} />
      </mesh>

      <group ref={marker} visible={false} renderOrder={10}>
        <mesh renderOrder={10}>
          <circleGeometry args={[0.15, 20]} />
          <meshBasicMaterial color={SHUTDOWN_RED} depthTest={false} />
        </mesh>
        {[Math.PI / 4, -Math.PI / 4].map((rot) => (
          <mesh key={rot} rotation={[0, 0, rot]} position={[0, 0, 0.002]} renderOrder={11}>
            <planeGeometry args={[0.2, 0.038]} />
            <meshBasicMaterial color="#FFFFFF" depthTest={false} />
          </mesh>
        ))}
      </group>

      {[0, 1].map((i) => (
        <mesh key={i} ref={(m) => { dots.current[i] = m; }} visible={false}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshBasicMaterial color="#FFE2A8" />
          <mesh>
            <sphereGeometry args={[0.15, 12, 12]} />
            <meshBasicMaterial color={live} transparent opacity={0.35} depthWrite={false} />
          </mesh>
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* animation driver (the only thing that decides when to render)       */
/* ------------------------------------------------------------------ */

function Driver({ sim }: { sim: Sim }) {
  const { invalidate } = useThree();

  // a new energy packet every few seconds while the hub is linked and online
  useEffect(() => {
    const fire = () => {
      if (sim.flowing) {
        sim.burst = performance.now();
        invalidate();
      }
    };
    fire();
    const id = setInterval(fire, PULSE_EVERY_MS);
    return () => clearInterval(id);
  }, [sim, invalidate]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    if (sim.p !== sim.target) {
      const up = sim.target > sim.p;
      const step = dt / (up ? CUT_SECONDS : RELINK_SECONDS);
      sim.p = up ? Math.min(sim.target, sim.p + step) : Math.max(sim.target, sim.p - step);
    }
    const bursting = performance.now() - sim.burst < PULSE_MS;
    if (sim.p !== sim.target || sim.restarting || (sim.flowing && bursting)) invalidate();
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* camera + labels (same as the tile scene)                            */
/* ------------------------------------------------------------------ */

type ViewState = {
  yaw: number;
  pitch: number;
  tYaw: number;
  tPitch: number;
  vel: number;
  dragging: boolean;
};
type Label = { id: string; text: string; color?: string; pos: V3 };
type LabelAnim = { x: Animated.Value; y: Animated.Value; o: Animated.Value };
const LABEL_W = 150;

function Bridge({ inv }: { inv: React.MutableRefObject<(() => void) | null> }) {
  const { invalidate } = useThree();
  inv.current = invalidate;
  return null;
}

function CameraRig({ view, cx, cy, R }: { view: React.MutableRefObject<ViewState>; cx: number; cy: number; R: number }) {
  const { camera, size, invalidate, gl } = useThree();
  const target = useMemo(() => new THREE.Vector3(cx, 0.45, cy), [cx, cy]);
  const dist = useMemo(() => {
    const t = Math.tan((FOV * Math.PI) / 360);
    const aspect = size.width && size.height ? size.width / size.height : SCENE_ASPECT;
    const dH = R / (t * aspect);
    const dV = (R * 0.68 + 1.2) / t;
    return Math.max(dH, dV) * 1.04;
  }, [R, size.width, size.height]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const v = view.current;
    let moving = v.dragging;

    if (!v.dragging && Math.abs(v.vel) > 0.02) {
      v.tYaw += v.vel * dt;
      v.vel *= Math.pow(ORBIT_FRICTION, dt * 60);
      moving = true;
    } else if (!v.dragging) v.vel = 0;

    const k = 1 - Math.exp(-dt * ORBIT_DAMPING);
    const dYaw = v.tYaw - v.yaw;
    const dPitch = v.tPitch - v.pitch;
    if (Math.abs(dYaw) > 0.0004 || Math.abs(dPitch) > 0.0004) {
      v.yaw += dYaw * k;
      v.pitch += dPitch * k;
      moving = true;
    } else {
      v.yaw = v.tYaw;
      v.pitch = v.tPitch;
    }

    const cp = Math.cos(v.pitch);
    camera.position.set(
      target.x + dist * cp * Math.sin(v.yaw),
      target.y + dist * Math.sin(v.pitch),
      target.z + dist * cp * Math.cos(v.yaw),
    );
    camera.lookAt(target);

    gl.shadowMap.needsUpdate = !moving;
    if (moving) invalidate();
  });
  useEffect(() => {
    invalidate();
  }, [size.width, size.height, invalidate]);
  return null;
}

function LabelProjector({
  labels,
  anims,
  view,
}: {
  labels: Label[];
  anims: LabelAnim[];
  view: React.MutableRefObject<ViewState>;
}) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  const lastXY = useRef<number[]>([]);
  const lastO = useRef<number[]>([]);
  const lastAt = useRef(0);
  useFrame(() => {
    const vs = view.current;
    const busy =
      vs.dragging ||
      Math.abs(vs.vel) > 0.02 ||
      Math.abs(vs.tYaw - vs.yaw) > 0.0004 ||
      Math.abs(vs.tPitch - vs.pitch) > 0.0004;
    const now = performance.now();
    if (busy && now - lastAt.current < LABEL_MIN_INTERVAL_MS) return;
    lastAt.current = now;

    camera.updateMatrixWorld();
    labels.forEach((l, i) => {
      const a = anims[i];
      if (!a) return;
      v.set(l.pos[0], l.pos[2], l.pos[1]).project(camera);
      const o = v.z > 1 ? 0 : 1;
      if (lastO.current[i] !== o) {
        lastO.current[i] = o;
        a.o.setValue(o);
      }
      if (o === 0) return;
      const x = (v.x * 0.5 + 0.5) * size.width - LABEL_W / 2;
      const y = (-v.y * 0.5 + 0.5) * size.height - scale(10);
      const lx = lastXY.current[i * 2];
      const ly = lastXY.current[i * 2 + 1];
      if (lx === undefined || Math.abs(lx - x) > 0.4 || Math.abs(ly - y) > 0.4) {
        lastXY.current[i * 2] = x;
        lastXY.current[i * 2 + 1] = y;
        a.x.setValue(x);
        a.y.setValue(y);
      }
    });
  });
  return null;
}

function Sun({ cx, cy, R }: { cx: number; cy: number; R: number }) {
  const ref = useRef<THREE.DirectionalLight>(null);
  return (
    <>
      <directionalLight
        ref={ref}
        position={[cx + R * 0.7, R * 1.7, cy + R * 0.9]}
        intensity={SUN}
        castShadow={SHADOWS}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-R - 1}
        shadow-camera-right={R + 1}
        shadow-camera-top={R + 1}
        shadow-camera-bottom={-R - 1}
        shadow-camera-near={0.5}
        shadow-camera-far={R * 5}
        shadow-bias={-0.0006}
      />
      <object3D
        position={[cx, 0, cy]}
        ref={(t: THREE.Object3D | null) => {
          if (t && ref.current) ref.current.target = t;
        }}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* scene graph                                                         */
/* ------------------------------------------------------------------ */

type SceneProps = {
  dark: boolean;
  sim: Sim;
  view: React.MutableRefObject<ViewState>;
  inv: React.MutableRefObject<(() => void) | null>;
  labels: Label[];
  labelAnims: LabelAnim[];
};

function SceneContents({ dark, sim, view, inv, labels, labelAnims }: SceneProps) {
  const w = WORLD;
  const { X, Y, pad, cx, cy, R, rows, cables } = w;
  const padColor = dark ? "#FFFFFF" : "#0A2A4A";

  return (
    <>
      <Bridge inv={inv} />
      <Driver sim={sim} />
      <CameraRig view={view} cx={cx} cy={cy} R={R} />
      <ambientLight intensity={AMBIENT} />
      <hemisphereLight args={["#FFFFFF", "#B8C2D0", 0.35]} />
      <Sun cx={cx} cy={cy} R={R} />

      {/* ground shadow catcher */}
      {SHADOWS && (
        <mesh position={[cx, -0.003, cy]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[R * 3, R * 3]} />
          <shadowMaterial opacity={dark ? 0.45 : 0.18} />
        </mesh>
      )}

      <DashedPad rect={pad} color={padColor} />

      {/* the three cables into the control box */}
      {cables.map((c) => (
        <CutCable key={c.key} a={c.a} b={c.b} live={c.live} delay={c.delay} cutAt={c.cutAt} sim={sim} />
      ))}

      {/* floor slab + triangular tiles */}
      <Box p={[0, 0, 0]} s={[X, Y, SLAB_H]} color={dark ? "#E6E8EE" : "#FFFFFF"} roughness={0.5} />
      {TILE_TRAFFIC.map((t, k) => (
        <TileTri key={k} k={k} rows={rows} traffic={t} sim={sim} />
      ))}

      <ControlBox w={w} sim={sim} />
      <Battery w={w} sim={sim} />
      <GridUnit w={w} sim={sim} />

      <LabelProjector labels={labels} anims={labelAnims} view={view} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */

export function DeviceLinkScene({ state, online = true, restarting = false }: Props) {
  const { colors: c } = useTheme();
  const surface = parseColor(c.surface) ?? [255, 255, 255];
  const dark = (0.299 * surface[0] + 0.587 * surface[1] + 0.114 * surface[2]) / 255 < 0.4;

  /* ---- shared animation state (refs only: frames never re-render React) ---- */
  const initial = state === "unlinked" ? 1 : 0;
  const sim = useRef<Sim>({
    p: initial,
    target: initial,
    flowing: false,
    restarting: false,
    online: true,
    burst: 0,
  }).current;
  sim.target = state === "linked" ? 0 : 1;
  sim.flowing = state === "linked" && online && !restarting;
  sim.restarting = restarting;
  sim.online = online;

  const inv = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (sim.flowing) sim.burst = performance.now();
    inv.current?.();
  }, [state, online, restarting, sim]);

  /* ---- camera orbit (refs only: dragging never re-renders React) ---- */
  const view = useRef<ViewState>({
    ...START_VIEW,
    tYaw: START_VIEW.yaw,
    tPitch: START_VIEW.pitch,
    vel: 0,
    dragging: false,
  });
  const startView = useRef({ yaw: 0, pitch: 0 });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        const v = view.current;
        v.dragging = true;
        v.vel = 0;
        startView.current = { yaw: v.tYaw, pitch: v.tPitch };
      },
      onPanResponderMove: (_, g) => {
        const v = view.current;
        v.tYaw = startView.current.yaw - g.dx * ORBIT_SPEED;
        v.tPitch = Math.min(1.2, Math.max(0.4, startView.current.pitch + g.dy * 0.004));
        inv.current?.();
      },
      onPanResponderRelease: (_, g) => {
        const v = view.current;
        v.dragging = false;
        v.vel = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, -g.vx * 1000 * ORBIT_SPEED));
        inv.current?.();
      },
      onPanResponderTerminate: () => {
        view.current.dragging = false;
        inv.current?.();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  /* ---- name labels (RN overlay, positioned from the 3D anchors) ---- */
  const ink = dark ? "#FFFFFF" : "#0A2A4A";
  const hintColor = dark ? "rgba(255,255,255,0.55)" : "rgba(10,42,74,0.55)";
  const { X, Y, ctrl, bat, grid } = WORLD;
  const isCut = state === "unlinked";
  const labels: Label[] = [
    { id: "tiles", text: "TILES", pos: [X / 2, Y / 2, 0.55] },
    {
      id: "ctrl",
      text: isCut ? "CONTROL BOX · NOT LINKED" : "CONTROL BOX",
      color: isCut ? SHUTDOWN_RED : undefined,
      pos: [ctrl.x + ctrl.w / 2, ctrl.y + ctrl.d / 2, ctrl.h + 0.2],
    },
    { id: "bat", text: "BATTERY", pos: [bat.x + bat.w / 2, bat.y + bat.d / 2, bat.h + 0.2] },
    { id: "grid", text: "GRID", pos: [grid.x + grid.w / 2, grid.y + grid.d / 2, grid.h + 1.15] },
  ];
  const labelAnims = useRef<LabelAnim[]>([]);
  while (labelAnims.current.length < labels.length) {
    labelAnims.current.push({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      o: new Animated.Value(0),
    });
  }

  /* ---- status chip (same style as the tile scene's supplier chip) ---- */
  const chipColor =
    state === "unlinked" ? SHUTDOWN_RED : state === "unlinking" ? BRAND_ORANGE : online ? GRID_GREEN : BRAND_ORANGE;
  const chipText =
    state === "unlinked"
      ? "DISCONNECTED · hardware cut from control box"
      : state === "unlinking"
        ? "Cutting links to the control box..."
        : restarting
          ? "Restarting hub..."
          : online
            ? "Linked to the control box"
            : "Linked · waiting for the hub";
  const chipDetail =
    state === "unlinked" ? "Tiles · battery · grid" : state === "unlinking" ? "" : "Tiles · battery · grid";

  return (
    <View style={{ width: "100%", aspectRatio: SCENE_ASPECT }} {...pan.panHandlers}>
      <Canvas
        frameloop="demand"
        shadows={SHADOWS}
        camera={{ fov: FOV, near: 0.1, far: 120, position: [WORLD.cx + 8, 8, WORLD.cy + 8] }}
        style={{ flex: 1 }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.shadowMap.autoUpdate = false;
          gl.shadowMap.needsUpdate = true;
        }}
      >
        <SceneContents
          dark={dark}
          sim={sim}
          view={view}
          inv={inv}
          labels={labels}
          labelAnims={labelAnims.current}
        />
      </Canvas>

      {/* box names */}
      {labels.map((l, i) => {
        const a = labelAnims.current[i];
        return (
          <Animated.View
            key={l.id}
            pointerEvents="none"
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: LABEL_W,
              alignItems: "center",
              opacity: a.o,
              transform: [{ translateX: a.x }, { translateY: a.y }],
            }}
          >
            <Text style={{ fontSize: scale(6.5), fontWeight: "700", color: l.color ?? ink }}>
              {l.text}
            </Text>
          </Animated.View>
        );
      })}

      {/* link status */}
      <View pointerEvents="none" style={{ position: "absolute", left: scale(2), top: scale(2) }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: scale(6),
            paddingVertical: scale(3),
            borderRadius: scale(10),
            backgroundColor: dark ? "rgba(255,255,255,0.1)" : "rgba(10,42,74,0.07)",
            alignSelf: "flex-start",
          }}
        >
          <View
            style={{
              width: scale(6),
              height: scale(6),
              borderRadius: scale(3),
              marginRight: scale(4),
              backgroundColor: chipColor,
            }}
          />
          <Text
            style={{
              fontSize: scale(7),
              fontWeight: state === "unlinked" ? "700" : undefined,
              color: state === "unlinked" ? SHUTDOWN_RED : ink,
            }}
          >
            {chipText}
          </Text>
        </View>
        {chipDetail ? (
          <Text style={{ fontSize: scale(6), color: hintColor, marginLeft: scale(6), marginTop: scale(2) }}>
            {chipDetail}
          </Text>
        ) : null}
      </View>

      <Text
        pointerEvents="none"
        style={{ position: "absolute", left: scale(2), bottom: 0, fontSize: scale(6.5), color: hintColor }}
      >
        Drag to rotate 360°
      </Text>
      <Pressable
        onPress={() => {
          const v = view.current;
          const turn = Math.PI * 2;
          const turns = Math.round((v.tYaw - START_VIEW.yaw) / turn);
          v.tYaw = START_VIEW.yaw + turns * turn;
          v.tPitch = START_VIEW.pitch;
          v.vel = 0;
          inv.current?.();
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Reset view"
        style={{ position: "absolute", right: scale(2), top: scale(2) }}
      >
        <Ionicons name="refresh" size={scale(13)} color={hintColor} />
      </Pressable>
    </View>
  );
}