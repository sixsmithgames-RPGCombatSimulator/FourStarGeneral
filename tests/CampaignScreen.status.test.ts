import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
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

registerTest("CAMPAIGNSCREEN_EDITOR_REPORTS_INVALID_BASE_MOVE_SAFELY", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  let selectionInfo: HTMLElement | null = null;
  let screen: CampaignScreen;

  await Given("an objective-bearing campaign base selected in the authorized editor", async () => {
    campaignState.reset();
    document.body.innerHTML = `
      <div id="campaignScreen">
        <div id="campaignSelectionInfo"></div>
        <input id="editorCol" value="27" />
        <input id="editorRow" value="37" />
      </div>
    `;
    campaignState.setScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    screen = new CampaignScreen({ showScreenById() {} } as any, {} as any);
    screen.initialize();
    (screen as any).selectedHexKey = "20,28";
    selectionInfo = document.getElementById("campaignSelectionInfo");
  });

  await When("the editor attempts to move that base away from its authored objective", async () => {
    (screen as any).moveBase();
  });

  await Then("the campaign remains intact and the editor explains the rejected move without a page error", async () => {
    const scenario = campaignState.getScenario();
    if (!scenario?.tiles.some((tile) => tile.hex.q === 20 && tile.hex.r === 18)) {
      throw new Error("Rejected base move removed the objective-bearing campaign tile.");
    }
    if (selectionInfo?.getAttribute("data-status") !== "warning"
      || !selectionInfo.textContent?.includes("Base move failed.")) {
      throw new Error(`Expected a safe editor warning, received '${selectionInfo?.textContent ?? ""}'.`);
    }
    campaignState.reset();
  });
});
registerTest("CAMPAIGNSCREEN_ENEMY_INITIATIVE_FRONT_CANNOT_BE_LAUNCHED_BY_PLAYER", async ({ Given, When, Then }) => {
  let screen: CampaignScreen;
  let queueButton: HTMLButtonElement;
  const scenario = {
    fronts: [
      { key: "enemy-front", label: "Enemy Front", hexKeys: ["4,4"], initiative: "Bot" },
      { key: "player-front", label: "Player Front", hexKeys: ["5,5"], initiative: "Player" }
    ]
  };

  await Given("the commander has selected a front where the opposing command owns initiative", async () => {
    screen = Object.create(CampaignScreen.prototype) as CampaignScreen;
    (screen as any).selectionContainer = document.createElement("div");
    queueButton = document.createElement("button");
    (screen as any).queueEngagementButton = queueButton;
    (screen as any).campaignState = {
      getCampaignMapView: () => ({ scenario }),
      getHeadquartersStatusMessage: () => null,
      getPendingEngagements: () => [],
      getActiveCampaignBattlePackage: () => null,
      hasActionableEnemyContactNear: () => false
    };
    (screen as any).campaignStatusMessage = null;
    (screen as any).selectedHexKey = null;
    (screen as any).selectedFrontKey = "enemy-front";
    (screen as any).moveOriginHexKey = null;
    (screen as any).editMode = false;
  });

  await When("campaign selection actions are projected", async () => {
    (screen as any).renderSelection();
  });

  await Then("the tactical engagement control stays disabled until Player owns initiative", async () => {
    if (!queueButton.disabled) {
      throw new Error("Expected an enemy-initiative front to block a player-launched tactical engagement.");
    }
    (screen as any).selectedFrontKey = "player-front";
    (screen as any).renderSelection();
    if (queueButton.disabled) {
      throw new Error("Expected a Player-initiative front to permit a tactical engagement.");
    }
  });
});

registerTest("CAMPAIGNSCREEN_FORMATS_INTERNAL_CAMPAIGN_LABELS_FOR_PLAYERS", async ({ Given, When, Then }) => {
  const screen = Object.create(CampaignScreen.prototype) as CampaignScreen;
  const labels: string[] = [];

  await Given("raw infrastructure and unit identifiers from campaign truth", () => {});

  await When("the shared campaign presentation formatter renders them", () => {
    labels.push(
      (screen as any).formatCampaignLabel("navalBase"),
      (screen as any).formatCampaignLabel("Infantry_42"),
      (screen as any).formatCampaignLabel("transport_ship")
    );
  });

  await Then("camelCase and snake_case tokens become first-class labels", () => {
    if (labels.join("|") !== "Naval Base|Infantry 42|Transport Ship") {
      throw new Error(`Campaign formatter exposed raw implementation labels: ${labels.join("|")}.`);
    }
  });
});
