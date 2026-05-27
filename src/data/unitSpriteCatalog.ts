import { deploymentTemplates } from "../game/adapters";

/**
 * Resolves the absolute URL for a sprite asset bundled under `src/assets/units/`.
 * Build tooling may fingerprint file names, so keep a filename→final URL manifest
 * for reliable directional swapping (Southview/Sideview/Northview) in both dev and prod.
 */
const UNIT_SPRITE_MANIFEST: Record<string, string> = typeof import.meta.glob === "function"
  ? import.meta.glob("../assets/units/*", {
      eager: true,
      import: "default"
    })
  : {};
const HAS_UNIT_SPRITE_MANIFEST = Object.keys(UNIT_SPRITE_MANIFEST).length > 0;

const UNIT_SPRITE_URL_BY_FILE = new Map<string, string>();
const UNIT_SPRITE_FILE_BY_URL = new Map<string, string>();

Object.entries(UNIT_SPRITE_MANIFEST).forEach(([path, url]) => {
  const fileName = path.split("/").pop();
  if (!fileName) {
    return;
  }
  UNIT_SPRITE_URL_BY_FILE.set(fileName, url);
  UNIT_SPRITE_FILE_BY_URL.set(url, fileName);
});

const unitSprite = (fileName: string): string => {
  const known = UNIT_SPRITE_URL_BY_FILE.get(fileName);
  if (known) {
    return known;
  }
  const resolved = new URL(`../assets/units/${fileName}`, import.meta.url).href;
  UNIT_SPRITE_URL_BY_FILE.set(fileName, resolved);
  UNIT_SPRITE_FILE_BY_URL.set(resolved, fileName);
  return resolved;
};
type SpriteFaction = "Player" | "Bot" | "Ally";

type FactionSpriteMap = {
  readonly Player?: string;
  readonly Bot?: string;
  readonly Ally?: string;
  readonly fallback?: string;
};

type SpriteCatalogEntry = string | FactionSpriteMap;
type FactionFileMap = {
  readonly Player: string;
  readonly Bot?: string;
  readonly Ally?: string;
  readonly fallback?: string;
};

const directionalSprite = (baseFileName: string): string => unitSprite(`${baseFileName}_Southview.png`);

function factionDirectionalSprites(files: FactionFileMap): FactionSpriteMap {
  const sprites: FactionSpriteMap = {
    Player: directionalSprite(files.Player),
    Ally: directionalSprite(files.Ally ?? files.Player),
    fallback: directionalSprite(files.fallback ?? files.Player)
  };
  return files.Bot ? { ...sprites, Bot: directionalSprite(files.Bot) } : sprites;
}

function factionStaticSprites(files: FactionFileMap): FactionSpriteMap {
  const sprites: FactionSpriteMap = {
    Player: unitSprite(files.Player),
    Ally: unitSprite(files.Ally ?? files.Player),
    fallback: unitSprite(files.fallback ?? files.Player)
  };
  return files.Bot ? { ...sprites, Bot: unitSprite(files.Bot) } : sprites;
}

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
      directionalSprite("Infantry_Light_USA"),   // pos 0 — core rifleman, last survivor
      directionalSprite("Infantry_Mortar_USA"),  // pos 1 — mortar
      directionalSprite("Infantry_Light_USA"),   // pos 2 — rifleman pose-1 (reuses pose-0 until variants exist)
      directionalSprite("Infantry_AT_USA")       // pos 3 — AT specialist, drops first
    ],
    Bot: [
      directionalSprite("Infantry_Basic_German"),  // pos 0 — core rifleman, last survivor
      directionalSprite("Infantry_Mortar_German"), // pos 1 — mortar
      directionalSprite("Infantry_Basic_German"),  // pos 2 — rifleman pose-1 (reuses pose-0 until variants exist)
      directionalSprite("Infantry_AT_German")      // pos 3 — AT specialist, drops first
    ],
    Ally: [
      directionalSprite("Infantry_Light_USA"),
      directionalSprite("Infantry_Mortar_USA"),
      directionalSprite("Infantry_Light_USA"),
      directionalSprite("Infantry_AT_USA")
    ]
  },
  AT_Infantry: {
    Player: [
      directionalSprite("Infantry_AT_USA"),      // pos 0 — core AT, last survivor
      directionalSprite("Infantry_Mortar_USA"),  // pos 1 — mortar support
      directionalSprite("Infantry_AT_USA"),      // pos 2 — AT pose-1 (reuses pose-0 until variants exist)
      directionalSprite("Infantry_AT_USA")       // pos 3 — AT pose-2, drops first (reuses pose-0)
    ],
    Bot: [
      directionalSprite("Infantry_AT_German"),     // pos 0 — core AT, last survivor
      directionalSprite("Infantry_Mortar_German"), // pos 1 — mortar support
      directionalSprite("Infantry_AT_German"),     // pos 2 — AT pose-1 (reuses pose-0 until variants exist)
      directionalSprite("Infantry_AT_German")      // pos 3 — AT pose-2, drops first (reuses pose-0)
    ],
    Ally: [
      directionalSprite("Infantry_AT_USA"),
      directionalSprite("Infantry_Mortar_USA"),
      directionalSprite("Infantry_AT_USA"),
      directionalSprite("Infantry_AT_USA")
    ]
  }
};

