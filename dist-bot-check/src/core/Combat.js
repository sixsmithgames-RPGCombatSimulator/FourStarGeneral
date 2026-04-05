"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.terrainAccMod = terrainAccMod;
exports.resolveFortificationCoverBonusPct = resolveFortificationCoverBonusPct;
exports.pickFacingArmor = pickFacingArmor;
exports.calculateAccuracy = calculateAccuracy;
exports.calculateEffectiveAP = calculateEffectiveAP;
exports.calculateShots = calculateShots;
exports.calculateDamagePerHit = calculateDamagePerHit;
exports.resolveAttack = resolveAttack;
/**
 * Core combat helpers implement the shared damage and accuracy math described in the rules brief.
 * Keeping these routines here ensures every caller (preview UI, AI sims, persistence) references
 * identical logic that is parameterized by the values in `balance.ts`.
 */
var balance_1 = require("./balance");
var Hex_1 = require("./Hex");
var combatProfiles_1 = require("../data/combatProfiles");
/** Simple helper because the combat math calls for repeated clamping. */
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
/**
 * Resolves the combat profile a unit should use for range, volume-of-fire, and damage tables.
 * Uses the new hierarchical combat classification system for more precise tuning.
 */
function resolveCombatProfile(unit) {
    return (0, combatProfiles_1.getCombatProfile)(unit.combat);
}
function resolveAccuracyScalar(unit, profile) {
    var reference = profile.accuracyReference;
    if (!Number.isFinite(reference) || reference <= 0) {
        return 1;
    }
    return Math.max(0.25, unit.accuracyBase / reference);
}
function resolveAttackScalar(unit, profile, isSoftTarget) {
    var attackValue = isSoftTarget ? unit.softAttack : unit.hardAttack;
    if (!Number.isFinite(attackValue) || attackValue <= 0) {
        return 0;
    }
    var reference = isSoftTarget
        ? profile.softAttackReference
        : profile.hardAttackReference;
    if (!Number.isFinite(reference) || reference <= 0) {
        return 1;
    }
    return Math.max(0, attackValue / reference);
}
/** Maps facing strings to direction indices in the axial direction table. */
var FACING_TO_INDEX = {
    E: 0,
    NE: 1,
    NW: 2,
    W: 3,
    SW: 4,
    SE: 5
};
var HEX_EDGE_TO_ANGLE_DEG = {
    E: 0,
    SE: 60,
    SW: 120,
    W: 180,
    NW: -120,
    NE: -60
};
function normalizeAngleDelta(angleA, angleB) {
    var raw = Math.abs(angleA - angleB) % 360;
    return raw > 180 ? 360 - raw : raw;
}
function axialToPixelVector(diff) {
    return {
        x: Math.sqrt(3) * (diff.q + diff.r / 2),
        y: 1.5 * diff.r
    };
}
/**
 * Convert a vector into a direction index by taking the closest axial direction. This supports the
 * armor facing heuristic without relying on floating-point angles.
 */
function directionIndex(from, to) {
    var diff = (0, Hex_1.subtract)(to, from);
    var bestIndex = 0;
    var bestScore = -Infinity;
    Hex_1.axialDirections.forEach(function (dir, index) {
        var score = diff.q * dir.q + diff.r * dir.r;
        if (score > bestScore) {
            bestScore = score;
            bestIndex = index;
        }
    });
    return bestIndex;
}
/**
 * Interpolates accuracy from range-based table for a given unit class.
 * Uses linear interpolation between defined range points.
 */
function getBaseAccuracyByRange(profile, distance) {
    var table = profile.rangeAccuracy;
    // If no range table or empty, return a safe default
    if (!table || table.length === 0) {
        return 50; // Default 50% base accuracy
    }
    // Find the range bracket
    for (var i = 0; i < table.length; i++) {
        var current = table[i];
        if (distance <= current.range) {
            // If this is the first entry or exact match, return it
            if (i === 0)
                return current.accuracy;
            // Interpolate between previous and current
            var prev = table[i - 1];
            var ratio = (distance - prev.range) / (current.range - prev.range);
            return prev.accuracy + ratio * (current.accuracy - prev.accuracy);
        }
    }
    // Beyond max range, use last value
    return table[table.length - 1].accuracy;
}
/**
 * Table look-up for terrain accuracy modifiers. Centralizing it allows future logic (e.g. weather)
 * to hook in without rewriting callers. Rushing infantry lose terrain cover (no bonus).
 * Fortifications built by engineers improve cover for infantry-type units.
 */
