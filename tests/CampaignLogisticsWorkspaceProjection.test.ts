import assert from "node:assert/strict";
import type { CampaignFactionEconomy } from "../src/core/campaignTypes";
import type { CampaignNavalSupportView } from "../src/game/campaign/logistics/CampaignNavalSupportService";
import {
  projectCampaignLogisticsWorkspace
} from "../src/ui/campaign/CampaignLogisticsWorkspaceProjection";
import { registerTest } from "./harness.js";

registerTest("CAMPAIGN_LOGISTICS_WORKSPACE_PROJECTS_DETACHED_AUTHORITATIVE_SUPPORT", async ({
  Given,
  When,
  Then
}) => {
  const economy: CampaignFactionEconomy = {
    faction: "Player",
    manpower: 1200,
    supplies: 20,
    fuel: 9,
    ammo: 3456,
    airPower: 7,
    navalPower: 999,
    intelCoverage: 3
  };
  const navalSupport: CampaignNavalSupportView = {
    availableSupportAssignments: 1,
    availableFireMissions: 2,
    fireMissionsPerAssignment: 2,
    readySourceIds: ["fleet-ready"],
    sources: [
      {
        sourceId: "fleet-ready",
        sourceHexKey: "2,1",
        label: "Western Naval Force",
        readiness: 1,
        effectiveRangeHexes: 6,
        distanceHexes: null,
        availableSupportAssignments: 1,
        availableFireMissions: 1,
        fireMissionsPerAssignment: 2,
        status: "ready",
        reason: "Fire control is ready.",
        nextAvailableSegment: null
      },
      {
        sourceId: "fleet-expended",
        sourceHexKey: "4,3",
        label: "Eastern Naval Force",
        readiness: 1,
        effectiveRangeHexes: 5,
        distanceHexes: 4,
        availableSupportAssignments: 0,
        availableFireMissions: 0,
        fireMissionsPerAssignment: 2,
        status: "expended",
        reason: "Fire mission expended.",
        nextAvailableSegment: 12
      }
    ]
  };
  const productionReport = {
    sources: [
      { offsetKey: "2,1", capacity: 125 },
      { offsetKey: "6,5", capacity: 50 }
    ],
    segmentsUntilNextTick: 3
  };
  const hexes = [
    { hexKey: "2,1", airSortieCapacity: 2 },
    { hexKey: "4,3", airSortieCapacity: 0 },
    { hexKey: "6,5", airSortieCapacity: 0 },
    { hexKey: "8,7", airSortieCapacity: 0 }
  ];
  const before = JSON.stringify({ economy, navalSupport, productionReport, hexes });
  const segmentCalls: number[] = [];
  let projected: ReturnType<typeof projectCampaignLogisticsWorkspace> | null = null;

  await Given("authorized economy, held resources, production sources, and exact naval authority", () => {});
  await When("the complete command-shell Logistics workspace is projected", () => {
    projected = projectCampaignLogisticsWorkspace({
      economy,
      reservedResources: { manpower: 200, supplies: 0, fuel: 2 },
      productionReport,
      currentSegment: 5,
      navalSupport,
      hexes,
      hexScaleKm: 10,
      formatSegment: (segment) => {
        segmentCalls.push(segment);
        return `Segment ${segment}`;
      }
    });
  });
  await Then("stocks, held capacity, source order, range copy, and detached support remain exact", () => {
    assert.ok(projected);
    assert.equal(JSON.stringify({ economy, navalSupport, productionReport, hexes }), before);
    assert.deepEqual(projected.resources, [
      { key: "manpower", label: "Personnel", value: "1,200 · 200 held" },
      { key: "supplies", label: "Supply", value: "20" },
      { key: "fuel", label: "Fuel", value: "9 · 2 held" },
      { key: "ammo", label: "Ammo", value: "3,456" }
    ]);
    assert.equal(projected.airPower, 7);
    assert.equal(projected.navalPower, 999);
    assert.deepEqual(projected.navalSupport, navalSupport);
    assert.notEqual(projected.navalSupport, navalSupport);
    assert.notEqual(projected.navalSupport.sources, navalSupport.sources);
    assert.notEqual(projected.navalSupport.sources[0], navalSupport.sources[0]);
    assert.notEqual(projected.navalSupport.readySourceIds, navalSupport.readySourceIds);
    assert.deepEqual(projected.capabilitiesByHex.get("2,1"), [
      "+125 Allied support points daily · next allocation Segment 8",
      "Air-wing staging and fighter/bomber rebase point",
      "Western Naval Force: 1 ready fire mission · 60 km range · Fire control is ready."
    ]);
    assert.deepEqual(projected.capabilitiesByHex.get("4,3"), [
      "Eastern Naval Force: 0 ready fire missions · 50 km range · Fire mission expended. · next available Segment 12"
    ]);
    assert.deepEqual(projected.capabilitiesByHex.get("6,5"), [
      "+50 Allied support points daily · next allocation Segment 8"
    ]);
    assert.deepEqual(projected.capabilitiesByHex.get("8,7"), []);
    assert.deepEqual(segmentCalls, [8, 12]);

    (navalSupport.readySourceIds as string[])[0] = "mutated-ready";
    (navalSupport.sources[0] as { label: string }).label = "Mutated fleet";
    productionReport.sources[0].capacity = 999;
    hexes[0].airSortieCapacity = 0;
    assert.deepEqual(projected.navalSupport.readySourceIds, ["fleet-ready"]);
    assert.equal(projected.navalSupport.sources[0]?.label, "Western Naval Force");
    assert.deepEqual(projected.capabilitiesByHex.get("2,1"), [
      "+125 Allied support points daily · next allocation Segment 8",
      "Air-wing staging and fighter/bomber rebase point",
      "Western Naval Force: 1 ready fire mission · 60 km range · Fire control is ready."
    ]);
  });
});

registerTest("CAMPAIGN_LOGISTICS_WORKSPACE_PRESERVES_UNAVAILABLE_ECONOMY_WITHOUT_NAVAL_INFERENCE", async () => {
  const projected = projectCampaignLogisticsWorkspace({
    economy: null,
    reservedResources: { manpower: 9 },
    productionReport: null,
    currentSegment: 0,
    navalSupport: {
      availableSupportAssignments: 0,
      availableFireMissions: 0,
      fireMissionsPerAssignment: 2,
      readySourceIds: [],
      sources: []
    },
    hexes: [],
    hexScaleKm: 10,
    formatSegment: () => "unused"
  });
  assert.deepEqual(projected.resources, []);
  assert.equal(projected.airPower, 0);
  assert.equal(projected.navalPower, 0);
  assert.equal(projected.navalSupport.availableFireMissions, 0);
});
