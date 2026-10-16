import "./domEnvironment.js";
import assert from "node:assert/strict";
import { BattleScreen } from "../src/ui/screens/BattleScreen.js";
import type { InitiativeBotActivationResult } from "../src/game/GameEngineInitiativeIntegration.js";
import type { BotTurnSummary } from "../src/game/GameEngine.js";
import type { Axial } from "../src/core/Hex.js";
import type { MoveAnimationOptions } from "../src/rendering/HexMapRenderer.js";
import type { CombatPresentationContext } from "../src/rendering/CombatPresentationContext.js";
import unitTypesData from "../src/data/unitSystem/derivedUnitTypes.js";
import { registerTest } from "./harness.js";
import { ensureTutorialState } from "../src/state/TutorialState.js";

/** Use the real playback method and coordinate conversion, replacing only screen side effects. */
function createPlaybackProbe(): {
  screen: BattleScreen;
  calls: string[];
  paths: MoveAnimationOptions[];
  attacks: CombatPresentationContext[];
  play: (event: InitiativeBotActivationResult) => Promise<void>;
} {
  const screen = Object.create(BattleScreen.prototype) as BattleScreen;
  const calls: string[] = [];
  const paths: MoveAnimationOptions[] = [];
  const attacks: CombatPresentationContext[] = [];
  Reflect.set(screen, "isInitiativeSystemEnabled", true);
  Reflect.set(screen, "battleAnimationMode", "quick");
  Reflect.set(screen, "mapViewport", null);
  Reflect.set(screen, "scenario", { size: { cols: 8, rows: 8 } });
  Reflect.set(screen, "unitTypes", unitTypesData);
  Reflect.set(screen, "missionRulesController", { observeBotMovements: () => { calls.push("mission-route"); } });
  Reflect.set(screen, "hexMapRenderer", {
    primeUnitMove: (_from: string, _to: string, options: MoveAnimationOptions) => {
      paths.push(options);
      calls.push("prime-movement");
      return { play: async () => { calls.push("play-movement"); }, dispose: () => { calls.push("dispose-movement"); } };
    },
    playAttackSequence: async (_from: string, _to: string, _hard: boolean, context: CombatPresentationContext) => { attacks.push(context); }
  });
  for (const method of ["renderEngineUnits", "logInitiativeBotActivationActivity", "refreshCampaignMissionStatusAfterTacticalAction"]) {
    Reflect.set(screen, method, () => {});
  }
  Reflect.set(screen, "waitForNextFrame", async () => {});
  const handler = Reflect.get(screen, "handleInitiativeBotActivation") as (event: InitiativeBotActivationResult) => Promise<void>;
  return { screen, calls, paths, attacks, play: (event) => handler.call(screen, event) };
}

function routeEvent(): InitiativeBotActivationResult {
  return {
    unitId: "secondary-tank", ownerId: "bot", unitType: "Medium_Tank", moved: true,
    fromHex: { q: 0, r: 0 }, toHex: { q: 2, r: 0 }, visibleBefore: true, visibleAfter: true,
    movementPath: [{ q: 0, r: 0 }, { q: 0, r: 1 }, { q: 1, r: 1 }, { q: 2, r: 0 }],
    attacks: [{ attackerUnitId: "secondary-tank", attackerType: "Medium_Tank", defenderUnitId: "primary-infantry", defenderType: "Infantry_42",
      fromHex: { q: 2, r: 0 }, targetHex: { q: 3, r: 0 }, inflictedDamage: 10, defenderDestroyed: false,
      retaliation: { damage: 3, attackerUnitId: "return-fire-tank", attackerType: "Medium_Tank" } }]
  };
}

/** Independently hold each existing playback boundary without advancing simulation. */
function deferredPlayback(): { promise: Promise<void>; release: () => void } {
  let release = (): void => {};
  const promise = new Promise<void>((resolve) => { release = resolve; });
  return { promise, release };
}

async function flushPlaybackContinuations(): Promise<void> {
  for (let pass = 0; pass < 12; pass += 1) await Promise.resolve();
}

