import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen.js";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem.js";
import type { ScenarioUnit } from "../src/core/types.js";
import type { AirEngagementEvent, AirMissionArrival, SerializedAirMission } from "../src/game/GameEngine.js";
import {
  clearAirShowPlaybackCaptures,
  getLatestAirShowPlaybackCapture
} from "../src/ui/airshow/AirShowPlaybackCapture.js";

function ensureBattleScreenRoot(): void {
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }
}

function makeUnit(unitId: string, type: string, q: number, r: number, strength: number): ScenarioUnit {
  return {
    type: type as ScenarioUnit["type"],
    hex: { q, r },
    strength,
    experience: 0,
    ammo: 6,
    fuel: 60,
    entrench: 0,
    facing: "NW",
    unitId
  } as ScenarioUnit;
}

function makeScreen(fakeBattleState: unknown, fakeRenderer: unknown): BattleScreen {
  const screen = new BattleScreen(
    {} as never,
    fakeBattleState as never,
    {} as never,
    fakeRenderer as never,
    null,
    null,
    null,
    {} as never,
    null
  );
  (screen as unknown as Record<string, unknown>).announceAirInterceptEngagement = () => {};
  (screen as unknown as Record<string, unknown>).announceFlakEngagement = () => {};
  (screen as unknown as Record<string, unknown>).announceBattleUpdate = () => {};
  (screen as unknown as Record<string, unknown>).publishActivityEvent = () => {};
  (screen as unknown as Record<string, unknown>).closeSelectionIntelForAnimation = () => {};
  (screen as unknown as Record<string, unknown>).waitMs = async () => {};
  (screen as unknown as Record<string, unknown>).waitForNextFrame = async () => {};
  (screen as unknown as Record<string, unknown>).focusCameraOnHex = async () => {};
  (screen as unknown as Record<string, unknown>).renderEngineUnits = () => {};
  return screen;
}

