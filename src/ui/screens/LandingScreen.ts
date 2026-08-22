import type { IScreenManager } from "../../contracts/IScreenManager";
import { UIState, type MissionKey } from "../../state/UIState";
import { getMissionTitle, getMissionBriefing, getMissionUnlockRequirement, isMissionUnlocked } from "../../data/missions";
import {
  ROSTER_FILE_NAME,
  generalRosterEntries,
  saveRosterToFile,
  loadRosterFromFile,
  getRosterCount,
  addGeneralToRoster,
  findGeneralById,
  removeGeneralFromRoster,
  ensureRosterInitialized,
  type GeneralStatBlock
} from "../../utils/rosterStorage";
import {
  REGION_OPTIONS,
  SCHOOL_OPTIONS,
  findRegionOption,
  findSchoolOption,
  type CommissionOption
} from "../../data/commissioningOptions";
import type { GeneralRosterEntry } from "../../utils/rosterStorage";
import { ensureUnlockState } from "../../state/UnlockState";
import { PrecombatScreen } from "./PrecombatScreen";
import { CampaignScreen } from "./CampaignScreen";
import { createFieldCommanderGeneral, isFieldCommander, GUEST_MODE_MESSAGES, buildSignInUrl } from "../../utils/guestMode";

interface GeneralFormData {
  name: string;
  regionKey: string;
  regionLabel: string;
  schoolKey: string;
  schoolLabel: string;
  commissionedAt: string | null;
}

export function resolveSelectedOperationDestination(mission: MissionKey | null): "campaign" | "precombat" {
  return mission === "campaign" ? "campaign" : "precombat";
}

