# Initiative System Implementation Plan

## Phase 1: Core Infrastructure

### 1.1 Create Initiative Queue Manager
**File**: `src/core/InitiativeQueue.ts`

```typescript
interface UnitActivation {
  unitId: string;
  ownerId: 'player' | 'bot';
  initiative: number;
  isActivated: boolean;
}

interface InitiativeQueue {
  activations: UnitActivation[];
  currentIndex: number;
  currentTurn: number;
}

class InitiativeQueueManager {
  generateQueue(units: Unit[], turn: number): InitiativeQueue
  getNextActivation(queue: InitiativeQueue): UnitActivation | null
  markActivated(queue: InitiativeQueue, unitId: string): void
  skipRemainingPlayerActivations(queue: InitiativeQueue): void
  getRemainingActivations(queue: InitiativeQueue, ownerId: 'player' | 'bot'): UnitActivation[]
}
```

### 1.2 Add Activation State to Unit State
**File**: `src/core/types.ts` (extend UnitState interface)

```typescript
interface UnitState {
  // ... existing properties
  isActivatedThisTurn: boolean;
  activationOrder?: number; // Optional: track order in current turn
}
```

### 1.3 Modify Turn State Management
**File**: `src/state/BattleState.ts`

```typescript
interface BattleState {
  // ... existing properties
  initiativeQueue: InitiativeQueue | null;
  currentActivation: UnitActivation | null;
  isInitiativeSystemActive: boolean;
  turnPhase: 'initiative' | 'airShow' | 'ended';
}
```

## Phase 2: GameEngine Integration

### 2.1 Replace Current Turn Management
**File**: `src/game/GameEngine.ts`

**Key Methods to Modify**:
- `startPlayerTurn()` → `startInitiativeTurn()`
- `endPlayerTurn()` → `endInitiativeTurn()`
- `startBotTurn()` → integrated into initiative system

**New Methods**:
```typescript
startInitiativeTurn(): void
processNextActivation(): void
activateUnit(unitId: string, actions: UnitAction[]): void
skipPlayerTurn(): void
completeInitiativeTurn(): void
```

### 2.2 Unit Action Validation
**File**: `src/game/GameEngine.ts`

**Modifications**:
- Add `isUnitActivated(unitId: string)` check
- Validate actions only for currently active unit
- Handle activation state transitions

### 2.3 Bot AI Integration
**File**: `src/game/BotAI.ts`

**Modifications**:
- Create `executeBotActivation(unitId: string)` method
- Add timing delays for bot decision making
- Integrate with initiative queue processing

## Phase 3: BattleScreen UI Integration

### 3.1 Current Unit Highlighting
**File**: `src/ui/screens/BattleScreen.ts`

**New Methods**:
```typescript
highlightCurrentUnit(unitId: string): void
clearCurrentUnitHighlight(): void
updateActivationIndicator(activation: UnitActivation | null): void
```

**UI Elements**:
- Add CSS class for currently active unit
- Update hex rendering to show activation state
- Add visual indicator for unit's turn

### 3.2 Initiative Queue Display
**File**: `src/ui/screens/BattleScreen.ts`

**New UI Component**:
```typescript
renderInitiativeQueue(queue: InitiativeQueue): void
updateQueueDisplay(): void
```

**Display Elements**:
- Show next 5- upcoming units
- Indicate player vs bot units
- Show initiative values
- Highlight current activation

### 3.3 Turn Controls Update
**File**: `src/ui/screens/BattleScreen.ts`

**Modifications**:
- Replace "End Turn" button with "Skip Remaining Units"
- Add "Skip This Unit" option for player
- Update turn status display
- Handle air show phase transition

## Phase 4: Event System Integration

### 4.1 New Event Types
**File**: `src/core/events.ts`

