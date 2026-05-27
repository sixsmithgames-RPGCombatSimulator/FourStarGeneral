import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import type { ScenarioUnit } from "../src/core/types";

function mountBattleScreenRoot(): HTMLElement {
  document.body.innerHTML = "<div id=\"battleScreen\"></div>";
  const root = document.getElementById("battleScreen");
  if (!root) {
    throw new Error("Battle screen root was not created for test");
  }
  return root;
}

function createPlayerUnit(unitId: string, q: number, r: number): ScenarioUnit {
  return {
    unitId,
    type: "Infantry_42",
    hex: { q, r },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 20,
    entrench: 0,
    facing: "NE",
    controlledBy: "Player",
    onSentry: false
  };
}

registerTest("BATTLESCREEN_INITIATIVE_ACTIONS_REQUIRE_CURRENT_ACTIVATION_UNIT", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let activeAllowed = false;
  let inactiveAllowed = true;

  await Given("initiative mode with a current player activation", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).initiativeMethods = {
      getCurrentActivation: () => ({ unitId: "u_player_1", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 0 })
    };
  });

  await When("eligibility is checked for the active and inactive unit ids", async () => {
    activeAllowed = (screen as any).isUnitInCurrentInitiativeGroup("u_player_1");
    inactiveAllowed = (screen as any).isUnitInCurrentInitiativeGroup("u_player_2");
  });

  await Then("only the current activation unit can act", async () => {
    if (!activeAllowed) {
      throw new Error("Expected current activation unit to be eligible for initiative actions.");
    }
    if (inactiveAllowed) {
      throw new Error("Expected non-active units to be blocked during initiative actions.");
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_PROCEED_ADVANCES_ONLY_CURRENT_ACTIVATION", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let queue: {
    currentIndex: number;
    currentTurn: number;
    activations: Array<{ unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder: number }>;
  };
  let playerLead: ScenarioUnit;
  let playerWing: ScenarioUnit;

  await Given("an interleaved initiative queue with two player units in one initiative band", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).initiativeGroupCursorUnitId = null;
    (screen as any).initiativeGroupSessionId = null;
    (screen as any).initiativeSkippedUnitIds = new Set<string>();
    (screen as any).syncInitiativeTurnControlsState = () => {};
    (screen as any).focusCurrentInitiativeActivation = () => {};
    (screen as any).highlightCurrentInitiativeGroup = () => {};
    (screen as any).confirmInitiativeProceedWithPendingUnits = async () => true;

    playerLead = createPlayerUnit("u_player_1", 2, 2);
    playerWing = createPlayerUnit("u_player_2", 3, 2);
    const botUnit = {
      unitId: "u_bot_1",
      type: "Infantry_42",
      hex: { q: 6, r: 2 },
      strength: 100,
      experience: 0,
      ammo: 6,
      fuel: 20,
      entrench: 0,
      facing: "NE",
      controlledBy: "AI"
    } as ScenarioUnit;

    const playerActionFlags = new Map<string, { movementPointsUsed: number; attacksUsed: number }>();
    const playerUnits = [playerLead, playerWing];
    const engine = {
      playerUnits,
      botUnits: [botUnit],
      playerActionFlags,
      enterSentry: (_hex: { q: number; r: number }, unitId?: string) => {
        const target = playerUnits.find((unit) => unit.unitId === unitId);
        if (!target) {
          return false;
        }
        target.onSentry = true;
        return true;
      }
    };

    queue = {
      currentIndex: 0,
      currentTurn: 1,
      activations: [
        { unitId: "u_player_1", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 0 },
        { unitId: "u_bot_1", ownerId: "bot", initiative: 5, isActivated: false, sortOrder: 1 },
        { unitId: "u_player_2", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 2 }
      ]
    };

    (screen as any).battleState = {
      ensureGameEngine: () => engine
    };

    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => queue,
      getCurrentActivation: () => {
        const next = queue.activations.find((activation, index) => index >= queue.currentIndex && !activation.isActivated) ?? null;
        return next ? { ...next } : null;
      },
      completeUnitActivation: (unitId: string) => {
        const activation = queue.activations[queue.currentIndex];
        if (!activation || activation.unitId !== unitId) {
          throw new Error(`Expected to complete ${activation?.unitId ?? "none"}, received ${unitId}`);
        }
        activation.isActivated = true;
        queue.currentIndex += 1;
      }
    };
  });

  await When("the player presses Proceed", async () => {
    await (screen as any).handleProceedToNext();
  });

  await Then("only the current player activation is completed and the next player unit is preserved", async () => {
    if (!queue.activations[0]?.isActivated) {
      throw new Error("Expected the current player activation to complete on Proceed.");
    }
    if (queue.activations[2]?.isActivated) {
      throw new Error("Expected later player activations in the same initiative band to remain pending after Proceed.");
    }
    if (queue.currentIndex !== 1) {
      throw new Error(`Expected queue to advance to the bot activation index (1), received ${queue.currentIndex}.`);
    }
    if (!playerLead.onSentry) {
      throw new Error("Expected Proceed to place an uncommanded current unit on sentry before advancing.");
    }
    if (playerWing.onSentry) {
      throw new Error("Expected untouched player wing unit to remain off sentry.");
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_AUTO_COMPLETES_PLAYER_ACTIVATION_AFTER_ORDER", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let completedUnitId: string | null = null;
  let highlightCalls = 0;
  let focusCalls = 0;
  let syncCalls = 0;

  await Given("initiative mode with a current player activation and completion hooks", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).initiativeMethods = {
      getCurrentActivation: () => ({
        unitId: "u_player_1",
        ownerId: "player",
        initiative: 6,
        isActivated: false,
        sortOrder: 0
      }),
      completeUnitActivation: (unitId: string) => {
        completedUnitId = unitId;
      }
    };
    (screen as any).highlightCurrentInitiativeGroup = () => {
      highlightCalls += 1;
    };
    (screen as any).focusCurrentInitiativeActivation = () => {
      focusCalls += 1;
    };
    (screen as any).syncInitiativeTurnControlsState = () => {
      syncCalls += 1;
    };
  });

  await When("a completed player order reports the current activation unit id", async () => {
    (screen as any).completeInitiativeActivationAfterPlayerOrder("u_player_1");
  });

  await Then("the current activation completes and initiative UI refreshes", async () => {
    if (completedUnitId !== "u_player_1") {
      throw new Error(`Expected activation to complete for u_player_1, received ${completedUnitId ?? "none"}.`);
    }
    if (highlightCalls !== 1 || focusCalls !== 1 || syncCalls !== 1) {
      throw new Error(
        `Expected highlight/focus/sync to run once each; received highlight=${highlightCalls}, focus=${focusCalls}, sync=${syncCalls}.`
      );
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_COMPLETION_FALLS_BACK_TO_ACTIVE_UNIT_ON_MISMATCH", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let completedUnitId: string | null = null;

  await Given("initiative mode where the reported acted unit differs from the active activation", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).initiativeMethods = {
      getCurrentActivation: () => ({
        unitId: "u_engineer_active",
        ownerId: "player",
        initiative: 6,
        isActivated: false,
        sortOrder: 0
      }),
      completeUnitActivation: (unitId: string) => {
        completedUnitId = unitId;
      }
    };
    (screen as any).highlightCurrentInitiativeGroup = () => {};
    (screen as any).focusCurrentInitiativeActivation = () => {};
    (screen as any).syncInitiativeTurnControlsState = () => {};
    (screen as any).recoverInitiativeQueueStall = () => false;
  });

  await When("the action completion callback receives a mismatched unit id", async () => {
    (screen as any).completeInitiativeActivationAfterPlayerOrder("u_engineer_wrong");
  });

  await Then("the active activation still completes to prevent initiative deadlock", async () => {
    if (completedUnitId !== "u_engineer_active") {
      throw new Error(`Expected active activation id to complete, received ${completedUnitId ?? "none"}.`);
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_STACKED_HEX_GATE_PREFERS_ACTIVE_MEMBER", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let blockedUnitId: string | null = null;
  let playerClickCalls = 0;

  await Given("initiative mode with two stacked player units where the second is currently active", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).selectedHexKey = null;
    (screen as any).selectedPlayerUnitId = null;
    (screen as any).playerMoveHexes = new Set<string>();
    (screen as any).playerAttackHexes = new Set<string>();
    (screen as any).smokeTargetingState = null;
    (screen as any).artilleryTargetingState = null;

    (screen as any).battleState = {
      ensureGameEngine: () => ({
        getTurnSummary: () => ({
          phase: "playerTurn",
          activeFaction: "Player",
          turnNumber: 1
        })
      })
    };

    (screen as any).initiativeMethods = {
      getCurrentActivation: () => ({
        unitId: "u_engineer_active",
        ownerId: "player",
        initiative: 6,
        isActivated: false,
        sortOrder: 1
      })
    };

    (screen as any).tryTransferAllyControl = () => false;
    (screen as any).onPlayerTurnMapClick = () => {
      playerClickCalls += 1;
    };
    (screen as any).showInitiativeGroupMessage = (unitId: string) => {
      blockedUnitId = unitId;
    };
    (screen as any).isUnitInCurrentInitiativeGroup = (unitId: string) => unitId === "u_engineer_active";
    (screen as any).getPlayerStackMembersAtHex = () => [
      { unitId: "u_engineer_first", isAutomated: false, unit: createPlayerUnit("u_engineer_first", 11, 15) },
      { unitId: "u_engineer_active", isAutomated: false, unit: createPlayerUnit("u_engineer_active", 11, 15) }
    ];
  });

  await When("the stacked hex is clicked for selection", async () => {
    (screen as any).handleHexSelection("11,15");
  });

  await Then("the active stacked member is allowed through instead of being blocked by the first member", async () => {
    if (blockedUnitId !== null) {
      throw new Error(`Expected no initiative gate block, but blocked ${blockedUnitId}.`);
    }
    if (playerClickCalls !== 1) {
      throw new Error(`Expected one onPlayerTurnMapClick call, received ${playerClickCalls}.`);
    }
  });
});
