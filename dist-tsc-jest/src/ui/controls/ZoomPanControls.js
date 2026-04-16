/**
 * Manages zoom and pan control buttons for the battle map.
 * Wires UI buttons to MapViewport operations.
 */
export class ZoomPanControls {
    constructor(viewport) {
        this.cycleObjectiveHandler = null;
        // Control configuration
        this.ZOOM_INCREMENT = 0.2;
        this.PAN_STEP = 50;
        this.viewport = viewport;
        this.zoomInButton = document.querySelector("#battleZoomIn");
        this.zoomOutButton = document.querySelector("#battleZoomOut");
        this.cycleObjectiveButton = document.querySelector("#battleCycleObjective");
        this.panButtons = Array.from(document.querySelectorAll("[data-pan]"));
        this.bindEvents();
    }
    /**
     * Registers a handler for cycling through objectives
     */
    onCycleObjective(handler) {
        this.cycleObjectiveHandler = handler;
    }
    /**
     * Binds event handlers to control buttons.
     */
    bindEvents() {
        this.bindZoomButtons();
        this.bindPanButtons();
        this.bindCycleObjectiveButton();
    }
    /**
     * Binds zoom in/out buttons.
     */
    bindZoomButtons() {
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
    bindPanButtons() {
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
     * Binds the cycle objective button.
     */
    bindCycleObjectiveButton() {
        this.cycleObjectiveButton?.addEventListener("click", () => {
            if (this.cycleObjectiveHandler) {
                this.cycleObjectiveHandler();
            }
            else {
                // Fallback to reset view if no handler registered
                this.viewport.reset();
            }
        });
    }
}
