/**
 * Builds a CampaignEngagementContext when an engagement is queued on the campaign map.
 *
 * The context answers three questions the tactical layer needs:
 *  1. What kind of battle is this? (mission type from the defender tile's role)
 *  2. Who can fight? (attacker forces on tiles adjacent to the battle hex, plus in-range air)
 *  3. What can the commander requisition? (per-type caps from committed forces + a consumables reserve)
 *
 * Design reference: docs/CAMPAIGN_BATTLE_GENERATION_DESIGN.md.
 */

import type {
  CampaignEngagementContext,
  CampaignFactionKey,
  CampaignMissionType,
  CampaignScenarioData,
  CampaignTileInstance
} from "../../core/campaignTypes";
import type { CampaignIntelligenceBriefing } from "../../core/campaignIntelTypes";
import { hexDistance } from "../../core/Hex";
import {
  buildAllocationCaps,
  sumForcePoolRpValue,
  CAMPAIGN_AIR_UNIT_TYPES,
  CAMPAIGN_NAVAL_UNIT_TYPES
} from "./campaignForceMapping";
import { hasBattleTemplatesForCampaign, selectBattleTemplate } from "./battleTemplates";

/** Operational radius (in campaign hexes) from which air wings can support a battle. 1 hex = 10 km. */
export const AIR_SORTIE_RANGE_HEXES = 15;

/** Discretionary consumables reserve bounds (RP). Tuned to sit below authored-mission budgets. */
const RP_RESERVE_FLOOR = 150;
const RP_RESERVE_CEILING = 600;

export interface BuildEngagementContextOptions {
  engagementId: string;
  /** Offset hex key ("col,row") of the contested hex. */
  battleHexKey: string;
  attacker: CampaignFactionKey;
  frontKey?: string | null;
  objectiveKey?: string | null;
  /** Frozen attacker knowledge. UI surfaces this; true enemy force values stay generator-internal. */
  intelligenceBriefing?: CampaignIntelligenceBriefing | null;
}

/** Converts an offset hex key ("col,row") to axial coordinates. Mirrors CampaignState's convention. */
function parseOffsetKeyToAxial(offsetKey: string): { q: number; r: number } | null {
  const parts = offsetKey.split(",");
  const col = Number(parts[0]);
  const row = Number(parts[1]);
  if (!Number.isFinite(col) || !Number.isFinite(row)) {
    return null;
  }
  return { q: col, r: row - Math.floor(col / 2) };
}

function axialToOffsetKey(q: number, r: number): string {
  return `${q},${r + Math.floor(q / 2)}`;
}

function neighborAxials(q: number, r: number): Array<{ q: number; r: number }> {
  const dirs = [
    { q: +1, r: 0 },
    { q: +1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: +1 },
    { q: 0, r: +1 }
  ];
  return dirs.map((d) => ({ q: q + d.q, r: r + d.r }));
}

function findTile(scenario: CampaignScenarioData, q: number, r: number): CampaignTileInstance | undefined {
  return scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);
}

function tileOwner(scenario: CampaignScenarioData, tile: CampaignTileInstance): CampaignFactionKey {
  return tile.factionControl ?? scenario.tilePalette[tile.tile]?.factionControl ?? "Neutral";
}

function tileForces(tile: CampaignTileInstance): Array<{ unitType: string; count: number }> {
  return (tile.forces ?? []).filter((g) => g && typeof g.unitType === "string" && g.count > 0);
}

/**
 * Derives the mission archetype from the defender tile's palette role.
 * A missing tile or plain region yields a meeting engagement.
 */
export function deriveMissionType(scenario: CampaignScenarioData, battleHexKey: string): CampaignMissionType {
  const coords = parseOffsetKeyToAxial(battleHexKey);
  if (!coords) {
    return "meetingEngagement";
  }
  const tile = findTile(scenario, coords.q, coords.r);
  if (!tile) {
    return "meetingEngagement";
  }
  const role = scenario.tilePalette[tile.tile]?.role;
  switch (role) {
    case "fortificationHeavy":
      return "fortifiedAssault";
    case "fortificationLight":
      return "lineAssault";
    case "navalBase":
      return "portAssault";
    case "airbase":
      return "airfieldRaid";
    case "logisticsHub":
      return "depotRaid";
    default:
      return "meetingEngagement";
  }
}

