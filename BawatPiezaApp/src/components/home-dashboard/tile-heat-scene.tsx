import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Pressable,
  View,
} from "react-native";
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from "react-native-svg";
import { AppText as Text } from "../app-text";
import { getHeatmapTileColor } from "../heatmap-tile-grid";
import { scale } from "../glass-ui";
import type { Mode } from "../../theme";
import { ROOM_PALETTE, roomKind, type RoomKind } from "./room-kind";

/**
 * UI-only 3D "sandbox" scene (no data / telemetry logic lives here).
 *  - Real 3D geometry, depth-sorted, with directional shading.
 *  - Fixed isometric camera (rotation removed for performance).
 *  - Two clearly separated zones with a walkway gap between them:
 *      BACK  : triangular tiles + control box + battery
 *      FRONT : one furnished room per connected zone (classroom, office, ...)
 *  - Triangular tiles are coloured with the SAME traffic values as the
 *    "Most walked-on tiles" heatmap at the bottom.
 *  - A footstep presses a triangle and sends energy tile -> control box -> battery.
 *  - Each room has a CEILING-mounted bulb that lights the room while that zone
 *    is ON (state comes in through the `bulbs` prop).
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPolygon = Animated.createAnimatedComponent(Polygon);

const BRAND_ORANGE = "#F5A220";
const GRID_GREEN = "#22C55E";
const SHUTDOWN_RED = "#EF4444";
const IDLE_GREY = "#94A3B8";
const VB_W = 340;
const VB_H = 230;
const PAD = 8;
const SLAB_H = 0.2;
const TILE_H = 0.07;
const MARGIN = 0.16;
// a cell is ONE triangular tile; 2 triangles = 1 box tile
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
const CEIL_Z = FLOOR_T + WALL_H; // ceiling height of every room
const ZONE_GAP = 1.2; // empty space between the power zone and the rooms
const PAD_M = 0.25; // ground pad margin around each zone
const VIEW_Z = 1.087; // camera vector (1, 1, VIEW_Z) for our iso projection

type V3 = [number, number, number];
type V2 = [number, number];

/* ------------------------------------------------------------------ */
/* shared heat data                                                    */
/* ------------------------------------------------------------------ */

/** Same formula DashboardActions uses for the bottom heatmap. */
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
/* colour + lighting helpers                                           */
/* ------------------------------------------------------------------ */

function staticValue(a: any): number {
  try {
    return typeof a?.__getValue === "function" ? Number(a.__getValue()) : 1;
  } catch {
    return 1;
  }
}

function parseColor(c: string): [number, number, number, number] | null {
  const hex = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) {
      h = h
        .split("")
        .map((ch) => ch + ch)
        .join("");
    }
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      1,
    ];
  }
  const m = c.match(
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i,
  );
  if (m) {
    return [
      Number(m[1]),
      Number(m[2]),
      Number(m[3]),
      m[4] === undefined ? 1 : Number(m[4]),
    ];
  }
  return null;
}

const darkenCache = new Map<string, string | null>();
function darken(c: string, k: number): string | null {
  const key = `${c}|${k.toFixed(2)}`;
  const hit = darkenCache.get(key);
  if (hit !== undefined) return hit;
  const p = parseColor(c);
  const out = p
    ? `rgba(${Math.round(p[0] * k)},${Math.round(p[1] * k)},${Math.round(
        p[2] * k,
      )},${p[3]})`
    : null;
  darkenCache.set(key, out);
  return out;
}


const disc = (x: number, y: number, rad: number, z: number, seg = 18): V3[] =>
  Array.from({ length: seg }, (_, k) => {
    const a = (k / seg) * Math.PI * 2;
    return [x + Math.cos(a) * rad, y + Math.sin(a) * rad, z] as V3;
  });

