# MASTER TODO: Comprehensive Implementation Plan

<!-- STATUS: 📋 PLANNING - This document analyzes all 16 TODO files and creates a unified implementation roadmap. It identifies dependencies, resolves conflicts, and provides a clear path forward for the Four Star General project. -->

## Executive Summary

This master plan analyzes **16 TODO files** and the current implementation state to create a comprehensive roadmap. The project has a solid modular foundation with **23 focused modules** but requires completion of critical gameplay features.

**Current Status:**
- ✅ **Modularization Complete**: 883-line main.ts → 23 focused modules
- ✅ **Core Infrastructure**: TypeScript compilation, state management, hex map rendering
- ✅ **Landing Screen**: Mission selection, general commissioning, roster management (100% functional)
- ✅ **Battle Screen Basics**: Hex map, unit rendering, deployment workflow
- ⚠️ **Precombat Screen**: Data module exists, UI logic partially implemented
- ❌ **Backend Service**: Do Not implement (localStorage only)
- ❌ **Sidebar Panels**: Most battle UI panels not implemented
- ❌ **Advanced Features**: Recon/intel, support systems, logistics tracking

## Analysis of TODO Files

### 1. Backend Service (TODO_backend_service.md)
**Status**: 🔲 **Not Started**
**Priority**: Medium
**Scope**: Complete rewrite from localStorage to MongoDB backend

**Key Requirements:**
- Express.js server with MongoDB
- REST API for roster management
- Environment configuration and deployment
- Client integration (replace localStorage calls)

**Dependencies:**
- LandingScreen roster functionality (currently working with localStorage)
- Future multiplayer features

**Estimated Effort**: 2-3 weeks
**Risk**: Medium (data migration, API design)

### 2. Precombat Screen Components
**Status**: 🟡 **Partially Implemented**
**Priority**: High

#### Data Module (TODO_precombat_data_module.md)
**Status**: ✅ **Complete**
- `src/data/unitAllocation.ts` implemented with 20 unit types
- Proper categorization (units, supplies, support, logistics)
- Type-safe lookups and validation

#### UI Rendering (TODO_precombat_ui_rendering.md)
**Status**: 🟡 **Partially Complete**
- `PrecombatScreen.ts` has allocation UI logic
- Budget calculations and validation implemented
- **Missing**: DOM element verification, CSS styling completion

#### Interaction Logic (TODO_precombat_interaction.md)
**Status**: ✅ **Complete**
- Event delegation for +/- controls
- Keyboard accessibility (arrow keys)
- State management with dirty flags

#### Budget Validation (TODO_precombat_budget_validation.md)
**Status**: ✅ **Complete**
- Budget calculations and display
- Warning modal for over-budget
- Button state management

#### Deployment Bridge (TODO_precombat_deployment_bridge.md)
**Status**: ✅ **Complete**
- Integration with DeploymentState
- BattleState summary persistence
- Navigation flow working

#### UI Styling (TODO_precombat_ui_styling.md)
**Status**: 🟡 **Mostly Complete**
- CSS exists for allocation items
- **Missing**: Responsive testing, focus states verification

### 3. Battle Screen Components
**Status**: 🟡 **Core Complete, Panels Missing**
**Priority**: High

#### Battle Screen Sync (TODO_battle_screen_sync.md)
**Status**: ✅ **Complete**
- Deployment orchestration working
- State mirroring implemented
- Engine integration functional

#### Deployment Panel Wiring (TODO_deployment_panel_wiring.md)
**Status**: ✅ **Complete**
- `DeploymentPanel.ts` wired to `DeploymentState` with live pool/zone data and sprites
- Unit roster renders with remaining counts and queue-to-deploy interactions

#### Deployment State Bridge (TODO_deployment_state_engine_bridge.md)
**Status**: ✅ **Complete**
- `DeploymentState` fully implemented
- Engine synchronization working
- Zone capacity tracking

#### Enemy Unit Separation (TODO_enemy_unit_separation.md)
**Status**: ✅ **Complete**
- Player/bot unit segregation implemented
- Proper state management and UI filtering

#### Hex Selection Feedback (TODO_hex_selection_feedback.md)
**Status**: ✅ **Complete**
- Cross-component selection propagation wired (map ↔ panel), keyboard navigation added

#### Reserve/Loadout Sync (TODO_reserve_loadout_sync.md)
**Status**: ✅ **Complete**
- Loadout and reserves reflect mirrored counts and animate on change

