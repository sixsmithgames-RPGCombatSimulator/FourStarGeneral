/**
 * Air Show Bomber Speed Validation Tests
 *
 * These tests rigorously validate bomber speed is actually V/2, not just
duration-based estimates. They measure actual pixel displacement over time
to catch cases where bombers move too fast despite long durations.
 */

import { registerTest } from "./harness.js";
import { requireContestedAirScenario, runAirScenario, sampleAirScenarioTrack, sampleSharedAirScenarioIngress } from "./airScenarioSupport.js";
import {
  AIR_SHOW_BOMBER_SPEED_PX_PER_MS,
  calculatePathLength,
  calculateObservedSpeed,
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
    const coordinatedPlan = requireContestedAirScenario(result);

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
    const bomberRoleDuringBomberIngress = bomberIngressAudit.roles.find(
      (role) => role.role === "bomber" && role.assignmentCount > 0
    );

    if (fighterRoles.length <= 0 || !bomberRoleDuringBomberIngress) {
      throw new Error("Expected coordinated timing audits for fighters and bombers.");
    }

    const fighterSpeed =
      fighterRoles.reduce((sum, role) => sum + role.realizedSpeedPxPerMs, 0) / fighterRoles.length;
    const bomberSpeed = bomberRoleDuringBomberIngress.realizedSpeedPxPerMs;
    const ratio = fighterSpeed / Math.max(bomberSpeed, 1e-6);

    console.log(`[BOMBER SPEED VALIDATION] Fighter ingress phase speed: ${fighterSpeed.toFixed(3)} px/ms`);
    console.log(`[BOMBER SPEED VALIDATION] Bomber ingress phase speed: ${bomberSpeed.toFixed(3)} px/ms`);
    console.log(`[BOMBER SPEED VALIDATION] Phase speed ratio: ${ratio.toFixed(2)}:1`);
    console.log(
      `[BOMBER SPEED VALIDATION] Bomber ingress target delta: ${bomberRoleDuringBomberIngress.speedDeltaPxPerMs.toFixed(3)} px/ms`
    );

    if (!Number.isFinite(fighterSpeed) || !Number.isFinite(bomberSpeed) || bomberSpeed <= 0) {
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

    // Independently measure displacement during the same visible ingress interval.
    const { fighterSamples, bomberSamples } = sampleSharedAirScenarioIngress(result);
    const observedFighterSpeed = calculateObservedSpeed(fighterSamples);
    const observedBomberSpeed = calculateObservedSpeed(bomberSamples);
    if (observedBomberSpeed <= 0 || observedFighterSpeed / observedBomberSpeed < 1.5
      || Math.abs(observedBomberSpeed - AIR_SHOW_BOMBER_SPEED_PX_PER_MS) > 0.015) {
      throw new Error(`Actual shared-window motion violates bomber V/2: fighter=${observedFighterSpeed}, bomber=${observedBomberSpeed} px/ms.`);
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
    const { sceneReport, sceneTimeline } = requireContestedAirScenario(result);
    const phases = sceneReport.phases;

    // Find dogfight phases where bombers should be visible and moving
    const dogfightPhases = phases.filter(p =>
      p.label.includes("clash") ||
      p.label.includes("merge") ||
      p.label === "fighter-defense-pass"
    );

    if (dogfightPhases.length === 0) {
      throw new Error("Expected dogfight phases in the contested package.");
    }

    const violations: string[] = [];
    let checkedBombers = 0;

    for (const phase of dogfightPhases) {
      if (phase.startTimeMs === undefined || phase.endTimeMs === undefined) {
        throw new Error(`Expected absolute timing for ${phase.label}.`);
      }
      const bomberTracks = sceneTimeline.tracks.filter((track) => track.role === "bomber"
        && track.visibleFromMs < phase.endTimeMs! && track.visibleUntilMs > phase.startTimeMs!);
      if (bomberTracks.length === 0) throw new Error(`Expected visible bombers during ${phase.label}.`);
      const expectedBomberSpeedPxPerMs = AIR_SHOW_BOMBER_SPEED_PX_PER_MS;
      const motionThresholdPxPerMs = Math.max(0.012, expectedBomberSpeedPxPerMs * 0.25);
      const sustainedSpeedFloorPxPerMs = Math.max(0.018, expectedBomberSpeedPxPerMs * 0.3);

      for (const track of bomberTracks) {
        checkedBombers++;
        const samples = sampleAirScenarioTrack(track,
          Math.max(phase.startTimeMs, track.visibleFromMs), Math.min(phase.endTimeMs, track.visibleUntilMs));

        // Check if bomber is actually moving, not just visible
        const isMoving = isActuallyMoving(samples, motionThresholdPxPerMs);
        const observedSpeed = calculateObservedSpeed(samples);

        if (!isMoving) {
          violations.push(
            `${phase.label}/${track.actorId}: BOMBER FROZEN ` +
            `(observed speed ${observedSpeed.toFixed(3)} px/ms, ` +
            `expected > ${motionThresholdPxPerMs.toFixed(3)} px/ms forward movement)`
          );
        } else if (observedSpeed < sustainedSpeedFloorPxPerMs) {
          violations.push(
            `${phase.label}/${track.actorId}: BOMBER MOVING TOO SLOW ` +
            `(${observedSpeed.toFixed(3)} px/ms)`
          );
        }

        console.log(`[BOMBER MOVEMENT] ${phase.label}/${track.actorId}: ` +
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
        `Expected bomber tracks overlapping the fighter dogfight intervals.`
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
    const { sceneTimeline } = requireContestedAirScenario(result);
    const { attackOrigin, target, axis } = sceneTimeline.geometry;
    const along = (point: { readonly cx: number; readonly cy: number }): number =>
      (point.cx - attackOrigin.cx) * axis.x + (point.cy - attackOrigin.cy) * axis.y;
    if (!Number.isFinite(along(target)) || along(target) <= 0) throw new Error("Expected a forward strike target axis.");

    const preTargetLabels = new Set(["fighter-ingress", "escort-clash-merge", "escort-clash-scramble", "bomber-ingress", "bomber-defense-pass"]);
    const windows = sceneTimeline.beats.filter((beat) => preTargetLabels.has(beat.label))
      .sort((left, right) => left.endTimeMs - right.endTimeMs);
    if (windows.length !== preTargetLabels.size) throw new Error("Expected all five pre-target timeline windows.");
    const violations: string[] = [];
    let furthestProgressPx = Number.NEGATIVE_INFINITY;
    // Retain the original strike-group maximum per phase and 12px tolerance.
    // Overlapping beats must be compared by completion time, not treated as a sequential phase list.
    for (const window of windows) {
      const samples = sceneTimeline.tracks.filter((track) => track.role === "bomber").flatMap((track) => {
        const targetRun = track.segments.find((segment) => segment.label === "target-run");
        if (!targetRun) throw new Error(`Missing target-run boundary for ${track.actorId}.`);
        const startTimeMs = Math.max(window.startTimeMs, track.visibleFromMs);
        const endTimeMs = Math.min(window.endTimeMs, track.visibleUntilMs, targetRun.startTimeMs);
        return endTimeMs > startTimeMs ? sampleAirScenarioTrack(track, startTimeMs, endTimeMs) : [];
      });
      if (samples.length === 0) throw new Error(`Expected visible pre-target bombers during ${window.label}.`);
      const progressPx = Math.max(...samples.map(along));
      if (progressPx < furthestProgressPx - PRE_TARGET_DISTANCE_TOLERANCE_PX) {
        violations.push(`strike-group: REGRESSED from ${furthestProgressPx.toFixed(1)}px to ${progressPx.toFixed(1)}px by ${window.label}`);
      }
      furthestProgressPx = Math.max(furthestProgressPx, progressPx);
    }

    if (violations.length > 0) {
      throw new Error(
        `BOMBER PROGRESS REGRESSIONS (${violations.length}):\n${violations.join("\n")}\n\n` +
        `Bombers must maintain continuous forward progress through the pre-target phases.`
      );
    }

    console.log(`[BOMBER PROGRESS] ✓ Bomber strike-group shows continuous axial pre-target progress`);
  });
});

registerTest("BOMBER_REACHES_STANDOFF_AT_PROGRESS_1_0_NOT_EARLIER", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("bombers reach standoff at progress 1.0 per spec", async () => {});

  await When("measuring bomber progress toward target", async () => {
    result = runAirScenario();
  });

  await Then("bombers must not reach target before completing ingress phase", async () => {
    const { sceneTimeline } = requireContestedAirScenario(result);
    let completedApproaches = 0;
    for (const track of sceneTimeline.tracks.filter((entry) => entry.role === "bomber")) {
      const ingress = track.segments.find((segment) => segment.label === "bomber-ingress");
      const defense = track.segments.find((segment) => segment.label === "bomber-defense-pass");
      const targetRun = track.segments.find((segment) => segment.label === "target-run");
      const standoff = targetRun?.points[0];
      if (!ingress || !defense || !targetRun || !standoff || Math.abs(defense.endTimeMs - targetRun.startTimeMs) > 0.001) {
        throw new Error(`Expected joined pre-target and target-run segments for ${track.actorId}.`);
      }
      const samples = sampleAirScenarioTrack(track, Math.max(ingress.startTimeMs, track.visibleFromMs),
        Math.min(defense.endTimeMs, track.visibleUntilMs));
      for (const sample of samples) {
        if (sample.timeMs < defense.endTimeMs - 0.001 && Math.hypot(sample.cx - standoff.cx, sample.cy - standoff.cy) < 0.001) {
          throw new Error(`${track.actorId} reached standoff before completing its pre-target approach.`);
        }
      }
      // A destroyed actor may disappear before standoff; every surviving approach must finish at the join.
      if (track.visibleUntilMs >= defense.endTimeMs) {
        completedApproaches += 1;
        const last = samples[samples.length - 1];
        if (Math.abs(last.segmentProgress - 1) > 0.000001 || Math.hypot(last.cx - standoff.cx, last.cy - standoff.cy) > 0.001) {
          throw new Error(`${track.actorId} did not reach standoff at the end of its actual pre-target segment.`);
        }
      }
    }
    if (completedApproaches === 0) throw new Error("Expected surviving bomber approaches to validate standoff timing.");
    console.log(`[BOMBER STANDOFF] ${completedApproaches} surviving approaches reach standoff at the segment join`);
  });
});

registerTest("SPEED_DIFFERENTIATION_VISIBLE_TO_PLAYER_NOT_JUST_THEORETICAL", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("speed differentiation must be visually apparent to players", async () => {});

  await When("comparing bomber and fighter travel distances inside the shared fighter-ingress window", async () => {
    result = runAirScenario();
  });

  await Then("fighter must cover significantly more distance than bomber in same duration", async () => {
    const { fighterSamples, bomberSamples, startTimeMs, endTimeMs } = sampleSharedAirScenarioIngress(result);
    const fighterDistance = calculatePathLength(fighterSamples);
    const bomberDistance = calculatePathLength(bomberSamples);
    const fighterDuration = endTimeMs - startTimeMs;
    const bomberDuration = endTimeMs - startTimeMs;

    console.log(`[VISIBLE DIFFERENTIATION] Fighter: ${fighterDistance.toFixed(0)}px in ${fighterDuration}ms`);
    console.log(`[VISIBLE DIFFERENTIATION] Bomber: ${bomberDistance.toFixed(0)}px in ${bomberDuration}ms`);

    // Key metric: in the shared fighter-ingress duration, fighters should cover
    // materially more ground than bombers.
    const fighterSpeed = fighterDistance / fighterDuration;
    const bomberSpeed = bomberDistance / bomberDuration;

    if (bomberSpeed <= 0 || fighterSpeed <= bomberSpeed) {
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
