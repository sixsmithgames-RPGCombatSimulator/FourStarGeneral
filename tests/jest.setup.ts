/**
 * JEST Setup File
 * 
 * This file runs before each test file to set up the testing environment.
 * It provides DOM utilities for testing actual visual state.
 */

// Extend JEST matchers for DOM assertions
import '@testing-library/jest-dom';

// Global test utilities
declare global {
  interface Window {
    testEnvironment: {
      isJest: boolean;
      isPlaywright: boolean;
    };
  }
}

window.testEnvironment = {
  isJest: true,
  isPlaywright: false
};

// Utility to check element visibility
export function isElementVisible(element: HTMLElement | null): boolean {
  if (!element) return false;
  
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  
  return (
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0' &&
    rect.width > 0 &&
    rect.height > 0
  );
}

// Utility to check element opacity
export function getElementOpacity(element: HTMLElement | null): number {
  if (!element) return 0;
  const style = window.getComputedStyle(element);
  return parseFloat(style.opacity) || 0;
}

// Utility to wait for element to be visible
export async function waitForVisible(
  selector: string, 
  timeout = 5000
): Promise<HTMLElement> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    const element = document.querySelector(selector) as HTMLElement;
    if (element && isElementVisible(element)) {
      return element;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Element ${selector} did not become visible within ${timeout}ms`);
}

// Utility to capture visual state for debugging
export function captureVisualState(element: HTMLElement | null): object {
  if (!element) {
    return { exists: false };
  }
  
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  
  return {
    exists: true,
    opacity: style.opacity,
    display: style.display,
    visibility: style.visibility,
    position: {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height
    }
  };
}
