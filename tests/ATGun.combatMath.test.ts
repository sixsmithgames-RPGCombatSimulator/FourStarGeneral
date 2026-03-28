import { registerTest } from "./harness.js";
import { resolveAttack, type AttackRequest, type UnitCombatState } from "../src/core/Combat";
import type { ScenarioUnit, TerrainDefinition, UnitTypeDefinition } from "../src/core/types";
import unitTypesData from "../src/data/unitTypes.json";

const plains: TerrainDefinition = {
  moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
  defense: 0,
  accMod: 0,
  blocksLOS: false
};

const unitTypes = unitTypesData as Record<string, UnitTypeDefinition>;

function makeUnitState(
  typeKey: "AT_Gun_50mm" | "Heavy_Tank",
  options?: { experience?: number; override?: Partial<UnitTypeDefinition> }
): UnitCombatState {
  const definition = unitTypes[typeKey];
  if (!definition) {
    throw new Error(`Missing unit type '${typeKey}' for AT-gun combat math test.`);
  }

  return {
    unit: {
      ...definition,
      ...options?.override
    },
    strength: 100,
    experience: options?.experience ?? 0,
    general: { accBonus: 0, dmgBonus: 0 }
  };
}

function makeAttackRequest(options?: {
  attackerOverride?: Partial<UnitTypeDefinition>;
  attackerExperience?: number;
  defenderFacing?: ScenarioUnit["facing"];
}): AttackRequest {
  const defenderFacing = options?.defenderFacing ?? "S";
  const defender = makeUnitState("Heavy_Tank");

  return {
    attacker: makeUnitState("AT_Gun_50mm", {
      experience: options?.attackerExperience ?? 1,
      override: options?.attackerOverride
    }),
    defender,
    attackerCtx: {
      hex: { q: -2, r: 0 }
    },
    defenderCtx: {
      terrain: plains,
      class: defender.unit.class,
      facing: defenderFacing,
      hex: { q: 0, r: 0 },
      isSpottedOnly: false
    },
    targetFacing: defenderFacing,
    isSoftTarget: false
  };
}

function assertClose(actual: number, expected: number, tolerance: number, label: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${label} to be ${expected} (+/- ${tolerance}), received ${actual}.`);
  }
}

registerTest("AT_GUN_50MM_500M_SHOT_USES_RANGE_TABLE_AND_PENETRATION_LIMITS", async ({ Then }) => {
  const attackerDefinition = unitTypes.AT_Gun_50mm;
  if (!attackerDefinition) {
    throw new Error("Expected AT_Gun_50mm definition to be present.");
  }
  if (attackerDefinition.ammo !== 6) {
    throw new Error(`Expected AT_Gun_50mm ammo to be 6 after the sustainment rebalance, received ${attackerDefinition.ammo}.`);
  }

  const result = resolveAttack(makeAttackRequest());

  assertClose(result.accuracyBreakdown.baseRange, 18, 0.001, "range-table base accuracy");
  assertClose(result.accuracy, 24.15, 0.001, "final accuracy");
  if (result.shots !== 120) {
    throw new Error(`Expected rebalanced AT gun profile to fire 120 shots per turn, received ${result.shots}.`);
  }
  if (result.effectiveAP !== 11) {
    throw new Error(`Expected experienced AT gun to reach 11 AP, received ${result.effectiveAP}.`);
  }
  if (result.facingArmor !== 18) {
    throw new Error(`Expected heavy tank front armor 18, received ${result.facingArmor}.`);
  }
  assertClose(result.damagePerHit, 0.22, 0.0001, "damage per hit");
  assertClose(result.expectedDamage, 6.376, 0.001, "expected damage");

  await Then("the 50mm gun keeps its 500m range-table accuracy while the higher shot volume and new ammo reserve apply cleanly", () => {});
});

registerTest("AT_GUN_50MM_DAMAGE_RESPONDS_TO_BOTH_HARD_ATTACK_AND_AP", async ({ Then }) => {
  const baseline = resolveAttack(makeAttackRequest({ defenderFacing: "N" }));
  const lowerHardAttack = resolveAttack(
    makeAttackRequest({
      defenderFacing: "N",
      attackerOverride: { hardAttack: 25 }
    })
  );
  const lowerPenetration = resolveAttack(
    makeAttackRequest({
      defenderFacing: "N",
      attackerOverride: { ap: 7 }
    })
  );

  if (baseline.facingArmor !== 10) {
    throw new Error(`Expected side armor 10 for this test setup, received ${baseline.facingArmor}.`);
  }
  if (lowerHardAttack.effectiveAP !== baseline.effectiveAP) {
    throw new Error("Changing hard attack should not change the effective AP result.");
  }
  if (lowerPenetration.effectiveAP !== 8) {
    throw new Error(`Expected reduced-AP attacker to resolve 8 AP, received ${lowerPenetration.effectiveAP}.`);
  }
  if (!(lowerHardAttack.damagePerHit < baseline.damagePerHit)) {
    throw new Error(
      `Expected lower hard attack to reduce damage per hit, received baseline ${baseline.damagePerHit} vs low-hard ${lowerHardAttack.damagePerHit}.`
    );
  }
  if (!(lowerPenetration.damagePerHit < baseline.damagePerHit)) {
    throw new Error(
      `Expected lower AP to reduce damage per hit, received baseline ${baseline.damagePerHit} vs low-AP ${lowerPenetration.damagePerHit}.`
    );
  }

  await Then("anti-tank damage falls when either hard attack or armor penetration is reduced", () => {});
});
