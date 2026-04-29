import { deploymentTemplates } from "../game/adapters";

/**
 * Resolves the absolute URL for a sprite asset bundled under `src/assets/units/`.
 * Using `import.meta.url` keeps paths correct regardless of build tooling.
 */
const unitSprite = (fileName: string): string => new URL(`../assets/units/${fileName}`, import.meta.url).href;
type SpriteFaction = "Player" | "Bot" | "Ally";

type FactionSpriteMap = {
  readonly Player?: string;
  readonly Bot?: string;
  readonly Ally?: string;
  readonly fallback?: string;
};

/**
 * Describes the ordered sprite sequence for a composite unit formation.
 * Index 0 is position 1 (first to render), index 3 is position 4 (last added at full strength).
 * When strength drops, the renderer shows fewer figures — always from the front of this array —
 * so the most visually identifying figures should be placed earliest.
 *
 * Each entry is a faction-keyed map so German and US troops show distinct art.
 */
interface CompositeSpriteDef {
  readonly Player: readonly string[];
  readonly Bot: readonly string[];
  readonly Ally: readonly string[];
}

/**
 * Composite sprite sequences for units whose formation is made up of mixed figure types.
 * The array length is always 4 (full strength). resolveCompositeSprites slices it to stackCount.
 *
 * Infantry_42 composition (strength 4→1):
 *   [Light pose-0, Mortar, Light pose-1, AT]
 *   Drop order (highest index first): AT → Light pose-1 → Mortar → Light pose-0 (last survivor)
 *
 * AT_Infantry composition (strength 4→1):
 *   [AT pose-0, Mortar, AT pose-1, AT pose-2]
 *   Drop order: AT pose-2 → AT pose-1 → Mortar → AT pose-0 (last survivor)
 *
 * Pose suffixes 1/2 reuse pose-0 files until faction-specific variants are added.
 */
const COMPOSITE_GROUND_SPRITES: Record<string, CompositeSpriteDef> = {
  Infantry_42: {
    Player: [
      unitSprite("Infantry_Light_USA_Southview.png"),   // pos 0 — core rifleman, last survivor
      unitSprite("Infantry_Mortar_USA_Southview.png"),  // pos 1 — mortar
      unitSprite("Infantry_Light_USA_Southview1.png"),   // pos 2 — rifleman pose-1
      unitSprite("Infantry_AT_USA_Southview.png")       // pos 3 — AT specialist, drops first
    ],
    Bot: [
      unitSprite("Infantry_Basic_German_Southview.png"),  // pos 0 — core rifleman, last survivor
      unitSprite("Infantry_Mortar_German_Southview.png"), // pos 1 — mortar
      unitSprite("Infantry_Basic_German_Southview.png"), // pos 2 — rifleman pose-1 (reuses pose-0 until variants exist)
      unitSprite("Infantry_AT_German_Southview.png")      // pos 3 — AT specialist, drops first
    ],
    Ally: [
      unitSprite("Infantry_Light_USA_Southview.png"),
      unitSprite("Infantry_Mortar_USA_Southview.png"),
      unitSprite("Infantry_Light_USA_Southview1.png"),
      unitSprite("Infantry_AT_USA_Southview.png")
    ]
  },
  AT_Infantry: {
    Player: [
      unitSprite("Infantry_AT_USA_Southview.png"),      // pos 0 — core AT, last survivor
      unitSprite("Infantry_Mortar_USA_Southview.png"),   // pos 1 — mortar support
      unitSprite("Infantry_AT_USA_Southview.png"),      // pos 2 — AT pose-1 (reuses pose-0 until variants exist)
      unitSprite("Infantry_AT_USA_Southview.png")       // pos 3 — AT pose-2, drops first (reuses pose-0)
    ],
    Bot: [
      unitSprite("Infantry_AT_German_Southview.png"),     // pos 0 — core AT, last survivor
      unitSprite("Infantry_Mortar_German_Southview.png"), // pos 1 — mortar support
      unitSprite("Infantry_AT_German_Southview.png"),    // pos 2 — AT pose-1 (reuses pose-0 until variants exist)
      unitSprite("Infantry_AT_German_Southview.png")     // pos 3 — AT pose-2, drops first (reuses pose-0)
    ],
    Ally: [
      unitSprite("Infantry_AT_USA_Southview.png"),
      unitSprite("Infantry_Mortar_USA_Southview.png"),
      unitSprite("Infantry_AT_USA_Southview.png"),
      unitSprite("Infantry_AT_USA_Southview.png")
    ]
  }
};

