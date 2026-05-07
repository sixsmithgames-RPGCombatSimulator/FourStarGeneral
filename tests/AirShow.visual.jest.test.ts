import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import type {
  AirShowInspectionReport,
  ResolvedAirShowScene
} from "../src/ui/airshow/AirShowPlaybackScene";
import { buildResolvedAirCombatScene } from "../src/ui/airshow/ResolvedAirCombatSceneBuilder";
import {
  buildAirshowHarnessFixture,
  buildAirshowHarnessFixtureLarge,
  type AirshowHarnessFixture
} from "../src/testing/airshowHarnessFixture";
import { ensureDomEnvironment } from "./domEnvironment";

const fixture = buildAirshowHarnessFixture();
const largeFixture = buildAirshowHarnessFixtureLarge();

async function captureSceneForFixture(fixtureUnderTest: AirshowHarnessFixture): Promise<ResolvedAirShowScene> {
  const { scene } = buildResolvedAirCombatScene(
    fixtureUnderTest.engagement,
    {
      locKey: fixtureUnderTest.locKey,
      resolveOriginKey: (unitKey) =>
        fixtureUnderTest.originKeysByUnitId[unitKey as keyof typeof fixtureUnderTest.originKeysByUnitId] ?? null,
      resolveStrength: (unitKey) =>
        fixtureUnderTest.strengthByUnitId[unitKey as keyof typeof fixtureUnderTest.strengthByUnitId] ?? 100,
      linkedEscortFlights: fixtureUnderTest.linkedEscortFlights.map((flight) => ({
        unitKey: String(flight.unitKey),
        originKey: String(flight.originKey),
        unitType: String(flight.unitType),
        faction: flight.faction as "Player" | "Bot" | "Ally",
        strength: Number(flight.strength ?? 100)
      })),
      bomberOriginKey: fixtureUnderTest.bomberOriginKey,
      bomberTargetKey: fixtureUnderTest.bomberTargetKey,
      flakEvent: fixtureUnderTest.flakEvent,
      includeBomber: true,
      playerHqKey: fixtureUnderTest.playerHqKey,
      botHqKey: fixtureUnderTest.botHqKey
    }
  );
  return scene;
}

async function captureScene(): Promise<ResolvedAirShowScene> {
  return captureSceneForFixture(fixture);
}

function installRenderFetchMocks(): () => void {
  const originalFetch = globalThis.fetch?.bind(globalThis);
  const mockJsonResponse = (payload: unknown): Response =>
    ({
      ok: true,
      status: 200,
      json: async () => payload
    } as Response);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("data/effectSpecs.json")) {
      return mockJsonResponse([]);
    }
    if (url.endsWith("data/terrainTints.json")) {
      return mockJsonResponse([]);
    }
    if (url.endsWith("data/soundCatalog.json")) {
      return mockJsonResponse({ version: 1, assets: {} });
    }
    if (originalFetch) {
      return originalFetch(input as RequestInfo, init);
    }
    throw new Error(`Unexpected fetch during airshow jest harness: ${url}`);
  }) as typeof fetch;

  return () => {
    if (originalFetch) {
      globalThis.fetch = originalFetch;
    }
  };
}

function parseSvgViewBox(svg: SVGSVGElement): { x: number; y: number; width: number; height: number } {
  const rawViewBox = svg.getAttribute("viewBox");
  if (!rawViewBox) {
    throw new Error("Expected rendered SVG to expose a viewBox for airshow bounds inspection.");
  }
  const values = rawViewBox
    .trim()
    .split(/[ ,]+/)
    .map((value) => Number.parseFloat(value))
    .filter((value) => Number.isFinite(value));
  if (values.length !== 4) {
    throw new Error(`Expected SVG viewBox to contain four numeric values, received: ${rawViewBox}`);
  }
  const [x, y, width, height] = values;
  if (
    typeof x !== "number"
    || typeof y !== "number"
    || typeof width !== "number"
    || typeof height !== "number"
  ) {
    throw new Error(`Expected finite numeric SVG viewBox values, received: ${rawViewBox}`);
  }
  return { x, y, width, height };
}

function sampleFlightCenterAtProgress(
  phase: AirShowInspectionReport["phases"][number],
  flightId: string,
  targetProgress: number
): { cx: number; cy: number } | null {
  const assignments = phase.assignments.filter((assignment) => assignment.flightId === flightId);
  if (assignments.length === 0) {
    return null;
  }
  const nearestSamples = assignments.map((assignment) =>
    assignment.sampledPositions.reduce((closest, sample) =>
      Math.abs(sample.progress - targetProgress) < Math.abs(closest.progress - targetProgress) ? sample : closest
    )
  );
  return {
    cx: nearestSamples.reduce((sum, sample) => sum + sample.cx, 0) / nearestSamples.length,
    cy: nearestSamples.reduce((sum, sample) => sum + sample.cy, 0) / nearestSamples.length
  };
}

function sampleAssignmentAtProgress(
  assignment: AirShowInspectionReport["phases"][number]["assignments"][number],
  targetProgress: number
): { cx: number; cy: number } | null {
  const firstSample = assignment.sampledPositions[0];
  if (!firstSample) {
    return null;
  }
  const sample = assignment.sampledPositions.reduce((closest, candidate) =>
    Math.abs(candidate.progress - targetProgress) < Math.abs(closest.progress - targetProgress)
      ? candidate
      : closest
  );
  return { cx: sample.cx, cy: sample.cy };
}

function sampleRolePointsAtProgress(
  phase: AirShowInspectionReport["phases"][number],
  role: AirShowInspectionReport["phases"][number]["assignments"][number]["role"],
  targetProgress: number
): ReadonlyArray<{ cx: number; cy: number }> {
  return phase.assignments
    .filter((assignment) => assignment.role === role)
    .map((assignment) => sampleAssignmentAtProgress(assignment, targetProgress))
    .filter((point): point is { cx: number; cy: number } => !!point);
}

function nearestPointPairDistance(points: ReadonlyArray<{ cx: number; cy: number }>): number {
  let nearestDistancePx = Number.POSITIVE_INFINITY;
  for (let leftIndex = 0; leftIndex < points.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < points.length; rightIndex += 1) {
      const left = points[leftIndex];
      const right = points[rightIndex];
      if (!left || !right) {
        continue;
      }
      nearestDistancePx = Math.min(nearestDistancePx, Math.hypot(left.cx - right.cx, left.cy - right.cy));
    }
  }
  return nearestDistancePx;
}

