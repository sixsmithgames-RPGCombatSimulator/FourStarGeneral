import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
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
    bomberTargetHexKey: "15,7",
    playerHqKey: "1,8",
    botHqKey: "18,2",
    flakBursts: []
  };
  if (scenario === "strike-only") {
    return { ...base, bombers: [strike] };
  }
  if (scenario === "escorted-strike") {
    return { ...base, escorts: [fighter("escort-1", "escort", "Player")], bombers: [strike] };
  }
  if (scenario === "intercepted-strike") {
    return { ...base, interceptors: [fighter("cap-1", "interceptor", "Bot")], bombers: [strike] };
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

function mirroredFullEngagementInput(): AirShowDirectorInput {
  const strike = {
    ...bomber("bomber-bot"),
    faction: "Bot" as const,
    originHexKey: "18,2",
    targetHexKey: "1,8"
  };
  return {
    ...inputFor("full-engagement"),
    scene: {
      ...sceneFor("full-engagement"),
      interceptors: [
        fighter("cap-player-1", "interceptor", "Player"),
        fighter("cap-player-2", "interceptor", "Player")
      ],
      escorts: [
        fighter("escort-bot-1", "escort", "Bot"),
        fighter("escort-bot-2", "escort", "Bot")
      ],
      bombers: [strike],
      bomberTargetHexKey: strike.targetHexKey,
      flakBursts: []
    },
    target: { cx: 450, cy: 680 }
  };
}

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return collectTypeScriptFiles(path);
    return entry.isFile() && path.endsWith(".ts") ? [path.split("\\").join("/")] : [];
  });
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

  test("locks the deterministic all-fallback planning context", () => {
    const explicit = inputFor("full-engagement");
    const fallbackInput: AirShowDirectorInput = {
      scene: explicit.scene,
      mapBounds: explicit.mapBounds,
      playerHq: null,
      botHq: null,
      engagement: explicit.engagement,
      target: null,
      hexWidth: explicit.hexWidth,
      hexHeight: explicit.hexHeight
    };
    const first = planAirShowTimeline(fallbackInput);
    const second = planAirShowTimeline(fallbackInput);

    expect(first).toEqual(second);
    expect(first.geometry.playerHq).toEqual({ cx: 163, cy: 650 });
    expect(first.geometry.botHq).toEqual({ cx: 1497, cy: 650 });
    expect(first.geometry.target).toEqual(engagement);
    expect(first.verification.findings).toEqual([]);
    expect(createHash("sha256").update(JSON.stringify(first)).digest("hex")).toBe(
      "c4747fe1662f979c2988e16e97c8926b9c3e2ceb0a000a740f476b5a158cfd37"
    );
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

  test("locks the canonical intercepted-strike track projection", () => {
    const timeline = planAirShowTimeline(inputFor("intercepted-strike"));
    const interceptorTracks = timeline.tracks.filter((track) => track.role === "interceptor");
    expect(createHash("sha256").update(JSON.stringify(interceptorTracks)).digest("hex")).toBe(
      "25fbf9019cbbe5a1a8452839df27e83a525f21d97c23b0fcb58022a070dc8c33"
    );
  });

  test("keeps fighter projections and timeline planning under one production authority", () => {
    const sources = collectTypeScriptFiles("src").map((path) => ({ path, source: readFileSync(path, "utf8") }));
    expect(sources.filter(({ source }) => source.includes("function resolveAirShowTimelinePlanningContext("))
      .map(({ path }) => path)).toEqual(["src/ui/airshow/AirShowDirector.ts"]);
    expect(sources.reduce((count, { source }) =>
      count + (source.match(/function resolveAirShowTimelinePlanningContext\(/g)?.length ?? 0), 0)).toBe(1);
    expect(sources.some(({ source }) => source.includes("export function resolveAirShowTimelinePlanningContext("))).toBe(false);
    expect(sources.filter(({ source }) => source.includes("function projectFighterClashTurnSides("))
      .map(({ path }) => path)).toEqual(["src/ui/airshow/AirShowDirector.ts"]);
    expect(sources.reduce((count, { source }) =>
      count + (source.match(/function projectFighterClashTurnSides\(/g)?.length ?? 0), 0)).toBe(1);
    expect(sources.reduce((count, { source }) =>
      count + (source.match(/function projectFighterScrambleGeometry\(/g)?.length ?? 0), 0)).toBe(1);
    expect(sources.reduce((count, { source }) =>
      count + (source.match(/function buildFighterClash\(/g)?.length ?? 0), 0)).toBe(1);
    expect(sources.filter(({ source }) => source.includes("function projectInterceptorPassGeometry("))
      .map(({ path }) => path)).toEqual(["src/ui/airshow/AirShowDirector.ts"]);
    expect(sources.filter(({ source }) => source.includes("export function planAirShowTimeline("))
      .map(({ path }) => path)).toEqual(["src/ui/airshow/AirShowDirector.ts"]);
    expect(sources.reduce((count, { source }) =>
      count + (source.match(/export function planAirShowTimeline\(/g)?.length ?? 0), 0)).toBe(1);
    for (const speedConstant of ["AIR_SHOW_FIGHTER_SPEED_PX_PER_MS", "AIR_SHOW_BOMBER_SPEED_PX_PER_MS"]) {
      const declaration = new RegExp(`export const ${speedConstant}\\s*=`);
      expect(sources.filter(({ source }) => declaration.test(source)).map(({ path }) => path))
        .toEqual(["src/ui/airshow/AirShowTimeline.ts"]);
    }
    const rendererSource = readFileSync("src/rendering/HexMapRenderer.ts", "utf8");
    expect(rendererSource).toContain('import { planAirShowTimeline } from "../ui/airshow/AirShowDirector";');
    expect(rendererSource).toContain("const timeline = planAirShowTimeline({");
    expect(existsSync("src/ui/airshow/AirShowPlaybackPlanner.ts")).toBe(false);
    expect(existsSync("src/ui/airshow/AirShowTimingPolicies.ts")).toBe(false);
    expect(sources.filter(({ source }) => source.includes("async animateResolvedAirCombatShow("))
      .map(({ path }) => path)).toEqual(["src/rendering/HexMapRenderer.ts"]);
    expect(sources.filter(({ source }) => source.includes("private async animateAirShowTimeline("))
      .map(({ path }) => path)).toEqual(["src/rendering/HexMapRenderer.ts"]);
    for (const legacyPlayer of [
      "animateAircraftPathByHex",
      "animateAircraftFlyover",
      "animateAircraftArc",
      "animateAirDogfightShowAt",
      "animateBomberInterceptionShowAt",
      "animateAircraftRoundTrip",
      "animateAircraftSortie",
      "animateAircraftLeg",
      "animatePlannedResolvedAirCombatShow",
      "playDogfight",
      "playBomberDefensePass"
    ]) {
      expect(sources.some(({ source }) => source.includes(legacyPlayer))).toBe(false);
    }
    const sceneContract = readFileSync("src/ui/airshow/AirShowPlaybackScene.ts", "utf8");
    expect(sceneContract).not.toMatch(/\breadonly bomber\s*:/);
    for (const legacyTimingField of [
      "fighterIngressDurationMs",
      "escortClashDurationMs",
      "bomberIngressDurationMs",
      "bomberPassDurationMs",
      "strikeRunDurationMs",
      "egressDurationMs",
      "bomberArrivalDelayMs",
      "bombReleaseProgress"
    ]) {
      expect(sceneContract).not.toContain(legacyTimingField);
      expect(sources.some(({ source }) => source.includes(legacyTimingField))).toBe(false);
    }
    expect(sources.some(({ source }) => source.includes("AIR_SHOW_FIGHTER_CLASH_START_PROGRESS"))).toBe(false);
    const runtimeTraceSource = readFileSync("src/ui/airshow/AirShowRuntimeTrace.ts", "utf8");
    expect(runtimeTraceSource).toContain('readonly source: "AirShowTimelinePlayer";');
    for (const [timelineEvent, recorder] of [
      ["timeline-start", "recordAirShowTimelineStart"],
      ["beat-entered", "recordAirShowTimelineBeat"],
      ["cue-fired", "recordAirShowTimelineCue"],
      ["timeline-complete", "recordAirShowTimelineComplete"]
    ]) {
      expect(runtimeTraceSource).toContain(`readonly kind: "${timelineEvent}";`);
      expect(rendererSource).toContain(`${recorder}(`);
    }
    for (const retiredPhaseEvent of [
      "phase-start",
      "phase-visibility-sync",
      "phase-visibility-expanded",
      "phase-complete",
      "strength-sync",
      "actor-fade-out",
      "scene-complete",
      "scene-cleanup"
    ]) {
      expect(runtimeTraceSource).not.toContain(`readonly kind: "${retiredPhaseEvent}";`);
    }
    const directorSource = readFileSync("src/ui/airshow/AirShowDirector.ts", "utf8");
    expect(directorSource.match(/= projectFighterScrambleGeometry\(/g)).toHaveLength(2);
    expect(directorSource.match(/const switchedLanePx =/g)).toHaveLength(1);
    expect(directorSource.match(/ESCORT_SCREEN_CLEARANCE_LANE_PX/g)).toHaveLength(2);
    expect(directorSource.match(/buildScramblePath\(/g)).toHaveLength(2);
    expect(directorSource.match(/=\s*resolveAirShowTimelinePlanningContext\(/g)).toHaveLength(1);
    expect(directorSource.match(/const fallbackInsetPx =/g)).toHaveLength(1);
    expect(directorSource.match(/const withoutVerification:/g)).toHaveLength(1);
    expect(directorSource.match(/verifyAirShowTimeline\(/g)).toHaveLength(1);
  });

  test("keeps multi-interceptor lanes centered and continues existing clash tracks", () => {
    const timeline = planAirShowTimeline(inputFor("full-engagement"));
    const interceptorTracks = timeline.tracks.filter((track) => track.role === "interceptor");
    const lanes = interceptorTracks.map((track) => {
      const passes = track.segments.filter((segment) => segment.label === "bomber-defense-pass");
      const cross = passes[1]!.points[1]!;
      return (cross.cx - timeline.geometry.defenseIntercept.cx) * timeline.geometry.normal.x
        + (cross.cy - timeline.geometry.defenseIntercept.cy) * timeline.geometry.normal.y;
    });
    expect(createHash("sha256").update(JSON.stringify(interceptorTracks)).digest("hex")).toBe(
      "23464d345fc8a5d4e110abd6055317fe5f4155e14d36b06d82118646e3e803cf"
    );
    expect(interceptorTracks.map((track) => track.actorId)).toEqual([
      "cap-1:0", "cap-1:1", "cap-1:2",
      "cap-2:0", "cap-2:1", "cap-2:2",
      "cap-3:0", "cap-3:1", "cap-3:2"
    ]);
    expect(lanes.every((lane, index) => index === 0 || lane > lanes[index - 1]!)).toBe(true);
    expect(Math.abs(lanes[Math.floor(lanes.length / 2)]!)).toBeLessThan(1);
    lanes.forEach((lane, index) => {
      expect(Math.abs(lane + lanes[lanes.length - 1 - index]!)).toBeLessThan(1);
    });
    interceptorTracks.forEach((track) => {
      expect(track.segments.map((segment) => segment.label)).toEqual([
        "fighter-ingress", "escort-clash-merge", "escort-clash-scramble",
        "bomber-defense-pass", "bomber-defense-pass", "egress"
      ]);
      const scramble = track.segments[2]!;
      const transition = track.segments[3]!;
      expect(transition.startTimeMs).toBe(scramble.endTimeMs);
      expect(transition.points[0]).toEqual(scramble.points[scramble.points.length - 1]);
    });
  });

  test("locks multi-flight fighter-clash paths and continuation boundaries", () => {
    const expectedHashes = {
      "cap-clash": "66a92433c35fca6e77ef289d7edd453a3e6890a5757d3367485dc601f8d3a09f",
      "full-engagement": "5e840281833984353eba6494315aa5f7fb9c44b540176ecd94e7fd47c81a7cc3"
    } as const;
    (["cap-clash", "full-engagement"] as const).forEach((scenario) => {
      const timeline = planAirShowTimeline(inputFor(scenario));
      const clashPrefixes = timeline.tracks
        .filter((track) => track.role !== "bomber")
        .map((track) => ({ ...track, segments: track.segments.slice(0, 3) }));
      expect(createHash("sha256").update(JSON.stringify(clashPrefixes)).digest("hex"))
        .toBe(expectedHashes[scenario]);
      clashPrefixes.forEach((track) => {
        expect(track.segments.map((segment) => segment.label)).toEqual([
          "fighter-ingress", "escort-clash-merge", "escort-clash-scramble"
        ]);
        const [ingress, merge, scramble] = track.segments;
        expect(merge!.startTimeMs).toBe(ingress!.endTimeMs);
        expect(scramble!.startTimeMs).toBe(merge!.endTimeMs);
        expect(merge!.points[0]).toEqual(ingress!.points[ingress!.points.length - 1]);
        const mergeEnd = merge!.points[merge!.points.length - 1]!;
        expect(scramble!.points[0]!.cx).toBeCloseTo(mergeEnd.cx, 10);
        expect(scramble!.points[0]!.cy).toBeCloseTo(mergeEnd.cy, 10);
      });
    });
  });

  test("locks mirrored multi-flight fighter roles, paths, and continuations", () => {
    const timeline = planAirShowTimeline(mirroredFullEngagementInput());
    const actorById = new Map(timeline.actors.map((actor) => [actor.actorId, actor] as const));
    const fighterTracks = timeline.tracks.filter((track) => track.role !== "bomber");

    expect(createHash("sha256").update(JSON.stringify(fighterTracks)).digest("hex")).toBe(
      "a866f694fe65ffdb580bce5d6fc79616beceb1ebc5ced7011668d8235edca647"
    );
    expect(timeline.verification.findings).toEqual([]);
    expect(fighterTracks).toHaveLength(12);
    fighterTracks.forEach((track) => {
      const actor = actorById.get(track.actorId);
      expect(actor).toBeDefined();
      expect(actor?.faction).toBe(track.role === "interceptor" ? "Player" : "Bot");
      const scrambleIndex = track.segments.findIndex((segment) => segment.label === "escort-clash-scramble");
      const scramble = track.segments[scrambleIndex]!;
      const continuation = track.segments[scrambleIndex + 1]!;
      expect(scrambleIndex).toBe(2);
      expect(continuation).toBeDefined();
      expect(continuation.startTimeMs).toBe(scramble.endTimeMs);
      expect(continuation.points[0]).toEqual(scramble.points[scramble.points.length - 1]);
    });
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

  test("keeps retimed strike effects attached to each bomber after escort synchronization", () => {
    const primary = bomber("bomber-primary");
    const wingman = bomber("bomber-wingman");
    const scene = {
      ...sceneFor("full-engagement"),
      bombers: [primary, wingman]
    };
    const timeline = planAirShowTimeline({ ...inputFor("full-engagement"), scene });
    const releaseCues = timeline.cues.filter((cue) => cue.kind === "bomb-release");
    const impactCue = timeline.cues.find((cue) => cue.kind === "impact");
    const bomberTracks = timeline.tracks.filter((track) => track.role === "bomber");

    expect(releaseCues).toHaveLength(bomberTracks.length);
    bomberTracks.forEach((track) => {
      const defensePass = track.segments.find((segment) => segment.label === "bomber-defense-pass");
      expect(defensePass).toBeDefined();
      const firstPoint = defensePass!.points[0]!;
      const lastPoint = defensePass!.points[defensePass!.points.length - 1]!;
      const directDurationMs = Math.hypot(
        lastPoint.cx - firstPoint.cx,
        lastPoint.cy - firstPoint.cy
      ) / AIR_SHOW_BOMBER_SPEED_PX_PER_MS;
      const realizedDelayMs = defensePass!.endTimeMs - defensePass!.startTimeMs - directDurationMs;
      expect(realizedDelayMs).toBeGreaterThan(0.001);
    });
    releaseCues.forEach((cue) => {
      const track = timeline.tracks.find((candidate) => candidate.actorId === cue.bomberActorId);
      const targetRun = track?.segments.find((segment) => segment.label === "target-run");
      expect(track).toBeDefined();
      expect(targetRun).toBeDefined();
      expect(cue.timeMs).toBeGreaterThanOrEqual(targetRun!.startTimeMs);
      expect(cue.timeMs).toBeLessThanOrEqual(targetRun!.endTimeMs);
      expect(sampleAirShowTimelineTrack(track!, cue.timeMs)).not.toBeNull();
    });
    const primaryRelease = releaseCues.find((cue) => cue.bomberActorId.includes(primary.id));
    expect(primaryRelease).toBeDefined();
    expect(impactCue?.timeMs).toBeCloseTo(primaryRelease!.timeMs + 320, 8);
    timeline.cues.filter((cue) => cue.kind === "flak").forEach((cue) => {
      const track = timeline.tracks.find((candidate) => candidate.actorId === cue.bomberActorId);
      expect(track).toBeDefined();
      expect(cue.timeMs).toBeGreaterThanOrEqual(track!.visibleFromMs);
      expect(cue.timeMs).toBeLessThanOrEqual(track!.visibleUntilMs);
      const activeSegment = track!.segments.find((segment) =>
        cue.timeMs >= segment.startTimeMs && cue.timeMs <= segment.endTimeMs
      );
      expect(activeSegment).toBeDefined();
      const sample = sampleAirShowTimelineTrack(track!, cue.timeMs);
      expect(sample).not.toBeNull();
      expect(sample!.segment).toBe(activeSegment);
      expect(sample!.segmentProgress).toBeGreaterThanOrEqual(0);
      expect(sample!.segmentProgress).toBeLessThanOrEqual(1);
      const cueOffsetPx = Math.hypot(
        cue.point.cx - sample!.point.cx,
        cue.point.cy - sample!.point.cy
      );
      expect(cueOffsetPx).toBeLessThanOrEqual(Math.hypot(27, 56) + 0.001);
    });
    expect(timeline.verification.findings).toEqual([]);
  });

  test("keeps a tutorial zero-strength bomber alive through target run and egress", () => {
    const zeroBomber = bomber("tutorial-bomber", 0);
    const scene = {
      ...sceneFor("strike-only"),
      bombers: [zeroBomber]
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
