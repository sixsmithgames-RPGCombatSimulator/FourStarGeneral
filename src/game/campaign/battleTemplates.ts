/**
 * Battle template registry for campaign-generated tactical battles.
 *
 * A template is an authored tactical scenario reused as a map + deployment framework: the player's
 * deployment zones, objectives, and terrain come from the template while the Bot roster is replaced
 * with forces generated from the campaign engagement context (see CampaignBattleGenerator).
 *
 * Selection requires the campaign, mission type, and frozen battlefield profile, then rotates
 * deterministically by engagement id when more than one proven map serves the same contract.
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
import arnhemBridgeScenario from "../../data/scenario_arnhem_bridge.json";
import remagenScenario from "../../data/scenario_remagen.json";
import type { ScenarioSource } from "../../data/scenarioRegistry";
import type { CampaignBattlefieldProfile, CampaignMissionType } from "../../core/campaignTypes";

export interface BattleTemplateEntry {
  /** Stable key recorded on generated scenarios for diagnostics and replays. */
  key: string;
  /** The authored scenario reused as the map framework. */
  scenario: ScenarioSource;
  /** Mission archetypes this map serves. */
  missionTypes: readonly CampaignMissionType[];
  /** Geographic profiles proven by this map's actual tile composition. Empty means legacy-load only. */
  battlefieldProfiles: readonly CampaignBattlefieldProfile[];
  /** Strategic campaign scenarios whose geography can reuse this tactical map. */
  campaignKeys: readonly string[];
  /** Role occupied by the authored Player side before campaign forces replace the roster. */
  playerRole: "attacker" | "defender";
  /** Campaign-only objective positions in raw offset coordinates, preserving authored ownership and VP order. */
  objectiveHexOverrides?: readonly (readonly [number, number])[];
}

/**
 * Seed stock: existing authored scenarios tagged by the situations they best represent.
 * Entries with no battlefield profiles remain available only to exact legacy packages.
 */