/**
 * Faction-aware ground sprites. Only units that genuinely exist for both factions belong here.
 * Single-faction unit types (e.g., Light_Tank=USA, Panzer_IV=German) are NOT listed here;
 * their SCENARIO_SPRITES entry points to the correct faction-specific art directly.
 */
const FACTION_GROUND_SPRITES: Record<string, FactionSpriteMap> = {
  Heavy_Tank: {
    Player: unitSprite("Tank_M26_USA_Southview.png"),
    Ally: unitSprite("Tank_M26_USA_Southview.png"),
    Bot: unitSprite("Tank_Tiger_German_Southview.png"),
    fallback: unitSprite("Tank_M26_USA_Southview.png")
  },
  Tank_Destroyer: {
    Player: unitSprite("Tankkiller_M10_USA_Southview.png"),
    Ally: unitSprite("Tankkiller_M10_USA_Southview.png"),
    Bot: unitSprite("Tankkiller_MarderIII_German_Southview.png"),
    fallback: unitSprite("Tankkiller_M10_USA_Southview.png")
  },
  SP_Artillery: {
    Player: unitSprite("Artillery_M7_USA_Southview.png"),
    Ally: unitSprite("Artillery_M7_USA_Southview.png"),
    Bot: unitSprite("Artillery_Hummel_German_Southview.png"),
    fallback: unitSprite("Artillery_M7_USA_Southview.png")
  },
  Flak_88: {
    Player: unitSprite("Flak_88_USA_Southview.png"),
    Ally: unitSprite("Flak_88_USA_Southview.png"),
    Bot: unitSprite("Flak_88_Germany_Southview.png"),
    fallback: unitSprite("Flak_88_USA_Southview.png")
  },
  Recon_Bike: {
    Player: unitSprite("Wheeled_Bikes_Recon_USA_Southview.png"),
    Ally: unitSprite("Wheeled_Bikes_Recon_USA_Southview.png"),
    Bot: unitSprite("Wheeled_Bikes_Recon_German_Southview.png"),
    fallback: unitSprite("Wheeled_Bikes_Recon_USA_Southview.png")
  },
  Engineer: {
    Player: unitSprite("Infantry_Engineers_USA_Southview.png"),
    Ally: unitSprite("Infantry_Engineers_USA_Southview.png"),
    Bot: unitSprite("Infantry_Engineer_German_Southview.png"),
    fallback: unitSprite("Infantry_Engineers_USA_Southview.png")
  }
};

/**
 * Direct mapping from engine `ScenarioUnit.type` values to concrete sprite assets.
 * This table mirrors the art catalogue so both AI and player-owned units render consistently.
 * NOTE: For units defined in FACTION_GROUND_SPRITES, those faction-aware mappings take precedence.
 */
const SCENARIO_SPRITES: Record<string, string> = {
  Infantry_42: unitSprite("Infantry_Light_USA_Southview.png"),
  AT_Infantry: unitSprite("Infantry_AT_USA_Southview.png"),
  Paratrooper: unitSprite("Paratrooper.png"),
  Engineer: unitSprite("Infantry_Engineers_USA_Southview.png"),
  Combat_Engineer: unitSprite("Infantry_Engineers_USA_Southview.png"),
  AT_Gun_50mm: unitSprite("Wheeled_AT_Gun_USA_Southview.png"),
  Flak_88: unitSprite("Flak_88_USA_Southview.png"),
  Recon_ArmoredCar: unitSprite("Recon_ArmoredCar.png"),
  Recon_Bike: unitSprite("Wheeled_Bikes_Recon_USA_Southview.png"),
  APC_Truck: unitSprite("APC_Truck.png"),
  APC_Halftrack: unitSprite("APC_Halftrack.png"),
  Supply_Truck: unitSprite("Supply_Truck.png"),
  Panzer_IV: unitSprite("Tank_PanzerIV_German_Southview.png"),
  Heavy_Tank: unitSprite("Tank_M26_USA_Southview.png"),
  Tank_Destroyer: unitSprite("Tankkiller_M10_USA_Southview.png"),
  Assault_Gun: unitSprite("Assault_Gun.png"),
  Howitzer_105: unitSprite("Artillery_Howitzer_USA_Southview.png"),
  Rocket_Artillery: unitSprite("Artillery_Howitzer_USA_Southview.png"),
  SP_Artillery: unitSprite("Artillery_M7_USA_Southview.png"),
  Scout_Plane: unitSprite("Scout_Plane.png"),
  Fighter: unitSprite("Fighter.png"),
  Interceptor: unitSprite("Interceptor.png"),
  Ground_Attack: unitSprite("Ground_Attack.png"),
  Bomber: unitSprite("Bomber.png"),
  Transport_Plane: unitSprite("Transport_Plane.png"),
  Infantry: unitSprite("Infantry_Light_USA_Southview.png"),
  Howitzer: unitSprite("Artillery_Howitzer_USA_Southview.png"),
  Panzer_V: unitSprite("Panzer_V.png"),
  Light_Tank: unitSprite("Tank_M4_USA_Southview.png"),
  Anti_Tank_Tank: unitSprite("Tankkiller_M10_USA_Southview.png"),
  SPAA: unitSprite("Flak_88_USA_Southview.png"),
  Recon: unitSprite("Recon_ArmoredCar.png"),
  Bomber_Elite: unitSprite("Bomber.png"),
  Transport_Ship: unitSprite("Transport_Ship.png"),
  Battleship: unitSprite("Battleship.png"),
  Infantry_Elite: unitSprite("Infantry_Elite.png"),
  Artillery_155mm: unitSprite("Artillery_Howitzer_USA_Southview.png"),
  Artillery_105mm: unitSprite("Artillery_Howitzer_USA_Southview.png")
};

