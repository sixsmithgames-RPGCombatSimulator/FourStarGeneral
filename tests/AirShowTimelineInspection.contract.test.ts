import {
  describeAirShowTimeline,
  sampleTimelineTrackForInspectionBeat
} from "../src/ui/airshow/AirShowTimelineInspection";
import {
  AIR_SHOW_BOMBER_SPEED_PX_PER_MS,
  AIR_SHOW_FIGHTER_SPEED_PX_PER_MS,
  type AirShowTimeline,
  type AirShowTimelineTrack
} from "../src/ui/airshow/AirShowTimeline";
import { registerTest } from "./harness.js";

function buildTimeline(): AirShowTimeline {
  return {
    version: 2,
    sceneId: "inspection-scene",
    seed: 417,
    scenario: "full-engagement",
    totalDurationMs: 400,
    geometry: {
      mapBounds: { minX: 0, maxX: 300, minY: 0, maxY: 200 },
      playerHq: { cx: 20, cy: 100 },
      botHq: { cx: 280, cy: 100 },
      playerOrigin: { cx: -500, cy: 100 },
      botOrigin: { cx: 800, cy: 100 },
      attackOrigin: { cx: -500, cy: 100 },
      defenseOrigin: { cx: 800, cy: 100 },
      engagement: { cx: 150, cy: 100 },
      target: { cx: 240, cy: 100 },
      merge: { cx: 120, cy: 100 },
      defenseIntercept: { cx: 190, cy: 100 },
      release: { cx: 215, cy: 100 },
      axis: { x: 1, y: 0 },
      normal: { x: 0, y: 1 }
    },
    originPlan: {
      offsetPx: 500,
      axis: { cx: 1, cy: 0 },
      mapBounds: { minX: 0, maxX: 300, minY: 0, maxY: 200 },
      playerBoundary: { cx: 0, cy: 100 },
      botBoundary: { cx: 300, cy: 100 },
      playerOrigin: { cx: -500, cy: 100 },
      botOrigin: { cx: 800, cy: 100 }
    },
    flights: [
      {
        id: "fighter-flight",
        role: "interceptor",
        combatRole: "cap",
        faction: "Player",
        scenarioType: "Interceptor",
        originHexKey: "0,0",
        strengthBefore: 75,
        finalStrength: 50,
        laneOffsetPx: -12,
        actorIds: ["fighter-1", "missing-actor"]
      },
      {
        id: "bomber-flight",
        role: "bomber",
        combatRole: "strike",
        faction: "Bot",
        scenarioType: "Bomber",
        originHexKey: "4,0",
        strengthBefore: 100,
        strengthAfterEscortPhase: 75,
        finalStrength: 50,
        laneOffsetPx: 18,
        actorIds: ["bomber-1"]
      }
    ],
    actors: [
      {
        actorId: "fighter-1",
        flightId: "fighter-flight",
        role: "interceptor",
        combatRole: "cap",
        scenarioType: "Interceptor",
        faction: "Player",
        formationIndex: 0,
        size: 45,
        laneOffsetPx: -12,
        initialStrength: 75,
        finalStrength: 50
      },
      {
        actorId: "bomber-1",
        flightId: "bomber-flight",
        role: "bomber",
        combatRole: "strike",
        scenarioType: "Bomber",
        faction: "Bot",
        formationIndex: 1,
        size: 90,
        laneOffsetPx: 18,
        initialStrength: 100,
        finalStrength: 50
      }
    ],
    tracks: [
      {
        actorId: "fighter-1",
        flightId: "fighter-flight",
        role: "interceptor",
        visibleFromMs: 100,
        visibleUntilMs: 500,
        segments: [{
          label: "target-run",
          startTimeMs: 100,
          endTimeMs: 500,
          speedPxPerMs: AIR_SHOW_FIGHTER_SPEED_PX_PER_MS,
          lengthPx: 46,
          points: [{ cx: 0, cy: 0 }, { cx: 46, cy: 0 }]
        }]
      },
      {
        actorId: "bomber-1",
        flightId: "bomber-flight",
        role: "bomber",
        visibleFromMs: 100,
        visibleUntilMs: 500,
        segments: [{
          label: "target-run",
          startTimeMs: 100,
          endTimeMs: 500,
          speedPxPerMs: AIR_SHOW_BOMBER_SPEED_PX_PER_MS,
          lengthPx: 23,
          points: [{ cx: 0, cy: 100 }, { cx: 23, cy: 100 }]
        }]
      }
    ],
    beats: [{ label: "target-run", startTimeMs: 100, endTimeMs: 500 }],
    cues: [
      {
        kind: "tracer",
        timeMs: 200,
        sourceActorId: "fighter-1",
        targetActorId: "bomber-1",
        emitter: "nose",
        color: "#ffeeaa",
        width: 1.25,
        lifetimeMs: 180,
        visibleLengthPx: 28
      },
      {
        kind: "flak",
        timeMs: 300,
        bomberActorId: "bomber-1",
        batteryHexKey: "3,1",
        point: { cx: 12, cy: 96 },
        scale: 0.8,
        smokeScale: 1.1,
        lingerMs: 420
      },
      {
        kind: "impact",
        timeMs: 400,
        targetHexKey: "4,0",
        point: { cx: 240, cy: 100 }
      }
    ],
    verification: {
      valid: true,
      findings: [{ severity: "warning", code: "fixture", message: "Characterization fixture." }]
    }
  };
}

