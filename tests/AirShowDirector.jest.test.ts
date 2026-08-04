import { planAirShowTimeline, type AirShowDirectorInput } from "../src/ui/airshow/AirShowDirector";
import {
  AIR_SHOW_BOMBER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE,
  AIR_SHOW_BOMBER_SPEED_PX_PER_MS,
  AIR_SHOW_FIGHTER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE,
  AIR_SHOW_FIGHTER_SPEED_PX_PER_MS,
  AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS,
  measureAirShowPath,
  sampleAirShowTimelineTrack,
  type AirShowScenarioFamily
} from "../src/ui/airshow/AirShowTimeline";
import type {
  ResolvedAirShowFlightSpec,
  ResolvedAirShowScene,
  ResolvedAirShowStrikeFlightSpec
} from "../src/ui/airshow/AirShowPlaybackScene";

const playerHq = { cx: 180, cy: 700 };
const botHq = { cx: 1480, cy: 250 };
const mapBounds = { minX: 40, maxX: 1620, minY: 40, maxY: 1260 };
const engagement = { cx: 790, cy: 610 };
const target = { cx: 1210, cy: 540 };

function fighter(
  id: string,
  role: "interceptor" | "escort",
  faction: "Player" | "Bot"
): ResolvedAirShowFlightSpec {
  return {
    id,
    scenarioType: role === "interceptor" ? "fighter" : "fighterEscort",
    faction,
    originHexKey: faction === "Player" ? "1,8" : "18,2",
    strengthBefore: 75,
    strengthAfterEscortPhase: 50,
    finalStrength: 50,
    role,
    combatRole: role === "interceptor" ? "cap" : "escort"
  };
}

function bomber(id = "bomber-1", strengthBefore = 75): ResolvedAirShowStrikeFlightSpec {
  return {
    id,
    scenarioType: "mediumBomber",
    faction: "Player",
    originHexKey: "1,8",
    targetHexKey: "15,7",
    strengthBefore,
    strengthAfterEscortPhase: strengthBefore,
    finalStrength: strengthBefore,
    role: "bomber",
    combatRole: "strike"
  };
}

function sceneFor(scenario: AirShowScenarioFamily): ResolvedAirShowScene {
  const strike = bomber();
  const base: ResolvedAirShowScene = {
    kind: scenario === "cap-clash" ? "capClash" : "airToAir",
    hexKey: `fixture-${scenario}`,
    interceptors: [],
    escorts: [],
    bombers: [],
    bomber: null,
    bomberTargetHexKey: "15,7",
    playerHqKey: "1,8",
    botHqKey: "18,2",
    flakBursts: []
  };
  if (scenario === "strike-only") {
    return { ...base, bombers: [strike], bomber: strike };
  }
  if (scenario === "escorted-strike") {
    return { ...base, escorts: [fighter("escort-1", "escort", "Player")], bombers: [strike], bomber: strike };
  }
  if (scenario === "intercepted-strike") {
    return { ...base, interceptors: [fighter("cap-1", "interceptor", "Bot")], bombers: [strike], bomber: strike };
  }
  if (scenario === "full-engagement") {
    return {
      ...base,
      interceptors: [
        fighter("cap-1", "interceptor", "Bot"),
        fighter("cap-2", "interceptor", "Bot"),
        fighter("cap-3", "interceptor", "Bot")
      ],
      escorts: [
        fighter("escort-1", "escort", "Player"),
        fighter("escort-2", "escort", "Player")
      ],
      bombers: [strike],
      bomber: strike,
      flakBursts: [{
        progress: 0.5,
        count: 1,
        puffCount: 1,
        bomberUnitKey: strike.id,
        targetHexKey: strike.targetHexKey,
        batteryHexKey: "13,6"
      }]
    };
  }
  return {
    ...base,
    interceptors: [fighter("cap-bot", "interceptor", "Bot")],
    escorts: [{ ...fighter("cap-player", "escort", "Player"), combatRole: "cap" }]
  };
}

function inputFor(scenario: AirShowScenarioFamily): AirShowDirectorInput {
  return {
    scene: sceneFor(scenario),
    mapBounds,
    playerHq,
    botHq,
    engagement,
    target: scenario === "cap-clash" ? engagement : target,
    hexWidth: 82,
    hexHeight: 72,
    seed: 0x51a7c0de
  };
}

