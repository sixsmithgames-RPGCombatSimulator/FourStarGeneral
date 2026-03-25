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
  type UnitCommandState,
  type EnemyContactSnapshot,
  type TurnFaction,
  type AirMissionArrival,
  type AirEngagementEvent,
  type SupportImpactEvent,
  type SupportAssetSnapshot
} from "../../game/GameEngine";
import type { CombatPreview, AttackResolution } from "../../game/GameEngine";
import type {
  Axial,
  ReconStatus,
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  ScenarioDeploymentZone,
  TerrainDensity,
  TerrainDictionary,
  TerrainFeature,
  TerrainKey,
  TerrainType,
  TileDefinition,
  TileInstance,
  TilePalette,
  UnitClass,
  UnitTypeDictionary,
  CombatStance,
  HexModificationType
} from "../../core/types";
import { HexMapRenderer, type BattleTargetMarker } from "../../rendering/HexMapRenderer";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { MapViewport } from "../controls/MapViewport";
import { ZoomPanControls } from "../controls/ZoomPanControls";
import { DeploymentPanel, type DeploymentPanelCriticalError, type SelectedHexContext } from "../components/DeploymentPanel";
import { BattleLoadout } from "../components/BattleLoadout";
import { ReserveListPresenter } from "../components/BattleReserves";
import { hexDistance } from "../../core/Hex";
import { SelectionIntelOverlay } from "../announcements/SelectionIntelOverlay";
import { BattleActivityLog } from "../announcements/BattleActivityLog";
import type {
  ActivityDetailSection,
  BattleIntelAction,
  BattleIntelChip,
  BattleSelectionIntel,
  DeploymentSelectionIntel,
  SelectionIntel,
  TerrainSelectionIntel
} from "../announcements/AnnouncementTypes";
import { ensureCampaignState } from "../../state/CampaignState";
import { ensureTutorialState, type TutorialPhase } from "../../state/TutorialState";
import { getNextPhase } from "../../data/tutorialSteps";
import {
  ensureDeploymentState,
  type DeploymentPoolEntry,
  type DeploymentState,
  type ReserveBlueprint
} from "../../state/DeploymentState";
import type { UIState } from "../../state/UIState";
import { getScenarioByMissionKey, type ScenarioSource } from "../../data/scenarioRegistry";
import { getMissionDeploymentProfile, getMissionTurnLimit } from "../../data/missions";
import terrainSource from "../../data/terrain.json";
import unitTypesSource from "../../data/unitTypes.json";
import { createMissionRulesController, type MissionPhaseStatus, type MissionRulesController, type MissionStatus } from "../../state/missionRules";
import { finalizeDeploymentZone } from "../utils/deploymentZonePlanner";
import { setMissionStartedUI } from "../utils/missionUi";

type ActivityCategory = "player" | "enemy" | "system";
type ActivityType = "attack" | "move" | "deployment" | "supply" | "turn" | "log";

/**
 * Represents a battle log line destined for the sidebar activity feed so commanders can review past actions.
 */
interface PendingAttackContext {
  readonly attacker: string;
  readonly target: string;
  readonly preview: CombatPreview | null;
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
  private battleUpdateUnsubscribe: (() => void) | null = null;
  private missionRulesController: MissionRulesController | null = null;
  private missionStatus: MissionStatus | null = null;
  private lastMissionPhaseId: MissionPhaseStatus["id"] | null = null;
  private missionEndPrompted = false;
  private missionEndModal: HTMLElement | null = null;
  private static readonly BOT_MOVE_ANIMATION_MS = 500;
  private static readonly BOT_CAMERA_PADDING = 96;
  private static readonly ACTIVITY_EVENT_LIMIT = 120;

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
  private seenAirReportIds: Set<string> = new Set();
  private artilleryPreviewKeys: Set<string> = new Set();
  private readonly queuedTargetMarkerActions = new Map<string, QueuedTargetMarkerAction>();
  private artilleryTargetingState: {
    callerHexKey: string;
    callerLabel: string;
    assetId: string;
    targetHexKeys: Set<string>;
  } | null = null;

  private beginBattleButton: HTMLButtonElement | null = null;
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
  private missionTitleElement: HTMLElement | null = null;
  private missionBriefingElement: HTMLElement | null = null;
  private missionObjectivesList: HTMLUListElement | null = null;
  private missionDoctrineElement: HTMLElement | null = null;
  private missionTurnLimitElement: HTMLElement | null = null;
  private missionSuppliesList: HTMLUListElement | null = null;
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

  // Hex selection state
  private selectedHexKey: string | null = null;
  private playerMoveHexes: Set<string> = new Set();
  private playerAttackHexes: Set<string> = new Set();
  private pendingAttack: PendingAttackContext | null = null;
  private idleUnitHighlightKeys: Set<string> = new Set();
  private objectiveHexKeys: Set<string> = new Set();
  private currentObjectiveIndex = 0;
  // Tracks focus management for the attack confirmation dialog so keyboard users remain within the modal context.
  private attackDialogPreviouslyFocused: HTMLElement | null = null;
  private attackDialogKeydownHandler: (event: KeyboardEvent) => void;
  // Prevents double-submitting the confirmation dialog via rapid key presses or overlapping handlers.
  private attackConfirmationLocked = false;

