import type {
  FormationReadinessBreakdown,
  FormationReadinessComponentSummary,
  FormationReadinessModel,
  FormationStatus,
  PersonnelStatusPool,
  ScenarioUnit,
  VehicleStatusPool
} from "../../core/types";
import type { FormationDefinition } from "./types";
import { getFormation } from "./formations";

const PERSONNEL_INJURED_EFFECTIVENESS = 0.75;
const EQUIPMENT_DAMAGED_EFFECTIVENESS = 0.5;
const READINESS_PRECISION = 100;

function emptyPersonnel(count = 0): PersonnelStatusPool {
  return { fit: Math.max(0, Math.round(count)), injured: 0, wounded: 0, severelyWounded: 0, killed: 0 };
}

function emptyVehicles(count = 0): VehicleStatusPool {
  return { operational: Math.max(0, Math.round(count)), damaged: 0, disabled: 0, destroyed: 0 };
}

function fallbackEquipmentCount(unitType: string): number {
  if (unitType.includes("Combat_Engineer")) return 12;
  if (unitType.includes("Engineer")) return 12;
  if (unitType.includes("Heavy_Tank")) return 14;
  if (unitType.includes("Tank_Destroyer")) return 12;
  if (unitType.includes("Assault_Gun")) return 6;
  if (unitType.includes("Light_Tank") || unitType.includes("Panzer")) return 20;
  if (unitType.includes("Flak")) return 16;
  if (unitType.includes("AT_Gun")) return 18;
  if (unitType.includes("Rocket_Artillery")) return 12;
  if (unitType.includes("SP_Artillery")) return 8;
  if (unitType.includes("Artillery") || unitType.includes("Howitzer")) return 18;
  if (unitType.includes("Recon_Bike")) return 18;
  if (unitType.includes("Recon_ArmoredCar")) return 18;
  if (unitType.includes("APC_Halftrack")) return 24;
  if (unitType.includes("Supply_Truck")) return 8;
  if (unitType.includes("Scout_Plane")) return 6;
  if (unitType.includes("Interceptor")) return 16;
  if (unitType.includes("Fighter")) return 12;
  if (unitType.includes("Ground_Attack")) return 8;
  if (unitType.includes("Bomber")) return 6;
  if (unitType.includes("Transport_Plane")) return 10;
  return 0;
}

function fallbackPersonnelCount(unitType: string): number {
  if (unitType.includes("AT_Infantry")) return 770;
  if (unitType.includes("Combat_Engineer")) return 160;
  if (unitType.includes("Paratrooper")) return 150;
  if (unitType.includes("Engineer")) return 160;
  if (unitType.includes("Infantry")) return 720;
  if (unitType.includes("Heavy_Tank")) return 96;
  if (unitType.includes("Tank_Destroyer")) return 90;
  if (unitType.includes("Assault_Gun")) return 54;
  if (unitType.includes("Light_Tank") || unitType.includes("Panzer")) return 120;
  if (unitType.includes("Flak")) return 160;
  if (unitType.includes("AT_Gun")) return 132;
  if (unitType.includes("Rocket_Artillery")) return 150;
  if (unitType.includes("SP_Artillery")) return 140;
  if (unitType.includes("Artillery") || unitType.includes("Howitzer")) return 180;
  if (unitType.includes("Recon_Bike")) return 54;
  if (unitType.includes("Recon_ArmoredCar")) return 150;
  if (unitType.includes("APC_Halftrack")) return 180;
  if (unitType.includes("Supply_Truck")) return 48;
  if (unitType.includes("Scout_Plane")) return 90;
  if (unitType.includes("Interceptor")) return 160;
  if (unitType.includes("Fighter")) return 120;
  if (unitType.includes("Ground_Attack")) return 130;
  if (unitType.includes("Bomber")) return 150;
  if (unitType.includes("Transport_Plane")) return 200;
  return 100;
}

function roundReadiness(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * READINESS_PRECISION) / READINESS_PRECISION));
}

function countEquipment(status: FormationStatus): number {
  return Object.values(status.equipment).reduce(
    (sum, pool) => sum + pool.operational + pool.damaged + pool.disabled + pool.destroyed,
    0
  );
}

