import type { BattleState } from "../../state/BattleState";
import type { CampaignStatePersistenceRequest } from "../../state/CampaignState";
import { ensureCampaignState } from "../../state/CampaignState";
import {
  type ActiveCampaignBattleSave,
  type TacticalSaveAvailability
} from "../../game/battle/persistence/BattleSaveTypes";
import {
  TacticalSaveCoordinator,
  buildTacticalTurnAutosaveSlotId,
  type TacticalSaveCoordinatorSnapshot,
  type TacticalSaveIntent
} from "../../game/battle/persistence/TacticalSaveCoordinator";
import type {
  CampaignSaveQuarantineRecord,
  CampaignSaveRecoveryCandidate,
  CampaignSaveSlotIndexEntry
} from "../../game/campaign/persistence/CampaignSaveTypes";
import { createStableCampaignRecordId } from "../../game/campaign/runtime/CampaignCanonical";
import {
  TacticalSaveCenter,
  type TacticalSaveCenterMode,
  type TacticalSaveCenterModel
} from "../components/TacticalSaveCenter";

/** Transient screen facts that decide whether a complete tactical snapshot is safe. */
export interface BattleTacticalSaveUiStability {
  readonly initializationComplete: boolean;
  readonly combatTransactionActive: boolean;
  readonly tacticalDecisionOpen: boolean;
  readonly initiativeActive: boolean;
  readonly initiativeAtBoundary: boolean;
}

/** Presentation metadata added to the campaign-owned save envelope. */
export interface BattleTacticalSavePresentationContext {
  readonly difficulty: string | null;
  readonly selectedHexKey: string | null;
  readonly mapZoom: number | null;
}

export interface BattleTacticalSaveControllerOptions {
  readonly root: HTMLElement;
  readonly battleState: BattleState;
  readonly getStatusElement: () => HTMLElement | null;
  readonly getUiStability: () => BattleTacticalSaveUiStability;
  readonly getPresentationContext: () => BattleTacticalSavePresentationContext;
  readonly captureActiveBattle: () => ActiveCampaignBattleSave;
  readonly resumeActiveBattle: (save: ActiveCampaignBattleSave) => void;
  readonly showBattleScreen: () => void;
  readonly announce: (message: string) => void;
}

/**
 * Owns the tactical save center, queued-save coordinator, storage browsing, and
 * autosave scheduling. BattleScreen retains authoritative capture/resume work
 * and supplies it through narrow callbacks.
 */
export class BattleTacticalSaveController {
  private readonly options: BattleTacticalSaveControllerOptions;
  private readonly coordinator: TacticalSaveCoordinator;
  private coordinatorUnsubscribe: (() => void) | null = null;
  private center: TacticalSaveCenter | null = null;
  private slots: readonly CampaignSaveSlotIndexEntry[] = [];
  private quarantine: readonly CampaignSaveQuarantineRecord[] = [];
  private recoveryCandidate: CampaignSaveRecoveryCandidate | null = null;
  private recoveryMessage: string | null = null;
  private centerBusy = false;
  private pollTimerId: number | null = null;
  private lastFocusElementId: string | null = null;
  private readonly sessionStartedAt = Date.now();
  private listenersBound = false;

  private readonly documentVisibilityHandler = (): void => {
    if (document.visibilityState === "hidden" && !this.options.root.classList.contains("hidden")) {
      void this.requestBeforeExitAutosave();
    }
  };

  private readonly saveCenterOpenHandler = (event: Event): void => {
    const invokerId = (event as CustomEvent<{ invokerId?: string | null }>).detail?.invokerId ?? null;
    const invoker = invokerId ? document.getElementById(invokerId) : null;
    void this.open("load", invoker);
  };

  public constructor(options: BattleTacticalSaveControllerOptions) {
    this.options = options;
    this.coordinator = new TacticalSaveCoordinator({
      getAvailability: () => this.getCampaignTacticalSaveAvailability(),
      persist: (intent) => this.persistIntent(intent)
    });
  }

  /** Creates the center and binds save lifecycle listeners exactly once. */
  public initialize(): void {
    if (!this.center) {
      this.center = new TacticalSaveCenter(document.body, {
        saveNew: (label) => this.requestNewManualSave(label),
        overwrite: (slotId) => this.requestOverwrite(slotId),
        load: (slotId) => this.loadSlot(slotId),
        recover: () => this.recoverCandidateSave(),
        exportQuarantine: (quarantineId) => this.exportQuarantine(quarantineId)
      }, this.buildCenterModel("save"));
      this.coordinatorUnsubscribe = this.coordinator.subscribe((snapshot) => {
        this.handleCoordinatorUpdate(snapshot);
      });
      void this.refreshBrowserData();
    }
    if (!this.listenersBound) {
      document.addEventListener("visibilitychange", this.documentVisibilityHandler);
      document.addEventListener("campaign:battle:saves-open", this.saveCenterOpenHandler);
      this.listenersBound = true;
    }
  }

