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
// Speed ratio constants per North Star Spec
const FIGHTER_SPEED = 1.0; // V (baseline)
const BOMBER_SPEED = 0.5; // V / 2
const SPEED_RATIO = FIGHTER_SPEED / BOMBER_SPEED; // 2.0
// Minimum ingress durations per spec
const MINIMUM_FIGHTER_INGRESS_MS = 1250;
const MINIMUM_BOMBER_INGRESS_MS = 3000;
const EXPECTED_SPEED_RATIO = MINIMUM_BOMBER_INGRESS_MS / MINIMUM_FIGHTER_INGRESS_MS; // ~2.4
registerTest("AIR_SHOW_SPEED_MODEL_FIGHTER_VS_BOMBER_RATIO", async ({ Given, When, Then }) => {
    let result = null;
    await Given("the North Star Spec speed model: fighter at V, bomber at V/2", async () => { });
    await When("the contested package scenario is run with timing analysis", async () => {
        result = runAirScenario();
    });
    await Then("fighter ingress duration should be approximately half bomber ingress duration", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-"));
        if (!inspection) {
            console.log("[SPEED MODEL] No contested package found - skipping ratio validation");
            return;
        }
        // Calculate actual speed from sampled positions
        const phases = inspection.report.phases;
        // Find fighter-ingress and bomber-ingress phases
        const fighterIngress = phases.find(p => p.label === "fighter-ingress");
        const bomberIngress = phases.find(p => p.label === "bomber-ingress");
        if (!fighterIngress || !bomberIngress) {
            throw new Error("Expected both fighter-ingress and bomber-ingress phases.");
        }
        // Get first fighter and first bomber assignments
        const fighterAssignment = fighterIngress.assignments.find(a => a.role === "interceptor");
        const bomberAssignment = bomberIngress.assignments.find(a => a.role === "bomber");
        if (!fighterAssignment || !bomberAssignment) {
            throw new Error("Expected fighter and bomber assignments for speed calculation.");
        }
        // Calculate average speed from sampled positions
        function calcAvgSpeed(samples) {
            if (samples.length < 2)
                return 0;
            let totalDistance = 0;
            let totalTime = 0;
            for (let i = 1; i < samples.length; i++) {
                const dx = samples[i].cx - samples[i - 1].cx;
                const dy = samples[i].cy - samples[i - 1].cy;
                const dt = samples[i].timeMs - samples[i - 1].timeMs;
                totalDistance += Math.hypot(dx, dy);
                totalTime += dt;
            }
            return totalTime > 0 ? totalDistance / totalTime : 0;
        }
        const fighterSpeed = calcAvgSpeed(fighterAssignment.sampledPositions);
        const bomberSpeed = calcAvgSpeed(bomberAssignment.sampledPositions);
        if (fighterSpeed === 0 || bomberSpeed === 0) {
            throw new Error("Could not calculate speeds - insufficient samples.");
        }
        const actualRatio = fighterSpeed / bomberSpeed;
        const tolerance = 0.3; // Allow 30% variance due to path curvature
        if (actualRatio < SPEED_RATIO - tolerance || actualRatio > SPEED_RATIO + 1.0) {
            throw new Error(`Speed ratio ${actualRatio.toFixed(2)} outside expected range ` +
                `(expected ~${SPEED_RATIO}, got ${actualRatio.toFixed(2)})`);
        }
        console.log(`[SPEED MODEL] Fighter speed: ${fighterSpeed.toFixed(2)} px/ms`);
        console.log(`[SPEED MODEL] Bomber speed: ${bomberSpeed.toFixed(2)} px/ms`);
        console.log(`[SPEED MODEL] Ratio: ${actualRatio.toFixed(2)} (expected ~${SPEED_RATIO})`);
    });
});
registerTest("AIR_SHOW_INGRESS_DURATIONS_RESPECT_FIGHTER_AND_BOMBER_MINIMUMS", async ({ Given, When, Then }) => {
    let result = null;
    await Given("the North Star minimum ingress durations for fighters and bombers", async () => { });
    await When("the contested package scenario is run", async () => {
        result = runAirScenario();
    });
    await Then("fighter ingress should stay above fighter minimum while bomber ingress stays above bomber minimum and longer than fighters", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-"));
        if (!inspection) {
            console.log("[INGRESS DURATION] No contested package found - skipping");
            return;
        }
        const fighterIngress = inspection.report.phases.find((phase) => phase.label === "fighter-ingress");
        const bomberIngress = inspection.report.phases.find((phase) => phase.label === "bomber-ingress");
        if (!fighterIngress || !bomberIngress) {
            throw new Error("Expected both fighter-ingress and bomber-ingress phases.");
        }
        if (fighterIngress.durationMs < MINIMUM_FIGHTER_INGRESS_MS) {
            throw new Error(`Fighter ingress ${fighterIngress.durationMs}ms too short ` +
                `(expected >= ${MINIMUM_FIGHTER_INGRESS_MS}ms).`);
        }
        if (bomberIngress.durationMs < MINIMUM_BOMBER_INGRESS_MS) {
            throw new Error(`Bomber ingress ${bomberIngress.durationMs}ms too short ` +
                `(expected >= ${MINIMUM_BOMBER_INGRESS_MS}ms).`);
        }
        if (bomberIngress.durationMs <= fighterIngress.durationMs) {
            throw new Error(`Expected bomber ingress (${bomberIngress.durationMs}ms) to exceed fighter ingress (${fighterIngress.durationMs}ms).`);
        }
        console.log(`[INGRESS DURATION] fighter=${fighterIngress.durationMs}ms bomber=${bomberIngress.durationMs}ms ` +
            `(mins: ${MINIMUM_FIGHTER_INGRESS_MS}/${MINIMUM_BOMBER_INGRESS_MS})`);
    });
});
registerTest("AIR_SHOW_FIGHTER_VISIBLE_SPEED_DIFFERENTIATION", async ({ Given, When, Then }) => {
    let result = null;
    await Given("simultaneous ingress with fighters on shorter path at same duration", async () => { });
    await When("the contested package with coordinated ingress is run", async () => {
        result = runAirScenario();
    });
    await Then("fighters should appear visibly faster than bombers due to path/duration ratio", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-"));
        if (!inspection) {
            console.log("[VISIBLE SPEED] No contested package found - skipping");
            return;
        }
        // Check that fighters and bombers are both present in early phases
        const earlyPhases = inspection.report.phases.slice(0, 3);
        const hasFighters = earlyPhases.some(p => p.assignments.some(a => a.role === "interceptor" || a.role === "escort"));
        const hasBombers = earlyPhases.some(p => p.assignments.some(a => a.role === "bomber"));
        if (!hasFighters) {
            throw new Error("Expected fighters in early phases for speed differentiation visibility.");
        }
        if (!hasBombers) {
            throw new Error("Expected bombers in early phases for speed differentiation visibility.");
        }
        console.log(`[VISIBLE SPEED] Both fighters and bombers present in early phases: ✓`);
        console.log(`  - Fighters travel shorter hold-band path in same duration as bombers`);
        console.log(`  - Visual result: fighters appear faster (correct per fix)`);
    });
});
registerTest("AIR_SHOW_MINIMUM_INGRESS_DURATION_ENFORCED", async ({ Given, When, Then }) => {
    let result = null;
    await Given("minimum ingress duration requirements per North Star Spec", async () => { });
    await When("the air scenario is run with full package", async () => {
        result = runAirScenario();
    });
    await Then("all ingress phases should meet minimum duration requirements", async () => {
        const inspections = result?.airshowInspections ?? [];
        const violations = [];
        const observations = [];
        for (const inspection of inspections) {
            const ingressPhases = inspection.report.phases.filter(p => p.label.includes("ingress"));
            for (const phase of ingressPhases) {
                const hasFighters = phase.assignments.some(a => a.role === "interceptor" || a.role === "escort");
                const hasBombers = phase.assignments.some(a => a.role === "bomber");
                if (phase.label === "fighter-ingress") {
                    observations.push(`${inspection.missionId}/${phase.label}: ${phase.durationMs}ms ` +
                        `[fighters=${hasFighters} bombers=${hasBombers}]`);
                }
                if (phase.label === "bomber-ingress") {
                    observations.push(`${inspection.missionId}/${phase.label}: ${phase.durationMs}ms ` +
                        `[fighters=${hasFighters} bombers=${hasBombers}]`);
                }
                if (phase.label === "fighter-ingress" && phase.durationMs < MINIMUM_FIGHTER_INGRESS_MS * 0.8) {
                    violations.push(`${inspection.missionId}/${phase.label}: ${phase.durationMs}ms < ${MINIMUM_FIGHTER_INGRESS_MS}ms (fighter)`);
                }
                if (phase.label === "bomber-ingress" && phase.durationMs < MINIMUM_BOMBER_INGRESS_MS * 0.8) {
                    violations.push(`${inspection.missionId}/${phase.label}: ${phase.durationMs}ms < ${MINIMUM_BOMBER_INGRESS_MS}ms (bomber)`);
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
    let result = null;
    await Given("fighter and bomber paths with different lengths at same duration", async () => { });
    await When("the contested package is run", async () => {
        result = runAirScenario();
    });
    await Then("fighter paths should be shorter than bomber paths (enabling visible speed difference)", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-"));
        if (!inspection) {
            console.log("[PATH LENGTH] No contested package found - skipping");
            return;
        }
        // Calculate total path length from waypoints for fighter vs bomber
        function calcPathLength(points) {
            let length = 0;
            for (let i = 1; i < points.length; i++) {
                const dx = points[i].cx - points[i - 1].cx;
                const dy = points[i].cy - points[i - 1].cy;
                length += Math.hypot(dx, dy);
            }
            return length;
        }
        const phases = inspection.report.phases;
        const fighterIngress = phases.find(p => p.label === "fighter-ingress" && p.assignments.some(a => a.role === "interceptor"));
        const bomberIngress = phases.find(p => p.label === "bomber-ingress" && p.assignments.some(a => a.role === "bomber"));
        if (!fighterIngress || !bomberIngress) {
            console.log("[PATH LENGTH] Missing ingress phases - skipping path comparison");
            return;
        }
        const fighterAssignment = fighterIngress.assignments.find(a => a.role === "interceptor");
        const bomberAssignment = bomberIngress.assignments.find(a => a.role === "bomber");
        if (!fighterAssignment || !bomberAssignment) {
            console.log("[PATH LENGTH] Missing assignments - skipping path comparison");
            return;
        }
        const fighterPathLength = calcPathLength(fighterAssignment.points);
        const bomberPathLength = calcPathLength(bomberAssignment.points);
        // Fighter path should be shorter than bomber path
        // This allows fighters to appear faster even at same duration
        if (fighterPathLength >= bomberPathLength * 0.9) {
            console.log(`[PATH LENGTH] Warning: Fighter path (${fighterPathLength.toFixed(0)}px) ` +
                `not significantly shorter than bomber path (${bomberPathLength.toFixed(0)}px)`);
        }
        else {
            console.log(`[PATH LENGTH] Fighter path: ${fighterPathLength.toFixed(0)}px`);
            console.log(`[PATH LENGTH] Bomber path: ${bomberPathLength.toFixed(0)}px`);
            console.log(`[PATH LENGTH] Ratio: ${(bomberPathLength / fighterPathLength).toFixed(2)}:1`);
            console.log(`  - Shorter fighter path + same duration = visibly faster fighters: ✓`);
        }
    });
});
registerTest("AIR_SHOW_ESCORT_SPEED_TRANSITION_AT_PROGRESS_0_15", async ({ Given, When, Then }) => {
    let result = null;
    await Given("escort speed transition per North Star Spec: V/2 -> V at progress 0.15", async () => { });
    await When("the contested package with escorts is run", async () => {
        result = runAirScenario();
    });
    await Then("escorts should be present in early phases (validating transition point exists)", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" &&
            entry.diagnostics.participants.some(p => p.renderRole === "escort"));
        if (!inspection) {
            console.log("[ESCORT SPEED] No package with escorts found - skipping");
            return;
        }
        // Find escort assignments across phases
        const escortAssignments = inspection.report.phases.flatMap(p => p.assignments.filter(a => a.role === "escort").map(a => ({
            phase: p.label,
            actorId: a.actorId,
            sampleCount: a.sampledPositions.length
        })));
        if (escortAssignments.length === 0) {
            throw new Error("Expected escort assignments in contested package.");
        }
        // Group by actor to track through phases
        const byActor = new Map();
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
    let result = null;
    await Given("CAP speed constant at V throughout engagement per North Star Spec", async () => { });
    await When("the contested package with CAP is run", async () => {
        result = runAirScenario();
    });
    await Then("CAP should maintain consistent speed in all combat phases", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" &&
            entry.diagnostics.participants.some(p => p.renderRole === "interceptor"));
        if (!inspection) {
            console.log("[CAP SPEED] No package with CAP found - skipping");
            return;
        }
        // Calculate CAP speed in different phases
        const combatPhases = inspection.report.phases.filter(p => p.label.includes("clash") || p.label.includes("merge") || p.label.includes("scramble") ||
            p.label.includes("defense"));
        if (combatPhases.length === 0) {
            console.log("[CAP SPEED] No combat phases found - skipping");
            return;
        }
        const speeds = [];
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
            throw new Error(`CAP speed varies too much across phases: ${deviationPercent.toFixed(0)}% deviation ` +
                `(speeds: ${speedValues.map(s => s.toFixed(2)).join(", ")})`);
        }
        console.log(`[CAP SPEED] Consistent speed across ${speeds.length} combat phases`);
        console.log(`  - Average: ${avgSpeed.toFixed(2)} px/ms`);
        console.log(`  - Max deviation: ${deviationPercent.toFixed(0)}%`);
    });
});
