import { formationList } from "./unitSystem/formations";
import type { FormationPurpose, UnitAllocationKey, UnitTypeKey } from "./unitSystem/types";

export type { UnitAllocationKey };

export interface CombatReference {
  /** Links the allocation entry back to the derived tactical combat stats. */
  readonly unitType: UnitTypeKey;
}

export interface PersonnelBreakdownEntry {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly role: string;
}

export interface VehicleBreakdownEntry {
  readonly id: string;
  readonly label: string;
  readonly quantity: number;
  readonly platformId?: string;
  readonly purpose: readonly FormationPurpose[];
  readonly canonStatus?: "linked" | "missing" | "abstract";
}

export interface EquipmentBreakdownEntry {
  readonly id: string;
  readonly label: string;
  readonly quantity: number;
  readonly platformId?: string;
  readonly purpose: readonly FormationPurpose[];
  readonly canonStatus?: "linked" | "missing" | "abstract";
}

export interface UnitCompositionProfile {
  /** Estimated number of troops assigned to the formation. */
  readonly personnel: number;
  /** Human-readable personnel groups that make up the formation. */
  readonly personnelBreakdown: readonly PersonnelBreakdownEntry[];
  /** Count of motorized, armored, or aircraft platforms assigned to the unit. */
  readonly vehicles: number;
  /** Vehicle, gun, aircraft, or other major platform groups assigned to the unit. */
  readonly vehicleBreakdown: readonly VehicleBreakdownEntry[];
  /** All explicit equipment/loadout groups recorded in the formation catalog. */
  readonly equipmentBreakdown: readonly EquipmentBreakdownEntry[];
  /** Headline equipment or stores carried by the unit. */
  readonly equipmentSummary: readonly string[];
  /** Historical echelon represented by the allocation entry. */
  readonly echelon?: string;
  /** Operational/historical notes that help differentiate similar entries. */
  readonly notes?: string;
  /** Optional pointer when the unit has a tactical stat line. */
  readonly combatReference?: CombatReference;
}

const platformLabelPattern = /\b(tank|tanks|tank destroyer|tank destroyers|assault gun|assault guns|aircraft|plane|planes|fighter|fighters|fighter-bomber|fighter-bombers|bomber|bombers|interceptor|interceptors|truck|trucks|lorry|lorries|jeep|jeeps|bowser|bowsers|halftrack|halftracks|car|cars|motorbike|motorbikes|vehicle|vehicles|carrier|carriers|tractor|tractors|prime mover|prime movers|gun|guns|howitzer|howitzers|launcher|launchers|ambulance|ambulances|boat|boats|craft)\b/i;

function isVehicleOrPlatformLabel(label: string): boolean {
  return platformLabelPattern.test(label);
}

export const unitComposition = Object.freeze(
  Object.fromEntries(
    formationList.map((formation) => {
      const personnelBreakdown = formation.personnel.map((entry) => ({
        id: entry.id,
        label: entry.label,
        count: entry.count,
        role: entry.role
      }));
      const equipmentBreakdown: EquipmentBreakdownEntry[] = formation.equipment.map((entry) => ({
        id: entry.id,
        label: entry.label,
        quantity: entry.quantity,
        platformId: entry.platformId,
        purpose: entry.purpose,
        canonStatus: entry.canonStatus
      }));
      const vehicleBreakdown: VehicleBreakdownEntry[] = equipmentBreakdown
        .filter((entry) => entry.platformId || isVehicleOrPlatformLabel(entry.label))
        .map((entry) => ({ ...entry }));
      const accountedVehicles = vehicleBreakdown.reduce((sum, entry) => sum + entry.quantity, 0);
      const unlistedVehicles = Math.max(0, (formation.vehicles ?? 0) - accountedVehicles);
      if (unlistedVehicles > 0) {
        vehicleBreakdown.push({
          id: "support-platforms",
          label: "Support vehicles and major platforms",
          quantity: unlistedVehicles,
          purpose: formation.purpose,
          canonStatus: "abstract"
        });
      }

      return [
        formation.key,
        {
          personnel: personnelBreakdown.reduce((sum, entry) => sum + entry.count, 0),
          personnelBreakdown,
          vehicles: formation.vehicles ?? 0,
          vehicleBreakdown,
          equipmentBreakdown,
          equipmentSummary: formation.equipmentSummary,
          echelon: formation.echelon,
          notes: formation.notes ?? formation.historicalDescription,
          combatReference: formation.tacticalUnitType ? { unitType: formation.tacticalUnitType } : undefined
        } satisfies UnitCompositionProfile
      ];
    })
  )
) as unknown as Readonly<Record<UnitAllocationKey, UnitCompositionProfile>>;
