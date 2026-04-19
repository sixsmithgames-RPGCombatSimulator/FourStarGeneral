import {
  HexMapRenderer,
  type AirShowInspectionReport,
  type ResolvedAirShowScene
} from "../src/rendering/HexMapRenderer";
import { buildResolvedAirCombatScene } from "../src/ui/airshow/ResolvedAirCombatSceneBuilder";
import { buildAirshowHarnessFixture } from "../src/testing/airshowHarnessFixture";
import { ensureDomEnvironment } from "./domEnvironment";

const fixture = buildAirshowHarnessFixture();

async function captureScene(): Promise<ResolvedAirShowScene> {
  const { scene } = buildResolvedAirCombatScene(
    fixture.engagement,
    {
      locKey: fixture.locKey,
      resolveOriginKey: (unitKey) =>
        fixture.originKeysByUnitId[unitKey as keyof typeof fixture.originKeysByUnitId] ?? null,
      resolveStrength: (unitKey) =>
        fixture.strengthByUnitId[unitKey as keyof typeof fixture.strengthByUnitId] ?? 100,
      linkedEscortFlights: fixture.linkedEscortFlights.map((flight) => ({
        unitKey: String(flight.unitKey),
        originKey: String(flight.originKey),
        unitType: String(flight.unitType),
        faction: flight.faction as "Player" | "Bot" | "Ally",
        strength: Number(flight.strength ?? 100)
      })),
      bomberOriginKey: fixture.bomberOriginKey,
      bomberTargetKey: fixture.bomberTargetKey,
      flakEvent: fixture.flakEvent,
      includeBomber: true,
      playerHqKey: fixture.playerHqKey,
      botHqKey: fixture.botHqKey
    }
  );
  return scene;
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

function inspectScene(scene: ResolvedAirShowScene): AirShowInspectionReport {
  ensureDomEnvironment();

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("width", "1600");
  svg.setAttribute("height", "1200");
  const canvas = document.createElement("div");
  document.body.appendChild(svg);
  document.body.appendChild(canvas);

  const restoreFetch = installRenderFetchMocks();
  const renderer = new HexMapRenderer();
  renderer.render(svg, canvas, fixture.renderScenario);

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
    const report = inspectScene(await captureScene());
    const targetRun = report.phases.find((phase) => phase.label === "target-run");

    expect(targetRun).toBeDefined();

    const visibleBomberAssignments = targetRun?.assignments.filter((assignment) => assignment.role === "bomber") ?? [];
    const bombReleaseProgress = 0.74;
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

  test("dogfight phases paint tracer bursts before bomber ingress in the 3 CAP / 2 escort package", async () => {
    const report = inspectScene(await captureScene());
    const bomberIngressIndex = report.phases.findIndex((phase) => phase.label === "bomber-ingress");
    const mergePhase = report.phases.find((phase) => phase.label === "escort-clash-merge");
    const scramblePhase = report.phases.find((phase) => phase.label === "escort-clash-scramble");

    expect(bomberIngressIndex).toBeGreaterThan(0);
    expect(mergePhase).toBeDefined();
    expect(scramblePhase).toBeDefined();
    expect(mergePhase?.tracers.length ?? 0).toBeGreaterThan(0);
    expect(scramblePhase?.tracers.length ?? 0).toBeGreaterThan(0);
  });

  test("target-run keeps four bomber actors visible and schedules flak bursts in the visual harness", async () => {
    const report = inspectScene(await captureScene());
    const targetRun = report.phases.find((phase) => phase.label === "target-run");

    expect(targetRun).toBeDefined();
    expect(targetRun?.assignments.filter((assignment) => assignment.role === "bomber")).toHaveLength(4);
    expect(targetRun?.flakBursts.length ?? 0).toBeGreaterThan(0);
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
});
