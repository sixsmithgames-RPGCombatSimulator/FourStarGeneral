/**
 * Battle-local casualty separation, mobility burden, and recovery-site contracts.
 * Recovery sites never become campaign formations; campaign result extraction
 * reunites their surviving state with the committed tactical source.
 */

import type {
  FormationReadinessModel,
  FormationStatus,
  FormationStatusCapacity,
  PersonnelStatusPool,
  ScenarioUnit,
  TacticalCampaignFormationProvenance,
  VehicleStatusPool
} from "../core/types";
import type { Axial } from "../core/Hex";
import { calculateFormationReadiness } from "../data/unitSystem/status";

export type RecoverySiteCause = "ordered" | "rout";
export type RecoverySiteState = "awaitingCare" | "receivingCare" | "readyToForm" | "depleted";

export interface TacticalRecoverySite {
  readonly siteId: string;
  readonly faction: "Player" | "Bot" | "Ally";
  readonly hex: Axial;
  readonly createdTurn: number;
  readonly cause: RecoverySiteCause;
  readonly sourceUnitId: string;
  readonly sourceCampaignProvenance?: TacticalCampaignFormationProvenance;
  readonly unitType: ScenarioUnit["type"];
  readonly formationKey?: string;
  readonly displayName: string;
  readonly baseExperience: number;
  readonly readinessModel?: FormationReadinessModel;
  /** Only recoverable pools remain here; killed and destroyed never enter a site. */
  status: FormationStatus;
  /** Fit/operational output waits here when the hex is at its stacking limit. */
  staged: FormationStatus;
  state: RecoverySiteState;
  reconstitutedUnitId?: string;
}
export interface RecoveryPayloadSummary {
  readonly injured: number;
  readonly wounded: number;
  readonly severelyWounded: number;
  readonly damaged: number;
  readonly disabled: number;
  readonly personnel: number;
  readonly equipment: number;
}

export interface MobilityBurden {
  readonly basis: "personnel" | "equipment" | "none";
  readonly burdenCount: number;
  readonly eligibleSurvivors: number;
  readonly burdenRatio: number;
  readonly movementScalar: number;
}

export interface LeaveBehindPreview {
  readonly sourceUnitId: string;
  readonly summary: RecoveryPayloadSummary;
  readonly readinessBefore: number;
  readonly readinessAfter: number;
  readonly mobilityBefore: MobilityBurden;
  readonly mobilityAfter: MobilityBurden;
}

const emptyPersonnel = (): PersonnelStatusPool => ({
  fit: 0,
  injured: 0,
  wounded: 0,
  severelyWounded: 0,
  killed: 0
});

const emptyEquipment = (): VehicleStatusPool => ({
  operational: 0,
  damaged: 0,
  disabled: 0,
  destroyed: 0
});

function cloneCapacity(status: FormationStatus): FormationStatusCapacity {
  return status.capacity
    ? structuredClone(status.capacity)
    : {
        personnel: Object.fromEntries(Object.entries(status.personnel).map(([key, pool]) => [
          key,
          pool.fit + pool.injured + pool.wounded + pool.severelyWounded + pool.killed
        ])),
        equipment: Object.fromEntries(Object.entries(status.equipment).map(([key, pool]) => [
          key,
          pool.operational + pool.damaged + pool.disabled + pool.destroyed
        ]))
      };
}

export function createEmptyRecoveryStatus(source: FormationStatus): FormationStatus {
  return {
    personnel: Object.fromEntries(Object.keys(source.personnel).map((key) => [key, emptyPersonnel()])),
    equipment: Object.fromEntries(Object.keys(source.equipment).map((key) => [key, emptyEquipment()])),
    capacity: cloneCapacity(source),
    ammo: {},
    suppression: 0,
    ...(source.readinessModel ? { readinessModel: structuredClone(source.readinessModel) } : {})
  };
}

export function summarizeRecoveryPayload(status: FormationStatus): RecoveryPayloadSummary {
  const personnel = Object.values(status.personnel).reduce(
    (total, pool) => ({
      injured: total.injured + Math.max(0, pool.injured),
      wounded: total.wounded + Math.max(0, pool.wounded),
      severelyWounded: total.severelyWounded + Math.max(0, pool.severelyWounded)
    }),
    { injured: 0, wounded: 0, severelyWounded: 0 }
  );
  const equipment = Object.values(status.equipment).reduce(
    (total, pool) => ({
      damaged: total.damaged + Math.max(0, pool.damaged),
      disabled: total.disabled + Math.max(0, pool.disabled)
    }),
    { damaged: 0, disabled: 0 }
  );
  return {
    ...personnel,
    ...equipment,
    personnel: personnel.injured + personnel.wounded + personnel.severelyWounded,
    equipment: equipment.damaged + equipment.disabled
  };
}