function terrainAccMod(terrain, isRushing, fortificationCoverPct, defenderClass) {
    var _a;
    if (fortificationCoverPct === void 0) { fortificationCoverPct = 0; }
    // Rushing units lose terrain cover
    if (isRushing)
        return 0;
    var baseMod = (_a = terrain === null || terrain === void 0 ? void 0 : terrain.accMod) !== null && _a !== void 0 ? _a : 0;
    if (fortificationCoverPct !== 0 &&
        defenderClass &&
        ["infantry", "recon", "specialist"].includes(defenderClass)) {
        baseMod += fortificationCoverPct;
    }
    return baseMod;
}
function resolveFortificationCoverBonusPct(attackerHex, defenderHex, fortificationFacing, attackerClass) {
    if (balance_1.combat.penetration.topAttackClasses.has(attackerClass)) {
        return 0;
    }
    var fortifiedFacings = Array.isArray(fortificationFacing)
        ? fortificationFacing.filter(function (edge) { return edge !== null && edge !== undefined; })
        : fortificationFacing
            ? [fortificationFacing]
            : [];
    if (fortifiedFacings.length === 0) {
        return balance_1.combat.cover.fortificationBonusPct;
    }
    var attackVector = axialToPixelVector((0, Hex_1.subtract)(attackerHex, defenderHex));
    if (attackVector.x === 0 && attackVector.y === 0) {
        return 0;
    }
    var attackAngle = Math.atan2(attackVector.y, attackVector.x) * (180 / Math.PI);
    var edgeDiffs = Object.entries(HEX_EDGE_TO_ANGLE_DEG)
        .map(function (_a) {
        var edge = _a[0], angle = _a[1];
        return ({ edge: edge, diff: normalizeAngleDelta(attackAngle, angle) });
    })
        .sort(function (left, right) { return left.diff - right.diff; });
    var primary = edgeDiffs[0];
    var secondary = edgeDiffs[1];
    if (!primary) {
        return 0;
    }
    if (secondary && Math.abs(primary.diff - secondary.diff) <= 0.5) {
        return fortifiedFacings.includes(primary.edge) || fortifiedFacings.includes(secondary.edge)
            ? balance_1.combat.cover.fortificationBonusPct * 0.5
            : 0;
    }
    return fortifiedFacings.includes(primary.edge) ? balance_1.combat.cover.fortificationBonusPct : 0;
}
/**
 * Determine which armor value should apply based on relative hex positions and the defender's
 * stated facing. Artillery and air attackers follow the "top" heuristic defined in the balance
 * document.
 */
function pickFacingArmor(attackerHex, defenderHex, defenderFacing, defenderUnit, attackerClass) {
    if (balance_1.combat.penetration.topAttackClasses.has(attackerClass)) {
        return defenderUnit.armor.top;
    }
    var defenderFacingIndex = FACING_TO_INDEX[defenderFacing];
    var inboundIndex = directionIndex(defenderHex, attackerHex);
    var delta = (inboundIndex - defenderFacingIndex + Hex_1.axialDirections.length) % Hex_1.axialDirections.length;
    if (delta === 0) {
        return defenderUnit.armor.front;
    }
    return defenderUnit.armor.side;
}
/**
 * Calculate raw accuracy for the engagement using realistic WWII hit probability tables.
 *
 * New system (realistic):
 * 1. Look up base accuracy from range/class table (interpolated)
 * 2. Add experience bonus (+3% per star)
 * 3. Apply target signature modifier (tiny/small/medium/large affects exposed area)
 * 4. Add terrain modifier (defender in cover is harder to hit)
 * 5. Apply commander bonus as percentage multiplier
 * 6. Clamp to min/max bounds after range, terrain, and spotting adjustments
 */
