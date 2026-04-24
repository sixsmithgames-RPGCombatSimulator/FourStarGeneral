# Testing Infrastructure

This project uses a multi-layered testing approach:

## Test Types

### 1. Original Custom Test Harness (`npm test`)
- **Location**: `tests/*.test.ts` (non-jest)
- **Framework**: Custom Given/When/Then harness with jsdom
- **Use Case**: Fast unit/integration tests
- **Run**: `npm test`

### 2. JEST Tests (NEW) - Unit/Integration with DOM assertions
- **Location**: `tests/*.jest.test.ts`
- **Framework**: JEST + jsdom + @testing-library/jest-dom
- **Use Case**: Testing actual visual state, DOM assertions
- **Run**: `npm run test:jest`
- **Run (watch)**: `npm run test:jest:watch`

**Key Features:**
- Tests what is ACTUALLY SHOWN, not internal data
- DOM element visibility assertions
- Computed style assertions
- Screenshot capture for debugging

**Example assertions:**
```typescript
// Test actual visual opacity, not internal flag
expect(actor.image.style.opacity).toBe('1');

// Test DOM visibility
expect(element).toBeVisible();

// Test computed styles
expect(getElementOpacity(element)).toBe(1);
```

### 3. Playwright E2E Tests (NEW) - Real browser testing
- **Location**: `tests/e2e/*.spec.ts`
- **Framework**: Playwright (Chromium, Firefox, WebKit)
- **Use Case**: Full browser automation, visual regression, pixel-perfect verification
- **Run**: `npm run test:e2e`
- **Run (UI mode)**: `npm run test:e2e:ui`
- **Run (debug)**: `npm run test:e2e:debug`

**Key Features:**
- Runs in real browsers
- Captures screenshots on failure
- Records video of test runs
- Visual regression testing
- Tests actual rendered pixels

**Example test:**
```typescript
test('aircraft remain visible', async ({ page }) => {
  await page.goto('/');
  await page.click('[data-testid="play-airshow"]');
  
  // Verify actual rendered state
  const bomber = page.locator('[data-role="bomber"]');
  await expect(bomber).toHaveCSS('opacity', '1');
  await expect(bomber).toBeVisible();
  
  // Screenshot for verification
  await page.screenshot({ path: 'test-results/visible.png' });
});
```

## Installation

```bash
# Install all dependencies including JEST and Playwright
npm install

# Install Playwright browsers (one-time setup)
npx playwright install
```

## Running Tests

```bash
# Original test harness
npm test

# JEST tests (DOM assertions)
npm run test:jest

# Playwright E2E tests
npm run test:e2e

# Playwright with UI for debugging
npm run test:e2e:ui
```

## Test Writing Guidelines

Per ITERATION_GOVERNANCE.md:

1. **Test what is ACTUALLY SHOWN**
   - ❌ BAD: `expect(actor.active).toBe(true)` - internal flag
   - ✅ GOOD: `expect(actor.image.style.opacity).toBe('1')` - visual state

2. **Test at the same layer as the user's complaint**
   - If user reports "sprites disappear" → test DOM visibility
   - If user reports "animation jumps" → test position continuity
   - For inspection-report continuity/separation checks, use canonical `sampledPositions` or shared helpers from `tests/airScenarioSupport.ts`, not raw assignment control waypoints

3. **When to use which framework:**
   - **Custom harness**: Fast logic/data structure tests
   - **JEST**: DOM state assertions, computed styles
   - **Playwright**: Visual regression, real browser rendering

## Test Utilities

### JEST Utilities (`tests/jest.setup.ts`)

```typescript
import { 
  isElementVisible, 
  getElementOpacity, 
  captureVisualState,
  waitForVisible 
} from './jest.setup';

// Check if element is visible to user
expect(isElementVisible(element)).toBe(true);

// Get computed opacity
expect(getElementOpacity(element)).toBe(1);

// Capture full visual state for debugging
const state = captureVisualState(element);
// { exists: true, opacity: '1', display: 'block', position: {...} }
```

## Visual Regression Testing

Playwright supports visual regression testing:

```typescript
test('layout matches baseline', async ({ page }) => {
  await page.goto('/');
  // Compare to stored screenshot
  await expect(page).toHaveScreenshot('baseline.png');
});
```

Update baselines:
```bash
npx playwright test --update-snapshots
```
