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
import { findTemplateForUnitKey } from "../adapters";
import { mapCampaignUnitToAllocationKey, getCampaignUnitRpValue, CAMPAIGN_AIR_UNIT_TYPES, CAMPAIGN_NAVAL_UNIT_TYPES } from "./campaignForceMapping";
import { selectBattleTemplate } from "./battleTemplates";
import { MISSION_TYPE_LABELS } from "./EngagementContextBuilder";

/** Hard ceiling on generated Bot units so oversized campaign pools cannot flood a tactical map. */
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

type RawUnit = {
  type: string;
  hex: [number, number];
  strength: number;
  experience: number;
  ammo: number;
  fuel: number;
  entrench: number;
  facing: string;
};

interface GenerationCacheEntry {
  engagementId: string;
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
  const engagement = ensureCampaignState().getActiveEngagement();
  const context = engagement?.context;
  if (!context) {
    return getScenarioByMissionKey(missionKey);
  }
  if (cache && cache.engagementId === context.engagementId) {
    return cache.scenario;
  }
  try {
    const generated = generateCampaignBattleScenario(context);
    assertScenarioSourceValid(generated, "campaign");
    cache = { engagementId: context.engagementId, scenario: generated };
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
export function generateCampaignBattleScenario(context: CampaignEngagementContext): ScenarioSource {
  const template = selectBattleTemplate(context.missionType, context.coastal, context.engagementId);
  const scenario = structuredClone(template.scenario) as ScenarioSource & Record<string, unknown>;

  scenario["name"] = `${MISSION_TYPE_LABELS[context.missionType]} — Hex ${context.battleHexKey}`;
  scenario["campaignTemplateKey"] = template.key;
  scenario["campaignEngagementId"] = context.engagementId;

  const sides = scenario["sides"] as Record<string, Record<string, unknown>>;
  const bot = sides?.["Bot"];
  if (!bot) {
    // Template without a Bot side would already fail validation; guard for type safety.
    return scenario;
  }

  const doctrine = BOT_DOCTRINE[context.missionType];
  bot["goal"] = doctrine.goal;
  bot["strategy"] = doctrine.strategy;

  const enemyTotal = context.enemyForces.reduce((sum, group) => sum + group.count, 0);
  if (enemyTotal <= 0) {
    // Neutral or unscouted target: keep the template's authored garrison as-is.
    return scenario;
  }

  const templateUnits = (Array.isArray(bot["units"]) ? bot["units"] : []) as RawUnit[];
  const size = scenario["size"] as { cols: number; rows: number };
  const generated = buildBotRoster(context, templateUnits, size, collectOccupiedHexes(sides));
  if (generated.length > 0) {
    bot["units"] = generated;
    // Resources scale with the pool's fighting value so a starved pocket shoots dry.
    bot["resources"] = Math.max(300, Math.min(1500, Math.round(context.enemyForceValue * 0.6)));
  } else {
    console.warn("[CampaignBattleGenerator] Enemy pool produced no mappable units; keeping template garrison", {
      engagementId: context.engagementId,
      enemyForces: context.enemyForces
    });
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
  occupied: Set<string>
): RawUnit[] {
  const anchors = templateUnits
    .filter((unit) => Array.isArray(unit.hex))
    .map((unit) => ({ hex: unit.hex, facing: unit.facing ?? "SW" }));
  if (anchors.length === 0) {
    return [];
  }
  const defaultFacing = majorityFacing(templateUnits) ?? "SW";
  const entrench = ENTRENCH_BY_MISSION[context.missionType];

  // Expand groups into individual units, strongest types first so they take the anchor line.
  const expanded: Array<{ campaignType: string }> = [];
  const sortedGroups = [...context.enemyForces].sort(
    (a, b) => getCampaignUnitRpValue(b.unitType) - getCampaignUnitRpValue(a.unitType)
  );
  for (const group of sortedGroups) {
    for (let i = 0; i < group.count && expanded.length < MAX_GENERATED_BOT_UNITS; i++) {
      expanded.push({ campaignType: group.unitType });
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

    // Elite campaign formations carry a veterancy edge into the tactical layer.
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
 * Returns the anchor hex if free, otherwise probes expanding square rings (radius 1-3) around it
 * for the first in-bounds unoccupied cell. Offset-grid probing is deliberate: placement just needs
 * to cluster near the authored defense, not be hex-perfect.
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
  for (let radius = 1; radius <= 3; radius++) {
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
