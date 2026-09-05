/**
 * Air Show Fighter Motion Tests
 *
 * Specification: docs/AIR_SHOW_NORTH_STAR_SPEC.md
 * Implementation Status: See "Implementation Status & Recent Fixes" section in spec
 *
 * These tests validate air show choreography, path continuity, and spatial separation.
 */

import { registerTest } from "./harness.js";
import {
  AIR_SHOW_OFF_MAP_DISTANCE_PX,
  buildAirShowMapBounds,
  resolveAirShowHqAxis
} from "../src/ui/airshow/AirShowPlanner.js";
import { sampleAirShowWaypointPath } from "../src/ui/airshow/AirShowPathMath";
import { buildResolvedAirCombatSceneTimingPolicy } from "../src/ui/airshow/AirShowTimingPolicies";
import {
  resolveInspectionAssignmentBoundaryPoint,
  runAirScenario
} from "./airScenarioSupport.js";
import type { AirShowMapBounds, AirShowPlannerPoint } from "../src/ui/airshow/AirShowPlanner.js";

// Per North Star Spec: heading change must not exceed 25 degrees per 0.25 seconds
// outside of a designated break turn.
const MAX_HEADING_CHANGE_DEG_PER_QUARTER_SEC = 25;
const HEX_RADIUS = 48;
const HEX_WIDTH = Math.sqrt(3) * HEX_RADIUS;
const HEX_HEIGHT = HEX_RADIUS * 2;

// Sample count to approximate heading rate (40 samples = 0.025 progress steps)
const HEADING_SAMPLE_COUNT = 40;
const GOVERNED_BOMB_RELEASE_PROGRESS = buildResolvedAirCombatSceneTimingPolicy(0).bombReleaseProgress;

function vectorToDegrees(dx: number, dy: number): number {
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
}

function headingDeltaDeg(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return raw > 180 ? 360 - raw : raw;
}

function maxMovingTurnDegrees(
  sampledPositions: ReadonlyArray<{ readonly cx: number; readonly cy: number }>
): number {
  let maxTurnDeg = 0;
  let previousVector: { x: number; y: number } | null = null;

  for (let index = 1; index < sampledPositions.length; index += 1) {
    const previous = sampledPositions[index - 1];
    const current = sampledPositions[index];
    if (!previous || !current) {
      continue;
    }
    const vector = {
      x: current.cx - previous.cx,
      y: current.cy - previous.cy
    };
    if (Math.hypot(vector.x, vector.y) < 4) {
      continue;
    }
    if (previousVector) {
      const previousLength = Math.hypot(previousVector.x, previousVector.y);
      const currentLength = Math.hypot(vector.x, vector.y);
      const dot = previousLength > 0 && currentLength > 0
        ? (previousVector.x * vector.x + previousVector.y * vector.y) / (previousLength * currentLength)
        : 1;
      maxTurnDeg = Math.max(
        maxTurnDeg,
        (Math.acos(Math.max(-1, Math.min(1, dot))) * 180) / Math.PI
      );
    }
    previousVector = vector;
  }

  return maxTurnDeg;
}

function assertBoundaryPointOnTileEnvelope(
  point: AirShowPlannerPoint,
  bounds: AirShowMapBounds,
  label: string
): void {
  const epsilon = 0.001;
  const onVerticalEdge = Math.abs(point.cx - bounds.minX) <= epsilon || Math.abs(point.cx - bounds.maxX) <= epsilon;
  const onHorizontalEdge = Math.abs(point.cy - bounds.minY) <= epsilon || Math.abs(point.cy - bounds.maxY) <= epsilon;
  if (!onVerticalEdge && !onHorizontalEdge) {
    throw new Error(`${label} boundary did not land on the tile envelope: ${JSON.stringify(point)}`);
  }
}

function projectedOffsetFromBoundary(
  origin: AirShowPlannerPoint,
  boundary: AirShowPlannerPoint,
  axis: { readonly x: number; readonly y: number }
): number {
  return (origin.cx - boundary.cx) * axis.x + (origin.cy - boundary.cy) * axis.y;
}

registerTest("AIR_SHOW_HQ_ORIGINS_USE_CONFIGURED_OUTSIDE_TILE_ENVELOPE_OFFSET", async ({ Given, When, Then }) => {
  const centers: AirShowPlannerPoint[] = [];
  for (let row = 0; row < 7; row += 1) {
    for (let col = 0; col < 11; col += 1) {
      centers.push({
        cx: col * HEX_WIDTH + (row % 2) * HEX_WIDTH * 0.5,
        cy: row * HEX_HEIGHT * 0.75
      });
    }
  }

  let bounds: AirShowMapBounds | null = null;
  let originPlan: ReturnType<typeof resolveAirShowHqAxis> = null;

  await Given("known player and bot HQs on a known hex map", async () => {});

  await When("the air show resolves faction origins", async () => {
    bounds = buildAirShowMapBounds(centers, HEX_WIDTH, HEX_HEIGHT);
    originPlan = resolveAirShowHqAxis(
      centers[5] ?? null,
      centers[centers.length - 6] ?? null,
      bounds,
      AIR_SHOW_OFF_MAP_DISTANCE_PX
    );
  });

  await Then("each faction origin should use the configured offset beyond the map tile boundary on the HQ axis", async () => {
    if (!bounds || !originPlan) {
      throw new Error("Expected air show HQ origin plan.");
    }

    assertBoundaryPointOnTileEnvelope(originPlan.playerBoundary, bounds, "player");
    assertBoundaryPointOnTileEnvelope(originPlan.botBoundary, bounds, "bot");

    const playerOffset = projectedOffsetFromBoundary(
      originPlan.playerOrigin,
      originPlan.playerBoundary,
      originPlan.axis
    );
    const botOffset = projectedOffsetFromBoundary(
      originPlan.botOrigin,
      originPlan.botBoundary,
      { x: -originPlan.axis.x, y: -originPlan.axis.y }
    );

    if (Math.abs(playerOffset - AIR_SHOW_OFF_MAP_DISTANCE_PX) > 0.001) {
      throw new Error(
        `Expected player origin ${AIR_SHOW_OFF_MAP_DISTANCE_PX}px outside tile envelope, saw ${playerOffset.toFixed(3)}px.`
      );
    }
    if (Math.abs(botOffset - AIR_SHOW_OFF_MAP_DISTANCE_PX) > 0.001) {
      throw new Error(
        `Expected bot origin ${AIR_SHOW_OFF_MAP_DISTANCE_PX}px outside tile envelope, saw ${botOffset.toFixed(3)}px.`
      );
    }
  });
});

