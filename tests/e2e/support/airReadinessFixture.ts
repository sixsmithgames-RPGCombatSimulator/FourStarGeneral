import { PopupManager } from '../../../src/ui/components/PopupManager';
import { ensureBattleState } from '../../../src/state/BattleState';
import { normalizeScenarioSource } from '../../../src/data/scenarioNormalizer';
import scenarioSource from '../../../src/data/scenario01.json';
import unitTypes from '../../../src/data/unitSystem/derivedUnitTypes';
import terrainSource from '../../../src/data/terrain.json';
import type { TerrainDictionary } from '../../../src/core/types';

let manager: PopupManager | null = null;

/** Exercise the real popup and sidebar renderer with authored data, without starting a battle. */
export function mountAirReadinessFixture(): void {
  const scenario = normalizeScenarioSource(scenarioSource, { turnLimit: scenarioSource.turnLimit });
  ensureBattleState().initializeEngine({
    scenario, unitTypes,
    // Authored terrain JSON supplies the production dictionary; JSON does not retain its key union.
    terrain: terrainSource as TerrainDictionary,
    playerSide: scenario.sides.Player, botSide: scenario.sides.Bot
  });
  manager = new PopupManager();
  manager.openPopup('airSupport');
}

/** Release the actual manager's subscriptions and DOM after each isolated fixture. */
export function disposeAirReadinessFixture(): void {
  manager?.dispose();
  manager = null;
}
