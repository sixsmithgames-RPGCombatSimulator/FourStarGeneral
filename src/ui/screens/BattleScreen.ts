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
  HexEdgeFacing,
  HexModification,
  UnitClass,
  UnitTypeDefinition,
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
  BattleIntelDetailSection,
  BattleSelectionIntel,
  DeploymentSelectionIntel,
  SelectionIntel,
  TerrainSelectionIntel
} from "../announcements/AnnouncementTypes";
import { ensureCampaignState } from "../../state/CampaignState";
import { ensureTutorialState, type TutorialPhase } from "../../state/TutorialState";
import { getNextPhase } from "../../data/tutorialSteps";
import {
  findGeneralById,
  updateGeneral,
  saveRosterToLocalStorage,
  type MissionRecord,
  type UnitTypeCount,
  type AmmunitionExpenditure,
  type ObjectiveCompletion
} from "../../utils/rosterStorage";
} from "../../state/DeploymentState";
import { getScenarioByMissionKey, type ScenarioSource } from "../../data/scenarioRegistry";
import { getMissionDeploymentProfile, getMissionTurnLimit } from "../../data/missions";
import { getCombatProfile } from "../../data/combatProfiles";
import { combatBalance } from "../../core/balance";
import terrainSource from "../../data/terrain.json";
import unitTypesSource from "../../data/unitTypes.json";
import { createMissionRulesController, type MissionPhaseStatus, type MissionRulesController, type MissionStatus } from "../../state/missionRules";
import { finalizeDeploymentZone } from "../utils/deploymentZonePlanner";
import { setMissionStartedUI } from "../utils/missionUi";

type ActivityCategory = "player" | "enemy" | "system";
type ActivityType = "attack" | "move" | "deployment" | "supply" | "turn" | "log";

/**
 * WHAT: Extracts the battle action summary helper for accurate low-ammo status messaging.
 * WHY: This helper is used to provide clear feedback about unit's action state.
 */
private buildBattleActionSummary(
  moveOptions: number,
  attackOptions: number,
  ammoStatusMessage: string | null
): string {
  const actionSummary = `Move:${moveOptions} Attack:${attackOptions}`;
  if (ammoStatusMessage) {
    return `${actionSummary} ${ammoStatusMessage}`;
  }
  return actionSummary;
}
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
      canEntrench,
      moveOptions: this.playerMoveHexes.size,
      attackOptions: this.playerAttackHexes.size,
      unitTabs,
      statusMessage,
      statusChips: this.buildBattleIntelStatusChips(unit, commandState),
      actionCards: this.buildBattleIntelActions(hexKey, unit, commandState),
      detailSections: this.buildBattleIntelDetailSections(unit, definition),
      notes: this.buildBattleIntelNotes(unit, commandState)
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
        chips.push({ label: "Towed", tone: "warning" });
      } else if (commandState.towState === "deployed") {
        chips.push({ label: "Deployed", tone: "neutral" });
      }
      if (commandState.isOnSentry) {
        chips.push({ label: "On Sentry", tone: "neutral" });
      }
      if (commandState.suppressionState === "pinned") {
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

  private clampDisplayedDamageRounded(value: number): number {
    return Math.round(this.clampDisplayedDamage(value));
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
