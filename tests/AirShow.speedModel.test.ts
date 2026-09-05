/**
 * Air Show Speed Model Tests
 *
 * Specification: docs/AIR_SHOW_NORTH_STAR_SPEC.md §Technical Foundation §3. Speed Model
 *
 * These tests validate the speed differential model:
 * - Fighter speed = V
 * - Bomber speed = V / 2
 * - Fighters (CAP/Escorts/Interceptors) maintain speed V for all legs
 */

import { registerTest } from "./harness.js";
import { requireContestedAirScenario, runAirScenario, sampleAirScenarioTrack, sampleSharedAirScenarioIngress } from "./airScenarioSupport.js";
import { buildCoordinatedAirClusterTimingPolicy } from "../src/ui/airshow/AirShowTimingPolicies.js";
import {
  AIR_SHOW_BOMBER_SPEED_PX_PER_MS,
  AIR_SHOW_EXPECTED_SPEED_RATIO,
  AIR_SHOW_FIGHTER_SPEED_PX_PER_MS,
  calculatePathLength,
  type AirScenarioResult
} from "./airShowTestSupport.js";

const PRE_TARGET_BOMBER_PHASES = new Set([
  "bomber-ingress",
  "bomber-defense-pass"
]);

registerTest("AIR_SHOW_SPEED_MODEL_FIGHTER_VS_BOMBER_RATIO", async ({ Given, When, Then }) => {
  let result: AirScenarioResult | null = null;

  await Given("the North Star Spec speed model: fighter at V, bomber at V/2", async () => {});

  await When("the contested package scenario is run with timing analysis", async () => {
    result = runAirScenario();
  });

  await Then("inspection timing should preserve fighter-faster-than-bomber ingress ordering while browser tests own the exact visible ratio", async () => {
    const { sceneReport } = requireContestedAirScenario(result);
    const phases = sceneReport.phases;

    const fighterIngress = phases.find((phase) => phase.label === "fighter-ingress");
    if (!fighterIngress) {
      throw new Error("Expected fighter-ingress phase.");
    }

    const phaseTimingAudit = sceneReport.phaseTimingAudit;
    const fighterIngressAudit = phaseTimingAudit.find((phase) => phase.label === "fighter-ingress");
    const fighterAudit = fighterIngressAudit?.roles.find((role) => role.role === "interceptor" && role.assignmentCount > 0);
    // Timeline v2 audits each role's own segment, even when those segments overlap in wall-clock time.
    const bomberAudit = phaseTimingAudit.find((phase) => phase.label === "bomber-ingress")
      ?.roles.find((role) => role.role === "bomber" && role.assignmentCount > 0);

    if (!fighterAudit || !bomberAudit) {
      throw new Error("Expected fighter and bomber timing audits in their respective ingress phases.");
    }

    const fighterSpeed = fighterAudit.realizedSpeedPxPerMs;
    const bomberSpeed = bomberAudit.realizedSpeedPxPerMs;

    if (!Number.isFinite(fighterSpeed) || !Number.isFinite(bomberSpeed) || fighterSpeed <= 0 || bomberSpeed <= 0) {
      throw new Error("Could not calculate speeds - insufficient samples.");
    }

    const actualRatio = fighterSpeed / bomberSpeed;
    if (actualRatio <= 1.15) {
      throw new Error(
        `Inspection timing inverted or collapsed ingress ordering. ` +
        `Expected fighters to remain materially faster than bombers, got ratio=${actualRatio.toFixed(2)}. ` +
        `Policy targets are fighter=${AIR_SHOW_FIGHTER_SPEED_PX_PER_MS.toFixed(3)} px/ms ` +
        `bomber=${AIR_SHOW_BOMBER_SPEED_PX_PER_MS.toFixed(3)} px/ms; exact visible ratio is enforced in browser choreography.`
      );
    }

    console.log(`[SPEED MODEL] Fighter speed: ${fighterSpeed.toFixed(2)} px/ms`);
    console.log(`[SPEED MODEL] Bomber speed: ${bomberSpeed.toFixed(2)} px/ms`);
    console.log(
      `[SPEED MODEL] Ratio: ${actualRatio.toFixed(2)} ` +
      `(expected ~${AIR_SHOW_EXPECTED_SPEED_RATIO.toFixed(2)})`
    );
  });
});

