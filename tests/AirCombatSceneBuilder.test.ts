import { registerTest } from "./harness.js";
import { buildResolvedAirCombatScene } from "../src/ui/airshow/ResolvedAirCombatSceneBuilder";
import type { AirEngagementEvent } from "../src/game/GameEngine";

registerTest("AIRCOMBATSCENEBUILDER_FLAGS_LINKED_ESCORTS_MISSING_FROM_RESOLVED_EVENT_AND_DOES_NOT_INJECT_THEM", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof buildResolvedAirCombatScene> | null = null;

  const event: AirEngagementEvent = {
    type: "airToAir",
    missionId: "strike-1",
    location: { q: 2, r: 2 },
    bomber: { faction: "Bot", unitKey: "bomber-1", unitType: "Bomber", strength: 100 },
    interceptors: [{ faction: "Player", unitKey: "cap-1", unitType: "Interceptor", strength: 100 }],
    escorts: [],
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 72,
    bomberDestroyed: false,
    bomberPassExchanges: [],
    escortExchanges: []
  };

  await Given("a linked escort context that is absent from the resolved event", async () => {});

  await When("the resolved air combat scene is built", async () => {
    result = buildResolvedAirCombatScene(event, {
      locKey: "2,2",
      resolveOriginKey: (unitKey) => (unitKey === "cap-1" ? "0,0" : unitKey === "bomber-1" ? "7,7" : null),
      resolveStrength: () => 100,
      linkedEscortFlights: [{ unitKey: "escort-1", originKey: "6,7", unitType: "Fighter", faction: "Bot", strength: 100 }],
      bomberOriginKey: "7,7",
      includeBomber: true
    });
  });

  await Then("the scene should report the mismatch instead of inventing the escort", async () => {
    if (!result) {
      throw new Error("Expected a built scene result.");
    }
    if (result.scene.escorts.length !== 0) {
      throw new Error(`Expected no escorts in the scene when the event omitted them, saw ${result.scene.escorts.length}.`);
    }
    if (!result.diagnostics.linkedEscortMissingFromEventUnitKeys.includes("escort-1")) {
      throw new Error(`Expected diagnostics to flag escort-1 as missing from the event, saw ${JSON.stringify(result.diagnostics)}.`);
    }
  });
});

registerTest("AIRCOMBATSCENEBUILDER_MARKS_CAP_CLASH_OPPOSITION_AS_CAP_NOT_ESCORT", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof buildResolvedAirCombatScene> | null = null;

  const event: AirEngagementEvent = {
    type: "capClash",
    missionId: "cap-1",
    location: { q: 3, r: 3 },
    bomber: { faction: "Bot", unitKey: "cap-placeholder", unitType: "Fighter", strength: 100 },
    interceptors: [{ faction: "Player", unitKey: "pcap-1", unitType: "Fighter", strength: 100 }],
    escorts: [{ faction: "Bot", unitKey: "bcap-1", unitType: "Fighter", strength: 100 }],
    bomberDestroyed: false,
    escortExchanges: [],
    bomberPassExchanges: []
  };

  await Given("a CAP-vs-CAP engagement event", async () => {});

  await When("the resolved scene is built", async () => {
    result = buildResolvedAirCombatScene(event, {
      locKey: "3,3",
      resolveOriginKey: () => "0,0",
      resolveStrength: () => 100,
      includeBomber: false
    });
  });

  await Then("the opposing CAP should remain marked as CAP in diagnostics and scene metadata", async () => {
    if (!result) {
      throw new Error("Expected a built scene result.");
    }
    if (result.scene.bomber !== null) {
      throw new Error("Did not expect a bomber in a CAP clash scene.");
    }
    const escortFlight = result.scene.escorts[0];
    if (!escortFlight || escortFlight.combatRole !== "cap") {
      throw new Error(`Expected escort-side CAP flight to keep combatRole=cap, saw ${JSON.stringify(escortFlight)}.`);
    }
    if (!result.diagnostics.oppositionCapFlightUnitKeys.includes("bcap-1")) {
      throw new Error(`Expected diagnostics to flag the opposition render side as CAP, saw ${JSON.stringify(result.diagnostics)}.`);
    }
  });
});
