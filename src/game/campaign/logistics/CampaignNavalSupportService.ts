/**
 * FSG-CAM-004 naval authority. Availability is derived from current source condition,
 * authored target/range rules, and frozen engagement receipts; no second stock counter exists.
 * A task force grants one engagement entitlement with the existing two-charge tactical profile.
 * Used entitlements replenish on the next campaign segment; unused reservations release immediately.
 */
import type { CampaignFactionKey, CampaignScenarioData } from "../../../core/campaignTypes";
import { hexDistance, neighbors } from "../../../core/Hex";
import { axialToOffsetKey, offsetKeyToAxial } from "../../../state/CampaignIntelligence";
import type { CampaignRuntimeState } from "../runtime/campaignRuntimeTypes";
import type { CampaignBattlePackage, CampaignEngagementLedgerRecord } from "../engagements/CampaignEngagementLedgerTypes";
import { createStableCampaignRecordId } from "../runtime/CampaignCanonical";
import { createOffMapSupportAsset } from "../../support/SupportAssetFactory";

export const CAMPAIGN_NAVAL_SUPPORT_RULES_VERSION = 1 as const;
export const NAVAL_SUPPORT_RANGE_HEXES = 6;
export const CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY = "shoreFireControlParty";

/** Exact friendly source frozen into a support reservation. */
export interface CampaignNavalSourceCommitment {
  readonly sourceId: string;
  /** OFFSET `col,row`, matching campaign UI keys; never an axial runtime tile key. */
  readonly sourceHexKey: string;
  readonly label: string;
}

/** Player-safe target context. Omitting the target reports theater readiness only. */
export interface CampaignNavalSupportOptions {
  /** OFFSET `col,row` of the contested hex, matching campaign UI/engagement keys. */
  readonly battleHexKey?: string;
  readonly frontKey?: string | null;
  readonly engagementId?: string;
}

/** A source's single actionable eligibility state. */
export type CampaignNavalSupportStatus = "ready" | "restored" | "damaged" | "outOfRange"
  | "unsupportedTarget" | "committed" | "expended";

/** Detached source row, containing only the observing faction's fleet information. */
export interface CampaignNavalSupportSourceView extends CampaignNavalSourceCommitment {
  /** Normalized condition in [0,1]; the single indivisible support entitlement requires exactly 1. */
  readonly readiness: number;
  readonly effectiveRangeHexes: number;
  readonly distanceHexes: number | null;
  /** Indivisible engagement reservations available from this task force; drives allocation caps. */
  readonly availableSupportAssignments: number;
  /** Actual tactical charges authorized by the available assignments; never an allocation cap. */
  readonly availableFireMissions: number;
  /** Tactical catalog maxCharges for one naval assignment. */
  readonly fireMissionsPerAssignment: number;
  readonly status: CampaignNavalSupportStatus;
  readonly reason: string;
  readonly nextAvailableSegment: number | null;
}

/** Shared Logistics, fleet-inspector and engagement-authority projection. */
export interface CampaignNavalSupportView {
  /** Number of eligible task-force assignments; used for engagement allocations and reservations. */
  readonly availableSupportAssignments: number;
  /** Total actual tactical charges provided by available assignments. */
  readonly availableFireMissions: number;
  /** Tactical catalog maxCharges per assignment, including when no assignments are available. */
  readonly fireMissionsPerAssignment: number;
  readonly readySourceIds: readonly string[];
  readonly sources: readonly CampaignNavalSupportSourceView[];
}

/** Stable source identity does not depend on labels, economy scalars or fleet display order. */
export function campaignNavalSourceId(scenarioKey: string, sourceHexKey: string): string {
  return createStableCampaignRecordId("naval-source", scenarioKey, sourceHexKey);
}

