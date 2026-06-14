import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import type { ScenarioUnit } from "../src/core/types";
import { ensureTutorialState } from "../src/state/TutorialState";

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
  let confirmCalls = 0;

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
    (screen as any).confirmInitiativeProceedWithPendingUnits = async () => {
      confirmCalls += 1;
      return true;
    };

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
    if (confirmCalls !== 1) {
      throw new Error(`Expected proceed confirmation to be requested once, received ${confirmCalls}.`);
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

registerTest("BATTLESCREEN_INITIATIVE_END_TURN_ROUTES_THROUGH_PROCEED_CONFIRMATION_PATH", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let proceedCalls = 0;
  let observedOptions: { endTurnSkipAll?: boolean; bypassConfirmation?: boolean } | undefined;
  let skipModeChanged = false;

  await Given("an active player activation when the commander presses end turn", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).initiativeEndTurnSkipModeActive = false;
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
    (screen as any).handleProceedToNext = async (options?: { endTurnSkipAll?: boolean; bypassConfirmation?: boolean }) => {
      proceedCalls += 1;
      observedOptions = options;
      skipModeChanged = (screen as any).initiativeEndTurnSkipModeActive === true;
      return false;
    };
    (screen as any).syncInitiativeTurnControlsState = () => {};
  });

  await When("end turn is requested", async () => {
    await (screen as any).handleInitiativeEndTurn();
  });

  await Then("end turn delegates to the proceed confirmation path before enabling skip mode", async () => {
    if (proceedCalls !== 1) {
      throw new Error(`Expected end turn to delegate to proceed once, received ${proceedCalls}.`);
    }
    if (!observedOptions || observedOptions.endTurnSkipAll !== true) {
      throw new Error(`Expected end turn to call proceed with endTurnSkipAll=true, received ${JSON.stringify(observedOptions)}.`);
    }
    if (skipModeChanged || (screen as any).initiativeEndTurnSkipModeActive === true) {
      throw new Error("Expected skip mode to remain disabled until proceed/confirmation succeeds.");
    }
  });
});

registerTest("BATTLESCREEN_TUTORIAL_END_TURN_FINISHES_ONLY_THE_GUIDED_INITIATIVE_GROUP", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let observedOptions: { endTurnSkipAll?: boolean; bypassConfirmation?: boolean } | undefined;
  let completedPhase: string | null = null;
  const tutorialState = ensureTutorialState();

  await Given("the tutorial is waiting for the moved patrol to finish its initiative group", async () => {
    tutorialState.endTutorial();
    tutorialState.startTutorial();
    tutorialState.jumpToPhase("spend_activation");
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).handleProceedToNext = async (options?: { endTurnSkipAll?: boolean; bypassConfirmation?: boolean }) => {
      observedOptions = options;
      return true;
    };
    (screen as any).completeTutorialPhase = (phase: string) => {
      completedPhase = phase;
    };
    (screen as any).handleInitiativeEndTurn = async () => {
      throw new Error("The guided handoff must not skip every remaining player group.");
    };
  });

  await When("the player clicks the highlighted End Turn control", async () => {
    await (screen as any).handleTutorialAwareEndTurn();
  });

  await Then("the current group advances without the normal confirmation or a full-turn skip", async () => {
    if (observedOptions?.bypassConfirmation !== true || observedOptions.endTurnSkipAll === true) {
      throw new Error(`Expected a confirmation-free current-group handoff, received ${JSON.stringify(observedOptions)}.`);
    }
    if (completedPhase !== "spend_activation") {
      throw new Error(`Expected spend_activation to complete, received ${completedPhase ?? "<none>"}.`);
    }
    tutorialState.endTutorial();
  });
});

registerTest("BATTLESCREEN_MOVEMENT_TUTORIAL_CLEARS_INTEL_WITHOUT_LOSING_SELECTION", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let publishedIntel: unknown = "not-called";
  let tacticalMoveCount = 0;

  await Given("the recon patrol is selected with six nearby movement hexes", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).selectedHexKey = "6,5";
    (screen as any).selectedPlayerUnitId = "recon_1";
    (screen as any).playerMoveHexes = new Set(["5,4", "6,4", "5,5", "7,5", "5,6", "6,6"]);
    (screen as any).playerAttackHexes = new Set<string>();
    (screen as any).selectedUnitMatchesTutorialTarget = () => true;
    (screen as any).getNearbyTutorialMoveHexes = (_origin: unknown, hexes: Set<string>) => hexes;
    (screen as any).hexMapRenderer = {
      setTacticalHighlights: (moveHexes: Set<string>) => {
        tacticalMoveCount = moveHexes.size;
      },
      setZoneHighlights: () => {}
    };
    (screen as any).selectionIntelOverlay = {
      update: (intel: unknown) => {
        publishedIntel = intel;
      }
    };
    (screen as any).battleState = {
      tryGetGameEngine: () => ({
        getTurnSummary: () => ({ phase: "playerTurn" })
      })
    };
    (screen as any).queueTutorialCameraForPhase = () => {};
  });

  await When("the movement lesson prepares the battlefield", async () => {
    (screen as any).syncTutorialPhaseWithCurrentContext("movement_intro");
  });

  await Then("the intel card closes while the recon patrol and legal moves remain active", async () => {
    if (publishedIntel !== null) {
      throw new Error("The movement lesson should close the intel card before asking for a map click.");
    }
    if ((screen as any).selectedHexKey !== "6,5" || (screen as any).selectedPlayerUnitId !== "recon_1") {
      throw new Error("Closing tutorial intel must preserve the selected recon patrol.");
    }
    if (tacticalMoveCount !== 6) {
      throw new Error(`Expected six nearby move choices, received ${tacticalMoveCount}.`);
    }
  });
});

