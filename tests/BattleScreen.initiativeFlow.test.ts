import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import { InitiativeQueueManager } from "../src/core/InitiativeQueue";
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

registerTest("INITIATIVE_RESERVE_ARRIVAL_PRESERVES_CURRENT_ACTIVATION_AND_REMAINING_ORDER", async ({ Given, When, Then }) => {
  const manager = new InitiativeQueueManager();
  const createUnit = (
    unitId: string,
    type: ScenarioUnit["type"],
    controlledBy: "Player" | "AI"
  ): ScenarioUnit => ({
    unitId,
    type,
    hex: { q: 0, r: 0 },
    strength: 100,
    experience: 0,
    ammo: 6,
    fuel: 20,
    entrench: 0,
    facing: "NE",
    controlledBy
  });

  const queue = manager.generateQueue([
    createUnit("current-engineer", "Engineer", "Player"),
    createUnit("waiting-infantry", "Infantry_42", "AI"),
    createUnit("waiting-supply", "Supply_Truck", "Player")
  ], 1);

  await Given("an engineer activation already in progress", async () => {
    const current = manager.getCurrentActivation(queue);
    if (current?.unitId !== "current-engineer") {
      throw new Error(`Expected the engineer to be current, received ${current?.unitId ?? "none"}.`);
    }
  });

  await When("a lower-initiative reserve and an already-passed higher-initiative reserve arrive", async () => {
    manager.addUnitActivation(queue, createUnit("reserve-infantry", "Infantry_42", "Player"), "player");
    manager.addUnitActivation(queue, createUnit("reserve-recon", "Recon_Bike", "Player"), "player");
  });

  await Then("the current unit remains active and only the later initiative joins this turn", async () => {
    const current = manager.getCurrentActivation(queue);
    if (current?.unitId !== "current-engineer") {
      throw new Error(`Expected reserve deployment to preserve current-engineer, received ${current?.unitId ?? "none"}.`);
    }
    const order = queue.activations.map((activation) => activation.unitId);
    const expected = ["current-engineer", "reserve-infantry", "waiting-infantry", "waiting-supply"];
    if (JSON.stringify(order) !== JSON.stringify(expected)) {
      throw new Error(`Expected remaining initiative order ${JSON.stringify(expected)}, received ${JSON.stringify(order)}.`);
    }
  });
});

registerTest("BATTLESCREEN_FULL_MOVE_PRESERVES_ACTIVATION_FOR_ARTILLERY_CALL", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let canContinue = false;
  let artilleryAvailabilityChecked = false;
  const observer = createPlayerUnit("moving-observer", 2, 0);

  await Given("a fully moved observer with no movement or direct-fire options remaining", async () => {
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).battleState = {
      ensureGameEngine: () => ({
        playerUnits: [observer],
        getReachableHexes: () => [],
        getAttackableTargets: () => [],
        getUnitCommandState: () => ({ canLaySmoke: false, canSetFacing: false, canDeployTow: false })
      })
    };
    (screen as any).resolveArtilleryActionState = () => {
      artilleryAvailabilityChecked = true;
      return { available: true, reason: null, assetId: "support-artillery", targetHexKeys: ["4,0"] };
    };
  });

  await When("the post-move initiative continuation check runs", async () => {
    canContinue = (screen as any).canPlayerUnitContinueAfterMove({ q: 2, r: 0 }, observer.unitId);
  });

  await Then("the activation stays open so artillery can still be called", async () => {
    if (!artilleryAvailabilityChecked || !canContinue) {
      throw new Error("Expected artillery availability to keep the fully moved observer's activation open.");
    }
  });
});

registerTest("BATTLESCREEN_TACTICAL_SUPPORT_ACTION_PRESERVES_CAMPAIGN_ASSET_IDENTITY", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let artilleryAction: {
    label: string;
    detail: string;
    reason?: string | null;
  } | null = null;
  const observer = createPlayerUnit("naval-fire-observer", 4, 3);

  await Given("a campaign observer backed by committed Naval Gunfire Support", async () => {
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).canUnitObserveArtillery = () => true;
    (screen as any).getQueuedArtilleryForCallerHex = () => null;
    (screen as any).resolveArtilleryActionState = () => ({
      available: false,
      reason: "No observed enemy hex is close enough to adjust Naval Gunfire Support (NGFS).",
      assetId: "campaign-ngfs",
      assetLabel: "Naval Gunfire Support (NGFS)",
      targetHexKeys: []
    });
    (screen as any).resolveConsolidationActionState = () => ({
      available: false,
      reason: null,
      targetUnitId: null,
      targetLabel: null,
      combinedStrength: null
    });
    (screen as any).canUnitDigIn = () => false;
  });

  await When("the tactical command card is projected", async () => {
    const actions = (screen as any).buildBattleIntelActions("4,3", observer, {
      isAutomated: false,
      towState: null,
      canEnterSentry: false,
      sentryReason: "Unavailable",
      isSmokeCapable: false,
      canSetFacing: false,
      facingReason: "Unavailable"
    }) as Array<{ id: string; label: string; detail: string; reason?: string | null }>;
    artilleryAction = actions.find((action) => action.id === "callArtillery") ?? null;
  });

  await Then("the action keeps the naval-support name instead of relabeling it as Corps Artillery", async () => {
    if (!artilleryAction) {
      throw new Error("Expected a tactical fire-support action for the campaign observer.");
    }
    const visibleCopy = `${artilleryAction.label} ${artilleryAction.detail} ${artilleryAction.reason ?? ""}`;
    if (!visibleCopy.includes("Naval Gunfire Support (NGFS)")) {
      throw new Error(`Expected the committed support identity in tactical copy, received: ${visibleCopy}`);
    }
    if (/Corps Artillery/i.test(visibleCopy)) {
      throw new Error(`Campaign naval support was relabeled as Corps Artillery: ${visibleCopy}`);
    }
  });
});