function requireOffsetHex(key: string): { q: number; r: number } {
  if (!/^-?\d+,-?\d+$/.test(key)) throw new Error("Naval support target has an invalid grid reference. Select a campaign hex again.");
  const [q, row] = key.split(",").map(Number);
  if (!Number.isSafeInteger(q) || !Number.isSafeInteger(row)) throw new Error("Naval support grid reference exceeds the campaign map. Select a campaign hex again.");
  const axial = offsetKeyToAxial(key);
  if (!axial) throw new Error("Naval support grid reference cannot be resolved. Select a campaign hex again.");
  return axial;
}

/** Reads exact v3 sources or proves an unambiguous v2 attribution without rewriting historical hashes. */
export function campaignPackageNavalSources(pkg: CampaignBattlePackage): readonly CampaignNavalSourceCommitment[] {
  const commitment = pkg.supportCommitments.find((entry) => entry.allocationKey === CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY);
  if (!commitment) return [];
  if (commitment.navalSources) return structuredClone(commitment.navalSources);
  if (pkg.packageVersion >= 3) throw new Error("Naval support package lacks its exact source reservation. Reload the last valid campaign save.");
  // Early frozen contexts identified one task force per source but could omit aggregate counts.
  // Its identity still proves attribution; a missing identity or competing candidates never does.
  const candidates = [...new Set(pkg.context.availableForces.filter((entry) => entry.unitType === "Battleship" && (entry.count === undefined || entry.count > 0))
    .map((entry) => entry.hexKey))].sort();
  if (candidates.length !== commitment.quantity) {
    throw new Error("Legacy naval support has no unambiguous source record. Resume a save before this engagement and commit support again.");
  }
  return candidates.map((sourceHexKey) => ({
    sourceId: campaignNavalSourceId(pkg.scenarioKey, sourceHexKey), sourceHexKey, label: "Naval task force"
  }));
}

/** Historical resolution events/reports prove replenishment timing; the commitment date does not. */
function navalResolutionSegment(runtime: CampaignRuntimeState, ledger: CampaignEngagementLedgerRecord): number | null {
  const receiptSegments = [ledger.navalSupportResolvedSegment, ledger.consequenceReport?.appliedSegment,
    ledger.afterActionReport?.segment, runtime.eventLog.find((event) => event.revision === ledger.terminalRevision)?.segment]
    .filter((segment): segment is number => segment !== undefined);
  if (receiptSegments.some((segment) => !Number.isInteger(segment) || segment < ledger.package!.committedSegment || segment > runtime.currentSegment)) {
    throw new Error("Naval receipt has an invalid replenishment clock. Reload a valid campaign save.");
  }
  return receiptSegments.length > 0 ? Math.max(...receiptSegments) : null;
}

/** Resolves only source claims that can still affect availability; expired legacy history remains untouched. */
export function campaignLedgerNavalSources(
  runtime: CampaignRuntimeState,
  ledger: CampaignEngagementLedgerRecord
): readonly CampaignNavalSourceCommitment[] {
  const pkg = ledger.package;
  if (!pkg) return [];
  const naval = pkg.supportCommitments.find((entry) => entry.allocationKey === CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY);
  if (!naval) return [];
  if (pkg.packageVersion === 2 && !naval.navalSources) {
    if (ledger.status === "cancelled") return [];
    if (ledger.status === "resolved" || ledger.status === "abandoned") {
      const resolvedSegment = navalResolutionSegment(runtime, ledger);
      // No inference or invented fleet association is needed once every credible receipt clock has expired.
      if (resolvedSegment !== null && runtime.currentSegment > resolvedSegment) return [];
    }
  }
  return campaignPackageNavalSources(pkg);
}

