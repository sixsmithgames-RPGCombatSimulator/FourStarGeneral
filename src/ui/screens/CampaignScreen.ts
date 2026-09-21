import type { IScreenManager } from "../../contracts/IScreenManager";
import { CAMPAIGN_SEGMENT_HOURS, type CampaignPendingEngagement, type CampaignScenarioData, type ProductionAllocation } from "../../core/campaignTypes";
import type { CampaignIntelOperationType, CampaignIntelOperationView, CampaignMapViewModel } from "../../core/campaignIntelTypes";
import type {
  CampaignOrder,
  CampaignOrderActionPreview
} from "../../game/campaign/orders/CampaignOrderTypes";
import type { CampaignAdvanceStopReason, CampaignRuntimeState, CampaignScenarioDefinition } from "../../game/campaign/runtime/campaignRuntimeTypes";
import { MISSION_TYPE_LABELS } from "../../game/campaign/EngagementContextBuilder";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { hexDistance } from "../../core/Hex";
import { CampaignMapRenderer } from "../../rendering/CampaignMapRenderer";
import { TRANSPORT_MODES, getDefaultTransportMode } from "../../data/transportModes";
import { getSpriteForScenarioType } from "../../data/unitSpriteCatalog";
import { MapViewport } from "../controls/MapViewport";
import { CAMPAIGN_POST_BATTLE_AUTOSAVE_SLOT_PREFIX, CAMPAIGN_PRIMARY_SAVE_SLOT_ID, computeDailyProduction, ensureCampaignState } from "../../state/CampaignState";
import { CampaignCheckpointPicker, type CampaignCheckpointChoice } from "../components/CampaignCheckpointPicker";
import { ensureUnlockState } from "../../state/UnlockState";
import { buildSignInUrl } from "../../utils/guestMode";
import {
  type CampaignCommandAdvanceMode,
  type CampaignCommandOrderCommitView,
  type CampaignCommandShellView
} from "../campaign/CampaignCommandShell";
import { projectCampaignCommandShellView } from "../campaign/CampaignCommandShellViewProjection";
import { projectCampaignCommandShellWorkspaces } from "../campaign/CampaignCommandShellWorkspaceProjection";
import { projectCampaignCommandSummary } from "../campaign/CampaignCommandSummaryProjection";
import { CampaignCommandScreen as CampaignCommandInterface } from "../campaign/CampaignCommandScreen";
import {
  resolveCampaignMapLocationPresentation,
  type CampaignLocationPresentation,
  type CampaignLocationUncertaintyInput
} from "../campaign/CampaignLocationPresentation";
import {
  projectCampaignInfrastructureRecoveryStatus,
  projectRuntimeHexKeyToCampaignOffset
} from "../campaign/CampaignCommandProjection";
import { projectCampaignReportsWorkspace } from "../campaign/CampaignReportsWorkspaceProjection";
export { projectCampaignAfterActionFormationEffects } from "../campaign/CampaignReportsWorkspaceProjection";
import {
  formatCampaignReservationLabel,
  projectCampaignOperationOrder,
  projectCampaignOperationsWorkspace,
  type CampaignOperationsOrderSource,
  type CampaignOperationsWorkspaceProjection
} from "../campaign/CampaignOperationsWorkspaceProjection";
import {
  projectCampaignSituationWorkspace,
  type CampaignSituationFrontAssessment,
  type CampaignSituationFrontTargetAssessment
} from "../campaign/CampaignSituationWorkspaceProjection";
export { resolveCampaignCounterattackStageLabel } from "../campaign/CampaignSituationWorkspaceProjection";
import {
  CampaignActionRegistry,
  decorateCampaignOrderComposer,
  explainCampaignOrderValidationIssue,
  getCampaignIntelOperationType,
  getCampaignIntelligenceActionId,
  projectCampaignOrderLocationSummary,
  type CampaignActionContext,
  type CampaignActionId
} from "../campaign/CampaignOrderExperience";
import {
  resolveCampaignFormationRecordPresentation
} from "../../game/campaign/formations/CampaignFormationPresentation";
import { projectCampaignFormationPosture } from "../../game/campaign/formations/CampaignFormationPosture";
import type { CampaignFormationHistoryEntry, CampaignFormationRecord } from "../../game/campaign/formations/campaignFormationTypes";

interface CampaignScreenStatusMessage {
  title: string;
  detail: string;
  action: string;
  tone: "info" | "success" | "warning";
}

type PlayerFrontTargetAssessment = CampaignSituationFrontTargetAssessment;
type PlayerFrontAssessment = CampaignSituationFrontAssessment;

/** One render's bound, defensive historical snapshots; never a second source of campaign state. */
interface CampaignHistoricalLocationContext {
  readonly runtime: CampaignRuntimeState | null;
  readonly definition: CampaignScenarioDefinition | null;
}

export class CampaignScreen {
  private readonly screenManager: IScreenManager;
  private readonly campaignState = ensureCampaignState();
  private readonly renderer: CampaignMapRenderer;
  private readonly unlockState = ensureUnlockState();
  private element: HTMLElement;
  private economyContainer: HTMLElement | null = null;
  private productionContainer: HTMLElement | null = null;
  private productionManageButton: HTMLButtonElement | null = null;
  private selectionContainer: HTMLElement | null = null;
  private queueEngagementButton: HTMLButtonElement | null = null;
  private timeDisplayElement: HTMLElement | null = null;
  private saveButton: HTMLButtonElement | null = null;
  private loadButton: HTMLButtonElement | null = null;
  private battleSavesButton: HTMLButtonElement | null = null;
  private saveLoadBusy = false;
  private checkpointPicker: CampaignCheckpointPicker | null = null;
  private checkpointRequestGeneration = 0;
  private checkpointRequestAbort: AbortController | null = null;
  private exitButton: HTMLButtonElement | null = null;
  private selectedHexKey: string | null = null;
  private selectedFrontKey: string | null = null;
  private selectedFormationId: string | null = null;
  private selectedFrontTargetHexKey: string | null = null;
  private moveOriginHexKey: string | null = null;
  private unsubscribe: (() => void) | null = null;
  private onQueueEngagement: (() => void) | null = null;
  private viewport: MapViewport | null = null;
  private editMode = false;
  private editModeButton: HTMLButtonElement | null = null;
  private exportJSONButton: HTMLButtonElement | null = null;
  private editPanel: HTMLElement | null = null;
  // Tracks a temporary set of hexes selected via click-and-drag while marking terrain in edit mode.
  private bulkTerrainSelection = new Set<string>();
  // Records whether the left mouse button is currently dragging across the map in edit mode.
  private terrainDragActive = false;
  // Ensures pointer handlers for terrain dragging are only bound to the SVG once.
  private terrainDragHandlersAttached = false;
  // Stores the first corner of a rectangular selection when Ctrl+Click is used.
  private rectSelectionCorner: string | null = null;
  private campaignStatusMessage: CampaignScreenStatusMessage | null = null;
  // Overlay shown while campaign mode is locked. Kept as an overlay (not an innerHTML swap)
  // so late-arriving auth resolution (Clerk loads asynchronously) can unlock without a rebuild.
  private lockOverlay: HTMLElement | null = null;
  private lockInvoker: HTMLElement | null = null;
  private lockBackgroundState: Array<{ element: HTMLElement; inert: boolean; ariaHidden: string | null }> = [];
  private lockFocusGuard: ((event: FocusEvent) => void) | null = null;
  private lockEntryFocusHandler: ((event: FocusEvent) => void) | null = null;
  private lockLastAvailableFocus: HTMLElement | null = null;
  private lockAuthUnsubscribe: (() => void) | null = null;
  private lockScreenHandler: (() => void) | null = null;
  private campaignShownHandler: ((event: Event) => void) | null = null;
  private lockVisibilityObserver: MutationObserver | null = null;
  private intelDrawer: HTMLElement | null = null;
  private intelSummary: HTMLElement | null = null;
  private intelUnreadBadge: HTMLElement | null = null;
  private intelCoverageButton: HTMLButtonElement | null = null;
  private intelTab: "situation" | "contacts" | "operations" = "situation";
  private intelOperationType: CampaignIntelOperationType | null = null;
  private intelTargetContactId: string | null = null;
  private intelFeedback = "";
  private intelCoverageVisible = false;
  private commandInterface: CampaignCommandInterface | null = null;
  private commandSaveStatus: CampaignCommandShellView["saveStatus"] = "Unsaved";
  private campaignAdvanceMode: CampaignCommandAdvanceMode = "nextReport";
  private pauseAfterEveryCampaignResolution = false;
  private campaignCameraRequest = 0;
  private readonly campaignActionRegistry = new CampaignActionRegistry((actionId, context) => this.previewCampaignAction(actionId, context));
  private editingIntelOrderId: string | null = null;
  private editingIntelAssetKey: string | null = null;
  private commandCommitBusy = false;
  private commandCommitFeedback: Pick<CampaignCommandOrderCommitView, "feedback" | "feedbackTone"> = { feedback: null, feedbackTone: null };
  private campaignPopupInvoker: HTMLElement | null = null;
  private engagementTransitionBusy = false;

  constructor(
    screenManager: IScreenManager,
    renderer: CampaignMapRenderer,
    private readonly sourceScenario?: CampaignScenarioData
  ) {
    this.screenManager = screenManager;
    this.renderer = renderer;
    const el = document.getElementById("campaignScreen");
    if (!el) {
      throw new Error("Campaign screen element (#campaignScreen) not found in DOM");
    }
    this.element = el;
  }

  /** Routes registry lookups to state-owned preview services without recreating campaign rules in the UI. */
  private previewCampaignAction(actionId: CampaignActionId, context: CampaignActionContext): CampaignOrderActionPreview {
    if (actionId === "redeploy") {
      return this.campaignState.getCampaignRedeployActionPreview(context.selectionId ?? "");
    }
    if (actionId === "production") {
      return this.campaignState.getCampaignProductionActionPreview("Player", context.excludeOrderId ?? undefined);
    }
    if (actionId === "infrastructureRepair") {
      return this.campaignState.getCampaignInfrastructureRepairActionPreview(context.selectionId ?? "");
    }
    const operationType = getCampaignIntelOperationType(actionId);
    if (!operationType) throw new Error(`Campaign action ${actionId} has no authoritative preview route.`);
    return this.campaignState.previewIntelOperationDraft({
      type: operationType,
      targetHexKey: context.selectionId ?? undefined,
      targetContactId: context.targetContactId ?? undefined,
      assignedAssetKey: context.assignedAssetKey ?? undefined,
      excludeOrderId: context.excludeOrderId ?? undefined,
      faction: "Player"
    });
  }

  /** Uses the same exact-edge engagement preparation as launch so front copy and action availability cannot drift. */
  private getPlayerFrontAssessment(frontKey: string, requestedTargetHexKey = this.selectedFrontTargetHexKey): PlayerFrontAssessment {
    const front = this.campaignState.getCampaignMapView("Player")?.scenario.fronts
      .find((entry) => entry.key === frontKey);
    if (!front || front.initiative !== "Player") {
      return { canLaunch: false, pressureLabel: "Opposing initiative; await or disrupt the enemy operation.", targetRequired: false, target: null, targets: [] };
    }
    if (typeof this.campaignState.prepareCampaignFrontEngagement !== "function") {
      return { canLaunch: true, pressureLabel: "Enemy strength assessment is not yet available for this edge.", targetRequired: false, target: null, targets: [] };
    }
    const targets = [...new Set((front.edges ?? []).map((edge) => edge.opposingHexKey))];
    const requestedTargets: Array<string | null> = targets.length > 0 ? targets : [null];
    const preparations = requestedTargets.flatMap((targetHexKey, index) => {
      const prepared = this.campaignState.prepareCampaignFrontEngagement({
        engagementId: `assessment:${front.key}:${index}`,
        frontKey: front.key,
        attacker: "Player",
        requestedTargetHexKey: targetHexKey
      });
      return prepared.ok ? [prepared] : [];
    });
    if (preparations.length === 0) {
      return { canLaunch: false, pressureLabel: "No current opposing-control edge can support an attack.", targetRequired: false, target: null, targets: [] };
    }
    const targetsAssessment = preparations.map((prepared): PlayerFrontTargetAssessment => {
      const context = prepared.engagement.context;
      const briefing = context.intelligenceBriefing;
      const friendlyHexKey = front.edges?.find((edge) => edge.opposingHexKey === context.battleHexKey)?.friendlyHexKey;
      return {
        targetHexKey: context.battleHexKey,
        approachLabel: friendlyHexKey ? `${this.getCampaignLocationDisplayLabel(friendlyHexKey)} approach` : "Selected approach",
        missionLabel: MISSION_TYPE_LABELS[context.missionType],
        roleLabel: `${context.attacker} attacks · ${context.defender} defends`,
        contactCount: briefing?.contacts.length ?? 0,
        resistanceBand: briefing?.resistanceBand ?? "unknown",
        confidenceBand: briefing?.confidenceBand ?? "none",
        explicitUnknowns: briefing?.explicitUnknowns ?? []
      };
    });
    const selectedTarget = requestedTargetHexKey
      ? targetsAssessment.find((target) => target.targetHexKey === requestedTargetHexKey) ?? null
      : targetsAssessment.length === 1 ? targetsAssessment[0] : null;
    if (!selectedTarget && targetsAssessment.length > 1) {
      return {
        canLaunch: false,
        pressureLabel: `${targetsAssessment.length} legal opposing targets · choose the engagement hex before launch.`,
        targetRequired: true,
        target: null,
        targets: targetsAssessment
      };
    }
    const target = selectedTarget ?? targetsAssessment[0];
    if (target.contactCount === 0) {
      return { canLaunch: true, pressureLabel: "Enemy strength is unknown on the current opposing edge.", targetRequired: false, target, targets: targetsAssessment };
    }
    if (target.resistanceBand === "unknown") {
      return {
        canLaunch: true,
        pressureLabel: `${target.contactCount} assessed contact area${target.contactCount === 1 ? "" : "s"} · strength and formation count unknown · ${target.confidenceBand} confidence.`,
        targetRequired: false,
        target,
        targets: targetsAssessment
      };
    }
    return {
      canLaunch: true,
      pressureLabel: `${target.contactCount} assessed opposing contact${target.contactCount === 1 ? "" : "s"} · ${target.resistanceBand} resistance · ${target.confidenceBand} confidence.`,
      targetRequired: false,
      target,
      targets: targetsAssessment
    };
  }
  
  /**
   * (Re)binds the pan/zoom viewport after a render. Each render rebuilds the SVG contents,
   * which recreates #viewportRoot — MapViewport must be pointed at the live group and the
   * previous camera reapplied, or zoom/pan silently stops working after the first re-render.
   */
  private syncViewportAfterRender(): void {
    if (!this.viewport) {
      try {
        this.viewport = new MapViewport("#campaignHexMap", () => this.setCampaignMapScope("custom"), 0.1);
        this.bindCampaignControls();
      } catch {
        // Defensive: viewport optional in tests / minimal DOMs
        return;
      }
    }
    const root = this.renderer.getViewportRoot();
    if (root) {
      this.viewport.setViewportRoot(root);
      const t = this.viewport.getTransform();
      this.viewport.setTransform(t.zoom, t.panX, t.panY);
    }
  }

  /** Renders only the Player knowledge projection. Raw enemy truth never reaches the map renderer. */
  private renderCampaignMap(): void {
    const svg = this.element.querySelector<SVGSVGElement>("#campaignHexMap");
    const canvas = this.element.querySelector<HTMLDivElement>("#campaignMapCanvas");
    const view = this.campaignState.getCampaignMapView("Player");
    if (!svg || !canvas || !view) return;
    const previewState = {
      origins: Array.from(svg.querySelectorAll<SVGGElement>(".campaign-hex.order-preview-origin"))
        .map((group) => group.dataset.hex)
        .filter((hexKey): hexKey is string => Boolean(hexKey)),
      targets: Array.from(svg.querySelectorAll<SVGGElement>(".campaign-hex.order-preview-target"))
        .map((group) => group.dataset.hex)
        .filter((hexKey): hexKey is string => Boolean(hexKey))
    };
    this.renderer.render(svg, canvas, view);
    this.renderer.setTerrainOverlayVisible(this.editMode);
    this.renderer.setIntelCoverageVisible(this.intelCoverageVisible);
    (this.renderer as CampaignMapRenderer | Partial<CampaignMapRenderer>)
      .setIntelContactsVisible?.(this.commandInterface?.getUIState().getSnapshot().overlay === "intelligence");
    this.syncViewportAfterRender();
    this.restoreCampaignMapPresentationState(previewState);
  }

  /** Reapplies typed command presentation after the SVG renderer reconstructs every layer. */
  private restoreCampaignMapPresentationState(previewState: {
    readonly origins: readonly string[];
    readonly targets: readonly string[];
  }): void {
    this.renderer.clearAllHighlights("selected");
    this.renderer.clearAllHighlights("origin");
    if (this.moveOriginHexKey) this.renderer.highlightHex(this.moveOriginHexKey, "origin");

    const front = this.selectedFrontKey
      ? this.campaignState.getCampaignMapView("Player")?.scenario.fronts.find((entry) => entry.key === this.selectedFrontKey)
      : null;
    if (front) {
      if (this.selectedFrontTargetHexKey) this.renderer.highlightHex(this.selectedFrontTargetHexKey, "selected");
      else front.hexKeys.forEach((hexKey) => this.renderer.highlightHex(hexKey, "selected"));
    } else if (this.selectedHexKey) {
      this.renderer.highlightHex(this.selectedHexKey, "selected");
    }

    previewState.origins.forEach((hexKey) => this.renderer.highlightHex(hexKey, "order-preview-origin"));
    previewState.targets.forEach((hexKey) => this.renderer.highlightHex(hexKey, "order-preview-target"));
  }

  /** Identifies the active camera preset in the visible command strip and assistive state. */
  private setCampaignMapScope(scope: "active-front" | "theater-overview" | "custom"): void {
    const label = this.element.querySelector<HTMLElement>("#campaignMapScopeLabel");
    if (label) label.textContent = scope === "active-front" ? "Active front"
      : scope === "theater-overview" ? "Theater overview"
        : "Custom view";
    this.element.dataset.campaignMapScope = scope;
    const activeFront = this.element.querySelector<HTMLButtonElement>("#campaignActiveFrontView");
    const theater = this.element.querySelector<HTMLButtonElement>("#campaignTheaterOverview");
    activeFront?.setAttribute("aria-pressed", scope === "active-front" ? "true" : "false");
    theater?.setAttribute("aria-pressed", scope === "theater-overview" ? "true" : "false");
  }

  /** Opens a fresh campaign on its current primary objective instead of an empty corner of the theater. */
  private focusActiveFront(scenario: CampaignScenarioData, force = false): void {
    if ((!force && this.selectedHexKey) || !this.viewport) return;
    const objective = scenario.objectives.find((candidate) => candidate.category === "primary")
      ?? scenario.objectives[0];
    if (!objective) return;
    const offset = CoordinateSystem.axialToOffset(objective.hex.q, objective.hex.r);
    const hexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
    const center = (this.renderer as CampaignMapRenderer | Partial<CampaignMapRenderer>).getHexCenter?.(hexKey);
    if (!center) return;
    const openingZoom = scenario.background?.gridLayout === "flatTopOddQ" ? 1.5 : 1;
    const cameraRequest = ++this.campaignCameraRequest;
    requestAnimationFrame(() => {
      if (cameraRequest !== this.campaignCameraRequest) return;
      const viewport = this.viewport;
      if (!viewport) return;
      const transform = viewport.getTransform();
      viewport.setTransform(openingZoom, transform.panX, transform.panY);
      viewport.centerOn(center.cx, center.cy);
      this.setCampaignMapScope("active-front");
    });
  }

  /** Fits the complete campaign illustration so the commander can recover theater context in one action. */
  private focusTheaterOverview(): void {
    if (!this.viewport) return;
    const cameraRequest = ++this.campaignCameraRequest;
    requestAnimationFrame(() => {
      if (cameraRequest !== this.campaignCameraRequest) return;
      this.viewport?.fitToMap();
      this.setCampaignMapScope("theater-overview");
    });
  }

  /** Binds campaign zoom/pan buttons present in the sidebar to MapViewport operations. */
  private bindCampaignControls(): void {
    if (!this.viewport) return;
    const zoomIn = this.element.querySelector<HTMLButtonElement>("#campaignZoomIn");
    const zoomOut = this.element.querySelector<HTMLButtonElement>("#campaignZoomOut");
    const theaterOverview = this.element.querySelector<HTMLButtonElement>("#campaignTheaterOverview");
    const activeFront = this.element.querySelector<HTMLButtonElement>("#campaignActiveFrontView");
    const pans = Array.from(this.element.querySelectorAll<HTMLButtonElement>("[data-campaign-pan]"));
    zoomIn?.addEventListener("click", () => this.viewport?.adjustZoom(0.2));
    zoomOut?.addEventListener("click", () => this.viewport?.adjustZoom(-0.2));
    theaterOverview?.addEventListener("click", () => this.focusTheaterOverview());
    activeFront?.addEventListener("click", () => {
      const scenario = this.campaignState.getCampaignMapView("Player")?.scenario;
      if (scenario) this.focusActiveFront(scenario, true);
    });
    pans.forEach((btn) =>
      btn.addEventListener("click", () => {
        const dir = btn.dataset.campaignPan;
        const step = 64;
        switch (dir) {
          case "up":
            this.viewport?.pan(0, step);
            break;
          case "down":
            this.viewport?.pan(0, -step);
            break;
          case "left":
            this.viewport?.pan(step, 0);
            break;
          case "right":
            this.viewport?.pan(-step, 0);
            break;
        }
      })
    );
  }

