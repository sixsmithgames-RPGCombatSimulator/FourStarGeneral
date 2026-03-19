# Engineer Unit Abilities - Design Document

## Overview
Engineers are specialist units with unique construction and demolition capabilities. This document outlines planned abilities for Engineer and Combat_Engineer units.

## Current Status
- Engineers have the `"engineer"` trait added to their unit definitions
- No active abilities implemented yet - this is a placeholder for future development

## Planned Abilities

### 1. **Build Field Fortifications**
**Description**: Engineers can spend a turn to build field fortifications, increasing entrenchment for units in target hex.

**Mechanics**:
- Target: Current hex or adjacent hex
- Cost: Full turn (cannot move or attack)
- Effect: +2 entrenchment to all units in target hex
- Duration: Permanent until units move

**UI**: Add "Build Fortifications" button when engineer is selected

### 2. **Construct Temporary Bridge**
**Description**: Engineers can make impassable water terrain temporarily crossable.

**Mechanics**:
- Target: Adjacent impassable water hex (river, deep water)
- Cost: Full turn + 1 ammo (represents demolitions/materials)
- Effect: Hex becomes passable with moveCost similar to shallow crossing
- Duration: Remains until engineer moves away or is destroyed

**UI**: Add "Build Bridge" button when adjacent to impassable water

**Implementation Notes**:
- Store temporary terrain modifications in GameEngine state
- Render bridge overlay in HexMapRenderer
- Clear bridge when engineer departs

### 3. **Clear Obstacles**
**Description**: Engineers can remove terrain features that impede movement.

**Mechanics**:
- Target: Adjacent hex with "rubble", "minefield", or similar feature
- Cost: Full turn + 1 ammo
- Effect: Remove blocking feature, reduce terrain movement cost
- Duration: Permanent

### 4. **Demolish Structures**
**Description**: Engineers can demolish buildings and bridges to deny them to the enemy.

**Mechanics**:
- Target: Adjacent hex with "bridge" or "buildings" feature
- Cost: Full turn + 2 ammo
- Effect: Add "rubble" feature, increase defense but block movement
- Duration: Permanent

### 5. **Rapid Entrenchment** (Passive)
**Description**: Engineers entrench faster than regular infantry.

**Mechanics**:
- Effect: +1 entrenchment per turn when stationary (vs +0.5 for infantry)
- Always active when not moving

### 6. **Assist Adjacent Units** (Passive)
**Description**: Adjacent friendly units benefit from engineer presence.

**Mechanics**:
- Effect: Adjacent units get +0.5 entrenchment bonus per turn
- Radius: All hexes adjacent to engineer
- Stacks with unit's own entrenchment

## Implementation Priority

### Phase 1: Core Mechanics (High Priority)
1. Implement entrenchment system if not already functional
2. Add "Build Fortifications" ability
3. Add UI command buttons for engineer-selected units

### Phase 2: Terrain Modification (Medium Priority)
1. Add temporary terrain override system to GameEngine
2. Implement "Construct Temporary Bridge"
3. Add bridge overlay rendering

### Phase 3: Advanced Abilities (Low Priority)
1. Implement "Clear Obstacles"
2. Implement "Demolish Structures"
3. Add more complex terrain interaction system

### Phase 4: Passive Bonuses (Future)
1. Implement turn-based entrenchment accumulation
2. Add "Rapid Entrenchment" passive
3. Add "Assist Adjacent Units" aura effect

## Technical Requirements

### GameEngine Changes
- Add `activeAbilities` map to track unit abilities
- Add `temporaryTerrainMods` map for engineer-created changes
- Add `useEngineerAbility(hex, abilityType, targetHex)` method
- Update `resolveMoveCost()` to check terrain modifications

### UI Changes
- Add ability buttons to unit detail panel
- Add targeting overlay for engineer abilities
- Add confirmation dialog for ability use
- Add visual feedback (animations, overlays)

### Renderer Changes
- Add bridge overlay sprites
- Add fortification overlay sprites
- Update terrain rendering to show modifications

## Balance Considerations

### Engineer Limitations
- Engineers cost more than regular infantry (160-190 vs 100)
- Limited ammo (5-6 shots) restricts ability usage
- Abilities consume full turn, making them vulnerable
- Must be adjacent to target hex (range 1)

### Gameplay Impact
- Bridges allow flanking maneuvers and new attack routes
- Fortifications favor defensive play
- Demolitions can create chokepoints
- Engineers become high-value targets

### Counterplay
- Enemy can destroy engineers before they finish construction
- Bridges/fortifications require time investment
- Limited ammo means engineers can't spam abilities
- Engineers are vulnerable when building (cannot attack)

## Future Enhancements
- Mine-laying ability
- Repair damaged vehicles
- Construct field depots for supply
- Bridge demolition (destroy enemy bridges)
- Smoke screen deployment

## Related Files
- `src/data/unitTypes.json` - Engineer unit definitions
- `src/game/GameEngine.ts` - Core game logic
- `src/ui/screens/BattleScreen.ts` - Battle UI
- `src/rendering/HexMapRenderer.ts` - Map rendering

## Notes
Engineers add strategic depth by allowing terrain modification. This creates emergent gameplay where players must decide between using engineers offensively (building bridges for attacks) or defensively (fortifying positions).

Implementing these abilities requires careful attention to:
- Turn order and ability timing
- Visual clarity of temporary modifications
- Balance between ability cost and benefit
- AI behavior when facing engineer units