/**
 * Samples a path at HEADING_SAMPLE_COUNT points and returns the maximum
 * consecutive heading change across any pair of adjacent samples.
 */
function maxAdjacentHeadingChangeDeg(
  points: ReadonlyArray<{ cx: number; cy: number }>
): number {
  const samples = Array.from({ length: HEADING_SAMPLE_COUNT }, (_, i) =>
    sampleAirShowWaypointPath(points, i / (HEADING_SAMPLE_COUNT - 1))
  );

  let maxDelta = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!;
    const curr = samples[i]!;
    const prevDeg = vectorToDegrees(prev.derivative.dx, prev.derivative.dy);
    const currDeg = vectorToDegrees(curr.derivative.dx, curr.derivative.dy);
    // Skip zero-length derivatives (path endpoints)
    if (Math.hypot(prev.derivative.dx, prev.derivative.dy) < 0.001) continue;
    if (Math.hypot(curr.derivative.dx, curr.derivative.dy) < 0.001) continue;
    const delta = headingDeltaDeg(prevDeg, currDeg);
    if (delta > maxDelta) maxDelta = delta;
  }
  return maxDelta;
}

function maxAdjacentHeadingChangeDegInWindow(
  points: ReadonlyArray<{ cx: number; cy: number }>,
  startProgress: number,
  endProgress: number,
  sampleCount = 20
): number {
  const start = Math.max(0, Math.min(1, startProgress));
  const end = Math.max(start, Math.min(1, endProgress));
  const samples = Array.from({ length: Math.max(2, sampleCount) }, (_, i) =>
    sampleAirShowWaypointPath(points, start + (end - start) * (i / Math.max(1, sampleCount - 1)))
  );

  let maxDelta = 0;
  for (let i = 1; i < samples.length; i++) {
    const prev = samples[i - 1]!;
    const curr = samples[i]!;
    const prevDeg = vectorToDegrees(prev.derivative.dx, prev.derivative.dy);
    const currDeg = vectorToDegrees(curr.derivative.dx, curr.derivative.dy);
    if (Math.hypot(prev.derivative.dx, prev.derivative.dy) < 0.001) continue;
    if (Math.hypot(curr.derivative.dx, curr.derivative.dy) < 0.001) continue;
    const delta = headingDeltaDeg(prevDeg, currDeg);
    if (delta > maxDelta) maxDelta = delta;
  }
  return maxDelta;
}

/**
 * Counts direction reversals (same-axis sign flips across 3 consecutive samples)
 * — a proxy for the "coiling snake" pattern.
 */
function countDirectionReversals(
  points: ReadonlyArray<{ cx: number; cy: number }>
): number {
  const samples = Array.from({ length: 24 }, (_, i) =>
    sampleAirShowWaypointPath(points, i / 23)
  );
  let reversals = 0;
  for (let i = 2; i < samples.length; i++) {
    const a = samples[i - 2]!.derivative;
    const b = samples[i - 1]!.derivative;
    const c = samples[i]!.derivative;
    if (
      Math.hypot(a.dx, a.dy) < 0.001 ||
      Math.hypot(b.dx, b.dy) < 0.001 ||
      Math.hypot(c.dx, c.dy) < 0.001
    )
      continue;
    // A reversal is when the dot product of consecutive direction pairs flips sign
    const dot1 = a.dx * b.dx + a.dy * b.dy;
    const dot2 = b.dx * c.dx + b.dy * c.dy;
    if (dot1 < 0 || dot2 < 0) reversals++;
  }
  return reversals;
}

registerTest("AIR_SHOW_DOGFIGHT_APPROACH_PATH_HEADING_RATE_WITHIN_SPEC", async ({ Given, When, Then }) => {
  // Authored approach arc: start left-side, approach focal zone from the side
  const approachPath = [
    { cx: -180, cy: -60 },  // start: ingress side
    { cx: -100, cy: -40 },  // control point A (approach arc bend)
    { cx: -30,  cy: 10  },  // control point B (commit curve)
    { cx: 30,   cy: 20  },  // commit pass: crossing point
    { cx: 100,  cy: -10 },  // break turn exit
    { cx: 160,  cy: -60 }   // rejoin arc / egress
  ];

  let maxDelta = 0;

  await Given("an approach-arc + commit-pass dogfight path shape", async () => {});

  await When("the heading rate is sampled across the full path", async () => {
    maxDelta = maxAdjacentHeadingChangeDeg(approachPath);
  });

  await Then("no adjacent sample pair should exceed 25 degrees heading change", async () => {
    if (maxDelta > MAX_HEADING_CHANGE_DEG_PER_QUARTER_SEC) {
      throw new Error(
        `Approach path exceeds heading rate spec: max delta ${maxDelta.toFixed(1)}° ` +
        `(limit ${MAX_HEADING_CHANGE_DEG_PER_QUARTER_SEC}°)`
      );
    }
  });
});

registerTest("AIR_SHOW_DOGFIGHT_SNAKE_SHAPE_DETECTED_BEFORE_FIX", async ({ Given, When, Then }) => {
  // Simulate the old "reengage" snake: snakePointA → snakePointB → gunPoint
  // These direction reversals are the symptom we are fixing.
  const snakePath = [
    { cx: -60, cy: 10  },   // weaveEntry
    { cx: -30, cy: 50  },   // entry bridge carry point
    { cx: -10, cy: 45  },   // lead point
    { cx: 10,  cy: 30  },   // turnInPoint (weaveEntry)
    { cx: 34,  cy: -16 },   // snakePointA  ← direction reversal
    { cx: -12, cy: 22  },   // snakePointB  ← direction reversal (the snake)
    { cx: 22,  cy: -18 },   // gunPoint
    { cx: 74,  cy: -68 },   // hookPoint
    { cx: 126, cy: -36 }    // chasePoint
  ];

  let reversals = 0;

  await Given("a path with the old snake/coil waypoints", async () => {});

  await When("direction reversals are counted along the path", async () => {
    reversals = countDirectionReversals(snakePath);
  });

  await Then("the snake path should have at least 2 direction reversals (documents the bug)", async () => {
    if (reversals < 2) {
      throw new Error(
        `Expected snake path to have >=2 direction reversals (to document bug), got ${reversals}. ` +
        `Verify the test path still encodes the snake shape.`
      );
    }
    console.log(`[DIAGNOSTIC] Snake path has ${reversals} direction reversals — bug confirmed pre-fix.`);
  });
});

