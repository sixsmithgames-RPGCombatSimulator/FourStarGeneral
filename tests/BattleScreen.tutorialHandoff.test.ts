import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import { TutorialOverlay } from "../src/ui/components/TutorialOverlay";
import { EnhancedInitiativeTurnControls } from "../src/ui/components/EnhancedInitiativeTurnControls";
import { GameEngine } from "../src/game/GameEngine";
import { GameEngineInitiativeMethods, type InitiativeBotActivationResult } from "../src/game/GameEngineInitiativeIntegration";
import type { ScenarioData, ScenarioSide, ScenarioUnit } from "../src/core/types";
import type { InitiativeQueue, UnitActivation } from "../src/core/InitiativeQueue";
import { ensureTutorialState } from "../src/state/TutorialState";
import terrain from "../src/data/terrain.json";
import unitTypes from "../src/data/unitSystem/derivedUnitTypes";

/** Owns only test clocks; a long presentation promise must not consume real seconds. */
class TutorialTestClock {
  private now = 0;
  private nextId = 1;
  private readonly timers = new Map<number, { at: number; run: () => void }>();
  private readonly originalNow = Date.now;
  private readonly originalSet = globalThis.setTimeout;
  private readonly originalClear = globalThis.clearTimeout;
  private readonly originalWindowSet = window.setTimeout;
  private readonly originalWindowClear = window.clearTimeout;

  constructor() {
    const schedule = (run: () => void, delay = 0): number => {
      const id = this.nextId++;
      this.timers.set(id, { at: this.now + delay, run });
      return id;
    };
    const cancel = (id: number): void => { this.timers.delete(Number(id)); };
    // These browser-facing paths use numeric handles, not Node timer methods.
    Object.assign(globalThis, { setTimeout: schedule, clearTimeout: cancel });
    Object.assign(window, { setTimeout: schedule, clearTimeout: cancel });
    Date.now = () => this.now;
  }

  /** Flushes async listener continuations between deterministic timer callbacks. */
  async advance(milliseconds: number): Promise<void> {
    const until = this.now + milliseconds;
    for (;;) {
      for (let pass = 0; pass < 8; pass += 1) await Promise.resolve();
      const next = [...this.timers.entries()].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > until) break;
      this.now = next[1].at;
      this.timers.delete(next[0]);
      next[1].run();
    }
    this.now = until;
  }

  /** Reports pending callbacks to detect duplicate monitor/transition chains. */
  get pendingCount(): number { return this.timers.size; }

  /** Restores every patched host API even when the regression fails. */
  restore(): void {
    Date.now = this.originalNow;
    globalThis.setTimeout = this.originalSet;
    globalThis.clearTimeout = this.originalClear;
    window.setTimeout = this.originalWindowSet;
    window.clearTimeout = this.originalWindowClear;
    this.timers.clear();
  }
}

function createTutorialHandoffEngine(playerType: ScenarioUnit["type"] = "Medium_Tank", nextGroupPlayback = false): GameEngine {
  // An adjacent-range enemy must really move before firing in the Next Group playback regression.
  const definitions = nextGroupPlayback ? { ...unitTypes, Infantry_42: {
    ...unitTypes.Infantry_42, rangeMin: 1, rangeMax: 1, movement: 2, vision: 4
  } } : unitTypes;
  const makeUnit = (unitId: string, type: ScenarioUnit["type"], q: number): ScenarioUnit => ({
    unitId, type, hex: { q, r: 0 }, strength: 100, experience: 0,
    ammo: unitTypes[type].ammo, fuel: unitTypes[type].fuel,
    entrench: 0, facing: "NW", preDeployed: true
  });
  const side = (units: ScenarioUnit[]): ScenarioSide => ({
    hq: { ...units[0].hex }, units,
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 }
  });
  const scenario: ScenarioData = {
    name: "Tutorial asynchronous enemy handoff", size: { cols: 8, rows: 3 },
    tilePalette: { p: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" } },
    tiles: Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => ({ tile: "p" }))),
    objectives: [], turnLimit: 6,
    sides: {
      Player: side(nextGroupPlayback
        ? [makeUnit("guided-infantry", "Infantry_42", 0), makeUnit("smoke-tank", playerType, 3)]
        : [makeUnit("smoke-tank", playerType, 0)]),
      Bot: side([makeUnit("enemy-infantry", "Infantry_42", nextGroupPlayback ? 5 : 7)])
    }
  };
  const engine = new GameEngine({ scenario, terrain, unitTypes: definitions,
    playerSide: scenario.sides.Player, botSide: scenario.sides.Bot, botStrategyMode: "Heuristic" });
  engine.beginDeployment();
  engine.setBaseCamp({ q: 0, r: 0 });
  engine.finalizeDeployment();
  return engine;
}

