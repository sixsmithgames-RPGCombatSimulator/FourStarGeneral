/** Pure safe-view decision contracts for FSG-CAM-003 and FSG-CAM-005. */
import "./domEnvironment";
import assert from "node:assert/strict";
import { registerTest } from "./harness";
import type { CampaignCommandFormationView, CampaignCommandContactView, CampaignCommandIntelBriefView, CampaignCommandOrderView } from "../src/ui/campaign/CampaignCommandShell";
import { projectCampaignForcesWorkspace, projectCampaignIntelligenceWorkspace, type CampaignForceFilter } from "../src/ui/campaign/CampaignWorkspaceProjection";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { CampaignState } from "../src/state/CampaignState";
import { InMemoryCampaignSaveBackend } from "../src/game/campaign/persistence/CampaignSaveBackend";
import { projectCampaignFormationPosture } from "../src/game/campaign/formations/CampaignFormationPosture";
import { resolveCampaignFormationRecordPresentation } from "../src/game/campaign/formations/CampaignFormationPresentation";
import { projectRuntimeHexKeyToCampaignOffset } from "../src/ui/campaign/CampaignCommandProjection";
import { resolveCampaignMapLocationPresentation } from "../src/ui/campaign/CampaignLocationPresentation";

function formation(id: string, changes: Partial<CampaignCommandFormationView> = {}): CampaignCommandFormationView {
  return {
    id, name: `Formation ${id}`, commandLabel: "VII Corps", typeLabel: "Infantry", ownershipLabel: "Player",
    locationHexKey: "1,1", location: { primaryLabel: "Carentan", secondaryGridReference: "Grid 1,1" },
    statusLabel: "Ready", postureKey: "ready", canReceiveOrders: true, readiness: "91%", cohesion: "90%", fatigue: "10%",
    personnel: "650 fit / 700 present", equipment: "8 / 10 operational", supply: "Ammo 50", experience: "20 XP", honors: [], battles: 0,
    currentOrderId: null, latestHistory: null, ...changes
  };
}

function contact(id: string, changes: Partial<CampaignCommandContactView> = {}): CampaignCommandContactView {
  return {
    id, label: `Reported formation ${id}`, locationHexKey: "4,4",
    location: { primaryLabel: "Caen approaches", secondaryGridReference: "Grid 4,4" },
    sectorLabel: "Caen sector", priority: "notable", threatLabel: "Reported armor",
    state: "current", confidenceBand: "high", ageSegments: 0, uncertaintyRadius: 0, sourceLabels: ["Air reconnaissance"], ...changes
  };
}

function brief(id: string, changes: Partial<CampaignCommandIntelBriefView> = {}): CampaignCommandIntelBriefView {
  return { id, title: "Assessment changed", detail: "Armor reported on the approach.", timeLabel: "Day 2, dawn", segment: 9, read: false, kind: "upgraded", contactId: "armor", ...changes };
}

function movement(changes: Partial<CampaignCommandOrderView> = {}): CampaignCommandOrderView {
  return {
    id: "move-1", kind: "redeploy", label: "Redeploy formation", detail: "Portland → Exeter · Truck",
    status: "committed", eta: "ETA D+1 · 7 June 1944, 03:00–06:00", routeSummary: "Portland → Exeter · 2 hex",
    mapHexKeys: ["14,10", "15,9"], validationMessages: [], canRemove: false, canCancel: true, ...changes
  };
}