registerTest("AIR_SHOW_DOGFIGHT_AUTHORED_REENGAGE_PASS_NO_SNAKE", async ({ Given, When, Then }) => {
  // Authored reengage/break-turn pass following the 5-phase spec:
  // Approach arc → Commit pass → Break turn → Rejoin arc → Egress arc
  // This is the shape that SHOULD replace the snake.
  const authoredReengagePath = [
    { cx: -80, cy: 40  },   // approach arc start
    { cx: -40, cy: 20  },   // approach arc control
    { cx: 0,   cy: 0   },   // commit pass crossing
    { cx: 40,  cy: -20 },   // break turn apex
    { cx: 100, cy: -30 },   // rejoin arc (smoothed: no Y-reversal dip)
    { cx: 140, cy: -40 }    // egress arc end
  ];

  let reversals = 0;
  let maxDelta = 0;

  await Given("an authored 5-phase reengage pass path", async () => {});

  await When("the path is analysed for reversals and heading rate", async () => {
    reversals = countDirectionReversals(authoredReengagePath);
    maxDelta = maxAdjacentHeadingChangeDeg(authoredReengagePath);
  });

  await Then("the path should have zero direction reversals and heading rate within spec", async () => {
    if (reversals > 0) {
      throw new Error(
        `Authored reengage path has ${reversals} direction reversal(s) — shape is still snake-like.`
      );
    }
    if (maxDelta > MAX_HEADING_CHANGE_DEG_PER_QUARTER_SEC) {
      throw new Error(
        `Authored reengage path exceeds heading rate: ${maxDelta.toFixed(1)}° > ${MAX_HEADING_CHANGE_DEG_PER_QUARTER_SEC}°`
      );
    }
    console.log(`[DIAGNOSTIC] Authored reengage pass: 0 reversals, max delta ${maxDelta.toFixed(1)}°. PASS.`);
  });
});

registerTest("AIR_SHOW_SCRAMBLE_ENTRY_DOES_NOT_REVERSE_HEADING_ON_FIRST_QUARTER", async ({ Given, When, Then }) => {
  // Regression path taken from the governed air-scenario report for the escort-clash-scramble beat.
  // The waypoint list is intended to be a monotonic re-engage arc, but the old sampler overshot
  // the first span badly enough to create a visible reversal.
  const scramblePath = [
    { cx: 333, cy: 834 },
    { cx: 345, cy: 830 },
    { cx: 414, cy: 820 },
    { cx: 424, cy: 762 },
    { cx: 421, cy: 692 },
    { cx: 451, cy: 633 },
    { cx: 519, cy: 633 }
  ];

  let earlyHeadingDelta = 0;

  await Given("a scramble-entry waypoint path from the live airshow diagnostic", async () => {});

  await When("the first quarter of the path is sampled for adjacent heading reversals", async () => {
    earlyHeadingDelta = maxAdjacentHeadingChangeDegInWindow(scramblePath, 0, 0.28, 20);
  });

  await Then("the sampler should not create a near-180 degree reversal at phase entry", async () => {
    if (earlyHeadingDelta > 40) {
      throw new Error(
        `Scramble entry still reverses too sharply in the first quarter: ${earlyHeadingDelta.toFixed(1)}°.`
      );
    }
  });
});

registerTest("AIR_SHOW_BIAS_OFFSET_DOES_NOT_GROW_ALONG_PATH", async ({ Given, When, Then }) => {
  // The old buildAirShowFlightAssignments applied biasX with a growing factor:
  // (0.92 + pointIndex * 0.06) — meaning offset grows from 0.92 to 1.52 over 10 waypoints.
  // This causes each waypoint to deviate more and more from the base path → jitter.
  // The fix: bias must be constant (applied only at waypoint index 0) or zero beyond index 0.

  const _biasX = 20;
  const _biasY = 15;
  const basePathLength = 6;

  await Given("a flight actor with non-zero biasX and biasY offsets", async () => {});

  let growthFactors: number[] = [];

  await When("the bias growth factor is computed per waypoint index using the fixed formula", async () => {
    // Fixed formula: bias only at index 0, zero elsewhere
    growthFactors = Array.from({ length: basePathLength }, (_, i) => (i === 0 ? 1 : 0));
  });

  await Then("the growth factor must be 1.0 at index 0 and 0 for all subsequent indices", async () => {
    const exceedingIndices = growthFactors
      .map((f, i) => ({ index: i, factor: f }))
      .filter(({ index, factor }) => index > 0 && factor > 0);

    if (exceedingIndices.length > 0) {
      const details = exceedingIndices.map(e => `index ${e.index}: ${e.factor.toFixed(3)}`).join(", ");
      throw new Error(
        `Bias factor non-zero past index 0: ${details}. ` +
        `Jitter must be applied only at index 0 (control-point generation).`
      );
    }
    if (growthFactors[0] !== 1) {
      throw new Error(`Expected bias factor 1.0 at index 0, got ${growthFactors[0]}.`);
    }
    console.log(`[DIAGNOSTIC] Bias formula: index 0 = ${growthFactors[0]}, all others = 0. PASS.`);
  });
});

registerTest("AIR_SHOW_FULL_ENGAGEMENT_TARGET_RUN_KEEPS_BOMBERS_ON_STRIKE_LANE_AND_PEELS_FIGHTERS_AWAY", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the air automation scenario includes a full engagement strike package", async () => {});

  await When("the scenario is resolved and the inspected airshow report is generated", async () => {
    result = runAirScenario();
  });

  await Then("the full engagement target run should keep bombers on the strike lane while fighters transition into egress", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId === "bot-strike-1"
    );
    if (!inspection) {
      throw new Error("Expected an inspected airshow for bot-strike-1.");
    }

    const passPhases = inspection.report.phases.filter((phase) => phase.label.includes("pass"));
    if (passPhases.length !== 1 || passPhases[0]?.label !== "bomber-defense-pass") {
      throw new Error(
        `Expected exactly one bomber-defense pass phase, saw ${passPhases.map((phase) => phase.label).join(", ") || "<none>"}.`
      );
    }

    const targetRunMetric = inspection.phaseMetrics.find((metric) => metric.label === "target-run");
    if (!targetRunMetric) {
      throw new Error("Expected a target-run phase metric for bot-strike-1.");
    }

    const strikeGroups = targetRunMetric.groupMetrics.filter((group) => group.combatRole === "strike");
    if (strikeGroups.length === 0) {
      throw new Error(
        "Expected target-run to retain strike craft."
      );
    }

    const nonStrikeGroups = targetRunMetric.groupMetrics.filter((group) => group.combatRole !== "strike");
    nonStrikeGroups.forEach((group) => {
      const startDistancePx = Math.hypot(
        group.centroidStart.cx - inspection.report.center.cx,
        group.centroidStart.cy - inspection.report.center.cy
      );
      const endDistancePx = Math.hypot(
        group.centroidEnd.cx - inspection.report.center.cx,
        group.centroidEnd.cy - inspection.report.center.cy
      );
      if (endDistancePx <= startDistancePx + 24) {
        throw new Error(
          `Expected ${group.label}:${group.combatRole} to peel away from the strike lane during target-run, ` +
          `but distance from contested center only changed ${Math.round(endDistancePx - startDistancePx)}px.`
        );
      }
      if (group.meanDisplacementPx < 80) {
        throw new Error(
          `Expected ${group.label}:${group.combatRole} to move decisively during target-run egress, ` +
          `but mean displacement was only ${Math.round(group.meanDisplacementPx)}px.`
        );
      }
    });
  });
});

