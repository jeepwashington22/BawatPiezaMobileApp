import React, { useEffect, useMemo, useRef, useState } from "react";
import { PanResponder, Pressable, View } from "react-native";
import Svg, { Circle, G, Line, Polygon, Text as SvgText } from "react-native-svg";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "./app-text";
import { getHeatmapTileColor, HeatmapTileGrid } from "./heatmap-tile-grid";
import { scale } from "./glass-ui";

/**
 * Library-free 3D heatmap scene: plain react-native-svg + our own projection.
 * No three.js / react-three-fiber / expo-gl.
 *
 *  FIELD  : every installed tile is a triangular isometric tile on a slab
 *           (cream base, dynamo + springs + flywheel layer, plates). The top
 *           plate is coloured with getHeatmapTileColor() exactly like the grid.
 *           Drag = orbit 360 degrees, tap a tile = select it.
 *  INSIDE : "Inside view" opens the selected tile as an exploded model.
 *  VIEW   : "View" button jumps the camera to Isometric / Front / Right /
 *           Back / Left / Top.
 *
 * Same props as the old scene: tiles, maxVisibleTiles, viewMode, activeThreshold.
 */

/* ------------------------------------------------------------------ */
/* tunables                                                            */
/* ------------------------------------------------------------------ */

const W = 360; // svg viewBox
const H = 300;
const SCENE_ASPECT = W / H;
const SLAB_H = 0.2;
const MARGIN = 0.16;
const MAX_TILES = 120;
const LIFT = 0.12; // selected tile rises
const ORBIT_SPEED = 0.012; // rad per dragged px
const ORBIT_DAMPING = 14;
const ORBIT_FRICTION = 0.94;
const MAX_SPIN = 14;
const ORANGE = "#F97316";

export type HeatTile = { id: number; label: string; traffic: number };

export type HeatmapTileSceneProps = {
  tiles: HeatTile[];
  maxVisibleTiles?: number;
  viewMode?: "view" | "diagnostic";
  activeThreshold?: number;
  dark?: boolean;
};

/* ------------------------------------------------------------------ */
/* tiny vector + colour helpers                                        */
/* ------------------------------------------------------------------ */

type V3 = [number, number, number];
type Pt = [number, number];

const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul3 = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm3 = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const RGB = new Map<string, [number, number, number]>();
function rgb(c: string): [number, number, number] {
  let v = RGB.get(c);
  if (!v) {
    const m = c.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (m) {
      let h = m[1];
      if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
      v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    } else v = [249, 115, 22];
    RGB.set(c, v);
  }
  return v;
}
const hx = (n: number) =>
  Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
function shade(c: string, f: number): string {
  const [r, g, b] = rgb(c);
  return `#${hx(r * f)}${hx(g * f)}${hx(b * f)}`;
}
function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  return `#${hx(x[0] + (y[0] - x[0]) * t)}${hx(x[1] + (y[1] - x[1]) * t)}${hx(x[2] + (y[2] - x[2]) * t)}`;
}
const toHexColor = (c: string) => {
  const [r, g, b] = rgb(c);
  return `#${hx(r)}${hx(g)}${hx(b)}`;
};

/** two triangles per square box; `rows` decides the field's proportions */
function cellRC(k: number, rows: number) {
  const box = Math.floor(k / 2);
  return { col: Math.floor(box / rows), row: box % rows, half: k % 2 };
}
function fieldLayout(n: number) {
  const boxes = Math.max(1, Math.ceil(n / 2));
  const rows = boxes > 1 ? Math.max(2, Math.round(Math.sqrt(boxes / 1.3))) : 1;
  const cols = Math.ceil(boxes / rows);
  const X = cols + MARGIN * 2;
  const Z = rows + MARGIN * 2;
  return { rows, cols, X, Z, R: Math.hypot(X, Z) / 2 };
}

/* ------------------------------------------------------------------ */
/* solids: convex prisms made of flat faces                            */
/* ------------------------------------------------------------------ */

type Face = { v: V3[]; n: V3 };
type Solid = {
  faces: Face[];
  center: V3;
  color: string;
  layer: number; // which explode layer it belongs to
  mech?: boolean; // mechanism part (sorted by depth when assembled)
  plate?: boolean; // gets a darker outline
  role?: "top"; // top plate = heat colour
  tag?: string; // label anchor
};

