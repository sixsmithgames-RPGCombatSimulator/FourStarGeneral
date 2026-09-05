/** Regression coverage for the shared authored campaign location grammar (FSG-CAM-007). */
import { strict as assert } from "node:assert";
import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import {
  projectCampaignAfterActionDecisionTargetId,
  projectCampaignAfterActionTitle,
  projectRuntimeHexKeyToCampaignOffset
} from "../src/ui/campaign/CampaignCommandProjection";
import {
  resolveCampaignLocationPresentation,
  resolveCampaignMapLocationPresentation,
  type CampaignLocationPresentationInput,
  type CampaignLocationUncertaintyInput
} from "../src/ui/campaign/CampaignLocationPresentation";
import { CampaignCommandViewAssembler } from "../src/ui/campaign/CampaignCommandViewAssembler";
import type { CampaignCommandShellView } from "../src/ui/campaign/CampaignCommandShell";
import { decorateCampaignOrderComposer, projectCampaignOrderLocationSummary } from "../src/ui/campaign/CampaignOrderExperience";
import { createCampaignContextInspector, renderCampaignContextInspector } from "../src/ui/campaign/components/CampaignContextInspector";
import { assertCampaignCommandDOMSafe } from "../src/ui/campaign/CampaignCommandInformationSafety";
import type { CampaignCommandSelection } from "../src/ui/campaign/CampaignCommandUIState";
import type { CampaignMapViewModel } from "../src/core/campaignIntelTypes";

registerTest("FSG_CAM_065_AAR_WITHOUT_GEOGRAPHY_NEVER_LEADS_WITH_COORDINATES", () => {
  assert.equal(
    projectCampaignAfterActionTitle("After action: 29,9", null, "29,9"),
    "After action: Operational sector"
  );
});

const locationCases: ReadonlyArray<{
  readonly name: string;
  readonly geography: Partial<CampaignLocationPresentationInput>;
  readonly expected: string;
}> = [
  { name: "PLACE", geography: { placeLabel: "Caen", objectiveLabel: "Secure Caen", frontLabel: "Juno-Sword Sector" }, expected: "Caen" },
  { name: "BASE", geography: { baseLabel: "RAF Tangmere" }, expected: "RAF Tangmere" },
  { name: "OBJECTIVE", geography: { objectiveLabel: "Secure the Orne crossings" }, expected: "Secure the Orne crossings" },
  { name: "APPROACH", geography: { approachLabel: "Bayeux approaches" }, expected: "Bayeux approaches" },
  { name: "FRONT", geography: { frontLabel: "Utah and Cotentin Airborne Sector" }, expected: "Utah and Cotentin Airborne Sector" },
  { name: "SECTOR", geography: { sectorLabel: "Omaha-Gold Sector" }, expected: "Omaha-Gold Sector" },
  { name: "THEATER_CONTEXT", geography: {}, expected: "Operation Overlord - Normandy Campaign" },
  { name: "BLANK_PLACE", geography: { placeLabel: " \t ", frontLabel: " Juno-Sword Sector " }, expected: "Juno-Sword Sector" },
  { name: "RAW_COORDINATE_NOT_PLACE", geography: { placeLabel: "29,23", objectiveLabel: "Hex 29,23", baseLabel: "Operational hex 29,23", approachLabel: "Grid 29,23", frontLabel: "Juno-Sword Sector" }, expected: "Juno-Sword Sector" }
];

locationCases.forEach(({ name, geography, expected }) => {
  registerTest(`FSG_CAM_063_AUTHORED_${name}_LEADS_GRID`, () => {
    const input = Object.freeze({ hexKey: "29,23", sectorLabel: "Operation Overlord - Normandy Campaign", ...geography });
    const location = resolveCampaignLocationPresentation(input);
    assert.deepEqual(location, { primaryLabel: expected, secondaryGridReference: "Grid 29,23" });
    assert.equal(input.hexKey, "29,23");
  });
});

