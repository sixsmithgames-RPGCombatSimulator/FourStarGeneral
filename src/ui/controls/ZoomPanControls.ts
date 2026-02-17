import type { IMapViewport } from "../../contracts/IMapViewport";

/**
 * Manages zoom and pan control buttons for the battle map.
 * Wires UI buttons to MapViewport operations.
 */
export class ZoomPanControls {
  private readonly viewport: IMapViewport;

  // Control configuration
  private readonly ZOOM_INCREMENT = 0.2;
  private readonly PAN_STEP = 50;

  // DOM element references
  private readonly zoomInButton: HTMLButtonElement | null;
  private readonly zoomOutButton: HTMLButtonElement | null;
  private readonly cycleObjectiveButton: HTMLButtonElement | null;
  private readonly panButtons: HTMLButtonElement[];

  constructor(viewport: IMapViewport) {
    this.viewport = viewport;

    this.zoomInButton = document.querySelector("#battleZoomIn");
    this.zoomOutButton = document.querySelector("#battleZoomOut");
    this.cycleObjectiveButton = document.querySelector("#battleCycleObjective");
    this.panButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-pan]"));

    this.bindEvents();
  }

  /**
   * Binds event handlers to control buttons.
   */
  private bindEvents(): void {
    this.bindZoomButtons();
    this.bindPanButtons();
    this.bindCycleObjectiveButton();
  }

  /**
   * Binds zoom in/out buttons.
   */
  bindZoomButtons(): void {
    this.zoomInButton?.addEventListener("click", () => {
      this.viewport.adjustZoom(this.ZOOM_INCREMENT);
    });

    this.zoomOutButton?.addEventListener("click", () => {
      this.viewport.adjustZoom(-this.ZOOM_INCREMENT);
    });
  }

  /**
   * Binds directional pan buttons.
   */
  bindPanButtons(): void {
    this.panButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const direction = button.dataset.pan;

        switch (direction) {
          case "up":
            this.viewport.pan(0, this.PAN_STEP);
            break;
          case "down":
            this.viewport.pan(0, -this.PAN_STEP);
            break;
          case "left":
            this.viewport.pan(this.PAN_STEP, 0);
            break;
          case "right":
            this.viewport.pan(-this.PAN_STEP, 0);
            break;
        }
      });
    });
  }

  /**
   * Binds the reset view button.
   */
  bindCycleObjectiveButton(): void {
    this.cycleObjectiveButton?.addEventListener("click", () => {
      this.viewport.reset();
    });
  }
}
