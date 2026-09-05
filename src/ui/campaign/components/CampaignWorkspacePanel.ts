/** Configures the four distinct campaign workspaces while preserving existing control instances and listeners. */

import type { CampaignWorkspaceId } from "../CampaignCommandUIState";

function createWorkspaceOverview(
  workspace: CampaignWorkspaceId,
  heading: string,
  description: string,
  bodyId: string
): HTMLElement {
  const section = document.createElement("section");
  section.className = "campaign-workspace-overview";
  section.dataset.campaignWorkspace = workspace;
  section.innerHTML = `<header><span>Workspace</span><h2></h2><p></p></header><div id="${bodyId}" class="campaign-workspace-overview__body"></div>`;
  const title = section.querySelector("h2");
  const copy = section.querySelector("p");
  if (title) title.textContent = heading;
  if (copy) copy.textContent = description;
  return section;
}

/** Builds the information-dense Situation board as stable semantic regions. */
function createSituationWorkspace(): HTMLElement {
  const section = createWorkspaceOverview(
    "situation",
    "Situation",
    "Your next decision, active objectives, and operational fronts.",
    "campaignSituationWorkspace"
  );
  const body = section.querySelector<HTMLElement>("#campaignSituationWorkspace");
  if (!body) return section;
  body.innerHTML = `
    <section id="campaignSituationPriority" class="campaign-situation-priority" aria-label="Decision required"></section>
    <section class="campaign-situation-section campaign-situation-objectives" aria-labelledby="campaignSituationObjectivesTitle">
      <header><div><span>Mission</span><h3 id="campaignSituationObjectivesTitle">Objectives</h3></div><strong id="campaignSituationObjectiveCount">0 active</strong></header>
      <div id="campaignSituationObjectives" class="campaign-situation-section__body"></div>
    </section>
    <section class="campaign-situation-section" aria-labelledby="campaignSituationFrontsTitle">
      <header><div><span>Operations</span><h3 id="campaignSituationFrontsTitle">Fronts</h3></div><strong id="campaignSituationFrontCount">0 sectors</strong></header>
      <div id="campaignSituationFronts" class="campaign-situation-fronts"></div>
    </section>
    <section id="campaignSituationAlertCenter" class="campaign-situation-section campaign-situation-alert-center" aria-labelledby="campaignSituationAlertsTitle" tabindex="-1">
      <header><div><span>Command traffic</span><h3 id="campaignSituationAlertsTitle">Alerts & reports</h3></div><strong id="campaignSituationUnreadCount">0 unread</strong></header>
      <div id="campaignSituationAlerts" class="campaign-situation-alerts" aria-live="polite"></div>
      <div id="campaignSituationReportSources" class="campaign-situation-report-sources"></div>
    </section>
    <section id="campaignSituationRecentSection" class="campaign-situation-section campaign-situation-recent" aria-labelledby="campaignSituationRecentTitle">
      <header><div><span>What changed</span><h3 id="campaignSituationRecentTitle">Recent resolution record</h3></div><button id="campaignSituationOpenTimeline" type="button">Full timeline</button></header>
      <div id="campaignSituationRecent" class="campaign-situation-recent__list"></div>
    </section>
  `;
  return section;
}

/** Builds stable discovery controls so projection updates do not steal keyboard focus. */
function createForcesWorkspace(): HTMLElement {
  const section = createWorkspaceOverview("forces", "Forces", "Commands on active fronts and objectives. Search or filter across the entire theater.", "campaignForcesWorkspace");
  const body = section.querySelector<HTMLElement>("#campaignForcesWorkspace");
  if (!body) return section;
  body.innerHTML = `
    <div class="campaign-workspace-controls">
      <label for="campaignForcesSearch">Find command, formation, or location</label>
      <input id="campaignForcesSearch" type="search" placeholder="Search the entire theater" autocomplete="off" aria-controls="campaignForcesWorkspaceList campaignForcesTheaterList">
      <div class="campaign-workspace-filters" role="group" aria-label="Force status">
        <button type="button" data-force-filter="all" aria-pressed="true">All</button>
        <button type="button" data-force-filter="ready" aria-pressed="false">Ready</button>
        <button type="button" data-force-filter="committed" aria-pressed="false">Committed</button>
        <button type="button" data-force-filter="inTransit" aria-pressed="false">In transit</button>
        <button type="button" data-force-filter="arriving" aria-pressed="false">Arriving</button>
        <button type="button" data-force-filter="recovering" aria-pressed="false">Recovering</button>
      </div>
    </div>
    <h3 id="campaignForcesScopeTitle">Active operations</h3>
    <p id="campaignForcesResultCount" role="status" aria-live="polite"></p>
    <div id="campaignForcesWorkspaceList" aria-labelledby="campaignForcesScopeTitle"></div>
    <details class="campaign-forces-disclosure" id="campaignForcesTheater">
      <summary>Entire theater <span id="campaignForcesTheaterCount"></span></summary>
      <div id="campaignForcesTheaterList" class="campaign-forces-disclosure__list"></div>
    </details>
  `;
  return section;
}

