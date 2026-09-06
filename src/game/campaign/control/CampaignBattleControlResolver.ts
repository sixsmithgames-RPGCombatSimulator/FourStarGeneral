/**
 * MODULE: CampaignBattleControlResolver
 * WHAT: Resolves post-battle occupation, retreat, no-route capture, supply isolation, tile control, and fronts derived from control adjacency.
 * WHY: Territorial consequences must move persistent formations legally and render real borders instead of editing authored polylines.
 */

import type {
  CampaignFactionKey,
  CampaignFrontLine
} from "../../../core/campaignTypes";
import { hexDistance, neighbors } from "../../../core/Hex";
import { getCampaignFriendlySupplyNetwork as friendlySupplyNetwork } from "../logistics/CampaignSupplyAccess";
import type { Axial } from "../../../core/types";
import type {
  CampaignDomainEventDraft,
  CampaignRuntimeState,
  CampaignScenarioDefinition
} from "../runtime/campaignRuntimeTypes";
import {
  computeCampaignContentHash,
  createStableCampaignRecordId
} from "../runtime/CampaignCanonical";
import {
  relocateCampaignFormation,
  retireCampaignFormation,
  synchronizeCampaignFormationForceProjection,
  transitionCampaignFormationStatus
} from "../formations/FormationLifecycleService";
import type {
  CampaignFormationRecord,
  CampaignFormationStatus,
  CampaignFormationSupply
} from "../formations/campaignFormationTypes";
import type { CampaignBattleResultPackage } from "../results/CampaignBattleResultTypes";
import {
  assertCampaignBattleConsequenceReport
} from "../consequences/CampaignBattleConsequenceResolver";
import type {
  CampaignBattleConsequenceReport,
  CampaignFormationBattleConsequence
} from "../consequences/CampaignBattleConsequenceTypes";
import {
  CAMPAIGN_BATTLE_CONTROL_REPORT_VERSION,
  CAMPAIGN_RETREAT_STACK_LIMIT,
  type CampaignBattleControlReport,
  type CampaignFormationControlDisposition,
  type CampaignFormationIsolationChange,
  type CampaignOccupationOutcome,
  type CampaignRetreatOptionAssessment
} from "./CampaignBattleControlTypes";

const TERMINAL_FORMATION_STATUSES = new Set<CampaignFormationStatus>(["destroyed", "captured"]);

interface ControlBoundaryEdge {
  readonly leftHexKey: string;
  readonly rightHexKey: string;
  readonly leftController: CampaignFactionKey;
  readonly rightController: CampaignFactionKey;
  readonly order: number;
}

export interface CampaignBattleControlApplication {
  readonly duplicate: boolean;
  readonly report: CampaignBattleControlReport;
  readonly events: readonly CampaignDomainEventDraft[];
}

function axialKey(hex: Axial): string {
  return `${hex.q},${hex.r}`;
}

function axialToOffsetKey(hex: Axial): string {
  return `${hex.q},${hex.r + Math.floor(hex.q / 2)}`;
}

function offsetKeyToAxial(key: string): Axial | null {
  const [colText, rowText, extra] = key.split(",");
  if (extra !== undefined) return null;
  const col = Number(colText);
  const row = Number(rowText);
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  return { q: col, r: row - Math.floor(col / 2) };
}

function runtimeHexKeyFromOffset(key: string): string | null {
  const axial = offsetKeyToAxial(key);
  return axial ? axialKey(axial) : null;
}

function opposingPairKey(left: CampaignFactionKey, right: CampaignFactionKey): string {
  return [String(left), String(right)].sort().join("|");
}

function operationalBelligerentLabel(faction: CampaignFactionKey): string {
  if (faction === "Player") return "Allied";
  if (faction === "Bot") return "German";
  if (faction === "Neutral") return "Uncontrolled";
  return String(faction);
}

function derivedFrontLabel(controllers: readonly CampaignFactionKey[]): string {
  const priority = new Map<string, number>([["Allied", 0], ["German", 1]]);
  const belligerents = controllers
    .map(operationalBelligerentLabel)
    .sort((left, right) => (priority.get(left) ?? 2) - (priority.get(right) ?? 2) || left.localeCompare(right));
  return `${belligerents.join("–")} Front`;
}