registerTest("BATTLESCREEN_RESERVE_REGISTRATION_SELECTS_THE_NEW_STACK_MEMBER", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let registeredUnitId: string | null = null;
  const existing = createPlayerUnit("existing-unit", 2, 2);
  const reserve = createPlayerUnit("new-reserve", 2, 2);

  await Given("an arriving reserve stacked with a unit that was already on the map", async () => {
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).initiativeMethods = {
      registerReserveArrival: (unit: ScenarioUnit) => {
        registeredUnitId = unit.unitId ?? null;
      }
    };
  });

  await When("the reserve arrival is registered", async () => {
    (screen as any).registerReserveArrivalForInitiative(
      { playerUnits: [existing, reserve] },
      { q: 2, r: 2 },
      new Set([existing.unitId])
    );
  });

  await Then("the new reserve receives the initiative slot", async () => {
    if (registeredUnitId !== reserve.unitId) {
      throw new Error(`Expected ${reserve.unitId} to register, received ${registeredUnitId ?? "none"}.`);
    }
  });
});

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

registerTest("BATTLESCREEN_COMPLETED_PLAYER_FORMATION_REMAINS_ACCESSIBLE_IN_CURRENT_INITIATIVE_BAND", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let completedPeerAllowed = false;
  let pendingPeerAllowed = false;
  let laterBandBlocked = false;

  await Given("one formation has completed its main activation while a peer remains in the same initiative band", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    const queue = {
      currentIndex: 1,
      currentTurn: 1,
      activations: [
        { unitId: "u_player_completed", ownerId: "player" as const, initiative: 5, isActivated: true, sortOrder: 0 },
        { unitId: "u_player_pending", ownerId: "player" as const, initiative: 5, isActivated: false, sortOrder: 1 },
        { unitId: "u_player_later", ownerId: "player" as const, initiative: 4, isActivated: false, sortOrder: 2 }
      ]
    };
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => queue,
      getCurrentActivation: () => queue.activations[queue.currentIndex]
    };
  });

  await When("the commander selects formations in and out of the current initiative band", async () => {
    completedPeerAllowed = (screen as any).isUnitInCurrentInitiativeGroup("u_player_completed");
    pendingPeerAllowed = (screen as any).isUnitInCurrentInitiativeGroup("u_player_pending");
    laterBandBlocked = !(screen as any).isUnitInCurrentInitiativeGroup("u_player_later");
  });

  await Then("the completed peer remains available for inspection and legal follow-up orders without opening later bands", async () => {
    if (!completedPeerAllowed || !pendingPeerAllowed || !laterBandBlocked) {
      throw new Error(
        `Expected completed=${completedPeerAllowed}, pending=${pendingPeerAllowed}, laterBlocked=${laterBandBlocked}.`
      );
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_BAND_QUERY_PRESERVES_TACTICAL_SAVE_UI", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let saveSubscriptionReleased = 0;
  let saveCenterDisposed = 0;
  let resolvedUnitIds: string[] = [];

  await Given("an active player initiative band with the tactical save center initialized", async () => {
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    const queue = {
      currentIndex: 0,
      currentTurn: 1,
      activations: [
        { unitId: "u_player_1", ownerId: "player" as const, initiative: 5, isActivated: false, sortOrder: 0 },
        { unitId: "u_player_2", ownerId: "player" as const, initiative: 5, isActivated: false, sortOrder: 1 }
      ]
    };
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => queue,
      getCurrentActivation: () => queue.activations[queue.currentIndex]
    };
    (screen as any).tacticalSaveCoordinatorUnsubscribe = () => {
      saveSubscriptionReleased += 1;
    };
    (screen as any).tacticalSaveCenter = {
      dispose: () => {
        saveCenterDisposed += 1;
      }
    };
  });

  await When("the current player initiative band is resolved for battle controls", async () => {
    const queue = (screen as any).initiativeMethods.getCurrentInitiativeQueue();
    const band = (screen as any).resolveCurrentPlayerInitiativeBand(queue);
    resolvedUnitIds = band?.activations.map((activation: { unitId: string }) => activation.unitId) ?? [];
  });

  await Then("the band resolves without tearing down tactical save persistence", async () => {
    if (JSON.stringify(resolvedUnitIds) !== JSON.stringify(["u_player_1", "u_player_2"])) {
      throw new Error(`Expected the whole player initiative band, received ${JSON.stringify(resolvedUnitIds)}.`);
    }
    if (saveSubscriptionReleased !== 0 || saveCenterDisposed !== 0) {
      throw new Error(
        `Initiative lookup tore down tactical saves: unsubscribe=${saveSubscriptionReleased}, dispose=${saveCenterDisposed}.`
      );
    }
    if (!(screen as any).tacticalSaveCenter || !(screen as any).tacticalSaveCoordinatorUnsubscribe) {
      throw new Error("Expected tactical save state to remain initialized throughout the active battle.");
    }
  });
});

