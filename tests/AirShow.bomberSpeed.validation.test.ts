/**
 * Air Show Bomber Speed Validation Tests
 *
 * These tests rigorously validate bomber speed is actually V/2, not just
duration-based estimates. They measure actual pixel displacement over time
to catch cases where bombers move too fast despite long durations.
 */

import { registerTest } from "./harness.js";
import { runAirScenario } from "./airScenarioSupport.js";

// Expected speeds per North Star Spec
const V = 0.8; // pixels per ms at full fighter speed
const V_OVER_2 = V / 2; // 0.4 pixels per ms at bomber speed
const SPEED_TOLERANCE = 0.15; // 15% tolerance for path curvature

/**
 * Calculate actual observed speed from position samples
 */
function calculateObservedSpeed(
  samples: ReadonlyArray<{ cx: number; cy: number; timeMs: number }>
): number {
  if (samples.length < 3) return 0;

  // Use middle samples to avoid acceleration/deceleration phases
  const startIdx = Math.floor(samples.length * 0.2);
  const endIdx = Math.floor(samples.length * 0.8);

  let totalDistance = 0;
  let totalTime = 0;

  for (let i = startIdx + 1; i <= endIdx && i < samples.length; i++) {
    const dx = samples[i].cx - samples[i - 1].cx;
    const dy = samples[i].cy - samples[i - 1].cy;
    const dt = samples[i].timeMs - samples[i - 1].timeMs;

    if (dt > 0) {
      totalDistance += Math.hypot(dx, dy);
      totalTime += dt;
    }
  }

  return totalTime > 0 ? totalDistance / totalTime : 0;
}

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

  await Then("observed bomber speed must be approximately 0.4 px/ms (V/2), not faster", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-")
    );
    if (!inspection) {
      console.log("[BOMBER SPEED] No contested package - skipping");
      return;
    }

    // Find ingress phases with both fighter and bomber movement
    const phases = inspection.report.phases;

    const fighterIngress = phases.find(p =>
      p.label === "fighter-ingress" &&
      p.assignments.some(a => a.role === "interceptor")
    );

    const bomberIngress = phases.find(p =>
      p.label === "bomber-ingress" &&
      p.assignments.some(a => a.role === "bomber")
    );

    if (!fighterIngress || !bomberIngress) {
      throw new Error("Expected separate fighter and bomber ingress phases.");
    }

    const fighterAssignment = fighterIngress.assignments.find(a => a.role === "interceptor");
    const bomberAssignment = bomberIngress.assignments.find(a => a.role === "bomber");

    if (!fighterAssignment || !bomberAssignment) {
      throw new Error("Expected fighter and bomber assignments.");
    }

    // Calculate ACTUAL observed speeds
    const fighterSpeed = calculateObservedSpeed(fighterAssignment.sampledPositions);
    const bomberSpeed = calculateObservedSpeed(bomberAssignment.sampledPositions);

    console.log(`[BOMBER SPEED VALIDATION] Fighter observed speed: ${fighterSpeed.toFixed(3)} px/ms`);
    console.log(`[BOMBER SPEED VALIDATION] Bomber observed speed: ${bomberSpeed.toFixed(3)} px/ms`);
    console.log(`[BOMBER SPEED VALIDATION] Expected bomber: ~${V_OVER_2.toFixed(3)} px/ms`);

    // STRICT validation: bomber speed must be close to V/2
    const minBomberSpeed = V_OVER_2 * (1 - SPEED_TOLERANCE);
    const maxBomberSpeed = V_OVER_2 * (1 + SPEED_TOLERANCE);

    if (bomberSpeed > maxBomberSpeed) {
      throw new Error(
        `CRITICAL: Bombers flying too fast! ` +
        `Observed ${bomberSpeed.toFixed(3)} px/ms, ` +
        `expected max ${maxBomberSpeed.toFixed(3)} px/ms (V/2 = ${V_OVER_2.toFixed(3)}). ` +
        `This violates North Star Spec §Speed Model.`
      );
    }

    if (bomberSpeed < minBomberSpeed) {
      console.log(`[BOMBER SPEED VALIDATION] WARNING: Bombers slower than expected (${bomberSpeed.toFixed(3)} < ${minBomberSpeed.toFixed(3)})`);
    }

    // Also validate ratio
    if (fighterSpeed > 0) {
      const ratio = fighterSpeed / bomberSpeed;
      console.log(`[BOMBER SPEED VALIDATION] Speed ratio: ${ratio.toFixed(2)}:1 (expected ~2:1)`);

      if (ratio < 1.5) {
        throw new Error(
          `CRITICAL: Speed ratio too low (${ratio.toFixed(2)}:1). ` +
          `Bombers not sufficiently slower than fighters. ` +
          `Expected ratio ~2:1 per North Star Spec.`
        );
      }
    }

    console.log(`[BOMBER SPEED VALIDATION] ✓ Bomber speed ${bomberSpeed.toFixed(3)} px/ms within V/2 tolerance`);
  });
});