function calculateAccuracy(request) {
    var _a, _b, _c;
    var attacker = request.attacker;
    var defender = request.defender;
    var defenderCtx = request.defenderCtx;
    var attackerCtx = request.attackerCtx;
    var combatProfile = resolveCombatProfile(attacker.unit);
    var distance = (0, Hex_1.hexDistance)(attackerCtx.hex, defenderCtx.hex);
    // If attacker is using assault stance, engagement happens at close range (0-50m, use 25m midpoint)
    var isAssault = attackerCtx.stance === "assault";
    var ASSAULT_CLOSE_RANGE_METERS = 25;
    if (isAssault) {
        distance = ASSAULT_CLOSE_RANGE_METERS / balance_1.HEX_SCALE_METERS;
    }
    // Step 1: Get realistic base accuracy from range table
    var rangeAccuracy = getBaseAccuracyByRange(combatProfile, distance);
    var baseAccuracy = rangeAccuracy * resolveAccuracyScalar(attacker.unit, combatProfile);
    // Step 2: Apply commander and experience bonuses multiplicatively
    var commanderAccuracyBonus = (_a = attacker.general.accBonus) !== null && _a !== void 0 ? _a : 0;
    var commanderScalar = 1 + (commanderAccuracyBonus * balance_1.combat.accuracy.commanderScalar);
    var experienceScalar = 1 + (attacker.experience * balance_1.combat.accuracy.expPerStar / 100);
    // Chain multipliers: Base × Commander × Experience
    var afterCommander = baseAccuracy * commanderScalar;
    var afterExperience = afterCommander * experienceScalar;
    // Step 3: Apply target signature modifier
    // Smaller signatures are harder to hit, larger signatures are easier to hit
    var defenderSignature = defender.unit.combat.signature;
    var signatureMultipliers = {
        tiny: 0.7, // -30% hit chance (very hard to hit)
        small: 0.85, // -15% hit chance
        medium: 1.0, // baseline
        large: 1.15 // +15% hit chance
    };
    var signatureMultiplier = (_b = signatureMultipliers[defenderSignature]) !== null && _b !== void 0 ? _b : 1.0;
    var afterSignature = afterExperience * signatureMultiplier;
    // Step 4: Apply terrain modifier multiplicatively.
    var fortificationCoverPct = defenderCtx.fortified
        ? resolveFortificationCoverBonusPct(attackerCtx.hex, defenderCtx.hex, (_c = defenderCtx.fortificationFacings) !== null && _c !== void 0 ? _c : defenderCtx.fortificationFacing, attacker.unit.class)
        : 0;
    var terrainMod = terrainAccMod(defenderCtx.terrain, defenderCtx.isRushing, fortificationCoverPct, defenderCtx.class);
    var terrainMultiplier = 1 + terrainMod / 100;
    var afterTerrain = afterSignature * terrainMultiplier;
    // Step 5: Apply spotted target penalty as multiplier
    var spottedMultiplier = defenderCtx.isSpottedOnly ? 0.5 : 1.0;
    var afterSpotted = afterTerrain * spottedMultiplier;
    // Assault already benefits from the forced 25m engagement range above; applying
    // a second multiplier here overstates close-assault lethality and breaks parity
    // between preview and expected battlefield outcomes.
    var finalPreClamp = afterSpotted;
    // Step 6: Clamp to bounds
    var finalAccuracy = clamp(finalPreClamp, balance_1.combat.accuracy.min, balance_1.combat.accuracy.max);
    return {
        baseRange: baseAccuracy,
        commanderScalar: commanderScalar,
        afterCommander: afterCommander,
        experienceScalar: experienceScalar,
        afterExperience: afterExperience,
        terrainModifier: terrainMod,
        terrainMultiplier: terrainMultiplier,
        afterTerrain: afterTerrain,
        spottedMultiplier: spottedMultiplier,
        finalPreClamp: finalPreClamp,
        final: finalAccuracy
    };
}
/** Effective armor penetration stays at the authored weapon value. Experience does not increase AP. */
function calculateEffectiveAP(attacker) {
    return attacker.unit.ap;
}
/**
 * Calculate shots fired based on unit's combat profile and current strength percentage.
 * Uses realistic shot counts from hierarchical combat profiles.
 */