function boundaryEdges(runtime: CampaignRuntimeState): ControlBoundaryEdge[] {
  const orderByKey = new Map(runtime.tileOrder.map((key, index) => [key, index]));
  const edges: ControlBoundaryEdge[] = [];
  runtime.tileOrder.forEach((leftHexKey, leftIndex) => {
    const left = runtime.tiles[leftHexKey];
    if (!left || left.controller === "Neutral") return;
    neighbors(left.hex).forEach((neighbor) => {
      const rightHexKey = axialKey(neighbor);
      const rightIndex = orderByKey.get(rightHexKey);
      const right = rightIndex === undefined ? null : runtime.tiles[rightHexKey];
      if (!right || rightIndex! <= leftIndex || right.controller === "Neutral" || right.controller === left.controller) return;
      edges.push({
        leftHexKey,
        rightHexKey,
        leftController: left.controller,
        rightController: right.controller,
        order: leftIndex * runtime.tileOrder.length + rightIndex!
      });
    });
  });
  return edges.sort((left, right) => left.order - right.order);
}

function connectedEdgeComponents(edges: readonly ControlBoundaryEdge[]): ControlBoundaryEdge[][] {
  const remaining = new Set(edges.map((_, index) => index));
  const components: ControlBoundaryEdge[][] = [];
  while (remaining.size > 0) {
    const start = Math.min(...remaining);
    remaining.delete(start);
    const componentIndexes = [start];
    const endpoints = new Set([edges[start].leftHexKey, edges[start].rightHexKey]);
    let expanded = true;
    while (expanded) {
      expanded = false;
      Array.from(remaining).sort((a, b) => a - b).forEach((index) => {
        const edge = edges[index];
        if (!endpoints.has(edge.leftHexKey) && !endpoints.has(edge.rightHexKey)) return;
        remaining.delete(index);
        componentIndexes.push(index);
        endpoints.add(edge.leftHexKey);
        endpoints.add(edge.rightHexKey);
        expanded = true;
      });
    }
    components.push(componentIndexes.sort((a, b) => a - b).map((index) => edges[index]));
  }
  return components;
}

function frontOverlap(front: CampaignFrontLine, component: readonly ControlBoundaryEdge[], runtime: CampaignRuntimeState): number {
  const offsets = new Set(component.flatMap((edge) => [
    axialToOffsetKey(runtime.tiles[edge.leftHexKey].hex),
    axialToOffsetKey(runtime.tiles[edge.rightHexKey].hex)
  ]));
  return front.hexKeys.reduce((sum, key) => sum + (offsets.has(key) ? 1 : 0), 0);
}

/** Derives every current front from exact adjacency between opposing non-neutral tile controllers. */
export function deriveCampaignFrontsFromControl(
  runtime: CampaignRuntimeState,
  preferredInitiative: CampaignFactionKey | null = null
): CampaignFrontLine[] {
  const grouped = new Map<string, ControlBoundaryEdge[]>();
  boundaryEdges(runtime).forEach((edge) => {
    const key = opposingPairKey(edge.leftController, edge.rightController);
    const group = grouped.get(key) ?? [];
    group.push(edge);
    grouped.set(key, group);
  });
  const priorFronts = runtime.compatibility.initialFronts.map((front) => structuredClone(front));
  const usedPriorKeys = new Set<string>();
  const derived: CampaignFrontLine[] = [];

  Array.from(grouped).sort(([left], [right]) => left.localeCompare(right)).forEach(([, edges]) => {
    connectedEdgeComponents(edges).forEach((component) => {
      const controllers = [component[0].leftController, component[0].rightController];
      const prior = priorFronts
        .filter((front) => !usedPriorKeys.has(front.key) && controllers.includes(front.initiative))
        .map((front) => ({ front, overlap: frontOverlap(front, component, runtime) }))
        .filter((entry) => entry.overlap > 0)
        .sort((left, right) => right.overlap - left.overlap || left.front.key.localeCompare(right.front.key))[0]?.front ?? null;
      if (prior) usedPriorKeys.add(prior.key);
      const initiative = preferredInitiative && controllers.includes(preferredInitiative)
        ? preferredInitiative
        : prior?.initiative && controllers.includes(prior.initiative)
          ? prior.initiative
          : controllers.includes("Player") ? "Player" : [...controllers].sort()[0];
      const frontEdges = component.map((edge) => {
        const leftFriendly = edge.leftController === initiative;
        const friendly = runtime.tiles[leftFriendly ? edge.leftHexKey : edge.rightHexKey];
        const opposing = runtime.tiles[leftFriendly ? edge.rightHexKey : edge.leftHexKey];
        return {
          friendlyHexKey: axialToOffsetKey(friendly.hex),
          opposingHexKey: axialToOffsetKey(opposing.hex)
        };
      }).sort((left, right) => left.friendlyHexKey.localeCompare(right.friendlyHexKey)
        || left.opposingHexKey.localeCompare(right.opposingHexKey));
      const friendlyHexKeys = Array.from(new Set(frontEdges.map((edge) => edge.friendlyHexKey)));
      const stableComponent = component.map((edge) => [edge.leftHexKey, edge.rightHexKey].sort().join("~")).sort();
      derived.push({
        key: prior?.key ?? createStableCampaignRecordId(
          "derived-front",
          runtime.campaignId,
          opposingPairKey(controllers[0], controllers[1]),
          stableComponent
        ),
        label: prior?.label ?? derivedFrontLabel(controllers),
        hexKeys: friendlyHexKeys,
        edges: frontEdges,
        initiative,
        ...(prior?.modifiers ? { modifiers: [...prior.modifiers] } : {})
      });
    });
  });
  return derived.sort((left, right) => left.key.localeCompare(right.key));
}

