# Ally Faction Implementation Plan

## Intent
Introduce a third "Ally" faction to support scenario-defined friendly NPC units that can be AI-controlled or transferred to player control. Enables scenarios with special units (unique armaments, abilities, payloads) critical to objectives.

## Requirements
1. Ally units defined in scenario JSON with `preDeployed` flag
2. Ally units persist through deployment phase (not cleared by beginDeployment)
3. AI-controlled ally turn phase with configurable strategy
4. Player can transfer control of ally units to Player faction
5. Distinct visual rendering (green markers, different styling)
6. Ally units excluded from deployment pool/reserves (always predeployed)

## Scope

### Phase 1: Type System & Data Model
- Extend `TurnFaction` type: `"Player" | "Bot" | "Ally"`
- Add `Ally` side to `ScenarioData` and `ScenarioSide`
- Add `controlledBy?: "AI" | "Player"` flag to `ScenarioUnit`
- Update scenario JSON schema to support Ally side

### Phase 2: Engine Support
- Add `allyPlacements` map to `GameEngine`
- Add `allySide` to `GameEngineConfig`
- Preserve ally placements in `beginDeployment()` (skip clearing)
- Add ally turn phase after bot turn
- Implement ally AI planner (reuse bot planner with ally strategy)
- Add `transferAllyControl(hex: Axial)` API method

### Phase 3: Rendering & UI
- Update `renderEngineUnits` to handle Ally faction
- Add green "A" debug markers for ally units
- Distinguish ally units with CSS class `faction-ally`
- Add control transfer UI (context menu or button)
- Update activity log to show ally actions

### Phase 4: Scenario Integration
- Update `scenario01.json` to move predeployed recon to Ally side
- Test ally unit persistence through deployment
- Verify control transfer mechanics

## Impact Analysis

### High-Risk Files
- `src/core/types.ts` - Core type definitions
- `src/game/GameEngine.ts` - Engine state and turn logic
- `src/ui/screens/BattleScreen.ts` - Rendering and UI
- `src/data/scenario01.json` - Scenario data structure

### Breaking Changes
- `TurnFaction` type expansion may affect existing type guards
- `ScenarioData.sides` structure change (add Ally)
- Engine constructor signature change (add allySide)

### Mitigation
- Use discriminated unions for faction-specific logic
- Provide default empty Ally side for backward compatibility
- Gradual rollout: types → engine → rendering → scenario

## Verification

### Unit Tests
- Ally unit placement persistence through deployment
- Control transfer state transitions
- Ally turn phase execution order

### Integration Tests
- Load scenario with Ally units
- Deploy player units without clearing ally placements
- Transfer ally unit control mid-battle
- Verify ally AI executes moves/attacks

### Manual Checks
- Visual: Green ally markers appear at scenario positions
- Visual: Ally units persist after "Begin Battle"
- Interaction: Control transfer button/menu appears
- Interaction: Transferred ally units respond to player commands
- Activity log: Ally actions appear with distinct styling

## Known Limitations
- Phase 1: Ally units cannot be added to reserves (always predeployed)
- Phase 1: Control transfer is one-way (Ally → Player only)
- Phase 1: No ally-specific abilities/armaments (future enhancement)

## Rollout Plan
1. Implement types and data model (non-breaking)
2. Update engine with ally support (guarded by ally presence check)
3. Add rendering for ally faction
4. Update scenario01.json to use Ally side
5. Test and verify all checks pass
