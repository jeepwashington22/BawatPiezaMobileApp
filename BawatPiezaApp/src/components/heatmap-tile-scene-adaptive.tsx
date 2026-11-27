import React from "react";
import { HeatmapTileGrid } from "./heatmap-tile-grid";
import {
  HeatmapTileScene as ProjectedHeatmapTileScene,
  type HeatmapTileSceneProps,
} from "./heatmap-tile-scene-3d";

type SceneProps = HeatmapTileSceneProps;

type SceneBoundaryProps = {
  fallback: React.ReactNode;
  children: React.ReactNode;
};

class SceneBoundary extends React.Component<
  SceneBoundaryProps,
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("[heatmap] SVG scene failed; showing the tile grid", error);
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

/**
 * The full heatmap uses the SVG-projected 3D scene; the tile grid remains a
 * safety net if the scene throws.
 */
export function HeatmapTileScene(props: SceneProps) {
  const fallback = (
    <HeatmapTileGrid
      tiles={props.tiles}
      maxVisibleTiles={props.maxVisibleTiles}
      viewMode={props.viewMode}
      activeThreshold={props.activeThreshold}
    />
  );

  return (
    <SceneBoundary fallback={fallback}>
      <ProjectedHeatmapTileScene {...props} />
    </SceneBoundary>
  );
}