/** Hashes only authoritative tile control/timestamps for report and save-state reconciliation. */
export function computeCampaignControlStateHash(runtime: CampaignRuntimeState): string {
  return computeCampaignContentHash(runtime.tileOrder.map((hexKey) => ({
    hexKey,
    controller: runtime.tiles[hexKey]?.controller ?? null,
    controlSinceSegment: runtime.tiles[hexKey]?.controlSinceSegment ?? null
  })));
}

function retreatOptions(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  originHexKey: string,
  battleHexKey: string,
  faction: CampaignFactionKey
): CampaignRetreatOptionAssessment[] {
  const origin = runtime.tiles[originHexKey];
  const battle = runtime.tiles[battleHexKey];
  if (!origin || !battle) return [];
  const tileOrder = new Map(runtime.tileOrder.map((key, index) => [key, index]));
  const suppliedTiles = friendlySupplyNetwork(runtime, definition, faction).reachable;
  const options = neighbors(origin.hex).map((hex) => {
    const hexKey = axialKey(hex);
    const tile = runtime.tiles[hexKey];
    if (!tile) {
      return {
        hexKey,
        supplied: false,
        occupiedFormationCount: 0,
        distanceFromBattle: hexDistance(hex, battle.hex),
        legal: false,
        rejectionReason: "missingTile" as const
      };
    }
    const occupiedFormationCount = tile.formationIds.length;
    const enemyControl = tile.controller !== faction;
    const overStack = occupiedFormationCount >= CAMPAIGN_RETREAT_STACK_LIMIT;
    return {
      hexKey,
      supplied: suppliedTiles.has(hexKey),
      occupiedFormationCount,
      distanceFromBattle: hexDistance(tile.hex, battle.hex),
      legal: !enemyControl && !overStack && hexKey !== battleHexKey,
      rejectionReason: enemyControl ? "enemyControl" as const : overStack ? "stackLimit" as const : null
    };
  });
  return options.sort((left, right) => {
    if (left.legal !== right.legal) return left.legal ? -1 : 1;
    if (left.supplied !== right.supplied) return left.supplied ? -1 : 1;
    const leftEmpty = left.occupiedFormationCount === 0;
    const rightEmpty = right.occupiedFormationCount === 0;
    if (leftEmpty !== rightEmpty) return leftEmpty ? -1 : 1;
    if (left.distanceFromBattle !== right.distanceFromBattle) return right.distanceFromBattle - left.distanceFromBattle;
    if (left.occupiedFormationCount !== right.occupiedFormationCount) {
      return left.occupiedFormationCount - right.occupiedFormationCount;
    }
    return (tileOrder.get(left.hexKey) ?? Number.MAX_SAFE_INTEGER)
      - (tileOrder.get(right.hexKey) ?? Number.MAX_SAFE_INTEGER);
  });
}

function snapshotSupply(formation: CampaignFormationRecord): CampaignFormationSupply {
  return structuredClone(formation.supply);
}

function applyRetreatWear(formation: CampaignFormationRecord): Record<string, number> {
  formation.readiness = Math.max(0, formation.readiness - 10);
  formation.cohesion = Math.max(0, formation.cohesion - 10);
  formation.fatigue = Math.min(100, formation.fatigue + 10);
  formation.supply.fuel = Math.max(0, formation.supply.fuel - 1);
  formation.supply.rations = Math.max(0, formation.supply.rations - 1);
  const abandoned: Record<string, number> = {};
  Object.entries(formation.equipment).sort(([left], [right]) => left.localeCompare(right)).forEach(([key, pool]) => {
    const count = Math.ceil(pool.disabled / 2);
    if (count <= 0) return;
    pool.disabled -= count;
    pool.destroyed += count;
    abandoned[key] = count;
  });
  return abandoned;
}

