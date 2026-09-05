/** FSG-CAM-004: one naval authority from eligibility through saved tactical receipts. */
import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { buildEngagementContext } from "../src/game/campaign/EngagementContextBuilder";
import { CampaignState } from "../src/state/CampaignState";
import { campaignNavalSourceId, evaluateCampaignNavalSupport, migrateCampaignNavalSupport } from "../src/game/campaign/logistics/CampaignNavalSupportService";
import { computeCampaignContentHash } from "../src/game/campaign/runtime/CampaignCanonical";
import { projectLegacyCampaignState, splitLegacyCampaignScenario } from "../src/game/campaign/runtime/CampaignScenarioAdapter";
import { buildCampaignTacticalSupportAssets } from "../src/game/campaign/CampaignTacticalSupportAdapter";
import { assertCampaignBattleResultPackage, computeCampaignBattleResultIntegrity, extractCampaignBattleResultPackage } from "../src/game/campaign/results/CampaignBattleResultExtractor";
import { assertCampaignBattlePackage, computeCampaignBattlePackageIntegrity, commitCampaignEngagement, recordCampaignEngagementResolution } from "../src/game/campaign/engagements/CampaignEngagementLedgerService";
import { tacticalStateFixture } from "./CampaignBattleResultExtraction.test.js";
import { createCampaignSaveEnvelope, validateCampaignSaveEnvelope, computeCampaignSaveChecksum } from "../src/game/campaign/persistence/CampaignSaveEnvelope";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import { assertCampaignAfterActionReport } from "../src/game/campaign/aar/CampaignAfterActionReportService";
import type { CampaignRuntimeState } from "../src/game/campaign/runtime/campaignRuntimeTypes";
import { validateCampaignRuntimeState } from "../src/game/campaign/runtime/CampaignInvariantValidator";
import { refreshCampaignInfrastructureState } from "../src/game/campaign/infrastructure/CampaignInfrastructureRules";
import { runCampaignRuntimeTransaction } from "../src/game/campaign/runtime/CampaignRuntimeTransaction";
import { assertCampaignBattleConsequenceReport, computeCampaignBattleConsequenceIntegrity } from "../src/game/campaign/consequences/CampaignBattleConsequenceResolver";

function navalScenario(): CampaignScenarioData {
  return {
    key: "central_channel", title: "Naval support", description: "Naval authority fixture",
    hexScaleKm: 10, dimensions: { cols: 20, rows: 20 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      player: { role: "region", factionControl: "Player" },
      enemy: { role: "region", factionControl: "Bot" },
      fleet: { role: "taskForce", factionControl: "Player", navalCapacity: 14, mapLabel: "Western Naval Force" },
      hostileFleet: { role: "taskForce", factionControl: "Bot", navalCapacity: 20, mapLabel: "Secret hostile fleet" }
    },
    tiles: [
      { tile: "player", hex: { q: 0, r: 0 }, forces: [{ unitType: "Infantry_42", count: 2 }] },
      { tile: "enemy", hex: { q: 1, r: 0 }, forces: [{ unitType: "Panzer_IV", count: 1 }] },
      { tile: "fleet", hex: { q: 0, r: 1 } },
      { tile: "hostileFleet", hex: { q: 2, r: 0 } }
    ],
    fronts: [{ key: "shore", label: "Shore approaches", hexKeys: ["0,0", "1,0"], initiative: "Player", modifiers: ["navalSupport"] }],
    objectives: [],
    economies: ["Player", "Bot"].map((faction) => ({ faction, manpower: 1000, supplies: 1000, fuel: 500, ammo: 500, airPower: 0, navalPower: 0, intelCoverage: 0 }))
  };
}

