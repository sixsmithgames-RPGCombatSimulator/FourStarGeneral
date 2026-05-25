/**
 * Initiative Turn Controls
 * 
 * Provides turn control buttons and status display for the initiative system.
 * Replaces traditional turn controls with initiative-specific functionality.
 * 
 * @since Initiative System v1.0
 */

import type { UnitActivation } from '../../core/InitiativeQueue';
import type { ExtendedBattlePhase } from '../../game/GameEngineInitiativeExtensions';

/**
 * Turn control configuration
 */
export interface TurnControlConfig {
  /** Whether to show skip turn button */
  showSkipTurn: boolean;
  /** Whether to show end turn button */
  showEndTurn: boolean;
  /** Whether to show current unit info */
  showCurrentUnitInfo: boolean;
  /** Whether to enable keyboard shortcuts */
  enableKeyboardShortcuts: boolean;
}

/**
 * Default turn control configuration
 */
const DEFAULT_CONFIG: TurnControlConfig = {
  showSkipTurn: true,
  showEndTurn: true,
  showCurrentUnitInfo: true,
  enableKeyboardShortcuts: true
};

/**
 * Turn control events
 */
export interface TurnControlEvents {
  /** Fired when skip turn is requested */
  onSkipTurn: () => void;
  /** Fired when end turn is requested */
  onEndTurn: () => void;
  /** Fired when next activation is requested */
  onNextActivation: () => void;
  /** Fired when current unit action is completed */
  onCompleteActivation: (unitId: string) => void;
}

/**
 * Manages turn control UI for the initiative system
 */
export class InitiativeTurnControls {
  private readonly container: HTMLElement;
  private readonly config: TurnControlConfig;
  private readonly events: TurnControlEvents;
  private currentActivation: UnitActivation | null = null;
  private currentPhase: ExtendedBattlePhase = 'deployment';
  private isPlayerTurn = false;

  /**
   * Create new initiative turn controls
   * 
   * @param container - Container element for controls
   * @param events - Event handlers
   * @param config - Configuration options
   */
  constructor(
    container: HTMLElement,
    events: TurnControlEvents,
    config: Partial<TurnControlConfig> = {}
  ) {
    this.container = container;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.events = events;

    this.initializeControls();
    this.attachEventListeners();
    this.injectStyles();
  }

  /**
   * Update the current activation state
   * 
   * @param activation - Current unit activation or null
   */
  public updateCurrentActivation(activation: UnitActivation | null): void {
    this.currentActivation = activation;
    this.updateControlStates();
    this.updateCurrentUnitDisplay();
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
  }

  /**
   * Update whether it's the player's turn
   * 
   * @param isPlayerTurn - Whether it's player's turn
   */
  public updatePlayerTurn(isPlayerTurn: boolean): void {
    this.isPlayerTurn = isPlayerTurn;
    this.updateControlStates();
  }

