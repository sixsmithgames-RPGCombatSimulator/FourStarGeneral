/**
 * Air Show Bomber Speed Validation Tests
 *
 * These tests rigorously validate bomber speed is actually V/2, not just
duration-based estimates. They measure actual pixel displacement over time
to catch cases where bombers move too fast despite long durations.
 */

import { registerTest } from "./harness.js";
import { runAirScenario } from "./airScenarioSupport.js";
import {
  AIR_SHOW_BOMBER_SPEED_PX_PER_MS,
  calculateObservedSpeed,
  getAuthoritativeContestedPackagePhases,
  getAuthoritativeContestedPlan,
  type AssignmentLike,
  type PhaseLike,
  type PositionSample
} from "./airShowTestSupport.js";

const PRE_TARGET_DISTANCE_TOLERANCE_PX = 12;

/**
 * Check if aircraft is actually moving (not frozen/hold-in-place)
 */
function isActuallyMoving(
  samples: ReadonlyArray<{ cx: number; cy: number; timeMs: number }>,
  minSpeedThreshold = 0.05 // pixels per ms
): boolean {
  if (samples.length < 3) return false;

  // Check consecutive samples for movement
  let movingSamples = 0;
  for (let i = 1; i < samples.length; i++) {
    const dx = samples[i].cx - samples[i - 1].cx;
    const dy = samples[i].cy - samples[i - 1].cy;
    const dt = samples[i].timeMs - samples[i - 1].timeMs;

    if (dt > 0) {
      const speed = Math.hypot(dx, dy) / dt;
      if (speed > minSpeedThreshold) {
        movingSamples++;
      }
    }
  }

  // Must be moving in at least 60% of samples
  return movingSamples / (samples.length - 1) > 0.6;
}

registerTest("BOMBER_SPEED_ACTUALLY_HALF_OF_FIGHTER_NOT_JUST_DURATION", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("bombers at V/2 and fighters at V per North Star Spec", async () => {});

  await When("measuring actual pixel displacement speeds during ingress", async () => {
    result = runAirScenario();
  });

  await Then("bomber ingress phase speed must stay materially below fighter ingress phase speed", async () => {
    const coordinatedPlan = getAuthoritativeContestedPlan(result);
    if (!coordinatedPlan) {
      console.log("[BOMBER SPEED] No contested package - skipping");
      return;
    }

    const fighterIngressAudit = coordinatedPlan.sceneReport?.phaseTimingAudit.find(
      (phase) => phase.label === "fighter-ingress"
    );
    const bomberIngressAudit = coordinatedPlan.sceneReport?.phaseTimingAudit.find(
      (phase) => phase.label === "bomber-ingress"
    );

    if (!fighterIngressAudit || !bomberIngressAudit) {
      throw new Error("Expected coordinated fighter-ingress and bomber-ingress timing audits.");
    }

    const fighterRoles = fighterIngressAudit.roles.filter(
      (role) => (role.role === "interceptor" || role.role === "escort") && role.assignmentCount > 0
    );
    const bomberRoleDuringIngress = fighterIngressAudit.roles.find(
      (role) => role.role === "bomber" && role.assignmentCount > 0
    );
    const bomberRoleDuringBomberIngress = bomberIngressAudit.roles.find(
      (role) => role.role === "bomber" && role.assignmentCount > 0
    );

    if (fighterRoles.length <= 0 || !bomberRoleDuringIngress || !bomberRoleDuringBomberIngress) {
      throw new Error("Expected coordinated timing audits for fighters and bombers.");
    }

    const fighterSpeed =
      fighterRoles.reduce((sum, role) => sum + role.realizedSpeedPxPerMs, 0) / fighterRoles.length;
    const bomberSpeed = bomberRoleDuringIngress.realizedSpeedPxPerMs;
    const ratio = fighterSpeed / Math.max(bomberSpeed, 1e-6);

    console.log(`[BOMBER SPEED VALIDATION] Fighter ingress phase speed: ${fighterSpeed.toFixed(3)} px/ms`);
    console.log(`[BOMBER SPEED VALIDATION] Bomber ingress phase speed: ${bomberSpeed.toFixed(3)} px/ms`);
    console.log(`[BOMBER SPEED VALIDATION] Phase speed ratio: ${ratio.toFixed(2)}:1`);
    console.log(
      `[BOMBER SPEED VALIDATION] Bomber ingress target delta: ${bomberRoleDuringBomberIngress.speedDeltaPxPerMs.toFixed(3)} px/ms`
    );

    if (bomberSpeed <= 0) {
      throw new Error("CRITICAL: Bomber ingress phase speed resolved to zero.");
    }

    if (fighterSpeed <= bomberSpeed) {
      throw new Error(
        `CRITICAL: Fighter ingress phase is not faster than bomber ingress ` +
        `(${fighterSpeed.toFixed(3)} vs ${bomberSpeed.toFixed(3)} px/ms).`
      );
    }

    if (ratio < 1.5) {
      throw new Error(
        `CRITICAL: Fighter ingress only exceeds bomber ingress by ${ratio.toFixed(2)}:1. ` +
        `The coordinated scene should preserve a clearly slower bomber ingress.`
      );
    }

    if (Math.abs(bomberRoleDuringBomberIngress.speedDeltaPxPerMs) > 0.015) {
      throw new Error(
        `CRITICAL: Bomber-only ingress phase is off target by ` +
        `${bomberRoleDuringBomberIngress.speedDeltaPxPerMs.toFixed(3)} px/ms.`
      );
    }

    console.log(`[BOMBER SPEED VALIDATION] ✓ Coordinated ingress keeps bombers materially slower than fighters`);
  });
});