/** Recreates the audited movement through real draft/commit APIs with an exact formation identity. */
function committedMovement(): { state: CampaignState; formationId: string; orderId: string; origin: string; destination: string } {
  const state = new CampaignState({ saveBackend: new InMemoryCampaignSaveBackend(), legacyStorage: null });
  state.setScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
  const map = state.getCampaignMapView("Player");
  assert.ok(map);
  const locationKey = (label: string): string => {
    const tile = map.scenario.tiles.find((entry) => map.scenario.tilePalette[entry.tile]?.mapLabel === label);
    assert.ok(tile, `The shipped campaign needs the authored ${label} location.`);
    const key = projectRuntimeHexKeyToCampaignOffset(`${tile.hex.q},${tile.hex.r}`);
    assert.ok(key);
    return key;
  };
  const origin = locationKey("Portland");
  const destination = locationKey("Exeter");
  const selected = state.getCampaignRedeployAvailableFormations(origin).find((entry) => entry.campaignUnitType === "Infantry_42");
  assert.ok(selected, "Portland needs its ready follow-on infantry formation.");
  const draft = state.createRedeployDraft(origin, destination, [{ unitType: selected.campaignUnitType, count: 1 }], "truck", undefined, [selected.id]);
  assert.ok(draft.ok, draft.ok ? "" : draft.reason);
  assert.equal(draft.order.kind, "redeploy");
  if (draft.order.kind !== "redeploy") throw new Error("The movement fixture must produce a redeployment order.");
  assert.equal(draft.order.payload.distance, 2);
  assert.equal(draft.order.payload.fuelCost, 6);
  assert.equal(draft.order.payload.suppliesCost, 4);
  assert.equal(draft.order.payload.etaSegment, state.getRuntimeSnapshot()!.currentSegment + 1);
  const committed = state.commitCampaignOrders([draft.order.id]);
  assert.ok(committed.ok);
  assert.equal(committed.committedCount, 1);
  return { state, formationId: selected.id, orderId: draft.order.id, origin, destination };
}

/** Supplies only the existing shell contract from public state views and shared presentation resolvers. */
function movementView(state: CampaignState, formationId: string): Parameters<typeof projectCampaignForcesWorkspace>[0] {
  const map = state.getCampaignMapView("Player");
  const record = state.getCampaignFormationRoster("Player").find((entry) => entry.id === formationId);
  assert.ok(record);
  const posture = projectCampaignFormationPosture(record);
  assert.ok(posture.posture === "ready" || posture.posture === "inTransit", "This fixture covers movement and arrival/cancellation only.");
  const presentation = resolveCampaignFormationRecordPresentation(record);
  const locationHexKey = projectRuntimeHexKeyToCampaignOffset(record.locationHexKey);
  const orders = state.getCampaignOrders().filter((order) => order.faction === "Player").flatMap((order): CampaignCommandOrderView[] => {
    if (order.kind !== "redeploy") return [];
    const origin = resolveCampaignMapLocationPresentation(map, order.payload.originOffsetKey).primaryLabel;
    const destination = resolveCampaignMapLocationPresentation(map, order.payload.destinationOffsetKey).primaryLabel;
    return [movement({
      id: order.id, status: order.status,
      detail: `${origin} → ${destination} · ${order.payload.transportModeKey}`,
      routeSummary: `${origin} → ${destination} · ${order.payload.distance} hex`,
      mapHexKeys: order.targetHexKeys.slice(),
      eta: `ETA ${state.segmentToTimeDisplay(order.payload.etaSegment)}`
    })];
  });
  return {
    formations: [formation(record.id, {
      name: presentation.formationName, commandLabel: presentation.commandLabel, locationHexKey,
      location: locationHexKey === null ? undefined : resolveCampaignMapLocationPresentation(map, locationHexKey),
      postureKey: posture.posture, statusLabel: posture.label, canReceiveOrders: posture.canReceiveOrders,
      currentOrderId: record.currentOrderId, blockingReason: posture.blockingReason, readiness: `${record.readiness}%`
    })],
    forces: [], objectives: [], orders
  };
}

