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

const terrain: TerrainDictionary = { plains } as unknown as TerrainDictionary;

const fighterDef: UnitTypeDefinition = {
  class: "air",
  combat: { category: "air", weight: "light", role: "normal", signature: "large" },
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
  airSupport: {
    roles: ["escort", "cap"],
    cruiseSpeedKph: 540,
    combatRadiusKm: 250,
    refitTurns: 1
  }
};

const bomberDef: UnitTypeDefinition = {
  class: "air",
  combat: { category: "air", weight: "light", role: "normal", signature: "large" },
  movement: 4,
  moveType: "air",
  vision: 4,
  ammo: 4,
  fuel: 60,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 1,
  armor: { front: 8, side: 8, top: 8 },
  hardAttack: 16,
  softAttack: 45,
  ap: 8,
  accuracyBase: 55,
  traits: ["indirect", "carpet"],
  cost: 380,
  airSupport: {
    roles: ["strike"],
    cruiseSpeedKph: 450,
    combatRadiusKm: 250,
    refitTurns: 2
  }
};

const infantryDef: UnitTypeDefinition = {
  class: "infantry",
  combat: { category: "infantry", weight: "light", role: "normal", signature: "small" },
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
  const row = Array.from({ length: 6 }, () => ({ tile: tileKey }));
  return {
    name: "Global Air Phase",
    size: { cols: 6, rows: 6 },
    tilePalette: {
      [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" }
    },
    tiles: Array.from({ length: 6 }, () => row),
    objectives: [],
    turnLimit: 5,
    sides: { Player: side(), Bot: side() }
  } as unknown as ScenarioData;
}

function make(type: keyof typeof unitTypes, hex: Axial, unitId: string): ScenarioUnit {
  return {
    type: type as unknown as ScenarioUnit["type"],
    hex,
    strength: 100,
    experience: 0,
    ammo: unitTypes[type].ammo ?? 6,
    fuel: unitTypes[type].fuel ?? 50,
    entrench: 0,
    facing: "NW",
    unitId
  } as ScenarioUnit;
}

registerTest("AIR_GLOBAL_PHASE_RESOLVES_CAP_CLASH_BEFORE_STRIKE_PACKAGES", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let engagements: ReturnType<GameEngine["consumeAirEngagements"]> = [];

  await Given("two player CAP sorties, one bot CAP sortie, and a ready bot strike package", async () => {
    const config: GameEngineConfig = {
      scenario: scenario(),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);

    engine.beginDeployment();
    engine.initializeFromAllocations([
      make("Fighter", { q: 0, r: 0 }, "u_pcap1"),
      make("Fighter", { q: 1, r: 0 }, "u_pcap2"),
      make("Infantry_42", { q: 2, r: 2 }, "u_target")
    ]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    (engine as any).botPlacements.set("0,4", make("Bomber", { q: 0, r: 4 }, "u_bomber"));
    (engine as any).botPlacements.set("1,4", make("Fighter", { q: 1, r: 4 }, "u_bcap"));

    const missions = (engine as any).scheduledAirMissions;
    missions.set("player-cap-1", {
      id: "player-cap-1",
      template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: false, requiresFriendlyEscortTarget: false, durationTurns: 1 },
      faction: "Player",
      unitKey: "u_pcap1",
      originHexKey: "0,0",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 2, r: 2 },
      interceptions: 0,
      airCombatDamageInflicted: 0,
      airCombatDamageTaken: 0,
      airCombatKills: 0
    });
    missions.set("player-cap-2", {
      id: "player-cap-2",
      template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: false, requiresFriendlyEscortTarget: false, durationTurns: 1 },
      faction: "Player",
      unitKey: "u_pcap2",
      originHexKey: "1,0",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 2, r: 2 },
      interceptions: 0,
      airCombatDamageInflicted: 0,
      airCombatDamageTaken: 0,
      airCombatKills: 0
    });
    missions.set("bot-cap", {
      id: "bot-cap",
      template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: false, requiresFriendlyEscortTarget: false, durationTurns: 1 },
      faction: "Bot",
      unitKey: "u_bcap",
      originHexKey: "1,4",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 2, r: 2 },
      interceptions: 0,
      airCombatDamageInflicted: 0,
      airCombatDamageTaken: 0,
      airCombatKills: 0
    });
    missions.set("bot-strike", {
      id: "bot-strike",
      template: { kind: "strike", label: "Strike", description: "", allowedRoles: ["strike"], requiresTarget: true, requiresFriendlyEscortTarget: false, durationTurns: 0 },
      faction: "Bot",
      unitKey: "u_bomber",
      originHexKey: "0,4",
      unitType: "Bomber",
      status: "resolving",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 2, r: 2 },
      targetUnitKey: "u_target",
      interceptions: 0,
      airCombatDamageInflicted: 0,
      airCombatDamageTaken: 0,
      airCombatKills: 0
    });
  });

  await When("the round-level air phase is resolved", async () => {
    (engine as any).resolveReadyAirMissionsForRound();
    engagements = engine.consumeAirEngagements();
  });

  await Then("the CAP clash is recorded before the strike-package interception event", async () => {
    const capClashIndex = engagements.findIndex((event) => event.type === "capClash");
    const strikeInterceptIndex = engagements.findIndex((event) => event.type === "airToAir" && event.missionId === "bot-strike");
    if (capClashIndex === -1) {
      throw new Error(`Expected a capClash event, saw ${engagements.map((event) => event.type).join(", ")}`);
    }
    if (strikeInterceptIndex === -1) {
      throw new Error(`Expected an airToAir event for bot-strike, saw ${engagements.map((event) => `${event.type}:${event.missionId ?? "none"}`).join(", ")}`);
    }
    if (capClashIndex >= strikeInterceptIndex) {
      throw new Error(`Expected capClash to resolve before bot-strike interception, saw order ${engagements.map((event) => event.type).join(" -> ")}`);
    }
  });
});