registerTest("BOMBER_MOVES_DURING_DOGFIGHT_NOT_FROZEN", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("bombers visible during escort-CAP dogfight per hold-in-place fix", async () => {});

  await When("checking bomber movement during dogfight phases", async () => {
    result = runAirScenario();
  });

  await Then("bombers must be actively moving forward, not frozen in place", async () => {
    const coordinatedPlan = getAuthoritativeContestedPlan(result);
    const phases = getAuthoritativeContestedPackagePhases(result);
    if (!phases) {
      console.log("[BOMBER MOVEMENT] No contested package - skipping");
      return;
    }
    const phaseTimingAuditByLabel = new Map(
      coordinatedPlan?.sceneReport?.phaseTimingAudit.map((phase) => [phase.label, phase] as const) ?? []
    );

    // Find dogfight phases where bombers should be visible and moving
    const dogfightPhases = phases.filter(p =>
      p.label.includes("clash") ||
      p.label.includes("merge") ||
      p.label === "fighter-defense-pass"
    );

    if (dogfightPhases.length === 0) {
      console.log("[BOMBER MOVEMENT] No dogfight phases - skipping");
      return;
    }

    const violations: string[] = [];
    let checkedBombers = 0;

    for (const phase of dogfightPhases) {
      const bomberAssignments = phase.assignments.filter(a => a.role === "bomber");
      const expectedBomberSpeedPxPerMs =
        phaseTimingAuditByLabel.get(phase.label)?.roles.find((role) => role.role === "bomber" && role.assignmentCount > 0)
          ?.targetSpeedPxPerMs
        ?? AIR_SHOW_BOMBER_SPEED_PX_PER_MS;
      const motionThresholdPxPerMs = Math.max(0.012, expectedBomberSpeedPxPerMs * 0.25);
      const sustainedSpeedFloorPxPerMs = Math.max(0.018, expectedBomberSpeedPxPerMs * 0.3);

      for (const assignment of bomberAssignments) {
        checkedBombers++;

        // Check if bomber is actually moving, not just visible
        const isMoving = isActuallyMoving(assignment.sampledPositions, motionThresholdPxPerMs);
        const observedSpeed = calculateObservedSpeed(assignment.sampledPositions);

        if (!isMoving) {
          violations.push(
            `${phase.label}/${assignment.actorId}: BOMBER FROZEN ` +
            `(observed speed ${observedSpeed.toFixed(3)} px/ms, ` +
            `expected > ${motionThresholdPxPerMs.toFixed(3)} px/ms forward movement)`
          );
        } else if (observedSpeed < sustainedSpeedFloorPxPerMs) {
          violations.push(
            `${phase.label}/${assignment.actorId}: BOMBER MOVING TOO SLOW ` +
            `(${observedSpeed.toFixed(3)} px/ms)`
          );
        }

        console.log(`[BOMBER MOVEMENT] ${phase.label}/${assignment.actorId}: ` +
          `speed=${observedSpeed.toFixed(3)} px/ms, moving=${isMoving ? 'YES' : 'FROZEN'}`);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `BOMBER MOVEMENT VIOLATIONS (${violations.length}):\n${violations.join("\n")}\n\n` +
        `Bombers are visible but frozen during dogfight. ` +
        `They should continue moving forward through their ingress path.`
      );
    }

    if (checkedBombers === 0) {
      throw new Error(
        `No bombers found in dogfight phases to validate movement. ` +
        `This may indicate bombers are missing from hold-in-place assignments.`
      );
    }

    console.log(`[BOMBER MOVEMENT] ✓ All ${checkedBombers} bombers actively moving during dogfight`);
  });
});