const LIGHT: V3 = (() => {
  const v: V3 = [0.35, -0.6, 0.72];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
const TOP_SHADE = 0.58 + 0.42 * LIGHT[2];

function shadeK(n: V3): number {
  const lam = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  return Math.min(1, (0.58 + 0.42 * lam) / TOP_SHADE);
}

/* ------------------------------------------------------------------ */
/* tiny 3D scene graph                                                 */
/* ------------------------------------------------------------------ */

type Face = {
  key: string;
  pts: V3[];
  n: V3;
  fill: string;
  stroke?: string;
  sw?: number;
  noShade?: boolean;
  doubleSided?: boolean;
  fillOpacity?: number;
  dash?: string;
  lod?: boolean; // detail: hidden while rotating
  anim?: any;
  overlay?: { fill: string; opacity: number };
  onPress?: () => void;
};
type LineItem = { a: V3; b: V3; stroke: string; w: number; opacity?: number };
type Sprite = {
  p: V3;
  r: number;
  minPx?: number;
  fill: string;
  opacity?: number;
  anim?: any;
  lod?: boolean;
};
type Part = {
  id: string;
  center: V3;
  order?: number;
  faces: Face[];
  lines?: LineItem[];
  sprites?: Sprite[];
};
type Group = { id: string; center: V3; layer: number; parts: Part[] };

function boxFaces(
  id: string,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  color: (n: V3) => string,
  extra?: Partial<Face>,
): Face[] {
  const x1 = x + w;
  const y1 = y + d;
  const z1 = z + h;
  const defs: { k: string; n: V3; pts: V3[] }[] = [
    { k: "t", n: [0, 0, 1], pts: [[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]] },
    { k: "px", n: [1, 0, 0], pts: [[x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1]] },
    { k: "nx", n: [-1, 0, 0], pts: [[x, y, z], [x, y1, z], [x, y1, z1], [x, y, z1]] },
    { k: "py", n: [0, 1, 0], pts: [[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]] },
    { k: "ny", n: [0, -1, 0], pts: [[x, y, z], [x1, y, z], [x1, y, z1], [x, y, z1]] },
  ];
  return defs.map((f) => ({
    key: id + f.k,
    pts: f.pts,
    n: f.n,
    fill: color(f.n),
    ...extra,
  }));
}

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
/* static world layout (depends only on tile + room counts)            */
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

  // rooms sit IN FRONT of the power zone, separated by ZONE_GAP
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
      ? {
          x0: rx0 - PAD_M,
          y0: ry0 - PAD_M,
          x1: rx0 + roomsW + PAD_M,
          y1: ry0 + roomsD + PAD_M,
        }
      : null;

  const corners: V3[] = [];
  const addBox = (x: number, y: number, z: number, w: number, d: number, h: number) => {
    for (const dx of [0, w])
      for (const dy of [0, d])
        for (const dz of [0, h]) corners.push([x + dx, y + dy, z + dz]);
  };
  addBox(0, 0, 0, X, Y, SLAB_H);
  addBox(ctrl.x, ctrl.y, 0, ctrl.w, ctrl.d, ctrl.h + 0.45);
  addBox(bat.x, bat.y, 0, bat.w, bat.d, bat.h + 0.4);
  addBox(grid.x, grid.y, 0, grid.w, grid.d, grid.h + 1.35);
  addBox(backPad.x0, backPad.y0, 0, backPad.x1 - backPad.x0, backPad.y1 - backPad.y0, 0);
  if (frontPad)
    addBox(frontPad.x0, frontPad.y0, 0, frontPad.x1 - frontPad.x0, frontPad.y1 - frontPad.y0, 0);
  rooms.forEach((r) => addBox(r.x0, r.y0, 0, ROOM_W, ROOM_D, CEIL_Z + 0.1));

  const xs = corners.map((c) => c[0]);
  const ys = corners.map((c) => c[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

  // fit once over every rotation so the scene never "breathes" while turning
  let maxAbsX = 0;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let s = 0; s < 1; s += 1) {
    const a = 0;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    for (const p of corners) {
      const dx = p[0] - cx;
      const dy = p[1] - cy;
      const rx = dx * c - dy * sn;
      const ry = dx * sn + dy * c;
      const sx = (rx - ry) * 0.866;
      const sy = (rx + ry) * 0.5 - p[2] * 0.92;
      maxAbsX = Math.max(maxAbsX, Math.abs(sx));
      minY = Math.min(minY, sy);
      maxY = Math.max(maxY, sy);
    }
  }
  const availW = VB_W - PAD * 2;
  const availH = VB_H - PAD * 2 - 6;
  const U = Math.min(availW / (2 * maxAbsX), availH / (maxY - minY));
  const sx0 = VB_W / 2;
  const sy0 = PAD + (availH - (maxY - minY) * U) / 2 - minY * U;

  return { rows, cols, X, Y, yf, ctrl, bat, grid, rooms, backPad, frontPad, cx, cy, U, sx0, sy0 };
}
type World = ReturnType<typeof buildWorld>;

/* ------------------------------------------------------------------ */
/* energy particle                                                     */
/* ------------------------------------------------------------------ */

function FlowParticle({
  points,
  delay,
  duration,
  onArrive,
}: {
  points: V2[];
  delay: number;
  duration: number;
  onArrive: () => void;
}) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.sequence([
      Animated.delay(delay),
      Animated.timing(t, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
    ]);
    anim.start(({ finished }) => {
      if (finished) onArrive();
    });
    return () => anim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clean: V2[] = [];
  for (const p of points) {
    const last = clean[clean.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.5)
      clean.push(p);
  }
  if (clean.length < 2) return null;

  const cum = [0];
  for (let i = 1; i < clean.length; i += 1) {
    cum.push(
      cum[i - 1] +
        Math.hypot(clean[i][0] - clean[i - 1][0], clean[i][1] - clean[i - 1][1]),
    );
  }
  const total = cum[cum.length - 1];
  const inputRange = cum.map((v) => v / total);
  const cx = t.interpolate({ inputRange, outputRange: clean.map((p) => p[0]) });
  const cy = t.interpolate({ inputRange, outputRange: clean.map((p) => p[1]) });
  const fade = t.interpolate({
    inputRange: [0, 0.08, 0.92, 1],
    outputRange: [0, 1, 1, 0],
  });
  const glow = t.interpolate({
    inputRange: [0, 0.08, 0.92, 1],
    outputRange: [0, 0.35, 0.35, 0],
  });

  return (
    <>
      <AnimatedCircle cx={cx} cy={cy} r={6} fill={BRAND_ORANGE} fillOpacity={glow} />
      <AnimatedCircle cx={cx} cy={cy} r={2.8} fill="#FFE2A8" fillOpacity={fade} />
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
  /** zone names (same order as `bulbs`) - picks the room interior */
  roomNames?: string[];
  /** selected place types, parallel to `roomNames` */
  roomKinds?: (RoomKind | "auto" | undefined)[];
  /** which provider is feeding the bulbs right now */
  powerMode?: string | null;
  gridVoltage?: number | null;
  gridPower?: number | null;
  /** tap on a room's in-scene switch (index matches `bulbs` / `roomNames`) */
  onToggleRoom?: (index: number) => void;
  roomSwitchDisabled?: boolean;
};

export function TileHeatScene({
  mode,
  isActive,
  installedTileCount,
  footsteps,
  batteryPct,
  activeTile,
  bulbs = [],
  roomNames = [],
  roomKinds = [],
  powerMode = null,
  gridVoltage = null,
  gridPower = null,
  onToggleRoom,
  roomSwitchDisabled = false,
}: Props) {
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
  const world = useMemo(
    () => buildWorld(cells, roomList.length),
    [cells, roomList.length],
  );
  const worldRef = useRef<World>(world);
  const trafficRef = useRef<number[]>(cellTraffic);
  worldRef.current = world;
  trafficRef.current = cellTraffic;

  const selectedCell =
    activeTile !== null && n > 0 && activeTile < n
      ? Math.min(cells - 1, Math.floor((activeTile * cells) / n))
      : null;

  /* ---- fixed camera (no rotation => no per-frame redraws) ---- */
  const yaw = 0;
  const interacting = false;
  const [flow, setFlow] = useState<{ id: number; pts3: V3[] } | null>(null);

  /* ---- step simulation ---- */
  const [pressedCell, setPressedCell] = useState<number | null>(null);
  const pulse = useRef(new Animated.Value(0)).current;
  const prevSteps = useRef(footsteps);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleArrive = () => {
    pulse.setValue(1);
    Animated.timing(pulse, {
      toValue: 0,
      duration: 650,
      useNativeDriver: false,
    }).start();
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
      pts3: [
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

  /* ---- stable interpolations (re-creating them every frame is costly) ---- */
  const pulseLed = useMemo(() => pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 1] }), [pulse]);
  const pulseGlow = useMemo(() => pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] }), [pulse]);
  const pulseHalo = useMemo(() => pulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.2] }), [pulse]);

  /* ---- per-room lamp animation (visual only) ---- */
  const lampAnims = useRef<Animated.Value[]>([]);
  while (lampAnims.current.length < roomList.length) {
    lampAnims.current.push(
      new Animated.Value(roomList[lampAnims.current.length] ? 1 : 0),
    );
  }
  const lampOpCache = useRef<Record<string, any>>({});
  const lampOp = (i: number, max: number) => {
    const key = `${i}:${max}`;
    if (!lampOpCache.current[key]) {
      lampOpCache.current[key] = lampAnims.current[i].interpolate({
        inputRange: [0, 1],
        outputRange: [0, max],
      });
    }
    return lampOpCache.current[key];
  };
  const lampKey = roomList.map((b) => (b ? 1 : 0)).join("");
  useEffect(() => {
    roomList.forEach((on, i) => {
      Animated.timing(lampAnims.current[i], {
        toValue: on ? 1 : 0,
        duration: 260,
        useNativeDriver: false,
      }).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lampKey]);

  /* ---------------------------------------------------------------- */
  /* build this frame                                                  */
  /* ---------------------------------------------------------------- */
  const { rows, X, Y, yf, ctrl, bat, grid, rooms, backPad, frontPad, cx, cy, U, sx0, sy0 } = world;
  const roomColsN = Math.min(Math.max(rooms.length, 1), 3);
  const cosA = Math.cos(yaw);
  const sinA = Math.sin(yaw);
  const rot = (p: V3): V3 => {
    const dx = p[0] - cx;
    const dy = p[1] - cy;
    return [dx * cosA - dy * sinA, dx * sinA + dy * cosA, p[2]];
  };
  const rotN = (v: V3): V3 => [v[0] * cosA - v[1] * sinA, v[0] * sinA + v[1] * cosA, v[2]];
  const pr = (p: V3): V2 => {
    const r = rot(p);
    return [(r[0] - r[1]) * 0.866 * U + sx0, ((r[0] + r[1]) * 0.5 - r[2] * 0.92) * U + sy0];
  };
  const visible = (v: V3) => {
    const r = rotN(v);
    return r[0] + r[1] + VIEW_Z * r[2] > 0.001;
  };
  const depthOf = (p: V3) => {
    const r = rot(p);
    return r[0] + r[1];
  };
  const ptsStr = (pts: V3[]) =>
    pts
      .map((p) => {
        const [x, y] = pr(p);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  const dark = mode === "dark";
  const shadowFill = dark ? "rgba(0,0,0,0.5)" : "rgba(10,42,74,0.16)";
  const slabTop = dark ? "#F2F3F7" : "#FFFFFF";
  const edge = dark ? undefined : "rgba(10,42,74,0.12)";
  const BODY = "#E3E6EC";
  const UP: V3 = [0, 0, 1];

  const groups: Group[] = [];

  /* ground: shadows + wiring */
  const groundFaces: Face[] = [];
  const padFill = dark ? "rgba(255,255,255,0.045)" : "rgba(10,42,74,0.045)";
  const padStroke = dark ? "rgba(255,255,255,0.22)" : "rgba(10,42,74,0.22)";
  const padQuad = (id: string, p: { x0: number; y0: number; x1: number; y1: number }) =>
    groundFaces.push({
      key: `pad-${id}`,
      n: UP,
      noShade: true,
      doubleSided: true,
      fill: padFill,
      stroke: padStroke,
      sw: 0.8,
      dash: "3 3",
      pts: [[p.x0, p.y0, 0], [p.x1, p.y0, 0], [p.x1, p.y1, 0], [p.x0, p.y1, 0]],
    });
  padQuad("power", backPad);
  if (frontPad) padQuad("rooms", frontPad);
  const shadowQuad = (id: string, x: number, y: number, w: number, d: number, off: number) =>
    groundFaces.push({
      key: `sh-${id}`,
      n: UP,
      noShade: true,
      doubleSided: true,
      fill: shadowFill,
      pts: [
        [x + off, y + off, 0],
        [x + w + off, y + off, 0],
        [x + w + off, y + d + off, 0],
        [x + off, y + d + off, 0],
      ],
    });
  shadowQuad("slab", 0, 0, X, Y, 0.3);
  shadowQuad("ctrl", ctrl.x, ctrl.y, ctrl.w, ctrl.d, 0.25);
  shadowQuad("bat", bat.x, bat.y, bat.w, bat.d, 0.22);
  shadowQuad("grid", grid.x, grid.y, grid.w, grid.d, 0.22);
  rooms.forEach((r, i) => shadowQuad(`room${i}`, r.x0, r.y0, ROOM_W, ROOM_D, 0.25));

  const mode3 = powerMode === "grid" || powerMode === "battery" || powerMode === "shutdown" ? powerMode : null;
  const gridLive = isActive && mode3 === "grid";
  const batLive = isActive && mode3 === "battery";
  const isShutdown = isActive && mode3 === "shutdown";
  const supplyColor = gridLive ? GRID_GREEN : batLive ? BRAND_ORANGE : isShutdown ? SHUTDOWN_RED : IDLE_GREY;
  const supplyOp = gridLive || batLive ? 0.95 : isShutdown ? 0.6 : 0.3;

  const wireLines: LineItem[] = [];
  const wireColor = BRAND_ORANGE;
  const wireOp = isActive ? 0.55 : 0.2;
  const midX = ctrl.x + ctrl.w / 2;
  const trunkY = Y + ZONE_GAP / 2;
  // generation path: tiles -> battery
  wireLines.push({ a: [X, yf, SLAB_H * 0.5], b: [X + 0.18, yf, 0.06], stroke: wireColor, w: 1.6, opacity: wireOp });
  wireLines.push({ a: [X + 0.18, yf, 0.06], b: [bat.x + 0.1, yf, 0.06], stroke: wireColor, w: 1.6, opacity: wireOp });
  // supply paths: battery -> control box and utility grid -> control box
  const bx = bat.x + bat.w / 2;
  const gx = grid.x + grid.w / 2;
  const batY = yf + 0.18;
  const gridY = yf + 0.36;
  const bc = batLive ? BRAND_ORANGE : IDLE_GREY;
  const gc = gridLive ? GRID_GREEN : IDLE_GREY;
  const bo = batLive ? 0.95 : 0.3;
  const go = gridLive ? 0.95 : 0.3;
  wireLines.push({ a: [bx, yf, 0.05], b: [bx, batY, 0.05], stroke: bc, w: 2, opacity: bo });
  wireLines.push({ a: [bx, batY, 0.05], b: [midX, batY, 0.05], stroke: bc, w: 2, opacity: bo });
  wireLines.push({ a: [gx, yf, 0.05], b: [gx, gridY, 0.05], stroke: gc, w: 2, opacity: go });
  wireLines.push({ a: [gx, gridY, 0.05], b: [midX, gridY, 0.05], stroke: gc, w: 2, opacity: go });
  wireLines.push({ a: [midX, yf, 0.05], b: [midX, gridY, 0.05], stroke: supplyColor, w: 2, opacity: supplyOp });
  if (rooms.length > 0) {
    const firstRow = rooms.filter((r) => r.row === 0);
    const centersX = [midX, ...firstRow.map((r) => (r.x0 + r.x1) / 2)];
    wireLines.push({ a: [midX, gridY, 0.05], b: [midX, trunkY, 0.05], stroke: supplyColor, w: 2, opacity: supplyOp });
    wireLines.push({
      a: [Math.min(...centersX), trunkY, 0.05],
      b: [Math.max(...centersX), trunkY, 0.05],
      stroke: supplyColor,
      w: 2,
      opacity: supplyOp,
    });
    rooms.forEach((r, i) => {
      const mx = (r.x0 + r.x1) / 2;
      const from = r.row === 0 ? trunkY : rooms[i - roomColsN].y1;
      wireLines.push({ a: [mx, from, 0.05], b: [mx, r.y0, 0.05], stroke: supplyColor, w: 1.8, opacity: supplyOp });
    });
  }
  groups.push({
    id: "ground",
    center: [cx, cy, 0],
    layer: 0,
    parts: [{ id: "ground", center: [cx, cy, 0], faces: groundFaces, lines: interacting ? [] : wireLines }],
  });

  /* floor: slab + triangular tiles */
  const slabPart: Part = {
    id: "slab",
    center: [X / 2, Y / 2, 0],
    order: -1,
    faces: boxFaces("slab", 0, 0, 0, X, Y, SLAB_H, (nv) => (nv[2] > 0 ? slabTop : "#D3D8E2"), {
      stroke: edge,
      sw: 0.8,
    }),
  };

  const tileParts: Part[] = Array.from({ length: cells }, (_, k) => {
    const { col, row, half } = cellRC(k, rows);
    const bx = MARGIN + col;
    const by = MARGIN + row;
    const base: V2[] =
      half === 0
        ? [[bx, by], [bx + 1, by], [bx, by + 1]]
        : [[bx + 1, by], [bx + 1, by + 1], [bx, by + 1]];
    const cx0 = (base[0][0] + base[1][0] + base[2][0]) / 3;
    const cy0 = (base[0][1] + base[1][1] + base[2][1]) / 3;
    const tri: V2[] = base.map(([x, y]) => [cx0 + (x - cx0) * 0.9, cy0 + (y - cy0) * 0.9]);
    const pressed = pressedCell === k;
    const z = SLAB_H - (pressed ? 0.05 : 0);
    const zt = z + TILE_H;
    const color = getHeatmapTileColor(cellTraffic[k]);
    const faces: Face[] = [];

    for (let i = 0; i < 3 && (!interacting || pressed); i += 1) {
      const a = tri[i];
      const b = tri[(i + 1) % 3];
      let nx = b[1] - a[1];
      let ny = -(b[0] - a[0]);
      const mx = (a[0] + b[0]) / 2 - cx0;
      const my = (a[1] + b[1]) / 2 - cy0;
      if (nx * mx + ny * my < 0) {
        nx = -nx;
        ny = -ny;
      }
      const len = Math.hypot(nx, ny) || 1;
      faces.push({
        key: `tile${k}s${i}`,
        n: [nx / len, ny / len, 0],
        fill: color,
        pts: [[a[0], a[1], z], [b[0], b[1], z], [b[0], b[1], zt], [a[0], a[1], zt]],
      });
    }
    faces.push({
      key: `tile${k}t`,
      n: UP,
      fill: color,
      stroke: interacting ? undefined : selectedCell === k ? (dark ? "#FFFFFF" : "#0A2A4A") : "rgba(255,255,255,0.28)",
      sw: selectedCell === k ? 1.6 : 0.5,
      overlay: pressed ? { fill: "#FFFFFF", opacity: 0.35 } : undefined,
      pts: tri.map(([x, y]) => [x, y, zt] as V3),
      onPress: () => triggerRef.current(k),
    });
    if (pressed) {
      faces.push({
        key: `tile${k}ring`,
        n: UP,
        noShade: true,
        fill: "none",
        stroke: BRAND_ORANGE,
        sw: 1.4,
        pts: base.map(([x, y]) => [cx0 + (x - cx0) * 1.18, cy0 + (y - cy0) * 1.18, SLAB_H + 0.01] as V3),
      });
    }
    return { id: `tile${k}`, center: [cx0, cy0, zt] as V3, faces };
  });
  tileParts.sort((a, b) => depthOf(a.center) - depthOf(b.center));
  groups.push({
    id: "floor",
    center: [X / 2, Y / 2, 0],
    layer: 1,
    parts: [slabPart, ...tileParts],
  });

  /* control box */
  {
    const faces = boxFaces("ctrl", ctrl.x, ctrl.y, 0, ctrl.w, ctrl.d, ctrl.h, () => BODY);
    const fy = yf + 0.004;
    const front = (id: string, x0: number, x1: number, z0: number, z1: number, extra: Partial<Face>): Face => ({
      key: id,
      n: [0, 1, 0],
      fill: "none",
      pts: [[x0, fy, z0], [x1, fy, z0], [x1, fy, z1], [x0, fy, z1]],
      ...extra,
    });
    if (!interacting) faces.push(
      front("ctrl-door", ctrl.x + 0.1, ctrl.x + ctrl.w - 0.1, 0.15, ctrl.h - 0.15, {
        fill: "rgba(0,0,0,0.05)",
        stroke: "rgba(0,0,0,0.16)",
        sw: 0.7,
        noShade: true,
      }),
      front("ctrl-disp", ctrl.x + 0.17, ctrl.x + ctrl.w - 0.17, ctrl.h - 0.75, ctrl.h - 0.5, {
        fill: "#1F2430",
        noShade: true,
      }),
      front("ctrl-disp-bar", ctrl.x + 0.22, ctrl.x + ctrl.w - 0.3, ctrl.h - 0.67, ctrl.h - 0.58, {
        fill: isShutdown ? SHUTDOWN_RED : BRAND_ORANGE,
        noShade: true,
      }),
      front("ctrl-led", ctrl.x + 0.17, ctrl.x + 0.27, ctrl.h - 1.0, ctrl.h - 0.9, {
        fill: "#7C8798",
        noShade: true,
      }),
      ...(isShutdown
        ? [front("ctrl-led-sd", ctrl.x + 0.14, ctrl.x + 0.3, ctrl.h - 1.03, ctrl.h - 0.87, { fill: SHUTDOWN_RED, noShade: true })]
        : []),
      front("ctrl-led-on", ctrl.x + 0.17, ctrl.x + 0.27, ctrl.h - 1.0, ctrl.h - 0.9, {
        fill: "#38BDF8",
        noShade: true,
        anim: pulseLed,
      }),
    );
    const center: V3 = [ctrl.x + ctrl.w / 2, ctrl.y + ctrl.d / 2, ctrl.h / 2];
    groups.push({
      id: "ctrl",
      layer: 2,
      center,
      parts: [
        {
          id: "ctrl",
          center,
          faces,
          lines: interacting ? [] : [
            {
              a: [ctrl.x + ctrl.w - 0.2, fy + 0.004, ctrl.h * 0.3],
              b: [ctrl.x + ctrl.w - 0.2, fy + 0.004, ctrl.h * 0.42],
              stroke: "#8A93A3",
              w: 2.2,
            },
          ],
        },
      ],
    });
  }

  /* battery */
  {
    const faces = boxFaces("bat", bat.x, bat.y, 0, bat.w, bat.d, bat.h, () => BODY);
    const fy = yf + 0.004;
    const sx0b = bat.x + 0.12;
    const sx1b = bat.x + bat.w - 0.12;
    const segW = (sx1b - sx0b) / 5;
    const filled = Math.ceil(((batteryPct ?? 0) / 100) * 5);
    const front = (id: string, x0: number, x1: number, z0: number, z1: number, extra: Partial<Face>): Face => ({
      key: id,
      n: [0, 1, 0],
      fill: "none",
      noShade: true,
      pts: [[x0, fy, z0], [x1, fy, z0], [x1, fy, z1], [x0, fy, z1]],
      ...extra,
    });
    if (!interacting) faces.push(front("bat-screen", sx0b, sx1b, 0.22, bat.h - 0.22, { fill: "#1F2430" }));
    for (let i = 0; i < 5 && !interacting; i += 1) {
      faces.push(
        front(`bat-seg${i}`, sx0b + i * segW + 0.03, sx0b + (i + 1) * segW - 0.03, 0.27, bat.h - 0.27, {
          fill: i < filled ? BRAND_ORANGE : "#3A4150",
        }),
      );
    }
    if (!interacting) faces.push(
      front("bat-glow", bat.x, bat.x + bat.w, 0, bat.h, {
        fill: BRAND_ORANGE,
        anim: pulseGlow,
      }),
    );
    if (batLive) faces.push(front("bat-live", bat.x, bat.x + bat.w, 0, 0.1, { fill: BRAND_ORANGE }));
    const center: V3 = [bat.x + bat.w / 2, bat.y + bat.d / 2, bat.h / 2];
    groups.push({
      id: "bat",
      layer: 2,
      center,
      parts: [
        {
          id: "bat",
          center,
          faces,
          sprites: interacting ? [] : [
            {
              p: [bat.x + bat.w / 2, yf, bat.h / 2],
              r: 0.9,
              fill: BRAND_ORANGE,
              anim: pulseHalo,
            },
          ],
        },
      ],
    });
  }

  /* utility grid: transformer cabinet + pylon (supplier #2) */
  {
    const faces = boxFaces("grid", grid.x, grid.y, 0, grid.w, grid.d, grid.h, () => "#CBD5E1");
    const fy = yf + 0.004;
    const front = (id: string, x0: number, x1: number, z0: number, z1: number, extra: Partial<Face>): Face => ({
      key: id,
      n: [0, 1, 0],
      noShade: true,
      fill: "none",
      pts: [[x0, fy, z0], [x1, fy, z0], [x1, fy, z1], [x0, fy, z1]],
      ...extra,
    });
    faces.push(
      front("grid-band", grid.x, grid.x + grid.w, grid.h - 0.28, grid.h - 0.08, { fill: gridLive ? GRID_GREEN : IDLE_GREY }),
      front("grid-panel", grid.x + 0.12, grid.x + grid.w - 0.12, 0.2, grid.h - 0.4, {
        fill: "#1F2430",
        stroke: "rgba(0,0,0,0.2)",
        sw: 0.6,
      }),
      front("grid-led", grid.x + 0.2, grid.x + 0.3, grid.h - 0.62, grid.h - 0.52, {
        fill: gridLive ? "#22C55E" : "#475569",
      }),
      front("grid-bar", grid.x + 0.2, grid.x + grid.w - 0.2, 0.3, 0.38, { fill: gridLive ? GRID_GREEN : "#3A4150" }),
    );
    const px = grid.x + grid.w / 2;
    const py = grid.y + grid.d / 2;
    const top = grid.h;
    const pole = "#64748B";
    const center: V3 = [px, py, grid.h / 2];
    groups.push({
      id: "grid",
      layer: 2,
      center,
      parts: [
        {
          id: "grid",
          center,
          faces,
          lines: [
            { a: [px, py, top], b: [px, py, top + 0.85], stroke: pole, w: 2 },
            { a: [px - 0.3, py, top + 0.7], b: [px + 0.3, py, top + 0.7], stroke: pole, w: 1.8 },
            { a: [px - 0.22, py, top + 0.45], b: [px + 0.22, py, top + 0.45], stroke: pole, w: 1.6 },
            { a: [px - 0.3, py, top + 0.7], b: [px - 0.3, py, top + 0.6], stroke: pole, w: 1.2 },
            { a: [px + 0.3, py, top + 0.7], b: [px + 0.3, py, top + 0.6], stroke: pole, w: 1.2 },
          ],
          sprites: [
            { p: [px - 0.3, py, top + 0.58], r: 0.05, minPx: 2, fill: gridLive ? GRID_GREEN : IDLE_GREY },
            { p: [px + 0.3, py, top + 0.58], r: 0.05, minPx: 2, fill: gridLive ? GRID_GREEN : IDLE_GREY },
            { p: [px, py, top + 0.88], r: 0.05, minPx: 2, fill: gridLive ? GRID_GREEN : IDLE_GREY },
            ...(gridLive ? [{ p: [px, yf, grid.h / 2] as V3, r: 0.8, fill: GRID_GREEN, opacity: 0.16 }] : []),
          ],
        },
      ],
    });
  }

  /* furnished rooms with a CEILING bulb (one per connected zone) */
  rooms.forEach((r, i) => {
    const on = roomList[i];
    const lamp = lampAnims.current[i];
    const selectedKind = roomKinds[i];
    const kind =
      selectedKind && selectedKind !== "auto"
        ? selectedKind
        : roomKind(roomNames[i]);
    const pal = ROOM_PALETTE[kind];
    const rcx = (r.x0 + r.x1) / 2;
    const rcy = (r.y0 + r.y1) / 2;
    const ix0 = r.x0 + WALL_T;
    const ix1 = r.x1 - WALL_T;
    const iy0 = r.y0 + WALL_T;
    const iy1 = r.y1 - WALL_T;
    const zf = FLOOR_T + 0.004;
    const bulbZ = CEIL_Z - 0.26;
    const dim = (c: string) => (on ? c : darken(c, 0.86) ?? c);
    const parts: Part[] = [];

    /* floor + light pools cast by the ceiling bulb */
    const floorFaces = boxFaces(`room${i}f`, r.x0, r.y0, 0, ROOM_W, ROOM_D, FLOOR_T, (nv) =>
      nv[2] > 0 ? dim(pal.floor) : "#B9AE9C",
    );
    if (kind === "hallway") {
      // carpet runner + edge lines down the middle of the corridor
      const rz = zf + 0.0005;
      const strip = (key: string, ya: number, yb: number, fill: string, dz: number): Face => ({
        key,
        n: UP,
        noShade: true,
        fill,
        pts: [[ix0, ya, rz + dz], [ix1, ya, rz + dz], [ix1, yb, rz + dz], [ix0, yb, rz + dz]],
      });
      floorFaces.push(
        strip(`room${i}-run`, rcy - 0.3, rcy + 0.3, dim("#8FA3BC"), 0),
        strip(`room${i}-run-a`, rcy - 0.3, rcy - 0.275, "#E2E8F0", 0.0003),
        strip(`room${i}-run-b`, rcy + 0.275, rcy + 0.3, "#E2E8F0", 0.0003),
      );
    }
    floorFaces.push(
      {
        key: `room${i}-lit`,
        lod: true,
        n: UP,
        noShade: true,
        fill: "#FFE2A0",
        anim: lampOp(i, 0.14),
        pts: [[r.x0, r.y0, zf], [r.x1, r.y0, zf], [r.x1, r.y1, zf], [r.x0, r.y1, zf]],
      },
      {
        key: `room${i}-pool1`,
        lod: true,
        n: UP,
        noShade: true,
        doubleSided: true,
        fill: "#FFD27A",
        anim: lampOp(i, 0.2),
        pts: disc(rcx, rcy, 0.66, zf + 0.001),
      },
      {
        key: `room${i}-pool2`,
        lod: true,
        n: UP,
        noShade: true,
        doubleSided: true,
        fill: "#FFEBB5",
        anim: lampOp(i, 0.3),
        pts: disc(rcx, rcy, 0.36, zf + 0.002),
      },
    );
    const floorLines: LineItem[] = [];
    if (!interacting) {
      const gridCol = "rgba(10,42,74,0.08)";
      if (kind === "classroom" || kind === "dining") {
        for (let g = 1; g < 4; g += 1) {
          const gx = ix0 + (g * (ix1 - ix0)) / 4;
          floorLines.push({ a: [gx, iy0, zf + 0.002], b: [gx, iy1, zf + 0.002], stroke: gridCol, w: 0.6 });
        }
        for (let g = 1; g < 3; g += 1) {
          const gy = iy0 + (g * (iy1 - iy0)) / 3;
          floorLines.push({ a: [ix0, gy, zf + 0.002], b: [ix1, gy, zf + 0.002], stroke: gridCol, w: 0.6 });
        }
      } else {
        for (let g = 1; g < 6; g += 1) {
          const gy = iy0 + (g * (iy1 - iy0)) / 6;
          floorLines.push({ a: [ix0, gy, zf + 0.002], b: [ix1, gy, zf + 0.002], stroke: gridCol, w: 0.6 });
        }
      }
    }
    parts.push({ id: `room${i}-floor`, center: [rcx, rcy, 0], order: -1, faces: floorFaces, lines: floorLines });

    /* walls (camera-facing ones sink to a kerb => cutaway from every angle) */
    const wallIn = dim(pal.wall);
    const walls: { id: string; o: V3; x: number; y: number; w: number; d: number }[] = [
      { id: "b", o: [0, -1, 0], x: r.x0, y: r.y0, w: ROOM_W, d: WALL_T },
      { id: "f", o: [0, 1, 0], x: r.x0, y: r.y1 - WALL_T, w: ROOM_W, d: WALL_T },
      { id: "w", o: [-1, 0, 0], x: r.x0, y: r.y0 + WALL_T, w: WALL_T, d: ROOM_D - WALL_T * 2 },
      { id: "e", o: [1, 0, 0], x: r.x1 - WALL_T, y: r.y0 + WALL_T, w: WALL_T, d: ROOM_D - WALL_T * 2 },
    ];
    const quadX = (key: string, x: number, y0: number, y1: number, z0: number, z1: number, nx: number, extra: Partial<Face>): Face => ({
      key,
      n: [nx, 0, 0],
      noShade: true,
      fill: "#FFFFFF",
      pts: [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]],
      ...extra,
    });
    const quadY = (key: string, y: number, x0: number, x1: number, z0: number, z1: number, ny: number, extra: Partial<Face>): Face => ({
      key,
      n: [0, ny, 0],
      noShade: true,
      fill: "#FFFFFF",
      pts: [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]],
      ...extra,
    });
    walls.forEach((wl) => {
      const ro = rotN(wl.o);
      const facing = ro[0] + ro[1];
      const t = Math.min(1, Math.max(0, (facing + 0.2) / 0.4));
      const h = WALL_H - (WALL_H - WALL_LOW) * t;
      const faces = boxFaces(`room${i}w${wl.id}`, wl.x, wl.y, FLOOR_T, wl.w, wl.d, h, (nv) => {
        if (nv[2] > 0) return "#FFFFFF";
        const inward = nv[0] * wl.o[0] + nv[1] * wl.o[1] < -0.5;
        return inward ? wallIn : "#F3F4F7";
      });

      // wall decorations only while the wall is tall (inner face is visible)
      if (h > WALL_H * 0.85 && !interacting) {
        const k = `room${i}d${wl.id}`;
        if (wl.id === "b") {
          const yy = r.y0 + WALL_T + 0.004;
          if (kind === "classroom") {
            faces.push(
              quadY(`${k}-board`, yy, rcx - 0.55, rcx + 0.55, 0.36, 0.78, 1, { fill: "#F8FAFC", stroke: "#7B8494", sw: 1 }),
              quadY(`${k}-tray`, yy, rcx - 0.55, rcx + 0.55, 0.33, 0.36, 1, { fill: "#9AA3B2" }),
              quadY(`${k}-m1`, yy + 0.002, rcx - 0.45, rcx + 0.05, 0.64, 0.655, 1, { fill: "#3B82F6" }),
              quadY(`${k}-m2`, yy + 0.002, rcx - 0.45, rcx - 0.05, 0.57, 0.585, 1, { fill: "#EF4444" }),
              quadY(`${k}-m3`, yy + 0.002, rcx - 0.45, rcx + 0.2, 0.5, 0.515, 1, { fill: "#16A34A" }),
              quadY(`${k}-clk`, yy, rcx + 0.64, rcx + 0.78, 0.62, 0.76, 1, { fill: "#FFFFFF", stroke: "#4B5563", sw: 1.2 }),
            );
          } else if (kind === "bedroom") {
            faces.push(
              quadY(`${k}-art1`, yy, rcx - 0.2, rcx + 0.2, 0.5, 0.78, 1, { fill: "#93C5FD", stroke: "#8B6B4A", sw: 1.2 }),
              quadY(`${k}-art2`, yy, rcx + 0.34, rcx + 0.6, 0.55, 0.75, 1, { fill: "#FCA5A5", stroke: "#8B6B4A", sw: 1.2 }),
            );
          } else if (kind === "office") {
            faces.push(
              quadY(`${k}-wb`, yy, rcx - 0.4, rcx + 0.4, 0.42, 0.78, 1, { fill: "#F8FAFC", stroke: "#7B8494", sw: 1 }),
              quadY(`${k}-sh1`, yy, rcx + 0.5, rcx + 0.78, 0.5, 0.52, 1, { fill: "#8B6B4A" }),
            );
          } else if (kind === "hallway") {
            for (let g = 0; g < 5; g += 1) {
              const lx = ix0 + 0.08 + g * 0.2;
              faces.push(
                quadY(`${k}-lk${g}`, yy, lx, lx + 0.18, 0.07, 0.75, 1, {
                  fill: g % 2 ? "#7C8CA3" : "#64748B",
                  stroke: "#334155",
                  sw: 0.8,
                }),
              );
            }
            faces.push(
              quadY(`${k}-exd`, yy, rcx + 0.35, rcx + 0.75, FLOOR_T, 0.82, 1, { fill: "#8B5E3C", stroke: "#5B3A22", sw: 1 }),
              quadY(`${k}-exk`, yy - 0.002, rcx + 0.66, rcx + 0.7, 0.42, 0.46, 1, { fill: "#F5D27A" }),
              quadY(`${k}-exs`, yy, rcx + 0.4, rcx + 0.7, 0.88, 0.96, 1, { fill: "#16A34A" }),
            );
          } else {
            faces.push(
              quadY(`${k}-sh1`, yy, rcx - 0.7, rcx + 0.7, 0.62, 0.65, 1, { fill: "#8B6B4A" }),
              quadY(`${k}-sh2`, yy, rcx - 0.7, rcx + 0.7, 0.42, 0.45, 1, { fill: "#8B6B4A" }),
            );
          }
        } else if (wl.id === "w") {
          // window with frame + mullion
          const xx = r.x0 + WALL_T + 0.004;
          faces.push(
            quadX(`${k}-win`, xx, rcy - 0.4, rcy + 0.4, 0.4, 0.86, 1, { fill: "#BFE3FA", stroke: "#FFFFFF", sw: 1.6 }),
            quadX(`${k}-mull`, xx + 0.002, rcy - 0.01, rcy + 0.01, 0.4, 0.86, 1, { fill: "#FFFFFF" }),
            quadX(`${k}-sill`, xx + 0.002, rcy - 0.44, rcy + 0.44, 0.37, 0.4, 1, { fill: "#E5E7EB" }),
          );
        } else if (wl.id === "e") {
          // door
          const xx = r.x1 - WALL_T - 0.004;
          faces.push(
            quadX(`${k}-door`, xx, rcy - 0.2, rcy + 0.2, FLOOR_T, 0.82, -1, { fill: "#8B5E3C", stroke: "#5B3A22", sw: 1 }),
            quadX(`${k}-knob`, xx - 0.002, rcy + 0.12, rcy + 0.16, 0.42, 0.46, -1, { fill: "#F5D27A" }),
          );
        }
      }
      parts.push({
        id: `room${i}-wall-${wl.id}`,
        center: [wl.x + wl.w / 2, wl.y + wl.d / 2, FLOOR_T + h / 2],
        faces,
      });
    });

    /* furniture (skipped while dragging so rotation stays smooth) */
    if (!interacting) {
      const furn = (
        id: string,
        x: number,
        y: number,
        w: number,
        d: number,
        h: number,
        top: string,
        side: string,
        z = FLOOR_T,
      ) => {
        parts.push({
          id: `room${i}-${id}`,
          center: [x + w / 2, y + d / 2, z + h / 2],
          faces: boxFaces(`room${i}${id}`, x, y, z, w, d, h, (nv) => (nv[2] > 0 ? top : side), {
            stroke: "rgba(0,0,0,0.12)",
            sw: 0.4,
          }),
        });
      };
      if (kind === "classroom") {
        furn("td", rcx - 0.3, iy0 + 0.1, 0.6, 0.2, 0.2, "#C79A66", "#9C7248");
        furn("tc", rcx - 0.08, iy0 + 0.33, 0.16, 0.14, 0.09, "#475569", "#334155");
        for (let row = 0; row < 2; row += 1) {
          for (let col = 0; col < 3; col += 1) {
            const dx = rcx + (col - 1) * 0.5 - 0.17;
            const dy = iy0 + 0.62 + row * 0.38;
            furn(`d${row}${col}`, dx, dy, 0.34, 0.2, 0.16, "#D9B382", "#A8814F");
            furn(`c${row}${col}`, dx + 0.08, dy + 0.24, 0.18, 0.12, 0.09, "#3B82F6", "#2B63BD");
          }
        }
      } else if (kind === "office") {
        [-0.78, 0.14].forEach((ox, n) => {
          const dx = rcx + ox;
          furn(`ws${n}`, dx, iy0 + 0.1, 0.64, 0.3, 0.18, "#E5E7EB", "#B8BDC7");
          furn(`mon${n}`, dx + 0.21, iy0 + 0.17, 0.22, 0.03, 0.15, "#1F2430", "#111827", FLOOR_T + 0.18);
          furn(`ch${n}`, dx + 0.23, iy0 + 0.46, 0.17, 0.15, 0.1, "#334155", "#1E293B");
        });
        furn("meet", rcx - 0.4, iy0 + 0.9, 0.8, 0.34, 0.17, "#D9B382", "#A8814F");
        furn("cab", ix1 - 0.24, iy0 + 0.05, 0.2, 0.34, 0.42, "#9AA3B2", "#7B8494");
      } else if (kind === "bedroom") {
        const bx = ix0 + 0.15;
        const by = iy0 + 0.14;
        furn("bed", bx, by, 0.7, 0.98, 0.1, "#F3F4F6", "#8B6B4A");
        furn("pil", bx + 0.08, by + 0.06, 0.54, 0.2, 0.05, "#FFFFFF", "#E5E7EB", FLOOR_T + 0.1);
        furn("blk", bx + 0.02, by + 0.36, 0.66, 0.6, 0.03, "#60A5FA", "#3B82F6", FLOOR_T + 0.1);
        furn("ns", bx + 0.78, by, 0.22, 0.22, 0.15, "#C79A66", "#9C7248");
        furn("wd", ix1 - 0.3, iy0 + 0.3, 0.26, 0.5, 0.55, "#D9C3A0", "#B59E78");
      } else if (kind === "hallway") {
        furn("bench", rcx - 0.55, iy1 - 0.36, 0.8, 0.16, 0.12, "#C79A66", "#9C7248");
        furn("plant", ix1 - 0.22, iy0 + 0.08, 0.14, 0.14, 0.32, "#22C55E", "#B45309");
        furn("bin", ix0 + 0.06, iy1 - 0.3, 0.14, 0.14, 0.2, "#94A3B8", "#64748B");
      } else {
        furn("ctr", ix0 + 0.1, iy0 + 0.04, ix1 - ix0 - 0.2, 0.24, 0.2, "#CBD5E1", "#94A3B8");
        furn("tbl", rcx - 0.4, rcy - 0.02, 0.8, 0.46, 0.17, "#D9B382", "#A8814F");
        [-0.3, 0.3].forEach((ox, n) => {
          furn(`sa${n}`, rcx + ox - 0.07, rcy - 0.2, 0.14, 0.12, 0.09, "#F59E0B", "#B7791F");
          furn(`sb${n}`, rcx + ox - 0.07, rcy + 0.5, 0.14, 0.12, 0.09, "#F59E0B", "#B7791F");
        });
      }
    }

    /* soft light cone from the ceiling bulb to its floor pool */
    {
      const dx = (cosA - sinA) / Math.SQRT2;
      const dy = (-sinA - cosA) / Math.SQRT2;
      const cr = 0.66;
      parts.push({
        id: `room${i}-cone`,
        center: [rcx, rcy, bulbZ],
        order: 4,
        faces: [
          {
            key: `room${i}-cone`,
            lod: true,
            n: UP,
            noShade: true,
            doubleSided: true,
            fill: "#FFE29A",
            anim: lampOp(i, 0.13),
            pts: [[rcx, rcy, bulbZ], [rcx + dx * cr, rcy + dy * cr, zf], [rcx - dx * cr, rcy - dy * cr, zf]],
          },
        ],
      });
    }

    /* ceiling: ghost panel + corner posts + hanging bulb */
    parts.push({
      id: `room${i}-ceiling`,
      center: [rcx, rcy, CEIL_Z],
      order: 5,
      faces: [
        {
          key: `room${i}-ceil`,
          n: UP,
          noShade: true,
          doubleSided: true,
          fill: "#FFFFFF",
          fillOpacity: dark ? 0.06 : 0.1,
          stroke: dark ? "rgba(255,255,255,0.35)" : "rgba(10,42,74,0.3)",
          sw: 0.9,
          pts: [[r.x0, r.y0, CEIL_Z], [r.x1, r.y0, CEIL_Z], [r.x1, r.y1, CEIL_Z], [r.x0, r.y1, CEIL_Z]],
        },
      ],
      lines: interacting ? [{ a: [rcx, rcy, CEIL_Z], b: [rcx, rcy, bulbZ + 0.08], stroke: "#6B7383", w: 1.2 }] : [
        ...([[r.x0, r.y0], [r.x1, r.y0], [r.x1, r.y1], [r.x0, r.y1]] as V2[]).map(
          ([px, py]): LineItem => ({
            a: [px, py, FLOOR_T],
            b: [px, py, CEIL_Z],
            stroke: dark ? "rgba(255,255,255,0.4)" : "rgba(10,42,74,0.3)",
            w: 1.1,
          }),
        ),
        { a: [rcx, rcy, CEIL_Z], b: [rcx, rcy, bulbZ + 0.08], stroke: "#6B7383", w: 1.2 },
      ],
      sprites: [
        { p: [rcx, rcy, CEIL_Z], r: 0.12, minPx: 4, fill: supplyColor, opacity: on ? 0.95 : 0.35 },
        { p: [rcx, rcy, CEIL_Z], r: 0.07, minPx: 2.5, fill: "#8A93A3" },
        { p: [rcx, rcy, bulbZ + 0.04], r: 0.05, minPx: 2, fill: "#6B7383" },
        { p: [rcx, rcy, bulbZ], r: 0.62, fill: "#FFB23E", anim: lampOp(i, 0.14), lod: true },
        { p: [rcx, rcy, bulbZ], r: 0.34, fill: "#FFC857", anim: lampOp(i, 0.3), lod: true },
        { p: [rcx, rcy, bulbZ], r: 0.13, minPx: 4, fill: dark ? "#5A6170" : "#A3AABA" },
        { p: [rcx, rcy, bulbZ], r: 0.13, minPx: 4, fill: "#FFF1B8", anim: lamp },
        { p: [rcx - 0.03, rcy, bulbZ + 0.04], r: 0.04, minPx: 1.2, fill: "#FFFFFF", opacity: on ? 0.85 : 0.5, lod: true },
      ],
    });

    groups.push({ id: `room${i}`, layer: 2, center: [rcx, rcy, 0.5], parts });
  });

  /* ---- sort + render ---- */
  groups.sort((a, b) => a.layer - b.layer || depthOf(a.center) - depthOf(b.center));

  const renderFace = (f: Face) => {
    if (f.lod && interacting) return null;
    if (!f.doubleSided && !visible(f.n)) return null;
    const points = ptsStr(f.pts);
    let fill = f.fill;
    let ov = f.overlay;
    if (!f.noShade && fill !== "none") {
      const k = shadeK(f.n);
      if (k < 0.995) {
        const d = darken(fill, k);
        if (d) fill = d;
        else if (!ov) ov = { fill: "#000000", opacity: 1 - k };
      }
    }
    const animated = !!f.anim && !interacting;
    const Poly: any = animated ? AnimatedPolygon : Polygon;
    const staticOp = f.anim && interacting ? staticValue(f.anim) : f.fillOpacity;
    return (
      <React.Fragment key={f.key}>
        <Poly
          points={points}
          fill={fill}
          fillOpacity={animated ? f.anim : staticOp}
          stroke={f.stroke}
          strokeWidth={f.sw}
          strokeDasharray={f.dash}
          onPress={f.onPress}
        />
        {ov && (
          <Polygon
            points={points}
            fill={ov.fill}
            fillOpacity={ov.opacity}
            onPress={f.onPress}
          />
        )}
      </React.Fragment>
    );
  };

  const renderPart = (p: Part) => (
    <React.Fragment key={p.id}>
      {p.faces.map(renderFace)}
      {p.lines?.map((l, i) => {
        const [x1, y1] = pr(l.a);
        const [x2, y2] = pr(l.b);
        return (
          <Line
            key={`${p.id}-l${i}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={l.stroke}
            strokeWidth={l.w}
            strokeOpacity={l.opacity}
            strokeLinecap="round"
          />
        );
      })}
      {p.sprites?.map((s, i) => {
        if (s.lod && interacting) return null;
        const [sx, sy] = pr(s.p);
        const animatedC = !!s.anim && !interacting;
        const C: any = animatedC ? AnimatedCircle : Circle;
        return (
          <C
            key={`${p.id}-s${i}`}
            cx={sx}
            cy={sy}
            r={Math.max(s.minPx ?? 0, s.r * U)}
            fill={s.fill}
            fillOpacity={animatedC ? s.anim : s.anim ? staticValue(s.anim) : s.opacity ?? 1}
          />
        );
      })}
    </React.Fragment>
  );

  const hintColor = dark ? "rgba(255,255,255,0.55)" : "rgba(10,42,74,0.55)";
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


  return (
    <View
      style={{ width: "100%", aspectRatio: VB_W / VB_H }}
    >
      <Svg width="100%" height="100%" viewBox={`0 0 ${VB_W} ${VB_H}`}>
        {groups.map((g) => {
          const parts = [...g.parts].sort(
            (a, b) =>
              (a.order ?? 0) - (b.order ?? 0) ||
              ((a.order ?? 0) < 0 ? 0 : depthOf(a.center) - depthOf(b.center)),
          );
          return <G key={g.id}>{parts.map(renderPart)}</G>;
        })}

        {/* box names */}
        {(() => {
          const ink = dark ? "#FFFFFF" : "#0A2A4A";
          const lbl = (key: string, p: V3, text: string, color: string = ink) => {
            const [lx, ly] = pr(p);
            return (
              <SvgText
                key={key}
                x={lx}
                y={ly}
                fontSize={6.5}
                fontWeight="700"
                fill={color}
                textAnchor="middle"
              >
                {text}
              </SvgText>
            );
          };
          const out = [
            lbl("l-tiles", [X / 2, -0.05, 0.45], "TILES"),
            lbl(
              "l-ctrl",
              [midX, ctrl.y + ctrl.d / 2, ctrl.h + 0.25],
              isShutdown ? "CONTROL BOX · SHUTDOWN" : "CONTROL BOX",
              isShutdown ? SHUTDOWN_RED : ink,
            ),
            lbl("l-bat", [bx, bat.y + bat.d / 2, bat.h + 0.25], "BATTERY"),
            lbl("l-grid", [gx, grid.y + grid.d / 2, grid.h + 1.2], "GRID", gridLive ? GRID_GREEN : ink),
          ];
          rooms.forEach((r, i) => {
            const nm = (roomNames[i] || `Room ${i + 1}`).slice(0, 16).toUpperCase();
            out.push(lbl(`l-room${i}`, [(r.x0 + r.x1) / 2, r.y0, CEIL_Z + 0.2], nm));
          });
          return out;
        })()}

        {/* energy particles (footstep detected / tapped tile) */}
        {flow && !interacting &&
          [0, 1, 2].map((i) => (
            <FlowParticle
              key={`${flow.id}-${i}`}
              points={flow.pts3.map(pr)}
              delay={i * 150}
              duration={1100}
              onArrive={handleArrive}
            />
          ))}
      </Svg>

      <View
        pointerEvents="none"
        style={{ position: "absolute", left: scale(2), top: scale(2) }}
      >
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
              color: isShutdown ? SHUTDOWN_RED : dark ? "#FFFFFF" : "#0A2A4A",
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

      {/* in-scene light switch for every room (same action as the switch below) */}
      {rooms.map((r, i) => {
        const [lx, ly] = pr([(r.x0 + r.x1) / 2, r.y0, CEIL_Z + 0.2]);
        const on = !!bulbs[i];
        const off = roomSwitchDisabled || !onToggleRoom;
        const TW = scale(26);
        const TH = scale(14);
        const K = scale(10);
        const PADK = (TH - K) / 2;
        return (
          <Pressable
            key={`sw${i}`}
            disabled={off}
            onPress={() => onToggleRoom?.(i)}
            hitSlop={scale(8)}
            accessibilityRole="switch"
            accessibilityLabel={`${roomNames[i] || `Room ${i + 1}`} light`}
            accessibilityState={{ checked: on, disabled: off }}
            style={{
              position: "absolute",
              left: `${(lx / VB_W) * 100}%`,
              top: `${((ly + 3) / VB_H) * 100}%`,
              marginLeft: -TW / 2,
            }}
          >
            <View
              style={{
                width: TW,
                height: TH,
                borderRadius: TH / 2,
                justifyContent: "center",
                opacity: off ? 0.5 : 1,
                backgroundColor: on
                  ? BRAND_ORANGE
                  : dark
                    ? "rgba(255,255,255,0.28)"
                    : "rgba(10,42,74,0.22)",
              }}
            >
              <View
                style={{
                  width: K,
                  height: K,
                  borderRadius: K / 2,
                  backgroundColor: "#FFFFFF",
                  marginLeft: on ? TW - K - PADK : PADK,
                }}
              />
            </View>
          </Pressable>
        );
      })}

      <Text
        pointerEvents="none"
        style={{
          position: "absolute",
          left: scale(2),
          bottom: 0,
          fontSize: scale(6.5),
          color: hintColor,
        }}
      >
        Tiles · Battery · Grid (back) · Rooms (front) · tap a tile to simulate a step
      </Text>
    </View>
  );
}