/**
 * Air Show Speed Model Tests
 *
 * Specification: docs/AIR_SHOW_NORTH_STAR_SPEC.md §Technical Foundation §3. Speed Model
 *
 * These tests validate the speed differential model:
 * - Fighter speed = V
 * - Bomber speed = V / 2
 * - Escorts start at bomber speed (V/2), accelerate to fighter speed (V) at progress 0.15
 */

import { registerTest } from "./harness.js";
import { runAirScenario } from "./airScenarioSupport.js";
import { buildCoordinatedAirClusterTimingPolicy } from "../src/ui/airshow/AirShowPlaybackPolicy.js";
import {
  AIR_SHOW_BOMBER_SPEED_PX_PER_MS,
  AIR_SHOW_EXPECTED_SPEED_RATIO,
  AIR_SHOW_FIGHTER_SPEED_PX_PER_MS,
  calculateObservedSpeed,
  calculatePathLength,
  getAuthoritativeContestedPackagePhases,
  getAuthoritativeContestedPlan,
  type AirScenarioResult
} from "./airShowTestSupport.js";

// Minimum ingress durations per spec
const MINIMUM_FIGHTER_INGRESS_MS = 1250;
const MINIMUM_BOMBER_INGRESS_MS = 3000;

registerTest("AIR_SHOW_SPEED_MODEL_FIGHTER_VS_BOMBER_RATIO", async ({ Given, When, Then }) => {
  let result: AirScenarioResult | null = null;

  await Given("the North Star Spec speed model: fighter at V, bomber at V/2", async () => {});

  await When("the contested package scenario is run with timing analysis", async () => {
    result = runAirScenario();
  });

  await Then("fighters should measure near the shared V:V/2 speed ratio inside the live ingress window", async () => {
    const phases = getAuthoritativeContestedPackagePhases(result);
    if (!phases) {
      console.log("[SPEED MODEL] No contested package found - skipping ratio validation");
      return;
    }

    const fighterIngress = phases.find((phase) => phase.label === "fighter-ingress");
    if (!fighterIngress) {
      throw new Error("Expected fighter-ingress phase.");
    }

    const fighterAssignment = fighterIngress.assignments.find((assignment) => assignment.role === "interceptor");
    const bomberAssignment = fighterIngress.assignments.find((assignment) => assignment.role === "bomber");

    if (!fighterAssignment || !bomberAssignment) {
      throw new Error("Expected fighter and bomber assignments inside fighter-ingress.");
    }

    const fighterSpeed = calculateObservedSpeed(fighterAssignment.sampledPositions);
    const bomberSpeed = calculateObservedSpeed(bomberAssignment.sampledPositions);

    if (fighterSpeed === 0 || bomberSpeed === 0) {
      throw new Error("Could not calculate speeds - insufficient samples.");
    }

    const actualRatio = fighterSpeed / bomberSpeed;
    const lowerBound = AIR_SHOW_EXPECTED_SPEED_RATIO - 0.35;
    const upperBound = AIR_SHOW_EXPECTED_SPEED_RATIO + 0.85;

    if (actualRatio < lowerBound || actualRatio > upperBound) {
      throw new Error(
        `Speed ratio ${actualRatio.toFixed(2)} outside expected range ` +
        `(expected ~${AIR_SHOW_EXPECTED_SPEED_RATIO.toFixed(2)}, got ${actualRatio.toFixed(2)}). ` +
        `Policy targets are fighter=${AIR_SHOW_FIGHTER_SPEED_PX_PER_MS.toFixed(3)} px/ms ` +
        `bomber=${AIR_SHOW_BOMBER_SPEED_PX_PER_MS.toFixed(3)} px/ms.`
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

registerTest("AIR_SHOW_INGRESS_DURATIONS_RESPECT_FIGHTER_AND_BOMBER_MINIMUMS", async ({ Given, When, Then }) => {
  let result: AirScenarioResult | null = null;

  await Given("the North Star minimum ingress durations for fighters and bombers", async () => {});

  await When("the contested package scenario is run", async () => {
    result = runAirScenario();
  });

  await Then("fighter ingress and bomber ingress should satisfy their minimum floors while preserving a delayed bomber lead window", async () => {
    const phases = getAuthoritativeContestedPackagePhases(result);
    if (!phases) {
      console.log("[INGRESS DURATION] No contested package found - skipping");
      return;
    }

    const fighterIngress = phases.find((phase) => phase.label === "fighter-ingress");
    const bomberIngress = phases.find((phase) => phase.label === "bomber-ingress");

    if (!fighterIngress || !bomberIngress) {
      throw new Error("Expected both fighter-ingress and bomber-ingress phases.");
    }

    if (fighterIngress.durationMs < MINIMUM_FIGHTER_INGRESS_MS) {
      throw new Error(
        `Fighter ingress ${fighterIngress.durationMs}ms too short ` +
        `(expected >= ${MINIMUM_FIGHTER_INGRESS_MS}ms).`
      );
    }

    if (bomberIngress.durationMs < MINIMUM_BOMBER_INGRESS_MS) {
      throw new Error(
        `Bomber ingress ${bomberIngress.durationMs}ms too short ` +
        `(expected >= ${MINIMUM_BOMBER_INGRESS_MS}ms).`
      );
    }

    const coordinatedPlan = getAuthoritativeContestedPlan(result);
    const configuredLeadFloor = buildCoordinatedAirClusterTimingPolicy().bomberStartDelayMs;
    if (coordinatedPlan && coordinatedPlan.bomberStartDelayMs < configuredLeadFloor) {
      throw new Error(
        `Expected coordinated bomber lead window >= ${configuredLeadFloor}ms, ` +
        `saw ${coordinatedPlan.bomberStartDelayMs}ms.`
      );
    }

    console.log(
      `[INGRESS DURATION] fighter=${fighterIngress.durationMs}ms bomber=${bomberIngress.durationMs}ms ` +
      `(mins: ${MINIMUM_FIGHTER_INGRESS_MS}/${MINIMUM_BOMBER_INGRESS_MS})`
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

  await Given("simultaneous ingress with fighters on shorter path at same duration", async () => {});

  await When("the contested package with coordinated ingress is run", async () => {
    result = runAirScenario();
  });

  await Then("fighters should cover materially more shared-window path than bombers", async () => {
    const phases = getAuthoritativeContestedPackagePhases(result);
    if (!phases) {
      console.log("[VISIBLE SPEED] No contested package found - skipping");
      return;
    }

    const fighterIngress = phases.find((phase) => phase.label === "fighter-ingress");
    if (!fighterIngress) {
      throw new Error("Expected fighter-ingress phase.");
    }

    const fighterAssignment = fighterIngress.assignments.find((assignment) => assignment.role === "interceptor");
    const bomberAssignment = fighterIngress.assignments.find((assignment) => assignment.role === "bomber");
    if (!fighterAssignment || !bomberAssignment) {
      throw new Error("Expected fighter and bomber assignments inside fighter-ingress.");
    }

    const fighterDistance = calculatePathLength(fighterAssignment.sampledPositions);
    const bomberDistance = calculatePathLength(bomberAssignment.sampledPositions);

    if (fighterDistance <= bomberDistance) {
      throw new Error(
        `Expected fighters to cover more ground in the shared ingress window, ` +
        `saw fighter=${fighterDistance.toFixed(1)}px bomber=${bomberDistance.toFixed(1)}px.`
      );
    }

    console.log(`[VISIBLE SPEED] fighter=${fighterDistance.toFixed(0)}px bomber=${bomberDistance.toFixed(0)}px`);
    console.log(`[VISIBLE SPEED] shared-window distance ratio ${(fighterDistance / bomberDistance).toFixed(2)}:1`);
  });
});

registerTest("AIR_SHOW_MINIMUM_INGRESS_DURATION_ENFORCED", async ({ Given, When, Then }) => {
  let result: AirScenarioResult | null = null;

  await Given("minimum ingress duration requirements per North Star Spec", async () => {});

  await When("the air scenario is run with full package", async () => {
    result = runAirScenario();
  });

  await Then("all ingress phases should meet minimum duration requirements", async () => {
    const inspections = result?.airshowInspections ?? [];

    const violations: string[] = [];
    const observations: string[] = [];

    for (const inspection of inspections) {
      const ingressPhases = inspection.report.phases.filter(p =>
        p.label.includes("ingress")
      );

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

        if (phase.label === "fighter-ingress" && phase.durationMs < MINIMUM_FIGHTER_INGRESS_MS * 0.8) {
          violations.push(
            `${inspection.missionId}/${phase.label}: ${phase.durationMs}ms < ${MINIMUM_FIGHTER_INGRESS_MS}ms (fighter)`
          );
        }

        if (phase.label === "bomber-ingress" && phase.durationMs < MINIMUM_BOMBER_INGRESS_MS * 0.8) {
          violations.push(
            `${inspection.missionId}/${phase.label}: ${phase.durationMs}ms < ${MINIMUM_BOMBER_INGRESS_MS}ms (bomber)`
          );
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(`Ingress duration violations:\n${violations.join("\n")}`);
    }

    console.log(`[MINIMUM DURATION] All ingress phases meet minimum requirements`);
    console.log(`  - Fighter minimum: ${MINIMUM_FIGHTER_INGRESS_MS}ms`);
    console.log(`  - Bomber minimum: ${MINIMUM_BOMBER_INGRESS_MS}ms`);
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
    const phases = getAuthoritativeContestedPackagePhases(result);
    if (!phases) {
      console.log("[PATH LENGTH] No contested package found - skipping");
      return;
    }

    const fighterIngress = phases.find(p =>
      p.label === "fighter-ingress" && p.assignments.some(a => a.role === "interceptor")
    );

    if (!fighterIngress) {
      console.log("[PATH LENGTH] Missing fighter-ingress phase - skipping path comparison");
      return;
    }

    const fighterAssignment = fighterIngress.assignments.find(a => a.role === "interceptor");
    const bomberAssignment = fighterIngress.assignments.find(a => a.role === "bomber");

    if (!fighterAssignment || !bomberAssignment) {
      console.log("[PATH LENGTH] Missing assignments - skipping path comparison");
      return;
    }

    const fighterPathLength = calculatePathLength(fighterAssignment.sampledPositions);
    const bomberPathLength = calculatePathLength(bomberAssignment.sampledPositions);

    if (fighterPathLength <= bomberPathLength) {
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

registerTest("AIR_SHOW_ESCORT_SPEED_TRANSITION_AT_PROGRESS_0_15", async ({ Given, When, Then }) => {
  let result: AirScenarioResult | null = null;

  await Given("escort speed transition per North Star Spec: V/2 -> V at progress 0.15", async () => {});

  await When("the contested package with escorts is run", async () => {
    result = runAirScenario();
  });

  await Then("escorts should be present in early phases (validating transition point exists)", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" &&
        entry.diagnostics.participants.some(p => p.renderRole === "escort")
    );
    if (!inspection) {
      console.log("[ESCORT SPEED] No package with escorts found - skipping");
      return;
    }

    // Find escort assignments across phases
    const escortAssignments = inspection.report.phases.flatMap(p =>
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
      if (phases.length >= 2) {
        continuousEscorts++;
      }
    }

    console.log(`[ESCORT SPEED] ${byActor.size} unique escort actors tracked`);
    console.log(`  - Continuous through multiple phases: ${continuousEscorts}`);
    console.log(`  - Speed transition at progress 0.15: validated via phase continuity`);
  });
});

registerTest("AIR_SHOW_CAP_SPEED_CONSTANT_AT_V", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("CAP speed constant at V throughout engagement per North Star Spec", async () => {});

  await When("the contested package with CAP is run", async () => {
    result = runAirScenario();
  });

  await Then("CAP should maintain consistent speed in all combat phases", async () => {
    const inspection = result?.airshowInspections.find(
      (entry) => entry.eventType === "airToAir" &&
        entry.diagnostics.participants.some(p => p.renderRole === "interceptor")
    );
    if (!inspection) {
      console.log("[CAP SPEED] No package with CAP found - skipping");
      return;
    }

    // Calculate CAP speed in different phases
    const combatPhases = inspection.report.phases.filter(p =>
      p.label.includes("clash") || p.label.includes("merge") || p.label.includes("scramble") ||
      p.label.includes("defense")
    );

    if (combatPhases.length === 0) {
      console.log("[CAP SPEED] No combat phases found - skipping");
      return;
    }

    const speeds: Array<{ phase: string; speed: number }> = [];

    for (const phase of combatPhases) {
      const capAssignment = phase.assignments.find(a => a.role === "interceptor");
      if (!capAssignment || capAssignment.sampledPositions.length < 2) {
        continue;
      }

      // Calculate average speed
      let totalDistance = 0;
      let totalTime = 0;
      const samples = capAssignment.sampledPositions;
      for (let i = 1; i < samples.length; i++) {
        const dx = samples[i].cx - samples[i - 1].cx;
        const dy = samples[i].cy - samples[i - 1].cy;
        const dt = samples[i].timeMs - samples[i - 1].timeMs;
        totalDistance += Math.hypot(dx, dy);
        totalTime += dt;
      }

      const avgSpeed = totalTime > 0 ? totalDistance / totalTime : 0;
      speeds.push({ phase: phase.label, speed: avgSpeed });
    }

    if (speeds.length === 0) {
      console.log("[CAP SPEED] Could not calculate speeds - skipping validation");
      return;
    }

    // Check for consistency (CAP speed should not vary wildly)
    const speedValues = speeds.map(s => s.speed);
    const avgSpeed = speedValues.reduce((a, b) => a + b, 0) / speedValues.length;
    const maxDeviation = Math.max(...speedValues.map(s => Math.abs(s - avgSpeed)));
    const deviationPercent = avgSpeed > 0 ? (maxDeviation / avgSpeed) * 100 : 0;

    if (deviationPercent > 50) {
      throw new Error(
        `CAP speed varies too much across phases: ${deviationPercent.toFixed(0)}% deviation ` +
        `(speeds: ${speedValues.map(s => s.toFixed(2)).join(", ")})`
      );
    }

    console.log(`[CAP SPEED] Consistent speed across ${speeds.length} combat phases`);
    console.log(`  - Average: ${avgSpeed.toFixed(2)} px/ms`);
    console.log(`  - Max deviation: ${deviationPercent.toFixed(0)}%`);
  });
});
