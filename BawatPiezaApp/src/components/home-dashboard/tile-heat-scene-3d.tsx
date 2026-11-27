import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Canvas, useFrame, useThree } from "@react-three/fiber/native";
import * as THREE from "three";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "../app-text";
import { getHeatmapTileColor } from "../heatmap-tile-grid";
import { scale } from "../glass-ui";
import type { Mode } from "../../theme";

/**
 * Real-3D version of the tile / rooms / power-supply sandbox
 * (react-three-fiber + three + expo-gl). Same props as the old SVG scene.
 *
 *  BACK  zone : triangular tiles, control box, battery, utility grid
 *  FRONT zone : one furnished room per connected zone, CEILING bulb that
 *               really lights the room (point light) while the zone is ON
 *  Drag to orbit 360 degrees (GPU rendered, no React re-render per frame),
 *  tap a tile to simulate a footstep.
 *
 * World coordinates used by the layout code: x = right, y = toward the
 * camera (front), z = up. They are mapped to three.js as (x, z, y).
 */

/* ------------------------------------------------------------------ */
/* tunables                                                            */
/* ------------------------------------------------------------------ */

const SHADOWS = true; // set false on very old phones
const FOV = 30;
const SCENE_ASPECT = 1.3; // width / height of the card
const FIT = 0.82; // <1 = scene a bit bigger (may kiss the edge on diagonals)
const BULB_INTENSITY = 2.4; // point-light strength (tune for your three version)
const AMBIENT = 0.92;
const SUN = 0.85;
const ORBIT_SPEED = 0.012; // rad per dragged px (~520 px = one full 360 turn)
const ORBIT_DAMPING = 14; // higher = camera follows the finger tighter
const ORBIT_FRICTION = 0.94; // inertia decay per 60fps frame (flick to spin)
const MAX_SPIN = 14; // rad/s cap for flicks
const MAX_REAL_LIGHTS = 4; // real point lights; extra rooms use the emissive glow only
const LABEL_MIN_INTERVAL_MS = 32; // label overlay refresh while orbiting (~30Hz)

const BRAND_ORANGE = "#F5A220";
const GRID_GREEN = "#22C55E";
const SHUTDOWN_RED = "#EF4444";
const IDLE_GREY = "#94A3B8";

const SLAB_H = 0.2;
const TILE_H = 0.07;
const MARGIN = 0.16;
const MAX_CELLS = 24;
const PLACEHOLDER_CELLS = 12;
const MAX_ROOMS = 8;
const ROOM_W = 1.8;
const ROOM_D = 1.5;
const ROOM_GAP = 0.14;
const WALL_H = 1.0;
const WALL_LOW = 0.16;
const WALL_T = 0.06;
const FLOOR_T = 0.05;
const CEIL_Z = FLOOR_T + WALL_H;
const ZONE_GAP = 1.2;
const PAD_M = 0.25;

type V3 = [number, number, number];

/* ------------------------------------------------------------------ */
/* shared heat data (same formula the bottom heatmap uses)             */
/* ------------------------------------------------------------------ */

export function buildHeatTraffic(
  installedTileCount: number,
  isActive: boolean,
): number[] {
  return Array.from(
    { length: Math.min(Math.max(installedTileCount, 0), 60) },
    (_, index) => {
      const wave = Math.sin(index / 2.6) * 0.3 + Math.cos(index / 5) * 0.2;
      const traffic = Math.min(
        1,
        Math.max(0.06, 0.45 + wave + ((index * 2654435761) % 100) / 500),
      );
      return isActive ? traffic : 0.05;
    },
  );
}

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
  const m = c.match(
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)/i,
  );
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  return null;
}
const h2 = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
function toHex(c: string, fallback = BRAND_ORANGE): string {
  const p = parseColor(c);
  return p ? `#${h2(p[0])}${h2(p[1])}${h2(p[2])}` : fallback;
}
function shade(c: string, k: number): string {
  const p = parseColor(c);
  return p ? `#${h2(p[0] * k)}${h2(p[1] * k)}${h2(p[2] * k)}` : c;
}

type RoomKind = "classroom" | "office" | "bedroom" | "dining";
function roomKind(name?: string): RoomKind {
  const t = (name ?? "").toLowerCase();
  if (/bed|dorm|sleep|master|guest/.test(t)) return "bedroom";
  if (/office|admin|work|study|library|faculty|principal|lab|clinic/.test(t))
    return "office";
  if (/kitchen|canteen|dining|cafeteria|pantry|cafe/.test(t)) return "dining";
  return "classroom";
}
const ROOM_PALETTE: Record<RoomKind, { floor: string; wall: string }> = {
  classroom: { floor: "#C9D3E0", wall: "#EEF3F8" },
  office: { floor: "#A9B8CC", wall: "#F2F0EA" },
  bedroom: { floor: "#D3B78F", wall: "#F4E9E4" },
  dining: { floor: "#D9CBB0", wall: "#F6EFDC" },
};

function cellRC(k: number, rows: number) {
  const box = Math.floor(k / 2);
  return { col: Math.floor(box / rows), row: box % rows, half: k % 2 };
}

function pickCell(seed: number, traffic: number[]): number {
  const sum = traffic.reduce((a, b) => a + b, 0) || 1;
  const r = (Math.abs(Math.sin(seed * 12.9898) * 43758.5453) % 1) * sum;
  let acc = 0;
  for (let i = 0; i < traffic.length; i += 1) {
    acc += traffic[i];
    if (r <= acc) return i;
  }
  return Math.max(0, traffic.length - 1);
}

/* ------------------------------------------------------------------ */
/* static world layout                                                 */
/* ------------------------------------------------------------------ */

function buildWorld(cells: number, roomCount: number) {
  const boxes = Math.ceil(cells / 2);
  const rows = boxes > 1 ? 2 : 1;
  const cols = Math.ceil(boxes / rows);
  const X = cols + MARGIN * 2;
  const Y = rows + MARGIN * 2;
  const yf = Y - 0.7;
  const ctrl = { x: X + 0.35, y: yf - 0.9, w: 0.75, d: 0.9, h: 2.0 };
  const bat = { x: X + 1.55, y: yf - 0.8, w: 0.9, d: 0.8, h: 0.9 };
  const grid = { x: bat.x + bat.w + 0.5, y: yf - 0.7, w: 0.7, d: 0.7, h: 1.2 };
  const backW = grid.x + grid.w;

  const roomCols = Math.min(Math.max(roomCount, 1), 3);
  const roomRows = Math.max(1, Math.ceil(roomCount / roomCols));
  const roomsW = roomCols * ROOM_W + (roomCols - 1) * ROOM_GAP;
  const roomsD = roomRows * ROOM_D + (roomRows - 1) * ROOM_GAP;
  const rx0 = (backW - roomsW) / 2;
  const ry0 = Y + ZONE_GAP;
  const rooms = Array.from({ length: roomCount }, (_, i) => {
    const col = i % roomCols;
    const row = Math.floor(i / roomCols);
    const x0 = rx0 + col * (ROOM_W + ROOM_GAP);
    const y0 = ry0 + row * (ROOM_D + ROOM_GAP);
    return { x0, y0, x1: x0 + ROOM_W, y1: y0 + ROOM_D, row, col };
  });
  const backPad = { x0: -PAD_M, y0: -PAD_M, x1: backW + PAD_M, y1: Y + PAD_M };
  const frontPad =
    roomCount > 0
      ? { x0: rx0 - PAD_M, y0: ry0 - PAD_M, x1: rx0 + roomsW + PAD_M, y1: ry0 + roomsD + PAD_M }
      : null;

  const minX = Math.min(backPad.x0, frontPad?.x0 ?? Infinity);
  const maxX = Math.max(backPad.x1, frontPad?.x1 ?? -Infinity);
  const minY = Math.min(backPad.y0, frontPad?.y0 ?? Infinity);
  const maxY = Math.max(backPad.y1, frontPad?.y1 ?? -Infinity);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const R = Math.hypot(maxX - minX, maxY - minY) / 2;

  return { rows, cols, X, Y, yf, ctrl, bat, grid, rooms, roomCols, backPad, frontPad, cx, cy, R };
}
type World = ReturnType<typeof buildWorld>;
type RoomRect = World["rooms"][number];

