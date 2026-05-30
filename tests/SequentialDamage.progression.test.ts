import { registerTest } from "./harness.js";
import { resolveAttack, type AttackRequest, type UnitCombatState } from "../src/core/Combat";
import type { Axial, ScenarioUnit, TerrainDefinition, UnitTypeDefinition } from "../src/core/types";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import { applyDamagePacketToUnit, resolveDamagePacket, summarizeFormationStatus } from "../src/data/unitSystem/damagePackets";
import { createInitialFormationStatus } from "../src/data/unitSystem/status";
import { formationList } from "../src/data/unitSystem/formations";

const unitTypes = unitTypesData as Record<string, UnitTypeDefinition>;
const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

function formationKeyForType(type: string): string | undefined {
  return formationList.find((formation) => formation.tacticalUnitType === type)?.key;
}

function makeScenarioUnit(typeKey: "Infantry_42" | "Light_Tank" | "Tank_Destroyer", hex: Axial, id: string): ScenarioUnit {
  const definition = unitTypes[typeKey];
  if (!definition) {
    throw new Error(`Missing '${typeKey}' definition for sequential damage progression test.`);
  }
  const formationKey = formationKeyForType(typeKey);
  return {
    type: typeKey,
    hex: structuredClone(hex),
    strength: 100,
    experience: definition.baseExperience ?? 0,
    baseExperience: definition.baseExperience ?? 0,
    earnedExperience: 0,
    ammo: definition.ammo,
    fuel: definition.fuel,
    entrench: 0,
    facing: "W",
    unitId: id,
    formationKey,
    status: createInitialFormationStatus(typeKey, formationKey)
  };
}

function makeCombatState(typeKey: "Infantry_42" | "Light_Tank" | "Tank_Destroyer"): UnitCombatState {
  const definition = unitTypes[typeKey];
  if (!definition) {
    throw new Error(`Missing '${typeKey}' combat definition for sequential damage progression test.`);
  }
  return {
    unit: definition,
    strength: 100,
    experience: definition.baseExperience ?? 0,
    general: { accBonus: 0, dmgBonus: 0 }
  };
}

function buildAttackRequest(attackerType: "Light_Tank" | "Tank_Destroyer", attackerHex: Axial, defender: ScenarioUnit): AttackRequest {
  const defenderType = unitTypes.Infantry_42;
  return {
    attacker: makeCombatState(attackerType),
    defender: {
      unit: defenderType,
      strength: defender.strength,
      experience: defender.experience,
      general: { accBonus: 0, dmgBonus: 0 }
    },
    attackerCtx: { hex: attackerHex },
    defenderCtx: {
      terrain: plains,
      class: defenderType.class,
      facing: defender.facing,
      hex: defender.hex,
      isRushing: false,
      isSpottedOnly: false
    },
    targetFacing: defender.facing,
    isSoftTarget: true,
    useTheoreticalShots: false
  };
}

registerTest("SEQUENTIAL_MULTI_ATTACKER_DAMAGE_REMAINS_STABLE_UNTIL_FIT_POOL_IS_NEAR_EXHAUSTED", async ({ Given, When, Then }) => {
  const defender = makeScenarioUnit("Infantry_42", { q: 11, r: 9 }, "seq-defender");
  applyDamagePacketToUnit(defender, {
    personnel: { injured: 120, wounded: 80, severelyWounded: 20, killed: 10 },
    equipment: { damaged: 0, disabled: 0, destroyed: 0 },
    suppression: 0,
    fortificationDamage: 0,
    readinessLoss: 0,
    weaponHits: []
  });

  const sequence: Array<{ type: "Light_Tank" | "Tank_Destroyer"; hex: Axial; id: string }> = [
    { type: "Light_Tank", hex: { q: 12, r: 9 }, id: "seq-lt-1" },
    { type: "Light_Tank", hex: { q: 10, r: 9 }, id: "seq-lt-2" },
    { type: "Light_Tank", hex: { q: 11, r: 8 }, id: "seq-lt-3" },
    { type: "Light_Tank", hex: { q: 11, r: 10 }, id: "seq-lt-4" },
    { type: "Tank_Destroyer", hex: { q: 12, r: 10 }, id: "seq-td-5" }
  ];

  const losses: number[] = [];
  const fitBeforeStrike: number[] = [];
  const expectedHits: number[] = [];

  await Given("an already-damaged infantry battalion with a substantial remaining fit pool", async () => {
    const summary = summarizeFormationStatus(defender.status, defender.strength);
    if (summary.personnel.fit < 450 || summary.readiness > 85 || summary.readiness < 70) {
      throw new Error(`Unexpected starting state for sequential progression test (fit ${summary.personnel.fit}, readiness ${summary.readiness}).`);
    }
  });

  await When("several armored attackers strike the same defender in sequence", async () => {
    sequence.forEach((entry) => {
      const attacker = makeScenarioUnit(entry.type, entry.hex, entry.id);
      const before = summarizeFormationStatus(defender.status, defender.strength);
      const attackResult = resolveAttack(buildAttackRequest(entry.type, entry.hex, defender));
      const packet = resolveDamagePacket({
        attacker,
        attackerDefinition: unitTypes[entry.type],
        attackerHex: entry.hex,
        defender,
        defenderDefinition: unitTypes.Infantry_42,
        defenderHex: defender.hex,
        attackResult,
        targetFacing: defender.facing
      });
      fitBeforeStrike.push(before.personnel.fit);
      expectedHits.push(attackResult.expectedHits);
      losses.push(packet.readinessLoss);
      applyDamagePacketToUnit(defender, packet);
    });
  });

  await Then("damage does not prematurely collapse while many fit personnel remain and only falls once fit is nearly exhausted", async () => {
    if (losses.length < 5) {
      throw new Error("Sequential progression test did not execute all planned strikes.");
    }

    if (expectedHits[1] < expectedHits[0] * 0.95 || expectedHits[2] < expectedHits[1] * 0.95) {
      throw new Error(`Unexpected hit-chance collapse during adjacent light-tank sequence (${expectedHits.map((value) => value.toFixed(1)).join(", ")}).`);
    }

    if (losses[1] < losses[0] * 0.85) {
      throw new Error(`Second adjacent light-tank strike degraded too early (${losses.map((value) => value.toFixed(2)).join(", ")}).`);
    }

    if (fitBeforeStrike[2] > 180 && losses[2] < losses[1] * 0.85) {
      throw new Error(`Third light-tank strike should stay stable while fit reserves remain (${fitBeforeStrike[2]} fit, losses ${losses.map((value) => value.toFixed(2)).join(", ")}).`);
    }

    if (fitBeforeStrike[3] >= fitBeforeStrike[2]) {
      throw new Error(`Expected fit pool to continue depleting across sustained strikes (${fitBeforeStrike.join(", ")}).`);
    }

    if (losses[3] >= losses[2] * 0.9) {
      throw new Error(`Expected fourth strike to begin tapering once fit pool is nearly depleted (${losses.map((value) => value.toFixed(2)).join(", ")}).`);
    }

    if (losses[4] <= 0) {
      throw new Error("Final mixed-unit follow-up strike should still inflict measurable readiness loss.");
    }
  });
});
