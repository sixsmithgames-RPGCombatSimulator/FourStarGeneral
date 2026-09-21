import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { ScenarioUnit } from "../src/core/types";
import {
  projectBattleRetaliation,
  type BattleRetaliationProjectionInput
} from "../src/game/battle/combat/BattleRetaliationProjection";
import { registerTest } from "./harness.js";

function unit(strength: number, ammo = 3): ScenarioUnit {
  return {
    type: "Infantry_42",
    unitId: `unit-${strength}-${ammo}`,
    hex: { q: 1, r: 0 },
    strength,
    experience: 1,
    ammo,
    fuel: 4,
    entrench: 1,
    facing: "E"
  };
}

function baselineInput(): BattleRetaliationProjectionInput {
  return {
    defenderBefore: { ...unit(10), onSentry: false },
    defenderAfter: { ...unit(7), onSentry: false },
    resolvedFacing: "W",
    defenderWasOnSentry: false,
    defenderBecameBroken: false,
    attackerStrength: 8,
    attackerIsAircraft: false,
    defenderIsAircraft: false,
    defenderIsBomber: false,
    defenderTowBlocked: false,
    defenderPinnedOrBroken: false,
    distance: 1,
    rangeMin: 1,
    rangeMax: 1,
    retaliationAvailable: true,
    ammunition: { kind: "ground", available: 3, cost: 1 }
  };
}

registerTest("BATTLE_RETALIATION_PROJECTION_PRESERVES_ORDERED_RULE_AND_NOTE_PARITY", async ({ Given, When, Then }) => {
  const base = baselineInput();

  await Given("resolved combat facts covering every historic retaliation gate", () => {});
  await When("the canonical projector evaluates ordinary, sentry, range, limit, and ammunition cases", () => {});
  await Then("the exact gate priority and player-facing notes remain stable", () => {
    const allowed = projectBattleRetaliation(base);
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.blockReason, undefined);
    assert.equal(allowed.note, undefined);
    assert.equal(allowed.defender.strength, 7);
    assert.equal(allowed.defender.facing, "W");
    assert.equal(allowed.defender.onSentry, false);

    const sentry = projectBattleRetaliation({
      ...base,
      defenderWasOnSentry: true,
      defenderPinnedOrBroken: true,
      defenderAfter: { ...base.defenderAfter, strength: 0 }
    });
    assert.equal(sentry.allowed, true);
    assert.equal(sentry.defender.strength, 10);
    assert.equal(sentry.successNote, "Enemy unit was on sentry and returned fire simultaneously.");
    assert.equal(
      sentry.lineOfFireFailureNote,
      "Enemy unit was on sentry, but enemy unit lacked line of fire for retaliation."
    );

    const sentryBrokenByIncomingFire = projectBattleRetaliation({
      ...base,
      defenderBefore: { ...base.defenderBefore, onSentry: true },
      defenderAfter: { ...base.defenderAfter, suppressedBy: ["attacker-a", "attacker-b"] },
      defenderWasOnSentry: true,
      defenderBecameBroken: true,
      defenderPinnedOrBroken: false
    });
    assert.equal(sentryBrokenByIncomingFire.allowed, true);
    assert.equal(sentryBrokenByIncomingFire.blockReason, undefined);
    assert.equal(sentryBrokenByIncomingFire.defender.strength, base.defenderBefore.strength);

    const brokenPriority = projectBattleRetaliation({
      ...base,
      defenderBecameBroken: true,
      defenderTowBlocked: true
    });
    assert.equal(brokenPriority.blockReason, "defenderBroken");
    assert.equal(brokenPriority.note, "Enemy unit routed and cannot return fire.");
    assert.equal(
      projectBattleRetaliation({ ...base, attackerIsAircraft: true }).blockReason,
      "aircraftAgainstGround"
    );
    assert.equal(projectBattleRetaliation({ ...base, defenderTowBlocked: true }).blockReason, "defenderTowed");
    assert.equal(projectBattleRetaliation({ ...base, defenderPinnedOrBroken: true }).blockReason, "defenderPinned");
    const livePinTow = projectBattleRetaliation({
      ...base,
      defenderTowBlocked: true,
      defenderPinnedOrBroken: true
    });
    assert.equal(livePinTow.blockReason, "defenderTowed");
    assert.equal(livePinTow.note, "Enemy unit is limbered and cannot return fire until deployed.");
    const previewPinTow = projectBattleRetaliation({
      ...base,
      defenderTowBlocked: true,
      defenderPinnedOrBroken: true,
      notePerspective: "target",
      pinTowPriority: "pinFirst",
      pinnedBlocksSentry: true
    });
    assert.equal(previewPinTow.blockReason, "defenderPinned");
    assert.equal(previewPinTow.note, "Target is pinned and cannot return fire.");
    assert.equal(projectBattleRetaliation({ ...base, distance: 2 }).blockReason, "outOfRange");
    assert.equal(projectBattleRetaliation({ ...base, retaliationAvailable: false }).blockReason, "limitExhausted");
    assert.equal(
      projectBattleRetaliation({
        ...base,
        defenderIsAircraft: true,
        ammunition: { kind: "aircraft", needsRearm: true, airShots: 0 }
      }).blockReason,
      "aircraftRearming"
    );
    assert.equal(
      projectBattleRetaliation({
        ...base,
        defenderIsAircraft: true,
        ammunition: { kind: "aircraft", needsRearm: false, airShots: 0 }
      }).blockReason,
      "aircraftAmmoDepleted"
    );
    const indirectAmmo = projectBattleRetaliation({
      ...base,
      ammunition: { kind: "ground", available: 1, cost: 2 }
    });
    assert.equal(indirectAmmo.blockReason, "groundAmmoDepleted");
    assert.equal(indirectAmmo.note, "Enemy unit lacks the 2 ammo needed to return indirect fire.");

    const bomberReturnFire = projectBattleRetaliation({
      ...base,
      attackerIsAircraft: true,
      defenderIsAircraft: true,
      defenderIsBomber: true,
      distance: 2,
      ammunition: { kind: "aircraft", needsRearm: false, airShots: 1 }
    });
    assert.equal(bomberReturnFire.allowed, true);

    const targetCopy = projectBattleRetaliation({
      ...base,
      defenderTowBlocked: true,
      defenderWasOnSentry: true,
      notePerspective: "target"
    });
    assert.equal(
      targetCopy.note,
      "Target is on sentry, but target is limbered and cannot return fire until deployed."
    );
  });
});

