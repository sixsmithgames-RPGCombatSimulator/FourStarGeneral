/** Certifies C20-024 occupation, retreat, isolation, tile-control, and derived-front behavior. */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type {
  CampaignEngagementContext,
  CampaignPendingEngagement,
  CampaignScenarioData
} from "../src/core/campaignTypes";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import {
  assertCampaignBattleControlReport,
  deriveCampaignFrontsFromControl
} from "../src/game/campaign/control/CampaignBattleControlResolver";
import { extractCampaignBattleResultPackage } from "../src/game/campaign/results/CampaignBattleResultExtractor";
import type { CampaignRuntimeState } from "../src/game/campaign/runtime/campaignRuntimeTypes";
import { CampaignState } from "../src/state/CampaignState";
import {
  commitFixture,
  contextFixture,
  missionStatus,
  scenarioFixture,
  tacticalStateFixture
} from "./CampaignBattleResultExtraction.test.js";

type CommittedFixture = {
  campaign: CampaignState;
  runtime: CampaignRuntimeState;
  pkg: NonNullable<ReturnType<CampaignState["getActiveCampaignBattlePackage"]>>;
};

function commitScenario(
  scenario: CampaignScenarioData,
  context: CampaignEngagementContext = contextFixture()
): CommittedFixture {
  const campaign = new CampaignState({ legacyStorage: null });
  campaign.setScenario(scenario);
  const engagement: CampaignPendingEngagement = {
    id: context.engagementId,
    frontKey: context.frontKey,
    objectiveKey: context.objectiveKey,
    attacker: context.attacker,
    defender: context.defender,
    hexKeys: [context.battleHexKey],
    tags: ["control-certification"],
    context
  };
  campaign.setPendingEngagements([engagement]);
  campaign.setActiveEngagementId(engagement.id);
  const planned = campaign.getRuntimeSnapshot();
  if (!planned) throw new Error("Campaign control fixture did not create runtime truth.");
  const committed = campaign.commitCampaignEngagement({
    engagementId: engagement.id,
    expectedRevision: planned.revision,
    selections: [
      { allocationKey: "infantry", category: "units", quantity: 1, unitRpCost: 50 },
      { allocationKey: "ammo", category: "supplies", quantity: 1, unitRpCost: 30 }
    ]
  });
  if (!committed.ok) throw new Error(committed.reason);
  const runtime = campaign.getRuntimeSnapshot();
  if (!runtime) throw new Error("Committed campaign control fixture was unavailable.");
  return { campaign, runtime, pkg: committed.package };
}

function retreatAndIsolationScenario(): CampaignScenarioData {
  const scenario = scenarioFixture();
  scenario.key = "control-retreat";
  scenario.title = "Control Retreat";
  scenario.dimensions = { cols: 5, rows: 3 };
  scenario.tilePalette.playerRegion = {
    role: "region",
    factionControl: "Player",
    supplyValue: 0
  };
  scenario.tiles.push(
    { tile: "bot", factionControl: "Bot", hex: { q: 2, r: 0 }, forces: [] },
    {
      tile: "playerRegion",
      factionControl: "Player",
      hex: { q: 4, r: 0 },
      forces: [{ unitType: "Infantry_42", count: 1, label: "Island Garrison" }]
    }
  );
  return scenario;
}

registerTest("FSG_CAM_050_DERIVED_FRONTS_USE_PERIOD_BELLIGERENT_NAMES", async ({ Given, When, Then }) => {
  const reversedScenario = scenarioFixture();
  reversedScenario.key = "front-label-reversed";
  reversedScenario.tiles.reverse();
  const scenarios = [scenarioFixture(), reversedScenario];

  await Given("opposing Allied and German control cells in either authored tile order without a surviving front label", () => {});

  let labels: string[] = [];
  await When("the operational boundary derives a new player-facing front", () => {
    labels = scenarios.flatMap((scenario) => {
      const campaign = new CampaignState({ legacyStorage: null });
      campaign.setScenario(scenario);
      const runtime = campaign.getRuntimeSnapshot();
      if (!runtime) throw new Error("Campaign front-label fixture did not create runtime truth.");
      runtime.compatibility.initialFronts.splice(0, runtime.compatibility.initialFronts.length);
      return deriveCampaignFrontsFromControl(runtime).map((front) => front.label);
    });
  });

  await Then("the front uses period belligerent language and never exposes internal faction keys", () => {
    if (labels.length !== 2
      || labels.some((label) => label !== "Allied–German Front")
      || labels.some((label) => /\b(?:Player|Bot)\b/.test(label))) {
      throw new Error(`Derived front leaked internal faction identity: ${labels.join(", ")}`);
    }
  });
});

