import { registerTest } from "./harness.js";
import type {
  Axial,
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  TerrainDefinition,
  TerrainDictionary,
  UnitTypeDefinition,
  UnitTypeDictionary
} from "../src/core/types";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const terrain: TerrainDictionary = {
  plains
} as unknown as TerrainDictionary;

const fighterDef: UnitTypeDefinition = {
  class: "air",
  combat: { category: "air", weight: "light", role: "normal", signature: "small" },
  movement: 8,
  moveType: "air",
  vision: 4,
  ammo: 6,
  fuel: 55,
  rangeMin: 1,
  rangeMax: 2,
  initiative: 6,
  armor: { front: 5, side: 4, top: 4 },
  hardAttack: 12,
  softAttack: 18,
  ap: 6,
  accuracyBase: 64,
  traits: ["skirmish"],
  cost: 320,
  airSupport: {
    roles: ["escort", "cap"],
    cruiseSpeedKph: 540,
    combatRadiusKm: 250,
    refitTurns: 1
  }
};

const groundAttackDef: UnitTypeDefinition = {
  class: "air",
  combat: { category: "air", weight: "light", role: "antiVehicle", signature: "medium" },
  movement: 8,
  moveType: "air",
  vision: 4,
  ammo: 5,
  fuel: 55,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 5,
  armor: { front: 6, side: 5, top: 4 },
  hardAttack: 20,
  softAttack: 35,
  ap: 5,
  accuracyBase: 60,
  traits: ["carpet"],
  cost: 380,
  airSupport: {
    roles: ["strike"],
    cruiseSpeedKph: 420,
    combatRadiusKm: 240,
    refitTurns: 2
  }
};

const unitTypes: UnitTypeDictionary = {
  Fighter: fighterDef,
  GroundAttack: groundAttackDef
} as unknown as UnitTypeDictionary;

function side(): ScenarioSide {
  return {
    hq: { q: 0, r: 0 },
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units: []
  };
}

function scenario(): ScenarioData {
  const tileKey = "plains";
  const row = Array.from({ length: 4 }, () => ({ tile: tileKey }));
  return {
    name: "Bot Air EndTurn Advance",
    size: { cols: 4, rows: 4 },
    tilePalette: {
      [tileKey]: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [row, row, row, row],
    objectives: [{ hex: { q: 2, r: 1 }, owner: "Player", vp: 250 }],
    turnLimit: 5,
    sides: { Player: side(), Bot: side() }
  } as unknown as ScenarioData;
}

function make(type: string, hex: Axial, unitId: string): ScenarioUnit {
  const definition = unitTypes[type as keyof typeof unitTypes];
  return {
    type: type as unknown as ScenarioUnit["type"],
    hex,
    strength: 100,
    experience: 0,
    ammo: definition.ammo ?? 6,
    fuel: definition.fuel ?? 50,
    entrench: 0,
    facing: "NW",
    unitId
  };
}

registerTest("BOT_PHASE_END_TURN_SCHEDULES_HEURISTIC_AIR_OPS_BEFORE_ROUND_ADVANCE", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a bot-turn advance path with CAP aircraft and an active player strike threat", async () => {
    const config: GameEngineConfig = {
      scenario: scenario(),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);
    (engine as any)._phase = "botTurn";
    (engine as any)._activeFaction = "Bot";

    (engine as any).botPlacements.set("0,0", make("Fighter", { q: 0, r: 0 }, "bot-cap"));
    (engine as any).playerPlacements.set("3,0", make("GroundAttack", { q: 3, r: 0 }, "player-strike"));
  });

  await When("endTurn executes from botTurn without running the full ground bot loop", async () => {
    engine.endTurn();
  });

  await Then("the bot should still queue or launch at least one CAP mission", async () => {
    const missions = engine.getScheduledAirMissions("Bot");
    const capMission = missions.find((mission) => mission.kind === "airCover");
    if (!capMission) {
      throw new Error(`Expected at least one bot CAP mission after bot-phase endTurn, saw ${missions.map((mission) => mission.kind).join(", ") || "none"}.`);
    }
  });
});
