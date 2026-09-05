/**
 * MODULE: CampaignEngagementLedger.test
 * WHAT: Certifies revision-bound formation commitment, frozen battle packages, save continuity, and result idempotency.
 * WHY: C20-021 must prevent double commitment and duplicate campaign consequences before result extraction is added.
 */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignEngagementContext, CampaignPendingEngagement, CampaignScenarioData } from "../src/core/campaignTypes";
import { createCampaignKnowledgeState } from "../src/state/CampaignIntelligence";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import {
  createCampaignRuntime,
  splitLegacyCampaignScenario,
  type CreateCampaignRuntimeOptions
} from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { runCampaignRuntimeTransaction } from "../src/game/campaign/runtime/CampaignRuntimeTransaction";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import type { CampaignRuntimeState } from "../src/game/campaign/runtime/campaignRuntimeTypes";
import {
  assertCampaignBattlePackage,
  commitCampaignEngagement,
  planCampaignEngagement,
  recordCampaignEngagementResolution
} from "../src/game/campaign/engagements/CampaignEngagementLedgerService";
import type {
  CampaignBattlePackage,
  CampaignEngagementCommitmentRequest
} from "../src/game/campaign/engagements/CampaignEngagementLedgerTypes";
import { createCampaignSaveEnvelope, validateCampaignSaveEnvelope } from "../src/game/campaign/persistence/CampaignSaveEnvelope";
import { generateCampaignBattleScenario } from "../src/game/campaign/CampaignBattleGenerator";
import { buildCampaignTacticalSupportAssets } from "../src/game/campaign/CampaignTacticalSupportAdapter";
import { GameEngine } from "../src/game/GameEngine";
import { normalizeScenarioSource, type RawScenarioInput } from "../src/data/scenarioNormalizer";
import { CampaignState } from "../src/state/CampaignState";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import terrainData from "../src/data/terrain.json";
import type { TerrainDictionary, UnitTypeDictionary } from "../src/core/types";

function buildLedgerScenario(): CampaignScenarioData {
  return {
    key: "central_channel",
    title: "Engagement Ledger",
    description: "Commitment and idempotency certification fixture.",
    hexScaleKm: 10,
    dimensions: { cols: 3, rows: 2 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      player: { role: "logisticsHub", factionControl: "Player", supplyValue: 4 },
      fleet: { role: "taskForce", factionControl: "Player", navalCapacity: 14 },
      bot: { role: "fortificationLight", factionControl: "Bot", supplyValue: 2 }
    },
    tiles: [
      { tile: "fleet", hex: { q: 0, r: 1 } },
      {
        tile: "player",
        factionControl: "Player",
        hex: { q: 0, r: 0 },
        forces: [{ unitType: "Infantry_42", count: 2, label: "Allied infantry" }]
      },
      {
        tile: "bot",
        factionControl: "Bot",
        hex: { q: 1, r: 0 },
        forces: [{ unitType: "Panzer_IV", count: 1, label: "Axis armor" }]
      }
    ],
    fronts: [{ key: "ledger-front", label: "Ledger Front", hexKeys: ["0,0", "1,0"], initiative: "Player", modifiers: ["navalSupport"] }],
    objectives: [],
    economies: [
      { faction: "Player", manpower: 1000, supplies: 500, fuel: 400, ammo: 300, airPower: 0, navalPower: 0, intelCoverage: 0 },
      { faction: "Bot", manpower: 900, supplies: 450, fuel: 350, ammo: 250, airPower: 0, navalPower: 0, intelCoverage: 0 }
    ]
  };
}

function buildContext(): CampaignEngagementContext {
  return {
    engagementId: "ledger-engagement",
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
    rpReserve: 250,
    playerForceValue: 100,
    enemyForceValue: 100,
    forceRatio: 1,
    templateKey: null,
    frontKey: "ledger-front",
    objectiveKey: null
  };
}

function createLedgerRuntime(): CampaignRuntimeState {
  const scenario = buildLedgerScenario();
  const context = buildContext();
  const engagement: CampaignPendingEngagement = {
    id: context.engagementId,
    frontKey: context.frontKey,
    objectiveKey: null,
    attacker: context.attacker,
    defender: context.defender,
    hexKeys: [context.battleHexKey],
    tags: ["ledger"],
    context
  };
  const options: CreateCampaignRuntimeOptions = {
    campaignId: "campaign-ledger-test",
    seed: 2041,
    currentSegment: 3,
    turnState: null,
    queuedDecisions: [],
    engagements: [engagement],
    activeEngagementId: null,
    knowledgeByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 3),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 3)
    }
  };
  return createCampaignRuntime(splitLegacyCampaignScenario(scenario), options);
}

