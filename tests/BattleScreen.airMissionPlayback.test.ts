import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem.js";
import type { AirEngagementEvent, AirMissionArrival } from "../src/game/GameEngine";
import type { ScenarioUnit } from "../src/core/types";
import type { AirShowPlaybackCallbacks, ResolvedAirShowScene } from "../src/rendering/HexMapRenderer";
import type { CoordinatedAirClusterPlaybackPlan, ClusterPlaybackFlight, ClusterPlaybackOperation } from "../src/ui/airshow/ClusterAirPlaybackPlanner";
import { resolveAirInterceptBomberArrivalDelayMs } from "../src/ui/airshow/AirShowPlaybackPolicy";
import {
  buildCoordinatedAirClusterTimingPolicy,
  buildResolvedAirCombatSceneTimingPolicy,
  resolveCoordinatedAirClusterLeadWindow
} from "../src/ui/airshow/AirShowTimingPolicies.js";

/** Checks the renderer handoff itself; it must never manufacture legacy animation calls. */
function singleScene(scenes: readonly ResolvedAirShowScene[]): ResolvedAirShowScene {
  assert.equal(scenes.length, 1, "The package must have exactly one resolved renderer owner.");
  const scene = scenes[0];
  assert.ok(scene.bombers, "The authoritative bomber collection must be supplied.");
  assert.strictEqual(scene.bomber, scene.bombers[0] ?? null, "The primary bomber must alias the authoritative collection.");
  return scene;
}

/** Ensures the screen passes every shared timing field without substituting browser waits. */
function assertSceneTiming(scene: ResolvedAirShowScene, arrivalDelayMs: number): void {
  const policy = buildResolvedAirCombatSceneTimingPolicy(arrivalDelayMs);
  for (const key of Object.keys(policy) as Array<keyof typeof policy>) {
    assert.equal(scene[key], policy[key], `Resolved scene timing: ${key}`);
  }
}