/* ------------------------------------------------------------------ */
/* primitives                                                          */
/* ------------------------------------------------------------------ */

type BoxProps = {
  p: V3; // world x, y(front), z(up) of the MIN corner
  s: V3; // world width(x), depth(y), height(z)
  color: string;
  emissive?: string;
  emissiveIntensity?: number;
  opacity?: number;
  basic?: boolean; // unlit
  cast?: boolean;
  receive?: boolean;
  roughness?: number;
  onClick?: (e: any) => void;
};

/* One unit cube + a material cache shared by every Box: hundreds of boxes no
 * longer allocate their own geometry/material (less GPU memory, fewer state
 * switches, and no allocation churn on re-render). */
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const MATERIALS = new Map<string, THREE.Material>();
/* crisp outlines like the SVG scene's edge strokes (shared, drawn once per mesh) */
const UNIT_EDGES = new THREE.EdgesGeometry(UNIT_BOX);
const EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: "#0A2A4A", transparent: true, opacity: 0.2 });
const TILE_EDGE_MATERIAL = new THREE.LineBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 0.5 });
const TILE_EDGE_SELECTED = new THREE.LineBasicMaterial({ color: "#FFFFFF", transparent: true, opacity: 1 });
const RING_MATERIAL = new THREE.LineBasicMaterial({ color: BRAND_ORANGE, transparent: true, opacity: 0.95 });
const noRaycast = () => null;