const FACTION_AIRCRAFT_SPRITES: Record<string, FactionSpriteMap> = {
  Fighter: {
    Player: unitSprite("Aircraft_USA_P51.png"),
    Ally: unitSprite("Aircraft_USA_P51.png"),
    Bot: unitSprite("Aircraft_German_BF109.png"),
    fallback: unitSprite("Aircraft_USA_P51.png")
  },
  Interceptor: {
    Player: unitSprite("Aircraft_England_Spitfire.png"),
    Ally: unitSprite("Aircraft_England_Spitfire.png"),
    Bot: unitSprite("Aircraft_German_FW190.png"),
    fallback: unitSprite("Aircraft_England_Spitfire.png")
  },
  Ground_Attack: {
    Player: unitSprite("Aircraft_USA_B25.png"),
    Ally: unitSprite("Aircraft_USA_B25.png"),
    Bot: unitSprite("Aircraft_German_JU87.png"),
    fallback: unitSprite("Aircraft_USA_B25.png")
  },
  Bomber: {
    Player: unitSprite("Aircraft_USA_B17.png"),
    Ally: unitSprite("Aircraft_USA_B17.png"),
    Bot: unitSprite("Aircraft_German_HE177.png"),
    fallback: unitSprite("Aircraft_USA_B17.png")
  },
  Bomber_Elite: {
    Player: unitSprite("Aircraft_USA_B17.png"),
    Ally: unitSprite("Aircraft_USA_B17.png"),
    Bot: unitSprite("Aircraft_German_HE177.png"),
    fallback: unitSprite("Aircraft_USA_B17.png")
  }
};

function normalizeSpriteFaction(faction?: string | null): SpriteFaction | null {
  if (faction === "Bot") {
    return "Bot";
  }
  if (faction === "Ally") {
    return "Ally";
  }
  if (faction === "Player") {
    return "Player";
  }
  return null;
}

function resolveScenarioSprite(scenarioType: string, faction?: string | null): string | undefined {
  // Check faction-aware aircraft sprites first
  const aircraftSpriteSet = FACTION_AIRCRAFT_SPRITES[scenarioType];
  if (aircraftSpriteSet) {
    const spriteFaction = normalizeSpriteFaction(faction);
    if (spriteFaction && aircraftSpriteSet[spriteFaction]) {
      return aircraftSpriteSet[spriteFaction];
    }
    return aircraftSpriteSet.Player ?? aircraftSpriteSet.Ally ?? aircraftSpriteSet.Bot ?? aircraftSpriteSet.fallback;
  }
  // Check faction-aware ground sprites next (tanks, artillery, etc.)
  const groundSpriteSet = FACTION_GROUND_SPRITES[scenarioType];
  if (groundSpriteSet) {
    const spriteFaction = normalizeSpriteFaction(faction);
    if (spriteFaction && groundSpriteSet[spriteFaction]) {
      return groundSpriteSet[spriteFaction];
    }
    return groundSpriteSet.Player ?? groundSpriteSet.Ally ?? groundSpriteSet.Bot ?? groundSpriteSet.fallback;
  }
  return SCENARIO_SPRITES[scenarioType];
}