function createWaitScreen(engine: GameEngine, methods: GameEngineInitiativeMethods): BattleScreen {
  // Exercise production wait/target/queue methods without mounting unrelated overlays.
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;
  Object.assign(screen, {
    isInitiativeSystemEnabled: true, initiativeMethods: methods,
    battleState: { ensureGameEngine: () => engine },
    tutorialEnemyActivationWait: null, tutorialPhaseCompletion: null,
    highlightCurrentInitiativeGroup: () => {}, syncInitiativeTurnControlsState: () => {},
    publishActivityEvent: () => {}
  });
  ensureTutorialState().startTutorial();
  ensureTutorialState().advancePhase("round_handoff", false);
  // Match the existing screen subscription's timer lifecycle without rendering
  // unrelated camera/selection UI in this queue/transition regression fixture.
  screen["tutorialUpdateUnsubscribe"] = ensureTutorialState().subscribe((progress) => {
    screen["clearStaleTutorialWaits"](progress.isActive ? progress.currentPhase : null);
  });
  return screen;
}

function finishFixture(screen: BattleScreen, clock: TutorialTestClock): void {
  ensureTutorialState().endTutorial();
  screen["tutorialUpdateUnsubscribe"]?.();
  clock.restore();
}

function playerActivation(isActivated = false): UnitActivation {
  return { unitId: "smoke-tank", ownerId: "player", initiative: 4, isActivated, sortOrder: 1 };
}

function hydrateQueue(methods: GameEngineInitiativeMethods, queue: InitiativeQueue, current: UnitActivation | null): void {
  const snapshot = methods.serializeState();
  methods.hydrateState({ ...snapshot, integration: {
    isInitiativeSystemEnabled: true, currentActivation: current,
    manager: { initiativeQueue: queue, currentActivation: current, isInitiativeSystemActive: true, turnPhase: "initiative" }
  } });
}

function readyFixture(playerType: ScenarioUnit["type"] = "Medium_Tank"):
{ engine: GameEngine; methods: GameEngineInitiativeMethods; screen: BattleScreen; clock: TutorialTestClock } {
  const clock = new TutorialTestClock();
  const engine = createTutorialHandoffEngine(playerType);
  engine.startPlayerTurnPhase();
  const methods = new GameEngineInitiativeMethods(engine);
  const current = playerActivation();
  hydrateQueue(methods, { activations: [current], currentIndex: 0, currentTurn: 1 }, current);
  return { engine, methods, screen: createWaitScreen(engine, methods), clock };
}