function getBoxMaterial(o: {
  color: string;
  emissive?: string;
  emissiveIntensity: number;
  opacity: number;
  basic?: boolean;
  roughness: number;
}): THREE.Material {
  const key = `${o.basic ? "b" : "s"}|${o.color}|${o.emissive ?? ""}|${
    o.emissive ? o.emissiveIntensity : 0
  }|${o.opacity}|${o.roughness}`;
  let m = MATERIALS.get(key);
  if (!m) {
    const transparent = o.opacity < 1;
    m = o.basic
      ? new THREE.MeshBasicMaterial({
          color: o.color,
          transparent,
          opacity: o.opacity,
          depthWrite: !transparent,
        })
      : new THREE.MeshStandardMaterial({
          color: o.color,
          roughness: o.roughness,
          metalness: 0.05,
          emissive: o.emissive ?? "#000000",
          emissiveIntensity: o.emissive ? o.emissiveIntensity : 0,
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
    a.p[0] === b.p[0] &&
    a.p[1] === b.p[1] &&
    a.p[2] === b.p[2] &&
    a.s[0] === b.s[0] &&
    a.s[1] === b.s[1] &&
    a.s[2] === b.s[2] &&
    a.color === b.color &&
    a.emissive === b.emissive &&
    a.emissiveIntensity === b.emissiveIntensity &&
    a.opacity === b.opacity &&
    a.basic === b.basic &&
    a.cast === b.cast &&
    a.receive === b.receive &&
    a.roughness === b.roughness &&
    a.onClick === b.onClick
  );
}

// p / s are fresh arrays on every parent render, so the default shallow memo
// never hit; compare their values instead.
const Box = React.memo(function Box({
  p,
  s,
  color,
  emissive,
  emissiveIntensity = 1,
  opacity = 1,
  basic,
  cast = true,
  receive = true,
  roughness = 0.75,
  onClick,
}: BoxProps) {
  const material = getBoxMaterial({
    color,
    emissive,
    emissiveIntensity,
    opacity,
    basic,
    roughness,
  });
  return (
    <mesh
      geometry={UNIT_BOX}
      material={material}
      position={[p[0] + s[0] / 2, p[2] + s[2] / 2, p[1] + s[1] / 2]}
      scale={[s[0], s[2], s[1]]}
      castShadow={SHADOWS && cast && opacity >= 1}
      receiveShadow={SHADOWS && receive && opacity >= 1}
      onClick={onClick}
    >
      {opacity >= 1 && !basic && Math.min(s[0], s[1], s[2]) >= 0.05 && (
        <lineSegments geometry={UNIT_EDGES} material={EDGE_MATERIAL} raycast={noRaycast} />
      )}
    </mesh>
  );
}, sameBoxProps);

/** flat wire lying on the ground between two axis-aligned points */
function Wire({
  a,
  b,
  color,
  opacity,
  w = 0.045,
}: {
  a: [number, number];
  b: [number, number];
  color: string;
  opacity: number;
  w?: number;
}) {
  const x0 = Math.min(a[0], b[0]) - w / 2;
  const y0 = Math.min(a[1], b[1]) - w / 2;
  return (
    <Box
      p={[x0, y0, 0.012]}
      s={[Math.abs(a[0] - b[0]) + w, Math.abs(a[1] - b[1]) + w, 0.02]}
      color={color}
      opacity={Math.min(0.99, opacity)}
      basic
      cast={false}
      receive={false}
    />
  );
}

function DashedPad({
  rect,
  color,
}: {
  rect: { x0: number; y0: number; x1: number; y1: number };
  color: string;
}) {
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

function TileImpl({
  k,
  rows,
  traffic,
  pressed,
  selected,
  onTap,
}: {
  k: number;
  rows: number;
  traffic: number;
  pressed: boolean;
  selected: boolean;
  onTap: (k: number) => void;
}) {
  const { col, row, half } = cellRC(k, rows);
  const geometry = useMemo(() => {
    const bx = MARGIN + col;
    const by = MARGIN + row;
    const base: [number, number][] =
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
    g.rotateX(-Math.PI / 2); // extrude axis -> up, shape y -> world front
    return g;
  }, [col, row, half]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const outline = useMemo(() => new THREE.EdgesGeometry(geometry, 30), [geometry]);
  useEffect(() => () => outline.dispose(), [outline]);
  const ringGeo = useMemo(() => {
    const bx = MARGIN + col;
    const by = MARGIN + row;
    const base: [number, number][] =
      half === 0
        ? [[bx, by], [bx + 1, by], [bx, by + 1]]
        : [[bx + 1, by], [bx + 1, by + 1], [bx, by + 1]];
    const cx0 = (base[0][0] + base[1][0] + base[2][0]) / 3;
    const cy0 = (base[0][1] + base[1][1] + base[2][1]) / 3;
    return new THREE.BufferGeometry().setFromPoints(
      base.map(([x, y]) => new THREE.Vector3(cx0 + (x - cx0) * 1.18, SLAB_H + 0.012, cy0 + (y - cy0) * 1.18)),
    );
  }, [col, row, half]);
  useEffect(() => () => ringGeo.dispose(), [ringGeo]);

  const color = useMemo(() => toHex(getHeatmapTileColor(traffic)), [traffic]);
  const ref = useRef<THREE.Mesh>(null);
  const { invalidate } = useThree();
  useFrame((_, dt) => {
    const m = ref.current;
    if (!m) return;
    const target = SLAB_H - (pressed ? 0.05 : 0);
    const d = target - m.position.y;
    if (Math.abs(d) > 0.0005) {
      m.position.y += d * Math.min(1, dt * 18);
      invalidate();
    } else m.position.y = target;
  });

  return (
    <>
      <mesh
        ref={ref}
        geometry={geometry}
        position={[0, SLAB_H, 0]}
        castShadow={SHADOWS}
        receiveShadow={SHADOWS}
        onClick={(e: any) => {
          e.stopPropagation();
          onTap(k);
        }}
      >
        <meshStandardMaterial
          color={color}
          roughness={0.38}
          metalness={0.12}
          side={THREE.DoubleSide}
          emissive={pressed || selected ? "#FFFFFF" : color}
          emissiveIntensity={pressed ? 0.45 : selected ? 0.22 : 0.14}
        />
        <lineSegments
          geometry={outline}
          material={selected || pressed ? TILE_EDGE_SELECTED : TILE_EDGE_MATERIAL}
          raycast={noRaycast}
        />
      </mesh>
      {pressed && <lineLoop geometry={ringGeo} material={RING_MATERIAL} raycast={noRaycast} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* energy particles (tile -> control box -> battery)                   */
/* ------------------------------------------------------------------ */

function EnergyFlow({ pts, onArrive }: { pts: V3[]; onArrive: () => void }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const t0 = useRef(performance.now());
  const done = useRef(false);
  const { invalidate } = useThree();
  const path = useMemo(() => {
    const cp = new THREE.CurvePath<THREE.Vector3>();
    const v = pts.map((p) => new THREE.Vector3(p[0], p[2], p[1]));
    for (let i = 1; i < v.length; i += 1) cp.add(new THREE.LineCurve3(v[i - 1], v[i]));
    return cp;
  }, [pts]);

  useFrame(() => {
    const el = performance.now() - t0.current;
    refs.current.forEach((m, i) => {
      if (!m) return;
      const t = (el - i * 150) / 1100;
      if (t <= 0 || t >= 1) {
        m.visible = false;
        return;
      }
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      m.visible = true;
      m.position.copy(path.getPoint(e));
    });
    if (!done.current) {
      if (el >= 300 + 1100) {
        done.current = true;
        onArrive();
      }
      invalidate();
    }
  });

  return (
    <>
      {[0, 1, 2].map((i) => (
        <mesh key={i} ref={(m) => { refs.current[i] = m; }} visible={false}>
          <sphereGeometry args={[0.07, 12, 12]} />
          <meshBasicMaterial color="#FFE2A8" />
          <mesh>
            <sphereGeometry args={[0.15, 12, 12]} />
            <meshBasicMaterial color={BRAND_ORANGE} transparent opacity={0.35} depthWrite={false} />
          </mesh>
        </mesh>
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* equipment                                                           */
/* ------------------------------------------------------------------ */

function usePulse(pulse: React.MutableRefObject<number>, apply: (v: number) => void) {
  const { invalidate } = useThree();
  useFrame(() => {
    const t0 = pulse.current;
    if (!t0) {
      apply(0);
      return;
    }
    const v = Math.max(0, 1 - (performance.now() - t0) / 650);
    apply(v);
    if (v > 0) invalidate();
    else pulse.current = 0;
  });
}

function ControlBoxImpl({
  w,
  isShutdown,
  pulse,
}: {
  w: World;
  isShutdown: boolean;
  pulse: React.MutableRefObject<number>;
}) {
  const { ctrl, yf } = w;
  const led = useRef<THREE.MeshStandardMaterial>(null);
  usePulse(pulse, (v) => {
    if (led.current) led.current.emissiveIntensity = 0.3 + v * 2.2;
  });
  const fz = 0.012;
  const front = (x0: number, x1: number, z0: number, z1: number, color: string, extra?: Partial<BoxProps>) => (
    <Box p={[x0, yf, z0]} s={[x1 - x0, fz, z1 - z0]} color={color} cast={false} {...extra} />
  );
  return (
    <group>
      <Box p={[ctrl.x, ctrl.y, 0]} s={[ctrl.w, ctrl.d, ctrl.h]} color="#E3E6EC" />
      {front(ctrl.x + 0.1, ctrl.x + ctrl.w - 0.1, 0.15, ctrl.h - 0.15, "#D3D7DF")}
      {front(ctrl.x + 0.17, ctrl.x + ctrl.w - 0.17, ctrl.h - 0.75, ctrl.h - 0.5, "#1F2430")}
      {front(ctrl.x + 0.22, ctrl.x + ctrl.w - 0.3, ctrl.h - 0.67, ctrl.h - 0.58, isShutdown ? SHUTDOWN_RED : BRAND_ORANGE, { basic: true })}
      <mesh position={[ctrl.x + 0.22, ctrl.h - 0.95, yf + 0.015]}>
        <boxGeometry args={[0.1, 0.1, 0.02]} />
        <meshStandardMaterial ref={led} color="#38BDF8" emissive="#38BDF8" emissiveIntensity={0.3} />
      </mesh>
      {isShutdown && front(ctrl.x + 0.14, ctrl.x + 0.3, ctrl.h - 1.2, ctrl.h - 1.04, SHUTDOWN_RED, { basic: true })}
      {front(ctrl.x + ctrl.w - 0.22, ctrl.x + ctrl.w - 0.18, ctrl.h * 0.3, ctrl.h * 0.42, "#8A93A3")}
    </group>
  );
}

function BatteryImpl({
  w,
  batteryPct,
  batLive,
  pulse,
}: {
  w: World;
  batteryPct: number | null;
  batLive: boolean;
  pulse: React.MutableRefObject<number>;
}) {
  const { bat, yf } = w;
  const glow = useRef<THREE.MeshBasicMaterial>(null);
  usePulse(pulse, (v) => {
    if (glow.current) glow.current.opacity = v * 0.45;
  });
  const sx0 = bat.x + 0.12;
  const sx1 = bat.x + bat.w - 0.12;
  const segW = (sx1 - sx0) / 5;
  const filled = Math.ceil(((batteryPct ?? 0) / 100) * 5);
  return (
    <group>
      <Box p={[bat.x, bat.y, 0]} s={[bat.w, bat.d, bat.h]} color="#E3E6EC" />
      <Box p={[sx0, yf, 0.22]} s={[sx1 - sx0, 0.012, bat.h - 0.44]} color="#1F2430" cast={false} />
      {Array.from({ length: 5 }, (_, i) => (
        <Box
          key={i}
          p={[sx0 + i * segW + 0.03, yf + 0.005, 0.27]}
          s={[segW - 0.06, 0.012, bat.h - 0.54]}
          color={i < filled ? BRAND_ORANGE : "#3A4150"}
          basic
          cast={false}
        />
      ))}
      {batLive && <Box p={[bat.x, yf, 0]} s={[bat.w, 0.014, 0.1]} color={BRAND_ORANGE} basic cast={false} />}
      <mesh position={[bat.x + bat.w / 2, bat.h / 2, bat.y + bat.d / 2]}>
        <boxGeometry args={[bat.w + 0.08, bat.h + 0.08, bat.d + 0.08]} />
        <meshBasicMaterial ref={glow} color={BRAND_ORANGE} transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

function GridUnitImpl({ w, gridLive }: { w: World; gridLive: boolean }) {
  const { grid, yf } = w;
  const accent = gridLive ? GRID_GREEN : IDLE_GREY;
  const px = grid.x + grid.w / 2;
  const py = grid.y + grid.d / 2;
  const top = grid.h;
  const fz = 0.012;
  return (
    <group>
      <Box p={[grid.x, grid.y, 0]} s={[grid.w, grid.d, grid.h]} color="#CBD5E1" />
      <Box p={[grid.x, yf, grid.h - 0.28]} s={[grid.w, fz, 0.2]} color={accent} basic cast={false} />
      <Box p={[grid.x + 0.12, yf, 0.2]} s={[grid.w - 0.24, fz, grid.h - 0.6]} color="#1F2430" cast={false} />
      <Box p={[grid.x + 0.2, yf + 0.005, grid.h - 0.62]} s={[0.1, fz, 0.1]} color={gridLive ? "#22C55E" : "#475569"} basic cast={false} />
      <Box p={[grid.x + 0.2, yf + 0.005, 0.3]} s={[grid.w - 0.4, fz, 0.08]} color={gridLive ? GRID_GREEN : "#3A4150"} basic cast={false} />
      {/* pylon */}
      <Box p={[px - 0.02, py - 0.02, top]} s={[0.04, 0.04, 0.9]} color="#64748B" />
      <Box p={[px - 0.3, py - 0.015, top + 0.68]} s={[0.6, 0.03, 0.03]} color="#64748B" />
      <Box p={[px - 0.22, py - 0.015, top + 0.43]} s={[0.44, 0.03, 0.03]} color="#64748B" />
      {[-0.3, 0.3].map((dx) => (
        <mesh key={dx} position={[px + dx, top + 0.6, py]}>
          <sphereGeometry args={[0.05, 10, 10]} />
          <meshBasicMaterial color={accent} />
        </mesh>
      ))}
      <mesh position={[px, top + 0.92, py]}>
        <sphereGeometry args={[0.05, 10, 10]} />
        <meshBasicMaterial color={accent} />
      </mesh>
      {gridLive && (
        <mesh position={[px, grid.h / 2, py]}>
          <sphereGeometry args={[0.8, 16, 16]} />
          <meshBasicMaterial color={GRID_GREEN} transparent opacity={0.1} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* rooms                                                               */
/* ------------------------------------------------------------------ */

/** wall that sinks to a kerb when it sits between the camera and the room */
function CutawayWall({
  rect,
  n,
  inner,
  outer,
  cap,
  children,
}: {
  rect: { x: number; y: number; w: number; d: number };
  n: [number, number]; // outward normal (world x, world y)
  inner: string;
  outer: string;
  cap: string;
  children?: React.ReactNode;
}) {
  const mesh = useRef<THREE.Mesh>(null);
  const decor = useRef<THREE.Group>(null);
  const { invalidate } = useThree();
  const last = useRef(-1);
  const nx = n[0];
  const nz = n[1]; // world y -> three z
  // BoxGeometry material order: +x, -x, +y, -y, +z, -z
  const outerIdx = nx > 0 ? 0 : nx < 0 ? 1 : nz > 0 ? 4 : 5;
  const innerIdx = outerIdx % 2 === 0 ? outerIdx + 1 : outerIdx - 1;
  const mats = [0, 1, 2, 3, 4, 5].map((i) => (i === outerIdx ? outer : i === innerIdx ? inner : cap));
  const cxw = rect.x + rect.w / 2;
  const czw = rect.y + rect.d / 2;

  useFrame(({ camera }) => {
    const m = mesh.current;
    if (!m) return;
    let dx = camera.position.x - cxw;
    let dz = camera.position.z - czw;
    const len = Math.hypot(dx, dz) || 1;
    dx /= len;
    dz /= len;
    const facing = nx * dx + nz * dz;
    const t = Math.min(1, Math.max(0, (facing + 0.2) / 0.4));
    const h = WALL_H - (WALL_H - WALL_LOW) * t;
    if (Math.abs(h - last.current) > 0.001) {
      last.current = h;
      m.scale.y = h;
      m.position.y = FLOOR_T + h / 2;
      if (decor.current) decor.current.visible = h > WALL_H * 0.85;
    }
  });
  useEffect(() => {
    invalidate();
  }, [invalidate]);

  return (
    <>
      <mesh
        ref={mesh}
        position={[cxw, FLOOR_T + WALL_H / 2, czw]}
        castShadow={SHADOWS}
        receiveShadow={SHADOWS}
      >
        <boxGeometry args={[rect.w, 1, rect.d]} />
        {mats.map((c, i) => (
          <meshStandardMaterial key={i} attach={`material-${i}`} color={c} roughness={0.9} />
        ))}
      </mesh>
      <group ref={decor}>{children}</group>
    </>
  );
}

function RoomLamp({
  on,
  r,
  supplyColor,
  realLight,
}: {
  on: boolean;
  r: RoomRect;
  supplyColor: string;
  realLight: boolean;
}) {
  const rcx = (r.x0 + r.x1) / 2;
  const rcy = (r.y0 + r.y1) / 2;
  const bulbZ = CEIL_Z - 0.26;
  const coneH = bulbZ - FLOOR_T;
  const cur = useRef(on ? 1 : 0);
  const light = useRef<THREE.PointLight>(null);
  const bulb = useRef<THREE.MeshStandardMaterial>(null);
  const cone = useRef<THREE.MeshBasicMaterial>(null);
  const pool = useRef<THREE.MeshBasicMaterial>(null);
  const { invalidate } = useThree();

  const apply = (v: number) => {
    if (light.current) light.current.intensity = v * BULB_INTENSITY;
    if (bulb.current) bulb.current.emissiveIntensity = 0.1 + v * 2.4;
    if (cone.current) cone.current.opacity = v * 0.1;
    if (pool.current) pool.current.opacity = v * 0.35;
  };
  useFrame((_, dt) => {
    const target = on ? 1 : 0;
    const d = target - cur.current;
    if (Math.abs(d) > 0.004) {
      cur.current += d * Math.min(1, dt * 9);
      invalidate();
    } else cur.current = target;
    apply(cur.current);
  });

  return (
    <group>
      {realLight && (
        <pointLight
          ref={light}
          position={[rcx, bulbZ - 0.02, rcy]}
          color="#FFD9A0"
          intensity={on ? BULB_INTENSITY : 0}
          distance={3.4}
          decay={2}
        />
      )}
      {/* cord, socket, bulb */}
      <Box p={[rcx - 0.008, rcy - 0.008, bulbZ + 0.06]} s={[0.016, 0.016, CEIL_Z - bulbZ - 0.06]} color="#6B7383" cast={false} />
      <mesh position={[rcx, bulbZ + 0.045, rcy]}>
        <cylinderGeometry args={[0.04, 0.04, 0.05, 12]} />
        <meshStandardMaterial color="#6B7383" />
      </mesh>
      <mesh position={[rcx, bulbZ, rcy]}>
        <sphereGeometry args={[0.075, 16, 16]} />
        <meshStandardMaterial ref={bulb} color="#EDE7D3" emissive="#FFD27A" emissiveIntensity={on ? 2.5 : 0.1} />
      </mesh>
      {/* ceiling rose coloured by the active power supplier */}
      <mesh position={[rcx, CEIL_Z - 0.01, rcy]}>
        <cylinderGeometry args={[0.1, 0.1, 0.02, 20]} />
        <meshStandardMaterial color={supplyColor} emissive={supplyColor} emissiveIntensity={on ? 0.9 : 0.15} />
      </mesh>
      {/* soft light cone + floor pool */}
      <mesh position={[rcx, FLOOR_T + coneH / 2, rcy]}>
        <coneGeometry args={[0.66, coneH, 28, 1, true]} />
        <meshBasicMaterial
          ref={cone}
          color="#FFE29A"
          transparent
          opacity={on ? 0.1 : 0}
          side={THREE.DoubleSide}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh position={[rcx, FLOOR_T + 0.004, rcy]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.66, 32]} />
        <meshBasicMaterial
          ref={pool}
          color="#FFD27A"
          transparent
          opacity={on ? 0.35 : 0}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

function RoomImpl({
  r,
  on,
  kind,
  supplyColor,
  realLight,
}: {
  r: RoomRect;
  on: boolean;
  kind: RoomKind;
  supplyColor: string;
  realLight: boolean;
}) {
  const pal = ROOM_PALETTE[kind];
  const rcx = (r.x0 + r.x1) / 2;
  const rcy = (r.y0 + r.y1) / 2;
  const ix0 = r.x0 + WALL_T;
  const ix1 = r.x1 - WALL_T;
  const iy0 = r.y0 + WALL_T;
  const iy1 = r.y1 - WALL_T;
  const floorC = on ? pal.floor : shade(pal.floor, 0.86);
  const wallIn = on ? pal.wall : shade(pal.wall, 0.86);
  const T = 0.012;

  const F = (x: number, y: number, w: number, d: number, h: number, color: string, z = FLOOR_T) => (
    <Box p={[x, y, z]} s={[w, d, h]} color={color} />
  );
  const decorBack = (x0: number, x1: number, z0: number, z1: number, color: string, dy = 0, basic = false) => (
    <Box p={[x0, iy0 + dy, z0]} s={[x1 - x0, T, z1 - z0]} color={color} basic={basic} cast={false} />
  );

  const walls: {
    id: string;
    rect: { x: number; y: number; w: number; d: number };
    n: [number, number];
  }[] = [
    { id: "b", rect: { x: r.x0, y: r.y0, w: ROOM_W, d: WALL_T }, n: [0, -1] },
    { id: "f", rect: { x: r.x0, y: r.y1 - WALL_T, w: ROOM_W, d: WALL_T }, n: [0, 1] },
    { id: "w", rect: { x: r.x0, y: r.y0 + WALL_T, w: WALL_T, d: ROOM_D - WALL_T * 2 }, n: [-1, 0] },
    { id: "e", rect: { x: r.x1 - WALL_T, y: r.y0 + WALL_T, w: WALL_T, d: ROOM_D - WALL_T * 2 }, n: [1, 0] },
  ];

  const backDecor = () => {
    if (kind === "classroom")
      return (
        <>
          {decorBack(rcx - 0.55, rcx + 0.55, 0.36, 0.78, "#F8FAFC")}
          {decorBack(rcx - 0.55, rcx + 0.55, 0.33, 0.36, "#9AA3B2", 0.004)}
          {decorBack(rcx - 0.45, rcx + 0.05, 0.64, 0.655, "#3B82F6", 0.008, true)}
          {decorBack(rcx - 0.45, rcx - 0.05, 0.57, 0.585, "#EF4444", 0.008, true)}
          {decorBack(rcx - 0.45, rcx + 0.2, 0.5, 0.515, "#16A34A", 0.008, true)}
          {decorBack(rcx + 0.64, rcx + 0.78, 0.62, 0.76, "#FFFFFF", 0.004)}
        </>
      );
    if (kind === "bedroom")
      return (
        <>
          {decorBack(rcx - 0.2, rcx + 0.2, 0.5, 0.78, "#93C5FD")}
          {decorBack(rcx + 0.34, rcx + 0.6, 0.55, 0.75, "#FCA5A5")}
        </>
      );
    if (kind === "office")
      return (
        <>
          {decorBack(rcx - 0.4, rcx + 0.4, 0.42, 0.78, "#F8FAFC")}
          {decorBack(rcx + 0.5, rcx + 0.78, 0.5, 0.52, "#8B6B4A")}
        </>
      );
    return (
      <>
        {decorBack(rcx - 0.7, rcx + 0.7, 0.62, 0.65, "#8B6B4A")}
        {decorBack(rcx - 0.7, rcx + 0.7, 0.42, 0.45, "#8B6B4A")}
      </>
    );
  };

  return (
    <group>
      <Box p={[r.x0, r.y0, 0]} s={[ROOM_W, ROOM_D, FLOOR_T]} color={floorC} roughness={0.6} />

      {walls.map((wl) => (
        <CutawayWall key={wl.id} rect={wl.rect} n={wl.n} inner={wallIn} outer="#F3F4F7" cap="#FFFFFF">
          {wl.id === "b" && backDecor()}
          {wl.id === "w" && (
            <>
              <Box p={[ix0, rcy - 0.4, 0.4]} s={[T, 0.8, 0.46]} color="#BFE3FA" emissive="#BFE3FA" emissiveIntensity={0.35} cast={false} />
              <Box p={[ix0 + 0.002, rcy - 0.01, 0.4]} s={[T, 0.02, 0.46]} color="#FFFFFF" cast={false} />
              <Box p={[ix0, rcy - 0.44, 0.37]} s={[0.03, 0.88, 0.03]} color="#E5E7EB" cast={false} />
            </>
          )}
          {wl.id === "e" && (
            <>
              <Box p={[ix1 - T, rcy - 0.2, FLOOR_T]} s={[T, 0.4, 0.77]} color="#8B5E3C" cast={false} />
              <Box p={[ix1 - T - 0.004, rcy + 0.12, 0.42]} s={[T, 0.04, 0.04]} color="#F5D27A" cast={false} />
            </>
          )}
        </CutawayWall>
      ))}

      {/* furniture */}
      {kind === "classroom" && (
        <>
          {F(rcx - 0.3, iy0 + 0.1, 0.6, 0.2, 0.2, "#C79A66")}
          {F(rcx - 0.08, iy0 + 0.33, 0.16, 0.14, 0.09, "#475569")}
          {[0, 1].map((row) =>
            [0, 1, 2].map((col) => {
              const dx = rcx + (col - 1) * 0.5 - 0.17;
              const dy = iy0 + 0.62 + row * 0.38;
              return (
                <React.Fragment key={`${row}${col}`}>
                  {F(dx, dy, 0.34, 0.2, 0.16, "#D9B382")}
                  {F(dx + 0.08, dy + 0.24, 0.18, 0.12, 0.09, "#3B82F6")}
                </React.Fragment>
              );
            }),
          )}
        </>
      )}
      {kind === "office" && (
        <>
          {[-0.78, 0.14].map((ox) => (
            <React.Fragment key={ox}>
              {F(rcx + ox, iy0 + 0.1, 0.64, 0.3, 0.18, "#E5E7EB")}
              {F(rcx + ox + 0.21, iy0 + 0.17, 0.22, 0.03, 0.15, "#1F2430", FLOOR_T + 0.18)}
              {F(rcx + ox + 0.23, iy0 + 0.46, 0.17, 0.15, 0.1, "#334155")}
            </React.Fragment>
          ))}
          {F(rcx - 0.4, iy0 + 0.9, 0.8, 0.34, 0.17, "#D9B382")}
          {F(ix1 - 0.24, iy0 + 0.05, 0.2, 0.34, 0.42, "#9AA3B2")}
        </>
      )}
      {kind === "bedroom" && (
        <>
          {F(ix0 + 0.15, iy0 + 0.14, 0.7, 0.98, 0.1, "#F3F4F6")}
          {F(ix0 + 0.23, iy0 + 0.2, 0.54, 0.2, 0.05, "#FFFFFF", FLOOR_T + 0.1)}
          {F(ix0 + 0.17, iy0 + 0.5, 0.66, 0.6, 0.03, "#60A5FA", FLOOR_T + 0.1)}
          {F(ix0 + 0.93, iy0 + 0.14, 0.22, 0.22, 0.15, "#C79A66")}
          {F(ix1 - 0.3, iy0 + 0.3, 0.26, 0.5, 0.55, "#D9C3A0")}
        </>
      )}
      {kind === "dining" && (
        <>
          {F(ix0 + 0.1, iy0 + 0.04, ix1 - ix0 - 0.2, 0.24, 0.2, "#CBD5E1")}
          {F(rcx - 0.4, rcy - 0.02, 0.8, 0.46, 0.17, "#D9B382")}
          {[-0.3, 0.3].map((ox) => (
            <React.Fragment key={ox}>
              {F(rcx + ox - 0.07, rcy - 0.2, 0.14, 0.12, 0.09, "#F59E0B")}
              {F(rcx + ox - 0.07, rcy + 0.5, 0.14, 0.12, 0.09, "#F59E0B")}
            </React.Fragment>
          ))}
        </>
      )}

      {/* ghost ceiling + posts */}
      <Box p={[r.x0, r.y0, CEIL_Z - 0.006]} s={[ROOM_W, ROOM_D, 0.012]} color="#FFFFFF" opacity={0.1} basic cast={false} receive={false} />
      {[[r.x0, r.y0], [r.x1 - 0.025, r.y0], [r.x1 - 0.025, r.y1 - 0.025], [r.x0, r.y1 - 0.025]].map(([px, py], i) => (
        <Box key={i} p={[px, py, FLOOR_T]} s={[0.025, 0.025, WALL_H]} color="#9AA3B2" cast={false} />
      ))}

      <RoomLamp on={on} r={r} supplyColor={supplyColor} realLight={realLight} />
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* camera + labels                                                     */
/* ------------------------------------------------------------------ */

type ViewState = {
  yaw: number; // what the camera currently shows
  pitch: number;
  tYaw: number; // where the finger / inertia wants it
  tPitch: number;
  vel: number; // inertia, rad/s
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
    const dH = (R * FIT) / (t * aspect);
    const dV = (R * FIT * 0.75 + 1.5) / t;
    return Math.max(dH, dV) * 1.04;
  }, [R, size.width, size.height]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05); // a hitch must never make the view jump
    const v = view.current;
    let moving = v.dragging;

    // inertia pushes the TARGET, the camera then eases toward it
    if (!v.dragging && Math.abs(v.vel) > 0.02) {
      v.tYaw += v.vel * dt;
      v.vel *= Math.pow(ORBIT_FRICTION, dt * 60);
      moving = true;
    } else if (!v.dragging) v.vel = 0;

    // critically-damped follow: removes touch jitter, frame-rate independent
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

    // Shadow map is static while orbiting (the sun never moves); refresh it
    // only on frames where the camera is at rest (state changes, settle).
    gl.shadowMap.needsUpdate = !moving;

    if (moving) invalidate();
  });
  useEffect(() => {
    invalidate();
  }, [size.width, size.height, invalidate]);
  return null;
}

/** projects 3D label anchors to the RN overlay (cheap, no React renders) */
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
    // While orbiting every Animated.setValue crosses the RN bridge, so the
    // overlay refreshes at ~30Hz; the settled frame always updates in full.
    if (busy && now - lastAt.current < LABEL_MIN_INTERVAL_MS) return;
    lastAt.current = now;

    // the camera was just moved in CameraRig this tick; refresh its matrices
    // so labels do not trail the 3D scene by one frame
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
  world: World;
  dark: boolean;
  cells: number;
  cellTraffic: number[];
  selectedCell: number | null;
  pressedCell: number | null;
  onTap: (k: number) => void;
  batteryPct: number | null;
  roomList: boolean[];
  roomNames: string[];
  isActive: boolean;
  gridLive: boolean;
  batLive: boolean;
  isShutdown: boolean;
  supplyColor: string;
  supplyOp: number;
  flow: { id: number; pts: V3[] } | null;
  onArrive: () => void;
  pulse: React.MutableRefObject<number>;
  view: React.MutableRefObject<ViewState>;
  inv: React.MutableRefObject<(() => void) | null>;
  labels: Label[];
  labelAnims: LabelAnim[];
};

const Tile = React.memo(TileImpl);
const ControlBox = React.memo(ControlBoxImpl);
const Battery = React.memo(BatteryImpl);
const GridUnit = React.memo(GridUnitImpl);
const Room = React.memo(RoomImpl);

function SceneContents(p: SceneProps) {
  const { world: w } = p;
  const { X, Y, yf, ctrl, bat, grid, rooms, roomCols, backPad, frontPad, cx, cy, R, rows } = w;
  const midX = ctrl.x + ctrl.w / 2;
  const trunkY = Y + ZONE_GAP / 2;
  const bx = bat.x + bat.w / 2;
  const gx = grid.x + grid.w / 2;
  const batY = yf + 0.18;
  const gridY = yf + 0.36;
  const genOp = p.isActive ? 0.8 : 0.3;
  const bc = p.batLive ? BRAND_ORANGE : IDLE_GREY;
  const gc = p.gridLive ? GRID_GREEN : IDLE_GREY;
  const bo = p.batLive ? 0.95 : 0.35;
  const go = p.gridLive ? 0.95 : 0.35;
  const padColor = p.dark ? "#FFFFFF" : "#0A2A4A";
  const firstRow = rooms.filter((r) => r.row === 0);
  const centersX = [midX, ...firstRow.map((r) => (r.x0 + r.x1) / 2)];

  return (
    <>
      <Bridge inv={p.inv} />
      <CameraRig view={p.view} cx={cx} cy={cy} R={R} />
      <ambientLight intensity={AMBIENT} />
      <hemisphereLight args={["#FFFFFF", "#B8C2D0", 0.35]} />
      <Sun cx={cx} cy={cy} R={R} />

      {/* ground shadow catcher */}
      {SHADOWS && (
        <mesh position={[cx, -0.003, cy]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[R * 3, R * 3]} />
          <shadowMaterial opacity={p.dark ? 0.45 : 0.18} />
        </mesh>
      )}

      {/* zones */}
      <DashedPad rect={backPad} color={padColor} />
      {frontPad && <DashedPad rect={frontPad} color={padColor} />}

      {/* wiring: generation (tiles -> battery) */}
      <Wire a={[X, yf]} b={[X + 0.18, yf]} color={BRAND_ORANGE} opacity={genOp} />
      <Wire a={[X + 0.18, yf]} b={[bat.x + 0.1, yf]} color={BRAND_ORANGE} opacity={genOp} />
      {/* wiring: supply (battery / grid -> control box -> rooms) */}
      <Wire a={[bx, yf]} b={[bx, batY]} color={bc} opacity={bo} />
      <Wire a={[bx, batY]} b={[midX, batY]} color={bc} opacity={bo} />
      <Wire a={[gx, yf]} b={[gx, gridY]} color={gc} opacity={go} />
      <Wire a={[gx, gridY]} b={[midX, gridY]} color={gc} opacity={go} />
      <Wire a={[midX, yf]} b={[midX, gridY]} color={p.supplyColor} opacity={p.supplyOp} />
      {rooms.length > 0 && (
        <>
          <Wire a={[midX, gridY]} b={[midX, trunkY]} color={p.supplyColor} opacity={p.supplyOp} />
          <Wire a={[Math.min(...centersX), trunkY]} b={[Math.max(...centersX), trunkY]} color={p.supplyColor} opacity={p.supplyOp} />
          {rooms.map((r, i) => {
            const mx = (r.x0 + r.x1) / 2;
            const from = r.row === 0 ? trunkY : rooms[i - roomCols].y1;
            return <Wire key={i} a={[mx, from]} b={[mx, r.y0]} color={p.supplyColor} opacity={p.supplyOp} />;
          })}
        </>
      )}

      {/* floor slab + triangular tiles */}
      <Box p={[0, 0, 0]} s={[X, Y, SLAB_H]} color={p.dark ? "#E6E8EE" : "#FFFFFF"} roughness={0.5} />
      {Array.from({ length: p.cells }, (_, k) => (
        <Tile
          key={k}
          k={k}
          rows={rows}
          traffic={p.cellTraffic[k]}
          pressed={p.pressedCell === k}
          selected={p.selectedCell === k}
          onTap={p.onTap}
        />
      ))}

      <ControlBox w={w} isShutdown={p.isShutdown} pulse={p.pulse} />
      <Battery w={w} batteryPct={p.batteryPct} batLive={p.batLive} pulse={p.pulse} />
      <GridUnit w={w} gridLive={p.gridLive} />

      {rooms.map((r, i) => (
        <Room
          key={i}
          r={r}
          on={p.roomList[i]}
          kind={roomKind(p.roomNames[i])}
          supplyColor={p.supplyColor}
          realLight={i < MAX_REAL_LIGHTS}
        />
      ))}

      {p.flow && <EnergyFlow key={p.flow.id} pts={p.flow.pts} onArrive={p.onArrive} />}

      <LabelProjector labels={p.labels} anims={p.labelAnims} view={p.view} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */

type Props = {
  mode: Mode;
  isActive: boolean;
  installedTileCount: number;
  footsteps: number;
  batteryPct: number | null;
  activeTile: number | null;
  bulbs?: boolean[];
  roomNames?: string[];
  powerMode?: string | null;
  gridVoltage?: number | null;
  gridPower?: number | null;
};

const START_VIEW = { yaw: Math.PI / 4, pitch: 0.82 };

export function TileHeatScene({
  mode,
  isActive,
  installedTileCount,
  footsteps,
  batteryPct,
  activeTile,
  bulbs = [],
  roomNames = [],
  powerMode = null,
  gridVoltage = null,
  gridPower = null,
}: Props) {
  const dark = mode === "dark";
  const traffic = useMemo(
    () => buildHeatTraffic(installedTileCount, isActive),
    [installedTileCount, isActive],
  );
  const n = traffic.length;
  const cells = n > 0 ? Math.min(MAX_CELLS, n) : PLACEHOLDER_CELLS;
  const cellTraffic = useMemo(
    () =>
      Array.from({ length: cells }, (_, k) => {
        if (n === 0) return 0.05;
        const start = Math.floor((k * n) / cells);
        const end = Math.max(start + 1, Math.floor(((k + 1) * n) / cells));
        return Math.max(...traffic.slice(start, end));
      }),
    [cells, n, traffic],
  );

  const roomList = bulbs.slice(0, MAX_ROOMS).map((b) => b && powerMode !== "shutdown");
  const world = useMemo(() => buildWorld(cells, roomList.length), [cells, roomList.length]);
  const worldRef = useRef(world);
  const trafficRef = useRef(cellTraffic);
  worldRef.current = world;
  trafficRef.current = cellTraffic;

  const selectedCell =
    activeTile !== null && n > 0 && activeTile < n
      ? Math.min(cells - 1, Math.floor((activeTile * cells) / n))
      : null;

  /* ---- power supplier ---- */
  const mode3 =
    powerMode === "grid" || powerMode === "battery" || powerMode === "shutdown"
      ? powerMode
      : null;
  const gridLive = isActive && mode3 === "grid";
  const batLive = isActive && mode3 === "battery";
  const isShutdown = isActive && mode3 === "shutdown";
  const supplyColor = gridLive ? GRID_GREEN : batLive ? BRAND_ORANGE : isShutdown ? SHUTDOWN_RED : IDLE_GREY;
  const supplyOp = gridLive || batLive ? 0.95 : isShutdown ? 0.6 : 0.35;
  const supplyLabel = !isActive
    ? "no device"
    : mode3 === "grid"
      ? "Utility grid"
      : mode3 === "battery"
        ? "Battery"
        : mode3 === "shutdown"
          ? "nothing (shutdown)"
          : "unknown";
  const supplyDetail = !isActive
    ? ""
    : mode3 === "grid"
      ? [
          gridVoltage !== null ? `${gridVoltage.toFixed(0)} V` : null,
          gridPower !== null ? `${gridPower.toFixed(0)} W` : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : mode3 === "battery" && batteryPct !== null
        ? `Battery ${Math.round(batteryPct)}%`
        : "";

  /* ---- camera orbit (refs only: dragging never re-renders React) ---- */
  const view = useRef<ViewState>({
    ...START_VIEW,
    tYaw: START_VIEW.yaw,
    tPitch: START_VIEW.pitch,
    vel: 0,
    dragging: false,
  });
  const inv = useRef<(() => void) | null>(null);
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

  /* ---- step simulation ---- */
  const [pressedCell, setPressedCell] = useState<number | null>(null);
  const [flow, setFlow] = useState<{ id: number; pts: V3[] } | null>(null);
  const pulse = useRef(0);
  const prevSteps = useRef(footsteps);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleArrive = () => {
    pulse.current = performance.now();
    inv.current?.();
  };

  const triggerStep = (k: number) => {
    const w = worldRef.current;
    const { col, row, half } = cellRC(k, w.rows);
    const third = half === 0 ? 1 / 3 : 2 / 3;
    const tx = MARGIN + col + third;
    const ty = MARGIN + row + third;
    const top = SLAB_H + TILE_H + 0.05;
    setFlow({
      id: Date.now(),
      pts: [
        [tx, ty, top],
        [w.X - 0.02, ty, top],
        [w.X + 0.12, w.yf, 0.12],
        [w.ctrl.x + w.ctrl.w / 2, w.yf + 0.02, 0.35],
        [w.bat.x + w.bat.w / 2, w.yf + 0.02, 0.3],
      ],
    });
    setPressedCell(k);
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => setPressedCell(null), 280);
  };
  const triggerRef = useRef(triggerStep);
  triggerRef.current = triggerStep;
  const onTap = useRef((k: number) => triggerRef.current(k)).current;

  useEffect(() => {
    if (footsteps > prevSteps.current && isActive) {
      triggerRef.current(pickCell(footsteps, trafficRef.current));
    }
    prevSteps.current = footsteps;
  }, [footsteps, isActive]);

  useEffect(
    () => () => {
      if (pressTimer.current) clearTimeout(pressTimer.current);
    },
    [],
  );

  /* ---- name labels (RN overlay, positioned from the 3D anchors) ---- */
  const ink = dark ? "#FFFFFF" : "#0A2A4A";
  const { X, ctrl, bat, grid, rooms } = world;
  const labels: Label[] = [
    { id: "tiles", text: "TILES", pos: [X / 2, 0, 0.45] },
    {
      id: "ctrl",
      text: isShutdown ? "CONTROL BOX · SHUTDOWN" : "CONTROL BOX",
      color: isShutdown ? SHUTDOWN_RED : undefined,
      pos: [ctrl.x + ctrl.w / 2, ctrl.y + ctrl.d / 2, ctrl.h + 0.2],
    },
    { id: "bat", text: "BATTERY", pos: [bat.x + bat.w / 2, bat.y + bat.d / 2, bat.h + 0.2] },
    {
      id: "grid",
      text: "GRID",
      color: gridLive ? GRID_GREEN : undefined,
      pos: [grid.x + grid.w / 2, grid.y + grid.d / 2, grid.h + 1.15],
    },
    ...rooms.map((r, i) => ({
      id: `room${i}`,
      text: (roomNames[i] || `Room ${i + 1}`).slice(0, 16).toUpperCase(),
      pos: [(r.x0 + r.x1) / 2, r.y0, CEIL_Z + 0.2] as V3,
    })),
  ];
  const labelAnims = useRef<LabelAnim[]>([]);
  while (labelAnims.current.length < labels.length) {
    labelAnims.current.push({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      o: new Animated.Value(0),
    });
  }

  const hintColor = dark ? "rgba(255,255,255,0.55)" : "rgba(10,42,74,0.55)";

  return (
    <View style={{ width: "100%", aspectRatio: SCENE_ASPECT }} {...pan.panHandlers}>
      <Canvas
        frameloop="demand"
        shadows={SHADOWS}
        camera={{ fov: FOV, near: 0.1, far: 120, position: [world.cx + 8, 8, world.cy + 8] }}
        style={{ flex: 1 }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          // shadows are re-rendered only when CameraRig says the view is at rest
          gl.shadowMap.autoUpdate = false;
          gl.shadowMap.needsUpdate = true;
        }}
      >
        <SceneContents
          world={world}
          dark={dark}
          cells={cells}
          cellTraffic={cellTraffic}
          selectedCell={selectedCell}
          pressedCell={pressedCell}
          onTap={onTap}
          batteryPct={batteryPct}
          roomList={roomList}
          roomNames={roomNames}
          isActive={isActive}
          gridLive={gridLive}
          batLive={batLive}
          isShutdown={isShutdown}
          supplyColor={supplyColor}
          supplyOp={supplyOp}
          flow={flow}
          onArrive={handleArrive}
          pulse={pulse}
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

      {/* who is supplying the bulbs */}
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
              backgroundColor: supplyColor,
            }}
          />
          <Text
            style={{
              fontSize: scale(7),
              fontWeight: isShutdown ? "700" : undefined,
              color: isShutdown ? SHUTDOWN_RED : ink,
            }}
          >
            {isShutdown ? "SHUTDOWN · no power to bulbs" : `Bulbs powered by ${supplyLabel}`}
          </Text>
        </View>
        {supplyDetail ? (
          <Text style={{ fontSize: scale(6), color: hintColor, marginLeft: scale(6), marginTop: scale(2) }}>
            {supplyDetail}
          </Text>
        ) : null}
      </View>

      <Text
        pointerEvents="none"
        style={{ position: "absolute", left: scale(2), bottom: 0, fontSize: scale(6.5), color: hintColor }}
      >
        Drag to rotate 360° · tap a tile to simulate a step
      </Text>
      <Pressable
        onPress={() => {
          // glide back along the shortest way round instead of snapping
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