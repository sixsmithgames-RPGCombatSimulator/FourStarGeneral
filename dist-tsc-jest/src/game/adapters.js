/**
 * Library of baseline unit templates keyed by the allocation catalog entry. These numbers bake in the
 * assumptions from the requisition screen so the tactical engine receives deterministic payloads.
 * Each template's `type` points directly to a `UnitTypeDictionary` entry so allocation choices convert
 * cleanly into the battle engine's `ScenarioUnit` payloads.
 */
export const deploymentTemplates = [
    // The precombat allocation catalog uses these short-form keys. We mirror them here so scenarios, engine templates,
    // and data modules all speak the same vocabulary. If allocation keys change, update this list together with
    // `allocationOptions` and any authored scenarios to keep aliasing lossless.
    {
        key: "infantry",
        type: "Infantry_42",
        strength: 100,
        ammo: 6,
        fuel: 0,
        entrench: 1,
        facing: "NW",
        experience: 1
    },
    {
        key: "tank",
        type: "Light_Tank",
        strength: 100,
        ammo: 7,
        fuel: 40,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "artillery",
        type: "Howitzer_105",
        strength: 100,
        ammo: 6,
        fuel: 2,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "howitzer",
        type: "Howitzer_105",
        strength: 100,
        ammo: 6,
        fuel: 2,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "fighter",
        type: "Fighter",
        strength: 100,
        ammo: 6,
        fuel: 50,
        entrench: 0,
        facing: "NW",
        experience: 2
    },
    {
        key: "bomber",
        type: "Bomber",
        strength: 100,
        ammo: 4,
        fuel: 60,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    // Legacy scenarios list recon assets by their scenario type (e.g., `Recon_Bike`). Register the canonical
    // allocation key so the deployment bridge can translate those payloads back into the UI catalog entry `recon`.
    {
        key: "recon",
        type: "Recon_ArmoredCar",
        strength: 100,
        ammo: 6,
        fuel: 45,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    // Scenario files still reference the original `Recon_Bike` type. Mirror it to the shared `reconBike`
    // allocation key so DeploymentState can translate engine snapshots without resorting to fallbacks.
    {
        key: "reconBike",
        type: "Recon_Bike",
        strength: 100,
        ammo: 5,
        fuel: 30,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    // Engineers appear in legacy scenarios even when the commander skips precombat. Expose the canonical
    // allocation entry so the deployment bridge can translate the engine's `Engineer` scenario type back
    // into the UI-facing `engineer` key without dropping reserve counts.
    {
        key: "engineer",
        type: "Engineer",
        strength: 100,
        ammo: 5,
        fuel: 0,
        entrench: 1,
        facing: "NW",
        experience: 1
    },
    {
        key: "infantryBattalion",
        type: "Infantry_42",
        strength: 100,
        ammo: 6,
        fuel: 0,
        entrench: 1,
        facing: "NW",
        experience: 1
    },
    {
        key: "eliteInfantryCompany",
        type: "AT_Infantry",
        strength: 100,
        ammo: 7,
        fuel: 0,
        entrench: 0,
        facing: "NW",
        experience: 2
    },
    {
        key: "airborneDetachment",
        type: "Paratrooper",
        strength: 100,
        ammo: 6,
        fuel: 0,
        entrench: 0,
        facing: "NW",
        experience: 2
    },
    {
        key: "combatEngineerCompany",
        type: "Engineer",
        strength: 100,
        ammo: 5,
        fuel: 0,
        entrench: 1,
        facing: "NW",
        experience: 1
    },
    {
        key: "antiTankBattery",
        type: "AT_Gun_50mm",
        strength: 100,
        ammo: 5,
        fuel: 2,
        entrench: 1,
        facing: "NW",
        experience: 1
    },
    {
        key: "flakBattery",
        type: "Flak_88",
        strength: 100,
        ammo: 6,
        fuel: 2,
        entrench: 1,
        facing: "NW",
        experience: 1
    },
    {
        key: "reconTroop",
        type: "Recon_ArmoredCar",
        strength: 100,
        ammo: 6,
        fuel: 45,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "apcTruckColumn",
        type: "APC_Truck",
        strength: 100,
        ammo: 0,
        fuel: 60,
        entrench: 0,
        facing: "NW",
        experience: 0
    },
    {
        key: "apcHalftrackCompany",
        type: "APC_Halftrack",
        strength: 100,
        ammo: 2,
        fuel: 50,
        entrench: 0,
        facing: "NW",
        experience: 0
    },
    {
        key: "supplyConvoy",
        type: "Supply_Truck",
        strength: 100,
        ammo: 0,
        fuel: 70,
        entrench: 0,
        facing: "NW",
        experience: 0
    },
    {
        key: "armoredCompany",
        type: "Light_Tank",
        strength: 100,
        ammo: 7,
        fuel: 40,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "heavyTankCompany",
        type: "Heavy_Tank",
        strength: 100,
        ammo: 6,
        fuel: 35,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "tankDestroyerCompany",
        type: "Tank_Destroyer",
        strength: 100,
        ammo: 6,
        fuel: 35,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "assaultGunBattalion",
        type: "Assault_Gun",
        strength: 100,
        ammo: 6,
        fuel: 30,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "artilleryBattery",
        type: "Howitzer_105",
        strength: 100,
        ammo: 6,
        fuel: 2,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "rocketArtilleryBattalion",
        type: "Rocket_Artillery",
        strength: 100,
        ammo: 5,
        fuel: 30,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "spArtilleryGroup",
        type: "SP_Artillery",
        strength: 100,
        ammo: 6,
        fuel: 40,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "scoutPlaneWing",
        type: "Scout_Plane",
        strength: 100,
        ammo: 2,
        fuel: 55,
        entrench: 0,
        facing: "NW",
        experience: 2
    },
    {
        key: "fighterWing",
        type: "Fighter",
        strength: 100,
        ammo: 6,
        fuel: 50,
        entrench: 0,
        facing: "NW",
        experience: 2
    },
    {
        key: "interceptorWing",
        type: "Interceptor",
        strength: 100,
        ammo: 7,
        fuel: 55,
        entrench: 0,
        facing: "NW",
        experience: 2
    },
    {
        key: "groundAttackWing",
        type: "Ground_Attack",
        strength: 100,
        ammo: 5,
        fuel: 55,
        entrench: 0,
        facing: "NW",
        experience: 2
    },
    {
        key: "bomberWing",
        type: "Bomber",
        strength: 100,
        ammo: 4,
        fuel: 60,
        entrench: 0,
        facing: "NW",
        experience: 1
    },
    {
        key: "transportWing",
        type: "Transport_Plane",
        strength: 100,
        ammo: 0,
        fuel: 65,
        entrench: 0,
        facing: "NW",
        experience: 1
    }
];
/**
 * Fast lookup keyed by allocation catalog entry. We maintain both the array (for iteration) and map for
 * O(1) access from UI placement conversions.
 */
const templateRegistry = new Map(deploymentTemplates.map((template) => [template.key, template]));
/**
 * Returns the deployment template matching the provided allocation key, or null if the key is
 * unregistered. UI callers can surface a friendly message when the data model drifts out of sync.
 */
export function findTemplateForUnitKey(unitKey) {
    return templateRegistry.get(unitKey) ?? null;
}
/**
 * Convenience helper that materializes a `ScenarioUnit` using the template and a concrete hex. This is
 * handy for tests and for any UI restore flows that need to place units directly without iterating the
 * full engine initialization path.
 */
export function createScenarioUnitFromTemplate(template, hex) {
    return {
        type: template.type,
        hex: { q: hex.q, r: hex.r },
        strength: template.strength,
        experience: template.experience,
        ammo: template.ammo,
        fuel: template.fuel,
        entrench: template.entrench,
        facing: template.facing
    };
}
/**
 * Validates that every registered deployment template references a real unit definition. Because the
 * check runs during initialization, the UI can fail fast and avoid wiring the engine with inconsistent
 * data.
 */
export function validateTemplates(unitTypes) {
    deploymentTemplates.forEach((template) => {
        if (!unitTypes[template.type]) {
            throw new Error(`Deployment template '${template.key}' references unknown unit type '${template.type}'.`);
        }
    });
}