function assertNear(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 0.000001) {
    throw new Error(`Expected ${label} ${expected}, received ${actual}.`);
  }
}

registerTest("AIR_SHOW_TIMELINE_INSPECTION_PRESERVES_CANONICAL_PROJECTION", async ({ Given, When, Then }) => {
  const timeline = buildTimeline();
  const before = JSON.stringify(timeline);
  let report: ReturnType<typeof describeAirShowTimeline>;
  let duplicate: ReturnType<typeof describeAirShowTimeline>;

  await Given("a canonical timeline with fighter, bomber, tracer, flak, and impact data", async () => {});

  await When("the pure inspection projection is built", async () => {
    report = describeAirShowTimeline(timeline);
    duplicate = describeAirShowTimeline(timeline);
  });

  await Then("scene identity, actor projection, sampled motion, cues, and timing audits remain exact", async () => {
    if (JSON.stringify(timeline) !== before) {
      throw new Error("Inspection projection mutated the canonical playback timeline.");
    }
    if (JSON.stringify(report) !== JSON.stringify(duplicate)) {
      throw new Error("Expected identical timelines to produce deterministic inspection output.");
    }
    if (report.timelineVersion !== 2 || report.hexKey !== "inspection-scene" || report.timelineScenario !== "full-engagement") {
      throw new Error("Inspection projection lost canonical timeline identity.");
    }
    if (report.timelineFindings?.[0]?.code !== "fixture" || report.hqMidX !== 150) {
      throw new Error("Inspection projection lost verification or headquarters geometry.");
    }
    if (report.flights[0]?.actors.length !== 1 || report.flights[0]?.actors[0]?.actorId !== "fighter-1") {
      throw new Error("Expected missing actor references to remain filtered from projected flights.");
    }
    if (report.flights[0]?.actors[0]?.position.cx !== 0 || report.flights[0]?.actors[0]?.headingDegrees !== 90) {
      throw new Error("Expected projected actors to start at their canonical visible timeline sample.");
    }

    const phase = report.phases[0];
    if (!phase || phase.durationMs !== 400 || phase.assignments.length !== 2) {
      throw new Error("Expected one 400ms target-run phase with two assignments.");
    }
    if (phase.assignments.some((assignment) => assignment.sampledPositions.length !== 17)) {
      throw new Error("Expected the established 17-position inspection sampling density.");
    }
    assertNear(phase.tracers[0]?.progress ?? -1, 0.25, "tracer progress");
    assertNear(phase.tracers[0]?.emitterPoint.cx ?? -1, 11.5, "tracer emitter x");
    assertNear(phase.tracers[0]?.centerlineEndPoint.cx ?? -1, 5.75, "tracer target x");
    if (phase.tracers[0]?.color !== "#ffeeaa" || phase.tracers[0]?.burstCount !== 1) {
      throw new Error("Expected tracer presentation metadata to remain intact.");
    }

    const flak = phase.flakBursts[0];
    assertNear(flak?.progress ?? -1, 0.5, "flak progress");
    assertNear(flak?.sampledBomberCenter?.cx ?? -1, 11.5, "sampled bomber x");
    if (flak?.bomberUnitKey !== "bomber-flight" || flak?.batteryHexKey !== "3,1" || flak?.targetSource !== "bomberPath") {
      throw new Error("Expected flak inspection context to remain bound to the bomber track.");
    }

    const audit = report.phaseTimingAudit[0];
    if (!audit || audit.roles.length !== 2) {
      throw new Error("Expected timing audit coverage for both timeline roles.");
    }
    const fighterAudit = audit.roles.find((role) => role.role === "interceptor");
    const bomberAudit = audit.roles.find((role) => role.role === "bomber");
    assertNear(fighterAudit?.realizedSpeedPxPerMs ?? -1, AIR_SHOW_FIGHTER_SPEED_PX_PER_MS, "fighter speed");
    assertNear(bomberAudit?.realizedSpeedPxPerMs ?? -1, AIR_SHOW_BOMBER_SPEED_PX_PER_MS, "bomber speed");

    (report.center as { cx: number }).cx = -999;
    (report.originPlan?.playerOrigin as { cx: number }).cx = -999;
    (report.phases[0]!.assignments[0]!.points[0] as { cx: number }).cx = -999;
    (report.phases[0]!.flakBursts[0]!.burstCenter as { cx: number }).cx = -999;
    if (JSON.stringify(timeline) !== before) {
      throw new Error("Expected inspection output to be detached from the canonical timeline graph.");
    }
  });
});