registerTest("BATTLESCREEN_DISPOSE_RELEASES_TACTICAL_SAVE_UI", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let saveSubscriptionReleased = 0;
  let saveCenterDisposed = 0;

  await Given("a battle screen with live tactical save resources", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).battleUpdateUnsubscribe = null;
    (screen as any).tacticalSaveCoordinatorUnsubscribe = () => {
      saveSubscriptionReleased += 1;
    };
    (screen as any).tacticalSavePollTimerId = window.setInterval(() => {}, 60_000);
    (screen as any).tacticalSaveCenter = {
      dispose: () => {
        saveCenterDisposed += 1;
      }
    };
    (screen as any).teardownInitiativeSystemUi = () => {};
    (screen as any).queuedTargetMarkerActions = new Map();
    (screen as any).hexMapRenderer = null;
    (screen as any).selectionIntelOverlay = null;
    (screen as any).battleActivityLog = null;
    (screen as any).tutorialUpdateUnsubscribe = null;
  });

  await When("the battle screen is disposed", async () => {
    screen.dispose();
  });

  await Then("the tactical save subscription, polling, and center are released exactly once", async () => {
    if (saveSubscriptionReleased !== 1 || saveCenterDisposed !== 1) {
      throw new Error(
        `Expected one tactical save cleanup, received unsubscribe=${saveSubscriptionReleased}, dispose=${saveCenterDisposed}.`
      );
    }
    if ((screen as any).tacticalSaveCoordinatorUnsubscribe !== null || (screen as any).tacticalSavePollTimerId !== null) {
      throw new Error("Expected tactical save subscription and polling handles to be cleared on screen disposal.");
    }
    if ((screen as any).tacticalSaveCenter !== null) {
      throw new Error("Expected the tactical save center reference to be cleared on screen disposal.");
    }
  });
});

registerTest("BATTLESCREEN_TACTICAL_RESUME_REBUILDS_ACTIVE_INITIATIVE_CONTROLS", async ({ Given, When, Then }) => {
  let activeScreen: BattleScreen;
  let inactiveScreen: BattleScreen;
  let initialized = 0;
  let synchronized = 0;

  await Given("one restored active initiative battle and one restored inactive battle", async () => {
    activeScreen = Object.create(BattleScreen.prototype) as BattleScreen;
    (activeScreen as any).isInitiativeSystemEnabled = true;
    (activeScreen as any).initiativeMethods = {};
    (activeScreen as any).initializeInitiativeTurnControls = () => {
      initialized += 1;
    };
    (activeScreen as any).syncInitiativeTurnControlsState = () => {
      synchronized += 1;
    };

    inactiveScreen = Object.create(BattleScreen.prototype) as BattleScreen;
    (inactiveScreen as any).isInitiativeSystemEnabled = false;
    (inactiveScreen as any).initiativeMethods = {};
    (inactiveScreen as any).initializeInitiativeTurnControls = () => {
      initialized += 100;
    };
    (inactiveScreen as any).syncInitiativeTurnControlsState = () => {
      synchronized += 100;
    };
  });

  await When("derived turn controls are restored after tactical hydration", async () => {
    (activeScreen as any).restoreInitiativeTurnControlsAfterResume();
    (inactiveScreen as any).restoreInitiativeTurnControlsAfterResume();
  });

  await Then("only the active initiative battle recreates and synchronizes its command surface", async () => {
    if (initialized !== 1 || synchronized !== 1) {
      throw new Error(`Expected one active resume rebuild, received initialize=${initialized}, sync=${synchronized}.`);
    }
  });
});

registerTest("BATTLESCREEN_TACTICAL_RESUME_RESTORES_BATTLE_PHASE_PRESENTATION", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let deploymentLocked = 0;
  let reservesEnabled = 0;
  let deploymentElement: HTMLElement;

  await Given("a cold-start tactical checkpoint already in the player battle phase", async () => {
    document.body.innerHTML = `
      <div id="battleScreen" class="battle-main"></div>
      <button id="beginBattle" type="button">Begin Mission</button>
      <button id="endMissionButton" type="button" class="hidden">End Mission</button>
    `;
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).battleState = {
      tryGetGameEngine: () => ({
        phase: "playerTurn",
        getReserveSnapshot: () => []
      })
    };
    (screen as any).battleMainContainer = document.getElementById("battleScreen");
    (screen as any).beginBattleButton = document.getElementById("beginBattle");
    (screen as any).baseCampAssignButton = null;
    deploymentElement = document.createElement("section");
    (screen as any).deploymentPanel = {
      lockInteractions: () => {
        deploymentLocked += 1;
      },
      enableReserveCallups: () => {
        reservesEnabled += 1;
      },
      getElement: () => deploymentElement
    };
    (screen as any).battleLoadout = null;
    (screen as any).reservePresenter = null;
  });

  await When("the non-authoritative battle chrome is reconstructed", async () => {
    (screen as any).restoreBattlePhasePresentationAfterResume();
  });

  await Then("deployment is locked and hidden while mission controls return", async () => {
    const begin = document.getElementById("beginBattle") as HTMLButtonElement | null;
    const end = document.getElementById("endMissionButton");
    if (deploymentLocked !== 1
      || reservesEnabled !== 1
      || !deploymentElement.hasAttribute("hidden")
      || !(screen as any).battleMainContainer.hasAttribute("data-panel-collapsed")
      || !begin?.disabled
      || !begin.classList.contains("hidden")
      || end?.classList.contains("hidden")) {
      throw new Error("Cold tactical resume did not restore combat-only panel and mission state.");
    }
  });
});

