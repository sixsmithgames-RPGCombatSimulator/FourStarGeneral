/** Certifies C20-033 Bot-initiated engagements, exact commitments, and target non-substitution. */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import type { CampaignPendingEngagement } from "../src/core/campaignTypes";
import type { SerializedBattleState } from "../src/game/GameEngine";
import { createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import {
  initiateCampaignAIOffensive
} from "../src/game/campaign/ai/CampaignAIEngagementService";
import type { CampaignAIPlanBehaviorDirective } from "../src/game/campaign/ai/CampaignAIBehaviorTypes";
import type { CampaignAISelectedPlan } from "../src/game/campaign/ai/CampaignAIPlanningTypes";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { createCampaignRuntime, splitLegacyCampaignScenario } from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { runCampaignRuntimeTransaction } from "../src/game/campaign/runtime/CampaignRuntimeTransaction";
import { appendCampaignAdvanceStepRecord } from "../src/game/campaign/runtime/CampaignAdvanceRules";
import { CampaignState } from "../src/state/CampaignState";
import type { CampaignDomainEventDraft } from "../src/game/campaign/runtime/campaignRuntimeTypes";
import { createCampaignFormationBattleSeed } from "../src/game/campaign/formations/CampaignFormationBattleAdapter";
import { extractCampaignBattleResultPackage } from "../src/game/campaign/results/CampaignBattleResultExtractor";

function scenarioFixture(): CampaignScenarioData {
  return {
    key: "central_channel",
    title: "AI Engagement Fixture",
    description: "Bot staging line beside two Player positions.",
    dimensions: { cols: 4, rows: 2 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      bot: { role: "region", factionControl: "Bot", supplyValue: 1 },
      player: { role: "fortificationLight", factionControl: "Player", supplyValue: 1 }
    },
    tiles: [
      { tile: "bot", hex: { q: 0, r: 0 }, forces: [] },
      { tile: "bot", hex: { q: 1, r: 0 }, forces: [{ unitType: "Panzer_IV", count: 2 }] },
      { tile: "player", hex: { q: 2, r: 0 }, forces: [{ unitType: "Infantry_42", count: 1 }] },
      { tile: "player", hex: { q: 3, r: 0 }, forces: [{ unitType: "Infantry_42", count: 1 }] }
    ],
    fronts: [{
      key: "contact-front",
      label: "Contact Front",
      hexKeys: ["1,0", "2,1"],
      initiative: "Bot"
    }],
    objectives: [],
    economies: [
      { faction: "Player", manpower: 200, supplies: 200, fuel: 200, ammo: 200, airPower: 0, navalPower: 0, intelCoverage: 0 },
      { faction: "Bot", manpower: 200, supplies: 200, fuel: 200, ammo: 200, airPower: 0, navalPower: 0, intelCoverage: 0 }
    ]
  };
}

function runtimeFixture() {
  const scenario = scenarioFixture();
  const definition = splitLegacyCampaignScenario(scenario);
  const runtime = createCampaignRuntime(definition, {
    campaignId: "campaign-ai-engagement",
    seed: 0x20_03_30_01,
    currentSegment: 4,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 4),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 4)
    }
  });
  return { definition, runtime };
}

function offensivePlan(assignedFormationIds: readonly string[], targetHexKey = "2,1"): CampaignAISelectedPlan {
  return {
    planId: "plan-bot-offensive",
    candidateId: "candidate-bot-offensive",
    signature: `prepareOffensive:${targetHexKey}`,
    kind: "prepareOffensive",
    targetHexKey,
    sourceFindingIds: ["finding-reported-line"],
    objectiveKeys: [],
    contactIds: ["contact-reported-line"],
    assignedFormationIds: [...assignedFormationIds],
    resources: { supplies: 10, fuel: 10, ammo: 10, manpower: 0, intelligenceCapacity: 0 },
    score: 70,
    startedSegment: 3,
    lastReviewedSegment: 4,
    commitmentUntilSegment: 6,
    triggers: { reinforce: [], exploit: [], abort: [], withdraw: [] },
    summary: "Attack the reported Player line."
  };
}

