import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import {
  buildEngagementContext,
  deriveMissionType,
  describeForceRatio
} from "../src/game/campaign/EngagementContextBuilder";
import {
  buildAllocationCaps,
  getCampaignUnitRpValue,
  mapCampaignUnitToAllocationKey
} from "../src/game/campaign/campaignForceMapping";

/**
 * Inline fixture: a fortified Bot hex at offset "5,5" (axial 5,3) with player forces staged on an
 * adjacent tile, a distant player tile that must NOT count, an in-range airbase, and an out-of-range
 * airbase. Offset key convention matches CampaignState: row = r + floor(q / 2).
 */
function buildFixtureScenario(): CampaignScenarioData {
  return {
    key: "ctx_test",
    title: "Context Builder Fixture",
    description: "",
    dimensions: { cols: 40, rows: 40 },
    background: { imageUrl: "about:blank" },
    tilePalette: {
      botFortHeavy: { role: "fortificationHeavy", factionControl: "Bot" },
      botRegion: { role: "region", factionControl: "Bot" },
      playerRegion: { role: "region", factionControl: "Player" },
      playerAirbase: { role: "airbase", factionControl: "Player", airSortieCapacity: 6 },
      farPlayerAirbase: { role: "airbase", factionControl: "Player", airSortieCapacity: 99 }
    },
    tiles: [
      // Battle hex: Bot heavy fortification, offset "5,5".
      { tile: "botFortHeavy", hex: { q: 5, r: 3 }, forces: [{ unitType: "Infantry_42", count: 2 }] },
      // Adjacent Bot support, offset "6,5".
      { tile: "botRegion", hex: { q: 6, r: 2 }, forces: [{ unitType: "Artillery_105mm", count: 1 }] },
      // Adjacent player staging tile, offset "4,5". Battleship should be excluded (not coastal);
      // Fighter should be excluded from the ground gather (air comes from airbases only).
      {
        tile: "playerRegion",
        hex: { q: 4, r: 3 },
        forces: [
          { unitType: "Infantry_42", count: 2 },
          { unitType: "Panzer_IV", count: 1 },
          { unitType: "Battleship", count: 1 },
          { unitType: "Fighter", count: 1 }
        ]
      },
      // Distant player tile (far outside adjacency): must not contribute.
      { tile: "playerRegion", hex: { q: 0, r: 0 }, forces: [{ unitType: "Heavy_Tank", count: 5 }] },
      // Airbase within sortie range (distance 7): contributes wings and sorties.
      { tile: "playerAirbase", hex: { q: 5, r: 10 }, forces: [{ unitType: "Fighter", count: 2 }] },
      // Airbase out of range (distance 27): must not contribute.
      { tile: "farPlayerAirbase", hex: { q: 5, r: 30 }, forces: [{ unitType: "Fighter", count: 9 }] }
    ],
    fronts: [],
    objectives: [],
    economies: [
      {
        faction: "Player",
        manpower: 5000,
        supplies: 1000,
        fuel: 800,
        ammo: 400,
        airPower: 0,
        navalPower: 0,
        intelCoverage: 0
      }
    ]
  };
}

registerTest("ENGAGEMENT_CONTEXT_AVAILABILITY_AND_CAPS", async ({ Given, When, Then }) => {
  const scenario = buildFixtureScenario();
  let context: ReturnType<typeof buildEngagementContext> = null;

  await Given("a fortified Bot hex with player forces adjacent and an in-range airbase", async () => {
    // Fixture built above; sanity: battle hex derives a fortified assault.
    if (deriveMissionType(scenario, "5,5") !== "fortifiedAssault") {
      throw new Error("Expected fortificationHeavy role to derive fortifiedAssault");
    }
  });

  await When("the engagement context is built for the battle hex", async () => {
    context = buildEngagementContext(scenario, {
      engagementId: "eng_test",
      battleHexKey: "5,5",
      attacker: "Player"
    });
  });

  await Then("caps, air support, enemy pool, and reserve reflect only forces in position", async () => {
    if (!context) throw new Error("Context builder returned null");
    if (context.missionType !== "fortifiedAssault") throw new Error(`Wrong mission type: ${context.missionType}`);
    if (context.defender !== "Bot") throw new Error(`Wrong defender: ${context.defender}`);

    // Ground caps: 2 infantry + 1 tank from the adjacent tile. Distant Heavy_Tank excluded.
    if (context.allocationCaps["infantry"] !== 2) throw new Error(`infantry cap ${context.allocationCaps["infantry"]} != 2`);
    if (context.allocationCaps["tank"] !== 1) throw new Error(`tank cap ${context.allocationCaps["tank"]} != 1`);
    if (context.allocationCaps["heavyTankCompany"] !== undefined) throw new Error("Distant Heavy_Tank leaked into caps");

    // Air: only the in-range airbase contributes (2 fighters, 6 sorties). The staged tile's fighter
    // and the out-of-range airbase must not count.
    if (context.allocationCaps["fighter"] !== 2) throw new Error(`fighter cap ${context.allocationCaps["fighter"]} != 2`);
    if (context.airSorties !== 6) throw new Error(`airSorties ${context.airSorties} != 6`);

    // Naval: no water hexes declared, so the Battleship is excluded.
    if (context.allocationCaps["shoreFireControlParty"] !== undefined) throw new Error("Battleship counted despite non-coastal battle");

    // Enemy pool: battle hex garrison + adjacent Bot artillery.
    const enemyTotal = context.enemyForces.reduce((sum, g) => sum + g.count, 0);
    if (enemyTotal !== 3) throw new Error(`enemy pool total ${enemyTotal} != 3`);

    // Reserve: supplies 1000 / 4 = 250, within [150, 600].
    if (context.rpReserve !== 250) throw new Error(`rpReserve ${context.rpReserve} != 250`);

    if (!Number.isFinite(context.forceRatio) || context.forceRatio <= 0) {
      throw new Error(`forceRatio should be finite and positive, got ${context.forceRatio}`);
    }
  });
});

