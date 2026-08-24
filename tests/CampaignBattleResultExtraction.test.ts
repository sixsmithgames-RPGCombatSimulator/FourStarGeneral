/** Certifies C20-022 tactical formation/resource/evidence extraction and immutable campaign handoff. */

import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignEngagementContext, CampaignPendingEngagement, CampaignScenarioData } from "../src/core/campaignTypes";
import type { PersonnelStatusPool, ScenarioUnit } from "../src/core/types";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes";
import { calculateFormationReadiness } from "../src/data/unitSystem/status";
import type { SerializedBattleState } from "../src/game/GameEngine";
import { buildCampaignTacticalSupportAssets } from "../src/game/campaign/CampaignTacticalSupportAdapter";
import { createCampaignFormationBattleSeed } from "../src/game/campaign/formations/CampaignFormationBattleAdapter";
import {
  assertCampaignBattlePackage,
  reconcileCampaignEngagementLedger
} from "../src/game/campaign/engagements/CampaignEngagementLedgerService";
import type { CampaignRuntimeState } from "../src/game/campaign/runtime/campaignRuntimeTypes";
import {
  createCampaignSaveEnvelope,
  validateCampaignSaveEnvelope
} from "../src/game/campaign/persistence/CampaignSaveEnvelope";
import {
  assertCampaignBattleResultPackage,
  extractCampaignBattleResultPackage
} from "../src/game/campaign/results/CampaignBattleResultExtractor";
import type { CampaignBattleResultPackage } from "../src/game/campaign/results/CampaignBattleResultTypes";
import { CampaignState } from "../src/state/CampaignState";
import type { CampaignSaveStorageBackend } from "../src/game/campaign/persistence/CampaignSaveTypes";
import type { MissionStatus } from "../src/state/missionRules";

export function scenarioFixture(): CampaignScenarioData {
  return {
    key: "result-extraction",
    title: "Result Extraction",
    description: "C20-022 certification fixture.",
    hexScaleKm: 10,
    dimensions: { cols: 3, rows: 2 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      player: { role: "logisticsHub", factionControl: "Player", supplyValue: 4, productionCapacity: 4 },
      bot: { role: "fortificationLight", factionControl: "Bot", supplyValue: 2 }
    },
    tiles: [
      { tile: "player", factionControl: "Player", hex: { q: 0, r: 0 }, forces: [{ unitType: "Infantry_42", count: 1 }] },
      { tile: "bot", factionControl: "Bot", hex: { q: 1, r: 0 }, forces: [{ unitType: "Panzer_IV", count: 1 }] }
    ],
    fronts: [{ key: "result-front", label: "Result Front", hexKeys: ["0,0", "1,0"], initiative: "Player" }],
    objectives: [],
    economies: [
      { faction: "Player", manpower: 1000, supplies: 500, fuel: 400, ammo: 300, airPower: 0, navalPower: 0, intelCoverage: 0 },
      { faction: "Bot", manpower: 900, supplies: 450, fuel: 350, ammo: 250, airPower: 0, navalPower: 0, intelCoverage: 0 }
    ]
  };
}

export function contextFixture(): CampaignEngagementContext {
  return {
    engagementId: "result-engagement",
    battleHexKey: "1,0",
    attacker: "Player",
    defender: "Bot",
    missionType: "lineAssault",
    amphibious: false,
    coastal: false,
    availableForces: [{ hexKey: "0,0", unitType: "Infantry_42", count: 1 }],
    allocationCaps: { infantry: 1 },
    enemyForces: [{ hexKey: "1,0", unitType: "Panzer_IV", count: 1 }],
    airSorties: 0,
    rpReserve: 250,
    playerForceValue: 100,
    enemyForceValue: 100,
    forceRatio: 1,
    templateKey: null,
    frontKey: "result-front",
    objectiveKey: null
  };
}

export function commitFixture(saveBackend?: CampaignSaveStorageBackend): { campaign: CampaignState; runtime: CampaignRuntimeState; pkg: NonNullable<ReturnType<CampaignState["getActiveCampaignBattlePackage"]>> } {
  const campaign = new CampaignState({ legacyStorage: null, saveBackend });
  campaign.setScenario(scenarioFixture());
  const context = contextFixture();
  const engagement: CampaignPendingEngagement = {
    id: context.engagementId,
    frontKey: context.frontKey,
    objectiveKey: null,
    attacker: context.attacker,
    defender: context.defender,
    hexKeys: [context.battleHexKey],
    tags: ["result"],
    context
  };
  campaign.setPendingEngagements([engagement]);
  campaign.setActiveEngagementId(engagement.id);
  const planned = campaign.getRuntimeSnapshot();
  if (!planned) throw new Error("Campaign runtime was not created.");
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
  if (!runtime) throw new Error("Committed campaign runtime was unavailable.");
  return { campaign, runtime, pkg: committed.package };
}