registerTest("AIR_GLOBAL_PHASE_INCLUDES_RESOLVING_ESCORTS_IN_STRIKE_PACKAGE_INTERCEPTIONS", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let engagements: ReturnType<GameEngine["consumeAirEngagements"]> = [];
  let escortReport: ReturnType<GameEngine["getAirMissionReports"]>[number] | undefined;

  await Given("a resolving escort linked to a resolving strike package opposed by player CAP", async () => {
    const config: GameEngineConfig = {
      scenario: scenario(),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);

    engine.beginDeployment();
    engine.initializeFromAllocations([
      make("Fighter", { q: 0, r: 0 }, "u_pcap"),
      make("Infantry_42", { q: 2, r: 2 }, "u_target")
    ]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    (engine as any).botPlacements.set("0,4", make("Bomber", { q: 0, r: 4 }, "u_bomber"));
    (engine as any).botPlacements.set("1,4", make("Fighter", { q: 1, r: 4 }, "u_escort"));

    const missions = (engine as any).scheduledAirMissions;
    missions.set("player-cap", {
      id: "player-cap",
      template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: false, requiresFriendlyEscortTarget: false, durationTurns: 1 },
      faction: "Player",
      unitKey: "u_pcap",
      originHexKey: "0,0",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 2, r: 2 },
      interceptions: 0,
      airCombatDamageInflicted: 0,
      airCombatDamageTaken: 0,
      airCombatKills: 0
    });
    missions.set("bot-strike", {
      id: "bot-strike",
      template: { kind: "strike", label: "Strike", description: "", allowedRoles: ["strike"], requiresTarget: true, requiresFriendlyEscortTarget: false, durationTurns: 0 },
      faction: "Bot",
      unitKey: "u_bomber",
      originHexKey: "0,4",
      unitType: "Bomber",
      status: "resolving",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 2, r: 2 },
      targetUnitKey: "u_target",
      interceptions: 0,
      airCombatDamageInflicted: 0,
      airCombatDamageTaken: 0,
      airCombatKills: 0
    });
    missions.set("bot-escort", {
      id: "bot-escort",
      template: { kind: "escort", label: "Escort", description: "", allowedRoles: ["escort"], requiresTarget: false, requiresFriendlyEscortTarget: true, durationTurns: 1 },
      faction: "Bot",
      unitKey: "u_escort",
      originHexKey: "1,4",
      unitType: "Fighter",
      status: "resolving",
      launchTurn: 1,
      turnsRemaining: 0,
      escortTargetUnitKey: "u_bomber",
      interceptions: 0,
      airCombatDamageInflicted: 0,
      airCombatDamageTaken: 0,
      airCombatKills: 0
    });
  });

  await When("the round-level air phase and mission resolution run", async () => {
    (engine as any).resolveReadyAirMissionsForRound();
    engagements = engine.consumeAirEngagements();
    escortReport = engine.getAirMissionReports().find((entry) => entry.missionId === "bot-escort");
  });

  await Then("the escort should be part of the package interception and should not resolve as aborted", async () => {
    const strikeEvent = engagements.find((event) => event.type === "airToAir" && event.missionId === "bot-strike");
    if (!strikeEvent) {
      throw new Error(`Expected an airToAir event for bot-strike, saw ${engagements.map((event) => `${event.type}:${event.missionId ?? "none"}`).join(", ")}`);
    }
    if ((strikeEvent.escorts?.length ?? 0) !== 1) {
      throw new Error(`Expected the resolving escort to be included in the strike package, saw ${strikeEvent.escorts?.length ?? 0} escorts.`);
    }
    if (!escortReport) {
      throw new Error("Expected a resolved escort air mission report.");
    }
    if (escortReport.outcome?.result === "aborted") {
      throw new Error(`Expected escort report to resolve from package state, saw ${escortReport.outcome?.result}.`);
    }
  });
});