/** An explicit barrier keeps lifecycle assertions independent of microtask counts. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

registerTest("BATTLESCREEN_AIR_OPERATIONS_USE_LIVE_STRIKE_TARGETS_AND_RENDER_LINKED_ESCORTS", async ({ Given, When, Then }) => {
  const originalSetTimeout = window.setTimeout;
  window.setTimeout = ((cb: unknown) => {
    (cb as () => void)();
    return 0 as any;
  }) as any;

  try {
    const root = document.getElementById("battleScreen") ?? document.createElement("div");
    if (!root.parentElement) {
      root.id = "battleScreen";
      document.body.appendChild(root);
    }

    const callOrder: string[] = [];
    const scenes: ResolvedAirShowScene[] = [];
    const playbackOptions: AirShowPlaybackCallbacks[] = [];

    const fakeEngine = {
      playerUnits: [
        {
          type: "Heavy_Tank" as unknown as ScenarioUnit["type"],
          hex: { q: 2, r: -1 },
          strength: 76,
          experience: 0,
          ammo: 4,
          fuel: 18,
          entrench: 0,
          facing: "NW" as ScenarioUnit["facing"]
        }
      ] as ScenarioUnit[],
      botUnits: [] as ScenarioUnit[],
      reserveUnits: [],
      allyUnits: [],
      getScheduledAirMissions() {
        return [
          {
            id: "strike-live-1",
            kind: "strike",
            faction: "Bot",
            unitKey: "bomber-1",
            status: "completed",
            targetHex: { q: 2, r: -1 },
            outcome: {
              type: "strike",
              result: "partial",
              defenderType: "Heavy_Tank",
              defenderDestroyed: false,
              damageInflicted: 24,
              meta: {}
            }
          },
          {
            id: "escort-live-1",
            kind: "escort",
            faction: "Bot",
            unitKey: "escort-1",
            status: "completed",
            escortTargetUnitKey: "bomber-1",
            outcome: {
              type: "escort",
              result: "success",
              details: "Escort maintained contact with the strike package.",
              refitRequired: true,
              meta: {}
            }
          }
        ];
      }
    } as const;

    const fakeBattleState = {
      hasEngine: () => true,
      ensureGameEngine: () => fakeEngine,
      tryGetGameEngine: () => fakeEngine
    } as unknown as import("../src/state/BattleState").BattleState;

    const fakeRenderer = {
      async animateResolvedAirCombatShow(scene: ResolvedAirShowScene, options: AirShowPlaybackCallbacks = {}): Promise<void> {
        scenes.push(scene);
        playbackOptions.push(options);
        await options.onImpact?.();
      },
      async animateAircraftFlyover(
        fromKey: string,
        toKey: string,
        unitType: string
      ): Promise<void> {
        callOrder.push(`flyover:${unitType}:${fromKey}->${toKey}`);
      },
      async playFlakBurstAt(): Promise<void> {},
      async playExplosion(hexKey: string): Promise<void> {
        callOrder.push(`impact:${hexKey}`);
      },
      async playDustCloud(hexKey: string): Promise<void> {
        callOrder.push(`dust:${hexKey}`);
      },
      async playAirDamageSmokeTrailAt(): Promise<void> {},
      async playDogfight(): Promise<void> {},
      markHexDamaged: (hexKey: string) => {
        callOrder.push(`markDamaged:${hexKey}`);
      },
      markHexWrecked: () => {},
      advanceAftermathTurn: () => {},
      renderUnit: () => {},
      clearUnit: () => {},
      applyHexSelection: () => {},
      syncQueuedTargetMarkers: () => {}
    } as unknown as import("../src/rendering/HexMapRenderer").HexMapRenderer;

    let screen: BattleScreen;

    await Given("a battle screen where the resolved strike target moved after launch and an escort is linked", async () => {
      screen = new BattleScreen(
        {} as any,
        fakeBattleState,
        {} as any,
        fakeRenderer,
        null,
        null,
        null,
        {} as any,
        null
      );
      (screen as any).focusCameraOnHex = async (hexKey: string): Promise<void> => {
        callOrder.push(`focus:${hexKey}`);
      };
      (screen as any).waitForNextFrame = async (): Promise<void> => {};
      (screen as any).waitMs = async (): Promise<void> => {};
      (screen as any).closeSelectionIntelForAnimation = () => {};
      (screen as any).announceBattleUpdate = () => {};
      (screen as any).publishActivityEvent = () => {};
      (screen as any).renderEngineUnits = () => {};
    });

    const arrivals: AirMissionArrival[] = [
      {
        missionId: "strike-live-1",
        faction: "Bot",
        unitKey: "bomber-1",
        originHexKey: "0,0",
        unitType: "Bomber",
        unitStrength: 100,
        kind: "strike",
        targetHex: { q: 0, r: 0 }
      },
      {
        missionId: "escort-live-1",
        faction: "Bot",
        unitKey: "escort-1",
        originHexKey: "1,0",
        unitType: "Fighter",
        unitStrength: 100,
        kind: "escort",
        escortTargetUnitKey: "bomber-1"
      }
    ];
    const events: AirEngagementEvent[] = [
      {
        type: "flak",
        missionId: "strike-live-1",
        location: { q: 2, r: -1 },
        bomber: {
          faction: "Bot",
          unitKey: "bomber-1",
          unitType: "Bomber",
          strength: 100
        },
        interceptors: [
          {
            faction: "Player",
            unitKey: "flak-1",
            unitType: "Flak_88",
            strength: 100,
            hex: { q: 2, r: 0 }
          }
        ],
        escorts: [],
        flakDamage: 0,
        bomberStrengthBefore: 100,
        bomberStrengthAfter: 100,
        bomberDestroyed: false
      }
    ];

    await When("linked air operations are played from stale arrival snapshots", async () => {
      await (screen as any).playAirOperations(arrivals, events);
    });

    await Then("the camera, impact, and escort flight should all use the live resolved target hex", async () => {
      if (!callOrder.includes("focus:2,0")) {
        throw new Error(`Expected focus on the live resolved target hex 2,0, saw ${JSON.stringify(callOrder)}.`);
      }

      if (callOrder.includes("focus:0,0") || callOrder.includes("impact:0,0")) {
        throw new Error(`Did not expect stale launch coordinates to be used, saw ${JSON.stringify(callOrder)}.`);
      }

      const scene = singleScene(scenes);
      assert.equal(scene.hexKey, "2,0");
      assert.equal(scene.bomberTargetHexKey, "2,0");
      assert.equal(scene.bombers?.length, 1);
      assert.deepEqual(scene.bomber, {
        id: "bomber-1", scenarioType: "Bomber", faction: "Bot", originHexKey: "0,0", targetHexKey: "2,0",
        strengthBefore: 100, strengthAfterEscortPhase: 100, finalStrength: 100,
        laneOffsetPx: 0, role: "bomber", combatRole: "strike"
      });
      assert.equal(scene.strikeAborted, false);
      assert.equal(scene.flakBursts?.length, 1);
      assert.equal(scene.flakBursts[0].bomberUnitKey, "bomber-1");
      assert.equal(scene.flakBursts[0].targetHexKey, "2,0");
      assert.equal(scene.flakBursts[0].batteryHexKey, "2,0");
      assert.equal(playbackOptions[0].playImpactEffects, true);
      assert.equal(typeof playbackOptions[0].onImpact, "function");

      if (!callOrder.includes("flyover:Fighter:1,0->2,0")) {
        throw new Error(`Expected linked escort ingress to be painted toward the same target, saw ${JSON.stringify(callOrder)}.`);
      }

      assert.equal(callOrder.filter((entry) => entry === "flyover:Fighter:1,0->2,0").length, 1);
      assert.equal(callOrder.filter((entry) => entry === "flyover:Fighter:2,0->1,0").length, 1);
      assert.equal(callOrder.filter((entry) => entry === "markDamaged:2,0").length, 1);
      assert.deepEqual(callOrder.filter((entry) => /^(impact|dust):|^flyover:Bomber:/.test(entry)), [],
        "Impact FX and bomber motion belong to the resolved renderer; the callback only synchronizes aftermath.");
    });
  } finally {
    window.setTimeout = originalSetTimeout;
  }
});

registerTest("BATTLESCREEN_STANDALONE_STRIKE_KEEPS_BOMBER_VISIBLE_THROUGH_IMPACT_FX", async ({ Given, When, Then }) => {
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const callOrder: string[] = [];
  const scenes: ResolvedAirShowScene[] = [];
  const playbackOptions: AirShowPlaybackCallbacks[] = [];
  const rendererStarted = deferred();
  const rendererFinished = deferred();
  let playback: Promise<void> | undefined;
  let playbackCompleted = false;

  const fakeEngine = {
    playerUnits: [] as ScenarioUnit[],
    botUnits: [
      {
        type: "Heavy_Tank" as unknown as ScenarioUnit["type"],
        hex: { q: 2, r: -1 },
        strength: 68,
        experience: 0,
        ammo: 4,
        fuel: 18,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"]
      }
    ] as ScenarioUnit[],
    reserveUnits: [],
    allyUnits: [],
    getScheduledAirMissions() {
      return [
        {
          id: "tutorial-strike-1",
          kind: "strike",
          faction: "Player",
          unitKey: "tutorial-bomber-1",
          status: "completed",
          targetHex: { q: 2, r: -1 },
          outcome: {
            type: "strike",
            result: "partial",
            defenderType: "Heavy_Tank",
            defenderDestroyed: false,
            damageInflicted: 32,
            meta: {}
          }
        }
      ];
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  const fakeRenderer = {
    async animateResolvedAirCombatShow(scene: ResolvedAirShowScene, options: AirShowPlaybackCallbacks = {}): Promise<void> {
      scenes.push(scene);
      playbackOptions.push(options);
      callOrder.push("renderer:start");
      rendererStarted.resolve();
      await rendererFinished.promise;
      callOrder.push("renderer:complete");
    },
    async animateAircraftSortie(): Promise<void> {
      callOrder.push("legacySortie");
    },
    async animateAircraftFlyover(): Promise<void> {
      callOrder.push("legacyLeg");
    },
    async animateAircraftArc(): Promise<void> {
      callOrder.push("legacyArc");
    },
    async playExplosion(hexKey: string): Promise<void> {
      callOrder.push(`legacyImpact:${hexKey}`);
    },
    async playDustCloud(hexKey: string): Promise<void> {
      callOrder.push(`dust:${hexKey}`);
    },
    async playAirDamageSmokeTrailAt(): Promise<void> {},
    markHexDamaged: (hexKey: string) => {
      callOrder.push(`markDamaged:${hexKey}`);
    },
    markHexWrecked: () => {},
    advanceAftermathTurn: () => {},
    renderUnit: () => {},
    clearUnit: () => {},
    applyHexSelection: () => {},
    syncQueuedTargetMarkers: () => {}
  } as unknown as import("../src/rendering/HexMapRenderer").HexMapRenderer;

  let screen: BattleScreen;

  await Given("a tutorial-style standalone bomber strike with impact effects", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).focusCameraOnHex = async (hexKey: string): Promise<void> => {
      callOrder.push(`focus:${hexKey}`);
    };
    (screen as any).waitForNextFrame = async (): Promise<void> => {};
    (screen as any).waitMs = async (): Promise<void> => {};
    (screen as any).closeSelectionIntelForAnimation = () => {};
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).renderEngineUnits = () => {
      callOrder.push("renderEngineUnits");
    };
  });

  await When("air operations play the strike impact", async () => {
    playback = (screen as any).playAirOperations([
      {
        missionId: "tutorial-strike-1",
        faction: "Player",
        unitKey: "tutorial-bomber-1",
        originHexKey: "0,0",
        unitType: "Bomber",
        // A visible sortie requires surviving aircraft in the authoritative arrival snapshot.
        unitStrength: 100,
        kind: "strike",
        targetHex: { q: 2, r: -1 }
      }
    ] satisfies AirMissionArrival[], []).then(() => { playbackCompleted = true; });
    await rendererStarted.promise;
  });

  await Then("the resolved renderer should own the live bomber through impact and completion", async () => {
    try {
      const scene = singleScene(scenes);
      assert.deepEqual(scene.bomber, {
        id: "tutorial-bomber-1", scenarioType: "Bomber", faction: "Player", originHexKey: "0,0", targetHexKey: "2,0",
        strengthBefore: 100, strengthAfterEscortPhase: 100, finalStrength: 100,
        laneOffsetPx: 0, role: "bomber", combatRole: "strike"
      });
      assert.equal(scene.bombers?.length, 1);
      assert.equal(scene.hexKey, "2,0");
      assert.equal(scene.bomberTargetHexKey, "2,0");
      assert.equal(scene.strikeAborted, false);
      assert.deepEqual(scene.flakBursts, []);
      assert.equal(playbackCompleted, false, "BattleScreen must await the renderer's entire sortie.");
      assert.equal(callOrder.includes("markDamaged:2,0"), false, "Aftermath must wait for the renderer's impact cue.");
      assert.equal(playbackOptions[0].playImpactEffects, true);
      assert.ok(playbackOptions[0].onImpact, "The renderer needs the state synchronization callback.");
      await playbackOptions[0].onImpact();
      assert.equal(callOrder.filter((entry) => entry === "markDamaged:2,0").length, 1);
      assert.equal(callOrder.filter((entry) => entry === "renderEngineUnits").length, 1);
      assert.equal(playbackCompleted, false, "Impact must not release renderer ownership before egress completes.");
    } finally {
      rendererFinished.resolve();
      await playback;
    }
    assert.equal(playbackCompleted, true);
    assert.equal(scenes.length, 1);
    assert.equal(callOrder.filter((entry) => entry === "markDamaged:2,0").length, 1, "Completion must not replay impact state.");
    assert.deepEqual(callOrder.filter((entry) => entry.startsWith("legacy") || entry.startsWith("dust:")), []);
    assert.ok(callOrder.indexOf("renderer:start") < callOrder.indexOf("markDamaged:2,0"));
    assert.ok(callOrder.indexOf("markDamaged:2,0") < callOrder.indexOf("renderer:complete"));
  });
});

registerTest("BATTLESCREEN_AIR_INTERCEPTS_PLAY_ESCORT_CLASH_BEFORE_BOMBER_DEFENSE_PASS", async ({ Given, When, Then }) => {
  const callOrder: string[] = [];
  const scenes: ResolvedAirShowScene[] = [];
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeEngine = {
    playerUnits: [
      {
        type: "Interceptor" as unknown as ScenarioUnit["type"],
        hex: { q: 0, r: 2 },
        strength: 100,
        experience: 0,
        ammo: 5,
        fuel: 40,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "cap-1"
      }
    ] as ScenarioUnit[],
    botUnits: [
      {
        type: "Bomber" as unknown as ScenarioUnit["type"],
        hex: { q: -1, r: -1 },
        strength: 100,
        experience: 0,
        ammo: 4,
        fuel: 50,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "bomber-1"
      },
      {
        type: "Fighter" as unknown as ScenarioUnit["type"],
        hex: { q: 1, r: -2 },
        strength: 100,
        experience: 0,
        ammo: 6,
        fuel: 50,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "escort-1"
      }
    ] as ScenarioUnit[],
    reserveUnits: [],
    allyUnits: [],
    getScheduledAirMissions() {
      return [];
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  const fakeRenderer = {
    async animateAircraftFlyover(
      fromKey: string,
      toKey: string,
      unitType: string,
      _durationMs: number,
      _onProgress?: unknown,
      _endProgress?: number,
      _strength?: number,
      _laneOffsetPx?: number,
      faction?: string
    ): Promise<void> {
      callOrder.push(`fly:${faction ?? "unknown"}:${unitType}:${fromKey}->${toKey}`);
    },
    async animateResolvedAirCombatShow(scene: ResolvedAirShowScene): Promise<void> {
      scenes.push(scene);
    },
    async playDogfight(hexKey: string): Promise<void> {
      callOrder.push(`dogfight:${hexKey}`);
    },
    async playBomberDefensePass(hexKey: string): Promise<void> {
      callOrder.push(`bomber-defense:${hexKey}`);
    }
  } as unknown as import("../src/rendering/HexMapRenderer").HexMapRenderer;

  let screen: BattleScreen;

  await Given("a linked escort and interceptor event with a surviving bomber pass", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).waitMs = async (): Promise<void> => {};
  });

  const event: AirEngagementEvent = {
    type: "airToAir",
    location: { q: 0, r: 0 },
    bomber: {
      faction: "Bot",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: 100
    },
    interceptors: [
      {
        faction: "Player",
        unitKey: "cap-1",
        unitType: "Interceptor",
        strength: 100
      }
    ],
    escorts: [
      {
        faction: "Bot",
        unitKey: "escort-1",
        unitType: "Fighter",
        strength: 100
      }
    ],
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 78,
    bomberDestroyed: false,
    interceptorAttrition: 12,
    interceptorKills: 0,
    escortAttrition: 17,
    escortKills: 0,
    escortsEngaged: 1,
    interceptorsAfterEscortPhase: 1,
    escortsAfterEscortPhase: 1,
    interceptorStrengthsAfterEscortPhase: [100],
    escortStrengthsAfterEscortPhase: [83],
    interceptorFinalStrengths: [88],
    escortFinalStrengths: [83],
    escortExchanges: [
      {
        phase: "escortClash",
        attackerFaction: "Bot",
        attackerUnitKey: "escort-1",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "cap-1",
        defenderUnitType: "Interceptor",
        attackerStrengthBefore: 100,
        attackerStrengthAfter: 83,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 100,
        damageToDefender: 0,
        retaliationDamage: 17,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      }
    ],
    bomberPassExchanges: [
      {
        phase: "bomberPass",
        attackerFaction: "Player",
        attackerUnitKey: "cap-1",
        attackerUnitType: "Interceptor",
        defenderFaction: "Bot",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 100,
        attackerStrengthAfter: 88,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 78,
        damageToDefender: 22,
        retaliationDamage: 12,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 2
      }
    ]
  };

  await When("the mission air intercept event is played", async () => {
    await (screen as any).playMissionAirInterceptEvent(event, "0,0", fakeRenderer, fakeEngine, 0, false);
  });

  await Then("one resolved scene should preserve ingress, escort clash, and bomber-pass contracts", async () => {
    const scene = singleScene(scenes);
    assert.equal(scene.kind, "airToAir");
    assert.equal(scene.hexKey, "0,0");
    assert.deepEqual(scene.interceptors.map((flight) => [flight.id, flight.faction, flight.scenarioType, flight.originHexKey]),
      [["cap-1", "Player", "Interceptor", "0,2"]]);
    assert.deepEqual(scene.escorts.map((flight) => [flight.id, flight.faction, flight.scenarioType, flight.originHexKey]),
      [["escort-1", "Bot", "Fighter", "1,-2"]]);
    assert.equal(scene.bombers?.length, 1);
    assert.equal(scene.bomber?.id, "bomber-1");
    assert.strictEqual(scene.escortExchanges, event.escortExchanges, "The authoritative escort exchanges must retain identity.");
    assert.equal(scene.escortExchanges?.length, 1);
    assert.deepEqual(callOrder, [], "BattleScreen must not also drive legacy flight or gun-pass animations.");
    assert.equal(scene.bomber?.originHexKey, "-1,-2");
    assert.strictEqual(scene.bomberPassExchanges, event.bomberPassExchanges);
    assert.equal(scene.bomberPassExchanges?.length, 1);
    assert.equal(scene.escorts[0].strengthAfterEscortPhase, 83);
    assert.equal(scene.escorts[0].finalStrength, 83);
    assert.equal(scene.interceptors[0].strengthAfterEscortPhase, 100);
    assert.equal(scene.interceptors[0].finalStrength, 88);
    assert.equal(scene.bomber?.finalStrength, 78);
    assertSceneTiming(scene, 0);
  });
});

registerTest("BATTLESCREEN_AIR_INTERCEPTS_STOP_DESTROYED_ESCORTS_FROM_CONTINUING_INTO_THE_BOMBER_PASS", async ({ Given, When, Then }) => {
  const callOrder: string[] = [];
  const scenes: ResolvedAirShowScene[] = [];
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeEngine = {
    playerUnits: [
      {
        type: "Interceptor" as unknown as ScenarioUnit["type"],
        hex: { q: 0, r: 2 },
        strength: 100,
        experience: 0,
        ammo: 5,
        fuel: 40,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "cap-1"
      }
    ] as ScenarioUnit[],
    botUnits: [
      {
        type: "Bomber" as unknown as ScenarioUnit["type"],
        hex: { q: -1, r: -1 },
        strength: 100,
        experience: 0,
        ammo: 4,
        fuel: 50,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "bomber-1"
      },
      {
        type: "Fighter" as unknown as ScenarioUnit["type"],
        hex: { q: 1, r: -2 },
        strength: 100,
        experience: 0,
        ammo: 6,
        fuel: 50,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "escort-1"
      }
    ] as ScenarioUnit[],
    reserveUnits: [],
    allyUnits: [],
    getScheduledAirMissions() {
      return [];
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  const fakeRenderer = {
    async animateAircraftFlyover(
      fromKey: string,
      toKey: string,
      unitType: string,
      _durationMs: number,
      _onProgress?: unknown,
      _endProgress?: number,
      strength?: number,
      _laneOffsetPx?: number,
      faction?: string
    ): Promise<void> {
      callOrder.push(`fly:${faction ?? "unknown"}:${unitType}:${fromKey}->${toKey}:${strength ?? "?"}`);
    },
    async animateAircraftOrbitAt(
      _hexKey: string,
      unitType: string,
      _durationMs: number,
      strength?: number
    ): Promise<void> {
      callOrder.push(`orbit:${unitType}:${strength ?? "?"}`);
    },
    async animateResolvedAirCombatShow(scene: ResolvedAirShowScene): Promise<void> {
      scenes.push(scene);
    },
    async playDogfight(hexKey: string): Promise<void> {
      callOrder.push(`dogfight:${hexKey}`);
    },
    async playBomberDefensePass(hexKey: string): Promise<void> {
      callOrder.push(`bomber-defense:${hexKey}`);
    }
  } as unknown as import("../src/rendering/HexMapRenderer").HexMapRenderer;

  let screen: BattleScreen;

  await Given("an escort that is destroyed during the opening dogfight", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).waitMs = async (): Promise<void> => {};
  });

  const event: AirEngagementEvent = {
    type: "airToAir",
    location: { q: 0, r: 0 },
    bomber: {
      faction: "Bot",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: 100
    },
    interceptors: [
      {
        faction: "Player",
        unitKey: "cap-1",
        unitType: "Interceptor",
        strength: 100
      }
    ],
    escorts: [
      {
        faction: "Bot",
        unitKey: "escort-1",
        unitType: "Fighter",
        strength: 100
      }
    ],
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 74,
    bomberDestroyed: false,
    interceptorAttrition: 18,
    interceptorKills: 0,
    escortAttrition: 100,
    escortKills: 1,
    escortsEngaged: 1,
    interceptorsAfterEscortPhase: 1,
    escortsAfterEscortPhase: 0,
    interceptorStrengthsAfterEscortPhase: [82],
    escortStrengthsAfterEscortPhase: [0],
    interceptorFinalStrengths: [61],
    escortFinalStrengths: [0],
    escortExchanges: [
      {
        phase: "escortClash",
        attackerFaction: "Bot",
        attackerUnitKey: "escort-1",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "cap-1",
        defenderUnitType: "Interceptor",
        attackerStrengthBefore: 100,
        attackerStrengthAfter: 0,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 82,
        damageToDefender: 18,
        retaliationDamage: 100,
        attackerDestroyed: true,
        defenderDestroyed: false,
        visualPasses: 1
      }
    ],
    bomberPassExchanges: [
      {
        phase: "bomberPass",
        attackerFaction: "Player",
        attackerUnitKey: "cap-1",
        attackerUnitType: "Interceptor",
        defenderFaction: "Bot",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 82,
        attackerStrengthAfter: 61,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 74,
        damageToDefender: 26,
        retaliationDamage: 21,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 2
      }
    ]
  };

  await When("the mission air intercept event is played through both phases", async () => {
    await (screen as any).playMissionAirInterceptEvent(event, "0,0", fakeRenderer, fakeEngine, 0, false, false, 900, true);
  });

  await Then("the scene should retain the destroyed escort for the opening clash with zero strength thereafter", async () => {
    const scene = singleScene(scenes);
    assert.equal(scene.kind, "airToAir");
    assert.equal(scene.hexKey, "0,0");
    assert.deepEqual(scene.interceptors.map((flight) => [flight.id, flight.faction, flight.scenarioType, flight.originHexKey]),
      [["cap-1", "Player", "Interceptor", "0,2"]]);
    assert.deepEqual(scene.escorts.map((flight) => [flight.id, flight.faction, flight.scenarioType, flight.originHexKey]),
      [["escort-1", "Bot", "Fighter", "1,-2"]]);
    assert.equal(scene.bombers?.length, 1);
    assert.equal(scene.bomber?.id, "bomber-1");
    assert.strictEqual(scene.escortExchanges, event.escortExchanges, "The authoritative escort exchanges must retain identity.");
    assert.equal(scene.escortExchanges?.length, 1);
    assert.deepEqual(callOrder, [], "BattleScreen must not also drive legacy flight or gun-pass animations.");
    assert.strictEqual(scene.bomberPassExchanges, event.bomberPassExchanges);
    assert.equal(scene.bomberPassExchanges?.length, 1);
    assert.equal(scene.escorts[0].strengthBefore, 100);
    assert.equal(scene.escorts[0].strengthAfterEscortPhase, 0);
    assert.equal(scene.escorts[0].finalStrength, 0);
    assert.equal(scene.escortExchanges[0].attackerDestroyed, true);
    assert.equal(scene.interceptors[0].strengthAfterEscortPhase, 82);
    assert.equal(scene.interceptors[0].finalStrength, 61);
    assert.equal(scene.bomber?.finalStrength, 74);
    assert.equal(scene.bomberPassExchanges[0].attackerUnitKey, "cap-1");
    assert.equal(scene.bomberPassExchanges[0].defenderUnitKey, "bomber-1");
    assert.ok(scene.bomberPassExchanges.every((exchange) =>
      exchange.attackerUnitKey !== "escort-1" && exchange.defenderUnitKey !== "escort-1"));
    assertSceneTiming(scene, 900);
  });
});

registerTest("BATTLESCREEN_LINKED_FLAK_AND_CAP_ANIMATE_IN_ONE_SEQUENCE_EVEN_IF_FLAK_BREAKS_UP_THE_STRIKE", async ({ Given, When, Then }) => {
  const callOrder: string[] = [];
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeEngine = {
    playerUnits: [] as ScenarioUnit[],
    botUnits: [] as ScenarioUnit[],
    reserveUnits: [] as ScenarioUnit[],
    allyUnits: [] as ScenarioUnit[],
    getScheduledAirMissions() {
      return [
        {
          id: "strike-1",
          kind: "strike",
          faction: "Bot",
          unitKey: "bomber-1",
          status: "completed",
          targetHex: { q: 0, r: 0 },
          outcome: {
            type: "strike",
            result: "destroyed",
            refitRequired: true,
            details: "Strike package broken up before release.",
            meta: {
              flakAttrition: 100,
              bomberAttrition: 0
            }
          }
        }
      ];
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  const fakeRenderer = {
    async animateAircraftArc(
      fromKey: string,
      toKey: string,
      unitType: string
    ): Promise<void> {
      callOrder.push(`bomber:${unitType}:${fromKey}->${toKey}`);
    },
    async playFlakBurstAt(): Promise<void> {},
    async playExplosion(): Promise<void> {},
    async playDustCloud(): Promise<void> {},
    async playAirDamageSmokeTrailAt(): Promise<void> {},
    async playDogfight(): Promise<void> {}
  } as unknown as import("../src/rendering/HexMapRenderer").HexMapRenderer;

  let screen: BattleScreen;

  await Given("a linked strike where flak destroys the bomber before impact but CAP also engaged", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).focusCameraOnHex = async (): Promise<void> => {};
    (screen as any).waitForNextFrame = async (): Promise<void> => {};
    (screen as any).waitMs = async (): Promise<void> => {};
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).announceFlakEngagement = () => {
      callOrder.push("announceFlak");
    };
    (screen as any).playMissionAirInterceptEvent = async () => {
      callOrder.push("playIntercept");
    };
  });

  await When("the linked strike animation runs", async () => {
    await (screen as any).playMissionStrikeOperation(
      {
        missionId: "strike-1",
        faction: "Bot",
        kind: "strike",
        unitKey: "bomber-1",
        originKey: "0,0",
        destKey: "1,0",
        unitType: "Bomber",
        strength: 100,
        laneOffsetPx: 0
      },
      [
        {
          type: "flak",
          missionId: "strike-1",
          location: { q: 0, r: 0 },
          bomber: { faction: "Bot", unitKey: "bomber-1", unitType: "Bomber", strength: 100 },
          interceptors: [{ faction: "Player", unitKey: "flak-1", unitType: "Flak_88", strength: 100, hex: { q: 0, r: 1 } }],
          escorts: [],
          flakDamage: 100,
          bomberStrengthBefore: 100,
          bomberStrengthAfter: 0,
          bomberDestroyed: true
        },
        {
          type: "airToAir",
          missionId: "strike-1",
          location: { q: 0, r: 0 },
          bomber: { faction: "Bot", unitKey: "bomber-1", unitType: "Bomber", strength: 100 },
          interceptors: [{ faction: "Player", unitKey: "cap-1", unitType: "Interceptor", strength: 100 }],
          escorts: [{ faction: "Bot", unitKey: "escort-1", unitType: "Fighter", strength: 100 }],
          bomberStrengthBefore: 100,
          bomberStrengthAfter: 0,
          bomberDestroyed: true,
          interceptorAttrition: 0,
          interceptorKills: 0,
          escortAttrition: 0,
          escortKills: 0,
          escortsEngaged: 1,
          interceptorsAfterEscortPhase: 1,
          escortsAfterEscortPhase: 1
        }
      ],
      [],
      fakeRenderer,
      fakeEngine as any,
      true
    );
  });

  await Then("the interceptor sequence should still be invoked before the strike returns", async () => {
    if (!callOrder.includes("playIntercept")) {
      throw new Error(`Expected linked CAP/escort animation to play in the same sequence, saw ${JSON.stringify(callOrder)}.`);
    }
  });
});

registerTest("BATTLESCREEN_AIR_INTERCEPTS_DELAY_BOMBER_DEFENSE_PASS_UNTIL_THE_BOMBER_WINDOW", async ({ Given, When, Then }) => {
  const callOrder: string[] = [];
  const scenes: ResolvedAirShowScene[] = [];
  const waits: number[] = [];
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeEngine = {
    playerUnits: [
      {
        type: "Interceptor" as unknown as ScenarioUnit["type"],
        hex: { q: 0, r: 2 },
        strength: 100,
        experience: 0,
        ammo: 5,
        fuel: 40,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "cap-1"
      }
    ] as ScenarioUnit[],
    botUnits: [
      {
        type: "Bomber" as unknown as ScenarioUnit["type"],
        hex: { q: -1, r: -1 },
        strength: 100,
        experience: 0,
        ammo: 4,
        fuel: 50,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "bomber-1"
      },
      {
        type: "Fighter" as unknown as ScenarioUnit["type"],
        hex: { q: 1, r: -2 },
        strength: 100,
        experience: 0,
        ammo: 6,
        fuel: 50,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "escort-1"
      }
    ] as ScenarioUnit[],
    reserveUnits: [],
    allyUnits: [],
    getScheduledAirMissions() {
      return [];
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  const fakeRenderer = {
    async animateAircraftFlyover(
      fromKey: string,
      toKey: string,
      unitType: string,
      _durationMs: number,
      _onProgress?: unknown,
      _endProgress?: number,
      _strength?: number,
      _laneOffsetPx?: number,
      faction?: string
    ): Promise<void> {
      callOrder.push(`fly:${faction ?? "unknown"}:${unitType}:${fromKey}->${toKey}`);
    },
    async animateResolvedAirCombatShow(scene: ResolvedAirShowScene): Promise<void> {
      scenes.push(scene);
    },
    async playDogfight(hexKey: string): Promise<void> {
      callOrder.push(`dogfight:${hexKey}`);
    },
    async playBomberDefensePass(hexKey: string): Promise<void> {
      callOrder.push(`bomber-defense:${hexKey}`);
    }
  } as unknown as import("../src/rendering/HexMapRenderer").HexMapRenderer;

  let screen: BattleScreen;

  await Given("an escort clash that should hold the bomber-defense pass until the bomber arrives", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).waitMs = async (durationMs: number): Promise<void> => {
      waits.push(durationMs);
    };
  });

  const event: AirEngagementEvent = {
    type: "airToAir",
    location: { q: 0, r: 0 },
    bomber: {
      faction: "Bot",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: 100
    },
    interceptors: [
      {
        faction: "Player",
        unitKey: "cap-1",
        unitType: "Interceptor",
        strength: 100
      }
    ],
    escorts: [
      {
        faction: "Bot",
        unitKey: "escort-1",
        unitType: "Fighter",
        strength: 100
      }
    ],
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 76,
    bomberDestroyed: false,
    interceptorAttrition: 10,
    interceptorKills: 0,
    escortAttrition: 14,
    escortKills: 0,
    escortsEngaged: 1,
    interceptorsAfterEscortPhase: 1,
    escortsAfterEscortPhase: 1,
    interceptorStrengthsAfterEscortPhase: [100],
    escortStrengthsAfterEscortPhase: [86],
    interceptorFinalStrengths: [90],
    escortFinalStrengths: [86],
    escortExchanges: [
      {
        phase: "escortClash",
        attackerFaction: "Bot",
        attackerUnitKey: "escort-1",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "cap-1",
        defenderUnitType: "Interceptor",
        attackerStrengthBefore: 100,
        attackerStrengthAfter: 86,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 100,
        damageToDefender: 0,
        retaliationDamage: 14,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      }
    ],
    bomberPassExchanges: [
      {
        phase: "bomberPass",
        attackerFaction: "Player",
        attackerUnitKey: "cap-1",
        attackerUnitType: "Interceptor",
        defenderFaction: "Bot",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 100,
        attackerStrengthAfter: 90,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 76,
        damageToDefender: 24,
        retaliationDamage: 10,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 2
      }
    ]
  };

  await When("the mission air intercept event is played with a delayed bomber arrival window", async () => {
    await (screen as any).playMissionAirInterceptEvent(event, "0,0", fakeRenderer, fakeEngine, 0, false, false, 900, true);
  });

  await Then("the renderer should receive the complete delayed bomber timing policy and both resolved phases", async () => {
    const scene = singleScene(scenes);
    assert.equal(scene.kind, "airToAir");
    assert.equal(scene.hexKey, "0,0");
    assert.deepEqual(scene.interceptors.map((flight) => [flight.id, flight.faction, flight.scenarioType, flight.originHexKey]),
      [["cap-1", "Player", "Interceptor", "0,2"]]);
    assert.deepEqual(scene.escorts.map((flight) => [flight.id, flight.faction, flight.scenarioType, flight.originHexKey]),
      [["escort-1", "Bot", "Fighter", "1,-2"]]);
    assert.equal(scene.bombers?.length, 1);
    assert.equal(scene.bomber?.id, "bomber-1");
    assert.strictEqual(scene.escortExchanges, event.escortExchanges, "The authoritative escort exchanges must retain identity.");
    assert.equal(scene.escortExchanges?.length, 1);
    assert.deepEqual(callOrder, [], "BattleScreen must not also drive legacy flight or gun-pass animations.");
    assert.strictEqual(scene.bomberPassExchanges, event.bomberPassExchanges);
    assert.equal(scene.bomberPassExchanges?.length, 1);
    assert.equal(scene.interceptors[0].finalStrength, 90);
    assert.equal(scene.escorts[0].finalStrength, 86);
    assert.equal(scene.bomber?.finalStrength, 76);
    assertSceneTiming(scene, 900);
    assert.ok(scene.bomberArrivalDelayMs! > buildResolvedAirCombatSceneTimingPolicy(0).bomberArrivalDelayMs,
      "A delayed bomber must receive a later renderer arrival window.");
    assert.deepEqual(waits, [], "The resolved renderer owns phase timing without additional BattleScreen waits.");
  });
});

registerTest("BATTLESCREEN_AIR_INTERCEPTS_SKIP_THE_BOMBER_PASS_WHEN_FLAK_ALREADY_BREAKS_UP_THE_STRIKE", async ({ Given, When, Then }) => {
  const callOrder: string[] = [];
  const scenes: ResolvedAirShowScene[] = [];
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeEngine = {
    playerUnits: [
      {
        type: "Interceptor" as unknown as ScenarioUnit["type"],
        hex: { q: 0, r: 2 },
        strength: 100,
        experience: 0,
        ammo: 5,
        fuel: 40,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "cap-1"
      }
    ] as ScenarioUnit[],
    botUnits: [
      {
        type: "Fighter" as unknown as ScenarioUnit["type"],
        hex: { q: 1, r: -2 },
        strength: 100,
        experience: 0,
        ammo: 6,
        fuel: 50,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "escort-1"
      }
    ] as ScenarioUnit[],
    reserveUnits: [],
    allyUnits: [],
    getScheduledAirMissions() {
      return [];
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  const fakeRenderer = {
    async animateAircraftFlyover(): Promise<void> {},
    async animateResolvedAirCombatShow(scene: ResolvedAirShowScene): Promise<void> {
      scenes.push(scene);
    },
    async playDogfight(hexKey: string): Promise<void> {
      callOrder.push(`dogfight:${hexKey}`);
    },
    async playBomberDefensePass(hexKey: string): Promise<void> {
      callOrder.push(`bomber-defense:${hexKey}`);
    }
  } as unknown as import("../src/rendering/HexMapRenderer").HexMapRenderer;

  let screen: BattleScreen;

  await Given("a bomber already broken up by flak before the bomber-defense run", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).waitMs = async (): Promise<void> => {};
  });

  const event: AirEngagementEvent = {
    type: "airToAir",
    location: { q: 0, r: 0 },
    bomber: {
      faction: "Bot",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: 100
    },
    interceptors: [
      {
        faction: "Player",
        unitKey: "cap-1",
        unitType: "Interceptor",
        strength: 100
      }
    ],
    escorts: [
      {
        faction: "Bot",
        unitKey: "escort-1",
        unitType: "Fighter",
        strength: 100
      }
    ],
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 0,
    bomberDestroyed: true,
    interceptorAttrition: 0,
    interceptorKills: 0,
    escortAttrition: 0,
    escortKills: 0,
    escortsEngaged: 1,
    interceptorsAfterEscortPhase: 1,
    escortsAfterEscortPhase: 1,
    interceptorStrengthsAfterEscortPhase: [100],
    escortStrengthsAfterEscortPhase: [100],
    interceptorFinalStrengths: [100],
    escortFinalStrengths: [100],
    escortExchanges: [
      {
        phase: "escortClash",
        attackerFaction: "Bot",
        attackerUnitKey: "escort-1",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "cap-1",
        defenderUnitType: "Interceptor",
        attackerStrengthBefore: 100,
        attackerStrengthAfter: 100,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 100,
        damageToDefender: 0,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 1
      }
    ],
    bomberPassExchanges: [
      {
        phase: "bomberPass",
        attackerFaction: "Player",
        attackerUnitKey: "cap-1",
        attackerUnitType: "Interceptor",
        defenderFaction: "Bot",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 100,
        attackerStrengthAfter: 100,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 0,
        damageToDefender: 100,
        retaliationDamage: 0,
        attackerDestroyed: false,
        defenderDestroyed: true,
        visualPasses: 2
      }
    ]
  };

  await When("the air intercept playback is told the bomber-defense pass is unavailable", async () => {
    await (screen as any).playMissionAirInterceptEvent(event, "0,0", fakeRenderer, fakeEngine, 0, false, false, 900, false);
  });

  await Then("the scene should retain the escort clash and destroyed bomber without replaying its defense pass", async () => {
    const scene = singleScene(scenes);
    assert.equal(scene.kind, "airToAir");
    assert.equal(scene.hexKey, "0,0");
    assert.deepEqual(scene.interceptors.map((flight) => [flight.id, flight.faction, flight.scenarioType, flight.originHexKey]),
      [["cap-1", "Player", "Interceptor", "0,2"]]);
    assert.deepEqual(scene.escorts.map((flight) => [flight.id, flight.faction, flight.scenarioType, flight.originHexKey]),
      [["escort-1", "Bot", "Fighter", "1,-2"]]);
    assert.equal(scene.bombers?.length, 1);
    assert.equal(scene.bomber?.id, "bomber-1");
    assert.strictEqual(scene.escortExchanges, event.escortExchanges, "The authoritative escort exchanges must retain identity.");
    assert.equal(scene.escortExchanges?.length, 1);
    assert.deepEqual(callOrder, [], "BattleScreen must not also drive legacy flight or gun-pass animations.");
    assert.deepEqual(scene.bomberPassExchanges, [], "An unavailable defense pass must be suppressed even if the event contains exchanges.");
    assert.equal(event.bomberPassExchanges?.length, 1, "Suppressing playback must not mutate the resolved event.");
    assert.equal(scene.escorts[0].strengthBefore, 100);
    assert.equal(scene.escorts[0].finalStrength, 100);
    assert.equal(scene.interceptors[0].finalStrength, 100);
    assert.equal(scene.bomber?.strengthBefore, 100);
    assert.equal(scene.bomber?.finalStrength, 0);
    assertSceneTiming(scene, 900);
  });
});

registerTest("BATTLESCREEN_LINKED_CAP_SORTIES_ARE_NOT_REPLAYED_AS_STANDALONE_PATROLS", async ({ Given, When, Then }) => {
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const callOrder: string[] = [];
  const linkedEvents: AirEngagementEvent[] = [];
  const fakeEngine = {
    playerUnits: [] as ScenarioUnit[],
    botUnits: [] as ScenarioUnit[],
    reserveUnits: [],
    allyUnits: [],
    getScheduledAirMissions() {
      return [];
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  let screen: BattleScreen;

  await Given("a linked strike whose interception already includes the CAP squadron", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      {} as any,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).focusCameraOnHex = async (): Promise<void> => {};
    (screen as any).waitForNextFrame = async (): Promise<void> => {};
    (screen as any).waitMs = async (): Promise<void> => {};
    (screen as any).closeSelectionIntelForAnimation = () => {};
    (screen as any).collectAirMissionFlights = async () => [
      {
        missionId: "strike-1",
        faction: "Bot",
        kind: "strike",
        unitKey: "bomber-1",
        originKey: "0,10",
        destKey: "12,5",
        unitType: "Bomber",
        strength: 100,
        laneOffsetPx: 0
      },
      {
        missionId: "cap-1",
        faction: "Player",
        kind: "airCover",
        unitKey: "cap-squadron-1",
        originKey: "10,8",
        destKey: "12,5",
        unitType: "Interceptor",
        strength: 100,
        laneOffsetPx: 0
      }
    ];
    (screen as any).playMissionStrikeOperation = async (flight: ClusterPlaybackFlight, events: AirEngagementEvent[]) => {
      assert.equal(flight.missionId, "strike-1");
      assert.equal(flight.unitKey, "bomber-1");
      linkedEvents.push(...events);
      callOrder.push("linkedStrike");
    };
    (screen as any).playStandaloneAirMissionFlight = async (flight: { missionId: string; kind: string; unitKey: string }) => {
      callOrder.push(`standalone:${flight.kind}:${flight.unitKey}:${flight.missionId}`);
    };
    (screen as any).playStandaloneAirEngagementEvent = async () => {
      callOrder.push("standaloneEvent");
    };
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
  });

  const events: AirEngagementEvent[] = [
    {
      type: "airToAir",
      missionId: "strike-1",
      location: { q: 12, r: 5 },
      bomber: {
        faction: "Bot",
        unitKey: "bomber-1",
        unitType: "Bomber",
        strength: 100
      },
      interceptors: [
        {
          faction: "Player",
          unitKey: "cap-squadron-1",
          unitType: "Interceptor",
          strength: 100
        }
      ],
      escorts: [],
      bomberStrengthBefore: 100,
      bomberStrengthAfter: 90,
      bomberDestroyed: false,
      interceptorAttrition: 0,
      interceptorKills: 0,
      escortAttrition: 0,
      escortKills: 0,
      escortsEngaged: 0,
      interceptorsAfterEscortPhase: 1,
      escortsAfterEscortPhase: 0
    }
  ];

  await When("air operations are played", async () => {
    await (screen as any).playAirOperations([] as AirMissionArrival[], events);
  });

  await Then("the CAP squadron should only appear inside the linked strike battle and not replay later as a patrol", async () => {
    assert.deepEqual(callOrder, ["linkedStrike"], "Claimed CAP and its engagement must not replay as standalone operations.");
    assert.equal(linkedEvents.length, 1);
    assert.strictEqual(linkedEvents[0], events[0]);
  });
});

registerTest("BATTLESCREEN_AIR_PLAYBACK_CLUSTERS_CHAINED_NEARBY_SORTIES_BEFORE_MOVING_THE_CAMERA", async ({ Given, When, Then }) => {
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const callOrder: string[] = [];
  const fakeEngine = {
    playerUnits: [] as ScenarioUnit[],
    botUnits: [] as ScenarioUnit[],
    reserveUnits: [],
    allyUnits: [],
    getScheduledAirMissions() {
      return [];
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  let screen: BattleScreen;

  await Given("three sorties that chain together within eight hexes and one distant sortie", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      {} as any,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).focusCameraOnHex = async (hexKey: string): Promise<void> => {
      callOrder.push(`focus:${hexKey}`);
    };
    (screen as any).waitForNextFrame = async (): Promise<void> => {};
    (screen as any).waitMs = async (): Promise<void> => {};
    (screen as any).closeSelectionIntelForAnimation = () => {};
    (screen as any).collectAirMissionFlights = async () => [
      {
        missionId: "near-1",
        faction: "Bot",
        kind: "airCover",
        unitKey: "near-1",
        originKey: "0,0",
        destKey: "0,0",
        unitType: "Fighter",
        strength: 100,
        laneOffsetPx: 0
      },
      {
        missionId: "near-2",
        faction: "Bot",
        kind: "airCover",
        unitKey: "near-2",
        originKey: "1,1",
        destKey: "6,3",
        unitType: "Fighter",
        strength: 100,
        laneOffsetPx: 0
      },
      {
        missionId: "near-3",
        faction: "Bot",
        kind: "airCover",
        unitKey: "near-3",
        originKey: "2,1",
        destKey: "12,6",
        unitType: "Fighter",
        strength: 100,
        laneOffsetPx: 0
      },
      {
        missionId: "far-1",
        faction: "Bot",
        kind: "airCover",
        unitKey: "far-1",
        originKey: "4,2",
        destKey: "24,12",
        unitType: "Fighter",
        strength: 100,
        laneOffsetPx: 0
      }
    ];
    (screen as any).playMissionStrikeOperation = async () => {
      callOrder.push("linkedStrike");
    };
    (screen as any).playStandaloneAirMissionFlight = async (flight: { missionId: string }, _renderer: unknown, _engine: unknown, preFocused: boolean) => {
      callOrder.push(`flight:${flight.missionId}:${preFocused ? "prefocused" : "self-focus"}`);
    };
    (screen as any).playStandaloneAirEngagementEvent = async () => {
      callOrder.push("event");
    };
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
  });

  await When("the clustered air playback sequence runs", async () => {
    await (screen as any).playAirOperations([] as AirMissionArrival[], [] as AirEngagementEvent[]);
  });

  await Then("the camera should stay on the chained nearby sorties and only move again for the distant cluster", async () => {
    const focusCalls = callOrder.filter((entry) => entry.startsWith("focus:"));
    if (focusCalls.length !== 2) {
      throw new Error(`Expected exactly two camera focuses for two playback clusters, saw ${JSON.stringify(callOrder)}.`);
    }
    if (focusCalls[0] !== "focus:0,0" || focusCalls[1] !== "focus:24,12") {
      throw new Error(`Expected chained sorties to keep a shared camera cluster before the distant sortie, saw ${JSON.stringify(focusCalls)}.`);
    }

    const farFocusIndex = callOrder.indexOf("focus:24,12");
    const chainedFlights = ["flight:near-1:prefocused", "flight:near-2:prefocused", "flight:near-3:prefocused"];
    chainedFlights.forEach((entry) => {
      const index = callOrder.indexOf(entry);
      if (index < 0 || index > farFocusIndex) {
        throw new Error(`Expected chained sortie ${entry} to play before the distant cluster focus, saw ${JSON.stringify(callOrder)}.`);
      }
    });
  });
});

registerTest("BATTLESCREEN_AIR_INTERCEPTS_USE_CHOREOGRAPHED_SHOW_PATHS_WHEN_AVAILABLE", async ({ Given, When, Then }) => {
  const callOrder: string[] = [];
  const scenes: ResolvedAirShowScene[] = [];
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeEngine = {
    playerUnits: [
      {
        type: "Interceptor" as unknown as ScenarioUnit["type"],
        hex: { q: 0, r: 2 },
        strength: 100,
        experience: 0,
        ammo: 5,
        fuel: 40,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "cap-1"
      },
      {
        type: "Interceptor" as unknown as ScenarioUnit["type"],
        hex: { q: 1, r: 2 },
        strength: 100,
        experience: 0,
        ammo: 5,
        fuel: 40,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "cap-2"
      }
    ] as ScenarioUnit[],
    botUnits: [
      {
        type: "Bomber" as unknown as ScenarioUnit["type"],
        hex: { q: -1, r: -1 },
        strength: 100,
        experience: 0,
        ammo: 4,
        fuel: 50,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "bomber-1"
      },
      {
        type: "Fighter" as unknown as ScenarioUnit["type"],
        hex: { q: 1, r: -2 },
        strength: 100,
        experience: 0,
        ammo: 6,
        fuel: 50,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "escort-1"
      }
    ] as ScenarioUnit[],
    reserveUnits: [],
    allyUnits: [],
    getScheduledAirMissions() {
      return [];
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  const fakeRenderer = {
    async animateResolvedAirCombatShow(scene: ResolvedAirShowScene): Promise<void> {
      scenes.push(scene);
    },
    async playDogfight(hexKey: string): Promise<void> {
      callOrder.push(`fallback-dogfight:${hexKey}`);
    },
    async playBomberDefensePass(hexKey: string): Promise<void> {
      callOrder.push(`fallback-bomber:${hexKey}`);
    }
  } as unknown as import("../src/rendering/HexMapRenderer").HexMapRenderer;

  let screen: BattleScreen;

  await Given("a renderer that supports the new air-show choreography hooks", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).waitMs = async (): Promise<void> => {};
  });

  const event: AirEngagementEvent = {
    type: "airToAir",
    location: { q: 0, r: 0 },
    bomber: {
      faction: "Bot",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: 100
    },
    interceptors: [
      {
        faction: "Player",
        unitKey: "cap-1",
        unitType: "Interceptor",
        strength: 100
      },
      {
        faction: "Player",
        unitKey: "cap-2",
        unitType: "Interceptor",
        strength: 100
      }
    ],
    escorts: [
      {
        faction: "Bot",
        unitKey: "escort-1",
        unitType: "Fighter",
        strength: 100
      }
    ],
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 44,
    bomberDestroyed: false,
    interceptorAttrition: 24,
    interceptorKills: 0,
    escortAttrition: 57,
    escortKills: 1,
    escortsEngaged: 1,
    interceptorsAfterEscortPhase: 2,
    escortsAfterEscortPhase: 0,
    escortExchanges: [
      {
        phase: "escortClash",
        attackerFaction: "Bot",
        attackerUnitKey: "escort-1",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "cap-1",
        defenderUnitType: "Interceptor",
        attackerStrengthBefore: 100,
        attackerStrengthAfter: 43,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 76,
        damageToDefender: 24,
        retaliationDamage: 57,
        attackerDestroyed: true,
        defenderDestroyed: false,
        visualPasses: 1
      }
    ],
    bomberPassExchanges: [
      {
        phase: "bomberPass",
        attackerFaction: "Player",
        attackerUnitKey: "cap-1",
        attackerUnitType: "Interceptor",
        defenderFaction: "Bot",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 76,
        attackerStrengthAfter: 63,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 72,
        damageToDefender: 28,
        retaliationDamage: 13,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 2
      },
      {
        phase: "bomberPass",
        attackerFaction: "Player",
        attackerUnitKey: "cap-2",
        attackerUnitType: "Interceptor",
        defenderFaction: "Bot",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 100,
        attackerStrengthAfter: 88,
        defenderStrengthBefore: 72,
        defenderStrengthAfter: 44,
        damageToDefender: 28,
        retaliationDamage: 12,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 2
      }
    ],
    interceptorStrengthsAfterEscortPhase: [76, 100],
    escortStrengthsAfterEscortPhase: [0],
    interceptorFinalStrengths: [63, 88],
    escortFinalStrengths: [0]
  };

  await When("the mission air intercept event is played", async () => {
    await (screen as any).playMissionAirInterceptEvent(event, "0,0", fakeRenderer, fakeEngine, 0, false, false, 900, true);
  });

  await Then("the screen should hand the renderer every resolved participant and exchange exactly once", async () => {
    const scene = singleScene(scenes);
    assert.equal(scene.hexKey, "0,0");
    assert.deepEqual(scene.interceptors.map((flight) => [flight.id, flight.originHexKey, flight.strengthAfterEscortPhase, flight.finalStrength]),
      [["cap-1", "0,2", 76, 63], ["cap-2", "1,2", 100, 88]]);
    assert.deepEqual(scene.escorts.map((flight) => [flight.id, flight.originHexKey, flight.strengthAfterEscortPhase, flight.finalStrength]),
      [["escort-1", "1,-2", 0, 0]]);
    assert.equal(scene.bombers?.length, 1);
    assert.equal(scene.bomber?.id, "bomber-1");
    assert.equal(scene.bomber?.originHexKey, "-1,-2");
    assert.equal(scene.bomber?.strengthBefore, 100);
    assert.equal(scene.bomber?.finalStrength, 44);
    assert.strictEqual(scene.escortExchanges, event.escortExchanges);
    assert.strictEqual(scene.bomberPassExchanges, event.bomberPassExchanges);
    assert.deepEqual(scene.escortExchanges?.map((exchange) => [exchange.attackerUnitKey, exchange.defenderUnitKey]),
      [["escort-1", "cap-1"]]);
    assert.deepEqual(scene.bomberPassExchanges?.map((exchange) => [exchange.attackerUnitKey, exchange.defenderUnitKey]),
      [["cap-1", "bomber-1"], ["cap-2", "bomber-1"]]);
    assertSceneTiming(scene, 900);
    assert.deepEqual(callOrder, [], "The resolved renderer must own all gun passes.");
  });
});

registerTest("BATTLESCREEN_LINKED_STRIKES_KEEP_ESCORT_SORTIES_INSIDE_INTERCEPTED_PACKAGE_PLAYBACK", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  const callOrder: string[] = [];
  const linkedEventsReceived: AirEngagementEvent[] = [];
  const linkedFlights: ClusterPlaybackFlight[] = [];
  const linkedEscorts: ClusterPlaybackFlight[] = [];
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeRenderer = {
    async playDustCloud(): Promise<void> {}
  };
  const fakeBattleState = {
    ensureGameEngine: () => ({
      getScheduledAirMissions: () => []
    })
  } as any;

  await Given("a linked strike whose interception event can only be matched by bomber squadron id", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer as any,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).focusCameraOnHex = async (): Promise<void> => {};
    (screen as any).waitForNextFrame = async (): Promise<void> => {};
    (screen as any).waitMs = async (): Promise<void> => {};
    (screen as any).closeSelectionIntelForAnimation = () => {};
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).renderEngineUnits = () => {};
    (screen as any).resolvePreparedAirMissionDestKey = () => "2,0";
    (screen as any).playMissionStrikeOperation = async (
      flight: ClusterPlaybackFlight,
      linkedEvents: AirEngagementEvent[],
      escorts: ClusterPlaybackFlight[]
    ): Promise<void> => {
      linkedFlights.push(flight);
      linkedEventsReceived.push(...linkedEvents);
      linkedEscorts.push(...escorts);
      callOrder.push(`linkedStrike:${flight.unitKey}:${linkedEvents.map((entry) => entry.type).join("|")}:${escorts.map((escort) => escort.unitKey).join("|")}`);
    };
    (screen as any).playStandaloneAirMissionFlight = async (flight: { kind: string; unitKey: string }): Promise<void> => {
      callOrder.push(`standaloneFlight:${flight.kind}:${flight.unitKey}`);
    };
    (screen as any).playStandaloneAirEngagementEvent = async (event: { type: string; bomber: { unitKey: string } }): Promise<void> => {
      callOrder.push(`standaloneEvent:${event.type}:${event.bomber.unitKey}`);
    };
  });

  const arrivals: AirMissionArrival[] = [
    {
      missionId: "strike-live-2",
      faction: "Bot",
      unitKey: "bomber-1",
      originHexKey: "0,0",
      unitType: "Bomber",
      unitStrength: 100,
      kind: "strike",
      targetHex: { q: 2, r: 0 }
    },
    {
      missionId: "escort-live-2",
      faction: "Bot",
      unitKey: "escort-1",
      originHexKey: "1,0",
      unitType: "Fighter",
      unitStrength: 100,
      kind: "escort",
      escortTargetUnitKey: "bomber-1"
    }
  ];
  const events: AirEngagementEvent[] = [
    {
      type: "airToAir",
      missionId: "detached-air-event",
      location: { q: 2, r: 0 },
      bomber: {
        faction: "Bot",
        unitKey: "bomber-1",
        unitType: "Bomber",
        strength: 100
      },
      interceptors: [
        {
          faction: "Player",
          unitKey: "cap-1",
          unitType: "Interceptor",
          strength: 100
        }
      ],
      escorts: [],
      bomberStrengthBefore: 100,
      bomberStrengthAfter: 74,
      bomberDestroyed: false,
      interceptorAttrition: 0,
      escortAttrition: 0,
      escortsEngaged: 0,
      interceptorsAfterEscortPhase: 1,
      escortsAfterEscortPhase: 0,
      bomberPassExchanges: [
        {
          phase: "bomberPass",
          attackerFaction: "Player",
          attackerUnitKey: "cap-1",
          attackerUnitType: "Interceptor",
          defenderFaction: "Bot",
          defenderUnitKey: "bomber-1",
          defenderUnitType: "Bomber",
          attackerStrengthBefore: 100,
          attackerStrengthAfter: 92,
          defenderStrengthBefore: 100,
          defenderStrengthAfter: 74,
          damageToDefender: 26,
          retaliationDamage: 8,
          attackerDestroyed: false,
          defenderDestroyed: false,
          visualPasses: 2
        }
      ]
    }
  ];

  await When("the battle screen links arrivals and resolved air events into playback operations", async () => {
    await (screen as any).playAirOperations(arrivals, events);
  });

  await Then("the linked strike should keep its escort inside the package and avoid standalone escort or event playback", async () => {
    assert.deepEqual(callOrder, ["linkedStrike:bomber-1:airToAir:escort-1"]);
    assert.equal(linkedEventsReceived.length, 1);
    assert.strictEqual(linkedEventsReceived[0], events[0], "Linking by bomber id must preserve the exact detached event.");
    assert.equal(linkedFlights.length, 1);
    assert.equal(linkedFlights[0].missionId, "strike-live-2");
    assert.equal(linkedFlights[0].destKey, "2,0");
    assert.equal(linkedEscorts.length, 1);
    assert.equal(linkedEscorts[0].missionId, "escort-live-2");
    assert.equal(linkedEscorts[0].escortTargetUnitKey, linkedFlights[0].unitKey);
    assert.equal(linkedEscorts[0].originKey, "1,0");
    assert.equal(linkedEscorts[0].destKey, linkedFlights[0].destKey);
  });
});

registerTest("BATTLESCREEN_COORDINATED_AIRSHOW_SCENE_USES_SHARED_POLICY_TIMINGS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let coordinatedPlan: CoordinatedAirClusterPlaybackPlan | null = null;
  let coordinatedScene: ResolvedAirShowScene | null = null;
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeEngine = {
    getPlayerHq: () => ({ q: -6, r: 2 }),
    getBotHq: () => ({ q: 7, r: -3 })
  } as const;

  await Given("a linked strike package that BattleScreen can fold into a coordinated airshow scene", async () => {
    screen = new BattleScreen(
      {} as any,
      {
        ensureGameEngine: () => fakeEngine,
        tryGetGameEngine: () => fakeEngine,
        hasEngine: () => true
      } as any,
      {} as any,
      {} as any,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).resolveAirEngagementOffsetKey = (unitKey: string) => {
      const origins: Record<string, string> = {
        "cap-1": "2,1",
        "escort-1": "7,1",
        "bomber-1": "8,2"
      };
      return origins[unitKey] ?? null;
    };
    (screen as any).resolveAirSquadronStrength = () => 100;
  });

  const coordinatedEvent: AirEngagementEvent = {
    type: "airToAir",
    missionId: "strike-live-coordinated",
    location: { q: 1, r: -1 },
    bomber: {
      faction: "Bot",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: 100
    },
    interceptors: [
      {
        faction: "Player",
        unitKey: "cap-1",
        unitType: "Interceptor",
        strength: 100
      }
    ],
    escorts: [
      {
        faction: "Bot",
        unitKey: "escort-1",
        unitType: "Fighter",
        strength: 100
      }
    ],
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 82,
    bomberDestroyed: false,
    escortExchanges: [
      {
        phase: "escortClash",
        attackerFaction: "Bot",
        attackerUnitKey: "escort-1",
        attackerUnitType: "Fighter",
        defenderFaction: "Player",
        defenderUnitKey: "cap-1",
        defenderUnitType: "Interceptor",
        attackerStrengthBefore: 100,
        attackerStrengthAfter: 94,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 90,
        damageToDefender: 10,
        retaliationDamage: 6,
        attackerDestroyed: false,
        defenderDestroyed: false
      }
    ],
    bomberPassExchanges: [
      {
        phase: "bomberPass",
        attackerFaction: "Player",
        attackerUnitKey: "cap-1",
        attackerUnitType: "Interceptor",
        defenderFaction: "Bot",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 90,
        attackerStrengthAfter: 86,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 82,
        damageToDefender: 18,
        retaliationDamage: 4,
        attackerDestroyed: false,
        defenderDestroyed: false
      }
    ]
  };

  await When("BattleScreen builds the coordinated cluster plan", async () => {
    coordinatedPlan = (screen as any).buildCoordinatedAirPlaybackPlanForCluster(
      [
        {
          kind: "linkedStrike",
          index: 0,
          focusHex: { q: 1, r: -1 },
          focusKey: "1,-1",
          flight: {
            missionId: "strike-live-coordinated",
            faction: "Bot",
            kind: "strike",
            unitKey: "bomber-1",
            originKey: "8,2",
            destKey: "1,-1",
            unitType: "Bomber",
            strength: 100,
            laneOffsetPx: 0
          },
          linkedEvents: [coordinatedEvent],
          escorts: [
            {
              missionId: "escort-live-coordinated",
              faction: "Bot",
              kind: "escort",
              unitKey: "escort-1",
              originKey: "7,1",
              destKey: "1,-1",
              unitType: "Fighter",
              strength: 100,
              laneOffsetPx: 0,
              escortTargetUnitKey: "bomber-1"
            }
          ]
        }
      ],
      fakeEngine
    );
    coordinatedScene = coordinatedPlan?.scene ?? null;
  });

  await Then("the coordinated scene should inherit the shared timing policy and HQ context", async () => {
    if (!coordinatedScene) {
      throw new Error("Expected BattleScreen to build a coordinated airshow scene.");
    }
    assert.ok(coordinatedPlan);
    singleScene([coordinatedScene]);
    assert.deepEqual(coordinatedPlan.handledOperationIndices, [0]);
    assert.deepEqual(coordinatedPlan.residualOperations, []);
    assert.deepEqual(coordinatedPlan.strikeMissionIds, ["strike-live-coordinated"]);
    assert.equal(coordinatedPlan.announcementEvents.length, 1);
    assert.strictEqual(coordinatedPlan.announcementEvents[0], coordinatedEvent);
    assert.deepEqual(coordinatedPlan.flakAnnouncementEvents, []);
    assert.equal(coordinatedScene.escortExchanges?.length, 1);
    assert.equal(coordinatedScene.bomberPassExchanges?.length, 1);
    assert.strictEqual(coordinatedScene.escortExchanges[0], coordinatedEvent.escortExchanges?.[0]);
    assert.strictEqual(coordinatedScene.bomberPassExchanges[0], coordinatedEvent.bomberPassExchanges?.[0]);

    const expectedPolicy = buildCoordinatedAirClusterTimingPolicy();
    if (coordinatedScene.fighterIngressDurationMs !== expectedPolicy.fighterIngressDurationMs) {
      throw new Error(
        `Expected coordinated fighter ingress ${expectedPolicy.fighterIngressDurationMs}, ` +
        `saw ${coordinatedScene.fighterIngressDurationMs ?? "<missing>"}.`
      );
    }
    if (coordinatedScene.escortClashDurationMs !== expectedPolicy.escortClashDurationMs) {
      throw new Error(
        `Expected coordinated escort clash ${expectedPolicy.escortClashDurationMs}, ` +
        `saw ${coordinatedScene.escortClashDurationMs ?? "<missing>"}.`
      );
    }
    if (coordinatedScene.bomberIngressDurationMs !== expectedPolicy.bomberIngressDurationMs) {
      throw new Error(
        `Expected coordinated bomber ingress ${expectedPolicy.bomberIngressDurationMs}, ` +
        `saw ${coordinatedScene.bomberIngressDurationMs ?? "<missing>"}.`
      );
    }
    if (coordinatedScene.bomberPassDurationMs !== expectedPolicy.bomberPassDurationMs) {
      throw new Error(
        `Expected coordinated bomber pass ${expectedPolicy.bomberPassDurationMs}, ` +
        `saw ${coordinatedScene.bomberPassDurationMs ?? "<missing>"}.`
      );
    }
    if (coordinatedScene.strikeRunDurationMs !== expectedPolicy.strikeRunDurationMs) {
      throw new Error(
        `Expected coordinated strike run ${expectedPolicy.strikeRunDurationMs}, ` +
        `saw ${coordinatedScene.strikeRunDurationMs ?? "<missing>"}.`
      );
    }
    if (coordinatedScene.egressDurationMs !== expectedPolicy.egressDurationMs) {
      throw new Error(
        `Expected coordinated egress ${expectedPolicy.egressDurationMs}, ` +
        `saw ${coordinatedScene.egressDurationMs ?? "<missing>"}.`
      );
    }
    if (coordinatedScene.bombReleaseProgress !== expectedPolicy.bombReleaseProgress) {
      throw new Error(
        `Expected coordinated bomb release progress ${expectedPolicy.bombReleaseProgress}, ` +
        `saw ${coordinatedScene.bombReleaseProgress ?? "<missing>"}.`
      );
    }
    const expectedComputedLeadMs = resolveCoordinatedAirClusterLeadWindow(
      true,
      1,
      expectedPolicy.fighterIngressDurationMs,
      expectedPolicy.escortClashDurationMs,
      expectedPolicy.bomberStartDelayMs
    ).bomberStartDelayMs;
    if (coordinatedPlan?.bomberStartDelayMs !== expectedComputedLeadMs) {
      throw new Error(
        `Expected coordinated computed bomber start delay ${expectedComputedLeadMs}, ` +
        `saw ${coordinatedPlan?.bomberStartDelayMs ?? "<missing>"}.`
      );
    }
    if (coordinatedScene.bomberArrivalDelayMs !== coordinatedPlan?.bomberStartDelayMs) {
      throw new Error(
        `Expected scene bomber arrival delay ${coordinatedPlan?.bomberStartDelayMs ?? "<missing>"}, ` +
        `saw ${coordinatedScene.bomberArrivalDelayMs ?? "<missing>"}.`
      );
    }
    const playerHqOffset = CoordinateSystem.axialToOffset(fakeEngine.getPlayerHq().q, fakeEngine.getPlayerHq().r);
    const botHqOffset = CoordinateSystem.axialToOffset(fakeEngine.getBotHq().q, fakeEngine.getBotHq().r);
    const expectedPlayerHqKey = CoordinateSystem.makeHexKey(playerHqOffset.col, playerHqOffset.row);
    const expectedBotHqKey = CoordinateSystem.makeHexKey(botHqOffset.col, botHqOffset.row);
    if (coordinatedScene.playerHqKey !== expectedPlayerHqKey || coordinatedScene.botHqKey !== expectedBotHqKey) {
      throw new Error(
        `Expected HQ keys ${expectedPlayerHqKey} and ${expectedBotHqKey}, saw ` +
        `${coordinatedScene.playerHqKey ?? "<missing>"} and ${coordinatedScene.botHqKey ?? "<missing>"}.`
      );
    }
  });
});

registerTest("BATTLESCREEN_RESOLVED_AIRSHOW_USES_RESOLVED_EVENT_ESCORTS_AND_KEEPS_BOMBER_CORRIDOR_CONTEXT", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let resolvedScene: ResolvedAirShowScene | null = null;
  let thrownMessage: string | null = null;
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeRenderer = {
    async animateResolvedAirCombatShow(scene: ResolvedAirShowScene): Promise<void> {
      resolvedScene = scene;
    }
  };

  await Given("a mission air intercept event with a linked escort flight and a downstream strike target", async () => {
    screen = new BattleScreen(
      {} as any,
      { ensureGameEngine: () => ({}) } as any,
      {} as any,
      fakeRenderer as any,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).announceAirInterceptEngagement = () => {};
    (screen as any).waitMs = async (): Promise<void> => {};
    (screen as any).resolveAirEngagementOffsetKey = (unitKey: string) => {
      const origins: Record<string, string> = {
        "cap-1": "0,2",
        "bomber-1": "-1,-2",
        "escort-1": "1,-2"
      };
      return origins[unitKey] ?? null;
    };
    (screen as any).resolveAirSquadronStrength = () => 100;
  });

  const event: AirEngagementEvent = {
    type: "airToAir",
    missionId: "strike-live-3",
    location: { q: 0, r: 0 },
    bomber: {
      faction: "Bot",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: 100
    },
    interceptors: [
      {
        faction: "Player",
        unitKey: "cap-1",
        unitType: "Interceptor",
        strength: 100
      }
    ],
    escorts: [],
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 72,
    bomberDestroyed: false,
    interceptorAttrition: 12,
    escortAttrition: 0,
    escortsEngaged: 0,
    interceptorsAfterEscortPhase: 1,
    escortsAfterEscortPhase: 0,
    bomberPassExchanges: [
      {
        phase: "bomberPass",
        attackerFaction: "Player",
        attackerUnitKey: "cap-1",
        attackerUnitType: "Interceptor",
        defenderFaction: "Bot",
        defenderUnitKey: "bomber-1",
        defenderUnitType: "Bomber",
        attackerStrengthBefore: 100,
        attackerStrengthAfter: 88,
        defenderStrengthBefore: 100,
        defenderStrengthAfter: 72,
        damageToDefender: 28,
        retaliationDamage: 12,
        attackerDestroyed: false,
        defenderDestroyed: false,
        visualPasses: 2
      }
    ]
  };
  const linkedEscortFlights = [
    {
      missionId: "escort-live-3",
      faction: "Bot" as const,
      kind: "escort",
      unitKey: "escort-1",
      originKey: "1,-2",
      destKey: "0,0",
      unitType: "Fighter",
      strength: 100,
      laneOffsetPx: 0,
      escortTargetUnitKey: "bomber-1"
    }
  ];

  await When("the resolved airshow scene is built for playback", async () => {
    try {
      await (screen as any).playMissionAirInterceptEvent(
        event,
        "0,0",
        fakeRenderer,
        {} as any,
        0,
        false,
        false,
        900,
        true,
        "-1,-2",
        linkedEscortFlights,
        "3,0"
      );
    } catch (error) {
      thrownMessage = error instanceof Error ? error.message : String(error);
    }
  });

  await Then("playback should fail loudly instead of animating a broken linked-escort package", async () => {
    assert.equal(thrownMessage, "[AirSprite] Linked escort flights missing from resolved event strike-live-3: escort-1");
    if (resolvedScene) {
      throw new Error(`Did not expect the renderer to receive a broken scene, saw ${JSON.stringify(resolvedScene)}.`);
    }
  });
});

registerTest("BATTLESCREEN_COORDINATED_AIRSHOW_KEEPS_FLAK_ATTRITION_OUT_OF_ESCORT_PHASE_STRENGTH", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let coordinatedScene: ResolvedAirShowScene | null = null;
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeEngine = {
    getPlayerHq: () => ({ q: -6, r: 2 }),
    getBotHq: () => ({ q: 7, r: -3 })
  } as const;

  await Given("a coordinated strike with both fighter damage and later flak damage", async () => {
    screen = new BattleScreen(
      {} as any,
      {
        ensureGameEngine: () => fakeEngine,
        tryGetGameEngine: () => fakeEngine,
        hasEngine: () => true
      } as any,
      {} as any,
      {} as any,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).resolveAirEngagementOffsetKey = (unitKey: string) => {
      const origins: Record<string, string> = {
        "cap-1": "2,1",
        "escort-1": "7,1",
        "bomber-1": "8,2"
      };
      return origins[unitKey] ?? null;
    };
    (screen as any).resolveAirSquadronStrength = () => 100;
  });

  await When("BattleScreen builds the coordinated cluster scene", async () => {
    const airToAirEvent: AirEngagementEvent = {
      type: "airToAir",
      missionId: "strike-live-flak-contract",
      location: { q: 1, r: -1 },
      bomber: {
        faction: "Bot",
        unitKey: "bomber-1",
        unitType: "Bomber",
        strength: 100
      },
      interceptors: [
        {
          faction: "Player",
          unitKey: "cap-1",
          unitType: "Interceptor",
          strength: 100
        }
      ],
      escorts: [
        {
          faction: "Bot",
          unitKey: "escort-1",
          unitType: "Fighter",
          strength: 100
        }
      ],
      bomberStrengthBefore: 100,
      bomberStrengthAfter: 82,
      bomberDestroyed: false
    };
    const flakEvent: AirEngagementEvent = {
      type: "flak",
      missionId: "strike-live-flak-contract",
      location: { q: 1, r: -1 },
      bomber: {
        faction: "Bot",
        unitKey: "bomber-1",
        unitType: "Bomber",
        strength: 82
      },
      interceptors: [
        {
          faction: "Player",
          unitKey: "flak-1",
          unitType: "Flak_88",
          strength: 100,
          hex: { q: 1, r: 0 }
        }
      ],
      escorts: [],
      bomberStrengthBefore: 82,
      bomberStrengthAfter: 41,
      bomberDestroyed: false,
      flakDamage: 41
    };
    const coordinatedPlan = (screen as any).buildCoordinatedAirPlaybackPlanForCluster(
      [
        {
          kind: "linkedStrike",
          index: 0,
          focusHex: { q: 1, r: -1 },
          focusKey: "1,-1",
          flight: {
            missionId: "strike-live-flak-contract",
            faction: "Bot",
            kind: "strike",
            unitKey: "bomber-1",
            originKey: "8,2",
            destKey: "1,-1",
            unitType: "Bomber",
            strength: 100,
            laneOffsetPx: 0
          },
          linkedEvents: [airToAirEvent, flakEvent],
          escorts: [
            {
              missionId: "escort-live-flak-contract",
              faction: "Bot",
              kind: "escort",
              unitKey: "escort-1",
              originKey: "7,1",
              destKey: "1,-1",
              unitType: "Fighter",
              strength: 100,
              laneOffsetPx: 0,
              escortTargetUnitKey: "bomber-1"
            }
          ]
        }
      ],
      fakeEngine
    );
    coordinatedScene = coordinatedPlan?.scene ?? null;
  });

  await Then("the bomber contract should preserve post-escort strength before flak resolves final attrition", async () => {
    if (!coordinatedScene) {
      throw new Error("Expected a coordinated scene.");
    }
    singleScene([coordinatedScene]);
    assert.equal(coordinatedScene.bombers?.length, 1);
    const bomber = coordinatedScene.bombers?.[0];
    if (!bomber) {
      throw new Error("Expected coordinated bomber spec.");
    }
    if (bomber.strengthAfterEscortPhase !== 82) {
      throw new Error(
        `Expected bomber strengthAfterEscortPhase 82 from the fighter pass, saw ${bomber.strengthAfterEscortPhase ?? "<missing>"}.`
      );
    }
    if (bomber.finalStrength !== 41) {
      throw new Error(
        `Expected bomber finalStrength 41 after flak, saw ${bomber.finalStrength ?? "<missing>"}.`
      );
    }
    assert.equal(bomber.id, "bomber-1");
    assert.equal(bomber.strengthBefore, 100);
    assert.deepEqual(coordinatedScene.escorts.map((flight) => [flight.id, flight.strengthAfterEscortPhase, flight.finalStrength]),
      [["escort-1", 100, 100]], "Flak must not change escort strength.");
    assert.deepEqual(coordinatedScene.interceptors.map((flight) => [flight.id, flight.strengthAfterEscortPhase, flight.finalStrength]),
      [["cap-1", 100, 100]], "Flak must not change CAP strength.");
    assert.equal(coordinatedScene.flakBursts?.length, 1);
    assert.equal(coordinatedScene.flakBursts[0].bomberUnitKey, "bomber-1");
    assert.equal(coordinatedScene.flakBursts[0].targetHexKey, "1,-1");
    assert.equal(coordinatedScene.flakBursts[0].batteryHexKey, "1,0");
  });
});

registerTest("BATTLESCREEN_RESOLVED_AIRSHOW_KEEPS_BOMBER_VISIBLE_EVEN_WITHOUT_A_BOMBER_DEFENSE_PASS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  const scenes: ResolvedAirShowScene[] = [];
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeRenderer = {
    async animateResolvedAirCombatShow(scene: ResolvedAirShowScene): Promise<void> {
      scenes.push(scene);
    }
  };

  await Given("an intercepted strike package whose bomber reaches the strike run without a bomber-pass exchange", async () => {
    screen = new BattleScreen(
      {} as any,
      { ensureGameEngine: () => ({}) } as any,
      {} as any,
      fakeRenderer as any,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).announceAirInterceptEngagement = () => {};
    (screen as any).waitMs = async (): Promise<void> => {};
    (screen as any).resolveAirEngagementOffsetKey = (unitKey: string) => {
      const origins: Record<string, string> = {
        "cap-1": "0,2",
        "bomber-1": "-1,-2",
        "escort-1": "1,-2"
      };
      return origins[unitKey] ?? null;
    };
    (screen as any).resolveAirSquadronStrength = () => 100;
  });

  const event: AirEngagementEvent = {
    type: "airToAir",
    missionId: "strike-live-4",
    location: { q: 0, r: 0 },
    bomber: {
      faction: "Bot",
      unitKey: "bomber-1",
      unitType: "Bomber",
      strength: 100
    },
    interceptors: [
      {
        faction: "Player",
        unitKey: "cap-1",
        unitType: "Interceptor",
        strength: 100
      }
    ],
    escorts: [
      {
        faction: "Bot",
        unitKey: "escort-1",
        unitType: "Fighter",
        strength: 100
      }
    ],
    bomberStrengthBefore: 100,
    bomberStrengthAfter: 100,
    bomberDestroyed: false,
    interceptorAttrition: 0,
    escortAttrition: 0,
    escortsEngaged: 1,
    interceptorsAfterEscortPhase: 0,
    escortsAfterEscortPhase: 1,
    bomberPassExchanges: [],
    escortExchanges: [],
    interceptorStrengthsAfterEscortPhase: [0],
    escortStrengthsAfterEscortPhase: [100],
    interceptorFinalStrengths: [0],
    escortFinalStrengths: [100]
  };

  await When("the resolved airshow scene is built without a bomber-defense pass", async () => {
    await (screen as any).playMissionAirInterceptEvent(
      event,
      "0,0",
      fakeRenderer,
      {} as any,
      0,
      false,
      false,
      0,
      false,
      "-1,-2",
      [],
      "3,0"
    );
  });

  await Then("the bomber should still be present in the resolved scene so the strike run and flak phase can render", async () => {
    const resolvedScene = singleScene(scenes);
    assert.equal(resolvedScene.bombers?.length, 1);
    assert.equal(resolvedScene.bomber?.originHexKey, "-1,-2");
    assert.equal(resolvedScene.bomber?.strengthBefore, 100);
    assert.equal(resolvedScene.bomber?.finalStrength, 100);
    assert.deepEqual(resolvedScene.interceptors.map((flight) => [flight.id, flight.finalStrength]), [["cap-1", 0]]);
    assert.deepEqual(resolvedScene.escorts.map((flight) => [flight.id, flight.finalStrength]), [["escort-1", 100]]);
    assertSceneTiming(resolvedScene, 0);
    if (!resolvedScene.bomber || resolvedScene.bomber.id !== "bomber-1") {
      throw new Error(`Expected bomber-1 to remain in the resolved scene, saw ${JSON.stringify(resolvedScene)}.`);
    }
    if ((resolvedScene.bomberPassExchanges ?? []).length !== 0) {
      throw new Error(`Did not expect bomber-pass exchanges when the defense pass is disabled, saw ${JSON.stringify(resolvedScene.bomberPassExchanges)}.`);
    }
    if (resolvedScene.bomberTargetHexKey !== "3,0") {
      throw new Error(`Expected the strike corridor target to remain available for the target run, saw ${resolvedScene.bomberTargetHexKey ?? "<missing>"}.`);
    }
  });
});

registerTest("BATTLESCREEN_INTERCEPTED_LINKED_STRIKES_KEEP_BOMBER_RUN_INSIDE_THE_RESOLVED_AIRSHOW", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  const callOrder: string[] = [];
  const interceptCalls: unknown[][] = [];
  const impactCalls: unknown[][] = [];
  const flakAnnouncements: AirEngagementEvent[] = [];
  const interceptStarted = deferred();
  const interceptFinished = deferred();
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const fakeRenderer = {} as any;
  const fakeEngine = {
    getScheduledAirMissions() {
      return [];
    }
  } as any;

  await Given("a linked strike that is intercepted before reaching the target", async () => {
    screen = new BattleScreen(
      {} as any,
      { ensureGameEngine: () => fakeEngine } as any,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      {} as any,
      null
    );
    (screen as any).focusCameraOnHex = async (): Promise<void> => {};
    (screen as any).waitForNextFrame = async (): Promise<void> => {};
    (screen as any).waitMs = async (): Promise<void> => {};
    (screen as any).announceFlakEngagement = (event: AirEngagementEvent) => { flakAnnouncements.push(event); };
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).playMissionAirInterceptEvent = async (...args: unknown[]) => {
      interceptCalls.push(args);
      callOrder.push(`intercept:${(args[12] as { type?: string } | null)?.type ?? "none"}`);
      interceptStarted.resolve();
      await interceptFinished.promise;
    };
    (screen as any).animateAircraftLeg = async () => {
      callOrder.push("legacyLeg");
    };
    (screen as any).playDamagedAircraftReturn = async () => {
      callOrder.push("legacyReturn");
    };
    (screen as any).playResolvedAirStrikeImpact = async (
      _flight: unknown,
      _renderer: unknown,
      _engine: unknown,
      playEffects: boolean = true
    ) => {
      impactCalls.push([_flight, _renderer, _engine, playEffects]);
      callOrder.push(`impact:${playEffects ? "fx" : "state"}`);
    };
  });

  const flight: ClusterPlaybackFlight = {
    missionId: "strike-live-5",
    faction: "Bot",
    kind: "strike",
    unitKey: "bomber-1",
    originKey: "0,0",
    destKey: "3,0",
    unitType: "Bomber",
    strength: 100,
    laneOffsetPx: 0
  };
  const events: AirEngagementEvent[] = [
    {
      type: "flak",
      missionId: "strike-live-5",
      location: { q: 2, r: 0 },
      bomber: { faction: "Bot", unitKey: "bomber-1", unitType: "Bomber", strength: 100 },
      interceptors: [
        { faction: "Player", unitKey: "flak-1", unitType: "Flak_88", strength: 100, hex: { q: 2, r: 1 } }
      ],
      escorts: [],
      flakDamage: 12,
      bomberStrengthBefore: 100,
      bomberStrengthAfter: 88,
      bomberDestroyed: false
    },
    {
      type: "airToAir",
      missionId: "strike-live-5",
      location: { q: 2, r: 0 },
      bomber: { faction: "Bot", unitKey: "bomber-1", unitType: "Bomber", strength: 88 },
      interceptors: [
        { faction: "Player", unitKey: "cap-1", unitType: "Interceptor", strength: 100 }
      ],
      escorts: [
        { faction: "Bot", unitKey: "escort-1", unitType: "Fighter", strength: 100 }
      ],
      bomberStrengthBefore: 88,
      bomberStrengthAfter: 61,
      bomberDestroyed: false,
      interceptorAttrition: 11,
      escortAttrition: 19,
      escortsEngaged: 1,
      interceptorsAfterEscortPhase: 1,
      escortsAfterEscortPhase: 1,
      bomberPassExchanges: [
        {
          phase: "bomberPass",
          attackerFaction: "Player",
          attackerUnitKey: "cap-1",
          attackerUnitType: "Interceptor",
          defenderFaction: "Bot",
          defenderUnitKey: "bomber-1",
          defenderUnitType: "Bomber",
          attackerStrengthBefore: 100,
          attackerStrengthAfter: 89,
          defenderStrengthBefore: 88,
          defenderStrengthAfter: 61,
          damageToDefender: 27,
          retaliationDamage: 11,
          attackerDestroyed: false,
          defenderDestroyed: false,
          visualPasses: 2
        }
      ]
    }
  ];
  const escorts: ClusterPlaybackFlight[] = [
    {
      missionId: "escort-live-5",
      faction: "Bot",
      kind: "escort",
      unitKey: "escort-1",
      originKey: "1,-1",
      destKey: "3,0",
      unitType: "Fighter",
      strength: 100,
      laneOffsetPx: 12,
      escortTargetUnitKey: "bomber-1"
    }
  ];

  let playback: Promise<void> | undefined;
  await When("the linked strike playback runs", async () => {
    playback = (screen as any).playMissionStrikeOperation(flight, events, escorts, fakeRenderer, fakeEngine, true);
    await interceptStarted.promise;
  });

  await Then("the bomber run should stay inside the resolved airshow without legacy strike legs or returns", async () => {
    try {
      assert.deepEqual(callOrder, ["intercept:flak"], "State impact must wait until resolved playback finishes.");
      assert.equal(interceptCalls.length, 1);
      const args = interceptCalls[0];
      assert.strictEqual(args[0], events[1], "The exact CAP event must be handed off.");
      assert.equal(args[1], "2,1", "The axial interception location must be converted to renderer offset coordinates.");
      assert.strictEqual(args[2], fakeRenderer);
      assert.strictEqual(args[3], fakeEngine);
      assert.equal(args[4], flight.laneOffsetPx);
      assert.equal(args[5], false, "Keep escorts in the resolved package.");
      assert.equal(args[6], true, "Announce the linked event once.");
      assert.equal(args[7], resolveAirInterceptBomberArrivalDelayMs());
      assert.equal(args[8], true);
      assert.equal(args[9], flight.originKey);
      assert.strictEqual(args[10], escorts);
      assert.equal(args[11], flight.destKey);
      assert.strictEqual(args[12], events[0], "The exact linked flak event must be handed off.");
    } finally {
      interceptFinished.resolve();
      await playback;
    }
    assert.deepEqual(callOrder, ["intercept:flak", "impact:state"], "Only one resolved playback and one state-only impact are allowed.");
    assert.equal(impactCalls.length, 1);
    assert.strictEqual(impactCalls[0][0], flight);
    assert.strictEqual(impactCalls[0][1], fakeRenderer);
    assert.strictEqual(impactCalls[0][2], fakeEngine);
    assert.equal(impactCalls[0][3], false);
    assert.equal(flakAnnouncements.length, 1);
    assert.strictEqual(flakAnnouncements[0], events[0]);
  });
});

registerTest("BATTLESCREEN_COMPLEX_AIR_COMBAT_CLUSTERS_OVERLAP_NEARBY_PACKAGES_AFTER_THE_SHARED_CAMERA_FOCUS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  const callOrder: string[] = [];
  const scenes: ResolvedAirShowScene[] = [];
  const rendererStarted = deferred();
  const rendererFinished = deferred();
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }
  const linkedFlight: ClusterPlaybackFlight = {
    missionId: "overlap-strike", faction: "Bot", kind: "strike", unitKey: "bomber-1",
    originKey: "-2,0", destKey: "0,0", unitType: "Bomber", strength: 100, laneOffsetPx: 0
  };
  const nearbyFlight: ClusterPlaybackFlight = {
    missionId: "overlap-nearby-strike", faction: "Bot", kind: "strike", unitKey: "bomber-2",
    originKey: "-2,1", destKey: "0,1", unitType: "Bomber", strength: 100, laneOffsetPx: 12
  };
  const event: AirEngagementEvent = {
    type: "airToAir", missionId: "overlap-strike", location: { q: 0, r: 0 },
    bomber: { faction: "Bot", unitKey: "bomber-1", unitType: "Bomber", strength: 100 },
    interceptors: [{ faction: "Player", unitKey: "cap-1", unitType: "Interceptor", strength: 100 }],
    escorts: [], bomberStrengthBefore: 100, bomberStrengthAfter: 80, bomberDestroyed: false,
    interceptorStrengthsAfterEscortPhase: [100], interceptorFinalStrengths: [90],
    bomberPassExchanges: [{
      phase: "bomberPass", attackerFaction: "Player", attackerUnitKey: "cap-1", attackerUnitType: "Interceptor",
      defenderFaction: "Bot", defenderUnitKey: "bomber-1", defenderUnitType: "Bomber",
      attackerStrengthBefore: 100, attackerStrengthAfter: 90,
      defenderStrengthBefore: 100, defenderStrengthAfter: 80,
      damageToDefender: 20, retaliationDamage: 10, attackerDestroyed: false, defenderDestroyed: false, visualPasses: 2
    }]
  };
  const operations: ClusterPlaybackOperation[] = [
    { kind: "linkedStrike", index: 0, focusHex: { q: 0, r: 0 }, focusKey: "0,0",
      flight: linkedFlight, linkedEvents: [event], escorts: [] },
    { kind: "flight", index: 1, focusHex: { q: 0, r: 1 }, focusKey: "0,1", flight: nearbyFlight }
  ];
  const fakeRenderer = {
    async animateResolvedAirCombatShow(scene: ResolvedAirShowScene): Promise<void> {
      scenes.push(scene);
      callOrder.push("renderer:start");
      rendererStarted.resolve();
      await rendererFinished.promise;
      callOrder.push("renderer:complete");
    }
  };
  const announcements: AirEngagementEvent[] = [];

  await Given("a playback cluster that contains an intercepted linked strike and another nearby bomber sortie", async () => {
    screen = new BattleScreen(
      {} as any, { ensureGameEngine: () => ({}) } as any, {} as any, fakeRenderer as any,
      null, null, null, {} as any, null
    );
    (screen as any).focusCameraOnHex = async (key: string): Promise<void> => { callOrder.push(`focus:${key}`); };
    (screen as any).waitForNextFrame = async (): Promise<void> => {};
    (screen as any).waitMs = async (): Promise<void> => {};
    (screen as any).resolveAirEngagementOffsetKey = (unitKey: string): string | null => unitKey === "cap-1" ? "2,0" : null;
    (screen as any).resolveAirSquadronStrength = (): number => 100;
    (screen as any).announceAirInterceptEngagement = (engagement: AirEngagementEvent): void => { announcements.push(engagement); };
    (screen as any).playMissionStrikeOperation = async (): Promise<void> => { callOrder.push("unexpectedLinkedReplay"); };
    (screen as any).playStandaloneAirMissionFlight = async (): Promise<void> => { callOrder.push("unexpectedStandaloneFlight"); };
    (screen as any).playStandaloneAirEngagementEvent = async (): Promise<void> => { callOrder.push("unexpectedStandaloneEvent"); };
  });

  let playback: Promise<void> | undefined;
  let playbackCompleted = false;
  await When("the complex playback cluster starts", async () => {
    playback = (screen as any).playAirPlaybackCluster(operations, fakeRenderer, {})
      .then(() => { playbackCompleted = true; });
    await rendererStarted.promise;
  });

  await Then("both bomber packages should share one active scene after the camera focus", async () => {
    try {
      assert.deepEqual(callOrder, ["focus:0,0", "renderer:start"]);
      assert.equal(playbackCompleted, false, "The shared cluster must await resolved playback.");
      const scene = singleScene(scenes);
      assert.deepEqual(scene.bombers?.map((flight) => [flight.id, flight.originHexKey, flight.targetHexKey, flight.strengthBefore, flight.finalStrength]), [
        ["bomber-1", "-2,0", "0,0", 100, 80],
        ["bomber-2", "-2,1", "0,1", 100, 100]
      ], "The nearby bomber must join the active scene instead of waiting for the intercepted package to finish.");
      assert.deepEqual(scene.interceptors.map((flight) => [flight.id, flight.originHexKey, flight.finalStrength]), [["cap-1", "2,0", 90]]);
      assert.equal(scene.bomberPassExchanges?.length, 1);
      assert.strictEqual(scene.bomberPassExchanges[0], event.bomberPassExchanges?.[0]);
      assert.equal(announcements.length, 1);
      assert.strictEqual(announcements[0], event);
      const policy = buildCoordinatedAirClusterTimingPolicy();
      assert.equal(scene.bomberArrivalDelayMs, resolveCoordinatedAirClusterLeadWindow(
        true, 2, policy.fighterIngressDurationMs, policy.escortClashDurationMs, policy.bomberStartDelayMs
      ).bomberStartDelayMs);
    } finally {
      rendererFinished.resolve();
      await playback;
    }
    assert.equal(playbackCompleted, true);
    assert.equal(scenes.length, 1);
    assert.deepEqual(callOrder, ["focus:0,0", "renderer:start", "renderer:complete"], "Neither package nor its event may replay after the shared scene.");
  });
});
