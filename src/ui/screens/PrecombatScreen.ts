import type { IScreenManager } from "../../contracts/IScreenManager";
import type { BattleState, PrecombatAllocationSummary } from "../../state/BattleState";
import {
  ALLOCATION_BY_CATEGORY,
  allocationOptions,
  getAllocationOption,
  type UnitAllocationOption
} from "../../data/unitAllocation";
import { getMissionBriefing, getMissionTitle } from "../../data/missions";
import {
  ensureDeploymentState,
  type DeploymentPoolEntry
} from "../../state/DeploymentState";
import { findTemplateForUnitKey } from "../../game/adapters";
import type { MissionKey } from "../../state/UIState";
import { findGeneralById, getAllGenerals } from "../../utils/rosterStorage";
import { ensureTutorialState, isTrainingMission } from "../../state/TutorialState";
import { getNextPhase } from "../../data/tutorialSteps";
import { HexMapRenderer } from "../../rendering/HexMapRenderer";
import type { ScenarioData, ScenarioDeploymentZone, ScenarioUnit } from "../../core/types";
import scenarioSource from "../../data/scenario01.json";
import { planDeploymentZoneHexes } from "../utils/deploymentZonePlanner";

type AllocationListElement = HTMLElement & { __allocationListenersAttached?: boolean };

const MISSION_SUMMARY_FALLBACKS: Record<string, {
  readonly objectives: readonly string[];
  readonly turnLimit: number;
  readonly doctrine: string;
  readonly supplies: readonly { label: string; amount: string }[];
}> = {
  training: {
    objectives: [
      "Execute training maneuvers without exceeding casualty thresholds.",
      "Rotate every unit type through live-fire exercises."
    ],
    turnLimit: 8,
    doctrine: "Emphasize combined-arms rehearsal; focus on communication drills over live combat.",
    supplies: [
      { label: "Rations", amount: "Full stock" },
      { label: "Fuel", amount: "Minimal usage expected" },
      { label: "Ammo", amount: "Live-fire allotment only" }
    ]
  },
  patrol: {
    objectives: [
      "Reconnoiter border checkpoints and report hostile sightings.",
      "Maintain radio contact with HQ at each waypoint."
    ],
    turnLimit: 10,
    doctrine: "Maintain flexible response posture; adhere to reconnaissance-in-force doctrine.",
    supplies: [
      { label: "Rations", amount: "Standard patrol pack" },
      { label: "Fuel", amount: "50% reserve" },
      { label: "Ammo", amount: "Issue combat load" }
    ]
  },
  assault: {
    objectives: [
      "Seize primary defensive line within allotted turns.",
      "Neutralize hardened positions before reinforcements arrive."
    ],
    turnLimit: 14,
    doctrine: "Coordinate armored thrust with artillery suppression per breakthrough doctrine.",
    supplies: [
      { label: "Rations", amount: "Forward stockpile" },
      { label: "Fuel", amount: "Full combat reserve" },
      { label: "Ammo", amount: "High consumption expected" }
    ]
  },
  campaign: {
    objectives: [
      "Capture sequential strategic nodes to cut enemy logistics.",
      "Sustain momentum across multi-phase offensive."
    ],
    turnLimit: 20,
    doctrine: "Apply deep operations doctrine; safeguard supply corridors at all times.",
    supplies: [
      { label: "Rations", amount: "Bulk depot established" },
      { label: "Fuel", amount: "Escort convoys nightly" },
      { label: "Ammo", amount: "Allocate heavy artillery shells" }
    ]
  }
};

export class PrecombatScreen {
  private readonly screenManager: IScreenManager;
  private readonly battleState: BattleState;
  private readonly element: HTMLElement;

  // DOM element references
  private missionTitleElement!: HTMLElement;
  private missionBriefingElement!: HTMLElement;
  private objectiveListElement!: HTMLUListElement;
  private missionTurnLimitElement!: HTMLElement;
  private baselineSupplyListElement!: HTMLUListElement;
  private doctrineNotesElement!: HTMLElement;
  private returnToLandingButton!: HTMLButtonElement;
  private proceedToBattleButton!: HTMLButtonElement;
  private allocationWarningReturn!: HTMLButtonElement;
  private allocationWarningProceed!: HTMLButtonElement;
  private allocationUnitList!: HTMLElement;
  private allocationSupplyList!: HTMLElement;
  private allocationSupportList!: HTMLElement;
  private allocationLogisticsList!: HTMLElement;
  private allocationResetButton!: HTMLButtonElement;
  private allocationWarningOverlay!: HTMLElement;
  private allocationWarningModal!: HTMLElement;
  private predeployedSummaryElement!: HTMLElement;
  private predeployedListElement!: HTMLElement;
  private budgetPanel!: HTMLElement;
  private budgetSpentElement!: HTMLElement;
  private budgetRemainingElement!: HTMLElement;
  private allocationFeedbackElement!: HTMLElement;
  private commanderCardElement!: HTMLElement;
  private commanderNameElement!: HTMLElement;
  private commanderSummaryElement!: HTMLElement;
  private commanderMissionsElement!: HTMLElement;
  private commanderVictoriesElement!: HTMLElement;
  private commanderUnitsElement!: HTMLElement;
  private commanderCasualtiesElement!: HTMLElement;
  private miniMapCanvas!: HTMLDivElement;
  private miniMapSvg!: SVGSVGElement;

  private readonly miniMapRenderer = new HexMapRenderer();
  private readonly miniMapScenario: ScenarioData;

  // Campaign integration: active mission and dynamic caps derived from campaign economy when applicable.
  private activeMissionKey: MissionKey | null = null;
  private campaignCaps: { manpowerUnits: number; airSlots: number; ammo: number; fuel: number } | null = null;

