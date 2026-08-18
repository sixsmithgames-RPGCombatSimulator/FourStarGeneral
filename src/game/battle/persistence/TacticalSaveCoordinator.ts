import type { TacticalSaveAvailability } from "./BattleSaveTypes";
import type { FourStarSaveSlotType } from "../../campaign/persistence/CampaignSaveTypes";

/** Player/system reason for creating a campaign-owned tactical checkpoint. */
export type TacticalSaveTrigger = "manual" | "battle-turn-start" | "battle-before-exit";

export const TACTICAL_TURN_AUTOSAVE_SLOT_COUNT = 3;

/** Maps every tactical turn onto one of three fixed rolling autosave identities. */
export function buildTacticalTurnAutosaveSlotId(prefix: string, turn: number): string {
  if (!Number.isInteger(turn) || turn < 0) throw new Error("Tactical autosave turn must be a non-negative integer.");
  return `${prefix}autosave:battle-turn-start-${turn % TACTICAL_TURN_AUTOSAVE_SLOT_COUNT}`;
}

/** Complete persistence intent retained while the tactical engine reaches a stable boundary. */
export interface TacticalSaveIntent {
  readonly trigger: TacticalSaveTrigger;
  readonly slotId: string;
  readonly label: string;
  readonly slotType: Extract<FourStarSaveSlotType, "manual" | "autosave">;
  readonly requestedAt: string;
  readonly dedupeKey: string | null;
}

export type TacticalSaveCoordinatorStatus = "idle" | "queued" | "saving" | "saved" | "failed";

/** Presentation-safe scheduler state; no mutable save payload is exposed. */
export interface TacticalSaveCoordinatorSnapshot {
  readonly status: TacticalSaveCoordinatorStatus;
  readonly message: string;
  readonly activeIntent: TacticalSaveIntent | null;
  readonly queuedManual: TacticalSaveIntent | null;
  readonly queuedAutosave: TacticalSaveIntent | null;
  readonly lastCompleted: TacticalSaveIntent | null;
  readonly error: string | null;
}

export interface TacticalSaveCoordinatorHost {
  getAvailability(): TacticalSaveAvailability;
  persist(intent: TacticalSaveIntent): Promise<void>;
}

export type TacticalSaveCoordinatorListener = (snapshot: TacticalSaveCoordinatorSnapshot) => void;

function cloneIntent(intent: TacticalSaveIntent | null): TacticalSaveIntent | null {
  return intent ? structuredClone(intent) : null;
}

/**
 * Serializes tactical save writes and retains requests until the host proves a stable boundary.
 * Manual requests always take priority over autosaves and only the newest queued request of each kind is kept.
 */
export class TacticalSaveCoordinator {
  private readonly host: TacticalSaveCoordinatorHost;
  private readonly listeners = new Set<TacticalSaveCoordinatorListener>();
  private readonly completedAutosaveKeys = new Set<string>();
  private queuedManual: TacticalSaveIntent | null = null;
  private queuedAutosave: TacticalSaveIntent | null = null;
  private activeIntent: TacticalSaveIntent | null = null;
  private lastCompleted: TacticalSaveIntent | null = null;
  private status: TacticalSaveCoordinatorStatus = "idle";
  private message = "No tactical save is queued.";
  private error: string | null = null;
  private inFlight: Promise<void> | null = null;

  public constructor(host: TacticalSaveCoordinatorHost) {
    this.host = host;
  }

  public subscribe(listener: TacticalSaveCoordinatorListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  public getSnapshot(): TacticalSaveCoordinatorSnapshot {
    return {
      status: this.status,
      message: this.message,
      activeIntent: cloneIntent(this.activeIntent),
      queuedManual: cloneIntent(this.queuedManual),
      queuedAutosave: cloneIntent(this.queuedAutosave),
      lastCompleted: cloneIntent(this.lastCompleted),
      error: this.error
    };
  }

  /** Queues or immediately executes a named manual save. A newer request replaces an older queued manual request. */
  public async requestManual(intent: TacticalSaveIntent): Promise<TacticalSaveCoordinatorSnapshot> {
    if (intent.trigger !== "manual" || intent.slotType !== "manual") {
      throw new Error("Manual tactical save requests require manual trigger and slot type.");
    }
    this.queuedManual = structuredClone(intent);
    const availability = this.host.getAvailability();
    this.status = "queued";
    this.message = availability.stable
      ? "Save queued behind the current storage write."
      : `Save queued. ${availability.reason ?? "Waiting for the next stable tactical boundary."}`;
    this.error = null;
    this.emit();
    await this.flush();
    return this.getSnapshot();
  }

  /** Queues a rotating autosave once per dedupe key. Duplicate turn notifications are ignored. */
  public async requestAutosave(intent: TacticalSaveIntent): Promise<TacticalSaveCoordinatorSnapshot> {
    if (intent.trigger === "manual" || intent.slotType !== "autosave" || !intent.dedupeKey) {
      throw new Error("Tactical autosaves require an autosave trigger, slot type, and dedupe key.");
    }
    if (this.completedAutosaveKeys.has(intent.dedupeKey)
      || this.queuedAutosave?.dedupeKey === intent.dedupeKey
      || this.activeIntent?.dedupeKey === intent.dedupeKey) {
      return this.getSnapshot();
    }
    this.queuedAutosave = structuredClone(intent);
    if (!this.queuedManual && !this.inFlight) {
      const availability = this.host.getAvailability();
      this.status = availability.stable ? "queued" : this.status;
      this.message = availability.stable
        ? "Preparing tactical autosave."
        : this.message;
      this.emit();
    }
    await this.flush();
    return this.getSnapshot();
  }

  /** Attempts the highest-priority queued request and is safe to call from overlapping UI/state notifications. */
  public async flush(): Promise<TacticalSaveCoordinatorSnapshot> {
    if (this.inFlight) {
      await this.inFlight;
      return this.getSnapshot();
    }
    const availability = this.host.getAvailability();
    if (!availability.stable) {
      if (this.queuedManual) {
        this.status = "queued";
        this.message = `Save queued. ${availability.reason ?? "Waiting for the next stable tactical boundary."}`;
        this.emit();
      }
      return this.getSnapshot();
    }

    const next = this.queuedManual ?? this.queuedAutosave;
    if (!next) return this.getSnapshot();
    if (this.queuedManual === next) this.queuedManual = null;
    if (this.queuedAutosave === next) this.queuedAutosave = null;
    this.activeIntent = structuredClone(next);
    this.status = "saving";
    this.message = next.trigger === "manual" ? "Saving tactical battle…" : "Creating tactical autosave…";
    this.error = null;
    this.emit();

    this.inFlight = this.persist(next);
    await this.inFlight;
    this.inFlight = null;

    if (this.queuedManual || this.queuedAutosave) {
      await this.flush();
    }
    return this.getSnapshot();
  }

  private async persist(intent: TacticalSaveIntent): Promise<void> {
    try {
      await this.host.persist(intent);
      this.activeIntent = null;
      this.lastCompleted = structuredClone(intent);
      if (intent.dedupeKey) this.completedAutosaveKeys.add(intent.dedupeKey);
      this.status = "saved";
      this.message = intent.trigger === "manual"
        ? `Saved “${intent.label}”.`
        : intent.trigger === "battle-turn-start"
          ? "Turn-start autosave complete."
          : "Before-exit autosave complete.";
      this.error = null;
    } catch (error) {
      this.activeIntent = null;
      this.status = "failed";
      this.error = error instanceof Error ? error.message : String(error);
      this.message = `Tactical save failed. ${this.error}`;
    }
    this.emit();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
