/** Local report interaction contracts: real Screen/state callbacks and one Shell modal owner. */
import "./domEnvironment.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import unitTypes from "../src/data/unitSystem/derivedUnitTypes";
import { registerTest } from "./harness.js";
import { commitFixture, tacticalStateFixture, missionStatus } from "./CampaignBattleResultExtraction.test.js";
import { extractCampaignBattleResultPackage } from "../src/game/campaign/results/CampaignBattleResultExtractor";
import { CampaignState } from "../src/state/CampaignState";
import { UnlockState } from "../src/state/UnlockState";
import { CampaignScreen } from "../src/ui/screens/CampaignScreen";
import { CampaignCommandScreen } from "../src/ui/campaign/CampaignCommandScreen";
import { CampaignCommandShell, type CampaignCommandShellView } from "../src/ui/campaign/CampaignCommandShell";
import { EnhancedInitiativeTurnControls } from "../src/ui/components/EnhancedInitiativeTurnControls";
import { CampaignCheckpointPicker } from "../src/ui/components/CampaignCheckpointPicker";

const shipped = new JSDOM(readFileSync("index.html", "utf8")).window.document;
function mount(): HTMLElement {
  document.body.innerHTML = shipped.querySelector("#campaignScreen")!.outerHTML;
  const root = document.getElementById("campaignScreen")!;
  root.classList.remove("hidden"); root.setAttribute("aria-hidden", "false");
  return root;
}
function required<T extends HTMLElement = HTMLButtonElement>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  assert.ok(element, `Missing player control ${selector}`);
  return element;
}
function key(target: Element, name: string, shiftKey = false): KeyboardEvent {
  const event = new window.KeyboardEvent("keydown", { key: name, shiftKey, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}
function reportInvoker(root: HTMLElement): HTMLButtonElement {
  const button = Array.from(root.querySelectorAll<HTMLButtonElement>(".campaign-situation-report-source"))
    .find((entry) => entry.textContent?.includes("Battle reports"));
  assert.ok(button);
  return button;
}
function postBattle() {
  const { campaign, runtime, pkg } = commitFixture();
  const tactical = tacticalStateFixture(runtime, pkg);
  // An actual returned survivor is shattered, producing the canonical recovery decision.
  const survivor = tactical.playerPlacements[0];
  assert.ok(survivor.status);
  for (const pool of Object.values(survivor.status.personnel)) { pool.wounded += pool.fit; pool.fit = 0; }
  survivor.strength = 0;
  tactical.playerPlacements.splice(0, 1);
  assert.ok(tactical.casualtyLog);
  tactical.casualtyLog.push({ unit: survivor, definition: structuredClone(unitTypes[survivor.type]),
    unitKey: survivor.formationKey ?? null, label: "Returned shattered formation", recordedAt: "battle:4:2" });
  const result = extractCampaignBattleResultPackage({ battlePackage: pkg, tacticalState: tactical, missionStatus, result: "attackerVictory" });
  assert.equal(campaign.applyCampaignBattleResult(result).applied, true);
  return campaign;
}
function mountScreen(state: CampaignState) {
  const root = mount();
  // Only map painting is detached; initialize, subscriptions, projection, navigation and modal rendering are real.
  const renderer = { render() {}, setTerrainOverlayVisible() {}, setIntelCoverageVisible() {}, setIntelContactsVisible() {},
    getViewportRoot() { return null; }, getHexCenter() { return { cx: 0, cy: 0 }; },
    onHexClick() {}, clearAllHighlights() {}, highlightHex() {} };
  const screen = new CampaignScreen({ showScreenById() {} } as never, renderer as never);
  Object.defineProperty(screen, "campaignState", { value: state });
  const unlock = new UnlockState();
  unlock.hydrate({ resolved: true, isAuthenticated: true, email: null, subscriptionStatus: null,
    planIds: [], isPrivileged: true, isGuest: false });
  Object.defineProperty(screen, "unlockState", { value: unlock });
  screen.initialize();
  // Access the existing composition/lifecycle for assertions; no replacement of focus or production methods.
  const lifecycle = screen as unknown as { commandInterface: CampaignCommandScreen; renderCommandShell(): void };
  return { root, screen, lifecycle, cleanup: () => {
    lifecycle.commandInterface.destroy(); screen.disposeCampaignAccessGate(); root.remove();
  } };
}

registerTest("FSG_CAM_095_ACTUAL_SCREEN_REPORT_REFRESH_ACKNOWLEDGE_AND_INVOKER", async () => {
  const state = postBattle();
  const fixture = mountScreen(state);
  const { root, lifecycle } = fixture;
  const panel = required(root, "#campaignAfterActionPanel");
  try {
    assert.ok(panel.contains(document.activeElement), "Automatic report entry must finish inside its modal after Screen rendering.");
    key(document.activeElement!, "Escape");
    assert.equal(document.activeElement, required(root, "#campaignCommandReports"), "Automatic entry without a valid invoker returns to Reports.");
    const invoker = reportInvoker(root); invoker.focus(); invoker.click();
    assert.ok(panel.contains(document.activeElement), "Archive open must not finish on a workspace tab.");
    assert.equal(document.activeElement, required(root, ".campaign-aar-card__header [data-close-campaign-aar]"));
    const archive = required(root, "[data-aar-report-id]"); archive.focus(); archive.click();
    assert.ok(panel.contains(document.activeElement), "Selecting a report must retain focus after the real Screen rerenders.");
    const before = structuredClone(state.getRuntimeSnapshot());
    lifecycle.renderCommandShell();
    assert.ok(panel.contains(document.activeElement));
    assert.deepEqual(state.getRuntimeSnapshot(), before, "Reading/refreshing the report cannot mutate campaign truth.");
    const acknowledge = required(root, "[data-acknowledge-aar]"); acknowledge.focus(); acknowledge.click();
    assert.ok(state.getCampaignAfterActionReports().every((report) => report.acknowledged));
    assert.equal(document.activeElement, required(root, "[data-continue-campaign-aar]"), "Removed acknowledgement returns to the report's continuation.");
    key(document.activeElement!, "Escape");
    assert.equal(panel.hidden, true);
    assert.equal(document.activeElement, invoker, "Closing must restore the exact still-valid archive invoker.");
  } finally { fixture.cleanup(); }
});

registerTest("FSG_CAM_095_ACTUAL_SCREEN_RECOVERY_AND_MAP_ROUTES_RELEASE_MODAL_FIRST", async () => {
  const state = postBattle();
  const fixture = mountScreen(state);
  const { root, lifecycle } = fixture;
  try {
    const report = state.getCampaignAfterActionReports()[0];
    const decision = required(root, "[data-aar-target-kind='formation']");
    const formationId = decision.dataset.aarTargetId;
    assert.ok(formationId);
    decision.focus(); decision.click();
    assert.equal(required(root, "#campaignAfterActionPanel").hidden, true);
    assert.deepEqual(lifecycle.commandInterface.getUIState().getSnapshot().selection, { kind: "formation", id: formationId });
    assert.equal(lifecycle.commandInterface.getActiveWorkspace(), "forces");
    assert.ok(root.contains(document.activeElement) && document.activeElement !== required(root, "#campaignCommandReports"));
    assert.equal(document.activeElement?.closest("#campaignAfterActionPanel"), null);
    assert.equal(document.activeElement?.closest("[inert]"), null, "The actual recovery destination must be interactive.");
    lifecycle.commandInterface.showWorkspace("situation", true);
    reportInvoker(root).click();
    const location = required(root, "#campaignAfterActionPanel [data-campaign-map-hex-target]");
    const hex = location.dataset.campaignMapHexTarget;
    location.focus(); location.click();
    assert.equal(required(root, "#campaignAfterActionPanel").hidden, true);
    assert.deepEqual(lifecycle.commandInterface.getUIState().getSnapshot().selection, { kind: "hex", id: hex });
    assert.deepEqual(state.getCampaignAfterActionReports()[0], report, "Navigation must leave the immutable report unchanged.");
  } finally { fixture.cleanup(); }
});

registerTest("FSG_CAM_095_ACTUAL_SCREEN_MODAL_KEYS_NESTED_PICKER_AND_HIDE_CLEANUP", async () => {
  const fixture = mountScreen(postBattle());
  const { root, lifecycle } = fixture;
  try {
    const panel = required(root, "#campaignAfterActionPanel");
    const close = required(root, ".campaign-aar-card__header [data-close-campaign-aar]");
    const last = required(root, "[data-continue-campaign-aar]");
    last.focus(); key(last, "Tab"); assert.equal(document.activeElement, close);
    key(close, "Tab", true); assert.equal(document.activeElement, last);
    const workspace = lifecycle.commandInterface.getActiveWorkspace();
    key(last, "2"); assert.equal(lifecycle.commandInterface.getActiveWorkspace(), workspace, "A modal must block background workspace shortcuts.");
    const picker = new CampaignCheckpointPicker([{ slotId: "primary", label: "Primary", detail: "Current campaign" }]);
    const pending = picker.choose(last);
    assert.ok(document.activeElement?.closest("#campaignCheckpointPicker"), "The newer modal owns focus without competing traps.");
    key(document.activeElement!, "Escape"); await pending;
    assert.equal(document.activeElement, last);
    root.classList.add("hidden"); root.setAttribute("aria-hidden", "true");
    document.dispatchEvent(new CustomEvent("screen:shown", { detail: { id: "landing" } }));
    assert.equal(panel.hidden, true);
    const outside = document.createElement("button"); document.body.append(outside); outside.focus();
    assert.equal(document.activeElement, outside, "Hidden reports must release their document focus guard.");
    assert.equal(key(document.body, "Tab").defaultPrevented, false);
  } finally { fixture.cleanup(); }
});

registerTest("FSG_CAM_095_HIDDEN_DETACHED_AND_INERT_TACTICAL_CONTROLS_IGNORE_HQ_KEYS", () => {
  const host = document.createElement("section"); host.id = "battleScreen"; document.body.append(host);
  const container = document.createElement("div"); host.append(container);
  let actions = 0;
  const controls = new EnhancedInitiativeTurnControls(container, {
    onSkipTurn() {}, onEndTurn() { actions++; }, onNextGroup() { actions++; }, onNextActivation() { actions++; },
    onCompleteActivation() {}, onProceedToNext() { actions++; }, onSkipGroup() { actions++; }
  });
  controls.updatePhase("initiativeTurn"); controls.updatePlayerTurn(true);
  controls.updateCurrentUnit({ unitId: "preserved", ownerId: "player", initiative: 5, isActivated: false, sortOrder: 0 });
  try {
    assert.equal(key(document.body, "Tab").defaultPrevented, true); assert.equal(actions, 1);
    for (const unavailable of ["hidden", "aria-hidden", "inert", "detached"] as const) {
      if (unavailable === "hidden") host.classList.add("hidden");
      if (unavailable === "aria-hidden") host.setAttribute("aria-hidden", "true");
      if (unavailable === "inert") host.inert = true;
      if (unavailable === "detached") host.remove();
      for (const name of ["Tab", "Enter", " "]) assert.equal(key(document.body, name).defaultPrevented, false, `${unavailable} battle captured ${name}`);
      assert.equal(actions, 1);
      host.classList.remove("hidden"); host.removeAttribute("aria-hidden"); host.inert = false; document.body.append(host);
    }
    assert.equal(key(document.body, "Tab", true).defaultPrevented, false);
    assert.equal(key(required(host, ".next-activation-btn"), "Tab").defaultPrevented, false);
    assert.equal(key(document.body, "Tab").defaultPrevented, true); assert.equal(actions, 2);
  } finally { controls.dispose(); host.remove(); }
});

registerTest("FSG_CAM_095_ACTUAL_SCREEN_DISPOSAL_AND_DETACH_RELEASE_REPORT_OWNERSHIP", async () => {
  for (const teardown of ["destroy", "detach"] as const) {
    const fixture = mountScreen(postBattle());
    const preexisting = document.createElement("section"); preexisting.inert = true; document.body.append(preexisting);
    try {
      const close = required(fixture.root, ".campaign-aar-card__header [data-close-campaign-aar]");
      close.focus();
      if (teardown === "destroy") fixture.lifecycle.commandInterface.destroy();
      else { fixture.root.remove(); await Promise.resolve(); }
      const outside = document.createElement("button"); document.body.append(outside); outside.focus();
      assert.equal(document.activeElement, outside, `${teardown} must release document focus containment.`);
      assert.equal(key(document.body, "Tab").defaultPrevented, false);
      assert.equal(preexisting.inert, true, "Cleanup must preserve another owner's preexisting inert state.");
    } finally { fixture.cleanup(); preexisting.remove(); }
  }
});

registerTest("FSG_CAM_096_SCORE_EXPLAINS_MAXIMUM_AVAILABLE_OUTCOME_WITHOUT_REGRADING", () => {
  const root = mount(); const shell = new CampaignCommandShell(root); assert.ok(shell.initialize());
  const view: CampaignCommandShellView = {
    theaterTitle: "Normandy", campaignPhase: "Expansion", timeLabel: "D+1", commandStatus: "Planning", saveStatus: "Saved", unreadReports: 0,
    resources: [], objectives: [], forces: [], airPower: 0, navalPower: 0, intelligenceCapacity: "0/0", orders: [],
    objectiveScore: { earned: 100, available: 875, percent: 11, projectedGrade: "Decisive victory" },
    advance: { mode: "segment", enabled: true, pauseAfterEveryResolution: false, summary: "", alerts: [], timeline: [] }
  };
  const before = structuredClone(view); shell.render(view);
  assert.match(required(root, ".campaign-objective-score").textContent!, /100 \/ 875 · 11%/);
  assert.match(required(root, ".campaign-objective-score").textContent!, /Best available outcome: Decisive victory/);
  assert.match(required(root, ".campaign-objective-score").textContent!, /remaining objectives succeed/i);
  assert.doesNotMatch(required(root, ".campaign-objective-score").textContent!, /Projected/);
  assert.deepEqual(view, before);
  shell.render({ ...view, objectiveScore: { ...view.objectiveScore!, earned: 0, percent: 0 } });
  assert.doesNotMatch(required(root, ".campaign-objective-score").textContent!, /Best available|Decisive|Projected/);
});