registerTest("FSG_CAM_070_FORCES_COMMITTED_REDEPLOYMENT_RETAINS_NAMED_ROUTE_ETA_AND_EXACT_IDENTITY", async ({ Given, When, Then }) => {
  const { state, formationId, orderId, origin, destination } = committedMovement();
  const view = movementView(state, formationId);
  const beforeProjection = state.getRuntimeSnapshot();
  const input = Object.freeze({ ...view, formations: Object.freeze([...view.formations!, ...view.formations!]) });
  await Given("the real Portland-to-Exeter truck order is committed exactly once, before any advance", () => {
    assert.equal(beforeProjection!.orders[orderId].status, "committed");
    assert.equal(view.formations![0].currentOrderId, orderId);
    assert.equal(view.formations![0].locationHexKey, null);
    assert.equal(view.formations![0].name, "First U.S. Army");
    assert.equal(state.getCampaignRedeployAvailableFormations(origin).some((entry) => entry.id === formationId), false);
    assert.equal(state.getCampaignRedeployAvailableFormations(destination).some((entry) => entry.id === formationId), false);
  });
  await When("Forces searches origin, destination, command, status, and the exact persistent ID", () => {
    for (const query of ["Portland", "Exeter", "First U.S. Army", "Portland Exeter in transit", formationId]) {
      const result = projectCampaignForcesWorkspace(input, { query, filter: "inTransit" });
      assert.equal(result.totalCount, 1);
      assert.equal(result.matchingCount, 1, query);
      assert.equal(result.groups.length, 1);
      const group = result.groups[0];
      assert.match(group.key, /^transit:/);
      assert.equal(group.label, "In transit · Portland → Exeter · 2 hex");
      assert.equal(group.readyCount, 0);
      assert.equal(group.formationCount, 1);
      const row = group.commands[0].rows[0];
      assert.equal(row.id, formationId);
      assert.equal(row.selectionKind, "formation");
      assert.equal(row.locationLabel, group.label);
      assert.equal(row.gridReference, "No map position assigned");
      assert.equal(row.transitEta, "ETA D+1 · 7 June 1944, 03:00–06:00");
      assert.equal(row.availability, null, "Arrival ETA must not promise readiness or permission to give orders.");
      assert.equal(row.statusLabel, "In transit");
      assert.equal(row.blockingReason, view.formations![0].blockingReason);
    }
  });
  await Then("Forces does not invent map presence, readiness, or another record and does not mutate authoritative state", () => {
    assert.equal(projectCampaignForcesWorkspace(input, { filter: "ready" }).matchingCount, 0);
    assert.equal(projectCampaignForcesWorkspace(input).activeCount, 0);
    assert.deepEqual(state.getRuntimeSnapshot(), beforeProjection);
  });
});

registerTest("FSG_CAM_070_FORCES_REDEPLOYMENT_ARRIVAL_AND_CANCELLATION_REMOVE_TRANSIT_COPY", async ({ Given, When, Then }) => {
  const arrived = committedMovement();
  const cancelled = committedMovement();
  await Given("two independent committed movement fixtures share the audited route", () => {});
  await When("one movement reaches Exeter and the other is cancelled before execution", () => {
    const advanced = arrived.state.advanceSegment();
    assert.ok(advanced.ok);
    const cancellation = cancelled.state.cancelCampaignOrder(cancelled.orderId);
    assert.ok(cancellation.ok);
  });
  await Then("each current formation appears once at its actual location with no retained route or ETA", () => {
    for (const [fixture, expectedPlace, oldPlace, expectedKey] of [
      [arrived, "Exeter", "Portland", arrived.destination],
      [cancelled, "Portland", "Exeter", cancelled.origin]
    ] as const) {
      const view = movementView(fixture.state, fixture.formationId);
      assert.equal(view.formations![0].currentOrderId, null);
      assert.equal(view.formations![0].locationHexKey, expectedKey);
      const result = projectCampaignForcesWorkspace(view, { query: fixture.formationId });
      assert.equal(result.totalCount, 1);
      assert.equal(result.groups[0].label, expectedPlace);
      assert.equal(result.groups[0].readyCount, 1);
      const row = result.groups[0].commands[0].rows[0];
      assert.equal(row.locationLabel, expectedPlace);
      assert.equal(row.gridReference, `Grid ${expectedKey}`);
      assert.equal(row.transitEta, undefined);
      assert.equal(row.blockingReason, null);
      assert.equal(projectCampaignForcesWorkspace(view, { filter: "inTransit" }).matchingCount, 0);
      assert.equal(projectCampaignForcesWorkspace(view, { query: oldPlace }).matchingCount, 0);
    }
  });
});

