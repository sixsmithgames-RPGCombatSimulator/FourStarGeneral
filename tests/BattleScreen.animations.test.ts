import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import type { TestFn } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";
import type { AirEngagementEvent, AirMissionArrival, BotTurnSummary } from "../src/game/GameEngine";
import type { AttackResult } from "../src/core/Combat";
import type { Axial, ScenarioUnit } from "../src/core/types";
import type { AirShowPlaybackCallbacks, HexMapRenderer, ResolvedAirShowScene } from "../src/rendering/HexMapRenderer";

/** Fails healthy playback cases when BattleScreen catches a fixture error and continues. */
function requireCleanPlayback(spec: TestFn): TestFn {
  return async (context) => {
    const originalWarn = console.warn;
    const originalError = console.error;
    const diagnostics: string[] = [];
    console.warn = (...args: unknown[]): void => {
      diagnostics.push(args.map(String).join(" "));
      originalWarn(...args);
    };
    console.error = (...args: unknown[]): void => {
      diagnostics.push(args.map(String).join(" "));
      originalError(...args);
    };
    try {
      await spec(context);
      if (diagnostics.length > 0) {
        throw new Error(`Expected playback without warnings, errors, or recovery: ${diagnostics.join("\n")}`);
      }
    } finally {
      console.warn = originalWarn;
      console.error = originalError;
    }
  };
}

/** The real renderer boundary, including optional impact authorization. */
interface CapturedAirPlayback {
  readonly scene: ResolvedAirShowScene;
  readonly options: AirShowPlaybackCallbacks | undefined;
}

/** Records only actual renderer calls; legacy playback is always a fixture failure. */
function createOwnedAirRenderer(
  onPlayback: (call: CapturedAirPlayback) => Promise<void> = async () => {}
): {
  renderer: HexMapRenderer;
  calls: CapturedAirPlayback[];
  aftermath: string[];
  assertNoLegacyPlayback: () => void;
} {
  const calls: CapturedAirPlayback[] = [];
  const aftermath: string[] = [];
  const legacyCalls: string[] = [];
  const unexpected = (name: string) => async (): Promise<void> => {
    legacyCalls.push(name);
    throw new Error(`Expected resolved scene ownership, received ${name}.`);
  };
  const renderer = {
    async animateResolvedAirCombatShow(scene: ResolvedAirShowScene, options?: AirShowPlaybackCallbacks): Promise<void> {
      const call = { scene, options };
      calls.push(call);
      await onPlayback(call);
    },
    animateAircraftSortie: unexpected("animateAircraftSortie"),
    animateAircraftFlyover: unexpected("animateAircraftFlyover"),
    playFlakBurstAt: unexpected("playFlakBurstAt"),
    playExplosion: unexpected("playExplosion"),
    playDustCloud: unexpected("playDustCloud"),
    playDogfight: unexpected("playDogfight"),
    playAirDamageSmokeTrailAt: unexpected("playAirDamageSmokeTrailAt"),
    markHexDamaged: (hexKey: string) => { aftermath.push(`damaged:${hexKey}`); },
    markHexWrecked: (hexKey: string) => { aftermath.push(`wrecked:${hexKey}`); },
    advanceAftermathTurn: () => {},
    renderUnit: () => {},
    clearUnit: () => {},
    applyHexSelection: () => {},
    syncQueuedTargetMarkers: () => {}
  } satisfies Partial<HexMapRenderer>;
  return {
    // These tests exercise only the playback boundary, not a full SVG renderer.
    renderer: renderer as unknown as HexMapRenderer,
    calls,
    aftermath,
    assertNoLegacyPlayback: () => {
      if (legacyCalls.length > 0) {
        throw new Error(`Unexpected playback outside the owned scene: ${legacyCalls.join(", ")}.`);
      }
    }
  };
}

/**
 * Verifies that player attack flow awaits HexMapRenderer.playAttackSequence before applying combat resolution.
 * Also validates that hard/soft target selection is derived from the defender's unit class.
 */