function formationTracksEquipment(formation: FormationDefinition | undefined): boolean {
  if (!formation) {
    return false;
  }
  if ((formation.vehicles ?? 0) > 0) {
    return true;
  }
  return formation.equipment.some((entry) => entry.quantity > 1);
}

function isLegEngineerOrSpecialist(unitType: string, formation: FormationDefinition | undefined): boolean {
  if (/Engineer/i.test(unitType)) {
    return true;
  }
  const tactical = formation?.tactical;
  return tactical?.moveType === "leg" && tactical.class === "specialist";
}

function buildReadinessModel(unitType: string, formation: FormationDefinition | undefined): FormationReadinessModel {
  const hasEquipment = formationTracksEquipment(formation) || fallbackEquipmentCount(unitType) > 0;
  if (!hasEquipment) {
    return { basis: "personnel", personnelWeight: 1, equipmentWeight: 0 };
  }
  if (isLegEngineerOrSpecialist(unitType, formation)) {
    return { basis: "combined", personnelWeight: 0.85, equipmentWeight: 0.15 };
  }
  return { basis: "platform", personnelWeight: 1, equipmentWeight: 1 };
}

function normalizeReadinessModel(status: FormationStatus, fallback?: FormationReadinessModel): FormationReadinessModel {
  const model = status.readinessModel ?? fallback;
  if (!model) {
    return countEquipment(status) > 0
      ? { basis: "platform", personnelWeight: 1, equipmentWeight: 1 }
      : { basis: "personnel", personnelWeight: 1, equipmentWeight: 0 };
  }
  if (model.basis === "combined") {
    const personnelWeight = Math.max(0, model.personnelWeight);
    const equipmentWeight = Math.max(0, model.equipmentWeight);
    const total = personnelWeight + equipmentWeight;
    if (total <= 0) {
      return { basis: "combined", personnelWeight: 1, equipmentWeight: 0 };
    }
    return {
      basis: "combined",
      personnelWeight: personnelWeight / total,
      equipmentWeight: equipmentWeight / total
    };
  }
  return model;
}

function summarizePersonnelReadiness(status: FormationStatus): FormationReadinessComponentSummary {
  let total = 0;
  let effective = 0;
  Object.values(status.personnel).forEach((pool) => {
    total += pool.fit + pool.injured + pool.wounded + pool.severelyWounded + pool.killed;
    effective += pool.fit + pool.injured * PERSONNEL_INJURED_EFFECTIVENESS;
  });
  const readiness = total > 0 ? roundReadiness((effective / total) * 100) : 0;
  return {
    total,
    effective: Math.round(effective * READINESS_PRECISION) / READINESS_PRECISION,
    readiness,
    loss: roundReadiness(100 - readiness)
  };
}

function summarizeEquipmentReadiness(status: FormationStatus): FormationReadinessComponentSummary {
  let total = 0;
  let effective = 0;
  Object.values(status.equipment).forEach((pool) => {
    total += pool.operational + pool.damaged + pool.disabled + pool.destroyed;
    effective += pool.operational + pool.damaged * EQUIPMENT_DAMAGED_EFFECTIVENESS;
  });
  const readiness = total > 0 ? roundReadiness((effective / total) * 100) : 0;
  return {
    total,
    effective: Math.round(effective * READINESS_PRECISION) / READINESS_PRECISION,
    readiness,
    loss: roundReadiness(100 - readiness)
  };
}

function combinePlatformReadiness(
  personnel: FormationReadinessComponentSummary,
  equipment: FormationReadinessComponentSummary
): number {
  const personnelLoss = personnel.total > 0 ? personnel.loss : 0;
  const equipmentLoss = equipment.loss;

  // Platform units already track each casualty and vehicle state independently.
  // Readiness therefore uses full-strength-equivalent losses from both channels
  // instead of multiplying percentages, which would dampen later truck/tank hits
  // just because the crew pool was already hurt, or vice versa.
  return roundReadiness(100 - personnelLoss - equipmentLoss);
}

function personnelPoolTotal(pool: PersonnelStatusPool | undefined): number {
  if (!pool) return 0;
  return pool.fit + pool.injured + pool.wounded + pool.severelyWounded + pool.killed;
}

