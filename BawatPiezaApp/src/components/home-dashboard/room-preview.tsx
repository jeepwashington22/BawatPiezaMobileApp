import React, { useMemo } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Circle, Line, Polygon } from "react-native-svg";
import { AppText as Text } from "../app-text";
import { scale } from "../glass-ui";
import {
  FLOOR_PALETTE,
  ROOM_PALETTE,
  resolveSite,
  siteFloorColor,
  type ResolvedSite,
  type SiteSpec,
} from "./room-kind";

/**
 * Isometric 3D SVG preview of a place, drawn with the SAME camera, light,
 * cut-away walls, furniture and ceiling bulb as the dashboard's tile-heat
 * scene, so what you pick in setup is what the dashboard shows.
 */

type V3 = [number, number, number];
type Face = { pts: V3[]; fill: string; stroke?: string; sw?: number; op?: number };
type LineItem = { a: V3; b: V3; stroke: string; w: number };
type Part = { center: V3; order: number; faces: Face[]; lines?: LineItem[] };

type Props = {
  name?: string;
  /** user choice from setup (place type / open-air); omit = auto from name */
  spec?: SiteSpec | null;
  on?: boolean;
  backgroundColor?: string;
  labelColor?: string;
  style?: StyleProp<ViewStyle>;
};

/* same dimensions as the dashboard room */
const RW = 1.8;
const RD = 1.5;
const WALL_H = 1.0;
const WALL_LOW = 0.16;
const WALL_T = 0.06;
const FLOOR_T = 0.05;
const CEIL_Z = FLOOR_T + WALL_H;
const BULB_Z = CEIL_Z - 0.26;

const VB_W = 300;
const VB_H = 176;

/* same light as the scene */
const LIGHT: V3 = (() => {
  const v: V3 = [0.35, -0.6, 0.72];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
const TOP_SHADE = 0.58 + 0.42 * LIGHT[2];
const K_PX = Math.min(1, (0.58 + 0.42 * Math.max(0, LIGHT[0])) / TOP_SHADE);
const K_PY = Math.min(1, 0.58 / TOP_SHADE);

function shade(hex: string, k: number): string {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const c = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * k)))
      .toString(16)
      .padStart(2, "0");
  return `#${c((n >> 16) & 255)}${c((n >> 8) & 255)}${c(n & 255)}`;
}

/* ---- projection (identical to the scene at yaw = 0) ---- */
const CX = RW / 2;
const CY = RD / 2;
const bounds = (() => {
  const pts: V3[] = [
    [0, 0, CEIL_Z], [RW, 0, 0], [0, RD, 0], [RW, RD, 0], [0, 0, 0], [RW, 0, CEIL_Z],
  ];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  pts.forEach(([x, y, z]) => {
    const sx = (x - y) * 0.866;
    const sy = (x + y) * 0.5 - z * 0.92;
    minX = Math.min(minX, sx); maxX = Math.max(maxX, sx);
    minY = Math.min(minY, sy); maxY = Math.max(maxY, sy);
  });
  return { minX, maxX, minY, maxY };
})();
const U = Math.min(
  (VB_W - 16) / (bounds.maxX - bounds.minX),
  (VB_H - 16) / (bounds.maxY - bounds.minY),
);
const SX0 = VB_W / 2 - ((bounds.minX + bounds.maxX) / 2) * U;
const SY0 = VB_H / 2 - ((bounds.minY + bounds.maxY) / 2) * U;
const pr = (p: V3): [number, number] => [
  (p[0] - p[1]) * 0.866 * U + SX0,
  ((p[0] + p[1]) * 0.5 - p[2] * 0.92) * U + SY0,
];
const ptsStr = (pts: V3[]) =>
  pts.map((p) => pr(p).map((v) => v.toFixed(1)).join(",")).join(" ");
const depth = (p: V3) => p[0] + p[1];

/* ---- geometry helpers ---- */
const EDGE = "rgba(0,0,0,0.12)";

