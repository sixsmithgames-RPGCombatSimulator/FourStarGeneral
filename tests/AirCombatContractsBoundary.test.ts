import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type * as CompatibleAirCombat from "../src/game/GameEngine";
import type * as CanonicalAirCombat from "../src/game/battle/air/AirCombatContracts";
import { buildResolvedAirShowFlakBursts } from "../src/ui/airshow/ResolvedAirCombatSceneBuilder";
import { registerTest } from "./harness.js";

const AIRSHOW_CONSUMERS = [
  "src/ui/airshow/AirShowPlaybackCapture.ts",
  "src/ui/airshow/ClusterAirPlaybackPlanner.ts",
  "src/ui/airshow/ResolvedAirCombatSceneBuilder.ts"
] as const;

const AIR_COMBAT_DECLARATIONS = [
  "AirMissionStatus",
  "AirMissionResult",
  "AirMissionOutcomeBase",
  "AirMissionOutcome",
  "SerializedAirMission",
  "AirMissionArrival",
  "AirCombatExchangeEntry",
  "FlakEngagementEntry",
  "AirEngagementEvent"
] as const;

type ExactType<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? (<Value>() => Value extends Right ? 1 : 2) extends
      (<Value>() => Value extends Left ? 1 : 2)
      ? true
      : false
    : false;

type AssertExact<Left, Right> = ExactType<Left, Right> extends true ? true : never;

const AIR_COMBAT_COMPATIBILITY: readonly [
  AssertExact<CanonicalAirCombat.AirMissionStatus, CompatibleAirCombat.AirMissionStatus>,
  AssertExact<CanonicalAirCombat.AirMissionResult, CompatibleAirCombat.AirMissionResult>,
  AssertExact<CanonicalAirCombat.AirMissionOutcomeBase, CompatibleAirCombat.AirMissionOutcomeBase>,
  AssertExact<CanonicalAirCombat.AirMissionOutcome, CompatibleAirCombat.AirMissionOutcome>,
  AssertExact<CanonicalAirCombat.SerializedAirMission, CompatibleAirCombat.SerializedAirMission>,
  AssertExact<CanonicalAirCombat.AirMissionArrival, CompatibleAirCombat.AirMissionArrival>,
  AssertExact<CanonicalAirCombat.AirCombatExchangeEntry, CompatibleAirCombat.AirCombatExchangeEntry>,
  AssertExact<CanonicalAirCombat.FlakEngagementEntry, CompatibleAirCombat.FlakEngagementEntry>,
  AssertExact<CanonicalAirCombat.AirEngagementEvent, CompatibleAirCombat.AirEngagementEvent>
] = [true, true, true, true, true, true, true, true, true];

function declarationPattern(name: string, exported: boolean): RegExp {
  return new RegExp(
    `^\\s*${exported ? "export\\s+" : "(?:export\\s+)?"}(?:interface|type)\\s+${name}(?:\\s*[={])`,
    "mu"
  );
}

function flakEvent(): CanonicalAirCombat.AirEngagementEvent {
  return {
    type: "flak",
    missionId: "strike-1",
    location: { q: 4, r: -1 },
    bomber: {
      faction: "Player",
      unitKey: "bomber-1",
      unitType: "Aircraft_USA_B17",
      strength: 10
    },
    interceptors: [
      { faction: "Bot", unitKey: "flak-1", unitType: "Flak_88", hex: { q: 2, r: -1 } },
      { faction: "Bot", unitKey: "flak-2", unitType: "Flak_88", hex: { q: 3, r: -1 } }
    ],
    escorts: [],
    flakEngagements: [
      {
        batteryFaction: "Bot",
        batteryUnitKey: "flak-1",
        batteryUnitType: "Flak_88",
        batteryHex: { q: 2, r: -1 },
        bomberFaction: "Player",
        bomberUnitKey: "bomber-1",
        bomberUnitType: "Aircraft_USA_B17",
        bomberStrengthBefore: 10,
        bomberStrengthAfter: 9,
        damageToBomber: 1,
        bomberDestroyed: false
      },
      {
        batteryFaction: "Bot",
        batteryUnitKey: "flak-2",
        batteryUnitType: "Flak_88",
        batteryHex: { q: 3, r: -1 },
        bomberFaction: "Player",
        bomberUnitKey: "bomber-1",
        bomberUnitType: "Aircraft_USA_B17",
        bomberStrengthBefore: 9,
        bomberStrengthAfter: 8,
        damageToBomber: 1,
        bomberDestroyed: false
      }
    ]
  };
}

