import type { IScreenManager } from "../../contracts/IScreenManager";
import type { BattleState, PrecombatMissionInfo } from "../../state/BattleState";
import type { IPopupManager } from "../../contracts/IPopupManager";
import {
  GameEngine,
  GameEngineConfig,
  PendingReserveRequest,
  SupplyTickReport,
  TurnSummary,
  BotTurnSummary,
  type BotAttackSummary,
  type UnitCommandState,
  type EnemyContactSnapshot,
  type TurnFaction,
  type SerializedAirMission,
  type AirMissionArrival,
  type AirEngagementEvent,
  type SupportImpactEvent,
  type SupportAssetSnapshot
} from "../../game/GameEngine";
import { GameEngineInitiativeMethods, type InitiativeBotActivationResult } from "../../game/GameEngineInitiativeIntegration";
import { EnhancedInitiativeTurnControls } from "../components/EnhancedInitiativeTurnControls";
import type { CombatDamageSummary, CombatPreview, AttackResolution } from "../../game/GameEngine";
import type {
  Axial,
  ReconStatus,
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  TerrainDensity,
  TerrainDictionary,
  TerrainFeature,
  TileInstance,
  HexEdgeFacing,
  HexModification,
  UnitClass,
  UnitTypeDefinition,
  UnitTypeDictionary,
  CombatStance,
  HexModificationType
} from "../../core/types";
import {
  HexMapRenderer,
  type BattleTargetMarker,
  type MoveAnimationHandle
} from "../../rendering/HexMapRenderer";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { MapViewport } from "../controls/MapViewport";
import { ZoomPanControls } from "../controls/ZoomPanControls";
import { DeploymentPanel, type DeploymentPanelCriticalError, type SelectedHexContext } from "../components/DeploymentPanel";
import { BattleLoadout } from "../components/BattleLoadout";
import { ReserveListPresenter } from "../components/BattleReserves";
import type { ShotBreakdown } from "../../core/Combat";
import { hexDistance } from "../../core/Hex";
import { SelectionIntelOverlay } from "../announcements/SelectionIntelOverlay";
import { BattleActivityLog } from "../announcements/BattleActivityLog";
import type {
  ActivityDetailSection,
  BattleIntelAction,
  BattleIntelChip,
  BattleIntelDetailSection,
  BattleSelectionIntel,
  DeploymentSelectionIntel,
  SelectionIntel,
  TerrainSelectionIntel
} from "../announcements/AnnouncementTypes";
import { ensureCampaignState } from "../../state/CampaignState";
import { ensureTutorialState, type TutorialPhase } from "../../state/TutorialState";
import { getNextPhase, getTutorialStep } from "../../data/tutorialSteps";
import {
  findGeneralById,
  updateGeneral,
  saveRosterToLocalStorage,
  type AirOperationsSummary,
  type MissionRecord,
  type UnitTypeCount,
  type AmmunitionExpenditure,
  type ObjectiveCompletion
} from "../../utils/rosterStorage";
import {
  ensureDeploymentState,
  type DeploymentPoolEntry,
  type DeploymentState,
  type ReserveBlueprint
} from "../../state/DeploymentState";
import type { BattleAnimationMode, UIState } from "../../state/UIState";
import { getScenarioByMissionKey, type ScenarioSource } from "../../data/scenarioRegistry";
import { normalizeScenarioSource, type RawScenarioInput } from "../../data/scenarioNormalizer";
import { getMissionDeploymentProfile, getMissionTurnLimit } from "../../data/missions";
import { getCombatProfile } from "../../data/combatProfiles";
import { combat } from "../../core/balance";
import { isSoftCombatTarget } from "../../core/armorEffects";
import terrainSource from "../../data/terrain.json";
import unitTypesSource from "../../data/unitSystem/derivedUnitTypes";
import { createMissionRulesController, type MissionPhaseStatus, type MissionRulesController, type MissionStatus } from "../../state/missionRules";
import { finalizeDeploymentZone } from "../utils/deploymentZonePlanner";
import { setMissionStartedUI } from "../utils/missionUi";
import { buildResolvedAirCombatScene } from "../airshow/ResolvedAirCombatSceneBuilder";
import {
  buildCoordinatedAirClusterPlaybackPlan,
  type CoordinatedAirClusterPlaybackPlan
} from "../airshow/ClusterAirPlaybackPlanner";
import {
  resolveAirInterceptBomberArrivalDelayMs as resolveSharedAirInterceptBomberArrivalDelayMs,
  resolveBomberInterceptIngressDurationMs as resolveSharedBomberInterceptIngressDurationMs,
  resolveBomberSortieEgressDurationMs as resolveSharedBomberSortieEgressDurationMs,
  resolveBomberSortieIngressDurationMs as resolveSharedBomberSortieIngressDurationMs,
  resolveFighterInterceptIngressDurationMs as resolveSharedFighterInterceptIngressDurationMs,
  resolveFighterSortieEgressDurationMs as resolveSharedFighterSortieEgressDurationMs,
  resolveFighterSortieIngressDurationMs as resolveSharedFighterSortieIngressDurationMs,
  scaleAirShowSequenceMs
} from "../airshow/AirShowPlaybackPolicy";
import {
  buildCoordinatedAirClusterTimingPolicy,
  buildResolvedAirCombatSceneTimingPolicy
} from "../airshow/AirShowTimingPolicies";
import type { AirShowRole } from "../airshow/AirShowLogger";
import {
  recordAirShowPlaybackCapture,
  type AirShowCoordinatedPlanSnapshot,
  type AirShowPlaybackCapture,
  type AirShowPlaybackClusterSnapshot,
  type AirShowPlaybackContractViolation,
  type AirShowPlaybackOperationSnapshot,
  type AirShowResolvedEventSceneCapture
} from "../airshow/AirShowPlaybackCapture";

type ActivityCategory = "player" | "enemy" | "system";
type ActivityType = "attack" | "move" | "deployment" | "supply" | "turn" | "log";

const TUTORIAL_DEPLOYMENT_CAMERA_ZOOM = 1.9;
const TUTORIAL_GROUP_CAMERA_ZOOM = 3.35;
const TUTORIAL_ORDER_CAMERA_ZOOM = 3.25;
const TUTORIAL_MOVEMENT_CAMERA_ZOOM = 2.55;
const TUTORIAL_ATTACK_CAMERA_ZOOM = 3.15;
const TUTORIAL_OVERVIEW_CAMERA_ZOOM = 3.0;
const TUTORIAL_MAP_INPUT_SETTLE_MS = 450;
const TUTORIAL_ENEMY_ACTIVATION_TIMEOUT_MS = 9000;

/**
 * Represents a battle log line destined for the sidebar activity feed so commanders can review past actions.
 */
interface PendingAttackContext {
  readonly attacker: string;
  readonly target: string;
  readonly preview: CombatPreview | null;
  readonly attackerUnitId: string | null;
  readonly defenderUnitId: string | null;
}

interface PendingFortificationContext {
  readonly hex: Axial;
  readonly hexKey: string;
  readonly unitLabel: string;
  readonly unitId: string | null;
  readonly modificationType: "fortifications" | "tankTraps" | "smoke" | "facing";
  /** For remote smoke only: the hex where the firing unit stands (used to pass callerAxial to engine). */
  readonly callerAxial?: Axial;
}

interface PreparedAirMissionFlight {
  readonly missionId: string;
  readonly faction: TurnFaction;
  readonly kind: string;
  readonly unitKey: string;
  readonly originKey: string;
  readonly destKey: string;
  readonly unitType: string;
  readonly strength?: number;
  readonly laneOffsetPx: number;
  readonly targetHex?: Axial;
  readonly targetUnitKey?: string;
  readonly escortTargetUnitKey?: string;
}

interface LinkedStrikePlaybackOperation {
  readonly kind: "linkedStrike";
  readonly index: number;
  readonly focusHex: Axial | null;
  readonly focusKey: string | null;
  readonly flight: PreparedAirMissionFlight;
  readonly linkedEvents: readonly AirEngagementEvent[];
  readonly escorts: readonly PreparedAirMissionFlight[];
}

interface StandaloneFlightPlaybackOperation {
  readonly kind: "flight";
  readonly index: number;
  readonly focusHex: Axial | null;
  readonly focusKey: string | null;
  readonly flight: PreparedAirMissionFlight;
}

interface StandaloneEventPlaybackOperation {
  readonly kind: "event";
  readonly index: number;
  readonly focusHex: Axial;
  readonly focusKey: string;
  readonly event: AirEngagementEvent;
}

type AirPlaybackOperation =
  | LinkedStrikePlaybackOperation
  | StandaloneFlightPlaybackOperation
  | StandaloneEventPlaybackOperation;

type ActiveAirShowPlaybackCaptureContext = {
  readonly base: Omit<
    AirShowPlaybackCapture,
    "operations" | "clusters" | "eventSceneCaptures" | "violations" | "error"
  >;
  operations: AirShowPlaybackOperationSnapshot[];
  clusters: AirShowPlaybackClusterSnapshot[];
  eventSceneCaptures: AirShowResolvedEventSceneCapture[];
  violations: AirShowPlaybackContractViolation[];
  error: string | null;
};

interface BattleSelectionStackMember {
  readonly unitId: string;
  readonly unit: ScenarioUnit;
  readonly isAutomated: boolean;
}

interface MissionEndResolution {
  readonly success: boolean;
  readonly objectivesCompleted: number;
  readonly objectivesFailed: number;
  readonly objectivesContested: number;
  readonly casualties: number;
  readonly reason: string;
  readonly headquartersTitle: string;
  readonly headquartersAction: string;
  readonly aborted?: boolean;
}

interface ActivityEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly category: ActivityCategory;
  readonly type: ActivityType;
  readonly summary: string;
  readonly details?: Record<string, unknown>;
  readonly detailSections?: readonly ActivityDetailSection[];
}

type ActivityEventInput = {
  readonly category: ActivityCategory;
  readonly type: ActivityType;
  readonly summary: string;
  readonly details?: Record<string, unknown>;
  readonly detailSections?: readonly ActivityDetailSection[];
};

type TutorialUnitTarget = {
  readonly unit: ScenarioUnit;
  readonly commandState: UnitCommandState | null;
  readonly hexKey: string;
};

type QueuedTargetMarkerAction =
  | {
      readonly type: "artillery";
      readonly assetId: string;
      readonly callerHexKey: string;
      readonly callerLabel: string;
      readonly targetHexKey: string;
    }
  | {
      readonly type: "airMission";
      readonly missionId: string;
      readonly missionKind: "strike" | "airTransport";
      readonly targetHexKey: string;
    };

/**
 * Manages the battle screen where combat takes place.
 * Handles turn management, deployment finalization, and mission completion.
 */
export class BattleScreen {
  private static readonly SOUND_ENABLED_STORAGE_KEY = "fsg-sound-enabled";
  private readonly screenManager: IScreenManager;
  private readonly battleState: BattleState;
  private readonly popupManager: IPopupManager;
  private readonly hexMapRenderer: HexMapRenderer | null;
  private readonly deploymentPanel: DeploymentPanel | null;
  private readonly uiState: UIState | null;
  // Optional UI helpers: loadout/reserve panels are temporarily disabled while the
  // battle layout is refreshed, so we tolerate nulls until the replacement lands.
  private readonly battleLoadout: BattleLoadout | null;
  private readonly reservePresenter: ReserveListPresenter | null;
  private readonly mapViewport: MapViewport | null;
  private readonly zoomPanControls: ZoomPanControls | null;
  private scenario!: ScenarioData;
  private scenarioSource!: ScenarioSource;
  private readonly unitTypes: UnitTypeDictionary;
  private readonly terrain: TerrainDictionary;
  private element: HTMLElement;
  private keyboardNavigationHandler: (event: KeyboardEvent) => void;
  private screenShownHandler: (event: Event) => void;
  private defaultSelectionKey: string | null;
  private deploymentPrimed = false;
  private panelEventsBound = false;
  private tutorialBaseCampSelectionCleared = false;
  private tutorialInitiativeGroupSelectionCleared = false;
  private tutorialActiveGroupSelectionCleared = false;
  private tutorialCameraSyncKey: string | null = null;
  private tutorialLastSyncedPhase: TutorialPhase | null = null;
  private tutorialSelectionClearedForPhase: TutorialPhase | null = null;
  private tutorialSelectionSyncInProgress = false;
  private tutorialUserMapClickInProgress = false;
  private tutorialMapInputBlockedUntil = 0;
  private tutorialQueuedMapClickTimerId: number | null = null;
  private readonly tutorialGuidedHexKeys = new Set<string>();
  private tutorialEnemyActivationMonitorActive = false;
  private tutorialEnemyActivationStartedAt = 0;
  private tutorialEnemyActivationSequenceStart = 0;
  private battleUpdateUnsubscribe: (() => void) | null = null;
  private tutorialUpdateUnsubscribe: (() => void) | null = null;
  private missionRulesController: MissionRulesController | null = null;
  private missionStatus: MissionStatus | null = null;
  private lastMissionPhaseId: MissionPhaseStatus["id"] | null = null;
  private missionEndPrompted = false;
  private missionEndModal: HTMLElement | null = null;
  private static readonly BOT_MOVE_ANIMATION_MS = 500;
  private static readonly BOT_CAMERA_PADDING = 96;
  private static readonly ACTIVITY_EVENT_LIMIT = 120;
  private static readonly AIR_FORMATION_SPACING_PX = 27;
  private static readonly AIR_PLAYBACK_CLUSTER_LINK_DISTANCE_HEX = 8;

  // Initiative system integration
  private initiativeMethods: GameEngineInitiativeMethods | null = null;
  private initiativeTurnControls: EnhancedInitiativeTurnControls | null = null;
  private isInitiativeSystemEnabled = false;
  private initiativeControlsInitTimerId: number | null = null;
  private initiativeUiSyncIntervalId: number | null = null;
  private initiativeGroupCursorUnitId: string | null = null;
  private initiativeGroupSessionId: string | null = null;
  private initiativeTurnAdvanceInProgress = false;
  private readonly initiativeSkippedUnitIds = new Set<string>();
  private initiativeEndTurnSkipModeActive = false;

  // DOM element references
  private battleAnnouncements: HTMLElement | null = null;
  private battleActivityLogToggleButton: HTMLButtonElement | null = null;
  private lastAnnouncement: string | null = null;
  // Phase 1 selection intel cache backing the forthcoming persistent overlay.
  private selectionIntel: SelectionIntel | null = null;
  // Phase 1 in-memory activity log so the future sidebar can render a scrollable feed.
  private readonly activityEvents: ActivityEvent[] = [];
  private activityEventSequence = 0;
  private selectionIntelOverlay: SelectionIntelOverlay | null = null;
  private readonly battleActivityLog: BattleActivityLog | null;
  private activeMissionSessionKey: string | null = null;
  private battleIntelOverlayRoot: HTMLElement | null = null;

  /** Temporary debug overlay to visualize bot/player placements regardless of recon/LOS. Disable when done. */
  private readonly debugPlacementOverlayEnabled = false;

  // Combat stance selection
  private currentAttackStance: CombatStance | null = null;

  // Air Support: temporary range overlay keys while picking mission targets
  private airPreviewKeys: Set<string> = new Set();
  private airPreviewListener: ((e: Event) => void) | null = null;
  private airClearPreviewListener: ((e: Event) => void) | null = null;
  private targetMarkerClickListener: ((e: Event) => void) | null = null;
  private reserveSelectionListener: ((e: Event) => void) | null = null;
  private requisitionRequestListener: ((e: Event) => void) | null = null;
  private sentryPipClickListener: ((e: Event) => void) | null = null;
  private readonly tutorialAirMissionQueuedListener: (event: Event) => void;
  private seenAirReportIds: Set<string> = new Set();
  private detailedAirCombatTurnUnitKeys: Set<string> = new Set();
  private activeAirShowPlaybackCaptureContext: ActiveAirShowPlaybackCaptureContext | null = null;
  private deferMissionLogSync = false;
  private pendingMissionLogSync = false;
  private artilleryPreviewKeys: Set<string> = new Set();
  private readonly queuedTargetMarkerActions = new Map<string, QueuedTargetMarkerAction>();
  private artilleryTargetingState: {
    callerHexKey: string;
    callerLabel: string;
    callerUnitId: string | null;
    assetId: string;
    targetHexKeys: Set<string>;
  } | null = null;

  private smokeTargetingState: {
    callerHexKey: string;
    callerAxial: Axial;
    callerLabel: string;
    callerUnitId: string | null;
    targetHexKeys: Set<string>;
  } | null = null;

  private beginBattleButton: HTMLButtonElement | null = null;
  private settingsToggleButton: HTMLButtonElement | null = null;
  private settingsMenu: HTMLElement | null = null;
  private soundToggleButton: HTMLButtonElement | null = null;
  private animationToggleButton: HTMLButtonElement | null = null;
  private endTurnButton: HTMLButtonElement | null = null;
  private endMissionButton: HTMLButtonElement | null = null;
  private baseCampStatus: HTMLElement | null = null;
  private baseCampAssignButton: HTMLButtonElement | null = null;
  private deploymentPanelToggleButton: HTMLButtonElement | null = null;
  private deploymentPanelBody: HTMLElement | null = null;
  private autoDeployEvenlyButton: HTMLButtonElement | null = null;
  private autoDeployGroupedButton: HTMLButtonElement | null = null;
  private battleMainContainer: HTMLElement | null = null;
  private attackConfirmDialog: HTMLElement | null = null;
  private attackConfirmAccept: HTMLButtonElement | null = null;
  private attackConfirmCancel: HTMLButtonElement | null = null;
  private attackConfirmBody: HTMLElement | null = null;
  private fortificationFacingDialog: HTMLElement | null = null;
  private fortificationFacingPreview: HTMLElement | null = null;
  private missionTitleElement: HTMLElement | null = null;
  private missionBriefingElement: HTMLElement | null = null;
  private missionObjectivesList: HTMLUListElement | null = null;
  private missionDoctrineElement: HTMLElement | null = null;
  private missionTurnLimitElement: HTMLElement | null = null;
  private missionSuppliesList: HTMLUListElement | null = null;
  private objectiveSummaryButton: HTMLButtonElement | null = null;
  private objectiveIndexElement: HTMLElement | null = null;
  private objectiveTitleElement: HTMLElement | null = null;
  private objectiveStatusElement: HTMLElement | null = null;
  private turnIndicatorElement: HTMLElement | null = null;
  private factionIndicatorElement: HTMLElement | null = null;
  private phaseIndicatorElement: HTMLElement | null = null;
  private idleWarningLayer: HTMLElement | null = null;
  private idleWarningDialog: HTMLElement | null = null;
  private idleWarningList: HTMLUListElement | null = null;
  private idleContinueButton: HTMLButtonElement | null = null;
  private idleEndTurnButton: HTMLButtonElement | null = null;
  private idleWarningPreviousFocus: HTMLElement | null = null;
  private idleWarningKeyHandler: ((event: KeyboardEvent) => void) | null = null;
  private pendingIdleTurnAdvance: { summary: TurnSummary } | null = null;
  private lastFocusedHexKey: string | null = null;
  private lastViewportTransform: { zoom: number; panX: number; panY: number } | null = null;
  private cameraFrozen: boolean = false;
  private soundEnabled = true;
  private battleAnimationMode: BattleAnimationMode = "regular";
  private readonly settingsDocumentPointerHandler = (event: Event): void => {
    const target = event.target instanceof Node ? event.target : null;
    if (!target || this.settingsMenu?.contains(target) || this.settingsToggleButton?.contains(target)) {
      return;
    }
    this.setBattleSettingsMenuOpen(false);
  };
  private readonly settingsDocumentKeydownHandler = (event: KeyboardEvent): void => {
    if (event.key !== "Escape" || this.settingsMenu?.classList.contains("hidden")) {
      return;
    }
    this.setBattleSettingsMenuOpen(false);
    this.settingsToggleButton?.focus();
  };

  // Hex selection state
  private selectedHexKey: string | null = null;
  private selectedPlayerUnitId: string | null = null;
  private playerMoveHexes: Set<string> = new Set();
  private playerAttackHexes: Set<string> = new Set();
  private pendingAttack: PendingAttackContext | null = null;
  private idleUnitHighlightKeys: Set<string> = new Set();
  private objectiveHexKeys: Set<string> = new Set();
  private currentObjectiveIndex = -1;
  // Tracks focus management for the attack confirmation dialog so keyboard users remain within the modal context.
  private attackDialogPreviouslyFocused: HTMLElement | null = null;
  private attackDialogKeydownHandler: (event: KeyboardEvent) => void;
  // Prevents double-submitting the confirmation dialog via rapid key presses or overlapping handlers.
  private attackConfirmationLocked = false;
  private fortificationDialogPreviouslyFocused: HTMLElement | null = null;
  private fortificationDialogKeydownHandler: (event: KeyboardEvent) => void;
  private pendingFortificationBuild: PendingFortificationContext | null = null;

  private formatReadinessValue(value: number): string {
    const safeValue = Number.isFinite(value) ? value : 0;
    if (Number.isInteger(safeValue)) return safeValue.toFixed(0);
    const roundedTenths = Math.round(safeValue * 10) / 10;
    return Math.abs(safeValue - roundedTenths) < 0.001 ? safeValue.toFixed(1) : safeValue.toFixed(2);
  }

  private formatDamageAmount(value: number): string {
    return this.formatReadinessValue(this.clampDisplayedDamage(value));
  }

  private formatPersonnelDelta(damage: CombatDamageSummary | null | undefined): string {
    if (!damage) {
      return "No personnel projection";
    }
    const parts: string[] = [];
    if (damage.personnel.killed > 0) parts.push(`${damage.personnel.killed} KIA`);
    if (damage.personnel.severelyWounded > 0) parts.push(`${damage.personnel.severelyWounded} severe`);
    if (damage.personnel.wounded > 0) parts.push(`${damage.personnel.wounded} wounded`);
    if (damage.personnel.injured > 0) parts.push(`${damage.personnel.injured} injured`);
    return parts.length > 0 ? parts.join(", ") : "No personnel losses";
  }

  private formatEquipmentDelta(damage: CombatDamageSummary | null | undefined): string {
    if (!damage) {
      return "No equipment projection";
    }
    const parts: string[] = [];
    if (damage.equipment.destroyed > 0) parts.push(`${damage.equipment.destroyed} destroyed`);
    if (damage.equipment.disabled > 0) parts.push(`${damage.equipment.disabled} disabled`);
    if (damage.equipment.damaged > 0) parts.push(`${damage.equipment.damaged} damaged`);
    return parts.length > 0 ? parts.join(", ") : "No equipment losses";
  }

  private formatComponentDelta(damage: CombatDamageSummary | null | undefined): string {
    if (!damage?.componentDamage) {
      return "No component damage";
    }
    const parts: string[] = [];
    const append = (label: string, values: Partial<Record<string, number>>): void => {
      Object.entries(values)
        .filter(([, count]) => typeof count === "number" && count > 0)
        .forEach(([component, count]) => parts.push(`${count} ${component} ${label}`));
    };
    append("damaged", damage.componentDamage.damaged);
    append("disabled", damage.componentDamage.disabled);
    append("destroyed", damage.componentDamage.destroyed);
    return parts.length > 0 ? parts.join(", ") : "No component damage";
  }

  private formatDamageTypes(damage: CombatDamageSummary | null | undefined): string {
    if (!damage || damage.damageTypesUsed.length === 0) {
      return "Not classified";
    }
    return damage.damageTypesUsed.map((type) => this.toTitleCase(type)).join(", ");
  }

  private renderReadinessProjectionRows(damage: CombatDamageSummary | null | undefined): string {
    if (!damage) {
      return "";
    }
    const before = damage.statusBefore.readinessBreakdown;
    const after = damage.statusAfter.readinessBreakdown;
    const equipmentBefore = before.equipment;
    const equipmentAfter = after.equipment;
    const equipmentRow = equipmentBefore && equipmentAfter
      ? `
        <div class="damage-projection-row">
          <span>Equipment readiness</span>
          <strong>${this.formatReadinessValue(equipmentBefore.readiness)}% -> ${this.formatReadinessValue(equipmentAfter.readiness)}%</strong>
        </div>
      `
      : "";

    return `
      <div class="damage-projection">
        <div class="damage-projection-row damage-projection-row--primary">
          <span>Combat readiness</span>
          <strong>${this.formatReadinessValue(damage.strengthBefore)}% -> ${this.formatReadinessValue(damage.strengthAfter)}%</strong>
        </div>
        <div class="damage-projection-row">
          <span>Personnel readiness</span>
          <strong>${this.formatReadinessValue(before.personnel.readiness)}% -> ${this.formatReadinessValue(after.personnel.readiness)}%</strong>
        </div>
        ${equipmentRow}
        <div class="damage-projection-row">
          <span>Personnel effects</span>
          <strong>${this.escapeHtml(this.formatPersonnelDelta(damage))}</strong>
        </div>
        <div class="damage-projection-row">
          <span>Equipment effects</span>
          <strong>${this.escapeHtml(this.formatEquipmentDelta(damage))}</strong>
        </div>
      </div>
    `;
  }

  private renderWeaponStatusEffects(damage: CombatDamageSummary | null | undefined): string {
    if (!damage || damage.weaponHits.length === 0) {
      return `<p><strong>Status Effects by Weapon:</strong> No weapon-level status effects projected.</p>`;
    }

    const rows = damage.weaponHits.map((hit) => {
      const personnel = this.formatPersonnelDelta({
        ...damage,
        personnel: hit.personnel,
        equipment: { damaged: 0, disabled: 0, destroyed: 0 }
      });
      const equipment = this.formatEquipmentDelta({
        ...damage,
        personnel: { injured: 0, wounded: 0, severelyWounded: 0, killed: 0 },
        equipment: hit.equipment
      });
      return `
        <div class="weapon-group-item">
          <span class="weapon-name">${this.escapeHtml(hit.label)}:</span>
          <span class="weapon-stats">${hit.shots} shots, ${hit.expectedHits.toFixed(1)} hits</span>
          <span class="weapon-overmatch">${this.escapeHtml(personnel)}; ${this.escapeHtml(equipment)}</span>
        </div>
      `;
    }).join("");

    return `
      <div class="weapon-groups-detail">
        <strong>Status Effects by Weapon:</strong>
        ${rows}
      </div>
    `;
  }

  /**
   * Prepares and displays the attack confirmation dialog so the commander can approve or cancel combat resolution.
   * Stores the pending attacker/target hexes to be replayed once the user confirms.
   */
  private promptAttackConfirmation(
    attacker: Axial,
    defender: Axial,
    options: { preserveStance?: boolean; attackerUnitId?: string | null; defenderUnitId?: string | null } = {}
  ): void {
    if (!this.attackConfirmDialog || !this.attackConfirmBody) {
      console.warn("Attack confirmation dialog not available in DOM; executing attack immediately.");
      void this.executePendingAttack(
        attacker,
        defender,
        options.attackerUnitId ?? this.selectedPlayerUnitId,
        options.defenderUnitId ?? null
      );
      return;
    }

    // Close any open popups so the attack dialog has user's full attention
    if (this.popupManager.getActivePopup()) {
      this.popupManager.closePopup();
    }

    const attackerOffset = CoordinateSystem.axialToOffset(attacker.q, attacker.r);
    const defenderOffset = CoordinateSystem.axialToOffset(defender.q, defender.r);
    const attackerHex = CoordinateSystem.makeHexKey(attackerOffset.col, attackerOffset.row);
    const defenderHex = CoordinateSystem.makeHexKey(defenderOffset.col, defenderOffset.row);
    const attackerUnitId = options.attackerUnitId ?? this.selectedPlayerUnitId;
    const defenderUnitId = options.defenderUnitId ?? null;

    // Get combat preview to show detailed attack odds
    const engine = this.battleState.ensureGameEngine();
    const attackerUnit = this.resolvePlayerUnitSnapshot(attackerHex, attackerUnitId);
    const commandState = attackerUnit ? engine.getUnitCommandState(attacker, attackerUnitId ?? undefined) : null;
    const supportsStances = attackerUnit ? this.canUnitUseCombatStances(attackerUnit) : false;
    const assaultAvailable = attackerUnit ? this.canUnitAssault(attackerUnit, commandState, attacker, defender) : false;

    if (!supportsStances) {
      this.currentAttackStance = null;
    } else if (
      !options.preserveStance ||
      this.currentAttackStance === null ||
      (this.currentAttackStance === "assault" && !assaultAvailable)
    ) {
      this.currentAttackStance = "fireAtWill";
    }

    const preview = engine.previewAttack(
      attacker,
      defender,
      this.currentAttackStance ?? undefined,
      attackerUnitId ?? undefined,
      defenderUnitId ?? undefined
    );

    this.pendingAttack = {
      attacker: attackerHex,
      target: defenderHex,
      preview,
      attackerUnitId,
      defenderUnitId
    };

    if (!preview) {
      // No valid preview (LOS blocked or out of range)
      this.attackConfirmBody.innerHTML = `
        <div class="attack-preview-profile">
          <span class="attack-preview-profile__label">Fire Profile</span>
          <strong>${supportsStances ? "Combat order unavailable" : "Direct fire"}</strong>
          <span>Cannot attack this target. Line of sight may be blocked or the target may be out of range.</span>
        </div>
      `;
      this.configureAttackStanceControls(attackerUnit, commandState, attacker, defender);
      this.showAttackDialog();
      return;
    }

    const detailsExpanded = this.attackConfirmBody.querySelector<HTMLDetailsElement>(".attack-preview-details")?.open ?? false;

    const attackerType = preview.attacker.type;
    const defenderType = preview.defender.type;
    const attackerDef = this.unitTypes?.[attackerType];
    const defenderDef = this.unitTypes?.[defenderType];
    if (!attackerDef || !defenderDef) {
      throw new Error(`Attack preview missing unit definition(s) for '${attackerType}' or '${defenderType}'.`);
    }
    const attackerLabel = attackerUnit
      ? this.resolveReadableUnitLabel(attackerUnit)
      : this.toTitleCase(attackerType);
    const defenderLabel = this.toTitleCase(defenderType);

    const accuracyDetails = preview.result.accuracyBreakdown;
    const damageDetails = preview.result.damageBreakdown;
    const commanderStats = preview.commander;

    const finalAccuracyPercent = accuracyDetails.final;
    const baseAccuracyPercent = accuracyDetails.baseRange;
    const commanderAccuracyScalar = accuracyDetails.commanderScalar;
    const afterCommander = accuracyDetails.afterCommander;
    const accuracyExperienceScalar = accuracyDetails.experienceScalar;
    const afterExperience = accuracyDetails.afterExperience;
    const terrainModifier = accuracyDetails.terrainModifier;
    const terrainMultiplier = accuracyDetails.terrainMultiplier;
    const afterTerrain = accuracyDetails.afterTerrain;
    const spottedMultiplier = accuracyDetails.spottedMultiplier;
    const finalPreClamp = accuracyDetails.finalPreClamp;

    const shots = preview.result.shots;
    const expectedHitsValue = Math.max(0, preview.result.expectedHits);
    const expectedHits = expectedHitsValue.toFixed(1);
    const effectiveAP = Math.round(preview.result.effectiveAP);
    const facingArmor = Math.round(preview.result.facingArmor);
    const attackerStrength = preview.attacker.strength;
    const defenderStrength = preview.defender.strength;

    const baseDamagePerHit = damageDetails.baseTableValue;
    const damageExperienceScalar = damageDetails.experienceScalar;
    const preCommanderDamagePerHit = damageDetails.afterExperience;
    const commanderDamageScalar = damageDetails.commanderScalar;
    const prePayloadDamagePerHit = damageDetails.final;

    const postPayloadExpectedDamage = this.clampDisplayedDamage(preview.finalExpectedDamage);
    const baseExpectedSuppression = preview.result.expectedSuppression;
    const postPayloadExpectedSuppression = preview.finalExpectedSuppression;
    const suppressionSummary = `${baseExpectedSuppression.toFixed(1)} -> ${postPayloadExpectedSuppression.toFixed(1)}`;

    const damageMultiplier = preview.damageMultiplier;
    const suppressionMultiplier = preview.suppressionMultiplier;
    const damageMultiplierDescription =
      damageMultiplier === 10
        ? "Heavy payload strike (bombers vs ground)"
        : damageMultiplier === 4
          ? "Accelerated dogfight tempo"
          : "Standard payload";
    const suppressionMultiplierDescription =
      suppressionMultiplier === 10
        ? "Heavy payload morale shock"
        : suppressionMultiplier === 4
          ? "Dogfight tempo"
          : "Standard suppression";

    const commanderAccuracyBonus = commanderStats.accBonus ?? 0;
    const commanderDamageBonus = commanderStats.dmgBonus ?? 0;

    // Surface both the shared profile table and the unit-specific scalar so the preview text lines up
    // with the authored `accuracyBase` stat shown elsewhere in the UI.
    const attackerProfile = getCombatProfile(attackerDef.combat as UnitTypeDefinition["combat"]);
    const unitAccuracyScalar = Math.max(0.25, attackerDef.accuracyBase / attackerProfile.accuracyReference);
    const rangeTableAccuracy = baseAccuracyPercent / unitAccuracyScalar;
    const targetUsesSoftAttack = isSoftCombatTarget(defenderDef);
    const attackStatLabel = targetUsesSoftAttack ? "Soft attack" : "Hard attack";
    const attackStatValue = targetUsesSoftAttack ? attackerDef.softAttack : attackerDef.hardAttack;
    const attackReference = targetUsesSoftAttack
      ? attackerProfile.softAttackReference
      : attackerProfile.hardAttackReference;
    const attackScalar = Math.max(0, attackStatValue / attackReference);
    const signatureMultipliers = {
      tiny: 0.7,
      small: 0.85,
      medium: 1.0,
      large: 1.15
    } as const;
    const signatureMultiplier = signatureMultipliers[
      defenderDef.combat.signature as keyof typeof signatureMultipliers
    ];
    const afterSignature = afterExperience * signatureMultiplier;

    // The core resolver applies the attack scalar before the AP-vs-armor scalar. Mirroring those
    // intermediate values here makes AT-gun previews show exactly how penetration and firepower combine.
    const afterAttackScalarDamagePerHit = preCommanderDamagePerHit * attackScalar;
    const penetrationMargin = effectiveAP - facingArmor;
    const penetrationScalar = facingArmor > 0
      ? penetrationMargin >= 0
        ? 1 + (penetrationMargin * 0.05)
        : Math.max(0.1, 1 + (penetrationMargin * 0.15))
      : 1;
    const afterPenetrationDamagePerHit = afterAttackScalarDamagePerHit * penetrationScalar;
    // Generate per-weapon breakdown for detailed UI display
    const weaponBreakdown = this.generateWeaponBreakdown(attackerDef, facingArmor, preview.result.shotBreakdown ?? null);
    const weaponStatsLine = `Accuracy base ${attackerDef.accuracyBase}% • ${attackStatLabel} ${attackStatValue} • Mixed weapon load (${weaponBreakdown.groups.length} systems)`;
    const penetrationMathLine = facingArmor > 0
      ? `Pen x${penetrationScalar.toFixed(2)} (AP ${effectiveAP} vs Armor ${facingArmor}, margin ${penetrationMargin >= 0 ? "+" : ""}${penetrationMargin})`
      : "Pen x1.00 (target has no armor)";

    const terrainDeltaText = `${terrainModifier >= 0 ? "+" : ""}${terrainModifier.toFixed(1)}%`;
    const commanderBonusPct = ((commanderAccuracyScalar - 1) * 100).toFixed(1);
    const experienceBonusPct = ((accuracyExperienceScalar - 1) * 100).toFixed(1);
    const accuracyBreakdownLine =
      `Range table ${rangeTableAccuracy.toFixed(1)}% x Unit accuracy x${unitAccuracyScalar.toFixed(2)} (${attackerDef.accuracyBase}/${attackerProfile.accuracyReference}) = ${baseAccuracyPercent.toFixed(1)}%, ` +
      `Base ${baseAccuracyPercent.toFixed(1)}% x Cmd +${commanderBonusPct}% = ${afterCommander.toFixed(1)}%, ` +
      `After Cmd ${afterCommander.toFixed(1)}% x Exp +${experienceBonusPct}% = ${afterExperience.toFixed(1)}%, ` +
      `After Exp ${afterExperience.toFixed(1)}% x Signature ${signatureMultiplier.toFixed(2)} (${defenderDef.combat.signature}) = ${afterSignature.toFixed(1)}% x Terrain ${terrainMultiplier.toFixed(2)} (${terrainDeltaText}) = ${afterTerrain.toFixed(1)}% x Spot ${spottedMultiplier.toFixed(2)} = ${finalPreClamp.toFixed(1)}% -> Final ${accuracyDetails.final.toFixed(1)}%`;

    const statusConversionLine =
      `Contact model ${baseDamagePerHit.toFixed(3)} x Exp x${damageExperienceScalar.toFixed(2)} = ${preCommanderDamagePerHit.toFixed(3)} x ${attackStatLabel} x${attackScalar.toFixed(2)} (${attackStatValue}/${attackReference}) = ${afterAttackScalarDamagePerHit.toFixed(3)} x ${penetrationMathLine} = ${afterPenetrationDamagePerHit.toFixed(3)} x Cmd x${commanderDamageScalar.toFixed(2)} = ${prePayloadDamagePerHit.toFixed(3)}; status effects come from per-weapon hit distributions and the target's current personnel/equipment pools`;
    const shotBreakdown = preview.result.shotBreakdown ?? null;
    const shotVolumeLine = shotBreakdown
      ? `${Math.round(shotBreakdown.theoreticalProfileShots)} theoretical shots x readiness ${shotBreakdown.strengthScalar.toFixed(2)} x posture ${shotBreakdown.postureScalar.toFixed(2)} x movement ${shotBreakdown.movementScalar.toFixed(2)} x suppression ${shotBreakdown.suppressionScalar.toFixed(2)} = ${shotBreakdown.final} shots`
      : "Fire volume is derived from weapon-model shot capacity scaled by readiness and firing posture.";

    const distance = Math.abs(attacker.q - defender.q) + Math.abs(attacker.r - defender.r) + Math.abs((-attacker.q - attacker.r) - (-defender.q - defender.r));
    const range = Math.floor(distance / 2);
    const attackerRangeMin = attackerDef?.rangeMin ?? 1;
    const attackerRangeMax = attackerDef?.rangeMax ?? 1;
    const realWorldDistanceMeters = range * 250;
    const realWorldDistanceKm = realWorldDistanceMeters >= 1000
      ? `${(realWorldDistanceMeters / 1000).toFixed(1)}km`
      : `${realWorldDistanceMeters}m`;
    const attackerRangeText = `${attackerRangeMin * 250}m-${attackerRangeMax >= 10 ? `${(attackerRangeMax * 0.25).toFixed(1)}km` : `${attackerRangeMax * 250}m`}`;

    const profile = this.describeAttackProfile(attackerUnit ?? preview.attacker, commandState);
    const roundedAccuracy = Math.round(finalAccuracyPercent);
    const penetrationSummary = facingArmor <= 0
      ? "Unarmored Target"
      : effectiveAP > facingArmor
        ? "Penetration Advantage"
        : effectiveAP === facingArmor
          ? "Armor Dampens Fire"
          : "Armor Holds";
    const projectedTargetDamage = preview.projectedDamage?.readinessLoss ?? postPayloadExpectedDamage;
    const projectedReturnFireDamage = preview.projectedRetaliationDamage?.readinessLoss ?? preview.expectedRetaliation;
    const projectedDefenderStrength = preview.projectedDamage?.strengthAfter ?? Math.max(0, defenderStrength - projectedTargetDamage);
    const projectedAttackerStrength = preview.projectedRetaliationDamage?.strengthAfter ?? Math.max(0, attackerStrength - projectedReturnFireDamage);
    const projectedTargetSummary = preview.projectedDamage?.summary ?? `${this.formatReadinessValue(projectedTargetDamage)}% readiness loss`;
    const projectedRetaliationSummary = preview.projectedRetaliationDamage?.summary ?? `${this.formatReadinessValue(projectedReturnFireDamage)}% readiness loss`;
    const targetPersonnelEffects = this.formatPersonnelDelta(preview.projectedDamage);
    const targetEquipmentEffects = this.formatEquipmentDelta(preview.projectedDamage);
    const targetComponentEffects = this.formatComponentDelta(preview.projectedDamage);
    const targetDamageTypes = this.formatDamageTypes(preview.projectedDamage);
    const lowLethalityNote = expectedHitsValue > 0 && projectedTargetDamage <= 0
      ? "Low-probability volley: suppression is likely, but confirmed losses are unlikely without more hits."
      : null;

    const accuracyToneClass = roundedAccuracy >= 75
      ? "attack-preview-outcome__value--good"
      : roundedAccuracy >= 50
        ? "attack-preview-outcome__value--warning"
        : "attack-preview-outcome__value--danger";
    const defenderDamageToneClass = projectedTargetDamage >= 20
      ? "attack-preview-outcome__value--good"
      : projectedTargetDamage >= 8
        ? "attack-preview-outcome__value--warning"
        : "attack-preview-outcome__value--neutral";
    const retaliationToneClass = !preview.retaliationPossible
      ? "attack-preview-outcome__value--muted"
      : projectedReturnFireDamage >= 15
        ? "attack-preview-outcome__value--danger"
        : projectedReturnFireDamage >= 6
          ? "attack-preview-outcome__value--warning"
          : "attack-preview-outcome__value--neutral";
    const retaliationValue = preview.retaliationPossible ? `${this.formatReadinessValue(projectedReturnFireDamage)}%` : "0.0%";
    const retaliationSummary = preview.retaliationPossible
      ? preview.retaliationNote
        ? `Projected attacker strength: ${this.formatReadinessValue(projectedAttackerStrength)}%. ${projectedRetaliationSummary}. ${preview.retaliationNote}`
        : `Projected attacker strength: ${this.formatReadinessValue(projectedAttackerStrength)}%. ${projectedRetaliationSummary}`
      : preview.retaliationNote ?? "No return fire expected.";
    const accuracySummary = supportsStances
      ? `${profile.title} stance selected.`
      : "Direct-fire calculation.";
    const summaryFootnote = supportsStances
      ? `Current stance: ${profile.title}. ${profile.note}`
      : "Direct fire profile. Non-foot formations use a single firing mode.";

    this.attackConfirmBody.innerHTML = `
      <div class="attack-preview-shell">
        <div class="attack-preview-rangebar">
          <span class="attack-preview-rangebar__label">Engagement Range</span>
          <strong class="attack-preview-rangebar__value">${realWorldDistanceKm}</strong>
        </div>

        <div class="attack-preview-matchup">
          <section class="attack-preview-card attack-preview-card--attacker">
            <span class="attack-preview-card__eyebrow">Attacker</span>
            <h3 class="attack-preview-card__title">Your ${this.escapeHtml(attackerLabel)}</h3>
            <p class="attack-preview-card__location">${this.escapeHtml(attackerHex)}</p>
            <div class="attack-preview-card__stats">
              <div class="attack-preview-stat">
                <span>Current strength</span>
                <strong>${this.formatReadinessValue(attackerStrength)}%</strong>
              </div>
              <div class="attack-preview-stat">
                <span>Effective range</span>
                <strong>${attackerRangeText}</strong>
              </div>
            </div>
          </section>

          <section class="attack-preview-card attack-preview-card--defender">
            <span class="attack-preview-card__eyebrow">Defender</span>
            <h3 class="attack-preview-card__title">Enemy ${this.escapeHtml(defenderLabel)}</h3>
            <p class="attack-preview-card__location">${this.escapeHtml(defenderHex)}</p>
            <div class="attack-preview-card__stats">
              <div class="attack-preview-stat">
                <span>Current strength</span>
                <strong>${this.formatReadinessValue(defenderStrength)}%</strong>
              </div>
              <div class="attack-preview-stat">
                <span>Armor</span>
                <strong>${facingArmor}</strong>
              </div>
            </div>
          </section>
        </div>

        <section class="attack-preview-outcome">
          <div class="attack-preview-outcome__header">
            <span class="attack-preview-outcome__eyebrow">Expected Outcome</span>
            <p class="attack-preview-outcome__summary">The core decision is how much damage you expect to deal and how much fire may come back.</p>
          </div>
          <div class="attack-preview-outcome__grid">
            <article class="attack-preview-outcome__metric">
              <span class="attack-preview-outcome__label">Target readiness loss</span>
              <strong class="attack-preview-outcome__value ${defenderDamageToneClass}">${this.formatReadinessValue(projectedTargetDamage)}%</strong>
              <span class="attack-preview-outcome__subtext">Projected defender strength: ${this.formatReadinessValue(projectedDefenderStrength)}%. ${this.escapeHtml(projectedTargetSummary)}</span>
            </article>

            <article class="attack-preview-outcome__metric">
              <span class="attack-preview-outcome__label">Return fire</span>
              <strong class="attack-preview-outcome__value ${retaliationToneClass}">${retaliationValue}</strong>
              <span class="attack-preview-outcome__subtext">${this.escapeHtml(retaliationSummary)}</span>
            </article>

            <article class="attack-preview-outcome__metric">
              <span class="attack-preview-outcome__label">Accuracy</span>
              <strong class="attack-preview-outcome__value ${accuracyToneClass}">${roundedAccuracy}%</strong>
              <span class="attack-preview-outcome__subtext">${this.escapeHtml(accuracySummary)}</span>
            </article>
          </div>
        </section>

        <p class="attack-preview-footnote">${this.escapeHtml(summaryFootnote)}</p>

        <details class="attack-preview-details"${detailsExpanded ? " open" : ""}>
          <summary>Detailed Breakdown</summary>
          <div class="attack-preview-details__content">
            <!-- Mode Toggle -->
            <div class="attack-preview-mode-toggle">
              <button type="button" class="attack-preview-mode-btn attack-preview-mode-btn--active" data-mode="player" onclick="this.closest('.attack-preview-details').querySelectorAll('.attack-preview-mode-content').forEach(el => el.hidden = el.dataset.mode !== 'player'); this.closest('.attack-preview-mode-toggle').querySelectorAll('.attack-preview-mode-btn').forEach(btn => btn.classList.toggle('attack-preview-mode-btn--active', btn.dataset.mode === 'player'));">
                <span class="mode-icon">👁️</span> Commander View
              </button>
              <button type="button" class="attack-preview-mode-btn" data-mode="dev" onclick="this.closest('.attack-preview-details').querySelectorAll('.attack-preview-mode-content').forEach(el => el.hidden = el.dataset.mode !== 'dev'); this.closest('.attack-preview-mode-toggle').querySelectorAll('.attack-preview-mode-btn').forEach(btn => btn.classList.toggle('attack-preview-mode-btn--active', btn.dataset.mode === 'dev'));">
                <span class="mode-icon">🔧</span> Technical Data
              </button>
            </div>

            <!-- Player-Facing Format (Default) -->
            <div class="attack-preview-mode-content" data-mode="player">
              <div class="combat-summary-card">
                <header class="combat-summary-header">
                  <h4 class="combat-summary-title">Combat Assessment</h4>
                  <span class="combat-summary-subtitle">${weaponBreakdown.groups.length} weapon systems engaged</span>
                </header>
                
                <div class="combat-metrics-grid">
                  <div class="combat-metric combat-metric--primary">
                    <span class="combat-metric__label">Fire Volume</span>
                    <strong class="combat-metric__value">${Number(shots).toLocaleString()}</strong>
                    <span class="combat-metric__unit">rounds</span>
                  </div>
                  <div class="combat-metric combat-metric--primary">
                    <span class="combat-metric__label">Expected Hits</span>
                    <strong class="combat-metric__value">${expectedHits}</strong>
                    <span class="combat-metric__unit">impacts</span>
                  </div>
                  <div class="combat-metric">
                    <span class="combat-metric__label">Personnel Effects</span>
                    <strong class="combat-metric__value combat-metric__value--text">${this.escapeHtml(targetPersonnelEffects)}</strong>
                  </div>
                  <div class="combat-metric">
                    <span class="combat-metric__label">Equipment Effects</span>
                    <strong class="combat-metric__value combat-metric__value--text">${this.escapeHtml(targetEquipmentEffects)}</strong>
                  </div>
                </div>
                ${lowLethalityNote ? `<p class="attack-preview-footnote">${this.escapeHtml(lowLethalityNote)}</p>` : ""}

                ${this.renderReadinessProjectionRows(preview.projectedDamage)}

                <div class="penetration-assessment">
                  <div class="penetration-bar">
                    <div class="penetration-fill" style="--penetration-width: ${Math.min(100, Math.max(0, (effectiveAP / Math.max(facingArmor, 1)) * 50))}%"></div>
                    <span class="penetration-label">Penetration: ${effectiveAP} AP vs ${facingArmor} Armor</span>
                    <span class="penetration-outcome">${penetrationSummary}</span>
                  </div>
                </div>

                <div class="weapon-loadout-summary">
                  <h5 class="weapon-loadout-title">Weapon Loadout</h5>
                  <div class="weapon-chips">
                    ${weaponBreakdown.groups.map(group => {
                      const margin = group.ap - facingArmor;
                      return `
                      <div class="weapon-chip weapon-chip--${margin > 5 ? 'advantage' : margin < -5 ? 'disadvantage' : 'neutral'}">
                        <span class="weapon-chip__name">${this.escapeHtml(group.name)}</span>
                        <span class="weapon-chip__stats">${group.shots}× AP${group.ap}</span>
                        ${margin !== 0 ? `<span class="weapon-chip__overmatch">${margin > 0 ? '+' : ''}${margin}</span>` : ''}
                      </div>
                    `;}).join('')}
                  </div>
                </div>

                <div class="combat-factors">
                  <h5 class="combat-factors-title">Combat Factors</h5>
                  <ul class="combat-factors-list">
                    <li class="combat-factor">
                      <span class="combat-factor__label">Range Table</span>
                      <span class="combat-factor__value">${baseAccuracyPercent.toFixed(1)}% base accuracy</span>
                    </li>
                    <li class="combat-factor">
                      <span class="combat-factor__label">Unit Proficiency</span>
                      <span class="combat-factor__value">${(unitAccuracyScalar * 100 - 100).toFixed(0)}% modifier</span>
                    </li>
                    ${commanderAccuracyBonus > 0 ? `
                    <li class="combat-factor combat-factor--bonus">
                      <span class="combat-factor__label">Command Direction</span>
                      <span class="combat-factor__value">+${commanderAccuracyBonus}% accuracy</span>
                    </li>
                    ` : ''}
                    ${commanderDamageBonus > 0 ? `
                    <li class="combat-factor combat-factor--bonus">
                      <span class="combat-factor__label">Command Focus</span>
                      <span class="combat-factor__value">+${commanderDamageBonus}% damage</span>
                    </li>
                    ` : ''}
                    <li class="combat-factor">
                      <span class="combat-factor__label">Final Accuracy</span>
                      <span class="combat-factor__value combat-factor__value--final">${roundedAccuracy}%</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            <!-- Dev/Test Format -->
            <div class="attack-preview-mode-content" data-mode="dev" hidden>
              <div class="attack-preview-detail-grid">
                <div class="attack-preview-detail-row">
                  <span>Shots</span>
                  <strong>${shots}</strong>
                </div>
                <div class="attack-preview-detail-row">
                  <span>Expected Hits</span>
                  <strong>${expectedHits}</strong>
                </div>
                <div class="attack-preview-detail-row">
                  <span>Readiness Loss</span>
                  <strong>${this.formatReadinessValue(projectedTargetDamage)}%</strong>
                </div>
                <div class="attack-preview-detail-row">
                  <span>Expected Suppression</span>
                  <strong>${postPayloadExpectedSuppression.toFixed(1)}</strong>
                </div>
                <div class="attack-preview-detail-row">
                  <span>Penetration</span>
                  <strong>${effectiveAP} vs ${facingArmor}</strong>
                </div>
                <div class="attack-preview-detail-row">
                  <span>Armor Outlook</span>
                  <strong>${penetrationSummary}</strong>
                </div>
                <div class="attack-preview-detail-row">
                  <span>Damage Types</span>
                  <strong>${this.escapeHtml(targetDamageTypes)}</strong>
                </div>
                <div class="attack-preview-detail-row">
                  <span>Components</span>
                  <strong>${this.escapeHtml(targetComponentEffects)}</strong>
                </div>
              </div>

              <div class="attack-preview-breakdown">
                <p><strong>Profile:</strong> ${this.escapeHtml(profile.description)}</p>
                <p><strong>Weapon Inputs:</strong> ${this.escapeHtml(weaponStatsLine)}</p>
                <p><strong>Shot Volume:</strong> ${this.escapeHtml(shotVolumeLine)}</p>
                <p><strong>Weapon Systems:</strong> ${this.escapeHtml(weaponBreakdown.summary)}</p>
                
                <div class="weapon-groups-detail">
                  <strong>Per-Weapon Breakdown:</strong>
                  ${weaponBreakdown.groups.map(group => `
                    <div class="weapon-group-item">
                      <span class="weapon-name">${this.escapeHtml(group.name)}:</span>
                      <span class="weapon-stats">${group.shots} shots, AP${group.ap}</span>
                      <span class="weapon-overmatch">${group.effectiveness}</span>
                    </div>
                  `).join('')}
                </div>
                
                <p><strong>Engagement Math:</strong> ${this.escapeHtml(profile.mathLine)}</p>
                <p><strong>Accuracy Math:</strong> ${this.escapeHtml(accuracyBreakdownLine)}</p>
                <p><strong>Status Conversion:</strong> ${this.escapeHtml(statusConversionLine)}</p>
                <p><strong>Commander Bonuses:</strong> Accuracy +${commanderAccuracyBonus}% • Damage +${commanderDamageBonus}%</p>
                <p><strong>Payload:</strong> x${damageMultiplier} (${this.escapeHtml(damageMultiplierDescription)}) • Suppression x${suppressionMultiplier} (${this.escapeHtml(suppressionMultiplierDescription)})</p>
                <p><strong>Projected Status Effects:</strong> ${this.escapeHtml(projectedTargetSummary)}</p>
                <p><strong>Personnel Effects:</strong> ${this.escapeHtml(targetPersonnelEffects)}</p>
                <p><strong>Equipment Effects:</strong> ${this.escapeHtml(targetEquipmentEffects)}</p>
                <p><strong>Component Effects:</strong> ${this.escapeHtml(targetComponentEffects)}</p>
                <p><strong>Damage Types:</strong> ${this.escapeHtml(targetDamageTypes)}</p>
                ${this.renderWeaponStatusEffects(preview.projectedDamage)}
                ${preview.retaliationPossible ? `<p><strong>Return Fire Projection:</strong> ${this.escapeHtml(projectedRetaliationSummary)}</p>` : ""}
                <p><strong>Expected Suppression:</strong> ${suppressionSummary}</p>
                ${preview.retaliationNote
                  ? `<p class="attack-preview-breakdown__note">${this.escapeHtml(preview.retaliationNote)}</p>`
                  : ""}
              </div>
            </div>
          </div>
        </details>
      </div>
    `;
    this.configureAttackStanceControls(attackerUnit ?? preview.attacker, commandState, attacker, defender);
    this.showAttackDialog();
  }

  private canUnitUseCombatStances(unit: ScenarioUnit): boolean {
    const definition = this.unitTypes?.[unit.type as keyof UnitTypeDictionary];
    if (!definition) {
      return false;
    }
    if (definition.moveType === "leg" && ["infantry", "recon", "specialist"].includes(definition.class)) {
      return true;
    }
    return unit.type === "Recon_Bike";
  }

  private canUnitAssault(
    unit: ScenarioUnit,
    commandState: UnitCommandState | null,
    attackerHex?: Axial,
    defenderHex?: Axial
  ): boolean {
    return (
      this.canUnitUseCombatStances(unit)
      && commandState?.suppressionState === "clear"
      && (!attackerHex || !defenderHex || hexDistance(attackerHex, defenderHex) <= 1)
    );
  }

  private isPinnedOrBrokenCommandState(commandState: UnitCommandState | null): boolean {
    return commandState?.suppressionState === "pinned" || commandState?.suppressionState === "broken";
  }

  private configureAttackStanceControls(
    attackerUnit: ScenarioUnit | null,
    commandState: UnitCommandState | null,
    attackerHex?: Axial,
    defenderHex?: Axial
  ): void {
    const selector = this.attackConfirmDialog?.querySelector<HTMLElement>(".attack-stance-selector");
    const fireAtWillBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceFireAtWill");
    const assaultBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceAssault");
    const suppressiveBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceSuppressive");
    if (!selector || !fireAtWillBtn || !assaultBtn || !suppressiveBtn) {
      return;
    }

    const supportsStances = attackerUnit ? this.canUnitUseCombatStances(attackerUnit) : false;
    selector.classList.toggle("attack-stance-selector--hidden", !supportsStances);
    if (!supportsStances) {
      this.currentAttackStance = null;
      fireAtWillBtn.disabled = true;
      assaultBtn.disabled = true;
      suppressiveBtn.disabled = true;
      this.updateStanceButtonStates();
      return;
    }

    const assaultAvailable = attackerUnit ? this.canUnitAssault(attackerUnit, commandState, attackerHex, defenderHex) : false;
    fireAtWillBtn.disabled = false;
    fireAtWillBtn.classList.remove("stance-disabled");
    assaultBtn.disabled = !assaultAvailable;
    assaultBtn.classList.toggle("stance-disabled", !assaultAvailable);
    suppressiveBtn.disabled = false;
    suppressiveBtn.classList.remove("stance-disabled");

    const assaultNote = assaultBtn.querySelector<HTMLElement>(".stance-note");
    if (assaultNote) {
      assaultNote.textContent = assaultAvailable
        ? "Adjacent attack. Resolves at point-blank range for the strongest hit chance."
        : attackerHex && defenderHex && hexDistance(attackerHex, defenderHex) > 1
          ? "Requires an adjacent target."
        : commandState?.suppressionState === "broken"
          ? "Blocked while broken."
          : commandState?.suppressionState === "pinned"
          ? "Blocked while pinned."
          : "Blocked while suppressed.";
    }

    this.bindStanceButtons();
    this.updateStanceButtonStates();
  }

  private describeAttackProfile(unit: ScenarioUnit, commandState: UnitCommandState | null): {
    title: string;
    description: string;
    note: string;
    mathLine: string;
  } {
    if (!this.canUnitUseCombatStances(unit)) {
      return {
        title: "Direct Fire",
        description: "This formation uses its standard direct-fire profile. Vehicles do not switch between assault and suppressing-fire orders.",
        note: "Accuracy reflects the normal range, terrain, and spotting calculation for this weapon system.",
        mathLine: "Standard direct-fire calculation. No assault multiplier is in effect."
      };
    }

    if (this.currentAttackStance === "assault") {
      return {
        title: "Assault",
        description: "The battalion attacks an adjacent target at point-blank range and trades protection for a much better chance to hit.",
        note: "Assault resolves at point-blank range, so the battalion benefits from the short-range accuracy curve instead of a separate hit multiplier.",
        mathLine: "Point-blank range uses the 25m midpoint, then runs the standard range, terrain, and spotting math."
      };
    }

    if (this.currentAttackStance === "suppressive") {
      const suppressionNote = commandState?.suppressionState === "broken"
        ? "Broken formations are below 25 readiness under heavy suppression and cannot move, retaliate, or initiate assault fire."
        : commandState?.suppressionState === "pinned"
          ? "Pinned formations cannot move, retaliate, or initiate assault fire until the pin is broken."
        : commandState?.suppressionState === "suppressed"
          ? "Suppressed formations may still move and fire, but assault is unavailable this turn."
          : "Suppressing fire doubles suppression output and ammunition cost without changing shot volume or accuracy.";

      return {
        title: "Suppressing Fire",
        description: "The battalion stays in ranged posture and prioritizes disruption without reducing its normal shot volume or accuracy.",
        note: suppressionNote,
        mathLine: "Standard range calculation. Readiness damage is unchanged; packet suppression is doubled and ammo cost is doubled."
      };
    }

    return {
      title: "Fire at Will",
      description: "The formation uses its normal direct-fire profile against the selected target.",
      note: "Standard attack order. Shots, accuracy, damage, suppression, and ammo cost use the baseline fire profile.",
      mathLine: "Standard range calculation. No assault range override or suppression surcharge is in effect."
    };
  }

  /** Handles air:previewRange and paints a temporary overlay of hexes within the aircraft's radius. */
  private handleAirPreviewRange(event: CustomEvent<{ origin: Axial; radius: number }>): void {
    if (!this.hexMapRenderer) return;
    const { origin, radius } = event.detail ?? { origin: null, radius: 0 } as any;
    if (!origin || typeof radius !== "number" || radius <= 0) return;
    const keys: string[] = [];
    for (let col = 0; col < this.scenario.size.cols; col += 1) {
      for (let row = 0; row < this.scenario.size.rows; row += 1) {
        const candidateAx = CoordinateSystem.offsetToAxial(col, row);
        const dist = hexDistance(origin, candidateAx);
        if (dist <= radius) {
          keys.push(CoordinateSystem.makeHexKey(col, row));
        }
      }
    }
    this.airPreviewKeys = new Set(keys);
    this.hexMapRenderer.setZoneHighlights(this.airPreviewKeys);
  }

  /** Clears the temporary Air Support preview overlay. */
  private clearAirPreviewOverlay(): void {
    if (!this.hexMapRenderer) return;
    if (this.airPreviewKeys.size > 0) {
      this.airPreviewKeys.clear();
      this.hexMapRenderer.setZoneHighlights([]);
    }
  }

  private clearArtilleryPreviewOverlay(): void {
    if (!this.hexMapRenderer) {
      return;
    }
    if (this.artilleryPreviewKeys.size > 0) {
      this.artilleryPreviewKeys.clear();
      this.hexMapRenderer.setZoneHighlights([]);
    }
  }

  private syncQueuedTargetMarkers(): void {
    if (!this.hexMapRenderer || !this.battleState.hasEngine()) {
      return;
    }

    const engine = this.battleState.ensureGameEngine();
    const markers: BattleTargetMarker[] = [];
    this.queuedTargetMarkerActions.clear();

    engine.getSupportSnapshot().queued
      .filter((asset) => asset.type === "artillery" && asset.queuedHex && asset.queuedByHex)
      .forEach((asset) => {
        const targetHexKey = this.parseAxialKeyToOffsetHexKey(asset.queuedHex);
        const callerHexKey = asset.queuedByHex;
        if (!targetHexKey || !callerHexKey) {
          return;
        }
        const markerId = `support:${asset.id}`;
        const callerLabel = this.resolveUnitLabelForHex(callerHexKey) ?? "Selected unit";
        markers.push({
          id: markerId,
          hexKey: targetHexKey,
          icon: "crosshair",
          accentColor: "#d7263d",
          tooltip: `Heavy artillery queued on ${targetHexKey}. Click to cancel and reposition.`,
          interactive: true
        });
        this.queuedTargetMarkerActions.set(markerId, {
          type: "artillery",
          assetId: asset.id,
          callerHexKey,
          callerLabel,
          targetHexKey
        });
      });

    engine.getScheduledAirMissions("Player")
      .filter((mission) => mission.status === "queued" && (mission.kind === "strike" || mission.kind === "airTransport") && mission.targetHex)
      .forEach((mission) => {
        if (!mission.targetHex) {
          return;
        }
        const missionKind = mission.kind === "strike" ? "strike" : "airTransport";
        const targetHexKey = this.axialToHexKey(mission.targetHex);
        const markerId = `air:${mission.id}`;
        const missionLabel = missionKind === "strike" ? "Bombing mission" : "Paratrooper drop";
        markers.push({
          id: markerId,
          hexKey: targetHexKey,
          icon: missionKind === "strike" ? "crosshair" : "parachute",
          accentColor: missionKind === "strike" ? "#d7263d" : "#f4f1e8",
          tooltip: `${missionLabel} queued on ${targetHexKey}. Click to cancel.`,
          interactive: true
        });
        this.queuedTargetMarkerActions.set(markerId, {
          type: "airMission",
          missionId: mission.id,
          missionKind,
          targetHexKey
        });
      });

    this.hexMapRenderer.syncQueuedTargetMarkers(markers);
  }

  private axialToHexKey(axial: Axial): string {
    const { col, row } = CoordinateSystem.axialToOffset(axial.q, axial.r);
    return CoordinateSystem.makeHexKey(col, row);
  }

  private parseAxialKeyToOffsetHexKey(hexKey: string | null): string | null {
    if (!hexKey) {
      return null;
    }
    const parts = hexKey.split(",").map((value) => Number(value.trim()));
    if (parts.length !== 2 || !Number.isFinite(parts[0]) || !Number.isFinite(parts[1])) {
      return null;
    }
    return this.axialToHexKey({ q: parts[0], r: parts[1] });
  }

  private getQueuedArtilleryForCallerHex(hexKey: string): SupportAssetSnapshot | null {
    if (!this.battleState.hasEngine()) {
      return null;
    }
    return this.battleState.ensureGameEngine().getSupportSnapshot().queued.find(
      (asset) => asset.type === "artillery" && asset.queuedByHex === hexKey
    ) ?? null;
  }

  private restartQueuedArtilleryTargeting(callerHexKey: string, callerLabel: string, assetId?: string): boolean {
    const unit = this.resolvePlayerUnitSnapshot(callerHexKey);
    if (!unit) {
      this.applySelectedHex(callerHexKey);
      return false;
    }
    const parsed = CoordinateSystem.parseHexKey(callerHexKey);
    if (!parsed) {
      return false;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const commandState = this.battleState.ensureGameEngine().getUnitCommandState(axial);
    const artilleryState = this.resolveArtilleryActionState(unit, commandState, callerHexKey);
    const readyAssetId = assetId ?? artilleryState.assetId;
    this.applySelectedHex(callerHexKey);
    if (!artilleryState.available || !readyAssetId) {
      this.announceBattleUpdate(artilleryState.reason ?? `${callerLabel} cannot retask heavy artillery right now.`);
      return false;
    }
    this.beginArtilleryTargeting(callerHexKey, callerLabel, unit.unitId ?? null, readyAssetId, artilleryState.targetHexKeys);
    return true;
  }

  private cancelQueuedArtilleryStrike(assetId: string, callerHexKey: string, callerLabel: string, targetHexKey: string): void {
    const engine = this.battleState.ensureGameEngine();
    const canceled = engine.cancelQueuedSupport(assetId);
    this.syncQueuedTargetMarkers();
    if (!canceled) {
      this.announceBattleUpdate("Heavy artillery cancellation failed. The queued mission may have already resolved.");
      return;
    }
    this.publishActivityEvent({
      category: "player",
      type: "log",
      summary: `${callerLabel} canceled heavy artillery on ${targetHexKey}.`
    });
    this.battleState.emitBattleUpdate("manual");
    this.restartQueuedArtilleryTargeting(callerHexKey, callerLabel, assetId);
  }

  private cancelQueuedAirMission(missionId: string, missionKind: "strike" | "airTransport", targetHexKey: string): void {
    const engine = this.battleState.ensureGameEngine();
    const canceled = engine.cancelQueuedAirMission(missionId);
    this.syncQueuedTargetMarkers();
    if (!canceled) {
      this.announceBattleUpdate("That queued air mission is no longer available to cancel.");
      return;
    }
    const missionLabel = missionKind === "strike" ? "Bombing mission" : "Paratrooper drop";
    const summary = `${missionLabel} on ${targetHexKey} canceled. Queue another mission when ready.`;
    this.announceBattleUpdate(summary);
    this.publishActivityEvent({
      category: "player",
      type: "log",
      summary
    });
    this.battleState.emitBattleUpdate("missionUpdated");
  }

  private handleQueuedTargetMarkerClick(event: CustomEvent<{ markerId: string }>): void {
    const markerId = event.detail?.markerId ?? "";
    if (!markerId) {
      return;
    }
    const action = this.queuedTargetMarkerActions.get(markerId);
    if (!action) {
      return;
    }
    if (action.type === "artillery") {
      this.cancelQueuedArtilleryStrike(action.assetId, action.callerHexKey, action.callerLabel, action.targetHexKey);
      return;
    }
    this.cancelQueuedAirMission(action.missionId, action.missionKind, action.targetHexKey);
  }

  private canUnitObserveArtillery(unit: ScenarioUnit): boolean {
    const definition = this.unitTypes[unit.type as keyof UnitTypeDictionary];
    if (!definition) {
      return false;
    }
    return definition.class === "infantry"
      || definition.class === "recon"
      || (definition.class === "specialist" && definition.moveType === "leg");
  }

  private resolveArtilleryTargetHexKeys(unit: ScenarioUnit, hexKey: string): string[] {
    const parsed = CoordinateSystem.parseHexKey(hexKey);
    if (!parsed) {
      return [];
    }
    const callerAxial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const definition = this.unitTypes[unit.type as keyof UnitTypeDictionary];
    if (!definition) {
      return [];
    }
    const engine = this.battleState.ensureGameEngine();
    const currentTurn = engine.getTurnSummary().turnNumber;
    const observationRange = Math.max(2, (definition.vision ?? 0) + (definition.class === "recon" ? 1 : 0));
    const targetHexKeys = new Set<string>();
    engine.getEnemyContactSnapshot().forEach((contact) => {
      if (contact.lastSeenTurn !== currentTurn || contact.state === "spotted") {
        return;
      }
      if (hexDistance(callerAxial, contact.hex) > observationRange) {
        return;
      }
      const offset = CoordinateSystem.axialToOffset(contact.hex.q, contact.hex.r);
      targetHexKeys.add(CoordinateSystem.makeHexKey(offset.col, offset.row));
    });
    return Array.from(targetHexKeys);
  }

  private resolveArtilleryActionState(
    unit: ScenarioUnit,
    commandState: UnitCommandState | null,
    hexKey: string
  ): { available: boolean; reason: string | null; assetId: string | null; targetHexKeys: string[] } {
    if (!commandState || commandState.isAutomated || !this.canUnitObserveArtillery(unit)) {
      return { available: false, reason: null, assetId: null, targetHexKeys: [] };
    }
    if (this.isPinnedOrBrokenCommandState(commandState)) {
      const label = commandState.suppressionState === "broken" ? "Broken" : "Pinned";
      return {
        available: false,
        reason: `${label} battalions cannot adjust heavy artillery fire until the suppression is broken.`,
        assetId: null,
        targetHexKeys: []
      };
    }
    const engine = this.battleState.ensureGameEngine();
    const supportSnapshot = engine.getSupportSnapshot();
    const readyAsset = supportSnapshot.ready.find((asset) => asset.type === "artillery" && asset.charges > 0) ?? null;
    if (!readyAsset) {
      const queuedAsset = supportSnapshot.queued.find((asset) => asset.type === "artillery") ?? null;
      return {
        available: false,
        reason: queuedAsset
          ? `${queuedAsset.label} is already tasked.`
          : "No heavy artillery battery is available for this mission.",
        assetId: null,
        targetHexKeys: []
      };
    }
    const targetHexKeys = this.resolveArtilleryTargetHexKeys(unit, hexKey);
    if (targetHexKeys.length === 0) {
      return {
        available: false,
        reason: "No observed enemy hex is close enough to adjust heavy artillery fire.",
        assetId: readyAsset.id,
        targetHexKeys
      };
    }
    return {
      available: true,
      reason: null,
      assetId: readyAsset.id,
      targetHexKeys
    };
  }

  private promptSmokeMode(callerAxial: Axial, callerLabel: string, callerUnitId: string | null): void {
    const engine = this.battleState.ensureGameEngine();
    const targetHexKeys = engine.resolveSmokeTargetHexKeys(callerAxial, callerUnitId ?? undefined)
      .map((key) => CoordinateSystem.axialKeyToOffsetKey(key))
      .filter((key): key is string => key !== null);
    const offset = CoordinateSystem.axialToOffset(callerAxial.q, callerAxial.r);
    const callerHexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
    // If the unit can only reach its own hex (range 0 effective), skip the mode prompt and go straight to own-hex facing.
    if (targetHexKeys.length === 0) {
      this.promptFortificationFacing(callerAxial, callerLabel, callerUnitId, "smoke");
      return;
    }
    // Present two choices inline via a transient announcement prompt.
    this.announceBattleUpdate(
      `${callerLabel}: Pop smoke on your own position (click your hex again) or select a target hex to fire smoke rounds.`
    );
    this.beginSmokeTargeting(callerHexKey, callerAxial, callerLabel, callerUnitId, targetHexKeys);
  }

  private beginSmokeTargeting(
    callerHexKey: string,
    callerAxial: Axial,
    callerLabel: string,
    callerUnitId: string | null,
    targetHexKeys: readonly string[]
  ): void {
    this.closeSelectionIntelForAnimation();
    this.smokeTargetingState = {
      callerHexKey,
      callerAxial,
      callerLabel,
      callerUnitId,
      targetHexKeys: new Set(targetHexKeys)
    };
    // Highlight the in-range hexes using the same zone-highlight infrastructure as artillery.
    const highlights = new Set(targetHexKeys);
    highlights.add(callerHexKey);
    this.hexMapRenderer?.setZoneHighlights(highlights);
    if (ensureTutorialState().getCurrentPhase() === "smoke_demo") {
      this.queueTutorialCameraForPhase("smoke_demo", highlights, TUTORIAL_ORDER_CAMERA_ZOOM);
    }
  }

  private cancelSmokeTargeting(restoreSelection = true): void {
    if (!this.smokeTargetingState) {
      return;
    }
    const callerHexKey = this.smokeTargetingState.callerHexKey;
    this.smokeTargetingState = null;
    this.hexMapRenderer?.setZoneHighlights(new Set());
    if (restoreSelection) {
      this.applySelectedHex(callerHexKey);
    }
  }

  private executeSmokeOnTargetHex(targetHexKey: string): void {
    const state = this.smokeTargetingState;
    if (!state) {
      return;
    }
    const targetParsed = CoordinateSystem.parseHexKey(targetHexKey);
    if (!targetParsed) {
      this.cancelSmokeTargeting(true);
      return;
    }
    const targetAxial = CoordinateSystem.offsetToAxial(targetParsed.col, targetParsed.row);
    this.cancelSmokeTargeting(false);
    // Show the edge-facing dialog for the chosen target hex.
    this.pendingFortificationBuild = {
      hex: targetAxial,
      hexKey: targetHexKey,
      unitLabel: state.callerLabel,
      unitId: state.callerUnitId,
      modificationType: "smoke",
      callerAxial: state.callerAxial
    };
    this.renderFortificationFacingPreview();
    this.showFortificationFacingDialog();
  }

  private beginArtilleryTargeting(
    callerHexKey: string,
    callerLabel: string,
    callerUnitId: string | null,
    assetId: string,
    targetHexKeys: readonly string[]
  ): void {
    this.closeSelectionIntelForAnimation();
    this.artilleryTargetingState = {
      callerHexKey,
      callerLabel,
      callerUnitId,
      assetId,
      targetHexKeys: new Set(targetHexKeys)
    };
    this.artilleryPreviewKeys = new Set(targetHexKeys);
    this.hexMapRenderer?.setZoneHighlights(this.artilleryPreviewKeys);
    if (ensureTutorialState().getCurrentPhase() === "artillery_intro") {
      this.queueTutorialCameraForPhase(
        "artillery_intro",
        [callerHexKey, ...targetHexKeys],
        TUTORIAL_ORDER_CAMERA_ZOOM
      );
    }
    this.announceBattleUpdate(`${callerLabel} is spotting for heavy artillery. Select an observed enemy hex.`);
  }

  private cancelArtilleryTargeting(restoreSelection = true): void {
    if (!this.artilleryTargetingState) {
      return;
    }
    this.artilleryTargetingState = null;
    this.clearArtilleryPreviewOverlay();
    if (restoreSelection && this.selectedHexKey) {
      this.applySelectedHex(this.selectedHexKey);
    }
  }

  private async executeQueuedArtilleryStrike(targetHexKey: string): Promise<void> {
    const targetingState = this.artilleryTargetingState;
    if (!targetingState) {
      return;
    }
    const callerParsed = CoordinateSystem.parseHexKey(targetingState.callerHexKey);
    const targetParsed = CoordinateSystem.parseHexKey(targetHexKey);
    if (!callerParsed || !targetParsed) {
      this.cancelArtilleryTargeting(true);
      return;
    }
    const callerAxial = CoordinateSystem.offsetToAxial(callerParsed.col, callerParsed.row);
    const targetAxial = CoordinateSystem.offsetToAxial(targetParsed.col, targetParsed.row);
    const engine = this.battleState.ensureGameEngine();
    const queued = engine.queueSupportActionFromUnit(callerAxial, targetingState.assetId, targetAxial);
    this.cancelArtilleryTargeting(false);
    if (!queued) {
      this.applySelectedHex(targetingState.callerHexKey);
      this.announceBattleUpdate("Heavy artillery could not be queued. Keep the caller uncommitted and select an observed enemy hex.");
      return;
    }
    this.clearSelectedHexAfterAction();
    this.syncQueuedTargetMarkers();
    const summary = `${targetingState.callerLabel} requested heavy artillery on ${targetHexKey}. Impact scheduled for turn transition. Click the red crosshair to cancel and reposition.`;
    this.announceBattleUpdate(summary);
    this.publishActivityEvent({
      category: "player",
      type: "log",
      summary
    });
    this.completeTutorialPhase("artillery_intro");
    this.battleState.emitBattleUpdate("manual");
    this.completeInitiativeActivationAfterPlayerOrder(targetingState.callerUnitId);
  }

  private async triggerSupportImpacts(): Promise<void> {
    console.log("[BattleScreen] triggerSupportImpacts called");
    const impacts = this.battleState.ensureGameEngine().consumeSupportImpactEvents();
    console.log("[BattleScreen] consumeSupportImpactEvents returned", impacts.length, "impact(s):", impacts);
    if (impacts.length === 0) {
      console.log("[BattleScreen] No support impacts to trigger, returning early");
      return;
    }
    await this.playSupportImpacts(impacts);
  }

  private async playSupportImpacts(impacts: readonly SupportImpactEvent[]): Promise<void> {
    console.log("[BattleScreen] playSupportImpacts called with", impacts.length, "impact(s):", impacts);
    const renderer = this.hexMapRenderer;
    if (!renderer) {
      console.warn("[BattleScreen] playSupportImpacts: No renderer available");
      return;
    }

    this.closeSelectionIntelForAnimation();

    // Freeze camera movement during effects
    this.freezeCamera();

    const engine = this.battleState.ensureGameEngine();
    let lastFocusedHexKey: string | null = null;
    for (let index = 0; index < impacts.length; index += 1) {
      const impact = impacts[index];
      const offset = CoordinateSystem.axialToOffset(impact.targetHex.q, impact.targetHex.r);
      const targetHexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
      const targetClass = impact.targetUnitType
        ? this.unitTypes[impact.targetUnitType as keyof UnitTypeDictionary]?.class as UnitClass | undefined
        : undefined;

      if (lastFocusedHexKey !== targetHexKey) {
        console.log("[BattleScreen] Focusing camera on support impact hex:", targetHexKey);
        await this.focusCameraOnHex(targetHexKey);
        await new Promise<void>((resolve) => window.setTimeout(resolve, lastFocusedHexKey ? 220 : 320));
        lastFocusedHexKey = targetHexKey;
      }

      console.log("[BattleScreen] Playing artillery barrage for impact at hex:", targetHexKey, impact);
      await renderer.playArtillerySupportImpact(targetHexKey, targetClass);

      if (impact.hit && impact.destroyed) {
        renderer.markHexWrecked(targetHexKey, targetClass, 1);
      } else if (impact.hit) {
        const defenderNow = engine.botUnits.find((unit) => unit.hex.q === impact.targetHex.q && unit.hex.r === impact.targetHex.r) ?? null;
        renderer.markHexDamaged(targetHexKey, targetClass, defenderNow?.strength, 2);
      }
      this.renderEngineUnits();
      const summary = impact.hit
        ? `${impact.label} struck ${targetHexKey}, dealing ${impact.damage} damage${impact.destroyed ? " and destroying the target" : ""}.`
        : `${impact.label} landed on ${targetHexKey}, but the target had already moved.`;
      this.announceBattleUpdate(summary);
      this.publishActivityEvent({
        category: "player",
        type: "log",
        summary
      });

      if (index < impacts.length - 1) {
        await new Promise<void>((resolve) => window.setTimeout(resolve, 180));
      }
    }
    
    // Unfreeze camera after all effects complete
    this.unfreezeCamera();
  }

  /** Updates the Air HUD widget with current air support statistics. */
  private updateAirHudWidget(): void {
    try {
      const engine = this.battleState.ensureGameEngine();
      const s = engine.getAirSupportSummary();
      const el = document.getElementById("airHudWidget");
      if (!el) return;
      const setText = (id: string, v: number) => {
        const n = el.querySelector<HTMLElement>(`[data-airhud-${id}]`);
        if (n) n.textContent = String(v);
      };
      setText("queued", s.queued);
      setText("inflight", s.inFlight);
      setText("resolving", s.resolving);
      setText("completed", s.completed);
      setText("refit", s.refit);
      const openBtn = el.querySelector<HTMLButtonElement>("[data-airhud-open]");
      if (openBtn) {
        openBtn.onclick = () => this.popupManager.openPopup("airSupport");
      }
    } catch {
      /* no-op */
    }
  }

  /** Publishes new air mission reports to the activity log. Idempotent via a local seen-id set. */
  private syncAirMissionLogs(): void {
    try {
      const engine = this.battleState.ensureGameEngine();
      const reports = engine.getAirMissionReports();
      const linkedStrikeUnitKeys = new Set(
        reports
          .filter((entry) => entry.kind === "strike" && entry.event !== "refitStarted" && entry.event !== "refitCompleted")
          .map((entry) => entry.unitKey)
      );

      // Collect escort information for each strike
      const linkedEscortsByBomberKey = new Map<string, Array<(typeof reports)[number]>>();
      for (const report of reports) {
        if (
          report.kind === "escort"
          && report.escortTargetUnitKey
          && linkedStrikeUnitKeys.has(report.escortTargetUnitKey)
          && report.outcome?.result !== "aborted"
        ) {
          const escorts = linkedEscortsByBomberKey.get(report.escortTargetUnitKey) ?? [];
          escorts.push(report);
          linkedEscortsByBomberKey.set(report.escortTargetUnitKey, escorts);
        }
      }

      for (const r of reports) {
        if (this.seenAirReportIds.has(r.id)) {
          continue;
        }
        this.seenAirReportIds.add(r.id);
        const outcomeMeta = r.outcome?.meta ?? {};
        const reportShowsCombatDetails =
          (r.interceptions ?? 0) > 0
          || Math.max(0, Math.round(outcomeMeta.bomberAttrition ?? r.bomberAttrition ?? 0)) > 0
          || Math.max(0, Math.round(outcomeMeta.interceptorAttrition ?? r.interceptorAttrition ?? 0)) > 0
          || Math.max(0, Math.round(outcomeMeta.escortAttrition ?? r.escortAttrition ?? 0)) > 0
          || Math.max(0, Math.round(outcomeMeta.interceptorKills ?? outcomeMeta.capKills ?? 0)) > 0
          || Math.max(0, Math.round(outcomeMeta.escortKills ?? 0)) > 0;
        const isLinkedEscortReport =
          r.kind === "escort"
          && !!r.escortTargetUnitKey
          && linkedStrikeUnitKeys.has(r.escortTargetUnitKey);
        const shouldFoldIntoDetailedCombatLog =
          r.event !== "refitStarted"
          && r.event !== "refitCompleted"
          && (r.kind === "escort" || r.kind === "airCover")
          && reportShowsCombatDetails
          && this.hasDetailedAirCombatPublished(r.turnResolved, r.unitKey);
        if (isLinkedEscortReport || shouldFoldIntoDetailedCombatLog) {
          continue;
        }
        const missionLabel = this.formatAirCombatantSummary(r.unitLabel, r.unitKey, r.unitType, r.faction, engine);
        const factionLabel = this.formatAirFactionLabel(r.faction);
        let target = "-";
        if (r.targetHex) {
          target = this.formatAxialHexForDisplay(r.targetHex);
        } else if (r.kind === "airCover") {
          target = "Base CAP";
        } else if (r.escortTargetUnitKey) {
          target = r.escortTargetLabel ?? this.resolveAirSquadronLabel(r.escortTargetUnitKey, r.faction, engine);
        }
        let action = "resolved";
        if (r.event === "refitStarted") action = "refit started";
        else if (r.event === "refitCompleted") action = "refit completed";

        // Build outcome summary for resolved missions
        let outcomeSummary = "";
        if (r.event !== "refitStarted" && r.event !== "refitCompleted" && r.outcome) {
          const outcome = r.outcome as {
            result?: string;
            details?: string;
            damageInflicted?: number;
            defenderDestroyed?: boolean;
            meta?: {
              bomberAttrition?: number;
              interceptorAttrition?: number;
              interceptorKills?: number;
              escortAttrition?: number;
              escortKills?: number;
              capKills?: number;
              };
          };
          const localOutcomeMeta = outcome.meta ?? {};
          const bomberAttrition = Math.max(0, Math.round(localOutcomeMeta.bomberAttrition ?? r.bomberAttrition ?? 0));
          const interceptorAttrition = Math.max(0, Math.round(localOutcomeMeta.interceptorAttrition ?? r.interceptorAttrition ?? 0));
          const interceptorKills = Math.max(0, Math.round(localOutcomeMeta.interceptorKills ?? 0));
          const escortAttrition = Math.max(0, Math.round(localOutcomeMeta.escortAttrition ?? r.escortAttrition ?? 0));
          const escortKills = Math.max(0, Math.round(localOutcomeMeta.escortKills ?? 0));
          const strikePackageKills = Math.max(0, Math.round(localOutcomeMeta.capKills ?? (r.kind === "airCover" ? r.kills?.cap ?? 0 : 0)));
          const destroyedBeforeTarget =
            r.kind === "strike"
              && outcome.result === "destroyed"
              && !outcome.defenderDestroyed
              && !(typeof outcome.damageInflicted === "number" && outcome.damageInflicted > 0);
          if (destroyedBeforeTarget) {
            action = "destroyed before target";
            outcomeSummary = "";
          } else {
            outcomeSummary = outcome.result ? ` [${outcome.result.toUpperCase()}]` : "";
          }
          const detailFragments: string[] = [];

          if (outcome.defenderDestroyed) {
            detailFragments.push("Target destroyed!");
          } else if (typeof outcome.damageInflicted === "number" && outcome.damageInflicted > 0) {
            detailFragments.push(`${outcome.damageInflicted} damage dealt`);
          }

          if (r.kind === "escort") {
            if (interceptorAttrition > 0) {
              detailFragments.push(`${interceptorAttrition} damage to interceptors`);
            }
            if (interceptorKills > 0) {
              detailFragments.push(`${interceptorKills} interceptor${interceptorKills === 1 ? "" : "s"} destroyed`);
            }
            if (escortAttrition > 0) {
              detailFragments.push(`escort took ${escortAttrition} air damage`);
            }
            if (escortKills > 0) {
              detailFragments.push(`${escortKills} escort flight${escortKills === 1 ? "" : "s"} lost`);
            }
          } else if (r.kind === "airCover") {
            if (bomberAttrition > 0) {
              detailFragments.push(`${bomberAttrition} damage to strike package`);
            }
            if (strikePackageKills > 0) {
              detailFragments.push("strike package destroyed");
            }
            if (escortAttrition > 0) {
              detailFragments.push(`escorts took ${escortAttrition} air damage`);
            }
            if (interceptorAttrition > 0) {
              detailFragments.push(`patrol took ${interceptorAttrition} air damage`);
            }
          }

          if (detailFragments.length > 0) {
            outcomeSummary += ` — ${detailFragments.join("; ")}`;
          }
        }

        const details: Record<string, unknown> = {};
        if (r.kills?.escorts || r.kills?.cap) {
          details.killsEscorts = r.kills.escorts ?? 0;
          details.killsCap = r.kills.cap ?? 0;
        }
        if (typeof r.bomberAttrition === "number") {
          details.bomberAttrition = r.bomberAttrition;
        }
        if (typeof r.interceptorAttrition === "number" && r.interceptorAttrition > 0) {
          details.interceptorAttrition = r.interceptorAttrition;
        }
        if (typeof r.escortAttrition === "number" && r.escortAttrition > 0) {
          details.escortAttrition = r.escortAttrition;
        }
        if (typeof r.interceptions === "number" && r.interceptions > 0) {
          details.interceptions = r.interceptions;
        }
        if (r.outcome) {
          details.outcomeDetails = (r.outcome as { details?: string }).details;
        }

        // Add escort information for strike missions
        let escortNote = "";
        if (r.kind === "strike") {
          const linkedEscorts = linkedEscortsByBomberKey.get(r.unitKey) ?? [];
          if (linkedEscorts.length > 0) {
            const escortLabels = linkedEscorts.map((escortReport) =>
              this.formatAirCombatantSummary(
                escortReport.unitLabel,
                escortReport.unitKey,
                escortReport.unitType,
                escortReport.faction,
                engine
              )
            );
            escortNote =
              escortLabels.length > 0
                ? ` escorted by ${escortLabels.join(", ")}`
                : ` escorted by ${linkedEscorts.length} fighter${linkedEscorts.length === 1 ? "" : "s"}`;
            details.escortCount = linkedEscorts.length;
            details.escortLabels = escortLabels;
          }
        }

        const summary =
          r.kind === "strike"
            ? (() => {
                const outcome = r.outcome as { details?: string; result?: string; damageInflicted?: number; defenderDestroyed?: boolean } | undefined;
                const strikeCause = this.inferStrikeOutcomeCause(outcome?.details);
                const resultSuffix =
                  action === "destroyed before target"
                    ? ""
                    : outcome?.result
                      ? ` [${outcome.result.toUpperCase()}]`
                      : "";
                if (action === "destroyed before target") {
                  const causeText =
                    strikeCause === "flak"
                      ? `was destroyed by flak before reaching ${target}`
                      : strikeCause === "intercepted"
                        ? `was intercepted before reaching ${target}`
                        : `was destroyed before reaching ${target}`;
                  return `Strike outcome: ${factionLabel} strike package ${missionLabel}${escortNote} ${causeText}.`;
                }
                if (outcome?.defenderDestroyed) {
                  return `Strike outcome: ${factionLabel} strike package ${missionLabel}${escortNote} destroyed the target at ${target}${resultSuffix}.`;
                }
                if (typeof outcome?.damageInflicted === "number" && outcome.damageInflicted > 0) {
                  return `Strike outcome: ${factionLabel} strike package ${missionLabel}${escortNote} hit ${target} for ${outcome.damageInflicted} damage${resultSuffix}.`;
                }
                if (action === "resolved") {
                  return `Strike outcome: ${factionLabel} strike package ${missionLabel}${escortNote} reached ${target}${resultSuffix}.`;
                }
                return `Strike outcome: ${factionLabel} strike package ${missionLabel}${escortNote} ${action} ${target}${resultSuffix}.`;
              })()
            : r.kind === "airCover"
              ? `${factionLabel} CAP mission ${missionLabel} ${action} — station ${target}${outcomeSummary}`
              : r.kind === "escort"
                ? `${factionLabel} escort mission ${missionLabel} ${action} — covering ${target}${outcomeSummary}`
                : `${factionLabel} air mission ${r.kind} ${missionLabel} ${action}${escortNote} — target ${target}${outcomeSummary}`;

        this.publishActivityEvent({
          category: r.faction === "Player" ? "player" : "enemy",
          type: "log",
          summary,
          details
        });
      }
    } catch {
      /* no-op */
    }
  }

  private flushDeferredMissionLogSync(): void {
    this.deferMissionLogSync = false;
    if (!this.pendingMissionLogSync) {
      return;
    }
    this.pendingMissionLogSync = false;
    this.syncAirMissionLogs();
  }

  /**
   * Confirms the pending attack and resolves it via the game engine. Dialog closes on completion.
   */
  private async handleConfirmAttack(): Promise<void> {
    if (!this.pendingAttack) {
      this.hideAttackDialog();
      return;
    }
    if (this.attackConfirmationLocked) {
      return;
    }
    this.attackConfirmationLocked = true;

    try {
      const attackerParsed = CoordinateSystem.parseHexKey(this.pendingAttack.attacker);
      const defenderParsed = CoordinateSystem.parseHexKey(this.pendingAttack.target);
      this.hideAttackDialog();
      if (!attackerParsed || !defenderParsed) {
        this.announceBattleUpdate("Attack aborted due to invalid coordinates.");
        this.pendingAttack = null;
        return;
      }
      const attackerAxial = CoordinateSystem.offsetToAxial(attackerParsed.col, attackerParsed.row);
      const defenderAxial = CoordinateSystem.offsetToAxial(defenderParsed.col, defenderParsed.row);
      await this.executePendingAttack(
        attackerAxial,
        defenderAxial,
        this.pendingAttack.attackerUnitId,
        this.pendingAttack.defenderUnitId
      );
      this.pendingAttack = null;
      this.currentAttackStance = null;
    } finally {
      this.attackConfirmationLocked = false;
    }
  }

  /**
   * Cancels the pending attack and restores UI state.
   */
  private handleCancelAttack(): void {
    if (this.attackConfirmationLocked) {
      return;
    }
    this.hideAttackDialog();
    this.currentAttackStance = null;
    if (this.pendingAttack) {
      this.announceBattleUpdate("Attack cancelled. Select a new target or continue maneuvering.");
    }
    this.pendingAttack = null;
    this.attackConfirmationLocked = false;
  }

  /**
   * Resolves the stored attack by issuing the engine command and surfacing results to the commander.
   */
  private async executePendingAttack(
    attacker: Axial,
    defender: Axial,
    attackerUnitId?: string | null,
    defenderUnitId?: string | null
  ): Promise<void> {
    this.closeSelectionIntelForAnimation();
    const engine = this.battleState.ensureGameEngine();
    try {
      const attackerOffset = CoordinateSystem.axialToOffset(attacker.q, attacker.r);
      const defenderOffset = CoordinateSystem.axialToOffset(defender.q, defender.r);
      const attackerHex = CoordinateSystem.makeHexKey(attackerOffset.col, attackerOffset.row);
      const defenderHex = CoordinateSystem.makeHexKey(defenderOffset.col, defenderOffset.row);
      const actingUnitId = attackerUnitId ?? this.pendingAttack?.attackerUnitId ?? this.selectedPlayerUnitId ?? null;

      let preview: ReturnType<typeof engine.previewAttack> | null = null;

      if (this.hexMapRenderer) {
        try {
          preview = engine.previewAttack(
            attacker,
            defender,
            this.currentAttackStance ?? undefined,
            attackerUnitId ?? undefined,
            defenderUnitId ?? undefined
          );
          if (preview) {
            const defenderDefinition = this.unitTypes?.[preview.defender.type as keyof UnitTypeDictionary];
            const targetClass = defenderDefinition?.class;
            const targetIsHardTarget = targetClass === "vehicle" || targetClass === "tank" || targetClass === "air";
            await this.focusCameraOnHex(defenderHex);
            await new Promise<void>((resolve) => window.setTimeout(resolve, 320));
            // Await combat animation so the visual cue lands before we mutate engine state.
            await this.hexMapRenderer.playAttackSequence(attackerHex, defenderHex, targetIsHardTarget);
          }
        } catch (animationError) {
          console.warn("[BattleScreen] Player attack animation failed; continuing without playback.", animationError);
        }
      }

      const resolution = engine.attackUnit(
        attacker,
        defender,
        this.currentAttackStance ?? undefined,
        attackerUnitId ?? undefined,
        defenderUnitId ?? undefined
      );

      if (resolution && this.hexMapRenderer) {
        const defenderInflicted = preview
          ? Math.max(0, preview.defender.strength - resolution.defenderRemainingStrength)
          : 0;
        if (!resolution.defenderDestroyed && defenderInflicted > 0) {
          const defenderType = preview?.defender.type ?? this.pendingAttack?.preview?.defender?.type;
          const defenderDefinition = defenderType ? this.unitTypes?.[defenderType as keyof UnitTypeDictionary] : undefined;
          this.hexMapRenderer.markHexDamaged(
            defenderHex,
            defenderDefinition?.class as UnitClass | undefined,
            resolution.defenderRemainingStrength,
            2
          );
        }

        if (resolution.defenderDestroyed) {
          const defenderType = preview?.defender.type ?? this.pendingAttack?.preview?.defender?.type;
          const defenderDefinition = defenderType ? this.unitTypes?.[defenderType as keyof UnitTypeDictionary] : undefined;
          this.hexMapRenderer.markHexWrecked(defenderHex, defenderDefinition?.class as UnitClass | undefined, 2);
        }

        const attackerRemaining = resolution.attackerRemainingStrength;
        const attackerInflictedByRetaliation = preview && typeof attackerRemaining === "number"
          ? Math.max(0, preview.attacker.strength - attackerRemaining)
          : 0;

        if (
          resolution.retaliationOccurred &&
          typeof attackerRemaining === "number" &&
          attackerRemaining > 0 &&
          attackerInflictedByRetaliation > 0
        ) {
          const attackerType = preview?.attacker.type ?? this.pendingAttack?.preview?.attacker?.type;
          const attackerDefinition = attackerType ? this.unitTypes?.[attackerType as keyof UnitTypeDictionary] : undefined;
          this.hexMapRenderer.markHexDamaged(
            attackerHex,
            attackerDefinition?.class as UnitClass | undefined,
            attackerRemaining,
            2
          );
        }

        if (resolution.retaliationOccurred && typeof attackerRemaining === "number" && attackerRemaining <= 0) {
          const attackerType = preview?.attacker.type ?? this.pendingAttack?.preview?.attacker?.type;
          const attackerDefinition = attackerType ? this.unitTypes?.[attackerType as keyof UnitTypeDictionary] : undefined;
          this.hexMapRenderer.markHexWrecked(attackerHex, attackerDefinition?.class as UnitClass | undefined, 2);
        }
      }

      if (resolution?.retaliationOccurred && this.hexMapRenderer) {
        try {
          const attackerDefinition = preview
            ? this.unitTypes?.[preview.attacker.type as keyof UnitTypeDictionary]
            : null;
          const attackerClass = attackerDefinition?.class;
          const retaliationTargetIsHardTarget = attackerClass === "vehicle" || attackerClass === "tank" || attackerClass === "air";

          await this.focusCameraOnHex(attackerHex);
          await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
          await this.hexMapRenderer.playAttackSequence(defenderHex, attackerHex, retaliationTargetIsHardTarget);
        } catch (animationError) {
          console.warn("[BattleScreen] Retaliation animation failed; continuing without playback.", animationError);
        }
      }

      this.renderEngineUnits();
      if (resolution) {
        this.clearSelectedHexAfterAction();
        // Compose battle update lines summarizing attack outcome and any counter-fire so commanders get full context.
        const announcements: string[] = [];
        const inflictedDamage = this.clampDisplayedDamage(
          resolution.defenderDamage?.readinessLoss ?? resolution.result.expectedDamage
        );
        const inflicted = this.formatDamageAmount(inflictedDamage);
        let primaryReport = `Attack confirmed. Damage dealt ${inflicted}.`;
        if (resolution.defenderDestroyed) {
          primaryReport += " Target destroyed.";
        } else {
          primaryReport += ` Defender strength now ${this.formatReadinessValue(Math.max(0, resolution.defenderRemainingStrength))}.`;
        }
        if (resolution.defenderDamage?.summary) {
          primaryReport += ` Effects: ${resolution.defenderDamage.summary}.`;
        }
        if (typeof resolution.attackerRemainingStrength === "number") {
          primaryReport += ` Attacking unit strength now ${Math.max(0, resolution.attackerRemainingStrength)}.`;
        }
        announcements.push(primaryReport);

        if (resolution.retaliationOccurred) {
          const retaliationDamage = this.clampDisplayedDamage(
            resolution.retaliationDamage?.readinessLoss ?? resolution.retaliationResult?.expectedDamage ?? 0
          );
          let retaliationReport = `Enemy retaliation dealt ${this.formatDamageAmount(retaliationDamage)} damage.`;
          const attackerRemaining = resolution.attackerRemainingStrength;
          if (typeof attackerRemaining === "number") {
            if (attackerRemaining <= 0) {
              retaliationReport += " Attacking unit destroyed.";
            } else {
              retaliationReport += ` Attacking unit strength now ${this.formatReadinessValue(attackerRemaining)}.`;
            }
          }
          if (resolution.retaliationDamage?.summary) {
            retaliationReport += ` Effects: ${resolution.retaliationDamage.summary}.`;
          }
          announcements.push(retaliationReport);
        }

        announcements.forEach((text) => this.announceBattleUpdate(text));

        const retaliationDamage = resolution.retaliationOccurred
          ? this.clampDisplayedDamage(
              resolution.retaliationDamage?.readinessLoss ?? (resolution.retaliationResult ? resolution.retaliationResult.expectedDamage : 0)
            )
          : 0;
        const defenderDestroyedNote = resolution.defenderDestroyed ? " Target destroyed." : "";
        const retaliationSummary = resolution.retaliationOccurred
          ? ` Enemy retaliation dealt ${this.formatDamageAmount(retaliationDamage)} damage.`
          : "";
        const attackSummary = `Player attack from ${attackerHex} to ${defenderHex} dealt ${inflicted} damage.${defenderDestroyedNote}${retaliationSummary}`;

        const detailSections = this.buildPlayerAttackDetails(resolution, this.pendingAttack?.preview ?? null, {
          attackerHex,
          defenderHex,
          inflictedDamage,
          retaliationDamage
        });

        this.publishActivityEvent({
          category: "player",
          type: "attack",
          summary: attackSummary,
          details: {
            inflictedDamage,
            defenderRemaining: resolution.defenderRemainingStrength,
            attackerRemaining: resolution.attackerRemainingStrength,
            retaliationDamage: retaliationDamage,
            retaliationOccurred: resolution.retaliationOccurred
          },
          detailSections
        });

        this.completeTutorialPhase("attack_intro");
        this.battleState.emitBattleUpdate("manual");
        this.completeInitiativeActivationAfterPlayerOrder(actingUnitId);
      } else {
        this.applySelectedHex(attackerHex);
        this.announceBattleUpdate("No valid attack (LOS or range).");
        this.publishActivityEvent({
          category: "system",
          type: "attack",
          summary: "Attack cancelled — line of sight or range invalid."
        });
      }
    } catch (error) {
      console.error("Failed to resolve attack:", error);
      this.announceBattleUpdate("Attack failed. Check console for details.");
      this.publishActivityEvent({
        category: "system",
        type: "attack",
        summary: "Attack failed due to engine error.",
        details: { error: error instanceof Error ? error.message : "unknown" }
      });
    }
  }

  /**
   * Sequentially focuses the camera and animates each logged bot movement so enemy turns are visually readable.
   * Falls back to an immediate render when the renderer is unavailable or animation prerequisites are missing.
   */
  private async playBotTurnAnimations(botSummary: BotTurnSummary): Promise<void> {
    this.closeSelectionIntelForAnimation();
    if (!this.hexMapRenderer) {
      this.renderEngineUnits();
      return;
    }

    // Guard against missing viewport: keep animations running but avoid repeated focus attempts.
    const canFocusCamera = Boolean(this.mapViewport);
    if (!canFocusCamera) {
      console.error(
        "[BattleScreen] playBotTurnAnimations: mapViewport unavailable; skipping camera recentering.",
        { hasRenderer: !!this.hexMapRenderer }
      );
    }

    // Animate bot movements
    for (const move of botSummary.moves) {
      const fromKey = this.toHexKey(move.from);
      const toKey = this.toHexKey(move.to);

      if (!fromKey || !toKey) {
        continue;
      }

      const pathKeys = this.toMovePathKeys(move.path, fromKey, toKey);
      const moveHandle = this.hexMapRenderer.primeUnitMove(fromKey, toKey, {
        path: pathKeys,
        unitId: move.unitId ?? null
      });
      if (!moveHandle) {
        continue;
      }

      const visibleBefore = move.unitId ? this.isBotUnitVisibleToPlayer(move.unitId, move.from) : false;
      const visibleAfter = move.unitId ? this.isBotUnitVisibleToPlayer(move.unitId, move.to) : false;
      const focusAnchorKey = visibleBefore ? fromKey : visibleAfter ? toKey : null;

      // Keep the camera tracking the unit before and after the renderer handles sprite duplication/animation.
      if (focusAnchorKey && canFocusCamera && this.battleAnimationMode !== "quick") {
        this.focusCameraOnHex(focusAnchorKey);
      }
      if (this.battleAnimationMode !== "quick") {
        await this.waitMs(200);
      }

      try {
        await moveHandle.play(this.resolveMoveAnimationDuration(pathKeys, BattleScreen.BOT_MOVE_ANIMATION_MS));
      } catch (animationError) {
        console.warn("Bot move animation failed; continuing without playback.", {
          move,
          animationError
        });
        break;
      } finally {
        moveHandle.dispose();
      }

      // Small pause between moves so sequential ghosts don't overlap visually.
      if (this.battleAnimationMode !== "quick") {
        await this.waitMs(150);
      }
    }

    // Animate bot attacks
    for (const attack of botSummary.attacks) {
      const attackerKey = this.toHexKey(attack.from);
      const targetKey = this.toHexKey(attack.target);
      if (!attackerKey || !targetKey) {
        continue;
      }

      // Focus camera on the attacker
      if (canFocusCamera) {
        await this.focusCameraOnHex(attackerKey);
      }

      // Brief pause to show attacker
      await this.waitForNextFrame();
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Focus camera on the target
      if (canFocusCamera) {
        await this.focusCameraOnHex(targetKey);
      }

      // Pause to show the attack target
      await new Promise((resolve) => setTimeout(resolve, 600));

      if (this.hexMapRenderer) {
        const defenderDefinition = this.unitTypes?.[attack.defenderType as keyof UnitTypeDictionary];
        const defenderClass = defenderDefinition?.class;
        const targetIsHardTarget = defenderClass === "vehicle" || defenderClass === "tank" || defenderClass === "air";

        try {
          // Await the combined muzzle flash + explosion sequence so visual feedback lands before post-combat announcements.
          await this.hexMapRenderer.playAttackSequence(attackerKey, targetKey, targetIsHardTarget);
        } catch (animationError) {
          console.warn("[BattleScreen] Bot attack animation failed; continuing without playback.", {
            attack,
            animationError
          });
        }
      }

      // Play retaliation animation if the defender returned fire
      if (attack.retaliation && attack.retaliation.damage > 0 && this.hexMapRenderer) {
        try {
          const attackerDefinition = this.unitTypes?.[attack.attackerType as keyof UnitTypeDictionary];
          const attackerClass = attackerDefinition?.class;
          const retaliationTargetIsHardTarget = attackerClass === "vehicle" || attackerClass === "tank" || attackerClass === "air";

          if (canFocusCamera) {
            await this.focusCameraOnHex(attackerKey);
          }
          await new Promise<void>((resolve) => window.setTimeout(resolve, 220));
          await this.hexMapRenderer.playAttackSequence(targetKey, attackerKey, retaliationTargetIsHardTarget);
        } catch (animationError) {
          console.warn("[BattleScreen] Retaliation animation failed; continuing without playback.", animationError);
        }
      }

      if (this.hexMapRenderer) {
        if (attack.defenderDestroyed) {
          const defenderDefinition = this.unitTypes?.[attack.defenderType as keyof UnitTypeDictionary];
          this.hexMapRenderer.markHexWrecked(targetKey, defenderDefinition?.class as UnitClass | undefined, 2);
        } else if (attack.inflictedDamage > 0) {
          const defenderDefinition = this.unitTypes?.[attack.defenderType as keyof UnitTypeDictionary];
          const engine = this.battleState.ensureGameEngine();
          const defenderNow = engine.playerUnits.find((unit) => unit.hex.q === attack.target.q && unit.hex.r === attack.target.r) ?? null;
          this.hexMapRenderer.markHexDamaged(
            targetKey,
            defenderDefinition?.class as UnitClass | undefined,
            defenderNow?.strength,
            2
          );
        }

        const attackerStrengthAfter = attack.retaliation?.attackerStrengthAfter;
        const retaliationDamage = attack.retaliation?.damage;
        if (
          typeof attackerStrengthAfter === "number" &&
          typeof retaliationDamage === "number" &&
          retaliationDamage > 0 &&
          attackerStrengthAfter > 0
        ) {
          const attackerDefinition = this.unitTypes?.[attack.attackerType as keyof UnitTypeDictionary];
          this.hexMapRenderer.markHexDamaged(
            attackerKey,
            attackerDefinition?.class as UnitClass | undefined,
            attackerStrengthAfter,
            2
          );
        }

        if (typeof attackerStrengthAfter === "number" && attackerStrengthAfter <= 0) {
          const attackerDefinition = this.unitTypes?.[attack.attackerType as keyof UnitTypeDictionary];
          this.hexMapRenderer.markHexWrecked(attackerKey, attackerDefinition?.class as UnitClass | undefined, 2);
        }
      }

      // Give the renderer a moment to settle and then repaint so casualties or strength changes appear promptly.
      await this.waitForNextFrame();
      this.renderEngineUnits();

      // Brief pause before next action
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Render final state after all animations complete
    this.renderEngineUnits();
  }

  /**
   * Shows the confirmation dialog and wires focus so keyboard users can respond immediately.
   */
  private showAttackDialog(): void {
    if (!this.attackConfirmDialog || !this.attackConfirmAccept) {
      return;
    }
    const wasHidden = this.attackConfirmDialog.classList.contains("hidden");

    this.attackConfirmDialog.classList.remove("hidden");
    this.attackConfirmDialog.setAttribute("aria-hidden", "false");
    if (wasHidden) {
      const activeElement = document.activeElement;
      this.attackDialogPreviouslyFocused = activeElement instanceof HTMLElement ? activeElement : null;
      this.attackConfirmDialog.addEventListener("keydown", this.attackDialogKeydownHandler);
      this.attackConfirmationLocked = false;
      this.attackConfirmAccept.focus();
    }
  }

  /**
   * Binds click handlers to stance selection buttons in the attack confirmation dialog.
   */
  private bindStanceButtons(): void {
    const fireAtWillBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceFireAtWill");
    const assaultBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceAssault");
    const suppressiveBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceSuppressive");

    if (!fireAtWillBtn || !assaultBtn || !suppressiveBtn) {
      return;
    }

    fireAtWillBtn.onclick = () => {
      if (fireAtWillBtn.disabled) {
        return;
      }
      this.currentAttackStance = "fireAtWill";
      this.updateStanceButtonStates();
      this.refreshAttackPreview();
    };

    assaultBtn.onclick = () => {
      if (assaultBtn.disabled) {
        return;
      }
      this.currentAttackStance = "assault";
      this.updateStanceButtonStates();
      this.refreshAttackPreview();
    };

    suppressiveBtn.onclick = () => {
      if (suppressiveBtn.disabled) {
        return;
      }
      this.currentAttackStance = "suppressive";
      this.updateStanceButtonStates();
      this.refreshAttackPreview();
    };
  }

  /**
   * Updates the visual state of stance buttons to reflect the current selection.
   */
  private updateStanceButtonStates(): void {
    const fireAtWillBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceFireAtWill");
    const assaultBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceAssault");
    const suppressiveBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceSuppressive");

    const fireAtWillSelected = this.currentAttackStance === "fireAtWill";
    const assaultSelected = this.currentAttackStance === "assault";
    const suppressiveSelected = this.currentAttackStance === "suppressive";

    fireAtWillBtn?.classList.toggle("stance-active", fireAtWillSelected);
    fireAtWillBtn?.setAttribute("aria-pressed", String(fireAtWillSelected));
    fireAtWillBtn?.setAttribute("data-selected", String(fireAtWillSelected));
    const fireAtWillState = fireAtWillBtn?.querySelector<HTMLElement>(".stance-state");
    if (fireAtWillState) {
      fireAtWillState.textContent = fireAtWillSelected ? "Selected" : "";
    }

    assaultBtn?.classList.toggle("stance-active", assaultSelected);
    assaultBtn?.setAttribute("aria-pressed", String(assaultSelected));
    assaultBtn?.setAttribute("data-selected", String(assaultSelected));
    const assaultState = assaultBtn?.querySelector<HTMLElement>(".stance-state");
    if (assaultState) {
      assaultState.textContent = assaultSelected ? "Selected" : "";
    }

    suppressiveBtn?.classList.toggle("stance-active", suppressiveSelected);
    suppressiveBtn?.setAttribute("aria-pressed", String(suppressiveSelected));
    suppressiveBtn?.setAttribute("data-selected", String(suppressiveSelected));
    const suppressiveState = suppressiveBtn?.querySelector<HTMLElement>(".stance-state");
    if (suppressiveState) {
      suppressiveState.textContent = suppressiveSelected ? "Selected" : "";
    }
  }

  /**
   * Refreshes the attack preview with the current stance selection.
   */
  private refreshAttackPreview(): void {
    if (!this.pendingAttack) {
      return;
    }

    const { attacker: attackerHexKey, target: defenderHexKey } = this.pendingAttack;
    const attackerOffset = CoordinateSystem.parseHexKey(attackerHexKey);
    const defenderOffset = CoordinateSystem.parseHexKey(defenderHexKey);

    if (!attackerOffset || !defenderOffset) {
      return;
    }

    const attacker = CoordinateSystem.offsetToAxial(attackerOffset.col, attackerOffset.row);
    const defender = CoordinateSystem.offsetToAxial(defenderOffset.col, defenderOffset.row);

    this.promptAttackConfirmation(attacker, defender, {
      preserveStance: true,
      attackerUnitId: this.pendingAttack.attackerUnitId,
      defenderUnitId: this.pendingAttack.defenderUnitId
    });
  }

  /**
   * Converts an axial coordinate into the renderer's offset-key string, returning null when outside the map bounds.
   *
   * CRITICAL: This function bridges the game engine coordinate system (axial) and the renderer coordinate system (offset).
   *
   * Coordinate Systems:
   * - Input: Axial (q, r) - Used by game engine for hex math
   * - Output: Hex key "col,row" - Used by renderer for DOM element lookup
   *
   * Validation:
   * - Ensures numeric conversion succeeded (catches NaN/Infinity)
   * - Ensures coordinates are within map bounds
   * - Returns null for invalid coordinates (caller must handle)
   *
   * Used by: Bot animations, attack animations, camera focus operations
   *
   * @param axial - Game engine axial coordinate {q, r}
   * @returns Hex key string "col,row" or null if invalid/out-of-bounds
   *
   * @see docs/CAMERA_FOCUS_BUG_POSTMORTEM.md for coordinate system details
   */
  private toHexKey(axial: Axial): string | null {
    const { col, row } = CoordinateSystem.axialToOffset(axial.q, axial.r);
    if (!Number.isFinite(col) || !Number.isFinite(row)) {
      return null;
    }
    if (col < 0 || row < 0 || col >= this.scenario.size.cols || row >= this.scenario.size.rows) {
      return null;
    }
    return CoordinateSystem.makeHexKey(col, row);
  }

  private toMovePathKeys(path: readonly Axial[] | undefined, fromKey: string, toKey: string): string[] {
    const keys: string[] = [];
    const appendKey = (key: string | null): void => {
      if (!key || keys[keys.length - 1] === key) {
        return;
      }
      keys.push(key);
    };

    appendKey(fromKey);
    path?.forEach((hex) => appendKey(this.toHexKey(hex)));
    appendKey(toKey);
    return keys;
  }

  private resolveMoveAnimationDuration(pathKeys: readonly string[], fallbackMs: number): number {
    if (this.battleAnimationMode === "quick") {
      return 0;
    }

    const steps = Math.max(1, pathKeys.length - 1);
    return Math.min(1200, Math.max(fallbackMs, 160 + steps * 190));
  }

  /**
   * Hides the confirmation dialog and restores map focus.
   */
  private hideAttackDialog(): void {
    if (!this.attackConfirmDialog) {
      return;
    }
    this.attackConfirmDialog.classList.add("hidden");
    this.attackConfirmDialog.setAttribute("aria-hidden", "true");
    this.attackConfirmDialog.removeEventListener("keydown", this.attackDialogKeydownHandler);
    const focusTarget = this.attackDialogPreviouslyFocused ?? this.battleMainContainer;
    this.attackDialogPreviouslyFocused = null;
    focusTarget?.focus?.();
    this.attackConfirmationLocked = false;
    // Don't clear currentAttackStance here - it needs to remain available until after attack execution
  }

  private promptFortificationFacing(
    hex: Axial,
    unitLabel: string,
    unitId: string | null,
    modificationType: "fortifications" | "tankTraps" | "smoke" | "facing" = "fortifications"
  ): void {
    if (!this.selectedHexKey) {
      return;
    }
    if (!this.fortificationFacingDialog) {
      this.announceBattleUpdate("Edge-work direction chooser is unavailable right now.");
      return;
    }
    if (this.popupManager.getActivePopup()) {
      this.popupManager.closePopup();
    }

    this.pendingFortificationBuild = {
      hex: structuredClone(hex),
      hexKey: this.selectedHexKey,
      unitLabel,
      unitId,
      modificationType
    };
    this.renderFortificationFacingPreview();
    this.showFortificationFacingDialog();
  }

  private renderFortificationFacingPreview(): void {
    if (this.fortificationFacingPreview) {
      const pendingBuild = this.pendingFortificationBuild;
      const title = this.fortificationFacingDialog?.querySelector<HTMLElement>("#battleFortificationFacingTitle");
      if (title) {
        title.textContent = pendingBuild?.modificationType === "smoke"
          ? "Choose Smoke Edge"
          : pendingBuild?.modificationType === "tankTraps"
            ? "Choose Tank-Trap Edge"
            : pendingBuild?.modificationType === "facing"
              ? "Choose Facing"
              : "Choose Fortification Edge";
      }
      const fortifiedFacings = pendingBuild
        ? this.battleState.ensureGameEngine()
          .getHexModifications(pendingBuild.hex)
          .filter((modification) => modification.type === pendingBuild.modificationType)
          .map((modification) => this.normalizeFortificationEdgeFacing(modification.facing))
          .filter((facing): facing is HexEdgeFacing => facing !== null)
        : [];
      this.fortificationFacingPreview.innerHTML = this.buildFortificationFacingPreviewMarkup(
        fortifiedFacings,
        pendingBuild?.modificationType ?? "fortifications"
      );
    }
  }

  private buildFortificationFacingPreviewMarkup(
    fortifiedFacings: readonly HexEdgeFacing[],
    modificationType: "fortifications" | "tankTraps" | "smoke" | "facing"
  ): string {
    const edgePaths: Record<HexEdgeFacing, string> = {
      NW: "M 35 67 L 110 24",
      NE: "M 110 24 L 185 67",
      E: "M 185 67 L 185 153",
      SE: "M 185 153 L 110 196",
      SW: "M 110 196 L 35 153",
      W: "M 35 153 L 35 67"
    };
    const labelPositions: Record<HexEdgeFacing, { x: number; y: number }> = {
      NW: { x: 60, y: 42 },
      NE: { x: 160, y: 42 },
      E: { x: 200, y: 114 },
      SE: { x: 160, y: 186 },
      SW: { x: 60, y: 186 },
      W: { x: 20, y: 114 }
    };
    const noun = modificationType === "tankTraps" ? "tank-trap" : modificationType === "smoke" ? "smoke" : modificationType === "facing" ? "facing" : "fortification";
    return `
      <svg viewBox="0 0 220 220" class="fortification-facing-preview-svg" aria-label="Select a ${noun} edge">
        <polygon
          class="fortification-facing-preview-hex"
          points="110,24 185,67 185,153 110,196 35,153 35,67"
        />
        ${(Object.entries(edgePaths) as Array<[HexEdgeFacing, string]>).map(([edge, path]) => {
          const isBuilt = fortifiedFacings.includes(edge);
          return `
          <path
            class="fortification-facing-preview-edge${isBuilt ? " fortification-facing-preview-edge--built" : ""}"
            data-fortification-edge="${edge}"
            data-built="${isBuilt ? "true" : "false"}"
            d="${path}"
            tabindex="${isBuilt ? "-1" : "0"}"
            role="button"
            aria-disabled="${isBuilt ? "true" : "false"}"
            aria-label="${isBuilt ? `${edge} edge already has ${noun} works` : `Build ${noun} works on the ${edge} edge`}"
          />
        `;
        }).join("")}
        ${(Object.entries(labelPositions) as Array<[HexEdgeFacing, { x: number; y: number }]>).map(([edge, point]) => `
          <text
            class="fortification-facing-preview-label"
            x="${point.x}"
            y="${point.y}"
            text-anchor="middle"
            dominant-baseline="middle"
          >${edge}</text>
        `).join("")}
      </svg>
    `;
  }

  private showFortificationFacingDialog(): void {
    if (!this.fortificationFacingDialog) {
      return;
    }
    const wasHidden = this.fortificationFacingDialog.classList.contains("hidden");
    this.fortificationFacingDialog.classList.remove("hidden");
    this.fortificationFacingDialog.setAttribute("aria-hidden", "false");

    if (wasHidden) {
      const activeElement = document.activeElement;
      this.fortificationDialogPreviouslyFocused = activeElement instanceof HTMLElement ? activeElement : null;
      this.fortificationFacingDialog.addEventListener("keydown", this.fortificationDialogKeydownHandler);
      this.fortificationFacingDialog.focus();
    }
  }

  private hideFortificationFacingDialog(): void {
    if (!this.fortificationFacingDialog) {
      return;
    }
    this.fortificationFacingDialog.classList.add("hidden");
    this.fortificationFacingDialog.setAttribute("aria-hidden", "true");
    this.fortificationFacingDialog.removeEventListener("keydown", this.fortificationDialogKeydownHandler);
    const focusTarget = this.fortificationDialogPreviouslyFocused ?? this.battleMainContainer;
    this.fortificationDialogPreviouslyFocused = null;
    this.pendingFortificationBuild = null;
    focusTarget?.focus?.();
  }

  private handleFortificationDialogKeydown(event: KeyboardEvent): void {
    if (!this.fortificationFacingDialog) {
      return;
    }

    switch (event.key) {
      case "Escape": {
        event.preventDefault();
        this.hideFortificationFacingDialog();
        return;
      }
      case "Enter":
      case " ": {
        const eventTarget = event.target instanceof Element ? event.target : null;
        const focusedElement = document.activeElement instanceof Element ? document.activeElement : null;
        const edgeElement = eventTarget?.closest("[data-fortification-edge]")
          ?? focusedElement?.closest("[data-fortification-edge]");
        const edge = this.normalizeFortificationEdgeFacing(edgeElement?.getAttribute("data-fortification-edge"));
        if (edge) {
          event.preventDefault();
          void this.handleConfirmFortificationFacing(edge);
        }
        return;
      }
      case "Tab": {
        const focusableElements = this.getFortificationDialogFocusableElements();
        if (focusableElements.length === 0) {
          event.preventDefault();
          return;
        }
        const currentElement = document.activeElement;
        const currentIndex = currentElement
          ? focusableElements.findIndex((element) => element === currentElement)
          : -1;
        const lastIndex = focusableElements.length - 1;
        const nextIndex = event.shiftKey
          ? (currentIndex <= 0 ? lastIndex : currentIndex - 1)
          : (currentIndex >= lastIndex ? 0 : currentIndex + 1);
        event.preventDefault();
        focusableElements[nextIndex]?.focus();
        return;
      }
      default:
        return;
    }
  }

  private getFortificationDialogFocusableElements(): Array<HTMLElement | SVGElement> {
    if (!this.fortificationFacingDialog) {
      return [];
    }
    const selectors = [
      "button",
      "[href]",
      "input",
      "select",
      "textarea",
      '[tabindex]:not([tabindex="-1"])'
    ].join(",");
    return Array.from(this.fortificationFacingDialog.querySelectorAll<HTMLElement | SVGElement>(selectors)).filter((element) => {
      const isHidden = element.getAttribute("aria-hidden") === "true" || (element instanceof HTMLElement && element.hidden);
      const isDisabled = element instanceof HTMLButtonElement && element.disabled;
      return !isHidden && !isDisabled;
    });
  }

  private async handleConfirmFortificationFacing(facing: HexEdgeFacing): Promise<void> {
    if (!this.pendingFortificationBuild) {
      return;
    }

    const { hex, hexKey, unitLabel, unitId, modificationType } = this.pendingFortificationBuild;
    const engine = this.battleState.ensureGameEngine();

    // Smoke uses a dedicated engine action rather than the generic buildHexModification path.
    if (modificationType === "smoke") {
      try {
        // callerAxial is set when smoke is fired at a remote target hex; absent means own-hex pop.
        const callerHex = this.pendingFortificationBuild?.callerAxial;
        engine.laySmoke(callerHex ?? hex, facing, unitId ?? undefined, callerHex ? hex : undefined);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unable to lay smoke right now.";
        this.announceBattleUpdate(message);
        this.renderFortificationFacingPreview();
        return;
      }
      this.hideFortificationFacingDialog();
      this.renderEngineUnits();
      this.clearSelectedHexAfterAction();
      const smokeSummary = `${unitLabel} laid a smoke screen on the ${facing} edge at ${hexKey}.`;
      this.announceBattleUpdate(smokeSummary);
      this.publishActivityEvent({ category: "player", type: "log", summary: smokeSummary });
      this.completeTutorialPhase("smoke_demo");
      this.battleState.emitBattleUpdate("manual");
      return;
    }

    // Unit facing uses a dedicated engine path — not a hex modification.
    if (modificationType === "facing") {
      try {
        engine.setUnitFacing(hex, facing, unitId ?? undefined);
      } catch (err) {
        this.announceBattleUpdate(err instanceof Error ? err.message : "Cannot set facing right now.");
        this.renderFortificationFacingPreview();
        return;
      }
      this.hideFortificationFacingDialog();
      // Clear the stale movement-derived angle so the sprite re-derives its direction from unit.facing.
      this.hexMapRenderer?.clearUnitFacingAngle(hexKey);
      this.renderEngineUnits();
      // Re-select the hex so buildBattleSelectionIntel re-runs and the Facing stat card updates.
      this.applySelectedHex(hexKey, true);
      const facingSummary = `${unitLabel} reoriented to face ${facing} at ${hexKey}.`;
      this.announceBattleUpdate(facingSummary);
      this.publishActivityEvent({ category: "player", type: "log", summary: facingSummary });
      this.battleState.emitBattleUpdate("manual");
      return;
    }

    const fortifiedFacings = new Set(
      engine
        .getHexModifications(hex)
        .filter((modification) => modification.type === modificationType)
        .map((modification) => this.normalizeFortificationEdgeFacing(modification.facing))
        .filter((edge): edge is HexEdgeFacing => edge !== null)
    );
    if (fortifiedFacings.has(facing)) {
      this.announceBattleUpdate(`${unitLabel} already has ${this.describeHexModification(modificationType)} on the ${facing} edge at ${hexKey}.`);
      this.renderFortificationFacingPreview();
      return;
    }
    const succeeded = engine.buildHexModification(hex, modificationType, facing, unitId ?? undefined);
    if (!succeeded) {
      const commandState = engine.getUnitCommandState(hex, unitId ?? undefined);
      this.announceBattleUpdate(
        commandState?.buildModificationAvailability?.[modificationType]?.reason ??
        commandState?.buildReason ??
        "Engineer orders are not available on this hex right now."
      );
      this.renderFortificationFacingPreview();
      return;
    }

    this.hideFortificationFacingDialog();
    this.renderEngineUnits();
    this.clearSelectedHexAfterAction();

    const summary = `${unitLabel} established ${this.describeHexModification(modificationType)} on the ${facing} edge at ${hexKey}.`;
    this.announceBattleUpdate(summary);
    this.publishActivityEvent({
      category: "player",
      type: "log",
      summary
    });
    this.completeTutorialPhase("engineer_orders");
    this.battleState.emitBattleUpdate("manual");
    this.completeInitiativeActivationAfterPlayerOrder(unitId ?? null);
  }

  /** Escapes HTML-sensitive characters when composing dialog copy. */
  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  private completeTutorialPhase(phase: TutorialPhase, shouldAdvance = true): void {
    const tutorialState = ensureTutorialState();
    if (!tutorialState.isTutorialActive()) {
      return;
    }
    if (tutorialState.getCurrentPhase() !== phase) {
      return;
    }
    if (tutorialState.getProgress().canProceed) {
      return;
    }
    tutorialState.setCanProceed(true);
    if (!shouldAdvance) {
      return;
    }
    setTimeout(() => {
      const nextPhase = this.resolveNextTutorialPhaseAfterCompletion(phase);
      if (nextPhase) {
        const nextStep = getTutorialStep(nextPhase);
        tutorialState.advancePhase(nextPhase, nextStep?.waitForAction !== true);
      }
    }, 800);
  }

  private resolveNextTutorialPhaseAfterCompletion(phase: TutorialPhase): TutorialPhase | null {
    const nextPhase = getNextPhase(phase);
    if (phase === "artillery_intro" && nextPhase === "select_attack_unit") {
      const attackTarget = this.findFirstTutorialUnitTarget(
        (unit, commandState) =>
          commandState?.isAutomated !== true && this.getTutorialAttackTargetHexKeys(unit).size > 0,
        true
      );
      return attackTarget ? nextPhase : "mission_objectives";
    }
    return nextPhase;
  }

  private clearTutorialSelectionOnceForPhase(phase: TutorialPhase): void {
    if (this.tutorialSelectionClearedForPhase === phase) {
      return;
    }
    this.tutorialSelectionClearedForPhase = phase;
    this.clearSelectedHexAfterAction();
  }

  private completeGuidedTutorialSelectionFromClick(
    hexKey: string,
    unit: ScenarioUnit,
    commandState: UnitCommandState | null | undefined
  ): void {
    const tutorialState = ensureTutorialState();
    const progress = tutorialState.getProgress();
    if (!progress.isActive || progress.canProceed || !this.tutorialUserMapClickInProgress) {
      return;
    }

    const phase = progress.currentPhase;
    const isGuidedHex = this.tutorialGuidedHexKeys.has(hexKey);
    if (!isGuidedHex) {
      return;
    }

    if (phase === "active_group_units" && this.isReconBikeBattleUnit(unit)) {
      this.completeTutorialPhase(phase);
      return;
    }

    if (phase === "engineer_intro" && this.isEngineerBattleUnit(unit)) {
      this.completeTutorialPhase(phase);
      return;
    }

    if (phase === "select_smoke_unit" && commandState?.canLaySmoke === true) {
      this.completeTutorialPhase(phase);
      return;
    }

    if (phase === "select_attack_unit" && this.getTutorialAttackTargetHexKeys(unit).size > 0) {
      this.completeTutorialPhase(phase);
      return;
    }

    if (phase === "select_artillery_observer" && this.resolveArtilleryActionState(unit, commandState ?? null, hexKey).available) {
      this.completeTutorialPhase(phase);
    }
  }

  private completeGuidedTutorialSelectionForClickedHex(hexKey: string): void {
    const selectedMember = this.resolveSelectedPlayerStackMember(hexKey);
    if (!selectedMember) {
      return;
    }
    const engine = this.battleState.ensureGameEngine();
    const commandState = engine.getUnitCommandState(selectedMember.unit.hex, selectedMember.unitId ?? undefined);
    this.completeGuidedTutorialSelectionFromClick(hexKey, selectedMember.unit, commandState);
  }

  private syncTutorialPhaseWithCurrentContext(phase: TutorialPhase): void {
    if (this.tutorialSelectionSyncInProgress) {
      return;
    }

    const tutorialState = ensureTutorialState();
    const progress = tutorialState.getProgress();
    const contextSensitivePhases = new Set<TutorialPhase>([
      "place_units",
      "initiative_order",
      "initiative_group",
      "active_group_units",
      "movement_intro",
      "attack_intro",
      "intel_overlay_expand",
      "smoke_demo",
      "spend_activation",
      "enemy_activation",
      "enemy_response",
      "next_unit",
      "skip_group",
      "engineer_intro",
      "engineer_orders",
      "select_smoke_unit",
      "select_attack_unit",
      "artillery_support_intro",
      "artillery_intro",
      "select_artillery_observer",
      "flak_intro",
      "round_handoff",
      "mission_objectives"
    ]);
    if (!progress.isActive || progress.currentPhase !== phase) {
      return;
    }
    if (this.tutorialLastSyncedPhase !== phase) {
      this.tutorialLastSyncedPhase = phase;
      this.tutorialCameraSyncKey = null;
      this.tutorialSelectionClearedForPhase = null;
      this.setTutorialGuidedHexTargets([]);
    }
    if (progress.canProceed && !contextSensitivePhases.has(phase)) {
      return;
    }

    if (phase !== "base_camp") {
      this.tutorialBaseCampSelectionCleared = false;
    }
    if (phase !== "initiative_group") {
      this.tutorialInitiativeGroupSelectionCleared = false;
    }
    if (phase !== "active_group_units") {
      this.tutorialActiveGroupSelectionCleared = false;
    }

    if (phase === "base_camp") {
      if (!this.tutorialBaseCampSelectionCleared) {
        this.tutorialBaseCampSelectionCleared = true;
        this.defaultSelectionKey = null;
        this.clearSelectedHex();
        const deploymentZoneHexes = this.getPlayerDeploymentZoneHexes();
        this.hexMapRenderer?.setZoneHighlights(deploymentZoneHexes);
        this.queueTutorialCameraForPhase(phase, deploymentZoneHexes, TUTORIAL_DEPLOYMENT_CAMERA_ZOOM);
      }
      return;
    }

    if (phase === "place_units") {
      const deploymentZoneHexes = this.getPlayerDeploymentZoneHexes();
      this.hexMapRenderer?.setZoneHighlights(deploymentZoneHexes);
      this.queueTutorialCameraForPhase(phase, deploymentZoneHexes, TUTORIAL_DEPLOYMENT_CAMERA_ZOOM);
      return;
    }

    if (phase === "initiative_order") {
      const activeGroupHexKeys = this.getActivePlayerInitiativeGroupHexKeys();
      const focusHexKeys = activeGroupHexKeys.size > 0 ? activeGroupHexKeys : this.getManualPlayerUnitHexKeys();
      this.hexMapRenderer?.setZoneHighlights(activeGroupHexKeys);
      this.queueTutorialCameraForPhase(phase, focusHexKeys, TUTORIAL_GROUP_CAMERA_ZOOM);
      return;
    }

    if (phase === "initiative_group") {
      const activeGroupHexKeys = this.getActivePlayerInitiativeGroupHexKeys();
      this.hexMapRenderer?.setZoneHighlights(activeGroupHexKeys);
      if (!this.tutorialInitiativeGroupSelectionCleared) {
        this.tutorialInitiativeGroupSelectionCleared = true;
        this.clearSelectedHexAfterAction();
        this.hexMapRenderer?.setZoneHighlights(activeGroupHexKeys);
      }
      this.queueTutorialCameraForPhase(phase, activeGroupHexKeys, TUTORIAL_GROUP_CAMERA_ZOOM);
      return;
    }

    if (phase === "active_group_units") {
      const activeGroupHexKeys = this.getActivePlayerInitiativeGroupHexKeys();
      const reconTarget = this.findFirstTutorialUnitTarget(
        (unit, commandState) => commandState?.isAutomated !== true && this.isReconBikeBattleUnit(unit),
        true
      );
      const focusHexKeys = reconTarget ? new Set([reconTarget.hexKey]) : activeGroupHexKeys;
      if (!this.tutorialActiveGroupSelectionCleared) {
        this.tutorialActiveGroupSelectionCleared = true;
        this.clearSelectedHexAfterAction();
      }
      this.hexMapRenderer?.setZoneHighlights(focusHexKeys);
      this.setTutorialGuidedHexTargets(reconTarget ? [reconTarget.hexKey] : []);
      this.queueTutorialCameraForPhase(phase, focusHexKeys, TUTORIAL_GROUP_CAMERA_ZOOM);
      return;
    }

    if (phase === "movement_intro") {
      if (!this.selectedUnitMatchesTutorialTarget((unit) => this.isReconBikeBattleUnit(unit), true)) {
        const reconTarget = this.findFirstTutorialUnitTarget(
          (unit, commandState) => commandState?.isAutomated !== true && this.isReconBikeBattleUnit(unit),
          true
        );
        if (reconTarget) {
          this.selectTutorialUnitTarget(reconTarget, false);
        }
      }

      this.closeSelectionIntelForAnimation();
      this.hexMapRenderer?.setZoneHighlights(new Set());
      const movementDestination = this.resolveTutorialMovementDestination();
      this.setTutorialGuidedHexTargets(movementDestination ? [movementDestination] : []);
      this.queueTutorialCameraForPhase(
        phase,
        this.getSelectedTutorialFocusHexes(movementDestination ? [movementDestination] : this.playerMoveHexes),
        TUTORIAL_MOVEMENT_CAMERA_ZOOM
      );
      return;
    }

    if (phase === "attack_intro") {
      const attackTarget = this.findFirstTutorialUnitTarget(
        (unit, commandState) =>
          commandState?.isAutomated !== true && this.getTutorialAttackTargetHexKeys(unit).size > 0,
        true
      );
      if (attackTarget && !this.selectedUnitHasAttackTargets()) {
        this.selectTutorialUnitTarget(attackTarget, false);
      }
      this.closeSelectionIntelForAnimation();
      this.hexMapRenderer?.setZoneHighlights(new Set());
      this.queueTutorialCameraForPhase(
        phase,
        this.getSelectedTutorialFocusHexes(this.playerAttackHexes),
        TUTORIAL_ATTACK_CAMERA_ZOOM
      );
      return;
    }

    if (phase === "intel_overlay_expand") {
      if (!this.selectedUnitIsInActiveInitiativeGroup()) {
        this.selectFirstTutorialUnitTarget(phase, (_unit, commandState) => commandState?.isAutomated !== true, {
          activeGroupOnly: true
        });
      }
      if (!this.isBattleIntelOverlayVisible() && this.selectedHexKey) {
        this.tutorialSelectionSyncInProgress = true;
        try {
          this.applySelectedHex(this.selectedHexKey, true);
        } finally {
          this.tutorialSelectionSyncInProgress = false;
        }
      }
      this.hexMapRenderer?.setZoneHighlights(this.selectedHexKey ? new Set([this.selectedHexKey]) : new Set());
      this.queueTutorialCameraForPhase(phase, this.getSelectedTutorialFocusHexes(), TUTORIAL_ORDER_CAMERA_ZOOM);
      if (this.isBattleIntelOverlayExpanded()) {
        this.completeTutorialPhase("intel_overlay_expand");
      }
      return;
    }

    if (phase === "smoke_demo") {
      const smokeTarget = this.selectFirstTutorialUnitTarget(
        phase,
        (_unit, commandState) => commandState?.isAutomated !== true && commandState?.canLaySmoke === true,
        {
          activeGroupOnly: true,
          expandIntel: true
        }
      );
      this.hexMapRenderer?.setZoneHighlights(smokeTarget ? new Set([smokeTarget.hexKey]) : new Set());
      this.queueTutorialCameraForPhase(phase, smokeTarget ? [smokeTarget.hexKey] : this.getManualPlayerUnitHexKeys(), TUTORIAL_ORDER_CAMERA_ZOOM);
      return;
    }

    if (phase === "spend_activation") {
      if (this.selectedHexKey || this.isBattleIntelOverlayExpanded()) {
        this.clearSelectedHexAfterAction();
      }
      const activeGroupHexKeys = this.getActivePlayerInitiativeGroupHexKeys();
      this.hexMapRenderer?.setZoneHighlights(activeGroupHexKeys);
      this.queueTutorialCameraForPhase(
        phase,
        activeGroupHexKeys.size > 0 ? activeGroupHexKeys : this.getManualPlayerUnitHexKeys(),
        TUTORIAL_GROUP_CAMERA_ZOOM
      );
      return;
    }

    if (phase === "enemy_activation" || phase === "enemy_response") {
      this.hexMapRenderer?.setZoneHighlights(new Set());
      this.queueTutorialCameraForPhase(phase, this.getManualPlayerUnitHexKeys(), TUTORIAL_OVERVIEW_CAMERA_ZOOM);
      this.monitorTutorialEnemyActivation(phase);
      return;
    }

    if (phase === "next_unit" || phase === "skip_group") {
      const activeGroupHexKeys = this.getActivePlayerInitiativeGroupHexKeys();
      const focusHexKeys = activeGroupHexKeys.size > 0 ? activeGroupHexKeys : this.getManualPlayerUnitHexKeys();
      this.hexMapRenderer?.setZoneHighlights(activeGroupHexKeys);
      this.queueTutorialCameraForPhase(phase, focusHexKeys, TUTORIAL_GROUP_CAMERA_ZOOM);
      return;
    }

    if (phase === "engineer_intro") {
      const engineerTarget = this.findFirstTutorialUnitTarget(
        (unit, commandState) => commandState?.isAutomated !== true && this.isEngineerBattleUnit(unit),
        true
      );
      if (engineerTarget) {
        this.clearTutorialSelectionOnceForPhase(phase);
      }
      if (this.selectedUnitMatchesTutorialTarget((unit) => this.isEngineerBattleUnit(unit), true)) {
        this.completeTutorialPhase(phase);
        return;
      }
      this.hexMapRenderer?.setZoneHighlights(engineerTarget ? new Set([engineerTarget.hexKey]) : new Set());
      this.setTutorialGuidedHexTargets(engineerTarget ? [engineerTarget.hexKey] : []);
      this.queueTutorialCameraForPhase(phase, engineerTarget ? [engineerTarget.hexKey] : this.getManualPlayerUnitHexKeys(), TUTORIAL_ORDER_CAMERA_ZOOM);
      return;
    }

    if (phase === "engineer_orders") {
      const engineerTarget = this.selectFirstTutorialUnitTarget(
        phase,
        (unit, commandState) =>
          commandState?.isAutomated !== true &&
          this.isEngineerBattleUnit(unit) &&
          commandState?.buildModificationAvailability.fortifications.available === true,
        { activeGroupOnly: true, expandIntel: true }
      );
      this.hexMapRenderer?.setZoneHighlights(engineerTarget ? new Set([engineerTarget.hexKey]) : new Set());
      this.queueTutorialCameraForPhase(phase, engineerTarget ? [engineerTarget.hexKey] : this.getManualPlayerUnitHexKeys(), TUTORIAL_ORDER_CAMERA_ZOOM);
      return;
    }

    if (phase === "select_smoke_unit") {
      const smokeTarget = this.findFirstTutorialUnitTarget(
        (_unit, commandState) => commandState?.isAutomated !== true && commandState?.canLaySmoke === true,
        true
      );
      if (smokeTarget) {
        this.clearTutorialSelectionOnceForPhase(phase);
      }
      if (this.selectedUnitCanLaySmoke()) {
        this.completeTutorialPhase(phase);
        return;
      }
      this.hexMapRenderer?.setZoneHighlights(smokeTarget ? new Set([smokeTarget.hexKey]) : new Set());
      this.setTutorialGuidedHexTargets(smokeTarget ? [smokeTarget.hexKey] : []);
      this.queueTutorialCameraForPhase(phase, smokeTarget ? [smokeTarget.hexKey] : this.getManualPlayerUnitHexKeys(), TUTORIAL_ORDER_CAMERA_ZOOM);
      return;
    }

    if (phase === "select_attack_unit") {
      const attackTarget = this.findFirstTutorialUnitTarget(
        (unit, commandState) =>
          commandState?.isAutomated !== true && this.getTutorialAttackTargetHexKeys(unit).size > 0,
        true
      );
      if (attackTarget) {
        this.clearTutorialSelectionOnceForPhase(phase);
      }
      if (this.selectedUnitHasAttackTargets()) {
        this.completeTutorialPhase(phase);
        return;
      }
      this.hexMapRenderer?.setZoneHighlights(attackTarget ? new Set([attackTarget.hexKey]) : new Set());
      this.setTutorialGuidedHexTargets(attackTarget ? [attackTarget.hexKey] : []);
      this.queueTutorialCameraForPhase(
        phase,
        attackTarget
          ? [attackTarget.hexKey, ...this.getTutorialAttackTargetHexKeys(attackTarget.unit)]
          : this.getManualPlayerUnitHexKeys(),
        TUTORIAL_ATTACK_CAMERA_ZOOM
      );
      return;
    }

    if (phase === "artillery_support_intro") {
      const observerTarget = this.findFirstTutorialUnitTarget(
        (unit, commandState, hexKey) =>
          commandState?.isAutomated !== true &&
          this.resolveArtilleryActionState(unit, commandState, hexKey).available,
        true
      );
      this.hexMapRenderer?.setZoneHighlights(observerTarget ? new Set([observerTarget.hexKey]) : new Set());
      this.setTutorialGuidedHexTargets([]);
      this.queueTutorialCameraForPhase(
        phase,
        observerTarget ? [observerTarget.hexKey] : this.getManualPlayerUnitHexKeys(),
        TUTORIAL_ORDER_CAMERA_ZOOM
      );
      return;
    }

    if (phase === "select_artillery_observer") {
      const observerTarget = this.findFirstTutorialUnitTarget(
        (unit, commandState, hexKey) =>
          commandState?.isAutomated !== true &&
          this.resolveArtilleryActionState(unit, commandState, hexKey).available,
        true
      );
      if (observerTarget) {
        this.clearTutorialSelectionOnceForPhase(phase);
      }
      if (this.selectedUnitCanCallArtillery()) {
        this.completeTutorialPhase(phase);
        return;
      }
      this.hexMapRenderer?.setZoneHighlights(observerTarget ? new Set([observerTarget.hexKey]) : new Set());
      this.setTutorialGuidedHexTargets(observerTarget ? [observerTarget.hexKey] : []);
      this.queueTutorialCameraForPhase(
        phase,
        observerTarget ? [observerTarget.hexKey] : this.getManualPlayerUnitHexKeys(),
        TUTORIAL_ORDER_CAMERA_ZOOM
      );
      return;
    }

    if (phase === "artillery_intro") {
      const observerTarget = this.selectFirstTutorialUnitTarget(
        phase,
        (unit, commandState, hexKey) =>
          commandState?.isAutomated !== true &&
          this.resolveArtilleryActionState(unit, commandState, hexKey).available,
        { activeGroupOnly: true, expandIntel: true }
      );
      this.hexMapRenderer?.setZoneHighlights(observerTarget ? new Set([observerTarget.hexKey]) : new Set());
      this.queueTutorialCameraForPhase(
        phase,
        observerTarget
          ? [observerTarget.hexKey, ...this.resolveArtilleryTargetHexKeys(observerTarget.unit, observerTarget.hexKey)]
          : this.getManualPlayerUnitHexKeys(),
        TUTORIAL_ORDER_CAMERA_ZOOM
      );
      return;
    }

    if (phase === "mission_objectives") {
      this.hexMapRenderer?.setZoneHighlights(new Set());
      this.queueTutorialCameraForPhase(phase, this.getManualPlayerUnitHexKeys(), TUTORIAL_OVERVIEW_CAMERA_ZOOM);
    }
  }

  private queueTutorialCameraForPhase(phase: TutorialPhase, hexes: Iterable<string>, zoom: number): void {
    const hexArray = Array.from(new Set(hexes)).filter(Boolean).sort();
    if (hexArray.length === 0) {
      return;
    }

    const syncKey = `${phase}:${zoom.toFixed(2)}:${hexArray.join("|")}`;
    if (this.tutorialCameraSyncKey === syncKey) {
      return;
    }
    this.tutorialCameraSyncKey = syncKey;
    this.tutorialMapInputBlockedUntil = Date.now() + TUTORIAL_MAP_INPUT_SETTLE_MS;

    const centerTutorialCamera = () => {
      this.resetTutorialBattlePaneScroll();
      void this.centerCameraOnZone(hexArray, zoom)
        .then(async () => {
          await this.waitForNextFrame();
          this.offsetTutorialCameraBelowPrompt(hexArray);
          this.resetTutorialBattlePaneScroll();
          window.requestAnimationFrame(() => this.resetTutorialBattlePaneScroll());
        })
        .catch((error) => {
          console.warn("[BattleScreen] Failed to center tutorial camera", { phase, zoom, error });
        });
    };
    [0, 160].forEach((delayMs) => {
      window.setTimeout(centerTutorialCamera, delayMs);
    });
  }

  private offsetTutorialCameraBelowPrompt(hexKeys: readonly string[]): void {
    if (window.innerWidth > 768 || !this.mapViewport || !this.hexMapRenderer) {
      return;
    }

    const panel = document.querySelector<HTMLElement>(".tutorial-panel.tutorial-battle-docked");
    if (!panel) {
      return;
    }

    const focusRects = hexKeys
      .map((hexKey) => this.hexMapRenderer?.getHexElement(hexKey)?.getBoundingClientRect() ?? null)
      .filter((rect): rect is DOMRect => rect !== null && rect.width > 0 && rect.height > 0);
    if (focusRects.length === 0) {
      return;
    }

    const panelRect = panel.getBoundingClientRect();
    const focusTop = Math.min(...focusRects.map((rect) => rect.top));
    const focusBottom = Math.max(...focusRects.map((rect) => rect.bottom));
    const desiredTop = panelRect.bottom + 20;
    const availableShift = window.innerHeight - focusBottom - 20;
    const shiftY = Math.min(180, availableShift, desiredTop - focusTop);
    if (shiftY > 4) {
      this.mapViewport.pan(0, shiftY);
    }
  }

  private resetTutorialBattlePaneScroll(): void {
    [".battle-map-pane", ".map-shell", ".battle-main"].forEach((selector) => {
      const node = this.element.querySelector<HTMLElement>(selector);
      if (node && node.scrollLeft !== 0) {
        node.scrollLeft = 0;
      }
    });
  }

  private setTutorialGuidedHexTargets(hexKeys: Iterable<string>): void {
    this.tutorialGuidedHexKeys.forEach((hexKey) => {
      this.hexMapRenderer?.getHexElement(hexKey)?.removeAttribute("data-tutorial-guided-hex");
    });
    this.tutorialGuidedHexKeys.clear();

    for (const hexKey of hexKeys) {
      const element = this.hexMapRenderer?.getHexElement(hexKey);
      if (!element) {
        continue;
      }
      element.setAttribute("data-tutorial-guided-hex", "true");
      this.tutorialGuidedHexKeys.add(hexKey);
    }
  }

  private monitorTutorialEnemyActivation(phase: "enemy_activation" | "enemy_response"): void {
    if (!this.isInitiativeSystemEnabled || !this.initiativeMethods) {
      this.completeTutorialPhase(phase);
      return;
    }

    const progress = ensureTutorialState().getProgress();
    if (!progress.isActive || progress.currentPhase !== phase) {
      this.tutorialEnemyActivationMonitorActive = false;
      return;
    }

    const queue = this.initiativeMethods.getCurrentInitiativeQueue();
    const activeGroup = this.resolveActiveInitiativeGroup(queue);
    if (!activeGroup || activeGroup.ownerId === "player") {
      this.finishTutorialEnemyActivation(phase);
      return;
    }

    if (!this.tutorialEnemyActivationMonitorActive) {
      this.tutorialEnemyActivationMonitorActive = true;
      this.tutorialEnemyActivationStartedAt = Date.now();
      this.tutorialEnemyActivationSequenceStart = this.activityEventSequence;
    }

    const currentActivation = this.initiativeMethods.getCurrentActivation();
    if (!currentActivation && this.hasPendingInitiativeActivations(queue)) {
      try {
        this.initiativeMethods.processNextInitiativeActivation();
      } catch (error) {
        console.warn("[BattleScreen] Failed to resume tutorial enemy activation.", error);
      }
    }

    const elapsedMs = Date.now() - this.tutorialEnemyActivationStartedAt;
    if (elapsedMs >= TUTORIAL_ENEMY_ACTIVATION_TIMEOUT_MS) {
      this.resolveTutorialEnemyActivationFallback(phase);
      return;
    }

    window.setTimeout(() => this.monitorTutorialEnemyActivation(phase), 220);
  }

  private finishTutorialEnemyActivation(phase: "enemy_activation" | "enemy_response"): void {
    this.tutorialEnemyActivationMonitorActive = false;
    this.highlightCurrentInitiativeGroup();
    this.syncInitiativeTurnControlsState();
    this.completeTutorialPhase(phase);
  }

  private resolveTutorialEnemyActivationFallback(phase: "enemy_activation" | "enemy_response"): void {
    if (!this.initiativeMethods) {
      this.finishTutorialEnemyActivation(phase);
      return;
    }

    const queue = this.initiativeMethods.getCurrentInitiativeQueue();
    const activeGroup = this.resolveActiveInitiativeGroup(queue);
    if (!activeGroup || activeGroup.ownerId === "player") {
      this.finishTutorialEnemyActivation(phase);
      return;
    }

    if (this.activityEventSequence === this.tutorialEnemyActivationSequenceStart) {
      this.publishActivityEvent({
        category: "enemy",
        type: "log",
        summary: "Enemy activation resolved with no observed movement or fire."
      });
    }

    try {
      this.initiativeMethods.skipCurrentGroup();
    } catch (error) {
      console.warn("[BattleScreen] Failed to skip stalled tutorial enemy group.", error);
    }

    this.finishTutorialEnemyActivation(phase);
  }

  private getSelectedTutorialFocusHexes(extraHexes: Iterable<string> = []): Set<string> {
    const focusHexes = new Set<string>();
    if (this.selectedHexKey) {
      focusHexes.add(this.selectedHexKey);
    }
    for (const hexKey of extraHexes) {
      if (hexKey) {
        focusHexes.add(hexKey);
      }
    }
    return focusHexes;
  }

  private resolveTutorialMovementDestination(): string | null {
    if (!this.selectedHexKey) {
      return null;
    }
    const originOffset = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!originOffset) {
      return null;
    }
    const origin = CoordinateSystem.offsetToAxial(originOffset.col, originOffset.row);
    const candidates = Array.from(this.playerMoveHexes)
      .filter((hexKey) => hexKey !== this.selectedHexKey)
      .map((hexKey) => {
        const offset = CoordinateSystem.parseHexKey(hexKey);
        if (!offset) {
          return null;
        }
        const destination = CoordinateSystem.offsetToAxial(offset.col, offset.row);
        return {
          hexKey,
          col: offset.col,
          row: offset.row,
          distance: hexDistance(origin, destination)
        };
      })
      .filter((candidate): candidate is NonNullable<typeof candidate> => candidate !== null);

    const preferred = candidates.filter((candidate) => candidate.distance >= 3 && candidate.distance <= 4);
    const pool = preferred.length > 0 ? preferred : candidates;
    pool.sort((left, right) =>
      right.distance - left.distance ||
      right.col - left.col ||
      left.row - right.row ||
      left.hexKey.localeCompare(right.hexKey)
    );
    return pool[0]?.hexKey ?? null;
  }

  private selectFirstTutorialUnitTarget(
    phase: TutorialPhase,
    predicate: (unit: ScenarioUnit, commandState: UnitCommandState | null, hexKey: string) => boolean,
    options: { activeGroupOnly?: boolean; expandIntel?: boolean } = {}
  ): TutorialUnitTarget | null {
    const target = this.findFirstTutorialUnitTarget(predicate, options.activeGroupOnly === true);
    if (!target) {
      return null;
    }

    this.selectTutorialUnitTarget(target, options.expandIntel === true);
    this.queueTutorialCameraForPhase(phase, [target.hexKey], TUTORIAL_ORDER_CAMERA_ZOOM);
    return target;
  }

  private findFirstTutorialUnitTarget(
    predicate: (unit: ScenarioUnit, commandState: UnitCommandState | null, hexKey: string) => boolean,
    activeGroupOnly = false
  ): TutorialUnitTarget | null {
    const engine = this.battleState.ensureGameEngine();
    for (const unit of engine.playerUnits) {
      if (activeGroupOnly && (!unit.unitId || !this.isUnitInCurrentInitiativeGroup(unit.unitId))) {
        continue;
      }
      const hexKey = this.toOffsetHexKey(unit.hex);
      if (!hexKey) {
        continue;
      }
      const commandState = engine.getUnitCommandState(unit.hex, unit.unitId ?? undefined);
      if (predicate(unit, commandState, hexKey)) {
        return { unit, commandState, hexKey };
      }
    }
    return null;
  }

  private selectTutorialUnitTarget(target: TutorialUnitTarget, expandIntel: boolean): void {
    const targetUnitId = target.unit.unitId ?? null;
    const alreadySelected =
      this.selectedHexKey === target.hexKey &&
      (targetUnitId === null || this.selectedPlayerUnitId === targetUnitId);

    if (!alreadySelected) {
      this.tutorialSelectionSyncInProgress = true;
      try {
        this.applySelectedHex(target.hexKey);
        this.selectedPlayerUnitId = targetUnitId;
        this.applySelectedHex(target.hexKey, true);
      } finally {
        this.tutorialSelectionSyncInProgress = false;
      }
    }

    if (expandIntel) {
      window.setTimeout(() => this.expandBattleIntelOverlayIfCollapsed(), 0);
    }
  }

  private expandBattleIntelOverlayIfCollapsed(): void {
    const overlay = this.battleIntelOverlayRoot ?? document.getElementById("battleIntelOverlay");
    if (!overlay || overlay.classList.contains("hidden") || overlay.dataset.collapsed === "false") {
      return;
    }
    const toggleButton = document.getElementById("battleIntelOverlayToggle") as HTMLButtonElement | null;
    toggleButton?.click();
  }

  private shouldAllowTutorialHexCameraFocus(phase: TutorialPhase): boolean {
    return phase === "base_camp";
  }

  private shouldDeferTutorialInitiativeAutoFocus(): boolean {
    const progress = ensureTutorialState().getProgress();
    return progress.isActive && (
      progress.currentPhase === "begin_battle" ||
      progress.currentPhase === "initiative_order" ||
      progress.currentPhase === "initiative_group" ||
      progress.currentPhase === "active_group_units" ||
      progress.currentPhase === "movement_intro" ||
      progress.currentPhase === "attack_intro" ||
      progress.currentPhase === "select_smoke_unit" ||
      progress.currentPhase === "select_attack_unit" ||
      progress.currentPhase === "intel_overlay_expand" ||
      progress.currentPhase === "smoke_demo" ||
      progress.currentPhase === "spend_activation" ||
      progress.currentPhase === "enemy_activation" ||
      progress.currentPhase === "next_unit" ||
      progress.currentPhase === "skip_group" ||
      progress.currentPhase === "engineer_intro" ||
      progress.currentPhase === "engineer_orders" ||
      progress.currentPhase === "enemy_response" ||
      progress.currentPhase === "artillery_support_intro" ||
      progress.currentPhase === "artillery_intro" ||
      progress.currentPhase === "select_artillery_observer" ||
      progress.currentPhase === "flak_intro" ||
      progress.currentPhase === "round_handoff" ||
      progress.currentPhase === "mission_objectives"
    );
  }

  private queueTutorialCombatOverviewCamera(): void {
    const focusHexes = this.getManualPlayerUnitHexKeys();
    if (focusHexes.size === 0) {
      return;
    }

    const centerOverview = () => {
      void this.centerCameraOnZone(focusHexes, TUTORIAL_OVERVIEW_CAMERA_ZOOM).catch((error) => {
        console.warn("[BattleScreen] Failed to center tutorial combat overview", error);
      });
    };

    [0, 180, 480, 900].forEach((delayMs) => {
      window.setTimeout(centerOverview, delayMs);
    });
  }

  private selectedUnitCanLaySmoke(): boolean {
    if (!this.selectedHexKey) {
      return false;
    }
    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) {
      return false;
    }
    const selectedMember = this.resolveSelectedPlayerStackMember(this.selectedHexKey);
    if (!selectedMember || selectedMember.isAutomated) {
      return false;
    }
    if (
      this.isInitiativeSystemEnabled &&
      selectedMember.unitId &&
      !this.isUnitInCurrentInitiativeGroup(selectedMember.unitId)
    ) {
      return false;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const commandState = this.battleState.ensureGameEngine().getUnitCommandState(
      axial,
      selectedMember.unitId ?? this.selectedPlayerUnitId ?? undefined
    );
    return commandState?.canLaySmoke === true;
  }

  private getTutorialAttackTargetHexKeys(unit: ScenarioUnit): Set<string> {
    const targetHexKeys = this.battleState
      .ensureGameEngine()
      .getAttackableTargets(unit.hex, unit.unitId ?? undefined)
      .map((targetHex) => {
        const offset = CoordinateSystem.axialToOffset(targetHex.q, targetHex.r);
        return CoordinateSystem.makeHexKey(offset.col, offset.row);
      });
    return new Set(targetHexKeys);
  }

  private selectedUnitHasAttackTargets(): boolean {
    if (!this.selectedHexKey) {
      return false;
    }
    const selectedMember = this.resolveSelectedPlayerStackMember(this.selectedHexKey);
    if (!selectedMember || selectedMember.isAutomated || !selectedMember.unitId) {
      return false;
    }
    if (
      this.isInitiativeSystemEnabled &&
      !this.isUnitInCurrentInitiativeGroup(selectedMember.unitId)
    ) {
      return false;
    }
    return this.getTutorialAttackTargetHexKeys(selectedMember.unit).size > 0;
  }

  private selectedUnitCanCallArtillery(activeGroupOnly = true): boolean {
    if (!this.selectedHexKey) {
      return false;
    }
    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    const selectedMember = this.resolveSelectedPlayerStackMember(this.selectedHexKey);
    if (!parsed || !selectedMember || selectedMember.isAutomated || !selectedMember.unitId) {
      return false;
    }
    if (
      activeGroupOnly &&
      this.isInitiativeSystemEnabled &&
      !this.isUnitInCurrentInitiativeGroup(selectedMember.unitId)
    ) {
      return false;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const commandState = this.battleState.ensureGameEngine().getUnitCommandState(
      axial,
      selectedMember.unitId
    );
    return this.resolveArtilleryActionState(
      selectedMember.unit,
      commandState,
      this.selectedHexKey
    ).available;
  }

  private selectedUnitIsManualPlayerUnit(): boolean {
    if (!this.selectedHexKey) {
      return false;
    }
    const selectedMember = this.resolveSelectedPlayerStackMember(this.selectedHexKey);
    return !!selectedMember && !selectedMember.isAutomated;
  }

  private selectedUnitIsInActiveInitiativeGroup(): boolean {
    if (!this.selectedHexKey || !this.selectedPlayerUnitId) {
      return false;
    }
    const selectedMember = this.resolveSelectedPlayerStackMember(this.selectedHexKey);
    if (!selectedMember || selectedMember.isAutomated || !selectedMember.unitId) {
      return false;
    }
    return !this.isInitiativeSystemEnabled || this.isUnitInCurrentInitiativeGroup(selectedMember.unitId);
  }

  private selectedUnitMatchesTutorialTarget(
    predicate: (unit: ScenarioUnit) => boolean,
    activeGroupOnly = false
  ): boolean {
    if (!this.selectedHexKey) {
      return false;
    }
    const selectedMember = this.resolveSelectedPlayerStackMember(this.selectedHexKey);
    if (!selectedMember || selectedMember.isAutomated) {
      return false;
    }
    if (
      activeGroupOnly &&
      this.isInitiativeSystemEnabled &&
      selectedMember.unitId &&
      !this.isUnitInCurrentInitiativeGroup(selectedMember.unitId)
    ) {
      return false;
    }
    return predicate(selectedMember.unit);
  }

  private isBattleIntelOverlayExpanded(): boolean {
    if (!this.isBattleIntelOverlayVisible()) {
      return false;
    }
    const overlay = this.battleIntelOverlayRoot ?? document.getElementById("battleIntelOverlay");
    return overlay?.dataset.collapsed === "false";
  }

  private isBattleIntelOverlayVisible(): boolean {
    const overlay = this.battleIntelOverlayRoot ?? document.getElementById("battleIntelOverlay");
    return Boolean(
      overlay &&
      !overlay.classList.contains("hidden") &&
      overlay.getAttribute("aria-hidden") !== "true"
    );
  }

  private getSmokeCapableUnitHexKeys(activeGroupOnly = false): Set<string> {
    const engine = this.battleState.ensureGameEngine();
    const keys = new Set<string>();
    engine.playerUnits.forEach((unit) => {
      if (activeGroupOnly && (!unit.unitId || !this.isUnitInCurrentInitiativeGroup(unit.unitId))) {
        return;
      }
      const commandState = engine.getUnitCommandState(unit.hex, unit.unitId ?? undefined);
      if (commandState?.canLaySmoke !== true) {
        return;
      }
      const offset = CoordinateSystem.axialToOffset(unit.hex.q, unit.hex.r);
      keys.add(CoordinateSystem.makeHexKey(offset.col, offset.row));
    });
    return keys;
  }

  private getActivePlayerInitiativeGroupHexKeys(): Set<string> {
    if (!this.isInitiativeSystemEnabled || !this.initiativeMethods) {
      return this.getManualPlayerUnitHexKeys();
    }

    const queue = this.initiativeMethods.getCurrentInitiativeQueue();
    const activeGroup = this.resolveActiveInitiativeGroup(queue);
    if (!activeGroup || activeGroup.ownerId !== "player") {
      return new Set();
    }

    const keys = new Set<string>();
    activeGroup.activations.forEach((activation) => {
      const hexKey = this.resolveActivationOffsetHexKey(activation.unitId, activation.ownerId);
      if (hexKey) {
        keys.add(hexKey);
      }
    });
    return keys;
  }

  private getManualPlayerUnitHexKeys(): Set<string> {
    const engine = this.battleState.ensureGameEngine();
    const keys = new Set<string>();
    engine.playerUnits.forEach((unit) => {
      const commandState = engine.getUnitCommandState(unit.hex, unit.unitId ?? undefined);
      if (commandState?.isAutomated) {
        return;
      }
      const offset = CoordinateSystem.axialToOffset(unit.hex.q, unit.hex.r);
      keys.add(CoordinateSystem.makeHexKey(offset.col, offset.row));
    });
    return keys;
  }

  /**
   * WHAT: Wires deployment-panel events into battle-screen engine actions exactly once.
   * WHY: The deployment panel is long-lived, so repeated binding would process a single click
   * multiple times and could consume the same reserve twice.
   *
   * @returns Nothing. The method installs event handlers on the shared deployment panel.
   */
  private bindPanelEvents(): void {
    if (!this.deploymentPanel) {
      return;
    }
    if (this.panelEventsBound) {
      return;
    }
    this.panelEventsBound = true;

    this.deploymentPanel.on((event) => {
      const engine = this.battleState.ensureGameEngine();
      switch (event.type) {
        case "deploy": {
          const unitKey = event.payload?.unitKey as string;
          const hexKey = event.payload?.hexKey as string;
          if (!unitKey || !hexKey) {
            return;
          }
          const deploymentState = ensureDeploymentState();
          const remainingCapacity = (() => {
            const zoneKey = deploymentState.getZoneKeyForHex(hexKey);
            return zoneKey ? deploymentState.getRemainingZoneCapacity(zoneKey) : null;
          })();
          if (remainingCapacity !== null && remainingCapacity <= 0) {
            const zoneName = this.deploymentPanel?.resolveZoneForHex(hexKey)?.name ?? hexKey;
            this.reportDeploymentPanelError({
              title: "Deployment failed.",
              detail: `${zoneName} is already at capacity.`,
              action: this.buildDeploymentCapacityAction(zoneName),
              recoverable: true
            });
            return;
          }

          const parsed = CoordinateSystem.parseHexKey(hexKey);
          if (!parsed) {
            this.reportDeploymentPanelError({
              title: "Deployment failed.",
              detail: `The target hex (${hexKey}) could not be parsed.`,
              action: "Select a valid deployment-zone hex and try again.",
              recoverable: true
            });
            return;
          }
          const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
          const label = this.resolveUnitLabel(unitKey);
          const liveReserveCount = this.countLiveReservesForUnitKey(engine, unitKey);
          if (liveReserveCount <= 0) {
            // Log detailed diagnostic info to help debug reserve mismatches
            console.warn("[BattleScreen] Deployment failed - reserve count is 0", {
              unitKey,
              label,
              requestedHex: hexKey,
              engineReserves: engine.getReserveSnapshot().map(r => ({
                allocationKey: r.allocationKey,
                unitType: r.unit.type,
                unitStrength: r.unit.strength
              })),
              deploymentStateReserves: ensureDeploymentState().getReserves().map(r => ({
                unitKey: r.unitKey,
                label: r.label,
                remaining: r.remaining
              }))
            });

            // Force a mirror sync and recheck - the UI might be out of date
            this.refreshDeploymentMirrors("sync");

            // Re-check after sync - if placement is already there, it was a duplicate event
            if (this.isPlayerPlacementOccupyingHex(engine, axial)) {
              console.info("[BattleScreen] Hex already occupied - treating as duplicate deployment event");
              return;
            }

            // Try one more count after sync in case reserves appeared
            const recheckCount = this.countLiveReservesForUnitKey(engine, unitKey);
            if (recheckCount > 0) {
              console.info("[BattleScreen] Reserves appeared after sync - proceeding with deployment");
              // Continue to deployment below
            } else {
              const reserveSummary = this.summarizeLiveReserveQueue(engine);
              this.reportDeploymentPanelError({
                title: "Deployment failed - Unit not available",
                detail: reserveSummary
                  ? `${label} cannot be deployed. Available reserves: ${reserveSummary}. The unit may have already been deployed or the deployment panel needs refreshing.`
                  : `${label} cannot be deployed. No matching reserves remain in the queue. Try selecting a different unit or refreshing the deployment list.`,
                action: "Check the deployment panel for available units. If the unit you want is not listed, it may already be on the field. Try using 'Deploy Evenly' if manual placement fails.",
                recoverable: true
              });
              return;
            }
          }
          try {
            engine.deployUnitByKey(axial, unitKey);
            this.deploymentPanel?.setCriticalError(null);
            this.announceBattleUpdate(`Deployed ${label} to ${hexKey}.`);
            this.refreshDeploymentMirrors("deploy", { unitKey, hexKey, label });
            // Only unlock once every requisitioned deployable entry is placed. The engine
            // reserve snapshot can still include support or non-pool entries that should
            // not trap the deployment tutorial on Place The Line.
            if (this.countRemainingDeploymentPoolUnits() === 0) {
              this.completeTutorialPhase("place_units");
            }
          } catch (error) {
            console.error("Failed to deploy unit via key", unitKey, error);
            this.reportDeploymentPanelError({
              title: "Deployment failed.",
              detail: `${label} could not be deployed to ${hexKey}.`,
              action: "Choose a valid open hex and retry the deployment.",
              recoverable: true
            });
          }
          break;
        }
        case "recall": {
          const hexKey = event.payload?.hexKey as string;
          if (!hexKey) {
            return;
          }
          const recalledLabel = this.resolveUnitLabelForHex(hexKey);
          if (!recalledLabel) {
            this.reportDeploymentPanelError({
              title: "Recall failed.",
              detail: `No deployed unit could be resolved at ${hexKey}.`,
              action: "Select a hex occupied by one of your deployed units and try again.",
              recoverable: true
            });
            return;
          }
          try {
            engine.recallUnitByHexKey(hexKey);
            this.deploymentPanel?.setCriticalError(null);
            this.announceBattleUpdate(`Recalled ${recalledLabel} from ${hexKey}.`);
            this.refreshDeploymentMirrors("recall", { hexKey, label: recalledLabel });
          } catch (error) {
            console.error("Failed to recall unit from", hexKey, error);
            this.reportDeploymentPanelError({
              title: "Recall failed.",
              detail: `${recalledLabel} could not be recalled from ${hexKey}.`,
              action: "Retry the recall. If the hex remains occupied, reload the mission state.",
              recoverable: true
            });
            return;
          }
          break;
        }
        case "highlightZone": {
          const zoneKey = event.payload?.zoneKey as string;
          console.log("[BattleScreen] highlightZone event received:", { zoneKey, payload: event.payload });
          const zoneHexes = Array.from(this.deploymentPanel?.getZoneHexes(zoneKey) ?? []);
          console.log("[BattleScreen] Zone hexes for", zoneKey, ":", zoneHexes.slice(0, 5));
          if (zoneHexes.length > 0) {
            this.hexMapRenderer?.setZoneHighlights(zoneHexes);
            this.applySelectedHex(zoneHexes[0]);

            // Center camera on deployment zone (fire and forget - don't block event handler)
            this.centerCameraOnZone(zoneHexes).catch((err) => {
              console.warn("Failed to center camera on zone:", err);
            });
          }
          break;
        }
        case "callReserve": {
          const unitKey = event.payload?.unitKey as string;
          if (!unitKey) {
            return;
          }
          this.handleReserveCallupRequest(unitKey);
          break;
        }
      }
    });

    this.baseCampAssignButton?.addEventListener("click", () => this.handleAssignBaseCamp());
    this.deploymentPanelToggleButton?.addEventListener("click", () => {
      this.deploymentPanelBody?.classList.toggle("hidden");
      this.deploymentPanelToggleButton?.setAttribute(
        "aria-expanded",
        this.deploymentPanelBody?.classList.contains("hidden") ? "false" : "true"
      );
    });

    // Hook into tutorial overlay's request to focus a hex safely utilizing the engine's viewport tools.
    if (this.element.dataset.tutorialFocusBound !== "true") {
      this.element.dataset.tutorialFocusBound = "true";
      document.addEventListener("tutorial:focusHex", ((event: CustomEvent<{ selector: string; element: HTMLElement }>) => {
        if (!this.hexMapRenderer) {
          console.warn("[BattleScreen][tutorial:focusHex] renderer not ready; skipping focus");
          return;
        }

        const { element } = event.detail;

        console.log("[BattleScreen][tutorial:focusHex] event received", {
          hasHexAttr: element.hasAttribute("data-hex"),
          hasQ: element.hasAttribute("data-q"),
          hasR: element.hasAttribute("data-r"),
          rendererHasElements: typeof this.hexMapRenderer.getHexElement === "function",
          rendererInitialized: Boolean((this.hexMapRenderer as any).initialized)
        });

        // Extract hex key
        let hexKey: string | null = null;
        if (element.hasAttribute("data-hex")) {
          hexKey = element.getAttribute("data-hex");
        } else if (element.hasAttribute("data-q") && element.hasAttribute("data-r")) {
          const q = parseInt(element.getAttribute("data-q") || "0", 10);
          const r = parseInt(element.getAttribute("data-r") || "0", 10);
          const offset = CoordinateSystem.axialToOffset(q, r);
          hexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
        }

        if (hexKey) {
          const tutorialPhase = ensureTutorialState().getCurrentPhase();
          if (!this.shouldAllowTutorialHexCameraFocus(tutorialPhase)) {
            console.log("[BattleScreen][tutorial:focusHex] preserving combat tutorial camera", {
              hexKey,
              tutorialPhase
            });
            return;
          }

          // Safe programmatic pan via the established battle canvas methods.
          this.focusCameraOnHex(hexKey);
        } else {
          console.warn("[BattleScreen][tutorial:focusHex] no hex key resolved from element", {
            outerHTML: element.outerHTML?.slice?.(0, 200)
          });
        }
      }) as EventListener);
    }
  }

  /**
   * Mirrors engine -> DeploymentState and cascades UI refreshes in a single, predictable sequence.
   */
  private refreshDeploymentMirrors(
    reason: "deploy" | "recall" | "baseCamp" | "sync",
    context?: { unitKey?: string; hexKey?: string; label?: string }
  ): void {
    try {
      // 1. Ask the engine for its latest authoritative snapshot so UI mirrors stay honest.
      const engine = this.battleState.ensureGameEngine();
      const deploymentState = ensureDeploymentState();

      console.log("Refreshing deployment mirrors for reason:", reason, "Engine reserves:", engine.getReserveSnapshot().length, "Placements:", engine.getPlayerPlacementsSnapshot().length);

    // 2. Mirror engine -> DeploymentState exactly once per refresh call to avoid redundant bridge work.
      deploymentState.mirrorEngineState(engine);

      if (this.deploymentPanel) {
        const baseCampAxialKey = engine.baseCamp?.key ?? null;
        const baseCampOffsetKey = baseCampAxialKey ? CoordinateSystem.axialKeyToOffsetKey(baseCampAxialKey) : null;
        if (baseCampOffsetKey) {
          const zoneKey = deploymentState.getZoneKeyForHex(baseCampOffsetKey);
          this.deploymentPanel.markBaseCampAssigned(zoneKey);
          this.hexMapRenderer?.renderBaseCampMarker(baseCampOffsetKey);
        } else {
          this.deploymentPanel.markBaseCampPending();
          this.hexMapRenderer?.renderBaseCampMarker(null);
        }
      }

      console.log("Mirrored state - Pool size:", deploymentState.pool.length, "Reserves:", deploymentState.getReserves().length);

      // 3. Cascade UI updates in a stable order so each component renders data from the freshly mirrored state.
      this.updateDeploymentPanel();
      this.updateLoadout();
      this.updateReserveList();
      this.renderEngineUnits();

      // 4. Reinstate selection glow and zone outlines after sprite redraws so visual cues persist (Stage 3 highlight polish).
      if (this.hexMapRenderer) {
        if (this.selectedHexKey) {
          this.hexMapRenderer.toggleSelectionGlow(true, this.selectedHexKey);
        } else {
          this.hexMapRenderer.toggleSelectionGlow(false);
        }

        const phase = engine.getTurnSummary().phase;
        if (phase === "deployment") {
          const activeZoneKeys = (() => {
            if (!this.selectedHexKey) {
              return [] as Iterable<string>;
            }
            const zoneMeta = this.deploymentPanel?.resolveZoneForHex(this.selectedHexKey) ?? null;
            if (!zoneMeta) {
              return [] as Iterable<string>;
            }
            return this.deploymentPanel?.getZoneHexes(zoneMeta.key) ?? [];
          })();
          this.hexMapRenderer.setZoneHighlights(activeZoneKeys);
          this.hexMapRenderer.clearTacticalHighlights();
        } else {
          // During gameplay, zone highlights are not shown; objective markers provide visual feedback
          this.hexMapRenderer.setZoneHighlights([]);
          this.hexMapRenderer.setTacticalHighlights(this.playerMoveHexes, this.playerAttackHexes);
        }
      }

      switch (reason) {
        case "deploy": {
          const label = context?.label ?? "Unit";
          const hexKey = context?.hexKey ?? "target hex";
          const zoneMessage = this.composeZoneCapacityMessage(hexKey, deploymentState);
          this.announceBattleUpdate(`${label} deployed to ${hexKey}. ${zoneMessage}`.trim());
          break;
        }
        case "recall": {
          const label = context?.label ?? "Unit";
          const hexKey = context?.hexKey ?? "origin";
          const zoneMessage = this.composeZoneCapacityMessage(hexKey, deploymentState);
          this.announceBattleUpdate(`${label} recalled from ${hexKey}. ${zoneMessage}`.trim());
          break;
        }
        case "baseCamp": {
          const hexKey = context?.hexKey ?? this.selectedHexKey ?? "selected hex";
          this.announceBattleUpdate(`Base camp updated at ${hexKey}. Deployment zone capacities refreshed.`);
          break;
        }
        default:
          break;
      }
    } catch (error) {
      console.error("Error refreshing deployment mirrors:", error);
      this.reportDeploymentPanelError({
        title: "Deployment panel sync failed.",
        detail: "The battle screen could not refresh deployment state after the last action.",
        action: "Reload the mission before issuing additional deployment commands.",
        recoverable: true
      });
    }
  }

  private syncTurnContext(): void {
    if (!this.battleState.hasEngine()) {
      return;
    }
    const summary = this.battleState.getCurrentTurnSummary();
    this.updateTurnStatusDisplay(summary);
    this.updateTurnControls(summary);
    this.refreshIdleUnitHighlights(summary);
    if (this.isInitiativeSystemEnabled) {
      this.highlightCurrentInitiativeGroup();
    }
  }

  private evaluateMissionRules(): void {
    if (!this.missionRulesController || !this.battleState.hasEngine()) {
      return;
    }

    const previousStatus = this.missionStatus;
    const engine = this.battleState.ensureGameEngine();
    const turnSummary = engine.getTurnSummary();
    const occupancy = new Map<string, TurnFaction>();

    engine.playerUnits.forEach((unit) => {
      occupancy.set(`${unit.hex.q},${unit.hex.r}`, "Player");
    });
    engine.botUnits.forEach((unit) => {
      occupancy.set(`${unit.hex.q},${unit.hex.r}`, "Bot");
    });
    engine.allyUnits?.forEach((unit) => {
      occupancy.set(`${unit.hex.q},${unit.hex.r}`, "Ally");
    });

    const status = this.missionRulesController.onTurnAdvanced({
      turnSummary,
      scenario: this.scenario,
      occupancy,
      playerUnits: engine.playerUnits,
      botUnits: engine.botUnits,
      allyUnits: engine.allyUnits
    });

    this.missionStatus = status;

    if (status.phase && status.phase.id !== this.lastMissionPhaseId) {
      const isPhaseChange = previousStatus !== null && previousStatus.phase?.id !== status.phase.id;
      this.lastMissionPhaseId = status.phase.id;
      if (isPhaseChange) {
        this.announceBattleUpdate(status.phase.announcement);
      }
    }

    if (status.outcome.state !== "inProgress") {
      const reason = status.outcome.reason ?? (status.outcome.state === "playerVictory" ? "Mission success." : "Mission failed.");
      this.announceBattleUpdate(reason);
      if (!this.missionEndPrompted) {
        this.missionEndPrompted = true;
        this.showMissionEndModal(status.outcome.state, reason);
      }
    }

    this.renderMissionStatus();
    this.updateObjectiveMarkers();
    this.battleState.emitBattleUpdate("missionUpdated");
  }

  /**
   * Sets up the objective cycling handler for the CYCLE OBJECTIVE button
   */
  private setupObjectiveCycling(): void {
    if (!this.zoomPanControls || !this.scenario.objectives || this.scenario.objectives.length === 0) {
      console.log("[BattleScreen] setupObjectiveCycling: No objectives to cycle through");
      return;
    }

    console.log(`[BattleScreen] setupObjectiveCycling: ${this.scenario.objectives.length} objectives found`);
    this.currentObjectiveIndex = -1;
    this.renderBattleObjectiveSummary();
    this.zoomPanControls.onCycleObjective(async () => {
      if (!this.scenario.objectives || this.scenario.objectives.length === 0 || !this.mapViewport) {
        console.log("[BattleScreen] Cycle objective: No objectives available or viewport missing");
        return;
      }

      // Cycle to next objective
      this.currentObjectiveIndex = (this.currentObjectiveIndex + 1) % this.scenario.objectives.length;
      const objective = this.scenario.objectives[this.currentObjectiveIndex];
      this.renderBattleObjectiveSummary();

      console.log(`[BattleScreen] Cycling to objective ${this.currentObjectiveIndex + 1}/${this.scenario.objectives.length}`, objective.hex);

      // Convert to offset key and focus on it
      const offset = CoordinateSystem.axialToOffset(objective.hex.q, objective.hex.r);
      const offsetKey = CoordinateSystem.makeHexKey(offset.col, offset.row);

      console.log(`[BattleScreen] Converted axial ${objective.hex.q},${objective.hex.r} to offset key: ${offsetKey}`);

      // Set zoom to a good viewing level for objectives (2.5x)
      const currentTransform = this.mapViewport.getTransform();
      this.mapViewport.setTransform(2.5, currentTransform.panX, currentTransform.panY);

      // Wait a brief moment for zoom to apply
      await new Promise(resolve => setTimeout(resolve, 50));

      // Focus camera on objective using proper MapViewport system
      await this.focusCameraOnHex(offsetKey);

      // Announce which objective we're viewing
      const missionKey = this.uiState?.selectedMission ?? "training";
      const objectiveLabel = missionKey === "patrol_river_watch"
        ? `Ford ${this.currentObjectiveIndex + 1}`
        : `Objective ${this.currentObjectiveIndex + 1}`;
      this.announceBattleUpdate(`Viewing ${objectiveLabel} of ${this.scenario.objectives.length}`);
    });
  }

  private updateObjectiveMarkers(): void {
    if (!this.hexMapRenderer) {
      return;
    }

    this.hexMapRenderer.clearObjectiveMarkers();

    const missionMarkers = this.missionStatus?.markers ?? [];
    if (missionMarkers.length > 0) {
      missionMarkers.forEach((marker) => {
        const offset = CoordinateSystem.axialToOffset(marker.hex.q, marker.hex.r);
        const offsetKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
        this.hexMapRenderer?.renderObjectiveMarker(offsetKey, {
          status: marker.status,
          counter: marker.counter,
          tooltip: marker.tooltip
        });
      });
      return;
    }

    if (!this.scenario.objectives || this.scenario.objectives.length === 0 || !this.battleState.hasEngine()) {
      return;
    }

    const engine = this.battleState.ensureGameEngine();
    const occupancy = new Map<string, "Player" | "Bot" | "Ally">();
    engine.playerUnits.forEach((unit) => {
      occupancy.set(`${unit.hex.q},${unit.hex.r}`, "Player");
    });
    engine.botUnits.forEach((unit) => {
      occupancy.set(`${unit.hex.q},${unit.hex.r}`, "Bot");
    });
    engine.allyUnits?.forEach((unit) => {
      occupancy.set(`${unit.hex.q},${unit.hex.r}`, "Ally");
    });

    for (let i = 0; i < this.scenario.objectives.length; i++) {
      const objective = this.scenario.objectives[i];
      const axialKey = `${objective.hex.q},${objective.hex.r}`;
      const offset = CoordinateSystem.axialToOffset(objective.hex.q, objective.hex.r);
      const offsetKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
      const occupant = occupancy.get(axialKey);

      let status: "unoccupied" | "player" | "enemy";
      let tooltipText: string;

      if (occupant === "Bot") {
        status = "enemy";
        tooltipText = `Objective ${i + 1} - Enemy occupied.`;
      } else if (occupant === "Player" || occupant === "Ally") {
        status = "player";
        tooltipText = `Objective ${i + 1} - Secured by friendly forces.`;
      } else {
        status = "unoccupied";
        tooltipText = `Objective ${i + 1} - Unoccupied.`;
      }

      this.hexMapRenderer.renderObjectiveMarker(offsetKey, {
        status,
        tooltip: tooltipText
      });
    }
  }

  private renderBattleObjectiveSummary(): void {
    if (!this.objectiveSummaryButton || !this.objectiveIndexElement || !this.objectiveTitleElement || !this.objectiveStatusElement) {
      return;
    }

    const missionInfo = this.battleState.getPrecombatMissionInfo();
    const trackedObjectives = this.missionStatus?.objectives ?? [];
    const briefingObjectives = missionInfo?.objectives ?? [];
    const totalObjectives = Math.max(trackedObjectives.length, briefingObjectives.length, this.scenario.objectives.length);
    const displayIndex = Math.min(Math.max(this.currentObjectiveIndex, 0), Math.max(totalObjectives - 1, 0));
    const trackedObjective = trackedObjectives[displayIndex];
    const briefingObjective = briefingObjectives[displayIndex]?.replace(/^(Primary|Secondary|Tertiary):\s*/i, "");
    const title = trackedObjective?.label ?? briefingObjective ?? "Objective awaiting confirmation";
    const state = trackedObjective?.state ?? "pending";
    const stateLabels: Record<string, string> = {
      pending: "In Progress",
      inProgress: "In Progress",
      completed: "Secured",
      failed: "Failed"
    };
    const tier = trackedObjective?.tier ?? (displayIndex === 0 ? "primary" : "secondary");
    const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

    this.objectiveIndexElement.textContent = totalObjectives > 0
      ? `${tierLabel} Objective ${displayIndex + 1} of ${totalObjectives}`
      : "Objective";
    this.objectiveTitleElement.textContent = title;
    this.objectiveStatusElement.textContent = stateLabels[state] ?? state;
    this.objectiveStatusElement.dataset.state = state;
    this.objectiveSummaryButton.disabled = this.scenario.objectives.length === 0;
    this.objectiveSummaryButton.setAttribute(
      "aria-label",
      `${title}. Status: ${stateLabels[state] ?? state}. Focus this objective on the map.`
    );
    this.objectiveSummaryButton.title = `${title}. Status: ${stateLabels[state] ?? state}. Select to focus it on the map.`;
  }

  private renderMissionStatus(): void {
    this.renderBattleObjectiveSummary();
    const objectivesElement = this.missionObjectivesList;
    const doctrineElement = this.missionDoctrineElement;
    const turnLimitElement = this.missionTurnLimitElement;
    const outcome = this.missionStatus?.outcome ?? null;

    if (!objectivesElement) {
      return;
    }

    const missionInfo: PrecombatMissionInfo | null = this.battleState.getPrecombatMissionInfo();

    if (!this.missionStatus) {
      // Fall back to static briefing copy when mission rules have not evaluated yet.
      const objectives = missionInfo?.objectives ?? [];
      objectivesElement.innerHTML = objectives.length
        ? objectives.map((objective) => `<li>${objective}</li>`).join("")
        : "<li>Operational objectives will appear here.</li>";
      if (turnLimitElement && missionInfo?.turnLimit !== undefined && missionInfo?.turnLimit !== null) {
        turnLimitElement.textContent = `${missionInfo.turnLimit} turns`;
      }
      return;
    }

    const stateBadge = (state: string): string => {
      if (state === "completed") return '<span class="mission-pill mission-pill--success">Completed</span>';
      if (state === "failed") return '<span class="mission-pill mission-pill--danger">Failed</span>';
      if (state === "inProgress") return '<span class="mission-pill mission-pill--progress">In progress</span>';
      return `<span class="mission-pill">${state}</span>`;
    };

    objectivesElement.innerHTML = this.missionStatus.objectives
      .map((objective) => `<li><strong>${objective.label}</strong> ${stateBadge(objective.state)}${objective.detail ? `<div class="mission-objective-detail">${objective.detail}</div>` : ""}</li>`)
      .join("");

    if (turnLimitElement) {
      if (missionInfo?.turnLimit !== undefined && missionInfo?.turnLimit !== null) {
        turnLimitElement.textContent = `${missionInfo.turnLimit} turns`;
      } else {
        turnLimitElement.textContent = "Pending";
      }
    }

    if (doctrineElement && missionInfo?.doctrine) {
      doctrineElement.textContent = missionInfo.doctrine;
    }

    if (this.missionBriefingElement) {
      if (outcome && outcome.state !== "inProgress") {
        const label = outcome.state === "playerVictory" ? "Mission Complete" : "Mission Failed";
        this.missionBriefingElement.textContent = outcome.reason ? `${label}: ${outcome.reason}` : label;
      } else {
        const phaseLabel = this.missionStatus.phase ? `${this.missionStatus.phase.label}. ${this.missionStatus.phase.detail}` : "";
        const parts = [missionInfo?.briefing ?? "", phaseLabel].filter((part) => part.length > 0);
        this.missionBriefingElement.textContent = parts.join(" ");
      }
    }

    if (outcome && outcome.state !== "inProgress") {
      if (this.endMissionButton) {
        this.endMissionButton.classList.add("battle-button--highlight");
      }
    }
  }

  private showMissionEndModal(outcome: "playerVictory" | "playerDefeat", reason: string): void {
    this.disposeMissionEndModal();

    // Build detailed objectives list
    let objectivesSummary = "";
    if (this.missionStatus?.objectives && this.missionStatus.objectives.length > 0) {
      const completedCount = this.missionStatus.objectives.filter(obj => obj.state === "completed").length;
      const failedCount = this.missionStatus.objectives.filter(obj => obj.state === "failed").length;
      const totalCount = this.missionStatus.objectives.length;

      const objectivesList = this.missionStatus.objectives.map(obj => {
        const stateIcon = obj.state === "completed" ? "OK" : obj.state === "failed" ? "X" : "...";
        const stateColor = obj.state === "completed" ? "#4ade80" : obj.state === "failed" ? "#f87171" : "rgba(255,255,255,0.5)";
        const tierLabel = obj.tier === "primary" ? "PRIMARY" : obj.tier === "secondary" ? "SECONDARY" : "TERTIARY";
        const tierColor = obj.tier === "primary" ? "#fbbf24" : obj.tier === "secondary" ? "#60a5fa" : "#a78bfa";

        return `
          <div style="margin-bottom: 12px; padding: 12px; background: rgba(0,0,0,0.2); border-radius: 4px; border-left: 3px solid ${tierColor};">
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <span style="color: ${stateColor}; font-size: 1.2rem; font-weight: 700;">${stateIcon}</span>
              <span style="color: ${tierColor}; font-size: 0.75rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">${tierLabel}</span>
              <span style="color: rgba(255,255,255,0.9); font-weight: 600; flex: 1;">${this.escapeHtml(obj.label)}</span>
            </div>
            ${obj.detail ? `<div style="color: rgba(255,255,255,0.6); font-size: 0.85rem; margin-left: 32px;">${this.escapeHtml(obj.detail)}</div>` : ""}
          </div>
        `;
      }).join("");

      objectivesSummary = `
        <div style="margin: 24px 0; padding: 20px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); max-height: 400px; overflow-y: auto;">
          <div style="font-size: 0.9rem; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px;">Mission Objectives</div>
          <div style="font-size: 1rem; color: rgba(255,255,255,0.9); margin-bottom: 16px;">
            <span style="color: #4ade80; font-weight: 700;">${completedCount}</span> Completed |
            <span style="color: #f87171; font-weight: 700;">${failedCount}</span> Failed |
            <span style="color: rgba(255,255,255,0.7);">${totalCount - completedCount - failedCount}</span> Incomplete
          </div>
          ${objectivesList}
        </div>
      `;
    }

    const container = document.createElement("div");
    container.className = "mission-end-modal";
    container.setAttribute("role", "dialog");
    container.setAttribute("aria-modal", "true");
    container.innerHTML = `
      <div class="mission-end-modal__backdrop"></div>
      <div class="mission-end-modal__content">
        <h2 class="mission-end-modal__title">${outcome === "playerVictory" ? "Mission Complete" : "Mission Failed"}</h2>
        <p class="mission-end-modal__reason">${this.escapeHtml(reason)}</p>
        ${objectivesSummary}
        <p class="mission-end-modal__prompt">Return to headquarters now?</p>
        <div class="mission-end-modal__actions">
          <button type="button" class="battle-button mission-end-modal__button mission-end-modal__button--primary" data-mission-end="confirm">End Mission</button>
          <button type="button" class="battle-button mission-end-modal__button" data-mission-end="continue">Keep Playing</button>
        </div>
      </div>
    `;

    container.querySelector<HTMLButtonElement>("[data-mission-end='confirm']")?.addEventListener("click", () => {
      this.disposeMissionEndModal();
      void this.handleEndMission();
    });

    container.querySelector<HTMLButtonElement>("[data-mission-end='continue']")?.addEventListener("click", () => {
      this.disposeMissionEndModal();
      this.announceBattleUpdate("Continuing mission at commander request. Press End Mission when ready to exit.");
      this.endMissionButton?.classList.add("battle-button--highlight");
    });

    this.element.appendChild(container);
    this.missionEndModal = container;
  }

  private disposeMissionEndModal(): void {
    if (this.missionEndModal && this.missionEndModal.parentElement) {
      this.missionEndModal.parentElement.removeChild(this.missionEndModal);
    }
    this.missionEndModal = null;
  }

  /**
   * Rebuilds the idle-unit highlight set so the map outlines all player formations that have not acted this turn.
   * Accepts an optional pre-fetched turn summary to avoid redundant engine queries when callers already have it on hand.
   */
  private refreshIdleUnitHighlights(summary?: TurnSummary): void {
    const renderer = this.hexMapRenderer;
    if (!renderer) {
      this.idleUnitHighlightKeys.clear();
      return;
    }

    const initiativeActive =
      this.isInitiativeSystemEnabled && Boolean(this.initiativeMethods?.isInitiativeSystemActive());
    if (initiativeActive) {
      if (this.idleUnitHighlightKeys.size > 0) {
        renderer.clearIdleUnitHighlights();
        this.idleUnitHighlightKeys.clear();
      }
      return;
    }

    if (!this.battleState.hasEngine()) {
      if (this.idleUnitHighlightKeys.size > 0) {
        renderer.clearIdleUnitHighlights();
        this.idleUnitHighlightKeys.clear();
      }
      return;
    }

    const effectiveSummary = summary ?? this.battleState.getCurrentTurnSummary();
    const isPlayerTurn = effectiveSummary.phase === "playerTurn" && effectiveSummary.activeFaction === "Player";

    if (!isPlayerTurn) {
      if (this.idleUnitHighlightKeys.size > 0) {
        renderer.clearIdleUnitHighlights();
        this.idleUnitHighlightKeys.clear();
      }
      return;
    }

    const idleAxialKeys = this.battleState.getIdlePlayerUnitKeys();
    const nextHighlightKeys = new Set<string>();

    idleAxialKeys.forEach((axialKey) => {
      const offsetKey = CoordinateSystem.axialKeyToOffsetKey(axialKey);
      if (offsetKey) {
        nextHighlightKeys.add(offsetKey);
      }
    });

    this.idleUnitHighlightKeys.forEach((key) => {
      if (!nextHighlightKeys.has(key)) {
        renderer.toggleIdleUnitHighlight(key, false);
      }
    });

    nextHighlightKeys.forEach((key) => {
      if (!this.idleUnitHighlightKeys.has(key)) {
        renderer.toggleIdleUnitHighlight(key, true);
      }
    });

    this.idleUnitHighlightKeys = nextHighlightKeys;
  }

  private async triggerAirOperations(summary: TurnSummary): Promise<void> {
    void summary;
    const arrivals = this.battleState.consumeAirMissionArrivals();
    const engagements = this.battleState.consumeAirEngagements();
    if ((!arrivals || arrivals.length === 0) && (!engagements || engagements.length === 0)) {
      return;
    }
    await this.playAirOperations(arrivals ?? [], engagements ?? []);
  }

  private async triggerAirMissionArrivals(summary: TurnSummary): Promise<void> {
    void summary;
    const arrivals = this.battleState.consumeAirMissionArrivals();
    if (!arrivals || arrivals.length === 0) {
      return;
    }
    await this.playAirOperations(arrivals, []);
  }

  private async playAirMissionArrivals(arrivals: AirMissionArrival[]): Promise<void> {
    await this.playAirOperations(arrivals, []);
  }

  private async triggerAirEngagements(summary: TurnSummary): Promise<void> {
    void summary;
    const engagements = this.battleState.consumeAirEngagements();
    if (!engagements || engagements.length === 0) {
      return;
    }
    await this.playAirOperations([], engagements);
  }

  private async playAirEngagements(events: AirEngagementEvent[]): Promise<void> {
    await this.playAirOperations([], events);
  }

  private beginAirShowPlaybackCapture(
    arrivals: readonly AirMissionArrival[],
    events: readonly AirEngagementEvent[],
    engine: GameEngine
  ): ActiveAirShowPlaybackCaptureContext {
    return {
      base: {
        version: 1,
        recordedAtIso: new Date().toISOString(),
        missionKey: this.uiState?.selectedMission ?? "training",
        source: "BattleScreen.playAirOperations",
        scenario: this.deepCloneValue(this.scenario),
        arrivals: this.deepCloneValue([...arrivals]),
        events: this.deepCloneValue([...events]),
        playerUnits: this.deepCloneValue([...(engine.playerUnits ?? [])]),
        botUnits: this.deepCloneValue([...(engine.botUnits ?? [])]),
        allyUnits: this.deepCloneValue([...(engine.allyUnits ?? [])]),
        reserveUnits: this.deepCloneValue((engine.reserveUnits ?? []).map((entry) => entry.unit)),
        scheduledMissionsByFaction: {
          Player: this.deepCloneValue(engine.getScheduledAirMissions("Player")),
          Bot: this.deepCloneValue(engine.getScheduledAirMissions("Bot")),
          Ally: this.deepCloneValue(engine.getScheduledAirMissions("Ally"))
        },
        playerHq: typeof engine.getPlayerHq === "function" ? this.deepCloneValue(engine.getPlayerHq()) : null,
        botHq: typeof engine.getBotHq === "function" ? this.deepCloneValue(engine.getBotHq()) : null,
        playerHqKey: this.resolveEngineHqOffsetKey(engine, "Player"),
        botHqKey: this.resolveEngineHqOffsetKey(engine, "Bot")
      },
      operations: [],
      clusters: [],
      eventSceneCaptures: [],
      violations: [],
      error: null
    };
  }

  private finalizeAirShowPlaybackCapture(context: ActiveAirShowPlaybackCaptureContext): void {
    recordAirShowPlaybackCapture({
      ...context.base,
      operations: context.operations,
      clusters: context.clusters,
      eventSceneCaptures: context.eventSceneCaptures,
      violations: context.violations,
      error: context.error
    });
  }

  private snapshotAirPlaybackOperation(operation: AirPlaybackOperation): AirShowPlaybackOperationSnapshot {
    if (operation.kind === "linkedStrike") {
      return {
        kind: operation.kind,
        index: operation.index,
        focusKey: operation.focusKey,
        focusHex: operation.focusHex ? this.deepCloneValue(operation.focusHex) : null,
        missionId: operation.flight.missionId,
        unitKey: operation.flight.unitKey,
        unitType: operation.flight.unitType,
        eventType: null,
        bomberUnitKey: operation.flight.unitKey,
        escortUnitKeys: operation.escorts.map((flight) => flight.unitKey),
        interceptorUnitKeys: Array.from(
          new Set(
            operation.linkedEvents.flatMap((event) => event.interceptors.map((participant) => participant.unitKey))
          )
        ),
        linkedEventTypes: operation.linkedEvents.map((event) => event.type)
      };
    }
    if (operation.kind === "flight") {
      return {
        kind: operation.kind,
        index: operation.index,
        focusKey: operation.focusKey,
        focusHex: operation.focusHex ? this.deepCloneValue(operation.focusHex) : null,
        missionId: operation.flight.missionId,
        unitKey: operation.flight.unitKey,
        unitType: operation.flight.unitType,
        eventType: null,
        bomberUnitKey: operation.flight.kind === "strike" ? operation.flight.unitKey : null,
        escortUnitKeys: [],
        interceptorUnitKeys: [],
        linkedEventTypes: []
      };
    }
    return {
      kind: operation.kind,
      index: operation.index,
      focusKey: operation.focusKey,
      focusHex: this.deepCloneValue(operation.focusHex),
      missionId: operation.event.missionId ?? null,
      unitKey: null,
      unitType: null,
      eventType: operation.event.type,
      bomberUnitKey: operation.event.bomber.unitKey,
      escortUnitKeys: operation.event.escorts.map((participant) => participant.unitKey),
      interceptorUnitKeys: operation.event.interceptors.map((participant) => participant.unitKey),
      linkedEventTypes: [operation.event.type]
    };
  }

  private snapshotCoordinatedAirClusterPlaybackPlan(
    plan: CoordinatedAirClusterPlaybackPlan
  ): AirShowCoordinatedPlanSnapshot {
    return {
      focusKey: plan.focusKey,
      strikeMissionIds: [...plan.strikeMissionIds],
      handledOperationIndices: [...plan.handledOperationIndices],
      residualOperationIndices: plan.residualOperations.map((operation) => operation.index),
      bomberStartDelayMs: plan.bomberStartDelayMs,
      fighterIngressLeadMs: plan.fighterIngressLeadMs,
      scene: plan.scene ? this.deepCloneValue(plan.scene) : null
    };
  }

  private recordActiveAirShowPlaybackCluster(
    cluster: readonly AirPlaybackOperation[],
    coordinatedPlan: CoordinatedAirClusterPlaybackPlan | null
  ): void {
    if (!this.activeAirShowPlaybackCaptureContext) {
      return;
    }
    this.activeAirShowPlaybackCaptureContext.clusters.push({
      focusKey: cluster.find((operation) => operation.focusKey)?.focusKey ?? null,
      operationIndices: cluster.map((operation) => operation.index),
      operations: cluster.map((operation) => this.snapshotAirPlaybackOperation(operation)),
      coordinatedPlan: coordinatedPlan ? this.snapshotCoordinatedAirClusterPlaybackPlan(coordinatedPlan) : null,
      executionMode: coordinatedPlan ? "coordinated" : "parallel"
    });
  }

  private recordActiveAirShowResolvedEventSceneCapture(
    event: AirEngagementEvent,
    locKey: string,
    linkedEscortFlights: readonly PreparedAirMissionFlight[],
    missingLinkedEscortUnitKeys: readonly string[],
    bomberPassAvailable: boolean,
    scene: AirShowResolvedEventSceneCapture["scene"]
  ): void {
    if (!this.activeAirShowPlaybackCaptureContext) {
      return;
    }
    this.activeAirShowPlaybackCaptureContext.eventSceneCaptures.push({
      missionId: event.missionId ?? null,
      eventType: event.type,
      locKey,
      linkedEscortMissionIds: linkedEscortFlights.map((flight) => flight.missionId),
      linkedEscortUnitKeys: linkedEscortFlights.map((flight) => flight.unitKey),
      missingLinkedEscortUnitKeys: [...missingLinkedEscortUnitKeys],
      bomberPassAvailable,
      scene: this.deepCloneValue(scene)
    });
  }

  private recordActiveAirShowPlaybackViolation(violation: AirShowPlaybackContractViolation): void {
    if (!this.activeAirShowPlaybackCaptureContext) {
      return;
    }
    this.activeAirShowPlaybackCaptureContext.violations.push(this.deepCloneValue(violation));
  }

  private formatAirShowPlaybackError(error: unknown): string {
    if (error instanceof Error) {
      return error.stack ?? error.message;
    }
    return String(error);
  }

  private async playAirOperations(arrivals: AirMissionArrival[], events: AirEngagementEvent[]): Promise<void> {
    const renderer = this.hexMapRenderer;
    if (!renderer) {
      return;
    }

    this.closeSelectionIntelForAnimation();

    const engine = this.battleState.ensureGameEngine();
    const captureContext = this.beginAirShowPlaybackCapture(arrivals, events, engine);
    const previousCaptureContext = this.activeAirShowPlaybackCaptureContext;
    this.activeAirShowPlaybackCaptureContext = captureContext;
    let hadAnimationError = false;

    try {
      const preparedFlights = await this.collectAirMissionFlights(arrivals);
      const linkedEventsByMissionId = new Map<string, AirEngagementEvent[]>();
      const linkedEventsByBomberUnitKey = new Map<string, AirEngagementEvent[]>();

      for (const event of events) {
        if (event.missionId) {
          const linked = linkedEventsByMissionId.get(event.missionId) ?? [];
          linked.push(event);
          linkedEventsByMissionId.set(event.missionId, linked);
        }
        const linkedToBomber = linkedEventsByBomberUnitKey.get(event.bomber.unitKey) ?? [];
        linkedToBomber.push(event);
        linkedEventsByBomberUnitKey.set(event.bomber.unitKey, linkedToBomber);
      }

      const linkedEscortFlights = new Map<string, PreparedAirMissionFlight[]>();
      const nonEscortFlights: PreparedAirMissionFlight[] = [];
      for (const flight of preparedFlights) {
        if (flight.kind === "escort" && flight.escortTargetUnitKey) {
          const escorts = linkedEscortFlights.get(flight.escortTargetUnitKey) ?? [];
          escorts.push(flight);
          linkedEscortFlights.set(flight.escortTargetUnitKey, escorts);
          continue;
        }
        nonEscortFlights.push(flight);
      }

      const linkedStrikeFlights: Array<{ flight: PreparedAirMissionFlight; linkedEvents: AirEngagementEvent[]; escorts: PreparedAirMissionFlight[] }> = [];
      const linkedStrikeMissionIds = new Set<string>();
      const claimedAirBattleUnitKeys = new Set<string>();
      const claimedLinkedEvents = new Set<AirEngagementEvent>();
      for (const flight of nonEscortFlights) {
        const linkedEvents = Array.from(
          new Set([
            ...(linkedEventsByMissionId.get(flight.missionId) ?? []),
            ...(linkedEventsByBomberUnitKey.get(flight.unitKey) ?? [])
          ])
        );
        if (flight.kind === "strike" && linkedEvents.length > 0) {
          linkedStrikeMissionIds.add(flight.missionId);
          linkedEvents.forEach((event) => claimedLinkedEvents.add(event));
          const linkedEscorts = linkedEscortFlights.get(flight.unitKey) ?? [];
          linkedEvents.forEach((event) => {
            if (event.type !== "airToAir") {
              return;
            }
            event.interceptors.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
            event.escorts.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
            linkedEscorts.forEach((escortFlight) => claimedAirBattleUnitKeys.add(escortFlight.unitKey));
          });
          linkedStrikeFlights.push({
            flight,
            linkedEvents,
            escorts: linkedEscorts
          });
          linkedEscortFlights.delete(flight.unitKey);
        }
      }
      events.forEach((event) => {
        if (event.type !== "capClash") {
          return;
        }
        event.interceptors.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
        event.escorts.forEach((participant) => claimedAirBattleUnitKeys.add(participant.unitKey));
      });

      const standaloneFlights: PreparedAirMissionFlight[] = [];
      for (const flight of nonEscortFlights) {
        if (linkedStrikeMissionIds.has(flight.missionId)) {
          continue;
        }
        if ((flight.kind === "airCover" || flight.kind === "escort") && claimedAirBattleUnitKeys.has(flight.unitKey)) {
          continue;
        }
        standaloneFlights.push(flight);
      }
      linkedEscortFlights.forEach((escorts) =>
        standaloneFlights.push(
          ...escorts.filter((flight) => !claimedAirBattleUnitKeys.has(flight.unitKey))
        )
      );

      const standaloneEvents = events.filter((event) => !claimedLinkedEvents.has(event));

      const playbackOperations = this.buildAirPlaybackOperations(
        linkedStrikeFlights,
        standaloneFlights,
        standaloneEvents,
        engine
      );
      captureContext.operations = playbackOperations.map((operation) => this.snapshotAirPlaybackOperation(operation));
      const playbackClusters = this.clusterAirPlaybackOperations(playbackOperations);
      for (const cluster of playbackClusters) {
        await this.playAirPlaybackCluster(cluster, renderer, engine);
      }
    } catch (error) {
      hadAnimationError = true;
      captureContext.error = this.formatAirShowPlaybackError(error);
      console.error("[BattleScreen] Air operations animation failed", { arrivals, events }, error);
    } finally {
      this.finalizeAirShowPlaybackCapture(captureContext);
      this.activeAirShowPlaybackCaptureContext = previousCaptureContext;
    }

    if (hadAnimationError) {
      this.publishActivityEvent({
        category: "system",
        type: "log",
        summary: "Air operation animation failed. Check console for details."
      });
    }
  }

  private async collectAirMissionFlights(arrivals: AirMissionArrival[]): Promise<PreparedAirMissionFlight[]> {
    const flights: PreparedAirMissionFlight[] = [];
    const engine = this.battleState.ensureGameEngine();

    for (const arrival of arrivals) {
      try {
        const originOffsetKey = arrival.originHexKey ? CoordinateSystem.axialKeyToOffsetKey(arrival.originHexKey) : null;
        const candidateFlight: PreparedAirMissionFlight = {
          missionId: arrival.missionId,
          faction: arrival.faction,
          kind: arrival.kind,
          unitKey: arrival.unitKey,
          originKey: originOffsetKey ?? "",
          destKey: "",
          unitType: arrival.unitType,
          strength: arrival.unitStrength ?? this.resolveAirSquadronStrength(arrival.unitKey, arrival.faction, engine),
          laneOffsetPx: 0,
          targetHex: arrival.targetHex ? structuredClone(arrival.targetHex) : undefined,
          targetUnitKey: arrival.targetUnitKey,
          escortTargetUnitKey: arrival.escortTargetUnitKey
        };
        const destOffsetKey = this.resolvePreparedAirMissionDestKey(candidateFlight, engine);

        if (!originOffsetKey || !destOffsetKey) {
          const silentPatrolStationing =
            arrival.kind === "airCover"
            && !arrival.targetHex
            && !arrival.targetUnitKey
            && !arrival.escortTargetUnitKey;
          if (silentPatrolStationing) {
            continue;
          }
          console.warn("[BattleScreen] Air mission arrival animation skipped: unable to resolve geometry", {
            arrival,
            originOffsetKey,
            destOffsetKey
          });
          continue;
        }

        flights.push({
          ...candidateFlight,
          originKey: originOffsetKey,
          destKey: destOffsetKey,
        });
      } catch (error) {
        console.error("[BattleScreen] Failed while preparing air mission arrival animation", { arrival }, error);
      }
    }

    return this.assignAirMissionFlightLanes(flights);
  }

  private async playStandaloneAirMissionFlight(
    flight: PreparedAirMissionFlight,
    renderer: HexMapRenderer,
    engine: GameEngine,
    preFocused = false
  ): Promise<void> {
    const destKey = this.resolvePreparedAirMissionDestKey(flight, engine) ?? flight.destKey;
    if (!preFocused) {
      await this.focusCameraOnHex(destKey);
      await this.waitForNextFrame();
      await this.waitMs(this.scaleAirSequenceMs(180));
    }

    if (flight.kind === "strike") {
      await this.animateAircraftLeg(
        renderer,
        flight.originKey,
        destKey,
        flight.unitType,
        this.resolveBomberSortieIngressDurationMs(),
        undefined,
        1,
        flight.strength,
        flight.laneOffsetPx,
        flight.faction,
        "bomber"
      );
      await this.playResolvedAirStrikeImpact(flight, renderer, engine);
      await this.playDamagedAircraftReturn(
        renderer,
        destKey,
        flight.originKey,
        flight.unitType,
        0,
        flight.strength,
        flight.laneOffsetPx,
        0,
        flight.faction,
        this.resolveBomberSortieEgressDurationMs(),
        "bomber"
      );
      return;
    }

    await this.animateAircraftLeg(
      renderer,
      flight.originKey,
      destKey,
      flight.unitType,
      this.resolveFighterSortieIngressDurationMs(),
      undefined,
      1,
      flight.strength,
      flight.laneOffsetPx,
      flight.faction,
      "interceptor"
    );
    await this.playDamagedAircraftReturn(
      renderer,
      destKey,
      flight.originKey,
      flight.unitType,
      0,
      flight.strength,
      flight.laneOffsetPx,
      0,
      flight.faction,
      this.resolveFighterSortieEgressDurationMs(),
      "interceptor"
    );
  }

  private resolveAirEngagementOffsetKey(squadronIdOrHexKey: string, faction: "Player" | "Bot" | "Ally", engine: GameEngine): string | null {
    const unit = this.resolveAirSquadronUnit(squadronIdOrHexKey, faction, engine);
    if (!unit) {
      const missionOriginKey =
        engine
          .getScheduledAirMissions(faction)
          .find((mission) => mission.unitKey === squadronIdOrHexKey && typeof mission.originHexKey === "string")
          ?.originHexKey
        ?? null;
      if (missionOriginKey) {
        return CoordinateSystem.axialKeyToOffsetKey(missionOriginKey);
      }
      return CoordinateSystem.axialKeyToOffsetKey(squadronIdOrHexKey);
    }

    const offset = CoordinateSystem.axialToOffset(unit.hex.q, unit.hex.r);
    return CoordinateSystem.makeHexKey(offset.col, offset.row);
  }

  private async playStandaloneAirEngagementEvent(
    event: AirEngagementEvent,
    renderer: HexMapRenderer,
    engine: GameEngine,
    preFocused = false,
    laneOffsetPx = 0
  ): Promise<void> {
    const locOff = CoordinateSystem.axialToOffset(event.location.q, event.location.r);
    const locKey = CoordinateSystem.makeHexKey(locOff.col, locOff.row);

    if (!preFocused) {
      await this.focusCameraOnHex(locKey);
      await this.waitForNextFrame();
      await this.waitMs(this.scaleAirSequenceMs(180));
    }

    if (event.type === "flak") {
      this.announceFlakEngagement(event);
      const bomberFrom = this.resolveAirEngagementOffsetKey(event.bomber.unitKey, event.bomber.faction, engine);
      if (!bomberFrom) {
        return;
      }

      const flakWindowEnd = event.bomberDestroyed ? 0.84 : 0.92;
      let nextBurstProgress = 0.68;
      const visibleStrength =
        event.bomberStrengthBefore ?? event.bomber.strength ?? this.resolveAirSquadronStrength(event.bomber.unitKey, event.bomber.faction, engine);

      await this.animateAircraftLeg(
        renderer,
        bomberFrom,
        locKey,
        event.bomber.unitType,
        this.resolveBomberSortieIngressDurationMs(),
        (progress, centerX, centerY) => {
          while (progress >= nextBurstProgress && nextBurstProgress <= flakWindowEnd) {
            void renderer.playFlakBurstAt(centerX, centerY, event.interceptors.length, 1.08);
            nextBurstProgress += 0.08;
          }
        },
        event.bomberDestroyed ? 0.84 : 1,
        visibleStrength,
        laneOffsetPx,
        event.bomber.faction,
        "bomber"
      );

      if (!event.bomberDestroyed) {
        await this.playDamagedAircraftReturn(
          renderer,
          locKey,
          bomberFrom,
          event.bomber.unitType,
          event.flakDamage ?? 0,
          event.bomberStrengthAfter ?? event.bomberStrengthBefore ?? event.bomber.strength,
          laneOffsetPx,
          0,
          event.bomber.faction,
          this.resolveBomberSortieEgressDurationMs(),
          "bomber"
        );
      }
      return;
    }

    const bomberFrom = this.resolveAirEngagementOffsetKey(event.bomber.unitKey, event.bomber.faction, engine);
    await this.playMissionAirInterceptEvent(
      event,
      locKey,
      renderer,
      engine,
      laneOffsetPx,
      false,
      true,
      event.type === "capClash" ? 0 : this.resolveAirInterceptBomberArrivalDelayMs(),
      event.type !== "capClash",
      bomberFrom
    );
  }

  private async playMissionStrikeOperation(
    flight: PreparedAirMissionFlight,
    linkedEvents: AirEngagementEvent[],
    escortFlights: readonly PreparedAirMissionFlight[],
    renderer: HexMapRenderer,
    engine: GameEngine,
    preFocused = false
  ): Promise<void> {
    const destKey = this.resolvePreparedAirMissionDestKey(flight, engine) ?? flight.destKey;
    if (!preFocused) {
      await this.focusCameraOnHex(destKey);
      await this.waitForNextFrame();
      await this.waitMs(this.scaleAirSequenceMs(220));
    }

    const flakEvent = linkedEvents.find((event) => event.type === "flak") ?? null;
    const airToAirEvent = linkedEvents.find((event) => event.type === "airToAir") ?? null;
    const interceptLocKey = airToAirEvent ? this.toOffsetHexKey(airToAirEvent.location) ?? destKey : destKey;

    let nextBurstProgress = 0.68;
    const flakWindowEnd = flakEvent?.bomberDestroyed ? 0.84 : 0.92;

    // Get bomber strength for formation rendering
    const bomberStrength = flakEvent?.bomberStrengthBefore ?? airToAirEvent?.bomber.strength ?? flight.strength;
    const mission = engine.getScheduledAirMissions(flight.faction).find((entry) => entry.id === flight.missionId) ?? null;
    const outcome = mission?.outcome as any;
    const totalAttrition =
      Math.max(0, Number(outcome?.meta?.flakAttrition ?? 0)) +
      Math.max(0, Number(outcome?.meta?.bomberAttrition ?? 0));

    const bomberDestroyedBeforeImpact = flakEvent?.bomberDestroyed === true || airToAirEvent?.bomberDestroyed === true;
    const remainingStrength = Math.max(1, Math.round((bomberStrength ?? 100) - totalAttrition));

    if (airToAirEvent) {
      await this.playMissionAirInterceptEvent(
        airToAirEvent,
        interceptLocKey,
        renderer,
        engine,
        flight.laneOffsetPx,
        false,
        true,
        this.resolveAirInterceptBomberArrivalDelayMs(),
        true,
        flight.originKey,
        escortFlights,
        destKey,
        flakEvent
      );

      if (flakEvent) {
        this.announceFlakEngagement(flakEvent);
      }

      if (bomberDestroyedBeforeImpact) {
        return;
      }
      await this.playResolvedAirStrikeImpact(flight, renderer, engine, false);
      return;
    }

    const escortAnimations = escortFlights.map((escortFlight) =>
      this.playEscortCompanionFlight(escortFlight, destKey, renderer)
    );

    await Promise.all([
      (async () => {
        await this.animateAircraftLeg(
          renderer,
          flight.originKey,
          destKey,
          flight.unitType,
          this.resolveBomberSortieIngressDurationMs(),
          (progress, centerX, centerY) => {
            if (flakEvent) {
              while (progress >= nextBurstProgress && nextBurstProgress <= flakWindowEnd) {
                void renderer.playFlakBurstAt(centerX, centerY, flakEvent.interceptors.length, 1.08);
                nextBurstProgress += 0.08;
              }
            }
          },
          flakEvent?.bomberDestroyed ? 0.84 : 1,
          bomberStrength,
          flight.laneOffsetPx,
          flight.faction,
          "bomber"
        );

        if (!bomberDestroyedBeforeImpact) {
          await this.playResolvedAirStrikeImpact(flight, renderer, engine);
          await this.playDamagedAircraftReturn(
            renderer,
            destKey,
            flight.originKey,
            flight.unitType,
            totalAttrition,
            remainingStrength,
            flight.laneOffsetPx,
            0,
            flight.faction,
            this.resolveBomberSortieEgressDurationMs(),
            "bomber"
          );
        }
      })(),
      ...escortAnimations
    ]);
  }

  private async playMissionAirInterceptEvent(
    event: AirEngagementEvent,
    locKey: string,
    renderer: HexMapRenderer,
    engine: GameEngine,
    fallbackLaneOffsetPx = 0,
    skipEscortFlights = false,
    announceEvent = true,
    bomberArrivalDelayMs = 0,
    allowBomberDefensePass = true,
    bomberOriginKey: string | null = null,
    linkedEscortFlights: readonly PreparedAirMissionFlight[] = [],
    bomberTargetKey: string | null = null,
    flakEvent: AirEngagementEvent | null = null
  ): Promise<void> {
    if (announceEvent) {
      this.announceAirInterceptEngagement(event);
    }
    const escortParticipants = [
      ...event.escorts.map((escort, index) => ({
        faction: escort.faction,
        unitKey: escort.unitKey,
        unitType: escort.unitType,
        strength: escort.strength,
        eventIndex: index,
        originKey: null as string | null
      }))
    ];
    const participantOffsets = this.buildAirLaneOffsets(event.interceptors.length + escortParticipants.length);
    const participants: Array<{
      unitKey: string;
      role: "interceptor" | "escort";
      phaseIndex: number;
      unitType: string;
      faction: TurnFaction;
      originKey: string;
      laneOffsetPx: number;
      orbitIndex: number;
      clockwise: boolean;
      initialStrength: number;
      strengthAfterEscortPhase: number;
      finalStrength: number;
    }> = [];
    let participantIndex = 0;

    event.interceptors.forEach((interceptor, index) => {
      const from = this.resolveAirEngagementOffsetKey(interceptor.unitKey, interceptor.faction, engine);
      if (from) {
        const laneOffset = participantOffsets[participantIndex] ?? fallbackLaneOffsetPx;
        const initialStrength =
          interceptor.strength ?? this.resolveAirSquadronStrength(interceptor.unitKey, interceptor.faction, engine);
        participants.push({
          unitKey: interceptor.unitKey,
          role: "interceptor",
          phaseIndex: index,
          unitType: interceptor.unitType,
          faction: interceptor.faction,
          originKey: from,
          laneOffsetPx: laneOffset,
          orbitIndex: participantIndex,
          clockwise: false,
          initialStrength,
          strengthAfterEscortPhase: this.resolveAirEngagementPhaseStrength(
            event.interceptorStrengthsAfterEscortPhase,
              index,
              initialStrength
            ),
          finalStrength: this.resolveAirEngagementPhaseStrength(event.interceptorFinalStrengths, index, initialStrength)
        });
      }
      participantIndex += 1;
    });

    escortParticipants.forEach((escort, index) => {
      if (!skipEscortFlights) {
        const from = escort.originKey ?? this.resolveAirEngagementOffsetKey(escort.unitKey, escort.faction, engine);
        if (from) {
          const laneOffset = participantOffsets[participantIndex] ?? -fallbackLaneOffsetPx;
          const initialStrength =
            escort.strength ?? this.resolveAirSquadronStrength(escort.unitKey, escort.faction, engine);
          participants.push({
            unitKey: escort.unitKey,
            role: "escort",
            phaseIndex: index,
            unitType: escort.unitType,
            faction: escort.faction,
            originKey: from,
            laneOffsetPx: laneOffset,
            orbitIndex: participantIndex,
            clockwise: true,
            initialStrength,
            strengthAfterEscortPhase:
              typeof escort.eventIndex === "number"
                ? this.resolveAirEngagementPhaseStrength(
                    event.escortStrengthsAfterEscortPhase,
                    escort.eventIndex,
                    initialStrength
                  )
                : initialStrength,
            finalStrength:
              typeof escort.eventIndex === "number"
                ? this.resolveAirEngagementPhaseStrength(event.escortFinalStrengths, escort.eventIndex, initialStrength)
                : initialStrength
          });
        }
      }
      participantIndex += 1;
    });

    if (participants.length === 0) {
      return;
    }

    const includeBomberFlight = event.type !== "capClash";
    const bomberPassAvailable = includeBomberFlight && allowBomberDefensePass && this.shouldPlayBomberDefensePass(event);
    const resolvedBomberOriginKey =
      bomberOriginKey ?? this.resolveAirEngagementOffsetKey(event.bomber.unitKey, event.bomber.faction, engine);
    const interceptorSceneParticipants = participants.filter((participant) => participant.role === "interceptor");
    const escortSceneParticipants = participants.filter((participant) => participant.role === "escort");
    const phaseTimings = buildResolvedAirCombatSceneTimingPolicy(bomberArrivalDelayMs);
    const { scene, diagnostics } = buildResolvedAirCombatScene(event, {
      locKey,
      resolveOriginKey: (unitKey, faction) => this.resolveAirEngagementOffsetKey(unitKey, faction, engine),
      resolveStrength: (unitKey, faction) => this.resolveAirSquadronStrength(unitKey, faction, engine),
      fallbackLaneOffsetPx,
      interceptorLaneOffsets: interceptorSceneParticipants.map((participant) => participant.laneOffsetPx),
      escortLaneOffsets: escortSceneParticipants.map((participant) => participant.laneOffsetPx),
      bomberLaneOffsetPx: fallbackLaneOffsetPx,
      linkedEscortFlights: skipEscortFlights ? [] : linkedEscortFlights,
      bomberOriginKey: resolvedBomberOriginKey,
      bomberTargetKey,
      flakEvent,
      includeBomber: includeBomberFlight,
      phaseTimings,
      playerHqKey: this.resolveEngineHqOffsetKey(engine, "Player"),
      botHqKey: this.resolveEngineHqOffsetKey(engine, "Bot")
    });
    if (!bomberPassAvailable) {
      scene.bomberPassExchanges = [];
    }
    this.recordActiveAirShowResolvedEventSceneCapture(
      event,
      locKey,
      linkedEscortFlights,
      diagnostics.linkedEscortMissingFromEventUnitKeys,
      bomberPassAvailable,
      scene
    );
    if (diagnostics.linkedEscortMissingFromEventUnitKeys.length > 0) {
      const message =
        `[AirSprite] Linked escort flights missing from resolved event ${event.missionId ?? event.type}: ` +
        diagnostics.linkedEscortMissingFromEventUnitKeys.join(", ");
      if (event.type === "airToAir" && linkedEscortFlights.length > 0) {
        const violation: AirShowPlaybackContractViolation = {
          code: "linked-escort-missing-from-event",
          message,
          missionId: event.missionId ?? null,
          eventType: event.type,
          unitKeys: [...diagnostics.linkedEscortMissingFromEventUnitKeys]
        };
        this.recordActiveAirShowPlaybackViolation(violation);
        console.error(message, {
          linkedEscortFlightMissionIds: linkedEscortFlights.map((flight) => flight.missionId),
          linkedEscortFlightUnitKeys: linkedEscortFlights.map((flight) => flight.unitKey),
          eventEscortUnitKeys: event.escorts.map((escort) => escort.unitKey)
        });
        throw new Error(message);
      }
      console.warn(message);
    }
    await renderer.animateResolvedAirCombatShow(scene);
  }

  private async playResolvedAirStrikeImpact(
    flight: PreparedAirMissionFlight,
    renderer: HexMapRenderer,
    engine: GameEngine,
    playEffects = true
  ): Promise<void> {
    const mission = engine.getScheduledAirMissions(flight.faction).find((entry) => entry.id === flight.missionId) ?? null;
    const outcome = mission?.outcome as any;
    if (!mission || !outcome || outcome.type !== "strike" || outcome.result === "aborted" || !outcome.defenderType) {
      return;
    }

    const impactKey = this.resolvePreparedAirMissionDestKey(flight, engine) ?? flight.destKey;

    if (playEffects) {
      await renderer.playExplosion(impactKey, true);
      await renderer.playDustCloud(impactKey);
    }

    const defenderType = typeof outcome.defenderType === "string" ? outcome.defenderType : null;
    const defenderClass = defenderType ? (this.unitTypes?.[defenderType as keyof UnitTypeDictionary]?.class as UnitClass | undefined) : undefined;

    if (outcome.defenderDestroyed) {
      renderer.markHexWrecked(impactKey, defenderClass, 2);
    } else if (typeof mission.targetHex?.q === "number" && typeof mission.targetHex?.r === "number") {
      const opponentUnits = flight.faction === "Player" ? engine.botUnits : engine.playerUnits;
      const defenderNow = opponentUnits.find((unit) => unit.hex.q === mission.targetHex!.q && unit.hex.r === mission.targetHex!.r) ?? null;
      renderer.markHexDamaged(impactKey, defenderClass, defenderNow?.strength, 2);
    }

    this.renderEngineUnits();
  }

  private async playDamagedAircraftReturn(
    renderer: HexMapRenderer,
    fromKey: string,
    toKey: string,
    unitType: string,
    damage: number,
    strength?: number,
    laneOffsetPx = 0,
    initialDelayMs = 120,
    faction?: TurnFaction,
    durationMs?: number,
    role: AirShowRole = "interceptor"
  ): Promise<void> {
    const smokeScale = damage >= 36 ? 0.82 : damage >= 18 ? 0.7 : 0.58;
    const smokeInterval = damage >= 36 ? 0.12 : damage >= 18 ? 0.16 : 0.22;
    let nextSmokeProgress = 0.1;

    if (initialDelayMs > 0) {
      await this.waitMs(initialDelayMs);
    }
    await this.animateAircraftLeg(renderer, fromKey, toKey, unitType, durationMs ?? this.scaleAirSequenceMs(1900), (progress, centerX, centerY) => {
      if (damage <= 0) {
        return;
      }
      while (progress >= nextSmokeProgress && nextSmokeProgress < 0.96) {
        void renderer.playAirDamageSmokeTrailAt(centerX - 4, centerY + 2, smokeScale);
        nextSmokeProgress += smokeInterval;
      }
    }, 1, strength, laneOffsetPx, faction, role);
  }

  private announceFlakEngagement(event: AirEngagementEvent): void {
    let engine: GameEngine | null = null;
    try {
      engine = this.battleState.ensureGameEngine();
    } catch {
      engine = null;
    }
    this.markDetailedAirCombatPublished(engine?.turnNumber ?? null, [event.bomber.unitKey]);
    const flakEngagements = Array.isArray(event.flakEngagements) ? event.flakEngagements : null;
    if (flakEngagements && flakEngagements.length > 0) {
      flakEngagements.forEach((engagement, index) => {
        const batteryHex = engagement.batteryHex ? this.formatAxialHexForDisplay(engagement.batteryHex) : "unknown";
        const bomberLabel = engagement.bomberLabel ?? this.toTitleCase(engagement.bomberUnitType);
        const summary =
          `${this.toTitleCase(engagement.batteryUnitType)} at ${batteryHex} opened fire on ${bomberLabel} during final approach. ` +
          `${Math.max(0, Math.round(engagement.damageToBomber))} air damage; bomber strength now ${Math.max(0, Math.round(engagement.bomberStrengthAfter))}.` +
          (engagement.bomberDestroyed && index === flakEngagements.length - 1 ? " Strike package broken up before release." : "");
        this.announceBattleUpdate(summary);
        this.publishActivityEvent({
          category: engagement.batteryFaction === "Player" ? "player" : "enemy",
          type: "log",
          summary,
          details: {
            batteryUnitKey: engagement.batteryUnitKey,
            batteryUnitType: engagement.batteryUnitType,
            damageToBomber: Math.max(0, Math.round(engagement.damageToBomber)),
            bomberStrengthAfter: Math.max(0, Math.round(engagement.bomberStrengthAfter)),
            bomberDestroyed: engagement.bomberDestroyed
          }
        });
      });
      return;
    }

    const batteryCount = event.interceptors.length;
    const batteryLabel = batteryCount === 1 ? "battery" : "batteries";
    const bomberLabel = event.bomber.label ?? this.toTitleCase(event.bomber.unitType);
    const flakDamage = Math.max(0, Math.round(event.flakDamage ?? 0));
    const strengthAfter = Math.max(0, Math.round(event.bomberStrengthAfter ?? 0));
    const destructionSuffix = event.bomberDestroyed ? " Strike package broken up before release." : "";
    const summary = `${batteryCount} Flak ${batteryLabel} engaged ${bomberLabel} on final approach. AA damage: ${flakDamage}%. Bomber strength now ${strengthAfter}.${destructionSuffix}`;
    this.announceBattleUpdate(summary);
    this.publishActivityEvent({
      category: event.interceptors[0]?.faction === "Player" ? "player" : "enemy",
      type: "log",
      summary,
      details: {
        batteryCount,
        bomberLabel,
        flakDamage,
        bomberStrengthAfter: strengthAfter,
        bomberDestroyed: event.bomberDestroyed === true
      }
    });
  }

  private announceAirInterceptEngagement(event: AirEngagementEvent): void {
    let engine: GameEngine | null = null;
    try {
      engine = this.battleState.ensureGameEngine();
    } catch {
      engine = null;
    }
    this.markDetailedAirCombatPublished(
      engine?.turnNumber ?? null,
      [
        ...event.interceptors.map((interceptor) => interceptor.unitKey),
        ...event.escorts.map((escort) => escort.unitKey)
      ]
    );
    if (
      (Array.isArray(event.escortExchanges) && event.escortExchanges.length > 0) ||
      (Array.isArray(event.bomberPassExchanges) && event.bomberPassExchanges.length > 0)
    ) {
      const location = this.formatAxialHexForDisplay(event.location);
      const lowerFactionLabel = (faction: TurnFaction): string =>
        faction === "Player" ? "player" : faction === "Ally" ? "allied" : "enemy";
      const publishExchange = (
        summary: string,
        category: "player" | "enemy",
        details: Record<string, unknown>
      ): void => {
        this.announceBattleUpdate(summary);
        this.publishActivityEvent({
          category,
          type: "log",
          summary,
          details
        });
      };

      (event.escortExchanges ?? []).forEach((exchange, index) => {
        const category = exchange.attackerFaction === "Bot" && exchange.defenderFaction === "Bot" ? "enemy" : "player";
        const phaseLabel = exchange.phase === "capClash" ? "CAP clash" : "escort clash";
        const attackerCombatant = this.formatAirCombatantSummary(
          exchange.attackerLabel,
          exchange.attackerUnitKey,
          exchange.attackerUnitType,
          exchange.attackerFaction,
          engine
        );
        const defenderCombatant = this.formatAirCombatantSummary(
          exchange.defenderLabel,
          exchange.defenderUnitKey,
          exchange.defenderUnitType,
          exchange.defenderFaction,
          engine
        );
        const attackerLabel = `${this.formatAirFactionLabel(exchange.attackerFaction)} ${attackerCombatant}`;
        const defenderLabel = `${this.formatAirFactionLabel(exchange.defenderFaction)} ${defenderCombatant}`;
        const summary =
          `${phaseLabel} over ${location}: ${attackerLabel} hit ${lowerFactionLabel(exchange.defenderFaction)} ${defenderCombatant} ` +
          `for ${Math.max(0, Math.round(exchange.damageToDefender))} air damage and took ${Math.max(0, Math.round(exchange.retaliationDamage))} in return.` +
          (exchange.defenderDestroyed ? ` ${defenderLabel} destroyed.` : "") +
          (exchange.attackerDestroyed ? ` ${attackerLabel} destroyed.` : "");
        publishExchange(summary, category, {
          phase: exchange.phase,
          phaseLabel,
          exchangeIndex: index,
          attackerUnitKey: exchange.attackerUnitKey,
          defenderUnitKey: exchange.defenderUnitKey,
          attackerStrengthBefore: this.formatReadinessValue(exchange.attackerStrengthBefore),
          attackerStrengthAfter: this.formatReadinessValue(exchange.attackerStrengthAfter),
          defenderStrengthBefore: this.formatReadinessValue(exchange.defenderStrengthBefore),
          defenderStrengthAfter: this.formatReadinessValue(exchange.defenderStrengthAfter),
          damageToPatrol: Math.max(0, Math.round(exchange.damageToDefender)),
          retaliationDamage: Math.max(0, Math.round(exchange.retaliationDamage)),
          attackerDestroyed: exchange.attackerDestroyed,
          defenderDestroyed: exchange.defenderDestroyed,
          damageSummaryToDefender: exchange.damageSummaryToDefender?.summary,
          retaliationDamageSummary: exchange.retaliationDamageSummary?.summary
        });
      });

      (event.bomberPassExchanges ?? []).forEach((exchange, index) => {
        const category = exchange.attackerFaction === "Bot" ? "enemy" : "player";
        const attackerCombatant = this.formatAirCombatantSummary(
          exchange.attackerLabel,
          exchange.attackerUnitKey,
          exchange.attackerUnitType,
          exchange.attackerFaction,
          engine
        );
        const defenderCombatant = this.formatAirCombatantSummary(
          exchange.defenderLabel,
          exchange.defenderUnitKey,
          exchange.defenderUnitType,
          exchange.defenderFaction,
          engine
        );
        const summary =
          `Bomber pass over ${location}: ${this.formatAirFactionLabel(exchange.attackerFaction)} ${attackerCombatant} hit ` +
          `${lowerFactionLabel(exchange.defenderFaction)} ${defenderCombatant} ` +
          `for ${Math.max(0, Math.round(exchange.damageToDefender))} air damage; bomber defensive fire dealt ${Math.max(0, Math.round(exchange.retaliationDamage))} air damage. ` +
          `Bomber strength now ${Math.max(0, Math.round(exchange.defenderStrengthAfter))}.` +
          (exchange.defenderDestroyed && index === (event.bomberPassExchanges?.length ?? 1) - 1 ? " Strike package destroyed before target." : "") +
          (exchange.attackerDestroyed ? " Patrol flight lost on the attack run." : "");
        publishExchange(summary, category, {
          phase: exchange.phase,
          exchangeIndex: index,
          attackerUnitKey: exchange.attackerUnitKey,
          defenderUnitKey: exchange.defenderUnitKey,
          attackerStrengthBefore: this.formatReadinessValue(exchange.attackerStrengthBefore),
          attackerStrengthAfter: this.formatReadinessValue(exchange.attackerStrengthAfter),
          bomberStrengthBefore: this.formatReadinessValue(exchange.defenderStrengthBefore),
          damageToBomber: Math.max(0, Math.round(exchange.damageToDefender)),
          retaliationDamage: Math.max(0, Math.round(exchange.retaliationDamage)),
          bomberStrengthAfter: Math.max(0, Math.round(exchange.defenderStrengthAfter)),
          attackerDestroyed: exchange.attackerDestroyed,
          bomberDestroyed: exchange.defenderDestroyed,
          damageSummaryToDefender: exchange.damageSummaryToDefender?.summary,
          retaliationDamageSummary: exchange.retaliationDamageSummary?.summary
        });
      });
      return;
    }

    const interceptorFaction = event.interceptors[0]?.faction ?? "Player";
    const interceptorLabel = interceptorFaction === "Player" ? "Player air patrol" : "Enemy air patrol";
    const bomberFaction = event.bomber.faction === "Player" ? "player" : "enemy";
    const location = this.formatAxialHexForDisplay(event.location);
    const escortNote = event.escorts.length > 0 ? ` ${event.escorts.length} escort${event.escorts.length === 1 ? "" : "s"} responded.` : "";
    const strengthBefore =
      typeof event.bomberStrengthBefore === "number"
        ? Math.max(0, Math.round(event.bomberStrengthBefore))
        : typeof event.bomber.strength === "number"
          ? Math.max(0, Math.round(event.bomber.strength))
          : null;
    const strengthAfter =
      typeof event.bomberStrengthAfter === "number"
        ? Math.max(0, Math.round(event.bomberStrengthAfter))
        : null;
    const interceptDamage =
      strengthBefore !== null && strengthAfter !== null
        ? Math.max(0, strengthBefore - strengthAfter)
        : null;
    const interceptorAttrition = Math.max(0, Math.round(event.interceptorAttrition ?? 0));
    const escortPhaseInterceptorAttrition = Math.max(0, Math.round(event.escortPhaseInterceptorAttrition ?? 0));
    const bomberDefenseInterceptorAttrition = Math.max(0, Math.round(event.bomberDefenseInterceptorAttrition ?? 0));
    const interceptorKills = Math.max(0, Math.round(event.interceptorKills ?? 0));
    const escortAttrition = Math.max(0, Math.round(event.escortAttrition ?? 0));
    const escortKills = Math.max(0, Math.round(event.escortKills ?? 0));
    const attritionNote =
      interceptDamage !== null && strengthAfter !== null
        ? ` Interception damage: ${interceptDamage}%. Bomber strength now ${strengthAfter}.`
        : "";
    const escortClashNote =
      escortPhaseInterceptorAttrition > 0
        ? ` Escort clash dealt ${escortPhaseInterceptorAttrition} air damage to the patrol.`
        : "";
    const bomberDefenseNote =
      bomberDefenseInterceptorAttrition > 0
        ? ` Bomber defensive fire dealt ${bomberDefenseInterceptorAttrition} air damage to the patrol.`
        : "";
    const interceptorNote =
      interceptorAttrition > 0
        ? escortClashNote || bomberDefenseNote
          ? `${escortClashNote}${bomberDefenseNote}${interceptorKills > 0 ? ` Patrol lost ${interceptorKills} flight${interceptorKills === 1 ? "" : "s"}.` : ""}`
          : ` Patrol took ${interceptorAttrition} air damage${interceptorKills > 0 ? ` and lost ${interceptorKills} flight${interceptorKills === 1 ? "" : "s"}` : ""}.`
        : interceptorKills > 0
          ? ` Patrol lost ${interceptorKills} flight${interceptorKills === 1 ? "" : "s"}.`
          : "";
    const escortDamageNote =
      escortAttrition > 0
        ? ` Escorts took ${escortAttrition} air damage${escortKills > 0 ? ` and lost ${escortKills} flight${escortKills === 1 ? "" : "s"}` : ""}.`
        : escortKills > 0
          ? ` Escorts lost ${escortKills} flight${escortKills === 1 ? "" : "s"}.`
          : "";
    const destructionNote = event.bomberDestroyed ? " Strike package destroyed before target." : "";
    const summary = `${interceptorLabel} intercepted ${bomberFaction} ${this.toTitleCase(event.bomber.unitType)} over ${location}.${escortNote}${attritionNote}${interceptorNote}${escortDamageNote}${destructionNote}`;
    this.announceBattleUpdate(summary);
    const details: Record<string, unknown> = {};
    if (interceptDamage !== null) {
      details.interceptionDamage = interceptDamage;
    }
    if (interceptorAttrition > 0) {
      details.interceptorAttrition = interceptorAttrition;
    }
    if (escortPhaseInterceptorAttrition > 0) {
      details.escortPhaseInterceptorAttrition = escortPhaseInterceptorAttrition;
    }
    if (bomberDefenseInterceptorAttrition > 0) {
      details.bomberDefenseInterceptorAttrition = bomberDefenseInterceptorAttrition;
    }
    if (interceptorKills > 0) {
      details.interceptorKills = interceptorKills;
    }
    if (escortAttrition > 0) {
      details.escortAttrition = escortAttrition;
    }
    if (escortKills > 0) {
      details.escortKills = escortKills;
    }
    if (strengthAfter !== null) {
      details.bomberStrengthAfter = strengthAfter;
    }
    if (event.bomberDestroyed) {
      details.bomberDestroyed = true;
    }
    this.publishActivityEvent({
      category: interceptorFaction === "Player" ? "player" : "enemy",
      type: "log",
      summary,
      details: Object.keys(details).length > 0 ? details : undefined
    });
  }

  private resolveAirSquadronMatch(unit: ScenarioUnit, squadronId: string): boolean {
    return unit.unitId === squadronId || `${unit.type}@${unit.hex.q},${unit.hex.r}` === squadronId;
  }

  private resolveAirSquadronUnit(squadronId: string, faction: TurnFaction, engine: GameEngine): ScenarioUnit | null {
    const reserves = faction === "Player" ? (engine.reserveUnits ?? []).map((entry) => entry.unit) : [];
    const units = faction === "Player"
      ? [...(engine.playerUnits ?? []), ...reserves]
      : faction === "Bot"
        ? (engine.botUnits ?? [])
        : (engine.allyUnits ?? []);
    return units.find((candidate) => this.resolveAirSquadronMatch(candidate, squadronId)) ?? null;
  }

  private resolveAirSquadronLabel(
    squadronId: string | undefined | null,
    faction: TurnFaction,
    engine: GameEngine
  ): string {
    if (!squadronId) {
      return "-";
    }
    const match = this.resolveAirSquadronUnit(squadronId, faction, engine);
    if (!match) {
      return "-";
    }
    return `${this.toTitleCase(String(match.type))} @ ${this.formatAxialHexForDisplay(match.hex)}`;
  }

  private formatAirCombatantSummary(
    snapshotLabel: string | undefined | null,
    squadronId: string | undefined | null,
    unitType: string,
    faction: TurnFaction,
    engine: GameEngine | null
  ): string {
    const fallbackType = this.toTitleCase(unitType);
    if (snapshotLabel && snapshotLabel.trim().length > 0) {
      return snapshotLabel;
    }
    if (!squadronId) {
      return fallbackType;
    }
    if (!engine) {
      return fallbackType;
    }
    try {
      const resolved = this.resolveAirSquadronLabel(squadronId, faction, engine);
      if (resolved && resolved !== "-") {
        return resolved;
      }
    } catch {
      /* no-op */
    }
    return fallbackType;
  }

  private formatAirFactionLabel(faction: TurnFaction): string {
    return faction === "Player" ? "Player" : faction === "Ally" ? "Allied" : "Enemy";
  }

  private buildDetailedAirCombatTurnUnitKey(turnResolved: number, unitKey: string | undefined | null): string | null {
    if (!unitKey) {
      return null;
    }
    return `${turnResolved}:${unitKey}`;
  }

  private ensureDetailedAirCombatTurnUnitKeys(): Set<string> {
    if (!(this.detailedAirCombatTurnUnitKeys instanceof Set)) {
      this.detailedAirCombatTurnUnitKeys = new Set();
    }
    return this.detailedAirCombatTurnUnitKeys;
  }

  private markDetailedAirCombatPublished(
    turnResolved: number | null | undefined,
    unitKeys: ReadonlyArray<string | undefined | null>
  ): void {
    if (typeof turnResolved !== "number" || !Number.isFinite(turnResolved)) {
      return;
    }
    const markers = this.ensureDetailedAirCombatTurnUnitKeys();
    unitKeys.forEach((unitKey) => {
      const marker = this.buildDetailedAirCombatTurnUnitKey(turnResolved, unitKey);
      if (marker) {
        markers.add(marker);
      }
    });
  }

  private hasDetailedAirCombatPublished(turnResolved: number | null | undefined, unitKey: string | undefined | null): boolean {
    const marker = typeof turnResolved === "number"
      ? this.buildDetailedAirCombatTurnUnitKey(turnResolved, unitKey)
      : null;
    return marker ? this.ensureDetailedAirCombatTurnUnitKeys().has(marker) : false;
  }

  private inferStrikeOutcomeCause(details: string | undefined): "flak" | "intercepted" | null {
    const normalized = details?.toLowerCase() ?? "";
    if (!normalized) {
      return null;
    }
    if (normalized.includes("anti-aircraft") || normalized.includes("flak")) {
      return "flak";
    }
    if (normalized.includes("intercept")) {
      return "intercepted";
    }
    return null;
  }

  private formatAxialHexForDisplay(hex: Axial | null | undefined): string {
    if (!hex) {
      return "-";
    }
    const offset = CoordinateSystem.axialToOffset(hex.q, hex.r);
    return `${offset.col},${offset.row}`;
  }

  private toOffsetHexKey(hex: Axial | null | undefined): string | null {
    if (!hex) {
      return null;
    }
    const offset = CoordinateSystem.axialToOffset(hex.q, hex.r);
    return CoordinateSystem.makeHexKey(offset.col, offset.row);
  }

  private resolveEngineHqOffsetKey(engine: GameEngine, faction: "Player" | "Bot"): string | null {
    const hqResolver = faction === "Player"
      ? (engine as Partial<GameEngine> & { getPlayerHq?: () => Axial | null | undefined }).getPlayerHq
      : (engine as Partial<GameEngine> & { getBotHq?: () => Axial | null | undefined }).getBotHq;
    if (typeof hqResolver !== "function") {
      return null;
    }
    return this.toOffsetHexKey(hqResolver.call(engine));
  }

  private offsetHexKeyToAxial(hexKey: string | null | undefined): Axial | null {
    if (!hexKey) {
      return null;
    }
    const parsed = CoordinateSystem.parseHexKey(hexKey);
    if (!parsed) {
      return null;
    }
    return CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
  }

  private findScheduledAirMissionById(
    missionId: string,
    faction: TurnFaction,
    engine: GameEngine
  ): SerializedAirMission | null {
    return engine.getScheduledAirMissions(faction).find((entry) => entry.id === missionId) ?? null;
  }

  private findLinkedStrikeMissionForEscort(
    protectedSquadronId: string | undefined | null,
    faction: TurnFaction,
    engine: GameEngine
  ): SerializedAirMission | null {
    if (!protectedSquadronId) {
      return null;
    }
    const matches = engine
      .getScheduledAirMissions(faction)
      .filter((entry) => entry.kind === "strike" && entry.unitKey === protectedSquadronId);
    return matches.find((entry) => entry.status !== "completed") ?? matches[0] ?? null;
  }

  private resolvePreparedAirMissionTargetHex(
    flight: PreparedAirMissionFlight,
    engine: GameEngine
  ): Axial | null {
    const mission = this.findScheduledAirMissionById(flight.missionId, flight.faction, engine);
    if (mission?.targetHex) {
      return mission.targetHex;
    }

    const escortedSquadronId = mission?.escortTargetUnitKey ?? flight.escortTargetUnitKey;
    if (escortedSquadronId) {
      const linkedStrike = this.findLinkedStrikeMissionForEscort(escortedSquadronId, flight.faction, engine);
      if (linkedStrike?.targetHex) {
        return linkedStrike.targetHex;
      }
      const protectedUnit = this.resolveAirSquadronUnit(escortedSquadronId, flight.faction, engine);
      if (protectedUnit) {
        return protectedUnit.hex;
      }
    }

    return flight.targetHex ?? null;
  }

  private resolveAirPlaybackFocusHexForFlight(
    flight: PreparedAirMissionFlight,
    engine: GameEngine
  ): Axial | null {
    return this.resolvePreparedAirMissionTargetHex(flight, engine) ?? this.offsetHexKeyToAxial(flight.destKey);
  }

  private resolvePreparedAirMissionDestKey(
    flight: PreparedAirMissionFlight,
    engine: GameEngine
  ): string | null {
    return this.toOffsetHexKey(this.resolvePreparedAirMissionTargetHex(flight, engine)) ?? (flight.destKey || null);
  }

  private async playEscortCompanionFlight(
    flight: PreparedAirMissionFlight,
    destKey: string,
    renderer: HexMapRenderer
  ): Promise<void> {
    await this.animateAircraftLeg(
      renderer,
      flight.originKey,
      destKey,
      flight.unitType,
      this.resolveFighterSortieIngressDurationMs(),
      undefined,
      1,
      flight.strength,
      flight.laneOffsetPx,
      flight.faction,
      "interceptor"
    );
    await this.playDamagedAircraftReturn(
      renderer,
      destKey,
      flight.originKey,
      flight.unitType,
      0,
      flight.strength,
      flight.laneOffsetPx,
      this.scaleAirSequenceMs(120),
      flight.faction,
      this.resolveFighterSortieEgressDurationMs(),
      "interceptor"
    );
  }

  private resolveAirSquadronStrength(
    squadronId: string | undefined | null,
    faction: TurnFaction,
    engine: GameEngine,
    fallback = 100
  ): number {
    if (!squadronId) {
      return fallback;
    }
    return this.resolveAirSquadronUnit(squadronId, faction, engine)?.strength ?? fallback;
  }

  private buildAirLaneOffsets(count: number): number[] {
    if (count <= 1) {
      return [0];
    }
    const spacing = BattleScreen.AIR_FORMATION_SPACING_PX;
    const mid = (count - 1) / 2;
    return Array.from({ length: count }, (_, index) => Math.round((index - mid) * spacing));
  }

  private assignAirMissionFlightLanes(flights: PreparedAirMissionFlight[]): PreparedAirMissionFlight[] {
    const grouped = new Map<string, PreparedAirMissionFlight[]>();
    flights.forEach((flight) => {
      const key = `${flight.originKey}->${flight.destKey}`;
      const group = grouped.get(key) ?? [];
      group.push(flight);
      grouped.set(key, group);
    });

    const assigned: PreparedAirMissionFlight[] = [];
    grouped.forEach((group) => {
      const offsets = this.buildAirLaneOffsets(group.length);
      group.forEach((flight, index) => {
        assigned.push({ ...flight, laneOffsetPx: offsets[index] ?? 0 });
      });
    });

    return assigned;
  }

  private async animateAircraftLeg(
    renderer: HexMapRenderer,
    fromKey: string,
    toKey: string,
    unitType: string,
    durationMs: number,
    onProgress?: (progress: number, centerX: number, centerY: number) => void,
    endProgress = 1,
    strength?: number,
    laneOffsetPx = 0,
    faction?: TurnFaction,
    role: AirShowRole = "interceptor"
  ): Promise<void> {
    if (typeof (renderer as any).animateAircraftArc === "function") {
      await (renderer as any).animateAircraftArc(
        fromKey,
        toKey,
        unitType,
        durationMs,
        onProgress,
        endProgress,
        strength,
        laneOffsetPx,
        faction,
        role
      );
      return;
    }

    if (typeof (renderer as any).animateAircraftFlyover === "function") {
      await renderer.animateAircraftFlyover(
        fromKey,
        toKey,
        unitType,
        durationMs,
        onProgress,
        endProgress,
        strength,
        laneOffsetPx,
        faction,
        role
      );
    }
  }

  private updateTurnStatusDisplay(summary: TurnSummary): void {
    const initiativeActive =
      this.isInitiativeSystemEnabled && Boolean(this.initiativeMethods?.isInitiativeSystemActive());
    const initiativeActivation = initiativeActive ? this.initiativeMethods?.getCurrentActivation() ?? null : null;

    if (this.turnIndicatorElement) {
      const configuredTurnLimit = this.battleState.getPrecombatMissionInfo()?.turnLimit ?? this.scenario.turnLimit;
      const label = summary.phase === "deployment"
        ? "Deployment"
        : configuredTurnLimit > 0
          ? `${summary.turnNumber} of ${configuredTurnLimit}`
          : String(summary.turnNumber);
      this.turnIndicatorElement.textContent = label;
    }
    if (this.factionIndicatorElement) {
      this.factionIndicatorElement.textContent =
        initiativeActivation?.ownerId === "player"
          ? "Player"
          : initiativeActivation?.ownerId === "bot"
            ? "Enemy"
            : this.formatFactionLabel(summary.activeFaction);
    }
    if (this.phaseIndicatorElement) {
      if (initiativeActive) {
        const queue = this.initiativeMethods?.getCurrentInitiativeQueue();
        const hasPendingActivations = this.hasPendingInitiativeActivations(queue);
        this.phaseIndicatorElement.textContent = initiativeActivation
          ? initiativeActivation.ownerId === "player"
            ? "Your initiative group is active"
            : "Enemy initiative group is active"
          : hasPendingActivations
            ? "Initiative order updating"
            : "Turn ready to end";
      } else {
        this.phaseIndicatorElement.textContent = this.formatPhaseLabel(summary.phase);
      }
    }
  }

  private updateTurnControls(summary: TurnSummary): void {
    const initiativeActive =
      this.isInitiativeSystemEnabled && Boolean(this.initiativeMethods?.isInitiativeSystemActive());
    if (initiativeActive) {
      this.syncLegacyEndTurnButton();
      return;
    }

    const isPlayerTurn = summary.activeFaction === "Player" && summary.phase === "playerTurn";
    if (this.endTurnButton) {
      this.endTurnButton.disabled = !isPlayerTurn;
      this.endTurnButton.hidden = false;
      this.endTurnButton.removeAttribute("aria-hidden");
      if (isPlayerTurn) {
        this.endTurnButton.removeAttribute("aria-disabled");
      } else {
        this.endTurnButton.setAttribute("aria-disabled", "true");
      }
    }
  }

  private syncLegacyEndTurnButton(summary?: TurnSummary): void {
    if (!this.endTurnButton) {
      return;
    }

    const initiativeActive =
      this.isInitiativeSystemEnabled && Boolean(this.initiativeMethods?.isInitiativeSystemActive());
    if (initiativeActive) {
      const hasEnhancedControls =
        Boolean(this.initiativeTurnControls) ||
        Boolean(document.querySelector(".initiative-turn-controls-container"));

      // Initiative mode uses dedicated controls in the top bar, so hide the legacy button
      // when enhanced controls are available to prevent duplicate "End Turn" actions.
      this.endTurnButton.hidden = hasEnhancedControls;
      if (hasEnhancedControls) {
        this.endTurnButton.setAttribute("aria-hidden", "true");
      } else {
        this.endTurnButton.removeAttribute("aria-hidden");
      }
      return;
    }

    this.endTurnButton.hidden = false;
    this.endTurnButton.removeAttribute("aria-hidden");

    const effectiveSummary = summary ?? (this.battleState.hasEngine() ? this.battleState.getCurrentTurnSummary() : null);
    const isPlayerTurn = effectiveSummary
      ? effectiveSummary.activeFaction === "Player" && effectiveSummary.phase === "playerTurn"
      : false;
    this.endTurnButton.disabled = !isPlayerTurn;
    if (isPlayerTurn) {
      this.endTurnButton.removeAttribute("aria-disabled");
    } else {
      this.endTurnButton.setAttribute("aria-disabled", "true");
    }
  }

  private announceSupplyAttrition(report: SupplyTickReport | null): void {
    if (!report || report.outOfSupply.length === 0) {
      return;
    }
    const counts = new Map<string, number>();
    const deploymentState = ensureDeploymentState();
    report.outOfSupply.forEach((unit) => {
      const scenarioType = unit.type as string;
      const unitKey = deploymentState.getUnitKeyForScenarioType(scenarioType) ?? scenarioType;
      const label = this.resolveUnitLabel(unitKey);
      const displayLabel = label === unitKey ? this.toTitleCase(label) : label;
      counts.set(displayLabel, (counts.get(displayLabel) ?? 0) + 1);
    });
    if (counts.size === 0) {
      return;
    }
    const parts = Array.from(counts.entries(), ([label, count]) => `${count} ${label}${count === 1 ? "" : " units"}`);
    const prefix = report.faction === "Player" ? "Friendly" : "Enemy";
    this.announceBattleUpdate(`${prefix} supply attrition: ${parts.join(", ")}.`);
  }

  /**
   * Announces the bot's moves and attacks during their turn.
   */
  private describeBotAttackCounterfire(attack: BotAttackSummary): string {
    const retaliationDamage = this.clampDisplayedDamage(attack.retaliation?.damage ?? 0);
    if (retaliationDamage <= 0) {
      return "";
    }

    const attackerStrengthAfter = attack.retaliation?.attackerStrengthAfter;
    const effects = attack.retaliation?.summary
      ? ` Effects: ${attack.retaliation.summary}.`
      : "";
    if (typeof attackerStrengthAfter === "number") {
      if (attackerStrengthAfter <= 0) {
        return ` Counterfire dealt ${this.formatDamageAmount(retaliationDamage)} damage.${effects} Attacker destroyed.`;
      }
      return ` Counterfire dealt ${this.formatDamageAmount(retaliationDamage)} damage.${effects} Attacker strength now ${this.formatReadinessValue(attackerStrengthAfter)}.`;
    }

    return ` Counterfire dealt ${this.formatDamageAmount(retaliationDamage)} damage.${effects}`;
  }

  private announceBotTurnActions(botSummary: BotTurnSummary): void {
    // Announce bot moves
    if (botSummary.moves.length > 0) {
      this.announceBattleUpdate(`Enemy turn: ${botSummary.moves.length} unit${botSummary.moves.length === 1 ? "" : "s"} moved.`);
    }

    // Announce bot attacks with details
    if (botSummary.attacks.length > 0) {
      botSummary.attacks.forEach((attack) => {
        const attackerLabel = this.toTitleCase(attack.attackerType);
        const defenderLabel = this.toTitleCase(attack.defenderType);
        const damage = this.formatDamageAmount(attack.inflictedDamage);
        const destroyed = attack.defenderDestroyed ? " Target destroyed!" : "";
        const effects = attack.damageSummary ? ` Effects: ${attack.damageSummary}.` : "";
        const counterfire = this.describeBotAttackCounterfire(attack);
        this.announceBattleUpdate(
          `Enemy ${attackerLabel} attacked ${defenderLabel}. Damage: ${damage}.${effects}${destroyed}${counterfire}`
        );
      });
    }

    // If no actions, announce bot passed
    if (botSummary.moves.length === 0 && botSummary.attacks.length === 0) {
      this.announceBattleUpdate("Enemy turn: No actions taken.");
    }
  }

  /**
   * Mirrors bot activity into the sidebar log so commanders track enemy maneuvers alongside their own actions.
   * Keeps messaging concise yet specific by including origin/target hexes and damage outcomes per CODEX guidance.
   */
  private logBotTurnActivity(botSummary: BotTurnSummary): void {
    botSummary.moves.forEach((move) => {
      const fromOffset = CoordinateSystem.axialToOffset(move.from.q, move.from.r);
      const toOffset = CoordinateSystem.axialToOffset(move.to.q, move.to.r);
      const fromKey = CoordinateSystem.makeHexKey(fromOffset.col, fromOffset.row);
      const toKey = CoordinateSystem.makeHexKey(toOffset.col, toOffset.row);
      const unitLabel = this.toTitleCase(move.unitType);
      this.publishActivityEvent({
        category: "enemy",
        type: "move",
        summary: `Enemy ${unitLabel} repositioned from ${fromKey} to ${toKey}.`
      });
    });

    botSummary.attacks.forEach((attack) => {
      const originOffset = CoordinateSystem.axialToOffset(attack.from.q, attack.from.r);
      const targetOffset = CoordinateSystem.axialToOffset(attack.target.q, attack.target.r);
      const originKey = CoordinateSystem.makeHexKey(originOffset.col, originOffset.row);
      const targetKey = CoordinateSystem.makeHexKey(targetOffset.col, targetOffset.row);
      const attackerLabel = this.toTitleCase(attack.attackerType);
      const defenderLabel = this.toTitleCase(attack.defenderType);
      const damage = this.formatDamageAmount(attack.inflictedDamage);
      const retaliationDamage = this.clampDisplayedDamage(attack.retaliation?.damage ?? 0);
      const attackerStrengthAfter = attack.retaliation?.attackerStrengthAfter;
      const destructionNote = attack.defenderDestroyed ? " Target destroyed." : "";
      const effects = attack.damageSummary ? ` Effects: ${attack.damageSummary}.` : "";
      const counterfire = this.describeBotAttackCounterfire(attack);
      this.publishActivityEvent({
        category: "enemy",
        type: "attack",
        summary: `Enemy ${attackerLabel} attacked ${defenderLabel} from ${originKey} to ${targetKey} for ${damage} damage.${effects}${destructionNote}${counterfire}`,
        details: {
          attackerType: attack.attackerType,
          defenderType: attack.defenderType,
          attackerHex: originKey,
          defenderHex: targetKey,
          inflictedDamage: attack.inflictedDamage,
          damageSummary: attack.damageSummary,
          retaliationDamage,
          retaliationSummary: attack.retaliation?.summary,
          attackerStrengthAfter,
          defenderDestroyed: attack.defenderDestroyed
        }
      });
    });

    if (botSummary.moves.length === 0 && botSummary.attacks.length === 0) {
      this.publishActivityEvent({
        category: "enemy",
        type: "turn",
        summary: "Enemy turn concluded without recorded actions."
      });
    }
  }

  private formatPhaseLabel(phase: TurnSummary["phase"]): string {
    switch (phase) {
      case "playerTurn":
        return "Player Turn";
      case "allyTurn":
        return "Ally Turn";
      case "botTurn":
        return "Enemy Turn";
      case "deployment":
        return "Deployment";
      case "completed":
        return "Mission Complete";
      default:
        return this.toTitleCase(phase);
    }
  }

  private formatFactionLabel(faction: TurnSummary["activeFaction"]): string {
    if (faction === "Player") return "Player";
    if (faction === "Ally") return "Ally";
    return "Enemy";
  }

  /** Attempts to transfer an ally-controlled unit at the selected hex to the player. */
  private tryTransferAllyControl(hexKey: string): boolean {
    const engine = this.battleState.ensureGameEngine();
    const parsed = CoordinateSystem.parseHexKey(hexKey);
    if (!parsed) {
      return false;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const allyPresent = engine.allyUnits.some((unit) => CoordinateSystem.makeHexKey(CoordinateSystem.axialToOffset(unit.hex.q, unit.hex.r).col, CoordinateSystem.axialToOffset(unit.hex.q, unit.hex.r).row) === hexKey);
    if (!allyPresent) {
      return false;
    }

    try {
      const transferred = engine.transferAllyControl(axial);
      if (!transferred) {
        return false;
      }
      this.renderEngineUnits();
      this.applySelectedHex(hexKey);
      this.announceBattleUpdate("Ally unit transferred to your command.");
      return true;
    } catch (error) {
      console.error("Failed to transfer ally control", { hexKey, error });
      this.announceBattleUpdate("Could not transfer ally control at the selected hex.");
      return false;
    }
  }

  /**
   * Resolves on the next animation frame so DOM updates triggered by deployment mirrors can render
   * before subsequent engine actions. Using `requestAnimationFrame` keeps the wait under a single frame.
   */
  private waitForNextFrame(): Promise<void> {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
  }

  private waitMs(durationMs: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(() => resolve(), durationMs);
    });
  }

  private scaleAirSequenceMs(durationMs: number): number {
    return scaleAirShowSequenceMs(durationMs);
  }

  private resolveBomberInterceptIngressDurationMs(): number {
    return resolveSharedBomberInterceptIngressDurationMs();
  }

  private resolveFighterInterceptIngressDurationMs(): number {
    return resolveSharedFighterInterceptIngressDurationMs();
  }

  private resolveBomberSortieIngressDurationMs(): number {
    return resolveSharedBomberSortieIngressDurationMs();
  }

  private resolveBomberSortieEgressDurationMs(): number {
    return resolveSharedBomberSortieEgressDurationMs();
  }

  private resolveFighterSortieIngressDurationMs(): number {
    return resolveSharedFighterSortieIngressDurationMs();
  }

  private resolveFighterSortieEgressDurationMs(): number {
    return resolveSharedFighterSortieEgressDurationMs();
  }

  private resolveAirInterceptBomberArrivalDelayMs(): number {
    return resolveSharedAirInterceptBomberArrivalDelayMs();
  }

  private resolveInterceptorsAfterEscortPhase(event: AirEngagementEvent): number {
    const phaseStrengths = event.interceptorStrengthsAfterEscortPhase ?? [];
    if (phaseStrengths.length === event.interceptors.length) {
      return phaseStrengths.filter((strength) => strength > 0).length;
    }
    if (typeof event.interceptorsAfterEscortPhase === "number") {
      return Math.max(0, Math.round(event.interceptorsAfterEscortPhase));
    }
    if (event.escorts.length <= 0) {
      return event.interceptors.length;
    }
    const possibleEscortKills = Math.min(
      event.interceptors.length,
      event.escorts.length,
      Math.max(0, Math.round(event.interceptorKills ?? 0))
    );
    return Math.max(0, event.interceptors.length - possibleEscortKills);
  }

  private resolveEscortsAfterEscortPhase(event: AirEngagementEvent): number {
    const phaseStrengths = event.escortStrengthsAfterEscortPhase ?? [];
    if (phaseStrengths.length === event.escorts.length) {
      return phaseStrengths.filter((strength) => strength > 0).length;
    }
    if (typeof event.escortsAfterEscortPhase === "number") {
      return Math.max(0, Math.round(event.escortsAfterEscortPhase));
    }
    return Math.max(0, event.escorts.length - Math.max(0, Math.round(event.escortKills ?? 0)));
  }

  private resolveAirEngagementPhaseStrength(
    phaseStrengths: readonly number[] | undefined,
    index: number,
    fallbackStrength: number
  ): number {
    if (!Array.isArray(phaseStrengths) || index >= phaseStrengths.length) {
      return fallbackStrength;
    }
    return Math.max(0, Math.round(phaseStrengths[index] ?? fallbackStrength));
  }

  private shouldPlayBomberDefensePass(event: AirEngagementEvent): boolean {
    const interceptorsAfterEscortPhase = this.resolveInterceptorsAfterEscortPhase(event);
    if (interceptorsAfterEscortPhase > 0) {
      return true;
    }

    const bomberStrengthBefore =
      typeof event.bomberStrengthBefore === "number"
        ? Math.max(0, Math.round(event.bomberStrengthBefore))
        : typeof event.bomber.strength === "number"
          ? Math.max(0, Math.round(event.bomber.strength))
          : null;
    const bomberStrengthAfter =
      typeof event.bomberStrengthAfter === "number"
        ? Math.max(0, Math.round(event.bomberStrengthAfter))
        : null;

    return event.bomberDestroyed === true || (bomberStrengthBefore !== null && bomberStrengthAfter !== null && bomberStrengthAfter < bomberStrengthBefore);
  }

  private async playAirInterceptPasses(
    event: AirEngagementEvent,
    locKey: string,
    renderer: HexMapRenderer,
    bomberArrivalDelayMs = 0,
    allowBomberDefensePass = true
  ): Promise<void> {
    const escortOpeningDelayMs = this.scaleAirSequenceMs(70);
    const followThroughDelayMs = this.scaleAirSequenceMs(55);
    const orbitDurationMs = this.scaleAirSequenceMs(180);
    const orbitRenderer = renderer as any;
    const playOrbitStage = async (
      units: ReadonlyArray<{ readonly unitType: string; readonly strength: number }>
    ): Promise<void> => {
      if (typeof orbitRenderer.animateAircraftOrbitAt !== "function" || units.length === 0) {
        return;
      }
      await Promise.all(
        units.map((unit) =>
          orbitRenderer.animateAircraftOrbitAt(locKey, unit.unitType, orbitDurationMs, Math.max(0, Math.round(unit.strength)))
        )
      );
    };

    if (event.escorts.length > 0) {
      await playOrbitStage([
        ...event.escorts.map((escort, index) => ({
          unitType: escort.unitType,
          strength: this.resolveAirEngagementPhaseStrength(
            event.escortStrengthsAfterEscortPhase,
            index,
            escort.strength ?? 100
          )
        })),
        ...event.interceptors.map((interceptor, index) => ({
          unitType: interceptor.unitType,
          strength: this.resolveAirEngagementPhaseStrength(
            event.interceptorStrengthsAfterEscortPhase,
            index,
            interceptor.strength ?? 100
          )
        }))
      ]);
      await this.waitMs(escortOpeningDelayMs);
      await renderer.playDogfight(locKey);
    }

    if (!allowBomberDefensePass) {
      if (event.escorts.length > 0) {
        await this.waitMs(followThroughDelayMs);
      }
      return;
    }

    if (event.escorts.length === 0 || this.shouldPlayBomberDefensePass(event)) {
      const gapBeforeBomberPass =
        event.escorts.length > 0
          ? Math.max(this.scaleAirSequenceMs(235), bomberArrivalDelayMs)
          : Math.max(0, bomberArrivalDelayMs);
      if (gapBeforeBomberPass > 0) {
        await this.waitMs(gapBeforeBomberPass);
      }
      await playOrbitStage(
        event.interceptors
          .map((interceptor, index) => ({
            unitType: interceptor.unitType,
            strength: this.resolveAirEngagementPhaseStrength(
              event.interceptorStrengthsAfterEscortPhase,
              index,
              interceptor.strength ?? 100
            )
          }))
          .filter((interceptor) => interceptor.strength > 0)
      );
      if (typeof (renderer as any).playBomberDefensePass === "function") {
        await (renderer as any).playBomberDefensePass(locKey);
      } else {
        await renderer.playDogfight(locKey);
      }
      await this.waitMs(followThroughDelayMs);
    }
  }

  private buildAirPlaybackOperations(
    linkedStrikeFlights: Array<{
      flight: PreparedAirMissionFlight;
      linkedEvents: AirEngagementEvent[];
      escorts: PreparedAirMissionFlight[];
    }>,
    standaloneFlights: PreparedAirMissionFlight[],
    standaloneEvents: AirEngagementEvent[],
    engine: GameEngine
  ): AirPlaybackOperation[] {
    const operations: AirPlaybackOperation[] = [];
    let index = 0;
    const capClashEvents = standaloneEvents.filter((event) => event.type === "capClash");
    const otherStandaloneEvents = standaloneEvents.filter((event) => event.type !== "capClash");

    capClashEvents.forEach((event) => {
      operations.push({
        kind: "event",
        index,
        focusHex: structuredClone(event.location),
        focusKey: this.toOffsetHexKey(event.location) ?? CoordinateSystem.makeHexKey(event.location.q, event.location.r),
        event
      });
      index += 1;
    });

    linkedStrikeFlights.forEach(({ flight, linkedEvents, escorts }) => {
      const focusHex = this.resolveAirPlaybackFocusHexForFlight(flight, engine);
      operations.push({
        kind: "linkedStrike",
        index,
        focusHex,
        focusKey: this.resolvePreparedAirMissionDestKey(flight, engine) ?? flight.destKey ?? this.toOffsetHexKey(focusHex),
        flight,
        linkedEvents,
        escorts
      });
      index += 1;
    });

    standaloneFlights.forEach((flight) => {
      const focusHex = this.resolveAirPlaybackFocusHexForFlight(flight, engine);
      operations.push({
        kind: "flight",
        index,
        focusHex,
        focusKey: this.resolvePreparedAirMissionDestKey(flight, engine) ?? flight.destKey ?? this.toOffsetHexKey(focusHex),
        flight
      });
      index += 1;
    });

    otherStandaloneEvents.forEach((event) => {
      operations.push({
        kind: "event",
        index,
        focusHex: structuredClone(event.location),
        focusKey: this.toOffsetHexKey(event.location) ?? CoordinateSystem.makeHexKey(event.location.q, event.location.r),
        event
      });
      index += 1;
    });

    return operations;
  }

  private clusterAirPlaybackOperations(operations: AirPlaybackOperation[]): AirPlaybackOperation[][] {
    if (operations.length <= 1) {
      return operations.length > 0 ? [operations] : [];
    }

    const clusters: AirPlaybackOperation[][] = [];
    const visited = new Set<number>();

    for (let startIndex = 0; startIndex < operations.length; startIndex += 1) {
      if (visited.has(startIndex)) {
        continue;
      }

      const cluster: AirPlaybackOperation[] = [];
      const queue = [startIndex];
      visited.add(startIndex);

      while (queue.length > 0) {
        const currentIndex = queue.shift();
        if (currentIndex === undefined) {
          continue;
        }

        const current = operations[currentIndex]!;
        cluster.push(current);

        for (let candidateIndex = 0; candidateIndex < operations.length; candidateIndex += 1) {
          if (visited.has(candidateIndex)) {
            continue;
          }
          if (!this.airPlaybackOperationsShareCluster(current, operations[candidateIndex]!)) {
            continue;
          }
          visited.add(candidateIndex);
          queue.push(candidateIndex);
        }
      }

      cluster.sort((a, b) => a.index - b.index);
      clusters.push(cluster);
    }

    return clusters;
  }

  private airPlaybackOperationsShareCluster(a: AirPlaybackOperation, b: AirPlaybackOperation): boolean {
    if (a.focusKey && b.focusKey && a.focusKey === b.focusKey) {
      return true;
    }
    if (!a.focusHex || !b.focusHex) {
      return false;
    }
    return hexDistance(a.focusHex, b.focusHex) <= BattleScreen.AIR_PLAYBACK_CLUSTER_LINK_DISTANCE_HEX;
  }

  private async playAirPlaybackCluster(
    cluster: AirPlaybackOperation[],
    renderer: HexMapRenderer,
    engine: GameEngine
  ): Promise<void> {
    if (cluster.length === 0) {
      return;
    }

    const focusKey = cluster.find((operation) => operation.focusKey)?.focusKey ?? null;
    const focusDelay = cluster.some((operation) => operation.kind === "linkedStrike")
      ? this.scaleAirSequenceMs(220)
      : this.scaleAirSequenceMs(180);

    if (focusKey) {
      await this.focusCameraOnHex(focusKey);
      await this.waitForNextFrame();
      await this.waitMs(focusDelay);
    }

    const eventOperations = cluster.filter(
      (operation): operation is StandaloneEventPlaybackOperation => operation.kind === "event"
    );
    const eventLaneOffsets = this.buildAirLaneOffsets(eventOperations.length);
    const laneOffsetsByIndex = new Map<number, number>();
    eventOperations.forEach((operation, index) => {
      laneOffsetsByIndex.set(operation.index, eventLaneOffsets[index] ?? 0);
    });

    const concurrentOperations = [...cluster];
    if (concurrentOperations.length <= 0) {
      return;
    }

    const coordinatedPlan = this.buildCoordinatedAirPlaybackPlanForCluster(concurrentOperations, engine);
    if (coordinatedPlan) {
      this.recordActiveAirShowPlaybackCluster(concurrentOperations, coordinatedPlan);
      await this.playCoordinatedAirPlaybackPlan(
        coordinatedPlan,
        renderer,
        engine,
        laneOffsetsByIndex
      );
      return;
    }

    this.recordActiveAirShowPlaybackCluster(concurrentOperations, null);
    await Promise.all(
      concurrentOperations.map(async (operation) => {
        if (operation.kind === "linkedStrike") {
          await this.playMissionStrikeOperation(
            operation.flight,
            [...operation.linkedEvents],
            operation.escorts,
            renderer,
            engine,
            Boolean(focusKey)
          );
          return;
        }
        if (operation.kind === "flight") {
          await this.playStandaloneAirMissionFlight(operation.flight, renderer, engine, Boolean(focusKey));
          return;
        }
        await this.playStandaloneAirEngagementEvent(
          operation.event,
          renderer,
          engine,
          Boolean(focusKey),
          laneOffsetsByIndex.get(operation.index) ?? 0
        );
      })
    );
  }

  private buildCoordinatedAirPlaybackPlanForCluster(
    cluster: AirPlaybackOperation[],
    engine: GameEngine
  ): CoordinatedAirClusterPlaybackPlan | null {
    return buildCoordinatedAirClusterPlaybackPlan(cluster, {
      resolveOriginKey: (unitKey, faction) => this.resolveAirEngagementOffsetKey(unitKey, faction, engine),
      resolveStrength: (unitKey, faction) => this.resolveAirSquadronStrength(unitKey, faction, engine),
      ...buildCoordinatedAirClusterTimingPolicy(),
      playerHqKey: this.resolveEngineHqOffsetKey(engine, "Player"),
      botHqKey: this.resolveEngineHqOffsetKey(engine, "Bot")
    });
  }

  private async playCoordinatedAirPlaybackPlan(
    plan: CoordinatedAirClusterPlaybackPlan,
    renderer: HexMapRenderer,
    engine: GameEngine,
    laneOffsetsByIndex: ReadonlyMap<number, number>
  ): Promise<void> {
    if (plan.scene) {
      plan.announcementEvents.forEach((event) => this.announceAirInterceptEngagement(event));
      plan.flakAnnouncementEvents.forEach((event) => this.announceFlakEngagement(event));
      await renderer.animateResolvedAirCombatShow(plan.scene);
    }

    const residualPromises = plan.residualOperations.map(async (operation) => {
      if (operation.kind === "linkedStrike") {
        await this.playMissionStrikeOperation(
          operation.flight,
          [...operation.linkedEvents],
          operation.escorts,
          renderer,
          engine,
          true
        );
        return;
      }
      if (operation.kind === "flight") {
        await this.playStandaloneAirMissionFlight(operation.flight, renderer, engine, true);
        return;
      }
      await this.playStandaloneAirEngagementEvent(
        operation.event,
        renderer,
        engine,
        true,
        laneOffsetsByIndex.get(operation.index) ?? 0
      );
    });

    await Promise.all(residualPromises);
  }

  /**
   * Encourages the commander to assign a base camp before starting battle by spotlighting the relevant controls.
   * Highlights the assign button, scrolls it into view, and publishes guidance via the announcement region.
   */
  private promptForBaseCamp(): void {
    if (!this.baseCampAssignButton) {
      this.reportDeploymentPanelError({
        title: "Base camp controls unavailable.",
        detail: "The assign-base-camp control is missing from the battle screen.",
        action: "Reload the mission and retry base camp assignment.",
        recoverable: true
      }, { mirrorToBaseCampStatus: true });
      return;
    }

    this.baseCampAssignButton.classList.add("battle-button--highlight");
    this.baseCampAssignButton.setAttribute("aria-live", "polite");
    this.baseCampAssignButton.setAttribute("aria-describedby", "baseCampStatus");

    const panelElement = this.deploymentPanel?.getElement?.();
    if (panelElement) {
      panelElement.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      this.baseCampAssignButton.scrollIntoView({ behavior: "smooth", block: "center" });
    }

    this.announceBattleUpdate("Assign a base camp to establish supply lines before beginning the battle.");

    window.setTimeout(() => {
      this.baseCampAssignButton?.classList.remove("battle-button--highlight");
      this.baseCampAssignButton?.removeAttribute("aria-live");
      if (this.baseCampAssignButton?.getAttribute("aria-describedby") === "baseCampStatus") {
        this.baseCampAssignButton.removeAttribute("aria-describedby");
      }
    }, 4000);
  }

  /**
   * Refreshes deployment panel content after state mirrors so zone lists and unit rosters reflect the latest counts.
   */
  private updateDeploymentPanel(): void {
    this.deploymentPanel?.update();
  }

  /**
   * Re-renders the battle loadout list using mirrored DeploymentState snapshots, keeping allocated vs. deployed totals accurate.
   */
  private updateLoadout(): void {
    this.battleLoadout?.refresh();
  }

  /**
   * Rebuilds the reserve queue from DeploymentState so the UI mirrors ready/exhausted status after each deployment action.
   */
  private updateReserveList(): void {
    this.reservePresenter?.refresh();
  }

  /**
   * Freezes camera movement to prevent drift during animations.
   * Disables user input while still allowing programmatic camera movement.
   */
  private freezeCamera(): void {
    this.cameraFrozen = true;
    // Disable pointer events on the map to prevent user input during effects
    const mapElement = document.querySelector("#battleHexMap") as HTMLElement;
    if (mapElement) {
      mapElement.style.pointerEvents = 'none';
    }
    console.log("[BattleScreen] Camera frozen - user input disabled during effects");
  }

  /**
   * Unfreezes camera movement.
   */
  private unfreezeCamera(): void {
    this.cameraFrozen = false;
    // Re-enable pointer events on the map
    const mapElement = document.querySelector("#battleHexMap") as HTMLElement;
    if (mapElement) {
      mapElement.style.pointerEvents = '';
    }
    console.log("[BattleScreen] Camera unfrozen - user input enabled");
  }

  /**
   * Focuses the camera on a specific hex using MapViewport transforms.
   *
   * CRITICAL: This function performs coordinate transformations to center the camera on a hex.
   * It retrieves viewBox coordinates (cx, cy) from the hex cell's dataset and passes them to MapViewport.
   *
   * Coordinate Flow:
   * 1. Input: Hex key string "col,row" (offset coordinates)
   * 2. Retrieve: Hex cell element from DOM via HexMapRenderer
   * 3. Read: dataset.cx and dataset.cy (viewBox coordinates set during render)
   * 4. Pass: ViewBox coordinates to MapViewport.centerOn()
   * 5. Transform: MapViewport applies zoom/pan/scale to center on screen
   *
   * @param hexKey - Hex key in "col,row" format (offset coordinates)
   * @returns Promise that resolves when camera centering is complete
   */
  private async focusCameraOnHex(hexKey: string, zoom?: number): Promise<void> {

    if (!this.mapViewport || !this.hexMapRenderer) {
      console.warn("[BattleScreen] focusCameraOnHex: mapViewport or hexMapRenderer is null");
      return;
    }

    const cell = this.hexMapRenderer.getHexElement(hexKey);
    if (!cell) {
      console.error("[BattleScreen] focusCameraOnHex: HEX ELEMENT NOT FOUND for key:", hexKey);
      console.error("[BattleScreen] This hex doesn't exist in the rendered map. Check if the target is within map bounds.");
      return;
    }

    const cx = Number(cell.dataset.cx ?? 0);
    const cy = Number(cell.dataset.cy ?? 0);

    const viewportRoot = this.hexMapRenderer.getViewportRoot();
    const beforeTransform = this.mapViewport.getTransform();
    const beforeDOMTransform = viewportRoot?.getAttribute("transform") ?? "none";

    console.log("[BattleScreen] focusCameraOnHex:", {
      hexKey,
      hexCenter: { cx, cy },
      beforeTransform,
      beforeDOMTransform
    });

    if (cx === 0 && cy === 0) {
      console.warn("[BattleScreen] focusCameraOnHex: invalid coordinates for hex", hexKey);
      return;
    }

    // Only apply centering if camera is not frozen from user input
    if (zoom !== undefined) {
      const currentTransform = this.mapViewport.getTransform();
      this.mapViewport.setTransform(zoom, currentTransform.panX, currentTransform.panY);
    }
    if (!this.cameraFrozen) {
      this.mapViewport.centerOn(cx, cy);
    } else {
      console.log("[BattleScreen] Camera frozen - still applying centerOn for effects, user input disabled");
      // Still apply centering for effects but user input is disabled
      this.mapViewport.centerOn(cx, cy);
    }
    const afterTransform = this.mapViewport.getTransform();
    const afterDOMTransform = viewportRoot?.getAttribute("transform") ?? "none";
    const computedTransform = viewportRoot ? getComputedStyle(viewportRoot).transform : "none";

    // Get real viewport pixel dimensions
    const svgElement = document.getElementById("battleHexMap") as SVGSVGElement | null;
    const viewportRect = svgElement?.getBoundingClientRect();
    const viewportSize = viewportRect
      ? { width: Math.round(viewportRect.width), height: Math.round(viewportRect.height) }
      : { width: 0, height: 0 };

    console.log("[BattleScreen] focusCameraOnHex: camera centered", {
      hexKey,
      targetCenter: { cx, cy },
      afterTransform,
      afterDOMTransform,
      computedTransform,
      viewportSize,
      cameraFrozen: this.cameraFrozen,
      transformMatch: afterDOMTransform.includes(afterTransform.panX.toFixed(1))
    });
    this.lastFocusedHexKey = hexKey;
    this.lastViewportTransform = afterTransform;

    // Wait TWO frames to ensure transform fully propagates to DOM
    await this.waitForNextFrame();
    await this.waitForNextFrame();

    // Verify final transform after waiting
    const finalDOMTransform = viewportRoot?.getAttribute("transform") ?? "none";
    console.log("[BattleScreen] focusCameraOnHex: after frame wait, DOM transform is:", finalDOMTransform);
  }

  private recenterLastFocus(): void {
    if (!this.lastFocusedHexKey) {
      return;
    }
    this.focusCameraOnHex(this.lastFocusedHexKey);
  }

  private restoreViewportAfterIdleDismiss(): void {
    if (!this.mapViewport) {
      return;
    }

    console.log("[BattleScreen] restoreViewportAfterIdleDismiss start", {
      lastFocusedHexKey: this.lastFocusedHexKey,
      lastViewportTransform: this.lastViewportTransform,
      currentTransform: this.mapViewport.getTransform()
    });

    // Recenter on the last focused hex when available.
    if (this.lastFocusedHexKey) {
      this.focusCameraOnHex(this.lastFocusedHexKey);
    }

    // Reapply the previous zoom/pan to avoid unexpected resets.
    if (this.lastViewportTransform) {
      const { zoom, panX, panY } = this.lastViewportTransform;
      this.mapViewport.setTransform(zoom, panX, panY);
      console.log("[BattleScreen] restoreViewportAfterIdleDismiss applied", {
        targetTransform: this.lastViewportTransform,
        finalTransform: this.mapViewport.getTransform()
      });
    } else {
      console.log("[BattleScreen] restoreViewportAfterIdleDismiss: no stored transform", {
        finalTransform: this.mapViewport.getTransform()
      });
    }
  }

  /**
   * Centers the camera on the center of a deployment zone.
   */
  private async centerCameraOnZone(zoneHexes: Iterable<string>, zoom?: number): Promise<void> {
    console.log("[BattleScreen] centerCameraOnZone called");

    if (!this.mapViewport || !this.hexMapRenderer) {
      console.warn("[BattleScreen] centerCameraOnZone: mapViewport or hexMapRenderer is null", {
        hasViewport: !!this.mapViewport,
        hasRenderer: !!this.hexMapRenderer
      });
      return;
    }

    const hexArray = Array.from(zoneHexes);
    console.log("[BattleScreen] centerCameraOnZone: hexArray length =", hexArray.length);

    if (hexArray.length === 0) {
      console.warn("[BattleScreen] centerCameraOnZone: no hexes in zone");
      return;
    }

    // Small delay to ensure DOM is ready
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Calculate average position using actual rendered hex centers from DOM
    let totalX = 0;
    let totalY = 0;
    let count = 0;

    for (const hexKey of hexArray) {
      const cell = this.hexMapRenderer.getHexElement(hexKey);
      if (!cell) {
        console.warn("[BattleScreen] centerCameraOnZone: cell not found for hexKey:", hexKey);
        continue;
      }

      // Read actual rendered center positions from DOM
      const cx = Number(cell.dataset.cx ?? 0);
      const cy = Number(cell.dataset.cy ?? 0);

      console.log("[BattleScreen] centerCameraOnZone hex:", { hexKey, cx, cy });

      if (cx === 0 && cy === 0) {
        console.warn("[BattleScreen] centerCameraOnZone: skipping hex with 0,0 coordinates:", hexKey);
        continue;
      }

      totalX += cx;
      totalY += cy;
      count++;
    }

    console.log("[BattleScreen] centerCameraOnZone: calculated average", { totalX, totalY, count, avgX: totalX / count, avgY: totalY / count });

    if (count === 0) {
      console.warn("[BattleScreen] centerCameraOnZone: no valid hexes found");
      return;
    }

    const avgX = totalX / count;
    const avgY = totalY / count;

    if (zoom !== undefined) {
      const currentTransform = this.mapViewport.getTransform();
      this.mapViewport.setTransform(zoom, currentTransform.panX, currentTransform.panY);
    }

    console.log("[BattleScreen] Calling mapViewport.centerOn for zone:", { avgX, avgY, zoom });
    // Center the viewport on the zone's average position
    this.mapViewport.centerOn(avgX, avgY);
    this.lastViewportTransform = this.mapViewport.getTransform();
    if (hexArray.length === 1) {
      this.lastFocusedHexKey = hexArray[0] ?? null;
    }
  }

  /**
   * Kicks off deployment phase mirrors on first screen load.
   */
  private initializeDeploymentMirrors(): void {
    this.primeDeploymentState();
    this.refreshDeploymentMirrors("sync");
    this.ensureDefaultSelection();
  }

  /**
   * Ensures a sensible default hex selection once zones and mirrors are ready, so the user immediately
   * sees a highlighted deployment zone and contextual status copy.
   */
  private ensureDefaultSelection(): void {
    if (this.selectedHexKey) {
      return;
    }
    try {
      const defaultSelectionKey = this.computeDefaultSelectionKey();
      this.defaultSelectionKey = defaultSelectionKey;
      this.deploymentPanel?.setCriticalError(null);
      this.applySelectedHex(defaultSelectionKey);
    } catch (error) {
      const detail = error instanceof Error
        ? error.message
        : "The battle screen could not resolve a valid deployment focus from the registered mission zones.";
      console.error("[BattleScreen] failed to resolve default selection", {
        missionKey: this.uiState?.selectedMission ?? "training",
        scenarioName: this.scenario.name,
        error
      });
      this.defaultSelectionKey = null;
      this.reportDeploymentPanelError({
        title: "Mission selection context unavailable.",
        detail,
        action: "Reload the mission or repair the scenario's player deployment zones before continuing.",
        recoverable: false
      }, { mirrorToBaseCampStatus: true });
    }
  }

  /**
   * Subscribes to BattleState notifications so the battle HUD reacts to engine-driven changes
   * (e.g., precombat deployment commits, turn advances). Returns immediately when already subscribed.
   */
  private subscribeToBattleUpdates(): void {
    if (this.battleUpdateUnsubscribe) {
      return;
    }

    this.battleUpdateUnsubscribe = this.battleState.subscribeToBattleUpdates((reason) => {
      switch (reason) {
        case "deploymentUpdated": {
          const summary = this.battleState.ensureGameEngine().getTurnSummary();
          if (summary.phase !== "deployment") {
            break;
          }
          // Force mirrors to refresh from the latest committed state so UI components stay accurate.
          this.deploymentPrimed = false;
          this.initializeDeploymentMirrors();
          break;
        }
        case "turnAdvanced":
        case "engineInitialized": {
          if (reason === "turnAdvanced") {
            this.hexMapRenderer?.advanceAftermathTurn();
          }
          this.syncTurnContext();
          this.evaluateMissionRules();
          break;
        }
        case "missionUpdated": {
          this.updateAirHudWidget();
          if (this.deferMissionLogSync) {
            this.pendingMissionLogSync = true;
          } else {
            this.syncAirMissionLogs();
          }
          break;
        }
        default:
          break;
      }
      this.syncInitiativeTurnControlsState();
      this.syncQueuedTargetMarkers();
    });
  }

  constructor(
    screenManager: IScreenManager,
    battleState: BattleState,
    popupManager: IPopupManager,
    hexMapRenderer: HexMapRenderer | null,
    deploymentPanel: DeploymentPanel | null,
    battleLoadout: BattleLoadout | null,
    reservePresenter: ReserveListPresenter | null,
    mapViewport: MapViewport | null,
    zoomPanControls: ZoomPanControls | null,
    battleActivityLog: BattleActivityLog | null = null,
    uiState: UIState | null = null
  ) {
    this.screenManager = screenManager;
    this.battleState = battleState;
    this.popupManager = popupManager;
    this.hexMapRenderer = hexMapRenderer;
    this.uiState = uiState;
    this.deploymentPanel = deploymentPanel;
    this.battleLoadout = battleLoadout;
    this.reservePresenter = reservePresenter;
    this.mapViewport = mapViewport;
    this.zoomPanControls = zoomPanControls;
    this.battleActivityLog = battleActivityLog;
    
    // Expose MapViewport to global scope for diagnostics
    (window as any).battleScreenMapViewport = this.mapViewport;
    
    this.refreshScenario();
    console.info("[BattleScreen] scenario loaded", {
      missionKey: this.uiState?.selectedMission ?? "training",
      scenarioName: (this.scenarioSource as { name?: string }).name,
      size: (this.scenarioSource as { size?: { cols?: number; rows?: number } }).size
    });
    this.unitTypes = this.buildUnitTypeDictionary();
    this.terrain = this.buildTerrainDictionary();
    this.keyboardNavigationHandler = (event) => this.handleMapNavigation(event);
    this.screenShownHandler = (event) => this.handleScreenShown(event);
    this.attackDialogKeydownHandler = (event) => this.handleAttackDialogKeydown(event);
    this.fortificationDialogKeydownHandler = (event) => this.handleFortificationDialogKeydown(event);
    this.tutorialAirMissionQueuedListener = () => this.completeTutorialPhase("air_missions");
    this.defaultSelectionKey = null;

    const battleScreen = document.getElementById("battleScreen");
    if (!battleScreen) {
      throw new Error("Battle screen element (#battleScreen) not found in DOM");
    }
    this.element = battleScreen;

    // Wire Air Support preview events so the map can visualize combat radius while picking targets
    this.airPreviewListener = (ev: Event) => this.handleAirPreviewRange(ev as CustomEvent<{ origin: Axial; radius: number }>);
    this.airClearPreviewListener = () => this.clearAirPreviewOverlay();
    this.targetMarkerClickListener = (ev: Event) => this.handleQueuedTargetMarkerClick(ev as CustomEvent<{ markerId: string }>);
    this.sentryPipClickListener = (ev: Event) => this.handleSentryPipClick(ev);
    this.reserveSelectionListener = (event: Event) => {
      const detail = (event as CustomEvent<{ unitKey: string }>).detail;
      if (detail?.unitKey) {
        this.handleReserveCallupRequest(detail.unitKey);
      }
    };
    this.requisitionRequestListener = (event: Event) => {
      const detail = (event as CustomEvent<{ unitKey: string; useTransportAirlift?: boolean }>).detail;
      if (detail?.unitKey) {
        this.handleBattleRequisitionRequest(detail.unitKey, detail.useTransportAirlift === true);
      }
    };
    document.addEventListener("air:previewRange", this.airPreviewListener);
    document.addEventListener("air:clearPreview", this.airClearPreviewListener);
    document.addEventListener("battle:targetMarkerClicked", this.targetMarkerClickListener);
    document.addEventListener("battle:sentryPipClicked", this.sentryPipClickListener);

    // Wire reserve deployment and battle requisitions from roster/requisition popups.
    document.addEventListener("battle:selectReserve", this.reserveSelectionListener);
    document.addEventListener("battle:requestRequisition", this.requisitionRequestListener);
  }

  /**
   * Initializes the battle screen.
   */
  initialize(): void {
    console.log("[BattleScreen] initialize", {
      deploymentPrimed: this.deploymentPrimed,
      hasCommittedEntries: ensureDeploymentState().hasCommittedEntries()
    });
    this.cacheElements();
    this.soundEnabled = this.loadSoundEnabledPreference();
    this.applySoundPreference(this.soundEnabled);
    this.applyBattleAnimationMode(this.uiState?.battleAnimationMode ?? "regular");
    this.hydrateMissionBriefing();
    this.bindEvents();

    // Initialize child components so their DOM scaffolding is ready before map renders.
    this.deploymentPanel?.initialize();
    // Legacy loadout/reserve presenters are not wired while their DOM is commented out.
    this.battleLoadout?.initialize();
    this.reservePresenter?.initialize();

    // Hook panel event stream -> engine orchestration once listeners exist.
    this.bindPanelEvents();
    this.subscribeToBattleUpdates();

    // Render the battle map and prime state mirrors.
    this.initializeBattleMap();
    this.prepareBattleState(false);
    this.initializeDeploymentMirrors();
    this.syncTurnContext();
    this.renderMissionStatus();

    // Initialize overlays now that DOM scaffolding is available.
    this.selectionIntelOverlay = new SelectionIntelOverlay();
    this.selectionIntelOverlay.update(this.selectionIntel);
    this.battleActivityLog?.registerCollapsedChangeListener((collapsed) => this.reflectActivityLogState(collapsed));
    this.battleActivityLog?.sync(this.activityEvents);

    if (!this.tutorialUpdateUnsubscribe) {
      this.tutorialUpdateUnsubscribe = ensureTutorialState().subscribe((progress) => {
        if (!progress.isActive) {
          return;
        }
        this.syncTutorialPhaseWithCurrentContext(progress.currentPhase);
      });
    }
    document.addEventListener("tutorial:airMissionQueued", this.tutorialAirMissionQueuedListener);
    this.syncTutorialPhaseWithCurrentContext(ensureTutorialState().getCurrentPhase());

    document.addEventListener("screen:shown", this.screenShownHandler);

    // Keyboard navigation wiring.
    window.addEventListener("keydown", this.keyboardNavigationHandler);
  }

  /**
   * Tears down transient listeners when the battle screen unloads, preventing duplicate subscriptions when
   * the commander re-enters the screen multiple times during a session.
   */
  dispose(): void {
    if (this.battleUpdateUnsubscribe) {
      this.battleUpdateUnsubscribe();
      this.battleUpdateUnsubscribe = null;
    }
    window.removeEventListener("keydown", this.keyboardNavigationHandler);
    document.removeEventListener("screen:shown", this.screenShownHandler);
    document.removeEventListener("pointerdown", this.settingsDocumentPointerHandler);
    document.removeEventListener("keydown", this.settingsDocumentKeydownHandler);
    if (this.airPreviewListener) {
      document.removeEventListener("air:previewRange", this.airPreviewListener);
    }
    if (this.airClearPreviewListener) {
      document.removeEventListener("air:clearPreview", this.airClearPreviewListener);
    }
    if (this.targetMarkerClickListener) {
      document.removeEventListener("battle:targetMarkerClicked", this.targetMarkerClickListener);
    }
    if (this.sentryPipClickListener) {
      document.removeEventListener("battle:sentryPipClicked", this.sentryPipClickListener);
      this.sentryPipClickListener = null;
    }
    if (this.reserveSelectionListener) {
      document.removeEventListener("battle:selectReserve", this.reserveSelectionListener);
      this.reserveSelectionListener = null;
    }
    if (this.requisitionRequestListener) {
      document.removeEventListener("battle:requestRequisition", this.requisitionRequestListener);
      this.requisitionRequestListener = null;
    }
    document.removeEventListener("tutorial:airMissionQueued", this.tutorialAirMissionQueuedListener);
    if (this.tutorialUpdateUnsubscribe) {
      this.tutorialUpdateUnsubscribe();
      this.tutorialUpdateUnsubscribe = null;
    }
    this.teardownInitiativeSystemUi();
    this.queuedTargetMarkerActions.clear();
    this.hexMapRenderer?.syncQueuedTargetMarkers([]);

    // Clear any lingering visual announcements and pending timers when the screen unloads.
    this.selectionIntelOverlay?.dispose();
    this.selectionIntelOverlay = null;
    this.battleActivityLog?.dispose();
    
    // Reset UI state when screen is disposed
    setMissionStartedUI(false);
  }

  /**
   * Returns the screen's root element.
   */
  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Caches references to DOM elements.
   */
  private cacheElements(): void {
    this.beginBattleButton = this.element.querySelector("#beginBattle");
    this.settingsToggleButton = this.element.querySelector("#battleSettingsToggle");
    this.settingsMenu = this.element.querySelector("#battleSettingsMenu");
    this.soundToggleButton = this.element.querySelector("#battleSoundToggle");
    this.animationToggleButton = this.element.querySelector("#battleAnimationToggle");
    this.endTurnButton = this.element.querySelector("#endTurn");
    this.endMissionButton = this.element.querySelector("#endMissionButton");
    this.baseCampStatus = this.element.querySelector("#baseCampStatus");
    this.baseCampAssignButton = this.element.querySelector("#assignBaseCamp");
    this.deploymentPanelToggleButton = this.element.querySelector("#deploymentPanelToggle");
    this.deploymentPanelBody = this.element.querySelector("#deploymentPanelBody");
    this.autoDeployEvenlyButton = this.element.querySelector("#autoDeployEvenly");
    this.autoDeployGroupedButton = this.element.querySelector("#autoDeployGrouped");
    this.battleMainContainer = this.element.querySelector(".battle-main");
    this.battleMainContainer?.setAttribute("data-activity-collapsed", "true");
    this.attackConfirmDialog = this.element.querySelector("#battleAttackConfirm");
    this.attackConfirmAccept = this.element.querySelector("#battleAttackConfirmAccept");
    this.attackConfirmCancel = this.element.querySelector("#battleAttackConfirmCancel");
    this.attackConfirmBody = this.element.querySelector("#battleAttackConfirmBody");
    this.fortificationFacingDialog = this.element.querySelector("#battleFortificationFacing");
    this.fortificationFacingPreview = this.element.querySelector("#battleFortificationFacingPreview");
    this.missionTitleElement = this.element.querySelector("#battleMissionTitle");
    this.missionBriefingElement = this.element.querySelector("#battleMissionSummary");
    this.missionObjectivesList = this.element.querySelector("#battleMissionObjectives");
    this.missionDoctrineElement = this.element.querySelector("#battleMissionDoctrine");
    this.missionTurnLimitElement = this.element.querySelector("#battleMissionTurnLimit");
    this.missionSuppliesList = this.element.querySelector("#battleMissionSupplies");
    this.objectiveSummaryButton = this.element.querySelector("#battleCycleObjective");
    this.objectiveIndexElement = this.element.querySelector("#battleObjectiveIndex");
    this.objectiveTitleElement = this.element.querySelector("#battleObjectiveTitle");
    this.objectiveStatusElement = this.element.querySelector("#battleObjectiveStatus");
    this.battleAnnouncements = this.element.querySelector("#battleAnnouncements");
    this.battleIntelOverlayRoot = this.element.querySelector("#battleIntelOverlay");
    this.battleActivityLogToggleButton = this.element.querySelector("#battleActivityLogToggle");
    this.turnIndicatorElement = this.element.querySelector("#battleTurnIndicator");
    this.factionIndicatorElement = this.element.querySelector("#battleFactionIndicator");
    this.phaseIndicatorElement = this.element.querySelector("#battlePhaseIndicator");
    // Idle-warning shell nodes exist in Phase 1 HTML; cache them defensively so we can gracefully skip when removed.
    this.idleWarningLayer = this.element.querySelector("#idleWarningLayer");
    this.idleWarningDialog = this.element.querySelector(".idle-warning-dialog");
    this.idleWarningList = this.element.querySelector("#idleWarningList");
    this.idleContinueButton = this.element.querySelector("#idleContinueButton");
    this.idleEndTurnButton = this.element.querySelector("#idleEndTurnButton");
  }

  private hydrateMissionBriefing(announce = true): void {
    const missionInfo: PrecombatMissionInfo | null = this.battleState.getPrecombatMissionInfo();

    const title = missionInfo?.title ?? this.scenario.name ?? "Operation Pending";
    const briefing = missionInfo?.briefing ?? "Mission details will synchronize once precombat data is available.";
    const objectives = missionInfo?.objectives ?? [];
    const doctrine = missionInfo?.doctrine ?? "Doctrine summary not yet provided.";
    const turnLimit = missionInfo?.turnLimit ?? null;
    const supplies = missionInfo?.baselineSupplies ?? [];

    if (this.missionTitleElement) {
      this.missionTitleElement.textContent = title;
    }
    if (this.missionBriefingElement) {
      this.missionBriefingElement.textContent = briefing;
    }
    if (this.missionObjectivesList) {
      this.missionObjectivesList.innerHTML = objectives.length
        ? objectives.map((objective) => `<li>${objective}</li>`).join("")
        : "<li>Operational objectives will appear here.</li>";
    }
    if (this.missionDoctrineElement) {
      this.missionDoctrineElement.textContent = doctrine;
    }
    if (this.missionTurnLimitElement) {
      this.missionTurnLimitElement.textContent = turnLimit !== null ? `${turnLimit} turns` : "Pending";
    }
    if (this.missionSuppliesList) {
      this.missionSuppliesList.innerHTML = supplies.length
        ? supplies.map((item) => `<li><strong>${item.label}:</strong> ${item.amount}</li>`).join("")
        : "<li>Baseline supplies will be listed once confirmed.</li>";
    }
    this.renderBattleObjectiveSummary();

    const announcementTitle = missionInfo?.title ?? "Mission ready";
    const announcementSummary = missionInfo?.briefing ?? "Awaiting mission briefing details.";
    if (announce) {
      this.announceBattleUpdate(`${announcementTitle}. ${announcementSummary}`);
    }
  }

  /**
   * Binds event handlers.
   */
  private bindEvents(): void {
    this.beginBattleButton?.addEventListener("click", () => this.handleBeginBattle());
    if (this.settingsToggleButton && this.settingsMenu) {
      this.settingsToggleButton.addEventListener("click", () => {
        const open = this.settingsToggleButton?.getAttribute("aria-expanded") !== "true";
        this.setBattleSettingsMenuOpen(open);
      });
      document.addEventListener("pointerdown", this.settingsDocumentPointerHandler);
      document.addEventListener("keydown", this.settingsDocumentKeydownHandler);
    }
    this.soundToggleButton?.addEventListener("click", () => this.handleToggleSound());
    this.animationToggleButton?.addEventListener("click", () => this.handleToggleBattleAnimationMode());
    this.endTurnButton?.addEventListener("click", () => {
      void this.handleEndTurn();
    });
    this.endMissionButton?.addEventListener("click", () => {
      void this.handleEndMission();
    });
    this.attackConfirmAccept?.addEventListener("click", () => void this.handleConfirmAttack());
    this.attackConfirmCancel?.addEventListener("click", () => this.handleCancelAttack());
    this.baseCampAssignButton?.addEventListener("click", () => this.handleAssignBaseCamp());
    this.deploymentPanelToggleButton?.addEventListener("click", () => this.handleToggleDeploymentPanel());
    this.autoDeployEvenlyButton?.addEventListener("click", () => this.handleAutoDeploy("even"));
    this.autoDeployGroupedButton?.addEventListener("click", () => this.handleAutoDeploy("grouped"));
    this.bindSelectionIntelOverlayActions();
    this.bindFortificationFacingDialog();
    // Wire the idle-unit reminder once so end-turn checks can surface the dialog when units still have orders.
    this.bindIdleWarningDialog();
  }

  private bindSelectionIntelOverlayActions(): void {
    if (!this.battleIntelOverlayRoot || this.battleIntelOverlayRoot.dataset.bound === "true") {
      return;
    }
    this.battleIntelOverlayRoot.addEventListener("click", (event) => this.handleSelectionIntelOverlayClick(event));
    this.battleIntelOverlayRoot.dataset.bound = "true";
  }

  private bindFortificationFacingDialog(): void {
    if (!this.fortificationFacingDialog || this.fortificationFacingDialog.dataset.bound === "true") {
      return;
    }

    this.fortificationFacingDialog.addEventListener("click", (event) => {
      const target = event.target as Element | null;
      if (target === this.fortificationFacingDialog) {
        this.hideFortificationFacingDialog();
        return;
      }

      const edgeElement = target?.closest("[data-fortification-edge]");
      const edge = edgeElement?.getAttribute("data-fortification-edge");
      if (!edgeElement || !edge || edgeElement.getAttribute("aria-disabled") === "true") {
        return;
      }

      const normalizedEdge = this.normalizeFortificationEdgeFacing(edge);
      if (!normalizedEdge) {
        return;
      }

      void this.handleConfirmFortificationFacing(normalizedEdge);
    });

    this.fortificationFacingDialog.dataset.bound = "true";
  }

  /**
   * Wires the idle-unit reminder modal exactly once. Each listener is wrapped in guards so missing markup does not crash flows.
   */
  private bindIdleWarningDialog(): void {
    if (!this.idleWarningLayer || !this.idleWarningDialog) {
      return;
    }
    if (this.idleWarningLayer.dataset.bound === "true") {
      return;
    }

    this.idleWarningKeyHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        this.dismissIdleWarning();
        this.restoreViewportAfterIdleDismiss();
      }
    };

    this.idleWarningLayer.addEventListener("click", (event) => {
      if (event.target === this.idleWarningLayer) {
        this.dismissIdleWarning();
        this.restoreViewportAfterIdleDismiss();
      }
    });

    this.idleContinueButton?.addEventListener("click", () => {
      this.dismissIdleWarning();
      this.restoreViewportAfterIdleDismiss();
    });

    this.idleEndTurnButton?.addEventListener("click", () => {
      this.finalizeTurnAfterIdleWarning();
    });

    this.idleWarningLayer.dataset.bound = "true";
  }

  /**
   * Entry point for auto-deployment buttons. Determines the requested mode, computes placements, and executes them.
   */
  private handleAutoDeploy(mode: "even" | "grouped"): void {
    try {
      const engine = this.prepareBattleState(false);
      const deploymentState = ensureDeploymentState();
      deploymentState.mirrorEngineState(engine);
      if (!engine.baseCamp) {
        this.announceBattleUpdate("Assign a base camp before auto-deploying units.");
        return;
      }

      const baseCampKey = engine.baseCamp.key;
      const zoneKey = this.resolveBaseCampZoneKey(baseCampKey);
      if (!zoneKey) {
        this.announceBattleUpdate("Base camp is not aligned with a deployment zone. Cannot auto-deploy.");
        return;
      }

      const plannedPlacements = this.planAutoDeployment(mode, baseCampKey, zoneKey);
      if (plannedPlacements.length === 0) {
        this.announceBattleUpdate("No available units or hexes for auto-deployment.");
        return;
      }

      const placementsSucceeded = this.executeAutoDeployment(engine, plannedPlacements);
      if (!placementsSucceeded) {
        this.announceBattleUpdate("Auto-deployment aborted due to placement errors. Check console for details.");
        return;
      }

      this.refreshDeploymentMirrors("deploy");
      const remainingDeployableUnits = this.countRemainingDeploymentPoolUnits();

      if (remainingDeployableUnits === 0) {
        this.finishDeploymentAfterAutoPlacement(engine);
      } else {
        this.announceBattleUpdate(
          `Auto-deploy complete. ${remainingDeployableUnits} unit${remainingDeployableUnits === 1 ? "" : "s"} remain in reserve.`
        );
      }
    } catch (error) {
      console.error("Auto-deploy failed:", error);
      const message = error instanceof Error ? error.message : "Auto-deploy failed. Check console for details.";
      this.announceBattleUpdate(message);
    }
  }

  /**
   * Converts the base camp key to the associated deployment zone identifier.
   */
  private resolveBaseCampZoneKey(baseCampAxialKey: string): string | null {
    const deploymentState = ensureDeploymentState();
    const offsetKey = CoordinateSystem.axialKeyToOffsetKey(baseCampAxialKey);
    if (!offsetKey) {
      return null;
    }
    return deploymentState.getZoneKeyForHex(offsetKey);
  }

  /**
   * Plans a sequence of hex/unit assignments based on the requested auto-deploy mode.
   */
  private planAutoDeployment(
    mode: "even" | "grouped",
    baseCampAxialKey: string,
    zoneKey: string
  ): Array<{ hexKey: string; unitKey: string }> {
    const deploymentState = ensureDeploymentState();
    const zoneHexes = deploymentState.getZoneHexes(zoneKey);
    const availableHexes = this.collectAvailableHexes(zoneHexes);
    if (availableHexes.length === 0) {
      return [];
    }

    const baseCampAxial = GameEngine.parseAxialKey(baseCampAxialKey);
    const sortedHexes = [...availableHexes].sort((a, b) => {
      const distanceA = this.resolveDistanceFromBase(baseCampAxial, a);
      const distanceB = this.resolveDistanceFromBase(baseCampAxial, b);
      if (distanceA !== distanceB) {
        return distanceA - distanceB;
      }
      return a.localeCompare(b);
    });

    const unitQueue = this.buildInitiativeOrderedUnitQueue();
    if (unitQueue.length === 0) {
      return [];
    }

    const plannedPlacements: Array<{ hexKey: string; unitKey: string }> = [];

    if (mode === "grouped") {
      let unitIndex = 0;
      for (const hexKey of sortedHexes) {
        for (let slot = 0; slot < 2 && unitIndex < unitQueue.length; slot += 1) {
          plannedPlacements.push({ hexKey, unitKey: unitQueue[unitIndex]! });
          unitIndex += 1;
        }
        if (unitIndex >= unitQueue.length) {
          break;
        }
      }
      return plannedPlacements;
    }

    const placementCount = Math.min(sortedHexes.length, unitQueue.length);
    for (let index = 0; index < placementCount; index += 1) {
      plannedPlacements.push({
        hexKey: sortedHexes[index]!,
        unitKey: unitQueue[index]!
      });
    }

    return plannedPlacements;
  }

  /**
   * Builds a deployment queue sorted by initiative from lowest to highest.
   * Units with matching initiative are ordered alphabetically by unit key.
   */
  private buildInitiativeOrderedUnitQueue(): string[] {
    const deploymentState = ensureDeploymentState();
    const entries = deploymentState.pool
      .map((entry) => ({ key: entry.key, remaining: deploymentState.getReserveCount(entry.key) }))
      .filter((entry) => entry.remaining > 0);

    if (entries.length === 0) {
      return [];
    }

    entries.sort((a, b) => {
      const initiativeA = this.resolveInitiativeForDeploymentUnitKey(a.key);
      const initiativeB = this.resolveInitiativeForDeploymentUnitKey(b.key);
      if (initiativeA !== initiativeB) {
        return initiativeA - initiativeB;
      }
      return a.key.localeCompare(b.key);
    });

    const queue: string[] = [];
    entries.forEach((entry) => {
      for (let count = 0; count < entry.remaining; count += 1) {
        queue.push(entry.key);
      }
    });
    return queue;
  }

  private resolveInitiativeForDeploymentUnitKey(unitKey: string): number {
    const deploymentState = ensureDeploymentState();
    const scenarioType = deploymentState.getScenarioTypeForUnitKey(unitKey) ?? unitKey;
    const definition = this.unitTypes[scenarioType as keyof UnitTypeDictionary] as UnitTypeDefinition | undefined;
    if (definition && typeof definition.initiative === "number") {
      return definition.initiative;
    }
    return Number.POSITIVE_INFINITY;
  }

  /**
   * Returns a list of zone hex keys that are currently empty and valid for deployment.
   */
  private collectAvailableHexes(zoneHexes: Iterable<string>): string[] {
    const deploymentState = ensureDeploymentState();
    const available: string[] = [];

    for (const hexKey of zoneHexes) {
      if (deploymentState.getPlacement(hexKey)) {
        continue;
      }
      available.push(hexKey);
    }

    return available;
  }

  /**
   * Wrapper so distance calculations remain readable when sorting deployment targets.
   */
  private resolveDistanceFromBase(baseCamp: Axial, offsetHexKey: string): number {
    const parsed = CoordinateSystem.parseHexKey(offsetHexKey);
    if (!parsed) {
      return Number.POSITIVE_INFINITY;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    return hexDistance(baseCamp, axial);
  }

  /**
   * Executes the planned placements against the engine, emitting announcements for each successful drop.
   */
  private executeAutoDeployment(engine: GameEngine, placements: Array<{ hexKey: string; unitKey: string }>): boolean {
    for (const placement of placements) {
      const parsed = CoordinateSystem.parseHexKey(placement.hexKey);
      if (!parsed) {
        console.warn("Skipping malformed hex key during auto-deploy", placement.hexKey);
        continue;
      }
      const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
      try {
        engine.deployUnitByKey(axial, placement.unitKey);
      } catch (error) {
        console.error("Auto-deploy placement failed", placement, error);
        return false;
      }
    }
    return true;
  }

  private countRemainingDeploymentPoolUnits(): number {
    const deploymentState = ensureDeploymentState();
    return deploymentState.pool.reduce((sum, entry) => {
      return sum + Math.max(0, deploymentState.getReserveCount(entry.key));
    }, 0);
  }

  /**
   * Finalizes deployment and transitions to the battle phase once auto-deploy places every unit.
   */
  private finishDeploymentAfterAutoPlacement(_engine: GameEngine): void {
    try {
      // Auto-deploy should *not* auto-start the battle. Leave the player in deployment so they can review and click Begin Battle.
      this.refreshDeploymentMirrors("sync");

      // Mark tutorial progress for deploy step in case no manual deploy events fired.
      this.completeTutorialPhase("place_units", /* shouldAdvance */ true);

      // Let the player know they're ready to proceed manually.
      this.announceBattleUpdate("All units deployed. Click Begin Battle when you're ready to start the fight.");
    } catch (error) {
      console.error("Failed post auto placement wrap-up", error);
      this.announceBattleUpdate("Deployment synced, but cannot proceed. Check console for details.");
    }
  }

  /**
   * Handles finalizing deployment and beginning the battle.
   */
  private handleBeginBattle(): void {
    try {
      const shouldStageTutorialCombatOverview = this.shouldDeferTutorialInitiativeAutoFocus();

      // Lock reserves directly from the commander-approved allocations to avoid stale mirrors.
      const engine = this.prepareBattleState(true);

      // Check if base camp is set
      if (!engine.baseCamp) {
        this.promptForBaseCamp();
        return;
      }

      // Guard battle start with deterministic integrity checks so commanders receive a clear
      // explanation when the seeding contract breaks (TODO_precombat_battle_handoff.md).
      this.assertBattleReady(engine);

      const reserves = engine.finalizeDeployment();
      console.log("Deployment finalized. Reserves:", reserves);

      // Initialize initiative system and move to initiative turn phase
      this.initializeInitiativeSystem(engine);
      this.initiativeMethods?.startInitiativeTurnPhase(true); // Enable initiative system
      this.syncInitiativeTurnControlsState();
      this.focusCurrentInitiativeActivation();

      this.refreshDeploymentMirrors("sync");

      const deploymentState = ensureDeploymentState();
      deploymentState.cacheFrozenReserves(reserves);
      const mirroredReserves = deploymentState.getReserves();

      const turnSummary = this.battleState.getCurrentTurnSummary();

      this.battleLoadout?.markBattlePhaseStarted();
      this.reservePresenter?.markBattlePhaseStarted(reserves, mirroredReserves);
      this.lockDeploymentInteractions();
      this.deploymentPanel?.enableReserveCallups();
      this.updateUIForBattlePhase({
        turnNumber: turnSummary.turnNumber,
        activeFaction: turnSummary.activeFaction,
        reserveCount: mirroredReserves.length,
        phase: turnSummary.phase
      });
      this.collapseDeploymentPanelForBattlePhase();
      this.renderEngineUnits();

      if (shouldStageTutorialCombatOverview) {
        this.clearSelectedHexAfterAction();
        this.hexMapRenderer?.setZoneHighlights(this.getActivePlayerInitiativeGroupHexKeys());
        this.queueTutorialCombatOverviewCamera();
      }

      // Update UI to show mission has started
      setMissionStartedUI(true);

      const reserveCount = engine.getReserveSnapshot().length;
      this.announceBattleUpdate(
        `Battle phase started. ${reserveCount} reserves standing by. Active faction: ${turnSummary.activeFaction}. Phase: ${turnSummary.phase}.`
      );

      this.completeTutorialPhase("begin_battle");

      // Diagnostic logging for click handling
      setTimeout(() => {
      }, 1000);

    } catch (error) {
      const detail = error instanceof Error
        ? error.message
        : "The battle phase could not start because deployment state validation failed.";
      console.error("[BattleScreen] failed to begin battle", {
        missionKey: this.uiState?.selectedMission ?? "training",
        scenarioName: this.scenario.name,
        error
      });
      this.reportDeploymentPanelError({
        title: "Begin battle failed.",
        detail,
        action: "Correct the deployment issue and try Begin Battle again. Reload the mission if the state remains invalid.",
        recoverable: true
      }, { mirrorToBaseCampStatus: true });
    }
  }

  /**
   * Ensures the engine is fully seeded with commander-approved allocations and current base camp
   * before any deployment mirrors run or Begin Battle finalizes deployment. This method executes
   * synchronously so UI and engine state cannot diverge.
   */
  private prepareBattleState(enforceAllocations: boolean): GameEngine {
    this.refreshScenario();
    // Initialize the engine on first use so flows that call prepareBattleState before the renderer mounts still succeed.
    // Some boot sequences (e.g. direct battle loads) invoke this path without touching initializeBattleMap(), so we must
    // lazily provision the engine here to avoid crashing when BattleState.ensureGameEngine() runs.
    this.ensureEngine();
    const engine = this.battleState.ensureGameEngine();
    const deploymentState = ensureDeploymentState();

    const committedEntries = deploymentState.getCommittedEntryKeys();
    const hasAllocations = deploymentState.hasCommittedEntries();
    const existingReserves = engine.getReserveSnapshot().length;
    const existingPlacements = engine.getPlayerPlacementsSnapshot().length;

    if (!hasAllocations) {
      if (enforceAllocations) {
        throw new Error("Commander allocations missing. Return to precombat and lock requisitions before battle.");
      }
      console.warn("[BattleScreen] prepareBattleState skipped: committed allocations not available yet.");
      return engine;
    }

    // Only reseed when BOTH reserves and placements are empty. If the commander already deployed units
    // and exhausted reserves (reserves === 0 but placements > 0), skip reseeding to avoid wiping placements.
    if (existingReserves === 0 && existingPlacements === 0) {
      const seeded = this.seedEngineFromDeploymentState(engine);
      if (!seeded) {
        throw new Error("Unable to hydrate reserves from committed allocations. Check precombat flow.");
      }
    }

    const baseCamp = engine.baseCamp?.hex ?? null;
    if (!baseCamp && deploymentState.getBaseCampKey()) {
      const baseCampKey = deploymentState.getBaseCampKey();
      if (baseCampKey) {
        const parsed = CoordinateSystem.parseHexKey(baseCampKey);
        if (parsed) {
          engine.setBaseCamp(CoordinateSystem.offsetToAxial(parsed.col, parsed.row));
        }
      }
    }

    console.log("[BattleScreen] prepareBattleState", {
      committedEntries,
      reserveCount: engine.getReserveSnapshot().length,
      baseCamp: engine.baseCamp?.key ?? null
    });

    return engine;
  }

  /**
   * Verifies that commander-approved allocations and base camp intent successfully seeded the engine.
   * This ensures `handleBeginBattle()` fails fast with actionable guidance instead of silent desyncs.
   */
  private assertBattleReady(engine: GameEngine): void {
    const deploymentState = ensureDeploymentState();
    if (!deploymentState.hasCommittedEntries()) {
      throw new Error(
        "Commander allocations are missing. Return to the precombat screen and commit your deployment package before beginning the battle."
      );
    }

    const baseCampKey = engine.baseCamp?.key ?? deploymentState.getBaseCampKey();
    if (!baseCampKey) {
      throw new Error("Assign a base camp before beginning the battle.");
    }

    const reserveCount = engine.getReserveSnapshot().length;
    const placementCount = engine.getPlayerPlacementsSnapshot().length;
    if (reserveCount === 0 && placementCount === 0) {
      const committedKeys = deploymentState.getCommittedEntryKeys();
      throw new Error(
        committedKeys.length === 0
          ? "No committed units remain to deploy. Requisition forces in precombat before starting the battle."
          : "Commander allocations failed to seed the battle engine. Reopen precombat and recommit the deployment package before trying again."
      );
    }

    console.log("[BattleScreen] assertBattleReady satisfied", {
      baseCampKey,
      reserveCount,
      placementCount,
      committedKeys: deploymentState.getCommittedEntryKeys()
    });
  }

  /**
   * Handles ending the current player turn.
   */
  private async handleEndTurn(): Promise<void> {
    try {
      if (this.isInitiativeSystemEnabled && this.initiativeMethods?.isInitiativeSystemActive()) {
        await this.handleInitiativeEndTurn();
        return;
      }

      const preflightSummary = this.battleState.getCurrentTurnSummary();
      const isPlayerTurn = preflightSummary.activeFaction === "Player" && preflightSummary.phase === "playerTurn";

      if (isPlayerTurn) {
        const idleAxialKeys = this.battleState.getIdlePlayerUnitKeys();
        if (idleAxialKeys.length > 0) {
          const firstIdle = idleAxialKeys[0];
          const firstIdleOffset = CoordinateSystem.axialKeyToOffsetKey(firstIdle);
          if (firstIdleOffset) {
            // Park the camera on the first idle formation so the commander immediately sees who still has orders.
            this.focusCameraOnHex(firstIdleOffset);
            this.applySelectedHex(firstIdleOffset);
          }

          this.showIdleWarning(preflightSummary, idleAxialKeys);
          return;
        }
      }

      await this.executeTurnAdvance(preflightSummary);
      this.completeTutorialPhase("turn_end");
    } catch (error) {
      console.error("Failed to end turn:", error);
      this.announceBattleUpdate("Unable to advance turn. Check console for details.");
    }
  }

  /**
   * Presents the idle-unit reminder dialog listing the first few formations still awaiting orders.
   * Falls back to continuing the turn immediately when the markup is unavailable so gameplay never stalls.
   */
  private showIdleWarning(summary: TurnSummary, idleAxialKeys: string[]): void {
    if (!this.idleWarningLayer || !this.idleWarningDialog || !this.idleWarningList) {
      console.warn("Idle warning dialog unavailable; proceeding with turn advance.");
      void this.executeTurnAdvance(summary);
      return;
    }

    this.pendingIdleTurnAdvance = { summary };

    const engine = this.battleState.ensureGameEngine();
    const items = idleAxialKeys.slice(0, 6).map((axialKey) => {
      const unit = engine.playerUnits.find((u) => `${u.hex.q},${u.hex.r}` === axialKey);
      const offsetKey = CoordinateSystem.axialKeyToOffsetKey(axialKey);

      if (unit) {
        const unitLabel = this.toTitleCase(unit.type);
        return `<li><strong>${unitLabel}</strong> at ${offsetKey ?? axialKey}</li>`;
      }

      return `<li><strong>Unit</strong> at ${offsetKey ?? axialKey}</li>`;
    });
    if (idleAxialKeys.length > 6) {
      items.push(`<li>…and ${idleAxialKeys.length - 6} more units awaiting orders.</li>`);
    }
    this.idleWarningList.innerHTML = items.join("");

    this.idleWarningLayer.classList.remove("hidden");
    this.idleWarningLayer.setAttribute("aria-hidden", "false");

    this.idleWarningPreviousFocus = (document.activeElement as HTMLElement) ?? null;
    if (this.idleWarningKeyHandler) {
      document.addEventListener("keydown", this.idleWarningKeyHandler);
    }

    (this.idleContinueButton ?? this.idleEndTurnButton)?.focus();
  }

  /**
   * Closes the idle reminder, restores focus to the previously active element, and clears pending state.
   */
  private dismissIdleWarning(): void {
    if (!this.idleWarningLayer) {
      return;
    }
    this.idleWarningLayer.classList.add("hidden");
    this.idleWarningLayer.setAttribute("aria-hidden", "true");
    if (this.idleWarningKeyHandler) {
      document.removeEventListener("keydown", this.idleWarningKeyHandler);
    }

    const focusTarget = this.idleWarningPreviousFocus;
    this.idleWarningPreviousFocus = null;
    this.pendingIdleTurnAdvance = null;
    focusTarget?.focus();
  }

  /**
   * Commander confirmed they want to advance despite idle units; execute the stored turn summary now.
   * Automatically puts all idle units on sentry before advancing the turn.
   */
  private finalizeTurnAfterIdleWarning(): void {
    const pending = this.pendingIdleTurnAdvance;
    this.dismissIdleWarning();
    if (!pending) {
      return;
    }

    // Auto-sentry all idle units before ending turn
    const engine = this.battleState.ensureGameEngine();
    const idleAxialKeys = this.battleState.getIdlePlayerUnitKeys();
    let autoSentryCount = 0;

    idleAxialKeys.forEach((axialKey) => {
      const parsed = axialKey.split(",").map((s) => Number(s));
      if (parsed.length === 2) {
        const axial = { q: parsed[0]!, r: parsed[1]! };
        const stackMembers = engine.playerUnits.filter((unit) => unit.hex.q === axial.q && unit.hex.r === axial.r);
        if (stackMembers.length === 0) {
          return;
        }

        stackMembers.forEach((unit) => {
          const succeeded = unit.unitId
            ? engine.enterSentry(axial, unit.unitId)
            : engine.enterSentry(axial);
          if (succeeded) {
            autoSentryCount++;
          }
        });
      }
    });

    if (autoSentryCount > 0) {
      console.log(`[BattleScreen] Auto-sentry applied to ${autoSentryCount} idle units`);
      this.renderEngineUnits();
    }

    void this.executeTurnAdvance(pending.summary);
    this.completeTutorialPhase("turn_end");
  }

  /** Executes the actual turn advance and downstream updates. */
  private async executeTurnAdvance(_preflightSummary: TurnSummary): Promise<void> {
    this.deferMissionLogSync = true;
    this.pendingMissionLogSync = false;
    try {
      const report = this.battleState.endPlayerTurn();
      const summary = this.battleState.getCurrentTurnSummary();
      this.publishSelectionIntel(null);

      await this.triggerSupportImpacts();
      await this.triggerAirOperations(summary);
      this.flushDeferredMissionLogSync();

      // Consume and announce bot turn actions
      const botSummary = this.battleState.consumeBotTurnSummary();
      if (botSummary) {
        // WAIT for animations to complete before continuing
        try {
          await this.playBotTurnAnimations(botSummary);
        } catch (error) {
          console.error("Failed to play bot turn animations:", error);
          this.renderEngineUnits();
        }
        this.logBotTurnActivity(botSummary);
        this.announceBotTurnActions(botSummary);
      }

      // Clear selection so player must reselect units with fresh action flags
      this.clearSelectedHex();

      this.refreshDeploymentMirrors("sync");
      this.updateTurnStatusDisplay(summary);
      this.updateTurnControls(summary);
      // Keep idle outlines aligned with the new phase so highlights disappear during bot actions and repopulate on the next player turn.
      this.refreshIdleUnitHighlights(summary);

      this.announceBattleUpdate(
        `Turn ${summary.turnNumber} begins. Active faction: ${summary.activeFaction}. Phase: ${summary.phase}.`
      );
      this.announceSupplyAttrition(report);

      // Auto-open the roster at the start of the player's turn when reserves are available.
      if (summary.activeFaction === "Player" && summary.phase === "playerTurn") {
        try {
          const engineReserves = this.battleState.ensureGameEngine().getReserveSnapshot();
          if (engineReserves.length > 0 && this.popupManager.getActivePopup() !== "armyRoster") {
            this.popupManager.openPopup("armyRoster");
          }
        } catch { }
      }
    } finally {
      this.flushDeferredMissionLogSync();
      this.deferMissionLogSync = false;
      this.pendingMissionLogSync = false;
    }
  }

  /**
   * Handles ending the mission and returning to headquarters.
   */
  private async handleEndMission(): Promise<void> {
    const confirmed = await this.confirmMissionEndRequest();
    if (!confirmed) {
      return;
    }

    const resolution = this.resolveMissionEndResolution();
    if (resolution.aborted) {
      return;
    }

    // Compute a coarse resource expenditure snapshot so the campaign economy reflects this battle.
    // We prefer supply history deltas when available; otherwise fall back to the most recent snapshot.
    let spentAmmo = 0;
    let spentFuel = 0;
    try {
      const history = this.battleState.getSupplyHistory("Player");
      if (history && history.length >= 2) {
        const first = history[0];
        const last = history[history.length - 1];
        const initialAmmo = first?.stockpile?.ammo ?? 0;
        const finalAmmo = last?.stockpile?.ammo ?? 0;
        const initialFuel = first?.stockpile?.fuel ?? 0;
        const finalFuel = last?.stockpile?.fuel ?? 0;
        spentAmmo = Math.max(0, initialAmmo - finalAmmo);
        spentFuel = Math.max(0, initialFuel - finalFuel);
      } else {
        const snap = this.battleState.getSupplySnapshot("Player");
        // With a single snapshot we cannot compute a delta; treat as unknown/zero use for now.
        spentAmmo = 0;
        spentFuel = 0;
        void snap; // placeholder to acknowledge variable
      }
    } catch { }

    // Apply the outcome back to the strategic layer: deduct resources, shift the active front, and
    // remove the resolved engagement. This keeps the feedback loop tight without breaking existing flows.
    const campaign = ensureCampaignState();
    let outcomeAppliedToCampaign = false;
    if (!campaign.getScenario()) {
      console.error("[BattleScreen] mission end could not record campaign outcome", {
        missionKey: this.uiState?.selectedMission ?? "training",
        scenarioName: this.scenario.name,
        reason: "Campaign scenario unavailable during mission-end handoff."
      });
    } else {
      try {
        const active = campaign.getActiveEngagement();
        campaign.applyBattleOutcome({
          activeEngagementId: campaign.getActiveEngagementId(),
          frontKey: active?.frontKey ?? null,
          result: resolution.success ? "PlayerVictory" : "PlayerDefeat",
          casualties: resolution.casualties,
          spentAmmo,
          spentFuel
        });
        outcomeAppliedToCampaign = true;
      } catch (err) {
        console.error("[BattleScreen] mission end failed to apply battle outcome to campaign layer", {
          missionKey: this.uiState?.selectedMission ?? "training",
          scenarioName: this.scenario.name,
          error: err
        });
      }
    }
    const objectiveLabel = resolution.objectivesCompleted === 1 ? "objective" : "objectives";
    const casualtyLabel = resolution.casualties === 1 ? "casualty" : "casualties";
    campaign.setHeadquartersStatusMessage({
      title: resolution.headquartersTitle,
      detail: outcomeAppliedToCampaign
        ? `${this.scenario.name} recorded ${resolution.objectivesCompleted} ${objectiveLabel}, ${resolution.casualties} ${casualtyLabel}, ${spentAmmo} ammo spent, and ${spentFuel} fuel spent. ${resolution.reason}`
        : `${this.scenario.name} ended, but headquarters could not record the strategic outcome cleanly.`,
      action: outcomeAppliedToCampaign
        ? resolution.headquartersAction
        : "Review the campaign state immediately. If the front or resources did not update, reload before continuing.",
      tone: outcomeAppliedToCampaign && resolution.success ? "success" : "warning"
    });

    this.announceBattleUpdate(
      outcomeAppliedToCampaign
        ? `Mission report sent to headquarters. Returning to campaign.`
        : `Mission report incomplete. Returning to campaign for review.`
    );

    if (this.battleAnnouncements) {
      this.battleAnnouncements.textContent = "";
    }

    if (this.baseCampStatus) {
      this.baseCampStatus.removeAttribute("aria-live");
    }

    // Update UI to show mission has ended
    setMissionStartedUI(false);

    // Update general's service record
    this.updateGeneralServiceRecord(resolution.success);

    // Return to the appropriate screen based on where the mission was started
    if (this.uiState?.isFromCampaign) {
      this.screenManager.showScreenById("campaign");
    } else {
      this.screenManager.showScreenById("landing");
    }
  }

  private async confirmMissionEndRequest(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const modalRoot = document.createElement("div");
      modalRoot.className = "initiative-proceed-modal";
      modalRoot.setAttribute("role", "dialog");
      modalRoot.setAttribute("aria-modal", "true");
      modalRoot.setAttribute("aria-labelledby", "missionEndConfirmTitle");
      modalRoot.innerHTML = `
        <div class="initiative-proceed-modal__backdrop"></div>
        <section class="initiative-proceed-modal__content">
          <h3 class="initiative-proceed-modal__title" id="missionEndConfirmTitle">End Mission?</h3>
          <p class="initiative-proceed-modal__copy">
            This will close the battle and record your results in the service record.
          </p>
          <footer class="initiative-proceed-modal__actions">
            <button type="button" class="initiative-proceed-modal__button initiative-proceed-modal__button--secondary" data-action="cancel">Keep Fighting</button>
            <button type="button" class="initiative-proceed-modal__button initiative-proceed-modal__button--primary" data-action="confirm">Return To HQ</button>
          </footer>
        </section>
      `;

      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const confirmButton = modalRoot.querySelector<HTMLButtonElement>('[data-action="confirm"]');
      const cancelButton = modalRoot.querySelector<HTMLButtonElement>('[data-action="cancel"]');
      let finalized = false;

      const finalize = (confirmed: boolean): void => {
        if (finalized) {
          return;
        }
        finalized = true;
        document.removeEventListener("keydown", handleKeydown, true);
        modalRoot.remove();
        previousFocus?.focus();
        resolve(confirmed);
      };

      const handleKeydown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
          event.preventDefault();
          finalize(false);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const focusedAction = (document.activeElement as HTMLElement | null)
            ?.closest<HTMLElement>("[data-action]")
            ?.getAttribute("data-action");
          finalize(focusedAction === "cancel" ? false : true);
        }
      };

      modalRoot.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        if (target === modalRoot.querySelector(".initiative-proceed-modal__backdrop")) {
          finalize(false);
          return;
        }
        const action = target?.closest<HTMLElement>("[data-action]")?.getAttribute("data-action");
        if (action === "confirm") {
          finalize(true);
        } else if (action === "cancel") {
          finalize(false);
        }
      });

      document.addEventListener("keydown", handleKeydown, true);
      document.body.appendChild(modalRoot);
      (cancelButton ?? confirmButton)?.focus();
    });
  }

  /**
   * Updates the selected general's service record with mission completion data.
   */
  private updateGeneralServiceRecord(success: boolean): void {
    if (!this.uiState?.selectedGeneralId) {
      console.warn("[BattleScreen] Cannot update service record: no general selected");
      return;
    }

    const general = findGeneralById(this.uiState.selectedGeneralId);
    if (!general) {
      console.warn("[BattleScreen] Cannot update service record: general not found");
      return;
    }

    // Collect detailed mission statistics
    const missionRecord = this.collectMissionStatistics();
    if (!missionRecord) {
      console.warn("[BattleScreen] Failed to collect mission statistics");
      return;
    }

    // Calculate total casualties and units deployed from this mission
    const totalCasualties = missionRecord.casualties.reduce((sum, c) => sum + c.count, 0);
    const totalDeployed = missionRecord.unitsDeployed.reduce((sum, u) => sum + u.count, 0);

    // Update service record summary
    const currentRecord = general.serviceRecord || { missionsCompleted: 0, victoriesAchieved: 0, unitsDeployed: 0, casualtiesSustained: 0 };
    const updatedRecord = {
      missionsCompleted: currentRecord.missionsCompleted + 1,
      victoriesAchieved: currentRecord.victoriesAchieved + (success ? 1 : 0),
      unitsDeployed: currentRecord.unitsDeployed + totalDeployed,
      casualtiesSustained: currentRecord.casualtiesSustained + totalCasualties
    };

    // Add mission to history
    const currentHistory = general.missionHistory || [];
    const updatedHistory = [...currentHistory, missionRecord];

    // Update general with both summary and detailed history
    updateGeneral(this.uiState.selectedGeneralId, {
      serviceRecord: updatedRecord,
      missionHistory: updatedHistory
    });
    saveRosterToLocalStorage();

    console.log(`[BattleScreen] Updated service record for ${general.identity.name}: ${updatedRecord.missionsCompleted} missions, ${updatedRecord.victoriesAchieved} victories, ${totalCasualties} casualties, ${missionRecord.enemiesDestroyed.reduce((sum, e) => sum + e.count, 0)} enemies destroyed`);
  }

  private resolveMissionEndResolution(): MissionEndResolution {
    const missionStatus = this.missionStatus;
    if (missionStatus && missionStatus.objectives.length > 0 && missionStatus.outcome.state !== "inProgress") {
      const objectivesCompleted = missionStatus.objectives.filter((objective) => objective.state === "completed").length;
      const objectivesFailed = missionStatus.objectives.filter((objective) => objective.state === "failed").length;
      const objectivesContested = missionStatus.objectives.filter((objective) => objective.state === "inProgress" || objective.state === "pending").length;
      const casualties = this.computePlayerCasualties();
      const success = missionStatus.outcome.state === "playerVictory";
      const reason = missionStatus.outcome.reason
        ? `${missionStatus.outcome.reason} Objective board: ${objectivesCompleted} completed, ${objectivesFailed} failed, ${objectivesContested} contested.`
        : `Objective board: ${objectivesCompleted} completed, ${objectivesFailed} failed, ${objectivesContested} contested.`;
      return {
        success,
        objectivesCompleted,
        objectivesFailed,
        objectivesContested,
        casualties,
        reason,
        headquartersTitle: success ? "Mission completed successfully." : "Mission failed.",
        headquartersAction: success
          ? "Review the updated front and headquarters ledgers, then queue the next engagement when ready."
          : "Review the updated front, losses, and objective board before committing the next patrol.",
      };
    }

    const casualties = this.computePlayerCasualties();
    const objectivesCompleted = 0;
    const success = false;
    return {
      success,
      objectivesCompleted,
      objectivesFailed: 0,
      objectivesContested: 0,
      casualties,
      reason: "Mission report used manual commander input while mission-specific objective hooks are still maturing.",
      headquartersTitle: success ? "Mission completed successfully." : "Mission ended.",
      headquartersAction: success
        ? "Review the updated front and headquarters ledgers, then queue the next engagement when ready."
        : "Review the campaign state immediately. If the front or resources did not update, reload before continuing."
    };
  }

  private computePlayerCasualties(): number {
    const initialUnitCount = this.scenario.sides.Player.units.length;
    if (!this.battleState || typeof (this.battleState as BattleState).hasEngine !== "function") {
      return 0;
    }
    if (!(this.battleState as BattleState).hasEngine()) {
      return 0;
    }
    try {
      const engine = (this.battleState as BattleState).ensureGameEngine();
      return Math.max(0, initialUnitCount - engine.playerUnits.length);
    } catch {
      return 0;
    }
  }

  /**
   * Collects comprehensive mission statistics for service record.
   * Tracks casualties, enemies destroyed, ammunition used, and objectives by tier.
   */
  private collectMissionStatistics(): MissionRecord | null {
    if (!this.battleState || !this.scenario || !this.missionStatus) {
      console.warn("[BattleScreen] Cannot collect mission statistics: missing required data");
      return null;
    }

    if (typeof (this.battleState as BattleState).hasEngine !== "function" || !(this.battleState as BattleState).hasEngine()) {
      console.warn("[BattleScreen] Cannot collect mission statistics: no game engine");
      return null;
    }

    try {
      const engine = (this.battleState as BattleState).ensureGameEngine();
      const missionInfo = this.battleState.getPrecombatMissionInfo();
      const missionKey = missionInfo?.missionKey ?? "unknown";
      const missionTitle = this.uiState?.getSelectedMissionTitle() ?? "Unknown Mission";

      // Calculate units deployed by type
      const deployedUnits = this.scenario.sides.Player.units;
      const unitsDeployed = this.aggregateUnitCounts(deployedUnits);

      // Calculate casualties by comparing deployed to current
      const currentPlayerUnits = engine.playerUnits;
      const casualties = this.calculateUnitDifference(deployedUnits, currentPlayerUnits);

      // Calculate enemies destroyed
      const initialEnemyUnits = this.getInitialEnemyUnits();
      const currentEnemyUnits = engine.botUnits;
      const enemiesDestroyed = this.calculateUnitDifference(initialEnemyUnits, currentEnemyUnits);

      // Track ammunition expenditure (approximation from supply history)
      const ammunition = this.calculateAmmunitionExpenditure();

      // Parse objectives by tier
      const objectives = this.parseObjectivesByTier();

      // Capture sortie-level losses separately so reserve-launched aircraft are represented in the mission record.
      const airOperations = this.collectAirOperationsSummary(engine);

      // Determine mission success
      const success = this.missionStatus.outcome.state === "playerVictory";

      // Get turn count
      const turnsElapsed = this.missionStatus.turn;

      return {
        missionKey,
        missionTitle,
        completedAt: new Date().toISOString(),
        success,
        turnsElapsed,
        casualties,
        enemiesDestroyed,
        unitsDeployed,
        ammunition,
        objectives,
        airOperations
      };
    } catch (error) {
      console.error("[BattleScreen] Error collecting mission statistics:", error);
      return null;
    }
  }

  /**
   * Aggregates unit counts by type from an array of scenario units.
   */
  private aggregateUnitCounts(units: readonly ScenarioUnit[]): UnitTypeCount[] {
    const counts = new Map<string, number>();

    for (const unit of units) {
      const type = unit.type;
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }

  /**
   * Calculates the difference between initial and current unit counts.
   * Returns units that were lost (in initial but not in current).
   */
  private calculateUnitDifference(initialUnits: readonly ScenarioUnit[], currentUnits: readonly ScenarioUnit[]): UnitTypeCount[] {
    const initialCounts = new Map<string, number>();
    const currentCounts = new Map<string, number>();

    for (const unit of initialUnits) {
      initialCounts.set(unit.type, (initialCounts.get(unit.type) ?? 0) + 1);
    }

    for (const unit of currentUnits) {
      currentCounts.set(unit.type, (currentCounts.get(unit.type) ?? 0) + 1);
    }

    const differences: UnitTypeCount[] = [];
    for (const [type, initialCount] of initialCounts.entries()) {
      const currentCount = currentCounts.get(type) ?? 0;
      const lost = initialCount - currentCount;
      if (lost > 0) {
        differences.push({ type, count: lost });
      }
    }

    return differences.sort((a, b) => b.count - a.count);
  }

  /**
   * Gets initial enemy units from scenario data.
   */
  private getInitialEnemyUnits(): readonly ScenarioUnit[] {
    // Get Bot faction units
    const enemySide = this.scenario.sides.Bot;
    return enemySide?.units ?? [];
  }

  /**
   * Calculates ammunition expenditure from supply history.
   * This is an approximation based on ammo consumption patterns.
   */
  private calculateAmmunitionExpenditure(): AmmunitionExpenditure {
    try {
      const supplyHistory = this.battleState.getSupplyHistory("Player");
      if (!supplyHistory || supplyHistory.length === 0) {
        return { bombsDropped: 0, artilleryShellsFired: 0, rocketsFired: 0, smallArmsRounds: 0 };
      }

      // Extract ammo from categories
      const initialSnapshot = supplyHistory[0];
      const finalSnapshot = supplyHistory[supplyHistory.length - 1];

      const initialAmmo = initialSnapshot?.categories?.find(c => c.resource === "ammo")?.total ?? 0;
      const finalAmmo = finalSnapshot?.categories?.find(c => c.resource === "ammo")?.total ?? 0;
      const totalAmmoUsed = Math.max(0, initialAmmo - finalAmmo);

      // Estimate ammunition breakdown based on unit types deployed
      // This is approximate - actual tracking would require engine modifications
      const deployedUnits = this.scenario.sides.Player.units;
      const hasBombers = deployedUnits.some(u => u.type.toLowerCase().includes("bomber"));
      const hasArtillery = deployedUnits.some(u => u.type.toLowerCase().includes("artillery") || u.type.toLowerCase().includes("howitzer"));
      const hasRockets = deployedUnits.some(u => u.type.toLowerCase().includes("rocket"));

      return {
        bombsDropped: hasBombers ? Math.floor(totalAmmoUsed * 0.15) : 0,
        artilleryShellsFired: hasArtillery ? Math.floor(totalAmmoUsed * 0.30) : 0,
        rocketsFired: hasRockets ? Math.floor(totalAmmoUsed * 0.20) : 0,
        smallArmsRounds: Math.floor(totalAmmoUsed * 0.35)
      };
    } catch {
      return {
        bombsDropped: 0,
        artilleryShellsFired: 0,
        rocketsFired: 0,
        smallArmsRounds: 0
      };
    }
  }

  /**
   * Parses mission objectives by tier (primary/secondary/tertiary).
   */
  private parseObjectivesByTier(): ObjectiveCompletion {
    if (!this.missionStatus?.objectives) {
      return {
        primaryCompleted: 0,
        primaryTotal: 0,
        secondaryCompleted: 0,
        secondaryTotal: 0,
        tertiaryCompleted: 0,
        tertiaryTotal: 0
      };
    }

    const objectives = this.missionStatus.objectives;
    const primary = objectives.filter(obj => obj.tier === "primary");
    const secondary = objectives.filter(obj => obj.tier === "secondary");
    const tertiary = objectives.filter(obj => obj.tier === "tertiary");

    return {
      primaryCompleted: primary.filter(obj => obj.state === "completed").length,
      primaryTotal: primary.length,
      secondaryCompleted: secondary.filter(obj => obj.state === "completed").length,
      secondaryTotal: secondary.length,
      tertiaryCompleted: tertiary.filter(obj => obj.state === "completed").length,
      tertiaryTotal: tertiary.length
    };
  }

  /**
   * WHAT: Counts live reserves that match the requested unit key using deployment alias rules.
   * WHY: The deployment panel can briefly drift behind engine truth after a reserve is consumed,
   * so battle-screen preflight checks the live queue before issuing another deploy command.
   *
   * @param engine - Live game engine that owns the authoritative reserve queue.
   * @param unitKey - Deployment allocation key requested by the panel.
   * @returns Number of reserve entries that still match the requested key.
   */
  private countLiveReservesForUnitKey(engine: GameEngine, unitKey: string): number {
    const deploymentState = ensureDeploymentState();
    const scenarioType = deploymentState.getScenarioTypeForUnitKey(unitKey);
    return engine.getReserveSnapshot().filter((reserve) => {
      if (reserve.allocationKey === unitKey) {
        return true;
      }
      if (scenarioType && reserve.unit.type === scenarioType) {
        return true;
      }
      if (!reserve.allocationKey) {
        return false;
      }
      return deploymentState.getUnitKeyForScenarioType(reserve.unit.type as string) === unitKey;
    }).length;
  }

  /**
   * WHAT: Checks whether a player placement already occupies the requested deployment hex.
   * WHY: Duplicate deploy events can arrive after a successful placement; when the target hex is already filled,
   * the safest behavior is to refresh mirrors and ignore the redundant request.
   *
   * @param engine - Live game engine containing current player placements.
   * @param hex - Axial hex that the deployment request targeted.
   * @returns True when a player unit already occupies the requested hex.
   */
  private isPlayerPlacementOccupyingHex(engine: GameEngine, hex: Axial): boolean {
    return engine.getPlayerPlacementsSnapshot().some((unit) => unit.hex.q === hex.q && unit.hex.r === hex.r);
  }

  /**
   * WHAT: Builds a concise summary of the live reserve queue for user-facing deployment errors.
   * WHY: The project forbids hidden fallbacks, so deployment failures must explain what reserves remain
   * after the UI is refreshed back to engine truth.
   *
   * @param engine - Live game engine containing the authoritative reserve queue.
   * @returns Human-readable reserve summary, or an empty string when nothing remains ready.
   */
  private summarizeLiveReserveQueue(engine: GameEngine): string {
    const summary = new Map<string, number>();
    engine.getReserveSnapshot().forEach((reserve) => {
      const label = reserve.allocationKey
        ? this.resolveUnitLabel(reserve.allocationKey)
        : String(reserve.unit.type);
      summary.set(label, (summary.get(label) ?? 0) + 1);
    });
    return Array.from(summary.entries(), ([label, count]) => `${label} x${count}`).join(", ");
  }

  /**
   * Builds actionable deployment-capacity guidance that adapts to single-zone missions.
   */
  private buildDeploymentCapacityAction(zoneName: string): string {
    const deploymentState = ensureDeploymentState();
    const playerZones = deploymentState
      .getZoneUsageSummaries()
      .filter((zone) => zone.faction === "Player");
    if (playerZones.length <= 1) {
      return `${zoneName} is full. Recall a deployed formation or reduce allocations before placing more units.`;
    }
    const zoneSummary = playerZones
      .map((zone) => `${zone.name ?? zone.zoneKey} ${zone.remaining}/${zone.capacity} open`)
      .join("; ");
    return `Choose an open hex in another player zone (${zoneSummary}).`;
  }

  /**
   * Handles assigning the base camp location.
   */
  private handleAssignBaseCamp(): void {
    const tutorialState = ensureTutorialState();
    const requiresExplicitTutorialSelection =
      tutorialState.isTutorialActive() && tutorialState.getCurrentPhase() === "base_camp";
    const selectedHexKey = this.selectedHexKey ?? (requiresExplicitTutorialSelection ? null : this.defaultSelectionKey);
    if (!selectedHexKey) {
      this.reportDeploymentPanelError({
        title: "Base camp assignment failed.",
        detail: "No hex is currently selected.",
        action: "Select a deployment-zone hex and try again.",
        recoverable: true
      }, { mirrorToBaseCampStatus: true });
      return;
    }
    if (!this.selectedHexKey) {
      this.applySelectedHex(selectedHexKey);
    }
    const engine = this.battleState.ensureGameEngine();
    const parsed = CoordinateSystem.parseHexKey(selectedHexKey);
    if (!parsed) {
      this.reportDeploymentPanelError({
        title: "Base camp assignment failed.",
        detail: `The selected hex (${selectedHexKey}) could not be parsed.`,
        action: "Clear selection, choose a valid deployment hex, and retry.",
        recoverable: true
      }, { mirrorToBaseCampStatus: true });
      return;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const deploymentState = ensureDeploymentState();
    const selection = this.resolvePlayerDeploymentSelection(selectedHexKey);
    if (!selection.zoneKey) {
      const availableZones = deploymentState.getZoneUsageSummaries()
        .filter((zone) => zone.faction === "Player")
        .map((zone) => zone.name ?? zone.zoneKey);
      const zoneSummary = availableZones.length > 0 ? ` Available player deployment zones: ${availableZones.join(", ")}.` : "";
      this.reportDeploymentPanelError({
        title: "Base camp assignment failed.",
        detail: `Hex ${selectedHexKey} is outside the registered player deployment zones.${zoneSummary}`,
        action: "Select a highlighted player deployment hex and try again. Tip: click Zone Alpha in the deployment list to center on legal hexes.",
        recoverable: true
      }, { mirrorToBaseCampStatus: true });
      return;
    }
    try {
      engine.setBaseCamp(axial);
      this.deploymentPanel?.setCriticalError(null);
      if (this.baseCampStatus) {
        this.baseCampStatus.textContent = `Base camp: ${selectedHexKey}`;
      }
      this.deploymentPanel?.markBaseCampAssigned(selection.zoneKey);
      const offsetKey = CoordinateSystem.makeHexKey(parsed.col, parsed.row);
      this.hexMapRenderer?.renderBaseCampMarker(offsetKey);
      this.refreshDeploymentMirrors("baseCamp", { hexKey: selectedHexKey });
      this.completeTutorialPhase("base_camp");
    } catch (error) {
      console.error("Failed to assign base camp", { hexKey: selectedHexKey, error });
      this.reportDeploymentPanelError({
        title: "Base camp assignment failed.",
        detail: `The engine could not anchor the base camp at ${selectedHexKey}.`,
        action: "Retry with a valid deployment hex. If the issue persists, reload the mission.",
        recoverable: true
      }, { mirrorToBaseCampStatus: true });
    }
  }

  /**
   * Ensures the engine has begun deployment exactly once and mirrors the fresh snapshot into state.
   * This primes UI components before their initial render so they read consistent, post-engine data.
   */
  private primeDeploymentState(): void {
    const engine = this.battleState.ensureGameEngine();
    if (!this.deploymentPrimed) {
      const deploymentState = ensureDeploymentState();
      const seededFromPrecombat = deploymentState.hasCommittedEntries()
        ? this.seedEngineFromDeploymentState(engine)
        : false;
      console.log("[BattleScreen] primeDeploymentState", {
        deploymentPrimed: this.deploymentPrimed,
        committedEntries: deploymentState.getCommittedEntryKeys(),
        seededFromPrecombat
      });
      if (!seededFromPrecombat) {
        engine.beginDeployment();
      }
      this.assertBotUnitsHydrated();
      this.deploymentPrimed = true;
    }
    this.refreshDeploymentMirrors("sync");
  }

  /**
   * Reseeds the engine with committed precombat entries when the battle screen initializes after
   * allocations are locked in. This catches flows where the engine was created before the commander
   * finished precombat, ensuring reserves are ready before any mirrors run.
   */
  private seedEngineIfNeeded(): void {
    const deploymentState = ensureDeploymentState();
    const engine = this.battleState.ensureGameEngine();
    const existingReserveCount = engine.getReserveSnapshot().length;
    const existingPlacements = engine.getPlayerPlacementsSnapshot().length;
    const alreadyHydrated = existingReserveCount > 0 || existingPlacements > 0;
    console.log("[BattleScreen] seedEngineIfNeeded", {
      deploymentPrimed: this.deploymentPrimed,
      committedEntries: deploymentState.getCommittedEntryKeys(),
      existingReserveCount,
      existingPlacements,
      alreadyHydrated
    });

    if (!deploymentState.hasCommittedEntries()) {
      // No commander-approved entries exist. Treat any existing hydration as authoritative and record primed status accordingly.
      this.deploymentPrimed = alreadyHydrated;
      return;
    }

    if (alreadyHydrated && this.deploymentPrimed) {
      // Engine already carries reserves/placements and we previously primed the mirrors; nothing further to do.
      return;
    }

    const seeded = this.seedEngineFromDeploymentState(engine);
    if (!seeded) {
      console.warn("[BattleScreen] seedEngineIfNeeded detected committed entries but failed to seed reserves.");
      return;
    }

    // Mark as primed so subsequent initialization skips redundant reseeding work.
    this.deploymentPrimed = true;
    console.log("[BattleScreen] seedEngineIfNeeded complete", {
      newReserveCount: engine.getReserveSnapshot().length,
      deploymentPrimed: this.deploymentPrimed
    });
    this.assertBotUnitsHydrated();
  }

  /**
   * Hydrates the game engine with the commander-approved deployment pool captured during precombat.
   * When allocations exist, we synthesize fresh scenario units, register sprite metadata, and let
   * `initializeFromAllocations()` trigger the engine's reserve rebuild. Returns true when seeding occurred.
   */
  private seedEngineFromDeploymentState(engine: GameEngine): boolean {
    const summary = engine.getTurnSummary();
    if (summary.phase !== "deployment") {
      console.warn("[BattleScreen] seedEngineFromDeploymentState skipped: engine not in deployment phase", {
        phase: summary.phase,
        activeFaction: summary.activeFaction
      });
      return false;
    }

    const deploymentState = ensureDeploymentState();
    const reserveBlueprints = deploymentState.toReserveBlueprints();
    console.log("[BattleScreen] seedEngineFromDeploymentState blueprint summary", {
      blueprintCount: reserveBlueprints.length,
      committedEntries: deploymentState.getCommittedEntryKeys()
    });
    if (reserveBlueprints.length === 0) {
      console.log("[BattleScreen] seedEngineFromDeploymentState skipping", {
        reason: "noBlueprints"
      });
      return false;
    }

    const scenarioUnits = reserveBlueprints.map((blueprint) => structuredClone(blueprint.unit));
    const pendingRequests = this.aggregateReserveRequests(reserveBlueprints);

    engine.setQueuedAllocations(pendingRequests);
    engine.initializeFromAllocations(scenarioUnits);
    console.log("[BattleScreen] seedEngineFromDeploymentState applied", {
      scenarioUnits: scenarioUnits.length,
      queuedAllocations: pendingRequests.length,
      reserveSnapshot: engine.getReserveSnapshot().length
    });
    return true;
  }

  /**
   * Collapses reserve blueprints into aggregated requests so the engine can retain label/sprite metadata.
   */
  private aggregateReserveRequests(blueprints: readonly ReserveBlueprint[]): PendingReserveRequest[] {
    const tally = new Map<string, { count: number; label: string; sprite?: string }>();
    blueprints.forEach((blueprint) => {
      const current = tally.get(blueprint.unitKey);
      if (current) {
        current.count += 1;
      } else {
        tally.set(blueprint.unitKey, {
          count: 1,
          label: blueprint.label,
          sprite: blueprint.sprite
        });
      }
    });

    return Array.from(tally.entries(), ([unitKey, data]) => ({
      unitKey,
      label: data.label,
      count: data.count,
      sprite: data.sprite
    } satisfies PendingReserveRequest));
  }

  /**
   * Updates the UI when transitioning from deployment to battle phase.
   */
  private updateUIForBattlePhase(args: {
    turnNumber: number;
    activeFaction: string;
    reserveCount: number;
    phase: string;
  }): void {
    // Disable begin battle button while enabling turn controls so the player moves into normal turn flow.
    if (this.beginBattleButton) {
      this.beginBattleButton.disabled = true;
      this.beginBattleButton.setAttribute("aria-disabled", "true");
    }

    const { turnNumber, activeFaction, reserveCount, phase } = args;
    this.announceBattleUpdate(
      `Battle phase engaged. Turn ${turnNumber} (${phase}) is ready for the ${activeFaction}. Reserves standing by: ${reserveCount}.`
    );
    const summary: TurnSummary = {
      turnNumber,
      activeFaction: activeFaction as TurnSummary["activeFaction"],
      phase: phase as TurnSummary["phase"]
    };
    this.updateTurnStatusDisplay(summary);
    this.updateTurnControls(summary);
  }

  /**
   * Collapses/expands the mission briefing panel and updates toggle button label/state.
   */
  /**
   * Collapses/expands the deployment panel body without destroying event bindings.
   */
  private handleToggleDeploymentPanel(): void {
    if (!this.deploymentPanelToggleButton || !this.battleMainContainer) {
      return;
    }
    const isCollapsed = this.battleMainContainer.hasAttribute("data-panel-collapsed");
    const nextState = !isCollapsed;
    if (nextState) {
      this.battleMainContainer.setAttribute("data-panel-collapsed", "true");
      this.deploymentPanelToggleButton.setAttribute("aria-expanded", "false");
      this.deploymentPanelToggleButton.textContent = ">";
      this.deploymentPanelToggleButton.setAttribute("aria-label", "Expand deployment panel");
    } else {
      this.battleMainContainer.removeAttribute("data-panel-collapsed");
      this.deploymentPanelToggleButton.setAttribute("aria-expanded", "true");
      this.deploymentPanelToggleButton.textContent = "<";
      this.deploymentPanelToggleButton.setAttribute("aria-label", "Collapse deployment panel");
    }
  }

  /**
   * Permanently collapses the deployment panel once combat begins so the roster sidebar becomes primary.
   * Remaining reserves are still accessible via the `ReserveListPresenter` and roster popup.
   */
  private collapseDeploymentPanelForBattlePhase(): void {
    if (this.battleMainContainer) {
      this.battleMainContainer.setAttribute("data-panel-collapsed", "true");
    }
    const panelElement = this.deploymentPanel?.getElement();
    if (panelElement) {
      panelElement.setAttribute("hidden", "true");
      panelElement.setAttribute("aria-hidden", "true");
    }
    if (this.deploymentPanelToggleButton) {
      this.deploymentPanelToggleButton.hidden = true;
      this.deploymentPanelToggleButton.setAttribute("aria-hidden", "true");
      this.deploymentPanelToggleButton.setAttribute("aria-expanded", "false");
    }
    this.showActivityLogAfterDeployment();
  }

  /**
   * Initialize the initiative system for this battle
   * 
   * @param engine - The game engine instance
   */
  private initializeInitiativeSystem(engine: GameEngine): void {
    try {
      console.log('Initializing initiative system...');

      if (this.initiativeControlsInitTimerId !== null) {
        window.clearTimeout(this.initiativeControlsInitTimerId);
        this.initiativeControlsInitTimerId = null;
      }

      // Initialize initiative methods
      this.initiativeMethods = new GameEngineInitiativeMethods(engine);
      this.initiativeMethods.setBotActivationListener((event) => this.handleInitiativeBotActivation(event));
      this.isInitiativeSystemEnabled = true;
      this.initiativeGroupCursorUnitId = null;
      this.initiativeGroupSessionId = null;
      this.clearInitiativeSkipState();
      this.syncLegacyEndTurnButton();
      this.ensureInitiativeUiSyncLoop();

      // Initialize initiative group highlighting
      this.highlightCurrentInitiativeGroup();

      // Initialize enhanced turn controls UI after a short delay to ensure DOM is ready
      this.initiativeControlsInitTimerId = window.setTimeout(() => {
        this.initiativeControlsInitTimerId = null;
        this.initializeInitiativeTurnControls();
      }, 100);

      console.log('Initiative system initialized successfully');

    } catch (error) {
      console.error('Failed to initialize initiative system:', error);
      if (this.initiativeUiSyncIntervalId !== null) {
        window.clearInterval(this.initiativeUiSyncIntervalId);
        this.initiativeUiSyncIntervalId = null;
      }
      this.initiativeMethods = null;
      this.isInitiativeSystemEnabled = false;
      this.syncLegacyEndTurnButton();
      // Fall back to traditional turn management
      engine.startPlayerTurnPhase();
    }
  }

  private teardownInitiativeSystemUi(): void {
    if (this.initiativeControlsInitTimerId !== null) {
      window.clearTimeout(this.initiativeControlsInitTimerId);
      this.initiativeControlsInitTimerId = null;
    }

    if (this.initiativeUiSyncIntervalId !== null) {
      window.clearInterval(this.initiativeUiSyncIntervalId);
      this.initiativeUiSyncIntervalId = null;
    }

    if (this.initiativeTurnControls) {
      this.initiativeTurnControls.dispose();
      this.initiativeTurnControls = null;
    }

    const existingControls = document.querySelectorAll('.enhanced-initiative-turn-controls, .initiative-turn-controls-container');
    existingControls.forEach((control) => control.remove());

    document
      .querySelectorAll('.battle-map-header__command-group.initiative-controls-active')
      .forEach((group) => group.classList.remove('initiative-controls-active'));
    document
      .querySelectorAll('.battle-map-header.initiative-controls-active')
      .forEach((header) => header.classList.remove('initiative-controls-active'));

    this.clearInitiativeGroupHighlights();
    this.initiativeGroupCursorUnitId = null;
    this.initiativeGroupSessionId = null;
    this.clearInitiativeSkipState();
    this.initiativeMethods?.setBotActivationListener(null);
    this.initiativeMethods = null;
    this.isInitiativeSystemEnabled = false;
    this.syncLegacyEndTurnButton();
  }

  private ensureInitiativeUiSyncLoop(): void {
    if (this.initiativeUiSyncIntervalId !== null) {
      return;
    }

    this.initiativeUiSyncIntervalId = window.setInterval(() => {
      if (!this.isInitiativeSystemEnabled || !this.initiativeMethods) {
        if (this.initiativeUiSyncIntervalId !== null) {
          window.clearInterval(this.initiativeUiSyncIntervalId);
          this.initiativeUiSyncIntervalId = null;
        }
        return;
      }

      const initiativeActive = this.initiativeMethods.isInitiativeSystemActive();
      this.syncInitiativeTurnControlsState();
      this.refreshIdleUnitHighlights();
      this.highlightCurrentInitiativeGroup();
      if (!initiativeActive && this.initiativeUiSyncIntervalId !== null) {
        window.clearInterval(this.initiativeUiSyncIntervalId);
        this.initiativeUiSyncIntervalId = null;
      }
    }, 200);
  }

  /**
   * Initialize the enhanced turn controls UI
   */
  private initializeInitiativeTurnControls(): void {
    try {
      if (this.initiativeTurnControls) {
        this.initiativeTurnControls.dispose();
        this.initiativeTurnControls = null;
      }

      document
        .querySelectorAll('.battle-map-header__command-group.initiative-controls-active')
        .forEach((group) => group.classList.remove('initiative-controls-active'));
      document
        .querySelectorAll('.battle-map-header.initiative-controls-active')
        .forEach((header) => header.classList.remove('initiative-controls-active'));

      // Remove any existing initiative controls from deployment panel or other locations
      const existingControls = document.querySelectorAll('.enhanced-initiative-turn-controls, .initiative-turn-controls-container');
      existingControls.forEach(control => {
        console.log('Removing existing initiative controls from:', control.parentElement);
        control.remove();
      });
      
      // Create a container for the enhanced turn controls
      const controlsContainer = document.createElement('div');
      controlsContainer.className = 'initiative-turn-controls-container';
      
      // Insert into the top bar command group (where sound toggle and end turn button are)
      const commandGroup = document.querySelector('.battle-map-header__command-group');
      if (commandGroup) {
        commandGroup.classList.add('initiative-controls-active');
        commandGroup.closest('.battle-map-header')?.classList.add('initiative-controls-active');
        commandGroup.appendChild(controlsContainer);
        console.log('Initiative controls container added to top bar command group');
      } else {
        // Fallback to battle controls if command group not found
        const battleControls = document.querySelector('.battle-controls') || document.body;
        battleControls.appendChild(controlsContainer);
        console.log('Initiative controls container added to fallback location');
      }
      
      // Initialize enhanced turn controls
      this.initiativeTurnControls = new EnhancedInitiativeTurnControls(
        controlsContainer,
        {
          onSkipTurn: () => this.handleSkipTurn(),
          onEndTurn: () => {
            void this.handleTutorialAwareEndTurn();
          },
          onNextActivation: () => this.handleNextActivation(),
          onCompleteActivation: (unitId: string) => this.handleCompleteActivation(unitId),
          onProceedToNext: () => {
            void this.handleProceedToNext();
          },
          onSkipGroup: () => this.handleSkipGroup()
        },
        {
          showSkipTurn: true,
          showEndTurn: true,
          showProceedButton: false,
          showCurrentUnitInfo: true,
          showGroupInfo: true,
          enableKeyboardShortcuts: true
        }
      );
      
      this.syncInitiativeTurnControlsState();

      console.log('Enhanced turn controls initialized in top bar');
      
    } catch (error) {
      console.error('Failed to initialize enhanced turn controls:', error);
    }
  }

  /**
   * Handle proceed to next unit action
   */
  private async handleProceedToNext(options?: { endTurnSkipAll?: boolean; bypassConfirmation?: boolean }): Promise<boolean> {
    if (!this.initiativeMethods) {
      console.warn('Initiative methods not available');
      return false;
    }

    const endTurnSkipAll = options?.endTurnSkipAll === true;
    const bypassConfirmation = options?.bypassConfirmation === true;

    try {
      const queue = this.initiativeMethods.getCurrentInitiativeQueue();
      const activeGroup = this.resolveActiveInitiativeGroup(queue);
      const currentActivation = this.initiativeMethods.getCurrentActivation();
      if (!activeGroup || activeGroup.ownerId !== "player" || !currentActivation || currentActivation.ownerId !== "player") {
        this.syncInitiativeTurnControlsState();
        return false;
      }

      const pendingUnits = this.resolveUncommittedPlayerInitiativeUnits(activeGroup);
      const currentUnitId = currentActivation.unitId;
      const currentUnitIsPending = pendingUnits.some((unit) => unit.unitId === currentUnitId);
      const hasPendingUnits = pendingUnits.length > 0;

      if (hasPendingUnits && !bypassConfirmation) {
        const confirmProceed = await this.confirmInitiativeProceedWithPendingUnits(
          pendingUnits,
          currentUnitId,
          currentUnitIsPending
        );
        if (!confirmProceed) {
          this.syncInitiativeTurnControlsState();
          return false;
        }
      }

      if (currentUnitIsPending) {
        const engine = this.battleState.ensureGameEngine();
        const currentUnit = engine.playerUnits.find((entry) => entry.unitId === currentUnitId);
        if (currentUnit && !currentUnit.onSentry) {
          engine.enterSentry(currentUnit.hex, currentUnit.unitId ?? undefined);
        }
      }

      if (endTurnSkipAll) {
        const skippedPlayerActivationCount = this.skipRemainingPlayerInitiativeTurnActivations(queue);
        this.initiativeEndTurnSkipModeActive = skippedPlayerActivationCount > 0;
      } else {
        this.initiativeEndTurnSkipModeActive = false;
      }
      this.commitCurrentPlayerInitiativeGroup(activeGroup.initiative, false);
      if (endTurnSkipAll && this.initiativeEndTurnSkipModeActive) {
        this.flushSkippedInitiativeActivations();
      }
      this.focusCurrentInitiativeActivation();
      this.highlightCurrentInitiativeGroup();
      return true;
    } catch (error) {
      console.error('Failed to proceed from initiative group:', error);
      return false;
    } finally {
      this.syncInitiativeTurnControlsState();
    }
  }

  /**
   * Handle skip group action
   */
  private handleSkipGroup(): void {
    if (!this.initiativeMethods) {
      console.warn('Initiative methods not available');
      return;
    }

    try {
      const queue = this.initiativeMethods.getCurrentInitiativeQueue();
      const activeGroup = this.resolveActiveInitiativeGroup(queue);
      if (!activeGroup || activeGroup.ownerId !== "player") {
        return;
      }

      const engine = this.battleState.ensureGameEngine();
      activeGroup.activations.forEach((activation) => {
        const unit = engine.playerUnits.find((entry) => entry.unitId === activation.unitId);
        if (unit && !unit.onSentry) {
          engine.enterSentry(unit.hex, unit.unitId ?? undefined);
        }
        this.initiativeSkippedUnitIds.add(activation.unitId);
      });
      this.initiativeGroupCursorUnitId = null;
      
      this.showElegantInitiativeMessage("Group ordered to hold. Commit Orders to pass initiative.");
      this.highlightCurrentInitiativeGroup();
    } catch (error) {
      console.error('Failed to skip group:', error);
    } finally {
      this.syncInitiativeTurnControlsState();
    }
  }

  /**
   * Handle end turn action for initiative system
   */
  private async handleTutorialAwareEndTurn(): Promise<void> {
    const tutorialState = ensureTutorialState();
    if (
      tutorialState.isTutorialActive() &&
      tutorialState.getCurrentPhase() === "spend_activation"
    ) {
      const proceeded = await this.handleProceedToNext({ bypassConfirmation: true });
      if (proceeded) {
        this.completeTutorialPhase("spend_activation");
      }
      return;
    }

    await this.handleInitiativeEndTurn();
  }

  /**
   * Handle end turn action for initiative system
   */
  private async handleInitiativeEndTurn(): Promise<void> {
    if (!this.initiativeMethods) {
      console.warn('Initiative methods not available');
      return;
    }

    try {
      let currentActivation = this.initiativeMethods.getCurrentActivation();
      if (currentActivation?.ownerId === "player") {
        const proceeded = await this.handleProceedToNext({ endTurnSkipAll: true });
        if (!proceeded) {
          return;
        }
      }

      if (this.initiativeEndTurnSkipModeActive) {
        this.flushSkippedInitiativeActivations();
      }

      const refreshedQueue = this.initiativeMethods.getCurrentInitiativeQueue();
      currentActivation = this.initiativeMethods.getCurrentActivation();
      const hasPendingActivations = this.hasPendingInitiativeActivations(refreshedQueue);

      if (currentActivation?.ownerId === "player") {
        if (this.initiativeEndTurnSkipModeActive) {
          this.initiativeSkippedUnitIds.add(currentActivation.unitId);
          this.flushSkippedInitiativeActivations();
          currentActivation = this.initiativeMethods.getCurrentActivation();
          if (currentActivation?.ownerId === "player") {
            this.showElegantInitiativeMessage("Remaining formations are being set to sentry. Enemy activations are resolving.");
          }
          return;
        }
        this.showElegantInitiativeMessage("Complete this activation or press End Turn again to confirm the handoff.");
        return;
      }

      if (!currentActivation && hasPendingActivations) {
        const recovered = this.recoverInitiativeQueueStall(refreshedQueue);
        if (!recovered) {
          this.showElegantInitiativeMessage("Initiative sequencing is catching up. Please try End Turn again.");
        }
        return;
      }

      if (!hasPendingActivations) {
        await this.advanceInitiativeRound();
        return;
      }

      if (this.initiativeEndTurnSkipModeActive) {
        this.publishActivityEvent({
          category: "enemy",
          type: "log",
          summary: "Enemy activations are resolving. Stand by for movement and fire reports."
        });
        this.showElegantInitiativeMessage("Remaining formations set to sentry. Enemy activations are resolving.");
        return;
      }

      this.publishActivityEvent({
        category: "enemy",
        type: "log",
        summary: "Enemy activations are resolving. Stand by for movement and fire reports."
      });
      this.showElegantInitiativeMessage("Enemy activations are resolving. Wait for the current movement/combat sequence.");
    } catch (error) {
      console.error('Failed to end turn:', error);
    } finally {
      this.syncInitiativeTurnControlsState();
    }
  }

  private skipRemainingPlayerInitiativeTurnActivations(queueOverride?: any): number {
    const queue = queueOverride ?? this.initiativeMethods?.getCurrentInitiativeQueue();
    if (!queue || !Array.isArray(queue.activations)) {
      return 0;
    }

    const engine = this.battleState.ensureGameEngine();
    let skippedCount = 0;

    queue.activations.forEach((activation: { unitId: string; ownerId: "player" | "bot"; isActivated: boolean }) => {
      if (activation.ownerId !== "player" || activation.isActivated) {
        return;
      }

      this.initiativeSkippedUnitIds.add(activation.unitId);
      skippedCount += 1;

      const unit = this.resolvePlayerUnitForInitiativeActivation(activation.unitId);
      if (unit && !unit.onSentry && !this.hasUnitCommittedOrders(unit)) {
        engine.enterSentry(unit.hex, unit.unitId ?? undefined);
      }
    });

    return skippedCount;
  }

  private hasPendingInitiativeActivations(queue: any): boolean {
    return Boolean(queue?.activations?.some((entry: { isActivated: boolean }) => !entry.isActivated));
  }

  private recoverInitiativeQueueStall(queueOverride?: any): boolean {
    if (!this.initiativeMethods || !this.isInitiativeSystemEnabled || this.initiativeTurnAdvanceInProgress) {
      return false;
    }

    const queue = queueOverride ?? this.initiativeMethods.getCurrentInitiativeQueue();
    if (!this.hasPendingInitiativeActivations(queue)) {
      return false;
    }

    const currentActivation = this.initiativeMethods.getCurrentActivation();
    if (currentActivation) {
      return false;
    }

    try {
      const resumed = this.initiativeMethods.processNextInitiativeActivation();
      if (!resumed) {
        return false;
      }
      this.focusCurrentInitiativeActivation();
      this.highlightCurrentInitiativeGroup();
      return true;
    } catch (error) {
      console.error("Failed to recover stalled initiative queue:", error);
      return false;
    }
  }

  private async advanceInitiativeRound(): Promise<void> {
    if (!this.initiativeMethods || this.initiativeTurnAdvanceInProgress) {
      return;
    }

    this.initiativeTurnAdvanceInProgress = true;
    try {
      const engine = this.battleState.ensureGameEngine() as unknown as {
        _phase: string;
        _activeFaction: "Player" | "Bot" | "Ally";
      };
      // Initiative mode already resolved tactical bot activations this round.
      // Force round advancement through the post-bot path so endTurn applies
      // supply/air bookkeeping without executing a second full bot ground turn.
      engine._phase = "botTurn";
      engine._activeFaction = "Bot";

      const preflight = this.battleState.getCurrentTurnSummary();
      await this.executeTurnAdvance(preflight);

      const postAdvanceSummary = this.battleState.getCurrentTurnSummary();
      if (postAdvanceSummary.phase === "completed") {
        this.teardownInitiativeSystemUi();
        return;
      }

      this.initiativeGroupCursorUnitId = null;
      this.initiativeGroupSessionId = null;
      this.clearInitiativeSkipState();
      this.initiativeMethods.startNextInitiativeTurnPhase();
      this.focusCurrentInitiativeActivation();
      this.highlightCurrentInitiativeGroup();
    } catch (error) {
      console.error("Failed to advance initiative round:", error);
      this.announceBattleUpdate("Unable to advance initiative round. Check console for details.");
    } finally {
      this.initiativeTurnAdvanceInProgress = false;
      this.syncInitiativeTurnControlsState();
    }
  }

  /**
   * Handle next activation action
   */
  private handleNextActivation(): void {
    if (!this.initiativeMethods) {
      console.warn('Initiative methods not available');
      return;
    }

    try {
      this.selectNextInitiativeGroupUnit();
      this.highlightCurrentInitiativeGroup();
    } catch (error) {
      console.error('Failed to process next activation:', error);
    } finally {
      this.syncInitiativeTurnControlsState();
    }
  }

  /**
   * Handle skip turn action
   */
  private handleSkipTurn(): void {
    if (!this.initiativeMethods) {
      console.warn('Initiative methods not available');
      return;
    }

    try {
      // Get current initiative queue to find the current unit
      const currentQueue = this.initiativeMethods.getCurrentInitiativeQueue();
      if (currentQueue && currentQueue.activations && currentQueue.activations.length > 0) {
        const currentActivation = currentQueue.activations[currentQueue.currentIndex];
        if (currentActivation) {
          // Put the current unit on sentry mode
          const engine = this.battleState.ensureGameEngine();
          const allUnits = currentActivation.ownerId === 'player' ? engine.playerUnits : engine.botUnits;
          const currentUnit = allUnits.find(u => u.unitId === currentActivation.unitId);
          
          if (currentUnit && !currentUnit.onSentry) {
            const placedOnSentry = engine.enterSentry(currentUnit.hex, currentUnit.unitId ?? undefined);
            if (placedOnSentry) {
              console.log(`Putting unit ${currentUnit.unitId} on sentry mode (skip unit)`);
            }
          }
        }
      }

      const activationToComplete = this.initiativeMethods.getCurrentActivation();
      if (activationToComplete) {
        this.initiativeMethods.completeUnitActivation(activationToComplete.unitId);
      }
      
      // Update initiative group highlighting
      this.highlightCurrentInitiativeGroup();
    } catch (error) {
      console.error('Failed to skip turn:', error);
    } finally {
      this.syncInitiativeTurnControlsState();
    }
  }

  /**
   * Handle complete activation action
   */
  private handleCompleteActivation(unitId: string): void {
    if (!this.initiativeMethods) {
      console.warn('Initiative methods not available');
      return;
    }

    try {
      // Complete the unit activation
      this.initiativeMethods.completeUnitActivation(unitId);
      
      // Update initiative group highlighting
      this.highlightCurrentInitiativeGroup();
    } catch (error) {
      console.error('Failed to complete activation:', error);
    } finally {
      this.syncInitiativeTurnControlsState();
    }
  }

  /**
   * Highlight units in the current initiative group
   */
  private highlightCurrentInitiativeGroup(): void {
    if (!this.initiativeMethods) {
      return;
    }

    try {
      const currentQueue = this.initiativeMethods.getCurrentInitiativeQueue();
      const activeGroup = this.resolveActiveInitiativeGroup(currentQueue);
      if (!activeGroup) {
        this.initiativeGroupSessionId = null;
        this.initiativeGroupCursorUnitId = null;
        if (!this.hasPendingInitiativeActivations(currentQueue)) {
          this.clearInitiativeSkipState();
        }
        this.clearInitiativeGroupHighlights();
        return;
      }

      this.syncInitiativeGroupSession(activeGroup);

      const highlightActivations = activeGroup.ownerId === "player"
        ? this.resolveSelectablePlayerInitiativeActivations(activeGroup)
        : [activeGroup.activations[0]].filter((activation): activation is { unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder?: number } => Boolean(activation));

      const unitHexes = highlightActivations
        .map((activation) => this.resolveActivationOffsetHexKey(activation.unitId, activation.ownerId))
        .filter((hexKey): hexKey is string => Boolean(hexKey));

      // Apply highlights to the map renderer
      this.hexMapRenderer?.setInitiativeGroupHighlights(unitHexes);
      
    } catch (error) {
      console.error('Failed to highlight initiative group:', error);
    }
  }

  /**
   * Clear initiative group highlights
   */
  private clearInitiativeGroupHighlights(): void {
    this.hexMapRenderer?.clearInitiativeGroupHighlights();
  }

  /**
   * Check if a unit is in the current initiative group
   */
  private isUnitInCurrentInitiativeGroup(unitId: string): boolean {
    if (!this.initiativeMethods) {
      return true; // Initiative system not available, defer to normal turn rules.
    }

    try {
      const queue = this.initiativeMethods.getCurrentInitiativeQueue();
      const activeGroup = this.resolveActiveInitiativeGroup(queue);
      if (!activeGroup || activeGroup.ownerId !== "player") {
        return false;
      }

      return activeGroup.activations.some((activation) => activation.unitId === unitId);
    } catch (error) {
      console.error('Failed to check unit initiative group:', error);
      return true; // Fallback: allow unit on error
    }
  }

  /**
   * Show elegant message when attempting to move unit not in current initiative group
   */
  private showInitiativeGroupMessage(unitId: string): void {
    if (!this.initiativeMethods) {
      return;
    }

    try {
      const engine = this.battleState.ensureGameEngine();
      const unit = engine.playerUnits.find(u => u.unitId === unitId);
      if (!unit) {
        return;
      }

      const unitReference = this.resolveReadableInitiativeUnitEntry(unit);
      
      const currentQueue = this.initiativeMethods.getCurrentInitiativeQueue();
      const activeGroup = this.resolveActiveInitiativeGroup(currentQueue);
      if (!activeGroup) {
        const hasPendingActivations = this.hasPendingInitiativeActivations(currentQueue);
        this.showElegantInitiativeMessage(
          hasPendingActivations
            ? `${unitReference} cannot act yet. Initiative sequencing is still resolving another activation.`
            : `${unitReference} cannot act right now. This round is complete. Press End Turn to advance.`
        );
        return;
      }

      const unitDefinition = this.unitTypes?.[unit.type as keyof UnitTypeDictionary];
      const unitInitiative = unitDefinition?.initiative ?? null;
      const activeInitiative = activeGroup.initiative;
      const currentActivation = this.initiativeMethods.getCurrentActivation();
      const currentActivationUnit = currentActivation?.ownerId === "player"
        ? engine.playerUnits.find((entry) => entry.unitId === currentActivation.unitId) ?? null
        : null;
      const currentActivationLabel = currentActivationUnit
        ? this.resolveReadableInitiativeUnitEntry(currentActivationUnit)
        : "the active formation";

      const message = unitInitiative === activeInitiative && currentActivation?.ownerId === "player" && currentActivation.unitId !== unitId
        ? `${unitReference} is in initiative ${activeInitiative}, but ${currentActivationLabel} is currently acting. Complete that order or press End Turn to hand off the next activation.`
        : unitInitiative === null
          ? `${unitReference} cannot act in the current initiative band. Active initiative is ${activeInitiative}. Press End Turn to continue.`
          : `${unitReference} activates at initiative ${unitInitiative}. The current active group is initiative ${activeInitiative}.`;
      this.showElegantInitiativeMessage(message);
    } catch (error) {
      console.error('Failed to show initiative group message:', error);
    }
  }

  private resolveReadableUnitLabel(unit: ScenarioUnit): string {
    try {
      const rawLabel = this.resolveUnitLabelForUnit(unit) ?? this.toTitleCase(unit.type as string);
      const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
      if (!label || label.toLowerCase() === "null" || label.toLowerCase() === "undefined") {
        return this.toTitleCase(unit.type as string);
      }
      return label;
    } catch {
      return this.toTitleCase(unit.type as string);
    }
  }

  private resolveReadableInitiativeUnitEntry(unit: ScenarioUnit): string {
    const label = this.resolveReadableUnitLabel(unit);
    const hexKey = this.toOffsetHexKey(unit.hex);
    return hexKey ? `${label} (${hexKey})` : label;
  }

  private async confirmInitiativeProceedWithPendingUnits(
    pendingUnits: readonly ScenarioUnit[],
    currentUnitId: string,
    currentUnitIsPending: boolean
  ): Promise<boolean> {
    const currentUnit = pendingUnits.find((unit) => unit.unitId === currentUnitId) ?? null;
    const currentLabel = currentUnit ? this.resolveReadableUnitLabel(currentUnit) : "This formation";
    const leadCopy = currentUnitIsPending
      ? `${this.escapeHtml(currentLabel)} still has actions available. Ending now will place it on sentry and advance initiative.`
      : "Other formations in this initiative band still have actions available.";
    const items = pendingUnits
      .slice(0, 8)
      .map((unit) => `<li>${this.escapeHtml(this.resolveReadableInitiativeUnitEntry(unit))}</li>`)
      .join("");
    const overflowCount = Math.max(0, pendingUnits.length - 8);
    const overflowItem = overflowCount > 0
      ? `<li>...and ${overflowCount} more formation${overflowCount === 1 ? "" : "s"}.</li>`
      : "";

    return new Promise<boolean>((resolve) => {
      const modalRoot = document.createElement("div");
      modalRoot.className = "initiative-proceed-modal";
      modalRoot.setAttribute("role", "dialog");
      modalRoot.setAttribute("aria-modal", "true");
      modalRoot.setAttribute("aria-labelledby", "initiativeProceedTitle");
      modalRoot.innerHTML = `
        <div class="initiative-proceed-modal__backdrop"></div>
        <section class="initiative-proceed-modal__content">
          <h3 class="initiative-proceed-modal__title" id="initiativeProceedTitle">Units Still Awaiting Orders</h3>
          <p class="initiative-proceed-modal__copy">
            ${leadCopy}
          </p>
          <p class="initiative-proceed-modal__copy">
            ${pendingUnits.length} unit${pendingUnits.length === 1 ? "" : "s"} in this initiative band can still act:
          </p>
          <ul class="initiative-proceed-modal__list">${items}${overflowItem}</ul>
          <footer class="initiative-proceed-modal__actions">
            <button type="button" class="initiative-proceed-modal__button initiative-proceed-modal__button--secondary" data-action="cancel">Keep Commanding</button>
            <button type="button" class="initiative-proceed-modal__button initiative-proceed-modal__button--primary" data-action="confirm">End Turn Anyway</button>
          </footer>
        </section>
      `;

      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const confirmButton = modalRoot.querySelector<HTMLButtonElement>('[data-action="confirm"]');
      const cancelButton = modalRoot.querySelector<HTMLButtonElement>('[data-action="cancel"]');
      let finalized = false;

      const finalize = (confirmed: boolean): void => {
        if (finalized) {
          return;
        }
        finalized = true;
        document.removeEventListener("keydown", handleKeydown, true);
        modalRoot.remove();
        previousFocus?.focus();
        resolve(confirmed);
      };

      const handleKeydown = (event: KeyboardEvent): void => {
        if (event.key === "Escape") {
          event.preventDefault();
          finalize(false);
          return;
        }
        if (event.key === "Enter") {
          event.preventDefault();
          const focusedAction = (document.activeElement as HTMLElement | null)
            ?.closest<HTMLElement>("[data-action]")
            ?.getAttribute("data-action");
          finalize(focusedAction === "cancel" ? false : true);
        }
      };

      modalRoot.addEventListener("click", (event) => {
        const target = event.target as HTMLElement | null;
        if (target === modalRoot.querySelector(".initiative-proceed-modal__backdrop")) {
          finalize(false);
          return;
        }
        const action = target?.closest<HTMLElement>("[data-action]")?.getAttribute("data-action");
        if (action === "confirm") {
          finalize(true);
        } else if (action === "cancel") {
          finalize(false);
        }
      });

      document.addEventListener("keydown", handleKeydown, true);
      document.body.appendChild(modalRoot);
      (cancelButton ?? confirmButton)?.focus();
    });
  }

  private resolveActivationOffsetHexKey(unitId: string, ownerId: "player" | "bot"): string | null {
    const engine = this.battleState.ensureGameEngine();
    const units = ownerId === "player" ? engine.playerUnits : engine.botUnits;
    const unit = units.find((entry) => entry.unitId === unitId);
    return this.toOffsetHexKey(unit?.hex);
  }

  private resolveActiveInitiativeGroup(currentQueue: any): {
    initiative: number;
    ownerId: "player" | "bot";
    activations: Array<{ unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder?: number }>;
  } | null {
    if (!currentQueue || !Array.isArray(currentQueue.activations) || currentQueue.activations.length === 0) {
      return null;
    }

    const startIndex = typeof currentQueue.currentIndex === "number" ? currentQueue.currentIndex : 0;
    const activeActivation = currentQueue.activations.find(
      (activation: { isActivated: boolean }, index: number) => index >= startIndex && !activation.isActivated
    );

    if (!activeActivation) {
      return null;
    }

    const groupedActivations = currentQueue.activations.filter(
      (
        activation: { ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder?: number },
        index: number
      ) =>
        index >= startIndex &&
        !activation.isActivated &&
        activation.ownerId === activeActivation.ownerId &&
        activation.initiative === activeActivation.initiative
    );

    return {
      initiative: activeActivation.initiative,
      ownerId: activeActivation.ownerId,
      activations: groupedActivations
    };
  }

  private syncInitiativeGroupSession(activeGroup: {
    initiative: number;
    ownerId: "player" | "bot";
    activations: Array<{ unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder?: number }>;
  }): void {
    const queue = this.initiativeMethods?.getCurrentInitiativeQueue();
    const turn = typeof queue?.currentTurn === "number" ? queue.currentTurn : 0;
    // Track session by turn + initiative band, not by owner, so player-skip state
    // survives interleaved bot activations inside the same initiative value.
    const nextSessionId = `${turn}:${activeGroup.initiative}`;
    if (this.initiativeGroupSessionId === nextSessionId) {
      return;
    }

    this.initiativeGroupSessionId = nextSessionId;
    this.initiativeGroupCursorUnitId = null;
    if (!this.initiativeEndTurnSkipModeActive) {
      this.initiativeSkippedUnitIds.clear();
    }
  }

  private resolveUncommittedPlayerInitiativeUnits(activeGroup: {
    initiative: number;
    ownerId: "player" | "bot";
    activations: Array<{ unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder?: number }>;
  }): ScenarioUnit[] {
    if (activeGroup.ownerId !== "player") {
      return [];
    }

    return activeGroup.activations
      .filter((activation) => !this.initiativeSkippedUnitIds.has(activation.unitId))
      .map((activation) => this.resolvePlayerUnitForInitiativeActivation(activation.unitId))
      .filter((unit): unit is ScenarioUnit => Boolean(unit))
      .filter((unit) => !this.hasUnitCommittedOrders(unit));
  }

  private resolveSelectablePlayerInitiativeActivations(activeGroup: {
    initiative: number;
    ownerId: "player" | "bot";
    activations: Array<{ unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder?: number }>;
  }): Array<{ unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder?: number }> {
    if (activeGroup.ownerId !== "player") {
      return [];
    }

    const actionable = activeGroup.activations.filter((activation) => {
      if (this.initiativeSkippedUnitIds.has(activation.unitId)) {
        return false;
      }
      const unit = this.resolvePlayerUnitForInitiativeActivation(activation.unitId);
      if (!unit) {
        return false;
      }
      return !this.hasUnitCommittedOrders(unit);
    });

    return actionable;
  }

  private focusNextSelectablePlayerInitiativeUnit(
    activeGroup: {
      initiative: number;
      ownerId: "player" | "bot";
      activations: Array<{ unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder?: number }>;
    },
    anchorUnitId: string | null
  ): boolean {
    if (activeGroup.ownerId !== "player") {
      return false;
    }

    const orderedActivations = activeGroup.activations.filter(
      (activation) => !this.initiativeSkippedUnitIds.has(activation.unitId)
    );
    if (orderedActivations.length === 0) {
      return false;
    }

    const selectableActivations = this.resolveSelectablePlayerInitiativeActivations(activeGroup);
    if (selectableActivations.length === 0) {
      return false;
    }

    const selectableIds = new Set(selectableActivations.map((activation) => activation.unitId));
    const orderedCount = orderedActivations.length;
    let anchorIndex = anchorUnitId
      ? orderedActivations.findIndex((activation) => activation.unitId === anchorUnitId)
      : -1;
    if (anchorIndex < 0 && this.initiativeGroupCursorUnitId) {
      anchorIndex = orderedActivations.findIndex(
        (activation) => activation.unitId === this.initiativeGroupCursorUnitId
      );
    }

    let nextActivation: { unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder?: number } | null = null;
    for (let offset = 1; offset <= orderedCount; offset += 1) {
      const index = (anchorIndex + offset + orderedCount) % orderedCount;
      const candidate = orderedActivations[index];
      if (candidate && selectableIds.has(candidate.unitId)) {
        nextActivation = candidate;
        break;
      }
    }

    if (!nextActivation) {
      nextActivation = selectableActivations[0] ?? null;
    }
    if (!nextActivation) {
      return false;
    }

    this.initiativeGroupCursorUnitId = nextActivation.unitId;
    this.focusInitiativeUnit(nextActivation.unitId);
    return true;
  }

  private markRemainingPlayerInitiativeUnitsSkipped(
    activeGroup: {
      initiative: number;
      ownerId: "player" | "bot";
      activations: Array<{ unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder?: number }>;
    },
    currentUnitId: string | null
  ): void {
    if (activeGroup.ownerId !== "player") {
      return;
    }

    const engine = this.battleState.ensureGameEngine();
    activeGroup.activations.forEach((activation) => {
      if (activation.unitId === currentUnitId) {
        return;
      }
      this.initiativeSkippedUnitIds.add(activation.unitId);
      const unit = this.resolvePlayerUnitForInitiativeActivation(activation.unitId);
      if (unit && !unit.onSentry && !this.hasUnitCommittedOrders(unit)) {
        engine.enterSentry(unit.hex, unit.unitId ?? undefined);
      }
    });
  }

  private resolvePlayerUnitForInitiativeActivation(activationUnitId: string): ScenarioUnit | null {
    const engine = this.battleState.ensureGameEngine();
    const directMatch = engine.playerUnits.find((entry) => entry.unitId === activationUnitId) ?? null;
    if (directMatch) {
      return directMatch;
    }

    const legacyActivationMatch = /^(.+)-(\d+)$/.exec(activationUnitId);
    if (!legacyActivationMatch) {
      return null;
    }

    const [, activationType, activationIndexRaw] = legacyActivationMatch;
    const activationIndex = Number.parseInt(activationIndexRaw, 10);
    if (!Number.isFinite(activationIndex)) {
      return null;
    }

    const allUnitsForQueueOrder = [
      ...engine.playerUnits.map((unit) => ({ owner: "player" as const, unit })),
      ...engine.botUnits.map((unit) => ({ owner: "bot" as const, unit })),
      ...engine.allyUnits.map((unit) => ({ owner: "bot" as const, unit }))
    ].filter((entry) => {
      const definition = this.unitTypes?.[entry.unit.type as keyof UnitTypeDictionary];
      return Boolean(definition && typeof definition.initiative === "number" && definition.initiative > 0);
    });

    const target = allUnitsForQueueOrder[activationIndex];
    if (!target || target.owner !== "player" || target.unit.type !== activationType) {
      return null;
    }
    return target.unit;
  }

  private hasUnitCommittedOrders(unit: ScenarioUnit): boolean {
    if (unit.onSentry) {
      return true;
    }

    const engineAny = this.battleState.ensureGameEngine() as unknown as {
      playerActionFlags?: Map<string, {
        movementPointsUsed?: number;
        attacksUsed?: number;
        smokeUsed?: boolean;
        facingSet?: boolean;
        supportQueued?: boolean;
      }>;
    };
    const actionFlags = engineAny.playerActionFlags;
    if (!actionFlags) {
      return false;
    }

    const primaryKey = unit.unitId ?? "";
    const fallbackKey = `${unit.type}@${unit.hex.q},${unit.hex.r}`;
    const flags = (primaryKey ? actionFlags.get(primaryKey) : undefined) ?? actionFlags.get(fallbackKey);
    if (!flags) {
      return false;
    }

    return (
      (flags.movementPointsUsed ?? 0) > 0 ||
      (flags.attacksUsed ?? 0) > 0 ||
      flags.supportQueued === true
    );
  }

  private canPlayerUnitContinueAfterMove(destination: Axial, unitId: string | null): boolean {
    if (!this.isInitiativeSystemEnabled || !unitId) {
      return false;
    }

    const engine = this.battleState.ensureGameEngine();
    if (
      engine.getReachableHexes(destination, unitId).length > 0 ||
      engine.getAttackableTargets(destination, unitId).length > 0
    ) {
      return true;
    }

    const commandState = engine.getUnitCommandState(destination, unitId);
    return commandState?.canLaySmoke === true ||
      commandState?.canSetFacing === true ||
      commandState?.canDeployTow === true;
  }

  private completeInitiativeActivationAfterPlayerOrder(unitId: string | null | undefined): void {
    if (!this.isInitiativeSystemEnabled || !this.initiativeMethods) {
      return;
    }

    try {
      const queue = this.initiativeMethods.getCurrentInitiativeQueue();
      const activeGroup = this.resolveActiveInitiativeGroup(queue);
      if (!activeGroup || activeGroup.ownerId !== "player") {
        return;
      }

      const currentActivation = this.initiativeMethods.getCurrentActivation();
      const activationUnitId = unitId ?? currentActivation?.unitId ?? null;
      if (!activationUnitId) {
        return;
      }

      let completionUnitId = activationUnitId;
      const isInActiveGroup = activeGroup.activations.some((activation) => activation.unitId === completionUnitId);
      if (!isInActiveGroup) {
        const fallbackUnitId = currentActivation?.unitId ?? null;
        const fallbackIsInGroup = fallbackUnitId
          ? activeGroup.activations.some((activation) => activation.unitId === fallbackUnitId)
          : false;
        if (!fallbackIsInGroup || !fallbackUnitId) {
          console.error("[BattleScreen] Initiative completion requested for unit outside the active group.", {
            requestedUnitId: activationUnitId,
            fallbackUnitId,
            activeGroupInitiative: activeGroup.initiative,
            activeGroupOwner: activeGroup.ownerId
          });
          return;
        }
        completionUnitId = fallbackUnitId;
      }

      this.initiativeMethods.completeUnitActivation(completionUnitId);
      this.highlightCurrentInitiativeGroup();
      this.focusCurrentInitiativeActivation();
    } catch (error) {
      console.error("Failed to auto-complete player initiative activation:", error);
      this.recoverInitiativeQueueStall();
    } finally {
      this.syncInitiativeTurnControlsState();
    }
  }

  private selectNextInitiativeGroupUnit(): void {
    if (!this.initiativeMethods) {
      return;
    }

    const queue = this.initiativeMethods.getCurrentInitiativeQueue();
    const activeGroup = this.resolveActiveInitiativeGroup(queue);
    if (!activeGroup || activeGroup.ownerId !== "player") {
      return;
    }

    this.syncInitiativeGroupSession(activeGroup);
    this.focusNextSelectablePlayerInitiativeUnit(activeGroup, this.initiativeGroupCursorUnitId);
  }

  private focusInitiativeUnit(unitId: string): void {
    const engine = this.battleState.ensureGameEngine();
    const unit = engine.playerUnits.find((entry) => entry.unitId === unitId);
    const hexKey = this.toOffsetHexKey(unit?.hex);
    if (!hexKey) {
      return;
    }

    this.applySelectedHex(hexKey);
    this.selectedPlayerUnitId = unitId;
    this.applySelectedHex(hexKey, true);
    void this.focusCameraOnHex(hexKey).catch(() => {});
  }

  private commitCurrentPlayerInitiativeGroup(initiative: number, completeEntireGroup = false): void {
    if (!this.initiativeMethods) {
      return;
    }

    let guard = 0;
    let lastCompletedUnitId: string | null = null;
    while (guard < 128) {
      guard += 1;
      const activation = this.initiativeMethods.getCurrentActivation();
      if (!activation || activation.ownerId !== "player" || activation.initiative !== initiative) {
        break;
      }
      const autoSkipped = this.initiativeSkippedUnitIds.has(activation.unitId);
      lastCompletedUnitId = activation.unitId;
      this.initiativeMethods.completeUnitActivation(activation.unitId);
      if (!completeEntireGroup && !autoSkipped) {
        break;
      }
    }

    const queue = this.initiativeMethods.getCurrentInitiativeQueue();
    const stillInSamePlayerInitiativeBand = Boolean(
      queue?.activations?.some(
        (activation: { ownerId: "player" | "bot"; initiative: number; isActivated: boolean }) =>
          activation.ownerId === "player" &&
          activation.initiative === initiative &&
          !activation.isActivated
      )
    );

    if (!stillInSamePlayerInitiativeBand) {
      this.initiativeGroupCursorUnitId = null;
      this.initiativeGroupSessionId = null;
      if (!this.initiativeEndTurnSkipModeActive) {
        this.initiativeSkippedUnitIds.clear();
      }
      return;
    }

    if (lastCompletedUnitId && this.initiativeGroupCursorUnitId === lastCompletedUnitId) {
      this.initiativeGroupCursorUnitId = null;
    }
  }

  private focusCurrentInitiativeActivation(): void {
    if (this.shouldDeferTutorialInitiativeAutoFocus()) {
      return;
    }

    if (!this.initiativeMethods) {
      return;
    }

    const queue = this.initiativeMethods.getCurrentInitiativeQueue();
    const activeGroup = this.resolveActiveInitiativeGroup(queue);
    if (!activeGroup || activeGroup.ownerId !== "player") {
      return;
    }

    this.syncInitiativeGroupSession(activeGroup);
    const currentActivation = this.initiativeMethods.getCurrentActivation();
    if (currentActivation?.ownerId === "player") {
      this.initiativeGroupCursorUnitId = currentActivation.unitId;
      this.focusInitiativeUnit(currentActivation.unitId);
      return;
    }

    const candidates = this.resolveSelectablePlayerInitiativeActivations(activeGroup);
    if (candidates.length === 0) {
      return;
    }

    const selectedFromCursor = this.initiativeGroupCursorUnitId
      ? candidates.find((activation) => activation.unitId === this.initiativeGroupCursorUnitId) ?? null
      : null;
    if (!selectedFromCursor && this.focusNextSelectablePlayerInitiativeUnit(activeGroup, this.initiativeGroupCursorUnitId)) {
      return;
    }
    const activation = selectedFromCursor ?? candidates[0];
    this.initiativeGroupCursorUnitId = activation.unitId;
    this.focusInitiativeUnit(activation.unitId);
  }

  private ensureFocusedPlayerInitiativeUnit(
    activeGroup: {
      initiative: number;
      ownerId: "player" | "bot";
      activations: Array<{ unitId: string; ownerId: "player" | "bot"; initiative: number; isActivated: boolean; sortOrder?: number }>;
    } | null
  ): void {
    if (!activeGroup || activeGroup.ownerId !== "player") {
      return;
    }

    const candidates = this.resolveSelectablePlayerInitiativeActivations(activeGroup);
    if (candidates.length === 0) {
      return;
    }

    if (this.shouldDeferTutorialInitiativeAutoFocus()) {
      return;
    }

    const tutorialProgress = ensureTutorialState().getProgress();
    if (
      tutorialProgress.isActive &&
      tutorialProgress.currentPhase === "active_group_units" &&
      !tutorialProgress.canProceed &&
      !this.selectedPlayerUnitId
    ) {
      return;
    }

    const candidateIds = new Set(candidates.map((activation) => activation.unitId));
    const selectedUnitId = this.selectedPlayerUnitId;
    const currentActivation = this.initiativeMethods?.getCurrentActivation();
    if (currentActivation?.ownerId === "player" && candidateIds.has(currentActivation.unitId)) {
      if (
        selectedUnitId &&
        selectedUnitId !== currentActivation.unitId &&
        candidateIds.has(selectedUnitId)
      ) {
        // Respect explicit commander selection within the active initiative group
        // instead of snapping focus back to the queue head every sync tick.
        this.initiativeGroupCursorUnitId = selectedUnitId;
        return;
      }
      const cursorUnitId = this.initiativeGroupCursorUnitId;
      if (cursorUnitId && cursorUnitId !== currentActivation.unitId && candidateIds.has(cursorUnitId)) {
        if (this.selectedPlayerUnitId !== cursorUnitId) {
          this.focusInitiativeUnit(cursorUnitId);
        }
        return;
      }
      if (selectedUnitId !== currentActivation.unitId) {
        this.initiativeGroupCursorUnitId = currentActivation.unitId;
        this.focusInitiativeUnit(currentActivation.unitId);
        return;
      }
      this.initiativeGroupCursorUnitId = currentActivation.unitId;
      return;
    }

    if (!selectedUnitId || !candidateIds.has(selectedUnitId)) {
      // Keep the existing initiative cursor stable when selection is briefly cleared
      // after an action so "Next Unit" advances from the player's last position.
      if (this.initiativeGroupCursorUnitId && candidateIds.has(this.initiativeGroupCursorUnitId)) {
        return;
      }
      if (this.initiativeGroupCursorUnitId && this.focusNextSelectablePlayerInitiativeUnit(activeGroup, this.initiativeGroupCursorUnitId)) {
        return;
      }
      this.initiativeGroupCursorUnitId = null;
      this.focusCurrentInitiativeActivation();
      return;
    }

    if (!this.initiativeGroupCursorUnitId || !candidateIds.has(this.initiativeGroupCursorUnitId)) {
      this.initiativeGroupCursorUnitId = selectedUnitId;
    }
  }

  private async handleInitiativeBotActivation(event: InitiativeBotActivationResult): Promise<void> {
    if (!this.isInitiativeSystemEnabled) {
      return;
    }

    const renderer = this.hexMapRenderer;
    const fromKey = this.toOffsetHexKey(event.fromHex);
    const toKey = this.toOffsetHexKey(event.toHex);
    const isEnemyActivation = event.ownerId === "bot";
    const visibleBefore = isEnemyActivation
      ? (event.visibleBefore || (event.fromHex ? this.isBotUnitVisibleToPlayer(event.unitId, event.fromHex) : false))
      : true;
    const visibleAfter = isEnemyActivation
      ? (event.visibleAfter || (event.toHex ? this.isBotUnitVisibleToPlayer(event.unitId, event.toHex) : false))
      : true;
    const focusBeforeMoveKey = visibleBefore ? fromKey : null;
    const focusAfterMoveKey = !visibleBefore && visibleAfter ? toKey : null;
    const fallbackFocusKey = visibleBefore ? fromKey : visibleAfter ? toKey : null;
    const canFocusCamera = Boolean(this.mapViewport);
    const shouldFocusCamera = canFocusCamera && this.battleAnimationMode !== "quick";
    let lastFocusedKey: string | null = null;
    const paceForAnimationStep = async (durationMs: number): Promise<void> => {
      await this.waitForNextFrame();
      if (this.battleAnimationMode !== "quick") {
        await this.waitMs(durationMs);
      }
    };
    const focusCameraForActivation = async (focusKey: string | null, settleMs: number): Promise<void> => {
      if (!shouldFocusCamera || !focusKey) {
        return;
      }
      if (lastFocusedKey !== focusKey) {
        await this.focusCameraOnHex(focusKey);
        lastFocusedKey = focusKey;
      }
      await paceForAnimationStep(settleMs);
    };

    const fromHex = event.fromHex;
    const toHex = event.toHex;
    if (renderer && event.moved && fromKey && toKey && fromHex && toHex) {
      const movePath = this.toMovePathKeys([fromHex, toHex], fromKey, toKey);
      const moveHandle: MoveAnimationHandle | null = renderer.primeUnitMove(fromKey, toKey, {
        path: movePath,
        unitId: event.unitId
      });

      if (moveHandle) {
        try {
          await focusCameraForActivation(focusBeforeMoveKey, 180);
          await moveHandle.play(this.resolveMoveAnimationDuration(movePath, BattleScreen.BOT_MOVE_ANIMATION_MS));
        } catch (animationError) {
          console.warn("[BattleScreen] Initiative bot move animation failed; continuing.", {
            event,
            animationError
          });
        } finally {
          moveHandle.dispose();
        }
      }
    }

    this.renderEngineUnits();
    await focusCameraForActivation(focusAfterMoveKey, 160);

    if (renderer && event.attacks.length > 0) {
      for (const attack of event.attacks) {
        const attackerKey = this.toOffsetHexKey(attack.fromHex);
        const targetKey = this.toOffsetHexKey(attack.targetHex);
        if (!attackerKey || !targetKey) {
          continue;
        }

        try {
          await focusCameraForActivation(attackerKey, 180);
          await focusCameraForActivation(targetKey, 240);
          const defenderDefinition = this.unitTypes?.[attack.defenderType as keyof UnitTypeDictionary];
          const defenderClass = defenderDefinition?.class;
          const targetIsHardTarget = defenderClass === "vehicle" || defenderClass === "tank" || defenderClass === "air";
          await renderer.playAttackSequence(attackerKey, targetKey, targetIsHardTarget);
          await paceForAnimationStep(180);
        } catch (animationError) {
          console.warn("[BattleScreen] Initiative bot attack animation failed; continuing.", {
            attack,
            animationError
          });
        }

        if (attack.retaliation && attack.retaliation.damage > 0) {
          try {
            const attackerDefinition = this.unitTypes?.[attack.attackerType as keyof UnitTypeDictionary];
            const attackerClass = attackerDefinition?.class;
            const retaliationTargetIsHardTarget = attackerClass === "vehicle" || attackerClass === "tank" || attackerClass === "air";
            await focusCameraForActivation(attackerKey, 220);
            await renderer.playAttackSequence(targetKey, attackerKey, retaliationTargetIsHardTarget);
            await paceForAnimationStep(220);
          } catch (animationError) {
            console.warn("[BattleScreen] Initiative bot retaliation animation failed; continuing.", animationError);
          }
        }
      }
      this.renderEngineUnits();
    } else if (fallbackFocusKey && canFocusCamera && this.battleAnimationMode !== "quick") {
      try {
        await this.focusCameraOnHex(fallbackFocusKey);
        await paceForAnimationStep(160);
      } catch {
        // Ignore camera focus failures during automated initiative bot movement.
      }
    }

    this.logInitiativeBotActivationActivity(event, fromKey, toKey);
  }

  private logInitiativeBotActivationActivity(
    event: InitiativeBotActivationResult,
    fromKey: string | null,
    toKey: string | null
  ): void {
    const unitLabel = this.toTitleCase(event.unitType ?? "Unit");
    const eventVisibleBefore = Boolean(event.visibleBefore);
    const eventVisibleAfter = Boolean(event.visibleAfter);

    if (event.ownerId === "player") {
      if (event.moved) {
        const moveSummary = fromKey && toKey
          ? `Friendly ${unitLabel} repositioned from ${fromKey} to ${toKey}.`
          : `Friendly ${unitLabel} repositioned.`;
        this.publishActivityEvent({
          category: "player",
          type: "move",
          summary: moveSummary
        });
      }
      return;
    }

    const contact = this.resolveEnemyContactSnapshot(event.unitId);
    const contactHexKey = this.toOffsetHexKey(contact?.hex ?? null);
    if (event.moved) {
      const moveSummary = eventVisibleBefore || eventVisibleAfter
        ? `Enemy ${unitLabel} repositioned from ${fromKey ?? "unknown"} to ${toKey ?? "unknown"}.`
        : contact?.state === "identified" && contactHexKey
          ? `Identified enemy ${unitLabel} maneuvered near ${contactHexKey}.`
          : contactHexKey
            ? `Enemy movement detected near ${contactHexKey}.`
            : "Enemy movement detected outside direct observation.";
      this.publishActivityEvent({
        category: "enemy",
        type: "move",
        summary: moveSummary
      });
    }

    event.attacks.forEach((attack) => {
      const attackerVisible = eventVisibleBefore || eventVisibleAfter || this.isBotUnitVisibleToPlayer(event.unitId, attack.fromHex);
      const attackerHex = this.toOffsetHexKey(attack.fromHex) ?? "unknown";
      const targetHex = this.toOffsetHexKey(attack.targetHex) ?? "unknown";
      const damage = this.formatDamageAmount(attack.inflictedDamage);
      const destructionNote = attack.defenderDestroyed ? " Target destroyed." : "";
      const effects = attack.damageSummary ? ` Effects: ${attack.damageSummary}.` : "";
      const retaliationDamage = attack.retaliation ? this.formatDamageAmount(attack.retaliation.damage) : null;
      const retaliationSummary = retaliationDamage ? ` Counterfire dealt ${retaliationDamage} damage.` : "";
      const attackerLabel = this.toTitleCase(attack.attackerType);
      const defenderLabel = this.toTitleCase(attack.defenderType);
      const summary = attackerVisible
        ? `Enemy ${attackerLabel} attacked ${defenderLabel} from ${attackerHex} to ${targetHex} for ${damage} damage.${effects}${destructionNote}${retaliationSummary}`
        : `Enemy fire was detected against ${defenderLabel}. Damage: ${damage}.${effects}${destructionNote}${retaliationSummary}`;

      this.publishActivityEvent({
        category: "enemy",
        type: "attack",
        summary
      });
    });

    if (!event.moved && event.attacks.length === 0) {
      const holdSummary = eventVisibleBefore || eventVisibleAfter
        ? `Enemy ${unitLabel} held position and reported no fire this activation.`
        : "Enemy activation resolved with no observed movement or fire.";
      this.publishActivityEvent({
        category: "enemy",
        type: "log",
        summary: holdSummary
      });
    }
  }

  private resolveEnemyContactSnapshot(unitId: string): EnemyContactSnapshot | null {
    const engine = this.battleState.ensureGameEngine();
    const contacts = engine.getEnemyContactSnapshot();
    return contacts.find((contact) => contact.unitId === unitId) ?? null;
  }

  private isBotUnitVisibleToPlayer(unitId: string, expectedHex: Axial | null): boolean {
    const engine = this.battleState.ensureGameEngine();
    const contacts = engine.getEnemyContactSnapshot();
    return contacts.some((contact) => {
      if (contact.unitId !== unitId || contact.state !== "visible") {
        return false;
      }
      if (!expectedHex) {
        return true;
      }
      return contact.hex.q === expectedHex.q && contact.hex.r === expectedHex.r;
    });
  }

  /**
   * Show an elegant initiative message
   */
  private showElegantInitiativeMessage(message: string): void {
    // Create a temporary message element
    const messageElement = document.createElement('div');
    messageElement.className = 'initiative-message';
    messageElement.textContent = message;
    messageElement.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(15, 20, 32, 0.95);
      color: #fff;
      padding: 1rem 1.5rem;
      border-radius: 12px;
      border: 2px solid var(--accent-strong);
      font-size: 0.9rem;
      font-weight: 600;
      z-index: 10000;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      animation: fadeInOut 3s ease-in-out;
      pointer-events: none;
    `;

    // Add fade animation
    const style = document.createElement('style');
    style.textContent = `
      @keyframes fadeInOut {
        0% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
        20% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        80% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        100% { opacity: 0; transform: translate(-50%, -50%) scale(0.9); }
      }
    `;
    document.head.appendChild(style);

    // Show message
    document.body.appendChild(messageElement);

    // Remove after animation
    setTimeout(() => {
      messageElement.remove();
      style.remove();
    }, 3000);
  }

  /**
   * Get the current activation from the initiative system
   */
  private getCurrentActivation(): { unitId: string; ownerId: string } | null {
    if (!this.initiativeMethods) {
      return null;
    }

    try {
      const activation = this.initiativeMethods.getCurrentActivation();
      if (activation) {
        return {
          unitId: activation.unitId,
          ownerId: activation.ownerId
        };
      }
    } catch (error) {
      console.error('Failed to get current activation:', error);
    }

    return null;
  }

  /**
   * Synchronize initiative turn controls with current queue/activation state.
   */
  private syncInitiativeTurnControlsState(): void {
    this.syncLegacyEndTurnButton();

    if (this.initiativeMethods && this.isInitiativeSystemEnabled) {
      this.flushSkippedInitiativeActivations();
    }

    if (!this.initiativeTurnControls) {
      return;
    }

    if (!this.initiativeMethods || !this.isInitiativeSystemEnabled) {
      this.initiativeTurnControls.updateCurrentUnit(null);
      this.initiativeTurnControls.updateCurrentGroup(null);
      this.initiativeTurnControls.updatePlayerTurn(false);
      this.initiativeTurnControls.updateRoundAdvanceReady(false);
      this.initiativeTurnControls.updatePhase('turnEnded');
      this.initiativeTurnControls.setControlsEnabled(false);
      this.syncLegacyEndTurnButton();
      return;
    }

    try {
      let queue = this.initiativeMethods.getCurrentInitiativeQueue();
      this.recoverInitiativeQueueStall(queue);
      queue = this.initiativeMethods.getCurrentInitiativeQueue();
      const activation = this.initiativeMethods.getCurrentActivation();
      const activeGroup = this.resolveActiveInitiativeGroup(queue);
      this.ensureFocusedPlayerInitiativeUnit(activeGroup);
      const displayActivation = activation;
      const hasRemainingActivations = this.hasPendingInitiativeActivations(queue);
      const initiativeActive = this.initiativeMethods.isInitiativeSystemActive();
      const canAdvanceRound = initiativeActive && !hasRemainingActivations && !activation;
      if (this.initiativeEndTurnSkipModeActive && canAdvanceRound && !this.initiativeTurnAdvanceInProgress) {
        void this.advanceInitiativeRound();
      }
      const controlsPhase: 'initiativeTurn' | 'airShowPhase' | 'turnEnded' =
        initiativeActive && (hasRemainingActivations || Boolean(activation))
          ? 'initiativeTurn'
          : initiativeActive
            ? 'airShowPhase'
          : 'turnEnded';
      const displayGroup = activeGroup
        ? {
            initiative: activeGroup.initiative,
            units: activeGroup.activations.map((activation, index) => ({
              ...activation,
              sortOrder: activation.sortOrder ?? index
            })),
            isCompleted: false,
            currentUnitIndex: 0
          }
        : null;

      this.initiativeTurnControls.updateCurrentUnit(displayActivation);
      this.initiativeTurnControls.updateCurrentGroup(displayGroup);
      this.initiativeTurnControls.updatePlayerTurn((activeGroup?.ownerId ?? activation?.ownerId) === 'player');
      this.initiativeTurnControls.updateRoundAdvanceReady(canAdvanceRound);
      this.initiativeTurnControls.updatePhase(controlsPhase);
      this.initiativeTurnControls.setControlsEnabled(controlsPhase !== 'turnEnded');
      this.syncLegacyEndTurnButton();
    } catch (error) {
      console.error('Failed to sync initiative turn controls state:', error);
    }
  }

  private flushSkippedInitiativeActivations(): void {
    if (!this.initiativeMethods || !this.isInitiativeSystemEnabled) {
      return;
    }

    let guard = 0;
    while (guard < 64) {
      guard += 1;
      const activation = this.initiativeMethods.getCurrentActivation();
      if (!activation || activation.ownerId !== "player") {
        break;
      }
      const shouldAutoSkip = this.initiativeSkippedUnitIds.has(activation.unitId) || this.initiativeEndTurnSkipModeActive;
      if (!shouldAutoSkip) {
        break;
      }
      this.initiativeSkippedUnitIds.add(activation.unitId);
      this.initiativeMethods.completeUnitActivation(activation.unitId);
    }
  }

  private clearInitiativeSkipState(): void {
    this.initiativeEndTurnSkipModeActive = false;
    this.initiativeSkippedUnitIds.clear();
  }

  /**
   * Reveals the activity log column once the battle phase begins so commanders can monitor events.
   */
  private showActivityLogAfterDeployment(): void {
    this.battleActivityLog?.show();
    this.reflectActivityLogState(false);
  }

  /**
   * Synchronizes the activity log's collapsed state with the grid container for smooth column transitions.
   */
  private reflectActivityLogState(collapsed: boolean): void {
    if (!this.battleMainContainer) {
      return;
    }
    if (collapsed) {
      this.battleMainContainer.setAttribute("data-activity-collapsed", "true");
    } else {
      this.battleMainContainer.removeAttribute("data-activity-collapsed");
    }

    // Layout width changes when the activity log toggles; recenter on the next frame so measurements reflect the new width.
    if (this.lastFocusedHexKey) {
      window.requestAnimationFrame(() => this.recenterLastFocus());
    }
  }

  /**
   * Disables deployment-specific UI hooks once the battle phase starts so players cannot queue new placements.
   * Also caches the reserve list returned by the engine so post-deployment status remains accurate.
   */
  private lockDeploymentInteractions(): void {
    this.deploymentPanel?.lockInteractions();
    if (this.baseCampAssignButton) {
      this.baseCampAssignButton.disabled = true;
      this.baseCampAssignButton.setAttribute("aria-disabled", "true");
    }
  }

  /**
   * Renders the battle map SVG and wires input handlers once DOM and engine dependencies are ready.
   */
  private initializeBattleMap(): void {
    this.activeMissionSessionKey = this.getMissionSessionKey();
    if (!this.hexMapRenderer) {
      return;
    }
    this.refreshScenario();
    this.ensureEngine();
    const scenarioClone = this.cloneScenario();
    const svg = this.element.querySelector<SVGSVGElement>("#battleHexMap");
    const canvas = this.element.querySelector<HTMLDivElement>("#battleMapCanvas");
    if (!svg || !canvas) {
      return;
    }

    // Use the strategic theater map as a backdrop for flavor, whether in campaign mode or standalone mission.
    // This eliminates empty black space beyond the tactical hex grid and reinforces the operational context.
    const campaign = ensureCampaignState();
    const campaignScenario = campaign.getScenario();
    if (campaignScenario?.background?.imageUrl) {
      this.hexMapRenderer.setBackdropImage(campaignScenario.background.imageUrl);
    }

    this.hexMapRenderer.render(svg, canvas, scenarioClone);
    this.hexMapRenderer.setSoundEnabled(this.soundEnabled);
    this.hexMapRenderer.onHexClick((key) => this.handleHexSelection(key));
    this.hexMapRenderer.onSelectionChanged((key) => this.handleRendererSelection(key));
    // Mirror zone metadata once the map is ready so deployment overlays and base camp validation share the same registry.
    this.registerScenarioZones();
    this.mapViewport?.reset();
    this.renderEngineUnits();
    // Reapply the base camp marker after unit rendering so the sprite is visible during initial load sequences.
    const deploymentState = ensureDeploymentState();
    const baseCampKey = deploymentState.getBaseCampKey();
    if (baseCampKey) {
      this.hexMapRenderer.renderBaseCampMarker(baseCampKey);
    }
    this.updateAirHudWidget();
  }

  private setBattleSettingsMenuOpen(open: boolean): void {
    if (!this.settingsToggleButton || !this.settingsMenu) {
      return;
    }
    this.settingsToggleButton.setAttribute("aria-expanded", open ? "true" : "false");
    this.settingsToggleButton.setAttribute("aria-label", open ? "Close battle settings" : "Open battle settings");
    this.settingsMenu.classList.toggle("hidden", !open);
  }

  private handleToggleSound(): void {
    const nextEnabled = !this.soundEnabled;
    this.persistSoundEnabledPreference(nextEnabled);
    this.applySoundPreference(nextEnabled);
  }

  private applySoundPreference(enabled: boolean): void {
    this.soundEnabled = enabled;
    this.hexMapRenderer?.setSoundEnabled(enabled);
    this.updateSoundToggleButton(enabled);
  }

  private updateSoundToggleButton(enabled: boolean): void {
    if (!this.soundToggleButton) {
      return;
    }

    const valueElement = this.soundToggleButton.querySelector<HTMLElement>("[data-settings-value]");
    if (valueElement) {
      valueElement.textContent = enabled ? "On" : "Off";
    } else {
      this.soundToggleButton.textContent = `Battle Sound: ${enabled ? "On" : "Off"}`;
    }
    this.soundToggleButton.setAttribute("aria-pressed", enabled ? "true" : "false");
    this.soundToggleButton.setAttribute("aria-checked", enabled ? "true" : "false");
    this.soundToggleButton.setAttribute(
      "aria-label",
      `Battle Sound: ${enabled ? "On" : "Off"}. ${enabled ? "Turn off" : "Turn on"} movement, weapon, and battlefield effects.`
    );
    this.soundToggleButton.title = "Battle Sound plays movement, weapon, and battlefield effects.";
    this.soundToggleButton.dataset.soundEnabled = enabled ? "true" : "false";
    this.soundToggleButton.disabled = !this.hexMapRenderer;
  }

  private handleToggleBattleAnimationMode(): void {
    const nextMode: BattleAnimationMode = this.battleAnimationMode === "regular" ? "quick" : "regular";
    if (this.uiState) {
      this.uiState.battleAnimationMode = nextMode;
    }
    this.applyBattleAnimationMode(nextMode);
    this.announceBattleUpdate(
      nextMode === "quick"
        ? "Movement animations set to quick."
        : "Movement animations set to regular pathing."
    );
  }

  private applyBattleAnimationMode(mode: BattleAnimationMode): void {
    this.battleAnimationMode = mode;
    this.updateBattleAnimationToggleButton(mode);
  }

  private updateBattleAnimationToggleButton(mode: BattleAnimationMode): void {
    if (!this.animationToggleButton) {
      return;
    }

    const quick = mode === "quick";
    const valueElement = this.animationToggleButton.querySelector<HTMLElement>("[data-settings-value]");
    if (valueElement) {
      valueElement.textContent = quick ? "Quick Moves" : "Full Paths";
    } else {
      this.animationToggleButton.textContent = `Movement Animation: ${quick ? "Quick Moves" : "Full Paths"}`;
    }
    this.animationToggleButton.setAttribute("aria-pressed", quick ? "true" : "false");
    this.animationToggleButton.setAttribute("aria-checked", quick ? "true" : "false");
    this.animationToggleButton.setAttribute(
      "aria-label",
      quick
        ? "Movement Animation: Quick Moves. Show full movement routes."
        : "Movement Animation: Full Paths. Shorten movement playback."
    );
    this.animationToggleButton.title = quick
      ? "Quick Moves shortens travel playback. Select to follow full movement routes."
      : "Full Paths follows each unit along its route. Select to shorten travel playback.";
    this.animationToggleButton.dataset.animationMode = mode;
    this.animationToggleButton.disabled = !this.hexMapRenderer;
  }

  private loadSoundEnabledPreference(): boolean {
    if (typeof window === "undefined" || !window.localStorage) {
      return true;
    }

    const stored = window.localStorage.getItem(BattleScreen.SOUND_ENABLED_STORAGE_KEY);
    return stored !== "false";
  }

  private persistSoundEnabledPreference(enabled: boolean): void {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }

    window.localStorage.setItem(BattleScreen.SOUND_ENABLED_STORAGE_KEY, enabled ? "true" : "false");
  }

  /**
   * Synchronizes deployment zone definitions from the active scenario into `DeploymentState`.
   * This ensures base camp validation, capacity banners, and zone highlights all reference the same data set.
   */
  private registerScenarioZones(): void {
    const deploymentState = ensureDeploymentState();
    const missionKey = this.uiState?.selectedMission;
    if (!this.scenario.deploymentZones || this.scenario.deploymentZones.length === 0) {
      return;
    }
    const definitions = this.scenario.deploymentZones.map((zone) => finalizeDeploymentZone(zone, this.scenario, missionKey ?? undefined));
    deploymentState.registerZones(definitions);
    this.deploymentPanel?.update();
  }

  private ensureEngine(): void {
    if (this.battleState.hasEngine()) {
      return;
    }
    const playerSide = this.cloneScenarioSide(this.scenario.sides.Player);
    const assignedCommander = this.battleState.getAssignedCommanderProfile();

    if (assignedCommander) {
      playerSide.general = {
        accBonus: assignedCommander.stats.accBonus,
        dmgBonus: assignedCommander.stats.dmgBonus,
        moveBonus: assignedCommander.stats.moveBonus,
        supplyBonus: assignedCommander.stats.supplyBonus
      };
    }

    const config: GameEngineConfig = {
      scenario: this.cloneScenario(),
      unitTypes: this.cloneUnitTypes(),
      terrain: this.cloneTerrain(),
      playerSide,
      initialPlayerDepotStock: this.resolveInitialPlayerDepotStock(),
      botSide: this.cloneScenarioSide(this.scenario.sides.Bot),
      allySide: this.scenario.sides.Ally ? this.cloneScenarioSide(this.scenario.sides.Ally) : undefined,
      // Enable the heuristic planner so campaign battles use the upgraded enemy AI rather than the legacy simple bot.
      botStrategyMode: "Heuristic",
      // Use difficulty from UIState if available, default to Normal
      botDifficulty: this.uiState?.selectedDifficulty ?? "Normal"
    };
    this.battleState.initializeEngine(config);
    this.assertBotUnitsHydrated();
  }

  private resolveInitialPlayerDepotStock(): { ammo: number; fuel: number; rations: number; parts: number } {
    const summary = this.battleState.getPrecombatAllocationSummary();
    if (!summary) {
      return { ammo: 0, fuel: 0, rations: 0, parts: 0 };
    }

    return {
      ammo: summary.depotPackage.ammo,
      fuel: summary.depotPackage.fuel,
      rations: summary.depotPackage.rations,
      parts: summary.depotPackage.parts
    };
  }

  private getMissionSessionKey(): string {
    return `${this.uiState?.selectedMission ?? "training"}:${this.uiState?.selectedDifficulty ?? "Normal"}:${this.scenario.name}`;
  }

  private handleScreenShown(event: Event): void {
    const detail = (event as CustomEvent<{ id?: string }>).detail;
    if (detail?.id !== "battle") {
      return;
    }

    this.refreshScenario();
    const nextMissionSessionKey = this.getMissionSessionKey();
    const scenarioChanged = this.activeMissionSessionKey !== nextMissionSessionKey;

    if (scenarioChanged) {
      this.resetMissionDerivedUiState();
      this.battleState.resetEngineState();
      this.deploymentPrimed = false;
      this.refreshScenario();
      this.hydrateMissionBriefing(false);
      this.initializeBattleMap();
      this.prepareBattleState(false);
      this.initializeDeploymentMirrors();
      this.syncTurnContext();
      this.renderMissionStatus();
      this.selectionIntelOverlay?.update(this.selectionIntel);
      this.battleActivityLog?.sync(this.activityEvents);
      console.info("[BattleScreen] screen activation refreshed scenario", {
        scenarioName: this.scenario.name,
        missionSessionKey: nextMissionSessionKey,
        missionKey: this.uiState?.selectedMission ?? "training"
      });
    }
  }

  /**
   * Asserts that bot units from the scenario are hydrated into the engine. Fails fast to avoid silent enemy removal.
   */
  private assertBotUnitsHydrated(): void {
    const engine = this.battleState.ensureGameEngine();
    const scenarioBotCount = this.scenario.sides.Bot.units.length;
    const engineBotCount = engine.botUnits.length;

    if (scenarioBotCount > 0 && engineBotCount === 0) {
      const summary = engine.getTurnSummary();
      throw new Error(
        `[BattleScreen] Bot units missing after initialization. scenarioBotCount=${scenarioBotCount}, engineBotCount=${engineBotCount}, phase=${summary.phase}, activeFaction=${summary.activeFaction}`
      );
    }
  }

  private handleHexSelection(key: string): void {
    const engine = this.battleState.ensureGameEngine();
    const summary = engine.getTurnSummary();

    const summaryPhase = summary.phase as string;
    const initiativeActivation = this.isInitiativeSystemEnabled
      ? this.initiativeMethods?.getCurrentActivation() ?? null
      : null;
    const isPlayerControlPhase = this.isInitiativeSystemEnabled
      ? initiativeActivation?.ownerId === "player"
      : summaryPhase === "playerTurn";

    if (isPlayerControlPhase) {
      const transferResult = this.tryTransferAllyControl(key);
      if (transferResult) {
        return;
      }
      
      // Check initiative group validation if system is enabled
      if (this.isInitiativeSystemEnabled) {
        const isActionDestination =
          (this.selectedHexKey !== null && (this.playerMoveHexes.has(key) || this.playerAttackHexes.has(key))) ||
          (this.smokeTargetingState !== null && (this.smokeTargetingState.targetHexKeys.has(key) || key === this.smokeTargetingState.callerHexKey)) ||
          (this.artilleryTargetingState !== null && (this.artilleryTargetingState.targetHexKeys.has(key) || key === this.artilleryTargetingState.callerHexKey));
        const unitForInitiativeGate = this.resolveInitiativeGateUnitForHex(key);

        if (
          unitForInitiativeGate &&
          unitForInitiativeGate.unitId &&
          !isActionDestination &&
          !this.isUnitInCurrentInitiativeGroup(unitForInitiativeGate.unitId)
        ) {
          this.showInitiativeGroupMessage(unitForInitiativeGate.unitId);
          return; // Don't proceed with the action
        }
      }
      
      this.tutorialUserMapClickInProgress = true;
      try {
        this.onPlayerTurnMapClick(key);
        this.completeGuidedTutorialSelectionForClickedHex(key);
      } finally {
        this.tutorialUserMapClickInProgress = false;
      }
      return;
    }
    this.applySelectedHex(key);
  }

  /**
   * Resolves the player unit used for initiative-gate checks on a clicked hex.
   * In stacked hexes we must prioritize the currently active activation to avoid
   * blocking legal actions behind an inactive stack member.
   */
  private resolveInitiativeGateUnitForHex(key: string): ScenarioUnit | null {
    const members = this.getPlayerStackMembersAtHex(key);
    if (members.length === 0) {
      return null;
    }

    const currentActivation = this.initiativeMethods?.getCurrentActivation();
    if (currentActivation?.ownerId === "player") {
      const activeMember = members.find((member) => member.unitId === currentActivation.unitId) ?? null;
      if (activeMember) {
        return activeMember.unit;
      }
    }

    if (this.selectedPlayerUnitId) {
      const selectedMember = members.find((member) => member.unitId === this.selectedPlayerUnitId) ?? null;
      if (selectedMember) {
        return selectedMember.unit;
      }
    }

    const playerMember = members.find((member) => !member.isAutomated) ?? members[0];
    return playerMember?.unit ?? null;
  }

  /**
   * Handles clicks on sentry pips to toggle sentry mode off.
   * Allows commanders to undo sentry before ending their turn.
   */
  private handleSentryPipClick(event: Event): void {
    const customEvent = event as CustomEvent<{ offsetKey: string }>;
    const hexKey = customEvent.detail?.offsetKey;

    if (!hexKey) {
      console.warn("[BattleScreen] handleSentryPipClick: no hex key in event detail");
      return;
    }

    const engine = this.battleState.ensureGameEngine();
    const summary = engine.getTurnSummary();

    if (summary.phase !== "playerTurn") {
      console.log("[BattleScreen] Sentry pip clicked during non-player turn, ignoring");
      return;
    }

    const parsed = CoordinateSystem.parseHexKey(hexKey);
    if (!parsed) {
      console.warn("[BattleScreen] handleSentryPipClick: invalid hex key format:", hexKey);
      return;
    }

    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const axialKey = `${axial.q},${axial.r}`;
    const unit = engine.playerUnits.find((u) => `${u.hex.q},${u.hex.r}` === axialKey);

    if (!unit) {
      console.warn("[BattleScreen] handleSentryPipClick: no unit at hex:", hexKey);
      return;
    }

    if (!unit.onSentry) {
      console.warn("[BattleScreen] handleSentryPipClick: unit is not on sentry:", hexKey);
      return;
    }

    const succeeded = engine.exitSentry(axial);

    if (succeeded) {
      const unitLabel = this.resolveUnitLabel(unit.type);
      this.announceBattleUpdate(`${unitLabel} exited sentry mode at ${hexKey}.`);
      this.renderEngineUnits();
    } else {
      this.announceBattleUpdate("Unable to exit sentry mode.");
    }
  }

  /**
   * Handles reserve call-up requests emitted by the deployment panel so cooldown rules, selection validation,
   * and engine integration remain centralized. Expects the caller to provide a stable allocation key.
   */
  private handleBattleRequisitionRequest(unitKey: string, useTransportAirlift: boolean): void {
    const engine = this.battleState.ensureGameEngine();
    const result = engine.requestBattleRequisition(unitKey, { useTransportAirlift });
    if (!result.ok) {
      this.announceBattleUpdate(result.reason);
      return;
    }

    const arrivalMode = result.requisition.airlifted ? "airlift" : "main supply route";
    const summary = `${result.requisition.label} requested for ${result.requisition.cost} RP. Arrival turn ${result.requisition.arrivalTurn} by ${arrivalMode}.`;
    this.announceBattleUpdate(summary);
    this.publishActivityEvent({
      category: "player",
      type: result.requisition.kind === "supplies" ? "supply" : "deployment",
      summary
    });
    this.battleState.emitBattleUpdate("manual");
  }

  private handleReserveCallupRequest(unitKey: string): void {
    const engine = this.battleState.ensureGameEngine();
    const turnSummary = engine.getTurnSummary();

    // During deployment phase, place units from roster using normal deployment flow
    if (turnSummary.phase === "deployment") {
      if (!this.selectedHexKey) {
        this.announceBattleUpdate("Select a deployment hex first, then deploy from the roster.");
        return;
      }
      const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
      if (!parsed) {
        return;
      }
      const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
      try {
        engine.deployUnitByKey(axial, unitKey);
        const label = this.resolveUnitLabel(unitKey);
        this.renderEngineUnits();
        this.refreshDeploymentMirrors("deploy", { unitKey, hexKey: this.selectedHexKey, label });
        this.announceBattleUpdate(`Deployed ${label} to ${this.selectedHexKey}.`);
        this.battleState.emitBattleUpdate("deploymentUpdated");
        return;
      } catch (error) {
        console.error("Failed to deploy unit from roster", unitKey, error);
        this.announceBattleUpdate("Unable to deploy unit. Check zone capacity and hex availability.");
        return;
      }
    }

    if (turnSummary.turnNumber <= 1) {
      this.announceBattleUpdate("Reserves stand down until turn 2 begins.");
      return;
    }

    try {
      const deploymentState = ensureDeploymentState();
      const scenarioType = deploymentState.getScenarioTypeForUnitKey(unitKey);
      const unitTypeKey = (scenarioType ?? unitKey) as string;
      const def = (unitTypesSource as any)[unitTypeKey];
      if (def && def.moveType === "air") {
        const label = this.resolveUnitLabel(unitKey);
        this.announceBattleUpdate(`${label} is an Air Support asset and cannot be deployed as a ground reserve.`);
        return;
      }
    } catch { }

    // Keep the roster popup open so the player can deploy multiple reserves without reopening it.
    // The roster will refresh in-place via the battleUpdate subscription after deployment mirrors update.

    // If a selected hex exists and is valid, attempt to deploy there first; otherwise fall back to nearest free.
    if (this.selectedHexKey) {
      const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
      if (parsed) {
        const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
        try {
          engine.callUpReserveByKey(unitKey, axial);
          const label = this.resolveUnitLabel(unitKey);
          this.renderEngineUnits();
          this.refreshDeploymentMirrors("deploy", { unitKey, hexKey: this.selectedHexKey, label });
          this.announceBattleUpdate(`Called up ${label} to ${this.selectedHexKey}.`);
          this.battleState.emitBattleUpdate("deploymentUpdated");
          return;
        } catch {
          // Fall through to auto-placement below
        }
      }
    }

    const autoPlaced = this.autoPlaceReserveNearestBase(unitKey);
    if (autoPlaced) {
      const { hexKey } = autoPlaced;
      const label = this.resolveUnitLabel(unitKey);
      this.renderEngineUnits();
      this.refreshDeploymentMirrors("deploy", { unitKey, hexKey, label });
      this.announceBattleUpdate(`Called up ${label} to ${hexKey}.`);
      this.battleState.emitBattleUpdate("deploymentUpdated");
      return;
    }

    this.announceBattleUpdate("No free hex within the base camp zone to deploy this reserve.");
  }

  private autoPlaceReserveNearestBase(unitKey: string): { hexKey: string } | null {
    const engine = this.battleState.ensureGameEngine();
    const base = engine.baseCamp;
    if (!base) {
      return null;
    }
    const baseAx = base.hex;
    const dep = ensureDeploymentState();
    const baseOffset = CoordinateSystem.axialToOffset(baseAx.q, baseAx.r);
    const baseOffsetKey = CoordinateSystem.makeHexKey(baseOffset.col, baseOffset.row);
    const zoneKey = dep.getZoneKeyForHex(baseOffsetKey);
    if (!zoneKey) {
      return null;
    }
    const candidates = dep.getZoneHexes(zoneKey)
      .map((k) => {
        const parsed = CoordinateSystem.parseHexKey(k);
        if (!parsed) return null;
        const ax = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
        const d = this.axialDistance(ax.q, ax.r, baseAx.q, baseAx.r);
        return { k, ax, d } as { k: string; ax: { q: number; r: number }; d: number };
      })
      .filter((x): x is { k: string; ax: { q: number; r: number }; d: number } => x !== null)
      .sort((a, b) => a.d - b.d);

    for (const c of candidates) {
      try {
        engine.callUpReserveByKey(unitKey, c.ax);
        return { hexKey: c.k };
      } catch {
        continue;
      }
    }
    return null;
  }

  private axialDistance(q1: number, r1: number, q2: number, r2: number): number {
    const dq = q1 - q2;
    const dr = r1 - r2;
    const ds = -dq - dr;
    return (Math.abs(dq) + Math.abs(dr) + Math.abs(ds)) / 2;
  }

  /**
   * Applies a selection highlight through the renderer so downstream listeners receive the update.
   * When the renderer is not available (edge-case testing scenarios), the handler falls back to a
   * direct invocation of the selection synchronization routine.
   */
  private applySelectedHex(key: string, forceRefresh = false): void {
    if (this.hexMapRenderer) {
      this.hexMapRenderer.applyHexSelection(key);
      if (forceRefresh && this.selectedHexKey === key) {
        this.handleRendererSelection(key, true);
      }
      return;
    }
    this.handleRendererSelection(key, forceRefresh);
  }

  /**
   * Clears the currently selected hex via the renderer so panels and status banners reset.
   */
  private clearSelectedHex(): void {
    if (this.hexMapRenderer) {
      this.hexMapRenderer.clearSelectionHighlight();
      this.publishSelectionIntel(null);
      return;
    }
    this.handleRendererSelection(null);
  }

  /**
   * Clears the active battle selection after a successful order without announcing a generic
   * "selection cleared" update that would overwrite the order result in the live region.
   */
  private clearSelectedHexAfterAction(): void {
    if (this.hexMapRenderer) {
      this.hexMapRenderer.applyHexSelection(null, true);
      this.hexMapRenderer.clearTacticalHighlights();
    }
    this.selectedHexKey = null;
    this.selectedPlayerUnitId = null;
    this.playerMoveHexes.clear();
    this.playerAttackHexes.clear();
    this.syncBaseCampAssignButton(this.battleState.ensureGameEngine().getTurnSummary().phase, false);
    if (this.baseCampStatus) {
      this.baseCampStatus.textContent = "Select a unit to move or attack.";
    }
    this.publishSelectionIntel(null);
  }

  /**
   * Receives renderer selection notifications and propagates the new state to UI affordances while
   * avoiding redundant work when the key is unchanged.
   */
  private handleRendererSelection(key: string | null, forceRefresh = false): void {
    if (!forceRefresh && this.selectedHexKey === key) {
      return;
    }

    // Only enforce zone lock during deployment phase, not during battle
    const engine = this.battleState.ensureGameEngine();
    const phase = engine.getTurnSummary().phase;
    if (phase === "deployment" && key && this.deploymentPanel?.isZoneLocked() && !this.deploymentPanel.isHexWithinLockedZone(key)) {
      const lockedLabel = this.deploymentPanel.getLockedZoneLabel() ?? "locked deployment zone";
      this.announceBattleUpdate(`Base camp assigned to ${lockedLabel}. Select a hex within that zone.`);
      return;
    }

    if (this.artilleryTargetingState && key !== this.artilleryTargetingState.callerHexKey) {
      this.cancelArtilleryTargeting(false);
    }
    if (this.smokeTargetingState && key !== this.smokeTargetingState.callerHexKey) {
      this.cancelSmokeTargeting(false);
    }

    if (key === null || this.selectedHexKey !== key) {
      this.selectedPlayerUnitId = null;
    }
    this.selectedHexKey = key;
    this.updateSelectionFeedback(key);
  }

  /**
   * Updates base camp status copy, deployment panel context, and hex zone outlines to reflect the
   * latest selection state.
   */
  /**
   * Propagates selection details across the UI and announcement channel while keeping map highlights synced.
   */
  private updateSelectionFeedback(key: string | null): void {
    const engine = this.battleState.ensureGameEngine();
    const phase = engine.getTurnSummary().phase;

    if (!key) {
      this.syncBaseCampAssignButton(phase, false);
      if (this.baseCampStatus) {
        this.baseCampStatus.textContent = phase === "deployment" ? "No hex selected." : "Select a unit to move or attack.";
      }
      // Clear all zone highlights
      this.hexMapRenderer?.setZoneHighlights([]);
      this.hexMapRenderer?.clearTacticalHighlights();
      this.deploymentPanel?.setSelectedHex(null);
      this.playerMoveHexes.clear();
      this.playerAttackHexes.clear();
      this.announceBattleUpdate(phase === "deployment" ? "Selection cleared. Choose a deployment hex." : "Selection cleared.");
      this.publishSelectionIntel(null);
      return;
    }

    if (phase === "deployment") {
      const terrainLabel = this.lookupTerrainName(key);
      const selection = this.resolvePlayerDeploymentSelection(key);
      const zoneHexes = selection.zoneKey ? selection.zoneHexes : this.getPlayerDeploymentZoneHexes();
      this.syncBaseCampAssignButton(phase, selection.zoneKey !== null);

      if (this.baseCampStatus) {
        this.baseCampStatus.setAttribute("aria-live", "polite");
        if (selection.zoneKey && selection.remainingCapacity !== null && selection.totalCapacity !== null) {
          this.baseCampStatus.textContent = `Selected hex: ${key} in ${selection.zoneLabel ?? "deployment zone"}.`;
        } else {
          this.baseCampStatus.textContent = `Selected hex: ${key}. Outside player deployment zones. Use Zone Alpha from the deployment list to refocus on legal hexes.`;
        }
      }
      this.hexMapRenderer?.setZoneHighlights(zoneHexes);
      this.deploymentPanel?.setSelectedHex(key, {
        terrainName: terrainLabel,
        zoneKey: selection.zoneKey,
        zoneLabel: selection.zoneLabel
      } satisfies SelectedHexContext);

      const baseAnnouncement = selection.zoneLabel
        ? `Selected ${key}. ${terrainLabel}. Zone ${selection.zoneLabel}.`
        : `Selected ${key}. ${terrainLabel}. Outside player deployment zones.`;
      const placementGuidance = selection.zoneKey
        ? "Ready for base camp placement."
        : "Choose a highlighted player deployment hex to place the base camp.";
      const combinedAnnouncement = `${baseAnnouncement} ${placementGuidance}`;
      this.announceBattleUpdate(combinedAnnouncement);

      const zoneIntel: DeploymentSelectionIntel = {
        kind: "deployment",
        hexKey: key,
        terrainName: terrainLabel,
        zoneLabel: selection.zoneLabel,
        remainingCapacity: selection.remainingCapacity,
        totalCapacity: selection.totalCapacity,
        notes: selection.zoneLabel ? [selection.zoneLabel] : ["Outside player deployment zones"]
      };
      this.publishSelectionIntel(zoneIntel);
      return;
    }

    // Gameplay selection: compute move/attack overlays for player units.
    const parsed = CoordinateSystem.parseHexKey(key);
    if (!parsed) {
      console.warn("[BattleScreen] updateSelectionFeedback - failed to parse hex key");
      return;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const selectedMember = this.resolveSelectedPlayerStackMember(key);
    if (selectedMember) {
      const selectedPlayerUnit = selectedMember.unit;
      const selectedUnitId = selectedMember.unitId;
      const moves = engine.getReachableHexes(axial, selectedUnitId);
      const targets = engine.getAttackableTargets(axial, selectedUnitId);
      const movementBudget = engine.getMovementBudget(axial, selectedUnitId);
      const isAutomatedLogisticsUnit = selectedMember.isAutomated;
      this.playerMoveHexes = new Set(moves.map(({ q, r }) => {
        const { col, row } = CoordinateSystem.axialToOffset(q, r);
        const key = CoordinateSystem.makeHexKey(col, row);
        return key;
      }));
      this.playerAttackHexes = new Set(targets.map(({ q, r }) => {
        const { col, row } = CoordinateSystem.axialToOffset(q, r);
        const key = CoordinateSystem.makeHexKey(col, row);
        return key;
      }));
      this.hexMapRenderer?.setTacticalHighlights(this.playerMoveHexes, this.playerAttackHexes);

      // Provide clear feedback about unit's action state. Resolve labels strictly so bad data surfaces immediately.
      const unitLabel = this.resolveUnitLabelForHex(key, selectedUnitId);
      if (!unitLabel) {
        console.error("[BattleScreen] Unable to resolve label for selected unit", { hexKey: key });
        this.announceBattleUpdate(`Unit label unavailable for ${key}. Please report this issue.`);
        return;
      }
      let statusMessage = `${unitLabel} selected at ${key}.`;
      const commandState = engine.getUnitCommandState(axial, selectedUnitId);

      const selectedUnitDefinition = this.unitTypes[selectedPlayerUnit.type as keyof UnitTypeDictionary] as UnitTypeDefinition | undefined;
      const ammoStatusMessage = this.buildBattleAmmoStatusMessage(selectedPlayerUnit, selectedUnitDefinition);

      if (isAutomatedLogisticsUnit) {
        this.playerMoveHexes.clear();
        this.playerAttackHexes.clear();
        this.hexMapRenderer?.clearTacticalHighlights();
        statusMessage += " This convoy is automated. Set battalion resupply priority in Logistics instead of issuing manual orders.";
      } else if (commandState?.isOnSentry) {
        statusMessage += " Holding on sentry. If attacked before its next activation and able to return fire, combat resolves simultaneously.";
      } else {
        statusMessage += this.buildBattleActionSummary(
          this.playerMoveHexes.size,
          this.playerAttackHexes.size,
          ammoStatusMessage
        );
        if (ammoStatusMessage) {
          statusMessage += ammoStatusMessage;
        }
      }
      if (commandState?.suppressionState === "broken") {
        statusMessage += ` Broken by ${commandState.suppressorCount} suppressing units while below 25 readiness. This battalion cannot move or retaliate.`;
      } else if (commandState?.suppressionState === "pinned") {
        statusMessage += ` Pinned by ${commandState.suppressorCount} suppressing units. This battalion cannot move or retaliate.`;
      } else if (commandState?.suppressionState === "suppressed") {
        statusMessage += " Under suppressing fire. It may still move and fire, but it cannot assault.";
      }
      const existingHexModifications = commandState?.existingHexModifications ?? [];
      if (existingHexModifications.length > 0) {
        statusMessage += ` ${this.toTitleCase(this.describeHexModificationCollection(existingHexModifications))} already cover this hex.`;
      }

      if (this.baseCampStatus) {
        this.baseCampStatus.textContent = isAutomatedLogisticsUnit
          ? `${unitLabel} @ ${key} - Automated convoy`
          : commandState?.isOnSentry
            ? `${unitLabel} @ ${key} - Sentry`
          : `${unitLabel} @ ${key} - Move:${this.playerMoveHexes.size} Attack:${this.playerAttackHexes.size}`;
      }
      this.announceBattleUpdate(statusMessage);

      this.completeGuidedTutorialSelectionFromClick(key, selectedPlayerUnit, commandState);
      this.syncTutorialPhaseWithCurrentContext(ensureTutorialState().getCurrentPhase());

      this.publishSelectionIntel(
        this.buildBattleSelectionIntel(
          key,
          selectedPlayerUnit,
          unitLabel,
          movementBudget,
          statusMessage,
          commandState,
          this.buildBattleSelectionUnitTabs(key)
        )
      );
    } else {
      console.log("[BattleScreen] updateSelectionFeedback - hex does not hold player unit");
      this.selectedPlayerUnitId = null;
      this.playerMoveHexes.clear();
      this.playerAttackHexes.clear();
      this.hexMapRenderer?.clearTacticalHighlights();
      const enemyContact = this.findEnemyContactAtHex(axial);
      const terrainNotes: string[] = [];
      if (enemyContact) {
        terrainNotes.push(`Enemy contact: ${this.describeEnemyContact(enemyContact)}.`);
      }
      const hexModifications = engine.getHexModifications(axial);
      if (hexModifications.length > 0) {
        terrainNotes.push(`${this.toTitleCase(this.describeHexModificationCollection(hexModifications))} remain in place here.`);
      }
      if (terrainNotes.length === 0) {
        terrainNotes.push("Hex unoccupied.");
      }
      if (this.baseCampStatus) {
        this.baseCampStatus.textContent = enemyContact
          ? `Selected hex: ${key} - ${this.describeEnemyContact(enemyContact)}`
          : `Selected hex: ${key}`;
      }
      this.announceBattleUpdate(enemyContact
        ? `Selected ${key}. ${this.lookupTerrainName(key)}. ${this.describeEnemyContact(enemyContact)}.`
        : `Selected ${key}. ${this.lookupTerrainName(key)}.`);
      const terrainIntel: TerrainSelectionIntel = {
        kind: "terrain",
        hexKey: key,
        terrainName: this.lookupTerrainName(key),
        notes: terrainNotes
      };
      this.publishSelectionIntel(terrainIntel);
    }
  }

  /** Duration in milliseconds for player unit movement animation. */
  private static readonly PLAYER_MOVE_ANIMATION_MS = 350;

  /**
   * Executes a player unit move with smooth animation.
   * The engine state updates immediately, but the visual transition is animated.
   */
  private async executeAnimatedPlayerMove(
    fromKey: string,
    toKey: string,
    fromAxial: Axial,
    toAxial: Axial,
    unitId?: string | null
  ): Promise<void> {
    this.closeSelectionIntelForAnimation();
    const engine = this.battleState.ensureGameEngine();
    const isTutorialMovement =
      ensureTutorialState().getProgress().isActive &&
      ensureTutorialState().getCurrentPhase() === "movement_intro";

    const renderer = this.hexMapRenderer;
    let moveHandle: MoveAnimationHandle | null = null;

    try {
      // Update engine state
      const resolution = engine.moveUnit(fromAxial, toAxial, unitId ?? undefined);
      const movedUnitId = resolution.unit.unitId ?? unitId ?? this.selectedPlayerUnitId ?? null;
      const pathKeys = this.toMovePathKeys(resolution.path, fromKey, toKey);
      moveHandle = renderer?.primeUnitMove(fromKey, toKey, {
        path: pathKeys,
        unitId: resolution.unit.unitId ?? unitId ?? null
      }) ?? null;

      // Play the animation if available
      if (moveHandle) {
        try {
          await moveHandle.play(this.resolveMoveAnimationDuration(pathKeys, BattleScreen.PLAYER_MOVE_ANIMATION_MS));
        } catch (animationError) {
          console.warn("[BattleScreen] Player move animation failed; continuing without playback.", animationError);
        } finally {
          moveHandle.dispose();
        }
      }

      // Render the final state and keep partially spent initiative units active.
      const canContinueActivation = this.canPlayerUnitContinueAfterMove(toAxial, movedUnitId);
      this.renderEngineUnits();
      if (canContinueActivation && !isTutorialMovement) {
        this.selectedHexKey = toKey;
        this.selectedPlayerUnitId = movedUnitId;
        this.applySelectedHex(toKey, true);
      } else {
        this.clearSelectedHexAfterAction();
      }
      this.announceBattleUpdate(`Moved unit to ${toKey}.`);
      this.publishActivityEvent({
        category: "player",
        type: "move",
        summary: `Unit moved from ${fromKey} to ${toKey}.`
      });
      this.completeTutorialPhase("movement_intro");

      this.battleState.emitBattleUpdate("manual");
      if (!canContinueActivation || isTutorialMovement) {
        this.completeInitiativeActivationAfterPlayerOrder(movedUnitId);
      }
    } catch (err) {
      console.error("Failed to move unit", {
        error: err,
        phase: engine.getTurnSummary().phase,
        activeFaction: engine.getTurnSummary().activeFaction,
        playerUnits: engine.playerUnits.length,
        botUnits: engine.botUnits.length,
        reserves: engine.getReserveSnapshot().length,
        placements: engine.getPlayerPlacementsSnapshot().length
      });
      if (moveHandle) {
        moveHandle.dispose();
      }
      // Clear stale selection and let user reselect
      this.clearSelectedHex();
      this.renderEngineUnits();
      const moveFailureMessage = this.buildMoveFailureMessage(err);
      this.announceBattleUpdate(moveFailureMessage);
      this.publishActivityEvent({
        category: "system",
        type: "move",
        summary: moveFailureMessage
      });
    }
  }

  private buildMoveFailureMessage(error: unknown): string {
    const reason = error instanceof Error && error.message.trim().length > 0
      ? error.message.trim()
      : "The route is no longer valid.";

    let correctiveAction = "Select the unit again and choose a legal destination hex.";
    if (reason.includes("must choose Move Out before it can be towed")) {
      correctiveAction = "Use Move Out first, then pick a destination hex.";
    } else if (reason.includes("Pinned formations cannot move")) {
      correctiveAction = "Break the pin or wait until the unit recovers before moving it.";
    } else if (reason.includes("Artillery cannot move after attacking")) {
      correctiveAction = "Move before firing next turn, or leave the battery in place now.";
    } else if (reason.includes("Friendly hex is already at the two-formation stacking limit")) {
      correctiveAction = "Choose another highlighted hex.";
    } else if (reason.includes("Enemy-occupied hexes must be attacked")) {
      correctiveAction = "Attack the enemy or choose a different route.";
    } else if (reason.includes("Destination hex is occupied")) {
      correctiveAction = "Pick an open hex.";
    } else if (reason.includes("Destination is not reachable")) {
      correctiveAction = "Choose a highlighted hex within the unit's remaining movement.";
    } else if (reason.includes("This logistics convoy is AI-controlled")) {
      correctiveAction = "Let the convoy move during the supply phase instead of issuing manual orders.";
    } else if (reason.includes("Movement is allowed only during the player turn")) {
      correctiveAction = "Wait until your next player turn to issue the move.";
    }

    return `Move failed: ${reason} ${correctiveAction}`;
  }

  /**
   * Player-turn click routing: select own unit to show overlays; click a reachable hex to move; click a target to attack.
   */
  private onPlayerTurnMapClick(key: string): void {
    const _engine = this.battleState.ensureGameEngine();
    const parsed = CoordinateSystem.parseHexKey(key);
    if (!parsed) {
      console.warn("[BattleScreen] onPlayerTurnMapClick - failed to parse hex key", key);
      return;
    }
    const clickedAxial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    if (
      ensureTutorialState().isTutorialActive() &&
      Date.now() < this.tutorialMapInputBlockedUntil
    ) {
      this.queueTutorialMapClickAfterCamera(key);
      return;
    }

    if (this.smokeTargetingState) {
      if (this.smokeTargetingState.targetHexKeys.has(key)) {
        this.executeSmokeOnTargetHex(key);
        return;
      }
      if (key === this.smokeTargetingState.callerHexKey) {
        // Clicking own hex pops smoke on own position.
        const state = this.smokeTargetingState;
        this.cancelSmokeTargeting(false);
        this.promptFortificationFacing(state.callerAxial, state.callerLabel, state.callerUnitId, "smoke");
        return;
      }
      this.cancelSmokeTargeting(false);
      return;
    }

    if (this.artilleryTargetingState) {
      if (this.artilleryTargetingState.targetHexKeys.has(key)) {
        void this.executeQueuedArtilleryStrike(key);
        return;
      }
      if (key === this.artilleryTargetingState.callerHexKey) {
        this.cancelArtilleryTargeting(true);
        return;
      }
      this.cancelArtilleryTargeting(false);
    }

    // If there is an active selection and the user clicked a move/attack destination, execute the action.
    if (this.selectedHexKey) {
      const selectedMember = this.resolveSelectedPlayerStackMember(this.selectedHexKey);
      const actionableUnitId = selectedMember?.unitId ?? this.selectedPlayerUnitId ?? null;
      if (this.isInitiativeSystemEnabled) {
        if (!actionableUnitId) {
          this.showElegantInitiativeMessage("Select the active formation before issuing orders.");
          return;
        }
        if (!this.isUnitInCurrentInitiativeGroup(actionableUnitId)) {
          this.showInitiativeGroupMessage(actionableUnitId);
          return;
        }
      }
      if (this.playerMoveHexes.has(key)) {
        const selParsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
        if (!selParsed) return;
        const selAxial = CoordinateSystem.offsetToAxial(selParsed.col, selParsed.row);
        const originKey = this.selectedHexKey ?? CoordinateSystem.makeHexKey(selParsed.col, selParsed.row);

        // Execute animated player move
        void this.executeAnimatedPlayerMove(originKey, key, selAxial, clickedAxial, actionableUnitId);
        return;
      }
      if (this.playerAttackHexes.has(key)) {
        const selParsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
        if (!selParsed) return;
        const selAxial = CoordinateSystem.offsetToAxial(selParsed.col, selParsed.row);
        this.promptAttackConfirmation(selAxial, clickedAxial, { attackerUnitId: actionableUnitId });
        return;
      }
    }

    // A click on another friendly stack is a selection change unless that hex
    // is already highlighted as a legal move for the selected formation.
    if (
      this.selectedHexKey !== key &&
      this.getPlayerStackMembersAtHex(key).length > 0
    ) {
      this.applySelectedHex(key);
      return;
    }

    // Otherwise treat as a selection change.
    if (this.selectedHexKey === key) {
      this.clearSelectedHex();
      return;
    }
    this.applySelectedHex(key);
  }

  private handleSelectionIntelOverlayClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    const toggleButton = target?.closest<HTMLButtonElement>("#battleIntelOverlayToggle");
    if (toggleButton) {
      window.setTimeout(() => this.syncTutorialPhaseWithCurrentContext("intel_overlay_expand"), 0);
      return;
    }

    const actionButton = target?.closest<HTMLButtonElement>("[data-selection-action]");
    if (!actionButton || actionButton.disabled) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    void this.executeSelectionIntelAction(actionButton.dataset.selectionAction ?? "");
  }

  private async executeSelectionIntelAction(actionId: string): Promise<void> {
    if (!this.selectedHexKey) {
      return;
    }
    if (actionId.startsWith("selectUnit:")) {
      const unitId = actionId.slice("selectUnit:".length).trim();
      if (!unitId) {
        return;
      }
      if (this.isInitiativeSystemEnabled && !this.isUnitInCurrentInitiativeGroup(unitId)) {
        this.showInitiativeGroupMessage(unitId);
        return;
      }
      const stackMembers = this.getPlayerStackMembersAtHex(this.selectedHexKey);
      if (!stackMembers.some((member) => member.unitId === unitId)) {
        return;
      }
      this.selectedPlayerUnitId = unitId;
      this.updateSelectionFeedback(this.selectedHexKey);
      return;
    }
    if (actionId.startsWith("consolidate:")) {
      const secondaryUnitId = actionId.slice("consolidate:".length).trim();
      if (!secondaryUnitId || !this.selectedPlayerUnitId) {
        return;
      }
      if (this.isInitiativeSystemEnabled && !this.isUnitInCurrentInitiativeGroup(this.selectedPlayerUnitId)) {
        this.showInitiativeGroupMessage(this.selectedPlayerUnitId);
        return;
      }
      const engine = this.battleState.ensureGameEngine();
      const folded = engine.combinePlayerUnits(this.selectedPlayerUnitId, secondaryUnitId);
      if (!folded) {
        this.announceBattleUpdate("These formations cannot be folded together. They must share a hex, match type, and stay at or below 100% combined strength.");
        return;
      }
      this.selectedPlayerUnitId = folded.unitId ?? this.selectedPlayerUnitId;
      const unitLabel = this.resolveUnitLabel(folded.type);
      const summary = `${unitLabel} consolidated at ${this.selectedHexKey}. Strength now ${Math.round(folded.strength)}%.`;
      this.renderEngineUnits();
      this.applySelectedHex(this.selectedHexKey, true);
      this.announceBattleUpdate(summary);
      this.publishActivityEvent({
        category: "player",
        type: "log",
        summary
      });
      this.battleState.emitBattleUpdate("manual");
      return;
    }
    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) {
      return;
    }
    if (this.isInitiativeSystemEnabled && this.selectedPlayerUnitId && !this.isUnitInCurrentInitiativeGroup(this.selectedPlayerUnitId)) {
      this.showInitiativeGroupMessage(this.selectedPlayerUnitId);
      return;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const engine = this.battleState.ensureGameEngine();
    const unitLabel = this.resolveUnitLabelForHex(this.selectedHexKey, this.selectedPlayerUnitId) ?? "Selected unit";
    const commandState = engine.getUnitCommandState(axial, this.selectedPlayerUnitId ?? undefined);
    const unit = this.resolvePlayerUnitSnapshot(this.selectedHexKey, this.selectedPlayerUnitId);
    if (!unit) {
      return;
    }
    const actedUnitId = unit.unitId ?? this.selectedPlayerUnitId ?? null;

    let succeeded = false;
    let summary = "";
    if (actionId === "repositionArtillery") {
      const queuedArtillery = this.getQueuedArtilleryForCallerHex(this.selectedHexKey);
      if (!queuedArtillery) {
        this.announceBattleUpdate("No queued heavy artillery mission is available to reposition.");
        return;
      }
      this.cancelQueuedArtilleryStrike(
        queuedArtillery.id,
        this.selectedHexKey,
        unitLabel,
        this.parseAxialKeyToOffsetHexKey(queuedArtillery.queuedHex) ?? "the selected target"
      );
      return;
    }
    if (actionId === "callArtillery") {
      const artilleryState = this.resolveArtilleryActionState(unit, commandState, this.selectedHexKey);
      if (!artilleryState.available || !artilleryState.assetId) {
        this.announceBattleUpdate(artilleryState.reason ?? "Heavy artillery is not available right now.");
        return;
      }
      this.beginArtilleryTargeting(
        this.selectedHexKey,
        unitLabel,
        actedUnitId,
        artilleryState.assetId,
        artilleryState.targetHexKeys
      );
      return;
    }
    if (actionId === "enterSentry") {
      succeeded = engine.enterSentry(axial, this.selectedPlayerUnitId ?? undefined);
      summary = `${unitLabel} went on sentry at ${this.selectedHexKey}.`;
      if (!succeeded) {
        this.announceBattleUpdate(commandState?.sentryReason ?? "This formation cannot enter sentry right now.");
        return;
      }
    } else if (actionId === "moveOutTow") {
      succeeded = engine.moveOutTowableUnit(axial, this.selectedPlayerUnitId ?? undefined);
      summary = `${unitLabel} moved out from ${this.selectedHexKey} and is now ready to tow.`;
      if (!succeeded) {
        this.announceBattleUpdate(commandState?.moveOutReason ?? "This battery cannot move out right now.");
        return;
      }
    } else if (actionId === "deployTow") {
      succeeded = engine.deployTowableUnit(axial, this.selectedPlayerUnitId ?? undefined);
      summary = `${unitLabel} deployed its guns at ${this.selectedHexKey}.`;
      if (!succeeded) {
        this.announceBattleUpdate(commandState?.deployTowReason ?? "This battery cannot deploy right now.");
        return;
      }
    } else if (actionId === "exitSentry") {
      succeeded = engine.exitSentry(axial, this.selectedPlayerUnitId ?? undefined);
      summary = `${unitLabel} exited sentry mode at ${this.selectedHexKey}.`;
      if (!succeeded) {
        this.announceBattleUpdate("Unable to exit sentry mode.");
        return;
      }
    } else if (actionId === "digIn") {
      succeeded = engine.digInUnit(axial, this.selectedPlayerUnitId ?? undefined);
      summary = `${unitLabel} dug in at ${this.selectedHexKey}.`;
      if (!succeeded) {
        this.announceBattleUpdate(commandState?.digInReason ?? "This formation cannot dig in right now.");
        return;
      }
    } else if (actionId === "setFacing") {
      if (!commandState?.canSetFacing) {
        this.announceBattleUpdate(commandState?.setFacingReason ?? "This formation cannot change facing right now.");
        return;
      }
      this.promptFortificationFacing(axial, unitLabel, this.selectedPlayerUnitId, "facing");
      return;
    } else if (actionId === "laySmoke") {
      if (!commandState?.canLaySmoke) {
        this.announceBattleUpdate(commandState?.smokeReason ?? "This formation cannot lay smoke right now.");
        return;
      }
      this.promptSmokeMode(axial, unitLabel, this.selectedPlayerUnitId);
      return;
    } else {
      const modificationType = this.parseHexModificationAction(actionId);
      if (!modificationType) {
        return;
      }
      if (modificationType === "fortifications" || modificationType === "tankTraps") {
        this.promptFortificationFacing(axial, unitLabel, this.selectedPlayerUnitId, modificationType);
        return;
      }
      succeeded = engine.buildHexModification(axial, modificationType, undefined, this.selectedPlayerUnitId ?? undefined);
      if (modificationType === "clearedPath") {
        const currentLevel = engine.getHexModifications(axial)
          .find((modification) => modification.type === "clearedPath")
          ?.level ?? 1;
        summary = currentLevel > 1
          ? `${unitLabel} improved the cleared path to level ${currentLevel} at ${this.selectedHexKey}.`
          : `${unitLabel} cleared a path at ${this.selectedHexKey}.`;
      } else {
        summary = `${unitLabel} established ${this.describeHexModification(modificationType)} at ${this.selectedHexKey}.`;
      }
      if (!succeeded) {
        this.announceBattleUpdate(
          commandState?.buildModificationAvailability?.[modificationType]?.reason ??
          commandState?.buildReason ??
          "Engineer orders are not available on this hex right now."
        );
        return;
      }
    }

    this.renderEngineUnits();
    this.clearSelectedHexAfterAction();
    this.announceBattleUpdate(summary);
    this.publishActivityEvent({
      category: "player",
      type: "log",
      summary
    });
    this.completeTutorialPhase("spend_activation");
    if ((actionId === "digIn" && this.isEngineerBattleUnit(unit)) || actionId === "clearedPath") {
      this.completeTutorialPhase("engineer_orders");
    }
    this.battleState.emitBattleUpdate("manual");
    this.completeInitiativeActivationAfterPlayerOrder(actedUnitId);
  }

  private collectAirOperationsSummary(engine: GameEngine): AirOperationsSummary | undefined {
    const reports = engine.getAirMissionReports().filter(
      (entry) => entry.faction === "Player" && entry.event !== "refitStarted" && entry.event !== "refitCompleted"
    );
    if (reports.length === 0) {
      return undefined;
    }

    const livePlayerAirUnits = new Set<string>();
    [...(engine.playerUnits ?? []), ...(engine.reserveUnits ?? []).map((entry) => entry.unit)].forEach((unit) => {
      if (unit.unitId) {
        livePlayerAirUnits.add(unit.unitId);
      }
    });

    let airCombatDamageInflicted = 0;
    let airCombatDamageTaken = 0;
    let hostileFlightsDestroyed = 0;
    const participatingPlayerFlights = new Set<string>();

    for (const report of reports) {
      participatingPlayerFlights.add(report.unitKey);
      hostileFlightsDestroyed += Math.max(0, report.kills?.escorts ?? 0) + Math.max(0, report.kills?.cap ?? 0);

      if (report.kind === "strike") {
        airCombatDamageTaken += Math.max(0, report.bomberAttrition ?? 0);
        airCombatDamageInflicted += Math.max(0, report.interceptorAttrition ?? 0) + Math.max(0, report.escortAttrition ?? 0);
      } else if (report.kind === "escort") {
        airCombatDamageTaken += Math.max(0, report.escortAttrition ?? 0);
        airCombatDamageInflicted += Math.max(0, report.interceptorAttrition ?? 0);
      } else if (report.kind === "airCover") {
        airCombatDamageTaken += Math.max(0, report.interceptorAttrition ?? 0);
        airCombatDamageInflicted += Math.max(0, report.bomberAttrition ?? 0) + Math.max(0, report.escortAttrition ?? 0);
      }
    }

    const playerFlightsLost = Array.from(participatingPlayerFlights).filter((unitKey) => !livePlayerAirUnits.has(unitKey)).length;

    return {
      sortiesFlown: reports.length,
      strikeSorties: reports.filter((entry) => entry.kind === "strike").length,
      escortSorties: reports.filter((entry) => entry.kind === "escort").length,
      patrolSorties: reports.filter((entry) => entry.kind === "airCover").length,
      transportSorties: reports.filter((entry) => entry.kind === "airTransport").length,
      airCombatDamageInflicted,
      airCombatDamageTaken,
      hostileFlightsDestroyed,
      playerFlightsLost
    };
  }

  /**
   * Handles keyboard-driven map navigation so players can scan deployment hexes using arrow keys or
   * WASD without taking their hands off the keyboard.
   */
  private handleMapNavigation(event: KeyboardEvent): void {
    const activeTarget = event.target as HTMLElement | null;
    if (activeTarget && ["INPUT", "TEXTAREA", "SELECT"].includes(activeTarget.tagName)) {
      return;
    }
    if (this.element.classList.contains("hidden")) {
      return;
    }

    const key = event.key;
    const currentHex = this.selectedHexKey ?? this.defaultSelectionKey;
    if (!currentHex) {
      return;
    }

    const origin = CoordinateSystem.parseHexKey(currentHex);
    if (!origin) {
      return;
    }

    const delta = this.resolveNavigationDelta(key, origin.col);
    if (!delta) {
      return;
    }

    event.preventDefault();

    const axial = CoordinateSystem.offsetToAxial(origin.col, origin.row);
    const nextQ = axial.q + delta.dq;
    const nextR = axial.r + delta.dr;
    const { col, row } = CoordinateSystem.axialToOffset(nextQ, nextR);

    if (col < 0 || row < 0 || col >= this.scenario.size.cols || row >= this.scenario.size.rows) {
      return;
    }

    const nextKey = CoordinateSystem.makeHexKey(col, row);
    this.applySelectedHex(nextKey);
  }

  /**
   * Handles keyboard navigation inside the attack dialog to provide focus trapping and shortcuts for confirm/cancel actions.
   */
  private handleAttackDialogKeydown(event: KeyboardEvent): void {
    if (!this.attackConfirmDialog) {
      return;
    }

    switch (event.key) {
      case "Escape": {
        event.preventDefault();
        this.handleCancelAttack();
        return;
      }
      case "Enter": {
        event.preventDefault();
        this.handleConfirmAttack();
        return;
      }
      case "Tab": {
        const focusableElements = this.getAttackDialogFocusableElements();
        if (focusableElements.length === 0) {
          event.preventDefault();
          return;
        }
        const currentElement = document.activeElement as HTMLElement | null;
        const currentIndex = currentElement ? focusableElements.indexOf(currentElement) : -1;
        const lastIndex = focusableElements.length - 1;
        let nextIndex = currentIndex;
        if (event.shiftKey) {
          nextIndex = currentIndex <= 0 ? lastIndex : currentIndex - 1;
        } else {
          nextIndex = currentIndex >= lastIndex ? 0 : currentIndex + 1;
        }
        event.preventDefault();
        focusableElements[nextIndex]?.focus();
        return;
      }
      default:
        return;
    }
  }

  /**
   * Returns the focusable controls inside the attack confirmation dialog, filtering out hidden or disabled elements.
   */
  private getAttackDialogFocusableElements(): HTMLElement[] {
    if (!this.attackConfirmDialog) {
      return [];
    }
    const selectors = [
      "button",
      "[href]",
      "input",
      "select",
      "textarea",
      '[tabindex]:not([tabindex="-1"])'
    ].join(",");
    return Array.from(this.attackConfirmDialog.querySelectorAll<HTMLElement>(selectors)).filter((element) => {
      const isHidden = element.getAttribute("aria-hidden") === "true" || element.hidden;
      const isDisabled = (element as HTMLButtonElement).disabled;
      return !isHidden && !isDisabled;
    });
  }

  /**
   * Computes the default hex key that should be focused when keyboard navigation begins. Prefers
   * deployment zones so the player immediately sees actionable tiles.
   */
  private computeDefaultSelectionKey(): string {
    const deploymentState = ensureDeploymentState();
    const baseCampKey = deploymentState.getBaseCampKey();
    if (baseCampKey && deploymentState.isHexWithinPlayerZone(baseCampKey)) {
      return baseCampKey;
    }
    const preferredZoneKey = getMissionDeploymentProfile(this.uiState?.selectedMission ?? "training").preferredZoneKey;
    if (preferredZoneKey) {
      const preferredHex = deploymentState.getZoneHexes(preferredZoneKey)[0];
      if (preferredHex) {
        return preferredHex;
      }
    }
    const playerZones = deploymentState.getZoneUsageSummaries().filter((zone) => zone.faction === "Player");
    for (const zone of playerZones) {
      const firstHex = deploymentState.getZoneHexes(zone.zoneKey)[0];
      if (firstHex) {
        return firstHex;
      }
    }

    throw new Error(
      `[BattleScreen] Unable to compute a default selection for mission ${(this.uiState?.selectedMission ?? "training")}: no registered player deployment hexes are available in scenario ${this.scenario.name}.`
    );
  }

  /**
   * Produces the axial delta representing the requested navigation direction for a pointy-top grid.
   * Uses odd-q column parity so Up/Down feel vertical by alternating NE/NW and SE/SW, while Left/Right
   * map directly to West/East axial neighbours with no parity adjustment.
   */
  private resolveNavigationDelta(key: string, col: number): { dq: number; dr: number } | null {
    switch (key) {
      case "ArrowUp":
      case "w":
      case "W":
        // Even column -> NE (1,-1), Odd column -> NW (0,-1)
        return col % 2 === 0 ? { dq: 1, dr: -1 } : { dq: 0, dr: -1 };
      case "ArrowDown":
      case "s":
      case "S":
        // Even column -> SW (-1,1), Odd column -> SE (0,1)
        return col % 2 === 0 ? { dq: -1, dr: 1 } : { dq: 0, dr: 1 };
      case "ArrowLeft":
      case "a":
      case "A":
        // Axial West
        return { dq: -1, dr: 0 };
      case "ArrowRight":
      case "d":
      case "D":
        // Axial East
        return { dq: 1, dr: 0 };
      default:
        return null;
    }
  }

  /**
   * Derives a human-readable terrain label for the provided hex so status banners and panel prompts
   * stay informative.
   */
  private lookupTerrainName(hexKey: string): string {
    const parsed = CoordinateSystem.parseHexKey(hexKey);
    if (!parsed) {
      return "Unknown terrain";
    }
    const tileRow = this.scenario.tiles[parsed.row];
    if (!tileRow) {
      return "Unknown terrain";
    }
    const entry = tileRow[parsed.col];
    if (!entry) {
      return "Unknown terrain";
    }
    const details = CoordinateSystem.resolveTile(entry, this.scenario.tilePalette);
    if (!details) {
      return "Unknown terrain";
    }
    return this.toTitleCase(details.terrain);
  }

  /**
   * Converts snake-case or lowercase identifiers into title case for presentation in the UI.
   */
  private toTitleCase(value: string): string {
    return value
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private announceBattleUpdate(message: string): void {
    const trimmed = message.trim();
    if (!trimmed || trimmed === this.lastAnnouncement) {
      return;
    }
    this.lastAnnouncement = trimmed;
    if (this.battleAnnouncements) {
      this.ensureAnnouncementRegionAttributes();
      // Feed the polite live region so assistive tech receives serialized updates while the inline overlay stays concise.
      this.battleAnnouncements.textContent = trimmed;
    }
  }

  /**
   * Ensures the hidden announcement region carries the appropriate ARIA attributes before broadcasting updates.
   */
  private ensureAnnouncementRegionAttributes(): void {
    if (!this.battleAnnouncements) {
      return;
    }
    if (!this.battleAnnouncements.hasAttribute("role")) {
      this.battleAnnouncements.setAttribute("role", "status");
    }
    if (!this.battleAnnouncements.hasAttribute("aria-live")) {
      this.battleAnnouncements.setAttribute("aria-live", "polite");
    }
  }

  /**
   * Stores the latest selection intel payload and forwards it to the persistent overlay presenter.
   * Suppresses auto-show during enemy/bot turns to avoid blocking the view of enemy actions.
   */
  private publishSelectionIntel(intel: SelectionIntel | null): void {
    this.selectionIntel = intel;

    // Don't auto-show intel overlay during enemy turns - let players watch the action
    const engine = this.battleState.tryGetGameEngine();
    const currentPhase = engine?.getTurnSummary().phase;
    const isEnemyTurn = currentPhase === "botTurn" || currentPhase === "allyTurn";

    if (isEnemyTurn && intel) {
      // Store the intel but don't show the overlay during enemy turns
      return;
    }

    this.selectionIntelOverlay?.update(intel);
  }

  private closeSelectionIntelForAnimation(): void {
    this.publishSelectionIntel(null);
  }

  private reportDeploymentPanelError(
    error: DeploymentPanelCriticalError,
    options?: { mirrorToBaseCampStatus?: boolean }
  ): void {
    console.error("[BattleScreen] deployment panel error", {
      missionKey: this.uiState?.selectedMission ?? "training",
      scenarioName: this.scenario.name,
      title: error.title,
      detail: error.detail,
      action: error.action,
      recoverable: error.recoverable
    });
    this.deploymentPanel?.setCriticalError(error);
    if (options?.mirrorToBaseCampStatus && this.baseCampStatus) {
      this.baseCampStatus.setAttribute("aria-live", "assertive");
      this.baseCampStatus.textContent = error.title;
    }
    this.announceBattleUpdate(`${error.title} ${error.action}`);
  }

  private formatActivityDetailLabel(key: string): string {
    return key
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/[_-]+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  private formatActivityDetailValue(value: unknown): string {
    if (value === null || value === undefined) {
      return "-";
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        return "-";
      }
      return Number.isInteger(value) ? value.toString() : this.formatReadinessValue(value);
    }
    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }
    if (Array.isArray(value)) {
      if (value.length <= 0) {
        return "-";
      }
      const rendered = value.map((entry) => this.formatActivityDetailValue(entry));
      const joined = rendered.join(", ");
      return joined.length > 280 ? `${joined.slice(0, 277)}...` : joined;
    }
    try {
      const json = JSON.stringify(value);
      if (!json) {
        return "-";
      }
      return json.length > 280 ? `${json.slice(0, 277)}...` : json;
    } catch {
      return String(value);
    }
  }

  private buildGenericActivityDetailSections(
    details: Record<string, unknown> | undefined
  ): readonly ActivityDetailSection[] | undefined {
    if (!details) {
      return undefined;
    }
    const entries = Object.entries(details).filter(([, value]) => value !== undefined);
    if (entries.length <= 0) {
      return undefined;
    }
    return [{
      title: "Technical Data",
      entries: entries.map(([key, value]) => ({
        label: this.formatActivityDetailLabel(key),
        value: this.formatActivityDetailValue(value)
      }))
    }];
  }

  /**
   * Records a battle activity event while respecting log caps and updating the sidebar feed.
   */
  private publishActivityEvent(event: ActivityEventInput): void {
    this.activityEventSequence += 1;
    const detailSections = event.detailSections ?? this.buildGenericActivityDetailSections(event.details);
    const activity: ActivityEvent = {
      id: `activity_${this.activityEventSequence}`,
      timestamp: new Date().toISOString(),
      category: event.category,
      type: event.type,
      summary: event.summary,
      details: event.details,
      detailSections
    };
    this.activityEvents.push(activity);
    if (this.activityEvents.length > BattleScreen.ACTIVITY_EVENT_LIMIT) {
      this.activityEvents.shift();
    }
    this.battleActivityLog?.append(activity);
  }

  /** Generate detailed weapon breakdown for mixed weapon loads */
  private generateWeaponBreakdown(
    attackerDef: UnitTypeDefinition,
    facingArmor: number,
    shotBreakdown: Pick<ShotBreakdown, "final" | "finalScalar"> | null
  ): { groups: Array<{ name: string; shots: number; ap: number; damage: string; effectiveness: string }>, summary: string } {
    const weaponModel = attackerDef.weaponModel;
    
    if (!weaponModel || weaponModel.groups.length === 0) {
      // Fallback for units without weapon model
      return {
        groups: [{
          name: this.toTitleCase(attackerDef.class),
          shots: shotBreakdown?.final ?? 0,
          ap: attackerDef.ap ?? 0,
          damage: "Profile fire",
          effectiveness: "Single weapon system"
        }],
        summary: "Single weapon system"
      };
    }

    const groups = weaponModel.groups.map((group) => {
      const groupShots = Math.max(0, group.shots) * (shotBreakdown?.finalScalar ?? 1);
      const groupAP = group.armorPenetration ?? group.hardEffect?.armorPenetration ?? 0;
      const penetrationMargin = groupAP - facingArmor;
      
      let effectiveness = "Standard";
      if (facingArmor > 0) {
        if (penetrationMargin >= 0) {
          effectiveness = `Overmatch (+${penetrationMargin})`;
        } else {
          effectiveness = `Undermatched (${penetrationMargin})`;
        }
      } else {
        effectiveness = "No armor target";
      }

      return {
        name: group.id.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        shots: Math.round(groupShots),
        ap: groupAP,
        damage: groupAP > facingArmor ? "Effective" : "Reduced",
        effectiveness
      };
    });

    const summary = `${groups.length} weapon systems: ${groups.map(g => `${g.name} (${g.shots} shots, AP${g.ap})`).join(", ")}`;

    return { groups, summary };
  }

  /** Builds structured activity detail sections so the activity log can surface full attack context on demand. */
  private buildPlayerAttackDetails(
    resolution: AttackResolution,
    preview: CombatPreview | null,
    meta: {
      attackerHex: string;
      defenderHex: string;
      inflictedDamage: number;
      retaliationDamage: number;
    }
  ): readonly ActivityDetailSection[] {
    const sections: ActivityDetailSection[] = [];

    sections.push({
      title: "Positions",
      entries: [
        { label: "Attacker", value: meta.attackerHex },
        { label: "Defender", value: meta.defenderHex }
      ]
    });

    if (preview) {
      const attackerLabel = this.toTitleCase(preview.attacker.type);
      const defenderLabel = this.toTitleCase(preview.defender.type);
      
      // Mirror the canonical engine classification so activity details cannot disagree with combat math.
      const defenderDef = this.unitTypes?.[preview.defender.type as keyof UnitTypeDictionary];
      const isSoftTarget = defenderDef ? isSoftCombatTarget(defenderDef) : false;
      
      sections.push({
        title: "Units",
        entries: [
          { label: "Attacker Type", value: attackerLabel },
          { label: "Defender Type", value: defenderLabel },
          { label: "Attacker Strength", value: `${this.formatReadinessValue(preview.attacker.strength)}%` },
          { label: "Defender Strength", value: `${this.formatReadinessValue(preview.defender.strength)}%` }
        ]
      });

      const accuracy = Math.round(preview.result.accuracy);
      const projectedDamage = this.formatDamageAmount(
        preview.projectedDamage?.readinessLoss ?? preview.finalExpectedDamage
      );
      const projectedRetaliation = this.formatDamageAmount(
        preview.projectedRetaliationDamage?.readinessLoss ?? preview.expectedRetaliation
      );
      const expectedHits = preview.result.expectedHits.toFixed(1);
      const shots = preview.result.shots;
      const effectiveAP = Math.round(preview.result.effectiveAP);
      const facingArmor = Math.round(preview.result.facingArmor);
      const personnelEffects = this.formatPersonnelDelta(preview.projectedDamage);
      const equipmentEffects = this.formatEquipmentDelta(preview.projectedDamage);

      sections.push({
        title: "Preview Odds",
        entries: [
          { label: "Accuracy", value: `${accuracy}%` },
          { label: "Shots", value: shots.toString() },
          { label: "Expected Hits", value: expectedHits },
          { label: "Projected Readiness Loss", value: `${projectedDamage}%` },
          { label: "Projected Return Fire", value: preview.retaliationPossible ? `${projectedRetaliation}%` : "None" },
          { label: "Personnel Effects", value: personnelEffects },
          { label: "Equipment Effects", value: equipmentEffects },
          { label: "Armor Penetration", value: `${effectiveAP} vs ${facingArmor} armor` }
        ]
      });

      // Add detailed weapon model details section
      const attackerDef = this.unitTypes?.[preview.attacker.type as keyof UnitTypeDictionary];
      const weaponBreakdown = this.generateWeaponBreakdown(attackerDef, facingArmor, preview.result.shotBreakdown ?? null);
      const weaponEntries = [
        { label: "Platform", value: attackerLabel },
        { label: "Attack Type", value: isSoftTarget ? "Soft Attack" : "Hard Attack" },
        { label: "Weapon Systems", value: `${weaponBreakdown.groups.length} systems` },
        { label: "Target Armor", value: `${facingArmor}` }
      ];
      
      // Add per-weapon details
      weaponBreakdown.groups.forEach((group) => {
        weaponEntries.push(
          { label: `  ${group.name}`, value: `${group.shots} shots, AP${group.ap}` },
          { label: `    Effectiveness`, value: group.effectiveness }
        );
      });
      
      sections.push({
        title: "Weapon Systems",
        entries: weaponEntries
      });
    }

    sections.push({
      title: "Outcome",
      entries: [
        { label: "Damage Dealt", value: this.formatDamageAmount(meta.inflictedDamage) },
        {
          label: "Target Effects",
          value: resolution.defenderDamage?.summary ?? "--"
        },
        {
          label: "Defender Remaining",
          value: `${this.formatReadinessValue(Math.max(0, resolution.defenderRemainingStrength))}%`
        },
        {
          label: "Attacker Remaining",
          value:
            typeof resolution.attackerRemainingStrength === "number"
              ? `${this.formatReadinessValue(Math.max(0, resolution.attackerRemainingStrength))}%`
              : "--"
        },
        {
          label: "Retaliation",
          value: resolution.retaliationOccurred ? this.formatDamageAmount(meta.retaliationDamage) : "None"
        },
        {
          label: "Retaliation Effects",
          value: resolution.retaliationOccurred ? (resolution.retaliationDamage?.summary ?? "--") : "None"
        }
      ]
    });

    return sections;
  }

  /**
   * Retrieves the current player unit stationed on the provided hex so intel queries remain consistent.
   */
  private resolvePlayerUnitSnapshot(hexKey: string, unitId?: string | null): ScenarioUnit | null {
    const parsed = CoordinateSystem.parseHexKey(hexKey);
    if (!parsed) {
      return null;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const engine = this.battleState.ensureGameEngine();
    return engine.getHexStackMembers(axial, "Player")
      .filter((entry) => entry.faction === "Player")
      .find((entry) => !unitId || entry.unitId === unitId)?.unit ?? null;
  }

  private getPlayerStackMembersAtHex(hexKey: string): BattleSelectionStackMember[] {
    const parsed = CoordinateSystem.parseHexKey(hexKey);
    if (!parsed) {
      return [];
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const engine = this.battleState.ensureGameEngine();
    return engine.getHexStackMembers(axial, "Player")
      .filter((entry) => entry.faction === "Player")
      .map((entry) => ({
        unitId: entry.unitId,
        unit: entry.unit,
        isAutomated: entry.isAutomated
      }));
  }

  private resolveSelectedPlayerStackMember(hexKey: string): BattleSelectionStackMember | null {
    const members = this.getPlayerStackMembersAtHex(hexKey);
    if (members.length === 0) {
      this.selectedPlayerUnitId = null;
      return null;
    }

    const matched = this.selectedPlayerUnitId
      ? members.find((member) => member.unitId === this.selectedPlayerUnitId) ?? null
      : null;

    if (this.isInitiativeSystemEnabled && this.initiativeMethods) {
      const queue = this.initiativeMethods.getCurrentInitiativeQueue();
      const activeGroup = this.resolveActiveInitiativeGroup(queue);
      if (activeGroup?.ownerId === "player") {
        if (matched && activeGroup.activations.some((activation) => activation.unitId === matched.unitId)) {
          this.initiativeGroupCursorUnitId = matched.unitId;
          return matched;
        }

        const currentActivation = this.initiativeMethods.getCurrentActivation();
        const activeMember = currentActivation
          ? members.find((member) => member.unitId === currentActivation.unitId) ?? null
          : null;
        if (activeMember) {
          this.selectedPlayerUnitId = activeMember.unitId;
          this.initiativeGroupCursorUnitId = activeMember.unitId;
          return activeMember;
        }
      }
    }
    const preferred = matched
      ?? members.find((member) => !member.isAutomated)
      ?? members[0]
      ?? null;

    this.selectedPlayerUnitId = preferred?.unitId ?? null;
    return preferred;
  }

  private lookupPlayerUnitFuel(hexKey: string, unitId?: string | null): number | null {
    const unit = this.resolvePlayerUnitSnapshot(hexKey, unitId);
    if (!unit) {
      return null;
    }
    const definition = this.unitTypes[unit.type as keyof UnitTypeDictionary];
    if (!definition || definition.moveType === "leg") {
      return null;
    }
    return typeof unit.fuel === "number" ? unit.fuel : null;
  }

  private buildBattleSelectionIntel(
    hexKey: string,
    unit: ScenarioUnit,
    unitLabel: string,
    movementBudget: { max: number; remaining: number } | null,
    statusMessage: string,
    commandState: UnitCommandState | null,
    unitTabs: BattleSelectionIntel["unitTabs"]
  ): BattleSelectionIntel {
    const definition = this.unitTypes[unit.type as keyof UnitTypeDictionary] as UnitTypeDefinition | undefined;
    const canEntrench = this.canUnitDigIn(unit);
    // Build tow state and toggle for artillery units
    const towState = commandState?.towState ?? null;
    const towToggle = this.buildTowToggle(commandState);

    return {
      kind: "battle",
      hexKey,
      terrainName: this.lookupTerrainName(hexKey),
      unitLabel,
      unitStrength: typeof unit.strength === "number" ? unit.strength : null,
      unitAmmo: typeof unit.ammo === "number" ? unit.ammo : null,
      unitFuel: this.lookupPlayerUnitFuel(hexKey, this.selectedPlayerUnitId),
      unitEntrenchment: typeof unit.entrench === "number" ? unit.entrench : null,
      movementRemaining: movementBudget ? movementBudget.remaining : null,
      movementMax: movementBudget ? movementBudget.max : null,
      rangeLabel: this.formatBattleRange(definition),
      facingLabel: commandState?.currentFacing ?? "—",
      canEntrench,
      moveOptions: this.playerMoveHexes.size,
      attackOptions: this.playerAttackHexes.size,
      unitTabs,
      statusMessage,
      statusChips: this.buildBattleIntelStatusChips(unit, commandState),
      actionCards: this.buildBattleIntelActions(hexKey, unit, commandState),
      detailSections: this.buildBattleIntelDetailSections(unit, definition),
      notes: this.buildBattleIntelNotes(unit, commandState),
      towState,
      towToggle
    };
  }

  private buildBattleSelectionUnitTabs(hexKey: string): BattleSelectionIntel["unitTabs"] {
    const members = this.getPlayerStackMembersAtHex(hexKey);
    if (members.length <= 1) {
      return [];
    }

    const baseLabels = members.map((member) => this.resolveUnitLabelForUnit(member.unit) ?? this.toTitleCase(member.unit.type));
    const labelTotals = new Map<string, number>();
    const labelSeen = new Map<string, number>();
    baseLabels.forEach((label) => {
      labelTotals.set(label, (labelTotals.get(label) ?? 0) + 1);
    });

    return members.map((member, index) => {
      const baseLabel = baseLabels[index] ?? this.toTitleCase(member.unit.type);
      const occurrence = (labelSeen.get(baseLabel) ?? 0) + 1;
      labelSeen.set(baseLabel, occurrence);
      const total = labelTotals.get(baseLabel) ?? 1;
      return {
        unitId: member.unitId,
        label: total > 1 ? `${baseLabel} ${occurrence}` : baseLabel,
        detail: this.formatStackUnitTabDetail(member),
        selected: member.unitId === this.selectedPlayerUnitId
      };
    });
  }

  private formatStackUnitTabDetail(member: BattleSelectionStackMember): string {
    if (member.isAutomated) {
      return "Automated convoy";
    }
    return `${Math.round(member.unit.strength)}% strength`;
  }

  private buildBattleIntelStatusChips(unit: ScenarioUnit, commandState: UnitCommandState | null): BattleIntelChip[] {
    const chips: BattleIntelChip[] = [];
    if (commandState) {
      if (commandState.isAutomated) {
        chips.push({ label: "Automated Convoy", tone: "warning" });
      }
      if (commandState.towState === "towed") {
        chips.push({
          label: "Towed",
          tone: "warning",
          action: "deployTow",
          tooltip: "Click to deploy guns for firing. Deployment after movement ends the turn.",
          available: commandState.canDeployTow
        });
      } else if (commandState.towState === "deployed") {
        chips.push({
          label: "Deployed",
          tone: "neutral",
          action: "moveOutTow",
          tooltip: "Click to hook up guns for towing. Spends half movement.",
          available: commandState.canMoveOut
        });
      }
      if (commandState.isOnSentry) {
        chips.push({ label: "On Sentry", tone: "neutral" });
      }
      if (commandState.suppressionState === "broken") {
        chips.push({ label: `Broken x${commandState.suppressorCount}`, tone: "danger" });
      } else if (commandState.suppressionState === "pinned") {
        chips.push({ label: `Pinned x${commandState.suppressorCount}`, tone: "danger" });
      } else if (commandState.suppressionState === "suppressed") {
        chips.push({ label: "Suppressed", tone: "warning" });
      }
      if (commandState.existingHexModifications.length > 0) {
        chips.push({
          label: this.formatHexModificationCollectionLabel(commandState.existingHexModifications),
          tone: commandState.existingHexModifications.some((modification) => modification.type === "tankTraps") ? "warning" : "good"
        });
      }
    }
    if (this.canUnitDigIn(unit) && unit.entrench > 0) {
      chips.push({ label: `Entrench ${unit.entrench}/2`, tone: unit.entrench >= 2 ? "good" : "neutral" });
    }
    if (this.isEngineerBattleUnit(unit)) {
      chips.push({ label: "Engineer", tone: "neutral" });
    }
    return chips;
  }

  private buildBattleIntelActions(hexKey: string, unit: ScenarioUnit, commandState: UnitCommandState | null): BattleIntelAction[] {
    if (!commandState || commandState.isAutomated) {
      return [];
    }

    const actions: BattleIntelAction[] = [];
    if (commandState.towState === "deployed") {
      actions.push({
        id: "moveOutTow",
        label: "Move Out",
        detail: "Hook up the battery for towing. This spends half the unit's movement and switches it to towed status.",
        tone: "mobility",
        available: commandState.canMoveOut,
        reason: commandState.moveOutReason
      });
    } else if (commandState.towState === "towed") {
      actions.push({
        id: "deployTow",
        label: "Deploy",
        detail: "Unlimber the guns for firing. If the unit already spent movement this turn, deployment consumes the rest of the turn.",
        tone: "defense",
        available: commandState.canDeployTow,
        reason: commandState.deployTowReason
      });
    }
    if (this.canUnitObserveArtillery(unit)) {
      const queuedArtillery = this.getQueuedArtilleryForCallerHex(hexKey);
      if (queuedArtillery) {
        actions.push({
          id: "repositionArtillery",
          label: "Reposition Artillery",
          detail: "Cancel the queued fire mission and immediately pick a new observed enemy hex.",
          tone: "denial",
          available: true
        });
      } else {
        const artilleryState = this.resolveArtilleryActionState(unit, commandState, hexKey);
        actions.push({
          id: "callArtillery",
          label: "Call Artillery",
          detail: "Queue an off-map heavy artillery strike on an observed enemy hex. Impact lands during turn transition.",
          tone: "denial",
          available: artilleryState.available,
          reason: artilleryState.reason
        });
      }
    }
    actions.push({
      id: "enterSentry",
      label: "Sentry",
      detail: "Hold in place on alert. If attacked before the next activation and legal return fire exists, both sides fire simultaneously.",
      tone: "defense",
      available: commandState.canEnterSentry,
      reason: commandState.sentryReason
    });
    const consolidation = this.resolveConsolidationActionState(hexKey, unit, commandState);
    if (consolidation.targetUnitId) {
      actions.push({
        id: `consolidate:${consolidation.targetUnitId}`,
        label: "Fold In",
        detail: consolidation.available
          ? `Merge with ${consolidation.targetLabel ?? "matching unit"} into one command at ${consolidation.combinedStrength ?? "?"}% strength. Ammo and fuel are pooled.`
          : "Same-type units may fold together only when the combined strength is 100% or less.",
        tone: "mobility",
        available: consolidation.available,
        reason: consolidation.reason
      });
    }
    if (this.canUnitDigIn(unit)) {
      actions.push({
        id: "digIn",
        label: "Dig In",
        detail: "Gain +1 entrenchment, up to level 2, and end offensive action for this turn.",
        tone: "defense",
        available: commandState.canDigIn,
        reason: commandState.digInReason
      });
    }
    if (commandState.isSmokeCapable) {
      actions.push({
        id: "laySmoke",
        label: "Lay Smoke",
        detail: "Fire close smoke on this hex or an adjacent hex edge. The screen blocks ground line of sight until your next turn. Requires ammo but does not use movement or attacks.",
        tone: "mobility",
        available: commandState.canLaySmoke,
        reason: commandState.smokeReason
      });
    }
    actions.push({
      id: "setFacing",
      label: "Set Facing",
      detail: "Orient the formation toward a chosen hex edge. Facing affects defensive bonuses and retaliation arcs. Cannot reorient after firing.",
      tone: "defense",
      available: commandState.canSetFacing,
      reason: commandState.setFacingReason
    });
    if (commandState.isEngineer) {
      const fortificationsBuild = commandState.buildModificationAvailability.fortifications;
      const tankTrapsBuild = commandState.buildModificationAvailability.tankTraps;
      const clearedPathBuild = commandState.buildModificationAvailability.clearedPath;
      actions.push(
        {
          id: "fortifications",
          label: "Fortify",
          detail: "Build directional defensive works along a chosen hex edge. The engineer must start fresh, and the five-minute build effort consumes the rest of the turn.",
          tone: "defense",
          available: fortificationsBuild.available,
          reason: fortificationsBuild.reason
        },
        {
          id: "tankTraps",
          label: "Lay Tank Traps",
          detail: "Emplace anti-vehicle obstacles along a chosen hex edge. The engineer must start fresh, and the edge work consumes the rest of the turn.",
          tone: "denial",
          available: tankTrapsBuild.available,
          reason: tankTrapsBuild.reason
        },
        {
          id: "clearedPath",
          label: "Clear Path",
          detail: "Cut or widen an internal lane through the hex, improving it up to level 3 until movement approaches road quality. The engineer must start fresh, and each pass consumes the rest of the turn.",
          tone: "mobility",
          available: clearedPathBuild.available,
          reason: clearedPathBuild.reason
        }
      );
    }
    return actions;
  }

  private resolveConsolidationActionState(
    hexKey: string,
    unit: ScenarioUnit,
    commandState: UnitCommandState
  ): { available: boolean; reason: string | null; targetUnitId: string | null; targetLabel: string | null; combinedStrength: number | null } {
    const members = this.getPlayerStackMembersAtHex(hexKey).filter((member) => !member.isAutomated);
    const companion = members.find((member) => member.unitId !== commandState.unitId && member.unit.type === unit.type) ?? null;
    if (!companion) {
      return { available: false, reason: null, targetUnitId: null, targetLabel: null, combinedStrength: null };
    }
    const combinedStrength = Math.round((unit.strength ?? 0) + (companion.unit.strength ?? 0));
    if (combinedStrength > 100) {
      return {
        available: false,
        reason: `Combined strength would be ${combinedStrength}%. Fold-in is capped at 100%.`,
        targetUnitId: companion.unitId,
        targetLabel: this.resolveUnitLabelForUnit(companion.unit) ?? this.toTitleCase(companion.unit.type),
        combinedStrength
      };
    }
    return {
      available: true,
      reason: null,
      targetUnitId: companion.unitId,
      targetLabel: this.resolveUnitLabelForUnit(companion.unit) ?? this.toTitleCase(companion.unit.type),
      combinedStrength
    };
  }

  private buildBattleIntelNotes(unit: ScenarioUnit, commandState: UnitCommandState | null): string[] {
    const notes: string[] = [];
    if (!commandState) {
      return notes;
    }
    if (commandState.suppressionState === "broken") {
      notes.push(`Broken by ${commandState.suppressorCount} enemy suppressors while below 25 readiness. This battalion cannot move or retaliate until the suppression is broken, and assault fire is unavailable.`);
    } else if (commandState.suppressionState === "pinned") {
      notes.push(`Pinned by ${commandState.suppressorCount} enemy suppressors. This battalion cannot move or retaliate until the pin is broken, and assault fire is unavailable.`);
    } else if (commandState.suppressionState === "suppressed") {
      notes.push("Under suppressing fire this turn. The battalion may still move and fire, but it cannot initiate assault fire until the next friendly turn begins.");
    }
    if (commandState.towState === "deployed") {
      notes.push("This battery is deployed for fire. Choose Move Out to limber the guns before towing to a new position.");
    } else if (commandState.towState === "towed") {
      notes.push("This battery is limbered for towing. Deploy it before firing; deploying after movement ends its turn.");
    }
    if (this.canUnitDigIn(unit) && !commandState.canDigIn && commandState.digInReason) {
      notes.push(commandState.digInReason);
    }
    if (commandState.isEngineer && !commandState.canBuildModification && commandState.buildReason) {
      notes.push(commandState.buildReason);
    }
    if (notes.length === 0) {
      if (commandState.isEngineer) {
        notes.push("Engineer companies can fortify, emplace obstacles, or clear lanes without leaving the map view.");
      } else if (this.canUnitDigIn(unit)) {
        notes.push("Dig in before moving or firing to thicken cover and prepare this foot formation for defensive contact.");
      } else {
        notes.push("Use the movement and attack overlays on the map to issue this unit's next order.");
      }
    }
    return notes;
  }

  /**
   * Builds a compact tow toggle for artillery units to show in the intel overlay.
   * Provides a quick one-tap toggle between deployed (firing) and towed (movement) states.
   */
  private buildTowToggle(commandState: UnitCommandState | null): BattleSelectionIntel["towToggle"] {
    if (!commandState?.towState) {
      return null;
    }

    if (commandState.towState === "deployed") {
      return {
        canToggle: commandState.canMoveOut,
        toggleLabel: "🔧 Move Out",
        toggleTooltip: "Hook up guns for towing. Spends half movement. Deployed batteries cannot fire while limbered.",
        toggleAction: "moveOutTow"
      };
    }

    if (commandState.towState === "towed") {
      return {
        canToggle: commandState.canDeployTow,
        toggleLabel: "🎯 Deploy",
        toggleTooltip: "Unlimber guns for firing. Deployment after movement ends the turn.",
        toggleAction: "deployTow"
      };
    }

    return null;
  }

  private buildBattleIntelDetailSections(
    unit: ScenarioUnit,
    definition: UnitTypeDefinition | null | undefined
  ): BattleIntelDetailSection[] {
    if (!definition) {
      return [];
    }

    const sections: BattleIntelDetailSection[] = [];
    sections.push({
      title: "Unit",
      entries: [
        { label: "Class", value: this.formatIntelLabel(definition.class) },
        { label: "Role", value: this.formatIntelLabel(definition.combat.role) },
        { label: "Weight", value: this.formatIntelLabel(definition.combat.weight) },
        { label: "Mobility", value: this.formatIntelLabel(definition.moveType) },
        { label: "Vision", value: `${definition.vision} hex${definition.vision === 1 ? "" : "es"}` },
        { label: "Initiative", value: `${definition.initiative}` },
        { label: "Accuracy", value: `${definition.accuracyBase}%` }
      ]
    });

    sections.push({
      title: "Firepower",
      entries: [
        { label: "Soft Attack", value: `${definition.softAttack}` },
        { label: "Hard Attack", value: `${definition.hardAttack}` },
        { label: "Penetration", value: `${definition.ap}` }
      ]
    });

    sections.push({
      title: "Protection",
      entries: [
        {
          label: "Armor",
          value: `F ${definition.armor.front} / S ${definition.armor.side} / T ${definition.armor.top}`
        },
        { label: "Signature", value: this.formatIntelLabel(definition.combat.signature) }
      ]
    });

    const traitValues = this.buildUnitTraitSummary(unit, definition);
    if (traitValues.length > 0) {
      sections.push({
        title: "Traits",
        entries: [{ label: "Capabilities", value: traitValues.join(" • ") }]
      });
    }

    if (definition.airSupport) {
      sections.push({
        title: "Airframe",
        entries: [
          { label: "Mission Roles", value: definition.airSupport.roles.map((role) => this.formatIntelLabel(role)).join(" • ") },
          { label: "Cruise Speed", value: `${definition.airSupport.cruiseSpeedKph} kph` },
          { label: "Combat Radius", value: `${definition.airSupport.combatRadiusKm} km` },
          { label: "Refit", value: `${definition.airSupport.refitTurns} turn${definition.airSupport.refitTurns === 1 ? "" : "s"}` }
        ]
      });
    }

    return sections;
  }

  private buildUnitTraitSummary(unit: ScenarioUnit, definition: UnitTypeDefinition): string[] {
    const traits = new Set<string>((definition.traits ?? []).map((trait) => this.formatIntelLabel(trait)));
    if (this.isEngineerBattleUnit(unit)) {
      traits.add("Engineer");
    }
    return Array.from(traits);
  }

  private buildBattleActionSummary(
    moveOptions: number,
    attackOptions: number,
    ammoStatusMessage: string | null
  ): string {
    if (moveOptions === 0 && attackOptions === 0) {
      return ammoStatusMessage
        ? " No immediate attack options are available."
        : " This unit has already moved and attacked this turn.";
    }
    if (moveOptions === 0) {
      return ` Unit has moved. ${attackOptions} attack targets available.`;
    }
    if (attackOptions === 0) {
      return ammoStatusMessage
        ? ` ${moveOptions} movement options. No attack options are available until the unit is resupplied.`
        : ` ${moveOptions} movement options. No legal attacks are available from this position.`;
    }
    return ` ${moveOptions} moves, ${attackOptions} targets.`;
  }

  private formatBattleResourceValue(value: number | null): string {
    if (value === null || !Number.isFinite(value)) {
      return "—";
    }
    const safeValue = Math.max(0, value);
    const rounded = Math.round(safeValue);
    if (Math.abs(safeValue - rounded) < 0.005) {
      return String(rounded);
    }
    return safeValue.toFixed(2).replace(/\.?0+$/, "");
  }

  private resolveBattleAttackAmmoCost(definition: UnitTypeDefinition | null | undefined): number {
    if (!definition || definition.moveType === "air") {
      return 0;
    }
    let cost = combat.ammoFuel.attackAmmoCost;
    if (definition.class === "artillery" || (definition.traits ?? []).includes("indirect")) {
      cost += combat.ammoFuel.indirectExtraAmmo;
    }
    return Math.max(1, cost);
  }

  private buildBattleAmmoStatusMessage(unit: ScenarioUnit, definition: UnitTypeDefinition | null | undefined): string | null {
    if (!definition || definition.moveType === "air" || typeof unit.ammo !== "number") {
      return null;
    }
    const currentAmmo = Math.max(0, unit.ammo);
    const requiredAmmo = this.resolveBattleAttackAmmoCost(definition);
    if (requiredAmmo <= 0) {
      return null;
    }
    if (currentAmmo <= 0) {
      return " Out of ammo. This formation can still spot and move, but it cannot attack until it is resupplied.";
    }
    if (currentAmmo + 1e-9 < requiredAmmo) {
      return ` Low ammo. This formation needs ${requiredAmmo.toFixed(0)} ammo to attack but only has ${this.formatBattleResourceValue(currentAmmo)} remaining.`;
    }
    return null;
  }

  private formatBattleRange(definition: UnitTypeDefinition | null | undefined): string {
    if (!definition || definition.rangeMax <= 0) {
      return "—";
    }
    const min = Math.max(1, definition.rangeMin);
    const max = Math.max(min, definition.rangeMax);
    if (min === max) {
      return `${max}`;
    }
    return `${min}-${max}`;
  }

  private formatIntelLabel(value: string): string {
    return value
      .replace(/_/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\b\w/g, (match) => match.toUpperCase());
  }

  private canUnitDigIn(unit: ScenarioUnit): boolean {
    const definition = this.unitTypes[unit.type as keyof UnitTypeDictionary];
    return definition?.moveType === "leg" && ["infantry", "recon", "specialist"].includes(definition?.class ?? "");
  }

  private isEngineerBattleUnit(unit: ScenarioUnit): boolean {
    const definition = this.unitTypes[unit.type as keyof UnitTypeDictionary];
    const traits = (definition?.traits ?? []) as readonly string[];
    return unit.type.toLowerCase().includes("engineer") || traits.includes("engineer");
  }

  private queueTutorialMapClickAfterCamera(key: string): void {
    if (this.tutorialQueuedMapClickTimerId !== null) {
      window.clearTimeout(this.tutorialQueuedMapClickTimerId);
    }

    const queuedPhase = ensureTutorialState().getCurrentPhase();
    const delayMs = Math.max(0, this.tutorialMapInputBlockedUntil - Date.now()) + 16;
    this.tutorialQueuedMapClickTimerId = window.setTimeout(() => {
      this.tutorialQueuedMapClickTimerId = null;
      const progress = ensureTutorialState().getProgress();
      if (!progress.isActive || progress.currentPhase !== queuedPhase) {
        return;
      }

      this.tutorialUserMapClickInProgress = true;
      try {
        this.onPlayerTurnMapClick(key);
        this.completeGuidedTutorialSelectionForClickedHex(key);
      } finally {
        this.tutorialUserMapClickInProgress = false;
      }
    }, delayMs);
  }

  private isReconBikeBattleUnit(unit: ScenarioUnit): boolean {
    const definition = this.unitTypes[unit.type as keyof UnitTypeDictionary];
    const traits = (definition?.traits ?? []) as readonly string[];
    const normalizedType = unit.type.toLowerCase();
    const normalizedLabel = (this.resolveUnitLabelForUnit(unit) ?? "").toLowerCase();
    return (normalizedType.includes("recon") && normalizedType.includes("bike"))
      || normalizedLabel.includes("recon bike")
      || traits.includes("reconBike");
  }

  private isFlakBattleUnit(unit: ScenarioUnit): boolean {
    const definition = this.unitTypes[unit.type as keyof UnitTypeDictionary];
    const traits = (definition?.traits ?? []) as readonly string[];
    return unit.type.toLowerCase().includes("flak")
      || (traits.includes("intercept") && definition?.moveType !== "air");
  }

  private describeHexModification(type: HexModificationType): string {
    switch (type) {
      case "fortifications":
        return "fortifications";
      case "tankTraps":
        return "tank traps";
      case "clearedPath":
        return "a cleared path";
      case "smoke":
        return "a smoke screen";
      default:
        return "fortifications";
    }
  }

  private normalizeFortificationEdgeFacing(facing: HexEdgeFacing | string | null | undefined): HexEdgeFacing | null {
    switch (facing) {
      case "NW":
      case "NE":
      case "E":
      case "SE":
      case "SW":
      case "W":
        return facing;
      default:
        return null;
    }
  }

  private describeHexModificationPlacement(modification: HexModification): string {
    const facing = this.normalizeFortificationEdgeFacing(modification.facing);
    if ((modification.type === "fortifications" || modification.type === "tankTraps") && facing) {
      return `${this.describeHexModification(modification.type)} on the ${facing} edge`;
    }
    if (modification.type === "clearedPath") {
      const level = Math.max(1, modification.level ?? 1);
      return level > 1 ? `a cleared path (level ${level})` : "a cleared path";
    }
    return this.describeHexModification(modification.type);
  }

  private describeHexModificationCollection(modifications: readonly HexModification[]): string {
    const fortifications = modifications.filter((modification) => modification.type === "fortifications");
    const tankTraps = modifications.filter((modification) => modification.type === "tankTraps");
    const others = modifications.filter((modification) => modification.type !== "fortifications" && modification.type !== "tankTraps");
    const parts: string[] = [];

    if (fortifications.length === 1) {
      parts.push(this.describeHexModificationPlacement(fortifications[0]!));
    } else if (fortifications.length > 1) {
      parts.push(`fortifications on ${fortifications.length} edges`);
    }
    if (tankTraps.length === 1) {
      parts.push(this.describeHexModificationPlacement(tankTraps[0]!));
    } else if (tankTraps.length > 1) {
      parts.push(`tank traps on ${tankTraps.length} edges`);
    }
    others.forEach((modification) => parts.push(this.describeHexModificationPlacement(modification)));
    return parts.join(" and ");
  }

  private formatHexModificationLabel(modification: HexModification): string {
    const facing = this.normalizeFortificationEdgeFacing(modification.facing);
    if ((modification.type === "fortifications" || modification.type === "tankTraps") && facing) {
      return `${this.toTitleCase(this.describeHexModification(modification.type))} ${facing}`;
    }
    if (modification.type === "clearedPath") {
      return `Clear Path ${Math.max(1, modification.level ?? 1)}/3`;
    }
    return this.toTitleCase(this.describeHexModification(modification.type));
  }

  private formatHexModificationCollectionLabel(modifications: readonly HexModification[]): string {
    const fortifications = modifications.filter((modification) => modification.type === "fortifications");
    const tankTraps = modifications.filter((modification) => modification.type === "tankTraps");
    const others = modifications.filter((modification) => modification.type !== "fortifications" && modification.type !== "tankTraps");
    if (fortifications.length > 1 && tankTraps.length === 0 && others.length === 0) {
      return `Fortifications ${fortifications.length}/6`;
    }
    if (tankTraps.length > 1 && fortifications.length === 0 && others.length === 0) {
      return `Tank Traps ${tankTraps.length}/6`;
    }
    if (fortifications.length === 1 && tankTraps.length === 0 && others.length === 0) {
      return this.formatHexModificationLabel(fortifications[0]!);
    }
    if (tankTraps.length === 1 && fortifications.length === 0 && others.length === 0) {
      return this.formatHexModificationLabel(tankTraps[0]!);
    }
    return modifications.map((modification) => this.formatHexModificationLabel(modification)).join(" • ");
  }

  private parseHexModificationAction(actionId: string): HexModificationType | null {
    switch (actionId) {
      case "fortifications":
      case "tankTraps":
      case "clearedPath":
        return actionId;
      default:
        return null;
    }
  }

  private resolveUnitLabel(unitKey: string): string {
    const deploymentState = ensureDeploymentState();
    const entry = this.findPoolEntry(unitKey, deploymentState.pool);
    if (entry) {
      return entry.label;
    }
    const reserve = deploymentState.getReserves().find((snapshot) => snapshot.unitKey === unitKey);
    return reserve?.label ?? unitKey;
  }

  /**
   * Derives the human-readable label for a unit occupying the given hex.
   * Enforces the "no fallbacks" rule by throwing when the scenario type lacks a registered unit key alias.
   */
  private resolveUnitLabelForHex(hexKey: string, unitId?: string | null): string | null {
    const unit = this.resolvePlayerUnitSnapshot(hexKey, unitId);
    return unit ? this.resolveUnitLabelForUnit(unit) : null;
  }

  private resolveUnitLabelForUnit(unit: ScenarioUnit): string | null {
    const scenarioType = unit.type as string;
    const deploymentState = ensureDeploymentState();
    const unitKey = deploymentState.getUnitKeyForScenarioType(scenarioType);
    if (!unitKey) {
      const error = new Error(`[BattleScreen] Missing unit key alias for scenario type '${scenarioType}'.`);
      console.error(error);
      throw error;
    }
    return this.resolveUnitLabel(unitKey);
  }

  private findPoolEntry(key: string, pool: DeploymentPoolEntry[]): DeploymentPoolEntry | undefined {
    return pool.find((entry) => entry.key === key);
  }

  private composeZoneCapacityMessage(hexKey: string, deploymentState: DeploymentState): string {
    const zoneKey = deploymentState.getZoneKeyForHex(hexKey);
    if (!zoneKey) {
      return "";
    }
    const remaining = deploymentState.getRemainingZoneCapacity(zoneKey);
    const definition = deploymentState.getZoneDefinition(zoneKey);
    if (remaining === null || !definition) {
      return "Deployment zone capacity syncing.";
    }
    const name = definition.name ?? zoneKey;
    return `${remaining} slots remaining in ${name}.`;
  }

  private getPlayerDeploymentZoneHexes(): string[] {
    const deploymentState = ensureDeploymentState();
    return deploymentState.getZoneUsageSummaries()
      .filter((zone) => zone.faction === "Player")
      .flatMap((zone) => deploymentState.getZoneHexes(zone.zoneKey));
  }

  private resolvePlayerDeploymentSelection(hexKey: string): {
    zoneKey: string | null;
    zoneLabel: string | null;
    zoneHexes: readonly string[];
    remainingCapacity: number | null;
    totalCapacity: number | null;
  } {
    const deploymentState = ensureDeploymentState();
    const zoneKey = deploymentState.getZoneKeyForHex(hexKey);
    if (!zoneKey) {
      return {
        zoneKey: null,
        zoneLabel: null,
        zoneHexes: [],
        remainingCapacity: null,
        totalCapacity: null
      };
    }
    const definition = deploymentState.getZoneDefinition(zoneKey);
    if (!definition || definition.faction !== "Player") {
      return {
        zoneKey: null,
        zoneLabel: null,
        zoneHexes: [],
        remainingCapacity: null,
        totalCapacity: null
      };
    }
    return {
      zoneKey,
      zoneLabel: definition.name ?? this.toTitleCase(zoneKey),
      zoneHexes: deploymentState.getZoneHexes(zoneKey),
      remainingCapacity: deploymentState.getRemainingZoneCapacity(zoneKey),
      totalCapacity: definition.capacity
    };
  }

  private syncBaseCampAssignButton(phase: TurnSummary["phase"], hasValidPlayerDeploymentHex: boolean): void {
    if (!this.baseCampAssignButton) {
      return;
    }
    const enabled = phase === "deployment" && hasValidPlayerDeploymentHex;
    this.baseCampAssignButton.disabled = !enabled;
    if (enabled) {
      this.baseCampAssignButton.removeAttribute("aria-disabled");
      return;
    }
    this.baseCampAssignButton.setAttribute("aria-disabled", "true");
  }

  private cloneScenario(): ScenarioData {
    return this.deepCloneValue(this.scenario);
  }

  private cloneUnitTypes(): UnitTypeDictionary {
    return this.deepCloneValue(this.unitTypes);
  }

  private cloneTerrain(): TerrainDictionary {
    return this.deepCloneValue(this.terrain);
  }

  private cloneScenarioSide(side: ScenarioSide): ScenarioSide {
    return this.deepCloneValue(side);
  }

  /**
   * Clears any previously rendered unit icons and redraws them based on the current engine state.
   */
  /**
   * Renders engine unit icons after clearing previous sprites. Uses sprite overrides from DeploymentState
   * so map icons match loadout/reserve lists.
   */
  private renderEngineUnits(): void {
    if (!this.hexMapRenderer || !this.battleState.hasEngine()) {
      return;
    }

    const renderer = this.hexMapRenderer;
    this.clearAllUnitIcons();
    if (renderer.clearDebugMarkers) {
      renderer.clearDebugMarkers();
    }
    if (typeof renderer.clearAllHexModifications === "function") {
      renderer.clearAllHexModifications();
    }

    const engine = this.battleState.ensureGameEngine();
    if (typeof renderer.renderHexModifications === "function" || typeof renderer.renderHexModification === "function") {
      const modificationsByHex = new Map<string, HexModification[]>();
      engine.getHexModificationSnapshots().forEach((modification) => {
        const { col, row } = CoordinateSystem.axialToOffset(modification.hex.q, modification.hex.r);
        const hexKey = CoordinateSystem.makeHexKey(col, row);
        const bucket = modificationsByHex.get(hexKey) ?? [];
        bucket.push(modification);
        modificationsByHex.set(hexKey, bucket);
      });
      modificationsByHex.forEach((modifications, hexKey) => {
        if (typeof renderer.renderHexModifications === "function") {
          renderer.renderHexModifications(hexKey, modifications);
        } else {
          modifications.forEach((modification) => renderer.renderHexModification?.(hexKey, modification));
        }
      });
    }
    const renderStack = (
      hexKey: string,
      members: Array<{ unit: ScenarioUnit; faction: "Player" | "Bot" | "Ally"; reconStatus?: EnemyContactSnapshot["state"] | boolean }>
    ): void => {
      if (typeof renderer.renderUnitStack === "function") {
        renderer.renderUnitStack(hexKey, members);
        return;
      }
      const primary = members[0];
      if (primary) {
        renderer.renderUnit(hexKey, primary.unit, primary.faction, primary.reconStatus ?? "visible");
      }
    };

    const friendlyHexes = new Map<string, Axial>();
    [...(engine.playerUnits ?? []), ...(engine.allyUnits ?? [])].forEach((unit) => {
      const def = this.unitTypes[unit.type as keyof UnitTypeDictionary];
      if (def?.moveType === "air") {
        return;
      }
      if (!unit.hex || !Number.isFinite(unit.hex.q) || !Number.isFinite(unit.hex.r)) {
        return;
      }
      friendlyHexes.set(`${unit.hex.q},${unit.hex.r}`, unit.hex);
    });

    friendlyHexes.forEach((hex) => {
      const stackMembers = engine
        .getHexStackMembers(hex, "Player")
        .filter((entry) => {
          const def = this.unitTypes[entry.unit.type as keyof UnitTypeDictionary];
          return def?.moveType !== "air";
        })
        .map((entry) => ({
          unit: entry.unit,
          faction: entry.faction === "Ally" ? "Ally" as const : "Player" as const
        }));
      if (stackMembers.length === 0) {
        return;
      }
      const { col, row } = CoordinateSystem.axialToOffset(hex.q, hex.r);
      const hexKey = CoordinateSystem.makeHexKey(col, row);
      renderStack(hexKey, stackMembers);

      if (this.debugPlacementOverlayEnabled && typeof renderer.renderDebugMarker === "function") {
        const hasPlayer = stackMembers.some((entry) => entry.faction === "Player");
        renderer.renderDebugMarker(hexKey, {
          label: hasPlayer ? "P" : "A",
          color: hasPlayer ? "#1890ff" : "#52c41a",
          opacity: hasPlayer ? 0.55 : 0.5
        });
      }
    });

    const enemyContacts =
      typeof (engine as { getEnemyContactSnapshot?: () => EnemyContactSnapshot[] }).getEnemyContactSnapshot === "function"
        ? engine.getEnemyContactSnapshot()
        : (engine.botUnits ?? []).map((unit) => ({
            unitId: unit.unitId ?? `${unit.type}@${unit.hex.q},${unit.hex.r}`,
            hex: { ...unit.hex },
            state: "visible" as const,
            lastSeenTurn: engine.turnNumber ?? 0,
            source: "Legacy Visibility",
            unitType: unit.type,
            strengthEstimate: unit.strength
          }));

    const enemyStacks = new Map<string, Array<{ unit: ScenarioUnit; faction: "Bot"; reconStatus: EnemyContactSnapshot["state"] }>>();
    enemyContacts.forEach((contact) => {
      const friendlyOccupiesHex = friendlyHexes.has(`${contact.hex.q},${contact.hex.r}`);
      if (friendlyOccupiesHex) {
        return;
      }
      const renderUnit = this.buildEnemyContactRenderUnit(contact, engine.botUnits ?? []);
      if (!renderUnit) {
        return;
      }
      const def = this.unitTypes[renderUnit.type as keyof UnitTypeDictionary];
      if (def?.moveType === "air") {
        return;
      }
      const { col, row } = CoordinateSystem.axialToOffset(contact.hex.q, contact.hex.r);
      const hexKey = CoordinateSystem.makeHexKey(col, row);
      const bucket = enemyStacks.get(hexKey) ?? [];
      bucket.push({ unit: renderUnit, faction: "Bot", reconStatus: contact.state });
      enemyStacks.set(hexKey, bucket);
    });

    enemyStacks.forEach((members, hexKey) => {
      renderStack(hexKey, members);

      if (this.debugPlacementOverlayEnabled && typeof renderer.renderDebugMarker === "function") {
        renderer.renderDebugMarker(hexKey, {
          label: "B",
          color: "#fa541c",
          opacity: members.some((entry) => entry.reconStatus === "visible") ? 0.5 : 0.35
        });
      }
    });

    // Fallback debug markers if the engine reports no units (diagnostic only).
    if (this.debugPlacementOverlayEnabled && typeof renderer.renderDebugMarker === "function") {
      if (engine.playerUnits.length === 0) {
        this.scenario.sides.Player.units.forEach((unit) => {
          const { col, row } = CoordinateSystem.axialToOffset(unit.hex.q, unit.hex.r);
          const hexKey = CoordinateSystem.makeHexKey(col, row);
          renderer.renderDebugMarker(hexKey, { label: "P?", color: "#40a9ff", opacity: 0.35 });
        });
      }
      if (engine.botUnits.length === 0) {
        this.scenario.sides.Bot.units.forEach((unit) => {
          const { col, row } = CoordinateSystem.axialToOffset(unit.hex.q, unit.hex.r);
          const hexKey = CoordinateSystem.makeHexKey(col, row);
          renderer.renderDebugMarker(hexKey, { label: "B?", color: "#ff7a45", opacity: 0.35 });
        });
      }
    }

    // Ensure idle formations retain their blue outline after sprite redraws.
    this.refreshIdleUnitHighlights();
    if (this.isInitiativeSystemEnabled) {
      this.highlightCurrentInitiativeGroup();
    }
    this.syncQueuedTargetMarkers();
  }

  private buildEnemyContactRenderUnit(contact: EnemyContactSnapshot, liveUnits: readonly ScenarioUnit[]): ScenarioUnit | null {
    const liveUnit = liveUnits.find((candidate) => candidate.unitId === contact.unitId) ?? null;
    const scenarioType = (contact.unitType ?? liveUnit?.type ?? ("Recon_Bike" as ScenarioUnit["type"])) as ScenarioUnit["type"];
    const definition = this.unitTypes[scenarioType as keyof UnitTypeDictionary];
    if (definition?.moveType === "air") {
      return null;
    }

    const suppressedBy = liveUnit?.suppressedBy ? [...liveUnit.suppressedBy] : undefined;

    return {
      type: scenarioType,
      hex: { ...contact.hex },
      strength: this.normalizeContactStrengthEstimate(contact, liveUnit),
      experience: liveUnit?.experience ?? 0,
      ammo: liveUnit?.ammo ?? 0,
      fuel: liveUnit?.fuel ?? 0,
      entrench: liveUnit?.entrench ?? 0,
      facing: liveUnit?.facing ?? "SE",
      unitId: contact.unitId,
      suppressedBy
    };
  }

  private normalizeContactStrengthEstimate(contact: EnemyContactSnapshot, liveUnit: ScenarioUnit | null): number {
    if (contact.state === "spotted") {
      return 25;
    }
    const estimate = contact.strengthEstimate ?? liveUnit?.strength ?? 75;
    return Math.min(100, Math.max(25, Math.round(estimate / 25) * 25));
  }

  private findEnemyContactAtHex(axial: Axial): EnemyContactSnapshot | null {
    const engine = this.battleState.ensureGameEngine();
    const contacts =
      typeof (engine as { getEnemyContactSnapshot?: () => EnemyContactSnapshot[] }).getEnemyContactSnapshot === "function"
        ? engine.getEnemyContactSnapshot()
        : [];
    return contacts.find((contact) => contact.hex.q === axial.q && contact.hex.r === axial.r) ?? null;
  }

  private describeEnemyContact(contact: EnemyContactSnapshot): string {
    const label = this.formatScenarioUnitTypeLabel(contact.unitType ?? "Enemy Unit");
    const strength = Math.max(0, Math.round(contact.strengthEstimate ?? 0));
    return `${label} at ${strength}% strength`;
  }

  private formatScenarioUnitTypeLabel(unitType: string): string {
    return unitType
      .replace(/_/g, " ")
      .replace(/\b\w/g, (segment) => segment.toUpperCase());
  }

  private clampDisplayedDamage(value: number): number {
    return Math.min(100, Math.max(0, value));
  }

  /**
   * Removes unit icons from every hex so subsequent renders accurately reflect deployment changes.
   */
  private clearAllUnitIcons(): void {
    if (!this.hexMapRenderer) {
      return;
    }

    this.scenario.tiles.forEach((row, rowIndex) => {
      row.forEach((_, columnIndex) => {
        const hexKey = CoordinateSystem.makeHexKey(columnIndex, rowIndex);
        this.hexMapRenderer?.clearUnit(hexKey);
      });
    });
  }

  /**
   * Normalizes the scenario JSON source into the strongly typed structure required by the engine.
   */
  private refreshScenario(): void {
    const missionKey = this.uiState?.selectedMission ?? "training";
    this.scenarioSource = getScenarioByMissionKey(missionKey);
    if (missionKey === "patrol_river_watch") {
      const sourceName = (this.scenarioSource as { name?: string }).name;
      if (sourceName !== "River Crossing Watch") {
        const message = "River Crossing Watch scenario failed to load; expected river map, got " + (sourceName ?? "unknown");
        console.error(message);
        throw new Error(message);
      }
    }
    this.scenario = this.buildScenarioData();

    // Initialize objective hex keys for visual highlighting
    this.objectiveHexKeys.clear();
    if (this.scenario.objectives) {
      for (const objective of this.scenario.objectives) {
        this.objectiveHexKeys.add(`${objective.hex.q},${objective.hex.r}`);
      }
    }

    this.missionRulesController = createMissionRulesController(missionKey, this.scenario, this.uiState?.selectedDifficulty ?? "Normal");
    this.missionStatus = this.missionRulesController.getStatus();
    this.lastMissionPhaseId = this.missionStatus.phase?.id ?? null;
    this.missionEndPrompted = false;
    this.disposeMissionEndModal();

    // Setup objective cycling handler
    this.setupObjectiveCycling();
  }

  private resetMissionDerivedUiState(): void {
    if (this.tutorialQueuedMapClickTimerId !== null) {
      window.clearTimeout(this.tutorialQueuedMapClickTimerId);
      this.tutorialQueuedMapClickTimerId = null;
    }
    this.teardownInitiativeSystemUi();
    this.hideAttackDialog();
    this.pendingAttack = null;
    this.attackConfirmationLocked = false;
    this.missionRulesController = null;
    this.missionStatus = null;
    this.lastMissionPhaseId = null;
    this.missionEndPrompted = false;
    this.selectedHexKey = null;
    this.selectedPlayerUnitId = null;
    this.defaultSelectionKey = null;
    this.playerMoveHexes.clear();
    this.playerAttackHexes.clear();
    this.pendingIdleTurnAdvance = null;
    this.lastFocusedHexKey = null;
    this.lastViewportTransform = null;
    this.lastAnnouncement = null;
    this.ensureDetailedAirCombatTurnUnitKeys().clear();
    this.publishSelectionIntel(null);
    this.activityEvents.length = 0;
    this.activityEventSequence = 0;
    this.battleActivityLog?.sync(this.activityEvents);
    if (this.idleUnitHighlightKeys.size > 0) {
      this.hexMapRenderer?.clearIdleUnitHighlights();
      this.idleUnitHighlightKeys.clear();
    }
    this.clearAirPreviewOverlay();
    this.hexMapRenderer?.toggleSelectionGlow(false);
    this.hexMapRenderer?.setZoneHighlights([]);
    this.hexMapRenderer?.clearTacticalHighlights();
    this.hexMapRenderer?.renderBaseCampMarker(null);
    this.hexMapRenderer?.clearObjectiveMarkers();
    if (this.battleAnnouncements) {
      this.battleAnnouncements.textContent = "";
    }
    if (this.baseCampStatus) {
      this.baseCampStatus.removeAttribute("aria-live");
      this.baseCampStatus.textContent = "No hex selected.";
    }
    this.endMissionButton?.classList.remove("battle-button--highlight");
    this.deploymentPanel?.resetScenarioState();
    this.disposeMissionEndModal();
    
    // Update UI to show mission has reset
    setMissionStartedUI(false);
  }

  private buildScenarioData(): ScenarioData {
    const missionKey = this.uiState?.selectedMission ?? "training";
    return normalizeScenarioSource(
      this.deepCloneValue(this.scenarioSource) as RawScenarioInput,
      { turnLimit: getMissionTurnLimit(missionKey, this.uiState?.selectedDifficulty ?? "Normal") }
    );
  }

  /**
   * Provides a defensive copy of the unit type dictionary so downstream systems remain immutable.
   */
  private buildUnitTypeDictionary(): UnitTypeDictionary {
    return this.deepCloneValue(unitTypesSource) as UnitTypeDictionary;
  }

  /**
   * Provides a defensive copy of terrain definitions referenced by the renderer and engine.
   */
  private buildTerrainDictionary(): TerrainDictionary {
    return this.deepCloneValue(terrainSource) as TerrainDictionary;
  }

  /**
   * Normalizes tile instance overrides so recon and density adjustments flow through correctly.
   * Used by non-scenario-load paths (e.g. dynamic deployment state merges).
   */
  private normalizeTileInstance(entry: { tile: string; recon?: string; density?: string; features?: string[] }): TileInstance {
    return {
      tile: entry.tile,
      recon: entry.recon as ReconStatus | undefined,
      density: entry.density as TerrainDensity | undefined,
      features: entry.features?.map((feature) => feature as TerrainFeature)
    } satisfies TileInstance;
  }

  /**
   * Adapts [q, r] tuples from JSON into the Axial structure shared across engine modules.
   * Scenario JSON encodes hexes as offset coordinates [col, row]; convert to axial for engine/rendering.
   */
  private tupleToAxial(coord: [number, number] | Axial): Axial {
    if (Array.isArray(coord)) {
      const [col, row] = coord;
      return CoordinateSystem.offsetToAxial(Number(col ?? 0), Number(row ?? 0));
    }
    return coord;
  }

  /**
   * Wraps structuredClone for browsers that do not expose it yet.
   */
  private deepCloneValue<T>(value: T): T {
    const cloneFn = (globalThis as { structuredClone?: <U>(input: U) => U }).structuredClone;
    if (cloneFn) {
      return cloneFn(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
