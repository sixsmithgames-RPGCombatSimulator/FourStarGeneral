import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { CampaignScreen } from "../src/ui/screens/CampaignScreen";
import { ensureCampaignState } from "../src/state/CampaignState";

function mountCampaignScreenRoot(): HTMLElement {
  document.body.innerHTML = "<div id=\"campaignScreen\"><div id=\"campaignSelectionInfo\"></div></div>";
  const root = document.getElementById("campaignScreen");
  if (!root) {
    throw new Error("Campaign screen root was not created for test");
  }
  return root;
}

registerTest("CAMPAIGNSCREEN_RENDERS_HEADQUARTERS_STATUS_HANDOFF", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  let selectionInfo: HTMLElement | null = null;

  await Given("a campaign screen with a pending headquarters handoff message", async () => {
    campaignState.reset();
    mountCampaignScreenRoot();
    const screen = new CampaignScreen({ showScreenById() {} } as any, {} as any);
    screen.initialize();
    campaignState.setHeadquartersStatusMessage({
      title: "Mission completed successfully.",
      detail: "Headquarters logged <Coastal Push> & updated the front.",
      action: "Review the new front line and continue.",
      tone: "success"
    });
    selectionInfo = document.getElementById("campaignSelectionInfo");
  });

  await When("the selection panel re-renders", async () => {
    if (!selectionInfo) {
      throw new Error("Expected campaign selection container to exist");
    }
  });

  await Then("the headquarters handoff is shown with safe text and live-region status", async () => {
    if (!selectionInfo) {
      throw new Error("Expected campaign selection container to exist");
    }
    if (selectionInfo.getAttribute("aria-live") !== "assertive") {
      throw new Error(`Expected aria-live=assertive, received ${selectionInfo.getAttribute("aria-live")}`);
    }
    if (selectionInfo.getAttribute("data-status") !== "success") {
      throw new Error(`Expected data-status=success, received ${selectionInfo.getAttribute("data-status")}`);
    }
    if (!selectionInfo.textContent?.includes("Mission completed successfully.")) {
      throw new Error("Expected headquarters title in campaign selection panel");
    }
    if (!selectionInfo.textContent.includes("Headquarters logged <Coastal Push> & updated the front.")) {
      throw new Error(`Expected escaped headquarters detail in text content, received ${selectionInfo.textContent}`);
    }
    if (selectionInfo.innerHTML.includes("<Coastal Push>")) {
      throw new Error("Expected headquarters detail to be HTML-escaped in the rendered markup");
    }
    campaignState.reset();
  });
});

registerTest("CAMPAIGNSCREEN_EXPORT_WITHOUT_SCENARIO_USES_STATUS_MESSAGE", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  let selectionInfo: HTMLElement | null = null;
  let screen: CampaignScreen;
  let alertCount = 0;
  const originalAlert = window.alert ?? (() => {});

  await Given("a campaign screen with no loaded scenario", async () => {
    campaignState.reset();
    mountCampaignScreenRoot();
    screen = new CampaignScreen({ showScreenById() {} } as any, {} as any);
    screen.initialize();
    selectionInfo = document.getElementById("campaignSelectionInfo");
    window.alert = (() => {
      alertCount += 1;
    }) as typeof window.alert;
  });

  await When("export is attempted", async () => {
    try {
      (screen as any).exportCampaignJSON();
    } finally {
      window.alert = originalAlert;
    }
  });

  await Then("the failure is shown in the selection panel instead of alert", async () => {
    if (!selectionInfo) {
      throw new Error("Expected campaign selection container to exist");
    }
    if (alertCount !== 0) {
      throw new Error(`Expected alert() to be unused, received ${alertCount} calls`);
    }
    if (selectionInfo.getAttribute("data-status") !== "warning") {
      throw new Error(`Expected warning status, received ${selectionInfo.getAttribute("data-status")}`);
    }
    if (!selectionInfo.textContent?.includes("Export failed.")) {
      throw new Error("Expected export failure title in campaign selection panel");
    }
    if (!selectionInfo.textContent.includes("No campaign scenario is currently loaded.")) {
      throw new Error(`Expected export failure detail, received ${selectionInfo.textContent}`);
    }
    if (!selectionInfo.textContent.includes("Load a campaign scenario before exporting JSON.")) {
      throw new Error("Expected corrective action for export failure.");
    }
    campaignState.reset();
  });
});
