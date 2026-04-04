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
 * Direct mapping from engine `ScenarioUnit.type` values to concrete sprite assets.
 * This table mirrors the art catalogue so both AI and player-owned units render consistently.
 */
const SCENARIO_SPRITES: Record<string, string> = {
  Infantry_42: unitSprite("Infantry.png"),
  AT_Infantry: unitSprite("Infantry_Elite.png"),
  Paratrooper: unitSprite("Paratrooper.png"),
  Engineer: unitSprite("Engineer.png"),
  Combat_Engineer: unitSprite("Combat_Engineer.png"),
  AT_Gun_50mm: unitSprite("AT_Gun_50mm.png"),
  Flak_88: unitSprite("Flak_88.png"),
  Recon_ArmoredCar: unitSprite("Recon_ArmoredCar.png"),
  Recon_Bike: unitSprite("Recon_Bike.png"),
  APC_Truck: unitSprite("APC_Truck.png"),
  APC_Halftrack: unitSprite("APC_Halftrack.png"),
  Supply_Truck: unitSprite("Supply_Truck.png"),
  Panzer_IV: unitSprite("Light_Tank.png"),
  Heavy_Tank: unitSprite("Heavy_Tank.png"),
  Tank_Destroyer: unitSprite("Anti_Tank_Tank.png"),
  Assault_Gun: unitSprite("Assault_Gun.png"),
  Howitzer_105: unitSprite("Howitzer_105.png"),
  Rocket_Artillery: unitSprite("Rocket_Artillery.png"),
  SP_Artillery: unitSprite("SP_Artillery.png"),
  Scout_Plane: unitSprite("Scout_Plane.png"),
  Fighter: unitSprite("Fighter.png"),
  Interceptor: unitSprite("Interceptor.png"),
  Ground_Attack: unitSprite("Ground_Attack.png"),
  Bomber: unitSprite("Bomber.png"),
  Transport_Plane: unitSprite("Transport_Plane.png"),
  Infantry: unitSprite("Infantry.png"),
  Howitzer: unitSprite("Howitzer_105.png"),
  Panzer_V: unitSprite("Panzer_V.png"),
  Light_Tank: unitSprite("Light_Tank.png"),
  Anti_Tank_Tank: unitSprite("Anti_Tank_Tank.png"),
  SPAA: unitSprite("Flak_88.png"),
  Recon: unitSprite("Recon_ArmoredCar.png"),
  Bomber_Elite: unitSprite("Bomber.png"),
  Transport_Ship: unitSprite("Transport_Ship.png"),
  Battleship: unitSprite("Battleship.png"),
  Infantry_Elite: unitSprite("Infantry_Elite.png"),
  Artillery_155mm: unitSprite("Howitzer_105.png"),
  Artillery_105mm: unitSprite("Howitzer_105.png")
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
  const aircraftSpriteSet = FACTION_AIRCRAFT_SPRITES[scenarioType];
  if (aircraftSpriteSet) {
    const spriteFaction = normalizeSpriteFaction(faction);
    if (spriteFaction && aircraftSpriteSet[spriteFaction]) {
      return aircraftSpriteSet[spriteFaction];
    }
    return aircraftSpriteSet.Player ?? aircraftSpriteSet.Ally ?? aircraftSpriteSet.Bot ?? aircraftSpriteSet.fallback;
  }
  return SCENARIO_SPRITES[scenarioType];
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
 * Retrieves the sprite URL registered for a given engine scenario type.
 */
export function getSpriteForScenarioType(scenarioType: string, faction?: string | null): string | undefined {
  return resolveScenarioSprite(scenarioType, faction);
}

/**
 * Retrieves the sprite URL for a deployment allocation key, if the catalogue includes one.
 */
export function getSpriteForAllocationKey(allocationKey: string, faction?: string | null): string | undefined {
  const scenarioType = allocationKeyToScenarioType[allocationKey];
  if (scenarioType) {
    return resolveScenarioSprite(scenarioType, faction) ?? ALLOCATION_SPRITES[allocationKey];
  }
  return ALLOCATION_SPRITES[allocationKey];
}
