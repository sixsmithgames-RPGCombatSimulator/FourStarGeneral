/**
 * MODULE: CampaignAI.planning.test
 * WHAT: Certifies C20-031 portfolio scoring, fog safety, resource discipline, memory, persistence, and integrity.
 * WHY: An operational opponent is only credible when its plans are coordinated, legal, stable, and reproducible.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import { splitLegacyCampaignScenario, createCampaignRuntime } from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import {
  buildCampaignAIAssessmentInput,
  buildCampaignAIPlanningInput,
  buildCampaignFrozenFactionViews,
  resolveCampaignSegment
} from "../src/game/campaign/runtime/CampaignSegmentResolver";
import { assessCampaignAITheater } from "../src/game/campaign/ai/CampaignAIAssessmentService";
import {
  computeCampaignAIPlanningIntegrity,
  planCampaignAIOperations
} from "../src/game/campaign/ai/CampaignAIPlanningService";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import { computeCampaignAIBehaviorIntegrity } from "../src/game/campaign/ai/CampaignAIBehaviorService";

function buildPlanningScenario(): CampaignScenarioData {
  return {
    key: "ai-planning-fixture",
    title: "Operational Planning Fixture",
    description: "A compact theater with enough formations for a coordinated Bot portfolio.",
    dimensions: { cols: 7, rows: 2 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      botHub: { role: "logisticsHub", factionControl: "Bot", supplyValue: 5 },
      botLine: { role: "region", factionControl: "Bot", supplyValue: 1 },
      playerLine: { role: "region", factionControl: "Player", supplyValue: 1 }
    },
    tiles: [
      { tile: "botHub", hex: { q: 0, r: 0 }, forces: [{ unitType: "Panzer_IV", count: 6 }] },
      { tile: "botLine", hex: { q: 1, r: 0 }, forces: [] },
      { tile: "botLine", hex: { q: 2, r: 0 }, forces: [] },
      { tile: "playerLine", hex: { q: 3, r: 0 }, forces: [{ unitType: "M4_Sherman", count: 4 }] }
    ],
    fronts: [],
    objectives: [{
      key: "capture-bot-hub",
      label: "Capture the Bot headquarters",
      description: "Player forces must seize the operational hub.",
      hex: { q: 0, r: 0 },
      owner: "Bot",
      rewards: [],
      category: "primary",
      score: 100,
      deadlineSegment: 8,
      conditions: [{ kind: "controlHex", faction: "Player" }]
    }],
    campaignArc: {
      phases: [{
        key: "defense",
        label: "Defend the headquarters",
        description: "Stop the reported breakthrough.",
        objectiveKeys: ["capture-bot-hub"]
      }],
      victoryObjectiveKeys: ["capture-bot-hub"],
      defeatObjectiveKeys: ["capture-bot-hub"]
    },
    economies: [
      { faction: "Player", manpower: 250, supplies: 250, fuel: 200, ammo: 220, airPower: 0, navalPower: 0, intelCoverage: 0 },
      { faction: "Bot", manpower: 300, supplies: 320, fuel: 260, ammo: 300, airPower: 0, navalPower: 0, intelCoverage: 0 }
    ]
  };
}

function buildPlanningRuntime() {
  const scenario = buildPlanningScenario();
  const definition = splitLegacyCampaignScenario(scenario);
  const playerKnowledge = createCampaignKnowledgeState(scenario, "Player", 0);
  const botKnowledge = createCampaignKnowledgeState(scenario, "Bot", 0);
  botKnowledge.capacityTotal = 2;
  botKnowledge.contacts = [{
    id: "contact_player_breakthrough",
    observerFaction: "Bot",
    subjectKind: "force",
    level: "assessed",
    state: "current",
    confidence: 90,
    locationHexKey: "1,0",
    uncertaintyRadius: 0,
    domain: "ground",
    classificationBand: "Armored concentration",
    strengthBand: "massed",
    readinessBand: "high",
    supplyBand: "wellSupplied",
    movementState: "preparing",
    lastObservedSegment: 0,
    lastUpdatedSegment: 0,
    sourceReportIds: ["report_breakthrough"],
    sourceLabels: ["Forward reconnaissance"],
    analystNotes: ["A major concentration is forming on the headquarters approach."]
  }];
  const runtime = createCampaignRuntime(definition, {
    campaignId: "campaign_ai_planning",
    seed: 0x20_03_10_01,
    currentSegment: 0,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: { Player: playerKnowledge, Bot: botKnowledge }
  });
  return { definition, runtime };
}

function botPlanningInput(runtime: ReturnType<typeof buildPlanningRuntime>["runtime"], definition: ReturnType<typeof splitLegacyCampaignScenario>) {
  const view = buildCampaignFrozenFactionViews(runtime, definition).find((candidate) => candidate.faction === "Bot");
  if (!view) throw new Error("Bot frozen faction view was not created.");
  const assessment = assessCampaignAITheater(buildCampaignAIAssessmentInput(view));
  return { view, assessment, input: buildCampaignAIPlanningInput(view, assessment) };
}

registerTest("CAMPAIGN_AI_PLANNING_IS_DETERMINISTIC_COORDINATED_AND_FOG_SAFE", async ({ Given, When, Then }) => {
  const { definition, runtime } = buildPlanningRuntime();
  const { input } = botPlanningInput(runtime, definition);
  const first = planCampaignAIOperations(input);
  const second = planCampaignAIOperations(input);

  await Given("a Bot assessment built only from exact friendly condition, public objectives, and projected enemy contacts", async () => {});
  await When("headquarters generates and scores the same bounded candidate portfolio twice", async () => {});
  await Then("the portfolio is deterministic, resource-safe, reserve-aware, and contains no opposing formation identity", async () => {
    if (computeCampaignContentHash(first) !== computeCampaignContentHash(second)
      || first.integrityHash !== computeCampaignAIPlanningIntegrity(first)) {
      throw new Error("Identical legal planning input did not produce an identical integrity-bound portfolio.");
    }
    if (first.portfolio.candidates.length === 0 || first.portfolio.selectedPlans.length === 0) {
      throw new Error("The operational planner did not generate and select a viable response.");
    }
    const assigned = first.portfolio.selectedPlans.flatMap((plan) => plan.assignedFormationIds);
    if (new Set(assigned).size !== assigned.length
      || first.portfolio.heldReserveFormationIds.some((id) => assigned.includes(id))) {
      throw new Error("The portfolio double-committed a formation or consumed its held reserve.");
    }
    const committed = first.portfolio.resourceCommitted;
    const budget = first.portfolio.resourceBudget;
    if (committed.supplies > budget.supplies
      || committed.fuel > budget.fuel
      || committed.ammo > budget.ammo
      || committed.manpower > budget.manpower
      || committed.intelligenceCapacity > budget.intelligenceCapacity) {
      throw new Error("Selected plans exceed the legal planning-cycle resource budget.");
    }
    const hiddenPlayerIds = runtime.formationOrder.filter((id) => runtime.formations[id]?.faction === "Player");
    const serialized = JSON.stringify(first);
    if (hiddenPlayerIds.some((id) => serialized.includes(id))) {
      throw new Error("The planning record leaked an opposing formation identity.");
    }
  });
});

registerTest("CAMPAIGN_AI_PLANNING_RETAINS_COMMITMENT_WITH_HYSTERESIS", async ({ Given, When, Then }) => {
  const { definition, runtime } = buildPlanningRuntime();
  const { view, assessment, input } = botPlanningInput(runtime, definition);
  const first = planCampaignAIOperations(input);
  const continued = planCampaignAIOperations(buildCampaignAIPlanningInput(view, assessment, first));

  await Given("an active operational portfolio whose commitment horizon has not expired", async () => {});
  await When("headquarters reviews the same legal picture on another planning pass", async () => {});
  await Then("matching plans retain stable identity and gain continuity instead of oscillating", async () => {
    const originalLead = first.portfolio.selectedPlans[0];
    const continuedLead = continued.portfolio.selectedPlans.find((plan) => plan.signature === originalLead?.signature);
    const continuedCandidate = continued.portfolio.candidates.find((candidate) => candidate.signature === originalLead?.signature);
    if (!originalLead || !continuedLead
      || continuedLead.planId !== originalLead.planId
      || (continuedCandidate?.scoreBreakdown.continuityBonus ?? 0) <= 0) {
      throw new Error("Operational memory failed to retain a still-relevant plan commitment.");
    }
    if (continued.memory.activePlans.length !== continued.portfolio.selectedPlans.length) {
      throw new Error("Operational memory diverged from the selected portfolio.");
    }
  });
});

registerTest("CAMPAIGN_AI_PLANNING_COMMITS_ATOMICALLY_AND_REJECTS_TAMPERING", async ({ Given, When, Then }) => {
  const { definition, runtime } = buildPlanningRuntime();
  const result = resolveCampaignSegment(runtime, definition);

  await Given("a valid frozen Bot command boundary with no prior operational plan", async () => {});
  await When("the complete campaign segment resolves assessment and planning in one transaction", async () => {});
  await Then("the portfolio persists with its source assessment and invariant validation rejects modified content", async () => {
    if (!result.ok) throw new Error(result.error.message);
    const assessment = result.state.aiAssessmentsByFaction?.Bot;
    const planning = result.state.aiPlanningByFaction?.Bot;
    const intelligencePhase = result.report.phaseReports.find((phase) => phase.phase === "intelligence");
    if (!assessment || !planning
      || planning.assessmentId !== assessment.id
      || planning.sourceAssessmentIntegrity !== assessment.integrityHash
      || planning.generatedSegment !== result.state.currentSegment
      || !intelligencePhase?.affectedRecordIds.includes(planning.id)
      || validateCampaignRuntimeState(JSON.parse(JSON.stringify(result.state))).length > 0) {
      throw new Error("Segment resolution did not atomically persist a valid assessment-backed plan portfolio.");
    }
    const tampered = structuredClone(result.state);
    const candidate = tampered.aiPlanningByFaction?.Bot?.portfolio.candidates[0];
    if (!candidate) throw new Error("Fixture did not persist an evaluated candidate.");
    (candidate as { score: number }).score = Math.max(0, candidate.score - 1);
    if (!validateCampaignRuntimeState(tampered).some((issue) => issue.code === "AI_PLANNING_INVALID")) {
      throw new Error("Planning integrity did not fail closed after candidate-score tampering.");
    }
  });
});

registerTest("CAMPAIGN_AI_BEHAVIORS_USE_COMMON_TYPED_ORDERS_AND_EXACT_FORMATIONS", async ({ Given, When, Then }) => {
  const { definition, runtime } = buildPlanningRuntime();
  const first = resolveCampaignSegment(runtime, definition);

  await Given("a selected Bot defense portfolio with named ready formations behind the threatened line", async () => {});
  await When("the behavior adapter translates the private plan during the shared segment transaction", async () => {});
  await Then("the Bot receives ordinary validated orders, reservations, exact formation commitments, and an integrity-bound behavior trace", async () => {
    if (!first.ok) throw new Error(first.error.message);
    const planning = first.state.aiPlanningByFaction?.Bot;
    const behavior = first.state.aiBehaviorsByFaction?.Bot;
    if (!planning || !behavior || behavior.integrityHash !== computeCampaignAIBehaviorIntegrity(behavior)) {
      throw new Error("The AI behavior record is missing or failed its integrity proof.");
    }
    if (behavior.directives.length !== planning.portfolio.selectedPlans.length || behavior.committedOrderIds.length === 0) {
      throw new Error("The selected portfolio did not translate into a complete common-order behavior trace.");
    }
    const orders = behavior.committedOrderIds.map((orderId) => first.state.orders[orderId]);
    if (orders.some((order) => !order || order.faction !== "Bot" || order.status !== "committed" || !order.validation.valid)) {
      throw new Error("AI behavior bypassed the normal typed order lifecycle or validation result.");
    }
    const exactFormationIds = orders.flatMap((order) => order.kind === "redeploy" ? [...(order.payload.formationIds ?? [])] : []);
    if (exactFormationIds.length === 0 || exactFormationIds.some((formationId) => {
      const formation = first.state.formations[formationId];
      return !formation || formation.faction !== "Bot" || formation.status !== "inTransit" || formation.currentOrderId === null;
    })) {
      throw new Error("AI redeployment did not reserve and commit exact persistent formation identities.");
    }
    const interrupted = structuredClone(first.state);
    const disruptedFormation = interrupted.formations[exactFormationIds[0]];
    const disruptedOrderId = disruptedFormation?.currentOrderId ?? null;
    const disruptedOrigin = disruptedFormation?.locationHexKey ?? null;
    if (!disruptedFormation || !disruptedOrderId || !disruptedOrigin) throw new Error("Fixture could not identify an exact movement commitment to interrupt.");
    disruptedFormation.currentOrderId = null;
    const blocked = resolveCampaignSegment(interrupted, definition);
    if (!blocked.ok) throw new Error(blocked.error.message);
    const releasedFormation = blocked.state.formations[disruptedFormation.id];
    if (blocked.state.orders[disruptedOrderId]?.status !== "blocked"
      || releasedFormation?.locationHexKey !== disruptedOrigin
      || releasedFormation?.status !== "ready"
      || releasedFormation?.currentOrderId !== null) {
      throw new Error("A lost exact formation commitment did not block the complete movement and release its remaining lock.");
    }
    const second = resolveCampaignSegment(first.state, definition);
    if (!second.ok) throw new Error(second.error.message);
    const moved = exactFormationIds.map((id) => second.state.formations[id]);
    if (moved.some((formation) => !formation || formation.status !== "ready" || formation.currentOrderId !== null)) {
      throw new Error("Exact AI formations did not return to a ready, uncommitted state after arrival.");
    }
    if (validateCampaignRuntimeState(second.state).length > 0) {
      throw new Error("AI order execution left the campaign runtime in an invalid state.");
    }
  });
});