function emptyDisposition(
  formation: CampaignFormationRecord,
  consequence: CampaignFormationBattleConsequence,
  disposition: CampaignFormationControlDisposition["disposition"],
  destinationHexKey: string | null,
  explanation: string,
  options: readonly CampaignRetreatOptionAssessment[] = [],
  abandonedEquipment: Readonly<Record<string, number>> = {},
  before?: {
    status: CampaignFormationStatus;
    readiness: number;
    cohesion: number;
    fatigue: number;
    supply: CampaignFormationSupply;
  }
): CampaignFormationControlDisposition {
  const source = before ?? {
    status: consequence.statusAfter,
    readiness: consequence.readinessAfter,
    cohesion: consequence.cohesionAfter,
    fatigue: consequence.fatigueAfter,
    supply: structuredClone(consequence.supplyAfter)
  };
  return {
    campaignFormationId: formation.id,
    faction: formation.faction,
    disposition,
    sourceHexKey: consequence.locationAfter ?? consequence.sourceHexKey,
    destinationHexKey,
    statusBefore: source.status,
    statusAfter: formation.status,
    readinessBefore: source.readiness,
    readinessAfter: formation.readiness,
    cohesionBefore: source.cohesion,
    cohesionAfter: formation.cohesion,
    fatigueBefore: source.fatigue,
    fatigueAfter: formation.fatigue,
    supplyBefore: structuredClone(source.supply),
    supplyAfter: snapshotSupply(formation),
    abandonedEquipment: structuredClone(abandonedEquipment),
    retreatOptions: structuredClone(options),
    explanation
  };
}

function chooseOccupier(
  runtime: CampaignRuntimeState,
  result: CampaignBattleResultPackage,
  consequence: CampaignBattleConsequenceReport,
  faction: CampaignFactionKey,
  battleHexKey: string,
  amphibious: boolean
): CampaignFormationRecord | null {
  const battle = runtime.tiles[battleHexKey];
  if (!battle) return null;
  return consequence.formationConsequences
    .filter((entry) => entry.faction === faction && !TERMINAL_FORMATION_STATUSES.has(entry.statusAfter))
    .flatMap((entry) => {
      const formation = runtime.formations[entry.campaignFormationId];
      const delta = result.formationDeltas.find((candidate) => candidate.campaignFormationId === entry.campaignFormationId);
      if (!formation || !delta || formation.status !== "ready" || delta.personnelAfter <= 0
        || delta.tacticalDisposition === "casualty" || !formation.locationHexKey) return [];
      const source = runtime.tiles[formation.locationHexKey];
      if (!source || hexDistance(source.hex, battle.hex) > 1) return [];
      if (result.result === "attackerVictory" && delta.role !== "attacker") return [];
      if (result.result !== "attackerVictory" && delta.role !== "defender") return [];
      return [{ formation, delta }];
    })
    .filter(({ delta }) => !amphibious || delta.tacticalDisposition === "deployed")
    .sort((left, right) => {
      const leftAtBattle = left.formation.locationHexKey === battleHexKey;
      const rightAtBattle = right.formation.locationHexKey === battleHexKey;
      if (leftAtBattle !== rightAtBattle) return leftAtBattle ? -1 : 1;
      if (left.delta.tacticalDisposition !== right.delta.tacticalDisposition) {
        return left.delta.tacticalDisposition === "deployed" ? -1 : 1;
      }
      return right.formation.readiness - left.formation.readiness || left.formation.id.localeCompare(right.formation.id);
    })[0]?.formation ?? null;
}

function resolveIsolation(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition
): CampaignFormationIsolationChange[] {
  const changes: CampaignFormationIsolationChange[] = [];
  runtime.factionOrder.forEach((factionKey) => {
    const faction = runtime.factions[factionKey]?.faction;
    if (!faction || faction === "Neutral") return;
    const network = friendlySupplyNetwork(runtime, definition, faction);
    if (network.sources.length === 0) return;
    runtime.formationOrder.forEach((formationId) => {
      const formation = runtime.formations[formationId];
      if (!formation || formation.faction !== faction || !formation.locationHexKey
        || (formation.status !== "ready" && formation.status !== "isolated")) return;
      const isolatedBefore = formation.status === "isolated";
      const isolatedAfter = runtime.tiles[formation.locationHexKey]?.controller !== faction
        || !network.reachable.has(formation.locationHexKey);
      if (isolatedBefore === isolatedAfter) return;
      const targetStatus = isolatedAfter ? "isolated" : "ready";
      if (!transitionCampaignFormationStatus(
        runtime,
        formation.id,
        targetStatus,
        runtime.currentSegment,
        isolatedAfter
          ? `${formation.name} was isolated from a friendly campaign supply path.`
          : `${formation.name} regained a friendly campaign supply path.`
      )) return;
      changes.push({
        campaignFormationId: formation.id,
        faction,
        hexKey: formation.locationHexKey,
        isolatedBefore,
        isolatedAfter,
        reason: isolatedAfter ? "noFriendlySupplyPath" : "friendlySupplyPathRestored"
      });
    });
  });
  return changes;
}