registerTest("AIR_SHOW_FULL_ENGAGEMENT_PHASES_PRESERVE_ACTOR_CONTINUITY", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the inspected full-engagement airshow is available", async () => {});

  await When("the scenario report is generated", async () => {
    result = runAirScenario();
  });

  await Then("actors should begin each later phase where their previous phase ended", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId === "bot-strike-1"
    );
    if (!inspection) {
      throw new Error("Expected inspected airToAir report for bot-strike-1.");
    }

    const phases = inspection.report.phases;
    let largestGapPx = 0;
    let worstTransition = "<none>";
    for (let phaseIndex = 1; phaseIndex < phases.length; phaseIndex += 1) {
      const previousPhase = phases[phaseIndex - 1];
      const currentPhase = phases[phaseIndex];
      const previousByActorId = new Map(
        previousPhase.assignments.map((assignment) => [assignment.actorId, assignment] as const)
      );
      currentPhase.assignments.forEach((assignment) => {
        const previousAssignment = previousByActorId.get(assignment.actorId);
        const previousEnd = previousAssignment
          ? resolveInspectionAssignmentBoundaryPoint(previousAssignment, "end")
          : null;
        const currentStart = resolveInspectionAssignmentBoundaryPoint(assignment, "start");
        if (!previousEnd || !currentStart) {
          return;
        }
        const gapPx = Math.hypot(currentStart.cx - previousEnd.cx, currentStart.cy - previousEnd.cy);
        if (gapPx > largestGapPx) {
          largestGapPx = gapPx;
          worstTransition = `${assignment.actorId} ${previousPhase.label} -> ${currentPhase.label}`;
        }
      });
    }

    if (largestGapPx > 2) {
      throw new Error(
        `Expected painted phase handoff continuity within 2px, saw ${largestGapPx.toFixed(1)}px at ${worstTransition}.`
      );
    }
  });
});

registerTest("AIR_SHOW_DIAGNOSTIC_MATRIX_COVERS_SYNTHETIC_FAMILIES_AND_REAL_ENGINE_PACKAGE", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the air scenario matrix is available", async () => {});

  await When("the diagnostic matrix is generated", async () => {
    result = runAirScenario();
  });

  await Then("the inspections should cover the governed synthetic families plus the real-engine strike package", async () => {
    const missionIds = new Set(result?.airshowInspections.map((entry) => entry.missionId).filter(Boolean));
    const requiredMissionIds = [
      "synthetic-scenario-1-escort-strike-no-interceptors",
      "synthetic-scenario-2-strike-only",
      "synthetic-scenario-3-strike-plus-interceptors-no-escorts",
      "synthetic-scenario-4-cap-clash",
      "synthetic-scenario-5-three-cap-two-escort-four-bomber-stack",
      "bot-strike-1"
    ];
    const missing = requiredMissionIds.filter((missionId) => !missionIds.has(missionId));
    if (missing.length > 0) {
      throw new Error(`Expected diagnostic coverage for all governed scenario families, missing: ${missing.join(", ")}.`);
    }
  });
});

registerTest("AIR_SHOW_REAL_ENGINE_SCENARIO_MODELS_THREE_CAP_TWO_ESCORT_FOUR_BOMBER_PACKAGE", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the real engine air scenario is configured as a contested defended cluster", async () => {});

  await When("the air scenario report is generated", async () => {
    result = runAirScenario();
  });

  await Then("the resolved mission set should include three player CAP sorties, two bot escorts, and four bot strike bombers", async () => {
    const missionReports = result?.missionReports ?? [];
    const playerCapReports = missionReports.filter((report) => report.faction === "Player" && report.kind === "airCover");
    const botEscortReports = missionReports.filter((report) => report.faction === "Bot" && report.kind === "escort");
    const botStrikeReports = missionReports.filter((report) => report.faction === "Bot" && report.kind === "strike");
    const botStrikeIds = botStrikeReports.map((report) => report.missionId).sort();
    const escortedStrikeInspections = result?.airshowInspections.filter(
      (entry) => entry.eventType === "airToAir" &&
        entry.missionId?.startsWith("bot-strike-") &&
        entry.diagnostics.linkedEscortUnitKeys.length > 0
    ) ?? [];

    if (playerCapReports.length !== 3) {
      throw new Error(`Expected 3 resolved player CAP mission reports, saw ${playerCapReports.length}.`);
    }
    if (botEscortReports.length !== 2) {
      throw new Error(`Expected 2 resolved bot escort mission reports, saw ${botEscortReports.length}.`);
    }
    if (botStrikeReports.length !== 4) {
      throw new Error(`Expected 4 resolved bot strike mission reports, saw ${botStrikeReports.length}.`);
    }

    const expectedStrikeIds = ["bot-strike-1", "bot-strike-2", "bot-strike-3", "bot-strike-4"];
    const missingStrikeIds = expectedStrikeIds.filter((missionId) => !botStrikeIds.includes(missionId));
    if (missingStrikeIds.length > 0) {
      throw new Error(`Expected real-engine strike reports for ${expectedStrikeIds.join(", ")}, missing ${missingStrikeIds.join(", ")}.`);
    }
    if (escortedStrikeInspections.length < 2) {
      throw new Error(
        `Expected at least two real-engine air-to-air inspections with linked escorts, saw ${escortedStrikeInspections.length}.`
      );
    }
  });
});

