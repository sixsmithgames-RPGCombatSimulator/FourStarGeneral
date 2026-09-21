import assert from "node:assert/strict";
import type {
  CampaignEnemyContactView,
  CampaignIntelBriefEvent,
  CampaignKnownStrategicRegionView,
  CampaignKnownStrategicSiteView
} from "../src/core/campaignIntelTypes";
import {
  projectCampaignIntelligenceWorkspace
} from "../src/ui/campaign/CampaignIntelligenceWorkspaceProjection";
import { registerTest } from "./harness.js";

function contact(
  id: string,
  overrides: Partial<CampaignEnemyContactView> = {}
): CampaignEnemyContactView {
  return {
    id,
    subjectKind: "force",
    level: "located",
    state: "current",
    confidenceBand: "medium",
    locationHexKey: "2,1",
    uncertaintyRadius: 1,
    domain: "ground",
    label: "Enemy formation",
    lastObservedSegment: 4,
    ageSegments: 1,
    sourceLabels: ["Ground reconnaissance"],
    analystNotes: ["Movement unconfirmed."],
    ...overrides
  };
}

registerTest("CAMPAIGN_INTELLIGENCE_WORKSPACE_PROJECTS_COMPLETE_DETACHED_AUTHORIZED_BRIEF", async ({
  Given,
  When,
  Then
}) => {
  const knownSites: CampaignKnownStrategicSiteView[] = [{
    id: "radar-site",
    locationHexKey: "2,1",
    label: "Radar Station",
    role: "radarSite",
    summary: "Fixed station reported in the command brief.",
    sourceLabel: "Theater briefing",
    spriteKey: "radar",
    category: "enemyInstallation",
    locationPrecision: "fixed",
    relatedLocations: ["Caen", "Bayeux"],
    geography: {
      terrain: "water",
      placeName: "Channel Station",
      terrainCharacter: "estuary",
      roads: ["Coastal road"],
      railways: ["Spur"],
      waterways: ["Channel"],
      operationalFeatures: ["Radar"]
    }
  }];
  const knownRegions: CampaignKnownStrategicRegionView[] = [{
    id: "western-support",
    label: "Western support belt",
    category: "alliedSupport",
    summary: "Rear-area support remains available.",
    sourceLabel: "Theater briefing",
    locations: ["Plymouth", "Bristol"],
    commandStatus: "Briefing only"
  }];
  const contacts: CampaignEnemyContactView[] = [
    contact("front-contact", {
      state: "disputed",
      classificationBand: "Armored formation",
      strengthBand: "heavy",
      sourceLabels: ["Ground reconnaissance", "Signals intelligence"]
    }),
    contact("fallback-contact", {
      state: "stale",
      confidenceBand: "low",
      locationHexKey: "4,3",
      uncertaintyRadius: 2,
      domain: "air",
      label: "Air activity",
      ageSegments: 3,
      sourceLabels: ["Air warning network"]
    })
  ];
  const briefEvents: CampaignIntelBriefEvent[] = [
    {
      id: "brief-new",
      segment: 5,
      kind: "new",
      title: "Raw title",
      detail: "A new formation was reported.",
      contactId: "front-contact",
      read: false
    },
    {
      id: "brief-downgraded",
      segment: 6,
      kind: "downgraded",
      title: "Raw downgrade title",
      detail: "Confidence declined.",
      contactId: "fallback-contact",
      read: true
    },
    {
      id: "brief-operation",
      segment: 7,
      kind: "operation",
      title: "Reconnaissance complete",
      detail: "The patrol returned.",
      operationId: "operation-1",
      read: false
    }
  ];
  const sources = { knownSites, knownRegions, contacts, briefEvents };
  const before = JSON.stringify(sources);
  const locationCalls: Array<{ hexKey: string; uncertainty?: object }> = [];
  const displayLabelCalls: string[] = [];
  let projected: ReturnType<typeof projectCampaignIntelligenceWorkspace> | null = null;

  await Given("authorized intelligence sources, a front edge, and held analysis capacity", () => {});
  await When("the complete Intelligence workspace is projected without state or DOM ownership", () => {
    projected = projectCampaignIntelligenceWorkspace({
      knownSites,
      knownRegions,
      contacts,
      briefEvents,
      fronts: [{ label: "Eastern Front", hexKeys: [], edges: [{ opposingHexKey: "2,1" }] }],
      authoredWaterHexes: new Set(["2,0"]),
      scenarioTitle: "Operation Test",
      capacity: { available: 1, total: 5, held: 2 },
      resolveLocation: (hexKey, uncertainty) => {
        locationCalls.push({ hexKey, ...(uncertainty ? { uncertainty: { ...uncertainty } } : {}) });
        return { primaryLabel: `Location ${hexKey}`, secondaryGridReference: `Grid ${hexKey}` };
      },
      resolveLocationDisplayLabel: (hexKey) => {
        displayLabelCalls.push(hexKey);
        return `Fallback ${hexKey}`;
      },
      formatLabel: (value) => value.replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/^./, (character) => character.toUpperCase()),
      formatSegment: (segment) => `Segment ${segment}`
    });
  });
  await Then("all rows, labels, callback order, and source detachment remain exact", () => {
    assert.ok(projected);
    assert.equal(JSON.stringify(sources), before);
    assert.deepEqual(projected.knownSites, [{
      id: "radar-site",
      label: "Radar Station",
      locationHexKey: "2,1",
      location: { primaryLabel: "Location 2,1", secondaryGridReference: "Grid 2,1" },
      roleLabel: "Radar Site",
      summary: "Fixed station reported in the command brief.",
      sourceLabel: "Theater briefing",
      categoryLabel: "Known opposing installation",
      locationPrecision: "fixed",
      relatedLocations: ["Caen", "Bayeux"],
      strategicGeography: {
        terrain: "Water",
        landform: "estuary",
        settlement: "Channel Station",
        roads: ["Coastal road"],
        railways: ["Spur"],
        waterways: ["Channel"],
        operationalFeatures: ["Radar"]
      }
    }]);
    assert.deepEqual(projected.knownRegions, [{
      id: "western-support",
      label: "Western support belt",
      categoryLabel: "Allied theater support",
      summary: "Rear-area support remains available.",
      sourceLabel: "Theater briefing",
      commandStatus: "Briefing only",
      locations: ["Plymouth", "Bristol"]
    }]);
    assert.deepEqual(projected.contacts, [
      {
        id: "front-contact",
        label: "Enemy formation",
        locationHexKey: "2,1",
        location: { primaryLabel: "Location 2,1", secondaryGridReference: "Grid 2,1" },
        sectorLabel: "Eastern Front",
        priority: "critical",
        threatLabel: "Armored formation",
        locationLabel: "Radar Station",
        locationRoleLabel: "Radar Site",
        state: "disputed",
        confidenceBand: "medium",
        ageSegments: 1,
        uncertaintyRadius: 1,
        sourceLabels: ["Ground reconnaissance", "Signals intelligence"],
        strengthBand: "heavy"
      },
      {
        id: "fallback-contact",
        label: "Air activity",
        locationHexKey: "4,3",
        location: { primaryLabel: "Location 4,3", secondaryGridReference: "Grid 4,3" },
        sectorLabel: "Fallback 4,3",
        priority: "notable",
        threatLabel: "Air activity",
        state: "stale",
        confidenceBand: "low",
        ageSegments: 3,
        uncertaintyRadius: 2,
        sourceLabels: ["Air warning network"],
        strengthBand: undefined
      }
    ]);
    assert.deepEqual(projected.intelligenceBriefs, [
      {
        ...briefEvents[0],
        title: "Location 2,1: New contact",
        timeLabel: "Segment 5",
        sectorLabel: "Eastern Front",
        priority: "routine",
        materiallyChanged: true
      },
      {
        ...briefEvents[1],
        title: "Location 4,3: Downgraded assessment",
        timeLabel: "Segment 6",
        sectorLabel: "Location 4,3",
        priority: "notable",
        materiallyChanged: true
      },
      {
        ...briefEvents[2],
        title: "Reconnaissance complete",
        timeLabel: "Segment 7",
        sectorLabel: "Operation Test",
        priority: "routine",
        materiallyChanged: true
      }
    ]);
    assert.equal(projected.intelligenceCapacity, "0/5 · 2 held");
    assert.deepEqual(displayLabelCalls, ["4,3"]);
    assert.deepEqual(locationCalls, [
      { hexKey: "2,1" },
      { hexKey: "2,1", uncertainty: { status: "disputed", confidenceBand: "medium", radiusHexes: 1 } },
      { hexKey: "4,3", uncertainty: { status: "stale", confidenceBand: "low", radiusHexes: 2 } },
      { hexKey: "2,1" },
      { hexKey: "4,3" }
    ]);

    knownSites[0].relatedLocations.push("Mutated location");
    knownSites[0].geography?.roads?.push("Mutated road");
    knownRegions[0].locations.push("Mutated region");
    contacts[0].sourceLabels.push("Mutated source");
    assert.deepEqual(projected.knownSites[0]?.relatedLocations, ["Caen", "Bayeux"]);
    assert.deepEqual(projected.knownSites[0]?.strategicGeography?.roads, ["Coastal road"]);
    assert.deepEqual(projected.knownRegions[0]?.locations, ["Plymouth", "Bristol"]);
    assert.deepEqual(projected.contacts[0]?.sourceLabels, ["Ground reconnaissance", "Signals intelligence"]);
  });
});