/** One pure evaluator for both rules and presentation; runtime overrides any stale scenario projection. */
export function evaluateCampaignNavalSupport(
  scenario: CampaignScenarioData | null,
  options: CampaignNavalSupportOptions = {},
  runtime?: CampaignRuntimeState | null,
  faction: CampaignFactionKey = "Player"
): CampaignNavalSupportView {
  // The same factory builds committed tactical assets; its charge profile is the only mission multiplier.
  const profile = createOffMapSupportAsset(CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY, "campaign-naval-support-profile");
  if (!profile || !Number.isInteger(profile.maxCharges) || profile.maxCharges <= 0) {
    throw new Error("Naval support has no valid tactical fire-mission profile. Reload a compatible build before assigning support.");
  }
  const fireMissionsPerAssignment = profile.maxCharges;
  if (!scenario) return { sources: [], readySourceIds: [], availableSupportAssignments: 0, availableFireMissions: 0, fireMissionsPerAssignment };
  const engagement = options.engagementId ? runtime?.engagements[options.engagementId]?.engagement : null;
  const battleHexKey = options.battleHexKey ?? engagement?.context?.battleHexKey;
  const frontKey = options.frontKey ?? engagement?.frontKey;
  const target = battleHexKey ? requireOffsetHex(battleHexKey) : null;
  const currentSegment = runtime?.currentSegment ?? 0;
  const fronts = runtime?.compatibility.initialFronts ?? scenario.fronts;
  const water = new Set(scenario.mapExtents?.waterHexes ?? []);
  const coastal = target !== null && neighbors(target).some((hex) => water.has(`${hex.q},${hex.r}`));
  const front = fronts.find((entry) => entry.key === frontKey);
  // A modifier authorizes only a target actually on that front, never arbitrary inland targets.
  const frontAuthorized = Boolean(battleHexKey && front?.modifiers?.includes("navalSupport")
    && (front.hexKeys.includes(battleHexKey) || front.edges?.some((edge) => edge.opposingHexKey === battleHexKey || edge.friendlyHexKey === battleHexKey)));
  const targetExists = !target || (runtime
    ? Boolean(runtime.tiles[`${target.q},${target.r}`])
    : scenario.tiles.some((tile) => tile.hex.q === target.q && tile.hex.r === target.r));
  if (!targetExists) throw new Error("Naval support target is absent from campaign geometry. Select a current campaign hex.");
  const sources: CampaignNavalSupportSourceView[] = [];
  for (const authoredTile of scenario.tiles) {
    const sourceHexKey = axialToOffsetKey(authoredTile.hex.q, authoredTile.hex.r);
    const currentTile = runtime?.tiles[`${authoredTile.hex.q},${authoredTile.hex.r}`];
    if (runtime && !currentTile) continue;
    const definition = scenario.tilePalette[currentTile?.tileKey ?? authoredTile.tile];
    if (definition?.role !== "taskForce") continue;
    const owner = currentTile?.controller ?? authoredTile.factionControl ?? definition.factionControl;
    if (owner !== faction) continue;
    const sourceId = campaignNavalSourceId(scenario.key, sourceHexKey);
    const condition = currentTile ? currentTile.infrastructure : authoredTile.infrastructure;
    const readiness = condition ? Math.min(condition.effectiveness, condition.integrity / condition.maxIntegrity) : 1;
    if (!Number.isFinite(readiness) || readiness < 0 || readiness > 1) {
      throw new Error("Naval task-force condition is invalid. Reload the last valid campaign save.");
    }
    const distanceHexes = target ? hexDistance(currentTile?.hex ?? authoredTile.hex, target) : null;
    let held = false;
    let restored = false;
    let nextAvailableSegment: number | null = null;
    for (const id of runtime?.engagementLedgerOrder ?? []) {
      const ledger = runtime!.engagementLedger[id];
      const pkg = ledger?.package;
      if (!pkg || pkg.context.attacker !== faction) continue;
      if (!campaignLedgerNavalSources(runtime!, ledger).some((source) => source.sourceId === sourceId)) continue;
      if (ledger.status === "committed" || ledger.status === "inBattle") { held = true; continue; }
      if (ledger.status === "cancelled") { restored = true; continue; }
      if (ledger.status !== "resolved" && ledger.status !== "abandoned") continue;
      const delta = ledger.resultPackage?.supportDeltas.find((entry) => entry.allocationKey === CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY);
      const exact = delta?.navalSourceDeltas?.find((entry) => entry.sourceId === sourceId);
      // Old or abandoned receipts cannot prove unused charges, so keep their entitlement spent for this segment.
      const spent = exact ? exact.chargesUsed > 0 : !delta || delta.chargesUsed > 0;
      const resolvedSegment = navalResolutionSegment(runtime!, ledger);
      if (spent && resolvedSegment === null) {
        throw new Error("Naval receipt lacks its resolution clock. Resume a save before this engagement and commit support again.");
      }
      if (spent && resolvedSegment !== null && currentSegment < resolvedSegment + 1) {
        nextAvailableSegment = Math.max(nextAvailableSegment ?? 0, resolvedSegment + 1);
      } else { restored = true; }
    }
    const damaged = condition?.disabled || readiness < 1 || !(definition.navalCapacity && definition.navalCapacity > 0);
    const status: CampaignNavalSupportStatus = held ? "committed" : nextAvailableSegment !== null ? "expended"
      : damaged ? "damaged" : target && !coastal && !frontAuthorized ? "unsupportedTarget"
        : distanceHexes !== null && distanceHexes > NAVAL_SUPPORT_RANGE_HEXES ? "outOfRange" : restored ? "restored" : "ready";
    const reasons: Record<CampaignNavalSupportStatus, string> = {
      ready: target ? "Ready to support this engagement." : "Ready; select an engagement to check target and range.",
      restored: target ? "Support restored and ready for this engagement." : "Support restored; select an engagement to check range.",
      committed: "Reserved for an engagement; complete that battle before assigning this task force again.",
      expended: "Support assignment expended; advance to the next campaign segment to restore its fire missions.",
      damaged: "Task force is not fully operational; restore its condition before assigning fire support.",
      outOfRange: "Target is beyond naval gunfire range; choose a target within six campaign hexes.",
      unsupportedTarget: "Target has no coastal or authored naval-support authorization; choose a supported approach."
    };
    const availableSupportAssignments = status === "ready" || status === "restored" ? 1 : 0;
    sources.push({ sourceId, sourceHexKey, label: definition.mapLabel ?? "Naval task force", readiness,
      effectiveRangeHexes: NAVAL_SUPPORT_RANGE_HEXES, distanceHexes, status, reason: reasons[status],
      availableSupportAssignments, fireMissionsPerAssignment,
      availableFireMissions: availableSupportAssignments * fireMissionsPerAssignment,
      nextAvailableSegment: held ? null : nextAvailableSegment });
  }
  sources.sort((a, b) => a.sourceHexKey.localeCompare(b.sourceHexKey));
  return { sources, fireMissionsPerAssignment,
    availableSupportAssignments: sources.reduce((sum, source) => sum + source.availableSupportAssignments, 0),
    availableFireMissions: sources.reduce((sum, source) => sum + source.availableFireMissions, 0),
    readySourceIds: sources.filter((source) => source.availableSupportAssignments > 0).map((source) => source.sourceId) };
}

/** Idempotent migration preserves v2 history and proves attribution only for claims that can affect availability. */
export function migrateCampaignNavalSupport(runtime: CampaignRuntimeState): CampaignRuntimeState {
  const migrated = structuredClone(runtime);
  if (migrated.navalSupportRulesVersion !== undefined && migrated.navalSupportRulesVersion !== CAMPAIGN_NAVAL_SUPPORT_RULES_VERSION) {
    throw new Error("Campaign naval-support rules are newer than this build. Open the save with a compatible build.");
  }
  for (const id of migrated.engagementLedgerOrder) {
    const ledger = migrated.engagementLedger[id];
    if (ledger) campaignLedgerNavalSources(migrated, ledger);
  }
  migrated.navalSupportRulesVersion = CAMPAIGN_NAVAL_SUPPORT_RULES_VERSION;
  return migrated;
}
