/**
 * Single source of truth for "what kind of place is this zone?".
 * Used by the device-setup preview AND the dashboard scene, so a place named
 * in setup looks identical on the dashboard.
 *
 * A "site" is anywhere piezo tiles can be installed: indoor rooms AND outdoor
 * spots (sidewalks, campus walkways, crosswalks, terminals, parks ...).
 * Anything else is "custom": the user names it and picks the flooring and
 * whether it is enclosed (walls) or open-air.
 */
export type RoomKind =
  | "hallway"
  | "classroom"
  | "office"
  | "bedroom"
  | "dining"
  | "sidewalk"
  | "campus"
  | "crosswalk"
  | "terminal"
  | "mall"
  | "gym"
  | "park"
  | "custom";

/** What the ground is made of. Drives the floor colour + pattern in the scene. */
export type FloorKind =
  | "tile"
  | "concrete"
  | "paver"
  | "asphalt"
  | "wood"
  | "carpet"
  | "grass"
  | "rubber";

export type SiteSpec = {
  /** "auto" (or undefined) = guess from the zone name */
  kind?: RoomKind | "auto";
  /** overrides the default flooring of the kind (always used for "custom") */
  floor?: FloorKind;
  /** true = no walls / ceiling (outdoor), false = enclosed room */
  open?: boolean;
};

export type ResolvedSite = {
  kind: RoomKind;
  floor: FloorKind;
  open: boolean;
  label: string;
};

export function roomKind(name?: string): RoomKind {
  const t = (name ?? "").toLowerCase();
  if (/side\s?walk|footpath|pedestrian|bike\s?lane|bikeway|promenade|boardwalk/.test(t))
    return "sidewalk";
  if (/cross\s?walk|crossing|street|road|overpass|footbridge|bridge|avenue|highway/.test(t))
    return "crosswalk";
  if (/campus|quad|plaza|oval|pavilion|covered\s?(court|walk)|gate|courtyard|grounds|walkway/.test(t))
    return "campus";
  if (/station|terminal|mrt|lrt|train|airport|bus\s?(stop|stand)|jeepney|port|platform/.test(t))
    return "terminal";
  if (/mall|market|store|shop|supermarket|plaza\s?mall|arcade/.test(t)) return "mall";
  if (/gym|court|stadium|track|arena|fitness|field\s?house|swimming/.test(t)) return "gym";
  if (/park|garden|playground|trail|jogging|greenway/.test(t)) return "park";
  if (/hall|corridor|passage|lobby|foyer|entrance|stair/.test(t)) return "hallway";
  if (/bed|dorm|sleep|master|guest/.test(t)) return "bedroom";
  if (/office|admin|work|study|library|faculty|principal|lab|clinic/.test(t))
    return "office";
  if (/kitchen|canteen|dining|cafeteria|pantry|cafe/.test(t)) return "dining";
  return "classroom";
}

/** Default flooring + enclosure for every kind. */
export const ROOM_DEFAULTS: Record<RoomKind, { floor: FloorKind; open: boolean }> = {
  hallway: { floor: "tile", open: false },
  classroom: { floor: "tile", open: false },
  office: { floor: "carpet", open: false },
  bedroom: { floor: "wood", open: false },
  dining: { floor: "tile", open: false },
  sidewalk: { floor: "concrete", open: true },
  campus: { floor: "paver", open: true },
  crosswalk: { floor: "asphalt", open: true },
  terminal: { floor: "tile", open: false },
  mall: { floor: "tile", open: false },
  gym: { floor: "rubber", open: false },
  park: { floor: "grass", open: true },
  custom: { floor: "concrete", open: false },
};

