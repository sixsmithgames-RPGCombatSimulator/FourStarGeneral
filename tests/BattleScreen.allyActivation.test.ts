import "./domEnvironment.js";
import assert from "node:assert/strict";
import { BattleScreen } from "../src/ui/screens/BattleScreen.js";
import { EnhancedInitiativeTurnControls } from "../src/ui/components/EnhancedInitiativeTurnControls.js";
import { InitiativeTurnControls } from "../src/ui/components/InitiativeTurnControls.js";
import type { UnitActivation } from "../src/core/InitiativeQueue.js";
import type { InitiativeGroup } from "../src/core/GroupedInitiativeQueue.js";
import type { InitiativeBotActivationResult } from "../src/game/GameEngineInitiativeIntegration.js";
import type { TurnSummary } from "../src/game/GameEngine.js";
import type { ScenarioUnit } from "../src/core/types.js";
import type { MoveAnimationOptions } from "../src/rendering/HexMapRenderer.js";
import type { CombatPresentationContext } from "../src/rendering/CombatPresentationContext.js";
import unitTypes from "../src/data/unitSystem/derivedUnitTypes.js";
import { ensureTutorialState } from "../src/state/TutorialState.js";
import { registerTest } from "./harness.js";

type Faction = "Player" | "Bot" | "Ally";
type PresentedActivation = UnitActivation & { readonly faction?: Faction };
type PresentedResult = InitiativeBotActivationResult & { readonly faction?: Faction };
const noopEvents = {
  onSkipTurn: () => {}, onEndTurn: () => {}, onNextGroup: () => {}, onNextActivation: () => {},
  onCompleteActivation: () => {}, onProceedToNext: () => {}, onSkipGroup: () => {}
};

function activation(unitId = "allied-secondary", faction?: Faction): PresentedActivation {
  return Object.freeze({ unitId, ownerId: faction === "Player" ? "player" : "bot", initiative: 5, sortOrder: 0, isActivated: false, ...(faction ? { faction } : {}) });
}

/** Prototype fixture keeps real identity, controls, coordinates and playback; only external effects are probes. */
function createProbe() {
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;
  const ally: ScenarioUnit = { unitId: "allied-secondary", type: "Medium_Tank", hex: { q: 2, r: 0 }, strength: 100, ammo: 5, fuel: 30, experience: 0, entrench: 0, facing: "NW" };
  const engine = {
    playerUnits: [{ ...ally, unitId: "player-primary", hex: { q: 0, r: 0 } }],
    botUnits: [{ ...ally, unitId: "enemy-primary", hex: { q: 1, r: 0 } }],
    allyUnits: [ally], getEnemyContactSnapshot: () => []
  };
  const current = activation();
  const queue = Object.freeze({ currentIndex: 0, activations: Object.freeze([current]) });
  const faction = document.createElement("span");
  const phase = document.createElement("span");
  const focus: string[] = [];
  const paths: MoveAnimationOptions[] = [];
  const attacks: CombatPresentationContext[] = [];
  const activity: { category: string; type: string; summary: string }[] = [];
  const highlights: string[][] = [];
  const observations: unknown[] = [];
  const summary = { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 } as TurnSummary;
  Reflect.set(screen, "battleState", { ensureGameEngine: () => engine, getCurrentTurnSummary: () => summary });
  Reflect.set(screen, "isInitiativeSystemEnabled", true);
  Reflect.set(screen, "initiativeMethods", { isInitiativeSystemActive: () => true, getCurrentActivation: () => current, getCurrentInitiativeQueue: () => queue });
  Reflect.set(screen, "scenario", { size: { cols: 8, rows: 8 } });
  Reflect.set(screen, "unitTypes", unitTypes);
  Reflect.set(screen, "factionIndicatorElement", faction);
  Reflect.set(screen, "phaseIndicatorElement", phase);
  Reflect.set(screen, "battleAnimationMode", "regular");
  Reflect.set(screen, "mapViewport", {});
  Reflect.set(screen, "focusCameraOnHex", async (key: string) => { focus.push(key); });
  Reflect.set(screen, "publishActivityEvent", (event: typeof activity[number]) => { activity.push(event); });
  Reflect.set(screen, "missionRulesController", { observeBotMovements: (moves: unknown) => { observations.push(moves); } });
  Reflect.set(screen, "hexMapRenderer", {
    setInitiativeGroupHighlights: (keys: string[]) => { highlights.push(keys); },
    primeUnitMove: (_from: string, _to: string, options: MoveAnimationOptions) => {
      paths.push(options);
      return { play: async () => {}, dispose: () => {} };
    },
    playAttackSequence: async (_from: string, _to: string, _hard: boolean, context: CombatPresentationContext) => { attacks.push(context); }
  });
  for (const name of ["renderEngineUnits", "refreshCampaignMissionStatusAfterTacticalAction", "syncLegacyEndTurnButton", "flushSkippedInitiativeActivations", "recoverInitiativeQueueStall", "ensureFocusedPlayerInitiativeUnit", "syncInitiativeGroupSession"]) {
    Reflect.set(screen, name, () => {});
  }
  Reflect.set(screen, "waitForNextFrame", async () => {});
  Reflect.set(screen, "waitMs", async () => {});
  return { screen, engine, queue, current, faction, phase, summary, focus, paths, attacks, activity, highlights, observations };
}

