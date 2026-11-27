import React from "react";
import { TileHeatScene as SvgTileHeatScene } from "./tile-heat-scene";

type SceneProps = React.ComponentProps<typeof SvgTileHeatScene>;

function sameList<T>(a?: readonly T[], b?: readonly T[]) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

const roundOrNull = (value: number | null | undefined) =>
  value === null || value === undefined ? null : Math.round(value);

/**
 * The dashboard re-renders on every telemetry packet and builds fresh
 * `bulbs` / `roomNames` / `roomKinds` arrays each time. Re-rendering the whole
 * 3D tree for that stalls the JS thread, which is what drives the orbit gesture,
 * and shows up as drag lag. Only re-render when something the scene can actually
 * display has changed (voltage / power / battery are compared at the precision shown).
 */
function scenePropsEqual(prev: SceneProps, next: SceneProps) {
  return (
    prev.mode === next.mode &&
    prev.isActive === next.isActive &&
    prev.installedTileCount === next.installedTileCount &&
    prev.footsteps === next.footsteps &&
    prev.activeTile === next.activeTile &&
    prev.powerMode === next.powerMode &&
    prev.roomSwitchDisabled === next.roomSwitchDisabled &&
    roundOrNull(prev.batteryPct) === roundOrNull(next.batteryPct) &&
    roundOrNull(prev.gridVoltage) === roundOrNull(next.gridVoltage) &&
    roundOrNull(prev.gridPower) === roundOrNull(next.gridPower) &&
    sameList(prev.bulbs, next.bulbs) &&
    sameList(prev.roomNames, next.roomNames) &&
    sameList(prev.roomKinds, next.roomKinds)
  );
}

export const TileHeatScene = React.memo(SvgTileHeatScene, scenePropsEqual);