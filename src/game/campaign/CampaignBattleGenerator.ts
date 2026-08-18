/**
 * Generates the tactical scenario for a campaign engagement.
 *
 * Takes the selected battle template (map, player deployment zones, objectives) and replaces the
 * Bot order of battle with units generated from the engagement context's enemy pool: what is on
 * and adjacent to the contested campaign hex is what defends it. Entrenchment and Bot resources
 * derive from the mission type and the pool's mapped RP value.
 *
 * The generated scenario is cached per engagement id so PrecombatScreen and BattleScreen receive
 * the identical object. Every failure path falls back to the legacy default scenario — battle
 * generation must never block the player from fighting.
 *
 * Design reference: docs/CAMPAIGN_BATTLE_GENERATION_DESIGN.md ("Enemy force generation").
 */

import { getScenarioByMissionKey, type ScenarioSource } from "../../data/scenarioRegistry";
import { assertScenarioSourceValid } from "../../data/scenarioValidation";
import { ensureCampaignState } from "../../state/CampaignState";
import type { CampaignEngagementContext, CampaignMissionType } from "../../core/campaignTypes";
import type { FormationStatus, ScenarioUnit, TacticalCampaignFormationProvenance } from "../../core/types";
import { findTemplateForUnitKey } from "../adapters";
import { mapCampaignUnitToAllocationKey, getCampaignUnitRpValue, CAMPAIGN_AIR_UNIT_TYPES, CAMPAIGN_NAVAL_UNIT_TYPES } from "./campaignForceMapping";
import { getBattleTemplateByKey, hasBattleTemplatesForCampaign, selectBattleTemplate } from "./battleTemplates";
import { MISSION_TYPE_LABELS } from "./EngagementContextBuilder";
import { createCampaignFormationBattleSeed } from "./formations/CampaignFormationBattleAdapter";
import type { CampaignRuntimeState } from "./runtime/campaignRuntimeTypes";
import type { CampaignBattlePackage } from "./engagements/CampaignEngagementLedgerTypes";

/** Hard ceiling for unfrozen previews; exact committed packages must represent every locked formation. */
const MAX_GENERATED_BOT_UNITS = 30;

/** Entrenchment by mission type — fortifications dig in, meeting engagements start exposed. */
const ENTRENCH_BY_MISSION: Readonly<Record<CampaignMissionType, number>> = Object.freeze({
  fortifiedAssault: 3,
  lineAssault: 2,
  portAssault: 1,
  airfieldRaid: 1,
  depotRaid: 1,
  meetingEngagement: 0
});

/** Bot doctrine strings per mission type, surfaced in briefings and bot planning. */
const BOT_DOCTRINE: Readonly<Record<CampaignMissionType, { goal: string; strategy: string }>> = Object.freeze({
  fortifiedAssault: {
    goal: "Hold the fortified works at all costs.",
    strategy: "Fight from prepared positions; artillery breaks assaults on the wire, armor counterattacks only to seal breaches."
  },
  lineAssault: {
    goal: "Hold the defensive line until the attack culminates.",
    strategy: "Defend in depth, trade ground for casualties, and commit reserves against the main effort."
  },
  portAssault: {
    goal: "Deny the port facilities to the attacker.",
    strategy: "Contest the waterline, keep flak active, and demolish key quays before they can be captured intact."
  },
  airfieldRaid: {
    goal: "Protect the airfield and keep the strip operational.",
    strategy: "Screen the perimeter, scramble what can fly, and hold hangars and fuel dumps with mobile reserves."
  },
  depotRaid: {
    goal: "Protect the depot stockpiles.",
    strategy: "Guard the depot approaches, harass raiders with mobile detachments, and torch stores rather than lose them."
  },
  meetingEngagement: {
    goal: "Seize the contested ground before the enemy consolidates.",
    strategy: "Advance aggressively to key terrain, recon forward, and win the race for defensible positions."
  }
});

