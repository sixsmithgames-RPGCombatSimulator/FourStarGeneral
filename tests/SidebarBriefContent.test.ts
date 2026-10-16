import './domEnvironment.js';
import assert from 'node:assert/strict';
import { registerTest } from './harness';
import { getSidebarMiniTutorial } from '../src/data/sidebarMiniTutorials';
import { PopupManager } from '../src/ui/components/PopupManager';
import { projectRosterSectionPresentation } from '../src/ui/presentation/RosterEntryPresentation';
import type { GeneralRosterEntry } from '../src/utils/rosterStorage';
import type { LogisticsSnapshot, PlayerReconReport } from '../src/contracts/BattleSidebarEngine';

// Test-only access to production composers; no replacement renderer or production hook.
type PanelAccess = {
  pullLogisticsSnapshot(): LogisticsSnapshot | null;
  pullSupplySnapshot(): null;
  composeGeneralHistory(profile: GeneralRosterEntry): string;
  composeGeneralStatMarkup(profile: GeneralRosterEntry, benefits: GeneralRosterEntry['stats']): string;
  buildReconObserverView(report: PlayerReconReport): ReconView;
  renderReconObserverRowMarkup(view: ReconView): string;
};

interface ReconView {
  readonly observerId: string;
  readonly label: string;
  readonly shortLabel: string;
  readonly locationLabel: string;
  readonly strength: number;
  readonly spottingRange: number;
  readonly sourceLabel: string;
  readonly statusLabel: string;
  readonly statusClass: 'contact' | 'watching';
  readonly spriteUrl?: string;
  readonly contacts: readonly { readonly unitId: string; readonly label: string; readonly locationLabel: string;
    readonly activityLabel: string; readonly classificationLabel: string; readonly strengthLabel: string }[];
}

function mountManager(): { manager: PopupManager; panel: PanelAccess } {
  document.body.innerHTML = '<div id="battlePopupLayer"><section class="battle-popup"><h2 data-popup-title></h2><button id="battlePopupClose">Close</button><div data-popup-body></div></section></div>';
  const manager = new PopupManager();
  return { manager, panel: manager as unknown as PanelAccess };
}

function commander(victories: number): GeneralRosterEntry {
  return { id: 'brief-test', identity: { name: 'Field Commander' },
    stats: { accBonus: 0.1, dmgBonus: 0.2, moveBonus: 0.1, supplyBonus: 0.1 },
    serviceRecord: { missionsCompleted: victories, victoriesAchieved: victories, unitsDeployed: 13, casualtiesSustained: 0 } };
}

for (const count of [0, 1, 2]) {
  registerTest(`SIDEBAR_BRIEF_CONVOY_TARGET_${count}_CONVOYS_EXCLUDES_CARE_TEAMS`, () => {
    const { manager, panel } = mountManager();
    const snapshot: LogisticsSnapshot = {
      turn: 1, deployedUnits: 3, connectedUnits: 3, isolatedUnits: 0, convoyUnits: count,
      loadedConvoys: count, convoyCargo: { ammo: 10, fuel: 20 }, depotStock: { ammo: 100, fuel: 100, parts: 0 },
      supplySources: [], stockpiles: [], priorityTargets: [], careTargets: [], delayNodes: [], maintenanceBacklog: [], alerts: [],
      supportTeamStatuses: (['medical', 'repair'] as const).map(type => ({
        unitId: type, teamLabel: `${type} team`, type, route: 'Base Camp', status: 'available', etaHours: 0,
        assignedUnitLabel: null, assignedHex: null, need: 0, lastTurnEffect: null, incident: null
      })),
      convoyStatuses: Array.from({ length: count }, (_, index) => ({
        unitId: `convoy-${index}`, convoyLabel: `Convoy ${index + 1}`, route: 'Base Camp → Infantry',
        status: 'delivering', etaHours: 2, cargoAmmo: 10, cargoFuel: 20, incident: null
      }))
    };
    panel.pullLogisticsSnapshot = () => snapshot;
    panel.pullSupplySnapshot = () => null;
    try {
      manager.openPopup('logistics');
      assert.equal(document.querySelectorAll('[data-logistics-care-teams] .logistics-convoy-item').length, 2);
      const step = getSidebarMiniTutorial('logistics')!.steps[3];
      const targets = document.querySelectorAll(step.highlightSelector);
      assert.equal(step.highlightFirstMatch, true, 'Only one bounded row should be spotlighted.');
      assert.equal(targets.length, Math.max(1, count));
      assert.ok(targets[0].closest('[data-logistics-convoys]'), 'Never teach a care team as a convoy.');
      assert.match(targets[0].textContent ?? '', count ? /Convoy 1[\s\S]+Base Camp → Infantry[\s\S]+Cargo 10\.00 ammo[\s\S]+20\.00 fuel[\s\S]+ETA 2h/ : /No active convoys/);
      assert.match(step.content, /No active convoys/);
      for (const target of targets) assert.equal(target.closest('[data-logistics-care-teams]'), null);
    } finally { manager.dispose(); }
  });
}

