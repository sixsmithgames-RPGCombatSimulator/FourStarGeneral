import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import { buildResolvedAirCombatScene } from "../src/ui/airshow/ResolvedAirCombatSceneBuilder";
import { buildAirshowHarnessFixture } from "../src/testing/airshowHarnessFixture";
import { ensureDomEnvironment } from "./domEnvironment";
const fixture = buildAirshowHarnessFixture();
async function captureScene() {
    const { scene } = buildResolvedAirCombatScene(fixture.engagement, {
        locKey: fixture.locKey,
        resolveOriginKey: (unitKey) => fixture.originKeysByUnitId[unitKey] ?? null,
        resolveStrength: (unitKey) => fixture.strengthByUnitId[unitKey] ?? 100,
        linkedEscortFlights: fixture.linkedEscortFlights.map((flight) => ({
            unitKey: String(flight.unitKey),
            originKey: String(flight.originKey),
            unitType: String(flight.unitType),
            faction: flight.faction,
            strength: Number(flight.strength ?? 100)
        })),
        bomberOriginKey: fixture.bomberOriginKey,
        bomberTargetKey: fixture.bomberTargetKey,
        flakEvent: fixture.flakEvent,
        includeBomber: true
    });
    return scene;
}
function installRenderFetchMocks() {
    const originalFetch = globalThis.fetch?.bind(globalThis);
    const mockJsonResponse = (payload) => ({
        ok: true,
        status: 200,
        json: async () => payload
    });
    globalThis.fetch = (async (input, init) => {
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
            return originalFetch(input, init);
        }
        throw new Error(`Unexpected fetch during airshow jest harness: ${url}`);
    });
    return () => {
        if (originalFetch) {
            globalThis.fetch = originalFetch;
        }
    };
}
function inspectScene(scene) {
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
        const report = renderer.inspectResolvedAirCombatShow(scene);
        if (!report) {
            throw new Error("Expected the renderer inspection path to produce an airshow report.");
        }
        return report;
    }
    finally {
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
        expect(phaseLabels).toEqual(expect.arrayContaining([
            "fighter-ingress",
            "escort-clash-merge",
            "escort-clash-scramble",
            "bomber-ingress",
            "bomber-defense-pass",
            "target-run",
            "egress"
        ]));
        const bomberIngress = report.phases.find((phase) => phase.label === "bomber-ingress");
        expect(bomberIngress).toBeDefined();
        expect(bomberIngress?.assignments.filter((assignment) => assignment.role === "bomber")).toHaveLength(4);
    });
    test("target-run keeps bomber actors assigned through bomb release and removes fighters from the strike lane", async () => {
        const report = inspectScene(await captureScene());
        const targetRun = report.phases.find((phase) => phase.label === "target-run");
        expect(targetRun).toBeDefined();
        const visibleBomberAssignments = targetRun?.assignments.filter((assignment) => assignment.role === "bomber") ?? [];
        expect(visibleBomberAssignments).toHaveLength(4);
        expect(targetRun?.assignments.some((assignment) => assignment.role !== "bomber")).toBe(false);
        const bombReleaseProgress = 0.74;
        visibleBomberAssignments.forEach((assignment) => {
            const nearestSample = assignment.sampledPositions.reduce((closest, sample) => Math.abs(sample.progress - bombReleaseProgress) < Math.abs(closest.progress - bombReleaseProgress) ? sample : closest);
            expect(Number.isFinite(nearestSample.cx)).toBe(true);
            expect(Number.isFinite(nearestSample.cy)).toBe(true);
        });
    });
    test("fighter beats stay separate from bomber ingress so the harness catches drift and arrival-order regressions", async () => {
        const report = inspectScene(await captureScene());
        const bomberIngressIndex = report.phases.findIndex((phase) => phase.label === "bomber-ingress");
        expect(bomberIngressIndex).toBeGreaterThan(0);
        const fighterOnlyPhases = report.phases.slice(0, bomberIngressIndex);
        fighterOnlyPhases.forEach((phase) => {
            expect(phase.assignments.some((assignment) => assignment.role === "bomber")).toBe(false);
        });
        const scramblePhase = report.phases.find((phase) => phase.label === "escort-clash-scramble");
        expect(scramblePhase).toBeDefined();
        expect(scramblePhase?.assignments.some((assignment) => assignment.role === "interceptor")).toBe(true);
        expect(scramblePhase?.assignments.some((assignment) => assignment.role === "escort")).toBe(true);
    });
});
