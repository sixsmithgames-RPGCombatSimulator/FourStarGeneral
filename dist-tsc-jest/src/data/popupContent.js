/**
 * Popup content registry.
 * Maps popup keys to their display content (title and body HTML).
 * PopupManager reads from this registry to render popup dialogs.
 */
export const popupContentRegistry = [
    {
        key: "airSupport",
        title: "Air Support",
        body: `
      <style>
        .air-panel { display: grid; gap: 0.8rem; color: #efe6c9; padding: 0.08rem 0 0.35rem; }
        .air-briefing {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.8rem 1rem;
          align-items: end;
          padding: 0.9rem 1rem;
          border-radius: 18px;
          border: 1px solid rgba(170, 145, 94, 0.24);
          background:
            radial-gradient(circle at top right, rgba(124, 101, 51, 0.18), transparent 42%),
            linear-gradient(180deg, rgba(30, 33, 23, 0.96) 0%, rgba(14, 16, 12, 0.985) 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
          overflow: hidden;
        }
        .air-briefing::before {
          content: "Theater Air Command";
          grid-column: 1 / -1;
          display: block;
          font-family: var(--font-label);
          font-size: 0.56rem;
          font-weight: 700;
          letter-spacing: 0.28em;
          text-transform: uppercase;
          color: rgba(226, 205, 154, 0.72);
        }
        .air-briefing__copy {
          display: grid;
          gap: 0.28rem;
          min-width: 0;
        }
        .air-briefing__copy h3 {
          margin: 0;
          font-family: var(--font-heading);
          font-size: 1.04rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          line-height: 1.05;
          color: #efe3bf;
        }
        .air-briefing__copy p {
          margin: 0;
          max-width: 54ch;
          color: var(--text-secondary);
          font-size: 0.8rem;
          line-height: 1.45;
        }
        .air-readiness-board {
          display: grid;
          gap: 0.28rem;
          min-width: min(310px, 100%);
          justify-items: end;
        }
        .air-readiness-board__label {
          font-family: var(--font-heading);
          font-size: 0.84rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #efe3bf;
        }
        .air-section {
          display: grid;
          gap: 0.65rem;
          padding: 0.95rem 1rem;
          border-radius: 16px;
          border: 1px solid rgba(170, 145, 94, 0.18);
          background: linear-gradient(180deg, rgba(16, 19, 14, 0.96) 0%, rgba(10, 12, 9, 0.98) 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
        }
        .air-section header {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.2rem 0.8rem;
          align-items: end;
        }
        .air-section h3 {
          margin: 0;
          font-family: var(--font-heading);
          font-size: 0.96rem;
          letter-spacing: 0.09em;
          text-transform: uppercase;
          color: #efe3bf;
        }
        .air-note {
          margin: 0;
          font-family: var(--font-label);
          font-size: 0.63rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(216, 199, 157, 0.72);
        }
        .air-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(72px, 1fr));
          gap: 0.38rem;
        }
        .air-chip {
          display: grid;
          gap: 0.12rem;
          min-height: 0;
          align-content: center;
          text-align: center;
          padding: 0.42rem 0.5rem;
          border-radius: 12px;
          border: 1px solid rgba(170, 145, 94, 0.16);
          background:
            linear-gradient(180deg, rgba(27, 24, 17, 0.96) 0%, rgba(13, 12, 9, 0.98) 100%);
        }
        .air-chip strong {
          font-family: var(--font-heading);
          font-size: 0.98rem;
          letter-spacing: 0.05em;
          color: #f2e8c7;
        }
        .air-chip span {
          font-family: var(--font-label);
          font-size: 0.5rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(216, 199, 157, 0.74);
        }
        .air-orders-shell {
          display: grid;
          gap: 0.55rem;
          padding: 0.9rem 1rem 0.95rem;
          border-radius: 16px;
          border: 1px solid rgba(170, 145, 94, 0.18);
          background: linear-gradient(180deg, rgba(15, 18, 13, 0.96) 0%, rgba(9, 11, 9, 0.985) 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
        }
        .air-orders-header {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 0.55rem 0.9rem;
          align-items: center;
        }
        .air-orders-title {
          margin: 0;
          font-family: var(--font-heading);
          font-size: 0.96rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #efe3bf;
          white-space: nowrap;
        }
        .air-actions {
          display: flex;
          gap: 0.45rem;
          flex-wrap: wrap;
          justify-content: flex-end;
        }
        .air-mission-tabs {
          display: flex;
          flex-wrap: wrap;
          gap: 0.28rem;
        }
        .air-mission-tab {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 2.2rem;
          padding: 0.35rem 0.72rem;
          border-radius: 12px;
          border: 1px solid rgba(170, 145, 94, 0.2);
          background: linear-gradient(180deg, rgba(22, 25, 18, 0.96) 0%, rgba(11, 13, 10, 0.98) 100%);
          color: #efe3bf;
          text-align: center;
          cursor: pointer;
          transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease, box-shadow 0.15s ease;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
        }
        .air-mission-tab:hover,
        .air-mission-tab:focus-visible {
          outline: none;
          border-color: rgba(232, 197, 123, 0.52);
          transform: translateY(-1px);
        }
        .air-mission-tab[aria-selected="true"] {
          border-color: rgba(222, 192, 123, 0.54);
          background:
            radial-gradient(circle at top right, rgba(191, 154, 73, 0.18), transparent 42%),
            linear-gradient(180deg, rgba(71, 59, 30, 0.96) 0%, rgba(33, 28, 14, 0.98) 100%);
          box-shadow: 0 0 0 1px rgba(222, 192, 123, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .air-mission-tab:disabled {
          opacity: 0.45;
          cursor: not-allowed;
          transform: none;
        }
        .air-mission-tab strong {
          font-family: var(--font-heading);
          font-size: 0.74rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          line-height: 1.2;
        }
        .air-mission-tab span {
          display: none;
        }
        .air-sortie-board {
          display: grid;
          gap: 0.68rem;
          max-height: 31rem;
          overflow-y: auto;
          padding-right: 0.18rem;
        }
        .air-sortie-row {
          display: grid;
          grid-template-columns: minmax(240px, 0.92fr) minmax(0, 1.08fr);
          gap: 0.68rem;
          align-items: stretch;
        }
        .air-squadron-card,
        .air-target-choice {
          width: 100%;
          border: 1px solid rgba(170, 145, 94, 0.18);
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(21, 20, 14, 0.94) 0%, rgba(10, 11, 9, 0.98) 100%);
          color: #efe3bf;
          text-align: left;
          transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
        }
        .air-squadron-card {
          display: grid;
          grid-template-columns: 3.9rem minmax(0, 1fr);
          align-items: stretch;
          gap: 0.55rem;
          padding: 0.68rem 0.72rem;
          cursor: pointer;
        }
        .air-squadron-card--row {
          height: 100%;
        }
        .air-squadron-card:hover,
        .air-squadron-card:focus-visible,
        .air-target-choice:hover,
        .air-target-choice:focus-visible {
          outline: none;
          border-color: rgba(222, 192, 123, 0.4);
          transform: translateY(-1px);
          box-shadow: 0 10px 18px rgba(0, 0, 0, 0.18);
        }
        .air-squadron-card[aria-pressed="true"],
        .air-target-choice[aria-pressed="true"] {
          border-color: rgba(222, 192, 123, 0.58);
          background:
            radial-gradient(circle at top right, rgba(191, 154, 73, 0.16), transparent 44%),
            linear-gradient(180deg, rgba(61, 50, 24, 0.96) 0%, rgba(24, 21, 11, 0.98) 100%);
          box-shadow: 0 0 0 1px rgba(222, 192, 123, 0.2), 0 12px 22px rgba(62, 48, 18, 0.22);
        }
        .air-squadron-card:disabled {
          opacity: 0.56;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }
        .air-squadron-card__visual {
          width: 3.9rem;
          height: 3.9rem;
          border-radius: 11px;
          border: 1px solid rgba(170, 145, 94, 0.16);
          background: rgba(17, 18, 13, 0.74);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .air-squadron-card__visual img {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
        .air-squadron-card__fallback {
          font-family: var(--font-heading);
          font-size: 0.84rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(239, 227, 191, 0.82);
        }
        .air-squadron-card__copy,
        .air-target-choice__copy {
          display: grid;
          gap: 0.22rem;
          min-width: 0;
          align-content: center;
        }
        .air-squadron-card__topline {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.35rem;
          align-items: start;
        }
        .air-squadron-card__label,
        .air-target-choice__label {
          font-family: var(--font-heading);
          font-size: 0.82rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          line-height: 1.2;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .air-squadron-card__meta {
          display: flex;
          gap: 0.28rem;
          flex-wrap: wrap;
        }
        .air-squadron-stat {
          display: inline-flex;
          align-items: center;
          padding: 0.08rem 0.4rem;
          border-radius: 999px;
          border: 1px solid rgba(170, 145, 94, 0.14);
          background: rgba(12, 14, 10, 0.52);
          font-family: var(--font-label);
          font-size: 0.56rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(226, 205, 154, 0.74);
        }
        .air-squadron-card__detail,
        .air-target-choice__detail,
        .air-target-choice__meta {
          font-size: 0.68rem;
          line-height: 1.36;
          color: var(--text-secondary);
        }
        .air-squadron-card__detail--quiet {
          color: rgba(205, 198, 177, 0.78);
        }
        .air-status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.14rem 0.48rem;
          border-radius: 999px;
          border: 1px solid rgba(170, 145, 94, 0.2);
          font-family: var(--font-label);
          font-size: 0.56rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          line-height: 1;
          white-space: nowrap;
          background: rgba(68, 58, 33, 0.18);
          color: #e4d5ab;
        }
        .air-status-pill--ready {
          border-color: rgba(118, 187, 128, 0.34);
          color: #a7ddb3;
          background: rgba(52, 88, 54, 0.18);
        }
        .air-status-pill--reserve {
          border-color: rgba(149, 190, 255, 0.3);
          color: #d3e3ff;
          background: rgba(37, 56, 88, 0.18);
        }
        .air-status-pill--queued {
          border-color: rgba(170, 145, 94, 0.34);
          color: #e4d5ab;
          background: rgba(88, 72, 36, 0.2);
        }
        .air-status-pill--inflight {
          border-color: rgba(124, 168, 199, 0.38);
          color: #b8d9ea;
          background: rgba(37, 63, 76, 0.22);
        }
        .air-status-pill--resolving {
          border-color: rgba(208, 175, 103, 0.34);
          color: #e9cf90;
          background: rgba(112, 89, 45, 0.2);
        }
        .air-target-card {
          display: grid;
          gap: 0.38rem;
          padding: 0.72rem 0.8rem;
          border-radius: 14px;
          border: 1px solid rgba(170, 145, 94, 0.18);
          background:
            radial-gradient(circle at top right, rgba(124, 101, 51, 0.16), transparent 42%),
            linear-gradient(180deg, rgba(20, 21, 15, 0.96) 0%, rgba(10, 11, 9, 0.98) 100%);
        }
        .air-target-card--row,
        .air-target-card--empty {
          height: 100%;
        }
        .air-target-card--committed {
          background:
            radial-gradient(circle at top right, rgba(106, 85, 44, 0.12), transparent 46%),
            linear-gradient(180deg, rgba(24, 22, 16, 0.96) 0%, rgba(12, 12, 9, 0.99) 100%);
        }
        .air-target-card__eyebrow {
          font-family: var(--font-label);
          font-size: 0.56rem;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: rgba(226, 205, 154, 0.7);
        }
        .air-target-card__title {
          font-family: var(--font-heading);
          font-size: 0.86rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          line-height: 1.2;
          color: #f2e8c7;
        }
        .air-target-card__detail {
          margin: 0;
          font-size: 0.71rem;
          line-height: 1.42;
          color: var(--text-secondary);
        }
        .air-target-card__footnote {
          font-size: 0.64rem;
          line-height: 1.35;
          color: rgba(216, 199, 157, 0.72);
        }
        .air-target-actions {
          display: flex;
          gap: 0.45rem;
          flex-wrap: wrap;
          align-items: center;
        }
        .air-button--assign {
          margin-left: auto;
        }
        .air-target-choice {
          display: grid;
          gap: 0.26rem;
          padding: 0.58rem 0.64rem;
          cursor: pointer;
        }
        .air-target-choice-grid {
          display: grid;
          gap: 0.45rem;
        }
        .air-target-choice-grid--row {
          grid-template-columns: repeat(auto-fit, minmax(145px, 1fr));
        }
        .air-target-choice__meta {
          font-family: var(--font-label);
          font-size: 0.58rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }
        .air-order-note {
          min-height: 0;
          font-size: 0.7rem;
          line-height: 1.35;
          color: var(--text-secondary);
        }
        .air-order-note[data-tone="warning"] {
          color: #e9cf90;
        }
        .air-order-note[data-tone="success"] {
          color: #a7ddb3;
        }
        .air-button {
          min-height: 2.35rem;
          padding: 0.48rem 0.86rem;
          border-radius: 12px;
          border: 1px solid rgba(170, 145, 94, 0.22);
          background: linear-gradient(180deg, rgba(20, 23, 17, 0.96) 0%, rgba(11, 13, 10, 0.98) 100%);
          color: #ded2ab;
          font-family: var(--font-label);
          font-size: 0.64rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          cursor: pointer;
          transition: transform 0.15s ease, border-color 0.15s ease, background 0.15s ease;
        }
        .air-button:hover,
        .air-button:focus-visible {
          outline: none;
          transform: translateY(-1px);
          border-color: rgba(232, 197, 123, 0.4);
        }
        .air-button.primary {
          border-color: rgba(170, 145, 94, 0.34);
          background: linear-gradient(180deg, rgba(97, 77, 38, 0.92) 0%, rgba(60, 49, 23, 0.96) 100%);
          color: #f7e7b7;
        }
        .air-mission-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: grid;
          gap: 0.7rem;
        }
        .air-mission-item {
          display: grid;
          gap: 0.65rem;
          padding: 0.8rem 0.9rem;
          border-radius: 14px;
          border: 1px solid rgba(170, 145, 94, 0.16);
          background: linear-gradient(180deg, rgba(22, 20, 14, 0.96) 0%, rgba(11, 12, 9, 0.98) 100%);
        }
        .air-mission-head {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.5rem;
          align-items: start;
        }
        .air-mission-title {
          display: grid;
          gap: 0.18rem;
          min-width: 0;
        }
        .air-mission-title strong {
          font-size: 0.9rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #f2e8c7;
        }
        .air-mission-subtitle {
          font-size: 0.73rem;
          color: var(--text-secondary);
        }
        .air-mission-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.45rem;
        }
        .air-mission-fact {
          display: grid;
          gap: 0.18rem;
          padding: 0.48rem 0.55rem;
          border-radius: 10px;
          border: 1px solid rgba(170, 145, 94, 0.12);
          background: rgba(11, 13, 10, 0.44);
        }
        .air-mission-label {
          font-family: var(--font-label);
          font-size: 0.55rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(216, 199, 157, 0.66);
        }
        .air-mission-fact strong {
          font-size: 0.74rem;
          line-height: 1.3;
          color: #efe3bf;
        }
        .air-mission-actions {
          display: flex;
          justify-content: flex-end;
        }
        .air-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.16rem 0.5rem;
          border-radius: 999px;
          border: 1px solid rgba(170, 145, 94, 0.22);
          font-family: var(--font-label);
          font-size: 0.58rem;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          line-height: 1;
          white-space: nowrap;
          color: #e4d5ab;
          background: rgba(68, 58, 33, 0.18);
        }
        .air-badge--queued {
          border-color: rgba(170, 145, 94, 0.34);
          color: #e4d5ab;
          background: rgba(88, 72, 36, 0.2);
        }
        .air-badge--inflight {
          border-color: rgba(124, 168, 199, 0.38);
          color: #b8d9ea;
          background: rgba(37, 63, 76, 0.22);
        }
        .air-badge--resolving {
          border-color: rgba(208, 175, 103, 0.34);
          color: #e9cf90;
          background: rgba(112, 89, 45, 0.2);
        }
        .air-badge--completed,
        .air-badge--success {
          border-color: rgba(118, 187, 128, 0.34);
          color: #a7ddb3;
          background: rgba(52, 88, 54, 0.18);
        }
        .air-badge--partial {
          border-color: rgba(208, 175, 103, 0.34);
          color: #e9cf90;
          background: rgba(112, 89, 45, 0.2);
        }
        .air-badge--aborted {
          border-color: rgba(214, 114, 116, 0.34);
          color: #ffabae;
          background: rgba(91, 39, 39, 0.2);
        }
        .air-mission-outcome {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
          padding-top: 0.5rem;
          border-top: 1px solid rgba(170, 145, 94, 0.1);
        }
        .air-outcome-details {
          font-size: 0.79rem;
          line-height: 1.45;
          color: var(--text-secondary);
        }
        .air-mission-empty {
          padding: 1rem 1.05rem;
          border-radius: 14px;
          border: 1px dashed rgba(170, 145, 94, 0.24);
          background: rgba(15, 18, 14, 0.82);
          color: var(--text-secondary);
          line-height: 1.5;
        }
        @media (max-width: 760px) {
          .air-briefing,
          .air-orders-header,
          .air-sortie-row,
          .air-section header,
          .air-mission-head {
            grid-template-columns: 1fr;
          }
          .air-summary,
          .air-mission-grid,
          .air-target-choice-grid--row {
            grid-template-columns: 1fr;
          }
          .air-readiness-board {
            min-width: 0;
            justify-items: stretch;
          }
          .air-sortie-board,
          .air-target-choice-grid {
            max-height: none;
          }
          .air-button--assign {
            margin-left: 0;
          }
        }
      </style>
      <div class="air-panel" data-air-panel>
        <section class="air-briefing">
          <div class="air-briefing__copy">
            <h3 data-air-brief-title>Standing Patrol Orders</h3>
            <p data-air-brief-text>Assign fighter cover, strike sorties, and emergency lifts from the sortie board. Air wings launch from reserve strips and recover off-map after each mission.</p>
          </div>
          <div class="air-readiness-board">
            <span class="air-readiness-board__label">Readiness Board</span>
            <div class="air-summary" data-air-summary>
              <div class="air-chip"><strong data-air-queued>0</strong><span>On Deck</span></div>
              <div class="air-chip"><strong data-air-inflight>0</strong><span>In Flight</span></div>
              <div class="air-chip"><strong data-air-refit>0</strong><span>Refit</span></div>
            </div>
          </div>
        </section>
        <section class="air-orders-shell">
          <div class="air-orders-header">
            <h3 class="air-orders-title">Sortie Orders</h3>
            <div class="air-mission-tabs" role="tablist" aria-label="Sortie mission types" data-air-mission-tabs></div>
          </div>
          <div class="air-order-note" data-air-order-note></div>
          <div class="air-sortie-board" data-air-sortie-board></div>
        </section>
        <section class="air-section">
          <header>
            <h3>Operations Log</h3>
            <div class="air-actions">
              <button type="button" class="air-button" data-air-refresh>Refresh Board</button>
            </div>
          </header>
          <ul class="air-mission-list" data-air-mission-list></ul>
        </section>
        <div class="sr-only air-feedback" aria-live="polite" data-air-feedback></div>
      </div>
    `
    },
    {
        key: "recon",
        title: "Reconnaissance",
        body: `
      <style>
        .recon-panel {
          display: grid;
          gap: 0.92rem;
          padding: 0.08rem 0 0.2rem;
        }
        .recon-briefing {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 0.75rem 1rem;
          align-items: end;
          padding: 0.9rem 1rem;
          border-radius: 16px;
          border: 1px solid rgba(170, 145, 94, 0.18);
          background:
            radial-gradient(circle at top right, rgba(126, 108, 59, 0.13), transparent 42%),
            linear-gradient(180deg, rgba(20, 23, 16, 0.97) 0%, rgba(10, 12, 9, 0.99) 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
        }
        .recon-briefing__copy {
          display: grid;
          gap: 0.28rem;
          min-width: 0;
        }
        .recon-briefing__copy h3 {
          margin: 0;
          font-family: var(--font-heading);
          font-size: 1.02rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          line-height: 1.05;
          color: #efe3bf;
        }
        .recon-briefing__copy p {
          margin: 0;
          max-width: 60ch;
          color: var(--text-secondary);
          font-size: 0.81rem;
          line-height: 1.45;
        }
        .recon-readiness-board {
          display: grid;
          gap: 0.28rem;
          min-width: min(310px, 100%);
          justify-items: end;
        }
        .recon-readiness-board__label {
          font-family: var(--font-heading);
          font-size: 0.84rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: #efe3bf;
        }
        .recon-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(72px, 1fr));
          gap: 0.38rem;
        }
        .recon-chip {
          display: grid;
          gap: 0.12rem;
          align-content: center;
          text-align: center;
          padding: 0.42rem 0.5rem;
          border-radius: 12px;
          border: 1px solid rgba(170, 145, 94, 0.16);
          background: linear-gradient(180deg, rgba(27, 24, 17, 0.96) 0%, rgba(13, 12, 9, 0.98) 100%);
        }
        .recon-chip strong {
          font-family: var(--font-heading);
          font-size: 0.98rem;
          letter-spacing: 0.05em;
          color: #f2e8c7;
        }
        .recon-chip span {
          font-family: var(--font-label);
          font-size: 0.5rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(216, 199, 157, 0.74);
        }
        .recon-orders-shell {
          display: grid;
          gap: 0.62rem;
          padding: 0.92rem 1rem 0.98rem;
          border-radius: 16px;
          border: 1px solid rgba(170, 145, 94, 0.18);
          background: linear-gradient(180deg, rgba(15, 18, 13, 0.96) 0%, rgba(9, 11, 9, 0.985) 100%);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
        }
        .recon-orders-header {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 0.45rem 0.9rem;
          align-items: center;
        }
        .recon-orders-title {
          margin: 0;
          font-family: var(--font-heading);
          font-size: 0.96rem;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: #efe3bf;
          white-space: nowrap;
        }
        .recon-order-note {
          justify-self: end;
          font-family: var(--font-label);
          font-size: 0.62rem;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: rgba(216, 199, 157, 0.72);
          text-align: right;
        }
        .recon-report-board {
          display: grid;
          gap: 0.68rem;
          max-height: 32rem;
          overflow-y: auto;
          padding-right: 0.18rem;
        }
        .recon-row {
          display: grid;
          grid-template-columns: minmax(240px, 0.92fr) minmax(0, 1.08fr);
          gap: 0.68rem;
          align-items: stretch;
        }
        .recon-observer-card,
        .recon-target-card {
          border: 1px solid rgba(170, 145, 94, 0.18);
          border-radius: 14px;
          background: linear-gradient(180deg, rgba(21, 20, 14, 0.94) 0%, rgba(10, 11, 9, 0.98) 100%);
          color: #efe3bf;
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.02);
        }
        .recon-observer-card {
          display: grid;
          grid-template-columns: 3.9rem minmax(0, 1fr);
          gap: 0.55rem;
          align-items: stretch;
          padding: 0.68rem 0.72rem;
        }
        .recon-observer-card__visual {
          display: grid;
          place-items: center;
          min-height: 5rem;
          border-radius: 12px;
          background: linear-gradient(180deg, rgba(44, 40, 28, 0.9) 0%, rgba(21, 22, 17, 0.96) 100%);
          border: 1px solid rgba(170, 145, 94, 0.14);
          overflow: hidden;
        }
        .recon-observer-card__visual img {
          width: 82%;
          height: auto;
          object-fit: contain;
          filter: saturate(0.92);
        }
        .recon-observer-card__fallback {
          font-family: var(--font-heading);
          font-size: 1rem;
          letter-spacing: 0.08em;
          color: rgba(239, 227, 191, 0.88);
        }
        .recon-observer-card__copy {
          display: grid;
          gap: 0.28rem;
          min-width: 0;
          align-content: center;
        }
        .recon-observer-card__topline {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.55rem;
          flex-wrap: wrap;
        }
        .recon-observer-card__label {
          font-family: var(--font-heading);
          font-size: 0.82rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #f2e8c7;
        }
        .recon-status-pill {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 1.32rem;
          padding: 0.12rem 0.55rem;
          border-radius: 999px;
          border: 1px solid rgba(170, 145, 94, 0.22);
          background: rgba(26, 25, 18, 0.88);
          font-family: var(--font-label);
          font-size: 0.58rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: rgba(216, 199, 157, 0.86);
        }
        .recon-status-pill--contact {
          border-color: rgba(122, 214, 170, 0.34);
          background: rgba(21, 45, 31, 0.78);
          color: #c8efd4;
        }
        .recon-status-pill--watching {
          border-color: rgba(170, 145, 94, 0.22);
          color: rgba(216, 199, 157, 0.82);
        }
        .recon-observer-card__meta {
          display: flex;
          flex-wrap: wrap;
          gap: 0.3rem 0.35rem;
        }
        .recon-observer-stat {
          display: inline-flex;
          align-items: center;
          min-height: 1.2rem;
          padding: 0.12rem 0.45rem;
          border-radius: 999px;
          background: rgba(14, 16, 12, 0.76);
          border: 1px solid rgba(170, 145, 94, 0.12);
          font-size: 0.68rem;
          color: rgba(228, 220, 195, 0.84);
        }
        .recon-observer-card__detail {
          font-size: 0.77rem;
          line-height: 1.4;
          color: rgba(228, 220, 195, 0.78);
        }
        .recon-target-card {
          display: grid;
          gap: 0.48rem;
          padding: 0.76rem 0.84rem;
          align-content: start;
        }
        .recon-target-card--quiet {
          background: linear-gradient(180deg, rgba(18, 19, 14, 0.94) 0%, rgba(10, 11, 9, 0.98) 100%);
        }
        .recon-target-card__eyebrow {
          font-family: var(--font-label);
          font-size: 0.56rem;
          font-weight: 700;
          letter-spacing: 0.24em;
          text-transform: uppercase;
          color: rgba(226, 205, 154, 0.72);
        }
        .recon-target-card__title {
          margin: 0;
          font-family: var(--font-heading);
          font-size: 0.96rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #f2e8c7;
        }
        .recon-target-card__detail {
          margin: 0;
          color: rgba(228, 220, 195, 0.78);
          font-size: 0.79rem;
          line-height: 1.45;
        }
        .recon-contact-list {
          display: grid;
          gap: 0.45rem;
        }
        .recon-contact-item {
          display: grid;
          gap: 0.18rem;
          padding: 0.5rem 0.58rem;
          border-radius: 12px;
          border: 1px solid rgba(170, 145, 94, 0.12);
          background: rgba(11, 13, 10, 0.74);
        }
        .recon-contact-item__header {
          display: flex;
          align-items: center;
          gap: 0.34rem;
          flex-wrap: wrap;
        }
        .recon-contact-item__header strong {
          font-family: var(--font-heading);
          font-size: 0.72rem;
          letter-spacing: 0.07em;
          text-transform: uppercase;
          color: #f0e5c1;
        }
        .recon-contact-item__meta {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          font-size: 0.7rem;
          color: rgba(220, 210, 180, 0.74);
        }
        .recon-contact-pill {
          display: inline-flex;
          align-items: center;
          min-height: 1.14rem;
          padding: 0.08rem 0.42rem;
          border-radius: 999px;
          border: 1px solid rgba(170, 145, 94, 0.18);
          background: rgba(24, 24, 18, 0.84);
          font-family: var(--font-label);
          font-size: 0.54rem;
          letter-spacing: 0.11em;
          text-transform: uppercase;
          color: rgba(216, 199, 157, 0.82);
        }
        .recon-contact-pill--activity {
          border-color: rgba(122, 214, 170, 0.28);
          color: #c8efd4;
        }
        .recon-report-empty {
          font-size: 0.9rem;
          color: rgba(229, 236, 255, 0.72);
          text-align: center;
          padding: 1.25rem;
          border: 1px dashed rgba(170, 145, 94, 0.2);
          border-radius: 12px;
          background: rgba(12, 16, 25, 0.42);
        }
        @media (max-width: 880px) {
          .recon-briefing {
            grid-template-columns: minmax(0, 1fr);
          }
          .recon-readiness-board {
            justify-items: start;
            min-width: 0;
          }
          .recon-orders-header {
            grid-template-columns: minmax(0, 1fr);
          }
          .recon-order-note {
            justify-self: start;
            text-align: left;
          }
          .recon-row {
            grid-template-columns: minmax(0, 1fr);
          }
          .recon-report-board {
            max-height: none;
          }
        }
      </style>
      <div class="recon-panel" data-recon-panel>
        <section class="recon-briefing">
          <div class="recon-briefing__copy">
            <h3>Observation Net</h3>
            <p>Reports only what your recon formations can currently see. Deception screens, disputed briefs, and analyst interpretation stay in Intelligence.</p>
          </div>
          <div class="recon-readiness-board">
            <span class="recon-readiness-board__label">Field Screen</span>
            <div class="recon-summary">
              <div class="recon-chip"><strong data-recon-observers>0</strong><span>Observers</span></div>
              <div class="recon-chip"><strong data-recon-active>0</strong><span>With Contact</span></div>
              <div class="recon-chip"><strong data-recon-contacts>0</strong><span>Contacts</span></div>
            </div>
          </div>
        </section>
        <section class="recon-orders-shell">
          <div class="recon-orders-header">
            <h3 class="recon-orders-title">Observation Board</h3>
            <div class="recon-order-note">Current line-of-sight reports only</div>
          </div>
          <div class="recon-report-board" data-recon-report-list></div>
        </section>
      </div>
    `
    },
    {
        key: "intelligence",
        title: "Intelligence",
        body: `
      <style>
        .intel-panel { display: grid; gap: 1.1rem; padding: 0.35rem 0 0.75rem; }
        .intel-alert { border-radius: 12px; padding: 1rem 1.25rem; font-weight: 600; display: grid; gap: 0.35rem; }
        .intel-alert[data-severity="critical"] { background: rgba(255, 104, 104, 0.15); border: 1px solid rgba(255, 104, 104, 0.4); color: #ffebeb; }
        .intel-alert[data-severity="warning"] { background: rgba(255, 196, 109, 0.15); border: 1px solid rgba(255, 196, 109, 0.35); color: #ffe9c7; }
        .intel-alert[data-severity="info"] { background: rgba(149, 190, 255, 0.12); border: 1px solid rgba(149, 190, 255, 0.32); color: #e2ecff; }
        .intel-command { display: grid; gap: 0.9rem; border-radius: 16px; border: 1px solid rgba(229, 236, 255, 0.12); background: linear-gradient(135deg, rgba(18, 25, 38, 0.94), rgba(12, 17, 26, 0.9)); padding: 1rem 1.05rem; }
        .intel-command__header { display: grid; gap: 0.3rem; }
        .intel-command__header h4 { margin: 0; letter-spacing: 0.08em; text-transform: uppercase; font-size: 0.95rem; }
        .intel-command__header p { margin: 0; color: rgba(229, 236, 255, 0.72); font-size: 0.84rem; line-height: 1.45; }
        .intel-command__grid { display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
        .intel-command-card { display: grid; gap: 0.3rem; border-radius: 14px; border: 1px solid rgba(229, 236, 255, 0.12); background: rgba(10, 15, 24, 0.76); padding: 0.85rem 0.9rem; }
        .intel-command-card span { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(229, 236, 255, 0.62); }
        .intel-command-card strong { font-size: 1.1rem; color: rgba(245, 247, 255, 0.96); }
        .intel-command-card p { margin: 0; color: rgba(229, 236, 255, 0.76); font-size: 0.82rem; line-height: 1.45; }
        .intel-command__actions { display: flex; flex-wrap: wrap; gap: 0.7rem; align-items: center; }
        .intel-action-button { border: 1px solid rgba(245, 196, 109, 0.42); background: rgba(245, 196, 109, 0.16); color: #fff4db; border-radius: 999px; padding: 0.55rem 0.95rem; font-size: 0.88rem; font-weight: 600; cursor: pointer; transition: border-color 0.2s ease, background 0.2s ease, transform 0.2s ease; }
        .intel-action-button:hover { background: rgba(245, 196, 109, 0.24); border-color: rgba(245, 196, 109, 0.6); transform: translateY(-1px); }
        .intel-feedback { flex: 1 1 260px; min-height: 1.2rem; color: rgba(229, 236, 255, 0.78); font-size: 0.82rem; line-height: 1.45; }
        .intel-ops { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }
        .intel-operation-card { border-radius: 14px; border: 1px solid rgba(149, 190, 255, 0.22); background: rgba(12, 18, 29, 0.72); padding: 0.85rem 0.95rem; display: grid; gap: 0.45rem; }
        .intel-operation-card header { display: flex; justify-content: space-between; gap: 0.75rem; align-items: center; }
        .intel-controls { display: flex; flex-wrap: wrap; gap: 0.75rem 1rem; }
        .intel-filter-group { display: flex; align-items: center; gap: 0.65rem; flex-wrap: wrap; }
        .intel-filter-group label { font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(229, 236, 255, 0.75); }
        .intel-filter { border: 1px solid rgba(229, 236, 255, 0.18); background: rgba(17, 24, 36, 0.75); color: #f5f7ff; border-radius: 999px; padding: 0.35rem 0.9rem; font-size: 0.9rem; cursor: pointer; transition: background 0.2s ease, border-color 0.2s ease; }
        .intel-filter.is-active { background: rgba(245, 196, 109, 0.25); border-color: rgba(245, 196, 109, 0.5); }
        .intel-briefs { display: grid; gap: 1rem; }
        .intel-briefs header { display: grid; gap: 0.25rem; }
        .intel-briefs header h4 { margin: 0; letter-spacing: 0.08em; text-transform: uppercase; font-size: 1rem; }
        .intel-briefs header p { margin: 0; color: rgba(229, 236, 255, 0.68); font-size: 0.9rem; line-height: 1.4; }
        .intel-briefs__list { display: grid; gap: 0.9rem; }
        .intel-card { border-radius: 14px; border: 1px solid rgba(229, 236, 255, 0.15); background: rgba(14, 18, 28, 0.85); padding: 0.95rem 1rem; display: grid; gap: 0.55rem; transition: border-color 0.2s ease, box-shadow 0.2s ease; }
        .intel-card:hover, .intel-card:focus-within { border-color: rgba(245, 196, 109, 0.6); box-shadow: 0 12px 30px rgba(245, 196, 109, 0.16); }
        .intel-card strong { letter-spacing: 0.06em; text-transform: uppercase; font-size: 0.95rem; }
        .intel-card__header { display: flex; justify-content: space-between; gap: 0.85rem; align-items: flex-start; }
        .intel-card__title-group { display: grid; gap: 0.4rem; }
        .intel-card .meta-line { font-size: 0.8rem; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(229, 236, 255, 0.65); display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .intel-card .meta-pill { border: 1px solid rgba(229, 236, 255, 0.24); border-radius: 999px; padding: 0.2rem 0.55rem; font-size: 0.78rem; }
        .intel-card .meta-pill--status { border-color: rgba(245, 196, 109, 0.32); color: rgba(255, 236, 194, 0.9); }
        .intel-card .body { color: rgba(245, 250, 255, 0.82); line-height: 1.5; font-size: 0.95rem; }
        .intel-card .body[data-confidence="low"] { filter: blur(1px); opacity: 0.72; }
        .intel-card--suspected-false { border-color: rgba(255, 196, 109, 0.32); }
        .intel-card--confirmed-false { border-color: rgba(255, 104, 104, 0.36); background: rgba(36, 16, 18, 0.82); }
        .intel-card--verified { border-color: rgba(122, 214, 170, 0.32); }
        .intel-verify-button { border: 1px solid rgba(149, 190, 255, 0.28); background: rgba(149, 190, 255, 0.14); color: #edf3ff; border-radius: 999px; padding: 0.45rem 0.85rem; font-size: 0.82rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
        .intel-verify-button.is-disabled, .intel-verify-button:disabled { opacity: 0.55; cursor: default; }
        .intel-empty { font-size: 0.95rem; color: rgba(229, 236, 255, 0.72); text-align: center; padding: 1.25rem; border: 1px dashed rgba(229, 236, 255, 0.2); border-radius: 12px; background: rgba(12, 16, 25, 0.6); }
      </style>
      <div class="intel-panel" data-intel-panel>
        <div class="intel-alert" data-intel-alert hidden></div>
        <section class="intel-command">
          <header class="intel-command__header">
            <h4>Counter-Intelligence</h4>
            <p>Use deception to drag enemy formations toward the wrong approach, then verify suspicious briefs before you commit reserves, artillery, or convoy routes.</p>
          </header>
          <div class="intel-command__grid" data-intel-counterintel-summary></div>
          <div class="intel-command__actions">
            <button type="button" class="intel-action-button" data-intel-action="deception">Deploy Deception On Map</button>
            <div class="intel-feedback" data-intel-feedback></div>
          </div>
          <div class="intel-ops" data-intel-counterintel-ops></div>
        </section>
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
            <p>Confidence now affects decision risk: suspicious briefs can be verified, and confirmed false reports should not pull your force off the real axis.</p>
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
        .logistics-panel { display: grid; gap: 0.95rem; padding: 0.15rem 0 0.55rem; }
        .logistics-panel__section { display: grid; gap: 0.55rem; }
        .logistics-panel__header h3 { margin: 0; font-size: 0.96rem; letter-spacing: 0.08em; text-transform: uppercase; }
        .logistics-panel__header p { margin: 0; font-size: 0.82rem; color: rgba(229, 236, 255, 0.68); line-height: 1.35; }

        .logistics-alert-strip { display: grid; gap: 0.55rem; grid-template-columns: repeat(auto-fit, minmax(180px, max-content)); }
        .logistics-alert-chip { display: grid; gap: 0.18rem; padding: 0.65rem 0.85rem; border-radius: 12px; border: 1px solid rgba(229, 236, 255, 0.14); background: rgba(17, 24, 36, 0.84); }
        .logistics-alert-chip strong { font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; }
        .logistics-alert-chip span { font-size: 0.78rem; color: rgba(229, 236, 255, 0.78); }
        .logistics-alert-chip--critical { border-color: rgba(255, 104, 104, 0.35); background: rgba(78, 23, 29, 0.72); color: #ffd6d6; }
        .logistics-alert-chip--warning { border-color: rgba(245, 196, 109, 0.35); background: rgba(64, 45, 19, 0.7); color: #ffe3ba; }

        .logistics-summary { display: flex; flex-wrap: wrap; gap: 0.5rem; }
        .logistics-summary__chip { display: inline-flex; gap: 0.45rem; align-items: center; padding: 0.48rem 0.78rem; border-radius: 999px; border: 1px solid rgba(229, 236, 255, 0.14); background: rgba(14, 20, 31, 0.82); font-size: 0.82rem; color: rgba(245, 247, 255, 0.92); }
        .logistics-summary__chip strong { font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(229, 236, 255, 0.68); }

        .logistics-info { border-radius: 14px; border: 1px solid rgba(229, 236, 255, 0.14); background: rgba(13, 20, 31, 0.66); overflow: hidden; }
        .logistics-info summary { list-style: none; cursor: pointer; padding: 0.7rem 0.9rem; font-size: 0.8rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(245, 247, 255, 0.94); }
        .logistics-info summary::-webkit-details-marker { display: none; }
        .logistics-info__body { display: grid; gap: 0.5rem; padding: 0 0.9rem 0.9rem; font-size: 0.82rem; line-height: 1.45; color: rgba(229, 236, 255, 0.8); }
        .logistics-info__body p { margin: 0; }
        .logistics-info__rules { margin: 0; padding-left: 1rem; display: grid; gap: 0.32rem; }

        .logistics-resource-grid { display: grid; gap: 0.8rem; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); }
        .logistics-resource-card { border-radius: 14px; border: 1px solid rgba(229, 236, 255, 0.16); background: rgba(17, 24, 36, 0.88); padding: 0.82rem 0.95rem; display: grid; gap: 0.7rem; }
        .logistics-resource-card__header { display: flex; align-items: flex-start; justify-content: space-between; gap: 0.75rem; }
        .logistics-resource-card__header h4 { margin: 0; font-size: 0.96rem; letter-spacing: 0.06em; text-transform: uppercase; }
        .logistics-resource-card__header p { margin: 0.18rem 0 0; font-size: 0.8rem; color: rgba(229, 236, 255, 0.68); }
        .logistics-resource-card__metrics { display: grid; gap: 0.45rem 0.8rem; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); font-size: 0.82rem; }
        .logistics-resource-card__metrics dt { margin: 0; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(229, 236, 255, 0.68); }
        .logistics-resource-card__metrics dd { margin: 0; font-size: 0.98rem; color: rgba(245, 247, 255, 0.94); }
        .logistics-resource-card__note { margin: 0; font-size: 0.79rem; color: rgba(229, 236, 255, 0.72); line-height: 1.4; }

        .supplies-card__status { font-size: 0.74rem; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 999px; padding: 0.24rem 0.62rem; }
        .supplies-card__status--critical { background: rgba(255, 104, 104, 0.2); color: #ffd6d6; border: 1px solid rgba(255, 104, 104, 0.4); }
        .supplies-card__status--warning { background: rgba(255, 196, 109, 0.2); color: #ffe5c4; border: 1px solid rgba(255, 196, 109, 0.4); }
        .supplies-card__status--stable { background: rgba(149, 190, 255, 0.18); color: #dfeaff; border: 1px solid rgba(149, 190, 255, 0.35); }
        .supplies-card__status--unknown { background: rgba(160, 160, 160, 0.18); color: #f5f5f5; border: 1px solid rgba(160, 160, 160, 0.35); }

        .logistics-priority-grid { display: grid; gap: 0.7rem; grid-template-columns: 1fr; }
        .logistics-priority-card { border-radius: 14px; border: 1px solid rgba(229, 236, 255, 0.16); background: rgba(17, 24, 36, 0.88); padding: 0.75rem 0.9rem; }
        .logistics-priority-card__row { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 0.8rem; }
        .logistics-priority-card__summary { min-width: 0; }
        .logistics-priority-card__summary h4 { margin: 0; font-size: 0.92rem; letter-spacing: 0.05em; text-transform: uppercase; }
        .logistics-priority-card__summary p { margin: 0.2rem 0 0; font-size: 0.8rem; color: rgba(229, 236, 255, 0.68); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .logistics-priority-card__status { font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 0.25rem 0.65rem; border-radius: 999px; white-space: nowrap; }
        .logistics-priority-card__status--direct,
        .logistics-priority-card__status--resupplied { background: rgba(110, 231, 169, 0.18); color: #d7ffe6; border: 1px solid rgba(110, 231, 169, 0.35); }
        .logistics-priority-card__status--delivering { background: rgba(149, 190, 255, 0.18); color: #dfeaff; border: 1px solid rgba(149, 190, 255, 0.35); }
        .logistics-priority-card__status--queued { background: rgba(245, 196, 109, 0.2); color: #ffe3ba; border: 1px solid rgba(245, 196, 109, 0.35); }
        .logistics-priority-card__status--isolated { background: rgba(255, 104, 104, 0.2); color: #ffd6d6; border: 1px solid rgba(255, 104, 104, 0.35); }
        .logistics-priority-card__buttons { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 0.35rem; }
        .logistics-priority-button { border: 1px solid rgba(229, 236, 255, 0.18); background: rgba(14, 20, 31, 0.78); color: #f5f7ff; border-radius: 999px; padding: 0.38rem 0.82rem; font-size: 0.77rem; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease; }
        .logistics-priority-button:is(:hover, :focus-visible) { border-color: rgba(245, 196, 109, 0.55); color: #ffe9c7; }
        .logistics-priority-button.is-active { background: rgba(245, 196, 109, 0.2); border-color: rgba(245, 196, 109, 0.5); color: #ffe9c7; }
        @media (max-width: 960px) {
          .logistics-priority-card__row { grid-template-columns: 1fr; align-items: start; }
          .logistics-priority-card__summary p { white-space: normal; }
          .logistics-priority-card__buttons { justify-content: flex-start; }
        }

        /* Supply source cards show throughput and bottlenecks */
        .logistics-sources-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .logistics-source-card { border-radius: 16px; border: 1px solid rgba(229, 236, 255, 0.18); background: rgba(17, 24, 36, 0.85); padding: 0.95rem 1rem; display: grid; gap: 0.7rem; }
        .logistics-source-card__header { display: flex; align-items: center; justify-content: space-between; }
        .logistics-source-card__header h4 { margin: 0; font-size: 1rem; letter-spacing: 0.06em; text-transform: uppercase; }
        .logistics-source-card__utilization { font-size: 1.25rem; font-weight: 700; color: rgba(245, 196, 109, 0.95); }
        .logistics-source-card__metrics { display: grid; gap: 0.5rem; font-size: 0.85rem; }
        .logistics-source-card__metric { display: flex; justify-content: space-between; align-items: baseline; }
        .logistics-source-card__metric dt { color: rgba(229, 236, 255, 0.72); letter-spacing: 0.05em; text-transform: uppercase; font-weight: 600; }
        .logistics-source-card__metric dd { margin: 0; color: rgba(245, 247, 255, 0.92); font-size: 1rem; }
        .logistics-source-card__bottleneck { margin-top: 0.5rem; padding: 0.65rem 0.9rem; border-radius: 8px; background: rgba(255, 196, 109, 0.15); border: 1px solid rgba(255, 196, 109, 0.3); font-size: 0.85rem; color: #ffe5c4; }

        /* Stockpile summary with trend indicators */
        .logistics-stockpiles-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
        .logistics-stockpile-card { border-radius: 14px; border: 1px solid rgba(229, 236, 255, 0.16); background: rgba(14, 18, 28, 0.85); padding: 0.9rem 1.1rem; display: grid; gap: 0.5rem; text-align: center; }
        .logistics-stockpile-card__label { font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(229, 236, 255, 0.75); }
        .logistics-stockpile-card__caption { font-size: 0.72rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(229, 236, 255, 0.55); }
        .logistics-stockpile-card__total { font-size: 1.75rem; font-weight: 700; color: rgba(245, 247, 255, 0.95); }
        .logistics-stockpile-card__avg { font-size: 0.85rem; color: rgba(229, 236, 255, 0.72); }
        .logistics-stockpile-card__trend { font-size: 0.75rem; letter-spacing: 0.05em; text-transform: uppercase; padding: 0.25rem 0.6rem; border-radius: 999px; display: inline-block; }
        .logistics-stockpile-card__trend--rising { background: rgba(149, 190, 255, 0.2); color: #dfeaff; border: 1px solid rgba(149, 190, 255, 0.35); }
        .logistics-stockpile-card__trend--stable { background: rgba(149, 190, 255, 0.15); color: #e2ecff; border: 1px solid rgba(149, 190, 255, 0.3); }
        .logistics-stockpile-card__trend--falling { background: rgba(255, 196, 109, 0.2); color: #ffe3ba; border: 1px solid rgba(255, 196, 109, 0.35); }

        /* Convoy status list */
        .logistics-convoy-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; }
        .logistics-convoy-item { border-radius: 10px; border: 1px solid rgba(229, 236, 255, 0.14); background: rgba(13, 18, 28, 0.8); padding: 0.75rem 1rem; display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 0.8rem; font-size: 0.88rem; }
        .logistics-convoy-item__main { display: grid; gap: 0.25rem; min-width: 0; }
        .logistics-convoy-item__heading { font-size: 0.8rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(229, 236, 255, 0.68); }
        .logistics-convoy-item__route { color: rgba(245, 250, 255, 0.92); }
        .logistics-convoy-item__cargo { font-size: 0.8rem; color: rgba(229, 236, 255, 0.72); }
        .logistics-convoy-item__incident { font-size: 0.78rem; color: #ffd6d6; }
        .logistics-convoy-item__status { font-size: 0.75rem; letter-spacing: 0.06em; text-transform: uppercase; padding: 0.25rem 0.65rem; border-radius: 999px; }
        .logistics-convoy-item__status--loading,
        .logistics-convoy-item__status--idle { background: rgba(149, 190, 255, 0.18); color: #dfeaff; border: 1px solid rgba(149, 190, 255, 0.35); }
        .logistics-convoy-item__status--delivering { background: rgba(110, 231, 169, 0.18); color: #d7ffe6; border: 1px solid rgba(110, 231, 169, 0.35); }
        .logistics-convoy-item__status--returning { background: rgba(245, 196, 109, 0.2); color: #ffe3ba; border: 1px solid rgba(245, 196, 109, 0.35); }
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

        /* Alert banners */
        .logistics-alerts-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
        .logistics-alert-item { border-radius: 12px; padding: 0.75rem 1rem; font-size: 0.9rem; line-height: 1.4; font-weight: 600; }
        .logistics-alert-item--critical { background: rgba(255, 104, 104, 0.18); border: 1px solid rgba(255, 104, 104, 0.35); color: #ffd6d6; }
        .logistics-alert-item--warning { background: rgba(255, 196, 109, 0.18); border: 1px solid rgba(255, 196, 109, 0.35); color: #ffe3ba; }
        .logistics-alert-item--info { background: rgba(149, 190, 255, 0.15); border: 1px solid rgba(149, 190, 255, 0.3); color: #dfeaff; }

        .supplies-ledger { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.65rem; }
        .supplies-ledger__entry { display: grid; gap: 0.35rem; border-radius: 14px; border: 1px solid rgba(229, 236, 255, 0.14); background: rgba(14, 20, 31, 0.8); padding: 0.85rem 0.95rem; font-size: 0.84rem; }
        .supplies-ledger__delta { font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; }
        .supplies-ledger__delta--positive { color: #6ee7a9; }
        .supplies-ledger__delta--negative { color: #ff9696; }
        .supplies-ledger__reason { color: rgba(229, 236, 255, 0.65); }
        .supplies-ledger__timestamp { font-size: 0.75rem; color: rgba(229, 236, 255, 0.55); }
        .supplies-ledger__empty { text-align: center; font-size: 0.85rem; color: rgba(229, 236, 255, 0.6); border-radius: 12px; border: 1px dashed rgba(229, 236, 255, 0.18); padding: 0.75rem; background: rgba(14, 20, 31, 0.5); }

        .logistics-panel__empty { font-size: 0.9rem; color: rgba(229, 236, 255, 0.72); text-align: center; padding: 1rem; border-radius: 12px; border: 1px dashed rgba(229, 236, 255, 0.25); background: rgba(13, 20, 31, 0.6); }

        @media (max-width: 720px) {
          .logistics-alert-strip,
          .logistics-summary,
          .logistics-resource-grid,
          .logistics-convoy-item,
          .logistics-priority-card__row {
            grid-template-columns: 1fr;
          }
          .logistics-priority-card__summary p {
            white-space: normal;
          }
          .logistics-priority-card__buttons {
            justify-content: flex-start;
          }
        }
      </style>
      <div id="logisticsPanel" class="logistics-panel" aria-live="polite">
        <div class="logistics-alert-strip" data-logistics-alerts hidden></div>
        <section class="logistics-panel__section">
          <header class="logistics-panel__header">
            <h3>Status</h3>
            <p>Quick read on theater supply, convoy coverage, and current queue pressure.</p>
          </header>
          <div data-logistics-overview></div>
        </section>
        <section class="logistics-panel__section">
          <div data-logistics-info></div>
        </section>
        <section class="logistics-panel__section">
          <header class="logistics-panel__header">
            <h3>Supply Status</h3>
            <p>Ammo and fuel on units, on convoys, and still in the Base Camp depot.</p>
          </header>
          <div class="logistics-resource-grid" data-logistics-supply-categories></div>
        </section>
        <section class="logistics-panel__section">
          <header class="logistics-panel__header">
            <h3>Resupply Queue</h3>
            <p>Automated convoys obey these priorities. Raise a battalion when it must keep moving or firing.</p>
          </header>
          <div class="logistics-priority-grid" data-logistics-priorities></div>
        </section>
        <section class="logistics-panel__section">
          <header class="logistics-panel__header">
            <h3>Convoy Status</h3>
            <p>Live on-map convoy jobs, cargo loads, and delivery estimates.</p>
          </header>
          <ul class="logistics-convoy-list" data-logistics-convoys></ul>
        </section>
        <section class="logistics-panel__section">
          <header class="logistics-panel__header">
            <h3>Supply History</h3>
            <p>Recent depot issues, convoy loadouts, and base replenishment entries.</p>
          </header>
          <ul class="supplies-ledger" data-logistics-ledger></ul>
        </section>
      </div>
    `
    },
    {
        key: "supplies",
        title: "Supplies",
        body: `
      <style>
        /* Layout the supplies panel as a denser responsive grid so more operational context fits above the fold. */
        .supplies-panel { display: grid; gap: 1.1rem; padding: 0.4rem 0 0.75rem; }
        .supplies-panel__section { display: grid; gap: 0.75rem; }
        .supplies-panel__header h3 { margin: 0; font-size: 1rem; letter-spacing: 0.08em; text-transform: uppercase; }
        .supplies-panel__header p { margin: 0; font-size: 0.85rem; color: rgba(229, 236, 255, 0.72); }

        /* Faction toggle keeps commanders aware of which supply ledger is in view. */
        .supplies-panel__controls { display: flex; gap: 0.5rem; flex-wrap: wrap; }
        .supplies-faction-button { border: 1px solid rgba(229, 236, 255, 0.18); background: rgba(17, 24, 36, 0.75); color: #f5f7ff; border-radius: 999px; padding: 0.4rem 0.95rem; font-size: 0.85rem; letter-spacing: 0.05em; text-transform: uppercase; cursor: pointer; transition: background 0.2s ease, border-color 0.2s ease; }
        .supplies-faction-button:is(:hover, :focus-visible) { border-color: rgba(245, 196, 109, 0.6); color: #ffe9c7; }
        .supplies-faction-button.is-active { background: rgba(245, 196, 109, 0.22); border-color: rgba(245, 196, 109, 0.55); color: #ffe9c7; }
        .supplies-faction-button:disabled { opacity: 0.6; cursor: not-allowed; }

        /* Overview leads with commander's cheat sheet explaining how carried stock and depot reserves interact. */
        .supplies-overview { display: grid; gap: 0.9rem; }
        .supplies-overview__hero { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
        .supplies-overview__metric { display: grid; gap: 0.25rem; border-radius: 14px; border: 1px solid rgba(229, 236, 255, 0.14); background: rgba(14, 20, 31, 0.82); padding: 0.8rem 0.9rem; }
        .supplies-overview__metric span { font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(229, 236, 255, 0.62); }
        .supplies-overview__metric strong { font-size: 1.2rem; color: rgba(245, 247, 255, 0.96); }
        .supplies-overview__metric small { font-size: 0.8rem; color: rgba(229, 236, 255, 0.7); }
        .supplies-overview__stock { display: flex; flex-wrap: wrap; gap: 0.55rem; }
        .supplies-overview__stock-item { display: inline-flex; gap: 0.45rem; align-items: center; border-radius: 999px; padding: 0.45rem 0.8rem; background: rgba(17, 24, 36, 0.78); border: 1px solid rgba(229, 236, 255, 0.14); font-size: 0.82rem; color: rgba(245, 247, 255, 0.9); }
        .supplies-overview__stock-item strong { letter-spacing: 0.05em; text-transform: uppercase; font-size: 0.72rem; color: rgba(229, 236, 255, 0.68); }
        .supplies-overview__brief { display: grid; gap: 0.6rem; padding: 0.9rem 1rem; border-radius: 16px; background: linear-gradient(135deg, rgba(245, 196, 109, 0.13), rgba(149, 190, 255, 0.08)); border: 1px solid rgba(245, 196, 109, 0.18); }
        .supplies-overview__headline { margin: 0; font-size: 0.95rem; line-height: 1.45; color: rgba(245, 247, 255, 0.94); }
        .supplies-overview__rules { margin: 0; padding-left: 1.1rem; display: grid; gap: 0.35rem; font-size: 0.82rem; line-height: 1.45; color: rgba(229, 236, 255, 0.76); }

        /* Category cards rely on a responsive grid that collapses gracefully on narrow viewports. */
        .supplies-category-grid { display: grid; gap: 0.9rem; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
        .supplies-card { border-radius: 16px; border: 1px solid rgba(229, 236, 255, 0.18); background: rgba(17, 24, 36, 0.88); padding: 0.95rem 1rem; display: grid; gap: 0.7rem; }
        .supplies-card__header { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; }
        .supplies-card__header h4 { margin: 0; font-size: 1rem; letter-spacing: 0.06em; text-transform: uppercase; }
        .supplies-card__subhead { margin: 0.2rem 0 0; font-size: 0.8rem; color: rgba(229, 236, 255, 0.68); }
        .supplies-card__status { font-size: 0.75rem; letter-spacing: 0.08em; text-transform: uppercase; border-radius: 999px; padding: 0.25rem 0.65rem; }
        .supplies-card__status--critical { background: rgba(255, 104, 104, 0.2); color: #ffd6d6; border: 1px solid rgba(255, 104, 104, 0.4); }
        .supplies-card__status--warning { background: rgba(255, 196, 109, 0.2); color: #ffe5c4; border: 1px solid rgba(255, 196, 109, 0.4); }
        .supplies-card__status--stable { background: rgba(149, 190, 255, 0.18); color: #dfeaff; border: 1px solid rgba(149, 190, 255, 0.35); }
        .supplies-card__status--unknown { background: rgba(160, 160, 160, 0.18); color: #f5f5f5; border: 1px solid rgba(160, 160, 160, 0.35); }
        .supplies-card__total-row { display: flex; align-items: baseline; gap: 0.6rem; }
        .supplies-card__overall { font-size: 1.6rem; line-height: 1; color: rgba(245, 247, 255, 0.96); }
        .supplies-card__overall-label { font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(229, 236, 255, 0.62); }

        /* Gauge bars visualize frontline/reserve distribution with color-coded segments. */
        .supplies-card__gauge { position: relative; display: flex; height: 10px; border-radius: 6px; overflow: hidden; background: rgba(229, 236, 255, 0.15); }
        .supplies-card__gauge-bar { display: block; height: 100%; }
        .supplies-card__gauge-bar--frontline { background: linear-gradient(90deg, rgba(245, 196, 109, 0.9), rgba(255, 177, 80, 0.9)); }
        .supplies-card__gauge-bar--reserve { background: linear-gradient(90deg, rgba(149, 190, 255, 0.9), rgba(116, 166, 255, 0.9)); }
        .supplies-card__gauge-bar--depot { background: linear-gradient(90deg, rgba(110, 231, 169, 0.8), rgba(69, 199, 144, 0.8)); }
        .supplies-card__gauge-bar--buffer { background: rgba(229, 236, 255, 0.25); }
        .supplies-card__gauge-bar--empty { background: rgba(229, 236, 255, 0.2); }
        .supplies-card__gauge-legend { margin: 0; font-size: 0.8rem; color: rgba(229, 236, 255, 0.72); }

        .supplies-card__metrics { display: grid; gap: 0.45rem 0.9rem; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); font-size: 0.83rem; }
        .supplies-card__metrics dt { margin: 0; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: rgba(229, 236, 255, 0.72); }
        .supplies-card__metrics dd { margin: 0; font-size: 1rem; color: rgba(245, 247, 255, 0.92); }
        .supplies-card__footer { margin: 0; font-size: 0.8rem; line-height: 1.4; color: rgba(229, 236, 255, 0.68); }

        /* Alert list surfaces critical notifications prominently with severity colors. */
        .supplies-alerts { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
        .supplies-alerts__item { border-radius: 12px; padding: 0.75rem 1rem; font-size: 0.9rem; line-height: 1.4; }
        .supplies-alerts__item--critical { background: rgba(255, 104, 104, 0.18); border: 1px solid rgba(255, 104, 104, 0.35); color: #ffd6d6; }
        .supplies-alerts__item--warning { background: rgba(255, 196, 109, 0.18); border: 1px solid rgba(255, 196, 109, 0.35); color: #ffe3ba; }
        .supplies-alerts__item--info { background: rgba(149, 190, 255, 0.15); border: 1px solid rgba(149, 190, 255, 0.3); color: #dfeaff; }
        .supplies-alerts__empty { text-align: center; font-size: 0.9rem; color: rgba(229, 236, 255, 0.65); }

        /* Trend rows show per-resource history so planners can trace consumption over time. */
        .supplies-trend { display: grid; gap: 1rem; }
        .supplies-trend__series { border-radius: 12px; border: 1px solid rgba(229, 236, 255, 0.12); background: rgba(14, 20, 31, 0.8); padding: 0.8rem 0.95rem; display: grid; gap: 0.55rem; }
        .supplies-trend__series h5 { margin: 0; font-size: 0.9rem; letter-spacing: 0.06em; text-transform: uppercase; }
        .supplies-trend__points { display: flex; gap: 0.45rem; flex-wrap: wrap; font-size: 0.84rem; color: rgba(229, 236, 255, 0.82); }

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
            <p>Production, shipments, and depot issue history.</p>
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
export function getPopupContent(key) {
    return popupContentRegistry.find(p => p.key === key) ?? null;
}
/**
 * Check if a popup key has registered content.
 * @param key - Popup key to check
 * @returns True if content exists in registry
 */
export function hasPopupContent(key) {
    return popupContentRegistry.some(p => p.key === key);
}
/**
 * Get all available popup keys from the registry.
 * Useful for validation and debugging.
 * @returns Array of popup keys
 */
export function getAvailablePopupKeys() {
    return popupContentRegistry.map(p => p.key);
}