registerTest("FSG_CAM_070_FORCES_TRANSIT_USES_ONLY_ITS_ACTIVE_ORDER_WITHOUT_INFERRING_POSITION", async ({ Given, When, Then }) => {
  const transit = formation("moving", { postureKey: "inTransit", statusLabel: "In transit", canReceiveOrders: false, currentOrderId: "move-1" });
  // A stale recorded location is deliberately supplied: transit posture still forbids map presence.
  const view = { formations: [transit], forces: [], objectives: [], fronts: [{ key: "front", label: "Carentan front", hexKeys: ["1,1"], initiativeLabel: "Friendly" }] };
  await Given("a moving formation has a stale departure location and unrelated or filed order records", () => {});
  await When("the exact order is missing, not a movement, or not active", () => {
    const invalidOrders = [
      undefined, [], [movement({ id: "another-order" })], [movement({ kind: "production" })],
      ...(["draft", "conflict", "completed", "cancelled"] as const).map((status) => [movement({ status })])
    ];
    for (const orders of invalidOrders) {
      const result = projectCampaignForcesWorkspace({ ...view, orders }, { filter: "inTransit" });
      const row = result.groups[0].commands[0].rows[0];
      assert.equal(result.activeCount, 0);
      assert.equal(result.groups[0].label, "In transit · Route not reported");
      assert.equal(row.gridReference, "No map position assigned");
      assert.equal(row.transitEta, undefined);
      assert.equal(projectCampaignForcesWorkspace({ ...view, orders }, { query: "Exeter" }).matchingCount, 0);
    }
  });
  await Then("executing orders retain the supplied route and explicit front association but never create readiness", () => {
    const orders = [movement({ id: "other", routeSummary: "SECRET unrelated route" }), movement({ status: "executing", eta: null })];
    const result = projectCampaignForcesWorkspace({ ...view, formations: [{ ...transit, operationalFrontKey: "front" }], orders });
    assert.equal(result.activeCount, 1);
    assert.equal(result.groups[0].label, "Carentan front");
    assert.equal(result.groups[0].readyCount, 0);
    assert.equal(result.groups[0].commands[0].rows[0].locationLabel, "In transit · Portland → Exeter · 2 hex");
    assert.equal(result.groups[0].commands[0].rows[0].transitEta, undefined);
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
    const missingRoute = projectCampaignForcesWorkspace({ ...view, orders: [movement({ routeSummary: undefined })] }, { filter: "inTransit" });
    assert.equal(missingRoute.groups[0].label, "In transit · Route not reported");
    assert.equal(missingRoute.groups[0].commands[0].rows[0].transitEta, movement().eta);
  });
});

registerTest("FSG_CAM_068_FORCES_ACTIVE_OPERATIONS_GROUP_COMMANDS_WITHOUT_ROSTER_LOSS", async ({ Given, When, Then }) => {
  const roster = [formation("one"), formation("two"), formation("objective", { locationHexKey: "2,2", commandLabel: "V Corps", location: { primaryLabel: "Omaha lodgment", secondaryGridReference: "Grid 2,2" } }), formation("reserve", { locationHexKey: "9,9", commandLabel: "Theater reserve", location: { primaryLabel: "Portsmouth", secondaryGridReference: "Grid 9,9" } })];
  let result: ReturnType<typeof projectCampaignForcesWorkspace>;
  await Given("two formations share a front command, one holds an objective, and one is in the rear", () => {});
  await When("Forces opens without a search or status filter", () => {
    result = projectCampaignForcesWorkspace({ formations: roster, forces: [{ hexKey: "1,1", label: "Legacy duplicate", count: 999 }], fronts: [{ key: "front", label: "Carentan front", hexKeys: ["1,1"], initiativeLabel: "Friendly" }], objectives: [{ key: "beach", label: "Hold Omaha", status: "In progress", hexKey: "2,2" }] });
  });
  await Then("named active operations lead, commands are counted once, and the entire theater retains all four", () => {
    assert.deepEqual(result.groups.map((group) => group.label), ["Carentan front", "Hold Omaha"]);
    assert.equal(result.groups[0].commandCount, 1);
    assert.equal(result.groups[0].formationCount, 2);
    assert.equal(result.groups[0].readyCount, 2);
    assert.equal(result.totalCount, 4);
    assert.equal(result.activeCount, 3);
    assert.equal(result.theaterGroups.length, 3);
    assert.equal(JSON.stringify(result).includes("Legacy duplicate"), false);
    assert.equal(result.groups[0].commands[0].rows[0].strength, "650 fit / 700 present");
    assert.equal(result.groups[0].commands[0].rows[0].equipment, "8 / 10 operational");
  });
});