function planRuntime(source: CampaignRuntimeState): CampaignRuntimeState {
  const result = runCampaignRuntimeTransaction(source, "test:plan-engagement", (draft) => {
    planCampaignEngagement(draft, "ledger-engagement");
    return [];
  });
  if (!result.ok) throw result.error;
  return result.state;
}

function commitmentRequest(revision: number, infantry = 1): CampaignEngagementCommitmentRequest {
  return {
    engagementId: "ledger-engagement",
    expectedRevision: revision,
    selections: [
      { allocationKey: "infantry", category: "units", quantity: infantry, unitRpCost: 50 },
      { allocationKey: "ammo", category: "supplies", quantity: 1, unitRpCost: 100 }
    ]
  };
}

function commitRuntime(source: CampaignRuntimeState): { runtime: CampaignRuntimeState; pkg: CampaignBattlePackage } {
  let pkg: CampaignBattlePackage | null = null;
  const request = commitmentRequest(source.revision);
  const result = runCampaignRuntimeTransaction(source, "test:commit-engagement", (draft) => {
    pkg = commitCampaignEngagement(draft, request).package;
    return [];
  });
  if (!result.ok) throw result.error;
  if (!pkg) throw new Error("Commitment transaction produced no package.");
  return { runtime: result.state, pkg };
}

registerTest("CAMPAIGN_ENGAGEMENT_LEDGER_LOCKS_EXACT_REVISION_BOUND_PACKAGE", async ({ Given, When, Then }) => {
  let planned: CampaignRuntimeState;
  let committed: CampaignRuntimeState;
  let pkg: CampaignBattlePackage;

  await Given("a planned engagement with persistent formations on both sides", () => {
    planned = planRuntime(createLedgerRuntime());
  });

  await When("the commander commits one infantry formation and a consumable package", () => {
    ({ runtime: committed, pkg } = commitRuntime(planned));
  });

  await Then("one immutable package exclusively locks the exact attacker and defender formations", () => {
    assertCampaignBattlePackage(pkg, {
      campaignId: committed.campaignId,
      scenarioKey: committed.scenarioKey,
      engagementId: "ledger-engagement"
    });
    if (pkg.sourceRevision !== planned.revision || pkg.committedRevision !== committed.revision) {
      throw new Error("Battle package did not bind the source and committed campaign revisions.");
    }
    const attackers = pkg.formationCommitments.filter((entry) => entry.role === "attacker");
    const defenders = pkg.formationCommitments.filter((entry) => entry.role === "defender");
    if (attackers.length !== 1 || defenders.length !== 1 || pkg.supportCommitments[0]?.allocationKey !== "ammo") {
      throw new Error("Battle package did not freeze the exact formation and support selections.");
    }
    const committedIds = new Set(pkg.formationCommitments.map((entry) => entry.formationId));
    const locked = committed.formationOrder.filter((id) => committed.formations[id]?.status === "committed");
    if (locked.length !== 2 || locked.some((id) => !committedIds.has(id))) {
      throw new Error("Formation locks do not match the frozen package.");
    }
    const issues = validateCampaignRuntimeState(committed);
    if (issues.length > 0) throw new Error(`Committed runtime failed invariants: ${issues[0].message}`);
  });
});