for (const victories of [0, 1, 2]) {
  registerTest(`SIDEBAR_BRIEF_SERVICE_NOTES_${victories}_VICTORIES`, () => {
    const { manager, panel } = mountManager();
    try {
      const history = panel.composeGeneralHistory(commander(victories));
      assert.ok(history.includes(`with ${victories} ${victories === 1 ? 'victory' : 'victories'}.`));
      assert.ok(history.includes(`${victories} ${victories === 1 ? 'mission' : 'missions'} with`));
      assert.doesNotMatch(history, /victoryies|victorys/);
    } finally { manager.dispose(); }
  });
}

registerTest('SIDEBAR_BRIEF_GENERAL_COPY_MATCHES_RENDERED_BONUSES', () => {
  const { manager, panel } = mountManager();
  try {
    const profile = commander(0);
    const element = document.createElement('div');
    element.innerHTML = panel.composeGeneralStatMarkup(profile, profile.stats);
    const labels = Array.from(element.querySelectorAll('dt'), item => item.textContent!.replace(' Bonus', '').toLowerCase());
    assert.deepEqual(labels, ['accuracy', 'damage', 'mobility', 'supply']);
    const content = getSidebarMiniTutorial('generalProfile')!.steps[1].content.toLowerCase();
    for (const label of labels) assert.ok(content.includes(label), `Brief must name the rendered ${label} modifier.`);
    assert.doesNotMatch(content, /reconnaissance/);
  } finally { manager.dispose(); }
});

registerTest('SIDEBAR_BRIEF_RECON_COPY_MATCHES_LIVE_CONTACT_FIELDS', () => {
  const { manager, panel } = mountManager();
  try {
    const report: PlayerReconReport = {
      observerUnitId: 'recon', observerType: 'Recon_Bike', observerHex: { q: 1, r: 1 }, observerStrength: 100,
      source: 'Recon patrol', spottingRange: 5, contacts: [{ unitId: 'enemy',
        hex: { q: 2, r: 1 }, state: 'identified', strengthEstimate: 80, movedThisTurn: true, attackedThisTurn: false }]
    };
    const element = document.createElement('div');
    element.innerHTML = panel.renderReconObserverRowMarkup(panel.buildReconObserverView(report));
    const contact = element.querySelector('.recon-contact-item')!;
    assert.match(contact.textContent ?? '', /Maneuvering[\s\S]+Tracked by recon[\s\S]+Strength est. 80/);
    assert.ok(contact.querySelector('.recon-contact-pill')!.textContent!.trim().length > 0);
    const content = getSidebarMiniTutorial('recon')!.steps[2].content.toLowerCase();
    for (const field of ['position', 'activity', 'source', 'strength']) assert.ok(content.includes(field));
    assert.doesNotMatch(content, /\bage\b|confidence/);
  } finally { manager.dispose(); }
});

registerTest('SIDEBAR_BRIEF_ROSTER_COPY_MATCHES_FRONTLINE_STATS', () => {
  const element = document.createElement('div');
  element.innerHTML = projectRosterSectionPresentation([{ unitKey: 'infantry', label: 'Infantry', status: 'deployed',
    strength: 100, experience: 0, ammo: 6, fuel: null }]).markup;
  assert.deepEqual(Array.from(element.querySelectorAll('abbr'), item => item.title), ['Strength', 'Experience', 'Ammo', 'Fuel']);
  const content = getSidebarMiniTutorial('armyRoster')!.steps[1].content.toLowerCase();
  for (const field of ['strength', 'experience', 'ammunition', 'fuel']) assert.ok(content.includes(field));
  assert.doesNotMatch(content, /movement/);
});
