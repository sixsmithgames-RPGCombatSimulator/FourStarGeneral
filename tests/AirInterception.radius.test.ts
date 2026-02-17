import { registerTest } from "./harness.js";
import type {
  ScenarioUnit,
  ScenarioSide,
  ScenarioData,
  TerrainDefinition,
  TerrainDictionary,
  UnitTypeDictionary,
  UnitTypeDefinition,
  Axial
} from "../src/core/types";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const terrain: TerrainDictionary = { plains } as unknown as TerrainDictionary;

const fighterDef: UnitTypeDefinition = {
  class: "air",
  movement: 5,
  moveType: "air",
  vision: 4,
  ammo: 6,
  fuel: 50,
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
  airSupport: { roles: ["cap"], cruiseSpeedKph: 540, combatRadiusKm: 25, refitTurns: 1 }
};

const bomberDef: UnitTypeDefinition = {
  class: "air",
  movement: 5,
  moveType: "air",
  vision: 4,
  ammo: 4,
  fuel: 60,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 1,
  armor: { front: 10, side: 10, top: 10 },
  hardAttack: 16,
  softAttack: 45,
  ap: 8,
  accuracyBase: 55,
  traits: ["indirect", "carpet"],
  cost: 380,
  airSupport: { roles: ["strike"], cruiseSpeedKph: 450, combatRadiusKm: 25, refitTurns: 2 }
};

const infantryDef: UnitTypeDefinition = {
  class: "infantry",
  movement: 1,
  moveType: "leg",
  vision: 2,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 3,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 2,
  softAttack: 8,
  ap: 1,
  accuracyBase: 55,
  traits: [],
  cost: 80
};

const unitTypes: UnitTypeDictionary = {
  Fighter: fighterDef,
  Bomber: bomberDef,
  Infantry_42: infantryDef
} as unknown as UnitTypeDictionary;

function side(): ScenarioSide {
  return { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] };
}

function scenario(rows: number): ScenarioData {
  const tileKey = "plains";
  const row = [{ tile: tileKey }];
  return {
    name: "Interception Radius",
    size: { cols: 1, rows },
    tilePalette: { [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" } },
    tiles: Array.from({ length: rows }, () => row),
    objectives: [],
    turnLimit: 5,
    sides: { Player: side(), Bot: side() }
  } as unknown as ScenarioData;
}

function make(type: keyof typeof unitTypes, hex: Axial): ScenarioUnit {
  return {
    type: type as unknown as ScenarioUnit["type"],
    hex,
    strength: 100,
    experience: 0,
    ammo: unitTypes[type].ammo ?? 6,
    fuel: unitTypes[type].fuel ?? 50,
    entrench: 0,
    facing: "N"
  };
}

registerTest("AIR_INTERCEPTION_CAP_PATROL_RADIUS_INTERCEPTS_NEARBY", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a CAP mission protecting a hex, and a bomber attacking a different hex within the patrol radius", async () => {
    const config: GameEngineConfig = {
      scenario: scenario(30),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);

    engine.beginDeployment();
    const bomber = make("Bomber", { q: 0, r: 9 });
    (bomber as any).unitId = "u_bomber";
    (bomber as any).preDeployed = true;
    engine.initializeFromAllocations([bomber]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    const protectedHex = make("Infantry_42", { q: 0, r: 1 });
    (engine as any).botPlacements.set("0,1", protectedHex);

    const defended = make("Infantry_42", { q: 0, r: 10 });
    (engine as any).botPlacements.set("0,10", defended);

    const cap = make("Fighter", { q: 0, r: 2 });
    (cap as any).unitId = "u_cap";
    (engine as any).botPlacements.set("0,2", cap);

    (engine as any).scheduledAirMissions.set("cap", {
      id: "cap",
      template: {
        kind: "airCover",
        label: "CAP",
        description: "",
        allowedRoles: ["cap"],
        requiresTarget: false,
        requiresFriendlyEscortTarget: false,
        durationTurns: 1
      },
      faction: "Bot",
      unitKey: "u_cap",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 0, r: 1 },
      escortTargetUnitKey: undefined,
      interceptions: 0
    });
  });

  await When("the bomber attacks the nearby hex", async () => {
    engine.attackUnit({ q: 0, r: 9 }, { q: 0, r: 10 });
  });

  await Then("the CAP mission records an interception", async () => {
    const capMission = (engine as any).scheduledAirMissions.get("cap");
    if (!capMission) {
      throw new Error("CAP mission missing after attack");
    }
    if (capMission.interceptions !== 1) {
      throw new Error(`Expected CAP to intercept once, saw ${capMission.interceptions}`);
    }
  });
});

registerTest("AIR_INTERCEPTION_CAP_PATROL_RADIUS_IGNORES_DISTANT", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a CAP mission protecting a hex, and a bomber attacking outside the patrol radius", async () => {
    const config: GameEngineConfig = {
      scenario: scenario(40),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);

    engine.beginDeployment();
    const bomber = make("Bomber", { q: 0, r: 19 });
    (bomber as any).unitId = "u_bomber";
    (bomber as any).preDeployed = true;
    engine.initializeFromAllocations([bomber]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    const defended = make("Infantry_42", { q: 0, r: 20 });
    (engine as any).botPlacements.set("0,20", defended);

    const cap = make("Fighter", { q: 0, r: 2 });
    (cap as any).unitId = "u_cap";
    (engine as any).botPlacements.set("0,2", cap);

    (engine as any).scheduledAirMissions.set("cap", {
      id: "cap",
      template: {
        kind: "airCover",
        label: "CAP",
        description: "",
        allowedRoles: ["cap"],
        requiresTarget: false,
        requiresFriendlyEscortTarget: false,
        durationTurns: 1
      },
      faction: "Bot",
      unitKey: "u_cap",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 0, r: 1 },
      escortTargetUnitKey: undefined,
      interceptions: 0
    });
  });

  await When("the bomber attacks the distant hex", async () => {
    engine.attackUnit({ q: 0, r: 19 }, { q: 0, r: 20 });
  });

  await Then("the CAP mission does not intercept", async () => {
    const capMission = (engine as any).scheduledAirMissions.get("cap");
    if (!capMission) {
      throw new Error("CAP mission missing after attack");
    }
    if (capMission.interceptions !== 0) {
      throw new Error(`Expected CAP to stay idle, saw ${capMission.interceptions}`);
    }
  });
});
