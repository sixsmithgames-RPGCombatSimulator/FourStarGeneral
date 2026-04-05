"use strict";
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LIGHT_VEHICLE_UNITS = exports.FIGHTER_UNITS = exports.BOMBER_UNITS = exports.NAVAL_WARSHIP_UNITS = exports.NAVAL_TRANSPORT_UNITS = exports.TOWED_ARTILLERY_UNITS = exports.ARMOR_MOTORIZED_UNITS = exports.INFANTRY_UNITS = exports.TRANSPORT_MODES = exports.TRANSPORT_MODE_BOMBER = exports.TRANSPORT_MODE_FIGHTER = exports.TRANSPORT_MODE_WARSHIP = exports.TRANSPORT_MODE_NAVAL = exports.TRANSPORT_MODE_ARMOR = exports.TRANSPORT_MODE_TRUCK = exports.TRANSPORT_MODE_FOOT = void 0;
exports.getTransportMode = getTransportMode;
exports.getApplicableTransportModes = getApplicableTransportModes;
exports.getDefaultTransportMode = getDefaultTransportMode;
exports.getUnitClassification = getUnitClassification;
/**
 * CAMPAIGN TRANSPORT SYSTEM - 3-Hour Segment Scale
 *
 * Time: 1 segment = 3 hours, 8 segments = 1 day
 * Distance: 1 hex = 10 km
 *
 * Movement rates are per 3-hour segment.
 * Consumption rates are per hex moved per vehicle/unit.
 *
 * Units of measurement:
 * - Fuel: 1 unit = 1 liter
 * - Supplies: 1 unit = 1 meal + water canteen + wear/tear consumables for 1 man
 * - Ammo: Separate resource, transported as cargo (not consumed during movement)
 */
/**
 * Unit Classifications for Movement & Consumption
 */
/** Infantry units (counted as individual men for consumption). */
var INFANTRY_UNITS = [
    "Infantry_42",
    "Infantry",
    "Infantry_Elite",
    "AT_Infantry",
    "Paratrooper",
    "Engineer",
    "Combat_Engineer"
];
exports.INFANTRY_UNITS = INFANTRY_UNITS;
/** Motorized/Armor units (consume fuel & supplies per vehicle). */
var ARMOR_MOTORIZED_UNITS = [
    "Panzer_IV",
    "Panzer_V",
    "Light_Tank",
    "Heavy_Tank",
    "Tank_Destroyer",
    "Anti_Tank_Tank",
    "Assault_Gun",
    "SP_Artillery",
    "SPAA",
    "APC_Halftrack",
    "Recon_ArmoredCar",
    "Rocket_Artillery"
];
exports.ARMOR_MOTORIZED_UNITS = ARMOR_MOTORIZED_UNITS;
/** Towed artillery (moves with armor speed when motorized, foot speed when manhandled). */
var TOWED_ARTILLERY_UNITS = [
    "AT_Gun_50mm",
    "Flak_88",
    "Howitzer_105",
    "Artillery_155mm",
    "Artillery_105mm",
    "Howitzer"
];
exports.TOWED_ARTILLERY_UNITS = TOWED_ARTILLERY_UNITS;
/** Naval transport ships. */
var NAVAL_TRANSPORT_UNITS = [
    "Transport_Ship"
];
exports.NAVAL_TRANSPORT_UNITS = NAVAL_TRANSPORT_UNITS;
/** Naval warships. */
var NAVAL_WARSHIP_UNITS = [
    "Battleship",
    "Destroyer",
    "Cruiser"
];
exports.NAVAL_WARSHIP_UNITS = NAVAL_WARSHIP_UNITS;
/** Bomber aircraft. */
var BOMBER_UNITS = [
    "Bomber",
    "Bomber_Elite",
    "Ground_Attack"
];
exports.BOMBER_UNITS = BOMBER_UNITS;
/** Fighter aircraft. */
var FIGHTER_UNITS = [
    "Fighter",
    "Interceptor",
    "Scout_Plane"
];
exports.FIGHTER_UNITS = FIGHTER_UNITS;
/** Light vehicles (trucks, recon bikes, etc.). */
var LIGHT_VEHICLE_UNITS = [
    "Supply_Truck",
    "APC_Truck",
    "Recon_Bike"
];
exports.LIGHT_VEHICLE_UNITS = LIGHT_VEHICLE_UNITS;
/**
 * TRANSPORT MODE: ON FOOT
 *
 * Movement: up to 1 hex per 3-hour segment (10 km per 3 hours)
 * Consumption PER HEX MOVED: 0 fuel, 1 supply per man
 * Applicable: Infantry units
 */
