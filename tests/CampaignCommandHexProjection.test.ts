import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import type { CampaignOrderActionPreview } from "../src/game/campaign/orders/CampaignOrderTypes";
import type {
  CampaignCommandFormationView,
  CampaignCommandKnownSiteView,
  CampaignCommandObjectiveView
} from "../src/ui/campaign/CampaignCommandShell";
import { projectCampaignCommandHexes } from "../src/ui/campaign/CampaignCommandHexProjection";
import type { CampaignLocationPresentation } from "../src/ui/campaign/CampaignLocationPresentation";
import { registerTest } from "./harness.js";

function preview(
  availability: CampaignOrderActionPreview["availability"],
  reason: string | null = null,
  correctiveAction: string | null = null
): CampaignOrderActionPreview {
  return { availability, reasonCode: null, reason, correctiveAction, mapHexKeys: [] };
}

function location(hexKey: string): CampaignLocationPresentation {
  return { primaryLabel: `Position ${hexKey}`, secondaryGridReference: `Grid ${hexKey}` };
}

function formation(overrides: Partial<CampaignCommandFormationView> = {}): CampaignCommandFormationView {
  return {
    id: "formation-1",
    name: "1st Division",
    typeLabel: "Infantry division",
    ownershipLabel: "Player",
    locationHexKey: "0,0",
    statusLabel: "Ready",
    readiness: "Ready",
    cohesion: "Steady",
    fatigue: "Rested",
    personnel: "10,000",
    equipment: "Full",
    supply: "Full",
    experience: "Veteran",
    honors: [],
    battles: 0,
    currentOrderId: null,
    latestHistory: null,
    ...overrides
  };
}

function objective(hexKey: string): CampaignCommandObjectiveView {
  return { key: `objective-${hexKey}`, label: `Objective ${hexKey}`, status: "In progress", hexKey };
}

function scenario(): Pick<CampaignScenarioData, "tiles" | "tilePalette" | "fronts"> {
  return {
    tilePalette: {
      alliedAirfield: {
        role: "airbase",
        factionControl: "Player",
        mapLabel: "Saint-Pierre",
        notes: "Forward fighter station.",
        historicalNetwork: ["Saint-Pierre", "Satellite Strip"],
        geography: { terrain: "land", terrainCharacter: "coastal plain", roads: ["N13"] }
      },
      alliedFleet: { role: "taskForce", factionControl: "Player" },
      enemyRegion: { role: "region", factionControl: "Bot", mapLabel: "Enemy Ridge" }
    },
    tiles: [
      {
        tile: "alliedAirfield",
        hex: { q: 0, r: 0 },
        forces: [{ unitType: "infantry", count: 2, label: "Rifle Battalion" }],
        infrastructure: {
          role: "airbase",
          maxIntegrity: 100,
          integrity: 70,
          damageState: "damaged",
          effectiveness: 0.6,
          disabled: false,
          lastDamageSegment: 2,
          lastRepairSegment: null,
          lastCapturedSegment: 1,
          capturedFrom: "Bot",
          capturedBy: "Player",
          captureDisruptionUntilSegment: 6,
          activeRepairOrderId: null
        }
      },
      { tile: "alliedFleet", hex: { q: 1, r: 0 }, forces: [{ unitType: "destroyer", count: 1, label: "Escort Group" }] },
      { tile: "enemyRegion", hex: { q: 2, r: 0 }, forces: [{ unitType: "infantry", count: 3, label: "Enemy Regiment" }] }
    ],
    fronts: [{
      key: "front-1",
      label: "Western Front",
      hexKeys: ["0,0", "4,4"],
      edges: [],
      initiative: "Player"
    }]
  };
}

function knownSite(overrides: Partial<CampaignCommandKnownSiteView> = {}): CampaignCommandKnownSiteView {
  return {
    id: "site-1",
    label: "Briefed Port",
    locationHexKey: "4,4",
    location: location("4,4"),
    roleLabel: "Naval Base",
    summary: "Allied supporting harbor.",
    sourceLabel: "Theater briefing",
    categoryLabel: "Allied supporting site",
    locationPrecision: "fixed",
    relatedLocations: ["Outer Roads"],
    strategicGeography: { terrain: "Water", operationalFeatures: ["Anchorage"] },
    ...overrides
  };
}

