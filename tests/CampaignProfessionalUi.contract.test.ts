/**
 * Red-first contracts for the professional campaign-map and inspector overhaul.
 *
 * Each case owns one audit issue at its lowest practical automated layer. These
 * tests intentionally fail against the pre-overhaul product and must not be
 * weakened into markup-presence checks merely to make the suite green.
 */

import "./domEnvironment.js";
import { readFileSync } from "node:fs";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";
import { CampaignMapRenderer } from "../src/rendering/CampaignMapRenderer";
import { resolveCampaignFormationPresentation } from "../src/game/campaign/formations/CampaignFormationPresentation";
import {
  createCampaignContextInspector,
  renderCampaignContextInspector
} from "../src/ui/campaign/components/CampaignContextInspector";
import type {
  CampaignCommandFormationView,
  CampaignCommandHexView,
  CampaignCommandShellView
} from "../src/ui/campaign/CampaignCommandShell";

function readWorkspaceSource(path: string): string {
  return readFileSync(path, "utf8");
}

function formation(
  id: string,
  statusLabel: string,
  overrides: Partial<CampaignCommandFormationView> = {}
): CampaignCommandFormationView {
  return {
    id,
    name: `Formation ${id}`,
    commandLabel: `Command ${id}`,
    hasAuthoredSubordinateIdentity: true,
    typeLabel: "Infantry battalion",
    ownershipLabel: "Core",
    locationHexKey: "2,2",
    statusLabel,
    readiness: "75%",
    cohesion: "80%",
    fatigue: "10%",
    personnel: "700 fit / 750 present",
    equipment: "20 / 24 operational",
    supply: "Ammo 80 · Fuel 80 · Rations 80 · Parts 80",
    experience: "10 XP",
    honors: [],
    battles: 0,
    currentOrderId: null,
    latestHistory: null,
    ...overrides
  };
}

function shellView(hex: CampaignCommandHexView, formations: readonly CampaignCommandFormationView[]): CampaignCommandShellView {
  return {
    theaterTitle: "Operation Overlord",
    campaignPhase: "D+1 lodgment",
    timeLabel: "D+1 · 7 June 1944, 00:00–03:00",
    commandStatus: "Planning",
    saveStatus: "Saved",
    unreadReports: 0,
    resources: [],
    objectives: [],
    forces: [],
    formations,
    hexes: [hex],
    airPower: 0,
    navalPower: 0,
    intelligenceCapacity: "Available",
    orders: [],
    advance: {
      mode: "nextReport",
      enabled: true,
      pauseAfterEveryResolution: false,
      summary: "Advance to the next report.",
      alerts: [],
      timeline: []
    }
  };
}

function inspectorFixture(): { inspector: HTMLElement; workspace: HTMLElement } {
  const workspace = document.createElement("aside");
  workspace.innerHTML = `
    <section class="selection-section"><button type="button">Move or embark formations</button></section>
    <section class="action-section" hidden><button type="button">Queue engagement</button></section>
  `;
  const inspector = createCampaignContextInspector(workspace);
  document.body.replaceChildren(inspector);
  return { inspector, workspace };
}