/** Mount only the two initiative status consumers around the real canonical queue. */
function statusFixture(): ReturnType<typeof readyFixture> & {
  status: HTMLElement; controls: HTMLElement; sync: () => void; dispose: () => void;
} {
  const fixture = readyFixture();
  const root = document.createElement("section");
  root.innerHTML = '<div class="turn-status" role="status" aria-live="polite"><strong id="battleTurnIndicator">Deployment</strong><span id="battlePhaseIndicator" class="sr-only">Deployment</span><span id="battleFactionIndicator" class="sr-only">Player</span></div><div class="test-initiative-controls"></div>';
  document.body.appendChild(root);
  const status = root.querySelector<HTMLElement>(".turn-status")!;
  const controls = root.querySelector<HTMLElement>(".test-initiative-controls")!;
  const enhanced = new EnhancedInitiativeTurnControls(controls, {
    onSkipTurn: () => {}, onEndTurn: () => {}, onNextGroup: () => {},
    onNextActivation: () => {}, onCompleteActivation: () => {},
    onProceedToNext: () => {}, onSkipGroup: () => {}
  });
  Object.assign(fixture.screen, {
    battleState: {
      ensureGameEngine: () => fixture.engine,
      getCurrentTurnSummary: () => fixture.engine.getTurnSummary(),
      getPrecombatMissionInfo: () => ({ turnLimit: 6 })
    },
    initiativeTurnControls: enhanced,
    initiativeSkippedUnitIds: new Set<string>(),
    turnIndicatorElement: status.querySelector("#battleTurnIndicator"),
    phaseIndicatorElement: status.querySelector("#battlePhaseIndicator"),
    factionIndicatorElement: status.querySelector("#battleFactionIndicator"),
    syncLegacyEndTurnButton: () => {}, ensureFocusedPlayerInitiativeUnit: () => {}
  });
  const sync = (): void => { BattleScreen.prototype["syncInitiativeTurnControlsState"].call(fixture.screen); };
  return { ...fixture, status, controls, sync, dispose: () => {
    enhanced.dispose();
    root.remove();
    finishFixture(fixture.screen, fixture.clock);
  } };
}

registerTest("TUTORIAL_INITIATIVE_ACCESSIBLE_STATUS_FOLLOWS_CANONICAL_QUEUE_WITHOUT_BATTLE_EVENT", async () => {
  const fixture = statusFixture();
  const enemy: UnitActivation = { unitId: "enemy-infantry", ownerId: "bot", initiative: 5, isActivated: false, sortOrder: 0 };
  try {
    fixture.screen["updateTurnStatusDisplay"](fixture.engine.getTurnSummary());
    const cases = [
      { current: playerActivation(), phase: "Your initiative group is active", faction: "Player", group: "Your group", enabled: true },
      { current: enemy, phase: "Enemy initiative group is active", faction: "Enemy", group: "Enemy group", enabled: false },
      { current: playerActivation(), phase: "Your initiative group is active", faction: "Player", group: "Your group", enabled: true },
      { current: null, phase: "Turn ready to end", faction: "Player", group: "Turn ready", enabled: true }
    ];
    for (const entry of cases) {
      const activations = [entry.current ?? playerActivation(true)];
      hydrateQueue(fixture.methods, { activations, currentIndex: entry.current ? 0 : 1, currentTurn: 1 }, entry.current);
      // Only initiative's normal projection runs: no BattleState notification or second status authority.
      fixture.sync();
      assert.equal(fixture.status.querySelector("#battlePhaseIndicator")?.textContent, entry.phase);
      assert.equal(fixture.status.querySelector("#battleFactionIndicator")?.textContent, entry.faction);
      assert.equal(fixture.controls.querySelector(".initiative-status__value")?.textContent, entry.group);
      assert.equal(fixture.controls.querySelector<HTMLButtonElement>(".group-advance-btn")?.disabled, !entry.enabled);
      assert.equal(fixture.methods.getCurrentActivation()?.unitId ?? null, entry.current?.unitId ?? null,
        "Synchronizing presentation must not complete an activation or start another round.");
    }
  } finally { fixture.dispose(); }
});

registerTest("TUTORIAL_INITIATIVE_STATUS_DOES_NOT_REANNOUNCE_UNCHANGED_TEXT", async () => {
  const fixture = statusFixture();
  const observer = new window.MutationObserver(() => {});
  try {
    fixture.screen["updateTurnStatusDisplay"](fixture.engine.getTurnSummary());
    observer.observe(fixture.status, { subtree: true, childList: true, characterData: true });
    fixture.screen["updateTurnStatusDisplay"](fixture.engine.getTurnSummary());
    assert.equal(observer.takeRecords().length, 0, "An unchanged live status projection must not replace its text nodes.");
    fixture.sync();
    fixture.sync();
    assert.equal(observer.takeRecords().length, 0, "Repeated initiative synchronization must not trigger duplicate live announcements.");
  } finally {
    observer.disconnect();
    fixture.dispose();
  }
});