registerTest("ENGAGEMENT_CONTEXT_MISSION_TYPES_AND_BANDS", async ({ Given, When, Then }) => {
  const scenario = buildFixtureScenario();

  await Given("palette roles covering every mission archetype", async () => {
    scenario.tilePalette["botNaval"] = { role: "navalBase", factionControl: "Bot" };
    scenario.tilePalette["botAir"] = { role: "airbase", factionControl: "Bot" };
    scenario.tilePalette["botLogi"] = { role: "logisticsHub", factionControl: "Bot" };
    scenario.tilePalette["botFortLight"] = { role: "fortificationLight", factionControl: "Bot" };
    scenario.tiles.push(
      { tile: "botNaval", hex: { q: 10, r: 0 } },
      { tile: "botAir", hex: { q: 11, r: 0 } },
      { tile: "botLogi", hex: { q: 12, r: 0 } },
      { tile: "botFortLight", hex: { q: 13, r: 0 } },
      { tile: "botRegion", hex: { q: 14, r: 0 } }
    );
  });

  await When("mission types are derived from each role", async () => {
    // Assertions live in Then; derivation is pure.
  });

  await Then("each role maps to its archetype and ratio bands are stable at the edges", async () => {
    const cases: Array<[string, string]> = [
      ["10,5", "portAssault"],
      ["11,5", "airfieldRaid"],
      ["12,6", "depotRaid"],
      ["13,6", "lineAssault"],
      ["14,7", "meetingEngagement"],
      ["39,39", "meetingEngagement"] // empty hex
    ];
    for (const [hexKey, expected] of cases) {
      const derived = deriveMissionType(scenario, hexKey);
      if (derived !== expected) {
        throw new Error(`deriveMissionType(${hexKey}) = ${derived}, expected ${expected}`);
      }
    }

    const bands: Array<[number, string, boolean]> = [
      [2.0, "light", false],
      [1.0, "comparable", false],
      [0.5, "heavy", true],
      [0.2, "overwhelming", true],
      [Number.POSITIVE_INFINITY, "light", false]
    ];
    for (const [ratio, band, outgunned] of bands) {
      const described = describeForceRatio(ratio);
      if (described.band !== band || described.outgunned !== outgunned) {
        throw new Error(`describeForceRatio(${ratio}) = ${described.band}/${described.outgunned}, expected ${band}/${outgunned}`);
      }
    }

    const unopposed = buildEngagementContext(scenario, {
      engagementId: "eng_unopposed",
      battleHexKey: "39,39",
      attacker: "Player"
    });
    if (!unopposed || !Number.isFinite(unopposed.forceRatio) || unopposed.forceRatio !== Number.MAX_SAFE_INTEGER) {
      throw new Error(`Unopposed campaign context must remain finite and save-safe, got ${unopposed?.forceRatio}.`);
    }
  });
});

registerTest("ENGAGEMENT_CONTEXT_MAPPING_COMPLETENESS", async ({ Given, When, Then }) => {
  // Every unit type used by the live campaign scenario must map (or be a documented exclusion).
  const campaignUnitTypes = [
    "Artillery_105mm",
    "Artillery_155mm",
    "Battleship",
    "Bomber",
    "Fighter",
    "Infantry_42",
    "Infantry_Elite",
    "Interceptor",
    "Panzer_IV",
    "Supply_Truck",
    "Transport_Ship"
  ];
  const documentedExclusions = ["Transport_Ship"];

  await Given("the unit types present in campaign01", async () => {
    // List mirrored above; keep in sync with src/data/campaign01.json force groups.
  });

  await When("each type is passed through the mapping table", async () => {
    // Pure lookups asserted in Then.
  });

  await Then("every type maps to a priced allocation key or is a documented exclusion", async () => {
    for (const unitType of campaignUnitTypes) {
      const key = mapCampaignUnitToAllocationKey(unitType);
      if (documentedExclusions.includes(unitType)) {
        if (key !== null) throw new Error(`${unitType} should be excluded but mapped to ${key}`);
        continue;
      }
      if (!key) throw new Error(`Campaign unit type ${unitType} has no allocation mapping`);
      const value = getCampaignUnitRpValue(unitType);
      if (!(value > 0)) throw new Error(`Mapped type ${unitType} → ${key} has non-positive RP value ${value}`);
    }

    // Caps aggregation merges duplicate types and skips unmapped ones without throwing.
    const caps = buildAllocationCaps([
      { unitType: "Infantry_42", count: 2 },
      { unitType: "Infantry_Elite", count: 1 },
      { unitType: "Transport_Ship", count: 4 },
      { unitType: "Totally_Unknown", count: 3 }
    ]);
    if (caps["infantry"] !== 3) throw new Error(`Merged infantry cap ${caps["infantry"]} != 3`);
    if (Object.keys(caps).length !== 1) throw new Error(`Unexpected caps keys: ${Object.keys(caps).join(", ")}`);
  });
});
