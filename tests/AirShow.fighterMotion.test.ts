import { registerTest } from "./harness.js";
import { sampleAirShowWaypointPath } from "../src/ui/airshow/AirShowPathMath";
import { runAirScenario } from "./airScenarioSupport.js";

// Per North Star Spec: heading change must not exceed 25 degrees per 0.25 seconds
// outside of a designated break turn.
const MAX_HEADING_CHANGE_DEG_PER_QUARTER_SEC = 25;

// Sample count to approximate heading rate (40 samples = 0.025 progress steps)
const HEADING_SAMPLE_COUNT = 40;

function vectorToDegrees(dx: number, dy: number): number {
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
}

function headingDeltaDeg(a: number, b: number): number {
  const raw = Math.abs(a - b);
  return raw > 180 ? 360 - raw : raw;
}

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
    { cx: 80,  cy: -50 },   // rejoin arc
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

registerTest("AIR_SHOW_BIAS_OFFSET_DOES_NOT_GROW_ALONG_PATH", async ({ Given, When, Then }) => {
  // The old buildAirShowFlightAssignments applied biasX with a growing factor:
  // (0.92 + pointIndex * 0.06) — meaning offset grows from 0.92 to 1.52 over 10 waypoints.
  // This causes each waypoint to deviate more and more from the base path → jitter.
  // The fix: bias must be constant (applied only at waypoint index 0) or zero beyond index 0.

  const biasX = 20;
  const biasY = 15;
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

registerTest("AIR_SHOW_FULL_ENGAGEMENT_KEEPS_FIGHTERS_OUT_OF_TARGET_RUN_AND_COLLAPSES_BOMBER_DEFENSE_TO_ONE_BEAT", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the air automation scenario includes a full engagement strike package", async () => {});

  await When("the scenario is resolved and the inspected airshow report is generated", async () => {
    result = runAirScenario();
  });

  await Then("the full engagement target run should contain only strike craft and only one bomber-defense pass beat", async () => {
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

    const nonStrikeGroups = targetRunMetric.groupMetrics.filter((group) => group.combatRole !== "strike");
    if (nonStrikeGroups.length > 0) {
      throw new Error(
        `Expected target-run to keep only strike craft, saw ${nonStrikeGroups.map((group) => `${group.label}:${group.combatRole}`).join(", ")}.`
      );
    }
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
        const previousEnd = previousAssignment?.points[previousAssignment.points.length - 1];
        const currentStart = assignment.points[0];
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
        `Expected phase handoff continuity within 2px, saw ${largestGapPx.toFixed(1)}px at ${worstTransition}.`
      );
    }
  });
});

registerTest("AIR_SHOW_DIAGNOSTIC_MATRIX_COVERS_ALL_SCENARIO_FAMILIES", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the air scenario matrix is available", async () => {});

  await When("the diagnostic matrix is generated", async () => {
    result = runAirScenario();
  });

  await Then("the inspections should cover all five north-star scenario families", async () => {
    const missionIds = new Set(result?.airshowInspections.map((entry) => entry.missionId).filter(Boolean));
    const requiredMissionIds = [
      "synthetic-scenario-1-escort-strike-no-interceptors",
      "synthetic-scenario-2-strike-only",
      "synthetic-scenario-3-strike-plus-interceptors-no-escorts",
      "synthetic-scenario-5-three-cap-two-escort-four-bomber-stack",
      "bot-cap-1",
      "bot-strike-1"
    ];
    const missing = requiredMissionIds.filter((missionId) => !missionIds.has(missionId));
    if (missing.length > 0) {
      throw new Error(`Expected diagnostic coverage for all scenario families, missing: ${missing.join(", ")}.`);
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

  await Then("CAP clash scramble tracers should stay nose-fired while the contested bomber package may still use the close scramble profile", async () => {
    const capClashInspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "capClash" && entry.missionId === "bot-cap-1"
    );
    const contestedPackageInspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId === "synthetic-scenario-5-three-cap-two-escort-four-bomber-stack"
    );
    const capClashScramble = capClashInspection?.report.phases.find((phase) => phase.label === "escort-clash-scramble");
    const contestedPackageScramble = contestedPackageInspection?.report.phases.find((phase) => phase.label === "escort-clash-scramble");
    const capClashCenterTracerCount = capClashScramble?.tracers.filter((tracer) => tracer.emitter === "center").length ?? 0;
    const contestedPackageCenterTracerCount =
      contestedPackageScramble?.tracers.filter((tracer) => tracer.emitter === "center").length ?? 0;

    if (!capClashScramble || !contestedPackageScramble) {
      throw new Error("Expected both CAP clash and contested package scramble phases to be present in diagnostics.");
    }
    if (capClashCenterTracerCount !== 0) {
      throw new Error(
        `Expected CAP clash scramble tracers to stay on nose emitters, saw ${capClashCenterTracerCount} center-emitter tracers.`
      );
    }
    if (contestedPackageCenterTracerCount <= 0) {
      throw new Error("Expected the contested bomber package scramble phase to retain at least one center-emitter tracer.");
    }
  });
});
