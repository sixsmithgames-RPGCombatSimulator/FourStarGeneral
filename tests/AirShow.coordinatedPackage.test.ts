import { registerTest } from "./harness.js";
import { runAirScenario } from "./airScenarioSupport.js";

registerTest("AIR_SHOW_COORDINATED_PACKAGE_NORTH_STAR", async ({ Given, When, Then }) => {
  let result: ReturnType<typeof runAirScenario> | null = null;

  await Given("the north-star contested package scenario with 3 CAP, 2 escorts, and 4 bombers", async () => {});

  await When("the automated air scenario is resolved and projected into playback", async () => {
    result = runAirScenario();
  });

  await Then("the coordinated playback plan should own the full package without unresolved findings", async () => {
    if (!result) {
      throw new Error("Expected air scenario result.");
    }

    const coordinatedPlan = result.playbackProjection.coordinatedPlans.find(
      (plan) =>
        plan.fighterSceneInterceptorCount === 3
        && plan.fighterSceneEscortCount === 2
        && plan.strikeSortieMissionIds.length === 4
    );

    if (!coordinatedPlan) {
      throw new Error(
        "Expected a coordinated plan for the full 3 CAP / 2 escort / 4 bomber package."
      );
    }
    const sceneReport = coordinatedPlan.sceneReport;
    if (!sceneReport) {
      throw new Error("Expected the coordinated package to include its timeline-v2 inspection report.");
    }

    if (result.playbackProjection.coordinatedPlans.length !== 1) {
      throw new Error(
        `Expected exactly one coordinated package for the clustered battle, saw ${result.playbackProjection.coordinatedPlans.length}.`
      );
    }

    if (result.playbackProjection.standaloneFlightMissionIds.length > 0) {
      throw new Error(
        `Expected the clustered package to absorb all flights, but standalone flights remained: ${result.playbackProjection.standaloneFlightMissionIds.join(", ")}`
      );
    }

    if (result.playbackProjection.standaloneEventMissionIds.length > 0) {
      throw new Error(
        `Expected the clustered package to absorb all air events, but standalone events remained: ${result.playbackProjection.standaloneEventMissionIds.join(", ")}`
      );
    }

    if (result.anomalies.length > 0) {
      throw new Error(
        `Air scenario produced anomalies:\n${result.anomalies.map((anomaly) => `- ${anomaly.code}: ${anomaly.message}`).join("\n")}`
      );
    }

    if (coordinatedPlan.residualOperationLabels.length > 0) {
      throw new Error(
        `Coordinated package leaked residual playback operations:\n${coordinatedPlan.residualOperationLabels.join("\n")}`
      );
    }

    if (coordinatedPlan.sceneFindings.length > 0) {
      throw new Error(
        `Coordinated airshow still has unresolved scene findings:\n${coordinatedPlan.sceneFindings.map((finding) => `- ${finding.code}: ${finding.message}`).join("\n")}`
      );
    }

    if (coordinatedPlan.fighterSceneFlakBurstCount <= 0) {
      throw new Error("Expected the coordinated target-run to include flak bursts for the strike package.");
    }

    const bomberPhases = coordinatedPlan.scenePhaseMetrics.filter((metric) =>
      metric.label === "bomber-ingress" || metric.label === "bomber-defense-pass" || metric.label === "target-run"
    );
    if (bomberPhases.length < 3) {
      throw new Error(
        `Expected coordinated bomber choreography phases to be present, saw ${bomberPhases.map((metric) => metric.label).join(", ")}.`
      );
    }

    const bomberActorIds = new Set(
      sceneReport.flights
        .filter((flight) => flight.role === "bomber")
        .flatMap((flight) => flight.actors.map((actor) => actor.actorId))
    );
    const bomberTurnFindings = (sceneReport.timelineFindings ?? []).filter(
      (finding) => (
        finding.code === "hard-turn" || finding.code === "temporal-hard-turn"
      ) && !!finding.actorId && bomberActorIds.has(finding.actorId)
    );
    if (bomberTurnFindings.length > 0) {
      throw new Error(
        `Coordinated bomber tracks exceed the authored waypoint or 100ms heading limits:\n`
        + bomberTurnFindings.map((finding) => `- ${finding.message}`).join("\n")
      );
    }

    const strikeGroupViolations = bomberPhases.flatMap((metric) => {
      const strikeGroup = metric.groupMetrics.find((group) => group.combatRole === "strike");
      if (!strikeGroup) {
        return [`${metric.label}: missing strike group metrics`];
      }
      const violations: string[] = [];
      const meanSpeedPxPerMs = strikeGroup.meanSpeedPxPerSec / 1000;
      if (meanSpeedPxPerMs < 0.054 || meanSpeedPxPerMs > 0.066) {
        violations.push(
          `${metric.label}: strike speed ${meanSpeedPxPerMs.toFixed(3)} px/ms outside bomber band`
        );
      }
      return violations;
    });
    if (strikeGroupViolations.length > 0) {
      throw new Error(
        `Coordinated bomber choreography violates the governed role speed:\n`
        + strikeGroupViolations.map((message) => `- ${message}`).join("\n")
      );
    }

    const clashPhases = coordinatedPlan.scenePhaseMetrics.filter((metric) => metric.label.includes("clash"));
    if (clashPhases.length < 2 || clashPhases.some((metric) => metric.tracerCount <= 0)) {
      throw new Error(
        `Expected both fighter clash beats to paint tracer bursts, saw:\n${clashPhases.map((metric) => `- ${metric.label}: tracers=${metric.tracerCount}`).join("\n")}`
      );
    }

    const sceneTimeline = coordinatedPlan.sceneTimeline;
    if (!sceneTimeline) {
      throw new Error("Expected the coordinated package to retain its absolute-time timeline.");
    }
    const bomberTracksByActorId = new Map(
      sceneTimeline.tracks
        .filter((track) => track.role === "bomber")
        .map((track) => [track.actorId, track] as const)
    );
    const releasesByBomberId = new Map(
      sceneTimeline.cues.flatMap((cue) =>
        cue.kind === "bomb-release" ? [[cue.bomberActorId, cue] as const] : []
      )
    );
    const invalidFlakWindows = sceneTimeline.cues.flatMap((cue) => {
      if (cue.kind !== "flak") {
        return [];
      }
      const bomberTrack = bomberTracksByActorId.get(cue.bomberActorId);
      const release = releasesByBomberId.get(cue.bomberActorId);
      if (!bomberTrack || !release) {
        return [`${cue.bomberActorId}: missing bomber track or release cue`];
      }
      const activeApproachSegments = bomberTrack.segments.filter(
        (segment) =>
          cue.timeMs >= segment.startTimeMs
          && cue.timeMs <= segment.endTimeMs
          && (
            segment.label === "bomber-ingress"
            || segment.label === "bomber-defense-pass"
            || segment.label === "target-run"
          )
      );
      if (activeApproachSegments.length === 0 || cue.timeMs >= release.timeMs) {
        return [
          `${cue.bomberActorId}: flak=${Math.round(cue.timeMs)}ms, release=${Math.round(release.timeMs)}ms, `
          + `approach=${activeApproachSegments.map((segment) => segment.label).join("/") || "none"}`
        ];
      }
      return [];
    });
    if (invalidFlakWindows.length > 0) {
      throw new Error(
        `Expected every flak flash to occur on its bomber's approach and before that bomber's release:\n`
        + invalidFlakWindows.map((message) => `- ${message}`).join("\n")
      );
    }
  });
});
