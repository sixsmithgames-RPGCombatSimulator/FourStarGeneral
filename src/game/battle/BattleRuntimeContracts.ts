import type {
  HexEdgeFacing,
  HexModification,
  HexModificationType,
  ScenarioUnit
} from "../../core/types";
import type { Axial } from "../../core/Hex";
import type { LeaveBehindPreview } from "../tacticalRecovery";

/** Operational readiness groups shared by support rules, state facades, and presentation. */
export type SupportAssetStatus = "ready" | "queued" | "cooldown" | "maintenance";

/** Detached description of a battle support capability. */
export interface SupportAssetSnapshot {
  readonly id: string;
  readonly label: string;
  readonly type: "artillery" | "air" | "engineering" | "medical" | "other";
  readonly status: SupportAssetStatus;
  readonly charges: number;
  readonly maxCharges: number;
  readonly cooldown: number;
  readonly maxCooldown: number;
  readonly assignedHex: string | null;
  readonly notes: string | null;
  readonly queuedHex: string | null;
  readonly queuedByHex: string | null;
  /** Maximum direct readiness damage this support strike can inflict in one mission. */
  readonly strikeDamageCap?: number;
}

/** Aggregated support capability snapshot grouped for direct presentation. */
export interface SupportSnapshot {
  readonly updatedAt: string;
  readonly ready: readonly SupportAssetSnapshot[];
  readonly queued: readonly SupportAssetSnapshot[];
  readonly cooldown: readonly SupportAssetSnapshot[];
  readonly maintenance: readonly SupportAssetSnapshot[];
  readonly metrics: SupportSnapshotMetrics;
}

/** Derived readiness metrics for the battle support capability board. */
export interface SupportSnapshotMetrics {
  readonly totalAssets: number;
  readonly ready: number;
  readonly queued: number;
  readonly cooldown: number;
  readonly maintenance: number;
  readonly totalCharges: number;
  readonly actionsQueued: number;
  readonly averageCooldown: number | null;
}

export type EnemyContactState = "spotted" | "identified" | "visible";

/** Detached last-known enemy contact available to battle rules and presentation. */
export interface EnemyContactSnapshot {
  unitId: string;
  hex: Axial;
  state: EnemyContactState;
  lastSeenTurn: number;
  source: string;
  unitType?: ScenarioUnit["type"];
  strengthEstimate?: number;
}

export type UnitSuppressionState = "clear" | "suppressed" | "pinned" | "broken";
export type UnitTowState = "deployed" | "towed";

/** Read-only command availability projection for one tactical unit. */
export interface UnitCommandState {
  readonly unitId: string;
  readonly unitType: ScenarioUnit["type"];
  readonly isAutomated: boolean;
  readonly isEngineer: boolean;
  readonly entrenchment: number;
  readonly maxEntrenchment: number;
  readonly suppressionState: UnitSuppressionState;
  readonly suppressorCount: number;
  readonly isOnSentry: boolean;
  readonly towState: UnitTowState | null;
  readonly existingHexModification: HexModification | null;
  readonly existingHexModifications: readonly HexModification[];
  readonly canMoveOut: boolean;
  readonly moveOutReason: string | null;
  readonly canDeployTow: boolean;
  readonly deployTowReason: string | null;
  readonly canEnterSentry: boolean;
  readonly sentryReason: string | null;
  readonly canDigIn: boolean;
  readonly digInReason: string | null;
  readonly canBuildModification: boolean;
  readonly buildReason: string | null;
  readonly buildModificationAvailability: Readonly<Record<HexModificationType, { available: boolean; reason: string | null }>>;
  readonly isSmokeCapable: boolean;
  readonly canLaySmoke: boolean;
  readonly smokeReason: string | null;
  readonly canSetFacing: boolean;
  readonly setFacingReason: string | null;
  readonly currentFacing: HexEdgeFacing;
  readonly mobilityBurdenPercent: number;
  readonly mobilityBasis: "personnel" | "equipment" | "none";
  readonly canLeaveCasualtiesBehind: boolean;
  readonly leaveCasualtiesBehindReason: string | null;
  readonly leaveCasualtiesBehindPreview: LeaveBehindPreview | null;
}
