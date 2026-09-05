/** Pure safe-view decision contracts for FSG-CAM-003 and FSG-CAM-005. */
import assert from "node:assert/strict";
import { registerTest } from "./harness";
import type { CampaignCommandFormationView, CampaignCommandContactView, CampaignCommandIntelBriefView } from "../src/ui/campaign/CampaignCommandShell";
import { projectCampaignForcesWorkspace, projectCampaignIntelligenceWorkspace, type CampaignForceFilter } from "../src/ui/campaign/CampaignWorkspaceProjection";

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
