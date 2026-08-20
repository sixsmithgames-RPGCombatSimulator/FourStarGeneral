/**
 * MODULE: CampaignCommandUIState
 * WHAT: Owns ephemeral campaign command-interface navigation, selection, and sheet state.
 * WHY: Interface state must be synchronized without becoming a second source of campaign truth.
 *
 * DEPENDENCIES: CampaignUIEvents only.
 * EXPORTS: Stable workspace/overlay/selection contracts and CampaignCommandUIState.
 */

import { CampaignUIEvents } from "./CampaignUIEvents";

export type CampaignWorkspaceId = "situation" | "forces" | "logistics" | "intelligence";

export type CampaignOverlayId =
  | "operational"
  | "forces"
  | "objectives"
  | "supply"
  | "intelligence"
  | "environment"
  | "airNaval"
  | "orders";

export type CampaignCommandSelection =
  | { readonly kind: "hex"; readonly id: string }
  | { readonly kind: "formation"; readonly id: string }
  | { readonly kind: "front"; readonly id: string }
  | { readonly kind: "objective"; readonly id: string }
  | { readonly kind: "order"; readonly id: string }
  | { readonly kind: "contact"; readonly id: string }
  | { readonly kind: "report"; readonly id: string }
  | { readonly kind: "weatherZone"; readonly id: string }
  | null;

export type CampaignCommandSheetId = "workspace" | "inspector" | "timeline" | "afterAction" | "orderComposer" | null;

export interface CampaignCommandUIStateSnapshot {
  readonly workspace: CampaignWorkspaceId;
  readonly overlay: CampaignOverlayId;
  readonly selection: CampaignCommandSelection;
  readonly openSheet: CampaignCommandSheetId;
  readonly workspaceExpanded: boolean;
  readonly inspectorExpanded: boolean;
  readonly timelineExpanded: boolean;
  readonly afterActionExpanded: boolean;
  readonly orderComposerExpanded: boolean;
}

const DEFAULT_UI_STATE: CampaignCommandUIStateSnapshot = Object.freeze({
  workspace: "situation",
  overlay: "operational",
  selection: null,
  openSheet: "workspace",
  workspaceExpanded: true,
  inspectorExpanded: false,
  timelineExpanded: false,
  afterActionExpanded: false,
  orderComposerExpanded: false
});

function sameSelection(left: CampaignCommandSelection, right: CampaignCommandSelection): boolean {
  return left === right || (left !== null && right !== null && left.kind === right.kind && left.id === right.id);
}

function freezeSnapshot(snapshot: CampaignCommandUIStateSnapshot): CampaignCommandUIStateSnapshot {
  const selection = snapshot.selection ? Object.freeze({ ...snapshot.selection }) : null;
  return Object.freeze({ ...snapshot, selection });
}

/**
 * Ephemeral store for interface-only state.
 * It intentionally contains no economy, force strength, order legality, fog, objective, or campaign-time values.
 */
export class CampaignCommandUIState {
  private snapshot: CampaignCommandUIStateSnapshot;

  public constructor(
    private readonly events: CampaignUIEvents = new CampaignUIEvents(),
    initial: Partial<CampaignCommandUIStateSnapshot> = {}
  ) {
    this.snapshot = freezeSnapshot({ ...DEFAULT_UI_STATE, ...initial });
  }

  public getSnapshot(): CampaignCommandUIStateSnapshot {
    return this.snapshot;
  }

  public getEvents(): CampaignUIEvents {
    return this.events;
  }

  public setWorkspace(workspace: CampaignWorkspaceId, reason = "workspace-selected"): void {
    this.update({
      workspace,
      openSheet: "workspace",
      workspaceExpanded: true,
      inspectorExpanded: false
    }, reason);
  }

  public setOverlay(overlay: CampaignOverlayId, reason = "overlay-selected"): void {
    this.update({ overlay }, reason);
  }

  public setSelection(selection: CampaignCommandSelection, reason = "selection-changed"): void {
    if (sameSelection(this.snapshot.selection, selection)) return;
    this.update({ selection }, reason);
  }

  public revealInspector(selection: CampaignCommandSelection = this.snapshot.selection, reason = "inspector-revealed"): void {
    this.update({
      selection,
      openSheet: "inspector",
      workspaceExpanded: false,
      inspectorExpanded: true,
      timelineExpanded: false,
      afterActionExpanded: false,
      orderComposerExpanded: false
    }, reason);
  }

  public openSheet(sheet: Exclude<CampaignCommandSheetId, null>, reason = "sheet-opened"): void {
    this.update({
      openSheet: sheet,
      workspaceExpanded: sheet === "workspace",
      inspectorExpanded: sheet === "inspector",
      timelineExpanded: sheet === "timeline",
      afterActionExpanded: sheet === "afterAction",
      orderComposerExpanded: sheet === "orderComposer"
    }, reason);
  }

  public setSheetExpanded(
    sheet: Exclude<CampaignCommandSheetId, null>,
    expanded: boolean,
    reason = "sheet-visibility-changed"
  ): void {
    if (expanded) {
      this.openSheet(sheet, reason);
    } else if (this.snapshot.openSheet === sheet) {
      this.closeSheets(reason);
    }
  }

  public closeSheets(reason = "sheets-closed"): void {
    this.update({
      openSheet: null,
      workspaceExpanded: false,
      inspectorExpanded: false,
      timelineExpanded: false,
      afterActionExpanded: false,
      orderComposerExpanded: false
    }, reason);
  }

  public cancelGesture(reason: "escape" | "navigation" | "explicit" = "explicit"): void {
    this.closeSheets(`gesture-cancelled:${reason}`);
    this.events.emit("gesture:cancelled", { reason });
  }

  private update(patch: Partial<CampaignCommandUIStateSnapshot>, reason: string): void {
    const next = freezeSnapshot({ ...this.snapshot, ...patch });
    const changed = (Object.keys(next) as Array<keyof CampaignCommandUIStateSnapshot>)
      .some((key) => key === "selection"
        ? !sameSelection(this.snapshot.selection, next.selection)
        : this.snapshot[key] !== next[key]);
    if (!changed) return;
    const previous = this.snapshot;
    this.snapshot = next;
    this.events.emit("state:changed", { previous, current: next, reason });
  }
}