/** Bot doctrine when the campaign opponent owns the initiative and the Player must defend. */
const BOT_OFFENSIVE_DOCTRINE: Readonly<Record<CampaignMissionType, { goal: string; strategy: string }>> = Object.freeze({
  fortifiedAssault: {
    goal: "Breach the prepared works and seize the defended objective.",
    strategy: "Concentrate fire on one sector, force a breach, and drive mobile elements through before the defense can recover."
  },
  lineAssault: {
    goal: "Break the Player line and secure the operational route beyond it.",
    strategy: "Fix the strongest position, probe the flanks, and mass the main effort against the first exposed seam."
  },
  portAssault: {
    goal: "Capture the port facilities and deny their use to the defender.",
    strategy: "Press the perimeter, isolate the quays, and keep the defenders from organizing a coherent inner line."
  },
  airfieldRaid: {
    goal: "Overrun the airfield and destroy its operational capacity.",
    strategy: "Advance quickly through the perimeter and contest hangars, fuel storage, and the runway before reserves arrive."
  },
  depotRaid: {
    goal: "Seize or destroy the depot stockpiles.",
    strategy: "Bypass fixed resistance where possible, reach the stores, and prevent an orderly evacuation."
  },
  meetingEngagement: {
    goal: "Seize the contested ground before the Player defense consolidates.",
    strategy: "Push reconnaissance forward, occupy key terrain, and exploit local superiority without waiting for a perfect line."
  }
});

type RawUnit = {
  type: string;
  hex: [number, number];
  strength: number;
  experience: number;
  ammo: number;
  fuel: number;
  entrench: number;
  facing: string;
  baseExperience?: number;
  earnedExperience?: number;
  formationKey?: string;
  status?: FormationStatus;
  unitId?: string;
  campaignProvenance?: TacticalCampaignFormationProvenance;
};

function relabelInvertedDeploymentZone(
  zone: Record<string, unknown>,
  faction: "Player" | "Bot"
): void {
  const replacement = faction === "Player" ? "Friendly" : "Enemy";
  const replaceFactionTerms = (value: unknown): string => String(value ?? "")
    .replace(/\b(German|Axis|Allied|American|British|Eighth Army|U\.S\.)\b/gi, replacement)
    .replace(/\s+/g, " ")
    .trim();
  const label = replaceFactionTerms(zone["label"] || "Deployment Area");
  zone["label"] = label;
  zone["description"] = faction === "Player"
    ? `${label}. Friendly defensive deployment area for this campaign engagement.`
    : `${label}. Enemy attack assembly area for this campaign engagement.`;
}

function relabelCampaignDeploymentZones(
  scenario: Record<string, unknown>,
  playerDefense: boolean,
  battleHexKey: string
): void {
  const zones = Array.isArray(scenario["deploymentZones"])
    ? scenario["deploymentZones"] as Array<Record<string, unknown>>
    : [];
  const factionIndexes = new Map<string, number>();
  zones.forEach((zone) => {
    const faction = zone["faction"] === "Bot" ? "Bot" : "Player";
    const index = (factionIndexes.get(faction) ?? 0) + 1;
    factionIndexes.set(faction, index);
    if (faction === "Player") {
      const role = playerDefense ? "Defense Sector" : "Assault Staging Area";
      zone["label"] = `Friendly ${role} ${index}`;
      zone["description"] = playerDefense
        ? `Campaign formations defending the engagement area at operational hex ${battleHexKey}.`
        : `Campaign formations assembling to attack from operational hex ${battleHexKey}.`;
    } else {
      const role = playerDefense ? "Attack Assembly Area" : "Defense Sector";
      zone["label"] = `Opposing ${role} ${index}`;
      zone["description"] = playerDefense
        ? `Opposing formations assembling to attack the engagement area at operational hex ${battleHexKey}.`
        : `Opposing formations defending the engagement area at operational hex ${battleHexKey}.`;
    }
  });
}

interface GenerationCacheEntry {
  engagementId: string;
  commitmentIntegrity: string | null;
  scenario: ScenarioSource;
}

let cache: GenerationCacheEntry | null = null;

/** Test hook: clears the per-engagement scenario cache. */
export function clearCampaignScenarioCache(): void {
  cache = null;
}

/**
 * Resolves the scenario source for a mission. Non-campaign missions and campaign engagements
 * without a structured context use the static registry; contextual engagements get a generated
 * scenario, cached per engagement id so all screens share one object.
 */
