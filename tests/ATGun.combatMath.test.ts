import { registerTest } from "./harness.js";
import { resolveAttack, type AttackRequest, type UnitCombatState } from "../src/core/Combat";
import type { ScenarioUnit, TerrainDefinition, UnitTypeDefinition } from "../src/core/types";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";

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
  attackerHex?: { q: number; r: number };
}): AttackRequest {
  const defenderFacing = options?.defenderFacing ?? "W";
  const defender = makeUnitState("Heavy_Tank");

  return {
    attacker: makeUnitState("AT_Gun_50mm", {
      experience: options?.attackerExperience ?? 1,
      override: options?.attackerOverride
    }),
    defender,
    attackerCtx: {
      hex: options?.attackerHex ?? { q: -1, r: 0 }
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

function withAtGunApEffect(hardEffect: Partial<NonNullable<UnitTypeDefinition["weaponModel"]>["groups"][number]["hardEffect"]>): Partial<UnitTypeDefinition> {
  const definition = unitTypes.AT_Gun_50mm;
  if (!definition?.weaponModel) {
    throw new Error("Expected AT_Gun_50mm weapon model to be present.");
  }
  return {
    weaponModel: {
      ...definition.weaponModel,
      groups: definition.weaponModel.groups.map((group) => group.id === "at-gun-ap" && group.hardEffect
        ? { ...group, hardEffect: { ...group.hardEffect, ...hardEffect } }
        : group)
    }
  };
}

function assertClose(actual: number, expected: number, tolerance: number, label: string): void {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(`Expected ${label} to be ${expected} (+/- ${tolerance}), received ${actual}.`);
  }
}

registerTest("AT_GUN_LEGACY_KEY_57MM_500M_SHOT_USES_RANGE_TABLE_AND_PENETRATION_LIMITS", async ({ Then }) => {
  const attackerDefinition = unitTypes.AT_Gun_50mm;
  if (!attackerDefinition) {
    throw new Error("Expected AT_Gun_50mm definition to be present.");
  }
  if (attackerDefinition.ammo !== 6) {
    throw new Error(`Expected AT_Gun_50mm ammo to be 6 after the sustainment rebalance, received ${attackerDefinition.ammo}.`);
  }

  const result = resolveAttack(makeAttackRequest());

  assertClose(result.accuracyBreakdown.baseRange, 50, 0.001, "range-table base accuracy");
  assertClose(result.accuracy, 64.375, 0.001, "final accuracy");
  if (result.shots !== 60) {
    throw new Error(`Expected live-fire AT gun profile to fire 60 shots per turn, received ${result.shots}.`);
  }
  if (result.effectiveAP !== 13) {
    throw new Error(`Expected 57mm AT gun AP to remain at its authored value of 13, received ${result.effectiveAP}.`);
  }
  if (result.facingArmor !== 18) {
    throw new Error(`Expected heavy tank front armor 18, received ${result.facingArmor}.`);
  }
  assertClose(result.damagePerHit, 0.029668705964379694, 0.0001, "damage per hit");
  assertClose(result.expectedDamage, 1.1524811205359768, 0.001, "expected damage");

  await Then("the legacy AT-gun key resolves as a 57mm battery while front heavy armor still sharply limits damage", () => {});
});

registerTest("AT_GUN_DAMAGE_RESPONDS_TO_WEAPON_EFFECTS_AND_AP", async ({ Then }) => {
  const baseline = resolveAttack(makeAttackRequest({ defenderFacing: "NW" }));
  const lowerWeaponEffect = resolveAttack(
    makeAttackRequest({
      defenderFacing: "NW",
      attackerOverride: withAtGunApEffect({ damaged: 0.25, disabled: 0.08, destroyed: 0.02 })
    })
  );
  const lowerPenetration = resolveAttack(
    makeAttackRequest({
      defenderFacing: "NW",
      attackerOverride: withAtGunApEffect({ armorPenetration: 8 })
    })
  );

  if (baseline.facingArmor !== 10) {
    throw new Error(`Expected side armor 10 for this test setup, received ${baseline.facingArmor}.`);
  }
  if (lowerWeaponEffect.effectiveAP !== baseline.effectiveAP) {
    throw new Error("Changing damage effect should not change the effective AP result.");
  }
  if (lowerPenetration.effectiveAP !== 8) {
    throw new Error(`Expected reduced-AP attacker to resolve 8 AP, received ${lowerPenetration.effectiveAP}.`);
  }
  if (!(lowerWeaponEffect.damagePerHit < baseline.damagePerHit)) {
    throw new Error(
      `Expected lower weapon effect to reduce damage per hit, received baseline ${baseline.damagePerHit} vs low-effect ${lowerWeaponEffect.damagePerHit}.`
    );
  }
  if (!(lowerPenetration.damagePerHit < baseline.damagePerHit)) {
    throw new Error(
      `Expected lower AP to reduce damage per hit, received baseline ${baseline.damagePerHit} vs low-AP ${lowerPenetration.damagePerHit}.`
    );
  }

  await Then("anti-tank damage falls when either the authored weapon effect or armor penetration is reduced", () => {});
});
