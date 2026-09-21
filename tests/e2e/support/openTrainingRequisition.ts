import type { Page } from "@playwright/test";

/**
 * Opens the training mission requisition screen using the current landing-flow selectors
 * and dismisses the tutorial overlay so layout checks can interact with the underlying UI.
 */
export async function openTrainingRequisition(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForSelector("#landingScreen", { state: "visible" });
  await page.getByRole("button", { name: /Training Exercise/ }).click();
  await page.waitForSelector("#precombatScreen", { state: "visible" });

  // The precombat screen becomes visible before the welcome step is published.
  // Wait for the live (non-hidden) overlay instead of racing its initial hidden
  // container or its title-dependent accessible name.
  const tutorialDialog = page.locator("#tutorialOverlayContainer:not(.hidden)");
  await tutorialDialog.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined);
  if (await tutorialDialog.isVisible().catch(() => false)) {
    const skipButton = tutorialDialog.getByRole("button", { name: "Skip tutorial" });
    if (await skipButton.isVisible().catch(() => false)) {
      await skipButton.click();
      await page.locator("#tutorialOverlayContainer").waitFor({ state: "hidden" });
    }
  }

  await page.waitForTimeout(300);
}
