/**
 * MODULE: CampaignCommandNavigator
 * WHAT: Resolves alerts, reports, lists, and map targets into one command-interface destination.
 * WHY: Every route to an entity must produce the same workspace, overlay, selection, and focus result.
 *
 * DEPENDENCIES: CampaignCommandUIState and CampaignUIEvents.
 * EXPORTS: CampaignCommandNavigator and navigation target contracts.
 */

import type { CampaignCommandAlertTarget, CampaignCommandAfterActionDecisionView } from "./CampaignCommandShell";
import {
  CampaignCommandUIState,
  type CampaignCommandSelection,
  type CampaignOverlayId,
  type CampaignWorkspaceId
} from "./CampaignCommandUIState";

export type CampaignCommandNavigationKind = CampaignCommandAlertTarget | CampaignCommandAfterActionDecisionView["targetKind"];

export interface CampaignCommandNavigationTarget {
  readonly kind: CampaignCommandNavigationKind;
  readonly id: string | null;
  readonly focus?: boolean;
}

interface ResolvedCampaignCommandDestination {
  readonly workspace: CampaignWorkspaceId;
  readonly overlay: CampaignOverlayId;
  readonly selection: CampaignCommandSelection;
}

/** Pure navigation coordinator; it never looks up or mutates campaign state. */
export class CampaignCommandNavigator {
  public constructor(private readonly uiState: CampaignCommandUIState) {}

  public navigate(target: CampaignCommandNavigationTarget): ResolvedCampaignCommandDestination {
    const destination = this.resolve(target);
    this.uiState.setWorkspace(destination.workspace, `navigate:${target.kind}`);
    this.uiState.setOverlay(destination.overlay, `navigate:${target.kind}`);
    this.uiState.setSelection(destination.selection, `navigate:${target.kind}`);
    this.uiState.getEvents().emit("focus:requested", {
      ...destination,
      focus: target.focus !== false
    });
    return destination;
  }

  public resolve(target: CampaignCommandNavigationTarget): ResolvedCampaignCommandDestination {
    const id = target.id;
    switch (target.kind) {
      case "formation":
        return { workspace: "forces", overlay: "forces", selection: id ? { kind: "formation", id } : null };
      case "objective":
        return { workspace: "situation", overlay: "objectives", selection: id ? { kind: "objective", id } : null };
      case "order":
        return { workspace: "situation", overlay: "orders", selection: id ? { kind: "order", id } : null };
      case "intelligence":
        // This layer cannot prove whether a persisted alert ID is a projected contact or an
        // internal operation/event key. CampaignScreen promotes only validated contact IDs.
        return { workspace: "intelligence", overlay: "intelligence", selection: null };
      case "logistics":
        return { workspace: "logistics", overlay: "operational", selection: null };
      case "infrastructure":
        return { workspace: "logistics", overlay: "operational", selection: id ? { kind: "hex", id } : null };
      case "engagement":
        return { workspace: "situation", overlay: "operational", selection: id ? { kind: "report", id } : null };
      case "campaign":
      case "time":
      default:
        return { workspace: "situation", overlay: "operational", selection: null };
    }
  }
}
