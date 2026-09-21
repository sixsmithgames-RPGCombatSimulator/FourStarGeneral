import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registerTest } from "./harness.js";
import {
  buildAirShowBomberInterceptPassPath,
  buildAirShowDogfightPassPath,
  type AirShowCombatPassCorridor,
  type AirShowCombatPassGeometryServices
} from "../src/rendering/AirShowCombatPassGeometry";
import type { AirShowPoint } from "../src/ui/airshow/AirShowPlaybackScene";

const CORRIDOR: AirShowCombatPassCorridor = {
  center: { cx: 400, cy: 300 },
  axis: { x: 0.8944271909999159, y: -0.4472135954999579 },
  normal: { x: 0.4472135954999579, y: 0.8944271909999159 },
  entry: { cx: 200, cy: 400 },
  merge: { cx: 350, cy: 325 },
  strike: { cx: 450, cy: 275 },
  exit: { cx: 600, cy: 200 }
};

function detached(points: ReadonlyArray<AirShowPoint>): AirShowPoint[] {
  return points.map((point) => ({ cx: point.cx, cy: point.cy }));
}

function testGeometryServices(): AirShowCombatPassGeometryServices {
  const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));
  const normalizeVector = (dx: number, dy: number, fallbackX = 1, fallbackY = 0): { x: number; y: number } => {
    const length = Math.hypot(dx, dy);
    return length <= 0.0001 ? { x: fallbackX, y: fallbackY } : { x: dx / length, y: dy / length };
  };
  const resolveAircraftHeadingDegrees = (dx: number, dy: number, fallbackDegrees = 0): number =>
    Math.hypot(dx, dy) <= 0.0001 ? fallbackDegrees : Math.atan2(dy, dx) * 180 / Math.PI + 90;
  const resolveHeadingVector = (headingDegrees: number): { x: number; y: number } => {
    const radians = (headingDegrees - 90) * Math.PI / 180;
    return { x: Math.cos(radians), y: Math.sin(radians) };
  };
  const resolveVectorAngleDegrees = (
    left: Readonly<{ x: number; y: number }>,
    right: Readonly<{ x: number; y: number }>
  ): number => {
    const normalizedLeft = normalizeVector(left.x, left.y);
    const normalizedRight = normalizeVector(right.x, right.y);
    return Math.acos(clamp(
      normalizedLeft.x * normalizedRight.x + normalizedLeft.y * normalizedRight.y,
      -1,
      1
    )) * 180 / Math.PI;
  };
  const resolveWaypointTurnDegrees = (previous: AirShowPoint, current: AirShowPoint, next: AirShowPoint): number =>
    resolveVectorAngleDegrees(
      { x: current.cx - previous.cx, y: current.cy - previous.cy },
      { x: next.cx - current.cx, y: next.cy - current.cy }
    );
  const clampPointToViewportBounds = (
    point: AirShowPoint,
    center: AirShowPoint,
    maxHorizontalPx = 500,
    maxVerticalPx = 360
  ): AirShowPoint => ({
    cx: clamp(point.cx, center.cx - maxHorizontalPx, center.cx + maxHorizontalPx),
    cy: clamp(point.cy, center.cy - maxVerticalPx, center.cy + maxVerticalPx)
  });
  const services: AirShowCombatPassGeometryServices = {
    clamp,
    clampPointToViewportBounds,
    normalizeVector,
    resolveAircraftHeadingDegrees,
    resolveHeadingVector,
    resolveVectorAngleDegrees,
    resolveWaypointTurnDegrees,
    resolvePathHeadingDegrees: (points, fallbackHeadingDegrees) => {
      const end = points[points.length - 1];
      const previous = points[points.length - 2];
      return end && previous
        ? resolveAircraftHeadingDegrees(end.cx - previous.cx, end.cy - previous.cy, fallbackHeadingDegrees)
        : fallbackHeadingDegrees;
    },
    projectCorridorPoint: (corridor, alongPx, lateralPx = 0) => ({
      cx: corridor.center.cx + corridor.axis.x * alongPx + corridor.normal.x * lateralPx,
      cy: corridor.center.cy + corridor.axis.y * alongPx + corridor.normal.y * lateralPx
    }),
    resolveCorridorCoordinates: (corridor, point) => {
      const dx = point.cx - corridor.center.cx;
      const dy = point.cy - corridor.center.cy;
      return {
        alongPx: dx * corridor.axis.x + dy * corridor.axis.y,
        lateralPx: dx * corridor.normal.x + dy * corridor.normal.y
      };
    },
    buildPhaseEntryBridge: (_start, toward) => [{ cx: toward.cx, cy: toward.cy }],
    buildHeadingLeadPoint: (_start, toward) => ({ cx: toward.cx, cy: toward.cy }),
    buildIngressStagingPath: (_start, stagePoint, nextFocusPoint) => detached([stagePoint, nextFocusPoint]),
    pruneTurnWaypoint: (path) => detached(path),
    pruneEarlyTurnWaypoints: (path) => detached(path),
    pruneSharpTurns: (path) => detached(path)
  };
  return services;
}