registerTest("CAMPAIGN_ENGAGEMENT_LEDGER_INTERRUPTS_A_DEFENDER_ACTIVE_ORDER", async ({ Given, When, Then }) => {
  let planned: CampaignRuntimeState;
  let committed: CampaignRuntimeState;
  let pkg: CampaignBattlePackage;
  let defenderId = "";

  await Given("an eligible defending formation already carrying out a strategic order at the attacked hex", () => {
    planned = planRuntime(createLedgerRuntime());
    defenderId = planned.engagements["ledger-engagement"]?.engagement.context?.enemyForces[0]?.formationIds?.[0] ?? "";
    if (!defenderId || !planned.formations[defenderId]) throw new Error("Defender-order fixture is incomplete.");
    const orderId = "order-defend-current-position";
    const locationHexKey = planned.formations[defenderId].locationHexKey ?? "1,0";
    planned.orders[orderId] = {
      id: orderId,
      faction: "Bot",
      kind: "redeploy",
      status: "executing",
      issuedSegment: planned.currentSegment,
      earliestStartSegment: planned.currentSegment,
      targetHexKeys: [locationHexKey],
      formationIds: [defenderId],
      dependencies: [],
      reservationIds: [],
      acknowledgementKeys: [],
      executionRefId: null,
      validation: { valid: true, issues: [], validatedRevision: planned.revision },
      payload: {
        originOffsetKey: "1,0",
        destinationOffsetKey: "1,0",
        originRuntimeHexKey: locationHexKey,
        destinationRuntimeHexKey: locationHexKey,
        selections: [{ unitType: planned.formations[defenderId].campaignUnitType, count: 1 }],
        transportModeKey: "march",
        transportCapacityType: null,
        distance: 0,
        timeSegments: 0,
        etaSegment: planned.currentSegment,
        returnEtaSegment: planned.currentSegment,
        fuelCost: 0,
        suppliesCost: 0,
        manpowerCost: 0,
        transportCapacityCost: 0,
        formationIds: [defenderId]
      }
    };
    planned.orderOrder.push(orderId);
    planned.formations[defenderId].currentOrderId = orderId;
    const issues = validateCampaignRuntimeState(planned);
    if (issues.length > 0) throw new Error(`Defender-order fixture failed invariants: ${issues[0].message}`);
  });

  await When("the attacker commits the live engagement", () => {
    ({ runtime: committed, pkg } = commitRuntime(planned));
  });

  await Then("the attacked formation defends in place instead of making the engagement impossible", () => {
    const defender = pkg.formationCommitments.find((entry) => entry.role === "defender");
    if (defender?.formationId !== defenderId || committed.formations[defenderId]?.status !== "committed") {
      throw new Error("The defender's active strategic order prevented an otherwise legal defensive commitment.");
    }
    const issues = validateCampaignRuntimeState(committed);
    if (issues.length > 0) throw new Error(`Committed defender-order runtime failed invariants: ${issues[0].message}`);
  });
});

registerTest("CAMPAIGN_ENGAGEMENT_LEDGER_COMMITS_NAVAL_SUPPORT_WITHOUT_A_FAKE_FORMATION", async ({ Given, When, Then }) => {
  let planned: CampaignRuntimeState;
  let committed: CampaignRuntimeState;
  let pkg: CampaignBattlePackage;

  await Given("a coastal package with one task-force fire-support entitlement and persistent ground formations", () => {
    const runtime = createLedgerRuntime();
    const context = runtime.engagements["ledger-engagement"]?.engagement.context;
    if (!context) throw new Error("Ledger fixture lost its engagement context.");
    context.coastal = true;
    context.availableForces.push({ hexKey: "0,1", unitType: "Battleship", count: 1 });
    context.allocationCaps.shoreFireControlParty = 1;
    planned = planRuntime(runtime);
  });

  await When("the commander commits infantry and the advertised naval gunfire option", () => {
    let frozen: CampaignBattlePackage | null = null;
    const request: CampaignEngagementCommitmentRequest = {
      engagementId: "ledger-engagement",
      expectedRevision: planned.revision,
      selections: [
        { allocationKey: "infantry", category: "units", quantity: 1, unitRpCost: 50 },
        { allocationKey: "shoreFireControlParty", category: "support", quantity: 1, unitRpCost: 70 }
      ]
    };
    const result = runCampaignRuntimeTransaction(planned, "test:commit-naval-support", (draft) => {
      frozen = commitCampaignEngagement(draft, request, splitLegacyCampaignScenario(buildLedgerScenario())).package;
      return [];
    });
    if (!result.ok) throw result.error;
    if (!frozen) throw new Error("Naval-support commitment produced no package.");
    committed = result.state;
    pkg = frozen;
  });

  await Then("the fleet becomes an exact support commitment while only real formations enter the ground roster", () => {
    const naval = pkg.supportCommitments.find((entry) => entry.allocationKey === "shoreFireControlParty");
    if (!naval || naval.quantity !== 1 || naval.reservedRp !== 70 || !naval.navalSources?.[0]) {
      throw new Error("The in-range task force did not become a frozen naval support commitment.");
    }
    if (pkg.formationCommitments.some((entry) => entry.allocationKey === "shoreFireControlParty")) {
      throw new Error("Naval support was misrepresented as a persistent ground formation.");
    }
    const raw = generateCampaignBattleScenario(pkg.context, committed, pkg);
    const normalized = normalizeScenarioSource(raw as RawScenarioInput, { turnLimit: 10 });
    const supportAssets = buildCampaignTacticalSupportAssets(pkg);
    const engine = new GameEngine({
      scenario: normalized,
      unitTypes: unitTypesData as UnitTypeDictionary,
      terrain: terrainData as TerrainDictionary,
      playerSide: normalized.sides.Player,
      botSide: normalized.sides.Bot,
      initialSupportAssets: supportAssets
    });
    const seeded = engine.supportAssets;
    if (normalized.sides.Bot.units.length === 0
      || supportAssets.length !== 1
      || seeded.length !== 1
      || seeded[0]?.id !== supportAssets[0]?.id
      || seeded[0]?.label !== `${naval.navalSources[0].label} naval gunfire`
      || seeded[0]?.charges !== 2
      || seeded[0]?.strikeDamageCap !== 30) {
      throw new Error("The committed naval support package did not seed one real tactical NGFS asset.");
    }
    const noSupport: CampaignBattlePackage = {
      ...structuredClone(pkg),
      supportCommitments: []
    };
    if (buildCampaignTacticalSupportAssets(noSupport).length !== 0) {
      throw new Error("A package without naval selection received a tactical support asset.");
    }
  });
});

