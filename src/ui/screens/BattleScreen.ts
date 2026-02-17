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
  type TurnFaction,
  type AirMissionArrival,
  type AirEngagementEvent
} from "../../game/GameEngine";
import type { CombatPreview, AttackResolution } from "../../game/GameEngine";
import type {
  Axial,
  ReconStatus,
  ScenarioData,
  ScenarioSide,
  ScenarioUnit,
  TerrainDefinition,
  TerrainDensity,
  TerrainDictionary,
  TerrainFeature,
  TerrainKey,
  TerrainType,
  TileDefinition,
  TileInstance,
  TilePalette,
  UnitClass,
  UnitTypeDictionary
} from "../../core/types";
import { HexMapRenderer } from "../../rendering/HexMapRenderer";
import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import { losClearAdvanced } from "../../core/LOS";
import { MapViewport } from "../controls/MapViewport";
import { ZoomPanControls } from "../controls/ZoomPanControls";
import { DeploymentPanel, type SelectedHexContext } from "../components/DeploymentPanel";
import { BattleLoadout } from "../components/BattleLoadout";
import { ReserveListPresenter } from "../components/BattleReserves";
import { hexDistance } from "../../core/Hex";
import { SelectionIntelOverlay } from "../announcements/SelectionIntelOverlay";
import { BattleActivityLog } from "../announcements/BattleActivityLog";
import type { ActivityDetailSection } from "../announcements/AnnouncementTypes";
import { ensureCampaignState } from "../../state/CampaignState";
import {
  ensureDeploymentState,
  type DeploymentPoolEntry,
  type DeploymentState,
  type ReserveBlueprint
} from "../../state/DeploymentState";
import type { UIState } from "../../state/UIState";
import scenarioSource from "../../data/scenario01.json";
import terrainSource from "../../data/terrain.json";
import unitTypesSource from "../../data/unitTypes.json";

/**
 * Provides structured data for the centered intel overlay describing the currently highlighted hex.
 * Phase 1 stores the payload so forthcoming UI overlays can render persistent intel without re-querying engine state.
 */
interface DeploymentSelectionIntel {
  readonly kind: "deployment";
  readonly hexKey: string;
  readonly terrainName: string | null;
  readonly zoneLabel: string | null;
  readonly remainingCapacity: number | null;
  readonly totalCapacity: number | null;
  readonly notes: readonly string[];
}

/**
 * Describes player-controlled unit details when the commander selects a friendly formation during battle.
 */
interface BattleSelectionIntel {
  readonly kind: "battle";
  readonly hexKey: string;
  readonly terrainName: string | null;
  readonly unitLabel: string | null;
  readonly unitStrength: number | null;
  readonly unitAmmo: number | null;
  readonly movementRemaining: number | null;
  readonly movementMax: number | null;
  readonly moveOptions: number;
  readonly attackOptions: number;
  readonly statusMessage: string;
}

/**
 * Captures intel when the commander inspects an empty hex or non-player unit during the battle phase.
 */
interface TerrainSelectionIntel {
  readonly kind: "terrain";
  readonly hexKey: string;
  readonly terrainName: string | null;
  readonly notes: readonly string[];
}