function controlIntegrity(unsigned: Omit<CampaignBattleControlReport, "integrityHash">): string {
  return `fsg-battle-control-v1-${computeCampaignContentHash(unsigned)}`;
}

export function computeCampaignBattleControlIntegrity(report: CampaignBattleControlReport): string {
  const { integrityHash: _integrityHash, ...unsigned } = structuredClone(report);
  return controlIntegrity(unsigned);
}

function isNonNegativeFinite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function assertDerivedFronts(fronts: readonly CampaignFrontLine[]): void {
  const frontKeys = new Set<string>();
  const edgeKeys = new Set<string>();
  fronts.forEach((front) => {
    if (!front.key.trim() || frontKeys.has(front.key) || !front.label.trim()
      || !front.initiative || !front.edges || front.edges.length === 0 || front.hexKeys.length === 0) {
      throw new Error("Derived campaign front is malformed or duplicated.");
    }
    frontKeys.add(front.key);
    const friendlyKeys = new Set(front.hexKeys);
    front.edges.forEach((edge) => {
      const friendly = offsetKeyToAxial(edge.friendlyHexKey);
      const opposing = offsetKeyToAxial(edge.opposingHexKey);
      const pair = [edge.friendlyHexKey, edge.opposingHexKey].sort().join("|");
      if (!friendly || !opposing || hexDistance(friendly, opposing) !== 1
        || !friendlyKeys.has(edge.friendlyHexKey) || edgeKeys.has(pair)) {
        throw new Error(`Derived campaign front edge ${pair} is malformed or duplicated.`);
      }
      edgeKeys.add(pair);
    });
  });
}

/** Rejects modified, incomplete, cross-bound, or non-conserving operational battle audits. */
export function assertCampaignBattleControlReport(
  report: CampaignBattleControlReport,
  result: CampaignBattleResultPackage,
  consequence: CampaignBattleConsequenceReport
): CampaignBattleControlReport {
  if (report.controlVersion !== CAMPAIGN_BATTLE_CONTROL_REPORT_VERSION
    || report.campaignId !== result.campaignId
    || report.scenarioKey !== result.scenarioKey
    || report.engagementId !== result.engagementId
    || report.resolutionId !== result.resolutionId
    || report.battleResultIntegrityHash !== result.integrityHash
    || report.consequenceIntegrityHash !== consequence.integrityHash
    || report.result !== result.result
    || !Number.isInteger(report.sourceRevision) || report.sourceRevision !== consequence.sourceRevision
    || report.appliedRevision !== report.sourceRevision + 1
    || !Number.isInteger(report.appliedSegment) || report.appliedSegment < 0
    || !report.battleHexKey
    || report.controlChanged !== (report.controllerBefore !== report.controllerAfter)
    || !Number.isInteger(report.controlSinceSegmentBefore) || report.controlSinceSegmentBefore < 0
    || !Number.isInteger(report.controlSinceSegmentAfter) || report.controlSinceSegmentAfter < 0
    || (report.controlChanged && report.controlSinceSegmentAfter !== report.appliedSegment)
    || (!report.controlChanged && report.controlSinceSegmentAfter !== report.controlSinceSegmentBefore)
    || !/^fnv1a32-[0-9a-f]{8}$/.test(report.controlStateHashBefore)
    || !/^fnv1a32-[0-9a-f]{8}$/.test(report.controlStateHashAfter)
    || report.controlChanged !== (report.controlStateHashBefore !== report.controlStateHashAfter)
    || computeCampaignBattleControlIntegrity(report) !== report.integrityHash) {
    throw new Error("Campaign battle control report is malformed, modified, or cross-bound.");
  }
  const nonTerminalIds = consequence.formationConsequences
    .filter((entry) => !TERMINAL_FORMATION_STATUSES.has(entry.statusAfter))
    .map((entry) => entry.campaignFormationId);
  const dispositionIds = report.formationDispositions.map((entry) => entry.campaignFormationId);
  if (dispositionIds.length !== nonTerminalIds.length
    || new Set(dispositionIds).size !== dispositionIds.length
    || nonTerminalIds.some((id) => !dispositionIds.includes(id))) {
    throw new Error("Campaign battle control report does not dispose every surviving formation exactly once.");
  }
  report.formationDispositions.forEach((entry) => {
    if (![entry.readinessBefore, entry.readinessAfter, entry.cohesionBefore, entry.cohesionAfter,
      entry.fatigueBefore, entry.fatigueAfter].every(isNonNegativeFinite)
      || !Object.values(entry.supplyBefore).every(isNonNegativeFinite)
      || !Object.values(entry.supplyAfter).every(isNonNegativeFinite)
      || !Object.values(entry.abandonedEquipment).every(isNonNegativeFinite)
      || !entry.explanation.trim()
      || (entry.disposition === "held" && entry.destinationHexKey !== entry.sourceHexKey)
      || (entry.disposition === "occupied" && entry.campaignFormationId !== report.occupyingFormationId)
      || (entry.disposition === "retreated" && (!entry.destinationHexKey || entry.retreatOptions.length === 0))
      || (entry.disposition === "capturedNoRoute" && (entry.destinationHexKey !== null || entry.statusAfter !== "captured"))) {
      throw new Error(`Formation control disposition ${entry.campaignFormationId} is malformed.`);
    }
    entry.retreatOptions.forEach((option) => {
      if (!option.hexKey || !Number.isInteger(option.occupiedFormationCount) || option.occupiedFormationCount < 0
        || !Number.isInteger(option.distanceFromBattle) || option.distanceFromBattle < 0
        || option.legal !== (option.rejectionReason === null)) {
        throw new Error(`Formation ${entry.campaignFormationId} has a malformed retreat option.`);
      }
    });
    const firstLegal = entry.retreatOptions.find((option) => option.legal)?.hexKey ?? null;
    if ((entry.disposition === "retreated" && entry.destinationHexKey !== firstLegal)
      || (entry.disposition === "capturedNoRoute" && firstLegal !== null)
      || (entry.disposition === "retreated" && (
        entry.readinessAfter !== Math.max(0, entry.readinessBefore - 10)
        || entry.cohesionAfter !== Math.max(0, entry.cohesionBefore - 10)
        || entry.fatigueAfter !== Math.min(100, entry.fatigueBefore + 10)
        || entry.supplyAfter.fuel !== Math.max(0, entry.supplyBefore.fuel - 1)
        || entry.supplyAfter.rations !== Math.max(0, entry.supplyBefore.rations - 1)
      ))) {
      throw new Error(`Formation control disposition ${entry.campaignFormationId} violates retreat policy.`);
    }
  });
  if (report.occupationRequired !== (report.controllerBefore !== (
    result.result === "attackerVictory" ? consequence.formationConsequences.find((entry) => entry.role === "attacker")?.faction
      : result.result === "defenderVictory" || result.result === "withdrawal"
        ? consequence.formationConsequences.find((entry) => entry.role === "defender")?.faction
        : report.controllerBefore
  ))
    || (report.occupationOutcome === "satisfied") !== report.controlChanged
    || (report.occupationOutcome === "satisfied") !== (report.occupyingFormationId !== null)) {
    throw new Error("Campaign battle occupation accounting is inconsistent.");
  }
  assertDerivedFronts(report.frontsAfter);
  return structuredClone(report);
}

