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
  CampaignPendingEngagement,
  CampaignScenarioData
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
const AUTHORED_COUNTERATTACK_MODIFIER = /^counterattack@(\d+)$/;

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
        && isCampaignFormationBattleEligible(formation)
        && mapCampaignUnitToAllocationKey(formation.campaignUnitType)
      );
    })
    .sort();
}

/**
 * Converts an authored enemy-initiative front into a deterministic contact opportunity once its
 * published cadence is reached. The target comes only from the front's exact public control edge,
 * and the attacker list comes only from the AI faction's own formation truth. This is a bounded
 * fallback for scenario-defining counterattacks when the general portfolio is occupied by
 * intelligence and reserve work; it does not search for a substitute Player target.
 */
function authoredCounterattack(
  runtime: CampaignRuntimeState,
  faction: CampaignFactionKey
): { plan: CampaignAISelectedPlan; directive: CampaignAIPlanBehaviorDirective } | null {
  const candidates = runtime.compatibility.initialFronts
    .flatMap((front) => {
      if (front.initiative !== faction || !front.edges?.length) return [];
      const alreadyOpened = runtime.engagementOrder.some((engagementId) => {
        const prior = runtime.engagements[engagementId]?.engagement;
        return prior?.frontKey === front.key && prior.attacker === faction;
      }) || runtime.engagementLedgerOrder.some((engagementId) => {
        const prior = runtime.engagementLedger[engagementId]?.package?.engagement;
        return prior?.frontKey === front.key && prior.attacker === faction;
      });
      if (alreadyOpened) return [];
      const cadence = front.modifiers?.flatMap((modifier) => {
        const match = AUTHORED_COUNTERATTACK_MODIFIER.exec(modifier);
        return match ? [Number(match[1])] : [];
      })[0];
      if (!Number.isInteger(cadence) || cadence! < 0 || runtime.currentSegment < cadence!) return [];
      return front.edges.map((edge) => ({ front, edge, cadence: cadence! }));
    })
    .sort((left, right) => left.cadence - right.cadence
      || left.front.key.localeCompare(right.front.key)
      || left.edge.opposingHexKey.localeCompare(right.edge.opposingHexKey));

  for (const candidate of candidates) {
    const targetRuntimeHexKey = campaignOffsetKeyToRuntimeHexKey(candidate.edge.opposingHexKey);
    const friendlyRuntimeHexKey = campaignOffsetKeyToRuntimeHexKey(candidate.edge.friendlyHexKey);
    if (!targetRuntimeHexKey || !friendlyRuntimeHexKey
      || runtime.tiles[targetRuntimeHexKey]?.controller !== "Player"
      || runtime.tiles[friendlyRuntimeHexKey]?.controller !== faction) continue;
    const assignedFormationIds = [...runtime.tiles[friendlyRuntimeHexKey].formationIds]
      .filter((formationId) => runtime.formations[formationId]?.faction === faction)
      .sort();
    if (assignedFormationIds.length === 0) continue;
    const planId = createStableCampaignRecordId(
      "authored-counterattack",
      runtime.campaignId,
      faction,
      candidate.front.key,
      candidate.edge.opposingHexKey,
      candidate.cadence
    );
    const plan: CampaignAISelectedPlan = {
      planId,
      candidateId: `${planId}:candidate`,
      signature: `counterattack:${candidate.edge.opposingHexKey}:${candidate.front.key}`,
      kind: "counterattack",
      targetHexKey: candidate.edge.opposingHexKey,
      sourceFindingIds: [`front:${candidate.front.key}`],
      objectiveKeys: [],
      contactIds: [],
      assignedFormationIds,
      resources: { supplies: 0, fuel: 0, ammo: 0, manpower: 0, intelligenceCapacity: 0 },
      score: 100,
      startedSegment: candidate.cadence,
      lastReviewedSegment: runtime.currentSegment,
      commitmentUntilSegment: runtime.currentSegment + 1,
      triggers: { reinforce: [], exploit: [], abort: [], withdraw: [] },
      summary: `Execute the published counterattack on ${candidate.front.label}.`
    };
    return {
      plan,
      directive: {
        planId,
        planKind: "counterattack",
        status: "holding",
        orderIds: [],
        reason: "The counterattack force is staged on its exact authored front."
      }
    };
  }
  return null;
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
  directive: CampaignAIPlanBehaviorDirective,
  frozenScenario?: CampaignScenarioData
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
  // Segment resolution builds AI records before the engagement phase, while the transaction's
  // revision is not committed until every phase passes. Use the already-frozen, valid opening
  // projection in that path; standalone callers may still project a fully valid runtime here.
  const scenario = frozenScenario ?? projectLegacyCampaignState(definition, runtime).scenario;
  const rawContext = buildEngagementContext(scenario, {
    engagementId,
    battleHexKey: plan.targetHexKey,
    attacker: faction,
    frontKey,
    objectiveKey,
    intelligenceBriefing
  }, runtime);
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
  events: CampaignDomainEventDraft[],
  frozenScenario?: CampaignScenarioData
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
      const initiated = initiateCampaignAIOffensive(runtime, definition, faction, plan, directive, frozenScenario);
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
    const authored = authoredCounterattack(runtime, faction);
    if (authored) {
      const initiated = initiateCampaignAIOffensive(runtime, definition, faction, authored.plan, authored.directive, frozenScenario);
      if (initiated) {
        events.push({
          type: "stateChanged",
          category: "engagement",
          summary: `Enemy forces have opened the published counterattack at ${runtime.engagements[initiated.engagementId]!.engagement.context!.battleHexKey}.`,
          details: {
            engagementId: initiated.engagementId,
            battleHexKey: runtime.engagements[initiated.engagementId]!.engagement.context!.battleHexKey,
            playerDefenseRequired: true
          }
        });
        return [initiated.engagementId, initiated.packageId, ...initiated.attackerFormationIds, ...initiated.defenderFormationIds];
      }
    }
  }
  return [];
}