for (const phase of ["enemy_activation", "enemy_response", "post_artillery_enemy_response", "round_handoff", "inactive", "movement_intro"] as const) {
  registerTest(`BATTLESCREEN_TUTORIAL_CAMERA_HOLD_PRESERVES_FULL_PLAYBACK_${phase.toUpperCase()}`, async () => {
    const tutorial = ensureTutorialState();
    tutorial.endTutorial();
    if (phase !== "inactive") {
      tutorial.startTutorial();
      tutorial.advancePhase(phase, false);
    }
    const probe = createPlaybackProbe();
    const move = deferredPlayback();
    const forward = deferredPlayback();
    const counterfire = deferredPlayback();
    const order: string[] = [];
    const focus: string[] = [];
    let attackIndex = 0;
    let completed = false;
    let playback: Promise<void> | null = null;
    Reflect.set(probe.screen, "battleAnimationMode", "regular");
    Reflect.set(probe.screen, "mapViewport", {});
    Reflect.set(probe.screen, "focusCameraOnHex", async (key: string) => { focus.push(key); });
    Reflect.set(probe.screen, "waitMs", async () => {});
    Reflect.set(probe.screen, "logInitiativeBotActivationActivity", () => { order.push("publish"); });
    Reflect.set(probe.screen, "hexMapRenderer", {
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
    });
    try {
      playback = probe.play(routeEvent()).then(() => { completed = true; });
      await flushPlaybackContinuations();
      assert.deepEqual(order, ["move-start"]);
      assert.equal(completed, false);
      move.release();
      await flushPlaybackContinuations();
      assert.deepEqual(order, ["move-start", "move-end", "move-dispose", "forward-start"]);
      assert.equal(completed, false, "The screen must still await the forward effect.");
      forward.release();
      await flushPlaybackContinuations();
      assert.deepEqual(order, ["move-start", "move-end", "move-dispose", "forward-start", "forward-end", "counterfire-start"]);
      assert.equal(completed, false, "The screen must still await the counterfire effect.");
      counterfire.release();
      await playback;
      assert.deepEqual(order, ["move-start", "move-end", "move-dispose", "forward-start", "forward-end", "counterfire-start", "counterfire-end", "publish"]);
      assert.equal(completed, true);
      const holdsCamera = phase !== "inactive" && phase !== "movement_intro";
      assert.deepEqual(focus, holdsCamera ? [] : ["0,0", "2,1", "3,1", "2,1"],
        "Every enemy tutorial handoff shares one camera policy; ordinary play keeps its authored focus sequence.");
      assert.equal(tutorial.getCurrentPhase(), phase, "Presentation cannot advance tutorial state.");
    } finally {
      move.release();
      forward.release();
      counterfire.release();
      await playback;
      tutorial.endTutorial();
    }
  });
}

registerTest("BATTLESCREEN_INITIATIVE_PRESENTATION_USES_COMMITTED_ROUTE_AND_ATTACKER", async () => {
  const probe = createPlaybackProbe();
  const event = routeEvent();
  const before = structuredClone(event);
  await probe.play(event);
  assert.deepEqual(probe.paths[0].path, ["0,0", "0,1", "1,1", "2,1"], "The rendered route must go around blocked axial 1,0 and convert every waypoint to offset coordinates.");
  assert.equal(probe.paths[0].unitId, "secondary-tank");
  assert.equal(probe.attacks[0].attacker.unitId, "secondary-tank");
  assert.equal(probe.attacks[0].attacker.unitType, "Medium_Tank");
  assert.equal(probe.attacks[0].attacker.unitClass, "tank");
  assert.equal(probe.attacks[0].defender?.unitId, "primary-infantry");
  assert.equal(probe.attacks[1].attacker.unitType, "Medium_Tank", "Counterfire may come from a secondary stacked defender, not the selected primary target.");
  assert.equal(probe.attacks[1].attacker.unitId, "return-fire-tank");
  assert.equal(probe.attacks[1].defender?.unitId, "secondary-tank");
  assert.deepEqual(event, before, "Animation cannot mutate the engine's committed event.");
  assert.ok(probe.calls.indexOf("mission-route") < probe.calls.indexOf("prime-movement"));
});

