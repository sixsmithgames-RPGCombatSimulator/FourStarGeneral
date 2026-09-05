/**
 * Integration Tests for GameEngine Initiative System
 * 
 * Tests the integration between GameEngine and the initiative system.
 * 
 * @since Initiative System v1.0
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { GameEngineInitiativeMethods } from '../src/game/GameEngineInitiativeIntegration';
import { InitiativeActionValidator } from '../src/game/InitiativeActionValidator';
import type { ScenarioUnit } from '../src/core/types';

// Mock GameEngine for testing
const createMockGameEngine = () => ({
  _phase: 'deployment' as any,
  _activeFaction: 'Player' as any,
  _turnNumber: 0,
  _baseCamp: { hex: { q: 0, r: 0 } },
  playerActionFlags: new Set(),
  _playerUnits: {},
  _botUnits: {},
  _allyUnits: {},
  
  // Mock methods
  assertPhase: jest.fn(),
  clearFlakEngagementsFor: jest.fn(),
  rebuildPlayerIdleUnitSet: jest.fn(),
  endTurn: jest.fn(),
  
  // Mock unit data
  _units: new Map()
});

// Mock unit interface that extends ScenarioUnit with initiative for testing
interface MockUnit extends ScenarioUnit {
  initiative: number;
}

// Mock unit for testing
const createMockUnit = (id: string, owner: 'Player' | 'Bot', initiative: number): MockUnit => ({
  unitId: id,
  type: 'Infantry_42' as any,
  hex: { q: 0, r: 0 },
  strength: 100,
  experience: 0,
  ammo: 6,
  fuel: 0,
  entrench: 0,
  facing: 'N' as any,
  controlledBy: owner === 'Player' ? 'Player' : 'AI' as any,
  initiative: initiative
});

describe('GameEngineInitiativeMethods', () => {
  let mockEngine: any;
  let initiativeMethods: GameEngineInitiativeMethods;
  let testUnits: MockUnit[];

  beforeEach(() => {
    mockEngine = createMockGameEngine();
    initiativeMethods = new GameEngineInitiativeMethods(mockEngine);
    
    testUnits = [
      createMockUnit('player-recon-1', 'Player', 7),
      createMockUnit('bot-recon-1', 'Bot', 7),
      createMockUnit('player-infantry-1', 'Player', 5),
      createMockUnit('bot-infantry-1', 'Bot', 5),
      createMockUnit('player-tank-1', 'Player', 4),
      createMockUnit('bot-tank-1', 'Bot', 4)
    ];

    // Set up mock units in engine
    mockEngine._playerUnits = {
      'player-recon-1': testUnits[0],
      'player-infantry-1': testUnits[2],
      'player-tank-1': testUnits[4]
    };
    
    mockEngine._botUnits = {
      'bot-recon-1': testUnits[1],
      'bot-infantry-1': testUnits[3],
      'bot-tank-1': testUnits[5]
    };
  });

  describe('startInitiativeTurnPhase', () => {
    it('should start initiative turn and enable initiative system', () => {
      initiativeMethods.startInitiativeTurnPhase(true);

      expect(mockEngine._phase).toBe('initiativeTurn');
      expect(mockEngine._activeFaction).toBe('Player');
      expect(mockEngine._turnNumber).toBe(1);
      expect(initiativeMethods.isInitiativeSystemActive()).toBe(true);
      expect(mockEngine.assertPhase).toHaveBeenCalledWith('deployment', expect.any(String));
    });

    it('should fall back to normal turn if initiative system disabled', () => {
      initiativeMethods.startInitiativeTurnPhase(false);

      expect(mockEngine._phase).toBe('playerTurn');
      expect(initiativeMethods.isInitiativeSystemActive()).toBe(false);
    });

    it('should throw error if no base camp selected', () => {
      mockEngine._baseCamp = null;

      expect(() => initiativeMethods.startInitiativeTurnPhase(true)).toThrow('Select a base camp');
    });

    it('should throw error if not in deployment phase', () => {
      mockEngine._phase = 'playerTurn';
      mockEngine.assertPhase.mockImplementation(() => {
        throw new Error('Not in deployment phase');
      });

      expect(() => initiativeMethods.startInitiativeTurnPhase(true)).toThrow('Not in deployment phase');
    });
  });

  describe('processNextInitiativeActivation', () => {
    beforeEach(() => {
      initiativeMethods.startInitiativeTurnPhase(true);
    });

    it('should return the first activation', () => {
      const activation = initiativeMethods.processNextInitiativeActivation();

      expect(activation).toBeDefined();
      expect(activation!.unitId).toBe('player-recon-1');
      expect(activation!.ownerId).toBe('player');
      expect(activation!.initiative).toBe(7);
    });

    it('should return subsequent activations after completing current one', () => {
      const firstActivation = initiativeMethods.processNextInitiativeActivation();
      expect(firstActivation!.unitId).toBe('player-recon-1');

      initiativeMethods.completeUnitActivation(firstActivation!.unitId);

      const secondActivation = initiativeMethods.processNextInitiativeActivation();
      expect(secondActivation!.unitId).toBe('bot-recon-1');
    });

    it('should return null when queue is exhausted', () => {
      // Process all activations
      let activation = initiativeMethods.processNextInitiativeActivation();
      while (activation) {
        initiativeMethods.completeUnitActivation(activation.unitId);
        activation = initiativeMethods.processNextInitiativeActivation();
      }

      // Should return null when exhausted
      const finalActivation = initiativeMethods.processNextInitiativeActivation();
      expect(finalActivation).toBeNull();
    });

    it('should return null if initiative system is not active', () => {
      initiativeMethods.completeInitiativeTurn(); // Disable initiative system

      const activation = initiativeMethods.processNextInitiativeActivation();
      expect(activation).toBeNull();
    });
  });

  describe('completeUnitActivation', () => {
    beforeEach(() => {
      initiativeMethods.startInitiativeTurnPhase(true);
    });

    it('should complete current activation and process next', () => {
      const firstActivation = initiativeMethods.processNextInitiativeActivation();
      expect(firstActivation!.unitId).toBe('player-recon-1');

      initiativeMethods.completeUnitActivation(firstActivation!.unitId);

      const nextActivation = initiativeMethods.getCurrentActivation();
      expect(nextActivation).toBeNull(); // Should be cleared after completion
    });

    it('should throw error if initiative system is not active', () => {
      initiativeMethods.completeInitiativeTurn(); // Disable initiative system

      expect(() => initiativeMethods.completeUnitActivation('test-unit')).toThrow('Initiative system is not active');
    });

    it('should throw error if unit is not currently active', () => {
      const _activation = initiativeMethods.processNextInitiativeActivation();

      expect(() => initiativeMethods.completeUnitActivation('wrong-unit')).toThrow();
    });
  });

  describe('validateUnitAction', () => {
    beforeEach(() => {
      initiativeMethods.startInitiativeTurnPhase(true);
    });

    it('should allow actions for currently active unit', () => {
      const activation = initiativeMethods.processNextInitiativeActivation();
      const unit = testUnits.find(u => u.unitId === activation!.unitId);

      const validation = initiativeMethods.validateUnitAction(activation!.unitId, 'move', unit);

      expect(validation.isValid).toBe(true);
      expect(validation.reason).toBeUndefined();
    });

    it('should reject actions for non-active unit', () => {
      const activation = initiativeMethods.processNextInitiativeActivation();
      const nonActiveUnit = testUnits.find(u => u.unitId !== activation!.unitId);

      const validation = initiativeMethods.validateUnitAction(nonActiveUnit!.unitId!, 'move', nonActiveUnit);

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('not currently active');
    });

    it('should allow all actions when initiative system is disabled', () => {
      initiativeMethods.completeInitiativeTurn(); // Disable initiative system

      const validation = initiativeMethods.validateUnitAction('any-unit', 'move');

      expect(validation.isValid).toBe(true);
    });

    it('should reject actions for units with no ammo', () => {
      const activation = initiativeMethods.processNextInitiativeActivation();
      const unit = testUnits.find(u => u.unitId === activation!.unitId);
      unit!.ammo = 0;

      const validation = initiativeMethods.validateUnitAction(activation!.unitId, 'attack', unit);

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('no ammunition');
    });

    it('should reject actions for destroyed units', () => {
      const activation = initiativeMethods.processNextInitiativeActivation();
      const unit = testUnits.find(u => u.unitId === activation!.unitId);
      unit!.strength = 0;

      const validation = initiativeMethods.validateUnitAction(activation!.unitId, 'move', unit);

      expect(validation.isValid).toBe(false);
      expect(validation.reason).toContain('destroyed');
    });
  });

  describe('executeUnitAction', () => {
    beforeEach(() => {
      initiativeMethods.startInitiativeTurnPhase(true);
    });

    it('should execute valid action successfully', () => {
      const activation = initiativeMethods.processNextInitiativeActivation();
      const unit = testUnits.find(u => u.unitId === activation!.unitId);

      const result = initiativeMethods.executeUnitAction(activation!.unitId, 'move', { targetHex: { q: 1, r: 0 } }, unit);

      expect(result).toBe(true);
    });

    it('should throw error for invalid action', () => {
      const _activation = initiativeMethods.processNextInitiativeActivation();

      expect(() => {
        initiativeMethods.executeUnitAction('wrong-unit', 'move', { targetHex: { q: 1, r: 0 } });
      }).toThrow('Action validation failed');
    });

    it('should throw error for unknown action type', () => {
      const activation = initiativeMethods.processNextInitiativeActivation();

      expect(() => {
        initiativeMethods.executeUnitAction(activation!.unitId, 'unknown' as any, {});
      }).toThrow('Unknown action type');
    });
  });

  describe('endInitiativeTurnEarly', () => {
    beforeEach(() => {
      initiativeMethods.startInitiativeTurnPhase(true);
    });

    it('should skip remaining player activations', () => {
      // Process first player activation
      const firstActivation = initiativeMethods.processNextInitiativeActivation();
      expect(firstActivation!.ownerId).toBe('player');

      initiativeMethods.endInitiativeTurnEarly();

      // Should have processed all remaining player activations automatically
      const queue = initiativeMethods.getCurrentInitiativeQueue();
      const remainingPlayerActivations = queue?.activations.filter((a: any) => a.ownerId === 'player' && !a.isActivated);
      expect(remainingPlayerActivations).toHaveLength(0);
    });

    it('should fall back to normal endTurn when initiative system is disabled', () => {
      initiativeMethods.completeInitiativeTurn(); // Disable initiative system

      initiativeMethods.endInitiativeTurnEarly();

      expect(mockEngine.endTurn).toHaveBeenCalled();
    });
  });

  describe('Utility Methods', () => {
    beforeEach(() => {
      initiativeMethods.startInitiativeTurnPhase(true);
    });

    it('should return current initiative queue', () => {
      const queue = initiativeMethods.getCurrentInitiativeQueue();

      expect(queue).toBeDefined();
      expect(queue!.activations).toHaveLength(6); // All units except aircraft
      expect(queue!.currentTurn).toBe(1);
    });

    it('should return current activation', () => {
      const activation = initiativeMethods.processNextInitiativeActivation();
      const current = initiativeMethods.getCurrentActivation();

      expect(current).toEqual(activation);
    });

    it('should return current turn phase', () => {
      const phase = initiativeMethods.getCurrentTurnPhase();

      expect(phase).toBe('initiativeTurn');
    });

    it('should indicate when initiative system is active', () => {
      expect(initiativeMethods.isInitiativeSystemActive()).toBe(true);

      initiativeMethods.completeInitiativeTurn();
      expect(initiativeMethods.isInitiativeSystemActive()).toBe(false);
    });
  });

  describe('Integration with GameEngine State', () => {
    it('should update active faction when processing activations', () => {
      initiativeMethods.startInitiativeTurnPhase(true);

      // Process first activation (player unit)
      const firstActivation = initiativeMethods.processNextInitiativeActivation();
      expect(mockEngine._activeFaction).toBe('Player');

      // Complete first activation and process second (bot unit)
      initiativeMethods.completeUnitActivation(firstActivation!.unitId);
      const _secondActivation = initiativeMethods.processNextInitiativeActivation();
      expect(mockEngine._activeFaction).toBe('Bot');
    });

    it('should maintain turn number correctly', () => {
      initiativeMethods.startInitiativeTurnPhase(true);
      expect(mockEngine._turnNumber).toBe(1);

      initiativeMethods.completeInitiativeTurn();
      initiativeMethods.startInitiativeTurnPhase(true);
      expect(mockEngine._turnNumber).toBe(1); // Should be reset by startInitiativeTurnPhase
    });
  });

  describe('Error Handling', () => {
    it('should handle missing units gracefully', () => {
      mockEngine._playerUnits = {};
      mockEngine._botUnits = {};

      expect(() => initiativeMethods.startInitiativeTurnPhase(true)).not.toThrow();
    });

    it('should handle invalid unit IDs gracefully', () => {
      initiativeMethods.startInitiativeTurnPhase(true);

      const validation = initiativeMethods.validateUnitAction('non-existent-unit', 'move');
      expect(validation.isValid).toBe(false);
      expect(validation.reason).toBeDefined();
    });

    it('should handle corrupted queue state', () => {
      initiativeMethods.startInitiativeTurnPhase(true);

      // Manually corrupt the queue state
      const integration = initiativeMethods.getIntegration();
      const queue = integration.getInitiativeQueue();
      if (queue) {
        (queue as any).activations = [];
      }

      const activation = initiativeMethods.processNextInitiativeActivation();
      expect(activation).toBeNull();
    });
  });
});

describe('InitiativeActionValidator Integration', () => {
  let validator: InitiativeActionValidator;
  let mockContext: any;

  beforeEach(() => {
    validator = new InitiativeActionValidator();
    mockContext = {
      currentActivation: { unitId: 'test-unit', ownerId: 'player', initiative: 5 },
      isInitiativeSystemActive: true,
      currentPhase: 'initiativeTurn',
      activeFaction: 'Player'
    };
  });

  describe('Validation Context Creation', () => {
    it('should create validation context correctly', () => {
      const context = InitiativeActionValidator.createContext(
        mockContext.currentActivation,
        mockContext.isInitiativeSystemActive,
        mockContext.currentPhase,
        mockContext.activeFaction
      );

      expect(context).toEqual(mockContext);
    });
  });

  describe('Activation State Description', () => {
    it('should provide descriptive activation state', () => {
      const description = validator.getActivationStateDescription(mockContext);

      expect(description).toContain('test-unit');
      expect(description).toContain('Player');
      expect(description).toContain('Initiative 5');
    });

    it('should handle inactive system description', () => {
      mockContext.isInitiativeSystemActive = false;
      const description = validator.getActivationStateDescription(mockContext);

      expect(description).toBe('Initiative system is not active');
    });

    it('should handle no current activation', () => {
      mockContext.currentActivation = null;
      const description = validator.getActivationStateDescription(mockContext);

      expect(description).toBe('No unit is currently active');
    });
  });

  describe('Multiple Action Validation', () => {
    it('should validate multiple actions correctly', () => {
      const actions = [
        { unitId: 'test-unit', actionType: 'move' as const },
        { unitId: 'wrong-unit', actionType: 'attack' as const },
        { unitId: 'test-unit', actionType: 'support' as const }
      ];

      const results = validator.validateMultipleActions(actions, mockContext);

      expect(results).toHaveLength(3);
      expect(results[0].isValid).toBe(true);
      expect(results[1].isValid).toBe(false);
      expect(results[2].isValid).toBe(true);
    });
  });
});
