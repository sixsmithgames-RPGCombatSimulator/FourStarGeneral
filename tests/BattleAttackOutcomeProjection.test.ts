import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { AttackResult } from "../src/core/Combat";
import type { ScenarioUnit } from "../src/core/types";
import {
  projectBattleAttackOutcome,
  type BotAttackOutcomeProjection,
  type CombatDamageSummary,
  type PlayerAttackOutcomeProjection,
  type PlayerAttackOutcomeProjectionInput
} from "../src/game/battle/combat/BattleAttackOutcomeProjection";
import { registerTest } from "./harness.js";

function unit(type: ScenarioUnit["type"], q: number): ScenarioUnit {
  return {
    type,
    hex: { q, r: 0 },
    strength: 10,
    experience: 1,
    ammo: 5,
    fuel: 4,
    entrench: 0,
    facing: "E"
  };
}

function attackResult(accuracy: number): AttackResult {
  return {
    accuracy,
    shots: 4,
    damagePerHit: 1.5,
    expectedHits: 2,
    expectedDamage: 3,
    expectedSuppression: 1,
    effectiveAP: 2,
    facingArmor: 1,
    accuracyBreakdown: {
      baseRange: accuracy,
      commanderScalar: 1,
      afterCommander: accuracy,
      experienceScalar: 1,
      afterExperience: accuracy,
      terrainModifier: 0,
      terrainMultiplier: 1,
      afterTerrain: accuracy,
      spottedMultiplier: 1,
      finalPreClamp: accuracy,
      final: accuracy
    },
    damageBreakdown: {
      baseTableValue: 1.5,
      experienceScalar: 1,
      afterExperience: 1.5,
      commanderScalar: 1,
      final: 1.5
    }
  };
}

function damageSummary(summary: string, strengthAfter: number): CombatDamageSummary {
  const personnel = {
    fit: strengthAfter,
    injured: 1,
    wounded: 0,
    severelyWounded: 0,
    killed: 1,
    total: strengthAfter + 2,
    casualties: 1,
    nonEffective: 2,
    effective: strengthAfter,
    readiness: strengthAfter / (strengthAfter + 2)
  };
  const equipment = {
    operational: strengthAfter,
    damaged: 1,
    disabled: 0,
    destroyed: 1,
    total: strengthAfter + 2,
    losses: 1,
    nonOperational: 2,
    effective: strengthAfter,
    readiness: strengthAfter / (strengthAfter + 2)
  };
  const readinessBreakdown = {
    basis: "combined" as const,
    personnelWeight: 0.5,
    equipmentWeight: 0.5,
    personnel: {
      total: personnel.total,
      effective: personnel.effective,
      readiness: personnel.readiness,
      loss: 2
    },
    equipment: {
      total: equipment.total,
      effective: equipment.effective,
      readiness: equipment.readiness,
      loss: 2
    }
  };
  return {
    strengthBefore: 10,
    strengthAfter,
    readinessLoss: 10 - strengthAfter,
    statusBefore: {
      personnel: { ...personnel, fit: 10, injured: 0, killed: 0, total: 10, casualties: 0, nonEffective: 0, effective: 10, readiness: 1 },
      equipment: { ...equipment, operational: 10, damaged: 0, destroyed: 0, total: 10, losses: 0, nonOperational: 0, effective: 10, readiness: 1 },
      suppression: 0,
      readiness: 1,
      readinessBreakdown: {
        basis: "combined",
        personnelWeight: 0.5,
        equipmentWeight: 0.5,
        personnel: { total: 10, effective: 10, readiness: 1, loss: 0 },
        equipment: { total: 10, effective: 10, readiness: 1, loss: 0 }
      }
    },
    statusAfter: {
      personnel,
      equipment,
      suppression: 1,
      readiness: strengthAfter / 10,
      readinessBreakdown
    },
    personnel: { injured: 1, wounded: 0, severelyWounded: 0, killed: 1 },
    equipment: { damaged: 1, disabled: 0, destroyed: 1 },
    suppression: 1,
    fortificationDamage: 0,
    weaponHits: [],
    damageTypesUsed: ["kinetic"],
    summary
  };
}

function playerInput(): PlayerAttackOutcomeProjectionInput {
  const damage = damageSummary("Defender lost readiness", 7);
  const retaliationDamage = damageSummary("Attacker lost readiness", 8);
  return {
    kind: "player",
    attacker: {
      unit: unit("Infantry_42", 0),
      hex: { q: 0, r: 0 },
      faction: "Player",
      strengthBefore: 10,
      strengthAfter: 8
    },
    defender: {
      unit: unit("Infantry_42", 1),
      hex: { q: 1, r: 0 },
      faction: "Bot",
      strengthBefore: 10,
      strengthAfter: 7,
      destroyed: false
    },
    attackResult: attackResult(0.625),
    defenderDamage: damage,
    primaryRetaliationResult: attackResult(0.445),
    primaryRetaliationDamage: retaliationDamage,
    primaryRetaliationOccurred: true,
    retaliationOccurred: true,
    retaliationNote: "Enemy returned fire.",
    targetRichDefenders: [{
      unitId: "bot-1",
      unitType: "Infantry_42",
      remainingStrength: 7,
      destroyed: false,
      expectedDamage: 3,
      damage,
      retaliationDamage: 2,
      retaliation: retaliationDamage,
      retaliationOccurred: true
    }],
    totalDefenderDamage: 3,
    totalRetaliationDamage: 2
  };
}