  /**
   * Enable or disable all controls
   * 
   * @param enabled - Whether controls should be enabled
   */
  public setControlsEnabled(enabled: boolean): void {
    const buttons = this.container.querySelectorAll('button');
    buttons.forEach(button => {
      (button as HTMLButtonElement).disabled = !enabled;
    });
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
   * Get the current activation
   * 
   * @returns Current activation or null
   */
  public getCurrentActivation(): UnitActivation | null {
    return this.currentActivation;
  }

  /**
   * Get the current phase
   * 
   * @returns Current phase
   */
  public getCurrentPhase(): ExtendedBattlePhase {
    return this.currentPhase;
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
    this.container.className = 'initiative-turn-controls';
    this.container.innerHTML = `
      <div class="turn-controls-header">
        <h4 class="turn-phase-title">Deployment</h4>
        <div class="turn-status-message" style="display: none;"></div>
      </div>
      
      <div class="current-unit-info" style="display: none;">
        <div class="current-unit-label">Current Unit:</div>
        <div class="current-unit-name">-</div>
        <div class="current-unit-owner">-</div>
      </div>

      <div class="turn-controls-buttons">
        ${this.config.showSkipTurn ? `
          <button class="turn-btn skip-turn-btn" disabled title="Skip remaining player units (Space)">
            <span class="btn-icon">⏭</span>
            <span class="btn-text">Skip Turn</span>
          </button>
        ` : ''}
        
        ${this.config.showEndTurn ? `
          <button class="turn-btn end-turn-btn" disabled title="End current activation (Enter)">
            <span class="btn-icon">✓</span>
            <span class="btn-text">Complete</span>
          </button>
        ` : ''}
        
        <button class="turn-btn next-activation-btn" disabled title="Next activation (Tab)">
          <span class="btn-icon">▶</span>
          <span class="btn-text">Next</span>
        </button>
      </div>

      <div class="turn-controls-footer">
        <div class="turn-indicator">
          <span class="indicator-dot indicator-inactive"></span>
          <span class="indicator-text">Ready</span>
        </div>
      </div>
    `;
  }

  /**
   * Attach event listeners to controls
   */
  private attachEventListeners(): void {
    // Skip turn button
    const skipBtn = this.container.querySelector('.skip-turn-btn') as HTMLButtonElement;
    if (skipBtn) {
      skipBtn.addEventListener('click', () => {
        this.events.onSkipTurn();
      });
    }

    // End turn button
    const endBtn = this.container.querySelector('.end-turn-btn') as HTMLButtonElement;
    if (endBtn) {
      endBtn.addEventListener('click', () => {
        if (this.currentActivation) {
          this.events.onCompleteActivation(this.currentActivation.unitId);
        }
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
      // Only handle keys when not in input fields
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (event.key) {
        case ' ':
          event.preventDefault();
          if (this.isControlEnabled('.skip-turn-btn')) {
            this.events.onSkipTurn();
          }
          break;
        case 'Enter':
          event.preventDefault();
          if (this.isControlEnabled('.end-turn-btn')) {
            if (this.currentActivation) {
              this.events.onCompleteActivation(this.currentActivation.unitId);
            }
          }
          break;
        case 'Tab':
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
   * Update control states based on current game state
   */
  private updateControlStates(): void {
    const skipBtn = this.container.querySelector('.skip-turn-btn') as HTMLButtonElement;
    const endBtn = this.container.querySelector('.end-turn-btn') as HTMLButtonElement;
    const nextBtn = this.container.querySelector('.next-activation-btn') as HTMLButtonElement;

    // Enable/disable based on phase and activation
    const isInInitiativePhase = this.currentPhase === 'initiativeTurn';
    const hasCurrentActivation = this.currentActivation !== null;
    const isPlayerActivation = this.currentActivation?.ownerId === 'player';

    if (skipBtn) {
      skipBtn.disabled = !isInInitiativePhase || !this.isPlayerTurn;
    }

    if (endBtn) {
      endBtn.disabled = !isInInitiativePhase || !hasCurrentActivation || !isPlayerActivation;
    }

    if (nextBtn) {
      nextBtn.disabled = !isInInitiativePhase;
    }

    // Update turn indicator
    this.updateTurnIndicator();
  }

  /**
   * Update current unit display
   */
  private updateCurrentUnitDisplay(): void {
    const unitInfo = this.container.querySelector('.current-unit-info') as HTMLElement;
    const unitName = this.container.querySelector('.current-unit-name') as HTMLElement;
    const unitOwner = this.container.querySelector('.current-unit-owner') as HTMLElement;

    if (!this.config.showCurrentUnitInfo || !unitInfo || !unitName || !unitOwner) {
      return;
    }

    if (this.currentActivation) {
      unitInfo.style.display = 'block';
      unitName.textContent = `Unit ${this.currentActivation.unitId}`;
      unitOwner.textContent = `${this.currentActivation.ownerId === 'player' ? 'Player' : 'Bot'} (Initiative ${this.currentActivation.initiative})`;
    } else {
      unitInfo.style.display = 'none';
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

  /**
   * Update turn indicator
   */
  private updateTurnIndicator(): void {
    const indicatorDot = this.container.querySelector('.indicator-dot') as HTMLElement;
    const indicatorText = this.container.querySelector('.indicator-text') as HTMLElement;

    if (!indicatorDot || !indicatorText) {
      return;
    }

    if (this.currentPhase === 'initiativeTurn' && this.currentActivation) {
      indicatorDot.className = 'indicator-dot indicator-active';
      indicatorText.textContent = `${this.currentActivation.ownerId === 'player' ? 'Player' : 'Bot'} Acting`;
    } else if (this.currentPhase === 'initiativeTurn') {
      indicatorDot.className = 'indicator-dot indicator-ready';
      indicatorText.textContent = 'Ready';
    } else {
      indicatorDot.className = 'indicator-dot indicator-inactive';
      indicatorText.textContent = this.currentPhase;
    }
  }

  /**
   * Inject CSS styles for turn controls
   */
  private injectStyles(): void {
    if (document.querySelector('style[data-initiative-turn-controls]')) {
      return; // Styles already injected
    }

    const style = document.createElement('style');
    style.setAttribute('data-initiative-turn-controls', 'true');
    style.textContent = `
      .initiative-turn-controls {
        background: rgba(0, 0, 0, 0.9);
        border: 1px solid #444;
        border-radius: 8px;
        color: white;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 12px;
        padding: 12px;
        min-width: 200px;
      }

      .turn-controls-header {
        margin-bottom: 12px;
        text-align: center;
      }

      .turn-phase-title {
        margin: 0 0 8px 0;
        font-size: 14px;
        font-weight: bold;
        color: #ffd700;
      }

      .turn-status-message {
        background: rgba(255, 215, 0, 0.2);
        border: 1px solid #ffd700;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 11px;
        text-align: center;
      }

      .current-unit-info {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 4px;
        padding: 8px;
        margin-bottom: 12px;
      }

      .current-unit-label {
        font-size: 10px;
        opacity: 0.7;
        margin-bottom: 2px;
      }

      .current-unit-name {
        font-weight: bold;
        margin-bottom: 2px;
      }

      .current-unit-owner {
        font-size: 11px;
        opacity: 0.8;
      }

      .turn-controls-buttons {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
      }

      .turn-btn {
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid #555;
        border-radius: 4px;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 12px;
        font-size: 12px;
        transition: all 0.2s ease;
      }

      .turn-btn:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.2);
        border-color: #777;
      }

      .turn-btn:active:not(:disabled) {
        transform: translateY(1px);
      }

      .turn-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .btn-icon {
        font-size: 14px;
      }

      .btn-text {
        font-weight: 500;
      }

      .skip-turn-btn {
        background: rgba(244, 67, 54, 0.2);
        border-color: #f44336;
      }

      .skip-turn-btn:hover:not(:disabled) {
        background: rgba(244, 67, 54, 0.3);
      }

      .end-turn-btn {
        background: rgba(76, 175, 80, 0.2);
        border-color: #4CAF50;
      }

      .end-turn-btn:hover:not(:disabled) {
        background: rgba(76, 175, 80, 0.3);
      }

      .next-activation-btn {
        background: rgba(33, 150, 243, 0.2);
        border-color: #2196F3;
      }

      .next-activation-btn:hover:not(:disabled) {
        background: rgba(33, 150, 243, 0.3);
      }

      .turn-controls-footer {
        text-align: center;
        padding-top: 8px;
        border-top: 1px solid #444;
      }

      .turn-indicator {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }

      .indicator-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        transition: all 0.3s ease;
      }

      .indicator-inactive {
        background: #666;
      }

      .indicator-ready {
        background: #2196F3;
        animation: pulse 2s infinite;
      }

      .indicator-active {
        background: #ffd700;
        animation: pulse 1s infinite;
      }

      .indicator-text {
        font-size: 11px;
        opacity: 0.8;
      }

      @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.6; }
        100% { opacity: 1; }
      }

      /* Keyboard shortcut hints */
      .turn-btn::after {
        content: attr(title);
        position: absolute;
        left: -9999px;
      }

      .turn-btn:hover::after {
        content: none;
      }
    `;

    document.head.appendChild(style);
  }
}