function movement(faction?: Faction): PresentedResult {
  return {
    unitId: "allied-secondary", ownerId: faction === "Player" ? "player" : "bot", ...(faction ? { faction } : {}),
    unitType: "Medium_Tank", moved: true, fromHex: { q: 0, r: 0 }, toHex: { q: 2, r: 0 },
    movementPath: [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }], visibleBefore: false, visibleAfter: false, attacks: []
  };
}

async function play(screen: BattleScreen, event: PresentedResult): Promise<void> {
  ensureTutorialState().endTutorial();
  const handle = Reflect.get(screen, "handleInitiativeBotActivation") as (result: PresentedResult) => Promise<void>;
  await handle.call(screen, event);
}

registerTest("BATTLESCREEN_ALLY_ACTIVATION_HEADER_AND_HIGHLIGHT_USE_LIVE_STABLE_IDENTITY", () => {
  const probe = createProbe();
  const update = Reflect.get(probe.screen, "updateTurnStatusDisplay") as (summary: TurnSummary) => void;
  update.call(probe.screen, probe.summary);
  assert.equal(probe.faction.textContent, "Ally", "An automated queue owner is not necessarily an enemy faction.");
  assert.equal(probe.phase.textContent, "Allied initiative group is active");
  const highlight = Reflect.get(probe.screen, "highlightCurrentInitiativeGroup") as () => void;
  highlight.call(probe.screen);
  assert.deepEqual(probe.highlights, [["2,1"]], "Resolve the secondary Allied actor by stable ID, not same-type enemy or Player positions.");
});

registerTest("BATTLESCREEN_ALLY_ACTIVATION_SYNC_PROJECTS_FACTION_WITHOUT_QUEUE_MUTATION", () => {
  const probe = createProbe();
  const before = JSON.stringify(probe.queue);
  const container = document.createElement("div");
  const controls = new EnhancedInitiativeTurnControls(container, noopEvents);
  Reflect.set(probe.screen, "initiativeTurnControls", controls);
  try {
    const sync = Reflect.get(probe.screen, "syncInitiativeTurnControlsState") as () => void;
    sync.call(probe.screen);
    assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Allied group");
    assert.equal(container.querySelector(".initiative-status__detail")?.textContent, "Allied orders resolving");
    assert.equal((controls.getCurrentUnit() as PresentedActivation)?.faction, "Ally");
    assert.equal((controls.getCurrentGroup()?.units[0] as PresentedActivation)?.faction, "Ally");
    assert.notEqual(controls.getCurrentUnit(), probe.current);
    assert.equal(JSON.stringify(probe.queue), before, "Faction presentation must never become a serialized queue field.");
    assert.ok([...container.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled));
  } finally { controls.dispose(); }
});