registerTest("BATTLESCREEN_UNIT_INTEL_TUTORIAL_RESTORES_SELECTION_WITHOUT_REENTERING", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let selectionRefreshCount = 0;

  await Given("the selected tutorial unit remains active while its intel card is closed", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).selectedHexKey = "6,5";
    (screen as any).tutorialSelectionSyncInProgress = false;
    (screen as any).selectedUnitIsInActiveInitiativeGroup = () => true;
    (screen as any).isBattleIntelOverlayVisible = () => false;
    (screen as any).isBattleIntelOverlayExpanded = () => false;
    (screen as any).getSelectedTutorialFocusHexes = () => new Set(["6,5"]);
    (screen as any).queueTutorialCameraForPhase = () => {};
    (screen as any).hexMapRenderer = {
      setZoneHighlights: () => {}
    };
    (screen as any).applySelectedHex = () => {
      selectionRefreshCount += 1;
      (screen as any).syncTutorialPhaseWithCurrentContext("intel_overlay_expand");
    };
  });

  await When("the Unit Intel lesson restores the selected unit card", async () => {
    const tutorialState = ensureTutorialState();
    tutorialState.endTutorial();
    tutorialState.startTutorial();
    tutorialState.jumpToPhase("intel_overlay_expand");
    (screen as any).syncTutorialPhaseWithCurrentContext("intel_overlay_expand");
  });

  await Then("the nested selection callback is ignored and the guard is released", async () => {
    if (selectionRefreshCount !== 1) {
      throw new Error(`Expected one guarded selection refresh, received ${selectionRefreshCount}.`);
    }
    if ((screen as any).tutorialSelectionSyncInProgress !== false) {
      throw new Error("Tutorial selection synchronization should release its reentrancy guard.");
    }
    ensureTutorialState().endTutorial();
  });
});

registerTest("BATTLESCREEN_MOBILE_TUTORIAL_CAMERA_KEEPS_ACTION_HEXES_BELOW_THE_PROMPT", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let observedPanY = 0;

  await Given("a mobile battle prompt overlaps the tutorial movement hexes", async () => {
    mountBattleScreenRoot();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 390 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 844 });

    const panel = document.createElement("div");
    panel.className = "tutorial-panel tutorial-battle-docked";
    panel.getBoundingClientRect = () => ({
      x: 38,
      y: 245,
      left: 38,
      top: 245,
      right: 378,
      bottom: 363,
      width: 340,
      height: 118,
      toJSON: () => ({})
    }) as DOMRect;
    document.body.appendChild(panel);

    const focusHex = document.createElementNS("http://www.w3.org/2000/svg", "g");
    focusHex.getBoundingClientRect = () => ({
      x: 160,
      y: 305,
      left: 160,
      top: 305,
      right: 205,
      bottom: 357,
      width: 45,
      height: 52,
      toJSON: () => ({})
    }) as DOMRect;

    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).mapViewport = {
      pan: (_x: number, y: number) => {
        observedPanY = y;
      }
    };
    (screen as any).hexMapRenderer = {
      getHexElement: () => focusHex
    };
  });

  await When("the tutorial camera reserves room for the upper prompt", async () => {
    (screen as any).offsetTutorialCameraBelowPrompt(["9,7"]);
  });

  await Then("the map pans down enough to expose the required hex", async () => {
    if (observedPanY !== 78) {
      throw new Error(`Expected an unobstructed 78px tutorial camera shift, received ${observedPanY}.`);
    }
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    Object.defineProperty(window, "innerHeight", { configurable: true, value: 768 });
  });
});

