import { registerTest } from "./harness.js";
import type { ScenarioUnit, ScenarioSide, ScenarioData, TerrainDefinition, TerrainDictionary, UnitTypeDictionary, UnitTypeDefinition, Axial } from "../src/core/types";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";
import type { AttackResolution } from "../src/game/GameEngine";

// Inline terrain and unit definitions to avoid JSON loader requirements
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
  airSupport: {
    roles: ["strike"],
    cruiseSpeedKph: 450,
    combatRadiusKm: 200,
    refitTurns: 2
  }
};

const flakDef: UnitTypeDefinition = {
  class: "specialist",
  movement: 1,
  moveType: "wheel",
  vision: 3,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 2,
  initiative: 5,
  armor: { front: 4, side: 3, top: 3 },
  hardAttack: 40,
  softAttack: 10,
  ap: 12,
  accuracyBase: 55,
  traits: ["intercept"],
  cost: 210
};

const unitTypes: UnitTypeDictionary = {
  Fighter: fighterDef,
  Bomber: bomberDef,
  Flak_88: flakDef
} as unknown as UnitTypeDictionary;

function baseSide(): ScenarioSide {
  return { hq: { q: 0, r: 0 }, general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }, units: [] };
}

function buildScenario(): ScenarioData {
  const tileKey = "plains";
  const row = [{ tile: tileKey }, { tile: tileKey }, { tile: tileKey }];
  return {
    name: "Interception Parity",
    size: { cols: 3, rows: 3 },
    tilePalette: { [tileKey]: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" } },
    tiles: [row, row, row],
    objectives: [],
    turnLimit: 5,
    sides: { Player: baseSide(), Bot: baseSide() }
  } as unknown as ScenarioData;
}

function makeUnit(type: keyof typeof unitTypes, hex: Axial): ScenarioUnit {
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

registerTest("INTERCEPTION_CAP_STOPS_BOMBER_BOTH_SIDES", async ({ Given, When, Then }) => {
  let playerEngine: GameEngine;
  let botEngine: GameEngine;
  let playerAttack: AttackResolution | null = null;
  // resolveBotAttack is private, so capture the outcome as unknown and treat it via runtime assertions.
  let botAttack: unknown = null;
  let botBomber: ScenarioUnit | null = null;

  await Given("mirrored battles where a bomber attacks an AA-protected hex", async () => {
    const config: GameEngineConfig = {
      scenario: buildScenario(),
      unitTypes,
      terrain,
      playerSide: baseSide(),
      botSide: baseSide()
    };

    playerEngine = new GameEngine(config);
    botEngine = new GameEngine(config);

    const playerBomber = makeUnit("Bomber", { q: 0, r: 0 });
    const playerAA = makeUnit("Flak_88", { q: 0, r: 1 });
    (playerBomber as any).preDeployed = true;

    // Initialize the player's side with the bomber unit
    playerEngine.beginDeployment();
    playerEngine.initializeFromAllocations([playerBomber]);
    playerEngine.setBaseCamp({ q: 0, r: 0 });
    playerEngine.finalizeDeployment();
    playerEngine.startPlayerTurnPhase();

    // Directly seed the opposing faction's placements to keep the scenario minimal while exercising interception logic.
    // We touch private fields via casts because the engine does not expose dedicated test helpers.
    (playerEngine as any).botPlacements.set("0,1", playerAA);

    // Ensure the CAP fighter has a stable squadron id so mission.unitKey matches engine expectations.
    // Place the CAP fighter on a different hex from the AA unit; CAP coverage is determined by mission.targetHex.
    const botCapFighter = makeUnit("Fighter", { q: 0, r: 2 });
    (botCapFighter as any).unitId = "u_bot_cap";
    (playerEngine as any).botPlacements.set("0,2", botCapFighter);

    // Schedule bot CAP mission over the AA hex so the bomber should be intercepted before the strike resolves.
    // This is done by accessing the private 'scheduledAirMissions' field, which is necessary to set up the CAP mission.
    (playerEngine as any).scheduledAirMissions.set("cap", {
      id: "cap",
      template: {
        kind: "airCover",
        label: "CAP",
        description: "",
        allowedRoles: ["cap"],
        requiresTarget: true,
        requiresFriendlyEscortTarget: false,
        durationTurns: 1
      },
      faction: "Bot",
      unitKey: "u_bot_cap",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 0, r: 1 },
      escortTargetUnitKey: undefined,
      interceptions: 0
    });

    // Mirror for bot scenario (player CAP protecting AA vs bot bomber attack)
    botEngine.beginDeployment();
    botEngine.initializeFromAllocations([]);
    botEngine.setBaseCamp({ q: 0, r: 1 });
    botEngine.finalizeDeployment();

    (botEngine as any).playerPlacements.set("0,0", playerAA);
    botBomber = makeUnit("Bomber", { q: 0, r: 1 });
    (botEngine as any).botPlacements.set("0,1", botBomber);
    const playerCapFighter = makeUnit("Fighter", { q: 0, r: 2 });
    (playerCapFighter as any).unitId = "u_player_cap";
    (botEngine as any).playerPlacements.set("0,2", playerCapFighter);
    botEngine.startPlayerTurnPhase();

    // Player CAP mission mirrors the bot setup so both factions experience identical interception rules.
    (botEngine as any).scheduledAirMissions.set("cap", {
      id: "cap",
      template: {
        kind: "airCover",
        label: "CAP",
        description: "",
        allowedRoles: ["cap"],
        requiresTarget: true,
        requiresFriendlyEscortTarget: false,
        durationTurns: 1
      },
      faction: "Player",
      unitKey: "u_player_cap",
      unitType: "Fighter",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 0, r: 0 },
      escortTargetUnitKey: undefined,
      interceptions: 0
    });
  });

  await When("each bomber attempts to attack the protected hex", async () => {
    playerAttack = playerEngine.attackUnit({ q: 0, r: 0 }, { q: 0, r: 1 });
    botAttack = (botEngine as any).resolveBotAttack(botBomber!, { q: 0, r: 1 }, { q: 0, r: 0 });
  });

  await Then("both bombers are intercepted by CAP before the strike resolves", async () => {
    const botCapMission = (playerEngine as any).scheduledAirMissions.get("cap");
    const playerCapMission = (botEngine as any).scheduledAirMissions.get("cap");
    if (!botCapMission || botCapMission.interceptions !== 1) {
      throw new Error(`Expected bot CAP mission to record one interception, saw ${botCapMission?.interceptions ?? "missing"}`);
    }
    if (!playerCapMission || playerCapMission.interceptions !== 1) {
      throw new Error(`Expected player CAP mission to record one interception, saw ${playerCapMission?.interceptions ?? "missing"}`);
    }

    const playerAborted = playerAttack === null;
    const botAborted = botAttack === null;
    if (playerAborted !== botAborted) {
      throw new Error(`Expected interception parity (both attacks abort or neither). Got playerAborted=${playerAborted}, botAborted=${botAborted}`);
    }
  });
});
