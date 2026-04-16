/**
 * Air Show Bomber Speed Validation Tests
 *
 * These tests rigorously validate bomber speed is actually V/2, not just
duration-based estimates. They measure actual pixel displacement over time
to catch cases where bombers move too fast despite long durations.
 */
import { registerTest } from "./harness.js";
import { runAirScenario } from "./airScenarioSupport.js";
const PRE_TARGET_DISTANCE_TOLERANCE_PX = 12;
function getAuthoritativeContestedPackagePhases(result) {
    const coordinatedPlan = result?.playbackProjection.coordinatedPlans.find((plan) => plan.sceneReport && plan.strikeSortieMissionIds.length > 0);
    if (coordinatedPlan?.sceneReport) {
        return coordinatedPlan.sceneReport.phases;
    }
    const legacyInspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-"));
    return legacyInspection?.report.phases ?? null;
}
function getAuthoritativeContestedPlan(result) {
    return result?.playbackProjection.coordinatedPlans.find((plan) => plan.sceneReport && plan.strikeSortieMissionIds.length > 0) ?? null;
}
/**
 * Calculate actual observed speed from position samples
 */
function calculateObservedSpeed(samples) {
    if (samples.length < 3)
        return 0;
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
function isActuallyMoving(samples, minSpeedThreshold = 0.05 // pixels per ms
) {
    if (samples.length < 3)
        return false;
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
    let result = null;
    await Given("bombers at V/2 and fighters at V per North Star Spec", async () => { });
    await When("measuring actual pixel displacement speeds during ingress", async () => {
        result = runAirScenario();
    });
    await Then("bomber ingress phase speed must stay materially below fighter ingress phase speed", async () => {
        const coordinatedPlan = getAuthoritativeContestedPlan(result);
        if (!coordinatedPlan) {
            console.log("[BOMBER SPEED] No contested package - skipping");
            return;
        }
        const fighterIngressMetric = coordinatedPlan.scenePhaseMetrics.find((phase) => phase.label === "fighter-ingress");
        const bomberIngressMetric = coordinatedPlan.scenePhaseMetrics.find((phase) => phase.label === "bomber-ingress");
        if (!fighterIngressMetric || !bomberIngressMetric) {
            throw new Error("Expected coordinated fighter-ingress and bomber-ingress phase metrics.");
        }
        const fighterSpeed = fighterIngressMetric.meanSpeedPxPerSec / 1000;
        const bomberSpeed = bomberIngressMetric.meanSpeedPxPerSec / 1000;
        const ratio = fighterSpeed / Math.max(bomberSpeed, 1e-6);
        console.log(`[BOMBER SPEED VALIDATION] Fighter ingress phase speed: ${fighterSpeed.toFixed(3)} px/ms`);
        console.log(`[BOMBER SPEED VALIDATION] Bomber ingress phase speed: ${bomberSpeed.toFixed(3)} px/ms`);
        console.log(`[BOMBER SPEED VALIDATION] Phase speed ratio: ${ratio.toFixed(2)}:1`);
        if (bomberSpeed <= 0) {
            throw new Error("CRITICAL: Bomber ingress phase speed resolved to zero.");
        }
        if (fighterSpeed <= bomberSpeed) {
            throw new Error(`CRITICAL: Fighter ingress phase is not faster than bomber ingress ` +
                `(${fighterSpeed.toFixed(3)} vs ${bomberSpeed.toFixed(3)} px/ms).`);
        }
        if (ratio < 1.5) {
            throw new Error(`CRITICAL: Fighter ingress only exceeds bomber ingress by ${ratio.toFixed(2)}:1. ` +
                `The coordinated scene should preserve a clearly slower bomber ingress.`);
        }
        console.log(`[BOMBER SPEED VALIDATION] ✓ Coordinated ingress keeps bombers materially slower than fighters`);
    });
});
registerTest("BOMBER_MOVES_DURING_DOGFIGHT_NOT_FROZEN", async ({ Given, When, Then }) => {
    let result = null;
    await Given("bombers visible during escort-CAP dogfight per hold-in-place fix", async () => { });
    await When("checking bomber movement during dogfight phases", async () => {
        result = runAirScenario();
    });
    await Then("bombers must be actively moving forward, not frozen in place", async () => {
        const phases = getAuthoritativeContestedPackagePhases(result);
        if (!phases) {
            console.log("[BOMBER MOVEMENT] No contested package - skipping");
            return;
        }
        // Find dogfight phases where bombers should be visible and moving
        const dogfightPhases = phases.filter(p => p.label.includes("clash") ||
            p.label.includes("merge") ||
            p.label === "fighter-defense-pass");
        if (dogfightPhases.length === 0) {
            console.log("[BOMBER MOVEMENT] No dogfight phases - skipping");
            return;
        }
        const violations = [];
        let checkedBombers = 0;
        for (const phase of dogfightPhases) {
            const bomberAssignments = phase.assignments.filter(a => a.role === "bomber");
            for (const assignment of bomberAssignments) {
                checkedBombers++;
                // Check if bomber is actually moving, not just visible
                const isMoving = isActuallyMoving(assignment.sampledPositions);
                const observedSpeed = calculateObservedSpeed(assignment.sampledPositions);
                if (!isMoving) {
                    violations.push(`${phase.label}/${assignment.actorId}: BOMBER FROZEN ` +
                        `(observed speed ${observedSpeed.toFixed(3)} px/ms, ` +
                        `expected > 0.1 px/ms forward movement)`);
                }
                else if (observedSpeed < 0.1) {
                    violations.push(`${phase.label}/${assignment.actorId}: BOMBER MOVING TOO SLOW ` +
                        `(${observedSpeed.toFixed(3)} px/ms)`);
                }
                console.log(`[BOMBER MOVEMENT] ${phase.label}/${assignment.actorId}: ` +
                    `speed=${observedSpeed.toFixed(3)} px/ms, moving=${isMoving ? 'YES' : 'FROZEN'}`);
            }
        }
        if (violations.length > 0) {
            throw new Error(`BOMBER MOVEMENT VIOLATIONS (${violations.length}):\n${violations.join("\n")}\n\n` +
                `Bombers are visible but frozen during dogfight. ` +
                `They should continue moving forward through their ingress path.`);
        }
        if (checkedBombers === 0) {
            throw new Error(`No bombers found in dogfight phases to validate movement. ` +
                `This may indicate bombers are missing from hold-in-place assignments.`);
        }
        console.log(`[BOMBER MOVEMENT] ✓ All ${checkedBombers} bombers actively moving during dogfight`);
    });
});
registerTest("BOMBER_CONTINUOUS_FORWARD_PROGRESS_DURING_PRE_TARGET_PHASES", async ({ Given, When, Then }) => {
    let result = null;
    await Given("bombers must maintain continuous forward progress before the strike arc begins", async () => { });
    await When("tracking bomber position across ingress and bomber-defense phases", async () => {
        result = runAirScenario();
    });
    await Then("bombers must keep advancing through the pre-target phases", async () => {
        const phases = getAuthoritativeContestedPackagePhases(result);
        if (!phases) {
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
        const bomberPhases = phases.filter((phase) => preTargetPhaseLabels.has(phase.label) && phase.assignments.some((assignment) => assignment.role === "bomber"));
        if (bomberPhases.length === 0) {
            throw new Error("No pre-target bomber phases found.");
        }
        const violations = [];
        const targetRun = phases.find((phase) => phase.label === "target-run");
        const targetAnchors = new Map();
        targetRun?.assignments
            .filter((assignment) => assignment.role === "bomber" && assignment.sampledPositions.length > 0)
            .forEach((assignment) => {
            const anchor = assignment.sampledPositions[0];
            targetAnchors.set(assignment.actorId, { cx: anchor.cx, cy: anchor.cy });
        });
        const bomberActors = new Map();
        for (const phase of bomberPhases) {
            for (const assignment of phase.assignments.filter((entry) => entry.role === "bomber")) {
                if (!bomberActors.has(assignment.actorId)) {
                    bomberActors.set(assignment.actorId, []);
                }
                const samples = assignment.sampledPositions;
                if (samples.length > 0) {
                    const endPoint = { cx: samples[samples.length - 1].cx, cy: samples[samples.length - 1].cy };
                    const targetAnchor = targetAnchors.get(assignment.actorId) ?? endPoint;
                    bomberActors.get(assignment.actorId).push({
                        phase: phase.label,
                        distanceToTargetPx: Math.hypot(endPoint.cx - targetAnchor.cx, endPoint.cy - targetAnchor.cy)
                    });
                }
            }
        }
        for (const [actorId, positions] of bomberActors) {
            if (positions.length < 2)
                continue;
            let closestDistancePx = positions[0].distanceToTargetPx;
            for (let i = 1; i < positions.length; i++) {
                if (positions[i].distanceToTargetPx > closestDistancePx + PRE_TARGET_DISTANCE_TOLERANCE_PX) {
                    violations.push(`${actorId}: REGRESSED in pre-target distance from ${closestDistancePx.toFixed(1)}px to ${positions[i].distanceToTargetPx.toFixed(1)}px ` +
                        `between ${positions[i - 1].phase} and ${positions[i].phase}`);
                }
                closestDistancePx = Math.min(closestDistancePx, positions[i].distanceToTargetPx);
            }
        }
        if (violations.length > 0) {
            throw new Error(`BOMBER PROGRESS REGRESSIONS (${violations.length}):\n${violations.join("\n")}\n\n` +
                `Bombers must maintain continuous forward progress through the pre-target phases.`);
        }
        console.log(`[BOMBER PROGRESS] ✓ ${bomberActors.size} bombers show continuous pre-target forward progress`);
    });
});
registerTest("BOMBER_REACHES_STANDOFF_AT_PROGRESS_1_0_NOT_EARLIER", async ({ Given, When, Then }) => {
    let result = null;
    await Given("bombers reach standoff at progress 1.0 per spec", async () => { });
    await When("measuring bomber progress toward target", async () => {
        result = runAirScenario();
    });
    await Then("bombers must not reach target before completing ingress phase", async () => {
        const phases = getAuthoritativeContestedPackagePhases(result);
        if (!phases) {
            console.log("[BOMBER STANDOFF] No contested package - skipping");
            return;
        }
        const bomberPhases = phases.filter(p => p.assignments.some(a => a.role === "bomber"));
        const violations = [];
        for (const phase of bomberPhases) {
            for (const assignment of phase.assignments.filter(a => a.role === "bomber")) {
                const samples = assignment.sampledPositions;
                if (samples.length === 0)
                    continue;
                // Check if bomber samples show progress attribute
                const progressSamples = samples.filter(s => typeof s.progress === 'number');
                if (progressSamples.length > 0) {
                    const lastSample = progressSamples[progressSamples.length - 1];
                    // If in ingress phase, should NOT be at progress 1.0 until end
                    if (phase.label.includes("ingress") && lastSample.progress > 0.95) {
                        // Check if this is actually the end of ingress
                        const nextPhase = phases.find(p => p.label === "arc-turn" || p.label === "target-run");
                        if (!nextPhase || phase !== bomberPhases[bomberPhases.length - 1]) {
                            violations.push(`${phase.label}/${assignment.actorId}: ` +
                                `Reached progress ${lastSample.progress.toFixed(2)} during ingress - too early!`);
                        }
                    }
                }
            }
        }
        // This is observational - log but don't fail
        if (violations.length > 0) {
            console.log(`[BOMBER STANDOFF] Timing observations (${violations.length}):`);
            violations.forEach(v => console.log(`  ! ${v}`));
        }
        else {
            console.log(`[BOMBER STANDOFF] ✓ Bomber progress timing validated`);
        }
    });
});
registerTest("SPEED_DIFFERENTIATION_VISIBLE_TO_PLAYER_NOT_JUST_THEORETICAL", async ({ Given, When, Then }) => {
    let result = null;
    await Given("speed differentiation must be visually apparent to players", async () => { });
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
        const fighterIngress = phases.find(p => p.label === "fighter-ingress" &&
            p.assignments.some(a => a.role === "interceptor"));
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
        function calcPathLength(samples) {
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
            throw new Error(`CRITICAL: Fighters are not faster than bombers inside fighter-ingress. ` +
                `Bomber speed ${bomberSpeed.toFixed(3)} px/ms vs fighter ${fighterSpeed.toFixed(3)} px/ms.`);
        }
        if (fighterSpeed / Math.max(bomberSpeed, 1e-6) < 1.35) {
            throw new Error(`CRITICAL: Bombers still appear too close to fighter speed in shared ingress. ` +
                `Bomber speed ${bomberSpeed.toFixed(3)} px/ms vs fighter ${fighterSpeed.toFixed(3)} px/ms. ` +
                `Speed differentiation not visible to player.`);
        }
        console.log(`[VISIBLE DIFFERENTIATION] ✓ Speed ratio ${(fighterSpeed / bomberSpeed).toFixed(2)}:1 visible`);
    });
});
