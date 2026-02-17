import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import type { BotTurnSummary } from "../src/game/GameEngine";
import type { AttackResult } from "../src/core/Combat";
import type { Axial, ScenarioUnit } from "../src/core/types";

/**
 * Verifies that player attack flow awaits HexMapRenderer.playAttackSequence before applying combat resolution.
 * Also validates that hard/soft target selection is derived from the defender's unit class.
 */
registerTest("BATTLESCREEN_PLAYER_ATTACK_AWAITS_ANIMATION", async ({ Given, When, Then }) => {
  const originalSetTimeout = window.setTimeout;
  window.setTimeout = ((cb: unknown) => {
    (cb as () => void)();
    return 0 as any;
  }) as any;

  try {
  // Minimal DOM root required by BattleScreen constructor
  const root = document.createElement("div");
  root.id = "battleScreen";
  document.body.appendChild(root);

  // Track the order of operations across stubs
  let animationCalled = false;
  let hardTargetFlag: boolean | null = null;

  // Fake engine exposing only the methods/fields used by executePendingAttack() and renderEngineUnits()
  const fakeEngine = {
    playerUnits: [] as ScenarioUnit[],
    botUnits: [] as ScenarioUnit[],
    previewAttack(_a: Axial, _d: Axial) {
      const result: AttackResult = {
        accuracy: 60,
        shots: 4,
        damagePerHit: 5,
        expectedHits: 2,
        expectedDamage: 10,
        expectedSuppression: 0,
        effectiveAP: 2,
        facingArmor: 1,
        accuracyBreakdown: {
          baseRange: 60,
          experienceBonus: 0,
          commanderScalar: 1,
          baseWithCommander: 60,
          experienceWithCommander: 0,
          combinedAfterCommander: 60,
          terrainModifier: 0,
          terrainMultiplier: 1,
          afterTerrain: 60,
          spottedMultiplier: 1,
          finalPreClamp: 60,
          final: 60
        },
        damageBreakdown: {
          baseTableValue: 5,
          experienceScalar: 1,
          afterExperience: 5,
          commanderScalar: 1,
          final: 5
        }
      };
      return {
        attacker: {
          type: "Infantry_42" as unknown as ScenarioUnit["type"],
          hex: { q: 0, r: 0 },
          strength: 100,
          experience: 0,
          ammo: 6,
          fuel: 0,
          entrench: 0,
          facing: "N"
        } satisfies ScenarioUnit,
        defender: {
          // Infantry defender should be treated as a soft target (hardTargetFlag === false)
          type: "Infantry_42" as unknown as ScenarioUnit["type"],
          hex: { q: 0, r: 1 },
          strength: 100,
          experience: 0,
          ammo: 6,
          fuel: 0,
          entrench: 0,
          facing: "S"
        } satisfies ScenarioUnit,
        result
      };
    },
    attackUnit(_a: Axial, _d: Axial) {
      // Assert animation finished before combat resolution is applied
      if (!animationCalled) {
        throw new Error("Expected animation to complete before attackUnit was invoked");
      }
      return {
        result: {
          accuracy: 60,
          shots: 4,
          damagePerHit: 5,
          expectedHits: 2,
          expectedDamage: 10,
          expectedSuppression: 0,
          effectiveAP: 2,
          facingArmor: 1,
          accuracyBreakdown: {
            baseRange: 60,
            experienceBonus: 0,
            commanderScalar: 1,
            baseWithCommander: 60,
            experienceWithCommander: 0,
            combinedAfterCommander: 60,
            terrainModifier: 0,
            terrainMultiplier: 1,
            afterTerrain: 60,
            spottedMultiplier: 1,
            finalPreClamp: 60,
            final: 60
          },
          damageBreakdown: {
            baseTableValue: 5,
            experienceScalar: 1,
            afterExperience: 5,
            commanderScalar: 1,
            final: 5
          }
        } as AttackResult,
        defenderRemainingStrength: 90,
        defenderDestroyed: false,
        retaliationOccurred: false
      };
    }
  } as const;

  // Stub BattleState facade with the minimal API consumed by BattleScreen in this path
  const fakeBattleState = {
    hasEngine() {
      return true;
    },
    ensureGameEngine() {
      return fakeEngine as unknown as ReturnType<(typeof import("../src/state/BattleState"))['ensureBattleState']>["ensureGameEngine"];
    },
    emitBattleUpdate() {
    },
    getCurrentTurnSummary() {
      return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 } as const;
    },
    getIdlePlayerUnitKeys() {
      return [];
    }
  } as unknown as import("../src/state/BattleState").BattleState;

  // Renderer stub capturing the animation call and returning a resolvable promise
  const fakeRenderer = {
    async playAttackSequence(attKey: string, defKey: string, isHardTarget: boolean): Promise<void> {
      // Record the flag and mark as completed before resolving so subsequent code sees animation finished
      hardTargetFlag = isHardTarget;
      animationCalled = true;
    },
    markHexWrecked: () => {},
    markHexDamaged: () => {},
    advanceAftermathTurn: () => {},
    renderUnit: () => {},
    clearUnit: () => {},
    applyHexSelection: () => {}
  } as unknown as import("../src/rendering/HexMapRenderer").HexMapRenderer;

  let screen: BattleScreen;

  await Given("a BattleScreen instance with stubbed engine and renderer", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      null,
      null
    );
  });

  await When("executePendingAttack runs between two adjacent hexes", async () => {
    const attacker = { q: 0, r: 0 } as Axial;
    const defender = { q: 0, r: 1 } as Axial;
    await (screen as any).executePendingAttack(attacker, defender);
  });

  await Then("the animation completes before damage is applied and defender is treated as soft target", async () => {
    if (!animationCalled) {
      throw new Error("Expected playAttackSequence to be invoked");
    }
    if (hardTargetFlag !== false) {
      throw new Error(`Expected soft target (false), saw ${hardTargetFlag}`);
    }
  });
  } finally {
    window.setTimeout = originalSetTimeout;
  }
});