registerTest("BATTLESCREEN_PLAYER_ATTACK_AWAITS_ANIMATION", requireCleanPlayback(async ({ Given, When, Then }) => {
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
  let battleUpdates = 0;
  const focusedHexes: string[] = [];

  // Fake engine exposing only the methods/fields used by executePendingAttack() and renderEngineUnits()
  const fakeEngine = {
    playerUnits: [] as ScenarioUnit[],
    botUnits: [] as ScenarioUnit[],
    getSupportSnapshot() {
      return { queued: [] };
    },
    getScheduledAirMissions() {
      return [];
    },
    getTurnSummary() {
      return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 } as const;
    },
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
          commanderScalar: 1,
          afterCommander: 60,
          experienceScalar: 1,
          afterExperience: 60,
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
          facing: "NW"
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
          facing: "SE"
        } satisfies ScenarioUnit,
        result,
        commander: { accBonus: 0, dmgBonus: 0 },
        damageMultiplier: 1,
        suppressionMultiplier: 1,
        finalDamagePerHit: 5,
        finalExpectedDamage: 10,
        finalExpectedSuppression: 0,
        expectedRetaliation: 0,
        retaliationPossible: false,
        retaliationNote: "No return fire expected."
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
            commanderScalar: 1,
            afterCommander: 60,
            experienceScalar: 1,
            afterExperience: 60,
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
    tryGetGameEngine() {
      return fakeEngine as unknown as ReturnType<(typeof import("../src/state/BattleState"))['ensureBattleState']>["ensureGameEngine"];
    },
    emitBattleUpdate() {
      battleUpdates += 1;
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
    async playAttackSequence(_attKey: string, _defKey: string, isHardTarget: boolean): Promise<void> {
      // Record the flag and mark as completed before resolving so subsequent code sees animation finished
      hardTargetFlag = isHardTarget;
      animationCalled = true;
    },
    syncQueuedTargetMarkers: () => {},
    markHexWrecked: () => {},
    markHexDamaged: () => {},
    advanceAftermathTurn: () => {},
    renderUnit: () => {},
    clearUnit: () => {},
    clearTacticalHighlights: () => {},
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
      {} as any,
      null
    );
    (screen as any).focusCameraOnHex = async (hexKey: string): Promise<void> => {
      focusedHexes.push(hexKey);
    };
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
    if (focusedHexes[0] !== "0,1") {
      throw new Error(`Expected player attack flow to focus defender hex 0,1 before animation, saw ${focusedHexes[0] ?? "nothing"}.`);
    }
    if (hardTargetFlag !== false) {
      throw new Error(`Expected soft target (false), saw ${hardTargetFlag}`);
    }
    if (battleUpdates !== 1) {
      throw new Error(`Expected the successful attack to publish one battle update, saw ${battleUpdates}.`);
    }
  });
  } finally {
    window.setTimeout = originalSetTimeout;
  }
}));

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
  const focusedHexes: string[] = [];

  const fakeEngine = {
    playerUnits: [] as ScenarioUnit[],
    botUnits: [] as ScenarioUnit[],
    getSupportSnapshot() {
      return { queued: [] };
    },
    getScheduledAirMissions() {
      return [];
    },
    getTurnSummary() {
      return { phase: "botTurn", activeFaction: "Bot", turnNumber: 1 } as const;
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine,
    getIdlePlayerUnitKeys: () => [],
    getCurrentTurnSummary: () => ({ phase: "botTurn", activeFaction: "Bot", turnNumber: 1 })
  } as unknown as import("../src/state/BattleState").BattleState;

  const fakeRenderer = {
    async playAttackSequence(_attKey: string, _defKey: string, isHardTarget: boolean): Promise<void> {
      lastHardTargetFlag = isHardTarget;
      animationCount += 1;
    },
    syncQueuedTargetMarkers: () => {},
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
      {} as any,
      null
    );
    (screen as any).focusCameraOnHex = async (hexKey: string): Promise<void> => {
      focusedHexes.push(hexKey);
    };
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

registerTest("BATTLESCREEN_SUPPORT_ARTILLERY_IMPACTS_WAIT_FOR_FOCUS_AND_USE_BARRAGE", async ({ Given, When, Then }) => {
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const originalSetTimeout = window.setTimeout;
  window.setTimeout = ((cb: unknown) => {
    (cb as () => void)();
    return 0 as any;
  }) as any;

  const callOrder: string[] = [];
  let explosionCalls = 0;
  let barrageCalls = 0;

  const fakeEngine = {
    botUnits: [
      {
        type: "Recon_Bike" as unknown as ScenarioUnit["type"],
        hex: { q: 8, r: 1 },
        strength: 78,
        experience: 0,
        ammo: 4,
        fuel: 30,
        entrench: 0,
        facing: "NW"
      }
    ] as ScenarioUnit[],
    getSupportSnapshot() {
      return { queued: [] };
    },
    getScheduledAirMissions() {
      return [];
    },
    getTurnSummary() {
      return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 } as const;
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  const fakeRenderer = {
    async playArtillerySupportImpact(): Promise<void> {
      callOrder.push("barrage");
      barrageCalls += 1;
    },
    async playExplosion(): Promise<void> {
      explosionCalls += 1;
    },
    markHexWrecked: () => {},
    markHexDamaged: () => {},
    advanceAftermathTurn: () => {},
    renderUnit: () => {},
    clearUnit: () => {},
    applyHexSelection: () => {},
    syncQueuedTargetMarkers: () => {}
  } as unknown as import("../src/rendering/HexMapRenderer").HexMapRenderer;

  let screen: BattleScreen;

  await Given("a battle screen with a queued support impact", async () => {
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
    (screen as any).freezeCamera = () => {};
    (screen as any).unfreezeCamera = () => {};
    (screen as any).renderEngineUnits = () => {};
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
  });

  await When("support artillery impacts are played", async () => {
    await (screen as any).playSupportImpacts([
      {
        assetId: "support-artillery-alpha",
        label: "Corps Artillery Group",
        targetHex: { q: 8, r: 1 },
        targetFaction: "Bot",
        hit: true,
        damage: 22,
        destroyed: false,
        targetUnitType: "Recon_Bike" as unknown as ScenarioUnit["type"]
      }
    ]);
  });

  await Then("the camera focuses before the barrage starts and the single-pop helper is not used", async () => {
    if (callOrder[0] !== "focus:8,5" || callOrder[1] !== "barrage") {
      throw new Error(`Expected support impact flow to focus hex 8,5 before barrage, saw ${callOrder.join(" -> ") || "nothing"}.`);
    }
    if (barrageCalls !== 1) {
      throw new Error(`Expected exactly one artillery barrage call, found ${barrageCalls}.`);
    }
    if (explosionCalls !== 0) {
      throw new Error(`Expected support artillery path to avoid playExplosion, found ${explosionCalls} call(s).`);
    }
  });

  window.setTimeout = originalSetTimeout;
});

registerTest("BATTLESCREEN_ATTACK_DIALOG_PRESERVES_ASSAULT_SELECTION", async ({ Given, When, Then }) => {
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  root.id = "battleScreen";
  root.innerHTML = `
    <div id="battleAttackConfirm" class="battle-dialog hidden" aria-hidden="true">
      <div class="battle-dialog__surface">
        <div class="attack-stance-selector">
          <label class="stance-label">Combat Stance:</label>
          <div class="stance-buttons">
            <button type="button" id="stanceFireAtWill" class="stance-button" data-stance="fireAtWill">
              <span class="stance-heading">
                <span class="stance-name">Fire at will</span>
                <span class="stance-state"></span>
              </span>
              <span class="stance-desc"></span>
              <span class="stance-note"></span>
            </button>
            <button type="button" id="stanceAssault" class="stance-button" data-stance="assault">
              <span class="stance-heading">
                <span class="stance-name">Assault</span>
                <span class="stance-state"></span>
              </span>
              <span class="stance-desc"></span>
              <span class="stance-note"></span>
            </button>
            <button type="button" id="stanceSuppressive" class="stance-button" data-stance="suppressive">
              <span class="stance-heading">
                <span class="stance-name">Suppressive</span>
                <span class="stance-state"></span>
              </span>
              <span class="stance-desc"></span>
              <span class="stance-note"></span>
            </button>
          </div>
        </div>
        <div id="battleAttackConfirmBody"></div>
        <button type="button" id="battleAttackConfirmAccept">Attack</button>
        <button type="button" id="battleAttackConfirmCancel">Cancel</button>
      </div>
    </div>
  `;
  if (!root.parentElement) {
    document.body.appendChild(root);
  }

  let lastRequestedStance: string | undefined;
  const fakeEngine = {
    getPlayerPlacementsSnapshot() {
      return [
        {
          type: "Infantry_42" as unknown as ScenarioUnit["type"],
          hex: { q: 0, r: 0 },
          strength: 100,
          experience: 0,
          ammo: 6,
          fuel: 0,
          entrench: 0,
          facing: "NW" as ScenarioUnit["facing"]
        }
      ];
    },
    getHexStackMembers() {
      return [
        {
          unitId: "u_inf_1",
          unit: {
            type: "Infantry_42" as unknown as ScenarioUnit["type"],
            hex: { q: 0, r: 0 },
            strength: 100,
            experience: 0,
            ammo: 6,
            fuel: 0,
            entrench: 0,
            facing: "NW" as ScenarioUnit["facing"]
          },
          faction: "Player"
        }
      ];
    },
    getUnitCommandState() {
      return {
        suppressionState: "clear",
        suppressorCount: 0
      };
    },
    getTurnSummary() {
      return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 } as const;
    },
    previewAttack(_a: Axial, _d: Axial, stance?: string) {
      lastRequestedStance = stance;
      const result: AttackResult = {
        accuracy: stance === "assault" ? 60 : 40,
        shots: 4,
        damagePerHit: 5,
        expectedHits: 2,
        expectedDamage: 10,
        expectedSuppression: 2,
        effectiveAP: 2,
        facingArmor: 1,
        accuracyBreakdown: {
          baseRange: stance === "assault" ? 60 : 40,
          commanderScalar: 1,
          afterCommander: stance === "assault" ? 60 : 40,
          experienceScalar: 1,
          afterExperience: stance === "assault" ? 60 : 40,
          terrainModifier: 0,
          terrainMultiplier: 1,
          afterTerrain: stance === "assault" ? 60 : 40,
          spottedMultiplier: 1,
          finalPreClamp: stance === "assault" ? 60 : 40,
          final: stance === "assault" ? 60 : 40
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
          facing: "NW" as ScenarioUnit["facing"]
        },
        defender: {
          type: "Infantry_42" as unknown as ScenarioUnit["type"],
          hex: { q: 0, r: 1 },
          strength: 100,
          experience: 0,
          ammo: 6,
          fuel: 0,
          entrench: 0,
          facing: "SE" as ScenarioUnit["facing"]
        },
        result,
        commander: { accBonus: 0, dmgBonus: 0 },
        damageMultiplier: 1,
        suppressionMultiplier: 1,
        finalDamagePerHit: 5,
        finalExpectedDamage: 10,
        finalExpectedSuppression: 2,
        expectedRetaliation: 4,
        retaliationPossible: true
      };
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine,
    getIdlePlayerUnitKeys: () => [],
    getCurrentTurnSummary: () => ({ phase: "playerTurn", activeFaction: "Player", turnNumber: 1 }),
    getPrecombatMissionInfo: () => null
  } as unknown as import("../src/state/BattleState").BattleState;

  let screen: BattleScreen;

  await Given("a battle screen with an infantry attacker in the confirm-attack dialog", async () => {
    screen = new BattleScreen(
      {} as any,
      fakeBattleState,
      { getActivePopup: () => null, closePopup: () => {} } as any,
      null,
      null,
      null,
      null,
      null,
      null
    );
    (screen as any).cacheElements();
    (screen as any).promptAttackConfirmation({ q: 0, r: 0 }, { q: 0, r: 1 });
  });

  await When("the commander switches to assault stance", async () => {
    const assaultBtn = document.getElementById("stanceAssault") as HTMLButtonElement | null;
    if (!assaultBtn || assaultBtn.disabled || typeof assaultBtn.onclick !== "function") {
      throw new Error("Expected an available, bound Assault control in the complete stance selector.");
    }
    assaultBtn.click();
  });

  await Then("the dialog keeps assault selected after the preview refresh", async () => {
    const assaultBtn = document.getElementById("stanceAssault");
    const suppressiveBtn = document.getElementById("stanceSuppressive");
    if (lastRequestedStance !== "assault") {
      throw new Error(`Expected refreshed preview to request assault stance, saw ${lastRequestedStance}`);
    }
    if (!assaultBtn?.classList.contains("stance-active")) {
      throw new Error("Expected assault button to remain visibly selected after refresh.");
    }
    if (suppressiveBtn?.classList.contains("stance-active")) {
      throw new Error("Expected suppressive button to clear its selected state after assault was chosen.");
    }
  });
});

registerTest("BATTLESCREEN_AIR_OPERATIONS_LINK_FLAK_TO_STRIKE_INGRESS", requireCleanPlayback(async ({ Given, When, Then }) => {
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
    const announcements: string[] = [];

    const fakeEngine = {
      playerUnits: [] as ScenarioUnit[],
      botUnits: [
        {
          type: "Medium_Tank" as unknown as ScenarioUnit["type"],
          hex: { q: 0, r: 0 },
          strength: 74,
          experience: 0,
          ammo: 4,
          fuel: 20,
          entrench: 0,
          facing: "NW" as ScenarioUnit["facing"]
        }
      ] as ScenarioUnit[],
      reserveUnits: [],
      allyUnits: [],
      getScheduledAirMissions() {
        return [
          {
            id: "air-1",
            targetHex: { q: 0, r: 0 },
            outcome: {
              type: "strike",
              result: "partial",
              defenderType: "Medium_Tank",
              defenderDestroyed: false,
              meta: {
                flakAttrition: 24,
                bomberAttrition: 0
              }
            }
          }
        ];
      },
      getTurnSummary() {
        return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 } as const;
      }
    } as const;

    const fakeBattleState = {
      hasEngine: () => true,
      ensureGameEngine: () => fakeEngine,
      tryGetGameEngine: () => fakeEngine
    } as unknown as import("../src/state/BattleState").BattleState;

    const playback = createOwnedAirRenderer(async ({ options }) => {
      callOrder.push("scene-start");
      if (playback.aftermath.length !== 0) {
        throw new Error("Strike aftermath must wait for the scene's impact callback.");
      }
      await options?.onImpact?.();
      callOrder.push("scene-end");
    });
    const fakeRenderer = playback.renderer;

    let screen: BattleScreen;

    await Given("a battle screen with a mission-linked flak strike", async () => {
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
      (screen as any).renderEngineUnits = () => {
        callOrder.push("render");
      };
      (screen as any).announceBattleUpdate = (message: string) => {
        announcements.push(message);
      };
    });

    const arrivals: AirMissionArrival[] = [
      {
        missionId: "air-1",
        faction: "Player",
        unitKey: "u_bomber",
        originHexKey: "1,0",
        unitType: "Bomber",
        kind: "strike",
        targetHex: { q: 0, r: 0 }
      }
    ];
    const engagements: AirEngagementEvent[] = [
      {
        type: "flak",
        missionId: "air-1",
        location: { q: 0, r: 0 },
        bomber: { faction: "Player", unitKey: "u_bomber", unitType: "Bomber" },
        interceptors: [
          { faction: "Bot", unitKey: "aa-1", unitType: "Flak_88", hex: { q: 0, r: 1 } },
          { faction: "Bot", unitKey: "aa-2", unitType: "Flak_88", hex: { q: 1, r: 1 } }
        ],
        escorts: [],
        flakDamage: 24,
        bomberStrengthBefore: 100,
        bomberStrengthAfter: 76,
        bomberDestroyed: false
      }
    ];

    await When("air operations are played", async () => {
      await (screen as any).playAirOperations(arrivals, engagements);
    });

    await Then("one scene owns linked ingress flak, the authorized impact, and surviving bomber egress", async () => {
      if (playback.calls.length !== 1) {
        throw new Error(`Expected one owned strike scene, saw ${playback.calls.length}.`);
      }
      const { scene, options } = playback.calls[0];
      const bomber = scene.bombers?.[0];
      if (scene.kind !== "airToAir" || scene.hexKey !== "0,0" || scene.bomberTargetHexKey !== "0,0"
        || scene.bombers?.length !== 1 || scene.bomber !== bomber
        || bomber?.id !== "u_bomber" || bomber.scenarioType !== "Bomber" || bomber.faction !== "Player"
        || bomber.role !== "bomber" || bomber.combatRole !== "strike"
        || bomber.originHexKey !== "1,0" || bomber.targetHexKey !== "0,0"
        || bomber.strengthBefore !== 100 || bomber.strengthAfterEscortPhase !== 100 || bomber.finalStrength !== 76) {
        throw new Error(`Expected the linked bomber's complete 100 -> 76 ingress/egress contract, saw ${JSON.stringify(scene)}.`);
      }
      const bursts = scene.flakBursts ?? [];
      if (bursts.length !== 2 || bursts[0].batteryHexKey !== "0,1" || bursts[1].batteryHexKey !== "1,1"
        || bursts.some((burst) => burst.bomberUnitKey !== "u_bomber" || burst.targetHexKey !== "0,0"
          || burst.count !== 1 || burst.progress < 0.28 || burst.progress > 0.36)
        || scene.interceptors.length !== 0 || scene.escorts.length !== 0) {
        throw new Error(`Expected two linked ground-battery sources during ingress, saw ${JSON.stringify(scene)}.`);
      }
      if (scene.strikeAborted !== false || options?.playImpactEffects !== true || typeof options.onImpact !== "function") {
        throw new Error("Expected the surviving bomber scene to authorize its impact effects and callback.");
      }
      if (JSON.stringify(callOrder) !== JSON.stringify(["focus:0,0", "scene-start", "render", "scene-end"])
        || JSON.stringify(playback.aftermath) !== JSON.stringify(["damaged:0,0"])) {
        throw new Error(`Expected focus before the scene and one callback-owned impact update, saw ${JSON.stringify({ callOrder, aftermath: playback.aftermath })}.`);
      }
      playback.assertNoLegacyPlayback();
      if (!announcements.includes("2 Flak batteries engaged Bomber on final approach. AA damage: 24%. Bomber strength now 76.")) {
        throw new Error(`Expected flak engagement announcement with damage totals, saw ${JSON.stringify(announcements)}.`);
      }
    });
  } finally {
    window.setTimeout = originalSetTimeout;
  }
}));