registerTest("BATTLESCREEN_ALLY_ACTIVATION_CURRENT_CASUALTY_USES_CANONICAL_ACTIVE_FACTION_ONLY", () => {
  const probe = createProbe();
  probe.engine.allyUnits.length = 0;
  const methods = Reflect.get(probe.screen, "initiativeMethods") as Record<string, unknown>;
  methods.getCurrentActiveFaction = () => "Ally";
  const update = Reflect.get(probe.screen, "updateTurnStatusDisplay") as (summary: TurnSummary) => void;
  const resolve = Reflect.get(probe.screen, "resolveInitiativeFaction") as (actor: PresentedActivation) => Faction;
  update.call(probe.screen, probe.summary);
  assert.equal(probe.faction.textContent, "Ally", "The committed active faction survives counterfire while its activation is awaiting playback.");
  assert.equal(probe.phase.textContent, "Allied initiative group is active");
  assert.equal(resolve.call(probe.screen, activation("unknown-future")), "Bot", "A missing future actor must not inherit the current Ally's allegiance.");
  assert.equal(resolve.call(probe.screen, activation("allied-secondary", "Bot")), "Bot", "Explicit committed result identity takes precedence over a later active faction.");
  const container = document.createElement("div");
  const controls = new EnhancedInitiativeTurnControls(container, noopEvents);
  Reflect.set(probe.screen, "initiativeTurnControls", controls);
  try {
    const sync = Reflect.get(probe.screen, "syncInitiativeTurnControlsState") as () => void;
    sync.call(probe.screen);
    assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Allied group");
  } finally { controls.dispose(); }
});

for (const committed of [false, true]) {
  registerTest(`BATTLESCREEN_ALLY_ACTIVATION_${committed ? "COMMITTED_CASUALTY" : "LIVE_ROSTER"}_MOVEMENT_IS_FRIENDLY`, async () => {
    const probe = createProbe();
    const event = movement(committed ? "Ally" : undefined);
    if (committed) probe.engine.allyUnits.length = 0;
    const before = JSON.stringify(event);
    await play(probe.screen, event);
    assert.equal(probe.observations.length, 0, "Allied transit cannot satisfy enemy mission escape/breakthrough tracking.");
    assert.ok(probe.focus.includes("0,0"), "Friendly movement is visible even without an enemy contact record.");
    assert.deepEqual(probe.paths[0].path, ["0,0", "1,0", "2,1"]);
    assert.equal(probe.paths[0].unitId, "allied-secondary");
    assert.equal(probe.activity[0].category, "player");
    assert.match(probe.activity[0].summary, /^Allied .*repositioned from 0,0 to 2,1\.$/);
    assert.equal(JSON.stringify(event), before);
  });
}

registerTest("BATTLESCREEN_ALLY_ACTIVATION_FIRE_AND_HOLD_KEEP_COMMITTED_FACTION", async () => {
  const probe = createProbe();
  probe.engine.allyUnits.length = 0;
  const event: PresentedResult = {
    ...movement("Ally"), moved: false, movementPath: undefined, toHex: null,
    attacks: [{ attackerUnitId: "allied-secondary", attackerType: "Medium_Tank", defenderUnitId: "enemy-primary", defenderType: "Infantry_42",
      fromHex: { q: 0, r: 0 }, targetHex: { q: 1, r: 0 }, inflictedDamage: 10, defenderDestroyed: false,
      retaliation: { attackerUnitId: "enemy-counterfire", attackerType: "Infantry_42", damage: 100 } }]
  };
  await play(probe.screen, event);
  assert.equal(probe.attacks.length, 2, "Forward fire and counterfire must still finish before publication.");
  assert.equal(probe.attacks[0].attacker.unitId, "allied-secondary");
  assert.equal(probe.attacks[1].attacker.unitId, "enemy-counterfire");
  assert.equal(probe.activity[0].category, "player");
  assert.match(probe.activity[0].summary, /^Allied .*attacked .*Counterfire dealt 100 damage\.$/);
  await play(probe.screen, { ...event, attacks: [] });
  assert.equal(probe.activity[1].category, "player");
  assert.match(probe.activity[1].summary, /^Allied .*held position/);
  assert.equal(probe.observations.length, 0);
});