registerTest("CAMPAIGN_ENGAGEMENT_LEDGER_REJECTS_STALE_OR_CONFLICTING_COMMITMENT", async ({ Given, When, Then }) => {
  const planned = planRuntime(createLedgerRuntime());
  const { runtime: committed, pkg } = commitRuntime(planned);
  let staleRejected = false;
  let conflictRejected = false;

  await Given("an engagement package already committed from a known campaign revision", () => {});

  await When("the same request is replayed and stale or changed requests are attempted", () => {
    const replay = commitCampaignEngagement(structuredClone(committed), commitmentRequest(planned.revision));
    if (!replay.alreadyCommitted || replay.package.packageId !== pkg.packageId) {
      throw new Error("Identical commitment replay did not return the original package as a no-op.");
    }
    try {
      commitCampaignEngagement(structuredClone(planned), commitmentRequest(planned.revision - 1));
    } catch {
      staleRejected = true;
    }
    try {
      commitCampaignEngagement(structuredClone(committed), commitmentRequest(planned.revision, 2));
    } catch {
      conflictRejected = true;
    }
  });

  await Then("no duplicate package, stale launch, or changed recommitment can enter campaign truth", () => {
    if (!staleRejected || !conflictRejected) {
      throw new Error("The engagement ledger accepted a stale or conflicting commitment request.");
    }
    if (committed.engagementLedgerOrder.length !== 1) {
      throw new Error("Idempotent commitment created a duplicate ledger record.");
    }
  });
});

registerTest("CAMPAIGN_STATE_DISCARDS_ONLY_UNCOMMITTED_PRECOMBAT_PLANS", async ({ Given, When, Then }) => {
  const campaign = new CampaignState({ legacyStorage: null });
  let beforeEconomy = "";
  let discarded: ReturnType<CampaignState["discardActiveUncommittedEngagement"]>;

  await Given("an active Player-created engagement with no frozen battle package", () => {
    campaign.setScenario(buildLedgerScenario());
    const context = buildContext();
    campaign.setPendingEngagements([{
      id: context.engagementId,
      frontKey: context.frontKey,
      objectiveKey: null,
      attacker: context.attacker,
      defender: context.defender,
      hexKeys: [context.battleHexKey],
      tags: ["ledger"],
      context
    }]);
    campaign.setActiveEngagementId(context.engagementId);
    beforeEconomy = computeCampaignContentHash(campaign.getRuntimeSnapshot()?.factions.Player?.economy ?? {});
  });

  await When("the commander returns from precombat before committing forces", () => {
    discarded = campaign.discardActiveUncommittedEngagement();
  });

  await Then("the queue is removed atomically, its ledger is cancelled, and committed packages remain protected", () => {
    const after = campaign.getRuntimeSnapshot();
    if (!discarded.ok
      || campaign.getActiveEngagementId() !== null
      || campaign.getPendingEngagements().length !== 0
      || after?.status !== "planning"
      || after.engagementOrder.length !== 0
      || after.engagementLedger["ledger-engagement"]?.status !== "cancelled"
      || computeCampaignContentHash(after.factions.Player.economy) !== beforeEconomy) {
      throw new Error("Discarding an uncommitted precombat plan left ghost state or changed resources.");
    }

    const context = { ...buildContext(), engagementId: "ledger-engagement-requeued" };
    campaign.setPendingEngagements([{
      id: context.engagementId,
      frontKey: context.frontKey,
      objectiveKey: null,
      attacker: context.attacker,
      defender: context.defender,
      hexKeys: [context.battleHexKey],
      tags: ["ledger"],
      context
    }]);
    campaign.setActiveEngagementId(context.engagementId);
    if (campaign.getPendingEngagements().length !== 1) throw new Error("A fresh queue did not create exactly one engagement.");
    const runtime = campaign.getRuntimeSnapshot();
    if (!runtime) throw new Error("Requeued runtime was unavailable.");
    const commitment = campaign.commitCampaignEngagement({
      ...commitmentRequest(runtime.revision),
      engagementId: context.engagementId
    });
    if (!commitment.ok) throw new Error(commitment.reason);
    const blocked = campaign.discardActiveUncommittedEngagement();
    if (blocked.ok || !/committed battle packages cannot be discarded/i.test(blocked.reason)) {
      throw new Error("Committed precombat package was not protected from discard.");
    }
  });
});

