export const FACING_DIRECTIONS = ["NW", "NE", "E", "SE", "SW", "W"];
export function normalizeFacingDirection(facing, fallback = "NW") {
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
export const UNIT_CLASS_VALUES = ["infantry", "specialist", "vehicle", "tank", "artillery", "air", "recon"];
export const COMBAT_WEIGHT_VALUES = ["light", "medium", "heavy"];
export const COMBAT_ROLE_VALUES = ["normal", "antiTank", "antiVehicle", "antiInfantry", "support"];
export const COMBAT_SIGNATURE_VALUES = ["tiny", "small", "medium", "large"];
