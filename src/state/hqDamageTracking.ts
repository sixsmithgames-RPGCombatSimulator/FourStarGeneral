/**
 * HQ Damage Tracking System
 * 
 * Maintains cumulative records of unit damage for strategic-level reporting.
 * Enables after-action analysis, unit readiness tracking, and campaign-level
 * casualty assessment.
 * 
 * @module HQDamageTracking
 */

import type {
  VehicleComponent,
  WeaponDamageType
} from "../core/types";
import type {
  ComponentDamageDelta,
  EquipmentDamageDelta,
  PersonnelDamageDelta
} from "../data/unitSystem/damagePackets";

/**
 * Single damage record entry for a unit.
 */
export interface DamageRecord {
  /** Timestamp when damage was recorded */
  timestamp: number;
  /** Engagement identifier */
  engagementId: string;
  /** Attacking unit ID */
  attackerId: string;
  /** Attacking unit name */
  attackerName: string;
  /** Hex coordinates where damage occurred */
  hex: { q: number; r: number };
  /** Personnel casualties from this engagement */
  personnel: PersonnelDamageDelta;
  /** Equipment damage from this engagement */
  equipment: EquipmentDamageDelta;
  /** Component-specific damage */
  componentDamage: ComponentDamageDelta;
  /** Damage types received */
  damageTypes: WeaponDamageType[];
  /** Suppression applied */
  suppression: number;
}

/**
 * Cumulative damage ledger for a unit.
 */
export interface UnitDamageLedger {
  /** Unit identifier */
  unitId: string;
  /** Unit display name */
  unitName: string;
  /** All damage records for this unit */
  records: DamageRecord[];
  /** Running totals of all damage received */
  cumulativeDamage: {
    personnel: PersonnelDamageDelta;
    equipment: EquipmentDamageDelta;
    componentDamage: ComponentDamageDelta;
  };
  /** Running total of suppression received */
  totalSuppression: number;
  /** Set of all damage types received */
  allDamageTypes: Set<WeaponDamageType>;
  /** Last updated timestamp */
  lastUpdated: number;
}

/**
 * Mission-level damage summary.
 */
export interface MissionDamageSummary {
  /** Mission identifier */
  missionId: string;
  /** Mission name */
  missionName: string;
  /** Total damage across all units */
  totalDamage: {
    personnel: PersonnelDamageDelta;
    equipment: EquipmentDamageDelta;
  };
  /** Per-unit summaries */
  unitSummaries: UnitDamageSummary[];
  /** Start time of mission */
  startTime: number;
  /** End time of mission (if completed) */
  endTime?: number;
}

/**
 * Summary of damage for a single unit.
 */
export interface UnitDamageSummary {
  /** Unit identifier */
  unitId: string;
  /** Unit name */
  unitName: string;
  /** Current readiness percentage (0-100) */
  currentReadiness: number;
  /** Original strength */
  originalStrength: number;
  /** Current strength */
  currentStrength: number;
  /** Casualties by category */
  casualties: PersonnelDamageDelta;
  /** Equipment losses by category */
  equipmentLosses: EquipmentDamageDelta;
  /** Component damage summary */
  componentDamage: ComponentDamageSummary;
  /** Number of engagements survived */
  engagementsSurvived: number;
  /** Primary damage types received */
  primaryDamageTypes: WeaponDamageType[];
}

/**
 * Component damage summary for display.
 */
export interface ComponentDamageSummary {
  /** Number of components damaged */
  damaged: number;
  /** Number of components disabled */
  disabled: number;
  /** Number of components destroyed */
  destroyed: number;
  /** Most affected component */
  mostAffected?: VehicleComponent;
}

/**
 * Global HQ damage tracking ledger.
 * Maps unit IDs to their damage records.
 */
const hqDamageLedger = new Map<string, UnitDamageLedger>();

/**
 * Current mission ID being tracked.
 */
let currentMissionId: string | null = null;