exports.TRANSPORT_MODE_FOOT = {
    key: "foot",
    label: "On Foot (March)",
    speedHexPerDay: 1, // Per 3-hour segment, not per day (naming kept for compatibility)
    suppliesCostPerUnitPerHex: 1, // 1 supply per man per hex
    fuelCostPerUnitPerHex: 0,
    manpowerRiskPerUnitPerHex: 0,
    applicableUnitTypes: INFANTRY_UNITS,
    description: "Infantry march at 1 hex/segment. Consumption: 0 fuel, 1 supply per man per hex."
};
/**
 * TRANSPORT MODE: TRUCK
 *
 * Movement: up to 3 hex per 3-hour segment (30 km per 3 hours)
 * Consumption PER HEX MOVED:
 *   - Truck: 3 fuel, 1 supply per truck
 *   - Cargo: 1 supply per man (infantry being transported)
 * Capacity: 1 truck carries 100 infantry or 1 artillery piece
 */
exports.TRANSPORT_MODE_TRUCK = {
    key: "truck",
    label: "Truck Transport",
    speedHexPerDay: 3, // 3 hex per 3-hour segment
    suppliesCostPerUnitPerHex: 1, // 1 supply per truck PLUS 1 per man being carried
    fuelCostPerUnitPerHex: 3, // 3 fuel per truck per hex
    manpowerRiskPerUnitPerHex: 0,
    capacityType: "trucks",
    capacityPerVehicle: 100,
    applicableUnitTypes: __spreadArray(__spreadArray([], INFANTRY_UNITS, true), TOWED_ARTILLERY_UNITS, true),
    description: "Trucks move 3 hex/segment. Consumption: 3 fuel + 1 supply per truck + 1 supply per man carried."
};
/**
 * TRANSPORT MODE: ARMOR/MOTORIZED
 *
 * Movement: up to 2 hex per 3-hour segment (20 km per 3 hours)
 * Consumption PER HEX MOVED: 25 fuel, 5 supply per vehicle
 * Applicable: Tanks, armored vehicles, self-propelled artillery
 */
exports.TRANSPORT_MODE_ARMOR = {
    key: "armor",
    label: "Armor/Motorized",
    speedHexPerDay: 2, // 2 hex per 3-hour segment
    suppliesCostPerUnitPerHex: 5, // 5 supply per vehicle per hex
    fuelCostPerUnitPerHex: 25, // 25 fuel per vehicle per hex
    manpowerRiskPerUnitPerHex: 0.01,
    applicableUnitTypes: __spreadArray(__spreadArray([], ARMOR_MOTORIZED_UNITS, true), LIGHT_VEHICLE_UNITS, true),
    description: "Armor moves 2 hex/segment. Consumption: 25 fuel + 5 supply per vehicle per hex."
};
/**
 * TRANSPORT MODE: NAVAL (Transport Ships)
 *
 * Movement: up to 3 hex per 3-hour segment (30 km per 3 hours)
 * Consumption PER HEX MOVED: 1750 fuel, 70 supply per ship
 * Capacity: 1 ship carries 500 infantry or equivalent cargo
 */
exports.TRANSPORT_MODE_NAVAL = {
    key: "naval",
    label: "Naval Transport",
    speedHexPerDay: 3, // 3 hex per 3-hour segment
    suppliesCostPerUnitPerHex: 70, // 70 supply per ship per hex
    fuelCostPerUnitPerHex: 1750, // 1750 fuel per ship per hex
    manpowerRiskPerUnitPerHex: 0.05,
    capacityType: "transportShips",
    capacityPerVehicle: 500,
    requiresNavalBase: true,
    description: "Transport ships move 3 hex/segment. Consumption: 1750 fuel + 70 supply per ship per hex."
};
/**
 * TRANSPORT MODE: NAVAL (Warships)
 *
 * Movement: up to 3 hex per 3-hour segment (30 km per 3 hours)
 * Consumption PER HEX MOVED: 2250 fuel, 1500 supply per ship
 * Note: Warships have crew, weapons, armor = much higher supply consumption
 */
exports.TRANSPORT_MODE_WARSHIP = {
    key: "warship",
    label: "Warship Movement",
    speedHexPerDay: 3, // 3 hex per 3-hour segment
    suppliesCostPerUnitPerHex: 1500, // 1500 supply per ship per hex
    fuelCostPerUnitPerHex: 2250, // 2250 fuel per ship per hex
    manpowerRiskPerUnitPerHex: 0.02,
    applicableUnitTypes: NAVAL_WARSHIP_UNITS,
    description: "Warships move 3 hex/segment. Consumption: 2250 fuel + 1500 supply per ship per hex."
};
/**
 * TRANSPORT MODE: AIR (Fighters)
 *
 * Movement: 75 hex one-way or 35 hex round-trip per 3-hour segment
 * Consumption PER HEX MOVED: 300 fuel, 1 supply per fighter
 * Round-trip accounts for prep, takeoff, landing, refuel time
 */
