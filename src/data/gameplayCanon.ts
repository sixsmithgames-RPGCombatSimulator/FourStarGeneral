type CanonTuple = readonly [string, string];

export type CanonEntry = { key: string; description: string };

type CanonSection = readonly CanonEntry[];

function enforceUniqueTuples(tuples: readonly CanonTuple[], label: string): void {
  const seen = new Set<string>();
  for (const [key] of tuples) {
    if (seen.has(key)) {
      throw new Error(`Duplicate ${label} entry: ${key}`);
    }
    seen.add(key);
  }
}

function tuplesToEntries(tuples: readonly CanonTuple[]): CanonSection {
  return tuples.map(([key, description]) => ({ key, description }));
}

function tuplesToKeys<T extends CanonTuple>(tuples: readonly T[]): string[] {
  return tuples.map(([key]) => key);
}

export const GENERAL_MODIFIER_TUPLES = [
  ["accBonus", "General stat modifying accuracy-based calculations."],
  ["dmgBonus", "General stat modifying baseline damage calculations."],
  ["moveBonus", "General stat modifying unit movement allowances."],
  ["supplyBonus", "General stat modifying supply delivery calculations."]
] as const;

enforceUniqueTuples(GENERAL_MODIFIER_TUPLES, "general modifier");

export type GeneralModifierKey = (typeof GENERAL_MODIFIER_TUPLES)[number][0];
export const GENERAL_MODIFIER_CANON = tuplesToEntries(GENERAL_MODIFIER_TUPLES);
export const GENERAL_MODIFIER_KEYS = tuplesToKeys(GENERAL_MODIFIER_TUPLES) as GeneralModifierKey[];

export const UNIT_PROPERTY_TUPLES = [
  ["class", "Unit classification used for UI and balance lookups."],
  ["movement", "Base movement allowance before modifiers."],
  ["moveType", "Movement profile referencing terrain costs."],
  ["vision", "Detection radius used during recon checks."],
  ["ammo", "Baseline ammunition stock for the unit."],
  ["fuel", "Fuel reserve supporting movement or actions."],
  ["rangeMin", "Minimum attack range permitted."],
  ["rangeMax", "Maximum attack range permitted."],
  ["initiative", "Initiative rating guiding combat order."],
  ["armor", "Armor profile keyed by facing."],
  ["hardAttack", "Attack value versus armored targets."],
  ["softAttack", "Attack value versus unarmored targets."],
  ["ap", "Armor penetration or action potential rating."],
  ["accuracyBase", "Base accuracy percentage before modifiers."],
  ["traits", "Trait identifiers applied to the unit."],
  ["cost", "Deployment or purchase cost value."]
] as const;

enforceUniqueTuples(UNIT_PROPERTY_TUPLES, "unit property");

export type UnitPropertyKey = (typeof UNIT_PROPERTY_TUPLES)[number][0];
export const UNIT_PROPERTY_CANON = tuplesToEntries(UNIT_PROPERTY_TUPLES);
export const UNIT_PROPERTY_KEYS = tuplesToKeys(UNIT_PROPERTY_TUPLES) as UnitPropertyKey[];

export const UNIT_ARMOR_FACING_TUPLES = [
  ["front", "Armor applied to frontal attacks."],
  ["side", "Armor applied to flank attacks."],
  ["top", "Armor applied to top-down attacks."]
] as const;

enforceUniqueTuples(UNIT_ARMOR_FACING_TUPLES, "unit armor facing");

export type UnitArmorFacingKey = (typeof UNIT_ARMOR_FACING_TUPLES)[number][0];
export const UNIT_ARMOR_FACING_CANON = tuplesToEntries(UNIT_ARMOR_FACING_TUPLES);
export const UNIT_ARMOR_FACING_KEYS = tuplesToKeys(UNIT_ARMOR_FACING_TUPLES) as UnitArmorFacingKey[];

