import { registerTest } from "./harness.js";
import { canonicalWeaponModel } from "./canonicalWeaponFixture.js";
import type {
  FormationStatus,
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  TerrainDefinition,
  TerrainDictionary,
  UnitTypeDefinition,
  UnitTypeDictionary
} from "../src/core/types";
import { deriveStrengthFromStatus } from "../src/data/unitSystem/status";
import { GameEngine, type GameEngineConfig } from "../src/game/GameEngine";
import { resolveMobilityBurden } from "../src/game/tacticalRecovery";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const infantryDef: UnitTypeDefinition = {
  weaponModel: canonicalWeaponModel("infantry"),
  class: "infantry",
  combat: { category: "infantry", weight: "light", role: "normal", signature: "small" },
  movement: 2,
  moveType: "leg",
  vision: 2,
  ammo: 8,
  fuel: 0,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 3,
  armor: { front: 0, side: 0, top: 0 },
  hardAttack: 1,
  softAttack: 2,
  ap: 1,
  accuracyBase: 20,
  traits: ["zoc"],
  cost: 90
};

const vehicleDef: UnitTypeDefinition = {
  weaponModel: canonicalWeaponModel("reconBike"),
  class: "recon",
  combat: { category: "recon", weight: "light", role: "normal", signature: "medium" },
  movement: 5,
  moveType: "wheel",
  vision: 3,
  ammo: 5,
  fuel: 40,
  rangeMin: 1,
  rangeMax: 1,
  initiative: 4,
  armor: { front: 1, side: 1, top: 1 },
  hardAttack: 2,
  softAttack: 4,
  ap: 1,
  accuracyBase: 40,
  traits: [],
  cost: 100
};

const supportDef: UnitTypeDefinition = {
  weaponModel: canonicalWeaponModel("supplyConvoy"),
  class: "vehicle",
  combat: { category: "vehicle", weight: "medium", role: "support", signature: "medium" },
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
  TestInfantry: infantryDef,
  TestLight_Tank: vehicleDef,
  Supply_Truck: supportDef
} as unknown as UnitTypeDictionary;
const terrain = { plains } as unknown as TerrainDictionary;

function side(hq: { q: number; r: number }, units: ScenarioUnit[]): ScenarioSide {
  return {
    hq,
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units
  };
}

function scenario(): ScenarioData {
  const row = Array.from({ length: 7 }, () => ({ tile: "plains" }));
  return {
    name: "Tactical Recovery",
    size: { cols: 7, rows: 3 },
    tilePalette: {
      plains: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" }
    },
    tiles: [row, row, row],
    objectives: [],
    turnLimit: 8,
    sides: { Player: side({ q: 0, r: 0 }, []), Bot: side({ q: 6, r: 0 }, []) }
  } as unknown as ScenarioData;
}

function engineFor(playerUnits: ScenarioUnit[], botUnits: ScenarioUnit[] = []): { engine: GameEngine; config: GameEngineConfig } {
  const config: GameEngineConfig = {
    scenario: scenario(),
    unitTypes,
    terrain,
    playerSide: side({ q: 0, r: 0 }, playerUnits.map((unit) => ({ ...unit, preDeployed: true }))),
    botSide: side({ q: 6, r: 0 }, botUnits.map((unit) => ({ ...unit, preDeployed: true }))),
    botStrategyMode: "Simple"
  };
  const engine = new GameEngine(config);
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  engine.startPlayerTurnPhase();
  return { engine, config };
}

function personnelStatus(
  fit: number,
  injured: number,
  wounded: number,
  severelyWounded: number,
  killed: number
): FormationStatus {
  return {
    personnel: { core: { fit, injured, wounded, severelyWounded, killed } },
    equipment: {},
    capacity: { personnel: { core: fit + injured + wounded + severelyWounded + killed }, equipment: {} },
    ammo: {},
    suppression: 0,
    readinessModel: { basis: "personnel", personnelWeight: 1, equipmentWeight: 0 }
  };
}

function infantry(unitId: string, hex: { q: number; r: number }, status: FormationStatus): ScenarioUnit {
  return {
    type: "TestInfantry" as ScenarioUnit["type"],
    unitId,
    hex,
    strength: deriveStrengthFromStatus(status, 100),
    status,
    experience: 0,
    ammo: 8,
    fuel: 0,
    entrench: 0,
    facing: "E"
  };
}

function vehicle(unitId: string, hex: { q: number; r: number }, status: FormationStatus): ScenarioUnit {
  return {
    type: "TestLight_Tank" as ScenarioUnit["type"],
    unitId,
    hex,
    strength: deriveStrengthFromStatus(status, 100),
    status,
    experience: 0,
    ammo: 5,
    fuel: 40,
    entrench: 0,
    facing: "E"
  };
}

