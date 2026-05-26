import { seedUnitExperience } from "../core/Experience";
import { getDeployableFormations } from "../data/unitSystem/formations";
import { createInitialFormationStatus } from "../data/unitSystem/status";
export const deploymentTemplates = Object.freeze(getDeployableFormations().map((formation) => {
    const loadout = formation.startingLoadout;
    return {
        key: formation.key,
        type: formation.tacticalUnitType,
        strength: loadout.strength,
        ammo: loadout.ammo,
        fuel: loadout.fuel,
        entrench: loadout.entrench,
        facing: loadout.facing,
        experience: loadout.baseExperience,
        baseExperience: loadout.baseExperience
    };
}));
const templateRegistry = new Map(deploymentTemplates.map((template) => [template.key, template]));
export function findTemplateForUnitKey(unitKey) {
    return templateRegistry.get(unitKey) ?? null;
}
export function createScenarioUnitFromTemplate(template, hex) {
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
        status: createInitialFormationStatus(template.type, template.key, template.strength)
    };
    return seedUnitExperience(unit, template.baseExperience);
}
export function validateTemplates(unitTypes) {
    deploymentTemplates.forEach((template) => {
        if (!unitTypes[template.type]) {
            throw new Error(`Deployment template '${template.key}' references unknown unit type '${template.type}'.`);
        }
    });
}