registerTest("AIR_SHOW_TIMELINE_INSPECTION_SAMPLING_CLAMPS_DENSITY_AND_HANDLES_EMPTY_TRACKS", async ({ Given, When, Then }) => {
  const timeline = buildTimeline();
  const populatedTrack = timeline.tracks[0]!;
  const emptyTrack: AirShowTimelineTrack = {
    actorId: "empty",
    flightId: "empty-flight",
    role: "escort",
    visibleFromMs: 100,
    visibleUntilMs: 500,
    segments: []
  };
  const beat = timeline.beats[0]!;
  let populatedSamples: ReturnType<typeof sampleTimelineTrackForInspectionBeat> = [];
  let emptySamples: ReturnType<typeof sampleTimelineTrackForInspectionBeat> = [];

  await Given("a populated track and a track without renderable segments", async () => {});

  await When("inspection samples are requested below the minimum density", async () => {
    populatedSamples = sampleTimelineTrackForInspectionBeat(populatedTrack, beat, 1);
    emptySamples = sampleTimelineTrackForInspectionBeat(emptyTrack, beat, 1);
  });

  await Then("three stable samples are returned and missing motion falls back to zero coordinates", async () => {
    if (populatedSamples.length !== 3 || emptySamples.length !== 3) {
      throw new Error(`Expected minimum three-sample output, received ${populatedSamples.length} and ${emptySamples.length}.`);
    }
    const midpoint = populatedSamples[1];
    assertNear(midpoint?.timeMs ?? -1, 200, "midpoint relative time");
    assertNear(midpoint?.progress ?? -1, 0.5, "midpoint progress");
    assertNear(midpoint?.cx ?? -1, 23, "midpoint x");
    if (emptySamples.some((sample) => sample.cx !== 0 || sample.cy !== 0 || sample.headingDegrees !== 0)) {
      throw new Error("Expected empty inspection tracks to retain the established zero-coordinate fallback.");
    }
    if (emptySamples.some((sample) => sample.pathProgress !== sample.progress)) {
      throw new Error("Expected empty inspection tracks to fall back to requested phase progress.");
    }
  });
});
