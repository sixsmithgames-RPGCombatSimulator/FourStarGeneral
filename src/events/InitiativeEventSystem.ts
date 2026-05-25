/**
 * Initiative Event System
 * 
 * Provides event-driven architecture for initiative system transitions.
 * Enables loose coupling between initiative components and supports
 * reactive programming patterns for UI updates and game state changes.
 * 
 * @since Initiative System v2.0
 */

import type { UnitActivation } from '../core/InitiativeQueue';
import type { InitiativeGroup, GroupedInitiativeQueue } from '../core/GroupedInitiativeQueue';
import type { ExtendedBattlePhase } from '../game/GameEngineInitiativeExtensions';

/**
 * Base event interface for all initiative events
 */
export interface InitiativeEvent {
  /** Unique event identifier */
  id: string;
  /** Event timestamp */
  timestamp: number;
  /** Event type */
  type: string;
  /** Source of the event */
  source: string;
}

/**
 * Unit activation events
 */
export interface UnitActivationEvent extends InitiativeEvent {
  type: 'unit-activated' | 'unit-completed' | 'unit-skipped';
  unitId: string;
  ownerId: 'player' | 'bot';
  initiative: number;
  previousUnitId?: string;
  nextUnitId?: string;
}

/**
 * Group transition events
 */
export interface GroupTransitionEvent extends InitiativeEvent {
  type: 'group-activated' | 'group-completed';
  initiative: number;
  groupIndex: number;
  totalGroups: number;
  unitsInGroup: number;
  completedUnitsInGroup: number;
}

/**
 * Phase transition events
 */
export interface PhaseTransitionEvent extends InitiativeEvent {
  type: 'phase-changed' | 'turn-started' | 'turn-ended';
  fromPhase: ExtendedBattlePhase;
  toPhase: ExtendedBattlePhase;
  turnNumber: number;
  reason?: string;
}

/**
 * Queue state events
 */
export interface QueueStateEvent extends InitiativeEvent {
  type: 'queue-initialized' | 'queue-updated' | 'queue-exhausted';
  totalUnits: number;
  activatedUnits: number;
  remainingUnits: number;
  currentInitiative: number | null;
}

/**
 * Bot AI events
 */
export interface BotAIEvent extends InitiativeEvent {
  type: 'bot-thinking-started' | 'bot-thinking-completed' | 'bot-action-executed';
  unitId: string;
  decisionTime: number;
  actionType?: string;
  actionTarget?: string;
}

/**
 * Timing events
 */
export interface TimingEvent extends InitiativeEvent {
  type: 'timing-started' | 'timing-paused' | 'timing-resumed' | 'timing-expired';
  duration: number;
  remainingTime: number;
  timerType: 'unit' | 'group' | 'turn';
}

/**
 * Event listener function type
 */
export type EventListener<T extends InitiativeEvent = InitiativeEvent> = (event: T) => void;

/**
 * Event filter function type
 */
export type EventFilter<T extends InitiativeEvent = InitiativeEvent> = (event: T) => boolean;

/**
 * Initiative event system manager
 */
export class InitiativeEventSystem {
  private eventListeners: Map<string, Set<EventListener>> = new Map();
  private eventHistory: InitiativeEvent[] = [];
  private maxHistorySize: number = 1000;
  private eventFilters: Map<string, EventFilter[]> = new Map();
  private isPaused: boolean = false;
  private pausedEvents: InitiativeEvent[] = [];

