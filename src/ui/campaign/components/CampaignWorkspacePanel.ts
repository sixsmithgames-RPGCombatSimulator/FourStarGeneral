/** Configures the six-workspace campaign pane while preserving existing control instances and listeners. */

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
    "Commander's situation",
    "Understand what changed, what is at risk, and what requires attention now.",
    "campaignSituationWorkspace"
  );
  const body = section.querySelector<HTMLElement>("#campaignSituationWorkspace");
  if (!body) return section;
  body.innerHTML = `
    <section id="campaignSituationBrief" class="campaign-situation-brief" aria-label="Commander's brief"></section>
    <section id="campaignSituationPriority" class="campaign-situation-priority" aria-label="Decision required"></section>
    <div class="campaign-situation-board">
      <section class="campaign-situation-section campaign-situation-objectives" aria-labelledby="campaignSituationObjectivesTitle">
        <header><div><span>Mission board</span><h3 id="campaignSituationObjectivesTitle">Objectives</h3></div><strong id="campaignSituationObjectiveCount">0 active</strong></header>
        <div id="campaignSituationObjectives" class="campaign-situation-section__body"></div>
      </section>
      <aside id="campaignSituationOutlook" class="campaign-situation-section campaign-situation-outlook" aria-labelledby="campaignSituationOutlookTitle">
        <header><div><span>Campaign outlook</span><h3 id="campaignSituationOutlookTitle">Operation status</h3></div></header>
        <div id="campaignSituationOutlookBody" class="campaign-situation-section__body"></div>
      </aside>
    </div>
    <section class="campaign-situation-section" aria-labelledby="campaignSituationFrontsTitle">
      <header><div><span>Operational posture</span><h3 id="campaignSituationFrontsTitle">Fronts</h3></div><strong id="campaignSituationFrontCount">0 sectors</strong></header>
      <div id="campaignSituationFronts" class="campaign-situation-fronts"></div>
    </section>
    <section id="campaignSituationAlertCenter" class="campaign-situation-section campaign-situation-alert-center" aria-labelledby="campaignSituationAlertsTitle" tabindex="-1">
      <header><div><span>Command traffic</span><h3 id="campaignSituationAlertsTitle">Alerts & reports</h3></div><strong id="campaignSituationUnreadCount">0 unread</strong></header>
      <div id="campaignSituationAlerts" class="campaign-situation-alerts" aria-live="polite"></div>
      <div id="campaignSituationReportSources" class="campaign-situation-report-sources"></div>
    </section>
    <section class="campaign-situation-section campaign-situation-recent" aria-labelledby="campaignSituationRecentTitle">
      <header><div><span>What changed</span><h3 id="campaignSituationRecentTitle">Recent resolution record</h3></div><button id="campaignSituationOpenTimeline" type="button">Full timeline</button></header>
      <div id="campaignSituationRecent" class="campaign-situation-recent__list"></div>
    </section>
  `;
  return section;
}

export function configureCampaignWorkspacePanel(panel: HTMLElement): void {
  panel.id = "campaignWorkspacePanel";
  panel.classList.add("campaign-workspace-panel");
  panel.setAttribute("role", "tabpanel");
  panel.setAttribute("aria-labelledby", "campaignWorkspaceTab-situation");

  panel.querySelector<HTMLElement>(".time-section")?.setAttribute("data-campaign-shell-hidden", "true");
  panel.querySelector<HTMLElement>(".campaign-intel-section")?.setAttribute("data-campaign-workspace", "intelligence");
  panel.querySelector<HTMLElement>(".economy-section")?.setAttribute("data-campaign-workspace", "logistics");
  panel.querySelector<HTMLElement>(".production-section")?.setAttribute("data-campaign-workspace", "logistics");
  panel.querySelector<HTMLElement>(".session-section")?.setAttribute("data-campaign-workspace", "headquarters");
  panel.querySelector<HTMLElement>("#campaignEditPanel")?.setAttribute("data-campaign-workspace", "headquarters");

  const compactHeader = document.createElement("header");
  compactHeader.className = "campaign-workspace-panel__compact-header";
  compactHeader.innerHTML = `<span>Campaign workspace</span><button type="button" data-close-campaign-workspace aria-label="Close campaign workspace">×</button>`;

  panel.prepend(
    compactHeader,
    createSituationWorkspace(),
    createWorkspaceOverview("forces", "Forces in theater", "Locate Player forces and inspect their current operational position.", "campaignForcesWorkspaceList"),
    createWorkspaceOverview("logistics", "Theater logistics", "Manage current stocks and the next daily production allocation.", "campaignLogisticsWorkspaceIntro"),
    createWorkspaceOverview("intelligence", "Intelligence command", "Review contacts, confidence, collection coverage, and active operations.", "campaignIntelligenceWorkspaceIntro"),
    createWorkspaceOverview("airNaval", "Air & naval command", "Review available theater support before committing an engagement.", "campaignAirNavalWorkspaceIntro"),
    createWorkspaceOverview("headquarters", "Headquarters", "Campaign records, session controls, and authorized command tools.", "campaignHeadquartersWorkspaceIntro")
  );

  const intelIntro = panel.querySelector<HTMLElement>("#campaignIntelligenceWorkspaceIntro");
  if (intelIntro) {
    intelIntro.innerHTML = `
      <div class="campaign-workspace-metric"><span>Collection capacity</span><strong id="campaignIntelligenceCapacity">—</strong></div>
      <button type="button" class="campaign-workspace-primary" data-open-campaign-intelligence>Open operational picture</button>
    `;
  }
  const airNaval = panel.querySelector<HTMLElement>("#campaignAirNavalWorkspaceIntro");
  if (airNaval) {
    airNaval.innerHTML = `
      <div class="campaign-workspace-metric"><span>Available air power</span><strong id="campaignAirPowerValue">0</strong></div>
      <div class="campaign-workspace-metric"><span>Available naval power</span><strong id="campaignNavalPowerValue">0</strong></div>
      <p>Available support is carried into engagement planning; unavailable mission types are not presented as orders.</p>
    `;
  }
}
