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
    createWorkspaceOverview("forces", "Forces by location", "Select a group to inspect every formation at that location.", "campaignForcesWorkspaceList"),
    createWorkspaceOverview("logistics", "Production", "Review the next delivery and adjust its allocation.", "campaignLogisticsWorkspaceIntro"),
    createWorkspaceOverview("intelligence", "Intelligence", "Review contacts or plan a collection operation.", "campaignIntelligenceWorkspaceIntro")
  );

  const logisticsIntro = panel.querySelector<HTMLElement>("#campaignLogisticsWorkspaceIntro");
  if (logisticsIntro) {
    logisticsIntro.innerHTML = `
      <div class="campaign-workspace-metric"><span>Available air support</span><strong id="campaignAirPowerValue">0</strong></div>
      <div class="campaign-workspace-metric"><span>Available naval support</span><strong id="campaignNavalPowerValue">0</strong></div>
    `;
  }

  const intelIntro = panel.querySelector<HTMLElement>("#campaignIntelligenceWorkspaceIntro");
  if (intelIntro) {
    intelIntro.innerHTML = `
      <div class="campaign-workspace-metric"><span>Available collection capacity</span><strong id="campaignIntelligenceCapacity">—</strong></div>
      <button type="button" class="campaign-workspace-primary" data-open-campaign-intelligence>Open intelligence</button>
    `;
  }
}
