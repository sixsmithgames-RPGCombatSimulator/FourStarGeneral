import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
const AIRSHOW_BROWSER_TIMEOUT_MS = 120000;
const LATEST_PAINTED_FRAME_DIR = path.resolve(process.cwd(), "diagnostics", "playwright", "screenshots", "latest");
const PAINTED_FRAME_PROGRESS = 0.5;
let latestPaintedFramesPrepared = false;
function prepareLatestPaintedFrameDir() {
    if (latestPaintedFramesPrepared) {
        return;
    }
    mkdirSync(LATEST_PAINTED_FRAME_DIR, { recursive: true });
    latestPaintedFramesPrepared = true;
}
async function gotoAirshowHarness(page, url = "/?codex-test=airshow") {
    await page.goto(url);
    await page.waitForSelector("#battleHexMap", { state: "attached", timeout: 15000 });
    await page.waitForFunction(() => Boolean(window.__FSG_AIRSHOW_E2E__), null, {
        timeout: 15000
    });
    await page.waitForSelector("#battleScreen", { state: "visible", timeout: 15000 });
}
async function pauseScenarioAtPhaseProgress(page, phaseLabel, progress) {
    await page.evaluate(async ({ targetPhaseLabel, targetProgress }) => {
        const hooks = window.__FSG_AIRSHOW_E2E__;
        if (!hooks) {
            throw new Error("Airshow e2e hooks were not installed.");
        }
        const pauseReady = hooks.pauseAtPhaseProgress(targetPhaseLabel, targetProgress);
        await hooks.startScenario();
        await pauseReady;
    }, { targetPhaseLabel: phaseLabel, targetProgress: progress });
}
async function expectPaintedPhaseMotionFrame(page, testInfo, phaseLabel, snapshotName) {
    prepareLatestPaintedFrameDir();
    await pauseScenarioAtPhaseProgress(page, phaseLabel, PAINTED_FRAME_PROGRESS);
    const snapshotState = await page.evaluate(() => {
        const svg = document.getElementById("battleHexMap");
        if (!svg) {
            return null;
        }
        document.querySelectorAll(".combat-effects-layer").forEach((layer) => {
            layer.style.visibility = "hidden";
        });
        const rect = svg.getBoundingClientRect();
        const activeActors = Array.from(document.querySelectorAll('[data-testid="airshow-actor"][data-airshow-active="true"]')).filter((actor) => {
            const opacity = Number.parseFloat(window.getComputedStyle(actor).opacity || "0");
            const x = Number.parseFloat(actor.getAttribute("x") ?? "0");
            const y = Number.parseFloat(actor.getAttribute("y") ?? "0");
            const width = Number.parseFloat(actor.getAttribute("width") ?? "0");
            const height = Number.parseFloat(actor.getAttribute("height") ?? "0");
            return (opacity > 0.05
                && width > 0
                && height > 0
                && Number.isFinite(x)
                && Number.isFinite(y));
        });
        const visibleActorCount = activeActors.filter((actor) => {
            const actorRect = actor.getBoundingClientRect();
            return (actorRect.right > rect.left
                && actorRect.left < rect.right
                && actorRect.bottom > rect.top
                && actorRect.top < rect.bottom);
        }).length;
        return {
            bounds: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height
            },
            activeActorCount: activeActors.length,
            visibleActorCount
        };
    });
    if (!snapshotState) {
        throw new Error("battleHexMap bounds were not available for painted-frame capture.");
    }
    expect(snapshotState.activeActorCount, `${phaseLabel} should have active painted aircraft sprites`).toBeGreaterThan(0);
    expect(snapshotState.visibleActorCount, `${phaseLabel} should have aircraft sprites inside the captured frame`).toBeGreaterThan(0);
    const frame = await page.screenshot({
        path: testInfo.outputPath(snapshotName),
        clip: {
            x: Math.floor(snapshotState.bounds.x),
            y: Math.floor(snapshotState.bounds.y),
            width: Math.ceil(snapshotState.bounds.width),
            height: Math.ceil(snapshotState.bounds.height)
        }
    });
    writeFileSync(path.join(LATEST_PAINTED_FRAME_DIR, snapshotName), frame);
    await expect(frame).toMatchSnapshot(snapshotName, {
        maxDiffPixels: 2500
    });
}
test.use({
    viewport: { width: 1440, height: 1080 },
    deviceScaleFactor: 1
});
test.describe("AirShow Browser Harness", () => {
    test.beforeEach(async ({ page }) => {
        await gotoAirshowHarness(page);
    });
    test("browser harness captures the contested package phases from the real airshow scene", async ({ page }) => {
        const result = await page.evaluate(async () => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks) {
                throw new Error("Airshow e2e hooks were not installed.");
            }
            return hooks.startScenario();
        });
        expect(result).toMatchObject({
            missionId: "e2e-airshow-contested-package",
            bomberIngressActorCount: 4
        });
        expect(result.phaseLabels).toEqual(expect.arrayContaining([
            "fighter-ingress",
            "escort-clash-merge",
            "escort-clash-scramble",
            "bomber-ingress",
            "target-run",
            "egress"
        ]));
    });
    test("target-run keeps bombers on the strike lane while fighters peel away toward egress", async ({ page }) => {
        test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
        await pauseScenarioAtPhaseProgress(page, "target-run", 0.55);
        const { sample, viewBox, midX } = await page.evaluate(() => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks) {
                throw new Error("Airshow e2e hooks were not installed.");
            }
            const timeline = hooks.getPositionTimeline();
            const latest = timeline[timeline.length - 1];
            const svg = document.getElementById("battleHexMap");
            const vb = svg?.viewBox.baseVal;
            if (!latest || !vb) {
                throw new Error("Target-run sample or SVG viewBox was not available.");
            }
            return {
                sample: latest,
                viewBox: {
                    minX: vb.x,
                    maxX: vb.x + vb.width,
                    minY: vb.y,
                    maxY: vb.y + vb.height
                },
                midX: vb.x + vb.width / 2
            };
        });
        expect(sample.phaseLabel).toBe("target-run");
        const isOnMap = (actor) => actor.cx >= viewBox.minX
            && actor.cx <= viewBox.maxX
            && actor.cy >= viewBox.minY
            && actor.cy <= viewBox.maxY;
        const activeActors = sample.actors.filter((actor) => actor.active);
        const activeBomberActors = activeActors.filter((actor) => actor.role === "bomber");
        const onMapActiveFighters = activeActors.filter((actor) => actor.role !== "bomber" && isOnMap(actor));
        expect(activeBomberActors).toHaveLength(4);
        const nearestBomberPairDistancePx = Math.min(...activeBomberActors.flatMap((left, leftIndex) => activeBomberActors
            .slice(leftIndex + 1)
            .map((right) => Math.hypot(left.cx - right.cx, left.cy - right.cy))));
        const bomberSpreadWidthPx = Math.max(...activeBomberActors.map((actor) => actor.cx))
            - Math.min(...activeBomberActors.map((actor) => actor.cx));
        const bomberSpreadHeightPx = Math.max(...activeBomberActors.map((actor) => actor.cy))
            - Math.min(...activeBomberActors.map((actor) => actor.cy));
        expect(nearestBomberPairDistancePx, `target-run bomber sprites should not collapse into one painted clump. nearest pair=${nearestBomberPairDistancePx.toFixed(1)}px`).toBeGreaterThan(48);
        expect(Math.max(bomberSpreadWidthPx, bomberSpreadHeightPx), `target-run bomber package should present a readable formation box. spread=${bomberSpreadWidthPx.toFixed(1)}x${bomberSpreadHeightPx.toFixed(1)}px`).toBeGreaterThan(86);
        if (onMapActiveFighters.length > 0) {
            const bomberMeanDistanceFromCenter = activeBomberActors.reduce((sum, actor) => sum + Math.abs(actor.cx - midX), 0) / activeBomberActors.length;
            const fighterMeanDistanceFromCenter = onMapActiveFighters.reduce((sum, actor) => sum + Math.abs(actor.cx - midX), 0) / onMapActiveFighters.length;
            expect(fighterMeanDistanceFromCenter, `fighters still visible during target-run should already be peeling away from the strike lane. ` +
                `fighters=${fighterMeanDistanceFromCenter.toFixed(1)}px from center, bombers=${bomberMeanDistanceFromCenter.toFixed(1)}px`).toBeGreaterThan(bomberMeanDistanceFromCenter + 20);
        }
    });
    test("all interceptor and escort actors spawn outside the visible map viewBox", async ({ page }) => {
        await page.evaluate(async () => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks)
                throw new Error("Airshow e2e hooks were not installed.");
            await hooks.startScenario();
        });
        const result = await page.evaluate(() => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks)
                throw new Error("Airshow e2e hooks were not installed.");
            const svg = document.getElementById("battleHexMap");
            const vb = svg?.viewBox.baseVal;
            if (!vb)
                throw new Error("No viewBox on battleHexMap");
            const spawn = hooks.getSpawnSnapshot();
            const fighters = spawn.filter((a) => a.role === "interceptor" || a.role === "escort");
            return {
                viewBox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
                fighters: fighters.map((a) => ({ role: a.role, active: a.active, cx: Math.round(a.cx), cy: Math.round(a.cy) }))
            };
        });
        const { viewBox, fighters } = result;
        expect(fighters.length).toBeGreaterThan(0);
        const vbRight = viewBox.x + viewBox.width;
        const vbBottom = viewBox.y + viewBox.height;
        for (const actor of fighters) {
            const isOutside = actor.cx < viewBox.x || actor.cx > vbRight ||
                actor.cy < viewBox.y || actor.cy > vbBottom;
            expect(isOutside, `actor ${actor.role} cx=${actor.cx} cy=${actor.cy} is inside viewBox [${viewBox.x},${viewBox.y} ${vbRight}x${vbBottom}]`).toBe(true);
        }
        const interceptors = fighters.filter((a) => a.role === "interceptor");
        const escorts = fighters.filter((a) => a.role === "escort");
        expect(interceptors.length).toBeGreaterThan(0);
        expect(escorts.length).toBeGreaterThan(0);
        const midX = viewBox.x + viewBox.width / 2;
        const interceptorSides = new Set(interceptors.map((a) => (a.cx < midX ? "left" : "right")));
        const escortSides = new Set(escorts.map((a) => (a.cx < midX ? "left" : "right")));
        const sidesOverlap = [...interceptorSides].some((s) => escortSides.has(s));
        expect(sidesOverlap).toBe(false);
    });
    // Minimum sampling rate: one position snapshot every 200ms throughout the full animation.
    // Add more targeted per-phase assertions below this test as needed.
    test("interceptors and escorts remain on opposite sides during ingress and egress", async ({ page }) => {
        test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
        const { hqMidX: rawHqMidX, corridorCenterX: rawCorridorCenterX } = await page.evaluate(async () => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks)
                throw new Error("Airshow e2e hooks were not installed.");
            const result = await hooks.startScenario();
            await hooks.waitForCompletion();
            return {
                hqMidX: result.hqMidX,
                corridorCenterX: result.corridorCenterX
            };
        });
        const { timeline, midX } = await page.evaluate(() => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks)
                throw new Error("Airshow e2e hooks were not installed.");
            const svg = document.getElementById("battleHexMap");
            const vb = svg?.viewBox.baseVal;
            if (!vb)
                throw new Error("No viewBox on battleHexMap");
            return {
                timeline: hooks.getPositionTimeline(),
                midX: vb.x + vb.width / 2
            };
        });
        expect(timeline.length).toBeGreaterThan(0);
        const egressMidX = rawHqMidX ?? rawCorridorCenterX ?? midX;
        const resolvePhaseWindowSamples = (phaseSamples, startProgress, endProgress) => {
            if (phaseSamples.length <= 0) {
                return [];
            }
            if (phaseSamples.length === 1) {
                return startProgress <= 0 && endProgress >= 1 ? phaseSamples : [];
            }
            const startMs = phaseSamples[0].elapsedMs;
            const endMs = phaseSamples[phaseSamples.length - 1].elapsedMs;
            const durationMs = Math.max(1, endMs - startMs);
            const minMs = startMs + durationMs * startProgress;
            const maxMs = startMs + durationMs * endProgress;
            return phaseSamples.filter((sample) => sample.elapsedMs >= minMs && sample.elapsedMs <= maxMs);
        };
        // Per spec §Scenario 5: side-separation guaranteed during fighter-ingress (first 70%
        // only — at phase end both factions converge to hold points near center before clash)
        // and egress. Clash, bomber-ingress, and target-run have no side guarantee.
        const ingressSamples = timeline.filter((s) => s.phaseLabel === "fighter-ingress");
        const egressSamples = timeline.filter((s) => s.phaseLabel === "egress");
        const checkedSamples = [
            ...resolvePhaseWindowSamples(ingressSamples, 0, 0.7),
            ...resolvePhaseWindowSamples(egressSamples, 0.35, 1)
        ];
        const EGRESS_MARGIN_PX = 30;
        for (const sample of checkedSamples) {
            const activeInterceptors = sample.actors.filter((a) => a.role === "interceptor" && a.active);
            const activeEscorts = sample.actors.filter((a) => a.role === "escort" && a.active);
            if (activeInterceptors.length === 0 || activeEscorts.length === 0) {
                continue;
            }
            if (sample.phaseLabel === "egress") {
                // During the dedicated egress beat, each surviving fighter faction must already
                // be committed to its own HQ side while the bomber package exits continuously.
                for (const a of activeInterceptors) {
                    expect(a.cx >= egressMidX - EGRESS_MARGIN_PX, `at ~${Math.round(sample.elapsedMs)}ms egress: interceptor ${a.actorId} cx=${Math.round(a.cx)} is >30px into player side — should be peeling right toward bot HQ. egressMidX=${Math.round(egressMidX)}`).toBe(true);
                }
                for (const a of activeEscorts) {
                    expect(a.cx <= egressMidX + EGRESS_MARGIN_PX, `at ~${Math.round(sample.elapsedMs)}ms egress: escort ${a.actorId} cx=${Math.round(a.cx)} is >30px into bot side — should be peeling left toward player HQ. egressMidX=${Math.round(egressMidX)}`).toBe(true);
                }
            }
            else {
                // Ingress: interceptors and escorts must be on opposite sides from spawn
                const interceptorSides = new Set(activeInterceptors.map((a) => (a.cx < midX ? "left" : "right")));
                const escortSides = new Set(activeEscorts.map((a) => (a.cx < midX ? "left" : "right")));
                const sidesOverlap = [...interceptorSides].some((s) => escortSides.has(s));
                expect(sidesOverlap, `at ~${Math.round(sample.elapsedMs)}ms fighter-ingress: interceptors[${[...interceptorSides]}] escorts[${[...escortSides]}] same side — SVG viewBox coords, midX=${Math.round(midX)}`).toBe(false);
            }
        }
    });
    // Spec §Speed Principles: during bomber-ingress CAP/escorts at V while bombers at V/2.
    // Assert bombers move ≤60% as far per 200ms as fighters during bomber-ingress.
    // Add finer-grained speed samples if the ratio tolerance needs tightening.
    test("bombers move slower than fighters during bomber-ingress phase", async ({ page }) => {
        test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
        await page.evaluate(async () => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks)
                throw new Error("Airshow e2e hooks were not installed.");
            await hooks.startScenario();
            await hooks.waitForCompletion();
        });
        const timeline = await page.evaluate(() => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks)
                throw new Error("Airshow e2e hooks were not installed.");
            return hooks.getPositionTimeline();
        });
        const bomberIngressSamples = timeline.filter((s) => s.phaseLabel === "bomber-ingress");
        if (bomberIngressSamples.length < 2) {
            return;
        }
        let totalBomberDisplacement = 0;
        let totalFighterDisplacement = 0;
        let bomberReadings = 0;
        let fighterReadings = 0;
        for (let i = 1; i < bomberIngressSamples.length; i++) {
            const prev = bomberIngressSamples[i - 1];
            const curr = bomberIngressSamples[i];
            for (const currActor of curr.actors.filter((a) => a.active)) {
                const prevActor = prev.actors.find((a) => a.actorId === currActor.actorId);
                if (!prevActor?.active)
                    continue;
                const dist = Math.hypot(currActor.cx - prevActor.cx, currActor.cy - prevActor.cy);
                if (currActor.role === "bomber") {
                    totalBomberDisplacement += dist;
                    bomberReadings++;
                }
                else if (currActor.role === "interceptor" || currActor.role === "escort") {
                    totalFighterDisplacement += dist;
                    fighterReadings++;
                }
            }
        }
        if (bomberReadings === 0 || fighterReadings === 0) {
            return;
        }
        const avgBomberPx = totalBomberDisplacement / bomberReadings;
        const avgFighterPx = totalFighterDisplacement / fighterReadings;
        const ratio = avgBomberPx / avgFighterPx;
        expect(ratio, `bomber avg displacement per 200ms (${avgBomberPx.toFixed(1)}px) should be ≤60% of fighter (${avgFighterPx.toFixed(1)}px). ratio=${ratio.toFixed(2)} — spec requires bombers at V/2 vs fighters at V during bomber-ingress`).toBeLessThan(0.6);
    });
    test("browser playback runs to completion cleanly", async ({ page }) => {
        test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
        await page.evaluate(async () => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks) {
                throw new Error("Airshow e2e hooks were not installed.");
            }
            await hooks.startScenario();
            await hooks.waitForCompletion();
        });
        const remainingActors = await page.locator('[data-testid="airshow-actor"]').count();
        expect(remainingActors).toBe(0);
    });
    test.describe("Painted Frames", () => {
        test.describe.configure({ mode: "serial" });
        test("captures painted escort clash merge frame @painted-frame", async ({ page, browserName }, testInfo) => {
            test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
            test.skip(browserName !== "chromium", "Painted-frame snapshots are calibrated on chromium.");
            await expectPaintedPhaseMotionFrame(page, testInfo, "escort-clash-merge", "airshow-painted-escort-clash-merge-mid.png");
        });
        test("captures painted bomber ingress frame @painted-frame", async ({ page, browserName }, testInfo) => {
            test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
            test.skip(browserName !== "chromium", "Painted-frame snapshots are calibrated on chromium.");
            await expectPaintedPhaseMotionFrame(page, testInfo, "bomber-ingress", "airshow-painted-bomber-ingress-mid.png");
        });
        test("captures painted target run frame @painted-frame", async ({ page, browserName }, testInfo) => {
            test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
            test.skip(browserName !== "chromium", "Painted-frame snapshots are calibrated on chromium.");
            await expectPaintedPhaseMotionFrame(page, testInfo, "target-run", "airshow-painted-target-run-mid.png");
        });
        test("captures painted escort clash scramble frame @painted-frame", async ({ page, browserName }, testInfo) => {
            test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
            test.skip(browserName !== "chromium", "Painted-frame snapshots are calibrated on chromium.");
            await expectPaintedPhaseMotionFrame(page, testInfo, "escort-clash-scramble", "airshow-painted-escort-clash-scramble-mid.png");
        });
    });
});
test.describe("AirShow Browser Replay Harness", () => {
    test.beforeEach(async ({ page }) => {
        await gotoAirshowHarness(page, "/?codex-test=airshow-replay");
    });
    test("captured playback fixture runs through BattleScreen.playAirOperations before reaching the renderer", async ({ page }) => {
        test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
        const result = await page.evaluate(async () => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks) {
                throw new Error("Airshow e2e hooks were not installed.");
            }
            const started = await hooks.startScenario();
            await hooks.waitForCompletion();
            return started;
        });
        expect(result).toMatchObject({
            missionId: "e2e-airshow-contested-package",
            bomberIngressActorCount: 4
        });
        expect(result.phaseLabels).toEqual(expect.arrayContaining([
            "fighter-ingress",
            "escort-clash-merge",
            "escort-clash-scramble",
            "bomber-ingress",
            "target-run",
            "egress"
        ]));
    });
    test("replay harness applies live camera focus so bomber ingress is painted inside the focused viewport", async ({ page }) => {
        test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
        await pauseScenarioAtPhaseProgress(page, "bomber-ingress", 0.72);
        const result = await page.evaluate(() => {
            const svg = document.getElementById("battleHexMap");
            const viewportRoot = document.getElementById("viewportRoot");
            if (!svg || !viewportRoot) {
                throw new Error("Expected battleHexMap and viewportRoot to exist for replay visibility inspection.");
            }
            const rawViewBox = svg.getAttribute("viewBox");
            if (!rawViewBox) {
                throw new Error("Expected replay airshow SVG to expose a viewBox.");
            }
            const viewBoxValues = rawViewBox
                .trim()
                .split(/[ ,]+/)
                .map((value) => Number.parseFloat(value))
                .filter((value) => Number.isFinite(value));
            if (viewBoxValues.length !== 4) {
                throw new Error(`Expected replay airshow SVG viewBox to contain four numeric values, received: ${rawViewBox}`);
            }
            const [viewBoxX, viewBoxY, viewBoxWidth, viewBoxHeight] = viewBoxValues;
            const transformValue = viewportRoot.getAttribute("transform")?.trim() ?? "";
            const translateMatch = transformValue.match(/translate\(\s*(-?\d*\.?\d+)(?:[\s,]+(-?\d*\.?\d+))?\s*\)/i);
            const scaleMatch = transformValue.match(/scale\(\s*(-?\d*\.?\d+)(?:[\s,]+(-?\d*\.?\d+))?\s*\)/i);
            if (!translateMatch || !scaleMatch) {
                throw new Error(`Expected replay viewportRoot transform to expose translate/scale, received: ${transformValue || "(empty)"}`);
            }
            const panX = Number(translateMatch[1]);
            const panY = Number(translateMatch[2] ?? "0");
            const zoomX = Number(scaleMatch[1]);
            const zoomY = Number(scaleMatch[2] ?? scaleMatch[1]);
            if (![panX, panY, zoomX, zoomY].every(Number.isFinite)) {
                throw new Error(`Expected replay viewportRoot transform to produce finite pan/zoom values, received: ${transformValue}`);
            }
            const minX = (viewBoxX - panX) / zoomX;
            const maxX = (viewBoxX + viewBoxWidth - panX) / zoomX;
            const minY = (viewBoxY - panY) / zoomY;
            const maxY = (viewBoxY + viewBoxHeight - panY) / zoomY;
            const visibleBounds = {
                minX: Math.min(minX, maxX),
                maxX: Math.max(minX, maxX),
                minY: Math.min(minY, maxY),
                maxY: Math.max(minY, maxY)
            };
            const size = 32;
            const bombers = Array.from(document.querySelectorAll('[data-testid="airshow-actor"][data-airshow-role="bomber"]')).map((el) => {
                const x = Number.parseFloat(el.getAttribute("x") ?? "0");
                const y = Number.parseFloat(el.getAttribute("y") ?? "0");
                return {
                    actorId: el.getAttribute("data-airshow-actor-id") ?? "",
                    active: el.getAttribute("data-airshow-active") === "true",
                    opacity: window.getComputedStyle(el).opacity,
                    cx: x + size / 2,
                    cy: y + size / 2
                };
            });
            return {
                transformValue,
                panX,
                panY,
                zoomX,
                zoomY,
                visibleBounds,
                bombers
            };
        });
        const activeBombers = result.bombers.filter((actor) => actor.active);
        const paintedBombers = activeBombers.filter((actor) => actor.opacity !== "0"
            && actor.cx >= result.visibleBounds.minX
            && actor.cx <= result.visibleBounds.maxX
            && actor.cy >= result.visibleBounds.minY
            && actor.cy <= result.visibleBounds.maxY);
        expect(Math.abs(result.panX) + Math.abs(result.panY) + Math.abs(result.zoomX - 1) + Math.abs(result.zoomY - 1), `Expected replay harness to exercise a focused camera, but viewportRoot remained near identity: ${result.transformValue}`).toBeGreaterThan(1);
        expect(activeBombers).toHaveLength(4);
        expect(paintedBombers.length, `Expected bomber ingress to be painted inside the focused viewport. Visible bounds=${JSON.stringify(result.visibleBounds)} bombers=${JSON.stringify(result.bombers)}`).toBeGreaterThanOrEqual(3);
    });
});
test.describe("AirShow Browser Harness Large Map", () => {
    test.beforeEach(async ({ page }) => {
        await gotoAirshowHarness(page, "/?codex-test=airshow-large");
    });
    test.describe.configure({ mode: "serial" });
    test("captures painted bomber ingress frame on large map @painted-frame", async ({ page, browserName }, testInfo) => {
        test.skip(browserName !== "chromium", "Painted-frame snapshots are calibrated on chromium.");
        await expectPaintedPhaseMotionFrame(page, testInfo, "bomber-ingress", "airshow-large-painted-bomber-ingress-mid.png");
    });
});