export function commitNavalFixture(): ReturnType<typeof commitFixture> {
  const campaign = new CampaignState({ legacyStorage: null });
  campaign.setScenario(scenarioFixture());
  const context = contextFixture();
  context.coastal = true;
  context.allocationCaps.shoreFireControlParty = 1;
  const engagement: CampaignPendingEngagement = {
    id: context.engagementId,
    frontKey: context.frontKey,
    objectiveKey: null,
    attacker: context.attacker,
    defender: context.defender,
    hexKeys: [context.battleHexKey],
    tags: ["result", "navalSupport"],
    context
  };
  campaign.setPendingEngagements([engagement]);
  campaign.setActiveEngagementId(engagement.id);
  const planned = campaign.getRuntimeSnapshot();
  if (!planned) throw new Error("Naval campaign runtime was not created.");
  const committed = campaign.commitCampaignEngagement({
    engagementId: engagement.id,
    expectedRevision: planned.revision,
    selections: [
      { allocationKey: "infantry", category: "units", quantity: 1, unitRpCost: 50 },
      { allocationKey: "shoreFireControlParty", category: "support", quantity: 1, unitRpCost: 70 }
    ]
  });
  if (!committed.ok) throw new Error(committed.reason);
  const runtime = campaign.getRuntimeSnapshot();
  if (!runtime) throw new Error("Committed naval campaign runtime was unavailable.");
  return { campaign, runtime, pkg: committed.package };
}

function shiftPersonnelToKilled(unit: ScenarioUnit, count: number): void {
  const status = unit.status;
  if (!status) throw new Error("Campaign tactical unit has no status pools.");
  const first = Object.values(status.personnel)[0] as PersonnelStatusPool | undefined;
  if (!first) throw new Error("Campaign tactical unit has no personnel component.");
  const applied = Math.min(first.fit, count);
  first.fit -= applied;
  first.killed += applied;
  unit.strength = calculateFormationReadiness(status, unit.strength).readiness;
}

function tacticalUnitFor(
  runtime: CampaignRuntimeState,
  pkg: ReturnType<typeof commitFixture>["pkg"],
  role: "attacker" | "defender"
): ScenarioUnit {
  const commitment = pkg.formationCommitments.find((entry) => entry.role === role);
  if (!commitment) throw new Error(`Missing ${role} commitment.`);
  const formation = runtime.formations[commitment.formationId];
  if (!formation) throw new Error(`Missing formation ${commitment.formationId}.`);
  const seed = createCampaignFormationBattleSeed(formation, {
    campaignId: pkg.campaignId,
    engagementId: pkg.engagementId,
    sourceRevision: pkg.sourceRevision,
    sourceSegment: pkg.committedSegment,
    hex: role === "attacker" ? { q: 0, r: 0 } : { q: 1, r: 0 }
  });
  if (!seed) throw new Error(`Could not create ${role} tactical seed.`);
  return seed.unit;
}