  /**
   * Opens the redeployment planner. Only route- and force-relevant modes render as selectable cards,
   * exact named formations use one checkbox model, and the summary is a
   * live engine-accurate preview via CampaignState.previewRedeploy. Add Draft never spends resources;
   * the authoritative validator rechecks every shared reservation before atomic commit.
   */
  private openRedeployModal(
    originOffsetKey: string,
    destOffsetKey: string,
    editingOrder?: Extract<CampaignOrder, { kind: "redeploy" }>,
    preselectedFormationId?: string
  ): void {
    const layer = document.getElementById("battlePopupLayer");
    const dialog = layer?.querySelector<HTMLElement>(".battle-popup");
    const title = dialog?.querySelector<HTMLElement>("[data-popup-title]");
    const body = dialog?.querySelector<HTMLElement>("[data-popup-body]");
    const close = dialog?.querySelector<HTMLButtonElement>("#battlePopupClose");
    if (!layer || !dialog || !title || !body || !close) return;

    const scenario = this.campaignState.getCampaignMapView("Player")?.scenario ?? null;
    if (!scenario) return;
    const parse = (key: string) => CoordinateSystem.parseHexKey(key)!;
    const a = parse(originOffsetKey);
    const b = parse(destOffsetKey);
    const aAx = CoordinateSystem.offsetToAxial(a.col, a.row);
    const bAx = CoordinateSystem.offsetToAxial(b.col, b.row);
    const distance = Math.max(1, hexDistance(aAx, bAx));
    const hexKm = scenario.hexScaleKm ?? 10;

    const originTile = scenario.tiles.find((t) => t.hex.q === aAx.q && t.hex.r === aAx.r);
    const destTile = scenario.tiles.find((t) => t.hex.q === bAx.q && t.hex.r === bAx.r);
    const originFormations = this.campaignState.getCampaignRedeployAvailableFormations(
      originOffsetKey,
      "Player",
      editingOrder?.id
    )
      .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
    const forceCounts = new Map<string, number>();
    originFormations.forEach((formation) => {
      forceCounts.set(formation.campaignUnitType, (forceCounts.get(formation.campaignUnitType) ?? 0) + 1);
    });
    const originForces = Array.from(forceCounts, ([unitType, count]) => ({ unitType, count }));
    if (!originTile || originFormations.length === 0) {
      this.commandCommitFeedback = {
        feedback: "No uncommitted formation remains available at this origin.",
        feedbackTone: "warning"
      };
      this.renderCommandShell();
      return;
    }

    const originRole = scenario.tilePalette[originTile.tile]?.role ?? null;
    const destRole = destTile ? (scenario.tilePalette[destTile.tile]?.role ?? null) : null;
    const originLabel = scenario.tilePalette[originTile.tile]?.mapLabel?.trim()
      || this.formatCampaignLabel(originRole ?? "Operational hex");
    const destinationLabel = destTile
      ? scenario.tilePalette[destTile.tile]?.mapLabel?.trim() || this.formatCampaignLabel(destRole ?? "Operational hex")
      : this.formatCampaignLabel(destRole ?? "Operational hex");

    const requireModeSprite = (scenarioType: string): string => {
      const sprite = getSpriteForScenarioType(scenarioType, "Player", "E");
      if (!sprite) throw new Error(`[CampaignScreen] Missing redeployment mode sprite for ${scenarioType}.`);
      return sprite;
    };
    // Player-facing art uses the same authored unit language as the map and tactical layer.
    const MODE_PRESENTATION: Record<string, { sprite: string; name: string; note: string }> = {
      foot: { sprite: requireModeSprite("Infantry_42"), name: "March", note: "Infantry only" },
      truck: { sprite: requireModeSprite("Supply_Truck"), name: "Truck", note: "Infantry and towed guns" },
      armor: { sprite: requireModeSprite("APC_Halftrack"), name: "Motorized", note: "Vehicles move themselves" },
      naval: { sprite: requireModeSprite("Transport_Ship"), name: "Sea Lift", note: "Coastal embarkation" },
      warship: { sprite: requireModeSprite("Battleship"), name: "Warship", note: "Combat vessels" },
      fighter: { sprite: requireModeSprite("Fighter"), name: "Fighter Ferry", note: "Airbase to airbase" },
      bomber: { sprite: requireModeSprite("Bomber"), name: "Bomber Ferry", note: "Airbase to airbase" }
    };

    const availableModeKeys = Object.keys(TRANSPORT_MODES).filter((key) => {
      const mode = TRANSPORT_MODES[key];
      if (!this.campaignState.getTransportRouteEligibility(originOffsetKey, destOffsetKey, key).available) return false;
      if (!mode.applicableUnitTypes || mode.applicableUnitTypes.length === 0) {
        return key === "naval";
      }
      return originForces.some((force) => mode.applicableUnitTypes?.includes(force.unitType));
    });
    if (availableModeKeys.length === 0) {
      this.commandCommitFeedback = {
        feedback: `No available transport mode can move formations from ${originLabel} to ${destinationLabel}. Choose a land-connected or coastal destination.`,
        feedbackTone: "warning"
      };
      this.renderCommandShell();
      return;
    }

    // A formation-specific order must open in a mode that can carry that exact command.
    // Otherwise use the recommended mode of the largest usable force group.
    const sortedForces = [...originForces].sort((x, y) => y.count - x.count);
    let selectedModeKey = editingOrder?.payload.transportModeKey ?? "foot";
    let defaulted = false;
    if (!editingOrder) {
      const preselectedFormation = preselectedFormationId
        ? originFormations.find((formation) => formation.id === preselectedFormationId)
        : null;
      if (preselectedFormation) {
        const recommendedMode = getDefaultTransportMode(preselectedFormation.campaignUnitType);
        const compatibleMode = availableModeKeys.includes(recommendedMode)
          ? recommendedMode
          : availableModeKeys.find((key) => TRANSPORT_MODES[key]?.applicableUnitTypes?.includes(preselectedFormation.campaignUnitType));
        if (compatibleMode) {
          selectedModeKey = compatibleMode;
          defaulted = true;
        }
      }
      for (const g of sortedForces) {
        if (defaulted) break;
        const candidate = getDefaultTransportMode(g.unitType);
        if (availableModeKeys.includes(candidate)) {
          selectedModeKey = candidate;
          defaulted = true;
          break;
        }
      }
      if (!defaulted) selectedModeKey = availableModeKeys[0];
    } else if (!availableModeKeys.includes(selectedModeKey)) {
      selectedModeKey = availableModeKeys[0];
    }

    title.textContent = editingOrder ? "Edit Redeployment Draft" : "Plan Redeployment";
    const initiallySelectedFormationIds = new Set<string>(editingOrder?.payload.formationIds ?? []);
    if (!editingOrder
      && preselectedFormationId
      && originFormations.some((formation) => formation.id === preselectedFormationId)) {
      initiallySelectedFormationIds.add(preselectedFormationId);
    }
    if (editingOrder && initiallySelectedFormationIds.size === 0) {
      editingOrder.payload.selections.forEach((selection) => {
        originFormations
          .filter((formation) => formation.campaignUnitType === selection.unitType)
          .slice(0, selection.count)
          .forEach((formation) => initiallySelectedFormationIds.add(formation.id));
      });
    }

    const modeCards = availableModeKeys
      .map((key) => {
        const mode = TRANSPORT_MODES[key];
        const presentation = MODE_PRESENTATION[key];
        return `
          <button type="button" class="redeploy-mode-card" data-mode="${key}" title="${this.escapeHtml(mode.description ?? mode.label)}">
            <img class="mode-sprite" src="${this.escapeHtml(presentation.sprite)}" alt="" aria-hidden="true" />
            <span class="mode-name">${presentation.name}</span>
            <span class="mode-speed">${mode.speedHexPerDay} hex / 3h</span>
            <span class="mode-note">${this.escapeHtml(presentation.note)}</span>
          </button>`;
      })
      .join("");

    const unitRows = originFormations
      .map(
        (formation, idx) => {
        const sprite = getSpriteForScenarioType(formation.campaignUnitType, "Player", "E");
        const formationPresentation = resolveCampaignFormationRecordPresentation(formation);
        const checked = initiallySelectedFormationIds.has(formation.id) ? " checked" : "";
        return `
        <label class="redeploy-formation-row" data-unit-row="${idx}">
          <input type="checkbox" data-formation-index="${idx}"${checked} />
          ${sprite ? `<img class="redeploy-formation-sprite" src="${this.escapeHtml(sprite)}" alt="" aria-hidden="true" />` : ""}
          <span class="redeploy-formation-copy">
            <strong>${this.escapeHtml(formationPresentation.formationName)}</strong>
            <small>${this.escapeHtml(formationPresentation.typeLabel)} · Readiness ${Math.round(formation.readiness)}%</small>
            <em data-unit-note="${idx}"></em>
          </span>
        </label>`;
        }
      )
      .join("");

    body.innerHTML = `
      <form id="campaignRedeployForm" class="redeploy-modal">
        <div class="redeploy-route">
          <span class="route-node"><strong>${this.escapeHtml(originLabel)}</strong><small>Hex ${this.escapeHtml(originOffsetKey)}</small></span>
          <span class="route-arrow">→</span>
          <span class="route-node"><strong>${this.escapeHtml(destinationLabel)}</strong><small>Hex ${this.escapeHtml(destOffsetKey)}</small></span>
          <span class="route-distance">${distance} hex · ~${distance * hexKm} km</span>
        </div>
        <div class="redeploy-issues" id="campaignRedeployIssues"></div>
        <div class="redeploy-section-label">Transport mode</div>
        <div class="redeploy-modes">${modeCards}</div>
        <div class="redeploy-summary-panel" id="campaignRedeploySummary"></div>
        <div class="redeploy-section-label">Named formations</div>
        <div class="redeploy-units">${unitRows}</div>
        <div class="button-row redeploy-actions">
          <button type="submit" class="primary-button" id="campaignRedeployConfirm">${editingOrder ? "Replace Draft" : "Add Draft"}</button>
          <button type="button" id="campaignRedeployCancel" class="secondary-button">Cancel</button>
        </div>
      </form>
    `;

    const form = body.querySelector<HTMLFormElement>("#campaignRedeployForm");
    const summaryEl = body.querySelector<HTMLElement>("#campaignRedeploySummary");
    const issuesEl = body.querySelector<HTMLElement>("#campaignRedeployIssues");
    const confirmBtn = body.querySelector<HTMLButtonElement>("#campaignRedeployConfirm");
    const cancelBtn = body.querySelector<HTMLButtonElement>("#campaignRedeployCancel");
    if (!form || !summaryEl || !issuesEl || !confirmBtn || !cancelBtn) return;
    const formationInputs = Array.from(body.querySelectorAll<HTMLInputElement>("[data-formation-index]"));
    const modeButtons = Array.from(body.querySelectorAll<HTMLButtonElement>(".redeploy-mode-card"));

    const unitAllowedInMode = (unitType: string, modeKey: string): boolean => {
      const mode = TRANSPORT_MODES[modeKey];
      if (!mode) return false;
      return !mode.applicableUnitTypes || mode.applicableUnitTypes.length === 0 || mode.applicableUnitTypes.includes(unitType);
    };

    const currentFormationIds = (): string[] => originFormations.flatMap((formation, index) => (
      formationInputs[index]?.checked && unitAllowedInMode(formation.campaignUnitType, selectedModeKey)
        ? [formation.id]
        : []
    ));
    const currentSelections = (): Array<{ unitType: string; count: number }> => {
      const counts = new Map<string, number>();
      const selectedIds = new Set(currentFormationIds());
      originFormations.forEach((formation) => {
        if (!selectedIds.has(formation.id)) return;
        counts.set(formation.campaignUnitType, (counts.get(formation.campaignUnitType) ?? 0) + 1);
      });
      return Array.from(counts, ([unitType, count]) => ({ unitType, count }));
    };

    const fmt = (n: number) => n.toLocaleString();

    const refresh = (): void => {
      modeButtons.forEach((btnEl) => btnEl.classList.toggle("selected", btnEl.dataset.mode === selectedModeKey));

      originFormations.forEach((formation, i) => {
        const allowed = unitAllowedInMode(formation.campaignUnitType, selectedModeKey);
        const row = body.querySelector<HTMLElement>(`[data-unit-row="${i}"]`);
        const note = body.querySelector<HTMLElement>(`[data-unit-note="${i}"]`);
        row?.classList.toggle("unit-row-disabled", !allowed);
        if (formationInputs[i]) formationInputs[i].disabled = !allowed;
        if (note) note.textContent = allowed ? "" : "Stays behind — can't travel by this mode";
      });

      const selectedFormationIds = currentFormationIds();
      const preview = this.campaignState.previewRedeploy(
        originOffsetKey,
        destOffsetKey,
        currentSelections(),
        selectedModeKey,
        editingOrder?.id,
        false,
        selectedFormationIds
      );
      if (!preview) {
        summaryEl.innerHTML = "";
        issuesEl.innerHTML = "";
        confirmBtn.disabled = true;
        return;
      }

      const etaDisplay = this.campaignState.segmentToTimeDisplay(preview.etaSegment);
      const fuelBad = preview.fuelCost > preview.fuelAvailable;
      const supBad = preview.suppliesCost > preview.suppliesAvailable;
      const capBad = preview.capacityAvailable !== null && preview.capacityNeeded > preview.capacityAvailable;
      const mode = TRANSPORT_MODES[selectedModeKey];
      const capLabel = mode?.capacityType === "trucks" ? "Trucks" : mode?.capacityType === "transportShips" ? "Transport ships" : "Aircraft";
      const availability = (cost: number, available: number, bad: boolean): string =>
        bad ? `${fmt(cost)} needed · ${fmt(available)} available` : fmt(cost);

      summaryEl.innerHTML = `
        <div class="summary-eta"><span>Arrival:</span><strong>${etaDisplay}</strong><em>· ${preview.timeSegments} segment${preview.timeSegments !== 1 ? "s" : ""} in transit</em></div>
        <div class="summary-costs" aria-label="Redeployment cost">
          <span class="summary-cost${fuelBad ? " cost-bad" : ""}">Fuel: <strong>${availability(preview.fuelCost, preview.fuelAvailable, fuelBad)}</strong></span>
          <span class="summary-cost${supBad ? " cost-bad" : ""}">Supplies: <strong>${availability(preview.suppliesCost, preview.suppliesAvailable, supBad)}</strong></span>
          ${mode?.capacityType ? `<span class="summary-cost${capBad ? " cost-bad" : ""}">${capLabel}: <strong>${capBad ? `${preview.capacityNeeded} needed · ${preview.capacityAvailable ?? 0} available` : preview.capacityNeeded}</strong></span>` : ""}
          ${preview.manpowerLoss > 0 ? `<span class="summary-cost cost-warn">Estimated losses: <strong>${fmt(preview.manpowerLoss)}</strong></span>` : ""}
        </div>
      `;

      const uniqueDiagnostics = Array.from(new Map(preview.diagnostics.map((issue) => [
        `${issue.code}|${issue.message}|${issue.correctiveAction}`,
        issue
      ])).values());
      issuesEl.innerHTML = preview.ok ? "" : uniqueDiagnostics.map((issue) => `<div class="redeploy-issue" data-reason-code="${issue.code}"><strong>Plan needs correction</strong><span>${this.escapeHtml(issue.message)}</span><small>${this.escapeHtml(issue.correctiveAction)}</small></div>`).join("");
      confirmBtn.disabled = !preview.ok;
      confirmBtn.textContent = preview.ok
        ? editingOrder ? "Replace Draft" : "Add Draft"
        : uniqueDiagnostics.length === 1 ? "Resolve conflict to continue" : "Resolve conflicts to continue";
    };

    modeButtons.forEach((btnEl) =>
      btnEl.addEventListener("click", () => {
        if (btnEl.disabled) return;
        selectedModeKey = btnEl.dataset.mode ?? selectedModeKey;
        refresh();
      })
    );
    formationInputs.forEach((input) => input.addEventListener("change", refresh));

    refresh();

    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelBtn.click();
    };
    const removeEscapeHandler = (): void => layer.removeEventListener("keydown", onEscape);

