import { expect, test, type Locator, type Page } from "@playwright/test";

const tutorialPanel = (page: Page): Locator => page.locator(".tutorial-panel");

async function expectTutorialPanelToFit(page: Page): Promise<void> {
  const panel = tutorialPanel(page);
  const viewport = page.viewportSize();
  const bounds = await panel.boundingBox();
  expect(bounds, "The tutorial panel must have measurable bounds.").not.toBeNull();
  if (!bounds || !viewport) {
    return;
  }
  expect(bounds.x, "Tutorial panel must not extend past the left edge.").toBeGreaterThanOrEqual(-1);
  expect(bounds.y, "Tutorial panel must not extend above the viewport.").toBeGreaterThanOrEqual(-1);
  expect(bounds.x + bounds.width, "Tutorial panel must fit the viewport width.").toBeLessThanOrEqual(viewport.width + 1);
  expect(bounds.y + bounds.height, "Tutorial panel must fit the viewport height.").toBeLessThanOrEqual(viewport.height + 1);

  const contentClipped = await panel.locator(".tutorial-panel-content").evaluate((element) =>
    element.scrollHeight > element.clientHeight + 1
  );
  expect(contentClipped, "Tutorial copy must not be clipped inside the panel.").toBe(false);
}

async function waitForTutorialPhase(page: Page, phase: string, timeout = 12_000): Promise<void> {
  await expect(tutorialPanel(page)).toHaveClass(new RegExp(`tutorial-phase-${phase}(?:\\s|$)`), { timeout });
  await expectTutorialPanelToFit(page);
}

async function waitForAnyTutorialPhase(page: Page, phases: string[], timeout = 12_000): Promise<string> {
  await expect.poll(async () => {
    const className = await tutorialPanel(page).getAttribute("class");
    return phases.find((phase) => className?.split(/\s+/).includes(`tutorial-phase-${phase}`)) ?? "";
  }, { timeout }).not.toBe("");

  const className = await tutorialPanel(page).getAttribute("class");
  const matchedPhase = phases.find((phase) => className?.split(/\s+/).includes(`tutorial-phase-${phase}`));
  expect(matchedPhase, `Expected one of these tutorial phases: ${phases.join(", ")}.`).toBeTruthy();
  await expectTutorialPanelToFit(page);
  return matchedPhase ?? "";
}

async function continueTutorial(page: Page): Promise<void> {
  const button = page.locator("#tutorialOverlayContainer:not(.hidden) .tutorial-action-btn");
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
}

async function addAllocation(page: Page, key: string, quantity: number): Promise<void> {
  const item = page.locator(`li.allocation-item[data-key="${key}"]`);
  const increment = item.locator('[data-action="increment"]');
  await expect(item).toBeVisible();
  for (let index = 0; index < quantity; index += 1) {
    await increment.click();
    await page.waitForTimeout(120);
  }
}

async function readRemainingRequisitionPoints(page: Page): Promise<number> {
  const remainingText = await page.locator("#budgetRemaining").textContent();
  const match = remainingText?.match(/[\d,]+/);
  expect(match, "Budget remaining must render a numeric RP value.").not.toBeNull();
  return Number.parseInt(match?.[0].replace(/,/g, "") ?? "0", 10);
}

async function clickGuidedHex(page: Page): Promise<string> {
  const guidedHex = page.locator('#battleMapCanvas [data-tutorial-guided-hex="true"]');
  await expect(guidedHex).toHaveCount(1);
  const hexKey = await guidedHex.getAttribute("data-hex");
  expect(hexKey, "Guided tutorial hex must expose its map coordinate.").toBeTruthy();
  await page.waitForTimeout(550);
  await guidedHex.click();
  return hexKey ?? "";
}

async function clickFirstAvailableEdge(page: Page): Promise<void> {
  const dialog = page.locator("#battleFortificationFacing:not(.hidden)");
  await expect(dialog).toBeVisible();
  const edges = dialog.locator('[data-fortification-edge]:not([aria-disabled="true"])');
  const edgeCount = await edges.count();
  expect(edgeCount, "The order must provide at least one legal hex edge.").toBeGreaterThan(0);
  await edges.nth(0).click();
  await expect(dialog).toBeHidden();
}

async function clickRecommendedFortificationEdge(page: Page): Promise<void> {
  const dialog = page.locator("#battleFortificationFacing");
  await expect(dialog).toBeVisible();
  const recommendedEdge = dialog.locator('[data-fortification-recommended="true"]');
  await expect(recommendedEdge).toHaveCount(1);
  await recommendedEdge.click();
  await expect(dialog).toBeHidden();
}