/**
 * Verifies that bot attack animation uses hard-target explosion choice for tank-class defenders
 * and awaits the effect before proceeding.
 */
registerTest("BATTLESCREEN_BOT_ATTACK_ANIMATION_HARD_TARGET", async ({ Given, When, Then }) => {
  // Minimal DOM root required by BattleScreen constructor
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  // Make timeouts run instantly so the sequence doesn't stall the test
  const originalSetTimeout = window.setTimeout;
  // @ts-expect-error – deliberately narrowing signature in test context
  window.setTimeout = (cb: Function) => {
    cb();
    return 0 as any;
  };

  let lastHardTargetFlag: boolean | null = null;
  let animationCount = 0;

  const fakeEngine = {
    playerUnits: [] as ScenarioUnit[],
    botUnits: [] as ScenarioUnit[]
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    getIdlePlayerUnitKeys: () => [],
    getCurrentTurnSummary: () => ({ phase: "botTurn", activeFaction: "Bot", turnNumber: 1 })
  } as unknown as import("../src/state/BattleState").BattleState;

  const fakeRenderer = {
    async playAttackSequence(_attKey: string, _defKey: string, isHardTarget: boolean): Promise<void> {
      lastHardTargetFlag = isHardTarget;
      animationCount += 1;
    },
    markHexWrecked: () => {},
    markHexDamaged: () => {},
    advanceAftermathTurn: () => {},
    renderUnit: () => {},
    clearUnit: () => {},
    applyHexSelection: () => {}
  } as unknown as import("../src/rendering/HexMapRenderer").HexMapRenderer;

  let screen: BattleScreen;

  await Given("a BattleScreen instance for bot animation test", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      {} as any,
      fakeRenderer,
      null,
      null,
      null,
      null,
      null
    );
  });

  const summary: BotTurnSummary = {
    moves: [],
    attacks: [
      {
        attackerType: "Infantry_42" as unknown as ScenarioUnit["type"],
        defenderType: "Panzer_IV" as unknown as ScenarioUnit["type"],
        from: { q: 0, r: 0 },
        target: { q: 0, r: 1 },
        inflictedDamage: 0,
        defenderDestroyed: false
      }
    ],
    supplyReport: null
  };

  await When("the bot attack sequence is played", async () => {
    await (screen as any).playBotTurnAnimations(summary);
  });

  await Then("the renderer receives a hard-target flag and an animation call", async () => {
    if (animationCount < 1) {
      throw new Error("Expected at least one bot attack animation to run");
    }
    if (lastHardTargetFlag !== true) {
      throw new Error(`Expected hard target (true) for tank-class defender, saw ${lastHardTargetFlag}`);
    }
  });

  // Restore timeout behavior for subsequent tests
  window.setTimeout = originalSetTimeout;
});