  /**
   * Prepares and displays the attack confirmation dialog so the commander can approve or cancel combat resolution.
   * Stores the pending attacker/target hexes to be replayed once the user confirms.
   */
  private promptAttackConfirmation(attacker: Axial, defender: Axial, options: { preserveStance?: boolean } = {}): void {
    if (!this.attackConfirmDialog || !this.attackConfirmBody) {
      console.warn("Attack confirmation dialog not available in DOM; executing attack immediately.");
      void this.executePendingAttack(attacker, defender);
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

    // Get combat preview to show detailed attack odds
    const engine = this.battleState.ensureGameEngine();
    const attackerUnit = engine
      .getPlayerPlacementsSnapshot()
      .find((unit) => unit.hex.q === attacker.q && unit.hex.r === attacker.r) ?? null;
    const commandState = attackerUnit ? engine.getUnitCommandState(attacker) : null;
    const supportsStances = attackerUnit ? this.canUnitUseCombatStances(attackerUnit) : false;
    const assaultAvailable = attackerUnit ? this.canUnitAssault(attackerUnit, commandState) : false;

    if (!supportsStances) {
      this.currentAttackStance = null;
    } else if (
      !options.preserveStance ||
      this.currentAttackStance === null ||
      (this.currentAttackStance === "assault" && !assaultAvailable)
    ) {
      this.currentAttackStance = "suppressive";
    }

    const preview = engine.previewAttack(attacker, defender, this.currentAttackStance ?? undefined);

    this.pendingAttack = {
      attacker: attackerHex,
      target: defenderHex,
      preview
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
      this.configureAttackStanceControls(attackerUnit, commandState);
      this.showAttackDialog();
      return;
    }

    const detailsExpanded = this.attackConfirmBody.querySelector<HTMLDetailsElement>(".attack-preview-details")?.open ?? false;

    const attackerType = preview.attacker.type;
    const defenderType = preview.defender.type;
    const attackerDef = this.unitTypes?.[attackerType];
    const attackerLabel = this.toTitleCase(attackerType);
    const defenderLabel = this.toTitleCase(defenderType);

    const accuracyDetails = preview.result.accuracyBreakdown;
    const damageDetails = preview.result.damageBreakdown;
    const commanderStats = preview.commander;

    const finalAccuracyPercent = accuracyDetails.final;
    const baseAccuracyPercent = accuracyDetails.baseRange;
    const experienceAccuracyDelta = accuracyDetails.experienceBonus;
    const commanderAccuracyScalar = accuracyDetails.commanderScalar;
    const baseWithCommander = accuracyDetails.baseWithCommander;
    const experienceWithCommander = accuracyDetails.experienceWithCommander;
    const combinedAfterCommander = accuracyDetails.combinedAfterCommander;
    const terrainModifier = accuracyDetails.terrainModifier;
    const terrainMultiplier = accuracyDetails.terrainMultiplier;
    const afterTerrain = accuracyDetails.afterTerrain;
    const spottedMultiplier = accuracyDetails.spottedMultiplier;
    const finalPreClamp = accuracyDetails.finalPreClamp;

    const shots = preview.result.shots;
    const expectedHits = preview.result.expectedHits.toFixed(1);
    const effectiveAP = Math.round(preview.result.effectiveAP);
    const facingArmor = Math.round(preview.result.facingArmor);
    const attackerStrength = Math.round(preview.attacker.strength);
    const defenderStrength = Math.round(preview.defender.strength);

    const baseDamagePerHit = damageDetails.baseTableValue;
    const experienceScalar = damageDetails.experienceScalar;
    const preCommanderDamagePerHit = damageDetails.afterExperience;
    const commanderDamageScalar = damageDetails.commanderScalar;
    const prePayloadDamagePerHit = damageDetails.final;
    const postPayloadDamagePerHit = preview.finalDamagePerHit;
    const damagePerHitSummary = `${prePayloadDamagePerHit.toFixed(3)}% -> ${postPayloadDamagePerHit.toFixed(3)}%`;

    const baseExpectedDamage = preview.result.expectedDamage;
    const postPayloadExpectedDamage = preview.finalExpectedDamage;
    const baseExpectedSuppression = preview.result.expectedSuppression;
    const postPayloadExpectedSuppression = preview.finalExpectedSuppression;
    const expectedDamageSummary = `${baseExpectedDamage.toFixed(1)}% -> ${postPayloadExpectedDamage.toFixed(1)}%`;
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

    const terrainDeltaText = `${terrainModifier >= 0 ? "+" : ""}${terrainModifier.toFixed(1)}%`;
    const accuracyBreakdownLine =
      `Base ${baseAccuracyPercent.toFixed(1)}% x Cmd x${commanderAccuracyScalar.toFixed(2)} = ${baseWithCommander.toFixed(1)}%, ` +
      `Exp ${experienceAccuracyDelta.toFixed(1)}% x Cmd x${commanderAccuracyScalar.toFixed(2)} = ${experienceWithCommander.toFixed(1)}%, ` +
      `Sum ${combinedAfterCommander.toFixed(1)}% x Terrain ${terrainMultiplier.toFixed(2)} (${terrainDeltaText}) = ${afterTerrain.toFixed(1)}% x Spot ${spottedMultiplier.toFixed(2)} = ${finalPreClamp.toFixed(1)}% -> Final ${accuracyDetails.final.toFixed(1)}%`;

    const damageBreakdownLine =
      `Table ${baseDamagePerHit.toFixed(3)}% x Exp x${experienceScalar.toFixed(2)} = ${preCommanderDamagePerHit.toFixed(3)}% x Cmd x${commanderDamageScalar.toFixed(2)} = ${prePayloadDamagePerHit.toFixed(3)}%`;

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
    const projectedDefenderStrength = Math.max(0, defenderStrength - postPayloadExpectedDamage);
    const projectedAttackerStrength = Math.max(0, attackerStrength - preview.expectedRetaliation);

    const accuracyToneClass = roundedAccuracy >= 75
      ? "attack-preview-outcome__value--good"
      : roundedAccuracy >= 50
        ? "attack-preview-outcome__value--warning"
        : "attack-preview-outcome__value--danger";
    const defenderDamageToneClass = postPayloadExpectedDamage >= 20
      ? "attack-preview-outcome__value--good"
      : postPayloadExpectedDamage >= 8
        ? "attack-preview-outcome__value--warning"
        : "attack-preview-outcome__value--neutral";
    const retaliationToneClass = !preview.retaliationPossible
      ? "attack-preview-outcome__value--muted"
      : preview.expectedRetaliation >= 15
        ? "attack-preview-outcome__value--danger"
        : preview.expectedRetaliation >= 6
          ? "attack-preview-outcome__value--warning"
          : "attack-preview-outcome__value--neutral";
    const retaliationValue = preview.retaliationPossible ? `${preview.expectedRetaliation.toFixed(1)}%` : "0.0%";
    const retaliationSummary = preview.retaliationPossible
      ? `Projected attacker strength: ${projectedAttackerStrength.toFixed(1)}%`
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
                <strong>${attackerStrength}%</strong>
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
                <strong>${defenderStrength}%</strong>
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
              <span class="attack-preview-outcome__label">Damage to target</span>
              <strong class="attack-preview-outcome__value ${defenderDamageToneClass}">${postPayloadExpectedDamage.toFixed(1)}%</strong>
              <span class="attack-preview-outcome__subtext">Projected defender strength: ${projectedDefenderStrength.toFixed(1)}%</span>
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
                <span>Damage / Hit</span>
                <strong>${postPayloadDamagePerHit.toFixed(3)}%</strong>
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
            </div>

            <div class="attack-preview-breakdown">
              <p><strong>Profile:</strong> ${this.escapeHtml(profile.description)}</p>
              <p><strong>Engagement Math:</strong> ${this.escapeHtml(profile.mathLine)}</p>
              <p><strong>Accuracy Math:</strong> ${this.escapeHtml(accuracyBreakdownLine)}</p>
              <p><strong>Damage Math:</strong> ${this.escapeHtml(damageBreakdownLine)}</p>
              <p><strong>Commander Bonuses:</strong> Accuracy +${commanderAccuracyBonus}% • Damage +${commanderDamageBonus}%</p>
              <p><strong>Payload:</strong> x${damageMultiplier} (${this.escapeHtml(damageMultiplierDescription)}) • Suppression x${suppressionMultiplier} (${this.escapeHtml(suppressionMultiplierDescription)})</p>
              <p><strong>Damage / Hit:</strong> ${damagePerHitSummary}</p>
              <p><strong>Expected Damage:</strong> ${expectedDamageSummary}</p>
              <p><strong>Expected Suppression:</strong> ${suppressionSummary}</p>
              ${!preview.retaliationPossible && preview.retaliationNote
                ? `<p><strong>Return Fire Note:</strong> ${this.escapeHtml(preview.retaliationNote)}</p>`
                : ""}
            </div>
          </div>
        </details>
      </div>
    `;
    this.configureAttackStanceControls(attackerUnit ?? preview.attacker, commandState);
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

  private canUnitAssault(unit: ScenarioUnit, commandState: UnitCommandState | null): boolean {
    return this.canUnitUseCombatStances(unit) && commandState?.suppressionState === "clear";
  }

  private configureAttackStanceControls(attackerUnit: ScenarioUnit | null, commandState: UnitCommandState | null): void {
    const selector = this.attackConfirmDialog?.querySelector<HTMLElement>(".attack-stance-selector");
    const assaultBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceAssault");
    const suppressiveBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceSuppressive");
    if (!selector || !assaultBtn || !suppressiveBtn) {
      return;
    }

    const supportsStances = attackerUnit ? this.canUnitUseCombatStances(attackerUnit) : false;
    selector.classList.toggle("attack-stance-selector--hidden", !supportsStances);
    if (!supportsStances) {
      this.currentAttackStance = null;
      assaultBtn.disabled = true;
      suppressiveBtn.disabled = true;
      this.updateStanceButtonStates();
      return;
    }

    const assaultAvailable = attackerUnit ? this.canUnitAssault(attackerUnit, commandState) : false;
    assaultBtn.disabled = !assaultAvailable;
    assaultBtn.classList.toggle("stance-disabled", !assaultAvailable);
    suppressiveBtn.disabled = false;
    suppressiveBtn.classList.remove("stance-disabled");

    const assaultNote = assaultBtn.querySelector<HTMLElement>(".stance-note");
    if (assaultNote) {
      assaultNote.textContent = assaultAvailable
        ? "Point-blank attack. Closes to knife-fight range for the strongest hit chance."
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
        description: "This formation uses its standard direct-fire profile. Vehicles do not switch between assault and suppressive stances.",
        note: "Accuracy reflects the normal range, terrain, and spotting calculation for this weapon system.",
        mathLine: "Standard direct-fire calculation. No assault multiplier is in effect."
      };
    }

    if (this.currentAttackStance === "assault") {
      return {
        title: "Assault",
        description: "The battalion closes to point-blank range and trades protection for a much better chance to hit.",
        note: "Assault resolves at point-blank range, so the battalion benefits from the short-range accuracy curve instead of a separate hit multiplier.",
        mathLine: "Point-blank range uses the 25m midpoint, then runs the standard range, terrain, and spotting math."
      };
    }

    const suppressionNote = commandState?.suppressionState === "pinned"
      ? "Pinned formations cannot move, retaliate, or initiate assault fire until the pin is broken."
      : commandState?.suppressionState === "suppressed"
        ? "Suppressed formations may still move and fire, but assault is unavailable this turn."
        : "Suppressive fire keeps the battalion in ranged posture and can stack suppression on the target.";

    return {
      title: "Suppressive",
      description: "The battalion stays in ranged posture and trades lethality for disruption and battlefield control.",
      note: suppressionNote,
      mathLine: "Standard range calculation. No assault multiplier is in effect."
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
    this.beginArtilleryTargeting(callerHexKey, callerLabel, readyAssetId, artilleryState.targetHexKeys);
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
    if (commandState.suppressionState === "pinned") {
      return {
        available: false,
        reason: "Pinned battalions cannot adjust heavy artillery fire until the pin is broken.",
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

  private beginArtilleryTargeting(callerHexKey: string, callerLabel: string, assetId: string, targetHexKeys: readonly string[]): void {
    this.artilleryTargetingState = {
      callerHexKey,
      callerLabel,
      assetId,
      targetHexKeys: new Set(targetHexKeys)
    };
    this.artilleryPreviewKeys = new Set(targetHexKeys);
    this.hexMapRenderer?.setZoneHighlights(this.artilleryPreviewKeys);
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
    this.applySelectedHex(targetingState.callerHexKey);
    this.syncQueuedTargetMarkers();
    const summary = `${targetingState.callerLabel} requested heavy artillery on ${targetHexKey}. Impact scheduled for turn transition. Click the red crosshair to cancel and reposition.`;
    this.announceBattleUpdate(summary);
    this.publishActivityEvent({
      category: "player",
      type: "log",
      summary
    });
    this.battleState.emitBattleUpdate("manual");
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
    
    // Freeze camera movement during effects
    this.freezeCamera();
    
    const first = impacts[0];
    const firstOffset = CoordinateSystem.axialToOffset(first.targetHex.q, first.targetHex.r);
    const firstHexKey = CoordinateSystem.makeHexKey(firstOffset.col, firstOffset.row);
    console.log("[BattleScreen] Focusing camera on first impact hex:", firstHexKey);
    
    // Await camera focus to make it synchronous from pipeline perspective
    await this.focusCameraOnHex(firstHexKey);
    
    const engine = this.battleState.ensureGameEngine();
    for (const impact of impacts) {
      const offset = CoordinateSystem.axialToOffset(impact.targetHex.q, impact.targetHex.r);
      const targetHexKey = CoordinateSystem.makeHexKey(offset.col, offset.row);
      console.log("[BattleScreen] Playing explosion for impact at hex:", targetHexKey, impact);
      await renderer.playExplosion(targetHexKey, false);
      console.log("[BattleScreen] Playing dust cloud for impact at hex:", targetHexKey);
      await renderer.playDustCloud(targetHexKey);
      const targetClass = impact.targetUnitType
        ? this.unitTypes[impact.targetUnitType as keyof UnitTypeDictionary]?.class as UnitClass | undefined
        : undefined;
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
      const resolveSquadronLabel = (squadronId: string | undefined | null): string => {
        if (!squadronId) {
          return "-";
        }

        const deployed = [...(engine.playerUnits ?? []), ...(engine.botUnits ?? [])];
        const reserves = (engine.reserveUnits ?? []).map((entry) => entry.unit);
        const allUnits = [...deployed, ...reserves];
        const match = allUnits.find((unit) => unit.unitId === squadronId) ?? null;
        if (!match) {
          console.error("[BattleScreen] Unable to resolve squadron id for air mission log label", {
            squadronId,
            deployedCount: deployed.length,
            reserveCount: reserves.length
          });
          return "Unknown squadron";
        }
        return `${this.toTitleCase(String(match.type))} @ ${match.hex.q},${match.hex.r}`;
      };
      const reports = engine.getAirMissionReports();
      for (const r of reports) {
        if (this.seenAirReportIds.has(r.id)) {
          continue;
        }
        this.seenAirReportIds.add(r.id);
        let target = "-";
        if (r.targetHex) {
          target = `${r.targetHex.q},${r.targetHex.r}`;
        } else if (r.kind === "airCover") {
          target = "Base CAP";
        } else if (r.escortTargetUnitKey) {
          target = resolveSquadronLabel(r.escortTargetUnitKey);
        }
        let action = "resolved";
        if (r.event === "refitStarted") action = "refit started";
        else if (r.event === "refitCompleted") action = "refit completed";

        // Build outcome summary for resolved missions
        let outcomeSummary = "";
        if (r.event !== "refitStarted" && r.event !== "refitCompleted" && r.outcome) {
          const outcome = r.outcome as { result?: string; details?: string; damageInflicted?: number; defenderDestroyed?: boolean };
          outcomeSummary = outcome.result ? ` [${outcome.result.toUpperCase()}]` : "";
          if (outcome.defenderDestroyed) {
            outcomeSummary += " — Target destroyed!";
          } else if (typeof outcome.damageInflicted === "number" && outcome.damageInflicted > 0) {
            outcomeSummary += ` — ${outcome.damageInflicted} damage dealt`;
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
        if (typeof r.interceptions === "number" && r.interceptions > 0) {
          details.interceptions = r.interceptions;
        }
        if (r.outcome) {
          details.outcomeDetails = (r.outcome as { details?: string }).details;
        }
        this.publishActivityEvent({
          category: r.faction === "Player" ? "player" : "enemy",
          type: "log",
          summary: `Air mission ${r.kind} ${action} — target ${target}${outcomeSummary}`,
          details
        });
      }
    } catch {
      /* no-op */
    }
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
      await this.executePendingAttack(attackerAxial, defenderAxial);
      this.pendingAttack = null;
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
    if (this.pendingAttack) {
      this.announceBattleUpdate("Attack cancelled. Select a new target or continue maneuvering.");
    }
    this.pendingAttack = null;
    this.attackConfirmationLocked = false;
  }

  /**
   * Resolves the stored attack by issuing the engine command and surfacing results to the commander.
   */
  private async executePendingAttack(attacker: Axial, defender: Axial): Promise<void> {
    const engine = this.battleState.ensureGameEngine();
    try {
      const attackerOffset = CoordinateSystem.axialToOffset(attacker.q, attacker.r);
      const defenderOffset = CoordinateSystem.axialToOffset(defender.q, defender.r);
      const attackerHex = CoordinateSystem.makeHexKey(attackerOffset.col, attackerOffset.row);
      const defenderHex = CoordinateSystem.makeHexKey(defenderOffset.col, defenderOffset.row);

      let preview: ReturnType<typeof engine.previewAttack> | null = null;

      if (this.hexMapRenderer) {
        try {
          preview = engine.previewAttack(attacker, defender, this.currentAttackStance ?? undefined);
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

      const resolution = engine.attackUnit(attacker, defender, this.currentAttackStance ?? undefined);

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
      this.applySelectedHex(attackerHex);
      if (resolution) {
        // Compose battle update lines summarizing attack outcome and any counter-fire so commanders get full context.
        const announcements: string[] = [];
        const inflicted = Math.max(0, Math.round(resolution.result.expectedDamage));
        let primaryReport = `Attack confirmed. Damage ≈ ${inflicted}.`;
        if (resolution.defenderDestroyed) {
          primaryReport += " Target destroyed.";
        } else {
          primaryReport += ` Defender strength now ${Math.max(0, resolution.defenderRemainingStrength)}.`;
        }
        if (typeof resolution.attackerRemainingStrength === "number") {
          primaryReport += ` Attacking unit strength now ${Math.max(0, resolution.attackerRemainingStrength)}.`;
        }
        announcements.push(primaryReport);

        if (resolution.retaliationOccurred) {
          const retaliationDamage = Math.max(
            0,
            Math.round(resolution.retaliationResult?.expectedDamage ?? 0)
          );
          let retaliationReport = `Enemy retaliation dealt ≈ ${retaliationDamage} damage.`;
          const attackerRemaining = resolution.attackerRemainingStrength;
          if (typeof attackerRemaining === "number") {
            if (attackerRemaining <= 0) {
              retaliationReport += " Attacking unit destroyed.";
            } else {
              retaliationReport += ` Attacking unit strength now ${attackerRemaining}.`;
            }
          }
          announcements.push(retaliationReport);
        }

        announcements.forEach((text) => this.announceBattleUpdate(text));

        const retaliationDamage = resolution.retaliationOccurred
          ? Math.max(0, Math.round(resolution.retaliationResult ? resolution.retaliationResult.expectedDamage : 0))
          : 0;
        const defenderDestroyedNote = resolution.defenderDestroyed ? " Target destroyed." : "";
        const retaliationSummary = resolution.retaliationOccurred
          ? ` Enemy retaliation dealt ${retaliationDamage} damage.`
          : "";
        const attackSummary = `Player attack from ${attackerHex} to ${defenderHex} dealt ${inflicted} damage.${defenderDestroyedNote}${retaliationSummary}`;

        const detailSections = this.buildPlayerAttackDetails(resolution, this.pendingAttack?.preview ?? null, {
          attackerHex,
          defenderHex,
          inflictedDamage: inflicted,
          retaliationDamage
        });

        this.publishActivityEvent({
          category: "player",
          type: "attack",
          summary: attackSummary,
          details: {
            inflictedDamage: inflicted,
            defenderRemaining: resolution.defenderRemainingStrength,
            attackerRemaining: resolution.attackerRemainingStrength,
            retaliationDamage: retaliationDamage,
            retaliationOccurred: resolution.retaliationOccurred
          },
          detailSections
        });

        this.battleState.emitBattleUpdate("manual");
      } else {
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

      const moveHandle = this.hexMapRenderer.primeUnitMove(fromKey, toKey);
      if (!moveHandle) {
        continue;
      }

      // Keep the camera tracking the unit before and after the renderer handles sprite duplication/animation.
      if (canFocusCamera) {
        this.focusCameraOnHex(fromKey);
      }
      await new Promise((resolve) => setTimeout(resolve, 200));

      try {
        await moveHandle.play(BattleScreen.BOT_MOVE_ANIMATION_MS);
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
      await new Promise((resolve) => setTimeout(resolve, 150));
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
    const assaultBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceAssault");
    const suppressiveBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceSuppressive");

    if (!assaultBtn || !suppressiveBtn) {
      return;
    }

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
    const assaultBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceAssault");
    const suppressiveBtn = this.attackConfirmDialog?.querySelector<HTMLButtonElement>("#stanceSuppressive");

    const assaultSelected = this.currentAttackStance === "assault";
    const suppressiveSelected = this.currentAttackStance === "suppressive";

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

    this.promptAttackConfirmation(attacker, defender, { preserveStance: true });
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
    this.currentAttackStance = null;
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
    tutorialState.setCanProceed(true);
    if (!shouldAdvance) {
      return;
    }
    setTimeout(() => {
      const nextPhase = getNextPhase(phase);
      if (nextPhase) {
        tutorialState.advancePhase(nextPhase);
      }
    }, 800);
  }

  private bindPanelEvents(): void {
    if (!this.deploymentPanel) {
      return;
    }

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
              action: "Choose a different open hex in a player deployment zone and try again.",
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
          try {
            engine.deployUnitByKey(axial, unitKey);
            this.deploymentPanel?.setCriticalError(null);
            this.announceBattleUpdate(`Deployed ${label} to ${hexKey}.`);
            this.refreshDeploymentMirrors("deploy", { unitKey, hexKey, label });
            this.completeTutorialPhase("place_units");
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
          const zoneHexes = this.deploymentPanel?.getZoneHexes(zoneKey);
          console.log("[BattleScreen] Zone hexes for", zoneKey, ":", Array.from(zoneHexes || []).slice(0, 5));
          if (zoneHexes) {
            this.hexMapRenderer?.setZoneHighlights(zoneHexes);

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
   * Mirrors engine → DeploymentState and cascades UI refreshes in a single, predictable sequence.
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

      // 2. Mirror engine → DeploymentState exactly once per refresh call to avoid redundant bridge work.
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
        } else {
          // During gameplay, zone highlights are not shown; objective markers provide visual feedback
          this.hexMapRenderer.setZoneHighlights([]);
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
      botUnits: engine.botUnits
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
      return;
    }

    this.currentObjectiveIndex = 0;
    this.zoomPanControls.onCycleObjective(() => {
      if (!this.scenario.objectives || this.scenario.objectives.length === 0) {
        return;
      }

      // Cycle to next objective
      this.currentObjectiveIndex = (this.currentObjectiveIndex + 1) % this.scenario.objectives.length;
      const objective = this.scenario.objectives[this.currentObjectiveIndex];

      // Convert to offset key and focus on it
      const offset = CoordinateSystem.axialToOffset(objective.hex.q, objective.hex.r);
      const offsetKey = CoordinateSystem.makeHexKey(offset.col, offset.row);

      // Focus camera on objective
      this.hexMapRenderer?.focusOnHex(offsetKey, { behavior: "smooth", padding: 100 });

      // Announce which objective we're viewing
      this.announceBattleUpdate(`Viewing Ford ${this.currentObjectiveIndex + 1} of ${this.scenario.objectives.length}`);
    });
  }

  private updateObjectiveMarkers(): void {
    if (!this.hexMapRenderer || !this.missionRulesController || !this.scenario.objectives) {
      return;
    }

    const engine = this.battleState.hasEngine() ? this.battleState.ensureGameEngine() : null;
    if (!engine) {
      return;
    }

    // Build occupancy map
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

    // Get ford tracker counters from mission status
    const fordCounters = new Map<string, number>();
    let playerHoldStreak = 0;
    if (this.missionStatus?.objectives) {
      const primaryObjective = this.missionStatus.objectives.find(obj => obj.id === "primary_deny_fords");
      if (primaryObjective?.detail) {
        // Parse player hold streak: "Player hold all: 3/8 turns; Ford 1: Bot hold 2/8 turns..."
        const playerStreakMatch = primaryObjective.detail.match(/Player hold all: (\d+)\/(\d+) turns/);
        if (playerStreakMatch) {
          playerHoldStreak = parseInt(playerStreakMatch[1], 10);
        }

        // Parse bot hold counters
        const fordMatches = primaryObjective.detail.matchAll(/Ford (\d+): Bot hold (\d+)\/(\d+) turns/g);
        let fordIndex = 0;
        for (const match of fordMatches) {
          const count = parseInt(match[2], 10);
          if (this.scenario.objectives && fordIndex < this.scenario.objectives.length) {
            const objective = this.scenario.objectives[fordIndex];
            const key = `${objective.hex.q},${objective.hex.r}`;
            fordCounters.set(key, count);
          }
          fordIndex++;
        }
      }
    }

    // Update professional objective markers for each hex
    for (let i = 0; i < this.scenario.objectives.length; i++) {
      const objective = this.scenario.objectives[i];
      // Convert axial to offset coordinates for hex key
      const axialKey = `${objective.hex.q},${objective.hex.r}`;
      const offset = CoordinateSystem.axialToOffset(objective.hex.q, objective.hex.r);
      const offsetKey = CoordinateSystem.makeHexKey(offset.col, offset.row);

      const occupant = occupancy.get(axialKey);
      const counter = fordCounters.get(axialKey) ?? 0;

      let status: "unoccupied" | "player" | "enemy";
      let counterText: string | undefined;
      let tooltipText: string;

      if (occupant === "Bot") {
        status = "enemy";
        counterText = `${counter}/8`;
        tooltipText = `Ford ${i + 1} - ENEMY CONTROLLED\nEnemy has held for ${counter} of 8 turns\n${8 - counter} turns remaining to secure`;
      } else if (occupant === "Player" || occupant === "Ally") {
        status = "player";
        const allFordsHeld = this.scenario.objectives.every(obj => {
          const objKey = `${obj.hex.q},${obj.hex.r}`;
          const objOccupant = occupancy.get(objKey);
          return objOccupant === "Player" || objOccupant === "Ally";
        });
        if (allFordsHeld) {
          tooltipText = `Ford ${i + 1} - SECURED\nAll fords held for ${playerHoldStreak} of 8 turns\nHold for ${8 - playerHoldStreak} more turns to win`;
        } else {
          tooltipText = `Ford ${i + 1} - SECURED\nYou control this ford, but not all fords\nMust hold ALL fords simultaneously for 8 turns to win`;
        }
      } else {
        status = "unoccupied";
        tooltipText = `Ford ${i + 1} - CONTESTED\nNo forces currently holding\nMove units onto this ford and hold ALL fords for 8 turns to win`;
      }

      this.hexMapRenderer.renderObjectiveMarker(offsetKey, {
        status,
        counter: counterText,
        tooltip: tooltipText
      });
    }
  }

  private renderMissionStatus(): void {
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

    // Build objectives summary
    let objectivesSummary = "";
    if (this.missionStatus?.objectives && this.missionStatus.objectives.length > 0) {
      const completedCount = this.missionStatus.objectives.filter(obj => obj.state === "completed").length;
      const failedCount = this.missionStatus.objectives.filter(obj => obj.state === "failed").length;
      const totalCount = this.missionStatus.objectives.length;

      objectivesSummary = `
        <div style="margin: 24px 0; padding: 20px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">
          <div style="font-size: 0.9rem; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 12px;">Mission Objectives</div>
          <div style="font-size: 1.1rem; color: rgba(255,255,255,0.9);">
            <span style="color: #4ade80; font-weight: 700;">${completedCount}</span> Completed ·
            <span style="color: #f87171; font-weight: 700;">${failedCount}</span> Failed ·
            <span style="color: rgba(255,255,255,0.7);">${totalCount - completedCount - failedCount}</span> Incomplete
          </div>
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
      this.handleEndMission();
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

  private async triggerAirMissionArrivals(summary: TurnSummary): Promise<void> {
    void summary;
    const arrivals = this.battleState.consumeAirMissionArrivals();
    if (!arrivals || arrivals.length === 0) {
      return;
    }
    await this.playAirMissionArrivals(arrivals);
  }

  private async playAirMissionArrivals(arrivals: AirMissionArrival[]): Promise<void> {
    const renderer = this.hexMapRenderer;
    if (!renderer) {
      return;
    }

    let hadAnimationError = false;

    // Build flight data for all arrivals first.
    const flights: Array<{ missionId: string; faction: TurnFaction; kind: string; originKey: string; destKey: string; unitType: string }> = [];
    for (const a of arrivals) {
      try {
        // `AirMissionArrival.unitKey` is a stable squadronId (unitId), not an axial hex key.
        // Use the explicit origin hex key (base) when provided so animations start from the correct map location.
        const originOffsetKey = a.originHexKey ? CoordinateSystem.axialKeyToOffsetKey(a.originHexKey) : null;
        let destOffsetKey: string | null = null;
        if (a.targetHex) {
          const off = CoordinateSystem.axialToOffset(a.targetHex.q, a.targetHex.r);
          destOffsetKey = CoordinateSystem.makeHexKey(off.col, off.row);
        } else if (a.escortTargetUnitKey) {
          // Escort missions store the protected strike squadronId, so resolve its current hex via the engine.
          const engine = this.battleState.ensureGameEngine();
          const protectedUnit = (a.faction === "Player" ? engine.playerUnits : engine.botUnits).find(
            (u) => u.unitId === a.escortTargetUnitKey
          );
          if (protectedUnit) {
            const off = CoordinateSystem.axialToOffset(protectedUnit.hex.q, protectedUnit.hex.r);
            destOffsetKey = CoordinateSystem.makeHexKey(off.col, off.row);
          }
        }
        if (!originOffsetKey || !destOffsetKey) {
          console.warn("[BattleScreen] Air mission arrival animation skipped: unable to resolve geometry", {
            arrival: a,
            originOffsetKey,
            destOffsetKey
          });
          // Fallback to a subtle dust puff if geometry cannot be derived.
          const fallback = originOffsetKey ?? destOffsetKey;
          if (fallback) {
            await renderer.playDustCloud(fallback);
          }
          continue;
        }
        flights.push({ missionId: a.missionId, faction: a.faction, kind: a.kind, originKey: originOffsetKey, destKey: destOffsetKey, unitType: a.unitType });
      } catch (error) {
        hadAnimationError = true;
        console.error("[BattleScreen] Failed while preparing air mission arrival animation", { arrival: a }, error);
      }
    }

    if (flights.length === 0) {
      return;
    }

    // Focus camera on the first destination for visual context.
    this.focusCameraOnHex(flights[0].destKey);
    await this.waitForNextFrame();

    // Animate all flights simultaneously with 75% staggered start times (choreography beats).
    // Each subsequent flight starts after 25% of the animation duration has elapsed.
    const STAGGER_RATIO = 0.25; // 25% delay between each flight start = 75% overlap.
    const BASE_DURATION_MS = 800; // Approximate base animation duration.
    const staggerDelayMs = BASE_DURATION_MS * STAGGER_RATIO;

    const flightPromises: Promise<void>[] = flights.map((f, index) => {
      return new Promise((resolve) => {
        // Stagger the start of each animation.
        setTimeout(async () => {
          try {
            if (typeof (renderer as any).animateAircraftRoundTrip === "function") {
              await (renderer as any).animateAircraftRoundTrip(f.originKey, f.destKey, f.unitType);
            } else {
              await renderer.animateAircraftFlyover(f.originKey, f.destKey, f.unitType);
            }
          } catch (error) {
            hadAnimationError = true;
            console.error("[BattleScreen] Air mission arrival animation failed", { flight: f }, error);
          }
          resolve();
        }, index * staggerDelayMs);
      });
    });

    await Promise.all(flightPromises);

    const engine = this.battleState.ensureGameEngine();
    for (const flight of flights) {
      if (flight.kind !== "strike") {
        continue;
      }

      try {
        const missions = engine.getScheduledAirMissions(flight.faction);
        const mission = missions.find((m) => m.id === flight.missionId) ?? null;
        const outcome = mission?.outcome as any;
        if (!mission || !outcome || outcome.type !== "strike") {
          continue;
        }

        await renderer.playExplosion(flight.destKey, true);
        await renderer.playDustCloud(flight.destKey);

        const defenderType = typeof outcome.defenderType === "string" ? outcome.defenderType : null;
        const defenderClass = defenderType ? (this.unitTypes?.[defenderType as keyof UnitTypeDictionary]?.class as UnitClass | undefined) : undefined;

        if (outcome.defenderDestroyed) {
          renderer.markHexWrecked(flight.destKey, defenderClass, 2);
        } else if (typeof mission.targetHex?.q === "number" && typeof mission.targetHex?.r === "number") {
          const opponentUnits = flight.faction === "Player" ? engine.botUnits : engine.playerUnits;
          const defenderNow = opponentUnits.find((u) => u.hex.q === mission.targetHex!.q && u.hex.r === mission.targetHex!.r) ?? null;
          renderer.markHexDamaged(flight.destKey, defenderClass, defenderNow?.strength, 2);
        }

        this.renderEngineUnits();
      } catch (error) {
        hadAnimationError = true;
        console.error("[BattleScreen] Air strike impact animation failed", { flight }, error);
      }
    }

    if (hadAnimationError) {
      this.publishActivityEvent({
        category: "system",
        type: "log",
        summary: "Air mission animation failed. Check console for details."
      });
    }
  }

  private async triggerAirEngagements(summary: TurnSummary): Promise<void> {
    void summary;
    const engagements = this.battleState.consumeAirEngagements();
    if (!engagements || engagements.length === 0) {
      return;
    }
    await this.playAirEngagements(engagements);
  }

  private async playAirEngagements(events: AirEngagementEvent[]): Promise<void> {
    const renderer = this.hexMapRenderer;
    if (!renderer) {
      return;
    }
    const engine = this.battleState.ensureGameEngine();
    let hadAnimationError = false;
    for (const e of events) {
      try {
        const locOff = CoordinateSystem.axialToOffset(e.location.q, e.location.r);
        const locKey = CoordinateSystem.makeHexKey(locOff.col, locOff.row);

        this.focusCameraOnHex(locKey);
        await this.waitForNextFrame();

        // Engagement participants generally report squadron IDs (unitId). Resolve them to their current hex positions.
        const resolveUnitOffsetKey = (squadronIdOrHexKey: string, faction: "Player" | "Bot" | "Ally"): string | null => {
          const reserves = faction === "Player" ? (engine.reserveUnits ?? []).map((entry) => entry.unit) : [];
          const units = faction === "Player" ? [...(engine.playerUnits ?? []), ...reserves] : faction === "Bot" ? (engine.botUnits ?? []) : (engine.allyUnits ?? []);
          const unit = units.find((u) => u.unitId === squadronIdOrHexKey);
          if (!unit) {
            // Some call sites still emit axial hex keys ("q,r") instead of unitId. Support both formats.
            return CoordinateSystem.axialKeyToOffsetKey(squadronIdOrHexKey);
          }
          const off = CoordinateSystem.axialToOffset(unit.hex.q, unit.hex.r);
          return CoordinateSystem.makeHexKey(off.col, off.row);
        };

        const bomberFrom = resolveUnitOffsetKey(e.bomber.unitKey, e.bomber.faction);
        const flights: Promise<void>[] = [];
        if (bomberFrom) {
          flights.push(renderer.animateAircraftFlyover(bomberFrom, locKey, e.bomber.unitType));
        }
        e.interceptors.forEach((i) => {
          const from = resolveUnitOffsetKey(i.unitKey, i.faction);
          if (from) {
            flights.push(renderer.animateAircraftFlyover(from, locKey, i.unitType));
          }
        });
        e.escorts.forEach((s) => {
          const from = resolveUnitOffsetKey(s.unitKey, s.faction);
          if (from) {
            flights.push(renderer.animateAircraftFlyover(from, locKey, s.unitType));
          }
        });
        await Promise.all(flights);
        await renderer.playDogfight(locKey);
      } catch (error) {
        hadAnimationError = true;
        console.error("[BattleScreen] Air engagement animation failed", { event: e }, error);
      }
    }

    if (hadAnimationError) {
      this.publishActivityEvent({
        category: "system",
        type: "log",
        summary: "Air engagement animation failed. Check console for details."
      });
    }
  }

  private updateTurnStatusDisplay(summary: TurnSummary): void {
    if (this.turnIndicatorElement) {
      const label = summary.phase === "deployment" ? "Deployment" : `Turn ${summary.turnNumber}`;
      this.turnIndicatorElement.textContent = label;
    }
    if (this.factionIndicatorElement) {
      this.factionIndicatorElement.textContent = this.formatFactionLabel(summary.activeFaction);
    }
    if (this.phaseIndicatorElement) {
      this.phaseIndicatorElement.textContent = this.formatPhaseLabel(summary.phase);
    }
  }

  private updateTurnControls(summary: TurnSummary): void {
    const isPlayerTurn = summary.activeFaction === "Player" && summary.phase === "playerTurn";
    if (this.endTurnButton) {
      this.endTurnButton.disabled = !isPlayerTurn;
      if (isPlayerTurn) {
        this.endTurnButton.removeAttribute("aria-disabled");
      } else {
        this.endTurnButton.setAttribute("aria-disabled", "true");
      }
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
        const damage = attack.inflictedDamage;
        const destroyed = attack.defenderDestroyed ? " Target destroyed!" : "";
        this.announceBattleUpdate(
          `Enemy ${attackerLabel} attacked ${defenderLabel}. Damage: ${Math.round(damage)}.${destroyed}`
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
      const damage = Math.round(attack.inflictedDamage);
      const destructionNote = attack.defenderDestroyed ? " Target destroyed." : "";
      this.publishActivityEvent({
        category: "enemy",
        type: "attack",
        summary: `Enemy ${attackerLabel} attacked ${defenderLabel} from ${originKey} to ${targetKey} for ${damage} damage.${destructionNote}`
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
  private async focusCameraOnHex(hexKey: string): Promise<void> {

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
  private async centerCameraOnZone(zoneHexes: Iterable<string>): Promise<void> {
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

    console.log("[BattleScreen] Calling mapViewport.centerOn for zone:", { avgX, avgY });
    // Center the viewport on the zone's average position
    this.mapViewport.centerOn(avgX, avgY);
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
          this.syncAirMissionLogs();
          break;
        }
        default:
          break;
      }
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
    document.addEventListener("air:previewRange", this.airPreviewListener);
    document.addEventListener("air:clearPreview", this.airClearPreviewListener);
    document.addEventListener("battle:targetMarkerClicked", this.targetMarkerClickListener);

    // Wire reserve deployment from the Army Roster popup
    document.addEventListener("battle:selectReserve", (event) => {
      const detail = (event as CustomEvent<{ unitKey: string }>).detail;
      if (detail?.unitKey) {
        this.handleReserveCallupRequest(detail.unitKey);
      }
    });
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
    this.hydrateMissionBriefing();
    this.bindEvents();

    // Initialize child components so their DOM scaffolding is ready before map renders.
    this.deploymentPanel?.initialize();
    // Legacy loadout/reserve presenters are not wired while their DOM is commented out.
    this.battleLoadout?.initialize();
    this.reservePresenter?.initialize();

    // Hook panel event stream → engine orchestration once listeners exist.
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
    if (this.airPreviewListener) {
      document.removeEventListener("air:previewRange", this.airPreviewListener);
    }
    if (this.airClearPreviewListener) {
      document.removeEventListener("air:clearPreview", this.airClearPreviewListener);
    }
    if (this.targetMarkerClickListener) {
      document.removeEventListener("battle:targetMarkerClicked", this.targetMarkerClickListener);
    }
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
    this.missionTitleElement = this.element.querySelector("#battleMissionTitle");
    this.missionBriefingElement = this.element.querySelector("#battleMissionSummary");
    this.missionObjectivesList = this.element.querySelector("#battleMissionObjectives");
    this.missionDoctrineElement = this.element.querySelector("#battleMissionDoctrine");
    this.missionTurnLimitElement = this.element.querySelector("#battleMissionTurnLimit");
    this.missionSuppliesList = this.element.querySelector("#battleMissionSupplies");
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

    const title = missionInfo?.title ?? "Mission Briefing";
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
    this.endTurnButton?.addEventListener("click", () => {
      void this.handleEndTurn();
    });
    this.endMissionButton?.addEventListener("click", () => this.handleEndMission());
    this.attackConfirmAccept?.addEventListener("click", () => void this.handleConfirmAttack());
    this.attackConfirmCancel?.addEventListener("click", () => this.handleCancelAttack());
    this.baseCampAssignButton?.addEventListener("click", () => this.handleAssignBaseCamp());
    this.deploymentPanelToggleButton?.addEventListener("click", () => this.handleToggleDeploymentPanel());
    this.autoDeployEvenlyButton?.addEventListener("click", () => this.handleAutoDeploy("even"));
    this.autoDeployGroupedButton?.addEventListener("click", () => this.handleAutoDeploy("grouped"));
    this.bindSelectionIntelOverlayActions();
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

      const remainingReserves = engine.getReserveSnapshot().length;
      this.refreshDeploymentMirrors("deploy");

      if (remainingReserves === 0) {
        this.finishDeploymentAfterAutoPlacement(engine);
      } else {
        this.announceBattleUpdate(
          `Auto-deploy complete. ${remainingReserves} unit${remainingReserves === 1 ? "" : "s"} remain in reserve.`
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

    const unitQueue = this.buildUnitQueue(mode);
    const plannedPlacements: Array<{ hexKey: string; unitKey: string }> = [];

    const hexIterator = sortedHexes[Symbol.iterator]();
    let nextHex = hexIterator.next();
    let nextUnit = unitQueue.next();

    while (!nextHex.done && !nextUnit.done) {
      plannedPlacements.push({ hexKey: nextHex.value, unitKey: nextUnit.value });
      nextHex = hexIterator.next();
      nextUnit = unitQueue.next();
    }

    return plannedPlacements;
  }

  /**
   * Builds an iterator of unit keys based on the desired auto-deploy mode.
   */
  private * buildUnitQueue(mode: "even" | "grouped"): Generator<string, void, void> {
    const deploymentState = ensureDeploymentState();
    const entries = deploymentState.pool
      .map((entry) => ({ key: entry.key, remaining: deploymentState.getReserveCount(entry.key) }))
      .filter((entry) => entry.remaining > 0);

    if (entries.length === 0) {
      return;
    }

    if (mode === "grouped") {
      entries.sort((a, b) => b.remaining - a.remaining || a.key.localeCompare(b.key));
      for (const entry of entries) {
        for (let index = 0; index < entry.remaining; index += 1) {
          yield entry.key;
        }
      }
      return;
    }

    // Even mode: rotate through unit keys so each type deploys one at a time.
    const queue = entries.map((entry) => ({ ...entry }));
    while (queue.some((entry) => entry.remaining > 0)) {
      for (const entry of queue) {
        if (entry.remaining > 0) {
          entry.remaining -= 1;
          yield entry.key;
        }
      }
    }
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

      // Move engine state from deployment to active combat so UI can present normal turn controls immediately.
      engine.startPlayerTurnPhase();

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

    const items = idleAxialKeys.slice(0, 6).map((axialKey) => {
      const offsetKey = CoordinateSystem.axialKeyToOffsetKey(axialKey);
      const label = offsetKey ?? axialKey;
      return `<li><strong>${label}</strong> — Orders remaining</li>`;
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
   */
  private finalizeTurnAfterIdleWarning(): void {
    const pending = this.pendingIdleTurnAdvance;
    this.dismissIdleWarning();
    if (!pending) {
      return;
    }
    void this.executeTurnAdvance(pending.summary);
    this.completeTutorialPhase("turn_end");
  }

  /** Executes the actual turn advance and downstream updates. */
  private async executeTurnAdvance(_preflightSummary: TurnSummary): Promise<void> {
    const report = this.battleState.endPlayerTurn();
    const summary = this.battleState.getCurrentTurnSummary();

    await this.triggerSupportImpacts();
    await this.triggerAirMissionArrivals(summary);
    await this.triggerAirEngagements(summary);

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
  }

  /**
   * Handles ending the mission and returning to headquarters.
   */
  private handleEndMission(): void {
    const confirmed = window.confirm(
      "End this mission and return to headquarters?\n\n" +
      "This will record your performance in your service record."
    );

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

    // Return to the campaign screen so the commander sees the updated fronts and resources immediately.
    this.screenManager.showScreenById("campaign");
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

    const objectivesInput = window.prompt("Objectives completed (0-10):", "0");
    const casualtiesInput = window.prompt("Units lost:", "0");
    if (objectivesInput === null || casualtiesInput === null) {
      return {
        success: false,
        objectivesCompleted: 0,
        objectivesFailed: 0,
        objectivesContested: 0,
        casualties: 0,
        reason: "Mission report was cancelled before headquarters metrics were confirmed.",
        headquartersTitle: "Mission ended.",
        headquartersAction: "Re-open the debrief and confirm the mission report when ready.",
        aborted: true
      };
    }

    const objectivesCompleted = Math.max(0, Math.min(10, parseInt(objectivesInput) || 0));
    const casualties = Math.max(0, parseInt(casualtiesInput) || 0);
    const success = objectivesCompleted >= 5;
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
   * Handles assigning the base camp location.
   */
  private handleAssignBaseCamp(): void {
    if (!this.selectedHexKey) {
      this.reportDeploymentPanelError({
        title: "Base camp assignment failed.",
        detail: "No hex is currently selected.",
        action: "Select a deployment-zone hex and try again.",
        recoverable: true
      }, { mirrorToBaseCampStatus: true });
      return;
    }
    const engine = this.battleState.ensureGameEngine();
    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) {
      this.reportDeploymentPanelError({
        title: "Base camp assignment failed.",
        detail: `The selected hex (${this.selectedHexKey}) could not be parsed.`,
        action: "Clear selection, choose a valid deployment hex, and retry.",
        recoverable: true
      }, { mirrorToBaseCampStatus: true });
      return;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const deploymentState = ensureDeploymentState();
    const selection = this.resolvePlayerDeploymentSelection(this.selectedHexKey);
    if (!selection.zoneKey) {
      const availableZones = deploymentState.getZoneUsageSummaries()
        .filter((zone) => zone.faction === "Player")
        .map((zone) => zone.name ?? zone.zoneKey);
      const zoneSummary = availableZones.length > 0 ? ` Available player deployment zones: ${availableZones.join(", ")}.` : "";
      this.reportDeploymentPanelError({
        title: "Base camp assignment failed.",
        detail: `Hex ${this.selectedHexKey} is outside the registered player deployment zones.${zoneSummary}`,
        action: "Select a highlighted player deployment hex and try again.",
        recoverable: true
      }, { mirrorToBaseCampStatus: true });
      return;
    }
    try {
      engine.setBaseCamp(axial);
      this.deploymentPanel?.setCriticalError(null);
      if (this.baseCampStatus) {
        this.baseCampStatus.textContent = `Base camp: ${this.selectedHexKey}`;
      }
      this.deploymentPanel?.markBaseCampAssigned(selection.zoneKey);
      const offsetKey = CoordinateSystem.makeHexKey(parsed.col, parsed.row);
      this.hexMapRenderer?.renderBaseCampMarker(offsetKey);
      this.refreshDeploymentMirrors("baseCamp", { hexKey: this.selectedHexKey });
      this.completeTutorialPhase("base_camp");
    } catch (error) {
      console.error("Failed to assign base camp", { hexKey: this.selectedHexKey, error });
      this.reportDeploymentPanelError({
        title: "Base camp assignment failed.",
        detail: `The engine could not anchor the base camp at ${this.selectedHexKey}.`,
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

    if (this.endTurnButton) {
      this.endTurnButton.disabled = false;
      this.endTurnButton.removeAttribute("aria-disabled");
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
      this.deploymentPanelToggleButton.textContent = "⟨";
      this.deploymentPanelToggleButton.setAttribute("aria-label", "Expand deployment panel");
    } else {
      this.battleMainContainer.removeAttribute("data-panel-collapsed");
      this.deploymentPanelToggleButton.setAttribute("aria-expanded", "true");
      this.deploymentPanelToggleButton.textContent = "⟩";
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

    this.hexMapRenderer.render(svg, canvas, scenarioClone);
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

    if (summary.phase === "playerTurn") {
      const transferResult = this.tryTransferAllyControl(key);
      if (transferResult) {
        return;
      }
      this.onPlayerTurnMapClick(key);
      return;
    }
    this.applySelectedHex(key);
  }

  /**
   * Handles reserve call-up requests emitted by the deployment panel so cooldown rules, selection validation,
   * and engine integration remain centralized. Expects the caller to provide a stable allocation key.
   */
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
  private applySelectedHex(key: string): void {
    if (this.hexMapRenderer) {
      this.hexMapRenderer.applyHexSelection(key);
      return;
    }
    this.handleRendererSelection(key);
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
   * Receives renderer selection notifications and propagates the new state to UI affordances while
   * avoiding redundant work when the key is unchanged.
   */
  private handleRendererSelection(key: string | null): void {
    if (this.selectedHexKey === key) {
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
          const capacityMessage = `${selection.remainingCapacity} of ${selection.totalCapacity} positions open in ${selection.zoneLabel ?? "Deployment zone"}.`;
          this.baseCampStatus.textContent = `Selected hex: ${key} — ${capacityMessage}`;
        } else {
          this.baseCampStatus.textContent = `Selected hex: ${key} — outside player deployment zones. Choose a highlighted hex for base camp placement.`;
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
      const capacityDetails = selection.zoneKey && selection.remainingCapacity !== null && selection.totalCapacity !== null
        ? `${selection.remainingCapacity} of ${selection.totalCapacity} slots open in ${selection.zoneLabel ?? "Deployment zone"}.`
        : "Choose a highlighted player deployment hex to place the base camp.";
      const combinedAnnouncement = capacityDetails ? `${baseAnnouncement} ${capacityDetails}` : baseAnnouncement;
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
    const selectedPlayerUnit = engine.playerUnits.find((u) => u.hex.q === axial.q && u.hex.r === axial.r) ?? null;
    if (selectedPlayerUnit) {
      const moves = engine.getReachableHexes(axial);
      const targets = engine.getAttackableTargets(axial);
      const movementBudget = engine.getMovementBudget(axial);
      const isAutomatedLogisticsUnit = selectedPlayerUnit.type === "Supply_Truck" || selectedPlayerUnit.controlledBy === "AI";
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
      const overlay = new Set<string>([...this.playerMoveHexes, ...this.playerAttackHexes]);
      this.hexMapRenderer?.setZoneHighlights(overlay);

      // Provide clear feedback about unit's action state. Resolve labels strictly so bad data surfaces immediately.
      const unitLabel = this.resolveUnitLabelForHex(key);
      if (!unitLabel) {
        console.error("[BattleScreen] Unable to resolve label for selected unit", { hexKey: key });
        this.announceBattleUpdate(`Unit label unavailable for ${key}. Please report this issue.`);
        return;
      }
      let statusMessage = `${unitLabel} selected at ${key}.`;
      const commandState = engine.getUnitCommandState(axial);

      if (isAutomatedLogisticsUnit) {
        this.playerMoveHexes.clear();
        this.playerAttackHexes.clear();
        this.hexMapRenderer?.setZoneHighlights([]);
        statusMessage += " This convoy is automated. Set battalion resupply priority in Logistics instead of issuing manual orders.";
      } else if (this.playerMoveHexes.size === 0 && this.playerAttackHexes.size === 0) {
        statusMessage += " This unit has already moved and attacked this turn.";
      } else if (this.playerMoveHexes.size === 0) {
        statusMessage += ` Unit has moved. ${this.playerAttackHexes.size} attack targets available.`;
      } else if (this.playerAttackHexes.size === 0) {
        statusMessage += ` ${this.playerMoveHexes.size} movement options. Unit has attacked this turn.`;
      } else {
        statusMessage += ` ${this.playerMoveHexes.size} moves, ${this.playerAttackHexes.size} targets.`;
      }
      if (commandState?.suppressionState === "pinned") {
        statusMessage += ` Pinned by ${commandState.suppressorCount} suppressing units. This battalion cannot move or retaliate.`;
      } else if (commandState?.suppressionState === "suppressed") {
        statusMessage += " Under suppressive fire. It may still move and fire, but it cannot assault.";
      }
      if (commandState?.existingHexModification) {
        statusMessage += ` ${this.toTitleCase(this.describeHexModification(commandState.existingHexModification.type))} already cover this hex.`;
      }

      if (this.baseCampStatus) {
        this.baseCampStatus.textContent = isAutomatedLogisticsUnit
          ? `${unitLabel} @ ${key} - Automated convoy`
          : `${unitLabel} @ ${key} - Move:${this.playerMoveHexes.size} Attack:${this.playerAttackHexes.size}`;
      }
      this.announceBattleUpdate(statusMessage);

      this.completeTutorialPhase("movement_intro");

      this.publishSelectionIntel(
        this.buildBattleSelectionIntel(key, selectedPlayerUnit, unitLabel, movementBudget, statusMessage, commandState)
      );
    } else {
      console.log("[BattleScreen] updateSelectionFeedback - hex does not hold player unit");
      this.playerMoveHexes.clear();
      this.playerAttackHexes.clear();
      this.hexMapRenderer?.setZoneHighlights([]);
      if (this.baseCampStatus) {
        this.baseCampStatus.textContent = `Selected hex: ${key}`;
      }
      const hexModification = engine.getHexModification(axial);
      const terrainIntel: TerrainSelectionIntel = {
        kind: "terrain",
        hexKey: key,
        terrainName: this.lookupTerrainName(key),
        notes: hexModification
          ? [`Hex unoccupied. ${this.toTitleCase(this.describeHexModification(hexModification.type))} remain in place here.`]
          : ["Hex unoccupied."]
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
    toAxial: Axial
  ): Promise<void> {
    const engine = this.battleState.ensureGameEngine();

    // Prime the animation before updating engine state
    const renderer = this.hexMapRenderer;
    const moveHandle = renderer?.primeUnitMove(fromKey, toKey) ?? null;

    try {
      // Update engine state
      engine.moveUnit(fromAxial, toAxial);

      // Play the animation if available
      if (moveHandle) {
        try {
          await moveHandle.play(BattleScreen.PLAYER_MOVE_ANIMATION_MS);
        } catch (animationError) {
          console.warn("[BattleScreen] Player move animation failed; continuing without playback.", animationError);
        } finally {
          moveHandle.dispose();
        }
      }

      // Render the final state and update selection
      this.renderEngineUnits();
      this.applySelectedHex(toKey);
      this.announceBattleUpdate(`Moved unit to ${toKey}.`);
      this.publishActivityEvent({
        category: "player",
        type: "move",
        summary: `Unit moved from ${fromKey} to ${toKey}.`
      });

      this.battleState.emitBattleUpdate("manual");
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
      this.announceBattleUpdate("Move failed. Please reselect your unit.");
      this.publishActivityEvent({
        category: "system",
        type: "move",
        summary: "Move command failed."
      });
    }
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
      if (this.playerMoveHexes.has(key)) {
        const selParsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
        if (!selParsed) return;
        const selAxial = CoordinateSystem.offsetToAxial(selParsed.col, selParsed.row);
        const originKey = this.selectedHexKey ?? CoordinateSystem.makeHexKey(selParsed.col, selParsed.row);

        // Execute animated player move
        void this.executeAnimatedPlayerMove(originKey, key, selAxial, clickedAxial);
        return;
      }
      if (this.playerAttackHexes.has(key)) {
        const selParsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
        if (!selParsed) return;
        const selAxial = CoordinateSystem.offsetToAxial(selParsed.col, selParsed.row);
        this.promptAttackConfirmation(selAxial, clickedAxial);
        return;
      }
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
    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) {
      return;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const engine = this.battleState.ensureGameEngine();
    const unitLabel = this.resolveUnitLabelForHex(this.selectedHexKey) ?? "Selected unit";
    const commandState = engine.getUnitCommandState(axial);
    const unit = this.resolvePlayerUnitSnapshot(this.selectedHexKey);
    if (!unit) {
      return;
    }

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
      this.beginArtilleryTargeting(this.selectedHexKey, unitLabel, artilleryState.assetId, artilleryState.targetHexKeys);
      return;
    }
    if (actionId === "digIn") {
      succeeded = engine.digInUnit(axial);
      summary = `${unitLabel} dug in at ${this.selectedHexKey}.`;
      if (!succeeded) {
        this.announceBattleUpdate(commandState?.digInReason ?? "This formation cannot dig in right now.");
        return;
      }
    } else {
      const modificationType = this.parseHexModificationAction(actionId);
      if (!modificationType) {
        return;
      }
      succeeded = engine.buildHexModification(axial, modificationType);
      summary = `${unitLabel} established ${this.describeHexModification(modificationType)} at ${this.selectedHexKey}.`;
      if (!succeeded) {
        this.announceBattleUpdate(commandState?.buildReason ?? "Engineer fieldworks are not available on this hex right now.");
        return;
      }
    }

    this.renderEngineUnits();
    this.applySelectedHex(this.selectedHexKey);
    this.announceBattleUpdate(summary);
    this.publishActivityEvent({
      category: "player",
      type: "log",
      summary
    });
    this.battleState.emitBattleUpdate("manual");
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
   */
  private publishSelectionIntel(intel: SelectionIntel | null): void {
    this.selectionIntel = intel;
    this.selectionIntelOverlay?.update(intel);
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

  /**
   * Records a battle activity event while respecting log caps and updating the sidebar feed.
   */
  private publishActivityEvent(event: ActivityEventInput): void {
    this.activityEventSequence += 1;
    const activity: ActivityEvent = {
      id: `activity_${this.activityEventSequence}`,
      timestamp: new Date().toISOString(),
      category: event.category,
      type: event.type,
      summary: event.summary,
      details: event.details,
      detailSections: event.detailSections
    };
    this.activityEvents.push(activity);
    if (this.activityEvents.length > BattleScreen.ACTIVITY_EVENT_LIMIT) {
      this.activityEvents.shift();
    }
    this.battleActivityLog?.append(activity);
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
      sections.push({
        title: "Units",
        entries: [
          { label: "Attacker Type", value: attackerLabel },
          { label: "Defender Type", value: defenderLabel },
          { label: "Attacker Strength", value: `${Math.round(preview.attacker.strength)}%` },
          { label: "Defender Strength", value: `${Math.round(preview.defender.strength)}%` }
        ]
      });

      const accuracy = Math.round(preview.result.accuracy);
      const expectedDamage = preview.finalExpectedDamage.toFixed(1);
      const expectedHits = preview.result.expectedHits.toFixed(1);
      const damagePerHit = preview.finalDamagePerHit.toFixed(2);
      const shots = preview.result.shots;
      const effectiveAP = Math.round(preview.result.effectiveAP);
      const facingArmor = Math.round(preview.result.facingArmor);

      sections.push({
        title: "Preview Odds",
        entries: [
          { label: "Accuracy", value: `${accuracy}%` },
          { label: "Shots", value: shots.toString() },
          { label: "Expected Hits", value: expectedHits },
          { label: "Damage / Hit", value: `${damagePerHit}%` },
          { label: "Expected Damage", value: `${expectedDamage}%` },
          { label: "Penetration", value: `${effectiveAP} vs ${facingArmor}` }
        ]
      });
    }

    sections.push({
      title: "Outcome",
      entries: [
        { label: "Damage Dealt", value: `${meta.inflictedDamage}` },
        {
          label: "Defender Remaining",
          value: `${Math.max(0, resolution.defenderRemainingStrength)}%`
        },
        {
          label: "Attacker Remaining",
          value:
            typeof resolution.attackerRemainingStrength === "number"
              ? `${Math.max(0, resolution.attackerRemainingStrength)}%`
              : "--"
        },
        {
          label: "Retaliation",
          value: resolution.retaliationOccurred ? `${meta.retaliationDamage}` : "None"
        }
      ]
    });

    return sections;
  }

  /**
   * Retrieves the current player unit stationed on the provided hex so intel queries remain consistent.
   */
  private resolvePlayerUnitSnapshot(hexKey: string): ScenarioUnit | null {
    const parsed = CoordinateSystem.parseHexKey(hexKey);
    if (!parsed) {
      return null;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const engine = this.battleState.ensureGameEngine();
    return engine.playerUnits.find((unit) => unit.hex.q === axial.q && unit.hex.r === axial.r) ?? null;
  }

  /**
   * Looks up the current strength value for the player's unit on the specified hex, returning null when none is present.
   */
  private lookupPlayerUnitStrength(hexKey: string): number | null {
    const unit = this.resolvePlayerUnitSnapshot(hexKey);
    return typeof unit?.strength === "number" ? unit.strength : null;
  }

  /**
   * Looks up the current ammo count for the player's unit on the specified hex, returning null when none is present.
   */
  private lookupPlayerUnitAmmo(hexKey: string): number | null {
    const unit = this.resolvePlayerUnitSnapshot(hexKey);
    return typeof unit?.ammo === "number" ? unit.ammo : null;
  }

  private lookupPlayerUnitFuel(hexKey: string): number | null {
    const unit = this.resolvePlayerUnitSnapshot(hexKey);
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
    commandState: UnitCommandState | null
  ): BattleSelectionIntel {
    return {
      kind: "battle",
      hexKey,
      terrainName: this.lookupTerrainName(hexKey),
      unitLabel,
      unitStrength: typeof unit.strength === "number" ? unit.strength : null,
      unitAmmo: typeof unit.ammo === "number" ? unit.ammo : null,
      unitFuel: this.lookupPlayerUnitFuel(hexKey),
      unitEntrenchment: typeof unit.entrench === "number" ? unit.entrench : null,
      movementRemaining: movementBudget ? movementBudget.remaining : null,
      movementMax: movementBudget ? movementBudget.max : null,
      moveOptions: this.playerMoveHexes.size,
      attackOptions: this.playerAttackHexes.size,
      statusMessage,
      statusChips: this.buildBattleIntelStatusChips(unit, commandState),
      actionCards: this.buildBattleIntelActions(hexKey, unit, commandState),
      notes: this.buildBattleIntelNotes(unit, commandState)
    };
  }

  private buildBattleIntelStatusChips(unit: ScenarioUnit, commandState: UnitCommandState | null): BattleIntelChip[] {
    const chips: BattleIntelChip[] = [];
    if (commandState) {
      if (commandState.isAutomated) {
        chips.push({ label: "Automated Convoy", tone: "warning" });
      }
      if (commandState.suppressionState === "pinned") {
        chips.push({ label: `Pinned x${commandState.suppressorCount}`, tone: "danger" });
      } else if (commandState.suppressionState === "suppressed") {
        chips.push({ label: "Suppressed", tone: "warning" });
      }
      if (commandState.existingHexModification) {
        chips.push({
          label: this.toTitleCase(this.describeHexModification(commandState.existingHexModification.type)),
          tone: commandState.existingHexModification.type === "tankTraps" ? "warning" : "good"
        });
      }
    }
    if (unit.entrench > 0) {
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
    if (commandState.isEngineer) {
      const buildReason = commandState.buildReason;
      actions.push(
        {
          id: "fortifications",
          label: "Fortify Hex",
          detail: "Build defensive works that improve cover for infantry and specialist defenders here.",
          tone: "defense",
          available: commandState.canBuildModification,
          reason: buildReason
        },
        {
          id: "tankTraps",
          label: "Lay Tank Traps",
          detail: "Create an anti-vehicle obstacle that sharply slows wheeled and tracked movement.",
          tone: "denial",
          available: commandState.canBuildModification,
          reason: buildReason
        },
        {
          id: "clearedPath",
          label: "Clear Path",
          detail: "Open a faster lane through the hex so follow-on battalions can move more quickly.",
          tone: "mobility",
          available: commandState.canBuildModification,
          reason: buildReason
        }
      );
    }
    return actions;
  }

  private buildBattleIntelNotes(unit: ScenarioUnit, commandState: UnitCommandState | null): string[] {
    const notes: string[] = [];
    if (!commandState) {
      return notes;
    }
    if (commandState.suppressionState === "pinned") {
      notes.push(`Pinned by ${commandState.suppressorCount} enemy suppressors. This battalion cannot move or retaliate until the pin is broken, and assault fire is unavailable.`);
    } else if (commandState.suppressionState === "suppressed") {
      notes.push("Under suppressive fire this turn. The battalion may still move and fire, but it cannot initiate assault fire until the next friendly turn begins.");
    }
    if (commandState.existingHexModification) {
      notes.push(`This hex already contains ${this.describeHexModification(commandState.existingHexModification.type)}. Only one engineer-built modification may occupy a hex at a time.`);
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

  private canUnitDigIn(unit: ScenarioUnit): boolean {
    const definition = this.unitTypes[unit.type as keyof UnitTypeDictionary];
    return definition?.moveType === "leg" && ["infantry", "recon", "specialist"].includes(definition?.class ?? "");
  }

  private isEngineerBattleUnit(unit: ScenarioUnit): boolean {
    const definition = this.unitTypes[unit.type as keyof UnitTypeDictionary];
    const traits = (definition?.traits ?? []) as readonly string[];
    return unit.type.toLowerCase().includes("engineer") || traits.includes("engineer");
  }

  private describeHexModification(type: HexModificationType): string {
    switch (type) {
      case "fortifications":
        return "fortifications";
      case "tankTraps":
        return "tank traps";
      case "clearedPath":
        return "a cleared path";
      default:
        return "fieldworks";
    }
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
  private resolveUnitLabelForHex(hexKey: string): string | null {
    const parsed = CoordinateSystem.parseHexKey(hexKey);
    if (!parsed) {
      return null;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const engine = this.battleState.ensureGameEngine();
    const unit = engine.playerUnits.find((u) => u.hex.q === axial.q && u.hex.r === axial.r);
    if (!unit) {
      return null;
    }
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
    if (typeof renderer.renderHexModification === "function") {
      engine.getHexModificationSnapshots().forEach((modification) => {
        const { col, row } = CoordinateSystem.axialToOffset(modification.hex.q, modification.hex.r);
        renderer.renderHexModification(CoordinateSystem.makeHexKey(col, row), modification);
      });
    }
    const factions: Array<{ units: ScenarioUnit[]; label: "Player" | "Ally" }> = [
      { units: engine.playerUnits ?? [], label: "Player" },
      { units: engine.allyUnits ?? [], label: "Ally" }
    ];

    factions.forEach(({ units, label }) => {
      units.forEach((unit) => {
        const def = this.unitTypes[unit.type as keyof UnitTypeDictionary];
        // Keep aircraft off the ground map; they operate via the Air Support system instead.
        if (def?.moveType === "air") {
          return;
        }
        if (!unit.hex || !Number.isFinite(unit.hex.q) || !Number.isFinite(unit.hex.r)) {
          console.warn("[BattleScreen] Skipping malformed engine unit without a valid hex during render", {
            label,
            type: unit.type,
            unitId: unit.unitId ?? null,
            hex: unit.hex ?? null,
            facing: (unit as { facing?: unknown }).facing ?? null
          });
          return;
        }
        const { col, row } = CoordinateSystem.axialToOffset(unit.hex.q, unit.hex.r);
        const hexKey = CoordinateSystem.makeHexKey(col, row);
        renderer.renderUnit(hexKey, unit, label);

        // Temporary debug overlay: mark placements regardless of recon/LOS
        if (this.debugPlacementOverlayEnabled && typeof renderer.renderDebugMarker === "function") {
          renderer.renderDebugMarker(hexKey, {
            label: label === "Player" ? "P" : "A",
            color: label === "Player" ? "#1890ff" : "#52c41a",
            opacity: label === "Player" ? 0.55 : 0.5
          });
        }
      });
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

    enemyContacts.forEach((contact) => {
      const renderUnit = this.buildEnemyContactRenderUnit(contact, engine.botUnits ?? []);
      if (!renderUnit) {
        return;
      }
      const { col, row } = CoordinateSystem.axialToOffset(contact.hex.q, contact.hex.r);
      const hexKey = CoordinateSystem.makeHexKey(col, row);
      renderer.renderUnit(hexKey, renderUnit, "Bot", contact.state);

      if (this.debugPlacementOverlayEnabled && typeof renderer.renderDebugMarker === "function") {
        renderer.renderDebugMarker(hexKey, {
          label: "B",
          color: "#fa541c",
          opacity: contact.state === "visible" ? 0.5 : 0.35
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
    if (suppressedBy && suppressedBy.length > 0) {
      console.log(`[BattleScreen] buildEnemyContactRenderUnit - Bot unit ${scenarioType} has suppressedBy:`, suppressedBy);
    }

    return {
      type: scenarioType,
      hex: { ...contact.hex },
      strength: this.normalizeContactStrengthEstimate(contact, liveUnit),
      experience: liveUnit?.experience ?? 0,
      ammo: liveUnit?.ammo ?? 0,
      fuel: liveUnit?.fuel ?? 0,
      entrench: liveUnit?.entrench ?? 0,
      facing: liveUnit?.facing ?? "S",
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
        // Handle hex as array [q, r]
        const hexArray = objective.hex as unknown as [number, number];
        this.objectiveHexKeys.add(`${hexArray[0]},${hexArray[1]}`);
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
    this.hideAttackDialog();
    this.pendingAttack = null;
    this.attackConfirmationLocked = false;
    this.missionRulesController = null;
    this.missionStatus = null;
    this.lastMissionPhaseId = null;
    this.missionEndPrompted = false;
    this.selectedHexKey = null;
    this.defaultSelectionKey = null;
    this.playerMoveHexes.clear();
    this.playerAttackHexes.clear();
    this.pendingIdleTurnAdvance = null;
    this.lastFocusedHexKey = null;
    this.lastViewportTransform = null;
    this.lastAnnouncement = null;
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
    this.hexMapRenderer?.renderBaseCampMarker(null);
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
    const raw = this.deepCloneValue(this.scenarioSource) as {
      name?: unknown;
      size?: { cols?: unknown; rows?: unknown } | unknown;
      tilePalette: Record<string, unknown>;
      tiles: unknown[];
      objectives: unknown[];
      turnLimit?: unknown;
      playerBudget?: unknown;
      restrictedUnits?: unknown[];
      allowedUnits?: unknown[];
      sides?: Record<string, unknown>;
      deploymentZones?: unknown[];
    };

    const paletteEntries = Object.entries(raw.tilePalette ?? {}).map(([key, definition]) => {
      return [key, this.normalizeTileDefinition(definition as { terrain: string; terrainType: string; density: string; features: string[]; recon: string })];
    });
    const palette: TilePalette = Object.fromEntries(paletteEntries);

    const tiles: TileInstance[][] = (raw.tiles as unknown[] ?? []).map((row: unknown, rowIndex: number) =>
      (row as unknown[]).map((entry: unknown, columnIndex: number) => {
        if (typeof entry === "string") {
          return { tile: entry } satisfies TileInstance;
        }

        if ((entry as { tile?: string }).tile) {
          return this.normalizeTileInstance(entry as { tile: string; recon?: string; density?: string; features?: string[] });
        }

        const inlineKey = `inline_${rowIndex}_${columnIndex}`;
        const inlineDefinition = entry as unknown as TileDefinition;
        palette[inlineKey] = this.normalizeTileDefinition(inlineDefinition);
        return { tile: inlineKey } satisfies TileInstance;
      })
    );

    const objectives = (raw.objectives as unknown[] ?? []).map((objective: unknown) => {
      const obj = objective as { owner?: unknown; vp?: unknown; hex?: unknown };
      return {
        owner: (obj.owner as "Player" | "Bot") ?? "Bot",
        vp: Number(obj.vp ?? 0),
        hex: this.tupleToAxial((obj.hex as [number, number]) ?? [0, 0])
      };
    });

    const convertSide = (sideKey: "Player" | "Bot" | "Ally"): ScenarioSide => {
      const sidesRecord = raw.sides as unknown as Record<"Player" | "Bot" | "Ally", {
        hq?: [number, number] | Axial;
        general?: ScenarioSide["general"];
        units?: Array<Partial<ScenarioUnit> & { type?: unknown; hex?: unknown }>;
        goal?: string;
        strategy?: string;
        resources?: number;
        objectives?: string[];
      } | undefined>;
      const side = sidesRecord[sideKey];
      if (!side) {
        // Provide an empty scaffold to keep typing satisfied when optional Ally side is absent.
        return {
          hq: this.tupleToAxial([0, 0]),
          general: { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 },
          units: []
        } satisfies ScenarioSide;
      }
      const general = side.general ?? { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 };
      const hqTuple: [number, number] = Array.isArray(side.hq)
        ? [Number(side.hq[0] ?? 0), Number(side.hq[1] ?? 0)]
        : [0, 0];
      const normalized: ScenarioSide = {
        hq: this.tupleToAxial(hqTuple),
        general: this.deepCloneValue(general),
        units: (side.units ?? []).map((unit) =>
          this.normalizeScenarioUnit({
            type: (unit.type as string) ?? "Unknown_Unit",
            hex: Array.isArray(unit.hex)
              ? [Number(unit.hex[0] ?? 0), Number(unit.hex[1] ?? 0)]
              : [0, 0],
            strength: (unit.strength as number) ?? 0,
            experience: (unit.experience as number) ?? 0,
            ammo: (unit.ammo as number) ?? 0,
            fuel: (unit.fuel as number) ?? 0,
            entrench: (unit.entrench as number) ?? 0,
            facing: unit.facing as ScenarioUnit["facing"],
            preDeployed: (unit as { preDeployed?: boolean }).preDeployed,
            unitId: (unit as { unitId?: string }).unitId
          })
        )
      } satisfies ScenarioSide;

      const optionalSide = side as {
        goal?: string;
        strategy?: string;
        resources?: number;
        objectives?: string[];
      };

      if (optionalSide.goal !== undefined) {
        normalized.goal = optionalSide.goal;
      }
      if (optionalSide.strategy !== undefined) {
        normalized.strategy = optionalSide.strategy;
      }
      if (optionalSide.resources !== undefined) {
        normalized.resources = optionalSide.resources;
      }
      if (optionalSide.objectives !== undefined) {
        normalized.objectives = optionalSide.objectives;
      }

      return normalized;
    };

    return {
      name: (raw.name as string) ?? "Unnamed Scenario",
      size: { cols: Number((raw.size as { cols?: unknown })?.cols ?? 0), rows: Number((raw.size as { rows?: unknown })?.rows ?? 0) },
      tilePalette: palette,
      tiles,
      objectives,
      turnLimit: getMissionTurnLimit(missionKey, this.uiState?.selectedDifficulty ?? "Normal"),
      playerBudget: typeof raw.playerBudget === "number" ? raw.playerBudget : undefined,
      restrictedUnits: Array.isArray(raw.restrictedUnits) ? raw.restrictedUnits.map((unitKey: unknown) => String(unitKey)) : undefined,
      allowedUnits: Array.isArray(raw.allowedUnits) ? raw.allowedUnits.map((unitKey: unknown) => String(unitKey)) : undefined,
      sides: {
        Player: convertSide("Player"),
        Bot: convertSide("Bot"),
        Ally: convertSide("Ally")
      },
      deploymentZones: (raw.deploymentZones as unknown[] | undefined)?.map((zone: unknown): ScenarioDeploymentZone => {
        const z = zone as { key?: string; label?: string; description?: string; capacity?: number; faction?: string; hexes?: Array<[number, number]> };
        const hexes: readonly [number, number][] = (z.hexes ?? []).map((hex) => {
          const tuple: [number, number] = Array.isArray(hex)
            ? [Number(hex[0] ?? 0), Number(hex[1] ?? 0)]
            : [0, 0];
          return tuple;
        });
        return {
          key: z.key ?? "unknown-zone",
          label: z.label ?? "",
          description: z.description ?? "",
          capacity: z.capacity ?? 0,
          faction: (z.faction as "Player" | "Bot" | "Ally") ?? "Player",
          hexes
        } satisfies ScenarioDeploymentZone;
      })
    } satisfies ScenarioData;
  };

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
   * Coerces palette definitions into typed terrain entries while preserving feature metadata.
   */
  private normalizeTileDefinition(definition: { terrain: string; terrainType: string; density: string; features: string[]; recon: string }): TileDefinition {
    return {
      terrain: definition.terrain as TerrainKey,
      terrainType: definition.terrainType as TerrainType,
      density: definition.density as TerrainDensity,
      features: (definition.features ?? []).map((feature) => feature as TerrainFeature),
      recon: definition.recon as ReconStatus
    } satisfies TileDefinition;
  }

  /**
   * Normalizes tile instance overrides so recon and density adjustments flow through correctly.
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
   * Converts raw unit payloads into axial coordinates understood by the engine and renderer.
   */
  private normalizeScenarioUnit(unit: {
    type: string;
    hex: [number, number];
    strength: number;
    experience: number;
    ammo: number;
    fuel: number;
    entrench: number;
    facing: ScenarioUnit["facing"];
    preDeployed?: boolean;
    unitId?: string;
  }): ScenarioUnit {
    return {
      type: unit.type as ScenarioUnit["type"],
      hex: this.tupleToAxial(unit.hex),
      strength: unit.strength,
      experience: unit.experience,
      ammo: unit.ammo,
      fuel: unit.fuel,
      entrench: unit.entrench,
      facing: unit.facing,
      // Preserve optional fields so pre-placed units remain on the map and IDs stay stable when present.
      preDeployed: unit.preDeployed,
      unitId: unit.unitId
    } satisfies ScenarioUnit;
  }

  /**
   * Adapts [q, r] tuples from JSON into the Axial structure shared across engine modules.
   */
  private tupleToAxial(coord: [number, number] | Axial): Axial {
    // Scenario JSON encodes hexes as offset coordinates [col, row]; convert to axial for engine/rendering.
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