/** Applies C20-024 operational placement and control rules to a transaction draft after C20-023. */
export function applyCampaignBattleControl(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  result: CampaignBattleResultPackage,
  consequence: CampaignBattleConsequenceReport
): CampaignBattleControlApplication {
  const ledger = runtime.engagementLedger[result.engagementId];
  if (!ledger?.package || !ledger.resultPackage || !ledger.consequenceReport) {
    throw new Error("Battle control resolution requires frozen commitment, result, and consequence records.");
  }
  assertCampaignBattleConsequenceReport(consequence, result);
  if (ledger.controlReport) {
    return {
      duplicate: true,
      report: assertCampaignBattleControlReport(ledger.controlReport, result, consequence),
      events: []
    };
  }
  const battleHexKey = runtimeHexKeyFromOffset(ledger.package.context.battleHexKey);
  const battleTile = battleHexKey ? runtime.tiles[battleHexKey] : null;
  if (!battleHexKey || !battleTile) throw new Error("The frozen battle hex does not exist in campaign runtime geometry.");
  const frontsBefore = structuredClone(runtime.compatibility.initialFronts);
  const controllerBefore = battleTile.controller;
  const controlSinceSegmentBefore = battleTile.controlSinceSegment;
  const controlStateHashBefore = computeCampaignControlStateHash(runtime);
  const attacker = ledger.package.context.attacker;
  const defender = ledger.package.context.defender;
  const desiredController = result.result === "attackerVictory"
    ? attacker
    : result.result === "defenderVictory" || result.result === "withdrawal"
      ? defender
      : controllerBefore;
  const occupationRequired = desiredController !== controllerBefore;
  let occupationOutcome: CampaignOccupationOutcome = "notRequired";
  let occupier: CampaignFormationRecord | null = null;
  if (occupationRequired) {
    occupier = chooseOccupier(
      runtime,
      result,
      consequence,
      desiredController,
      battleHexKey,
      ledger.package.context.amphibious
    );
    const participantIds = new Set(consequence.formationConsequences.map((entry) => entry.campaignFormationId));
    const blockingUncommitted = battleTile.formationIds.some((formationId) => {
      const formation = runtime.formations[formationId];
      return Boolean(formation && formation.faction !== desiredController && !participantIds.has(formationId));
    });
    occupationOutcome = blockingUncommitted
      ? "failedEnemyPresence"
      : occupier ? "satisfied" : "failedNoEligibleOccupier";
  }
  const controllerAfter = occupationOutcome === "satisfied" ? desiredController : controllerBefore;
  const dispositionById = new Map<string, CampaignFormationControlDisposition>();

  consequence.formationConsequences.forEach((entry) => {
    if (TERMINAL_FORMATION_STATUSES.has(entry.statusAfter)) return;
    const formation = runtime.formations[entry.campaignFormationId];
    if (!formation || !formation.locationHexKey) {
      throw new Error(`Surviving formation ${entry.campaignFormationId} has no operational placement.`);
    }
    const displaced = formation.locationHexKey === battleHexKey && formation.faction !== controllerAfter;
    if (!displaced) return;
    const before = {
      status: formation.status,
      readiness: formation.readiness,
      cohesion: formation.cohesion,
      fatigue: formation.fatigue,
      supply: snapshotSupply(formation)
    };
    const options = retreatOptions(runtime, definition, formation.locationHexKey, battleHexKey, formation.faction);
    const destination = options.find((option) => option.legal)?.hexKey ?? null;
    if (!destination) {
      if (!retireCampaignFormation(
        runtime,
        formation.id,
        "captured",
        runtime.currentSegment,
        `${formation.name} was captured after engagement ${result.engagementId}; no legal retreat route remained.`
      )) {
        throw new Error(`No-route formation ${formation.id} could not be captured.`);
      }
      dispositionById.set(formation.id, emptyDisposition(
        formation,
        entry,
        "capturedNoRoute",
        null,
        "No adjacent friendly-controlled tile had legal stack capacity; the formation was captured.",
        options,
        {},
        before
      ));
      return;
    }
    if (!relocateCampaignFormation(
      runtime,
      formation.id,
      destination,
      runtime.currentSegment,
      `${formation.name} retreated from ${battleHexKey} to ${destination} after engagement ${result.engagementId}.`
    )) {
      throw new Error(`Formation ${formation.id} could not use its selected retreat route.`);
    }
    const abandoned = applyRetreatWear(formation);
    dispositionById.set(formation.id, emptyDisposition(
      formation,
      entry,
      "retreated",
      destination,
      `Retreated to the highest-ranked legal friendly tile; readiness/cohesion fell, fatigue rose, and disabled equipment recovery was reduced.`,
      options,
      abandoned,
      before
    ));
  });

  if (occupationOutcome === "satisfied") {
    battleTile.controller = desiredController;
    battleTile.controlSinceSegment = runtime.currentSegment;
    if (!occupier || !occupier.locationHexKey) throw new Error("Satisfied occupation has no placed formation.");
    const consequenceEntry = consequence.formationConsequences.find((entry) => entry.campaignFormationId === occupier!.id)!;
    const before = {
      status: occupier.status,
      readiness: occupier.readiness,
      cohesion: occupier.cohesion,
      fatigue: occupier.fatigue,
      supply: snapshotSupply(occupier)
    };
    if (occupier.locationHexKey !== battleHexKey) {
      if (!relocateCampaignFormation(
        runtime,
        occupier.id,
        battleHexKey,
        runtime.currentSegment,
        `${occupier.name} occupied ${battleHexKey} after engagement ${result.engagementId}.`
      )) {
        throw new Error(`Occupation formation ${occupier.id} could not enter the battle hex.`);
      }
      occupier.fatigue = Math.min(100, occupier.fatigue + 5);
      occupier.supply.fuel = Math.max(0, occupier.supply.fuel - 1);
      occupier.supply.rations = Math.max(0, occupier.supply.rations - 1);
    }
    dispositionById.set(occupier.id, emptyDisposition(
      occupier,
      consequenceEntry,
      "occupied",
      battleHexKey,
      "The highest-readiness eligible surviving formation established occupation of the battle hex.",
      [],
      {},
      before
    ));
  }

  consequence.formationConsequences.forEach((entry) => {
    if (TERMINAL_FORMATION_STATUSES.has(entry.statusAfter) || dispositionById.has(entry.campaignFormationId)) return;
    const formation = runtime.formations[entry.campaignFormationId];
    if (!formation || !formation.locationHexKey) throw new Error(`Formation ${entry.campaignFormationId} lost placement before control finalization.`);
    dispositionById.set(formation.id, emptyDisposition(
      formation,
      entry,
      "held",
      formation.locationHexKey,
      occupationRequired && occupationOutcome !== "satisfied"
        ? `Held at its campaign source because occupation failed: ${occupationOutcome}.`
        : "Returned to or held its campaign source; no operational displacement was required."
    ));
  });

  synchronizeCampaignFormationForceProjection(runtime);
  const isolationChanges = resolveIsolation(runtime, definition);
  const isolationByFormation = new Map(isolationChanges.map((entry) => [entry.campaignFormationId, entry]));
  const formationDispositions = Array.from(dispositionById.values()).map((entry) => {
    const change = isolationByFormation.get(entry.campaignFormationId);
    const formation = runtime.formations[entry.campaignFormationId];
    return change && formation ? {
      ...entry,
      statusAfter: formation.status,
      explanation: `${entry.explanation} The resulting control graph ${change.isolatedAfter ? "isolated the formation" : "restored its supply path"}.`
    } : entry;
  }).sort((left, right) => left.campaignFormationId.localeCompare(right.campaignFormationId));
  const preferredInitiative = result.result === "attackerVictory"
    ? attacker
    : result.result === "defenderVictory" || result.result === "withdrawal" ? defender : null;
  const frontsAfter = deriveCampaignFrontsFromControl(runtime, preferredInitiative);
  assertDerivedFronts(frontsAfter);
  runtime.compatibility.initialFronts.splice(0, runtime.compatibility.initialFronts.length, ...structuredClone(frontsAfter));
  const controlStateHashAfter = computeCampaignControlStateHash(runtime);
  const unsigned: Omit<CampaignBattleControlReport, "integrityHash"> = {
    controlVersion: CAMPAIGN_BATTLE_CONTROL_REPORT_VERSION,
    campaignId: runtime.campaignId,
    scenarioKey: runtime.scenarioKey,
    engagementId: result.engagementId,
    resolutionId: result.resolutionId,
    battleResultIntegrityHash: result.integrityHash,
    consequenceIntegrityHash: consequence.integrityHash,
    sourceRevision: runtime.revision,
    appliedRevision: runtime.revision + 1,
    appliedSegment: runtime.currentSegment,
    result: result.result,
    battleHexKey,
    controllerBefore,
    controllerAfter,
    controlChanged: controllerBefore !== controllerAfter,
    controlSinceSegmentBefore,
    controlSinceSegmentAfter: battleTile.controlSinceSegment,
    controlStateHashBefore,
    controlStateHashAfter,
    occupationRequired,
    occupationOutcome,
    occupyingFormationId: occupationOutcome === "satisfied" ? occupier?.id ?? null : null,
    formationDispositions,
    isolationChanges,
    frontsBefore,
    frontsAfter
  };
  const report: CampaignBattleControlReport = { ...unsigned, integrityHash: controlIntegrity(unsigned) };
  assertCampaignBattleControlReport(report, result, consequence);
  ledger.controlReport = structuredClone(report);

  const events: CampaignDomainEventDraft[] = [{
    type: "stateChanged",
    category: "control",
    summary: report.controlChanged
      ? `${String(report.controllerAfter)} occupied ${battleHexKey} after engagement ${result.engagementId}.`
      : `Control of ${battleHexKey} remained with ${String(report.controllerAfter)} after engagement ${result.engagementId}.`,
    details: {
      engagementId: result.engagementId,
      battleHexKey,
      controllerBefore: String(report.controllerBefore),
      controllerAfter: String(report.controllerAfter),
      occupationOutcome
    }
  }];
  formationDispositions.filter((entry) => entry.disposition !== "held").forEach((entry) => events.push({
    type: "stateChanged",
    category: entry.disposition === "occupied" ? "control" : "movement",
    summary: `${runtime.formations[entry.campaignFormationId]?.name ?? entry.campaignFormationId}: ${entry.explanation}`,
    details: {
      engagementId: result.engagementId,
      formationId: entry.campaignFormationId,
      disposition: entry.disposition,
      destinationHexKey: entry.destinationHexKey,
      statusAfter: entry.statusAfter
    }
  }));
  isolationChanges.forEach((entry) => events.push({
    type: "stateChanged",
    category: "logistics",
    summary: `${runtime.formations[entry.campaignFormationId]?.name ?? entry.campaignFormationId} ${entry.isolatedAfter ? "became isolated" : "regained supply connection"}.`,
    details: {
      formationId: entry.campaignFormationId,
      faction: String(entry.faction),
      hexKey: entry.hexKey,
      isolated: entry.isolatedAfter
    }
  }));
  events.push({
    type: "stateChanged",
    category: "control",
    summary: "Campaign fronts were rebuilt from opposing tile-control adjacency.",
    details: { engagementId: result.engagementId, frontCount: frontsAfter.length }
  });
  return { duplicate: false, report: structuredClone(report), events };
}
