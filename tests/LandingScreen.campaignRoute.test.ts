import "./domEnvironment.js";
import { LandingScreen, resolveSelectedOperationDestination } from "../src/ui/screens/LandingScreen.js";
import type { CampaignScreen } from "../src/ui/screens/CampaignScreen.js";
import type { TacticalBattleFlow } from "../src/contracts/TacticalBattleFlow.js";
import { UIState } from "../src/state/UIState.js";
import { registerTest } from "./harness.js";

function mountLandingClarityFixture(): HTMLElement {
  document.body.innerHTML = `
    <section id="landingScreen">
      <header class="landing-header">
        <div><h1>Four Star General</h1><p>Choose a campaign or standalone battle.</p></div>
        <button id="resumeTacticalBattle" type="button" class="secondary-button">Resume Saved Battle</button>
      </header>
      <details id="commandRosterDetails">
        <summary>
          <strong id="generalAssignmentHeadline">No general assigned.</strong>
          <small id="generalAssignmentDetails"></small>
        </summary>
        <button id="commissionNewButton" type="button">Commission New General</button>
        <div id="generalRosterList"></div>
        <button id="clearGeneralSelection" type="button">Clear Selection</button>
        <button id="exportRosterButton" type="button">Export Roster</button>
        <input id="importRosterInput" type="file" />
      </details>
      <section>
        <h2>Campaigns</h2>
        <div data-campaign-list>
          <button type="button" data-campaign-id="western-europe" data-mission="campaign" aria-label="Enter Western Europe Campaign">
            <strong>Western Europe</strong><span>Lead Allied forces through a persistent multi-phase offensive.</span>
          </button>
        </div>
      </section>
      <section>
        <h2>Standalone Battles</h2>
        <p id="missionListSummary"></p>
        <div data-mission-list></div>
      </section>
      <select id="difficultySelect"><option>Easy</option><option selected>Normal</option><option>Hard</option></select>
      <div id="feedback"></div>
    </section>
  `;
  const root = document.getElementById("landingScreen");
  if (!root) throw new Error("Landing clarity fixture did not mount.");
  return root;
}

registerTest("LANDING_RETAINED_CAMPAIGN_SELECTION_ROUTES_BACK_TO_CAMPAIGN", async ({ Given, When, Then }) => {
  let campaignDestination: ReturnType<typeof resolveSelectedOperationDestination> = "precombat";
  let battleDestination: ReturnType<typeof resolveSelectedOperationDestination> = "campaign";

  await Given("the landing screen retains a campaign selection after the player exits the strategic shell", async () => {});
  await When("the primary operation route is resolved for campaign and battle selections", async () => {
    campaignDestination = resolveSelectedOperationDestination("campaign");
    battleDestination = resolveSelectedOperationDestination("training");
  });
  await Then("campaign returns to the strategic shell while battle missions still enter precombat", async () => {
    if (campaignDestination !== "campaign" || battleDestination !== "precombat") {
      throw new Error(`Unexpected landing destinations: campaign=${campaignDestination}, battle=${battleDestination}`);
    }
  });
});

registerTest("LANDING_PRIORITIZES_DIRECT_PLAY_WITH_PROGRESSIVE_DISCLOSURE", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  const destinations: string[] = [];

  await Given("a zero-record Field Commander reaches operation selection", async () => {
    root = mountLandingClarityFixture();
    const screen = new LandingScreen({
      showScreen() {},
      showScreenById: (id) => destinations.push(id),
      getCurrentScreen: () => null
    }, new UIState());
    screen.initialize();
  });

  await When("the commander scans the choices and directly enters the campaign", async () => {
    root.querySelector<HTMLButtonElement>("[data-mission='campaign']")?.click();
  });

  await Then("playable choices lead, roster administration and locks are collapsed, and no redundant launch control remains", async () => {
    const available = root.querySelectorAll<HTMLButtonElement>("[data-mission-list] button[data-mission]");
    const locked = root.querySelector<HTMLDetailsElement>(".locked-operation-disclosure");
    const roster = root.querySelector<HTMLDetailsElement>("#commandRosterDetails");
    if (available.length !== 3
      || locked?.open
      || locked?.querySelector("summary")?.textContent?.trim() !== "Locked operations (15)"
      || roster?.open
      || root.querySelector("#enterPrecombat")
      || root.querySelector("[data-mission='campaign']")?.getAttribute("aria-label") !== "Enter Western Europe Campaign"
      || destinations[destinations.length - 1] !== "campaign") {
      throw new Error("Landing hierarchy did not preserve direct, uncluttered campaign and battle entry.");
    }
    const lockedCopy = locked?.textContent ?? "";
    if (/VICTORY:|DEFEAT:/i.test(lockedCopy)
      || root.textContent?.includes("Choose a mission once a commander is assigned")
      || !root.textContent?.includes("Field Commander assigned.")
      || !root.querySelector(".general-roster-assigned")
      || root.textContent?.includes("Retire")
      || root.textContent?.includes("🔒")
      || /\p{Extended_Pictographic}/u.test(root.textContent ?? "")
      || Array.from(available).some((button) => !button.textContent?.includes("Play standalone battle"))
      || locked?.querySelector("button")) {
      throw new Error(`Landing retained verbose, contradictory, or duplicate commander copy: ${root.textContent}`);
    }
  });
});

