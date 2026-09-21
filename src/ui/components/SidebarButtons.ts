import type { IPopupManager, PopupKey } from "../../contracts/IPopupManager";
import { ListenerLifecycle } from "../lifecycle/ListenerLifecycle";

/**
 * Manages sidebar button interactions and active state synchronization.
 * Coordinates with PopupManager to open/close popups.
 */
export class SidebarButtons {
  private readonly buttons: HTMLButtonElement[];
  private readonly lifecycle = new ListenerLifecycle();
  private popupManager: IPopupManager | null = null;
  private bound = false;

  constructor(buttonSelector: string = ".sidebar-button") {
    this.buttons = Array.from(document.querySelectorAll<HTMLButtonElement>(buttonSelector));
  }

  /**
   * Binds events and connects to the popup manager.
   */
  bindEvents(popupManager: IPopupManager): void {
    if (this.bound) {
      throw new Error("SidebarButtons: bindEvents may only be called once per lifecycle.");
    }
    this.bound = true;
    this.popupManager = popupManager;

    this.buttons.forEach((button) => {
      this.lifecycle.addEventListener(button, "click", () => this.handleButtonClick(button));
    });

    // Register with PopupManager so it can drive active-state updates after open/close events.
    this.popupManager.registerSidebarController(this);

    // Initialize button states in case a popup is already active when binding occurs.
    this.syncActiveState(this.popupManager.getActivePopup());
  }

  /** Idempotently releases sidebar listeners before a failed bootstrap can be retried. */
  dispose(): void {
    this.lifecycle.dispose();
    this.popupManager = null;
  }

  /**
   * Syncs button active states based on the current popup.
   */
  syncActiveState(activeKey: PopupKey | null): void {
    this.buttons.forEach((button) => {
      const matches = button.dataset.popup === activeKey;
      button.classList.toggle("is-active", matches);
      button.setAttribute("aria-expanded", matches ? "true" : "false");
    });
  }

  /**
   * Handles sidebar button clicks.
   */
  private handleButtonClick(button: HTMLButtonElement): void {
    if (!this.popupManager) {
      console.warn("PopupManager not connected to SidebarButtons");
      return;
    }

    const key = button.dataset.popup as PopupKey | undefined;
    if (!key) {
      return;
    }

    const activePopup = this.popupManager.getActivePopup();

    if (activePopup === key) {
      this.popupManager.closePopup();
      return;
    }

    this.popupManager.openPopup(key, button);
  }
}