registerTest("TUTORIAL_HANDOFF_WAITS_FOR_REAL_BOT_PLAYBACK_BEYOND_NINE_SECONDS", async () => {
  const clock = new TutorialTestClock();
  let releasePlayback = (): void => {};
  const playback = new Promise<void>((resolve) => { releasePlayback = resolve; });
  const engine = createTutorialHandoffEngine();
  const methods = new GameEngineInitiativeMethods(engine);
  let resultCount = 0;
  methods.setBotActivationListener(async () => { resultCount += 1; await playback; });
  const screen = createWaitScreen(engine, methods);
  try {
    methods.startInitiativeTurnPhase();
    assert.equal(methods.getCurrentActivation()?.unitId, "enemy-infantry");
    screen["monitorTutorialEnemyActivation"]("round_handoff");
    await clock.advance(12_000);
    assert.equal(methods.getCurrentActivation()?.unitId, "enemy-infantry",
      "Presentation duration must never skip the canonical enemy activation.");
    assert.equal(ensureTutorialState().getCurrentPhase(), "round_handoff");
    assert.equal(ensureTutorialState().getProgress().canProceed, false);
    assert.equal(resultCount, 1);

    releasePlayback();
    await clock.advance(1_200);
    assert.equal(methods.getCurrentActivation()?.unitId, "smoke-tank");
    assert.equal(ensureTutorialState().getCurrentPhase(), "select_smoke_unit");
    assert.equal(engine.getUnitCommandState({ q: 0, r: 0 }, "smoke-tank")?.canLaySmoke, true);
    assert.equal(resultCount, 1, "Releasing one playback must complete exactly one bot activation.");
  } finally {
    releasePlayback();
    await clock.advance(0);
    finishFixture(screen, clock);
  }
});