registerTest("BATTLESCREEN_COMPLETED_PEER_FOLLOW_UP_DOES_NOT_CONSUME_PENDING_ACTIVATION", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let completionCalls = 0;

  await Given("a completed formation and a pending peer in the current initiative band", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    const queue = {
      currentIndex: 1,
      currentTurn: 1,
      activations: [
        { unitId: "u_player_completed", ownerId: "player" as const, initiative: 5, isActivated: true, sortOrder: 0 },
        { unitId: "u_player_pending", ownerId: "player" as const, initiative: 5, isActivated: false, sortOrder: 1 }
      ]
    };
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => queue,
      getCurrentActivation: () => queue.activations[queue.currentIndex],
      completeUnitActivation: () => {
        completionCalls += 1;
      }
    };
    (screen as any).highlightCurrentInitiativeGroup = () => {};
    (screen as any).focusCurrentInitiativeActivation = () => {};
    (screen as any).syncInitiativeTurnControlsState = () => {};
  });

  await When("the completed formation performs a still-legal follow-up order", async () => {
    (screen as any).completeInitiativeActivationAfterPlayerOrder("u_player_completed");
  });

  await Then("the pending peer's activation remains untouched", async () => {
    if (completionCalls !== 0) {
      throw new Error(`Expected no activation completion, received ${completionCalls}.`);
    }
  });
});

registerTest("BATTLESCREEN_NEXT_FORMATION_CYCLES_PENDING_AND_COMPLETED_PEERS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  const focusedUnitIds: string[] = [];

  await Given("a current initiative band with one pending formation and two completed peers", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).initiativeGroupCursorUnitId = "u_player_pending";
    (screen as any).initiativeGroupSessionId = "1:5";
    (screen as any).initiativeSkippedUnitIds = new Set<string>();
    const queue = {
      currentIndex: 1,
      currentTurn: 1,
      activations: [
        { unitId: "u_player_completed_first", ownerId: "player" as const, initiative: 5, isActivated: true, sortOrder: 0 },
        { unitId: "u_player_pending", ownerId: "player" as const, initiative: 5, isActivated: false, sortOrder: 1 },
        { unitId: "u_player_completed_second", ownerId: "player" as const, initiative: 5, isActivated: true, sortOrder: 2 },
        { unitId: "u_player_later", ownerId: "player" as const, initiative: 4, isActivated: false, sortOrder: 3 }
      ]
    };
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => queue,
      getCurrentActivation: () => queue.activations[queue.currentIndex]
    };
    (screen as any).focusInitiativeUnit = (unitId: string) => {
      focusedUnitIds.push(unitId);
    };
  });

  await When("Next Formation is used repeatedly", async () => {
    (screen as any).selectNextInitiativeGroupUnit();
    (screen as any).selectNextInitiativeGroupUnit();
    (screen as any).selectNextInitiativeGroupUnit();
  });

  await Then("the completed peers are included after the pending formation and the cycle returns to the pending formation", async () => {
    const expected = ["u_player_completed_first", "u_player_completed_second", "u_player_pending"];
    if (JSON.stringify(focusedUnitIds) !== JSON.stringify(expected)) {
      throw new Error(`Expected ${JSON.stringify(expected)}, received ${JSON.stringify(focusedUnitIds)}.`);
    }
  });
});