export function resolveScenarioForMission(missionKey: string): ScenarioSource {
  if (missionKey !== "campaign") {
    return getScenarioByMissionKey(missionKey);
  }
  const campaignState = ensureCampaignState();
  const engagement = campaignState.getActiveEngagement();
  const battlePackage = campaignState.getActiveCampaignBattlePackage();
  const context = battlePackage?.context ?? engagement?.context;
  if (!context) {
    return getScenarioByMissionKey(missionKey);
  }
  const commitmentIntegrity = battlePackage?.integrityHash ?? null;
  if (cache && cache.engagementId === context.engagementId
    && cache.commitmentIntegrity === commitmentIntegrity) {
    return cache.scenario;
  }
  try {
    const generated = generateCampaignBattleScenario(
      context,
      campaignState.getRuntimeSnapshot() ?? undefined,
      battlePackage ?? undefined
    );
    assertScenarioSourceValid(generated, "campaign");
    cache = { engagementId: context.engagementId, commitmentIntegrity, scenario: generated };
    return generated;
  } catch (err) {
    console.error("[CampaignBattleGenerator] Generation failed; falling back to default campaign scenario", {
      engagementId: context.engagementId,
      missionType: context.missionType,
      error: err
    });
    return getScenarioByMissionKey(missionKey);
  }
}

/**
 * Builds the tactical scenario for an engagement: template map + generated Bot order of battle.
 * Exported for tests; production code goes through resolveScenarioForMission.
 */
