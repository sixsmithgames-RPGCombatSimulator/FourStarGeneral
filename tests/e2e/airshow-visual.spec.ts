import { expect, test } from "@playwright/test";

test.describe("AirShow Browser Harness", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/?codex-test=airshow");
    await page.waitForSelector("#battleHexMap", { state: "attached", timeout: 15000 });
    await page.waitForFunction(() => Boolean((window as Window & { __FSG_AIRSHOW_E2E__?: unknown }).__FSG_AIRSHOW_E2E__), null, {
      timeout: 15000
    });
    await page.waitForSelector("#battleScreen", { state: "visible", timeout: 15000 });
  });

  test("browser harness captures the contested package phases from the real airshow scene", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const hooks = (window as Window & {
        __FSG_AIRSHOW_E2E__?: { startScenario: () => Promise<unknown> };
      }).__FSG_AIRSHOW_E2E__;
      if (!hooks) {
        throw new Error("Airshow e2e hooks were not installed.");
      }
      return hooks.startScenario();
    });

    expect(result).toMatchObject({
      missionId: "e2e-airshow-contested-package",
      bomberIngressActorCount: 4
    });
    expect((result as { readonly phaseLabels: readonly string[] }).phaseLabels).toEqual(
      expect.arrayContaining([
        "fighter-ingress",
        "escort-clash-merge",
        "escort-clash-scramble",
        "bomber-ingress",
        "target-run",
        "egress"
      ])
    );
  });

  test("target-run shows bomber actors while fighters stay out of the strike lane", async ({ page }) => {
    await page.evaluate(async () => {
      const hooks = (window as Window & {
        __FSG_AIRSHOW_E2E__?: {
          startScenario: () => Promise<{ targetRunSampleMs: number }>;
          waitForPhase: (label: string) => Promise<void>;
        };
      }).__FSG_AIRSHOW_E2E__;
      if (!hooks) {
        throw new Error("Airshow e2e hooks were not installed.");
      }
      await hooks.startScenario();
      await hooks.waitForPhase("target-run");
    });

    await page.waitForSelector('[data-testid="airshow-actor"]', { timeout: 5000 });
    await page.waitForTimeout(120);

    const snapshot = await page.evaluate(() => {
      const hooks = (window as Window & {
        __FSG_AIRSHOW_E2E__?: { getActorSnapshot: () => unknown };
      }).__FSG_AIRSHOW_E2E__;
      if (!hooks) {
        throw new Error("Airshow e2e hooks were not installed.");
      }
      return hooks.getActorSnapshot();
    });

    const activeActors = (snapshot as ReadonlyArray<{ role: string; active: boolean; opacity: string }>).filter(
      (actor) => actor.active && Number.parseFloat(actor.opacity) > 0.5
    );
    const activeBomberActors = activeActors.filter((actor) => actor.role === "bomber");
    const activeFighterActors = activeActors.filter((actor) => actor.role !== "bomber");

    expect(activeBomberActors).toHaveLength(4);
    expect(activeFighterActors).toHaveLength(0);
  });

  test("all interceptor and escort actors spawn outside the visible map viewBox", async ({ page }) => {
    await page.evaluate(async () => {
      const hooks = (window as Window & {
        __FSG_AIRSHOW_E2E__?: { startScenario: () => Promise<unknown> };
      }).__FSG_AIRSHOW_E2E__;
      if (!hooks) throw new Error("Airshow e2e hooks were not installed.");
      await hooks.startScenario();
    });

    const result = await page.evaluate(() => {
      const hooks = (window as Window & {
        __FSG_AIRSHOW_E2E__?: {
          getSpawnSnapshot: () => ReadonlyArray<{ role: string; active: boolean; cx: number; cy: number }>;
        };
      }).__FSG_AIRSHOW_E2E__;
      if (!hooks) throw new Error("Airshow e2e hooks were not installed.");

      const svg = document.getElementById("battleHexMap") as SVGSVGElement | null;
      const vb = svg?.viewBox.baseVal;
      if (!vb) throw new Error("No viewBox on battleHexMap");

      const spawn = hooks.getSpawnSnapshot();
      const fighters = spawn.filter((a) => a.role === "interceptor" || a.role === "escort");
      return {
        viewBox: { x: vb.x, y: vb.y, width: vb.width, height: vb.height },
        fighters: fighters.map((a) => ({ role: a.role, active: a.active, cx: Math.round(a.cx), cy: Math.round(a.cy) }))
      };
    });

    const { viewBox, fighters } = result as {
      viewBox: { x: number; y: number; width: number; height: number };
      fighters: ReadonlyArray<{ role: string; active: boolean; cx: number; cy: number }>;
    };

    expect(fighters.length).toBeGreaterThan(0);

    const vbRight = viewBox.x + viewBox.width;
    const vbBottom = viewBox.y + viewBox.height;

    for (const actor of fighters) {
      const isOutside =
        actor.cx < viewBox.x || actor.cx > vbRight ||
        actor.cy < viewBox.y || actor.cy > vbBottom;
      expect(
        isOutside,
        `actor ${actor.role} cx=${actor.cx} cy=${actor.cy} is inside viewBox [${viewBox.x},${viewBox.y} ${vbRight}x${vbBottom}]`
      ).toBe(true);
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

  test("browser playback runs to completion cleanly", async ({ page }) => {
    await page.evaluate(async () => {
      const hooks = (window as Window & {
        __FSG_AIRSHOW_E2E__?: {
          startScenario: () => Promise<unknown>;
          waitForCompletion: () => Promise<void>;
        };
      }).__FSG_AIRSHOW_E2E__;
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