export const BATTLE_TEMPLATES: readonly BattleTemplateEntry[] = Object.freeze([
  { key: "fortified_monte_cassino", scenario: monteCassinoScenario, missionTypes: ["fortifiedAssault"], battlefieldProfiles: [], campaignKeys: [], playerRole: "attacker" },
  {
    key: "fortified_omaha_coast",
    scenario: omahaBeachScenario,
    missionTypes: ["fortifiedAssault", "lineAssault", "meetingEngagement"],
    battlefieldProfiles: ["beachBluffs"],
    campaignKeys: ["central_channel"],
    playerRole: "attacker"
  },
  { key: "fortified_citadel_ridge", scenario: citadelRidgeScenario, missionTypes: ["fortifiedAssault", "lineAssault"], battlefieldProfiles: [], campaignKeys: [], playerRole: "attacker" },
  { key: "line_el_alamein", scenario: elAlameinScenario, missionTypes: ["lineAssault", "meetingEngagement"], battlefieldProfiles: [], campaignKeys: [], playerRole: "attacker" },
  // Retained for exact older packages; new Normandy engagements cannot select this geography.
  { key: "line_hurtgen_forest", scenario: hurtgenForestScenario, missionTypes: ["fortifiedAssault", "lineAssault"], battlefieldProfiles: [], campaignKeys: ["central_channel"], playerRole: "attacker" },
  { key: "port_gela_landings", scenario: gelaLandingsScenario, missionTypes: ["portAssault"], battlefieldProfiles: [], campaignKeys: [], playerRole: "attacker" },
  {
    key: "line_gela_low_coast",
    scenario: gelaLandingsScenario,
    missionTypes: ["fortifiedAssault", "lineAssault", "meetingEngagement"],
    battlefieldProfiles: ["lowCoastalBeach"],
    campaignKeys: ["central_channel"],
    playerRole: "attacker"
  },
  {
    key: "airfield_gela_coast",
    scenario: gelaLandingsScenario,
    missionTypes: ["airfieldRaid"],
    battlefieldProfiles: ["airfield"],
    campaignKeys: ["central_channel"],
    playerRole: "attacker",
    objectiveHexOverrides: [[17, 5], [21, 6], [12, 9], [6, 14]]
  },
  {
    key: "port_anzio_beachhead",
    scenario: anzioBeachheadScenario,
    missionTypes: ["portAssault", "depotRaid", "meetingEngagement"],
    battlefieldProfiles: ["portEstuary"],
    campaignKeys: ["central_channel"],
    playerRole: "defender",
    objectiveHexOverrides: [[5, 15], [12, 12], [21, 6], [16, 9]]
  },
  { key: "raid_kasserine_pass", scenario: kasserinePassScenario, missionTypes: ["airfieldRaid", "meetingEngagement"], battlefieldProfiles: [], campaignKeys: [], playerRole: "defender" },
  {
    key: "raid_carentan",
    scenario: carentanScenario,
    missionTypes: ["lineAssault", "depotRaid", "meetingEngagement"],
    battlefieldProfiles: ["floodedLowland"],
    campaignKeys: ["central_channel"],
    playerRole: "attacker"
  },
  // Retained for exact older packages; snow terrain is excluded from new Normandy selection.
  { key: "depot_bastogne", scenario: bastogneScenario, missionTypes: ["depotRaid"], battlefieldProfiles: [], campaignKeys: ["central_channel"], playerRole: "defender" },
  {
    key: "depot_falaise_pocket",
    scenario: falaisePocketScenario,
    missionTypes: ["fortifiedAssault", "lineAssault", "depotRaid", "meetingEngagement"],
    battlefieldProfiles: ["bocage", "openCountry", "urbanApproaches"],
    campaignKeys: ["central_channel"],
    playerRole: "attacker"
  },
  {
    key: "river_arnhem_lowland",
    scenario: arnhemBridgeScenario,
    missionTypes: ["lineAssault", "depotRaid", "meetingEngagement"],
    battlefieldProfiles: ["riverCrossing"],
    campaignKeys: ["central_channel"],
    playerRole: "defender",
    objectiveHexOverrides: [[15, 10], [7, 7], [6, 3], [21, 13]]
  },
  {
    key: "river_remagen_seine",
    scenario: remagenScenario,
    missionTypes: ["lineAssault", "depotRaid", "meetingEngagement"],
    battlefieldProfiles: ["riverCrossing"],
    campaignKeys: ["central_channel"],
    playerRole: "attacker"
  },
  // Retained for exact older packages; new Normandy engagements use profiled river/open maps.
  { key: "meeting_two_bridges", scenario: twoBridgesScenario, missionTypes: ["meetingEngagement"], battlefieldProfiles: [], campaignKeys: ["central_channel"], playerRole: "attacker" }
]);

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
 * Picks an approved template for one exact mission and battlefield profile.
 * Missing coverage is an authoring error because substituting unrelated terrain corrupts campaign truth.
 */
export function selectBattleTemplate(
  missionType: CampaignMissionType,
  battlefieldProfile: CampaignBattlefieldProfile,
  engagementId: string,
  campaignKey?: string
): BattleTemplateEntry {
  const compatible = campaignKey
    ? BATTLE_TEMPLATES.filter((entry) => entry.campaignKeys.includes(campaignKey))
    : BATTLE_TEMPLATES;
  const byMission = compatible.filter((entry) => entry.missionTypes.includes(missionType));
  const pool = byMission.filter((entry) => entry.battlefieldProfiles.includes(battlefieldProfile));
  if (pool.length === 0) {
    throw new Error(
      `[battleTemplates] No ${missionType} template represents ${battlefieldProfile} geography${campaignKey ? ` in campaign '${campaignKey}'` : ""}.`
    );
  }
  return pool[hashString(engagementId) % pool.length];
}

export function getBattleTemplateByKey(key: string): BattleTemplateEntry | null {
  return BATTLE_TEMPLATES.find((entry) => entry.key === key) ?? null;
}

/** True once a campaign has at least one explicitly approved tactical map. */
export function hasBattleTemplatesForCampaign(campaignKey: string): boolean {
  return BATTLE_TEMPLATES.some((entry) => entry.campaignKeys.includes(campaignKey));
}