export function hasRecoveryPayload(status: FormationStatus): boolean {
  const summary = summarizeRecoveryPayload(status);
  return summary.personnel + summary.equipment > 0;
}

export function calculateMedicalRecoveryNeed(status: FormationStatus): number {
  const summary = summarizeRecoveryPayload(status);
  return summary.injured + summary.wounded * 2 + summary.severelyWounded * 3;
}

export function calculateEquipmentRecoveryNeed(status: FormationStatus): number {
  const summary = summarizeRecoveryPayload(status);
  return summary.damaged * 2 + summary.disabled * 3;
}

export function resolveMobilityBurden(status: FormationStatus | undefined, moveType: string): MobilityBurden {
  if (!status || moveType === "air") {
    return { basis: "none", burdenCount: 0, eligibleSurvivors: 0, burdenRatio: 0, movementScalar: 1 };
  }

  if (moveType === "leg") {
    const totals = Object.values(status.personnel).reduce(
      (total, pool) => ({
        survivors: total.survivors + pool.fit + pool.injured + pool.wounded + pool.severelyWounded,
        burden: total.burden + pool.injured + pool.wounded + pool.severelyWounded
      }),
      { survivors: 0, burden: 0 }
    );
    const burdenRatio = totals.survivors > 0 ? Math.min(1, totals.burden / totals.survivors) : 0;
    return {
      basis: "personnel",
      burdenCount: totals.burden,
      eligibleSurvivors: totals.survivors,
      burdenRatio,
      movementScalar: 1 - burdenRatio
    };
  }

  if (moveType === "wheel" || moveType === "truck" || moveType === "track") {
    const totals = Object.values(status.equipment).reduce(
      (total, pool) => ({
        survivors: total.survivors + pool.operational + pool.damaged + pool.disabled,
        burden: total.burden + pool.damaged + pool.disabled
      }),
      { survivors: 0, burden: 0 }
    );
    const burdenRatio = totals.survivors > 0 ? Math.min(1, totals.burden / totals.survivors) : 0;
    return {
      basis: totals.survivors > 0 ? "equipment" : "none",
      burdenCount: totals.burden,
      eligibleSurvivors: totals.survivors,
      burdenRatio,
      movementScalar: 1 - burdenRatio
    };
  }

  return { basis: "none", burdenCount: 0, eligibleSurvivors: 0, burdenRatio: 0, movementScalar: 1 };
}

/** Removes every recoverable state from source while preserving its full readiness denominator. */
export function detachRecoverableStatus(source: FormationStatus): FormationStatus {
  const detached = createEmptyRecoveryStatus(source);
  Object.entries(source.personnel).forEach(([key, pool]) => {
    const target = detached.personnel[key] ?? (detached.personnel[key] = emptyPersonnel());
    target.injured = pool.injured;
    target.wounded = pool.wounded;
    target.severelyWounded = pool.severelyWounded;
    pool.injured = 0;
    pool.wounded = 0;
    pool.severelyWounded = 0;
  });
  Object.entries(source.equipment).forEach(([key, pool]) => {
    const target = detached.equipment[key] ?? (detached.equipment[key] = emptyEquipment());
    target.damaged = pool.damaged;
    target.disabled = pool.disabled;
    pool.damaged = 0;
    pool.disabled = 0;
  });
  return detached;
}

export function previewLeaveBehind(unit: ScenarioUnit, moveType: string): LeaveBehindPreview {
  if (!unit.status || !unit.unitId) {
    throw new Error("A normalized tactical unit with a stable id is required for casualty separation.");
  }
  const source = structuredClone(unit.status);
  const readinessBefore = calculateFormationReadiness(source, unit.strength).readiness;
  const mobilityBefore = resolveMobilityBurden(source, moveType);
  const detached = detachRecoverableStatus(source);
  return {
    sourceUnitId: unit.unitId,
    summary: summarizeRecoveryPayload(detached),
    readinessBefore,
    readinessAfter: calculateFormationReadiness(source, unit.strength).readiness,
    mobilityBefore,
    mobilityAfter: resolveMobilityBurden(source, moveType)
  };
}

export function mergeFormationStatusPools(target: FormationStatus, source: FormationStatus): void {
  Object.entries(source.personnel).forEach(([key, pool]) => {
    const destination = target.personnel[key] ?? (target.personnel[key] = emptyPersonnel());
    destination.fit += pool.fit;
    destination.injured += pool.injured;
    destination.wounded += pool.wounded;
    destination.severelyWounded += pool.severelyWounded;
    destination.killed += pool.killed;
  });
  Object.entries(source.equipment).forEach(([key, pool]) => {
    const destination = target.equipment[key] ?? (target.equipment[key] = emptyEquipment());
    destination.operational += pool.operational;
    destination.damaged += pool.damaged;
    destination.disabled += pool.disabled;
    destination.destroyed += pool.destroyed;
  });
}