registerTest("BATTLE_ATTACK_OUTCOME_PROJECTS_EXACT_PLAYER_AND_BOT_CONTRACTS", async ({ Given, When, Then }) => {
  const player = playerInput();
  let playerProjection!: PlayerAttackOutcomeProjection;
  let botProjection!: BotAttackOutcomeProjection;

  await Given("resolved player and Bot attacks with explicit primary and aggregate results", () => {});
  await When("both attack paths delegate to the shared outcome projector", () => {
    playerProjection = projectBattleAttackOutcome(player);
    botProjection = projectBattleAttackOutcome({
      ...player,
      kind: "bot",
      attacker: { ...player.attacker, faction: "Bot" },
      defender: { ...player.defender, faction: "Player" },
      representativeRetaliationResult: attackResult(0.445),
      allDefendersDestroyed: true
    });
  });
  await Then("the player and Bot summaries preserve their distinct historic output semantics", () => {
    assert.deepEqual(playerProjection.summary, {
      result: player.attackResult,
      defenderRemainingStrength: 7,
      defenderDestroyed: false,
      defenderDamage: player.defenderDamage,
      retaliationResult: player.primaryRetaliationResult,
      attackerRemainingStrength: 8,
      retaliationDamage: player.primaryRetaliationDamage,
      retaliationOccurred: true,
      retaliationNote: "Enemy returned fire.",
      targetRich: false,
      targetRichDefenders: player.targetRichDefenders,
      totalDefenderDamage: 3,
      totalRetaliationDamage: 2
    });
    assert.deepEqual(botProjection.summary, {
      attackerType: "Infantry_42",
      defenderType: "Infantry_42",
      from: { q: 0, r: 0 },
      target: { q: 1, r: 0 },
      inflictedDamage: 3,
      damageSummary: "Defender lost readiness",
      defenderDamage: player.defenderDamage,
      defenderDestroyed: true,
      retaliation: {
        damage: 2,
        summary: "Attacker lost readiness",
        damageSummary: player.primaryRetaliationDamage,
        terrainDefense: 0,
        accuracyMod: 45,
        attackerStrengthAfter: 8
      }
    });
    assert.deepEqual(playerProjection.report.retaliationResult, player.primaryRetaliationResult);
    assert.deepEqual(botProjection.report.retaliationDamage, player.primaryRetaliationDamage);
  });
});

registerTest("BATTLE_ATTACK_OUTCOME_OUTPUTS_ARE_DETACHED_AND_SINGLE_AUTHORITY", async ({ Given, When, Then }) => {
  const input = playerInput();
  const original = structuredClone(input);
  const projection = projectBattleAttackOutcome(input);

  await Given("one mutable resolved-attack input snapshot", () => {});
  await When("the source and projected objects are mutated independently", () => {
    input.attacker.unit.hex.q = 99;
    (input.attackResult.accuracyBreakdown as { final: number }).final = 0;
    (projection.summary.result.accuracyBreakdown as { final: number }).final = 1;
    (projection.report.attacker.hex as { q: number }).q = 77;
  });
  await Then("report and summary projections share no mutable state with their source or each other", () => {
    assert.equal(projection.summary.result.accuracyBreakdown.final, 1);
    assert.equal(projection.report.attackResult.accuracyBreakdown.final, original.attackResult.accuracyBreakdown.final);
    assert.equal(projection.summary.targetRichDefenders?.[0]?.damage?.statusAfter.personnel.fit, 7);
    assert.equal(projection.report.attacker.unit.hex.q, 0);
    assert.equal(input.attacker.hex.q, 0);
    assert.equal(input.attackResult.accuracyBreakdown.final, 0);
  });

  const source = readFileSync("src/game/GameEngine.ts", "utf8");
  const playerBody = source.slice(source.indexOf("private resolvePlayerAttack("), source.indexOf("  /** Resolve a basic attack"));
  const botBody = source.slice(source.indexOf("private resolveBotAttack("), source.indexOf("  /** Ensures bot supply mirror"));
  await Then("each engine attack path has exactly one shared-projector delegation", () => {
    assert.equal(playerBody.match(/projectBattleAttackOutcome\(/g)?.length, 1);
    assert.equal(botBody.match(/projectBattleAttackOutcome\(/g)?.length, 1);
    assert.doesNotMatch(playerBody, /targetRich:\s*targetRichDefenders\.length/);
    assert.doesNotMatch(botBody, /accuracyMod:\s*Math\.round\(representativeRetaliationResult/);
  });
});
