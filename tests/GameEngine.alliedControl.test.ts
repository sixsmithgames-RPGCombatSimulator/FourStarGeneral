/**
 * MODULE: GameEngine Allied Control Regression
 * WHAT: Verifies that live allied formations can join player command as one complete force.
 * WHY: Mission-start control must preserve formation state and include stacked units before initiative is built.
 */

import { registerTest } from "./harness.js";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";
import type {
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  TerrainDefinition,
  TerrainDictionary,
  UnitTypeDefinition,
  UnitTypeDictionary
} from "../src/core/types";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const infantryDefinition: UnitTypeDefinition = {
  class: "infantry",
  combat: { category: "infantry", weight: "light", role: "normal", signature: "small" },
  movement: 2,
  moveType: "leg",
  vision: 2,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 5,
  armor: { front: 0, side: 0, top: 0 },
  hardAttack: 2,
  softAttack: 8,
  ap: 2,
  accuracyBase: 60,
  traits: ["zoc"],
  cost: 90
};

const supplyDefinition: UnitTypeDefinition = {
  class: "vehicle",
  combat: { category: "vehicle", weight: "light", role: "support", signature: "medium" },
  movement: 3,
  moveType: "wheel",
  vision: 2,
  ammo: 0,
  fuel: 60,
  rangeMin: 0,
  rangeMax: 0,
  initiative: 1,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 0,
  softAttack: 0,
  ap: 0,
  accuracyBase: 0,
  traits: [],
  cost: 80
};

const unitTypes = {
  TestInfantry: infantryDefinition,
  Supply_Truck: supplyDefinition
} as unknown as UnitTypeDictionary;

const terrain = { plains } as unknown as TerrainDictionary;

/** Creates one scenario side with deterministic commander defaults. */
function createSide(hq: { q: number; r: number }, units: ScenarioUnit[] = []): ScenarioSide {
  return {
    hq,
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units
  };
}

/** Creates a compact inline scenario suitable for faction-transfer tests. */
function createScenario(playerSide: ScenarioSide, botSide: ScenarioSide, allySide: ScenarioSide): ScenarioData {
  const row = Array.from({ length: 5 }, () => ({ tile: "plains" }));
  return {
    name: "Allied Command Transfer",
    size: { cols: 5, rows: 4 },
    tilePalette: {
      plains: {
        terrain: "plains",
        terrainType: "grass",
        density: "average",
        features: [],
        recon: "intel"
      }
    },
    tiles: [row, row, row, row],
    objectives: [],
    turnLimit: 6,
    sides: { Player: playerSide, Bot: botSide, Ally: allySide }
  } as unknown as ScenarioData;
}

/** Creates a test infantry formation with a stable identity and authored readiness. */
function createInfantry(unitId: string, strength: number): ScenarioUnit {
  return {
    unitId,
    type: "TestInfantry" as unknown as ScenarioUnit["type"],
    hex: { q: 2, r: 1 },
    strength,
    experience: 4,
    ammo: 5,
    fuel: 0,
    entrench: 1,
    facing: "NE",
    controlledBy: "AI"
  };
}

registerTest("GAME_ENGINE_TRANSFERS_ALL_STACKED_ALLIES_TO_PLAYER_CONTROL", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let transferredCount = 0;
  let alliedStatusBefore: string | undefined;

  await Given("two allied combat formations share a hex and an allied convoy supports them", async () => {
    const playerSide = createSide({ q: 0, r: 0 });
    const botSide = createSide({ q: 4, r: 3 });
    const allySide = createSide({ q: 2, r: 1 }, [
      createInfantry("ally-lead", 73),
      createInfantry("ally-wing", 91),
      {
        unitId: "ally-supply",
        type: "Supply_Truck",
        hex: { q: 1, r: 1 },
        strength: 86,
        experience: 0,
        ammo: 0,
        fuel: 42,
        entrench: 0,
        facing: "NE",
        controlledBy: "AI"
      }
    ]);
    const config: GameEngineConfig = {
      scenario: createScenario(playerSide, botSide, allySide),
      unitTypes,
      terrain,
      playerSide,
      botSide,
      allySide,
      botStrategyMode: "Simple"
    };

    engine = new GameEngine(config);
    engine.beginDeployment();
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    alliedStatusBefore = JSON.stringify(engine.allyUnits.find((unit) => unit.unitId === "ally-lead")?.status);
  });

  await When("all live allied formations transfer before the opening player turn", async () => {
    transferredCount = engine.transferAllAlliedUnitsToPlayerControl();
    engine.startPlayerTurnPhase();
  });

  await Then("every formation joins the player roster with identity and damage state intact", async () => {
    if (transferredCount !== 3 || engine.allyUnits.length !== 0 || engine.playerUnits.length !== 3) {
      throw new Error(
        `Expected three complete transfers, received count=${transferredCount}, allies=${engine.allyUnits.length}, players=${engine.playerUnits.length}.`
      );
    }

    const lead = engine.playerUnits.find((unit) => unit.unitId === "ally-lead");
    const wing = engine.playerUnits.find((unit) => unit.unitId === "ally-wing");
    const convoy = engine.playerUnits.find((unit) => unit.unitId === "ally-supply");
    if (!lead || !wing || !convoy) {
      throw new Error("Expected every allied unit id to remain present after transfer.");
    }
    if (lead.controlledBy !== "Player" || wing.controlledBy !== "Player" || convoy.controlledBy !== "Player") {
      throw new Error("Expected transferred allied formations to be explicitly player-controlled.");
    }
    if (lead.strength !== 73 || lead.ammo !== 5 || lead.entrench !== 1 || JSON.stringify(lead.status) !== alliedStatusBefore) {
      throw new Error("Expected the damaged lead formation's readiness, supply, and entrenchment state to be preserved.");
    }

    const stack = engine.getHexStackMembers({ q: 2, r: 1 }, "Player");
    if (stack.length !== 2 || stack.some((member) => member.isAutomated)) {
      throw new Error(`Expected both stacked combat formations to be directly controllable, received ${JSON.stringify(stack)}.`);
    }
    if (engine.transferAllAlliedUnitsToPlayerControl() !== 0) {
      throw new Error("Expected repeated mission-start transfer to be idempotent.");
    }
  });
});