function nearestRoleDistanceAtProgress(
  phase: AirShowInspectionReport["phases"][number],
  leftRole: AirShowInspectionReport["phases"][number]["assignments"][number]["role"],
  rightRole: AirShowInspectionReport["phases"][number]["assignments"][number]["role"],
  targetProgress: number
): number {
  const leftPoints = sampleRolePointsAtProgress(phase, leftRole, targetProgress);
  const rightPoints = sampleRolePointsAtProgress(phase, rightRole, targetProgress);
  return Math.min(
    ...leftPoints.flatMap((left) =>
      rightPoints.map((right) => Math.hypot(left.cx - right.cx, left.cy - right.cy))
    )
  );
}

function pointSpreadBox(points: ReadonlyArray<{ cx: number; cy: number }>): { width: number; height: number } {
  const xs = points.map((point) => point.cx);
  const ys = points.map((point) => point.cy);
  return {
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys)
  };
}

function measureSamplePathDistance(
  samples: ReadonlyArray<{ cx: number; cy: number }>
): number {
  let distancePx = 0;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (!previous || !current) {
      continue;
    }
    distancePx += Math.hypot(current.cx - previous.cx, current.cy - previous.cy);
  }
  return distancePx;
}

function maxMovingTurnDegrees(
  samples: ReadonlyArray<{ cx: number; cy: number }>
): number {
  let maxTurnDeg = 0;
  let previousVector: { x: number; y: number } | null = null;
  for (let index = 1; index < samples.length; index += 1) {
    const previous = samples[index - 1];
    const current = samples[index];
    if (!previous || !current) {
      continue;
    }
    const vector = {
      x: current.cx - previous.cx,
      y: current.cy - previous.cy
    };
    if (Math.hypot(vector.x, vector.y) < 4) {
      continue;
    }
    if (previousVector) {
      const turnDeg = Math.abs(
        Math.atan2(vector.y, vector.x) - Math.atan2(previousVector.y, previousVector.x)
      ) * 180 / Math.PI;
      maxTurnDeg = Math.max(maxTurnDeg, turnDeg > 180 ? 360 - turnDeg : turnDeg);
    }
    previousVector = vector;
  }
  return maxTurnDeg;
}

function createRuntimeActor(
  id: string,
  role: "interceptor" | "escort" | "bomber",
  formationIndex: number,
  position: { cx: number; cy: number }
): {
  id: string;
  flightId: string;
  role: "interceptor" | "escort" | "bomber";
  image: SVGImageElement;
  size: number;
  formationIndex: number;
  headingDegrees: number;
  position: { cx: number; cy: number };
  biasX: number;
  biasY: number;
  active: boolean;
} {
  return {
    id,
    flightId: `${id}-flight`,
    role,
    image: document.createElementNS("http://www.w3.org/2000/svg", "image") as SVGImageElement,
    size: 18,
    formationIndex,
    headingDegrees: 0,
    position: { cx: position.cx, cy: position.cy },
    biasX: 0,
    biasY: 0,
    active: true
  };
}

function inspectSceneForFixture(
  fixtureUnderTest: AirshowHarnessFixture,
  scene: ResolvedAirShowScene
): AirShowInspectionReport {
  ensureDomEnvironment();

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "1600");
  svg.setAttribute("height", "1200");
  const canvas = document.createElement("div");
  document.body.appendChild(svg);
  document.body.appendChild(canvas);

  const restoreFetch = installRenderFetchMocks();
  const renderer = new HexMapRenderer();
  renderer.render(svg, canvas, fixtureUnderTest.renderScenario);

  try {
    const report = (renderer as unknown as {
      inspectResolvedAirCombatShow: (candidate: ResolvedAirShowScene) => AirShowInspectionReport | null;
    }).inspectResolvedAirCombatShow(scene);

    if (!report) {
      throw new Error("Expected the renderer inspection path to produce an airshow report.");
    }

    return report;
  } finally {
    restoreFetch();
    svg.remove();
    canvas.remove();
  }
}

function inspectScene(scene: ResolvedAirShowScene): AirShowInspectionReport {
  return inspectSceneForFixture(fixture, scene);
}

