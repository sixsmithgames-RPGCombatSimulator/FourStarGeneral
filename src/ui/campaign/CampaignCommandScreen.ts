/**
 * MODULE: CampaignCommandScreen
 * WHAT: Composes the campaign command UI state, navigation, projection finalization, and compatibility renderer.
 * WHY: CampaignScreen should orchestrate domain services while this class owns interface-only coordination.
 *
 * DEPENDENCIES: Browser DOM and projection-safe campaign UI modules only.
 * EXPORTS: CampaignCommandScreen.
 */

import {
  CampaignCommandShell,
  type CampaignCommandShellCallbacks,
  type CampaignCommandShellView
} from "./CampaignCommandShell";
import { isCampaignCommandUIV2Enabled } from "./CampaignCommandFeatureFlags";
import {
  CampaignCommandNavigator,
  type CampaignCommandNavigationTarget
} from "./CampaignCommandNavigator";
import {
  CampaignCommandUIState,
  type CampaignCommandSelection,
  type CampaignWorkspaceId
} from "./CampaignCommandUIState";
import { CampaignCommandViewAssembler } from "./CampaignCommandViewAssembler";
import { getCampaignWorkspaceDefaultOverlay } from "./CampaignMapOverlayRegistry";
import { CampaignCompactSheetManager } from "./components/CampaignCompactSheetManager";
import {
  CampaignMapOverlayController,
  type CampaignRedeploymentDestinationListEntry,
  type CampaignMapOverlayPerformanceSnapshot
} from "./components/CampaignMapOverlayController";

export interface CampaignCommandScreenOptions {
  readonly uiState?: CampaignCommandUIState;
  readonly v2Enabled?: boolean;
}

/**
 * Presentation-only composition root. The compatibility shell remains the renderer during the strangler migration;
 * all new regions can now share one state/navigation/projection boundary without changing campaign rules.
 */
export class CampaignCommandScreen {
  private readonly uiState: CampaignCommandUIState;
  private readonly navigator: CampaignCommandNavigator;
  private readonly viewAssembler = new CampaignCommandViewAssembler();
  private readonly shell: CampaignCommandShell;
  private readonly sheetManager: CampaignCompactSheetManager;
  private readonly overlayController: CampaignMapOverlayController;
  private readonly v2Enabled: boolean;
  private unsubscribeState: (() => void) | null = null;
  private unsubscribeFocus: (() => void) | null = null;
  private initialized = false;

  public constructor(
    private readonly root: HTMLElement,
    callbacks: CampaignCommandShellCallbacks = {},
    options: CampaignCommandScreenOptions = {}
  ) {
    this.uiState = options.uiState ?? new CampaignCommandUIState();
    this.navigator = new CampaignCommandNavigator(this.uiState);
    this.v2Enabled = options.v2Enabled ?? isCampaignCommandUIV2Enabled();
    this.sheetManager = new CampaignCompactSheetManager(root);
    this.overlayController = new CampaignMapOverlayController(root, {
      onOverlayChanged: (overlay) => this.uiState.setOverlay(overlay, "map-overlay-selected"),
      onSelectionRequested: (selection) => {
        this.uiState.setSelection(selection, "map-list-selection");
        callbacks.onSelectionRequested?.(selection);
        this.revealInspector(selection);
      },
      onListExpandedChanged: (expanded) => {
        if (expanded && typeof window !== "undefined" && window.innerWidth <= 860) {
          this.uiState.closeSheets("compact-map-list-opened");
        }
      }
    });
    this.shell = new CampaignCommandShell(root, {
      ...callbacks,
      onWorkspaceChanged: (workspace) => {
        this.uiState.setWorkspace(workspace, "shell-workspace-selected");
        this.uiState.setOverlay(getCampaignWorkspaceDefaultOverlay(workspace), "shell-workspace-overlay-default");
        callbacks.onWorkspaceChanged?.(workspace);
      },
      onAlertSelected: (targetKind, targetId) => {
        this.navigator.navigate({ kind: targetKind, id: targetId, focus: true });
        callbacks.onAlertSelected?.(targetKind, targetId);
      },
      onCancelGesture: () => {
        this.uiState.cancelGesture("escape");
        callbacks.onCancelGesture?.();
      },
      onWorkspaceExpandedChanged: (expanded) => {
        this.uiState.setSheetExpanded("workspace", expanded, "shell-workspace-visibility");
        callbacks.onWorkspaceExpandedChanged?.(expanded);
      },
      onInspectorExpandedChanged: (expanded) => {
        this.uiState.setSheetExpanded("inspector", expanded, "shell-inspector-visibility");
        callbacks.onInspectorExpandedChanged?.(expanded);
      },
      onTimelineExpandedChanged: (expanded) => {
        this.uiState.setSheetExpanded("timeline", expanded, "shell-timeline-visibility");
        callbacks.onTimelineExpandedChanged?.(expanded);
      },
      onAfterActionExpandedChanged: (expanded) => {
        this.uiState.setSheetExpanded("afterAction", expanded, "shell-after-action-visibility");
        callbacks.onAfterActionExpandedChanged?.(expanded);
      },
      onSelectionRequested: (selection) => {
        this.uiState.setSelection(selection, "shell-selection-requested");
        callbacks.onSelectionRequested?.(selection);
      }
    });
  }

