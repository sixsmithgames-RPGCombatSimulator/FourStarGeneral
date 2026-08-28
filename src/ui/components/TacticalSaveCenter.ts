import type {
  CampaignSaveQuarantineRecord,
  CampaignSaveSlotIndexEntry
} from "../../game/campaign/persistence/CampaignSaveTypes";
import type { TacticalSaveAvailability } from "../../game/battle/persistence/BattleSaveTypes";
import type { TacticalSaveCoordinatorSnapshot } from "../../game/battle/persistence/TacticalSaveCoordinator";

export type TacticalSaveCenterMode = "save" | "load";

export interface TacticalSaveCenterModel {
  readonly mode: TacticalSaveCenterMode;
  readonly slots: readonly CampaignSaveSlotIndexEntry[];
  readonly quarantine: readonly CampaignSaveQuarantineRecord[];
  readonly availability: TacticalSaveAvailability;
  readonly coordinator: TacticalSaveCoordinatorSnapshot;
  readonly recoveryMessage: string | null;
  readonly recoveryAvailable: boolean;
  readonly busy: boolean;
}

export interface TacticalSaveCenterActions {
  saveNew(label: string): Promise<void>;
  overwrite(slotId: string): Promise<void>;
  load(slotId: string): Promise<void>;
  recover(): Promise<void>;
  exportQuarantine(quarantineId: string): void;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case "\"": return "&quot;";
      default: return "&#039;";
    }
  });
}

