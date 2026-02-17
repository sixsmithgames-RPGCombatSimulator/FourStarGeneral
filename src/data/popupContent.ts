import type { PopupKey } from "../contracts/IPopupManager";

/**
 * Defines the minimal shape for popup content entries.
 * Each entry links a `PopupKey` to a title and HTML body fragment.
 */
export interface PopupContentDefinition {
  /** Popup identifier used by `PopupManager` to look up the entry. */
  key: PopupKey;
  /** Human readable popup title shown in the dialog header. */
  title: string;
  /** Rendered HTML snippet inserted into the popup body container. */
  body: string;
}

/**
 * Popup content registry.
 * Maps popup keys to their display content (title and body HTML).
 * PopupManager reads from this registry to render popup dialogs.
 */
export const popupContentRegistry: PopupContentDefinition[] = [
  {
    key: "airSupport",
    title: "Air Support",
    body: `
      <style>
        .air-panel { display: grid; gap: 1.25rem; }
        .air-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 0.75rem; }
        .air-chip { border: 1px solid rgba(229,236,255,0.18); background: rgba(14,18,28,0.85); border-radius: 12px; padding: 0.6rem 0.8rem; display: grid; gap: 0.25rem; text-align: center; }
        .air-chip strong { font-size: 1.1rem; letter-spacing: 0.04em; }
        .air-chip span { font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(229,236,255,0.72); }
        .air-section { display: grid; gap: 0.6rem; }
        .air-section header { display: flex; align-items: baseline; justify-content: space-between; gap: 0.75rem; }
        .air-mission-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.5rem; }
        .air-mission-item { border: 1px solid rgba(229,236,255,0.14); background: rgba(13,18,28,0.8); border-radius: 12px; padding: 0.6rem 0.75rem; display: grid; gap: 0.25rem; }
        .air-mission-line { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
        .air-badge { font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; border: 1px solid rgba(229,236,255,0.24); border-radius: 999px; padding: 0.15rem 0.55rem; }
        .air-badge--success { border-color: rgba(100,200,100,0.5); background: rgba(100,200,100,0.15); color: #9fefa0; }
        .air-badge--partial { border-color: rgba(245,196,109,0.5); background: rgba(245,196,109,0.15); color: #f5c46d; }
        .air-badge--aborted { border-color: rgba(255,100,100,0.5); background: rgba(255,100,100,0.15); color: #ffa0a0; }
        .air-mission-outcome { display: flex; align-items: center; gap: 0.5rem; padding-top: 0.35rem; border-top: 1px solid rgba(229,236,255,0.1); margin-top: 0.25rem; flex-wrap: wrap; }
        .air-outcome-details { font-size: 0.8rem; color: rgba(229,236,255,0.8); }
        .air-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .air-form { display: grid; gap: 0.6rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); align-items: end; }
        .air-form .field { display: grid; gap: 0.35rem; }
        .air-form label { font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(229,236,255,0.75); }
        .air-form select { padding: 0.55rem 0.7rem; border-radius: 10px; border: 1px solid rgba(229,236,255,0.18); background: rgba(17,24,36,0.75); color: #f5f7ff; font-size: 0.9rem; }
        .air-form .button-row { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .air-button { padding: 0.5rem 0.8rem; border-radius: 10px; border: 1px solid rgba(229,236,255,0.18); background: rgba(17,24,36,0.75); color: #f5f7ff; font-size: 0.85rem; font-weight: 600; text-transform: uppercase; cursor: pointer; }
        .air-button.primary { border-color: rgba(245,196,109,0.5); background: linear-gradient(135deg, rgba(245,196,109,0.22), rgba(14,16,24,0.25)); color: #fff; }
        .air-note { font-size: 0.8rem; color: rgba(229,236,255,0.7); }
      </style>
      <div class="air-panel" data-air-panel>
        <section class="air-section">
          <header>
            <h3>Schedule Mission</h3>
            <span class="air-note">Pick mission, squadron, and target</span>
          </header>
          <form class="air-form" data-air-form>
            <div class="field">
              <label>Mission</label>
              <select data-air-mission-kind></select>
            </div>
            <div class="field">
              <label>Squadron</label>
              <select data-air-unit-select></select>
            </div>
            <div class="field">
              <label>Target</label>
              <select data-air-target-select></select>
            </div>
            <div class="field">
              <button type="submit" class="air-button primary">Schedule</button>
            </div>
          </form>
          <div class="air-note" data-air-feedback></div>
        </section>
        <section class="air-section">
          <header>
            <h3>Summary</h3>
            <span class="air-note">Active sorties and refit cycles</span>
          </header>
          <div class="air-summary" data-air-summary>
            <div class="air-chip"><strong data-air-queued>0</strong><span>Queued</span></div>
            <div class="air-chip"><strong data-air-inflight>0</strong><span>In Flight</span></div>
            <div class="air-chip"><strong data-air-resolving>0</strong><span>Resolving</span></div>
            <div class="air-chip"><strong data-air-completed>0</strong><span>Completed</span></div>
            <div class="air-chip"><strong data-air-refit>0</strong><span>Refit</span></div>
          </div>
        </section>
        <section class="air-section">
          <header>
            <h3>Missions</h3>
            <div class="air-actions">
              <button type="button" class="air-button" data-air-refresh>Refresh</button>
            </div>
          </header>
          <ul class="air-mission-list" data-air-mission-list></ul>
        </section>
      </div>
    `
  },
  {
    key: "recon",
    title: "Reconnaissance",
    body: `
      <style>
        .recon-panel { display: grid; gap: 1.25rem; }
        .recon-panel__header { display: grid; gap: 0.35rem; }
        .recon-panel__header h3 { margin: 0; letter-spacing: 0.08em; text-transform: uppercase; }
        .recon-panel__header p { margin: 0; color: rgba(229, 236, 255, 0.68); font-size: 0.95rem; line-height: 1.5; }
        .recon-panel__list { display: grid; gap: 1rem; }
        .recon-report-card { border-radius: 14px; border: 1px solid rgba(229, 236, 255, 0.18); background: rgba(13, 18, 28, 0.86); padding: 1rem 1.25rem; display: grid; gap: 0.55rem; }
        .recon-report-card strong { letter-spacing: 0.06em; text-transform: uppercase; font-size: 0.95rem; }
        .recon-report-card .meta-line { font-size: 0.8rem; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(229, 236, 255, 0.65); display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .recon-report-card .meta-pill { border: 1px solid rgba(229, 236, 255, 0.24); border-radius: 999px; padding: 0.2rem 0.55rem; font-size: 0.78rem; }
        .recon-report-card p { margin: 0; color: rgba(245, 250, 255, 0.82); line-height: 1.5; font-size: 0.95rem; }
        .recon-report-empty { font-size: 0.95rem; color: rgba(229, 236, 255, 0.72); text-align: center; padding: 1.25rem; border: 1px dashed rgba(229, 236, 255, 0.2); border-radius: 12px; background: rgba(12, 16, 25, 0.6); }
      </style>
      <div class="recon-panel" data-recon-panel>
        <header class="recon-panel__header">
          <h3>Last Turn Recon Reports</h3>
          <p>Summaries from reconnaissance aircraft and vehicles observing the battlefield.</p>
        </header>
        <div class="recon-panel__list" data-recon-report-list></div>
      </div>
    `
  },
  {
    key: "intelligence",
    title: "Intelligence",
    body: `
      <style>
        .intel-panel { display: grid; gap: 1.5rem; }
        .intel-alert { border-radius: 12px; padding: 1rem 1.25rem; font-weight: 600; display: grid; gap: 0.35rem; }
        .intel-alert[data-severity="critical"] { background: rgba(255, 104, 104, 0.15); border: 1px solid rgba(255, 104, 104, 0.4); color: #ffebeb; }
        .intel-alert[data-severity="warning"] { background: rgba(255, 196, 109, 0.15); border: 1px solid rgba(255, 196, 109, 0.35); color: #ffe9c7; }
        .intel-alert[data-severity="info"] { background: rgba(149, 190, 255, 0.12); border: 1px solid rgba(149, 190, 255, 0.32); color: #e2ecff; }
        .intel-controls { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; }
        .intel-filter-group { display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap; }
        .intel-filter-group label { font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(229, 236, 255, 0.75); }
        .intel-filter { border: 1px solid rgba(229, 236, 255, 0.18); background: rgba(17, 24, 36, 0.75); color: #f5f7ff; border-radius: 999px; padding: 0.35rem 0.9rem; font-size: 0.9rem; cursor: pointer; transition: background 0.2s ease, border-color 0.2s ease; }
        .intel-filter.is-active { background: rgba(245, 196, 109, 0.25); border-color: rgba(245, 196, 109, 0.5); }
        .intel-briefs { display: grid; gap: 1rem; }
        .intel-briefs header { display: grid; gap: 0.25rem; }
        .intel-briefs header h4 { margin: 0; letter-spacing: 0.08em; text-transform: uppercase; font-size: 1rem; }
        .intel-briefs header p { margin: 0; color: rgba(229, 236, 255, 0.68); font-size: 0.9rem; line-height: 1.4; }
        .intel-card { border-radius: 14px; border: 1px solid rgba(229, 236, 255, 0.15); background: rgba(14, 18, 28, 0.85); padding: 1rem 1.25rem; display: grid; gap: 0.55rem; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .intel-card:hover, .intel-card:focus-within { border-color: rgba(245, 196, 109, 0.6); box-shadow: 0 12px 30px rgba(245, 196, 109, 0.16); }
        .intel-card strong { letter-spacing: 0.06em; text-transform: uppercase; font-size: 0.95rem; }
        .intel-card .meta-line { font-size: 0.8rem; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(229, 236, 255, 0.65); display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .intel-card .meta-pill { border: 1px solid rgba(229, 236, 255, 0.24); border-radius: 999px; padding: 0.2rem 0.55rem; font-size: 0.78rem; }
        .intel-card .body { color: rgba(245, 250, 255, 0.82); line-height: 1.5; font-size: 0.95rem; }
        .intel-card .body[data-confidence="low"] { filter: blur(1px); opacity: 0.72; }
        .intel-empty { font-size: 0.95rem; color: rgba(229, 236, 255, 0.72); text-align: center; padding: 1.25rem; border: 1px dashed rgba(229, 236, 255, 0.2); border-radius: 12px; background: rgba(12, 16, 25, 0.6); }
      </style>
      <div class="intel-panel" data-intel-panel>
        <div class="intel-alert" data-intel-alert hidden></div>
        <div class="intel-controls">
          <div class="intel-filter-group" data-intel-filter-group="timeframe">
            <label>Timeframe</label>
            <button type="button" class="intel-filter" data-intel-timeframe="all">All</button>
            <button type="button" class="intel-filter" data-intel-timeframe="last">Last Turn</button>
            <button type="button" class="intel-filter" data-intel-timeframe="current">Current Turn</button>
            <button type="button" class="intel-filter" data-intel-timeframe="forecast">Forecast</button>
          </div>
          <div class="intel-filter-group" data-intel-filter-group="confidence">
            <label>Confidence</label>
            <button type="button" class="intel-filter" data-intel-confidence="all">All</button>
            <button type="button" class="intel-filter" data-intel-confidence="high">High</button>
            <button type="button" class="intel-filter" data-intel-confidence="medium">Medium</button>
            <button type="button" class="intel-filter" data-intel-confidence="low">Low</button>
          </div>
        </div>
        <section class="intel-briefs" data-intel-briefs>
          <header>
            <h4>Intel Briefs</h4>
            <p>Reports from field agents, informants, and analysts. Confidence indicates reliability.</p>
          </header>
          <div class="intel-briefs__list" data-intel-brief-list></div>
        </section>
      </div>
    `
  },
  {
    key: "logistics",
    title: "Logistics",
    body: `
      <style>
        .logistics-panel { display: grid; gap: 1.5rem; padding: 0.75rem 0; }
        .logistics-panel__section { display: grid; gap: 0.75rem; }
        .logistics-panel__header h3 { margin: 0; font-size: 1rem; letter-spacing: 0.08em; text-transform: uppercase; }
        .logistics-panel__header p { margin: 0; font-size: 0.85rem; color: rgba(229, 236, 255, 0.72); line-height: 1.4; }

        /* Supply source cards show throughput and bottlenecks */
        .logistics-sources-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .logistics-source-card { border-radius: 16px; border: 1px solid rgba(229, 236, 255, 0.18); background: rgba(17, 24, 36, 0.85); padding: 1rem 1.25rem; display: grid; gap: 0.75rem; }
        .logistics-source-card__header { display: flex; align-items: center; justify-content: space-between; }
        .logistics-source-card__header h4 { margin: 0; font-size: 1rem; letter-spacing: 0.06em; text-transform: uppercase; }
        .logistics-source-card__utilization { font-size: 1.25rem; font-weight: 700; color: rgba(245, 196, 109, 0.95); }
        .logistics-source-card__metrics { display: grid; gap: 0.5rem; font-size: 0.85rem; }
        .logistics-source-card__metric { display: flex; justify-content: space-between; align-items: baseline; }
        .logistics-source-card__metric dt { color: rgba(229, 236, 255, 0.72); letter-spacing: 0.05em; text-transform: uppercase; font-weight: 600; }
        .logistics-source-card__metric dd { margin: 0; color: rgba(245, 247, 255, 0.92); font-size: 1rem; }
        .logistics-source-card__bottleneck { margin-top: 0.5rem; padding: 0.65rem 0.9rem; border-radius: 8px; background: rgba(255, 196, 109, 0.15); border: 1px solid rgba(255, 196, 109, 0.3); font-size: 0.85rem; color: #ffe5c4; }

        /* Stockpile summary with trend indicators */
        .logistics-stockpiles-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        .logistics-stockpile-card { border-radius: 14px; border: 1px solid rgba(229, 236, 255, 0.16); background: rgba(14, 18, 28, 0.85); padding: 0.9rem 1.1rem; display: grid; gap: 0.5rem; text-align: center; }
        .logistics-stockpile-card__label { font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(229, 236, 255, 0.75); }
        .logistics-stockpile-card__total { font-size: 1.75rem; font-weight: 700; color: rgba(245, 247, 255, 0.95); }
        .logistics-stockpile-card__avg { font-size: 0.85rem; color: rgba(229, 236, 255, 0.72); }
        .logistics-stockpile-card__trend { font-size: 0.75rem; letter-spacing: 0.05em; text-transform: uppercase; padding: 0.25rem 0.6rem; border-radius: 999px; display: inline-block; }
        .logistics-stockpile-card__trend--rising { background: rgba(149, 190, 255, 0.2); color: #dfeaff; border: 1px solid rgba(149, 190, 255, 0.35); }
        .logistics-stockpile-card__trend--stable { background: rgba(149, 190, 255, 0.15); color: #e2ecff; border: 1px solid rgba(149, 190, 255, 0.3); }
        .logistics-stockpile-card__trend--falling { background: rgba(255, 196, 109, 0.2); color: #ffe3ba; border: 1px solid rgba(255, 196, 109, 0.35); }

        /* Convoy status list */
        .logistics-convoy-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; }
        .logistics-convoy-item { border-radius: 10px; border: 1px solid rgba(229, 236, 255, 0.14); background: rgba(13, 18, 28, 0.8); padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; font-size: 0.9rem; }
        .logistics-convoy-item__route { flex: 1; color: rgba(245, 250, 255, 0.88); }
        .logistics-convoy-item__status { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 0.25rem 0.65rem; border-radius: 999px; }
        .logistics-convoy-item__status--onSchedule { background: rgba(149, 190, 255, 0.18); color: #dfeaff; border: 1px solid rgba(149, 190, 255, 0.35); }
        .logistics-convoy-item__status--delayed { background: rgba(255, 196, 109, 0.2); color: #ffe3ba; border: 1px solid rgba(255, 196, 109, 0.35); }
        .logistics-convoy-item__status--blocked { background: rgba(255, 104, 104, 0.2); color: #ffd6d6; border: 1px solid rgba(255, 104, 104, 0.35); }
        .logistics-convoy-item__eta { color: rgba(229, 236, 255, 0.75); font-size: 0.85rem; }

        /* Delay nodes (chokepoints) */
        .logistics-delays-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; }
        .logistics-delay-item { border-radius: 10px; border: 1px solid rgba(229, 236, 255, 0.14); background: rgba(13, 18, 28, 0.8); padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; font-size: 0.9rem; }
        .logistics-delay-item__node { font-family: 'Courier New', monospace; color: rgba(245, 250, 255, 0.88); }
        .logistics-delay-item__risk { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 0.25rem 0.65rem; border-radius: 999px; }
        .logistics-delay-item__risk--low { background: rgba(149, 190, 255, 0.15); color: #e2ecff; border: 1px solid rgba(149, 190, 255, 0.3); }
        .logistics-delay-item__risk--medium { background: rgba(255, 196, 109, 0.18); color: #ffe3ba; border: 1px solid rgba(255, 196, 109, 0.35); }
        .logistics-delay-item__risk--high { background: rgba(255, 104, 104, 0.18); color: #ffd6d6; border: 1px solid rgba(255, 104, 104, 0.35); }
        .logistics-delay-item__reason { flex: 1; color: rgba(229, 236, 255, 0.72); font-size: 0.85rem; }

        /* Maintenance backlog */
        .logistics-maintenance-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; }
        .logistics-maintenance-item { border-radius: 10px; border: 1px solid rgba(229, 236, 255, 0.14); background: rgba(13, 18, 28, 0.8); padding: 0.75rem 1rem; display: flex; justify-content: space-between; align-items: center; gap: 1rem; font-size: 0.9rem; }
        .logistics-maintenance-item__unit { font-weight: 600; color: rgba(245, 250, 255, 0.88); }
        .logistics-maintenance-item__issue { flex: 1; color: rgba(229, 236, 255, 0.75); font-size: 0.85rem; }
        .logistics-maintenance-item__eta { color: rgba(245, 196, 109, 0.9); font-size: 0.85rem; font-weight: 600; }

        /* Alert banners */
        .logistics-alerts-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
        .logistics-alert-item { border-radius: 12px; padding: 0.75rem 1rem; font-size: 0.9rem; line-height: 1.4; font-weight: 600; }
        .logistics-alert-item--critical { background: rgba(255, 104, 104, 0.18); border: 1px solid rgba(255, 104, 104, 0.35); color: #ffd6d6; }
        .logistics-alert-item--warning { background: rgba(255, 196, 109, 0.18); border: 1px solid rgba(255, 196, 109, 0.35); color: #ffe3ba; }
        .logistics-alert-item--info { background: rgba(149, 190, 255, 0.15); border: 1px solid rgba(149, 190, 255, 0.3); color: #dfeaff; }

        .logistics-panel__empty { font-size: 0.9rem; color: rgba(229, 236, 255, 0.72); text-align: center; padding: 1rem; border-radius: 12px; border: 1px dashed rgba(229, 236, 255, 0.25); background: rgba(13, 20, 31, 0.6); }
      </style>
      <div id="logisticsPanel" class="logistics-panel" aria-live="polite">
        <section class="logistics-panel__section">
          <header class="logistics-panel__header">
            <h3>Supply Sources</h3>
            <p>Base camps and headquarters supplying frontline units.</p>
          </header>
          <div class="logistics-sources-grid" data-logistics-sources></div>
        </section>
        <section class="logistics-panel__section">
          <header class="logistics-panel__header">
            <h3>Stockpile Summary</h3>
            <p>Current resource levels and consumption trends.</p>
          </header>
          <div class="logistics-stockpiles-grid" data-logistics-stockpiles></div>
        </section>
        <section class="logistics-panel__section">
          <header class="logistics-panel__header">
            <h3>Convoy Status</h3>
            <p>Active supply routes and estimated delivery times.</p>
          </header>
          <ul class="logistics-convoy-list" data-logistics-convoys></ul>
        </section>
        <section class="logistics-panel__section">
          <header class="logistics-panel__header">
            <h3>Delay Nodes</h3>
            <p>Chokepoints causing supply delivery slowdowns.</p>
          </header>
          <ul class="logistics-delays-list" data-logistics-delays></ul>
        </section>
        <section class="logistics-panel__section">
          <header class="logistics-panel__header">
            <h3>Maintenance Backlog</h3>
            <p>Units requiring repair, refuel, or resupply.</p>
          </header>
          <ul class="logistics-maintenance-list" data-logistics-maintenance></ul>
        </section>
        <section class="logistics-panel__section">
          <header class="logistics-panel__header">
            <h3>Alerts</h3>
            <p>Critical logistics notifications.</p>
          </header>
          <ul class="logistics-alerts-list" data-logistics-alerts></ul>
        </section>
      </div>
    `
  },
  {
    key: "supplies",
    title: "Supplies",
    body: `
      <style>
        /* Layout the supplies panel as a responsive grid so commanders get a clear at-a-glance summary. */
        .supplies-panel { display: grid; gap: 1.5rem; padding: 0.75rem 0; }
        .supplies-panel__section { display: grid; gap: 0.75rem; }
        .supplies-panel__header h3 { margin: 0; font-size: 1rem; letter-spacing: 0.08em; text-transform: uppercase; }
        .supplies-panel__header p { margin: 0; font-size: 0.85rem; color: rgba(229, 236, 255, 0.72); }

        /* Faction toggle keeps commanders aware of which supply ledger is in view. */
        .supplies-panel__controls { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .supplies-faction-button { border: 1px solid rgba(229, 236, 255, 0.18); background: rgba(17, 24, 36, 0.75); color: #f5f7ff; border-radius: 999px; padding: 0.4rem 0.95rem; font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; transition: background 0.2s ease, border-color 0.2s ease; }
        .supplies-faction-button:is(:hover, :focus-visible) { border-color: rgba(245, 196, 109, 0.6); color: #ffe9c7; }
        .supplies-faction-button.is-active { background: rgba(245, 196, 109, 0.22); border-color: rgba(245, 196, 109, 0.55); color: #ffe9c7; }
        .supplies-faction-button:disabled { opacity: 0.6; cursor: not-allowed; }

        /* Overview figures use a compact inline layout to surface turn/phase context quickly. */
        .supplies-overview { display: flex; flex-wrap: wrap; gap: 0.75rem 1.25rem; font-size: 0.95rem; }
        .supplies-overview strong { letter-spacing: 0.05em; text-transform: uppercase; }

        /* Category cards rely on a responsive grid that collapses gracefully on narrow viewports. */
        .supplies-category-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        .supplies-card { border-radius: 16px; border: 1px solid rgba(229, 236, 255, 0.18); background: rgba(17, 24, 36, 0.85); padding: 1rem 1.25rem; display: grid; gap: 0.75rem; }
        .supplies-card__header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
        .supplies-card__header h4 { margin: 0; font-size: 1rem; letter-spacing: 0.06em; text-transform: uppercase; }
        .supplies-card__status { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 999px; padding: 0.25rem 0.65rem; }
        .supplies-card__status--critical { background: rgba(255, 104, 104, 0.2); color: #ffd6d6; border: 1px solid rgba(255, 104, 104, 0.4); }
        .supplies-card__status--warning { background: rgba(255, 196, 109, 0.2); color: #ffe5c4; border: 1px solid rgba(255, 196, 109, 0.4); }
        .supplies-card__status--stable { background: rgba(149, 190, 255, 0.18); color: #dfeaff; border: 1px solid rgba(149, 190, 255, 0.35); }
        .supplies-card__status--unknown { background: rgba(160, 160, 160, 0.18); color: #f5f5f5; border: 1px solid rgba(160, 160, 160, 0.35); }

        /* Gauge bars visualize frontline/reserve distribution with color-coded segments. */
        .supplies-card__gauge { position: relative; display: flex; height: 10px; border-radius: 6px; overflow: hidden; background: rgba(229, 236, 255, 0.15); }
        .supplies-card__gauge-bar { display: block; height: 100%; }
        .supplies-card__gauge-bar--frontline { background: linear-gradient(90deg, rgba(245, 196, 109, 0.9), rgba(255, 177, 80, 0.9)); }
        .supplies-card__gauge-bar--reserve { background: linear-gradient(90deg, rgba(149, 190, 255, 0.9), rgba(116, 166, 255, 0.9)); }
        .supplies-card__gauge-bar--buffer { background: rgba(229, 236, 255, 0.25); }
        .supplies-card__gauge-bar--empty { background: rgba(229, 236, 255, 0.2); }
        .supplies-card__gauge-legend { margin: 0; font-size: 0.8rem; color: rgba(229, 236, 255, 0.72); }

        .supplies-card__metrics { display: grid; gap: 0.5rem 1.25rem; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); font-size: 0.85rem; }
        .supplies-card__metrics dt { margin: 0; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(229, 236, 255, 0.72); }
        .supplies-card__metrics dd { margin: 0; font-size: 1rem; color: rgba(245, 247, 255, 0.92); }

        /* Alert list surfaces critical notifications prominently with severity colors. */
        .supplies-alerts { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
        .supplies-alerts__item { border-radius: 12px; padding: 0.75rem 1rem; font-size: 0.9rem; line-height: 1.4; }
        .supplies-alerts__item--critical { background: rgba(255, 104, 104, 0.18); border: 1px solid rgba(255, 104, 104, 0.35); color: #ffd6d6; }
        .supplies-alerts__item--warning { background: rgba(255, 196, 109, 0.18); border: 1px solid rgba(255, 196, 109, 0.35); color: #ffe3ba; }
        .supplies-alerts__item--info { background: rgba(149, 190, 255, 0.15); border: 1px solid rgba(149, 190, 255, 0.3); color: #dfeaff; }
        .supplies-alerts__empty { text-align: center; font-size: 0.9rem; color: rgba(229, 236, 255, 0.65); }

        /* Trend rows show per-resource history so planners can trace consumption over time. */
        .supplies-trend { display: grid; gap: 1rem; }
        .supplies-trend__series { border-radius: 12px; border: 1px solid rgba(229, 236, 255, 0.12); background: rgba(14, 20, 31, 0.8); padding: 0.9rem 1.1rem; display: grid; gap: 0.6rem; }
        .supplies-trend__series h5 { margin: 0; font-size: 0.9rem; letter-spacing: 0.06em; text-transform: uppercase; }
        .supplies-trend__points { display: flex; gap: 0.5rem; font-size: 0.9rem; color: rgba(229, 236, 255, 0.82); }

        /* Ledger entries surface supply inflow/outflow history for quick auditing. */
        .supplies-ledger { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; font-size: 0.85rem; }
        .supplies-ledger__entry { display: grid; gap: 0.4rem; border-radius: 12px; border: 1px solid rgba(229, 236, 255, 0.12); background: rgba(14, 20, 31, 0.75); padding: 0.75rem 0.9rem; }
        .supplies-ledger__entry > span { display: inline-block; }
        .supplies-ledger__delta { font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; }
        .supplies-ledger__delta--positive { color: #6ee7a9; }
        .supplies-ledger__delta--negative { color: #ff9696; }
        .supplies-ledger__resource { color: rgba(229, 236, 255, 0.78); }
        .supplies-ledger__reason { color: rgba(229, 236, 255, 0.65); }
        .supplies-ledger__timestamp { font-size: 0.75rem; color: rgba(229, 236, 255, 0.55); }
        .supplies-ledger__empty { text-align: center; font-size: 0.85rem; color: rgba(229, 236, 255, 0.6); border-radius: 12px; border: 1px dashed rgba(229, 236, 255, 0.18); padding: 0.75rem; background: rgba(14, 20, 31, 0.5); }

        .supplies-panel__empty { font-size: 0.9rem; color: rgba(229, 236, 255, 0.72); text-align: center; padding: 1rem; border-radius: 12px; border: 1px dashed rgba(229, 236, 255, 0.25); background: rgba(13, 20, 31, 0.6); }
      </style>
      <div id="suppliesPanel" class="supplies-panel" aria-live="polite">
        <section class="supplies-panel__section" data-supplies-overview-section>
          <header class="supplies-panel__header">
            <h3>Overview</h3>
            <p>Turn context and phase.</p>
          </header>
          <div class="supplies-panel__controls" data-supplies-faction-controls role="group" aria-label="Supply ledger faction">
            <button type="button" class="supplies-faction-button is-active" data-supplies-faction="Player">Our Forces</button>
            <button type="button" class="supplies-faction-button" data-supplies-faction="Bot" disabled>Enemy Estimates</button>
          </div>
          <div data-supplies-overview></div>
        </section>
        <section class="supplies-panel__section" data-supplies-category-section>
          <header class="supplies-panel__header">
            <h3>Resource Breakdown</h3>
            <p>Totals, burn rate, and depletion outlook.</p>
          </header>
          <div class="supplies-category-grid" data-supplies-category-grid></div>
        </section>
        <section class="supplies-panel__section" data-supplies-alerts-section>
          <header class="supplies-panel__header">
            <h3>Alerts</h3>
            <p>Critical notifications.</p>
          </header>
          <ul class="supplies-alerts" data-supplies-alerts></ul>
        </section>
        <section class="supplies-panel__section" data-supplies-trend-section>
          <header class="supplies-panel__header">
            <h3>Recent Trend</h3>
            <p>Last turns by resource.</p>
          </header>
          <div class="supplies-trend" data-supplies-trend></div>
        </section>
        <section class="supplies-panel__section" data-supplies-ledger-section>
          <header class="supplies-panel__header">
            <h3>Ledger</h3>
            <p>Production, shipments, and upkeep history.</p>
          </header>
          <ul class="supplies-ledger" data-supplies-ledger></ul>
        </section>
      </div>
    `
  },
  {
    key: "support",
    title: "Support Command",
    body: `
      <div class="popup-section">
        <h3>Support Capability Board</h3>
        <div id="supportPanel" class="support-panel" aria-live="polite">
          <section class="support-panel__section" data-support-section="ready">
            <header class="support-panel__header">
              <h4>Ready</h4>
              <p>Assets that can deploy immediately.</p>
            </header>
            <div id="supportPanelReady" class="support-panel__cards"></div>
          </section>
          <section class="support-panel__section" data-support-section="queued">
            <header class="support-panel__header">
              <h4>Queued</h4>
              <p>Orders waiting to execute.</p>
            </header>
            <div id="supportPanelQueued" class="support-panel__cards"></div>
          </section>
          <section class="support-panel__section" data-support-section="cooldown">
            <header class="support-panel__header">
              <h4>Cooldown</h4>
              <p>Assets recovering after deployment.</p>
            </header>
            <div id="supportPanelCooldown" class="support-panel__cards"></div>
          </section>
          <section class="support-panel__section" data-support-section="maintenance">
            <header class="support-panel__header">
              <h4>Maintenance</h4>
              <p>Assets requiring resupply or repair.</p>
            </header>
            <div id="supportPanelMaintenance" class="support-panel__cards"></div>
          </section>
        </div>
      </div>
    `
  },
  {
    key: "armyRoster",
    title: "Army Roster",
    body: `
      <div class="popup-section">
        <h3>Deployed Forces</h3>
        <div id="armyRosterContent">
          <!-- Army roster will be dynamically populated here -->
        </div>
      </div>
    `
  },
  {
    key: "generalProfile",
    title: "Commanding Officer",
    body: `
      <article id="generalProfileContent" class="general-profile" aria-labelledby="generalProfileHeading">
        <header class="general-profile__header">
          <div id="generalProfilePortrait" class="general-profile__portrait" role="img" aria-label="Commander portrait"></div>
          <div class="general-profile__identity">
            <h3 id="generalProfileHeading">Commander Overview</h3>
            <p id="generalProfileSummary" class="general-profile__summary"></p>
          </div>
          <dl id="generalProfileStats" class="general-profile__stats" aria-label="Command modifiers"></dl>
        </header>
        <section class="general-profile__section" aria-labelledby="generalProfileTraitsHeading">
          <h4 id="generalProfileTraitsHeading">Command Traits</h4>
          <ul id="generalProfileTraits" class="general-profile__traits" role="list"></ul>
        </section>
        <section class="general-profile__section" aria-labelledby="generalProfileDirectivesHeading">
          <h4 id="generalProfileDirectivesHeading">Active Directives</h4>
          <ol id="generalProfileDirectives" class="general-profile__directives"></ol>
        </section>
        <section class="general-profile__section" aria-labelledby="generalProfileHistoryHeading">
          <h4 id="generalProfileHistoryHeading">Service Notes</h4>
          <div id="generalProfileHistory" class="general-profile__history"></div>
        </section>
      </article>
    `
  }
];

/**
 * Get popup content by key.
 * Searches the registry for a matching popup definition.
 * @param key - Popup key identifier
 * @returns Popup content definition or null if not found
 */
export function getPopupContent(key: PopupKey): PopupContentDefinition | null {
  return popupContentRegistry.find(p => p.key === key) ?? null;
}

/**
 * Check if a popup key has registered content.
 * @param key - Popup key to check
 * @returns True if content exists in registry
 */
export function hasPopupContent(key: PopupKey): boolean {
  return popupContentRegistry.some(p => p.key === key);
}

/**
 * Get all available popup keys from the registry.
 * Useful for validation and debugging.
 * @returns Array of popup keys
 */
export function getAvailablePopupKeys(): PopupKey[] {
  return popupContentRegistry.map(p => p.key);
}