function expect(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function expectRejected(action: () => unknown, message: string): void {
  let rejected = false;
  try { action(); } catch { rejected = true; }
  expect(rejected, message);
}

function expectNavalEligibilityRejection(action: () => unknown): void {
  let caught: unknown;
  try { action(); } catch (error) { caught = error; }
  expect(caught instanceof Error && caught.message.includes("Naval support requests 1 assignments but only 0 sources"),
    `Expected naval eligibility rejection, received ${String(caught)}.`);
}

function prepareNaval(scenario = navalScenario(), quantity = 1) {
  const campaign = new CampaignState({ legacyStorage: null, saveBackend: new InMemoryCampaignSaveBackend() });
  campaign.setScenario(scenario);
  const context = campaign.buildCampaignEngagementContext({ engagementId: "naval", battleHexKey: "1,0", attacker: "Player", frontKey: "shore" });
  expect(context, "Missing naval context.");
  campaign.setPendingEngagements([{ id: "naval", frontKey: "shore", objectiveKey: null, attacker: "Player", defender: "Bot", hexKeys: ["1,0"], tags: [], context }]);
  campaign.setActiveEngagementId("naval");
  const request = { engagementId: "naval", expectedRevision: campaign.getRuntimeSnapshot()!.revision, selections: [
    { allocationKey: "infantry", category: "units", quantity: 1, unitRpCost: 50 },
    { allocationKey: "shoreFireControlParty", category: "support", quantity, unitRpCost: 70 }
  ] };
  return { campaign, request, scenario };
}

function committedNaval(scenario = navalScenario(), quantity = 1) {
  const setup = prepareNaval(scenario, quantity);
  const committed = setup.campaign.commitCampaignEngagement(setup.request);
  expect(committed.ok, committed.ok ? "" : committed.reason);
  return { ...setup, pkg: committed.package, runtime: setup.campaign.getRuntimeSnapshot()! };
}

function navalResult(setup: ReturnType<typeof committedNaval>, used: readonly number[] = [1]) {
  const tactical = tacticalStateFixture(setup.runtime, setup.pkg);
  tactical.supportAssets = buildCampaignTacticalSupportAssets(setup.pkg).map((asset, index) => ({ ...asset, charges: asset.maxCharges - (used[index] ?? 0) }));
  tactical.hexModifications = [];
  return extractCampaignBattleResultPackage({ battlePackage: setup.pkg, tacticalState: tactical, missionStatus: null, result: "attackerVictory" });
}

function navalEnvelope(runtime: CampaignRuntimeState) {
  return createCampaignSaveEnvelope({
    saveId: "naval-save", slotType: "manual", gameMode: "campaign", createdAt: "2026-09-05T12:00:00.000Z", updatedAt: "2026-09-05T12:00:00.000Z",
    buildVersion: "naval-test", contentVersion: "naval-rules-1", scenarioKey: runtime.scenarioKey, campaignId: runtime.campaignId,
    engagementId: runtime.activeEngagementId,
    display: { campaignTitle: "Naval authority", segment: runtime.currentSegment, phaseLabel: "Campaign", lastEventSummary: null, playTimeSeconds: 0, difficulty: "Normal", result: null, thumbnailKey: null },
    payload: { runtime, activeBattle: null, commanderRosterLink: null, uiResumeContext: { workspace: "operations", selectedEntityId: null, mapCenter: null, mapZoom: null } }
  });
}

registerTest("FSG_CAM_051_DAMAGED_SOURCE_CANNOT_AUTHORIZE_SUPPORT", () => {
  const scenario = navalScenario();
  scenario.tiles[2].infrastructure = {
    role: "taskForce", integrity: 0, maxIntegrity: 100, effectiveness: 0, damageState: "destroyed",
    disabled: true, capturedBy: null, capturedFrom: null, captureDisruptionUntilSegment: null,
    lastDamageSegment: 1, lastRepairSegment: null, lastCapturedSegment: null, activeRepairOrderId: null
  };
  const context = buildEngagementContext(scenario, { engagementId: "naval", battleHexKey: "1,0", attacker: "Player", frontKey: "shore" });
  expect((context?.allocationCaps.shoreFireControlParty ?? 0) === 0, "Destroyed task force still authorizes naval support.");
});

registerTest("FSG_CAM_052_SCALAR_CAP_CANNOT_CREATE_A_FLEET", () => {
  const campaign = new CampaignState({ legacyStorage: null });
  const scenario = navalScenario();
  scenario.tiles = scenario.tiles.filter((tile) => tile.tile !== "fleet");
  campaign.setScenario(scenario);
  const context = campaign.buildCampaignEngagementContext({ engagementId: "naval", battleHexKey: "1,0", attacker: "Player", frontKey: "shore" });
  expect(context, "Missing test context.");
  context.allocationCaps.shoreFireControlParty = 1;
  campaign.setPendingEngagements([{ id: "naval", frontKey: "shore", objectiveKey: null, attacker: "Player", defender: "Bot", hexKeys: ["1,0"], tags: [], context }]);
  campaign.setActiveEngagementId("naval");
  const result = campaign.commitCampaignEngagement({ engagementId: "naval", expectedRevision: campaign.getRuntimeSnapshot()!.revision, selections: [
    { allocationKey: "infantry", category: "units", quantity: 1, unitRpCost: 50 },
    { allocationKey: "shoreFireControlParty", category: "support", quantity: 1, unitRpCost: 70 }
  ] });
  expect(!result.ok, "A fabricated cap committed naval support without a real source.");
});

registerTest("FSG_CAM_053_ONE_PLAYER_SAFE_AUTHORITY_FOR_READINESS_RANGE_AND_TARGET", () => {
  const scenario = navalScenario();
  scenario.tiles.push({ tile: "fleet", hex: { q: 7, r: 0 } }, { tile: "fleet", hex: { q: 8, r: 0 } });
  scenario.tiles[2].forces = [{ unitType: "Battleship", count: 4 }];
  const before = computeCampaignContentHash(scenario);
  const target = { battleHexKey: "1,0", frontKey: "shore" };
  const view = evaluateCampaignNavalSupport(scenario, target);
  expect(view.sources.length === 3 && view.availableSupportAssignments === 2, "Naval sources leaked enemy identity, counted warships twice, or lost the inclusive six-hex boundary.");
  expect(view.availableFireMissions === view.availableSupportAssignments * view.fireMissionsPerAssignment, "Ready fleet fire missions do not match assignment capacity.");
  expect(view.sources.find((source) => source.sourceHexKey === "8,4")?.status === "outOfRange", "Seven-hex source passed range authority.");
  expect(!JSON.stringify(view).includes("Secret hostile"), "Projection leaked hostile fleet.");
  const context = buildEngagementContext(scenario, { ...target, attacker: "Player", engagementId: "naval" });
  expect(context?.allocationCaps.shoreFireControlParty === view.availableSupportAssignments, "Engagement and fleet assignment authority disagree.");
  expect(evaluateCampaignNavalSupport(scenario, { battleHexKey: "1,0" }).availableFireMissions === 0, "Inland target without a naval front gained support.");
  expect(evaluateCampaignNavalSupport(scenario, { battleHexKey: "8,4", frontKey: "shore" }).availableFireMissions === 0, "Unrelated inland target borrowed a naval front flag.");
  expect(computeCampaignContentHash(scenario) === before, "Pure eligibility mutated its input.");
  expectRejected(() => evaluateCampaignNavalSupport(scenario, { battleHexKey: "broken" }), "Invalid target was silently accepted.");
});

registerTest("FSG_CAM_053_FIRE_MISSIONS_MATCH_TACTICAL_CHARGES", () => {
  const setup = prepareNaval();
  const view = setup.campaign.getPlayerNavalSupport({ battleHexKey: "1,0", frontKey: "shore" });
  const committed = setup.campaign.commitCampaignEngagement(setup.request);
  expect(committed.ok, committed.ok ? "" : committed.reason);
  const assets = buildCampaignTacticalSupportAssets(committed.package);
  const actualFireMissions = assets.reduce((sum, asset) => sum + asset.maxCharges, 0);
  expect(view.availableFireMissions === actualFireMissions, "Ready fire missions counted assignments instead of the actual tactical charges.");
  expect(view.availableSupportAssignments === 1 && view.fireMissionsPerAssignment === assets[0].maxCharges,
    "A fleet's assignment count or catalog mission multiplier changed.");
  expect(view.sources[0].availableSupportAssignments === 1
    && view.sources[0].availableFireMissions === assets[0].maxCharges
    && view.sources[0].fireMissionsPerAssignment === assets[0].maxCharges,
    "Fleet row and tactical profile disagree on assignments or fire missions.");
  const empty = new CampaignState({ legacyStorage: null }).getPlayerNavalSupport();
  expect(empty.availableSupportAssignments === 0 && empty.availableFireMissions === 0
    && empty.fireMissionsPerAssignment === assets[0].maxCharges, "Empty campaign lost its catalog mission multiplier.");
  const inflated = prepareNaval();
  const draft = inflated.campaign.getRuntimeSnapshot()!;
  draft.engagements.naval.engagement.context!.allocationCaps.shoreFireControlParty = assets[0].maxCharges;
  expectRejected(() => commitCampaignEngagement(draft, { ...inflated.request, selections: inflated.request.selections.map((selection) =>
    selection.allocationKey === "shoreFireControlParty" ? { ...selection, quantity: 2 } : selection)
  }, splitLegacyCampaignScenario(inflated.scenario)), "Two tactical charges authorized two assignments from one fleet.");
});

registerTest("FSG_CAM_054_EXACT_RESERVATION_NO_DOUBLE_COMMIT_AND_STALE_RECHECK", () => {
  const setup = committedNaval();
  const { campaign, pkg } = setup;
  const source = pkg.supportCommitments.find((entry) => entry.allocationKey === "shoreFireControlParty")?.navalSources?.[0];
  expect(source?.sourceId === campaignNavalSourceId(setup.scenario.key, "0,1"), "Commit did not freeze the exact fleet source.");
  const view = campaign.getPlayerNavalSupport({ battleHexKey: "1,0", frontKey: "shore" });
  expect(view.availableFireMissions === 0 && view.sources[0].status === "committed", "Committed fleet is still available.");
  const revision = campaign.getRuntimeSnapshot()!.revision;
  const replay = campaign.commitCampaignEngagement(setup.request);
  expect(replay.ok && replay.alreadyCommitted && campaign.getRuntimeSnapshot()!.revision === revision, "Commit replay changed reservation or revision.");
  const next = campaign.buildCampaignEngagementContext({ engagementId: "next", battleHexKey: "1,0", attacker: "Player", frontKey: "shore" });
  expect((next?.allocationCaps.shoreFireControlParty ?? 0) === 0, "New engagement advertised an already-reserved fleet.");
  const stale = prepareNaval();
  const draft = stale.campaign.getRuntimeSnapshot()!;
  draft.tiles["0,1"].infrastructure!.integrity = 0;
  refreshCampaignInfrastructureState(draft.tiles["0,1"].infrastructure!, draft.currentSegment);
  expect(validateCampaignRuntimeState(draft).length === 0, "Stale readiness fixture violates an unrelated invariant.");
  const beforeRejectedCommit = computeCampaignContentHash(draft);
  expectNavalEligibilityRejection(() => commitCampaignEngagement(draft, stale.request, splitLegacyCampaignScenario(stale.scenario)));
  expect(computeCampaignContentHash(draft) === beforeRejectedCommit, "Rejected stale commitment mutated campaign truth.");
});

registerTest("FSG_CAM_054_ACTUAL_COMPETING_COMMIT_CANNOT_SPEND_RESERVED_FLEET", () => {
  const setup = committedNaval();
  const candidate = structuredClone(setup.runtime);
  const first = candidate.engagementLedger.naval;
  const secondId = "competing-naval";
  const context = { ...structuredClone(setup.pkg.context), engagementId: secondId };
  candidate.engagementOrder.push(secondId);
  candidate.engagements[secondId] = { id: secondId, status: "planned", engagement: { ...structuredClone(setup.pkg.engagement), id: secondId, context } };
  candidate.engagementLedgerOrder.push(secondId);
  candidate.engagementLedger[secondId] = { ...structuredClone(first), id: secondId, engagementId: secondId, status: "planned",
    plannedRevision: candidate.revision, committedRevision: null, launchedRevision: null, terminalRevision: null, package: null };
  // Exercise the domain guard even if an upstream caller has switched active plans with an existing hold.
  candidate.activeEngagementId = secondId;
  candidate.status = "planning";
  expect(validateCampaignRuntimeState(candidate).length === 0, "Competing precombat fixture is not a valid runtime.");
  const before = computeCampaignContentHash(candidate);
  expectNavalEligibilityRejection(() => commitCampaignEngagement(candidate, { ...setup.request, engagementId: secondId, expectedRevision: candidate.revision }, splitLegacyCampaignScenario(setup.scenario)));
  expect(computeCampaignContentHash(candidate) === before, "Competing commitment altered the first reservation or runtime.");
});

registerTest("FSG_CAM_053_OFFSET_COORDINATE_REPLAY", () => {
  const scenario = navalScenario();
  scenario.tiles[2].hex = { q: 3, r: -1 }; // Offset 3,0 differs from runtime 3,-1.
  scenario.tiles.push({ tile: "fleet", hex: { q: 4, r: -1 } }); // Offset 4,1.
  const setup = committedNaval(scenario);
  const view = setup.campaign.getPlayerNavalSupport({ battleHexKey: "1,0", frontKey: "shore" });
  const odd = view.sources.find((source) => source.sourceHexKey === "3,0");
  const even = view.sources.find((source) => source.sourceHexKey === "4,1");
  expect(odd?.status === "committed" && odd.distanceHexes === 2, "Odd-column offset source did not bind to its axial runtime tile.");
  expect(even?.status === "ready" && even.distanceHexes === 3, "Even-column offset source did not preserve range/readiness.");
  const resumed = JSON.parse(JSON.stringify(setup.runtime)) as CampaignRuntimeState;
  expect(computeCampaignContentHash(evaluateCampaignNavalSupport(scenario, { battleHexKey: "1,0", frontKey: "shore" }, resumed))
    === computeCampaignContentHash(view), "Coordinate replay changed source identity, range, or reservation.");
  const negative = navalScenario();
  negative.tiles[2].hex = { q: -1, r: 1 }; // Odd negative column floors to -1, giving offset -1,0.
  const negativeView = evaluateCampaignNavalSupport(negative, { battleHexKey: "1,0", frontKey: "shore" });
  expect(negativeView.sources[0].sourceHexKey === "-1,0" && negativeView.sources[0].distanceHexes === 2, "Negative-column offset conversion changed the six-hex distance grammar.");
  expectRejected(() => evaluateCampaignNavalSupport(scenario, { battleHexKey: "19,19" }), "Unmapped target passed naval geometry validation.");
});

registerTest("FSG_CAM_055_TACTICAL_SOURCE_CHARGES_AND_AAR_ARE_EXACT", () => {
  for (const used of [[1, 0], [2, 0], [0, 2], [1, 1], [2, 2], [0, 0]]) {
    const scenario = navalScenario();
    scenario.tiles.push({ tile: "fleet", hex: { q: 0, r: 2 } });
    const setup = committedNaval(scenario, 2);
    const result = navalResult(setup, used);
    const sources = result.supportDeltas[0].navalSourceDeltas;
    expect(sources?.length === 2 && new Set(sources.map((source) => source.tacticalAssetId)).size === 2, "Tactical source attribution is not one-to-one.");
    expect(sources.every((source, index) => source.chargesUsed === used[index]), "Charge spending moved between fleets.");
    assertCampaignBattleResultPackage(result, setup.pkg);
    const applied = setup.campaign.applyCampaignBattleResult(result);
    expect(applied.applied, "Source-bearing result failed campaign application.");
    const accounting = setup.campaign.getRuntimeSnapshot()!.engagementLedger.naval.consequenceReport!;
    const support = accounting.supportConsequences.find((entry) => entry.allocationKey === "shoreFireControlParty")!;
    const expectedConsumed = used.filter((charges) => charges > 0).length * 70;
    expect(support.consumedRequisitionPoints === expectedConsumed && support.refundedRequisitionPoints === 140 - expectedConsumed,
      `Usage [${used}] charged ${support.consumedRequisitionPoints} RP and refunded ${support.refundedRequisitionPoints}; expected ${expectedConsumed} RP consumed.`);
    expect(accounting.consequenceVersion === 2 && support.navalSourceRequisition?.length === sources.length,
      "New naval accounting lacks its versioned per-source audit.");
    support.navalSourceRequisition.forEach((entry, index) => {
      expect(entry.sourceId === sources[index].sourceId && entry.reservedRequisitionPoints === 70
        && entry.consumedRequisitionPoints === (used[index] > 0 ? 70 : 0)
        && entry.refundedRequisitionPoints === (used[index] > 0 ? 0 : 70)
        && entry.consumedRequisitionPoints + entry.refundedRequisitionPoints === entry.reservedRequisitionPoints,
      `Usage [${used}] did not conserve source ${sources[index].sourceId}'s own reservation.`);
    });
    expect(support.consumedRequisitionPoints + support.refundedRequisitionPoints === support.reservedRequisitionPoints,
      "Naval consumption and refund do not conserve the reservation.");
    const economy = accounting.economyConsequences.Player;
    expect(economy.supportRequisitionPointsConsumed === expectedConsumed && economy.supportRequisitionPointsRefunded === 140 - expectedConsumed
      && economy.supportRequisitionPointsReserved === 140, "Fleet and economy assignment accounting disagree.");
    expect(economy.before.supplies - economy.after.supplies === expectedConsumed + economy.tacticalConsumption.rations + economy.tacticalConsumption.parts,
      "Actual campaign supplies did not match exact fleet consumption plus tactical payload use.");
    assertCampaignBattleConsequenceReport(accounting, result);
    const wrongSources = { ...accounting, supportConsequences: accounting.supportConsequences.map((entry) => ({ ...entry,
      navalSourceRequisition: entry.navalSourceRequisition?.map((source, index) => ({ ...source, sourceId: sources[1 - index].sourceId })) })) };
    expectRejected(() => assertCampaignBattleConsequenceReport({ ...wrongSources, integrityHash: computeCampaignBattleConsequenceIntegrity(wrongSources) }, result),
      "A rehashed consequence moved consumption/refunds onto another fleet.");
    const legacyAccounting = { ...accounting, consequenceVersion: 1 as const,
      supportConsequences: accounting.supportConsequences.map(({ navalSourceRequisition: _sourceAudit, ...entry }) => entry) };
    assertCampaignBattleConsequenceReport({ ...legacyAccounting, integrityHash: computeCampaignBattleConsequenceIntegrity(legacyAccounting) }, result);
    const aar = setup.campaign.getCampaignAfterActionReport("naval");
    expect(aar?.navalSupport?.length === 2, "AAR omitted exact naval sources.");
    assertCampaignAfterActionReport(aar, result);
    expect(aar.navalSupport.every((entry, index) => entry.status === (used[index] > 0 ? "expended" : "restored")), "AAR confused spent and unused sources.");
    const available = setup.campaign.getPlayerNavalSupport();
    expect(available.availableSupportAssignments === used.filter((charges) => charges === 0).length
      && available.availableFireMissions === available.availableSupportAssignments * available.fireMissionsPerAssignment,
      "Unused source did not restore one assignment and its exact fire missions independently of the spent source.");
  }
});

registerTest("FSG_CAM_055_TACTICAL_LABEL_USES_FROZEN_FLEET_IDENTITY", () => {
  const setup = committedNaval();
  const source = setup.pkg.supportCommitments.find((entry) => entry.navalSources)?.navalSources?.[0];
  expect(source, "Missing frozen fleet source.");
  const assets = buildCampaignTacticalSupportAssets(setup.pkg);
  expect(assets[0].label === `${source.label} naval gunfire`, "Tactical support hides the committed fleet behind a generic label.");
  const alteredScenario = setup.campaign.getScenario()!;
  alteredScenario.tilePalette.fleet.mapLabel = "Later fleet name";
  setup.campaign.setScenario(alteredScenario);
  expect(buildCampaignTacticalSupportAssets(JSON.parse(JSON.stringify(setup.pkg)))[0].label === assets[0].label,
    "Serialized tactical identity did not retain the frozen fleet name.");
  const legacy = { ...setup.pkg, packageVersion: 2 as const };
  expect(buildCampaignTacticalSupportAssets(legacy)[0].label === "Naval Gunfire Support (NGFS)", "Legacy tactical assets changed their historical display label.");
});

registerTest("FSG_CAM_056_SPENDING_AND_RESTORE_PERSIST_WITHOUT_SECOND_CHARGE", () => {
  const setup = committedNaval();
  const result = navalResult(setup);
  const applied = setup.campaign.applyCampaignBattleResult(result);
  expect(applied.applied, "Naval result was not applied.");
  const resolved = setup.campaign.getRuntimeSnapshot()!;
  const before = computeCampaignContentHash(resolved);
  expect(setup.campaign.applyCampaignBattleResult(result).duplicate, "Repeated result was charged again.");
  expect(computeCampaignContentHash(setup.campaign.getRuntimeSnapshot()) === before, "Duplicate receipt mutated campaign truth.");
  const envelope = navalEnvelope(resolved);
  const decoded = validateCampaignSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
  expect(decoded.ok, "Resolved naval save did not validate.");
  const resumed = migrateCampaignNavalSupport(decoded.envelope.payload.runtime);
  const definition = splitLegacyCampaignScenario(setup.scenario);
  const scenario = projectLegacyCampaignState(definition, resumed).scenario;
  expect(evaluateCampaignNavalSupport(scenario, {}, resumed).sources[0].status === "expended", "Resume replenished spent support early.");
  const restored = structuredClone(resumed);
  restored.currentSegment += 1;
  expect(evaluateCampaignNavalSupport(scenario, {}, restored).sources[0].status === "restored", "Advancing the replenishment clock did not restore support.");
  restored.tiles["0,1"].infrastructure!.integrity = 90;
  restored.tiles["0,1"].infrastructure!.effectiveness = 0.9;
  expect(evaluateCampaignNavalSupport(scenario, {}, restored).availableFireMissions === 0, "Replenishment bypassed source damage.");
});

registerTest("FSG_CAM_057_COMMITTED_SAVE_RESUMES_THE_SAME_TACTICAL_SOURCES", () => {
  const setup = committedNaval();
  const envelope = navalEnvelope(setup.runtime);
  const decoded = validateCampaignSaveEnvelope(JSON.parse(JSON.stringify(envelope)));
  expect(decoded.ok, "Committed save was invalid.");
  const resumed = new CampaignState({ legacyStorage: null });
  resumed.setScenario(setup.scenario);
  resumed.restoreCampaignRecovery({ envelope: decoded.envelope, failedSaveId: "later-invalid-save" });
  const pkg = resumed.getActiveCampaignBattlePackage();
  expect(pkg && pkg.integrityHash === setup.pkg.integrityHash, "Resume changed the naval package fingerprint.");
  expect(computeCampaignContentHash(buildCampaignTacticalSupportAssets(pkg)) === computeCampaignContentHash(buildCampaignTacticalSupportAssets(setup.pkg)), "Resume changed source-backed tactical assets.");
  expect(resumed.getPlayerNavalSupport().sources[0].status === "committed", "Resume lost the exclusive naval reservation.");
});

registerTest("FSG_CAM_058_SOURCE_AND_RECEIPT_TAMPERING_FAIL_CLOSED", () => {
  const setup = committedNaval();
  const modified = structuredClone(setup.pkg);
  const support = modified.supportCommitments.find((entry) => entry.navalSources);
  expect(support?.navalSources, "Missing source reservation.");
  const forged = { ...modified, supportCommitments: modified.supportCommitments.map((entry) => entry === support
    ? { ...entry, navalSources: [{ ...entry.navalSources![0], sourceId: "forged-source" }] } : entry) };
  const rehashed = { ...forged, integrityHash: computeCampaignBattlePackageIntegrity(forged) };
  expectRejected(() => assertCampaignBattlePackage(rehashed), "Rehashed fake source passed package validation.");
  const result = navalResult(setup);
  const noReceipt = { ...result, supportDeltas: [] };
  const rehashedResult = { ...noReceipt, integrityHash: computeCampaignBattleResultIntegrity(noReceipt) };
  expectRejected(() => assertCampaignBattleResultPackage(rehashedResult, setup.pkg), "Rehashed missing naval receipt passed validation.");
  const tactical = tacticalStateFixture(setup.runtime, setup.pkg);
  tactical.supportAssets = buildCampaignTacticalSupportAssets(setup.pkg).map((asset) => ({ ...asset, charges: asset.maxCharges + 1 }));
  expectRejected(() => extractCampaignBattleResultPackage({ battlePackage: setup.pkg, tacticalState: tactical, missionStatus: null, result: "attackerVictory" }), "Impossible tactical charges were accepted.");
});

registerTest("FSG_CAM_058_REHASHED_GROUND_SOURCE_SAVE_CANNOT_HYDRATE", () => {
  for (const substitution of ["ground", "forgedInfrastructure", "zeroCapacity"] as const) {
    const scenario = navalScenario();
    scenario.tilePalette.emptyFleet = { role: "taskForce", factionControl: "Player", navalCapacity: 0 };
    scenario.tiles.push({ tile: "emptyFleet", hex: { q: 0, r: 2 } });
    const setup = committedNaval(scenario);
    const clean = navalEnvelope(setup.runtime);
    expect(validateCampaignSaveEnvelope(clean).ok, "Source substitution baseline save is invalid.");
    const malicious = structuredClone(clean);
    const sourceHexKey = substitution === "zeroCapacity" ? "0,2" : "0,0";
    if (substitution === "forgedInfrastructure") {
      malicious.payload.runtime.tiles["0,0"].infrastructure = structuredClone(malicious.payload.runtime.tiles["0,1"].infrastructure);
    }
    const original = malicious.payload.runtime.engagementLedger.naval.package!;
    const forged = { ...original, supportCommitments: original.supportCommitments.map((entry) => entry.navalSources
      ? { ...entry, navalSources: [{ sourceId: campaignNavalSourceId(original.scenarioKey, sourceHexKey), sourceHexKey, label: "Forged fleet" }] } : entry) };
    malicious.payload.runtime.engagementLedger.naval.package = { ...forged, integrityHash: computeCampaignBattlePackageIntegrity(forged) };
    assertCampaignBattlePackage(malicious.payload.runtime.engagementLedger.naval.package!);
    const { checksum: _checksum, ...unsigned } = malicious;
    const resigned = { ...unsigned, checksum: computeCampaignSaveChecksum(unsigned) };
    const recipient = new CampaignState({ legacyStorage: null });
    recipient.setScenario(setup.scenario);
    const before = computeCampaignContentHash(recipient.getRuntimeSnapshot());
    expectRejected(() => recipient.restoreCampaignRecovery({ failedSaveId: "corrupt-later-save", envelope: resigned }),
      `A checksum-recomputed ${substitution} source substitution hydrated successfully.`);
    expect(computeCampaignContentHash(recipient.getRuntimeSnapshot()) === before, "Rejected source substitution replaced live campaign truth.");
  }
});

registerTest("FSG_CAM_059_EXPIRED_AMBIGUOUS_LEGACY_HISTORY_PRESERVES_PROGRESS", () => {
  const scenario = navalScenario();
  scenario.tiles.push({ tile: "fleet", hex: { q: 0, r: 2 } });
  const setup = committedNaval(scenario, 1);
  const legacy = structuredClone(setup.runtime);
  delete legacy.navalSupportRulesVersion;
  const oldPackage = { ...setup.pkg, packageVersion: 2 as const,
    supportCommitments: setup.pkg.supportCommitments.map(({ navalSources: _sources, ...entry }) => entry) };
  legacy.engagementLedger.naval.package = { ...oldPackage, integrityHash: computeCampaignBattlePackageIntegrity(oldPackage) };
  expect(validateCampaignRuntimeState(legacy).length === 0, "Historical fixture is not a valid legacy runtime.");
  expectRejected(() => migrateCampaignNavalSupport(legacy), "Ambiguous active legacy reservation was accepted.");
  const resolved = runCampaignRuntimeTransaction(legacy, "legacy:resolve", (draft) => {
    recordCampaignEngagementResolution(draft, "naval", "legacy-resolution", { result: "attackerVictory" });
    draft.activeEngagementId = null;
    draft.status = "planning";
    return [];
  });
  expect(resolved.ok, resolved.ok ? "" : resolved.error.message);
  delete resolved.state.engagementLedger.naval.navalSupportResolvedSegment;
  expectRejected(() => migrateCampaignNavalSupport(resolved.state), "Unexpired ambiguous legacy receipt was accepted.");
  const advanced = runCampaignRuntimeTransaction(resolved.state, "legacy:advance", (draft) => { draft.currentSegment += 1; return []; });
  expect(advanced.ok, advanced.ok ? "" : advanced.error.message);
  expect(validateCampaignRuntimeState(advanced.state).length === 0, "Progressed legacy fixture violates runtime invariants.");
  const historicalHash = computeCampaignContentHash(advanced.state.engagementLedger);
  const migrated = migrateCampaignNavalSupport(advanced.state);
  expect(computeCampaignContentHash(migrated.engagementLedger) === historicalHash, "Migration invented attribution or rewrote expired history.");
  expect(computeCampaignContentHash(migrated) === computeCampaignContentHash(migrateCampaignNavalSupport(migrated)), "Expired-history migration is not idempotent.");
  const recipient = new CampaignState({ legacyStorage: null });
  recipient.setScenario(scenario);
  recipient.restoreCampaignRecovery({ failedSaveId: "later-save", envelope: navalEnvelope(advanced.state) });
  const loaded = recipient.getRuntimeSnapshot()!;
  expect(loaded.currentSegment === advanced.state.currentSegment && loaded.revision === advanced.state.revision,
    "Loading historical naval support changed campaign progress.");
  expect(computeCampaignContentHash(loaded.engagementLedger) === historicalHash, "Hydration changed historical naval receipt bytes.");
  expect(recipient.getPlayerNavalSupport().availableSupportAssignments === 2, "Expired unattributed history created an active reservation.");
});

registerTest("FSG_CAM_059_LEGACY_RULES_MIGRATION_IS_IDEMPOTENT_AND_PRESERVES_HASHES", () => {
  const setup = committedNaval();
  const legacy = structuredClone(setup.runtime);
  delete legacy.navalSupportRulesVersion;
  const oldPackage = { ...setup.pkg, packageVersion: 2 as const, supportCommitments: setup.pkg.supportCommitments.map(({ navalSources: _sources, ...entry }) => entry) };
  const old = { ...oldPackage, integrityHash: computeCampaignBattlePackageIntegrity(oldPackage) };
  legacy.engagementLedger.naval.package = old;
  const first = migrateCampaignNavalSupport(legacy);
  expect(first.navalSupportRulesVersion === 1 && first.engagementLedger.naval.package?.integrityHash === old.integrityHash, "Migration rewrote historical package identities.");
  expect(computeCampaignContentHash(first) === computeCampaignContentHash(migrateCampaignNavalSupport(first)), "Naval migration is not idempotent.");
  expect(evaluateCampaignNavalSupport(setup.scenario, {}, first).sources[0].status === "committed", "Legacy migration dropped an attributable source hold.");
  expect(legacy.navalSupportRulesVersion === undefined, "Pure migration mutated its source save.");
  const ambiguous = structuredClone(legacy);
  const pkg = ambiguous.engagementLedger.naval.package!;
  ambiguous.engagementLedger.naval.package = { ...pkg, context: { ...pkg.context, availableForces: pkg.context.availableForces.filter((entry) => entry.unitType !== "Battleship") } };
  expectRejected(() => migrateCampaignNavalSupport(ambiguous), "Migration fabricated an unrecorded historical source.");
});

registerTest("FSG_CAM_059_LEGACY_REPLENISHMENT_USES_RESOLUTION_CLOCK", () => {
  const setup = committedNaval();
  const legacy = structuredClone(setup.runtime);
  delete legacy.navalSupportRulesVersion;
  const oldPackage = { ...setup.pkg, packageVersion: 2 as const,
    supportCommitments: setup.pkg.supportCommitments.map(({ navalSources: _sources, ...entry }) => entry) };
  legacy.engagementLedger.naval.package = { ...oldPackage, integrityHash: computeCampaignBattlePackageIntegrity(oldPackage) };
  const elapsed = runCampaignRuntimeTransaction(legacy, "legacy:elapsed", (draft) => { draft.currentSegment += 2; return []; });
  expect(elapsed.ok, elapsed.ok ? "" : elapsed.error.message);
  const resolved = runCampaignRuntimeTransaction(elapsed.state, "legacy:resolve", (draft) => {
    recordCampaignEngagementResolution(draft, "naval", "legacy-late-resolution", { result: "attackerVictory" });
    draft.activeEngagementId = null;
    draft.status = "planning";
    return [];
  });
  expect(resolved.ok, resolved.ok ? "" : resolved.error.message);
  delete resolved.state.engagementLedger.naval.navalSupportResolvedSegment;
  expect(validateCampaignRuntimeState(resolved.state).length === 0, "Delayed historical resolution fixture is invalid.");
  const migrated = migrateCampaignNavalSupport(resolved.state);
  const source = evaluateCampaignNavalSupport(setup.scenario, {}, migrated).sources[0];
  expect(source.status === "expended" && source.nextAvailableSegment === migrated.currentSegment + 1,
    "Legacy support replenished from its older commitment clock before its actual resolution segment ended.");
});

registerTest("FSG_CAM_059_LEGACY_MISSING_COUNT_AND_NO_NAVAL_PACKAGES_LOAD", () => {
  const setup = committedNaval();
  const legacy = structuredClone(setup.runtime);
  delete legacy.navalSupportRulesVersion;
  const legacyPackage = { ...setup.pkg, packageVersion: 2 as const,
    context: structuredClone(setup.pkg.context),
    supportCommitments: setup.pkg.supportCommitments.map(({ navalSources: _sources, ...entry }) => entry) };
  legacyPackage.context.availableForces.filter((entry) => entry.unitType === "Battleship").forEach((entry) => {
    Reflect.deleteProperty(entry, "count"); // Exercise the actual earlier wire shape without fabricating a count.
  });
  const original = { ...legacyPackage, integrityHash: computeCampaignBattlePackageIntegrity(legacyPackage) };
  legacy.engagementLedger.naval.package = original;
  const migrated = migrateCampaignNavalSupport(legacy);
  expect(migrated.engagementLedger.naval.package?.integrityHash === original.integrityHash, "Missing-count migration changed the frozen package hash.");
  expect(evaluateCampaignNavalSupport(setup.scenario, {}, migrated).sources[0].status === "committed", "Unique legacy source lacking count lost its reservation.");
  expect(computeCampaignContentHash(migrated) === computeCampaignContentHash(migrateCampaignNavalSupport(migrated)), "Missing-count migration changed on replay.");
  const resumed = new CampaignState({ legacyStorage: null });
  resumed.setScenario(setup.scenario);
  resumed.restoreCampaignRecovery({ failedSaveId: "later-save", envelope: navalEnvelope(legacy) });
  expect(resumed.getPlayerNavalSupport().sources[0].status === "committed", "Normal save hydration rejected a uniquely attributable missing-count legacy source.");
  const noNaval = structuredClone(legacy);
  const withoutNaval = { ...original, supportCommitments: [], context: { ...original.context, availableForces: [] } };
  noNaval.engagementLedger.naval.package = { ...withoutNaval, integrityHash: computeCampaignBattlePackageIntegrity(withoutNaval) };
  const noNavalMigrated = migrateCampaignNavalSupport(noNaval);
  expect(noNavalMigrated.engagementLedger.naval.package?.integrityHash === noNaval.engagementLedger.naval.package.integrityHash,
    "A no-naval package was rejected or changed by naval migration.");
  expect(evaluateCampaignNavalSupport(setup.scenario, {}, noNavalMigrated).availableSupportAssignments === 1, "A no-naval legacy package reserved a fleet.");
  resumed.restoreCampaignRecovery({ failedSaveId: "later-save", envelope: navalEnvelope(noNaval) });
  expect(resumed.getPlayerNavalSupport().availableSupportAssignments === 1, "Normal save hydration rejected a no-naval legacy package.");
});