const COPPER = "#C8794B";
const STEEL = "#B9C0CB";
const DARK = "#14161B";
const CREAM = "#DAD3C3";

function makeSolid(
  ringA: V3[],
  ext: V3,
  color: string,
  layer: number,
  o: Partial<Pick<Solid, "mech" | "plate" | "role" | "tag">> = {},
): Solid {
  const ringB = ringA.map((p) => add3(p, ext));
  const all = [...ringA, ...ringB];
  const center = mul3(all.reduce(add3, [0, 0, 0] as V3), 1 / all.length);
  const n = ringA.length;
  const raw: V3[][] = [ringA, ringB];
  for (let i = 0; i < n; i++) {
    raw.push([ringA[i], ringA[(i + 1) % n], ringB[(i + 1) % n], ringB[i]]);
  }
  const faces: Face[] = raw.map((v) => {
    let nn = cross3(sub3(v[1], v[0]), sub3(v[2], v[0]));
    const fc = mul3(v.reduce(add3, [0, 0, 0] as V3), 1 / v.length);
    if (dot3(nn, sub3(fc, center)) < 0) nn = mul3(nn, -1);
    return { v, n: norm3(nn) };
  });
  return { faces, center, color, layer, ...o };
}

const prism = (
  pts: Pt[],
  y0: number,
  h: number,
  color: string,
  layer: number,
  o?: Parameters<typeof makeSolid>[4],
) =>
  makeSolid(
    pts.map(([x, z]) => [x, y0, z] as V3),
    [0, h, 0],
    color,
    layer,
    o,
  );

function cylY(cx: number, cz: number, y0: number, r: number, h: number, sides: number, color: string, layer: number, o?: Parameters<typeof makeSolid>[4]) {
  const ring: V3[] = Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return [cx + Math.cos(a) * r, y0, cz + Math.sin(a) * r] as V3;
  });
  return makeSolid(ring, [0, h, 0], color, layer, o);
}

/** horizontal cylinder centred on `c`, lying along the unit vector `axis` */
function cylAxis(c: V3, axis: V3, len: number, r: number, sides: number, color: string, layer: number, o?: Parameters<typeof makeSolid>[4]) {
  const e1: V3 = [0, 1, 0];
  const e2 = norm3(cross3(axis, e1));
  const start = sub3(c, mul3(axis, len / 2));
  const ring: V3[] = Array.from({ length: sides }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return add3(start, add3(mul3(e1, Math.cos(a) * r), mul3(e2, Math.sin(a) * r)));
  });
  return makeSolid(ring, mul3(axis, len), color, layer, o);
}

/** box lying on the ground, turned by `ang` around Y */
function boxY(cx: number, cz: number, y0: number, len: number, wid: number, h: number, ang: number, color: string, layer: number, o?: Parameters<typeof makeSolid>[4]) {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const corners: Pt[] = [
    [-len / 2, -wid / 2],
    [len / 2, -wid / 2],
    [len / 2, wid / 2],
    [-len / 2, wid / 2],
  ];
  const ring = corners.map(([x, z]) => [cx + x * ca - z * sa, y0, cz + x * sa + z * ca] as V3);
  return makeSolid(ring, [0, h, 0], color, layer, o);
}

const centroidOf = (p: Pt[]): Pt => [
  (p[0][0] + p[1][0] + p[2][0]) / 3,
  (p[0][1] + p[1][1] + p[2][1]) / 3,
];
function shrinkTri(p: Pt[], f: number): Pt[] {
  const [cx, cz] = centroidOf(p);
  return p.map(([x, z]) => [cx + (x - cx) * f, cz + (z - cz) * f] as Pt);
}
const toward = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/* ------------------------------------------------------------------ */
/* the assembled tile (tile-local coordinates, cell origin at 0,0)     */
/* ------------------------------------------------------------------ */

// layers (index = explode layer): base, frame, springs, drive train, spacer,
// pressure, band, top plate
const OFF = [0, 0.11, 0.25, 0.39, 0.69, 0.87, 1.0, 1.08];