registerTest("BATTLESCREEN_NEXT_GROUP_COMPLETES_ONLY_THE_ACTIVE_PLAYER_GROUP", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let queue: {
    currentIndex: number;
    currentTurn: number;
    activations: Array<{ unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder: number }>;
  };
  let playerLead: ScenarioUnit;
  let playerWing: ScenarioUnit;
  let playerLater: ScenarioUnit;
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
    playerLater = createPlayerUnit("u_player_3", 4, 2);
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
    const playerUnits = [playerLead, playerWing, playerLater];
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
        { unitId: "u_player_2", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 2 },
        { unitId: "u_player_3", ownerId: "player", initiative: 4, isActivated: false, sortOrder: 3 }
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

  await When("the player selects Next Group and the interleaved enemy activation finishes", async () => {
    await (screen as any).handleProceedToNext();
    queue.activations[1].isActivated = true;
    queue.currentIndex = 2;
    (screen as any).flushSkippedInitiativeActivations();
  });

  await Then("the whole current group completes while the later initiative group remains available", async () => {
    if (!queue.activations[0]?.isActivated) {
      throw new Error("Expected the leading activation in the current group to complete.");
    }
    if (!queue.activations[2]?.isActivated) {
      throw new Error("Expected the interleaved member of the current group to complete after enemy resolution.");
    }
    if (queue.activations[3]?.isActivated || queue.currentIndex !== 3) {
      throw new Error(`Expected the later initiative group to remain pending at index 3, received ${queue.currentIndex}.`);
    }
    if (!playerLead.onSentry || !playerWing.onSentry) {
      throw new Error("Expected untouched formations in the active group to enter sentry before advancing.");
    }
    if (playerLater.onSentry || (screen as any).initiativeSkippedUnitIds.has("u_player_3")) {
      throw new Error("Expected Next Group to leave later player groups untouched.");
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
      getCurrentInitiativeQueue: () => ({
        currentIndex: 0,
        currentTurn: 1,
        activations: [
          { unitId: "u_engineer_first", ownerId: "player", initiative: 6, isActivated: false, sortOrder: 0 },
          { unitId: "u_engineer_active", ownerId: "player", initiative: 6, isActivated: false, sortOrder: 1 }
        ]
      }),
      getCurrentActivation: () => ({
        unitId: "u_engineer_active",
        ownerId: "player",
        initiative: 6,
        isActivated: false,
        sortOrder: 1
      })
    };

    (screen as any).tryTransferAllyControl = () => false;
    (screen as any).completeGuidedTutorialSelectionForClickedHex = () => {};
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

registerTest("BATTLESCREEN_TUTORIAL_DRAINS_TRANSFERRED_RECON_BEFORE_ENGINEERS", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let queue: {
    currentIndex: number;
    currentTurn: number;
    activations: Array<{
      unitId: string;
      ownerId: "player" | "bot";
      initiative: number;
      isActivated: boolean;
      sortOrder: number;
    }>;
  };
  let phaseWithRecon: string | null = null;
  let phaseAfterRecon: string | null = null;

  await Given("the enemy response returns command to a transferred recon before the engineers", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    const recon = { ...createPlayerUnit("allied_recon", 8, 6), type: "Recon_Bike" as ScenarioUnit["type"] };
    const engineer = { ...createPlayerUnit("engineer_1", 6, 5), type: "Engineer" as ScenarioUnit["type"] };
    queue = {
      currentIndex: 0,
      currentTurn: 1,
      activations: [
        { unitId: "allied_recon", ownerId: "player", initiative: 7, isActivated: false, sortOrder: 0 },
        { unitId: "engineer_1", ownerId: "player", initiative: 6, isActivated: false, sortOrder: 1 }
      ]
    };
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).initiativeSkippedUnitIds = new Set<string>();
    (screen as any).isReconBikeBattleUnit = (unit: ScenarioUnit) => unit.type === "Recon_Bike";
    (screen as any).battleState = {
      ensureGameEngine: () => ({
        playerUnits: [recon, engineer],
        botUnits: [],
        allyUnits: [],
        playerActionFlags: new Map()
      })
    };
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => queue,
      getCurrentActivation: () => queue.activations[queue.currentIndex] ?? null
    };
  });

  await When("tutorial progression is resolved before and after the remaining recon acts", async () => {
    phaseWithRecon = (screen as any).resolveNextTutorialPhaseAfterCompletion("enemy_activation");
    queue.activations[0]!.isActivated = true;
    queue.currentIndex = 1;
    phaseAfterRecon = (screen as any).resolveNextTutorialPhaseAfterCompletion("enemy_activation");
  });

  await Then("the recon lesson repeats once and engineers follow only when initiative six is active", async () => {
    if (phaseWithRecon !== "active_group_units") {
      throw new Error(`Expected another recon lesson, received ${phaseWithRecon ?? "none"}.`);
    }
    if (phaseAfterRecon !== "engineer_intro") {
      throw new Error(`Expected engineer instruction after recon initiative drained, received ${phaseAfterRecon ?? "none"}.`);
    }
  });
});

registerTest("BATTLESCREEN_ACTIVE_FRIENDLY_SELECTION_OVERRIDES_STALE_MOVE_HIGHLIGHT", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let selectedHexKey: string | null = null;
  let moveIssued = false;

  await Given("a completed recon still highlights the active engineer hex as a move destination", async () => {
    mountBattleScreenRoot();
    ensureTutorialState().endTutorial();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    const recon = { ...createPlayerUnit("recon_1", 3, 2), type: "Recon_Bike" as ScenarioUnit["type"] };
    const engineer = { ...createPlayerUnit("engineer_1", 6, 5), type: "Engineer" as ScenarioUnit["type"] };
    const queue = {
      currentIndex: 1,
      currentTurn: 1,
      activations: [
        { unitId: "recon_1", ownerId: "player" as const, initiative: 7, isActivated: true, sortOrder: 0 },
        { unitId: "engineer_1", ownerId: "player" as const, initiative: 6, isActivated: false, sortOrder: 1 }
      ]
    };
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).selectedHexKey = "3,2";
    (screen as any).selectedPlayerUnitId = "recon_1";
    (screen as any).playerMoveHexes = new Set<string>(["6,5"]);
    (screen as any).playerAttackHexes = new Set<string>();
    (screen as any).smokeTargetingState = null;
    (screen as any).artilleryTargetingState = null;
    (screen as any).tutorialMapInputBlockedUntil = 0;
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => queue,
      getCurrentActivation: () => queue.activations[1]
    };
    (screen as any).battleState = {
      ensureGameEngine: () => ({
        playerUnits: [recon, engineer],
        botUnits: [],
        allyUnits: []
      })
    };
    (screen as any).getPlayerStackMembersAtHex = (hexKey: string) => {
      if (hexKey === "3,2") {
        return [{ unitId: "recon_1", isAutomated: false, unit: recon }];
      }
      if (hexKey === "6,5") {
        return [{ unitId: "engineer_1", isAutomated: false, unit: engineer }];
      }
      return [];
    };
    (screen as any).applySelectedHex = (hexKey: string) => {
      selectedHexKey = hexKey;
    };
    (screen as any).executeAnimatedPlayerMove = async () => {
      moveIssued = true;
    };
  });

  await When("the commander clicks the engineer", async () => {
    (screen as any).onPlayerTurnMapClick("6,5");
  });

  await Then("the engineer is selected instead of validating a recon move", async () => {
    if (selectedHexKey !== "6,5") {
      throw new Error(`Expected the engineer hex to be selected, received ${selectedHexKey ?? "none"}.`);
    }
    if (moveIssued) {
      throw new Error("The inactive recon must not issue a move through the engineer selection click.");
    }
  });
});

