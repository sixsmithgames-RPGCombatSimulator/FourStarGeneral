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

type SequentialUnitType = "Infantry_42" | "Engineer" | "Light_Tank" | "Tank_Destroyer";

function formationKeyForType(type: string): string | undefined {
  return formationList.find((formation) => formation.tacticalUnitType === type)?.key;
}

function makeScenarioUnit(typeKey: SequentialUnitType, hex: Axial, id: string): ScenarioUnit {
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

function makeCombatState(typeKey: SequentialUnitType): UnitCombatState {
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

function buildAttackRequest(attackerType: SequentialUnitType, attackerHex: Axial, defender: ScenarioUnit): AttackRequest {
  const defenderType = unitTypes[defender.type];
  return {
    attacker: makeCombatState(attackerType),
    defender: {
      unit: defenderType,
      strength: defender.strength,
      experience: defender.experience,
      general: { accBonus: 0, dmgBonus: 0 }
    },
    attackerCtx: { hex: attackerHex, stance: "assault" },
    defenderCtx: {
      terrain: plains,
      class: defenderType.class,
      facing: defender.facing,
      hex: defender.hex,
      isRushing: false,
      isSpottedOnly: false
    },
    targetFacing: defender.facing,
    isSoftTarget: defenderType.class === "infantry" || defenderType.class === "specialist",
    useTheoreticalShots: false
  };
}

registerTest("SEQUENTIAL_IDENTICAL_ATTACK_DAMAGE_IS_MONOTONIC_UNTIL_TERMINAL_CAP", async ({ Given, When, Then }) => {
  const defender = makeScenarioUnit("Infantry_42", { q: 11, r: 9 }, "seq-defender");
  const attackerHex: Axial = { q: 12, r: 9 };
  const strikeCount = 7;

  const losses: number[] = [];
  const readinessBeforeStrike: number[] = [];
  const expectedHits: number[] = [];
  const appliedLosses: number[] = [];
  const transitionReplayMismatches: number[] = [];

  await Given("a fresh infantry formation and one unchanged adjacent infantry assault profile", async () => {
    const summary = summarizeFormationStatus(defender.status, defender.strength);
    if (summary.personnel.fit !== summary.personnel.total || summary.readiness !== 100) {
      throw new Error(`Unexpected starting state for sequential progression test (fit ${summary.personnel.fit}, readiness ${summary.readiness}).`);
    }
  });

  await When("fresh identical infantry attackers strike that defender repeatedly from the same range", async () => {
    Array.from({ length: strikeCount }, (_, index) => index).forEach((index) => {
      const attacker = makeScenarioUnit("Infantry_42", attackerHex, `seq-inf-${index + 1}`);
      const before = summarizeFormationStatus(defender.status, defender.strength);
      const attackResult = resolveAttack(buildAttackRequest("Infantry_42", attackerHex, defender));
      const packet = resolveDamagePacket({
        attacker,
        attackerDefinition: unitTypes.Infantry_42,
        attackerHex,
        defender,
        defenderDefinition: unitTypes.Infantry_42,
        defenderHex: defender.hex,
        attackResult,
        targetFacing: defender.facing,
        attackerStance: "assault"
      });
      readinessBeforeStrike.push(before.readiness);
      expectedHits.push(attackResult.expectedHits);
      losses.push(packet.readinessLoss);
      const transitionReplay = structuredClone(defender);
      applyDamagePacketToUnit(transitionReplay, {
        ...packet,
        personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
        equipment: { damaged: 0, disabled: 0, destroyed: 0 }
      });
      applyDamagePacketToUnit(defender, packet);
      const after = summarizeFormationStatus(defender.status, defender.strength);
      appliedLosses.push(Math.round((before.readiness - after.readiness) * 100) / 100);
      if (JSON.stringify(transitionReplay.status) !== JSON.stringify(defender.status)
        || transitionReplay.strength !== defender.strength) {
        transitionReplayMismatches.push(index + 1);
      }
    });
  });

  await Then("each identical follow-up removes at least the baseline readiness unless only a smaller terminal remainder exists", async () => {
    if (losses.length !== strikeCount) {
      throw new Error("Sequential progression test did not execute all planned strikes.");
    }

    const firstLoss = losses[0] ?? 0;
    if (firstLoss <= 0) {
      throw new Error("The baseline identical assault must inflict measurable readiness loss.");
    }
    expectedHits.forEach((hits, index) => {
      if (Math.abs(hits - (expectedHits[0] ?? hits)) > 0.01) {
        throw new Error(`Identical assault inputs produced different expected hits at strike ${index + 1}: ${expectedHits.map((value) => value.toFixed(2)).join(", ")}.`);
      }
      if (Math.abs((appliedLosses[index] ?? 0) - (losses[index] ?? 0)) > 0.01) {
        throw new Error(`Resolved and applied readiness diverged at strike ${index + 1}: packets ${losses.join(", ")}, applied ${appliedLosses.join(", ")}.`);
      }
      const terminalCap = Math.min(firstLoss, readinessBeforeStrike[index] ?? 0);
      if ((losses[index] ?? 0) < terminalCap - 0.01) {
        throw new Error(
          `Identical strike ${index + 1} fell below the baseline before the terminal cap: ` +
          `readiness before ${readinessBeforeStrike[index]?.toFixed(2)}, expected at least ${terminalCap.toFixed(2)}, ` +
          `losses ${losses.map((value) => value.toFixed(2)).join(", ")}.`
        );
      }
      if ((losses[index] ?? 0) > (readinessBeforeStrike[index] ?? 0) + 0.01) {
        throw new Error(`Strike ${index + 1} exceeded the defender's remaining readiness.`);
      }
    });

    if (!readinessBeforeStrike.some((readiness) => readiness > 0 && readiness < firstLoss)) {
      throw new Error(`Sequence never exercised the terminal readiness cap (${readinessBeforeStrike.join(", ")}).`);
    }
    if (transitionReplayMismatches.length > 0) {
      throw new Error(`Authoritative transition replay diverged on strikes ${transitionReplayMismatches.join(", ")}.`);
    }
  });
});

registerTest("RESOLVED_DAMAGE_TRANSITION_VALIDATION_IS_ATOMIC", async ({ When, Then }) => {
  const defender = makeScenarioUnit("Infantry_42", { q: 11, r: 9 }, "invalid-transition-defender");
  const statusBefore = structuredClone(defender.status);
  const strengthBefore = defender.strength;
  let errorMessage = "";

  await When("a corrupted resolved packet requires more fit personnel than the formation contains", async () => {
    const fit = summarizeFormationStatus(defender.status, defender.strength).personnel.fit;
    try {
      applyDamagePacketToUnit(defender, {
        personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: fit + 1 },
        equipment: { damaged: 0, disabled: 0, destroyed: 0 },
        suppression: 10,
        fortificationDamage: 0,
        readinessLoss: 100,
        weaponHits: [],
        statusTransitions: {
          personnel: [{ from: "fit", to: "killed", count: fit + 1 }],
          equipment: []
        }
      });
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  });

  await Then("the engine rejects the ledger before changing status, strength, or suppression", async () => {
    if (!errorMessage.includes("Cannot apply") || !errorMessage.includes("only")) {
      throw new Error(`Expected an actionable transition-integrity error, got '${errorMessage}'.`);
    }
    if (JSON.stringify(defender.status) !== JSON.stringify(statusBefore) || defender.strength !== strengthBefore) {
      throw new Error("Invalid resolved transitions partially mutated the defender before rejection.");
    }
  });
});

registerTest("SEQUENTIAL_DAMAGE_MONOTONICITY_COVERS_PERSONNEL_COMBINED_AND_PLATFORM_UNITS", async ({ When, Then }) => {
  const attackerHex: Axial = { q: 12, r: 9 };
  const defenderHex: Axial = { q: 11, r: 9 };
  const cases: ReadonlyArray<{
    readonly attackerType: SequentialUnitType;
    readonly defenderType: SequentialUnitType;
  }> = [
    { attackerType: "Infantry_42", defenderType: "Infantry_42" },
    { attackerType: "Infantry_42", defenderType: "Engineer" },
    { attackerType: "Light_Tank", defenderType: "Light_Tank" },
    { attackerType: "Tank_Destroyer", defenderType: "Light_Tank" }
  ];
  const failures: string[] = [];

  await When("identical attacks are replayed against personnel, combined, and platform readiness models", async () => {
    cases.forEach(({ attackerType, defenderType }) => {
      const defender = makeScenarioUnit(defenderType, defenderHex, `seq-${defenderType}-defender`);
      let baselineLoss = 0;
      let baselineHits = 0;
      for (let strike = 1; strike <= 8 && defender.strength > 0; strike += 1) {
        const attacker = makeScenarioUnit(attackerType, attackerHex, `seq-${attackerType}-${strike}`);
        const before = summarizeFormationStatus(defender.status, defender.strength).readiness;
        const attackResult = resolveAttack(buildAttackRequest(attackerType, attackerHex, defender));
        const packet = resolveDamagePacket({
          attacker,
          attackerDefinition: unitTypes[attackerType],
          attackerHex,
          defender,
          defenderDefinition: unitTypes[defenderType],
          defenderHex,
          attackResult,
          targetFacing: defender.facing,
          attackerStance: "assault"
        });
        if (strike === 1) {
          baselineLoss = packet.readinessLoss;
          baselineHits = attackResult.expectedHits;
        } else {
          const requiredLoss = Math.min(baselineLoss, before);
          if (Math.abs(attackResult.expectedHits - baselineHits) > 0.01) {
            failures.push(`${attackerType}->${defenderType} strike ${strike} changed expected hits ${baselineHits.toFixed(2)}->${attackResult.expectedHits.toFixed(2)}`);
          }
          if (packet.readinessLoss < requiredLoss - 0.01) {
            failures.push(`${attackerType}->${defenderType} strike ${strike} fell ${baselineLoss.toFixed(2)}->${packet.readinessLoss.toFixed(2)} with ${before.toFixed(2)} remaining`);
          }
        }
        applyDamagePacketToUnit(defender, packet);
        const after = summarizeFormationStatus(defender.status, defender.strength).readiness;
        if (Math.abs((before - after) - packet.readinessLoss) > 0.01) {
          failures.push(`${attackerType}->${defenderType} strike ${strike} preview/application mismatch ${packet.readinessLoss.toFixed(2)} vs ${(before - after).toFixed(2)}`);
        }
      }
      if (baselineLoss <= 0) {
        failures.push(`${attackerType}->${defenderType} did not establish a positive baseline loss`);
      }
    });
  });

  await Then("no tracked readiness model turns accumulated damage into protection", async () => {
    if (failures.length > 0) {
      throw new Error(`Sequential readiness invariants failed:\n${failures.join("\n")}`);
    }
  });
});
