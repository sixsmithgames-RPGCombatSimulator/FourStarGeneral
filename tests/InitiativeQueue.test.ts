/**
 * Unit Tests for Initiative Queue System
 * 
 * Tests the core logic of initiative-based turn ordering and activation management.
 * 
 * @since Initiative System v1.0
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import { InitiativeQueueManager, type UnitActivation, type InitiativeQueue } from '../src/core/InitiativeQueue';
import type { ScenarioUnit } from '../src/core/types';

// Mock unit interface that extends ScenarioUnit with initiative for testing
interface MockUnit extends ScenarioUnit {
  initiative: number;
}

// Mock unit data for testing
const createMockUnit = (id: string, owner: 'player' | 'bot', initiative: number): MockUnit => ({
  unitId: id,
  type: 'Infantry_42' as any,
  hex: { q: 0, r: 0 },
  strength: 100,
  experience: 0,
  ammo: 6,
  fuel: 0,
  entrench: 0,
  facing: 'N' as any,
  // Add controlledBy property for testing
  controlledBy: owner === 'player' ? 'Player' : 'AI' as any,
  // Add initiative property for testing
  initiative: initiative
});

describe('InitiativeQueueManager', () => {
  let manager: InitiativeQueueManager;
  let testUnits: MockUnit[];

  beforeEach(() => {
    manager = new InitiativeQueueManager();
    testUnits = [
      createMockUnit('player-recon-1', 'player', 7),  // Highest initiative, player
      createMockUnit('bot-recon-1', 'bot', 7),        // Same initiative, bot (goes after player)
      createMockUnit('player-infantry-1', 'player', 5),
      createMockUnit('bot-infantry-1', 'bot', 5),
      createMockUnit('player-tank-1', 'player', 4),
      createMockUnit('bot-tank-1', 'bot', 4),
      createMockUnit('player-artillery-1', 'player', 2),
      createMockUnit('bot-artillery-1', 'bot', 2),
      createMockUnit('player-supply-1', 'player', 1),
      createMockUnit('bot-supply-1', 'bot', 1),
      createMockUnit('player-fighter-1', 'player', 0),  // Aircraft (should be filtered out)
      createMockUnit('bot-fighter-1', 'bot', 0)         // Aircraft (should be filtered out)
    ];
  });

  describe('generateQueue', () => {
    it('should generate a properly sorted initiative queue', () => {
      const queue = manager.generateQueue(testUnits, 1);

      expect(queue.activations).toHaveLength(10); // 12 units - 2 aircraft filtered out
      expect(queue.currentTurn).toBe(1);
      expect(queue.currentIndex).toBe(0);

      // Verify sorting order: initiative descending, player first in ties
      const expectedOrder = [
        'player-recon-1',    // 7, player
        'bot-recon-1',      // 7, bot
        'player-infantry-1', // 5, player
        'bot-infantry-1',   // 5, bot
        'player-tank-1',    // 4, player
        'bot-tank-1',       // 4, bot
        'player-artillery-1', // 2, player
        'bot-artillery-1',  // 2, bot
        'player-supply-1',  // 1, player
        'bot-supply-1'      // 1, bot
      ];

      expect(queue.activations.map(a => a.unitId)).toEqual(expectedOrder);
    });

    it('should filter out aircraft units (initiative 0)', () => {
      const queue = manager.generateQueue(testUnits, 1);

      const aircraftActivations = queue.activations.filter(a => a.initiative === 0);
      expect(aircraftActivations).toHaveLength(0);
    });

    it('should mark all units as not activated initially', () => {
      const queue = manager.generateQueue(testUnits, 1);

      queue.activations.forEach(activation => {
        expect(activation.isActivated).toBe(false);
      });
    });

    it('should throw error for invalid inputs', () => {
      expect(() => manager.generateQueue(null as any, 1)).toThrow('Units must be an array');
      expect(() => manager.generateQueue(undefined as any, 1)).toThrow('Units must be an array');
      expect(() => manager.generateQueue(testUnits, -1)).toThrow('Turn must be a non-negative number');
      expect(() => manager.generateQueue(testUnits, NaN)).toThrow('Turn must be a non-negative number');
    });

    it('should handle empty unit array', () => {
      const queue = manager.generateQueue([], 1);

      expect(queue.activations).toHaveLength(0);
      expect(queue.currentIndex).toBe(0);
    });

    it('should handle units with all aircraft only', () => {
      const aircraftOnly = [
        createMockUnit('fighter-1', 'player', 0),
        createMockUnit('fighter-2', 'bot', 0)
      ];

      const queue = manager.generateQueue(aircraftOnly, 1);

      expect(queue.activations).toHaveLength(0);
    });
  });

  describe('getNextActivation', () => {
    let queue: InitiativeQueue;

    beforeEach(() => {
      queue = manager.generateQueue(testUnits, 1);
    });

    it('should return the first unactivated unit', () => {
      const next = manager.getNextActivation(queue);

      expect(next).toBeDefined();
      expect(next!.unitId).toBe('player-recon-1');
      expect(next!.ownerId).toBe('player');
      expect(next!.initiative).toBe(7);
    });

    it('should return next unactivated unit after some are activated', () => {
      // Mark first unit as activated
      manager.markActivated(queue, 'player-recon-1');

      const next = manager.getNextActivation(queue);

      expect(next).toBeDefined();
      expect(next!.unitId).toBe('bot-recon-1');
    });

    it('should return null when all units are activated', () => {
      // Mark all units as activated
      queue.activations.forEach(activation => {
        manager.markActivated(queue, activation.unitId);
      });

      const next = manager.getNextActivation(queue);

      expect(next).toBeNull();
    });

    it('should return null when queue is empty', () => {
      const emptyQueue = manager.generateQueue([], 1);

      const next = manager.getNextActivation(emptyQueue);

      expect(next).toBeNull();
    });

    it('should throw error for invalid queue', () => {
      expect(() => manager.getNextActivation(null as any)).toThrow('Invalid queue provided');
      expect(() => manager.getNextActivation({} as any)).toThrow('Invalid queue provided');
    });
  });

  describe('markActivated', () => {
    let queue: InitiativeQueue;

    beforeEach(() => {
      queue = manager.generateQueue(testUnits, 1);
    });

    it('should mark a unit as activated and advance position', () => {
      manager.markActivated(queue, 'player-recon-1');

      const activatedUnit = queue.activations.find(a => a.unitId === 'player-recon-1');
      expect(activatedUnit!.isActivated).toBe(true);
      expect(queue.currentIndex).toBe(1);
    });

    it('should advance position past multiple activated units', () => {
      manager.markActivated(queue, 'player-recon-1');
      manager.markActivated(queue, 'bot-recon-1');

      expect(queue.currentIndex).toBe(2);
    });

    it('should throw error for non-existent unit', () => {
      expect(() => manager.markActivated(queue, 'non-existent')).toThrow('Unit non-existent not found in initiative queue');
    });

    it('should throw error for already activated unit', () => {
      manager.markActivated(queue, 'player-recon-1');

      expect(() => manager.markActivated(queue, 'player-recon-1')).toThrow('Unit player-recon-1 is already activated');
    });

    it('should throw error for invalid inputs', () => {
      expect(() => manager.markActivated(null as any, 'player-recon-1')).toThrow('Invalid queue provided');
      expect(() => manager.markActivated(queue, '')).toThrow('Unit ID must be a non-empty string');
      expect(() => manager.markActivated(queue, null as any)).toThrow('Unit ID must be a non-empty string');
    });
  });

  describe('skipRemainingPlayerActivations', () => {
    let queue: InitiativeQueue;

    beforeEach(() => {
      queue = manager.generateQueue(testUnits, 1);
    });

    it('should mark all remaining player units as activated', () => {
      manager.skipRemainingPlayerActivations(queue);

      const playerActivations = queue.activations.filter(a => a.ownerId === 'player');
      playerActivations.forEach(activation => {
        expect(activation.isActivated).toBe(true);
      });

      const botActivations = queue.activations.filter(a => a.ownerId === 'bot');
      botActivations.forEach(activation => {
        expect(activation.isActivated).toBe(false);
      });
    });

    it('should advance index past all player units', () => {
      manager.skipRemainingPlayerActivations(queue);

      const nextActivation = manager.getNextActivation(queue);
      expect(nextActivation).toBeDefined();
      expect(nextActivation!.ownerId).toBe('bot');
    });

    it('should handle case where no player units remain', () => {
      // Mark all player units as activated first
      queue.activations
        .filter(a => a.ownerId === 'player')
        .forEach(a => (a as UnitActivation).isActivated = true);

      const originalIndex = queue.currentIndex;
      manager.skipRemainingPlayerActivations(queue);

      expect(queue.currentIndex).toBe(originalIndex);
    });
  });

  describe('getRemainingActivations', () => {
    let queue: InitiativeQueue;

    beforeEach(() => {
      queue = manager.generateQueue(testUnits, 1);
    });

    it('should return all unactivated units for specified owner', () => {
      manager.markActivated(queue, 'player-recon-1');

      const remainingPlayer = manager.getRemainingActivations(queue, 'player');
      const remainingBot = manager.getRemainingActivations(queue, 'bot');

      expect(remainingPlayer).toHaveLength(4); // 5 player units - 1 activated
      expect(remainingBot).toHaveLength(5);   // 5 bot units, none activated

      expect(remainingPlayer.every(a => a.ownerId === 'player' && !a.isActivated)).toBe(true);
      expect(remainingBot.every(a => a.ownerId === 'bot' && !a.isActivated)).toBe(true);
    });

    it('should return empty array when no units remain for owner', () => {
      queue.activations
        .filter(a => a.ownerId === 'player')
        .forEach(a => (a as UnitActivation).isActivated = true);

      const remainingPlayer = manager.getRemainingActivations(queue, 'player');

      expect(remainingPlayer).toHaveLength(0);
    });

    it('should throw error for invalid owner', () => {
      expect(() => manager.getRemainingActivations(queue, 'invalid' as any)).toThrow('Owner ID must be "player" or "bot"');
    });
  });

  describe('isQueueComplete', () => {
    let queue: InitiativeQueue;

    beforeEach(() => {
      queue = manager.generateQueue(testUnits, 1);
    });

    it('should return false when units remain unactivated', () => {
      expect(manager.isQueueComplete(queue)).toBe(false);
    });

    it('should return true when all units are activated', () => {
      queue.activations.forEach(activation => {
        manager.markActivated(queue, activation.unitId);
      });

      expect(manager.isQueueComplete(queue)).toBe(true);
    });

    it('should return true for empty queue', () => {
      const emptyQueue = manager.generateQueue([], 1);

      expect(manager.isQueueComplete(emptyQueue)).toBe(true);
    });
  });

  describe('getCurrentActivation', () => {
    let queue: InitiativeQueue;

    beforeEach(() => {
      queue = manager.generateQueue(testUnits, 1);
    });

    it('should return current activation when not activated', () => {
      const current = manager.getCurrentActivation(queue);

      expect(current).toBeDefined();
      expect(current!.unitId).toBe('player-recon-1');
    });

    it('should return null when current position is activated', () => {
      manager.markActivated(queue, 'player-recon-1');

      const current = manager.getCurrentActivation(queue);

      expect(current).toBeNull();
    });

    it('should return null when index is beyond array', () => {
      // Mark all units as activated
      queue.activations.forEach(activation => {
        manager.markActivated(queue, activation.unitId);
      });

      const current = manager.getCurrentActivation(queue);

      expect(current).toBeNull();
    });
  });

  describe('resetQueue', () => {
    let queue: InitiativeQueue;

    beforeEach(() => {
      queue = manager.generateQueue(testUnits, 1);
      // Activate some units
      manager.markActivated(queue, 'player-recon-1');
      manager.markActivated(queue, 'bot-recon-1');
    });

    it('should reset all activation states and position', () => {
      manager.resetQueue(queue);

      expect(queue.currentIndex).toBe(0);
      queue.activations.forEach(activation => {
        expect(activation.isActivated).toBe(false);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle units with same initiative and same owner', () => {
      const sameInitiativeUnits = [
        createMockUnit('player-1', 'player', 5),
        createMockUnit('player-2', 'player', 5),
        createMockUnit('player-3', 'player', 5)
      ];

      const queue = manager.generateQueue(sameInitiativeUnits, 1);

      // Should maintain original order for same owner and initiative
      expect(queue.activations.map(a => a.unitId)).toEqual(['player-1', 'player-2', 'player-3']);
    });

    it('should handle mixed valid and invalid units', () => {
      const mixedUnits = [
        createMockUnit('valid-1', 'player', 5),
        { ...createMockUnit('invalid-1', 'player', 3), initiative: -1 }, // Invalid initiative
        createMockUnit('valid-2', 'bot', 4),
        { ...createMockUnit('invalid-2', 'bot', 0), initiative: 0 } // Aircraft
      ];

      const queue = manager.generateQueue(mixedUnits, 1);

      // Should only include valid units with initiative > 0
      expect(queue.activations).toHaveLength(2);
      expect(queue.activations.map(a => a.unitId)).toEqual(['valid-1', 'valid-2']);
    });

    it('should preserve queue immutability', () => {
      const queue = manager.generateQueue(testUnits, 1);
      const originalActivations = [...queue.activations];

      // Try to modify the returned queue
      expect(() => {
        (queue.activations as any).push({} as UnitActivation);
      }).toThrow(); // Should be readonly

      // Original should be unchanged
      expect(queue.activations).toEqual(originalActivations);
    });
  });
});