registerTest("TUTORIAL_NEXT_GROUP_CAMERA_HOLD_STARTS_BEFORE_DEFERRED_HANDOFF_AND_AWAITS_REAL_PLAYBACK", async () => {
  const clock = new TutorialTestClock();
  const engine = createTutorialHandoffEngine("Medium_Tank", true);
  engine.startPlayerTurnPhase();
  const methods = new GameEngineInitiativeMethods(engine);
  const guided: UnitActivation = { unitId: "guided-infantry", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 0 };
  const enemy: UnitActivation = { unitId: "enemy-infantry", ownerId: "bot", initiative: 5, isActivated: false, sortOrder: 1 };
  const smoke = playerActivation();
  hydrateQueue(methods, { activations: [guided, enemy, smoke], currentIndex: 0, currentTurn: 1 }, guided);
  const screen = createWaitScreen(engine, methods);
  const state = ensureTutorialState();
  state.advancePhase("spend_activation", false);
  const deferred = (): { promise: Promise<void>; release: () => void } => {
    let release = (): void => {};
    const promise = new Promise<void>((resolve) => { release = resolve; });
    return { promise, release };
  };
  const move = deferred();
  const forward = deferred();
  const counterfire = deferred();
  const flushPlayback = async (): Promise<void> => {
    for (let pass = 0; pass < 24; pass += 1) await Promise.resolve();
  };
  const order: string[] = [];
  const focus: string[] = [];
  const events: InitiativeBotActivationResult[] = [];
  const entryPhases: string[] = [];
  let attackIndex = 0;
  let playbackCompleted = false;
  let playback: Promise<void> | null = null;
  Object.assign(screen, {
    initiativeSkippedUnitIds: new Set<string>(), initiativeGroupCursorUnitId: null,
    battleAnimationMode: "regular", mapViewport: {}, scenario: { size: { cols: 8, rows: 3 } }, unitTypes,
    focusCameraOnHex: async (key: string) => { focus.push(key); },
    waitForNextFrame: async () => {}, waitMs: async () => {}, renderEngineUnits: () => {},
    refreshCampaignMissionStatusAfterTacticalAction: () => {},
    logInitiativeBotActivationActivity: () => { order.push("publish"); },
    hexMapRenderer: {
      primeUnitMove: () => ({
        play: async () => { order.push("move-start"); await move.promise; order.push("move-end"); },
        dispose: () => { order.push("move-dispose"); }
      }),
      playAttackSequence: async () => {
        const stage = attackIndex++ === 0 ? "forward" : "counterfire";
        order.push(`${stage}-start`);
        await (stage === "forward" ? forward.promise : counterfire.promise);
        order.push(`${stage}-end`);
      }
    }
  });
  const unsubscribe = state.subscribe((progress) => {
    if (progress.isActive && progress.currentPhase === "round_handoff") screen["monitorTutorialEnemyActivation"]("round_handoff");
  });
  methods.setBotActivationListener((event) => {
    events.push(event);
    entryPhases.push(state.getCurrentPhase());
    playback = screen["handleInitiativeBotActivation"](event).then(() => { playbackCompleted = true; });
    return playback;
  });
  try {
    // Do not stub either command method or the engine planner: committing the real
    // player group synchronously enters the canonical enemy observer before the await returns.
    await screen["handleTutorialAwareNextGroup"]();
    await clock.advance(0);
    await flushPlayback();
    assert.deepEqual(entryPhases, ["spend_activation"]);
    assert.equal(events.length, 1);
    assert.ok((events[0].movementPath?.length ?? 0) > 1, "The real enemy must commit movement, not a fabricated visual route.");
    assert.equal(events[0].attacks.length, 1);
    assert.ok((events[0].attacks[0].retaliation?.damage ?? 0) > 0, "This fixture must exercise real positive-damage counterfire.");
    assert.equal(state.getCurrentPhase(), "spend_activation");
    assert.equal(methods.getCurrentActivation()?.unitId, "enemy-infantry");
    assert.deepEqual([...order], ["move-start"]);
    await clock.advance(800);
    assert.equal(state.getCurrentPhase(), "round_handoff", "Only the existing deferred tutorial completion advances the phase.");
    assert.equal(playbackCompleted, false);
    move.release();
    await clock.advance(0);
    await flushPlayback();
    assert.deepEqual([...order], ["move-start", "move-end", "move-dispose", "forward-start"]);
    assert.equal(methods.getCurrentActivation()?.unitId, "enemy-infantry");
    assert.equal(playbackCompleted, false);
    forward.release();
    await clock.advance(0);
    await flushPlayback();
    assert.deepEqual([...order], ["move-start", "move-end", "move-dispose", "forward-start", "forward-end", "counterfire-start"]);
    assert.equal(methods.getCurrentActivation()?.unitId, "enemy-infantry");
    assert.equal(state.getCurrentPhase(), "round_handoff");
    assert.equal(playbackCompleted, false);
    counterfire.release();
    await clock.advance(2_000);
    await playback;
    assert.deepEqual([...order], ["move-start", "move-end", "move-dispose", "forward-start", "forward-end", "counterfire-start", "counterfire-end", "publish"]);
    assert.equal(playbackCompleted, true);
    assert.deepEqual(focus, [], "An accepted Next Group must preserve the tutorial camera from observer entry through the delayed handoff.");
    assert.equal(events.length, 1, "Presentation cannot execute the enemy twice.");
    assert.equal(methods.getCurrentActivation()?.unitId, "smoke-tank");
    assert.equal(state.getCurrentPhase(), "select_smoke_unit");
    const smokeUnit = engine.playerUnits.find((unit) => unit.unitId === "smoke-tank");
    assert.ok(smokeUnit);
    assert.equal(engine.getUnitCommandState(smokeUnit.hex, smokeUnit.unitId)?.canLaySmoke, true);
  } finally {
    move.release(); forward.release(); counterfire.release();
    await clock.advance(2_000);
    await playback;
    unsubscribe();
    finishFixture(screen, clock);
  }
});