/** Provides a briefing-first workspace with stable filters and a secondary read archive. */
function createIntelligenceWorkspace(): HTMLElement {
  const section = createWorkspaceOverview("intelligence", "Intelligence briefing", "New information first. Review reported contacts and uncertainty before planning collection.", "campaignIntelligenceWorkspaceIntro");
  const body = section.querySelector<HTMLElement>("#campaignIntelligenceWorkspaceIntro");
  if (!body) return section;
  body.innerHTML = `
    <div class="campaign-workspace-metric"><span>Available collection capacity</span><strong id="campaignIntelligenceCapacity">—</strong></div>
    <div class="campaign-workspace-controls">
      <label for="campaignIntelligencePriority">Priority</label>
      <select id="campaignIntelligencePriority"><option value="all">All priorities</option><option value="critical">Critical</option><option value="notable">Notable</option><option value="routine">Routine</option></select>
      <label for="campaignIntelligenceCurrency">Report currency</label>
      <select id="campaignIntelligenceCurrency"><option value="all">All reports</option><option value="current">Current</option><option value="stale">Stale</option><option value="disputed">Disputed</option><option value="lost">Lost</option></select>
      <label for="campaignIntelligenceUncertainty">Uncertainty</label>
      <select id="campaignIntelligenceUncertainty"><option value="all">All confidence levels</option><option value="uncertain">Needs verification</option><option value="precise">Current, high confidence position</option></select>
    </div>
    <section class="campaign-intelligence-briefing" aria-labelledby="campaignIntelligenceBriefingTitle">
      <header><h3 id="campaignIntelligenceBriefingTitle">New and changed information</h3><button id="campaignIntelligenceMarkRead" type="button" hidden disabled>Mark briefing read</button></header>
      <p id="campaignIntelligenceBriefingStatus" role="status" aria-live="polite"></p>
      <div id="campaignIntelligenceBriefingList"></div>
    </section>
    <section aria-labelledby="campaignIntelligenceContactsTitle">
      <h3 id="campaignIntelligenceContactsTitle">Reported contacts</h3>
      <p id="campaignIntelligenceContactCount" role="status" aria-live="polite"></p>
      <div id="campaignIntelligenceContactsList"></div>
    </section>
    <details class="campaign-intelligence-history" id="campaignIntelligenceHistory">
      <summary>Read history <span id="campaignIntelligenceHistoryCount"></span></summary>
      <div id="campaignIntelligenceHistoryList"></div>
    </details>
    <button type="button" class="campaign-workspace-primary" data-open-campaign-intelligence>Plan collection operation</button>
  `;
  return section;
}

/** Composes headquarters workspaces while retaining the shipped operation controls. */
export function configureCampaignWorkspacePanel(panel: HTMLElement): void {
  panel.id = "campaignWorkspacePanel";
  panel.classList.add("campaign-workspace-panel");
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", "campaignWorkspaceTab-situation");

  panel.querySelector<HTMLElement>(".time-section")?.setAttribute("data-campaign-shell-hidden", "true");
  panel.querySelector<HTMLElement>(".campaign-intel-section")?.setAttribute("data-campaign-shell-hidden", "true");
  panel.querySelector<HTMLElement>(".economy-section")?.setAttribute("data-campaign-shell-hidden", "true");
  panel.querySelector<HTMLElement>(".production-section")?.setAttribute("data-campaign-workspace", "logistics");
  panel.querySelector<HTMLElement>(".session-section")?.setAttribute("data-campaign-shell-hidden", "true");
  panel.querySelector<HTMLElement>("#campaignEditPanel")?.setAttribute("data-campaign-shell-hidden", "true");

  const compactHeader = document.createElement("header");
  compactHeader.className = "campaign-workspace-panel__compact-header";
  compactHeader.innerHTML = `<span>Campaign workspace</span><button type="button" data-close-campaign-workspace aria-label="Close campaign workspace">×</button>`;

  panel.prepend(
    compactHeader,
    createSituationWorkspace(),
    createForcesWorkspace(),
    createWorkspaceOverview("logistics", "Allied support", "Allocate the next theater delivery from rear-area staging hubs.", "campaignLogisticsWorkspaceIntro"),
    createIntelligenceWorkspace()
  );

  const logisticsIntro = panel.querySelector<HTMLElement>("#campaignLogisticsWorkspaceIntro");
  if (logisticsIntro) {
    logisticsIntro.innerHTML = `
      <div class="campaign-workspace-metric"><span>Available air support</span><strong id="campaignAirPowerValue">0</strong></div>
      <div class="campaign-workspace-metric"><span>Ready naval fire missions</span><strong id="campaignNavalPowerValue">—</strong></div>
      <div id="campaignNavalSupportSources" aria-label="Naval task force availability"></div>
    `;
  }

}
