/**
 * Initiative Queue Display Component
 * 
 * Renders the initiative queue showing upcoming unit activations.
 * Provides visual feedback about turn order and activation status.
 * 
 * @since Initiative System v1.0
 */

import type { InitiativeQueue, UnitActivation } from '../../core/InitiativeQueue';
import type { ScenarioUnit } from '../../core/types';
import { getSpriteForScenarioType } from '../../data/unitSpriteCatalog';

/**
 * Configuration for the queue display
 */
export interface QueueDisplayConfig {
  /** Maximum number of upcoming activations to show */
  maxVisibleItems: number;
  /** Whether to show initiative values */
  showInitiativeValues: boolean;
  /** Whether to show unit icons */
  showUnitIcons: boolean;
  /** Whether to animate queue changes */
  enableAnimations: boolean;
  /** Animation duration in milliseconds */
  animationDuration: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: QueueDisplayConfig = {
  maxVisibleItems: 5,
  showInitiativeValues: true,
  showUnitIcons: true,
  enableAnimations: true,
  animationDuration: 300
};

/**
 * Queue item display data
 */
interface QueueItemData {
  activation: UnitActivation;
  unit: ScenarioUnit | null;
  isActive: boolean;
  isActivated: boolean;
  position: number;
}

/**
 * Renders and manages the initiative queue display
 */
export class InitiativeQueueDisplay {
  private readonly container: HTMLElement;
  private readonly config: QueueDisplayConfig;
  private currentQueue: InitiativeQueue | null = null;
  private queueItems: QueueItemData[] = [];
  private elements: Map<string, HTMLElement> = new Map();

  /**
   * Create a new initiative queue display
   * 
   * @param container - Container element for the queue display
   * @param config - Display configuration (optional)
   */
  constructor(container: HTMLElement, config: Partial<QueueDisplayConfig> = {}) {
    this.container = container;
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    this.initializeDisplay();
  }

  /**
   * Update the queue display with new data
   * 
   * @param queue - Current initiative queue
   * @param units - Current unit data for lookups
   */
  public updateQueue(queue: InitiativeQueue | null, units: readonly ScenarioUnit[] = []): void {
    this.currentQueue = queue;
    this.updateQueueItems(units);
    this.renderQueue();
  }

  /**
   * Highlight the currently active unit in the queue
   * 
   * @param unitId - ID of the currently active unit
   */
  public highlightActiveUnit(unitId: string): void {
    // Remove previous active highlighting
    this.elements.forEach(element => {
      element.classList.remove('queue-item-active');
    });

    // Add active highlighting to current unit
    const activeElement = this.elements.get(unitId);
    if (activeElement) {
      activeElement.classList.add('queue-item-active');
      
      // Scroll into view if needed
      this.scrollToElement(activeElement);
    }
  }

  /**
   * Mark a unit as activated in the display
   * 
   * @param unitId - ID of the activated unit
   */
  public markUnitActivated(unitId: string): void {
    const element = this.elements.get(unitId);
    if (element) {
      element.classList.add('queue-item-activated');
      element.classList.remove('queue-item-active');
    }

    // Update internal state
    const item = this.queueItems.find(item => item.activation.unitId === unitId);
    if (item) {
      item.isActivated = true;
      item.isActive = false;
    }
  }

  /**
   * Clear the queue display
   */
  public clear(): void {
    this.container.innerHTML = '';
    this.elements.clear();
    this.queueItems = [];
    this.currentQueue = null;
  }

  /**
   * Get the current queue being displayed
   * 
   * @returns Current initiative queue or null
   */
  public getCurrentQueue(): InitiativeQueue | null {
    return this.currentQueue;
  }

  /**
   * Get the number of items currently displayed
   * 
   * @returns Number of displayed items
   */
  public getDisplayedItemCount(): number {
    return this.queueItems.length;
  }

  /**
   * Initialize the display container
   */
  private initializeDisplay(): void {
    this.container.className = 'initiative-queue-display';
    this.container.innerHTML = `
      <div class="queue-header">
        <h3 class="queue-title">Initiative Order</h3>
        <div class="queue-turn-info">Turn <span class="turn-number">1</span></div>
      </div>
      <div class="queue-items-container"></div>
      <div class="queue-footer">
        <button class="queue-toggle-btn" title="Toggle queue visibility">
          <span class="toggle-icon">Hide</span>
        </button>
      </div>
    `;

    // Add event listeners
    this.attachEventListeners();

    // Inject CSS styles
    this.injectStyles();
  }

