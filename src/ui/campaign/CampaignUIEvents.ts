/**
 * MODULE: CampaignUIEvents
 * WHAT: Provides a typed, in-memory event channel for campaign command-interface coordination.
 * WHY: Map, workspace, inspector, alerts, and order surfaces must coordinate without importing campaign truth.
 *
 * DEPENDENCIES: Type-only campaign UI-state contracts.
 * EXPORTS: CampaignUIEvents and CampaignUIEventMap.
 */

import type {
  CampaignCommandSelection,
  CampaignCommandUIStateSnapshot,
  CampaignOverlayId,
  CampaignWorkspaceId
} from "./CampaignCommandUIState";

export interface CampaignCommandFocusRequest {
  readonly workspace: CampaignWorkspaceId;
  readonly overlay: CampaignOverlayId;
  readonly selection: CampaignCommandSelection;
  readonly focus: boolean;
}

export interface CampaignUIEventMap {
  "state:changed": {
    readonly previous: CampaignCommandUIStateSnapshot;
    readonly current: CampaignCommandUIStateSnapshot;
    readonly reason: string;
  };
  "focus:requested": CampaignCommandFocusRequest;
  "gesture:cancelled": { readonly reason: "escape" | "navigation" | "explicit" };
}

type CampaignUIEventName = keyof CampaignUIEventMap;
type CampaignUIEventListener<K extends CampaignUIEventName> = (payload: CampaignUIEventMap[K]) => void;

/** Small typed emitter scoped to one mounted campaign command screen. */
export class CampaignUIEvents {
  private readonly listeners = new Map<CampaignUIEventName, Set<(payload: never) => void>>();

  public on<K extends CampaignUIEventName>(
    eventName: K,
    listener: CampaignUIEventListener<K>
  ): () => void {
    const listeners = this.listeners.get(eventName) ?? new Set<(payload: never) => void>();
    listeners.add(listener as (payload: never) => void);
    this.listeners.set(eventName, listeners);
    return () => {
      listeners.delete(listener as (payload: never) => void);
      if (listeners.size === 0) this.listeners.delete(eventName);
    };
  }

  public emit<K extends CampaignUIEventName>(eventName: K, payload: CampaignUIEventMap[K]): void {
    const listeners = this.listeners.get(eventName);
    if (!listeners) return;
    [...listeners].forEach((listener) => listener(payload as never));
  }

  public clear(): void {
    this.listeners.clear();
  }
}