export function generateCampaignBattleScenario(
  context: CampaignEngagementContext,
  formationSource?: Pick<CampaignRuntimeState, "campaignId" | "revision" | "currentSegment" | "formations">,
  battlePackage?: CampaignBattlePackage
): ScenarioSource {
  const effectiveContext = battlePackage?.engagementId === context.engagementId
    ? battlePackage.context
    : context;
  const requestedCampaignKey = battlePackage?.scenarioKey ?? "central_channel";
  // Legacy and test packages predate theater-tagged maps. Until a campaign receives its own
  // approved pool, keep those packages on the shipped Western Europe pool instead of reopening
  // unrestricted global selection. Explicit pools take over automatically when authored.
  const campaignKey = hasBattleTemplatesForCampaign(requestedCampaignKey)
    ? requestedCampaignKey
    : "central_channel";
  const template = effectiveContext.templateKey
    ? getBattleTemplateByKey(effectiveContext.templateKey)
    : selectBattleTemplate(effectiveContext.missionType, effectiveContext.coastal, effectiveContext.engagementId, campaignKey);
  if (!template || !template.campaignKeys.includes(campaignKey)) {
    throw new Error(`[CampaignBattleGenerator] Template '${effectiveContext.templateKey ?? "unresolved"}' is not compatible with campaign '${campaignKey}'.`);
  }
  const scenario = structuredClone(template.scenario) as ScenarioSource & Record<string, unknown>;
  const playerDefense = effectiveContext.attacker === "Bot" && effectiveContext.defender === "Player";
  const invertAuthoredSides = playerDefense && template.playerRole === "attacker";

  scenario["name"] = playerDefense
    ? `${MISSION_TYPE_LABELS[effectiveContext.missionType]} Defense — Hex ${effectiveContext.battleHexKey}`
    : `${MISSION_TYPE_LABELS[effectiveContext.missionType]} — Hex ${effectiveContext.battleHexKey}`;
  scenario["campaignTemplateKey"] = template.key;
  scenario["campaignTemplatePlayerRole"] = template.playerRole;
  scenario["campaignPlayerRole"] = playerDefense ? "defender" : "attacker";
  scenario["campaignMissionType"] = effectiveContext.missionType;
  scenario["campaignBattleHexKey"] = effectiveContext.battleHexKey;
  scenario["campaignEngagementId"] = effectiveContext.engagementId;
  scenario["campaignBattlePackageId"] = battlePackage?.packageId ?? null;
  scenario["campaignInfrastructureEffectiveness"] = effectiveContext.infrastructureEffectiveness ?? 1;
  const infrastructureFactor = Math.max(0, Math.min(1, effectiveContext.infrastructureEffectiveness ?? 1));
  const modifications = Array.isArray(scenario["hexModifications"])
    ? scenario["hexModifications"] as Array<Record<string, unknown>>
    : [];
  modifications.forEach((modification) => {
    if (modification["type"] !== "fortifications") return;
    const maxIntegrity = Math.max(1, Number(modification["maxIntegrity"] ?? 100));
    const integrity = Math.round(maxIntegrity * infrastructureFactor);
    modification["integrity"] = integrity;
    modification["maxIntegrity"] = maxIntegrity;
    modification["damageState"] = integrity <= 0
      ? "destroyed"
      : infrastructureFactor < 0.4 ? "severelyDamaged"
        : infrastructureFactor < 0.7 ? "breached"
          : infrastructureFactor < 1 ? "damaged" : "intact";
  });

  const sides = scenario["sides"] as Record<string, Record<string, unknown>>;
  const player = sides?.["Player"];
  const bot = sides?.["Bot"];
  if (!player || !bot) {
    // Template without a Bot side would already fail validation; guard for type safety.
    return scenario;
  }

  const authoredPlayerUnits = structuredClone((Array.isArray(player["units"]) ? player["units"] : []) as RawUnit[]);
  const authoredBotUnits = structuredClone((Array.isArray(bot["units"]) ? bot["units"] : []) as RawUnit[]);
  if (playerDefense) {
    // Attack-oriented maps must be inverted. Authored defensive maps (Bastogne, Kasserine,
    // Anzio) already put Player on the defended ground, so their zones/objectives/HQ stay put.
    if (invertAuthoredSides) {
      const deploymentZones = Array.isArray(scenario["deploymentZones"])
        ? scenario["deploymentZones"] as Array<Record<string, unknown>>
        : [];
      deploymentZones.forEach((zone) => {
        if (zone["faction"] === "Player") {
          zone["faction"] = "Bot";
          relabelInvertedDeploymentZone(zone, "Bot");
        } else if (zone["faction"] === "Bot") {
          zone["faction"] = "Player";
          relabelInvertedDeploymentZone(zone, "Player");
        }
      });
      const objectives = Array.isArray(scenario["objectives"])
        ? scenario["objectives"] as Array<Record<string, unknown>>
        : [];
      objectives.forEach((objective) => {
        if (objective["owner"] === "Player") objective["owner"] = "Bot";
        else if (objective["owner"] === "Bot") objective["owner"] = "Player";
      });
      const playerHq = structuredClone(player["hq"]);
      player["hq"] = structuredClone(bot["hq"]);
      bot["hq"] = playerHq;
    }
    player["units"] = [];
    bot["units"] = [];
    player["goal"] = "Hold the defended objectives and prevent an operational breakthrough.";
    player["strategy"] = "Use prepared ground, preserve the core formations, and counterattack only when the enemy attack loses cohesion.";
  }

  relabelCampaignDeploymentZones(scenario, playerDefense, effectiveContext.battleHexKey);

  const doctrine = playerDefense
    ? BOT_OFFENSIVE_DOCTRINE[effectiveContext.missionType]
    : BOT_DOCTRINE[effectiveContext.missionType];
  bot["goal"] = doctrine.goal;
  bot["strategy"] = doctrine.strategy;

  const botRole = playerDefense ? "attacker" : "defender";
  const botForcePool = playerDefense ? effectiveContext.availableForces : effectiveContext.enemyForces;
  const botTotal = battlePackage
    ? battlePackage.formationCommitments.filter((entry) => entry.role === botRole && entry.faction === "Bot").length
    : botForcePool.reduce((sum, group) => sum + group.count, 0);
  if (botTotal <= 0) {
    // Neutral or unscouted target: keep the template's authored garrison as-is.
    if (playerDefense) bot["units"] = [];
    return scenario;
  }

  const templateUnits = playerDefense
    ? (invertAuthoredSides ? authoredPlayerUnits : authoredBotUnits)
    : authoredBotUnits;
  const size = scenario["size"] as { cols: number; rows: number };
  const generated = buildBotRoster(
    effectiveContext,
    templateUnits,
    size,
    collectOccupiedHexes(sides),
    formationSource,
    battlePackage,
    botRole
  );
  if (generated.length > 0) {
    bot["units"] = generated;
    // Resources scale with the pool's fighting value so a starved pocket shoots dry.
    const botForceValue = playerDefense ? effectiveContext.playerForceValue : effectiveContext.enemyForceValue;
    bot["resources"] = Math.max(300, Math.min(1500, Math.round(botForceValue * 0.6)));
  } else {
    console.warn("[CampaignBattleGenerator] Bot force pool produced no mappable units; keeping template garrison", {
      engagementId: effectiveContext.engagementId,
      botForcePool
    });
    if (playerDefense) bot["units"] = [];
  }

  return scenario;
}

