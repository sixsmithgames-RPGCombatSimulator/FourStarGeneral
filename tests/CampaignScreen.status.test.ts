import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import campaignScenarioData from "../src/data/campaign01.json";
import type { CampaignScenarioData } from "../src/core/campaignTypes";
import { CampaignScreen, resolveCampaignCounterattackStageLabel } from "../src/ui/screens/CampaignScreen";
import { ensureCampaignState } from "../src/state/CampaignState";
import { CoordinateSystem } from "../src/rendering/CoordinateSystem";

function mountCampaignScreenRoot(): HTMLElement {
  document.body.innerHTML = "<div id=\"campaignScreen\"><div id=\"campaignSelectionInfo\"></div></div>";
  const root = document.getElementById("campaignScreen");
  if (!root) {
    throw new Error("Campaign screen root was not created for test");
  }
  return root;
}

registerTest("CAMPAIGNSCREEN_COUNTERATTACK_STAGE_STOPS_ADVERTISING_A_RESOLVED_THREAT", async ({ Given, When, Then }) => {
  let before = "";
  let active = "";
  let resolved = "";

  await Given("one authored counterattack cadence with retained terminal ledger history", () => {});
  await When("the front stage is projected before, during, and after the battle", () => {
    before = resolveCampaignCounterattackStageLabel({ cadenceSegment: 2, currentSegment: 0, active: false, priorStatus: null, timeLabel: "D+1 · 06:00" }) ?? "";
    active = resolveCampaignCounterattackStageLabel({ cadenceSegment: 2, currentSegment: 2, active: true, priorStatus: "inBattle", timeLabel: "D+1 · 06:00" }) ?? "";
    resolved = resolveCampaignCounterattackStageLabel({ cadenceSegment: 2, currentSegment: 3, active: false, priorStatus: "resolved", timeLabel: "D+1 · 06:00" }) ?? "";
  });
  await Then("timing, mandatory command, and completion remain distinct and truthful", () => {
    if (!before.includes("expected in 6 hours")
      || active !== "Enemy counterattack requires command now."
      || resolved !== "Enemy counterattack resolved."
      || /requires command|next campaign resolution/i.test(resolved)) {
      throw new Error(`Counterattack stage copy is stale: before='${before}' active='${active}' resolved='${resolved}'.`);
    }
  });
});

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
    (screen as any).selectedHexKey = "26,23";
    selectionInfo = document.getElementById("campaignSelectionInfo");
  });

  await When("the editor attempts to move that base away from its authored objective", async () => {
    (screen as any).moveBase();
  });

  await Then("the campaign remains intact and the editor explains the rejected move without a page error", async () => {
    const scenario = campaignState.getScenario();
    if (!scenario?.tiles.some((tile) => tile.hex.q === 26 && tile.hex.r === 10)) {
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

registerTest("CAMPAIGNSCREEN_FRONT_COPY_USES_THE_LAUNCH_INTELLIGENCE_ASSESSMENT", async ({ Given, When, Then }) => {
  const campaignState = ensureCampaignState();
  const screen = Object.create(CampaignScreen.prototype) as CampaignScreen;
  let assessment: any;
  let expected = "";

  await Given("the shipped Normandy front whose assessed contact sits on the opposing edge rather than the friendly front hex", () => {
    campaignState.reset();
    campaignState.setScenario(structuredClone(campaignScenarioData) as CampaignScenarioData);
    (screen as any).campaignState = campaignState;
  });

  await When("the front card assesses the same exact edge used by tactical launch", () => {
    const prepared = campaignState.prepareCampaignFrontEngagement({
      engagementId: "front-copy-assessment",
      frontKey: "omaha_gold",
      attacker: "Player",
      requestedTargetHexKey: "24,24"
    });
    if (!prepared.ok) throw new Error(prepared.reason);
    const briefing = prepared.engagement.context.intelligenceBriefing;
    if (!briefing) throw new Error("The shipped launch did not provide a Player-safe briefing.");
    expected = briefing.resistanceBand === "unknown"
      ? `${briefing.contacts.length} assessed contact area${briefing.contacts.length === 1 ? "" : "s"} · strength and formation count unknown · ${briefing.confidenceBand} confidence.`
      : `${briefing.contacts.length} assessed opposing contact${briefing.contacts.length === 1 ? "" : "s"} · ${briefing.resistanceBand} resistance · ${briefing.confidenceBand} confidence.`;
    assessment = (screen as any).getPlayerFrontAssessment("omaha_gold", "24,24");
  });

  await Then("front copy and launch availability agree without claiming there is no contact", () => {
    if (!assessment.canLaunch || assessment.pressureLabel !== expected || /no assessed hostile contact/i.test(assessment.pressureLabel)) {
      throw new Error(`Front assessment diverged from launch briefing: ${JSON.stringify(assessment)} expected ${expected}`);
    }
    if (assessment.target?.targetHexKey !== "24,24"
      || assessment.target?.missionLabel !== "Fortified Assault"
      || assessment.target?.roleLabel !== "Player attacks · Bot defends") {
      throw new Error(`Front assessment dropped campaign-to-tactical identity: ${JSON.stringify(assessment.target)}.`);
    }
    campaignState.reset();
  });
});

registerTest("CAMPAIGNSCREEN_MULTI_EDGE_FRONT_REQUIRES_ONE_EXPLICIT_TARGET", async ({ Given, When, Then }) => {
  const screen = Object.create(CampaignScreen.prototype) as CampaignScreen;
  let unresolved: any;
  let resolved: any;

  await Given("a Player-initiative front with two legal opposing-control edges and different intelligence", () => {
    (screen as any).selectedFrontTargetHexKey = null;
    (screen as any).campaignState = {
      getCampaignMapView: () => ({
        scenario: {
          fronts: [{
            key: "split-front",
            initiative: "Player",
            edges: [
              { friendlyHexKey: "4,4", opposingHexKey: "5,5" },
              { friendlyHexKey: "4,5", opposingHexKey: "6,6" }
            ]
          }]
        }
      }),
      prepareCampaignFrontEngagement: ({ requestedTargetHexKey }: { requestedTargetHexKey: string }) => ({
        ok: true,
        engagement: {
          context: {
            battleHexKey: requestedTargetHexKey,
            missionType: requestedTargetHexKey === "5,5" ? "meetingEngagement" : "portAssault",
            attacker: "Player",
            defender: "Bot",
            intelligenceBriefing: {
              contacts: Array.from({ length: requestedTargetHexKey === "5,5" ? 1 : 2 }, (_, index) => ({ contactId: `${requestedTargetHexKey}:${index}` })),
              resistanceBand: requestedTargetHexKey === "5,5" ? "light" : "heavy",
              confidenceBand: requestedTargetHexKey === "5,5" ? "medium" : "low",
              explicitUnknowns: [requestedTargetHexKey === "5,5" ? "Reserve strength" : "Coastal artillery"]
            }
          }
        }
      })
    };
  });

  await When("the front is assessed before and after an explicit target choice", () => {
    unresolved = (screen as any).getPlayerFrontAssessment("split-front", null);
    resolved = (screen as any).getPlayerFrontAssessment("split-front", "6,6");
  });

  await Then("the button cannot launch a blended assessment and the selected target keeps its own identity and bands", () => {
    if (unresolved.canLaunch || !unresolved.targetRequired || unresolved.targets.length !== 2
      || !/choose the engagement hex/i.test(unresolved.pressureLabel)) {
      throw new Error(`Multi-edge assessment launched without a target: ${JSON.stringify(unresolved)}.`);
    }
    if (!resolved.canLaunch || resolved.target?.targetHexKey !== "6,6"
      || resolved.target?.missionLabel !== "Port Assault"
      || !resolved.pressureLabel.includes("2 assessed opposing contacts · heavy resistance · low confidence")) {
      throw new Error(`Explicit front target used blended or first-edge identity: ${JSON.stringify(resolved)}.`);
    }
  });
});

registerTest("CAMPAIGNSCREEN_REDEPLOYMENT_PLANNER_PRIORITIZES_RELEVANT_CHOICES_AND_ONE_BLOCKER", async ({ Given, When, Then }) => {
  const screen = Object.create(CampaignScreen.prototype) as CampaignScreen;
  const origin = "2,2";
  const destination = "3,2";
  const originAxial = CoordinateSystem.offsetToAxial(2, 2);
  const destinationAxial = CoordinateSystem.offsetToAxial(3, 2);
  let popupBody: HTMLElement;

  await Given("a ground route with infantry, artillery, and one duplicated reservation conflict", () => {
    document.body.innerHTML = `
      <div id="battlePopupLayer" class="hidden" aria-hidden="true">
        <section class="battle-popup">
          <h2 data-popup-title></h2>
          <button id="battlePopupClose" type="button">Close</button>
          <div data-popup-body></div>
        </section>
      </div>`;
    popupBody = document.querySelector<HTMLElement>("[data-popup-body]")!;
    const duplicate = {
      code: "ORDER_RESERVATION_CONFLICT",
      message: "The selected infantry exceeds the uncommitted force at the origin.",
      correctiveAction: "Reduce the quantity or remove an earlier movement draft."
    };
    (screen as any).campaignState = {
      getCampaignMapView: () => ({
        scenario: {
          key: "planner-clarity",
          title: "Planner clarity",
          description: "Only relevant movement choices should be visible.",
          dimensions: { cols: 5, rows: 5 },
          hexScaleKm: 10,
          background: { imageUrl: "about:blank" },
          tilePalette: {
            origin: { role: "fortificationLight", factionControl: "Player", mapLabel: "Plymouth" },
            destination: { role: "region", factionControl: "Player", mapLabel: "Utah" }
          },
          tiles: [
            {
              tile: "origin",
              hex: originAxial,
              forces: [
                { unitType: "Infantry_42", count: 2, label: "1st Infantry Division" },
                { unitType: "Infantry_42", count: 1, label: "Beachhead Reserve" },
                { unitType: "Artillery_105mm", count: 1, label: "Field Artillery Battalion" }
              ]
            },
            { tile: "destination", hex: destinationAxial }
          ],
          fronts: [],
          objectives: [],
          economies: []
        }
      }),
      getCampaignRedeployAvailableFormations: () => [
        { id: "infantry-1", name: "1st Infantry Division · I", campaignUnitType: "Infantry_42", locationHexKey: `${originAxial.q},${originAxial.r}`, status: "ready", readiness: 91 },
        { id: "infantry-2", name: "1st Infantry Division · II", campaignUnitType: "Infantry_42", locationHexKey: `${originAxial.q},${originAxial.r}`, status: "ready", readiness: 88 },
        { id: "reserve-1", name: "Beachhead Reserve", campaignUnitType: "Infantry_42", locationHexKey: `${originAxial.q},${originAxial.r}`, status: "ready", readiness: 84 },
        { id: "artillery-1", name: "Field Artillery Battalion", campaignUnitType: "Artillery_105mm", locationHexKey: `${originAxial.q},${originAxial.r}`, status: "ready", readiness: 90 }
      ],
      getTransportRouteEligibility: (_origin: string, _destination: string, modeKey: string) => ({
        available: modeKey !== "naval" && modeKey !== "fighter" && modeKey !== "bomber",
        reason: null,
        correctiveAction: null,
        crossesWater: false
      }),
      previewRedeploy: () => ({
        ok: false,
        diagnostics: [duplicate, duplicate],
        etaSegment: 1,
        timeSegments: 1,
        fuelCost: 0,
        fuelAvailable: 100,
        suppliesCost: 3,
        suppliesAvailable: 100,
        capacityNeeded: 0,
        capacityAvailable: null,
        manpowerLoss: 0
      }),
      segmentToTimeDisplay: () => "D+1 · 7 June 1944, 03:00–06:00",
      createRedeployDraft: () => ({ ok: false, reason: "Not submitted in this presentation test." })
    };
    (screen as any).renderer = {
      highlightHex() {},
      clearAllHighlights() {}
    };
  });

  await When("the commander opens the redeployment planner", () => {
    (screen as any).openRedeployModal(origin, destination);
  });

  await Then("only applicable sprite-backed choices and one actionable blocker remain", () => {
    const modes = Array.from(popupBody.querySelectorAll<HTMLButtonElement>(".redeploy-mode-card"));
    const modeKeys = modes.map((mode) => mode.dataset.mode).join(",");
    const issues = popupBody.querySelectorAll(".redeploy-issue");
    const unitRows = popupBody.querySelectorAll(".redeploy-formation-row");
    const confirm = popupBody.querySelector<HTMLButtonElement>("#campaignRedeployConfirm");
    const summary = popupBody.querySelector(".redeploy-summary-panel");
    const units = popupBody.querySelector(".redeploy-units");
    if (modeKeys !== "foot,truck"
      || modes.some((mode) => !mode.querySelector("img.mode-sprite"))
      || issues.length !== 1
      || unitRows.length !== 4
      || popupBody.querySelector("input[type='range']")
      || !popupBody.textContent?.includes("1st Infantry Division · I")
      || !popupBody.textContent?.includes("Beachhead Reserve")
      || !popupBody.textContent?.includes("Field Artillery Battalion")
      || !popupBody.textContent?.includes("Plymouth")
      || !popupBody.textContent?.includes("Utah")
      || popupBody.textContent?.includes("Infantry 42")
      || !summary || !units || !(summary.compareDocumentPosition(units) & Node.DOCUMENT_POSITION_FOLLOWING)
      || !issues[0].textContent?.includes("Reduce the quantity or remove an earlier movement draft.")
      || !confirm?.disabled
      || confirm.textContent !== "Resolve conflict to continue"
      || popupBody.querySelector(".campaign-order-composer__guide")
      || popupBody.querySelector(".campaign-order-preview-contract")
      || popupBody.querySelector(".redeploy-draft-note")
      || /[\u2600-\u27BF\u{1F300}-\u{1FAFF}]/u.test(popupBody.textContent ?? "")) {
      throw new Error(`Redeployment planner remains cluttered or ambiguous: modes=${modeKeys}, issues=${issues.length}, text='${popupBody.textContent}'.`);
    }
    if (document.activeElement !== modes[0]) {
      throw new Error("The planner did not focus its first relevant movement choice.");
    }
  });
});

registerTest("CAMPAIGNSCREEN_FORMATS_INTERNAL_CAMPAIGN_LABELS_FOR_PLAYERS", async ({ Given, When, Then }) => {
  const screen = Object.create(CampaignScreen.prototype) as CampaignScreen;
  const labels: string[] = [];
  const unitLabels: string[] = [];

  await Given("raw infrastructure and unit identifiers from campaign truth", () => {});

  await When("the shared campaign presentation formatter renders them", () => {
    labels.push(
      (screen as any).formatCampaignLabel("navalBase"),
      (screen as any).formatCampaignLabel("Infantry_42"),
      (screen as any).formatCampaignLabel("transport_ship")
    );
    unitLabels.push(
      (screen as any).formatCampaignUnitLabel("Infantry_42"),
      (screen as any).formatCampaignUnitLabel("Artillery_105mm"),
      (screen as any).formatCampaignUnitLabel("Panzer_IV")
    );
  });

  await Then("camelCase and snake_case tokens become first-class labels", () => {
    if (labels.join("|") !== "Naval Base|Infantry 42|Transport Ship") {
      throw new Error(`Campaign formatter exposed raw implementation labels: ${labels.join("|")}.`);
    }
    if (unitLabels.join("|") !== "Infantry|105 mm Artillery|Panzer IV") {
      throw new Error(`Campaign unit formatter exposed production identifiers: ${unitLabels.join("|")}.`);
    }
  });
});

registerTest("CAMPAIGNSCREEN_INTELLIGENCE_OPERATIONS_START_NEUTRAL", async ({ Given, When, Then }) => {
  const screen = Object.create(CampaignScreen.prototype) as CampaignScreen;
  let markup = "";
  let selectedMarkup = "";

  await Given("intelligence assets may be unavailable but the commander has not chosen an operation", () => {
    const rules = ensureCampaignState().getIntelOperationRules();
    (screen as any).intelOperationType = null;
    (screen as any).intelTargetContactId = null;
    (screen as any).editingIntelOrderId = null;
    (screen as any).selectedHexKey = "22,24";
    (screen as any).campaignState = {
      getIntelOperationRules: () => rules,
      getCampaignDraftReservations: () => ({ intelligenceCapacity: 0 }),
      previewIntelOperationDraft: () => ({
        eligibleAssets: [],
        capacityAvailable: 3,
        suppliesAvailable: 200000,
        fuelAvailable: 1000000,
        resolveSegment: null
      }),
      segmentToTimeDisplay: () => "Day 1, 03:00-06:00"
    };
    (screen as any).campaignActionRegistry = {
      resolve: () => ({
        availability: "unavailable",
        reasonCode: "ORDER_ASSET_UNAVAILABLE",
        reason: "No eligible asset is available.",
        correctiveAction: "Choose another operation."
      })
    };
  });

  await When("the Operations tab first renders", () => {
    markup = (screen as any).composeIntelOperationsMarkup({
      capacity: { total: 3, committed: 0, available: 3 }
    }, []);
    (screen as any).intelOperationType = "groundRecon";
    (screen as any).selectedHexKey = null;
    selectedMarkup = (screen as any).composeIntelOperationsMarkup({
      capacity: { total: 3, committed: 0, available: 3 }
    }, []);
  });

  await Then("operation choices appear without a default failure, composer, or generic stage strip", () => {
    const host = document.createElement("div");
    host.innerHTML = markup;
    if (host.querySelectorAll("[data-intel-operation-type]").length < 2
      || host.querySelector(".campaign-intel-composer")
      || host.querySelector(".campaign-order-stage-strip")
      || /ASSET UNAVAILABLE|ORDER_ASSET_UNAVAILABLE/i.test(host.textContent ?? "")
      || !host.textContent?.includes("Choose an operation")) {
      throw new Error(`Intelligence planning did not begin in a neutral, concise state: ${host.textContent}`);
    }
    const selectedHost = document.createElement("div");
    selectedHost.innerHTML = selectedMarkup;
    const nextStepCount = (selectedHost.textContent?.match(/Select a map hex to see eligible assets and complete this draft\./g) ?? []).length;
    if (nextStepCount !== 1
      || selectedHost.querySelector(".redeploy-issue")
      || selectedHost.querySelector("#campaignIntelAsset")
      || /NO ELIGIBLE ASSET|TARGET INVALID|Choose a valid campaign target/i.test(selectedHost.textContent ?? "")) {
      throw new Error(`A chosen intelligence operation repeated premature target or asset failures: ${selectedHost.textContent}`);
    }
  });
});

registerTest("CAMPAIGNSCREEN_PRODUCTION_ALLOCATION_IS_ONE_COMPACT_DECISION", async ({ Given, When, Then }) => {
  const screen = Object.create(CampaignScreen.prototype) as CampaignScreen;
  let body: HTMLElement;

  await Given("a valid production report opens in the shared campaign popup", () => {
    document.body.innerHTML = `
      <div id="battlePopupLayer" class="hidden" aria-hidden="true">
        <section class="battle-popup">
          <h2 data-popup-title></h2>
          <div data-popup-body></div>
          <button id="battlePopupClose" type="button">Close</button>
        </section>
      </div>`;
    (screen as any).campaignPopupInvoker = null;
    (screen as any).campaignState = {
      getProductionReport: () => ({
        capacity: 100,
        sources: [{ tile: "industry", offsetKey: "1,1", supplyValue: 60 }, { tile: "port", offsetKey: "2,2", supplyValue: 40 }],
        segmentsUntilNextTick: 2,
        allocation: { supplies: 25, fuel: 25, ammo: 25, manpower: 25 }
      }),
      previewProductionDraft: (allocation: unknown) => ({
        action: { availability: "available" },
        normalizedAllocation: allocation,
        effectiveSegment: 8,
        dailyOutput: { supplies: 25, fuel: 25, ammo: 25, manpower: 25 }
      }),
      segmentToTimeDisplay: () => "Day 2, 00:00-03:00"
    };
  });

  await When("the production allocation planner renders", () => {
    (screen as any).openProductionModal();
    const mounted = document.querySelector<HTMLElement>("[data-popup-body]");
    if (!mounted) throw new Error("Production popup body did not mount.");
    body = mounted;
  });

  await Then("four allocations, their daily output, one effective-time consequence, and no redundant stages or site roster remain", () => {
    if (body.querySelectorAll("[data-alloc-slider]").length !== 4
      || body.querySelectorAll("[data-alloc-out]").length !== 4
      || body.querySelectorAll("#productionOrderPreview dt").length !== 1
      || body.querySelector(".campaign-order-stage-strip")
      || body.querySelector(".production-source-row")
      || !body.textContent?.includes("Set the four allocations to 100% total.")) {
      throw new Error(`Production planning remained verbose or incomplete: ${body.textContent}`);
    }
  });
});

registerTest("CAMPAIGNSCREEN_ORDER_CANCELLATION_ESCAPE_RESTORES_THE_EXACT_TRIGGER", async ({ Given, When, Then }) => {
  const screen = Object.create(CampaignScreen.prototype) as CampaignScreen;
  const order = {
    id: "order-cancel-1",
    faction: "Player",
    kind: "production",
    status: "committed",
    issuedSegment: 0,
    earliestStartSegment: 1,
    targetHexKeys: [],
    formationIds: [],
    dependencies: [],
    reservationIds: [],
    acknowledgementKeys: [],
    executionRefId: null,
    validation: { valid: true, issues: [] },
    payload: {
      allocation: { supplies: 25, fuel: 25, ammo: 25, manpower: 25 },
      effectiveSegment: 8
    }
  };
  let trigger: HTMLButtonElement;
  let layer: HTMLElement;

  await Given("a committed order whose cancellation review was opened from its Cancel control", () => {
    document.body.innerHTML = `
      <main id="campaignScreen">
        <article data-order-id="order-cancel-1">
          <button type="button" data-order-action="cancel">Cancel</button>
        </article>
      </main>
      <div id="battlePopupLayer" class="hidden" aria-hidden="true">
        <section class="battle-popup">
          <h2 data-popup-title></h2>
          <div data-popup-body></div>
          <button id="battlePopupClose" type="button">Close</button>
        </section>
      </div>`;
    trigger = document.querySelector<HTMLButtonElement>("[data-order-action='cancel']")!;
    layer = document.getElementById("battlePopupLayer")!;
    (screen as any).element = document.getElementById("campaignScreen");
    (screen as any).campaignPopupInvoker = null;
    (screen as any).campaignState = {
      getCampaignOrders: () => [order],
      getCampaignOrderReservations: () => [],
      previewCampaignOrderCancellation: () => ({
        canCancel: true,
        releasedReservations: [],
        sunkCostSummary: "No sunk cost.",
        delaySummary: "No delay.",
        exposureSummary: "No additional exposure.",
        reasonCode: null,
        reason: "The order can be cancelled before execution.",
        correctiveAction: null
      }),
      segmentToTimeDisplay: () => "D+1 · 7 June 1944, 03:00–06:00"
    };
    trigger.focus();
    (screen as any).openOrderCancellationPreview(order.id);
  });

  await When("Escape is pressed without confirming cancellation", () => {
    layer.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });

  await Then("the review closes and focus returns to the exact Cancel control", () => {
    if (!layer.classList.contains("hidden")
      || layer.getAttribute("aria-hidden") !== "true"
      || document.activeElement !== trigger) {
      throw new Error("Escape did not close the cancellation review and restore the invoking Cancel control.");
    }
  });
});