/**
 * Initialize HQ tracking for a new mission.
 * 
 * @param missionId - Unique mission identifier
 * @param missionName - Human-readable mission name
 */
export function initializeHQTracking(missionId: string, missionName: string): void {
  // Clear previous mission data
  hqDamageLedger.clear();
  currentMissionId = missionId;
  
  console.log(`[HQ Tracking] Initialized for mission: ${missionName} (${missionId})`);
}

/**
 * Record damage to a unit in the HQ ledger.
 * 
 * @param unitId - Unit that received damage
 * @param unitName - Unit display name
 * @param record - Damage record to add
 */
export function recordUnitDamage(
  unitId: string,
  unitName: string,
  record: DamageRecord
): void {
  // Get or create unit ledger
  let ledger = hqDamageLedger.get(unitId);
  if (!ledger) {
    ledger = {
      unitId,
      unitName,
      records: [],
      cumulativeDamage: {
        personnel: { killed: 0, severelyWounded: 0, wounded: 0, injured: 0 },
        equipment: { destroyed: 0, disabled: 0, damaged: 0 },
        componentDamage: { damaged: {}, disabled: {}, destroyed: {} }
      },
      totalSuppression: 0,
      allDamageTypes: new Set(),
      lastUpdated: Date.now()
    };
    hqDamageLedger.set(unitId, ledger);
  }

  // Add the record
  ledger.records.push(record);
  
  // Update cumulative personnel damage
  ledger.cumulativeDamage.personnel.killed += record.personnel.killed;
  ledger.cumulativeDamage.personnel.severelyWounded += record.personnel.severelyWounded;
  ledger.cumulativeDamage.personnel.wounded += record.personnel.wounded;
  ledger.cumulativeDamage.personnel.injured += record.personnel.injured;

  // Update cumulative equipment damage
  ledger.cumulativeDamage.equipment.destroyed += record.equipment.destroyed;
  ledger.cumulativeDamage.equipment.disabled += record.equipment.disabled;
  ledger.cumulativeDamage.equipment.damaged += record.equipment.damaged;

  // Update component damage
  mergeComponentDamage(ledger.cumulativeDamage.componentDamage, record.componentDamage);

  // Update suppression and damage types
  ledger.totalSuppression += record.suppression;
  record.damageTypes.forEach((type) => ledger!.allDamageTypes.add(type));
  
  ledger.lastUpdated = Date.now();
}

/**
 * Merge component damage into cumulative record.
 */
function mergeComponentDamage(
  cumulative: ComponentDamageDelta,
  incoming: ComponentDamageDelta
): void {
  Object.entries(incoming.damaged).forEach(([component, count]) => {
    const countNum = count as number;
    if (countNum > 0) {
      const comp = component as VehicleComponent;
      cumulative.damaged[comp] = (cumulative.damaged[comp] ?? 0) + countNum;
    }
  });
  
  Object.entries(incoming.disabled).forEach(([component, count]) => {
    const countNum = count as number;
    if (countNum > 0) {
      const comp = component as VehicleComponent;
      cumulative.disabled[comp] = (cumulative.disabled[comp] ?? 0) + countNum;
    }
  });
  
  Object.entries(incoming.destroyed).forEach(([component, count]) => {
    const countNum = count as number;
    if (countNum > 0) {
      const comp = component as VehicleComponent;
      cumulative.destroyed[comp] = (cumulative.destroyed[comp] ?? 0) + countNum;
    }
  });
}

/**
 * Get the complete damage history for a unit.
 * 
 * @param unitId - Unit identifier
 * @returns Unit damage ledger or undefined if no records exist
 */
export function getUnitDamageHistory(unitId: string): UnitDamageLedger | undefined {
  return hqDamageLedger.get(unitId);
}

/**
 * Generate a summary report for a unit's damage status.
 * 
 * @param unitId - Unit identifier
 * @param currentStrength - Current unit strength
 * @param originalStrength - Original unit strength
 * @returns Unit damage summary
 */