registerTest("BATTLESCREEN_AIR_OPERATIONS_STOP_DESTROYED_BOMBER_BEFORE_TARGET", requireCleanPlayback(async ({ Given, When, Then }) => {
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
      playerUnits: [] as ScenarioUnit[],
      botUnits: [] as ScenarioUnit[],
      reserveUnits: [],
      allyUnits: [],
      getScheduledAirMissions() {
        return [
          {
            id: "air-2",
            targetHex: { q: 0, r: 0 },
            outcome: {
              type: "strike",
              result: "aborted",
              meta: {
                flakAttrition: 100,
                bomberAttrition: 0
              }
            }
          }
        ];
      },
      getTurnSummary() {
        return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 } as const;
      }
    } as const;

    const fakeBattleState = {
      hasEngine: () => true,
      ensureGameEngine: () => fakeEngine,
      tryGetGameEngine: () => fakeEngine
    } as unknown as import("../src/state/BattleState").BattleState;

    const playback = createOwnedAirRenderer(async () => { callOrder.push("scene"); });
    const fakeRenderer = playback.renderer;

    let screen: BattleScreen;

    await Given("a mission-linked flak event that destroys the bomber", async () => {
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
      (screen as any).announceBattleUpdate = () => {};
      (screen as any).waitForNextFrame = async (): Promise<void> => {};
    });

    const arrivals: AirMissionArrival[] = [
      {
        missionId: "air-2",
        faction: "Player",
        unitKey: "u_bomber",
        originHexKey: "1,0",
        unitType: "Bomber",
        kind: "strike",
        targetHex: { q: 0, r: 0 }
      }
    ];
    const engagements: AirEngagementEvent[] = [
      {
        type: "flak",
        missionId: "air-2",
        location: { q: 0, r: 0 },
        bomber: { faction: "Player", unitKey: "u_bomber", unitType: "Bomber" },
        interceptors: [
          { faction: "Bot", unitKey: "aa-1", unitType: "Flak_88", hex: { q: 0, r: 1 } }
        ],
        escorts: [],
        flakDamage: 100,
        bomberStrengthBefore: 100,
        bomberStrengthAfter: 0,
        bomberDestroyed: true
      }
    ];

    await When("the linked air operation plays", async () => {
      await (screen as any).playAirOperations(arrivals, engagements);
    });

    await Then("the bomber stops short of the target and no strike impact or return leg is played", async () => {
      if (playback.calls.length !== 1 || JSON.stringify(callOrder) !== JSON.stringify(["focus:0,0", "scene"])) {
        throw new Error(`Expected focus and one aborted scene, saw ${JSON.stringify(callOrder)}.`);
      }
      const { scene, options } = playback.calls[0];
      const bomber = scene.bombers?.[0];
      if (scene.bombers?.length !== 1 || scene.bomber !== bomber || bomber?.id !== "u_bomber"
        || bomber.originHexKey !== "1,0" || bomber.targetHexKey !== "0,0"
        || bomber.strengthBefore !== 100 || bomber.strengthAfterEscortPhase !== 100 || bomber.finalStrength !== 0
        || scene.strikeAborted !== true || options?.onImpact !== undefined || options?.playImpactEffects !== true) {
        throw new Error(`Expected an aborted 100 -> 0 bomber scene with no impact callback or surviving return strength, saw ${JSON.stringify(scene)}.`);
      }
      const bursts = scene.flakBursts ?? [];
      if (bursts.length !== 1 || bursts[0].batteryHexKey !== "0,1" || bursts[0].bomberUnitKey !== "u_bomber"
        || bursts[0].targetHexKey !== "0,0" || bursts[0].count !== 1
        || bursts[0].progress < 0.28 || bursts[0].progress > 0.36) {
        throw new Error(`Expected the lethal battery to remain linked to bomber ingress, saw ${JSON.stringify(bursts)}.`);
      }
      if (playback.aftermath.length !== 0) {
        throw new Error(`Did not expect target aftermath for a destroyed bomber, saw ${JSON.stringify(playback.aftermath)}.`);
      }
      playback.assertNoLegacyPlayback();
    });
  } finally {
    window.setTimeout = originalSetTimeout;
  }
}));

