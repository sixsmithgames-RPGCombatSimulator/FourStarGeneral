/**
 * MODULE: CampaignAIEngagementService
 * WHAT: Converts a staged Bot offensive plan into one exact campaign engagement and tactical package.
 * WHY: AI attacks must cross the same ledger, formation lock, save, and consequence boundary as Player attacks.
 */

import { hexDistance } from "../../../core/Hex";
import type {
  CampaignEngagementContext,
  CampaignEngagementForceGroup,
  CampaignFactionKey,
  CampaignPendingEngagement
} from "../../../core/campaignTypes";
import { getAllocationOption } from "../../../data/unitAllocation";
import { buildIntelligenceBriefing } from "../../../state/CampaignIntelligence";
import { buildEngagementContext } from "../EngagementContextBuilder";
import {
  buildAllocationCaps,
  mapCampaignUnitToAllocationKey,
  sumForcePoolRpValue
} from "../campaignForceMapping";
import {
  commitCampaignEngagement,
  planCampaignEngagement,
  reconcileCampaignEngagementLedger
} from "../engagements/CampaignEngagementLedgerService";
import { attachCampaignFormationProvenanceToContext, isCampaignFormationBattleEligible } from "../formations/CampaignFormationBattleAdapter";
import { campaignOffsetKeyToRuntimeHexKey } from "../orders/CampaignOrderService";
import { createStableCampaignRecordId } from "../runtime/CampaignCanonical";
import { projectLegacyCampaignState } from "../runtime/CampaignScenarioAdapter";
import type {
  CampaignDomainEventDraft,
  CampaignRuntimeState,
  CampaignScenarioDefinition
} from "../runtime/campaignRuntimeTypes";
import type { CampaignAIPlanBehaviorDirective } from "./CampaignAIBehaviorTypes";
import type { CampaignAISelectedPlan } from "./CampaignAIPlanningTypes";

const OFFENSIVE_PLAN_KINDS = new Set(["prepareOffensive", "counterattack"]);

export interface CampaignAIEngagementInitiationResult {
  readonly engagementId: string;
  readonly packageId: string;
  readonly attackerFormationIds: readonly string[];
  readonly defenderFormationIds: readonly string[];
}

function groupWithExactFormations(
  groups: readonly CampaignEngagementForceGroup[],
  allowedFormationIds: ReadonlySet<string>
): CampaignEngagementForceGroup[] {
  return groups.flatMap((group) => {
    const formationIds = (group.formationIds ?? []).filter((id) => allowedFormationIds.has(id));
    return formationIds.length > 0 ? [{ ...structuredClone(group), count: formationIds.length, formationIds }] : [];
  });
}

function targetObjectiveKey(definition: CampaignScenarioDefinition, runtimeHexKey: string): string | null {
  return definition.objectives.find((objective) => `${objective.hex.q},${objective.hex.r}` === runtimeHexKey)?.key ?? null;
}

function targetFrontKey(runtime: CampaignRuntimeState, offsetHexKey: string): string | null {
  return runtime.compatibility.initialFronts.find((front) => (
    front.hexKeys.includes(offsetHexKey)
    || front.edges?.some((edge) => edge.friendlyHexKey === offsetHexKey || edge.opposingHexKey === offsetHexKey)
  ))?.key ?? null;
}

function exactReadyFormationIds(
  runtime: CampaignRuntimeState,
  formationIds: readonly string[],
  faction: CampaignFactionKey,
  targetRuntimeHexKey: string
): string[] {
  const targetHex = runtime.tiles[targetRuntimeHexKey]?.hex;
  if (!targetHex) return [];
  return [...new Set(formationIds)].filter((formationId) => {
    const formation = runtime.formations[formationId];
    const sourceHex = formation?.locationHexKey ? runtime.tiles[formation.locationHexKey]?.hex : null;
    return Boolean(
      formation
      && formation.faction === faction
      && formation.currentOrderId === null
      && isCampaignFormationBattleEligible(formation)
      && mapCampaignUnitToAllocationKey(formation.campaignUnitType)
      && sourceHex
      && runtime.tiles[formation.locationHexKey!]?.controller === faction
      && hexDistance(sourceHex, targetHex) <= 1
    );
  }).sort();
}