  public async open(mode: TacticalSaveCenterMode, invoker: HTMLElement | null): Promise<void> {
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : invoker;
    if (active?.id && !active.closest("#tacticalSaveCenter")) {
      this.lastFocusElementId = active.id;
    }
    this.recoveryCandidate = null;
    this.recoveryMessage = null;
    this.center?.open(mode, invoker);
    this.updateCenter(mode);
    await this.refreshBrowserData(mode);
  }

  public async flush(): Promise<void> {
    await this.coordinator.flush();
  }

  public async requestTurnStartAutosave(): Promise<void> {
    const runtime = ensureCampaignState().getRuntimeSnapshot();
    const prefix = this.getSlotPrefix();
    const turn = this.options.battleState.getBattleTurnSnapshot();
    if (!runtime?.activeEngagementId || !prefix || !turn
      || !this.options.battleState.getCampaignBridgeState()
      || turn.phase !== "playerTurn" || turn.activeFaction !== "Player") return;
    await this.coordinator.requestAutosave({
      trigger: "battle-turn-start",
      slotId: buildTacticalTurnAutosaveSlotId(prefix, turn.turnNumber),
      label: `Turn ${turn.turnNumber} start`,
      slotType: "autosave",
      requestedAt: new Date().toISOString(),
      dedupeKey: `${runtime.campaignId}:${runtime.activeEngagementId}:turn-start:${turn.turnNumber}`
    });
  }

  public async requestBeforeExitAutosave(): Promise<void> {
    const runtime = ensureCampaignState().getRuntimeSnapshot();
    const prefix = this.getSlotPrefix();
    const turn = this.options.battleState.getBattleTurnSnapshot();
    const availability = this.getCampaignTacticalSaveAvailability();
    if (!runtime?.activeEngagementId || !prefix || !turn || !availability.stable) return;
    const requestedAt = new Date().toISOString();
    await this.coordinator.requestAutosave({
      trigger: "battle-before-exit",
      slotId: `${prefix}autosave:battle-before-exit`,
      label: `Before exit · Turn ${turn.turnNumber}`,
      slotType: "autosave",
      requestedAt,
      dedupeKey: `${runtime.campaignId}:${runtime.activeEngagementId}:before-exit:${requestedAt}`
    });
  }

  /** Reports whether an exact snapshot can be taken without capturing an in-flight transaction. */
  public getTacticalSaveAvailability(): TacticalSaveAvailability {
    const turn = this.options.battleState.getBattleTurnSnapshot();
    const ui = this.options.getUiStability();
    if (!turn || !ui.initializationComplete) {
      return { stable: false, boundary: null, reason: "Battle initialization is not complete." };
    }
    if (turn.phase === "completed") {
      return { stable: false, boundary: null, reason: "The battle is complete and must reconcile with the campaign." };
    }
    if (ui.combatTransactionActive) {
      return { stable: false, boundary: null, reason: "A combat or animation transaction is still resolving." };
    }
    if (ui.tacticalDecisionOpen) {
      return { stable: false, boundary: null, reason: "Finish or cancel the open tactical decision first." };
    }
    if (turn.phase !== "deployment" && turn.activeFaction !== "Player") {
      return { stable: false, boundary: null, reason: "Enemy or allied automation is still resolving." };
    }

    const kind = turn.phase === "deployment"
      ? "deploymentActionComplete" as const
      : ui.initiativeActive && ui.initiativeAtBoundary
        ? "activationBoundary" as const
        : turn.phase === "playerTurn"
          ? "playerDecision" as const
          : "turnBoundary" as const;
    return {
      stable: true,
      boundary: {
        kind,
        turn: turn.turnNumber,
        phase: turn.phase,
        activeFaction: turn.activeFaction
      },
      reason: null
    };
  }

  public getLastFocusElementId(): string | null {
    return this.lastFocusElementId;
  }

  public setLastFocusElementId(value: string | null): void {
    this.lastFocusElementId = value;
  }

  /** Releases DOM, subscription, and polling resources. Safe to call repeatedly. */
  public dispose(): void {
    if (this.coordinatorUnsubscribe) {
      this.coordinatorUnsubscribe();
      this.coordinatorUnsubscribe = null;
    }
    if (this.pollTimerId !== null) {
      window.clearInterval(this.pollTimerId);
      this.pollTimerId = null;
    }
    this.center?.dispose();
    this.center = null;
    if (this.listenersBound) {
      document.removeEventListener("visibilitychange", this.documentVisibilityHandler);
      document.removeEventListener("campaign:battle:saves-open", this.saveCenterOpenHandler);
      this.listenersBound = false;
    }
  }

