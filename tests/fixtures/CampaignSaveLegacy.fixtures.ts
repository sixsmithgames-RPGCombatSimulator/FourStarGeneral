/**
 * MODULE: CampaignSaveLegacy.fixtures
 * WHAT: Provides checked-in canonical scenario plus shipped version-1 and version-2 campaign save fixtures.
 * WHY: Migration behavior must remain reproducible as runtime, intelligence, and authored content evolve.
 *
 * DEPENDENCIES: Existing campaign/intelligence contracts produce realistic faction-separated knowledge records.
 * EXPORTS: Canonical scenario and raw v1/v2 fixture builders.
 */

import type {
  CampaignPendingEngagement,
  CampaignScenarioData
} from "../../src/core/campaignTypes";
import { createCampaignKnowledgeState } from "../../src/state/CampaignIntelligence";

/** Stable engagement used by the version-2 active-battle migration fixture. */
export const LEGACY_V2_ENGAGEMENT_ID = "legacy-engagement-active";

/**
 * WHAT: Builds the current resolver-owned authored scenario for legacy migration tests.
 * WHY: Mutable save state must be applied over this independent definition rather than becoming authored truth.
 *
 * @returns Fresh canonical campaign scenario.
 */
export function buildCampaignSaveCanonicalScenario(): CampaignScenarioData {
  return {
    key: "campaign-save-fixture",
    title: "Campaign Save Fixture",
    description: "Canonical scenario used to certify v1/v2 migration.",
    hexScaleKm: 10,
    dimensions: { cols: 3, rows: 2 },
    background: { imageUrl: "about:blank", stretchMode: "contain" },
    tilePalette: {
      playerHub: {
        role: "logisticsHub",
        factionControl: "Player",
        supplyValue: 4,
        forces: [{ unitType: "Infantry_42", count: 2, label: "Canonical infantry" }]
      },
      botFort: {
        role: "fortificationLight",
        factionControl: "Bot",
        supplyValue: 2,
        forces: [{ unitType: "Panzer_IV", count: 1, label: "Canonical armor" }]
      }
    },
    tiles: [
      { tile: "playerHub", hex: { q: 0, r: 0 }, controlSinceDay: 1 },
      { tile: "botFort", hex: { q: 1, r: 0 }, controlSinceDay: 1 }
    ],
    fronts: [{ key: "fixture-front", label: "Fixture Front", hexKeys: ["0,0", "1,0"], initiative: "Player" }],
    objectives: [{
      key: "hold-hub",
      label: "Hold the Hub",
      description: "Retain control of the logistics hub.",
      hex: { q: 0, r: 0 },
      owner: "Player",
      rewards: ["Supply continuity"]
    }],
    economies: [
      {
        faction: "Player",
        manpower: 1000,
        supplies: 500,
        fuel: 300,
        ammo: 200,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0,
        productionAllocation: { supplies: 40, fuel: 30, ammo: 10, manpower: 20 }
      },
      {
        faction: "Bot",
        manpower: 900,
        supplies: 450,
        fuel: 280,
        ammo: 180,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0
      }
    ]
  };
}

/**
 * WHAT: Builds a realistic version-1 localStorage string using day-based time and no intelligence state.
 * WHY: v1 migration must seed faction knowledge and preserve mutable progress while converting days to segments.
 *
 * @returns Raw byte string representing the shipped v1 shape.
 */
export function buildLegacyCampaignSaveV1Raw(): string {
  const scenario = buildCampaignSaveCanonicalScenario();
  scenario.economies[0].supplies = 412;
  scenario.tiles[0].forces = [{ unitType: "Infantry_42", count: 1, label: "V1 survivors" }];
  scenario.fronts[0].initiative = "Bot";
  return JSON.stringify({
    saveVersion: 1,
    scenario,
    turnState: null,
    decisions: [{
      id: "legacy-v1-decision",
      faction: "Player",
      type: "fortifyFront",
      payload: { frontKey: "fixture-front" },
      affectedHexKeys: ["0,0"]
    }],
    engagements: [],
    activeEngagementId: null,
    currentDay: 3
  });
}

/**
 * WHAT: Builds a realistic version-2 localStorage string with segment time, faction knowledge, and active engagement.
 * WHY: v2 migration must preserve every field added by the current shipped save writer.
 *
 * @returns Raw byte string representing the shipped v2 shape.
 */
export function buildLegacyCampaignSaveV2Raw(): string {
  const scenario = buildCampaignSaveCanonicalScenario();
  scenario.economies[0].supplies = 321;
  scenario.economies[0].fuel = 222;
  scenario.tiles[0].factionControl = "Bot";
  scenario.tiles[0].forces = [{ unitType: "Infantry_42", count: 1, label: "V2 isolated force" }];
  scenario.fronts[0].initiative = "Bot";
  const engagement: CampaignPendingEngagement = {
    id: LEGACY_V2_ENGAGEMENT_ID,
    frontKey: "fixture-front",
    objectiveKey: "hold-hub",
    attacker: "Player",
    defender: "Bot",
    hexKeys: ["1,0"],
    tags: ["legacy", "front"]
  };
  return JSON.stringify({
    saveVersion: 2,
    scenario,
    turnState: {
      scenarioKey: scenario.key,
      turnNumber: 4,
      activeFaction: "Player",
      economyDeltas: [],
      pendingEngagements: [engagement]
    },
    decisions: [{
      id: "legacy-v2-decision",
      faction: "Player",
      type: "launchOffensive",
      payload: { frontKey: "fixture-front" },
      affectedHexKeys: ["1,0"],
      comment: "Preserve this order"
    }],
    engagements: [engagement],
    activeEngagementId: LEGACY_V2_ENGAGEMENT_ID,
    currentSegment: 19,
    intelligenceByFaction: {
      Player: createCampaignKnowledgeState(scenario, "Player", 19),
      Bot: createCampaignKnowledgeState(scenario, "Bot", 19)
    }
  });
}