registerTest("BATTLE_RETALIATION_PROJECTION_IS_DETACHED_AND_DELEGATED_EXACTLY_ONCE", async ({ Given, When, Then }) => {
  const input = baselineInput();
  const projection = projectBattleRetaliation(input);

  await Given("mutable before-and-after defender snapshots", () => {});
  await When("source and projected units are mutated independently", () => {
    input.defenderAfter.hex.q = 9;
    input.defenderBefore.strength = 1;
    projection.defender.hex.r = 8;
    projection.defender.ammo = 0;
  });
  await Then("neither side aliases the other", () => {
    assert.deepEqual(projection.defender.hex, { q: 1, r: 8 });
    assert.equal(projection.defender.strength, 7);
    assert.equal(input.defenderAfter.hex.r, 0);
    assert.equal(input.defenderAfter.ammo, 3);
  });

  const source = readFileSync("src/game/GameEngine.ts", "utf8");
  const previewBody = source.slice(
    source.indexOf("private previewRetaliationForPlayerAttack("),
    source.indexOf("private resolveMoveCost(")
  );
  const playerBody = source.slice(source.indexOf("private resolvePlayerAttack("), source.indexOf("  /** Resolve a basic attack"));
  const botBody = source.slice(source.indexOf("private resolveBotAttack("), source.indexOf("  /** Ensures bot supply mirror"));
  await Then("both live attack coordinators delegate once without retaining a fallback rules path", () => {
    assert.equal(playerBody.match(/projectBattleRetaliation\(/g)?.length, 1);
    assert.equal(botBody.match(/projectBattleRetaliation\(/g)?.length, 1);
    assert.equal(previewBody.match(/projectBattleRetaliation\(/g)?.length, 1);
    assert.match(previewBody, /pinTowPriority:\s*"pinFirst"/);
    assert.match(previewBody, /pinnedBlocksSentry:\s*true/);
    assert.doesNotMatch(playerBody, /let retaliationAllowed/);
    assert.doesNotMatch(botBody, /let retaliationAllowed/);
    assert.doesNotMatch(playerBody, /defenderRangeMax/);
    assert.doesNotMatch(botBody, /defenderRangeMax/);
    assert.doesNotMatch(previewBody, /defenderRangeMax|noteFor\s*=/);
    assert.match(playerBody, /resolveAttack\(retaliationReq\)/);
    assert.match(botBody, /resolveAttack\(retaliationReq\)/);
  });
});