registerTest("FSG_CAM_069_FORCES_SEARCH_AND_EVERY_POSTURE_REACH_ENTIRE_THEATER", async ({ Given, When, Then }) => {
  const roster = [
    formation("ready", { name: "Dorset Infantry", commandLabel: "Southern Command", locationHexKey: "8,8", location: { primaryLabel: "Portsmouth", secondaryGridReference: "Grid 8,8" } }),
    formation("committed", { postureKey: "committed", canReceiveOrders: false, statusLabel: "Committed" }),
    formation("assigned", { postureKey: "assigned", canReceiveOrders: false, statusLabel: "Assigned" }),
    formation("transit", { postureKey: "inTransit", canReceiveOrders: false, statusLabel: "In transit", locationHexKey: null }),
    formation("arriving", { postureKey: "scheduledArrival", canReceiveOrders: false, statusLabel: "Scheduled arrival", locationHexKey: null, availabilityLabel: "Day 3, dawn" }),
    formation("recovering", { postureKey: "recovering", canReceiveOrders: false, statusLabel: "Recovering" })
  ];
  const view = { formations: roster, forces: [], objectives: [], fronts: [] };
  const ids = (filter: CampaignForceFilter, query = ""): string[] => projectCampaignForcesWorkspace(view, { filter, query }).groups.flatMap((group) => group.commands.flatMap((command) => command.rows.map((row) => row.id))).sort();
  await Given("ready reserves, committed assets, unplaced transit and arrivals, and recovering formations", () => {});
  await When("the commander searches command, formation, and named location together", () => {
    assert.deepEqual(ids("all", " southern  DORSET Portsmouth "), ["ready"]);
    assert.deepEqual(ids("ready"), ["ready"]);
    assert.deepEqual(ids("committed"), ["assigned", "committed"]);
    assert.deepEqual(ids("inTransit"), ["transit"]);
    assert.deepEqual(ids("arriving"), ["arriving"]);
    assert.deepEqual(ids("recovering"), ["recovering"]);
  });
  await Then("rear and unplaced records remain discoverable, and empty active operations do not expose arbitrary reserves", () => {
    const result = projectCampaignForcesWorkspace(view);
    assert.equal(result.groups.length, 0);
    assert.equal(result.totalCount, roster.length);
    assert.equal(result.theaterGroups.flatMap((group) => group.commands.flatMap((command) => command.rows)).length, roster.length);
    assert.equal(projectCampaignForcesWorkspace(view, { query: "Missing command" }).matchingCount, 0);
  });
});

registerTest("FSG_CAM_070_FORCES_RESPECT_AUTHORITATIVE_ORDER_ELIGIBILITY_AND_SAFE_INPUT", async ({ Given, When, Then }) => {
  const blocked = { ...formation("blocked", { readiness: "100%", canReceiveOrders: false, blockingReason: "Held by a committed operation." }), hiddenOpponentState: "SECRET" };
  Object.freeze(blocked);
  const roster = Object.freeze([blocked, blocked]);
  await Given("a perfectly fit formation is blocked and appears twice in a read-only safe roster", () => {});
  await When("the player asks for ready formations", () => {
    const result = projectCampaignForcesWorkspace({ formations: roster, forces: [], objectives: [] }, { filter: "ready" });
    assert.equal(result.totalCount, 1);
    assert.equal(result.matchingCount, 0);
  });
  await Then("the projection neither invents readiness nor copies uncontracted fields or mutates the source", () => {
    const result = projectCampaignForcesWorkspace({ formations: roster, forces: [], objectives: [] });
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
    assert.equal(blocked.readiness, "100%");
    assert.equal(blocked.blockingReason, "Held by a committed operation.");
    const emptyRoster = projectCampaignForcesWorkspace({ formations: [], forces: [{ hexKey: "1,1", label: "Old aggregate", count: 20 }], objectives: [] });
    assert.equal(emptyRoster.totalCount, 0);
    const aggregate = projectCampaignForcesWorkspace({ forces: [{ hexKey: "1,1", label: "Old aggregate", count: 20 }], objectives: [] }, { filter: "ready" });
    assert.equal(aggregate.matchingCount, 0);
  });
});