function exactAvailableDefenderIds(
  runtime: CampaignRuntimeState,
  context: CampaignEngagementContext,
  defender: CampaignFactionKey
): string[] {
  return [...new Set(context.enemyForces.flatMap((group) => group.formationIds ?? []))]
    .filter((formationId) => {
      const formation = runtime.formations[formationId];
      return Boolean(
        formation
        && formation.faction === defender
        && formation.currentOrderId === null
        && isCampaignFormationBattleEligible(formation)
        && mapCampaignUnitToAllocationKey(formation.campaignUnitType)
      );
    })
    .sort();
}

/**
 * Attempts one already-selected offensive. The target is never substituted: if the private plan's
 * projected target is not a legal Player hex, the operation remains staged for a later assessment.
 */
export function initiateCampaignAIOffensive(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  faction: CampaignFactionKey,
  plan: CampaignAISelectedPlan,
  directive: CampaignAIPlanBehaviorDirective
): CampaignAIEngagementInitiationResult | null {
  if (faction !== "Bot" || !OFFENSIVE_PLAN_KINDS.has(plan.kind)
    || directive.planId !== plan.planId || directive.planKind !== plan.kind
    || directive.status === "blocked" || runtime.activeEngagementId) return null;

  const targetRuntimeHexKey = campaignOffsetKeyToRuntimeHexKey(plan.targetHexKey);
  const targetTile = targetRuntimeHexKey ? runtime.tiles[targetRuntimeHexKey] : null;
  // This is a physical-legality check, not target selection. Never search hidden truth for an alternative.
  if (!targetRuntimeHexKey || !targetTile || targetTile.controller !== "Player") return null;

  const attackerFormationIds = exactReadyFormationIds(
    runtime,
    plan.assignedFormationIds,
    faction,
    targetRuntimeHexKey
  );
  if (attackerFormationIds.length === 0 || !attackerFormationIds.some((formationId) => (
    mapCampaignUnitToAllocationKey(runtime.formations[formationId]!.campaignUnitType) !== "supplyConvoy"
  ))) return null;

  const engagementId = createStableCampaignRecordId(
    "ai-engagement",
    runtime.campaignId,
    faction,
    plan.planId,
    targetRuntimeHexKey,
    runtime.currentSegment
  );
  if (runtime.engagementLedger[engagementId] || runtime.engagements[engagementId]) return null;

  const playerKnowledge = runtime.knowledgeByFaction.Player;
  const intelligenceBriefing = playerKnowledge
    ? buildIntelligenceBriefing(playerKnowledge, plan.targetHexKey, runtime.currentSegment)
    : undefined;
  const frontKey = targetFrontKey(runtime, plan.targetHexKey);
  const objectiveKey = targetObjectiveKey(definition, targetRuntimeHexKey);
  const scenario = projectLegacyCampaignState(definition, runtime).scenario;
  const rawContext = buildEngagementContext(scenario, {
    engagementId,
    battleHexKey: plan.targetHexKey,
    attacker: faction,
    frontKey,
    objectiveKey,
    intelligenceBriefing
  });
  if (!rawContext || rawContext.defender !== "Player") return null;

  const identifiedContext = attachCampaignFormationProvenanceToContext(rawContext, runtime);
  const defenderFormationIds = exactAvailableDefenderIds(runtime, identifiedContext, "Player");
  if (defenderFormationIds.length === 0 || !defenderFormationIds.some((formationId) => (
    mapCampaignUnitToAllocationKey(runtime.formations[formationId]!.campaignUnitType) !== "supplyConvoy"
  ))) return null;
  const availableForces = groupWithExactFormations(identifiedContext.availableForces, new Set(attackerFormationIds));
  const enemyForces = groupWithExactFormations(identifiedContext.enemyForces, new Set(defenderFormationIds));
  const representedAttackerIds = new Set(availableForces.flatMap((group) => group.formationIds ?? []));
  if (representedAttackerIds.size !== attackerFormationIds.length
    || attackerFormationIds.some((id) => !representedAttackerIds.has(id))) return null;

  const attackerForceValue = sumForcePoolRpValue(availableForces);
  const defenderForceValue = sumForcePoolRpValue(enemyForces);
  const context: CampaignEngagementContext = {
    ...identifiedContext,
    availableForces,
    allocationCaps: buildAllocationCaps(availableForces),
    enemyForces,
    playerForceValue: attackerForceValue,
    enemyForceValue: defenderForceValue,
    forceRatio: defenderForceValue > 0 ? attackerForceValue / defenderForceValue : Number.MAX_SAFE_INTEGER,
    intelligenceBriefing
  };
  const engagement: CampaignPendingEngagement = {
    id: engagementId,
    frontKey,
    objectiveKey,
    attacker: faction,
    defender: "Player",
    hexKeys: [plan.targetHexKey],
    tags: [
      "ai-initiated",
      "player-defense",
      plan.kind === "counterattack" ? "counterattack" : "offensive",
      `ai-plan:${plan.planId}`
    ],
    context
  };
  runtime.engagementOrder.push(engagementId);
  runtime.engagements[engagementId] = { id: engagementId, status: "opportunity", engagement };
  reconcileCampaignEngagementLedger(runtime);
  planCampaignEngagement(runtime, engagementId);

  const counts = new Map<string, number>();
  attackerFormationIds.forEach((formationId) => {
    const allocationKey = mapCampaignUnitToAllocationKey(runtime.formations[formationId]!.campaignUnitType);
    if (allocationKey) counts.set(allocationKey, (counts.get(allocationKey) ?? 0) + 1);
  });
  const selections = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([allocationKey, quantity]) => {
    const option = getAllocationOption(allocationKey);
    return {
      allocationKey,
      category: option?.category ?? "units",
      quantity,
      unitRpCost: option?.costPerUnit ?? 0
    };
  });
  const committed = commitCampaignEngagement(runtime, {
    engagementId,
    expectedRevision: runtime.revision,
    selections
  });
  return {
    engagementId,
    packageId: committed.package.packageId,
    attackerFormationIds: committed.package.formationCommitments
      .filter((entry) => entry.role === "attacker")
      .map((entry) => entry.formationId),
    defenderFormationIds: committed.package.formationCommitments
      .filter((entry) => entry.role === "defender")
      .map((entry) => entry.formationId)
  };
}

