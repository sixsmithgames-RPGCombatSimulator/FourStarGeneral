/**
 * WHAT: Resolves allocation identity without treating a shared tactical type as a logistics role.
 * WHY: Formation/reserve metadata must outrank legacy type aliases at deployment and presentation boundaries.
 * DEPENDENCIES: The existing formation catalog only; no state, engine, or UI authority is introduced.
 */
import { formationList, getFormation } from "./unitSystem/formations";

interface AllocationIdentitySource {
  readonly type: string;
  readonly formationKey?: string;
}

/**
 * Explicit catalog identity is validated before use. A registered non-logistics legacy alias can
 * still describe old custom scenarios; an anonymous Supply_Truck always means a supply convoy.
 * Unknown custom tactical types retain their existing formation-status semantics.
 */
export function resolveUnitAllocationKey(
  unit: AllocationIdentitySource,
  reserveAllocationKey?: string,
  legacyTypeAlias?: string | null
): string | null {
  const typeFormation = formationList.find((entry) => entry.tacticalUnitType === unit.type && entry.startingLoadout);
  const validate = (key: string, source: "formation" | "reserve"): string => {
    const formation = typeof key === "string" ? getFormation(key) : undefined;
    const registeredLegacy = source === "reserve" && unit.formationKey === undefined
      && unit.type !== "Supply_Truck" && key === legacyTypeAlias;
    if (registeredLegacy) return key;
    if (!formation?.tacticalUnitType || !formation.startingLoadout
      || ((typeFormation || unit.type === "Supply_Truck") && formation.tacticalUnitType !== unit.type)) {
      throw new Error(`Invalid allocation identity: ${source} key '${String(key)}' does not describe tactical type '${unit.type}'. Reload a valid unit allocation before deploying or recalling this formation.`);
    }
    return formation.key;
  };

  const formationKey = unit.formationKey === undefined ? null : validate(unit.formationKey, "formation");
  // Older engine reserves sometimes stored the raw tactical type as their allocation key.
  const reserveKey = reserveAllocationKey === undefined || reserveAllocationKey === unit.type
    ? null : validate(reserveAllocationKey, "reserve");
  if (formationKey && reserveKey && formationKey !== reserveKey) {
    throw new Error(`Conflicting allocation identity: formation '${formationKey}' and reserve '${reserveKey}' disagree for '${unit.type}'. Reload a valid unit allocation before deploying or recalling this formation.`);
  }
  if (formationKey || reserveKey) return formationKey ?? reserveKey;
  if (unit.type === "Supply_Truck") return "supplyConvoy";
  return legacyTypeAlias ?? typeFormation?.key ?? null;
}