registerTest("CAMPAIGN_BATTLE_CONTROL_CAPTURES_NO_ROUTE_DEFENDER_AND_OCCUPIES_HEX", async ({ Given, When, Then }) => {
  const { campaign, runtime, pkg } = commitFixture();
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tacticalStateFixture(runtime, pkg),
    missionStatus,
    result: "attackerVictory"
  });
  const attackerId = pkg.formationCommitments.find((entry) => entry.role === "attacker")!.formationId;
  const defenderId = pkg.formationCommitments.find((entry) => entry.role === "defender")!.formationId;

  await Given("an attacker victory whose displaced defender has no adjacent friendly-controlled retreat tile", () => {});

  await When("the accounting and operational result commit in one campaign transaction", () => {
    campaign.applyCampaignBattleResult(result);
  });

  await Then("the attacker occupies, the trapped defender is captured, and the obsolete front disappears", () => {
    const after = campaign.getRuntimeSnapshot();
    const consequence = campaign.getCampaignBattleConsequenceReport(result.engagementId);
    const control = campaign.getCampaignBattleControlReport(result.engagementId);
    if (!after || !consequence || !control) throw new Error("The complete battle resolution audit was not retained.");
    assertCampaignBattleControlReport(control, result, consequence);
    const defenderDisposition = control.formationDispositions.find(
      (entry) => entry.campaignFormationId === defenderId
    );
    if (after.tiles["1,0"]?.controller !== "Player"
      || after.formations[attackerId]?.locationHexKey !== "1,0"
      || after.formations[defenderId]?.status !== "captured"
      || after.formations[defenderId]?.locationHexKey !== null
      || control.occupationOutcome !== "satisfied"
      || control.occupyingFormationId !== attackerId
      || defenderDisposition?.disposition !== "capturedNoRoute"
      || control.frontsAfter.length !== 0
      || after.compatibility.initialFronts.length !== 0) {
      throw new Error("Occupation, no-route capture, or derived-front removal was incorrect.");
    }
  });
});

registerTest("CAMPAIGN_BATTLE_CONTROL_RETREATS_WITH_WEAR_AND_RECOMPUTES_ISOLATION", async ({ Given, When, Then }) => {
  const { campaign, runtime, pkg } = commitScenario(retreatAndIsolationScenario());
  const tactical = tacticalStateFixture(runtime, pkg);
  const defenderUnit = tactical.casualtyLog?.[0]?.unit;
  const disabledPool = defenderUnit?.status ? Object.values(defenderUnit.status.equipment)[0] : null;
  if (!disabledPool || disabledPool.operational < 1) throw new Error("Retreat fixture has no equipment to disable.");
  disabledPool.operational -= 1;
  disabledPool.disabled += 1;
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tactical,
    missionStatus,
    result: "attackerVictory"
  });
  const defenderId = pkg.formationCommitments.find((entry) => entry.role === "defender")!.formationId;

  await Given("a supplied fallback tile and a separate friendly island without a supply path", () => {});

  await When("victory changes the control graph", () => {
    campaign.applyCampaignBattleResult(result);
  });

  await Then("the defender takes deterministic retreat wear, the island is isolated, and the front follows the real border", () => {
    const after = campaign.getRuntimeSnapshot();
    const control = campaign.getCampaignBattleControlReport(result.engagementId);
    if (!after || !control) throw new Error("The retreat control report was not retained.");
    const retreat = control.formationDispositions.find((entry) => entry.campaignFormationId === defenderId);
    const island = after.formationOrder
      .map((id) => after.formations[id])
      .find((formation) => formation?.origin.legacyLabel === "Island Garrison");
    const front = control.frontsAfter[0];
    if (retreat?.disposition !== "retreated"
      || retreat.destinationHexKey !== "2,0"
      || !retreat.retreatOptions[0]?.legal
      || !retreat.retreatOptions[0]?.supplied
      || retreat.readinessAfter !== Math.max(0, retreat.readinessBefore - 10)
      || retreat.cohesionAfter !== Math.max(0, retreat.cohesionBefore - 10)
      || retreat.fatigueAfter !== Math.min(100, retreat.fatigueBefore + 10)
      || Object.values(retreat.abandonedEquipment).reduce((sum, value) => sum + value, 0) !== 1
      || after.formations[defenderId]?.locationHexKey !== "2,0"
      || island?.status !== "isolated"
      || !control.isolationChanges.some((entry) => entry.campaignFormationId === island.id && entry.isolatedAfter)
      || front?.edges?.length !== 1
      || front.edges[0].friendlyHexKey !== "1,0"
      || front.edges[0].opposingHexKey !== "2,1") {
      throw new Error("Retreat ranking, retreat wear, isolation, or derived front geometry was incorrect.");
    }
  });
});

