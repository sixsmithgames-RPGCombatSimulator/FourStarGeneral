/** Owns workspace/layer scope, stored-state parity, and the corrected Map list keyboard method. */
import "./domEnvironment.js";
import { readFileSync } from "node:fs";
import { registerTest } from "./harness.js";
import { CampaignCommandScreen } from "../src/ui/campaign/CampaignCommandScreen";
import { CampaignCommandUIState } from "../src/ui/campaign/CampaignCommandUIState";
import type { CampaignWorkspaceId, CampaignOverlayId } from "../src/ui/campaign/CampaignCommandUIState";

function mountNavigation(): { root: HTMLElement; screen: CampaignCommandScreen } {
  // Parse the product markup inertly: unit interaction tests must not fetch styles
  // or execute page resources. Browser geometry owns actual stylesheet behavior.
  const markup = document.createElement("template");
  markup.innerHTML = readFileSync("index.html", "utf8");
  const root = markup.content.querySelector<HTMLElement>("#campaignScreen");
  if (!root) throw new Error("Campaign entry markup is missing.");
  document.body.replaceChildren(root);
  const screen = new CampaignCommandScreen(root, {}, { v2Enabled: true });
  if (!screen.initialize()) throw new Error("Campaign command screen did not initialize.");
  return { root, screen };
}

registerTest("FSG_CAM_060_HEADQUARTERS_AND_MAP_LAYER_HAVE_DISTINCT_FULL_LABELS", () => {
  const { root, screen } = mountNavigation();
  const rail = root.querySelector(".campaign-workspace-rail");
  if (!rail?.textContent?.includes("Headquarters")) throw new Error("Headquarters scope is not visible on the workspace rail.");
  for (const [id, label] of [["operational", "Operational"], ["objectives", "Objectives"], ["forces", "Forces"], ["intelligence", "Intelligence"], ["orders", "Orders"]]) {
    const button = root.querySelector(`[data-map-overlay-id='${id}']`);
    if (button?.textContent?.trim() !== label) throw new Error(`Map layer ${id} uses an unexplained or duplicate abbreviation.`);
  }
  const select = root.querySelector(".campaign-map-overlay-select");
  if (!select?.querySelector("span")?.textContent?.includes("Map layer")) throw new Error("Compact map selector has no visible Map layer scope.");
  screen.destroy();
});

registerTest("FSG_CAM_061_WORKSPACE_LAYER_AND_NAVIGATION_STAY_IN_AGREEMENT", () => {
  const { root, screen } = mountNavigation();
  const check = (workspace: CampaignWorkspaceId, overlay: CampaignOverlayId): void => {
    const state = screen.getUIState().getSnapshot();
    const selected = root.querySelector("[data-campaign-workspace-tab][aria-selected='true']");
    const pressed = root.querySelector("[data-map-overlay-id][aria-pressed='true']");
    if (state.workspace !== workspace || state.overlay !== overlay
      || root.querySelectorAll("[data-campaign-workspace-tab][aria-selected='true']").length !== 1
      || root.querySelectorAll("[data-map-overlay-id][aria-pressed='true']").length !== 1
      || selected?.getAttribute("data-campaign-workspace-tab") !== workspace
      || pressed?.getAttribute("data-map-overlay-id") !== overlay
      || root.querySelector<HTMLSelectElement>(".campaign-map-overlay-select select")?.value !== overlay
      || root.querySelector("#campaignHexMap")?.getAttribute("data-overlay-mode") !== overlay) {
      throw new Error(`Stored state, workspace, layer and map disagree at ${workspace}/${overlay}.`);
    }
  };
  for (const [workspace, defaultLayer] of [["situation", "operational"], ["forces", "forces"], ["logistics", "operational"], ["intelligence", "intelligence"]] as const) {
    root.querySelector<HTMLButtonElement>(`[data-campaign-workspace-tab='${workspace}']`)?.click();
    check(workspace, defaultLayer);
    for (const layer of ["operational", "objectives", "forces", "intelligence", "orders"] as const) {
      root.querySelector<HTMLButtonElement>(`[data-map-overlay-id='${layer}']`)?.click();
      check(workspace, layer);
      const select = root.querySelector<HTMLSelectElement>(".campaign-map-overlay-select select");
      if (!select) throw new Error("Compact map layer selector is missing.");
      select.value = defaultLayer;
      select.dispatchEvent(new window.Event("change", { bubbles: true }));
      check(workspace, defaultLayer);
    }
  }
  const activeTab = root.querySelector<HTMLButtonElement>("[data-campaign-workspace-tab][aria-selected='true']");
  activeTab?.focus();
  activeTab?.dispatchEvent(new window.KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
  check("logistics", "operational");
  screen.navigate({ kind: "logistics", id: null });
  check("logistics", "operational");
  screen.navigate({ kind: "objective", id: "objective-test" });
  check("situation", "objectives");
  if (screen.getUIState().getSnapshot().selection?.id !== "objective-test") throw new Error("Deep link lost its entity identity.");
  screen.destroy();
});

registerTest("FSG_CAM_062_ESCAPE_FROM_FOCUSED_MAP_LIST_DESCENDANT_RESTORES_TOGGLE", () => {
  const { root, screen } = mountNavigation();
  const toggle = root.querySelector<HTMLButtonElement>(".campaign-map-list-toggle");
  const panel = root.querySelector<HTMLElement>("#campaignMapAccessibleList");
  const descendant = panel?.querySelector<HTMLInputElement>("input[type='search']");
  if (!toggle || !panel || !descendant) throw new Error("Map list controls are missing.");
  toggle.focus();
  toggle.click();
  descendant.focus();
  if (panel.hidden || document.activeElement !== descendant) throw new Error("The real Map list descendant must own focus before Escape.");
  document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  if (!panel.hidden || document.activeElement !== toggle || toggle.getAttribute("aria-expanded") !== "false") {
    throw new Error("Escape failed to close Map list and return focus from its active descendant.");
  }
  screen.destroy();
});

registerTest("FSG_CAM_061_WORKSPACE_TRANSITION_EMITS_ONE_COHERENT_DEFAULT_LAYER", () => {
  const state = new CampaignCommandUIState();
  let changes = 0;
  state.getEvents().on("state:changed", ({ current }) => {
    changes += 1;
    if (current.workspace === "intelligence" && current.overlay !== "intelligence") {
      throw new Error("Workspace event exposed a contradictory default layer.");
    }
  });
  state.setWorkspace("intelligence");
  if (changes !== 1) throw new Error("A workspace transition must publish one coherent state.");
});