registerTest("BATTLESCREEN_AIR_OPERATIONS_LAUNCH_LINKED_STRIKES_IN_PARALLEL", requireCleanPlayback(async ({ Given, When, Then }) => {
  const originalSetTimeout = window.setTimeout;
  window.setTimeout = ((cb: unknown) => {
    (cb as () => void)();
    return 0 as any;
  }) as any;

  let releaseFlights!: () => void;
  let playback: Promise<void> | null = null;
  try {
    const root = document.getElementById("battleScreen") ?? document.createElement("div");
    if (!root.parentElement) {
      root.id = "battleScreen";
      document.body.appendChild(root);
    }

    let signalSceneStarted!: () => void;
    const sceneStarted = new Promise<void>((resolve) => { signalSceneStarted = resolve; });
    let playbackCompleted = false;
    const flightsReleased = new Promise<void>((resolve) => {
      releaseFlights = resolve;
    });

    const fakeEngine = {
      playerUnits: [] as ScenarioUnit[],
      botUnits: [] as ScenarioUnit[],
      reserveUnits: [],
      allyUnits: [],
      getScheduledAirMissions() {
        return [];
      },
      getTurnSummary() {
        return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 } as const;
      }
    } as const;

    const fakeBattleState = {
      hasEngine: () => true,
      ensureGameEngine: () => fakeEngine,
      tryGetGameEngine: () => fakeEngine
    } as unknown as import("../src/state/BattleState").BattleState;

    const ownedRenderer = createOwnedAirRenderer(async () => {
      signalSceneStarted();
      await flightsReleased;
    });
    const fakeRenderer = ownedRenderer.renderer;

    let screen: BattleScreen;

    await Given("two strike missions resolve with linked flak events", async () => {
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
      (screen as any).focusCameraOnHex = async (): Promise<void> => {};
      (screen as any).waitForNextFrame = async (): Promise<void> => {};
      (screen as any).announceBattleUpdate = () => {};
      (screen as any).publishActivityEvent = () => {};
      (screen as any).renderEngineUnits = () => {};
      (screen as any).collectAirMissionFlights = async () => [
        {
          missionId: "strike-1",
          faction: "Bot",
          kind: "strike",
          unitKey: "b1",
          originKey: "0,10",
          destKey: "12,-6",
          unitType: "Bomber",
          strength: 100,
          laneOffsetPx: -9
        },
        {
          missionId: "strike-2",
          faction: "Bot",
          kind: "strike",
          unitKey: "b2",
          originKey: "1,10",
          destKey: "13,-6",
          unitType: "Bomber",
          strength: 100,
          laneOffsetPx: 9
        }
      ];
    });

    const arrivals: AirMissionArrival[] = [];
    const engagements: AirEngagementEvent[] = [
      {
        type: "flak",
        missionId: "strike-1",
        location: { q: 12, r: -6 },
        bomber: { faction: "Bot", unitKey: "b1", unitType: "Bomber", strength: 100 },
        interceptors: [{ faction: "Player", unitKey: "aa-1", unitType: "Flak_88", strength: 100, hex: { q: 11, r: -5 } }],
        escorts: [],
        flakDamage: 0,
        bomberStrengthBefore: 100,
        bomberStrengthAfter: 100,
        bomberDestroyed: false
      },
      {
        type: "flak",
        missionId: "strike-2",
        location: { q: 13, r: -6 },
        bomber: { faction: "Bot", unitKey: "b2", unitType: "Bomber", strength: 100 },
        interceptors: [{ faction: "Player", unitKey: "aa-2", unitType: "Flak_88", strength: 100, hex: { q: 12, r: -5 } }],
        escorts: [],
        flakDamage: 0,
        bomberStrengthBefore: 100,
        bomberStrengthAfter: 100,
        bomberDestroyed: false
      }
    ];

    await When("the combined air-operations sequence begins", async () => {
      playback = (screen as any).playAirOperations(arrivals, engagements) as Promise<void>;
      playback = playback.then(() => { playbackCompleted = true; });
      // Observe the renderer boundary or early completion, without guessing how many microtasks preparation takes.
      await Promise.race([sceneStarted, playback]);
    });

    await Then("both strike packages should start before the first one finishes", async () => {
      if (ownedRenderer.calls.length !== 1 || playbackCompleted) {
        throw new Error(`Expected one still-running coordinated scene, saw ${ownedRenderer.calls.length} calls; completed=${playbackCompleted}.`);
      }
      const { scene, options } = ownedRenderer.calls[0];
      const bombers = scene.bombers ?? [];
      // The timing policy gives both bombers the same 360ms lead within this one scene.
      if (bombers.length !== 2 || scene.bomber !== bombers[0] || scene.bomberArrivalDelayMs !== 360
        || bombers[0].id !== "b1" || bombers[0].originHexKey !== "0,10" || bombers[0].targetHexKey !== "12,-6" || bombers[0].laneOffsetPx !== -9
        || bombers[1].id !== "b2" || bombers[1].originHexKey !== "1,10" || bombers[1].targetHexKey !== "13,-6" || bombers[1].laneOffsetPx !== 9
        || bombers.some((bomber) => bomber.faction !== "Bot" || bomber.role !== "bomber" || bomber.combatRole !== "strike"
          || bomber.strengthBefore !== 100 || bomber.strengthAfterEscortPhase !== 100 || bomber.finalStrength !== 100)) {
        throw new Error(`Expected both intact bomber packages, targets, and distinct lanes in the same running scene, saw ${JSON.stringify(scene)}.`);
      }
      const bursts = scene.flakBursts ?? [];
      if (bursts.length !== 2
        || bursts[0].bomberUnitKey !== "b1" || bursts[0].batteryHexKey !== "11,-5" || bursts[0].targetHexKey !== "12,-6"
        || bursts[1].bomberUnitKey !== "b2" || bursts[1].batteryHexKey !== "12,-5" || bursts[1].targetHexKey !== "13,-6"
        || bursts.some((burst) => burst.count !== 1 || burst.progress < 0.28 || burst.progress > 0.36)
        || scene.interceptors.length !== 0 || scene.escorts.length !== 0 || options !== undefined) {
        throw new Error(`Expected independently linked flak in a renderer-owned coordinated show, saw ${JSON.stringify(scene)}.`);
      }
      releaseFlights();
      await playback;
      if (!playbackCompleted || ownedRenderer.calls.length !== 1 || ownedRenderer.aftermath.length !== 0) {
        throw new Error("Expected releasing the one scene to finish both strikes without replaying separate operations or impacts.");
      }
      ownedRenderer.assertNoLegacyPlayback();
    });
  } finally {
    releaseFlights?.();
    await playback;
    window.setTimeout = originalSetTimeout;
  }
}));

