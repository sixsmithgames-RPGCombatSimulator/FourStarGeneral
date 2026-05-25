# Initiative System Design

## Overview
Implement a unit-by-unit initiative system that replaces the current player-turn/bot-turn alternation with a more granular activation sequence based on unit initiative values.

## Scale Definition
Higher initiative values = earlier activation in the turn sequence.

- **7**: Recon units (fastest, act first)
- **6**: Engineers (specialist priority)
- **5**: Infantry, APCs, and AT guns (main line units)
- **4**: Light and medium tanks 
- **3**: Heavy tanks and tank destroyers (slow but powerful)
- **2**: Artillery, flak, and assault guns
- **1**: Supply, medical, maintenance units (logistics priority)
- **0**: Aircraft (handled by air show system, not in turn order)

## Turn Sequence Architecture

### 1. Initiative Queue Generation
At start of each turn:
1. Collect all active units for both player and bot
2. Filter out aircraft (initiative 0) - they use air show system
3. Sort units by initiative (descending), then by owner (player first in ties)
4. Create alternating activation queue

### 2. Activation Flow
```
Turn Start:
├── Generate initiative queue
├── Loop through queue:
│   ├── Player unit activation
│   │   ├── Highlight unit
│   │   ├── Wait for player actions (move/fire/support)
│   │   └── Mark unit as activated
│   ├── Bot unit activation
│   │   ├── Bot AI decides actions
│   │   ├── Execute actions
│   │   └── Mark unit as activated
│   └── Continue until queue exhausted or player ends turn
├── Player ends turn early:
│   ├── Skip remaining player units in queue
│   ├── Process all remaining bot units
│   └── End turn
└── Air Show Phase (after ground turn complete)
```

### 3. UI State Management
- **Current Unit Indicator**: Highlight which unit is currently active
- **Queue Display**: Show upcoming units and their initiative order
- **End Turn Control**: Allow player to end turn early, skipping remaining units
- **Skip Unit Option**: Allow player to skip specific unit activation

### 4. Integration Points

#### BattleScreen Changes
- Replace current turn management with initiative queue
- Add unit activation highlighting
- Update turn state tracking
- Modify end turn behavior

#### GameEngine Changes
- Add initiative queue generation
- Modify unit activation validation
- Update bot AI to work with per-unit activation
- Handle air show phase separation

#### State Management
- Track which units have been activated this turn
- Maintain current position in initiative queue
- Handle turn end conditions

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create initiative queue generator
2. Add basic activation state tracking
3. Implement alternating player/bot activation loop

### Phase 2: UI Integration
1. Add current unit highlighting
2. Create initiative queue display
3. Implement end turn early functionality

### Phase 3: Bot AI Integration
1. Modify bot AI to work with per-unit activation
2. Implement bot decision timing
3. Add bot unit animation delays

### Phase 4: Edge Cases & Polish
1. Handle unit destruction during turn
2. Handle reinforcements arriving mid-turn
3. Add skip unit functionality
4. Balance timing and pacing

## Technical Considerations

### Performance
- Initiative queue generation should be fast (O(n log n) sort)
- UI updates should be responsive during activation
- Bot AI decisions should not block UI

### State Consistency
- All unit actions must respect activation state
- Turn end must properly clean up activation state
- Save/load must preserve initiative queue position

### Backward Compatibility
- Existing save games need migration strategy
- Current air show system must remain unchanged
- Campaign system integration must be preserved

## Testing Strategy

### Unit Tests
- Initiative queue generation correctness
- Activation state transitions
- Turn end conditions

### Integration Tests
- Full turn sequence execution
- Player/bot alternating activation
- Air show phase separation

### Manual Testing
- UI responsiveness during activation
- Bot AI behavior with new system
- Edge cases (unit destruction, reinforcements)