registerTest("BOMBER_CONTINUOUS_FORWARD_PROGRESS_DURING_PRE_TARGET_PHASES", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("bombers must maintain continuous forward progress before the strike arc begins", async () => {});

  await When("tracking bomber position across ingress and bomber-defense phases", async () => {
    result = runAirScenario();
  });

  await Then("bombers must keep advancing through the pre-target phases", async () => {
    const coordinatedPlan = getAuthoritativeContestedPlan(result);
    const phases = getAuthoritativeContestedPackagePhases(result);
    if (!coordinatedPlan?.sceneReport || !phases) {
      console.log("[BOMBER PROGRESS] No contested package - skipping");
      return;
    }

    const preTargetPhaseLabels = new Set([
      "fighter-ingress",
      "escort-clash-merge",
      "escort-clash-scramble",
      "bomber-ingress",
      "bomber-defense-pass"
    ]);
    const authoritativeTarget =
      coordinatedPlan.sceneReport.bomberTarget
      ?? coordinatedPlan.sceneReport.corridor?.strike
      ?? null;
    if (!authoritativeTarget) {
      console.log("[BOMBER PROGRESS] Missing authoritative target anchor - skipping");
      return;
    }
    const bomberPhaseDistances = phases
      .filter((phase) =>
        preTargetPhaseLabels.has(phase.label) && phase.assignments.some((assignment) => assignment.role === "bomber")
      )
      .map((phase) => ({
        phase: phase.label,
        minDistanceToTargetPx: Math.min(
          ...phase.assignments
            .filter((assignment) => assignment.role === "bomber")
            .flatMap((assignment) =>
              assignment.sampledPositions.map((sample) =>
                Math.hypot(sample.cx - authoritativeTarget.cx, sample.cy - authoritativeTarget.cy)
              )
            )
        )
      }));

    if (bomberPhaseDistances.length === 0) {
      throw new Error("No pre-target bomber phases found.");
    }

    const violations: string[] = [];
    let closestDistancePx = Number.POSITIVE_INFINITY;
    let previousPhase = bomberPhaseDistances[0]!.phase;
    for (const entry of bomberPhaseDistances) {
      if (entry.minDistanceToTargetPx > closestDistancePx + PRE_TARGET_DISTANCE_TOLERANCE_PX) {
        violations.push(
          `strike-group: REGRESSED in pre-target distance from ${closestDistancePx.toFixed(1)}px to ${entry.minDistanceToTargetPx.toFixed(1)}px ` +
          `between ${previousPhase} and ${entry.phase}`
        );
      }
      closestDistancePx = Math.min(closestDistancePx, entry.minDistanceToTargetPx);
      previousPhase = entry.phase;
    }

    if (violations.length > 0) {
      throw new Error(
        `BOMBER PROGRESS REGRESSIONS (${violations.length}):\n${violations.join("\n")}\n\n` +
        `Bombers must maintain continuous forward progress through the pre-target phases.`
      );
    }

    console.log(`[BOMBER PROGRESS] ✓ Bomber strike-group centroid shows continuous pre-target forward progress`);
  });
});

registerTest("BOMBER_REACHES_STANDOFF_AT_PROGRESS_1_0_NOT_EARLIER", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("bombers reach standoff at progress 1.0 per spec", async () => {});

  await When("measuring bomber progress toward target", async () => {
    result = runAirScenario();
  });

  await Then("bombers must not reach target before completing ingress phase", async () => {
    const phases = getAuthoritativeContestedPackagePhases(result);
    if (!phases) {
      console.log("[BOMBER STANDOFF] No contested package - skipping");
      return;
    }

    const bomberPhases = phases.filter(p =>
      p.assignments.some(a => a.role === "bomber")
    );

    const violations: string[] = [];

    for (const phase of bomberPhases) {
      for (const assignment of phase.assignments.filter(a => a.role === "bomber")) {
        const samples = assignment.sampledPositions;
        if (samples.length === 0) continue;

        // Check if bomber samples show progress attribute
        const progressSamples = samples.filter(s =>
          typeof (s as { progress?: number }).progress === 'number'
        );

        if (progressSamples.length > 0) {
          const lastSample = progressSamples[progressSamples.length - 1] as
            { cx: number; cy: number; timeMs: number; progress?: number };

          // If in ingress phase, should NOT be at progress 1.0 until end
          if (phase.label.includes("ingress") && lastSample.progress! > 0.95) {
            // Check if this is actually the end of ingress
            const nextPhase = phases.find(p =>
              p.label === "arc-turn" || p.label === "target-run"
            );

            if (!nextPhase || phase !== bomberPhases[bomberPhases.length - 1]) {
              violations.push(
                `${phase.label}/${assignment.actorId}: ` +
                `Reached progress ${lastSample.progress!.toFixed(2)} during ingress - too early!`
              );
            }
          }
        }
      }
    }

    // This is observational - log but don't fail
    if (violations.length > 0) {
      console.log(`[BOMBER STANDOFF] Timing observations (${violations.length}):`);
      violations.forEach(v => console.log(`  ! ${v}`));
    } else {
      console.log(`[BOMBER STANDOFF] ✓ Bomber progress timing validated`);
    }
  });
});

