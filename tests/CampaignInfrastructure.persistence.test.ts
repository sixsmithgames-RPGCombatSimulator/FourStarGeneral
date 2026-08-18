/** Certifies C20-025 tactical damage persistence, capacity degradation, capture disruption, and typed reconstruction. */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import {
  createCampaignRuntime,
  splitLegacyCampaignScenario
} from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { resolveCampaignSegment } from "../src/game/campaign/runtime/CampaignSegmentResolver";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import {
  assertCampaignBattleInfrastructureReport
} from "../src/game/campaign/infrastructure/CampaignBattleInfrastructureResolver";
import { refreshCampaignInfrastructureState } from "../src/game/campaign/infrastructure/CampaignInfrastructureRules";
import { extractCampaignBattleResultPackage } from "../src/game/campaign/results/CampaignBattleResultExtractor";
import {
  commitFixture,
  missionStatus,
  scenarioFixture,
  tacticalStateFixture
} from "./CampaignBattleResultExtraction.test.js";

registerTest("CAMPAIGN_INFRASTRUCTURE_PERSISTS_TACTICAL_DAMAGE_AND_CAPTURE_DISRUPTION", async ({ Given, When, Then }) => {
  const { campaign, runtime, pkg } = commitFixture();
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tacticalStateFixture(runtime, pkg),
    missionStatus,
    result: "attackerVictory"
  });

  await Given("a fortified campaign hex and a terminal tactical result reporting 35 percent structural integrity", () => {});
  await When("the battle accounting, control, and infrastructure resolvers commit atomically", () => {
    campaign.applyCampaignBattleResult(result);
  });
  await Then("the captured installation retains damage, loses capacity, and exposes no hidden enemy condition", () => {
    const after = campaign.getRuntimeSnapshot();
    const consequence = campaign.getCampaignBattleConsequenceReport(result.engagementId);
    const control = campaign.getCampaignBattleControlReport(result.engagementId);
    const report = campaign.getCampaignBattleInfrastructureReport(result.engagementId);
    if (!after || !consequence || !control || !report) throw new Error("Complete infrastructure audit was not retained.");
    assertCampaignBattleInfrastructureReport(report, result, consequence, control);
    const infrastructure = after.tiles["1,0"]?.infrastructure;
    if (!infrastructure
      || infrastructure.integrity !== 35
      || infrastructure.maxIntegrity !== 100
      || infrastructure.damageState !== "severelyDamaged"
      || infrastructure.effectiveness !== 0.35
      || infrastructure.captureDisruptionUntilSegment !== 8
      || report.capacityBefore.fortificationStrength !== 1
      || report.capacityAfter.fortificationStrength !== 0.35
      || report.damageAssessments[0]?.integrityLost !== 65
      || report.controllerAfter !== "Player"
      || validateCampaignRuntimeState(after).length > 0) {
      throw new Error("Structural loss, capture disruption, capacity audit, or runtime invariants are incorrect.");
    }
    const playerView = campaign.getCampaignMapView("Player");
    const botView = campaign.getCampaignMapView("Bot");
    const playerTile = playerView?.scenario.tiles.find((tile) => tile.hex.q === 1 && tile.hex.r === 0);
    const hiddenPlayerTile = botView?.scenario.tiles.find((tile) => tile.hex.q === 1 && tile.hex.r === 0);
    if (playerTile?.infrastructure?.integrity !== 35 || hiddenPlayerTile?.infrastructure) {
      throw new Error("Faction projections leaked enemy facility condition or hid friendly condition.");
    }
  });
});

