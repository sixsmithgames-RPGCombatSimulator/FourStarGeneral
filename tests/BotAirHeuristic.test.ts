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

const bomberDef: UnitTypeDefinition = {
  class: "air",
  combat: { category: "air", weight: "medium", role: "antiInfantry", signature: "large" },
  movement: 6,
  moveType: "air",
  vision: 4,
  ammo: 1,
  fuel: 60,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 1,
  armor: { front: 10, side: 10, top: 10 },
  hardAttack: 70,
  softAttack: 50,
  ap: 16,
  accuracyBase: 55,
  traits: ["indirect"],
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
  movement: 2,
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

const artilleryDef: UnitTypeDefinition = {
  class: "artillery",
  combat: { category: "artillery", weight: "medium", role: "support", signature: "large" },
  movement: 1,
  moveType: "wheel",
  vision: 2,
  ammo: 5,
  fuel: 0,
  rangeMin: 2,
  rangeMax: 4,
  initiative: 2,
  armor: { front: 2, side: 2, top: 1 },
  hardAttack: 8,
  softAttack: 24,
  ap: 3,
  accuracyBase: 52,
  traits: ["indirect"],
  cost: 180
};

const tankDef: UnitTypeDefinition = {
  class: "tank",
  combat: { category: "tank", weight: "medium", role: "normal", signature: "large" },
  movement: 3,
  moveType: "track",
  vision: 3,
  ammo: 6,
  fuel: 55,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 4,
  armor: { front: 10, side: 8, top: 6 },
  hardAttack: 20,
  softAttack: 12,
  ap: 10,
  accuracyBase: 60,
  traits: [],
  cost: 220
};

const flakDef: UnitTypeDefinition = {
  class: "specialist",
  combat: { category: "specialist", weight: "medium", role: "antiTank", signature: "medium" },
  movement: 1,
  moveType: "wheel",
  vision: 4,
  ammo: 6,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 5,
  initiative: 4,
  armor: { front: 3, side: 2, top: 2 },
  hardAttack: 220,
  softAttack: 220,
  ap: 20,
  accuracyBase: 75,
  traits: ["intercept"],
  cost: 220
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
  Bomber: bomberDef,
  Infantry_42: infantryDef,
  Howitzer_105: artilleryDef,
  Panzer_IV: tankDef,
  Flak_88: flakDef,
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
  const row = [
    { tile: tileKey },
    { tile: tileKey },
    { tile: tileKey },
    { tile: tileKey }
  ];

  return {
    name: "Bot Air Heuristic",
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

function make(type: keyof typeof unitTypes, hex: Axial): ScenarioUnit {
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

function createBotTurnEngine(): GameEngine {
  const config: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side(),
    botSide: side()
  };

  const engine = new GameEngine(config);
  (engine as any)._phase = "botTurn";
  (engine as any)._activeFaction = "Bot";
  return engine;
}

registerTest("BOT_AIR_HEURISTIC_SKIPS_CAP_WHEN_PLAYER_HAS_NO_STRIKE_AIRCRAFT", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a bot fighter with a player-held objective to cover, but only player interceptors in the air order of battle", async () => {
    engine = createBotTurnEngine();

    const botFighter = make("Fighter", { q: 0, r: 0 });
    (botFighter as any).unitId = "bot-cap";
    (engine as any).botPlacements.set("0,0", botFighter);

    const playerInterceptor = make("Fighter", { q: 3, r: 0 });
    (playerInterceptor as any).unitId = "player-cap";
    (engine as any).playerPlacements.set("3,0", playerInterceptor);
  });

  await When("the bot evaluates heuristic air operations", async () => {
    (engine as any).maybeScheduleHeuristicAirOps();
  });

  await Then("it should not waste a CAP sortie because the player has no strike aircraft", async () => {
    const missions = Array.from((engine as any).scheduledAirMissions.values()) as Array<{ template: { kind: string } }>;
    if (missions.length !== 0) {
      throw new Error(`Expected no bot air missions to be queued, saw ${missions.map((mission) => mission.template.kind).join(", ")}.`);
    }
  });
});