const uncertaintyCases: readonly CampaignLocationUncertaintyInput[] = [
  { status: "current", confidenceBand: "high", radiusHexes: 0 },
  { status: "current", confidenceBand: "medium", radiusHexes: 0 },
  { status: "current", confidenceBand: "high", radiusHexes: 2 },
  { status: "stale", confidenceBand: "high", radiusHexes: 0 },
  { status: "disputed", confidenceBand: "low", radiusHexes: 3 },
  { status: "lost", confidenceBand: "low", radiusHexes: 4 }
];

uncertaintyCases.forEach((uncertainty, index) => {
  registerTest(`FSG_CAM_064_PUBLIC_UNCERTAINTY_${index}`, () => {
    const location = resolveCampaignLocationPresentation({
      hexKey: "29,23", placeLabel: "Caen", sectorLabel: "Juno-Sword Sector", uncertainty
    });
    assert.equal(location.primaryLabel, "Caen");
    assert.equal(location.secondaryGridReference, "Grid 29,23");
    if (index === 0) {
      assert.equal("uncertainty" in location, false);
    } else {
      assert.equal(location.uncertainty?.status, uncertainty.status);
      assert.equal(location.uncertainty?.confidenceBand, uncertainty.confidenceBand);
      assert.equal(location.uncertainty?.radiusHexes, uncertainty.radiusHexes);
      assert.ok(location.uncertainty?.label.includes(`${uncertainty.confidenceBand} confidence`));
      if (uncertainty.status === "lost") assert.match(location.uncertainty.label, /last reported/);
      if (uncertainty.status === "stale") assert.match(location.uncertainty.label, /Last reported/);
      if (uncertainty.status === "disputed") assert.match(location.uncertainty.label, /Disputed/);
    }
  });
});