    form.onsubmit = (ev) => {
      ev.preventDefault();
      const result = this.campaignState.createRedeployDraft(
        originOffsetKey,
        destOffsetKey,
        currentSelections(),
        selectedModeKey,
        editingOrder?.id,
        currentFormationIds()
      );
      if (!result.ok) {
        this.setCampaignStatusMessage({
          title: "Draft not added.",
          detail: result.reason ?? "The redeployment draft could not be added.",
          action: "Adjust the route, unit selection, or transport mode and try again.",
          tone: "warning"
        });
        return;
      }
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      removeEscapeHandler();
      clearPreview();
      this.commandCommitFeedback = { feedback: `Redeployment draft ${editingOrder ? "replaced" : "added"}; exact holds are visible in the tray.`, feedbackTone: "success" };
      this.renderCommandShell();
      this.setCampaignStatusMessage({
        title: result.order.validation.valid ? `Redeployment draft ${editingOrder ? "replaced" : "ready"}.` : "Redeployment draft has a conflict.",
        detail: result.order.validation.issues[0]?.message ?? `Movement draft ${editingOrder ? "replaced" : "added"} from ${originLabel} to ${destinationLabel}.`,
        action: result.order.validation.valid ? "Review the order tray, then commit orders when ready." : "Remove the conflicting draft or free the required capacity before committing.",
        tone: "success"
      });
    };
    const clearPreview = (): void => {
      this.renderer.clearAllHighlights("order-preview-origin");
      this.renderer.clearAllHighlights("order-preview-target");
    };
    cancelBtn.onclick = () => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      removeEscapeHandler();
      clearPreview();
      this.campaignPopupInvoker?.focus({ preventScroll: true });
    };

    // Show popup
    layer.classList.remove("hidden");
    layer.setAttribute("aria-hidden", "false");
    body.scrollTop = 0;
    layer.addEventListener("keydown", onEscape);
    this.renderer.highlightHex(originOffsetKey, "order-preview-origin");
    this.renderer.highlightHex(destOffsetKey, "order-preview-target");
    (modeButtons.find((button) => button.dataset.mode === selectedModeKey) ?? cancelBtn).focus({ preventScroll: true });
    close.onclick = () => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      removeEscapeHandler();
      clearPreview();
      this.campaignPopupInvoker?.focus({ preventScroll: true });
    };
  }

  /**
   * Resolves which hex the battle is actually fought over.
   * Proximity engagements target the enemy tile adjacent to the selected hex; front engagements
   * target an authoritative enemy-held hex on or adjacent to the operational line.
   */
  private resolveBattleHexKey(engagement: CampaignPendingEngagement): string | null {
    if (engagement.tags.includes("proximity") && engagement.hexKeys.length > 0) {
      return this.campaignState.findAdjacentEnemyHexKey(engagement.hexKeys[0]);
    }
    return null;
  }

  /**
   * Shows or hides the locked overlay based on the current unlock snapshot.
   * Auth resolves asynchronously (Clerk loads after app init), so this must be
   * re-evaluated whenever UnlockState hydrates — never decided once at startup.
   */
  private syncCampaignLockState(): void {
    if (!this.element.isConnected || this.element.closest(".hidden, [hidden]")) {
      this.cancelCampaignCheckpointRequest();
      this.removeCampaignLockedOverlay(false);
    } else if (this.unlockState.isCampaignLocked("campaign")) {
      this.cancelCampaignCheckpointRequest();
      this.showCampaignLockedOverlay();
    } else {
      this.removeCampaignLockedOverlay();
    }
  }

  /**
   * Displays a locked overlay when campaign mode is not unlocked.
   * Keeps account recovery above every campaign stacking context. Only the
   * stable screen/background roots are isolated; compact sheets retain ownership
   * of their nested inert states while resizing or rendering beneath the gate.
   */
  private showCampaignLockedOverlay(): void {
    if (this.lockOverlay) {
      this.refreshCampaignLockRecovery();
      return;
    }
    const purchaseUrl = this.unlockState.buildPurchaseUrlForSku("campaign");
    const overlay = document.createElement("div");
    overlay.id = "campaignLockOverlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "campaignLockTitle");
    overlay.setAttribute("aria-describedby", "campaignLockDescription campaignLockRecovery");
    overlay.innerHTML = `
      <div class="campaign-access-gate__surface">
        <h1 id="campaignLockTitle">Campaign Locked</h1>
        <p id="campaignLockDescription">Campaign mode requires a Four Star General or All-Access Bundle subscription.</p>
        <p id="campaignLockRecovery" data-lock-recovery></p>
        <div class="campaign-access-gate__actions">
          <a data-lock-sign-in>Sign In</a>
          <a href="${this.escapeHtml(purchaseUrl)}" data-lock-plans>View Plans →</a>
          <button type="button" data-lock-return>Return to Landing Screen</button>
        </div>
      </div>
    `;
    overlay.querySelector<HTMLButtonElement>("[data-lock-return]")?.addEventListener("click", () => {
      this.returnFromCampaignAccessGate();
    });
    overlay.addEventListener("keydown", (event) => {
      // Even non-Tab keys must not reach global numeric/workspace shortcuts.
      event.stopPropagation();
      if (event.key === "Escape") {
        event.preventDefault();
        this.returnFromCampaignAccessGate();
      } else if (event.key === "Tab") {
        const actions = Array.from(overlay.querySelectorAll<HTMLElement>("a[href]:not([hidden]), button:not([hidden])"));
        const index = actions.findIndex((action) => action === document.activeElement);
        event.preventDefault();
        actions[(index + (event.shiftKey ? actions.length - 1 : 1)) % actions.length].focus();
      }
    });
    this.lockInvoker = this.lockLastAvailableFocus?.isConnected ? this.lockLastAvailableFocus
      : document.activeElement instanceof HTMLElement ? document.activeElement : null;
    document.body.appendChild(overlay);
    this.lockOverlay = overlay;
    this.refreshCampaignLockRecovery();
    // Isolate stable branches, never their shared #app ancestor: ScreenManager
    // owns that ancestor's transient inert state and clears it after entry.
    const backgrounds = new Set<HTMLElement>([this.element]);
    let branch: HTMLElement = this.element;
    while (branch.parentElement) {
      const parent = branch.parentElement;
      Array.from(parent.children).forEach((element) => {
        if (element instanceof HTMLElement && element !== branch && element !== overlay
          && element.id !== "screenTransitionStatus") backgrounds.add(element);
      });
      if (parent === document.body) break;
      branch = parent;
    }
    this.lockBackgroundState = Array.from(backgrounds, (element) => ({
      element, inert: element.inert === true, ariaHidden: element.getAttribute("aria-hidden")
    }));
    const focusRecovery = (): void => {
      overlay.querySelector<HTMLElement>("[data-lock-sign-in]:not([hidden]), [data-lock-plans]")?.focus();
    };
    focusRecovery();
    this.lockBackgroundState.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    });
    this.lockFocusGuard = (event) => {
      if (event.target instanceof Node && !overlay.contains(event.target)) focusRecovery();
    };
    document.addEventListener("focusin", this.lockFocusGuard, true);
  }

  /** Refreshes recovery without replacing the focused action during auth hydration. */
  private refreshCampaignLockRecovery(): void {
    const signIn = this.lockOverlay?.querySelector<HTMLAnchorElement>("[data-lock-sign-in]");
    const recovery = this.lockOverlay?.querySelector<HTMLElement>("[data-lock-recovery]");
    if (!signIn || !recovery) return;
    const authUrl = new URL(buildSignInUrl());
    authUrl.searchParams.set("redirect_url", new URL("/play?mode=campaign", window.location.origin).href);
    signIn.href = authUrl.href;
    const signedIn = this.unlockState.getSnapshot().isAuthenticated;
    // The canonical route is sign-in, not a verified account-switch operation.
    // An authenticated account without access receives purchase/return actions.
    if (signedIn && document.activeElement === signIn) {
      this.lockOverlay?.querySelector<HTMLElement>("[data-lock-plans]")?.focus();
    }
    signIn.hidden = signedIn;
    recovery.textContent = signedIn
      ? "You are signed in, but this account does not have campaign access. View plans or return to the landing screen."
      : "Already subscribed? Sign in to return to your campaign.";
  }

  /** Leaves locked gameplay through the normal landing route; Escape uses this same exit. */
  private returnFromCampaignAccessGate(): void {
    const invoker = this.lockInvoker;
    this.removeCampaignLockedOverlay(false);
    this.screenManager.showScreenById("landing");
    // The destination is already constructed. Finish its transition before
    // restoring focus so a delayed transition cannot replace the recovery focus.
    this.screenManager.endTransition?.();
    this.restoreCampaignAccessFocus(invoker, document.getElementById("landingScreen"));
  }

  /** Restores only a connected, available target in the active screen. */
  private restoreCampaignAccessFocus(invoker: HTMLElement | null, destination: HTMLElement | null): void {
    const target = invoker?.isConnected && !invoker.closest(".hidden, [hidden], [inert], [aria-hidden='true']")
      ? invoker : destination;
    if (!target || target.closest(".hidden, [hidden], [inert], [aria-hidden='true']")) return;
    if (target === destination && !target.hasAttribute("tabindex")) target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }

  /** Restores prior isolation without changing compact-sheet state or hidden-screen semantics. */
  private removeCampaignLockedOverlay(restoreFocus = true): void {
    if (!this.lockOverlay) return;
    const invoker = this.lockInvoker;
    if (this.lockFocusGuard) document.removeEventListener("focusin", this.lockFocusGuard, true);
    this.lockFocusGuard = null;
    this.lockOverlay.remove();
    this.lockOverlay = null;
    this.lockInvoker = null;
    this.lockBackgroundState.forEach(({ element, inert, ariaHidden }) => {
      element.inert = inert;
      if (element === this.element && element.closest(".hidden, [hidden]")) element.setAttribute("aria-hidden", "true");
      // A normal screen transition may have revealed a different screen while
      // the gate was active. Do not undo that newer visibility decision.
      else if (element.getAttribute("aria-hidden") === "true") {
        if (ariaHidden === null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
    });
    this.lockBackgroundState = [];
    if (restoreFocus) this.restoreCampaignAccessFocus(invoker, this.element);
  }

  /** Resets access-only subscriptions before they are rebound during initialization. */
  private resetCampaignAccessGate(): void {
    this.lockAuthUnsubscribe?.();
    this.lockAuthUnsubscribe = null;
    if (this.lockScreenHandler) document.removeEventListener("screen:shown", this.lockScreenHandler);
    this.lockScreenHandler = null;
    this.lockVisibilityObserver?.disconnect();
    this.lockVisibilityObserver = null;
    if (this.lockEntryFocusHandler) document.removeEventListener("focusin", this.lockEntryFocusHandler, true);
    this.lockEntryFocusHandler = null;
    this.lockLastAvailableFocus = null;
    this.removeCampaignLockedOverlay(false);
  }

  /** Releases all screen-owned subscriptions, renderer observers and viewport input handlers. */
  public disposeCampaignAccessGate(): void {
    this.cancelCampaignCheckpointRequest();
    this.viewport?.dispose();
    this.viewport = null;
    (this.renderer as CampaignMapRenderer | Partial<CampaignMapRenderer>).dispose?.();
    this.unsubscribe?.();
    this.unsubscribe = null;
    if (this.campaignShownHandler) document.removeEventListener("screen:shown", this.campaignShownHandler);
    this.campaignShownHandler = null;
    this.resetCampaignAccessGate();
  }

  /** Releases checkpoint UI ownership; an already accepted State load retains its own transaction semantics. */
  private cancelCampaignCheckpointRequest(): void {
    this.checkpointRequestGeneration += 1;
    this.checkpointRequestAbort?.abort();
    this.checkpointRequestAbort = null;
    this.checkpointPicker?.dispose();
    this.checkpointPicker = null;
  }

  /**
   * Mounts the legacy editor controls only for explicitly authorized development builds.
   * Keeping the controls in template fragments prevents internal tools from entering the normal player DOM.
   */
  private mountCampaignDeveloperTools(): void {
    const editorEnabled = import.meta.env?.DEV === true || import.meta.env?.VITE_CAMPAIGN_EDITOR === "true";
    if (!editorEnabled) return;
    const sessionTemplate = this.element.querySelector<HTMLTemplateElement>("#campaignDeveloperSessionTemplate");
    const editorTemplate = this.element.querySelector<HTMLTemplateElement>("#campaignDeveloperEditorTemplate");
    const sessionTarget = this.element.querySelector<HTMLElement>(".session-controls");
    const editorTarget = this.element.querySelector<HTMLElement>(".campaign-sidebar");
    if (sessionTemplate && sessionTarget) sessionTarget.appendChild(sessionTemplate.content.cloneNode(true));
    if (editorTemplate && editorTarget) editorTarget.appendChild(editorTemplate.content.cloneNode(true));
  }

  /** Synchronizes map/composer context after canonical list or navigation selection has changed. */
  private syncCampaignSelection(): void {
    const selection = this.commandInterface?.getUIState().getSnapshot().selection ?? null;
    const choosingRedeploymentDestination = selection?.kind === "hex" && this.moveOriginHexKey !== null;
    if (selection?.kind === "formation") this.selectedFormationId = selection.id;
    else if (!choosingRedeploymentDestination) this.selectedFormationId = null;
    let selectedHexKey: string | null = null;
    if (selection?.kind === "hex") {
      selectedHexKey = selection.id;
      this.selectedFrontKey = null;
      this.selectedFrontTargetHexKey = null;
    } else if (selection?.kind === "front") {
      const front = this.campaignState.getCampaignMapView("Player")?.scenario.fronts.find((entry) => entry.key === selection.id);
      if (!front) return;
      if (this.selectedFrontKey !== front.key) this.selectedFrontTargetHexKey = null;
      this.selectedFrontKey = front.key;
      selectedHexKey = front.hexKeys[0] ?? null;
    } else if (selection?.kind === "formation") {
      const formation = this.campaignState.getCampaignFormationSnapshot(selection.id);
      if (!formation || formation.faction !== "Player") return;
      this.selectedFrontKey = null;
      this.selectedFrontTargetHexKey = null;
      selectedHexKey = projectRuntimeHexKeyToCampaignOffset(formation.locationHexKey);
    } else if (selection?.kind === "objective") {
      const objective = this.campaignState.getCampaignMapView("Player")?.scenario.objectives
        .find((entry) => entry.key === selection.id);
      if (!objective) return;
      const offset = CoordinateSystem.axialToOffset(objective.hex.q, objective.hex.r);
      this.selectedFrontKey = null;
      this.selectedFrontTargetHexKey = null;
      selectedHexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
    } else if (selection?.kind === "contact") {
      const contact = this.campaignState.getCampaignMapView("Player")?.enemyContacts
        .find((entry) => entry.id === selection.id);
      if (!contact) return;
      this.selectedFrontKey = null;
      this.selectedFrontTargetHexKey = null;
      selectedHexKey = contact.locationHexKey;
    } else {
      // A route without a map target must not inherit the previously inspected
      // contact or location as an implicit collection target.
      this.selectedFrontKey = null;
      this.selectedFrontTargetHexKey = null;
    }
    // Identity matters even at an unchanged hex: contact → ground must discard
    // contact-only preview eligibility and clear any obsolete front context.
    this.selectedHexKey = selectedHexKey;
    if (!choosingRedeploymentDestination) this.moveOriginHexKey = null;
    this.renderer.clearAllHighlights("selected");
    this.renderer.clearAllHighlights("origin");
    if (this.moveOriginHexKey) this.renderer.highlightHex(this.moveOriginHexKey, "origin");
    if (selection?.kind === "front") {
      const front = this.campaignState.getCampaignMapView("Player")?.scenario.fronts.find((entry) => entry.key === selection.id);
      if (this.selectedFrontTargetHexKey) this.renderer.highlightHex(this.selectedFrontTargetHexKey, "selected");
      else front?.hexKeys.forEach((hexKey) => this.renderer.highlightHex(hexKey, "selected"));
    } else if (selectedHexKey) {
      this.renderer.highlightHex(selectedHexKey, "selected");
      const center = this.renderer.getHexCenter(selectedHexKey);
      if (center) this.viewport?.centerOn(center.cx, center.cy);
    }
    this.renderSelection();
    this.renderCampaignIntel();
    this.syncRedeploymentTargetMode();
  }

  initialize(): void {
    this.mountCampaignDeveloperTools();
    this.commandInterface = new CampaignCommandInterface(this.element, {
      onMapLayerChanged: (overlay) => (this.renderer as CampaignMapRenderer | Partial<CampaignMapRenderer>)
        .setIntelContactsVisible?.(overlay === "intelligence"),
      onOpenIntelligence: () => {
        this.intelTab = "operations";
        this.resetIntelComposer();
        document.dispatchEvent(new CustomEvent("campaign:intelligence:open"));
      },
      onMarkIntelligenceRead: () => {
        this.campaignState.markIntelBriefsRead("Player");
        this.renderCampaignIntel();
        this.renderCommandShell();
      },
      onAcknowledgeAfterActionReport: (reportId) => {
        this.campaignState.acknowledgeCampaignAfterActionReport(reportId);
        this.renderCommandShell();
      },
      onAcknowledgeAlert: (alertId) => {
        this.campaignState.acknowledgeCampaignAlert(alertId);
        this.renderCommandShell();
      },
      onAlertSelected: (targetKind, targetId) => {
        if (targetKind === "intelligence" && targetId && this.focusCampaignContact(targetId)) return;
        this.syncCampaignSelection();
      },
      onAfterActionTargetSelected: (targetKind, targetId) => {
        this.commandInterface?.navigate({ kind: targetKind, id: targetId, focus: true });
        if (targetKind === "formation") {
          this.syncCampaignSelection();
          return;
        }
        let selectedHexKey = targetKind === "infrastructure" ? targetId : null;
        if (targetKind === "engagement" && targetId) {
          selectedHexKey = projectRuntimeHexKeyToCampaignOffset(
            this.campaignState.getCampaignAfterActionReport(targetId)?.battleHexKey ?? null
          );
        }
        if (selectedHexKey) {
          this.selectedHexKey = selectedHexKey;
          this.renderer.clearAllHighlights("selected");
          this.renderer.highlightHex(selectedHexKey, "selected");
          this.renderSelection();
        }
      },
      onSelectionRequested: () => this.syncCampaignSelection(),
      onCommitOrders: () => this.commitDraftOrders(),
      onAdvance: (mode) => this.advanceCampaignTime(mode),
      onAdvanceModeChanged: (mode) => { this.campaignAdvanceMode = mode; },
      onPauseAfterEveryResolutionChanged: (enabled) => { this.pauseAfterEveryCampaignResolution = enabled; },
      onRemoveOrder: (orderId) => this.removeDraftOrder(orderId),
      onEditOrder: (orderId) => this.editDraftOrder(orderId),
      onMoveOrder: (orderId, direction) => this.moveDraftOrder(orderId, direction),
      onCancelOrder: (orderId) => this.openOrderCancellationPreview(orderId),
      onContinueOutcome: () => {
        const continued = this.campaignState.continueCampaignAfterOutcome();
        if (!continued.ok) this.setCampaignStatusMessage({
          title: "Campaign continuation unavailable",
          detail: continued.reason,
          action: "Review the recorded result or load an earlier save.",
          tone: "warning"
        });
        this.renderCommandShell();
      },
      onCancelGesture: () => {
        if (!this.moveOriginHexKey) return;
        this.moveOriginHexKey = null;
        this.renderer.clearAllHighlights("origin");
        this.syncRedeploymentTargetMode();
        this.renderSelection();
      }
    });
    this.commandInterface.initialize();

    // Subscribe only after shell composition: subscribe immediately delivers the
    // current auth snapshot, and every newly created control must be isolated.
    this.resetCampaignAccessGate();
    this.lockEntryFocusHandler = (event) => {
      const target = event.target;
      // ScreenManager focuses its temporary status before announcing a screen.
      // Preserve the real invoker instead of restoring that transient status.
      if (!this.lockOverlay && target instanceof HTMLElement
        && !target.closest("#screenTransitionStatus, #appBootStatus, .hidden, [hidden]")) {
        this.lockLastAvailableFocus = target;
      }
    };
    document.addEventListener("focusin", this.lockEntryFocusHandler, true);
    this.lockScreenHandler = () => this.syncCampaignLockState();
    document.addEventListener("screen:shown", this.lockScreenHandler);
    this.lockVisibilityObserver = new window.MutationObserver(() => this.syncCampaignLockState());
    this.lockVisibilityObserver.observe(this.element, { attributes: true, attributeFilter: ["class", "hidden"] });
    this.lockAuthUnsubscribe = this.unlockState.subscribe(() => this.syncCampaignLockState());

    // The scenario is rendered during application startup while the campaign screen is hidden,
    // so its viewport has no measurable size at that point. Center only after ScreenManager has
    // revealed the campaign; the extra frame gives the browser a layout pass before centerOn.
    if (this.campaignShownHandler) document.removeEventListener("screen:shown", this.campaignShownHandler);
    this.campaignShownHandler = (event) => {
      const detail = (event as CustomEvent<{ id?: string }>).detail;
      if (detail?.id !== "campaign") return;
      const scenario = this.campaignState.getCampaignMapView("Player")?.scenario;
      if (scenario) this.focusActiveFront(scenario);
    };
    document.addEventListener("screen:shown", this.campaignShownHandler);

    // Capture hooks after shell composition. Existing IDs are moved, never duplicated.
    this.economyContainer = this.element.querySelector<HTMLElement>("#campaignEconomySummary");
    this.productionContainer = this.element.querySelector<HTMLElement>("#campaignProductionSummary");
    this.productionManageButton = this.element.querySelector<HTMLButtonElement>("#campaignProductionManage");
    if (this.productionManageButton) {
      this.productionManageButton.addEventListener("click", () => {
        this.campaignPopupInvoker = this.productionManageButton;
        this.openProductionModal();
      });
    }
    this.selectionContainer = this.element.querySelector<HTMLElement>("#campaignSelectionInfo");
    this.queueEngagementButton = this.element.querySelector<HTMLButtonElement>("#campaignQueueEngagement");
    this.timeDisplayElement = this.element.querySelector<HTMLElement>("#campaignTimeDisplay");
    this.saveButton = this.element.querySelector<HTMLButtonElement>("#campaignSave");
    this.loadButton = this.element.querySelector<HTMLButtonElement>("#campaignLoad");
    this.battleSavesButton = this.element.querySelector<HTMLButtonElement>("#campaignBattleSaves");
    this.exitButton = this.element.querySelector<HTMLButtonElement>("#campaignExit");
    this.editModeButton = this.element.querySelector<HTMLButtonElement>("#campaignEditMode");
    this.exportJSONButton = this.element.querySelector<HTMLButtonElement>("#campaignExportJSON");
    this.editPanel = this.element.querySelector<HTMLElement>("#campaignEditPanel");
    this.intelDrawer = this.element.querySelector<HTMLElement>("#campaignIntelDrawer");
    this.intelSummary = this.element.querySelector<HTMLElement>("#campaignIntelSummary");
    this.intelUnreadBadge = this.element.querySelector<HTMLElement>("#campaignIntelUnread");
    this.intelCoverageButton = this.element.querySelector<HTMLButtonElement>("#campaignIntelCoverage");
    this.bindCampaignIntelControls();
    this.bindCampaignInspectorActions();

    if (this.saveButton) {
      this.saveButton.addEventListener("click", () => { void this.saveCampaignSession(); });
    }
    if (this.loadButton) {
      this.loadButton.addEventListener("click", () => { void this.loadCampaignSession(); });
    }
    if (this.battleSavesButton) {
      this.battleSavesButton.addEventListener("click", () => {
        document.dispatchEvent(new CustomEvent("campaign:battle:saves-open", {
          detail: { invokerId: this.battleSavesButton?.id ?? null }
        }));
      });
    }
    if (this.exitButton) {
      this.exitButton.addEventListener("click", () => this.screenManager.showScreenById("landing"));
    }

    if (this.editModeButton) {
      this.editModeButton.addEventListener("click", () => this.toggleEditMode());
    }

    if (this.exportJSONButton) {
      this.exportJSONButton.addEventListener("click", () => this.exportCampaignJSON());
    }

    this.initializeEditModeControls();

    if (this.queueEngagementButton) {
      // Clicking the button queues a pending engagement for the currently selected front
      this.queueEngagementButton.addEventListener("click", async () => {
        if (this.engagementTransitionBusy) {
          const transitionStatus = document.getElementById("screenTransitionStatus");
          const transitionActive = transitionStatus ? !transitionStatus.classList.contains("hidden") : false;
          if (transitionActive) return;
          this.engagementTransitionBusy = false;
        }
        if (this.campaignState.getActiveCampaignBattlePackage()) {
          this.onQueueEngagement?.();
          return;
        }
        const scenario = this.campaignState.getCampaignMapView("Player")?.scenario ?? null;
        if (!scenario) return;
        const existing = this.campaignState.getPendingEngagements();
        const id = `eng_${Date.now()}`;
        let engagement: CampaignPendingEngagement | null = null;
        // Prefer front-driven engagement if a front is selected
        if (this.selectedFrontKey) {
          const front = scenario.fronts.find((f) => f.key === this.selectedFrontKey);
          if (!front) return;
          if (front.initiative !== "Player") {
            this.setCampaignStatusMessage({
              title: "Enemy initiative front.",
              detail: `${front.label} is controlled by the opposing command and cannot be launched as a Player attack.`,
              action: "Advance campaign time or issue defensive orders. Any enemy offensive will interrupt command automatically.",
              tone: "info"
            });
            this.renderCommandShell();
            return;
          }
          const assessment = this.getPlayerFrontAssessment(front.key, this.selectedFrontTargetHexKey);
          if (!assessment.canLaunch || !assessment.target) {
            this.reportBattleLaunchFailure(assessment.targetRequired
              ? "Select which opposing front hex to attack before queuing the tactical engagement."
              : assessment.pressureLabel);
            return;
          }
          const prepared = this.campaignState.prepareCampaignFrontEngagement({
            engagementId: id,
            frontKey: front.key,
            attacker: "Player",
            requestedTargetHexKey: assessment.target.targetHexKey
          });
          if (!prepared.ok) {
            this.reportBattleLaunchFailure(prepared.reason);
            return;
          }
          engagement = prepared.engagement;
        } else if (this.selectedHexKey && this.campaignState.isAdjacentToEnemy(this.selectedHexKey)) {
          // Hex-proximity engagement when player forces are near enemy forces
          engagement = {
            id,
            frontKey: null,
            objectiveKey: null,
            attacker: "Player",
            defender: "Bot",
            hexKeys: [this.selectedHexKey],
            tags: ["proximity"]
          };
        } else {
          return;
        }

        // Capture the strategic context (mission type, forces in position, enemy pool, budget)
        // so precombat can honor the situation on the map. A campaign battle must never fall
        // back to a generic scenario when its authoritative target cannot be proven.
        let context = engagement.context ?? null;
        const battleHexKey = context?.battleHexKey ?? this.resolveBattleHexKey(engagement);
        if (!context) {
          if (!battleHexKey) {
            this.reportBattleLaunchFailure("The selected operation has no opposing controlled battle hex. Issue movement orders to establish contact or select another operation.");
            return;
          }
          try {
            context = this.campaignState.buildCampaignEngagementContext({
              engagementId: id,
              battleHexKey,
              attacker: engagement.attacker,
              frontKey: engagement.frontKey,
              objectiveKey: engagement.objectiveKey
            }, "Player");
          } catch (error) {
            console.error("[CampaignBattleLaunch] Engagement context failed safely", error);
            this.reportBattleLaunchFailure(error instanceof Error ? error.message : String(error));
            return;
          }
          if (!context) {
            this.reportBattleLaunchFailure("Campaign truth is unavailable for the selected battle hex. Reload the campaign before trying again.");
            return;
          }
          engagement.context = context;
        }
        try {
          // The battle generator keeps truth internally; commitment UI uses the frozen faction briefing.
          const briefing = context.intelligenceBriefing;
          const assessedDanger = briefing?.resistanceBand === "heavy" || briefing?.resistanceBand === "overwhelming";
          if (assessedDanger) {
            const proceed = await this.confirmCampaignAction(
              `${MISSION_TYPE_LABELS[context.missionType]} at ${this.getCampaignLocationDisplayLabel(context.battleHexKey)}`,
              `${briefing.summary} Confidence: ${briefing.confidenceBand}. Review this assessment before taking the operation to tactical planning.`,
              "Continue to tactical planning"
            );
            if (!proceed) {
              return;
            }
          }
        } catch (error) {
          console.error("[CampaignBattleLaunch] Engagement context failed safely", error);
          this.reportBattleLaunchFailure(error instanceof Error ? error.message : String(error));
          return;
        }

        existing.push(engagement);
        this.campaignState.setPendingEngagements(existing);
        this.campaignState.setActiveEngagementId(id);
        this.renderSelection();
        // If the app provided a transition handler, invoke it now to proceed into precombat.
        if (this.onQueueEngagement) {
          this.engagementTransitionBusy = true;
          this.onQueueEngagement();
        }
      });
    }

    // Subscribe to campaign state changes so the sidebar reflects latest data
    this.unsubscribe?.();
    this.unsubscribe = this.campaignState.subscribe((reason) => {
      // On scenario mutations (e.g., post-battle outcome), re-render the map so fronts/economy refresh visually.
      if (reason === "scenarioLoaded" || reason === "intelligenceUpdated" || reason === "dayAdvanced" || reason === "segmentResolved") {
        this.renderCampaignMap();
      }
      // Segment transactions update the operational clock only after the full candidate commits.
      if (reason === "dayAdvanced" || reason === "segmentResolved") {
        this.renderTimeDisplay();
      }
      this.renderEconomy();
      this.renderProduction();
      this.renderSelection();
      this.renderCampaignIntel();
      if (!this.saveLoadBusy) this.commandSaveStatus = "Unsaved";
      this.renderCommandShell();
    });
    this.renderCommandShell();
  }

  getElement(): HTMLElement {
    return this.element;
  }

  renderScenario(scenario: CampaignScenarioData): void {
    this.campaignState.setScenario(scenario);
    const svg = this.element.querySelector<SVGSVGElement>("#campaignHexMap");
    const canvas = this.element.querySelector<HTMLDivElement>("#campaignMapCanvas");
    if (!svg || !canvas) {
      return;
    }
    this.renderCampaignMap();
    this.bindTerrainEditDragHandlers(svg);
    // Map clicks are selection-only. Every campaign action requires a separate inspector or tray control.
    this.renderer.onHexClick((hexKey, _tile, contactId) => {
      const selectedFront = this.selectedFrontKey
        ? this.getPlayerFrontAssessment(this.selectedFrontKey)
        : null;
      const selectedTarget = selectedFront?.targets.find((target) => target.targetHexKey === hexKey) ?? null;
      if (selectedTarget && this.selectedFrontKey) {
        if (this.campaignStatusMessage) this.campaignStatusMessage = null;
        this.selectedFrontTargetHexKey = selectedTarget.targetHexKey;
        this.selectedHexKey = selectedTarget.targetHexKey;
        this.renderer.clearAllHighlights("selected");
        this.renderer.highlightHex(selectedTarget.targetHexKey, "selected");
        this.renderSelection();
        this.renderCommandShell();
        this.commandInterface?.revealInspector({ kind: "front", id: this.selectedFrontKey });
        this.renderCampaignIntel();
        return;
      }
      if (contactId && this.focusCampaignContact(contactId)) return;
      const scenario = this.campaignState.getCampaignMapView("Player")?.scenario ?? null;
      if (this.campaignStatusMessage) {
        this.campaignStatusMessage = null;
      }
      const priorFrontKey = this.selectedFrontKey;
      this.selectedFrontKey = null;
      // Front selection path
      if (scenario && scenario.fronts && scenario.fronts.length > 0) {
        for (const f of scenario.fronts) {
          if (f.hexKeys.includes(hexKey)) {
            this.selectedFrontKey = f.key;
            break;
          }
        }
      }
      if (this.selectedFrontKey !== priorFrontKey) this.selectedFrontTargetHexKey = null;

      this.selectedHexKey = hexKey;
      if (this.editMode) {
        this.moveOriginHexKey = null;
      }
      this.renderer.clearAllHighlights("selected");
      this.renderer.clearAllHighlights("origin");
      if (this.moveOriginHexKey) this.renderer.highlightHex(this.moveOriginHexKey, "origin");
      if (this.selectedHexKey) this.renderer.highlightHex(this.selectedHexKey, "selected");
      this.renderSelection();
      this.commandInterface?.revealInspector({ kind: "hex", id: hexKey });
      this.renderCampaignIntel();
    });

    // Initial sidebar render
    this.renderTimeDisplay();
    this.renderEconomy();
    this.renderProduction();
    this.renderSelection();
    this.renderCampaignIntel();
    this.renderCommandShell();
  }

  /** Binds pointer handlers used to drag-select hexes for bulk terrain marking in edit mode. */
  private bindTerrainEditDragHandlers(svg: SVGSVGElement): void {
    if (this.terrainDragHandlersAttached) {
      return;
    }

    const downHandler = (event: PointerEvent): void => this.handleTerrainPointerDown(event);
    const moveHandler = (event: PointerEvent): void => this.handleTerrainPointerMove(event);
    const upHandler = (event: PointerEvent): void => this.handleTerrainPointerUp(event);

    svg.addEventListener("pointerdown", downHandler);
    svg.addEventListener("pointermove", moveHandler);
    svg.addEventListener("pointerup", upHandler);
    svg.addEventListener("pointerleave", upHandler);

    this.terrainDragHandlersAttached = true;
  }

  /** Allows the app shell to provide a transition routine when an engagement is queued. */
  setQueueEngagementHandler(handler: (() => void) | null): void {
    this.onQueueEngagement = handler;
  }

  /** Keeps campaign command usable when a tactical handoff cannot preserve campaign truth. */
  reportBattleLaunchFailure(reason: string): void {
    this.engagementTransitionBusy = false;
    this.setCampaignStatusMessage({
      title: "Tactical handoff blocked",
      detail: reason,
      action: "Keep campaign time paused. Review the selected operation or reload after its campaign data is repaired.",
      tone: "warning"
    });
    this.renderCommandShell();
  }

  /** Updates the campaign time display. */
  private renderTimeDisplay(): void {
    if (!this.timeDisplayElement) {
      return;
    }
    const timeDisplay = this.campaignState.getCurrentTimeDisplay();
    this.timeDisplayElement.textContent = timeDisplay;
  }

  /** Updates the economy summary sidebar using the loaded scenario economies. */
  private renderEconomy(): void {
    if (!this.economyContainer) {
      return;
    }
    const scenario = this.campaignState.getCampaignMapView("Player")?.scenario ?? null;
    if (!scenario) {
      this.economyContainer.innerHTML = "";
      return;
    }

    // Format numbers with thousands separators
    const fmt = (n: number) => n.toLocaleString();

    // Color coding for resource levels
    const getResourceColor = (current: number, threshold: number) => {
      if (current > threshold * 2) return "rgba(100, 220, 120, 0.9)"; // Green - abundant
      if (current > threshold) return "rgba(200, 220, 140, 0.9)"; // Yellow-green - good
      if (current > threshold * 0.5) return "rgba(255, 200, 100, 0.9)"; // Orange - low
      return "rgba(255, 120, 120, 0.9)"; // Red - critical
    };

    const rows = scenario.economies
      .filter((economy) => economy.faction === "Player")
      .map((e) => {
        const transportCap = e.transportCapacity;
        const trucksAvail = transportCap ? transportCap.trucks - transportCap.trucksInTransit : 0;
        const shipsAvail = transportCap ? transportCap.transportShips - transportCap.transportShipsInTransit : 0;
        const planesAvail = transportCap ? transportCap.transportPlanes - transportCap.transportPlanesInTransit : 0;

        return `
          <div style="margin-bottom: 0.875rem; padding: 0.875rem; background: rgba(0,0,0,0.25); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px;">
            <div style="font-weight: 700; font-size: 0.95em; margin-bottom: 0.75rem; color: rgba(220, 240, 255, 0.95); text-transform: uppercase; letter-spacing: 0.03em; padding-bottom: 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.12);">
              ${e.faction}
            </div>
            <div style="display: flex; flex-direction: column; gap: 0.4rem; font-size: 0.85em;">
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0;">
                <span style="color: rgba(200, 200, 200, 0.85);">Manpower</span>
                <span style="font-weight: 600; color: ${getResourceColor(e.manpower, 10000)};">${fmt(e.manpower)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0;">
                <span style="color: rgba(200, 200, 200, 0.85);">Supplies</span>
                <span style="font-weight: 600; color: ${getResourceColor(e.supplies, 5000)};">${fmt(e.supplies)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0;">
                <span style="color: rgba(200, 200, 200, 0.85);">Fuel</span>
                <span style="font-weight: 600; color: ${getResourceColor(e.fuel, 5000)};">${fmt(e.fuel)}</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0;">
                <span style="color: rgba(200, 200, 200, 0.85);">Ammo</span>
                <span style="font-weight: 600; color: ${getResourceColor(e.ammo ?? 0, 2000)};">${fmt(e.ammo ?? 0)}</span>
              </div>
              <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.1); display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; font-size: 0.8em;">
                <div style="text-align: center; padding: 0.35rem; background: rgba(60, 120, 200, 0.15); border-radius: 5px;">
                  <div style="color: rgba(180, 180, 180, 0.8);">Air power</div>
                  <div style="font-weight: 600; color: rgba(220, 240, 255, 0.95); margin-top: 0.1rem;">${e.airPower}</div>
                </div>
                <div style="text-align: center; padding: 0.35rem; background: rgba(60, 120, 200, 0.15); border-radius: 5px;">
                  <div style="color: rgba(180, 180, 180, 0.8);">Naval power</div>
                  <div style="font-weight: 600; color: rgba(220, 240, 255, 0.95); margin-top: 0.1rem;">${e.navalPower}</div>
                </div>
              </div>
              ${transportCap ? `
                <div style="margin-top: 0.5rem; padding: 0.5rem; background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 6px; font-size: 0.8em; line-height: 1.5; color: rgba(200, 200, 200, 0.85);">
                  <div style="font-weight: 600; color: rgba(220, 220, 220, 0.9); margin-bottom: 0.3rem;">Transport Capacity:</div>
                  <div style="display: flex; justify-content: space-between;">
                    <span>Trucks</span>
                    <span style="font-weight: 600; color: ${trucksAvail > 0 ? 'rgba(120, 200, 140, 0.95)' : 'rgba(255, 120, 120, 0.95)'};">${trucksAvail}/${transportCap.trucks}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span>Transport ships</span>
                    <span style="font-weight: 600; color: ${shipsAvail > 0 ? 'rgba(120, 200, 140, 0.95)' : 'rgba(255, 120, 120, 0.95)'};">${shipsAvail}/${transportCap.transportShips}</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span>Transport aircraft</span>
                    <span style="font-weight: 600; color: ${planesAvail > 0 ? 'rgba(120, 200, 140, 0.95)' : 'rgba(255, 120, 120, 0.95)'};">${planesAvail}/${transportCap.transportPlanes}</span>
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        `;
      })
      .join("");
    this.economyContainer.innerHTML = `${rows}
      <div class="campaign-classified-economy" role="note">
        <strong>Enemy logistics: classified</strong>
        <span>Strength and sustainment appear only when intelligence sources produce an assessment.</span>
      </div>`;
  }

  /** Renders the compact theater-support summary and next delivery. */
  private renderProduction(): void {
    if (!this.productionContainer) {
      return;
    }
    const report = this.campaignState.getProductionReport();
    if (!report) {
      this.productionContainer.innerHTML = "";
      return;
    }
    const fmt = (n: number) => n.toLocaleString();
    const hoursUntil = report.segmentsUntilNextTick * CAMPAIGN_SEGMENT_HOURS;
    const row = (label: string, value: number) => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:0.2rem 0;font-size:0.85em;">
        <span style="color:rgba(200,200,200,0.85);">${label}</span>
        <span style="font-weight:600;color:rgba(140,220,150,0.95);">+${fmt(value)}</span>
      </div>`;
    this.productionContainer.innerHTML = `
      <div style="padding:0.75rem;background:rgba(0,0,0,0.25);border:1px solid rgba(255,255,255,0.08);border-radius:8px;">
        <div style="display:flex;justify-content:space-between;font-size:0.8em;color:rgba(180,190,205,0.75);margin-bottom:0.4rem;">
          <span>Delivery capacity: <strong style="color:rgba(220,240,255,0.95);">${fmt(report.capacity)}</strong></span>
          <span>${report.sources.length} staging hub${report.sources.length !== 1 ? "s" : ""}</span>
        </div>
        <div style="font-size:0.72em;text-transform:uppercase;letter-spacing:0.05em;color:rgba(180,190,205,0.6);margin-bottom:0.25rem;">Next daily delivery</div>
        ${row("Supplies", report.daily.supplies)}
        ${row("Fuel", report.daily.fuel)}
        ${row("Ammo", report.daily.ammo)}
        ${row("Replacements", report.daily.manpower)}
        <div style="margin-top:0.4rem;padding-top:0.4rem;border-top:1px solid rgba(255,255,255,0.1);font-size:0.78em;color:rgba(245,196,109,0.9);">
          Next delivery in ${report.segmentsUntilNextTick} segment${report.segmentsUntilNextTick !== 1 ? "s" : ""} (${hoursUntil}h)
        </div>
      </div>
    `;
    if (this.productionManageButton) {
      const action = this.campaignActionRegistry.resolve("production", {
        selectionKind: "none",
        selectionId: null
      });
      this.productionManageButton.disabled = action.availability !== "available";
      this.productionManageButton.dataset.reasonCode = action.reasonCode ?? "";
      this.productionManageButton.title = action.availability === "available"
        ? "Allocate the next cross-Channel delivery."
        : `${action.reason ?? "Support allocation is unavailable."} ${action.correctiveAction ?? ""}`.trim();
    }
  }

  /** Opens the theater-support allocation modal with a live daily-delivery preview. */
  private openProductionModal(editingOrder?: Extract<CampaignOrder, { kind: "production" }>): void {
    const layer = document.getElementById("battlePopupLayer");
    const dialog = layer?.querySelector<HTMLElement>(".battle-popup");
    const title = dialog?.querySelector<HTMLElement>("[data-popup-title]");
    const body = dialog?.querySelector<HTMLElement>("[data-popup-body]");
    const close = dialog?.querySelector<HTMLButtonElement>("#battlePopupClose");
    if (!layer || !dialog || !title || !body || !close) return;

    const report = this.campaignState.getProductionReport();
    if (!report) return;

    title.textContent = editingOrder ? "Edit Allied Support Allocation" : "Allied Support Allocation";
    const fmt = (n: number) => n.toLocaleString();

    const RESOURCES: Array<{ key: keyof ProductionAllocation; label: string; hint: string }> = [
      { key: "supplies", label: "Supplies", hint: "Rations, spares, consumables" },
      { key: "fuel", label: "Fuel", hint: "Powers armor, ships, aircraft" },
      { key: "ammo", label: "Ammunition", hint: "Feeds tactical battles" },
      { key: "manpower", label: "Replacements", hint: "Personnel recruited and trained before arrival" }
    ];

    const sliderRows = RESOURCES.map(
      (r) => `
      <div class="production-alloc-row">
        <div class="alloc-label">
          <span class="alloc-name">${r.label}</span>
          <span class="alloc-hint">${r.hint}</span>
        </div>
        <input type="range" min="0" max="100" step="5" value="${editingOrder?.payload.allocation[r.key] ?? report.allocation[r.key]}" data-alloc-slider="${r.key}" aria-label="${r.label} allocation" />
        <span class="alloc-pct" data-alloc-pct="${r.key}">${editingOrder?.payload.allocation[r.key] ?? report.allocation[r.key]}%</span>
        <span class="alloc-out" data-alloc-out="${r.key}"></span>
      </div>`
    ).join("");

    body.innerHTML = `
      <div class="production-modal">
        <div class="production-capacity-banner">
          Theater delivery capacity <strong>${fmt(report.capacity)}</strong> from ${report.sources.length} rear-area staging hub${report.sources.length !== 1 ? "s" : ""}
          · next delivery in ${report.segmentsUntilNextTick} segment${report.segmentsUntilNextTick !== 1 ? "s" : ""}
        </div>
        <div class="redeploy-section-label">Allocation <span class="alloc-total" id="productionAllocTotal"></span></div>
        <div class="production-alloc">${sliderRows}</div>
        <div class="production-alloc-note">Set the four delivery shares to 100% total. Resources enter through the rear-area staging network; forward positions receive them.</div>
        <div id="productionOrderPreview" class="campaign-order-preview-contract" aria-live="polite"></div>
        <div class="button-row redeploy-actions">
          <button type="button" class="primary-button" id="productionApply">${editingOrder ? "Update Draft" : "Save Allocation Draft"}</button>
          <button type="button" class="secondary-button" id="productionCancel">Cancel</button>
        </div>
      </div>
    `;

    const sliders = Array.from(body.querySelectorAll<HTMLInputElement>("[data-alloc-slider]"));
    const totalEl = body.querySelector<HTMLElement>("#productionAllocTotal");
    const applyBtn = body.querySelector<HTMLButtonElement>("#productionApply");
    const cancelBtn = body.querySelector<HTMLButtonElement>("#productionCancel");
    const previewEl = body.querySelector<HTMLElement>("#productionOrderPreview");
    if (!applyBtn || !cancelBtn) return;
    const readAllocation = (): ProductionAllocation => {
      const raw: ProductionAllocation = { supplies: 0, fuel: 0, ammo: 0, manpower: 0 };
      sliders.forEach((sl) => {
        const key = sl.dataset.allocSlider as keyof ProductionAllocation;
        raw[key] = Number(sl.value) || 0;
      });
      return raw;
    };

    const refresh = (): void => {
      const raw = readAllocation();
      const total = raw.supplies + raw.fuel + raw.ammo + raw.manpower;
      if (totalEl) {
        totalEl.textContent = `· total ${total}%`;
        totalEl.classList.toggle("alloc-total-off", total !== 100);
      }
      const preview = this.campaignState.previewProductionDraft(raw, editingOrder?.id);
      const daily = preview.dailyOutput ?? computeDailyProduction(report.capacity, { supplies: 0, fuel: 0, ammo: 0, manpower: 0 });
      RESOURCES.forEach((r) => {
        const pctEl = body.querySelector<HTMLElement>(`[data-alloc-pct="${r.key}"]`);
        const outEl = body.querySelector<HTMLElement>(`[data-alloc-out="${r.key}"]`);
        if (pctEl) pctEl.textContent = `${raw[r.key]}%`;
        if (outEl) outEl.textContent = `+${fmt(daily[r.key])}/day`;
      });
      if (previewEl) {
        const normalized = preview.normalizedAllocation;
        previewEl.innerHTML = preview.action.availability === "available" && normalized && preview.effectiveSegment !== null
          ? `<div class="campaign-order-preview-clear"><dt>Effective</dt><dd>${this.escapeHtml(this.campaignState.segmentToTimeDisplay(preview.effectiveSegment))} · the current mix remains active until delivery.</dd></div>`
          : `<div class="redeploy-issue" data-reason-code="${preview.action.reasonCode ?? "ORDER_ALLOCATION_INVALID"}"><strong>Support allocation unavailable</strong><span>${this.escapeHtml(preview.action.reason ?? "The allocation is unavailable.")}</span><small>${this.escapeHtml(preview.action.correctiveAction ?? "Adjust the allocation and review it again.")}</small></div>`;
      }
      applyBtn.disabled = preview.action.availability !== "available" || !preview.normalizedAllocation;
    };

    sliders.forEach((sl) => sl.addEventListener("input", refresh));
    refresh();

    const hide = (): void => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      layer.removeEventListener("keydown", onEscape);
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      hide();
      this.campaignPopupInvoker?.focus({ preventScroll: true });
    };

    applyBtn.onclick = () => {
      const result = this.campaignState.createProductionDraft(readAllocation(), editingOrder?.id);
      if (!result.ok) {
        this.setCampaignStatusMessage({
          title: "Draft not added.",
          detail: result.reason ?? "The support allocation draft could not be stored.",
          action: "Adjust the sliders so at least one resource receives output.",
          tone: "warning"
        });
        return;
      }
      hide();
      this.commandCommitFeedback = { feedback: `Support draft ${editingOrder ? "replaced" : "added"}; the next-delivery slot is held without spending stocks.`, feedbackTone: "success" };
      this.renderCommandShell();
      this.setCampaignStatusMessage({
        title: result.order.validation.valid ? `Support draft ${editingOrder ? "replaced" : "ready"}.` : "Support draft has a conflict.",
        detail: result.order.validation.issues[0]?.message ?? `The ${editingOrder ? "revised" : "new"} output mix is waiting in the order tray.`,
        action: result.order.validation.valid ? "Review and commit the draft before the next daily delivery." : "Remove the earlier support draft before committing.",
        tone: "success"
      });
    };
    cancelBtn.onclick = () => { hide(); this.campaignPopupInvoker?.focus({ preventScroll: true }); };
    close.onclick = () => { hide(); this.campaignPopupInvoker?.focus({ preventScroll: true }); };

    layer.classList.remove("hidden");
    layer.setAttribute("aria-hidden", "false");
    body.scrollTop = 0;
    const sources = body.querySelector<HTMLElement>(".production-sources");
    if (sources) sources.scrollTop = 0;
    layer.addEventListener("keydown", onEscape);
    applyBtn.focus({ preventScroll: true });
  }

  /** Opens a reviewed, fully costed reconstruction composer instead of creating a one-click draft. */
  private openInfrastructureRepairModal(targetOffsetHexKey: string): void {
    const layer = document.getElementById("battlePopupLayer");
    const dialog = layer?.querySelector<HTMLElement>(".battle-popup");
    const title = dialog?.querySelector<HTMLElement>("[data-popup-title]");
    const body = dialog?.querySelector<HTMLElement>("[data-popup-body]");
    const close = dialog?.querySelector<HTMLButtonElement>("#battlePopupClose");
    const status = this.campaignState.getCampaignInfrastructureStatus(targetOffsetHexKey, "Player");
    const action = this.campaignActionRegistry.resolve("infrastructureRepair", {
      selectionKind: "hex",
      selectionId: targetOffsetHexKey
    });
    if (!layer || !dialog || !title || !body || !close || !status || action.availability === "hidden") return;
    title.textContent = "Plan Reconstruction";
    const infrastructureLabel = status.infrastructure.role.replace(/([A-Z])/g, " $1").trim();
    const location = this.getCampaignLocationPresentation(targetOffsetHexKey);
    body.innerHTML = `
      <form id="campaignInfrastructureRepairForm" class="campaign-infrastructure-composer">
        <section class="campaign-order-preview-hero">
          <span>Facility and intent</span>
          <strong>${this.escapeHtml(infrastructureLabel)} at ${this.escapeHtml(location.primaryLabel)}</strong>
          <small class="campaign-location-grid">${this.escapeHtml(location.secondaryGridReference)}</small>
          <p>Restore ${status.infrastructure.integrity}/${status.infrastructure.maxIntegrity} integrity to full operational capacity.</p>
        </section>
        <dl class="campaign-order-preview-contract">
          <div><dt>Target / area</dt><dd>${this.escapeHtml(location.primaryLabel)} · friendly-controlled ${this.escapeHtml(infrastructureLabel)}<small class="campaign-location-grid">${this.escapeHtml(location.secondaryGridReference)}</small></dd></div>
          <div><dt>Participant</dt><dd>${this.escapeHtml(status.engineerFormationName ?? "No supervising formation available")}</dd></div>
          <div><dt>Timing</dt><dd>Starts next segment · ${status.durationSegments * CAMPAIGN_SEGMENT_HOURS} hours · completes ${this.escapeHtml(this.campaignState.segmentToTimeDisplay(status.completeSegment))}</dd></div>
          <div><dt>Cost now</dt><dd>${status.suppliesCost.toLocaleString()} supply · ${status.manpowerCost.toLocaleString()} personnel</dd></div>
          <div><dt>Reservations</dt><dd>Supervising formation, facility reconstruction slot, and exact resource stocks.</dd></div>
          <div><dt>Known risk</dt><dd>The formation remains committed on site; control loss or interruption can block completion.</dd></div>
          <div><dt>Objective effect</dt><dd>Restored capacity can support later objective conditions; no score changes at draft or commit.</dd></div>
          <div><dt>Cancellation</dt><dd>Before execution, committed stocks and the supervising formation are released exactly.</dd></div>
        </dl>
        <div id="campaignInfrastructureRepairIssues" class="redeploy-issues" aria-live="polite"></div>
        <div class="button-row redeploy-actions">
          <button type="submit" class="primary-button" id="campaignInfrastructureRepairConfirm">Add Draft</button>
          <button type="button" class="secondary-button" id="campaignInfrastructureRepairCancel">Cancel</button>
        </div>
      </form>
    `;
    const form = body.querySelector<HTMLFormElement>("#campaignInfrastructureRepairForm");
    const confirm = body.querySelector<HTMLButtonElement>("#campaignInfrastructureRepairConfirm");
    const cancel = body.querySelector<HTMLButtonElement>("#campaignInfrastructureRepairCancel");
    const issues = body.querySelector<HTMLElement>("#campaignInfrastructureRepairIssues");
    if (!form || !confirm || !cancel || !issues) return;
    decorateCampaignOrderComposer(form, "infrastructureRepair", projectCampaignOrderLocationSummary(this.getCampaignLocationPresentation(targetOffsetHexKey)));
    confirm.disabled = action.availability !== "available";
    issues.innerHTML = action.availability === "available"
      ? `<div class="campaign-order-preview-clear">No conflicts in the current command picture.</div>`
      : `<div class="redeploy-issue" data-reason-code="${action.reasonCode ?? "ORDER_INFRASTRUCTURE_INVALID"}"><strong>Reconstruction unavailable</strong><span>${this.escapeHtml(action.reason ?? "Reconstruction is unavailable.")}</span><small>${this.escapeHtml(action.correctiveAction ?? "Review the selected facility.")}</small></div>`;
    const hide = (): void => {
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      this.renderer.clearAllHighlights("order-preview-target");
      this.campaignPopupInvoker?.focus({ preventScroll: true });
    };
    form.onsubmit = (event) => {
      event.preventDefault();
      const result = this.campaignState.createInfrastructureRepairDraft(targetOffsetHexKey);
      if (!result.ok) {
        issues.innerHTML = `<div class="redeploy-issue"><strong>DRAFT NOT ADDED</strong><span>${this.escapeHtml(result.reason ?? "Headquarters could not authorize reconstruction.")}</span><small>Review control, stocks, and on-site formation supervision.</small></div>`;
        return;
      }
      hide();
      this.commandCommitFeedback = { feedback: "Reconstruction draft added; stocks, facility slot, and supervising formation are held without spending.", feedbackTone: "success" };
      this.renderCommandShell();
      this.setCampaignStatusMessage({
        title: result.order.validation.valid ? "Repair draft ready." : "Repair draft has a conflict.",
        detail: result.order.validation.issues[0]?.message ?? "The reconstruction plan is waiting in the order tray.",
        action: result.order.validation.valid
          ? "Review its cost and completion time, then commit the order."
          : "Resolve the listed reservation conflict before committing.",
        tone: result.order.validation.valid ? "success" : "warning"
      });
    };
    cancel.onclick = hide;
    close.onclick = hide;
    layer.classList.remove("hidden");
    layer.setAttribute("aria-hidden", "false");
    this.renderer.highlightHex(targetOffsetHexKey, "order-preview-target");
    confirm.focus({ preventScroll: true });
  }

  /** Binds explicit inspector actions; map gestures themselves remain selection-only. */
  private syncRedeploymentTargetMode(): void {
    if (!this.commandInterface || !this.moveOriginHexKey) {
      this.commandInterface?.setRedeploymentTargetMode(null);
      return;
    }
    const view = this.campaignState.getCampaignMapView("Player");
    if (!view) {
      this.commandInterface.setRedeploymentTargetMode(null);
      return;
    }
    const destinations = view.scenario.tiles.map((tile) => {
      const offset = CoordinateSystem.axialToOffset(tile.hex.q, tile.hex.r);
      const hexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
      const preview = this.campaignState.getCampaignRedeployDestinationPreview(this.moveOriginHexKey!, hexKey);
      return {
        hexKey,
        label: `${this.getCampaignLocationDisplayLabel(hexKey)} · Grid ${hexKey}`,
        available: preview.availability === "available",
        reason: preview.reason
      };
    }).sort((left, right) => {
      const a = CoordinateSystem.parseHexKey(left.hexKey);
      const b = CoordinateSystem.parseHexKey(right.hexKey);
      return (a?.row ?? 0) - (b?.row ?? 0) || (a?.col ?? 0) - (b?.col ?? 0);
    });
    this.commandInterface.setRedeploymentTargetMode(this.moveOriginHexKey, destinations);
  }

  private bindCampaignInspectorActions(): void {
    this.selectionContainer?.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const frontTarget = target.closest<HTMLButtonElement>("[data-campaign-front-target-choice]");
      if (frontTarget && this.selectedFrontKey) {
        this.selectedFrontTargetHexKey = frontTarget.dataset.campaignFrontTargetChoice || null;
        this.selectedHexKey = this.selectedFrontTargetHexKey;
        const renderer = this.renderer as CampaignMapRenderer | undefined;
        renderer?.clearAllHighlights("selected");
        if (this.selectedFrontTargetHexKey) renderer?.highlightHex(this.selectedFrontTargetHexKey, "selected");
        this.renderSelection();
        this.renderCommandShell();
        const replacement = Array.from(this.selectionContainer?.querySelectorAll<HTMLButtonElement>("[data-campaign-front-target-choice]") ?? [])
          .find((button) => button.dataset.campaignFrontTargetChoice === this.selectedFrontTargetHexKey);
        replacement?.focus({ preventScroll: true });
        // Replacing selection markup can change its height; retain the player's
        // selected target inside the single information scroll owner.
        replacement?.scrollIntoView({ block: "nearest", inline: "nearest" });
        return;
      }
      if (target.closest("[data-plan-campaign-redeploy]")) {
        if (!this.selectedHexKey) return;
        this.campaignPopupInvoker = target.closest<HTMLElement>("[data-plan-campaign-redeploy]");
        this.moveOriginHexKey = this.selectedHexKey;
        this.renderer.clearAllHighlights("origin");
        this.renderer.highlightHex(this.moveOriginHexKey, "origin");
        this.syncRedeploymentTargetMode();
        this.renderSelection();
        return;
      }
      if (target.closest("[data-confirm-campaign-redeploy]")) {
        if (!this.moveOriginHexKey || !this.selectedHexKey || this.moveOriginHexKey === this.selectedHexKey) return;
        const origin = this.moveOriginHexKey;
        const destination = this.selectedHexKey;
        const preview = this.campaignState.getCampaignRedeployDestinationPreview(origin, destination);
        if (preview.availability !== "available") {
          this.commandCommitFeedback = {
            feedback: `${preview.reason ?? "This redeployment route is unavailable."} ${preview.correctiveAction ?? ""}`.trim(),
            feedbackTone: "warning"
          };
          this.renderCommandShell();
          return;
        }
        this.moveOriginHexKey = null;
        this.syncRedeploymentTargetMode();
        this.renderer.clearAllHighlights("origin");
        this.campaignPopupInvoker = target.closest<HTMLElement>("[data-confirm-campaign-redeploy]");
        this.openRedeployModal(origin, destination, undefined, this.selectedFormationId ?? undefined);
        this.renderSelection();
        return;
      }
      if (target.closest("[data-cancel-campaign-redeploy]")) {
        this.moveOriginHexKey = null;
        this.syncRedeploymentTargetMode();
        this.renderer.clearAllHighlights("origin");
        this.renderSelection();
        return;
      }
      if (target.closest("[data-draft-infrastructure-repair]")) {
        if (!this.selectedHexKey) return;
        this.campaignPopupInvoker = target.closest<HTMLElement>("[data-draft-infrastructure-repair]");
        this.openInfrastructureRepairModal(this.selectedHexKey);
      }
      const recovery = target.closest<HTMLButtonElement>("[data-draft-formation-recovery]");
      if (recovery && !recovery.disabled && this.selectedFormationId
        && recovery.dataset.formationId === this.selectedFormationId) {
        const result = this.campaignState.createFormationRecoveryDraft({
          formationId: this.selectedFormationId,
          expectedRevision: Number(recovery.dataset.recoveryRevision),
          faction: "Player"
        });
        this.setCampaignStatusMessage(result.ok ? {
          title: "Recovery draft added.", detail: "The exact formation and supply hold are reserved; treatment begins after commit.",
          action: "Review the order's cost and completion time, then commit the order.", tone: "success"
        } : {
          title: "Recovery draft not added.", detail: result.reason,
          action: "Review the refreshed quote and resolve its listed blocker before trying again.", tone: "warning"
        });
        this.renderCommandShell();
        const panel = this.selectionContainer?.querySelector<HTMLElement>("[data-campaign-formation-recovery]");
        if (panel && !panel.closest("[hidden], .hidden, [inert]")) {
          const nextControl = result.ok
            ? Array.from(panel.querySelectorAll<HTMLButtonElement>("[data-campaign-recovery-order-id]"))
              .find((button) => button.dataset.campaignRecoveryOrderId === result.order.id)
            : panel.querySelector<HTMLButtonElement>("[data-draft-formation-recovery]:not(:disabled)");
          if (nextControl) nextControl.focus();
          else if (!result.ok) {
            panel.tabIndex = -1;
            panel.focus();
          }
        }
        return;
      }
      const recoveryOrder = target.closest<HTMLButtonElement>("[data-campaign-recovery-order-id]");
      if (recoveryOrder?.dataset.campaignRecoveryOrderId) {
        this.commandInterface?.navigate({ kind: "order", id: recoveryOrder.dataset.campaignRecoveryOrderId, focus: true });
      }
    });
  }

  /** Displays State's survivor-recovery quote or its current order, without owning pricing or eligibility. */
  private renderFormationRecovery(formation: CampaignFormationRecord): string {
    const recoveryOrders = this.campaignState.getCampaignOrders().filter((order) => order.kind === "formationRecovery"
      && order.faction === "Player" && order.payload.formationId === formation.id);
    const current = recoveryOrders.find((order) => ["draft", "committed", "executing"].includes(order.status));
    const latest = [...recoveryOrders].reverse().find((order) => order.status !== "cancelled");
    const interrupted = !current && latest?.status === "blocked" ? latest : null;
    const preview = this.campaignState.getCampaignFormationRecoveryPreview(formation.id, "Player");
    const quote = current?.kind === "formationRecovery" ? current.payload : preview.quote;
    // A blocked record explains history; only State's current preview can authorize continuation.
    const interruptionDetail = interrupted
      ? `<p>Previous recovery interrupted.</p>${interrupted.validation.issues.map((issue) => `<p>${this.escapeHtml(issue.message)}</p>`).join("")}
         <div class="campaign-context-actions"><button type="button" data-campaign-recovery-order-id="${this.escapeHtml(interrupted.id)}">Review interrupted recovery order</button></div>`
      : "";
    const exactQuote = quote
      ? `${quote.resumedFromOrderId ? "<p>Continue interrupted recovery. Completed treatment and repair are retained; this quote covers the remaining work and workshop time.</p>" : ""}
         <p>${quote.suppliesCost} supply · ${quote.durationSegments * CAMPAIGN_SEGMENT_HOURS} hours · projected readiness ${Math.round(quote.projectedReadiness)}%</p>
         <p>${quote.personnelToFit} surviving personnel can return to duty · ${quote.equipmentToOperational} equipment can return to service.</p>
         <p>${quote.permanentPersonnelLosses} killed personnel and ${quote.permanentEquipmentLosses} destroyed equipment remain losses.</p>
         <p>Starts ${this.escapeHtml(this.campaignState.segmentToTimeDisplay(quote.startSegment))} · completes ${this.escapeHtml(this.campaignState.segmentToTimeDisplay(quote.completeSegment))}.</p>`
      : "";
    const currentDetail = current?.kind === "formationRecovery"
      ? `<p>${this.escapeHtml(this.formatCampaignLabel(current.status))} · ${current.payload.progress.completedSegments}/${current.payload.durationSegments} recovery segments complete.</p>
         ${current.validation.issues.map((issue) => `<p>${this.escapeHtml(issue.message)}</p>`).join("")}
         <div class="campaign-context-actions"><button type="button" data-campaign-recovery-order-id="${this.escapeHtml(current.id)}">Review recovery order</button></div>`
      : `${preview.reason ? `<p data-reason-code="${this.escapeHtml(preview.reasonCode ?? "")}">${this.escapeHtml(preview.reason)} ${this.escapeHtml(preview.correctiveAction ?? "")}</p>` : ""}
         <div class="campaign-context-actions"><button type="button" data-draft-formation-recovery data-formation-id="${this.escapeHtml(formation.id)}" data-recovery-revision="${preview.revision}" ${preview.availability === "available" ? "" : "disabled"}>Add recovery draft</button></div>`;
    return `<section class="campaign-infrastructure-recovery" data-campaign-formation-recovery><strong>Formation recovery</strong>${interruptionDetail}${exactQuote}${currentDetail}</section>`;
  }

  /** Renders projected selection details, legal explicit actions, and engagement queue status. */
  private renderSelection(): void {
    if (!this.selectionContainer) {
      return;
    }
    const items: string[] = [];
    const statusSections: Array<{ source: "campaign" | "headquarters"; message: CampaignScreenStatusMessage }> = [];
    if (this.campaignStatusMessage) {
      statusSections.push({ source: "campaign", message: this.campaignStatusMessage });
    }
    const headquartersStatus = this.campaignState.getHeadquartersStatusMessage();
    if (headquartersStatus) {
      statusSections.push({ source: "headquarters", message: headquartersStatus });
    }
    if (statusSections.length > 0) {
      items.push(...statusSections.map(({ source, message }) => this.composeStatusMarkup(source, message)));
      this.selectionContainer.setAttribute("aria-live", "assertive");
      this.selectionContainer.setAttribute("data-status", statusSections[0].message.tone);
    } else {
      this.selectionContainer.removeAttribute("aria-live");
      this.selectionContainer.removeAttribute("data-status");
    }
    const view = this.campaignState.getCampaignMapView("Player");
    const selectedFormation = this.selectedFormationId
      ? this.campaignState.getCampaignFormationSnapshot(this.selectedFormationId)
      : null;
    const selectedFormationCanReceiveOrders = !this.selectedFormationId
      || Boolean(selectedFormation && projectCampaignFormationPosture(selectedFormation).canReceiveOrders);
    if (selectedFormation?.faction === "Player") items.push(this.renderFormationRecovery(selectedFormation));
    let selectedIsFriendlyOccupied = false;
    let selectedCanRedeploy = false;
    let selectedRole: string | null = null;
    const selectedInfrastructure = this.selectedHexKey
      ? this.campaignState.getCampaignInfrastructureStatus(this.selectedHexKey, "Player")
      : null;
    if (this.selectedHexKey && view) {
      const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
      const axial = parsed ? CoordinateSystem.offsetToAxial(parsed.col, parsed.row) : null;
      const tile = axial ? view.scenario.tiles.find((entry) => entry.hex.q === axial.q && entry.hex.r === axial.r) : null;
      const palette = tile ? view.scenario.tilePalette[tile.tile] : null;
      const owner = tile ? tile.factionControl ?? palette?.factionControl ?? "Neutral" : "Unknown";
      selectedIsFriendlyOccupied = owner === "Player" && Boolean(tile?.forces?.some((force) => force.count > 0));
      selectedRole = palette?.role ?? null;
      selectedCanRedeploy = owner === "Player"
        && selectedFormationCanReceiveOrders
        && this.campaignState.getCampaignRedeployActionPreview(this.selectedHexKey, "Player").availability === "available";
      if (selectedInfrastructure && (
        selectedInfrastructure.repairPoints > 0
        || selectedInfrastructure.infrastructure.activeRepairOrderId
        || selectedInfrastructure.infrastructure.captureDisruptionUntilSegment !== null
      )) {
        const infrastructure = selectedInfrastructure.infrastructure;
        const capacityPercent = Math.round(infrastructure.effectiveness * 100);
        const reorganizationTime = infrastructure.captureDisruptionUntilSegment !== null
          ? this.campaignState.segmentToTimeDisplay(infrastructure.captureDisruptionUntilSegment)
          : null;
        const repairStatus = infrastructure.activeRepairOrderId
          ? "Reconstruction order active"
          : selectedInfrastructure.repairPoints > 0
            ? `${selectedInfrastructure.repairPoints} integrity missing · ${selectedInfrastructure.repairRate}/segment repair rate`
            : "Garrison reorganization in progress";
        const repairDescriptor = selectedInfrastructure.repairPoints > 0
          ? this.campaignActionRegistry.resolve("infrastructureRepair", {
            selectionKind: "hex",
            selectionId: this.selectedHexKey
          })
          : null;
        const repairAction = repairDescriptor && !infrastructure.activeRepairOrderId
          ? `<button type="button" data-draft-infrastructure-repair data-reason-code="${repairDescriptor.reasonCode ?? ""}" ${repairDescriptor.availability === "available" ? "" : "disabled"} title="${this.escapeHtml(repairDescriptor.availability === "available" ? "Review the full reconstruction plan." : `${repairDescriptor.reason ?? "Reconstruction is unavailable."} ${repairDescriptor.correctiveAction ?? ""}`.trim())}">Plan reconstruction</button>`
          : "";
        const reorganizationNotice = projectCampaignInfrastructureRecoveryStatus({
          integrity: infrastructure.integrity,
          maxIntegrity: infrastructure.maxIntegrity,
          captureDisruptionUntilSegment: infrastructure.captureDisruptionUntilSegment,
          disruptionTimeLabel: reorganizationTime
        });
        items.push(`
          <section class="campaign-infrastructure-card" data-infrastructure-state="${this.escapeHtml(infrastructure.damageState)}">
            <div class="campaign-infrastructure-card__heading">
              <strong>Installation condition</strong>
              <span>${this.escapeHtml(infrastructure.damageState.replace(/([A-Z])/g, " $1").toLowerCase())}</span>
            </div>
            <div class="campaign-infrastructure-meter" role="meter" aria-label="Installation operational capacity" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${capacityPercent}">
              <span style="width:${capacityPercent}%"></span>
            </div>
            <p>${infrastructure.integrity}/${infrastructure.maxIntegrity} integrity · ${capacityPercent}% operational capacity</p>
            <p>${this.escapeHtml(repairStatus)}</p>
            ${reorganizationNotice ? `<p>${this.escapeHtml(reorganizationNotice)}</p>` : ""}
            ${selectedInfrastructure.repairPoints > 0 ? `<p>${selectedInfrastructure.suppliesCost} supply · ${selectedInfrastructure.manpowerCost} personnel${infrastructure.activeRepairOrderId ? " committed" : ""} · ETA ${this.escapeHtml(this.campaignState.segmentToTimeDisplay(selectedInfrastructure.completeSegment))}${selectedInfrastructure.engineerFormationName ? ` · ${this.escapeHtml(selectedInfrastructure.engineerFormationName)}` : ""}</p>` : ""}
            ${repairDescriptor?.reason ? `<small><strong>Reconstruction unavailable.</strong> ${this.escapeHtml(repairDescriptor.reason)} ${this.escapeHtml(repairDescriptor.correctiveAction ?? "")}</small>` : ""}
            ${repairAction ? `<div class="campaign-context-actions">${repairAction}</div>` : ""}
          </section>
        `);
      }
    }
    if (this.selectedFrontKey) {
      const assessment = this.getPlayerFrontAssessment(this.selectedFrontKey);
      const targetOptions = assessment.targets.length > 1
        ? `<fieldset class="campaign-front-target-choice"><legend>Choose engagement target</legend><div class="campaign-front-target-choice__options">${assessment.targets.map((target) => `<button type="button" data-campaign-front-target-choice="${this.escapeHtml(target.targetHexKey)}" aria-label="${this.escapeHtml(`${target.approachLabel}, ${target.missionLabel}, ${this.getCampaignLocationDisplayLabel(target.targetHexKey)}, Grid ${target.targetHexKey}`)}" aria-pressed="${target.targetHexKey === this.selectedFrontTargetHexKey ? "true" : "false"}"><strong>${this.escapeHtml(target.approachLabel)}</strong><span>${this.escapeHtml(target.missionLabel)}</span><small>Grid ${this.escapeHtml(target.targetHexKey)}</small></button>`).join("")}</div></fieldset>`
        : "";
      const target = assessment.target;
      items.push(`
        <div class="campaign-front-assessment">
          <strong>Front assessment</strong>
          <p>${this.escapeHtml(assessment.pressureLabel)}</p>
          ${target ? `<p><strong>${this.escapeHtml(target.missionLabel)} — ${this.escapeHtml(this.getCampaignLocationDisplayLabel(target.targetHexKey))}</strong><br>${this.escapeHtml(target.roleLabel)} · Grid ${this.escapeHtml(target.targetHexKey)}</p>` : ""}
          ${target?.explicitUnknowns.length ? `<p>Unknowns: ${this.escapeHtml(target.explicitUnknowns.join(" · "))}</p>` : ""}
          ${targetOptions}
        </div>
      `);
    }
    const engagements = this.campaignState.getPendingEngagements();
    if (engagements.length > 0) {
      items.push(`<div><strong>Pending engagements</strong><br>${engagements.length} decision${engagements.length === 1 ? "" : "s"} awaiting command</div>`);
    }
    if (this.moveOriginHexKey) {
      const destinationReady = Boolean(this.selectedHexKey && this.selectedHexKey !== this.moveOriginHexKey);
      const originDisplayLabel = this.getCampaignLocationDisplayLabel(this.moveOriginHexKey);
      const destinationDisplayLabel = this.selectedHexKey ? this.getCampaignLocationDisplayLabel(this.selectedHexKey) : null;
      items.push(`
        <div class="campaign-redeploy-gesture" role="status">
          <strong>Redeployment origin</strong>
          <span>${this.escapeHtml(originDisplayLabel)} · hex ${this.escapeHtml(this.moveOriginHexKey)}</span>
          <p>${destinationReady ? `Destination selected: ${this.escapeHtml(destinationDisplayLabel ?? this.selectedHexKey ?? "")}. Review the route before opening the planner.` : "Select a destination hex. Selection will not move the formation."}</p>
          <div class="campaign-context-actions">
            ${destinationReady ? `<button type="button" data-confirm-campaign-redeploy>Plan redeployment here</button>` : ""}
            <button type="button" class="secondary" data-cancel-campaign-redeploy>Cancel planning</button>
          </div>
        </div>
      `);
    } else if (selectedIsFriendlyOccupied && selectedCanRedeploy) {
      const redeployDescriptor = this.campaignActionRegistry.resolve("redeploy", {
        selectionKind: "hex",
        selectionId: this.selectedHexKey
      });
      const redeployLabel = selectedRole === "airbase"
        ? "Rebase aircraft"
        : selectedRole === "logisticsHub" || selectedRole === "navalBase"
          ? "Move or embark formations"
          : "Redeploy formations";
      items.push(`
        <div class="campaign-context-actions">
          <button type="button" data-plan-campaign-redeploy data-reason-code="${redeployDescriptor.reasonCode ?? ""}" title="Choose a destination and review the movement plan.">${this.escapeHtml(redeployLabel)}</button>
        </div>
      `);
    }
    this.selectionContainer.innerHTML = items.join("") || "<div>No selection</div>";

    if (this.queueEngagementButton) {
      const activePackage = this.campaignState.getActiveCampaignBattlePackage();
      const selectedFront = this.selectedFrontKey
        ? view?.scenario.fronts.find((front) => front.key === this.selectedFrontKey) ?? null
        : null;
      const canPlayerLaunchFront = selectedFront
        ? this.getPlayerFrontAssessment(selectedFront.key, this.selectedFrontTargetHexKey).canLaunch
        : false;
      // The existing proximity launch path must be reachable from a ready field
      // formation as well as from the aggregate location. Posture remains domain-owned.
      const canLaunchProximity = !selectedFront && selectedIsFriendlyOccupied
        && selectedRole !== "taskForce" && selectedFormationCanReceiveOrders
        && Boolean(this.selectedHexKey && this.campaignState.findAdjacentEnemyHexKey(this.selectedHexKey));
      const canEngage = Boolean(activePackage) || Boolean(selectedFront && canPlayerLaunchFront) || canLaunchProximity;
      this.queueEngagementButton.disabled = !canEngage;
      this.queueEngagementButton.textContent = activePackage?.context.defender === "Player"
        ? "Respond to Enemy Offensive"
        : "Queue Tactical Engagement";
    }

    // Update edit mode UI if active
    if (this.editMode) {
      this.updateEditPanel();
    }
  }

  /** Wires the persistent campaign Intelligence drawer and map-safe operation workflow. */
  private bindCampaignIntelControls(): void {
    const toggle = this.element.querySelector<HTMLButtonElement>("#campaignIntelToggle");
    const openDrawer = () => {
      if (!this.intelDrawer) return;
      this.intelDrawer.classList.remove("hidden");
      toggle?.setAttribute("aria-expanded", "true");
      this.renderCampaignIntel();
    };
    toggle?.addEventListener("click", () => {
      if (!this.intelDrawer) return;
      if (this.intelDrawer.classList.contains("hidden")) openDrawer();
      else {
        this.intelDrawer.classList.add("hidden");
        toggle.setAttribute("aria-expanded", "false");
        this.renderer.clearAllHighlights("order-preview-target");
      }
    });
    document.addEventListener("campaign:intelligence:open", openDrawer);

    this.intelCoverageButton?.addEventListener("click", () => {
      this.intelCoverageVisible = !this.intelCoverageVisible;
      this.intelCoverageButton?.setAttribute("aria-pressed", this.intelCoverageVisible ? "true" : "false");
      this.intelCoverageButton?.classList.toggle("active", this.intelCoverageVisible);
      this.renderer.setIntelCoverageVisible(this.intelCoverageVisible);
    });

    this.intelDrawer?.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.closest("[data-intel-close]")) {
        this.intelDrawer?.classList.add("hidden");
        toggle?.setAttribute("aria-expanded", "false");
        this.renderer.clearAllHighlights("order-preview-target");
        toggle?.focus();
        return;
      }
      const tab = target.closest<HTMLButtonElement>("[data-intel-tab]")?.dataset.intelTab;
      const chooseContact = tab === "contacts" || Boolean(target.closest("[data-intel-select-contact]"));
      if ((tab === "situation" || chooseContact) && this.commandInterface) {
        this.intelDrawer?.classList.add("hidden");
        toggle?.setAttribute("aria-expanded", "false");
        this.renderer.clearAllHighlights("order-preview-target");
        this.commandInterface.showWorkspace("intelligence", true);
        if (chooseContact) {
          const heading = this.element.querySelector<HTMLElement>("#campaignIntelligenceContactsTitle");
          if (heading) {
            heading.tabIndex = -1;
            heading.scrollIntoView({ block: "nearest" });
            heading.focus({ preventScroll: true });
          }
        }
        return;
      }
      if (tab === "situation" || tab === "contacts" || tab === "operations") {
        this.intelTab = tab;
        this.renderCampaignIntel();
        return;
      }
      if (target.closest("[data-intel-mark-read]")) {
        this.campaignState.markIntelBriefsRead("Player");
        this.renderCampaignIntel();
        return;
      }
      const focusId = target.closest<HTMLButtonElement>("[data-intel-focus]")?.dataset.intelFocus;
      if (focusId) {
        if (this.focusCampaignContact(focusId)) {
          this.intelDrawer?.classList.add("hidden");
          toggle?.setAttribute("aria-expanded", "false");
        }
        return;
      }
      const verifyId = target.closest<HTMLButtonElement>("[data-intel-verify-contact]")?.dataset.intelVerifyContact;
      if (verifyId) {
        const contact = this.campaignState.getCampaignMapView("Player")?.enemyContacts.find((entry) => entry.id === verifyId);
        if (contact) {
          this.intelTab = "operations";
          this.intelOperationType = "verify";
          this.editingIntelOrderId = null;
          this.editingIntelAssetKey = null;
          this.intelTargetContactId = contact.id;
          this.selectedHexKey = contact.locationHexKey;
          this.intelFeedback = `Verification target set: ${contact.label} near ${this.getCampaignLocationDisplayLabel(contact.locationHexKey)} (Grid ${contact.locationHexKey}).`;
          this.focusCampaignContact(contact.id);
        }
        return;
      }
      const operationType = target.closest<HTMLButtonElement>("[data-intel-operation-type]")?.dataset.intelOperationType as CampaignIntelOperationType | undefined;
      if (operationType) {
        this.intelOperationType = operationType;
        if (operationType !== "verify") this.intelTargetContactId = null;
        this.editingIntelOrderId = null;
        this.editingIntelAssetKey = null;
        this.intelFeedback = "";
        this.renderCampaignIntel();
        return;
      }
      if (target.closest("[data-intel-schedule]")) {
        this.scheduleSelectedIntelOperation();
      }
    });
    this.intelDrawer?.addEventListener("change", (event) => {
      const select = (event.target as Element).closest<HTMLSelectElement>("#campaignIntelAsset");
      if (select) this.editingIntelAssetKey = select.value || null;
    });
  }

  /** Keeps every contact-entry path aligned on the same player-safe map and inspector result. */
  private focusCampaignContact(contactId: string): boolean {
    const contact = this.campaignState.getCampaignMapView("Player")?.enemyContacts
      .find((entry) => entry.id === contactId);
    if (!contact) return false;
    this.selectedHexKey = contact.locationHexKey;
    this.selectedFrontKey = null;
    this.selectedFrontTargetHexKey = null;
    this.moveOriginHexKey = null;
    this.renderer.clearAllHighlights("selected");
    this.renderer.clearAllHighlights("origin");
    this.renderer.highlightHex(contact.locationHexKey, "selected");
    const center = this.renderer.getHexCenter(contact.locationHexKey);
    if (center) this.viewport?.centerOn(center.cx, center.cy);
    this.renderSelection();
    this.commandInterface?.revealInspector({ kind: "contact", id: contact.id });
    this.renderCampaignIntel();
    return true;
  }

  /** Carries only the canonical, currently authorized contact identity into the operation composer. */
  private syncIntelTargetContact(view: CampaignMapViewModel | null): string | null {
    const selection = this.commandInterface?.getUIState().getSnapshot().selection;
    // Editing retains the draft's explicit target; a fresh plan uses the current
    // selection, never an arbitrary contact that happens to occupy the same hex.
    const contactId = this.editingIntelOrderId
      ? this.intelTargetContactId
      : selection?.kind === "contact" ? selection.id : null;
    const contact = view?.enemyContacts.find((entry) => entry.id === contactId);
    this.intelTargetContactId = this.intelOperationType === null || this.intelOperationType === "verify"
      ? contact?.id ?? null
      : null;
    if (this.intelOperationType === "verify" && contact && !this.editingIntelOrderId) {
      this.selectedHexKey = contact.locationHexKey;
    }
    return contact?.id ?? null;
  }

  private scheduleSelectedIntelOperation(): void {
    if (!this.intelOperationType) {
      this.intelFeedback = "Choose an intelligence operation first.";
      this.renderCampaignIntel();
      return;
    }
    this.syncIntelTargetContact(this.campaignState.getCampaignMapView("Player"));
    if (!this.selectedHexKey) {
      this.intelFeedback = "Select a campaign hex on the map before issuing this order.";
      this.renderCampaignIntel();
      return;
    }
    const assetSelect = this.intelDrawer?.querySelector<HTMLSelectElement>("#campaignIntelAsset");
    const result = this.campaignState.createIntelOperationDraft({
      type: this.intelOperationType,
      targetHexKey: this.selectedHexKey,
      assignedAssetKey: assetSelect?.value || undefined,
      targetContactId: this.intelTargetContactId ?? undefined,
      replaceOrderId: this.editingIntelOrderId ?? undefined,
      faction: "Player"
    });
    if (!result.ok) {
      this.intelFeedback = result.reason;
      this.renderCampaignIntel();
      return;
    }
    const rule = this.campaignState.getIntelOperationRules()[this.intelOperationType];
    const replaced = Boolean(this.editingIntelOrderId);
    if (result.order.validation.valid) {
      this.commandCommitFeedback = { feedback: `${rule.label} draft ${replaced ? "replaced" : "added"}; capacity, assets, and stocks are held without spending.`, feedbackTone: "success" };
      this.resetIntelComposer();
    } else {
      this.intelFeedback = result.order.validation.issues[0]?.message ?? `${rule.label} draft has a conflict.`;
    }
    this.renderCommandShell();
    this.renderCampaignIntel();
  }

  /** Returns the Intelligence workspace to a neutral, truthful state after an order mutation. */
  private resetIntelComposer(): void {
    this.intelOperationType = null;
    this.intelTargetContactId = null;
    this.editingIntelOrderId = null;
    this.editingIntelAssetKey = null;
    this.intelFeedback = "";
    this.renderer.clearAllHighlights("order-preview-target");
  }

  /** Renders compact readiness plus the Situation / Contacts / Operations drawer. */
  private renderCampaignIntel(): void {
    const view = this.campaignState.getCampaignMapView("Player");
    const operations = this.campaignState.getIntelOperations("Player");
    if (!view) {
      if (this.intelSummary) this.intelSummary.textContent = "Intelligence unavailable";
      return;
    }
    const heldCapacity = this.campaignState.getCampaignDraftReservations("Player").intelligenceCapacity;
    const draftAwareCapacity = Math.max(0, view.capacity.available - heldCapacity);
    if (this.intelSummary) {
      this.intelSummary.innerHTML = `
        <span><strong>${draftAwareCapacity}/${view.capacity.total}</strong> capacity free${heldCapacity > 0 ? ` · ${heldCapacity} held` : ""}</span>
        <span><strong>${view.enemyContacts.length}</strong> active contact${view.enemyContacts.length === 1 ? "" : "s"}</span>
      `;
    }
    if (this.intelUnreadBadge) {
      this.intelUnreadBadge.textContent = String(view.unreadReportCount);
      this.intelUnreadBadge.classList.toggle("hidden", view.unreadReportCount === 0);
    }
    if (!this.intelDrawer || this.intelDrawer.classList.contains("hidden")) return;

    const tabButtons = Array.from(this.intelDrawer.querySelectorAll<HTMLButtonElement>("[data-intel-tab]"));
    tabButtons.forEach((button) => {
      const active = button.dataset.intelTab === this.intelTab;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    const body = this.intelDrawer.querySelector<HTMLElement>("#campaignIntelBody");
    if (!body) return;
    body.innerHTML = this.intelTab === "situation"
      ? this.composeIntelSituationMarkup(view)
      : this.intelTab === "contacts"
        ? this.composeIntelContactsMarkup(view)
        : this.composeIntelOperationsMarkup(view, operations);
    const composer = body.querySelector<HTMLElement>(".campaign-intel-composer");
    if (composer && this.intelOperationType) {
      if (this.selectedHexKey) this.renderer.highlightHex(this.selectedHexKey, "order-preview-target");
    } else {
      this.renderer.clearAllHighlights("order-preview-target");
    }
  }

  private composeIntelSituationMarkup(view: CampaignMapViewModel): string {
    const events = this.campaignState.getIntelBriefEvents("Player").filter((event) => !event.read);
    const eventMarkup = events.length === 0
      ? `<div class="campaign-intel-empty">No new intelligence has reached headquarters.</div>`
      : events.map((event) => `
          <article class="campaign-intel-report${event.read ? "" : " unread"}" data-report-kind="${event.kind}">
            <div class="campaign-intel-report__time">${this.escapeHtml(this.campaignState.segmentToTimeDisplay(event.segment))}</div>
            <strong>${this.escapeHtml(event.title)}</strong>
            <p>${this.escapeHtml(event.detail)}</p>
            ${event.contactId ? `<button type="button" data-intel-focus="${this.escapeHtml(event.contactId)}">Focus map</button>` : ""}
          </article>
        `).join("");
    const stale = view.enemyContacts.filter((contact) => contact.state === "stale" || contact.state === "disputed").length;
    const heldCapacity = this.campaignState.getCampaignDraftReservations("Player").intelligenceCapacity;
    const draftAwareCapacity = Math.max(0, view.capacity.available - heldCapacity);
    return `
      <div class="campaign-intel-situation-grid">
        <article><span>Operational picture</span><strong>${view.enemyContacts.length} contacts</strong><small>${stale} stale or disputed</small></article>
        <article><span>Collection capacity</span><strong>${draftAwareCapacity}/${view.capacity.total}</strong><small>${view.capacity.committed} committed · ${heldCapacity} held</small></article>
        <article><span>Unread reports</span><strong>${view.unreadReportCount}</strong><small>since last briefing</small></article>
      </div>
      <div class="campaign-intel-section-heading"><h4>Briefing changes</h4>${view.unreadReportCount > 0 ? '<button type="button" data-intel-mark-read>Mark read</button>' : ''}</div>
      <div class="campaign-intel-report-list">${eventMarkup}</div>
    `;
  }

  private composeIntelContactsMarkup(view: CampaignMapViewModel): string {
    if (view.enemyContacts.length === 0) {
      return `<div class="campaign-intel-empty"><strong>No current enemy contacts.</strong><p>Assign reconnaissance to a front or suspected approach. Absence of a marker is not proof the area is clear.</p></div>`;
    }
    return `<div class="campaign-intel-contact-list">${view.enemyContacts.map((contact) => `
      <article class="campaign-intel-contact-card" data-level="${contact.level}" data-state="${contact.state}">
        <header>
          <div><strong>${this.escapeHtml(contact.label)}</strong><span class="campaign-intel-eyebrow">${contact.strengthBand ?? "Unknown"} strength · ${contact.confidenceBand} confidence</span></div>
          <span class="campaign-intel-age">${contact.ageSegments === 0 ? "Current" : `${contact.ageSegments * CAMPAIGN_SEGMENT_HOURS}h old`}</span>
        </header>
        <p>${this.escapeHtml(contact.locationHexKey)}${contact.uncertaintyRadius > 0 ? ` ±${contact.uncertaintyRadius} hex` : ""} · ${contact.movementState ?? contact.state} · ${this.escapeHtml(contact.sourceLabels.join(", ") || "Source unconfirmed")}</p>
        <footer>
          <button type="button" data-intel-focus="${this.escapeHtml(contact.id)}">Focus map</button>
          <button type="button" data-intel-verify-contact="${this.escapeHtml(contact.id)}">Verify</button>
        </footer>
      </article>
    `).join("")}</div>`;
  }

  private composeIntelOperationsMarkup(view: CampaignMapViewModel, operations: CampaignIntelOperationView[]): string {
    const verificationContactId = this.syncIntelTargetContact(view);
    const rules = this.campaignState.getIntelOperationRules();
    const operationButtons = (Object.keys(rules) as CampaignIntelOperationType[]).map((type) => {
      const descriptor = this.campaignActionRegistry.resolve(getCampaignIntelligenceActionId(type), {
        selectionKind: type === "verify" && verificationContactId ? "contact" : this.selectedHexKey ? "hex" : "none",
        selectionId: this.selectedHexKey,
        targetContactId: type === "verify" ? verificationContactId : null,
        excludeOrderId: type === this.intelOperationType ? this.editingIntelOrderId : null
      });
      return `
        <button type="button" class="campaign-intel-operation-choice${type === this.intelOperationType ? " active" : ""}" data-intel-operation-type="${type}" data-action-availability="${descriptor.availability}" data-reason-code="${descriptor.reasonCode ?? ""}" title="${this.escapeHtml(descriptor.availability === "available" ? rules[type].description : `${descriptor.reason ?? "Operation unavailable."} ${descriptor.correctiveAction ?? ""}`.trim())}">
          <strong>${this.escapeHtml(rules[type].shortLabel)}</strong><span>${rules[type].capacityCost} capacity · ${rules[type].durationSegments * CAMPAIGN_SEGMENT_HOURS}h</span>
        </button>`;
    }).join("");
    const active = operations
      .filter((operation) => operation.status === "planned" || operation.status === "active")
      .map((operation) => `
        <article class="campaign-intel-active-op">
          <strong>${this.escapeHtml(rules[operation.type].label)}</strong>
          <span>${this.escapeHtml(this.getCampaignLocationDisplayLabel(operation.targetHexKey))} · resolves ${this.escapeHtml(this.campaignState.segmentToTimeDisplay(operation.resolveSegment))}</span><small class="campaign-location-grid">Grid ${this.escapeHtml(operation.targetHexKey)}</small>
        </article>
      `).join("");
    const recentlyComplete = operations
      .filter((operation) => operation.status !== "planned" && operation.status !== "active" && operation.publicOutcome)
      .slice(-5)
      .reverse()
      .map((operation) => `<article class="campaign-intel-outcome"><strong>${this.escapeHtml(operation.publicOutcome!.summary)}</strong><p>${this.escapeHtml(operation.publicOutcome!.detail)}</p></article>`)
      .join("");
    const heldCapacity = this.campaignState.getCampaignDraftReservations("Player").intelligenceCapacity;
    const draftAwareCapacity = Math.max(0, view.capacity.available - heldCapacity);
    const operationHistory = `${active ? `<div class="campaign-intel-section-heading"><h4>Active operations</h4></div>${active}` : ""}
      ${recentlyComplete ? `<div class="campaign-intel-section-heading"><h4>Recent outcomes</h4></div>${recentlyComplete}` : ""}`;
    if (!this.intelOperationType) {
      return `
        <div class="campaign-intel-capacity"><span>Capacity</span><strong>${draftAwareCapacity}/${view.capacity.total} free</strong><small>${view.capacity.committed} committed · ${heldCapacity} held</small></div>
        <div class="campaign-intel-operation-grid">${operationButtons}</div>
        <div class="campaign-intel-empty"><strong>Choose an operation</strong><p>Review its target, asset, timing, and cost before adding a draft.</p></div>
        ${operationHistory}
      `;
    }
    const rule = rules[this.intelOperationType];
    const initialPreview = this.campaignState.previewIntelOperationDraft({
      type: this.intelOperationType,
      targetHexKey: this.selectedHexKey ?? undefined,
      targetContactId: this.intelTargetContactId ?? undefined,
      excludeOrderId: this.editingIntelOrderId ?? undefined,
      faction: "Player"
    });
    const assets = initialPreview.eligibleAssets;
    const selectedAssetKey = this.editingIntelAssetKey && assets.some((asset) => asset.assetKey === this.editingIntelAssetKey)
      ? this.editingIntelAssetKey
      : assets[0]?.assetKey ?? null;
    const selectedPreview = this.campaignState.previewIntelOperationDraft({
      type: this.intelOperationType,
      targetHexKey: this.selectedHexKey ?? undefined,
      targetContactId: this.intelTargetContactId ?? undefined,
      assignedAssetKey: selectedAssetKey ?? undefined,
      excludeOrderId: this.editingIntelOrderId ?? undefined,
      faction: "Player"
    });
    const selectedAction = this.campaignActionRegistry.resolve(getCampaignIntelligenceActionId(this.intelOperationType), {
      selectionKind: this.intelTargetContactId ? "contact" : this.selectedHexKey ? "hex" : "none",
      selectionId: this.selectedHexKey,
      targetContactId: this.intelTargetContactId,
      assignedAssetKey: selectedAssetKey,
      excludeOrderId: this.editingIntelOrderId
    });
    const requiresAsset = rule.requiresAsset !== "none";
    const hasTarget = Boolean(this.selectedHexKey);
    const needsContact = this.intelOperationType === "verify" && !this.intelTargetContactId;
    const correctiveAction = needsContact
      ? "In Intelligence, inspect a reported contact, then choose Plan collection operation and Verify."
      : selectedAction.correctiveAction ?? "Review the target and assigned asset.";
    return `
      <div class="campaign-intel-capacity"><span>Capacity</span><strong>${draftAwareCapacity}/${view.capacity.total} free</strong><small>${view.capacity.committed} committed · ${heldCapacity} held</small></div>
      <div class="campaign-intel-operation-grid">${operationButtons}</div>
      <section class="campaign-intel-composer">
        <span class="campaign-intel-eyebrow">Order preview</span>
        <h4>${this.escapeHtml(rule.label)}</h4>
        <p>${this.escapeHtml(rule.description)}</p>
        <div class="campaign-intel-costs">
          <span>${rule.capacityCost} of ${selectedPreview.capacityAvailable} free capacity</span><span>${rule.durationSegments * CAMPAIGN_SEGMENT_HOURS} hours</span><span>${rule.suppliesCost} of ${selectedPreview.suppliesAvailable} supply</span><span>${rule.fuelCost} of ${selectedPreview.fuelAvailable} fuel</span>${requiresAsset && rule.assetRangeHex !== undefined ? `<span>${rule.assetRangeHex} hex range</span>` : ""}
        </div>
        <div>Target <strong>${this.escapeHtml(this.selectedHexKey ? this.getCampaignLocationDisplayLabel(this.selectedHexKey) : "Select a location on the map")}</strong>${this.selectedHexKey ? `<small class="campaign-location-grid">Grid ${this.escapeHtml(this.selectedHexKey)}</small>` : ""}</div>
        ${requiresAsset && hasTarget ? `
          <label for="campaignIntelAsset">Assigned asset</label>
          <select id="campaignIntelAsset" ${assets.length === 0 ? "disabled" : ""}>
            ${assets.length === 0 ? `<option value="">No eligible asset</option>` : assets.map((asset) => `<option value="${this.escapeHtml(asset.assetKey)}" ${asset.assetKey === selectedAssetKey ? "selected" : ""}>${this.escapeHtml(asset.label)}</option>`).join("")}
          </select>
        ` : !requiresAsset ? `<p class="campaign-intel-doctrine">This operation uses headquarters deception capacity and does not require a formation assignment.</p>` : ""}
        ${hasTarget
          ? `<p class="campaign-intel-order-summary">${selectedPreview.resolveSegment === null ? "Timing unavailable" : `Starts next segment · resolves ${this.escapeHtml(this.campaignState.segmentToTimeDisplay(selectedPreview.resolveSegment))}`} · reserves ${rule.capacityCost} capacity, ${rule.suppliesCost} supply, and ${rule.fuelCost} fuel.</p>`
          : `<p class="campaign-intel-order-summary">Select a map hex to see eligible assets and complete this draft.</p>`}
        ${(!hasTarget && !needsContact) || selectedAction.availability === "available"
          ? ""
          : `<div class="redeploy-issue" data-reason-code="${selectedAction.reasonCode ?? "ORDER_OPERATION_INVALID"}"><strong>Operation unavailable</strong><span>${this.escapeHtml(selectedAction.reason ?? "The operation is unavailable.")}</span><small>${this.escapeHtml(correctiveAction)}</small>${needsContact ? '<button type="button" data-intel-select-contact>Choose reported contact</button>' : ""}</div>`}
        ${this.intelFeedback ? `<div class="campaign-intel-feedback" aria-live="polite">${this.escapeHtml(this.intelFeedback)}</div>` : ""}
        <button type="button" class="campaign-intel-confirm" data-intel-schedule ${selectedAction.availability !== "available" ? "disabled" : ""}>${this.editingIntelOrderId ? "Replace draft" : "Add draft"}</button>
      </section>
      ${operationHistory}
    `;
  }

  /** Opens the owning composer with a draft's authoritative payload preselected. */
  private editDraftOrder(orderId: string): void {
    const order = this.campaignState.getCampaignOrders().find((entry) => entry.id === orderId && entry.faction === "Player");
    // Recovery quotes are immutable; remove the draft and request a fresh State quote to change it.
    if (order?.kind === "formationRecovery") return;
    if (!order || order.status !== "draft") {
      this.setCampaignStatusMessage({
        title: "Draft not editable.",
        detail: "The selected order is no longer an active draft.",
        action: "Inspect its current lifecycle state in the order tray.",
        tone: "warning"
      });
      return;
    }
    const fallbackInvoker = Array.from(this.element.querySelectorAll<HTMLElement>("[data-order-id]"))
      .find((entry) => entry.dataset.orderId === orderId) ?? null;
    this.campaignPopupInvoker = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : fallbackInvoker;
    if (order.kind === "redeploy") {
      this.openRedeployModal(order.payload.originOffsetKey, order.payload.destinationOffsetKey, order);
      return;
    }
    if (order.kind === "production") {
      this.openProductionModal(order);
      return;
    }
    if (order.kind === "infrastructureRepair") {
      this.setCampaignStatusMessage({
        title: "Reconstruction has no editable field.",
        detail: "Its target, supervising formation, cost, and timing are fixed by current facility conditions.",
        action: "Remove the draft and create a fresh reconstruction plan if conditions changed.",
        tone: "info"
      });
      return;
    }
    this.editingIntelOrderId = order.id;
    this.editingIntelAssetKey = order.payload.assignedAssetKey;
    this.intelOperationType = order.payload.operationType;
    this.intelTargetContactId = order.payload.targetContactId;
    this.selectedHexKey = order.payload.targetHexKey;
    this.intelTab = "operations";
    this.intelFeedback = "Editing this draft. Replace draft preserves the original if current validation fails.";
    this.renderer.clearAllHighlights("selected");
    this.renderer.highlightHex(order.payload.targetHexKey, "selected");
    document.dispatchEvent(new CustomEvent("campaign:intelligence:open"));
    this.renderSelection();
    this.renderCampaignIntel();
  }

  /** Changes draft priority and reports the resulting reservation revalidation. */
  private moveDraftOrder(orderId: string, direction: "earlier" | "later"): void {
    const result = this.campaignState.moveCampaignOrder(orderId, direction);
    const moved = this.campaignState.getCampaignOrders().find((order) => order.id === orderId);
    this.commandCommitFeedback = result.ok
      ? {
        feedback: moved?.validation.valid
          ? `Draft moved ${direction}; all affected holds were revalidated and this draft is ready.`
          : `Draft moved ${direction}; ${moved?.validation.issues[0]?.message ?? "a reservation conflict remains."}`,
        feedbackTone: moved?.validation.valid ? "success" : "warning"
      }
      : { feedback: result.reason ?? `The draft cannot move ${direction}.`, feedbackTone: "warning" };
    this.setCampaignStatusMessage(result.ok ? {
      title: `Draft moved ${direction}.`,
      detail: moved?.validation.issues[0]?.message ?? "Planning priority and shared holds were revalidated.",
      action: moved?.validation.valid ? "Review the updated tray or commit the valid draft set." : "Use the reason code and corrective action shown on the conflicted draft.",
      tone: moved?.validation.valid ? "success" : "warning"
    } : {
      title: "Draft priority unchanged.",
      detail: result.reason ?? `The draft cannot move ${direction}.`,
      action: "Review the other active drafts in the tray.",
      tone: "warning"
    });
    this.renderCommandShell();
  }

  /** Opens an in-game consequence review before applying a committed-order cancellation. */
  private openOrderCancellationPreview(orderId: string): void {
    const layer = document.getElementById("battlePopupLayer");
    const dialog = layer?.querySelector<HTMLElement>(".battle-popup");
    const title = dialog?.querySelector<HTMLElement>("[data-popup-title]");
    const body = dialog?.querySelector<HTMLElement>("[data-popup-body]");
    const close = dialog?.querySelector<HTMLButtonElement>("#battlePopupClose");
    const order = this.campaignState.getCampaignOrders().find((entry) => entry.id === orderId && entry.faction === "Player");
    const preview = this.campaignState.previewCampaignOrderCancellation(orderId, "Player");
    if (!layer || !dialog || !title || !body || !close || !order) return;
    const fallbackOrder = Array.from(this.element.querySelectorAll<HTMLElement>("[data-order-id]"))
      .find((entry) => entry.dataset.orderId === orderId) ?? null;
    const fallbackInvoker = fallbackOrder?.querySelector<HTMLButtonElement>("[data-order-action='cancel']")
      ?? fallbackOrder;
    this.campaignPopupInvoker = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : fallbackInvoker;
    const playerOrders = this.campaignState.getCampaignOrders().filter((entry) => entry.faction === "Player");
    const projected = this.projectCommandOrderForReview(order, playerOrders);
    title.textContent = "Review Order Cancellation";
    body.innerHTML = `
      <section class="campaign-order-cancellation" data-cancellation-available="${preview.canCancel}">
        <header><span>Committed order</span><h3>${this.escapeHtml(projected.label)}</h3><p>${this.escapeHtml(projected.detail)}</p></header>
        <dl class="campaign-order-preview-contract">
          <div><dt>Released holds</dt><dd>${preview.releasedReservations.length > 0 ? preview.releasedReservations.map((reservation) => this.escapeHtml(formatCampaignReservationLabel(reservation))).join(" · ") : "None"}</dd></div>
          <div><dt>Sunk cost</dt><dd>${this.escapeHtml(preview.sunkCostSummary)}</dd></div>
          <div><dt>Operational delay</dt><dd>${this.escapeHtml(preview.delaySummary)}</dd></div>
          <div><dt>Exposure</dt><dd>${this.escapeHtml(preview.exposureSummary)}</dd></div>
        </dl>
        <div class="${preview.canCancel ? "campaign-order-preview-clear" : "redeploy-issue"}" data-reason-code="${preview.reasonCode ?? ""}">
          <strong>${preview.canCancel ? "Cancellation available" : "Cancellation unavailable"}</strong>
          <span>${this.escapeHtml(preview.reason ?? "The order can be cancelled before execution.")}</span>
          <small>${this.escapeHtml(preview.correctiveAction ?? "Confirm only if the consequences are acceptable.")}</small>
        </div>
        <div class="button-row redeploy-actions">
          <button type="button" class="primary-button" id="campaignConfirmOrderCancellation" ${preview.canCancel ? "" : "disabled"}>Confirm cancellation</button>
          <button type="button" class="secondary-button" id="campaignKeepOrder">Keep order</button>
        </div>
      </section>
    `;
    const confirm = body.querySelector<HTMLButtonElement>("#campaignConfirmOrderCancellation");
    const keep = body.querySelector<HTMLButtonElement>("#campaignKeepOrder");
    if (!confirm || !keep) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      hide();
    };
    const hide = (): void => {
      layer.removeEventListener("keydown", onKeyDown);
      layer.classList.add("hidden");
      layer.setAttribute("aria-hidden", "true");
      this.campaignPopupInvoker?.focus({ preventScroll: true });
    };
    confirm.onclick = () => {
      hide();
      this.cancelCommittedOrder(orderId);
    };
    keep.onclick = hide;
    close.onclick = hide;
    layer.addEventListener("keydown", onKeyDown);
    layer.classList.remove("hidden");
    layer.setAttribute("aria-hidden", "false");
    (preview.canCancel ? confirm : keep).focus({ preventScroll: true });
  }

  /** Issues every valid draft through one state transaction. */
  private commitDraftOrders(): void {
    if (this.commandCommitBusy) return;
    const includesIntelDraft = this.campaignState.getCampaignOrders().some((order) => order.faction === "Player"
      && order.status === "draft"
      && (order.kind === "reconnaissance" || order.kind === "counterIntelligence"));
    this.commandCommitBusy = true;
    this.commandCommitFeedback = { feedback: "Validating every draft and shared hold before atomic commit…", feedbackTone: "info" };
    this.renderCommandShell();
    const result = this.campaignState.commitCampaignOrders();
    this.commandCommitBusy = false;
    this.commandCommitFeedback = result.ok
      ? {
        feedback: `${result.committedCount} order${result.committedCount === 1 ? "" : "s"} committed together. Advance remains a separate command.`,
        feedbackTone: "success"
      }
      : {
        feedback: `Commit rejected. No order, resource, or hold changed; every draft was preserved.${result.blockers.length > 0 ? ` ${result.blockers.length} blocker${result.blockers.length === 1 ? "" : "s"} remain.` : ""}`,
        feedbackTone: "warning"
      };
    if (result.ok && includesIntelDraft) this.resetIntelComposer();
    this.setCampaignStatusMessage(result.ok ? {
      title: `${result.committedCount} order${result.committedCount === 1 ? "" : "s"} committed.`,
      detail: "Resources and capacity were assigned together in one command transaction.",
      action: "Advance three hours when you are ready to execute the next campaign segment.",
      tone: "success"
    } : {
      title: "Orders not committed.",
      detail: `${result.reason} No order or resource changed; all drafts were preserved.`,
      action: result.blockers[0]
        ? explainCampaignOrderValidationIssue({ ...result.blockers[0] }).correctiveAction
        : "Resolve the conflict shown in the order tray, then try again.",
      tone: "warning"
    });
    this.renderCommandShell();
    if (result.ok && includesIntelDraft) this.renderCampaignIntel();
  }

  private removeDraftOrder(orderId: string): void {
    const removedIntelDraft = this.campaignState.getCampaignOrders().some((order) => order.id === orderId
      && order.faction === "Player"
      && order.status === "draft"
      && (order.kind === "reconnaissance" || order.kind === "counterIntelligence"));
    const result = this.campaignState.removeCampaignOrder(orderId);
    this.commandCommitFeedback = result.ok
      ? { feedback: "Draft removed; its holds were released and every later draft was revalidated.", feedbackTone: "success" }
      : { feedback: result.reason ?? "The draft is no longer editable.", feedbackTone: "warning" };
    this.setCampaignStatusMessage(result.ok ? {
      title: "Draft removed.",
      detail: "Its resource and capacity holds were released; later drafts were revalidated.",
      action: "Continue planning or commit the remaining valid drafts.",
      tone: "info"
    } : {
      title: "Draft not removed.",
      detail: result.reason ?? "The draft is no longer editable.",
      action: "Review its current status in the order tray.",
      tone: "warning"
    });
    if (result.ok && removedIntelDraft) this.resetIntelComposer();
    this.renderCommandShell();
    if (result.ok && removedIntelDraft) this.renderCampaignIntel();
  }

  private cancelCommittedOrder(orderId: string): void {
    const preview = this.campaignState.previewCampaignOrderCancellation(orderId, "Player");
    const result = this.campaignState.cancelCampaignOrder(orderId);
    this.commandCommitFeedback = result.ok
      ? { feedback: `${preview.releasedReservations.length} committed hold${preview.releasedReservations.length === 1 ? "" : "s"} released after reviewed cancellation.`, feedbackTone: "success" }
      : { feedback: result.reason ?? "The order is no longer cancellable.", feedbackTone: "warning" };
    this.setCampaignStatusMessage(result.ok ? {
      title: "Order cancelled.",
      detail: `${preview.sunkCostSummary} ${preview.releasedReservations.length} committed reservation${preview.releasedReservations.length === 1 ? "" : "s"} restored.`,
      action: "Issue a replacement draft if command intent has changed.",
      tone: "success"
    } : {
      title: "Order not cancelled.",
      detail: result.reason ?? "The order is no longer cancellable.",
      action: "Allow the executing order to resolve or issue a follow-on order.",
      tone: "warning"
    });
    this.renderCommandShell();
  }

  private campaignAdvanceStopLabel(reason: CampaignAdvanceStopReason): string {
    const labels: Readonly<Record<CampaignAdvanceStopReason, string>> = {
      segmentComplete: "three-hour resolution complete",
      nextReport: "next report received",
      dawn: "dawn reached",
      dusk: "dusk reached",
      dayComplete: "one day complete",
      pauseAfterResolution: "pause-after-resolution preference",
      engagement: "tactical engagement requires command",
      objectiveChanged: "primary objective changed",
      blockedOrder: "an order requires a decision",
      formationAtRisk: "a formation is at risk",
      campaignEnded: "campaign ended",
      criticalAlert: "critical alert",
      resolutionFailed: "segment resolution failed",
      safetyLimit: "next-report safety limit reached"
    };
    return labels[reason];
  }

  /** Executes the selected bounded advance command and reports its exact safe stop boundary. */
  private advanceCampaignTime(mode: CampaignCommandAdvanceMode): void {
    this.campaignAdvanceMode = mode;
    const result = this.campaignState.advanceCampaign({
      mode,
      pauseAfterEveryResolution: this.pauseAfterEveryCampaignResolution,
      stopOnCriticalAlerts: true
    });
    if (result.ok) {
      const hours = result.report.elapsedSegments * CAMPAIGN_SEGMENT_HOURS;
      const highestAlert = [...result.report.alerts]
        .reverse()
        .find((alert) => alert.severity !== "routine");
      const stopLabel = this.campaignAdvanceStopLabel(result.report.stopReason);
      this.setCampaignStatusMessage({
        title: `Campaign advanced ${hours} hour${hours === 1 ? "" : "s"}.`,
        detail: `${this.campaignState.segmentToTimeDisplay(result.report.toSegment)} · Stopped because ${stopLabel}.${highestAlert ? ` ${highestAlert.title}: ${highestAlert.detail}` : ""}`,
        action: result.report.stopReason === "segmentComplete" || result.report.stopReason === "dawn"
          || result.report.stopReason === "dusk" || result.report.stopReason === "dayComplete"
          ? "Review the resolution timeline or continue with the next command."
          : "Review the highlighted report and issue any required follow-on orders before advancing.",
        tone: result.report.alerts.some((alert) => alert.requiresStop) ? "warning" : "success"
      });
      this.renderCommandShell();
      if (result.report.stopReason === "engagement"
        && this.campaignState.getActiveCampaignBattlePackage()?.context.defender === "Player") {
        this.onQueueEngagement?.();
      }
      return;
    }

    const partial = "report" in result ? result.report.elapsedSegments : 0;
    this.setCampaignStatusMessage({
      title: partial > 0 ? "Campaign advance stopped safely." : "Campaign time did not advance.",
      detail: partial > 0
        ? `${partial * CAMPAIGN_SEGMENT_HOURS} hours committed before the next segment was rejected. ${result.error.message}`
        : result.error.message,
      action: `The last valid segment boundary was retained. Diagnostic: ${result.error.code}.`,
      tone: "warning"
    });
    this.renderCommandShell();
  }

  /** Collects the authorized source facts for one order without projecting copy or action policy. */
  private projectCommandOperationSource(order: CampaignOrder): CampaignOperationsOrderSource {
    const execution = order.kind === "redeploy" && order.executionRefId
      ? this.campaignState.getQueuedDecisions().find((decision) => decision.id === order.executionRefId
        && decision.type === "redeploy" && decision.faction === order.faction)
      : undefined;
    const formation = order.kind === "formationRecovery"
      ? this.campaignState.getCampaignFormationSnapshot(order.payload.formationId)
      : null;
    const intelRule = order.kind === "reconnaissance" || order.kind === "counterIntelligence"
      ? this.campaignState.getIntelOperationRules()[order.payload.operationType]
      : null;
    return {
      order,
      reservations: this.campaignState.getCampaignOrderReservations(order.id, "Player"),
      cancellation: this.campaignState.previewCampaignOrderCancellation(order.id, "Player"),
      formationName: formation ? resolveCampaignFormationRecordPresentation(formation).formationName : null,
      intelRule: intelRule ? { label: intelRule.label, targetRadius: intelRule.targetRadius } : null,
      intelAssetLabel: (order.kind === "reconnaissance" || order.kind === "counterIntelligence")
        && order.payload.assignedAssetKey
        ? this.campaignState.getIntelAssetDisplayLabel(order.payload.operationType, order.payload.assignedAssetKey, "Player")
        : null,
      redeployExecution: execution ? {
        status: typeof execution.payload.status === "string" ? execution.payload.status : "unknown",
        arrivedSegment: typeof execution.payload.arrivedSegment === "number" ? execution.payload.arrivedSegment : null
      } : null
    };
  }

  /** Reuses the Operations projector for a single consequence review without reading commit preflight. */
  private projectCommandOrderForReview(order: CampaignOrder, playerOrders: readonly CampaignOrder[]) {
    return projectCampaignOperationOrder(
      this.projectCommandOperationSource(order),
      playerOrders.filter((entry) => entry.status === "draft").map((entry) => entry.id),
      {
        formatSegment: (segment) => this.campaignState.segmentToTimeDisplay(segment),
        formatLabel: (value) => this.formatCampaignLabel(value),
        resolveLocationLabel: (hexKey) => this.getCampaignLocationDisplayLabel(hexKey)
      }
    );
  }

  /** Reads Player-owned order snapshots once, then delegates all Operations copy and eligibility rules. */
  private projectCommandOperations(playerOrders: readonly CampaignOrder[]): CampaignOperationsWorkspaceProjection {
    return projectCampaignOperationsWorkspace({
      orders: playerOrders.map((order) => this.projectCommandOperationSource(order)),
      commitPreview: this.campaignState.getCampaignOrderCommitPreview(),
      commitBusy: this.commandCommitBusy,
      commitFeedback: this.commandCommitFeedback,
      formatSegment: (segment) => this.campaignState.segmentToTimeDisplay(segment),
      formatLabel: (value) => this.formatCampaignLabel(value),
      resolveLocationLabel: (hexKey) => this.getCampaignLocationDisplayLabel(hexKey)
    });
  }

  /** Names historical battles from their bound package, independently of the current front topology. */
  private getCampaignBattleLocationPresentation(
    engagementId: string,
    offsetHexKey: string,
    view: CampaignMapViewModel,
    historical: CampaignHistoricalLocationContext
  ): CampaignLocationPresentation {
    const { runtime, definition } = historical;
    const ledger = runtime?.engagementLedger[engagementId];
    const pkg = ledger?.package;
    const report = ledger?.afterActionReport;
    const audit = ledger?.controlReport;
    if (!runtime || !definition || !pkg || !report || !audit
      || view.observerFaction !== "Player" || report.viewerFaction !== "Player"
      || definition.key !== runtime.scenarioKey || view.scenario.key !== runtime.scenarioKey
      || [pkg, report, audit].some((record) => record.campaignId !== runtime.campaignId
        || record.scenarioKey !== runtime.scenarioKey || record.engagementId !== engagementId)
      || report.controlIntegrityHash !== audit.integrityHash || report.battleHexKey !== audit.battleHexKey
      || projectRuntimeHexKeyToCampaignOffset(report.battleHexKey) !== offsetHexKey
      || pkg.context.battleHexKey !== offsetHexKey) {
      return resolveCampaignMapLocationPresentation(null, offsetHexKey);
    }
    const matches = (front: CampaignScenarioDefinition["map"]["initialFronts"][number]): boolean =>
      front.hexKeys.includes(offsetHexKey) || Boolean(front.edges?.some((edge) =>
        edge.friendlyHexKey === offsetHexKey || edge.opposingHexKey === offsetHexKey));
    const authored = definition.map.initialFronts.filter(matches);
    const frozen = audit.frontsBefore.filter(matches);
    const choose = (fronts: typeof authored): typeof authored[number] | undefined =>
      fronts.find((front) => front.key === pkg.context.frontKey) ?? (fronts.length === 1 ? fronts[0] : undefined);
    // Authored sector geometry survives earlier front rebuilds. Only an uncovered
    // location may use the battle's frozen audit; ambiguity cannot select a nearby sector.
    const front = authored.length > 0 ? choose(authored) : choose(frozen);
    return resolveCampaignMapLocationPresentation({ ...view, scenario: { ...view.scenario,
      fronts: front ? [{ ...front, hexKeys: [...front.hexKeys],
        edges: front.edges?.map((edge) => ({ ...edge })),
        modifiers: front.modifiers ? [...front.modifiers] : undefined }] : []
    } }, offsetHexKey);
  }

  /** Presents structured movement/battle history without parsing or changing append-only prose. */
  private projectFormationHistorySummary(
    history: CampaignFormationHistoryEntry | undefined,
    view: CampaignMapViewModel,
    formation: CampaignFormationRecord,
    historical: CampaignHistoricalLocationContext
  ): string | null {
    if (!history) return null;
    const prior = formation.battleHistory[formation.battleHistory.length - 2];
    const battle = history.type === "battle" ? history
      : history.type === "statusChanged" && prior?.type === "battle" && prior.segment === history.segment ? prior : null;
    if (battle?.engagementId) {
      const ledger = historical.runtime?.engagementLedger[battle.engagementId];
      const report = ledger?.afterActionReport;
      const pkg = ledger?.package;
      const delta = report?.friendlyFormations.find((entry) => entry.formationId === formation.id);
      if (pkg && report && delta && report.segment === battle.segment
        && pkg.formationCommitments.some((entry) => entry.formationId === formation.id)) {
        const location = this.getCampaignBattleLocationPresentation(battle.engagementId, pkg.context.battleHexKey, view, historical);
        return `${MISSION_TYPE_LABELS[pkg.context.missionType]} at ${location.primaryLabel} (${location.secondaryGridReference}); ${delta.personnelLost} personnel lost, readiness ${Math.round(delta.readinessBefore)} to ${Math.round(delta.readinessAfter)}.`;
      }
      return "Battle history recorded; open the after-action archive to review the engagement.";
    }
    if (history.type !== "moved") return history.summary;
    const originKey = projectRuntimeHexKeyToCampaignOffset(history.fromHexKey);
    const destinationKey = projectRuntimeHexKeyToCampaignOffset(history.toHexKey);
    if (!originKey || !destinationKey) {
      return "Movement recorded; historical route details are unavailable. Review the formation's current location.";
    }
    const origin = this.getCampaignLocationPresentation(originKey, view);
    const destination = this.getCampaignLocationPresentation(destinationKey, view);
    // History remains append-only domain evidence. Its free-form summary is not
    // a coordinate contract and must not be parsed or rewritten in persistence.
    return `Moved from ${origin.primaryLabel} (${origin.secondaryGridReference}) to ${destination.primaryLabel} (${destination.secondaryGridReference}).`;
  }

  /** Renders the first-class shell from the Player projection and Player-owned compatibility records only. */
  private renderCommandShell(): void {
    if (!this.commandInterface) return;
    const view = this.campaignState.getCampaignMapView("Player");
    const runtime = this.campaignState.getRuntimeSnapshot();
    const historical: CampaignHistoricalLocationContext = { runtime, definition: this.campaignState.getScenarioDefinitionSnapshot() };
    if (!view) {
      this.commandInterface.render(projectCampaignCommandShellView({
        state: "empty",
        saveStatus: this.commandSaveStatus,
        advanceMode: this.campaignAdvanceMode,
        pauseAfterEveryResolution: this.pauseAfterEveryCampaignResolution
      }));
      return;
    }

    const foundation = this.projectCommandShellFoundation(view, historical);
    const situation = this.projectCommandShellSituation(view, runtime, historical, foundation);
    // Time is deliberately sampled after every other campaign projection so the
    // shell never publishes a fresh workspace beneath a stale command clock.
    const timeLabel = this.campaignState.getCurrentTimeDisplay();
    this.commandInterface.render(projectCampaignCommandShellView({
      state: "loaded",
      theaterTitle: foundation.scenario.title,
      campaignPhase: situation.campaignPhaseLabel,
      timeLabel,
      saveStatus: this.commandSaveStatus,
      intelligenceUnreadReports: view.unreadReportCount,
      commandSummary: situation.commandSummary,
      situation: situation.situationProjection,
      logistics: foundation.logistics,
      intelligence: foundation.intelligence,
      operations: situation.operations,
      afterActionReports: situation.afterActionReports,
      objectives: foundation.objectives,
      formations: foundation.formations,
      hexes: foundation.hexes
    }));
  }

  /** Reads and projects the scenario-owned workspaces shared by every loaded shell region. */
  private projectCommandShellFoundation(
    view: CampaignMapViewModel,
    historical: CampaignHistoricalLocationContext
  ) {
    const scenario = view.scenario;
    const playerEconomy = scenario.economies.find((economy) => economy.faction === "Player");
    const draftReservations = this.campaignState.getCampaignDraftReservations("Player");
    const playerOrders = this.campaignState.getCampaignOrders().filter((order) => order.faction === "Player");
    const objectivePresentations = this.campaignState.getCampaignObjectivePresentations();
    return { scenario, playerOrders, objectivePresentations, ...projectCampaignCommandShellWorkspaces({
      view, playerEconomy, reservedResources: draftReservations.resources,
      heldIntelligenceCapacity: draftReservations.intelligenceCapacity,
      objectivePresentations,
      readFormationRoster: () => this.campaignState.getCampaignFormationRoster("Player"),
      readIntelBriefEvents: () => this.campaignState.getIntelBriefEvents("Player"),
      readProductionReport: () => this.campaignState.getProductionReport(),
      readCurrentSegment: () => this.campaignState.getCurrentSegment(),
      readNavalSupport: () => this.campaignState.getPlayerNavalSupport(),
      resolveLocation: (hexKey, uncertainty) => this.getCampaignLocationPresentation(hexKey, view, uncertainty),
      resolveLocationDisplayLabel: (hexKey) => this.getCampaignLocationDisplayLabel(hexKey),
      resolveHistory: (formation) => this.projectFormationHistorySummary(
        formation.battleHistory[formation.battleHistory.length - 1], view, formation, historical
      ),
      resolveRedeployPreview: (hexKey) => this.campaignState.getCampaignRedeployActionPreview(hexKey, "Player"),
      resolveRepairPreview: (hexKey) => this.campaignState.getCampaignInfrastructureRepairActionPreview(hexKey),
      isAdjacentToEnemy: (hexKey) => this.campaignState.isAdjacentToEnemy(hexKey),
      formatLabel: (value) => this.formatCampaignLabel(value),
      formatSegment: (segment) => this.campaignState.segmentToTimeDisplay(segment)
    }) };
  }

  /** Reads and projects the live operational picture after the scenario foundation is complete. */
  private projectCommandShellSituation(
    view: CampaignMapViewModel,
    runtime: CampaignRuntimeState | null,
    historical: CampaignHistoricalLocationContext,
    foundation: ReturnType<CampaignScreen["projectCommandShellFoundation"]>
  ) {
    const {
      scenario,
      playerOrders,
      objectivePresentations,
      objectives,
      priorityForceHexes,
      formations
    } = foundation;
    const engagements = this.campaignState.getPendingEngagements();
    const postBattleAutosaveStatus = this.campaignState.getPostBattleAutosaveStatus();
    const afterActionReports = projectCampaignReportsWorkspace({
      reports: this.campaignState.getCampaignAfterActionReports(),
      postBattleAutosaveStatus,
      resolveInfrastructureReport: (engagementId) => this.campaignState.getCampaignBattleInfrastructureReport(engagementId),
      resolveFormation: (formationId) => this.campaignState.getCampaignFormationSnapshot(formationId),
      formatLabel: (value) => this.formatCampaignLabel(value),
      formatSegment: (segment) => this.campaignState.segmentToTimeDisplay(segment),
      resolveLocation: (report) => {
        const locationHexKey = projectRuntimeHexKeyToCampaignOffset(report.battleHexKey) ?? report.battleHexKey;
        return {
          locationHexKey,
          presentation: this.getCampaignBattleLocationPresentation(report.engagementId, locationHexKey, view, historical)
        };
      }
    });
    const campaignScore = runtime?.campaignScore;
    const outcome = runtime?.campaignOutcome;
    const campaignPhaseLabel = this.campaignState.getCampaignPhaseLabel();
    const advanceRecords = this.campaignState.getCampaignAdvanceTimeline(24);
    const frontAssessments = new Map(scenario.fronts.flatMap((front) => (
      front.initiative === "Player" ? [[front.key, this.getPlayerFrontAssessment(front.key)] as const] : []
    )));
    const counterattackStatusByFront = new Map(scenario.fronts.map((front) => {
      const ledger = runtime?.engagementLedgerOrder
        .map((id) => runtime.engagementLedger[id])
        .find((entry) => entry?.package?.engagement.frontKey === front.key
          && entry?.package?.engagement.attacker === "Bot");
      return [front.key, ledger?.status ?? null] as const;
    }));
    const situationProjection = projectCampaignSituationWorkspace({
      scenario,
      objectives,
      objectivePresentations,
      contacts: view.enemyContacts,
      formations,
      advanceRecords,
      acknowledgedAlertIds: new Set(runtime?.acknowledgedCampaignAlertIds ?? []),
      playerOrders,
      activeEngagementFrontKeys: new Set(engagements
        .map((engagement) => engagement.frontKey)
        .filter((frontKey): frontKey is string => Boolean(frontKey))),
      counterattackStatusByFront,
      frontAssessments,
      currentSegment: view.currentSegment,
      phaseKey: runtime?.campaignPhaseKey ?? null,
      phaseLabel: campaignPhaseLabel,
      campaignScore,
      campaignOutcome: outcome,
      intelligenceUnread: view.unreadReportCount,
      afterActionUnread: afterActionReports.filter((report) => !report.acknowledged).length,
      formatSegment: (segment) => this.campaignState.segmentToTimeDisplay(segment),
      formatStopReason: (reason) => this.campaignAdvanceStopLabel(reason),
      resolveLocation: (hexKey) => this.getCampaignLocationPresentation(hexKey, view),
      resolveLocationDisplayLabel: (hexKey) => this.getCampaignLocationDisplayLabel(hexKey)
    });
    const operations = this.projectCommandOperations(playerOrders);
    const commandSummary = projectCampaignCommandSummary({
      scenario,
      priorityForceHexes,
      resolveLocation: (hexKey) => this.getCampaignLocationPresentation(hexKey, view),
      runtimeStatus: runtime?.status ?? null,
      hasActiveEngagement: Boolean(this.campaignState.getActiveEngagementId()),
      pendingEngagementCount: engagements.length,
      playerOrders,
      intelligenceUnread: view.unreadReportCount,
      afterActionReports,
      commandAlerts: situationProjection.commandAlerts,
      outcome,
      allowContinueAfterOutcome: scenario.campaignArc?.allowContinueAfterOutcome === true,
      formations,
      saveStatus: this.commandSaveStatus,
      advance: {
        mode: this.campaignAdvanceMode,
        enabled: runtime?.status === "planning" && !this.saveLoadBusy && !this.commandCommitBusy,
        pauseAfterEveryResolution: this.pauseAfterEveryCampaignResolution,
        draftCount: operations.orderCommit.draftCount,
        latestCheckpoint: situationProjection.latestCheckpoint,
        alerts: situationProjection.latestAlerts,
        timeline: situationProjection.timeline
      }
    });

    return {
      campaignPhaseLabel,
      commandSummary,
      operations,
      afterActionReports,
      situationProjection
    };
  }

  private setCampaignStatusMessage(message: CampaignScreenStatusMessage | null): void {
    this.campaignStatusMessage = message ? { ...message } : null;
    this.renderSelection();
  }

  private composeStatusMarkup(source: "campaign" | "headquarters", message: CampaignScreenStatusMessage): string {
    return `<div data-${source}-status="${message.tone}"><strong>${this.escapeHtml(message.title)}</strong><div>${this.escapeHtml(message.detail)}</div><div>${this.escapeHtml(message.action)}</div></div>`;
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Resolves an offset hex key ("col,row") from a DOM event target on the campaign SVG. */
  private resolveHexKeyFromEventTarget(target: EventTarget | null): string | null {
    if (!target || !(target instanceof Element)) {
      return null;
    }

    const group = target.closest<SVGGElement>(".campaign-hex");
    const dataHexCarrier = target.closest("[data-hex]") as Element | null;
    const dataHex = dataHexCarrier?.getAttribute("data-hex") ?? null;
    const hexKey = group?.dataset.hex ?? dataHex;
    return hexKey ?? null;
  }

  /** Adds the hex under the pointer to the current bulk terrain selection and updates highlighting. */
  private addTerrainSelectionFromEvent(event: PointerEvent): void {
    const hexKey = this.resolveHexKeyFromEventTarget(event.target);
    if (!hexKey) {
      return;
    }

    if (!this.bulkTerrainSelection.has(hexKey)) {
      this.bulkTerrainSelection.add(hexKey);
      this.renderer.highlightHex(hexKey, "bulk-terrain");
    }

    // Track the most recent hex so the edit panel can show details while dragging.
    this.selectedHexKey = hexKey;
    this.renderSelection();
  }

  /** Clears any bulk terrain selection state and associated highlight classes. */
  private clearTerrainBulkSelection(): void {
    if (this.bulkTerrainSelection.size === 0) {
      return;
    }
    this.bulkTerrainSelection.clear();
    this.renderer.clearAllHighlights("bulk-terrain");
  }

  /** Selects all hexes in a rectangular region between two corner hexes (offset coordinates). */
  private selectRectangularRegion(corner1Key: string, corner2Key: string): void {
    const parsed1 = CoordinateSystem.parseHexKey(corner1Key);
    const parsed2 = CoordinateSystem.parseHexKey(corner2Key);

    if (!parsed1 || !parsed2) {
      return;
    }

    // Work in offset coordinates to select rectangular region
    const minCol = Math.min(parsed1.col, parsed2.col);
    const maxCol = Math.max(parsed1.col, parsed2.col);
    const minRow = Math.min(parsed1.row, parsed2.row);
    const maxRow = Math.max(parsed1.row, parsed2.row);

    this.clearTerrainBulkSelection();

    // Select all hexes in the rectangular bounds
    for (let col = minCol; col <= maxCol; col++) {
      for (let row = minRow; row <= maxRow; row++) {
        const hexKey = CoordinateSystem.makeHexKey(col, row);
        this.bulkTerrainSelection.add(hexKey);
        this.renderer.highlightHex(hexKey, "bulk-terrain");
      }
    }

    const count = this.bulkTerrainSelection.size;
    this.updateTerrainStatus(`Selected ${count} hex(es) in rectangle. Click Mark Water/Land to apply.`);
  }

  /** Begins tracking a drag paint gesture for terrain marking when the left mouse button is pressed. */
  private handleTerrainPointerDown(event: PointerEvent): void {
    if (!this.editMode || event.button !== 0) {
      return;
    }

    const svg = this.element.querySelector<SVGSVGElement>("#campaignHexMap");
    if (!svg || !svg.contains(event.target as Node)) {
      return;
    }

    const hexKey = this.resolveHexKeyFromEventTarget(event.target);
    if (!hexKey) {
      return;
    }

    // Ctrl+Click: rectangular selection mode
    if (event.ctrlKey || event.metaKey) {
      if (!this.rectSelectionCorner) {
        // First corner - start rectangular selection
        this.rectSelectionCorner = hexKey;
        this.clearTerrainBulkSelection();
        this.bulkTerrainSelection.add(hexKey);
        this.renderer.highlightHex(hexKey, "bulk-terrain");
        this.updateTerrainStatus("First corner selected. Ctrl+Click another hex to complete rectangle.");
      } else {
        // Second corner - complete rectangular selection
        this.selectRectangularRegion(this.rectSelectionCorner, hexKey);
        this.rectSelectionCorner = null;
      }
      return;
    }

    // Normal drag paint mode
    this.rectSelectionCorner = null; // Cancel any pending rectangular selection
    this.terrainDragActive = true;
    this.clearTerrainBulkSelection();
    this.addTerrainSelectionFromEvent(event);
  }

  /** Extends the bulk terrain selection as the pointer moves across additional hexes. */
  private handleTerrainPointerMove(event: PointerEvent): void {
    if (!this.editMode || !this.terrainDragActive) {
      return;
    }
    this.addTerrainSelectionFromEvent(event);
  }

  /** Finishes the drag paint gesture when the pointer is released or leaves the SVG. */
  private handleTerrainPointerUp(event: PointerEvent): void {
    if (!this.editMode || !this.terrainDragActive) {
      return;
    }
    this.addTerrainSelectionFromEvent(event);
    this.terrainDragActive = false;
  }

  private toggleEditMode(): void {
    this.editMode = !this.editMode;
    if (this.editPanel) {
      if (this.editMode) {
        this.editPanel.classList.remove("hidden");
      } else {
        this.editPanel.classList.add("hidden");
      }
    }
    if (this.exportJSONButton) {
      if (this.editMode) {
        this.exportJSONButton.classList.remove("hidden");
      } else {
        this.exportJSONButton.classList.add("hidden");
      }
    }
    if (this.editModeButton) {
      this.editModeButton.textContent = this.editMode ? "Exit Edit Mode" : "Edit Mode";
    }

    // Toggle terrain overlay visibility
    this.renderer.setTerrainOverlayVisible(this.editMode);
    if (!this.editMode) {
      this.clearTerrainBulkSelection();
    }
  }

  private initializeEditModeControls(): void {
    const applyBaseBtn = this.element.querySelector<HTMLButtonElement>("#editorApplyBase");
    const deleteBaseBtn = this.element.querySelector<HTMLButtonElement>("#editorDeleteBase");
    const addUnitBtn = this.element.querySelector<HTMLButtonElement>("#editorAddUnit");
    const moveBaseBtn = this.element.querySelector<HTMLButtonElement>("#editorMoveBase");

    if (applyBaseBtn) {
      applyBaseBtn.addEventListener("click", () => this.applyBaseEdit());
    }
    if (deleteBaseBtn) {
      deleteBaseBtn.addEventListener("click", () => this.deleteBase());
    }
    if (addUnitBtn) {
      addUnitBtn.addEventListener("click", () => this.addUnit());
    }
    if (moveBaseBtn) {
      moveBaseBtn.addEventListener("click", () => this.moveBase());
    }

    // Resource editing buttons
    const applyResourcesBtn = this.element.querySelector<HTMLButtonElement>("#editorApplyResources");
    const loadResourcesBtn = this.element.querySelector<HTMLButtonElement>("#editorLoadResources");

    if (applyResourcesBtn) {
      applyResourcesBtn.addEventListener("click", () => this.applyResourceEdit());
    }
    if (loadResourcesBtn) {
      loadResourcesBtn.addEventListener("click", () => this.loadCurrentResources());
    }

    // Terrain marking buttons
    const markWaterBtn = this.element.querySelector<HTMLButtonElement>("#editorMarkWater");
    const markLandBtn = this.element.querySelector<HTMLButtonElement>("#editorMarkLand");

    if (markWaterBtn) {
      markWaterBtn.addEventListener("click", () => this.markHexAsWater());
    }
    if (markLandBtn) {
      markLandBtn.addEventListener("click", () => this.markHexAsLand());
    }
  }

  private updateEditPanel(): void {
    const hexSpan = this.element.querySelector("#editorSelectedHex");
    const baseSelect = this.element.querySelector<HTMLSelectElement>("#editorBaseType");
    const unitList = this.element.querySelector("#editorUnitList");
    const colInput = this.element.querySelector<HTMLInputElement>("#editorCol");
    const rowInput = this.element.querySelector<HTMLInputElement>("#editorRow");
    const axialSpan = this.element.querySelector("#editorAxialCoords");

    if (!this.selectedHexKey || !hexSpan) return;

    hexSpan.textContent = this.selectedHexKey;

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    // Update coordinate inputs
    if (colInput) colInput.value = String(parsed.col);
    if (rowInput) rowInput.value = String(parsed.row);

    const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);

    // Update axial display and show water status
    const hexKey = `${q},${r}`;
    const isWater = scenario.mapExtents?.waterHexes?.includes(hexKey) ?? false;
    if (axialSpan) {
      axialSpan.textContent = `q:${q}, r:${r}${isWater ? ' [WATER]' : ''}`;
    }

    const tile = scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);

    // Update base type select
    if (baseSelect) {
      if (tile) {
        baseSelect.value = tile.tile;
      } else {
        baseSelect.value = "";
      }
    }

    // Update rotation select
    const rotationSelect = this.element.querySelector<HTMLSelectElement>("#editorRotation");
    if (rotationSelect) {
      if (tile && tile.rotation !== undefined) {
        rotationSelect.value = String(tile.rotation);
      } else {
        rotationSelect.value = "0";
      }
    }

    // Update unit list
    if (unitList && tile?.forces) {
      unitList.innerHTML = tile.forces.map((f, idx) => `
        <div style="display: flex; gap: 8px; margin: 4px 0; align-items: center;">
          <span>${f.unitType} x${f.count} - ${f.label || ''}</span>
          <button type="button" data-unit-index="${idx}" class="editor-delete-unit">×</button>
        </div>
      `).join("");

      // Add delete handlers
      unitList.querySelectorAll<HTMLButtonElement>(".editor-delete-unit").forEach(btn => {
        btn.addEventListener("click", () => {
          const idx = parseInt(btn.dataset.unitIndex ?? "-1");
          this.deleteUnit(idx);
        });
      });
    } else if (unitList) {
      unitList.innerHTML = "<div>No units</div>";
    }
  }

  private applyBaseEdit(): void {
    if (!this.selectedHexKey) return;

    const baseSelect = this.element.querySelector<HTMLSelectElement>("#editorBaseType");
    const rotationSelect = this.element.querySelector<HTMLSelectElement>("#editorRotation");
    if (!baseSelect) return;

    const baseType = baseSelect.value;
    const rotation = rotationSelect ? parseInt(rotationSelect.value) : 0;
    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);

    // Find or create tile
    const tile = scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);

    if (!baseType) {
      // Remove base if empty selection
      if (tile) {
        const idx = scenario.tiles.indexOf(tile);
        scenario.tiles.splice(idx, 1);
      }
    } else {
      if (tile) {
        // Update existing tile
        tile.tile = baseType;
        tile.rotation = rotation;
      } else {
        // Create new tile
        scenario.tiles.push({
          tile: baseType,
          hex: { q, r },
          forces: [],
          rotation: rotation
        });
      }
    }

    this.campaignState.setScenario(scenario);
    this.renderSelection();
  }

  private deleteBase(): void {
    if (!this.selectedHexKey) return;

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const tileIdx = scenario.tiles.findIndex((t) => t.hex.q === q && t.hex.r === r);

    if (tileIdx >= 0) {
      scenario.tiles.splice(tileIdx, 1);
      this.campaignState.setScenario(scenario);
      this.renderSelection();
    }
  }

  private markHexAsWater(): void {
    const usingBulk = this.bulkTerrainSelection.size > 0;
    const targetHexKeys = usingBulk
      ? Array.from(this.bulkTerrainSelection)
      : this.selectedHexKey
        ? [this.selectedHexKey]
        : [];

    if (targetHexKeys.length === 0) {
      return;
    }

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    // Initialize mapExtents if it doesn't exist so irregular coastlines can be marked precisely.
    if (!scenario.mapExtents) {
      scenario.mapExtents = {
        description: "Campaign map extents",
        corners: {
          nw: { q: 0, r: 0, label: "Northwest" },
          ne: { q: scenario.dimensions.cols - 1, r: 0, label: "Northeast" },
          sw: { q: 0, r: scenario.dimensions.rows - 1, label: "Southwest" },
          se: { q: scenario.dimensions.cols - 1, r: scenario.dimensions.rows - 1, label: "Southeast" }
        },
        zones: [],
        waterHexes: []
      };
    }

    if (!scenario.mapExtents.waterHexes) {
      scenario.mapExtents.waterHexes = [];
    }

    const added: Array<{ q: number; r: number }> = [];
    const alreadyWater: Array<{ q: number; r: number }> = [];

    for (const offsetKey of targetHexKeys) {
      const parsed = CoordinateSystem.parseHexKey(offsetKey);
      if (!parsed) continue;

      const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
      const axialKey = `${q},${r}`;

      if (!scenario.mapExtents.waterHexes.includes(axialKey)) {
        scenario.mapExtents.waterHexes.push(axialKey);
        added.push({ q, r });
      } else {
        alreadyWater.push({ q, r });
      }
    }

    if (added.length > 0) {
      this.campaignState.setScenario(scenario);
      this.renderer.refreshTerrainOverlay();
    }

    if (!usingBulk && targetHexKeys.length === 1) {
      if (added.length === 1) {
        const { q, r } = added[0];
        this.updateTerrainStatus(`Hex (${q}, ${r}) marked as WATER`);
        console.log(`Marked hex (${q}, ${r}) as water. Total water hexes: ${scenario.mapExtents.waterHexes.length}`);
      } else if (alreadyWater.length === 1) {
        const { q, r } = alreadyWater[0];
        this.updateTerrainStatus(`Hex (${q}, ${r}) already marked as water`);
      }
    } else if (usingBulk) {
      if (added.length > 0) {
        this.updateTerrainStatus(`Marked ${added.length} hex(es) as WATER${alreadyWater.length ? `; ${alreadyWater.length} already water` : ""}`);
      } else {
        this.updateTerrainStatus(`${alreadyWater.length} selected hex(es) were already marked as water`);
      }
      console.log(`Bulk water marking: added=${added.length}, alreadyWater=${alreadyWater.length}, total=${scenario.mapExtents.waterHexes.length}`);
    }

    this.clearTerrainBulkSelection();
  }

  private markHexAsLand(): void {
    const usingBulk = this.bulkTerrainSelection.size > 0;
    const targetHexKeys = usingBulk
      ? Array.from(this.bulkTerrainSelection)
      : this.selectedHexKey
        ? [this.selectedHexKey]
        : [];

    if (targetHexKeys.length === 0) {
      return;
    }

    const scenario = this.campaignState.getScenario();
    if (!scenario || !scenario.mapExtents?.waterHexes) {
      this.updateTerrainStatus("No water hexes to remove");
      return;
    }

    const removed: Array<{ q: number; r: number }> = [];
    const notWater: Array<{ q: number; r: number }> = [];

    for (const offsetKey of targetHexKeys) {
      const parsed = CoordinateSystem.parseHexKey(offsetKey);
      if (!parsed) continue;

      const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
      const axialKey = `${q},${r}`;

      const index = scenario.mapExtents.waterHexes.indexOf(axialKey);
      if (index >= 0) {
        scenario.mapExtents.waterHexes.splice(index, 1);
        removed.push({ q, r });
      } else {
        notWater.push({ q, r });
      }
    }

    if (removed.length > 0) {
      this.campaignState.setScenario(scenario);
      this.renderer.refreshTerrainOverlay();
    }

    if (!usingBulk && targetHexKeys.length === 1) {
      if (removed.length === 1) {
        const { q, r } = removed[0];
        this.updateTerrainStatus(`Hex (${q}, ${r}) marked as LAND`);
        console.log(`Marked hex (${q}, ${r}) as land. Total water hexes: ${scenario.mapExtents.waterHexes.length}`);
      } else if (notWater.length === 1) {
        const { q, r } = notWater[0];
        this.updateTerrainStatus(`Hex (${q}, ${r}) was not marked as water`);
      }
    } else if (usingBulk) {
      if (removed.length > 0) {
        this.updateTerrainStatus(`Marked ${removed.length} hex(es) as LAND${notWater.length ? `; ${notWater.length} were already land` : ""}`);
      } else {
        this.updateTerrainStatus("No selected hexes were marked as water");
      }
      console.log(`Bulk land marking: removed=${removed.length}, alreadyLand=${notWater.length}, remainingWater=${scenario.mapExtents.waterHexes.length}`);
    }

    this.clearTerrainBulkSelection();
  }

  private updateTerrainStatus(message: string): void {
    const statusDiv = this.element.querySelector("#editorTerrainStatus");
    if (statusDiv) {
      statusDiv.textContent = message;
      // Clear message after 3 seconds
      setTimeout(() => {
        if (statusDiv.textContent === message) {
          statusDiv.textContent = "";
        }
      }, 3000);
    }
  }

  private addUnit(): void {
    if (!this.selectedHexKey) return;

    const unitTypeSelect = this.element.querySelector<HTMLSelectElement>("#editorUnitType");
    const unitCountInput = this.element.querySelector<HTMLInputElement>("#editorUnitCount");
    const unitLabelInput = this.element.querySelector<HTMLInputElement>("#editorUnitLabel");

    if (!unitTypeSelect || !unitCountInput) return;

    const unitType = unitTypeSelect.value;
    const count = parseInt(unitCountInput.value) || 1;
    const label = unitLabelInput?.value || "";

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const tile = scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);

    if (!tile) {
      this.setCampaignStatusMessage({
        title: "Unit placement failed.",
        detail: "No base is present at the selected hex.",
        action: "Create or select a base before adding units to this location.",
        tone: "warning"
      });
      return;
    }

    if (!tile.forces) {
      tile.forces = [];
    }

    tile.forces.push({ unitType, count, label });

    this.campaignState.setScenario(scenario);
    this.renderSelection();
    this.setCampaignStatusMessage({
      title: "Unit added.",
      detail: `${unitType} x${count} assigned to ${this.selectedHexKey}.`,
      action: "Review the updated garrison or continue editing the force package.",
      tone: "success"
    });

    // Clear inputs
    if (unitCountInput) unitCountInput.value = "5";
    if (unitLabelInput) unitLabelInput.value = "";
  }

  private deleteUnit(index: number): void {
    if (!this.selectedHexKey || index < 0) return;

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    const { q, r } = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const tile = scenario.tiles.find((t) => t.hex.q === q && t.hex.r === r);

    if (tile?.forces && tile.forces[index]) {
      tile.forces.splice(index, 1);
      this.campaignState.setScenario(scenario);
      this.renderSelection();
    }
  }

  private moveBase(): void {
    if (!this.selectedHexKey) return;

    const colInput = this.element.querySelector<HTMLInputElement>("#editorCol");
    const rowInput = this.element.querySelector<HTMLInputElement>("#editorRow");

    if (!colInput || !rowInput) return;

    const newCol = parseInt(colInput.value);
    const newRow = parseInt(rowInput.value);

    if (isNaN(newCol) || isNaN(newRow)) {
      this.setCampaignStatusMessage({
        title: "Base move failed.",
        detail: "The destination coordinates are invalid.",
        action: "Enter numeric column and row values, then try the move again.",
        tone: "warning"
      });
      return;
    }

    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) return;

    const oldAxial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const newAxial = CoordinateSystem.offsetToAxial(newCol, newRow);

    // Find the tile at the old position
    const tileIdx = scenario.tiles.findIndex((t) => t.hex.q === oldAxial.q && t.hex.r === oldAxial.r);

    if (tileIdx < 0) {
      this.setCampaignStatusMessage({
        title: "Base move failed.",
        detail: "No base exists at the currently selected location.",
        action: "Select an existing base before issuing a relocation order.",
        tone: "warning"
      });
      return;
    }

    // Check if destination already has a base
    const destTile = scenario.tiles.find((t) => t.hex.q === newAxial.q && t.hex.r === newAxial.r);
    if (destTile) {
      this.setCampaignStatusMessage({
        title: "Base move failed.",
        detail: `Destination (${newCol}, ${newRow}) already contains a base.`,
        action: "Choose an open destination hex and retry the relocation.",
        tone: "warning"
      });
      return;
    }

    // Move the base
    scenario.tiles[tileIdx].hex.q = newAxial.q;
    scenario.tiles[tileIdx].hex.r = newAxial.r;

    try {
      this.campaignState.setScenario(scenario);
    } catch (error) {
      this.setCampaignStatusMessage({
        title: "Base move failed.",
        detail: error instanceof Error ? error.message : "The edited campaign scenario is invalid.",
        action: "Choose a destination that preserves every authored objective and retry the move.",
        tone: "warning"
      });
      return;
    }

    // Update selection to new position
    this.selectedHexKey = CoordinateSystem.makeHexKey(newCol, newRow);
    this.renderer.clearAllHighlights("selected");
    this.renderer.highlightHex(this.selectedHexKey, "selected");
    this.renderSelection();
    this.setCampaignStatusMessage({
      title: "Base moved.",
      detail: `Base repositioned to (${newCol}, ${newRow}).`,
      action: "Review the new frontage and continue editing if further adjustments are needed.",
      tone: "success"
    });
  }

  private loadCurrentResources(): void {
    const factionSelect = this.element.querySelector<HTMLSelectElement>("#editorResourceFaction");
    if (!factionSelect) return;

    const faction = factionSelect.value;
    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const economy = scenario.economies.find((e) => e.faction === faction);
    if (!economy) return;

    // Populate the input fields with current values
    const manpowerInput = this.element.querySelector<HTMLInputElement>("#editorManpower");
    const suppliesInput = this.element.querySelector<HTMLInputElement>("#editorSupplies");
    const fuelInput = this.element.querySelector<HTMLInputElement>("#editorFuel");
    const ammoInput = this.element.querySelector<HTMLInputElement>("#editorAmmo");
    const airPowerInput = this.element.querySelector<HTMLInputElement>("#editorAirPower");
    const navalPowerInput = this.element.querySelector<HTMLInputElement>("#editorNavalPower");
    const intelInput = this.element.querySelector<HTMLInputElement>("#editorIntelCoverage");

    if (manpowerInput) manpowerInput.value = String(economy.manpower);
    if (suppliesInput) suppliesInput.value = String(economy.supplies);
    if (fuelInput) fuelInput.value = String(economy.fuel);
    if (ammoInput) ammoInput.value = String(economy.ammo ?? 0);
    if (airPowerInput) airPowerInput.value = String(economy.airPower);
    if (navalPowerInput) navalPowerInput.value = String(economy.navalPower);
    if (intelInput) intelInput.value = String(economy.intelCoverage);
  }

  private applyResourceEdit(): void {
    const factionSelect = this.element.querySelector<HTMLSelectElement>("#editorResourceFaction");
    if (!factionSelect) return;

    const faction = factionSelect.value;
    const scenario = this.campaignState.getScenario();
    if (!scenario) return;

    const economy = scenario.economies.find((e) => e.faction === faction);
    if (!economy) {
      this.setCampaignStatusMessage({
        title: "Resource update failed.",
        detail: `No economy record exists for faction ${faction}.`,
        action: "Choose a faction with a configured economy or repair the campaign data before retrying.",
        tone: "warning"
      });
      return;
    }

    // Get values from input fields
    const manpowerInput = this.element.querySelector<HTMLInputElement>("#editorManpower");
    const suppliesInput = this.element.querySelector<HTMLInputElement>("#editorSupplies");
    const fuelInput = this.element.querySelector<HTMLInputElement>("#editorFuel");
    const ammoInput = this.element.querySelector<HTMLInputElement>("#editorAmmo");
    const airPowerInput = this.element.querySelector<HTMLInputElement>("#editorAirPower");
    const navalPowerInput = this.element.querySelector<HTMLInputElement>("#editorNavalPower");
    const intelInput = this.element.querySelector<HTMLInputElement>("#editorIntelCoverage");

    // Update economy values
    if (manpowerInput) economy.manpower = Math.max(0, parseInt(manpowerInput.value) || 0);
    if (suppliesInput) economy.supplies = Math.max(0, parseInt(suppliesInput.value) || 0);
    if (fuelInput) economy.fuel = Math.max(0, parseInt(fuelInput.value) || 0);
    if (ammoInput) economy.ammo = Math.max(0, parseInt(ammoInput.value) || 0);
    if (airPowerInput) economy.airPower = Math.max(0, parseInt(airPowerInput.value) || 0);
    if (navalPowerInput) economy.navalPower = Math.max(0, parseInt(navalPowerInput.value) || 0);
    if (intelInput) economy.intelCoverage = Math.max(0, parseInt(intelInput.value) || 0);

    // Update the scenario
    this.campaignState.setScenario(scenario);
    this.setCampaignStatusMessage({
      title: "Resources updated.",
      detail: `${faction} economy values were saved to the active campaign state.`,
      action: "Review the updated ledgers or continue editing the scenario.",
      tone: "success"
    });
  }

  /**
   * Validates campaign scenario map extents and tiles.
   * Returns warnings about tiles in water zones or out of bounds.
   */
  private validateMapExtents(scenario: CampaignScenarioData): string[] {
    const warnings: string[] = [];
    const { dimensions, mapExtents, tiles } = scenario;

    // Log corner coordinates
    if (mapExtents) {
      console.log("Map Corners:", {
        NW: `(${mapExtents.corners.nw.q}, ${mapExtents.corners.nw.r}) - ${mapExtents.corners.nw.label}`,
        NE: `(${mapExtents.corners.ne.q}, ${mapExtents.corners.ne.r}) - ${mapExtents.corners.ne.label}`,
        SW: `(${mapExtents.corners.sw.q}, ${mapExtents.corners.sw.r}) - ${mapExtents.corners.sw.label}`,
        SE: `(${mapExtents.corners.se.q}, ${mapExtents.corners.se.r}) - ${mapExtents.corners.se.label}`
      });

      // Build water hex set from explicit waterHexes list (preferred)
      const waterHexSet = new Set(mapExtents.waterHexes ?? []);

      // If no explicit water hexes, fall back to zone-based detection
      const waterZones = mapExtents.zones.filter(z => z.terrain === "water");

      tiles.forEach(tile => {
        const { q, r } = tile.hex;
        const hexKey = `${q},${r}`;

        // Check bounds
        if (q < 0 || q >= dimensions.cols || r < 0 || r >= dimensions.rows) {
          warnings.push(`Tile at (${q}, ${r}) is outside map bounds (${dimensions.cols}×${dimensions.rows})`);
        }

        // Check if tile is in water (prefer explicit waterHexes over zones)
        const isWater = waterHexSet.has(hexKey) || waterZones.some(zone => r >= zone.rMin && r <= zone.rMax);

        if (isWater) {
          const paletteEntry = scenario.tilePalette[tile.tile];
          const role = paletteEntry?.role ?? "unknown";
          warnings.push(`${role} at (${q}, ${r}) is in water hex`);
        }
      });

      if (warnings.length > 0) {
        console.warn("Map validation warnings:", warnings);
      }
    }

    return warnings;
  }

  private exportCampaignJSON(): void {
    const scenario = this.campaignState.getScenario();
    if (!scenario) {
      this.setCampaignStatusMessage({
        title: "Export failed.",
        detail: "No campaign scenario is currently loaded.",
        action: "Load a campaign scenario before exporting JSON.",
        tone: "warning"
      });
      return;
    }

    // Validate map extents
    const warnings = this.validateMapExtents(scenario);
    if (warnings.length > 0) {
      const waterWarnings = warnings.filter(w => w.includes("water zone"));
      if (waterWarnings.length > 0) {
        console.warn("Tiles in water zones detected:", waterWarnings);
      }
    }

    const exportScenario = this.createFullPaletteExport(scenario);
    this.downloadCampaignJSON(exportScenario, `campaign_${scenario.key}_${Date.now()}.json`);

    this.setCampaignStatusMessage({
      title: warnings.length > 0 ? "Campaign JSON exported with warnings." : "Campaign JSON exported.",
      detail: warnings.length > 0
        ? `Downloaded a full-palette export with ${warnings.length} validation warning(s).`
        : "Downloaded a full-palette campaign JSON export.",
      action: warnings.length > 0
        ? "Review the console warnings before using the exported file."
        : "Use the downloaded JSON for archival or scenario review.",
      tone: warnings.length > 0 ? "warning" : "success"
    });
  }

  private formatCampaignLabel(value: string): string {
    return value
      .replace(/_/g, " ")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/\s+/g, " ")
      .trim()
      .split(" ")
      .map((word) => word ? word.charAt(0).toUpperCase() + word.slice(1) : word)
      .join(" ");
  }

  private getCampaignLocationDisplayLabel(offsetHexKey: string): string {
    return this.getCampaignLocationPresentation(offsetHexKey).primaryLabel;
  }

  /** Uses the game's existing dialog surface, with one focus owner and explicit acceptance. */
  private confirmCampaignAction(titleText: string, detail: string, acceptLabel: string, signal?: AbortSignal): Promise<boolean> {
    if (signal?.aborted) return Promise.resolve(false);
    const layer = document.getElementById("battlePopupLayer");
    const dialog = layer?.querySelector<HTMLElement>(".battle-popup");
    const title = dialog?.querySelector<HTMLElement>("[data-popup-title]");
    const body = dialog?.querySelector<HTMLElement>("[data-popup-body]");
    const close = dialog?.querySelector<HTMLButtonElement>("#battlePopupClose");
    if (!layer || !dialog || !title || !body || !close) {
      this.reportBattleLaunchFailure("The campaign confirmation panel is unavailable. Reload the game before continuing this action.");
      return Promise.resolve(false);
    }
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : this.queueEngagementButton;
    title.textContent = titleText;
    dialog.dataset.popupKey = "campaign-confirmation";
    dialog.setAttribute("aria-modal", "true");
    const summary = document.createElement("p");
    summary.textContent = detail;
    const controls = document.createElement("div");
    controls.className = "campaign-workspace-controls";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.textContent = "Return to campaign";
    const accept = document.createElement("button");
    accept.type = "button";
    accept.dataset.confirmCampaignAction = "true";
    accept.className = "campaign-workspace-primary";
    accept.textContent = acceptLabel;
    controls.append(cancel, accept);
    body.replaceChildren(summary, controls);
    return new Promise<boolean>((resolve) => {
      const wasInert = this.element.inert === true;
      let finished = false;
      const finish = (accepted: boolean): void => {
        if (finished) return;
        finished = true;
        layer.classList.add("hidden");
        layer.setAttribute("aria-hidden", "true");
        layer.removeEventListener("keydown", onKey);
        signal?.removeEventListener("abort", onAbort);
        cancel.onclick = null;
        accept.onclick = null;
        close.onclick = null;
        this.element.inert = wasInert;
        if (!signal?.aborted && invoker?.isConnected && !invoker.closest(".hidden, [hidden], [inert]")) {
          invoker.focus({ preventScroll: true });
        }
        resolve(accepted);
      };
      const onAbort = (): void => finish(false);
      const onKey = (event: KeyboardEvent): void => {
        if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); finish(false); }
        if (event.key === "Tab") {
          const targets = [close, cancel, accept];
          const index = targets.indexOf(document.activeElement as HTMLButtonElement);
          event.preventDefault();
          targets[(index + (event.shiftKey ? targets.length - 1 : 1)) % targets.length].focus();
        }
      };
      cancel.onclick = () => finish(false);
      accept.onclick = () => finish(true);
      close.onclick = () => finish(false);
      signal?.addEventListener("abort", onAbort, { once: true });
      layer.addEventListener("keydown", onKey);
      layer.classList.remove("hidden");
      layer.setAttribute("aria-hidden", "false");
      this.element.inert = true;
      cancel.focus({ preventScroll: true });
    });
  }

  /** Resolves only the player's authored geography; never queries live opposing positions. */
  private getCampaignLocationPresentation(
    offsetHexKey: string,
    view: CampaignMapViewModel | null = this.campaignState.getCampaignMapView("Player"),
    uncertainty?: CampaignLocationUncertaintyInput
  ): CampaignLocationPresentation {
    return resolveCampaignMapLocationPresentation(view, offsetHexKey, uncertainty);
  }

  private formatCampaignUnitLabel(value: string): string {
    const labels: Record<string, string> = {
      Infantry_42: "Infantry",
      Infantry_Elite: "Elite Infantry",
      Artillery_105mm: "105 mm Artillery",
      Artillery_155mm: "155 mm Artillery",
      Panzer_IV: "Panzer IV",
      Supply_Truck: "Supply Trucks",
      Transport_Ship: "Transport Ships"
    };
    return labels[value] ?? this.formatCampaignLabel(value);
  }

  private saveCampaignToFile(): void {
    const scenario = this.campaignState.getScenario();
    if (!scenario) {
      this.setCampaignStatusMessage({
        title: "Save failed.",
        detail: "No campaign scenario is currently loaded.",
        action: "Load a campaign scenario before saving an export file.",
        tone: "warning"
      });
      return;
    }

    // Validate map extents
    const warnings = this.validateMapExtents(scenario);
    if (warnings.length > 0) {
      const waterWarnings = warnings.filter(w => w.includes("water zone"));
      if (waterWarnings.length > 0) {
        console.warn("Tiles in water zones detected:", waterWarnings);
      }
    }

    const exportScenario = this.createFullPaletteExport(scenario);
    this.downloadCampaignJSON(exportScenario, "campaign01.json");

    this.setCampaignStatusMessage({
      title: warnings.length > 0 ? "Campaign saved with warnings." : "Campaign saved.",
      detail: warnings.length > 0
        ? `Downloaded campaign01.json with ${warnings.length} validation warning(s).`
        : "Downloaded campaign01.json for source replacement.",
      action: warnings.length > 0
        ? "Review the console warnings before replacing the source file."
        : "Replace src/data/campaign01.json with the downloaded file when ready.",
      tone: warnings.length > 0 ? "warning" : "success"
    });
  }

  private createFullPaletteExport(scenario: CampaignScenarioData): CampaignScenarioData {
    const source = this.sourceScenario ?? scenario;
    return {
      ...scenario,
      tilePalette: source.tilePalette,
      ...(source.mapExtents ? { mapExtents: source.mapExtents } : {})
    };
  }

  private downloadCampaignJSON(scenario: CampaignScenarioData, filename: string): void {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Builds explicit save metadata and minimal UI resume context for the current campaign workspace.
   * Persistence timestamps are created at this UI boundary so CampaignState/runtime remain deterministic.
   */
  private buildCampaignPersistenceRequest(timestamp: string) {
    const scenario = this.campaignState.getScenario();
    return {
      timestamp,
      label: scenario?.title ?? "Campaign",
      playTimeSeconds: 0,
      difficulty: null,
      commanderRosterLink: null,
      uiResumeContext: {
        workspace: "theater" as const,
        selectedEntityId: this.selectedHexKey,
        mapCenter: null,
        mapZoom: null
      }
    };
  }

  /** Disables both persistence actions while one atomic save/load request is active. */
  private setCampaignPersistenceBusy(busy: boolean): void {
    this.saveLoadBusy = busy;
    if (this.saveButton) this.saveButton.disabled = busy;
    if (this.loadButton) this.loadButton.disabled = busy;
    if (this.battleSavesButton) this.battleSavesButton.disabled = busy;
    this.renderCommandShell();
  }

  /** Saves the authoritative Campaign 2.0 envelope, including faction-local knowledge and active operations. */
  private async saveCampaignSession(): Promise<void> {
    if (this.saveLoadBusy) return;
    if (!this.campaignState.getScenario()) {
      this.setCampaignStatusMessage({
        title: "Save failed.",
        detail: "No campaign scenario is currently loaded.",
        action: "Load a campaign scenario before saving progress.",
        tone: "warning"
      });
      return;
    }
    this.commandSaveStatus = "Saving";
    this.setCampaignPersistenceBusy(true);
    this.setCampaignStatusMessage({
      title: "Saving campaign…",
      detail: "Validating campaign state and writing the verified primary slot.",
      action: "Wait for save confirmation before closing the game.",
      tone: "info"
    });
    try {
      await this.campaignState.savePrimaryCampaign(
        this.buildCampaignPersistenceRequest(new Date().toISOString())
      );
      this.commandSaveStatus = "Saved";
      this.setCampaignStatusMessage({
        title: "Campaign saved.",
        detail: "Campaign progress and faction-local intelligence were verified and committed to durable storage.",
        action: "Continue the campaign or use Load to restore this checkpoint.",
        tone: "success"
      });
    } catch (error) {
      this.commandSaveStatus = "Save Failed";
      const detail = error instanceof Error ? error.message : "The campaign save could not be written.";
      this.setCampaignStatusMessage({
        title: "Save failed.",
        detail,
        action: "Keep this campaign open and retry. Existing verified saves were not replaced.",
        tone: "warning"
      });
    } finally {
      this.setCampaignPersistenceBusy(false);
    }
  }

  /** Restores a verified Campaign 2.0 slot or explicitly accepted prior recovery candidate. */
  private async loadCampaignSession(): Promise<void> {
    if (this.saveLoadBusy) return;
    const generation = ++this.checkpointRequestGeneration;
    const controller = new AbortController();
    this.checkpointRequestAbort = controller;
    const isCurrent = (): boolean => generation === this.checkpointRequestGeneration && !controller.signal.aborted
      && this.element.isConnected && !this.element.closest(".hidden, [hidden]") && !this.unlockState.isCampaignLocked("campaign");
    const invoker = document.activeElement instanceof HTMLElement ? document.activeElement : this.loadButton;
    const onScreenChanged = (event: Event): void => {
      if ((event as CustomEvent<{ id?: string }>).detail?.id !== "campaign") {
        this.cancelCampaignCheckpointRequest();
      }
    };
    document.addEventListener("screen:shown", onScreenChanged);
    this.setCampaignPersistenceBusy(true);
    let resumedBattle = false;
    try {
      const slots = await this.campaignState.listCampaignSaveSlots();
      if (!isCurrent()) return;
      const primary = slots.find((slot) => slot.slotId === CAMPAIGN_PRIMARY_SAVE_SLOT_ID);
      const describe = (slot: typeof slots[number]): string =>
        `${slot.display.campaignTitle} · ${slot.display.phaseLabel} · ${this.campaignState.segmentToTimeDisplay(slot.display.segment)} · Saved ${new Date(slot.updatedAt).toLocaleString()}`;
      const choices: CampaignCheckpointChoice[] = [{ slotId: CAMPAIGN_PRIMARY_SAVE_SLOT_ID,
        label: "Primary campaign", detail: primary ? describe(primary) : "Check for a primary or earlier legacy campaign save." },
      ...slots.filter((slot) => slot.slotId.startsWith(`${CAMPAIGN_POST_BATTLE_AUTOSAVE_SLOT_PREFIX}:`)
        && !/^Tactical\b/i.test(slot.display.phaseLabel))
        .map((slot) => ({ slotId: slot.slotId, label: "Post-battle campaign checkpoint", detail: describe(slot) }))];
      this.checkpointPicker = new CampaignCheckpointPicker(choices);
      const slotId = await this.checkpointPicker.choose(invoker);
      this.checkpointPicker = null;
      if (!slotId || !isCurrent()) return;
      this.commandSaveStatus = "Loading";
      this.setCampaignStatusMessage({
        title: "Loading campaign…",
        detail: "Verifying save integrity, authored content, and runtime invariants.",
        action: "Wait for verification to finish.",
        tone: "info"
      });
      const request = this.buildCampaignPersistenceRequest(new Date().toISOString());
      const result = slotId === CAMPAIGN_PRIMARY_SAVE_SLOT_ID
        ? await this.campaignState.loadPrimaryCampaign(request)
        : await this.campaignState.loadCampaignSlot(slotId, request);
      if (!isCurrent()) return;
      if (!result.ok) {
        if (result.recoveryCandidate) {
          const accepted = await this.confirmCampaignAction(
            "Recover earlier campaign",
            "The newest campaign save is damaged. A verified earlier save is available. Recover that earlier campaign to continue; the damaged record will remain quarantined.",
            "Recover earlier save",
            controller.signal
          );
          if (!isCurrent()) return;
          if (accepted) {
            if (slotId === CAMPAIGN_PRIMARY_SAVE_SLOT_ID) this.campaignState.restorePrimaryCampaignRecovery(result.recoveryCandidate);
            else this.campaignState.restoreCampaignRecovery(result.recoveryCandidate);
            this.commandSaveStatus = "Saved";
            this.renderTimeDisplay();
            this.setCampaignStatusMessage({
              title: "Earlier campaign recovered.",
              detail: "A verified prior save was loaded. The damaged newest record remains quarantined for diagnosis.",
              action: "Review the restored time and situation, then Save to create a new current checkpoint.",
              tone: "warning"
            });
            resumedBattle = this.resumeRestoredCampaignBattle();
            return;
          }
        }
        const missing = result.error.code === "SLOT_NOT_FOUND";
        this.commandSaveStatus = "Unsaved";
        this.setCampaignStatusMessage({
          title: missing ? "No campaign save found." : "Campaign load failed.",
          detail: result.error.message,
          action: result.recoveryCandidate
            ? "Load again when you are ready to choose the verified recovery checkpoint."
            : "Keep the current campaign open and retry or inspect storage diagnostics.",
          tone: "warning"
        });
        return;
      }
      this.renderTimeDisplay();
      this.commandSaveStatus = "Saved";
      resumedBattle = this.resumeRestoredCampaignBattle();
      if (resumedBattle) return;
      this.setCampaignStatusMessage({
        title: result.source === "legacyMigration" ? "Campaign migrated and restored." : "Campaign restored.",
        detail: result.warning
          ?? "The operational picture and faction-local intelligence were verified and restored with campaign progress.",
        action: "Review new and stale reports before issuing the next order.",
        tone: result.warning ? "warning" : "success"
      });
    } catch (error) {
      if (!isCurrent()) return;
      this.commandSaveStatus = "Unsaved";
      const detail = error instanceof Error ? error.message : "The campaign save could not be loaded.";
      this.setCampaignStatusMessage({
        title: "Campaign load failed.",
        detail,
        action: "The current campaign was retained. Retry or inspect storage diagnostics.",
        tone: "warning"
      });
    } finally {
      document.removeEventListener("screen:shown", onScreenChanged);
      this.checkpointPicker?.dispose();
      this.checkpointPicker = null;
      if (this.checkpointRequestAbort === controller) this.checkpointRequestAbort = null;
      this.setCampaignPersistenceBusy(false);
      // A restored AAR/tactical modal owns its own focus; cancellation returns to HQ Load.
      const activeModal = document.activeElement instanceof HTMLElement
        ? document.activeElement.closest("[role='dialog'][aria-modal='true']") : null;
      if (isCurrent() && !resumedBattle && !activeModal
        && invoker?.isConnected && !invoker.closest(".hidden, [hidden], [inert]")) {
        invoker.focus({ preventScroll: true });
      }
    }
  }

  /** Primary and recovered checkpoints share the same exact tactical resume handoff. */
  private resumeRestoredCampaignBattle(): boolean {
    const activeBattle = this.campaignState.getActiveBattleSave();
    if (!activeBattle) return false;
    this.setCampaignStatusMessage({
      title: "Tactical battle restored.",
      detail: "The campaign and its active engagement passed integrity and revision checks.",
      action: "Returning directly to the saved tactical decision point.",
      tone: "success"
    });
    document.dispatchEvent(new CustomEvent("campaign:battle:resume", {
      detail: { save: activeBattle }
    }));
    return true;
  }

  private loadCampaignFromFile(): void {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const json = event.target?.result as string;
          const scenario = JSON.parse(json);

          // Validate it's a campaign scenario
          if (!scenario.key || !scenario.tilePalette || !scenario.tiles) {
            this.setCampaignStatusMessage({
              title: "Campaign load failed.",
              detail: "The selected file is not a valid campaign scenario.",
              action: "Choose a campaign JSON export with scenario key, palette, and tile data.",
              tone: "warning"
            });
            return;
          }

          // Validate map extents
          const warnings = this.validateMapExtents(scenario);
          if (warnings.length > 0) {
            const waterWarnings = warnings.filter(w => w.includes("water zone"));
            if (waterWarnings.length > 0) {
              console.warn("Tiles in water zones detected:", waterWarnings);
            }
          }

          this.campaignState.setScenario(scenario);
          this.renderCampaignMap();

          this.setCampaignStatusMessage({
            title: warnings.length > 0 ? "Campaign loaded with warnings." : "Campaign loaded.",
            detail: warnings.length > 0
              ? `Scenario imported with ${warnings.length} validation warning(s).`
              : "Scenario imported into the active campaign view.",
            action: warnings.length > 0
              ? "Review the console warnings before editing or saving the imported scenario."
              : "Review the map, fronts, and ledgers before continuing.",
            tone: warnings.length > 0 ? "warning" : "success"
          });
        } catch (err) {
          console.error("Failed to parse campaign file:", err);
          this.setCampaignStatusMessage({
            title: "Campaign load failed.",
            detail: "The selected file could not be parsed as valid JSON.",
            action: "Choose a valid campaign JSON file and retry the import.",
            tone: "warning"
          });
        }
      };

      reader.readAsText(file);
    };

    input.click();
  }
}
