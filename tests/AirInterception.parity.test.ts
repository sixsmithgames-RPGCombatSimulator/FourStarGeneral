import { registerTest } from "./harness.js";
import type { ScenarioUnit, ScenarioSide, ScenarioData, TerrainDefinition, TerrainDictionary, UnitTypeDictionary, UnitTypeDefinition, Axial } from "../src/core/types";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";
import type { AirEngagementEvent, AttackResolution } from "../src/game/GameEngine";

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
    roles: ["escort", "cap", "strike"],
    cruiseSpeedKph: 540,
    combatRadiusKm: 250,
    refitTurns: 1
  }
};

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

const flakDef: UnitTypeDefinition = {
  class: "specialist",
  combat: { category: "specialist", weight: "light", role: "antiInfantry", signature: "small" },
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
    facing: "NW"
  };
}

registerTest("INTERCEPTION_CAP_STOPS_BOMBER_BOTH_SIDES", async ({ Given, When, Then }) => {
  let playerEngine: GameEngine;
  let botEngine: GameEngine;
  let playerAttack: AttackResolution | null = null;
  // resolveBotAttack is private, so capture the outcome as unknown and treat it via runtime assertions.
  let botAttack: unknown = null;
  let botBomber: ScenarioUnit | null = null;
  let playerEngagements: AirEngagementEvent[] = [];
  let botEngagements: AirEngagementEvent[] = [];

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
    const playerSpotter = makeUnit("Flak_88", { q: 1, r: 1 });
    const playerAA = makeUnit("Flak_88", { q: 0, r: 1 });
    (playerBomber as any).preDeployed = true;
    (playerSpotter as any).preDeployed = true;

    // Initialize the player's side with the bomber and a ground spotter so the seeded AA contact is attackable.
    playerEngine.beginDeployment();
    playerEngine.initializeFromAllocations([playerBomber, playerSpotter]);
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
    playerEngagements = playerEngine.consumeAirEngagements();
    botEngagements = botEngine.consumeAirEngagements();
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

    const playerAirIntercept = playerEngagements.find((event) => event.type === "airToAir");
    const botAirIntercept = botEngagements.find((event) => event.type === "airToAir");
    if (!playerAirIntercept || typeof playerAirIntercept.bomberStrengthBefore !== "number" || typeof playerAirIntercept.bomberStrengthAfter !== "number") {
      throw new Error(`Expected player interception event to include bomber before/after strength, saw ${JSON.stringify(playerAirIntercept)}.`);
    }
    if (!botAirIntercept || typeof botAirIntercept.bomberStrengthBefore !== "number" || typeof botAirIntercept.bomberStrengthAfter !== "number") {
      throw new Error(`Expected bot interception event to include bomber before/after strength, saw ${JSON.stringify(botAirIntercept)}.`);
    }
    if (playerAirIntercept.bomberStrengthAfter > playerAirIntercept.bomberStrengthBefore) {
      throw new Error(`Expected player interception attrition to never increase bomber strength, saw before=${playerAirIntercept.bomberStrengthBefore}, after=${playerAirIntercept.bomberStrengthAfter}.`);
    }
    if (botAirIntercept.bomberStrengthAfter > botAirIntercept.bomberStrengthBefore) {
      throw new Error(`Expected bot interception attrition to never increase bomber strength, saw before=${botAirIntercept.bomberStrengthBefore}, after=${botAirIntercept.bomberStrengthAfter}.`);
    }
  });
});

registerTest("BOT_FLAK_TARGET_RICH_DAMAGE_HITS_EVERY_STACKED_AIR_DEFENDER_BUT_SPENDS_ONE_AMMO", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let attack: { inflictedDamage?: number } | null = null;
  const originHex: Axial = { q: 0, r: 0 };
  const targetHex: Axial = { q: 1, r: 0 };

  await Given("a bot flak battery firing on two stacked player fighters", async () => {
    const config: GameEngineConfig = {
      scenario: buildScenario(),
      unitTypes,
      terrain,
      playerSide: baseSide(),
      botSide: baseSide()
    };

    engine = new GameEngine(config);
    engine.beginDeployment();
    engine.initializeFromAllocations([]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    const fighterAlpha = { ...makeUnit("Fighter", targetHex), unitId: "player-fighter-alpha" } as ScenarioUnit;
    const fighterBravo = { ...makeUnit("Fighter", targetHex), unitId: "player-fighter-bravo" } as ScenarioUnit;
    const flak = { ...makeUnit("Flak_88", originHex), unitId: "bot-flak-direct" } as ScenarioUnit;

    (engine as any).addUnitToFactionHex("Player", fighterAlpha);
    (engine as any).addUnitToFactionHex("Player", fighterBravo);
    (engine as any).addUnitToFactionHex("Bot", flak);
  });

  await When("the bot flak battery attacks the stacked air defenders", async () => {
    const flak = (engine as any).findUnitInFactionAtHex(originHex, "Bot", "bot-flak-direct") as ScenarioUnit | null;
    if (!flak) {
      throw new Error("Bot flak battery missing before direct attack.");
    }
    attack = (engine as any).resolveBotAttack(flak, originHex, targetHex);
  });

  await Then("both air defenders should take damage and the flak should spend one ammo", async () => {
    if (!attack) {
      throw new Error("Expected the bot flak attack to resolve.");
    }
    const defenders = engine.getHexStackMembers(targetHex, "Player");
    if (defenders.length !== 2) {
      throw new Error(`Expected both stacked fighters to remain after flak fire, saw ${defenders.length}.`);
    }

    const alpha = defenders.find((entry) => entry.unitId === "player-fighter-alpha")?.unit ?? null;
    const bravo = defenders.find((entry) => entry.unitId === "player-fighter-bravo")?.unit ?? null;
    if (!alpha || !bravo) {
      throw new Error(`Expected both stacked fighters to remain identifiable, saw ${JSON.stringify(defenders)}.`);
    }
    if (alpha.strength >= 100 || bravo.strength >= 100) {
      throw new Error(`Expected both stacked fighters to take flak damage, saw alpha=${alpha.strength}, bravo=${bravo.strength}.`);
    }

    const flakAfter = (engine as any).findUnitInFactionAtHex(originHex, "Bot", "bot-flak-direct") as ScenarioUnit | null;
    if (!flakAfter) {
      throw new Error("Expected the bot flak battery to survive the exchange.");
    }
    if (flakAfter.ammo !== 5) {
      throw new Error(`Expected the bot flak battery to spend exactly one ammo on the target-rich attack, saw ${flakAfter.ammo}.`);
    }
    if ((attack.inflictedDamage ?? 0) <= 0) {
      throw new Error(`Expected aggregate flak damage in the bot attack summary, saw ${JSON.stringify(attack)}.`);
    }
  });
});