  /**
   * Register an event listener for a specific event type
   * 
   * @param eventType - Event type to listen for
   * @param listener - Event listener function
   * @returns Unsubscribe function
   */
  public addEventListener<T extends InitiativeEvent>(
    eventType: string,
    listener: EventListener<T>
  ): () => void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }

    const listeners = this.eventListeners.get(eventType)!;
    listeners.add(listener as EventListener<InitiativeEvent>);

    // Return unsubscribe function
    return () => {
      listeners.delete(listener as EventListener<InitiativeEvent>);
      if (listeners.size === 0) {
        this.eventListeners.delete(eventType);
      }
    };
  }

  /**
   * Remove an event listener
   * 
   * @param eventType - Event type
   * @param listener - Event listener to remove
   */
  public removeEventListener<T extends InitiativeEvent>(
    eventType: string,
    listener: EventListener<T>
  ): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener as EventListener<InitiativeEvent>);
      if (listeners.size === 0) {
        this.eventListeners.delete(eventType);
      }
    }
  }

  /**
   * Add an event filter for a specific event type
   * 
   * @param eventType - Event type to filter
   * @param filter - Filter function
   */
  public addEventFilter<T extends InitiativeEvent>(
    eventType: string,
    filter: EventFilter<T>
  ): void {
    if (!this.eventFilters.has(eventType)) {
      this.eventFilters.set(eventType, []);
    }
    this.eventFilters.get(eventType)!.push(filter as EventFilter<InitiativeEvent>);
  }

  /**
   * Remove an event filter
   * 
   * @param eventType - Event type
   * @param filter - Filter function to remove
   */
  public removeEventFilter<T extends InitiativeEvent>(
    eventType: string,
    filter: EventFilter<T>
  ): void {
    const filters = this.eventFilters.get(eventType);
    if (filters) {
      const index = filters.indexOf(filter as EventFilter<InitiativeEvent>);
      if (index !== -1) {
        filters.splice(index, 1);
      }
      if (filters.length === 0) {
        this.eventFilters.delete(eventType);
      }
    }
  }

  /**
   * Emit an event to all registered listeners
   * 
   * @param event - Event to emit
   */
  public emit(event: InitiativeEvent): void {
    // Add to history
    this.addToHistory(event);

    // If paused, store for later
    if (this.isPaused) {
      this.pausedEvents.push(event);
      return;
    }

    // Apply filters
    const filters = this.eventFilters.get(event.type) || [];
    const shouldEmit = filters.length === 0 || filters.some(filter => filter(event));

    if (!shouldEmit) {
      return;
    }

    // Notify listeners
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      listeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in event listener for ${event.type}:`, error);
        }
      });
    }

    // Also notify wildcard listeners
    const wildcardListeners = this.eventListeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach(listener => {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in wildcard event listener:`, error);
        }
      });
    }
  }

  /**
   * Create and emit a unit activation event
   * 
   * @param type - Event type
   * @param unitId - Unit ID
   * @param ownerId - Unit owner
   * @param initiative - Initiative value
   * @param context - Additional context
   */
  public emitUnitEvent(
    type: 'unit-activated' | 'unit-completed' | 'unit-skipped',
    unitId: string,
    ownerId: 'player' | 'bot',
    initiative: number,
    context: {
      previousUnitId?: string;
      nextUnitId?: string;
      source?: string;
    } = {}
  ): void {
    const event: UnitActivationEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      type,
      unitId,
      ownerId,
      initiative,
      previousUnitId: context.previousUnitId,
      nextUnitId: context.nextUnitId,
      source: context.source || 'InitiativeSystem'
    };

    this.emit(event);
  }

  /**
   * Create and emit a group transition event
   * 
   * @param type - Event type
   * @param group - Initiative group
   * @param groupIndex - Group index
   * @param totalGroups - Total number of groups
   */
  public emitGroupEvent(
    type: 'group-activated' | 'group-completed',
    group: InitiativeGroup,
    groupIndex: number,
    totalGroups: number
  ): void {
    const event: GroupTransitionEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      type,
      initiative: group.initiative,
      groupIndex,
      totalGroups,
      unitsInGroup: group.units.length,
      completedUnitsInGroup: group.units.filter(u => u.isActivated).length,
      source: 'InitiativeSystem'
    };

    this.emit(event);
  }

  /**
   * Create and emit a phase transition event
   * 
   * @param type - Event type
   * @param fromPhase - Previous phase
   * @param toPhase - New phase
   * @param turnNumber - Turn number
   * @param reason - Reason for transition
   */
  public emitPhaseEvent(
    type: 'phase-changed' | 'turn-started' | 'turn-ended',
    fromPhase: ExtendedBattlePhase,
    toPhase: ExtendedBattlePhase,
    turnNumber: number,
    reason?: string
  ): void {
    const event: PhaseTransitionEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      type,
      fromPhase,
      toPhase,
      turnNumber,
      reason,
      source: 'InitiativeSystem'
    };

    this.emit(event);
  }

  /**
   * Create and emit a queue state event
   * 
   * @param type - Event type
   * @param queue - Current queue state
   */
  public emitQueueEvent(
    type: 'queue-initialized' | 'queue-updated' | 'queue-exhausted',
    queue: GroupedInitiativeQueue
  ): void {
    const activatedUnits = queue.groups.flatMap(g => g.units).filter(u => u.isActivated).length;
    const remainingUnits = queue.totalUnits - activatedUnits;
    const currentGroup = queue.groups[queue.currentGroupIndex];

    const event: QueueStateEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      type,
      totalUnits: queue.totalUnits,
      activatedUnits,
      remainingUnits,
      currentInitiative: currentGroup?.initiative || null,
      source: 'InitiativeSystem'
    };

    this.emit(event);
  }

  /**
   * Create and emit a bot AI event
   * 
   * @param type - Event type
   * @param unitId - Bot unit ID
   * @param decisionTime - Time taken for decision
   * @param context - Additional context
   */
  public emitBotAIEvent(
    type: 'bot-thinking-started' | 'bot-thinking-completed' | 'bot-action-executed',
    unitId: string,
    decisionTime: number,
    context: {
      actionType?: string;
      actionTarget?: string;
      source?: string;
    } = {}
  ): void {
    const event: BotAIEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      type,
      unitId,
      decisionTime,
      actionType: context.actionType,
      actionTarget: context.actionTarget,
      source: context.source || 'BotAI'
    };

    this.emit(event);
  }

  /**
   * Create and emit a timing event
   * 
   * @param type - Event type
   * @param duration - Total duration
   * @param remainingTime - Remaining time
   * @param timerType - Timer type
   */
  public emitTimingEvent(
    type: 'timing-started' | 'timing-paused' | 'timing-resumed' | 'timing-expired',
    duration: number,
    remainingTime: number,
    timerType: 'unit' | 'group' | 'turn'
  ): void {
    const event: TimingEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      type,
      duration,
      remainingTime,
      timerType,
      source: 'TimingSystem'
    };

    this.emit(event);
  }

  /**
   * Get event history for a specific event type
   * 
   * @param eventType - Event type to filter by (optional)
   * @param limit - Maximum number of events to return
   * @returns Array of events
   */
  public getEventHistory(eventType?: string, limit?: number): InitiativeEvent[] {
    let events = this.eventHistory;
    
    if (eventType) {
      events = events.filter(event => event.type === eventType);
    }

    if (limit) {
      events = events.slice(-limit);
    }

    return events;
  }

  /**
   * Get the last event of a specific type
   * 
   * @param eventType - Event type
   * @returns Last event or null
   */
  public getLastEvent(eventType: string): InitiativeEvent | null {
    const events = this.getEventHistory(eventType, 1);
    return events.length > 0 ? events[0] : null;
  }

  /**
   * Clear event history
   * 
   * @param eventType - Event type to clear (optional, clears all if not provided)
   */
  public clearHistory(eventType?: string): void {
    if (eventType) {
      this.eventHistory = this.eventHistory.filter(event => event.type !== eventType);
    } else {
      this.eventHistory = [];
    }
  }

  /**
   * Pause event processing
   */
  public pause(): void {
    this.isPaused = true;
  }

  /**
   * Resume event processing
   */
  public resume(): void {
    this.isPaused = false;
    
    // Process any paused events
    const pausedEvents = this.pausedEvents.splice(0);
    pausedEvents.forEach(event => this.emit(event));
  }

  /**
   * Check if event processing is paused
   * 
   * @returns True if paused
   */
  public isEventProcessingPaused(): boolean {
    return this.isPaused;
  }

  /**
   * Get statistics about the event system
   * 
   * @returns Event system statistics
   */
  public getStatistics(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    activeListeners: number;
    pausedEvents: number;
    historySize: number;
  } {
    const eventsByType: Record<string, number> = {};
    
    this.eventHistory.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
    });

    const activeListeners = Array.from(this.eventListeners.values())
      .reduce((total, listeners) => total + listeners.size, 0);

    return {
      totalEvents: this.eventHistory.length,
      eventsByType,
      activeListeners,
      pausedEvents: this.pausedEvents.length,
      historySize: this.eventHistory.length
    };
  }

  /**
   * Dispose of the event system
   */
  public dispose(): void {
    this.eventListeners.clear();
    this.eventFilters.clear();
    this.eventHistory = [];
    this.pausedEvents = [];
    this.isPaused = false;
  }

  /**
   * Add event to history with size management
   * 
   * @param event - Event to add
   */
  private addToHistory(event: InitiativeEvent): void {
    this.eventHistory.push(event);
    
    // Maintain history size limit
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory = this.eventHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Generate a unique event ID
   * 
   * @returns Unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Global event system instance
 */
export const globalInitiativeEventSystem = new InitiativeEventSystem();

/**
 * Event system utilities
 */
export class InitiativeEventUtils {
  /**
   * Create a filter for events from a specific source
   * 
   * @param source - Source to filter by
   * @returns Event filter function
   */
  public static sourceFilter(source: string): EventFilter {
    return (event) => event.source === source;
  }

  /**
   * Create a filter for events within a time range
   * 
   * @param startTime - Start timestamp
   * @param endTime - End timestamp
   * @returns Event filter function
   */
  public static timeRangeFilter(startTime: number, endTime: number): EventFilter {
    return (event) => event.timestamp >= startTime && event.timestamp <= endTime;
  }

  /**
   * Create a filter for unit-specific events
   * 
   * @param unitId - Unit ID to filter by
   * @returns Event filter function
   */
  public static unitFilter(unitId: string): EventFilter<UnitActivationEvent> {
    return (event) => 'unitId' in event && event.unitId === unitId;
  }

  /**
   * Create a filter for initiative-specific events
   * 
   * @param initiative - Initiative value to filter by
   * @returns Event filter function
   */
  public static initiativeFilter(initiative: number): EventFilter {
    return (event) => {
      if ('initiative' in event) {
        return (event as any).initiative === initiative;
      }
      return false;
    };
  }

  /**
   * Create a composite filter that requires all filters to pass
   * 
   * @param filters - Array of filters to combine
   * @returns Composite filter function
   */
  public static andFilter<T extends InitiativeEvent>(filters: EventFilter<T>[]): EventFilter<T> {
    return (event) => filters.every(filter => filter(event));
  }

  /**
   * Create a composite filter that requires any filter to pass
   * 
   * @param filters - Array of filters to combine
   * @returns Composite filter function
   */
  public static orFilter<T extends InitiativeEvent>(filters: EventFilter<T>[]): EventFilter<T> {
    return (event) => filters.some(filter => filter(event));
  }
}