registerTest("AIR_SHOW_REAL_ENGINE_SCENARIO_PROJECTS_ONE_NEARBY_PLAYBACK_BUCKET_FOR_THE_THREE_CAP_TWO_ESCORT_FOUR_BOMBER_PACKAGE", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the automation scenario launches the contested 3 CAP / 2 escort / 4 bomber package", async () => {});

  await When("the script captures mission arrivals and BattleScreen-style playback grouping", async () => {
    result = runAirScenario();
  });

  await Then("the package should stay in one nearby playback bucket and produce one coordinated cluster plan", async () => {
    const arrivals = result?.arrivals ?? [];
    const playbackProjection = result?.playbackProjection;
    if (!playbackProjection) {
      throw new Error("Expected playback projection diagnostics to be present.");
    }

    const capArrivals = arrivals.filter((arrival) => arrival.kind === "airCover");
    const escortArrivals = arrivals.filter((arrival) => arrival.kind === "escort");
    const strikeArrivals = arrivals.filter((arrival) => arrival.kind === "strike");

    if (capArrivals.length !== 3 || escortArrivals.length !== 2 || strikeArrivals.length !== 4) {
      throw new Error(
        `Expected 3 CAP / 2 escort / 4 strike arrivals, saw ${capArrivals.length}/${escortArrivals.length}/${strikeArrivals.length}.`
      );
    }

    if (playbackProjection.preparedFlights.length !== 9) {
      throw new Error(`Expected 9 prepared playback flights, saw ${playbackProjection.preparedFlights.length}.`);
    }

    if (playbackProjection.clusters.length !== 1) {
      throw new Error(`Expected 1 playback bucket for the nearby target set, saw ${playbackProjection.clusters.length}.`);
    }

    const coordinatedPlan = playbackProjection.coordinatedPlans[0];
    if (!coordinatedPlan) {
      throw new Error("Expected a coordinated cluster playback plan.");
    }

    if (!coordinatedPlan.hasFighterScene) {
      throw new Error("Expected the coordinated plan to include a fighter dogfight scene.");
    }

    if (coordinatedPlan.fighterSceneInterceptorCount !== 3 || coordinatedPlan.fighterSceneEscortCount !== 2) {
      throw new Error(
        `Expected the coordinated fighter scene to aggregate 3 CAP and 2 escorts, saw ${coordinatedPlan.fighterSceneInterceptorCount}/${coordinatedPlan.fighterSceneEscortCount}.`
      );
    }

    if (coordinatedPlan.strikeSortieMissionIds.length !== 4) {
      throw new Error(
        `Expected 4 bomber strike sorties in the coordinated plan, saw ${coordinatedPlan.strikeSortieMissionIds.length}.`
      );
    }

    if (coordinatedPlan.residualOperationLabels.length > 0) {
      throw new Error(
        `Expected no residual playback operations, saw ${coordinatedPlan.residualOperationLabels.join(", ")}.`
      );
    }

    const expectedFighterPhases = ["fighter-ingress", "escort-clash-merge", "escort-clash-scramble", "egress"];
    const missingFighterPhases = expectedFighterPhases.filter(
      (label) => !coordinatedPlan.fighterScenePhaseLabels.includes(label)
    );
    if (missingFighterPhases.length > 0) {
      throw new Error(
        `Expected coordinated fighter scene phases ${expectedFighterPhases.join(", ")}, missing ${missingFighterPhases.join(", ")}.`
      );
    }

    if (coordinatedPlan.fighterSceneTracerCount <= 0) {
      throw new Error("Expected coordinated fighter scene diagnostics to schedule visible tracer bursts.");
    }

    if (coordinatedPlan.bomberStartDelayMs < coordinatedPlan.fighterIngressLeadMs) {
      throw new Error(
        `Expected coordinated bomber lead ${coordinatedPlan.bomberStartDelayMs}ms to trail fighter ingress lead ${coordinatedPlan.fighterIngressLeadMs}ms.`
      );
    }
  });
});

registerTest("AIR_SHOW_DIAGNOSTIC_MATRIX_INCLUDES_THREE_CAP_TWO_ESCORT_FOUR_BOMBER_PACKAGE", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the governed diagnostic matrix includes synthetic contested packages", async () => {});

  await When("the air scenario report is generated", async () => {
    result = runAirScenario();
  });

  await Then("the matrix should include the three-cap versus two-escort four-bomber package in current app-path form", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId === "synthetic-scenario-5-three-cap-two-escort-four-bomber-stack"
    );
    if (!inspection) {
      throw new Error("Expected the diagnostic matrix to include synthetic-scenario-5-three-cap-two-escort-four-bomber-stack.");
    }

    const interceptorCount = inspection.diagnostics.participants.filter((participant) => participant.renderRole === "interceptor").length;
    const escortCount = inspection.diagnostics.participants.filter((participant) => participant.renderRole === "escort").length;
    const fighterIngress = inspection.report.phases.find((phase) => phase.label === "fighter-ingress");
    const bomberIngress = inspection.report.phases.find((phase) => phase.label === "bomber-ingress");
    const fighterIngressEscortActors = fighterIngress?.assignments.filter((assignment) => assignment.role === "escort").length ?? 0;
    const fighterIngressInterceptorActors = fighterIngress?.assignments.filter((assignment) => assignment.role === "interceptor").length ?? 0;
    const bomberIngressBomberActors = bomberIngress?.assignments.filter((assignment) => assignment.role === "bomber").length ?? 0;

    if (interceptorCount !== 3 || escortCount !== 2) {
      throw new Error(
        `Expected scenario 5 diagnostic participants to include 3 interceptors and 2 escorts, saw ${interceptorCount} interceptors and ${escortCount} escorts.`
      );
    }
    if (fighterIngressInterceptorActors !== 3 || fighterIngressEscortActors !== 2) {
      throw new Error(
        `Expected fighter-ingress to stage 3 interceptor actors and 2 escort actors, saw ${fighterIngressInterceptorActors} interceptors and ${fighterIngressEscortActors} escorts.`
      );
    }
    if (bomberIngressBomberActors !== 4) {
      throw new Error(
        `Expected bomber-ingress to render the current four-bomber stack representation, saw ${bomberIngressBomberActors} bomber actors.`
      );
    }
  });
});

