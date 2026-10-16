import "./domEnvironment.js";
import assert from "node:assert/strict";
import { setTimeout as wait } from "node:timers/promises";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer.js";
import { SpriteSheetAnimator } from "../src/rendering/SpriteSheetAnimator.js";
import { ProceduralEffectsAnimator } from "../src/rendering/ProceduralEffects.js";
import { scheduleCombatEffect } from "../src/rendering/CombatEffectScheduling.js";
import type { UnitClass } from "../src/core/types.js";
import { registerTest } from "./harness.js";

/** Exercise real sequence orchestration while observing effect boundaries. */
async function withPresentationProbe(
  attackerType: string,
  attackerClass: UnitClass,
  test: (renderer: HexMapRenderer, errors: unknown[][]) => Promise<void>
): Promise<void> {
  const renderer = new HexMapRenderer();
  const originalTimeout = window.setTimeout;
  const originalError = console.error;
  const errors: unknown[][] = [];
  window.setTimeout = ((handler: TimerHandler) => originalTimeout(handler, 0)) as typeof window.setTimeout;
  console.error = (...args: unknown[]) => { errors.push(args); };
  // Only leaf effects are replaced. Branch selection, effect staggering, sound
  // delegation, and attack joins still execute the production renderer methods.
  Reflect.set(renderer, "getUnitClassAt", (key: string) => key === "0,0" ? attackerClass : "infantry");
  Reflect.set(renderer, "getUnitScenarioTypeAt", (key: string) => key === "0,0" ? attackerType : "Infantry_42");
  for (const method of ["playCombatAnimation", "playProjectileTracer", "playArcedProjectile", "playRecoilNudge",
    "playTargetMarker", "playHitShake", "playLegacySparkBurst", "playDustCloudLinger"]) {
    Reflect.set(renderer, method, async () => {});
  }
  Reflect.set(renderer, "soundManager", { playWeaponSound: async () => {} });
  try {
    await test(renderer, errors);
  } finally {
    // All delayed sibling effects get a turn before this fixture restores its
    // logging boundary, even when Promise.all rejected on the first failure.
    await wait(5);
    window.setTimeout = originalTimeout;
    console.error = originalError;
  }
}

registerTest("COMBAT_PRESENTATION_DELAYED_EFFECT_PRESERVES_DELAY_AND_BOTH_FAILURE_KINDS", async () => {
  const originalTimeout = window.setTimeout;
  const originalError = console.error;
  const scheduled: Array<{ delay: number | undefined; run: () => void }> = [];
  window.setTimeout = ((callback: TimerHandler, delay?: number) => {
    assert.equal(typeof callback, "function");
    scheduled.push({ delay, run: callback as () => void });
    return scheduled.length;
  }) as typeof window.setTimeout;
  console.error = () => {};
  try {
    let invoked = false;
    const success = scheduleCombatEffect(86, async () => { invoked = true; });
    assert.equal(invoked, false, "An effect must not run before its authored timer callback.");
    assert.equal(scheduled[0]!.delay, 86);
    scheduled[0]!.run();
    await success;
    assert.equal(invoked, true);
    for (const effect of [() => { throw new Error("sync effect failure"); }, async () => { throw new Error("async effect failure"); }]) {
      const failed = scheduleCombatEffect(24, effect);
      const rejection = assert.rejects(failed, /effect failure/);
      assert.doesNotThrow(() => scheduled[scheduled.length - 1]!.run(), "A timer callback must forward exceptions into its owning promise.");
      await rejection;
    }
  } finally {
    window.setTimeout = originalTimeout;
    console.error = originalError;
  }
});

const attackFamilies: ReadonlyArray<{ type: string; unitClass: UnitClass }> = [
  { type: "Infantry_42", unitClass: "infantry" },
  { type: "Medium_Tank", unitClass: "tank" },
  { type: "Howitzer", unitClass: "artillery" },
  { type: "Rocket_Artillery", unitClass: "artillery" },
  { type: "Fighter", unitClass: "air" },
  { type: "Bomber", unitClass: "air" }
];

for (const family of attackFamilies) {
  registerTest(`COMBAT_PRESENTATION_${family.type.toUpperCase()}_FAILURE_SETTLES_AND_NEXT_ATTACK_RECOVERS`, async () => {
    await withPresentationProbe(family.type, family.unitClass, async (renderer, errors) => {
      const unhandled: unknown[] = [];
      const onUnhandled = (reason: unknown): void => { unhandled.push(reason); };
      process.on("unhandledRejection", onUnhandled);
      try {
        Reflect.set(renderer, "playCombatAnimation", async () => { throw new Error("authored effect unavailable"); });
        await assert.rejects(Promise.race([
          renderer.playAttackSequence("0,0", "1,0", false),
          wait(1500).then(() => { throw new Error("combat presentation stayed pending"); })
        ]), /authored effect unavailable/, "The public attack must reject its effect failure instead of hanging.");
        assert.equal(unhandled.length, 0, "Early effects must already have rejection handlers before the impact wait finishes.");
        assert.ok(errors.some((args) => args.some((entry) => entry instanceof Error && entry.message === "authored effect unavailable")),
          "Presentation failure needs contextual diagnostics.");
        Reflect.set(renderer, "playCombatAnimation", async () => {});
        await renderer.playAttackSequence("0,0", "1,0", false);
        assert.equal(unhandled.length, 0, "The next accepted attack must complete after an effect failure.");
      } finally {
        process.off("unhandledRejection", onUnhandled);
      }
    });
  });
}

registerTest("COMBAT_PRESENTATION_AUDIO_FAILURE_SETTLES_MUZZLE_AND_PUBLIC_ATTACK", async () => {
  await withPresentationProbe("Medium_Tank", "tank", async (renderer) => {
    Reflect.set(renderer, "soundManager", { playWeaponSound: async () => { throw new Error("audio device failed"); } });
    await assert.rejects(renderer.playMuzzleFlash("0,0"), /audio device failed/);
    await assert.rejects(renderer.playAttackSequence("0,0", "1,0", false), /audio device failed/);
  });
});

registerTest("COMBAT_PRESENTATION_PENDING_AUDIO_NEVER_BLOCKS_SPRITE_OR_PROCEDURAL_EFFECTS", async () => {
  const renderer = new HexMapRenderer();
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const layer = document.createElementNS("http://www.w3.org/2000/svg", "g");
  svg.appendChild(layer);
  document.body.appendChild(svg);
  const originalSprite = SpriteSheetAnimator.prototype.playAnimation;
  const originalProcedural = ProceduralEffectsAnimator.prototype.playAnimation;
  const painted: string[] = [];
  Reflect.set(renderer, "combatEffectsLayer", layer);
  Reflect.set(renderer, "soundCatalogReady", new Promise<void>(() => {}));
  SpriteSheetAnimator.prototype.playAnimation = async function (effect: string): Promise<void> { painted.push(effect); };
  ProceduralEffectsAnimator.prototype.playAnimation = async function (effect: string): Promise<void> { painted.push(effect); };
  try {
    await Promise.race([
      Promise.all([
        renderer.playCombatAnimationAt("impactHits", 120, 80, 1, false),
        renderer.playCombatAnimationAt("explosionSmall", 160, 80, 1, false)
      ]),
      wait(150).then(() => { throw new Error("Visuals waited for unrelated sound preload."); })
    ]);
    assert.deepEqual(painted.sort(), ["explosionSmall", "impactHits"]);
  } finally {
    SpriteSheetAnimator.prototype.playAnimation = originalSprite;
    ProceduralEffectsAnimator.prototype.playAnimation = originalProcedural;
    svg.remove();
  }
});