registerTest("CASUALTY_BURDEN_SCALES_MOVEMENT_AND_EXCLUDES_PERMANENT_LOSSES", async ({ Then }) => {
  const leg = personnelStatus(90, 0, 10, 0, 900);
  const legBurden = resolveMobilityBurden(leg, "leg");
  const vehicleStatus: FormationStatus = {
    personnel: { crew: { fit: 20, injured: 0, wounded: 0, severelyWounded: 0, killed: 80 } },
    equipment: { vehicles: { operational: 9, damaged: 1, disabled: 0, destroyed: 90 } },
    capacity: { personnel: { crew: 100 }, equipment: { vehicles: 100 } },
    ammo: {},
    suppression: 0,
    readinessModel: { basis: "platform", personnelWeight: 1, equipmentWeight: 1 }
  };
  const wheelBurden = resolveMobilityBurden(vehicleStatus, "wheel");
  if (legBurden.burdenRatio !== 0.1 || wheelBurden.burdenRatio !== 0.1) {
    throw new Error(`Expected exact 10% burdens with killed/destroyed excluded, received ${JSON.stringify({ legBurden, wheelBurden })}.`);
  }

  const unit = infantry("burdened", { q: 0, r: 0 }, personnelStatus(90, 0, 10, 0, 0));
  const { engine } = engineFor([unit]);
  const before = engine.getMovementBudget(unit.hex, unit.unitId);
  const command = engine.getUnitCommandState(unit.hex, unit.unitId);
  if (before?.remaining !== 1.8 || command?.mobilityBurdenPercent !== 10 || !command.canLeaveCasualtiesBehind) {
    throw new Error(`Expected a 10% movement penalty and a leave-behind order, received ${JSON.stringify({ before, command })}.`);
  }
  const resolution = engine.leaveCasualtiesBehind(unit.hex, unit.unitId);
  const after = engine.getMovementBudget(unit.hex, unit.unitId);
  if (!resolution || resolution.site.status.personnel.core?.wounded !== 10 || after?.remaining !== 2) {
    throw new Error(`Expected separation to restore mobility and create the site, received ${JSON.stringify({ resolution, after })}.`);
  }
  if (resolution.unit.strength !== 90) {
    throw new Error(`Leaving casualties must not fabricate readiness; expected 90, received ${resolution.unit.strength}.`);
  }

  const heavilyBurdened = infantry("heavily-burdened", { q: 0, r: 0 }, personnelStatus(10, 0, 90, 0, 0));
  const { engine: heavilyBurdenedEngine } = engineFor([heavilyBurdened]);
  const heavyBudget = heavilyBurdenedEngine.getMovementBudget(heavilyBurdened.hex, heavilyBurdened.unitId);
  const heavyReach = heavilyBurdenedEngine.getReachableHexes(heavilyBurdened.hex, heavilyBurdened.unitId);
  if (heavyBudget?.remaining !== 0.2 || heavyReach.length !== 0) {
    throw new Error(
      `Expected a 90% burden to grant exactly 0.2 movement without the healthy one-hex exception, received ${JSON.stringify({ heavyBudget, heavyReach })}.`
    );
  }
  await Then("wounded and damaged survivors impose a linear burden while killed and destroyed assets do not", () => {});
});

registerTest("RECOVERY_SITES_PERSIST_AND_HOSTILE_GROUND_ENTRY_WIPES_THEM_OUT", async ({ Then }) => {
  const unit = infantry("site-source", { q: 0, r: 0 }, personnelStatus(95, 0, 5, 0, 0));
  const { engine, config } = engineFor([unit]);
  const left = engine.leaveCasualtiesBehind(unit.hex, unit.unitId);
  if (!left) throw new Error("Expected the casualty site to be established.");
  engine.moveUnit(unit.hex, { q: 1, r: 0 }, unit.unitId);

  const saved = engine.serialize();
  const restored = GameEngine.fromSerialized(config, saved);
  if (restored.getRecoverySiteSnapshots("Player")[0]?.siteId !== left.site.siteId) {
    throw new Error("Expected the recovery site to survive a complete tactical save round trip.");
  }

  const hostileState = structuredClone(saved);
  hostileState.recoverySites = (hostileState.recoverySites ?? []).map((site) => ({ ...site, faction: "Bot" }));
  const hostileSiteEngine = GameEngine.fromSerialized(config, hostileState);
  const move = hostileSiteEngine.moveUnit({ q: 1, r: 0 }, { q: 0, r: 0 }, unit.unitId);
  if (move.recoverySitesOverrun?.length !== 1 || hostileSiteEngine.getRecoverySiteSnapshots("Bot").length !== 0) {
    throw new Error(`Expected hostile ground entry to wipe the recovery site, received ${JSON.stringify(move)}.`);
  }
  if (!hostileSiteEngine.getRecoveryEvents().some((event) => event.type === "overrun" && event.siteId === left.site.siteId)) {
    throw new Error("Expected the overrun to remain in the deterministic recovery event record.");
  }
  await Then("recovery sites serialize and are destroyed when a hostile ground unit occupies their hex", () => {});
});