async function expectSpotlightAround(page: Page, target: Locator): Promise<void> {
  const spotlight = page.locator(".tutorial-spotlight:not(.hidden)");
  await expect(spotlight).toBeVisible();
  await expect.poll(async () => {
    const targetBounds = await target.boundingBox();
    const spotlightBounds = await spotlight.boundingBox();
    if (!targetBounds || !spotlightBounds) {
      return false;
    }
    return (
      spotlightBounds.x <= targetBounds.x &&
      spotlightBounds.y <= targetBounds.y &&
      spotlightBounds.x + spotlightBounds.width >= targetBounds.x + targetBounds.width &&
      spotlightBounds.y + spotlightBounds.height >= targetBounds.y + targetBounds.height &&
      spotlightBounds.width <= targetBounds.width + 60 &&
      spotlightBounds.height <= targetBounds.height + 60
    );
  }).toBe(true);
}

async function expectBattleTopRailToFit(page: Page): Promise<void> {
  const compactLayout = (page.viewportSize()?.width ?? 0) <= 600;
  const header = page.locator(".battle-map-header.initiative-controls-active");
  const titleRow = header.locator(".battle-map-title-block");
  const operation = header.locator(".battle-operation-identity");
  const objective = header.locator("#battleCycleObjective");
  const turn = header.locator(".turn-status");
  const commandGroup = header.locator(".battle-map-header__command-group");
  const activityToggle = page.locator("#battleActivityLogToggle");

  await expect(header).toBeVisible();
  await expect(commandGroup).toBeVisible();
  await expect.poll(async () => {
    const toggleVisible = await activityToggle.isVisible();
    const [headerBounds, titleBounds, operationBounds, objectiveBounds, turnBounds, commandBounds, toggleBounds] = await Promise.all([
      header.boundingBox(),
      titleRow.boundingBox(),
      operation.boundingBox(),
      objective.boundingBox(),
      turn.boundingBox(),
      commandGroup.boundingBox(),
      toggleVisible ? activityToggle.boundingBox() : Promise.resolve(null)
    ]);
    if (!headerBounds || !titleBounds || !operationBounds || !objectiveBounds || !turnBounds || !commandBounds) {
      return false;
    }

    const titleClearsCommands = titleBounds.y + titleBounds.height <= commandBounds.y + 1;
    const objectiveSharesTitleRow = objectiveBounds.y < operationBounds.y + operationBounds.height
      && operationBounds.y < objectiveBounds.y + objectiveBounds.height;
    const turnSharesTitleRow = turnBounds.y < objectiveBounds.y + objectiveBounds.height
      && objectiveBounds.y < turnBounds.y + turnBounds.height;
    const commandsFitHeader = commandBounds.x + commandBounds.width <= headerBounds.x + headerBounds.width + 1;
    const commandsClearToggle = !toggleBounds || commandBounds.x + commandBounds.width <= toggleBounds.x + 1;
    const contextAligned = compactLayout || (objectiveSharesTitleRow && turnSharesTitleRow);
    return titleClearsCommands && contextAligned && commandsFitHeader && commandsClearToggle;
  }).toBe(true);
}