export function getUnitDamageSummary(
  unitId: string,
  currentStrength: number,
  originalStrength: number
): UnitDamageSummary | undefined {
  const ledger = hqDamageLedger.get(unitId);
  if (!ledger) return undefined;

  const readiness = originalStrength > 0 ? (currentStrength / originalStrength) * 100 : 100;

  // Calculate component summary
  const damagedCount = Object.keys(ledger.cumulativeDamage.componentDamage.damaged).length;
  const disabledCount = Object.keys(ledger.cumulativeDamage.componentDamage.disabled).length;
  const destroyedCount = Object.keys(ledger.cumulativeDamage.componentDamage.destroyed).length;

  // Find most affected component
  let mostAffected: VehicleComponent | undefined;
  let maxDamage = 0;
  
  Object.entries(ledger.cumulativeDamage.componentDamage.damaged).forEach(([comp, count]) => {
    const countNum = count as number;
    if (countNum > maxDamage) {
      maxDamage = countNum;
      mostAffected = comp as VehicleComponent;
    }
  });

  return {
    unitId,
    unitName: ledger.unitName,
    currentReadiness: Math.round(readiness),
    originalStrength,
    currentStrength,
    casualties: { ...ledger.cumulativeDamage.personnel },
    equipmentLosses: { ...ledger.cumulativeDamage.equipment },
    componentDamage: {
      damaged: damagedCount,
      disabled: disabledCount,
      destroyed: destroyedCount,
      mostAffected
    },
    engagementsSurvived: ledger.records.length,
    primaryDamageTypes: Array.from(ledger.allDamageTypes)
  };
}

/**
 * Generate a formation-level casualty report.
 * 
 * @param unitIds - Array of unit identifiers in the formation
 * @returns Aggregated casualty report
 */
export function getFormationCasualtyReport(unitIds: string[]): {
  totalPersonnel: PersonnelDamageDelta;
  totalEquipment: EquipmentDamageDelta;
  totalEngagements: number;
  averageReadiness: number;
  unitCount: number;
} {
  const totalPersonnel: PersonnelDamageDelta = {
    killed: 0,
    severelyWounded: 0,
    wounded: 0,
    injured: 0
  };
  
  const totalEquipment: EquipmentDamageDelta = {
    destroyed: 0,
    disabled: 0,
    damaged: 0
  };

  let totalEngagements = 0;
  let unitsWithData = 0;

  unitIds.forEach((unitId) => {
    const ledger = hqDamageLedger.get(unitId);
    if (ledger) {
      unitsWithData++;
      totalPersonnel.killed += ledger.cumulativeDamage.personnel.killed;
      totalPersonnel.severelyWounded += ledger.cumulativeDamage.personnel.severelyWounded;
      totalPersonnel.wounded += ledger.cumulativeDamage.personnel.wounded;
      totalPersonnel.injured += ledger.cumulativeDamage.personnel.injured;
      
      totalEquipment.destroyed += ledger.cumulativeDamage.equipment.destroyed;
      totalEquipment.disabled += ledger.cumulativeDamage.equipment.disabled;
      totalEquipment.damaged += ledger.cumulativeDamage.equipment.damaged;
      
      totalEngagements += ledger.records.length;
    }
  });

  const averageReadiness = unitsWithData > 0 ? 100 - (totalPersonnel.killed * 2) : 100;

  return {
    totalPersonnel,
    totalEquipment,
    totalEngagements,
    averageReadiness: Math.max(0, Math.round(averageReadiness)),
    unitCount: unitsWithData
  };
}

/**
 * Generate a complete mission damage summary.
 * 
 * @param missionId - Mission identifier
 * @param missionName - Mission name
 * @param allUnitIds - All unit IDs to include in summary
 * @returns Complete mission damage summary
 */