export function tacticalStateFixture(runtime: CampaignRuntimeState, pkg: ReturnType<typeof commitFixture>["pkg"]): SerializedBattleState {
  const attacker = tacticalUnitFor(runtime, pkg, "attacker");
  shiftPersonnelToKilled(attacker, 4);
  attacker.ammo = Math.max(0, attacker.ammo - 2);
  attacker.fuel = Math.max(0, attacker.fuel - 1);
  if (attacker.status) attacker.status.fatigue = 7;

  const defender = tacticalUnitFor(runtime, pkg, "defender");
  shiftPersonnelToKilled(defender, 8);
  defender.strength = 0;

  return {
    completeStateVersion: 1,
    phase: "completed",
    activeFaction: "Player",
    turnNumber: 4,
    baseCamp: null,
    playerPlacements: [attacker],
    botPlacements: [],
    allyPlacements: [],
    reserves: [],
    airborneReserves: [],
    casualtyLog: [{
      unit: defender,
      definition: structuredClone(unitTypesData[defender.type]),
      unitKey: defender.formationKey ?? null,
      label: defender.campaignProvenance?.formationName ?? String(defender.type),
      recordedAt: "battle:4:1"
    }],
    supplyStates: {
      Player: {
        inventory: {
          ammo: { current: 20, baseline: 26, bonus: 0 },
          fuel: { current: 18, baseline: 20, bonus: 0 },
          rations: { current: 10, baseline: 10, bonus: 0 },
          parts: { current: 10, baseline: 10, bonus: 0 }
        },
        pending: [],
        productionRate: { ammo: 0, fuel: 0, rations: 0, parts: 0 },
        ledger: [
          { id: "ammo-use", turn: 2, type: "ammo", delta: -6, reason: "combat", timestamp: "battle:2:1" },
          { id: "fuel-use", turn: 3, type: "fuel", delta: -2, reason: "movement", timestamp: "battle:3:1" }
        ],
        lastUpdatedTurn: 4
      },
      Bot: {
        inventory: {
          ammo: { current: 5, baseline: 8, bonus: 0 },
          fuel: { current: 6, baseline: 7, bonus: 0 },
          rations: { current: 0, baseline: 0, bonus: 0 },
          parts: { current: 0, baseline: 0, bonus: 0 }
        },
        pending: [],
        productionRate: { ammo: 0, fuel: 0, rations: 0, parts: 0 },
        ledger: [{ id: "bot-ammo", turn: 2, type: "ammo", delta: -3, reason: "combat", timestamp: "battle:2:2" }],
        lastUpdatedTurn: 4
      },
      Ally: {
        inventory: {
          ammo: { current: 0, baseline: 0, bonus: 0 }, fuel: { current: 0, baseline: 0, bonus: 0 },
          rations: { current: 0, baseline: 0, bonus: 0 }, parts: { current: 0, baseline: 0, bonus: 0 }
        },
        pending: [], productionRate: { ammo: 0, fuel: 0, rations: 0, parts: 0 }, ledger: [], lastUpdatedTurn: 4
      }
    },
    battleRequisitionPointsSpent: 3,
    enemyContactStates: [{
      unitId: defender.unitId!,
      state: "identified",
      lastSeenTurn: 4,
      lastKnownHex: { q: 1, r: 0 },
      lastKnownStrength: 0,
      knownUnitType: defender.type,
      source: "combat contact"
    }],
    hexModifications: [{
      type: "fortifications",
      hex: { q: 1, r: 0 },
      faction: "Bot",
      integrity: 35,
      maxIntegrity: 100,
      damageState: "breached"
    }]
  };
}

export const missionStatus: MissionStatus = {
  turn: 4,
  objectives: [
    { id: "primary", label: "Take the position", tier: "primary", state: "completed", detail: "Position secured." },
    { id: "secondary", label: "Preserve the force", tier: "secondary", state: "failed" }
  ],
  outcome: { state: "playerVictory", reason: "Primary objective secured." }
};

registerTest("CAMPAIGN_BATTLE_RESULT_EXTRACTS_COMPLETE_DETERMINISTIC_FACTS", async ({ Given, When, Then }) => {
  const { runtime, pkg } = commitFixture();
  const tacticalState = tacticalStateFixture(runtime, pkg);
  let result: CampaignBattleResultPackage;

  await Given("a terminal complete tactical state bound to one frozen campaign package", () => {});

  await When("the campaign result package is extracted twice from identical truth", () => {
    result = extractCampaignBattleResultPackage({ battlePackage: pkg, tacticalState, missionStatus, result: "attackerVictory" });
    const replay = extractCampaignBattleResultPackage({ battlePackage: pkg, tacticalState, missionStatus, result: "attackerVictory" });
    if (replay.integrityHash !== result.integrityHash || replay.resolutionId !== result.resolutionId) {
      throw new Error("Identical tactical truth did not produce one deterministic result identity.");
    }
  });

  await Then("formation, objective, support, resource, infrastructure, and faction-private evidence are complete", () => {
    assertCampaignBattleResultPackage(result, pkg);
    if (result.formationDeltas.length !== pkg.formationCommitments.length) {
      throw new Error("The result did not reconcile every committed formation.");
    }
    const attacker = result.formationDeltas.find((entry) => entry.role === "attacker");
    const defender = result.formationDeltas.find((entry) => entry.role === "defender");
    if (!attacker || attacker.personnelBefore - attacker.personnelAfter !== 4
      || attacker.supplyBefore.ammo - attacker.supplyAfter.ammo !== 2
      || attacker.fatigueGained !== 7 || attacker.status !== "survived") {
      throw new Error("Attacker personnel, supply, fatigue, or survival delta is incomplete.");
    }
    if (!defender || defender.tacticalDisposition !== "casualty" || defender.status !== "shattered") {
      throw new Error("Destroyed tactical defender did not retain its survivor/equipment tombstone as shattered.");
    }
    if (result.objectiveResults.length !== 2 || result.resourcesConsumed.Player?.ammo !== 6
      || result.resourcesConsumed.Player?.fuel !== 2 || result.resourcesConsumed.Bot?.ammo !== 3
      || result.supportDeltas[0]?.trackingMode !== "resourcePool"
      || result.supportDeltas[0]?.resourcePayloadCommitted.ammo !== 36
      || result.infrastructureDamage[0]?.integrityAfter !== 35) {
      throw new Error("The result omitted objective, support, resource, or infrastructure facts.");
    }
    const defenderId = defender.campaignFormationId;
    const playerEvidence = result.observedEvidenceByFaction.Player ?? [];
    if (playerEvidence.some((entry) => entry.kind === "enemyContact" && (entry.ownFormationId || entry.summary.includes(defenderId)))) {
      throw new Error("Player contact evidence leaked the defender's persistent campaign identity.");
    }
  });
});

