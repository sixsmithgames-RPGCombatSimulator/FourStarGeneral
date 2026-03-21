/**
 * Provides structured data for the centered intel overlay describing the currently highlighted hex.
 * Enables overlay components to render deployment-specific context without querying engine state.
 */
export interface DeploymentSelectionIntel {
  readonly kind: "deployment";
  readonly hexKey: string;
  readonly terrainName: string | null;
  readonly zoneLabel: string | null;
  readonly remainingCapacity: number | null;
  readonly totalCapacity: number | null;
  readonly notes: readonly string[];
}

export type IntelChipTone = "neutral" | "good" | "warning" | "danger";
export type BattleIntelActionTone = "defense" | "mobility" | "denial";

export interface BattleIntelChip {
  readonly label: string;
  readonly tone: IntelChipTone;
}

export interface BattleIntelAction {
  readonly id: string;
  readonly label: string;
  readonly detail: string;
  readonly tone: BattleIntelActionTone;
  readonly available: boolean;
  readonly reason?: string | null;
}

/**
 * Describes player-controlled unit details when the commander selects a friendly formation during battle.
 */
export interface BattleSelectionIntel {
  readonly kind: "battle";
  readonly hexKey: string;
  readonly terrainName: string | null;
  readonly unitLabel: string | null;
  readonly unitStrength: number | null;
  readonly unitAmmo: number | null;
  readonly unitFuel: number | null;
  readonly unitEntrenchment: number | null;
  readonly movementRemaining: number | null;
  readonly movementMax: number | null;
  readonly moveOptions: number;
  readonly attackOptions: number;
  readonly statusMessage: string;
  readonly statusChips: readonly BattleIntelChip[];
  readonly actionCards: readonly BattleIntelAction[];
  readonly notes: readonly string[];
}

export interface ActivityDetailEntry {
  readonly label: string;
  readonly value: string;
}

export interface ActivityDetailSection {
  readonly title: string;
  readonly entries: readonly ActivityDetailEntry[];
}

/**
 * Captures intel when the commander inspects an empty hex or non-player unit during the battle phase.
 */
export interface TerrainSelectionIntel {
  readonly kind: "terrain";
  readonly hexKey: string;
  readonly terrainName: string | null;
  readonly notes: readonly string[];
}

export type SelectionIntel =
  | DeploymentSelectionIntel
  | BattleSelectionIntel
  | TerrainSelectionIntel
  | null;

export type ActivityCategory = "player" | "enemy" | "system";
export type ActivityType = "attack" | "move" | "deployment" | "supply" | "turn" | "log";

/**
 * Represents a battle log line destined for the sidebar activity feed so commanders can review past actions.
 */
export interface ActivityEvent {
  readonly id: string;
  readonly timestamp: string;
  readonly category: ActivityCategory;
  readonly type: ActivityType;
  readonly summary: string;
  readonly details?: Record<string, unknown>;
  readonly detailSections?: readonly ActivityDetailSection[];
}

export interface ActivityEventInput {
  readonly category: ActivityCategory;
  readonly type: ActivityType;
  readonly summary: string;
  readonly details?: Record<string, unknown>;
  readonly detailSections?: readonly ActivityDetailSection[];
}