type SelectionIntel = DeploymentSelectionIntel | BattleSelectionIntel | TerrainSelectionIntel;

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
  private readonly scenario: ScenarioData;
  private readonly unitTypes: UnitTypeDictionary;
  private readonly terrain: TerrainDictionary;
  private element: HTMLElement;
  private keyboardNavigationHandler: (event: KeyboardEvent) => void;
  private defaultSelectionKey: string | null;
  private deploymentPrimed = false;
  private battleUpdateUnsubscribe: (() => void) | null = null;
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

  // Air Support: temporary range overlay keys while picking mission targets
  private airPreviewKeys: Set<string> = new Set();
  private airPreviewListener: ((e: Event) => void) | null = null;
  private airClearPreviewListener: ((e: Event) => void) | null = null;
  private seenAirReportIds: Set<string> = new Set();

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

  // Hex selection state
  private selectedHexKey: string | null = null;
  private playerMoveHexes: Set<string> = new Set();
  private playerAttackHexes: Set<string> = new Set();
  private pendingAttack: PendingAttackContext | null = null;
  private idleUnitHighlightKeys: Set<string> = new Set();
  // Tracks focus management for the attack confirmation dialog so keyboard users remain within the modal context.
  private attackDialogPreviouslyFocused: HTMLElement | null = null;
  private attackDialogKeydownHandler: (event: KeyboardEvent) => void;
  // Prevents double-submitting the confirmation dialog via rapid key presses or overlapping handlers.
  private attackConfirmationLocked = false;

  /**
   * Prepares and displays the attack confirmation dialog so the commander can approve or cancel combat resolution.
   * Stores the pending attacker/target hexes to be replayed once the user confirms.
   */
  private promptAttackConfirmation(attacker: Axial, defender: Axial): void {
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
    const preview = engine.previewAttack(attacker, defender);

    this.pendingAttack = {
      attacker: attackerHex,
      target: defenderHex,
      preview
    };

    if (!preview) {
      // No valid preview (LOS blocked or out of range)
      this.attackConfirmBody.innerHTML = `
        <p>Cannot attack target. Line of sight may be blocked or target out of range.</p>
      `;
      this.showAttackDialog();
      return;
    }

    // Get unit labels from the unit type definitions
    const attackerType = preview.attacker.type;
    const defenderType = preview.defender.type;
    const attackerDef = this.unitTypes[attackerType];
    const attackerLabel = this.toTitleCase(attackerType);
    const defenderLabel = this.toTitleCase(defenderType);

    // Build detailed combat preview with explicit commander/payload breakdowns.
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
    const damagePerHitSummary = `${prePayloadDamagePerHit.toFixed(3)}% → ${postPayloadDamagePerHit.toFixed(3)}%`;

    const baseExpectedDamage = preview.result.expectedDamage;
    const postPayloadExpectedDamage = preview.finalExpectedDamage;
    const baseExpectedSuppression = preview.result.expectedSuppression;
    const postPayloadExpectedSuppression = preview.finalExpectedSuppression;
    const expectedDamageSummary = `${baseExpectedDamage.toFixed(1)}% → ${postPayloadExpectedDamage.toFixed(1)}%`;
    const suppressionSummary = `${baseExpectedSuppression.toFixed(1)} → ${postPayloadExpectedSuppression.toFixed(1)}`;

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
      `Base ${baseAccuracyPercent.toFixed(1)}% × Cmd x${commanderAccuracyScalar.toFixed(2)} = ${baseWithCommander.toFixed(1)}%, ` +
      `Exp ${experienceAccuracyDelta.toFixed(1)}% × Cmd x${commanderAccuracyScalar.toFixed(2)} = ${experienceWithCommander.toFixed(1)}%, ` +
      `Sum ${combinedAfterCommander.toFixed(1)}% × Terrain ${terrainMultiplier.toFixed(2)} (${terrainDeltaText}) = ${afterTerrain.toFixed(1)}% × Spot ${spottedMultiplier.toFixed(2)} = ${finalPreClamp.toFixed(1)}% → Final ${accuracyDetails.final.toFixed(1)}%`;

    const damageBreakdownLine =
      `Table ${baseDamagePerHit.toFixed(3)}% × Exp x${experienceScalar.toFixed(2)} = ${preCommanderDamagePerHit.toFixed(3)}% × Cmd x${commanderDamageScalar.toFixed(2)} = ${prePayloadDamagePerHit.toFixed(3)}%`;

    // Calculate attack range and real-world distance
    const distance = Math.abs(attacker.q - defender.q) + Math.abs(attacker.r - defender.r) + Math.abs((-attacker.q - attacker.r) - (-defender.q - defender.r));
    const range = Math.floor(distance / 2);
    const attackerRangeMin = attackerDef?.rangeMin ?? 1;
    const attackerRangeMax = attackerDef?.rangeMax ?? 1;
    const realWorldDistanceMeters = range * 250;  // 1 hex = 250 meters (NEW SCALE)
    const realWorldDistanceKm = realWorldDistanceMeters >= 1000
      ? `${(realWorldDistanceMeters / 1000).toFixed(1)}km`
      : `${realWorldDistanceMeters}m`;

    // Determine penetration status
    const penetrationStatus = effectiveAP >= facingArmor
      ? `<span style="color: #66bb6a;">✓ Penetration</span>`
      : `<span style="color: #ef5350;">⚠ Underpenetrated</span>`;

    // Determine hit chance quality
    const roundedAccuracy = Math.round(finalAccuracyPercent);
    const accuracyQuality = roundedAccuracy >= 75
      ? `<span style="color: #66bb6a;">${roundedAccuracy}%</span>`
      : roundedAccuracy >= 50
        ? `<span style="color: #ffa726;">${roundedAccuracy}%</span>`
        : `<span style="color: #ef5350;">${roundedAccuracy}%</span>`;

    this.attackConfirmBody.innerHTML = `
      <div style="margin-bottom: 1rem;">
        <p><strong style="color: #66bb6a;">Your ${this.escapeHtml(attackerLabel)}</strong> at <strong>${this.escapeHtml(attackerHex)}</strong></p>
        <p style="margin-left: 1rem; font-size: 0.9rem; color: var(--text-muted);">Strength: ${attackerStrength}% • Effective Range: ${attackerRangeMin * 250}m-${attackerRangeMax >= 10 ? (attackerRangeMax * 0.25).toFixed(1) + 'km' : (attackerRangeMax * 250) + 'm'}</p>
      </div>
      <div style="text-align: center; margin: 1rem 0; font-size: 1.2rem;">
        ⚔️ <span style="font-size: 0.85rem; color: var(--accent-strong);">Engaging at ${realWorldDistanceKm}</span>
      </div>
      <div style="margin-bottom: 1.5rem;">
        <p><strong style="color: #ef5350;">Enemy ${this.escapeHtml(defenderLabel)}</strong> at <strong>${this.escapeHtml(defenderHex)}</strong></p>
        <p style="margin-left: 1rem; font-size: 0.9rem; color: var(--text-muted);">Strength: ${defenderStrength}% • Armor: ${facingArmor}</p>
      </div>
      <div style="background: rgba(0,0,0,0.2); padding: 0.75rem; border-radius: 6px; margin-bottom: 1rem;">
        <h4 style="margin: 0 0 0.5rem 0; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--accent-strong);">ATTACK PREVIEW</h4>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.4rem; font-size: 0.85rem;">
          <div style="display: flex; justify-content: space-between;">
            <span>Accuracy:</span>
            <strong>${accuracyQuality}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Shots:</span>
            <strong>${shots}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Expected Hits:</span>
            <strong>${expectedHits}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Damage/Hit:</span>
            <strong>${postPayloadDamagePerHit.toFixed(3)}%</strong>
          </div>
          <div style="display: flex; justify-content: space-between; grid-column: 1 / -1; padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.1);">
            <span>Expected Damage (pre-payload):</span>
            <strong>${baseExpectedDamage.toFixed(1)}%</strong>
          </div>
          <div style="display: flex; justify-content: space-between; grid-column: 1 / -1;">
            <span>Expected Damage (with payload):</span>
            <strong style="color: var(--accent-strong);">${postPayloadExpectedDamage.toFixed(1)}%</strong>
          </div>
          <div style="display: flex; justify-content: space-between; grid-column: 1 / -1;">
            <span>Expected Suppression:</span>
            <strong>${baseExpectedSuppression.toFixed(1)} → ${postPayloadExpectedSuppression.toFixed(1)}</strong>
          </div>
          <div style="display: flex; justify-content: space-between; grid-column: 1 / -1; font-size: 0.8rem;">
            <span>Penetration:</span>
            <strong>${effectiveAP} vs ${facingArmor} ${penetrationStatus}</strong>
          </div>
          <div style="display: flex; flex-direction: column; grid-column: 1 / -1; font-size: 0.75rem; color: var(--text-muted); padding-top: 0.4rem; border-top: 1px solid rgba(255,255,255,0.08);">
            <span><strong>Accuracy Breakdown:</strong> ${this.escapeHtml(accuracyBreakdownLine)}</span>
            <span><strong>Damage Breakdown:</strong> ${this.escapeHtml(damageBreakdownLine)}</span>
            <span><strong>Payload:</strong> ×${damageMultiplier} (${damageMultiplierDescription}) &bull; Suppression ×${suppressionMultiplier} (${suppressionMultiplierDescription})</span>
            <span><strong>Commander Bonuses:</strong> Accuracy +${commanderAccuracyBonus}% • Damage +${commanderDamageBonus}%</span>
            <span><strong>Accuracy Summary:</strong> ${baseAccuracyPercent.toFixed(1)}% → ${accuracyDetails.final.toFixed(1)}%</span>
            <span><strong>Damage / Hit:</strong> ${damagePerHitSummary}</span>
            <span><strong>Expected Damage:</strong> ${expectedDamageSummary}</span>
            <span><strong>Expected Suppression:</strong> ${suppressionSummary}</span>
          </div>
        </div>
      </div>
    `;
    this.showAttackDialog();
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
          preview = engine.previewAttack(attacker, defender);
          if (preview) {
            const defenderDefinition = this.unitTypes?.[preview.defender.type as keyof UnitTypeDictionary];
            const targetClass = defenderDefinition?.class;
            const targetIsHardTarget = targetClass === "vehicle" || targetClass === "tank" || targetClass === "air";
            await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
            // Await combat animation so the visual cue lands before we mutate engine state.
            await this.hexMapRenderer.playAttackSequence(attackerHex, defenderHex, targetIsHardTarget);
          }
        } catch (animationError) {
          console.warn("[BattleScreen] Player attack animation failed; continuing without playback.", animationError);
        }
      }

      const resolution = engine.attackUnit(attacker, defender);

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
          await new Promise<void>((resolve) => window.setTimeout(resolve, 120));
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
        this.focusCameraOnHex(attackerKey);
      }

      // Brief pause to show attacker
      await this.waitForNextFrame();
      await new Promise((resolve) => setTimeout(resolve, 400));

      // Focus camera on the target
      if (canFocusCamera) {
        this.focusCameraOnHex(targetKey);
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
    const activeElement = document.activeElement;
    this.attackDialogPreviouslyFocused = activeElement instanceof HTMLElement ? activeElement : null;
    this.attackConfirmDialog.classList.remove("hidden");
    this.attackConfirmDialog.setAttribute("aria-hidden", "false");
    this.attackConfirmDialog.addEventListener("keydown", this.attackDialogKeydownHandler);
    this.attackConfirmationLocked = false;
    this.attackConfirmAccept.focus();
  }

  /**
   * Converts an axial coordinate into the renderer's offset-key string, returning null when outside the map bounds.
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
  }

  /** Escapes HTML-sensitive characters when composing dialog copy. */
  private escapeHtml(text: string): string {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
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
            this.announceBattleUpdate("Deployment zone is at capacity. Choose a different hex.");
            return;
          }

          const parsed = CoordinateSystem.parseHexKey(hexKey);
          if (!parsed) {
            return;
          }
          const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
          try {
            engine.deployUnitByKey(axial, unitKey);
            const label = this.resolveUnitLabel(unitKey);
            this.announceBattleUpdate(`Deployed ${label} to ${hexKey}.`);
            this.refreshDeploymentMirrors("deploy", { unitKey, hexKey, label });
          } catch (error) {
            console.error("Failed to deploy unit via key", unitKey, error);
            this.announceBattleUpdate("Unable to deploy unit. Check console for details.");
          }
          break;
        }
        case "recall": {
          const hexKey = event.payload?.hexKey as string;
          if (!hexKey) {
            return;
          }
          try {
            engine.recallUnitByHexKey(hexKey);
            const recalledLabel = this.resolveUnitLabelForHex(hexKey);
            if (!recalledLabel) {
              throw new Error(`[BattleScreen] Unable to resolve label while recalling unit at ${hexKey}.`);
            }
            this.announceBattleUpdate(`Recalled ${recalledLabel} from ${hexKey}.`);
            this.refreshDeploymentMirrors("recall", { hexKey, label: recalledLabel });
          } catch (error) {
            console.error("Failed to recall unit from", hexKey, error);
            this.announceBattleUpdate("Unable to recall unit. Check console for details.");
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
          // During gameplay, zone outlines are not shown; movement/attack overlays are handled by selection feedback.
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
      this.announceBattleUpdate("Deployment action failed. Check console for details.");
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
        const resolveUnitOffsetKey = (squadronIdOrHexKey: string, faction: "Player" | "Bot"): string | null => {
          const reserves = faction === "Player" ? (engine.reserveUnits ?? []).map((entry) => entry.unit) : [];
          const units = faction === "Player" ? [...(engine.playerUnits ?? []), ...reserves] : (engine.botUnits ?? []);
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
    return faction === "Player" ? "Player" : "Enemy";
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
      alert("Please assign a base camp before beginning the battle.");
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
   * Focuses the camera on a specific hex using MapViewport transforms.
   */
  private focusCameraOnHex(hexKey: string): void {
    if (!this.mapViewport || !this.hexMapRenderer) {
      console.warn("[BattleScreen] focusCameraOnHex: mapViewport or hexMapRenderer is null", {
        hasViewport: !!this.mapViewport,
        hasRenderer: !!this.hexMapRenderer
      });
      return;
    }

    const cell = this.hexMapRenderer.getHexElement(hexKey);
    if (!cell) {
      console.warn("[BattleScreen] focusCameraOnHex: cell not found for hexKey:", hexKey);
      return;
    }

    const cx = Number(cell.dataset.cx ?? 0);
    const cy = Number(cell.dataset.cy ?? 0);

    console.log("[BattleScreen] focusCameraOnHex:", { hexKey, cx, cy, dataset: cell.dataset });

    if (cx === 0 && cy === 0) {
      console.warn("[BattleScreen] focusCameraOnHex: cx and cy are both 0, skipping", { hexKey });
      return;
    }

    console.log("[BattleScreen] Calling mapViewport.centerOn:", { cx, cy });
    this.mapViewport.centerOn(cx, cy);
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
    const fallback = this.computeDefaultSelectionKey();
    if (fallback) {
      this.applySelectedHex(fallback);
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
          console.log("[BattleScreen] deploymentUpdated received", {
            committedEntries: ensureDeploymentState().getCommittedEntryKeys(),
            deploymentPrimed: this.deploymentPrimed
          });
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
          this.updateAirHudWidget();
          this.syncAirMissionLogs();
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
    this.scenario = this.buildScenarioData();
    this.unitTypes = this.buildUnitTypeDictionary();
    this.terrain = this.buildTerrainDictionary();
    this.keyboardNavigationHandler = (event) => this.handleMapNavigation(event);
    this.attackDialogKeydownHandler = (event) => this.handleAttackDialogKeydown(event);
    this.defaultSelectionKey = this.computeDefaultSelectionKey();

    const battleScreen = document.getElementById("battleScreen");
    if (!battleScreen) {
      throw new Error("Battle screen element (#battleScreen) not found in DOM");
    }
    this.element = battleScreen;

    // Wire Air Support preview events so the map can visualize combat radius while picking targets
    this.airPreviewListener = (ev: Event) => this.handleAirPreviewRange(ev as CustomEvent<{ origin: Axial; radius: number }>);
    this.airClearPreviewListener = () => this.clearAirPreviewOverlay();
    document.addEventListener("air:previewRange", this.airPreviewListener);
    document.addEventListener("air:clearPreview", this.airClearPreviewListener);

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

    // Initialize overlays now that DOM scaffolding is available.
    this.selectionIntelOverlay = new SelectionIntelOverlay();
    this.selectionIntelOverlay.update(this.selectionIntel);
    this.battleActivityLog?.registerCollapsedChangeListener((collapsed) => this.reflectActivityLogState(collapsed));
    this.battleActivityLog?.sync(this.activityEvents);

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

    // Clear any lingering visual announcements and pending timers when the screen unloads.
    this.selectionIntelOverlay?.dispose();
    this.selectionIntelOverlay = null;
    this.battleActivityLog?.dispose();
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

  private hydrateMissionBriefing(): void {
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
    this.announceBattleUpdate(`${announcementTitle}. ${announcementSummary}`);
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
    // Wire the idle-unit reminder once so end-turn checks can surface the dialog when units still have orders.
    this.bindIdleWarningDialog();
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
      }
    };

    this.idleWarningLayer.addEventListener("click", (event) => {
      if (event.target === this.idleWarningLayer) {
        this.dismissIdleWarning();
      }
    });

    this.idleContinueButton?.addEventListener("click", () => {
      this.dismissIdleWarning();
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
  private *buildUnitQueue(mode: "even" | "grouped"): Generator<string, void, void> {
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
  private finishDeploymentAfterAutoPlacement(engine: GameEngine): void {
    try {
      const reserves = engine.finalizeDeployment();
      engine.startPlayerTurnPhase();
      this.refreshDeploymentMirrors("sync");

      const deploymentState = ensureDeploymentState();
      deploymentState.cacheFrozenReserves(reserves);
      const mirroredReserves = deploymentState.getReserves();
      this.reservePresenter?.markBattlePhaseStarted(reserves, mirroredReserves);
      this.lockDeploymentInteractions();
      this.deploymentPanel?.enableReserveCallups();
      this.updateUIForBattlePhase({
        turnNumber: this.battleState.getCurrentTurnSummary().turnNumber,
        activeFaction: this.battleState.getCurrentTurnSummary().activeFaction,
        reserveCount: mirroredReserves.length,
        phase: this.battleState.getCurrentTurnSummary().phase
      });
      this.collapseDeploymentPanelForBattlePhase();
      this.renderEngineUnits();

      this.announceBattleUpdate("All units deployed. Battle phase begins immediately.");
    } catch (error) {
      console.error("Failed to finalize deployment after auto placement", error);
      this.announceBattleUpdate("Deployment finalized, but transitioning to battle failed. Check console for details.");
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

      const reserveCount = engine.getReserveSnapshot().length;
      this.announceBattleUpdate(
        `Battle phase started. ${reserveCount} reserves standing by. Active faction: ${turnSummary.activeFaction}. Phase: ${turnSummary.phase}.`
      );

    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : "Failed to begin battle. Check console for details.";
      console.error("Failed to begin battle:", error);
      this.announceBattleUpdate(message);
      alert(message);
    }
  }

  /**
   * Ensures the engine is fully seeded with commander-approved allocations and current base camp
   * before any deployment mirrors run or Begin Battle finalizes deployment. This method executes
   * synchronously so UI and engine state cannot diverge.
   */
  private prepareBattleState(enforceAllocations: boolean): GameEngine {
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
  }

  /** Executes the actual turn advance and downstream updates. */
  private async executeTurnAdvance(_preflightSummary: TurnSummary): Promise<void> {
    const report = this.battleState.endPlayerTurn();
    const summary = this.battleState.getCurrentTurnSummary();

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
        } catch {}
      }
    }

  /**
   * Handles ending the mission and returning to headquarters.
   */
  private handleEndMission(): void {
    const confirmed = confirm(
      "End this mission and return to headquarters?\n\n" +
      "This will record your performance in your service record."
    );

    if (!confirmed) {
      return;
    }

    // Gather mission statistics. In Phase 1 we prompt for objectives and casualties to keep the
    // flow simple while the engine outcome hooks mature. Casualties map to campaign manpower later.
    const objectivesInput = prompt("Objectives completed (0-10):", "0");
    const casualtiesInput = prompt("Units lost:", "0");

    if (objectivesInput === null || casualtiesInput === null) {
      return;
    }

    const objectives = Math.max(0, Math.min(10, parseInt(objectivesInput) || 0));
    const casualties = Math.max(0, parseInt(casualtiesInput) || 0);
    const success = objectives >= 5;

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
    } catch {}

    // Apply the outcome back to the strategic layer: deduct resources, shift the active front, and
    // remove the resolved engagement. This keeps the feedback loop tight without breaking existing flows.
    try {
      const campaign = ensureCampaignState();
      const active = campaign.getActiveEngagement();
      campaign.applyBattleOutcome({
        activeEngagementId: campaign.getActiveEngagementId(),
        frontKey: active?.frontKey ?? null,
        result: success ? "PlayerVictory" : "PlayerDefeat",
        casualties,
        spentAmmo,
        spentFuel
      });
    } catch (err) {
      console.warn("Failed to apply battle outcome to campaign layer", err);
    }

    alert(`Mission ${success ? "completed successfully" : "ended"}!`);

    // Return to the campaign screen so the commander sees the updated fronts and resources immediately.
    this.screenManager.showScreenById("campaign");
  }

  /**
   * Handles assigning the base camp location.
   */
  private handleAssignBaseCamp(): void {
    if (!this.selectedHexKey) {
      alert("Select a hex before assigning a base camp.");
      return;
    }
    const engine = this.battleState.ensureGameEngine();
    const parsed = CoordinateSystem.parseHexKey(this.selectedHexKey);
    if (!parsed) {
      alert("Unable to parse selected hex.");
      return;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const deploymentState = ensureDeploymentState();
    const zoneKey = deploymentState.getZoneKeyForHex(this.selectedHexKey);
    if (!zoneKey) {
      this.announceBattleUpdate("Select a deployment zone hex before assigning a base camp.");
      return;
    }
    engine.setBaseCamp(axial);
    if (this.baseCampStatus) {
      this.baseCampStatus.textContent = `Base camp: ${this.selectedHexKey}`;
    }
    this.deploymentPanel?.markBaseCampAssigned(zoneKey);
    const offsetKey = CoordinateSystem.makeHexKey(parsed.col, parsed.row);
    this.hexMapRenderer?.renderBaseCampMarker(offsetKey);
    // Base camp selection adjusts engine state; mirror right away so banners reflect the change.
    this.refreshDeploymentMirrors("baseCamp", { hexKey: this.selectedHexKey });
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
  }

  /**
   * Hydrates the game engine with the commander-approved deployment pool captured during precombat.
   * When allocations exist, we synthesize fresh scenario units, register sprite metadata, and let
   * `initializeFromAllocations()` trigger the engine's reserve rebuild. Returns true when seeding occurred.
   */
  private seedEngineFromDeploymentState(engine: GameEngine): boolean {
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
    if (!this.hexMapRenderer) {
      return;
    }
    const svg = this.element.querySelector<SVGSVGElement>("#battleHexMap");
    const canvas = this.element.querySelector<HTMLDivElement>("#battleMapCanvas");
    if (!svg || !canvas) {
      return;
    }

    this.ensureEngine();
    const scenarioClone = this.cloneScenario();
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
    if (!this.scenario.deploymentZones || this.scenario.deploymentZones.length === 0) {
      return;
    }
    const definitions = this.scenario.deploymentZones.map((zone) => {
      const faction: "Player" | "Bot" | undefined = zone.faction === "Player" ? "Player" : zone.faction === "Bot" ? "Bot" : undefined;
      const hexKeys = zone.hexes.map(([col, row]) => CoordinateSystem.makeHexKey(col, row));
      return {
        zoneKey: zone.key,
        capacity: zone.capacity,
        hexKeys,
        name: zone.label,
        description: zone.description,
        faction
      };
    });
    deploymentState.registerZones(definitions);
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
      // Enable the heuristic planner so campaign battles use the upgraded enemy AI rather than the legacy simple bot.
      botStrategyMode: "Heuristic",
      // Use difficulty from UIState if available, default to Normal
      botDifficulty: this.uiState?.selectedDifficulty ?? "Normal"
    };
    this.battleState.initializeEngine(config);
  }

  private handleHexSelection(key: string): void {
    const engine = this.battleState.ensureGameEngine();
    const summary = engine.getTurnSummary();
    if (summary.phase === "playerTurn") {
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

    if (turnSummary.phase === "deployment") {
      this.announceBattleUpdate("Reserves deploy after the battle begins.");
      return;
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
    } catch {}

    if (this.popupManager.getActivePopup() === "armyRoster") {
      this.popupManager.closePopup();
    }

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
      if (this.baseCampStatus) {
        this.baseCampStatus.textContent = phase === "deployment" ? "No hex selected." : "Select a unit to move or attack.";
      }
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
      const deploymentState = ensureDeploymentState();
      const zoneMeta = this.deploymentPanel?.resolveZoneForHex(key) ?? null;
      const zoneKey = zoneMeta?.key ?? null;
      const zoneLabel = zoneMeta?.name ?? null;
      const zoneHexes = this.deploymentPanel ? this.deploymentPanel.getZoneHexes(zoneKey) : [];

      if (this.baseCampStatus) {
        this.baseCampStatus.textContent = `Selected hex: ${key}`;
      }
      this.hexMapRenderer?.setZoneHighlights(zoneHexes);
      this.deploymentPanel?.setSelectedHex(key, {
        terrainName: terrainLabel,
        zoneKey,
        zoneLabel
      } satisfies SelectedHexContext);

      if (zoneMeta && this.baseCampStatus) {
        const definition = deploymentState.getZoneDefinition(zoneMeta.key);
        const remaining = deploymentState.getRemainingZoneCapacity(zoneMeta.key);
        const capacity = definition?.capacity ?? zoneMeta.totalCapacity;
        const name = definition?.name ?? zoneMeta.name ?? "Deployment zone";
        const capacityMessage = remaining !== null ? `${remaining} of ${capacity} positions open in ${name}.` : `${name} capacity syncing.`;
        this.baseCampStatus.setAttribute("aria-live", "polite");
        this.baseCampStatus.textContent = `Selected hex: ${key} — ${capacityMessage}`;
      }

      const baseAnnouncement = zoneLabel
        ? `Selected ${key}. ${terrainLabel}. Zone ${zoneLabel}.`
        : `Selected ${key}. ${terrainLabel}.`;
      const capacityDetails = zoneMeta
        ? (() => {
            const definition = deploymentState.getZoneDefinition(zoneMeta.key);
            const remaining = deploymentState.getRemainingZoneCapacity(zoneMeta.key);
            const capacity = definition?.capacity ?? zoneMeta.totalCapacity;
            const zoneName = definition?.name ?? zoneMeta.name ?? "Deployment zone";
            return remaining !== null ? `${remaining} of ${capacity} slots open in ${zoneName}.` : `${zoneName} capacity syncing.`;
          })()
        : null;
      const combinedAnnouncement = capacityDetails ? `${baseAnnouncement} ${capacityDetails}` : baseAnnouncement;
      this.announceBattleUpdate(combinedAnnouncement);

      const zoneIntel: DeploymentSelectionIntel = {
        kind: "deployment",
        hexKey: key,
        terrainName: terrainLabel,
        zoneLabel,
        remainingCapacity: zoneMeta ? deploymentState.getRemainingZoneCapacity(zoneMeta.key) : null,
        totalCapacity: zoneMeta ? deploymentState.getZoneDefinition(zoneMeta.key)?.capacity ?? zoneMeta.totalCapacity : null,
        notes: zoneMeta ? [zoneMeta.name ?? "Deployment zone"] : []
      };
      this.publishSelectionIntel(zoneIntel);
      return;
    }

    // Gameplay selection: compute move/attack overlays for player units.
    const parsed = CoordinateSystem.parseHexKey(key);
    if (!parsed) {
      return;
    }
    const axial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);
    const holdsPlayer = engine.playerUnits.some((u) => u.hex.q === axial.q && u.hex.r === axial.r);
    if (holdsPlayer) {
      const moves = engine.getReachableHexes(axial);
      const targets = engine.getAttackableTargets(axial);
      const movementBudget = engine.getMovementBudget(axial);
      this.playerMoveHexes = new Set(moves.map(({ q, r }) => {
        const { col, row } = CoordinateSystem.axialToOffset(q, r);
        return CoordinateSystem.makeHexKey(col, row);
      }));
      this.playerAttackHexes = new Set(targets.map(({ q, r }) => {
        const { col, row } = CoordinateSystem.axialToOffset(q, r);
        return CoordinateSystem.makeHexKey(col, row);
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

      if (this.playerMoveHexes.size === 0 && this.playerAttackHexes.size === 0) {
        statusMessage += " This unit has already moved and attacked this turn.";
      } else if (this.playerMoveHexes.size === 0) {
        statusMessage += ` Unit has moved. ${this.playerAttackHexes.size} attack targets available.`;
      } else if (this.playerAttackHexes.size === 0) {
        statusMessage += ` ${this.playerMoveHexes.size} movement options. Unit has attacked this turn.`;
      } else {
        statusMessage += ` ${this.playerMoveHexes.size} moves, ${this.playerAttackHexes.size} targets.`;
      }

      if (this.baseCampStatus) {
        this.baseCampStatus.textContent = `${unitLabel} @ ${key} — Move:${this.playerMoveHexes.size} Attack:${this.playerAttackHexes.size}`;
      }
      this.announceBattleUpdate(statusMessage);

      const selectionIntel: BattleSelectionIntel = {
        kind: "battle",
        hexKey: key,
        terrainName: this.lookupTerrainName(key),
        unitLabel,
        unitStrength: this.lookupPlayerUnitStrength(key),
        unitAmmo: this.lookupPlayerUnitAmmo(key),
        movementRemaining: movementBudget ? movementBudget.remaining : null,
        movementMax: movementBudget ? movementBudget.max : null,
        moveOptions: this.playerMoveHexes.size,
        attackOptions: this.playerAttackHexes.size,
        statusMessage
      };
      this.publishSelectionIntel(selectionIntel);
    } else {
      this.playerMoveHexes.clear();
      this.playerAttackHexes.clear();
      this.hexMapRenderer?.setZoneHighlights([]);
      if (this.baseCampStatus) {
        this.baseCampStatus.textContent = `Selected hex: ${key}`;
      }
      const terrainIntel: TerrainSelectionIntel = {
        kind: "terrain",
        hexKey: key,
        terrainName: this.lookupTerrainName(key),
        notes: ["Hex unoccupied."]
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
      console.error("Failed to move unit:", err);
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
      return;
    }
    const clickedAxial = CoordinateSystem.offsetToAxial(parsed.col, parsed.row);

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
  private computeDefaultSelectionKey(): string | null {
    const preferredZones = ["zone-alpha", "zone-bravo"];
    for (const zoneKey of preferredZones) {
      const zoneHexes = this.deploymentPanel?.getZoneHexes(zoneKey);
      if (!zoneHexes) {
        continue;
      }
      const iterator = zoneHexes[Symbol.iterator]();
      const first = iterator.next();
      if (!first.done) {
        return first.value;
      }
    }

    if (this.scenario.size.cols === 0 || this.scenario.size.rows === 0) {
      return null;
    }
    return CoordinateSystem.makeHexKey(0, 0);
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
      const expectedDamage = preview.result.expectedDamage.toFixed(1);
      const expectedHits = preview.result.expectedHits.toFixed(1);
      const damagePerHit = preview.result.damagePerHit.toFixed(2);
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

    this.clearAllUnitIcons();

    const engine = this.battleState.ensureGameEngine();
    const factions: Array<{ units: ScenarioUnit[]; label: "Player" | "Bot" }> = [
      { units: engine.playerUnits, label: "Player" },
      { units: engine.botUnits, label: "Bot" }
    ];

    factions.forEach(({ units, label }) => {
      units.forEach((unit) => {
        const def = this.unitTypes[unit.type as keyof UnitTypeDictionary];
        // Keep aircraft off the ground map; they operate via the Air Support system instead.
        if (def?.moveType === "air") {
          return;
        }
        const { col, row } = CoordinateSystem.axialToOffset(unit.hex.q, unit.hex.r);
        const hexKey = CoordinateSystem.makeHexKey(col, row);

        // For bot units, check if player has direct LOS or only spotted visibility
        let isSpottedOnly = false;
        if (label === "Bot") {
          isSpottedOnly = this.checkIfSpottedOnly(unit.hex);
        }

        this.hexMapRenderer?.renderUnit(hexKey, unit, label, isSpottedOnly);
      });
    });

    // Ensure idle formations retain their blue outline after sprite redraws.
    this.refreshIdleUnitHighlights();
  }

  /**
   * Checks if a bot unit is visible only via spotting (no direct LOS from any player unit).
   * Returns true if spotted only, false if any player unit has direct LOS.
   */
  private checkIfSpottedOnly(targetHex: Axial): boolean {
    if (!this.battleState.hasEngine()) {
      return false;
    }

    const engine = this.battleState.ensureGameEngine();

    // Check if any player unit has direct LOS to the target
    for (const playerUnit of engine.playerUnits) {
      // Get unit definition from unit types dictionary
      const playerDef = this.unitTypes[playerUnit.type as keyof UnitTypeDictionary];
      if (!playerDef) continue;

      const hasDirectLOS = losClearAdvanced({
        attackerClass: playerDef.class as any,
        attackerHex: playerUnit.hex,
        targetHex: targetHex,
        isAttackerAir: playerDef.moveType === "air",
        lister: {
          terrainAt: (hex: Axial) => {
            const { col, row } = CoordinateSystem.axialToOffset(hex.q, hex.r);
            const hexKey = CoordinateSystem.makeHexKey(col, row);
            const cell = this.hexMapRenderer?.getHexElement(hexKey);
            if (!cell) return null;

            const terrain = cell.dataset.terrain;
            const terrainType = cell.dataset.terrainType;
            const defense = Number(cell.dataset.defense ?? 0);
            const accMod = Number(cell.dataset.accMod ?? 0);
            const blocksLOS = cell.dataset.blocksLos === "true";

            if (!terrain) return null;

            // Construct minimal TerrainDefinition for LOS checking
            return {
              terrain,
              terrainType,
              defense,
              accMod,
              blocksLOS,
              moveCost: { track: 1, leg: 1, wheel: 1, air: 1 } // Default values for LOS checks
            } as unknown as TerrainDefinition;
          }
        }
      });

      if (hasDirectLOS) {
        return false; // Has direct LOS, not spotted-only
      }
    }

    // No direct LOS from any player unit, so it must be spotted-only
    return true;
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
  private buildScenarioData(): ScenarioData {
    const raw = this.deepCloneValue(scenarioSource) as typeof scenarioSource;

    const paletteEntries = Object.entries(raw.tilePalette).map(([key, definition]) => {
      return [key, this.normalizeTileDefinition(definition)];
    });
    const palette: TilePalette = Object.fromEntries(paletteEntries);

    const tiles: TileInstance[][] = raw.tiles.map((row, rowIndex) =>
      row.map((entry, columnIndex) => {
        if ((entry as { tile?: string }).tile) {
          return this.normalizeTileInstance(entry as { tile: string; recon?: string; density?: string; features?: string[] });
        }

        const inlineKey = `inline_${rowIndex}_${columnIndex}`;
        palette[inlineKey] = this.normalizeTileDefinition(entry as TileDefinition);
        return { tile: inlineKey } satisfies TileInstance;
      })
    );

    const objectives = raw.objectives.map((objective) => ({
      owner: objective.owner as "Player" | "Bot",
      vp: objective.vp,
      hex: this.tupleToAxial(objective.hex as [number, number])
    }));

    const convertSide = (sideKey: "Player" | "Bot"): ScenarioSide => {
      const side = raw.sides[sideKey];
      const normalized: ScenarioSide = {
        hq: this.tupleToAxial(side.hq as [number, number]),
        general: this.deepCloneValue(side.general),
        units: side.units.map((unit) =>
          this.normalizeScenarioUnit({
            type: unit.type,
            hex: unit.hex as [number, number],
            strength: unit.strength,
            experience: unit.experience,
            ammo: unit.ammo,
            fuel: unit.fuel,
            entrench: unit.entrench,
            facing: unit.facing as ScenarioUnit["facing"]
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
      name: raw.name,
      size: this.deepCloneValue(raw.size),
      tilePalette: palette,
      tiles,
      objectives,
      turnLimit: raw.turnLimit,
      sides: {
        Player: convertSide("Player"),
        Bot: convertSide("Bot")
      }
    } satisfies ScenarioData;
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
  }): ScenarioUnit {
    return {
      type: unit.type as ScenarioUnit["type"],
      hex: this.tupleToAxial(unit.hex),
      strength: unit.strength,
      experience: unit.experience,
      ammo: unit.ammo,
      fuel: unit.fuel,
      entrench: unit.entrench,
      facing: unit.facing
    } satisfies ScenarioUnit;
  }

  /**
   * Adapts [q, r] tuples from JSON into the Axial structure shared across engine modules.
   */
  private tupleToAxial([q, r]: [number, number]): Axial {
    return { q, r } satisfies Axial;
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
