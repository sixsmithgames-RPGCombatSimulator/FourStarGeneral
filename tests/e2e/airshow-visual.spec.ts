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