registerTest("BATTLESCREEN_INITIATIVE_PRESENTATION_RECORDS_ROUTE_BEFORE_DESTROYED_ACTOR_PLAYBACK", async () => {
  const probe = createPlaybackProbe();
  const event = { ...routeEvent(), unitType: "Recon_Bike", moved: false, toHex: null, attacks: [] };
  const playing = probe.play(event);
  assert.equal(probe.calls[0], "mission-route", "Mission transit truth must be observed before asynchronous effects, even when the mover was destroyed.");
  await playing;
  assert.deepEqual(probe.paths[0].path, ["0,0", "0,1", "1,1", "2,1"]);
});

registerTest("BATTLESCREEN_INITIATIVE_PRESENTATION_ACCEPTS_LEGACY_EVENT_WITHOUT_ROUTE", async () => {
  const probe = createPlaybackProbe();
  const event = { ...routeEvent(), movementPath: undefined };
  await probe.play(event);
  assert.deepEqual(probe.paths[0].path, ["0,0", "2,1"]);
  assert.equal(probe.calls.includes("mission-route"), false, "Endpoint compatibility is only for visuals, never invented mission transit evidence.");
});

registerTest("BATTLESCREEN_INITIATIVE_PRESENTATION_OBSERVES_CONVENTIONAL_ROUTE_BEFORE_MISSION_SCORE", async () => {
  const probe = createPlaybackProbe();
  const movement = { unitType: "Recon_Bike", path: routeEvent().movementPath };
  const calls: string[] = [];
  Reflect.set(probe.screen, "battleState", {
    hasEngine: () => true,
    ensureGameEngine: () => ({
      getTurnSummary: () => ({ turnNumber: 2 }), playerUnits: [], botUnits: [], allyUnits: [],
      peekBotTurnSummary: () => ({ moves: [movement] })
    })
  });
  Reflect.set(probe.screen, "missionRulesController", {
    observeBotMovements: (moves: unknown) => { assert.deepEqual(moves, [movement]); calls.push("observe"); },
    onTurnAdvanced: () => { calls.push("score"); return null; }
  });
  const score = Reflect.get(probe.screen, "calculateMissionStatusFromEngine") as () => unknown;
  score.call(probe.screen);
  assert.deepEqual(calls, ["observe", "score"]);
});

/** Remove authored pacing delays, without replacing the screen's sequencing or actor projection. */
async function withImmediatePresentationTimers(run: () => Promise<void>): Promise<void> {
  const hostTimeout = globalThis.setTimeout;
  const browserTimeout = window.setTimeout;
  const immediate = (handler: TimerHandler): number => {
    assert.equal(typeof handler, "function");
    (handler as () => void)();
    return 0;
  };
  globalThis.setTimeout = immediate as unknown as typeof globalThis.setTimeout;
  window.setTimeout = immediate as typeof window.setTimeout;
  try { await run(); }
  finally { globalThis.setTimeout = hostTimeout; window.setTimeout = browserTimeout; }
}

