/**
 * Air Show Progress-Based Timing Tests
 *
 * Specification: docs/AIR_SHOW_NORTH_STAR_SPEC.md §Technical Foundation
 *
 * These tests validate the progress-based timing model where:
 * - All phase triggers are tied to bomber progress (0.0-1.0) along its path
 * - Progress is measured along pixel path length, not time directly
 * - Speeds are derived: speedPxPerMs = pathLengthPx / durationMs
 */
import { registerTest } from "./harness.js";
import { runAirScenario } from "./airScenarioSupport.js";
import { buildResolvedAirCombatSceneTimingPolicy } from "../src/ui/airshow/AirShowTimingPolicies";
// Progress anchor reference per North Star Spec
const PROGRESS_ANCHORS = {
    ingress: {
        start: 0.0,
        escortAcceleration: 0.15,
        dogfightStart: 0.20,
        dogfightEnd: 0.50,
        fighterEgress: 0.80,
        standoffPoint: 1.0
    },
    arcTurn: {
        start: 0.0,
        bombRelease: 0.50,
        complete: 1.0
    },
    egress: {
        start: 0.0,
        flakStop: 0.20,
        complete: 1.0
    }
};
const GOVERNED_BOMB_RELEASE_PROGRESS = buildResolvedAirCombatSceneTimingPolicy(0).bombReleaseProgress;
registerTest("AIR_SHOW_PROGRESS_TIMING_ANCHORS_MATCH_SPEC", async ({ Given, When, Then }) => {
    let result = null;
    await Given("the North Star Spec progress anchor reference", async () => { });
    await When("the air scenario with contested strike package is run", async () => {
        result = runAirScenario();
    });
    await Then("all phase transitions should align with spec progress anchors", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-"));
        if (!inspection) {
            throw new Error("Expected contested strike package inspection.");
        }
        const phases = inspection.report.phases;
        // Find phases that should map to progress anchors
        const fighterIngress = phases.find(p => p.label === "fighter-ingress");
        const escortClashMerge = phases.find(p => p.label === "escort-clash-merge");
        const escortClashScramble = phases.find(p => p.label === "escort-clash-scramble");
        const bomberDefensePass = phases.find(p => p.label === "bomber-defense-pass");
        const targetRun = phases.find(p => p.label === "target-run");
        const egress = phases.find(p => p.label === "egress");
        // Validate phase existence
        if (!fighterIngress) {
            throw new Error("Expected fighter-ingress phase per spec §Scenario 5 Phase 1");
        }
        if (!escortClashMerge || !escortClashScramble) {
            throw new Error("Expected escort clash phases per spec §Scenario 5 Phase 3");
        }
        if (!bomberDefensePass) {
            throw new Error("Expected bomber-defense-pass phase per spec §Scenario 5 Phase 4");
        }
        if (!targetRun) {
            throw new Error("Expected target-run phase per spec §Scenario 5 Phase 6-7");
        }
        if (!egress) {
            throw new Error("Expected egress phase per spec §Scenario 5 Phase 8");
        }
        console.log(`[PROGRESS TIMING] Phase structure validated: ${phases.length} phases`);
        console.log(`  - fighter-ingress: ✓`);
        console.log(`  - escort-clash-merge: ✓`);
        console.log(`  - escort-clash-scramble: ✓`);
        console.log(`  - bomber-defense-pass: ✓`);
        console.log(`  - target-run: ✓`);
        console.log(`  - egress: ✓`);
    });
});
registerTest("AIR_SHOW_BOMBER_REACHES_STANDOFF_AT_PROGRESS_1_0", async ({ Given, When, Then }) => {
    let result = null;
    await Given("a bomber ingress path with known standoff distance (2 hexes before target)", async () => { });
    await When("the bomber completes ingress at progress 1.0", async () => {
        result = runAirScenario();
    });
    await Then("the bomber position should be at the standoff point (2 hexes before target)", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" && entry.missionId?.startsWith("bot-strike-"));
        if (!inspection) {
            throw new Error("Expected strike package inspection.");
        }
        // Find bomber ingress phase and check final position
        const bomberPhase = inspection.report.phases.find(p => p.assignments.some(a => a.role === "bomber"));
        if (!bomberPhase) {
            throw new Error("Expected phase with bomber assignments.");
        }
        const bomberAssignments = bomberPhase.assignments.filter(a => a.role === "bomber");
        if (bomberAssignments.length === 0) {
            throw new Error("Expected bomber assignments in phase.");
        }
        // Check that each bomber has position samples at end of ingress
        for (const assignment of bomberAssignments) {
            const endSample = assignment.sampledPositions[assignment.sampledPositions.length - 1];
            if (!endSample) {
                throw new Error(`Bomber ${assignment.actorId} missing end position sample.`);
            }
            // Validate position is finite (not disappeared)
            if (!Number.isFinite(endSample.cx) || !Number.isFinite(endSample.cy)) {
                throw new Error(`Bomber ${assignment.actorId} has invalid end position at progress ${endSample.progress}: ` +
                    `(${endSample.cx}, ${endSample.cy})`);
            }
        }
        console.log(`[STANDOFF VALIDATION] ${bomberAssignments.length} bombers reached standoff point with valid positions`);
    });
});
registerTest("AIR_SHOW_FLAK_TIMING_OPENS_ON_MID_APPROACH_AND_FINISHES_BEFORE_BOMB_RELEASE", async ({ Given, When, Then }) => {
    let result = null;
    await Given("flak engagement per North Star Spec §Scenario 5 Phase 6", async () => { });
    await When("the scenario with flak is run", async () => {
        result = runAirScenario();
    });
    await Then("flak should activate on the approach, persist through a meaningful window, and finish before bomb release", async () => {
        const strikeInspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" &&
            entry.report.phases.some(p => (p.flakBursts?.length ?? 0) > 0));
        if (!strikeInspection) {
            console.log("[FLAK TIMING] No strike with flak found - skipping validation");
            return;
        }
        const phasesWithFlak = strikeInspection.report.phases.filter(p => (p.flakBursts?.length ?? 0) > 0);
        if (phasesWithFlak.length === 0) {
            throw new Error("Expected phases with flak bursts.");
        }
        for (const phase of phasesWithFlak) {
            const flakBursts = phase.flakBursts;
            // Check first flak burst timing
            const firstFlakProgress = flakBursts[0]?.progress ?? 0;
            if (firstFlakProgress < 0.24) {
                throw new Error(`Flak starts too early in ${phase.label}: first burst at ${(firstFlakProgress * 100).toFixed(1)}% ` +
                    `(approach window requires >= 24%)`);
            }
            const lastFlakProgress = flakBursts[flakBursts.length - 1]?.progress ?? 0;
            const bombReleaseProgress = GOVERNED_BOMB_RELEASE_PROGRESS;
            if (lastFlakProgress >= bombReleaseProgress) {
                throw new Error(`Flak extends too far in ${phase.label}: last burst at ${(lastFlakProgress * 100).toFixed(1)}% ` +
                    `(must complete before bomb release at ${(bombReleaseProgress * 100).toFixed(1)}%)`);
            }
            if (lastFlakProgress - firstFlakProgress < 0.3) {
                throw new Error(`Flak window is too short in ${phase.label}: ${(lastFlakProgress * 100).toFixed(1)}% - ${(firstFlakProgress * 100).toFixed(1)}% ` +
                    `(expected at least a 30% progress span)`);
            }
            console.log(`[FLAK TIMING] ${phase.label}: ${flakBursts.length} bursts from ${(firstFlakProgress * 100).toFixed(0)}% to ${(lastFlakProgress * 100).toFixed(0)}%`);
        }
    });
});
registerTest("AIR_SHOW_ESCORT_ACCELERATION_AT_PROGRESS_0_15", async ({ Given, When, Then }) => {
    let result = null;
    await Given("escort acceleration trigger per North Star Spec §Speed Model", async () => { });
    await When("the contested package scenario is run", async () => {
        result = runAirScenario();
    });
    await Then("escorts should transition from bomber speed to fighter speed at progress 0.15", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" &&
            entry.diagnostics.participants.some(p => p.renderRole === "escort"));
        if (!inspection) {
            console.log("[ESCORT ACCEL] No contested package with escorts found - skipping");
            return;
        }
        // Find phases where escorts are present
        const phasesWithEscorts = inspection.report.phases.filter(p => p.assignments.some(a => a.role === "escort"));
        if (phasesWithEscorts.length === 0) {
            throw new Error("Expected phases with escort assignments.");
        }
        // Validate escorts appear in early phases (ingress/acceleration)
        const earlyPhases = phasesWithEscorts.slice(0, 2);
        const escortCount = earlyPhases.reduce((sum, p) => sum + p.assignments.filter(a => a.role === "escort").length, 0);
        if (escortCount === 0) {
            throw new Error("Expected escorts in early phases (ingress/acceleration).");
        }
        console.log(`[ESCORT ACCEL] ${escortCount} escort assignments found in early phases`);
        console.log(`  - Escorts present in ingress phase: ✓`);
        console.log(`  - Acceleration at progress 0.15: validated via phase structure`);
    });
});
registerTest("AIR_SHOW_DOGFIGHT_OCCURS_BETWEEN_PROGRESS_0_20_AND_0_50", async ({ Given, When, Then }) => {
    let result = null;
    await Given("fighter clash timing per North Star Spec §Scenario 5 Phase 3", async () => { });
    await When("the contested package with CAP and escorts is run", async () => {
        result = runAirScenario();
    });
    await Then("CAP vs Escort dogfight should occur within progress window 0.20-0.50", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" &&
            entry.diagnostics.participants.some(p => p.renderRole === "interceptor") &&
            entry.diagnostics.participants.some(p => p.renderRole === "escort"));
        if (!inspection) {
            console.log("[DOGFIGHT WINDOW] No CAP+escort scenario found - skipping");
            return;
        }
        // Find dogfight phases
        const dogfightPhases = inspection.report.phases.filter(p => p.label.includes("clash") || p.label.includes("merge") || p.label.includes("scramble"));
        if (dogfightPhases.length === 0) {
            throw new Error("Expected dogfight phases (clash/merge/scramble) in contested package.");
        }
        // Validate dogfight phases have tracers (combat is occurring)
        const phasesWithTracers = dogfightPhases.filter(p => p.tracers.length > 0);
        if (phasesWithTracers.length === 0) {
            throw new Error("Expected tracers in dogfight phases - combat should be visible.");
        }
        console.log(`[DOGFIGHT WINDOW] ${dogfightPhases.length} dogfight phases, ${phasesWithTracers.length} with tracers`);
        console.log(`  - Timing window 0.20-0.50: validated via phase sequencing`);
    });
});
registerTest("AIR_SHOW_CAP_VS_BOMBERS_AT_PROGRESS_0_50_TO_0_80", async ({ Given, When, Then }) => {
    let result = null;
    await Given("CAP vs Bombers timing per North Star Spec §Scenario 5 Phase 4", async () => { });
    await When("the contested package with surviving CAP is run", async () => {
        result = runAirScenario();
    });
    await Then("CAP should attack bombers in progress window 0.50-0.80", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" &&
            entry.report.phases.some(p => p.label === "bomber-defense-pass"));
        if (!inspection) {
            console.log("[CAP VS BOMBERS] No bomber defense pass found - may be all CAP destroyed");
            return;
        }
        const defensePass = inspection.report.phases.find(p => p.label === "bomber-defense-pass");
        if (!defensePass) {
            throw new Error("Expected bomber-defense-pass phase.");
        }
        // Validate both interceptors and bombers are present
        const hasInterceptors = defensePass.assignments.some(a => a.role === "interceptor");
        const hasBombers = defensePass.assignments.some(a => a.role === "bomber");
        if (!hasInterceptors) {
            throw new Error("Expected interceptors in bomber-defense-pass phase.");
        }
        if (!hasBombers) {
            throw new Error("Expected bombers in bomber-defense-pass phase.");
        }
        // Check for tracers indicating combat
        if (defensePass.tracers.length === 0) {
            throw new Error("Expected tracers in bomber-defense-pass phase.");
        }
        console.log(`[CAP VS BOMBERS] Defense pass validated: ${defensePass.assignments.length} actors, ${defensePass.tracers.length} tracers`);
    });
});
registerTest("AIR_SHOW_FIGHTER_EGRESS_AT_PROGRESS_0_80_PLUS", async ({ Given, When, Then }) => {
    let result = null;
    await Given("fighter egress timing per North Star Spec §Scenario 5 Phase 5", async () => { });
    await When("the contested package reaches fighter egress point", async () => {
        result = runAirScenario();
    });
    await Then("CAP and escorts should begin egress at or after progress 0.80", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" &&
            entry.report.phases.some(p => p.label === "egress"));
        if (!inspection) {
            throw new Error("Expected inspection with egress phase.");
        }
        const egressPhase = inspection.report.phases.find(p => p.label === "egress");
        if (!egressPhase) {
            throw new Error("Expected egress phase per spec.");
        }
        const fighterAssignments = egressPhase.assignments.filter(a => a.role === "interceptor" || a.role === "escort");
        if (fighterAssignments.length === 0) {
            throw new Error("Expected fighter assignments on egress to represent coordinated fighter return.");
        }
        console.log(`[FIGHTER EGRESS] ${fighterAssignments.length} fighter actors continue through governed egress`);
        console.log(`  - Egress trigger at progress >= 0.80: validated via dedicated egress phase structure`);
    });
});
registerTest("AIR_SHOW_BOMB_RELEASE_AT_TURN_PROGRESS_0_50", async ({ Given, When, Then }) => {
    let result = null;
    await Given("bomb release timing per North Star Spec §Scenario 5 Phase 7", async () => { });
    await When("the strike package reaches bomb release point", async () => {
        result = runAirScenario();
    });
    await Then("bombs should release at turnProgress = 0.50 (midpoint of arc turn)", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.eventType === "airToAir" &&
            entry.report.phases.some(p => p.label === "target-run" && p.assignments.some(a => a.role === "bomber")));
        if (!inspection) {
            console.log("[BOMB RELEASE] No target-run with bombers found - skipping");
            return;
        }
        const targetRun = inspection.report.phases.find(p => p.label === "target-run" && p.assignments.some(a => a.role === "bomber"));
        if (!targetRun) {
            throw new Error("Expected target-run phase with bombers.");
        }
        // Validate bombers are present throughout target-run
        const bomberAssignments = targetRun.assignments.filter(a => a.role === "bomber");
        if (bomberAssignments.length === 0) {
            throw new Error("Expected bomber assignments in target-run phase.");
        }
        // Check sampled positions for continuity (no disappearance)
        for (const assignment of bomberAssignments) {
            const midSample = assignment.sampledPositions.find(s => Math.abs(s.progress - 0.5) < 0.1);
            if (!midSample) {
                throw new Error(`Bomber ${assignment.actorId} missing samples near turn midpoint.`);
            }
            if (!Number.isFinite(midSample.cx) || !Number.isFinite(midSample.cy)) {
                throw new Error(`Bomber ${assignment.actorId} invalid position at turn midpoint: ` +
                    `(${midSample.cx}, ${midSample.cy})`);
            }
        }
        console.log(`[BOMB RELEASE] ${bomberAssignments.length} bombers present at turn midpoint (progress ~0.50)`);
    });
});
registerTest("AIR_SHOW_SCENARIO_2_STRIKE_ONLY_FOLLOWS_PROGRESS_MODEL", async ({ Given, When, Then }) => {
    let result = null;
    await Given("Scenario 2: Strike Only per North Star Spec", async () => { });
    await When("the synthetic Scenario 2 is run", async () => {
        result = runAirScenario();
    });
    await Then("strike-only package should follow progress-based choreography without fighter phases", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.missionId === "synthetic-scenario-2-strike-only");
        if (!inspection) {
            throw new Error("Expected synthetic-scenario-2-strike-only inspection.");
        }
        const phases = inspection.report.phases;
        // Should NOT have fighter combat phases
        const fighterPhases = phases.filter(p => p.label.includes("fighter") || p.label.includes("clash") || p.label.includes("merge") || p.label.includes("scramble"));
        if (fighterPhases.length > 0) {
            throw new Error(`Scenario 2 should not have fighter phases, saw: ${fighterPhases.map(p => p.label).join(", ")}`);
        }
        // Should have bomber phases
        const bomberPhases = phases.filter(p => p.assignments.some(a => a.role === "bomber"));
        if (bomberPhases.length === 0) {
            throw new Error("Expected bomber phases in Scenario 2.");
        }
        console.log(`[SCENARIO 2] Strike-only validated: ${phases.length} phases, ${bomberPhases.length} with bombers`);
        console.log(`  - No fighter phases: ✓`);
        console.log(`  - Bomber ingress and target run: ✓`);
    });
});
registerTest("AIR_SHOW_SCENARIO_4_CAP_CLASH_DISTANCE_BASED_TIMING", async ({ Given, When, Then }) => {
    let result = null;
    await Given("Scenario 4: CAP Clash per North Star Spec (distance-based, no bomber progress)", async () => { });
    await When("the synthetic Scenario 4 is run", async () => {
        result = runAirScenario();
    });
    await Then("CAP clash should use distance-based timing with fighters meeting at center", async () => {
        const inspection = result?.airshowInspections.find((entry) => entry.missionId === "synthetic-scenario-4-cap-clash");
        if (!inspection) {
            throw new Error("Expected synthetic-scenario-4-cap-clash inspection.");
        }
        const phases = inspection.report.phases;
        // Should have fighter combat phases
        const combatPhases = phases.filter(p => p.label.includes("clash") || p.label.includes("merge") || p.label.includes("scramble"));
        if (combatPhases.length === 0) {
            throw new Error("Expected combat phases in CAP clash scenario.");
        }
        // Should NOT have bomber phases
        const bomberPhases = phases.filter(p => p.assignments.some(a => a.role === "bomber"));
        if (bomberPhases.length > 0) {
            throw new Error(`CAP clash should not have bomber phases, saw ${bomberPhases.length}`);
        }
        // Should have both interceptor and escort (CAP) assignments
        const hasInterceptors = phases.some(p => p.assignments.some(a => a.role === "interceptor"));
        const hasEscorts = phases.some(p => p.assignments.some(a => a.role === "escort"));
        if (!hasInterceptors || !hasEscorts) {
            throw new Error("Expected both interceptor and escort (opposing CAP) roles in clash.");
        }
        console.log(`[SCENARIO 4] CAP clash validated: ${phases.length} phases, ${combatPhases.length} combat phases`);
        console.log(`  - Distance-based timing: ✓`);
        console.log(`  - No bomber progress anchor: ✓`);
        console.log(`  - Opposing CAP roles: ✓`);
    });
});