registerTest("CAMPAIGN_BATTLE_RESULT_REJECTS_MISSING_OR_TAMPERED_COMMITMENTS", async ({ Given, When, Then }) => {
  const { runtime, pkg } = commitFixture();
  const tacticalState = tacticalStateFixture(runtime, pkg);
  let missingRejected = false;
  let tamperRejected = false;

  await Given("a frozen package that requires exact tactical identities", () => {});

  await When("a committed unit is omitted and a valid result is later modified", () => {
    const incomplete = structuredClone(tacticalState);
    incomplete.casualtyLog = [];
    try {
      extractCampaignBattleResultPackage({ battlePackage: pkg, tacticalState: incomplete, missionStatus, result: "attackerVictory" });
    } catch {
      missingRejected = true;
    }
    const result = extractCampaignBattleResultPackage({ battlePackage: pkg, tacticalState, missionStatus, result: "attackerVictory" });
    const tampered = structuredClone(result);
    (tampered.formationDeltas[0] as { readinessAfter: number }).readinessAfter += 1;
    try {
      assertCampaignBattleResultPackage(tampered, pkg);
    } catch {
      tamperRejected = true;
    }
  });

  await Then("the extraction and integrity gates reject both unsafe packages", () => {
    if (!missingRejected || !tamperRejected) throw new Error("C20-022 accepted incomplete or modified tactical truth.");
  });
});

registerTest("CAMPAIGN_NAVAL_SUPPORT_REACHES_TACTICAL_PLAY_AND_RECONCILES_CHARGE_USE", async ({ Given, When, Then }) => {
  const { campaign, runtime, pkg } = commitNavalFixture();
  const tacticalState = tacticalStateFixture(runtime, pkg);
  const assets = buildCampaignTacticalSupportAssets(pkg);
  if (assets.length !== 1) throw new Error("Naval fixture did not create exactly one support asset.");
  tacticalState.supportAssets = assets.map((asset) => ({ ...asset, charges: asset.maxCharges - 1 }));
  let result: CampaignBattleResultPackage;
  let missingRejected = false;

  await Given("a frozen naval-support commitment whose tactical asset expended one fire mission", () => {});

  await When("the terminal tactical state is extracted and applied to campaign accounting", () => {
    result = extractCampaignBattleResultPackage({
      battlePackage: pkg,
      tacticalState,
      missionStatus,
      result: "attackerVictory"
    });
    const missing = structuredClone(tacticalState);
    missing.supportAssets = [];
    try {
      extractCampaignBattleResultPackage({
        battlePackage: pkg,
        tacticalState: missing,
        missionStatus,
        result: "attackerVictory"
      });
    } catch {
      missingRejected = true;
    }
    const applied = campaign.applyCampaignBattleResult(result);
    if (!applied.applied || applied.duplicate) {
      throw new Error("The naval-support result did not apply once.");
    }
  });

  await Then("the exact NGFS asset, charge use, and campaign cost reconcile without a fake ground unit", () => {
    const delta = result.supportDeltas[0];
    const consequence = campaign.getCampaignBattleConsequenceReport(pkg.engagementId)?.supportConsequences[0];
    if (!missingRejected
      || !delta
      || delta.trackingMode !== "supportAsset"
      || delta.tacticalElementIds[0] !== assets[0]?.id
      || delta.chargesUsed !== 1
      || delta.survivingElements !== 1
      || delta.lostElements !== 0
      || consequence?.chargesUsed !== 1
      || consequence.consumedRequisitionPoints !== 70
      || consequence.refundedRequisitionPoints !== 0) {
      throw new Error("Tactical NGFS availability, use, or campaign consequence accounting diverged.");
    }
  });
});

