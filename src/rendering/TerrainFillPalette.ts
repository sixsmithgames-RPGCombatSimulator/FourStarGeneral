export type TerrainFillTheme = "battle" | "briefing";

const BATTLE_TERRAIN_FILL: Readonly<Record<string, string>> = Object.freeze({
  sea: "#1c3a5d",
  beach: "#c79d67",
  plains: "#4f7a3a",
  grass: "#4f7a3a",
  forest: "#1f4f3c",
  hill: "#7a6a4d",
  road: "#bfae97",
  city: "#7e7b8b",
  town: "#8a8590",
  hamlet: "#9e9a8a",
  mountain: "#65616a",
  marsh: "#4a6145",
  muddy: "#6b5c40",
  river: "#1c4d6e"
});

function resolveBattleTerrainFill(terrain: string, terrainType: string): string {
  return BATTLE_TERRAIN_FILL[terrain.trim().toLowerCase()]
    ?? BATTLE_TERRAIN_FILL[terrainType.trim().toLowerCase()]
    ?? "#3c445c";
}

function resolveBriefingTerrainFill(terrain: string, terrainType: string): string {
  const normalized = `${terrain} ${terrainType}`.trim().toLowerCase();
  if (normalized.includes("water") || normalized.includes("river") || normalized.includes("sea")) {
    return "#5f7580";
  }
  if (normalized.includes("forest") || normalized.includes("woods")) return "#5a6648";
  if (normalized.includes("hill") || normalized.includes("ridge") || normalized.includes("mount")) return "#7a6849";
  if (["urban", "town", "hamlet", "city", "village"].some((key) => normalized.includes(key))) {
    return "#8a775d";
  }
  if (normalized.includes("road") || normalized.includes("bridge")) return "#8b7a58";
  if (normalized.includes("swamp") || normalized.includes("marsh") || normalized.includes("mud")) return "#66705d";
  if (normalized.includes("sand") || normalized.includes("desert") || normalized.includes("beach")) return "#a08c64";
  if (normalized.includes("snow") || normalized.includes("ice")) return "#c2c3b6";
  if (normalized.includes("field") || normalized.includes("plain") || normalized.includes("grass")) return "#867950";
  return resolveBattleTerrainFill(terrain, terrainType);
}

/** One terrain-fill authority with purpose-specific, explicitly selected visual themes. */
export function resolveTerrainFill(terrain: string, terrainType: string, theme: TerrainFillTheme): string {
  return theme === "briefing"
    ? resolveBriefingTerrainFill(terrain, terrainType)
    : resolveBattleTerrainFill(terrain, terrainType);
}
