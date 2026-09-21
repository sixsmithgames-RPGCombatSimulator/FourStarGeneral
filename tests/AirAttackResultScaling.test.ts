import assert from "node:assert/strict";
import type { AttackResult } from "../src/core/Combat";
import { scaleAirAttackResult } from "../src/game/battle/combat/AirAttackResultScaling";
import { registerTest } from "./harness.js";

function attackResult(): AttackResult {
  return {
    accuracy: 0.55,
    shots: 12,
    damagePerHit: 1.25,
    expectedHits: 4,
    expectedDamage: 5,
    expectedSuppression: 2.5,
    effectiveAP: 8,
    facingArmor: 3,
    accuracyBreakdown: {
      baseRange: 0.5,
      commanderScalar: 1,
      afterCommander: 0.5,
      experienceScalar: 1.1,
      afterExperience: 0.55,
      terrainModifier: 0,
      terrainMultiplier: 1,
      afterTerrain: 0.55,
      spottedMultiplier: 1,
      finalPreClamp: 0.55,
      final: 0.55
    },
    damageBreakdown: {
      baseTableValue: 1.25,
      experienceScalar: 1,
      afterExperience: 1.25,
      commanderScalar: 1,
      final: 1.25
    }
  };
}

registerTest("AIR_ATTACK_RESULT_SCALING_PRESERVES_ALL_FOUR_PROFILES", async ({ Given, When, Then }) => {
  const source = attackResult();
  const sourceBefore = structuredClone(source);
  let bomberVsGround: AttackResult;
  let fighterVsAircraft: AttackResult;
  let bomberVsAircraft: AttackResult;
  let groundVsGround: AttackResult;

  await Given("one resolved attack result and explicit attacker/defender classifications", () => {});

  await When("the shared deterministic projection applies every existing air profile", () => {
    bomberVsGround = scaleAirAttackResult(source, {
      attackerIsAircraft: true,
      attackerIsBomber: true,
      defenderIsAircraft: false
    });
    fighterVsAircraft = scaleAirAttackResult(source, {
      attackerIsAircraft: true,
      attackerIsBomber: false,
      defenderIsAircraft: true
    });
    bomberVsAircraft = scaleAirAttackResult(source, {
      attackerIsAircraft: true,
      attackerIsBomber: true,
      defenderIsAircraft: true
    });
    groundVsGround = scaleAirAttackResult(source, {
      attackerIsAircraft: false,
      attackerIsBomber: false,
      defenderIsAircraft: false
    });
  });

  await Then("only damage, expected damage, and suppression receive the historic multipliers", () => {
    assert.deepEqual(bomberVsGround, {
      ...source,
      damagePerHit: 12.5,
      expectedDamage: 50,
      expectedSuppression: 25
    });
    assert.deepEqual(fighterVsAircraft, {
      ...source,
      damagePerHit: 5,
      expectedDamage: 20,
      expectedSuppression: 10
    });
    assert.strictEqual(bomberVsAircraft, source);
    assert.strictEqual(groundVsGround, source);
    assert.deepEqual(source, sourceBefore);
  });
});