registerTest("BATTLESCREEN_ALLY_ACTIVATION_PRESERVES_LEGACY_ENEMY_FOG_AND_PLAYER_LOGS", async () => {
  const probe = createProbe();
  const enemy = { ...movement(), unitId: "enemy-primary" };
  await play(probe.screen, enemy);
  assert.equal(probe.observations.length, 1);
  assert.deepEqual(probe.focus, []);
  assert.equal(probe.activity[0].category, "enemy");
  assert.equal(probe.activity[0].summary, "Enemy movement detected outside direct observation.");
  await play(probe.screen, { ...movement("Player"), unitId: "player-primary" });
  assert.equal(probe.observations.length, 1);
  assert.equal(probe.activity[1].category, "player");
  assert.match(probe.activity[1].summary, /^Friendly .*repositioned/);
});

registerTest("BATTLESCREEN_ALLY_ACTIVATION_ENHANCED_CONTROLS_KEEP_ENEMY_HANDOFF_COUNTS_PRIVATE", () => {
  const container = document.createElement("div");
  const controls = new EnhancedInitiativeTurnControls(container, noopEvents);
  container.insertAdjacentHTML("beforeend", '<div class="current-group-info"><span class="group-initiative"></span><span class="progress-fill"></span><span class="progress-text"></span></div>');
  const ally = activation("allied-secondary", "Ally");
  const enemy = activation("enemy-primary", "Bot");
  const group = (units: PresentedActivation[]): InitiativeGroup => ({ initiative: 5, units, currentUnitIndex: 0, isCompleted: false });
  const assertPrivate = (): void => {
    assert.doesNotMatch((container.textContent ?? "").replace(/Initiative 5/g, ""), /\d/);
    assert.equal(container.querySelector<HTMLElement>(".progress-fill")?.style.width, "");
  };
  try {
    controls.updatePhase("initiativeTurn");
    controls.updatePlayerTurn(false);
    controls.updateCurrentUnit(ally);
    controls.updateCurrentGroup(group([ally]));
    assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Allied group");
    assertPrivate();
    controls.updateCurrentGroup(group([ally, enemy]));
    assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Allied group", "A real mixed automated initiative band follows the acting Ally, not the presence of an enemy peer.");
    assert.equal(container.querySelector(".initiative-status__detail")?.textContent, "Allied orders resolving");
    assertPrivate();
    controls.updateCurrentGroup(group([enemy, ...Array.from({ length: 17 }, () => enemy)]));
    assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Allied group", "A group-only update cannot relabel the still-current actor.");
    assertPrivate();
    controls.updateCurrentUnit(enemy);
    controls.updateCurrentGroup(group([ally]));
    assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Enemy group");
    assertPrivate();
    controls.updateCurrentUnit(ally);
    assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Allied group");
    assertPrivate();
    controls.updateCurrentGroup(null);
    assert.equal(container.querySelector(".initiative-status__value")?.textContent, "Allied formation");
    assert.ok([...container.querySelectorAll<HTMLButtonElement>("button")].every((button) => button.disabled));
  } finally { controls.dispose(); }
});

registerTest("BATTLESCREEN_ALLY_ACTIVATION_LEGACY_CONTROLS_LABEL_ALLY_WITHOUT_PLAYER_ORDERS", () => {
  const container = document.createElement("div");
  const controls = new InitiativeTurnControls(container, noopEvents, { enableKeyboardShortcuts: false });
  try {
    controls.updatePhase("initiativeTurn");
    controls.updatePlayerTurn(false);
    controls.updateCurrentActivation(activation("allied-secondary", "Ally"));
    assert.equal(container.querySelector(".current-unit-owner")?.textContent, "Ally (Initiative 5)");
    assert.equal(container.querySelector(".indicator-text")?.textContent, "Ally Acting");
    assert.equal(container.querySelector<HTMLButtonElement>(".end-turn-btn")?.disabled, true);
    assert.equal(container.querySelector<HTMLButtonElement>(".skip-turn-btn")?.disabled, true);
  } finally { controls.dispose(); }
});