const FORBIDDEN_RENDERER_LEGACY_ROOTS = [
  "resolveHqAxis",
  "buildAirShowPlannedFlight",
  "buildAirShowRuntimeFlight",
  "resolveAirShowSceneAnchor",
  "resolveAirShowSceneCorridorAnchor",
  "normalizeAirShowSceneFlightAnchors",
  "buildAirShowDogfightPassPath",
  "buildAirShowBomberInterceptPassPath",
  "resolveAirShowCombatPassGeometryServices",
  "prepareAirShowPhaseAssignments",
  "runAirShowPhase",
  "syncAirShowFlightStrength"
] as const;

registerTest("AIR_SHOW_COMBAT_PASS_PROJECTIONS_REMAIN_DETERMINISTIC_AND_DETACHED", async ({ Given, When, Then }) => {
  const services = testGeometryServices();
  const start = { cx: 105, cy: 460 };
  const corridor = structuredClone(CORRIDOR);
  const before = JSON.stringify({ start, corridor });
  let firstDogfight!: AirShowPoint[];
  let secondDogfight!: AirShowPoint[];
  let bomberPass!: AirShowPoint[];

  await Given("caller-owned pass inputs and deterministic injected geometry primitives", () => undefined);
  await When("both canonical combat-pass projections are resolved", () => {
    firstDogfight = buildAirShowDogfightPassPath({
      start,
      focus: { cx: 410, cy: 290 },
      corridor,
      options: { sideSign: 1, laneIndex: 1, passSign: 1, startHeadingDegrees: 75 },
      services
    });
    secondDogfight = buildAirShowDogfightPassPath({
      start,
      focus: { cx: 410, cy: 290 },
      corridor,
      options: { sideSign: 1, laneIndex: 1, passSign: 1, startHeadingDegrees: 75 },
      services
    });
    bomberPass = buildAirShowBomberInterceptPassPath({
      start: { cx: 90, cy: 480 },
      corridor,
      options: { passStartAlongPx: -40, passEndAlongPx: 85, laneIndex: 1, attackSideSign: -1 },
      services
    });
  });
  await Then("outputs are stable, non-empty, and share no point identity with caller inputs", () => {
    assert.deepEqual(firstDogfight, secondDogfight);
    assert.ok(firstDogfight.length >= 3);
    assert.ok(bomberPass.length >= 3);
    assert.equal(JSON.stringify({ start, corridor }), before);
    assert.notEqual(firstDogfight[0], start);
    const callerPoints = [start, corridor.center, corridor.entry, corridor.merge, corridor.strike, corridor.exit];
    [...firstDogfight, ...bomberPass].forEach((point) => {
      callerPoints.forEach((callerPoint) => assert.notEqual(point, callerPoint));
    });
  });
});

registerTest("AIR_SHOW_RENDERER_HAS_NO_LEGACY_PLANNING_GEOMETRY_OR_RNG_AUTHORITY", async ({ Given, When, Then }) => {
  let rendererSource = "";

  await Given("the production renderer after timeline authority consolidation", () => undefined);
  await When("the renderer source is inspected", () => {
    rendererSource = readFileSync("src/rendering/HexMapRenderer.ts", "utf8");
  });
  await Then("the canonical timeline planner is its only Airshow planner dependency", () => {
    assert.equal(
      (rendererSource.match(/import \{ planAirShowTimeline \} from "\.\.\/ui\/airshow\/AirShowDirector";/g) ?? []).length,
      1
    );
    assert.equal((rendererSource.match(/const timeline = planAirShowTimeline\(\{/g) ?? []).length, 1);
    assert.doesNotMatch(rendererSource, /AirShowCombatPassGeometry/);
    FORBIDDEN_RENDERER_LEGACY_ROOTS.forEach((root) => {
      assert.doesNotMatch(rendererSource, new RegExp(`\\b${root}\\b`));
    });
  });
});