/**
 * Scenario unit sprites grouped by role. Entries are either a single concrete asset or a
 * faction map when the same scenario type has distinct USA/Allied and German art.
 */
const GROUND_UNIT_SPRITES: Record<string, SpriteCatalogEntry> = {
  // Infantry and support weapons
  Infantry_42: directionalSprite("Infantry_Light_USA"),
  Infantry: directionalSprite("Infantry_Light_USA"),
  Infantry_Elite: unitSprite("Infantry_Elite.png"),
  Infantry_mg: directionalSprite("Infantry_Light_USA"),
  Infantry_bazooka: directionalSprite("Infantry_AT_USA"),
  Infantry_mortar: directionalSprite("Infantry_Mortar_USA"),
  AT_Infantry: directionalSprite("Infantry_AT_USA"),
  Paratrooper: unitSprite("Paratrooper.png"),
  Engineer: factionDirectionalSprites({
    Player: "Infantry_Engineers_USA",
    Bot: "Infantry_Basic_German"
  }),
  Combat_Engineer: directionalSprite("Infantry_Engineers_USA"),
  AT_Gun_50mm: directionalSprite("Wheeled_AT_Gun_USA"),
  Flak_88: factionDirectionalSprites({
    Player: "Flak_88_USA",
    Bot: "Flak_88_Germany"
  }),
  SPAA: directionalSprite("Flak_88_USA"),

  // Recon, logistics, and carriers
  Recon_ArmoredCar: factionDirectionalSprites({
    Player: "Wheeled_Recon_Armored_Car_Greyhound_USA",
    Bot: "Wheeled_Recon_Armored_Car_SdKfz222_German"
  }),
  Recon: directionalSprite("Wheeled_Recon_Armored_Car_Greyhound_USA"),
  Recon_Bike: factionDirectionalSprites({
    Player: "Wheeled_Bikes_Recon_USA",
    Bot: "Wheeled_Bikes_Recon_German"
  }),
  Supply_Truck: factionDirectionalSprites({
    Player: "Wheeled_Supply_USA",
    Bot: "Wheeled_Supply_German"
  }),
  APC_Halftrack: factionDirectionalSprites({
    Player: "APC_Halftrack_USA",
    Bot: "APC_Halftrack_German"
  }),

  // Armor
  Light_Tank: directionalSprite("Tank_M4_USA"),
  Medium_Tank: factionDirectionalSprites({
    Player: "Tank_M4_USA",
    Bot: "Tank_PanzerIV_German"
  }),
  Panzer_IV: directionalSprite("Tank_PanzerIV_German"),
  Panzer_V: unitSprite("Panzer_V.png"),
  Heavy_Tank: factionDirectionalSprites({
    Player: "Tank_M26_USA",
    Bot: "Tank_Tiger_German"
  }),
  Assault_Gun: factionDirectionalSprites({
    Player: "Tank_Assault_M8_USA",
    Bot: "Tank_Assault_StuG_German"
  }),
  Tank_Destroyer: factionDirectionalSprites({
    Player: "Tankkiller_M10_USA",
    Bot: "Tankkiller_MarderIII_German"
  }),
  Anti_Tank_Tank: directionalSprite("Tankkiller_M10_USA"),

  // Artillery
  Howitzer_105: directionalSprite("Artillery_Howitzer_USA"),
  Howitzer: directionalSprite("Artillery_Howitzer_USA"),
  Artillery_105mm: directionalSprite("Artillery_Howitzer_USA"),
  Artillery_155mm: directionalSprite("Artillery_Howitzer_USA"),
  Rocket_Artillery: factionDirectionalSprites({
    Player: "Artillery_Calliope_USA",
    Bot: "Artillery_Nebelwerfer_German"
  }),
  SP_Artillery: factionDirectionalSprites({
    Player: "Artillery_M7_USA",
    Bot: "Artillery_Hummel_German"
  }),

  // Naval and legacy assets
  Transport_Ship: unitSprite("Transport_Ship.png"),
  Battleship: unitSprite("Battleship.png")
};