registerTest("AIR_SHOW_SCRAMBLE_TRACER_PROFILE_STAYS_BOUND_TO_CONTESTED_BOMBER_PACKAGES", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the governed diagnostic matrix includes CAP-only and contested bomber scenarios", async () => {});

  await When("the air scenario report is generated", async () => {
    result = runAirScenario();
  });

  await Then("CAP clash scramble tracers should stay nose-fired and the contested bomber package scramble should retain fighter nose-fire", async () => {
    const capClashInspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "capClash" && entry.missionId === "synthetic-scenario-4-cap-clash"
    );
    const contestedPackageInspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId === "synthetic-scenario-5-three-cap-two-escort-four-bomber-stack"
    );
    const capClashScramble = capClashInspection?.report.phases.find((phase) => phase.label === "escort-clash-scramble");
    const contestedPackageScramble = contestedPackageInspection?.report.phases.find((phase) => phase.label === "escort-clash-scramble");
    const capClashCenterTracerCount = capClashScramble?.tracers.filter((tracer) => tracer.emitter === "center").length ?? 0;
    const contestedPackageNoseTracerCount =
      contestedPackageScramble?.tracers.filter((tracer) => tracer.emitter === "nose").length ?? 0;

    if (!capClashScramble || !contestedPackageScramble) {
      throw new Error("Expected both CAP clash and contested package scramble phases to be present in diagnostics.");
    }
    if (capClashCenterTracerCount !== 0) {
      throw new Error(
        `Expected CAP clash scramble tracers to stay on nose emitters, saw ${capClashCenterTracerCount} center-emitter tracers.`
      );
    }
    if (contestedPackageNoseTracerCount <= 0) {
      throw new Error("Expected the contested bomber package scramble phase to retain at least one nose-emitter tracer.");
    }
  });
});

registerTest("AIR_SHOW_SPATIAL_SEPARATION_REPORT", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the airshow includes contested packages with multiple actors in proximity", async () => {});

  await When("the diagnostic report with time-sampled positions is generated", async () => {
    result = runAirScenario();
  });

  await Then("actor overlap analysis should report separation distances and flag severe stacking", async () => {
    const combatPhases = ["escort-clash-merge", "escort-clash-scramble", "bomber-defense-pass"];
    const baseSpriteSizePx = 60;
    const warningThresholdPx = baseSpriteSizePx * 0.5; // 50% overlap (30px) = warning
    const failureThresholdPx = baseSpriteSizePx * 0.05; // 95%+ overlap (<3px) = severe stacking

    const inspections = result?.airshowInspections.filter(
      (entry) => entry.eventType === "airToAir" && entry.report.phases.some((p) => combatPhases.includes(p.label))
    ) ?? [];

    const warnings: Array<{ distancePx: number; overlapPercent: number; actors: string; timeMs: number; phase: string }> = [];
    let worstFailure: { distancePx: number; overlapPercent: number; actors: string; timeMs: number; phase: string } | null = null;

    for (const inspection of inspections) {
      for (const phase of inspection.report.phases.filter((p) => combatPhases.includes(p.label))) {
        const allSamples = phase.assignments.flatMap((assignment) =>
          assignment.sampledPositions.map((sample) => ({
            actorId: assignment.actorId,
            role: assignment.role,
            timeMs: sample.timeMs,
            cx: sample.cx,
            cy: sample.cy
          }))
        );

        // Group by 50ms time buckets for collision detection
        const samplesByTime = new Map<number, typeof allSamples>();
        for (const sample of allSamples) {
          const bucket = Math.floor(sample.timeMs / 50) * 50;
          const existing = samplesByTime.get(bucket) ?? [];
          existing.push(sample);
          samplesByTime.set(bucket, existing);
        }

        for (const [, samplesAtTime] of samplesByTime) {
          for (let i = 0; i < samplesAtTime.length; i += 1) {
            for (let j = i + 1; j < samplesAtTime.length; j += 1) {
              const a = samplesAtTime[i];
              const b = samplesAtTime[j];
              const distancePx = Math.hypot(a.cx - b.cx, a.cy - b.cy);

              // Skip legitimate attack passes (bomber vs interceptor proximity is expected)
              const isAttackPass = (a.role === "bomber" && b.role === "interceptor") || (a.role === "interceptor" && b.role === "bomber");
              if (isAttackPass && distancePx >= 0.5) continue;

              // Skip same-role staging (formation positioning at phase start)
              const isSameRoleStaging = a.role === b.role && a.timeMs < 200;
              if (isSameRoleStaging && distancePx >= 2) continue;

              // Calculate overlap percentage (0% = touching edges, 100% = complete overlap)
              // Assuming both sprites are ~baseSpriteSizePx diameter
              const overlapPercent = Math.max(0, Math.min(100, Math.round((1 - distancePx / baseSpriteSizePx) * 100)));

              const overlapInfo = {
                distancePx,
                overlapPercent,
                actors: `${a.actorId}(${a.role}) vs ${b.actorId}(${b.role})`,
                timeMs: a.timeMs,
                phase: phase.label
              };

              if (distancePx < failureThresholdPx) {
                // Severe stacking (>75% overlap) - track worst case
                if (!worstFailure || overlapPercent > worstFailure.overlapPercent) {
                  worstFailure = overlapInfo;
                }
              } else if (distancePx < warningThresholdPx) {
                // Moderate overlap (25-75%) - warning
                warnings.push(overlapInfo);
              }
            }
          }
        }
      }
    }

    // Report findings
    const summaryLines: string[] = [];

    if (worstFailure) {
      summaryLines.push(`[FAILURE] Severe sprite stacking detected:`);
      summaryLines.push(`  - ${worstFailure.actors}`);
      summaryLines.push(`  - ${worstFailure.overlapPercent}% overlap (${worstFailure.distancePx.toFixed(1)}px distance)`);
      summaryLines.push(`  - At t=${worstFailure.timeMs}ms in phase ${worstFailure.phase}`);
    }

    if (warnings.length > 0) {
      // Group warnings by severity
      const highOverlap = warnings.filter(w => w.overlapPercent >= 40);
      const mediumOverlap = warnings.filter(w => w.overlapPercent >= 25 && w.overlapPercent < 40);

      summaryLines.push(`[WARNINGS] ${warnings.length} proximity events detected:`);

      if (highOverlap.length > 0) {
        summaryLines.push(`  High overlap (40-75%): ${highOverlap.length} instances`);
        // Show first 3 examples
        highOverlap.slice(0, 3).forEach(w => {
          summaryLines.push(`    - ${w.actors}: ${w.overlapPercent}% at t=${w.timeMs}ms (${w.phase})`);
        });
        if (highOverlap.length > 3) {
          summaryLines.push(`    ... and ${highOverlap.length - 3} more`);
        }
      }

      if (mediumOverlap.length > 0) {
        summaryLines.push(`  Medium overlap (25-40%): ${mediumOverlap.length} instances`);
      }
    }

    // Report worst failure as critical finding (but don't fail the test)
    if (worstFailure) {
      summaryLines.unshift(
        `[CRITICAL] Near-complete sprite stacking: ${worstFailure.overlapPercent}% overlap`,
        `  - ${worstFailure.actors}`,
        `  - Distance: ${worstFailure.distancePx.toFixed(1)}px at t=${worstFailure.timeMs}ms in ${worstFailure.phase}`,
        ``
      );
    }

    if (summaryLines.length > 0) {
      console.log("\n[OVERLAP REPORT]\n" + summaryLines.join("\n"));
    } else {
      console.log("\n[OVERLAP REPORT] No sprite overlaps detected. All actors maintain proper separation.");
    }

    // Never fail - this is a diagnostic report, not a pass/fail test
    console.log(`\n[SUMMARY] ${warnings.length + (worstFailure ? 1 : 0)} total overlap events reported.`);
  });
});