export const MOVE_PROFILE_TUPLES = [
  ["leg", "Infantry movement profile for foot formations."],
  ["wheel", "Wheeled vehicle movement profile."],
  ["track", "Tracked vehicle movement profile."],
  ["air", "Airborne movement profile ignoring ground costs."]
] as const;

enforceUniqueTuples(MOVE_PROFILE_TUPLES, "movement profile");

export type MoveProfileKey = (typeof MOVE_PROFILE_TUPLES)[number][0];
export const MOVE_PROFILE_CANON = tuplesToEntries(MOVE_PROFILE_TUPLES);
export const MOVE_PROFILE_KEYS = tuplesToKeys(MOVE_PROFILE_TUPLES) as MoveProfileKey[];

export const UNIT_CLASS_TUPLES = [
  ["infantry", "Line infantry formations."],
  ["specialist", "Specialist support teams."],
  ["vehicle", "Unarmored vehicle detachments."],
  ["tank", "Armored tank companies."],
  ["artillery", "Indirect artillery batteries."],
  ["air", "Air power squadrons."],
  ["recon", "Reconnaissance units."]
] as const;

enforceUniqueTuples(UNIT_CLASS_TUPLES, "unit class");

export type UnitClassKey = (typeof UNIT_CLASS_TUPLES)[number][0];
export const UNIT_CLASS_CANON = tuplesToEntries(UNIT_CLASS_TUPLES);
export const UNIT_CLASS_KEYS = tuplesToKeys(UNIT_CLASS_TUPLES) as UnitClassKey[];

export const UNIT_TRAIT_TUPLES = [
  ["skirmish", "Trait key for skirmish engagement handling."],
  ["indirect", "Trait key marking indirect-fire capability."],
  ["zoc", "Trait key enabling zone of control interactions."],
  ["entrenchBuster", "Trait key handling entrenchment reduction."],
  ["suppression", "Trait key applying suppression mechanics."],
  ["intercept", "Trait key enabling interception logic."],
  ["carpet", "Trait key for carpet-strike handling."]
] as const;

enforceUniqueTuples(UNIT_TRAIT_TUPLES, "unit trait");

export type UnitTraitKey = (typeof UNIT_TRAIT_TUPLES)[number][0];
export const UNIT_TRAIT_CANON = tuplesToEntries(UNIT_TRAIT_TUPLES);
export const UNIT_TRAIT_KEYS = tuplesToKeys(UNIT_TRAIT_TUPLES) as UnitTraitKey[];

export const TERRAIN_PROPERTY_TUPLES = [
  ["moveCost", "Movement cost multipliers keyed by move profile."],
  ["defense", "Defense modifier applied to occupying units."],
  ["accMod", "Accuracy modifier applied to attacks through the tile."],
  ["blocksLOS", "Flag indicating whether the tile blocks line of sight."]
] as const;

enforceUniqueTuples(TERRAIN_PROPERTY_TUPLES, "terrain property");

export type TerrainPropertyKey = (typeof TERRAIN_PROPERTY_TUPLES)[number][0];
export const TERRAIN_PROPERTY_CANON = tuplesToEntries(TERRAIN_PROPERTY_TUPLES);
export const TERRAIN_PROPERTY_KEYS = tuplesToKeys(TERRAIN_PROPERTY_TUPLES) as TerrainPropertyKey[];

export const TERRAIN_NAME_TUPLES = [
  ["plains", "Open plains terrain."],
  ["forest", "Forested terrain."],
  ["hill", "Rolling hill terrain."],
  ["mountain", "Mountain terrain."],
  ["city", "Urban city terrain."],
  ["marsh", "Marshland terrain."],
  ["river", "River terrain."],
  ["road", "Improved road terrain."],
  ["beach", "Beach landing terrain."],
  ["sea", "Open sea terrain."]
] as const;

enforceUniqueTuples(TERRAIN_NAME_TUPLES, "terrain name");