  /**
   * Allocation state containers required by interaction TODO.
   *
   * Contract Summary:
   * - `allocationCounts` retains canonical quantities keyed by `UnitAllocationOption.key`.
   *   Re-render workflows read from this Map so interaction modules MUST write here instead of
   *   manipulating DOM directly.
   * - `allocationBudget` is currently a simple number representing total available funds. Future
   *   validation tasks may compute dynamic values but should continue to update this field so the
   *   getters remain stable.
   * - `allocationDirty` acts as a cache invalidation flag for planned budget computations. Downstream
   *   modules can short-circuit recalculations when this flag is false.
   */
  private readonly allocationCounts = new Map<string, number>();
  private allocationBudget = 10_000_000;
  private allocationDirty = false;
  private readonly predeployedCounts = new Map<string, number>();
  private readonly predeployedRoster = new Map<string, { label: string; scenarioType: string; count: number }>();

  constructor(screenManager: IScreenManager, battleState: BattleState) {
    this.screenManager = screenManager;
    this.battleState = battleState;
    this.miniMapScenario = JSON.parse(JSON.stringify(scenarioSource)) as ScenarioData;

    const precombatScreen = document.getElementById("precombatScreen");
    if (!precombatScreen) {
      throw new Error("Precombat screen element (#precombatScreen) not found in DOM");
    }
    this.element = precombatScreen;
  }

  /**
   * Initializes the precombat screen.
   */
  initialize(): void {
    this.cacheElements();
    this.bindEvents();
    this.primeAllocationState();
    this.seedDeploymentCaches();
    // Refresh deployment zone metadata so the player always sees accurate capacity guidance before adjusting allocations.
    this.registerScenarioDeploymentZones();
    // Ensure allocation widgets are hydrated before presenting the screen so keyboard / pointer controls are responsive immediately.
    this.initializeAllocationUI();
    this.renderMiniMap();
  }

  /**
   * Returns the screen's root element.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Caches references to DOM elements.
   */
  private cacheElements(): void {
    this.missionTitleElement = this.requireElement<HTMLElement>("#precombatMissionTitle");
    this.missionBriefingElement = this.requireElement<HTMLElement>("#precombatMissionBriefing");
    this.objectiveListElement = this.requireElement<HTMLUListElement>("#objectiveList");
    this.missionTurnLimitElement = this.requireElement<HTMLElement>("#missionTurnLimit");
    this.baselineSupplyListElement = this.requireElement<HTMLUListElement>("#baselineSupplyList");
    this.doctrineNotesElement = this.requireElement<HTMLElement>("#missionDoctrineNotes");
    this.returnToLandingButton = this.requireElement<HTMLButtonElement>("#returnToLanding");
    this.proceedToBattleButton = this.requireElement<HTMLButtonElement>("#proceedToBattle");
    this.allocationWarningReturn = this.requireElement<HTMLButtonElement>("#allocationWarningReturn");
    this.allocationWarningProceed = this.requireElement<HTMLButtonElement>("#allocationWarningProceed");
    this.allocationUnitList = this.requireElement<HTMLElement>("#allocationUnitList");
    this.allocationSupplyList = this.requireElement<HTMLElement>("#allocationSupplyList");
    this.allocationSupportList = this.requireElement<HTMLElement>("#allocationSupportList");
    this.allocationLogisticsList = this.requireElement<HTMLElement>("#allocationLogisticsList");
    this.allocationResetButton = this.requireElement<HTMLButtonElement>("#resetAllocations");
    this.allocationWarningOverlay = this.requireElement<HTMLElement>("#allocationWarningOverlay");
    this.allocationWarningModal = this.requireElement<HTMLElement>("#allocationWarningModal");
    this.predeployedSummaryElement = this.requireElement<HTMLElement>("#predeployedSummary");
    this.predeployedListElement = this.requireElement<HTMLElement>("#predeployedUnitList");

    this.budgetPanel = this.requireElement<HTMLElement>("#precombatBudgetPanel");
    this.budgetSpentElement = this.requireElement<HTMLElement>("#budgetSpent");
    this.budgetRemainingElement = this.requireElement<HTMLElement>("#budgetRemaining");
    this.allocationFeedbackElement = this.requireElement<HTMLElement>("#allocationFeedback");
    this.commanderCardElement = this.requireElement<HTMLElement>("#commanderSummaryCard");
    this.commanderNameElement = this.requireElement<HTMLElement>("#commanderName");
    this.commanderSummaryElement = this.requireElement<HTMLElement>("#commanderSummary");
    this.commanderMissionsElement = this.requireElement<HTMLElement>("#commanderMissions");
    this.commanderVictoriesElement = this.requireElement<HTMLElement>("#commanderVictories");
    this.commanderUnitsElement = this.requireElement<HTMLElement>("#commanderUnits");
    this.commanderCasualtiesElement = this.requireElement<HTMLElement>("#commanderCasualties");
    this.miniMapCanvas = this.requireElement<HTMLDivElement>("#precombatMapCanvas");
    const miniMapSvg = this.element.querySelector<SVGSVGElement>("#precombatHexMap");
    if (!miniMapSvg) {
      throw new Error("Required precombat element not found: #precombatHexMap");
    }
    this.miniMapSvg = miniMapSvg;

    if (!this.allocationResetButton) {
      const footer = this.element.querySelector(".precombat-footer");
      if (footer) {
        const resetButton = document.createElement("button");
        resetButton.id = "resetAllocations";
        resetButton.type = "button";
        resetButton.className = "secondary-button";
        resetButton.textContent = "Reset Allocations";
        footer.insertBefore(resetButton, this.proceedToBattleButton);
        this.allocationResetButton = resetButton;
      }
    }
  }