describe("AirShow JEST Harness", () => {
  beforeEach(() => {
    ensureDomEnvironment();
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  test("resolved airshow scene builder reflects the contested package the app is meant to render", async () => {
    const scene = await captureScene();
    const report = inspectScene(scene);

    expect(scene.interceptors).toHaveLength(3);
    expect(scene.escorts).toHaveLength(2);
    expect(scene.bomber?.id).toBe("bomber-1");

    const phaseLabels = report.phases.map((phase) => phase.label);
    expect(phaseLabels).toEqual(
      expect.arrayContaining([
        "fighter-ingress",
        "escort-clash-merge",
        "escort-clash-scramble",
        "bomber-ingress",
        "bomber-defense-pass",
        "target-run",
        "egress"
      ])
    );

    const bomberIngress = report.phases.find((phase) => phase.label === "bomber-ingress");
    expect(bomberIngress).toBeDefined();
    expect(bomberIngress?.assignments.filter((assignment) => assignment.role === "bomber")).toHaveLength(4);
  });

  test("target-run keeps bomber actors assigned through bomb release and removes fighters from the strike lane", async () => {
    const scene = await captureScene();
    const report = inspectScene(scene);
    const targetRun = report.phases.find((phase) => phase.label === "target-run");

    expect(targetRun).toBeDefined();

    const visibleBomberAssignments = targetRun?.assignments.filter((assignment) => assignment.role === "bomber") ?? [];
    const bombReleaseProgress = scene.bombReleaseProgress ?? 0.5;
    expect(visibleBomberAssignments).toHaveLength(4);

    const bomberReleasePoints = visibleBomberAssignments.map((assignment) =>
      assignment.sampledPositions.reduce((closest, sample) =>
        Math.abs(sample.progress - bombReleaseProgress) < Math.abs(closest.progress - bombReleaseProgress) ? sample : closest
      )
    );
    const bomberReleaseCenter = {
      cx: bomberReleasePoints.reduce((sum, sample) => sum + sample.cx, 0) / bomberReleasePoints.length,
      cy: bomberReleasePoints.reduce((sum, sample) => sum + sample.cy, 0) / bomberReleasePoints.length
    };

    visibleBomberAssignments.forEach((assignment) => {
      const nearestSample = assignment.sampledPositions.reduce((closest, sample) =>
        Math.abs(sample.progress - bombReleaseProgress) < Math.abs(closest.progress - bombReleaseProgress) ? sample : closest
      );

      expect(Number.isFinite(nearestSample.cx)).toBe(true);
      expect(Number.isFinite(nearestSample.cy)).toBe(true);
    });

    const nonBomberAssignments = targetRun?.assignments.filter((assignment) => assignment.role !== "bomber") ?? [];
    nonBomberAssignments.forEach((assignment) => {
      const nearestSample = assignment.sampledPositions.reduce((closest, sample) =>
        Math.abs(sample.progress - bombReleaseProgress) < Math.abs(closest.progress - bombReleaseProgress) ? sample : closest
      );
      const distanceFromBomberLane = Math.hypot(
        nearestSample.cx - bomberReleaseCenter.cx,
        nearestSample.cy - bomberReleaseCenter.cy
      );
      expect(distanceFromBomberLane).toBeGreaterThan(60);
    });
  });

  test("fighter ingress keeps bombers trailing the screen instead of stripping them from the coordinated package", async () => {
    const report = inspectScene(await captureScene());
    const fighterIngress = report.phases.find((phase) => phase.label === "fighter-ingress");
    const scramblePhase = report.phases.find((phase) => phase.label === "escort-clash-scramble");

    expect(fighterIngress).toBeDefined();
    expect(scramblePhase).toBeDefined();

    const bomberAssignments = fighterIngress?.assignments.filter((assignment) => assignment.role === "bomber") ?? [];
    const fighterAssignments =
      fighterIngress?.assignments.filter(
        (assignment) => assignment.role === "interceptor" || assignment.role === "escort"
      ) ?? [];

    expect(bomberAssignments.length).toBeGreaterThan(0);
    expect(fighterAssignments.length).toBeGreaterThan(0);

    const ingressAssignments = fighterIngress?.assignments ?? [];
    const averageDistanceToCenter = (
      assignments: ReadonlyArray<(typeof ingressAssignments)[number]>
    ): number =>
      assignments.reduce((sum, assignment) => {
        const lastSample = assignment.sampledPositions[assignment.sampledPositions.length - 1];
        return sum + Math.hypot(lastSample.cx - report.center.cx, lastSample.cy - report.center.cy);
      }, 0) / assignments.length;

    expect(averageDistanceToCenter(bomberAssignments)).toBeGreaterThan(averageDistanceToCenter(fighterAssignments));
    expect(scramblePhase?.assignments.some((assignment) => assignment.role === "interceptor")).toBe(true);
    expect(scramblePhase?.assignments.some((assignment) => assignment.role === "escort")).toBe(true);
  });

  test("fighter ingress uses bounded preset rails instead of off-map hookback paths", async () => {
    const report = inspectScene(await captureScene());
    const fighterIngress = report.phases.find((phase) => phase.label === "fighter-ingress");

    expect(fighterIngress).toBeDefined();

    const fighterAssignments =
      fighterIngress?.assignments.filter(
        (assignment) => assignment.role === "interceptor" || assignment.role === "escort"
      ) ?? [];
    expect(fighterAssignments.length).toBeGreaterThan(0);

    fighterAssignments.forEach((assignment) => {
      const first = assignment.sampledPositions[0];
      const last = assignment.sampledPositions[assignment.sampledPositions.length - 1];
      expect(first).toBeDefined();
      expect(last).toBeDefined();
      const directDistancePx = Math.hypot((last?.cx ?? 0) - (first?.cx ?? 0), (last?.cy ?? 0) - (first?.cy ?? 0));
      const sampledDistancePx = measureSamplePathDistance(assignment.sampledPositions);

      expect(directDistancePx).toBeGreaterThan(180);
      expect(sampledDistancePx / directDistancePx).toBeLessThan(1.2);
      expect(maxMovingTurnDegrees(assignment.sampledPositions)).toBeLessThan(96);
    });
  });

  test("bomber ingress keeps fighter cover assignments moving instead of freezing the surviving fighters", async () => {
    const report = inspectScene(await captureScene());
    const bomberIngress = report.phases.find((phase) => phase.label === "bomber-ingress");

    expect(bomberIngress).toBeDefined();

    const bomberAssignments = bomberIngress?.assignments.filter((assignment) => assignment.role === "bomber") ?? [];
    const fighterAssignments =
      bomberIngress?.assignments.filter(
        (assignment) => assignment.role === "interceptor" || assignment.role === "escort"
      ) ?? [];

    expect(bomberAssignments.length).toBeGreaterThan(0);
    expect(fighterAssignments.length).toBeGreaterThan(0);

    const displacement = (assignment: (typeof fighterAssignments)[number]): number => {
      const first = assignment.sampledPositions[0];
      const last = assignment.sampledPositions[assignment.sampledPositions.length - 1];
      return Math.hypot((last?.cx ?? 0) - (first?.cx ?? 0), (last?.cy ?? 0) - (first?.cy ?? 0));
    };
    fighterAssignments.forEach((assignment) => {
      expect(displacement(assignment)).toBeGreaterThan(36);
    });
  });

  test("dogfight phases keep tracer bursts inside the clash windows with short forward sprays", async () => {
    const report = inspectScene(await captureScene());
    const bomberIngressIndex = report.phases.findIndex((phase) => phase.label === "bomber-ingress");
    const mergePhase = report.phases.find((phase) => phase.label === "escort-clash-merge");
    const scramblePhase = report.phases.find((phase) => phase.label === "escort-clash-scramble");
    const allDogfightTracers = [...(mergePhase?.tracers ?? []), ...(scramblePhase?.tracers ?? [])];
    const actorTargetedDogfightTracers = allDogfightTracers.filter((tracer) => !!tracer.targetActorId);

    expect(bomberIngressIndex).toBeGreaterThan(0);
    expect(mergePhase).toBeDefined();
    expect(scramblePhase).toBeDefined();
    expect(mergePhase?.tracers.length ?? 0).toBeGreaterThan(0);
    expect(scramblePhase?.tracers.length ?? 0).toBeGreaterThan(0);
    expect(actorTargetedDogfightTracers.length).toBeGreaterThan(0);
    expect(actorTargetedDogfightTracers.length).toBeGreaterThanOrEqual(
      Math.ceil(allDogfightTracers.length * 0.75)
    );
    expect(mergePhase?.tracers.every((tracer) => tracer.progress >= 0.5)).toBe(true);
    expect(
      scramblePhase?.tracers.filter((tracer) => tracer.progress >= 0.08 && tracer.progress <= 0.9).length
    ).toBeGreaterThanOrEqual(
      Math.ceil((scramblePhase?.tracers.length ?? 0) * 0.85)
    );
    expect(Math.max(...allDogfightTracers.map((tracer) => tracer.visibleLengthPx))).toBeLessThanOrEqual(14);
    expect(Math.max(...allDogfightTracers.map((tracer) => tracer.streakLengthPx))).toBeLessThanOrEqual(150);
  });

  test("escort clash merge converges paired flights and scramble switches into the local fight space", async () => {
    const scene = await captureScene();
    const report = inspectScene(scene);
    const mergePhase = report.phases.find((phase) => phase.label === "escort-clash-merge");
    const scramblePhase = report.phases.find((phase) => phase.label === "escort-clash-scramble");
    const uniquePairs = Array.from(
      new Map(
        (scene.escortExchanges ?? []).map((exchange) => [
          `${exchange.attackerUnitKey}:${exchange.defenderUnitKey}`,
          exchange
        ] as const)
      ).values()
    );

    expect(mergePhase).toBeDefined();
    expect(scramblePhase).toBeDefined();
    expect(uniquePairs.length).toBeGreaterThan(0);

    const escortFlightIds = Array.from(new Set(uniquePairs.map((pair) => pair.defenderUnitKey)));
    let switchedNearestOpponentCount = 0;

    uniquePairs.forEach((pair) => {
      const mergeInterceptor = sampleFlightCenterAtProgress(mergePhase!, pair.attackerUnitKey, 0.54);
      const mergeEscort = sampleFlightCenterAtProgress(mergePhase!, pair.defenderUnitKey, 0.54);

      expect(mergeInterceptor).not.toBeNull();
      expect(mergeEscort).not.toBeNull();
      expect(
        Math.hypot(
          (mergeInterceptor?.cx ?? 0) - (mergeEscort?.cx ?? 0),
          (mergeInterceptor?.cy ?? 0) - (mergeEscort?.cy ?? 0)
        )
      ).toBeLessThan(104);

      [0.48, 0.52, 0.62].forEach((progress) => {
        expect(nearestRoleDistanceAtProgress(mergePhase!, "interceptor", "escort", progress)).toBeLessThan(124);
      });

      [0.38, 0.54, 0.7].forEach((progress) => {
        const scrambleInterceptor = sampleFlightCenterAtProgress(scramblePhase!, pair.attackerUnitKey, progress);
        const originalScrambleEscort = sampleFlightCenterAtProgress(scramblePhase!, pair.defenderUnitKey, progress);
        expect(scrambleInterceptor).not.toBeNull();
        expect(originalScrambleEscort).not.toBeNull();
        const originalPairDistancePx = Math.hypot(
          (scrambleInterceptor?.cx ?? 0) - (originalScrambleEscort?.cx ?? 0),
          (scrambleInterceptor?.cy ?? 0) - (originalScrambleEscort?.cy ?? 0)
        );
        const nearestEscort = escortFlightIds
          .map((escortFlightId) => ({
            escortFlightId,
            point: sampleFlightCenterAtProgress(scramblePhase!, escortFlightId, progress)
          }))
          .filter((sample): sample is { escortFlightId: string; point: { cx: number; cy: number } } => !!sample.point)
          .map((sample) => ({
            escortFlightId: sample.escortFlightId,
            distancePx: Math.hypot(
              (scrambleInterceptor?.cx ?? 0) - sample.point.cx,
              (scrambleInterceptor?.cy ?? 0) - sample.point.cy
            )
          }))
          .sort((left, right) => left.distancePx - right.distancePx)[0];

        expect(nearestEscort).toBeDefined();
        expect(nearestEscort?.distancePx ?? Number.POSITIVE_INFINITY).toBeLessThan(190);
        if (
          nearestEscort
          && nearestEscort.escortFlightId !== pair.defenderUnitKey
          && nearestEscort.distancePx <= originalPairDistancePx + 24
        ) {
          switchedNearestOpponentCount += 1;
        }
      });
    });

    if (uniquePairs.length > 1) {
      expect(switchedNearestOpponentCount).toBeGreaterThan(0);
    }
  });

  test("escort clash keeps under-paired escorts closing into the local fight instead of stalling in a distant orbit", async () => {
    const scene = await captureScene();
    expect(scene.interceptors.length).toBeGreaterThan(1);
    expect(scene.escorts.length).toBeGreaterThan(1);
    expect((scene.escortExchanges?.length ?? 0)).toBeGreaterThan(0);

    const underPairedScene: ResolvedAirShowScene = {
      ...scene,
      escortExchanges: scene.escortExchanges?.slice(0, 1) ?? []
    };
    const report = inspectScene(underPairedScene);
    const mergePhase = report.phases.find((phase) => phase.label === "escort-clash-merge");
    const scramblePhase = report.phases.find((phase) => phase.label === "escort-clash-scramble");
    const interceptorFlightIds = underPairedScene.interceptors.map((flight) => flight.id);
    const escortFlightIds = underPairedScene.escorts.map((flight) => flight.id);

    expect(mergePhase).toBeDefined();
    expect(scramblePhase).toBeDefined();

    escortFlightIds.forEach((escortFlightId) => {
      const escortMergeStart = sampleFlightCenterAtProgress(mergePhase!, escortFlightId, 0.06);
      const scrambleProgressSamples = [0.38, 0.54, 0.7, 0.86];
      const escortScrambleSamples = scrambleProgressSamples
        .map((progress) => ({
          progress,
          point: sampleFlightCenterAtProgress(scramblePhase!, escortFlightId, progress)
        }))
        .filter((sample): sample is { progress: number; point: { cx: number; cy: number } } => !!sample.point);
      expect(escortMergeStart).not.toBeNull();
      expect(escortScrambleSamples.length).toBeGreaterThan(0);
      const nearestInterceptorDistanceAtMergeStartPx = Math.min(
        ...interceptorFlightIds
          .map((interceptorFlightId) => sampleFlightCenterAtProgress(mergePhase!, interceptorFlightId, 0.06))
          .filter((point): point is { cx: number; cy: number } => !!point)
          .map((interceptorPoint) =>
            Math.hypot(
              (escortMergeStart?.cx ?? 0) - interceptorPoint.cx,
              (escortMergeStart?.cy ?? 0) - interceptorPoint.cy
            )
          )
      );
      const nearestInterceptorDistanceDuringScramblePx = Math.min(
        ...escortScrambleSamples.map((escortScrambleSample) =>
          Math.min(
            ...interceptorFlightIds
              .map((interceptorFlightId) =>
                sampleFlightCenterAtProgress(scramblePhase!, interceptorFlightId, escortScrambleSample.progress)
              )
              .filter((point): point is { cx: number; cy: number } => !!point)
              .map((interceptorPoint) =>
                Math.hypot(
                  escortScrambleSample.point.cx - interceptorPoint.cx,
                  escortScrambleSample.point.cy - interceptorPoint.cy
                )
              )
          )
        )
      );
      expect(nearestInterceptorDistanceDuringScramblePx).toBeLessThan(170);
      expect(nearestInterceptorDistanceAtMergeStartPx - nearestInterceptorDistanceDuringScramblePx).toBeGreaterThan(85);
    });

    interceptorFlightIds.forEach((interceptorFlightId) => {
      const interceptorMergeStart = sampleFlightCenterAtProgress(mergePhase!, interceptorFlightId, 0.06);
      const scrambleProgressSamples = [0.38, 0.54, 0.7, 0.86];
      const interceptorScrambleSamples = scrambleProgressSamples
        .map((progress) => ({
          progress,
          point: sampleFlightCenterAtProgress(scramblePhase!, interceptorFlightId, progress)
        }))
        .filter((sample): sample is { progress: number; point: { cx: number; cy: number } } => !!sample.point);
      expect(interceptorMergeStart).not.toBeNull();
      expect(interceptorScrambleSamples.length).toBeGreaterThan(0);
      const nearestEscortDistanceAtMergeStartPx = Math.min(
        ...escortFlightIds
          .map((escortFlightId) => sampleFlightCenterAtProgress(mergePhase!, escortFlightId, 0.06))
          .filter((point): point is { cx: number; cy: number } => !!point)
          .map((escortPoint) =>
            Math.hypot(
              (interceptorMergeStart?.cx ?? 0) - escortPoint.cx,
              (interceptorMergeStart?.cy ?? 0) - escortPoint.cy
            )
          )
      );
      const nearestEscortDistanceDuringScramblePx = Math.min(
        ...interceptorScrambleSamples.map((interceptorScrambleSample) =>
          Math.min(
            ...escortFlightIds
              .map((escortFlightId) =>
                sampleFlightCenterAtProgress(scramblePhase!, escortFlightId, interceptorScrambleSample.progress)
              )
              .filter((point): point is { cx: number; cy: number } => !!point)
              .map((escortPoint) =>
                Math.hypot(
                  interceptorScrambleSample.point.cx - escortPoint.cx,
                  interceptorScrambleSample.point.cy - escortPoint.cy
                )
              )
          )
        )
      );
      expect(nearestEscortDistanceDuringScramblePx).toBeLessThan(170);
      expect(nearestEscortDistanceAtMergeStartPx - nearestEscortDistanceDuringScramblePx).toBeGreaterThan(85);
    });
  });

  test("escort clash still stages a full fight when escort exchanges are completely missing", async () => {
    const scene = await captureScene();
    const noExchangeScene: ResolvedAirShowScene = {
      ...scene,
      escortExchanges: []
    };
    const report = inspectScene(noExchangeScene);
    const mergePhase = report.phases.find((phase) => phase.label === "escort-clash-merge");
    const scramblePhase = report.phases.find((phase) => phase.label === "escort-clash-scramble");
    const interceptorFlightIds = noExchangeScene.interceptors.map((flight) => flight.id);
    const escortFlightIds = noExchangeScene.escorts.map((flight) => flight.id);

    expect(mergePhase).toBeDefined();
    expect(scramblePhase).toBeDefined();
    interceptorFlightIds.forEach((flightId) => {
      expect(mergePhase?.assignments.some((assignment) => assignment.flightId === flightId)).toBe(true);
      expect(scramblePhase?.assignments.some((assignment) => assignment.flightId === flightId)).toBe(true);
    });
    escortFlightIds.forEach((flightId) => {
      expect(mergePhase?.assignments.some((assignment) => assignment.flightId === flightId)).toBe(true);
      expect(scramblePhase?.assignments.some((assignment) => assignment.flightId === flightId)).toBe(true);
    });
  });

  test("target-run keeps four bomber actors visible and schedules flak bursts in the visual harness", async () => {
    const scene = await captureScene();
    const report = inspectScene(scene);
    const targetRun = report.phases.find((phase) => phase.label === "target-run");

    expect(targetRun).toBeDefined();
    expect(targetRun?.assignments.filter((assignment) => assignment.role === "bomber")).toHaveLength(4);
    expect(targetRun?.flakBursts.length ?? 0).toBeGreaterThan(0);
    const bomberMidRunPoints = targetRun ? sampleRolePointsAtProgress(targetRun, "bomber", 0.55) : [];
    expect(bomberMidRunPoints).toHaveLength(4);
    expect(nearestPointPairDistance(bomberMidRunPoints)).toBeGreaterThan(54);
    const bomberSpread = pointSpreadBox(bomberMidRunPoints);
    expect(Math.max(bomberSpread.width, bomberSpread.height)).toBeGreaterThan(92);
    const latestFlakProgress = Math.max(...(targetRun?.flakBursts.map((burst) => burst.progress) ?? [0]));
    expect(latestFlakProgress).toBeGreaterThan(scene.bombReleaseProgress ?? 0.5);
    expect(latestFlakProgress).toBeLessThanOrEqual(0.86);
    const flakBursts = targetRun?.flakBursts ?? [];
    const meanFlakWidthPx =
      flakBursts.reduce((sum, burst) => sum + burst.widthPx, 0) / Math.max(1, flakBursts.length);
    const flakPuffCount = flakBursts.reduce((sum, burst) => sum + burst.puffCount, 0);
    const flakFlashCount = flakBursts.reduce((sum, burst) => sum + burst.flashCount, 0);
    expect(flakBursts.every((burst) => burst.puffCount > 1)).toBe(true);
    expect(flakBursts.some((burst) => burst.smokePuffCount > burst.flashCount)).toBe(true);
    expect(meanFlakWidthPx).toBeGreaterThanOrEqual(150);
    expect(flakFlashCount).toBeLessThanOrEqual(Math.max(10, Math.round(flakPuffCount * 0.36)));
    const flakPointBuckets = new Map<string, number>();
    flakBursts.forEach((burst) => {
      burst.points.forEach((point) => {
        const key = `${Math.round(point.cx / 38)}:${Math.round(point.cy / 38)}`;
        flakPointBuckets.set(key, (flakPointBuckets.get(key) ?? 0) + 1);
      });
    });
    expect(Math.max(...flakPointBuckets.values())).toBeLessThanOrEqual(4);
    expect(new Set(targetRun?.flakBursts.map((burst) => burst.progress.toFixed(3))).size ?? 0).toBeGreaterThan(4);
    const flakProgressBuckets = new Map<number, number>();
    targetRun?.flakBursts.forEach((burst) => {
      const bucket = Math.round(burst.progress / 0.015);
      flakProgressBuckets.set(bucket, (flakProgressBuckets.get(bucket) ?? 0) + 1);
    });
    const mostStackedBucket = Math.max(...flakProgressBuckets.values());
    expect(mostStackedBucket).toBeLessThanOrEqual(
      Math.max(3, Math.ceil((targetRun?.flakBursts.length ?? 0) * 0.09))
    );
  });

  test("target-run flak targets the sampled bomber path instead of the ground target anchor", async () => {
    const report = inspectScene(await captureScene());
    const targetRun = report.phases.find((phase) => phase.label === "target-run");
    const firstBurst = targetRun?.flakBursts[0];
    const bomberAssignments = targetRun?.assignments.filter((assignment) => assignment.role === "bomber") ?? [];
    const bomberAssignment =
      bomberAssignments.find((assignment) => assignment.flightId === firstBurst?.bomberUnitKey)
      ?? bomberAssignments[0];

    expect(targetRun).toBeDefined();
    expect(firstBurst).toBeDefined();
    expect(firstBurst?.targetSource).toBe("bomberPath");
    expect(bomberAssignment).toBeDefined();

    const closestBomberCenter = sampleFlightCenterAtProgress(
      targetRun!,
      bomberAssignment?.flightId ?? "",
      firstBurst?.progress ?? 0
    );

    expect(closestBomberCenter).not.toBeNull();

    const bomberTrackOffsetPx = Math.hypot(
      (firstBurst?.targetCenter.cx ?? 0) - (closestBomberCenter?.cx ?? 0),
      (firstBurst?.targetCenter.cy ?? 0) - (closestBomberCenter?.cy ?? 0)
    );

    expect(bomberTrackOffsetPx).toBeLessThan(28);
  });

  test("contested package keeps the fighter clash alive longer and closes bomber contact sooner", async () => {
    const scene = await captureScene();
    const report = inspectScene(scene);
    const mergePhase = report.phases.find((phase) => phase.label === "escort-clash-merge");
    const scramblePhase = report.phases.find((phase) => phase.label === "escort-clash-scramble");
    const bomberIngressPhase = report.phases.find((phase) => phase.label === "bomber-ingress");
    const fighterFlightIds = [
      ...scene.interceptors.map((flight) => flight.id),
      ...scene.escorts.map((flight) => flight.id)
    ];
    const bomberFlightIds =
      scene.bombers?.map((flight) => flight.id)
      ?? (scene.bomber ? [scene.bomber.id] : []);

    expect(mergePhase).toBeDefined();
    expect(scramblePhase).toBeDefined();
    expect(bomberIngressPhase).toBeDefined();

    const clashDurationMs = (mergePhase?.durationMs ?? 0) + (scramblePhase?.durationMs ?? 0);
    expect(clashDurationMs).toBeGreaterThan(bomberIngressPhase?.durationMs ?? 0);
    [0.48, 0.52, 0.62].forEach((progress) => {
      expect(nearestRoleDistanceAtProgress(mergePhase!, "interceptor", "escort", progress)).toBeLessThan(124);
    });
    [0.38, 0.54, 0.7].forEach((progress) => {
      expect(nearestRoleDistanceAtProgress(scramblePhase!, "interceptor", "escort", progress)).toBeLessThan(156);
    });

    const nearestFighterBomberDistanceAtScrambleEndPx = Math.min(
      ...fighterFlightIds.flatMap((fighterFlightId) => {
        const fighterPoint = sampleFlightCenterAtProgress(scramblePhase!, fighterFlightId, 0.84);
        if (!fighterPoint) {
          return [];
        }
        return bomberFlightIds
          .map((bomberFlightId) => sampleFlightCenterAtProgress(scramblePhase!, bomberFlightId, 0.84))
          .filter((point): point is { cx: number; cy: number } => !!point)
          .map((bomberPoint) =>
            Math.hypot(
              fighterPoint.cx - bomberPoint.cx,
              fighterPoint.cy - bomberPoint.cy
            )
          );
      })
    );

    expect(Number.isFinite(nearestFighterBomberDistanceAtScrambleEndPx)).toBe(true);
    expect(nearestFighterBomberDistanceAtScrambleEndPx).toBeLessThan(260);
  });

  test("target-run does not fan a scoped flak burst across the whole bomber package", async () => {
    const scene = await captureScene();
    const scopedBomberId =
      scene.bombers?.[1]?.id
      ?? scene.bomber?.id
      ?? null;
    expect(scopedBomberId).not.toBeNull();

    const scopedScene: ResolvedAirShowScene = {
      ...scene,
      flakBursts: [
        {
          progress: 0.46,
          count: 1,
          puffCount: 5,
          smokePuffCount: 7,
          bomberUnitKey: scopedBomberId,
          targetHexKey: scene.bomberTargetHexKey ?? scene.bomber?.targetHexKey ?? null
        },
        {
          progress: 0.6,
          count: 1,
          puffCount: 5,
          smokePuffCount: 7,
          targetHexKey: scene.bomberTargetHexKey ?? scene.bomber?.targetHexKey ?? null
        }
      ]
    };
    const report = inspectScene(scopedScene);
    const targetRun = report.phases.find((phase) => phase.label === "target-run");

    expect(targetRun).toBeDefined();
    expect(targetRun?.flakBursts.length ?? 0).toBeGreaterThan(0);
    expect(targetRun?.flakBursts.every((burst) => burst.bomberUnitKey === scopedBomberId)).toBe(true);
    expect(targetRun?.flakBursts.some((burst) => !burst.bomberUnitKey)).toBe(false);
  });

  test("flak-delivered bomber kills stay visible through target-run and drop before egress", async () => {
    const scene = await captureScene();
    const flakKilledScene: ResolvedAirShowScene = {
      ...scene,
      bomber: scene.bomber
        ? {
            ...scene.bomber,
            strengthAfterEscortPhase: Math.max(scene.bomber.strengthAfterEscortPhase ?? scene.bomber.strengthBefore, 48),
            finalStrength: 0
          }
        : scene.bomber,
      bombers: scene.bombers?.map((bomber) => ({
        ...bomber,
        strengthAfterEscortPhase: Math.max(bomber.strengthAfterEscortPhase ?? bomber.strengthBefore, 48),
        finalStrength: 0
      }))
    };
    const report = inspectScene(flakKilledScene);
    const targetRun = report.phases.find((phase) => phase.label === "target-run");
    const egress = report.phases.find((phase) => phase.label === "egress");

    expect(targetRun).toBeDefined();
    expect(targetRun?.flakBursts.length ?? 0).toBeGreaterThan(0);
    expect(targetRun?.assignments.some((assignment) => assignment.role === "bomber")).toBe(true);
    expect(egress?.assignments.some((assignment) => assignment.role === "bomber")).toBe(false);
  });

  test("bomber-defense-pass keeps fighter fire denser than turret fire while staying in short bursts", async () => {
    const report = inspectScene(await captureScene());
    const bomberDefensePass = report.phases.find((phase) => phase.label === "bomber-defense-pass");
    const fighterTracers = bomberDefensePass?.tracers.filter((tracer) => tracer.emitter === "nose") ?? [];
    const turretTracers = bomberDefensePass?.tracers.filter((tracer) => tracer.emitter === "center") ?? [];
    const tracerVisibleLengths = bomberDefensePass?.tracers.map((tracer) => tracer.visibleLengthPx) ?? [];
    const tracerLifetimes = bomberDefensePass?.tracers.map((tracer) => tracer.lifetimeMs ?? 0) ?? [];

    expect(bomberDefensePass).toBeDefined();
    expect(fighterTracers.length).toBeGreaterThan(0);
    expect(turretTracers.length).toBeGreaterThan(0);
    expect(fighterTracers.some((tracer) => !!tracer.targetActorId)).toBe(true);
    expect(turretTracers.some((tracer) => !!tracer.targetActorId)).toBe(true);
    expect(Math.max(...tracerVisibleLengths)).toBeLessThanOrEqual(14);
    expect(Math.max(...tracerLifetimes)).toBeLessThanOrEqual(44);
    expect(
      fighterTracers.reduce((sum, tracer) => sum + (tracer.width ?? 0), 0) / fighterTracers.length
    ).toBeGreaterThan(
      turretTracers.reduce((sum, tracer) => sum + (tracer.width ?? 0), 0) / turretTracers.length
    );
    expect(
      fighterTracers.reduce((sum, tracer) => sum + tracer.visibleLengthPx, 0) / fighterTracers.length
    ).toBeGreaterThanOrEqual(
      turretTracers.reduce((sum, tracer) => sum + tracer.visibleLengthPx, 0) / turretTracers.length
    );
  });

  test("bomber-defense-pass still commits every interceptor into a bomber pass when live pairings are missing", async () => {
    const scene = await captureScene();
    const reducedPassScene: ResolvedAirShowScene = {
      ...scene,
      bomberPassExchanges: []
    };
    const report = inspectScene(reducedPassScene);
    const bomberDefensePass = report.phases.find((phase) => phase.label === "bomber-defense-pass");
    const fighterTracers = bomberDefensePass?.tracers.filter((tracer) => tracer.emitter === "nose") ?? [];
    const bomberFlightIds =
      reducedPassScene.bombers?.map((flight) => flight.id)
      ?? (reducedPassScene.bomber ? [reducedPassScene.bomber.id] : []);

    expect(bomberDefensePass).toBeDefined();
    expect(fighterTracers.length).toBeGreaterThan(0);
    expect(fighterTracers.some((tracer) => !!tracer.targetActorId || !!tracer.targetPoint)).toBe(true);
    reducedPassScene.interceptors.forEach((interceptorFlight) => {
      const nearestBomberDistancePx = Math.min(
        ...[0.18, 0.34, 0.5, 0.66, 0.82].flatMap((progress) => {
          const interceptorPoint = sampleFlightCenterAtProgress(
            bomberDefensePass!,
            interceptorFlight.id,
            progress
          );
          if (!interceptorPoint) {
            return [];
          }
          return bomberFlightIds
            .map((bomberFlightId) =>
              sampleFlightCenterAtProgress(bomberDefensePass!, bomberFlightId, progress)
            )
            .filter((point): point is { cx: number; cy: number } => !!point)
            .map((bomberPoint) =>
              Math.hypot(
                interceptorPoint.cx - bomberPoint.cx,
                interceptorPoint.cy - bomberPoint.cy
              )
            );
        })
      );
      expect(Number.isFinite(nearestBomberDistancePx)).toBe(true);
      expect(nearestBomberDistancePx).toBeLessThan(135);
    });
  });

  test("inspection report exposes deterministic off-map origins and measured phase timing audit", async () => {
    const report = inspectScene(await captureScene());

    expect(report.originPlan).not.toBeNull();
    const originPlan = report.originPlan!;
    const playerOffsetPx = Math.hypot(
      originPlan.playerOrigin.cx - originPlan.playerBoundary.cx,
      originPlan.playerOrigin.cy - originPlan.playerBoundary.cy
    );
    const botOffsetPx = Math.hypot(
      originPlan.botOrigin.cx - originPlan.botBoundary.cx,
      originPlan.botOrigin.cy - originPlan.botBoundary.cy
    );

    expect(playerOffsetPx).toBeCloseTo(500, 1);
    expect(botOffsetPx).toBeCloseTo(500, 1);

    const ingressAudit = report.phaseTimingAudit.find((phase) => phase.label === "fighter-ingress");
    expect(ingressAudit).toBeDefined();

    const interceptorAudit = ingressAudit?.roles.find((role) => role.role === "interceptor");
    const bomberAudit = ingressAudit?.roles.find((role) => role.role === "bomber");

    expect(interceptorAudit?.meanPathLengthPx ?? 0).toBeGreaterThan(0);
    expect(bomberAudit?.meanPathLengthPx ?? 0).toBeGreaterThan(0);
    expect(Math.abs((interceptorAudit?.speedDeltaPxPerMs ?? 1))).toBeLessThan(0.03);
    expect(Math.abs((bomberAudit?.speedDeltaPxPerMs ?? 1))).toBeLessThan(0.05);
  });

  test("large-map bomber egress does not hairpin through an abrupt reversal", async () => {
    const report = inspectSceneForFixture(largeFixture, await captureSceneForFixture(largeFixture));
    const egress = report.phases.find((phase) => phase.label === "egress");

    expect(egress).toBeDefined();

    const bomberAssignments = egress?.assignments.filter((assignment) => assignment.role === "bomber") ?? [];
    expect(bomberAssignments).toHaveLength(4);

    bomberAssignments.forEach((assignment) => {
      const earlySamples = assignment.sampledPositions.filter((sample) => sample.progress <= 0.36);
      expect(earlySamples.length).toBeGreaterThanOrEqual(4);

      let maxTurnDeg = 0;
      for (let index = 2; index < earlySamples.length; index += 1) {
        const previous = earlySamples[index - 2]!;
        const current = earlySamples[index - 1]!;
        const next = earlySamples[index]!;
        const turnDeg = Math.abs(
          Math.atan2(next.cy - current.cy, next.cx - current.cx)
          - Math.atan2(current.cy - previous.cy, current.cx - previous.cx)
        ) * 180 / Math.PI;
        const normalizedTurnDeg = turnDeg > 180 ? 360 - turnDeg : turnDeg;
        maxTurnDeg = Math.max(maxTurnDeg, normalizedTurnDeg);
      }

      expect(maxTurnDeg).toBeLessThan(120);
    });
  });

  test("renderer visible bounds follow the focused viewport instead of the whole map", () => {
    ensureDomEnvironment();

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("id", "battleHexMap");
    svg.setAttribute("width", "1600");
    svg.setAttribute("height", "1200");
    const canvas = document.createElement("div");
    canvas.id = "battleMapCanvas";
    document.body.appendChild(svg);
    document.body.appendChild(canvas);

    const restoreFetch = installRenderFetchMocks();
    const renderer = new HexMapRenderer();
    renderer.render(svg, canvas, largeFixture.renderScenario);

    try {
      const viewportRoot = renderer.getViewportRoot();
      expect(viewportRoot).not.toBeNull();

      viewportRoot?.setAttribute("transform", "translate(-480, -360) scale(2)");
      const viewBox = parseSvgViewBox(svg);
      const bounds = (renderer as unknown as {
        resolveAirShowVisibleBounds: () => { minX: number; maxX: number; minY: number; maxY: number } | null;
      }).resolveAirShowVisibleBounds();

      expect(bounds).not.toBeNull();

      const expected = {
        minX: (viewBox.x + 480) / 2,
        maxX: (viewBox.x + viewBox.width + 480) / 2,
        minY: (viewBox.y + 360) / 2,
        maxY: (viewBox.y + viewBox.height + 360) / 2
      };

      expect(bounds?.minX).toBeCloseTo(expected.minX, 4);
      expect(bounds?.maxX).toBeCloseTo(expected.maxX, 4);
      expect(bounds?.minY).toBeCloseTo(expected.minY, 4);
      expect(bounds?.maxY).toBeCloseTo(expected.maxY, 4);
      expect((bounds?.maxX ?? 0) - (bounds?.minX ?? 0)).toBeCloseTo(viewBox.width / 2, 4);
      expect((bounds?.maxY ?? 0) - (bounds?.minY ?? 0)).toBeCloseTo(viewBox.height / 2, 4);
    } finally {
      restoreFetch();
      svg.remove();
      canvas.remove();
    }
  });

  test("runtime seed flights keep bombers active at scene start even when final strength is zero", async () => {
    const scene = await captureScene();
    const destroyedBomberScene: ResolvedAirShowScene = {
      ...scene,
      bomber: scene.bomber
        ? {
            ...scene.bomber,
            finalStrength: 0
          }
        : scene.bomber,
      bombers: scene.bombers?.map((bomber) => ({
        ...bomber,
        finalStrength: 0
      }))
    };
    const report = inspectScene(destroyedBomberScene);
    const bomberFlight = report.flights.find((flight) => flight.role === "bomber");

    expect(bomberFlight).toBeDefined();
    expect(bomberFlight?.strengthBefore).toBeGreaterThan(0);
    expect(bomberFlight?.finalStrength).toBe(0);
    expect(bomberFlight?.actors.length).toBeGreaterThan(0);
    expect(bomberFlight?.actors.every((actor) => actor.active)).toBe(true);
  });

  test("runAirShowPhase respects the planned phase visibility instead of reviving unrelated active actors", async () => {
    ensureDomEnvironment();

    const renderer = new HexMapRenderer();
    const leadActor = createRuntimeActor("lead-bomber", "bomber", 0, { cx: 100, cy: 120 });
    const wingActor = createRuntimeActor("wing-bomber", "bomber", 1, { cx: 118, cy: 132 });
    const assignment = {
      actor: leadActor,
      points: [
        { cx: 100, cy: 120 },
        { cx: 154, cy: 126 }
      ],
      headingBlend: 0.34
    };

    await (renderer as unknown as {
      runAirShowPhase: (
        assignments: ReadonlyArray<typeof assignment>,
        durationMs: number,
        tracerBursts?: ReadonlyArray<unknown>,
        options?: {
          sceneActors?: ReadonlyArray<typeof leadActor>;
          visibleActorIds?: ReadonlyArray<string>;
          phaseLabel?: string;
        }
      ) => Promise<void>;
    }).runAirShowPhase(
      [assignment],
      1,
      [],
      {
        sceneActors: [leadActor, wingActor],
        visibleActorIds: [leadActor.id],
        phaseLabel: "subset-visibility-regression"
      }
    );

    expect(leadActor.image.style.opacity).toBe("1");
    expect(wingActor.image.style.opacity).toBe("0");
    expect(wingActor.image.getAttribute("data-airshow-active")).toBe("false");
  });
});