registerTest("CAMPAIGN_COMMAND_HEX_PROJECTION_OWNS_EXACT_FRIENDLY_BASE_PRESENTATION", () => {
  const redeployCalls: string[] = [];
  const repairCalls: string[] = [];
  const projected = projectCampaignCommandHexes({
    scenario: scenario(),
    formations: [formation({ availabilityLabel: "D+1 0600" })],
    objectives: [objective("0,0")],
    knownSites: [],
    capabilitiesByHex: new Map([["0,0", ["24 fighter sorties"]]]),
    authoredWaterHexes: new Set(),
    resolveLocation: location,
    resolveRedeployPreview: (hexKey) => {
      redeployCalls.push(hexKey);
      return preview("blocked", "No uncommitted force is available.", "Select another force.");
    },
    resolveRepairPreview: (hexKey) => {
      repairCalls.push(hexKey);
      return preview("blocked", "Requires 20 supply.", "Wait for the next support delivery.");
    },
    isAdjacentToEnemy: () => false,
    formatLabel: (value) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (character) => character.toUpperCase()),
    formatSegment: (segment) => `D+0 ${segment * 3}:00`
  });

  assert.deepEqual(redeployCalls, ["0,0"]);
  assert.deepEqual(repairCalls, ["0,0"]);
  assert.deepEqual(projected[0], {
    hexKey: "0,0",
    location: location("0,0"),
    roleLabel: "Air base",
    controlLabel: "Friendly control",
    presentation: "friendlyBase",
    showSelectionActions: true,
    showEngagementAction: false,
    actionSummary: "Requires 20 supply. Wait for the next support delivery.",
    historicalNetwork: ["Satellite Strip"],
    strategicGeography: {
      terrain: "Land",
      landform: "coastal plain",
      settlement: "Saint-Pierre",
      roads: ["N13"],
      operationalFeatures: ["Airbase"]
    },
    displayLabel: "Saint-Pierre",
    summary: "Forward fighter station.",
    locationLabel: "Saint-Pierre · hex 0,0",
    hasContextActions: true,
    forces: ["Rifle Battalion · 2"],
    capabilities: ["24 fighter sorties"],
    infrastructure: "Damaged · 60% operational capacity",
    infrastructureRecovery: "The new garrison is reorganizing the position until D+0 18:00. Structural reconstruction remains required.",
    objectives: ["Objective 0,0"],
    fronts: ["Western Front"]
  });
});

registerTest("CAMPAIGN_COMMAND_HEX_PROJECTION_PRESERVES_FLEET_AND_BRIEFED_SITE_SEMANTICS", () => {
  const adjacentCalls: string[] = [];
  const projected = projectCampaignCommandHexes({
    scenario: scenario(),
    formations: [],
    objectives: [objective("4,4")],
    knownSites: [knownSite(), knownSite({ id: "duplicate", locationHexKey: "0,0", label: "Duplicate" })],
    capabilitiesByHex: new Map(),
    authoredWaterHexes: new Set(["1,0"]),
    resolveLocation: location,
    resolveRedeployPreview: () => preview("hidden"),
    resolveRepairPreview: () => preview("hidden"),
    isAdjacentToEnemy: (hexKey) => {
      adjacentCalls.push(hexKey);
      return true;
    },
    formatLabel: (value) => value === "taskForce" ? "Task Force" : value === "region" ? "Region" : "Airbase",
    formatSegment: String
  });

  assert.equal(projected.length, 4, "a briefed site sharing an authored hex must not create a second map authority");
  assert.deepEqual(adjacentCalls, [], "bases, fleets, and opposing hexes must not request engagement adjacency");
  assert.deepEqual(projected[1], {
    hexKey: "1,0",
    location: location("1,0"),
    roleLabel: "Naval task force",
    controlLabel: "Friendly control",
    showEngagementAction: false,
    strategicGeography: { terrain: "Water", operationalFeatures: ["Task Force"] },
    displayLabel: "Allied Assault Fleet",
    summary: "Naval gunfire, transport, and logistics group on station supporting the established Normandy lodgment.",
    locationLabel: "English Channel · offshore support station · hex 1,0",
    hasContextActions: true,
    forces: ["Escort Group · 1"],
    capabilities: [],
    infrastructure: null,
    infrastructureRecovery: null,
    objectives: [],
    fronts: []
  });
  assert.deepEqual(projected[3], {
    hexKey: "4,4",
    location: location("4,4"),
    roleLabel: "Naval Base",
    controlLabel: "Friendly support network",
    displayLabel: "Briefed Port",
    summary: "Allied supporting harbor.",
    locationLabel: "Briefed Port",
    sourceLabel: "Theater briefing",
    historicalNetwork: ["Outer Roads"],
    strategicGeography: { terrain: "Water", operationalFeatures: ["Anchorage"] },
    hasContextActions: false,
    forces: [],
    capabilities: [],
    infrastructure: null,
    objectives: ["Objective 4,4"],
    fronts: ["Western Front"]
  });
});