  public initialize(): boolean {
    if (this.initialized) return true;
    if (!this.shell.initialize()) return false;
    if (this.v2Enabled) this.overlayController.initialize();
    this.root.dataset.campaignCommandUi = this.v2Enabled ? "v2" : "compatibility";
    this.root.dataset.campaignCommandState = this.v2Enabled ? "managed" : "compatibility";

    if (this.v2Enabled) {
      this.unsubscribeState = this.uiState.getEvents().on("state:changed", ({ previous, current }) => {
        if (this.shell.getActiveWorkspace() !== current.workspace) {
          this.shell.showWorkspace(current.workspace, false);
        }
        this.root.dataset.campaignWorkspace = current.workspace;
        this.root.dataset.campaignOverlay = current.overlay;
        this.root.dataset.campaignSelection = current.selection?.kind ?? "none";
        this.shell.setSelection(current.selection);
        this.shell.syncUIState(current);
        this.sheetManager.sync(current);
        this.overlayController.setOverlay(current.overlay);
        if (current.inspectorExpanded && !previous.inspectorExpanded) {
          this.focusInspectorEntry();
        }
      });
      this.unsubscribeFocus = this.uiState.getEvents().on("focus:requested", (request) => {
        this.applyFocusRequest(request.workspace, request.selection, request.focus);
      });
    }

    const initial = this.uiState.getSnapshot();
    if (this.v2Enabled) this.sheetManager.start(initial);
    if (this.v2Enabled) this.overlayController.setOverlay(initial.overlay);
    this.root.dataset.campaignWorkspace = initial.workspace;
    this.root.dataset.campaignOverlay = initial.overlay;
    this.root.dataset.campaignSelection = "none";
    this.initialized = true;
    return true;
  }

  public render(view: CampaignCommandShellView): void {
    const assembled = this.viewAssembler.assemble(view);
    this.shell.render(assembled);
    if (this.v2Enabled) this.overlayController.render(assembled);
  }

  public revealInspector(selection: CampaignCommandSelection = this.uiState.getSnapshot().selection): void {
    this.uiState.revealInspector(selection);
    this.shell.setSelection(selection);
    this.shell.revealInspector();
    // A desktop map list can replace the active route while the inspector is already open.
    // Focus the new route explicitly because hiding the selected list row otherwise drops focus to <body>.
    this.focusInspectorEntry();
  }

  public showWorkspace(workspace: CampaignWorkspaceId, focus = false): void {
    this.uiState.setWorkspace(workspace, "screen-workspace-selected");
    this.uiState.setOverlay(getCampaignWorkspaceDefaultOverlay(workspace), "screen-workspace-overlay-default");
    this.shell.showWorkspace(workspace, focus);
  }

  public setRedeploymentTargetMode(
    originHexKey: string | null,
    destinations: readonly CampaignRedeploymentDestinationListEntry[] = []
  ): void {
    this.overlayController.setRedeploymentTargetMode(originHexKey, destinations);
  }

  public navigate(target: CampaignCommandNavigationTarget): void {
    const destination = this.navigator.navigate(target);
    if (!this.v2Enabled) this.applyFocusRequest(destination.workspace, destination.selection, target.focus !== false);
  }

  public getActiveWorkspace(): CampaignWorkspaceId {
    return this.uiState.getSnapshot().workspace;
  }

  public getUIState(): CampaignCommandUIState {
    return this.uiState;
  }

  /** Read-only development/test diagnostic proving overlay changes reuse the rendered-hex index. */
  public getMapOverlayPerformanceSnapshot(): CampaignMapOverlayPerformanceSnapshot {
    return this.overlayController.getPerformanceSnapshot();
  }

  public destroy(): void {
    this.unsubscribeState?.();
    this.unsubscribeFocus?.();
    this.unsubscribeState = null;
    this.unsubscribeFocus = null;
    this.sheetManager.destroy();
    this.overlayController.destroy();
    this.uiState.getEvents().clear();
    this.initialized = false;
  }

  private focusSelection(selection: CampaignCommandSelection, focus: boolean): void {
    if (!selection) return;
    let target: HTMLElement | null = null;
    if (selection.kind === "order") {
      target = this.findByDataset("orderId", selection.id);
    } else if (selection.kind === "objective") {
      target = this.findByDataset("objectiveKey", selection.id);
    } else if (selection.kind === "formation") {
      target = this.findByDataset("formationId", selection.id);
    }
    target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    if (focus && target instanceof HTMLElement) {
      if (target.tabIndex < 0) target.tabIndex = -1;
      target.focus({ preventScroll: true });
    }
  }

  private applyFocusRequest(workspace: CampaignWorkspaceId, selection: CampaignCommandSelection, focus: boolean): void {
    this.shell.showWorkspace(workspace, focus);
    this.shell.setSelection(selection);
    if (workspace === "intelligence" && !this.v2Enabled) {
      this.root.querySelector<HTMLButtonElement>("[data-open-campaign-intelligence]")?.click();
    }
    if (selection) this.shell.revealInspector();
    this.focusSelection(selection, focus);
  }

  private focusInspectorEntry(): void {
    const compact = typeof window !== "undefined" && window.innerWidth <= 1120;
    const focusTarget = compact
      ? this.root.querySelector<HTMLElement>("[data-close-campaign-inspector]")
      : this.root.querySelector<HTMLElement>("#campaignInspectorTitle");
    focusTarget?.focus({ preventScroll: true });
  }

  private findByDataset(key: string, value: string): HTMLElement | null {
    return Array.from(this.root.querySelectorAll<HTMLElement>(`[data-${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`))
      .find((element) => element.dataset[key] === value) ?? null;
  }
}