exports.TRANSPORT_MODE_FIGHTER = {
    key: "fighter",
    label: "Fighter Aircraft",
    speedHexPerDay: 75, // 75 hex one-way, 35 hex round-trip
    suppliesCostPerUnitPerHex: 1, // 1 supply per fighter per hex
    fuelCostPerUnitPerHex: 300, // 300 fuel per fighter per hex
    manpowerRiskPerUnitPerHex: 0.001,
    applicableUnitTypes: FIGHTER_UNITS,
    requiresAirbase: true,
    description: "Fighters: 75 hex one-way / 35 hex round-trip per segment. Consumption: 300 fuel + 1 supply per hex."
};
/**
 * TRANSPORT MODE: AIR (Bombers)
 *
 * Movement: 75 hex one-way or 35 hex round-trip per 3-hour segment
 * Consumption PER HEX MOVED: 750 fuel, 5 supply per bomber
 * Bombers carry heavier loads = higher consumption
 */
exports.TRANSPORT_MODE_BOMBER = {
    key: "bomber",
    label: "Bomber Aircraft",
    speedHexPerDay: 75, // 75 hex one-way, 35 hex round-trip
    suppliesCostPerUnitPerHex: 5, // 5 supply per bomber per hex
    fuelCostPerUnitPerHex: 750, // 750 fuel per bomber per hex
    manpowerRiskPerUnitPerHex: 0.002,
    applicableUnitTypes: BOMBER_UNITS,
    requiresAirbase: true,
    description: "Bombers: 75 hex one-way / 35 hex round-trip per segment. Consumption: 750 fuel + 5 supply per hex."
};
/**
 * All available transport modes indexed by key for lookup.
 */
exports.TRANSPORT_MODES = {
    foot: exports.TRANSPORT_MODE_FOOT,
    truck: exports.TRANSPORT_MODE_TRUCK,
    armor: exports.TRANSPORT_MODE_ARMOR,
    naval: exports.TRANSPORT_MODE_NAVAL,
    warship: exports.TRANSPORT_MODE_WARSHIP,
    fighter: exports.TRANSPORT_MODE_FIGHTER,
    bomber: exports.TRANSPORT_MODE_BOMBER
};
/**
 * Returns the TransportMode definition for a given key, or undefined if not found.
 */
function getTransportMode(key) {
    return exports.TRANSPORT_MODES[key];
}
/**
 * Returns all transport modes that are applicable for a given unit type.
 */
function getApplicableTransportModes(unitType) {
    var modes = [];
    for (var _i = 0, _a = Object.values(exports.TRANSPORT_MODES); _i < _a.length; _i++) {
        var mode = _a[_i];
        if (!mode.applicableUnitTypes || mode.applicableUnitTypes.length === 0) {
            modes.push(mode);
            continue;
        }
        if (mode.applicableUnitTypes.includes(unitType)) {
            modes.push(mode);
        }
    }
    return modes;
}
/**
 * Returns the default/recommended transport mode for a given unit type based on its classification.
 */
function getDefaultTransportMode(unitType) {
    if (BOMBER_UNITS.includes(unitType))
        return "bomber";
    if (FIGHTER_UNITS.includes(unitType))
        return "fighter";
    if (NAVAL_WARSHIP_UNITS.includes(unitType))
        return "warship";
    if (NAVAL_TRANSPORT_UNITS.includes(unitType))
        return "naval";
    if (ARMOR_MOTORIZED_UNITS.includes(unitType))
        return "armor";
    if (LIGHT_VEHICLE_UNITS.includes(unitType))
        return "armor";
    if (INFANTRY_UNITS.includes(unitType))
        return "foot";
    if (TOWED_ARTILLERY_UNITS.includes(unitType))
        return "truck"; // Artillery needs to be towed
    return "foot"; // Fallback
}
/**
 * Classifies a unit type for consumption calculations.
 */
function getUnitClassification(unitType) {
    if (INFANTRY_UNITS.includes(unitType))
        return "infantry";
    if (BOMBER_UNITS.includes(unitType))
        return "bomber";
    if (FIGHTER_UNITS.includes(unitType))
        return "fighter";
    if (NAVAL_WARSHIP_UNITS.includes(unitType))
        return "navalWarship";
    if (NAVAL_TRANSPORT_UNITS.includes(unitType))
        return "navalTransport";
    if (ARMOR_MOTORIZED_UNITS.includes(unitType))
        return "armor";
    if (LIGHT_VEHICLE_UNITS.includes(unitType))
        return "armor";
    if (TOWED_ARTILLERY_UNITS.includes(unitType))
        return "armor"; // Treated as armor for movement when motorized
    return "unknown";
}
