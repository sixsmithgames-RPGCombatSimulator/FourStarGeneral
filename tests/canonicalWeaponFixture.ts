/** Supplies the required authored weapon model while retaining each fixture's explicit tactical inputs. */
import type { UnitTypeDefinition } from "../src/core/types";
import { getFormation } from "../src/data/unitSystem/formations";

/** Fails during fixture construction when the canonical formation has no usable weapon groups. */
export function canonicalWeaponModel(formationKey: string): NonNullable<UnitTypeDefinition["weaponModel"]> {
  const model = getFormation(formationKey)?.tactical?.weaponModel;
  if (!model?.groups.length) throw new Error(`Missing canonical weapon model for ${formationKey}.`);
  return model;
}