  /**
   * Binds event handlers.
   */
  private bindEvents(): void {
    this.returnToLandingButton.addEventListener("click", () => this.handleReturnToLanding());
    this.proceedToBattleButton.addEventListener("click", () => this.handleProceedToBattle());
    this.allocationWarningReturn.addEventListener("click", () => this.handleAllocationWarningReturn());
    this.allocationWarningProceed.addEventListener("click", () => this.handleAllocationWarningProceed());
    this.allocationResetButton.addEventListener("click", () => this.resetAllocations());
  }

  /**
   * Sets up the screen with mission-specific data.
   */
  setup(missionKey: MissionKey, selectedGeneralId: string | null): void {
    this.activeMissionKey = missionKey;
    this.primeAllocationState();
    this.seedDeploymentCaches();
    this.registerScenarioDeploymentZones();
    this.renderMissionSummary(missionKey);
    this.seedPredeployedAllocations();
    this.renderPredeployedOverview();
    // Persist the command assignment so battle overlays reference the same general profile as precombat.
    this.battleState.setAssignedCommanderId(selectedGeneralId);
    this.renderGeneralSummary(selectedGeneralId);
    this.rerenderAllocations();
    this.bindAllocationLists();
    // Derive campaign caps when entering precombat from the campaign flow.
    if (missionKey === "campaign") {
      this.computeCampaignCaps();
    } else {
      this.campaignCaps = null;
    }
    if (typeof console !== "undefined") {
      console.assert(
        (ALLOCATION_BY_CATEGORY.get("units")?.length ?? 0) ===
          this.allocationUnitList.children.length,
        "Precombat allocation list did not render the expected number of unit entries."
      );
    }

    // Start the tutorial if this is the training mission
    if (isTrainingMission(missionKey)) {
      this.startTrainingTutorial();
    }
  }

  /**
   * Starts the training tutorial when the player enters the training mission.
   */
  private startTrainingTutorial(): void {
    const tutorialState = ensureTutorialState();
    tutorialState.startTutorial();
    console.log("[PrecombatScreen] Training tutorial started");
  }

  /**
   * Advances the tutorial to the next phase if conditions are met.
   */
  private advanceTutorialIfNeeded(optionKey: string, newQuantity: number): void {
    const tutorialState = ensureTutorialState();
    if (!tutorialState.isTutorialActive()) return;

    const currentPhase = tutorialState.getCurrentPhase();

    if (currentPhase === "adjust_quantity") {
      tutorialState.setCanProceed(true);
    }

    // Check if user has added infantry (for select_infantry phase)
    if (currentPhase === "select_infantry" && optionKey === "infantry" && newQuantity > 0) {
      tutorialState.setCanProceed(true);
      // Auto-advance after a brief delay so user sees the feedback
      setTimeout(() => {
        const nextPhase = getNextPhase("select_infantry");
        if (nextPhase) tutorialState.advancePhase(nextPhase);
      }, 800);
    }

    // Check if user has added tanks (for select_tanks phase)
    if (currentPhase === "select_tanks" && optionKey === "tank" && newQuantity > 0) {
      tutorialState.setCanProceed(true);
      setTimeout(() => {
        const nextPhase = getNextPhase("select_tanks");
        if (nextPhase) tutorialState.advancePhase(nextPhase);
      }, 800);
    }

    if (currentPhase === "select_support" && optionKey === "howitzer" && newQuantity > 0) {
      tutorialState.setCanProceed(true);
      setTimeout(() => {
        const nextPhase = getNextPhase("select_support");
        if (nextPhase) tutorialState.advancePhase(nextPhase);
      }, 800);
    }

    // Check budget status for proceed_to_battle phase
    if (currentPhase === "proceed_to_battle") {
      const totalAllocated = Array.from(this.allocationCounts.values()).reduce((sum, v) => sum + v, 0);
      const totalPredeployed = Array.from(this.predeployedCounts.values()).reduce((sum, v) => sum + v, 0);
      const hasNewAllocations = totalAllocated > totalPredeployed;
      const remainingBudget = this.allocationBudget - this.calculateSpend();
      tutorialState.setCanProceed(hasNewAllocations && remainingBudget >= 0);
    }
  }

  /**
   * Initializes the unit allocation UI.
   */
  private initializeAllocationUI(): void {
    this.rerenderAllocations();
    this.bindAllocationLists();
    this.updateBudgetDisplay();
  }

  /**
   * Ensures every allocation list uses a shared delegated listener so repeated renders stay idempotent.
   */

  /**
   * Handles return to landing screen.
   */
  private handleReturnToLanding(): void {
    ensureDeploymentState().reset();
    this.screenManager.showScreenById("landing");
  }

