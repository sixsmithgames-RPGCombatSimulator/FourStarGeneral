import "./domEnvironment.js";
import assert from "node:assert/strict";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer.js";
import type { CombatPresentationContext } from "../src/rendering/CombatPresentationContext.js";
import type { QueuedWeaponSoundRequest } from "../src/audio/CombatSoundManager.js";
import type { UnitClass } from "../src/core/types.js";
import { registerTest } from "./harness.js";

/** Observe real branch/profile selection without waiting for painted leaf animations. */
async function withIdentityProbe(test: (probe: {
  renderer: HexMapRenderer;
  effects: Array<{ type: string; hex: string }>;
  sounds: QueuedWeaponSoundRequest[];
  arcs: string[];
  classes: Map<string, UnitClass>;
  types: Map<string, string>;
}) => Promise<void>): Promise<void> {
  const renderer = new HexMapRenderer();
  const effects: Array<{ type: string; hex: string }> = [];
  const sounds: QueuedWeaponSoundRequest[] = [];
  const arcs: string[] = [];
  const classes = new Map<string, UnitClass>([["0,0", "infantry"], ["2,0", "tank"]]);
  const types = new Map([["0,0", "Infantry_42"], ["2,0", "Medium_Tank"]]);
  Reflect.set(renderer, "hexUnitClassMap", classes);
  Reflect.set(renderer, "hexUnitScenarioTypeMap", types);
  Reflect.set(renderer, "playCombatAnimation", async (type: string, hex: string) => { effects.push({ type, hex }); });
  Reflect.set(renderer, "playArcedProjectile", async (hex: string) => { arcs.push(hex); });
  for (const method of ["playProjectileTracer", "playRecoilNudge", "playTargetMarker", "playHitShake", "playLegacySparkBurst", "playDustCloudLinger"]) {
    Reflect.set(renderer, method, async () => {});
  }
  Reflect.set(renderer, "soundManager", { playWeaponSound: async (request: QueuedWeaponSoundRequest) => { sounds.push(request); } });
  const originalTimeout = window.setTimeout;
  window.setTimeout = ((handler: TimerHandler) => originalTimeout(handler, 0)) as typeof window.setTimeout;
  try { await test({ renderer, effects, sounds, arcs, classes, types }); }
  finally { window.setTimeout = originalTimeout; }
}

registerTest("COMBAT_PRESENTATION_SECONDARY_STACK_ACTOR_OWNS_MUZZLE_IMPACT_AND_SOUND", async () => {
  await withIdentityProbe(async ({ renderer, effects, sounds, classes, types }) => {
    const presentation: CombatPresentationContext = {
      attacker: { unitId: "secondary-tank", unitType: "Medium_Tank" },
      defender: { unitType: "Medium_Tank" }
    };
    await renderer.playAttackSequence("0,0", "2,0", true, presentation);
    assert.ok(effects.some((effect) => effect.type === "cannon_muzzle" && effect.hex === "0,0"));
    assert.ok(effects.some((effect) => effect.type === "cannon" && effect.hex === "2,0"), "The secondary tank must use the cannon impact profile, not the lead infantry profile.");
    assert.ok(sounds.some((sound) => sound.weaponClass === "tank_75mm" && sound.playbackMode === "transient_only"));
    assert.equal(sounds.some((sound) => sound.weaponClass === "small_arms"), false);
    assert.equal(classes.get("0,0"), "infantry");
    assert.equal(types.get("0,0"), "Infantry_42", "Presentation must never overwrite the hex's current lead-unit cache.");
  });
});

registerTest("COMBAT_PRESENTATION_ABSENT_ATTACKER_RETAINS_AUTHORED_WEAPON_PROFILE", async () => {
  await withIdentityProbe(async ({ renderer, effects, sounds, arcs, classes, types }) => {
    classes.delete("0,0");
    types.delete("0,0");
    await renderer.playAttackSequence("0,0", "2,0", true, {
      attacker: { unitId: "removed-battery", unitType: "Howitzer_105" },
      defender: { unitType: "Medium_Tank" }
    });
    assert.deepEqual(arcs, ["0,0"], "A removed or advanced artillery actor still owns its resolved shell trajectory.");
    assert.ok(effects.some((effect) => effect.type === "cannon_muzzle"));
    assert.ok(sounds.some((sound) => sound.weaponClass === "cannon" && sound.playbackMode === "transient_only"));
    assert.equal(types.has("0,0"), false);
  });
});

registerTest("COMBAT_PRESENTATION_CONCURRENT_CONTEXTS_NEVER_REPLACE_HEX_IDENTITY", async () => {
  await withIdentityProbe(async ({ renderer, effects, sounds, types }) => {
    await Promise.all([
      renderer.playAttackSequence("0,0", "2,0", true, { attacker: { unitId: "tank", unitType: "Medium_Tank" } }),
      renderer.playAttackSequence("0,0", "3,0", false, { attacker: { unitId: "infantry", unitType: "Infantry_42" } })
    ]);
    assert.ok(sounds.some((sound) => sound.weaponClass === "tank_75mm"));
    assert.ok(sounds.some((sound) => sound.weaponClass === "small_arms"));
    assert.ok(effects.some((effect) => effect.hex === "2,0" && effect.type === "cannon"));
    assert.equal(effects.some((effect) => effect.hex === "3,0" && effect.type === "cannon"), false);
    assert.equal(types.get("0,0"), "Infantry_42");
  });
});