registerTest("CAMPAIGN_STATE_RETAINS_TYPED_BATTLE_RESULT_ONCE", async ({ Given, When, Then }) => {
  const { campaign, runtime, pkg } = commitFixture();
  const result = extractCampaignBattleResultPackage({
    battlePackage: pkg,
    tacticalState: tacticalStateFixture(runtime, pkg),
    missionStatus,
    result: "attackerVictory"
  });
  let revisionAfterFirst = -1;

  await Given("one integrity-checked C20-022 result ready for campaign handoff", () => {});

  await When("headquarters accepts it and receives the same package again", () => {
    const first = campaign.applyCampaignBattleResult(result);
    if (!first.applied || first.duplicate) throw new Error("The first typed result was not applied.");
    revisionAfterFirst = campaign.getRuntimeSnapshot()?.revision ?? -1;
    const replay = campaign.applyCampaignBattleResult(result);
    if (replay.applied || !replay.duplicate) throw new Error("The typed result replay was not idempotent.");
  });

  await Then("the full result remains in the terminal ledger and the replay changes no campaign truth", () => {
    const retained = campaign.getCampaignBattleResultPackage(result.engagementId);
    const runtimeAfter = campaign.getRuntimeSnapshot();
    if (!retained || retained.integrityHash !== result.integrityHash
      || runtimeAfter?.revision !== revisionAfterFirst
      || runtimeAfter.engagementLedger[result.engagementId]?.appliedResolutionIds.length !== 1) {
      throw new Error("CampaignState did not retain one immutable typed tactical result receipt.");
    }
    const envelope = createCampaignSaveEnvelope({
      saveId: "save-result-extraction",
      slotType: "manual",
      gameMode: "campaign",
      createdAt: "2026-08-05T12:00:00.000Z",
      updatedAt: "2026-08-05T12:00:00.000Z",
      buildVersion: "test",
      contentVersion: "test",
      scenarioKey: runtimeAfter.scenarioKey,
      campaignId: runtimeAfter.campaignId,
      engagementId: null,
      display: {
        campaignTitle: "Result Extraction",
        segment: runtimeAfter.currentSegment,
        phaseLabel: "After action",
        lastEventSummary: null,
        playTimeSeconds: 0,
        difficulty: "Normal",
        result: "victory",
        thumbnailKey: null
      },
      payload: {
        runtime: runtimeAfter,
        activeBattle: null,
        commanderRosterLink: null,
        uiResumeContext: { workspace: "operations", selectedEntityId: result.engagementId, mapCenter: null, mapZoom: null }
      }
    });
    const validation = validateCampaignSaveEnvelope(envelope);
    if (!validation.ok) throw new Error(`Saved result package failed validation: ${validation.error.message}`);
  });
});

registerTest("CAMPAIGN_BATTLE_PACKAGE_V1_DEVELOPMENT_SAVE_UPGRADES_RESULT_BASELINES", async ({ Given, When, Then }) => {
  const { runtime, pkg } = commitFixture();
  const legacyRuntime = structuredClone(runtime);
  const legacyPackage = legacyRuntime.engagementLedger[pkg.engagementId]?.package as unknown as {
    packageVersion: number;
    integrityHash: string;
    formationCommitments: Array<{ before?: unknown }>;
  } | null;

  await Given("a development save written by C20-021 before readable result baselines", () => {
    if (!legacyPackage) throw new Error("Committed package fixture is missing.");
    legacyPackage.packageVersion = 1;
    legacyPackage.integrityHash = "fsg-battle-package-v1-development";
    legacyPackage.formationCommitments.forEach((entry) => { delete entry.before; });
  });

  await When("engagement-ledger reconciliation loads the development package", () => {
    reconcileCampaignEngagementLedger(legacyRuntime);
  });

  await Then("the package is upgraded to version 2 with complete integrity-checked baselines", () => {
    const upgraded = legacyRuntime.engagementLedger[pkg.engagementId]?.package;
    if (!upgraded || upgraded.packageVersion !== 2
      || upgraded.formationCommitments.some((entry) => !entry.before)) {
      throw new Error("C20-021 development package did not receive C20-022 baselines.");
    }
    assertCampaignBattlePackage(upgraded);
  });
});