registerTest("CAMPAIGN_BATTLE_CONTROL_REQUIRES_A_SURVIVING_OCCUPIER", async ({ Given, When, Then }) => {
  const { campaign, runtime, pkg } = commitFixture();
  const tactical = tacticalStateFixture(runtime, pkg);
  const attacker = tactical.playerPlacements.pop();
  if (!attacker) throw new Error("Occupation-failure fixture has no attacking formation.");
  attacker.strength = 0;
  tactical.casualtyLog?.push({
    unit: attacker,
    definition: structuredClone(unitTypesData[attacker.type]),
    unitKey: attacker.formationKey ?? null,
    label: attacker.campaignProvenance?.formationName ?? String(attacker.type),
    recordedAt: "battle:4:2"
  });
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tactical,
    missionStatus,
    result: "attackerVictory"
  });

  await Given("an attacker victory with no ready surviving formation able to occupy the objective", () => {});

  await When("the operational resolver tests occupation instead of granting cosmetic control", () => {
    campaign.applyCampaignBattleResult(result);
  });

  await Then("the defender retains the hex and the exact opposing-control edge remains a front", () => {
    const after = campaign.getRuntimeSnapshot();
    const control = campaign.getCampaignBattleControlReport(result.engagementId);
    if (!after || !control
      || after.tiles["1,0"]?.controller !== "Bot"
      || control.controlChanged
      || control.occupationOutcome !== "failedNoEligibleOccupier"
      || control.occupyingFormationId !== null
      || control.frontsAfter.length !== 1
      || control.frontsAfter[0].edges?.length !== 1) {
      throw new Error("An unsupported victory incorrectly transferred territorial control.");
    }
  });
});

registerTest("CAMPAIGN_BATTLE_CONTROL_REJECTS_OCCUPATION_THROUGH_UNCOMMITTED_ENEMY_PRESENCE", async ({ Given, When, Then }) => {
  const scenario = scenarioFixture();
  scenario.key = "control-blocked-occupation";
  scenario.tiles[1].forces = [{ unitType: "Panzer_IV", count: 2 }];
  const { campaign, runtime, pkg } = commitScenario(scenario);
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tacticalStateFixture(runtime, pkg),
    missionStatus,
    result: "attackerVictory"
  });

  await Given("a battle result that accounts for one defender while another enemy formation still occupies the hex", () => {});

  await When("the victory attempts to establish campaign control", () => {
    campaign.applyCampaignBattleResult(result);
  });

  await Then("uncommitted enemy presence blocks transfer and remains explicitly audited", () => {
    const after = campaign.getRuntimeSnapshot();
    const control = campaign.getCampaignBattleControlReport(result.engagementId);
    if (!after || !control
      || after.tiles["1,0"]?.controller !== "Bot"
      || control.occupationOutcome !== "failedEnemyPresence"
      || control.controlChanged) {
      throw new Error("Territorial control ignored an uncommitted enemy formation on the battle hex.");
    }
  });
});
