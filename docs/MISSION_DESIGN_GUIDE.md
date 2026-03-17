# Mission Design Guide

## Overview
This document provides a comprehensive guide for designing balanced, engaging tactical missions in Four Star General. Follow these principles to create missions that are challenging, fair, and showcase tactical gameplay.

## Mission Design Principles

### 1. Budget and Resource Constraints
**Purpose**: Force meaningful choices and prevent overwhelming force advantage.

**Guidelines**:
- **Training missions**: 400,000 - 600,000 (allows 6-8 basic units)
- **Patrol missions**: 600,000 - 900,000 (defensive posture, limited armor)
- **Assault missions**: 1,200,000 - 1,800,000 (full combined arms)
- **Campaign missions**: 2,500,000+ (grand operations)

**River Crossing Watch** (Patrol category):
- Budget: **700,000**
- Rationale: Defensive mission requiring smart positioning over brute force

### 2. Unit Type Restrictions
**Purpose**: Create asymmetric scenarios that reward tactical thinking.

**Implementation**:
```typescript
restrictedUnits?: string[];  // Units NOT available for purchase
allowedUnits?: string[];     // ONLY these units available (overrides default)
```

**River Crossing Watch Restrictions**:
```typescript
allowedUnits: [
  "infantry",           // Backbone defenders
  "engineer",           // Ford/bridge specialists
  "recon",             // Scouts for early warning
  "atInfantry",        // Anti-vehicle defense
  "machineGunTeam",    // Defensive fire support
  "lightMortar"        // Indirect fire for close support
]
```

**Rationale**:
- No tanks (player must use terrain/positioning, not armor)
- No heavy artillery (keeps engagement close-range)
- No air support (night patrol scenario)
- Infantry-focused defense emphasizes combined arms basics

### 3. Enemy Force Balance
**Purpose**: Create challenge without being unfair.

**Force Ratio Guidelines**:
- **Easy**: Player 1.2:1 advantage
- **Normal**: Player 1:1 (equal forces)
- **Hard**: Enemy 1.2:1 advantage

**Quality vs Quantity**:
- Give player slight quality edge (experience, positioning)
- Give enemy slight numbers advantage
- Use terrain to balance (player gets better defensive positions)

**River Crossing Watch Balance** (Normal difficulty):
- **Player forces**: 700,000 budget (~10-12 units) + 4 predeployed units
- **Enemy forces**:
  - Initial: 6-7 probing units
  - Reinforcement wave (turn 4): +4-5 units
  - Total enemy: ~10-12 units
  - Enemy resources: 400,000 (for reinforcements/replacements)

### 4. Map Design

#### River Terrain Rules
**Deep River** (`RIVER_DEEP`):
- Impassable (moveCost: 999)
- No ford feature
- Use for flanks and boundaries

**Shallow River** (`RIVER_SHALLOW`):
- Has "ford" feature
- Infantry: 2 MP, Tracked: 3 MP, Wheeled: 4 MP
- Strategic crossing points

**Rubble Bridge** (`RUBBLE_BRIDGE`):
- Road terrain with "bridge" + "rubble" features
- Easier crossing but vulnerable/contested

#### Map Extents
- Rivers should reach map edges (prevents flanking exploits)
- Minimum 3 crossing points for tactical variety
- Crossings should be 2-4 hexes apart (forces dispersion)

**River Crossing Watch Map Layout**:
```
West bank (Allied):   Deployment zones
River:                 3 ford crossings + 1 rubble bridge
East bank (Enemy):     Approach zones
```

### 5. Objective Design

**Types**:
- **Control**: Hold/deny key terrain for X turns
- **Destroy**: Eliminate specific enemy units
- **Survive**: Keep units alive until extraction

**River Crossing Watch Objectives**:
```typescript
Primary: "Deny enemy control of any ford for 4 consecutive turns"
  - Failure condition: Enemy holds ANY ford for 4 straight turns
  - Success condition: Reach turn 12 with no ford held 4 turns

Secondary: "Destroy enemy comms team before central ford"
  - High-value target (represents calling reinforcements)

Tertiary: "Keep at least one recon unit alive"
  - Encourages careful play
```

### 6. Victory Conditions

**Time Pressure**:
- Turn limits force aggressive play
- Shorter limits favor attacker
- Longer limits favor defender

**River Crossing Watch**:
- 12 turns (Normal difficulty)
- 11 turns (Hard) - increased pressure
- 14 turns (Easy) - more room for mistakes

**Escalation Mechanics**:
- Turn 4: If all fords blocked, trigger enemy "reserve pressure" announcement
- Turn 8: Mid-mission checkpoint
- Turn 12: Extraction window

### 7. Predeployed Units

**Purpose**: Set initial tactical situation.

**Guidelines**:
- Use sparingly (max 20-30% of player force)
- Position to suggest tactics (e.g., observation posts, roadblocks)
- Balanced composition

