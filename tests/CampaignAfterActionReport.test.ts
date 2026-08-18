/** Certifies C20-027 immutable AAR history, acknowledgement, and post-battle autosave recovery. */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import { validateCampaignSaveEnvelope } from "../src/game/campaign/persistence/CampaignSaveEnvelope";
import { assertCampaignAfterActionReport } from "../src/game/campaign/aar/CampaignAfterActionReportService";
import { extractCampaignBattleResultPackage } from "../src/game/campaign/results/CampaignBattleResultExtractor";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import { commitFixture, missionStatus, tacticalStateFixture } from "./CampaignBattleResultExtraction.test.js";

registerTest("CAMPAIGN_AAR_RETAINS_PLAYER_SAFE_BEFORE_AFTER_HISTORY", async ({ Given, When, Then }) => {
  const { campaign, runtime, pkg } = commitFixture();
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tacticalStateFixture(runtime, pkg),
    missionStatus,
    result: "attackerVictory"
  });
  let revisionAfterBattle = -1;
  let integrityBeforeAcknowledgement = "";

  await Given("an integrity-checked tactical result with formation, resource, control, and infrastructure consequences", () => {});
  await When("headquarters applies the battle and acknowledges the generated report", () => {
    const applied = campaign.applyCampaignBattleResult(result);
    if (!applied.applied || applied.duplicate) throw new Error("The AAR fixture battle was not applied.");
    const report = campaign.getCampaignAfterActionReport(result.engagementId);
    const state = campaign.getRuntimeSnapshot();
    if (!report || !state) throw new Error("The applied battle did not generate campaign AAR history.");
    revisionAfterBattle = state.revision;
    integrityBeforeAcknowledgement = report.integrityHash;
    if (!campaign.acknowledgeCampaignAfterActionReport(report.reportId)) throw new Error("The report could not be acknowledged.");
  });
  await Then("the archive preserves exact friendly facts, aggregate opponent evidence, follow-up decisions, and immutable report integrity", () => {
    const reports = campaign.getCampaignAfterActionReports();
    const report = reports[0];
    const state = campaign.getRuntimeSnapshot();
    if (!report || !state) throw new Error("The campaign report archive is empty.");
    assertCampaignAfterActionReport(
      report,
      result,
      campaign.getCampaignBattleConsequenceReport(result.engagementId)!,
      campaign.getCampaignBattleControlReport(result.engagementId)!,
      campaign.getCampaignBattleInfrastructureReport(result.engagementId)!
    );
    const expectedFriendlyIds = result.formationDeltas
      .filter((entry) => entry.faction === "Player")
      .map((entry) => entry.campaignFormationId)
      .sort();
    if (report.friendlyFormations.map((entry) => entry.formationId).sort().join("|") !== expectedFriendlyIds.join("|")
      || report.opponent.formationsEngaged !== result.formationDeltas.filter((entry) => entry.faction === "Bot").length
      || report.opponent.personnelLosses <= 0
      || report.friendlyFormations.some((entry) => entry.personnelLost !== entry.personnelBefore - entry.personnelAfter)
      || report.decisionsRequired.length === 0
      || !report.acknowledged
      || report.integrityHash !== integrityBeforeAcknowledgement
      || state.revision !== revisionAfterBattle
      || validateCampaignRuntimeState(state).length > 0) {
      throw new Error("AAR facts, acknowledgement separation, decision prompts, or runtime invariants are incomplete.");
    }
    const tampered = structuredClone(report);
    Object.assign(tampered, { summary: "Tampered report" });
    let rejected = false;
    try {
      assertCampaignAfterActionReport(tampered);
    } catch {
      rejected = true;
    }
    if (!rejected) throw new Error("A tampered campaign AAR passed integrity validation.");
  });
});

registerTest("CAMPAIGN_AAR_WRITES_RECOVERABLE_POST_BATTLE_AUTOSAVE", async ({ Given, When, Then }) => {
  const backend = new InMemoryCampaignSaveBackend();
  const { campaign, runtime, pkg } = commitFixture(backend);
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tacticalStateFixture(runtime, pkg),
    missionStatus,
    result: "attackerVictory"
  });
  campaign.applyCampaignBattleResult(result);
  const timestamp = "2026-08-06T12:00:00.000Z";

  await Given("a resolved engagement whose active tactical continuation has been cleared", () => {
    if (campaign.getActiveBattleSave() !== null) throw new Error("The resolved battle still owns an active tactical save.");
  });
  await When("the tactical handoff writes its post-battle campaign autosave", async () => {
    await campaign.savePostBattleAutosave(result.engagementId, {
      timestamp,
      label: "ignored by post-battle policy",
      playTimeSeconds: 420,
      difficulty: "standard",
      commanderRosterLink: null,
      uiResumeContext: { workspace: "operations", selectedEntityId: null, mapCenter: null, mapZoom: 1.2 }
    });
  });
  await Then("the bounded autosave slot restores directly to the report location with the full immutable AAR", async () => {
    const slots = await campaign.listCampaignSaveSlots();
    const slot = slots.find((entry) => entry.slotType === "autosave" && entry.slotId.startsWith("campaign-post-battle:"));
    if (!slot || !slot.label.startsWith("Post-battle ·") || slot.display.thumbnailKey !== `campaign-aar:${result.scenarioKey}:${result.engagementId}`) {
      throw new Error("The player-facing post-battle autosave slot was not created with report metadata.");
    }
    const raw = await backend.getSave(slot.currentSaveId);
    const validation = validateCampaignSaveEnvelope(raw);
    const savedReport = validation.ok
      ? validation.envelope.payload.runtime.engagementLedger[result.engagementId]?.afterActionReport
      : null;
    const status = campaign.getPostBattleAutosaveStatus();
    if (!validation.ok
      || validation.envelope.payload.activeBattle !== null
      || validation.envelope.payload.uiResumeContext.workspace !== "theater"
      || validation.envelope.payload.uiResumeContext.selectedEntityId !== pkg.context.battleHexKey
      || !savedReport
      || status?.reportId !== savedReport.reportId
      || status.state !== "saved") {
      throw new Error("The post-battle checkpoint does not restore the complete campaign review boundary.");
    }
  });
});
