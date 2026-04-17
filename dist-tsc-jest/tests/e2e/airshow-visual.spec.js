import { expect, test } from "@playwright/test";
test.describe("AirShow Browser Harness", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/?codex-test=airshow");
        await page.waitForSelector("#battleHexMap", { state: "attached", timeout: 15000 });
        await page.waitForFunction(() => Boolean(window.__FSG_AIRSHOW_E2E__), null, {
            timeout: 15000
        });
        await page.waitForSelector("#battleScreen", { state: "visible", timeout: 15000 });
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
    test("bot interceptors and player escorts spawn on opposite sides of the map center", async ({ page }) => {
        await page.evaluate(async () => {
            const hooks = window.__FSG_AIRSHOW_E2E__;
            if (!hooks)
                throw new Error("Airshow e2e hooks were not installed.");
            await hooks.startScenario();
            await hooks.waitForPhase("fighter-ingress");
        });
        await page.waitForSelector('[data-testid="airshow-actor"]', { timeout: 5000 });
        const positions = await page.evaluate(() => {
            const actors = Array.from(document.querySelectorAll('[data-testid="airshow-actor"]'));
            const svg = document.getElementById("battleHexMap");
            const viewBox = svg?.viewBox.baseVal;
            const mapCenterX = viewBox ? viewBox.x + viewBox.width / 2 : 0;
            return actors.map((el) => ({
                role: el.getAttribute("data-airshow-role") ?? "",
                active: el.getAttribute("data-airshow-active") === "true",
                cx: parseFloat(el.getAttribute("x") ?? "0") + 16
            })).filter((a) => a.active).map((a) => ({ ...a, side: a.cx < mapCenterX ? "left" : "right" }));
        });
        const interceptors = positions.filter((a) => a.role === "interceptor");
        const escorts = positions.filter((a) => a.role === "escort");
        expect(interceptors.length).toBeGreaterThan(0);
        expect(escorts.length).toBeGreaterThan(0);
        const interceptorSides = new Set(interceptors.map((a) => a.side));
        const escortSides = new Set(escorts.map((a) => a.side));
        const sidesOverlap = [...interceptorSides].some((s) => escortSides.has(s));
        expect(sidesOverlap).toBe(false);
    });
    test("browser playback runs to completion cleanly", async ({ page }) => {
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
});