registerTest("AIRSHOW_PLAYBACK_CAPTURE_RECORDS_PRODUCTION_ORCHESTRATION_OUTPUT", async ({ Given, When, Then }) => {
  ensureBattleScreenRoot();

  const playerHq = { q: 0, r: 0 };
  const botHq = { q: 7, r: -3 };
  const playerUnits = [
    makeUnit("bomber-1", "Bomber", -2, 1, 100),
    makeUnit("escort-1", "Fighter", -1, 1, 100),
    makeUnit("escort-2", "Interceptor", -1, 2, 100)
  ];
  const botUnits = [
    makeUnit("cap-1", "Fighter", 4, -1, 100),
    makeUnit("cap-2", "Interceptor", 4, 0, 100),
    makeUnit("cap-3", "Fighter", 4, 1, 100)
  ];
  const playerMissions: SerializedAirMission[] = [
    {
      id: "strike-live-capture",
      kind: "strike",
      faction: "Player",
      unitKey: "bomber-1",
      originHexKey: "-2,1",
      unitType: "Bomber",
      status: "resolving",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 2, r: 0 }
    },
    {
      id: "escort-live-1",
      kind: "escort",
      faction: "Player",
      unitKey: "escort-1",
      originHexKey: "-1,1",
      unitType: "Fighter",
      status: "resolving",
      launchTurn: 1,
      turnsRemaining: 0,
      escortTargetUnitKey: "bomber-1"
    },
    {
      id: "escort-live-2",
      kind: "escort",
      faction: "Player",
      unitKey: "escort-2",
      originHexKey: "-1,2",
      unitType: "Interceptor",
      status: "resolving",
      launchTurn: 1,
      turnsRemaining: 0,
      escortTargetUnitKey: "bomber-1"
    }
  ];
  const botMissions: SerializedAirMission[] = [
    {
      id: "cap-live-1",
      kind: "airCover",
      faction: "Bot",
      unitKey: "cap-1",
      originHexKey: "4,-1",
      unitType: "Fighter",
      status: "resolving",
      launchTurn: 1,
      turnsRemaining: 0,
      targetHex: { q: 2, r: 0 }
    }
  ];
  const fakeEngine = {
    playerUnits,
    botUnits,
    allyUnits: [] as ScenarioUnit[],
    reserveUnits: [] as Array<{ unit: ScenarioUnit }>,
    getScheduledAirMissions(faction: "Player" | "Bot" | "Ally") {
      if (faction === "Player") {
        return playerMissions;
      }
      if (faction === "Bot") {
        return botMissions;
      }
      return [];
    },
    getPlayerHq: () => playerHq,
    getBotHq: () => botHq
  };
  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  const renderedScenes: unknown[] = [];
  const fakeRenderer = {
    async animateResolvedAirCombatShow(scene: unknown): Promise<void> {
      renderedScenes.push(scene);
    }
  };

  const arrivals: AirMissionArrival[] = [
    {
      missionId: "strike-live-capture",
      faction: "Player",
      unitKey: "bomber-1",
      originHexKey: "-2,1",
      unitType: "Bomber",
      unitStrength: 100,
      kind: "strike",
      targetHex: { q: 2, r: 0 }
    },
    {
      missionId: "escort-live-1",
      faction: "Player",
      unitKey: "escort-1",
      originHexKey: "-1,1",
      unitType: "Fighter",
      unitStrength: 100,
      kind: "escort",
      escortTargetUnitKey: "bomber-1"
    },
    {
      missionId: "escort-live-2",
      faction: "Player",
      unitKey: "escort-2",
      originHexKey: "-1,2",
      unitType: "Interceptor",
      unitStrength: 100,
      kind: "escort",
      escortTargetUnitKey: "bomber-1"
    },
    {
      missionId: "cap-live-1",
      faction: "Bot",
      unitKey: "cap-1",
      originHexKey: "4,-1",
      unitType: "Fighter",
      unitStrength: 100,
      kind: "airCover",
      targetHex: { q: 2, r: 0 }
    }
  ];
  const events: AirEngagementEvent[] = [
    {
      type: "airToAir",
      missionId: "strike-live-capture",
      location: { q: 2, r: 0 },
      bomber: { faction: "Player", unitKey: "bomber-1", unitType: "Bomber", strength: 100 },
      interceptors: [
        { faction: "Bot", unitKey: "cap-1", unitType: "Fighter", strength: 100 },
        { faction: "Bot", unitKey: "cap-2", unitType: "Interceptor", strength: 100 },
        { faction: "Bot", unitKey: "cap-3", unitType: "Fighter", strength: 100 }
      ],
      escorts: [
        { faction: "Player", unitKey: "escort-1", unitType: "Fighter", strength: 100 },
        { faction: "Player", unitKey: "escort-2", unitType: "Interceptor", strength: 100 }
      ],
      bomberStrengthBefore: 100,
      bomberStrengthAfter: 92,
      bomberDestroyed: false,
      interceptorAttrition: 8,
      escortPhaseInterceptorAttrition: 8,
      bomberDefenseInterceptorAttrition: 0,
      interceptorKills: 0,
      escortAttrition: 0,
      escortKills: 0,
      escortsEngaged: 2,
      interceptorsAfterEscortPhase: 3,
      escortsAfterEscortPhase: 2
    },
    {
      type: "flak",
      missionId: "strike-live-capture",
      location: { q: 2, r: 0 },
      bomber: { faction: "Player", unitKey: "bomber-1", unitType: "Bomber", strength: 92 },
      interceptors: [{ faction: "Bot", unitKey: "flak-1", unitType: "Flak_88", strength: 100 }],
      escorts: [],
      flakDamage: 4,
      bomberStrengthBefore: 92,
      bomberStrengthAfter: 88,
      bomberDestroyed: false
    }
  ];

  let screen: BattleScreen;

  await Given("a battle screen with live air operations and capture enabled", async () => {
    clearAirShowPlaybackCaptures();
    screen = makeScreen(fakeBattleState, fakeRenderer);
  });

  await When("the contested package is played through BattleScreen.playAirOperations", async () => {
    await (screen as unknown as {
      playAirOperations: (arrivals: AirMissionArrival[], events: AirEngagementEvent[]) => Promise<void>;
    }).playAirOperations(arrivals, events);
  });

  await Then("the latest capture should include replayable inputs and coordinated planner output", async () => {
    const capture = getLatestAirShowPlaybackCapture();
    if (!capture) {
      throw new Error("Expected an airshow playback capture to be recorded.");
    }
    if (capture.arrivals.length !== arrivals.length || capture.events.length !== events.length) {
      throw new Error(`Expected replayable inputs to be recorded, saw ${capture.arrivals.length} arrivals and ${capture.events.length} events.`);
    }
    if (capture.operations.length < 1 || capture.clusters.length < 1) {
      throw new Error(`Expected playback operations and clusters in the capture, saw ${capture.operations.length} operations and ${capture.clusters.length} clusters.`);
    }
    const coordinatedCluster = capture.clusters.find((cluster) => cluster.executionMode === "coordinated" && cluster.coordinatedPlan?.scene);
    if (!coordinatedCluster?.coordinatedPlan?.scene) {
      throw new Error(`Expected a coordinated planner scene in the capture, saw ${JSON.stringify(capture.clusters)}.`);
    }
    const expectedPlayerHqOffset = CoordinateSystem.axialToOffset(playerHq.q, playerHq.r);
    const expectedPlayerHqKey = CoordinateSystem.makeHexKey(expectedPlayerHqOffset.col, expectedPlayerHqOffset.row);
    if (capture.playerHqKey !== expectedPlayerHqKey) {
      throw new Error(`Expected player HQ key ${expectedPlayerHqKey}, saw ${capture.playerHqKey ?? "<missing>"}.`);
    }
    if (renderedScenes.length !== 1) {
      throw new Error(`Expected coordinated playback to hand exactly one scene to the renderer, saw ${renderedScenes.length}.`);
    }
  });
});