registerTest("BOT_FIGHTER_TARGET_RICH_DAMAGE_HITS_EVERY_STACKED_AIR_DEFENDER_BUT_SPENDS_ONE_AIR_SALVO", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let attack: { inflictedDamage?: number } | null = null;
  const originHex: Axial = { q: 0, r: 0 };
  const targetHex: Axial = { q: 1, r: 0 };

  await Given("a bot fighter attacking two stacked player fighters", async () => {
    const config: GameEngineConfig = {
      scenario: buildScenario(),
      unitTypes,
      terrain,
      playerSide: baseSide(),
      botSide: baseSide()
    };

    engine = new GameEngine(config);
    engine.beginDeployment();
    engine.initializeFromAllocations([]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    const fighterAlpha = { ...makeUnit("Fighter", targetHex), unitId: "player-air-alpha" } as ScenarioUnit;
    const fighterBravo = { ...makeUnit("Fighter", targetHex), unitId: "player-air-bravo" } as ScenarioUnit;
    const botFighter = { ...makeUnit("Fighter", originHex), unitId: "bot-air-direct" } as ScenarioUnit;

    (engine as any).addUnitToFactionHex("Player", fighterAlpha);
    (engine as any).addUnitToFactionHex("Player", fighterBravo);
    (engine as any).addUnitToFactionHex("Bot", botFighter);
  });

  await When("the bot fighter attacks the stacked air defenders", async () => {
    const botFighter = (engine as any).findUnitInFactionAtHex(originHex, "Bot", "bot-air-direct") as ScenarioUnit | null;
    if (!botFighter) {
      throw new Error("Bot fighter missing before direct attack.");
    }
    attack = (engine as any).resolveBotAttack(botFighter, originHex, targetHex);
  });

  await Then("both defenders should take dogfight damage and the attacker should spend one air salvo", async () => {
    if (!attack) {
      throw new Error("Expected the bot fighter attack to resolve.");
    }
    const defenders = engine.getHexStackMembers(targetHex, "Player");
    if (defenders.length !== 2) {
      throw new Error(`Expected both stacked fighters to remain after the dogfight, saw ${defenders.length}.`);
    }

    const alpha = defenders.find((entry) => entry.unitId === "player-air-alpha")?.unit ?? null;
    const bravo = defenders.find((entry) => entry.unitId === "player-air-bravo")?.unit ?? null;
    if (!alpha || !bravo) {
      throw new Error(`Expected both stacked fighters to remain identifiable after the dogfight, saw ${JSON.stringify(defenders)}.`);
    }
    if (alpha.strength >= 100 || bravo.strength >= 100) {
      throw new Error(`Expected both stacked fighters to take air-to-air damage, saw alpha=${alpha.strength}, bravo=${bravo.strength}.`);
    }

    const botFighterAfter = (engine as any).findUnitInFactionAtHex(originHex, "Bot", "bot-air-direct") as ScenarioUnit | null;
    if (!botFighterAfter) {
      throw new Error("Expected the bot fighter to survive this deterministic dogfight.");
    }
    if (botFighterAfter.ammo !== 5) {
      throw new Error(`Expected the bot fighter to spend exactly one ammo on the target-rich dogfight, saw ${botFighterAfter.ammo}.`);
    }
    if ((attack.inflictedDamage ?? 0) <= 0) {
      throw new Error(`Expected aggregate dogfight damage in the bot attack summary, saw ${JSON.stringify(attack)}.`);
    }
  });
});
