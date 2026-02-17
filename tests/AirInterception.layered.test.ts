import { registerTest } from "./harness.js";
import type { ScenarioUnit, ScenarioSide, ScenarioData, TerrainDefinition, TerrainDictionary, UnitTypeDictionary, UnitTypeDefinition, Axial } from "../src/core/types";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";

// Inline terrain and unit definitions to keep the test deterministic and self-contained
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
  airSupport: { roles: ["escort", "cap", "strike"], cruiseSpeedKph: 540, combatRadiusKm: 250, refitTurns: 1 }
};

const bomberDef: UnitTypeDefinition = {
  class: "air",
  movement: 1,
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
  airSupport: { roles: ["strike"], cruiseSpeedKph: 450, combatRadiusKm: 200, refitTurns: 2 }
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

function scenario(): ScenarioData {
  const tileKey = "plains";
  const row = [{ tile: tileKey }, { tile: tileKey }, { tile: tileKey }];
  return {
    name: "Layered Interception",
    size: { cols: 3, rows: 3 },
    tilePalette: { [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" } },
    tiles: [row, row, row],
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

registerTest("AIR_INTERCEPTION_LAYERED_ESCORTS_ABSORB_CAP", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a bomber with two escorts attacking a hex covered by two CAP flights", async () => {
    const config: GameEngineConfig = {
      scenario: scenario(),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);

    // Deploy player bomber at 0,0 and ground defender at 0,1
    engine.beginDeployment();
    const bomber = make("Bomber", { q: 0, r: 0 });
    (bomber as any).unitId = "u_bomber";
    (bomber as any).preDeployed = true;
    engine.initializeFromAllocations([bomber]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    // Seed bot defender and two CAP fighters
    const botDef = make("Infantry_42", { q: 0, r: 1 });
    (engine as any).botPlacements.set("0,1", botDef);
    const cap1 = make("Fighter", { q: 0, r: 2 });
    (cap1 as any).unitId = "u_cap1";
    const cap2 = make("Fighter", { q: 1, r: 2 });
    (cap2 as any).unitId = "u_cap2";
    (engine as any).botPlacements.set("0,2", cap1);
    (engine as any).botPlacements.set("1,2", cap2);

    // Seed two player escorts for the bomber
    const esc1 = make("Fighter", { q: 0, r: -1 });
    (esc1 as any).unitId = "u_esc1";
    const esc2 = make("Fighter", { q: 1, r: -1 });
    (esc2 as any).unitId = "u_esc2";
    (engine as any).playerPlacements.set("0,-1", esc1);
    (engine as any).playerPlacements.set("1,-1", esc2);

    // Register in-flight missions: two CAP over 0,1; two escorts tied to 0,0 bomber
    (engine as any).scheduledAirMissions.set("cap1", {
      id: "cap1",
      template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: true, requiresFriendlyEscortTarget: false, durationTurns: 1 },
      faction: "Bot",
      unitKey: "u_cap1",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 0, r: 1 },
      escortTargetUnitKey: undefined,
      interceptions: 0
    });
    (engine as any).scheduledAirMissions.set("cap2", {
      id: "cap2",
      template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: true, requiresFriendlyEscortTarget: false, durationTurns: 1 },
      faction: "Bot",
      unitKey: "u_cap2",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 0, r: 1 },
      escortTargetUnitKey: undefined,
      interceptions: 0
    });
    (engine as any).scheduledAirMissions.set("esc1", {
      id: "esc1",
      template: { kind: "escort", label: "Escort", description: "", allowedRoles: ["escort"], requiresTarget: false, requiresFriendlyEscortTarget: true, durationTurns: 1 },
      faction: "Player",
      unitKey: "u_esc1",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: undefined,
      escortTargetUnitKey: "u_bomber",
      interceptions: 0
    });
    (engine as any).scheduledAirMissions.set("esc2", {
      id: "esc2",
      template: { kind: "escort", label: "Escort", description: "", allowedRoles: ["escort"], requiresTarget: false, requiresFriendlyEscortTarget: true, durationTurns: 1 },
      faction: "Player",
      unitKey: "u_esc2",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: undefined,
      escortTargetUnitKey: "u_bomber",
      interceptions: 0
    });
  });

  let _result: unknown = null;
  let engagements: ReturnType<GameEngine["consumeAirEngagements"]> = [];

  await When("the bomber attacks the defended hex triggering layered interceptions", async () => {
    _result = engine.attackUnit({ q: 0, r: 0 }, { q: 0, r: 1 });
    engagements = engine.consumeAirEngagements();
  });

  await Then("both escorts and both CAP flights participate, and each mission records exactly one interception", async () => {
    // Validate event emission with both sides represented
    if (engagements.length !== 1) {
      throw new Error(`Expected one air engagement event, saw ${engagements.length}`);
    }
    const evt = engagements[0]!;
    if (evt.interceptors.length !== 2 || evt.escorts.length !== 2) {
      throw new Error(`Expected 2 interceptors and 2 escorts, saw ${evt.interceptors.length} and ${evt.escorts.length}`);
    }

    const cap1 = (engine as any).scheduledAirMissions.get("cap1");
    const cap2 = (engine as any).scheduledAirMissions.get("cap2");
    const esc1 = (engine as any).scheduledAirMissions.get("esc1");
    const esc2 = (engine as any).scheduledAirMissions.get("esc2");

    if (!cap1 || !cap2 || !esc1 || !esc2) {
      throw new Error("Scheduled missions missing after interception resolution");
    }

    if (cap1.interceptions !== 1 || cap2.interceptions !== 1) {
      throw new Error(`CAP missions should each record one interception, got cap1=${cap1.interceptions}, cap2=${cap2.interceptions}`);
    }
    if (esc1.interceptions !== 1 || esc2.interceptions !== 1) {
      throw new Error(`Escort missions should each record one engagement, got esc1=${esc1.interceptions}, esc2=${esc2.interceptions}`);
    }
  });
});