  /**
   * Update internal queue items data
   * 
   * @param units - Current unit data for lookups
   */
  private updateQueueItems(units: readonly ScenarioUnit[]): void {
    if (!this.currentQueue) {
      this.queueItems = [];
      return;
    }

    // Create unit lookup map
    const unitMap = new Map<string, ScenarioUnit>();
    units.forEach(unit => {
      if (unit.unitId) {
        unitMap.set(unit.unitId, unit);
      }
    });

    // Build queue items data
    this.queueItems = this.currentQueue.activations
      .slice(0, this.config.maxVisibleItems)
      .map((activation, index) => ({
        activation,
        unit: unitMap.get(activation.unitId) || null,
        isActive: index === this.currentQueue!.currentIndex,
        isActivated: activation.isActivated,
        position: index + 1
      }));
  }

  /**
   * Render the queue display
   */
  private renderQueue(): void {
    const itemsContainer = this.container.querySelector('.queue-items-container') as HTMLElement;
    if (!itemsContainer) {
      return;
    }

    // Clear existing items
    itemsContainer.innerHTML = '';
    this.elements.clear();

    // Update turn info
    const turnNumberElement = this.container.querySelector('.turn-number') as HTMLElement;
    if (turnNumberElement && this.currentQueue) {
      turnNumberElement.textContent = this.currentQueue.currentTurn.toString();
    }

    // Render queue items
    this.queueItems.forEach(item => {
      const itemElement = this.createQueueItemElement(item);
      itemsContainer.appendChild(itemElement);
      this.elements.set(item.activation.unitId, itemElement);
    });

    // Apply animations if enabled
    if (this.config.enableAnimations) {
      this.animateQueueItems();
    }
  }

  /**
   * Create a queue item element
   * 
   * @param item - Queue item data
   * @returns Queue item element
   */
  private createQueueItemElement(item: QueueItemData): HTMLElement {
    const element = document.createElement('div');
    element.className = 'queue-item';
    element.dataset.unitId = item.activation.unitId;

    // Add state classes
    if (item.isActive) {
      element.classList.add('queue-item-active');
    }
    if (item.isActivated) {
      element.classList.add('queue-item-activated');
    }
    if (item.activation.ownerId === 'player') {
      element.classList.add('queue-item-player');
    } else {
      element.classList.add('queue-item-bot');
    }

    // Build item content
    element.innerHTML = `
      <div class="queue-item-position">${item.position}</div>
      <div class="queue-item-content">
        <div class="queue-item-unit">
          ${this.config.showUnitIcons ? this.getUnitIcon(item.unit, item.activation.ownerId === 'player' ? 'Player' : 'Bot') : ''}
          <span class="queue-item-label">${this.getUnitLabel(item)}</span>
        </div>
        ${this.config.showInitiativeValues ? `
          <div class="queue-item-initiative">
            <span class="initiative-value">${item.activation.initiative}</span>
          </div>
        ` : ''}
      </div>
      <div class="queue-item-status">
        ${this.getStatusIcon(item)}
      </div>
    `;

    return element;
  }