registerTest("LANDING_COMMANDER_ADMINISTRATION_OPENS_ONLY_WHEN_ASSIGNMENT_IS_REQUIRED", async ({ Given, When, Then }) => {
  let root: HTMLElement;

  await Given("the operation screen has an assigned Field Commander", async () => {
    root = mountLandingClarityFixture();
    const screen = new LandingScreen({
      showScreen() {},
      showScreenById() {},
      getCurrentScreen: () => null
    }, new UIState());
    screen.initialize();
  });

  await When("the player clears the commander assignment", async () => {
    root.querySelector<HTMLButtonElement>("#clearGeneralSelection")?.click();
  });

  await Then("commander administration opens and playable choices wait for reassignment", async () => {
    const roster = root.querySelector<HTMLDetailsElement>("#commandRosterDetails");
    const campaign = root.querySelector<HTMLButtonElement>("[data-mission='campaign']");
    if (!roster?.open
      || !campaign?.disabled
      || root.querySelectorAll("[data-mission-list] button[data-mission]").length !== 0
      || !root.textContent?.includes("Assign a commander to continue.")) {
      throw new Error("Landing did not expose commander administration when assignment became required.");
    }

    root.querySelector<HTMLButtonElement>("[data-select-general]")?.click();
    if (roster.open
      || campaign.disabled
      || root.querySelectorAll("[data-mission-list] button[data-mission]").length !== 3
      || !root.querySelector(".general-roster-assigned")) {
      throw new Error("Landing did not return focus to playable choices after commander assignment.");
    }
  });
});

registerTest("LANDING_LAZY_CAMPAIGN_ROUTE_LOADS_ONCE_BEFORE_NAVIGATION", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  const events: string[] = [];
  let loaderCalls = 0;
  let finishLoading!: (screen: CampaignScreen) => void;

  await Given("the strategic shell has not been loaded during landing startup", async () => {
    root = mountLandingClarityFixture();
    const screen = new LandingScreen({
      beginTransition: (message) => events.push(`begin:${message}`),
      endTransition: () => events.push("end"),
      showScreen() {},
      showScreenById: (id) => events.push(`show:${id}`),
      getCurrentScreen: () => null
    }, new UIState());
    screen.attachCampaignScreenLoader(() => {
      loaderCalls += 1;
      return new Promise<CampaignScreen>((resolve) => {
        finishLoading = resolve;
      });
    });
    screen.initialize();
  });

  await When("the player activates campaign entry twice before its chunk finishes loading", async () => {
    const campaignButton = root.querySelector<HTMLButtonElement>("[data-mission='campaign']");
    campaignButton?.click();
    campaignButton?.click();
    await Promise.resolve();
  });

  await Then("one load blocks navigation until the campaign screen is ready", async () => {
    if (loaderCalls !== 1
      || events.filter((event) => event.startsWith("begin:")).length !== 1
      || events.some((event) => event === "show:campaign")) {
      throw new Error(`Campaign lazy-route boundary drifted before resolution: ${events.join(", ")}`);
    }
    finishLoading(Object.create(null) as CampaignScreen);
    await Promise.resolve();
    await Promise.resolve();
    if (events.filter((event) => event === "show:campaign").length !== 1) {
      throw new Error(`Campaign route did not navigate exactly once after resolution: ${events.join(", ")}`);
    }
  });
});

registerTest("LANDING_LAZY_TACTICAL_ROUTE_INITIALIZES_BEFORE_PRECOMBAT", async ({ Given, When, Then }) => {
  let root: HTMLElement;
  const events: string[] = [];
  let loaderCalls = 0;
  let finishLoading!: (flow: TacticalBattleFlow) => void;

  await Given("the tactical runtime has not been loaded on the operation screen", async () => {
    root = mountLandingClarityFixture();
    const screen = new LandingScreen({
      beginTransition: () => events.push("transition-started"),
      endTransition: () => events.push("transition-ended"),
      showScreen() {},
      showScreenById: (id) => events.push(`legacy-show:${id}`),
      getCurrentScreen: () => null
    }, new UIState());
    screen.attachTacticalBattleFlowLoader(() => {
      loaderCalls += 1;
      return new Promise<TacticalBattleFlow>((resolve) => { finishLoading = resolve; });
    });
    screen.initialize();
  });

  await When("the player selects the training operation twice while tactical code is loading", async () => {
    const training = root.querySelector<HTMLButtonElement>("[data-mission='training']");
    training?.click();
    training?.click();
    await Promise.resolve();
  });

  await Then("one load completes before the precombat setup is invoked", async () => {
    if (loaderCalls !== 1 || events.join(",") !== "transition-started") {
      throw new Error(`Tactical route did not remain behind one pending load: ${events.join(",")}`);
    }
    finishLoading({
      dispose() {},
      enterPrecombat: (missionKey, generalId, difficulty) => {
        events.push(`enter:${missionKey}:${generalId ? "assigned" : "missing"}:${difficulty}`);
      },
      enterCampaignPrecombat() {},
      resumeActiveCampaignBattle() {}
    });
    await Promise.resolve();
    await Promise.resolve();
    if (events.join(",") !== "transition-started,enter:training:assigned:Normal"
      || events.some((event) => event.startsWith("legacy-show:"))) {
      throw new Error(`Precombat navigation escaped the tactical flow boundary: ${events.join(",")}`);
    }
  });
});
