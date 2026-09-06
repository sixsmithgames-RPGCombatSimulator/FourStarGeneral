/**
 * Enhanced Initiative Turn Controls
 * 
 * Provides advanced turn control buttons and status display for the grouped initiative system.
 * Features player unit completion controls with proceed button and auto-advance logic.
 * 
 * @since Initiative System v2.0
 */

import type { UnitActivation } from '../../core/InitiativeQueue';
import type { InitiativeGroup } from '../../core/GroupedInitiativeQueue';
import type { ExtendedBattlePhase } from '../../game/GameEngineInitiativeExtensions';

/**
 * Enhanced turn control configuration
 */
export interface EnhancedTurnControlConfig {
  /** Whether to show skip turn button */
  showSkipTurn: boolean;
  /** Whether to show the adaptive next-group/end-turn button */
  showAdvanceButton: boolean;
  /** Whether to show proceed button */
  showProceedButton: boolean;
  /** Whether to show current unit info */
  showCurrentUnitInfo: boolean;
  /** Whether to show group info */
  showGroupInfo: boolean;
  /** Whether to enable keyboard shortcuts */
  enableKeyboardShortcuts: boolean;
}

/**
 * Default enhanced turn control configuration
 */
const DEFAULT_CONFIG: EnhancedTurnControlConfig = {
  showSkipTurn: true,
  showAdvanceButton: true,
  showProceedButton: true,
  showCurrentUnitInfo: true,
  showGroupInfo: true,
  enableKeyboardShortcuts: true
};

/**
 * Enhanced turn control events
 */
export interface EnhancedTurnControlEvents {
  /** Fired when skip turn is requested */
  onSkipTurn: () => void;
  /** Fired when end turn is requested */
  onEndTurn: () => void;
  /** Fired when the active initiative group should be completed */
  onNextGroup: () => void;
  /** Fired when next activation is requested */
  onNextActivation: () => void;
  /** Fired when current unit action is completed */
  onCompleteActivation: (unitId: string) => void;
  /** Fired when player proceeds to next unit */
  onProceedToNext: () => void;
  /** Fired when player wants to skip remaining units in group */
  onSkipGroup: () => void;
}

/**
 * Unit completion state for auto-advance logic
 */
interface UnitCompletionState {
  /** Whether unit has moved */
  hasMoved: boolean;
  /** Whether unit has attacked */
  hasAttacked: boolean;
  /** Whether unit has used special abilities */
  hasUsedAbilities: boolean;
  /** Whether unit is out of actions */
  isExhausted: boolean;
}

/**
 * Manages enhanced turn control UI for the grouped initiative system
 */
export class EnhancedInitiativeTurnControls {
  private readonly container: HTMLElement;
  private readonly config: EnhancedTurnControlConfig;
  private readonly events: EnhancedTurnControlEvents;
  private currentUnit: UnitActivation | null = null;
  private currentGroup: InitiativeGroup | null = null;
  private currentPhase: ExtendedBattlePhase = 'deployment';
  private isPlayerTurn = false;
  private roundAdvanceReady = false;
  private controlsEnabled = true;
  private unitCompletionStates: Map<string, UnitCompletionState> = new Map();

  /**
   * Create new enhanced initiative turn controls
   * 
   * @param container - Container element for controls
   * @param events - Event handlers
   * @param config - Configuration options
   */
  constructor(
    container: HTMLElement,
    events: EnhancedTurnControlEvents,
    config: Partial<EnhancedTurnControlConfig> = {}
  ) {
    this.container = container;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events;

    this.initializeControls();
    this.attachEventListeners();
    this.injectStyles();
  }

  /**
   * Update the current unit activation
   * 
   * @param activation - Current unit activation or null
   */
  public updateCurrentUnit(activation: UnitActivation | null): void {
    this.currentUnit = activation;
    this.updateControlStates();
    this.updateCurrentUnitDisplay();
    this.updateStatusSummary();
  }

  /**
   * Update the current group
   * 
   * @param group - Current initiative group or null
   */
  public updateCurrentGroup(group: InitiativeGroup | null): void {
    this.currentGroup = group;
    this.updateControlStates();
    this.updateGroupDisplay();
    this.updateStatusSummary();
  }

  /**
   * Update the current turn phase
   * 
   * @param phase - Current turn phase
   */
  public updatePhase(phase: ExtendedBattlePhase): void {
    this.currentPhase = phase;
    this.updateControlStates();
    this.updatePhaseDisplay();
    this.updateStatusSummary();
  }

