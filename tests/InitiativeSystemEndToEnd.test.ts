/**
 * Initiative System End-to-End Tests
 * 
 * Comprehensive integration tests for the complete initiative system
 * including grouped processing, event handling, timing, destruction,
 * and skip functionality.
 * 
 * @since Initiative System v2.0
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { GroupedInitiativeQueueManager } from '../src/core/GroupedInitiativeQueue';
import { InitiativeUnitDestructionHandler } from '../src/core/InitiativeUnitDestructionHandler';
import { InitiativeSkipHandler } from '../src/core/InitiativeSkipHandler';
import { InitiativeEventSystem } from '../src/events/InitiativeEventSystem';
import type { ScenarioUnit } from '../src/core/types';
import type { GroupedInitiativeQueue } from '../src/core/GroupedInitiativeQueue';

// Mock unit interface that extends ScenarioUnit with initiative for testing
interface MockUnit extends ScenarioUnit {
  initiative: number;
}

// Test utilities
const createMockUnit = (id: string, type: string, owner: 'Player' | 'Bot', initiative: number): MockUnit => ({
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
  initiative
});

const createTestUnits = (): MockUnit[] => [
  // Initiative 7 units (highest)
  createMockUnit('player-recon-1', 'recon_bike', 'Player', 7),
  createMockUnit('bot-recon-1', 'recon_armoredcar', 'Bot', 7),
  
  // Initiative 6 units
  createMockUnit('player-infantry-1', 'infantry_42', 'Player', 6),
  createMockUnit('player-infantry-2', 'infantry_42', 'Player', 6),
  createMockUnit('bot-infantry-1', 'infantry_42', 'Bot', 6),
  
  // Initiative 5 units
  createMockUnit('player-light-tank-1', 'light_tank', 'Player', 5),
  createMockUnit('bot-light-tank-1', 'light_tank', 'Bot', 5),
  
  // Initiative 4 units
  createMockUnit('player-artillery-1', 'howitzer_105', 'Player', 4),
  createMockUnit('bot-artillery-1', 'howitzer_105', 'Bot', 4)
];

describe('Initiative System End-to-End Tests', () => {
  let queueManager: GroupedInitiativeQueueManager;
  let destructionHandler: InitiativeUnitDestructionHandler;
  let skipHandler: InitiativeSkipHandler;
  let eventSystem: InitiativeEventSystem;
  let testUnits: MockUnit[];
  let testQueue: GroupedInitiativeQueue;

  beforeEach(() => {
    queueManager = new GroupedInitiativeQueueManager();
    destructionHandler = new InitiativeUnitDestructionHandler();
    skipHandler = new InitiativeSkipHandler();
    eventSystem = new InitiativeEventSystem();
    
    testUnits = createTestUnits();
    testQueue = queueManager.generateGroupedQueue(testUnits, 1);
  });

  afterEach(() => {
    queueManager = null as any;
    destructionHandler = null as any;
    skipHandler = null as any;
    eventSystem.dispose();
  });

  describe('Grouped Initiative Processing', () => {
    it('should create proper grouped queue with correct initiative ordering', () => {
      expect(testQueue.groups).toHaveLength(4); // 4 different initiative values
      
      // Check initiative ordering (descending)
      expect(testQueue.groups[0].initiative).toBe(7);
      expect(testQueue.groups[1].initiative).toBe(6);
      expect(testQueue.groups[2].initiative).toBe(5);
      expect(testQueue.groups[3].initiative).toBe(4);
      
      // Check player units come first in each group
      expect(testQueue.groups[0].units[0].ownerId).toBe('player');
      expect(testQueue.groups[0].units[1].ownerId).toBe('bot');
      
      expect(testQueue.groups[1].units[0].ownerId).toBe('player');
      expect(testQueue.groups[1].units[1].ownerId).toBe('player');
      expect(testQueue.groups[1].units[2].ownerId).toBe('bot');
    });

    it('should process units within same initiative group correctly', () => {
      const currentGroup = queueManager.getCurrentGroup(testQueue);
      expect(currentGroup?.initiative).toBe(7);
      expect(currentGroup?.units).toHaveLength(2);
      
      // Get current unit
      const currentUnit = queueManager.getCurrentUnit(testQueue);
      expect(currentUnit?.unitId).toBe('player-recon-1');
      expect(currentUnit?.ownerId).toBe('player');
      
      // Complete current unit
      queueManager.completeCurrentUnit(testQueue, 'player-recon-1');
      
      // Should move to next unit in same group
      const nextUnit = queueManager.getCurrentUnit(testQueue);
      expect(nextUnit?.unitId).toBe('bot-recon-1');
      expect(nextUnit?.ownerId).toBe('bot');
      
      // Complete bot unit
      queueManager.completeCurrentUnit(testQueue, 'bot-recon-1');
      
      // Should move to next group
      const nextGroup = queueManager.getCurrentGroup(testQueue);
      expect(nextGroup?.initiative).toBe(6);
    });

    it('should skip remaining player units in current group', () => {
      // Move to initiative 6 group (has 2 player units and 1 bot unit)
      queueManager.completeCurrentUnit(testQueue, 'player-recon-1');
      queueManager.completeCurrentUnit(testQueue, 'bot-recon-1');
      
      const currentGroup = queueManager.getCurrentGroup(testQueue);
      expect(currentGroup?.initiative).toBe(6);
      expect(currentGroup?.units).toHaveLength(3);
      
      // Skip remaining player units
      queueManager.skipRemainingPlayerUnitsInCurrentGroup(testQueue);
      
      // Should now be on bot unit
      const currentUnit = queueManager.getCurrentUnit(testQueue);
      expect(currentUnit?.unitId).toBe('bot-infantry-1');
      expect(currentUnit?.ownerId).toBe('bot');
    });

    it('should handle queue exhaustion correctly', () => {
      // Complete all units
      while (!queueManager.isAllGroupsCompleted(testQueue)) {
        const currentUnit = queueManager.getCurrentUnit(testQueue);
        if (currentUnit) {
          queueManager.completeCurrentUnit(testQueue, currentUnit.unitId);
        } else {
          queueManager.completeCurrentGroup(testQueue);
        }
      }
      
      expect(queueManager.isAllGroupsCompleted(testQueue)).toBe(true);
      expect(queueManager.getCurrentUnit(testQueue)).toBeNull();
      expect(queueManager.getCurrentGroup(testQueue)).toBeNull();
    });
  });

  describe('Event System Integration', () => {
    it('should fire events for unit activation and completion', () => {
      const unitActivatedEvents: any[] = [];
      const unitCompletedEvents: any[] = [];
      
      eventSystem.addEventListener('unit-activated', (event) => {
        unitActivatedEvents.push(event);
      });
      
      eventSystem.addEventListener('unit-completed', (event) => {
        unitCompletedEvents.push(event);
      });
      
      // Set up event listeners on queue manager
      queueManager.addEventListener('onUnitActivated', (unit) => {
        eventSystem.emitUnitEvent('unit-activated', unit.unitId, unit.ownerId, unit.initiative);
      });
      
      queueManager.addEventListener('onUnitCompleted', (unit) => {
        eventSystem.emitUnitEvent('unit-completed', unit.unitId, unit.ownerId, unit.initiative);
      });
      
      // Activate first unit
      const currentUnit = queueManager.getCurrentUnit(testQueue);
      expect(currentUnit).toBeTruthy();
      
      // Complete first unit
      queueManager.completeCurrentUnit(testQueue, currentUnit!.unitId);
      
      expect(unitActivatedEvents).toHaveLength(1);
      expect(unitCompletedEvents).toHaveLength(1);
      expect(unitActivatedEvents[0].unitId).toBe('player-recon-1');
      expect(unitCompletedEvents[0].unitId).toBe('player-recon-1');
    });

    it('should fire events for group transitions', () => {
      const groupActivatedEvents: any[] = [];
      const groupCompletedEvents: any[] = [];
      
      eventSystem.addEventListener('group-activated', (event) => {
        groupActivatedEvents.push(event);
      });
      
      eventSystem.addEventListener('group-completed', (event) => {
        groupCompletedEvents.push(event);
      });
      
      // Set up event listeners on queue manager
      queueManager.addEventListener('onGroupActivated', (group) => {
        eventSystem.emitGroupEvent('group-activated', group, testQueue.currentGroupIndex, testQueue.groups.length);
      });
      
      queueManager.addEventListener('onGroupCompleted', (group) => {
        eventSystem.emitGroupEvent('group-completed', group, testQueue.currentGroupIndex, testQueue.groups.length);
      });
      
      // Complete first group
      queueManager.completeCurrentUnit(testQueue, 'player-recon-1');
      queueManager.completeCurrentUnit(testQueue, 'bot-recon-1');
      
      expect(groupCompletedEvents).toHaveLength(1);
      expect(groupCompletedEvents[0].initiative).toBe(7);
    });
  });

  
  describe('Unit Destruction Handling', () => {
    it('should handle destruction of current unit', () => {
      const currentUnit = queueManager.getCurrentUnit(testQueue);
      expect(currentUnit?.unitId).toBe('player-recon-1');
      
      const result = destructionHandler.handleUnitDestruction(
        'player-recon-1',
        testQueue,
        { reason: 'combat', sourceUnitId: 'bot-infantry-1' }
      );
      
      expect(result.impact.wasActive).toBe(true);
      expect(result.impact.wasInCurrentGroup).toBe(true);
      expect(result.updatedQueue.totalUnits).toBe(testUnits.length - 1);
      
      // Should have moved to next unit
      const nextUnit = queueManager.getCurrentUnit(result.updatedQueue);
      expect(nextUnit?.unitId).toBe('bot-recon-1');
    });

    it('should handle destruction of units in current group', () => {
      // Destroy bot recon unit (second in initiative 7 group)
      const result = destructionHandler.handleUnitDestruction(
        'bot-recon-1',
        testQueue,
        { reason: 'combat' }
      );
      
      expect(result.impact.wasActive).toBe(false);
      expect(result.impact.wasInCurrentGroup).toBe(true);
      expect(result.impact.unitsRemainingInGroup).toBe(1);
      
      // Current unit should still be player recon
      const currentUnit = queueManager.getCurrentUnit(result.updatedQueue);
      expect(currentUnit?.unitId).toBe('player-recon-1');
    });

    it('should handle destruction that empties current group', () => {
      // Destroy both units in initiative 7 group
      let updatedQueue = testQueue;
      
      updatedQueue = destructionHandler.handleUnitDestruction(
        'player-recon-1',
        updatedQueue,
        { reason: 'combat' }
      ).updatedQueue;
      
      const result = destructionHandler.handleUnitDestruction(
        'bot-recon-1',
        updatedQueue,
        { reason: 'combat' }
      );
      
      expect(result.impact.isCurrentGroupEmpty).toBe(true);
      
      // Should have moved to next group
      const currentUnit = queueManager.getCurrentUnit(result.updatedQueue);
      expect(currentUnit?.unitId).toBe('player-infantry-1');
    });

    it('should handle multiple unit destructions', () => {
      const result = destructionHandler.handleMultipleDestructions(
        ['player-recon-1', 'bot-recon-1', 'player-infantry-1'],
        testQueue,
        { reason: 'combat' }
      );
      
      expect(result.impacts).toHaveLength(3);
      expect(result.updatedQueue.totalUnits).toBe(testUnits.length - 3);
      expect(result.destructionContexts).toHaveLength(3);
    });
  });

  describe('Skip Functionality', () => {
    it('should skip current unit', () => {
      const currentUnit = queueManager.getCurrentUnit(testQueue);
      expect(currentUnit?.unitId).toBe('player-recon-1');
      
      const result = skipHandler.skipCurrentUnit(testQueue);
      
      expect(result.success).toBe(true);
      expect(result.unitsSkipped).toBe(1);
      expect(result.skippedUnitIds).toContain('player-recon-1');
      
      // Should have moved to next unit
      const nextUnit = queueManager.getCurrentUnit(testQueue);
      expect(nextUnit?.unitId).toBe('bot-recon-1');
    });

    it('should skip current group', () => {
      // Move to initiative 6 group (has 3 units)
      queueManager.completeCurrentUnit(testQueue, 'player-recon-1');
      queueManager.completeCurrentUnit(testQueue, 'bot-recon-1');
      
      const currentGroup = queueManager.getCurrentGroup(testQueue);
      expect(currentGroup?.units.length).toBe(3);
      
      const result = skipHandler.skipCurrentGroup(testQueue);
      
      expect(result.success).toBe(true);
      expect(result.unitsSkipped).toBe(3);
      
      // Should have moved to next group
      const nextGroup = queueManager.getCurrentGroup(testQueue);
      expect(nextGroup?.initiative).toBe(5);
    });

    it('should skip all remaining units', () => {
      const result = skipHandler.skipAllRemaining(testQueue);
      
      expect(result.success).toBe(true);
      expect(result.unitsSkipped).toBe(testUnits.length);
      expect(result.queueExhausted).toBe(true);
      expect(queueManager.isAllGroupsCompleted(testQueue)).toBe(true);
    });

    it('should validate skip operations', () => {
      // Try to skip already activated unit
      const activatedUnit = testQueue.groups[0].units[0];
      activatedUnit.isActivated = true;
      
      const validation = skipHandler.validateSkipUnit(activatedUnit, testQueue, skipHandler['options']);
      
      expect(validation.isValid).toBe(false);
      expect(validation.reason).toBe('Unit is already activated');
    });

    it('should provide skip statistics', () => {
      // Perform some skips
      skipHandler.skipCurrentUnit(testQueue);
      skipHandler.skipCurrentGroup(testQueue);
      
      const stats = skipHandler.getSkipStatistics();
      
      expect(stats.totalSkips).toBe(2);
      expect(stats.unitsSkipped).toBeGreaterThan(0);
      expect(stats.skipTypes).toHaveProperty('single');
      expect(stats.skipTypes).toHaveProperty('group');
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle complete turn flow with all systems', () => {
      const events: any[] = [];
      
      // Set up event listeners
      eventSystem.addEventListener('unit-activated', (event) => events.push({ eventType: 'unit-activated', id: event.id, timestamp: event.timestamp, unitId: (event as any).unitId }));
      eventSystem.addEventListener('unit-completed', (event) => events.push({ eventType: 'unit-completed', id: event.id, timestamp: event.timestamp, unitId: (event as any).unitId }));
      eventSystem.addEventListener('group-completed', (event) => events.push({ eventType: 'group-completed', id: event.id, timestamp: event.timestamp, initiative: (event as any).initiative }));
      
      // Connect queue manager to event system
      queueManager.addEventListener('onUnitActivated', (unit) => {
        eventSystem.emitUnitEvent('unit-activated', unit.unitId, unit.ownerId, unit.initiative);
      });
      
      queueManager.addEventListener('onUnitCompleted', (unit) => {
        eventSystem.emitUnitEvent('unit-completed', unit.unitId, unit.ownerId, unit.initiative);
      });
      
      queueManager.addEventListener('onGroupCompleted', (group) => {
        eventSystem.emitGroupEvent('group-completed', group, testQueue.currentGroupIndex, testQueue.groups.length);
      });
      
      // Process complete turn
      let processedUnits = 0;
      
      while (!queueManager.isAllGroupsCompleted(testQueue)) {
        const currentUnit = queueManager.getCurrentUnit(testQueue);
        if (!currentUnit) break;
        
        // Process player unit actions
        if (currentUnit.ownerId === 'player') {
          // Player units can take as long as needed - no timing constraints
        }
        
        // Complete unit
        queueManager.completeCurrentUnit(testQueue, currentUnit.unitId);
        processedUnits++;
      }
      
      expect(processedUnits).toBe(testUnits.length);
      expect(events.length).toBeGreaterThan(0);
      
      // Verify event sequence
      const unitActivatedEvents = events.filter(e => e.eventType === 'unit-activated');
      const unitCompletedEvents = events.filter(e => e.eventType === 'unit-completed');
      const groupCompletedEvents = events.filter(e => e.eventType === 'group-completed');
      
      expect(unitActivatedEvents.length).toBe(testUnits.length);
      expect(unitCompletedEvents.length).toBe(testUnits.length);
      expect(groupCompletedEvents.length).toBe(testQueue.groups.length);
    });

    it('should handle complex scenario with destruction and skipping', () => {
      // Process some units normally
      queueManager.completeCurrentUnit(testQueue, 'player-recon-1');
      
      // Destroy a unit
      const destructionResult = destructionHandler.handleUnitDestruction(
        'bot-recon-1',
        testQueue,
        { reason: 'combat' }
      );
      testQueue = destructionResult.updatedQueue;
      
      // Skip remaining units in current group (should be empty now)
      const skipResult = skipHandler.skipCurrentGroup(testQueue);
      expect(skipResult.success).toBe(true);
      
      // Should be in initiative 6 group
      const currentUnit = queueManager.getCurrentUnit(testQueue);
      expect(currentUnit?.unitId).toBe('player-infantry-1');
      
      // Skip some specific units
      const specificSkipResult = skipHandler.skipSpecificUnits(
        ['player-infantry-2', 'bot-infantry-1'],
        testQueue
      );
      
      expect(specificSkipResult.success).toBe(true);
      expect(specificSkipResult.unitsSkipped).toBe(2);
      
      // Should still have player-infantry-1 as current
      const stillCurrentUnit = queueManager.getCurrentUnit(testQueue);
      expect(stillCurrentUnit?.unitId).toBe('player-infantry-1');
    });

    it('should handle edge case with all units destroyed', () => {
      // Destroy all units
      const unitIds = testUnits.map(u => u.unitId).filter((id): id is string => id !== undefined);
      const result = destructionHandler.handleMultipleDestructions(
        unitIds,
        testQueue,
        { reason: 'combat' }
      );
      
      expect(result.updatedQueue.totalUnits).toBe(0);
      expect(result.updatedQueue.groups).toHaveLength(0);
      expect(queueManager.isAllGroupsCompleted(result.updatedQueue)).toBe(true);
    });
  });

  describe('Performance and Error Handling', () => {
    it('should handle large number of units efficiently', () => {
      // Create large set of units
      const largeUnitSet: MockUnit[] = [];
      for (let i = 0; i < 100; i++) {
        largeUnitSet.push(createMockUnit(
          `unit-${i}`,
          i % 2 === 0 ? 'infantry_42' : 'light_tank',
          i % 3 === 0 ? 'Player' : 'Bot',
          Math.floor(Math.random() * 10) + 1
        ));
      }
      
      const startTime = performance.now();
      const largeQueue = queueManager.generateGroupedQueue(largeUnitSet, 1);
      const endTime = performance.now();
      
      expect(largeQueue.totalUnits).toBe(100);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });

    it('should handle invalid operations gracefully', () => {
      // Try to complete non-existent unit
      expect(() => {
        queueManager.completeCurrentUnit(testQueue, 'non-existent-unit');
      }).toThrow();
      
      // Try to destroy non-existent unit
      const result = destructionHandler.handleUnitDestruction('non-existent-unit', testQueue);
      expect(result.impact.wasActive).toBe(false);
      expect(result.impact.wasInCurrentGroup).toBe(false);
      
      // Try to skip when no units available
      const emptyQueue: GroupedInitiativeQueue = {
        groups: [],
        currentGroupIndex: 0,
        currentTurn: 1,
        totalUnits: 0
      };
      
      const skipResult = skipHandler.skipCurrentUnit(emptyQueue);
      expect(skipResult.success).toBe(false);
      expect(skipResult.errorMessage).toBeTruthy();
    });

    it('should maintain state consistency under concurrent operations', () => {
      // Simulate concurrent operations
      const operations = [
        () => queueManager.completeCurrentUnit(testQueue, 'player-recon-1'),
        () => destructionHandler.handleUnitDestruction('bot-recon-1', testQueue),
        () => skipHandler.skipSpecificUnits(['player-infantry-1'], testQueue)
      ];
      
      // Execute operations in random order
      operations.sort(() => Math.random() - 0.5);
      
      operations.forEach(operation => {
        expect(() => operation()).not.toThrow();
      });
      
      // Verify queue is still in valid state
      const currentUnit = queueManager.getCurrentUnit(testQueue);
      expect(currentUnit).toBeTruthy();
      expect(testQueue.totalUnits).toBeGreaterThan(0);
    });
  });
});