registerTest("BATTLESCREEN_CONVENTIONAL_PRESENTATION_KEEPS_RESOLVED_ACTOR_AND_SECONDARY_COUNTERFIRE", async () => {
  await withImmediatePresentationTimers(async () => {
    const probe = createPlaybackProbe();
    Reflect.set(probe.screen, "mapViewport", {});
    Reflect.set(probe.screen, "closeSelectionIntelForAnimation", () => {});
    Reflect.set(probe.screen, "focusCameraOnHex", async () => {});
    const renderer = Reflect.get(probe.screen, "hexMapRenderer") as object;
    Reflect.set(renderer, "markHexWrecked", () => {});
    const summary: BotTurnSummary = {
      moves: [], supplyReport: null,
      attacks: [{ attackerUnitId: "advanced-secondary", attackerType: "Medium_Tank", defenderUnitId: "destroyed-primary", defenderType: "Infantry_42",
        from: { q: 0, r: 0 }, target: { q: 1, r: 0 }, inflictedDamage: 100, defenderDestroyed: true,
        retaliation: { damage: 12, attackerUnitId: "secondary-battery", attackerType: "Howitzer_105", terrainDefense: 0, accuracyMod: 0, attackerStrengthAfter: 0 } }]
    };
    const before = structuredClone(summary);
    const play = Reflect.get(probe.screen, "playBotTurnAnimations") as (value: BotTurnSummary) => Promise<void>;
    await play.call(probe.screen, summary);
    assert.equal(probe.attacks.length, 2);
    assert.equal(probe.attacks[0].attacker.unitId, "advanced-secondary");
    assert.equal(probe.attacks[0].attacker.unitType, "Medium_Tank");
    assert.equal(probe.attacks[0].defender?.unitId, "destroyed-primary");
    assert.equal(probe.attacks[1].attacker.unitId, "secondary-battery");
    assert.equal(probe.attacks[1].attacker.unitType, "Howitzer_105");
    assert.equal(probe.attacks[1].defender?.unitId, "advanced-secondary");
    assert.deepEqual(summary, before);
  });
});

registerTest("BATTLESCREEN_PLAYER_PRESENTATION_USES_PREVIEW_AND_ACTUAL_STACKED_RETALIATOR", async () => {
  await withImmediatePresentationTimers(async () => {
    const probe = createPlaybackProbe();
    const order: string[] = [];
    for (const method of ["closeSelectionIntelForAnimation", "clearSelectedHexAfterAction", "announceBattleUpdate", "publishActivityEvent",
      "completeTutorialPhase", "completeInitiativeActivationAfterPlayerOrder", "buildPlayerAttackDetails"]) {
      Reflect.set(probe.screen, method, () => {});
    }
    Reflect.set(probe.screen, "focusCameraOnHex", async () => {});
    const renderer = Reflect.get(probe.screen, "hexMapRenderer") as object;
    for (const method of ["markHexDamaged", "markHexWrecked"]) { Reflect.set(renderer, method, () => {}); }
    const preview = {
      attacker: { unitId: "player-secondary-tank", type: "Medium_Tank", strength: 100 },
      defender: { unitId: "selected-infantry", type: "Infantry_42", strength: 100 }
    };
    const resolution = {
      result: { expectedDamage: 10 }, defenderRemainingStrength: 90, defenderDestroyed: false,
      retaliationOccurred: true, attackerRemainingStrength: 90, retaliationResult: { expectedDamage: 10 },
      targetRichDefenders: [
        { unitId: "selected-infantry", unitType: "Infantry_42", retaliationOccurred: false },
        { unitId: "actual-retaliating-battery", unitType: "Howitzer_105", retaliationOccurred: true }
      ]
    };
    Reflect.set(probe.screen, "battleState", {
      ensureGameEngine: () => ({ previewAttack: () => preview, attackUnit: () => {
        assert.equal(probe.attacks.length, 1, "Forward playback still completes before the existing player resolution boundary.");
        order.push("resolve");
        return resolution;
      } }),
      emitBattleUpdate: () => { order.push("published"); }
    });
    const play = Reflect.get(probe.screen, "executePendingAttack") as (from: Axial, to: Axial, unitId: string) => Promise<void>;
    await play.call(probe.screen, { q: 0, r: 0 }, { q: 1, r: 0 }, "player-secondary-tank");
    assert.deepEqual(order, ["resolve", "published"], "The player flow must finish successfully rather than hide a context error.");
    assert.equal(probe.attacks.length, 2);
    assert.equal(probe.attacks[0].attacker.unitId, "player-secondary-tank");
    assert.equal(probe.attacks[0].attacker.unitType, "Medium_Tank");
    assert.equal(probe.attacks[0].defender?.unitId, "selected-infantry");
    assert.equal(probe.attacks[1].attacker.unitId, "actual-retaliating-battery");
    assert.equal(probe.attacks[1].attacker.unitType, "Howitzer_105");
    assert.equal(probe.attacks[1].defender?.unitId, "player-secondary-tank");
  });
});