registerTest("AIR_COMBAT_CONTRACT_IS_THE_ONLY_AIRSHOW_ENGINE_BOUNDARY", async ({ Given, When, Then }) => {
  const sources = new Map(AIRSHOW_CONSUMERS.map((file) => [file, readFileSync(file, "utf8")]));

  await Given("the three production air-show consumers and the canonical air-combat contract", () => {});
  await When("their source dependency boundaries are inspected", () => {});
  await Then("every consumer imports the cycle-free contract and none imports GameEngine", () => {
    for (const [file, source] of sources) {
      assert.match(source, /game\/battle\/air\/AirCombatContracts/iu, `${file} must use the canonical contract`);
      assert.doesNotMatch(source, /from\s+["'][^"']*game\/GameEngine["']/iu, `${file} must not import GameEngine`);
    }
  });
  await Then("GameEngine and the sidebar facade retain compatibility only through re-export", () => {
    const gameEngineSource = readFileSync("src/game/GameEngine.ts", "utf8");
    const sidebarSource = readFileSync("src/contracts/BattleSidebarEngine.ts", "utf8");
    const canonicalSource = readFileSync("src/game/battle/air/AirCombatContracts.ts", "utf8");
    for (const declaration of AIR_COMBAT_DECLARATIONS) {
      assert.match(canonicalSource, declarationPattern(declaration, true), `${declaration} must be canonically declared`);
      assert.doesNotMatch(gameEngineSource, declarationPattern(declaration, false), `${declaration} must not be duplicated in GameEngine`);
      assert.doesNotMatch(sidebarSource, declarationPattern(declaration, false), `${declaration} must not be duplicated in the sidebar facade`);
    }
    assert.match(gameEngineSource, /from\s+["']\.\/battle\/air\/AirCombatContracts["']/u);
    assert.match(sidebarSource, /from\s+["']\.\.\/game\/battle\/air\/AirCombatContracts["']/u);
    assert.equal(AIR_COMBAT_COMPATIBILITY.length, AIR_COMBAT_DECLARATIONS.length);
  });
});

registerTest("AIR_COMBAT_CONTRACT_PRESERVES_EXACT_FLAK_SCENE_PROJECTION", async ({ Given, When, Then }) => {
  const event = flakEvent();
  const compatibleEvent: CompatibleAirCombat.AirEngagementEvent = event;
  const eventBefore = structuredClone(event);
  let first: ReturnType<typeof buildResolvedAirShowFlakBursts>;
  let second: ReturnType<typeof buildResolvedAirShowFlakBursts>;

  await Given("a canonical event that remains assignable through the GameEngine compatibility export", () => {
    assert.strictEqual(compatibleEvent, event);
  });
  await When("the existing scene builder projects the event twice", () => {
    first = buildResolvedAirShowFlakBursts(event, {
      bomberUnitKey: "bomber-1",
      targetHexKey: "4,-1"
    });
    second = buildResolvedAirShowFlakBursts(event, {
      bomberUnitKey: "bomber-1",
      targetHexKey: "4,-1"
    });
  });
  await Then("the deterministic projection remains byte-for-byte stable and leaves the contract immutable", () => {
    assert.deepEqual(first, second);
    assert.deepEqual(event, eventBefore);
    assert.deepEqual(first.map((burst) => ({
      count: burst.count,
      puffCount: burst.puffCount,
      smokePuffCount: burst.smokePuffCount,
      bomberUnitKey: burst.bomberUnitKey,
      targetHexKey: burst.targetHexKey,
      batteryHexKey: burst.batteryHexKey
    })), [
      {
        count: 1,
        puffCount: 1,
        smokePuffCount: 2,
        bomberUnitKey: "bomber-1",
        targetHexKey: "4,-1",
        batteryHexKey: "2,-1"
      },
      {
        count: 1,
        puffCount: 1,
        smokePuffCount: 2,
        bomberUnitKey: "bomber-1",
        targetHexKey: "4,-1",
        batteryHexKey: "3,-1"
      }
    ]);
  });
});