### 4. Sidebar Panel Implementation
**Status**: 🔴 **Not Implemented**
**Priority**: High

Based on the PLAN_*.md files, 6 sidebar panels are planned:

#### General Panel (PLAN_battle_general.md)
**Status**: 🔴 **Not Started**
- No UI implementation
- Data integration needed with BattleState
- Commander profile rendering required

#### Support Panel (PLAN_battle_Support.md)
**Status**: 🟡 **Engine APIs Complete, UI Missing**
- `GameEngine.getSupportSnapshot()` implemented
- Support actions (queue/cancel) working
- **Missing**: PopupManager integration, UI rendering

#### Logistics Panel (PLAN_battle_Logistics.md)
**Status**: 🟡 **Engine APIs Complete, UI Missing**
- `GameEngine.getLogisticsSnapshot()` implemented
- Supply history and alerts working
- **Missing**: PopupManager integration, UI rendering

#### Recon & Intel Panel (PLAN_battle_Recon_Intel.md)
**Status**: 🔴 **Not Started**
- Basic snapshot structure exists
- **Missing**: Live data feeds, UI implementation

#### Army Roster Panel (PLAN_battle_Army.md)
**Status**: 🔴 **Not Started**
- Basic UI structure exists
- **Missing**: Live data integration

#### Supplies Panel (PLAN_battle_Supplies.md)
**Status**: 🔴 **Not Started**
- Supply data available in engine
- **Missing**: UI implementation

### 5. Advanced Features
**Status**: 🔴 **Not Started**

#### Recon/Intel Live Feeds (TODO_recon_intel_live_feeds.md)
**Status**: 🔴 **Not Started**
- Event dispatch system needed
- UI refresh logic required
- Localization framework missing

#### Deployment Markup Refresh (TODO_deployment_markup_refresh.md)
**Status**: ✅ **Complete**
- `index.html` contains refreshed hooks: `#deploymentPanel`, `#deploymentStatus`, `#baseCampStatus`, `#deploymentZoneSummary`, `#deploymentZoneList`, `#deploymentUnitList`, `#battleLoadoutList`, and `#reserveList`

## Implementation Roadmap

### Phase 1: Core Functionality Completion (Week 1-2)
**Goal**: Make all basic gameplay features functional

#### Priority 1A: Precombat Screen Polish
1. **Complete UI Rendering** (TODO_precombat_ui_rendering.md)
   - Verify all DOM elements exist in index.html
   - Test CSS responsive behavior
   - Add missing focus states

2. **Styling Verification** (TODO_precombat_ui_styling.md)
   - Test responsive breakpoints
   - Verify accessibility compliance
   - Polish visual design

3. **Deployment Panel Integration** (TODO_deployment_panel_wiring.md)
   - Wire DeploymentPanel with live DeploymentState data
   - Implement unit card rendering
   - Add zone capacity displays

#### Priority 1B: Battle Screen Polish
4. **Hex Selection Feedback** (TODO_hex_selection_feedback.md)
   - Implement cross-component selection propagation
   - Add keyboard navigation
   - Polish visual feedback

5. **Reserve/Loadout Sync** (TODO_reserve_loadout_sync.md)
   - Complete data binding with DeploymentState
   - Add responsive UI updates
   - Implement status animations

### Phase 2: Sidebar Panel Implementation (Week 2-3)
**Goal**: Implement all 6 planned sidebar panels

#### Priority 2A: Support & Logistics Panels
6. **Support Panel UI** (PLAN_battle_Support.md)
   - Add popupContentRegistry entry
   - Implement PopupManager rendering
   - Wire support action controls

7. **Logistics Panel UI** (PLAN_battle_Logistics.md)
   - Add popupContentRegistry entry
   - Implement supply history visualization
   - Add alert system integration

#### Priority 2B: General & Army Panels
8. **General Panel UI** (PLAN_battle_general.md)
   - Implement commander profile display
   - Add trait and directive rendering
   - Integrate with BattleState

9. **Army Roster Panel** (PLAN_battle_Army.md)
   - Wire with DeploymentState
   - Add unit status tracking
   - Implement roster management

#### Priority 2C: Recon & Supplies Panels
10. **Recon & Intel Panel** (PLAN_battle_Recon_Intel.md)
    - Basic snapshot integration
    - Filter and alert rendering
    - Live feed setup (deferred if complex)

11. **Supplies Panel** (PLAN_battle_Supplies.md)
    - Supply level visualization
    - Consumption tracking
    - Resupply mechanics