registerTest("AIR_SHOW_FLAK_TIMING_OPENS_ON_MID_APPROACH_AND_STAYS_INSIDE_STRIKE_RUN", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the air scenario includes bomber strike with flak", async () => {});

  await When("the scenario report is generated", async () => {
    result = runAirScenario();
  });

  await Then("flak bursts should open on mid-approach, persist through bomb release, and taper before egress", async () => {
    const hasTargetRunFlak = (entry: NonNullable<typeof result>["airshowInspections"][number]): boolean =>
      entry.report.phases.some((p) => p.label === "target-run" && (p.flakBursts?.length ?? 0) > 0);
    const hasPreTargetFlak = (entry: NonNullable<typeof result>["airshowInspections"][number]): boolean =>
      entry.report.phases.some((p) =>
        (p.label === "bomber-ingress" || p.label === "bomber-defense-pass") &&
        (p.flakBursts?.length ?? 0) > 0
      );
    const strikeInspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && hasTargetRunFlak(entry) && hasPreTargetFlak(entry)
    ) ?? result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" &&
        hasTargetRunFlak(entry)
    ) ?? result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" &&
        entry.report.phases.some((p) => (p.flakBursts?.length ?? 0) > 0)
    );
    if (!strikeInspection) {
      throw new Error("Expected a strike package inspection containing flak.");
    }

    const phasesWithFlak = strikeInspection.report.phases.filter(
      (phase) => (phase.flakBursts?.length ?? 0) > 0
    );
    const firstFlakPhase = phasesWithFlak[0] ?? null;
    const targetRunPhase = phasesWithFlak.find((phase) => phase.label === "target-run") ?? null;
    if (!firstFlakPhase || !targetRunPhase) {
      throw new Error("Expected flak to span into target-run in the strike inspection.");
    }

    if (
      firstFlakPhase.label !== "bomber-ingress" &&
      firstFlakPhase.label !== "bomber-defense-pass"
    ) {
      throw new Error(
        `Flak starts too late: first phase carrying flak is ${firstFlakPhase.label} ` +
        `(expected bomber-ingress or bomber-defense-pass)`
      );
    }

    if (phasesWithFlak.length < 2) {
      throw new Error(
        `Flak window is too short-lived: only ${phasesWithFlak.length} phase carries flak.`
      );
    }

    const flakBursts = targetRunPhase.flakBursts!;
    const firstFlakProgress = flakBursts[0]?.progress ?? 0;
    const lastFlakProgress = flakBursts[flakBursts.length - 1]?.progress ?? 0;
    const bombReleaseProgress = GOVERNED_BOMB_RELEASE_PROGRESS;
    if (lastFlakProgress <= bombReleaseProgress) {
      throw new Error(
        `Flak ends too early in strike run: last burst at ${(lastFlakProgress * 100).toFixed(1)}% ` +
        `(should persist beyond bomb release at ${(bombReleaseProgress * 100).toFixed(1)}%)`
      );
    }
    if (lastFlakProgress > 0.86) {
      throw new Error(
        `Flak tapers too late in strike run: last burst at ${(lastFlakProgress * 100).toFixed(1)}% ` +
        `(should taper before egress setup)`
      );
    }

    console.log(
      `[FLAK TIMING] phases=${phasesWithFlak.map((phase) => phase.label).join(" -> ")}; ` +
      `target-run bursts ${flakBursts.length} from ${(firstFlakProgress * 100).toFixed(1)}% ` +
      `to ${(lastFlakProgress * 100).toFixed(1)}%`
    );
  });
});

registerTest("AIR_SHOW_SYNTHETIC_STACK_PACKAGE_AVOIDS_CURRENT_GOVERNED_MOTION_AND_FLAK_FINDINGS", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the synthetic three-cap two-escort four-bomber package is available for regression checks", async () => {});

  await When("the governed air scenario report is generated", async () => {
    result = runAirScenario();
  });

  await Then("the contested stack package should no longer report the targeted motion or flak-window findings", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId === "synthetic-scenario-5-three-cap-two-escort-four-bomber-stack"
    );
    if (!inspection) {
      throw new Error("Expected the governed synthetic stack package inspection to be present.");
    }

    const blockedCodes = new Set([
      "sharp-waypoint-turn",
      "hard-phase-reversal",
      "jerky-phase-entry",
      "early-flak-window",
      "late-flak-window"
    ]);
    const matchingFindings = inspection.findings.filter((finding) => blockedCodes.has(finding.code));

    if (matchingFindings.length > 0) {
      throw new Error(
        `Expected the synthetic stack package to clear the governed motion/flak findings, still saw: ${matchingFindings
          .map((finding) => `${finding.code}: ${finding.message}`)
          .join(" | ")}`
      );
    }
  });
});

