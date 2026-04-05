"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOCATION_BY_CATEGORY = exports.ALLOCATION_BY_KEY = exports.allocationOptions = void 0;
exports.isAllocationKey = isAllocationKey;
exports.getAllocationOption = getAllocationOption;
/**
 * Canonical allocation catalog mirrored from `PRECOMBAT_SCREEN_TODO.md`. Values remain static at
 * runtime so the UI can safely reuse references without defensive copies.
 */
exports.allocationOptions = [
    {
        key: "infantry",
        label: "Infantry Battalion",
        category: "units",
        costPerUnit: 50000,
        description: "Balanced line infantry with rifle companies, integral machine guns, and battalion mortars for holding ground.",
        maxQuantity: 20,
        spriteUrl: new URL("../assets/units/Infantry.png", import.meta.url).href
    },
    {
        key: "airborneDetachment",
        label: "Airborne Detachment",
        category: "units",
        costPerUnit: 100000,
        description: "Elite parachute force suited for raids, rapid blocking actions, and hard-fought light-infantry work.",
        maxQuantity: 4,
        spriteUrl: new URL("../assets/units/Paratrooper.png", import.meta.url).href
    },
    {
        key: "engineer",
        label: "Engineering Corps",
        category: "units",
        costPerUnit: 80000,
        description: "Combat engineers able to dig in, fortify key hexes, breach obstacles, and improve crossing positions.",
        maxQuantity: 10,
        spriteUrl: new URL("../assets/units/Engineer.png", import.meta.url).href
    },
    {
        key: "tank",
        label: "Tank Company",
        category: "units",
        costPerUnit: 200000,
        description: "Medium armor for breakthrough attacks, mobile reserve work, and direct fire against fortified positions.",
        maxQuantity: 10,
        spriteUrl: new URL("../assets/units/Medium_Tank.png", import.meta.url).href
    },
    {
        key: "heavyTankCompany",
        label: "Heavy Tank Company",
        category: "units",
        costPerUnit: 280000,
        description: "Slow but punishing heavy armor built to break defended lines and absorb enemy anti-tank fire.",
        maxQuantity: 4,
        spriteUrl: new URL("../assets/units/Heavy_Tank.png", import.meta.url).href
    },
    {
        key: "tankDestroyerCompany",
        label: "Tank Destroyer Company",
        category: "units",
        costPerUnit: 255000,
        description: "High-velocity anti-armor company for countering tanks from standoff positions and covered lanes.",
        maxQuantity: 5,
        spriteUrl: new URL("../assets/units/Anti_Tank_Tank.png", import.meta.url).href
    },
    {
        key: "assaultGunBattalion",
        label: "Assault Gun Battalion",
        category: "units",
        costPerUnit: 240000,
        description: "Armored assault guns providing close fire support where towed artillery would lag behind.",
        maxQuantity: 5,
        spriteUrl: new URL("../assets/units/Assault_Gun.png", import.meta.url).href
    },
    {
        key: "howitzer",
        label: "Howitzer Battery",
        category: "units",
        costPerUnit: 180000,
        description: "Towed 105mm battery for indirect bombardment, counter-mobility fire, and sustained support of infantry attacks.",
        maxQuantity: 6,
        spriteUrl: new URL("../assets/units/Howitzer_105.png", import.meta.url).href
    },
    {
        key: "rocketArtilleryBattalion",
        label: "Rocket Artillery Battalion",
        category: "units",
        costPerUnit: 260000,
        description: "Rocket launch battalion for short, violent saturation strikes against concentrations and ford approaches.",
        maxQuantity: 4,
        spriteUrl: new URL("../assets/units/Rocket_Artillery.png", import.meta.url).href
    },
    {
        key: "spArtilleryGroup",
        label: "Self-Propelled Artillery Group",
        category: "units",
        costPerUnit: 275000,
        description: "Armored self-propelled guns that can fire, displace, and keep pace with mechanized formations.",
        maxQuantity: 4,
        spriteUrl: new URL("../assets/units/SP_Artillery.png", import.meta.url).href
    },
    {
        key: "antiTankBattery",
        label: "Anti-Tank Gun Battery",
        category: "units",
        costPerUnit: 80000,
        description: "Crew-served anti-tank guns ideal for covering roads, crossings, and likely armored approach lanes.",
        maxQuantity: 6,
        spriteUrl: new URL("../assets/units/AT_Gun_50mm.png", import.meta.url).href
    },
    {
        key: "flakBattery",
        label: "Flak Battery",
        category: "units",
        costPerUnit: 210000,
        description: "Dual-purpose 88mm battery providing defensive flak coverage against hostile air strikes while engaging armor and soft targets.",
        maxQuantity: 6,
        spriteUrl: new URL("../assets/units/Flak_88.png", import.meta.url).href
    },
    {
        key: "recon",
        label: "Recon Squad",
        category: "units",
        costPerUnit: 75000,
        description: "Armored reconnaissance troop for screening, spotting enemy movement, and cueing fires from safer range.",
        maxQuantity: 12,
        spriteUrl: new URL("../assets/units/Recon_ArmoredCar.png", import.meta.url).href
    },
    {
        key: "reconBike",
        label: "Recon Bike Patrol",
        category: "units",
        costPerUnit: 45000,
        description: "Light two-wheel scout patrol with a smaller rider package for fast screening, flank checks, and urgent liaison work.",
        maxQuantity: 8,
        spriteUrl: new URL("../assets/units/Recon_Bike.png", import.meta.url).href
    },
    {
        key: "scoutPlaneWing",
        label: "Reconnaissance Flight",
        category: "support",
        costPerUnit: 185000,
        description: "Off-map observation flight for battlefield scouting, artillery spotting, and route reconnaissance over the front.",
        maxQuantity: 3,
        spriteUrl: new URL("../assets/units/Scout_Plane.png", import.meta.url).href
    },
    {
        key: "fighter",
        label: "Fighter Squadron",
        category: "support",
        costPerUnit: 240000,
        description: "Off-map fighter cover committed to escort, interception, and local air superiority over the battle area.",
        maxQuantity: 4,
        spriteUrl: new URL("../assets/units/Aircraft_USA_P51.png", import.meta.url).href
    },
    {
        key: "interceptorWing",
        label: "Interceptor Squadron",
        category: "support",
        costPerUnit: 255000,
        description: "High-readiness interceptor package tasked with breaking up hostile reconnaissance and bombing sorties.",
        maxQuantity: 3,
        spriteUrl: new URL("../assets/units/Aircraft_England_Spitfire.png", import.meta.url).href
    },
    {
        key: "groundAttackWing",
        label: "Close Support Squadron",
        category: "support",
        costPerUnit: 265000,
        description: "Fighter-bombers assigned to timed strikes against armor, gun lines, and exposed troop concentrations.",
        maxQuantity: 3,
        spriteUrl: new URL("../assets/units/Aircraft_USA_B25.png", import.meta.url).href
    },
    {
        key: "bomber",
        label: "Tactical Bomber Squadron",
        category: "support",
        costPerUnit: 260000,
        description: "Medium bomber detachment for heavier interdiction strikes against reserves, depots, and fortified positions.",
        maxQuantity: 4,
        spriteUrl: new URL("../assets/units/Aircraft_USA_B17.png", import.meta.url).href
    },
    {
        key: "transportWing",
        label: "Transport Flight",
        category: "support",
        costPerUnit: 190000,
        description: "Transport aircraft held off-map for airborne drops, courier lifts, and emergency resupply runs.",
        maxQuantity: 2,
        spriteUrl: new URL("../assets/units/Transport_Plane.png", import.meta.url).href
    },
    {
        key: "apcTruckColumn",
        label: "Motor Transport Column",
        category: "units",
        costPerUnit: 140000,
        description: "Soft-skinned troop lorries for moving infantry and weapons teams between staging areas and threatened sectors.",
        maxQuantity: 6,
        spriteUrl: new URL("../assets/units/APC_Truck.png", import.meta.url).href
    },
    {
        key: "apcHalftrackCompany",
        label: "Halftrack Carrier Company",
        category: "units",
        costPerUnit: 175000,
        description: "Protected halftracks that keep mechanized infantry moving under light fire and across broken ground.",
        maxQuantity: 5,
        spriteUrl: new URL("../assets/units/APC_Halftrack.png", import.meta.url).href
    },
    {
        key: "supplyConvoy",
        label: "Supply Convoy",
        category: "logistics",
        costPerUnit: 40000,
        description: "Forward resupply convoy carrying packaged ammunition, fuel, and rations from rear dumps to the line.",
        maxQuantity: 6,
        spriteUrl: new URL("../assets/units/Supply_Truck.png", import.meta.url).href
    },
    {
        key: "ammo",
        label: "Ammunition Dump",
        category: "supplies",
        costPerUnit: 30000,
        description: "Requisitioned shell and small-arms reserve held in revetted dumps behind the fighting line.",
        maxQuantity: 50,
        spriteUrl: undefined
    },
    {
        key: "fuel",
        label: "Fuel Dump",
        category: "supplies",
        costPerUnit: 25000,
        description: "Drummed fuel reserve and pumping gear for replenishing armored, motorized, and convoy formations.",
        maxQuantity: 50,
        spriteUrl: undefined
    },
    {
        key: "medic",
        label: "Medical Detachment",
        category: "logistics",
        costPerUnit: 60000,
        description: "Forward aid and evacuation detachment for casualty clearing, ambulance runs, and stabilization near the front.",
        maxQuantity: 15,
        implemented: false,
        spriteUrl: undefined
    },
    {
        key: "transport",
        label: "Transport Column",
        category: "logistics",
        costPerUnit: 70000,
        description: "Rear-area truck lift reserved for campaign movement planning rather than tactical battle requisitions.",
        maxQuantity: 15,
        visibleInAllocationUi: false,
        spriteUrl: undefined
    },
    {
        key: "maintenance",
        label: "Recovery & Repair Section",
        category: "logistics",
        costPerUnit: 55000,
        description: "Field workshop and recovery section for damaged vehicles, gun teams, and broken-down prime movers.",
        maxQuantity: 12,
        implemented: false,
        spriteUrl: undefined
    },
    {
        key: "corpsArtilleryGroup",
        label: "Corps Artillery Group",
        category: "support",
        costPerUnit: 165000,
        description: "Observer-directed off-map corps guns for timed bombardments beyond the range of on-map batteries.",
        maxQuantity: 2,
        implemented: false,
        spriteUrl: undefined
    },
    {
        key: "shoreFireControlParty",
        label: "Shore Fire Control Party",
        category: "support",
        costPerUnit: 210000,
        description: "Naval gunfire liaison team coordinating destroyer and cruiser bombardment from offshore stations.",
        maxQuantity: 1,
        implemented: false,
        spriteUrl: undefined
    }
];
var allocationEntries = exports.allocationOptions;
/**
 * Mapping helper that enables constant-time lookups by key during quantity adjustments.
 */