export function generateMissionDamageSummary(
  missionId: string,
  missionName: string,
  allUnitIds: string[]
): MissionDamageSummary {
  const totalPersonnel: PersonnelDamageDelta = {
    killed: 0,
    severelyWounded: 0,
    wounded: 0,
    injured: 0
  };
  
  const totalEquipment: EquipmentDamageDelta = {
    destroyed: 0,
    disabled: 0,
    damaged: 0
  };

  const unitSummaries: UnitDamageSummary[] = [];

  allUnitIds.forEach((unitId) => {
    const ledger = hqDamageLedger.get(unitId);
    if (ledger) {
      // Accumulate totals
      totalPersonnel.killed += ledger.cumulativeDamage.personnel.killed;
      totalPersonnel.severelyWounded += ledger.cumulativeDamage.personnel.severelyWounded;
      totalPersonnel.wounded += ledger.cumulativeDamage.personnel.wounded;
      totalPersonnel.injured += ledger.cumulativeDamage.personnel.injured;
      
      totalEquipment.destroyed += ledger.cumulativeDamage.equipment.destroyed;
      totalEquipment.disabled += ledger.cumulativeDamage.equipment.disabled;
      totalEquipment.damaged += ledger.cumulativeDamage.equipment.damaged;

      // Create summary (using placeholder strengths)
      const summary = getUnitDamageSummary(unitId, 0, 100);
      if (summary) {
        unitSummaries.push(summary);
      }
    }
  });

  return {
    missionId,
    missionName,
    totalDamage: {
      personnel: totalPersonnel,
      equipment: totalEquipment
    },
    unitSummaries,
    startTime: Date.now(), // Placeholder - should track actual mission start
  };
}

/**
 * Clear all HQ tracking data.
 */
export function clearHQTracking(): void {
  hqDamageLedger.clear();
  currentMissionId = null;
}

/**
 * Export damage data for external analysis.
 * 
 * @returns JSON-serializable damage report
 */
export function exportDamageReport(): {
  missionId: string | null;
  generatedAt: number;
  unitCount: number;
  units: {
    unitId: string;
    unitName: string;
    recordCount: number;
    cumulativeDamage: {
      personnel: PersonnelDamageDelta;
      equipment: EquipmentDamageDelta;
    };
    damageTypes: WeaponDamageType[];
  }[];
} {
  const units = Array.from(hqDamageLedger.values()).map((ledger) => ({
    unitId: ledger.unitId,
    unitName: ledger.unitName,
    recordCount: ledger.records.length,
    cumulativeDamage: {
      personnel: { ...ledger.cumulativeDamage.personnel },
      equipment: { ...ledger.cumulativeDamage.equipment }
    },
    damageTypes: Array.from(ledger.allDamageTypes)
  }));

  return {
    missionId: currentMissionId,
    generatedAt: Date.now(),
    unitCount: units.length,
    units
  };
}

/**
 * Get all units that have taken damage.
 * 
 * @returns Array of unit IDs with damage records
 */
export function getDamagedUnits(): string[] {
  return Array.from(hqDamageLedger.keys());
}

/**
 * Check if a unit has taken damage.
 * 
 * @param unitId - Unit identifier
 * @returns Whether the unit has damage records
 */
export function hasUnitTakenDamage(unitId: string): boolean {
  return hqDamageLedger.has(unitId);
}

/**
 * Get the most severely damaged units.
 * 
 * @param limit - Maximum number of units to return
 * @returns Array of unit IDs sorted by damage severity
 */
export function getMostDamagedUnits(limit: number = 10): { unitId: string; totalCasualties: number }[] {
  const unitsWithDamage = Array.from(hqDamageLedger.entries()).map(([unitId, ledger]) => {
    const totalCasualties = 
      ledger.cumulativeDamage.personnel.killed +
      ledger.cumulativeDamage.personnel.severelyWounded +
      ledger.cumulativeDamage.personnel.wounded +
      ledger.cumulativeDamage.personnel.injured;
    
    return { unitId, totalCasualties };
  });

  return unitsWithDamage
    .sort((a, b) => b.totalCasualties - a.totalCasualties)
    .slice(0, limit);
}