```typescript
interface InitiativeQueueGeneratedEvent extends GameEvent {
  type: 'initiativeQueueGenerated';
  queue: InitiativeQueue;
}

interface UnitActivationStartedEvent extends GameEvent {
  type: 'unitActivationStarted';
  unitId: string;
  ownerId: 'player' | 'bot';
}

interface UnitActivationCompletedEvent extends GameEvent {
  type: 'unitActivationCompleted';
  unitId: string;
  actionsTaken: UnitAction[];
}

interface InitiativeTurnCompletedEvent extends GameEvent {
  type: 'initiativeTurnCompleted';
  turnNumber: number;
}
```

### 4.2 Event Handlers
**File**: `src/ui/screens/BattleScreen.ts`

```typescript
private handleInitiativeQueueGenerated = (event: InitiativeQueueGeneratedEvent) => {
  this.updateQueueDisplay();
}

private handleUnitActivationStarted = (event: UnitActivationStartedEvent) => {
  this.highlightCurrentUnit(event.unitId);
  this.updateActivationIndicator(event);
}
```

## Phase 5: State Persistence

### 5.1 Save/Load Integration
**File**: `src/state/SaveState.ts`

**Modifications**:
- Include initiative queue in save state
- Preserve activation state for all units
- Handle mid-turn save/load scenarios

### 5.2 Turn Recovery
**File**: `src/game/GameEngine.ts`

**Methods**:
```typescript
restoreInitiativeState(saveState: SaveState): void
validateInitiativeQueue(queue: InitiativeQueue): boolean
```

## Implementation Order

### Sprint 1: Core Infrastructure (Week 1)
1. Create InitiativeQueue class
2. Add activation state to units
3. Implement basic queue generation
4. Add unit tests for queue logic

### Sprint 2: GameEngine Integration (Week 2)
1. Replace turn management in GameEngine
2. Add unit action validation
3. Implement basic activation processing
4. Add integration tests

### Sprint 3: UI Integration (Week 3)
1. Add current unit highlighting
2. Create initiative queue display
3. Update turn controls
4. Add manual testing scenarios

### Sprint 4: Bot AI & Events (Week 4)
1. Integrate bot AI with activation system
2. Add event system support
3. Implement timing and pacing
4. Add end-to-end tests

### Sprint 5: Polish & Edge Cases (Week 5)
1. Handle unit destruction during turn
2. Add skip unit functionality
3. Implement save/load support
4. Performance optimization
5. User experience refinements

## Risk Mitigation

### High Risk Items
- **Bot AI Performance**: Bot decisions could slow down turn pacing
  - *Mitigation*: Add timeout limits, async decision making
- **State Consistency**: Complex activation state could lead to bugs
  - *Mitigation*: Comprehensive unit tests, state validation
- **UI Responsiveness**: Frequent updates could impact performance
  - *Mitigation*: Debounce updates, optimize rendering

### Medium Risk Items
- **Save/Load Complexity**: Mid-turn saves add complexity
  - *Mitigation*: Incremental implementation, thorough testing
- **Backward Compatibility**: Existing saves need migration
  - *Mitigation*: Migration scripts, fallback system

### Low Risk Items
- **Balance Changes**: New system could affect game balance
  - *Mitigation*: Playtesting, balance tuning phase

## Success Criteria

### Functional Requirements
- [ ] Units activate in correct initiative order
- [ ] Player/bot alternation works correctly
- [ ] Aircraft remain in air show system
- [ ] Turn can be ended early
- [ ] Individual units can be skipped

### Performance Requirements
- [ ] Turn starts within 100ms
- [ ] Unit activation updates within 50ms
- [ ] Bot decisions complete within 2 seconds

### Quality Requirements
- [ ] All existing tests pass
- [ ] New unit test coverage > 90%
- [ ] No memory leaks during turn processing
- [ ] Save/load works correctly in all scenarios

## Testing Strategy

### Unit Tests
- InitiativeQueue class methods
- Activation state transitions
- Queue generation algorithms

### Integration Tests
- GameEngine turn management
- BattleScreen UI updates
- Event system integration

### End-to-End Tests
- Complete turn sequence
- Save/load scenarios
- Bot AI behavior

### Manual Testing
- User experience validation
- Performance under load
- Edge case scenarios