registerTest("FSG_CAM_072_INTELLIGENCE_BRIEFING_GROUPS_CHANGES_WITH_READ_HISTORY", async ({ Given, When, Then }) => {
  const event = brief("material", { materiallyChanged: true, segment: 10 });
  let result: ReturnType<typeof projectCampaignIntelligenceWorkspace>;
  await Given("a new critical contact, material assessment change, duplicate event, and read history", () => {});
  await When("headquarters receives the safe persisted briefing", () => {
    result = projectCampaignIntelligenceWorkspace({
      contacts: [contact("armor"), contact("urgent", { priority: "critical", sectorLabel: "Carentan sector", threatLabel: "Reported counterattack" })],
      intelligenceBriefs: [brief("history", { read: true, segment: 1 }), event, event, brief("new", { contactId: "urgent", kind: "new", segment: 11 })],
      intelligenceUnreadReports: 2
    });
  });
  await Then("priority leads named sector/threat groups, only unread changes lead, and exact read history is retained", () => {
    assert.equal(result.unreadCount, 2);
    assert.equal(result.canMarkRead, true);
    assert.deepEqual(result.briefing.map((group) => group.sectorLabel), ["Carentan sector", "Caen sector"]);
    assert.equal(result.briefing[0].priority, "critical");
    assert.equal(result.briefing[0].reports[0].changeLabel, "New contact");
    assert.equal(result.briefing[1].reports[0].changeLabel, "Material change");
    assert.equal(result.briefing.flatMap((group) => group.reports).length, 2);
    assert.deepEqual(result.history.map((report) => report.id), ["history"]);
  });
});

registerTest("FSG_CAM_073_INTELLIGENCE_CURRENCY_UNCERTAINTY_AND_PRIORITY_STAY_TRUTHFUL", async ({ Given, When, Then }) => {
  const contacts = [contact("current"), contact("stale", { state: "stale", ageSegments: 5 }), contact("disputed", { state: "disputed", confidenceBand: "low", uncertaintyRadius: 3, priority: "critical" }), contact("lost", { state: "lost", ageSegments: 10 })];
  const ids = (currency: "all" | "current" | "stale" | "disputed" | "lost", uncertainty: "all" | "uncertain" | "precise", priority: "all" | "critical" = "all"): string[] => projectCampaignIntelligenceWorkspace({ contacts }, { currency, uncertainty, priority }).contacts.flatMap((group) => group.contacts.map((entry) => entry.id)).sort();
  await Given("reports distinguish current, stale, disputed, and lost contacts, including an old exact position", () => {});
  await When("currency, confidence, and priority are filtered independently", () => {
    assert.deepEqual(ids("current", "all"), ["current"]);
    assert.deepEqual(ids("stale", "all"), ["stale"]);
    assert.deepEqual(ids("lost", "all"), ["lost"]);
    assert.deepEqual(ids("all", "uncertain", "critical"), ["disputed"]);
    assert.deepEqual(ids("all", "precise"), ["current"]);
  });
  await Then("an exact old grid is still uncertain, and no rendering invents updated strength or position", () => {
    const result = projectCampaignIntelligenceWorkspace({ contacts });
    const stale = result.contacts.flatMap((group) => group.contacts).find((entry) => entry.id === "stale")!;
    assert.equal(stale.uncertain, true);
    assert.equal(stale.ageLabel, "15h since observation");
    assert.equal(stale.gridReference, "Grid 4,4");
    assert.equal(stale.strengthLabel, "Strength unknown");
  });
});

registerTest("FSG_CAM_074_INTELLIGENCE_READ_STATE_NEVER_USES_UNRELATED_REPORTS_OR_HIDDEN_TRUTH", async ({ Given, When, Then }) => {
  const authorized = Object.freeze({ ...contact("armor"), hiddenEnemyStrength: "SECRET" });
  const event = Object.freeze(brief("unread", { contactId: "no-longer-authorized" }));
  await Given("an unread event references a contact absent from the currently authorized projection", () => {});
  await When("the briefing is projected without looking up hidden data", () => {
    const result = projectCampaignIntelligenceWorkspace({ contacts: [authorized], intelligenceBriefs: [event], intelligenceUnreadReports: 1 });
    assert.equal(result.briefing[0].reports[0].contactId, null);
    assert.equal(JSON.stringify(result).includes("SECRET"), false);
    assert.equal(event.read, false);
  });
  await Then("zero intelligence unread overrides retained event flags and archive content, with no active mark-read action", () => {
    const calm = projectCampaignIntelligenceWorkspace({ contacts: [authorized], intelligenceBriefs: [event, brief("history", { read: true })], intelligenceUnreadReports: 0 });
    assert.equal(calm.canMarkRead, false);
    assert.equal(calm.briefing.length, 0);
    assert.equal(calm.history.length, 1);
    const incomplete = projectCampaignIntelligenceWorkspace({ contacts: [authorized], intelligenceBriefs: [], intelligenceUnreadReports: 2 });
    assert.equal(incomplete.unmatchedUnreadCount, 2);
    assert.equal(incomplete.canMarkRead, false);
  });
});