const BASE_H = 0.03;
const Y_FRAME = 0.03;
const Y_GAP = 0.06;
const GAP_H = 0.26;
const Y_SPACER = 0.32;
const Y_DARK = 0.34;
const Y_BAND = 0.385;
const Y_TOP = 0.405;
const TOP_H = 0.045;
export const TILE_H = Y_TOP + TOP_H; // 0.45

type Detail = 0 | 1 | 2;
const TILE_CACHE = new Map<string, { solids: Solid[]; centroid: Pt }>();

function buildTile(half: number, detail: Detail) {
  const key = `${half === 0 ? 0 : 1}-${detail}`;
  const hit = TILE_CACHE.get(key);
  if (hit) return hit;

  // right-angle corner first -> tri[0]
  const raw: Pt[] = half === 0 ? [[0, 0], [1, 0], [0, 1]] : [[1, 1], [0, 1], [1, 0]];
  const tri = shrinkTri(raw, 0.92);
  const c = centroidOf(tri);
  const S: Solid[] = [];

  S.push(prism(tri, 0, BASE_H, CREAM, 0, { plate: true, tag: "base" }));
  S.push(prism(shrinkTri(tri, 0.88), Y_FRAME, 0.03, DARK, 1, { plate: true }));

  if (detail >= 1) {
    // the dynamo lies on the base along the edge that faces the default camera
    const [da, db] = half === 0 ? [tri[1], tri[2]] : [tri[0], tri[1]];
    const m: Pt = [(da[0] + db[0]) / 2, (da[1] + db[1]) / 2];
    const inw = norm3([c[0] - m[0], 0, c[1] - m[1]]);
    const dm: V3 = [m[0] + inw[0] * 0.105, Y_GAP + 0.09, m[1] + inw[2] * 0.105];
    const axis = norm3([db[0] - da[0], 0, db[1] - da[1]]);
    S.push(cylAxis(dm, axis, 0.4, 0.085, 10, "#3B414D", 1, { mech: true }));
    S.push(cylAxis(dm, axis, 0.18, 0.095, 10, "#D98550", 1, { mech: true, tag: "dyn" }));
    for (const sgn of [-1, 1]) {
      S.push(cylAxis(add3(dm, mul3(axis, 0.225 * sgn)), axis, 0.07, 0.026, 6, STEEL, 1, { mech: true }));
    }

    // three return springs (seat + core, rings at full detail)
    tri.forEach((v, i) => {
      const sp = toward(v, c, 0.3);
      S.push(cylY(sp[0], sp[1], Y_GAP, 0.055, 0.01, 6, "#6B7383", 2, { mech: true }));
      S.push(cylY(sp[0], sp[1], Y_GAP, 0.025, GAP_H, 6, STEEL, 2, { mech: true, tag: i === 1 ? "spr" : undefined }));
      if (detail === 2) {
        for (let k = 0; k < 7; k++) {
          S.push(cylY(sp[0], sp[1], Y_GAP + 0.02 + k * 0.034, 0.043, 0.012, 6, "#E1E5EB", 2, { mech: true }));
        }
      }
    });

    // shaft, gear, copper flywheel discs
    const g: Pt = [c[0] + inw[0] * 0.08, c[1] + inw[2] * 0.08];
    S.push(cylY(g[0], g[1], Y_GAP, 0.02, GAP_H, 6, STEEL, 3, { mech: true }));
    S.push(cylY(g[0], g[1], 0.17, 0.075, 0.02, 10, "#8B93A1", 3, { mech: true, tag: "gear" }));
    if (detail === 2) {
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        S.push(boxY(g[0] + Math.cos(a) * 0.088, g[1] + Math.sin(a) * 0.088, 0.17, 0.03, 0.026, 0.02, a, "#8B93A1", 3, { mech: true }));
      }
      S.push(cylY(g[0] + 0.05, g[1] + 0.03, 0.272, 0.07, 0.012, 10, "#B8683C", 3, { mech: true }));
    }
    S.push(cylY(g[0], g[1], 0.248, 0.1, 0.012, 12, COPPER, 3, { mech: true, tag: "fly" }));
  }

  S.push(prism(shrinkTri(tri, 0.98), Y_SPACER, 0.02, "#DCD5C5", 4, { plate: true, tag: "spacer" }));
  S.push(prism(shrinkTri(tri, 0.99), Y_DARK, 0.045, DARK, 5, { plate: true, tag: "dark" }));
  S.push(prism(tri, Y_BAND, 0.02, CREAM, 6, { plate: true }));
  S.push(prism(tri, Y_TOP, TOP_H, "#3A3E47", 7, { plate: true, role: "top", tag: "top" }));

  const made = { solids: S, centroid: c };
  TILE_CACHE.set(key, made);
  return made;
}

