import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import { buildResolvedAirCombatScene } from "../src/ui/airshow/ResolvedAirCombatSceneBuilder";
import { buildAirshowHarnessFixture, buildAirshowHarnessFixtureLarge } from "../src/testing/airshowHarnessFixture";
import { ensureDomEnvironment } from "./domEnvironment";
const fixture = buildAirshowHarnessFixture();
const largeFixture = buildAirshowHarnessFixtureLarge();
async function captureSceneForFixture(fixtureUnderTest) {
    const { scene } = buildResolvedAirCombatScene(fixtureUnderTest.engagement, {
        locKey: fixtureUnderTest.locKey,
        resolveOriginKey: (unitKey) => fixtureUnderTest.originKeysByUnitId[unitKey] ?? null,
        resolveStrength: (unitKey) => fixtureUnderTest.strengthByUnitId[unitKey] ?? 100,
        linkedEscortFlights: fixtureUnderTest.linkedEscortFlights.map((flight) => ({
            unitKey: String(flight.unitKey),
            originKey: String(flight.originKey),
            unitType: String(flight.unitType),
            faction: flight.faction,
            strength: Number(flight.strength ?? 100)
        })),
        bomberOriginKey: fixtureUnderTest.bomberOriginKey,
        bomberTargetKey: fixtureUnderTest.bomberTargetKey,
        flakEvent: fixtureUnderTest.flakEvent,
        includeBomber: true,
        playerHqKey: fixtureUnderTest.playerHqKey,
        botHqKey: fixtureUnderTest.botHqKey
    });
    return scene;
}
async function captureScene() {
    return captureSceneForFixture(fixture);
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
function parseSvgViewBox(svg) {
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
    if (typeof x !== "number"
        || typeof y !== "number"
        || typeof width !== "number"
        || typeof height !== "number") {
        throw new Error(`Expected finite numeric SVG viewBox values, received: ${rawViewBox}`);
    }
    return { x, y, width, height };
}
function inspectSceneForFixture(fixtureUnderTest, scene) {
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
function inspectScene(scene) {
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
        const bombReleaseProgress = 0.74;
        expect(visibleBomberAssignments).toHaveLength(4);
        const bomberReleasePoints = visibleBomberAssignments.map((assignment) => assignment.sampledPositions.reduce((closest, sample) => Math.abs(sample.progress - bombReleaseProgress) < Math.abs(closest.progress - bombReleaseProgress) ? sample : closest));
        const bomberReleaseCenter = {
            cx: bomberReleasePoints.reduce((sum, sample) => sum + sample.cx, 0) / bomberReleasePoints.length,
            cy: bomberReleasePoints.reduce((sum, sample) => sum + sample.cy, 0) / bomberReleasePoints.length
        };
        visibleBomberAssignments.forEach((assignment) => {
            const nearestSample = assignment.sampledPositions.reduce((closest, sample) => Math.abs(sample.progress - bombReleaseProgress) < Math.abs(closest.progress - bombReleaseProgress) ? sample : closest);
            expect(Number.isFinite(nearestSample.cx)).toBe(true);
            expect(Number.isFinite(nearestSample.cy)).toBe(true);
        });
        const nonBomberAssignments = targetRun?.assignments.filter((assignment) => assignment.role !== "bomber") ?? [];
        nonBomberAssignments.forEach((assignment) => {
            const nearestSample = assignment.sampledPositions.reduce((closest, sample) => Math.abs(sample.progress - bombReleaseProgress) < Math.abs(closest.progress - bombReleaseProgress) ? sample : closest);
            const distanceFromBomberLane = Math.hypot(nearestSample.cx - bomberReleaseCenter.cx, nearestSample.cy - bomberReleaseCenter.cy);
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
        const fighterAssignments = fighterIngress?.assignments.filter((assignment) => assignment.role === "interceptor" || assignment.role === "escort") ?? [];
        expect(bomberAssignments.length).toBeGreaterThan(0);
        expect(fighterAssignments.length).toBeGreaterThan(0);
        const ingressAssignments = fighterIngress?.assignments ?? [];
        const averageDistanceToCenter = (assignments) => assignments.reduce((sum, assignment) => {
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
        const originPlan = report.originPlan;
        const playerOffsetPx = Math.hypot(originPlan.playerOrigin.cx - originPlan.playerBoundary.cx, originPlan.playerOrigin.cy - originPlan.playerBoundary.cy);
        const botOffsetPx = Math.hypot(originPlan.botOrigin.cx - originPlan.botBoundary.cx, originPlan.botOrigin.cy - originPlan.botBoundary.cy);
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
                const previous = earlySamples[index - 2];
                const current = earlySamples[index - 1];
                const next = earlySamples[index];
                const turnDeg = Math.abs(Math.atan2(next.cy - current.cy, next.cx - current.cx)
                    - Math.atan2(current.cy - previous.cy, current.cx - previous.cx)) * 180 / Math.PI;
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
            const bounds = renderer.resolveAirShowVisibleBounds();
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
        }
        finally {
            restoreFetch();
            svg.remove();
            canvas.remove();
        }
    });
    test("runtime seed flights keep bombers active at scene start even when final strength is zero", async () => {
        const scene = await captureScene();
        const destroyedBomberScene = {
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
});