function formatTimestamp(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

/** Keyboard-operable named-slot, autosave, and explicit recovery dialog for campaign-linked battles. */
export class TacticalSaveCenter {
  private readonly root: HTMLElement;
  private readonly actions: TacticalSaveCenterActions;
  private model: TacticalSaveCenterModel;
  private invoker: HTMLElement | null = null;
  private selectedSlotId: string | null = null;
  private overwriteConfirmationSlotId: string | null = null;
  private backgroundState: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }> = [];

  public constructor(container: HTMLElement, actions: TacticalSaveCenterActions, initial: TacticalSaveCenterModel) {
    this.actions = actions;
    this.model = initial;
    this.root = document.createElement("div");
    this.root.id = "tacticalSaveCenter";
    this.root.className = "tactical-save-center hidden";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "tacticalSaveCenterTitle");
    this.root.innerHTML = `
      <div class="tactical-save-center__surface" tabindex="-1">
        <header class="tactical-save-center__header">
          <div>
            <span class="tactical-save-center__eyebrow">Campaign battle persistence</span>
            <h2 id="tacticalSaveCenterTitle">Tactical Save Center</h2>
          </div>
          <button type="button" class="tactical-save-center__close" data-save-center-close aria-label="Close Tactical Save Center">×</button>
        </header>
        <div class="tactical-save-center__status" role="status" aria-live="polite" data-save-center-status></div>
        <div class="tactical-save-center__availability" data-save-center-availability></div>
        <div class="tactical-save-center__body">
          <section class="tactical-save-center__manual" data-save-center-manual>
            <label for="tacticalSaveName">New manual checkpoint</label>
            <div class="tactical-save-center__new-row">
              <input id="tacticalSaveName" type="text" maxlength="48" autocomplete="off" value="Battle checkpoint">
              <button type="button" class="primary-button" data-save-center-new>Save new</button>
            </div>
          </section>
          <section class="tactical-save-center__slots" aria-labelledby="tacticalSaveSlotsHeading">
            <div class="tactical-save-center__section-heading">
              <div>
                <h3 id="tacticalSaveSlotsHeading">Battle checkpoints</h3>
                <p>Manual checkpoints and the three most recent turn-start autosaves.</p>
              </div>
              <span data-save-center-count></span>
            </div>
            <div class="tactical-save-center__slot-list" role="listbox" aria-label="Tactical save slots" data-save-center-list></div>
          </section>
          <section class="tactical-save-center__recovery hidden" data-save-center-recovery>
            <h3 data-save-center-recovery-title>Verified recovery available</h3>
            <p data-save-center-recovery-message></p>
            <button type="button" class="secondary-button" data-save-center-recover>Recover earlier checkpoint</button>
          </section>
          <details class="tactical-save-center__quarantine" data-save-center-quarantine>
            <summary>Storage diagnostics <span data-save-center-quarantine-count></span></summary>
            <div data-save-center-quarantine-list></div>
          </details>
        </div>
        <footer class="tactical-save-center__footer">
          <span data-save-center-selection>No checkpoint selected.</span>
          <div>
            <button type="button" class="secondary-button hidden" data-save-center-overwrite>Overwrite selected</button>
            <button type="button" class="primary-button" data-save-center-load disabled>Resume selected</button>
            <button type="button" class="secondary-button" data-save-center-close>Close</button>
          </div>
        </footer>
      </div>
    `;
    container.appendChild(this.root);
    this.bindEvents();
    this.render();
  }

  public isOpen(): boolean {
    return !this.root.classList.contains("hidden");
  }

  public open(mode: TacticalSaveCenterMode, invoker: HTMLElement | null): void {
    const wasOpen = this.isOpen();
    this.invoker = invoker;
    this.model = { ...this.model, mode };
    this.overwriteConfirmationSlotId = null;
    if (!wasOpen) {
      this.backgroundState = Array.from(document.body.children)
        .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== this.root)
        .map((element) => ({ element, inert: element.inert, ariaHidden: element.getAttribute("aria-hidden") }));
      this.backgroundState.forEach(({ element }) => {
        element.inert = true;
        element.setAttribute("aria-hidden", "true");
      });
    }
    this.root.classList.remove("hidden");
    this.render();
    const focusTarget = mode === "save"
      ? this.root.querySelector<HTMLInputElement>("#tacticalSaveName")
      : this.root.querySelector<HTMLButtonElement>("[data-save-slot-id]");
    (focusTarget ?? this.root.querySelector<HTMLElement>(".tactical-save-center__surface"))?.focus();
  }

  public close(): void {
    if (!this.isOpen()) return;
    this.root.classList.add("hidden");
    this.backgroundState.forEach(({ element, inert, ariaHidden }) => {
      element.inert = inert;
      if (ariaHidden === null) element.removeAttribute("aria-hidden");
      else element.setAttribute("aria-hidden", ariaHidden);
    });
    this.backgroundState = [];
    const invoker = this.invoker;
    this.invoker = null;
    invoker?.focus();
  }

  public update(model: TacticalSaveCenterModel): void {
    this.model = model;
    if (this.selectedSlotId && !model.slots.some((slot) => slot.slotId === this.selectedSlotId)) {
      this.selectedSlotId = null;
    }
    this.render();
  }

  public dispose(): void {
    this.root.remove();
  }

  private bindEvents(): void {
    this.root.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      if (target.closest("[data-save-center-close]") || target === this.root) {
        this.close();
        return;
      }
      const slotButton = target.closest<HTMLButtonElement>("[data-save-slot-id]");
      if (slotButton?.dataset.saveSlotId) {
        this.selectedSlotId = slotButton.dataset.saveSlotId;
        this.overwriteConfirmationSlotId = null;
        this.render();
        return;
      }
      if (target.closest("[data-save-center-new]")) {
        const label = this.root.querySelector<HTMLInputElement>("#tacticalSaveName")?.value.trim() ?? "";
        if (label.length > 0) void this.actions.saveNew(label);
        return;
      }
      if (target.closest("[data-save-center-load]") && this.selectedSlotId) {
        void this.actions.load(this.selectedSlotId);
        return;
      }
      if (target.closest("[data-save-center-overwrite]") && this.selectedSlotId) {
        if (this.overwriteConfirmationSlotId !== this.selectedSlotId) {
          this.overwriteConfirmationSlotId = this.selectedSlotId;
          this.render();
        } else {
          this.overwriteConfirmationSlotId = null;
          void this.actions.overwrite(this.selectedSlotId);
        }
        return;
      }
      if (target.closest("[data-save-center-recover]")) {
        void this.actions.recover();
        return;
      }
      const exportButton = target.closest<HTMLButtonElement>("[data-quarantine-export]");
      if (exportButton?.dataset.quarantineExport) {
        this.actions.exportQuarantine(exportButton.dataset.quarantineExport);
      }
    });
    this.root.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.close();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(this.root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), summary, [tabindex]:not([tabindex="-1"])'
      )).filter((element) => !element.closest(".hidden"));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  private render(): void {
    this.root.dataset.mode = this.model.mode;
    const manualSection = this.root.querySelector<HTMLElement>("[data-save-center-manual]");
    manualSection?.classList.toggle("hidden", this.model.mode !== "save");
    const status = this.root.querySelector<HTMLElement>("[data-save-center-status]");
    if (status) {
      status.textContent = this.model.coordinator.message;
      status.dataset.state = this.model.coordinator.status;
    }
    const availability = this.root.querySelector<HTMLElement>("[data-save-center-availability]");
    if (availability) {
      availability.textContent = this.model.mode === "load"
        ? "Select a verified tactical checkpoint. Loading restores its campaign and returns directly to the battlefield."
        : this.model.availability.stable
        ? `Ready to save at ${this.model.availability.boundary?.kind ?? "stable boundary"}.`
        : this.model.availability.reason ?? "Waiting for a stable tactical boundary.";
      availability.dataset.stable = String(this.model.mode === "load" || this.model.availability.stable);
    }

    const slotList = this.root.querySelector<HTMLElement>("[data-save-center-list]");
    if (slotList) {
      slotList.innerHTML = this.model.slots.length === 0
        ? '<p class="tactical-save-center__empty">No tactical checkpoints have been written for this campaign yet.</p>'
        : this.model.slots.map((slot) => {
          const selected = slot.slotId === this.selectedSlotId;
          const typeLabel = slot.slotType === "manual" ? "Manual" : slot.slotType === "autosave" ? "Autosave" : "Checkpoint";
          const thumbnail = slot.display.thumbnailKey
            ? `<svg viewBox="0 0 24 24" focusable="false"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="M7 8h10M7 12h4M14 12h3M7 16h10"></path></svg>`
            : `<svg viewBox="0 0 24 24" focusable="false"><path d="M6 3h9l3 3v15H6z"></path><path d="M15 3v4h4M9 11h6M9 15h6"></path></svg>`;
          return `
            <button type="button" class="tactical-save-slot${selected ? " is-selected" : ""}" role="option"
              aria-selected="${selected}" data-save-slot-id="${escapeHtml(slot.slotId)}">
              <span class="tactical-save-slot__thumbnail" aria-hidden="true">${thumbnail}</span>
              <span class="tactical-save-slot__copy">
                <strong>${escapeHtml(slot.label)}</strong>
                <span>${escapeHtml(slot.display.phaseLabel)}</span>
                <small>${escapeHtml(formatTimestamp(slot.updatedAt))}</small>
              </span>
              <span class="tactical-save-slot__type" data-slot-type="${slot.slotType}">${typeLabel}</span>
            </button>
          `;
        }).join("");
    }
    const count = this.root.querySelector<HTMLElement>("[data-save-center-count]");
    if (count) count.textContent = `${this.model.slots.length} slot${this.model.slots.length === 1 ? "" : "s"}`;

    const selected = this.model.slots.find((slot) => slot.slotId === this.selectedSlotId) ?? null;
    const selection = this.root.querySelector<HTMLElement>("[data-save-center-selection]");
    if (selection) selection.textContent = selected ? `Selected: ${selected.label}` : "No checkpoint selected.";
    const loadButton = this.root.querySelector<HTMLButtonElement>("[data-save-center-load]");
    if (loadButton) loadButton.disabled = !selected || this.model.busy;
    const overwriteButton = this.root.querySelector<HTMLButtonElement>("[data-save-center-overwrite]");
    if (overwriteButton) {
      const visible = this.model.mode === "save" && selected?.slotType === "manual";
      overwriteButton.classList.toggle("hidden", !visible);
      overwriteButton.disabled = !visible || this.model.busy;
      overwriteButton.textContent = this.overwriteConfirmationSlotId === selected?.slotId
        ? "Confirm overwrite"
        : "Overwrite selected";
    }
    const newButton = this.root.querySelector<HTMLButtonElement>("[data-save-center-new]");
    if (newButton) newButton.disabled = this.model.busy;

    const recovery = this.root.querySelector<HTMLElement>("[data-save-center-recovery]");
    recovery?.classList.toggle("hidden", !this.model.recoveryMessage);
    const recoveryTitle = this.root.querySelector<HTMLElement>("[data-save-center-recovery-title]");
    if (recoveryTitle) recoveryTitle.textContent = this.model.recoveryAvailable ? "Verified recovery available" : "Save Center notice";
    const recoveryMessage = this.root.querySelector<HTMLElement>("[data-save-center-recovery-message]");
    if (recoveryMessage) recoveryMessage.textContent = this.model.recoveryMessage ?? "";
    const recoverButton = this.root.querySelector<HTMLButtonElement>("[data-save-center-recover]");
    recoverButton?.classList.toggle("hidden", !this.model.recoveryAvailable);

    const quarantineCount = this.root.querySelector<HTMLElement>("[data-save-center-quarantine-count]");
    if (quarantineCount) quarantineCount.textContent = `(${this.model.quarantine.length})`;
    const quarantineList = this.root.querySelector<HTMLElement>("[data-save-center-quarantine-list]");
    if (quarantineList) {
      quarantineList.innerHTML = this.model.quarantine.length === 0
        ? "<p>No quarantined tactical records.</p>"
        : this.model.quarantine.map((record) => `
          <article class="tactical-save-quarantine">
            <div><strong>${escapeHtml(record.reasonCode)}</strong><span>${escapeHtml(record.reason)}</span></div>
            <button type="button" class="secondary-button" data-quarantine-export="${escapeHtml(record.quarantineId)}">Export diagnostic</button>
          </article>
        `).join("");
    }
  }
}
