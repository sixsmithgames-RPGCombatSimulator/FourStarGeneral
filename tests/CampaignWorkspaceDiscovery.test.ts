/** Workspace interaction contracts: full-theater discovery, exact selection, explicit read actions. */
import "./domEnvironment";
import assert from "node:assert/strict";
import { registerTest } from "./harness";
import { CampaignCommandShell, type CampaignCommandShellView, type CampaignCommandFormationView } from "../src/ui/campaign/CampaignCommandShell";
import type { CampaignCommandSelection } from "../src/ui/campaign/CampaignCommandUIState";

function mount(): HTMLElement {
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
  return document.querySelector<HTMLElement>("#campaignScreen")!;
}

function formation(id: string, changes: Partial<CampaignCommandFormationView> = {}): CampaignCommandFormationView {
  return {
    id, name: "1st Battalion", commandLabel: "VII Corps", typeLabel: "Infantry", ownershipLabel: "Player", locationHexKey: "1,1",
    location: { primaryLabel: "Carentan", secondaryGridReference: "Grid 1,1" }, statusLabel: "Ready", postureKey: "ready", canReceiveOrders: true,
    readiness: "90%", cohesion: "85%", fatigue: "10%", personnel: "650 fit / 700 present", equipment: "8 / 10 operational", supply: "Ammo 30",
    experience: "10 XP", honors: [], battles: 0, currentOrderId: null, latestHistory: null, ...changes
  };
}

function view(changes: Partial<CampaignCommandShellView> = {}): CampaignCommandShellView {
  return {
    theaterTitle: "Operation Overlord", campaignPhase: "Opening phase", timeLabel: "Day 2, dawn", commandStatus: "Planning", saveStatus: "Saved",
    unreadReports: 0, resources: [], objectives: [], forces: [], fronts: [{ key: "carentan", label: "Carentan front", hexKeys: ["1,1"], initiativeLabel: "Friendly" }],
    formations: [formation("front"), formation("reserve", { name: "Dorset Infantry", commandLabel: "Southern Command", locationHexKey: "9,9", location: { primaryLabel: "Portsmouth", secondaryGridReference: "Grid 9,9" } })],
    contacts: [],
    airPower: 0, navalPower: 999, intelligenceCapacity: "3/3", orders: [],
    advance: { mode: "segment", enabled: true, pauseAfterEveryResolution: false, summary: "Planning", alerts: [], timeline: [] }, ...changes
  };
}

registerTest("FSG_CAM_071_FORCES_DISCOVERY_FOCUSES_EXACT_FORMATION_AND_PRESERVES_CONTROLS", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  let shell: CampaignCommandShell;
  let selection: CampaignCommandSelection = null;
  let workspaceChanges = 0;
  let layerChanges = 0;
  await Given("Forces opens with one active formation and one rear reserve", () => {
    root = mount();
    shell = new CampaignCommandShell(root, { onSelectionRequested: (next) => { selection = next; }, onWorkspaceChanged: () => { workspaceChanges += 1; }, onMapLayerChanged: () => { layerChanges += 1; } });
    assert.equal(shell.initialize(), true);
    shell.render(view());
    shell.showWorkspace("forces", true);
    assert.equal(root.querySelectorAll("#campaignForcesWorkspaceList [data-force-id]").length, 1);
    assert.equal(root.querySelector<HTMLDetailsElement>("#campaignForcesTheater")?.open, false);
    assert.match(root.querySelector("#campaignForcesWorkspaceList")?.textContent ?? "", /Carentan front.*VII Corps/s);
  });
  await When("the commander finds a reserve using its command, formation, and named location", () => {
    const search = root.querySelector<HTMLInputElement>("#campaignForcesSearch");
    assert.ok(search, "Forces requires an entire-theater search control.");
    const changedBefore = workspaceChanges;
    search.focus();
    search.value = "Southern Dorset Portsmouth";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    assert.equal(document.activeElement, search);
    assert.equal(root.querySelectorAll("#campaignForcesWorkspaceList [data-force-id]").length, 1);
    assert.equal(root.querySelector("#campaignForcesWorkspaceList [data-force-id]")?.getAttribute("data-force-id"), "reserve");
    root.querySelector<HTMLButtonElement>("[data-force-filter='ready']")!.click();
    assert.equal(root.querySelector("[data-force-filter='ready']")?.getAttribute("aria-pressed"), "true");
    assert.equal(workspaceChanges, changedBefore, "Discovery cannot reset workspace/map-layer selection.");
    assert.equal(layerChanges, 0);
    root.querySelector<HTMLButtonElement>("#campaignForcesWorkspaceList [data-force-id='reserve']")!.click();
  });
  await Then("selection uses the persistent formation ID and rerender keeps search and theater disclosure", () => {
    assert.deepEqual(selection, { kind: "formation", id: "reserve" });
    const theater = root.querySelector<HTMLDetailsElement>("#campaignForcesTheater")!;
    theater.open = true;
    const search = root.querySelector<HTMLInputElement>("#campaignForcesSearch")!;
    search.focus();
    shell.render(view());
    assert.equal(document.activeElement, search);
    assert.equal(root.querySelector<HTMLInputElement>("#campaignForcesSearch")?.value, "Southern Dorset Portsmouth");
    assert.equal(theater.open, true);
    assert.equal(root.querySelectorAll("#campaignForcesTheaterList [data-force-id]").length, 1);
    assert.match(root.querySelector("#campaignForcesWorkspaceList")?.textContent ?? "", /Portsmouth.*Grid 9,9/s);
  });
});

registerTest("FSG_CAM_071_EMPTY_SEARCH_HAS_RECOVERY_AND_SAFE_TEXT", async ({ Given, When, Then }) => {
  const root = mount();
  const shell = new CampaignCommandShell(root);
  await Given("an authored force name includes markup-like text", () => {
    shell.initialize();
    shell.render(view({ formations: [formation("safe", { name: "<img src=x onerror=alert(1)>" })] }));
    assert.equal(root.querySelector("#campaignForcesWorkspaceList img"), null);
    assert.match(root.querySelector("#campaignForcesWorkspaceList")?.textContent ?? "", /<img/);
  });
  await When("a search matches nothing", () => {
    const search = root.querySelector<HTMLInputElement>("#campaignForcesSearch")!;
    search.value = "No such formation";
    search.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await Then("the player gets a clear recovery instruction instead of a missing roster", () => {
    assert.match(root.querySelector("#campaignForcesWorkspaceList")?.textContent ?? "", /Clear the search or choose All/);
    assert.match(root.querySelector("#campaignForcesResultCount")?.textContent ?? "", /0 of 1/);
  });
});
