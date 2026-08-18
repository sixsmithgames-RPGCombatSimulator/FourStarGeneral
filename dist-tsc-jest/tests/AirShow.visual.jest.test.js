import { HexMapRenderer } from "../src/rendering/HexMapRenderer";
import { jest } from "@jest/globals";
import { buildResolvedAirCombatScene } from "../src/ui/airshow/ResolvedAirCombatSceneBuilder";
import { buildAirshowHarnessFixture, buildAirshowHarnessFixtureLarge } from "../src/testing/airshowHarnessFixture";
import { ensureDomEnvironment } from "./domEnvironment";
function installRenderFetchMocks() {
    const originalFetch = globalThis.fetch?.bind(globalThis);
    const response = (payload) => ({
        ok: true,
        status: 200,
        json: async () => payload
    });
    globalThis.fetch = (async (input, init) => {
        const url = String(input);
        if (url.endsWith("data/effectSpecs.json") || url.endsWith("data/terrainTints.json")) {
            return response([]);
        }
        if (url.endsWith("data/soundCatalog.json")) {
            return response({ version: 1, assets: {} });
        }
        if (originalFetch) {
            return originalFetch(input, init);
        }
        throw new Error(`Unexpected fetch during airshow visual test: ${url}`);
    });
    return () => {
        if (originalFetch) {
            globalThis.fetch = originalFetch;
        }
    };
}
function buildScene(fixture) {
    return buildResolvedAirCombatScene(fixture.engagement, {
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
        includeBomber: true,
        playerHqKey: fixture.playerHqKey,
        botHqKey: fixture.botHqKey
    }).scene;
}
function renderFixture(fixture) {
    ensureDomEnvironment();
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "1600");
    svg.setAttribute("height", "1200");
    const canvas = document.createElement("div");
    document.body.append(svg, canvas);
    const restoreFetch = installRenderFetchMocks();
    const renderer = new HexMapRenderer();
    renderer.render(svg, canvas, fixture.renderScenario);
    return { renderer, svg, canvas, restoreFetch };
}
function disposeHarness(harness) {
    harness.restoreFetch();
    harness.svg.remove();
    harness.canvas.remove();
}
function inspect(renderer, scene) {
    const report = renderer.inspectResolvedAirCombatShow(scene);
    if (!report) {
        throw new Error("Expected renderer airshow inspection report.");
    }
    return report;
}
function timeline(renderer, scene) {
    const planned = renderer.planResolvedAirCombatTimeline(scene);
    if (!planned) {
        throw new Error("Expected renderer airshow timeline.");
    }
    return planned;
}
describe("Air show renderer timeline", () => {
    beforeEach(() => {
        ensureDomEnvironment();
        document.body.innerHTML = "";
    });
    test.each([
        ["10x10", buildAirshowHarnessFixture()],
        ["20x20", buildAirshowHarnessFixtureLarge()]
    ])("plans the %s fixture from exact 500px HQ-side origins", (_label, fixture) => {
        const harness = renderFixture(fixture);
        try {
            const report = inspect(harness.renderer, buildScene(fixture));
            expect(report.originPlan).not.toBeNull();
            expect(report.originPlan?.offsetPx).toBe(500);
            const playerDistancePx = Math.hypot((report.originPlan?.playerOrigin.cx ?? 0) - (report.originPlan?.playerBoundary.cx ?? 0), (report.originPlan?.playerOrigin.cy ?? 0) - (report.originPlan?.playerBoundary.cy ?? 0));
            const botDistancePx = Math.hypot((report.originPlan?.botOrigin.cx ?? 0) - (report.originPlan?.botBoundary.cx ?? 0), (report.originPlan?.botOrigin.cy ?? 0) - (report.originPlan?.botBoundary.cy ?? 0));
            expect(playerDistancePx).toBeCloseTo(500, 5);
            expect(botDistancePx).toBeCloseTo(500, 5);
        }
        finally {
            disposeHarness(harness);
        }
    });
    test("viewport transforms do not modify choreography", () => {
        const fixture = buildAirshowHarnessFixtureLarge();
        const harness = renderFixture(fixture);
        try {
            const scene = buildScene(fixture);
            const before = timeline(harness.renderer, scene);
            harness.renderer.getViewportRoot()?.setAttribute("transform", "translate(-520 -340) scale(2.2)");
            const after = timeline(harness.renderer, scene);
            expect(after).toEqual(before);
        }
        finally {
            disposeHarness(harness);
        }
    });
    test("full engagement exposes only authored semantic beats", () => {
        const fixture = buildAirshowHarnessFixture();
        const harness = renderFixture(fixture);
        try {
            const planned = timeline(harness.renderer, buildScene(fixture));
            expect(planned.scenario).toBe("full-engagement");
            expect(planned.verification.findings).toEqual([]);
            expect(new Set(planned.beats.map((beat) => beat.label))).toEqual(new Set([
                "fighter-ingress",
                "bomber-ingress",
                "escort-clash-merge",
                "escort-clash-scramble",
                "bomber-defense-pass",
                "target-run",
                "egress"
            ]));
            const bomberTrack = planned.tracks.find((track) => track.role === "bomber");
            const defensePass = bomberTrack.segments.find((segment) => segment.label === "bomber-defense-pass");
            const targetRun = bomberTrack.segments.find((segment) => segment.label === "target-run");
            expect(defensePass.endTimeMs).toBe(targetRun.startTimeMs);
        }
        finally {
            disposeHarness(harness);
        }
    });
    test("inspection contains independent single-puff flak along bomber tracks", () => {
        const fixture = buildAirshowHarnessFixture();
        const harness = renderFixture(fixture);
        try {
            const report = inspect(harness.renderer, buildScene(fixture));
            const flak = report.phases.flatMap((phase) => phase.flakBursts);
            expect(flak.length).toBeGreaterThan(3);
            expect(flak.every((burst) => burst.puffCount === 1)).toBe(true);
            expect(flak.every((burst) => burst.flashCount === 1)).toBe(true);
            expect(new Set(flak.map((burst) => burst.progress.toFixed(4))).size).toBeGreaterThan(3);
            expect(flak.every((burst) => burst.targetSource === "bomberPath")).toBe(true);
        }
        finally {
            disposeHarness(harness);
        }
    });
    test("CAP clash has no bomber, flak, or target-run work", () => {
        const fixture = buildAirshowHarnessFixture();
        const harness = renderFixture(fixture);
        try {
            const source = buildScene(fixture);
            const scene = {
                ...source,
                kind: "capClash",
                bombers: [],
                bomber: null,
                bomberTargetHexKey: null,
                flakBursts: []
            };
            const planned = timeline(harness.renderer, scene);
            expect(planned.scenario).toBe("cap-clash");
            expect(planned.beats.map((beat) => beat.label)).toEqual([
                "fighter-ingress",
                "escort-clash-merge",
                "escort-clash-scramble",
                "egress"
            ]);
            expect(planned.cues.some((cue) => cue.kind === "impact" || cue.kind === "flak" || cue.kind === "bomb-release")).toBe(false);
        }
        finally {
            disposeHarness(harness);
        }
    });
    test("one bomber sprite identity remains visible while impact promises are unresolved", async () => {
        const fixture = buildAirshowHarnessFixture();
        const harness = renderFixture(fixture);
        const scene = buildScene(fixture);
        const planned = timeline(harness.renderer, scene);
        const impactTimeMs = planned.cues.find((cue) => cue.kind === "impact")?.timeMs ?? 0;
        const bomberActorId = planned.actors.find((actor) => actor.role === "bomber")?.actorId;
        if (!bomberActorId) {
            throw new Error("Expected a bomber actor in the full engagement fixture.");
        }
        let clockMs = 0;
        let firstBomberElement = null;
        let visibleDuringImpact = false;
        let resolveImpact = () => { };
        const pendingImpact = new Promise((resolve) => {
            resolveImpact = resolve;
        });
        const nowSpy = jest.spyOn(performance, "now").mockImplementation(() => clockMs);
        const internals = harness.renderer;
        internals.playAirShowFlakWave = jest.fn();
        internals.playAirShowTracerBurst = jest.fn();
        internals.playExplosion = jest.fn(() => pendingImpact);
        internals.playDustCloud = jest.fn(() => pendingImpact);
        internals.playAirDamageSmokeTrailAt = jest.fn(async () => { });
        internals.scheduleAnimationFrame = (step) => {
            clockMs += 120;
            const current = harness.svg.querySelector(`[data-airshow-actor-id="${bomberActorId}"]`);
            if (current && current.getAttribute("data-airshow-active") === "true") {
                firstBomberElement ?? (firstBomberElement = current);
                expect(current).toBe(firstBomberElement);
                if (clockMs > impactTimeMs + 120 && clockMs < impactTimeMs + 1100) {
                    visibleDuringImpact = true;
                }
            }
            step(clockMs);
        };
        try {
            await harness.renderer.animateResolvedAirCombatShow(scene, {
                onImpact: () => pendingImpact
            });
            expect(firstBomberElement).not.toBeNull();
            expect(visibleDuringImpact).toBe(true);
            expect(internals.playExplosion).toHaveBeenCalledTimes(1);
            expect(harness.svg.querySelectorAll("[data-testid='airshow-actor']")).toHaveLength(0);
        }
        finally {
            resolveImpact();
            nowSpy.mockRestore();
            disposeHarness(harness);
        }
    });
    test("zero-strength tutorial bomber receives target-run and egress without destruction", () => {
        const fixture = buildAirshowHarnessFixture();
        const harness = renderFixture(fixture);
        try {
            const source = buildScene(fixture);
            const baseBomber = source.bomber;
            const zeroBomber = {
                ...baseBomber,
                id: "tutorial-zero-bomber",
                strengthBefore: 0,
                strengthAfterEscortPhase: 0,
                finalStrength: 0
            };
            const scene = {
                ...source,
                interceptors: [],
                escorts: [],
                bombers: [zeroBomber],
                bomber: zeroBomber,
                flakBursts: []
            };
            const planned = timeline(harness.renderer, scene);
            const bomberTrack = planned.tracks[0];
            expect(planned.scenario).toBe("strike-only");
            expect(bomberTrack.segments.map((segment) => segment.label)).toEqual([
                "bomber-ingress",
                "target-run",
                "egress"
            ]);
            expect(planned.cues.some((cue) => cue.kind === "destruction")).toBe(false);
            expect(bomberTrack.visibleUntilMs).toBe(bomberTrack.segments[2].endTimeMs);
        }
        finally {
            disposeHarness(harness);
        }
    });
});