registerTest("CAMPAIGN_ENGAGEMENT_LEDGER_PERSISTS_AND_ACCEPTS_RESULT_ONCE", async ({ Given, When, Then }) => {
  const { runtime: committed, pkg } = commitRuntime(planRuntime(createLedgerRuntime()));
  let resolved: CampaignRuntimeState;

  await Given("a checksummed campaign save with an active frozen package", () => {
    const envelope = createCampaignSaveEnvelope({
      saveId: "save-ledger-test",
      slotType: "manual",
      gameMode: "campaign",
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
      buildVersion: "test",
      contentVersion: "test",
      scenarioKey: committed.scenarioKey,
      campaignId: committed.campaignId,
      engagementId: committed.activeEngagementId,
      display: {
        campaignTitle: "Engagement Ledger",
        segment: committed.currentSegment,
        phaseLabel: "Tactical engagement",
        lastEventSummary: null,
        playTimeSeconds: 0,
        difficulty: "Normal",
        result: null,
        thumbnailKey: null
      },
      payload: {
        runtime: committed,
        activeBattle: null,
        commanderRosterLink: null,
        uiResumeContext: { workspace: "operations", selectedEntityId: pkg.packageId, mapCenter: null, mapZoom: null }
      }
    });
    const validation = validateCampaignSaveEnvelope(envelope);
    if (!validation.ok) throw new Error(validation.error.message);
  });

  await When("one result receipt resolves the ledger and releases its temporary formation locks", () => {
    const result = runCampaignRuntimeTransaction(committed, "test:resolve-engagement", (draft) => {
      recordCampaignEngagementResolution(draft, "ledger-engagement", "resolution-ledger-1", { result: "victory" });
      draft.engagementOrder.splice(0, draft.engagementOrder.length);
      delete draft.engagements["ledger-engagement"];
      draft.activeEngagementId = null;
      draft.status = "planning";
      return [];
    });
    if (!result.ok) throw result.error;
    resolved = result.state;
  });

  await Then("the same result is a no-op while a different second result is rejected", () => {
    const replay = recordCampaignEngagementResolution(
      structuredClone(resolved),
      "ledger-engagement",
      "resolution-ledger-1",
      { result: "victory" }
    );
    if (!replay.duplicate) throw new Error("Duplicate result receipt was not identified as a no-op.");
    let secondRejected = false;
    try {
      recordCampaignEngagementResolution(
        structuredClone(resolved),
        "ledger-engagement",
        "resolution-ledger-2",
        { result: "defeat" }
      );
    } catch {
      secondRejected = true;
    }
    if (!secondRejected) throw new Error("A second conflicting result was accepted.");
    const ledger = resolved.engagementLedger["ledger-engagement"];
    if (ledger?.status !== "resolved" || ledger.appliedResolutionIds.length !== 1
      || committed.formationOrder.some((id) => resolved.formations[id]?.status === "committed")) {
      throw new Error("Resolved ledger did not preserve one receipt and release its formation locks.");
    }
  });
});