/* ------------------------------------------------------------------ */
/* camera + drawing                                                    */
/* ------------------------------------------------------------------ */

type Cam = { dir: V3; right: V3; up: V3; focus: V3; s: number; cx: number; cy: number };

function makeCam(yaw: number, pitch: number, focus: V3, s: number): Cam {
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const sp = Math.sin(pitch);
  const cp = Math.cos(pitch);
  return {
    dir: [sy * cp, sp, cy * cp], // from the scene toward the camera
    right: [cy, 0, -sy],
    up: [-sp * sy, cp, -sp * cy],
    focus,
    s,
    cx: W / 2,
    cy: H / 2,
  };
}
const proj = (cam: Cam, w: V3): Pt => {
  const d = sub3(w, cam.focus);
  return [cam.cx + cam.s * dot3(d, cam.right), cam.cy - cam.s * dot3(d, cam.up)];
};

const LIGHT = norm3([0.45, 0.85, 0.35]);

function drawSolids(
  prefix: string,
  solids: Solid[],
  origin: V3,
  f: number,
  cam: Cam,
  heat: string,
  hl: "none" | "glow" | "sel",
): React.ReactNode[] {
  const assembled = f < 0.15;
  const items = solids
    .map((s) => {
      const cw: V3 = [
        s.center[0] + origin[0],
        s.center[1] + origin[1] + OFF[s.layer] * f,
        s.center[2] + origin[2],
      ];
      return {
        s,
        off: OFF[s.layer] * f,
        depth: dot3(cw, cam.dir),
        order: s.mech ? (assembled ? 15 : s.layer * 10 + 1) : s.layer * 10,
      };
    })
    .sort((a, b) => a.order - b.order || a.depth - b.depth);

  const nodes: React.ReactNode[] = [];
  items.forEach(({ s, off }, si) => {
    let base = s.role === "top" ? heat : s.color;
    if (s.role === "top" && hl === "glow") base = mix(base, "#FFFFFF", 0.18);
    if (s.role === "top" && hl === "sel") base = mix(base, "#FFFFFF", 0.22);
    s.faces.forEach((fc, fi) => {
      if (dot3(fc.n, cam.dir) <= 0.02) return;
      const lf = 0.55 + 0.5 * Math.max(0, dot3(fc.n, LIGHT));
      const fill = shade(base, lf);
      let stroke = s.plate ? shade(base, lf * 0.55) : fill;
      let sw = s.plate ? 0.6 : 0.5;
      if (s.role === "top" && hl !== "none") {
        stroke = hl === "sel" ? "#FFFFFF" : "#FDBA74";
        sw = hl === "sel" ? 1.6 : 1.3;
      }
      const pts = fc.v
        .map((v) => {
          const p = proj(cam, [v[0] + origin[0], v[1] + origin[1] + off, v[2] + origin[2]]);
          return `${p[0].toFixed(1)},${p[1].toFixed(1)}`;
        })
        .join(" ");
      nodes.push(
        <Polygon
          key={`${prefix}-${si}-${fi}`}
          points={pts}
          fill={fill}
          stroke={stroke}
          strokeWidth={sw}
          strokeLinejoin="round"
        />,
      );
    });
  });
  return nodes;
}

/* ------------------------------------------------------------------ */
/* view presets + labels                                               */
/* ------------------------------------------------------------------ */

const START_VIEW = { yaw: Math.PI / 4, pitch: 0.82 };

type ViewPresetKey = "iso" | "front" | "right" | "back" | "left" | "top";
const VIEW_PRESETS: { key: ViewPresetKey; label: string; yaw: number; pitch: number }[] = [
  { key: "iso", label: "Isometric", yaw: START_VIEW.yaw, pitch: START_VIEW.pitch },
  { key: "front", label: "Front", yaw: 0, pitch: 0.2 },
  { key: "right", label: "Right", yaw: Math.PI / 2, pitch: 0.2 },
  { key: "back", label: "Back", yaw: Math.PI, pitch: 0.2 },
  { key: "left", label: "Left", yaw: -Math.PI / 2, pitch: 0.2 },
  { key: "top", label: "Top", yaw: START_VIEW.yaw, pitch: 1.45 },
];

