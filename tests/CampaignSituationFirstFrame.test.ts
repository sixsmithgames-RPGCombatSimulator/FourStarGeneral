/** First-frame decision contracts: one active objective, current fronts, and complete objective access. */
import "./domEnvironment";
import assert from "node:assert/strict";
import { registerTest } from "./harness";
import { CampaignCommandShell, type CampaignCommandShellView } from "../src/ui/campaign/CampaignCommandShell";
import type { CampaignCommandSelection } from "../src/ui/campaign/CampaignCommandUIState";

function mountSituation(): HTMLElement {
  document.body.innerHTML = `<main id="campaignScreen"><div class="campaign-layout">
    <div class="campaign-map"><div class="campaign-map-viewport"><div id="campaignMapCanvas"><svg id="campaignHexMap"></svg></div></div></div>
    <aside class="campaign-sidebar">
      <section class="time-section"><button id="campaignAdvanceSegment"><span class="btn-label"></span></button></section>
      <section class="campaign-intel-section"><button id="campaignIntelToggle"></button><button id="campaignIntelCoverage"></button></section>
      <section class="session-section"><div class="session-controls"></div></section>
      <section class="selection-section"><div id="campaignSelectionInfo"></div></section>
      <div class="action-section"><button id="campaignQueueEngagement"></button></div>
    </aside>
  </div></main>`;
  const root = document.getElementById("campaignScreen");
  assert.ok(root);
  return root;
}

function firstFrameView(): CampaignCommandShellView {
  return {
    theaterTitle: "Operation Overlord", campaignPhase: "D+1 Lodgment", timeLabel: "7 June 1944, 00:00–03:00",
    commandStatus: "Planning", saveStatus: "Unsaved", unreadReports: 0, resources: [],
    priorities: [{
      id: "objective:lodgment", severity: "notable", label: "Command priority", title: "Hold the Normandy Lodgment",
      detail: "Keep the five beaches under Allied control.", actionLabel: "Review objective", targetKind: "objective", targetId: "lodgment"
    }],
    objectives: [{
      key: "lodgment", label: "Hold the Normandy Lodgment", status: "In progress", category: "primary", progress: 0,
      progressLabel: "Hold for 2 more segments", deadline: "7 June, 06:00", score: "0/100 pts", hexKey: "1,1"
    }, ...["Cherbourg", "Caen", "Saint-Lô", "Avranches", "Falaise", "Argentan", "Rouen"].map((name) => ({
      key: name, label: `Secure ${name}`, status: "Upcoming", progress: 0, progressLabel: "Awaiting evaluation", hexKey: "2,2"
    }))],
    objectiveScore: { earned: 0, available: 875, percent: 0, projectedGrade: "Decisive victory" },
    fronts: [{ key: "utah", label: "Utah and Cotentin", initiativeLabel: "Friendly initiative", hexKeys: ["1,1"], pressureLabel: "Choose from 4 opposing targets." },
      { key: "orne", label: "Caen-Orne", initiativeLabel: "Opposing initiative", hexKeys: ["2,2"], stageLabel: "Counterattack expected in 6 hours" }],
    forces: [], airPower: 0, navalPower: 0, intelligenceCapacity: "3/3", orders: [],
    advance: { mode: "nextReport", enabled: true, pauseAfterEveryResolution: false, summary: "Planning", alerts: [], timeline: [] }
  };
}

function buttonContaining(root: HTMLElement, label: string): HTMLButtonElement {
  const matches = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).filter((button) => button.textContent?.includes(label));
  assert.equal(matches.length, 1, `Expected one available action for ${label}.`);
  const button = matches[0];
  assert.equal(button.disabled, false);
  assert.equal(button.closest("[hidden], [inert]"), null, `${label} must remain reachable.`);
  return button;
}

