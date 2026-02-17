/**
 * Line-of-sight helpers shared by combat preview, AI, and UI overlays. Implements WWII tactical
 * LOS rules including elevation, aircraft range limits, and reconnaissance capabilities.
 */
import type { Axial } from "./Hex";
import { hexLine, hexDistance } from "./Hex";
import type { TerrainDefinition, UnitClass } from "./types";

/**
 * Minimal terrain accessor so callers can choose how to source tile data without leaking engine
 * internals into this helper.
 */
export interface Lister {
  terrainAt(hex: Axial): TerrainDefinition | null;
}

/**
 * LOS context providing unit-specific capabilities and terrain info.
 */
export interface LOSContext {
  attackerClass: UnitClass;
  attackerHex: Axial;
  targetHex: Axial;
  isAttackerAir: boolean;
  lister: Lister;
}

/**
 * Determine whether the line of sight between attacker and target is clear.
 *
 * Rules:
 * - Fighters/bombers within 4 hexes: ignore forest/hills
 * - Scout planes within 8 hexes: ignore forest/hills
 * - Beyond those ranges, air units have same LOS as ground
 * - Units on hills: adjacent hills don't block
 * - Recon ground units: first blocking hex is transparent, need 2 consecutive to block
 * - Regular ground units: standard LOS blocking
 */
export function losClear(attacker: Axial, target: Axial, isAir: boolean, lister: Lister): boolean {
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
export function losClearAdvanced(ctx: LOSContext): boolean {
  const { attackerClass, attackerHex, targetHex, isAttackerAir, lister } = ctx;

  const distance = hexDistance(attackerHex, targetHex);
  const path = hexLine(attackerHex, targetHex);

  // Adjacent hexes always have LOS
  if (path.length <= 2) {
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

  // Ground recon units: can see through first blocking hex
  const isRecon = attackerClass === "recon";

  return checkGroundLOS(path, lister, isRecon, isOnHill);
}

/**
 * Check air LOS - mountains/hills block at distance, forest/city transparent
 */
function checkAirLOS(path: Axial[], lister: Lister, isScout: boolean): boolean {
  const middle = path.slice(1, -1);

  for (const hex of middle) {
    const terrain = lister.terrainAt(hex);
    if (!terrain?.blocksLOS) continue;

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
 * Check ground LOS with recon and elevation rules
 */
function checkGroundLOS(
  path: Axial[],
  lister: Lister,
  isRecon: boolean,
  isOnHill: boolean
): boolean {
  const middle = path.slice(1, -1);
  let blockingCount = 0;

  for (let i = 0; i < middle.length; i++) {
    const hex = middle[i];
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

    // Recon needs 2 consecutive blocking hexes to be blocked
    if (isRecon) {
      if (blockingCount >= 2) {
        return false;
      }
    } else {
      // Regular units blocked by any blocking hex
      return false;
    }
  }

  return true;
}
