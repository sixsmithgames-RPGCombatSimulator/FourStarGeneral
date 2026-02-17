import { registerTest } from "./harness.js";
import type { Axial } from "../src/core/Hex";
import type { ScenarioUnit, UnitTypeDefinition, UnitTypeDictionary, TerrainDefinition, TerrainDictionary, ScenarioSide, ScenarioData } from "../src/core/types";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";

// Minimal inline data to avoid JSON imports while keeping the test deterministic.
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
  airSupport: {
    roles: ["escort", "cap", "strike"],
    cruiseSpeedKph: 540,
    combatRadiusKm: 250,
    refitTurns: 1
  }
};

const unitTypes: UnitTypeDictionary = {
  Fighter: fighterDef
} as unknown as UnitTypeDictionary;

function emptySide(): ScenarioSide {
  return { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] };
}

function makeScenario(): ScenarioData {
  const tileKey = "plains";
  const row = [{ tile: tileKey }, { tile: tileKey }, { tile: tileKey }];
  return {
    name: "Air Arrivals",
    size: { cols: 3, rows: 3 },
    tilePalette: { [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" } },
    tiles: [row, row, row],
    objectives: [],
    turnLimit: 5,
    sides: { Player: emptySide(), Bot: emptySide() }
  } as unknown as ScenarioData;
}

registerTest("AIR_MISSION_ARRIVALS_QUEUE_TURN_START", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let missionId: string = "";
  const fighter: ScenarioUnit = {
    type: "Fighter" as unknown as ScenarioUnit["type"],
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 50,
    entrench: 0,
    facing: "N"
  };

  await Given("a player fighter deployed and an air cover mission scheduled", async () => {
    const config: GameEngineConfig = {
      scenario: makeScenario(),
      unitTypes,
      terrain,
      playerSide: emptySide(),
      botSide: emptySide()
    };
    engine = new GameEngine(config);
    engine.beginDeployment();
    // Seed reserves with our fighter via the allocation helper so deployment mirrors real flows.
    engine.initializeFromAllocations([fighter]);
    // Assign base camp so we can exit deployment and unlock turn-based actions.
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    // Schedule an Air Cover mission for the fighter over its own hex so it should go in-flight at turn start.
    missionId = engine.scheduleAirMission({ kind: "airCover", faction: "Player", unitHex: { q: 0, r: 0 }, targetHex: { q: 0, r: 0 } as Axial });
  });

  let arrivalsBefore: ReturnType<GameEngine["consumeAirMissionArrivals"]> = [];
  let arrivalsAfter: ReturnType<GameEngine["consumeAirMissionArrivals"]> = [];

  await When("ending the player turn to advance mission lifecycles", async () => {
    // Before endTurn, arrivals should be empty
    arrivalsBefore = engine.consumeAirMissionArrivals();
    engine.endTurn();
    // After processing, arrivals should contain our mission transitioning to inFlight so UI can animate it.
    arrivalsAfter = engine.consumeAirMissionArrivals();
  });

  await Then("the arrivals queue contains the scheduled mission marked inFlight", async () => {
    if (arrivalsBefore.length !== 0) {
      throw new Error(`Expected no arrivals before processing, saw ${arrivalsBefore.length}`);
    }
    if (arrivalsAfter.length !== 1) {
      throw new Error(`Expected one arrival after endTurn, saw ${arrivalsAfter.length}`);
    }
    const arrival = arrivalsAfter[0];
    if (!arrival || arrival.missionId !== missionId || arrival.faction !== "Player" || arrival.kind !== "airCover") {
      throw new Error(`Unexpected arrival payload: ${JSON.stringify(arrival)}`);
    }
    if (typeof arrival.unitKey !== "string" || !arrival.unitKey.startsWith("u_")) {
      throw new Error(`Expected arrival unitKey to be a stable squadron id (u_*), saw ${JSON.stringify(arrival.unitKey)}`);
    }
    if (arrival.originHexKey !== "0,0") {
      throw new Error(`Expected originHexKey to be the base hex (0,0), saw ${JSON.stringify(arrival.originHexKey)}`);
    }
  });
});
