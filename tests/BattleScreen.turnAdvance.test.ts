import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import type { ScenarioUnit } from "../src/core/types";

registerTest("BATTLESCREEN_AUTO_SENTRY_APPLIES_TO_EACH_IDLE_STACK_MEMBER_BEFORE_TURN_ADVANCE", async ({ Given, When, Then }) => {
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const enterCalls: string[] = [];
  let renderCount = 0;
  let executedAdvance = false;

  const fakeEngine = {
    playerUnits: [
      {
        type: "Infantry_42" as unknown as ScenarioUnit["type"],
        hex: { q: 3, r: 2 },
        strength: 100,
        experience: 0,
        ammo: 6,
        fuel: 0,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "stack-alpha"
      },
      {
        type: "Flak_88" as unknown as ScenarioUnit["type"],
        hex: { q: 3, r: 2 },
        strength: 100,
        experience: 0,
        ammo: 6,
        fuel: 0,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"],
        unitId: "stack-bravo"
      }
    ] as ScenarioUnit[],
    enterSentry(_hex: { q: number; r: number }, unitId?: string) {
      if (unitId) {
        enterCalls.push(unitId);
      }
      return Boolean(unitId);
    }
  } as const;

  const fakeBattleState = {
    ensureGameEngine: () => fakeEngine,
    getIdlePlayerUnitKeys: () => ["3,2"]
  } as unknown as import("../src/state/BattleState").BattleState;

  let screen: BattleScreen;

  await Given("an idle warning with two player units stacked on one idle hex", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      null,
      null,
      null,
      null,
      null,
      null,
      null
    );
    (screen as any).pendingIdleTurnAdvance = { summary: { phase: "playerTurn" } };
    (screen as any).dismissIdleWarning = () => {};
    (screen as any).renderEngineUnits = () => {
      renderCount += 1;
    };
    (screen as any).executeTurnAdvance = async () => {
      executedAdvance = true;
    };
    (screen as any).completeTutorialPhase = () => {};
  });

  await When("the player confirms the turn advance", async () => {
    (screen as any).finalizeTurnAfterIdleWarning();
  });

  await Then("each stack member should be sentried individually before the turn advances", async () => {
    if (enterCalls.length !== 2) {
      throw new Error(`Expected both idle stack members to enter sentry, saw ${JSON.stringify(enterCalls)}.`);
    }
    if (!enterCalls.includes("stack-alpha") || !enterCalls.includes("stack-bravo")) {
      throw new Error(`Expected stack-specific sentry calls for both units, saw ${JSON.stringify(enterCalls)}.`);
    }
    if (renderCount !== 1) {
      throw new Error(`Expected unit rendering to refresh once after auto-sentry, saw ${renderCount}.`);
    }
    if (!executedAdvance) {
      throw new Error("Expected turn advance to continue after auto-sentry finishes.");
    }
  });
});

registerTest("BATTLESCREEN_TURN_ADVANCE_DOES_NOT_AUTO_OPEN_ARMY_ROSTER_WHILE_RESERVES_REMAIN", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let popupOpenCalls = 0;
  let turnNumber = 1;
  const reserves = [{ allocationKey: "Infantry_42" }];

  await Given("a player battle with reserves standing by across consecutive turns", async () => {
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).battleState = {
      endPlayerTurn: () => ({ attrition: [] }),
      getCurrentTurnSummary: () => ({
        turnNumber: turnNumber++,
        activeFaction: "Player",
        phase: "playerTurn"
      }),
      consumeBotTurnSummary: () => null,
      ensureGameEngine: () => ({
        getReserveSnapshot: () => reserves
      })
    };
    (screen as any).popupManager = {
      getActivePopup: () => null,
      openPopup: (popupId: string) => {
        if (popupId === "armyRoster") {
          popupOpenCalls += 1;
        }
      }
    };
    (screen as any).publishSelectionIntel = () => {};
    (screen as any).triggerSupportImpacts = async () => {};
    (screen as any).triggerAirOperations = async () => {};
    (screen as any).flushDeferredMissionLogSync = () => {};
    (screen as any).clearSelectedHex = () => {};
    (screen as any).refreshDeploymentMirrors = () => {};
    (screen as any).updateTurnStatusDisplay = () => {};
    (screen as any).updateTurnControls = () => {};
    (screen as any).refreshIdleUnitHighlights = () => {};
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).announceSupplyAttrition = () => {};
  });

  await When("two player turns begin with the reserve queue unchanged", async () => {
    await (screen as any).executeTurnAdvance({});
    await (screen as any).executeTurnAdvance({});
  });

  await Then("the roster remains passive and the reserves remain available", async () => {
    if (popupOpenCalls !== 0) {
      throw new Error(`Expected no automatic Army Roster popup, received ${popupOpenCalls} open calls.`);
    }
    if (reserves.length !== 1) {
      throw new Error("Turn advancement should not consume or hide the available reserve.");
    }
  });
});