/** Axis-aligned box: only the 3 camera-facing faces (top, +x, +y). */
function boxFaces(
  x: number, y: number, z: number, w: number, d: number, h: number,
  top: string, px: string, py: string, stroke: string | undefined = EDGE,
): Face[] {
  const x1 = x + w, y1 = y + d, z1 = z + h;
  return [
    { pts: [[x, y, z1], [x1, y, z1], [x1, y1, z1], [x, y1, z1]], fill: top, stroke, sw: 0.5 },
    { pts: [[x1, y, z], [x1, y1, z], [x1, y1, z1], [x1, y, z1]], fill: px, stroke, sw: 0.5 },
    { pts: [[x, y1, z], [x1, y1, z], [x1, y1, z1], [x, y1, z1]], fill: py, stroke, sw: 0.5 },
  ];
}

const disc = (x: number, y: number, r: number, z: number, seg = 18): V3[] =>
  Array.from({ length: seg }, (_, k) => {
    const a = (k / seg) * Math.PI * 2;
    return [x + Math.cos(a) * r, y + Math.sin(a) * r, z] as V3;
  });

function buildParts(site: ResolvedSite, on: boolean): { parts: Part[]; glow: boolean } {
  const { kind, open } = site;
  const pal = ROOM_PALETTE[kind];
  const floorBase = siteFloorColor(site);
  const dim = (c: string) => (on ? c : shade(c, 0.86));
  const floorC = dim(floorBase);
  const wallIn = dim(pal.wall);
  const OUT = "#F3F4F7";
  const parts: Part[] = [];

  const ix0 = WALL_T, ix1 = RW - WALL_T, iy0 = WALL_T, iy1 = RD - WALL_T;
  const rcx = CX, rcy = CY;
  const zf = FLOOR_T + 0.004;

  /* ---- floor slab + subtle floor pattern ---- */
  const floorLines: LineItem[] = [];
  const line = FLOOR_PALETTE[site.floor].line;
  const hL = (y: number) => floorLines.push({ a: [ix0, y, zf], b: [ix1, y, zf], stroke: line, w: 0.6 });
  const vL = (x: number) => floorLines.push({ a: [x, iy0, zf], b: [x, iy1, zf], stroke: line, w: 0.6 });
  if (site.floor === "tile") {
    for (let g = 1; g < 4; g += 1) vL(ix0 + (g * (ix1 - ix0)) / 4);
    for (let g = 1; g < 3; g += 1) hL(iy0 + (g * (iy1 - iy0)) / 3);
  } else if (site.floor === "concrete") {
    for (let g = 1; g < 3; g += 1) vL(ix0 + (g * (ix1 - ix0)) / 3);
    hL((iy0 + iy1) / 2);
  } else if (site.floor === "paver") {
    for (let g = 1; g < 8; g += 1) {
      const gy = iy0 + (g * (iy1 - iy0)) / 8;
      hL(gy);
      const step = (ix1 - ix0) / 8;
      for (let x = ix0 + (g % 2 ? step / 2 : 0); x < ix1; x += step) {
        if (x <= ix0 + 0.001) continue;
        floorLines.push({ a: [x, gy, zf], b: [x, gy + (iy1 - iy0) / 8, zf], stroke: line, w: 0.6 });
      }
    }
  } else if (site.floor === "wood") {
    for (let g = 1; g < 9; g += 1) hL(iy0 + (g * (iy1 - iy0)) / 9);
  } else if (site.floor === "rubber") {
    vL(rcx);
    hL(iy0 + 0.06);
    hL(iy1 - 0.06);
  } else if (site.floor === "asphalt" && kind !== "crosswalk") {
    hL(rcy);
  } else if (site.floor === "carpet") {
    for (let g = 1; g < 6; g += 1) hL(iy0 + (g * (iy1 - iy0)) / 6);
  }

  const floorFaces = boxFaces(0, 0, 0, RW, RD, FLOOR_T, floorC, shade(floorC, 0.8), shade(floorC, 0.68), EDGE);
  if (kind === "hallway") {
    const strip = (ya: number, yb: number, fill: string, dz: number): Face => ({
      pts: [[ix0, ya, zf + dz], [ix1, ya, zf + dz], [ix1, yb, zf + dz], [ix0, yb, zf + dz]],
      fill,
    });
    floorFaces.push(
      strip(rcy - 0.3, rcy + 0.3, dim("#8FA3BC"), 0.0005),
      strip(rcy - 0.3, rcy - 0.275, "#E2E8F0", 0.0008),
      strip(rcy + 0.275, rcy + 0.3, "#E2E8F0", 0.0008),
    );
  }
  if (on) {
    floorFaces.push(
      { pts: [[0, 0, zf], [RW, 0, zf], [RW, RD, zf], [0, RD, zf]], fill: "#FFE2A0", op: 0.14 },
      { pts: disc(rcx, rcy, 0.66, zf + 0.001), fill: "#FFD27A", op: 0.2 },
      { pts: disc(rcx, rcy, 0.36, zf + 0.002), fill: "#FFEBB5", op: 0.3 },
    );
  }
  parts.push({ center: [rcx, rcy, 0], order: -1, faces: floorFaces, lines: floorLines });

  /* ---- walls: back + west stay tall, front + east sink to a kerb (cut-away) ---- */
  const quadY = (y: number, x0: number, x1: number, z0: number, z1: number, fill: string, stroke?: string): Face => ({
    pts: [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], fill, stroke, sw: 1,
  });
  const quadX = (x: number, y0: number, y1: number, z0: number, z1: number, fill: string, stroke?: string): Face => ({
    pts: [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]], fill, stroke, sw: 1,
  });

  if (open) {
    // outdoor: low kerb all round, no walls
    const kerb = "#9AA0AB";
    [
      [0, 0, RW, 0.05, 0.05],
      [0, RD - 0.05, RW, 0.05, 0.05],
      [0, 0.05, 0.05, RD - 0.1, 0.05],
      [RW - 0.05, 0.05, 0.05, RD - 0.1, 0.05],
    ].forEach(([x, y, w, d, h], n) => {
      parts.push({
        center: [x + w / 2, y + d / 2, FLOOR_T],
        order: n === 1 || n === 3 ? 3 : 0, // front / east kerbs draw last
        faces: boxFaces(x, y, FLOOR_T, w, d, h, "#E5E7EB", shade(kerb, K_PX), shade(kerb, K_PY)),
      });
    });
  } else {
    const wallBox = (x: number, y: number, w: number, d: number, h: number, inner: "px" | "py" | null, order: number) =>
      parts.push({
        center: [x + w / 2, y + d / 2, FLOOR_T + h / 2],
        order,
        faces: boxFaces(
          x, y, FLOOR_T, w, d, h, "#FFFFFF",
          shade(inner === "px" ? wallIn : OUT, K_PX),
          shade(inner === "py" ? wallIn : OUT, K_PY),
        ),
      });
    wallBox(0, 0, RW, WALL_T, WALL_H, "py", 0); // back
    wallBox(0, WALL_T, WALL_T, RD - WALL_T * 2, WALL_H, "px", 0); // west
    wallBox(0, RD - WALL_T, RW, WALL_T, WALL_LOW, null, 3); // front kerb
    wallBox(RW - WALL_T, WALL_T, WALL_T, RD - WALL_T * 2, WALL_LOW, null, 3); // east kerb

    /* wall decorations (same artwork as the dashboard room) */
    const yy = WALL_T + 0.004;
    const back: Face[] = [];
    if (kind === "classroom") {
      back.push(
        quadY(yy, rcx - 0.55, rcx + 0.55, 0.36, 0.78, "#F8FAFC", "#7B8494"),
        quadY(yy, rcx - 0.55, rcx + 0.55, 0.33, 0.36, "#9AA3B2"),
        quadY(yy + 0.002, rcx - 0.45, rcx + 0.05, 0.64, 0.655, "#3B82F6"),
        quadY(yy + 0.002, rcx - 0.45, rcx - 0.05, 0.57, 0.585, "#EF4444"),
        quadY(yy + 0.002, rcx - 0.45, rcx + 0.2, 0.5, 0.515, "#16A34A"),
        quadY(yy, rcx + 0.64, rcx + 0.78, 0.62, 0.76, "#FFFFFF", "#4B5563"),
      );
    } else if (kind === "bedroom") {
      back.push(
        quadY(yy, rcx - 0.2, rcx + 0.2, 0.5, 0.78, "#93C5FD", "#8B6B4A"),
        quadY(yy, rcx + 0.34, rcx + 0.6, 0.55, 0.75, "#FCA5A5", "#8B6B4A"),
      );
    } else if (kind === "office") {
      back.push(
        quadY(yy, rcx - 0.4, rcx + 0.4, 0.42, 0.78, "#F8FAFC", "#7B8494"),
        quadY(yy, rcx + 0.5, rcx + 0.78, 0.5, 0.52, "#8B6B4A"),
      );
    } else if (kind === "hallway") {
      for (let g = 0; g < 5; g += 1) {
        const lx = ix0 + 0.08 + g * 0.2;
        back.push(quadY(yy, lx, lx + 0.18, 0.07, 0.75, g % 2 ? "#7C8CA3" : "#64748B", "#334155"));
      }
      back.push(
        quadY(yy, rcx + 0.35, rcx + 0.75, FLOOR_T, 0.82, "#8B5E3C", "#5B3A22"),
        quadY(yy - 0.002, rcx + 0.66, rcx + 0.7, 0.42, 0.46, "#F5D27A"),
        quadY(yy, rcx + 0.4, rcx + 0.7, 0.88, 0.96, "#16A34A"),
      );
    } else if (kind === "dining") {
      back.push(
        quadY(yy, rcx - 0.7, rcx + 0.7, 0.62, 0.65, "#8B6B4A"),
        quadY(yy, rcx - 0.7, rcx + 0.7, 0.42, 0.45, "#8B6B4A"),
      );
    } else if (kind === "terminal") {
      back.push(
        quadY(yy, rcx - 0.6, rcx + 0.6, 0.62, 0.82, "#1F2430", "#111827"),
        quadY(yy + 0.002, rcx - 0.5, rcx + 0.1, 0.72, 0.76, "#FACC15"),
      );
    } else if (kind === "mall") {
      for (let g = 0; g < 6; g += 1) {
        back.push(quadY(yy, ix0 + 0.1 + g * 0.26, ix0 + 0.1 + g * 0.26 + 0.26, 0.7, 0.84, g % 2 ? "#F59E0B" : "#FFFFFF"));
      }
      back.push(quadY(yy, rcx - 0.6, rcx + 0.6, 0.2, 0.62, "#BFE3FA", "#FFFFFF"));
    } else if (kind === "gym") {
      back.push(
        quadY(yy, ix0, ix1, 0.3, 0.34, "#F3F4F6"),
        quadY(yy, rcx - 0.3, rcx + 0.3, 0.62, 0.8, "#1F2430", "#111827"),
      );
    }
    if (back.length) parts.push({ center: [rcx, WALL_T, 0.55], order: 0.5, faces: back });
    parts.push({
      center: [WALL_T, rcy, 0.55],
      order: 0.5,
      faces: [
        quadX(WALL_T + 0.004, rcy - 0.4, rcy + 0.4, 0.4, 0.86, "#BFE3FA", "#FFFFFF"),
        quadX(WALL_T + 0.006, rcy - 0.01, rcy + 0.01, 0.4, 0.86, "#FFFFFF"),
        quadX(WALL_T + 0.006, rcy - 0.44, rcy + 0.44, 0.37, 0.4, "#E5E7EB"),
      ],
    });
  }

  /* ---- furniture / props ---- */
  const furn = (id: string, x: number, y: number, w: number, d: number, h: number, top: string, side: string, z = FLOOR_T) =>
    parts.push({
      center: [x + w / 2, y + d / 2, z + h / 2],
      order: 1,
      faces: boxFaces(x, y, z, w, d, h, dim(top), shade(side, K_PX), shade(side, K_PY)),
    });
  const flat = (x: number, y: number, w: number, d: number, top: string, side: string) =>
    furn("f", x, y, w, d, 0.012, top, side);

  if (kind === "classroom") {
    furn("td", rcx - 0.3, iy0 + 0.1, 0.6, 0.2, 0.2, "#C79A66", "#9C7248");
    furn("tc", rcx - 0.08, iy0 + 0.33, 0.16, 0.14, 0.09, "#475569", "#334155");
    for (let row = 0; row < 2; row += 1)
      for (let col = 0; col < 3; col += 1) {
        const dx = rcx + (col - 1) * 0.5 - 0.17;
        const dy = iy0 + 0.62 + row * 0.38;
        furn("d", dx, dy, 0.34, 0.2, 0.16, "#D9B382", "#A8814F");
        furn("c", dx + 0.08, dy + 0.24, 0.18, 0.12, 0.09, "#3B82F6", "#2B63BD");
      }
  } else if (kind === "office") {
    [-0.78, 0.14].forEach((ox) => {
      const dx = rcx + ox;
      furn("ws", dx, iy0 + 0.1, 0.64, 0.3, 0.18, "#E5E7EB", "#B8BDC7");
      furn("mon", dx + 0.21, iy0 + 0.17, 0.22, 0.03, 0.15, "#1F2430", "#111827", FLOOR_T + 0.18);
      furn("ch", dx + 0.23, iy0 + 0.46, 0.17, 0.15, 0.1, "#334155", "#1E293B");
    });
    furn("meet", rcx - 0.4, iy0 + 0.9, 0.8, 0.34, 0.17, "#D9B382", "#A8814F");
    furn("cab", ix1 - 0.24, iy0 + 0.05, 0.2, 0.34, 0.42, "#9AA3B2", "#7B8494");
  } else if (kind === "bedroom") {
    const bx = ix0 + 0.15, by = iy0 + 0.14;
    furn("bed", bx, by, 0.7, 0.98, 0.1, "#F3F4F6", "#8B6B4A");
    furn("pil", bx + 0.08, by + 0.06, 0.54, 0.2, 0.05, "#FFFFFF", "#E5E7EB", FLOOR_T + 0.1);
    furn("blk", bx + 0.02, by + 0.36, 0.66, 0.6, 0.03, "#60A5FA", "#3B82F6", FLOOR_T + 0.1);
    furn("ns", bx + 0.78, by, 0.22, 0.22, 0.15, "#C79A66", "#9C7248");
    furn("wd", ix1 - 0.3, iy0 + 0.3, 0.26, 0.5, 0.55, "#D9C3A0", "#B59E78");
  } else if (kind === "hallway") {
    furn("bench", rcx - 0.55, iy1 - 0.36, 0.8, 0.16, 0.12, "#C79A66", "#9C7248");
    furn("plant", ix1 - 0.22, iy0 + 0.08, 0.14, 0.14, 0.32, "#22C55E", "#B45309");
    furn("bin", ix0 + 0.06, iy1 - 0.3, 0.14, 0.14, 0.2, "#94A3B8", "#64748B");
  } else if (kind === "dining") {
    furn("ctr", ix0 + 0.1, iy0 + 0.04, ix1 - ix0 - 0.2, 0.24, 0.2, "#CBD5E1", "#94A3B8");
    furn("tbl", rcx - 0.4, rcy - 0.02, 0.8, 0.46, 0.17, "#D9B382", "#A8814F");
    [-0.3, 0.3].forEach((ox) => {
      furn("sa", rcx + ox - 0.07, rcy - 0.2, 0.14, 0.12, 0.09, "#F59E0B", "#B7791F");
      furn("sb", rcx + ox - 0.07, rcy + 0.5, 0.14, 0.12, 0.09, "#F59E0B", "#B7791F");
    });
  } else if (kind === "sidewalk") {
    furn("curb", ix0, iy0, ix1 - ix0, 0.1, 0.07, "#9AA0AB", "#7B8190");
    furn("verge", ix0, iy1 - 0.12, ix1 - ix0, 0.12, 0.03, "#7DBB6A", "#5E9B4D");
    furn("tr1", ix0 + 0.18, iy1 - 0.3, 0.16, 0.16, 0.34, "#3F8F4A", "#7A5230");
    furn("bnch", rcx + 0.3, iy0 + 0.16, 0.4, 0.12, 0.1, "#C79A66", "#9C7248");
    furn("bin", ix1 - 0.2, iy1 - 0.34, 0.12, 0.12, 0.2, "#94A3B8", "#64748B");
  } else if (kind === "campus") {
    furn("pl1", ix0 + 0.1, iy0 + 0.1, 0.34, 0.34, 0.06, "#7DBB6A", "#5E9B4D");
    furn("pl2", ix1 - 0.44, iy0 + 0.1, 0.34, 0.34, 0.06, "#7DBB6A", "#5E9B4D");
    furn("tr1", ix0 + 0.22, iy0 + 0.22, 0.12, 0.12, 0.34, "#3F8F4A", "#7A5230");
    furn("tr2", ix1 - 0.34, iy0 + 0.22, 0.12, 0.12, 0.34, "#3F8F4A", "#7A5230");
    furn("bnch", rcx - 0.2, iy1 - 0.26, 0.4, 0.12, 0.1, "#C79A66", "#9C7248");
  } else if (kind === "crosswalk") {
    for (let g = 0; g < 7; g += 1)
      flat(ix0 + 0.08 + g * ((ix1 - ix0 - 0.2) / 7), iy0 + 0.1, 0.12, iy1 - iy0 - 0.2, "#F3F4F6", "#D1D5DB");
    furn("kerbL", ix0, iy0, ix1 - ix0, 0.06, 0.06, "#9AA0AB", "#7B8190");
  } else if (kind === "terminal") {
    flat(ix0, iy0 + 0.08, ix1 - ix0, 0.06, "#FACC15", "#CA8A04");
    [-0.55, -0.1, 0.35].forEach((ox) => furn("seat", rcx + ox, iy1 - 0.3, 0.36, 0.14, 0.1, "#64748B", "#475569"));
    furn("board", ix1 - 0.3, iy0 + 0.2, 0.18, 0.1, 0.3, "#1F2430", "#111827");
  } else if (kind === "mall") {
    [0, 1, 2].forEach((n) => furn("shop", ix0 + 0.08 + n * 0.55, iy0 + 0.04, 0.46, 0.24, 0.24, "#E2D6C2", "#B8A98E"));
    furn("kiosk", rcx - 0.2, rcy + 0.28, 0.4, 0.26, 0.16, "#CBD5E1", "#94A3B8");
  } else if (kind === "gym") {
    furn("hoopA", ix0 + 0.04, rcy - 0.18, 0.05, 0.36, 0.4, "#F3F4F6", "#9CA3AF");
    furn("hoopB", ix1 - 0.09, rcy - 0.18, 0.05, 0.36, 0.4, "#F3F4F6", "#9CA3AF");
    furn("bleach", ix0 + 0.3, iy1 - 0.16, 0.9, 0.12, 0.1, "#94A3B8", "#64748B");
  } else if (kind === "park") {
    flat(ix0 + 0.06, rcy - 0.18, ix1 - ix0 - 0.12, 0.36, "#D8CBA9", "#B8AA86");
    furn("tr1", ix0 + 0.2, iy0 + 0.2, 0.16, 0.16, 0.42, "#3F8F4A", "#7A5230");
    furn("tr2", ix1 - 0.4, iy1 - 0.32, 0.16, 0.16, 0.38, "#3F8F4A", "#7A5230");
    furn("bnch", rcx + 0.2, iy0 + 0.12, 0.36, 0.1, 0.09, "#C79A66", "#9C7248");
  }
  // "custom": just the floor + enclosure

  /* ---- ceiling (indoor) or street-lamp post (open-air) ---- */
  const ceilLines: LineItem[] = open
    ? [
        { a: [RW - 0.06, 0.06, FLOOR_T], b: [RW - 0.06, 0.06, CEIL_Z], stroke: "#6B7383", w: 2 },
        { a: [RW - 0.06, 0.06, CEIL_Z], b: [rcx, rcy, CEIL_Z], stroke: "#6B7383", w: 1.6 },
        { a: [rcx, rcy, CEIL_Z], b: [rcx, rcy, BULB_Z + 0.08], stroke: "#6B7383", w: 1.2 },
      ]
    : [
        ...([[0, 0], [RW, 0], [RW, RD], [0, RD]] as [number, number][]).map(
          ([px, py]): LineItem => ({
            a: [px, py, FLOOR_T],
            b: [px, py, CEIL_Z],
            stroke: "rgba(10,42,74,0.3)",
            w: 1.1,
          }),
        ),
        { a: [rcx, rcy, CEIL_Z], b: [rcx, rcy, BULB_Z + 0.08], stroke: "#6B7383", w: 1.2 },
      ];
  parts.push({
    center: [rcx, rcy, CEIL_Z],
    order: 5,
    faces: open
      ? []
      : [
          {
            pts: [[0, 0, CEIL_Z], [RW, 0, CEIL_Z], [RW, RD, CEIL_Z], [0, RD, CEIL_Z]],
            fill: "#FFFFFF",
            op: 0.1,
            stroke: "rgba(10,42,74,0.3)",
            sw: 0.9,
          },
        ],
    lines: ceilLines,
  });

  return { parts, glow: on };
}