### Phase 3: Advanced Features (Week 3-4)
**Goal**: Enhanced gameplay systems

#### Priority 3A: Recon/Intel System
12. **Live Recon Feeds** (TODO_recon_intel_live_feeds.md)
    - Event dispatch system
    - Real-time UI updates
    - Data source integration

13. **Enemy Unit Visualization**
    - Basic enemy unit rendering
    - Intelligence overlays
    - Recon discovery mechanics

#### Priority 3B: Backend Integration
14. **Backend Service** (TODO_backend_service.md)
    - Express.js server setup
    - MongoDB integration
    - Client API migration

15. **Data Migration**
    - Roster data migration
    - Save/load functionality
    - Multiplayer preparation

### Phase 4: Polish & Testing (Week 4-5)
**Goal**: Production readiness

16. **Comprehensive Testing**
    - Unit test coverage for all modules
    - Integration testing
    - UI/UX testing

17. **Performance Optimization**
    - Rendering performance
    - State update efficiency
    - Memory leak prevention

18. **Accessibility & Polish**
    - ARIA compliance verification
    - Keyboard navigation completion
    - Visual design consistency

## Technical Debt & Cleanup

### Immediate Fixes Required
1. **Support Snapshot Caching Bug** — ✅ Resolved
   - `GameEngine.ts` includes `private invalidateSupportSnapshot(): void` which clears `cachedSupportSnapshot` and is called on queue/cancel.

2. **Type Safety Issues**
   - Resolve remaining TypeScript compilation warnings
   - Complete interface implementations

3. **Code Duplication**
   - Consolidate similar logic across TODO implementations
   - Remove redundant state management

### Long-term Improvements
4. **Testing Infrastructure**
   - Add comprehensive unit tests
   - Integration test framework
   - E2E testing setup

5. **Documentation Updates**
   - Update README files
   - API documentation
   - Architecture diagrams

### Architecture Alignment Follow-ups (2025-10-26 Audit)
1. **GameRulesArchitecture Compliance Plan**
   - Draft adoption roadmap for the command DSL (`SET_CONST`, `PATCH_FORMULA`, `WRITE_TEST`) and the Given/When/Then harness.
   - Enumerate tooling updates (lint/script hooks) needed to enforce the documented “safe checklist.”
   - Deliverables: design note + phased implementation tasks.

2. **GameEngine API Surface Review**
   - Catalogue public methods currently exposed by `src/game/GameEngine.ts`.
   - Propose facade boundaries (e.g., limit direct UI access in favor of `BattleState`).
   - Identify functions that should be private/internal to realign with small-testable-change mandate.

3. **Reserve Call-up Gap**
   - Implement `GameEngine.callUpReserveByKey()` (or equivalent) to match `BattleScreen` expectations.
   - Add unit/integration tests covering reserve deployment via allocation key.
   - Update `BattleScreen` happy-path flow once the API exists.

4. **Scenario Cloning Consolidation**
   - Compare `cloneScenario()`, `cloneUnitTypes()`, and other helpers across `BattleScreen`/`PrecombatScreen`.
   - Introduce shared utility (or document why duplication remains) to avoid drift.
   - Ensure all callers retain human-readable commentary per code-style guidelines.

5. **Scenario Normalization Duplication**
   - Audit normalization logic in `PrecombatScreen.buildScenarioData()` vs. battle-screen equivalents.
   - Extract common normalization pipeline into a shared module under `src/game/` or `src/data/`.
   - Cover the shared helper with regression tests.

6. **DeploymentState Metrics Cleanup**
   - Verify consumers for `DeploymentState.getDeployedCount()` and new logging hooks.
   - Remove unused helpers or wire them into deployment/battle panels with tests.
   - Document final state inside `DeploymentState` comments.

7. **Popup Infrastructure Alignment**
   - Extract panel-specific renderers from `src/ui/components/PopupManager.ts` into focused helpers to meet small-change guidance.
   - Add unit tests around popup open/close flows and recon/supplies refresh triggers.
   - Ensure PopupManager constructor teardown (`beforeunload`) removes all listeners per architecture resiliency rules.

8. **Popup Content Registry Coverage**
   - Move fallback HTML in `PopupManager.getPopupContent()` into `popupContentRegistry.ts` entries.
   - Ensure every sidebar panel registers structured content per CODEX guardrails.
   - Add validation test verifying registry coverage for `PopupKey` union.