function equipmentPoolTotal(pool: VehicleStatusPool | undefined): number {
  if (!pool) return 0;
  return pool.operational + pool.damaged + pool.disabled + pool.destroyed;
}

function capPersonnelPoolToAuthorized(pool: PersonnelStatusPool, authorizedTotal: number): void {
  let remaining = Math.max(0, Math.round(authorizedTotal));
  const fit = Math.min(pool.fit, remaining);
  remaining -= fit;
  const injured = Math.min(pool.injured, remaining);
  remaining -= injured;
  const wounded = Math.min(pool.wounded, remaining);
  remaining -= wounded;
  const severelyWounded = Math.min(pool.severelyWounded, remaining);
  remaining -= severelyWounded;
  const killed = Math.min(pool.killed, remaining);

  pool.fit = fit;
  pool.injured = injured;
  pool.wounded = wounded;
  pool.severelyWounded = severelyWounded;
  pool.killed = killed;
}

function capEquipmentPoolToAuthorized(pool: VehicleStatusPool, authorizedTotal: number): void {
  let remaining = Math.max(0, Math.round(authorizedTotal));
  const operational = Math.min(pool.operational, remaining);
  remaining -= operational;
  const damaged = Math.min(pool.damaged, remaining);
  remaining -= damaged;
  const disabled = Math.min(pool.disabled, remaining);
  remaining -= disabled;
  const destroyed = Math.min(pool.destroyed, remaining);

  pool.operational = operational;
  pool.damaged = damaged;
  pool.disabled = disabled;
  pool.destroyed = destroyed;
}

function allocateToWeights(total: number, weights: readonly number[]): number[] {
  const target = Math.max(0, Math.round(total));
  if (target <= 0 || weights.length <= 0) {
    return weights.map(() => 0);
  }
  const sanitized = weights.map((weight) => Math.max(0, Number.isFinite(weight) ? weight : 0));
  const weightTotal = sanitized.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0) {
    const even = Math.floor(target / sanitized.length);
    const remainder = target - even * sanitized.length;
    return sanitized.map((_, index) => {
      if (index === sanitized.length - 1) {
        return even + remainder;
      }
      return even;
    });
  }
  const raw = sanitized.map((weight) => (weight / weightTotal) * target);
  const base = raw.map((value) => Math.floor(value));
  let used = base.reduce((sum, value) => sum + value, 0);
  if (used < target) {
    const remainders = raw.map((value, index) => ({ index, remainder: value - base[index]! }));
    remainders.sort((left, right) => right.remainder - left.remainder || left.index - right.index);
    for (let i = 0; i < remainders.length && used < target; i += 1) {
      base[remainders[i]!.index] += 1;
      used += 1;
    }
  }
  return base;
}

function normalizeCountVectorToTotal(values: readonly number[], targetTotal: number): number[] {
  return allocateToWeights(targetTotal, values.map((value) => Math.max(0, Math.round(value))));
}

function resolveAuthorizedPersonnelTotal(unitType: string, formation: FormationDefinition | undefined): number {
  const formationTotal = (formation?.personnel ?? []).reduce((sum, entry) => sum + Math.max(0, Math.round(entry.count)), 0);
  if (formationTotal > 0) {
    return formationTotal;
  }
  return fallbackPersonnelCount(unitType);
}

function resolveAuthorizedEquipmentTotal(unitType: string, formation: FormationDefinition | undefined): number {
  const trackedVehicleCount = Math.max(0, Math.round(formation?.vehicles ?? 0));
  if (trackedVehicleCount > 0) {
    return trackedVehicleCount;
  }
  const formationEquipmentTotal = (formation?.equipment ?? [])
    .filter((entry) => entry.quantity > 1)
    .reduce((sum, entry) => sum + Math.max(0, Math.round(entry.quantity)), 0);
  if (formationEquipmentTotal > 0) {
    return formationEquipmentTotal;
  }
  return fallbackEquipmentCount(unitType);
}