/** Human-facing labels for mission types, shared by campaign and precombat UI. */
export const MISSION_TYPE_LABELS: Readonly<Record<CampaignMissionType, string>> = Object.freeze({
  fortifiedAssault: "Fortified Assault",
  lineAssault: "Line Assault",
  portAssault: "Port Assault",
  airfieldRaid: "Airfield Raid",
  depotRaid: "Depot Raid",
  meetingEngagement: "Meeting Engagement"
});

/** Returns true when any neighbor of the battle hex is a declared water hex (coastal battle). */
function isCoastal(scenario: CampaignScenarioData, q: number, r: number): boolean {
  const water = new Set(scenario.mapExtents?.waterHexes ?? []);
  if (water.size === 0) {
    return false;
  }
  return neighborAxials(q, r).some((n) => water.has(axialToOffsetKey(n.q, n.r)));
}

/**
 * Banded intel estimate for the enemy pool so the UI never leaks exact counts.
 * Bands leave room for the deferred fog-of-war system to sharpen or blur later.
 */
export function describeForceRatio(forceRatio: number): { band: "overwhelming" | "heavy" | "comparable" | "light"; outgunned: boolean; label: string } {
  if (!Number.isFinite(forceRatio) || forceRatio >= 1.5) {
    return { band: "light", outgunned: false, label: "Enemy resistance: light — we hold the advantage." };
  }
  if (forceRatio >= 0.67) {
    return { band: "comparable", outgunned: false, label: "Enemy resistance: comparable — expect a contested fight." };
  }
  if (forceRatio >= 0.4) {
    return { band: "heavy", outgunned: true, label: "Enemy resistance: heavy — we are outgunned." };
  }
  return { band: "overwhelming", outgunned: true, label: "Enemy resistance: overwhelming — this assault is against the odds." };
}

/**
 * Builds the full engagement context for a battle at the given hex.
 * Availability rule: attacker ground/naval forces on tiles adjacent to the battle hex (plus the hex
 * itself if the attacker already holds it), and air wings staged at attacker airbases within sortie range.
 */