registerTest("FSG_CAM_084_PRIORITY_OBJECTIVE_RETAINS_ONE_TITLE_PROGRESS_AND_CANONICAL_ACTION", async ({ Given, When, Then }) => {
  const root = mountSituation();
  const routes: string[] = [];
  const shell = new CampaignCommandShell(root, { onAlertSelected: (kind, id) => { routes.push(`${kind}:${id}`); } });
  const view = firstFrameView();
  await Given("the first priority targets the active lodgment objective", () => {
    assert.equal(shell.initialize(), true);
    shell.render(view);
  });
  await When("the commander reads the objective before reviewing it", () => {
    const situation = root.querySelector<HTMLElement>("#campaignSituationWorkspace");
    assert.ok(situation);
    assert.equal(situation.textContent?.split("Hold the Normandy Lodgment").length, 2, "The active objective title must appear once in Situation.");
    assert.match(situation.textContent ?? "", /Keep the five beaches under Allied control/);
    assert.match(situation.textContent ?? "", /In progress/);
    assert.match(situation.textContent ?? "", /Hold for 2 more segments/);
    assert.match(situation.textContent ?? "", /7 June, 06:00/);
    assert.match(situation.textContent ?? "", /0\/100 pts/);
    const progress = situation.querySelectorAll('[role="progressbar"][aria-label="Hold the Normandy Lodgment progress"]');
    assert.equal(progress.length, 1);
    assert.equal(progress[0].getAttribute("aria-valuenow"), "0");
    assert.equal(progress[0].getAttribute("aria-valuemin"), "0");
    assert.equal(progress[0].getAttribute("aria-valuemax"), "100");
    const review = buttonContaining(situation, "Review objective");
    review.focus();
    assert.equal(document.activeElement, review);
    review.click();
  });
  await Then("the original priority route fires once and later progress stays exact without duplication", () => {
    assert.deepEqual(routes, ["objective:lodgment"]);
    shell.render({ ...view, objectives: view.objectives.map((objective) => objective.key === "lodgment"
      ? { ...objective, progress: 0.5, progressLabel: "Hold for 1 more segment" } : objective) });
    const situation = root.querySelector<HTMLElement>("#campaignSituationWorkspace");
    assert.ok(situation);
    assert.equal(situation.textContent?.split("Hold the Normandy Lodgment").length, 2);
    assert.match(situation.textContent ?? "", /Hold for 1 more segment/);
    assert.equal(situation.querySelector('[aria-label="Hold the Normandy Lodgment progress"]')?.getAttribute("aria-valuenow"), "50");
    assert.equal(view.objectives[0].progress, 0, "Rendering must not mutate the supplied objective.");
  });
});

registerTest("FSG_CAM_084_CURRENT_FRONTS_PRECEDE_BACKLOG_WITH_EVERY_OBJECTIVE_SELECTABLE", async ({ Given, When, Then }) => {
  const root = mountSituation();
  const selections: CampaignCommandSelection[] = [];
  const shell = new CampaignCommandShell(root, { onSelectionRequested: (selection) => { selections.push(selection); } });
  const view = firstFrameView();
  await Given("two current fronts and seven upcoming objectives", () => {
    assert.equal(shell.initialize(), true);
    shell.render(view);
  });
  await When("the commander reaches fronts before any upcoming objective and inspects each front", () => {
    const situation = root.querySelector<HTMLElement>("#campaignSituationWorkspace");
    assert.ok(situation);
    for (const front of view.fronts ?? []) {
      const frontAction = buttonContaining(situation, front.label);
      for (const objective of view.objectives.filter((entry) => entry.status === "Upcoming")) {
        const objectiveAction = buttonContaining(situation, objective.label);
        assert.ok(frontAction.compareDocumentPosition(objectiveAction) & Node.DOCUMENT_POSITION_FOLLOWING,
          "Reading and keyboard order must reach current front choices before the upcoming backlog.");
      }
      frontAction.click();
      assert.equal(root.querySelector("#campaignContextInspector")?.getAttribute("data-selection-kind"), "front");
      shell.showWorkspace("situation", true);
    }
  });
  await Then("every upcoming objective still opens its exact canonical selection", () => {
    const situation = root.querySelector<HTMLElement>("#campaignSituationWorkspace");
    assert.ok(situation);
    for (const objective of view.objectives.filter((entry) => entry.status === "Upcoming")) {
      buttonContaining(situation, objective.label).click();
      assert.equal(root.querySelector("#campaignContextInspector")?.getAttribute("data-selection-kind"), "objective");
      shell.showWorkspace("situation", true);
    }
    assert.deepEqual(selections, [
      { kind: "front", id: "utah" }, { kind: "front", id: "orne" },
      ...view.objectives.filter((entry) => entry.status === "Upcoming").map((objective) => ({ kind: "objective", id: objective.key }))
    ]);
    assert.equal(root.querySelector("#campaignSituationObjectiveCount")?.textContent, "1 active");
  });
});