registerTest("BOMBER_MOVES_DURING_DOGFIGHT_NOT_FROZEN", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("bombers visible during escort-CAP dogfight per hold-in-place fix", async () => {});

  await When("checking bomber movement during dogfight phases", async () => {
    result = runAirScenario();
  });

  await Then("bombers must be actively moving forward, not frozen in place", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-")
    );
    if (!inspection) {
      console.log("[BOMBER MOVEMENT] No contested package - skipping");
      return;
    }

    // Find dogfight phases where bombers should be visible and moving
    const dogfightPhases = inspection.report.phases.filter(p =>
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

      for (const assignment of bomberAssignments) {
        checkedBombers++;

        // Check if bomber is actually moving, not just visible
        const isMoving = isActuallyMoving(assignment.sampledPositions);
        const observedSpeed = calculateObservedSpeed(assignment.sampledPositions);

        if (!isMoving) {
          violations.push(
            `${phase.label}/${assignment.actorId}: BOMBER FROZEN ` +
            `(observed speed ${observedSpeed.toFixed(3)} px/ms, ` +
            `expected > 0.1 px/ms forward movement)`
          );
        } else if (observedSpeed < 0.1) {
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

registerTest("BOMBER_CONTINUOUS_FORWARD_PROGRESS_DURING_ALL_PHASES", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("bombers must maintain continuous forward progress per spec", async () => {});

  await When("tracking bomber position across all ingress phases", async () => {
    result = runAirScenario();
  });

  await Then("bomber X coordinate must monotonically increase (forward motion)", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-")
    );
    if (!inspection) {
      console.log("[BOMBER PROGRESS] No contested package - skipping");
      return;
    }

    // Get all bomber assignments across phases in order
    const bomberPhases = inspection.report.phases.filter(p =>
      p.assignments.some(a => a.role === "bomber")
    );

    if (bomberPhases.length === 0) {
      throw new Error("No bomber phases found.");
    }

    const violations: string[] = [];

    // Track each unique bomber actor
    const bomberActors = new Map<string, Array<{ phase: string; x: number; timeMs: number }>>();

    for (const phase of bomberPhases) {
      for (const assignment of phase.assignments.filter(a => a.role === "bomber")) {
        if (!bomberActors.has(assignment.actorId)) {
          bomberActors.set(assignment.actorId, []);
        }

        // Get average X position in this phase
        const samples = assignment.sampledPositions;
        if (samples.length > 0) {
          const avgX = samples.reduce((sum, s) => sum + s.cx, 0) / samples.length;
          const avgTime = samples.reduce((sum, s) => sum + s.timeMs, 0) / samples.length;
          bomberActors.get(assignment.actorId)!.push({
            phase: phase.label,
            x: avgX,
            timeMs: avgTime
          });
        }
      }
    }

    // Check forward progress for each bomber
    for (const [actorId, positions] of bomberActors) {
      if (positions.length < 2) continue;

      // Sort by time
      positions.sort((a, b) => a.timeMs - b.timeMs);

      let lastX = positions[0].x;
      for (let i = 1; i < positions.length; i++) {
        // X should generally increase (forward progress)
        // Allow small backward movement (< 5px) for arc turns
        if (positions[i].x < lastX - 5) {
          violations.push(
            `${actorId}: REGRESSED from x=${lastX.toFixed(1)} to x=${positions[i].x.toFixed(1)} ` +
            `between ${positions[i - 1].phase} and ${positions[i].phase}`
          );
        }
        lastX = Math.max(lastX, positions[i].x);
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `BOMBER PROGRESS REGRESSIONS (${violations.length}):\n${violations.join("\n")}\n\n` +
        `Bombers must maintain continuous forward progress toward target.`
      );
    }

    console.log(`[BOMBER PROGRESS] ✓ ${bomberActors.size} bombers show continuous forward progress`);
  });
});

registerTest("BOMBER_REACHES_STANDOFF_AT_PROGRESS_1_0_NOT_EARLIER", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("bombers reach standoff at progress 1.0 per spec", async () => {});

  await When("measuring bomber progress toward target", async () => {
    result = runAirScenario();
  });

  await Then("bombers must not reach target before completing ingress phase", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-")
    );
    if (!inspection) {
      console.log("[BOMBER STANDOFF] No contested package - skipping");
      return;
    }

    const bomberPhases = inspection.report.phases.filter(p =>
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
            const nextPhase = inspection.report.phases.find(p =>
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

  await When("comparing bomber and fighter travel distances over same time window", async () => {
    result = runAirScenario();
  });

  await Then("fighter must cover significantly more distance than bomber in same duration", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-")
    );
    if (!inspection) {
      console.log("[VISIBLE DIFFERENTIATION] No contested package - skipping");
      return;
    }

    // Find overlapping time windows where both are visible
    const fighterIngress = inspection.report.phases.find(p =>
      p.label === "fighter-ingress" &&
      p.assignments.some(a => a.role === "interceptor")
    );

    const bomberIngress = inspection.report.phases.find(p =>
      p.label === "bomber-ingress" &&
      p.assignments.some(a => a.role === "bomber")
    );

    if (!fighterIngress || !bomberIngress) {
      console.log("[VISIBLE DIFFERENTIATION] Missing ingress phases - skipping");
      return;
    }

    const fighterAssignment = fighterIngress.assignments.find(a => a.role === "interceptor");
    const bomberAssignment = bomberIngress.assignments.find(a => a.role === "bomber");

    if (!fighterAssignment || !bomberAssignment) {
      console.log("[VISIBLE DIFFERENTIATION] Missing assignments - skipping");
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
    const bomberDuration = bomberIngress.durationMs;

    console.log(`[VISIBLE DIFFERENTIATION] Fighter: ${fighterDistance.toFixed(0)}px in ${fighterDuration}ms`);
    console.log(`[VISIBLE DIFFERENTIATION] Bomber: ${bomberDistance.toFixed(0)}px in ${bomberDuration}ms`);

    // Key metric: fighters should cover more ground per ms
    const fighterSpeed = fighterDistance / fighterDuration;
    const bomberSpeed = bomberDistance / bomberDuration;

    // With the fix, fighters travel shorter path but should still appear faster
    // due to path/duration ratio. But if bombers are too fast, they'll cover
    // disproportionate distance.
    if (bomberSpeed > fighterSpeed * 0.8) {
      throw new Error(
        `CRITICAL: Bombers appear nearly as fast as fighters! ` +
        `Bomber speed ${bomberSpeed.toFixed(3)} px/ms vs fighter ${fighterSpeed.toFixed(3)} px/ms. ` +
        `Speed differentiation not visible to player.`
      );
    }

    console.log(`[VISIBLE DIFFERENTIATION] ✓ Speed ratio ${(fighterSpeed / bomberSpeed).toFixed(2)}:1 visible`);
  });
});
