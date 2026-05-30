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

registerTest("BATTLESCREEN_INITIATIVE_ACTIONS_ALLOW_ANY_UNIT_IN_ACTIVE_PLAYER_GROUP", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let leadAllowed = false;
  let wingAllowed = false;
  let otherBandBlocked = false;

  await Given("initiative mode with an active player group containing two formations", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    const queue = {
      currentIndex: 0,
      currentTurn: 1,
      activations: [
        { unitId: "u_player_1", ownerId: "player" as const, initiative: 5, isActivated: false, sortOrder: 0 },
        { unitId: "u_bot_1", ownerId: "bot" as const, initiative: 5, isActivated: false, sortOrder: 1 },
        { unitId: "u_player_2", ownerId: "player" as const, initiative: 5, isActivated: false, sortOrder: 2 },
        { unitId: "u_player_3", ownerId: "player" as const, initiative: 4, isActivated: false, sortOrder: 3 }
      ]
    };
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => queue,
      getCurrentActivation: () => ({ unitId: "u_player_1", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 0 })
    };
  });

  await When("eligibility is checked for units in and out of the active group", async () => {
    leadAllowed = (screen as any).isUnitInCurrentInitiativeGroup("u_player_1");
    wingAllowed = (screen as any).isUnitInCurrentInitiativeGroup("u_player_2");
    otherBandBlocked = !(screen as any).isUnitInCurrentInitiativeGroup("u_player_3");
  });

  await Then("all units in the active player group are eligible while other initiative bands stay blocked", async () => {
    if (!leadAllowed || !wingAllowed) {
      throw new Error(`Expected both in-group units to be eligible, received lead=${leadAllowed}, wing=${wingAllowed}.`);
    }
    if (!otherBandBlocked) {
      throw new Error("Expected units outside the active initiative group to be blocked.");
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
    const queue = {
      currentIndex: 0,
      currentTurn: 1,
      activations: [
        { unitId: "u_player_1", ownerId: "player" as const, initiative: 6, isActivated: false, sortOrder: 0 }
      ]
    };
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => queue,
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
    const queue = {
      currentIndex: 0,
      currentTurn: 1,
      activations: [
        { unitId: "u_engineer_active", ownerId: "player" as const, initiative: 6, isActivated: false, sortOrder: 0 }
      ]
    };
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => queue,
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

registerTest("BATTLESCREEN_INITIATIVE_SYNC_PRESERVES_EXPLICIT_NON_CURRENT_GROUP_SELECTION", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  const focusCalls: string[] = [];
  const activeGroup = {
    initiative: 6,
    ownerId: "player" as const,
    activations: [
      { unitId: "u_player_lead", ownerId: "player" as const, initiative: 6, isActivated: false, sortOrder: 0 },
      { unitId: "u_player_wing", ownerId: "player" as const, initiative: 6, isActivated: false, sortOrder: 1 }
    ]
  };

  await Given("initiative sync with current activation on lead but explicit selection on wing", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).selectedPlayerUnitId = "u_player_wing";
    (screen as any).initiativeGroupCursorUnitId = "u_player_lead";
    (screen as any).initiativeMethods = {
      getCurrentActivation: () => ({
        unitId: "u_player_lead",
        ownerId: "player",
        initiative: 6,
        isActivated: false,
        sortOrder: 0
      })
    };
    (screen as any).resolveSelectablePlayerInitiativeActivations = () => activeGroup.activations;
    (screen as any).focusInitiativeUnit = (unitId: string) => {
      focusCalls.push(unitId);
    };
  });

  await When("focused-unit enforcement runs during UI sync", async () => {
    (screen as any).ensureFocusedPlayerInitiativeUnit(activeGroup);
  });

  await Then("the explicit in-group selection remains active instead of snapping back to current activation", async () => {
    if ((screen as any).initiativeGroupCursorUnitId !== "u_player_wing") {
      throw new Error(
        `Expected initiative cursor to stay on u_player_wing, received ${(screen as any).initiativeGroupCursorUnitId ?? "none"}.`
      );
    }
    if (focusCalls.length > 0) {
      throw new Error(`Expected no forced focus reset, received ${JSON.stringify(focusCalls)}.`);
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_SKIP_GROUP_USES_SKIP_COPY_NOT_HOLD", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let message: string | null = null;

  await Given("a player initiative group that is being skipped", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).initiativeSkippedUnitIds = new Set<string>();
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => ({})
    };
    (screen as any).resolveActiveInitiativeGroup = () => ({
      initiative: 6,
      ownerId: "player",
      activations: [
        { unitId: "u_player_1", ownerId: "player", initiative: 6, isActivated: false, sortOrder: 0 }
      ]
    });
    (screen as any).battleState = {
      ensureGameEngine: () => ({
        playerUnits: [createPlayerUnit("u_player_1", 2, 2)],
        enterSentry: () => true
      })
    };
    (screen as any).showElegantInitiativeMessage = (text: string) => {
      message = text;
    };
    (screen as any).highlightCurrentInitiativeGroup = () => {};
    (screen as any).syncInitiativeTurnControlsState = () => {};
  });

  await When("skip-group is executed", async () => {
    (screen as any).handleSkipGroup();
  });

  await Then("the commander-facing message uses skip wording instead of hold wording", async () => {
    if (message !== "Group skipped. Press End Turn to continue initiative.") {
      throw new Error(`Expected skip-group copy to avoid hold wording, received '${message ?? "null"}'.`);
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_END_TURN_SKIP_MODE_PERSISTS_ACROSS_INITIATIVE_BANDS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let preservedAcrossBandSwap = false;
  let clearedOnceSkipModeEnds = false;

  await Given("an initiative session where end-turn skip mode is active", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => ({ currentTurn: 3 })
    };
    (screen as any).initiativeGroupSessionId = "3:6";
    (screen as any).initiativeGroupCursorUnitId = "u_player_lead";
    (screen as any).initiativeEndTurnSkipModeActive = true;
    (screen as any).initiativeSkippedUnitIds = new Set<string>(["u_player_lead", "u_player_wing"]);
  });

  await When("the active initiative band changes while skip mode remains active", async () => {
    (screen as any).syncInitiativeGroupSession({
      initiative: 5,
      ownerId: "bot",
      activations: []
    });
    preservedAcrossBandSwap = (screen as any).initiativeSkippedUnitIds.has("u_player_wing");

    (screen as any).initiativeEndTurnSkipModeActive = false;
    (screen as any).syncInitiativeGroupSession({
      initiative: 4,
      ownerId: "player",
      activations: []
    });
    clearedOnceSkipModeEnds = (screen as any).initiativeSkippedUnitIds.size === 0;
  });

  await Then("skip-state persists during end-turn auto-skip and clears again for normal play", async () => {
    if (!preservedAcrossBandSwap) {
      throw new Error("Expected skipped unit ids to persist across initiative-band swaps while end-turn skip mode is active.");
    }
    if (!clearedOnceSkipModeEnds) {
      throw new Error("Expected skipped unit ids to clear once end-turn skip mode is no longer active.");
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_END_TURN_SKIP_MODE_BYPASSES_PROCEED_CONFIRMATION", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let proceedCalls = 0;
  let announcement: string | null = null;

  await Given("a player activation that remains current while end-turn skip mode is being applied", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).initiativeEndTurnSkipModeActive = false;
    (screen as any).initiativeSkippedUnitIds = new Set<string>();
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => ({
        currentIndex: 0,
        currentTurn: 1,
        activations: [
          { unitId: "u_player_1", ownerId: "player", initiative: 6, isActivated: false, sortOrder: 0 }
        ]
      }),
      getCurrentActivation: () => ({
        unitId: "u_player_1",
        ownerId: "player",
        initiative: 6,
        isActivated: false,
        sortOrder: 0
      }),
      isInitiativeSystemActive: () => true
    };
    (screen as any).skipRemainingPlayerInitiativeTurnActivations = () => 1;
    (screen as any).flushSkippedInitiativeActivations = () => {};
    (screen as any).handleProceedToNext = async () => {
      proceedCalls += 1;
    };
    (screen as any).showElegantInitiativeMessage = (text: string) => {
      announcement = text;
    };
    (screen as any).syncInitiativeTurnControlsState = () => {};
  });

  await When("end turn is requested", async () => {
    await (screen as any).handleInitiativeEndTurn();
  });

  await Then("the flow remains in skip mode without reopening proceed confirmation", async () => {
    if ((screen as any).initiativeEndTurnSkipModeActive !== true) {
      throw new Error("Expected end-turn skip mode to remain active.");
    }
    if (proceedCalls !== 0) {
      throw new Error(`Expected no proceed confirmation calls while skip mode is active, received ${proceedCalls}.`);
    }
    if (announcement !== "Remaining formations are being set to sentry. Enemy activations are resolving.") {
      throw new Error(`Expected skip-mode status announcement, received '${announcement ?? "null"}'.`);
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_SELECTION_EXCLUDES_SMOKE_FACING_AND_SUPPORT_COMMITTED_UNITS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let selectableIds: string[] = [];

  await Given("an active player group where each unit has already committed an order", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).initiativeSkippedUnitIds = new Set<string>();

    const lead = createPlayerUnit("u_player_lead", 2, 2);
    const wing = createPlayerUnit("u_player_wing", 3, 2);
    const rear = createPlayerUnit("u_player_rear", 4, 2);
    const playerActionFlags = new Map<string, {
      movementPointsUsed?: number;
      attacksUsed?: number;
      smokeUsed?: boolean;
      facingSet?: boolean;
      supportQueued?: boolean;
    }>();
    playerActionFlags.set("u_player_lead", { movementPointsUsed: 0, attacksUsed: 0, smokeUsed: true });
    playerActionFlags.set("u_player_wing", { movementPointsUsed: 0, attacksUsed: 0, facingSet: true });
    playerActionFlags.set("u_player_rear", { movementPointsUsed: 0, attacksUsed: 0, supportQueued: true });

    (screen as any).battleState = {
      ensureGameEngine: () => ({
        playerUnits: [lead, wing, rear],
        botUnits: [],
        allyUnits: [],
        playerActionFlags
      })
    };
  });

  await When("selectable activations are resolved for that group", async () => {
    const activeGroup = {
      initiative: 6,
      ownerId: "player" as const,
      activations: [
        { unitId: "u_player_lead", ownerId: "player" as const, initiative: 6, isActivated: false, sortOrder: 0 },
        { unitId: "u_player_wing", ownerId: "player" as const, initiative: 6, isActivated: false, sortOrder: 1 },
        { unitId: "u_player_rear", ownerId: "player" as const, initiative: 6, isActivated: false, sortOrder: 2 }
      ]
    };
    selectableIds = ((screen as any).resolveSelectablePlayerInitiativeActivations(activeGroup) as Array<{ unitId: string }>).map(
      (entry) => entry.unitId
    );
  });

  await Then("no committed unit is re-offered as selectable", async () => {
    if (selectableIds.length !== 0) {
      throw new Error(`Expected zero selectable committed units, received ${JSON.stringify(selectableIds)}.`);
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_SET_FACING_COMPLETES_ACTIVATION", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let completedUnitId: string | null = null;

  await Given("a pending facing order in initiative mode", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).pendingFortificationBuild = {
      hex: { q: 4, r: 2 },
      hexKey: "4,2",
      unitLabel: "Lead Infantry",
      unitId: "u_player_1",
      modificationType: "facing"
    };
    (screen as any).battleState = {
      ensureGameEngine: () => ({
        setUnitFacing: () => true
      }),
      emitBattleUpdate: () => {}
    };
    (screen as any).hideFortificationFacingDialog = () => {};
    (screen as any).renderEngineUnits = () => {};
    (screen as any).applySelectedHex = () => {};
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).hexMapRenderer = { clearUnitFacingAngle: () => {} };
    (screen as any).completeInitiativeActivationAfterPlayerOrder = (unitId: string | null | undefined) => {
      completedUnitId = unitId ?? null;
    };
  });

  await When("the commander confirms a new facing", async () => {
    await (screen as any).handleConfirmFortificationFacing("E");
  });

  await Then("the facing order consumes the initiative activation", async () => {
    if (completedUnitId !== "u_player_1") {
      throw new Error(`Expected facing confirmation to complete u_player_1, received ${completedUnitId ?? "none"}.`);
    }
  });
});