const AIRCRAFT_UNIT_SPRITES: Record<string, SpriteCatalogEntry> = {
  Scout_Plane: unitSprite("Scout_Plane.png"),
  Fighter: factionStaticSprites({
    Player: "Aircraft_USA_P51.png",
    Bot: "Aircraft_German_BF109.png"
  }),
  Interceptor: factionStaticSprites({
    Player: "Aircraft_England_Spitfire.png",
    Bot: "Aircraft_German_FW190.png"
  }),
  Ground_Attack: factionStaticSprites({
    Player: "Aircraft_USA_B25.png",
    Bot: "Aircraft_German_JU87.png"
  }),
  Bomber: factionStaticSprites({
    Player: "Aircraft_USA_B17.png",
    Bot: "Aircraft_German_HE177.png"
  }),
  Bomber_Elite: factionStaticSprites({
    Player: "Aircraft_USA_B17.png",
    Bot: "Aircraft_German_HE177.png"
  }),
  Transport_Plane: unitSprite("Transport_Plane.png")
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

function resolveCatalogEntry(entry: SpriteCatalogEntry | undefined, faction?: string | null): string | undefined {
  if (!entry) {
    return undefined;
  }
  if (typeof entry === "string") {
    return entry;
  }
  const spriteFaction = normalizeSpriteFaction(faction);
  if (spriteFaction && entry[spriteFaction]) {
    return entry[spriteFaction];
  }
  return entry.Player ?? entry.Ally ?? entry.Bot ?? entry.fallback;
}

function resolveScenarioSprite(scenarioType: string, faction?: string | null): string | undefined {
  return (
    resolveCatalogEntry(AIRCRAFT_UNIT_SPRITES[scenarioType], faction)
    ?? resolveCatalogEntry(GROUND_UNIT_SPRITES[scenarioType], faction)
  );
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
  const sourceFileName = UNIT_SPRITE_FILE_BY_URL.get(spriteUrl);
  if (!sourceFileName) {
    return spriteUrl;
  }

  const resolvedFileName = sourceFileName.replace(
    /_(Southview|Sideview|Northview)(\d*)\.png$/i,
    `_${viewSuffix}$2.png`
  );
  if (resolvedFileName === sourceFileName) {
    return spriteUrl;
  }

  const manifestUrl = UNIT_SPRITE_URL_BY_FILE.get(resolvedFileName);
  if (manifestUrl) {
    return manifestUrl;
  }
  return HAS_UNIT_SPRITE_MANIFEST ? spriteUrl : unitSprite(resolvedFileName);
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
 * When facing is provided, resolves the directional view (e.g., Sideview/Southview/Northview).
 */
export function getSpriteForAllocationKey(allocationKey: string, faction?: string | null, facing?: string): string | undefined {
  const scenarioType = allocationKeyToScenarioType[allocationKey];
  const sprite = scenarioType
    ? resolveScenarioSprite(scenarioType, faction) ?? ALLOCATION_SPRITES[allocationKey]
    : ALLOCATION_SPRITES[allocationKey];
  if (!sprite || !facing) {
    return sprite;
  }
  return resolveDirectionalSprite(sprite, facing);
}
