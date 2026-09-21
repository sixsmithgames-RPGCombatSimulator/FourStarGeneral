import "./domEnvironment.js";
import assert from "node:assert/strict";
import { registerTest } from "./harness.js";
import type { ScenarioData, ScenarioUnit } from "../src/core/types";
import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import {
  prepareUnitStackPresentation,
  UNKNOWN_CONTACT_SPRITE,
  type RenderedUnitStackMember
} from "../src/rendering/UnitStackPresentation";

function unit(
  type: string,
  unitId: string,
  strength: number,
  facing: ScenarioUnit["facing"],
  extras: Partial<ScenarioUnit> = {}
): ScenarioUnit {
  return {
    type: type as ScenarioUnit["type"],
    unitId,
    hex: { q: 0, r: 0 },
    strength,
    experience: 0,
    ammo: 6,
    fuel: 4,
    entrench: 0,
    facing,
    ...extras
  };
}

function members(): RenderedUnitStackMember[] {
  return [
    {
      unit: unit("Supply_Truck", "convoy", 100, "E"),
      faction: "Player",
      reconStatus: "visible"
    },
    {
      unit: unit("Infantry_42", "infantry", 60, "NW", {
        entrench: 2,
        onSentry: true,
        suppressedBy: ["enemy-a", "enemy-b"]
      }),
      faction: "Player",
      reconStatus: "identified"
    },
    {
      unit: unit("Recon_Bike", "recon", 20, "SW", { suppressedBy: ["enemy-a", "enemy-b"] }),
      faction: "Bot",
      reconStatus: true
    }
  ];
}

function scenario(): ScenarioData {
  const side = {
    hq: { q: 0, r: 0 },
    general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
    units: []
  };
  return {
    name: "Unit stack presentation integration",
    size: { cols: 1, rows: 1 },
    tilePalette: {
      PLAINS: { terrain: "plains", terrainType: "grass", density: "average", features: [], recon: "intel" }
    },
    tiles: [[{ tile: "PLAINS" }]],
    objectives: [],
    turnLimit: 1,
    sides: { Player: side, Bot: structuredClone(side) }
  } as ScenarioData;
}

registerTest("UNIT_STACK_PRESENTATION_IS_DETERMINISTIC_DETACHED_AND_PRESERVES_LAYOUT_PARITY", async ({ Given, When, Then }) => {
  const input = members();
  const originalInput = structuredClone(input);
  let first!: NonNullable<ReturnType<typeof prepareUnitStackPresentation>>;
  let second!: NonNullable<ReturnType<typeof prepareUnitStackPresentation>>;
  let detachedSnapshot = "";

  await Given("three colocated formations including a high-strength convoy behind two combat units", () => undefined);
  await When("the pure presentation planner prepares the stack twice", () => {
    first = prepareUnitStackPresentation(input)!;
    second = prepareUnitStackPresentation(input)!;
    detachedSnapshot = JSON.stringify(first);
  });
  await Then("priority, geometry, recon, and status facts match the former renderer rules without mutating inputs", () => {
    assert.deepEqual(input, originalInput);
    assert.deepEqual(first, second);
    assert.deepEqual(first.formations.map((formation) => formation.unitId), ["infantry", "recon"]);
    assert.equal(first.primary.suppressionState, "pinned");
    assert.equal(first.primary.sentryState, "on");
    assert.equal(first.primary.entrenchmentLevel, 2);
    assert.deepEqual(first.formations[0]!.layout, [
      { ox: 0, oy: -14.399999999999999, scale: 0.518 },
      { ox: -14.399999999999999, oy: 0, scale: 0.518 },
      { ox: 14.399999999999999, oy: 0, scale: 0.518 }
    ]);
    assert.deepEqual(first.formations[1]!.decorationOffset, { dx: 12, dy: 2 });
    assert.equal(first.formations[1]!.suppressionState, "broken");
    assert.equal(first.formations[1]!.spriteHrefs[0], UNKNOWN_CONTACT_SPRITE);

    input[1]!.unit.strength = 1;
    input[1]!.unit.suppressedBy!.push("enemy-c");
    assert.equal(JSON.stringify(first), detachedSnapshot);
  });
});

registerTest("HEXMAP_RENDERER_CONSUMES_THE_CANONICAL_UNIT_STACK_PRESENTATION", async ({ Given, When, Then }) => {
  const viewport = document.createElement("div");
  Object.defineProperty(viewport, "clientWidth", { value: 320, configurable: true });
  Object.defineProperty(viewport, "clientHeight", { value: 220, configurable: true });
  const canvas = document.createElement("div");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  canvas.appendChild(svg);
  viewport.appendChild(canvas);
  document.body.appendChild(viewport);
  const renderer = new HexMapRenderer();
  const input = members();
  const expected = prepareUnitStackPresentation(input)!;

  await Given("one rendered tactical hex and the canonical detached presentation", () => {
    renderer.render(svg, canvas, scenario());
  });
  await When("the renderer paints the same stack", () => {
    renderer.renderUnitStack("0,0", input);
  });
  await Then("SVG identity, actor geometry, and tactical status exactly consume that presentation", () => {
    const stack = svg.querySelector<SVGGElement>("g.unit-stack");
    assert.ok(stack);
    assert.equal(stack.dataset.stackCount, String(expected.formations.length));
    assert.equal(stack.dataset.reconStatus, expected.primary.reconStatus);
    assert.equal(stack.dataset.suppressionState, expected.primary.suppressionState);
    assert.equal(stack.dataset.sentryState, expected.primary.sentryState);
    assert.equal(stack.dataset.entrenchLevel, String(expected.primary.entrenchmentLevel));

    const formations = Array.from(stack.querySelectorAll<SVGGElement>("g.unit-stack-formation"));
    assert.deepEqual(formations.map((formation) => formation.dataset.unitId), expected.formations.map((formation) => formation.unitId));
    formations.forEach((formation, index) => {
      const expectedFormation = expected.formations[index]!;
      const icons = Array.from(formation.querySelectorAll<SVGImageElement>("image.unit-icon"));
      assert.equal(icons.length, expectedFormation.layout.length);
      assert.deepEqual(
        icons.map((icon) => ({
          ox: Number(icon.dataset.ox),
          oy: Number(icon.dataset.oy),
          scale: Number(icon.dataset.scale),
          href: icon.getAttribute("href")
        })),
        expectedFormation.layout.map((spec, actorIndex) => ({
          ...spec,
          href: expectedFormation.spriteHrefs[actorIndex]
        }))
      );
    });
    assert.ok(stack.querySelector('[data-status="sentry"]'));
    assert.ok(stack.querySelector('[data-status="pinned"]'));
    assert.ok(stack.querySelector('[data-status="broken"]'));
    assert.equal(stack.querySelector('[data-entrenchment="2"]') !== null, true);
    assert.equal(stack.querySelector('[data-unit-id="convoy"]'), null);
    viewport.remove();
  });
});