/** Resolves at most one tactical contact because the runtime permits only one active package. */
export function resolveCampaignAIEngagements(
  runtime: CampaignRuntimeState,
  definition: CampaignScenarioDefinition,
  events: CampaignDomainEventDraft[]
): string[] {
  if (runtime.activeEngagementId) return [];
  for (const faction of runtime.factionOrder) {
    if (faction !== "Bot") continue;
    const planning = runtime.aiPlanningByFaction?.[faction];
    const behavior = runtime.aiBehaviorsByFaction?.[faction];
    if (!planning || !behavior || behavior.planningId !== planning.id) continue;
    for (const plan of planning.portfolio.selectedPlans) {
      const directive = behavior.directives.find((entry) => entry.planId === plan.planId);
      if (!directive) continue;
      const initiated = initiateCampaignAIOffensive(runtime, definition, faction, plan, directive);
      if (!initiated) continue;
      events.push({
        type: "stateChanged",
        category: "engagement",
        summary: `Enemy forces have initiated a tactical engagement at ${runtime.engagements[initiated.engagementId]!.engagement.context!.battleHexKey}.`,
        details: {
          engagementId: initiated.engagementId,
          battleHexKey: runtime.engagements[initiated.engagementId]!.engagement.context!.battleHexKey,
          playerDefenseRequired: true
        }
      });
      return [initiated.engagementId, initiated.packageId, ...initiated.attackerFormationIds, ...initiated.defenderFormationIds];
    }
  }
  return [];
}
