import "./domEnvironment.js";
import { LandingScreen, resolveSelectedOperationDestination } from "../src/ui/screens/LandingScreen.js";
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
      || !root.querySelector(".general-roster-assigned")) {
      throw new Error(`Landing retained verbose, contradictory, or duplicate commander copy: ${root.textContent}`);
    }
  });
});