registerTest("FSG_CAM_034_BASE_COMPOSITION_HAS_ONE_IDENTITY_AND_ONE_SELECTION_OWNER", async ({ Given, When, Then }) => {
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  document.body.replaceChildren(canvas);
  const baseHex = CoordinateSystem.offsetToAxial(1, 1);
  const scenario: CampaignScenarioData = {
    key: "one-base-owner",
    title: "One Base Owner",
    description: "A base has one authoritative visual and interaction owner.",
    dimensions: { cols: 3, rows: 3 },
    background: { imageUrl: "about:blank" },
    tilePalette: {
      base: { role: "logisticsHub", factionControl: "Player", mapLabel: "Southampton", spriteKey: "logisticsHub" }
    },
    tiles: [{
      tile: "base",
      hex: baseHex,
      forces: [{ unitType: "Infantry_42", count: 2, label: "British Second Army" }]
    }],
    fronts: [], objectives: [], economies: []
  };
  const renderer = new CampaignMapRenderer();

  await Given("one friendly base with assigned formations", () => {
    renderer.render(svg, canvas, {
      observerFaction: "Player",
      scenario,
      enemyContacts: [],
      knownStrategicSites: [],
      coverage: [],
      capacity: { total: 0, committed: 0, available: 0 },
      unreadReportCount: 0,
      currentSegment: 0
    });
  });
  await When("the base is selected", () => renderer.highlightHex("1,1", "selected"));
  await Then("the installation marker owns its sprite, hit target, and restrained selected state", () => {
    const marker = svg.querySelector<SVGGElement>('.campaign-base-marker[data-hex="1,1"]');
    const duplicateInstallation = svg.querySelector('.campaign-sprite[data-hex="1,1"]');
    const hex = svg.querySelector('.campaign-hex[data-hex="1,1"]');
    if (!marker
      || marker.querySelector(".campaign-base-marker__badge")
      || duplicateInstallation
      || !marker.classList.contains("is-selected")
      || marker.getAttribute("aria-current") !== "location"
      || !hex?.classList.contains("entity-selected")
      || marker.querySelectorAll(".campaign-map-selection-locator").length !== 1) {
      throw new Error(`Base composition still has competing owners: ${svg.outerHTML}`);
    }
  });
});

registerTest("FSG_CAM_035_SELECTABLE_FORMATIONS_REJECT_ROUTE_AND_DESTINATION_ALIASES", async ({ Given, When, Then }) => {
  const presentations = [
    resolveCampaignFormationPresentation({ legacyLabel: "Solent supply columns", legacyOrdinal: 0, unitType: "Supply_Truck" }),
    resolveCampaignFormationPresentation({ legacyLabel: "Gold and Juno follow-on battalion groups", legacyOrdinal: 0, unitType: "Infantry_42" })
  ];
  await Given("legacy logistics and reinforcement aggregates", () => {});
  await When("their player-facing identities are resolved", () => {});
  await Then("no selectable identity is coined from a route, destination, or aggregate function", () => {
    const prohibited = /cross-channel|embarkation|gold|juno|sword|utah|omaha|reinforcement group|supply columns/i;
    const invalid = presentations.filter((entry) => prohibited.test(`${entry.formationName} ${entry.commandLabel}`));
    if (invalid.length > 0) {
      throw new Error(`Route/destination aliases still masquerade as formations: ${JSON.stringify(invalid)}.`);
    }
  });
});