registerTest("BATTLESCREEN_STRIKE_USES_CONTINUOUS_SORTIE_WHEN_RENDERER_SUPPORTS_IT", requireCleanPlayback(async ({ Given, When, Then }) => {
  const root = document.getElementById("battleScreen") ?? document.createElement("div");
  if (!root.parentElement) {
    root.id = "battleScreen";
    document.body.appendChild(root);
  }

  const callOrder: string[] = [];
  const fakeEngine = {
    playerUnits: [] as ScenarioUnit[],
    botUnits: [
      {
        type: "Medium_Tank" as unknown as ScenarioUnit["type"],
        hex: { q: 0, r: 0 },
        strength: 74,
        experience: 0,
        ammo: 4,
        fuel: 20,
        entrench: 0,
        facing: "NW" as ScenarioUnit["facing"]
      }
    ] as ScenarioUnit[],
    reserveUnits: [],
    allyUnits: [],
    getScheduledAirMissions() {
      return [
        {
          id: "sortie-1",
          targetHex: { q: 0, r: 0 },
          outcome: {
            type: "strike",
            result: "partial",
            defenderType: "Medium_Tank",
            defenderDestroyed: false,
            meta: {
              flakAttrition: 0,
              bomberAttrition: 0
            }
          }
        }
      ];
    },
    getTurnSummary() {
      return { phase: "playerTurn", activeFaction: "Player", turnNumber: 1 } as const;
    }
  } as const;

  const fakeBattleState = {
    hasEngine: () => true,
    ensureGameEngine: () => fakeEngine,
    tryGetGameEngine: () => fakeEngine
  } as unknown as import("../src/state/BattleState").BattleState;

  const playback = createOwnedAirRenderer(async ({ options }) => {
    callOrder.push("scene-start");
    if (playback.aftermath.length !== 0) {
      throw new Error("Expected the scene to own the first strike impact.");
    }
    await options?.onImpact?.();
    callOrder.push("scene-end");
  });
  const fakeRenderer = playback.renderer;

  let screen: BattleScreen;

  await Given("a battle screen with renderer support for continuous sorties", async () => {
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
    (screen as any).focusCameraOnHex = async (): Promise<void> => {};
    (screen as any).waitForNextFrame = async (): Promise<void> => {};
    (screen as any).announceBattleUpdate = () => {};
    (screen as any).publishActivityEvent = () => {};
    (screen as any).renderEngineUnits = () => { callOrder.push("render"); };
  });

  await When("a strike mission plays", async () => {
    await (screen as any).playMissionStrikeOperation(
      {
        missionId: "sortie-1",
        faction: "Player",
        kind: "strike",
        unitKey: "u_bomber",
        originKey: "1,0",
        destKey: "0,0",
        unitType: "Bomber",
        strength: 100,
        laneOffsetPx: 0
      },
      [],
      [],
      fakeRenderer,
      fakeEngine,
      true
    );
  });

  await Then("one continuous scene owns ingress, the impact callback, and egress", async () => {
    if (playback.calls.length !== 1) {
      throw new Error(`Expected one continuous resolved scene, saw ${playback.calls.length}.`);
    }
    const { scene, options } = playback.calls[0];
    const bomber = scene.bombers?.[0];
    if (scene.kind !== "airToAir" || scene.hexKey !== "0,0" || scene.bomberTargetHexKey !== "0,0"
      || scene.bombers?.length !== 1 || scene.bomber !== bomber
      || bomber?.id !== "u_bomber" || bomber.scenarioType !== "Bomber" || bomber.faction !== "Player"
      || bomber.role !== "bomber" || bomber.combatRole !== "strike" || bomber.laneOffsetPx !== 0
      || bomber.originHexKey !== "1,0" || bomber.targetHexKey !== "0,0"
      || bomber.strengthBefore !== 100 || bomber.strengthAfterEscortPhase !== 100 || bomber.finalStrength !== 100
      || scene.strikeAborted !== false || scene.flakBursts?.length !== 0
      || scene.interceptors.length !== 0 || scene.escorts.length !== 0) {
      throw new Error(`Expected one intact bomber's complete continuous sortie contract, saw ${JSON.stringify(scene)}.`);
    }
    if (options?.playImpactEffects !== true || typeof options.onImpact !== "function"
      || JSON.stringify(callOrder) !== JSON.stringify(["scene-start", "render", "scene-end"])
      || JSON.stringify(playback.aftermath) !== JSON.stringify(["damaged:0,0"])) {
      throw new Error(`Expected exactly one impact update inside the owned scene and no duplicated visual effects, saw ${JSON.stringify({ callOrder, aftermath: playback.aftermath })}.`);
    }
    playback.assertNoLegacyPlayback();
  });
}));