function normalizePersonnelPools(status: FormationStatus, authorizedTotal: number): void {
  const targetTotal = Math.max(0, Math.round(authorizedTotal));
  if (targetTotal <= 0) {
    status.personnel = {};
    return;
  }

  const aggregate = Object.values(status.personnel).reduce(
    (total, pool) => ({
      fit: total.fit + Math.max(0, Math.round(pool.fit)),
      injured: total.injured + Math.max(0, Math.round(pool.injured)),
      wounded: total.wounded + Math.max(0, Math.round(pool.wounded)),
      severelyWounded: total.severelyWounded + Math.max(0, Math.round(pool.severelyWounded)),
      killed: total.killed + Math.max(0, Math.round(pool.killed))
    }),
    { fit: 0, injured: 0, wounded: 0, severelyWounded: 0, killed: 0 }
  );
  const aggregateTotal = aggregate.fit + aggregate.injured + aggregate.wounded + aggregate.severelyWounded + aggregate.killed;

  const key = Object.keys(status.personnel)[0] ?? "core";
  if (aggregateTotal <= 0) {
    status.personnel = { [key]: emptyPersonnel(targetTotal) };
    return;
  }

  const normalized = normalizeCountVectorToTotal(
    [aggregate.fit, aggregate.injured, aggregate.wounded, aggregate.severelyWounded, aggregate.killed],
    targetTotal
  );
  status.personnel = {
    [key]: {
      fit: normalized[0] ?? 0,
      injured: normalized[1] ?? 0,
      wounded: normalized[2] ?? 0,
      severelyWounded: normalized[3] ?? 0,
      killed: normalized[4] ?? 0
    }
  };
}

function normalizeEquipmentPools(status: FormationStatus, authorizedTotal: number): void {
  const targetTotal = Math.max(0, Math.round(authorizedTotal));
  if (targetTotal <= 0) {
    status.equipment = {};
    return;
  }

  const aggregate = Object.values(status.equipment).reduce(
    (total, pool) => ({
      operational: total.operational + Math.max(0, Math.round(pool.operational)),
      damaged: total.damaged + Math.max(0, Math.round(pool.damaged)),
      disabled: total.disabled + Math.max(0, Math.round(pool.disabled)),
      destroyed: total.destroyed + Math.max(0, Math.round(pool.destroyed))
    }),
    { operational: 0, damaged: 0, disabled: 0, destroyed: 0 }
  );
  const aggregateTotal = aggregate.operational + aggregate.damaged + aggregate.disabled + aggregate.destroyed;

  const preferredKey =
    Object.prototype.hasOwnProperty.call(status.equipment, "vehicles")
      ? "vehicles"
      : Object.keys(status.equipment)[0] ?? "core";
  if (aggregateTotal <= 0) {
    status.equipment = { [preferredKey]: emptyVehicles(targetTotal) };
    return;
  }

  const normalized = normalizeCountVectorToTotal(
    [aggregate.operational, aggregate.damaged, aggregate.disabled, aggregate.destroyed],
    targetTotal
  );
  status.equipment = {
    [preferredKey]: {
      operational: normalized[0] ?? 0,
      damaged: normalized[1] ?? 0,
      disabled: normalized[2] ?? 0,
      destroyed: normalized[3] ?? 0
    }
  };
}

function reconcileStatusPoolsToFormation(
  status: FormationStatus,
  unitType: string,
  formation: FormationDefinition | undefined
): void {
  const personnelAuthorizedTotal = resolveAuthorizedPersonnelTotal(unitType, formation);
  const equipmentAuthorizedTotal = resolveAuthorizedEquipmentTotal(unitType, formation);
  normalizePersonnelPools(status, personnelAuthorizedTotal);
  normalizeEquipmentPools(status, equipmentAuthorizedTotal);
}