/** Collects every hex occupied by any side's authored units so placement never stacks. */
function collectOccupiedHexes(sides: Record<string, Record<string, unknown>>): Set<string> {
  const occupied = new Set<string>();
  for (const side of Object.values(sides)) {
    const units = Array.isArray(side?.["units"]) ? (side["units"] as RawUnit[]) : [];
    for (const unit of units) {
      if (Array.isArray(unit.hex)) {
        occupied.add(`${unit.hex[0]},${unit.hex[1]}`);
      }
    }
    const hq = side?.["hq"];
    if (Array.isArray(hq)) {
      occupied.add(`${hq[0]},${hq[1]}`);
    }
  }
  return occupied;
}

/**
 * Converts the campaign enemy pool into raw scenario units anchored to the template's Bot
 * positions. Strongest groups claim anchor slots first; overflow probes outward from anchors.
 */
function buildBotRoster(
  context: CampaignEngagementContext,
  templateUnits: RawUnit[],
  size: { cols: number; rows: number },
  occupied: Set<string>,
  formationSource?: Pick<CampaignRuntimeState, "campaignId" | "revision" | "currentSegment" | "formations">,
  battlePackage?: CampaignBattlePackage,
  botRole: "attacker" | "defender" = "defender"
): RawUnit[] {
  const anchors = templateUnits
    .filter((unit) => Array.isArray(unit.hex))
    .map((unit) => ({ hex: unit.hex, facing: unit.facing ?? "SW" }));
  if (anchors.length === 0) {
    return [];
  }
  const defaultFacing = majorityFacing(templateUnits) ?? "SW";
  const entrench = botRole === "attacker" ? 0 : Math.max(0, Math.round(
    ENTRENCH_BY_MISSION[context.missionType]
      * Math.max(0, Math.min(1, context.infrastructureEffectiveness ?? 1))
  ));

  // Expand groups into individual units, strongest types first so they take the anchor line.
  const expanded: Array<{ campaignType: string; formationId: string | null }> = battlePackage && formationSource
    ? battlePackage.formationCommitments
        .filter((entry) => entry.role === botRole && entry.faction === "Bot")
        .flatMap((entry) => {
          const formation = formationSource.formations[entry.formationId];
          return formation ? [{ campaignType: formation.campaignUnitType, formationId: formation.id }] : [];
        })
        .sort((a, b) => getCampaignUnitRpValue(b.campaignType) - getCampaignUnitRpValue(a.campaignType))
    : [];
  if (!battlePackage) {
    const botForcePool = botRole === "attacker" ? context.availableForces : context.enemyForces;
    const sortedGroups = [...botForcePool].sort(
      (a, b) => getCampaignUnitRpValue(b.unitType) - getCampaignUnitRpValue(a.unitType)
    );
    for (const group of sortedGroups) {
      for (let i = 0; i < group.count && expanded.length < MAX_GENERATED_BOT_UNITS; i++) {
        expanded.push({ campaignType: group.unitType, formationId: group.formationIds?.[i] ?? null });
      }
    }
  }

  // Anchors are consumed fresh; the authored roster is being replaced wholesale.
  for (const anchor of anchors) {
    occupied.delete(`${anchor.hex[0]},${anchor.hex[1]}`);
  }

  const roster: RawUnit[] = [];
  let anchorIndex = 0;
  for (const entry of expanded) {
    // Air and naval campaign units do not appear as ground formations; they act through the
    // air phase and offshore support respectively.
    if (CAMPAIGN_AIR_UNIT_TYPES.includes(entry.campaignType) || CAMPAIGN_NAVAL_UNIT_TYPES.includes(entry.campaignType)) {
      continue;
    }
    const allocationKey = mapCampaignUnitToAllocationKey(entry.campaignType);
    const loadout = allocationKey ? findTemplateForUnitKey(allocationKey) : null;
    if (!loadout) {
      continue;
    }

    const anchor = anchors[anchorIndex % anchors.length];
    anchorIndex++;
    const hex = findFreeHexNear(anchor.hex, size, occupied);
    if (!hex) {
      console.warn("[CampaignBattleGenerator] No free hex near anchor; unit dropped", {
        campaignType: entry.campaignType,
        anchor: anchor.hex
      });
      continue;
    }
    occupied.add(`${hex[0]},${hex[1]}`);

    const persistentFormation = entry.formationId ? formationSource?.formations[entry.formationId] : null;
    const persistentSeed = persistentFormation && formationSource
      ? createCampaignFormationBattleSeed(persistentFormation, {
          campaignId: formationSource.campaignId,
          engagementId: context.engagementId,
          sourceRevision: battlePackage?.sourceRevision ?? formationSource.revision,
          sourceSegment: battlePackage?.committedSegment ?? formationSource.currentSegment,
          hex: { q: hex[0], r: hex[1] - Math.floor(hex[0] / 2) },
          facing: (anchor.facing ?? defaultFacing) as ScenarioUnit["facing"],
          entrench
        })
      : null;
    if (persistentSeed) {
      const unit = persistentSeed.unit;
      roster.push({
        type: unit.type as string,
        hex,
        strength: unit.strength,
        experience: unit.experience,
        baseExperience: unit.baseExperience,
        earnedExperience: unit.earnedExperience,
        ammo: unit.ammo,
        fuel: unit.fuel,
        entrench: unit.entrench,
        facing: unit.facing,
        formationKey: unit.formationKey,
        status: structuredClone(unit.status),
        unitId: unit.unitId,
        campaignProvenance: structuredClone(unit.campaignProvenance)
      });
      continue;
    }

    // Legacy contexts without formation records retain the existing type-based veterancy seed.
    const eliteBonus = entry.campaignType.includes("Elite") ? 1 : 0;
    roster.push({
      type: loadout.type as string,
      hex,
      strength: loadout.strength,
      experience: loadout.experience + eliteBonus,
      ammo: loadout.ammo,
      fuel: loadout.fuel,
      entrench,
      facing: anchor.facing ?? defaultFacing
    });
  }
  return roster;
}