/**
 * Maps facing direction to directional view suffix.
 * Naming convention: Southview=SE, Sideview=E, Northview=NE (with horizontal flip for left facings).
 */
function getViewSuffixForFacing(facing: string): "Southview" | "Sideview" | "Northview" {
  switch (facing) {
    case "NE":
    case "NW":
      return "Northview";
    case "E":
    case "W":
      return "Sideview";
    case "SE":
    case "SW":
    default:
      return "Southview";
  }
}

/**
 * Swaps the view suffix in a sprite URL to match the facing direction.
 * Only applies to sprites that include directional suffixes (e.g., "_Southview.png").
 * Returns the original URL if no directional suffix is present.
 */
function resolveDirectionalSprite(spriteUrl: string, facing: string): string {
  const viewSuffix = getViewSuffixForFacing(facing);
  // Replace any existing directional suffix with the target one.
  // Preserve optional pose suffix numbers (e.g. "_Southview1.png" -> "_Northview1.png").
  return spriteUrl.replace(/_(Southview|Sideview|Northview)(\d*)\.png$/i, `_${viewSuffix}$2.png`);
}

/**
 * Returns the ordered sprite URL array for the given unit type, faction, and stack count.
 * For composite units the returned slice matches the count so each position gets a distinct figure.
 * For non-composite units every position in the slice is the same single sprite.
 * Returns null if no sprite is registered for the type+faction combination.
 */
export function getCompositeSpritesForUnit(
  scenarioType: string,
  faction: "Player" | "Bot" | "Ally",
  stackCount: number,
  reconStatus?: string,
  facing?: string
): string[] | null {
  if (reconStatus === "spotted") {
    return null; // caller uses UNKNOWN_CONTACT_SPRITE for all positions
  }
  const clampedCount = Math.max(1, Math.min(4, stackCount));
  const composite = COMPOSITE_GROUND_SPRITES[scenarioType];
  if (composite) {
    const factionSprites = composite[faction];
    const sprites = Array.from({ length: clampedCount }, (_, i) => factionSprites[i]!);
    if (facing) {
      return sprites.map((url) => resolveDirectionalSprite(url, facing));
    }
    return sprites;
  }
  const single = resolveScenarioSprite(scenarioType, faction);
  if (!single) {
    return null;
  }
  const resolved = facing ? resolveDirectionalSprite(single, facing) : single;
  return Array.from({ length: clampedCount }, () => resolved);
}

/**
 * Retrieves the sprite URL registered for a given engine scenario type.
 * Optionally resolves directional view based on facing (e.g., Northview/Sideview/Southview).
 */
export function getSpriteForScenarioType(scenarioType: string, faction?: string | null, facing?: string): string | undefined {
  const sprite = resolveScenarioSprite(scenarioType, faction);
  if (!sprite || !facing) {
    return sprite;
  }
  return resolveDirectionalSprite(sprite, facing);
}

/**
 * Allocation keys point to ScenarioUnit templates. This lookup allows UI-only data (e.g., deployment options)
 * to translate into a concrete engine type and therefore the correct sprite.
 */
export const allocationKeyToScenarioType: Record<string, string> = {};

deploymentTemplates.forEach((template) => {
  allocationKeyToScenarioType[template.key] = template.type as string;
});

const ALLOCATION_SPRITES: Record<string, string> = {};

Object.entries(allocationKeyToScenarioType).forEach(([allocationKey, scenarioType]) => {
  const sprite = resolveScenarioSprite(scenarioType, "Player");
  if (sprite) {
    ALLOCATION_SPRITES[allocationKey] = sprite;
  }
});

/**
 * Retrieves the sprite URL for a deployment allocation key, if the catalogue includes one.
 * Does not support facing-based directional resolution (use getSpriteForScenarioType for that).
 */
export function getSpriteForAllocationKey(allocationKey: string, faction?: string | null): string | undefined {
  const scenarioType = allocationKeyToScenarioType[allocationKey];
  if (scenarioType) {
    return resolveScenarioSprite(scenarioType, faction) ?? ALLOCATION_SPRITES[allocationKey];
  }
  return ALLOCATION_SPRITES[allocationKey];
}