export function calculateFormationReadiness(
  status: FormationStatus | undefined,
  fallbackStrength: number
): { readiness: number; breakdown: FormationReadinessBreakdown } {
  if (!status) {
    const readiness = roundReadiness(fallbackStrength);
    const personnel = { total: 0, effective: 0, readiness, loss: roundReadiness(100 - readiness) };
    return {
      readiness,
      breakdown: {
        basis: "personnel",
        personnelWeight: 1,
        equipmentWeight: 0,
        personnel,
        equipment: null
      }
    };
  }

  const personnel = summarizePersonnelReadiness(status);
  const equipment = summarizeEquipmentReadiness(status);
  const model = normalizeReadinessModel(status);
  let readiness: number;

  if (personnel.total <= 0 && equipment.total <= 0) {
    readiness = roundReadiness(fallbackStrength);
  } else if (equipment.total <= 0 || model.basis === "personnel") {
    readiness = personnel.total > 0 ? personnel.readiness : roundReadiness(fallbackStrength);
  } else if (model.basis === "platform") {
    readiness = combinePlatformReadiness(personnel, equipment);
  } else {
    const availablePersonnelWeight = personnel.total > 0 ? model.personnelWeight : 0;
    const availableEquipmentWeight = equipment.total > 0 ? model.equipmentWeight : 0;
    const totalWeight = availablePersonnelWeight + availableEquipmentWeight;
    readiness = totalWeight > 0
      ? ((personnel.readiness * availablePersonnelWeight) + (equipment.readiness * availableEquipmentWeight)) / totalWeight
      : roundReadiness(fallbackStrength);
  }

  return {
    readiness: roundReadiness(readiness),
    breakdown: {
      basis: model.basis,
      personnelWeight: model.personnelWeight,
      equipmentWeight: model.equipmentWeight,
      personnel,
      equipment: equipment.total > 0 ? equipment : null
    }
  };
}

function bestEquipmentReadinessDistribution(total: number, targetReadiness: number): VehicleStatusPool {
  const targetEffective = (Math.max(0, Math.min(100, targetReadiness)) / 100) * total;
  let best: VehicleStatusPool = { operational: total, damaged: 0, disabled: 0, destroyed: 0 };
  let bestDiff = Math.abs(total - targetEffective);

  for (let operational = 0; operational <= total; operational += 1) {
    for (let damaged = 0; damaged <= total - operational; damaged += 1) {
      const effective = operational + damaged * EQUIPMENT_DAMAGED_EFFECTIVENESS;
      const diff = Math.abs(effective - targetEffective);
      const currentKeepsMoreVehiclesActive = operational + damaged > best.operational + best.damaged;
      if (diff < bestDiff - 0.0001 || (Math.abs(diff - bestDiff) <= 0.0001 && currentKeepsMoreVehiclesActive)) {
        bestDiff = diff;
        best = {
          operational,
          damaged,
          disabled: total - operational - damaged,
          destroyed: 0
        };
      }
    }
  }

  return best;
}

function applyPersonnelReadiness(pool: PersonnelStatusPool, readiness: number): void {
  const total = pool.fit + pool.injured + pool.wounded + pool.severelyWounded + pool.killed;
  const fit = Math.max(0, Math.min(total, Math.round((Math.max(0, Math.min(100, readiness)) / 100) * total)));
  pool.fit = fit;
  pool.injured = 0;
  pool.wounded = total - fit;
  pool.severelyWounded = 0;
  pool.killed = 0;
}

function applyEquipmentReadiness(pool: VehicleStatusPool, readiness: number): void {
  const total = pool.operational + pool.damaged + pool.disabled + pool.destroyed;
  const seeded = bestEquipmentReadinessDistribution(total, readiness);
  pool.operational = seeded.operational;
  pool.damaged = seeded.damaged;
  pool.disabled = seeded.disabled;
  pool.destroyed = seeded.destroyed;
}

export function applyReadinessScalarToStatus(status: FormationStatus, readiness: number): void {
  const model = normalizeReadinessModel(status);
  if (model.basis === "personnel" || model.basis === "combined") {
    Object.values(status.personnel).forEach((pool) => applyPersonnelReadiness(pool, readiness));
  }
  if (model.basis === "platform") {
    // Legacy scenario strength on a platform unit historically represented the
    // availability of major platforms. Seed that abstract value into equipment
    // only so a 75% imported tank company remains near 75% after status hydration
    // instead of suffering the same loss again through its crew pool.
    Object.values(status.personnel).forEach((pool) => applyPersonnelReadiness(pool, 100));
    Object.values(status.equipment).forEach((pool) => applyEquipmentReadiness(pool, readiness));
  } else if (model.basis === "combined") {
    Object.values(status.equipment).forEach((pool) => applyEquipmentReadiness(pool, readiness));
  }
}

