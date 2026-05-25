/**
 * UI Components Integration Tests for Initiative System
 * 
 * Tests the UI components that work with the initiative system.
 * 
 * @since Initiative System v1.0
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { InitiativeUnitHighlighter } from '../../src/ui/components/InitiativeUnitHighlighter';
import { InitiativeQueueDisplay } from '../../src/ui/components/InitiativeQueueDisplay';
import { InitiativeTurnControls } from '../../src/ui/components/InitiativeTurnControls';
import type { UnitActivation, InitiativeQueue } from '../../src/core/InitiativeQueue';
import type { ScenarioUnit } from '../../src/core/types';

// Mock DOM setup
const createMockDOM = () => {
  // Create a mock document structure
  document.body.innerHTML = '';
  
  const container = document.createElement('div');
  container.id = 'test-container';
  document.body.appendChild(container);
  
  return container;
};

// Mock HexMapRenderer
const createMockHexMapRenderer = () => ({
  getUnitElement: jest.fn(),
  // Add other methods as needed
});

// Mock unit interface that extends ScenarioUnit with initiative for testing
interface MockUnit extends ScenarioUnit {
  initiative: number;
}

// Mock unit data
const createMockUnit = (id: string, type: string, owner: 'Player' | 'Bot'): MockUnit => ({
  unitId: id,
  type: type as any,
  hex: { q: 0, r: 0 },
  strength: 100,
  experience: 0,
  ammo: 6,
  fuel: 0,
  entrench: 0,
  facing: 'N' as any,
  controlledBy: owner === 'Player' ? 'Player' : 'AI' as any,
  initiative: 5
});

// Mock activation data
const createMockActivation = (unitId: string, owner: 'player' | 'bot', initiative: number): UnitActivation => ({
  unitId,
  ownerId: owner,
  initiative,
  isActivated: false,
  sortOrder: 0
});

// Mock queue data
const createMockQueue = (activations: UnitActivation[]): InitiativeQueue => ({
  activations,
  currentIndex: 0,
  currentTurn: 1
});

describe('InitiativeUnitHighlighter', () => {
  let highlighter: InitiativeUnitHighlighter;
  let mockRenderer: any;
  let container: HTMLElement;

  beforeEach(() => {
    container = createMockDOM();
    mockRenderer = createMockHexMapRenderer();
    highlighter = new InitiativeUnitHighlighter(mockRenderer);
  });

  afterEach(() => {
    highlighter.dispose();
    document.body.innerHTML = '';
  });

  describe('Current Activation Updates', () => {
    it('should update current activation and apply highlighting', () => {
      const activation = createMockActivation('unit-1', 'player', 7);
      const mockElement = document.createElement('div');
      mockElement.dataset.unitId = 'unit-1';
      document.body.appendChild(mockElement);

      mockRenderer.getUnitElement.mockReturnValue(mockElement);

      highlighter.updateCurrentActivation(activation);

      expect(highlighter.getCurrentActivation()).toBe(activation);
      expect(highlighter.isUnitActive('unit-1')).toBe(true);
      expect(mockElement.classList.contains('initiative-active-unit')).toBe(true);
    });

    it('should clear highlighting when activation is null', () => {
      const activation = createMockActivation('unit-1', 'player', 7);
      const mockElement = document.createElement('div');
      mockElement.dataset.unitId = 'unit-1';
      document.body.appendChild(mockElement);

      mockRenderer.getUnitElement.mockReturnValue(mockElement);
      highlighter.updateCurrentActivation(activation);
      highlighter.updateCurrentActivation(null);

      expect(highlighter.getCurrentActivation()).toBeNull();
      expect(highlighter.isUnitActive('unit-1')).toBe(false);
    });

    it('should mark units as activated', () => {
      const activation = createMockActivation('unit-1', 'player', 7);
      const mockElement = document.createElement('div');
      mockElement.dataset.unitId = 'unit-1';
      document.body.appendChild(mockElement);

      mockRenderer.getUnitElement.mockReturnValue(mockElement);
      highlighter.updateCurrentActivation(activation);
      highlighter.markUnitActivated('unit-1');

      expect(highlighter.isUnitActivated('unit-1')).toBe(true);
      expect(highlighter.isUnitActive('unit-1')).toBe(false);
    });

    it('should reset all activation states', () => {
      const activation = createMockActivation('unit-1', 'player', 7);
      const mockElement = document.createElement('div');
      mockElement.dataset.unitId = 'unit-1';
      document.body.appendChild(mockElement);

      mockRenderer.getUnitElement.mockReturnValue(mockElement);
      highlighter.updateCurrentActivation(activation);
      highlighter.markUnitActivated('unit-1');
      highlighter.resetActivationStates();

      expect(highlighter.getCurrentActivation()).toBeNull();
      expect(highlighter.getActivatedUnits().size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle missing unit elements gracefully', () => {
      const activation = createMockActivation('non-existent', 'player', 7);
      mockRenderer.getUnitElement.mockReturnValue(null);

      expect(() => {
        highlighter.updateCurrentActivation(activation);
      }).not.toThrow();
    });

    it('should handle renderer errors gracefully', () => {
      const activation = createMockActivation('unit-1', 'player', 7);
      mockRenderer.getUnitElement.mockImplementation(() => {
        throw new Error('Renderer error');
      });

      expect(() => {
        highlighter.updateCurrentActivation(activation);
      }).not.toThrow();
    });
  });

  describe('Statistics', () => {
    it('should provide accurate highlighting statistics', () => {
      const activation1 = createMockActivation('unit-1', 'player', 7);
      const activation2 = createMockActivation('unit-2', 'bot', 6);
      
      const mockElement1 = document.createElement('div');
      const mockElement2 = document.createElement('div');
      mockElement1.dataset.unitId = 'unit-1';
      mockElement2.dataset.unitId = 'unit-2';
      document.body.appendChild(mockElement1);
      document.body.appendChild(mockElement2);

      mockRenderer.getUnitElement.mockImplementation((unitId: string) => {
        return unitId === 'unit-1' ? mockElement1 : mockElement2;
      });

      highlighter.updateCurrentActivation(activation1);
      highlighter.markUnitActivated('unit-2');

      const stats = highlighter.getHighlightStats();
      expect(stats.activeUnits).toBe(1);
      expect(stats.activatedUnits).toBe(1);
      expect(stats.totalHighlighted).toBe(2);
    });
  });
});

describe('InitiativeQueueDisplay', () => {
  let queueDisplay: InitiativeQueueDisplay;
  let container: HTMLElement;

  beforeEach(() => {
    container = createMockDOM();
    queueDisplay = new InitiativeQueueDisplay(container);
  });

  afterEach(() => {
    queueDisplay.dispose();
    document.body.innerHTML = '';
  });

  describe('Queue Rendering', () => {
    it('should render empty queue when no data provided', () => {
      queueDisplay.updateQueue(null);
      
      expect(queueDisplay.getCurrentQueue()).toBeNull();
      expect(queueDisplay.getDisplayedItemCount()).toBe(0);
    });

    it('should render queue with activations', () => {
      const activations = [
        createMockActivation('unit-1', 'player', 7),
        createMockActivation('unit-2', 'bot', 6),
        createMockActivation('unit-3', 'player', 5)
      ];
      const queue = createMockQueue(activations);
      const units = [
        createMockUnit('unit-1', 'Infantry_42', 'Player'),
        createMockUnit('unit-2', 'Infantry_42', 'Bot'),
        createMockUnit('unit-3', 'Infantry_42', 'Player')
      ];

      queueDisplay.updateQueue(queue, units);

      expect(queueDisplay.getCurrentQueue()).toBe(queue);
      expect(queueDisplay.getDisplayedItemCount()).toBe(3);
    });

    it('should limit visible items to maxVisibleItems', () => {
      const activations = Array.from({ length: 10 }, (_, i) => 
        createMockActivation(`unit-${i}`, i % 2 === 0 ? 'player' : 'bot', 7 - i)
      );
      const queue = createMockQueue(activations);
      
      // Create new display with custom config
      const customDisplay = new InitiativeQueueDisplay(container, { maxVisibleItems: 3 });
      customDisplay.updateQueue(queue, []);

      expect(customDisplay.getDisplayedItemCount()).toBe(3);
      customDisplay.dispose();
    });

    it('should highlight active unit', () => {
      const activations = [
        createMockActivation('unit-1', 'player', 7),
        createMockActivation('unit-2', 'bot', 6)
      ];
      const queue = createMockQueue(activations);
      const units = [
        createMockUnit('unit-1', 'Infantry_42', 'Player'),
        createMockUnit('unit-2', 'Infantry_42', 'Bot')
      ];

      queueDisplay.updateQueue(queue, units);
      queueDisplay.highlightActiveUnit('unit-1');

      const activeElement = container.querySelector('[data-unit-id="unit-1"]');
      expect(activeElement?.classList.contains('queue-item-active')).toBe(true);
    });

    it('should mark units as activated', () => {
      const activations = [
        createMockActivation('unit-1', 'player', 7),
        createMockActivation('unit-2', 'bot', 6)
      ];
      const queue = createMockQueue(activations);
      const units = [
        createMockUnit('unit-1', 'Infantry_42', 'Player'),
        createMockUnit('unit-2', 'Infantry_42', 'Bot')
      ];

      queueDisplay.updateQueue(queue, units);
      queueDisplay.markUnitActivated('unit-1');

      const activatedElement = container.querySelector('[data-unit-id="unit-1"]');
      expect(activatedElement?.classList.contains('queue-item-activated')).toBe(true);
      expect(activatedElement?.classList.contains('queue-item-active')).toBe(false);
    });
  });

  describe('Configuration', () => {
    it('should respect showInitiativeValues configuration', () => {
      const config = { showInitiativeValues: false };
      queueDisplay = new InitiativeQueueDisplay(container, config);
      
      const activations = [createMockActivation('unit-1', 'player', 7)];
      const queue = createMockQueue(activations);
      const units = [createMockUnit('unit-1', 'Infantry_42', 'Player')];

      queueDisplay.updateQueue(queue, units);

      const initiativeElement = container.querySelector('.queue-item-initiative');
      expect(initiativeElement).toBeNull();
    });

    it('should respect showUnitIcons configuration', () => {
      const config = { showUnitIcons: false };
      queueDisplay = new InitiativeQueueDisplay(container, config);
      
      const activations = [createMockActivation('unit-1', 'player', 7)];
      const queue = createMockQueue(activations);
      const units = [createMockUnit('unit-1', 'Infantry_42', 'Player')];

      queueDisplay.updateQueue(queue, units);

      const iconElement = container.querySelector('.unit-icon');
      expect(iconElement).toBeNull();
    });
  });

  describe('Clear and Reset', () => {
    it('should clear the display', () => {
      const activations = [createMockActivation('unit-1', 'player', 7)];
      const queue = createMockQueue(activations);
      const units = [createMockUnit('unit-1', 'Infantry_42', 'Player')];

      queueDisplay.updateQueue(queue, units);
      expect(queueDisplay.getDisplayedItemCount()).toBe(1);

      queueDisplay.clear();
      expect(queueDisplay.getCurrentQueue()).toBeNull();
      expect(queueDisplay.getDisplayedItemCount()).toBe(0);
    });
  });
});

describe('InitiativeTurnControls', () => {
  let turnControls: InitiativeTurnControls;
  let container: HTMLElement;
  let mockEvents: any;

  beforeEach(() => {
    container = createMockDOM();
    mockEvents = {
      onSkipTurn: jest.fn(),
      onEndTurn: jest.fn(),
      onNextActivation: jest.fn(),
      onCompleteActivation: jest.fn()
    };
    turnControls = new InitiativeTurnControls(container, mockEvents);
  });

  afterEach(() => {
    turnControls.dispose();
    document.body.innerHTML = '';
  });

  describe('Control State Management', () => {
    it('should update current activation', () => {
      const activation = createMockActivation('unit-1', 'player', 7);
      
      turnControls.updateCurrentActivation(activation);
      
      expect(turnControls.getCurrentActivation()).toBe(activation);
    });

    it('should update phase', () => {
      turnControls.updatePhase('initiativeTurn');
      
      expect(turnControls.getCurrentPhase()).toBe('initiativeTurn');
    });

    it('should update player turn state', () => {
      turnControls.updatePlayerTurn(true);
      
      // Should enable player-specific controls
      const skipBtn = container.querySelector('.skip-turn-btn') as HTMLButtonElement;
      expect(skipBtn.disabled).toBe(false);
    });

    it('should enable/disable controls based on state', () => {
      turnControls.updatePhase('initiativeTurn');
      turnControls.updateCurrentActivation(createMockActivation('unit-1', 'player', 7));
      turnControls.updatePlayerTurn(true);

      const endBtn = container.querySelector('.end-turn-btn') as HTMLButtonElement;
      expect(endBtn.disabled).toBe(false);

      // Change to bot activation
      turnControls.updateCurrentActivation(createMockActivation('unit-2', 'bot', 6));
      expect(endBtn.disabled).toBe(true);
    });
  });

  describe('Event Handling', () => {
    it('should call onSkipTurn when skip button clicked', () => {
      const skipBtn = container.querySelector('.skip-turn-btn') as HTMLButtonElement;
      skipBtn.disabled = false;
      
      skipBtn.click();
      
      expect(mockEvents.onSkipTurn).toHaveBeenCalled();
    });

    it('should call onCompleteActivation when end button clicked', () => {
      const activation = createMockActivation('unit-1', 'player', 7);
      turnControls.updateCurrentActivation(activation);
      
      const endBtn = container.querySelector('.end-turn-btn') as HTMLButtonElement;
      endBtn.disabled = false;
      
      endBtn.click();
      
      expect(mockEvents.onCompleteActivation).toHaveBeenCalledWith('unit-1');
    });

    it('should call onNextActivation when next button clicked', () => {
      turnControls.updatePhase('initiativeTurn');
      
      const nextBtn = container.querySelector('.next-activation-btn') as HTMLButtonElement;
      nextBtn.disabled = false;
      
      nextBtn.click();
      
      expect(mockEvents.onNextActivation).toHaveBeenCalled();
    });
  });

  describe('Status Messages', () => {
    it('should show status message', () => {
      turnControls.showStatusMessage('Test message');
      
      const statusElement = container.querySelector('.turn-status-message') as HTMLElement;
      expect(statusElement.style.display).toBe('block');
      expect(statusElement.textContent).toBe('Test message');
    });

    it('should clear status message', () => {
      turnControls.showStatusMessage('Test message');
      turnControls.clearStatusMessage();
      
      const statusElement = container.querySelector('.turn-status-message') as HTMLElement;
      expect(statusElement.style.display).toBe('none');
    });

    it('should auto-hide temporary messages', (done) => {
      turnControls.showStatusMessage('Temporary message', 100);
      
      setTimeout(() => {
        const statusElement = container.querySelector('.turn-status-message') as HTMLElement;
        expect(statusElement.style.display).toBe('none');
        done();
      }, 150);
    });
  });

  describe('Configuration', () => {
    it('should respect showSkipTurn configuration', () => {
      const config = { showSkipTurn: false };
      turnControls = new InitiativeTurnControls(container, mockEvents, config);
      
      const skipBtn = container.querySelector('.skip-turn-btn');
      expect(skipBtn).toBeNull();
    });

    it('should respect showEndTurn configuration', () => {
      const config = { showEndTurn: false };
      turnControls = new InitiativeTurnControls(container, mockEvents, config);
      
      const endBtn = container.querySelector('.end-turn-btn');
      expect(endBtn).toBeNull();
    });

    it('should respect showCurrentUnitInfo configuration', () => {
      const config = { showCurrentUnitInfo: false };
      turnControls = new InitiativeTurnControls(container, mockEvents, config);
      
      const unitInfo = container.querySelector('.current-unit-info');
      expect(unitInfo).toBeNull();
    });
  });

  describe('Control Enable/Disable', () => {
    it('should enable/disable all controls', () => {
      turnControls.setControlsEnabled(false);
      
      const buttons = container.querySelectorAll('button');
      buttons.forEach(button => {
        expect((button as HTMLButtonElement).disabled).toBe(true);
      });
      
      turnControls.setControlsEnabled(true);
      
      buttons.forEach(button => {
        expect((button as HTMLButtonElement).disabled).toBe(false);
      });
    });
  });
});

describe('Component Integration', () => {
  let container: HTMLElement;
  let highlighter: InitiativeUnitHighlighter;
  let queueDisplay: InitiativeQueueDisplay;
  let turnControls: InitiativeTurnControls;
  let mockRenderer: any;

  beforeEach(() => {
    container = createMockDOM();
    mockRenderer = createMockHexMapRenderer();
    
    // Create components
    highlighter = new InitiativeUnitHighlighter(mockRenderer);
    queueDisplay = new InitiativeQueueDisplay(container);
    
    const mockEvents = {
      onSkipTurn: jest.fn(),
      onEndTurn: jest.fn(),
      onNextActivation: jest.fn(),
      onCompleteActivation: jest.fn()
    };
    turnControls = new InitiativeTurnControls(container, mockEvents);
  });

  afterEach(() => {
    highlighter.dispose();
    queueDisplay.dispose();
    turnControls.dispose();
    document.body.innerHTML = '';
  });

  it('should coordinate component updates', () => {
    const activation = createMockActivation('unit-1', 'player', 7);
    const activations = [activation];
    const queue = createMockQueue(activations);
    const units = [createMockUnit('unit-1', 'Infantry_42', 'Player')];

    // Update all components with new activation
    highlighter.updateCurrentActivation(activation, activations);
    queueDisplay.updateQueue(queue, units);
    turnControls.updateCurrentActivation(activation);
    turnControls.updatePhase('initiativeTurn');
    turnControls.updatePlayerTurn(true);

    // Verify all components are in sync
    expect(highlighter.getCurrentActivation()).toBe(activation);
    expect(queueDisplay.getCurrentQueue()).toBe(queue);
    expect(turnControls.getCurrentActivation()).toBe(activation);
    expect(turnControls.getCurrentPhase()).toBe('initiativeTurn');
  });

  it('should handle activation completion across components', () => {
    const activation = createMockActivation('unit-1', 'player', 7);
    const activations = [activation];
    const queue = createMockQueue(activations);
    const units = [createMockUnit('unit-1', 'Infantry_42', 'Player')];

    // Set up initial state
    highlighter.updateCurrentActivation(activation, activations);
    queueDisplay.updateQueue(queue, units);
    turnControls.updateCurrentActivation(activation);

    // Complete activation
    highlighter.markUnitActivated('unit-1');
    queueDisplay.markUnitActivated('unit-1');
    turnControls.updateCurrentActivation(null);

    // Verify all components reflect the completion
    expect(highlighter.isUnitActivated('unit-1')).toBe(true);
    expect(highlighter.isUnitActive('unit-1')).toBe(false);
    expect(turnControls.getCurrentActivation()).toBeNull();
  });
});