async function expectBattleTopRailContent(page: Page, outputPath: string): Promise<void> {
  await expect(page.locator("#battleMissionTitle")).not.toHaveText(/Mission Briefing|Operation Pending/);
  await expect(page.locator("#battleTurnIndicator")).toHaveText(/\d+ of \d+/);
  await expect(page.locator("#battleObjectiveIndex")).toContainText(/Objective 1 of/);
  await expect(page.locator("#battleObjectiveTitle")).not.toHaveText(/Awaiting orders|Objective awaiting confirmation/);
  await expect(page.locator("#battleObjectiveStatus")).toHaveText(/In Progress|Secured/);

  const settingsToggle = page.locator("#battleSettingsToggle");
  await settingsToggle.click();
  await expect(settingsToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#battleSettingsMenu")).toBeVisible();
  await expect(page.locator("#battleSettingsMenu #endMissionButton")).toBeVisible();
  await expect(page.locator(".battle-map-title-row > #endMissionButton")).toHaveCount(0);
  await expect(page.locator("#battleSoundToggle")).toContainText("Battle Sound");
  await expect(page.locator("#battleAnimationToggle")).toContainText("Movement Animation");
  await page.locator("#battleSoundToggle").click();
  await expect(page.locator("#battleSoundToggle [data-settings-value]")).toHaveText("Off");
  await page.locator("#battleSoundToggle").click();
  await expect(page.locator("#battleSoundToggle [data-settings-value]")).toHaveText("On");
  await page.locator("#battleAnimationToggle").click();
  await expect(page.locator("#battleAnimationToggle [data-settings-value]")).toHaveText("Quick Moves");
  await page.locator("#battleAnimationToggle").click();
  await expect(page.locator("#battleAnimationToggle [data-settings-value]")).toHaveText("Full Paths");
  await page.screenshot({ path: outputPath });
  await page.keyboard.press("Escape");
  await expect(page.locator("#battleSettingsMenu")).toBeHidden();

  const objectiveLabel = page.locator("#battleObjectiveIndex");
  await page.locator("#battleCycleObjective").click();
  await page.locator("#battleCycleObjective").click();
  await expect(objectiveLabel).toContainText("Objective 2 of");
}

async function expectMiniBriefStep(
  page: Page,
  indicator: string,
  title: string,
  targetSelector: string
): Promise<void> {
  await expect(page.locator("#tutorialOverlayContainer")).not.toHaveClass(/hidden/);
  await expect(page.locator(".tutorial-step-indicator")).toHaveText(indicator);
  await expect(page.locator(".tutorial-title")).toHaveText(title);
  await expectTutorialPanelToFit(page);
  const target = page.locator(targetSelector).first();
  await expect(target).toBeVisible();
  await expectSpotlightAround(page, target);
}

async function advanceMiniBrief(page: Page): Promise<void> {
  const action = page.locator(".tutorial-action-btn");
  await expect(action).toBeVisible();
  await expect(action).toBeEnabled();
  await action.click();
}

async function closeStandardBattlePopup(page: Page): Promise<void> {
  await page.locator("#battlePopupClose").click();
  await expect(page.locator("#battlePopupLayer")).toHaveClass(/hidden/);
}

async function walkSidebarMiniTutorials(page: Page, outputPath: (name: string) => string): Promise<void> {
  await page.locator('[data-popup="baseOperations"]').click();
  await expectMiniBriefStep(page, "OPS Brief 1 of 3", "The Command Post", "#warRoomOverlay [data-war-room-command-strip]");
  await advanceMiniBrief(page);
  await expectMiniBriefStep(page, "OPS Brief 2 of 3", "Open A Report", "#warRoomOverlay .war-room-hotspot");
  await expect(page.locator(".tutorial-action-btn")).toBeHidden();
  await expect(page.locator(".tutorial-action-hint")).toHaveText("Select a marked report in the room.");
  await page.locator("#warRoomOverlay .war-room-hotspot").first().click();
  await expectMiniBriefStep(page, "OPS Brief 3 of 3", "Read The Report", "#warRoomDetail");
  await page.screenshot({ path: outputPath("sidebar-ops-brief.png") });
  await advanceMiniBrief(page);
  await page.locator("#warRoomClose").click();

  await page.locator('[data-popup="generalProfile"]').click();
  await expectMiniBriefStep(page, "General Brief 1 of 3", "Your Command Record", ".general-profile__identity");
  await page.screenshot({ path: outputPath("sidebar-general-brief.png") });
  await advanceMiniBrief(page);
  await expectMiniBriefStep(page, "General Brief 2 of 3", "Command Bonuses", ".general-profile__benefit");
  await advanceMiniBrief(page);
  await expectMiniBriefStep(page, "General Brief 3 of 3", "Traits And Directives", "#generalProfileDirectives");
  await advanceMiniBrief(page);
  await closeStandardBattlePopup(page);

  await page.locator('[data-popup="recon"]').click();
  await expectMiniBriefStep(page, "Recon Brief 1 of 3", "The Observation Net", ".recon-readiness-board");
  await advanceMiniBrief(page);
  await expectMiniBriefStep(page, "Recon Brief 2 of 3", "Your Observers", ".recon-observer-card");
  await advanceMiniBrief(page);
  await expectMiniBriefStep(page, "Recon Brief 3 of 3", "Read The Contact", ".recon-contact-item");
  await page.screenshot({ path: outputPath("sidebar-recon-brief.png") });
  await advanceMiniBrief(page);
  await closeStandardBattlePopup(page);

  await page.locator('[data-popup="airSupport"]').click();
  await expectMiniBriefStep(page, "Air Brief 1 of 4", "Air Readiness", ".air-readiness-board");
  await advanceMiniBrief(page);
  await expectMiniBriefStep(page, "Air Brief 2 of 4", "Choose The Mission", "[data-air-mission-tabs]");
  await expect(page.locator(".tutorial-action-btn")).toBeHidden();
  await expect(page.locator(".tutorial-action-hint")).toHaveText("Select a mission type on the sortie board.");
  await page.locator("[data-air-mission-tab]").first().click();
  await expectMiniBriefStep(page, "Air Brief 3 of 4", "Prepare The Sortie", "[data-air-sortie-board]");
  await page.screenshot({ path: outputPath("sidebar-air-brief.png") });
  await advanceMiniBrief(page);
  await expectMiniBriefStep(page, "Air Brief 4 of 4", "Track Every Sortie", ".air-section");
  await advanceMiniBrief(page);
  await closeStandardBattlePopup(page);

  await page.locator('[data-popup="logistics"]').click();
  await expectMiniBriefStep(page, "Logistics Brief 1 of 4", "Supply Situation", "[data-logistics-overview]");
  await advanceMiniBrief(page);
  await expectMiniBriefStep(page, "Logistics Brief 2 of 4", "Where The Supply Is", "[data-logistics-supply-categories]");
  await advanceMiniBrief(page);
  await expectMiniBriefStep(
    page,
    "Logistics Brief 3 of 4",
    "Set Supply Priority",
    '.logistics-priority-card [data-logistics-priority="critical"]'
  );
  await page.screenshot({ path: outputPath("sidebar-logistics-brief.png") });
  await expect(page.locator(".tutorial-action-btn")).toBeHidden();
  await page.locator('.logistics-priority-card [data-logistics-priority="critical"]').first().click();
  await expectMiniBriefStep(page, "Logistics Brief 4 of 4", "Follow The Convoys", ".logistics-convoy-item");
  await advanceMiniBrief(page);
  await closeStandardBattlePopup(page);

  await page.locator('[data-popup="armyRoster"]').click();
  await expectMiniBriefStep(page, "Roster Brief 1 of 4", "Order Of Battle", ".army-roster-summary");
  await advanceMiniBrief(page);
  await expectMiniBriefStep(page, "Roster Brief 2 of 4", "Frontline Readiness", "[data-roster-list=\"frontline\"] .army-roster-entry");
  await advanceMiniBrief(page);
  await expectMiniBriefStep(page, "Roster Brief 3 of 4", "Reserves And Support", "[data-roster-section=\"reserves\"] > header");
  await advanceMiniBrief(page);
  await expectMiniBriefStep(page, "Roster Brief 4 of 4", "Request Reinforcements", "[data-open-battle-requisitions]");
  await page.screenshot({ path: outputPath("sidebar-roster-brief.png") });
  await expect(page.locator(".tutorial-action-btn")).toBeHidden();
  await page.locator("[data-open-battle-requisitions]").click();
  await expect(page.locator("#tutorialOverlayContainer")).toHaveClass(/hidden/);
  await expect(page.locator('.battle-popup[data-popup-key="battleRequisitions"]')).toBeVisible();
  await closeStandardBattlePopup(page);
}

async function requisitionTrainingForce(page: Page): Promise<void> {
  await waitForTutorialPhase(page, "budget_overview");
  await continueTutorial(page);
  await waitForTutorialPhase(page, "unit_categories");
  await continueTutorial(page);

  await waitForTutorialPhase(page, "select_infantry");
  await addAllocation(page, "infantry", 3);
  await waitForTutorialPhase(page, "select_tanks");
  await addAllocation(page, "tank", 1);
  await addAllocation(page, "heavyTankCompany", 1);
  await addAllocation(page, "tankDestroyerCompany", 1);
  await waitForTutorialPhase(page, "select_engineers");
  await addAllocation(page, "engineer", 1);
  await waitForTutorialPhase(page, "select_flak");
  await addAllocation(page, "flakBattery", 1);
  await waitForTutorialPhase(page, "select_recon");
  await expect(tutorialPanel(page)).toContainText("Add one Recon Bike Patrol");
  await addAllocation(page, "reconBike", 1);
  await waitForTutorialPhase(page, "select_howitzer");
  await expect(tutorialPanel(page)).toContainText("Add one Howitzer Battery");
  await expect(await readRemainingRequisitionPoints(page)).toBeGreaterThanOrEqual(180);
  await addAllocation(page, "howitzer", 1);
  await waitForTutorialPhase(page, "select_ammo");
  await addAllocation(page, "ammo", 1);
  await waitForTutorialPhase(page, "select_fuel");
  await addAllocation(page, "medic", 1);
  await addAllocation(page, "maintenance", 1);
  await waitForTutorialPhase(page, "review_allocation");
}

async function enterBattle(page: Page, deploymentScreenshotPath?: string): Promise<void> {
  await page.locator("#proceedToBattle").click();
  await waitForTutorialPhase(page, "ui_overview");
  await continueTutorial(page);
  await waitForTutorialPhase(page, "mission_briefing");
  await continueTutorial(page);
  await waitForTutorialPhase(page, "deployment_panel_intro");
  await continueTutorial(page);
  await waitForTutorialPhase(page, "deployment_intro");
  await continueTutorial(page);
  await waitForTutorialPhase(page, "base_camp");

  const baseCampHex = page.locator('#battleMapCanvas [data-hex="5,5"]');
  await expect(baseCampHex).toHaveClass(/deployment-zone/);
  await baseCampHex.click();
  await expect(page.locator("#assignBaseCamp")).toBeEnabled();
  await page.locator("#assignBaseCamp").click();

  await waitForTutorialPhase(page, "place_units");
  await page.locator("#autoDeployEvenly").click();
  await waitForTutorialPhase(page, "begin_battle");
  await expect(page.locator("#deploymentZoneList")).toContainText("13/13");
  await expect(page.locator("#deploymentPanel #beginBattle")).toBeVisible();
  await expect(page.locator(".battle-map-title-row #beginBattle")).toHaveCount(0);
  if (deploymentScreenshotPath) {
    await page.screenshot({ path: deploymentScreenshotPath });
  }
  await page.locator("#beginBattle").click();
  await waitForTutorialPhase(page, "initiative_order", 15_000);
}

async function walkCompleteTutorial(page: Page, outputPath: (name: string) => string): Promise<void> {
  await page.goto("/");
  const trainingExercise = page.getByRole("button", { name: /Training Exercise/ });
  await expect(trainingExercise, "The Four Star General home screen must load before tutorial validation begins.").toBeVisible({
    timeout: 15_000
  });
  await trainingExercise.click();
  await requisitionTrainingForce(page);
  await enterBattle(page, outputPath("deployment-begin-mission.png"));
  await expectBattleTopRailToFit(page);

  await expect(tutorialPanel(page)).toContainText("only the highlighted friendly formations can receive orders");
  await continueTutorial(page);
  await waitForTutorialPhase(page, "active_group_units");
  await clickGuidedHex(page);

  let reachedEngineerLesson = false;
  for (let reconLessonIndex = 0; reconLessonIndex < 4; reconLessonIndex += 1) {
    await waitForTutorialPhase(page, "movement_intro");
    await expect(tutorialPanel(page)).toContainText("Recon moves quickly");
    await expect(tutorialPanel(page)).toContainText("lightly armed");
    await expect(page.locator("#battleMapCanvas .hex-cell.move-option-highlight")).not.toHaveCount(0);
    const movementScreenshotName = reconLessonIndex === 0
      ? "20-movement.png"
      : `20-movement-${reconLessonIndex + 1}.png`;
    await page.screenshot({ path: outputPath(movementScreenshotName) });
    await page.waitForTimeout(700);
    await clickGuidedHex(page);

    const nextPhase = await waitForAnyTutorialPhase(page, ["active_group_units", "engineer_intro"], 20_000);
    if (nextPhase === "engineer_intro") {
      reachedEngineerLesson = true;
      break;
    }
    await clickGuidedHex(page);
  }
  expect(reachedEngineerLesson, "The tutorial must drain every recon activation before teaching engineer orders.").toBe(true);

  await clickGuidedHex(page);
  await waitForTutorialPhase(page, "intel_overlay_expand");
  await page.locator("#battleIntelOverlayToggle").click();
  await waitForTutorialPhase(page, "engineer_orders");
  await page.screenshot({ path: outputPath("engineer-work.png") });
  await page.locator('#battleIntelOverlay [data-selection-action="fortifications"]').click();
  const recommendedEdge = page.locator("#battleFortificationFacingPreview [data-fortification-recommended='true']");
  await expect(recommendedEdge).toHaveAttribute("data-tutorial-target", "true");
  await expect(page.locator(".tutorial-spotlight:not(.hidden)")).toBeVisible();
  await expect(tutorialPanel(page)).toContainText("Build Fortifications");
  await expect(tutorialPanel(page)).toContainText("marked edge facing the nearest enemy");
  await page.screenshot({ path: outputPath("fortification-edge.png") });
  await clickRecommendedFortificationEdge(page);

  await waitForTutorialPhase(page, "artillery_support_intro", 20_000);
  await expect(tutorialPanel(page)).toContainText("Artillery Support");
  await expect(tutorialPanel(page)).toContainText("Corps Artillery is ready off-map");
  await continueTutorial(page);
  await waitForTutorialPhase(page, "select_artillery_observer", 20_000);
  await expect(tutorialPanel(page)).toContainText("Choose Observer");
  await clickGuidedHex(page);
  await waitForTutorialPhase(page, "artillery_intro");
  await expect(page.locator('#battleIntelOverlay [data-selection-action="callArtillery"]')).toBeVisible();
  await page.screenshot({ path: outputPath("artillery-order.png") });
  await page.locator('#battleIntelOverlay [data-selection-action="callArtillery"]').click();
  const artilleryTargets = page.locator("#battleMapCanvas .hex-cell.deployment-zone:not(.is-selected)");
  const artilleryTargetCount = await artilleryTargets.count();
  expect(artilleryTargetCount, "Call Artillery must expose an observed enemy target.").toBeGreaterThan(0);
  await page.waitForTimeout(550);
  await artilleryTargets.nth(0).click();

  await waitForTutorialPhase(page, "select_attack_unit", 15_000);
  await clickGuidedHex(page);
  await waitForTutorialPhase(page, "attack_intro");
  await page.screenshot({ path: outputPath("fire-order.png") });
  const attackTargets = page.locator("#battleMapCanvas .hex-cell.attack-target-highlight");
  const attackTargetCount = await attackTargets.count();
  expect(attackTargetCount, "Fire Orders must expose at least one legal enemy target.").toBeGreaterThan(0);
  await page.waitForTimeout(550);
  await attackTargets.nth(0).click();
  await expect(page.locator("#battleAttackConfirm:not(.hidden)")).toBeVisible();
  await page.locator("#battleAttackConfirmAccept").click();
  await waitForTutorialPhase(page, "spend_activation", 15_000);
  await expect(tutorialPanel(page)).toContainText("Click Next Group");
  await page.locator(".enhanced-initiative-turn-controls .group-advance-btn").click();
  await waitForTutorialPhase(page, "select_smoke_unit", 20_000);
  await clickGuidedHex(page);
  await waitForTutorialPhase(page, "smoke_demo");
  await expect(page.locator('#battleIntelOverlay [data-selection-action="laySmoke"]')).toBeVisible();
  await page.screenshot({ path: outputPath("smoke-order.png") });
  await page.locator('#battleIntelOverlay [data-selection-action="laySmoke"]').click();
  const smokeTarget = page.locator("#battleMapCanvas .hex-cell.deployment-zone").first();
  await expect(smokeTarget).toBeVisible();
  await smokeTarget.click();
  await clickFirstAvailableEdge(page);
  await waitForTutorialPhase(page, "complete");
  await expect(tutorialPanel(page)).toContainText("Good luck, General Field Commander.");
  await expect(page.locator(".tutorial-skip-btn")).toBeHidden();
  await page.screenshot({ path: outputPath("tutorial-complete.png") });
  await continueTutorial(page);
  await expect(page.locator("#tutorialOverlayContainer")).toHaveClass(/hidden/);
  await expect(page.locator(".war-room-overlay:not(.hidden)")).toHaveCount(0);
  await expectBattleTopRailContent(page, outputPath("command-rail-settings.png"));
  await walkSidebarMiniTutorials(page, outputPath);
}

test.describe("Training tutorial", () => {
  test.describe.configure({ mode: "serial" });

  const viewports = [
    { name: "wide desktop", width: 1680, height: 857 },
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile", width: 390, height: 844 }
  ];

  for (const viewport of viewports) {
    test(`walks through the complete first-turn command sequence on ${viewport.name}`, async ({ page }, testInfo) => {
      test.setTimeout(210_000);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await walkCompleteTutorial(page, (name) => testInfo.outputPath(name));
    });
  }
});
