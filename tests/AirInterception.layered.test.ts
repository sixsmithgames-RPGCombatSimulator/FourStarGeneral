import { registerTest } from "./harness.js";
import type { ScenarioUnit, ScenarioSide, ScenarioData, TerrainDefinition, TerrainDictionary, UnitTypeDictionary, UnitTypeDefinition, Axial } from "../src/core/types";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";
import { canonicalWeaponModel } from "./canonicalWeaponFixture";

// Inline terrain and unit definitions to keep the test deterministic and self-contained
const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};
const terrain: TerrainDictionary = { plains } as unknown as TerrainDictionary;

const fighterDef: UnitTypeDefinition = {
  weaponModel: canonicalWeaponModel("fighter"),
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
  airSupport: { roles: ["escort", "cap", "strike"], cruiseSpeedKph: 540, combatRadiusKm: 250, refitTurns: 1 }
};

const bomberDef: UnitTypeDefinition = {
  weaponModel: canonicalWeaponModel("bomber"),
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
  airSupport: { roles: ["strike"], cruiseSpeedKph: 450, combatRadiusKm: 200, refitTurns: 2 }
};

const infantryDef: UnitTypeDefinition = {
  weaponModel: canonicalWeaponModel("infantry"),
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
    facing: "NW"
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

    // Deploy player bomber plus a ground spotter so the seeded defender becomes a legal contact.
    engine.beginDeployment();
    const bomber = make("Bomber", { q: 0, r: 0 });
    const playerSpotter = make("Infantry_42", { q: 1, r: 1 });
    (bomber as any).unitId = "u_bomber";
    (bomber as any).preDeployed = true;
    (playerSpotter as any).preDeployed = true;
    engine.initializeFromAllocations([bomber, playerSpotter]);
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

registerTest("AIR_INTERCEPTION_ESCORT_REPORTS_SUCCESS_AFTER_ENGAGING_INTERCEPTORS", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let outcome: unknown = null;

  await Given("an escort mission that already fought but lost track of its protected bomber", async () => {
    const config: GameEngineConfig = {
      scenario: scenario(),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);
  });

  await When("the escort mission resolves after recording an interception", async () => {
    outcome = (engine as any).resolveEscortMission({
      id: "esc-report",
      template: {
        kind: "escort",
        label: "Escort",
        description: "",
        allowedRoles: ["escort"],
        requiresTarget: false,
        requiresFriendlyEscortTarget: true,
        durationTurns: 1
      },
      faction: "Player",
      unitKey: "u_esc1",
      unitType: "Fighter",
      status: "resolving",
      launchTurn: 1,
      turnsRemaining: 0,
      escortTargetUnitKey: "u_bomber",
      interceptions: 1,
      airCombatDamageInflicted: 19,
      airCombatDamageTaken: 4,
      airCombatKills: 1
    });
  });

  await Then("the mission should report a successful escort action instead of an abort", async () => {
    const escortOutcome = outcome as {
      result?: string;
      details?: string;
      interceptions?: number;
      meta?: { interceptorAttrition?: number; escortAttrition?: number; interceptorKills?: number };
    };
    if (escortOutcome.result !== "success") {
      throw new Error(`Expected escort mission to resolve successfully after combat, saw ${escortOutcome.result ?? "<missing>"}.`);
    }
    if (escortOutcome.interceptions !== 1) {
      throw new Error(`Expected escort mission to preserve its interception count, saw ${escortOutcome.interceptions ?? "<missing>"}.`);
    }
    if (escortOutcome.meta?.interceptorAttrition !== 19) {
      throw new Error(`Expected escort mission to preserve interceptor attrition, saw ${escortOutcome.meta?.interceptorAttrition ?? "<missing>"}.`);
    }
    if (escortOutcome.meta?.escortAttrition !== 4) {
      throw new Error(`Expected escort mission to preserve escort attrition, saw ${escortOutcome.meta?.escortAttrition ?? "<missing>"}.`);
    }
    if (escortOutcome.meta?.interceptorKills !== 1) {
      throw new Error(`Expected escort mission to preserve interceptor kills, saw ${escortOutcome.meta?.interceptorKills ?? "<missing>"}.`);
    }
  });
});