registerTest("FSG_CAM_064_INVALID_GEOGRAPHY_IS_ACTIONABLE_AND_NEVER_INVENTED", () => {
  for (const hexKey of ["", "29", "29,23,1", "29,", "29.5,23", "NaN,23", "29, 23", "9007199254740992,23"]) {
    assert.throws(() => resolveCampaignLocationPresentation({ hexKey, sectorLabel: "Normandy" }), /grid reference is invalid.*Refresh the map/);
  }
  assert.throws(() => resolveCampaignLocationPresentation({ hexKey: "29,23", sectorLabel: " " }), /no authored place.*Supply the campaign's briefed sector/);
  for (const radiusHexes of [-1, NaN, Infinity]) {
    assert.throws(() => resolveCampaignLocationPresentation({
      hexKey: "29,23", sectorLabel: "Normandy", uncertainty: { status: "stale", confidenceBand: "low", radiusHexes }
    }), /uncertainty radius is invalid.*Refresh the intelligence assessment/);
  }
  assert.equal(resolveCampaignLocationPresentation({ hexKey: "-2,-3", sectorLabel: "Authored western sector" }).secondaryGridReference, "Grid -2,-3");
});

registerTest("FSG_CAM_064_RESOLVER_ALLOWS_ONLY_PRESENTATION_FIELDS", () => {
  const supplied = {
    hexKey: "29,23", sectorLabel: "Juno-Sword Sector", placeLabel: "Caen",
    hiddenForces: [{ name: "AXIS-HIDDEN-LOCATION-TRUTH" }],
    opposingTruth: { locationHexKey: "50,50" },
    uncertainty: { status: "stale" as const, confidenceBand: "low" as const, radiusHexes: 3, hiddenOrders: "AXIS-SECRET-ORDER" }
  };
  const location = resolveCampaignLocationPresentation(supplied);
  assert.equal(JSON.stringify(location).includes("AXIS"), false);
  assert.equal(JSON.stringify(location).includes("50,50"), false);
  assert.deepEqual(Object.keys(location).sort(), ["primaryLabel", "secondaryGridReference", "uncertainty"]);
  assert.deepEqual(Object.keys(location.uncertainty ?? {}).sort(), ["confidenceBand", "label", "radiusHexes", "status"]);
});

registerTest("FSG_CAM_065_AAR_NAMES_PRESERVE_REPORT_AND_NAVIGATION_IDENTITIES", () => {
  const location = resolveCampaignLocationPresentation({ hexKey: "29,23", placeLabel: "Caen", sectorLabel: "Normandy" });
  const cases = [
    { stored: "After action: 29,9", objective: null, expected: "After action: Caen" },
    { stored: "After action: 29,23", objective: null, expected: "After action: Caen" },
    { stored: "After action: Operational hex 29,23", objective: null, expected: "After action: Caen" },
    { stored: "After action: Secure the bridge", objective: "Secure the bridge", expected: "After action: Secure the bridge" },
    { stored: "After action: Counterattack at Caen", objective: null, expected: "After action: Counterattack at Caen" },
    { stored: "After action: 29,9", objective: "Secure the bridge", expected: "After action: Secure the bridge" }
  ];
  for (const entry of cases) {
    assert.equal(projectCampaignAfterActionTitle(entry.stored, entry.objective, "29,9", location), entry.expected);
  }
  assert.equal(projectRuntimeHexKeyToCampaignOffset("29,9"), "29,23");
  assert.equal(projectCampaignAfterActionDecisionTargetId("infrastructure", "29,9"), "29,23");
  assert.equal(projectCampaignAfterActionDecisionTargetId("formation", "formation-1"), "formation-1");
  assert.equal(projectCampaignAfterActionTitle("After action: 29,9", null, "bad-grid"), "After action: Operational sector");
  assert.throws(() => projectCampaignAfterActionTitle("After action: 29,9", null, "28,9", location), /does not match the recorded battle grid/);
});

function createView(): CampaignCommandShellView {
  const location = resolveCampaignLocationPresentation({ hexKey: "29,23", placeLabel: "Caen", sectorLabel: "Normandy" });
  return {
    theaterTitle: "Normandy", campaignPhase: "Opening", timeLabel: "Day 1", commandStatus: "Planning", saveStatus: "Saved",
    unreadReports: 0, resources: [], airPower: 0, navalPower: 0, intelligenceCapacity: "0/0", orders: [],
    advance: { mode: "nextReport", enabled: true, pauseAfterEveryResolution: false, summary: "Planning", alerts: [], timeline: [] },
    objectives: [{ key: "objective-1", label: "Secure Caen", status: "In progress", hexKey: "29,23" }],
    forces: [{ hexKey: "29,23", label: "3rd Infantry Division", count: 3 }, { hexKey: "30,23", label: "Reserve", count: 1 }],
    fronts: [{ key: "front-1", label: "Juno-Sword Sector", hexKeys: ["29,23"], targetHexKey: "29,23", initiativeLabel: "Friendly initiative" }],
    hexes: [{ hexKey: "29,23", roleLabel: "Town", controlLabel: "Friendly", forces: [], infrastructure: null, objectives: [], fronts: [], location }],
    formations: [{
      id: "formation-1", name: "3rd Infantry Division", typeLabel: "Infantry", ownershipLabel: "Core", locationHexKey: "29,23", statusLabel: "Ready",
      readiness: "90%", cohesion: "90%", fatigue: "10%", personnel: "100", equipment: "100", supply: "100", experience: "1 XP", honors: [],
      battles: 0, currentOrderId: "order-stable", latestHistory: null
    }],
    contacts: [{ id: "contact-1", label: "Assessed infantry", locationHexKey: "29,23", state: "stale", confidenceBand: "low", ageSegments: 2, uncertaintyRadius: 3, sourceLabels: ["Air reconnaissance"] }],
    afterActionReports: [{
      id: "aar-1", title: "After action: 29,23", timeLabel: "Day 1", result: "victory", resultLabel: "Victory", acknowledged: false, summary: "Area secured",
      location: "Operational hex 29,23", locationHexKey: "29,23", checkpointStatus: null, personnelLosses: "0", opponentLosses: "Unknown", resourcesSpent: "None", scoreChange: "0",
      operationalEffects: [], tacticalObjectives: [], formations: [], objectiveChanges: [], decisions: []
    }]
  };
}

registerTest("FSG_CAM_066_ASSEMBLER_SHARES_EXACT_AUTHORED_GEOGRAPHY_AND_PRESERVES_IDS", () => {
  const source = createView();
  const original = JSON.stringify(source);
  const assembled = new CampaignCommandViewAssembler().assemble(source);
  assert.equal(assembled.hexes?.[0].displayLabel, "Caen");
  assert.equal(assembled.forces[0].location?.primaryLabel, "Caen");
  assert.equal(assembled.forces[0].label, source.forces[0].label);
  assert.equal(assembled.forces[0].hexKey, "29,23");
  assert.equal(assembled.formations?.[0].location?.primaryLabel, "Caen");
  assert.equal(assembled.formations?.[0].id, "formation-1");
  assert.equal(assembled.formations?.[0].currentOrderId, "order-stable");
  assert.equal(assembled.objectives[0].location?.primaryLabel, "Caen");
  assert.equal(assembled.objectives[0].key, "objective-1");
  assert.equal(assembled.objectives[0].label, "Secure Caen");
  assert.equal(assembled.fronts?.[0].location?.primaryLabel, "Caen");
  assert.equal(assembled.fronts?.[0].key, "front-1");
  assert.equal(assembled.fronts?.[0].targetHexKey, "29,23");
  assert.equal(assembled.contacts?.[0].locationLabel, "Caen");
  assert.equal(assembled.contacts?.[0].id, "contact-1");
  assert.equal(assembled.contacts?.[0].location?.uncertainty?.status, "stale");
  assert.equal(assembled.contacts?.[0].location?.uncertainty?.radiusHexes, 3);
  assert.equal(assembled.afterActionReports?.[0].title, "After action: Caen");
  assert.equal(assembled.afterActionReports?.[0].location, "Caen · Grid 29,23");
  assert.equal(assembled.afterActionReports?.[0].id, "aar-1");
  assert.equal(assembled.afterActionReports?.[0].locationHexKey, "29,23");
  assert.equal(assembled.forces[1].location, undefined, "Adjacent cells must not inherit an invented nearest place");
  assert.equal(JSON.stringify(source), original);
  assert.ok(Object.isFrozen(assembled.forces[0].location));
  assert.ok(Object.isFrozen(assembled.contacts?.[0].location?.uncertainty));
  assert.notEqual(assembled.hexes?.[0].location, source.hexes?.[0].location);
});

registerTest("FSG_CAM_066_ASSEMBLER_UNLOCATED_LEGACY_VIEWS_REMAIN_RENDERABLE", () => {
  const source = { ...createView(), hexes: undefined };
  const assembled = new CampaignCommandViewAssembler().assemble(source);
  assert.deepEqual(assembled, source);
  assert.equal(assembled.contacts?.[0].location, undefined);
  const unsafeSource = { ...source, hiddenForces: ["AXIS-HIDDEN"] };
  assert.throws(() => new CampaignCommandViewAssembler().assemble(unsafeSource), /forbidden key 'hiddenForces'/);
});

registerTest("FSG_CAM_066_ASSEMBLER_PRESERVES_SEMANTIC_COMMAND_IDENTITIES", () => {
  const source = createView();
  const fleetLocation = resolveCampaignLocationPresentation({ hexKey: "29,23", placeLabel: "English Channel", sectorLabel: "Normandy" });
  const view = {
    ...source,
    hexes: source.hexes?.map((hex) => ({ ...hex, roleLabel: "Naval task force", displayLabel: "Western Naval Force", location: fleetLocation }))
  };
  const assembled = new CampaignCommandViewAssembler().assemble(view);
  assert.equal(assembled.hexes?.[0].displayLabel, "Western Naval Force");
  assert.equal(assembled.hexes?.[0].location?.primaryLabel, "English Channel");
  assert.equal(assembled.fronts?.[0].label, "Juno-Sword Sector");
  assert.equal(assembled.contacts?.[0].label, "Assessed infantry");
  assert.equal(assembled.forces[0].label, "3rd Infantry Division");
});

registerTest("FSG_CAM_067_ORDER_ROUTE_AND_COMPOSER_KEEP_GRID_SECONDARY", () => {
  const origin = resolveCampaignLocationPresentation({ hexKey: "24,10", placeLabel: "Southampton", sectorLabel: "Solent sector" });
  const target = resolveCampaignLocationPresentation({ hexKey: "29,23", placeLabel: "Caen", sectorLabel: "Normandy", uncertainty: { status: "disputed", confidenceBand: "low", radiusHexes: 2 } });
  const summary = projectCampaignOrderLocationSummary(target, origin);
  assert.equal(summary.primaryLabel, "Southampton → Caen");
  assert.equal(summary.secondaryGridReference, "Grid 24,10 → Grid 29,23");
  assert.match(summary.uncertaintyLabel ?? "", /Disputed position/);
  assert.equal(projectCampaignOrderLocationSummary(target).primaryLabel, "Caen");
  const form = document.createElement("form");
  decorateCampaignOrderComposer(form, "redeploy", summary);
  assert.equal(form.querySelector("header strong")?.textContent, "Southampton → Caen");
  assert.equal(form.querySelector("header small")?.textContent, "Grid 24,10 → Grid 29,23");
  assert.match(form.querySelector(".campaign-order-composer__uncertainty")?.textContent ?? "", /Disputed position/);
  decorateCampaignOrderComposer(form, "production", "Next daily allocation", true);
  assert.equal(form.querySelector("header strong")?.textContent, "Next daily allocation");
  assert.equal(form.querySelectorAll(".campaign-order-composer__guide").length, 1);
  assert.equal(form.querySelectorAll(".campaign-order-composer__grid").length, 0);
  assert.equal(form.querySelectorAll("[data-order-stage]").length, 7);
});

function renderInspector(view: CampaignCommandShellView, selection: CampaignCommandSelection): HTMLElement {
  const inspector = createCampaignContextInspector(document.createElement("div"));
  document.body.appendChild(inspector);
  renderCampaignContextInspector(inspector, view, selection);
  return inspector;
}

const inspectorSelections: ReadonlyArray<{ readonly selection: CampaignCommandSelection; readonly title: string }> = [
  { selection: { kind: "hex", id: "29,23" }, title: "Caen" },
  { selection: { kind: "objective", id: "objective-1" }, title: "Secure Caen" },
  { selection: { kind: "formation", id: "formation-1" }, title: "3rd Infantry Division" },
  { selection: { kind: "front", id: "front-1" }, title: "Juno-Sword Sector" },
  { selection: { kind: "contact", id: "contact-1" }, title: "Caen — Assessed infantry" },
  { selection: { kind: "report", id: "aar-1" }, title: "After action: Caen" }
];

inspectorSelections.forEach(({ selection, title }) => {
  registerTest(`FSG_CAM_067_INSPECTOR_${selection?.kind.toUpperCase()}_SHARES_AUTHORED_LOCATION`, () => {
    const view = new CampaignCommandViewAssembler().assemble(createView());
    const inspector = renderInspector(view, selection);
    assert.equal(inspector.querySelector("h2")?.textContent, title);
    assert.equal(inspector.dataset.routeIdentity, `${selection?.kind}:${selection?.id}`);
    assert.ok(inspector.textContent?.includes("Caen"));
    const gridFacts = [...inspector.querySelectorAll("dd")].filter((fact) => fact.textContent === "Grid 29,23");
    assert.equal(gridFacts.length, 1, "Every located route needs one subordinate grid fact");
    assert.equal(inspector.querySelector("h2")?.textContent?.includes("29,23"), false);
    const mapButton = inspector.querySelector<HTMLButtonElement>("[data-campaign-map-hex-target]");
    if (selection?.kind === "objective" || selection?.kind === "report") {
      assert.equal(mapButton?.dataset.campaignMapHexTarget, "29,23");
      assert.ok(mapButton?.textContent?.includes("Caen"));
      assert.equal(mapButton?.textContent?.includes("29,23"), false);
    }
    if (selection?.kind === "contact") {
      assert.ok(inspector.textContent?.includes(view.contacts?.[0].location?.uncertainty?.label ?? "missing uncertainty"));
    }
    assertCampaignCommandDOMSafe(inspector, ["AXIS-HIDDEN-LOCATION-TRUTH", "AXIS-SECRET-ORDER"]);
  });
});

registerTest("FSG_CAM_067_INSPECTOR_BASE_GRID_APPEARS_ONCE_WITHOUT_REPEATED_PLACE", () => {
  const source = createView();
  const location = resolveCampaignLocationPresentation({ hexKey: "29,23", placeLabel: "Portsmouth", sectorLabel: "Solent sector" });
  const view = new CampaignCommandViewAssembler().assemble({
    ...source,
    hexes: source.hexes?.map((hex) => ({
      ...hex, presentation: "friendlyBase", roleLabel: "Naval base", displayLabel: "Portsmouth", location,
      strategicGeography: { terrain: "Land", settlement: "Portsmouth" }
    }))
  });
  const inspector = renderInspector(view, { kind: "hex", id: "29,23" });
  const identity = inspector.querySelector(".campaign-context-inspector__identity");
  assert.equal(inspector.querySelector("h2")?.textContent, "Portsmouth");
  assert.equal(identity?.textContent?.split("Grid 29,23").length, 2);
  assert.equal([...identity?.querySelectorAll("dt") ?? []].some((fact) => ["Place", "Location"].includes(fact.textContent ?? "")), false);
  const formationButton = inspector.querySelector<HTMLButtonElement>("[data-campaign-formation-id]");
  if (formationButton) assert.equal(formationButton.dataset.campaignFormationId, "formation-1");
  renderCampaignContextInspector(inspector, view, { kind: "formation", id: "formation-1" });
  const backButton = inspector.querySelector<HTMLButtonElement>(".campaign-context-inspector__parent-route");
  assert.equal(backButton?.textContent, "Back to Portsmouth");
  assert.equal(backButton?.dataset.campaignMapHexTarget, "29,23");
});

registerTest("FSG_CAM_067_INSPECTOR_FLEET_PRESERVES_COMMAND_NAME_AND_SEPARATE_GEOGRAPHY", () => {
  const source = createView();
  const location = resolveCampaignLocationPresentation({ hexKey: "29,23", placeLabel: "English Channel", sectorLabel: "Normandy" });
  const view = new CampaignCommandViewAssembler().assemble({
    ...source,
    hexes: source.hexes?.map((hex) => ({
      ...hex, roleLabel: "Naval task force", displayLabel: "Western Naval Force", location,
      strategicGeography: { terrain: "Water", settlement: "English Channel" }
    }))
  });
  const inspector = renderInspector(view, { kind: "hex", id: "29,23" });
  assert.equal(inspector.querySelector("h2")?.textContent, "Western Naval Force");
  const facts = [...inspector.querySelectorAll("dd")].map((fact) => fact.textContent);
  assert.equal(facts.filter((fact) => fact === "English Channel").length, 1);
  assert.equal(facts.filter((fact) => fact === "Grid 29,23").length, 1);
  assert.equal(inspector.dataset.routeIdentity, "hex:29,23");
});

registerTest("FSG_CAM_067_INSPECTOR_ORDER_ROUTE_NAMES_LEAD_EXACT_GRIDS", () => {
  const source = createView();
  const view = new CampaignCommandViewAssembler().assemble({
    ...source,
    orders: [{ id: "order-stable", kind: "redeploy", label: "Redeploy formation", detail: "Southampton → Caen", routeSummary: "Southampton → Caen", status: "draft", eta: null, validationMessages: [], canRemove: true, canCancel: false, mapHexKeys: ["24,10", "29,23"] }],
    hexes: [...source.hexes ?? [], {
      hexKey: "24,10", roleLabel: "Port", controlLabel: "Friendly", forces: [], infrastructure: null, fronts: [], objectives: [],
      location: resolveCampaignLocationPresentation({ hexKey: "24,10", placeLabel: "Southampton", sectorLabel: "Solent sector" })
    }]
  });
  const inspector = renderInspector(view, { kind: "order", id: "order-stable" });
  const facts = [...inspector.querySelectorAll("dd")].map((fact) => fact.textContent);
  assert.ok(facts.includes("Southampton → Caen"));
  assert.ok(facts.includes("Grid 24,10 → Grid 29,23"));
  assert.equal(inspector.dataset.routeIdentity, "order:order-stable");
  assert.deepEqual(view.orders[0].mapHexKeys, ["24,10", "29,23"]);
});

registerTest("FSG_CAM_067_INSPECTOR_KNOWN_SITE_AND_UNKNOWN_HEX_STAY_PLAYER_SAFE", () => {
  const view: CampaignCommandShellView = {
    ...createView(),
    knownSites: [{
      id: "briefed-port", label: "Brest fortress-port", locationHexKey: "5,34", roleLabel: "Naval base", categoryLabel: "Known opposing installation",
      summary: "Briefed port; present garrison unconfirmed.", sourceLabel: "Allied operational maps", locationPrecision: "sector", relatedLocations: [],
      location: resolveCampaignLocationPresentation({ hexKey: "5,34", placeLabel: "Brest", sectorLabel: "Normandy" })
    }]
  };
  const inspector = renderInspector(view, { kind: "hex", id: "5,34" });
  assert.equal(inspector.querySelector("h2")?.textContent, "Brest");
  assert.ok(inspector.textContent?.includes("Grid 5,34"));
  assert.equal(inspector.querySelector<HTMLElement>(".campaign-context-inspector__action-footer")?.hidden, true);
  renderCampaignContextInspector(inspector, view, { kind: "hex", id: "30,23" });
  assert.equal(inspector.querySelector("h2")?.textContent?.includes("30,23"), false);
  assert.equal(inspector.textContent?.includes("Caen"), false, "Unknown adjacent hex must not inherit Caen");
});

function createMapView(): CampaignMapViewModel {
  return {
    observerFaction: "Player", enemyContacts: [], coverage: [], capacity: { total: 0, committed: 0, available: 0 }, unreadReportCount: 0, currentSegment: 0,
    scenario: {
      key: "location-test", title: "Normandy", description: "Authored test geography", dimensions: { cols: 58, rows: 50 }, background: { imageUrl: "" },
      tilePalette: { caen: { role: "region", factionControl: "Neutral", mapLabel: "Caen", geography: { terrain: "land", placeName: "Caen" } } },
      tiles: [{ tile: "caen", hex: { q: 29, r: 9 } }], fronts: [], objectives: [], economies: []
    }
  };
}

registerTest("FSG_CAM_063_MAP_LOOKUP_MATCHES_AUTHORED_CELL_WITHOUT_NEAREST_INFERENCE", () => {
  const view = createMapView();
  const before = JSON.stringify(view);
  assert.deepEqual(resolveCampaignMapLocationPresentation(view, "29,23"), { primaryLabel: "Caen", secondaryGridReference: "Grid 29,23" });
  assert.deepEqual(resolveCampaignMapLocationPresentation(view, "30,23"), { primaryLabel: "Normandy", secondaryGridReference: "Grid 30,23" });
  assert.deepEqual(resolveCampaignMapLocationPresentation(null, "29,23"), { primaryLabel: "Operational sector", secondaryGridReference: "Grid 29,23" });
  assert.equal(JSON.stringify(view), before);
});

registerTest("FSG_CAM_063_MAP_LOOKUP_FLEET_COMMAND_IS_NOT_A_PLACE", () => {
  const view = createMapView();
  view.scenario.tilePalette.caen = { role: "taskForce", factionControl: "Player", mapLabel: "Western Naval Force" };
  view.scenario.fronts = [{ key: "front", label: "Western assault sector", initiative: "Player", hexKeys: ["29,23"] }];
  assert.equal(resolveCampaignMapLocationPresentation(view, "29,23").primaryLabel, "Western assault sector");
  view.scenario.fronts = [];
  assert.equal(resolveCampaignMapLocationPresentation(view, "29,23").primaryLabel, "Normandy");
  view.scenario.tilePalette.caen.geography = { terrain: "water", placeName: "English Channel" };
  assert.equal(resolveCampaignMapLocationPresentation(view, "29,23").primaryLabel, "English Channel");
});

registerTest("FSG_CAM_064_MAP_LOOKUP_CONTACT_RETAINS_PUBLIC_UNCERTAINTY", () => {
  const location = resolveCampaignMapLocationPresentation(createMapView(), "29,23", { status: "lost", confidenceBand: "low", radiusHexes: 3 });
  assert.equal(location.primaryLabel, "Caen");
  assert.match(location.uncertainty?.label ?? "", /Contact lost; last reported position/);
  assert.equal(location.uncertainty?.radiusHexes, 3);
});