registerTest("CAMPAIGN_STATE_APPLIES_ENGAGEMENT_RESULT_EFFECTS_EXACTLY_ONCE", async ({ Given, When, Then }) => {
  const campaign = new CampaignState({ legacyStorage: null });
  let committedRevision = -1;
  let firstResult: ReturnType<CampaignState["applyBattleOutcome"]>;
  let secondResult: ReturnType<CampaignState["applyBattleOutcome"]>;
  let stateAfterFirst: CampaignRuntimeState;
  let stateAfterSecond: CampaignRuntimeState;

  await Given("a live campaign whose selected engagement has an exact frozen battle package", () => {
    campaign.setScenario(buildLedgerScenario());
    const context = buildContext();
    campaign.setPendingEngagements([{
      id: context.engagementId,
      frontKey: context.frontKey,
      objectiveKey: null,
      attacker: context.attacker,
      defender: context.defender,
      hexKeys: [context.battleHexKey],
      tags: ["ledger"],
      context
    }]);
    campaign.setActiveEngagementId(context.engagementId);
    const planned = campaign.getRuntimeSnapshot();
    if (!planned) throw new Error("Campaign runtime was not created.");
    const committed = campaign.commitCampaignEngagement(commitmentRequest(planned.revision));
    if (!committed.ok) throw new Error(committed.reason);
    const snapshot = campaign.getRuntimeSnapshot();
    if (!snapshot) throw new Error("Committed campaign runtime was not available.");
    committedRevision = snapshot.revision;
  });

  await When("the identical tactical result receipt is submitted twice", () => {
    const outcome = {
      activeEngagementId: "ledger-engagement",
      frontKey: "ledger-front",
      result: "PlayerVictory" as const,
      casualties: 3,
      spentAmmo: 7,
      spentFuel: 5,
      resolutionId: "resolution-state-once"
    };
    firstResult = campaign.applyBattleOutcome(outcome);
    const firstSnapshot = campaign.getRuntimeSnapshot();
    if (!firstSnapshot) throw new Error("Resolved campaign runtime was not available.");
    stateAfterFirst = firstSnapshot;
    secondResult = campaign.applyBattleOutcome(outcome);
    const secondSnapshot = campaign.getRuntimeSnapshot();
    if (!secondSnapshot) throw new Error("Campaign runtime disappeared after result replay.");
    stateAfterSecond = secondSnapshot;
  });

  await Then("resources, front movement, and the campaign revision change only for the first receipt", () => {
    if (!firstResult.applied || firstResult.duplicate || secondResult.applied || !secondResult.duplicate) {
      throw new Error("CampaignState did not distinguish the accepted result from its idempotent replay.");
    }
    if (stateAfterFirst.revision !== committedRevision + 1 || stateAfterSecond.revision !== stateAfterFirst.revision) {
      throw new Error("The duplicate result created an additional campaign revision.");
    }
    if (computeCampaignContentHash(stateAfterSecond) !== computeCampaignContentHash(stateAfterFirst)) {
      throw new Error("The duplicate result changed authoritative campaign truth.");
    }
    const economy = stateAfterFirst.factions.Player?.economy;
    const front = stateAfterFirst.compatibility.initialFronts.find((candidate) => candidate.key === "ledger-front");
    if (economy?.manpower !== 970 || economy.supplies !== 493 || economy.fuel !== 395) {
      throw new Error("The first result did not apply its exact resource consequences once.");
    }
    if (front?.hexKeys.length !== 1 || front.initiative !== "Player") {
      throw new Error("The first result did not apply the expected one-time front consequence.");
    }
  });
});

registerTest("CAMPAIGN_BATTLE_GENERATOR_USES_FROZEN_DEFENDER_COMMITMENT", async ({ Given, When, Then }) => {
  const { runtime, pkg } = commitRuntime(planRuntime(createLedgerRuntime()));
  let normalized: ReturnType<typeof normalizeScenarioSource>;

  await Given("a committed package whose defender identities are frozen", () => {});

  await When("the tactical battle scenario is generated from the package", () => {
    const raw = generateCampaignBattleScenario(pkg.context, runtime, pkg);
    normalized = normalizeScenarioSource(raw as RawScenarioInput, { turnLimit: 10 });
  });

  await Then("the enemy roster contains only the package's committed persistent defenders", () => {
    const expected = pkg.formationCommitments.filter((entry) => entry.role === "defender").map((entry) => entry.formationId);
    const actual = normalized.sides.Bot.units.flatMap((unit) => unit.campaignProvenance?.formationId ?? []);
    if (computeCampaignContentHash(actual.sort()) !== computeCampaignContentHash(expected.sort())) {
      throw new Error(`Generated defender provenance diverged from the frozen package: ${actual.join(", ")}.`);
    }
  });
});