  /**
   * Update whether it's the player's turn
   * 
   * @param isPlayerTurn - Whether it's player's turn
   */
  public updatePlayerTurn(isPlayerTurn: boolean): void {
    this.isPlayerTurn = isPlayerTurn;
    this.updateControlStates();
    this.updateStatusSummary();
  }

  /**
   * Update whether the round is ready to advance to the next turn.
   *
   * @param ready - True when no activations remain and the commander can end the round.
   */
  public updateRoundAdvanceReady(ready: boolean): void {
    this.roundAdvanceReady = ready;
    this.updateControlStates();
    this.updateStatusSummary();
  }

  /**
   * Update unit completion state for auto-advance logic
   * 
   * @param unitId - ID of the unit
   * @param actionType - Type of action completed
   */
  public updateUnitCompletionState(unitId: string, actionType: 'move' | 'attack' | 'ability'): void {
    if (!this.unitCompletionStates.has(unitId)) {
      this.unitCompletionStates.set(unitId, {
        hasMoved: false,
        hasAttacked: false,
        hasUsedAbilities: false,
        isExhausted: false
      });
    }

    const state = this.unitCompletionStates.get(unitId)!;
    
    switch (actionType) {
      case 'move':
        state.hasMoved = true;
        break;
      case 'attack':
        state.hasAttacked = true;
        break;
      case 'ability':
        state.hasUsedAbilities = true;
        break;
    }

    // Check if unit is exhausted (no more actions available)
    this.updateUnitExhaustion(unitId);
  }

  /**
   * Reset unit completion state (for new turns)
   * 
   * @param unitId - ID of the unit to reset (optional, resets all if not provided)
   */
  public resetUnitCompletionState(unitId?: string): void {
    if (unitId) {
      this.unitCompletionStates.delete(unitId);
    } else {
      this.unitCompletionStates.clear();
    }
  }

  /**
   * Enable or disable all controls
   * 
   * @param enabled - Whether controls should be enabled
   */
  public setControlsEnabled(enabled: boolean): void {
    this.controlsEnabled = enabled;
    this.updateControlStates();
  }

  /**
   * Show a status message
   * 
   * @param message - Status message to display
   * @param duration - Duration in milliseconds (0 for persistent)
   */
  public showStatusMessage(message: string, duration: number = 3000): void {
    const statusElement = this.container.querySelector('.turn-status-message') as HTMLElement;
    if (!statusElement) {
      return;
    }

    statusElement.textContent = message;
    statusElement.style.display = 'block';

    if (duration > 0) {
      setTimeout(() => {
        statusElement.style.display = 'none';
      }, duration);
    }
  }

  /**
   * Clear the status message
   */
  public clearStatusMessage(): void {
    const statusElement = this.container.querySelector('.turn-status-message') as HTMLElement;
    if (statusElement) {
      statusElement.style.display = 'none';
    }
  }

  /**
   * Get the current unit
   * 
   * @returns Current unit or null
   */
  public getCurrentUnit(): UnitActivation | null {
    return this.currentUnit;
  }

  /**
   * Get the current group
   * 
   * @returns Current group or null
   */
  public getCurrentGroup(): InitiativeGroup | null {
    return this.currentGroup;
  }

  /**
   * Dispose of the turn controls
   */
  public dispose(): void {
    this.removeEventListeners();
    this.container.innerHTML = '';
  }

  /**
   * Initialize the control UI
   */
  private initializeControls(): void {
    this.container.className = 'enhanced-initiative-turn-controls';
    this.container.innerHTML = `
      <div class="initiative-status" data-initiative-status data-current-initiative-group="">
        <span class="initiative-status__label">Initiative</span>
        <strong class="initiative-status__value">Waiting for deployment</strong>
        <span class="initiative-status__detail">Initiative order begins when the battle starts.</span>
      </div>
      <div class="turn-controls-buttons">
        ${this.config.showProceedButton ? `
          <button class="compact-button proceed-btn" disabled title="End the active unit's orders and hand off initiative (Space)">
            End Turn
          </button>
        ` : ''}
        
        ${this.config.showSkipTurn ? `
          <button class="compact-button skip-group-btn" disabled title="Order every remaining formation in this initiative group to hold on sentry, then pass initiative (Shift+Space)">
            Hold Group
          </button>
        ` : ''}
        
        <button class="compact-button next-activation-btn" disabled title="Select the next formation that can receive orders in this initiative group (Tab)">
          Next Formation
        </button>
        
        ${this.config.showAdvanceButton ? `
          <button class="compact-button group-advance-btn" disabled title="Complete this initiative group and pass command (Enter)">
            Next Group
          </button>
        ` : ''}
      </div>
    `;
  }