registerTest("BATTLESCREEN_INITIATIVE_BOT_RETALIATION_WAITS_FOR_FOCUS_PACING", async ({ Given, When, Then }) => {
  let screen: BattleScreen;
  const focusCalls: string[] = [];
  const sequenceCalls: string[] = [];
  const waitDurations: number[] = [];

  await Given("an initiative bot activation that includes retaliation", async () => {
    screen = Object.create(BattleScreen.prototype) as BattleScreen;
    (screen as any).isInitiativeSystemEnabled = true;
    (screen as any).battleAnimationMode = "regular";
    (screen as any).mapViewport = {};
    (screen as any).hexMapRenderer = {
      playAttackSequence: async (attackerHexKey: string, defenderHexKey: string, isHardTarget: boolean): Promise<void> => {
        sequenceCalls.push(`${attackerHexKey}->${defenderHexKey}:${isHardTarget ? "hard" : "soft"}`);
      }
    };
    (screen as any).unitTypes = {
      Infantry_42: { class: "infantry" },
      Panzer_IV: { class: "tank" }
    };
    (screen as any).toOffsetHexKey = (hex: { q: number; r: number } | null) => (hex ? `${hex.q},${hex.r}` : null);
    (screen as any).isBotUnitVisibleToPlayer = () => false;
    (screen as any).waitForNextFrame = async (): Promise<void> => {};
    (screen as any).waitMs = async (durationMs: number): Promise<void> => {
      waitDurations.push(durationMs);
    };
    (screen as any).focusCameraOnHex = async (hexKey: string): Promise<void> => {
      focusCalls.push(hexKey);
    };
    (screen as any).renderEngineUnits = () => {};
    (screen as any).logInitiativeBotActivationActivity = () => {};
    (screen as any).toMovePathKeys = () => [];
    (screen as any).resolveMoveAnimationDuration = () => 0;
  });

  await When("the activation animation pipeline runs", async () => {
    await (screen as any).handleInitiativeBotActivation({
      unitId: "u_bot_1",
      ownerId: "bot",
      unitType: "Infantry_42",
      moved: false,
      fromHex: { q: 4, r: 4 },
      toHex: { q: 4, r: 4 },
      visibleBefore: false,
      visibleAfter: false,
      attacks: [
        {
          attackerType: "Infantry_42",
          defenderType: "Panzer_IV",
          fromHex: { q: 4, r: 4 },
          targetHex: { q: 4, r: 5 },
          inflictedDamage: 9,
          defenderDestroyed: false,
          retaliation: {
            damage: 6,
            attackerStrengthAfter: 84
          }
        }
      ]
    });
  });

  await Then("camera focus and pacing include a retaliation beat before completion", async () => {
    const expectedFocus = ["4,4", "4,5", "4,4"];
    if (focusCalls.length !== expectedFocus.length || focusCalls.some((value, index) => value !== expectedFocus[index])) {
      throw new Error(`Expected focus order ${JSON.stringify(expectedFocus)}, received ${JSON.stringify(focusCalls)}.`);
    }

    const expectedSequences = ["4,4->4,5:hard", "4,5->4,4:soft"];
    if (
      sequenceCalls.length !== expectedSequences.length ||
      sequenceCalls.some((value, index) => value !== expectedSequences[index])
    ) {
      throw new Error(`Expected attack sequence order ${JSON.stringify(expectedSequences)}, received ${JSON.stringify(sequenceCalls)}.`);
    }

    const hasTargetSettlePause = waitDurations.includes(240);
    const retaliationPauseCount = waitDurations.filter((duration) => duration === 220).length;
    if (!hasTargetSettlePause || retaliationPauseCount < 2) {
      throw new Error(
        `Expected pacing waits to include target settle (240ms) and retaliation beats (>=2x220ms), received ${JSON.stringify(waitDurations)}.`
      );
    }
  });
});
