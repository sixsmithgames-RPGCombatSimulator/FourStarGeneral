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
function createRuntimeActor(id, role, formationIndex, position) {
    return {
        id,
        flightId: `${id}-flight`,
        role,
        image: document.createElementNS("http://www.w3.org/2000/svg", "image"),
        size: 18,
        formationIndex,
        headingDegrees: 0,
        position: { cx: position.cx, cy: position.cy },
        biasX: 0,
        biasY: 0,
        active: true
    };
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
        const scene = await captureScene();
        const report = inspectScene(scene);
        const targetRun = report.phases.find((phase) => phase.label === "target-run");
        expect(targetRun).toBeDefined();
        const visibleBomberAssignments = targetRun?.assignments.filter((assignment) => assignment.role === "bomber") ?? [];
        const bombReleaseProgress = scene.bombReleaseProgress ?? 0.5;
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
    test("bomber ingress keeps fighter cover assignments moving instead of freezing the surviving fighters", async () => {
        const report = inspectScene(await captureScene());
        const bomberIngress = report.phases.find((phase) => phase.label === "bomber-ingress");
        expect(bomberIngress).toBeDefined();
        const bomberAssignments = bomberIngress?.assignments.filter((assignment) => assignment.role === "bomber") ?? [];
        const fighterAssignments = bomberIngress?.assignments.filter((assignment) => assignment.role === "interceptor" || assignment.role === "escort") ?? [];
        expect(bomberAssignments.length).toBeGreaterThan(0);
        expect(fighterAssignments.length).toBeGreaterThan(0);
        const displacement = (assignment) => {
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
        expect(bomberIngressIndex).toBeGreaterThan(0);
        expect(mergePhase).toBeDefined();
        expect(scramblePhase).toBeDefined();
        expect(mergePhase?.tracers.length ?? 0).toBeGreaterThan(0);
        expect(scramblePhase?.tracers.length ?? 0).toBeGreaterThan(0);
        expect(mergePhase?.tracers.every((tracer) => tracer.progress >= 0.56)).toBe(true);
        expect(scramblePhase?.tracers.every((tracer) => tracer.progress >= 0.12 && tracer.progress <= 0.8)).toBe(true);
        expect(Math.max(...allDogfightTracers.map((tracer) => tracer.visibleLengthPx))).toBeLessThanOrEqual(14);
        expect(Math.max(...allDogfightTracers.map((tracer) => tracer.streakLengthPx))).toBeLessThanOrEqual(150);
    });
    test("target-run keeps four bomber actors visible and schedules flak bursts in the visual harness", async () => {
        const scene = await captureScene();
        const report = inspectScene(scene);
        const targetRun = report.phases.find((phase) => phase.label === "target-run");
        expect(targetRun).toBeDefined();
        expect(targetRun?.assignments.filter((assignment) => assignment.role === "bomber")).toHaveLength(4);
        expect(targetRun?.flakBursts.length ?? 0).toBeGreaterThan(0);
        expect(Math.max(...(targetRun?.flakBursts.map((burst) => burst.progress) ?? [0]))).toBeLessThan(scene.bombReleaseProgress ?? 1);
    });
    test("target-run flak targets the sampled bomber path instead of the ground target anchor", async () => {
        const report = inspectScene(await captureScene());
        const targetRun = report.phases.find((phase) => phase.label === "target-run");
        const firstBurst = targetRun?.flakBursts[0];
        const bomberAssignments = targetRun?.assignments.filter((assignment) => assignment.role === "bomber") ?? [];
        const bomberAssignment = bomberAssignments.find((assignment) => assignment.flightId === firstBurst?.bomberUnitKey)
            ?? bomberAssignments[0];
        expect(targetRun).toBeDefined();
        expect(firstBurst).toBeDefined();
        expect(firstBurst?.targetSource).toBe("bomberPath");
        expect(bomberAssignment).toBeDefined();
        const closestBomberSample = bomberAssignment?.sampledPositions.reduce((closest, sample) => Math.abs(sample.progress - (firstBurst?.progress ?? 0)) < Math.abs(closest.progress - (firstBurst?.progress ?? 0))
            ? sample
            : closest);
        expect(closestBomberSample).toBeDefined();
        const bomberTrackOffsetPx = Math.hypot((firstBurst?.targetCenter.cx ?? 0) - (closestBomberSample?.cx ?? 0), (firstBurst?.targetCenter.cy ?? 0) - (closestBomberSample?.cy ?? 0));
        expect(bomberTrackOffsetPx).toBeLessThan(28);
    });
    test("flak-delivered bomber kills stay visible through target-run and drop before egress", async () => {
        const scene = await captureScene();
        const flakKilledScene = {
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
        expect(Math.max(...tracerVisibleLengths)).toBeLessThanOrEqual(14);
        expect(Math.max(...tracerLifetimes)).toBeLessThanOrEqual(44);
        expect(fighterTracers.reduce((sum, tracer) => sum + (tracer.width ?? 0), 0) / fighterTracers.length).toBeGreaterThan(turretTracers.reduce((sum, tracer) => sum + (tracer.width ?? 0), 0) / turretTracers.length);
        expect(fighterTracers.reduce((sum, tracer) => sum + tracer.visibleLengthPx, 0) / fighterTracers.length).toBeGreaterThanOrEqual(turretTracers.reduce((sum, tracer) => sum + tracer.visibleLengthPx, 0) / turretTracers.length);
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
        await renderer.runAirShowPhase([assignment], 1, [], {
            sceneActors: [leadActor, wingActor],
            visibleActorIds: [leadActor.id],
            phaseLabel: "subset-visibility-regression"
        });
        expect(leadActor.image.style.opacity).toBe("1");
        expect(wingActor.image.style.opacity).toBe("0");
        expect(wingActor.image.getAttribute("data-airshow-active")).toBe("false");
    });
});