  /**
   * Attach event listeners to controls
   */
  private attachEventListeners(): void {
    // Proceed button
    const proceedBtn = this.container.querySelector('.proceed-btn') as HTMLButtonElement;
    if (proceedBtn) {
      proceedBtn.addEventListener('click', () => {
        this.events.onProceedToNext();
      });
    }

    // Skip group button
    const skipGroupBtn = this.container.querySelector('.skip-group-btn') as HTMLButtonElement;
    if (skipGroupBtn) {
      skipGroupBtn.addEventListener('click', () => {
        this.events.onSkipGroup();
      });
    }

    // Adaptive group/turn advance button
    const advanceBtn = this.container.querySelector('.group-advance-btn') as HTMLButtonElement;
    if (advanceBtn) {
      advanceBtn.addEventListener('click', () => {
        this.dispatchAdvanceAction();
      });
    }

    // Next activation button
    const nextBtn = this.container.querySelector('.next-activation-btn') as HTMLButtonElement;
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.events.onNextActivation();
      });
    }

    // Keyboard shortcuts
    if (this.config.enableKeyboardShortcuts) {
      this.attachKeyboardListeners();
    }
  }

  /**
   * Attach keyboard shortcut listeners
   */
  private attachKeyboardListeners(): void {
    const keyHandler = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      const target = event.target instanceof Element ? event.target : null;
      if (
        target?.closest(
          "button, [role='button'], a, input, textarea, select, [contenteditable='true'], [role='dialog'], [aria-modal='true']"
        )
      ) {
        return;
      }

      switch (event.key) {
        case ' ':
          event.preventDefault();
          if (event.shiftKey) {
            // Shift+Space: Skip group
            if (this.isControlEnabled('.skip-group-btn')) {
              this.events.onSkipGroup();
            }
          } else {
            // Space: Proceed
            if (this.isControlEnabled('.proceed-btn')) {
              this.events.onProceedToNext();
            }
          }
          break;
        case 'Enter':
          event.preventDefault();
          if (this.isControlEnabled('.group-advance-btn')) {
            this.dispatchAdvanceAction();
          }
          break;
        case 'Tab':
          // Modified Tab belongs to native focus/browser navigation, including return after intel dismissal.
          if (event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
            return;
          }
          event.preventDefault();
          if (this.isControlEnabled('.next-activation-btn')) {
            this.events.onNextActivation();
          }
          break;
      }
    };

    document.addEventListener('keydown', keyHandler);
    
    // Store handler for cleanup
    (this as any)._keyHandler = keyHandler;
  }

  /**
   * Remove event listeners
   */
  private removeEventListeners(): void {
    const keyHandler = (this as any)._keyHandler;
    if (keyHandler) {
      document.removeEventListener('keydown', keyHandler);
      delete (this as any)._keyHandler;
    }
  }

  /**
   * Check if a control is enabled
   * 
   * @param selector - CSS selector for the control
   * @returns True if control is enabled
   */
  private isControlEnabled(selector: string): boolean {
    const control = this.container.querySelector(selector) as HTMLButtonElement;
    return control && !control.disabled;
  }

  /**
   * Dispatch the primary initiative action at the scope shown to the player.
   *
   * The control advances only the active group until the queue is empty. This
   * keeps a label change from silently broadening a group command into a full
   * turn command.
   */
  private dispatchAdvanceAction(): void {
    if (this.roundAdvanceReady) {
      this.events.onEndTurn();
      return;
    }

    this.events.onNextGroup();
  }

  /**
   * Update control states based on current game state
   */
  private updateControlStates(): void {
    const proceedBtn = this.container.querySelector('.proceed-btn') as HTMLButtonElement;
    const skipGroupBtn = this.container.querySelector('.skip-group-btn') as HTMLButtonElement;
    const advanceBtn = this.container.querySelector('.group-advance-btn') as HTMLButtonElement;
    const nextBtn = this.container.querySelector('.next-activation-btn') as HTMLButtonElement;

    // Enable/disable based on phase and activation
    const isInInitiativePhase = this.currentPhase === 'initiativeTurn';
    const hasCurrentUnit = this.currentUnit !== null;
    const isPlayerUnit = this.currentUnit?.ownerId === 'player';
    const canAdvanceRound = this.roundAdvanceReady;

    if (proceedBtn) {
      proceedBtn.disabled = !this.controlsEnabled || !isInInitiativePhase || !hasCurrentUnit || !isPlayerUnit || canAdvanceRound;
    }

    if (skipGroupBtn) {
      skipGroupBtn.disabled = !this.controlsEnabled || !isInInitiativePhase || !this.isPlayerTurn || canAdvanceRound;
    }

    if (advanceBtn) {
      advanceBtn.disabled = !this.controlsEnabled || !((isInInitiativePhase && this.isPlayerTurn) || canAdvanceRound);
      advanceBtn.textContent = canAdvanceRound ? "End Turn" : "Next Group";
      advanceBtn.title = canAdvanceRound
        ? "All initiative groups are complete. Advance to the next battle turn (Enter)"
        : "Complete this initiative group and pass command (Enter)";
    }

    if (nextBtn) {
      nextBtn.disabled = !this.controlsEnabled || !isInInitiativePhase || !hasCurrentUnit || !isPlayerUnit || canAdvanceRound;
    }

    // Update turn indicator
    this.updateTurnIndicator();
  }

  /**
   * Update current unit display
   */
  private updateCurrentUnitDisplay(): void {
    if (!this.config.showCurrentUnitInfo) {
      return;
    }

    const unitInfo = this.container.querySelector('.current-unit-info') as HTMLElement;
    const unitName = this.container.querySelector('.current-unit-name') as HTMLElement;
    const unitOwner = this.container.querySelector('.current-unit-owner') as HTMLElement;
    const moveStatus = this.container.querySelector('.move-status') as HTMLElement;
    const attackStatus = this.container.querySelector('.attack-status') as HTMLElement;
    const abilityStatus = this.container.querySelector('.ability-status') as HTMLElement;

    if (!unitInfo || !unitName || !unitOwner || !moveStatus || !attackStatus || !abilityStatus) {
      return;
    }

    if (this.currentUnit) {
      unitInfo.style.display = 'block';
      unitName.textContent = this.currentUnit.ownerId === 'player' ? 'Player Unit' : 'Enemy Unit';
      unitOwner.textContent = `${this.currentUnit.ownerId === 'player' ? 'Player' : 'Bot'} (Initiative ${this.currentUnit.initiative})`;

      // Update action status
      const completionState = this.unitCompletionStates.get(this.currentUnit.unitId);
      if (completionState) {
        moveStatus.textContent = completionState.hasMoved ? 'Moved' : 'Not moved';
        moveStatus.className = `action-status move-status ${completionState.hasMoved ? 'completed' : 'pending'}`;
        
        attackStatus.textContent = completionState.hasAttacked ? 'Attacked' : 'Not attacked';
        attackStatus.className = `action-status attack-status ${completionState.hasAttacked ? 'completed' : 'pending'}`;
        
        abilityStatus.textContent = completionState.hasUsedAbilities ? 'Abilities used' : 'No abilities used';
        abilityStatus.className = `action-status ability-status ${completionState.hasUsedAbilities ? 'completed' : 'pending'}`;
      } else {
        moveStatus.textContent = 'Not moved';
        attackStatus.textContent = 'Not attacked';
        abilityStatus.textContent = 'No abilities used';
      }
    } else {
      unitInfo.style.display = 'none';
    }
  }

  /**
   * Update group display
   */
  private updateGroupDisplay(): void {
    if (!this.config.showGroupInfo) {
      return;
    }

    const groupInfo = this.container.querySelector('.current-group-info') as HTMLElement;
    const groupInitiative = this.container.querySelector('.group-initiative') as HTMLElement;
    const progressFill = this.container.querySelector('.progress-fill') as HTMLElement;
    const progressText = this.container.querySelector('.progress-text') as HTMLElement;

    if (!groupInfo || !groupInitiative || !progressFill || !progressText) {
      return;
    }

    if (this.currentGroup) {
      groupInfo.style.display = 'block';
      groupInitiative.textContent = `Initiative ${this.currentGroup.initiative}`;
      
      const completedUnits = this.currentGroup.units.filter(u => u.isActivated).length;
      const totalUnits = this.currentGroup.units.length;
      const progressPercent = (completedUnits / totalUnits) * 100;
      
      progressFill.style.width = `${progressPercent}%`;
      progressText.textContent = `${completedUnits}/${totalUnits}`;
    } else {
      groupInfo.style.display = 'none';
    }
  }

  /**
   * Update phase display
   */
  private updatePhaseDisplay(): void {
    const phaseTitle = this.container.querySelector('.turn-phase-title') as HTMLElement;
    if (!phaseTitle) {
      return;
    }

    const phaseNames: Record<ExtendedBattlePhase, string> = {
      'deployment': 'Deployment',
      'playerTurn': 'Player Turn',
      'allyTurn': 'Ally Turn',
      'botTurn': 'Bot Turn',
      'completed': 'Battle Complete',
      'initiativeTurn': 'Initiative Turn',
      'airShowPhase': 'Air Show',
      'turnEnded': 'Turn Ended'
    };

    phaseTitle.textContent = phaseNames[this.currentPhase] || 'Unknown Phase';
  }

  private updateStatusSummary(): void {
    const statusElement = this.container.querySelector<HTMLElement>('[data-initiative-status]');
    const labelElement = statusElement?.querySelector<HTMLElement>('.initiative-status__label');
    const valueElement = statusElement?.querySelector<HTMLElement>('.initiative-status__value');
    const detailElement = statusElement?.querySelector<HTMLElement>('.initiative-status__detail');
    if (!statusElement || !labelElement || !valueElement || !detailElement) {
      return;
    }

    if (this.roundAdvanceReady) {
      statusElement.dataset.currentInitiativeGroup = "";
      labelElement.textContent = "Initiative Complete";
      valueElement.textContent = "Turn ready";
      detailElement.textContent = "All formations ordered";
      return;
    }

    if (this.currentGroup) {
      const remaining = this.currentGroup.units.filter((unit) => !unit.isActivated).length;
      const ownerLabel = this.currentUnit?.ownerId === 'bot'
        ? "Enemy group"
        : this.currentUnit?.ownerId === 'player'
          ? "Your group"
          : this.isPlayerTurn
            ? "Your group"
            : "Active group";
      statusElement.dataset.currentInitiativeGroup = String(this.currentGroup.initiative);
      labelElement.textContent = `Initiative ${this.currentGroup.initiative}`;
      valueElement.textContent = ownerLabel;
      detailElement.textContent = this.currentUnit?.ownerId === 'bot'
        ? `${remaining} formation${remaining === 1 ? "" : "s"} acting`
        : `${remaining} formation${remaining === 1 ? "" : "s"} ready`;
      return;
    }

    if (this.currentUnit) {
      const ownerLabel = this.currentUnit.ownerId === 'player' ? "Your formation" : "Enemy formation";
      statusElement.dataset.currentInitiativeGroup = String(this.currentUnit.initiative);
      labelElement.textContent = `Initiative ${this.currentUnit.initiative}`;
      valueElement.textContent = ownerLabel;
      detailElement.textContent = this.currentUnit.ownerId === 'player'
        ? "Ready for orders"
        : "Orders resolving";
      return;
    }

    statusElement.dataset.currentInitiativeGroup = "";
    labelElement.textContent = "Initiative";
    valueElement.textContent = this.currentPhase === 'turnEnded' ? "Order complete" : "Awaiting orders";
    detailElement.textContent = this.currentPhase === 'deployment'
      ? "Begins after deployment"
      : "No active formation";
  }

  /**
   * Update turn indicator
   */
  private updateTurnIndicator(): void {
    const indicatorDot = this.container.querySelector('.indicator-dot') as HTMLElement;
    const indicatorText = this.container.querySelector('.indicator-text') as HTMLElement;

    if (!indicatorDot || !indicatorText) {
      return;
    }

    if (this.currentPhase === 'initiativeTurn' && this.currentUnit) {
      indicatorDot.className = 'indicator-dot indicator-active';
      indicatorText.textContent = `${this.currentUnit.ownerId === 'player' ? 'Player' : 'Bot'} Acting`;
    } else if (this.currentPhase === 'initiativeTurn') {
      indicatorDot.className = 'indicator-dot indicator-ready';
      indicatorText.textContent = 'Ready';
    } else {
      indicatorDot.className = 'indicator-dot indicator-inactive';
      indicatorText.textContent = this.currentPhase;
    }
  }

  
  /**
   * Update unit exhaustion state
   * 
   * @param unitId - ID of the unit to check
   */
  private updateUnitExhaustion(unitId: string): void {
    const state = this.unitCompletionStates.get(unitId);
    if (!state) {
      return;
    }

    // Simple logic: unit is exhausted if it has moved and attacked
    // This could be enhanced based on unit type and available actions
    state.isExhausted = state.hasMoved && state.hasAttacked;
  }

  
  
  
  
  /**
   * Inject CSS styles for enhanced turn controls
   */
  private injectStyles(): void {
    // Intentionally empty: this component now relies on shared top-bar button styles.
  }
}