export type TerrainNameKey = (typeof TERRAIN_NAME_TUPLES)[number][0];
export const TERRAIN_NAME_CANON = tuplesToEntries(TERRAIN_NAME_TUPLES);
export const TERRAIN_NAME_KEYS = tuplesToKeys(TERRAIN_NAME_TUPLES) as TerrainNameKey[];

export const TERRAIN_TYPE_TUPLES = [
  ["marsh", "Wetland biome."],
  ["grass", "Grassy land biome."],
  ["rural", "Rural hinterland biome."],
  ["mountain", "Mountain biome."],
  ["coastal", "Coastal shoreline biome."],
  ["water", "Open water biome."],
  ["urban", "Dense urban biome."]
] as const;

enforceUniqueTuples(TERRAIN_TYPE_TUPLES, "terrain type");

export type TerrainTypeKey = (typeof TERRAIN_TYPE_TUPLES)[number][0];
export const TERRAIN_TYPE_CANON = tuplesToEntries(TERRAIN_TYPE_TUPLES);
export const TERRAIN_TYPE_KEYS = tuplesToKeys(TERRAIN_TYPE_TUPLES) as TerrainTypeKey[];

export const TERRAIN_DENSITY_TUPLES = [
  ["sparse", "Low feature density."],
  ["average", "Moderate feature density."],
  ["dense", "High feature density."]
] as const;

enforceUniqueTuples(TERRAIN_DENSITY_TUPLES, "terrain density");

export type TerrainDensityKey = (typeof TERRAIN_DENSITY_TUPLES)[number][0];
export const TERRAIN_DENSITY_CANON = tuplesToEntries(TERRAIN_DENSITY_TUPLES);
export const TERRAIN_DENSITY_KEYS = tuplesToKeys(TERRAIN_DENSITY_TUPLES) as TerrainDensityKey[];

export const TERRAIN_FEATURE_TUPLES = [
  ["rocks", "Rocky outcropping feature."],
  ["foothills", "Foothill feature."],
  ["cliffs", "Cliff face feature."],
  ["small rivers", "Small river feature."],
  ["bridge", "Bridge infrastructure feature."],
  ["large river", "Large river feature."],
  ["pastures", "Agricultural pasture feature."],
  ["trees", "Tree coverage feature."],
  ["shrubs", "Shrub coverage feature."],
  ["mounds", "Mound feature."],
  ["ditches", "Ditch feature."],
  ["hedges", "Hedge row feature."],
  ["trenches", "Entrenchment feature."],
  ["walls", "City wall feature."],
  ["barracades", "Barricade feature."],
  ["light fortifications", "Light fortification feature."],
  ["moderate fortifications", "Moderate fortification feature."],
  ["heavy fortifications", "Heavy fortification feature."]
] as const;

enforceUniqueTuples(TERRAIN_FEATURE_TUPLES, "terrain feature");

export type TerrainFeatureKey = (typeof TERRAIN_FEATURE_TUPLES)[number][0];
export const TERRAIN_FEATURE_CANON = tuplesToEntries(TERRAIN_FEATURE_TUPLES);
export const TERRAIN_FEATURE_KEYS = tuplesToKeys(TERRAIN_FEATURE_TUPLES) as TerrainFeatureKey[];

export const SCENARIO_TILE_PROPERTY_TUPLES = [
  ["terrain", "Terrain identifier drawn from the canon list."],
  ["terrainType", "Biome classification for the tile."],
  ["density", "Feature density of the tile."],
  ["features", "List of terrain features present."],
  ["recon", "Reconnaissance status assigned to the tile."]
] as const;

enforceUniqueTuples(SCENARIO_TILE_PROPERTY_TUPLES, "scenario tile property");

export type ScenarioTilePropertyKey = (typeof SCENARIO_TILE_PROPERTY_TUPLES)[number][0];
export const SCENARIO_TILE_PROPERTY_CANON = tuplesToEntries(SCENARIO_TILE_PROPERTY_TUPLES);
export const SCENARIO_TILE_PROPERTY_KEYS = tuplesToKeys(SCENARIO_TILE_PROPERTY_TUPLES) as ScenarioTilePropertyKey[];