  private buildCenterModel(mode: TacticalSaveCenterMode): TacticalSaveCenterModel {
    const coordinator = this.coordinator.getSnapshot();
    return {
      mode,
      slots: this.slots,
      quarantine: this.quarantine,
      availability: this.getCampaignTacticalSaveAvailability(),
      coordinator,
      recoveryMessage: this.recoveryMessage,
      recoveryAvailable: this.recoveryCandidate !== null,
      busy: this.centerBusy || coordinator.status === "saving"
    };
  }

  private updateCenter(mode?: TacticalSaveCenterMode): void {
    if (!this.center) return;
    const currentMode = mode ?? (this.center.isOpen() && this.options.root.querySelector("#tacticalSaveCenter")?.getAttribute("data-mode") === "load"
      ? "load"
      : "save");
    this.center.update(this.buildCenterModel(currentMode));
  }

  private handleCoordinatorUpdate(snapshot: TacticalSaveCoordinatorSnapshot): void {
    const statusElement = this.options.getStatusElement();
    if (statusElement) {
      statusElement.textContent = snapshot.message;
      statusElement.dataset.state = snapshot.status;
    }
    const hasQueuedRequest = Boolean(snapshot.queuedManual || snapshot.queuedAutosave);
    if (hasQueuedRequest && this.pollTimerId === null) {
      this.pollTimerId = window.setInterval(() => {
        this.updateCenter();
        void this.coordinator.flush();
      }, 250);
    } else if (!hasQueuedRequest && this.pollTimerId !== null) {
      window.clearInterval(this.pollTimerId);
      this.pollTimerId = null;
    }
    this.updateCenter();
  }

  private getCampaignTacticalSaveAvailability(): TacticalSaveAvailability {
    const runtime = ensureCampaignState().getRuntimeSnapshot();
    const bridge = this.options.battleState.getCampaignBridgeState();
    if (!runtime || !runtime.activeEngagementId || !bridge) {
      return {
        stable: false,
        boundary: null,
        reason: "Tactical saves are available for campaign-linked battles. This operation has no active campaign engagement."
      };
    }
    return this.getTacticalSaveAvailability();
  }

  private getSlotPrefix(): string | null {
    const runtime = ensureCampaignState().getRuntimeSnapshot();
    return runtime ? `battle:${runtime.campaignId}:` : null;
  }

  private async refreshBrowserData(mode?: TacticalSaveCenterMode): Promise<void> {
    const prefix = this.getSlotPrefix();
    if (!prefix) {
      this.slots = [];
      this.quarantine = [];
      this.updateCenter(mode);
      return;
    }
    try {
      const campaignState = ensureCampaignState();
      const [slots, quarantine] = await Promise.all([
        campaignState.listCampaignSaveSlots(),
        campaignState.listCampaignSaveQuarantine()
      ]);
      this.slots = slots
        .filter((slot) => slot.slotId.startsWith("battle:"))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      this.quarantine = quarantine
        .filter((record) => record.slotId.startsWith("battle:"))
        .sort((left, right) => right.quarantinedAt.localeCompare(left.quarantinedAt));
    } catch (error) {
      this.recoveryMessage = error instanceof Error
        ? `Save storage could not be inspected: ${error.message}`
        : "Save storage could not be inspected.";
    }
    this.updateCenter(mode);
  }

  public buildPersistenceRequest(timestamp: string, label: string): CampaignStatePersistenceRequest {
    const presentation = this.options.getPresentationContext();
    return {
      timestamp,
      label,
      playTimeSeconds: Math.max(0, Math.floor((Date.now() - this.sessionStartedAt) / 1000)),
      difficulty: presentation.difficulty,
      commanderRosterLink: this.options.battleState.getAssignedCommanderId(),
      uiResumeContext: {
        workspace: "operations",
        selectedEntityId: presentation.selectedHexKey,
        mapCenter: null,
        mapZoom: presentation.mapZoom
      }
    };
  }

  private async persistIntent(intent: TacticalSaveIntent): Promise<void> {
    const availability = this.getCampaignTacticalSaveAvailability();
    if (!availability.stable || !availability.boundary) {
      throw new Error(availability.reason ?? "The tactical battle is not at a stable save boundary.");
    }
    const activeBattle = this.options.captureActiveBattle();
    const timestamp = new Date().toISOString();
    await ensureCampaignState().saveCampaignSlot({
      ...this.buildPersistenceRequest(timestamp, intent.label),
      slotId: intent.slotId,
      slotType: intent.slotType,
      thumbnailKey: `tactical:${activeBattle.engagementPackage.scenarioKey}:${activeBattle.engagementPackage.engagementId}:turn-${activeBattle.battle.boundary.turn}`
    });
    await this.refreshBrowserData();
    if (intent.trigger === "manual") {
      this.options.announce(`Tactical checkpoint saved as ${intent.label}.`);
    }
  }

