/**
 * MODULE: CampaignFormations.substrate.test
 * WHAT: Certifies deterministic campaign formation identity, placement conservation, save continuity, and tactical provenance.
 * WHY: C20-020 is the identity foundation for commitment, result extraction, consequences, and multi-battle formation history.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignEngagementContext, CampaignScenarioData } from "../src/core/campaignTypes";
import { createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import {
  createCampaignRuntime,
  splitLegacyCampaignScenario,
  type CreateCampaignRuntimeOptions
} from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import {
  createCampaignFormationRecord,
  reconcileCampaignFormationForceCounts,
  retireCampaignFormation
} from "../src/game/campaign/formations/FormationLifecycleService";
import {
  attachCampaignFormationProvenanceToContext,
  createCampaignFormationBattleSeed,
  extractCampaignFormationTacticalSnapshot,
  selectCampaignFormationsForAllocation
} from "../src/game/campaign/formations/CampaignFormationBattleAdapter";
import { createCampaignSaveEnvelope, validateCampaignSaveEnvelope } from "../src/game/campaign/persistence/CampaignSaveEnvelope";
import { generateCampaignBattleScenario } from "../src/game/campaign/CampaignBattleGenerator";
import { normalizeScenarioSource, type RawScenarioInput } from "../src/data/scenarioNormalizer";
import { DeploymentState } from "../src/state/DeploymentState";

function buildFormationScenario(): CampaignScenarioData {
  return {
    key: "formation-substrate",
    title: "Formation Substrate",
    description: "Persistent formation certification fixture.",
    hexScaleKm: 10,
    dimensions: { cols: 3, rows: 2 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      player: { role: "logisticsHub", factionControl: "Player", supplyValue: 4 },
      bot: { role: "fortificationLight", factionControl: "Bot", supplyValue: 2 }
    },
    tiles: [
      {
        tile: "player",
        factionControl: "Player",
        hex: { q: 0, r: 0 },
        forces: [{ unitType: "Infantry_42", count: 2, label: "1st Infantry Brigade" }]
      },
      { tile: "player", factionControl: "Player", hex: { q: 0, r: 1 }, forces: [] },
      {
        tile: "bot",
        factionControl: "Bot",
        hex: { q: 1, r: 0 },
        forces: [{ unitType: "Panzer_IV", count: 1, label: "Panzer Reserve" }]
      }
    ],
    fronts: [{ key: "front", label: "Test Front", hexKeys: ["0,0", "1,0"], initiative: "Player" }],
    objectives: [],
    economies: [
      {
        faction: "Player",
        manpower: 1000,
        supplies: 500,
        fuel: 300,
        ammo: 200,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0,
        productionAllocation: { supplies: 40, fuel: 30, ammo: 10, manpower: 20 }
      },
      {
        faction: "Bot",
        manpower: 900,
        supplies: 450,
        fuel: 280,
        ammo: 180,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0
      }
    ]
  };
}

function runtimeOptions(scenario: CampaignScenarioData): CreateCampaignRuntimeOptions {
  return {
    campaignId: "campaign_formations_test",
    seed: 0x24f020,
    currentSegment: 12,
    turnState: null,
    queuedDecisions: [],
    engagements: [],
    activeEngagementId: null,
    knowledgeByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 12),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 12)
    }
  };
}

function buildEngagementContext(): CampaignEngagementContext {
  return {
    engagementId: "eng_formations",
    battleHexKey: "1,0",
    attacker: "Player",
    defender: "Bot",
    missionType: "lineAssault",
    amphibious: false,
    coastal: false,
    availableForces: [{ hexKey: "0,0", unitType: "Infantry_42", count: 2 }],
    allocationCaps: { infantry: 2 },
    enemyForces: [{ hexKey: "1,0", unitType: "Panzer_IV", count: 1 }],
    airSorties: 0,
    rpReserve: 150,
    playerForceValue: 200,
    enemyForceValue: 150,
    forceRatio: 4 / 3,
    templateKey: null,
    frontKey: "front",
    objectiveKey: null
  };
}

registerTest("CAMPAIGN_FORMATIONS_DETERMINISTIC_LEGACY_REGISTRY", async ({ Given, When, Then }) => {
  const scenario = buildFormationScenario();
  const definition = splitLegacyCampaignScenario(scenario);
  const first = createCampaignRuntime(definition, runtimeOptions(scenario));
  const second = createCampaignRuntime(definition, runtimeOptions(scenario));

  await Given("three aggregate campaign counts in authored tile/group order", async () => {});

  await When("the same legacy campaign is adapted twice", async () => {});

  await Then("each count becomes one identical, complete, persistently placed formation", async () => {
    if (first.formationOrder.length !== 3) throw new Error(`Expected three formations, got ${first.formationOrder.length}.`);
    if (computeCampaignContentHash(first.formations) !== computeCampaignContentHash(second.formations)
      || computeCampaignContentHash(first.formationOrder) !== computeCampaignContentHash(second.formationOrder)) {
      throw new Error("Identical campaign inputs produced different formation identity or records.");
    }
    const infantry = first.formationOrder.map((id) => first.formations[id]).filter((entry) => entry.campaignUnitType === "Infantry_42");
    if (infantry.length !== 2
      || new Set(infantry.map((entry) => entry.id)).size !== 2
      || infantry.some((entry) => entry.personnel.core?.fit <= 0 || entry.battleHistory[0]?.type !== "formed")) {
      throw new Error("Legacy infantry did not receive unique identity, complete personnel pools, and origin history.");
    }
    if (validateCampaignRuntimeState(first).length !== 0) throw new Error("Seeded formation runtime failed invariants.");
  });
});

registerTest("CAMPAIGN_FORMATIONS_RECONCILE_MOVEMENT_AND_RETIREMENT", async ({ Given, When, Then }) => {
  const scenario = buildFormationScenario();
  const runtime = createCampaignRuntime(splitLegacyCampaignScenario(scenario), runtimeOptions(scenario));
  const initialInfantryIds = [...runtime.tiles["0,0"].formationIds];
  let movedId = "";

  await Given("two persistent infantry records at the origin and an empty friendly destination", async () => {});

  await When("one legacy aggregate count moves and is then terminally retired", async () => {
    runtime.tiles["0,0"].forces = [{ unitType: "Infantry_42", count: 1, label: "1st Infantry Brigade" }];
    runtime.tiles["0,1"].forces = [{ unitType: "Infantry_42", count: 1, label: "1st Infantry Brigade" }];
    const reconciled = reconcileCampaignFormationForceCounts(runtime, 12, "formation movement test");
    movedId = reconciled.movedFormationIds[0] ?? "";
    if (!movedId) throw new Error("Aggregate movement did not identify the relocated persistent formation.");
    if (!retireCampaignFormation(runtime, movedId, "destroyed", 12, "Formation retirement test.")) {
      throw new Error("Formation retirement was rejected.");
    }
  });

  await Then("movement preserves identity and retirement removes placement without deleting history", async () => {
    if (!initialInfantryIds.includes(movedId)) throw new Error("Movement replaced the formation with a new identity.");
    const retired = runtime.formations[movedId];
    if (!retired || retired.status !== "destroyed" || retired.locationHexKey !== null || retired.retiredSegment !== 12) {
      throw new Error("Retired formation did not retain a terminal campaign record.");
    }
    if (!retired.battleHistory.some((entry) => entry.type === "moved")
      || retired.battleHistory[retired.battleHistory.length - 1]?.type !== "retired"
      || runtime.tiles["0,1"].formationIds.includes(movedId)) {
      throw new Error("Formation movement/retirement history or placement is incomplete.");
    }
    if (validateCampaignRuntimeState(runtime).length !== 0) throw new Error("Lifecycle mutations left an invalid runtime.");
  });
});

registerTest("CAMPAIGN_FORMATIONS_SAVE_AND_INVARIANT_CONTINUITY", async ({ Given, When, Then }) => {
  const scenario = buildFormationScenario();
  const runtime = createCampaignRuntime(splitLegacyCampaignScenario(scenario), runtimeOptions(scenario));
  let validation: ReturnType<typeof validateCampaignSaveEnvelope> | null = null;

  await Given("a complete formation registry inside authoritative campaign truth", async () => {});

  await When("the runtime is checksummed and validated through the named save envelope", async () => {
    const timestamp = "2026-08-04T12:00:00.000Z";
    const envelope = createCampaignSaveEnvelope({
      saveId: "save_formations_roundtrip",
      slotType: "manual",
      gameMode: "campaign",
      createdAt: timestamp,
      updatedAt: timestamp,
      buildVersion: "test",
      contentVersion: "test",
      scenarioKey: runtime.scenarioKey,
      campaignId: runtime.campaignId,
      engagementId: null,
      display: {
        campaignTitle: scenario.title,
        segment: runtime.currentSegment,
        phaseLabel: "Planning",
        lastEventSummary: runtime.eventLog[runtime.eventLog.length - 1]?.summary ?? null,
        playTimeSeconds: 0,
        difficulty: null,
        result: null,
        thumbnailKey: null
      },
      payload: {
        runtime,
        activeBattle: null,
        commanderRosterLink: null,
        uiResumeContext: { workspace: "formations", selectedEntityId: runtime.formationOrder[0], mapCenter: null, mapZoom: null }
      }
    });
    validation = validateCampaignSaveEnvelope(structuredClone(envelope));
  });

  await Then("formation identity and pools survive exactly while corrupt placement/projection is rejected", async () => {
    if (!validation?.ok) throw new Error(validation?.error.message ?? "Formation envelope did not validate.");
    if (computeCampaignContentHash(validation.envelope.payload.runtime.formations) !== computeCampaignContentHash(runtime.formations)) {
      throw new Error("Save validation changed formation identity or condition state.");
    }
    const corruptPlacement = structuredClone(runtime);
    corruptPlacement.tiles["0,0"].formationIds.push(corruptPlacement.tiles["0,0"].formationIds[0]);
    const placementCodes = new Set(validateCampaignRuntimeState(corruptPlacement).map((issue) => issue.code));
    if (!placementCodes.has("FORMATION_PLACEMENT_INVALID")) throw new Error("Duplicate formation placement was accepted.");
    const corruptProjection = structuredClone(runtime);
    corruptProjection.tiles["0,0"].forces[0].count += 1;
    const projectionCodes = new Set(validateCampaignRuntimeState(corruptProjection).map((issue) => issue.code));
    if (!projectionCodes.has("FORMATION_PROJECTION_INVALID")) throw new Error("Divergent aggregate force projection was accepted.");
  });
});

registerTest("CAMPAIGN_FORMATIONS_TACTICAL_PROVENANCE", async ({ Given, When, Then }) => {
  const scenario = buildFormationScenario();
  const runtime = createCampaignRuntime(splitLegacyCampaignScenario(scenario), runtimeOptions(scenario));
  const context = attachCampaignFormationProvenanceToContext(buildEngagementContext(), runtime);
  const friendly = selectCampaignFormationsForAllocation(runtime, context, "infantry", 1)[0];
  const botId = context.enemyForces[0]?.formationIds?.[0];

  await Given("friendly and enemy engagement pools linked to persistent records", async () => {
    if (!friendly || !botId) throw new Error("Formation provenance was not attached to engagement force pools.");
  });

  await When("campaign records become friendly deployment and generated enemy tactical units", async () => {});

  await Then("both scales retain deterministic provenance without sharing mutable status pools", async () => {
    const seed = createCampaignFormationBattleSeed(friendly, {
      campaignId: runtime.campaignId,
      engagementId: context.engagementId,
      sourceRevision: runtime.revision,
      sourceSegment: runtime.currentSegment,
      hex: { q: 0, r: 0 }
    });
    if (!seed || seed.unit.campaignProvenance?.formationId !== friendly.id) {
      throw new Error("Friendly tactical seed lost its campaign formation identity.");
    }
    const deployment = new DeploymentState();
    deployment.initialize([{ key: "infantry", label: "Infantry Battalion", remaining: 1, campaignUnits: [seed.unit] }]);
    const reserveUnit = deployment.toScenarioUnits()[0];
    if (reserveUnit?.campaignProvenance?.formationId !== friendly.id || reserveUnit.unitId !== seed.tacticalUnitId) {
      throw new Error("Friendly precombat reserve hydration discarded persistent formation provenance.");
    }
    const originalFit = friendly.personnel.core?.fit ?? 0;
    if (seed.unit.status?.personnel.core) seed.unit.status.personnel.core.fit = Math.max(0, originalFit - 10);
    if ((friendly.personnel.core?.fit ?? 0) !== originalFit) throw new Error("Tactical status mutation leaked into campaign truth.");
    const snapshot = extractCampaignFormationTacticalSnapshot(seed.unit);
    if (snapshot?.campaignFormationId !== friendly.id || snapshot.tacticalUnitId !== seed.tacticalUnitId) {
      throw new Error("Tactical provenance snapshot could not recover the persistent formation identity.");
    }

    const generated = generateCampaignBattleScenario(context, runtime, undefined, "central_channel");
    const rawBotUnits = (generated as unknown as {
      sides: { Bot: { units: Array<{ campaignProvenance?: { formationId: string }; unitId?: string }> } };
    }).sides.Bot.units;
    const persistentBot = rawBotUnits.find((unit) => unit.campaignProvenance?.formationId === botId);
    if (!persistentBot?.unitId) throw new Error("Generated enemy roster lost campaign provenance or deterministic tactical ID.");
    const normalized = normalizeScenarioSource(generated as unknown as RawScenarioInput, { turnLimit: 12 });
    const normalizedBot = normalized.sides.Bot.units.find((unit) => unit.campaignProvenance?.formationId === botId);
    if (!normalizedBot || normalizedBot.unitId !== persistentBot.unitId || !normalizedBot.status) {
      throw new Error("Scenario normalization discarded campaign provenance, stable unit ID, or formation pools.");
    }
  });
});

registerTest("CAMPAIGN_HEAVY_ARTILLERY_RETAINS_EXACT_TACTICAL_PROVENANCE", async ({ Given, When, Then }) => {
  const formation = createCampaignFormationRecord({
    id: "formation-heavy-artillery",
    faction: "Player",
    ownership: "core",
    name: "1st Heavy Artillery Group",
    campaignUnitType: "Artillery_155mm",
    locationHexKey: "2,2",
    createdSegment: 0,
    origin: {
      kind: "authored",
      initialHexKey: "2,2",
      legacyGroupIndex: null,
      legacyOrdinal: null,
      legacyLabel: "Heavy Artillery"
    }
  });
  let seed: ReturnType<typeof createCampaignFormationBattleSeed> = null;

  await Given("a persistent heavy-artillery formation committed to a tactical engagement", async () => {
    if (formation.formationKey !== "howitzer") {
      throw new Error(`Expected a deployable howitzer proxy, received ${formation.formationKey}.`);
    }
  });

  await When("the campaign formation is converted to its battle-owned unit", async () => {
    seed = createCampaignFormationBattleSeed(formation, {
      campaignId: "campaign-heavy-artillery",
      engagementId: "engagement-heavy-artillery",
      sourceRevision: 3,
      sourceSegment: 4,
      hex: { q: 0, r: 0 }
    });
  });

  await Then("the deployable proxy keeps the exact persistent identity required by result extraction", async () => {
    if (!seed || seed.unit.type !== "Howitzer_105"
      || seed.unit.campaignProvenance?.formationId !== formation.id
      || seed.unit.campaignProvenance.campaignUnitType !== "Artillery_155mm") {
      throw new Error("Heavy artillery did not receive a complete exact-provenance tactical representation.");
    }
  });
});
