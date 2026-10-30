import { LinearGradient } from "expo-linear-gradient";
import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { AppText as Text } from "./app-text";
import { scale } from "./glass-ui";
import { fonts, useTheme } from "../theme";

const TILE_COLORS = ["#7C2D12", "#9A3412", "#C2410C", "#EA580C", "#F97316"];
const MAX_VISIBLE_TILES = 60;

export type HeatmapTileDatum = {
  id: number;
  label: string;
  traffic: number;
};

type Props = {
  tiles: readonly HeatmapTileDatum[];
  totalCount?: number;
  maxVisibleTiles?: number;
  compact?: boolean;
  showTraffic?: boolean;
  viewMode?: "view" | "diagnostic";
  activeThreshold?: number;
  selectedTileId?: number | null;
  onSelectTile?: (id: number) => void;
  emptyLabel?: string;
};

export function getHeatmapTileColor(traffic: number): string {
  const value = Math.min(1, Math.max(0, traffic));
  return TILE_COLORS[Math.floor(value * (TILE_COLORS.length - 1))];
}

export function HeatmapTileGrid({
  tiles,
  totalCount,
  maxVisibleTiles = MAX_VISIBLE_TILES,
  compact = false,
  showTraffic = true,
  viewMode = "view",
  activeThreshold = 0.75,
  selectedTileId = null,
  onSelectTile,
  emptyLabel = "No tiles configured.",
}: Props) {
  const { colors: c } = useTheme();
  const visibleTiles = tiles.slice(0, maxVisibleTiles);
  const rows: HeatmapTileDatum[][] = [];
  for (let index = 0; index < visibleTiles.length; index += 3) {
    rows.push(visibleTiles.slice(index, index + 3));
  }

  const configuredCount = totalCount ?? tiles.length;

  if (configuredCount === 0) {
    return (
      <Text style={[styles.empty, { color: c.muted }]}>{emptyLabel}</Text>
    );
  }

  return (
    <View style={styles.container}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={styles.row}>
          {row.map((tile) => {
            const flagged = tile.traffic >= activeThreshold;
            const selected = tile.id === selectedTileId;
            const content = (
              <>
                <View
                  pointerEvents="none"
                  style={[
                    styles.depth,
                    compact && styles.depthCompact,
                    { backgroundColor: flagged ? "#9A3412" : "#431407" },
                  ]}
                />
                <LinearGradient
                  pointerEvents="none"
                  colors={[
                    "rgba(255,255,255,0.28)",
                    "rgba(255,255,255,0.04)",
                    "rgba(0,0,0,0.28)",
                  ]}
                  locations={[0, 0.34, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View pointerEvents="none" style={styles.sheen} />
                <View pointerEvents="none" style={styles.diagonal} />
                <View pointerEvents="none" style={styles.bevelTop} />
                <View pointerEvents="none" style={styles.bevelBottom} />
                <View style={styles.inner}>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.label,
                      compact && styles.labelCompact,
                      { color: "#FFFFFF" },
                    ]}
                  >
                    {tile.label.toUpperCase()}
                  </Text>
                  {showTraffic && (
                    <Text
                      style={[
                        styles.traffic,
                        compact && styles.trafficCompact,
                        { color: "#FFFFFF" },
                      ]}
                    >
                      {`${Math.round(tile.traffic * 100)}%`}
                    </Text>
                  )}
                  {viewMode === "diagnostic" && flagged && (
                    <View style={[styles.flag, compact && styles.flagCompact]}>
                      <Ionicons
                        name="flash"
                        size={scale(compact ? 7 : 11)}
                        color="#FFFFFF"
                      />
                      <Text
                        style={[
                          styles.flagText,
                          compact && styles.flagTextCompact,
                          { color: "#FFFFFF" },
                        ]}
                      >
                        Active
                      </Text>
                    </View>
                  )}
                </View>
              </>
            );
            const tileStyle = [
              styles.tile,
              compact && styles.tileCompact,
              {
                backgroundColor:
                  viewMode === "diagnostic" && flagged
                    ? "#F97316"
                    : getHeatmapTileColor(tile.traffic),
                borderColor:
                  selected || (viewMode === "diagnostic" && flagged)
                    ? "#FDBA74"
                    : "rgba(255,255,255,0.22)",
              },
              selected && styles.selected,
            ];

            return onSelectTile ? (
              <Pressable
                key={tile.id}
                onPress={() => onSelectTile(tile.id)}
                style={tileStyle}
                accessibilityRole="button"
                accessibilityLabel={`${tile.label}, ${Math.round(tile.traffic * 100)} percent traffic`}
                accessibilityState={{ selected }}
              >
                {content}
              </Pressable>
            ) : (
              <View key={tile.id} style={tileStyle}>
                {content}
              </View>
            );
          })}
          {row.length < 3 &&
            Array.from({ length: 3 - row.length }, (_, index) => (
              <View key={`spacer-${index}`} style={styles.spacer} />
            ))}
        </View>
      ))}
      {configuredCount > visibleTiles.length && (
        <Text style={[styles.more, { color: c.muted }]}>
          Showing {visibleTiles.length} of {configuredCount} tiles
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: "100%", gap: scale(6) },
  row: { flexDirection: "row", gap: scale(6) },
  tile: {
    flex: 1,
    height: scale(91),
    position: "relative",
    overflow: "hidden",
    borderRadius: scale(13),
    padding: scale(8),
    borderWidth: 1.5,
    shadowColor: "#090B12",
    shadowOpacity: 0.42,
    shadowRadius: scale(8),
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },
  tileCompact: {
    height: scale(50),
    borderRadius: scale(9),
    padding: scale(5),
    shadowOpacity: 0.25,
    elevation: 3,
  },
  spacer: { flex: 1 },
  depth: {
    position: "absolute",
    left: scale(4),
    right: scale(4),
    bottom: 0,
    height: scale(8),
    opacity: 0.9,
  },
  depthCompact: { height: scale(5) },
  sheen: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "42%",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  diagonal: {
    position: "absolute",
    width: "145%",
    height: 1,
    top: "50%",
    left: "-22%",
    backgroundColor: "rgba(52,12,6,0.64)",
    transform: [{ rotate: "45deg" }],
  },
  bevelTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1.5,
    backgroundColor: "rgba(255,255,255,0.42)",
  },
  bevelBottom: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(57,12,5,0.72)",
  },
  inner: { flex: 1, alignItems: "center", justifyContent: "center" },
  label: {
    fontSize: scale(7),
    letterSpacing: 1,
    fontFamily: fonts.bold,
  },
  labelCompact: { fontSize: scale(6), letterSpacing: 0.5 },
  traffic: {
    fontSize: scale(17),
    fontFamily: fonts.extrabold,
    marginTop: scale(3),
  },
  trafficCompact: { fontSize: scale(11), marginTop: scale(1) },
  flag: {
    flexDirection: "row",
    alignItems: "center",
    gap: scale(3),
    marginTop: scale(4),
  },
  flagText: {
    fontSize: scale(7),
    fontFamily: fonts.bold,
  },
  flagCompact: { gap: scale(1), marginTop: scale(1) },
  flagTextCompact: { fontSize: scale(5) },
  selected: { borderColor: "#FDBA74", borderWidth: 2.5 },
  empty: {
    fontSize: scale(10),
    fontFamily: fonts.medium,
    textAlign: "center",
    paddingVertical: scale(14),
  },
  more: {
    fontSize: scale(8),
    fontFamily: fonts.medium,
    textAlign: "center",
    marginTop: scale(2),
  },
});