function directive(): CampaignAIPlanBehaviorDirective {
  return {
    planId: "plan-bot-offensive",
    planKind: "prepareOffensive",
    status: "holding",
    orderIds: [],
    reason: "Assigned formations are staged on the objective line."
  };
}

registerTest("CAMPAIGN_AI_OFFENSIVE_FREEZES_EXACT_BOT_ATTACK_AND_PLAYER_DEFENSE", async ({ Given, When, Then }) => {
  const { definition, runtime } = runtimeFixture();
  const stagedBotIds = runtime.tiles["1,0"].formationIds;
  const selectedBotId = stagedBotIds[0];

  await Given("a belief-selected target and one exact staged Bot formation beside a Player-held hex", () => {
    if (!selectedBotId || stagedBotIds.length !== 2) throw new Error("Fixture did not seed the expected Bot formations.");
  });

  let initiatedId = "";
  const result = runCampaignRuntimeTransaction(runtime, "test:ai-offensive", (candidate) => {
    candidate.currentSegment = runtime.currentSegment + 1;
    const initiated = initiateCampaignAIOffensive(
      candidate,
      definition,
      "Bot",
      offensivePlan([selectedBotId]),
      directive()
    );
    if (!initiated) throw new Error("Staged Bot offensive was not initiated.");
    initiatedId = initiated.engagementId;
    const events: CampaignDomainEventDraft[] = [{
      type: "stateChanged",
      category: "engagement",
      summary: "Enemy tactical contact requires Player defense.",
      details: { engagementId: initiated.engagementId }
    }];
    appendCampaignAdvanceStepRecord(runtime, candidate, events, {
      commandId: "test-day-command",
      mode: "day",
      targetSegment: 8,
      safetySegment: 16,
      pauseAfterEveryResolution: false,
      stopOnCriticalAlerts: true
    }, "test:ai-offensive");
    return { events };
  });

  await When("the offensive crosses the common engagement transaction boundary", () => {});

  await Then("one in-battle package locks only the selected attacker and every available defender", () => {
    if (!result.ok) throw new Error(`${result.error.message} ${JSON.stringify(result.issues)}`);
    const engagement = result.state.engagements[initiatedId];
    const pkg = result.state.engagementLedger[initiatedId]?.package;
    if (!engagement || engagement.status !== "inBattle" || !pkg
      || result.state.activeEngagementId !== initiatedId || result.state.status !== "engagement") {
      throw new Error("Bot contact did not become one active, committed tactical package.");
    }
    const attackers = pkg.formationCommitments.filter((entry) => entry.role === "attacker");
    const defenders = pkg.formationCommitments.filter((entry) => entry.role === "defender");
    if (attackers.length !== 1 || attackers[0].formationId !== selectedBotId
      || attackers[0].faction !== "Bot" || defenders.length !== 2
      || defenders.some((entry) => entry.faction !== "Player")) {
      throw new Error("The package widened the AI plan or failed to lock the legal Player defense.");
    }
    if (pkg.context.battleHexKey !== "2,1" || pkg.context.intelligenceBriefing?.observerFaction !== "Player"
      || !pkg.engagement.tags.includes("player-defense")) {
      throw new Error("The defensive package lost its target, Player-safe briefing, or routing identity.");
    }
    const advanceRecordId = result.state.advanceRecordOrder[result.state.advanceRecordOrder.length - 1] ?? "";
    const advanceRecord = result.state.advanceRecords[advanceRecordId];
    if (!advanceRecord?.stopped || advanceRecord.stopReason !== "engagement"
      || !advanceRecord.alerts.some((alert) => alert.targetId === initiatedId && alert.requiresStop)) {
      throw new Error("The Bot offensive did not create a mandatory Player-safe campaign advance stop.");
    }
  });
});