registerTest("FSG_CAM_084_REPORT_PRIORITY_AND_UNMATCHED_PRIORITY_PRESERVE_ACTIVE_OBJECTIVE_ACCESS", async ({ Given, When, Then }) => {
  const root = mountSituation();
  const routes: string[] = [];
  const selections: CampaignCommandSelection[] = [];
  let intelligenceOpens = 0;
  const shell = new CampaignCommandShell(root, {
    onAlertSelected: (kind, id) => { routes.push(`${kind}:${id}`); },
    onSelectionRequested: (selection) => { selections.push(selection); },
    onOpenIntelligence: () => { intelligenceOpens += 1; }
  });
  const view = firstFrameView();
  await Given("an objective priority is replaced by a command report", () => {
    assert.equal(shell.initialize(), true);
    shell.render(view);
    shell.render({ ...view, priorities: [{
      id: "report:recon", severity: "critical", label: "Latest command report", title: "New movement assessed",
      detail: "Review the latest reconnaissance.", actionLabel: "Review report", targetKind: "intelligence", targetId: "recon"
    }] });
  });
  await When("the commander reviews the report and the independently available active objective", () => {
    const situation = root.querySelector<HTMLElement>("#campaignSituationWorkspace");
    assert.ok(situation);
    buttonContaining(situation, "Review report").click();
    assert.equal(shell.getActiveWorkspace(), "intelligence");
    assert.equal(intelligenceOpens, 1);
    assert.deepEqual(routes, ["intelligence:recon"]);
    shell.showWorkspace("situation", true);
    buttonContaining(situation, "Hold the Normandy Lodgment").click();
    assert.deepEqual(selections, [{ kind: "objective", id: "lodgment" }]);
  });
  await Then("missing or unmatched priorities never remove the active objective or its progress", () => {
    for (const priorities of [[], [{ ...view.priorities![0], targetId: "another-objective", title: "Another command priority" }]]) {
      shell.render({ ...view, priorities });
      shell.showWorkspace("situation", true);
      const situation = root.querySelector<HTMLElement>("#campaignSituationWorkspace");
      assert.ok(situation);
      buttonContaining(situation, "Hold the Normandy Lodgment");
      assert.equal(situation.querySelectorAll('[role="progressbar"][aria-label="Hold the Normandy Lodgment progress"]').length, 1);
      assert.match(situation.textContent ?? "", /Hold for 2 more segments/);
    }
  });
});

registerTest("FSG_CAM_084_ZERO_PROGRESS_OMITS_FORECAST_WITHOUT_REGRADING_CAMPAIGN", async ({ Given, When, Then }) => {
  const root = mountSituation();
  const shell = new CampaignCommandShell(root);
  const view = firstFrameView();
  await Given("the opening projection reports zero score and no objective progress", () => {
    assert.equal(shell.initialize(), true);
    shell.render(view);
  });
  await When("the commander reads the opening score", () => {
    const situation = root.querySelector("#campaignSituationWorkspace");
    assert.match(situation?.textContent ?? "", /0 \/ 875 · 0%/);
    assert.doesNotMatch(situation?.textContent ?? "", /Projected Decisive victory/);
    assert.equal(view.objectiveScore?.projectedGrade, "Decisive victory");
  });
  await Then("earned score or objective progress preserves the exact supplied forecast without calculating a new grade", () => {
    shell.render({ ...view, objectiveScore: { earned: 75, available: 875, percent: 9, projectedGrade: "Costly victory" } });
    assert.match(root.querySelector("#campaignSituationWorkspace")?.textContent ?? "", /75 \/ 875 · 9%/);
    assert.match(root.querySelector("#campaignSituationWorkspace")?.textContent ?? "", /Projected Costly victory/);
    shell.render({ ...view, objectives: view.objectives.map((objective) => objective.key === "lodgment" ? { ...objective, progress: 0.5 } : objective) });
    assert.match(root.querySelector("#campaignSituationWorkspace")?.textContent ?? "", /Projected Decisive victory/);
  });
});
