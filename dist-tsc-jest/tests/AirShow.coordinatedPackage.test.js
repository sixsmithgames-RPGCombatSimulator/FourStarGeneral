import { registerTest } from "./harness.js";
import { runAirScenario } from "./airScenarioSupport.js";
registerTest("AIR_SHOW_COORDINATED_PACKAGE_NORTH_STAR", async ({ Given, When, Then }) => {
    let result = null;
    await Given("the north-star contested package scenario with 3 CAP, 2 escorts, and 4 bombers", async () => { });
    await When("the automated air scenario is resolved and projected into playback", async () => {
        result = runAirScenario();
    });
    await Then("the coordinated playback plan should own the full package without unresolved findings", async () => {
        if (!result) {
            throw new Error("Expected air scenario result.");
        }
        const coordinatedPlan = result.playbackProjection.coordinatedPlans.find((plan) => plan.fighterSceneInterceptorCount === 3
            && plan.fighterSceneEscortCount === 2
            && plan.strikeSortieMissionIds.length === 4);
        if (!coordinatedPlan) {
            throw new Error("Expected a coordinated plan for the full 3 CAP / 2 escort / 4 bomber package.");
        }
        if (result.playbackProjection.coordinatedPlans.length !== 1) {
            throw new Error(`Expected exactly one coordinated package for the clustered battle, saw ${result.playbackProjection.coordinatedPlans.length}.`);
        }
        if (result.playbackProjection.standaloneFlightMissionIds.length > 0) {
            throw new Error(`Expected the clustered package to absorb all flights, but standalone flights remained: ${result.playbackProjection.standaloneFlightMissionIds.join(", ")}`);
        }
        if (result.playbackProjection.standaloneEventMissionIds.length > 0) {
            throw new Error(`Expected the clustered package to absorb all air events, but standalone events remained: ${result.playbackProjection.standaloneEventMissionIds.join(", ")}`);
        }
        if (result.anomalies.length > 0) {
            throw new Error(`Air scenario produced anomalies:\n${result.anomalies.map((anomaly) => `- ${anomaly.code}: ${anomaly.message}`).join("\n")}`);
        }
        if (coordinatedPlan.residualOperationLabels.length > 0) {
            throw new Error(`Coordinated package leaked residual playback operations:\n${coordinatedPlan.residualOperationLabels.join("\n")}`);
        }
        if (coordinatedPlan.sceneFindings.length > 0) {
            throw new Error(`Coordinated airshow still has unresolved scene findings:\n${coordinatedPlan.sceneFindings.map((finding) => `- ${finding.code}: ${finding.message}`).join("\n")}`);
        }
        if (coordinatedPlan.fighterSceneFlakBurstCount <= 0) {
            throw new Error("Expected the coordinated target-run to include flak bursts for the strike package.");
        }
        const bomberPhases = coordinatedPlan.scenePhaseMetrics.filter((metric) => metric.label === "bomber-ingress" || metric.label === "bomber-defense-pass" || metric.label === "target-run");
        if (bomberPhases.length < 3) {
            throw new Error(`Expected coordinated bomber choreography phases to be present, saw ${bomberPhases.map((metric) => metric.label).join(", ")}.`);
        }
        const jerkyBomberPhases = bomberPhases.filter((metric) => metric.meanFirstWaypointTurnAngleDeg > 38 || metric.maxFirstWaypointTurnAngleDeg > 130);
        if (jerkyBomberPhases.length > 0) {
            throw new Error(`Coordinated bomber phases still enter too sharply:\n${jerkyBomberPhases.map((metric) => `- ${metric.label}: ${Math.round(metric.meanFirstWaypointTurnAngleDeg)}/${Math.round(metric.maxFirstWaypointTurnAngleDeg)} deg`).join("\n")}`);
        }
        const clashPhases = coordinatedPlan.scenePhaseMetrics.filter((metric) => metric.label.includes("clash"));
        if (clashPhases.length < 2 || clashPhases.some((metric) => metric.tracerCount <= 0)) {
            throw new Error(`Expected both fighter clash beats to paint tracer bursts, saw:\n${clashPhases.map((metric) => `- ${metric.label}: tracers=${metric.tracerCount}`).join("\n")}`);
        }
        const preTargetFlak = coordinatedPlan.scenePhaseMetrics.filter((metric) => metric.label !== "target-run" && metric.flakBurstCount > 0);
        if (preTargetFlak.length > 0) {
            throw new Error(`Expected flak to be confined to the target-run phase, saw bursts in:\n${preTargetFlak.map((metric) => `- ${metric.label}: flak=${metric.flakBurstCount}`).join("\n")}`);
        }
    });
});
