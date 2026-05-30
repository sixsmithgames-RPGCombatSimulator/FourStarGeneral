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

const bomberDef: UnitTypeDefinition = {
  class: "air",
  combat: { category: "air", weight: "light", role: "normal", signature: "large" },
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
  airSupport: {
    roles: ["strike"],
    cruiseSpeedKph: 450,
    combatRadiusKm: 200,
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
  Bomber: bomberDef,
  Infantry_42: infantryDef
} as unknown as UnitTypeDictionary;

function side(overrides?: Partial<ScenarioSide>): ScenarioSide {
  return {
    hq: { q: 0, r: 0 },
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units: [],
    ...overrides
  };
}

function buildScenario(cols = 12, rows = 3): ScenarioData {
  const tileKey = "plains";
  const row = Array.from({ length: cols }, () => ({ tile: tileKey }));
  const tiles = Array.from({ length: rows }, () => row);
  return {
    name: "Air Mission Planning",
    size: { cols, rows },
    tilePalette: { [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" } },
    tiles,
    objectives: [],
    turnLimit: 5,
    sides: { Player: side(), Bot: side() }
  } as unknown as ScenarioData;
}

function makeUnit(type: keyof typeof unitTypes, hex: Axial, unitId: string): ScenarioUnit {
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
  };
}

registerTest("PLAYER_AIR_PLANNING_REMAINS_AVAILABLE_DURING_PLAYER_PHASE_INTERLEAVE", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let scheduleResult: ReturnType<GameEngine["tryScheduleAirMission"]> | null = null;
  const playerOrigin: Axial = { q: 0, r: 0 };
  const botTarget: Axial = { q: 1, r: 0 };

  await Given("a player phase where initiative flow temporarily points activeFaction to Bot", async () => {
    const config: GameEngineConfig = {
      scenario: buildScenario(),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);

    engine.beginDeployment();
    engine.initializeFromAllocations([]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    (engine as any).addUnitToFactionHex("Player", makeUnit("Bomber", playerOrigin, "player-bomber"));
    (engine as any).addUnitToFactionHex("Bot", makeUnit("Infantry_42", botTarget, "bot-target"));
    (engine as any)._activeFaction = "Bot";
  });

  await When("the player submits a strike order in the same player phase", async () => {
    scheduleResult = engine.tryScheduleAirMission({
      kind: "strike",
      faction: "Player",
      unitHex: playerOrigin,
      targetHex: botTarget,
      unitId: "player-bomber"
    });
  });

  await Then("the mission should schedule instead of failing wrong-faction validation", async () => {
    if (!scheduleResult?.ok) {
      throw new Error(`Expected player mission scheduling to remain available, received ${JSON.stringify(scheduleResult)}.`);
    }
  });
});

registerTest("STRIKE_MISSIONS_KEEP_TARGET_LOCK_AND_UPDATE_HEX_AFTER_LONG_REPOSITION", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let missionId: string | null = null;
  const bomberOrigin: Axial = { q: 0, r: 0 };
  const initialTarget: Axial = { q: 1, r: 0 };
  const relocatedTarget: Axial = { q: 9, r: 0 };

  await Given("a queued strike whose tagged defender relocates farther than six hexes", async () => {
    const config: GameEngineConfig = {
      scenario: buildScenario(),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);

    engine.beginDeployment();
    engine.initializeFromAllocations([]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    (engine as any).addUnitToFactionHex("Bot", makeUnit("Bomber", bomberOrigin, "bot-bomber"));
    (engine as any).addUnitToFactionHex("Player", makeUnit("Infantry_42", initialTarget, "moving-target"));
    (engine as any)._phase = "botTurn";
    (engine as any)._activeFaction = "Bot";
  });

  await When("the mission launches after the target unit has moved to a new hex", async () => {
    const scheduled = engine.tryScheduleAirMission({
      kind: "strike",
      faction: "Bot",
      unitHex: bomberOrigin,
      targetHex: initialTarget,
      unitId: "bot-bomber"
    });
    if (!scheduled.ok) {
      throw new Error(`Expected strike schedule to succeed, received ${JSON.stringify(scheduled)}.`);
    }
    missionId = scheduled.missionId;

    const movedTarget = makeUnit("Infantry_42", relocatedTarget, "moving-target");
    (engine as any).playerPlacements.delete(`${initialTarget.q},${initialTarget.r}`);
    (engine as any).playerPlacements.set(`${relocatedTarget.q},${relocatedTarget.r}`, movedTarget);

    (engine as any).stepAirMissionsForFaction("Bot");
  });

  await Then("the in-flight mission should keep the target lock and retarget to the moved hex", async () => {
    if (!missionId) {
      throw new Error("Expected mission id to be captured.");
    }
    const mission = (engine as any).scheduledAirMissions.get(missionId) as { targetHex?: Axial } | undefined;
    if (!mission?.targetHex) {
      throw new Error("Expected mission target hex to be present.");
    }
    if (mission.targetHex.q !== relocatedTarget.q || mission.targetHex.r !== relocatedTarget.r) {
      throw new Error(`Expected retargeted strike hex ${relocatedTarget.q},${relocatedTarget.r}, saw ${mission.targetHex.q},${mission.targetHex.r}.`);
    }
  });
});