registerTest("CAMPAIGN_INFRASTRUCTURE_REPAIR_ORDER_COSTS_PROGRESS_AND_COMPLETES", async ({ Given, When, Then }) => {
  const { campaign, runtime, pkg } = commitFixture();
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tacticalStateFixture(runtime, pkg),
    missionStatus,
    result: "attackerVictory"
  });
  campaign.applyCampaignBattleResult(result);
  const beforeDraft = campaign.getRuntimeSnapshot();
  if (!beforeDraft) throw new Error("Repair fixture runtime is unavailable.");
  let orderId = "";
  let suppliesAfterCommit = -1;
  let manpowerAfterCommit = -1;
  let supervisingFormationId = "";

  await Given("a damaged friendly fort, sufficient resources, and a ready occupying formation", () => {
    const preview = campaign.getCampaignInfrastructureStatus("1,0");
    if (!preview?.canDraftRepair || preview.repairPoints !== 65 || preview.repairRate !== 8
      || preview.durationSegments !== 9 || preview.suppliesCost !== 130 || preview.manpowerCost !== 260) {
      throw new Error("Repair preview did not expose exact engineer, cost, rate, and ETA rules.");
    }
    supervisingFormationId = preview.engineerFormationId ?? "";
  });
  await When("headquarters drafts, commits, and advances the reconstruction order to completion", () => {
    const drafted = campaign.createInfrastructureRepairDraft("1,0");
    if (!drafted.ok || !drafted.order.validation.valid) {
      throw new Error(drafted.ok ? "Valid repair draft unexpectedly conflicted." : drafted.reason);
    }
    orderId = drafted.order.id;
    const committed = campaign.commitCampaignOrders([orderId]);
    if (!committed.ok) throw new Error(committed.reason);
    const committedRuntime = campaign.getRuntimeSnapshot();
    if (!committedRuntime) throw new Error("Committed repair runtime is unavailable.");
    suppliesAfterCommit = committedRuntime.factions.Player.economy.supplies;
    manpowerAfterCommit = committedRuntime.factions.Player.economy.manpower;
    if (suppliesAfterCommit !== beforeDraft.factions.Player.economy.supplies - 130
      || manpowerAfterCommit !== beforeDraft.factions.Player.economy.manpower - 260) {
      throw new Error("Repair resources were not charged exactly once at commitment.");
    }
    for (let segment = 0; segment < 9; segment += 1) {
      const advanced = campaign.advanceSegment();
      if (!advanced.ok) throw new Error(`${advanced.error.message} ${JSON.stringify(advanced.issues)}`);
      if (segment === 0 && advanced.state.tiles["1,0"].infrastructure?.integrity !== 43) {
        throw new Error("Repair did not progress at the authored per-segment rate.");
      }
      if (segment === 0) {
        const activeStatus = campaign.getCampaignInfrastructureStatus("1,0");
        if (!activeStatus
          || activeStatus.suppliesCost !== 130
          || activeStatus.manpowerCost !== 260
          || activeStatus.completeSegment !== 9
          || activeStatus.engineerFormationId !== supervisingFormationId) {
          throw new Error("Active reconstruction UI projection did not preserve frozen cost, ETA, and supervisor facts.");
        }
      }
    }
  });
  await Then("resources are charged once, capacity recovers progressively, and reusable reservations release", () => {
    const after = campaign.getRuntimeSnapshot();
    if (!after) throw new Error("Completed repair runtime is unavailable.");
    const order = after.orders[orderId];
    const infrastructure = after.tiles["1,0"].infrastructure;
    const resources = order.reservationIds.map((id) => after.reservations[id]).filter((entry) => entry?.kind === "resource");
    const reusable = order.reservationIds.map((id) => after.reservations[id]).filter((entry) => entry?.kind !== "resource");
    if (order.status !== "completed"
      || !infrastructure
      || infrastructure.integrity !== 100
      || infrastructure.effectiveness !== 1
      || infrastructure.damageState !== "intact"
      || infrastructure.activeRepairOrderId !== null
      || suppliesAfterCommit < 0
      || manpowerAfterCommit < 0
      || resources.some((entry) => entry.status !== "consumed")
      || reusable.some((entry) => entry.status !== "released")
      || validateCampaignRuntimeState(after).length > 0) {
      throw new Error("Repair completion, resource consumption, reservation release, or recovered capacity is incorrect.");
    }
  });
});

registerTest("CAMPAIGN_INFRASTRUCTURE_DEGRADES_FROZEN_DAILY_LOGISTICS", async ({ Given, When, Then }) => {
  const scenario = scenarioFixture();
  const definition = splitLegacyCampaignScenario(scenario);
  const runtime = createCampaignRuntime(definition, {
    campaignId: "campaign_infrastructure_capacity",
    seed: 0x25c20025,
    currentSegment: 7,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 7),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 7)
    }
  });
  const hub = runtime.tiles["0,0"].infrastructure;
  if (!hub) throw new Error("Logistics hub infrastructure was not initialized.");
  hub.integrity = 55;
  refreshCampaignInfrastructureState(hub, 7);

  await Given("a logistics hub frozen at half structural effectiveness immediately before daily production", () => {});
  const resolved = resolveCampaignSegment(runtime, definition);
  await When("the daily logistics phase resolves from the frozen faction boundary", () => {});
  await Then("throughput and production use the persistent capacity factor", () => {
    if (!resolved.ok) throw new Error(resolved.error.message);
    const logisticsEvent = resolved.state.eventLog.find((event) => event.category === "logistics"
      && event.details.faction === "Player" && event.details.capacity === 2);
    if (!logisticsEvent || resolved.state.factions.Player.economy.supplies !== 502) {
      throw new Error("Damaged infrastructure did not halve frozen logistics capacity and output.");
    }
  });
});