registerTest("BOT_AIR_HEURISTIC_ESCORTS_BOMBERS_WHEN_PLAYER_FIELDS_INTERCEPTORS", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a bot bomber package and a player interceptor presence protecting a ground target", async () => {
    engine = createBotTurnEngine();

    const botBomber = make("Bomber", { q: 0, r: 0 });
    (botBomber as any).unitId = "bot-bomber";
    (engine as any).botPlacements.set("0,0", botBomber);

    const botEscort = make("Fighter", { q: 1, r: 0 });
    (botEscort as any).unitId = "bot-escort";
    (engine as any).botPlacements.set("1,0", botEscort);

    const playerInterceptor = make("Fighter", { q: 3, r: 0 });
    (playerInterceptor as any).unitId = "player-cap";
    (engine as any).playerPlacements.set("3,0", playerInterceptor);

    const playerTarget = make("Infantry_42", { q: 2, r: 1 });
    (engine as any).playerPlacements.set("2,1", playerTarget);
  });

  await When("the bot queues heuristic air operations", async () => {
    (engine as any).maybeScheduleHeuristicAirOps();
  });

  await Then("it should queue a strike and pair an escort instead of spending the fighter on CAP", async () => {
    const missions = Array.from((engine as any).scheduledAirMissions.values()) as Array<{
      template: { kind: string };
      unitKey: string;
      escortTargetUnitKey?: string;
    }>;

    const strike = missions.find((mission) => mission.template.kind === "strike") ?? null;
    const escort = missions.find((mission) => mission.template.kind === "escort") ?? null;
    const cap = missions.find((mission) => mission.template.kind === "airCover") ?? null;

    if (!strike) {
      throw new Error(`Expected a bot strike mission to be queued, saw ${missions.map((mission) => mission.template.kind).join(", ")}.`);
    }
    if (!escort) {
      throw new Error(`Expected a bot escort mission to be queued alongside the strike, saw ${missions.map((mission) => mission.template.kind).join(", ")}.`);
    }
    if (escort.escortTargetUnitKey !== strike.unitKey) {
      throw new Error(`Expected escort to protect ${strike.unitKey}, saw ${escort.escortTargetUnitKey ?? "<missing>"}.`);
    }
    if (cap) {
      throw new Error("Expected the bot to reserve its fighter for escort instead of queuing CAP.");
    }
  });
});

registerTest("BOT_AIR_HEURISTIC_SKIPS_LONE_BOMBER_RUNS_INTO_HEAVY_FLAK", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a single bot bomber facing an artillery target protected by overlapping player flak", async () => {
    engine = createBotTurnEngine();

    const botBomber = make("Bomber", { q: 0, r: 0 });
    (botBomber as any).unitId = "bot-bomber";
    (engine as any).botPlacements.set("0,0", botBomber);

    const playerArtillery = make("Howitzer_105", { q: 2, r: 1 });
    (playerArtillery as any).unitId = "player-artillery";
    (engine as any).playerPlacements.set("2,1", playerArtillery);

    const firstFlak = make("Flak_88", { q: 2, r: 0 });
    firstFlak.onSentry = true;
    (firstFlak as any).unitId = "player-flak-a";
    (engine as any).playerPlacements.set("2,0", firstFlak);

    const secondFlak = make("Flak_88", { q: 3, r: 1 });
    secondFlak.onSentry = true;
    (secondFlak as any).unitId = "player-flak-b";
    (engine as any).playerPlacements.set("3,1", secondFlak);
  });

  await When("the bot evaluates whether the strike is worth launching", async () => {
    (engine as any).maybeScheduleHeuristicAirOps();
  });

  await Then("it should decline the sortie instead of throwing away the bomber", async () => {
    const strikeMissions = Array.from((engine as any).scheduledAirMissions.values()).filter(
      (mission: { template: { kind: string } }) => mission.template.kind === "strike"
    );
    if (strikeMissions.length !== 0) {
      throw new Error(`Expected heavy flak to deter a lone bomber strike, but queued ${strikeMissions.length} strike mission(s).`);
    }
  });
});

