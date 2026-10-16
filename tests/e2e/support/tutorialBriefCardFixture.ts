import { PopupManager } from '../../../src/ui/components/PopupManager';
import { TutorialOverlay } from '../../../src/ui/components/TutorialOverlay';
import { SIDEBAR_MINI_TUTORIAL_EVENT } from '../../../src/data/sidebarMiniTutorials';
import type { LogisticsSnapshot } from '../../../src/contracts/BattleSidebarEngine';

let manager: PopupManager | null = null;
let overlay: TutorialOverlay | null = null;

/** Test-owned data boundary; the production popup, authored steps and scroll owner are unchanged. */
export function mountConvoys(convoyCount: number): void {
  const snapshot: LogisticsSnapshot = {
    turn: 1, deployedUnits: 3, connectedUnits: 3, isolatedUnits: 0, convoyUnits: convoyCount,
    loadedConvoys: convoyCount, convoyCargo: { ammo: 10, fuel: 20 }, depotStock: { ammo: 100, fuel: 100, parts: 0 },
    supplySources: [], stockpiles: [], priorityTargets: [], careTargets: [], delayNodes: [], maintenanceBacklog: [], alerts: [],
    supportTeamStatuses: (['medical', 'repair'] as const).map(type => ({
      unitId: type, teamLabel: `${type} team`, type, route: 'Base Camp', status: 'available', etaHours: 0,
      assignedUnitLabel: null, assignedHex: null, need: 0, lastTurnEffect: null, incident: null
    })),
    convoyStatuses: Array.from({ length: convoyCount }, (_, index) => ({
      unitId: `convoy-${index}`, convoyLabel: `Convoy ${index + 1}`, route: 'Base Camp → Infantry',
      status: 'delivering', etaHours: 2, cargoAmmo: 10, cargoFuel: 20, incident: null
    }))
  };
  manager = new PopupManager();
  const data = manager as unknown as { pullLogisticsSnapshot(): LogisticsSnapshot; pullSupplySnapshot(): null };
  data.pullLogisticsSnapshot = () => snapshot;
  data.pullSupplySnapshot = () => null;
  manager.openPopup('logistics');
  overlay = new TutorialOverlay();
  overlay.initialize();
  document.dispatchEvent(new CustomEvent(SIDEBAR_MINI_TUTORIAL_EVENT, { detail: { key: 'logistics' } }));
}

/** Production roster with a full readiness row and enough entries to exercise popup scrolling. */
export function mountRoster(): void {
  manager = new PopupManager();
  manager.buildRosterSnapshot = () => ({
    deployed: Array.from({ length: 14 }, (_, index) => ({
      unitKey: 'maintenance', label: index === 0 ? 'Recovery & Repair Section' : `Support formation ${index}`,
      status: 'deployed' as const, strength: 100, experience: 0, ammo: 0, fuel: 70, logisticsRole: 'repair' as const,
      personnelStatus: { fit: 54, injured: 0, wounded: 0, severelyWounded: 0, killed: 0, total: 54, casualties: 0, readiness: 100 },
      equipmentStatus: { operational: 6, damaged: 0, disabled: 0, destroyed: 0, total: 6, losses: 0, readiness: 100 }
    })),
    reserves: [], support: [], exhausted: [], totalDeployed: 14, totalReserves: 0, totalSupport: 0
  });
  manager.openPopup('armyRoster');
  overlay = new TutorialOverlay();
  overlay.initialize();
  document.dispatchEvent(new CustomEvent(SIDEBAR_MINI_TUTORIAL_EVENT, { detail: { key: 'armyRoster' } }));
}

export function dispose(): void {
  overlay?.dispose();
  manager?.dispose();
  overlay = null;
  manager = null;
}