function statusHasRecordedDamage(status: FormationStatus): boolean {
  const personnelDamage = Object.values(status.personnel).some(
    (pool) => pool.injured > 0 || pool.wounded > 0 || pool.severelyWounded > 0 || pool.killed > 0
  );
  const equipmentDamage = Object.values(status.equipment).some(
    (pool) => pool.damaged > 0 || pool.disabled > 0 || pool.destroyed > 0
  );
  return personnelDamage || equipmentDamage || (status.suppression ?? 0) > 0;
}

export function createInitialFormationStatus(unitType: string, formationKey?: string | null, readiness = 100): FormationStatus {
  const formation = formationKey ? getFormation(formationKey) : undefined;
  const matchingFormation = formation ?? undefined;
  const personnelEntries = matchingFormation?.personnel ?? [];
  const equipmentEntries = matchingFormation?.equipment ?? [];
  const personnel = Object.fromEntries(
    personnelEntries.map((entry) => [entry.id, emptyPersonnel(entry.count)])
  );
  const trackedVehicleCount = Math.max(0, Math.round(matchingFormation?.vehicles ?? 0));
  const equipment = trackedVehicleCount > 0
    ? { vehicles: emptyVehicles(trackedVehicleCount) }
    : Object.fromEntries(
      equipmentEntries
        .filter((entry) => entry.quantity > 1)
        .map((entry) => [entry.id, emptyVehicles(entry.quantity)])
    );

  if (Object.keys(personnel).length === 0) {
    personnel.core = emptyPersonnel(fallbackPersonnelCount(unitType));
  }
  if (Object.keys(equipment).length === 0) {
    const fallbackEquipment = fallbackEquipmentCount(unitType);
    if (fallbackEquipment > 0) {
      equipment.core = emptyVehicles(fallbackEquipment);
    }
  }

  const status: FormationStatus = {
    personnel,
    equipment,
    ammo: {},
    suppression: 0,
    readinessModel: buildReadinessModel(unitType, matchingFormation)
  };

  if (readiness < 99.95) {
    applyReadinessScalarToStatus(status, readiness);
  }

  return status;
}

export function deriveStrengthFromStatus(status: FormationStatus | undefined, fallbackStrength: number): number {
  return calculateFormationReadiness(status, fallbackStrength).readiness;
}

export function ensureFormationStatus(unit: ScenarioUnit, formationKey?: string | null): FormationStatus {
  const formation = formationKey ? getFormation(formationKey) : undefined;
  if (!unit.status) {
    unit.status = createInitialFormationStatus(unit.type as string, formationKey, unit.strength);
  } else if (!unit.status.readinessModel) {
    unit.status.readinessModel = buildReadinessModel(unit.type as string, formation);
  }
  reconcileStatusPoolsToFormation(unit.status, unit.type as string, formation);
  unit.status.readinessModel = buildReadinessModel(unit.type as string, formation);
  return unit.status;
}

export function synchronizeUnitStatusWithStrength(unit: ScenarioUnit, formationKey?: string | null): void {
  const status = ensureFormationStatus(unit, formationKey);
  if (!statusHasRecordedDamage(status) && unit.strength < 99.95) {
    applyReadinessScalarToStatus(status, unit.strength);
  }
  unit.strength = deriveStrengthFromStatus(status, unit.strength);
}

