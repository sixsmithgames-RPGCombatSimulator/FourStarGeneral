/** Certifies C20-023 atomic formation, support, economy, history, rollback, and shortfall consequences. */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { runCampaignRuntimeTransaction } from "../src/game/campaign/runtime/CampaignRuntimeTransaction";
import {
  applyCampaignBattleConsequences,
  assertCampaignBattleConsequenceReport
} from "../src/game/campaign/consequences/CampaignBattleConsequenceResolver";
import { extractCampaignBattleResultPackage } from "../src/game/campaign/results/CampaignBattleResultExtractor";
import {
  commitFixture,
  missionStatus,
  tacticalStateFixture
} from "./CampaignBattleResultExtraction.test.js";

registerTest("CAMPAIGN_BATTLE_CONSEQUENCES_APPLY_EXACT_FACTS_AND_CONSERVE_STOCK", async ({ Given, When, Then }) => {
  const { campaign, runtime, pkg } = commitFixture();
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tacticalStateFixture(runtime, pkg),
    missionStatus,
    result: "attackerVictory"
  });
  const playerEconomyBefore = structuredClone(runtime.factions.Player.economy);
  const botEconomyBefore = structuredClone(runtime.factions.Bot.economy);
  let revisionAfterFirst = -1;

  await Given("a complete tactical result with persistent formations and recoverable support payload", () => {});

  await When("the result is applied and then delivered again", () => {
    const first = campaign.applyCampaignBattleResult(result);
    if (!first.applied || first.duplicate) throw new Error("The first consequence transaction was not applied.");
    revisionAfterFirst = campaign.getRuntimeSnapshot()?.revision ?? -1;
    const duplicate = campaign.applyCampaignBattleResult(result);
    if (duplicate.applied || !duplicate.duplicate) throw new Error("Duplicate battle consequences were not a no-op.");
  });

  await Then("formations, history, support refunds, and both faction economies reconcile exactly once", () => {
    const after = campaign.getRuntimeSnapshot();
    const report = campaign.getCampaignBattleConsequenceReport(result.engagementId);
    if (!after || !report) throw new Error("The consequence report was not retained.");
    assertCampaignBattleConsequenceReport(report, result);
    if (after.revision !== revisionAfterFirst
      || after.engagements[result.engagementId]
      || after.engagementLedger[result.engagementId]?.status !== "resolved"
      || after.engagementLedger[result.engagementId]?.terminalRevision !== after.revision) {
      throw new Error("The engagement did not close once at the consequence revision.");
    }
    const attackerDelta = result.formationDeltas.find((entry) => entry.role === "attacker")!;
    const defenderDelta = result.formationDeltas.find((entry) => entry.role === "defender")!;
    const defenderConsequence = report.formationConsequences.find(
      (entry) => entry.campaignFormationId === defenderDelta.campaignFormationId
    );
    const attacker = after.formations[attackerDelta.campaignFormationId];
    const defender = after.formations[defenderDelta.campaignFormationId];
    if (attacker.status !== "ready"
      || defender.status !== "captured"
      || defenderConsequence?.statusAfter !== "shattered"
      || computeCampaignContentHash(attacker.personnel) !== computeCampaignContentHash(attackerDelta.personnelStatusAfter)
      || computeCampaignContentHash(defender.equipment) !== computeCampaignContentHash(defenderDelta.equipmentStatusAfter)
      || !attacker.battleHistory.some((entry) => entry.type === "battle" && entry.engagementId === result.engagementId)
      || !defender.battleHistory.some((entry) => entry.type === "battle" && entry.engagementId === result.engagementId)) {
      throw new Error("Persistent formation condition, lifecycle, or history did not match tactical truth.");
    }
    const support = report.supportConsequences[0];
    if (!support || support.reservedRequisitionPoints !== 30
      || support.consumedRequisitionPoints !== 5
      || support.refundedRequisitionPoints !== 25
      || support.resourcePayloadConsumed.ammo !== 6) {
      throw new Error("Recoverable support payload did not conserve its RP and material accounting.");
    }
    const playerAfter = after.factions.Player.economy;
    const botAfter = after.factions.Bot.economy;
    if (playerAfter.manpower !== playerEconomyBefore.manpower
      || playerAfter.supplies !== playerEconomyBefore.supplies - 5
      || playerAfter.fuel !== playerEconomyBefore.fuel - 2
      || playerAfter.ammo !== playerEconomyBefore.ammo - 6
      || botAfter.manpower !== botEconomyBefore.manpower
      || botAfter.ammo !== botEconomyBefore.ammo - 3) {
      throw new Error("Faction stock changed by a coarse, duplicate, or incorrect battle charge.");
    }
    if (!report.deferred.controlResolutionPending || !after.engagementLedger[result.engagementId]?.controlReport) {
      throw new Error("C20-023 did not hand its immutable accounting to C20-024 in the same transaction.");
    }
  });
});