export function RoomPreview({
  name,
  spec,
  on = true,
  backgroundColor,
  labelColor,
  style,
}: Props) {
  const site = resolveSite(name, spec);
  const { kind, floor, open } = site;
  const { parts } = useMemo(
    () => buildParts(site, on),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, floor, open, on],
  );
  const sorted = useMemo(
    () => [...parts].sort((a, b) => a.order - b.order || depth(a.center) - depth(b.center)),
    [parts],
  );

  const [bx, by] = pr([CX, CY, BULB_Z]);
  const label = kind === "custom" && name?.trim() ? name.trim() : site.label;

  return (
    <View
      style={[
        {
          borderRadius: scale(12),
          padding: scale(8),
          backgroundColor,
          alignItems: "center",
        },
        style,
      ]}
    >
      <Svg
        width="100%"
        height={scale(150)}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        preserveAspectRatio="xMidYMid meet"
      >
        {/* soft ground shadow */}
        <Polygon
          points={ptsStr([[-0.1, -0.1, 0], [RW + 0.12, -0.1, 0], [RW + 0.12, RD + 0.12, 0], [-0.1, RD + 0.12, 0]])}
          fill="rgba(10,42,74,0.10)"
        />
        {sorted.map((p, pi) => (
          <React.Fragment key={pi}>
            {p.faces.map((f, fi) => (
              <Polygon
                key={fi}
                points={ptsStr(f.pts)}
                fill={f.fill}
                fillOpacity={f.op ?? 1}
                stroke={f.stroke}
                strokeWidth={f.sw}
              />
            ))}
            {p.lines?.map((l, li) => {
              const [x1, y1] = pr(l.a);
              const [x2, y2] = pr(l.b);
              return (
                <Line
                  key={`l${li}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={l.stroke}
                  strokeWidth={l.w}
                  strokeLinecap="round"
                />
              );
            })}
          </React.Fragment>
        ))}
        {/* ceiling bulb + glow */}
        {on && <Circle cx={bx} cy={by} r={0.62 * U} fill="#FFB23E" opacity={0.14} />}
        {on && <Circle cx={bx} cy={by} r={0.34 * U} fill="#FFC857" opacity={0.3} />}
        <Circle cx={bx} cy={by} r={Math.max(4, 0.13 * U)} fill={on ? "#FFF1B8" : "#A3AABA"} stroke="#8A93A3" strokeWidth={0.8} />
      </Svg>
      <Text style={{ color: labelColor, fontSize: scale(11), marginTop: scale(4), textAlign: "center" }}>
        {label} · {open ? "Open-air" : "Indoor"}
      </Text>
    </View>
  );
}