export function mergeSameTypeFormationStatus(target: ScenarioUnit, source: ScenarioUnit): void {
  if (target.type !== source.type) {
    throw new Error("Cannot merge status pools for different unit types.");
  }
  if (!source.status) {
    return;
  }
  const targetStatus = ensureFormationStatus(target);
  const personnelCaps = new Map<string, number>();
  const equipmentCaps = new Map<string, number>();

  Object.entries(source.status.personnel).forEach(([key, pool]) => {
    personnelCaps.set(key, Math.max(
      personnelPoolTotal(targetStatus.personnel[key]),
      personnelPoolTotal(pool)
    ));
  });
  Object.entries(source.status.equipment).forEach(([key, pool]) => {
    equipmentCaps.set(key, Math.max(
      equipmentPoolTotal(targetStatus.equipment[key]),
      equipmentPoolTotal(pool)
    ));
  });

  Object.entries(source.status.personnel).forEach(([key, pool]) => {
    const targetPool = targetStatus.personnel[key] ?? (targetStatus.personnel[key] = emptyPersonnel(0));
    personnelCaps.set(key, Math.max(
      personnelCaps.get(key) ?? 0,
      personnelPoolTotal(targetPool),
      personnelPoolTotal(pool)
    ));
    targetPool.fit += pool.fit;
    targetPool.injured += pool.injured;
    targetPool.wounded += pool.wounded;
    targetPool.severelyWounded += pool.severelyWounded;
    targetPool.killed += pool.killed;
    capPersonnelPoolToAuthorized(targetPool, personnelCaps.get(key) ?? personnelPoolTotal(targetPool));
  });
  Object.entries(source.status.equipment).forEach(([key, pool]) => {
    const targetPool = targetStatus.equipment[key] ?? (targetStatus.equipment[key] = emptyVehicles(0));
    equipmentCaps.set(key, Math.max(
      equipmentCaps.get(key) ?? 0,
      equipmentPoolTotal(targetPool),
      equipmentPoolTotal(pool)
    ));
    targetPool.operational += pool.operational;
    targetPool.damaged += pool.damaged;
    targetPool.disabled += pool.disabled;
    targetPool.destroyed += pool.destroyed;
    capEquipmentPoolToAuthorized(targetPool, equipmentCaps.get(key) ?? equipmentPoolTotal(targetPool));
  });
  target.strength = deriveStrengthFromStatus(targetStatus, target.strength);
}

export interface MedicalRecoveryResult {
  treated: number;
  returnedToFit: number;
  downgradedSeverity: number;
}

export interface EquipmentRepairResult {
  repaired: number;
  returnedToOperational: number;
  restoredFromDisabled: number;
}

function spendCapacity(capacity: { remaining: number }, cost: number): boolean {
  if (capacity.remaining < cost) {
    return false;
  }
  capacity.remaining -= cost;
  return true;
}

export function applyMedicalRecoveryToUnit(unit: ScenarioUnit, capacityPoints: number): MedicalRecoveryResult {
  const status = ensureFormationStatus(unit, unit.formationKey);
  const capacity = { remaining: Math.max(0, Math.round(capacityPoints)) };
  const result: MedicalRecoveryResult = { treated: 0, returnedToFit: 0, downgradedSeverity: 0 };

  Object.values(status.personnel).forEach((pool) => {
    while (pool.severelyWounded > 0 && spendCapacity(capacity, 3)) {
      pool.severelyWounded -= 1;
      pool.wounded += 1;
      result.treated += 1;
      result.downgradedSeverity += 1;
    }
    while (pool.wounded > 0 && spendCapacity(capacity, 2)) {
      pool.wounded -= 1;
      pool.injured += 1;
      result.treated += 1;
      result.downgradedSeverity += 1;
    }
    while (pool.injured > 0 && spendCapacity(capacity, 1)) {
      pool.injured -= 1;
      pool.fit += 1;
      result.treated += 1;
      result.returnedToFit += 1;
    }
  });

  unit.strength = deriveStrengthFromStatus(status, unit.strength);
  return result;
}

export function applyEquipmentRepairToUnit(unit: ScenarioUnit, capacityPoints: number): EquipmentRepairResult {
  const status = ensureFormationStatus(unit, unit.formationKey);
  const capacity = { remaining: Math.max(0, Math.round(capacityPoints)) };
  const result: EquipmentRepairResult = { repaired: 0, returnedToOperational: 0, restoredFromDisabled: 0 };

  Object.values(status.equipment).forEach((pool) => {
    while (pool.disabled > 0 && spendCapacity(capacity, 3)) {
      pool.disabled -= 1;
      pool.damaged += 1;
      result.repaired += 1;
      result.restoredFromDisabled += 1;
    }
    while (pool.damaged > 0 && spendCapacity(capacity, 2)) {
      pool.damaged -= 1;
      pool.operational += 1;
      result.repaired += 1;
      result.returnedToOperational += 1;
    }
  });

  unit.strength = deriveStrengthFromStatus(status, unit.strength);
  return result;
}