function deriveSlug(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Keeps launch cards scannable while the full briefing remains available in precombat. */
function summarizeMissionForLaunch(briefing: string): string {
  const opening = briefing.replace(/^General,\s*/i, "").split(/\s+VICTORY:/i)[0]?.trim() ?? briefing;
  const firstSentence = opening.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? opening;
  return firstSentence.length > 170 ? `${firstSentence.slice(0, 167).trimEnd()}…` : firstSentence;
}

/**
 * Manages the landing screen where players select missions and generals.
 * Handles roster import/export and mission briefing display.
 */
export class LandingScreen {
  private readonly screenManager: IScreenManager;
  private readonly uiState: UIState;
  private readonly element: HTMLElement;

  // DOM element references (to be populated in initialize)
  private missionButtons: HTMLButtonElement[] = [];
  private missionList: HTMLElement | null = null;
  private campaignButtons: HTMLButtonElement[] = [];
  private campaignList: HTMLElement | null = null;
  private missionListSummary: HTMLElement | null = null;
  private generalAssignmentHeadline: HTMLElement | null = null;
  private generalAssignmentDetails: HTMLElement | null = null;
  private generalDetailPanel: HTMLElement | null = null;
  private generalDetailName: HTMLElement | null = null;
  private generalDetailSummary: HTMLElement | null = null;
  private generalDetailMissions: HTMLElement | null = null;
  private generalDetailVictories: HTMLElement | null = null;
  private generalDetailUnits: HTMLElement | null = null;
  private generalDetailCasualties: HTMLElement | null = null;
  private generalDetailBonuses: HTMLElement | null = null;
  private generalForm: HTMLFormElement | null = null;
  private generalRegionSelect: HTMLSelectElement | null = null;
  private generalSchoolSelect: HTMLSelectElement | null = null;
  private commissioningBenefits: HTMLElement | null = null;
  private commissioningBenefitsContent: HTMLElement | null = null;
  private clearGeneralSelectionButton: HTMLButtonElement | null = null;
  private exportRosterButton: HTMLButtonElement | null = null;
  private importRosterInput: HTMLInputElement | null = null;
  private resumeTacticalBattleButton: HTMLButtonElement | null = null;
  private feedback: HTMLElement | null = null;
  private generalRosterList: HTMLElement | null = null;
  private generalFormSection: HTMLElement | null = null;
  private commissionButton: HTMLButtonElement | null = null;
  private difficultySelect: HTMLSelectElement | null = null;

  private disclosedGeneralId: string | null | undefined;
  private precombatScreen: PrecombatScreen | null = null;
  private campaignScreen: CampaignScreen | null = null;
  private readonly unlockState = ensureUnlockState();
  private isGuestMode = false;
  private signInBanner: HTMLElement | null = null;

  attachPrecombatScreen(precombatScreen: PrecombatScreen): void {
    this.precombatScreen = precombatScreen;
  }

  attachCampaignScreen(campaignScreen: CampaignScreen): void {
    this.campaignScreen = campaignScreen;
  }

  /**
   * Updates the commissioning preview card with the currently selected region and school bonuses.
   */
  private refreshCommissioningPreview(): void {
    if (!this.commissioningBenefitsContent) {
      return;
    }

    const container = this.commissioningBenefitsContent;
    container.innerHTML = "";

    const regionKey = this.generalRegionSelect?.value ?? "";
    const schoolKey = this.generalSchoolSelect?.value ?? "";

    const region = findRegionOption(regionKey);
    const school = findSchoolOption(schoolKey);

    if (!region && !school) {
      const placeholder = document.createElement("p");
      placeholder.className = "commissioning-benefits__placeholder";
      placeholder.textContent = "Select a commissioning region and war college to preview their combined bonuses.";
      container.append(placeholder);
      return;
    }

    const entries: Array<{ heading: string; summary: string; adjustments: Partial<GeneralStatBlock> }> = [];
    if (region) {
      entries.push({ heading: `${region.label} Region Focus`, summary: region.summary, adjustments: region.statAdjustments });
    }
    if (school) {
      entries.push({ heading: `${school.label} Doctrine`, summary: school.summary, adjustments: school.statAdjustments });
    }

    entries.forEach((entry) => {
      const wrapper = document.createElement("article");
      wrapper.className = "commissioning-benefit";

      const heading = document.createElement("p");
      heading.className = "commissioning-benefit__heading";
      heading.textContent = entry.heading;

      const summary = document.createElement("p");
      summary.className = "commissioning-benefit__summary";
      summary.textContent = entry.summary;

      const stats = document.createElement("p");
      stats.className = "commissioning-benefit__stats";
      stats.textContent = this.formatStatAdjustments(entry.adjustments);

      wrapper.append(heading, summary, stats);
      container.append(wrapper);
    });

    if (region && this.unlockState.isRegionLocked(region.key)) {
      container.append(this.buildUnlockCallout(`${region.label} is locked.`, region.key, "Unlock faction"));
    }
    if (school && this.unlockState.isSchoolLocked(school.key)) {
      container.append(this.buildUnlockCallout(`${school.label} is locked.`, school.key, "Unlock college"));
    }
  }

  constructor(screenManager: IScreenManager, uiState: UIState) {
    this.screenManager = screenManager;
    this.uiState = uiState;

    // Get the landing screen element from the DOM
    const landingScreen = document.getElementById("landingScreen");
    if (!landingScreen) {
      throw new Error("Landing screen element (#landingScreen) not found in DOM");
    }

    this.element = landingScreen;
  }

  /**
   * Initializes the landing screen by caching DOM references and binding events.
   */
  initialize(): void {
    ensureRosterInitialized();
    this.initializeGuestMode();
    this.reconcileGeneralSelection();
    this.cacheElements();
    this.unlockState.subscribe(() => {
      this.populateCommissioningSelections();
      this.refreshCommissioningPreview();
      this.updateUI();
      this.updateGuestModeUI();
    });
    this.bindEvents();
    this.updateUI();
    this.populateCommissioningSelections();
    this.refreshCommissioningPreview();
    this.syncDifficultySelection();
    this.createSignInBanner();
    this.updateGuestModeUI();
  }

  /**
   * Initialize guest mode state and auto-assign Field Commander for guests.
   */
  private initializeGuestMode(): void {
    this.isGuestMode = this.unlockState.isGuestMode();

    if (this.isGuestMode) {
      // Check if we already have a Field Commander in roster
      const fieldCommander = generalRosterEntries.find(g => isFieldCommander(g.id));

      if (!fieldCommander) {
        // Add Field Commander to roster for guest
        addGeneralToRoster(createFieldCommanderGeneral());
      }

      // Auto-select Field Commander for guests
      const fieldCommanderId = generalRosterEntries.find(g => isFieldCommander(g.id))?.id;
      if (fieldCommanderId) {
        this.uiState.selectedGeneralId = fieldCommanderId;
      }
    }
  }

  /**
   * Create the sign-in banner for guest mode.
   */
  private createSignInBanner(): void {
    if (!this.isGuestMode || this.signInBanner) {
      return;
    }

    const banner = document.createElement("div");
    banner.className = "guest-signin-banner";
    banner.innerHTML = `
      <div class="guest-signin-content">
        <span class="guest-signin-text">${GUEST_MODE_MESSAGES.signInPrompt}</span>
        <a href="${buildSignInUrl()}" class="guest-signin-button">Sign In</a>
      </div>
    `;

    // Insert at top of landing screen
    this.element.insertBefore(banner, this.element.firstChild);
    this.signInBanner = banner;
  }

  /**
   * Update UI based on guest mode state.
   */
  private updateGuestModeUI(): void {
    const currentGuestMode = this.unlockState.isGuestMode();

    // If auth state changed, refresh
    if (currentGuestMode !== this.isGuestMode) {
      this.isGuestMode = currentGuestMode;
      if (!this.isGuestMode && this.signInBanner) {
        // User signed in - remove banner
        this.signInBanner.remove();
        this.signInBanner = null;
      } else if (this.isGuestMode && !this.signInBanner) {
        this.createSignInBanner();
      }
    }

    // Update export/import button visibility for guests
    if (this.exportRosterButton) {
      this.exportRosterButton.title = this.isGuestMode
        ? "Sign in to export your roster"
        : "Export roster to file";
    }
  }

  /**
   * Syncs the difficulty dropdown with the persisted UIState value.
   */
  private syncDifficultySelection(): void {
    if (this.difficultySelect) {
      this.difficultySelect.value = this.uiState.selectedDifficulty;
    }
  }

  private populateCommissioningSelections(): void {
    if (!this.generalRegionSelect || !this.generalSchoolSelect) {
      return;
    }

    this.populateSelect(this.generalRegionSelect, REGION_OPTIONS, (option) => this.unlockState.isRegionLocked(option.key));
    this.populateSelect(this.generalSchoolSelect, SCHOOL_OPTIONS, (option) => this.unlockState.isSchoolLocked(option.key));
    this.syncSchoolOptions();
  }

  private populateSelect(
    select: HTMLSelectElement,
    options: readonly CommissionOption[],
    isLocked: (option: CommissionOption) => boolean
  ): void {
    const previousValue = select.value;
    const placeholder = select.dataset.placeholder ?? "Select an option";
    select.innerHTML = `<option value="" disabled selected hidden>${placeholder}</option>`;
    for (const option of options) {
      const element = document.createElement("option");
      const locked = isLocked(option);
      element.value = option.key;
      element.textContent = locked ? `${option.label} — Unlock Required` : option.label;
      element.dataset.locked = locked ? "true" : "false";
      select.append(element);
    }
    if (previousValue && Array.from(select.options).some((option) => option.value === previousValue)) {
      select.value = previousValue;
      return;
    }
    select.selectedIndex = 0;
  }

  private buildUnlockCallout(title: string, sku: string, buttonLabel: string): HTMLElement {
    const wrapper = document.createElement("article");
    wrapper.className = "commissioning-benefit";

    const heading = document.createElement("p");
    heading.className = "commissioning-benefit__heading";
    heading.textContent = title;

    const summary = document.createElement("p");
    summary.className = "commissioning-benefit__summary";
    summary.textContent = "This content sits behind the current paid roster. Open pricing to unlock it.";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "secondary-button";
    button.textContent = buttonLabel;
    button.addEventListener("click", () => {
      window.location.assign(this.unlockState.buildPurchaseUrlForSku(sku));
    });

    wrapper.append(heading, summary, button);
    return wrapper;
  }

  private syncSchoolOptions(): void {
    if (!this.generalSchoolSelect) {
      return;
    }
    const placeholder = this.generalSchoolSelect.dataset.placeholder ?? "Select a war college";
    const hasSelection = Boolean(this.generalSchoolSelect.value);
    if (!hasSelection) {
      this.generalSchoolSelect.options[0].textContent = placeholder;
    }
  }

  /**
   * Returns the screen's root element.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Caches references to DOM elements within the landing screen.
   */
  private cacheElements(): void {
    this.missionList = this.element.querySelector('[data-mission-list]');
    this.missionListSummary = this.element.querySelector('#missionListSummary');
    this.generalAssignmentHeadline = this.element.querySelector('#generalAssignmentHeadline');
    this.generalAssignmentDetails = this.element.querySelector('#generalAssignmentDetails');
    this.generalDetailPanel = this.element.querySelector('#generalDetailPanel');
    this.generalDetailName = this.element.querySelector('#generalDetailName');
    this.generalDetailSummary = this.element.querySelector('#generalDetailSummary');
    this.generalDetailMissions = this.element.querySelector('#generalDetailMissions');
    this.generalDetailVictories = this.element.querySelector('#generalDetailVictories');
    this.generalDetailUnits = this.element.querySelector('#generalDetailUnits');
    this.generalDetailCasualties = this.element.querySelector('#generalDetailCasualties');
    this.generalDetailBonuses = this.element.querySelector('#generalDetailBonuses');
    this.generalForm = this.element.querySelector('#generalForm');
    this.generalRegionSelect = this.element.querySelector('#generalRegion');
    this.generalSchoolSelect = this.element.querySelector('#generalSchool');
    this.commissioningBenefits = this.element.querySelector('#commissioningBenefits');
    this.commissioningBenefitsContent = this.element.querySelector('#commissioningBenefitsContent');
    this.clearGeneralSelectionButton = this.element.querySelector('#clearGeneralSelection');
    this.exportRosterButton = this.element.querySelector('#exportRosterButton');
    this.importRosterInput = this.element.querySelector('#importRosterInput');
    this.resumeTacticalBattleButton = this.element.querySelector('#resumeTacticalBattle');
    this.feedback = this.element.querySelector('#feedback');
    this.generalRosterList = this.element.querySelector('#generalRosterList');
    this.generalFormSection = this.element.querySelector('#generalFormSection');
    this.commissionButton = this.element.querySelector('#commissionNewButton');
    this.campaignList = this.element.querySelector('[data-campaign-list]');
    this.difficultySelect = this.element.querySelector('#difficultySelect');
    this.campaignButtons = this.campaignList
      ? Array.from(this.campaignList.querySelectorAll<HTMLButtonElement>('[data-campaign-id]'))
      : [];
  }

  /**
   * Binds event handlers to landing screen elements.
   */
  private bindEvents(): void {
    // General form submission
    this.generalForm?.addEventListener("submit", (e) => this.handleGeneralFormSubmit(e));
    this.generalRegionSelect?.addEventListener("change", () => {
      this.syncSchoolOptions();
      this.refreshCommissioningPreview();
    });
    this.generalSchoolSelect?.addEventListener("change", () => this.syncSchoolOptions());
    this.generalSchoolSelect?.addEventListener("change", () => this.refreshCommissioningPreview());

    // Commission new general button
    this.commissionButton?.addEventListener("click", () => this.toggleCommissionForm());

    // Clear general selection
    this.clearGeneralSelectionButton?.addEventListener("click", () => this.handleClearGeneral());

    // Roster export
    this.exportRosterButton?.addEventListener("click", () => this.handleExportRoster());

    // Roster import
    this.importRosterInput?.addEventListener("change", (e) => this.handleImportRoster(e));

    // Difficulty selection
    this.difficultySelect?.addEventListener("change", () => {
      const value = this.difficultySelect?.value;
      if (value === "Easy" || value === "Normal" || value === "Hard") {
        this.uiState.selectedDifficulty = value;
      }
    });

    // Campaign tiles mirror mission buttons, so reuse the same handler for consistent feedback and navigation.
    this.campaignButtons.forEach((button) => {
      button.addEventListener("click", () => this.handleMissionSelection(button));
    });
    this.resumeTacticalBattleButton?.addEventListener("click", () => {
      if (this.unlockState.isCampaignLocked("campaign")) {
        this.showFeedback("Campaign battle saves require full-game campaign access.");
        return;
      }
      document.dispatchEvent(new CustomEvent("campaign:battle:saves-open", {
        detail: { invokerId: this.resumeTacticalBattleButton?.id ?? null }
      }));
    });
  }

  /**
   * Toggles the visibility of the commission form.
   * Guest users are redirected to sign in — progress cannot be saved without an account.
   */
  private toggleCommissionForm(): void {
    if (this.isGuestMode) {
      this.showFeedback(`Sign in to commission a general. ${GUEST_MODE_MESSAGES.saveBlocked}`);
      return;
    }

    if (!this.generalFormSection) {
      return;
    }

    const isHidden = this.generalFormSection.classList.contains("hidden");
    if (isHidden) {
      this.generalFormSection.classList.remove("hidden");
      if (this.commissionButton) {
        this.commissionButton.textContent = "Cancel";
      }
    } else {
      this.generalFormSection.classList.add("hidden");
      if (this.commissionButton) {
        this.commissionButton.textContent = "Commission New General";
      }
    }
  }

  /**
   * Handles mission selection button clicks.
   */
  private handleMissionSelection(button: HTMLButtonElement): void {
    const mission = button.dataset.mission as MissionKey | undefined;
    if (!mission) {
      return;
    }

    if (!this.uiState.selectedGeneralId) {
      this.showFeedback("Assign a commander before selecting an operation.");
      return;
    }

    // Check if mission is locked
    if (button.dataset.locked === "true") {
      const lockReason = button.getAttribute("title") || "This mission is locked.";
      this.showFeedback(lockReason);
      return;
    }

    // Update button states
    this.missionButtons.forEach((btn) => {
      btn.classList.toggle("is-active", btn === button);
    });

    // Update UI state
    this.uiState.selectedMission = mission;

    this.updateUI();
    if (resolveSelectedOperationDestination(mission) === "campaign") {
      this.transitionToCampaign();
    } else {
      this.transitionToPrecombat();
    }
  }

  /**
   * Handles general form submission.
   */
  private handleGeneralFormSubmit(event: Event): void {
    event.preventDefault();
    if (!this.generalForm) {
      return;
    }

    const formData = new FormData(this.generalForm);
    const name = (formData.get("generalName") as string | null)?.trim() ?? "";
    const regionKey = (formData.get("regionKey") as string | null)?.trim() ?? "";
    const schoolKey = (formData.get("schoolKey") as string | null)?.trim() ?? "";
    const commissionedAt = (formData.get("commissionedAt") as string | null)?.trim() ?? "";

    if (name.length === 0) {
      this.showFeedback("Please provide a name for the new general.");
      return;
    }

    if (!regionKey) {
      this.showFeedback("Select a commissioning region to continue.");
      return;
    }

    if (!schoolKey) {
      this.showFeedback("Select a war college to continue.");
      return;
    }

    const region = findRegionOption(regionKey);
    const school = findSchoolOption(schoolKey);

    if (!region) {
      this.showFeedback("Selected region is unavailable.");
      return;
    }

    if (!school) {
      this.showFeedback("Selected war college is unavailable.");
      return;
    }

    if (this.unlockState.isRegionLocked(region.key)) {
      this.showFeedback(`${region.label} requires an unlock before you can commission a commander from that faction.`);
      this.refreshCommissioningPreview();
      return;
    }

    if (this.unlockState.isSchoolLocked(school.key)) {
      this.showFeedback(`${school.label} requires an unlock before you can commission a commander from that college.`);
      this.refreshCommissioningPreview();
      return;
    }

    const payload: GeneralFormData = {
      name,
      regionKey,
      regionLabel: region.label,
      schoolKey,
      schoolLabel: school.label,
      commissionedAt: commissionedAt || null
    };

    this.commissionGeneral(payload, region, school);
    this.generalForm.reset();
    this.populateCommissioningSelections();
  }

  /**
   * Handles clearing the selected general.
   */
  private handleClearGeneral(): void {
    this.uiState.clearGeneralSelection();
    if (this.feedback) {
      this.feedback.textContent = "General assignment cleared.";
    }
    this.updateUI();
  }

  /**
   * Handles roster export functionality.
   * Exports the general roster to a JSON file for backup/sharing.
   */
  private handleExportRoster(): void {
    const count = getRosterCount();
    if (count === 0) {
      if (this.feedback) {
        this.feedback.textContent = "No generals in roster to export.";
      }
      return;
    }

    saveRosterToFile();
    if (this.feedback) {
      this.feedback.textContent = `Roster exported to ${ROSTER_FILE_NAME} (${count} general${count !== 1 ? 's' : ''})`;
    }
  }

  /**
   * Handles roster import functionality.
   * Loads generals from a JSON file and merges with existing roster.
   */
  private async handleImportRoster(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      return;
    }

    try {
      await loadRosterFromFile(file);
      const count = getRosterCount();
      if (this.feedback) {
        this.feedback.textContent = `Roster loaded from ${file.name} - ${count} general${count !== 1 ? 's' : ''} in roster`;
      }
    } catch (error) {
      console.error("Roster import failed:", error);
      if (this.feedback) {
        this.feedback.textContent = "Failed to import roster. Please check the file format.";
      }
    }

    // Clear the input so the same file can be imported again if needed
    input.value = "";
  }

  /**
   * Handles transition to precombat screen.
   */
  /**
   * Updates the UI based on current state.
   */
  private updateUI(): void {
    this.renderRoster();
    this.renderMissionList();
    this.syncMissionButtonState();
    this.syncAssignmentStatus();
  }

  private showFeedback(message: string): void {
    if (this.feedback) {
      this.feedback.textContent = message;
    }
  }

  /**
   * Creates a new general from form data and adds them to the roster.
   * Generates a unique ID based on the general's name and current timestamp.
   */
  private commissionGeneral(formData: GeneralFormData, region: CommissionOption, school: CommissionOption): void {
    // Generate unique ID using name and timestamp to prevent collisions
    const id = deriveSlug(`${formData.name}-${Date.now()}`);

    const stats = this.buildInitialStatBlock(region, school);
    const affiliationSegments = [region.label, school.label];

    addGeneralToRoster({
      id,
      identity: {
        name: formData.name,
        rank: "Commissioned Officer",
        affiliation: affiliationSegments.join(" • "),
        regionKey: region.key,
        regionLabel: region.label,
        schoolKey: school.key,
        schoolLabel: school.label,
        commissionedAt: formData.commissionedAt
      },
      stats,
      serviceRecord: {
        missionsCompleted: 0,
        victoriesAchieved: 0,
        unitsDeployed: 0,
        casualtiesSustained: 0
      }
    });

    this.showFeedback(`${formData.name} commissioned and saved to roster.`);
    this.reconcileGeneralSelection();
    this.updateUI();
  }

  private buildInitialStatBlock(region: CommissionOption, school: CommissionOption): GeneralStatBlock {
    const base: GeneralStatBlock = {
      accBonus: 0,
      dmgBonus: 0,
      moveBonus: 0,
      supplyBonus: 0
    };

    const merged: GeneralStatBlock = { ...base };
    this.applyStatAdjustments(merged, region.statAdjustments);
    this.applyStatAdjustments(merged, school.statAdjustments);
    return merged;
  }

  private applyStatAdjustments(target: GeneralStatBlock, adjustments: Partial<GeneralStatBlock>): void {
    for (const [key, value] of Object.entries(adjustments)) {
      const statKey = key as keyof GeneralStatBlock;
      const increment = typeof value === "number" ? value : 0;
      target[statKey] = (target[statKey] ?? 0) + increment;
    }
  }

  /**
   * Renders the general roster list with all commissioned generals.
   * Each general card shows their name, rank, and action buttons.
   */
  private renderRoster(): void {
    if (!this.generalRosterList) {
      return;
    }

    if (generalRosterEntries.length === 0) {
      this.generalRosterList.innerHTML = "<p class=\"general-roster-empty\">No generals commissioned yet.</p>";
      return;
    }

    this.generalRosterList.innerHTML = generalRosterEntries
      .map((entry) => {
        const selected = entry.id === this.uiState.selectedGeneralId;
        const isGuestGeneral = isFieldCommander(entry.id);
        const guestBadge = isGuestGeneral ? '<span class="guest-badge">Guest</span> ' : '';
        const assignmentControl = selected
          ? '<span class="general-roster-assigned">Assigned</span>'
          : `<button type="button" class="primary-button" data-select-general="${entry.id}">Assign</button>`;
        const retireButton = isGuestGeneral
          ? ""
          : `<button type="button" class="secondary-button" data-retire-general="${entry.id}">Retire</button>`;
        return `
          <article class="general-roster-card${selected ? " is-selected" : ""}${isGuestGeneral ? " is-guest" : ""}">
            <header class="general-roster-details">
              <h3>${guestBadge}${entry.identity.name}</h3>
              <p>${entry.identity.rank ?? "Independent Command"}</p>
            </header>
            <footer class="general-roster-actions">
              ${assignmentControl}
              <button type="button" class="secondary-button" data-view-general="${entry.id}">View</button>
              ${retireButton}
            </footer>
          </article>
        `;
      })
      .join("");

    this.generalRosterList.querySelectorAll<HTMLButtonElement>("[data-select-general]").forEach((button) => {
      button.addEventListener("click", () => {
        const generalId = button.dataset.selectGeneral ?? "";
        this.selectGeneral(generalId);
      });
    });

    this.generalRosterList.querySelectorAll<HTMLButtonElement>("[data-view-general]").forEach((button) => {
      button.addEventListener("click", () => {
        const generalId = button.dataset.viewGeneral ?? "";
        this.viewGeneralProfile(generalId);
      });
    });

    this.generalRosterList.querySelectorAll<HTMLButtonElement>("[data-retire-general]").forEach((button) => {
      button.addEventListener("click", () => {
        const generalId = button.dataset.retireGeneral ?? "";
        this.retireGeneral(generalId);
      });
    });
  }

  private selectGeneral(generalId: string): void {
    const general = findGeneralById(generalId);
    if (!general) {
      this.showFeedback("Unable to locate the selected general.");
      return;
    }

    this.uiState.selectedGeneralId = generalId;
    this.showFeedback(`${general.identity.name} assigned to current mission queue.`);
    this.updateUI();
  }

  /**
   * Removes a general from the roster.
   * If the removed general is currently selected, clears the selection.
   * Guest Field Commander cannot be retired.
   */
  private retireGeneral(generalId: string): void {
    // Prevent retiring the guest Field Commander
    if (isFieldCommander(generalId)) {
      this.showFeedback("Field Commander is a provisional officer. Sign in to commission your own generals.");
      return;
    }

    // Clear selection if removing the currently selected general
    if (generalId === this.uiState.selectedGeneralId) {
      this.uiState.clearGeneralSelection();
      this.uiState.selectedMission = null;
    }

    // Remove the general from the roster utility
    // This automatically updates localStorage
    const removed = removeGeneralFromRoster(generalId);

    if (removed) {
      this.showFeedback("General retired from active roster.");
    } else {
      this.showFeedback("Failed to retire general.");
    }

    this.reconcileGeneralSelection();
    this.updateUI();
  }

  private syncMissionButtonState(): void {
    const mission = this.uiState.selectedMission;
    this.missionButtons.forEach((button) => {
      const matches = button.dataset.mission === mission;
      button.classList.toggle('is-active', matches);
    });

    this.syncCampaignButtonState(mission);
  }

  /**
   * Keeps campaign launch tiles in sync with commander requirements and selected mission state.
   * The tiles share the mission handler, so we update their disabled and active states together here.
   */
  private syncCampaignButtonState(mission: MissionKey | null): void {
    const hasCommander = Boolean(this.uiState.selectedGeneralId);

    this.campaignButtons.forEach((button) => {
      const disabled = !hasCommander;
      button.dataset.disabled = disabled ? "true" : "false";
      button.classList.toggle("is-disabled", disabled);
      button.setAttribute("aria-disabled", disabled ? "true" : "false");
      button.disabled = disabled;

      const matches = button.dataset.mission === mission;
      button.classList.toggle("is-active", matches);
    });
  }

  /**
   * Updates the assignment summary panel to reflect the current commander state.
   * Applying a single method keeps messaging consistent whenever the roster changes.
   */
  private syncAssignmentStatus(): void {
    if (!this.generalAssignmentHeadline || !this.generalAssignmentDetails || !this.missionListSummary) {
      return;
    }

    const selectedId = this.uiState.selectedGeneralId;
    const rosterDetails = this.element.querySelector<HTMLDetailsElement>("#commandRosterDetails");
    if (!selectedId) {
      if (rosterDetails) rosterDetails.open = true;
      this.disclosedGeneralId = null;
      this.generalAssignmentHeadline.textContent = "No general assigned.";
      this.generalAssignmentDetails.textContent = "Choose a commander to unlock campaigns and battles.";
      this.missionListSummary.textContent = "Assign a commander to continue.";
      this.updateGeneralDetailPanel(null, "assignment");
      return;
    }

    const general = findGeneralById(selectedId);
    if (!general) {
      if (rosterDetails) rosterDetails.open = true;
      this.disclosedGeneralId = null;
      this.generalAssignmentHeadline.textContent = "Selected general no longer exists.";
      this.generalAssignmentDetails.textContent = "Reassign a commander from the updated roster.";
      this.missionListSummary.textContent = "Roster data refreshed; reselect a commander to continue.";
      this.updateGeneralDetailPanel(null, "assignment");
      return;
    }

    const missionsCompleted = general.serviceRecord?.missionsCompleted ?? 0;
    const victories = general.serviceRecord?.victoriesAchieved ?? 0;
    const isGuestGeneral = isFieldCommander(selectedId);

    this.generalAssignmentHeadline.textContent = `${general.identity.name} assigned.`;
    if (rosterDetails && this.disclosedGeneralId !== selectedId) {
      rosterDetails.open = false;
      this.disclosedGeneralId = selectedId;
    }

    if (isGuestGeneral) {
      this.generalAssignmentDetails.textContent = "Guest commander · open to manage the roster.";
      this.missionListSummary.textContent = "Available now for Field Commander.";
    } else {
      this.generalAssignmentDetails.textContent = `Completed ${missionsCompleted} mission${missionsCompleted === 1 ? "" : "s"} with ${victories} victor${victories === 1 ? "y" : "ies"}.`;
      this.missionListSummary.textContent = `Operations curated for ${general.identity.name}.`;
    }
    this.generalDetailPanel?.classList.add("hidden");
  }

  private reconcileGeneralSelection(): void {
    const selectedId = this.uiState.selectedGeneralId;
    if (selectedId) {
      const existing = findGeneralById(selectedId);
      if (!existing) {
        this.uiState.clearGeneralSelection();
      }
    }

    if (!this.uiState.selectedGeneralId && generalRosterEntries.length > 0) {
      this.uiState.selectedGeneralId = generalRosterEntries[0].id;
    }
  }

  /**
   * Binds click handlers for mission buttons after the list is rendered.
   * Mission buttons are re-created on every state change to keep lock states accurate.
   */
  private attachMissionButtonEvents(): void {
    this.missionButtons.forEach((button) => {
      button.addEventListener("click", () => this.handleMissionSelection(button));
    });
  }

  /**
   * Builds the mission list based on the currently assigned general.
   * When no commander is selected a generic list is shown; otherwise only suitable missions appear.
   */
  private renderMissionList(): void {
    if (!this.missionList) {
      return;
    }

    const selectedGeneralId = this.uiState.selectedGeneralId;
    const selectedGeneral = selectedGeneralId ? findGeneralById(selectedGeneralId) : null;

    // Clear selection if selected mission is locked for this general
    if (selectedGeneral && this.uiState.selectedMission) {
      const missionsCompleted = selectedGeneral.serviceRecord?.missionsCompleted ?? 0;
      const victories = selectedGeneral.serviceRecord?.victoriesAchieved ?? 0;
      if (!isMissionUnlocked(this.uiState.selectedMission, missionsCompleted, victories)) {
        this.uiState.selectedMission = null;
      }
    }

    if (!selectedGeneral) {
      this.missionList.innerHTML = '<p class="general-roster-empty">Assign a commander to view available battles.</p>';
      this.missionButtons = [];
      return;
    }

    // Show ALL non-campaign missions in canonical order (campaigns have their own section)
    const canonicalOrder: MissionKey[] = [
      "training",
      "patrol",
      "patrol_river_watch",
      "patrol_pointe_du_hoc",
      "assault_el_alamein",
      "assault_kasserine_pass",
      "assault_gela_landings",
      "assault_anzio_beachhead",
      "assault_monte_cassino",
      "assault_omaha_beach",
      "assault_carentan",
      "assault_arnhem_bridge",
      "assault_falaise_pocket",
      "assault_hurtgen_forest",
      "assault",
      "assault_citadel_ridge",
      "assault_bastogne",
      "assault_remagen"
    ];

    const availableMarkup: string[] = [];
    const lockedMarkup: string[] = [];
    const missionsCompleted = selectedGeneral.serviceRecord?.missionsCompleted ?? 0;
    const victories = selectedGeneral.serviceRecord?.victoriesAchieved ?? 0;
    canonicalOrder.forEach((missionKey) => {
        const title = getMissionTitle(missionKey);
        const briefing = getMissionBriefing(missionKey);
        const unlockReq = getMissionUnlockRequirement(missionKey);

        const isLocked = !isMissionUnlocked(missionKey, missionsCompleted, victories);
        if (isLocked) {
          lockedMarkup.push(`
            <li class="locked-operation-row">
              <strong>${title}</strong>
              <span>${unlockReq.description}</span>
            </li>
          `);
          return;
        }
        availableMarkup.push(`
          <button type="button" class="mission-button" data-mission="${missionKey}" data-locked="false">
            <strong>${title}</strong>
            <span>${summarizeMissionForLaunch(briefing)}</span>
            <em>Play standalone battle</em>
          </button>
        `);
      });

    this.missionList.innerHTML = `${availableMarkup.join("")}${lockedMarkup.length > 0 ? `
      <details class="locked-operation-disclosure">
        <summary>Locked operations (${lockedMarkup.length})</summary>
        <ul class="locked-operation-list">${lockedMarkup.join("")}</ul>
      </details>
    ` : ""}`;
    this.missionButtons = Array.from(this.missionList.querySelectorAll<HTMLButtonElement>('[data-mission]'));
    this.attachMissionButtonEvents();
  }

  /**
   * Determines which missions a general may undertake using a simple experience heuristic.
   * The thresholds keep rookies in training/patrol while veterans unlock assault and campaign.
   */
  private getMissionsForGeneral(general: GeneralRosterEntry): MissionKey[] {
    const missionsCompleted = general.serviceRecord?.missionsCompleted ?? 0;
    const victories = general.serviceRecord?.victoriesAchieved ?? 0;

    return UIState.getMissionKeys().filter((missionKey) => {
      const hasCampaignUnlock = missionKey === "campaign" ? !this.unlockState.isCampaignLocked("campaign") : undefined;
      return isMissionUnlocked(missionKey, missionsCompleted, victories, hasCampaignUnlock);
    });
  }

  /**
   * Displays a lightweight summary of the general's record in the feedback panel.
   * Acts as a placeholder until the dedicated profile view is implemented.
   */
  private viewGeneralProfile(generalId: string): void {
    const general = findGeneralById(generalId);
    if (!general) {
      this.showFeedback("General profile unavailable.");
      return;
    }

    const record = general.serviceRecord;
    const summary = record
      ? `${record.missionsCompleted} missions, ${record.victoriesAchieved} victories, ${record.unitsDeployed} units deployed.`
      : "No combat record on file yet.";
    this.showFeedback(`${general.identity.name}: ${summary}`);
    this.updateGeneralDetailPanel(general, "view");
  }

  /**
   * Centralizes mission-to-precombat transitions so both mission clicks and the fallback button reuse the same logic.
   */
  private transitionToPrecombat(): void {
    if (!this.uiState.canProceedToPrecombat()) {
      this.showFeedback("Assign a commander and select an operation to continue.");
      return;
    }

    const missionKey = this.uiState.selectedMission;
    if (!missionKey) {
      this.showFeedback("Mission data unavailable. Select an operation and retry.");
      return;
    }

    // Mark this mission as NOT from campaign
    this.uiState.isFromCampaign = false;

    if (this.precombatScreen) {
      this.precombatScreen.setup(missionKey, this.uiState.selectedGeneralId, this.uiState.selectedDifficulty);
    } else {
      console.warn("Precombat screen reference missing; skipping setup before transition.");
    }

    this.screenManager.showScreenById("precombat");
  }

  private transitionToCampaign(): void {
    if (!this.uiState.selectedGeneralId) {
      this.showFeedback("Assign a commander to continue to the campaign map.");
      return;
    }
    if (!this.campaignScreen) {
      console.warn("Campaign screen reference missing; cannot render campaign scenario.");
    }
    this.screenManager.showScreenById("campaign");
  }

  /**
   * Populates the command record panel with the selected general's details.
   * The context flag tweaks the headline copy depending on whether we're reacting to assignment or an explicit view action.
   */
  private updateGeneralDetailPanel(general: GeneralRosterEntry | null, context: "assignment" | "view"): void {
    if (
      !this.generalDetailPanel ||
      !this.generalDetailName ||
      !this.generalDetailSummary ||
      !this.generalDetailMissions ||
      !this.generalDetailVictories ||
      !this.generalDetailUnits ||
      !this.generalDetailCasualties
    ) {
      return;
    }

    if (!general) {
      this.generalDetailPanel.classList.add("hidden");
      this.generalDetailName.textContent = "No commander selected.";
      this.generalDetailSummary.textContent = "Activate a commander and choose \"View\" to review their history.";
      this.renderGeneralBonuses(null);
      this.generalDetailMissions.textContent = "0";
      this.generalDetailVictories.textContent = "0";
      this.generalDetailUnits.textContent = "0";
      this.generalDetailCasualties.textContent = "0";
      return;
    }

    const record = general.serviceRecord ?? {
      missionsCompleted: 0,
      victoriesAchieved: 0,
      unitsDeployed: 0,
      casualtiesSustained: 0
    };

    const affiliation = general.identity.affiliation ? ` • ${general.identity.affiliation}` : "";
    const rank = general.identity.rank ? general.identity.rank : "Independent Command";
    const baseSummary = `${rank}${affiliation}`;

    this.generalDetailPanel.classList.remove("hidden");
    this.generalDetailName.textContent = general.identity.name;
    this.generalDetailSummary.textContent =
      context === "view"
        ? `${baseSummary} — ${record.missionsCompleted} missions, ${record.victoriesAchieved} victories.`
        : `${baseSummary}. Service record ready for deployment.`;
    this.generalDetailMissions.textContent = record.missionsCompleted.toString();
    this.generalDetailVictories.textContent = record.victoriesAchieved.toString();
    this.generalDetailUnits.textContent = record.unitsDeployed.toString();
    this.generalDetailCasualties.textContent = record.casualtiesSustained.toString();
    this.renderGeneralBonuses(general);

    if (context === "view") {
      // Surface the detail card immediately when the player explicitly asks to view a general.
      this.generalDetailPanel.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /**
   * Populates the commissioning bonus callouts with the region and war college modifiers applied to the general.
   */
  private renderGeneralBonuses(general: GeneralRosterEntry | null): void {
    if (!this.generalDetailBonuses) {
      return;
    }

    this.generalDetailBonuses.innerHTML = "";

    if (!general) {
      const placeholder = document.createElement("p");
      placeholder.className = "general-detail-bonus-copy";
      placeholder.textContent = "Commissioning bonuses will appear once a commander is selected.";
      this.generalDetailBonuses.append(placeholder);
      return;
    }

    const entries: Array<{ heading: string; summary: string; adjustments: Partial<GeneralStatBlock> }> = [];
    const region = findRegionOption(general.identity.regionKey ?? null);
    if (region) {
      entries.push({ heading: `${general.identity.regionLabel ?? region.label} Region Focus`, summary: region.summary, adjustments: region.statAdjustments });
    }
    const school = findSchoolOption(general.identity.schoolKey ?? null);
    if (school) {
      entries.push({ heading: `${general.identity.schoolLabel ?? school.label} Doctrine`, summary: school.summary, adjustments: school.statAdjustments });
    }

    if (entries.length === 0) {
      const fallback = document.createElement("p");
      fallback.className = "general-detail-bonus-copy";
      fallback.textContent = "No commissioning bonuses recorded for this commander.";
      this.generalDetailBonuses.append(fallback);
      return;
    }

    entries.forEach((entry) => {
      const wrapper = document.createElement("div");
      wrapper.className = "general-detail-bonus";

      const heading = document.createElement("p");
      heading.className = "general-detail-bonus-heading";
      heading.textContent = entry.heading;

      const summary = document.createElement("p");
      summary.className = "general-detail-bonus-copy";
      summary.textContent = entry.summary;

      const adjustments = document.createElement("p");
      adjustments.className = "general-detail-bonus-copy";
      adjustments.textContent = this.formatStatAdjustments(entry.adjustments);

      wrapper.append(heading, summary, adjustments);
      this.generalDetailBonuses?.append(wrapper);
    });
  }

  /**
   * Builds a human-readable summary of stat adjustments (e.g., "+10% Mobility, +5% Supply").
   */
  private formatStatAdjustments(adjustments: Partial<GeneralStatBlock>): string {
    const statLabels: Record<keyof GeneralStatBlock, string> = {
      accBonus: "Accuracy",
      dmgBonus: "Damage",
      moveBonus: "Mobility",
      supplyBonus: "Supply"
    };

    const parts = (Object.keys(statLabels) as Array<keyof GeneralStatBlock>)
      .map((key) => {
        const value = adjustments[key];
        if (typeof value !== "number" || value === 0) {
          return null;
        }
        const prefix = value > 0 ? "+" : "";
        const display = Number.isInteger(value) ? value.toString() : value.toFixed(1);
        return `${prefix}${display}% ${statLabels[key]}`;
      })
      .filter((part): part is string => Boolean(part));

    return parts.length > 0 ? parts.join(", ") : "No direct stat modifiers";
  }
}
