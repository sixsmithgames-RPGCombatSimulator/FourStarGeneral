# Requisition Screen Layout Bug - Postmortem & Follow-up

## Issue Summary
**Date Identified**: May 6, 2026  
**Severity**: High - Requisition screen became hard to use during tutorial and normal precombat setup

The requisition screen had two related layout failures:

1. Allocation cards inside the section scrollers could collapse and visually overlap, especially on the training/tutorial flow.
2. The precombat toolbar could overlap itself at narrower desktop widths, causing the budget panel and action buttons to paint on top of one another.

Although the tutorial overlay made the overlap more obvious, the underlying bug lived in the requisition screen layout itself.

## Root Cause Analysis

### 1. Allocation cards were allowed to collapse inside the scroller
The allocation lists switched to a grid/flex combination that let child cards participate in shrinking when the scroll column was constrained. That produced stacked, overlapping rows instead of stable card heights.

### 2. The toolbar assumed a wide desktop width
The budget panel and right-side actions shared a single row with no wrap behavior. Once the viewport narrowed past the design’s comfortable width, the center budget block and action buttons competed for the same horizontal space.

### 3. Verification initially focused too narrowly on the tutorial
The first round of investigation was pointed at the tutorial highlight state, but the live browser made it clear the defect persisted even without tutorial-specific behavior. The right fix was in the requisition layout, not the tutorial controller.

## The Fix

### Initial layout stabilization
**File**: `index.html`

- Changed `.allocation-items` to a vertical flex stack instead of a grid-like layout.
- Added `flex-shrink: 0` to `.allocation-item` so cards keep their full height in the scroll region.
- Added toolbar wrap behavior below `1180px` so the budget panel can move onto its own row cleanly.

### Follow-up structural pass
**Files**: `index.html`, `src/ui/screens/PrecombatScreen.ts`

- Combined the separate Supplies panel into Logistics so depot items live with the rest of the support chain.
- Reworked the desktop grid so Units and Support get taller tiles while Logistics spans the full right column.
- Added mobile height overrides so the revised desktop proportions do not create an unusable stacked view on smaller screens.
- Improved unit-card art legibility with a lighter visual well and slightly brighter, higher-contrast sprite treatment.

## Prevention Guidelines

### Layout checklist for future requisition changes

- Treat scrollable allocation lists as vertical stacks with non-shrinking card children.
- When adding or resizing toolbar content, test at at least one “narrow desktop” width around `1100-1200px`.
- Verify the requisition page both with and without tutorial overlays active.
- Re-check the page in a stacked mobile layout after any desktop-only tile adjustment.

### Visual regression checklist

- Confirm each allocation card keeps a readable height inside its list.
- Confirm toolbar buttons and budget summary never overlap.
- Confirm unit thumbnails remain readable against the card background.
- Confirm logistics content still exposes the mission-minimum convoy and depot items without requiring a separate panel.

## Files Touched During Resolution

1. `index.html`
2. `src/ui/screens/PrecombatScreen.ts`
3. `src/data/tutorialSteps.ts`
4. `src/testing/RequisitionUI.integration.test.ts`

## Lessons Learned

1. Tutorial screenshots are a symptom, not automatically the cause.
2. Scroll containers need explicit non-shrinking children when cards carry dense controls and text.
3. Desktop polish changes should always be checked at the “almost tablet” breakpoint, where overlap bugs usually show up first.
4. Sprite readability can often be improved faster with background contrast and image treatment than with immediate asset rework.