registerTest("AIRSHOW_PLAYBACK_REJECTS_LINKED_ESCORT_CONTRACT_MISMATCHES", async ({ Given, When, Then }) => {
  ensureBattleScreenRoot();

  const fakeEngine = {
    playerUnits: [
      makeUnit("bomber-1", "Bomber", -1, 0, 100),
      makeUnit("escort-1", "Fighter", -2, 0, 100)
    ],
    botUnits: [
      makeUnit("cap-1", "Interceptor", 3, 0, 100)
    ],
    allyUnits: [] as ScenarioUnit[],
    reserveUnits: [] as Array<{ unit: ScenarioUnit }>,
    getScheduledAirMissions(faction: "Player" | "Bot" | "Ally") {
      if (faction === "Player") {
        return [
          {
            id: "strike-live-3",
            kind: "strike",
            faction: "Player",
            unitKey: "bomber-1",
            originHexKey: "-1,0",
            unitType: "Bomber",
            status: "resolving",
            launchTurn: 1,
            turnsRemaining: 0,
            targetHex: { q: 2, r: 0 }
          },
          {
            id: "escort-live-3",
            kind: "escort",
            faction: "Player",
            unitKey: "escort-1",
            originHexKey: "-2,0",
            unitType: "Fighter",
            status: "resolving",
            launchTurn: 1,
            turnsRemaining: 0,
            escortTargetUnitKey: "bomber-1"
          }
        ] satisfies SerializedAirMission[];
      }
      return [];
    },
    getPlayerHq: () => ({ q: 0, r: 0 }),
    getBotHq: () => ({ q: 5, r: -2 })
  };
  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  let animateCalled = false;
  const fakeRenderer = {
    async animateResolvedAirCombatShow(): Promise<void> {
      animateCalled = true;
    }
  };

  const event: AirEngagementEvent = {
    type: "airToAir",
    missionId: "strike-live-3",
    location: { q: 2, r: 0 },
    bomber: { faction: "Player", unitKey: "bomber-1", unitType: "Bomber", strength: 100 },
    interceptors: [
      { faction: "Bot", unitKey: "cap-1", unitType: "Interceptor", strength: 100 }
    ],
    escorts: [],
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 96,
    bomberDestroyed: false,
    interceptorAttrition: 4,
    escortAttrition: 0,
    interceptorKills: 0,
    escortKills: 0,
    escortsEngaged: 0,
    interceptorsAfterEscortPhase: 1,
    escortsAfterEscortPhase: 0
  };

  let screen: BattleScreen;
  let thrownMessage: string | null = null;

  await Given("a linked strike whose resolved event omitted its escort", async () => {
    screen = makeScreen(fakeBattleState, fakeRenderer);
  });

  await When("playMissionAirInterceptEvent is asked to animate the broken package", async () => {
    try {
      await (screen as unknown as {
        playMissionAirInterceptEvent: (
          event: AirEngagementEvent,
          locKey: string,
          renderer: unknown,
          engine: unknown,
          fallbackLaneOffsetPx: number,
          skipEscortFlights: boolean,
          announceEvent: boolean,
          bomberArrivalDelayMs: number,
          allowBomberDefensePass: boolean,
          bomberOriginKey: string | null,
          linkedEscortFlights: readonly Record<string, unknown>[]
        ) => Promise<void>;
      }).playMissionAirInterceptEvent(
        event,
        "2,0",
        fakeRenderer,
        fakeEngine,
        0,
        false,
        false,
        900,
        true,
        "0,0",
        [
          {
            missionId: "escort-live-3",
            faction: "Player",
            kind: "escort",
            unitKey: "escort-1",
            originKey: "0,0",
            destKey: "2,0",
            unitType: "Fighter",
            strength: 100,
            laneOffsetPx: 0,
            escortTargetUnitKey: "bomber-1"
          }
        ]
      );
    } catch (error) {
      thrownMessage = error instanceof Error ? error.message : String(error);
    }
  });

  await Then("playback should fail loudly before handing a broken scene to the renderer", async () => {
    if (!thrownMessage?.includes("Linked escort flights missing from resolved event")) {
      throw new Error(`Expected a linked-escort contract violation, saw ${thrownMessage ?? "<no error>"}.`);
    }
    if (animateCalled) {
      throw new Error("Did not expect the renderer to receive a broken airshow scene.");
    }
  });
});