registerTest("TUTORIAL_HANDOFF_RESUMES_ONLY_CANONICAL_NULL_CURRENT_PENDING_ACTIVATION", async () => {
  const { engine, methods, screen, clock } = readyFixture();
  let releasePlayback = (): void => {};
  const playback = new Promise<void>((resolve) => { releasePlayback = resolve; });
  const enemy: UnitActivation = { unitId: "enemy-infantry", ownerId: "bot", initiative: 5, isActivated: false, sortOrder: 0 };
  const player = playerActivation();
  hydrateQueue(methods, { activations: [enemy, player], currentIndex: 0, currentTurn: 1 }, null);
  let executions = 0;
  methods.setBotActivationListener(async () => { executions += 1; await playback; });
  try {
    assert.equal(methods.getCurrentActivation(), null);
    screen["monitorTutorialEnemyActivation"]("round_handoff");
    assert.equal(methods.getCurrentActivation()?.unitId, "enemy-infantry");
    for (let update = 0; update < 20; update += 1) screen["monitorTutorialEnemyActivation"]("round_handoff");
    assert.equal(clock.pendingCount, 1, "Repeated state updates must share a single existing wait timer.");
    await clock.advance(12_000);
    assert.equal(executions, 1, "An already active enemy must not execute again during repeated checks.");
    assert.equal(ensureTutorialState().getCurrentPhase(), "round_handoff");
    releasePlayback();
    await clock.advance(1_200);
    assert.equal(ensureTutorialState().getCurrentPhase(), "select_smoke_unit");
    assert.equal(methods.getCurrentActivation()?.unitId, "smoke-tank");
    assert.equal(engine.getUnitCommandState({ q: 0, r: 0 }, "smoke-tank")?.canLaySmoke, true);
  } finally {
    releasePlayback();
    await clock.advance(0);
    finishFixture(screen, clock);
  }
});

registerTest("TUTORIAL_HANDOFF_NULL_DRAINED_AND_NO_SMOKE_QUEUES_NEVER_ADVERTISE_READY", async () => {
  for (const mode of ["null", "drained", "no-smoke", "no-current"] as const) {
    const { methods, screen, clock } = readyFixture("Infantry_42");
    if (mode === "null") screen["initiativeMethods"] = new GameEngineInitiativeMethods(createTutorialHandoffEngine());
    if (mode === "drained") {
      hydrateQueue(methods, { activations: [playerActivation(true)], currentIndex: 1, currentTurn: 1 }, null);
    }
    if (mode === "no-current") {
      hydrateQueue(methods, { activations: [playerActivation()], currentIndex: 0, currentTurn: 1 }, null);
    }
    try {
      screen["monitorTutorialEnemyActivation"]("round_handoff");
      await clock.advance(12_000);
      assert.equal(ensureTutorialState().getCurrentPhase(), "round_handoff", mode);
      assert.equal(ensureTutorialState().getProgress().canProceed, false, mode);
      assert.equal(clock.pendingCount, 1, mode);
    } finally { finishFixture(screen, clock); }
  }
});

registerTest("TUTORIAL_HANDOFF_REVALIDATES_OWNERSHIP_AND_SMOKE_AFTER_DEFERRED_TRANSITION", async () => {
  for (const change of ["enemy-owner", "smoke-spent"] as const) {
    const { engine, methods, screen, clock } = readyFixture();
    try {
      screen["monitorTutorialEnemyActivation"]("round_handoff");
      assert.equal(ensureTutorialState().getProgress().canProceed, true);
      await clock.advance(400);
      if (change === "enemy-owner") {
        const enemy: UnitActivation = { unitId: "enemy-infantry", ownerId: "bot", initiative: 5, isActivated: false, sortOrder: 0 };
        hydrateQueue(methods, { activations: [enemy, playerActivation()], currentIndex: 0, currentTurn: 1 }, enemy);
      } else {
        engine.laySmoke({ q: 0, r: 0 }, "E", "smoke-tank");
        assert.equal(engine.getUnitCommandState({ q: 0, r: 0 }, "smoke-tank")?.canLaySmoke, false);
      }
      await clock.advance(400);
      assert.equal(ensureTutorialState().getCurrentPhase(), "round_handoff", change);
      assert.equal(ensureTutorialState().getProgress().canProceed, false, change);
      assert.equal(clock.pendingCount, 1, change);
    } finally { finishFixture(screen, clock); }
  }
});