function calculateShots(attacker, strengthPercent) {
    var combatProfile = resolveCombatProfile(attacker);
    var fullStrengthShots = combatProfile.shotsPerTurn;
    return Math.round(fullStrengthShots * (strengthPercent / 100));
}
/**
 * Calculate damage per hit as percentage of target strength (0-100%).
 * Uses combat profile base damage with AP margin modifiers for armored targets.
 * New system:
 * - Base damage from combat profile
 * - Soft targets: use soft attack scalar directly
 * - Armored targets: apply AP margin modifier
 *   - margin >= 0: +5% per point of overpenetration
 *   - margin < 0: -15% per point of underpenetration
 */
function calculateDamagePerHit(request, effectiveAP, facingArmor) {
    var _a;
    var attacker = request.attacker, isSoftTarget = request.isSoftTarget;
    var combatProfile = resolveCombatProfile(attacker.unit);
    var experienceScalar = 1 + attacker.experience * balance_1.combat.damage.experienceScalarPerStar;
    var commanderDamageBonus = (_a = attacker.general.dmgBonus) !== null && _a !== void 0 ? _a : 0;
    var damageScalar = 1 + (commanderDamageBonus / 100);
    var softAttackScalar = resolveAttackScalar(attacker.unit, combatProfile, true);
    var hardAttackScalar = resolveAttackScalar(attacker.unit, combatProfile, false);
    // Get base damage from profile
    var baseDamage = combatProfile.baseDamagePerHit;
    var afterExperience = baseDamage * experienceScalar;
    // Apply attack type scalar (soft or hard)
    var attackScalar = isSoftTarget ? softAttackScalar : hardAttackScalar;
    var afterAttackType = afterExperience * attackScalar;
    // Apply armor penetration margin modifier to all targets
    var penetrationMarginScalar = 1;
    if (facingArmor > 0) {
        var margin = effectiveAP - facingArmor;
        if (margin >= 0) {
            // Overpenetration: +5% damage per point
            penetrationMarginScalar = 1 + (margin * 0.05);
        }
        else {
            // Underpenetration: -15% damage per point
            penetrationMarginScalar = Math.max(0.1, 1 + (margin * 0.15)); // Floor at 10% to avoid complete negation
        }
    }
    var afterPenetration = afterAttackType * penetrationMarginScalar;
    var finalDamage = Math.max(0, afterPenetration * damageScalar);
    return {
        baseTableValue: baseDamage,
        experienceScalar: experienceScalar,
        afterExperience: afterExperience,
        commanderScalar: damageScalar,
        final: finalDamage
    };
}
/** Aggregate helper delivering the full combat math breakdown. */
function resolveAttack(request) {
    var accuracyBreakdown = calculateAccuracy(request);
    var effectiveAP = calculateEffectiveAP(request.attacker);
    var facingArmor = pickFacingArmor(request.attackerCtx.hex, request.defenderCtx.hex, request.targetFacing, request.defender.unit, request.attacker.unit.class);
    var shots = calculateShots(request.attacker.unit, request.attacker.strength);
    var damageBreakdown = calculateDamagePerHit(request, effectiveAP, facingArmor);
    var expectedHits = (accuracyBreakdown.final / 100) * shots;
    var expectedDamage = expectedHits * damageBreakdown.final;
    // Use suppression from combat profile instead of global balance value
    var combatProfile = resolveCombatProfile(request.attacker.unit);
    var expectedSuppression = expectedHits * combatProfile.suppressionPerHit;
    return {
        accuracy: accuracyBreakdown.final,
        shots: shots,
        damagePerHit: damageBreakdown.final,
        expectedHits: expectedHits,
        expectedDamage: expectedDamage,
        expectedSuppression: expectedSuppression,
        effectiveAP: effectiveAP,
        facingArmor: facingArmor,
        accuracyBreakdown: accuracyBreakdown,
        damageBreakdown: damageBreakdown
    };
}