export function buildEngagementContext(
  scenario: CampaignScenarioData,
  options: BuildEngagementContextOptions
): CampaignEngagementContext | null {
  const coords = parseOffsetKeyToAxial(options.battleHexKey);
  if (!coords) {
    console.warn("[EngagementContextBuilder] Invalid battle hex key", options.battleHexKey);
    return null;
  }

  const attacker = options.attacker;
  const battleTile = findTile(scenario, coords.q, coords.r);
  const defender: CampaignFactionKey = battleTile
    ? tileOwner(scenario, battleTile)
    : "Neutral";

  const coastal = isCoastal(scenario, coords.q, coords.r);
  const battleInfrastructure = battleTile?.infrastructure;

  // Gather attacker forces: the battle hex (if attacker-held) plus adjacent attacker tiles.
  const stagingKeys = [
    options.battleHexKey,
    ...neighborAxials(coords.q, coords.r).map((n) => axialToOffsetKey(n.q, n.r))
  ];
  const availableForces: Array<{ hexKey: string; unitType: string; count: number }> = [];
  for (const key of stagingKeys) {
    const kc = parseOffsetKeyToAxial(key);
    if (!kc) continue;
    const tile = findTile(scenario, kc.q, kc.r);
    if (!tile || tileOwner(scenario, tile) !== attacker) continue;
    for (const group of tileForces(tile)) {
      // Air wings are gathered separately from in-range airbases; skip them here to avoid double counting.
      if (CAMPAIGN_AIR_UNIT_TYPES.includes(group.unitType)) continue;
      // Naval units only participate when the battle hex is coastal.
      if (CAMPAIGN_NAVAL_UNIT_TYPES.includes(group.unitType) && !coastal) continue;
      availableForces.push({ hexKey: key, unitType: group.unitType, count: group.count });
    }
  }

  // Air support: attacker airbases within sortie range contribute wings and sortie capacity.
  let airSorties = 0;
  for (const tile of scenario.tiles) {
    const def = scenario.tilePalette[tile.tile];
    if (!def || def.role !== "airbase") continue;
    if (tileOwner(scenario, tile) !== attacker) continue;
    if (hexDistance(tile.hex, coords) > AIR_SORTIE_RANGE_HEXES) continue;
    airSorties += Math.floor((def.airSortieCapacity ?? 0) * (tile.infrastructure?.effectiveness ?? 1));
    const key = axialToOffsetKey(tile.hex.q, tile.hex.r);
    for (const group of tileForces(tile)) {
      if (!CAMPAIGN_AIR_UNIT_TYPES.includes(group.unitType)) continue;
      availableForces.push({ hexKey: key, unitType: group.unitType, count: group.count });
    }
  }

  // Enemy pool: defender forces on the battle hex and its adjacent defender-held tiles.
  const enemyForces: Array<{ hexKey: string; unitType: string; count: number }> = [];
  if (defender !== attacker && defender !== "Neutral") {
    for (const key of stagingKeys) {
      const kc = parseOffsetKeyToAxial(key);
      if (!kc) continue;
      const tile = findTile(scenario, kc.q, kc.r);
      if (!tile || tileOwner(scenario, tile) !== defender) continue;
      for (const group of tileForces(tile)) {
        enemyForces.push({ hexKey: key, unitType: group.unitType, count: group.count });
      }
    }
  }

  const allocationCaps = buildAllocationCaps(availableForces);
  const playerForceValue = sumForcePoolRpValue(availableForces);
  const enemyForceValue = sumForcePoolRpValue(enemyForces);
  // Campaign runtime, hashes, and save envelopes require finite canonical numbers. Preserve the
  // semantic "unopposed" upper bound without allowing Infinity into authoritative truth.
  const forceRatio = enemyForceValue > 0 ? playerForceValue / enemyForceValue : Number.MAX_SAFE_INTEGER;

  // Consumables reserve: quarter of supplies, clamped. Keeps desperate offensives able to buy minimal ammo.
  const attackerEconomy = scenario.economies.find((e) => e.faction === attacker);
  const supplies = attackerEconomy?.supplies ?? 0;
  const rpReserve = Math.max(RP_RESERVE_FLOOR, Math.min(RP_RESERVE_CEILING, Math.floor(supplies / 4)));
  const missionType = deriveMissionType(scenario, options.battleHexKey);
  const templateCampaignKey = hasBattleTemplatesForCampaign(scenario.key)
    ? scenario.key
    : "central_channel";
  const templateKey = selectBattleTemplate(missionType, coastal, options.engagementId, templateCampaignKey).key;

  return {
    engagementId: options.engagementId,
    battleHexKey: options.battleHexKey,
    attacker,
    defender,
    missionType,
    // Full amphibious (cross-water assault) detection is future work; coastal steers templates now.
    amphibious: false,
    coastal,
    ...(battleInfrastructure ? {
      infrastructureEffectiveness: battleInfrastructure.effectiveness,
      infrastructureIntegrity: battleInfrastructure.integrity,
      infrastructureMaxIntegrity: battleInfrastructure.maxIntegrity,
      infrastructureDamageState: battleInfrastructure.damageState
    } : {}),
    availableForces,
    allocationCaps,
    enemyForces,
    airSorties,
    rpReserve,
    playerForceValue,
    enemyForceValue,
    forceRatio,
    intelligenceBriefing: options.intelligenceBriefing ?? undefined,
    templateKey,
    frontKey: options.frontKey ?? null,
    objectiveKey: options.objectiveKey ?? null
  };
}