  /**
   * Handles proceeding to battle screen.
   */
  private handleProceedToBattle(force = false): void {
    const entries = this.toDeploymentEntries();
    console.log("[PrecombatScreen] toDeploymentEntries built", entries.map((e) => ({ key: e.key, remaining: e.remaining })));
    if (entries.length === 0 && !force) {
      this.showAllocationWarning();
      return;
    }

    this.hideAllocationWarning();

    this.registerScenarioDeploymentZones();

    const deploymentState = ensureDeploymentState();
    // Preserve the exact requisition snapshot before initialization so BattleScreen can seed the engine with the same payloads.
    deploymentState.recordCommittedEntries(entries);
    deploymentState.initialize(entries);
    entries.forEach((entry) => deploymentState.setTotalAllocatedUnits(entry.key, entry.remaining));
    // Persist the requisition snapshot so the battle engine can rebuild its reserve queue when deployment begins.
    this.battleState.setPendingDeployment(entries);
    console.log("[PrecombatScreen] Committed deployment entries and initialized DeploymentState", {
      count: entries.length,
      keys: entries.map((e) => e.key)
    });

    // Engine Touchpoints: `BattleState` persists the summary so battle-phase UI can render committed
    // allocations without re-deriving totals from mutable deployment state. `BattleScreen` will read
    // this snapshot when ready (see TODO inside that class for loadout rendering hook).
    const summary = this.buildAllocationSummary(entries);
    this.battleState.setPrecombatAllocationSummary(summary);

    this.allocationDirty = false;

    // Advance tutorial to deployment phase if active
    const tutorialState = ensureTutorialState();
    if (tutorialState.isTutorialActive() && tutorialState.getCurrentPhase() === "proceed_to_battle") {
      tutorialState.advancePhase("deployment_intro");
    }

    this.screenManager.showScreenById("battle");
    if (this.allocationFeedbackElement) {
      this.allocationFeedbackElement.textContent = "Deployment package locked in. Review the battle screen to finalize placements.";
    }
  }

  /**
   * Handles allocation warning return action.
   */
  private handleAllocationWarningReturn(): void {
    this.hideAllocationWarning();
    this.proceedToBattleButton?.focus();
  }

  /**
   * Handles allocation warning proceed action.
   */
  private handleAllocationWarningProceed(): void {
    this.hideAllocationWarning();
    this.handleProceedToBattle(true);
  }

  /**
   * Seeds the allocation map with zeroed counts so render paths can assume presence.
   */
  private primeAllocationState(): void {
    allocationOptions.forEach((option) => {
      this.allocationCounts.set(option.key, 0);
    });
    this.allocationDirty = false;
    this.seedPredeployedAllocations();
    this.updateBudgetDisplay();
  }

  /**
   * Seeds deployment bridges with sprite paths and scenario aliases so the battle phase can mirror state without
   * recomputing lookups. Keeping the registration close to precombat setup ensures all catalog entries stay in sync
   * even if the player has not purchased a given unit type yet.
   */
  private seedDeploymentCaches(): void {
    const deploymentState = ensureDeploymentState();
    allocationOptions.forEach((option) => {
      if (option.spriteUrl) {
        deploymentState.registerSprite(option.key, option.spriteUrl);
      }
      const template = findTemplateForUnitKey(option.key);
      if (template) {
        deploymentState.registerScenarioAlias(option.key, template.type as string);
      }
    });
  }

  private registerScenarioDeploymentZones(): void {
    const deploymentState = ensureDeploymentState();
    const rawZones = scenarioSource.deploymentZones ?? [];
    if (rawZones.length === 0) {
      throw new Error("Scenario did not declare any deployment zones. Unable to initialize deployment UI.");
    }

    const zones = rawZones.map((zone) => {
      // JSON payloads hydrate faction as a plain string, so normalize the value to the strict union expected by
      // `ScenarioDeploymentZone` before feeding it into the planner. This keeps downstream typing consistent and
      // avoids treating unexpected tokens as valid factions.
      const normalizedFaction: "Player" | "Bot" | undefined = zone.faction === "Player"
        ? "Player"
        : zone.faction === "Bot"
          ? "Bot"
          : undefined;
      const sanitizedZone: ScenarioDeploymentZone = {
        key: zone.key,
        label: zone.label,
        description: zone.description,
        capacity: zone.capacity,
        // Fallback to Player for planner consumption when faction is omitted to preserve hex anchoring assumptions.
        faction: normalizedFaction ?? "Player",
        hexes: (zone.hexes ?? []).map(([col, row]) => [col, row] as [number, number])
      };
      const plannedHexes = planDeploymentZoneHexes(sanitizedZone, this.miniMapScenario);
      // Anchor deployment zones to edge-coastal tiles so the battle screen mirrors the intended landing corridors.
      return {
        zoneKey: zone.key,
        capacity: zone.capacity,
        hexKeys: plannedHexes,
        name: zone.label,
        description: zone.description,
        faction: normalizedFaction
      };
    });
    deploymentState.registerZones(zones);
  }

  /**
   * Converts the current allocation map into deployment-ready entries.
   */
  private toDeploymentEntries(): DeploymentPoolEntry[] {
    const deploymentState = ensureDeploymentState();
    const entries: DeploymentPoolEntry[] = [];
    for (const [key, quantity] of this.allocationCounts.entries()) {
      const baseline = this.predeployedCounts.get(key) ?? 0;
      const requisitionQuantity = quantity - baseline;
      if (requisitionQuantity <= 0) {
        continue;
      }
      const option = getAllocationOption(key);
      if (!option) {
        console.warn("Unknown allocation key encountered while building deployment entries", key);
        continue;
      }

      if (option.spriteUrl) {
        deploymentState.registerSprite(option.key, option.spriteUrl);
      }

      entries.push({
        key,
        label: option.label,
        remaining: requisitionQuantity,
        sprite: option.spriteUrl
      });
    }
    console.debug("[PrecombatScreen] toDeploymentEntries summary", entries.map((e) => ({ key: e.key, qty: e.remaining })));
    return entries;
  }

