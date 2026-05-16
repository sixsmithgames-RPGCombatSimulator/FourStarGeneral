import type { TacticalStatDefinition, UnitTypeKey } from "./types";
import { formationList, scenarioOnlyTacticalDefinitions } from "./formations";

const entries = [
  ...formationList
    .filter((formation) => formation.tacticalUnitType && formation.tactical)
    .map((formation) => [formation.tacticalUnitType!, formation.tactical!] as const),
  ...scenarioOnlyTacticalDefinitions.map((entry) => [entry.type, entry.tactical] as const)
] as const;

export const unitTypesData = Object.freeze(
  Object.fromEntries(entries.map(([key, value]) => [key, Object.freeze({ ...value, traits: [...value.traits] })]))
) as Readonly<Record<UnitTypeKey, TacticalStatDefinition>>;

export type UnitTypeDataKey = keyof typeof unitTypesData;

export function getUnitTypeDefinition(key: string): TacticalStatDefinition | undefined {
  return Object.prototype.hasOwnProperty.call(unitTypesData, key)
    ? unitTypesData[key as UnitTypeKey]
    : undefined;
}

export default unitTypesData;
