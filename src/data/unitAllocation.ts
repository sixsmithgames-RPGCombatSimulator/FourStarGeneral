import {
  formationList,
  getFormation,
  isUnitAllocationKey,
  unitFormations
} from "./unitSystem/formations";
import type { FormationAllocationCategory, UnitAllocationKey } from "./unitSystem/types";

/**
 * Enumerates the high-level groupings displayed by the precombat allocation UI.
 */
export type AllocationCategory = FormationAllocationCategory;

/**
 * Immutable description for each selectable allocation row. These values are now derived from the
 * authoritative formation catalog so labels, history, cost, category, and composition do not drift.
 */
export interface UnitAllocationOption {
  readonly key: UnitAllocationKey;
  readonly label: string;
  readonly category: AllocationCategory;
  readonly costPerUnit: number;
  readonly description: string;
  readonly maxQuantity: number;
  readonly spriteUrl?: string;
  readonly implemented?: boolean;
  readonly visibleInAllocationUi?: boolean;
  readonly depotPayload?: Readonly<{
    ammo?: number;
    fuel?: number;
    rations?: number;
    parts?: number;
  }>;
}

export const allocationOptions = Object.freeze(
  formationList.map((formation) => ({
    key: formation.key,
    label: formation.label,
    category: formation.requisition.category,
    costPerUnit: formation.requisition.costPerUnit,
    description: formation.gameplayDescription,
    maxQuantity: formation.requisition.maxQuantity,
    spriteUrl: formation.spriteUrl,
    implemented: formation.requisition.implemented,
    visibleInAllocationUi: formation.requisition.visibleInAllocationUi,
    depotPayload: formation.requisition.depotPayload
  }))
) as readonly UnitAllocationOption[];

export const ALLOCATION_BY_KEY = Object.freeze(
  Object.fromEntries(allocationOptions.map((option) => [option.key, option]))
) as Readonly<Record<UnitAllocationKey, UnitAllocationOption>>;

export const ALLOCATION_BY_CATEGORY = (() => {
  const categoryMap = new Map<AllocationCategory, UnitAllocationOption[]>();
  for (const option of allocationOptions) {
    const bucket = categoryMap.get(option.category);
    if (bucket) {
      bucket.push(option);
    } else {
      categoryMap.set(option.category, [option]);
    }
  }

  return new Map(
    Array.from(categoryMap.entries(), ([category, options]) => [
      category,
      Object.freeze(options) as readonly UnitAllocationOption[]
    ])
  ) as ReadonlyMap<AllocationCategory, readonly UnitAllocationOption[]>;
})();

export { isUnitAllocationKey as isAllocationKey };

export function getAllocationOption(key: string): UnitAllocationOption | undefined {
  if (!isUnitAllocationKey(key)) {
    return undefined;
  }
  return ALLOCATION_BY_KEY[key];
}

export function getAllocationFormation(key: string) {
  return getFormation(key);
}

export type { UnitAllocationKey };
export { unitFormations };