registerTest("BOT_AIR_HEURISTIC_GROUND_ATTACK_PREFERS_ARMOR_OVER_CLOSER_INFANTRY", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("an anti-vehicle strike aircraft with a closer infantry target and a farther tank", async () => {
    engine = createBotTurnEngine();

    const attacker = make("GroundAttack", { q: 0, r: 0 });
    (attacker as any).unitId = "bot-ground-attack";
    (engine as any).botPlacements.set("0,0", attacker);

    const infantry = make("Infantry_42", { q: 2, r: 0 });
    (infantry as any).unitId = "player-infantry";
    (engine as any).playerPlacements.set("2,0", infantry);

    const tank = make("Panzer_IV", { q: 4, r: 0 });
    (tank as any).unitId = "player-tank";
    (engine as any).playerPlacements.set("4,0", tank);
  });

  await When("the bot evaluates strike assignments", async () => {
    (engine as any).maybeScheduleHeuristicAirOps();
  });

  await Then("it should queue the anti-vehicle sortie against the armored target", async () => {
    const strike = Array.from((engine as any).scheduledAirMissions.values()).find(
      (mission: { template: { kind: string }; targetHex?: Axial }) => mission.template.kind === "strike"
    ) as { targetHex?: Axial } | undefined;
    if (!strike?.targetHex || `${strike.targetHex.q},${strike.targetHex.r}` !== "4,0") {
      throw new Error(`Expected anti-vehicle strike to target armor at 4,0, saw ${strike?.targetHex ? `${strike.targetHex.q},${strike.targetHex.r}` : "no strike"}.`);
    }
  });
});

registerTest("BOT_AIR_HEURISTIC_BOMBERS_PREFER_ARTILLERY_OVER_CLOSER_INFANTRY", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("a bomber package choosing between nearby infantry and a farther artillery battery", async () => {
    engine = createBotTurnEngine();

    const bomber = make("Bomber", { q: 0, r: 0 });
    (bomber as any).unitId = "bot-bomber";
    (engine as any).botPlacements.set("0,0", bomber);

    const infantry = make("Infantry_42", { q: 2, r: 0 });
    (infantry as any).unitId = "player-infantry";
    (engine as any).playerPlacements.set("2,0", infantry);

    const artillery = make("Howitzer_105", { q: 4, r: 0 });
    (artillery as any).unitId = "player-artillery";
    (engine as any).playerPlacements.set("4,0", artillery);
  });

  await When("the bomber target list is ranked", async () => {
    (engine as any).maybeScheduleHeuristicAirOps();
  });

  await Then("the artillery battery should be selected ahead of the infantry convenience shot", async () => {
    const strike = Array.from((engine as any).scheduledAirMissions.values()).find(
      (mission: { template: { kind: string }; targetHex?: Axial }) => mission.template.kind === "strike"
    ) as { targetHex?: Axial } | undefined;
    if (!strike?.targetHex || `${strike.targetHex.q},${strike.targetHex.r}` !== "4,0") {
      throw new Error(`Expected bomber strike to target artillery at 4,0, saw ${strike?.targetHex ? `${strike.targetHex.q},${strike.targetHex.r}` : "no strike"}.`);
    }
  });
});

registerTest("BOT_AIR_HEURISTIC_SPLITS_MULTIPLE_BOMBERS_ACROSS_VALUABLE_TARGETS", async ({ Given, When, Then }) => {
  let engine: GameEngine;

  await Given("two bombers with both artillery and armor available as worthwhile targets", async () => {
    engine = createBotTurnEngine();

    const firstBomber = make("Bomber", { q: 0, r: 0 });
    (firstBomber as any).unitId = "bot-bomber-a";
    (engine as any).botPlacements.set("0,0", firstBomber);

    const secondBomber = make("Bomber", { q: 0, r: 1 });
    (secondBomber as any).unitId = "bot-bomber-b";
    (engine as any).botPlacements.set("0,1", secondBomber);

    const artillery = make("Howitzer_105", { q: 4, r: 0 });
    (artillery as any).unitId = "player-artillery";
    (engine as any).playerPlacements.set("4,0", artillery);

    const tank = make("Panzer_IV", { q: 4, r: 1 });
    (tank as any).unitId = "player-tank";
    (engine as any).playerPlacements.set("4,1", tank);
  });

  await When("the bot assigns both bomber sorties for the turn", async () => {
    (engine as any).maybeScheduleHeuristicAirOps();
  });

  await Then("the queued strikes should cover both valuable targets before doubling up", async () => {
    const strikeTargets = Array.from((engine as any).scheduledAirMissions.values())
      .filter((mission: { template: { kind: string } }) => mission.template.kind === "strike")
      .map((mission: { targetHex?: Axial }) => mission.targetHex ? `${mission.targetHex.q},${mission.targetHex.r}` : "<missing>")
      .sort();
    const expected = ["4,0", "4,1"];
    if (strikeTargets.length !== expected.length || strikeTargets.some((target, index) => target !== expected[index])) {
      throw new Error(`Expected bomber targets ${expected.join(", ")}, saw ${strikeTargets.join(", ")}.`);
    }
  });
});
