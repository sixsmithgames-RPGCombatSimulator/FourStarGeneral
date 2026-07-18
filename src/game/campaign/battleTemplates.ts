/**
 * Battle template registry for campaign-generated tactical battles.
 *
 * A template is an authored tactical scenario reused as a map + deployment framework: the player's
 * deployment zones, objectives, and terrain come from the template while the Bot roster is replaced
 * with forces generated from the campaign engagement context (see CampaignBattleGenerator).
 *
 * Selection: filter by mission type, prefer matching terrain (coastal vs inland), then rotate
 * deterministically by engagement id so repeated battles at the same spot vary.
 *
 * Design reference: docs/CAMPAIGN_BATTLE_GENERATION_DESIGN.md ("Tactical map templates").
 */

import monteCassinoScenario from "../../data/scenario_monte_cassino.json";
import omahaBeachScenario from "../../data/scenario_omaha_beach.json";
import citadelRidgeScenario from "../../data/scenario_citadel_ridge.json";
import elAlameinScenario from "../../data/scenario_el_alamein.json";
import hurtgenForestScenario from "../../data/scenario_hurtgen_forest.json";
import gelaLandingsScenario from "../../data/scenario_gela_landings.json";
import anzioBeachheadScenario from "../../data/scenario_anzio_beachhead.json";
import kasserinePassScenario from "../../data/scenario_kasserine_pass.json";
import carentanScenario from "../../data/scenario_carentan.json";
import bastogneScenario from "../../data/scenario_bastogne.json";
import falaisePocketScenario from "../../data/scenario_falaise_pocket.json";
import twoBridgesScenario from "../../data/scenario_two_bridges.json";
import type { ScenarioSource } from "../../data/scenarioRegistry";
import type { CampaignMissionType } from "../../core/campaignTypes";

export type TemplateTerrain = "coastal" | "inland";

export interface BattleTemplateEntry {
  /** Stable key recorded on generated scenarios for diagnostics and replays. */
  key: string;
  /** The authored scenario reused as the map framework. */
  scenario: ScenarioSource;
  /** Mission archetypes this map serves. */
  missionTypes: readonly CampaignMissionType[];
  terrain: TemplateTerrain;
}

/**
 * Seed stock: existing authored scenarios tagged by the situations they best represent.
 * Add entries as new templates are authored; selection degrades gracefully to the fallback.
 */
export const BATTLE_TEMPLATES: readonly BattleTemplateEntry[] = Object.freeze([
  { key: "fortified_monte_cassino", scenario: monteCassinoScenario, missionTypes: ["fortifiedAssault"], terrain: "inland" },
  { key: "fortified_omaha_coast", scenario: omahaBeachScenario, missionTypes: ["fortifiedAssault", "portAssault"], terrain: "coastal" },
  { key: "fortified_citadel_ridge", scenario: citadelRidgeScenario, missionTypes: ["fortifiedAssault", "lineAssault"], terrain: "inland" },
  { key: "line_el_alamein", scenario: elAlameinScenario, missionTypes: ["lineAssault", "meetingEngagement"], terrain: "inland" },
  { key: "line_hurtgen_forest", scenario: hurtgenForestScenario, missionTypes: ["lineAssault"], terrain: "inland" },
  { key: "port_gela_landings", scenario: gelaLandingsScenario, missionTypes: ["portAssault"], terrain: "coastal" },
  { key: "port_anzio_beachhead", scenario: anzioBeachheadScenario, missionTypes: ["portAssault", "fortifiedAssault"], terrain: "coastal" },
  { key: "raid_kasserine_pass", scenario: kasserinePassScenario, missionTypes: ["airfieldRaid", "meetingEngagement"], terrain: "inland" },
  { key: "raid_carentan", scenario: carentanScenario, missionTypes: ["airfieldRaid", "depotRaid"], terrain: "inland" },
  { key: "depot_bastogne", scenario: bastogneScenario, missionTypes: ["depotRaid"], terrain: "inland" },
  { key: "depot_falaise_pocket", scenario: falaisePocketScenario, missionTypes: ["depotRaid", "meetingEngagement"], terrain: "inland" },
  { key: "meeting_two_bridges", scenario: twoBridgesScenario, missionTypes: ["meetingEngagement"], terrain: "inland" }
]);

/** Fallback when no template matches the mission type (should not happen with the seed stock). */
const FALLBACK_TEMPLATE_KEY = "meeting_two_bridges";

/** Deterministic non-crypto hash so the same engagement always picks the same template. */
function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Picks the template for a mission type + terrain context.
 * Terrain preference is soft: coastal battles prefer coastal maps but fall back to any
 * mission-type match rather than misrepresenting the mission.
 */
export function selectBattleTemplate(
  missionType: CampaignMissionType,
  coastal: boolean,
  engagementId: string
): BattleTemplateEntry {
  const byMission = BATTLE_TEMPLATES.filter((entry) => entry.missionTypes.includes(missionType));
  const preferredTerrain: TemplateTerrain = coastal ? "coastal" : "inland";
  const byTerrain = byMission.filter((entry) => entry.terrain === preferredTerrain);
  const pool = byTerrain.length > 0 ? byTerrain : byMission;
  if (pool.length === 0) {
    const fallback = BATTLE_TEMPLATES.find((entry) => entry.key === FALLBACK_TEMPLATE_KEY);
    if (!fallback) {
      throw new Error("[battleTemplates] Fallback template missing from registry");
    }
    console.warn("[battleTemplates] No template for mission type; using fallback", { missionType });
    return fallback;
  }
  return pool[hashString(engagementId) % pool.length];
}