registerTest("AIR_SHOW_PRE_TARGET_PHASES_SCALE_TO_CANONICAL_BOMBER_PATH", async ({ Given, When, Then }) => {
  let result: AirScenarioResult | null = null;

  await Given("the bomber corridor to stand-off governs contested-package pre-target timing", async () => {});

  await When("the contested package scenario is run", async () => {
    result = runAirScenario();
  });

  await Then("pre-target bomber phases should add up to the sampled bomber corridor time while preserving a delayed bomber lead window", async () => {
    const coordinatedPlan = requireContestedAirScenario(result);
    const phaseTimingAudit = coordinatedPlan.sceneReport.phaseTimingAudit;
    const preTargetBomberAudits = phaseTimingAudit
      .filter((phase) => PRE_TARGET_BOMBER_PHASES.has(phase.label))
      .map((phase) => ({
        label: phase.label,
        bomber: phase.roles.find((role) => role.role === "bomber" && role.assignmentCount > 0)
      }))
      .filter((
        entry
      ): entry is { label: string; bomber: NonNullable<(typeof phaseTimingAudit)[number]["roles"][number]> } => !!entry.bomber);
    if (preTargetBomberAudits.length !== PRE_TARGET_BOMBER_PHASES.size) {
      throw new Error("Expected both bomber ingress and defense timing audits before target-run.");
    }

    const sampledBomberPathPx = preTargetBomberAudits.reduce((sum, phase) => {
      return sum + phase.bomber.meanPathLengthPx;
    }, 0);
    const sampledPreTargetDurationMs = preTargetBomberAudits.reduce((sum, phase) => {
      return sum + phase.bomber.realizedDurationMs;
    }, 0);
    const canonicalDurationMs = sampledBomberPathPx / AIR_SHOW_BOMBER_SPEED_PX_PER_MS;
    if (!Number.isFinite(canonicalDurationMs) || canonicalDurationMs <= 0
      || !Number.isFinite(sampledPreTargetDurationMs) || sampledPreTargetDurationMs <= 0) {
      throw new Error("Expected positive finite bomber corridor distance and active duration.");
    }
    const allowedDeltaMs = Math.max(140, canonicalDurationMs * 0.18);
    if (Math.abs(sampledPreTargetDurationMs - canonicalDurationMs) > allowedDeltaMs) {
      throw new Error(
        `Pre-target bomber active timing drifted from canonical corridor time. ` +
        `Observed active duration=${sampledPreTargetDurationMs.toFixed(0)}ms, canonical=${canonicalDurationMs.toFixed(0)}ms, ` +
        `delta=${Math.abs(sampledPreTargetDurationMs - canonicalDurationMs).toFixed(0)}ms.`
      );
    }

    const configuredLeadFloor = buildCoordinatedAirClusterTimingPolicy().bomberStartDelayMs;
    if (!Number.isFinite(coordinatedPlan.bomberStartDelayMs) || coordinatedPlan.bomberStartDelayMs < configuredLeadFloor) {
      throw new Error(
        `Expected coordinated bomber lead window >= ${configuredLeadFloor}ms, ` +
        `saw ${coordinatedPlan.bomberStartDelayMs}ms.`
      );
    }

    console.log(
      `[INGRESS DURATION] sampledActivePreTarget=${sampledPreTargetDurationMs.toFixed(0)}ms canonical=${canonicalDurationMs.toFixed(0)}ms ` +
      `path=${sampledBomberPathPx.toFixed(1)}px`
    );
    if (coordinatedPlan) {
      console.log(
        `[INGRESS DURATION] bomberLead=${coordinatedPlan.bomberStartDelayMs}ms ` +
        `(policy floor ${configuredLeadFloor}ms)`
      );
    }
  });
});