registerTest("AIR_INTERCEPTION_ESCORT_REPORTS_SUCCESS_FROM_RESOLVED_PACKAGE_STATE_WHEN_FLAK_KILLS_THE_BOMBER", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let outcome: unknown = null;

  await Given("an escort mission whose linked strike package was already resolved and destroyed by flak", async () => {
    const config: GameEngineConfig = {
      scenario: scenario(),
      unitTypes,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);
    (engine as any).resolvedEscortMissionStateByMissionId.set("esc-report-flak", {
      missionId: "esc-report-flak",
      unitKey: "u_esc1",
      unitType: "Fighter",
      unitLabel: "Fighter @ 1,4",
      protectedUnitKey: "u_bomber",
      protectedUnitLabel: "Bomber @ 0,4",
      engaged: false,
      interceptions: 0,
      interceptorAttrition: 0,
      escortAttrition: 0,
      interceptorKills: 0,
      escortDestroyed: false,
      packageDestroyedBeforeTarget: true,
      packageDestroyedCause: "flak"
    });
  });

  await When("the escort mission resolves after the package was lost before release", async () => {
    outcome = (engine as any).resolveEscortMission({
      id: "esc-report-flak",
      template: {
        kind: "escort",
        label: "Escort",
        description: "",
        allowedRoles: ["escort"],
        requiresTarget: false,
        requiresFriendlyEscortTarget: true,
        durationTurns: 1
      },
      faction: "Bot",
      unitKey: "u_esc1",
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

  await Then("the escort should still resolve successfully instead of aborting", async () => {
    const escortOutcome = outcome as {
      result?: string;
      details?: string;
      interceptions?: number;
    };
    if (escortOutcome.result !== "success") {
      throw new Error(`Expected escort mission to resolve successfully from package state, saw ${escortOutcome.result ?? "<missing>"}.`);
    }
    if (escortOutcome.interceptions !== 0) {
      throw new Error(`Expected escort mission to preserve zero direct interceptions, saw ${escortOutcome.interceptions ?? "<missing>"}.`);
    }
    if (!String(escortOutcome.details ?? "").includes("destroyed by anti-aircraft fire")) {
      throw new Error(`Expected escort details to explain the flak loss, saw ${escortOutcome.details ?? "<missing>"}.`);
    }
  });
});

registerTest("AIR_INTERCEPTION_BOMBER_TURRETS_RETURN_FIRE_WITHOUT_REUSING_GROUND_ORDNANCE", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let engagements: ReturnType<GameEngine["consumeAirEngagements"]> = [];

  await Given("a bomber with a dedicated turret profile attacking through one CAP interceptor", async () => {
    const interceptorDef: UnitTypeDefinition = {
      ...fighterDef,
      airCombat: {
        attack: {
          accuracyBase: 74,
          hardAttack: 18,
          softAttack: 18,
          ap: 6,
          rangeMin: 1,
          rangeMax: 2,
          combat: { category: "air", weight: "light", role: "normal", signature: "small" },
          shotsScalar: 1.1,
          damageScalar: 2.5,
          suppressionScalar: 2.5
        }
      }
    };
    const turretBomberDef: UnitTypeDefinition = {
      ...bomberDef,
      airCombat: {
        turret: {
          accuracyBase: 78,
          hardAttack: 14,
          softAttack: 14,
          ap: 3,
          rangeMin: 1,
          rangeMax: 2,
          combat: { category: "air", weight: "light", role: "normal", signature: "large" },
          shotsScalar: 1.2,
          damageScalar: 1.6,
          suppressionScalar: 1.1
        }
      }
    };
    const config: GameEngineConfig = {
      scenario: scenario(),
      unitTypes: {
        Bomber: turretBomberDef,
        Interceptor: interceptorDef,
        Infantry_42: infantryDef
      } as unknown as UnitTypeDictionary,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);

    engine.beginDeployment();
    const bomber: ScenarioUnit = {
      type: "Bomber" as unknown as ScenarioUnit["type"],
      hex: { q: 0, r: 0 },
      strength: 100,
      experience: 0,
      ammo: turretBomberDef.ammo ?? 4,
      fuel: turretBomberDef.fuel ?? 60,
      entrench: 0,
      facing: "NW",
      unitId: "u_bomber"
    };
    const playerSpotter = make("Infantry_42", { q: 1, r: 1 });
    (bomber as any).preDeployed = true;
    (playerSpotter as any).preDeployed = true;
    engine.initializeFromAllocations([bomber, playerSpotter]);
    engine.setBaseCamp({ q: 0, r: 0 });
    engine.finalizeDeployment();
    engine.startPlayerTurnPhase();

    const botDef = make("Infantry_42", { q: 0, r: 1 });
    (engine as any).botPlacements.set("0,1", botDef);
    const cap: ScenarioUnit = {
      type: "Interceptor" as unknown as ScenarioUnit["type"],
      hex: { q: 0, r: 2 },
      strength: 100,
      experience: 0,
      ammo: interceptorDef.ammo ?? 6,
      fuel: interceptorDef.fuel ?? 50,
      entrench: 0,
      facing: "NW",
      unitId: "u_cap"
    };
    (engine as any).botPlacements.set("0,2", cap);
    (engine as any).scheduledAirMissions.set("cap", {
      id: "cap",
      template: { kind: "airCover", label: "CAP", description: "", allowedRoles: ["cap"], requiresTarget: true, requiresFriendlyEscortTarget: false, durationTurns: 1 },
      faction: "Bot",
      unitKey: "u_cap",
      unitType: "Interceptor",
      status: "inFlight",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 0, r: 1 },
      escortTargetUnitKey: undefined,
      interceptions: 0
    });
  });

  await When("the bomber attacks through that interception layer", async () => {
    engine.attackUnit({ q: 0, r: 0 }, { q: 0, r: 1 });
    engagements = engine.consumeAirEngagements();
  });

  await Then("the resulting air event should include interceptor attrition from turret fire", async () => {
    const evt = engagements.find((entry) => entry.type === "airToAir");
    if (!evt) {
      throw new Error("Expected an air-to-air engagement event for the CAP interception.");
    }
    if ((evt.interceptorAttrition ?? 0) <= 0) {
      throw new Error(`Expected bomber turret fire to inflict interceptor attrition, saw ${evt.interceptorAttrition ?? 0}.`);
    }
  });
});

registerTest("AIR_INTERCEPTION_AIR_SUPERIORITY_DAMAGE_MATCHES_STATUS_POOL_PREVIEW_AND_APPLICATION", async ({ Given, When, Then }) => {
  let engine: GameEngine;
  let escortVsInterceptorDamage = 0;
  let interceptorVsBomberDamage = 0;
  let appliedReadinessLoss = 0;
  let appliedStrength = 100;

  await Given("an escort/interceptor matchup with extreme dogfight values plus a bomber target", async () => {
    const airSuperiorityDef: UnitTypeDefinition = {
      ...fighterDef,
      accuracyBase: 78,
      hardAttack: 28,
      softAttack: 28,
      airSupport: { roles: ["escort", "cap"], cruiseSpeedKph: 560, combatRadiusKm: 250, refitTurns: 1 },
      airCombat: {
        attack: {
          accuracyBase: 88,
          hardAttack: 36,
          softAttack: 36,
          ap: 10,
          rangeMin: 1,
          rangeMax: 2,
          combat: { category: "air", weight: "light", role: "normal", signature: "small" },
          shotsScalar: 1.8,
          damageScalar: 3.6,
          suppressionScalar: 3.6
        }
      }
    };
    const strikerDef: UnitTypeDefinition = {
      ...bomberDef,
      airCombat: {
        turret: {
          accuracyBase: 10,
          hardAttack: 1,
          softAttack: 1,
          ap: 0,
          rangeMin: 1,
          rangeMax: 2,
          combat: { category: "air", weight: "light", role: "normal", signature: "large" },
          shotsScalar: 0,
          damageScalar: 0,
          suppressionScalar: 0
        }
      }
    };
    const config: GameEngineConfig = {
      scenario: scenario(),
      unitTypes: {
        Fighter: airSuperiorityDef,
        Interceptor: airSuperiorityDef,
        Bomber: strikerDef,
        Infantry_42: infantryDef
      } as unknown as UnitTypeDictionary,
      terrain,
      playerSide: side(),
      botSide: side()
    };
    engine = new GameEngine(config);
  });

  await When("air-superiority flights and strike aircraft resolve their direct air-combat rolls", async () => {
    escortVsInterceptorDamage = (engine as any).resolveAirCombatDamage(
      "Bot",
      {
        type: "Fighter" as unknown as ScenarioUnit["type"],
        hex: { q: 0, r: 0 },
        strength: 100,
        experience: 0,
        ammo: 6,
        fuel: 50,
        entrench: 0,
        facing: "NW"
      },
      {
        type: "Interceptor" as unknown as ScenarioUnit["type"],
        hex: { q: 0, r: 1 },
        strength: 100,
        experience: 0,
        ammo: 6,
        fuel: 50,
        entrench: 0,
        facing: "NW"
      },
      "attack"
    );
    interceptorVsBomberDamage = (engine as any).resolveAirCombatDamage(
      "Player",
      {
        type: "Interceptor" as unknown as ScenarioUnit["type"],
        hex: { q: 0, r: 0 },
        strength: 100,
        experience: 0,
        ammo: 6,
        fuel: 50,
        entrench: 0,
        facing: "NW"
      },
      {
        type: "Bomber" as unknown as ScenarioUnit["type"],
        hex: { q: 0, r: 1 },
        strength: 100,
        experience: 0,
        ammo: 4,
        fuel: 60,
        entrench: 0,
        facing: "NW"
      },
      "attack"
    );
    const defender = make("Fighter", { q: 0, r: 1 });
    defender.type = "Interceptor";
    const applied = (engine as any).applyAirCombatDamageToUnit(
      "Bot", make("Fighter", { q: 0, r: 0 }), defender, "attack"
    );
    if (!applied) throw new Error("Expected the actual air-combat status application to resolve.");
    appliedReadinessLoss = applied.readinessLoss;
    appliedStrength = defender.strength;
  });

  await Then("fighter-versus-fighter attrition should follow raw combat math instead of an arbitrary cap", async () => {
    // The status-pool model retains damaged platforms; the old scalar damage >=95
    // expectation predates that model. Preserve an exact uncapped readiness result.
    if (![escortVsInterceptorDamage, appliedReadinessLoss, appliedStrength, interceptorVsBomberDamage].every(Number.isFinite)
      || Math.abs(escortVsInterceptorDamage - 75.15) > 0.001
      || appliedReadinessLoss !== escortVsInterceptorDamage
      || Math.abs(appliedStrength - (100 - escortVsInterceptorDamage)) > 0.001) {
      throw new Error(`Expected canonical readiness loss 75.15 with identical preview and application, saw ${JSON.stringify({ escortVsInterceptorDamage, appliedReadinessLoss, appliedStrength })}.`);
    }
    if (interceptorVsBomberDamage <= 0) {
      throw new Error(`Expected the interceptor-vs-bomber attack to still resolve meaningful damage, saw ${interceptorVsBomberDamage}.`);
    }
  });
});
