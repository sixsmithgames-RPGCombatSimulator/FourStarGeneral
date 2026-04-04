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
