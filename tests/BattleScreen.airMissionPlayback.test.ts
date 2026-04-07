import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import type { AirEngagementEvent, AirMissionArrival } from "../src/game/GameEngine";
import type { ScenarioUnit } from "../src/core/types";

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
      async animateAircraftSortie(
        fromKey: string,
        toKey: string,
        _returnKey: string,
        unitType: string,
        options?: { onTargetPass?: () => Promise<void> | void }
      ): Promise<void> {
        callOrder.push(`sortie:${unitType}:${fromKey}->${toKey}`);
        await options?.onTargetPass?.();
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

      if (!callOrder.includes("sortie:Bomber:0,0->2,0")) {
        throw new Error(`Expected bomber sortie to use live target 2,0, saw ${JSON.stringify(callOrder)}.`);
      }

      if (!callOrder.includes("sortie:Fighter:1,0->2,0")) {
        throw new Error(`Expected linked escort sortie to be painted toward the same target, saw ${JSON.stringify(callOrder)}.`);
      }

      if (!callOrder.includes("impact:2,0") || !callOrder.includes("markDamaged:2,0")) {
        throw new Error(`Expected strike impact aftermath on the live target hex, saw ${JSON.stringify(callOrder)}.`);
      }
    });
  } finally {
    window.setTimeout = originalSetTimeout;
  }
});

registerTest("BATTLESCREEN_AIR_INTERCEPTS_PLAY_ESCORT_CLASH_BEFORE_BOMBER_DEFENSE_PASS", async ({ Given, When, Then }) => {
  const callOrder: string[] = [];
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
    escortsAfterEscortPhase: 1
  };

  await When("the mission air intercept event is played", async () => {
    await (screen as any).playMissionAirInterceptEvent(event, "0,0", fakeRenderer, fakeEngine, 0, false);
  });

  await Then("the escorts and interceptors should fly in before two separate gun passes are shown", async () => {
    const dogfightCalls = callOrder.filter((entry) => entry.startsWith("dogfight:"));
    const bomberDefenseCalls = callOrder.filter((entry) => entry.startsWith("bomber-defense:"));
    if (dogfightCalls.length !== 1 || bomberDefenseCalls.length !== 1) {
      throw new Error(`Expected one escort dogfight and one bomber-defense pass, saw ${JSON.stringify(callOrder)}.`);
    }

    const firstDogfightIndex = callOrder.findIndex((entry) => entry.startsWith("dogfight:"));
    if (firstDogfightIndex <= 0) {
      throw new Error(`Expected aircraft fly-ins before the first gun pass, saw ${JSON.stringify(callOrder)}.`);
    }

    if (!callOrder.some((entry) => entry.startsWith("fly:Player:Interceptor:")) || !callOrder.some((entry) => entry.startsWith("fly:Bot:Fighter:"))) {
      throw new Error(`Expected both interceptors and escorts to fly into the engagement, saw ${JSON.stringify(callOrder)}.`);
    }
  });
});

registerTest("BATTLESCREEN_AIR_INTERCEPTS_STOP_DESTROYED_ESCORTS_FROM_CONTINUING_INTO_THE_BOMBER_PASS", async ({ Given, When, Then }) => {
  const callOrder: string[] = [];
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
    escortFinalStrengths: [0]
  };

  await When("the mission air intercept event is played through both phases", async () => {
    await (screen as any).playMissionAirInterceptEvent(event, "0,0", fakeRenderer, fakeEngine, 0, false, false, 900, true);
  });

  await Then("the destroyed escort should orbit in the opening clash only and not continue into the bomber pass", async () => {
    const escortOrbits = callOrder.filter((entry) => entry.startsWith("orbit:Fighter:"));
    const interceptorOrbits = callOrder.filter((entry) => entry.startsWith("orbit:Interceptor:"));

    if (escortOrbits.length !== 1) {
      throw new Error(`Expected the destroyed escort to disappear after the first dogfight stage, saw ${JSON.stringify(callOrder)}.`);
    }
    if (interceptorOrbits.length < 2) {
      throw new Error(`Expected the surviving interceptor to keep orbiting into the bomber pass, saw ${JSON.stringify(callOrder)}.`);
    }
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
    async playDogfight(hexKey: string): Promise<void> {
      callOrder.push(`dogfight:${hexKey}`);
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
    escortsAfterEscortPhase: 1
  };

  await When("the mission air intercept event is played with a delayed bomber arrival window", async () => {
    await (screen as any).playMissionAirInterceptEvent(event, "0,0", fakeRenderer, fakeEngine, 0, false, false, 900, true);
  });

  await Then("the bomber-defense pass should wait substantially longer than the escort opening burst", async () => {
    const dogfightCalls = callOrder.filter((entry) => entry.startsWith("dogfight:"));
    const bomberDefenseCalls = callOrder.filter((entry) => entry.startsWith("bomber-defense:"));
    if (dogfightCalls.length !== 1 || bomberDefenseCalls.length !== 1) {
      throw new Error(`Expected one escort dogfight and one bomber-defense pass, saw ${JSON.stringify(callOrder)}.`);
    }

    if (!waits.some((durationMs) => durationMs >= 700)) {
      throw new Error(`Expected a substantial hold before the bomber-defense pass, saw waits ${JSON.stringify(waits)}.`);
    }
  });
});

registerTest("BATTLESCREEN_AIR_INTERCEPTS_SKIP_THE_BOMBER_PASS_WHEN_FLAK_ALREADY_BREAKS_UP_THE_STRIKE", async ({ Given, When, Then }) => {
  const callOrder: string[] = [];
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
    escortsAfterEscortPhase: 1
  };

  await When("the air intercept playback is told the bomber-defense pass is unavailable", async () => {
    await (screen as any).playMissionAirInterceptEvent(event, "0,0", fakeRenderer, fakeEngine, 0, false, false, 900, false);
  });

  await Then("only the escort clash should be shown", async () => {
    const dogfightCalls = callOrder.filter((entry) => entry.startsWith("dogfight:"));
    const bomberDefenseCalls = callOrder.filter((entry) => entry.startsWith("bomber-defense:"));
    if (dogfightCalls.length !== 1 || bomberDefenseCalls.length !== 0) {
      throw new Error(`Expected only one escort clash pass when flak already broke up the strike, saw ${JSON.stringify(callOrder)}.`);
    }
  });
});

registerTest("BATTLESCREEN_LINKED_CAP_SORTIES_ARE_NOT_REPLAYED_AS_STANDALONE_PATROLS", async ({ Given, When, Then }) => {
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
    (screen as any).playMissionStrikeOperation = async () => {
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

  await When("air operations are played", async () => {
    await (screen as any).playAirOperations(
      [] as AirMissionArrival[],
      [
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
      ]
    );
  });

  await Then("the CAP squadron should only appear inside the linked strike battle and not replay later as a patrol", async () => {
    if (!callOrder.includes("linkedStrike")) {
      throw new Error(`Expected the linked strike animation to run, saw ${JSON.stringify(callOrder)}.`);
    }
    if (callOrder.some((entry) => entry.startsWith("standalone:airCover:cap-squadron-1"))) {
      throw new Error(`Did not expect the claimed CAP squadron to replay as a standalone patrol, saw ${JSON.stringify(callOrder)}.`);
    }
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
