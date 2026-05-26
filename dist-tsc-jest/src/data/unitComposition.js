import { formationList } from "./unitSystem/formations";
const platformLabelPattern = /\b(tank|tanks|tank destroyer|tank destroyers|assault gun|assault guns|aircraft|plane|planes|fighter|fighters|fighter-bomber|fighter-bombers|bomber|bombers|interceptor|interceptors|truck|trucks|lorry|lorries|jeep|jeeps|bowser|bowsers|halftrack|halftracks|car|cars|motorbike|motorbikes|vehicle|vehicles|carrier|carriers|tractor|tractors|prime mover|prime movers|gun|guns|howitzer|howitzers|launcher|launchers|ambulance|ambulances|boat|boats|craft)\b/i;
function isVehicleOrPlatformLabel(label) {
    return platformLabelPattern.test(label);
}
export const unitComposition = Object.freeze(Object.fromEntries(formationList.map((formation) => {
    const personnelBreakdown = formation.personnel.map((entry) => ({
        id: entry.id,
        label: entry.label,
        count: entry.count,
        role: entry.role
    }));
    const equipmentBreakdown = formation.equipment.map((entry) => ({
        id: entry.id,
        label: entry.label,
        quantity: entry.quantity,
        platformId: entry.platformId,
        purpose: entry.purpose,
        canonStatus: entry.canonStatus
    }));
    const vehicleBreakdown = equipmentBreakdown
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
        }
    ];
})));