registerTest("FSG_CAM_038_RERENDER_RESTORES_SELECTED_MAP_PRESENTATION", async ({ Given, When, Then }) => {
  const source = readWorkspaceSource("src/ui/screens/CampaignScreen.ts");
  const start = source.indexOf("private renderCampaignMap(): void");
  const end = source.indexOf("private setCampaignMapScope", start);
  const method = source.slice(start, end);
  await Given("a campaign render path that rebuilds the SVG", () => {});
  await When("the post-render presentation restoration contract is inspected", () => {});
  await Then("selection, origin, and front state are reapplied through one explicit restore step", () => {
    if (!/restoreCampaignMapPresentation(?:State)?\s*\(/.test(method)) {
      throw new Error("renderCampaignMap still rebuilds the SVG without one explicit post-render presentation-state restore.");
    }
  });
});

registerTest("FSG_CAM_039_SELECTED_HEX_EXPLAINS_STRATEGIC_GEOGRAPHY_BEFORE_UNITS_AND_ORDERS", async ({ Given, When, Then }) => {
  const { inspector } = inspectorFixture();
  const hex = {
    hexKey: "2,2",
    roleLabel: "Forward position",
    controlLabel: "Friendly control",
    displayLabel: "Sainte-Mère-Église",
    summary: "A crossroads controlling the northern approach.",
    strategicGeography: {
      landform: "Bocage",
      settlement: "Sainte-Mère-Église",
      roads: ["N13 road"],
      railways: ["Cherbourg–Carentan railway"]
    },
    forces: ["82d Airborne Division"],
    infrastructure: null,
    objectives: [],
    fronts: []
  } as unknown as CampaignCommandHexView;
  await Given("a selected map cell with authored terrain, town, road, and railway facts", () => {});
  await When("the context inspector renders the hex", () => {
    renderCampaignContextInspector(inspector, shellView(hex, []), { kind: "hex", id: "2,2" });
  });
  await Then("the commander can read those strategic features before occupant and action detail", () => {
    const text = inspector.textContent?.replace(/\s+/g, " ") ?? "";
    if (!text.includes("Sainte-Mère-Église")
      || !text.includes("Bocage")
      || !text.includes("N13 road")
      || !text.includes("Cherbourg–Carentan railway")) {
      throw new Error(`Strategic geography is still absent from the selected-hex contract: ${text}`);
    }
  });
});

registerTest("FSG_CAM_040_REMOTE_SUPPORT_LOCATIONS_DO_NOT_HIDE_INSIDE_ONE_BASE_HEX", async ({ Given, When, Then }) => {
  const scenario = structuredClone(campaignScenarioData) as CampaignScenarioData;
  const independentlyRequired = new Set([
    "Weymouth", "Poole", "Torbay", "Dartmouth", "Falmouth", "Fowey",
    "Newhaven", "Shoreham", "Upottery", "Merryfield"
  ]);
  await Given("support places known to lie beyond one local ten-kilometer base cell", () => {});
  await When("the complete theater registration is inspected", () => {});
  await Then("each is an independent selectable site or an explicitly non-geolocated theater region", () => {
    const selectable = new Set([
      ...scenario.tiles.map((tile) => scenario.tilePalette[tile.tile]?.mapLabel ?? ""),
      ...(scenario.briefedStrategicSites ?? []).map((site) => site.label),
      ...(scenario.briefedStrategicRegions ?? []).flatMap((region) => region.locations)
    ]);
    const missing = [...independentlyRequired].filter((place) => !selectable.has(place));
    if (missing.length > 0) {
      throw new Error(`Remote facilities remain crammed into another base hex: ${missing.join(", ")}.`);
    }
  });
});

registerTest("FSG_CAM_042_BASE_INSPECTOR_CLASSIFIES_EVERY_FORMATION_STATUS_HONESTLY", async ({ Given, When, Then }) => {
  const { inspector } = inspectorFixture();
  const hex: CampaignCommandHexView = {
    hexKey: "2,2",
    roleLabel: "Logistics and embarkation",
    controlLabel: "Friendly control",
    presentation: "friendlyBase",
    displayLabel: "Southampton",
    summary: "Second Army embarkation port.",
    forces: [], infrastructure: null, objectives: [], fronts: []
  };
  const formations = [
    formation("ready", "Ready"),
    formation("committed", "Committed", { currentOrderId: "order-1" }),
    formation("transit", "In transit"),
    formation("arriving", "Unavailable", { availabilityLabel: "D+2 · 00:00" }),
    formation("refitting", "Refitting"),
    formation("isolated", "Isolated"),
    formation("shattered", "Shattered")
  ];
  await Given("a base containing every material formation lifecycle state", () => {});
  await When("the base inspector groups its assigned commands", () => {
    renderCampaignContextInspector(inspector, shellView(hex, formations), { kind: "hex", id: "2,2" });
  });
  await Then("ready, committed, transit, arrival, and recovery remain distinct", () => {
    const groups = Array.from(inspector.querySelectorAll<HTMLElement>("[data-formation-group]"))
      .map((group) => `${group.dataset.formationGroup}:${group.querySelector("h4")?.textContent ?? ""}`);
    const text = groups.join("|");
    if (!/ready:Ready now \(1\)/.test(text)
      || !/committed:Committed \(1\)/.test(text)
      || !/transit:In transit \(1\)/.test(text)
      || !/arriving:Arriving here \(1\)/.test(text)
      || !/recovering:Recovering or unavailable \(3\)/.test(text)
      || /Committed or in transit/.test(text)) {
      throw new Error(`Formation states remain collapsed into misleading groups: ${text}`);
    }
  });
});

registerTest("FSG_CAM_043_FORMATION_DRILLDOWN_PRESERVES_BASE_ORDER_CONTEXT", async ({ Given, When, Then }) => {
  const { inspector } = inspectorFixture();
  const hex: CampaignCommandHexView = {
    hexKey: "2,2",
    roleLabel: "Logistics and embarkation",
    controlLabel: "Friendly control",
    presentation: "friendlyBase",
    displayLabel: "Southampton",
    summary: "Second Army embarkation port.",
    showSelectionActions: true,
    forces: [], infrastructure: null, objectives: [], fronts: []
  };
  const assigned = formation("unit-1", "Ready", { name: "50th (Northumbrian) Infantry Division" });
  const view = shellView(hex, [assigned]);
  await Given("a base with one ready formation and one legal movement order", () => {
    renderCampaignContextInspector(inspector, view, { kind: "hex", id: "2,2" });
  });
  await When("the player drills into the formation", () => {
    renderCampaignContextInspector(inspector, view, { kind: "formation", id: assigned.id });
  });
  await Then("a fixed back route and the applicable Orders context remain immediately available", () => {
    const route = inspector.querySelector<HTMLElement>("#campaignContextInspectorRoute");
    const back = route?.querySelector<HTMLButtonElement>("[data-campaign-map-hex-target='2,2']");
    const footer = inspector.querySelector<HTMLElement>(".campaign-context-inspector__action-footer");
    if (!back
      || route?.firstElementChild !== back
      || footer?.hidden
      || !footer?.textContent?.includes("Move or embark formations")) {
      throw new Error(`Formation drill-down abandoned its base order workflow: ${inspector.outerHTML}`);
    }
  });
});

registerTest("FSG_CAM_044_BLOCKED_RECONSTRUCTION_REASON_OWNS_THE_BASE_ACTION_SUMMARY", async ({ Given, When, Then }) => {
  const source = readWorkspaceSource("src/ui/screens/CampaignScreen.ts");
  const start = source.indexOf("const baseActionSummary");
  const end = source.indexOf("const capabilities", start);
  const projection = source.slice(start, end);
  await Given("a damaged friendly installation whose reconstruction action is blocked", () => {});
  await When("the base action-summary projection is inspected", () => {});
  await Then("the repair reason and corrective action outrank generic movement fallback copy", () => {
    if (!/repairPreview\?\.reason/.test(projection)
      || !/repairPreview\?\.correctiveAction/.test(projection)) {
      throw new Error("The base action summary can still discard a relevant reconstruction blocker in favor of generic movement copy.");
    }
  });
});

registerTest("FSG_CAM_045_PLAYER_SURFACES_DO_NOT_RENDER_STORED_FORMATION_NAMES_DIRECTLY", async ({ Given, When, Then }) => {
  const screenSource = readWorkspaceSource("src/ui/screens/CampaignScreen.ts");
  await Given("a restored campaign whose stored formation name may contain a retired aggregate alias", () => {});
  await When("campaign planners, histories, and summaries are inspected", () => {});
  await Then("every player-facing surface routes identity through the central presentation contract", () => {
    const unsafe = [
      /<strong>\$\{this\.escapeHtml\(formation\.name\)\}<\/strong>/,
      /\.map\(\(formation\) => `\$\{formation\.name\}/
    ].filter((pattern) => pattern.test(screenSource));
    if (unsafe.length > 0) {
      throw new Error(`Stored formation.name still reaches ${unsafe.length} player-facing campaign surface(s) directly.`);
    }
  });
});