  /**
   * Builds the dataset persisted to `BattleState` for later battle-phase loadout summaries.
   */
  private buildAllocationSummary(entries: DeploymentPoolEntry[]): PrecombatAllocationSummary {
    let totalSpend = 0;
    const allocationSnapshots: PrecombatAllocationSummary["allocations"] = entries.map((entry) => {
      const option = getAllocationOption(entry.key);
      if (!option) {
        throw new Error(`Allocation option missing during summary build: ${entry.key}`);
      }
      totalSpend += option.costPerUnit * entry.remaining;
      return {
        key: entry.key,
        label: entry.label,
        quantity: entry.remaining,
        costPerUnit: option.costPerUnit,
        category: option.category
      };
    });

    return {
      allocations: allocationSnapshots,
      totalSpend,
      remainingFunds: Math.max(0, this.allocationBudget - totalSpend),
      committedAt: new Date().toISOString()
    };
  }

  /**
   * Renders allocation rows for the provided category containers with current counts.
   */
  private rerenderAllocations(): void {
    const categoryTargets: Array<["units" | "supplies" | "support" | "logistics", HTMLElement | null]> = [
      ["units", this.allocationUnitList],
      ["supplies", this.allocationSupplyList],
      ["support", this.allocationSupportList],
      ["logistics", this.allocationLogisticsList]
    ];

    categoryTargets.forEach(([category, container]) => {
      if (!container) {
        return;
      }
      const allocations = ALLOCATION_BY_CATEGORY.get(category);
      if (!allocations) {
        container.innerHTML = "";
        return;
      }
      container.innerHTML = allocations
        .map((option) => this.renderAllocationItem(option, this.allocationCounts.get(option.key) ?? 0))
        .join("");
    });
  }

  /**
   * Attaches delegated event handlers to each allocation list so +/− controls update state.
   * We bind once per container and rely on a private flag to avoid duplicate listeners on re-render.
   */
  private bindAllocationLists(): void {
    this.bindAllocationInteraction(this.allocationUnitList);
    this.bindAllocationInteraction(this.allocationSupplyList);
    this.bindAllocationInteraction(this.allocationSupportList);
    this.bindAllocationInteraction(this.allocationLogisticsList);
  }

  /**
   * Produces markup for a single allocation row including controls with accessibility metadata.
   */
  private renderAllocationItem(option: UnitAllocationOption, quantity: number): string {
    const totalCost = option.costPerUnit * quantity;
    const lockedBaseline = this.predeployedCounts.get(option.key) ?? 0;
    const decrementDisabled = quantity <= lockedBaseline;
    const incrementDisabled = quantity >= option.maxQuantity;
    const baselineBadge = lockedBaseline > 0
      ? `<span class="allocation-lock" aria-label="Scenario provides ${lockedBaseline} ${option.label} unit${lockedBaseline === 1 ? "" : "s"}.">Scenario asset ×${lockedBaseline}</span>`
      : "";
    return `
      <li class="allocation-item" data-key="${option.key}">
        <header>
          <div class="allocation-visual">
            ${option.spriteUrl ? `<img src="${option.spriteUrl}" alt="${option.label}" class="allocation-thumb" />` : `<div class="allocation-fallback">${option.label.charAt(0)}</div>`}
          </div>
          <div class="allocation-copy">
            <div class="allocation-title-row">
              <h4>${option.label}</h4>
              <span class="allocation-cost">$${option.costPerUnit.toLocaleString()} ea.</span>
            </div>
            <p>${option.description}</p>
            ${baselineBadge}
          </div>
        </header>
        <footer class="allocation-meta">
          <div class="allocation-quantity" role="group" aria-label="${option.label} quantity controls">
            <button
              type="button"
              class="allocation-btn"
              data-action="decrement"
              data-key="${option.key}"
              data-delta="-1"
              aria-label="Decrease ${option.label}"
              ${decrementDisabled ? "disabled" : ""}
            >−</button>
            <span class="allocation-count" aria-live="polite">${quantity}</span>
            <button
              type="button"
              class="allocation-btn"
              data-action="increment"
              data-key="${option.key}"
              data-delta="1"
              aria-label="Increase ${option.label}"
              ${incrementDisabled ? "disabled" : ""}
            >+</button>
          </div>
          <span class="allocation-total">$${totalCost.toLocaleString()}</span>
        </footer>
      </li>
    `;
  }

  /**
   * Hooks click and keyboard handlers for a given allocation list to manage state updates.
   */
  private bindAllocationInteraction(container: HTMLElement | null): void {
    if (!container) {
      return;
    }

    const allocationElement = container as AllocationListElement;
    if (allocationElement.__allocationListenersAttached) {
      return;
    }
    allocationElement.__allocationListenersAttached = true;

    container.addEventListener("click", (event) => this.handleAllocationContainerClick(event));
    container.addEventListener("keydown", (event) => this.handleAllocationContainerKeydown(event as KeyboardEvent));
  }

  /**
   * Delegated click handler that routes plus/minus interactions to the state adjustment routine.
   */
  private handleAllocationContainerClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const button = target.closest<HTMLButtonElement>("button[data-action]");
    if (!button) {
      return;
    }

    const key = button.getAttribute("data-key") ?? button.closest("[data-key]")?.getAttribute("data-key");
    if (!key) {
      return;
    }

    const rawDelta = button.getAttribute("data-delta") ?? button.getAttribute("data-adjust");
    const parsedDelta = rawDelta ? Number(rawDelta) : button.dataset.action === "increment" ? 1 : -1;
    if (Number.isNaN(parsedDelta)) {
      console.warn(`Allocation control for key ${key} provided an invalid delta.`);
      return;
    }

