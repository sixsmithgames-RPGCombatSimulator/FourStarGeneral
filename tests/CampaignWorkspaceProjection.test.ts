/** Pure safe-view decision contracts for FSG-CAM-003 and FSG-CAM-005. */
import assert from "node:assert/strict";
import { registerTest } from "./harness";
import type { CampaignCommandFormationView } from "../src/ui/campaign/CampaignCommandShell";
import { projectCampaignForcesWorkspace, type CampaignForceFilter } from "../src/ui/campaign/CampaignWorkspaceProjection";

function formation(id: string, changes: Partial<CampaignCommandFormationView> = {}): CampaignCommandFormationView {
  return {
    id, name: `Formation ${id}`, commandLabel: "VII Corps", typeLabel: "Infantry", ownershipLabel: "Player",
    locationHexKey: "1,1", location: { primaryLabel: "Carentan", secondaryGridReference: "Grid 1,1" },
    statusLabel: "Ready", postureKey: "ready", canReceiveOrders: true, readiness: "91%", cohesion: "90%", fatigue: "10%",
    personnel: "650 fit / 700 present", equipment: "8 / 10 operational", supply: "Ammo 50", experience: "20 XP", honors: [], battles: 0,
    currentOrderId: null, latestHistory: null, ...changes
  };
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
