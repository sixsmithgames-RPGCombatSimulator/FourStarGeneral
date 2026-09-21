import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import type { CampaignFormationRecord } from "../src/game/campaign/formations/campaignFormationTypes";
import { projectCampaignFormationRoster } from "../src/ui/campaign/CampaignFormationRosterProjection";

function formation(
  id: string,
  overrides: Partial<CampaignFormationRecord> = {}
): CampaignFormationRecord {
  return {
    id,
    faction: "Player",
    ownership: "core",
    name: "Persisted placeholder",
    campaignUnitType: "Infantry_42",
    formationKey: "infantry",
    equipmentPackageKey: "standard",
    locationHexKey: "0,0",
    status: "ready",
    personnel: {
      rifle: { fit: 90, injured: 2, wounded: 3, severelyWounded: 1, killed: 4 },
      support: { fit: 10, injured: 0, wounded: 0, severelyWounded: 0, killed: 0 }
    },
    equipment: {
      armor: { operational: 8, damaged: 1, disabled: 1, destroyed: 2 },
      transport: { operational: 4, damaged: 0, disabled: 0, destroyed: 0 }
    },
    readiness: 82.6,
    cohesion: 74.4,
    fatigue: 19.5,
    supply: { ammo: 7, fuel: 6, rations: 5, parts: 4 },
    experience: { base: 5, earned: 7, battles: 3 },
    commanderId: null,
    honors: [{
      id: `${id}:honor`, honorKey: "steadfast", name: "Steadfast", awardedSegment: 4,
      engagementId: "engagement-1", citation: "Held the line."
    }],
    battleHistory: [{
      id: `${id}:history`, type: "battle", segment: 4, summary: "Held the line.",
      engagementId: "engagement-1", fromHexKey: null, toHexKey: null
    }],
    currentOrderId: null,
    createdSegment: 0,
    retiredSegment: null,
    origin: {
      kind: "authored",
      initialHexKey: "0,0",
      legacyGroupIndex: 0,
      legacyOrdinal: 0,
      legacyLabel: "U.S. 4th Infantry Division battalions"
    },
    ...overrides
  };
}

registerTest("CAMPAIGN_FORMATION_ROSTER_PROJECTS_DETACHED_PLAYER_SAFE_COMMAND_ROWS", async ({ Given, When, Then }) => {
  const ready = formation("ready-formation");
  const scheduled = formation("scheduled-formation", {
    status: "unavailable",
    locationHexKey: null,
    availableFromSegment: 8,
    origin: {
      kind: "authored",
      initialHexKey: null,
      legacyGroupIndex: 1,
      legacyOrdinal: 0,
      legacyLabel: "U.S. 2nd Infantry Division advance groups"
    }
  });
  const shattered = formation("shattered-formation", {
    status: "shattered",
    locationHexKey: "2,0",
    equipment: {},
    origin: {
      kind: "authored",
      initialHexKey: "2,0",
      legacyGroupIndex: 2,
      legacyOrdinal: 1,
      legacyLabel: "U.S. 4th Infantry Division battalions"
    }
  });
  const capacity = formation("capacity-record", {
    origin: {
      kind: "legacyAggregate",
      initialHexKey: "0,0",
      legacyGroupIndex: 3,
      legacyOrdinal: 0,
      legacyLabel: "Western embarkation supply columns"
    }
  });
  const source = [ready, scheduled, shattered, capacity];
  const before = JSON.stringify(source);
  const historyCalls: string[] = [];
  const locationCalls: string[] = [];
  let projected: ReturnType<typeof projectCampaignFormationRoster> = [];

  await Given("persistent formations spanning ready, scheduled, recovery, and capacity-only records", () => {});

  await When("the command-shell formation roster is projected through detached presentation callbacks", () => {
    projected = projectCampaignFormationRoster({
      formations: source,
      fronts: [{ key: "front-edge", hexKeys: [], edges: [{ opposingHexKey: "0,0" }] }],
      objectives: [{ key: "objective-1", hexKey: "0,0", status: "In progress" }],
      formatSegment: (segment) => `Segment ${segment}`,
      resolveLocation: (hexKey) => {
        locationCalls.push(hexKey);
        return { primaryLabel: `Location ${hexKey}`, secondaryGridReference: `Grid ${hexKey}` };
      },
      resolveHistory: (record) => {
        historyCalls.push(record.id);
        return `History ${record.id}`;
      }
    });
  });

  await Then("identity, posture, condition, placement, history, and exclusions remain exact without mutating inputs", () => {
    assert.equal(JSON.stringify(source), before);
    assert.deepEqual(projected.map((entry) => entry.id), ["ready-formation", "scheduled-formation", "shattered-formation"]);
    assert.deepEqual(projected[0], {
      id: "ready-formation",
      name: "1st Battalion, 8th Infantry Regiment",
      commandLabel: "8th Infantry Regiment",
      hasAuthoredSubordinateIdentity: true,
      typeLabel: "Infantry battalion",
      ownershipLabel: "Core",
      locationHexKey: "0,0",
      location: { primaryLabel: "Location 0,0", secondaryGridReference: "Grid 0,0" },
      operationalFrontKey: "front-edge",
      objectiveKey: "objective-1",
      statusLabel: "Ready now",
      postureKey: "ready",
      canReceiveOrders: true,
      recoveryActionVisible: false,
      blockingReason: null,
      availabilityLabel: null,
      readiness: "83%",
      cohesion: "74%",
      fatigue: "20%",
      personnel: "100 fit / 106 present · 4 lost",
      equipment: "12 / 16 operational",
      supply: "Ammo 7 · Fuel 6 · Rations 5 · Parts 4",
      experience: "12 XP",
      honors: ["Steadfast"],
      battles: 3,
      currentOrderId: null,
      latestHistory: "History ready-formation"
    });
    assert.deepEqual({
      name: projected[1]?.name,
      locationHexKey: projected[1]?.locationHexKey,
      statusLabel: projected[1]?.statusLabel,
      postureKey: projected[1]?.postureKey,
      availabilityLabel: projected[1]?.availabilityLabel,
      latestHistory: projected[1]?.latestHistory
    }, {
      name: "2d Infantry Division",
      locationHexKey: null,
      statusLabel: "Scheduled arrival",
      postureKey: "scheduledArrival",
      availabilityLabel: "Segment 8",
      latestHistory: "Scheduled to become available Segment 8."
    });
    assert.deepEqual({
      name: projected[2]?.name,
      locationHexKey: projected[2]?.locationHexKey,
      statusLabel: projected[2]?.statusLabel,
      postureKey: projected[2]?.postureKey,
      recoveryActionVisible: projected[2]?.recoveryActionVisible,
      canReceiveOrders: projected[2]?.canReceiveOrders,
      equipment: projected[2]?.equipment,
      latestHistory: projected[2]?.latestHistory
    }, {
      name: "2d Battalion, 8th Infantry Regiment",
      locationHexKey: "2,1",
      statusLabel: "Shattered",
      postureKey: "recovering",
      recoveryActionVisible: true,
      canReceiveOrders: false,
      equipment: "No vehicle pool",
      latestHistory: "History shattered-formation"
    });
    assert.deepEqual(historyCalls, ["ready-formation", "shattered-formation"]);
    assert.deepEqual(locationCalls, ["0,0", "2,1"]);
    (ready.honors[0] as { name: string }).name = "Mutated after projection";
    assert.deepEqual(projected[0]?.honors, ["Steadfast"]);
  });
});