9. **Roster Snapshot Duplication**
   - Consolidate `GameEngine.buildRosterSnapshot()` and `PopupManager.buildRosterSnapshot()` into a shared source of truth.
   - Prefer engine-generated data and document the public contract in `IPopupManager`.
   - Add regression tests covering roster totals after deployment/battle transitions.

## Dependencies & Risks

### Critical Path Dependencies
```
Precombat Data Module ✅
├── Precombat UI Rendering (Partially Complete)
├── Precombat Interaction Logic ✅
├── Precombat Budget Validation ✅
└── Precombat Deployment Bridge ✅

Battle Screen Foundation ✅
├── Deployment State Bridge ✅
├── Battle Screen Sync ✅
├── Enemy Unit Separation ✅
├── Hex Selection Feedback (Partially Complete)
└── Reserve/Loadout Sync (Partially Complete)

Sidebar Panels (Not Started)
└── All depend on PopupManager integration
```

### Risk Assessment
- **High Risk**: Backend service integration (data migration complexity)
- **Medium Risk**: Recon/intel live feeds (event system complexity)
- **Low Risk**: Sidebar panel UI (straightforward integration)

### Resource Allocation
- **Developer 1**: Precombat completion, battle screen polish
- **Developer 2**: Sidebar panel implementation, UI components
- **Developer 3**: Advanced features, backend integration

## Success Metrics

### Phase 1 Completion
- [ ] All precombat functionality working end-to-end
- [ ] Battle screen deployment flow complete
- [ ] Basic hex selection and feedback working
- [ ] Reserve/loadout UI responsive to engine state

### Phase 2 Completion
- [ ] All 6 sidebar panels implemented and functional
- [ ] Support actions (artillery, air, engineering) working
- [ ] Logistics tracking and alerts operational
- [ ] General profile and army roster displays working

### Phase 3 Completion
- [ ] Recon/intel system providing live battlefield data
- [ ] Enemy unit visualization and intelligence mechanics
- [ ] Backend service supporting roster persistence
- [x] Save/load functionality working (Campaign layer via localStorage)

### Final Quality Gates
- [ ] 100% TypeScript compilation (no errors or warnings)
- [ ] All TODO files marked complete with implementation notes
- [ ] Comprehensive test coverage (unit, integration, E2E)
- [ ] Performance benchmarks met
- [ ] Accessibility compliance verified

## Implementation Guidelines

### Code Quality Standards
- **Comments**: All new code must include human-readable comments explaining purpose and reasoning
- **Type Safety**: Maintain strict TypeScript compilation with no warnings
- **Testing**: Add unit tests for all new functionality
- **Documentation**: Update relevant documentation files

### Architecture Principles
- **Modularity**: Maintain separation of concerns
- **State Management**: Use centralized state with proper synchronization
- **UI/UX**: Follow established design patterns and accessibility guidelines
- **Performance**: Ensure responsive interactions and efficient rendering

## Emergency Fixes (Complete Immediately)

1. **Fix Support Snapshot Bug**
   ```typescript
   // Add missing method to GameEngine
   private invalidateSupportSnapshot(): void {
     this.cachedSupportSnapshot = null;
   }
   ```

2. **Verify TypeScript Compilation**
   - Run `npx tsc --noEmit` and fix any remaining errors
   - Complete GameEngineAPI interface implementation

3. **Test Core Flows**
   - Verify landing → precombat → battle navigation
   - Test basic deployment and unit placement
   - Confirm hex selection and base camp assignment

## Next Steps

1. **Phase 1 follow-ups** (Deployment polish complete)
   - Complete precombat UI rendering verification
   - Accessibility pass and responsive testing for deployment panel
   - Add battle race monitoring checklist (`TODO_battle_race_monitoring.md`)
   - Track enemy turn animation improvements (`TODO_enemy_turn_animation.md`)
   - Plan player action animation upgrades (`TODO_player_turn_animation.md`)

2. **Begin Phase 2** (Start Next Week)
   - Implement sidebar panel UI components
   - Wire support and logistics panels first
   - Add general and army roster panels

3. **Plan Phase 3** (Background Task)
   - Design backend service architecture
   - Plan recon/intel event system
   - Prepare data migration strategy

---

**Document Status**: 📋 **ACTIVE PLANNING**
**Last Updated**: Analysis Complete
**Next Review**: After Phase 1 completion

This master plan provides a clear path forward for completing the Four Star General project while maintaining code quality and architectural integrity.