registerTest("CAMPAIGN_AI_OFFENSIVE_NEVER_SUBSTITUTES_A_HIDDEN_TARGET", async ({ Given, When, Then }) => {
  const { definition, runtime } = runtimeFixture();
  const selectedBotId = runtime.tiles["1,0"].formationIds[0];
  const sourceHash = computeCampaignContentHash(runtime);

  await Given("an AI plan aimed at a real but non-adjacent Player hex while an easier Player hex is adjacent", () => {});
  const initiated = initiateCampaignAIOffensive(
    runtime,
    definition,
    "Bot",
    offensivePlan([selectedBotId], "3,1"),
    directive()
  );
  await When("physical engagement legality is checked", () => {});

  await Then("the operation remains staged and does not search authoritative truth for the adjacent alternative", () => {
    if (initiated !== null || computeCampaignContentHash(runtime) !== sourceHash
      || runtime.engagementOrder.length !== 0 || runtime.activeEngagementId !== null) {
      throw new Error("AI engagement initiation substituted hidden target truth or mutated a blocked operation.");
    }
  });
});

registerTest("CAMPAIGN_PLAYER_DEFENDERS_BRIDGE_FROM_PACKAGE_TO_DEPLOYMENT", async ({ Given, When, Then }) => {
  const campaign = new CampaignState({ legacyStorage: null });
  campaign.setScenario(scenarioFixture());
  const context = campaign.buildCampaignEngagementContext({
    engagementId: "manual-bot-attack",
    battleHexKey: "2,1",
    attacker: "Bot",
    frontKey: "contact-front"
  }, "Player");
  if (!context) throw new Error("Could not create the defensive context fixture.");
  const engagement: CampaignPendingEngagement = {
    id: context.engagementId,
    frontKey: context.frontKey,
    objectiveKey: null,
    attacker: "Bot",
    defender: "Player",
    hexKeys: [context.battleHexKey],
    tags: ["player-defense"],
    context
  };

  await Given("an exact Bot package whose Player formations own the defender role", () => {
    campaign.setPendingEngagements([engagement]);
    campaign.setActiveEngagementId(engagement.id);
  });
  const planned = campaign.getRuntimeSnapshot();
  if (!planned) throw new Error("Campaign runtime was unavailable.");
  const committed = campaign.commitCampaignEngagement({
    engagementId: engagement.id,
    expectedRevision: planned.revision,
    selections: [{ allocationKey: "tank", category: "units", quantity: 1, unitRpCost: 100 }]
  });
  if (!committed.ok) throw new Error(committed.reason);
  const defenderCount = committed.package.formationCommitments.filter((entry) => entry.faction === "Player" && entry.role === "defender").length;
  const deploymentUnits = campaign.buildCampaignFormationBattleUnits(engagement.id, "infantry", defenderCount);
  await When("precombat requests the committed defensive allocation", () => {});

  await Then("battle-owned units retain exact Player provenance even though Player did not attack", () => {
    if (defenderCount !== 2 || deploymentUnits.length !== defenderCount
      || deploymentUnits.some((unit) => unit.campaignProvenance?.faction !== "Player"
        || unit.campaignProvenance.engagementId !== engagement.id || unit.entrench !== 2)) {
      throw new Error("Player defender commitments did not bridge into defensive deployment with provenance and entrenchment.");
    }
  });
});