export const SCENARIO_RECON_TUPLES = [
  ["aerial", "Recon status gathered from aerial sources."],
  ["intel", "Recon status gathered from intelligence reports."],
  ["firsthand", "Recon status gathered on location."],
  ["none", "No recon information available."]
] as const;

enforceUniqueTuples(SCENARIO_RECON_TUPLES, "scenario recon state");

export type ScenarioReconKey = (typeof SCENARIO_RECON_TUPLES)[number][0];
export const SCENARIO_RECON_CANON = tuplesToEntries(SCENARIO_RECON_TUPLES);
export const SCENARIO_RECON_KEYS = tuplesToKeys(SCENARIO_RECON_TUPLES) as ScenarioReconKey[];

export const SCENARIO_UNIT_PROPERTY_TUPLES = [
  ["type", "Unit type identifier referencing the unit catalog."],
  ["hex", "Axial hex coordinate for the unit."],
  ["strength", "Current strength rating."],
  ["experience", "Experience level accumulated."],
  ["ammo", "Current ammunition stock."],
  ["fuel", "Current fuel reserve."],
  ["entrench", "Entrenchment level on the tile."],
  ["facing", "Hexside direction the unit faces."]
] as const;

enforceUniqueTuples(SCENARIO_UNIT_PROPERTY_TUPLES, "scenario unit property");

export type ScenarioUnitPropertyKey = (typeof SCENARIO_UNIT_PROPERTY_TUPLES)[number][0];
export const SCENARIO_UNIT_PROPERTY_CANON = tuplesToEntries(SCENARIO_UNIT_PROPERTY_TUPLES);
export const SCENARIO_UNIT_PROPERTY_KEYS = tuplesToKeys(SCENARIO_UNIT_PROPERTY_TUPLES) as ScenarioUnitPropertyKey[];

export const SCENARIO_UNIT_FACING_TUPLES = [
  ["N", "North hexside."],
  ["NE", "North-east hexside."],
  ["SE", "South-east hexside."],
  ["S", "South hexside."],
  ["SW", "South-west hexside."],
  ["NW", "North-west hexside."]
] as const;

enforceUniqueTuples(SCENARIO_UNIT_FACING_TUPLES, "scenario unit facing");

export type ScenarioUnitFacingKey = (typeof SCENARIO_UNIT_FACING_TUPLES)[number][0];
export const SCENARIO_UNIT_FACING_CANON = tuplesToEntries(SCENARIO_UNIT_FACING_TUPLES);
export const SCENARIO_UNIT_FACING_KEYS = tuplesToKeys(SCENARIO_UNIT_FACING_TUPLES) as ScenarioUnitFacingKey[];

export const GAMEPLAY_CANON = {
  generals: {
    modifiers: GENERAL_MODIFIER_CANON
  },
  units: {
    properties: UNIT_PROPERTY_CANON,
    armorFacings: UNIT_ARMOR_FACING_CANON,
    moveProfiles: MOVE_PROFILE_CANON,
    classes: UNIT_CLASS_CANON,
    traits: UNIT_TRAIT_CANON
  },
  terrain: {
    names: TERRAIN_NAME_CANON,
    properties: TERRAIN_PROPERTY_CANON,
    terrainTypes: TERRAIN_TYPE_CANON,
    densities: TERRAIN_DENSITY_CANON,
    features: TERRAIN_FEATURE_CANON
  },
  scenario: {
    tileProperties: SCENARIO_TILE_PROPERTY_CANON,
    reconStates: SCENARIO_RECON_CANON,
    unitProperties: SCENARIO_UNIT_PROPERTY_CANON,
    facings: SCENARIO_UNIT_FACING_CANON,
    generalModifiers: GENERAL_MODIFIER_CANON
  }
} as const;

type GameplayCanon = typeof GAMEPLAY_CANON;

export type { GameplayCanon };