registerTest("CASUALTIES_CAN_BE_LEFT_AT_THE_FORMATIONS_CURRENT_HEX_AFTER_MOVEMENT", async ({ Then }) => {
  const unit = infantry("moving-source", { q: 0, r: 0 }, personnelStatus(95, 0, 5, 0, 0));
  const { engine } = engineFor([unit]);
  engine.moveUnit(unit.hex, { q: 1, r: 0 }, unit.unitId);
  const left = engine.leaveCasualtiesBehind({ q: 1, r: 0 }, unit.unitId);
  if (!left || left.site.hex.q !== 1 || left.site.hex.r !== 0) {
    throw new Error(`Expected the explicit order to establish a site at the formation's current hex, received ${JSON.stringify(left)}.`);
  }
  await Then("the separation option remains available at the current location after moving", () => {});
});

registerTest("MEDICS_MOVE_TO_RECOVERY_SITES_AND_FORM_BATTLE_LOCAL_DETACHMENTS", async ({ Then }) => {
  const source = infantry("medical-source", { q: 0, r: 0 }, personnelStatus(98, 2, 0, 0, 0));
  const medic: ScenarioUnit = {
    type: "Supply_Truck",
    unitId: "medic-team",
    formationKey: "medic",
    controlledBy: "AI",
    hex: { q: 3, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 0,
    fuel: 60,
    entrench: 0,
    facing: "W"
  };
  const { engine } = engineFor([source, medic]);
  if (!engine.leaveCasualtiesBehind(source.hex, source.unitId)) {
    throw new Error("Expected injured personnel to establish a medical recovery site.");
  }

  (engine as any).applyAutomaticMedicalAndRepair("Player");
  const movedMedic = engine.playerUnits.find((unit) => unit.unitId === medic.unitId);
  const recovered = engine.playerUnits.find((unit) => unit.recoverySourceUnitId === source.unitId);
  if (!movedMedic || movedMedic.hex.q >= medic.hex.q || !recovered) {
    throw new Error(`Expected the medic to advance and form a recovered detachment, received ${JSON.stringify(engine.playerUnits)}.`);
  }
  if (recovered.strength !== 2 || recovered.campaignProvenance) {
    throw new Error(`Expected a battle-local 2% detachment without campaign identity, received ${JSON.stringify(recovered)}.`);
  }
  if (engine.getRecoverySiteSnapshots("Player").length !== 0) {
    throw new Error("Expected a fully treated recovery site to leave no pending payload.");
  }
  const eventTypes = engine.getRecoveryEvents().map((event) => event.type);
  if (!eventTypes.includes("treated") || !eventTypes.includes("reconstituted")) {
    throw new Error(`Expected treatment and reconstitution events, received ${JSON.stringify(eventTypes)}.`);
  }
  await Then("medical support physically reaches the site and recovered personnel form a new tactical unit", () => {});
});

registerTest("MAINTENANCE_RECOVERS_EQUIPMENT_INTO_A_PROPORTIONAL_BATTLE_LOCAL_DETACHMENT", async ({ Then }) => {
  const vehicleStatus: FormationStatus = {
    personnel: { crew: { fit: 120, injured: 0, wounded: 0, severelyWounded: 0, killed: 0 } },
    equipment: { vehicles: { operational: 18, damaged: 2, disabled: 0, destroyed: 0 } },
    capacity: { personnel: { crew: 120 }, equipment: { vehicles: 20 } },
    ammo: {},
    suppression: 0,
    readinessModel: { basis: "platform", personnelWeight: 1, equipmentWeight: 1 }
  };
  const source = vehicle("repair-source", { q: 0, r: 0 }, vehicleStatus);
  const maintenance: ScenarioUnit = {
    type: "Supply_Truck",
    unitId: "maintenance-team",
    formationKey: "maintenance",
    controlledBy: "AI",
    hex: { q: 3, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 0,
    fuel: 60,
    entrench: 0,
    facing: "W"
  };
  const { engine } = engineFor([source, maintenance]);
  if (!engine.leaveCasualtiesBehind(source.hex, source.unitId)) {
    throw new Error("Expected damaged equipment to establish a maintenance recovery site.");
  }

  (engine as any).applyAutomaticMedicalAndRepair("Player");
  const movedMaintenance = engine.playerUnits.find((unit) => unit.unitId === maintenance.unitId);
  const recovered = engine.playerUnits.find((unit) => unit.recoverySourceUnitId === source.unitId);
  if (!movedMaintenance || movedMaintenance.hex.q >= maintenance.hex.q || !recovered) {
    throw new Error(`Expected maintenance to advance and form a recovered equipment detachment, received ${JSON.stringify(engine.playerUnits)}.`);
  }
  if (recovered.strength !== 10 || recovered.status?.equipment.vehicles?.operational !== 2 || recovered.campaignProvenance) {
    throw new Error(`Expected two of twenty repaired vehicles to form a battle-local 10% detachment, received ${JSON.stringify(recovered)}.`);
  }
  if (!engine.getRecoveryEvents().some((event) => event.type === "repaired") || engine.getRecoverySiteSnapshots("Player").length !== 0) {
    throw new Error("Expected repair evidence and a depleted equipment recovery site.");
  }
  await Then("maintenance physically recovers repaired equipment without requiring fabricated personnel", () => {});
});

registerTest("BROKEN_UNITS_AUTOMATICALLY_LEAVE_CASUALTIES_AND_RETREAT", async ({ Then }) => {
  const attacker = infantry("suppressor", { q: 0, r: 0 }, personnelStatus(5, 0, 0, 0, 95));
  const defender = infantry("rout-target", { q: 1, r: 0 }, personnelStatus(20, 0, 5, 0, 75));
  defender.suppressedBy = ["prior-suppressor"];
  defender.facing = "W";
  const { engine } = engineFor([attacker], [defender]);
  const preview = engine.previewAttack(attacker.hex, defender.hex, "suppressive", attacker.unitId, defender.unitId);
  if (preview?.retaliationPossible !== false || preview.retaliationNote !== "Target is routed and cannot return fire.") {
    throw new Error(`Expected preview to classify the second suppressor as a rout, received ${JSON.stringify(preview)}.`);
  }
  const attack = engine.attackUnit(attacker.hex, defender.hex, "suppressive", attacker.unitId, defender.unitId);
  if (!attack || attack.defenderDestroyed) {
    throw new Error(`Expected a surviving defender to break under the second suppressor, received ${JSON.stringify(attack)}.`);
  }
  const routed = engine.botUnits.find((unit) => unit.unitId === defender.unitId);
  const site = engine.getRecoverySiteSnapshots("Bot").find((entry) => entry.sourceUnitId === defender.unitId);
  if (!routed || (routed.hex.q === defender.hex.q && routed.hex.r === defender.hex.r) || site?.cause !== "rout") {
    throw new Error(`Expected automatic separation and deterministic retreat, received ${JSON.stringify({ routed, site })}.`);
  }
  if (attack.retaliationOccurred) {
    throw new Error("A routed unit must not return fire from the abandoned hex.");
  }

  const botAttacker = infantry("bot-suppressor", { q: 2, r: 0 }, personnelStatus(5, 0, 0, 0, 95));
  const playerDefender = infantry("player-rout-target", { q: 1, r: 0 }, personnelStatus(20, 0, 5, 0, 75));
  playerDefender.suppressedBy = ["prior-bot-suppressor"];
  const { engine: botEngine } = engineFor([playerDefender], [botAttacker]);
  const liveBotAttacker = botEngine.botUnits.find((unit) => unit.unitId === botAttacker.unitId);
  if (!liveBotAttacker) {
    throw new Error("Expected the Bot suppressor to be deployed for the shared transition check.");
  }
  const botAttack = (botEngine as unknown as {
    resolveBotAttack(
      unit: ScenarioUnit,
      from: { q: number; r: number },
      target: { q: number; r: number },
      stance: "suppressive"
    ): { retaliationOccurred: boolean } | null;
  }).resolveBotAttack(liveBotAttacker, botAttacker.hex, playerDefender.hex, "suppressive");
  const routedPlayer = botEngine.playerUnits.find((unit) => unit.unitId === playerDefender.unitId);
  const playerSite = botEngine.getRecoverySiteSnapshots("Player").find(
    (entry) => entry.sourceUnitId === playerDefender.unitId
  );
  if (
    !botAttack
    || !routedPlayer
    || (routedPlayer.hex.q === playerDefender.hex.q && routedPlayer.hex.r === playerDefender.hex.r)
    || playerSite?.cause !== "rout"
    || botAttack.retaliationOccurred
  ) {
    throw new Error(
      `Expected Bot suppressive fire to use the same rout transaction, received ${JSON.stringify({ botAttack, routedPlayer, playerSite })}.`
    );
  }
  await Then("the existing broken transition becomes a real rout with automatic casualty separation", () => {});
});