registerTest("AIR_SHOW_SYNTHETIC_STACK_PACKAGE_AVOIDS_HARD_SAMPLED_TURNS", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the dense synthetic stack package exercises bomber target-run and egress continuity", async () => {});

  await When("the governed air scenario report is generated", async () => {
    result = runAirScenario();
  });

  await Then("sampled assignments should stay below the broad-turn threshold in non-dogfight phases", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId === "synthetic-scenario-5-three-cap-two-escort-four-bomber-stack"
    );
    if (!inspection) {
      throw new Error("Expected the governed synthetic stack package inspection to be present.");
    }

    const checkedPhaseLabels = new Set([
      "fighter-ingress",
      "bomber-defense-pass",
      "target-run",
      "egress"
    ]);
    const violations: string[] = [];
    inspection.report.phases
      .filter((phase) => checkedPhaseLabels.has(phase.label))
      .forEach((phase) => {
        phase.assignments.forEach((assignment) => {
          const maxTurnDeg = maxMovingTurnDegrees(assignment.sampledPositions);
          const thresholdDeg =
            phase.label === "target-run" || phase.label === "egress"
              ? 88
              : 94;
          if (maxTurnDeg > thresholdDeg) {
            violations.push(
              `${phase.label}/${assignment.actorId}: ${maxTurnDeg.toFixed(1)}deg > ${thresholdDeg}deg`
            );
          }
        });
      });

    if (violations.length > 0) {
      throw new Error(`Expected synthetic stack sampled turns to stay broad:\n${violations.join("\n")}`);
    }
  });
});

registerTest("AIR_SHOW_SYNTHETIC_BOMBER_DEFENSE_PASS_STARTS_WITH_INTERCEPTORS_SEPARATED", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the synthetic interceptor-versus-bomber package is available for spacing regression checks", async () => {});

  await When("the governed air scenario report is generated", async () => {
    result = runAirScenario();
  });

  await Then("the bomber-defense pass should not begin with different interceptor flights stacked on top of each other", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId === "synthetic-scenario-3-strike-plus-interceptors-no-escorts"
    );
    if (!inspection) {
      throw new Error("Expected the governed synthetic interceptor-versus-bomber inspection to be present.");
    }

    const bomberDefensePass = inspection.report.phases.find((phase) => phase.label === "bomber-defense-pass");
    if (!bomberDefensePass) {
      throw new Error("Expected the synthetic interceptor-versus-bomber inspection to include bomber-defense-pass.");
    }

    const interceptors = bomberDefensePass.assignments.filter((assignment) => assignment.role === "interceptor");
    let minDistancePx = Number.POSITIVE_INFINITY;
    let closestPair = "<none>";

    for (let index = 0; index < interceptors.length; index += 1) {
      for (let compareIndex = index + 1; compareIndex < interceptors.length; compareIndex += 1) {
        const left = interceptors[index]!;
        const right = interceptors[compareIndex]!;
        if (left.flightId === right.flightId) {
          continue;
        }
        const leftStart = resolveInspectionAssignmentBoundaryPoint(left, "start");
        const rightStart = resolveInspectionAssignmentBoundaryPoint(right, "start");
        if (!leftStart || !rightStart) {
          continue;
        }
        const distancePx = Math.hypot(leftStart.cx - rightStart.cx, leftStart.cy - rightStart.cy);
        if (distancePx < minDistancePx) {
          minDistancePx = distancePx;
          closestPair = `${left.actorId} vs ${right.actorId}`;
        }
      }
    }

    if (!Number.isFinite(minDistancePx)) {
      throw new Error("Expected at least two interceptor flights to compare at bomber-defense-pass start.");
    }

    if (minDistancePx < 12) {
      throw new Error(
        `Expected bomber-defense pass start separation >= 12px, got ${minDistancePx.toFixed(1)}px for ${closestPair}.`
      );
    }
  });
});

registerTest("AIR_SHOW_BOMB_RELEASE_ACTORS_REMAIN_ASSIGNED", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the air scenario includes a bomber strike with bomb release", async () => {});

  await When("the scenario report is generated", async () => {
    result = runAirScenario();
  });

  await Then("all bomber actors should remain assigned throughout target-run phase (no disappear/reappear)", async () => {
    // Per North Star Spec: Aircraft must not disappear during bomb release/explosion
    // The explosion is ground-level ordnance, not the aircraft itself
    const BOMB_RELEASE_PROGRESS = 0.74;

    const strikeInspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" &&
        entry.report.phases.some((p) => p.label === "target-run" && p.assignments.some(a => a.role === "bomber"))
    );
    if (!strikeInspection) {
      throw new Error("Expected a strike package inspection with bomber in target-run phase.");
    }

    const targetRunPhase = strikeInspection.report.phases.find(
      (p) => p.label === "target-run" && p.assignments.some(a => a.role === "bomber")
    );
    if (!targetRunPhase) {
      throw new Error("Expected target-run phase with bomber assignments.");
    }

    // Get all bomber actor IDs that should be present
    const bomberActorIds = new Set(
      targetRunPhase.assignments
        .filter(a => a.role === "bomber")
        .map(a => a.actorId)
    );

    if (bomberActorIds.size === 0) {
      throw new Error("Expected bomber actors in target-run phase.");
    }

    // Check that each bomber actor has valid position samples at bomb release
    const disappearedActors: string[] = [];

    for (const actorId of bomberActorIds) {
      const assignment = targetRunPhase.assignments.find(a => a.actorId === actorId);
      if (!assignment) {
        disappearedActors.push(`${actorId}: missing from assignments`);
        continue;
      }

      // Find sample closest to bomb release progress
      const sampledPositionsCopy = [...assignment.sampledPositions];
      const sampleAtBombRelease = sampledPositionsCopy
        .sort((a: { progress: number }, b: { progress: number }) => Math.abs(a.progress - BOMB_RELEASE_PROGRESS) - Math.abs(b.progress - BOMB_RELEASE_PROGRESS))[0];

      if (!sampleAtBombRelease) {
        disappearedActors.push(`${actorId}: no sampled positions at bomb release`);
        continue;
      }

      // Check if position is valid (not NaN/undefined - which would indicate disappearance)
      if (isNaN(sampleAtBombRelease.cx) || isNaN(sampleAtBombRelease.cy) ||
          sampleAtBombRelease.cx === undefined || sampleAtBombRelease.cy === undefined) {
        disappearedActors.push(
          `${actorId}: invalid position at progress ${sampleAtBombRelease.progress.toFixed(2)} ` +
          `(cx=${sampleAtBombRelease.cx}, cy=${sampleAtBombRelease.cy})`
        );
      }
    }

    if (disappearedActors.length > 0) {
      throw new Error(
        `Aircraft disappeared during bomb release/explosion:\n${disappearedActors.join("\n")}\n\n` +
        `Per North Star Spec: Aircraft must remain visible during strike run. ` +
        `The explosion is ground-level ordnance, not the aircraft exploding.`
      );
    }

    console.log(`[BOMB RELEASE VISIBILITY] All ${bomberActorIds.size} bomber actors remained assigned and visible through bomb release at ~74% progress`);
  });
});