  /**
   * Get unit icon HTML
   * 
   * @param unit - Unit data
   * @returns Icon HTML string
   */
  private getUnitIcon(unit: ScenarioUnit | null, faction: "Player" | "Bot"): string {
    if (!unit) {
      return '<span class="unit-icon unit-icon-unknown" aria-hidden="true">?</span>';
    }
    const iconClass = `unit-icon-${unit.type.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;
    const spriteUrl = getSpriteForScenarioType(unit.type, faction, "Sideview");
    return spriteUrl
      ? `<img class="unit-icon ${iconClass}" src="${spriteUrl}" alt="" aria-hidden="true">`
      : '<span class="unit-icon unit-icon-unknown" aria-hidden="true">?</span>';
  }

  /**
   * Get unit label for display
   * 
   * @param item - Queue item data
   * @returns Unit label string
   */
  private getUnitLabel(item: QueueItemData): string {
    if (item.unit) {
      return item.unit.type.replace(/_/g, ' ');
    }
    return `Unit ${item.activation.unitId}`;
  }

  /**
   * Get status icon for queue item
   * 
   * @param item - Queue item data
   * @returns Status icon HTML
   */
  private getStatusIcon(item: QueueItemData): string {
    if (item.isActive) {
      return '<span class="status-icon status-active">Current</span>';
    }
    if (item.isActivated) {
      return '<span class="status-icon status-activated">Done</span>';
    }
    return '<span class="status-icon status-pending">Waiting</span>';
  }

  /**
   * Animate queue items when they appear
   */
  private animateQueueItems(): void {
    const items = this.container.querySelectorAll('.queue-item');
    items.forEach((item, index) => {
      const element = item as HTMLElement;
      element.style.opacity = '0';
      element.style.transform = 'translateX(-20px)';
      
      setTimeout(() => {
        element.style.transition = `all ${this.config.animationDuration}ms ease-out`;
        element.style.opacity = '1';
        element.style.transform = 'translateX(0)';
      }, index * 50);
    });
  }

  /**
   * Scroll to make an element visible
   * 
   * @param element - Element to scroll to
   */
  private scrollToElement(element: HTMLElement): void {
    const container = this.container.querySelector('.queue-items-container') as HTMLElement;
    if (!container) {
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    if (elementRect.bottom > containerRect.bottom) {
      element.scrollIntoView({ behavior: 'smooth', block: 'end' });
    } else if (elementRect.top < containerRect.top) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  /**
   * Attach event listeners
   */
  private attachEventListeners(): void {
    const toggleBtn = this.container.querySelector('.queue-toggle-btn') as HTMLButtonElement;
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        this.toggleVisibility();
      });
    }

    // Add hover effects for queue items
    this.container.addEventListener('mouseover', (event) => {
      const target = event.target as HTMLElement;
      const queueItem = target.closest('.queue-item') as HTMLElement;
      if (queueItem) {
        queueItem.classList.add('queue-item-hover');
      }
    });

    this.container.addEventListener('mouseout', (event) => {
      const target = event.target as HTMLElement;
      const queueItem = target.closest('.queue-item') as HTMLElement;
      if (queueItem) {
        queueItem.classList.remove('queue-item-hover');
      }
    });
  }

  /**
   * Toggle queue visibility
   */
  private toggleVisibility(): void {
    const itemsContainer = this.container.querySelector('.queue-items-container') as HTMLElement;
    const toggleIcon = this.container.querySelector('.toggle-icon') as HTMLElement;
    
    if (!itemsContainer || !toggleIcon) {
      return;
    }

    const isHidden = itemsContainer.style.display === 'none';
    
    if (isHidden) {
      itemsContainer.style.display = 'block';
      toggleIcon.textContent = 'Hide';
    } else {
      itemsContainer.style.display = 'none';
      toggleIcon.textContent = 'Show';
    }
  }

  /**
   * Inject CSS styles for the queue display
   */
  private injectStyles(): void {
    if (document.querySelector('style[data-initiative-queue]')) {
      return; // Styles already injected
    }

    const style = document.createElement('style');
    style.setAttribute('data-initiative-queue', 'true');
    style.textContent = `
      .initiative-queue-display {
        background: rgba(0, 0, 0, 0.8);
        border: 1px solid #444;
        border-radius: 8px;
        color: white;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        font-size: 12px;
        max-width: 250px;
        overflow: hidden;
      }

      .queue-header {
        background: rgba(255, 255, 255, 0.1);
        padding: 8px 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid #444;
      }

      .queue-title {
        margin: 0;
        font-size: 14px;
        font-weight: bold;
      }

      .queue-turn-info {
        font-size: 11px;
        opacity: 0.8;
      }

      .queue-items-container {
        max-height: 300px;
        overflow-y: auto;
      }

      .queue-item {
        display: flex;
        align-items: center;
        padding: 6px 8px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        transition: all 0.2s ease;
      }

      .queue-item:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .queue-item-active {
        background: rgba(255, 215, 0, 0.2);
        border-left: 3px solid #ffd700;
      }

      .queue-item-activated {
        opacity: 0.5;
      }

      .queue-item-player {
        border-left: 2px solid #4CAF50;
      }

      .queue-item-bot {
        border-left: 2px solid #f44336;
      }

      .queue-item-position {
        width: 20px;
        text-align: center;
        font-weight: bold;
        opacity: 0.7;
      }

      .queue-item-content {
        flex: 1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-left: 8px;
      }

      .queue-item-unit {
        display: flex;
        align-items: center;
        gap: 6px;
      }

      .unit-icon {
        width: 16px;
        height: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 10px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 2px;
        object-fit: contain;
      }

      .queue-item-label {
        font-size: 11px;
      }

      .queue-item-initiative {
        background: rgba(255, 255, 255, 0.1);
        padding: 2px 6px;
        border-radius: 10px;
        font-size: 10px;
        font-weight: bold;
      }

      .queue-item-status {
        margin-left: 8px;
      }

      .status-icon {
        font-size: 9px;
        font-weight: 700;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        opacity: 0.8;
      }

      .status-active {
        color: #ffd700;
      }

      .status-activated {
        color: #4CAF50;
      }

      .status-pending {
        color: #666;
      }

      .queue-footer {
        padding: 4px;
        text-align: center;
        border-top: 1px solid #444;
      }

      .queue-toggle-btn {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        transition: background 0.2s ease;
      }

      .queue-toggle-btn:hover {
        background: rgba(255, 255, 255, 0.1);
      }

      .toggle-icon {
        font-size: 12px;
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Dispose of the queue display
   */
  public dispose(): void {
    this.clear();
    this.container.innerHTML = '';
  }
}
