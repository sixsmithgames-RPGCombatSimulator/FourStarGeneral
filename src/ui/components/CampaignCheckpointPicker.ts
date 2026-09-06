/** Player-facing metadata for one existing campaign checkpoint; this dialog owns no persistence. */
export interface CampaignCheckpointChoice {
  readonly slotId: string;
  readonly label: string;
  readonly detail: string;
}

/** Explicit campaign checkpoint selection with one temporary modal/focus owner. */
export class CampaignCheckpointPicker {
  private readonly root = document.createElement("div");
  private readonly options: HTMLButtonElement[] = [];
  private readonly load: HTMLButtonElement;
  private readonly close: HTMLButtonElement;
  private selectedId: string | null = null;
  private finish: ((slotId: string | null) => void) | null = null;

  /** Reuses the save-center geometry while retaining campaign-specific semantics and controls. */
  public constructor(private readonly choices: readonly CampaignCheckpointChoice[]) {
    this.root.id = "campaignCheckpointPicker";
    this.root.className = "tactical-save-center";
    this.root.setAttribute("role", "dialog");
    this.root.setAttribute("aria-modal", "true");
    this.root.setAttribute("aria-labelledby", "campaignCheckpointPickerTitle");
    this.root.setAttribute("aria-describedby", "campaignCheckpointPickerHelp");
    this.root.innerHTML = `
      <div class="tactical-save-center__surface" tabindex="-1">
        <header class="tactical-save-center__header"><h2 id="campaignCheckpointPickerTitle">Load campaign checkpoint</h2>
          <button type="button" class="tactical-save-center__close" data-campaign-checkpoint-cancel aria-label="Close campaign checkpoints">×</button></header>
        <p id="campaignCheckpointPickerHelp" class="tactical-save-center__availability">Choose Primary or a post-battle checkpoint, then select Load checkpoint. Loading replaces the current campaign in memory.</p>
        <div class="tactical-save-center__body"><section class="tactical-save-center__slots">
          <div class="tactical-save-center__slot-list" role="listbox" aria-label="Campaign checkpoints" data-campaign-checkpoint-list></div>
        </section></div>
        <footer class="tactical-save-center__footer"><span data-campaign-checkpoint-selection>No checkpoint selected.</span><div>
          <button type="button" class="primary-button" data-campaign-checkpoint-load disabled>Load checkpoint</button>
          <button type="button" class="secondary-button" data-campaign-checkpoint-cancel>Cancel</button>
        </div></footer>
      </div>`;
    this.load = this.root.querySelector<HTMLButtonElement>("[data-campaign-checkpoint-load]")!;
    this.close = this.root.querySelector<HTMLButtonElement>("[data-campaign-checkpoint-cancel]")!;
    const list = this.root.querySelector<HTMLElement>("[data-campaign-checkpoint-list]")!;
    choices.forEach((choice, index) => {
      const option = document.createElement("button");
      option.type = "button";
      option.className = "tactical-save-slot";
      option.dataset.campaignCheckpointId = choice.slotId;
      option.setAttribute("role", "option");
      option.setAttribute("aria-selected", "false");
      option.tabIndex = index === 0 ? 0 : -1;
      const copy = document.createElement("span");
      copy.className = "tactical-save-slot__copy";
      const label = document.createElement("strong");
      label.textContent = choice.label;
      const detail = document.createElement("small");
      detail.textContent = choice.detail;
      copy.append(label, detail);
      option.append(copy);
      option.addEventListener("click", () => this.select(index));
      list.append(option);
      this.options.push(option);
    });
    this.root.querySelectorAll<HTMLButtonElement>("[data-campaign-checkpoint-cancel]")
      .forEach((button) => button.addEventListener("click", () => this.finish?.(null)));
    this.load.addEventListener("click", () => {
      if (this.selectedId && !this.load.disabled) this.finish?.(this.selectedId);
    });
  }

  /** Opens once and resolves only on explicit load or cancellation; all modal state is then removed. */
  public choose(invoker: HTMLElement | null): Promise<string | null> {
    document.body.append(this.root);
    const background = Array.from(document.body.children)
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== this.root)
      .map((element) => ({ element, inert: Boolean(element.inert), ariaHidden: element.getAttribute("aria-hidden") }));
    background.forEach(({ element }) => { element.inert = true; element.setAttribute("aria-hidden", "true"); });
    return new Promise((resolve) => {
      const onFocus = (event: FocusEvent): void => {
        if (event.target instanceof Node && !this.root.contains(event.target)) this.focusOption();
      };
      const onKey = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
          event.preventDefault(); event.stopImmediatePropagation(); this.finish?.(null);
        } else if (event.key === "Tab") {
          const targets = Array.from(this.root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"))
            .filter((button) => button.tabIndex >= 0);
          const index = targets.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault(); event.stopImmediatePropagation();
          targets[(index + (event.shiftKey ? targets.length - 1 : 1)) % targets.length]?.focus();
        } else if (["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)
          && this.options.includes(document.activeElement as HTMLButtonElement)) {
          const index = this.options.indexOf(document.activeElement as HTMLButtonElement);
          const next = event.key === "Home" ? 0 : event.key === "End" ? this.options.length - 1
            : (index + (event.key === "ArrowUp" ? this.options.length - 1 : 1)) % this.options.length;
          event.preventDefault(); event.stopImmediatePropagation(); this.select(next);
        }
      };
      const onScreen = (event: Event): void => {
        if ((event as CustomEvent<{ id?: string }>).detail?.id !== "campaign") this.finish?.(null);
      };
      this.finish = (slotId) => {
        if (!this.finish) return;
        this.finish = null;
        document.removeEventListener("keydown", onKey, true);
        document.removeEventListener("focusin", onFocus, true);
        document.removeEventListener("screen:shown", onScreen);
        this.root.remove();
        background.forEach(({ element, inert, ariaHidden }) => {
          element.inert = inert;
          if (ariaHidden === null) element.removeAttribute("aria-hidden");
          else element.setAttribute("aria-hidden", ariaHidden);
        });
        if (invoker?.isConnected) invoker.focus({ preventScroll: true });
        resolve(slotId);
      };
      document.addEventListener("keydown", onKey, true);
      document.addEventListener("focusin", onFocus, true);
      document.addEventListener("screen:shown", onScreen);
      this.focusOption();
    });
  }

  /** Cancels pending selection and releases background/focus handlers during screen disposal. */
  public dispose(): void { this.finish?.(null); this.root.remove(); }

  private focusOption(): void {
    (this.options.find((option) => option.tabIndex === 0) ?? this.close).focus();
  }

  private select(index: number): void {
    const choice = this.choices[index];
    if (!choice) return;
    this.selectedId = choice.slotId;
    this.options.forEach((option, optionIndex) => {
      option.tabIndex = optionIndex === index ? 0 : -1;
      option.setAttribute("aria-selected", String(optionIndex === index));
      option.classList.toggle("is-selected", optionIndex === index);
    });
    this.load.disabled = false;
    this.root.querySelector<HTMLElement>("[data-campaign-checkpoint-selection]")!.textContent = `Selected: ${choice.label}`;
    this.focusOption();
  }
}