    this.handleAllocationAdjustment(key, parsedDelta);
  }

  /**
   * Keyboard handler that enables ArrowUp and ArrowDown to adjust quantities while buttons are focused.
   */
  private handleAllocationContainerKeydown(event: KeyboardEvent): void {
    const button = event.target as HTMLElement;
    if (!button) {
      return;
    }

    const optionKey = button.getAttribute("data-key") ?? button.closest("[data-key]")?.getAttribute("data-key");
    const deltaAttr = button.getAttribute("data-delta") ?? button.getAttribute("data-adjust");

    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      if (optionKey && deltaAttr) {
        const delta = Number(deltaAttr);
        if (!Number.isNaN(delta)) {
          this.handleAllocationAdjustment(optionKey, delta);
        }
      }
      return;
    }

    if (button.matches("[data-action]") && optionKey) {
      const delta = deltaAttr ? Number(deltaAttr) : button.dataset.action === "increment" ? 1 : -1;
      if (!Number.isNaN(delta)) {
        this.handleAllocationAdjustment(optionKey, delta);
      }
    }
  }

  /**
   * Adjusts allocation counts with clamping and triggers re-render flows.
   */
  private handleAllocationAdjustment(optionKey: string, delta: number): void {
    const option = getAllocationOption(optionKey);
    if (!option) {
      console.warn("Attempted to adjust unknown allocation option", optionKey);
      return;
    }

    const current = this.allocationCounts.get(optionKey) ?? 0;
    const baseline = this.predeployedCounts.get(optionKey) ?? 0;
    const next = Math.max(baseline, Math.min(option.maxQuantity, current + delta));
    if (next === current) {
      return;
    }

    this.allocationCounts.set(optionKey, next);
    this.allocationDirty = true;
    this.rerenderAllocations();
    this.updateBudgetDisplay();
    // Surface over-budget risk via the feedback banner so the commander understands why proceeding is blocked.
    const remainingBudget = this.allocationBudget - this.calculateSpend();
    if (remainingBudget < 0) {
      this.allocationFeedbackElement.classList.add("feedback--warning");
    } else {
      this.allocationFeedbackElement.classList.remove("feedback--warning");
    }
    if (typeof console !== "undefined") {
      console.assert(
        (this.allocationBudget - this.calculateSpend()) >= 0 || this.proceedToBattleButton?.disabled === true,
        "Budget gating failed to disable proceed button when over budget."
      );
    }

    // Advance tutorial if this action completes a tutorial step
    this.advanceTutorialIfNeeded(optionKey, next);
  }

  /**
   * Resets all allocation counts to zero and refreshes the UI.
   */
  private resetAllocations(): void {
    for (const key of this.allocationCounts.keys()) {
      const baseline = this.predeployedCounts.get(key) ?? 0;
      this.allocationCounts.set(key, baseline);
    }
    this.allocationDirty = false;
    this.rerenderAllocations();
    this.updateBudgetDisplay();
    this.allocationFeedbackElement.textContent = "Allocate forces and supplies to prepare for deployment.";
  }

  /**
   * Updates budget labels, panel state, and proceed button gating.
   */
  private updateBudgetDisplay(): void {
    const spent = this.calculateSpend();
    const remaining = this.allocationBudget - spent;

    this.budgetSpentElement.textContent = `Spent: $${spent.toLocaleString()}`;
    this.budgetRemainingElement.textContent = `Remaining: $${Math.max(remaining, 0).toLocaleString()}`;
    this.budgetPanel.dataset.state = remaining < 0 ? "over-budget" : "within-budget";
    this.proceedToBattleButton.disabled = remaining < 0 || spent === 0;
    // Normalize feedback styling before we decide which state to present so repeated calls cannot accumulate stale classes.
    this.allocationFeedbackElement.classList.remove("feedback--warning", "feedback--ready");
    if (remaining < 0) {
      this.allocationFeedbackElement.textContent = "Over budget: adjust allocations before proceeding.";
      this.allocationFeedbackElement.classList.add("feedback--warning");
    } else if (spent === 0) {
      this.allocationFeedbackElement.textContent = "Allocate at least one asset to continue.";
    } else {
      this.allocationFeedbackElement.textContent = "Budget status nominal. You may proceed when ready.";
      this.allocationFeedbackElement.classList.add("feedback--ready");
    }

    // Campaign gating: enforce economy-derived caps in addition to money budget when applicable.
    if (this.activeMissionKey === "campaign" && this.campaignCaps) {
      // Units cap uses requisition quantities only (scenario-provided baselines do not consume campaign manpower).
      const unitOptions = ALLOCATION_BY_CATEGORY.get("units") ?? [];
      let requestedUnits = 0;
      unitOptions.forEach((option) => {
        const qty = this.allocationCounts.get(option.key) ?? 0;
        const baseline = this.predeployedCounts.get(option.key) ?? 0;
        requestedUnits += Math.max(0, qty - baseline);
      });

      const airKeys = ["scoutPlaneWing", "fighter", "interceptorWing", "groundAttackWing", "bomber", "transportWing"];
      let requestedAir = 0;
      airKeys.forEach((key) => {
        const qty = this.allocationCounts.get(key) ?? 0;
        const baseline = this.predeployedCounts.get(key) ?? 0;
        requestedAir += Math.max(0, qty - baseline);
      });

      const requestedAmmo = this.allocationCounts.get("ammo") ?? 0;
      const requestedFuel = this.allocationCounts.get("fuel") ?? 0;

      const over: string[] = [];
      if (requestedUnits > this.campaignCaps.manpowerUnits) over.push("units");
      if (requestedAir > this.campaignCaps.airSlots) over.push("air slots");
      if (requestedAmmo > this.campaignCaps.ammo) over.push("ammo");
      if (requestedFuel > this.campaignCaps.fuel) over.push("fuel");

      if (over.length > 0) {
        this.proceedToBattleButton.disabled = true;
        this.allocationFeedbackElement.classList.remove("feedback--ready");
        this.allocationFeedbackElement.classList.add("feedback--warning");
        this.allocationFeedbackElement.textContent = `Campaign caps exceeded: ${over.join(", ")}. Adjust allocations.`;
      } else if (remaining >= 0 && spent > 0) {
        this.allocationFeedbackElement.textContent = "Budget and campaign caps OK. You may proceed.";
        this.allocationFeedbackElement.classList.add("feedback--ready");
      }
    }
  }

  /**
   * Presents the allocation warning overlay when the player attempts to proceed with no units.
   */
  private showAllocationWarning(): void {
    this.allocationWarningOverlay.classList.remove("hidden");
    this.allocationWarningModal.setAttribute("aria-hidden", "false");
    // Move focus inside the modal so screen readers announce the warning content immediately.
    if (typeof this.allocationWarningModal.focus === "function") {
      this.allocationWarningModal.focus();
    } else {
      this.allocationWarningModal.setAttribute("tabindex", "-1");
      this.allocationWarningModal.focus();
    }
  }

  /**
   * Hides the allocation warning overlay.
   */
  private hideAllocationWarning(): void {
    this.allocationWarningOverlay.classList.add("hidden");
    this.allocationWarningModal.setAttribute("aria-hidden", "true");
  }

  /**
   * Calculates the cumulative allocation spend for reuse across rendering helpers.
   */
  private calculateSpend(): number {
    let spent = 0;
    for (const [key, quantity] of this.allocationCounts.entries()) {
      const option = getAllocationOption(key);
      if (!option) {
        console.warn("Missing allocation option during budget update", key);
        continue;
      }
      const baseline = this.predeployedCounts.get(key) ?? 0;
      const requisitionQty = Math.max(0, quantity - baseline);
      spent += option.costPerUnit * requisitionQty;
    }
    return spent;
  }

  /**
   * Aggregates scenario-provided player units so the precombat panel can surface locked allocations
   * and convey that these troops are already in theater at mission start.
   */
  private seedPredeployedAllocations(): void {
    this.predeployedCounts.clear();
    this.predeployedRoster.clear();

    const rawUnits = (scenarioSource.sides?.Player?.units ?? []) as unknown as Array<ScenarioUnit & { preDeployed?: boolean }>;
    // Only scenario units explicitly marked preDeployed=true are treated as baseline assets.
    const playerUnits = rawUnits.filter((u) => (u as unknown as { preDeployed?: boolean }).preDeployed === true);
    if (playerUnits.length === 0) {
      return;
    }

    const deploymentState = ensureDeploymentState();

    playerUnits.forEach((unit) => {
      const scenarioType = unit.type as string;
      const allocationKey = deploymentState.getUnitKeyForScenarioType(scenarioType) ?? scenarioType;
      const option = getAllocationOption(allocationKey);
      const label = option?.label ?? this.formatScenarioLabel(scenarioType);

      const nextCount = (this.predeployedCounts.get(allocationKey) ?? 0) + 1;
      this.predeployedCounts.set(allocationKey, nextCount);
      this.predeployedRoster.set(allocationKey, {
        label,
        scenarioType,
        count: nextCount
      });

      const current = this.allocationCounts.get(allocationKey) ?? 0;
      this.allocationCounts.set(allocationKey, Math.max(current, nextCount));
    });

    this.renderPredeployedOverview();
  }

  /**
   * Computes campaign-driven caps from the stored bridge snapshot (scenario + economies).
   * Air cap comes from total airSortieCapacity across player-controlled airbases.
   * Manpower/supplies/fuel caps are coarse-grained conversions to allocation counts.
   */
  private computeCampaignCaps(): void {
    const bridge = this.battleState.getCampaignBridgeState?.();
    if (!bridge || !bridge.scenario) {
      this.campaignCaps = null;
      return;
    }
    const scenario = bridge.scenario;
    const economy = (scenario.economies ?? []).find((e) => e.faction === "Player");
    if (!economy) {
      this.campaignCaps = null;
      return;
    }

    let airSlots = 0;
    const palette = scenario.tilePalette || {};
    (scenario.tiles || []).forEach((instance) => {
      const def = palette[instance.tile];
      const owner = instance.factionControl ?? def?.factionControl;
      if (def && owner === "Player" && def.role === "airbase") {
        airSlots += def.airSortieCapacity ?? 0;
      }
    });

    const manpowerUnits = Math.max(0, Math.floor((economy.manpower ?? 0) / 10));
    const ammo = Math.max(0, Math.floor((economy.supplies ?? 0) / 10));
    const fuel = Math.max(0, Math.floor((economy.fuel ?? 0) / 10));
    this.campaignCaps = { manpowerUnits, airSlots, ammo, fuel };
  }

  /**
   * Builds the predeployment summary list so commanders can see their scenario forces before requisitioning extras.
   */
  private renderPredeployedOverview(): void {
    if (!this.predeployedSummaryElement || !this.predeployedListElement) {
      return;
    }

    const entries = Array.from(this.predeployedRoster.values());
    if (entries.length === 0) {
      this.predeployedSummaryElement.textContent = "No scenario forces are staged in theater. All allocations originate from requisitions.";
      this.predeployedListElement.innerHTML = "";
      return;
    }

    const totalUnits = entries.reduce((sum, entry) => sum + entry.count, 0);
    this.predeployedSummaryElement.textContent = `${totalUnits} unit${totalUnits === 1 ? "" : "s"} arrive with the scenario and are locked in theatre. Additional requisitions add to these totals.`;

    this.predeployedListElement.innerHTML = entries
      .map((entry) => `<li><span class="predeployed-label">${entry.label}</span><span class="predeployed-count">×${entry.count}</span></li>`)
      .join("");
  }

  /**
   * Provides a readable fallback label when allocation metadata is unavailable for a scenario unit type.
   */
  private formatScenarioLabel(scenarioType: string): string {
    return scenarioType
      .replace(/_/g, " ")
      .replace(/\w\S*/g, (fragment) => fragment.charAt(0).toUpperCase() + fragment.slice(1).toLowerCase());
  }

  /**
   * Populates the mission briefing panel with objectives, timeline, and logistical expectations.
   */
  private renderMissionSummary(missionKey: MissionKey): void {
    const title = getMissionTitle(missionKey);
    const briefing = getMissionBriefing(missionKey);
    const summary = MISSION_SUMMARY_FALLBACKS[missionKey] ?? {
      objectives: ["Operational objectives will be synchronized once mission data is linked."],
      turnLimit: 0,
      doctrine: "Doctrine brief will populate when campaign data is connected.",
      supplies: [{ label: "Supplies", amount: "Awaiting logistics data" }]
    } satisfies (typeof MISSION_SUMMARY_FALLBACKS)[string];

    this.missionTitleElement.textContent = title;
    this.missionBriefingElement.textContent = briefing;
    this.objectiveListElement.innerHTML = summary.objectives
      .map((objective) => `<li>${objective}</li>`)
      .join("");
    this.missionTurnLimitElement.textContent = summary.turnLimit > 0 ? `${summary.turnLimit} turns` : "Pending";
    this.baselineSupplyListElement.innerHTML = summary.supplies
      .map((item) => `<li><strong>${item.label}:</strong> ${item.amount}</li>`)
      .join("");
    this.doctrineNotesElement.textContent = summary.doctrine;

    const missionInfo = {
      missionKey,
      title,
      briefing,
      objectives: summary.objectives,
      doctrine: summary.doctrine,
      turnLimit: summary.turnLimit > 0 ? summary.turnLimit : null,
      baselineSupplies: summary.supplies
    };
    this.battleState.setPrecombatMissionInfo(missionInfo);
  }

  private renderMiniMap(): void {
    this.miniMapRenderer.render(this.miniMapSvg, this.miniMapCanvas, this.miniMapScenario);
    this.miniMapCanvas.style.width = "100%";
    this.miniMapCanvas.style.height = "100%";
    this.miniMapSvg.removeAttribute("width");
    this.miniMapSvg.removeAttribute("height");
    this.miniMapSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    this.miniMapSvg.style.width = "100%";
    this.miniMapSvg.style.height = "100%";
    const terrainSprites = Array.from(this.miniMapSvg.querySelectorAll<SVGImageElement>(".terrain-sprite"));
    terrainSprites.forEach((sprite) => sprite.remove());
    const hexTiles = Array.from(this.miniMapSvg.querySelectorAll<SVGPolygonElement>(".hex-tile"));
    hexTiles.forEach((polygon) => {
      polygon.setAttribute("stroke-width", "0.6");
    });
  }

  /**
   * Summarizes the assigned commander's readiness so the player can double-check roster context.
   */
  private renderGeneralSummary(selectedGeneralId: string | null): void {
    const rosterSize = getAllGenerals().length;
    if (!selectedGeneralId) {
      this.commanderCardElement.classList.add("is-unassigned");
      this.commanderNameElement.textContent = "No commander assigned.";
      this.commanderSummaryElement.textContent =
        rosterSize === 0
          ? "Commission a commander on the landing screen to unlock tailored operations."
          : "Select a commander to review their readiness stats.";
      this.updateCommanderStats(null);
      return;
    }

    const general = findGeneralById(selectedGeneralId);
    if (!general) {
      this.commanderCardElement.classList.add("is-unassigned");
      this.commanderNameElement.textContent = "Assigned commander not found.";
      this.commanderSummaryElement.textContent = "Reassign a commander before continuing to deployment.";
      this.updateCommanderStats(null);
      // Clear the cached commander when roster data goes missing so battle UI falls back gracefully.
      this.battleState.setAssignedCommanderId(null);
      return;
    }

    this.commanderCardElement.classList.remove("is-unassigned");
    this.commanderNameElement.textContent = general.identity.name;
    const missionsCompleted = general.serviceRecord?.missionsCompleted ?? 0;
    const victories = general.serviceRecord?.victoriesAchieved ?? 0;
    this.commanderSummaryElement.textContent =
      `Active commander with ${missionsCompleted} mission${missionsCompleted === 1 ? "" : "s"} and ${victories} victory${victories === 1 ? "" : "ies"}.`;
    this.updateCommanderStats(general);
    // Mirror the assignment certainty after validating roster presence to keep BattleState in sync with the UI card.
    this.battleState.setAssignedCommanderId(general.id);
  }

  /**
   * Updates commander stat fields with the latest roster data snapshot.
   */
  private updateCommanderStats(general: ReturnType<typeof findGeneralById>): void {
    const missions = general?.serviceRecord?.missionsCompleted ?? 0;
    const victories = general?.serviceRecord?.victoriesAchieved ?? 0;
    const unitsDeployed = general?.serviceRecord?.unitsDeployed ?? 0;
    const casualties = general?.serviceRecord?.casualtiesSustained ?? 0;

    this.commanderMissionsElement.textContent = missions.toString();
    this.commanderVictoriesElement.textContent = victories.toString();
    this.commanderUnitsElement.textContent = unitsDeployed.toString();
    this.commanderCasualtiesElement.textContent = casualties.toString();
  }

  /**
   * Helper that throws when required DOM is missing so initialization fails fast.
   */
  private requireElement<T extends HTMLElement>(selector: string): T {
    const element = this.element.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Required precombat element not found: ${selector}`);
    }
    return element;
  }
}