**River Crossing Watch Predeployment**:
```typescript
[
  { type: "Infantry_42", hex: [1,2] },      // Central ford watch
  { type: "Infantry_42", hex: [2,2] },      // Northern approach
  { type: "Engineer", hex: [1,3] },         // Bridge specialist
  { type: "Recon_Bike", hex: [2,3] }        // Mobile scout
]
```

### 8. Visual Clarity

**Terrain Indicators**:
All special terrain features MUST have visual SVG overlays:

- **Ford markers**: Blue ripple pattern overlay
- **Rubble bridges**: Damaged bridge icon + debris
- **Shallow crossings**: Lighter blue tint

**Implementation**: Add to `HexMapRenderer.generateHexMarkup()`:
```typescript
if (tile.features.includes("ford")) {
  // Add ford indicator SVG
}
```

## Mission Development Checklist

### Phase 1: Concept
- [ ] Define mission type and category
- [ ] Write mission briefing and objectives
- [ ] Determine win/loss conditions
- [ ] Set difficulty parameters

### Phase 2: Map Design
- [ ] Create tile palette with terrain types
- [ ] Design map layout (asymmetry, choke points)
- [ ] Place objectives
- [ ] Define deployment zones
- [ ] Extend rivers/impassable terrain to map edges

### Phase 3: Force Balance
- [ ] Set player budget
- [ ] Define unit restrictions (allowedUnits/restrictedUnits)
- [ ] Design enemy force composition
- [ ] Set enemy resources
- [ ] Configure predeployed units

### Phase 4: Tuning
- [ ] Playtest on all difficulties
- [ ] Verify force balance (should require tactics to win)
- [ ] Check turn limit (too tight/too loose?)
- [ ] Validate objectives are achievable
- [ ] Confirm visual clarity (can player see important features?)

### Phase 5: Documentation
- [ ] Document design rationale
- [ ] Note any special mechanics
- [ ] Record playtesting feedback
- [ ] Add to scenario registry with proper metadata

## Common Pitfalls

### ❌ Too Much Player Budget
**Problem**: Player can overwhelm with numbers
**Fix**: Reduce budget by 30-40% from initial estimate

### ❌ Symmetric Forces
**Problem**: Becomes coin flip or steamroll
**Fix**: Create asymmetry (player: quality, enemy: quantity)

### ❌ Unclear Victory Conditions
**Problem**: Player doesn't know what to do
**Fix**: Primary objective should be instantly clear from briefing

### ❌ Missing Visual Indicators
**Problem**: Player can't identify special terrain
**Fix**: Add SVG overlays for ALL special features

### ❌ Exploitable Flanks
**Problem**: Player bypasses entire challenge
**Fix**: Extend impassable terrain to map edges

### ❌ Too Forgiving
**Problem**: Player can win with poor tactics
**Fix**: Increase enemy forces or reduce turn limit

### ❌ Too Punishing
**Problem**: Perfect play still loses
**Fix**: Add secondary objectives or increase turn limit

## Testing Protocol

### Difficulty Testing
For each difficulty level:
1. **Easy**: Should win with basic tactics, some mistakes OK
2. **Normal**: Requires good tactics, small margin for error
3. **Hard**: Demands near-optimal play and positioning

### Force Balance Test
- Can player win with 50% casualties? ✅ Good
- Does player lose despite good tactics? ❌ Too hard
- Can player win by rushing mindlessly? ❌ Too easy

### Objective Clarity Test
- Ask fresh player: "What do you need to do?"
- Should answer correctly without reading full briefing
- If confused: Revise briefing or objective text

## Example: River Crossing Watch

### Design Intent
**Theme**: Night defensive patrol preventing river crossing
**Challenge**: Limited forces, must cover multiple fords
**Key Decision**: Where to concentrate forces vs spread thin

### Constraints Applied
- Budget: 700,000 (forces tough choices)
- Infantry/AT/Recon only (no armor crutch)
- Enemy 1:1 ratio with reinforcements
- Time limit: 12 turns (pressure to act)

### Expected Tactics
- Scout enemy approach directions early
- Position at central ford (can reinforce either flank)
- Use engineers to strengthen crossing defenses
- Fall back if overwhelmed, deny 4-turn hold
- Use off-map mortars on ford that "starts to buckle"

### Victory Scenario
- Player identifies main enemy thrust (turns 1-3)
- Shifts forces to block (turns 4-6)
- Fights delaying action at other fords (turns 7-9)
- Holds critical ford until turn 12

### Defeat Scenario
- Spreads forces too thin across all three fords
- Enemy concentrates on one, achieves 4-turn hold
- Player unable to recover position

## Conclusion

Great mission design creates interesting choices under pressure. Follow these guidelines, playtest thoroughly, and iterate based on feedback. Document your rationale so future missions build on these lessons.

**Remember**: If player can win by throwing money/units at the problem, the mission budget is too high.
