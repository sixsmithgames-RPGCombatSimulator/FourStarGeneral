import { warRoomHotspotDefinitions } from '../src/data/warRoomHotspots';

describe('War Room Hotspot Definitions', () => {
  test('all hotspots have required properties', () => {
    for (const hotspot of warRoomHotspotDefinitions) {
      expect(hotspot.id).toBeDefined();
      expect(hotspot.id).not.toBe('');
      expect(hotspot.label).toBeDefined();
      expect(hotspot.coords).toBeDefined();
      expect(hotspot.focusOrder).toBeGreaterThan(0);
    }
  });

  test('hotspot coordinates are within valid percentage range', () => {
    for (const hotspot of warRoomHotspotDefinitions) {
      expect(hotspot.coords.x).toBeGreaterThanOrEqual(0);
      expect(hotspot.coords.x).toBeLessThanOrEqual(100);
      expect(hotspot.coords.y).toBeGreaterThanOrEqual(0);
      expect(hotspot.coords.y).toBeLessThanOrEqual(100);
    }
  });

  test('polygon hotspots have clipPath defined', () => {
    for (const hotspot of warRoomHotspotDefinitions) {
      if (hotspot.shape === 'polygon') {
        expect(hotspot.clipPath).toBeDefined();
        expect(hotspot.clipPath).toContain('polygon');
      }
    }
  });
});
