import { getPopupContent } from "../../data/popupContent";
import { SIDEBAR_MINI_TUTORIAL_EVENT } from "../../data/sidebarMiniTutorials";
import { ensureBattleState } from "../../state/BattleState";
import { getReconIntelSnapshot as buildFallbackReconIntelSnapshot } from "../../data/reconIntelSnapshot";
import { getAllGenerals } from "../../utils/rosterStorage";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { supply as supplyBalance } from "../../core/balance";
import { axialKey } from "../../core/Hex";
import { ensureTutorialState } from "../../state/TutorialState";
import unitTypesSource from "../../data/unitSystem/derivedUnitTypes";
import { getSpriteForScenarioType } from "../../data/unitSpriteCatalog";
import { getFormation } from "../../data/unitSystem/formations";
/**
 * Manages popup dialogs and overlays throughout the application.
 * Handles opening, closing, focus management, and content rendering.
 */
export class PopupManager {
    constructor(warRoomOverlay = null) {
        this.activePopup = null;
        this.lastTriggerButton = null;
        this.battleState = ensureBattleState();
        this.sidebarController = null;
        /** Tracks which faction's supply ledger is currently displayed inside the Supplies panel. */
        this.activeSupplyFaction = "Player";
        /** Air Support: captures which field should be filled by the next map click. */
        this.airPickMode = null;
        this.airPlannerState = {
            missionKind: "",
            squadronValue: "",
            targetValue: "",
            targetValues: {},
            targetSquadronId: "",
            feedback: "",
            feedbackTone: "neutral",
            suspendedForMapPick: false
        };
        this.intelPickMode = null;
        /** Cached recon/intel payload hydrated when the commander opens either panel. */
        this.reconIntelSnapshot = null;
        /** Active timeframe filter controlling which intel briefs render. */
        this.reconIntelTimeframe = "all";
        /** Active confidence filter controlling how uncertain intel is presented. */
        this.reconIntelConfidence = "all";
        this.intelFeedbackMessage = "";
        this.warRoomOverlay = warRoomOverlay;
        const layer = document.getElementById("battlePopupLayer");
        if (!layer) {
            throw new Error("PopupManager: Required '#battlePopupLayer' element not found.");
        }
        this.popupLayer = layer;
        const dialog = layer.querySelector('.battle-popup');
        if (!dialog) {
            throw new Error("PopupManager: Required '.battle-popup' element not found inside #battlePopupLayer.");
        }
        this.popupDialog = dialog;
        const title = this.popupDialog.querySelector("[data-popup-title]");
        if (!title) {
            throw new Error("PopupManager: Required '[data-popup-title]' element not found inside battle popup.");
        }
        this.popupTitle = title;
        this.popupBody = this.requireElement("[data-popup-body]");
        this.closeButton = this.requireElement("#battlePopupClose");
        // Route live recon/intel refresh events into the active popup so planners see updated intelligence without reopening the panel.
        this.reconIntelEventListener = (event) => {
            this.onReconIntelUpdate(event);
        };
        document.addEventListener("battle:reconIntelUpdated", this.reconIntelEventListener);
        this.airPickListener = (event) => {
            this.onBattleHexClicked(event);
        };
        document.addEventListener("battle:hexClicked", this.airPickListener);
        document.addEventListener("warroom:openBattleRequisitions", () => {
            this.handleWarRoomOpenBattleRequisitions();
        });
        this.bindGlobalEvents();
        if (this.warRoomOverlay) {
            this.warRoomOverlay.registerCloseListener(() => this.handleWarRoomOverlayClosed());
        }
        // Keep open panels in sync with engine/battle updates.
        this.unsubscribeBattleUpdates = this.battleState.subscribeToBattleUpdates((reason) => {
            if (this.activePopup === "supplies" && this.shouldRefreshSuppliesPanel(reason)) {
                this.renderSuppliesPanel();
            }
            if (this.activePopup === "logistics" && this.shouldRefreshLogisticsPanel(reason)) {
                this.renderLogisticsPanel();
            }
            if (this.activePopup === "armyRoster" && this.shouldRefreshRosterPanel(reason)) {
                this.renderArmyRoster();
            }
            if (this.activePopup === "battleRequisitions" && this.shouldRefreshBattleRequisitionPanel(reason)) {
                this.renderBattleRequisitionsPanel();
            }
            if (this.activePopup === "recon") {
                this.renderReconPanel();
            }
            if (this.activePopup === "intelligence") {
                this.renderIntelPanel();
            }
            if (this.activePopup === "airSupport") {
                this.renderAirSupportPanel();
            }
        });
        this.unsubscribeTutorialUpdates = ensureTutorialState().subscribe((progress) => {
            if (!progress.isActive) {
                return;
            }
            this.syncTutorialProgressForActivePopup(progress.currentPhase);
        });
        window.addEventListener("beforeunload", () => {
            this.unsubscribeBattleUpdates();
            this.unsubscribeTutorialUpdates();
        });
    }
    syncTutorialProgressForActivePopup(phase) {
        const tutorialState = ensureTutorialState();
        const progress = tutorialState.getProgress();
        if (!progress.isActive || progress.currentPhase !== phase || progress.canProceed) {
            return;
        }
        const popupMatchesPhase = (phase === "roster_intro" && this.activePopup === "armyRoster")
            || (phase === "air_support_intro" && this.activePopup === "airSupport")
            || (phase === "logistics_intro" && this.activePopup === "logistics");
        if (popupMatchesPhase) {
            tutorialState.setCanProceed(true);
        }
    }
    /**
     * Binds the Supplies faction toggle so commanders can switch between Player and Enemy ledgers on demand.
     */
    bindSupplyFactionControls(container) {
        if (container.getAttribute("data-controls-initialized") === "true") {
            return;
        }
        container.addEventListener("click", (event) => {
            const button = event.target.closest("[data-supplies-faction]");
            if (!button) {
                return;
            }
            const faction = (button.dataset.suppliesFaction ?? "Player");
            if (this.activeSupplyFaction === faction) {
                return;
            }
            this.activeSupplyFaction = faction;
            // Re-render so the panel reflects the newly selected ledger.
            this.renderSuppliesPanel();
        }, { passive: true });
        container.setAttribute("data-controls-initialized", "true");
    }
    /**
     * Wires logistics priority buttons so the commander can steer automated convoy service without manual truck orders.
     */
    bindLogisticsPriorityControls(container) {
        if (container.getAttribute("data-logistics-controls-initialized") === "true") {
            return;
        }
        container.addEventListener("click", (event) => {
            const button = event.target.closest("[data-logistics-priority-button]");
            if (!button) {
                return;
            }
            const unitId = button.dataset.logisticsPriorityUnitId ?? "";
            const priority = (button.dataset.logisticsPriority ?? "normal");
            if (!unitId) {
                return;
            }
            try {
                const engine = this.battleState.ensureGameEngine();
                if (engine.setSupplyPriority(unitId, priority)) {
                    this.renderLogisticsPanel();
                }
            }
            catch (error) {
                console.warn("PopupManager: Failed to update logistics priority.", error);
            }
        }, { passive: true });
        container.setAttribute("data-logistics-controls-initialized", "true");
    }
    /**
     * Updates faction toggle button styling and accessibility state to mirror the currently selected ledger.
     */
    syncSupplyFactionControls(container, availability) {
        const buttons = Array.from(container.querySelectorAll("[data-supplies-faction]"));
        buttons.forEach((button) => {
            const faction = (button.dataset.suppliesFaction ?? "Player");
            const isActive = faction === this.activeSupplyFaction;
            button.classList.toggle("is-active", isActive);
            button.setAttribute("aria-pressed", isActive ? "true" : "false");
            const hasData = availability[faction];
            button.disabled = !hasData;
            button.title = hasData
                ? (faction === "Player" ? "View our current supply ledger" : "View enemy supply estimates")
                : "Recon reports are required before this ledger is available.";
        });
    }
    /**
     * Wires global-level listeners so popup layers respond to keyboard shortcuts and background interactions.
     * This keeps accessibility affordances centralized rather than scattering event bindings throughout the constructor.
     */
    bindGlobalEvents() {
        // Close button click returns control to the triggering sidebar button.
        this.closeButton.addEventListener("click", () => this.closePopup());
        // Clicking the translucent overlay outside the dialog closes any standard popup.
        this.popupLayer.addEventListener("click", (event) => {
            if (event.target !== this.popupLayer) {
                return;
            }
            if (this.airPickMode || this.intelPickMode) {
                const mouseEvent = event;
                const hits = document.elementsFromPoint(mouseEvent.clientX, mouseEvent.clientY);
                let offsetKey = null;
                for (const hit of hits) {
                    const cell = hit.closest?.(".hex-cell");
                    const key = cell?.dataset?.hex;
                    if (typeof key === "string" && key.length > 0) {
                        offsetKey = key;
                        break;
                    }
                }
                if (offsetKey) {
                    this.onBattleHexClicked(new CustomEvent("battle:hexClicked", { detail: { offsetKey } }));
                }
                else {
                    if (this.airPickMode) {
                        const panel = this.popupBody.querySelector("[data-air-panel]");
                        const fb = panel?.querySelector("[data-air-feedback]");
                        fb && (fb.textContent = "Click a hex on the map to select a target.");
                    }
                    else if (this.intelPickMode) {
                        this.setIntelFeedback("Click an in-bounds hex on the map to project the deception screen.");
                    }
                }
                return;
            }
            this.closePopup();
        });
        // Provide Escape-key dismissal for keyboard users.
        document.addEventListener("keydown", (event) => {
            if (event.key === "Escape" && this.activePopup && this.activePopup !== "baseOperations") {
                if (this.activePopup === "airSupport" && this.airPickMode) {
                    event.preventDefault();
                    this.airPickMode = null;
                    this.airPlannerState.targetSquadronId = "";
                    document.dispatchEvent(new CustomEvent("air:clearPreview"));
                    this.setAirPlannerFeedback("Target selection cancelled.", "neutral");
                    if (this.airPlannerState.suspendedForMapPick) {
                        this.resumeAirSupportPopupFromMapPick();
                    }
                    else {
                        this.renderAirSupportPanel();
                    }
                    return;
                }
                this.closePopup();
            }
        });
    }
    /**
     * Initializes the Intelligence panel by wiring timeframe/confidence filters and rendering the view.
     * The Intelligence panel presents analyst briefs and an optional alert banner; recon sectors are not shown here.
     */
    initializeIntelPanel() {
        if (!this.reconIntelSnapshot) {
            return;
        }
        const panel = this.popupBody.querySelector("[data-intel-panel]");
        if (!panel) {
            return;
        }
        const timeframeButtons = Array.from(panel.querySelectorAll("[data-intel-timeframe]"));
        const confidenceButtons = Array.from(panel.querySelectorAll("[data-intel-confidence]"));
        const activate = (buttons, active) => {
            buttons.forEach((b) => b.classList.toggle("is-active", b === active));
        };
        timeframeButtons.forEach((button) => {
            if ((button.dataset.intelTimeframe ?? "all") === "all")
                button.classList.add("is-active");
            button.addEventListener("click", () => {
                this.reconIntelTimeframe = (button.dataset.intelTimeframe ?? "all");
                activate(timeframeButtons, button);
                this.renderIntelPanel();
            });
        });
        confidenceButtons.forEach((button) => {
            if ((button.dataset.intelConfidence ?? "all") === "all")
                button.classList.add("is-active");
            button.addEventListener("click", () => {
                this.reconIntelConfidence = (button.dataset.intelConfidence ?? "all");
                activate(confidenceButtons, button);
                this.renderIntelPanel();
            });
        });
        this.bindIntelActionControls(panel);
        this.renderIntelPanel();
    }
    bindIntelActionControls(panel) {
        if (panel.getAttribute("data-intel-controls-initialized") === "true") {
            return;
        }
        panel.addEventListener("click", (event) => {
            const target = event.target;
            const deployButton = target.closest("[data-intel-action='deception']");
            if (deployButton) {
                this.intelPickMode = "deception";
                this.setIntelFeedback("Click a map hex to place a deception screen. Enemy battalions will bias toward that false axis.");
                return;
            }
            const verifyButton = target.closest("[data-intel-verify]");
            if (verifyButton) {
                const briefId = verifyButton.dataset.intelVerify ?? "";
                if (!briefId) {
                    return;
                }
                this.handleIntelVerification(briefId);
            }
        });
        panel.setAttribute("data-intel-controls-initialized", "true");
    }
    handleIntelVerification(briefId) {
        try {
            const engine = this.battleState.ensureGameEngine();
            const result = engine.verifyIntelBrief(briefId);
            if (!result.ok) {
                this.setIntelFeedback(result.reason);
                return;
            }
            this.setIntelFeedback(result.status === "confirmed-false"
                ? "Verification complete: the brief was false. Keep reserves on the confirmed axis."
                : "Verification complete: the brief is confirmed and can be used for planning.");
            this.refreshReconIntelSnapshot();
        }
        catch (error) {
            console.warn("PopupManager: Failed to verify intelligence brief.", error);
            this.setIntelFeedback("Verification failed. Try again once the battle engine is available.");
        }
    }
    /**
     * Renders the Intelligence panel: alert banner + filtered intelligence briefs with confidence labels.
     */
    renderIntelPanel() {
        this.reconIntelSnapshot = this.requestReconIntelSnapshot();
        if (!this.reconIntelSnapshot) {
            return;
        }
        const banner = this.popupBody.querySelector("[data-intel-alert]");
        if (banner) {
            const alert = this.selectReconIntelAlert();
            if (!alert) {
                banner.hidden = true;
                banner.textContent = "";
                banner.removeAttribute("data-severity");
            }
            else {
                banner.hidden = false;
                banner.setAttribute("data-severity", alert.severity);
                banner.innerHTML = `<span>${alert.message}</span><small>${alert.action}</small>`;
            }
        }
        const summary = this.popupBody.querySelector("[data-intel-counterintel-summary]");
        if (summary) {
            summary.innerHTML = this.composeIntelCounterIntelSummary(this.reconIntelSnapshot.counterIntel);
        }
        const operations = this.popupBody.querySelector("[data-intel-counterintel-ops]");
        if (operations) {
            const activeOperations = this.reconIntelSnapshot.counterIntel?.activeOperations ?? [];
            operations.innerHTML = activeOperations.length === 0
                ? '<div class="intel-empty">No deception screens are active. Use counter-intelligence to pull the enemy toward a false axis.</div>'
                : activeOperations.map((entry) => this.composeCounterIntelOperationMarkup(entry)).join("");
        }
        const feedback = this.popupBody.querySelector("[data-intel-feedback]");
        if (feedback) {
            feedback.textContent = this.intelFeedbackMessage || "Low-confidence briefs may be deceptive. Verify them before shifting reserves.";
        }
        const list = this.popupBody.querySelector("[data-intel-brief-list]");
        if (!list) {
            return;
        }
        const briefs = this.reconIntelSnapshot.intelBriefs.filter((b) => this.matchesReconIntelFilters(b.timeframe, b.confidence));
        list.innerHTML = briefs.length === 0
            ? '<div class="intel-empty">No intelligence briefs match the selected filters.</div>'
            : briefs.map((b) => this.composeIntelBriefMarkup(b)).join("");
    }
    /**
     * Renders the Recon panel from direct player recon observations only.
     */
    renderReconPanel() {
        const panel = this.popupBody.querySelector("[data-recon-panel]");
        const list = this.popupBody.querySelector("[data-recon-report-list]");
        if (!panel || !list) {
            return;
        }
        const view = this.buildReconBoardView();
        const totalObservers = panel.querySelector("[data-recon-observers]");
        const activeObservers = panel.querySelector("[data-recon-active]");
        const totalContacts = panel.querySelector("[data-recon-contacts]");
        if (totalObservers) {
            totalObservers.textContent = String(view.totalObservers);
        }
        if (activeObservers) {
            activeObservers.textContent = String(view.activeObservers);
        }
        if (totalContacts) {
            totalContacts.textContent = String(view.totalContacts);
        }
        list.innerHTML = view.observers.length === 0
            ? `<div class="recon-report-empty">${this.escapeHtml(view.emptyMessage)}</div>`
            : view.observers.map((observer) => this.renderReconObserverRowMarkup(observer)).join("");
    }
    refreshReconIntelSnapshot() {
        const snapshot = this.requestReconIntelSnapshot();
        this.reconIntelSnapshot = snapshot;
        document.dispatchEvent(new CustomEvent("battle:reconIntelUpdated", { detail: snapshot }));
    }
    setIntelFeedback(message) {
        this.intelFeedbackMessage = message;
        const feedback = this.popupBody.querySelector("[data-intel-feedback]");
        if (feedback) {
            feedback.textContent = message;
        }
    }
    composeIntelCounterIntelSummary(summary) {
        if (!summary) {
            return `
        <article class="intel-command-card">
          <strong>Counter-Intelligence Offline</strong>
          <p>Live deception and verification actions become available once the battle engine is active.</p>
        </article>
      `;
        }
        return `
      <article class="intel-command-card">
        <span>Deception Teams</span>
        <strong>${summary.deceptionCharges}/${summary.deceptionMaxCharges}</strong>
        <p>Project a false axis that can pull enemy battalions away from the real main effort.</p>
      </article>
      <article class="intel-command-card">
        <span>Verification Cells</span>
        <strong>${summary.verificationCharges}/${summary.verificationMaxCharges}</strong>
        <p>Resolve suspicious briefs before you redeploy reserves, artillery, or logistics convoys.</p>
      </article>
      <article class="intel-command-card">
        <span>False Intel Risk</span>
        <strong>${summary.suspectedFalseBriefs} suspect / ${summary.confirmedFalseBriefs} confirmed</strong>
        <p>${this.escapeHtml(summary.doctrineSummary)}</p>
      </article>
    `;
    }
    composeCounterIntelOperationMarkup(operation) {
        return `
      <article class="intel-operation-card">
        <header>
          <strong>${this.escapeHtml(operation.label)}</strong>
          <span class="meta-pill">Turns ${operation.remainingTurns}</span>
        </header>
        <div class="meta-line">
          <span>${this.escapeHtml(operation.targetHex)}</span>
          <span>Radius ${operation.radius}</span>
        </div>
        <p class="body">${this.escapeHtml(operation.effect)}</p>
      </article>
    `;
    }
    composeIntelBriefMarkup(brief) {
        const verificationStatus = brief.verificationStatus ?? "unverified";
        const locked = verificationStatus === "verified" || verificationStatus === "confirmed-false";
        const linkedSectorCount = brief.linkedSectors.length;
        const linkedSectorText = linkedSectorCount === 0
            ? "No recon sectors linked."
            : `${linkedSectorCount} recon sector${linkedSectorCount === 1 ? "" : "s"} linked.`;
        const sourceMarkup = brief.source
            ? `<span class="meta-pill">${this.escapeHtml(brief.source)}</span>`
            : "";
        return `
      <article class="intel-card intel-card--${verificationStatus}" data-brief-id="${this.escapeHtml(brief.id)}" tabindex="0">
        <div class="intel-card__header">
          <div class="intel-card__title-group">
            <strong>${this.escapeHtml(brief.title)}</strong>
            <div class="meta-line">
              <span class="meta-pill">${this.describeReconIntelTimeframe(brief.timeframe)}</span>
              <span class="meta-pill">${this.describeReconIntelConfidence(brief.confidence)}</span>
              <span class="meta-pill meta-pill--status">${this.describeReconIntelVerificationStatus(verificationStatus)}</span>
              ${sourceMarkup}
            </div>
          </div>
          <button
            type="button"
            class="intel-verify-button${locked ? " is-disabled" : ""}"
            data-intel-verify="${this.escapeHtml(brief.id)}"
            ${locked ? "disabled" : ""}
          >
            ${locked ? "Resolved" : "Verify"}
          </button>
        </div>
        <p class="body" data-confidence="${brief.confidence}">${this.escapeHtml(brief.assessment)}</p>
        <p class="body">${this.escapeHtml(brief.recommendedAction ?? brief.projectedImpact)}</p>
        <div class="meta-line"><span>${this.escapeHtml(linkedSectorText)}</span></div>
      </article>
    `;
    }
    describeReconIntelVerificationStatus(status) {
        switch (status) {
            case "suspected-false":
                return "Suspected False";
            case "verified":
                return "Verified";
            case "confirmed-false":
                return "Confirmed False";
            case "unverified":
            default:
                return "Unverified";
        }
    }
    buildReconBoardView() {
        if (!this.battleState.hasEngine()) {
            return {
                observers: [],
                totalObservers: 0,
                activeObservers: 0,
                totalContacts: 0,
                emptyMessage: "Recon board comes online once battle begins."
            };
        }
        try {
            const engine = this.battleState.ensureGameEngine();
            const reports = engine.getPlayerReconReports();
            const observers = reports.map((report) => this.buildReconObserverView(report));
            const uniqueContacts = new Set();
            observers.forEach((observer) => observer.contacts.forEach((contact) => uniqueContacts.add(contact.unitId)));
            return {
                observers,
                totalObservers: observers.length,
                activeObservers: observers.filter((observer) => observer.contacts.length > 0).length,
                totalContacts: uniqueContacts.size,
                emptyMessage: "No player reconnaissance units are on station."
            };
        }
        catch (error) {
            console.warn("PopupManager: Failed to render direct recon reports.", error);
            return {
                observers: [],
                totalObservers: 0,
                activeObservers: 0,
                totalContacts: 0,
                emptyMessage: "Recon board is unavailable right now."
            };
        }
    }
    buildReconObserverView(report) {
        const label = this.formatAirUnitLabel(String(report.observerType));
        const contacts = report.contacts.map((contact) => this.buildReconContactView(contact));
        return {
            observerId: report.observerUnitId,
            label,
            shortLabel: this.buildAirUnitMonogram(String(report.observerType)),
            locationLabel: this.formatDisplayHex(report.observerHex),
            strength: Math.max(0, Math.round(report.observerStrength)),
            spottingRange: Math.max(1, Math.round(report.spottingRange)),
            sourceLabel: report.source,
            statusLabel: contacts.length > 0 ? `${contacts.length} contact${contacts.length === 1 ? "" : "s"}` : "Watching",
            statusClass: contacts.length > 0 ? "contact" : "watching",
            spriteUrl: getSpriteForScenarioType(String(report.observerType)),
            contacts
        };
    }
    buildReconContactView(contact) {
        return {
            unitId: contact.unitId,
            label: this.formatAirUnitLabel(String(contact.unitType ?? "Enemy Contact")),
            locationLabel: this.formatDisplayHex(contact.hex),
            activityLabel: this.describeReconContactActivity(contact),
            classificationLabel: this.describeReconContactClassification(contact.state),
            strengthLabel: typeof contact.strengthEstimate === "number" ? `Strength est. ${Math.max(0, Math.round(contact.strengthEstimate))}` : "Strength unknown"
        };
    }
    renderReconObserverRowMarkup(observer) {
        const visual = observer.spriteUrl
            ? `<img src="${this.escapeHtml(observer.spriteUrl)}" alt="${this.escapeHtml(observer.label)}">`
            : `<span class="recon-observer-card__fallback">${this.escapeHtml(observer.shortLabel)}</span>`;
        return `
      <article class="recon-row" data-recon-observer-id="${this.escapeHtml(observer.observerId)}">
        <div class="recon-observer-card">
          <span class="recon-observer-card__visual">${visual}</span>
          <span class="recon-observer-card__copy">
            <span class="recon-observer-card__topline">
              <span class="recon-observer-card__label">${this.escapeHtml(observer.label)}</span>
              <span class="recon-status-pill recon-status-pill--${observer.statusClass}">${this.escapeHtml(observer.statusLabel)}</span>
            </span>
            <span class="recon-observer-card__meta">
              <span class="recon-observer-stat">Strength ${this.escapeHtml(String(observer.strength))}</span>
              <span class="recon-observer-stat">At ${this.escapeHtml(observer.locationLabel)}</span>
              <span class="recon-observer-stat">Watch ${this.escapeHtml(String(observer.spottingRange))} hex</span>
            </span>
            <span class="recon-observer-card__detail">${this.escapeHtml(observer.sourceLabel)}</span>
          </span>
        </div>
        <div class="recon-target-card${observer.contacts.length === 0 ? " recon-target-card--quiet" : ""}">
          <span class="recon-target-card__eyebrow">Observation Log</span>
          <strong class="recon-target-card__title">
            ${this.escapeHtml(observer.contacts.length > 0 ? "Enemy movement observed" : "No hostile movement in sight")}
          </strong>
          ${observer.contacts.length > 0
            ? `<div class="recon-contact-list">
                ${observer.contacts.map((contact) => `
                  <div class="recon-contact-item">
                    <div class="recon-contact-item__header">
                      <strong>${this.escapeHtml(contact.label)}</strong>
                      <span class="recon-contact-pill">${this.escapeHtml(contact.locationLabel)}</span>
                      <span class="recon-contact-pill recon-contact-pill--activity">${this.escapeHtml(contact.activityLabel)}</span>
                    </div>
                    <div class="recon-contact-item__meta">
                      <span>${this.escapeHtml(contact.classificationLabel)}</span>
                      <span>${this.escapeHtml(contact.strengthLabel)}</span>
                    </div>
                  </div>
                `).join("")}
              </div>`
            : `<p class="recon-target-card__detail">This station has no confirmed enemy formations in view right now.</p>`}
        </div>
      </article>
    `;
    }
    describeReconContactActivity(contact) {
        if (contact.movedThisTurn && contact.attackedThisTurn) {
            return "Maneuvering and engaged";
        }
        if (contact.movedThisTurn) {
            return "Maneuvering";
        }
        if (contact.attackedThisTurn) {
            return "Engaged";
        }
        return "Holding";
    }
    describeReconContactClassification(state) {
        switch (state) {
            case "visible":
                return "Direct sight";
            case "identified":
                return "Tracked by recon";
            case "spotted":
            default:
                return "Spotted";
        }
    }
    /**
     * Pulls the latest recon/intel snapshot from the battle engine when available, falling back to static data otherwise.
     */
    requestReconIntelSnapshot() {
        try {
            const battleState = ensureBattleState();
            if (battleState.hasEngine()) {
                return battleState.ensureGameEngine().getReconIntelSnapshot();
            }
        }
        catch (error) {
            console.warn("PopupManager: Failed to pull recon intel snapshot from GameEngine. Using fallback.", error);
        }
        return buildFallbackReconIntelSnapshot();
    }
    /**
     * Handles broadcast events when the recon/intel pipeline publishes a fresh snapshot.
     * The handler caches the payload and re-renders the panel if it is currently visible.
     */
    onReconIntelUpdate(event) {
        const incoming = event.detail ?? this.requestReconIntelSnapshot();
        this.reconIntelSnapshot = incoming;
        if (this.activePopup === "recon") {
            this.renderReconPanel();
        }
        else if (this.activePopup === "intelligence") {
            this.renderIntelPanel();
        }
    }
    /**
     * Opens a popup by its key identifier.
     */
    openPopup(key, trigger) {
        const resolvedKey = key === "supplies" ? "logistics" : key;
        // Reserve the strategic intelligence modal for campaign-map workflows. Tactical battles
        // surface intel through the inline battle overlay instead of this shared popup route.
        if (resolvedKey === "intelligence" && !this.isCampaignScreenVisible()) {
            console.warn("PopupManager: Intelligence popup is only available on the campaign map.");
            return;
        }
        // Handle special popup types
        if (resolvedKey === "baseOperations") {
            this.openBaseOperationsPopup(resolvedKey, trigger);
            return;
        }
        if (resolvedKey === "recon") {
            this.openReconPopup(resolvedKey, trigger);
            return;
        }
        if (resolvedKey === "intelligence") {
            // The campaign drawer is the authoritative first-class intelligence surface. Route the
            // legacy global sidebar shortcut there instead of opening the tactical prototype modal.
            document.dispatchEvent(new CustomEvent("campaign:intelligence:open"));
            return;
        }
        if (resolvedKey === "airSupport") {
            this.openAirSupportPopup(resolvedKey, trigger);
            return;
        }
        // Standard popup handling
        const content = getPopupContent(resolvedKey);
        if (!content) {
            console.warn(`No content defined for popup key: ${resolvedKey}`);
            return;
        }
        this.showPopup(resolvedKey, content, trigger);
    }
    /**
     * Closes the currently active popup.
     * Handles both standard popups and the war room overlay.
     */
    closePopup() {
        if (!this.activePopup) {
            return;
        }
        // Handle war room overlay closure separately
        if (this.activePopup === "baseOperations") {
            this.warRoomOverlay?.close();
            return;
        }
        else {
            // Standard popup closure
            this.hidePopupLayer();
        }
        this.syncSidebarButtons(null);
        const trigger = this.lastTriggerButton;
        this.resetAirSupportPlannerState();
        this.intelPickMode = null;
        this.intelFeedbackMessage = "";
        this.activePopup = null;
        this.lastTriggerButton = null;
        // Restore focus to trigger button
        if (trigger) {
            trigger.focus();
        }
    }
    /**
     * Returns the currently active popup key.
     */
    getActivePopup() {
        return this.activePopup;
    }
    /**
     * Shows a standard popup with the provided content.
     */
    showPopup(key, content, trigger) {
        this.popupTitle.textContent = content.title;
        this.popupBody.innerHTML = content.body;
        this.popupDialog.dataset.popupKey = key;
        this.popupLayer.classList.remove("hidden");
        this.popupLayer.setAttribute("aria-hidden", "false");
        this.activePopup = key;
        this.lastTriggerButton = trigger ?? null;
        this.syncSidebarButtons(key);
        // Handle post-render logic for specific popups
        if (key === "armyRoster") {
            this.renderArmyRoster();
        }
        if (key === "battleRequisitions") {
            this.renderBattleRequisitionsPanel();
        }
        if (key === "generalProfile") {
            this.renderGeneralProfile();
        }
        if (key === "supplies") {
            this.renderSuppliesPanel();
        }
        if (key === "logistics") {
            this.renderLogisticsPanel();
        }
        this.popupDialog.focus();
        if (trigger) {
            this.requestSidebarMiniTutorial(key);
        }
    }
    /** Opens the Air Support panel and renders its contents (summary, mission roster, scheduler). */
    openAirSupportPopup(key, trigger) {
        const content = getPopupContent("airSupport");
        if (!content) {
            console.warn("Air Support popup content is not registered.");
            return;
        }
        this.resetAirSupportPlannerState();
        this.showPopup(key, content, trigger);
        this.renderAirSupportPanel();
    }
    /** Renders the Air Support panel summary chips, mission list, and sortie order board. */
    renderAirSupportPanel() {
        const panel = this.popupBody.querySelector("[data-air-panel]");
        if (!panel) {
            return;
        }
        let engine;
        try {
            engine = this.battleState.ensureGameEngine();
        }
        catch (error) {
            console.warn("Air Support panel: GameEngine unavailable", error);
            return;
        }
        try {
            const summary = engine.getAirSupportSummary();
            const setText = (selector, value) => {
                const element = panel.querySelector(selector);
                if (element) {
                    element.textContent = String(value);
                }
            };
            setText("[data-air-queued]", summary.queued);
            setText("[data-air-inflight]", summary.inFlight);
            setText("[data-air-resolving]", summary.resolving);
            setText("[data-air-completed]", summary.completed);
            setText("[data-air-refit]", summary.refit);
        }
        catch {
            // Keep panel resilient if the summary snapshot temporarily fails.
        }
        const list = panel.querySelector("[data-air-mission-list]");
        if (list) {
            this.renderAirMissionList(list, engine);
        }
        const refreshBtn = panel.querySelector("[data-air-refresh]");
        if (refreshBtn) {
            refreshBtn.onclick = () => this.renderAirSupportPanel();
        }
        this.renderAirSupportOrderBoard(panel, engine);
        this.syncTutorialProgressForActivePopup(ensureTutorialState().getCurrentPhase());
    }
    /** Populates the mission-kind select from engine templates. */
    populateAirMissionKind(select, engine) {
        try {
            const templates = engine.listAirMissionTemplates();
            select.innerHTML = templates.map((t) => `<option value="${t.kind}">${this.escapeHtml(t.label)}</option>`).join("");
        }
        catch {
            select.innerHTML = "";
        }
    }
    updateAirSupportBrief(panel, engine, kind, unitValue) {
        const title = panel.querySelector("[data-air-brief-title]");
        const text = panel.querySelector("[data-air-brief-text]");
        const target = panel.querySelector("[data-air-brief-target]");
        const refit = panel.querySelector("[data-air-brief-refit]");
        let template;
        try {
            template = engine.listAirMissionTemplates().find((entry) => entry.kind === kind);
        }
        catch {
            template = undefined;
        }
        if (title) {
            title.textContent = template?.label ?? "Standing Patrol Orders";
        }
        if (text) {
            text.textContent = template?.description
                ?? "Assign fighter cover, strike sorties, and emergency lifts from the sortie board.";
        }
        if (target) {
            if (kind === "airTransport") {
                target.textContent = "Drop zone required";
            }
            else if (template?.requiresFriendlyEscortTarget) {
                target.textContent = "Queued bomber required";
            }
            else if (template?.requiresTarget) {
                target.textContent = "Target hex required";
            }
            else if (kind === "airCover") {
                target.textContent = "Base CAP or selected sector";
            }
            else {
                target.textContent = "Optional assignment";
            }
        }
        if (refit) {
            let refitCopy = "Refit follows each sortie";
            const unitHex = this.parseAxialString(unitValue);
            if (unitHex) {
                try {
                    const refitTurns = engine.getAircraftRefitTurns(unitHex);
                    if (typeof refitTurns === "number") {
                        refitCopy = `${refitTurns} turn${refitTurns === 1 ? "" : "s"} of refit after sortie`;
                    }
                }
                catch {
                    // Leave default wording when the selected entry is unavailable.
                }
            }
            refit.textContent = refitCopy;
        }
    }
    /** Disables Escort mission until at least one bomber strike is scheduled for the active faction. */
    disableEscortUnlessBomberScheduled(kindSelect, engine) {
        try {
            const missions = engine.getScheduledAirMissions(this.resolveAirPlanningFaction(engine));
            const hasBomberStrike = missions.some((m) => m.kind === "strike");
            const escortOption = Array.from(kindSelect.options).find((o) => o.value === "escort");
            if (escortOption) {
                escortOption.disabled = !hasBomberStrike;
                if (!hasBomberStrike && kindSelect.value === "escort") {
                    // Nudge back to first available option when escort becomes invalid
                    const first = Array.from(kindSelect.options).find((o) => !o.disabled);
                    if (first) {
                        kindSelect.value = first.value;
                    }
                }
            }
        }
        catch { }
    }
    /** Populate player squadrons that qualify for the selected mission based on unit type AirSupportProfile roles. */
    populateEligibleSquadrons(select, engine, kind) {
        try {
            const templates = engine.listAirMissionTemplates();
            const tpl = templates.find((t) => t.kind === kind);
            const allowed = new Set((tpl?.allowedRoles ?? []));
            const mk = (ax) => `${ax.q},${ax.r}`;
            // Collect eligible aircraft from deployed units
            const deployedUnits = engine.playerUnits ?? [];
            const eligibleDeployed = deployedUnits.filter((u) => {
                const def = unitTypesSource[u.type];
                const roles = def?.airSupport?.roles ?? [];
                return Array.isArray(roles) && roles.some((r) => allowed.has(r));
            });
            // Also collect eligible aircraft from reserves (allocated in precombat)
            const reserveUnits = engine.reserveUnits ?? [];
            const eligibleReserves = reserveUnits.filter((r) => {
                const def = unitTypesSource[r.unit.type];
                const roles = def?.airSupport?.roles ?? [];
                return Array.isArray(roles) && roles.some((role) => allowed.has(role));
            });
            if (eligibleDeployed.length === 0 && eligibleReserves.length === 0) {
                select.innerHTML = `<option value="" disabled selected>No eligible squadrons</option>`;
                select.disabled = true;
                return;
            }
            select.disabled = false;
            // Build options: deployed units first, then reserves
            const options = [];
            for (const u of eligibleDeployed) {
                options.push(`<option value="${mk(u.hex)}">${this.escapeHtml(String(u.type))} — ${this.escapeHtml(this.formatDisplayHex(u.hex))}</option>`);
            }
            for (const r of eligibleReserves) {
                // Reserves use their scenario hex as identifier (consistent with lookupUnit including reserves)
                options.push(`<option value="${mk(r.unit.hex)}">${this.escapeHtml(String(r.unit.type))} (Reserve)</option>`);
            }
            select.innerHTML = options.join("");
        }
        catch {
            select.innerHTML = `<option value="" disabled selected>Unavailable</option>`;
            select.disabled = true;
        }
    }
    /** Populate targets: enemy units for strike; friendly bomber hexes for escort; optional for airCover. */
    populateTargets(select, engine, kind) {
        const mk = (ax) => `${ax.q},${ax.r}`;
        try {
            if (kind !== "airTransport" && this.airPickMode === "target") {
                this.airPickMode = null;
            }
            if (kind === "escort") {
                const missions = engine
                    .getScheduledAirMissions(this.resolveAirPlanningFaction(engine))
                    .filter((m) => m.kind === "strike");
                if (missions.length === 0) {
                    select.innerHTML = `<option value="" disabled selected>Schedule a bomber strike first</option>`;
                    select.disabled = true;
                    return;
                }
                // Include both deployed and reserve units when searching for the bomber
                const friendlies = engine.playerUnits ?? [];
                const reserveUnits = engine.reserveUnits ?? [];
                const getSquadronKey = (unit) => {
                    return unit.unitId ?? `${String(unit.type)}@${axialKey(unit.hex)}`;
                };
                const options = [];
                for (const m of missions) {
                    // Try deployed units first
                    let unit = friendlies.find((u) => getSquadronKey(u) === m.unitKey);
                    // Also check reserves for air units
                    if (!unit) {
                        const reserveEntry = reserveUnits.find((r) => getSquadronKey(r.unit) === m.unitKey);
                        unit = reserveEntry?.unit;
                    }
                    if (unit) {
                        options.push(`<option value="${mk(unit.hex)}">Bomber at ${this.escapeHtml(this.formatDisplayHex(unit.hex))} — ${this.escapeHtml(String(unit.type))}</option>`);
                        continue;
                    }
                    if (typeof m.originHexKey === "string" && m.originHexKey.length > 0) {
                        options.push(`<option value="${this.escapeHtml(m.originHexKey)}">Bomber at ${this.escapeHtml(this.formatDisplayHexKey(m.originHexKey))} — ${this.escapeHtml(String(m.unitType))}</option>`);
                    }
                }
                if (options.length === 0) {
                    select.innerHTML = `<option value="" disabled selected>No bomber position available</option>`;
                    select.disabled = true;
                    return;
                }
                select.disabled = false;
                select.innerHTML = options.join("");
                return;
            }
            // Air Cover: target is optional, add "Base CAP" as the default option.
            if (kind === "airCover") {
                const planningFaction = this.resolveAirPlanningFaction(engine);
                const targets = (planningFaction === "Player" ? engine.playerUnits : engine.botUnits) ?? [];
                const options = [];
                // Base CAP option: no target hex means the squadron covers its own base.
                options.push(`<option value="">Base CAP (cover home base)</option>`);
                // Also allow selecting specific hexes to patrol.
                for (const u of targets) {
                    options.push(`<option value="${mk(u.hex)}">Patrol over ${this.escapeHtml(this.formatDisplayHex(u.hex))} — ${this.escapeHtml(String(u.type))}</option>`);
                }
                select.disabled = false;
                select.innerHTML = options.join("");
                return;
            }
            // Air Transport: allow clicking on the map to select any hex for paratroop drop.
            // We show a "Click map to select drop zone" prompt and enable map click targeting.
            if (kind === "airTransport") {
                this.airPickMode = "target";
                select.innerHTML = `<option value="" selected>Click map to select drop zone...</option>`;
                select.disabled = false;
                // The actual target selection will be handled by the map click handler.
                return;
            }
            // Strike: list enemy targets known to the commander (all current enemy units)
            const enemies = engine.botUnits ?? [];
            if (!enemies || enemies.length === 0) {
                select.innerHTML = `<option value="" disabled selected>No enemy targets in intel</option>`;
                select.disabled = true;
                return;
            }
            select.disabled = false;
            select.innerHTML = enemies
                .map((u) => `<option value="${mk(u.hex)}">${this.escapeHtml(String(u.type))} — ${this.escapeHtml(this.formatDisplayHex(u.hex))}</option>`)
                .join("");
        }
        catch {
            select.innerHTML = `<option value="" disabled selected>Unavailable</option>`;
            select.disabled = true;
        }
    }
    resetAirSupportPlannerState() {
        this.airPickMode = null;
        this.airPlannerState.missionKind = "";
        this.airPlannerState.squadronValue = "";
        this.airPlannerState.targetValue = "";
        this.airPlannerState.targetValues = {};
        this.airPlannerState.targetSquadronId = "";
        this.airPlannerState.feedback = "";
        this.airPlannerState.feedbackTone = "neutral";
        this.airPlannerState.suspendedForMapPick = false;
        document.dispatchEvent(new CustomEvent("air:clearPreview"));
    }
    setAirPlannerFeedback(message, tone = "neutral") {
        this.airPlannerState.feedback = message;
        this.airPlannerState.feedbackTone = tone;
    }
    buildAirPlannerTargetKey(missionKind, squadronId) {
        return missionKind && squadronId ? `${missionKind}:${squadronId}` : "";
    }
    getAirPlannerTargetValue(missionKind, squadronId) {
        const key = this.buildAirPlannerTargetKey(missionKind, squadronId);
        return key ? this.airPlannerState.targetValues[key] ?? "" : "";
    }
    setAirPlannerTargetValue(missionKind, squadronId, value) {
        const key = this.buildAirPlannerTargetKey(missionKind, squadronId);
        if (!key) {
            return;
        }
        if (value) {
            this.airPlannerState.targetValues[key] = value;
        }
        else {
            delete this.airPlannerState.targetValues[key];
        }
        if (this.airPlannerState.missionKind === missionKind && this.airPlannerState.squadronValue === squadronId) {
            this.airPlannerState.targetValue = value;
        }
    }
    clearAirPlannerTargetValue(missionKind, squadronId) {
        this.setAirPlannerTargetValue(missionKind, squadronId, "");
    }
    renderAirSupportOrderBoard(panel, engine) {
        const view = this.buildAirPlannerView(engine);
        const missionTabsHost = panel.querySelector("[data-air-mission-tabs]");
        if (missionTabsHost) {
            missionTabsHost.innerHTML = view.missionTabs.map((entry) => `
        <button
          type="button"
          class="air-mission-tab"
          role="tab"
          aria-selected="${entry.template.kind === this.airPlannerState.missionKind ? "true" : "false"}"
          data-air-mission-tab="${this.escapeHtml(entry.template.kind)}"
          ${entry.disabled ? "disabled" : ""}
          ${entry.disabledReason ? `title="${this.escapeHtml(entry.disabledReason)}"` : ""}
        >
          <strong>${this.escapeHtml(entry.template.label)}</strong>
          <span>${this.escapeHtml(entry.template.description)}</span>
        </button>
      `).join("");
            missionTabsHost.querySelectorAll("[data-air-mission-tab]").forEach((button) => {
                button.onclick = () => {
                    const kind = (button.dataset.airMissionTab ?? "");
                    if (!kind || button.disabled) {
                        return;
                    }
                    this.airPlannerState.missionKind = kind;
                    this.airPickMode = null;
                    this.airPlannerState.targetSquadronId = "";
                    this.setAirPlannerFeedback("", "neutral");
                    document.dispatchEvent(new CustomEvent("air:clearPreview"));
                    this.renderAirSupportPanel();
                };
            });
        }
        const sortieBoard = panel.querySelector("[data-air-sortie-board]");
        if (sortieBoard) {
            if (view.squadronCards.length === 0) {
                sortieBoard.innerHTML = `
          <div class="air-target-card air-target-card--empty">
            <span class="air-target-card__eyebrow">Sortie Board</span>
            <strong class="air-target-card__title">No eligible wings</strong>
            <p class="air-target-card__detail">No squadron can fly this mission profile right now.</p>
          </div>
        `;
            }
            else {
                sortieBoard.innerHTML = view.squadronCards.map((card) => this.renderAirSortieRowMarkup(engine, view, card)).join("");
            }
            sortieBoard.querySelectorAll("[data-air-squadron]").forEach((button) => {
                button.onclick = () => {
                    const value = button.dataset.airSquadron ?? "";
                    const card = view.squadronCards.find((entry) => entry.value === value) ?? null;
                    if (!card || button.disabled) {
                        return;
                    }
                    this.airPlannerState.squadronValue = card.value;
                    this.airPlannerState.targetValue = this.getAirPlannerTargetValue(view.selectedMission?.kind ?? "", card.squadronId);
                    this.setAirPlannerFeedback("", "neutral");
                    this.renderAirSupportPanel();
                };
            });
            sortieBoard.querySelectorAll("[data-air-pick-target]").forEach((button) => {
                button.onclick = () => {
                    const squadronId = button.dataset.airPickTarget ?? "";
                    const squadron = view.squadronCards.find((entry) => entry.squadronId === squadronId) ?? null;
                    if (!squadron || !view.selectedMission) {
                        return;
                    }
                    this.beginAirTargetSelection(squadron, view.selectedMission);
                };
            });
            sortieBoard.querySelectorAll("[data-air-clear-target]").forEach((button) => {
                button.onclick = () => {
                    const squadronId = button.dataset.airClearTarget ?? "";
                    if (!squadronId || !view.selectedMission) {
                        return;
                    }
                    this.airPlannerState.squadronValue = squadronId;
                    this.clearAirPlannerTargetValue(view.selectedMission.kind, squadronId);
                    this.airPlannerState.targetValue = "";
                    this.setAirPlannerFeedback("", "neutral");
                    this.renderAirSupportPanel();
                };
            });
            sortieBoard.querySelectorAll("[data-air-escort-target]").forEach((button) => {
                button.onclick = () => {
                    const targetValue = button.dataset.airEscortTarget ?? "";
                    const squadronId = button.dataset.airEscortSquadron ?? "";
                    if (!targetValue || !squadronId || !view.selectedMission) {
                        return;
                    }
                    this.airPlannerState.squadronValue = squadronId;
                    this.setAirPlannerTargetValue(view.selectedMission.kind, squadronId, targetValue);
                    this.setAirPlannerFeedback("", "neutral");
                    this.renderAirSupportPanel();
                };
            });
            sortieBoard.querySelectorAll("[data-air-submit-sortie]").forEach((button) => {
                button.onclick = () => {
                    const squadronId = button.dataset.airSubmitSortie ?? "";
                    const squadron = view.squadronCards.find((entry) => entry.squadronId === squadronId) ?? null;
                    this.scheduleAirPlannerMission(engine, view.selectedMission, squadron);
                };
            });
        }
        this.updateAirSupportBriefFromPlanner(panel, view);
        this.syncAirPlannerFeedback(panel, view);
    }
    renderAirSortieRowMarkup(engine, view, card) {
        const visual = card.spriteUrl
            ? `<img src="${this.escapeHtml(card.spriteUrl)}" alt="${this.escapeHtml(card.label)}">`
            : `<span class="air-squadron-card__fallback">${this.escapeHtml(card.shortLabel)}</span>`;
        const radiusCopy = this.formatAirRadiusCopy(card);
        const refitCopy = card.refitTurns === null ? "Refit variable" : `Refit ${card.refitTurns} turn${card.refitTurns === 1 ? "" : "s"}`;
        const baseCopy = card.isReserve ? "Reserve Strip" : `Base ${card.locationLabel}`;
        return `
      <article class="air-sortie-row">
        <button
          type="button"
          class="air-squadron-card air-squadron-card--row"
          data-air-squadron="${this.escapeHtml(card.value)}"
          aria-pressed="${card.value === this.airPlannerState.squadronValue ? "true" : "false"}"
          ${card.disabled ? "disabled" : ""}
        >
          <span class="air-squadron-card__visual">${visual}</span>
          <span class="air-squadron-card__copy">
            <span class="air-squadron-card__topline">
              <span class="air-squadron-card__label">${this.escapeHtml(card.label)}</span>
              <span class="air-status-pill air-status-pill--${this.escapeHtml(card.statusClass)}">${this.escapeHtml(card.statusLabel)}</span>
            </span>
            <span class="air-squadron-card__meta">
              <span class="air-squadron-stat">Strength ${this.escapeHtml(String(card.strength))}</span>
              <span class="air-squadron-stat">${this.escapeHtml(baseCopy)}</span>
            </span>
            <span class="air-squadron-card__detail">${this.escapeHtml(card.roleLabel)}</span>
            <span class="air-squadron-card__detail air-squadron-card__detail--quiet">${this.escapeHtml(radiusCopy)} · ${this.escapeHtml(refitCopy)}</span>
          </span>
        </button>
        ${this.renderAirSortieTargetTileMarkup(engine, view, card)}
      </article>
    `;
    }
    renderAirSortieTargetTileMarkup(engine, view, card) {
        const mission = view.selectedMission;
        if (!mission) {
            return `
        <div class="air-target-card air-target-card--row">
          <span class="air-target-card__eyebrow">Target Board</span>
          <strong class="air-target-card__title">Orders unavailable</strong>
          <p class="air-target-card__detail">Mission data is unavailable until the battle engine is active.</p>
        </div>
      `;
        }
        const targetValue = this.getAirPlannerTargetValue(mission.kind, card.squadronId);
        const assignLabel = this.getAirSortieButtonLabel(mission.kind);
        if (card.disabled) {
            return `
        <div class="air-target-card air-target-card--row air-target-card--committed">
          <span class="air-target-card__eyebrow">${this.escapeHtml(card.assignmentMissionLabel ?? "Current Orders")}</span>
          <strong class="air-target-card__title">${this.escapeHtml(card.assignmentTargetLabel ?? card.statusLabel)}</strong>
          <p class="air-target-card__detail">${this.escapeHtml(card.assignmentSummary ?? "Squadron already committed to an active sortie.")}</p>
          <div class="air-target-card__footnote">Committed aircraft are managed from the operations log below.</div>
        </div>
      `;
        }
        if (mission.kind === "escort") {
            const selectedEscort = view.escortTargets.find((entry) => entry.value === targetValue) ?? null;
            const canSubmit = Boolean(selectedEscort);
            return `
        <div class="air-target-card air-target-card--row">
          <span class="air-target-card__eyebrow">Escort Board</span>
          <strong class="air-target-card__title">${this.escapeHtml(selectedEscort?.label ?? "Select Strike Package")}</strong>
          <p class="air-target-card__detail">${this.escapeHtml(selectedEscort
                ? `${selectedEscort.detail}. ${selectedEscort.meta}.`
                : view.escortTargets.length > 0
                    ? "Choose the bomber stream this escort wing will protect."
                    : "Queue a strike package first, then assign escorts to it from this board.")}</p>
          ${view.escortTargets.length > 0 ? `
            <div class="air-target-choice-grid air-target-choice-grid--row">
              ${view.escortTargets.map((entry) => `
                <button
                  type="button"
                  class="air-target-choice"
                  data-air-escort-target="${this.escapeHtml(entry.value)}"
                  data-air-escort-squadron="${this.escapeHtml(card.squadronId)}"
                  aria-pressed="${entry.value === targetValue ? "true" : "false"}"
                >
                  <span class="air-target-choice__copy">
                    <span class="air-target-choice__label">${this.escapeHtml(entry.label)}</span>
                    <span class="air-target-choice__detail">${this.escapeHtml(entry.detail)}</span>
                    <span class="air-target-choice__meta">${this.escapeHtml(entry.meta)}</span>
                  </span>
                </button>
              `).join("")}
            </div>
          ` : ""}
          <div class="air-target-actions">
            <button
              type="button"
              class="air-button primary air-button--assign"
              data-air-submit-sortie="${this.escapeHtml(card.squadronId)}"
              ${canSubmit ? "" : "disabled"}
            >${this.escapeHtml(assignLabel)}</button>
          </div>
        </div>
      `;
        }
        const targetSelected = targetValue.length > 0;
        const parsedTarget = this.parseAxialString(targetValue);
        const title = targetSelected
            ? this.describeAirTargetSelection(engine, mission.kind, targetValue)
            : mission.kind === "airCover"
                ? "Base CAP"
                : "Awaiting map mark";
        const detail = (() => {
            if (mission.kind === "airCover" && !targetSelected) {
                return "No patrol hex selected. This wing will hold base CAP over its home strip.";
            }
            if (!targetSelected) {
                return "Choose a hex on the map. The board will reopen once the target is marked.";
            }
            if (mission.kind === "airTransport") {
                return "Airborne infantry will launch from this transport wing and drop into the marked hex.";
            }
            if (mission.kind === "airCover") {
                return "Combat air patrol will center on this hex instead of remaining over the base.";
            }
            return "Strike aircraft will stage their run against the selected hex when the mission executes.";
        })();
        const pickLabel = mission.kind === "airTransport"
            ? "Choose Drop Zone"
            : mission.kind === "airCover"
                ? "Choose Patrol Hex"
                : "Choose Target";
        const canSubmit = mission.kind === "airCover" || (mission.requiresTarget ? parsedTarget !== null : true);
        return `
      <div class="air-target-card air-target-card--row">
        <span class="air-target-card__eyebrow">${this.escapeHtml(mission.kind === "airTransport" ? "Drop Zone" : "Target Board")}</span>
        <strong class="air-target-card__title">${this.escapeHtml(title)}</strong>
        <p class="air-target-card__detail">${this.escapeHtml(detail)}</p>
        <div class="air-target-actions">
          <button
            type="button"
            class="air-button"
            data-air-pick-target="${this.escapeHtml(card.squadronId)}"
          >${this.escapeHtml(pickLabel)}</button>
          ${mission.kind === "airCover"
            ? `<button type="button" class="air-button" data-air-clear-target="${this.escapeHtml(card.squadronId)}" ${targetSelected ? "" : "disabled"}>Use Base CAP</button>`
            : targetSelected
                ? `<button type="button" class="air-button" data-air-clear-target="${this.escapeHtml(card.squadronId)}">Clear Mark</button>`
                : ""}
          <button
            type="button"
            class="air-button primary air-button--assign"
            data-air-submit-sortie="${this.escapeHtml(card.squadronId)}"
            ${canSubmit ? "" : "disabled"}
          >${this.escapeHtml(assignLabel)}</button>
        </div>
      </div>
    `;
    }
    getAirSortieButtonLabel(kind) {
        switch (kind) {
            case "airCover":
                return "Assign Patrol";
            case "escort":
                return "Assign Escort";
            case "airTransport":
                return "Commit Drop";
            default:
                return "Issue Sortie";
        }
    }
    resolveAirPlanningFaction(engine) {
        // Initiative sequencing can temporarily hand activeFaction to Bot/Ally while the player still plans orders.
        if (engine.phase === "playerTurn") {
            return "Player";
        }
        return engine.activeFaction;
    }
    buildAirPlannerView(engine) {
        const missionTabs = this.buildAirMissionTabs(engine);
        const selectedMission = (() => {
            const active = missionTabs.find((entry) => entry.template.kind === this.airPlannerState.missionKind && !entry.disabled);
            if (active) {
                return active.template;
            }
            return missionTabs.find((entry) => !entry.disabled)?.template ?? missionTabs[0]?.template ?? null;
        })();
        this.airPlannerState.missionKind = selectedMission?.kind ?? "";
        const squadronCards = this.buildAirSquadronCards(engine, selectedMission);
        const firstReadySquadron = squadronCards.find((entry) => !entry.disabled) ?? squadronCards[0] ?? null;
        const selectedSquadron = squadronCards.find((entry) => entry.value === this.airPlannerState.squadronValue && !entry.disabled)
            ?? firstReadySquadron;
        this.airPlannerState.squadronValue = selectedSquadron?.value ?? "";
        this.airPlannerState.targetValue = selectedMission && selectedSquadron
            ? this.getAirPlannerTargetValue(selectedMission.kind, selectedSquadron.squadronId)
            : "";
        const escortTargets = this.buildAirEscortTargets(engine, selectedMission);
        if (this.airPickMode === "escort") {
            this.airPickMode = null;
        }
        return {
            missionTabs,
            selectedMission,
            squadronCards,
            selectedSquadron: squadronCards.find((entry) => entry.value === this.airPlannerState.squadronValue) ?? null,
            escortTargets
        };
    }
    buildAirMissionTabs(engine) {
        const planningFaction = this.resolveAirPlanningFaction(engine);
        const queuedStrikeExists = engine.getScheduledAirMissions(planningFaction).some((mission) => mission.kind === "strike" && mission.status === "queued");
        return engine.listAirMissionTemplates().map((template) => ({
            template,
            disabled: template.kind === "escort" && !queuedStrikeExists,
            disabledReason: template.kind === "escort" && !queuedStrikeExists
                ? "Queue a bomber strike first."
                : undefined
        }));
    }
    buildAirSquadronCards(engine, mission) {
        if (!mission) {
            return [];
        }
        const allowedRoles = new Set(mission.allowedRoles);
        const activeAssignments = new Map();
        const planningFaction = this.resolveAirPlanningFaction(engine);
        engine.getScheduledAirMissions(planningFaction).forEach((entry) => {
            if (entry.status !== "completed") {
                activeAssignments.set(entry.unitKey, entry);
            }
        });
        const deployedEntries = (engine.playerUnits ?? []).map((unit) => ({ unit, isReserve: false }));
        const reserveEntries = (engine.reserveUnits ?? []).map((entry) => ({ unit: entry.unit, isReserve: true }));
        return [...deployedEntries, ...reserveEntries]
            .filter(({ unit }) => {
            const roles = (unitTypesSource[String(unit.type)]?.airSupport?.roles ?? []);
            return roles.some((role) => allowedRoles.has(role));
        })
            .map(({ unit, isReserve }) => {
            const squadronId = this.resolveAirPlannerSquadronId(unit);
            const assignment = activeAssignments.get(squadronId) ?? null;
            const roleLabel = (unitTypesSource[String(unit.type)]?.airSupport?.roles ?? [])
                .map((role) => this.formatAirRoleLabel(role))
                .join(" / ");
            const refitTurns = (unitTypesSource[String(unit.type)]?.airSupport?.refitTurns ?? null);
            const statusLabel = assignment
                ? this.formatAirMissionStatusLabel(assignment.status)
                : isReserve
                    ? "Reserve"
                    : "Ready";
            const statusClass = assignment
                ? this.formatAirMissionStatusClass(assignment.status)
                : isReserve
                    ? "reserve"
                    : "ready";
            const assignmentMissionLabel = assignment ? this.formatAirMissionKindLabel(assignment.kind) : undefined;
            const assignmentTargetLabel = assignment ? this.describeScheduledAirMissionTarget(engine, assignment) : undefined;
            const assignmentSummary = assignment ? this.describeAirAssignmentSummary(assignment) : undefined;
            return {
                value: squadronId,
                squadronId,
                originValue: `${unit.hex.q},${unit.hex.r}`,
                label: this.formatAirUnitLabel(String(unit.type)),
                shortLabel: this.buildAirUnitMonogram(String(unit.type)),
                locationLabel: this.formatDisplayHex(unit.hex),
                roleLabel: roleLabel || "Air Wing",
                strength: unit.strength ?? 0,
                statusLabel,
                statusClass,
                isReserve,
                disabled: assignment !== null,
                spriteUrl: getSpriteForScenarioType(String(unit.type)),
                refitTurns,
                combatRadiusKm: (unitTypesSource[String(unit.type)]?.airSupport?.combatRadiusKm ?? null),
                combatRadiusHex: this.resolveAirPlannerRadiusHex(engine, unit, squadronId),
                assignmentMissionLabel,
                assignmentTargetLabel,
                assignmentSummary
            };
        });
    }
    buildAirEscortTargets(engine, mission) {
        if (!mission || mission.kind !== "escort") {
            return [];
        }
        return engine.getScheduledAirMissions(this.resolveAirPlanningFaction(engine))
            .filter((entry) => entry.kind === "strike" && entry.status === "queued")
            .map((entry) => {
            const origin = entry.originHexKey ?? this.resolveAirMissionOriginHex(engine, entry) ?? "";
            const target = entry.targetHex ? this.formatDisplayHex(entry.targetHex) : "Target pending";
            return {
                value: entry.unitKey,
                label: `${this.formatAirUnitLabel(entry.unitType)} Package`,
                detail: `Target ${target}`,
                meta: origin ? `Launch ${this.formatDisplayHexKey(origin)}` : "Launch strip unavailable"
            };
        })
            .filter((entry) => entry.value.length > 0);
    }
    resolveAirPlannerSquadronId(unit) {
        return unit.unitId ?? `${String(unit.type)}@${axialKey(unit.hex)}`;
    }
    resolveAirPlannerRadiusHex(engine, unit, squadronId) {
        const engineRadius = engine.getAircraftCombatRadiusHex({ q: unit.hex.q, r: unit.hex.r }, squadronId);
        if (typeof engineRadius === "number") {
            return engineRadius;
        }
        const radiusKm = unitTypesSource[String(unit.type)]?.airSupport?.combatRadiusKm;
        if (typeof radiusKm === "number") {
            return Math.max(0, Math.floor(radiusKm / 0.25));
        }
        return null;
    }
    resolveAirMissionOriginHex(engine, mission) {
        if (mission.originHexKey) {
            return mission.originHexKey;
        }
        const deployed = engine.playerUnits ?? [];
        const reserves = (engine.reserveUnits ?? []).map((entry) => entry.unit);
        const match = [...deployed, ...reserves].find((unit) => this.resolveAirPlannerSquadronId(unit) === mission.unitKey) ?? null;
        return match ? `${match.hex.q},${match.hex.r}` : null;
    }
    updateAirSupportBriefFromPlanner(panel, view) {
        const title = panel.querySelector("[data-air-brief-title]");
        const text = panel.querySelector("[data-air-brief-text]");
        if (title) {
            title.textContent = view.selectedMission?.label ?? "Standing Patrol Orders";
        }
        if (text) {
            text.textContent = view.selectedMission?.description
                ?? "Assign fighter cover, strike sorties, and emergency lifts from the sortie board.";
        }
    }
    describeAirBriefTarget(engine, view) {
        const mission = view.selectedMission;
        if (!mission) {
            return "Mission board not ready";
        }
        if (mission.kind === "escort") {
            if (!this.airPlannerState.targetValue) {
                return "Queued bomber required";
            }
            const selected = view.escortTargets.find((entry) => entry.value === this.airPlannerState.targetValue);
            return selected ? `Escort ${selected.label}` : "Queued bomber required";
        }
        if (mission.kind === "airCover" && !this.airPlannerState.targetValue) {
            return "Base CAP over home strip";
        }
        if (this.airPlannerState.targetValue) {
            return this.describeAirTargetSelection(engine, mission.kind, this.airPlannerState.targetValue);
        }
        return mission.requiresTarget ? "Awaiting map-marked target" : "Optional assignment";
    }
    renderAirTargetPanelMarkup(engine, view) {
        const mission = view.selectedMission;
        if (!mission) {
            return `
        <div class="air-target-card">
          <span class="air-target-card__eyebrow">Target Board</span>
          <strong class="air-target-card__title">Orders unavailable</strong>
          <p class="air-target-card__detail">Mission data is unavailable until the battle engine is active.</p>
        </div>
      `;
        }
        if (mission.kind === "escort") {
            if (view.escortTargets.length === 0) {
                return `
          <div class="air-target-card">
            <span class="air-target-card__eyebrow">Escort Assignment</span>
            <strong class="air-target-card__title">No strike package awaiting cover</strong>
            <p class="air-target-card__detail">Queue a bomber strike first, then assign escorts to the package from this board.</p>
          </div>
        `;
            }
            return `
        <div class="air-target-card">
          <span class="air-target-card__eyebrow">Escort Assignment</span>
          <strong class="air-target-card__title">Queued strike packages</strong>
          <p class="air-target-card__detail">Choose the bomber stream this escort wing will protect.</p>
        </div>
        <div class="air-target-choice-grid">
          ${view.escortTargets.map((entry) => `
            <button
              type="button"
              class="air-target-choice"
              data-air-escort-target="${this.escapeHtml(entry.value)}"
              aria-pressed="${entry.value === this.airPlannerState.targetValue ? "true" : "false"}"
            >
              <span class="air-target-choice__copy">
                <span class="air-target-choice__label">${this.escapeHtml(entry.label)}</span>
                <span class="air-target-choice__detail">${this.escapeHtml(entry.detail)}</span>
                <span class="air-target-choice__meta">${this.escapeHtml(entry.meta)}</span>
              </span>
            </button>
          `).join("")}
        </div>
      `;
        }
        const targetSelected = this.airPlannerState.targetValue.length > 0;
        const title = targetSelected
            ? this.describeAirTargetSelection(engine, mission.kind, this.airPlannerState.targetValue)
            : mission.kind === "airCover"
                ? "Base CAP"
                : "Awaiting map mark";
        const detail = (() => {
            if (mission.kind === "airCover" && !targetSelected) {
                return "No patrol hex selected. The squadron will orbit its home strip and intercept raids over the base.";
            }
            if (!targetSelected) {
                return "Choose a hex on the map. The order board will reopen once the target is marked.";
            }
            if (mission.kind === "airTransport") {
                return "Airborne infantry will launch from the selected transport wing and drop into this marked hex.";
            }
            if (mission.kind === "airCover") {
                return "Combat air patrol will center on this hex instead of the squadron's base.";
            }
            return "Strike aircraft will stage their run against the selected hex when the mission executes.";
        })();
        const pickLabel = mission.kind === "airTransport"
            ? "Mark Drop Zone"
            : mission.kind === "airCover"
                ? "Choose Patrol Hex"
                : "Choose Target On Map";
        return `
      <div class="air-target-card">
        <span class="air-target-card__eyebrow">${this.escapeHtml(mission.kind === "airTransport" ? "Drop Zone" : "Target Board")}</span>
        <strong class="air-target-card__title">${this.escapeHtml(title)}</strong>
        <p class="air-target-card__detail">${this.escapeHtml(detail)}</p>
        <div class="air-target-actions">
          <button type="button" class="air-button" data-air-pick-target>${this.escapeHtml(pickLabel)}</button>
          ${mission.kind === "airCover"
            ? `<button type="button" class="air-button" data-air-clear-target ${targetSelected ? "" : "disabled"}>Use Base CAP</button>`
            : targetSelected
                ? `<button type="button" class="air-button" data-air-clear-target>Clear Mark</button>`
                : ""}
        </div>
      </div>
    `;
    }
    syncAirPlannerFeedback(panel, view) {
        const note = panel.querySelector("[data-air-order-note]");
        const liveRegion = panel.querySelector("[data-air-feedback]");
        const fallback = this.describeAirPlannerFallback(view);
        const message = this.airPlannerState.feedback || fallback.message;
        const tone = this.airPlannerState.feedback ? this.airPlannerState.feedbackTone : fallback.tone;
        if (note) {
            note.textContent = message;
            note.dataset.tone = tone;
        }
        if (liveRegion) {
            liveRegion.textContent = this.airPlannerState.feedback;
        }
    }
    describeAirPlannerFallback(view) {
        const mission = view.selectedMission;
        const selectedSquadron = view.selectedSquadron;
        const targetValue = mission && selectedSquadron
            ? this.getAirPlannerTargetValue(mission.kind, selectedSquadron.squadronId)
            : "";
        if (!mission) {
            return { message: "Air planner is unavailable until the battle engine is active.", tone: "warning" };
        }
        if (!selectedSquadron) {
            return { message: "No ready squadron is available for this mission profile.", tone: "warning" };
        }
        if (mission.kind === "escort" && view.escortTargets.length === 0) {
            return { message: "Queue a bomber strike first. Escort flights only attach to queued strike packages.", tone: "warning" };
        }
        if (mission.requiresFriendlyEscortTarget && !targetValue) {
            return { message: "Choose a queued strike package from the matching aircraft tile.", tone: "warning" };
        }
        if (mission.requiresTarget && !targetValue) {
            return { message: "Mark a target from the aircraft tile before issuing this sortie.", tone: "warning" };
        }
        if (mission.kind === "airCover" && !targetValue) {
            return { message: "Without a patrol hex, assigned fighters will fly base CAP over their home strip.", tone: "neutral" };
        }
        return { message: "Use each aircraft row to pick a target and post its sortie directly from that tile.", tone: "neutral" };
    }
    scheduleAirPlannerMission(engine, mission, squadron) {
        if (!mission || !squadron) {
            this.setAirPlannerFeedback("Select a ready squadron before issuing orders.", "warning");
            this.renderAirSupportPanel();
            return;
        }
        if (squadron.disabled) {
            this.setAirPlannerFeedback("That squadron is already committed to an active sortie.", "warning");
            this.renderAirSupportPanel();
            return;
        }
        this.airPlannerState.squadronValue = squadron.value;
        const targetValue = this.getAirPlannerTargetValue(mission.kind, squadron.squadronId);
        this.airPlannerState.targetValue = targetValue;
        const unitHex = this.parseAxialString(squadron.originValue);
        if (!unitHex) {
            this.setAirPlannerFeedback("The selected squadron does not have a valid launch hex.", "warning");
            this.renderAirSupportPanel();
            return;
        }
        const request = {
            kind: mission.kind,
            faction: this.resolveAirPlanningFaction(engine),
            unitId: squadron.squadronId,
            unitHex
        };
        const parsedTarget = this.parseAxialString(targetValue);
        if (mission.requiresTarget && !parsedTarget) {
            this.setAirPlannerFeedback("Mark a target on the map before issuing this sortie.", "warning");
            this.renderAirSupportPanel();
            return;
        }
        if (mission.requiresFriendlyEscortTarget && !targetValue) {
            this.setAirPlannerFeedback("Choose the bomber package this escort wing will protect.", "warning");
            this.renderAirSupportPanel();
            return;
        }
        if ((mission.requiresTarget || mission.kind === "airCover") && parsedTarget) {
            request.targetHex = parsedTarget;
        }
        if (mission.requiresFriendlyEscortTarget) {
            request.escortTargetUnitId = targetValue;
        }
        const result = engine.tryScheduleAirMission(request);
        if (!result.ok) {
            this.setAirPlannerFeedback(result.reason, "warning");
            this.renderAirSupportPanel();
            return;
        }
        this.clearAirPlannerTargetValue(mission.kind, squadron.squadronId);
        this.airPlannerState.targetValue = "";
        this.setAirPlannerFeedback(`${this.formatAirMissionKindLabel(mission.kind)} posted to the operations log.`, "success");
        document.dispatchEvent(new CustomEvent("tutorial:airMissionQueued", {
            detail: {
                missionKind: mission.kind,
                squadronId: squadron.squadronId
            }
        }));
        this.renderAirSupportPanel();
        this.battleState.emitBattleUpdate("missionUpdated");
    }
    beginAirTargetSelection(squadron, mission) {
        if (!squadron || !mission) {
            this.setAirPlannerFeedback("Select a ready squadron before marking a target.", "warning");
            this.renderAirSupportPanel();
            return;
        }
        this.airPlannerState.squadronValue = squadron.value;
        this.airPlannerState.targetSquadronId = squadron.squadronId;
        this.airPlannerState.targetValue = this.getAirPlannerTargetValue(mission.kind, squadron.squadronId);
        const origin = this.parseAxialString(squadron.originValue);
        const radius = squadron.combatRadiusHex;
        if (origin && typeof radius === "number" && radius > 0) {
            document.dispatchEvent(new CustomEvent("air:previewRange", { detail: { origin, radius } }));
        }
        else {
            document.dispatchEvent(new CustomEvent("air:clearPreview"));
        }
        this.airPickMode = "target";
        this.airPlannerState.suspendedForMapPick = true;
        this.popupLayer.classList.add("hidden");
        this.popupLayer.setAttribute("aria-hidden", "true");
        this.setAirPlannerFeedback("Map selection in progress.", "neutral");
    }
    resumeAirSupportPopupFromMapPick() {
        if (this.activePopup !== "airSupport") {
            return;
        }
        this.airPlannerState.suspendedForMapPick = false;
        this.popupDialog.dataset.popupKey = "airSupport";
        this.popupLayer.classList.remove("hidden");
        this.popupLayer.setAttribute("aria-hidden", "false");
        this.renderAirSupportPanel();
        this.popupDialog.focus();
    }
    describeAirTargetSelection(engine, kind, value) {
        if (!value) {
            return kind === "airCover" ? "Base CAP" : "Awaiting map mark";
        }
        const target = this.parseAxialString(value);
        if (!target) {
            return value;
        }
        const displayValue = this.formatDisplayHex(target);
        if (kind === "strike") {
            const enemy = (engine.botUnits ?? []).find((unit) => unit.hex.q === target.q && unit.hex.r === target.r);
            return enemy ? `${this.formatAirUnitLabel(String(enemy.type))} @ ${displayValue}` : `Strike Hex ${displayValue}`;
        }
        if (kind === "airTransport") {
            return `Drop Zone ${displayValue}`;
        }
        const friendly = (engine.playerUnits ?? []).find((unit) => unit.hex.q === target.q && unit.hex.r === target.r);
        return friendly ? `${this.formatAirUnitLabel(String(friendly.type))} @ ${displayValue}` : `Patrol Hex ${displayValue}`;
    }
    formatAirUnitLabel(rawType) {
        return rawType
            .replace(/_/g, " ")
            .replace(/\b\w/g, (character) => character.toUpperCase());
    }
    formatAirRoleLabel(role) {
        switch (role) {
            case "cap":
                return "CAP";
            case "strike":
                return "Strike";
            case "escort":
                return "Escort";
            case "transport":
                return "Transport";
            case "recon":
                return "Recon";
            default:
                return this.formatAirUnitLabel(role);
        }
    }
    buildAirUnitMonogram(rawType) {
        return this.formatAirUnitLabel(rawType)
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map((token) => token[0])
            .join("");
    }
    resolveAirSquadronLabel(engine, squadronId) {
        if (!squadronId) {
            return "—";
        }
        const deployed = [...(engine.playerUnits ?? []), ...(engine.botUnits ?? [])];
        const reserves = (engine.reserveUnits ?? []).map((entry) => entry.unit);
        const allUnits = [...deployed, ...reserves];
        const match = allUnits.find((unit) => unit.unitId === squadronId) ?? null;
        if (!match) {
            return "Unknown squadron";
        }
        return `${this.formatAirUnitLabel(String(match.type))} @ ${this.formatDisplayHex(match.hex)}`;
    }
    describeScheduledAirMissionTarget(engine, mission) {
        if (mission.targetHex) {
            return this.describeAirTargetSelection(engine, mission.kind, `${mission.targetHex.q},${mission.targetHex.r}`);
        }
        if (mission.kind === "airCover") {
            return "Base CAP";
        }
        return this.resolveAirSquadronLabel(engine, mission.escortTargetUnitKey);
    }
    describeAirAssignmentSummary(mission) {
        switch (mission.status) {
            case "queued":
                return `Orders posted. Launch pending this turn${typeof mission.turnsRemaining === "number" ? `, ${mission.turnsRemaining} turn${mission.turnsRemaining === 1 ? "" : "s"} remaining.` : "."}`;
            case "inFlight":
                return typeof mission.turnsRemaining === "number"
                    ? `Sortie in progress. ${mission.turnsRemaining} turn${mission.turnsRemaining === 1 ? "" : "s"} remaining before recovery.`
                    : "Sortie in progress.";
            case "resolving":
                return "Strike package is executing and will recover to refit once the run is complete.";
            default:
                return "Squadron committed to an active sortie.";
        }
    }
    /** Renders the mission roster with cancel actions for queued sorties. */
    renderAirMissionList(list, engine) {
        const planningFaction = this.resolveAirPlanningFaction(engine);
        const missions = engine.getScheduledAirMissions(planningFaction).filter((mission) => mission.status !== "completed");
        if (!missions || missions.length === 0) {
            list.innerHTML = '<li class="air-mission-empty">No sorties queued. Air wings remain on standby until new orders are issued.</li>';
            return;
        }
        const compose = (m) => {
            const status = m.status;
            const kindLabel = this.formatAirMissionKindLabel(m.kind);
            const statusLabel = this.formatAirMissionStatusLabel(status);
            const target = this.describeScheduledAirMissionTarget(engine, m);
            const origin = m.originHexKey ? this.formatDisplayHexKey(m.originHexKey) : "Airbase";
            const cancel = status === "queued" ? `<button type="button" class="air-button" data-air-cancel="${m.id}">Cancel</button>` : "";
            // Build outcome display for completed missions
            let outcomeMarkup = "";
            if (status === "completed" && m.outcome) {
                const resultClass = m.outcome.result === "success" ? "air-badge--success" : m.outcome.result === "aborted" ? "air-badge--aborted" : "air-badge--partial";
                const damageText = typeof m.outcome.damageInflicted === "number" ? ` (${m.outcome.damageInflicted} dmg)` : "";
                const destroyedText = m.outcome.defenderDestroyed ? " — Target destroyed!" : "";
                outcomeMarkup = `
          <div class="air-mission-outcome">
            <span class="air-badge ${resultClass}">${this.escapeHtml(m.outcome.result.toUpperCase())}</span>
            <span class="air-outcome-details">${this.escapeHtml(m.outcome.details)}${damageText}${destroyedText}</span>
          </div>`;
            }
            return `
        <li class="air-mission-item">
          <div class="air-mission-head">
            <div class="air-mission-title">
              <strong>${this.escapeHtml(kindLabel)}</strong>
              <span class="air-mission-subtitle">${this.escapeHtml(this.formatAirUnitLabel(String(m.unitType)))}</span>
            </div>
            <span class="air-badge air-badge--${this.escapeHtml(this.formatAirMissionStatusClass(status))}">${this.escapeHtml(statusLabel)}</span>
          </div>
          <div class="air-mission-grid">
            <div class="air-mission-fact">
              <span class="air-mission-label">Origin</span>
              <strong>${this.escapeHtml(origin)}</strong>
            </div>
            <div class="air-mission-fact">
              <span class="air-mission-label">Target</span>
              <strong>${this.escapeHtml(target)}</strong>
            </div>
            <div class="air-mission-fact">
              <span class="air-mission-label">Launch Turn</span>
              <strong>${this.escapeHtml(String(m.launchTurn))}</strong>
            </div>
            <div class="air-mission-fact">
              <span class="air-mission-label">Turns Remaining</span>
              <strong>${this.escapeHtml(String(m.turnsRemaining))}</strong>
            </div>
          </div>
          <div class="air-mission-actions">
            ${cancel}
          </div>
          ${outcomeMarkup}
        </li>`;
        };
        list.innerHTML = missions.map((m) => compose(m)).join("");
        // Bind cancel buttons after render
        list.querySelectorAll("[data-air-cancel]").forEach((btn) => {
            btn.onclick = () => {
                const id = btn.getAttribute("data-air-cancel") ?? "";
                if (!id)
                    return;
                const ok = engine.cancelQueuedAirMission(id);
                if (ok) {
                    this.renderAirSupportPanel();
                    this.battleState.emitBattleUpdate("missionUpdated");
                }
            };
        });
    }
    formatAirMissionKindLabel(kind) {
        switch (kind) {
            case "strike":
                return "Strike Target";
            case "escort":
                return "Escort Sortie";
            case "airCover":
                return "Air Cover";
            case "airTransport":
                return "Air Transport";
            default:
                return kind;
        }
    }
    formatAirMissionStatusLabel(status) {
        switch (status) {
            case "inFlight":
                return "In Flight";
            case "queued":
                return "Queued";
            case "resolving":
                return "On Run";
            case "completed":
                return "Completed";
            default:
                return status;
        }
    }
    formatAirMissionStatusClass(status) {
        switch (status) {
            case "inFlight":
                return "inflight";
            case "queued":
            case "resolving":
            case "completed":
                return status;
            default:
                return status.toLowerCase();
        }
    }
    /** Parses "q,r" into an axial coordinate. Returns null when invalid. */
    parseAxialString(value) {
        if (!value)
            return null;
        const parts = value.split(",").map((s) => s.trim());
        if (parts.length !== 2)
            return null;
        const q = Number(parts[0]);
        const r = Number(parts[1]);
        if (!Number.isFinite(q) || !Number.isFinite(r))
            return null;
        return { q, r };
    }
    formatDisplayHex(hex) {
        const { col, row } = CoordinateSystem.axialToOffset(hex.q, hex.r);
        return `${col},${row}`;
    }
    formatDisplayHexKey(value) {
        if (!value) {
            return "";
        }
        const axial = this.parseAxialString(value);
        return axial ? this.formatDisplayHex(axial) : value;
    }
    formatAirRadiusCopy(card) {
        if (typeof card.combatRadiusHex !== "number" || !Number.isFinite(card.combatRadiusHex)) {
            return typeof card.combatRadiusKm === "number" ? `${card.combatRadiusKm} km range` : "Range unavailable";
        }
        if (card.combatRadiusHex >= 80) {
            return typeof card.combatRadiusKm === "number"
                ? `Theater-wide (${card.combatRadiusKm} km)`
                : "Theater-wide range";
        }
        if (typeof card.combatRadiusKm === "number") {
            return `${card.combatRadiusHex} hex / ${card.combatRadiusKm} km`;
        }
        return `${card.combatRadiusHex} hex radius`;
    }
    /** Handles map clicks when Air Support panel is in pick mode (target/escort). */
    onBattleHexClicked(event) {
        const key = event.detail?.offsetKey ?? "";
        const parts = key.split(",");
        if (parts.length !== 2) {
            this.airPickMode = null;
            this.intelPickMode = null;
            return;
        }
        const col = Number(parts[0]);
        const row = Number(parts[1]);
        if (!Number.isFinite(col) || !Number.isFinite(row)) {
            this.airPickMode = null;
            this.intelPickMode = null;
            return;
        }
        const axial = CoordinateSystem.offsetToAxial(col, row);
        const value = `${axial.q},${axial.r}`;
        if (this.activePopup === "intelligence" && this.intelPickMode === "deception") {
            try {
                const engine = this.battleState.ensureGameEngine();
                const result = engine.deployCounterIntel(axial);
                if (!result.ok) {
                    this.setIntelFeedback(result.reason);
                    return;
                }
                this.intelPickMode = null;
                this.setIntelFeedback(`Deception screen projected at ${value}. Enemy planning will now bias toward that false axis.`);
                this.refreshReconIntelSnapshot();
            }
            catch (error) {
                console.warn("PopupManager: Failed to deploy counter-intelligence.", error);
                this.setIntelFeedback("Counter-intelligence is unavailable until the battle engine is active.");
            }
            return;
        }
        if (this.activePopup !== "airSupport" || !this.airPickMode) {
            return;
        }
        const missionKind = this.airPlannerState.missionKind;
        const squadronId = this.airPlannerState.targetSquadronId || this.airPlannerState.squadronValue;
        if (missionKind && squadronId) {
            this.setAirPlannerTargetValue(missionKind, squadronId, value);
        }
        this.airPlannerState.targetValue = value;
        this.setAirPlannerFeedback(`Marked ${this.formatDisplayHexKey(value)} on the map.`, "success");
        document.dispatchEvent(new CustomEvent("air:clearPreview"));
        this.airPickMode = null;
        this.airPlannerState.targetSquadronId = "";
        if (this.airPlannerState.suspendedForMapPick) {
            this.resumeAirSupportPopupFromMapPick();
        }
        else {
            this.renderAirSupportPanel();
        }
    }
    /**
     * Opens the base operations popup (war room overlay).
     * This is a special popup that uses the WarRoomOverlay component instead of the standard popup layer.
     */
    openBaseOperationsPopup(key, trigger) {
        // Hide the standard popup layer when opening war room
        this.hidePopupLayer();
        // Set active state before opening war room
        this.activePopup = key;
        this.lastTriggerButton = trigger ?? null;
        this.syncSidebarButtons(key);
        this.warRoomOverlay?.open();
        if (trigger) {
            this.requestSidebarMiniTutorial(key);
        }
    }
    requestSidebarMiniTutorial(key) {
        document.dispatchEvent(new CustomEvent(SIDEBAR_MINI_TUTORIAL_EVENT, {
            detail: { key }
        }));
    }
    /**
     * Opens the recon popup and renders direct observation reports from player recon assets.
     */
    openReconPopup(key, trigger) {
        const content = getPopupContent("recon");
        if (!content) {
            console.warn("Recon popup content is not registered.");
            return;
        }
        this.showPopup(key, content, trigger);
        this.renderReconPanel();
    }
    /**
     * Opens the campaign intelligence popup and hydrates it with analyst briefs and alerts.
     */
    openIntelPopup(key, trigger) {
        const content = getPopupContent("intelligence");
        if (!content) {
            console.warn("Intelligence popup content is not registered.");
            return;
        }
        this.showPopup(key, content, trigger);
        this.reconIntelTimeframe = "all";
        this.reconIntelConfidence = "all";
        this.intelPickMode = null;
        this.intelFeedbackMessage = "";
        this.reconIntelSnapshot = this.requestReconIntelSnapshot();
        this.initializeIntelPanel();
    }
    /**
     * Hides the popup layer.
     */
    hidePopupLayer() {
        this.popupLayer.classList.add("hidden");
        this.popupLayer.setAttribute("aria-hidden", "true");
        delete this.popupDialog.dataset.popupKey;
    }
    isCampaignScreenVisible() {
        const campaignScreen = document.getElementById("campaignScreen");
        return campaignScreen !== null
            && !campaignScreen.classList.contains("hidden")
            && campaignScreen.getAttribute("aria-hidden") !== "true";
    }
    /**
     * Syncs sidebar button active states.
     */
    syncSidebarButtons(targetKey) {
        this.sidebarController?.syncActiveState(targetKey);
    }
    /**
     * Registers the sidebar controller so popup transitions can update active button indicators centrally.
     */
    registerSidebarController(controller) {
        this.sidebarController = controller;
        controller.syncActiveState(this.activePopup);
    }
    /**
     * Builds a roster snapshot summarizing deployed units, reserves, and exhausted allocations.
     * Pulls mirror data directly from DeploymentState so reserve counts reflect the live engine snapshot.
     */
    buildRosterSnapshot() {
        const battleSnapshot = this.pullBattleRosterSnapshot();
        if (!battleSnapshot) {
            return {
                deployed: [],
                reserves: [],
                support: [],
                exhausted: [],
                totalDeployed: 0,
                totalReserves: 0,
                totalSupport: 0
            };
        }
        const frontlineEntries = battleSnapshot.frontline.map((unit) => this.transformRosterUnit(unit, "deployed"));
        const airReserveUnits = battleSnapshot.reserves.filter((unit) => this.isAirRosterUnit(unit));
        const groundReserveUnits = battleSnapshot.reserves.filter((unit) => !this.isAirRosterUnit(unit));
        const reserveEntries = groundReserveUnits.map((unit) => this.transformRosterUnit(unit, "reserves"));
        const engineSupportEntries = battleSnapshot.support.map((unit) => this.transformRosterUnit(unit, "support"));
        const airSupportEntries = airReserveUnits.map((unit) => this.transformRosterUnit(unit, "support", "Air Support"));
        const supportEntries = [...engineSupportEntries, ...airSupportEntries];
        const totalDeployed = frontlineEntries.length;
        const totalReserves = reserveEntries.length;
        const totalSupport = supportEntries.length;
        return {
            deployed: frontlineEntries,
            reserves: reserveEntries,
            support: supportEntries,
            exhausted: battleSnapshot.casualties.map((unit) => this.transformRosterUnit(unit, "exhausted")),
            totalDeployed,
            totalReserves,
            totalSupport
        };
    }
    /**
     * Renders army roster content (placeholder).
     */
    renderArmyRoster() {
        const rosterContainer = this.popupBody.querySelector("#armyRosterContent") ?? this.popupBody;
        const snapshot = this.buildRosterSnapshot();
        rosterContainer.innerHTML = `
      <section class="army-roster-summary">
        <p>Total deployed: <strong>${snapshot.totalDeployed}</strong></p>
        <p>Reserves remaining: <strong>${snapshot.totalReserves}</strong></p>
        <p>Support units: <strong>${snapshot.totalSupport}</strong></p>
      </section>
      <section class="army-roster-actions">
        <button type="button" class="army-roster-requisition-link" data-open-battle-requisitions>
          Open Battle Requisitions
        </button>
      </section>
      <section class="army-roster-section" data-roster-section="frontline">
        <header><h4>Frontline</h4></header>
        <ul class="army-roster-list" data-roster-list="frontline"></ul>
      </section>
      <section class="army-roster-section" data-roster-section="reserves">
        <header>
          <h4>Reserves</h4>
          <p class="army-roster-note">Reserve call-ups arrive at base camp automatically during battle.</p>
        </header>
        <ul class="army-roster-list" data-roster-list="reserves"></ul>
      </section>
      <section class="army-roster-section" data-roster-section="support">
        <header><h4>Support Units</h4></header>
        <ul class="army-roster-list" data-roster-list="support"></ul>
      </section>
      <section class="army-roster-section" data-roster-section="exhausted">
        <header><h4>Exhausted</h4></header>
        <ul class="army-roster-list" data-roster-list="exhausted"></ul>
      </section>
    `;
        this.renderRosterSection(rosterContainer, "frontline", snapshot.deployed);
        this.renderRosterSection(rosterContainer, "reserves", snapshot.reserves);
        this.renderRosterSection(rosterContainer, "support", snapshot.support);
        this.renderRosterSection(rosterContainer, "exhausted", snapshot.exhausted);
        this.bindOpenBattleRequisitionButtons(rosterContainer);
        this.syncTutorialProgressForActivePopup(ensureTutorialState().getCurrentPhase());
    }
    renderBattleRequisitionsPanel() {
        const requisitionContainer = this.popupBody.querySelector("#battleRequisitionContent") ?? this.popupBody;
        const snapshot = this.pullBattleRequisitionSnapshot();
        requisitionContainer.innerHTML = this.composeBattleRequisitionMarkup(snapshot);
        this.bindBattleRequisitionControls(requisitionContainer);
    }
    composeBattleRequisitionMarkup(snapshot) {
        if (!snapshot) {
            return `
        <section class="battle-requisition-board">
          <header class="battle-requisition-board__header">
            <div>
              <h4>Battle Requisitions</h4>
              <p>Earn RP from combat and objectives once the engagement begins.</p>
            </div>
          </header>
        </section>
      `;
        }
        const pendingMarkup = snapshot.pending.length > 0
            ? snapshot.pending
                .map((entry) => `
          <li>
            <strong>${this.escapeHtml(entry.label)}</strong>
            <span>Turn ${entry.arrivalTurn}</span>
          </li>
        `)
                .join("")
            : '<li class="battle-requisition-board__empty">No pending arrivals.</li>';
        const optionsMarkup = snapshot.allowed.length > 0
            ? snapshot.allowed.map((option) => this.composeBattleRequisitionOptionMarkup(option, snapshot)).join("")
            : '<article class="battle-requisition-card battle-requisition-card--empty">No in-battle requisitions are authorized for this scenario.</article>';
        return `
      <section class="battle-requisition-board" aria-label="Battle requisitions">
        <header class="battle-requisition-board__header">
          <div>
            <h4>Battle Requisitions</h4>
            <p>Spend combat-earned RP on supply shipments, off-map fires, and reserve formations.</p>
          </div>
          <div class="battle-requisition-board__points">
            <span>Available RP</span>
            <strong>${snapshot.points}</strong>
          </div>
        </header>
        <div class="battle-requisition-board__meta">
          <span>Earned ${snapshot.earned}</span>
          <span>Spent ${snapshot.spent}</span>
          <span>Main supply ${snapshot.mainSupplyDistanceTurns} turn${snapshot.mainSupplyDistanceTurns === 1 ? "" : "s"}</span>
          <span>Transport lifts ${snapshot.availableTransportFlights}</span>
        </div>
        <div class="battle-requisition-board__options">${optionsMarkup}</div>
        <details class="battle-requisition-board__pending">
          <summary>Pending arrivals (${snapshot.pending.length})</summary>
          <ul>${pendingMarkup}</ul>
        </details>
      </section>
    `;
    }
    composeBattleRequisitionOptionMarkup(option, snapshot) {
        const formation = getFormation(option.unitKey);
        const affordable = snapshot.points >= option.cost;
        const canAirlift = option.airliftEligible && snapshot.availableTransportFlights > 0;
        const disabledReason = affordable ? "" : `Need ${option.cost} RP`;
        const categoryLabel = option.kind === "supplies" ? "Supply" : option.kind === "support" ? "Support" : "Unit";
        const description = formation?.gameplayDescription ?? "Battlefield requisition.";
        const payload = formation?.requisition.depotPayload
            ? Object.entries(formation.requisition.depotPayload)
                .map(([resource, amount]) => `${amount} ${resource}`)
                .join(" / ")
            : formation?.tacticalUnitType ?? "Off-map";
        const primaryLabel = option.requiresTransportFlight ? "Airlift" : "Request";
        const primaryUsesAirlift = option.requiresTransportFlight;
        return `
      <article class="battle-requisition-card" data-requisition-kind="${option.kind}">
        <div class="battle-requisition-card__copy">
          <span class="battle-requisition-card__eyebrow">${this.escapeHtml(categoryLabel)} · ${option.cost} RP</span>
          <strong>${this.escapeHtml(option.label)}</strong>
          <p>${this.escapeHtml(description)}</p>
          <span class="battle-requisition-card__payload">${this.escapeHtml(payload)}</span>
        </div>
        <div class="battle-requisition-card__actions">
          <button
            type="button"
            data-battle-requisition="${this.escapeHtml(option.unitKey)}"
            data-battle-requisition-airlift="${primaryUsesAirlift ? "true" : "false"}"
            ${!affordable ? "disabled" : ""}
            title="${this.escapeHtml(disabledReason || `Request ${option.label}`)}"
          >${primaryLabel}</button>
          ${option.airliftEligible && !option.requiresTransportFlight ? `
            <button
              type="button"
              data-battle-requisition="${this.escapeHtml(option.unitKey)}"
              data-battle-requisition-airlift="true"
              ${!affordable || !canAirlift ? "disabled" : ""}
              title="${this.escapeHtml(!affordable ? disabledReason : canAirlift ? `Airlift ${option.label} next turn` : "No transport lift available")}"
            >Airlift</button>
          ` : ""}
        </div>
      </article>
    `;
    }
    bindBattleRequisitionControls(container) {
        container.querySelectorAll("[data-battle-requisition]")
            .forEach((button) => {
            button.addEventListener("click", (event) => {
                event.stopPropagation();
                const unitKey = button.dataset.battleRequisition;
                if (!unitKey) {
                    return;
                }
                document.dispatchEvent(new CustomEvent("battle:requestRequisition", {
                    detail: {
                        unitKey,
                        useTransportAirlift: button.dataset.battleRequisitionAirlift === "true"
                    }
                }));
            });
        });
    }
    bindOpenBattleRequisitionButtons(container) {
        container.querySelectorAll("[data-open-battle-requisitions]")
            .forEach((button) => {
            button.addEventListener("click", (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.openPopup("battleRequisitions");
            });
        });
    }
    renderRosterSection(container, listKey, entries) {
        const list = container.querySelector(`[data-roster-list="${listKey}"]`);
        if (!list) {
            return;
        }
        if (entries.length === 0) {
            list.innerHTML = "<li class=\"army-roster-empty\">No units recorded.</li>";
            return;
        }
        const displayEntries = this.disambiguateRosterEntries(entries);
        list.innerHTML = displayEntries
            .map((entry) => this.composeRosterEntryMarkup(entry))
            .join("");
        if (listKey === "reserves") {
            // Bind click handler for the entire row (for backwards compatibility and keyboard users)
            list.querySelectorAll(".army-roster-entry.reserves-selectable")
                .forEach((element) => {
                element.addEventListener("click", (event) => {
                    // Don't trigger if clicking the deploy button directly
                    const target = event.target;
                    if (target.closest("[data-roster-deploy]")) {
                        return;
                    }
                    const unitKey = element.dataset.unitKey;
                    if (!unitKey) {
                        return;
                    }
                    document.dispatchEvent(new CustomEvent("battle:selectReserve", { detail: { unitKey } }));
                });
            });
            // Bind click handler for deploy buttons
            list.querySelectorAll("[data-roster-deploy]")
                .forEach((button) => {
                button.addEventListener("click", (event) => {
                    event.stopPropagation();
                    const unitKey = button.dataset.rosterDeploy;
                    if (!unitKey) {
                        return;
                    }
                    document.dispatchEvent(new CustomEvent("battle:selectReserve", { detail: { unitKey } }));
                });
            });
        }
    }
    disambiguateRosterEntries(entries) {
        const labelTotals = entries.reduce((totals, entry) => {
            totals.set(entry.label, (totals.get(entry.label) ?? 0) + 1);
            return totals;
        }, new Map());
        const labelSeen = new Map();
        return entries.map((entry) => {
            const total = labelTotals.get(entry.label) ?? 0;
            if (total <= 1) {
                return entry;
            }
            const index = (labelSeen.get(entry.label) ?? 0) + 1;
            labelSeen.set(entry.label, index);
            return {
                ...entry,
                label: `${entry.label} #${index}`
            };
        });
    }
    composeRosterEntryMarkup(entry) {
        const spriteMarkup = entry.sprite
            ? `<img src="${this.escapeHtml(entry.sprite)}" alt="" class="reserve-thumb" aria-hidden="true" />`
            : `<span class="reserve-thumb reserve-thumb--fallback" aria-hidden="true">${this.escapeHtml(this.extractInitials(entry.label))}</span>`;
        const fuelCopy = entry.fuel == null ? "—" : `${entry.fuel}`;
        const statusCopy = entry.status === "deployed"
            ? "Frontline"
            : entry.status === "reserves"
                ? "Reserve"
                : entry.status === "support"
                    ? (entry.supportCategory ?? "Support")
                    : "Out of action";
        const statusClass = entry.status === "deployed"
            ? "army-roster-status--frontline"
            : entry.status === "reserves"
                ? "army-roster-status--reserve"
                : entry.status === "support"
                    ? "army-roster-status--support"
                    : "army-roster-status--exhausted";
        // Present roster stats as condensed inline chips so each entry fits within a two-line layout.
        // Color-coded classes help commanders quickly identify units needing attention.
        const getStatClass = (key, value) => {
            if (typeof value === "string")
                return "";
            if (key === "STR") {
                if (value <= 25)
                    return " army-roster-stat--critical";
                if (value <= 50)
                    return " army-roster-stat--warning";
                if (value >= 90)
                    return " army-roster-stat--good";
            }
            if (key === "AMMO") {
                if (value <= 1)
                    return " army-roster-stat--critical";
                if (value <= 3)
                    return " army-roster-stat--warning";
                if (value >= 8)
                    return " army-roster-stat--good";
            }
            if (key === "FUEL" && typeof value === "number") {
                if (value <= 10)
                    return " army-roster-stat--critical";
                if (value <= 25)
                    return " army-roster-stat--warning";
                if (value >= 60)
                    return " army-roster-stat--good";
            }
            if (key === "CHARGES") {
                if (value === 0)
                    return " army-roster-stat--critical";
                if (value <= 1)
                    return " army-roster-stat--warning";
                if (value >= 3)
                    return " army-roster-stat--good";
            }
            return "";
        };
        // Off-map support assets (not Air Support) use different metrics: charges instead of standard unit stats.
        // Detect them by checking if it's a support entry with low/abnormal strength values (charges) and no fuel.
        const isOffMapSupport = entry.status === "support" && entry.supportCategory !== "Air Support" && entry.strength < 10 && entry.fuel == null;
        let statsMarkup;
        if (isOffMapSupport) {
            // Off-map support assets show charges and status only
            const chargesClass = getStatClass("CHARGES", entry.strength);
            statsMarkup = `<span class="army-roster-stat${chargesClass}"><abbr title="Charges Remaining">CHARGES</abbr><strong>${entry.strength}</strong></span>`;
        }
        else {
            // Normal units and air support show full stats
            const metrics = [
                { key: "STR", title: "Strength", value: entry.strength },
                { key: "EXP", title: "Experience", value: entry.experience },
                { key: "AMMO", title: "Ammo", value: entry.ammo },
                { key: "FUEL", title: "Fuel", value: entry.fuel ?? fuelCopy }
            ];
            statsMarkup = metrics
                .map((metric) => {
                const displayValue = metric.key === "FUEL" && entry.fuel == null ? "—" : String(metric.value);
                const statClass = getStatClass(metric.key, metric.value);
                return `<span class="army-roster-stat${statClass}"><abbr title="${this.escapeHtml(metric.title)}">${metric.key}</abbr><strong>${this.escapeHtml(displayValue)}</strong></span>`;
            })
                .join("");
        }
        const roleMarkup = entry.logisticsRole
            ? `<span class="army-roster-detail army-roster-detail--role">${this.escapeHtml(entry.logisticsRole === "repair" ? "Repair logistics" : entry.logisticsRole === "medical" ? "Medical logistics" : "Supply logistics")}</span>`
            : "";
        const personnelMarkup = entry.personnelStatus && entry.personnelStatus.total > 0
            ? `<span class="army-roster-detail" title="Personnel status">P ${entry.personnelStatus.fit}/${entry.personnelStatus.total} fit · ${entry.personnelStatus.injured} inj · ${entry.personnelStatus.wounded} wnd · ${entry.personnelStatus.severelyWounded} sev · ${entry.personnelStatus.killed} KIA · ${entry.personnelStatus.readiness ?? 0}% ready</span>`
            : "";
        const equipmentMarkup = entry.equipmentStatus && entry.equipmentStatus.total > 0
            ? `<span class="army-roster-detail" title="Vehicle and equipment status">Eq ${entry.equipmentStatus.operational}/${entry.equipmentStatus.total} op · ${entry.equipmentStatus.damaged} dmg · ${entry.equipmentStatus.disabled} dis · ${entry.equipmentStatus.destroyed} lost · ${entry.equipmentStatus.readiness ?? 0}% ready</span>`
            : "";
        const suppressionMarkup = typeof entry.suppression === "number" && entry.suppression > 0
            ? `<span class="army-roster-detail army-roster-detail--suppression">Supp ${entry.suppression}</span>`
            : "";
        const detailMarkup = [roleMarkup, personnelMarkup, equipmentMarkup, suppressionMarkup].filter(Boolean).join("");
        const selectableClass = entry.status === "reserves" ? " reserves-selectable" : "";
        // Add deploy button for reserve units
        const deployButtonMarkup = entry.status === "reserves"
            ? `<button type="button" class="roster-deploy-btn" data-roster-deploy="${this.escapeHtml(entry.unitKey)}" aria-label="Deploy ${this.escapeHtml(entry.label)} from reserves to base camp" title="Reserve call-ups arrive at base camp automatically">Deploy</button>`
            : "";
        return `
      <li class="army-roster-item">
        <div class="army-roster-entry reserve-item${selectableClass}" data-unit-key="${this.escapeHtml(entry.unitKey)}">
          <div class="reserve-visual">${spriteMarkup}</div>
          <div class="reserve-copy">
            <div class="army-roster-line">
              <strong>${this.escapeHtml(entry.label)}</strong>
              <span class="army-roster-status ${statusClass}">${this.escapeHtml(statusCopy)}</span>
            </div>
            <div class="army-roster-stats">${statsMarkup}</div>
            ${detailMarkup ? `<div class="army-roster-details">${detailMarkup}</div>` : ""}
          </div>
          ${deployButtonMarkup ? `<div class="roster-actions">${deployButtonMarkup}</div>` : ""}
        </div>
      </li>
    `;
    }
    /** Returns true when roster should refresh on a battle update. */
    shouldRefreshRosterPanel(reason) {
        return ["deploymentUpdated", "turnAdvanced", "engineInitialized", "manual"].includes(reason);
    }
    /** Returns true when battle requisitions should refresh on a battle update. */
    shouldRefreshBattleRequisitionPanel(reason) {
        return ["deploymentUpdated", "turnAdvanced", "engineInitialized", "missionUpdated", "manual"].includes(reason);
    }
    renderGeneralProfile() {
        const container = this.popupBody.querySelector("#generalProfileContent");
        if (!container) {
            return;
        }
        const profile = this.resolvePrimaryGeneral();
        const portraitElement = container.querySelector("#generalProfilePortrait");
        const summaryElement = container.querySelector("#generalProfileSummary");
        const statsElement = container.querySelector("#generalProfileStats");
        const traitsElement = container.querySelector("#generalProfileTraits");
        const directivesElement = container.querySelector("#generalProfileDirectives");
        const historyElement = container.querySelector("#generalProfileHistory");
        if (!profile) {
            this.applyGeneralPortraitFallback(portraitElement, null);
            summaryElement && (summaryElement.textContent = "No commanding officer assigned. Commission a general to unlock doctrine insights.");
            statsElement && (statsElement.innerHTML = '<div class="general-profile__empty">Command modifiers will appear after a commander is assigned.</div>');
            traitsElement && (traitsElement.innerHTML = '<li class="general-profile__empty">Command traits are unavailable without an active commander.</li>');
            directivesElement && (directivesElement.innerHTML = '<li class="general-profile__empty">Strategic directives will populate after campaign briefing.</li>');
            historyElement && (historyElement.textContent = "Service notes will display once a commissioned general accumulates operational history.");
            return;
        }
        this.applyGeneralPortraitFallback(portraitElement, profile);
        summaryElement && (summaryElement.textContent = this.composeGeneralSummary(profile));
        const commanderBenefits = this.resolveCommanderBenefits(profile);
        statsElement && (statsElement.innerHTML = this.composeGeneralStatMarkup(profile, commanderBenefits));
        traitsElement && (traitsElement.innerHTML = this.composeGeneralTraitMarkup(profile));
        directivesElement && (directivesElement.innerHTML = this.composeGeneralDirectiveMarkup(profile));
        historyElement && (historyElement.innerHTML = this.composeGeneralHistory(profile));
    }
    resolvePrimaryGeneral() {
        const battleState = ensureBattleState();
        try {
            const assigned = battleState.getAssignedCommanderProfile();
            if (assigned) {
                return assigned;
            }
        }
        catch (error) {
            console.warn("PopupManager: Unable to resolve assigned commander profile.", error);
        }
        const generals = getAllGenerals();
        return generals.length > 0 ? generals[0] : null;
    }
    applyGeneralPortraitFallback(element, profile) {
        if (!element) {
            return;
        }
        const portraitUrl = profile?.portraitUrl ?? null;
        element.style.backgroundImage = portraitUrl ? `url(${portraitUrl})` : "";
        element.style.backgroundSize = portraitUrl ? "cover" : "";
        element.textContent = "";
        if (!portraitUrl) {
            const initials = profile ? this.extractInitials(profile.identity.name) : "?";
            element.textContent = initials;
        }
    }
    composeGeneralSummary(profile) {
        const { identity } = profile;
        const parts = [];
        if (identity.rank) {
            parts.push(identity.rank);
        }
        parts.push(identity.name);
        if (identity.affiliation) {
            parts.push(`— ${identity.affiliation}`);
        }
        if (identity.commissionedAt) {
            parts.push(`(Commissioned ${this.formatDate(identity.commissionedAt)})`);
        }
        return parts.join(" ");
    }
    composeGeneralStatMarkup(profile, activeBenefits) {
        const descriptors = [
            {
                key: "accBonus",
                title: "Accuracy",
                description: "Multiplies final hit probability by the listed percentage."
            },
            {
                key: "dmgBonus",
                title: "Damage",
                description: "Boosts per-hit damage by the listed percentage."
            },
            {
                key: "moveBonus",
                title: "Mobility",
                description: "Increases movement allowance by the listed percentage."
            },
            {
                key: "supplyBonus",
                title: "Supply",
                description: "Reduces upkeep draw and out-of-supply attrition by the listed percentage."
            }
        ];
        const rosterStats = profile.stats;
        return descriptors
            .map(({ key, title, description }) => {
            const rosterValue = rosterStats[key] ?? 0;
            const activeValue = activeBenefits[key] ?? rosterValue;
            const formattedActive = this.formatModifier(activeValue);
            const deltaNote = activeValue !== rosterValue
                ? ` (Roster baseline ${this.formatModifier(rosterValue)})`
                : "";
            return `
          <div class="general-profile__benefit">
            <dt>${this.escapeHtml(`${title} Bonus`)}</dt>
            <dd>
              <span class="general-profile__benefit-value">${formattedActive}</span>
              <span class="general-profile__benefit-detail">${this.escapeHtml(description)}${this.escapeHtml(deltaNote)}</span>
            </dd>
          </div>
        `;
        })
            .join("");
    }
    /**
     * Retrieves commander modifiers from the live engine when available so the panel mirrors in-battle effects.
     * Falls back to roster stats when the engine is offline (e.g., pre-initialization) to keep copy meaningful.
     */
    resolveCommanderBenefits(profile) {
        try {
            if (this.battleState.hasEngine()) {
                const engine = this.battleState.ensureGameEngine();
                return engine.getCommanderBenefits();
            }
        }
        catch (error) {
            console.warn("PopupManager: Unable to pull commander benefits from GameEngine, using roster stats.", error);
        }
        return {
            accBonus: profile.stats.accBonus ?? 0,
            dmgBonus: profile.stats.dmgBonus ?? 0,
            moveBonus: profile.stats.moveBonus ?? 0,
            supplyBonus: profile.stats.supplyBonus ?? 0
        };
    }
    /**
     * Formats the rolling supply ledger so commanders can audit production, shipments, and upkeep drains per turn.
     */
    composeSupplyLedgerMarkup(entries) {
        if (!entries || entries.length === 0) {
            return '<li class="supplies-ledger__empty">Ledger is empty for this faction.</li>';
        }
        return entries
            .slice(0, 12)
            .map((entry) => {
            const direction = entry.delta >= 0 ? "+" : "-";
            const amount = this.formatQuantity(Math.abs(entry.delta));
            const resourceLabel = this.resolveResourceLabel(entry.type);
            const actorLabel = this.simplifySupplyLedgerReason(entry.reason);
            return `
          <li class="supplies-ledger__entry" data-supplies-ledger-entry="${entry.type}">
            <span class="supplies-ledger__delta supplies-ledger__delta--${entry.delta >= 0 ? "positive" : "negative"}">
              ${direction}${amount} ${resourceLabel}
            </span>
            <span class="supplies-ledger__reason">${this.escapeHtml(actorLabel)}</span>
            <time class="supplies-ledger__timestamp" datetime="${entry.timestamp}">Turn ${entry.turn}</time>
          </li>
        `;
        })
            .join("");
    }
    simplifySupplyLedgerReason(reason) {
        const normalized = reason.trim();
        if (normalized.length === 0) {
            return "Base Camp";
        }
        if (/^base production$/i.test(normalized)) {
            return "Base Camp";
        }
        if (/^Supply convoy (loadout|refuel)$/i.test(normalized)) {
            return "Supply Convoy";
        }
        return normalized
            .replace(/\s+depot issue$/i, "")
            .replace(/_/g, " ");
    }
    composeGeneralTraitMarkup(profile) {
        const traits = [];
        const { identity, stats } = profile;
        if (identity.schoolLabel) {
            traits.push(`${identity.schoolLabel} Graduate`);
        }
        if (identity.regionLabel) {
            traits.push(`${identity.regionLabel} Theater Veteran`);
        }
        const focusTrait = this.resolveFocusTrait(stats);
        if (focusTrait) {
            traits.push(focusTrait);
        }
        if (traits.length === 0) {
            return '<li class="general-profile__empty">Command traits will unlock after doctrine is assigned.</li>';
        }
        return traits.map((trait) => `<li>${trait}</li>`).join("");
    }
    composeGeneralDirectiveMarkup(profile) {
        const directives = [];
        const { identity, serviceRecord } = profile;
        if (identity.commissionedAt) {
            directives.push({
                heading: `Commissioned ${this.formatDate(identity.commissionedAt)}`,
                detail: "Authorized to lead frontline operations."
            });
        }
        if (serviceRecord) {
            directives.push({
                heading: "Operational Readiness",
                detail: `${serviceRecord.missionsCompleted} missions completed • ${serviceRecord.victoriesAchieved} victories`
            });
        }
        if (directives.length === 0) {
            return '<li class="general-profile__empty">No active directives recorded for this commander.</li>';
        }
        return directives
            .map((directive) => `
        <li>
          <strong>${directive.heading}</strong>
          <div class="general-profile__history">${directive.detail}</div>
        </li>
      `)
            .join("");
    }
    composeGeneralHistory(profile) {
        const parts = [];
        const { serviceRecord, identity, missionHistory } = profile;
        if (serviceRecord) {
            parts.push(`${identity.name} has led ${serviceRecord.missionsCompleted} mission${serviceRecord.missionsCompleted === 1 ? "" : "s"} with ${serviceRecord.victoriesAchieved} victory${serviceRecord.victoriesAchieved === 1 ? "" : "ies"}.`);
            parts.push(`Total units deployed: ${serviceRecord.unitsDeployed}. Total casualties: ${serviceRecord.casualtiesSustained}.`);
            // Add detailed mission history if available
            if (missionHistory && missionHistory.length > 0) {
                parts.push("\n\n<strong>Recent Operations:</strong>");
                // Show last 5 missions in reverse chronological order
                const recentMissions = missionHistory.slice(-5).reverse();
                for (const mission of recentMissions) {
                    parts.push(this.formatMissionRecord(mission));
                }
            }
        }
        else {
            parts.push("Operational history is still being compiled for this commander.");
        }
        if (identity.schoolLabel) {
            parts.push(`\n${identity.name} is a graduate of ${identity.schoolLabel}, reinforcing doctrinal discipline.`);
        }
        return parts.join(" ");
    }
    formatMissionRecord(mission) {
        const parts = [];
        const date = new Date(mission.completedAt).toLocaleDateString();
        const outcome = mission.success ? "✓ VICTORY" : "✗ DEFEAT";
        const outcomeColor = mission.success ? "#4ade80" : "#f87171";
        parts.push(`\n<div style="margin: 12px 0; padding: 12px; background: rgba(0,0,0,0.3); border-left: 3px solid ${outcomeColor}; border-radius: 4px;">`);
        parts.push(`<strong style="color: ${outcomeColor};">${outcome}</strong> • ${mission.missionTitle} • ${date}`);
        parts.push(`<br><span style="color: rgba(255,255,255,0.6); font-size: 0.85em;">${mission.turnsElapsed} turns</span>`);
        // Objectives
        const obj = mission.objectives;
        if (obj.primaryTotal > 0 || obj.secondaryTotal > 0 || obj.tertiaryTotal > 0) {
            parts.push(`<br><strong>Objectives:</strong>`);
            if (obj.primaryTotal > 0) {
                parts.push(` Primary ${obj.primaryCompleted}/${obj.primaryTotal}`);
            }
            if (obj.secondaryTotal > 0) {
                parts.push(` • Secondary ${obj.secondaryCompleted}/${obj.secondaryTotal}`);
            }
            if (obj.tertiaryTotal > 0) {
                parts.push(` • Tertiary ${obj.tertiaryCompleted}/${obj.tertiaryTotal}`);
            }
        }
        // Casualties
        const totalCasualties = mission.casualties.reduce((sum, c) => sum + c.count, 0);
        if (totalCasualties > 0) {
            const topCasualties = mission.casualties.slice(0, 3).map((c) => `${c.type} (${c.count})`).join(", ");
            parts.push(`<br><strong style="color: #f87171;">Casualties (${totalCasualties}):</strong> ${topCasualties}`);
        }
        // Enemies destroyed
        const totalDestroyed = mission.enemiesDestroyed.reduce((sum, e) => sum + e.count, 0);
        if (totalDestroyed > 0) {
            const topDestroyed = mission.enemiesDestroyed.slice(0, 3).map((e) => `${e.type} (${e.count})`).join(", ");
            parts.push(`<br><strong style="color: #4ade80;">Destroyed (${totalDestroyed}):</strong> ${topDestroyed}`);
        }
        // Ammunition
        const ammo = mission.ammunition;
        const ammoUsed = [];
        if (ammo.bombsDropped > 0)
            ammoUsed.push(`${ammo.bombsDropped} bombs`);
        if (ammo.artilleryShellsFired > 0)
            ammoUsed.push(`${ammo.artilleryShellsFired} artillery`);
        if (ammo.rocketsFired > 0)
            ammoUsed.push(`${ammo.rocketsFired} rockets`);
        if (ammoUsed.length > 0) {
            parts.push(`<br><strong>Ammunition:</strong> ${ammoUsed.join(", ")}`);
        }
        parts.push(`</div>`);
        return parts.join("");
    }
    resolveFocusTrait(stats) {
        const statEntries = [
            { key: "accBonus", label: "Marksman Doctrine" },
            { key: "dmgBonus", label: "Shock Assault Planner" },
            { key: "moveBonus", label: "Rapid Maneuver Expert" },
            { key: "supplyBonus", label: "Logistics Savant" }
        ];
        const strongest = statEntries.reduce((current, entry) => {
            const value = stats[entry.key];
            if (!current || value > current.value) {
                return { label: entry.label, value };
            }
            return current;
        }, null);
        if (!strongest || strongest.value === 0) {
            return null;
        }
        return `${strongest.label} (${this.formatModifier(strongest.value)})`;
    }
    formatModifier(value) {
        const sign = value >= 0 ? "+" : "";
        const display = Number.isInteger(value) ? value.toString() : value.toFixed(1);
        return `${sign}${display}%`;
    }
    /**
     * Formats scalar supply quantities with two decimal precision for consistent presentation.
     */
    formatQuantity(value) {
        if (!Number.isFinite(value)) {
            return "0.00";
        }
        const formatted = value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return formatted;
    }
    /**
     * Formats per-turn deltas with explicit sign so commanders can quickly discern gains vs. losses.
     */
    formatDelta(value) {
        if (!Number.isFinite(value)) {
            return "0.00";
        }
        if (Math.abs(value) < 0.005) {
            return "0.00";
        }
        const sign = value > 0 ? "+" : value < 0 ? "-" : "";
        const magnitude = Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        return sign ? `${sign}${magnitude}` : magnitude;
    }
    extractInitials(name) {
        return name
            .split(" ")
            .filter((part) => part.length > 0)
            .slice(0, 2)
            .map((part) => part[0].toUpperCase())
            .join("")
            .padEnd(2, "?")
            .slice(0, 2);
    }
    formatDate(value) {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) {
            return value;
        }
        return date.toLocaleDateString(undefined, { year: "numeric", month: "short" });
    }
    escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text;
        return div.innerHTML;
    }
    isAirRosterUnit(unit) {
        const def = unitTypesSource[unit.unitType];
        return def?.moveType === "air";
    }
    transformRosterUnit(unit, status, supportCategory) {
        return {
            unitKey: unit.unitKey ?? unit.unitId,
            label: unit.label,
            strength: Math.max(0, Math.round(unit.strength)),
            experience: Math.max(0, Math.round(unit.experience)),
            ammo: Math.max(0, unit.ammo),
            fuel: unit.fuel === null ? null : Math.max(0, unit.fuel),
            status,
            supportCategory,
            personnelStatus: unit.statusSummary?.personnel,
            equipmentStatus: unit.statusSummary?.equipment,
            suppression: unit.statusSummary?.suppression,
            logisticsRole: unit.logisticsRole ?? null,
            sprite: unit.sprite
        };
    }
    pullBattleRosterSnapshot() {
        try {
            return this.battleState.getRosterSnapshot();
        }
        catch (error) {
            console.warn("PopupManager: Unable to retrieve battle roster snapshot.", error);
            return null;
        }
    }
    pullBattleRequisitionSnapshot() {
        try {
            if (!this.battleState.hasEngine()) {
                return null;
            }
            return this.battleState.ensureGameEngine().getBattleRequisitionSnapshot();
        }
        catch (error) {
            console.warn("PopupManager: Unable to retrieve battle requisition snapshot.", error);
            return null;
        }
    }
    shouldRefreshSuppliesPanel(reason) {
        return ["engineInitialized", "turnAdvanced", "deploymentUpdated", "allocationsUpdated", "missionUpdated"].includes(reason);
    }
    renderSuppliesPanel() {
        const panel = this.popupBody.querySelector("#suppliesPanel");
        if (!panel) {
            return;
        }
        const overviewTarget = panel.querySelector("[data-supplies-overview]");
        const categoryGrid = panel.querySelector("[data-supplies-category-grid]");
        const alertsList = panel.querySelector("[data-supplies-alerts]");
        const trendTarget = panel.querySelector("[data-supplies-trend]");
        const controls = panel.querySelector('[data-supplies-faction-controls]');
        const ledgerList = panel.querySelector('[data-supplies-ledger]');
        if (!overviewTarget || !categoryGrid || !alertsList || !trendTarget) {
            return;
        }
        // Fetch both ledgers so the toggle can instantly switch between Player and Bot views.
        const playerSnapshot = this.pullSupplySnapshot("Player");
        const botSnapshot = this.pullSupplySnapshot("Bot");
        const allySnapshot = this.pullSupplySnapshot("Ally");
        const availability = {
            Player: Boolean(playerSnapshot),
            Bot: Boolean(botSnapshot),
            Ally: Boolean(allySnapshot)
        };
        if (controls) {
            this.bindSupplyFactionControls(controls);
            this.syncSupplyFactionControls(controls, availability);
        }
        const resolvedSnapshot = this.activeSupplyFaction === "Bot" ? botSnapshot : playerSnapshot;
        const snapshot = resolvedSnapshot ?? null;
        if (!snapshot) {
            const message = this.activeSupplyFaction === "Bot"
                ? "Enemy supply estimates require additional recon before they can be charted."
                : "Supply data becomes available once the battle engine initializes.";
            overviewTarget.innerHTML = `<p class="supplies-panel__empty">${this.escapeHtml(message)}</p>`;
            categoryGrid.innerHTML = "";
            alertsList.innerHTML = `<li class="supplies-alerts__empty">No alerts reported.</li>`;
            trendTarget.innerHTML = "";
            if (ledgerList) {
                ledgerList.innerHTML = '<li class="supplies-ledger__empty">Ledger data is unavailable.</li>';
            }
            return;
        }
        overviewTarget.innerHTML = this.composeSuppliesOverview(snapshot);
        categoryGrid.innerHTML = snapshot.categories.map((category) => this.composeSupplyCategoryCard(category)).join("");
        alertsList.innerHTML = this.composeSupplyAlertsMarkup(snapshot.alerts);
        trendTarget.innerHTML = this.composeSupplyTrendMarkup(snapshot.categories);
        if (ledgerList) {
            // Ledger container ships with the refreshed supplies popup; skip gracefully when legacy markup omits it.
            ledgerList.innerHTML = this.composeSupplyLedgerMarkup(snapshot.ledger);
        }
    }
    /**
     * Retrieves the most recent supply snapshot for the requested faction, falling back to the engine when caches are empty.
     */
    pullSupplySnapshot(faction) {
        try {
            const cachedSnapshot = this.battleState.getSupplySnapshot(faction);
            if (cachedSnapshot) {
                return cachedSnapshot;
            }
            // If the cache has not been seeded yet but the engine is live, pull directly to avoid placeholder copy lingering.
            if (this.battleState.hasEngine()) {
                const engineSnapshot = this.battleState.ensureGameEngine().getSupplySnapshot(faction);
                return engineSnapshot;
            }
        }
        catch (error) {
            console.warn("PopupManager: Failed to retrieve supply snapshot.", error);
            return null;
        }
        return null;
    }
    composeSuppliesOverview(snapshot) {
        return `
      <div class="supplies-overview">
        <div class="supplies-overview__hero">
          <article class="supplies-overview__metric">
            <span>Turn</span>
            <strong>${snapshot.turn}</strong>
            <small>${this.escapeHtml(snapshot.phase)}</small>
          </article>
          <article class="supplies-overview__metric">
            <span>Resupply Tick</span>
            <strong>${supplyBalance.resupply.ammo}/${supplyBalance.resupply.fuel}</strong>
            <small>ammo / fuel to connected units</small>
          </article>
          <article class="supplies-overview__metric">
            <span>Supply Reach</span>
            <strong>${supplyBalance.roadRange}/${supplyBalance.offroadRange}</strong>
            <small>road / rough hexes</small>
          </article>
          <article class="supplies-overview__metric">
            <span>Last Updated</span>
            <strong>${this.formatDate(snapshot.updatedAt)}</strong>
            <small>live ledger snapshot</small>
          </article>
        </div>
        <div class="supplies-overview__stock">
          <span class="supplies-overview__stock-item"><strong>Depot Ammo</strong> ${this.formatQuantity(snapshot.stockpile?.ammo ?? 0)}</span>
          <span class="supplies-overview__stock-item"><strong>Depot Fuel</strong> ${this.formatQuantity(snapshot.stockpile?.fuel ?? 0)}</span>
          <span class="supplies-overview__stock-item"><strong>Rations</strong> ${this.formatQuantity(snapshot.stockpile?.rations ?? 0)}</span>
          <span class="supplies-overview__stock-item"><strong>Parts</strong> ${this.formatQuantity(snapshot.stockpile?.parts ?? 0)}</span>
        </div>
        <div class="supplies-overview__brief">
          <p class="supplies-overview__headline">Units fight from carried stocks. Connected formations draw abstract convoy resupply from the depot each turn.</p>
          <ul class="supplies-overview__rules">
            <li>Base Camp and HQ project the supply network out to the current road and rough range limits.</li>
            <li>Ground attacks spend onboard ammo. Motorized movement spends onboard fuel; infantry leg movement does not.</li>
            <li>Cut-off units stop receiving resupply and begin losing ammo, fuel, entrenchment, and eventually strength.</li>
          </ul>
        </div>
      </div>
    `;
    }
    composeSupplyCategoryCard(category) {
        const { resource, label, total, frontlineTotal, reserveTotal, stockpileTotal, averagePerUnit, consumptionPerTurn, estimatedDepletionTurns, status } = category;
        const statusLabel = status === "unknown" ? "Data Pending" : status.toUpperCase();
        const depletionCopy = estimatedDepletionTurns !== null ? `${estimatedDepletionTurns} turn${estimatedDepletionTurns === 1 ? "" : "s"}` : "N/A";
        const formattedDelta = this.formatDelta(consumptionPerTurn);
        const overallTotal = total + stockpileTotal;
        // Highlight how stock is distributed so commanders can quickly spot imbalances between frontline and reserve pools.
        const gaugeMarkup = this.composeSupplyGauge(frontlineTotal, reserveTotal, stockpileTotal, total);
        return `
      <article class="supplies-card" data-supplies-resource="${resource}">
        <header class="supplies-card__header">
          <div>
            <h4>${label}</h4>
            <p class="supplies-card__subhead">Carried ${this.formatQuantity(total)} · Depot ${this.formatQuantity(stockpileTotal)}</p>
          </div>
          <span class="supplies-card__status supplies-card__status--${status}">${statusLabel}</span>
        </header>
        <div class="supplies-card__total-row">
          <strong class="supplies-card__overall">${this.formatQuantity(overallTotal)}</strong>
          <span class="supplies-card__overall-label">overall stock</span>
        </div>
        ${gaugeMarkup}
        <dl class="supplies-card__metrics">
          <div><dt>Frontline</dt><dd>${this.formatQuantity(frontlineTotal)}</dd></div>
          <div><dt>Reserves</dt><dd>${this.formatQuantity(reserveTotal)}</dd></div>
          <div><dt>Depot</dt><dd>${this.formatQuantity(stockpileTotal)}</dd></div>
          <div><dt>Issued / Unit</dt><dd>${this.formatQuantity(averagePerUnit)}</dd></div>
          <div><dt>Burn / Turn</dt><dd>${formattedDelta}</dd></div>
          <div><dt>Outlook</dt><dd>${depletionCopy}</dd></div>
        </dl>
        <p class="supplies-card__footer">${resource === "ammo"
            ? "Ammo must be on the unit to fire."
            : resource === "fuel"
                ? "Fuel must be on the unit to move."
                : "Tracking pending implementation."}</p>
      </article>
    `;
    }
    /**
     * Renders a compact summary of depot stock so commanders can contrast unit-held supplies with logistics reserves.
     */
    composeStockpileSection(stockpileTotal, resource) {
        const safeTotal = Math.max(0, Number(stockpileTotal));
        const label = this.resolveResourceLabel(resource);
        const description = safeTotal > 0
            ? `${this.formatQuantity(safeTotal)} stored in depots`
            : "No depot reserves recorded";
        return `
      <p class="supplies-card__stockpile" aria-label="${label} depot stock">
        <strong>Depot:</strong> ${description}
      </p>
    `;
    }
    /**
     * Builds a small stacked gauge showing how supply totals split between frontline and reserve forces to surface imbalances.
     */
    composeSupplyGauge(frontlineTotal, reserveTotal, stockpileTotal, total) {
        // Aggregate depot stock with unit-held totals so the gauge communicates the full logistics picture.
        const overall = Math.max(total + stockpileTotal, 0);
        if (overall === 0) {
            return `
        <div class="supplies-card__gauge" role="img" aria-label="No recorded stock levels">
          <span class="supplies-card__gauge-bar supplies-card__gauge-bar--empty" style="width: 100%"></span>
        </div>
        <p class="supplies-card__gauge-legend">Frontline 0% · Reserves 0% · Depot 0%</p>
      `;
        }
        const frontlinePercent = Math.min(100, Math.max(0, Math.round((frontlineTotal / overall) * 100)));
        const reservePercent = Math.min(100 - frontlinePercent, Math.max(0, Math.round((reserveTotal / overall) * 100)));
        const depotPercent = Math.min(100 - frontlinePercent - reservePercent, Math.max(0, Math.round((stockpileTotal / overall) * 100)));
        const bufferPercent = Math.max(0, 100 - frontlinePercent - reservePercent - depotPercent);
        const ariaLabelParts = [`Frontline ${frontlinePercent}%`, `Reserves ${reservePercent}%`];
        if (depotPercent > 0) {
            ariaLabelParts.push(`Depot ${depotPercent}%`);
        }
        if (bufferPercent > 0) {
            ariaLabelParts.push(`Unallocated ${bufferPercent}%`);
        }
        const ariaLabel = ariaLabelParts.join(" · ");
        return `
      <div class="supplies-card__gauge" role="img" aria-label="${ariaLabel}">
        <span class="supplies-card__gauge-bar supplies-card__gauge-bar--frontline" style="width: ${frontlinePercent}%"></span>
        <span class="supplies-card__gauge-bar supplies-card__gauge-bar--reserve" style="width: ${reservePercent}%"></span>
        ${depotPercent > 0 ? `<span class="supplies-card__gauge-bar supplies-card__gauge-bar--depot" style="width: ${depotPercent}%"></span>` : ""}
        ${bufferPercent > 0 ? `<span class="supplies-card__gauge-bar supplies-card__gauge-bar--buffer" style="width: ${bufferPercent}%"></span>` : ""}
      </div>
      <p class="supplies-card__gauge-legend">${ariaLabel}</p>
    `;
    }
    composeSupplyAlertsMarkup(alerts) {
        if (alerts.length === 0) {
            return '<li class="supplies-alerts__empty">No alerts reported.</li>';
        }
        return alerts
            .map((alert) => `
        <li class="supplies-alerts__item supplies-alerts__item--${alert.level}" data-supplies-alert="${alert.resource}">
          <strong>${this.resolveResourceLabel(alert.resource)}:</strong> ${alert.message}
        </li>
      `)
            .join("");
    }
    composeSupplyTrendMarkup(categories) {
        return categories
            .map((category) => {
            const trendPoints = category.trend
                .map((value) => `<span>${this.formatQuantity(value)}</span>`)
                .join("");
            return `
          <section class="supplies-trend__series" data-supplies-trend-resource="${category.resource}">
            <header>
              <h5>${category.label}</h5>
            </header>
            <div class="supplies-trend__points">${trendPoints}</div>
          </section>
        `;
        })
            .join("");
    }
    resolveResourceLabel(resource) {
        switch (resource) {
            case "ammo":
                return "Ammunition";
            case "fuel":
                return "Fuel";
            case "medical":
                return "Medical";
            case "emergency":
                return "Emergency";
            default:
                return resource;
        }
    }
    /** Returns true when logistics should refresh on a battle update. */
    shouldRefreshLogisticsPanel(reason) {
        return ["engineInitialized", "turnAdvanced", "deploymentUpdated", "missionUpdated"].includes(reason);
    }
    /**
     * Renders the combined Logistics panel: depot stock, supply status, convoy routing, and delivery priorities.
     */
    renderLogisticsPanel() {
        const panel = this.popupBody.querySelector("#logisticsPanel");
        if (!panel) {
            return;
        }
        const snapshot = this.pullLogisticsSnapshot();
        const supplySnapshot = this.pullSupplySnapshot("Player");
        if (!snapshot) {
            const emptyMessage = `<div class="logistics-panel__empty">Logistics data becomes available once the battle engine initializes and units are deployed.</div>`;
            panel.querySelectorAll("[data-logistics-overview], [data-logistics-info], [data-logistics-supply-categories], [data-logistics-priorities], [data-logistics-care-teams], [data-logistics-care], [data-logistics-convoys], [data-logistics-ledger]")
                .forEach((container) => { container.innerHTML = emptyMessage; });
            const alertsStrip = panel.querySelector("[data-logistics-alerts]");
            if (alertsStrip) {
                alertsStrip.hidden = true;
                alertsStrip.innerHTML = "";
            }
            return;
        }
        const alertsContainer = panel.querySelector("[data-logistics-alerts]");
        const overviewContainer = panel.querySelector("[data-logistics-overview]");
        const infoContainer = panel.querySelector("[data-logistics-info]");
        const supplyCategoriesContainer = panel.querySelector("[data-logistics-supply-categories]");
        const prioritiesContainer = panel.querySelector("[data-logistics-priorities]");
        const careTeamsContainer = panel.querySelector("[data-logistics-care-teams]");
        const careContainer = panel.querySelector("[data-logistics-care]");
        const convoysContainer = panel.querySelector("[data-logistics-convoys]");
        const ledgerContainer = panel.querySelector("[data-logistics-ledger]");
        if (alertsContainer) {
            const alertMarkup = this.composeLogisticsAlertTiles(snapshot, supplySnapshot);
            alertsContainer.hidden = alertMarkup.length === 0;
            alertsContainer.innerHTML = alertMarkup;
        }
        if (overviewContainer) {
            overviewContainer.innerHTML = this.composeLogisticsOverview(snapshot, supplySnapshot);
        }
        if (infoContainer) {
            infoContainer.innerHTML = this.composeLogisticsInfoMarkup();
        }
        if (supplyCategoriesContainer) {
            supplyCategoriesContainer.innerHTML = this.composeLogisticsSupplyStatusMarkup(snapshot, supplySnapshot);
        }
        if (prioritiesContainer) {
            prioritiesContainer.innerHTML = snapshot.priorityTargets.length === 0
                ? '<div class="logistics-panel__empty">No frontline unit is currently requesting ammo or fuel.</div>'
                : snapshot.priorityTargets.map((entry) => this.composePriorityItem(entry)).join("");
        }
        if (careTeamsContainer) {
            careTeamsContainer.innerHTML = snapshot.supportTeamStatuses.length === 0
                ? '<li class="logistics-panel__empty">No medical or repair teams deployed.</li>'
                : snapshot.supportTeamStatuses.map((entry) => this.composeSupportTeamItem(entry)).join("");
        }
        if (careContainer) {
            careContainer.innerHTML = snapshot.careTargets.length === 0
                ? '<li class="logistics-panel__empty">No personnel treatment or equipment repair requests.</li>'
                : snapshot.careTargets.map((entry) => this.composeCareItem(entry)).join("");
        }
        if (convoysContainer) {
            convoysContainer.innerHTML = snapshot.convoyStatuses.length === 0
                ? '<li class="logistics-panel__empty">No active convoys.</li>'
                : snapshot.convoyStatuses.map((convoy) => this.composeConvoyItem(convoy)).join("");
        }
        if (ledgerContainer) {
            ledgerContainer.innerHTML = supplySnapshot
                ? this.composeSupplyLedgerMarkup(supplySnapshot.ledger)
                : '<li class="supplies-ledger__empty">Ledger data is unavailable.</li>';
        }
        this.bindLogisticsPriorityControls(panel);
        this.syncTutorialProgressForActivePopup(ensureTutorialState().getCurrentPhase());
    }
    /**
     * Retrieves the logistics snapshot from the game engine.
     */
    pullLogisticsSnapshot() {
        try {
            if (this.battleState.hasEngine()) {
                return this.battleState.ensureGameEngine().getLogisticsSnapshot();
            }
        }
        catch (error) {
            console.warn("PopupManager: Failed to retrieve logistics snapshot.", error);
            return null;
        }
        return null;
    }
    /** Summarizes the current logistics model so the panel explains what the numbers mean and what the player can do. */
    composeLogisticsOverview(snapshot, supplySnapshot) {
        const phaseLabel = this.formatBattlePhaseLabel(supplySnapshot?.phase ?? "playerTurn");
        const categories = this.selectLogisticsResourceCategories(supplySnapshot);
        const ammoCategory = categories.find((category) => category.resource === "ammo");
        const fuelCategory = categories.find((category) => category.resource === "fuel");
        const theaterAmmo = (ammoCategory?.total ?? 0) + snapshot.convoyCargo.ammo + snapshot.depotStock.ammo;
        const theaterFuel = (fuelCategory?.total ?? 0) + snapshot.convoyCargo.fuel + snapshot.depotStock.fuel;
        return `
      <div class="logistics-summary">
        <span class="logistics-summary__chip"><strong>Turn</strong> ${snapshot.turn} · ${this.escapeHtml(phaseLabel)}</span>
        <span class="logistics-summary__chip"><strong>Ammo</strong> ${this.formatQuantity(theaterAmmo)} total</span>
        <span class="logistics-summary__chip"><strong>Fuel</strong> ${this.formatQuantity(theaterFuel)} total</span>
        <span class="logistics-summary__chip"><strong>Convoys</strong> ${snapshot.convoyUnits} active · ${snapshot.loadedConvoys} loaded</span>
        <span class="logistics-summary__chip"><strong>Recovery</strong> ${snapshot.supportTeamStatuses.length} teams · ${snapshot.careTargets.length} requests</span>
        <span class="logistics-summary__chip"><strong>Queue</strong> ${snapshot.priorityTargets.length} waiting</span>
        <span class="logistics-summary__chip"><strong>Network</strong> ${snapshot.connectedUnits} supplied · ${snapshot.isolatedUnits} cut off</span>
      </div>
    `;
    }
    composeLogisticsInfoMarkup() {
        return `
      <details class="logistics-info">
        <summary>How Supply Works</summary>
        <div class="logistics-info__body">
          <p>Base Camp is the only depot source. Units on the base hex or an adjacent hex can refill there; everything farther forward waits on automated convoy service.</p>
          <ul class="logistics-info__rules">
            <li>Convoys are live map units. They reload at Base Camp, move forward, unload, then return for the next run.</li>
            <li>Each convoy carries up to ${supplyBalance.convoy.ammoCapacity} ammo and ${supplyBalance.convoy.fuelCapacity} fuel.</li>
            <li>Ground attacks spend carried ammo. Motorized movement spends carried fuel. Foot infantry movement does not.</li>
            <li>Medical and repair teams use detailed unit status pools to treat wounded personnel and restore damaged or disabled equipment.</li>
          </ul>
        </div>
      </details>
    `;
    }
    composeLogisticsAlertTiles(snapshot, supplySnapshot) {
        const categories = this.selectLogisticsResourceCategories(supplySnapshot);
        const tiles = categories.flatMap((category) => {
            const depotTotal = category.resource === "ammo" ? snapshot.depotStock.ammo : snapshot.depotStock.fuel;
            const convoyTotal = category.resource === "ammo" ? snapshot.convoyCargo.ammo : snapshot.convoyCargo.fuel;
            const shouldWarn = snapshot.deployedUnits > 0 && (category.status !== "stable" || depotTotal <= 0);
            if (!shouldWarn) {
                return [];
            }
            const level = depotTotal <= 0 && convoyTotal <= 0 ? "critical" : category.status === "critical" ? "critical" : "warning";
            const title = category.resource === "ammo"
                ? (level === "critical" ? "Ammo Critical" : "Low Ammo")
                : (level === "critical" ? "Fuel Critical" : "Low Fuel");
            return [`
        <article class="logistics-alert-chip logistics-alert-chip--${level}">
          <strong>${title}</strong>
          <span>Depot ${this.formatQuantity(depotTotal)} · Convoys ${this.formatQuantity(convoyTotal)}</span>
        </article>
      `];
        });
        return tiles.join("");
    }
    composeLogisticsSupplyStatusMarkup(snapshot, supplySnapshot) {
        const categories = this.selectLogisticsResourceCategories(supplySnapshot);
        if (categories.length === 0) {
            return '<div class="logistics-panel__empty">Supply status will populate once the live ledger is available.</div>';
        }
        return categories.map((category) => this.composeLogisticsResourceCard(category, snapshot)).join("");
    }
    composeLogisticsResourceCard(category, snapshot) {
        const resourceName = category.resource === "ammo" ? "Ammo" : "Fuel";
        const depotTotal = category.resource === "ammo" ? snapshot.depotStock.ammo : snapshot.depotStock.fuel;
        const convoyTotal = category.resource === "ammo" ? snapshot.convoyCargo.ammo : snapshot.convoyCargo.fuel;
        const unitTotal = category.total;
        const theaterTotal = unitTotal + convoyTotal + depotTotal;
        const burnRate = Math.max(0, category.consumptionPerTurn);
        const theaterOutlook = burnRate > 0
            ? Math.max(1, Math.ceil(theaterTotal / burnRate))
            : category.estimatedDepletionTurns;
        const statusLabel = category.status === "stable"
            ? "Ready"
            : category.status === "warning"
                ? "Low"
                : category.status === "critical"
                    ? "Critical"
                    : "Pending";
        return `
      <article class="logistics-resource-card" data-logistics-resource="${category.resource}">
        <header class="logistics-resource-card__header">
          <div>
            <h4>${resourceName}</h4>
            <p>${this.formatQuantity(theaterTotal)} total in theater</p>
          </div>
          <span class="supplies-card__status supplies-card__status--${category.status}">${statusLabel}</span>
        </header>
        <dl class="logistics-resource-card__metrics">
          <div><dt>On Units</dt><dd>${this.formatQuantity(unitTotal)}</dd></div>
          <div><dt>On Convoys</dt><dd>${this.formatQuantity(convoyTotal)}</dd></div>
          <div><dt>Depot</dt><dd>${this.formatQuantity(depotTotal)}</dd></div>
          <div><dt>Burn / Turn</dt><dd>${this.formatDelta(category.consumptionPerTurn)}</dd></div>
          <div><dt>Outlook</dt><dd>${theaterOutlook === null ? (theaterTotal > 0 ? "Holding" : "Empty") : `${theaterOutlook} turns`}</dd></div>
        </dl>
        ${this.composeLogisticsResourceGauge(unitTotal, convoyTotal, depotTotal)}
        <p class="logistics-resource-card__note">${category.resource === "ammo"
            ? "Battalions need carried ammo to fire. Convoys move ammo forward from Base Camp."
            : "Motor formations need carried fuel to move. Foot infantry do not spend fuel."}</p>
      </article>
    `;
    }
    composeLogisticsResourceGauge(unitTotal, convoyTotal, depotTotal) {
        const theaterTotal = Math.max(0, unitTotal + convoyTotal + depotTotal);
        if (theaterTotal <= 0) {
            return `
        <div class="logistics-resource-card__gauge" role="img" aria-label="No stock recorded">
          <span class="logistics-resource-card__gauge-bar logistics-resource-card__gauge-bar--empty" style="width: 100%"></span>
        </div>
      `;
        }
        const unitPercent = Math.max(0, Math.min(100, (unitTotal / theaterTotal) * 100));
        const convoyPercent = Math.max(0, Math.min(100 - unitPercent, (convoyTotal / theaterTotal) * 100));
        const depotPercent = Math.max(0, 100 - unitPercent - convoyPercent);
        const label = `Units ${Math.round(unitPercent)}%, convoys ${Math.round(convoyPercent)}%, depot ${Math.round(depotPercent)}%`;
        return `
      <div class="logistics-resource-card__gauge" role="img" aria-label="${this.escapeHtml(label)}">
        <span class="logistics-resource-card__gauge-bar logistics-resource-card__gauge-bar--units" style="width: ${unitPercent}%"></span>
        <span class="logistics-resource-card__gauge-bar logistics-resource-card__gauge-bar--convoys" style="width: ${convoyPercent}%"></span>
        <span class="logistics-resource-card__gauge-bar logistics-resource-card__gauge-bar--depot" style="width: ${depotPercent}%"></span>
      </div>
    `;
    }
    selectLogisticsResourceCategories(supplySnapshot) {
        if (!supplySnapshot) {
            return [];
        }
        return supplySnapshot.categories.filter((category) => category.resource === "ammo" || category.resource === "fuel");
    }
    /**
     * Renders a resupply-priority card so the commander can steer which battalion gets the next convoy slot.
     */
    composePriorityItem(entry) {
        const statusLabel = this.formatPriorityStatusLabel(entry.status);
        const priorityOptions = ["critical", "high", "normal", "low"];
        return `
      <article class="logistics-priority-card">
        <header class="logistics-priority-card__row">
          <div class="logistics-priority-card__summary">
            <h4>${this.escapeHtml(entry.unitLabel)}</h4>
            <p>${this.escapeHtml(entry.hex)} · Needs ${this.formatQuantity(entry.ammoNeed)} ammo · ${this.formatQuantity(entry.fuelNeed)} fuel · Assigned convoys: ${entry.assignedConvoys}</p>
          </div>
          <span class="logistics-priority-card__status logistics-priority-card__status--${entry.status}">${this.escapeHtml(statusLabel)}</span>
          <div class="logistics-priority-card__buttons" role="group" aria-label="Set ${this.escapeHtml(entry.unitLabel)} logistics priority">
          ${priorityOptions.map((priority) => `
            <button
              type="button"
              class="logistics-priority-button${entry.priority === priority ? " is-active" : ""}"
              data-logistics-priority-button
              data-logistics-priority-unit-id="${this.escapeHtml(entry.unitId)}"
              data-logistics-priority="${priority}"
              aria-pressed="${entry.priority === priority ? "true" : "false"}"
            >
              ${this.escapeHtml(this.formatSupplyPriorityLabel(priority))}
            </button>
          `).join("")}
          </div>
        </header>
      </article>
    `;
    }
    /**
     * Renders a supply source card showing throughput and bottlenecks.
     */
    composeSupplySourceCard(source) {
        const utilizationPercent = Math.round(source.utilization * 100);
        const bottleneckMarkup = source.bottleneck
            ? `<div class="logistics-source-card__bottleneck"><strong>Bottleneck:</strong> ${this.escapeHtml(source.bottleneck)}</div>`
            : "";
        return `
      <article class="logistics-source-card">
        <header class="logistics-source-card__header">
          <h4>${this.escapeHtml(source.label)}</h4>
          <span class="logistics-source-card__utilization">${utilizationPercent}%</span>
        </header>
        <dl class="logistics-source-card__metrics">
          <div class="logistics-source-card__metric">
            <dt>Connected Units</dt>
            <dd>${source.connectedUnits}</dd>
          </div>
          <div class="logistics-source-card__metric">
            <dt>Throughput</dt>
            <dd>${source.throughput}</dd>
          </div>
          <div class="logistics-source-card__metric">
            <dt>Avg Travel Time</dt>
            <dd>${source.averageTravelHours}h</dd>
          </div>
        </dl>
        ${bottleneckMarkup}
      </article>
    `;
    }
    /**
     * Renders a stockpile card showing resource levels and trends.
     */
    composeStockpileCard(stockpile) {
        const resourceLabel = this.formatResourceLabel(stockpile.resource);
        const trendLabel = stockpile.trend.charAt(0).toUpperCase() + stockpile.trend.slice(1);
        const detailLabel = stockpile.resource === "parts"
            ? `${this.formatQuantity(stockpile.averagePerUnit)} repair need / unit`
            : `${this.formatQuantity(stockpile.averagePerUnit)} carried / unit`;
        return `
      <article class="logistics-stockpile-card">
        <div class="logistics-stockpile-card__label">${resourceLabel}</div>
        <div class="logistics-stockpile-card__caption">Depot stock</div>
        <div class="logistics-stockpile-card__total">${this.formatQuantity(stockpile.total)}</div>
        <div class="logistics-stockpile-card__avg">${detailLabel}</div>
        <span class="logistics-stockpile-card__trend logistics-stockpile-card__trend--${stockpile.trend}">${trendLabel}</span>
      </article>
    `;
    }
    /**
     * Renders a convoy status item.
     */
    composeConvoyItem(convoy) {
        const statusLabel = this.formatConvoyStatusLabel(convoy.status);
        const etaLabel = convoy.etaHours > 0 ? `${convoy.etaHours}h` : "Now";
        const incidentMarkup = convoy.incident
            ? `<div class="logistics-convoy-item__incident">${this.escapeHtml(convoy.incident)}</div>`
            : "";
        return `
      <li class="logistics-convoy-item">
        <div class="logistics-convoy-item__main">
          <div class="logistics-convoy-item__heading">${this.escapeHtml(convoy.convoyLabel)}</div>
          <div class="logistics-convoy-item__route">${this.escapeHtml(convoy.route)}</div>
          <div class="logistics-convoy-item__cargo">Cargo ${this.formatQuantity(convoy.cargoAmmo)} ammo · ${this.formatQuantity(convoy.cargoFuel)} fuel</div>
          ${incidentMarkup}
        </div>
        <span class="logistics-convoy-item__status logistics-convoy-item__status--${convoy.status}">${statusLabel}</span>
        <span class="logistics-convoy-item__eta">ETA ${etaLabel}</span>
      </li>
    `;
    }
    composeSupportTeamItem(team) {
        const statusLabel = this.formatSupportTeamStatusLabel(team.status);
        const etaLabel = team.etaHours > 0 ? `${team.etaHours}h` : "Now";
        const careLabel = team.type === "medical" ? "Medical" : "Repair";
        const assignmentLabel = team.assignedUnitLabel && team.assignedHex
            ? `${careLabel} need ${this.formatQuantity(team.need)} at ${this.escapeHtml(team.assignedUnitLabel)} (${this.escapeHtml(team.assignedHex)})`
            : `${careLabel} team available`;
        const effectMarkup = team.lastTurnEffect
            ? `<div class="logistics-convoy-item__cargo">Last turn: ${this.escapeHtml(team.lastTurnEffect)}</div>`
            : "";
        const incidentMarkup = team.incident
            ? `<div class="logistics-convoy-item__incident">${this.escapeHtml(team.incident)}</div>`
            : "";
        return `
      <li class="logistics-convoy-item logistics-support-team-item logistics-support-team-item--${team.type}">
        <div class="logistics-convoy-item__main">
          <div class="logistics-convoy-item__heading">${this.escapeHtml(team.teamLabel)}</div>
          <div class="logistics-convoy-item__route">${this.escapeHtml(team.route)}</div>
          <div class="logistics-convoy-item__cargo">${assignmentLabel}</div>
          ${effectMarkup}
          ${incidentMarkup}
        </div>
        <span class="logistics-convoy-item__status logistics-convoy-item__status--${team.status}">${statusLabel}</span>
        <span class="logistics-convoy-item__eta">ETA ${etaLabel}</span>
      </li>
    `;
    }
    composeCareItem(entry) {
        const careLabel = entry.type === "medical" ? "Medical" : "Repair";
        const assignedLabel = entry.assignedAssets > 0 ? `${entry.assignedAssets} assigned` : "Awaiting asset";
        const lastEffectMarkup = entry.lastTurnEffect
            ? `<div class="logistics-care-item__effect">${this.escapeHtml(entry.lastTurnEffect)}</div>`
            : "";
        return `
      <li class="logistics-care-item logistics-care-item--${entry.type}">
        <div class="logistics-care-item__main">
          <div class="logistics-care-item__heading">${this.escapeHtml(entry.unitLabel)}</div>
          <div class="logistics-care-item__detail">${this.escapeHtml(entry.hex)} · ${careLabel} need ${this.formatQuantity(entry.need)} · Priority ${this.escapeHtml(this.formatSupplyPriorityLabel(entry.priority))}</div>
          ${lastEffectMarkup}
        </div>
        <span class="logistics-care-item__type">${careLabel}</span>
        <span class="logistics-care-item__assigned">${assignedLabel}</span>
      </li>
    `;
    }
    /**
     * Renders a delay node item.
     */
    composeDelayItem(delay) {
        const riskLabel = delay.risk.charAt(0).toUpperCase() + delay.risk.slice(1);
        return `
      <li class="logistics-delay-item">
        <div class="logistics-delay-item__node">${this.escapeHtml(delay.node)}</div>
        <span class="logistics-delay-item__risk logistics-delay-item__risk--${delay.risk}">${riskLabel} Risk</span>
        <div class="logistics-delay-item__reason">${this.escapeHtml(delay.reason)}</div>
      </li>
    `;
    }
    /**
     * Renders a maintenance backlog item.
     */
    composeMaintenanceItem(item) {
        const turnsLabel = item.pendingTurns === 1 ? "1 turn" : `${item.pendingTurns} turns`;
        return `
      <li class="logistics-maintenance-item">
        <div class="logistics-maintenance-item__unit">${this.escapeHtml(item.unitKey)}</div>
        <div class="logistics-maintenance-item__issue">${this.escapeHtml(item.issue)}</div>
        <span class="logistics-maintenance-item__eta">${turnsLabel}</span>
      </li>
    `;
    }
    /**
     * Renders a logistics alert.
     */
    composeLogisticsAlert(alert) {
        return `
      <li class="logistics-alert-item logistics-alert-item--${alert.level}">
        ${this.escapeHtml(alert.message)}
      </li>
    `;
    }
    composeCombinedLogisticsAlerts(logisticsAlerts, supplyAlerts) {
        const merged = new Map();
        const severityRank = {
            info: 0,
            warning: 1,
            critical: 2
        };
        logisticsAlerts.forEach((alert) => {
            merged.set(alert.message, alert.level);
        });
        supplyAlerts.forEach((alert) => {
            const message = `${this.resolveResourceLabel(alert.resource)}: ${alert.message}`;
            const current = merged.get(message);
            if (!current || severityRank[alert.level] > severityRank[current]) {
                merged.set(message, alert.level);
            }
        });
        if (merged.size === 0) {
            return '<li class="logistics-panel__empty">No logistics alerts.</li>';
        }
        return Array.from(merged.entries())
            .map(([message, level]) => this.composeLogisticsAlert({ message, level }))
            .join("");
    }
    formatSupplyPriorityLabel(priority) {
        switch (priority) {
            case "critical":
                return "Critical";
            case "high":
                return "High";
            case "normal":
                return "Normal";
            case "low":
            default:
                return "Low";
        }
    }
    formatPriorityStatusLabel(status) {
        switch (status) {
            case "direct":
                return "At Base";
            case "delivering":
                return "Convoy Assigned";
            case "resupplied":
                return "Resupplied";
            case "isolated":
                return "Isolated";
            case "queued":
            default:
                return "Queued";
        }
    }
    formatConvoyStatusLabel(status) {
        switch (status) {
            case "loading":
                return "Loading";
            case "delivering":
                return "Delivering";
            case "returning":
                return "Returning";
            case "idle":
                return "Idle";
            case "blocked":
            default:
                return "Blocked";
        }
    }
    formatSupportTeamStatusLabel(status) {
        switch (status) {
            case "treating":
                return "Treating";
            case "repairing":
                return "Repairing";
            case "available":
                return "Available";
            case "blocked":
            default:
                return "Blocked";
        }
    }
    /**
     * Formats resource names for display.
     */
    formatResourceLabel(resource) {
        switch (resource) {
            case "ammo":
                return "Ammunition";
            case "fuel":
                return "Fuel";
            case "parts":
                return "Spare Parts";
            default:
                return resource.charAt(0).toUpperCase() + resource.slice(1);
        }
    }
    formatBattlePhaseLabel(phase) {
        switch (phase) {
            case "playerTurn":
                return "Player Turn";
            case "botTurn":
                return "Enemy Turn";
            case "allyTurn":
                return "Ally Turn";
            case "deployment":
                return "Deployment";
            case "completed":
                return "Completed";
            default:
                return phase;
        }
    }
    /**
     * Wires filter controls and performs the initial render of the recon/intel panel.
     */
    initializeReconIntelPanel() {
        if (!this.reconIntelSnapshot) {
            return;
        }
        const panel = this.popupBody.querySelector("[data-recon-intel-panel]");
        if (!panel) {
            return;
        }
        this.bindReconIntelFilters(panel);
        this.renderReconIntelPanel();
    }
    bindReconIntelFilters(panel) {
        const timeframeButtons = Array.from(panel.querySelectorAll("[data-recon-timeframe]"));
        const confidenceButtons = Array.from(panel.querySelectorAll("[data-recon-confidence]"));
        const activateButton = (buttons, active) => {
            buttons.forEach((candidate) => {
                candidate.classList.toggle("is-active", candidate === active);
            });
        };
        timeframeButtons.forEach((button) => {
            if ((button.dataset.reconTimeframe ?? "all") === "all") {
                button.classList.add("is-active");
            }
            button.addEventListener("click", () => {
                const value = (button.dataset.reconTimeframe ?? "all");
                this.reconIntelTimeframe = value;
                activateButton(timeframeButtons, button);
                this.renderReconIntelPanel();
            });
        });
        confidenceButtons.forEach((button) => {
            if ((button.dataset.reconConfidence ?? "all") === "all") {
                button.classList.add("is-active");
            }
            button.addEventListener("click", () => {
                const value = (button.dataset.reconConfidence ?? "all");
                this.reconIntelConfidence = value;
                activateButton(confidenceButtons, button);
                this.renderReconIntelPanel();
            });
        });
    }
    /**
     * Re-renders all recon/intel sub-sections after a filter change.
     */
    renderReconIntelPanel() {
        if (!this.reconIntelSnapshot) {
            return;
        }
        this.renderReconIntelAlert();
        this.renderReconIntelSectors();
        this.renderReconIntelBriefs();
        this.bindReconIntelLinkEvents();
    }
    /**
     * Displays the highest-severity alert matching the active timeframe filters.
     */
    renderReconIntelAlert() {
        if (!this.reconIntelSnapshot) {
            return;
        }
        const banner = this.popupBody.querySelector("[data-recon-intel-alert]");
        if (!banner) {
            return;
        }
        const alert = this.selectReconIntelAlert();
        if (!alert) {
            banner.hidden = true;
            banner.textContent = "";
            banner.removeAttribute("data-severity");
            return;
        }
        banner.hidden = false;
        banner.setAttribute("data-severity", alert.severity);
        banner.innerHTML = `<span>${alert.message}</span><small>${alert.action}</small>`;
    }
    /**
     * Chooses the alert banner entry honoring severity and active timeframe filters.
     */
    selectReconIntelAlert() {
        if (!this.reconIntelSnapshot || this.reconIntelSnapshot.alerts.length === 0) {
            return null;
        }
        const matches = this.reconIntelSnapshot.alerts.filter((entry) => {
            return this.reconIntelTimeframe === "all" || entry.timeframe === this.reconIntelTimeframe;
        });
        const pool = matches.length > 0 ? matches : this.reconIntelSnapshot.alerts;
        const severityScore = {
            critical: 3,
            warning: 2,
            info: 1
        };
        const [first, ...rest] = pool;
        return rest.reduce((best, current) => {
            return severityScore[current.severity] > severityScore[best.severity] ? current : best;
        }, first);
    }
    /**
     * Renders recon column cards, blurring low confidence activity per UX guidance.
     */
    renderReconIntelSectors() {
        if (!this.reconIntelSnapshot) {
            return;
        }
        const container = this.popupBody.querySelector("[data-recon-sector-list]");
        if (!container) {
            return;
        }
        const sectors = this.reconIntelSnapshot.sectors.filter((entry) => this.matchesReconIntelFilters(entry.timeframe, entry.confidence));
        if (sectors.length === 0) {
            container.innerHTML = "<div class=\"recon-intel-empty\">No recon sectors match the selected filters.</div>";
            return;
        }
        container.innerHTML = sectors.map((entry) => this.composeReconIntelSectorMarkup(entry)).join("");
    }
    /**
     * Renders intel briefs in the right column, highlighting linked sectors when focused.
     */
    renderReconIntelBriefs() {
        if (!this.reconIntelSnapshot) {
            return;
        }
        const container = this.popupBody.querySelector("[data-recon-brief-list]");
        if (!container) {
            return;
        }
        const briefs = this.reconIntelSnapshot.intelBriefs.filter((entry) => this.matchesReconIntelFilters(entry.timeframe, entry.confidence));
        if (briefs.length === 0) {
            container.innerHTML = "<div class=\"recon-intel-empty\">No intelligence briefs match the selected filters.</div>";
            return;
        }
        container.innerHTML = briefs.map((entry) => this.composeReconIntelBriefMarkup(entry)).join("");
    }
    /**
     * Checks whether an entry should render for the active timeframe/confidence filters.
     */
    matchesReconIntelFilters(timeframe, confidence) {
        const timeframeMatches = this.reconIntelTimeframe === "all" || this.reconIntelTimeframe === timeframe;
        const confidenceMatches = this.reconIntelConfidence === "all" || this.reconIntelConfidence === confidence;
        return timeframeMatches && confidenceMatches;
    }
    /**
     * Generates accessible markup for a recon sector card.
     */
    composeReconIntelSectorMarkup(sector) {
        const linkedBriefCount = sector.linkedBriefs.length;
        const linkedBriefText = linkedBriefCount === 0
            ? "No intel briefs linked."
            : `${linkedBriefCount} intel brief${linkedBriefCount === 1 ? "" : "s"} linked.`;
        return `
      <article class="recon-intel-card" data-sector-id="${sector.id}" tabindex="0">
        <strong>${sector.name}</strong>
        <div class="meta-line">
          <span class="meta-pill">${this.describeReconIntelTimeframe(sector.timeframe)}</span>
          <span class="meta-pill">${this.describeReconIntelConfidence(sector.confidence)}</span>
          <span>${sector.coordinates}</span>
        </div>
        <p class="body">${sector.summary}</p>
        <p class="body" data-confidence="${sector.confidence}">${sector.activity}</p>
        <div class="meta-line"><span>${linkedBriefText}</span></div>
      </article>
    `;
    }
    /**
     * Generates accessible markup for an intel brief card.
     */
    composeReconIntelBriefMarkup(brief) {
        const linkedSectorCount = brief.linkedSectors.length;
        const linkedSectorText = linkedSectorCount === 0
            ? "No recon sectors linked."
            : `${linkedSectorCount} recon sector${linkedSectorCount === 1 ? "" : "s"} linked.`;
        return `
      <article class="recon-intel-card" data-brief-id="${brief.id}" tabindex="0">
        <strong>${brief.title}</strong>
        <div class="meta-line">
          <span class="meta-pill">${this.describeReconIntelTimeframe(brief.timeframe)}</span>
          <span class="meta-pill">${this.describeReconIntelConfidence(brief.confidence)}</span>
        </div>
        <p class="body" data-confidence="${brief.confidence}">${brief.assessment}</p>
        <p class="body">${brief.projectedImpact}</p>
        <div class="meta-line"><span>${linkedSectorText}</span></div>
      </article>
    `;
    }
    /**
     * Converts timeframe codes into human-readable labels.
     */
    describeReconIntelTimeframe(timeframe) {
        switch (timeframe) {
            case "last":
                return "Last Turn";
            case "current":
                return "Current Turn";
            case "forecast":
                return "Forecast";
            default:
                return timeframe;
        }
    }
    /**
     * Converts confidence codes into human-readable labels.
     */
    describeReconIntelConfidence(confidence) {
        switch (confidence) {
            case "high":
                return "Confidence: High";
            case "medium":
                return "Confidence: Medium";
            case "low":
                return "Confidence: Low";
            default:
                return confidence;
        }
    }
    /**
     * Attaches hover/focus interactions to cross-highlight linked recon/brief cards.
     */
    bindReconIntelLinkEvents() {
        const sectorCards = Array.from(this.popupBody.querySelectorAll("[data-sector-id]"));
        const briefCards = Array.from(this.popupBody.querySelectorAll("[data-brief-id]"));
        sectorCards.forEach((card) => {
            const id = card.dataset.sectorId;
            if (!id) {
                return;
            }
            const activate = (active) => {
                card.classList.toggle("is-highlighted", active);
                this.toggleReconIntelHighlight("sector", id, active);
            };
            card.addEventListener("mouseenter", () => activate(true));
            card.addEventListener("mouseleave", () => activate(false));
            card.addEventListener("focusin", () => activate(true));
            card.addEventListener("focusout", () => activate(false));
        });
        briefCards.forEach((card) => {
            const id = card.dataset.briefId;
            if (!id) {
                return;
            }
            const activate = (active) => {
                card.classList.toggle("is-highlighted", active);
                this.toggleReconIntelHighlight("brief", id, active);
            };
            card.addEventListener("mouseenter", () => activate(true));
            card.addEventListener("mouseleave", () => activate(false));
            card.addEventListener("focusin", () => activate(true));
            card.addEventListener("focusout", () => activate(false));
        });
    }
    /**
     * Coordinates cross-column highlighting so recon cards highlight their linked intel briefs and vice versa.
     */
    toggleReconIntelHighlight(source, id, active) {
        if (!this.reconIntelSnapshot) {
            return;
        }
        if (source === "sector") {
            const sector = this.reconIntelSnapshot.sectors.find((entry) => entry.id === id);
            if (!sector) {
                return;
            }
            this.applyReconIntelHighlight("[data-brief-id]", sector.linkedBriefs, active);
        }
        else {
            const brief = this.reconIntelSnapshot.intelBriefs.find((entry) => entry.id === id);
            if (!brief) {
                return;
            }
            this.applyReconIntelHighlight("[data-sector-id]", brief.linkedSectors, active);
        }
    }
    /**
     * Applies or clears the shared highlight class for a given set of dataset identifiers.
     */
    applyReconIntelHighlight(selector, ids, active) {
        if (ids.length === 0) {
            return;
        }
        const elements = Array.from(this.popupBody.querySelectorAll(selector));
        elements.forEach((element) => {
            const elementId = selector === "[data-sector-id]" ? element.dataset.sectorId : element.dataset.briefId;
            if (!elementId) {
                return;
            }
            if (ids.includes(elementId)) {
                element.classList.toggle("is-highlighted", active);
            }
        });
    }
    /**
     * Helper to require an element from the DOM.
     */
    requireElement(selector) {
        const element = document.querySelector(selector);
        if (!element) {
            throw new Error(`Required element not found: ${selector}`);
        }
        return element;
    }
    handleWarRoomOverlayClosed() {
        if (this.activePopup !== "baseOperations") {
            return;
        }
        this.syncSidebarButtons(null);
        const trigger = this.lastTriggerButton;
        this.activePopup = null;
        this.lastTriggerButton = null;
        if (trigger) {
            trigger.focus();
        }
    }
    handleWarRoomOpenBattleRequisitions() {
        const trigger = this.lastTriggerButton ?? undefined;
        if (this.activePopup === "baseOperations") {
            this.warRoomOverlay?.close();
        }
        this.openPopup("battleRequisitions", trigger);
    }
}