registerTest("TUTORIAL_HANDOFF_OWNS_ONE_COMPLETION_AND_CANCELS_PHASE_END_RESTART_CALLBACKS", async () => {
  for (const nextPhase of ["smoke_demo", "inactive", "round_handoff"] as const) {
    const { screen, clock } = readyFixture();
    const state = ensureTutorialState();
    try {
      screen["monitorTutorialEnemyActivation"]("round_handoff");
      for (let update = 0; update < 20; update += 1) screen["monitorTutorialEnemyActivation"]("round_handoff");
      assert.equal(clock.pendingCount, 1);
      await clock.advance(400);
      state.endTutorial();
      if (nextPhase !== "inactive") {
        state.startTutorial();
        state.advancePhase(nextPhase, false);
      }
      await clock.advance(1_200);
      assert.equal(state.getCurrentPhase(), nextPhase);
      assert.equal(clock.pendingCount, 0, "Ended/replaced lessons must own no delayed transition.");
    } finally { finishFixture(screen, clock); }
  }
});

registerTest("TUTORIAL_HANDOFF_WAIT_CANCELLATION_PRESERVES_NEW_PHASE_TIMER", async () => {
  const { screen, clock } = readyFixture("Infantry_42");
  try {
    screen["monitorTutorialEnemyActivation"]("round_handoff");
    assert.equal(clock.pendingCount, 1);
    ensureTutorialState().advancePhase("enemy_response", false);
    screen["monitorTutorialEnemyActivation"]("enemy_response");
    // Simulate a callback already queued by the host before it was cancelled.
    screen["monitorTutorialEnemyActivation"]("round_handoff");
    assert.equal(clock.pendingCount, 1);
    await clock.advance(800);
    assert.equal(ensureTutorialState().getCurrentPhase(), "artillery_support_intro");
    assert.equal(clock.pendingCount, 0);
    screen["clearStaleTutorialWaits"](null);
  } finally { finishFixture(screen, clock); }
});

registerTest("TUTORIAL_HANDOFF_OTHER_DELAYED_PHASES_DO_NOT_OVERWRITE_CURRENT_LESSON", async () => {
  const { screen, clock } = readyFixture();
  const state = ensureTutorialState();
  try {
    state.advancePhase("select_attack_unit", false);
    screen["completeTutorialPhase"]("select_attack_unit");
    state.advancePhase("smoke_demo", false);
    await clock.advance(1_200);
    assert.equal(state.getCurrentPhase(), "smoke_demo");
    assert.equal(state.getProgress().canProceed, false);
    assert.equal(clock.pendingCount, 0);
  } finally { finishFixture(screen, clock); }
});

registerTest("TUTORIAL_HANDOFF_OVERLAY_FIRST_RENDER_RESET_REPLACES_COMPLETION_TIMER", async () => {
  const { screen, clock } = readyFixture();
  const state = ensureTutorialState();
  state.startTutorial();
  state.advancePhase("spend_activation", false);
  // Keep the real overlay state-normalization handler; only painting is omitted.
  const overlay = Object.create(TutorialOverlay.prototype) as TutorialOverlay;
  Object.assign(overlay, { syncingCanProceed: false, lastRenderedPhase: "spend_activation",
    show: () => {}, renderStep: () => {}, hide: () => {} });
  let smokeLessonEntries = 0;
  // TacticalBattleFlowBootstrap registers the screen before the overlay. A ready
  // handoff reenters the screen when the overlay initializes its required action.
  const unsubscribeScreen = state.subscribe((progress) => {
    if (!progress.isActive) return;
    if (progress.currentPhase === "round_handoff") screen["monitorTutorialEnemyActivation"]("round_handoff");
    if (progress.currentPhase === "select_smoke_unit") smokeLessonEntries += 1;
  });
  const unsubscribeOverlay = state.subscribe((progress) => overlay["handleProgressUpdate"](progress));
  try {
    state.advancePhase("round_handoff", false);
    assert.equal(state.getProgress().canProceed, true);
    assert.equal(clock.pendingCount, 1, "The overlay's reentrant reset must cancel the replaced completion timer.");
    state.setCanProceed(false);
    assert.equal(clock.pendingCount, 1, "A later same-phase reset must also leave only one completion timer.");
    await clock.advance(800);
    assert.equal(state.getCurrentPhase(), "select_smoke_unit");
    assert.equal(smokeLessonEntries, 1);
    assert.equal(clock.pendingCount, 0);
  } finally {
    unsubscribeScreen();
    unsubscribeOverlay();
    finishFixture(screen, clock);
  }
});