registerTest("CAMPAIGN_DEFENSIVE_RESULT_PRESERVES_TACTICAL_FACTION_IDENTITY", async ({ Given, When, Then }) => {
  const campaign = new CampaignState({ legacyStorage: null });
  campaign.setScenario(scenarioFixture());
  const context = campaign.buildCampaignEngagementContext({
    engagementId: "defensive-result",
    battleHexKey: "2,1",
    attacker: "Bot",
    frontKey: "contact-front"
  }, "Player");
  if (!context) throw new Error("Could not create defensive result context.");
  campaign.setPendingEngagements([{
    id: context.engagementId,
    frontKey: context.frontKey,
    objectiveKey: null,
    attacker: "Bot",
    defender: "Player",
    hexKeys: [context.battleHexKey],
    tags: ["player-defense"],
    context
  }]);
  campaign.setActiveEngagementId(context.engagementId);
  const planned = campaign.getRuntimeSnapshot();
  if (!planned) throw new Error("Campaign runtime was unavailable.");
  const committed = campaign.commitCampaignEngagement({
    engagementId: context.engagementId,
    expectedRevision: planned.revision,
    selections: [{ allocationKey: "tank", category: "units", quantity: 1, unitRpCost: 100 }]
  });
  if (!committed.ok) throw new Error(committed.reason);
  const runtime = campaign.getRuntimeSnapshot();
  if (!runtime) throw new Error("Committed runtime was unavailable.");
  const units = committed.package.formationCommitments.map((entry, index) => {
    const formation = runtime.formations[entry.formationId];
    const seed = formation ? createCampaignFormationBattleSeed(formation, {
      campaignId: committed.package.campaignId,
      engagementId: committed.package.engagementId,
      sourceRevision: committed.package.sourceRevision,
      sourceSegment: committed.package.committedSegment,
      hex: { q: index, r: 0 }
    }) : null;
    if (!seed) throw new Error(`Could not create tactical unit for ${entry.formationId}.`);
    return { role: entry.role, faction: entry.faction, unit: seed.unit };
  });
  const botUnit = units.find((entry) => entry.faction === "Bot")?.unit;
  if (!botUnit) throw new Error("Defensive package did not create a Bot attacker.");
  const supplyState = (ammoUse: number) => ({
    inventory: {
      ammo: { current: 10, baseline: 10 + ammoUse, bonus: 0 },
      fuel: { current: 10, baseline: 10, bonus: 0 },
      rations: { current: 10, baseline: 10, bonus: 0 },
      parts: { current: 10, baseline: 10, bonus: 0 }
    },
    pending: [],
    productionRate: { ammo: 0, fuel: 0, rations: 0, parts: 0 },
    ledger: ammoUse > 0 ? [{ id: `ammo-${ammoUse}`, turn: 2, type: "ammo" as const, delta: -ammoUse, reason: "combat", timestamp: "battle:2" }] : [],
    lastUpdatedTurn: 2
  });
  const tacticalState: SerializedBattleState = {
    completeStateVersion: 1,
    phase: "completed",
    activeFaction: "Player",
    turnNumber: 2,
    baseCamp: null,
    playerPlacements: units.filter((entry) => entry.faction === "Player").map((entry) => entry.unit),
    botPlacements: units.filter((entry) => entry.faction === "Bot").map((entry) => entry.unit),
    allyPlacements: [],
    reserves: [],
    airborneReserves: [],
    casualtyLog: [],
    supplyStates: { Player: supplyState(4), Bot: supplyState(7), Ally: supplyState(0) },
    battleRequisitionPointsSpent: 0,
    enemyContactStates: [{
      unitId: botUnit.unitId!,
      state: "identified",
      lastSeenTurn: 2,
      lastKnownHex: { q: 0, r: 0 },
      lastKnownStrength: botUnit.strength,
      knownUnitType: botUnit.type,
      source: "defensive contact"
    }],
    hexModifications: []
  };

  await Given("a Player tactical defense with separate Player and Bot supply ledgers and observations", () => {});
  const result = extractCampaignBattleResultPackage({
    battlePackage: committed.package,
    tacticalState,
    missionStatus: null,
    result: "defenderVictory"
  });
  await When("terminal tactical truth is translated back into attacker/defender campaign semantics", () => {});

  await Then("Player consumption and contacts remain Player-owned while Bot consumption remains Bot-owned", () => {
    if (result.resourcesConsumed.Player?.ammo !== 4 || result.resourcesConsumed.Bot?.ammo !== 7
      || !(result.observedEvidenceByFaction.Player ?? []).some((entry) => entry.kind === "enemyContact")
      || (result.observedEvidenceByFaction.Bot ?? []).some((entry) => entry.kind === "enemyContact")) {
      throw new Error("Defensive result extraction confused campaign initiative with tactical faction identity.");
    }
  });
});