export const FLOOR_PALETTE: Record<FloorKind, { color: string; line: string; label: string }> = {
  tile: { color: "#C9D3E0", line: "rgba(10,42,74,0.10)", label: "Tile" },
  concrete: { color: "#B8BCC4", line: "rgba(10,42,74,0.10)", label: "Concrete" },
  paver: { color: "#C98E78", line: "rgba(90,40,20,0.22)", label: "Brick pavers" },
  asphalt: { color: "#5C6270", line: "rgba(255,255,255,0.12)", label: "Asphalt" },
  wood: { color: "#D3B78F", line: "rgba(90,60,20,0.18)", label: "Wood" },
  carpet: { color: "#A9B8CC", line: "rgba(10,42,74,0.06)", label: "Carpet" },
  grass: { color: "#7DBB6A", line: "rgba(20,80,20,0.12)", label: "Grass / turf" },
  rubber: { color: "#C0594F", line: "rgba(255,255,255,0.25)", label: "Rubber / court" },
};

export const FLOOR_ORDER: FloorKind[] = [
  "tile",
  "concrete",
  "paver",
  "asphalt",
  "wood",
  "carpet",
  "grass",
  "rubber",
];

export const ROOM_PALETTE: Record<RoomKind, { floor: string; wall: string }> = {
  hallway: { floor: "#B7C2D0", wall: "#E8EDF3" },
  classroom: { floor: "#C9D3E0", wall: "#EEF3F8" },
  office: { floor: "#A9B8CC", wall: "#F2F0EA" },
  bedroom: { floor: "#D3B78F", wall: "#F4E9E4" },
  dining: { floor: "#D9CBB0", wall: "#F6EFDC" },
  sidewalk: { floor: "#B8BCC4", wall: "#E5E7EB" },
  campus: { floor: "#C98E78", wall: "#E8DDD0" },
  crosswalk: { floor: "#5C6270", wall: "#E5E7EB" },
  terminal: { floor: "#BFC7D2", wall: "#E3E9F1" },
  mall: { floor: "#D8D2C8", wall: "#F4F0EA" },
  gym: { floor: "#C0594F", wall: "#EDE3E1" },
  park: { floor: "#7DBB6A", wall: "#DDEBD5" },
  custom: { floor: "#B8BCC4", wall: "#EEF1F5" },
};

export const ROOM_LABEL: Record<RoomKind, string> = {
  hallway: "Hallway",
  classroom: "Classroom",
  office: "Office / Lab",
  bedroom: "Bedroom",
  dining: "Canteen / Dining",
  sidewalk: "Sidewalk",
  campus: "Campus walkway",
  crosswalk: "Street / Crosswalk",
  terminal: "Station / Terminal",
  mall: "Mall / Market",
  gym: "Gym / Court",
  park: "Park / Plaza",
  custom: "Other",
};

/** Kinds shown as chips in setup, in display order (custom = "Other" last). */
export const ROOM_KIND_ORDER: RoomKind[] = [
  "hallway",
  "classroom",
  "office",
  "bedroom",
  "dining",
  "sidewalk",
  "campus",
  "crosswalk",
  "terminal",
  "mall",
  "gym",
  "park",
  "custom",
];

/** Zone name + optional user choice -> everything the scene needs. */
export function resolveSite(name?: string, spec?: SiteSpec | null): ResolvedSite {
  const kind: RoomKind =
    spec?.kind && spec.kind !== "auto" ? spec.kind : roomKind(name);
  const def = ROOM_DEFAULTS[kind];
  const floor = spec?.floor ?? def.floor;
  const open = spec?.open ?? def.open;
  return { kind, floor, open, label: ROOM_LABEL[kind] };
}

/** Floor colour: the kind's own colour unless the flooring was changed. */
export function siteFloorColor(site: ResolvedSite): string {
  const def = ROOM_DEFAULTS[site.kind];
  return site.floor === def.floor
    ? ROOM_PALETTE[site.kind].floor
    : FLOOR_PALETTE[site.floor].color;
}

/** Persisted per-zone choices, keyed by lower-cased zone name. */
export const SITE_SPECS_STORAGE_KEY = "bawatpieza.siteSpecs.v1";
export const siteKey = (name?: string) => (name ?? "").trim().toLowerCase();