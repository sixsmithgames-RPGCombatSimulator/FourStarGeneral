/**
 * MODULE: CampaignAI.assessment.test
 * WHAT: Certifies C20-030 projected input, posture, threats/opportunities, persistence, and assessment integrity.
 * WHY: Strategic AI is trustworthy only when hidden truth cannot affect decisions and every conclusion is reproducible.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import {
  createCampaignRuntime,
  splitLegacyCampaignScenario
} from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import {
  buildCampaignAIAssessmentInput,
  buildCampaignFrozenFactionViews,
  resolveCampaignSegment
} from "../src/game/campaign/runtime/CampaignSegmentResolver";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import {
  assessCampaignAITheater,
  computeCampaignAIAssessmentIntegrity
} from "../src/game/campaign/ai/CampaignAIAssessmentService";

function buildAIScenario(): CampaignScenarioData {
  return {
    key: "ai-assessment-fixture",
    title: "Operational Assessment Fixture",
    description: "A compact belief-versus-truth campaign theater.",
    hexScaleKm: 10,
    dimensions: { cols: 6, rows: 2 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      botHeadquarters: { role: "logisticsHub", factionControl: "Bot", supplyValue: 4 },
      botLine: { role: "region", factionControl: "Bot", supplyValue: 0 },
      contested: { role: "region", factionControl: "Player", supplyValue: 0 },
      playerLine: { role: "region", factionControl: "Player", supplyValue: 0 }
    },
    tiles: [
      { tile: "botHeadquarters", hex: { q: 0, r: 0 }, forces: [{ unitType: "Panzer_IV", count: 4 }] },
      { tile: "botLine", hex: { q: 1, r: 0 }, forces: [{ unitType: "Infantry_42", count: 2 }] },
      { tile: "contested", hex: { q: 2, r: 0 }, forces: [] },
      { tile: "playerLine", hex: { q: 3, r: 0 }, forces: [{ unitType: "Infantry_42", count: 8 }] }
    ],
    fronts: [],
    objectives: [{
      key: "seize-bot-headquarters",
      label: "Seize Bot Headquarters",
      description: "Player forces must take the operational hub.",
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
        label: "Defend the hub",
        description: "Prevent the player breakthrough.",
        objectiveKeys: ["seize-bot-headquarters"]
      }],
      victoryObjectiveKeys: ["seize-bot-headquarters"],
      defeatObjectiveKeys: ["seize-bot-headquarters"]
    },
    economies: [
      { faction: "Player", manpower: 200, supplies: 200, fuel: 200, ammo: 200, airPower: 0, navalPower: 0, intelCoverage: 0 },
      { faction: "Bot", manpower: 240, supplies: 300, fuel: 260, ammo: 280, airPower: 0, navalPower: 0, intelCoverage: 0 }
    ]
  };
}

function buildAIRuntime() {
  const scenario = buildAIScenario();
  const definition = splitLegacyCampaignScenario(scenario);
  const playerKnowledge = createCampaignKnowledgeState(scenario, "Player", 0);
  const botKnowledge = createCampaignKnowledgeState(scenario, "Bot", 0);
  botKnowledge.contacts = [{
    id: "contact_player_spearhead",
    observerFaction: "Bot",
    subjectKind: "force",
    level: "assessed",
    state: "current",
    confidence: 86,
    locationHexKey: "1,0",
    uncertaintyRadius: 0,
    domain: "ground",
    classificationBand: "Armored formation",
    strengthBand: "massed",
    readinessBand: "high",
    supplyBand: "wellSupplied",
    movementState: "preparing",
    lastObservedSegment: 0,
    lastUpdatedSegment: 0,
    sourceReportIds: ["report_projected_only"],
    sourceLabels: ["Forward reconnaissance"],
    analystNotes: ["Concentration reported near the headquarters approach."]
  }];
  const runtime = createCampaignRuntime(definition, {
    campaignId: "campaign_ai_assessment",
    seed: 0x20_03_00_01,
    currentSegment: 0,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: { Player: playerKnowledge, Bot: botKnowledge }
  });
  return { scenario, definition, runtime };
}

function botView(runtime: ReturnType<typeof buildAIRuntime>["runtime"], definition: ReturnType<typeof splitLegacyCampaignScenario>) {
  const view = buildCampaignFrozenFactionViews(runtime, definition).find((candidate) => candidate.faction === "Bot");
  if (!view) throw new Error("Bot frozen view was not created.");
  return view;
}

registerTest("CAMPAIGN_AI_ASSESSMENT_IS_DETERMINISTIC_AND_FOG_SAFE", async ({ Given, When, Then }) => {
  const { definition, runtime } = buildAIRuntime();
  const projected = botView(runtime, definition);
  const input = buildCampaignAIAssessmentInput(projected);
  const first = assessCampaignAITheater(input);
  const second = assessCampaignAITheater(input);

  await Given("a frozen Bot projection containing friendly truth and one fused contact but no opposing formation records", async () => {});
  await When("the operational assessor evaluates the identical projected input twice and hidden Player truth changes separately", async () => {});

  await Then("results are identical and hidden truth cannot alter the assessment", async () => {
    if (computeCampaignContentHash(first) !== computeCampaignContentHash(second)) {
      throw new Error("Identical AI projections did not produce identical assessments.");
    }
    if (!Object.isFrozen(projected) || !Object.isFrozen(projected.friendlyFormations) || projected.friendlyFormations.length === 0) {
      throw new Error("AI input did not retain the frozen exact-friendly projection contract.");
    }
    const playerFormation = runtime.formationOrder.map((id) => runtime.formations[id]).find((formation) => formation.faction === "Player");
    if (!playerFormation) throw new Error("Fixture did not create a hidden Player formation.");
    const hiddenChanged = structuredClone(runtime);
    hiddenChanged.formations[playerFormation.id].readiness = 5;
    hiddenChanged.formations[playerFormation.id].name = "SECRET TRUTH CHANGE";
    const changedProjection = botView(hiddenChanged, definition);
    const changedInput = buildCampaignAIAssessmentInput(changedProjection);
    const changedAssessment = assessCampaignAITheater(changedInput);
    if (computeCampaignContentHash(projected) !== computeCampaignContentHash(changedProjection)
      || computeCampaignContentHash(input) !== computeCampaignContentHash(changedInput)
      || computeCampaignContentHash(first) !== computeCampaignContentHash(changedAssessment)) {
      throw new Error("Unobserved opposing truth crossed the faction projection boundary.");
    }
    const serialized = JSON.stringify(changedAssessment);
    if (serialized.includes(playerFormation.id) || serialized.includes("SECRET TRUTH CHANGE")) {
      throw new Error("AI assessment serialized a hidden opposing formation identity.");
    }

    const ownChanged = structuredClone(runtime);
    const botFormation = ownChanged.formationOrder.map((id) => ownChanged.formations[id]).find((formation) => formation.faction === "Bot");
    if (!botFormation) throw new Error("Fixture did not create a Bot formation.");
    botFormation.readiness = 20;
    const ownAssessment = assessCampaignAITheater(buildCampaignAIAssessmentInput(botView(ownChanged, definition)));
    if (ownAssessment.sourceViewHash === first.sourceViewHash
      || ownAssessment.forces.averageReadiness >= first.forces.averageReadiness) {
      throw new Error("Exact friendly condition did not influence operational assessment.");
    }
  });
});

registerTest("CAMPAIGN_AI_ASSESSMENT_RANKS_THREATS_OBJECTIVES_AND_POSTURE", async ({ Given, When, Then }) => {
  const { definition, runtime } = buildAIRuntime();
  const projected = botView(runtime, definition);
  const input = buildCampaignAIAssessmentInput(projected);
  const assessment = assessCampaignAITheater(input);

  await Given("a high-confidence massed contact beside a public decisive objective with an approaching deadline", async () => {});
  await When("Bot command evaluates force health, reserves, logistics, intelligence, and objective pressure", async () => {});

  await Then("the assessment identifies a critical objective threat and selects a defensive posture with an auditable rationale", async () => {
    const threat = assessment.threats[0];
    if (!threat
      || threat.priority !== "critical"
      || !threat.objectiveKeys.includes("seize-bot-headquarters")
      || assessment.objectivePressure.threatenedObjectives !== 1
      || assessment.objectivePressure.scoreAtRisk !== 100
      || assessment.objectivePressure.nearestDeadlineSegments !== 8
      || assessment.posture !== "delay") {
      throw new Error("Assessment did not convert projected contact and objective deadline into defensive pressure.");
    }
    if (!assessment.rationale.some((line) => line.includes("Highest threat"))
      || assessment.integrityHash !== computeCampaignAIAssessmentIntegrity(assessment)) {
      throw new Error("Assessment rationale or integrity proof is incomplete.");
    }

    const weakContactInput = structuredClone(input);
    weakContactInput.operationalPicture.enemyContacts[0].strengthBand = "trace";
    weakContactInput.operationalPicture.enemyContacts[0].readinessBand = "disrupted";
    weakContactInput.operationalPicture.enemyContacts[0].supplyBand = "isolated";
    weakContactInput.operationalPicture.enemyContacts[0].confidenceBand = "low";
    const weakContactAssessment = assessCampaignAITheater(weakContactInput);
    if ((weakContactAssessment.threats[0]?.score ?? 0) >= threat.score
      || !weakContactAssessment.opportunities.some((opportunity) => opportunity.contactIds.includes("contact_player_spearhead"))) {
      throw new Error("Projected weakness did not reduce threat and create a bounded exploitation opportunity.");
    }

    const exhaustedInput = structuredClone(input);
    exhaustedInput.economy.supplies = 0;
    exhaustedInput.economy.fuel = 0;
    exhaustedInput.economy.ammo = 0;
    exhaustedInput.friendlyFormations.forEach((formation) => {
      (formation as { sustainmentPercent: number }).sustainmentPercent = 0;
    });
    const exhausted = assessCampaignAITheater(exhaustedInput);
    if (exhausted.logistics.state !== "critical" || exhausted.posture !== "preserve") {
      throw new Error("Critical logistics did not force force-preservation posture.");
    }
  });
});

registerTest("CAMPAIGN_AI_ASSESSMENT_COMMITS_WITH_SEGMENT_AND_REJECTS_TAMPERING", async ({ Given, When, Then }) => {
  const { definition, runtime } = buildAIRuntime();
  const result = resolveCampaignSegment(runtime, definition);

  await Given("a planning boundary with a valid Bot belief state and no existing AI assessment", async () => {});
  await When("one complete campaign segment resolves through the shared transaction", async () => {});

  await Then("the start-boundary assessment persists, serializes, validates, and fails closed after tampering", async () => {
    if (!result.ok) throw new Error(result.error.message);
    const assessment = result.state.aiAssessmentsByFaction?.Bot;
    const frozenBot = result.frozenViews.find((view) => view.faction === "Bot");
    const intelligencePhase = result.report.phaseReports.find((phase) => phase.phase === "intelligence");
    if (!assessment || !frozenBot
      || assessment.sourceRevision !== runtime.revision
      || assessment.sourceSegment !== runtime.currentSegment
      || assessment.generatedSegment !== result.state.currentSegment
      || assessment.sourceViewHash !== computeCampaignContentHash(buildCampaignAIAssessmentInput(frozenBot))
      || !intelligencePhase?.affectedRecordIds.includes(assessment.id)) {
      throw new Error("Segment transaction did not persist the assessment from its frozen faction checkpoint.");
    }
    const serialized = JSON.parse(JSON.stringify(result.state)) as typeof result.state;
    if (validateCampaignRuntimeState(serialized).length > 0
      || serialized.aiAssessmentsByFaction?.Bot?.integrityHash !== assessment.integrityHash) {
      throw new Error("Assessment did not survive JSON persistence as valid campaign truth.");
    }
    const tampered = structuredClone(result.state);
    const tamperedForces = tampered.aiAssessmentsByFaction?.Bot?.forces as { averageReadiness: number } | undefined;
    if (!tamperedForces) throw new Error("Tamper fixture lost the persisted assessment.");
    tamperedForces.averageReadiness = tamperedForces.averageReadiness === 17 ? 18 : 17;
    if (!validateCampaignRuntimeState(tampered).some((issue) => issue.code === "AI_ASSESSMENT_INVALID")) {
      throw new Error("Assessment integrity tampering was not rejected by runtime invariants.");
    }
    const malformed = structuredClone(result.state);
    malformed.aiAssessmentsByFaction = { Bot: {} as NonNullable<typeof malformed.aiAssessmentsByFaction>["Bot"] };
    if (!validateCampaignRuntimeState(malformed).some((issue) => issue.code === "AI_ASSESSMENT_INVALID")) {
      throw new Error("Malformed assessment input was not converted into a structured invariant issue.");
    }
  });
});
