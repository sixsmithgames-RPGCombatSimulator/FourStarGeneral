"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMBAT_SIGNATURE_VALUES = exports.COMBAT_ROLE_VALUES = exports.COMBAT_WEIGHT_VALUES = exports.UNIT_CLASS_VALUES = exports.FACING_DIRECTIONS = void 0;
exports.normalizeFacingDirection = normalizeFacingDirection;
exports.FACING_DIRECTIONS = ["NW", "NE", "E", "SE", "SW", "W"];
function normalizeFacingDirection(facing, fallback) {
    if (fallback === void 0) { fallback = "NW"; }
    switch (facing) {
        case "NW":
        case "NE":
        case "E":
        case "SE":
        case "SW":
        case "W":
            return facing;
        case "N":
            return "NW";
        case "S":
            return "SE";
        default:
            return fallback;
    }
}
/**
 * Broad unit class used by non-combat systems such as supply priority, rendering, and scenario validation.
 * This remains intentionally coarse so the rest of the game can keep using stable top-level categories.
 */
exports.UNIT_CLASS_VALUES = ["infantry", "specialist", "vehicle", "tank", "artillery", "air", "recon"];
exports.COMBAT_WEIGHT_VALUES = ["light", "medium", "heavy"];
exports.COMBAT_ROLE_VALUES = ["normal", "antiTank", "antiVehicle", "antiInfantry", "support"];
exports.COMBAT_SIGNATURE_VALUES = ["tiny", "small", "medium", "large"];