describe("AirShowDirector first-class timeline", () => {
  const scenarios: AirShowScenarioFamily[] = [
    "strike-only",
    "escorted-strike",
    "intercepted-strike",
    "cap-clash",
    "full-engagement"
  ];

  test.each(scenarios)("plans a valid deterministic %s timeline", (scenario) => {
    const first = planAirShowTimeline(inputFor(scenario));
    const second = planAirShowTimeline(inputFor(scenario));

    expect(first.scenario).toBe(scenario);
    expect(first.verification.findings).toEqual([]);
    expect(first.verification.valid).toBe(true);
    expect(first).toEqual(second);
    expect(first.totalDurationMs).toBeGreaterThan(0);
    expect(first.tracks.length).toBe(first.actors.length);
  });

  test("places faction origins exactly 500px outside the rendered tile envelope", () => {
    const timeline = planAirShowTimeline(inputFor("full-engagement"));
    const playerDistance = Math.hypot(
      timeline.geometry.playerOrigin.cx - timeline.originPlan.playerBoundary.cx,
      timeline.geometry.playerOrigin.cy - timeline.originPlan.playerBoundary.cy
    );
    const botDistance = Math.hypot(
      timeline.geometry.botOrigin.cx - timeline.originPlan.botBoundary.cx,
      timeline.geometry.botOrigin.cy - timeline.originPlan.botBoundary.cy
    );

    expect(timeline.originPlan.offsetPx).toBe(500);
    expect(playerDistance).toBeCloseTo(500, 6);
    expect(botDistance).toBeCloseTo(500, 6);
  });

  test("derives every duration from measured path length and role speed", () => {
    const timeline = planAirShowTimeline(inputFor("full-engagement"));
    timeline.tracks.forEach((track) => {
      const expectedSpeed = track.role === "bomber"
        ? AIR_SHOW_BOMBER_SPEED_PX_PER_MS
        : AIR_SHOW_FIGHTER_SPEED_PX_PER_MS;
      track.segments.forEach((segment) => {
        const measuredLength = measureAirShowPath(segment.points);
        expect(segment.lengthPx).toBeCloseTo(measuredLength, 8);
        expect(segment.speedPxPerMs).toBe(expectedSpeed);
        expect(segment.endTimeMs - segment.startTimeMs).toBeCloseTo(measuredLength / expectedSpeed, 8);
      });
    });
  });

  test("limits cumulative painted heading change over each 100ms playback window", () => {
    const timeline = planAirShowTimeline(inputFor("full-engagement"));
    timeline.tracks.forEach((track) => {
      const headingLimit = track.role === "bomber"
        ? AIR_SHOW_BOMBER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE
        : AIR_SHOW_FIGHTER_MAX_HEADING_CHANGE_DEGREES_PER_SAMPLE;
      let previousHeading: number | null = null;
      for (
        let timeMs = track.visibleFromMs;
        timeMs <= track.visibleUntilMs;
        timeMs += AIR_SHOW_TEMPORAL_SAMPLE_INTERVAL_MS
      ) {
        const sample = sampleAirShowTimelineTrack(track, timeMs);
        if (!sample) continue;
        if (previousHeading !== null) {
          const difference = Math.abs((((sample.headingDegrees - previousHeading) % 360) + 540) % 360 - 180);
          expect(difference).toBeLessThanOrEqual(headingLimit);
        }
        previousHeading = sample.headingDegrees;
      }
    });
  });

  test("keeps CAP clash free of strike phases and effects", () => {
    const timeline = planAirShowTimeline(inputFor("cap-clash"));
    expect(timeline.beats.map((beat) => beat.label)).toEqual([
      "fighter-ingress",
      "escort-clash-merge",
      "escort-clash-scramble",
      "egress"
    ]);
    expect(timeline.cues.some((cue) => cue.kind === "bomb-release" || cue.kind === "impact" || cue.kind === "flak")).toBe(false);
  });

  test("authors independent single-puff flak cues instead of grouped volleys", () => {
    const timeline = planAirShowTimeline(inputFor("full-engagement"));
    const flak = timeline.cues.filter((cue) => cue.kind === "flak");
    expect(flak.length).toBeGreaterThan(3);
    expect(new Set(flak.map((cue) => Math.round(cue.timeMs))).size).toBe(flak.length);
    expect(flak.every((cue) => cue.lingerMs >= 1400 && cue.lingerMs <= 2400)).toBe(true);
  });

  test("keeps bomber silhouettes separated throughout the shared strike corridor", () => {
    const timeline = planAirShowTimeline(inputFor("full-engagement"));
    const bomberTracks = timeline.tracks.filter((track) => track.role === "bomber");
    const corridor = timeline.beats.filter((beat) =>
      beat.label === "bomber-ingress"
      || beat.label === "bomber-defense-pass"
      || beat.label === "target-run"
    );
    const startTimeMs = Math.min(...corridor.map((beat) => beat.startTimeMs));
    const endTimeMs = Math.max(...corridor.map((beat) => beat.endTimeMs));
    let minimumSeparationPx = Number.POSITIVE_INFINITY;
    for (let sampleIndex = 0; sampleIndex <= 32; sampleIndex += 1) {
      const sampleTimeMs = startTimeMs + (endTimeMs - startTimeMs) * sampleIndex / 32;
      const bomberPositions = bomberTracks
        .map((track) => sampleAirShowTimelineTrack(track, sampleTimeMs)?.point)
        .filter((point): point is NonNullable<typeof point> => !!point);
      bomberPositions.forEach((left, leftIndex) => {
        bomberPositions.slice(leftIndex + 1).forEach((right) => {
          minimumSeparationPx = Math.min(
            minimumSeparationPx,
            Math.hypot(left.cx - right.cx, left.cy - right.cy)
          );
        });
      });
    }

    expect(minimumSeparationPx).toBeGreaterThanOrEqual(56);
  });

  test.each(["cap-clash", "full-engagement"] as const)(
    "keeps the switched %s scramble inside one compact combat volume",
    (scenario) => {
      const timeline = planAirShowTimeline(inputFor(scenario));
      const scrambleTracks = timeline.tracks
        .map((track) => ({
          track,
          actor: timeline.actors.find((actor) => actor.actorId === track.actorId),
          segment: track.segments.find((segment) => segment.label === "escort-clash-scramble")
        }))
        .filter((entry) => entry.actor && entry.segment);
      const startTimeMs = Math.max(...scrambleTracks.map((entry) => entry.segment!.startTimeMs));
      const endTimeMs = Math.min(...scrambleTracks.map((entry) => entry.segment!.endTimeMs));
      const sampleTimeMs = startTimeMs + (endTimeMs - startTimeMs) * 0.5;
      const sampled = scrambleTracks.map((entry) => ({
        faction: entry.actor!.faction,
        point: sampleAirShowTimelineTrack(entry.track, sampleTimeMs)!.point
      }));
      const playerSide = sampled.filter((entry) => entry.faction !== "Bot");
      const botSide = sampled.filter((entry) => entry.faction === "Bot");
      const center = (entries: typeof sampled) => ({
        cx: entries.reduce((sum, entry) => sum + entry.point.cx, 0) / entries.length,
        cy: entries.reduce((sum, entry) => sum + entry.point.cy, 0) / entries.length
      });
      const playerCenter = center(playerSide);
      const botCenter = center(botSide);
      const centroidSeparationPx = Math.hypot(
        playerCenter.cx - botCenter.cx,
        playerCenter.cy - botCenter.cy
      );
      const nearestOpposingPairPx = Math.min(...playerSide.flatMap((playerEntry) =>
        botSide.map((botEntry) => Math.hypot(
          playerEntry.point.cx - botEntry.point.cx,
          playerEntry.point.cy - botEntry.point.cy
        ))
      ));

      expect(centroidSeparationPx).toBeLessThanOrEqual(210);
      expect(nearestOpposingPairPx).toBeLessThanOrEqual(150);
      expect(timeline.verification.findings).toEqual([]);
    }
  );

  test("synchronizes every escort screen with a bomber target run without changing role speed", () => {
    const timeline = planAirShowTimeline(inputFor("full-engagement"));
    const bomberTargetRuns = timeline.tracks
      .filter((track) => track.role === "bomber")
      .map((track) => track.segments.find((segment) => segment.label === "target-run"))
      .filter((segment): segment is NonNullable<typeof segment> => !!segment);
    const escortTargetRuns = timeline.tracks
      .filter((track) => track.role === "escort")
      .map((track) => track.segments.find((segment) => segment.label === "target-run"));

    expect(escortTargetRuns.length).toBeGreaterThan(0);
    escortTargetRuns.forEach((escortTargetRun) => {
      expect(escortTargetRun).toBeDefined();
      expect(bomberTargetRuns.some((bomberTargetRun) =>
        Math.abs(bomberTargetRun.startTimeMs - escortTargetRun!.startTimeMs) <= 1
        && Math.abs(bomberTargetRun.endTimeMs - escortTargetRun!.endTimeMs) <= 1
      )).toBe(true);
      expect(escortTargetRun!.speedPxPerMs).toBe(AIR_SHOW_FIGHTER_SPEED_PX_PER_MS);
    });
    expect(timeline.verification.findings).toEqual([]);
  });

  test("keeps a tutorial zero-strength bomber alive through target run and egress", () => {
    const zeroBomber = bomber("tutorial-bomber", 0);
    const scene = {
      ...sceneFor("strike-only"),
      bombers: [zeroBomber],
      bomber: zeroBomber
    };
    const timeline = planAirShowTimeline({ ...inputFor("strike-only"), scene });
    const actor = timeline.actors[0]!;
    const track = timeline.tracks[0]!;

    expect(actor.initialStrength).toBe(25);
    expect(actor.finalStrength).toBe(25);
    expect(track.segments.map((segment) => segment.label)).toContain("target-run");
    expect(track.segments.map((segment) => segment.label)).toContain("egress");
    expect(timeline.cues.some((cue) => cue.kind === "destruction")).toBe(false);
    expect(track.visibleUntilMs).toBe(track.segments[track.segments.length - 1]!.endTimeMs);
  });
});
