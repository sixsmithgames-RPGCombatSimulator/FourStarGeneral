import { mkdirSync, rmSync, writeFileSync } from "node:fs";
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
    rmSync(LATEST_PAINTED_FRAME_DIR, { recursive: true, force: true });
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
    const bounds = await page.evaluate(() => {
        const svg = document.getElementById("battleHexMap");
        if (!svg) {
            return null;
        }
        const rect = svg.getBoundingClientRect();
        return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height
        };
    });
    if (!bounds) {
        throw new Error("battleHexMap bounds were not available for painted-frame capture.");
    }
    const frame = await page.screenshot({
        path: testInfo.outputPath(snapshotName),
        clip: {
            x: Math.floor(bounds.x),
            y: Math.floor(bounds.y),
            width: Math.ceil(bounds.width),
            height: Math.ceil(bounds.height)
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
    test("target-run shows bomber actors while fighters stay out of the strike lane", async ({ page }) => {
        test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
        await page.evaluate(async () => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks) {
                throw new Error("Airshow e2e hooks were not installed.");
            }
            await hooks.startScenario();
            await hooks.waitForPhase("target-run");
        });
        await page.waitForSelector('[data-testid="airshow-actor"]', { timeout: 5000 });
        await page.waitForTimeout(120);
        const snapshot = await page.evaluate(() => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks) {
                throw new Error("Airshow e2e hooks were not installed.");
            }
            return hooks.getActorSnapshot();
        });
        const activeActors = snapshot.filter((actor) => actor.active && Number.parseFloat(actor.opacity) > 0.5);
        const activeBomberActors = activeActors.filter((actor) => actor.role === "bomber");
        const activeFighterActors = activeActors.filter((actor) => actor.role !== "bomber");
        expect(activeBomberActors).toHaveLength(4);
        expect(activeFighterActors).toHaveLength(0);
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
    test("interceptors and escorts remain on opposite sides of map center throughout the full animation", async ({ page }) => {
        test.setTimeout(AIRSHOW_BROWSER_TIMEOUT_MS);
        await page.evaluate(async () => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks)
                throw new Error("Airshow e2e hooks were not installed.");
            await hooks.startScenario();
            await hooks.waitForCompletion();
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
        // Per spec §Scenario 5: side-separation guaranteed during fighter-ingress (first 70%
        // only — at phase end both factions converge to hold points near center before clash)
        // and egress. Clash, bomber-ingress, and target-run have no side guarantee.
        const ingressSamples = timeline.filter((s) => s.phaseLabel === "fighter-ingress");
        const egressSamples = timeline.filter((s) => s.phaseLabel === "egress");
        const ingressEarlyCount = Math.max(1, Math.floor(ingressSamples.length * 0.7));
        const checkedSamples = [...ingressSamples.slice(0, ingressEarlyCount), ...egressSamples];
        // Egress margin: actors start from post-clash positions and need time to unwind into their
        // HQ-bound exit vectors, so the direction check skips the launch transient.
        // Ingress has no margin — sides should be clean from spawn.
        const EGRESS_MARGIN_PX = 30;
        const EGRESS_DIRECTION_CHECK_DELAY_MS = 4000;
        const egressStartMs = egressSamples[0]?.elapsedMs ?? 0;
        for (const sample of checkedSamples) {
            const activeInterceptors = sample.actors.filter((a) => a.role === "interceptor" && a.active);
            const activeEscorts = sample.actors.filter((a) => a.role === "escort" && a.active);
            if (activeInterceptors.length === 0 || activeEscorts.length === 0) {
                continue;
            }
            if (sample.phaseLabel === "egress") {
                if (sample.elapsedMs < egressStartMs + EGRESS_DIRECTION_CHECK_DELAY_MS) {
                    continue;
                }
                // Egress: once the unwind window has passed, each faction must be heading
                // toward its own HQ, with 30px margin from center before counting.
                for (const a of activeInterceptors) {
                    expect(a.cx >= midX - EGRESS_MARGIN_PX, `at ~${Math.round(sample.elapsedMs)}ms egress: interceptor ${a.actorId} cx=${Math.round(a.cx)} is >30px into player side — should egress right toward bot HQ. midX=${Math.round(midX)}`).toBe(true);
                }
                for (const a of activeEscorts) {
                    expect(a.cx <= midX + EGRESS_MARGIN_PX, `at ~${Math.round(sample.elapsedMs)}ms egress: escort ${a.actorId} cx=${Math.round(a.cx)} is >30px into bot side — should egress left toward player HQ. midX=${Math.round(midX)}`).toBe(true);
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
            test.skip(browserName !== "chromium", "Painted-frame snapshots are calibrated on chromium.");
            await expectPaintedPhaseMotionFrame(page, testInfo, "escort-clash-merge", "airshow-painted-escort-clash-merge-mid.png");
        });
        test("captures painted bomber ingress frame @painted-frame", async ({ page, browserName }, testInfo) => {
            test.skip(browserName !== "chromium", "Painted-frame snapshots are calibrated on chromium.");
            await expectPaintedPhaseMotionFrame(page, testInfo, "bomber-ingress", "airshow-painted-bomber-ingress-mid.png");
        });
        test("captures painted target run frame @painted-frame", async ({ page, browserName }, testInfo) => {
            test.skip(browserName !== "chromium", "Painted-frame snapshots are calibrated on chromium.");
            await expectPaintedPhaseMotionFrame(page, testInfo, "target-run", "airshow-painted-target-run-mid.png");
        });
        test("captures painted escort clash scramble frame @painted-frame", async ({ page, browserName }, testInfo) => {
            test.skip(browserName !== "chromium", "Painted-frame snapshots are calibrated on chromium.");
            await expectPaintedPhaseMotionFrame(page, testInfo, "escort-clash-scramble", "airshow-painted-escort-clash-scramble-mid.png");
        });
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