registerTest("COMBAT_PRESENTATION_FACING_AND_RECOIL_TOUCH_ONLY_THE_RESOLVED_STACK_ACTOR", async () => {
  const renderer = new HexMapRenderer();
  const svgNamespace = "http://www.w3.org/2000/svg";
  const stack = document.createElementNS(svgNamespace, "g");
  const lead = document.createElementNS(svgNamespace, "g");
  const secondary = document.createElementNS(svgNamespace, "g");
  for (const [group, id] of [[lead, "lead"], [secondary, "secondary"]] as const) {
    group.classList.add("unit-stack-formation");
    group.dataset.unitId = id;
    stack.appendChild(group);
  }
  const source = document.createElementNS(svgNamespace, "g");
  const target = document.createElementNS(svgNamespace, "g");
  Reflect.set(renderer, "hexUnitImageMap", new Map([["0,0", stack]]));
  Reflect.set(renderer, "hexElementMap", new Map([["0,0", source], ["2,0", target]]));
  Reflect.set(renderer, "extractHexCenter", (cell: SVGGElement) => ({ cx: cell === source ? 0 : 100, cy: 0 }));
  const faced: SVGGElement[] = [];
  Reflect.set(renderer, "applyFacingAngleToGroup", (group: SVGGElement) => { faced.push(group); });
  const actor = { unitId: "secondary", unitType: "Medium_Tank" };
  const face = Reflect.get(renderer, "setHexFacingAngle") as (key: string, x: number, y: number, angle: number, sourceActor: typeof actor) => void;
  const recoil = Reflect.get(renderer, "playRecoilNudge") as (from: string, to: string, magnitude: number, sourceActor: typeof actor) => Promise<void>;
  const shake = Reflect.get(renderer, "playHitShake") as (key: string, magnitude: number, sourceActor: typeof actor) => Promise<void>;
  face.call(renderer, "0,0", 0, 0, 180, actor);
  const recoilDone = recoil.call(renderer, "0,0", "2,0", 5, actor);
  assert.deepEqual(faced, [secondary]);
  assert.match(secondary.style.transform, /translate/);
  assert.equal(lead.style.transform, "");
  assert.equal(stack.style.transform, "");
  await recoilDone;
  faced.length = 0;
  secondary.remove();
  face.call(renderer, "0,0", 0, 0, 180, actor);
  await recoil.call(renderer, "0,0", "2,0", 5, actor);
  await shake.call(renderer, "0,0", 5, actor);
  assert.deepEqual(faced, [], "An attacker that advanced or died must not make its surviving stack mate face/fire instead.");
  assert.equal(lead.style.transform, "");
});

registerTest("COMBAT_PRESENTATION_MISSING_MOVEMENT_ACTOR_NEVER_HIDES_OR_GHOSTS_STACK_MATES", async () => {
  const renderer = new HexMapRenderer();
  const namespace = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(namespace, "svg");
  const stacks = new Map<string, SVGGElement>();
  const cells = new Map<string, SVGGElement>();
  for (const [key, id] of [["0,0", "origin-survivor"], ["1,0", "destination-survivor"]]) {
    const cell = document.createElementNS(namespace, "g");
    const stack = document.createElementNS(namespace, "g");
    const formation = document.createElementNS(namespace, "g");
    stack.classList.add("unit-stack");
    formation.classList.add("unit-stack-formation");
    formation.dataset.unitId = id;
    stack.appendChild(formation);
    cell.appendChild(stack);
    svg.appendChild(cell);
    cells.set(key, cell);
    stacks.set(key, stack);
  }
  const effects = document.createElementNS(namespace, "g");
  svg.appendChild(effects);
  document.body.appendChild(svg);
  Reflect.set(renderer, "svgElement", svg);
  Reflect.set(renderer, "combatEffectsLayer", effects);
  Reflect.set(renderer, "hexElementMap", cells);
  Reflect.set(renderer, "hexUnitImageMap", stacks);
  Reflect.set(renderer, "extractHexCenter", (cell: SVGGElement) => ({ cx: cell === cells.get("0,0") ? 0 : 100, cy: 0 }));
  const before = svg.innerHTML;
  // Inspect synchronously at prime time, before animation frames can restore a
  // wrongly hidden stack or remove a ghost of the wrong surviving formation.
  const missing = renderer.primeUnitMove("0,0", "1,0", { unitId: "destroyed-mover" });
  assert.equal(missing, null, "A resolved mover absent from both stacks cannot borrow another actor.");
  assert.equal(svg.innerHTML, before, "Missing explicit actors must not change survivor DOM at movement priming.");
  const destinationActor = renderer.primeUnitMove("0,0", "1,0", { unitId: "destination-survivor" });
  assert.ok(destinationActor, "Exact destination identity remains usable after a post-resolution render.");
  assert.equal(svg.querySelector<SVGGElement>("g.unit-move-ghost")?.dataset.unitId, "destination-survivor");
  assert.equal(stacks.get("0,0")!.style.opacity, "");
  destinationActor.dispose();
  const legacy = renderer.primeUnitMove("0,0", "1,0");
  assert.ok(legacy, "ID-less legacy movement retains its existing stack animation contract.");
  legacy.dispose();
});
