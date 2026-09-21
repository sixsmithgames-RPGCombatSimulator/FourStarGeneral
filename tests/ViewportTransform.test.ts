import { readFileSync } from "node:fs";
import "./domEnvironment.js";
import { parseViewportTransform } from "../src/rendering/ViewportTransform";
import { registerTest } from "./harness.js";

function expectMatrix(
  value: string | null,
  expected: { readonly a: number; readonly b: number; readonly c: number; readonly d: number; readonly e: number; readonly f: number }
): void {
  const actual = parseViewportTransform(value);
  for (const key of ["a", "b", "c", "d", "e", "f"] as const) {
    if (actual[key] !== expected[key]) {
      throw new Error(`Expected matrix ${key}=${expected[key]}, received ${actual[key]} for ${String(value)}.`);
    }
  }
}

registerTest("VIEWPORT_TRANSFORM_PARSER_SUPPORTS_CANONICAL_CROSS_BROWSER_FORMS", async ({ Given, When, Then }) => {
  await Given("the transform forms emitted by MapViewport and retained by SVG engines", async () => {});

  await When("the combat overlay resolves each transform without SVGTransformList", async () => {});

  await Then("identity, translate-scale, nonuniform scale, and matrix forms retain exact values", async () => {
    expectMatrix(null, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expectMatrix("translate(0, 0) scale(1)", { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
    expectMatrix("translate(-520 -340) scale(2.2)", { a: 2.2, b: 0, c: 0, d: 2.2, e: -520, f: -340 });
    expectMatrix("translate(12.5, -7.25) scale(1.5, 0.75)", { a: 1.5, b: 0, c: 0, d: 0.75, e: 12.5, f: -7.25 });
    expectMatrix("matrix(2.2, 0, 0, 2.2, -520, -340)", { a: 2.2, b: 0, c: 0, d: 2.2, e: -520, f: -340 });
    expectMatrix("matrix(1e0 0 0 2E+0 -5e2 -3.4e2)", { a: 1, b: 0, c: 0, d: 2, e: -500, f: -340 });
  });
});

registerTest("VIEWPORT_TRANSFORM_READER_NEVER_MUTATES_THE_OBSERVED_ATTRIBUTE", async ({ Given, When, Then }) => {
  const root = document.createElementNS("http://www.w3.org/2000/svg", "g");
  const original = "translate(-520 -340) scale(2.2)";
  let mutationCount = 0;

  await Given("an observed viewportRoot whose transform attribute is the camera's source of truth", async () => {
    root.setAttribute("transform", original);
    const observer = new window.MutationObserver((records) => {
      mutationCount += records.filter((record) => record.attributeName === "transform").length;
    });
    observer.observe(root, { attributes: true, attributeFilter: ["transform"] });
  });

  await When("the overlay reads the transform repeatedly", async () => {
    for (let index = 0; index < 50; index += 1) {
      parseViewportTransform(root.getAttribute("transform"));
    }
    await Promise.resolve();
  });

  await Then("the transform stays byte-for-byte stable and produces no observer feedback", async () => {
    if (root.getAttribute("transform") !== original || mutationCount !== 0) {
      throw new Error(`Expected a read-only transform path; attribute=${root.getAttribute("transform")}, mutations=${mutationCount}.`);
    }
    const rendererSource = readFileSync("src/rendering/HexMapRenderer.ts", "utf8");
    if (rendererSource.includes(".consolidate(")) {
      throw new Error("HexMapRenderer must not call SVGTransformList.consolidate() inside an observed transform path.");
    }
  });
});

registerTest("VIEWPORT_TRANSFORM_PARSER_REJECTS_UNOWNED_TRANSFORM_FORMS", async ({ Given, When, Then }) => {
  let message = "";

  await Given("a transform that is not emitted by the canonical MapViewport writer", async () => {});

  await When("the combat overlay attempts to parse it", async () => {
    try {
      parseViewportTransform("rotate(45)");
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
  });

  await Then("the unsupported writer is surfaced instead of silently misaligning effects", async () => {
    if (!message.includes("Unsupported viewport transform")) {
      throw new Error(`Expected an explicit unsupported-transform error, received: ${message || "no error"}.`);
    }
  });
});
