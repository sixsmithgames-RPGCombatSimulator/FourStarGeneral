import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import type { CampaignAfterActionReportPresentation } from "../src/game/campaign/aar/CampaignAfterActionReportTypes";
import type { CampaignBattleInfrastructureReport } from "../src/game/campaign/infrastructure/CampaignBattleInfrastructureTypes";
import {
  projectCampaignReportsWorkspace
} from "../src/ui/campaign/CampaignReportsWorkspaceProjection";

function reportFixture(): CampaignAfterActionReportPresentation {
  return {
    reportId: "aar-1",
    engagementId: "engagement-1",
    segment: 6,
    strategicResult: "victory",
    title: "After action: Grid 4,4",
    objectiveLabel: null,
    battleHexKey: "4,2",
    acknowledged: false,
    summary: "<script>unsafe-looking report text</script>",
    economyCharged: { manpower: 0, supplies: 5, fuel: 0, ammo: 2, airPower: 0, navalPower: 0 },
    controllerBefore: "Bot",
    controllerAfter: "Player",
    frontsBefore: 2,
    frontsAfter: 1,
    campaignPhaseBefore: "Landing",
    campaignPhaseAfter: "Expansion",
    infrastructureRole: "navalBase",
    infrastructureIntegrityBefore: 10,
    infrastructureIntegrityAfter: 10,
    infrastructureEffectivenessAfter: 0.5,
    navalSupport: [{
      sourceId: "naval-1",
      label: "Western Naval Force",
      chargesBefore: 2,
      chargesUsed: 1,
      chargesRemaining: 1,
      status: "expended",
      nextAvailableSegment: 9
    }],
    friendlyFormations: [{
      formationId: "formation-1",
      name: "Fallback formation",
      role: "attacker",
      sourceHexKey: "3,2",
      destinationHexKey: "4,2",
      personnelBefore: 100,
      personnelAfter: 88,
      personnelLost: 12,
      equipmentLost: { truck_pool: 2, armoredCar: 1, ignored: 0 },
      readinessBefore: 90,
      readinessAfter: 72,
      cohesionBefore: 85,
      cohesionAfter: 68,
      fatigueBefore: 10,
      fatigueAfter: 35,
      experienceGained: 7,
      statusAfter: "refitting",
      disposition: "withdrew",
      dispositionExplanation: "Pulled back to reorganize."
    }],
    opponent: {
      formationsEngaged: 1,
      personnelLosses: 34,
      formationsDestroyed: 0,
      formationsCaptured: 0,
      formationsWithdrew: 1
    },
    campaignScoreBefore: 10,
    campaignScoreAfter: 15,
    tacticalObjectives: [{ key: "secure", label: "Secure bridge", state: "completedPrimary" }],
    campaignObjectiveChanges: [{
      objectiveKey: "bridge",
      label: "Hold the bridge",
      statusBefore: "active",
      statusAfter: "completed",
      progressBefore: 0.5,
      progressAfter: 1,
      scoreAwarded: 5,
      explanation: "Secured."
    }],
    decisionsRequired: [
      {
        id: "repair-intact",
        severity: "attention",
        targetKind: "infrastructure",
        targetId: "4,2",
        title: "Repair the battle area",
        detail: "Should be suppressed for intact infrastructure."
      },
      {
        id: "recover-formation",
        severity: "critical",
        targetKind: "formation",
        targetId: "formation-1",
        title: "Reconstitute formation",
        detail: "Review losses and recovery."
      }
    ]
  } as unknown as CampaignAfterActionReportPresentation;
}

registerTest("CAMPAIGN_REPORTS_WORKSPACE_PROJECTS_COMPLETE_DETACHED_ARCHIVE_VIEW", async ({ Given, When, Then }) => {
  const report = reportFixture();
  const original = structuredClone(report);
  const infrastructureRequests: string[] = [];
  const formationRequests: string[] = [];
  let projected: ReturnType<typeof projectCampaignReportsWorkspace> = [];

  await Given("one immutable battle report with losses, support use, intact infrastructure, and actionable follow-up", () => {});
  await When("the Reports workspace projection is built without CampaignState or DOM access", () => {
    projected = projectCampaignReportsWorkspace({
      reports: [report],
      postBattleAutosaveStatus: { reportId: "aar-1", message: "Post-battle checkpoint saved." },
      resolveInfrastructureReport: (engagementId) => {
        infrastructureRequests.push(engagementId);
        return {
          infrastructureAfter: { integrity: 10, maxIntegrity: 10, captureDisruptionUntilSegment: 9 }
        } as unknown as CampaignBattleInfrastructureReport;
      },
      resolveLocation: () => ({
        locationHexKey: "4,4",
        presentation: {
          primaryLabel: "Sword Sector",
          secondaryGridReference: "Grid 4,4",
          detail: "Coastal operational sector"
        }
      }),
      resolveFormation: (formationId) => {
        formationRequests.push(formationId);
        return null;
      },
      formatLabel: (value) => value === "navalBase" ? "Naval base" : value,
      formatSegment: (segment) => `T${segment}`
    });
  });
  await Then("every archive fact and route is preserved while repair noise is filtered and inputs remain untouched", () => {
    assert.equal(projected.length, 1);
    const view = projected[0];
    assert.deepEqual(infrastructureRequests, ["engagement-1"]);
    assert.deepEqual(formationRequests, ["formation-1"]);
    assert.equal(view.title, "After action: Sword Sector");
    assert.equal(view.timeLabel, "T6");
    assert.equal(view.resultLabel, "Victory");
    assert.equal(view.summary, "<script>unsafe-looking report text</script>");
    assert.equal(view.location, "Sword Sector");
    assert.equal(view.locationHexKey, "4,4");
    assert.equal(view.checkpointStatus, "Post-battle checkpoint saved.");
    assert.equal(view.personnelLosses, "12");
    assert.equal(view.opponentLosses, "34");
    assert.equal(view.resourcesSpent, "5 supply · 2 ammo");
    assert.equal(view.scoreChange, "10 → 15");
    assert.deepEqual(view.operationalEffects, [
      "Control: Bot → Player",
      "Fronts: 2 → 1",
      "Naval base: captured intact · 50% operational capacity while the new garrison reorganizes · full capacity returns T9",
      "Campaign phase: Landing → Expansion",
      "Western Naval Force: 1 fire mission fired · 1 tactical charge unused · replenishes T9"
    ]);
    assert.deepEqual(view.tacticalObjectives, ["Secure bridge: completed Primary"]);
    assert.deepEqual(view.formations[0], {
      id: "formation-1",
      name: "Fallback formation",
      commandLabel: "Fallback formation",
      personnel: "88 / 100 personnel · −12",
      condition: "Readiness 90 → 72 · Cohesion 85 → 68",
      effects: ["1 armored car lost", "2 truck pool lost", "Fatigue 10 → 35", "+7 experience", "Status: refitting"],
      disposition: "withdrew · Pulled back to reorganize.",
      materiallyChanged: true
    });
    assert.deepEqual(view.objectiveChanges, ["Hold the bridge: active → completed · 100% · +5 points"]);
    assert.deepEqual(view.decisions, [{
      id: "recover-formation",
      severity: "critical",
      targetKind: "formation",
      targetId: "formation-1",
      title: "Reconstitute formation",
      detail: "Review losses and recovery."
    }]);
    assert.deepEqual(report, original);
  });
});