registerTest("CAMPAIGN_COMMAND_HEX_PROJECTION_KEEPS_AXIAL_TERRAIN_AND_OFFSET_COMMAND_IDENTITY_DISTINCT", () => {
  const capabilities = ["Forward supply point"];
  const adjacencyCalls: string[] = [];
  const redeployCalls: string[] = [];
  const repairCalls: string[] = [];
  const nontrivialScenario: Pick<CampaignScenarioData, "tiles" | "tilePalette" | "fronts"> = {
    tilePalette: {
      friendlyPosition: {
        role: "region",
        factionControl: "Player",
        mapLabel: "Hill 112"
      }
    },
    tiles: [{
      tile: "friendlyPosition",
      hex: { q: 2, r: 1 },
      forces: [{ unitType: "infantry", count: 1, label: "Forward Battalion" }]
    }],
    fronts: [{
      key: "front-offset",
      label: "Odon Front",
      hexKeys: ["2,2"],
      edges: [],
      initiative: "Player"
    }]
  };
  const projected = projectCampaignCommandHexes({
    scenario: nontrivialScenario,
    formations: [],
    objectives: [objective("2,2")],
    knownSites: [],
    capabilitiesByHex: new Map([["2,2", capabilities]]),
    authoredWaterHexes: new Set(["2,1"]),
    resolveLocation: location,
    resolveRedeployPreview: (hexKey) => {
      redeployCalls.push(hexKey);
      return preview("available");
    },
    resolveRepairPreview: (hexKey) => {
      repairCalls.push(hexKey);
      return preview("available");
    },
    isAdjacentToEnemy: (hexKey) => {
      adjacencyCalls.push(hexKey);
      return true;
    },
    formatLabel: (value) => value === "region" ? "Region" : value,
    formatSegment: String
  });

  assert.deepEqual(adjacencyCalls, ["2,2"], "engagement truth must receive the operational offset identity");
  assert.deepEqual(redeployCalls, [], "a friendly non-base must not enter the base-action branch");
  assert.deepEqual(repairCalls, [], "a friendly non-base must not enter the reconstruction branch");
  assert.deepEqual(projected[0], {
    hexKey: "2,2",
    location: location("2,2"),
    roleLabel: "Region",
    controlLabel: "Friendly control",
    showEngagementAction: true,
    strategicGeography: { terrain: "Water", settlement: "Hill 112" },
    displayLabel: "Hill 112",
    summary: "Region under friendly control.",
    locationLabel: "Hill 112 · hex 2,2",
    hasContextActions: true,
    forces: ["Forward Battalion · 1"],
    capabilities: ["Forward supply point"],
    infrastructure: null,
    infrastructureRecovery: null,
    objectives: ["Objective 2,2"],
    fronts: ["Odon Front"]
  });
  assert.notEqual(projected[0]?.capabilities, capabilities, "the command view must detach capability storage");
  capabilities.push("Source mutation");
  assert.deepEqual(projected[0]?.capabilities, ["Forward supply point"]);
  (projected[0]?.capabilities as string[]).push("View mutation");
  assert.deepEqual(capabilities, ["Forward supply point", "Source mutation"]);
});

registerTest("CAMPAIGN_COMMAND_HEX_PROJECTION_EXPLAINS_INACTIVE_FRIENDLY_BASES", () => {
  const baseScenario = scenario();
  baseScenario.tiles.splice(1);
  baseScenario.tiles[0]!.infrastructure = undefined;
  const projected = projectCampaignCommandHexes({
    scenario: baseScenario,
    formations: [formation({ statusLabel: "In transit", currentOrderId: "order-1" })],
    objectives: [],
    knownSites: [],
    capabilitiesByHex: new Map(),
    authoredWaterHexes: new Set(),
    resolveLocation: location,
    resolveRedeployPreview: () => preview("blocked"),
    resolveRepairPreview: () => {
      throw new Error("an intact or absent facility must not request repair truth");
    },
    isAdjacentToEnemy: () => false,
    formatLabel: () => "Airbase",
    formatSegment: String
  });

  assert.equal(projected[0]?.showSelectionActions, false);
  assert.equal(projected[0]?.hasContextActions, false);
  assert.equal(projected[0]?.actionSummary, "All formations based here are committed or in transit. Review Orders before assigning another movement.");
});

registerTest("CAMPAIGN_COMMAND_HEX_PROJECTION_HAS_ONE_SOURCE_OWNER_AND_NO_STATE_OR_DOM_AUTHORITY", () => {
  const screen = readFileSync("src/ui/screens/CampaignScreen.ts", "utf8");
  const workspaceProjector = readFileSync("src/ui/campaign/CampaignCommandShellWorkspaceProjection.ts", "utf8");
  const projector = readFileSync("src/ui/campaign/CampaignCommandHexProjection.ts", "utf8");
  assert.equal((screen.match(/projectCampaignCommandShellWorkspaces\(\{/g) ?? []).length, 1);
  assert.equal((screen.match(/projectCampaignCommandHexes\(\{/g) ?? []).length, 0);
  assert.equal((workspaceProjector.match(/projectCampaignCommandHexes\(\{/g) ?? []).length, 1);
  assert.doesNotMatch(screen, /const baseActionSummary =|const projectedHexKeys = new Set\(hexes/);
  assert.match(projector, /export function projectCampaignCommandHexes/);
  assert.doesNotMatch(workspaceProjector, /CampaignState|campaignState|document\.|querySelector|addEventListener/);
  assert.doesNotMatch(projector, /CampaignState|campaignState|document\.|querySelector|addEventListener/);
  assert.equal((projector.match(/No movable formation is currently based here/g) ?? []).length, 1);
});
