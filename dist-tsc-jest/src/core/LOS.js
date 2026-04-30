import { hexLine, hexDistance } from "./Hex";
/**
 * Determine whether the line of sight between attacker and target is clear.
 *
 * Rules:
 * - Fighters/bombers within 4 hexes: ignore forest/hills
 * - Scout planes within 8 hexes: ignore forest/hills
 * - Beyond those ranges, air units have same LOS as ground
 * - Units on hills: adjacent hills don't block
 * - Recon ground spotting: first blocking hex is transparent, need 2 consecutive to block
 * - Ground direct fire: any blocking hex stops the shot
 * - Regular ground units: standard LOS blocking
 */
export function losClear(attacker, target, isAir, lister) {
    // Legacy signature for backwards compatibility - assumes non-recon, non-scout
    return losClearAdvanced({
        attackerClass: isAir ? "air" : "infantry",
        attackerHex: attacker,
        targetHex: target,
        isAttackerAir: isAir,
        lister
    });
}
/**
 * Advanced LOS check with full unit type awareness.
 */
export function losClearAdvanced(ctx) {
    const { attackerClass, attackerHex, targetHex, isAttackerAir, lister, purpose = "direct-fire" } = ctx;
    const distance = hexDistance(attackerHex, targetHex);
    const path = hexLine(attackerHex, targetHex);
    // Adjacent hexes always have LOS — but smoke can still block even on short paths.
    // Smoke blocks the edge between consecutive hexes, so we check it here before the
    // early-return so adjacent-hex smoke is respected.
    if (path.length <= 2) {
        // For air units smoke has no effect (they observe from altitude).
        if (!isAttackerAir && lister.smokeEdgeBlocksLOS && path.length === 2) {
            const from = path[0];
            const to = path[1];
            if (from && to && lister.smokeEdgeBlocksLOS(from, to)) {
                return false;
            }
        }
        return true;
    }
    // Check if attacker is on a hill (affects adjacent hill blocking)
    const attackerTerrain = lister.terrainAt(attackerHex);
    const isOnHill = attackerTerrain?.defense === 3 && attackerTerrain?.accMod === -16; // Hill signature
    // Air units with special LOS rules
    if (isAttackerAir) {
        // Scout planes: 8 hex enhanced LOS (ignore forest/hills within range)
        if (attackerClass === "recon" && distance <= 8) {
            return checkAirLOS(path, lister, true);
        }
        // Fighters/bombers: 4 hex enhanced LOS
        if ((attackerClass === "air") && distance <= 4) {
            return checkAirLOS(path, lister, false);
        }
        // Beyond enhanced range, air units have ground-equivalent LOS
        return checkGroundLOS(path, lister, false, false);
    }
    // Recon units get a slightly more permissive LOS model for spotting only.
    const canPeekPastFirstBlocker = purpose === "spotting" && attackerClass === "recon";
    return checkGroundLOS(path, lister, canPeekPastFirstBlocker, isOnHill);
}
/**
 * Check air LOS - mountains/hills block at distance, forest/city transparent
 */
function checkAirLOS(path, lister, isScout) {
    const middle = path.slice(1, -1);
    for (const hex of middle) {
        const terrain = lister.terrainAt(hex);
        if (!terrain?.blocksLOS)
            continue;
        // Mountains and hills block air LOS (physical elevation)
        // Forest and city transparent from above
        const isMountainOrHill = terrain.defense >= 3 && terrain.accMod <= -16;
        if (isMountainOrHill) {
            return false;
        }
    }
    return true;
}
/**
 * Check ground LOS with recon and elevation rules.
 * Also checks smoke screens on edges between consecutive hexes in the path.
 */
function checkGroundLOS(path, lister, canPeekPastFirstBlocker, isOnHill) {
    const middle = path.slice(1, -1);
    let blockingCount = 0;
    for (let i = 0; i < middle.length; i++) {
        const hex = middle[i];
        // Check whether a smoke screen on the edge between the previous and current hex in the path
        // blocks this LOS. Smoke is checked before terrain because it is an edge effect, not a
        // hex-interior effect — it blocks regardless of the hex's terrain type.
        // i === 0 means the edge between attackerHex and middle[0]; otherwise middle[i-1] to middle[i].
        if (lister.smokeEdgeBlocksLOS) {
            const prevHex = i === 0 ? path[0] : middle[i - 1];
            if (prevHex && hex && lister.smokeEdgeBlocksLOS(prevHex, hex)) {
                return false;
            }
            // Also check the edge between the last middle hex and the target hex.
            if (i === middle.length - 1) {
                const nextHex = path[path.length - 1];
                if (hex && nextHex && lister.smokeEdgeBlocksLOS(hex, nextHex)) {
                    return false;
                }
            }
        }
        const terrain = lister.terrainAt(hex);
        if (!terrain?.blocksLOS) {
            blockingCount = 0; // Reset consecutive count
            continue;
        }
        // Unit on hill: first hex (adjacent) hills don't block
        if (isOnHill && i === 0) {
            const isHill = terrain.defense === 3 && terrain.accMod === -16;
            if (isHill) {
                continue; // Skip adjacent hills when on a hill
            }
        }
        blockingCount++;
        // Spotting recon can tolerate the first blocker, but direct-fire paths cannot.
        if (canPeekPastFirstBlocker) {
            if (blockingCount >= 2) {
                return false;
            }
        }
        else {
            // Regular units blocked by any blocking hex
            return false;
        }
    }
    return true;
}