  private async requestNewManualSave(label: string): Promise<void> {
    const runtime = ensureCampaignState().getRuntimeSnapshot();
    const prefix = this.getSlotPrefix();
    if (!runtime?.activeEngagementId || !prefix || !this.options.battleState.getCampaignBridgeState()) {
      this.recoveryMessage = this.getCampaignTacticalSaveAvailability().reason;
      this.updateCenter("save");
      return;
    }
    const requestedAt = new Date().toISOString();
    const slotId = `${prefix}manual:${createStableCampaignRecordId("slot", runtime.campaignId, label, requestedAt)}`;
    await this.coordinator.requestManual({
      trigger: "manual",
      slotId,
      label,
      slotType: "manual",
      requestedAt,
      dedupeKey: null
    });
  }

  private async requestOverwrite(slotId: string): Promise<void> {
    if (!ensureCampaignState().getRuntimeSnapshot()?.activeEngagementId || !this.options.battleState.getCampaignBridgeState()) {
      this.recoveryMessage = this.getCampaignTacticalSaveAvailability().reason;
      this.updateCenter("save");
      return;
    }
    const slot = this.slots.find((candidate) => candidate.slotId === slotId && candidate.slotType === "manual");
    if (!slot) {
      this.recoveryMessage = "The selected manual checkpoint is no longer available.";
      this.updateCenter("save");
      return;
    }
    await this.coordinator.requestManual({
      trigger: "manual",
      slotId: slot.slotId,
      label: slot.label,
      slotType: "manual",
      requestedAt: new Date().toISOString(),
      dedupeKey: null
    });
  }

  private async loadSlot(slotId: string): Promise<void> {
    const slot = this.slots.find((candidate) => candidate.slotId === slotId);
    if (!slot || this.centerBusy) return;
    const coordinator = this.coordinator.getSnapshot();
    if (coordinator.status === "saving" || coordinator.queuedManual || coordinator.queuedAutosave || coordinator.activeIntent) {
      this.recoveryMessage = "Wait for the current queued save or autosave to finish before loading another checkpoint.";
      this.updateCenter("load");
      return;
    }
    this.centerBusy = true;
    this.recoveryCandidate = null;
    this.recoveryMessage = null;
    this.updateCenter("load");
    try {
      const result = await ensureCampaignState().loadCampaignSlot(
        slot.slotId,
        this.buildPersistenceRequest(new Date().toISOString(), slot.label)
      );
      if (!result.ok) {
        this.recoveryCandidate = result.recoveryCandidate;
        this.recoveryMessage = result.recoveryCandidate
          ? `${result.error.message} A verified earlier checkpoint is available and has not been applied.`
          : result.error.message;
        await this.refreshBrowserData("load");
        return;
      }
      const activeBattle = ensureCampaignState().getActiveBattleSave();
      if (!activeBattle) throw new Error("The selected campaign checkpoint does not contain an active tactical battle.");
      this.options.resumeActiveBattle(activeBattle);
      this.options.showBattleScreen();
      this.center?.close();
      this.options.announce(`Tactical checkpoint ${slot.label} restored.`);
    } catch (error) {
      this.recoveryMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.centerBusy = false;
      this.updateCenter("load");
    }
  }

  private async recoverCandidateSave(): Promise<void> {
    const candidate = this.recoveryCandidate;
    if (!candidate || this.centerBusy) return;
    this.centerBusy = true;
    this.updateCenter("load");
    try {
      ensureCampaignState().restoreCampaignRecovery(candidate);
      const activeBattle = ensureCampaignState().getActiveBattleSave();
      if (!activeBattle) throw new Error("The verified recovery checkpoint has no active tactical battle.");
      this.options.resumeActiveBattle(activeBattle);
      this.options.showBattleScreen();
      this.recoveryCandidate = null;
      this.recoveryMessage = null;
      this.center?.close();
      this.options.announce("Earlier verified tactical checkpoint recovered. The damaged record remains quarantined.");
    } catch (error) {
      this.recoveryMessage = error instanceof Error ? error.message : String(error);
    } finally {
      this.centerBusy = false;
      this.updateCenter("load");
    }
  }

  private exportQuarantine(quarantineId: string): void {
    const record = this.quarantine.find((candidate) => candidate.quarantineId === quarantineId);
    if (!record) return;
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `four-star-quarantine-${record.saveId}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