registerTest("AIR_SHOW_FIGHTER_VISIBLE_SPEED_DIFFERENTIATION", async ({ Given, When, Then }) => {
  let result: AirScenarioResult | null = null;

  await Given("fighters and bombers have overlapping active ingress intervals", async () => {});

  await When("the contested package with coordinated ingress is run", async () => {
    result = runAirScenario();
  });

  await Then("fighters should cover materially more shared-window path than bombers", async () => {
    const { fighterSamples, bomberSamples } = sampleSharedAirScenarioIngress(result);
    const fighterDistance = calculatePathLength(fighterSamples);
    const bomberDistance = calculatePathLength(bomberSamples);

    if (bomberDistance <= 0 || fighterDistance <= bomberDistance) {
      throw new Error(
        `Expected fighters to cover more ground in the shared ingress window, ` +
        `saw fighter=${fighterDistance.toFixed(1)}px bomber=${bomberDistance.toFixed(1)}px.`
      );
    }

    console.log(`[VISIBLE SPEED] fighter=${fighterDistance.toFixed(0)}px bomber=${bomberDistance.toFixed(0)}px`);
    console.log(`[VISIBLE SPEED] shared-window distance ratio ${(fighterDistance / bomberDistance).toFixed(2)}:1`);
  });
});

registerTest("AIR_SHOW_INGRESS_PHASES_TRACK_POLICY_SPEEDS_ACROSS_INSPECTIONS", async ({ Given, When, Then }) => {
  let result: AirScenarioResult | null = null;

  await Given("contested ingress phases should follow policy speeds instead of legacy duration floors", async () => {});

  await When("the air scenario is run with full package", async () => {
    result = runAirScenario();
  });

  await Then("ingress phases should stay positive and preserve role speeds across inspections", async () => {
    const inspections = result?.airshowInspections ?? [];
    requireContestedAirScenario(result);
    if (inspections.length === 0) throw new Error("Expected airshow inspections for ingress speed validation.");

    const violations: string[] = [];
    const observations: string[] = [];

    for (const inspection of inspections) {
      const ingressPhases = inspection.report.phases.filter(p =>
        p.label.includes("ingress")
      );
      if (ingressPhases.length === 0) {
        violations.push(`${inspection.missionId}: missing ingress phases`);
      }

      for (const phase of ingressPhases) {
        const hasFighters = phase.assignments.some(a =>
          a.role === "interceptor" || a.role === "escort"
        );
        const hasBombers = phase.assignments.some(a => a.role === "bomber");

        if (phase.label === "fighter-ingress") {
          observations.push(
            `${inspection.missionId}/${phase.label}: ${phase.durationMs}ms ` +
            `[fighters=${hasFighters} bombers=${hasBombers}]`
          );
        }

        if (phase.label === "bomber-ingress") {
          observations.push(
            `${inspection.missionId}/${phase.label}: ${phase.durationMs}ms ` +
            `[fighters=${hasFighters} bombers=${hasBombers}]`
          );
        }

        if (!Number.isFinite(phase.durationMs) || phase.durationMs <= 0) {
          violations.push(`${inspection.missionId}/${phase.label}: non-positive duration ${phase.durationMs}ms`);
        }

        for (const fighterRole of ["interceptor", "escort"] as const) {
          const fighterAssignments = phase.assignments.filter((assignment) => assignment.role === fighterRole);
          if (fighterAssignments.length === 0) continue;
          const phaseAudit = inspection.report.phaseTimingAudit.find((audit) => audit.label === phase.label);
          const fighterAudit = phaseAudit?.roles.find((role) => role.role === fighterRole && role.assignmentCount > 0);
          const meanFighterSpeed = fighterAudit?.realizedSpeedPxPerMs ?? 0;
          observations.push(
            `${inspection.missionId}/${phase.label}: ${fighterRole}=${meanFighterSpeed.toFixed(3)} px/ms`
          );
          if (phase.label === "fighter-ingress") {
            if (!Number.isFinite(meanFighterSpeed) || meanFighterSpeed < AIR_SHOW_FIGHTER_SPEED_PX_PER_MS * 0.75
              || meanFighterSpeed > AIR_SHOW_FIGHTER_SPEED_PX_PER_MS * 1.25) {
              violations.push(`${inspection.missionId}/${phase.label}: fighter speed ${meanFighterSpeed} px/ms out of range`);
            }
            const bomberAudit = inspection.report.phaseTimingAudit.find((audit) => audit.label === "bomber-ingress")
              ?.roles.find((role) => role.role === "bomber" && role.assignmentCount > 0);
            if (inspection.report.flights.some((flight) => flight.role === "bomber") && !bomberAudit) {
              violations.push(`${inspection.missionId}: missing bomber ingress timing audit`);
            }
            const bomberReferenceSpeed = bomberAudit?.realizedSpeedPxPerMs ?? null;
            if (bomberReferenceSpeed !== null && meanFighterSpeed <= bomberReferenceSpeed * 1.15) {
              violations.push(
                `${inspection.missionId}/${phase.label}: fighter ingress speed ordering collapsed ` +
                `(fighter=${meanFighterSpeed.toFixed(3)} px/ms bomber=${bomberReferenceSpeed.toFixed(3)} px/ms)`
              );
            }
          } else {
            const minimumFighterSpeed =
              phase.label === "bomber-ingress"
                ? AIR_SHOW_FIGHTER_SPEED_PX_PER_MS * 0.6
                : AIR_SHOW_FIGHTER_SPEED_PX_PER_MS * 0.75;
            const maximumFighterSpeed = AIR_SHOW_FIGHTER_SPEED_PX_PER_MS * 1.25;
            const bomberAudit = phaseAudit?.roles.find((role) => role.role === "bomber" && role.assignmentCount > 0);
            const bomberReferenceSpeed = bomberAudit?.realizedSpeedPxPerMs ?? null;
            if (
              !Number.isFinite(meanFighterSpeed) || meanFighterSpeed < minimumFighterSpeed
              || meanFighterSpeed > maximumFighterSpeed
            ) {
              violations.push(
                `${inspection.missionId}/${phase.label}: fighter speed ${meanFighterSpeed.toFixed(3)} px/ms out of range`
              );
            } else if (
              phase.label === "bomber-ingress"
              && bomberReferenceSpeed !== null
              && meanFighterSpeed <= bomberReferenceSpeed * 1.12
            ) {
              violations.push(
                `${inspection.missionId}/${phase.label}: bomber-ingress fighter cover collapsed too close to bomber speed ` +
                `(fighter=${meanFighterSpeed.toFixed(3)} px/ms bomber=${bomberReferenceSpeed.toFixed(3)} px/ms)`
              );
            }
          }
        }

        const bomberAssignments = phase.assignments.filter((assignment) => assignment.role === "bomber");
        if (bomberAssignments.length > 0) {
          const phaseAudit = inspection.report.phaseTimingAudit.find((audit) => audit.label === phase.label);
          const bomberAudit = phaseAudit?.roles.find((role) => role.role === "bomber" && role.assignmentCount > 0);
          const meanBomberSpeed = bomberAudit?.realizedSpeedPxPerMs ?? 0;
          observations.push(
            `${inspection.missionId}/${phase.label}: bomber=${meanBomberSpeed.toFixed(3)} px/ms`
          );
          if (
            !Number.isFinite(meanBomberSpeed) || meanBomberSpeed < AIR_SHOW_BOMBER_SPEED_PX_PER_MS * 0.7
            || meanBomberSpeed > AIR_SHOW_BOMBER_SPEED_PX_PER_MS * 1.3
          ) {
            violations.push(
              `${inspection.missionId}/${phase.label}: bomber speed ${meanBomberSpeed.toFixed(3)} px/ms out of range`
            );
          }
        }

        if (!hasFighters && !hasBombers) {
          violations.push(
            `${inspection.missionId}/${phase.label}: ingress phase reported without aircraft assignments`
          );
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(`Ingress duration violations:\n${violations.join("\n")}`);
    }

    console.log(`[INGRESS SPEEDS] All inspected ingress phases track policy speeds`);
    for (const observation of observations) {
      console.log(`  - ${observation}`);
    }
  });
});

registerTest("AIR_SHOW_SPEED_MODEL_PATH_LENGTH_DIFFERENTIATION", async ({ Given, When, Then }) => {
  let result: AirScenarioResult | null = null;

  await Given("fighter and bomber travel inside the same ingress phase window", async () => {});

  await When("the contested package is run", async () => {
    result = runAirScenario();
  });

  await Then("fighters should accumulate more shared-window path length than bombers", async () => {
    const { fighterSamples, bomberSamples } = sampleSharedAirScenarioIngress(result);
    const fighterPathLength = calculatePathLength(fighterSamples);
    const bomberPathLength = calculatePathLength(bomberSamples);

    if (bomberPathLength <= 0 || fighterPathLength <= bomberPathLength) {
      throw new Error(
        `Expected fighters to accumulate more shared-window path length than bombers, ` +
        `saw fighter=${fighterPathLength.toFixed(1)}px bomber=${bomberPathLength.toFixed(1)}px.`
      );
    }

    console.log(`[PATH LENGTH] Fighter path: ${fighterPathLength.toFixed(0)}px`);
    console.log(`[PATH LENGTH] Bomber path: ${bomberPathLength.toFixed(0)}px`);
    console.log(`[PATH LENGTH] Ratio: ${(fighterPathLength / bomberPathLength).toFixed(2)}:1`);
  });
});

registerTest("AIR_SHOW_ESCORTS_HAVE_CONTINUOUS_PRESENCE_ACROSS_PHASES", async ({ Given, When, Then }) => {
  let result: AirScenarioResult | null = null;

  await Given("escorts maintain fighter speed (V) and should remain continuous across contested-package phases", async () => {});

  await When("the contested package with escorts is run", async () => {
    result = runAirScenario();
  });

  await Then("escorts should be present across multiple phases (continuity, not teleport/disappear)", async () => {
    const { sceneReport, sceneTimeline } = requireContestedAirScenario(result);

    // Find escort assignments across phases
    const escortAssignments = sceneReport.phases.flatMap(p =>
      p.assignments.filter(a => a.role === "escort").map(a => ({
        phase: p.label,
        actorId: a.actorId,
        sampleCount: a.sampledPositions.length
      }))
    );

    if (escortAssignments.length === 0) {
      throw new Error("Expected escort assignments in contested package.");
    }

    // Group by actor to track through phases
    const byActor = new Map<string, Array<{ phase: string; sampleCount: number }>>();
    for (const a of escortAssignments) {
      const existing = byActor.get(a.actorId) ?? [];
      existing.push({ phase: a.phase, sampleCount: a.sampleCount });
      byActor.set(a.actorId, existing);
    }

    // Validate escorts appear in multiple phases (showing continuity through transition)
    let continuousEscorts = 0;
    for (const [, phases] of byActor) {
      if (phases.some((phase) => phase.sampleCount < 2)) {
        throw new Error("Expected sampled motion for each escort phase assignment.");
      }
      if (phases.length >= 2) {
        continuousEscorts++;
      }
    }

    if (continuousEscorts === 0 || continuousEscorts !== byActor.size) {
      throw new Error(`Expected every escort to continue across multiple phases, saw ${continuousEscorts}/${byActor.size}.`);
    }
    // Beat windows overlap, so continuity is checked at the actor's actual segment joins.
    for (const track of sceneTimeline.tracks.filter((entry) => entry.role === "escort")) {
      if (track.segments.length < 2 || !byActor.has(track.actorId)) {
        throw new Error(`Expected continuous inspection coverage for escort ${track.actorId}.`);
      }
      for (let index = 1; index < track.segments.length; index += 1) {
        const previous = track.segments[index - 1];
        const current = track.segments[index];
        const previousPoint = previous.points[previous.points.length - 1];
        const currentPoint = current.points[0];
        if (!previousPoint || !currentPoint || Math.abs(previous.endTimeMs - current.startTimeMs) > 0.001
          || Math.hypot(previousPoint.cx - currentPoint.cx, previousPoint.cy - currentPoint.cy) > 0.001) {
          throw new Error(`Escort ${track.actorId} jumps or disappears between ${previous.label} and ${current.label}.`);
        }
      }
    }

    console.log(`[ESCORT SPEED] ${byActor.size} unique escort actors tracked`);
    console.log(`  - Continuous through multiple phases: ${continuousEscorts}`);
  });
});

registerTest("AIR_SHOW_CAP_COMBAT_PHASES_STAY_IN_PURPOSEFUL_MOTION", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("compact merge shaping may slow CAP locally, but combat phases should stay purposeful", async () => {});

  await When("the contested package with CAP is run", async () => {
    result = runAirScenario();
  });

  await Then("CAP should keep moving through combat phases without falling into slow loiter outside compact merge work", async () => {
    const { sceneTimeline } = requireContestedAirScenario(result);

    // Calculate CAP speed in different phases
    const combatPhases = sceneTimeline.tracks.filter((track) => track.role === "interceptor")
      .flatMap((track) => track.segments.filter((segment) =>
        segment.label.includes("clash") || segment.label.includes("merge") || segment.label.includes("scramble")
        || segment.label.includes("defense")
      ).map((segment) => ({ track, segment })));

    if (combatPhases.length === 0) {
      throw new Error("Expected CAP combat segments in the contested timeline.");
    }

    const speeds: Array<{ phase: string; speed: number }> = [];

    for (const phase of combatPhases) {
      const startTimeMs = Math.max(phase.segment.startTimeMs, phase.track.visibleFromMs);
      const endTimeMs = Math.min(phase.segment.endTimeMs, phase.track.visibleUntilMs);
      // Destroyed aircraft have no visible later combat interval to measure.
      if (endTimeMs <= startTimeMs) continue;

      // Calculate average speed
      let totalDistance = 0;
      let totalTime = 0;
      const samples = sampleAirScenarioTrack(phase.track, startTimeMs, endTimeMs);
      for (let i = 1; i < samples.length; i++) {
        const dx = samples[i].cx - samples[i - 1].cx;
        const dy = samples[i].cy - samples[i - 1].cy;
        const dt = samples[i].timeMs - samples[i - 1].timeMs;
        totalDistance += Math.hypot(dx, dy);
        totalTime += dt;
      }

      const avgSpeed = totalTime > 0 ? totalDistance / totalTime : 0;
      speeds.push({ phase: `${phase.segment.label}/${phase.track.actorId}`, speed: avgSpeed });
    }

    if (speeds.length === 0) {
      throw new Error("Expected visible CAP combat samples for speed validation.");
    }

    const violations = speeds.flatMap(({ phase, speed }) => {
      const isCompactMergePhase = phase.includes("merge");
      const minimumSpeed =
        AIR_SHOW_FIGHTER_SPEED_PX_PER_MS * (isCompactMergePhase ? 0.25 : 0.55);
      const maximumSpeed = AIR_SHOW_FIGHTER_SPEED_PX_PER_MS * 1.35;
      const failures: string[] = [];
      if (!Number.isFinite(speed) || speed < minimumSpeed) {
        failures.push(
          `${phase}: CAP speed ${speed.toFixed(2)} px/ms below minimum ${minimumSpeed.toFixed(2)} px/ms`
        );
      }
      if (speed > maximumSpeed) {
        failures.push(
          `${phase}: CAP speed ${speed.toFixed(2)} px/ms above maximum ${maximumSpeed.toFixed(2)} px/ms`
        );
      }
      return failures;
    });

    if (violations.length > 0) {
      throw new Error(`CAP combat phase speed violations:\n${violations.join("\n")}`);
    }

    console.log(`[CAP SPEED] Purposeful motion across ${speeds.length} combat phases`);
    speeds.forEach(({ phase, speed }) => {
      console.log(`  - ${phase}: ${speed.toFixed(2)} px/ms`);
    });
  });
});