registerTest("BATTLESCREEN_CLICKING_LEGAL_FRIENDLY_STACK_DESTINATION_MOVES_SELECTED_UNIT", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let movedToKey: string | null = null;
  let selectedInstead = false;

  await Given("a selected formation with a legal move onto a friendly occupied hex", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).selectedHexKey = "2,2";
    (screen as any).selectedPlayerUnitId = "moving-unit";
    (screen as any).playerMoveHexes = new Set<string>(["3,2"]);
    (screen as any).playerAttackHexes = new Set<string>();
    (screen as any).smokeTargetingState = null;
    (screen as any).artilleryTargetingState = null;
    (screen as any).tutorialMapInputBlockedUntil = 0;
    (screen as any).battleState = {
      ensureGameEngine: () => ({})
    };
    (screen as any).resolveSelectedPlayerStackMember = (hexKey: string) =>
      hexKey === "2,2"
        ? { unitId: "moving-unit", isAutomated: false, unit: createPlayerUnit("moving-unit", 2, 1) }
        : null;
    (screen as any).isUnitInCurrentInitiativeGroup = () => true;
    (screen as any).getPlayerStackMembersAtHex = (hexKey: string) =>
      hexKey === "3,2"
        ? [{ unitId: "holding-unit", isAutomated: false, unit: createPlayerUnit("holding-unit", 3, 1) }]
        : [];
    (screen as any).applySelectedHex = () => {
      selectedInstead = true;
    };
    (screen as any).executeAnimatedPlayerMove = async (
      _fromKey: string,
      toKey: string
    ) => {
      movedToKey = toKey;
    };
  });

  await When("the occupied friendly destination is clicked", async () => {
    (screen as any).onPlayerTurnMapClick("3,2");
  });

  await Then("the click issues the move instead of switching selection", async () => {
    if (movedToKey !== "3,2") {
      throw new Error(`Expected move order to 3,2, received ${movedToKey ?? "none"}.`);
    }
    if (selectedInstead) {
      throw new Error("Expected legal friendly stack destination not to be treated as a selection change.");
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

registerTest("BATTLESCREEN_INITIATIVE_HOLD_GROUP_REPORTS_GROUP_SCOPED_ADVANCE", async ({ Given, When, Then }) => {
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

  await Then("the commander-facing message confirms only the active group is advancing", async () => {
    if (message !== "Group ordered to hold. Initiative is advancing to the next group.") {
      throw new Error(`Expected group-scoped hold copy, received '${message ?? "null"}'.`);
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_END_TURN_REFUSES_TO_SKIP_AN_ACTIVE_GROUP", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let advanceCalls = 0;
  let message: string | null = null;

  await Given("an initiative round with an unfinished player group", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => ({
        currentIndex: 0,
        currentTurn: 3,
        activations: [
          { unitId: "u_player_1", ownerId: "player", initiative: 6, isActivated: false, sortOrder: 0 },
          { unitId: "u_player_2", ownerId: "player", initiative: 4, isActivated: false, sortOrder: 1 }
        ]
      }),
      getCurrentActivation: () => ({
        unitId: "u_player_1",
        ownerId: "player",
        initiative: 6,
        isActivated: false,
        sortOrder: 0
      })
    };
    (screen as any).showElegantInitiativeMessage = (text: string) => {
      message = text;
    };
    (screen as any).advanceInitiativeRound = async () => {
      advanceCalls += 1;
    };
    (screen as any).syncInitiativeTurnControlsState = () => {};
  });

  await When("end turn is requested before groups are complete", async () => {
    await (screen as any).handleInitiativeEndTurn();
  });

  await Then("the round remains active and directs the player to Next Group", async () => {
    if (advanceCalls !== 0) {
      throw new Error(`Expected no round advance while groups remain, received ${advanceCalls}.`);
    }
    if (message !== "This initiative group is still active. Select Next Group before ending the turn.") {
      throw new Error(`Expected Next Group guidance, received '${message ?? "null"}'.`);
    }
  });
});

registerTest("BATTLESCREEN_INITIATIVE_END_TURN_ADVANCES_ONLY_A_DRAINED_ROUND", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let advanceCalls = 0;

  await Given("an initiative round where every activation is complete", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).initiativeMethods = {
      getCurrentInitiativeQueue: () => ({
        currentIndex: 2,
        currentTurn: 1,
        activations: [
          { unitId: "u_player_1", ownerId: "player", initiative: 6, isActivated: true, sortOrder: 0 },
          { unitId: "u_bot_1", ownerId: "bot", initiative: 6, isActivated: true, sortOrder: 1 }
        ]
      }),
      getCurrentActivation: () => null
    };
    (screen as any).advanceInitiativeRound = async () => {
      advanceCalls += 1;
    };
    (screen as any).syncInitiativeTurnControlsState = () => {};
  });

  await When("the final End Turn action is requested", async () => {
    await (screen as any).handleInitiativeEndTurn();
  });

  await Then("the battle advances exactly one round", async () => {
    if (advanceCalls !== 1) {
      throw new Error(`Expected one drained-round advance, received ${advanceCalls}.`);
    }
  });
});

registerTest("BATTLESCREEN_TUTORIAL_NEXT_GROUP_FINISHES_ONLY_THE_GUIDED_INITIATIVE_GROUP", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let observedOptions: { bypassConfirmation?: boolean } | undefined;
  let completedPhase: string | null = null;
  const tutorialState = ensureTutorialState();

  await Given("the tutorial is waiting for the moved patrol to finish its initiative group", async () => {
    tutorialState.endTutorial();
    tutorialState.startTutorial();
    tutorialState.jumpToPhase("spend_activation");
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).handleProceedToNext = async (options?: { bypassConfirmation?: boolean }) => {
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

  await When("the player clicks the highlighted Next Group control", async () => {
    await (screen as any).handleTutorialAwareNextGroup();
  });

  await Then("the current group advances without the normal confirmation or a full-turn skip", async () => {
    if (observedOptions?.bypassConfirmation !== true) {
      throw new Error(`Expected a confirmation-free current-group handoff, received ${JSON.stringify(observedOptions)}.`);
    }
    if (completedPhase !== "spend_activation") {
      throw new Error(`Expected spend_activation to complete, received ${completedPhase ?? "<none>"}.`);
    }
    tutorialState.endTutorial();
  });
});

registerTest("BATTLESCREEN_MOVEMENT_TUTORIAL_PRESERVES_THE_FULL_RECON_RANGE", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let publishedIntel: unknown = "not-called";
  let tacticalMoveCount = 0;

  await Given("the recon patrol is selected with its full movement range", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).selectedHexKey = "6,5";
    (screen as any).selectedPlayerUnitId = "recon_1";
    (screen as any).playerMoveHexes = new Set([
      "4,3", "5,3", "6,3", "7,3",
      "4,4", "5,4", "6,4", "7,4",
      "4,5", "5,5", "6,5", "7,5"
    ]);
    (screen as any).playerAttackHexes = new Set<string>();
    (screen as any).selectedUnitMatchesTutorialTarget = () => true;
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
    if (tacticalMoveCount !== 12) {
      throw new Error(`Expected all twelve legal move choices, received ${tacticalMoveCount}.`);
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

registerTest("BATTLESCREEN_INITIATIVE_DRAINED_QUEUE_REQUIRES_EXPLICIT_END_TURN", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let advanceCalls = 0;
  let roundAdvanceReady = false;

  await Given("all initiative groups are complete and no activation remains", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
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
      updateCurrentGroup: () => {},
      updatePlayerTurn: () => {},
      updateRoundAdvanceReady: (ready: boolean) => {
        roundAdvanceReady = ready;
      },
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

  await Then("the End Turn state is exposed without advancing automatically", async () => {
    if (!roundAdvanceReady) {
      throw new Error("Expected the adaptive initiative control to expose End Turn.");
    }
    if (advanceCalls !== 0) {
      throw new Error(`Expected no automatic round advance, received ${advanceCalls}.`);
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

  await Then("free smoke, facing, and support orders preserve the activation", async () => {
    const expected = ["u_player_lead", "u_player_wing", "u_player_rear"];
    if (JSON.stringify(selectableIds) !== JSON.stringify(expected)) {
      throw new Error(`Expected free-order units to remain selectable, received ${JSON.stringify(selectableIds)}.`);
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

registerTest("BATTLESCREEN_SMOKE_TARGETS_USE_MAP_COORDINATES", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let highlightedTargets: string[] = [];

  await Given("a smoke-capable unit whose engine targets are axial keys", async () => {
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).battleState = {
      ensureGameEngine: () => ({
        resolveSmokeTargetHexKeys: () => ["4,2", "5,2"]
      })
    };
    (screen as any).beginSmokeTargeting = (
      _callerHexKey: string,
      _callerAxial: { q: number; r: number },
      _callerLabel: string,
      _callerUnitId: string | null,
      targetHexKeys: string[]
    ) => {
      highlightedTargets = targetHexKeys;
    };
  });

  await When("the smoke target overlay is opened", async () => {
    (screen as any).promptSmokeMode({ q: 4, r: 2 }, "Infantry Battalion", "u_player_1");
  });

  await Then("axial engine keys are converted to offset map keys", async () => {
    const expected = ["4,4", "5,4"];
    if (JSON.stringify(highlightedTargets) !== JSON.stringify(expected)) {
      throw new Error(`Expected offset smoke targets ${JSON.stringify(expected)}, received ${JSON.stringify(highlightedTargets)}.`);
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

registerTest("BATTLESCREEN_TUTORIAL_RECON_MOVE_HANDS_OFF_INITIATIVE", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let completedUnitId: string | null = null;
  let completedPhase: string | null = null;
  let clearedSelection = false;
  const tutorialState = ensureTutorialState();

  await Given("the guided recon patrol still has legal movement after its lesson move", async () => {
    tutorialState.endTutorial();
    tutorialState.startTutorial();
    tutorialState.jumpToPhase("movement_intro");
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).selectedHexKey = "2,2";
    (screen as any).selectedPlayerUnitId = "recon_1";
    (screen as any).hexMapRenderer = null;
    const movedUnit = createPlayerUnit("recon_1", 3, 2);
    (screen as any).battleState = {
      ensureGameEngine: () => ({
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
      }),
      emitBattleUpdate: () => {}
    };
    (screen as any).renderEngineUnits = () => {};
    (screen as any).clearSelectedHexAfterAction = () => {
      clearedSelection = true;
    };
    (screen as any).applySelectedHex = () => {};
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).completeTutorialPhase = (phase: string) => {
      completedPhase = phase;
    };
    (screen as any).completeInitiativeActivationAfterPlayerOrder = (unitId: string | null | undefined) => {
      completedUnitId = unitId ?? null;
    };
  });

  await When("the patrol completes the movement lesson", async () => {
    await (screen as any).executeAnimatedPlayerMove(
      "2,2",
      "3,2",
      { q: 2, r: 2 },
      { q: 3, r: 2 },
      "recon_1"
    );
  });

  await Then("the lesson completes and initiative passes despite unused movement", async () => {
    if (completedPhase !== "movement_intro") {
      throw new Error(`Expected movement_intro to complete, received ${completedPhase ?? "none"}.`);
    }
    if (completedUnitId !== "recon_1") {
      throw new Error(`Expected the guided patrol activation to complete, received ${completedUnitId ?? "none"}.`);
    }
    if (!clearedSelection) {
      throw new Error("Expected guided movement to clear stale movement and attack outlines before initiative passes.");
    }
    tutorialState.endTutorial();
  });
});

registerTest("BATTLESCREEN_TUTORIAL_REPLAYS_MAP_CLICKS_AFTER_CAMERA_SETTLES", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let selectionCalls = 0;
  const tutorialState = ensureTutorialState();

  await Given("the tutorial camera is still settling on a guided formation", async () => {
    tutorialState.endTutorial();
    tutorialState.startTutorial();
    tutorialState.jumpToPhase("active_group_units");
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).tutorialMapInputBlockedUntil = Date.now() + 10;
    (screen as any).tutorialQueuedMapClickTimerId = null;
    (screen as any).selectedHexKey = null;
    (screen as any).selectedPlayerUnitId = null;
    (screen as any).smokeTargetingState = null;
    (screen as any).artilleryTargetingState = null;
    (screen as any).onPlayerTurnMapClick = () => {
      selectionCalls += 1;
    };
    (screen as any).completeGuidedTutorialSelectionForClickedHex = () => {};
  });

  await When("a map click lands during the camera transition", async () => {
    (screen as any).queueTutorialMapClickAfterCamera("6,5");
    await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
  });

  await Then("the intended click is replayed once when the camera is ready", async () => {
    if (selectionCalls !== 1) {
      throw new Error(`Expected one queued selection after the tutorial camera settled, received ${selectionCalls}.`);
    }
    tutorialState.endTutorial();
  });
});

registerTest("BATTLESCREEN_TUTORIAL_GUIDED_SELECTION_ACCEPTS_REPEAT_CLICK_ON_SELECTED_UNIT", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let completedPhase: string | null = null;
  const tutorialState = ensureTutorialState();

  await Given("the fire-order lesson is waiting on a guided unit that is already selected", async () => {
    tutorialState.endTutorial();
    tutorialState.startTutorial();
    tutorialState.jumpToPhase("select_attack_unit");
    mountBattleScreenRoot();
    const firingUnit = createPlayerUnit("infantry_fire_1", 8, 7);
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).tutorialUserMapClickInProgress = true;
    (screen as any).tutorialGuidedHexKeys = new Set<string>(["8,7"]);
    (screen as any).getTutorialAttackTargetHexKeys = () => new Set<string>(["9,6"]);
    (screen as any).resolveSelectedPlayerStackMember = () => ({
      unit: firingUnit,
      unitId: firingUnit.unitId,
      isAutomated: false
    });
    (screen as any).battleState = {
      ensureGameEngine: () => ({
        getUnitCommandState: () => ({ isAutomated: false })
      })
    };
    (screen as any).completeTutorialPhase = (phase: string) => {
      completedPhase = phase;
    };
  });

  await When("the player clicks that same highlighted hex again", async () => {
    (screen as any).completeGuidedTutorialSelectionForClickedHex("8,7");
  });

  await Then("the selection lesson completes instead of stalling", async () => {
    if (completedPhase !== "select_attack_unit") {
      throw new Error(`Expected select_attack_unit to complete, received ${completedPhase ?? "none"}.`);
    }
    tutorialState.endTutorial();
  });
});

registerTest("BATTLESCREEN_INACTIVE_SELECTION_DOES_NOT_BLOCK_THE_NEXT_INITIATIVE_GROUP", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  let selectedHexKey: string | null = null;
  let initiativeWarningShown = false;

  await Given("a completed recon patrol remains selected when engineers become active", async () => {
    mountBattleScreenRoot();
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).selectedHexKey = "3,8";
    (screen as any).selectedPlayerUnitId = "recon_1";
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).smokeTargetingState = null;
    (screen as any).artilleryTargetingState = null;
    (screen as any).battleState = {
      ensureGameEngine: () => ({})
    };
    (screen as any).getPlayerStackMembersAtHex = (hexKey: string) =>
      hexKey === "9,7" ? [{ unitId: "engineer_1" }] : [];
    (screen as any).applySelectedHex = (hexKey: string) => {
      selectedHexKey = hexKey;
    };
    (screen as any).showInitiativeGroupMessage = () => {
      initiativeWarningShown = true;
    };
  });

  await When("the commander clicks the active engineer formation", async () => {
    (screen as any).onPlayerTurnMapClick("9,7");
  });

  await Then("selection changes before the old recon activation is validated", async () => {
    if (selectedHexKey !== "9,7") {
      throw new Error(`Expected the engineer hex to be selected, received ${selectedHexKey ?? "none"}.`);
    }
    if (initiativeWarningShown) {
      throw new Error("The completed recon patrol should not block selection of the active engineer group.");
    }
  });
});
