import type { ScenarioUnit, UnitTypeDictionary } from "../core/types";
import { seedUnitExperience } from "../core/Experience";
import { getDeployableFormations } from "../data/unitSystem/formations";
import type { UnitAllocationKey } from "../data/unitSystem/types";
import { createInitialFormationStatus } from "../data/unitSystem/status";

/**
 * Describes the baseline combat stats that a requisitioned unit should carry when transformed into a
 * `ScenarioUnit`. These templates are derived from the authoritative unit-system formation catalog.
 */
export interface DeploymentUnitTemplate {
  /** Key used by the allocation UI. */
  key: UnitAllocationKey;
  /** Concrete scenario unit type that the engine understands. */
  type: keyof UnitTypeDictionary;
  /** Starting strength/readiness value delivered to the battle engine. */
  strength: number;
  /** Ammunition crates available to the unit at start. */
  ammo: number;
  /** Fuel reserves loaded prior to deployment. */
  fuel: number;
  /** Entrenchment level applied when the unit enters the map. */
  entrench: number;
  /** Initial facing so armor arcs behave consistently. */
  facing: ScenarioUnit["facing"];
  /** Effective experience for legacy callers. */
  experience: number;
  /** Trained experience the formation starts with. */
  baseExperience: number;
}

export interface DeploymentAllotment {
  /** Allocation catalog key that matches a `DeploymentUnitTemplate.key`. */
  unitKey: string;
  /** Number of units requested for that key. */
  quantity: number;
}

export const deploymentTemplates = Object.freeze(
  getDeployableFormations().map((formation) => {
    const loadout = formation.startingLoadout!;
    return {
      key: formation.key,
      type: formation.tacticalUnitType as keyof UnitTypeDictionary,
      strength: loadout.strength,
      ammo: loadout.ammo,
      fuel: loadout.fuel,
      entrench: loadout.entrench,
      facing: loadout.facing,
      experience: loadout.baseExperience,
      baseExperience: loadout.baseExperience
    } satisfies DeploymentUnitTemplate;
  })
) as readonly DeploymentUnitTemplate[];

const templateRegistry = new Map<string, DeploymentUnitTemplate>(
  deploymentTemplates.map((template) => [template.key, template])
);

export function findTemplateForUnitKey(unitKey: string): DeploymentUnitTemplate | null {
  return templateRegistry.get(unitKey) ?? null;
}

export function createScenarioUnitFromTemplate(
  template: DeploymentUnitTemplate,
  hex: ScenarioUnit["hex"]
): ScenarioUnit {
  const unit = {
    type: template.type,
    hex: { q: hex.q, r: hex.r },
    strength: template.strength,
    experience: template.experience,
    baseExperience: template.baseExperience,
    earnedExperience: 0,
    ammo: template.ammo,
    fuel: template.fuel,
    entrench: template.entrench,
    facing: template.facing,
    formationKey: template.key,
    status: createInitialFormationStatus(template.type as string, template.key, template.strength)
  } satisfies ScenarioUnit;
  return seedUnitExperience(unit, template.baseExperience);
}

export function validateTemplates(unitTypes: UnitTypeDictionary): void {
  deploymentTemplates.forEach((template) => {
    if (!unitTypes[template.type]) {
      throw new Error(`Deployment template '${template.key}' references unknown unit type '${template.type}'.`);
    }
  });
}
