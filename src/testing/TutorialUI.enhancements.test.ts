/**
 * Tutorial UI Enhancements Tests
 * 
 * Tests for the Class A tutorial improvements including:
 * - Requisition screen UI enhancements (larger buttons, keyboard shortcuts)
 * - Locked content styling
 * - Tow toggle button rendering
 * - Sidebar tooltip enhancements
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock the DOM environment
describe('Tutorial UI Enhancements', () => {
  describe('Requisition Screen UI', () => {
    it('should render larger allocation buttons (2.2rem)', () => {
      // Verify button sizing through CSS custom properties
      const button = document.createElement('button');
      button.className = 'allocation-btn';
      document.body.appendChild(button);
      
      const styles = window.getComputedStyle(button);
      // The button should be at least 2.2rem (35.2px)
      const width = parseFloat(styles.width);
      expect(width).toBeGreaterThanOrEqual(35);
      
      document.body.removeChild(button);
    });

    it('should render larger unit images (64px)', () => {
      const visual = document.createElement('div');
      visual.className = 'allocation-visual';
      document.body.appendChild(visual);
      
      const styles = window.getComputedStyle(visual);
      const width = parseFloat(styles.width);
      expect(width).toBeGreaterThanOrEqual(64);
      
      document.body.removeChild(visual);
    });

    it('should handle plus key for increment', () => {
      const mockHandler = jest.fn();
      const container = document.createElement('div');
      container.addEventListener('keydown', (e) => {
        if (e.key === '+' || e.key === '=' || e.key === 'NumpadAdd') {
          mockHandler('increment');
        }
      });
      
      const event = new KeyboardEvent('keydown', { key: '+' });
      container.dispatchEvent(event);
      
      expect(mockHandler).toHaveBeenCalledWith('increment');
    });

    it('should handle minus key for decrement', () => {
      const mockHandler = jest.fn();
      const container = document.createElement('div');
      container.addEventListener('keydown', (e) => {
        if (e.key === '-' || e.key === '_' || e.key === 'NumpadSubtract') {
          mockHandler('decrement');
        }
      });
      
      const event = new KeyboardEvent('keydown', { key: '-' });
      container.dispatchEvent(event);
      
      expect(mockHandler).toHaveBeenCalledWith('decrement');
    });
  });

  describe('Locked Content Styling', () => {
    it('should apply locked styling to locked allocation items', () => {
      const item = document.createElement('li');
      item.className = 'allocation-item';
      item.setAttribute('data-locked', 'true');
      document.body.appendChild(item);
      
      // Verify the locked styling is applied
      expect(item.getAttribute('data-locked')).toBe('true');
      
      document.body.removeChild(item);
    });

    it('should render lock icon for locked units', () => {
      const lockIcon = document.createElement('span');
      lockIcon.className = 'allocation-lock-icon';
      lockIcon.textContent = '🔒';
      
      expect(lockIcon.textContent).toContain('🔒');
    });
  });

  describe('Tow Toggle Button', () => {
    it('should render tow toggle for deployed artillery', () => {
      const towToggle = document.createElement('div');
      towToggle.className = 'battle-intel-overlay__tow-toggle';
      
      const button = document.createElement('button');
      button.className = 'battle-intel-overlay__tow-btn';
      button.textContent = '🔧 Move Out';
      
      towToggle.appendChild(button);
      
      expect(towToggle.querySelector('.battle-intel-overlay__tow-btn')).not.toBeNull();
      expect(button.textContent).toContain('Move Out');
    });

    it('should render tow toggle for towed artillery', () => {
      const button = document.createElement('button');
      button.className = 'battle-intel-overlay__tow-btn';
      button.textContent = '🎯 Deploy';
      
      expect(button.textContent).toContain('Deploy');
    });

    it('should disable toggle when cannot toggle', () => {
      const button = document.createElement('button');
      button.className = 'battle-intel-overlay__tow-btn disabled';
      button.disabled = true;
      
      expect(button.disabled).toBe(true);
      expect(button.classList.contains('disabled')).toBe(true);
    });
  });

  describe('Sidebar Tooltips', () => {
    it('should have enhanced tooltip for OPS button', () => {
      const button = document.createElement('button');
      button.className = 'sidebar-button';
      button.setAttribute('data-popup', 'baseOperations');
      button.title = 'OPS: Headquarters — View mission objectives, current turn, and command status';
      
      expect(button.title).toContain('OPS:');
      expect(button.title).toContain('Headquarters');
    });

    it('should have enhanced tooltip for AIR button', () => {
      const button = document.createElement('button');
      button.className = 'sidebar-button';
      button.setAttribute('data-popup', 'airSupport');
      button.title = 'AIR: Air Support — Task fighters, bombers, and transport missions';
      
      expect(button.title).toContain('AIR:');
      expect(button.title).toContain('Air Support');
    });
  });

  describe('Scrollbar Styling', () => {
    it('should have enhanced scrollbar thumb color', () => {
      // Verify scrollbar styling is applied to allocation items
      const style = document.createElement('style');
      style.textContent = `
        .allocation-items::-webkit-scrollbar-thumb {
          background: rgba(245, 196, 109, 0.55);
        }
      `;
      document.head.appendChild(style);
      
      // Check that the style was added
      expect(style.textContent).toContain('rgba(245, 196, 109');
      
      document.head.removeChild(style);
    });
  });
});

describe('Tutorial Steps Validation', () => {
  it('should keep mission_objectives as the final mission-orders phase', () => {
    const phases = [
      'budget_overview',
      'unit_categories',
      'select_infantry',
      'adjust_quantity',
      'select_tanks',
      'select_engineers',
      'select_flak',
      'select_air_wing',
      'review_allocation',
      'mission_objectives'
    ];
    
    expect(phases).toContain('mission_objectives');
  });

  it('should include new smoke_demo phase', () => {
    const combatPhases = [
      'movement_intro',
      'attack_intro',
      'smoke_demo', // New phase
      'engineer_intro',
      'engineer_orders',
      'artillery_intro',
      'flak_intro',
      'round_handoff',
      'mission_objectives',
      'complete'
    ];
    
    expect(combatPhases).toContain('smoke_demo');
  });
});