/** Most common facing among the template's authored Bot units, used for overflow placements. */
function majorityFacing(units: RawUnit[]): string | null {
  const counts = new Map<string, number>();
  for (const unit of units) {
    if (typeof unit.facing === "string") {
      counts.set(unit.facing, (counts.get(unit.facing) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let bestCount = 0;
  for (const [facing, count] of counts) {
    if (count > bestCount) {
      best = facing;
      bestCount = count;
    }
  }
  return best;
}

/**
 * Returns the anchor hex if free, otherwise probes expanding square rings across the map for the
 * first in-bounds unoccupied cell. Offset-grid probing is deliberate: placement just needs to
 * cluster near the authored line while guaranteeing an exact committed package is representable.
 */
function findFreeHexNear(
  anchor: [number, number],
  size: { cols: number; rows: number },
  occupied: Set<string>
): [number, number] | null {
  const inBounds = (col: number, row: number): boolean => col >= 0 && row >= 0 && col < size.cols && row < size.rows;
  const isFree = (col: number, row: number): boolean => inBounds(col, row) && !occupied.has(`${col},${row}`);

  if (isFree(anchor[0], anchor[1])) {
    return [anchor[0], anchor[1]];
  }
  for (let radius = 1; radius <= Math.max(size.cols, size.rows); radius++) {
    for (let dc = -radius; dc <= radius; dc++) {
      for (let dr = -radius; dr <= radius; dr++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) {
          continue;
        }
        const col = anchor[0] + dc;
        const row = anchor[1] + dr;
        if (isFree(col, row)) {
          return [col, row];
        }
      }
    }
  }
  return null;
}