exports.ALLOCATION_BY_KEY = Object.freeze(Object.fromEntries(allocationEntries.map(function (option) { return [option.key, option]; })));
/**
 * Cached category partitions so the precombat screen can render filtered lists without re-running
 * expensive array filters on every state change.
 */
exports.ALLOCATION_BY_CATEGORY = (function () {
    var categoryMap = new Map();
    for (var _i = 0, allocationEntries_1 = allocationEntries; _i < allocationEntries_1.length; _i++) {
        var option = allocationEntries_1[_i];
        var bucket = categoryMap.get(option.category);
        if (bucket) {
            bucket.push(option);
        }
        else {
            categoryMap.set(option.category, [option]);
        }
    }
    return new Map(Array.from(categoryMap.entries(), function (_a) {
        var category = _a[0], options = _a[1];
        return [
            category,
            Object.freeze(options)
        ];
    }));
})();
var allocationKeySet = new Set(allocationEntries.map(function (option) { return option.key; }));
/**
 * Runtime guard shielding downstream callers from typos when receiving user input or parsing saves.
 */
function isAllocationKey(value) {
    return allocationKeySet.has(value);
}
/**
 * Public lookup that safely unwraps an allocation entry while preserving type narrowing from the guard.
 */
function getAllocationOption(key) {
    if (isAllocationKey(key)) {
        return exports.ALLOCATION_BY_KEY[key];
    }
    return undefined;
}