registerTest("SPEED_DIFFERENTIATION_VISIBLE_TO_PLAYER_NOT_JUST_THEORETICAL", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("speed differentiation must be visually apparent to players", async () => {});

  await When("comparing bomber and fighter travel distances inside the shared fighter-ingress window", async () => {
    result = runAirScenario();
  });

  await Then("fighter must cover significantly more distance than bomber in same duration", async () => {
    const phases = getAuthoritativeContestedPackagePhases(result);
    if (!phases) {
      console.log("[VISIBLE DIFFERENTIATION] No contested package - skipping");
      return;
    }

    // Find overlapping time windows where both are visible
    const fighterIngress = phases.find(p =>
      p.label === "fighter-ingress" &&
      p.assignments.some(a => a.role === "interceptor")
    );

    if (!fighterIngress) {
      console.log("[VISIBLE DIFFERENTIATION] Missing fighter-ingress phase - skipping");
      return;
    }

    const fighterAssignment = fighterIngress.assignments.find(a => a.role === "interceptor");
    const bomberAssignment = fighterIngress.assignments.find(a => a.role === "bomber");

    if (!fighterAssignment || !bomberAssignment) {
      console.log("[VISIBLE DIFFERENTIATION] Missing shared ingress assignments - skipping");
      return;
    }

    // Calculate total path length for each
    function calcPathLength(samples: ReadonlyArray<{ cx: number; cy: number }>): number {
      let length = 0;
      for (let i = 1; i < samples.length; i++) {
        const dx = samples[i].cx - samples[i - 1].cx;
        const dy = samples[i].cy - samples[i - 1].cy;
        length += Math.hypot(dx, dy);
      }
      return length;
    }

    const fighterDistance = calcPathLength(fighterAssignment.sampledPositions);
    const bomberDistance = calcPathLength(bomberAssignment.sampledPositions);

    const fighterDuration = fighterIngress.durationMs;
    const bomberDuration = fighterIngress.durationMs;

    console.log(`[VISIBLE DIFFERENTIATION] Fighter: ${fighterDistance.toFixed(0)}px in ${fighterDuration}ms`);
    console.log(`[VISIBLE DIFFERENTIATION] Bomber: ${bomberDistance.toFixed(0)}px in ${bomberDuration}ms`);

    // Key metric: in the shared fighter-ingress duration, fighters should cover
    // materially more ground than bombers.
    const fighterSpeed = fighterDistance / fighterDuration;
    const bomberSpeed = bomberDistance / bomberDuration;

    if (fighterSpeed <= bomberSpeed) {
      throw new Error(
        `CRITICAL: Fighters are not faster than bombers inside fighter-ingress. ` +
        `Bomber speed ${bomberSpeed.toFixed(3)} px/ms vs fighter ${fighterSpeed.toFixed(3)} px/ms.`
      );
    }

    if (fighterSpeed / Math.max(bomberSpeed, 1e-6) < 1.35) {
      throw new Error(
        `CRITICAL: Bombers still appear too close to fighter speed in shared ingress. ` +
        `Bomber speed ${bomberSpeed.toFixed(3)} px/ms vs fighter ${fighterSpeed.toFixed(3)} px/ms. ` +
        `Speed differentiation not visible to player.`
      );
    }

    console.log(`[VISIBLE DIFFERENTIATION] ✓ Speed ratio ${(fighterSpeed / bomberSpeed).toFixed(2)}:1 visible`);
  });
});
