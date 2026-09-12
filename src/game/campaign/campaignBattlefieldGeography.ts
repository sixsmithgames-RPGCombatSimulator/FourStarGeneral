/**
 * Theater-specific tactical geography for campaign engagement generation.
 *
 * Campaign sprites identify installations and formations, while this registry identifies the
 * ground a tactical battle must depict. Keeping the full Normandy corridor here prevents a
 * generic palette role such as `germanOperationalRegion` from erasing local geography.
 */

import type {
  CampaignBattlefieldProfile,
  CampaignScenarioData,
  CampaignTileInstance
} from "../../core/campaignTypes";

const CENTRAL_CHANNEL_NAMED_PROFILES: Readonly<Record<string, CampaignBattlefieldProfile>> = Object.freeze({
  southernEnglandAirfields: "airfield",
  easternEnglandAirfields: "airfield",
  westernEmbarkation: "portEstuary",
  portlandEmbarkation: "portEstuary",
  southCoastStaging: "portEstuary",
  easternEmbarkation: "portEstuary",
  bristolBuildUp: "portEstuary",
  westernNavalForce: "portEstuary",
  easternNavalForce: "portEstuary",
  utahBeach: "lowCoastalBeach",
  omahaBeach: "beachBluffs",
  goldBeach: "lowCoastalBeach",
  junoBeach: "lowCoastalBeach",
  swordBeach: "lowCoastalBeach",
  usAirborneLodgment: "floodedLowland",
  us101AirborneLodgment: "floodedLowland",
  britishAirborneLodgment: "riverCrossing",
  pointeDuHocLodgment: "beachBluffs",
  easternBeachheadLink: "lowCoastalBeach",
  germanCoastalDefense: "floodedLowland",
  cherbourgPort: "portEstuary",
  caenHub: "urbanApproaches",
  saintLoHub: "bocage",
  avranchesHub: "bocage",
  falaiseHub: "urbanApproaches",
  argentanHub: "urbanApproaches",
  rouenHub: "riverCrossing"
});

const CENTRAL_CHANNEL_LOCAL_PROFILES: Readonly<Record<string, CampaignBattlefieldProfile>> = Object.freeze({
  // Cotentin flooded approaches and bocage.
  "21,15": "floodedLowland",
  "22,15": "floodedLowland",
  "20,16": "floodedLowland",
  "20,18": "bocage",
  "19,19": "bocage",
  "23,18": "bocage",
  // Beach exits and immediate inland strongpoints.
  "24,12": "beachBluffs",
  "26,11": "bocage",
  "27,11": "lowCoastalBeach",
  "29,9": "lowCoastalBeach",
  "27,12": "bocage",
  "27,13": "bocage",
  // Orne bridgehead, Caen approaches, and central Normandy.
  "31,8": "riverCrossing",
  "31,9": "urbanApproaches",
  "28,13": "bocage",
  "32,11": "openCountry",
  "27,14": "bocage",
  "26,15": "bocage",
  "25,17": "bocage",
  "25,18": "bocage",
  "24,19": "bocage",
  "24,20": "bocage",
  "24,21": "bocage",
  // Caen–Falaise–Argentan maneuver country.
  "32,10": "openCountry",
  "33,10": "openCountry",
  "34,10": "openCountry",
  "35,10": "openCountry",
  "35,11": "openCountry",
  "35,12": "openCountry",
  "36,13": "openCountry",
  "37,13": "openCountry",
  "38,13": "openCountry",
  "39,12": "openCountry",
  "40,11": "openCountry",
  "41,10": "openCountry",
  // Lower Seine and Rouen approaches.
  "42,9": "riverCrossing",
  "43,8": "riverCrossing",
  "44,7": "riverCrossing",
  "44,6": "riverCrossing",
  "44,5": "riverCrossing"
});

/** Returns the authoritative tactical geography for one campaign tile, or throws when authoring is incomplete. */
export function resolveCampaignBattlefieldProfile(
  scenario: Pick<CampaignScenarioData, "key">,
  tile: CampaignTileInstance
): CampaignBattlefieldProfile {
  if (tile.battlefieldProfile) return tile.battlefieldProfile;
  if (scenario.key !== "central_channel") {
    throw new Error(
      `[campaignBattlefieldGeography] Campaign '${scenario.key}' must author a battlefield profile for tactical hex ${tile.hex.q},${tile.hex.r}.`
    );
  }
  const named = CENTRAL_CHANNEL_NAMED_PROFILES[tile.tile];
  if (named) return named;
  const local = CENTRAL_CHANNEL_LOCAL_PROFILES[`${tile.hex.q},${tile.hex.r}`];
  if (local) return local;
  throw new Error(
    `[campaignBattlefieldGeography] Normandy tactical hex ${tile.hex.q},${tile.hex.r} (${tile.tile}) has no certified battlefield geography.`
  );
}