registerTest("BATTLESCREEN_INITIATIVE_END_TURN_SKIP_MODE_AUTO_ADVANCES_ROUND_WHEN_QUEUE_DRAINS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let advanceCalls = 0;

  await Given("initiative skip mode is active and no activations remain", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).initiativeEndTurnSkipModeActive = true;
    (screen as any).initiativeTurnAdvanceInProgress = false;
    (screen as any).syncLegacyEndTurnButton = () => {};
    (screen as any).flushSkippedInitiativeActivations = () => {};
    (screen as any).recoverInitiativeQueueStall = () => false;
    (screen as any).ensureFocusedPlayerInitiativeUnit = () => {};
    (screen as any).resolveActiveInitiativeGroup = () => null;
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => ({
        currentIndex: 3,
        currentTurn: 2,
        activations: [
          { unitId: "u_player_1", ownerId: "player", initiative: 6, isActivated: true, sortOrder: 0 },
          { unitId: "u_bot_1", ownerId: "bot", initiative: 6, isActivated: true, sortOrder: 1 },
          { unitId: "u_player_2", ownerId: "player", initiative: 5, isActivated: true, sortOrder: 2 }
        ]
      }),
      getCurrentActivation: () => null,
      isInitiativeSystemActive: () => true
    };
    (screen as any).initiativeTurnControls = {
      updateCurrentUnit: () => {},
      updatePlayerTurn: () => {},
      updateRoundAdvanceReady: () => {},
      updatePhase: () => {},
      setControlsEnabled: () => {}
    };
    (screen as any).advanceInitiativeRound = async () => {
      advanceCalls += 1;
    };
  });

  await When("initiative controls sync after the queue is fully drained", async () => {
    (screen as any).syncInitiativeTurnControlsState();
  });

  await Then("round advancement is triggered automatically without requiring another end-turn click", async () => {
    if (advanceCalls !== 1) {
      throw new Error(`Expected one auto-advance trigger after drained queue, received ${advanceCalls}.`);
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_SELECTION_KEEPS_FACING_ONLY_UNITS_ACTIONABLE", async ({ Given, When, Then }) => {
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

  await Then("smoke and support orders stay committed while facing alone does not spend the unit", async () => {
    if (selectableIds.length !== 1 || selectableIds[0] !== "u_player_wing") {
      throw new Error(`Expected only the facing-adjusted unit to remain selectable, received ${JSON.stringify(selectableIds)}.`);
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_SET_FACING_PRESERVES_ACTIVATION", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let completedUnitId: string | null = null;
  let refreshedHexKey: string | null = null;

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
    (screen as any).applySelectedHex = (hexKey: string) => {
      refreshedHexKey = hexKey;
    };
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

  await Then("the facing order refreshes the unit without consuming its activation", async () => {
    if (completedUnitId !== null) {
      throw new Error(`Expected facing confirmation to preserve the activation, but completed ${completedUnitId}.`);
    }
    if (refreshedHexKey !== "4,2") {
      throw new Error(`Expected facing confirmation to refresh selection at 4,2, received ${refreshedHexKey ?? "none"}.`);
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_SHORT_MOVE_PRESERVES_REMAINING_ACTIONS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let completedUnitId: string | null = null;
  let clearedSelection = false;
  let refreshedHexKey: string | null = null;

  await Given("an initiative unit with legal movement remaining after moving one hex", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).selectedHexKey = "2,2";
    (screen as any).selectedPlayerUnitId = "u_player_1";
    (screen as any).hexMapRenderer = null;

    const movedUnit = createPlayerUnit("u_player_1", 3, 2);
    const engine = {
      moveUnit: () => ({
        unit: movedUnit,
        from: { q: 2, r: 2 },
        to: { q: 3, r: 2 },
        path: [{ q: 2, r: 2 }, { q: 3, r: 2 }]
      }),
      getReachableHexes: () => [{ q: 4, r: 2 }],
      getAttackableTargets: () => [],
      getUnitCommandState: () => null,
      getTurnSummary: () => ({ phase: "playerTurn", activeFaction: "Player", turnNumber: 1 })
    };
    (screen as any).battleState = {
      ensureGameEngine: () => engine,
      emitBattleUpdate: () => {}
    };
    (screen as any).renderEngineUnits = () => {};
    (screen as any).clearSelectedHexAfterAction = () => {
      clearedSelection = true;
    };
    (screen as any).applySelectedHex = (hexKey: string) => {
      refreshedHexKey = hexKey;
    };
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).completeInitiativeActivationAfterPlayerOrder = (unitId: string | null | undefined) => {
      completedUnitId = unitId ?? null;
    };
  });

  await When("the unit moves a single hex", async () => {
    await (screen as any).executeAnimatedPlayerMove(
      "2,2",
      "3,2",
      { q: 2, r: 2 },
      { q: 3, r: 2 },
      "u_player_1"
    );
  });

  await Then("the unit remains selected and initiative does not advance", async () => {
    if (completedUnitId !== null) {
      throw new Error(`Expected the short move to preserve initiative, but completed ${completedUnitId}.`);
    }
    if (clearedSelection) {
      throw new Error("Expected the moved unit selection to remain active.");
    }
    if (refreshedHexKey !== "3,2") {
      throw new Error(`Expected selection to follow the moved unit to 3,2, received ${refreshedHexKey ?? "none"}.`);
    }
    if ((screen as any).selectedPlayerUnitId !== "u_player_1") {
      throw new Error("Expected the moved unit to remain the selected stack member.");
    }
  });
});
