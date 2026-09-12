import { expect, test, type Page, type TestInfo } from "@playwright/test";

type TerrainContract = {
  readonly frontKey: string;
  readonly targetHex: string;
  readonly title: RegExp;
  readonly minimumTerrain: Readonly<Record<string, number>>;
  readonly minimumFeatures?: Readonly<Record<string, number>>;
  readonly scheduledDefense?: boolean;
};

const theaterContracts: readonly TerrainContract[] = [
  {
    frontKey: "omaha_gold",
    targetHex: "24,24",
    title: /Fortified Assault.*Omaha/i,
    minimumTerrain: { beach: 100, sea: 80, hill: 80, mountain: 60 }
  },
  {
    frontKey: "juno_sword",
    targetHex: "29,23",
    title: /Fortified Assault.*Douvres/i,
    minimumTerrain: { beach: 70, sea: 20, plains: 240 }
  },
  {
    frontKey: "utah_cotentin",
    targetHex: "21,25",
    title: /Meeting Engagement.*Cotentin/i,
    minimumTerrain: { marsh: 120, river: 40, forest: 120 },
    minimumFeatures: { bridge: 6 }
  },
  {
    frontKey: "caen_airborne_flank",
    targetHex: "31,22",
    title: /Meeting Engagement Defense.*Orne/i,
    minimumTerrain: { river: 30 },
    minimumFeatures: { bridge: 2 },
    scheduledDefense: true
  }
];

async function openCampaign(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/clerk.browser.js", (route) => route.fulfill({
    contentType: "application/javascript",
    body: "window.Clerk = { load: () => Promise.resolve(), user: null };"
  }));
  await page.goto("/?campaign-ui=v2", { waitUntil: "domcontentloaded" });
  expect(["localhost", "127.0.0.1"]).toContain(new URL(page.url()).hostname);
  await expect(page.locator("#appBootStatus")).toHaveCount(0, { timeout: 30_000 });
  await page.locator('[data-campaign-id="western-europe"]').click();
  await expect(page.locator(".campaign-command-shell")).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new CustomEvent("fsg:authResolved", {
    detail: {
      resolved: true,
      isAuthenticated: false,
      email: null,
      subscriptionStatus: null,
      planIds: [],
      isPrivileged: true,
      isGuest: true
    }
  })));
  await expect(page.locator("#campaignLockOverlay")).toHaveCount(0);
}

async function openGeneratedEngagement(page: Page, contract: TerrainContract): Promise<void> {
  await openCampaign(page);
  if (contract.scheduledDefense) {
    const advance = page.locator("#campaignAdvanceSegment");
    await advance.click();
    await expect(page.locator("#campaignCommandClock")).toContainText("03:00–06:00");
    await advance.click();
  } else {
    await page.locator(`.campaign-situation-front[data-front-key="${contract.frontKey}"]`).click();
    await expect(page.locator("#campaignContextInspector")).toBeVisible();
    const target = page.locator(`[data-campaign-front-target-choice="${contract.targetHex}"]`);
    if (await target.count()) {
      await expect(target).toBeVisible();
      await target.click();
      await expect(target).toHaveAttribute("aria-pressed", "true");
    } else {
      await expect(page.locator("#campaignContextInspector")).toContainText(`Grid ${contract.targetHex}`);
    }
    const queue = page.locator("#campaignQueueEngagement");
    await expect(queue).toBeEnabled();
    await queue.click();
    const confirm = page.locator("#battlePopupLayer [data-confirm-campaign-action]");
    await expect.poll(async () => (
      await confirm.isVisible() || await page.locator("#precombatScreen").isVisible()
    )).toBe(true);
    if (await confirm.isVisible()) await confirm.click();
  }
  await expect(page.locator("#precombatScreen")).toBeVisible();
  await expect(page.locator("#precombatMissionTitle")).toHaveText(contract.title);
  await expect.poll(() => page.locator("#precombatHexMap .hex-cell").count()).toBeGreaterThan(400);
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
}

async function readTacticalTerrain(page: Page): Promise<{
  terrain: Record<string, number>;
  features: Record<string, number>;
  total: number;
}> {
  return page.locator("#precombatHexMap").evaluate((map) => {
    const terrain: Record<string, number> = {};
    const features: Record<string, number> = {};
    const cells = Array.from(map.querySelectorAll<SVGGElement>(".hex-cell"));
    cells.forEach((cell) => {
      const terrainKey = cell.dataset.terrain ?? "unknown";
      terrain[terrainKey] = (terrain[terrainKey] ?? 0) + 1;
      (cell.dataset.features ?? "").split("|").filter(Boolean).forEach((feature) => {
        features[feature] = (features[feature] ?? 0) + 1;
      });
    });
    return { terrain, features, total: cells.length };
  });
}

for (const contract of theaterContracts) {
  test(`FSG_CAM_110: ${contract.frontKey} ${contract.targetHex} renders certified local geography`, async ({ page }, info: TestInfo) => {
    await openGeneratedEngagement(page, contract);
    const evidence = await readTacticalTerrain(page);

    for (const [terrain, minimum] of Object.entries(contract.minimumTerrain)) {
      expect(evidence.terrain[terrain] ?? 0, `${contract.targetHex} must visibly represent ${terrain}`).toBeGreaterThanOrEqual(minimum);
    }
    for (const [feature, minimum] of Object.entries(contract.minimumFeatures ?? {})) {
      expect(evidence.features[feature] ?? 0, `${contract.targetHex} must contain ${feature} geometry`).toBeGreaterThanOrEqual(minimum);
    }
    expect(evidence.terrain.snow ?? 0, "Normandy generation must exclude snow maps").toBe(0);
    expect(evidence.total).toBeGreaterThan(400);

    const slug = `${contract.frontKey}-${contract.targetHex.replace(",", "-")}`;
    await info.attach(`${slug}-terrain.json`, {
      body: Buffer.from(JSON.stringify(evidence, null, 2)),
      contentType: "application/json"
    });
    const screenshot = info.outputPath(`${slug}.png`);
    await page.locator(".precombat-intel-row").screenshot({ path: screenshot });
    await info.attach(`${slug}.png`, { path: screenshot, contentType: "image/png" });
  });
}
