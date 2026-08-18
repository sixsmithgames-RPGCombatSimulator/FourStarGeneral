/** Browser-DOM component for the persistent theater command bar. */

/** Creates the command bar and rehomes existing session controls without cloning their listeners. */
export function createCampaignCommandBar(root: HTMLElement): HTMLElement {
  const bar = document.createElement("header");
  bar.className = "campaign-command-bar";
  bar.setAttribute("aria-label", "Theater command bar");
  bar.innerHTML = `
    <div class="campaign-command-identity">
      <span class="campaign-command-eyebrow">Theater command</span>
      <h1 id="campaignCommandTitle">Campaign</h1>
      <span id="campaignCommandPhase" class="campaign-command-phase">Opening phase</span>
    </div>
    <div class="campaign-command-clock-block">
      <span>Operational time</span>
      <strong id="campaignCommandClock">Day 1, 00:00-03:00</strong>
    </div>
    <div class="campaign-command-state-block">
      <span>Command state</span>
      <strong id="campaignCommandStatus" data-command-status="planning">Planning</strong>
    </div>
    <div id="campaignCommandResources" class="campaign-command-resources" aria-label="Player resources"></div>
    <button id="campaignCommandReports" class="campaign-command-report-button" type="button" data-has-unread="false">
      <span>Reports</span><strong id="campaignCommandUnread">0</strong>
    </button>
    <div class="campaign-command-save-state"><span>Save</span><strong id="campaignCommandSaveStatus">Unsaved</strong></div>
    <div id="campaignCommandSession" class="campaign-command-session" aria-label="Campaign session controls"></div>
  `;

  const time = root.querySelector<HTMLElement>("#campaignTimeDisplay");
  if (time) time.hidden = true;
  const session = bar.querySelector<HTMLElement>("#campaignCommandSession");
  ["#campaignSave", "#campaignLoad", "#campaignBattleSaves", "#campaignExit"].forEach((selector) => {
    const control = root.querySelector<HTMLElement>(selector);
    if (control && session) session.appendChild(control);
  });
  root.querySelector<HTMLElement>(".session-section")?.setAttribute("data-campaign-shell-hidden", "true");
  return bar;
}