registerTest("CAMPAIGN_BATTLE_CONSEQUENCES_RETAIN_DESTROYED_FORMATION_IDENTITY", async ({ Given, When, Then }) => {
  const { campaign, runtime, pkg } = commitFixture();
  const tactical = tacticalStateFixture(runtime, pkg);
  const defenderUnit = tactical.casualtyLog?.[0]?.unit;
  if (!defenderUnit?.status) throw new Error("The destroyed-formation fixture has no casualty status.");
  Object.values(defenderUnit.status.personnel).forEach((pool) => {
    pool.killed += pool.fit + pool.injured + pool.wounded + pool.severelyWounded;
    pool.fit = 0;
    pool.injured = 0;
    pool.wounded = 0;
    pool.severelyWounded = 0;
  });
  Object.values(defenderUnit.status.equipment).forEach((pool) => {
    pool.destroyed += pool.operational + pool.damaged + pool.disabled;
    pool.operational = 0;
    pool.damaged = 0;
    pool.disabled = 0;
  });
  defenderUnit.strength = 0;
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tactical,
    missionStatus,
    result: "attackerVictory"
  });
  const defenderDelta = result.formationDeltas.find((entry) => entry.role === "defender")!;

  await Given("a committed formation whose final tactical tombstone has no survivors or recoverable equipment", () => {});

  await When("the terminal battle result enters the campaign", () => {
    campaign.applyCampaignBattleResult(result);
  });

  await Then("the formation leaves map projection but remains permanently auditable", () => {
    const after = campaign.getRuntimeSnapshot();
    const formation = after?.formations[defenderDelta.campaignFormationId];
    if (!after || !formation || formation.status !== "destroyed" || formation.locationHexKey !== null
      || formation.retiredSegment !== after.currentSegment
      || after.tiles[pkg.context.battleHexKey]?.formationIds.includes(formation.id)
      || !formation.battleHistory.some((entry) => entry.type === "battle" && entry.engagementId === result.engagementId)
      || !formation.battleHistory.some((entry) => entry.type === "retired" && entry.engagementId === null)) {
      throw new Error("Destroyed formation identity, placement, or terminal history was not preserved correctly.");
    }
  });
});

registerTest("CAMPAIGN_BATTLE_CONSEQUENCES_ROLL_BACK_STALE_FORMATION_BASELINES", async ({ Given, When, Then }) => {
  const { runtime, pkg } = commitFixture();
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tacticalStateFixture(runtime, pkg),
    missionStatus,
    result: "attackerVictory"
  });
  const stale = structuredClone(runtime);
  const attackerId = pkg.formationCommitments.find((entry) => entry.role === "attacker")!.formationId;
  stale.formations[attackerId].supply.ammo += 1;
  const safeHash = computeCampaignContentHash(stale);
  let rejected = false;

  await Given("a valid runtime whose committed formation condition drifted after the frozen baseline", () => {});

  await When("the resolver attempts the stale result inside the campaign transaction boundary", () => {
    const transaction = runCampaignRuntimeTransaction(
      stale,
      "test:stale-battle-consequence",
      (draft) => applyCampaignBattleConsequences(draft, result).events
    );
    rejected = !transaction.ok;
    if (computeCampaignContentHash(transaction.state) !== safeHash) {
      throw new Error("Rejected consequence application did not retain the exact safe runtime.");
    }
  });

  await Then("the whole consequence transaction is rejected without a partial formation or economy write", () => {
    if (!rejected) throw new Error("A stale committed formation baseline was accepted.");
  });
});

registerTest("CAMPAIGN_BATTLE_CONSEQUENCES_EXPOSE_RESOURCE_SHORTFALLS_WITHOUT_NEGATIVE_STOCK", async ({ Given, When, Then }) => {
  const { runtime, pkg } = commitFixture();
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tacticalStateFixture(runtime, pkg),
    missionStatus,
    result: "attackerVictory"
  });
  const depleted = structuredClone(runtime);
  depleted.factions.Player.economy.supplies = 0;
  depleted.factions.Player.economy.fuel = 1;
  depleted.factions.Player.economy.ammo = 2;
  depleted.factions.Bot.economy.ammo = 0;
  let report = null as ReturnType<typeof applyCampaignBattleConsequences>["report"] | null;

  await Given("a battle result that exceeds the remaining campaign stock at handoff", () => {});

  await When("the authoritative result is applied instead of discarded or silently clamped", () => {
    const transaction = runCampaignRuntimeTransaction(
      depleted,
      "test:battle-resource-shortfall",
      (draft) => {
        const applied = applyCampaignBattleConsequences(draft, result);
        report = applied.report;
        return applied.events;
      }
    );
    if (!transaction.ok) throw transaction.error;
    if (Object.values(transaction.state.factions.Player.economy).some((value) => typeof value === "number" && value < 0)) {
      throw new Error("Battle accounting created a negative campaign stock.");
    }
  });

  await Then("the audit distinguishes charged stock from the explicit emergency shortfall", () => {
    const player = report?.economyConsequences.Player;
    const bot = report?.economyConsequences.Bot;
    if (!player || !bot
      || player.charged.supplies !== 0 || player.shortfall.supplies !== 5
      || player.charged.fuel !== 1 || player.shortfall.fuel !== 1
      || player.charged.ammo !== 2 || player.shortfall.ammo !== 4
      || bot.charged.ammo !== 0 || bot.shortfall.ammo !== 3) {
      throw new Error("Resource shortfalls were not retained as exact player-visible accounting facts.");
    }
  });
});