const INSIDE_LABELS: { tag: string; title: string; sub: string; side: "l" | "r" }[] = [
  { tag: "top", title: "Tread plate", sub: "Foot load surface", side: "r" },
  { tag: "dark", title: "Pressure layer", sub: "Spreads the step", side: "r" },
  { tag: "spacer", title: "Spacer plate", sub: "Carries the load", side: "r" },
  { tag: "gear", title: "Gear & clutch", sub: "One-way drive", side: "l" },
  { tag: "fly", title: "Flywheel", sub: "Smooths output", side: "l" },
  { tag: "dyn", title: "Dynamo", sub: "Generator", side: "l" },
  { tag: "spr", title: "Springs", sub: "Return the plate", side: "r" },
  { tag: "base", title: "Base frame", sub: "Guides & mounts", side: "l" },
];

/* ------------------------------------------------------------------ */
/* component                                                           */
/* ------------------------------------------------------------------ */

type ViewState = {
  yaw: number;
  pitch: number;
  tYaw: number;
  tPitch: number;
  vel: number;
  dragging: boolean;
};

function HeatmapTileSceneInner({
  tiles,
  maxVisibleTiles,
  viewMode = "view",
  activeThreshold = 0.75,
  dark = false,
}: HeatmapTileSceneProps) {
  const list = useMemo(
    () => tiles.slice(0, Math.min(maxVisibleTiles ?? tiles.length, MAX_TILES)),
    [tiles, maxVisibleTiles],
  );
  const n = list.length;
  const layout = useMemo(() => fieldLayout(n), [n]);
  const { rows, X, Z, R } = layout;

  const [selected, setSelected] = useState<number | null>(null);
  const [inside, setInside] = useState(false);
  const [exploded, setExploded] = useState(true);
  const [viewMenu, setViewMenu] = useState(false);
  const [activeView, setActiveView] = useState<ViewPresetKey | null>("iso");
  const activeViewRef = useRef<ViewPresetKey | null>("iso");
  const [, setTick] = useState(0);

  const selIdx = selected !== null && selected < n ? selected : null;
  const selTile = selIdx !== null ? list[selIdx] : null;
  const onSelect = useRef((k: number) => setSelected((cur) => (cur === k ? null : k))).current;

  /* ---- camera + explode animation (refs; one repaint per frame) ---- */
  const view = useRef<ViewState>({
    ...START_VIEW,
    tYaw: START_VIEW.yaw,
    tPitch: START_VIEW.pitch,
    vel: 0,
    dragging: false,
  });
  const explodeF = useRef(0);
  const explodeTarget = useRef(0);
  explodeTarget.current = inside && exploded ? 1 : 0;
  const busy = useRef(false);
  const raf = useRef<number | null>(null);
  const lastT = useRef(0);

  const stepRef = useRef<() => void>(() => {});
  stepRef.current = () => {
    raf.current = null;
    const now = Date.now();
    const dt = Math.min(0.05, Math.max(0.001, (now - lastT.current) / 1000));
    lastT.current = now;
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

    const dF = explodeTarget.current - explodeF.current;
    if (Math.abs(dF) > 0.002) {
      explodeF.current += dF * (1 - Math.exp(-dt * 5));
      moving = true;
    } else explodeF.current = explodeTarget.current;

    busy.current = moving;
    setTick((t) => t + 1);
    if (moving) raf.current = requestAnimationFrame(() => stepRef.current());
  };
  const kick = () => {
    if (raf.current === null) {
      lastT.current = Date.now();
      raf.current = requestAnimationFrame(() => stepRef.current());
    }
  };
  useEffect(() => {
    kick();
  }, [inside, exploded]);
  useEffect(
    () => () => {
      if (raf.current !== null) cancelAnimationFrame(raf.current);
    },
    [],
  );

  /* ---- orbit by dragging ---- */
  const startView = useRef({ yaw: 0, pitch: 0 });
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, g) =>
        Math.abs(g.dx) > 5 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => {
        const v = view.current;
        if (activeViewRef.current !== null) {
          activeViewRef.current = null;
          setActiveView(null);
        }
        v.dragging = true;
        v.vel = 0;
        startView.current = { yaw: v.tYaw, pitch: v.tPitch };
        kick();
      },
      onPanResponderMove: (_, g) => {
        const v = view.current;
        v.tYaw = startView.current.yaw - g.dx * ORBIT_SPEED;
        v.tPitch = Math.min(1.45, Math.max(0.15, startView.current.pitch + g.dy * 0.004));
        kick();
      },
      onPanResponderRelease: (_, g) => {
        const v = view.current;
        v.dragging = false;
        v.vel = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, -g.vx * 1000 * ORBIT_SPEED));
        kick();
      },
      onPanResponderTerminate: () => {
        view.current.dragging = false;
        kick();
      },
      onPanResponderTerminationRequest: () => false,
    }),
  ).current;

  const applyView = (p: (typeof VIEW_PRESETS)[number]) => {
    const v = view.current;
    const turn = Math.PI * 2;
    const turns = Math.round((v.tYaw - p.yaw) / turn); // shortest way round
    v.tYaw = p.yaw + turns * turn;
    v.tPitch = p.pitch;
    v.vel = 0;
    activeViewRef.current = p.key;
    setActiveView(p.key);
    setViewMenu(false);
    kick();
  };

  const openInside = () => {
    explodeF.current = 0;
    setExploded(true);
    setInside(true);
  };
  const closeInside = () => setInside(false);

  const heat = selTile ? toHexColor(getHeatmapTileColor(selTile.traffic)) : ORANGE;
  const sceneInk = dark ? "#FFFFFF" : "#0A2A4A";
  const hintColor = dark
    ? "rgba(255,255,255,0.6)"
    : "rgba(10,42,74,0.62)";
  const controlSurface = dark
    ? "rgba(255,255,255,0.14)"
    : "rgba(10,42,74,0.08)";
  const menuSurface = dark ? "rgba(10,42,74,0.96)" : "rgba(255,255,255,0.96)";
  const pct = selTile ? Math.round(selTile.traffic * 100) : 0;
  const diagnostic = viewMode === "diagnostic";

  /* ---- slab (static per layout) ---- */
  const slab = useMemo(
    () =>
      makeSolid(
        [[0, 0, 0], [X, 0, 0], [X, 0, Z], [0, 0, Z]],
        [0, SLAB_H, 0],
        "#E6E8EE",
        0,
        { plate: true },
      ),
    [X, Z],
  );

  if (n === 0) return null;

  /* ---- build this frame ---- */
  const v = view.current;
  const f = explodeF.current;
  const detail: Detail = busy.current ? 0 : n <= 12 ? 2 : n <= 48 ? 1 : 0;
  let nodes: React.ReactNode[] = [];
  let labelNodes: React.ReactNode[] = [];

  if (inside) {
    const model = buildTile(selTile ? (selIdx! % 2) : 0, 2);
    const origin: V3 = [-model.centroid[0], 0, -model.centroid[1]];
    const cam = makeCam(v.yaw, v.pitch, [0, 0.2 + 0.55 * f, 0], 0.34 * W);
    nodes = drawSolids("in", model.solids, origin, f, cam, heat, "none");

    // anchor each label on its part, then space the labels out per side
    const anchors = INSIDE_LABELS.map((l, i) => {
      const s = model.solids.find((x) => x.tag === l.tag);
      if (!s) return null;
      const p = proj(cam, [
        s.center[0] + origin[0],
        s.center[1] + origin[1] + OFF[s.layer] * f,
        s.center[2] + origin[2],
      ]);
      return { l, i, p, ly: p[1] };
    }).filter(Boolean) as { l: (typeof INSIDE_LABELS)[number]; i: number; p: Pt; ly: number }[];
    (["l", "r"] as const).forEach((side) => {
      const group = anchors.filter((a) => a.l.side === side).sort((a, b) => a.p[1] - b.p[1]);
      group.forEach((a, gi) => {
        if (gi > 0) a.ly = Math.max(a.ly, group[gi - 1].ly + 19);
      });
    });
    labelNodes = anchors.map(({ l, i, p, ly }) => {
      const left = l.side === "l";
      const tx = left ? p[0] - 26 : p[0] + 26;
      return (
        <G key={`lb-${i}`} pointerEvents="none">
          <Line x1={p[0]} y1={p[1]} x2={tx} y2={ly} stroke={ORANGE} strokeWidth={0.8} opacity={0.9} />
          <Circle cx={p[0]} cy={p[1]} r={2.6} fill={ORANGE} stroke="#FFFFFF" strokeWidth={0.8} />
          <SvgText x={left ? tx - 3 : tx + 3} y={ly - 1} fontSize={8.5} fontWeight="800" fill={sceneInk} textAnchor={left ? "end" : "start"}>
            {l.title}
          </SvgText>
          <SvgText x={left ? tx - 3 : tx + 3} y={ly + 7} fontSize={6.5} fill={hintColor} textAnchor={left ? "end" : "start"}>
            {l.sub}
          </SvgText>
        </G>
      );
    });
  } else {
    const sFit = Math.min((0.46 * W) / R, (0.38 * H) / (R * 0.8 + 0.4), 95);
    const cam = makeCam(v.yaw, v.pitch, [0, 0.2, 0], sFit);
    const slabNodes = drawSolids("slab", [slab], [-X / 2, 0, -Z / 2], 0, cam, heat, "none");

    const drawn = list.map((t, k) => {
      const { col, row, half } = cellRC(k, rows);
      const sel = selIdx === k;
      const glow = diagnostic && t.traffic >= activeThreshold;
      const model = buildTile(half, detail);
      const origin: V3 = [MARGIN + col - X / 2, SLAB_H + (sel ? LIFT : 0), MARGIN + row - Z / 2];
      const tileHeat = toHexColor(getHeatmapTileColor(t.traffic));
      const depth = dot3([origin[0] + model.centroid[0], origin[1], origin[2] + model.centroid[1]], cam.dir);
      return {
        depth,
        node: (
          <G key={`tile-${t.id}`} onPress={() => onSelect(k)}>
            {drawSolids(`t${t.id}`, model.solids, origin, 0, cam, tileHeat, sel ? "sel" : glow ? "glow" : "none")}
          </G>
        ),
      };
    });
    drawn.sort((a, b) => a.depth - b.depth); // far tiles first
    nodes = [...slabNodes, ...drawn.map((d) => d.node)];

    if (selIdx !== null && selTile) {
      const { col, row, half } = cellRC(selIdx, rows);
      const cc = buildTile(half, 0).centroid;
      const p = proj(cam, [
        MARGIN + col + cc[0] - X / 2,
        SLAB_H + LIFT + TILE_H + 0.3,
        MARGIN + row + cc[1] - Z / 2,
      ]);
      labelNodes = [
        <G key="sel-label" pointerEvents="none">
          <SvgText x={p[0] + 4} y={p[1]} fontSize={8.5} fontWeight="800" fill={sceneInk}>
            {`Tile ${selTile.id}`}
          </SvgText>
          <Circle cx={p[0]} cy={p[1] - 3} r={2.4} fill={ORANGE} />
        </G>,
      ];
    }
  }

  return (
    <View style={{ width: "100%", aspectRatio: SCENE_ASPECT }} {...pan.panHandlers}>
      <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`}>
        {nodes}
        {labelNodes}
      </Svg>

      {/* selected tile chip */}
      {selTile && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: scale(2),
            top: scale(2),
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: scale(7),
            paddingVertical: scale(3),
            borderRadius: scale(10),
            backgroundColor: controlSurface,
          }}
        >
          <View style={{ width: scale(6), height: scale(6), borderRadius: scale(3), marginRight: scale(5), backgroundColor: heat }} />
          <Text style={{ fontSize: scale(8), color: sceneInk, fontWeight: "700" }}>
            {selTile.label}
            {inside ? " · inside" : ` · ${pct}% traffic`}
          </Text>
        </View>
      )}

      <Text
        pointerEvents="none"
        style={{ position: "absolute", left: scale(2), bottom: 0, fontSize: scale(6.5), color: hintColor }}
      >
        {inside ? "Drag to rotate 360°" : "Drag to rotate 360° · tap a tile to select"}
      </Text>

      {/* actions */}
      <View style={{ position: "absolute", right: scale(2), bottom: 0, flexDirection: "row", gap: scale(6) }}>
        {inside && (
          <Pressable
            onPress={() => setExploded((e) => !e)}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={exploded ? "Assemble tile" : "Explode tile"}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: scale(4),
              paddingHorizontal: scale(8),
              paddingVertical: scale(4),
              borderRadius: scale(12),
              backgroundColor: controlSurface,
            }}
          >
            <Ionicons name={exploded ? "contract-outline" : "expand-outline"} size={scale(11)} color={sceneInk} />
            <Text style={{ fontSize: scale(8), color: sceneInk, fontWeight: "700" }}>
              {exploded ? "Assemble" : "Explode"}
            </Text>
          </Pressable>
        )}
        {(inside || selTile) && (
          <Pressable
            onPress={inside ? closeInside : openInside}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={inside ? "Back to tiles" : "View inside the selected tile"}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: scale(4),
              paddingHorizontal: scale(9),
              paddingVertical: scale(4),
              borderRadius: scale(12),
              backgroundColor: ORANGE,
            }}
          >
            <Ionicons name={inside ? "grid-outline" : "cube-outline"} size={scale(11)} color="#FFFFFF" />
            <Text style={{ fontSize: scale(8), color: "#FFFFFF", fontWeight: "800" }}>
              {inside ? "Back to tiles" : "Inside view"}
            </Text>
          </Pressable>
        )}
      </View>

      {/* view angle button + menu */}
      <Pressable
        onPress={() => setViewMenu((o) => !o)}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Change view angle"
        style={{
          position: "absolute",
          right: scale(24),
          top: scale(1),
          flexDirection: "row",
          alignItems: "center",
          gap: scale(4),
          paddingHorizontal: scale(8),
          paddingVertical: scale(3),
          borderRadius: scale(12),
          backgroundColor: viewMenu ? ORANGE : controlSurface,
        }}
      >
        <Ionicons name="eye-outline" size={scale(11)} color={viewMenu ? "#FFFFFF" : sceneInk} />
        <Text style={{ fontSize: scale(8), color: viewMenu ? "#FFFFFF" : sceneInk, fontWeight: "800" }}>View</Text>
      </Pressable>
      {viewMenu && (
        <View
          style={{
            position: "absolute",
            right: scale(24),
            top: scale(24),
            padding: scale(4),
            gap: scale(2),
            borderRadius: scale(10),
            backgroundColor: menuSurface,
            borderWidth: 1,
            borderColor: dark ? "rgba(255,255,255,0.16)" : "rgba(10,42,74,0.12)",
          }}
        >
          {VIEW_PRESETS.map((p) => {
            const on = activeView === p.key;
            return (
              <Pressable
                key={p.key}
                onPress={() => applyView(p)}
                hitSlop={4}
                accessibilityRole="button"
                accessibilityLabel={`${p.label} view`}
                accessibilityState={{ selected: on }}
                style={{
                  paddingHorizontal: scale(10),
                  paddingVertical: scale(4),
                  borderRadius: scale(7),
                  backgroundColor: on ? ORANGE : "transparent",
                }}
              >
                <Text style={{ fontSize: scale(8), color: on ? "#FFFFFF" : sceneInk, fontWeight: on ? "800" : "600" }}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}

      <Pressable
        onPress={() => applyView(VIEW_PRESETS[0])}
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

/* ------------------------------------------------------------------ */
/* public export: same name + props the adapter already imports         */
/* ------------------------------------------------------------------ */

class SceneErrorBoundary extends React.Component<
  { props: HeatmapTileSceneProps; children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.warn("[heatmap] SVG tile scene failed", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const p = this.props.props;
    // show the real reason on screen, and keep the old grid underneath
    return (
      <View>
        <Text style={{ color: "#FDBA74", fontSize: scale(8), marginBottom: scale(6) }}>
          3D tile scene error: {String(this.state.error.message || this.state.error)}
        </Text>
        <HeatmapTileGrid
          tiles={p.tiles}
          maxVisibleTiles={p.maxVisibleTiles}
          viewMode={p.viewMode}
          activeThreshold={p.activeThreshold}
        />
      </View>
    );
  }
}

export function HeatmapTileScene(props: HeatmapTileSceneProps) {
  return (
    <SceneErrorBoundary props={props}>
      <HeatmapTileSceneInner {...props} />
    </SceneErrorBoundary>
  );
}