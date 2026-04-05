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
exports.getDifficultyModifiers = getDifficultyModifiers;
exports.computeReachableHexes = computeReachableHexes;
exports.classifyUnitPurpose = classifyUnitPurpose;
exports.scoreCandidate = scoreCandidate;
exports.scoreCandidateAdvanced = scoreCandidateAdvanced;
exports.planHeuristicBotTurn = planHeuristicBotTurn;
/**
 * Small nudge applied when multiple moves score similarly; pushes choices toward the intended target.
 * This value is deliberately modest so it never outweighs real tactical scores (damage, retaliation, VP).
 */
var STEERING_TIE_BIAS = 0.6;
/**
 * Within this many hexes, units treat nearby enemies as an immediate concern and will prioritize
 * closing or attacking even when strategic objectives exist. This models the "game on" behavior
 * once forces make contact.
 */
var PROXIMITY_ENGAGE_RADIUS = 6;
/**
 * Bonus applied to enemy-pressure moves when contact is established (nearby or visible). Ensures that
 * pressure beats a distant objective approach so the AI pivots into combat once engaged.
 */
var CONTACT_ENGAGE_BONUS = 8;
// ==========================================
// ADVANCED TACTICAL AI CONSTANTS
// ==========================================
/**
 * Bonus applied when attacking a damaged unit (strength < 50%).
 * Encourages the bot to focus fire on weakened targets for efficient kills.
 */
var FOCUS_FIRE_BONUS = 12;
/**
 * Threshold below which a unit is considered "low health" for focus fire.
 */
var LOW_HEALTH_THRESHOLD = 50;
/**
 * Critical health threshold for maximum priority targeting.
 */
var CRITICAL_HEALTH_THRESHOLD = 25;
/**
 * Bonus for attacking from a flanking position (side/rear).
 * Rewards tactical positioning for increased damage.
 */
var FLANKING_BONUS = 8;
/**
 * Bonus for attacking when allied units are adjacent to the target.
 * Encourages combined arms and coordinated attacks.
 */
var COMBINED_ARMS_BONUS = 6;
/**
 * Bonus per allied unit within support range of an attack.
 * Stacks to reward concentrated force.
 */
var SUPPORT_CONCENTRATION_BONUS = 2;
/**
 * Range within which allies provide support bonuses.
 */
var SUPPORT_RANGE = 3;
/**
 * Bonus for artillery staying at optimal range (max range - 2).
 * Keeps artillery from getting too close to the front line.
 */
var ARTILLERY_RANGE_BONUS = 5;
/**
 * Penalty for artillery being within close range of enemies.
 * Discourages artillery from advancing into danger.
 */
var ARTILLERY_DANGER_PENALTY = -15;
/**
 * Range within which artillery feels endangered.
 */
var ARTILLERY_DANGER_RANGE = 4;
/**
 * Bonus for moving to defensible terrain (forest, urban, hills).
 * Encourages smart positioning when not attacking.
 */
var DEFENSIVE_TERRAIN_BONUS = 4;
/**
 * Penalty for leaving cover to move into open terrain.
 */
var EXPOSED_POSITION_PENALTY = -3;
/**
 * Bonus per nearby ally when staging an assault. Keeps the formation moving as a group instead of feeding units piecemeal.
 */
var ASSAULT_SUPPORT_BONUS = 3;
/**
 * Reward for ending a move on a destination that masks the approach from hostile LOS.
 */
var MASKED_APPROACH_BONUS = 6;
/**
 * Penalty per visible hostile when a unit advances without being ready to fight from that endpoint.
 */
var EXPOSED_APPROACH_PENALTY = 3.5;
/**
 * Penalty for pushing a combat unit ahead of its nearby support umbrella.
 */
var LONE_ADVANCE_PENALTY = 7;
/**
 * Recon units should scout for the formation, not die unsupported far in front of it.
 */
var RECON_OVERRUN_PENALTY = 10;
/**
 * Small reward for approach hexes that naturally block LOS and help hide the advance.
 */
var BLOCKING_TERRAIN_APPROACH_BONUS = 3;
/**
 * Reward for shaving whole turns off the march to a firing position.
 */
var TIME_TO_TARGET_BONUS = 8;
/**
 * Penalty for burning movement without improving when the unit can realistically fight.
 */
var STALLED_APPROACH_PENALTY = 6;
/**
 * Infantry and towed support should lean into masked covered movement while closing.
 */
var INFANTRY_COVER_MARCH_BONUS = 4;
/**
 * Infantry caught crossing open ground ahead of the line are very vulnerable.
 */
var INFANTRY_EXPOSED_MARCH_PENALTY = 5;
/**
 * Armor should arrive as a spearhead, not as single vehicles trickling forward.
 */
var ARMORED_UNIFIED_FRONT_BONUS = 5;
/**
 * Armor that outruns the rest of the front loses most of its battlefield leverage.
 */
var ARMORED_OUTRUN_SUPPORT_PENALTY = 7;
/**
 * Bonus for recon units spotting enemies for allies.
 */
var RECON_SPOTTING_BONUS = 10;
/**
 * Range within which recon provides spotting bonuses to allies.
 */
var RECON_SPOTTING_RANGE = 6;
/**
 * Bonus applied for occupying an objective hex.
 * This should be significant enough to make bots prioritize objectives over pure combat.
 */
var OBJECTIVE_CONTROL_BONUS = 45;
/**
 * Bonus per turn already held (encourages holding objectives).
 */
var OBJECTIVE_HOLD_BONUS = 5;
/**
 * Bonus for moving toward an objective (distance reduction).
 */
var OBJECTIVE_APPROACH_BONUS = 8;
/**
 * Base value for non-attack moves that deliberately set up a stronger shot on a later turn.
 * This lets the planner prefer "good staging" over aimless pressure once contact is established.
 */
var FIRE_SETUP_BASE_BONUS = 10;
/**
 * Reward for destinations that can step into a valid firing lane on the next turn.
 */
var FIRE_SETUP_READY_BONUS = 8;
/**
 * Penalty per hex the destination still sits outside the unit's attack band.
 */
var FIRE_SETUP_RANGE_GAP_PENALTY = 5;
/**
 * Heavier penalty for positions that still cannot realistically attack after a full move next turn.
 */
var FIRE_SETUP_FUTURE_GAP_PENALTY = 9;
/**
 * Reward/penalty pair used by direct-fire units so they value staging hexes with a real firing lane.
 */
var FIRE_SETUP_LOS_BONUS = 4;
var FIRE_SETUP_NO_LOS_PENALTY = 10;
/**
 * Returns the difficulty modifiers for the specified level.
 */
function getDifficultyModifiers(difficulty) {
    switch (difficulty) {
        case "Easy":
            return {
                damageWeight: 2.5, // Less emphasis on damage output
                retaliationWeight: 3.5, // More afraid of taking damage
                attackOpportunityBonus: 5, // Less aggressive about attacking
                contactEngageBonus: 5, // Less likely to engage
                objectiveWeight: 0.8, // Less focused on objectives
                accuracyMod: -10, // 10% accuracy penalty
                damageMod: -15, // 15% damage penalty
                // Easy bots don't use advanced tactics
                focusFireWeight: 0.3, // Rarely focuses damaged targets
                flankingWeight: 0.2, // Doesn't seek flanking positions
                combinedArmsWeight: 0.2, // Poor coordination
                useTacticalAI: false // Basic behavior only
            };
        case "Normal":
            return {
                damageWeight: 3.5, // Standard damage weight
                retaliationWeight: 2.5, // Standard caution
                attackOpportunityBonus: 8, // Standard attack incentive
                contactEngageBonus: 8, // Standard engagement
                objectiveWeight: 1.0, // Standard objective focus
                accuracyMod: 0, // No accuracy modifier
                damageMod: 0, // No damage modifier
                // Normal bots use some tactics
                focusFireWeight: 0.7, // Sometimes focuses damaged targets
                flankingWeight: 0.5, // Occasionally seeks flanking
                combinedArmsWeight: 0.6, // Moderate coordination
                useTacticalAI: true // Uses tactical AI
            };
        case "Hard":
            return {
                damageWeight: 4.5, // Maximizes damage output
                retaliationWeight: 1.5, // More willing to trade
                attackOpportunityBonus: 12, // Very aggressive
                contactEngageBonus: 12, // Presses advantage hard
                objectiveWeight: 1.3, // Highly objective-focused
                accuracyMod: 10, // 10% accuracy bonus
                damageMod: 10, // 10% damage bonus
                // Hard bots use full advanced tactics
                focusFireWeight: 1.2, // Aggressively focuses weakened units
                flankingWeight: 1.0, // Actively seeks flanking positions
                combinedArmsWeight: 1.0, // Excellent coordination
                useTacticalAI: true // Full tactical AI
            };
        default:
            return getDifficultyModifiers("Normal");
    }
}
var Hex_1 = require("../../core/Hex");
/**
 * Tiny steering helper that nudges tie-breaks toward the target vector.
 * Returns a value in [-1, 1] where 1 means the first step aligns with the vector to the target.
 * This is intentionally small and only influences cases where scores are otherwise similar.
 */
function steeringBias(origin, firstStep, target) {
    var step = { q: firstStep.q - origin.q, r: firstStep.r - origin.r };
    var toTarget = { q: target.q - origin.q, r: target.r - origin.r };
    var stepLen = Math.hypot(step.q, step.r) || 1;
    var tgtLen = Math.hypot(toTarget.q, toTarget.r) || 1;
    var dot = (step.q * toTarget.q + step.r * toTarget.r) / (stepLen * tgtLen);
    // Clamp for numerical stability
    return Math.max(-1, Math.min(1, dot));
}
/**
 * Promote moves that shrink distance to an active objective even when it cannot be captured this turn.
 */
function scoreObjectiveApproach(snapshot, origin, reachable, objectives, occupancy, input, modifiers) {
    var _a;
    if (objectives.length === 0) {
        return null;
    }
    var best = null;
    var originDistances = new Map();
    for (var _i = 0, objectives_1 = objectives; _i < objectives_1.length; _i++) {
        var objective = objectives_1[_i];
        originDistances.set((0, Hex_1.axialKey)(objective.hex), (0, Hex_1.hexDistance)(origin, objective.hex));
    }
    for (var _b = 0, _c = reachable.values(); _b < _c.length; _b++) {
        var option = _c[_b];
        if (option.path.length <= 1) {
            continue;
        }
        var bestReductionScore = -Infinity;
        var rationale = "";
        var bestTargetHex = null;
        for (var _d = 0, objectives_2 = objectives; _d < objectives_2.length; _d++) {
            var objective = objectives_2[_d];
            var key = (0, Hex_1.axialKey)(objective.hex);
            var currentDistance = (_a = originDistances.get(key)) !== null && _a !== void 0 ? _a : (0, Hex_1.hexDistance)(origin, objective.hex);
            var newDistance = (0, Hex_1.hexDistance)(option.hex, objective.hex);
            var reduction = currentDistance - newDistance;
            if (reduction <= 0) {
                continue;
            }
            var score = 2 + reduction * OBJECTIVE_APPROACH_BONUS + objective.vp * 0.3;
            // Big bonus if we're landing on the objective itself
            var destKey = (0, Hex_1.axialKey)(option.hex);
            if (destKey === key) {
                score += OBJECTIVE_CONTROL_BONUS * modifiers.objectiveWeight;
                var currentOccupant = occupancy.get(key);
                if (!currentOccupant || currentOccupant === "player") {
                    score += 10 * modifiers.objectiveWeight;
                }
            }
            if (score > bestReductionScore) {
                bestReductionScore = score;
                rationale = destKey === key
                    ? "Occupy objective at ".concat(key)
                    : "Advance toward objective at ".concat(key);
                bestTargetHex = objective.hex;
            }
        }
        if (bestReductionScore === -Infinity) {
            continue;
        }
        var candidate = {
            destination: option.hex,
            path: option.path,
            attackTarget: null,
            expectedDamage: 0,
            expectedRetaliation: 0,
            score: bestReductionScore - (option.path.length - 1)
                + calculateApproachPositionScore(snapshot, option.hex, bestTargetHex, input, modifiers, option.path.length),
            rationale: rationale
        };
        // Steering: favor first steps that align with the direction to the best objective for this option
        if (bestTargetHex && option.path.length > 1) {
            candidate.score += STEERING_TIE_BIAS * steeringBias(origin, option.path[1], bestTargetHex);
        }
        if (!best || candidate.score > best.score) {
            best = candidate;
        }
    }
    return best;
}
/**
 * Returns only the objectives that still require action (either enemy-owned or currently held by the player).
 */
function filterActiveObjectives(objectives, occupancy) {
    return objectives.filter(function (objective) {
        var key = (0, Hex_1.axialKey)(objective.hex);
        var occupant = occupancy.get(key);
        var controlledByBot = objective.owner === "Bot" || occupant === "bot";
        return !controlledByBot;
    });
}
/**
 * When no formal objective exists, drift toward the nearest enemy so formations keep pressure on the frontline.
 */
function scoreEnemyPressure(snapshot, reachable, enemies, input, modifiers) {
    if (enemies.length === 0) {
        return null;
    }
    var purpose = classifyUnitPurpose(snapshot.definition);
    var best = null;
    for (var _i = 0, _a = reachable.values(); _i < _a.length; _i++) {
        var option = _a[_i];
        if (option.path.length <= 1) {
            continue; // Staying in place does not apply pressure.
        }
        for (var _b = 0, enemies_1 = enemies; _b < enemies_1.length; _b++) {
            var enemy = enemies_1[_b];
            if (!canPotentiallyAttackTarget(snapshot, enemy)) {
                continue;
            }
            var originDistance = (0, Hex_1.hexDistance)(snapshot.unit.hex, enemy.unit.hex);
            var distance = (0, Hex_1.hexDistance)(option.hex, enemy.unit.hex);
            var distanceGain = originDistance - distance;
            var originTurns = estimateTurnsToAttackWindow(snapshot.definition, snapshot.unit.hex, enemy.unit.hex, input);
            var destinationTurns = estimateTurnsToAttackWindow(snapshot.definition, option.hex, enemy.unit.hex, input);
            var turnGain = originTurns - destinationTurns;
            if (distanceGain <= 0 && turnGain <= 0) {
                continue; // Only reward moves that tighten the noose or materially improve attack timing.
            }
            var score = 4
                + distanceGain * 2.5
                + turnGain * 12
                + calculateTargetPriorityBonus(purpose, enemy) * 0.5
                + calculatePressureDamagePotential(snapshot, enemy) * 0.22
                - (option.path.length - 1) * 0.45;
            score += calculateApproachPositionScore(snapshot, option.hex, enemy.unit.hex, input, modifiers, option.path.length);
            var candidate = {
                destination: option.hex,
                path: option.path,
                attackTarget: null,
                expectedDamage: 0,
                expectedRetaliation: 0,
                score: score,
                rationale: "Advance to pressure ".concat(describePriorityTarget(enemy))
            };
            // Steering: add a small nudge toward the chosen enemy to break ties consistently toward the target.
            if (option.path.length > 1) {
                candidate.score += STEERING_TIE_BIAS * steeringBias(snapshot.unit.hex, option.path[1], enemy.unit.hex);
            }
            if (!best || candidate.score > best.score) {
                best = candidate;
            }
        }
    }
    return best;
}
/**
 * Enemy-pressure should overrule objective marching, but not a deliberate firing setup or attack plan.
 */
function isObjectiveCandidate(candidate) {
    return Boolean(candidate && candidate.attackTarget === null && candidate.rationale.toLowerCase().includes("objective"));
}
/**
 * Dijkstra-style search restricted by movement allowance to collect passable tiles and the cheapest path to each.
 * The planner keeps this pure so the engine can re-run it without mutating live state.
 */
function computeReachableHexes(origin, allowance, moveType, input, originKey) {
    var results = new Map();
    var bestCosts = new Map([[originKey, 0]]);
    var frontier = [{
            hex: origin,
            cost: 0,
            path: [origin]
        }];
    var impassableCount = 0;
    var highCostCount = 0;
    while (frontier.length > 0) {
        frontier.sort(function (a, b) { return a.cost - b.cost; });
        var current = frontier.shift();
        if (!current) {
            break;
        }
        var currentKey = (0, Hex_1.axialKey)(current.hex);
        var bestKnownCost = bestCosts.get(currentKey);
        if (bestKnownCost !== undefined && current.cost > bestKnownCost) {
            continue;
        }
        var currentOccupant = input.occupancy.get(currentKey);
        if (currentKey === originKey || currentOccupant !== "bot") {
            results.set(currentKey, {
                hex: current.hex,
                cost: current.cost,
                path: current.path
            });
        }
        // Stop exploring once the allocation budget is exhausted.
        if (current.cost >= allowance) {
            continue;
        }
        for (var _i = 0, _a = (0, Hex_1.neighbors)(current.hex); _i < _a.length; _i++) {
            var neighbor = _a[_i];
            if (!input.map.inBounds(neighbor)) {
                continue;
            }
            var neighborKey = (0, Hex_1.axialKey)(neighbor);
            var terrainCost = input.map.movementCost(neighbor, moveType);
            if (!Number.isFinite(terrainCost) || terrainCost >= 999) {
                impassableCount++;
                continue; // Treat very high cost as impassable for land units.
            }
            if (terrainCost > 1) {
                highCostCount++;
            }
            var occupant = input.occupancy.get(neighborKey);
            if (occupant === "player") {
                continue; // Do not step onto enemy-occupied hexes; attacks target adjacent positions instead.
            }
            var newCost = current.cost + terrainCost;
            if (newCost > allowance) {
                continue;
            }
            var knownCost = bestCosts.get(neighborKey);
            if (knownCost !== undefined && knownCost <= newCost) {
                continue;
            }
            bestCosts.set(neighborKey, newCost);
            frontier.push({
                hex: neighbor,
                cost: newCost,
                path: __spreadArray(__spreadArray([], current.path, true), [neighbor], false)
            });
        }
    }
    return results;
}
/**
 * Lightweight heuristic describing a unit's battlefield focus so scoring can reward aligned targets.
 */
function classifyUnitPurpose(definition) {
    if (definition.class === "artillery") {
        return "artillery";
    }
    if (definition.class === "recon") {
        return "recon";
    }
    if (definition.class === "air") {
        return "support"; // Air units lean on planner scores specific to sortie roles.
    }
    var hardVsSoft = definition.hardAttack - definition.softAttack;
    if (hardVsSoft >= definition.softAttack * 0.5) {
        return "antiArmor";
    }
    if (-hardVsSoft >= definition.hardAttack * 0.5) {
        return "antiInfantry";
    }
    return "generalist";
}
/**
 * Treat tanks, armored vehicles, and heavily protected ground formations as armored strike targets.
 * The fallback armor check keeps odd specialist data aligned with the bot's battlefield priorities.
 */
function isArmoredGroundUnit(definition) {
    if (definition.moveType === "air") {
        return false;
    }
    if (definition.class === "tank" || definition.class === "vehicle") {
        return true;
    }
    var heaviestArmor = Math.max(definition.armor.front, definition.armor.side, definition.armor.top);
    return heaviestArmor >= 6 && definition.combat.weight !== "light";
}
/**
 * Immediate attack scoring and multi-turn staging should agree on what a unit is meant to hunt.
 */
function calculatePurposeBonus(purpose, defender) {
    if (!defender) {
        return 0;
    }
    var defenderClass = defender.definition.class;
    if (purpose === "antiArmor") {
        if (isArmoredGroundUnit(defender.definition)) {
            return 15;
        }
        if (defenderClass === "artillery") {
            return 6;
        }
        if (defenderClass === "air" || defenderClass === "infantry") {
            return -5;
        }
    }
    if (purpose === "antiInfantry") {
        if (defenderClass === "infantry" || defenderClass === "specialist") {
            return 12;
        }
        if (defenderClass === "artillery") {
            return 4;
        }
        if (isArmoredGroundUnit(defender.definition)) {
            return -6;
        }
    }
    if (purpose === "artillery") {
        if (defenderClass === "artillery") {
            return 8;
        }
        if (defenderClass === "infantry" || defenderClass === "specialist") {
            return 6;
        }
        if (isArmoredGroundUnit(defender.definition)) {
            return 4;
        }
    }
    if (purpose === "recon" && defenderClass === "artillery") {
        return 4;
    }
    return 0;
}
/**
 * Uses weapon stats and battlefield role to estimate how urgently the formation should neutralize this target.
 */
function calculateThreatProjection(defender) {
    var _a;
    if (!defender) {
        return 0;
    }
    var def = defender.definition;
    var threat = 0;
    threat += def.softAttack * 0.45;
    threat += def.hardAttack * 0.75;
    threat += def.ap * 0.7;
    threat += ((_a = def.rangeMax) !== null && _a !== void 0 ? _a : 1) * 2.5;
    threat += Math.max(def.armor.front, def.armor.side, def.armor.top) * 0.8;
    if (def.class === "artillery") {
        threat += 18;
    }
    if (def.combat.role === "antiTank") {
        threat += 16;
    }
    if (isArmoredGroundUnit(def)) {
        threat += 12;
    }
    if (def.class === "recon") {
        threat += 6;
    }
    if (def.traits.includes("intercept")) {
        threat += 10;
    }
    return threat;
}
/**
 * Uses the unit's real tactical move rate so "next turn" estimates do not inherit the planner's long-horizon search allowance.
 */
function resolveTacticalMoveRate(definition) {
    var _a;
    return Math.max(1, (_a = definition.movement) !== null && _a !== void 0 ? _a : 1);
}
/**
 * Rough offensive leverage estimate for staging and pressure scoring.
 */
function calculatePressureDamagePotential(attacker, defender) {
    var _a;
    if (!defender) {
        return 0;
    }
    var againstArmor = isArmoredGroundUnit(defender.definition);
    var baseDamage = againstArmor
        ? attacker.definition.hardAttack * 0.75 + attacker.definition.ap * 0.55
        : attacker.definition.softAttack * 0.65 + attacker.definition.hardAttack * 0.15;
    var rangeFactor = Math.max(1, ((_a = attacker.definition.rangeMax) !== null && _a !== void 0 ? _a : 1) * 0.35);
    return baseDamage + rangeFactor;
}
/**
 * Estimates how many turns remain before the unit can reach a valid attack window on the target.
 */
function estimateTurnsToAttackWindow(definition, fromHex, targetHex, input) {
    var _a, _b;
    var rangeMin = (_a = definition.rangeMin) !== null && _a !== void 0 ? _a : 1;
    var rangeMax = (_b = definition.rangeMax) !== null && _b !== void 0 ? _b : 1;
    var distance = (0, Hex_1.hexDistance)(fromHex, targetHex);
    var attackBandGap = distanceToAttackBand(distance, rangeMin, rangeMax);
    var tacticalMoveRate = resolveTacticalMoveRate(definition);
    var turns = attackBandGap <= 0 ? 0 : Math.ceil(attackBandGap / tacticalMoveRate);
    if (requiresDirectLOS(definition) && !input.losAllows(fromHex, targetHex, definition.moveType === "air")) {
        turns += 1;
    }
    return turns;
}
/**
 * High-value battlefield assets attract fire even from generalists because removing them changes the whole fight.
 */
function calculateStrategicTargetBonus(defender) {
    if (!defender) {
        return 0;
    }
    var bonus = 0;
    if (isArmoredGroundUnit(defender.definition)) {
        bonus += 14;
    }
    if (defender.definition.class === "artillery") {
        bonus += 18;
    }
    if (defender.definition.combat.role === "antiTank") {
        bonus += 12;
    }
    if (defender.definition.class === "recon") {
        bonus += 4;
    }
    bonus += calculateThreatProjection(defender) * 0.55;
    return bonus;
}
/**
 * Shared target-priority score used by both attack selection and positioning logic.
 */
function calculateTargetPriorityBonus(purpose, defender) {
    return calculatePurposeBonus(purpose, defender) + calculateStrategicTargetBonus(defender);
}
/**
 * Returns how many hexes separate a destination from the unit's valid firing band.
 */
function distanceToAttackBand(distance, rangeMin, rangeMax) {
    if (distance < rangeMin) {
        return rangeMin - distance;
    }
    if (distance > rangeMax) {
        return distance - rangeMax;
    }
    return 0;
}
/**
 * Direct-fire formations need a firing lane; indirect artillery can stage behind the line as long as it is spotted.
 */
function requiresDirectLOS(definition) {
    if (definition.moveType === "air") {
        return false;
    }
    if (definition.class === "artillery") {
        return false;
    }
    return !definition.traits.includes("indirect");
}
/**
 * Used to skip air targets that most ground formations can never legally attack.
 */
function canPotentiallyAttackTarget(attacker, defender) {
    if (defender.definition.moveType !== "air") {
        return true;
    }
    return attacker.definition.moveType === "air" || attacker.unit.type.toLowerCase().includes("flak");
}
/**
 * Human-readable label for rationale strings when the planner stages around battlefield priorities.
 */
function describePriorityTarget(defender) {
    if (defender.definition.class === "artillery") {
        return "artillery ".concat(defender.unit.type);
    }
    if (isArmoredGroundUnit(defender.definition)) {
        return "armored ".concat(defender.unit.type);
    }
    return defender.unit.type;
}
// ==========================================
// ADVANCED TACTICAL AI SCORING FUNCTIONS
// ==========================================
/**
 * Calculates bonus for attacking a damaged/weakened enemy unit.
 * Prioritizes finishing off wounded targets for efficient kills.
 */
function calculateFocusFireBonus(defender, modifiers) {
    var _a;
    if (!modifiers.useTacticalAI)
        return 0;
    var defenderStrength = (_a = defender.unit.strength) !== null && _a !== void 0 ? _a : 100;
    // Critical health - massive priority boost
    if (defenderStrength <= CRITICAL_HEALTH_THRESHOLD) {
        return FOCUS_FIRE_BONUS * 1.5 * modifiers.focusFireWeight;
    }
    // Low health - significant priority boost
    if (defenderStrength <= LOW_HEALTH_THRESHOLD) {
        return FOCUS_FIRE_BONUS * modifiers.focusFireWeight;
    }
    // Moderate damage - small bonus
    if (defenderStrength <= 75) {
        return (FOCUS_FIRE_BONUS * 0.4) * modifiers.focusFireWeight;
    }
    return 0;
}
/**
 * Calculates bonus for attacking from a flanking position.
 * Rewards tactical positioning that would increase damage dealt.
 */
function calculateFlankingBonus(attackerHex, defender, modifiers) {
    if (!modifiers.useTacticalAI)
        return 0;
    var defenderFacing = defender.unit.facing;
    if (!defenderFacing)
        return 0;
    // Calculate the direction from defender to attacker
    var dx = attackerHex.q - defender.unit.hex.q;
    var dr = attackerHex.r - defender.unit.hex.r;
    // Simplified facing check - determine if attack is from side or rear
    // Facing directions: "N", "NE", "SE", "S", "SW", "NW"
    var facingVectors = {
        N: { q: 0, r: -1 },
        NE: { q: 1, r: -1 },
        SE: { q: 1, r: 0 },
        S: { q: 0, r: 1 },
        SW: { q: -1, r: 1 },
        NW: { q: -1, r: 0 }
    };
    var facing = facingVectors[defenderFacing];
    if (!facing)
        return 0;
    // Normalize the attack direction
    var attackLen = Math.hypot(dx, dr) || 1;
    var normDx = dx / attackLen;
    var normDr = dr / attackLen;
    // Dot product with facing - negative means attacking from behind
    var dot = normDx * facing.q + normDr * facing.r;
    // Rear attack (dot < -0.5) - full bonus
    if (dot < -0.5) {
        return FLANKING_BONUS * modifiers.flankingWeight;
    }
    // Side attack (|dot| < 0.5) - partial bonus
    if (Math.abs(dot) < 0.5) {
        return (FLANKING_BONUS * 0.5) * modifiers.flankingWeight;
    }
    // Frontal attack - no bonus
    return 0;
}
/**
 * Calculates bonus for combined arms - attacking when allies are nearby.
 * Encourages coordinated attacks and concentration of force.
 */
function calculateCombinedArmsBonus(targetHex, botUnits, attackerKey, modifiers) {
    if (!modifiers.useTacticalAI)
        return 0;
    var alliesNearTarget = 0;
    var alliesAdjacent = 0;
    for (var _i = 0, botUnits_1 = botUnits; _i < botUnits_1.length; _i++) {
        var ally = botUnits_1[_i];
        var allyKey = (0, Hex_1.axialKey)(ally.unit.hex);
        if (allyKey === attackerKey)
            continue; // Skip self
        var distance = (0, Hex_1.hexDistance)(ally.unit.hex, targetHex);
        if (distance === 1) {
            alliesAdjacent++;
        }
        else if (distance <= SUPPORT_RANGE) {
            alliesNearTarget++;
        }
    }
    var bonus = 0;
    // Adjacent allies provide the combined arms bonus
    if (alliesAdjacent > 0) {
        bonus += COMBINED_ARMS_BONUS * modifiers.combinedArmsWeight;
    }
    // Nearby allies provide stacking support bonus
    bonus += alliesNearTarget * SUPPORT_CONCENTRATION_BONUS * modifiers.combinedArmsWeight;
    return bonus;
}
/**
 * Calculates artillery-specific positioning bonuses and penalties.
 * Keeps artillery at optimal range and away from danger.
 */
function calculateArtilleryPositionScore(attackerHex, nearestEnemyDistance, attacker, defender, modifiers) {
    var _a;
    if (!modifiers.useTacticalAI)
        return 0;
    if (attacker.definition.class !== "artillery")
        return 0;
    var score = 0;
    var maxRange = (_a = attacker.definition.rangeMax) !== null && _a !== void 0 ? _a : 6;
    // Penalty for being too close to enemies
    if (nearestEnemyDistance <= ARTILLERY_DANGER_RANGE) {
        score += ARTILLERY_DANGER_PENALTY * modifiers.focusFireWeight;
    }
    // Bonus for firing at optimal range (max range - 2 to max range)
    if (defender) {
        var targetDistance = (0, Hex_1.hexDistance)(attackerHex, defender.unit.hex);
        var optimalRangeMin = Math.max(1, maxRange - 2);
        if (targetDistance >= optimalRangeMin && targetDistance <= maxRange) {
            score += ARTILLERY_RANGE_BONUS * modifiers.focusFireWeight;
        }
    }
    return score;
}
/**
 * Calculates terrain-based positioning bonus.
 * Rewards moving to defensible terrain when not attacking.
 */
function calculateTerrainPositionScore(hex, terrain, isAttacking) {
    // Only apply when not attacking (positioning moves)
    if (isAttacking)
        return 0;
    if (!terrain)
        return 0;
    // Use defense value to determine terrain quality
    // High defense terrain (3+) is defensive, low defense (0-1) is exposed
    if (terrain.defense >= 3) {
        return DEFENSIVE_TERRAIN_BONUS;
    }
    if (terrain.defense <= 1 && terrain.accMod >= 0) {
        // Low defense and no accuracy penalty means exposed terrain
        return EXPOSED_POSITION_PENALTY;
    }
    return 0;
}
/**
 * Calculates recon spotting bonus.
 * Rewards recon units for positioning to spot enemies for allies.
 */
function calculateReconSpottingBonus(hex, enemies, allies, attacker, losAllows) {
    if (attacker.definition.class !== "recon")
        return 0;
    var isAir = attacker.definition.moveType === "air";
    var spottedForAllies = 0;
    for (var _i = 0, enemies_2 = enemies; _i < enemies_2.length; _i++) {
        var enemy = enemies_2[_i];
        // Check if we can see this enemy from the new position
        if (!losAllows(hex, enemy.unit.hex, isAir))
            continue;
        // Count how many allies would benefit from this spotting
        for (var _a = 0, allies_1 = allies; _a < allies_1.length; _a++) {
            var ally = allies_1[_a];
            if (ally === attacker)
                continue;
            var allyDistance = (0, Hex_1.hexDistance)(ally.unit.hex, enemy.unit.hex);
            if (allyDistance <= RECON_SPOTTING_RANGE) {
                spottedForAllies++;
            }
        }
    }
    return Math.min(spottedForAllies, 3) * RECON_SPOTTING_BONUS * 0.3;
}
/**
 * Scores the safety and cohesion of a non-attack destination so the bot stages whole groups instead of lone probes.
 * This rewards covered, mutually supporting approaches and penalizes exposed lunges that end outside a fighting posture.
 */
function calculateApproachPositionScore(snapshot, destination, focusHex, input, modifiers, pathLength) {
    var _a, _b;
    if (pathLength === void 0) { pathLength = 1; }
    if (!modifiers.useTacticalAI) {
        return 0;
    }
    var terrain = input.map.terrainAt(destination);
    var selfKey = (0, Hex_1.axialKey)(snapshot.unit.hex);
    var supportDistances = input.botUnits
        .filter(function (ally) { return (0, Hex_1.axialKey)(ally.unit.hex) !== selfKey; })
        .map(function (ally) { return (0, Hex_1.hexDistance)(ally.unit.hex, destination); });
    var nearbySupport = supportDistances.filter(function (distance) { return distance <= SUPPORT_RANGE; }).length;
    var nearestSupportDistance = supportDistances.length > 0 ? Math.min.apply(Math, supportDistances) : Number.POSITIVE_INFINITY;
    var nearestEnemyDistance = input.playerUnits.reduce(function (min, enemy) { return Math.min(min, (0, Hex_1.hexDistance)(destination, enemy.unit.hex)); }, Number.POSITIVE_INFINITY);
    var rangeMin = (_a = snapshot.definition.rangeMin) !== null && _a !== void 0 ? _a : 1;
    var rangeMax = (_b = snapshot.definition.rangeMax) !== null && _b !== void 0 ? _b : 1;
    var focusDistance = focusHex ? (0, Hex_1.hexDistance)(destination, focusHex) : Number.POSITIVE_INFINITY;
    var inAttackBand = focusHex ? distanceToAttackBand(focusDistance, rangeMin, rangeMax) === 0 : false;
    var originTurnsToAttack = focusHex
        ? estimateTurnsToAttackWindow(snapshot.definition, snapshot.unit.hex, focusHex, input)
        : 0;
    var destinationTurnsToAttack = focusHex
        ? estimateTurnsToAttackWindow(snapshot.definition, destination, focusHex, input)
        : 0;
    var turnGain = originTurnsToAttack - destinationTurnsToAttack;
    var wantsCoveredApproach = requiresDirectLOS(snapshot.definition)
        || snapshot.definition.class === "recon"
        || isArmoredGroundUnit(snapshot.definition);
    var isAir = snapshot.definition.moveType === "air";
    var focusKey = focusHex ? (0, Hex_1.axialKey)(focusHex) : null;
    var visibleThreats = 0;
    input.playerUnits.forEach(function (enemy) {
        var enemyKey = (0, Hex_1.axialKey)(enemy.unit.hex);
        if (focusKey && inAttackBand && enemyKey === focusKey) {
            return;
        }
        if (input.losAllows(destination, enemy.unit.hex, isAir)) {
            visibleThreats += 1;
        }
    });
    var score = calculateTerrainPositionScore(destination, terrain, false);
    if ((terrain === null || terrain === void 0 ? void 0 : terrain.blocksLOS) && nearestEnemyDistance <= PROXIMITY_ENGAGE_RADIUS + 2) {
        score += BLOCKING_TERRAIN_APPROACH_BONUS;
    }
    if (turnGain > 0) {
        score += turnGain * TIME_TO_TARGET_BONUS;
    }
    else if (pathLength > 1 && focusHex && !inAttackBand) {
        score -= STALLED_APPROACH_PENALTY;
    }
    if (nearbySupport > 0) {
        score += Math.min(nearbySupport, 3) * ASSAULT_SUPPORT_BONUS;
    }
    else if (nearestEnemyDistance <= PROXIMITY_ENGAGE_RADIUS + 2 && snapshot.definition.class !== "artillery") {
        score -= LONE_ADVANCE_PENALTY;
        if (Number.isFinite(nearestSupportDistance)) {
            score -= Math.max(0, nearestSupportDistance - SUPPORT_RANGE) * 1.5;
        }
    }
    if (wantsCoveredApproach) {
        if (visibleThreats === 0 && nearestEnemyDistance <= PROXIMITY_ENGAGE_RADIUS + 2) {
            score += MASKED_APPROACH_BONUS;
        }
        else if (!inAttackBand) {
            score -= visibleThreats * EXPOSED_APPROACH_PENALTY;
            if (visibleThreats > 1) {
                // Multiple open firing lanes are where piecemeal pushes get chewed up. Penalize them sharply.
                score -= (visibleThreats - 1) * 4;
            }
        }
        else if (visibleThreats > 1) {
            score -= (visibleThreats - 1) * 2;
        }
    }
    if (snapshot.definition.class === "infantry" || snapshot.definition.class === "specialist") {
        if (!inAttackBand) {
            if ((terrain === null || terrain === void 0 ? void 0 : terrain.blocksLOS) || (terrain === null || terrain === void 0 ? void 0 : terrain.defense) >= 2 || visibleThreats === 0) {
                score += INFANTRY_COVER_MARCH_BONUS;
            }
            else if (visibleThreats > 0) {
                score -= visibleThreats * INFANTRY_EXPOSED_MARCH_PENALTY;
            }
        }
    }
    if (snapshot.definition.class === "recon") {
        if (nearbySupport === 0 && visibleThreats > 0) {
            score -= RECON_OVERRUN_PENALTY;
        }
        if (nearbySupport > 0 && visibleThreats === 0) {
            score += 3;
        }
    }
    if (isArmoredGroundUnit(snapshot.definition)) {
        var alliedArmorTurnBand = input.botUnits
            .filter(function (ally) { return (0, Hex_1.axialKey)(ally.unit.hex) !== selfKey && isArmoredGroundUnit(ally.definition); })
            .map(function (ally) {
            var allyTurns = focusHex
                ? estimateTurnsToAttackWindow(ally.definition, ally.unit.hex, focusHex, input)
                : 0;
            return Math.abs(destinationTurnsToAttack - allyTurns);
        });
        var closestArmorTimingGap = alliedArmorTurnBand.length > 0
            ? Math.min.apply(Math, alliedArmorTurnBand) : Number.POSITIVE_INFINITY;
        if (nearbySupport > 0) {
            score += 2;
        }
        if (closestArmorTimingGap <= 1) {
            score += ARMORED_UNIFIED_FRONT_BONUS;
        }
        else if (Number.isFinite(closestArmorTimingGap) && destinationTurnsToAttack < originTurnsToAttack) {
            score -= ARMORED_OUTRUN_SUPPORT_PENALTY + (closestArmorTimingGap - 1) * 2;
        }
    }
    return score;
}
/**
 * Calculates bonus for moving to or holding objective hexes.
 * Returns a high score for occupying objectives, scaled by difficulty and VP value.
 */
function scoreObjectiveControl(destination, objectives, occupancy, modifiers) {
    if (objectives.length === 0) {
        return 0;
    }
    var destKey = (0, Hex_1.axialKey)(destination);
    // Check if destination is an objective hex
    for (var _i = 0, objectives_3 = objectives; _i < objectives_3.length; _i++) {
        var objective = objectives_3[_i];
        var objKey = (0, Hex_1.axialKey)(objective.hex);
        if (objKey !== destKey) {
            continue;
        }
        // Found an objective at this destination
        var currentOccupant = occupancy.get(objKey);
        var bonus = OBJECTIVE_CONTROL_BONUS;
        // Scale by VP value
        bonus += objective.vp * 0.2;
        // Extra bonus if currently unoccupied or player-controlled (needs contesting)
        if (!currentOccupant || currentOccupant === "player") {
            bonus += 10;
        }
        // Apply difficulty scaling
        bonus *= modifiers.objectiveWeight;
        return bonus;
    }
    return 0;
}
/**
 * Converts candidate metrics into a comparable scalar. Higher scores win.
 * The optional modifiers parameter allows difficulty-based tuning of scoring weights.
 */
function scoreCandidate(purpose, attacker, defender, candidate, modifiers) {
    // Use provided modifiers or default to Normal difficulty values
    var mods = modifiers !== null && modifiers !== void 0 ? modifiers : getDifficultyModifiers("Normal");
    var purposeBonus = calculatePurposeBonus(purpose, defender);
    var strategicTargetBonus = calculateStrategicTargetBonus(defender);
    // Apply difficulty modifiers to scoring weights
    var damageScore = candidate.expectedDamage * mods.damageWeight;
    var retaliationPenalty = candidate.expectedRetaliation * mods.retaliationWeight;
    var attackOpportunityBonus = defender ? mods.attackOpportunityBonus : 0;
    var mobilityPenalty = (function () {
        var _a;
        if (!defender) {
            return 0;
        }
        // Encourage staying within range bands rather than overshooting when damage is comparable.
        var distance = (0, Hex_1.hexDistance)(candidate.destination, defender.unit.hex);
        var maxRange = (_a = attacker.definition.rangeMax) !== null && _a !== void 0 ? _a : 1;
        if (distance > maxRange) {
            return -4;
        }
        return 0;
    })();
    // Calculate advanced tactical bonuses if enabled
    var tacticalBonus = 0;
    if (mods.useTacticalAI && defender) {
        // Focus fire bonus - prioritize weakened enemies
        tacticalBonus += calculateFocusFireBonus(defender, mods);
        // Flanking bonus - reward attacking from sides/rear
        tacticalBonus += calculateFlankingBonus(candidate.destination, defender, mods);
    }
    return damageScore
        + purposeBonus
        + strategicTargetBonus
        + attackOpportunityBonus
        + mobilityPenalty
        + tacticalBonus
        - retaliationPenalty;
}
/**
 * Extended scoring function that includes all tactical considerations.
 * Used by pickBestCandidate for comprehensive attack evaluation.
 */
function scoreCandidateAdvanced(purpose, attacker, defender, candidate, input, modifiers) {
    // Get base score
    var score = scoreCandidate(purpose, attacker, defender, candidate, modifiers);
    if (!modifiers.useTacticalAI) {
        return score;
    }
    var attackerKey = (0, Hex_1.axialKey)(attacker.unit.hex);
    // Combined arms bonus - reward coordinated attacks
    if (defender) {
        score += calculateCombinedArmsBonus(defender.unit.hex, input.botUnits, attackerKey, modifiers);
    }
    // Artillery positioning - keep at optimal range
    var nearestEnemyDistance = input.playerUnits.reduce(function (min, enemy) { return Math.min(min, (0, Hex_1.hexDistance)(candidate.destination, enemy.unit.hex)); }, Infinity);
    score += calculateArtilleryPositionScore(candidate.destination, nearestEnemyDistance, attacker, defender, modifiers);
    // Terrain positioning bonus when not attacking
    if (!defender) {
        var terrain = input.map.terrainAt(candidate.destination);
        score += calculateTerrainPositionScore(candidate.destination, terrain, false);
    }
    // Recon spotting bonus
    score += calculateReconSpottingBonus(candidate.destination, input.playerUnits, input.botUnits, attacker, input.losAllows);
    // Objective control bonus - prioritize holding objectives
    score += scoreObjectiveControl(candidate.destination, input.objectives, input.occupancy, modifiers);
    return score;
}
/**
 * Adds non-attack movement options so units can advance toward objectives when no shot is available.
 * Prioritizes actually reaching and occupying objective hexes.
 */
function scoreObjectiveAdvance(snapshot, origin, reachable, objectives, occupancy, input, modifiers) {
    if (objectives.length === 0) {
        return null;
    }
    var best = null;
    objectives.forEach(function (objective) {
        var key = (0, Hex_1.axialKey)(objective.hex);
        var option = reachable.get(key);
        if (!option) {
            return;
        }
        var distanceReduction = (0, Hex_1.hexDistance)(origin, objective.hex) - (0, Hex_1.hexDistance)(option.hex, objective.hex);
        var score = OBJECTIVE_APPROACH_BONUS + objective.vp * 0.5 + distanceReduction * 2;
        // Large bonus if we're actually reaching the objective hex
        var destKey = (0, Hex_1.axialKey)(option.hex);
        if (destKey === key) {
            score += OBJECTIVE_CONTROL_BONUS * modifiers.objectiveWeight;
            var currentOccupant = occupancy.get(key);
            // Extra bonus for contesting unoccupied or player-controlled objectives
            if (!currentOccupant || currentOccupant === "player") {
                score += 10 * modifiers.objectiveWeight;
            }
        }
        if (!best || score > best.score) {
            best = {
                destination: option.hex,
                path: option.path,
                attackTarget: null,
                expectedDamage: 0,
                expectedRetaliation: 0,
                score: score + calculateApproachPositionScore(snapshot, option.hex, objective.hex, input, modifiers, option.path.length),
                rationale: destKey === key
                    ? "Occupy objective worth ".concat(objective.vp, " VP")
                    : "Advance to objective worth ".concat(objective.vp, " VP")
            };
        }
    });
    return best;
}
/**
 * When a unit cannot justify an immediate shot, look for the best staging hex to threaten a valuable target
 * on the following turn. This fills the gap between "attack now" and "march at the nearest thing."
 */
function scoreFireSetup(snapshot, reachable, enemies, input, modifiers) {
    var _a, _b;
    if (enemies.length === 0) {
        return null;
    }
    var purpose = classifyUnitPurpose(snapshot.definition);
    var rangeMin = (_a = snapshot.definition.rangeMin) !== null && _a !== void 0 ? _a : 1;
    var rangeMax = (_b = snapshot.definition.rangeMax) !== null && _b !== void 0 ? _b : 1;
    if (rangeMax <= 0) {
        return null;
    }
    var nextTurnMoveAllowance = resolveTacticalMoveRate(snapshot.definition);
    var requiresLos = requiresDirectLOS(snapshot.definition);
    var best = null;
    var evaluateSetupPosition = function (hex, path, enemy) {
        var terrain = input.map.terrainAt(hex);
        var nearestEnemyDistance = enemies.reduce(function (min, other) { return Math.min(min, (0, Hex_1.hexDistance)(hex, other.unit.hex)); }, Number.POSITIVE_INFINITY);
        var distance = (0, Hex_1.hexDistance)(hex, enemy.unit.hex);
        var rangeGap = distanceToAttackBand(distance, rangeMin, rangeMax);
        var futureGap = Math.max(0, rangeGap - nextTurnMoveAllowance);
        var hasLos = !requiresLos || input.losAllows(hex, enemy.unit.hex, false);
        var turnsToAttack = estimateTurnsToAttackWindow(snapshot.definition, hex, enemy.unit.hex, input);
        var score = FIRE_SETUP_BASE_BONUS
            + calculateTargetPriorityBonus(purpose, enemy)
            + calculateThreatProjection(enemy) * 0.2
            - rangeGap * FIRE_SETUP_RANGE_GAP_PENALTY
            - futureGap * FIRE_SETUP_FUTURE_GAP_PENALTY
            - turnsToAttack * TIME_TO_TARGET_BONUS * 0.7
            - (path.length - 1) * 0.75;
        if (futureGap === 0) {
            score += FIRE_SETUP_READY_BONUS;
        }
        // Direct-fire units should not stage onto hexes that still leave the target masked next turn.
        score += hasLos ? FIRE_SETUP_LOS_BONUS : -FIRE_SETUP_NO_LOS_PENALTY;
        score += calculateTerrainPositionScore(hex, terrain, false);
        score += calculateArtilleryPositionScore(hex, nearestEnemyDistance, snapshot, enemy, modifiers);
        score += calculateApproachPositionScore(snapshot, hex, enemy.unit.hex, input, modifiers, path.length);
        return { score: score, rangeGap: rangeGap, futureGap: futureGap, hasLos: hasLos, turnsToAttack: turnsToAttack };
    };
    for (var _i = 0, enemies_3 = enemies; _i < enemies_3.length; _i++) {
        var enemy = enemies_3[_i];
        if (!canPotentiallyAttackTarget(snapshot, enemy)) {
            continue;
        }
        var originEvaluation = evaluateSetupPosition(snapshot.unit.hex, [snapshot.unit.hex], enemy);
        if (originEvaluation.futureGap === 0 && originEvaluation.hasLos) {
            var holdCandidate = {
                destination: snapshot.unit.hex,
                path: [snapshot.unit.hex],
                attackTarget: null,
                expectedDamage: 0,
                expectedRetaliation: 0,
                score: originEvaluation.score,
                rationale: "Hold fire lane on ".concat(describePriorityTarget(enemy))
            };
            if (!best || holdCandidate.score > best.score) {
                best = holdCandidate;
            }
        }
        for (var _c = 0, _d = reachable.values(); _c < _d.length; _c++) {
            var option = _d[_c];
            if (option.path.length <= 1) {
                continue;
            }
            var evaluation = evaluateSetupPosition(option.hex, option.path, enemy);
            var rangeImprovement = originEvaluation.rangeGap - evaluation.rangeGap;
            var futureImprovement = originEvaluation.futureGap - evaluation.futureGap;
            var losImprovement = (evaluation.hasLos ? 1 : 0) - (originEvaluation.hasLos ? 1 : 0);
            var turnImprovement = originEvaluation.turnsToAttack - evaluation.turnsToAttack;
            // If the move does not improve attack timing or LOS, it is just churn and should not compete.
            if (rangeImprovement <= 0 && futureImprovement <= 0 && losImprovement <= 0 && turnImprovement <= 0) {
                continue;
            }
            var score = evaluation.score
                + rangeImprovement * 6
                + futureImprovement * 10
                + losImprovement * 8
                + turnImprovement * 14;
            var candidate = {
                destination: option.hex,
                path: option.path,
                attackTarget: null,
                expectedDamage: 0,
                expectedRetaliation: 0,
                score: score,
                rationale: "Stage for ".concat(describePriorityTarget(enemy))
            };
            if (option.path.length > 1) {
                candidate.score += STEERING_TIE_BIAS * steeringBias(snapshot.unit.hex, option.path[1], enemy.unit.hex);
            }
            if (!best || candidate.score > best.score) {
                best = candidate;
            }
        }
    }
    return best;
}
/**
 * Evaluate all reachable attack positions for a single unit and pick the highest scoring candidate.
 */
function pickBestCandidate(snapshot, input, reachable, activeObjectives, allowEnemyEliminationFallback) {
    var _a, _b, _c;
    var purpose = classifyUnitPurpose(snapshot.definition);
    // Get difficulty modifiers for scoring (defaults to Normal if not specified)
    var difficultyMods = getDifficultyModifiers((_a = input.difficulty) !== null && _a !== void 0 ? _a : "Normal");
    var top = null;
    // Determine whether to elevate engagement vs. nearby/visible enemies even if objectives exist.
    var isAir = snapshot.definition.moveType === "air";
    var nearestEnemyDistance = Number.POSITIVE_INFINITY;
    var enemyVisible = false;
    // Build a global spotted set: any player unit seen by a friendly air or recon spotter should attract all units.
    var globallySpottedPlayers = [];
    for (var _i = 0, _d = input.playerUnits; _i < _d.length; _i++) {
        var player = _d[_i];
        var spotted = false;
        for (var _e = 0, _f = input.botUnits; _e < _f.length; _e++) {
            var spotter = _f[_e];
            var spotterIsAir = spotter.definition.moveType === "air";
            var spotterIsRecon = (spotter.definition.class === "recon");
            if (!spotterIsAir && !spotterIsRecon) {
                continue;
            }
            if (input.losAllows(spotter.unit.hex, player.unit.hex, spotterIsAir)) {
                spotted = true;
                break;
            }
        }
        if (spotted) {
            globallySpottedPlayers.push(player);
        }
    }
    for (var _g = 0, _h = input.playerUnits; _g < _h.length; _g++) {
        var enemy = _h[_g];
        var d = (0, Hex_1.hexDistance)(snapshot.unit.hex, enemy.unit.hex);
        if (d < nearestEnemyDistance) {
            nearestEnemyDistance = d;
        }
        if (!enemyVisible && input.losAllows(snapshot.unit.hex, enemy.unit.hex, isAir)) {
            enemyVisible = true;
        }
    }
    var enemyNearOrVisible = enemyVisible || nearestEnemyDistance <= PROXIMITY_ENGAGE_RADIUS || globallySpottedPlayers.length > 0;
    var pressureTargets = globallySpottedPlayers.length > 0 ? globallySpottedPlayers : input.playerUnits;
    for (var _j = 0, _k = input.playerUnits; _j < _k.length; _j++) {
        var playerSnapshot = _k[_j];
        var rangeMax = (_b = snapshot.definition.rangeMax) !== null && _b !== void 0 ? _b : 1;
        var rangeMin = (_c = snapshot.definition.rangeMin) !== null && _c !== void 0 ? _c : 1;
        for (var _l = 0, _m = reachable.values(); _l < _m.length; _l++) {
            var option = _m[_l];
            var distance = (0, Hex_1.hexDistance)(option.hex, playerSnapshot.unit.hex);
            if (distance < rangeMin || distance > rangeMax) {
                continue;
            }
            var estimate = input.attackEstimator(snapshot, option.hex, playerSnapshot, playerSnapshot.unit.hex);
            if (!estimate) {
                continue;
            }
            var candidate = {
                destination: option.hex,
                path: option.path,
                attackTarget: playerSnapshot.unit.hex,
                expectedDamage: estimate.expectedDamage,
                expectedRetaliation: estimate.expectedRetaliation,
                score: 0,
                rationale: "Attack ".concat(playerSnapshot.unit.type)
            };
            // Use advanced tactical scoring for Normal/Hard, basic scoring for Easy
            candidate.score = difficultyMods.useTacticalAI
                ? scoreCandidateAdvanced(purpose, snapshot, playerSnapshot, candidate, input, difficultyMods)
                : scoreCandidate(purpose, snapshot, playerSnapshot, candidate, difficultyMods);
            // Steering: if multiple attack positions have similar value, prefer first steps that point toward the defender
            if (option.path.length > 1) {
                candidate.score += STEERING_TIE_BIAS * steeringBias(snapshot.unit.hex, option.path[1], playerSnapshot.unit.hex);
            }
            if (!top || candidate.score > top.score) {
                top = candidate;
            }
        }
    }
    var setupCandidate = scoreFireSetup(snapshot, reachable, pressureTargets, input, difficultyMods);
    if (setupCandidate && (allowEnemyEliminationFallback || enemyNearOrVisible)) {
        if (enemyNearOrVisible) {
            setupCandidate.score += difficultyMods.contactEngageBonus + Math.max(0, PROXIMITY_ENGAGE_RADIUS - nearestEnemyDistance);
        }
        if (!top || setupCandidate.score > top.score) {
            top = setupCandidate;
        }
    }
    // Consider movement toward objectives if no attack was valuable.
    if (!top || top.score < 0) {
        var advanceCandidate = scoreObjectiveAdvance(snapshot, snapshot.unit.hex, reachable, activeObjectives, input.occupancy, input, difficultyMods);
        if (advanceCandidate && (!top || advanceCandidate.score > top.score)) {
            top = advanceCandidate;
        }
        if (!top || top.score < 0) {
            var approachCandidate = scoreObjectiveApproach(snapshot, snapshot.unit.hex, reachable, activeObjectives, input.occupancy, input, difficultyMods);
            if (approachCandidate && (!top || approachCandidate.score > top.score)) {
                top = approachCandidate;
            }
        }
        // Engage nearby/visible enemies even when objectives exist; otherwise fall back to elimination goal
        // only when no contested objectives remain.
        if ((allowEnemyEliminationFallback || enemyNearOrVisible) && (!top || top.score < 0)) {
            var pressureCandidate = scoreEnemyPressure(snapshot, reachable, pressureTargets, input, difficultyMods);
            if (pressureCandidate && enemyNearOrVisible) {
                // Apply difficulty-based contact engagement bonus
                pressureCandidate.score += difficultyMods.contactEngageBonus + Math.max(0, PROXIMITY_ENGAGE_RADIUS - nearestEnemyDistance);
            }
            if (pressureCandidate && (!top || pressureCandidate.score > top.score)) {
                top = pressureCandidate;
            }
        }
    }
    // If we already have a decent objective move but an enemy-pressure option clearly outranks it
    // (due to proximity/visibility), prefer the pressure move. This keeps the AI responsive to contact.
    if ((allowEnemyEliminationFallback || enemyNearOrVisible) && isObjectiveCandidate(top)) {
        var pressureCandidate = scoreEnemyPressure(snapshot, reachable, pressureTargets, input, difficultyMods);
        if (pressureCandidate && enemyNearOrVisible) {
            // Apply difficulty-based contact engagement bonus
            pressureCandidate.score += difficultyMods.contactEngageBonus + Math.max(0, PROXIMITY_ENGAGE_RADIUS - nearestEnemyDistance);
        }
        if (pressureCandidate && (!top || pressureCandidate.score > top.score)) {
            top = pressureCandidate;
        }
    }
    // Final fallback: move toward nearest enemy even if we can't reach/attack them this turn
    // This prevents units from getting stuck when they can't find valid attack positions
    if (!top || top.score <= 0) {
        var fallbackPressure = scoreEnemyPressure(snapshot, reachable, input.playerUnits, input, difficultyMods);
        if (fallbackPressure && (!top || fallbackPressure.score > top.score)) {
            top = fallbackPressure;
        }
    }
    // Only hold position if literally no movement is possible
    if (!top) {
        top = {
            destination: snapshot.unit.hex,
            path: [snapshot.unit.hex],
            attackTarget: null,
            expectedDamage: 0,
            expectedRetaliation: 0,
            score: 0,
            rationale: "Hold position"
        };
    }
    return top;
}
/**
 * Primary entry point used by GameEngine: produce a ranked action list for all bot-controlled units.
 */
function planHeuristicBotTurn(input) {
    var actions = [];
    var activeObjectives = filterActiveObjectives(input.objectives, input.occupancy);
    var eliminationObjectiveEnabled = activeObjectives.length === 0;
    input.botUnits.forEach(function (snapshot) {
        var allowance = Math.max(0, input.movementAllowance(snapshot));
        var originKey = (0, Hex_1.axialKey)(snapshot.unit.hex);
        var reachable = computeReachableHexes(snapshot.unit.hex, allowance, snapshot.definition.moveType, input, originKey);
        var bestCandidate = pickBestCandidate(snapshot, input, reachable, activeObjectives, eliminationObjectiveEnabled);
        if (bestCandidate) {
            actions.push({
                unit: snapshot,
                unitKey: originKey,
                origin: snapshot.unit.hex,
                destination: bestCandidate.destination,
                path: bestCandidate.path,
                attackTarget: bestCandidate.attackTarget,
                expectedDamage: bestCandidate.expectedDamage,
                expectedRetaliation: bestCandidate.expectedRetaliation,
                score: bestCandidate.score,
                rationale: bestCandidate.rationale
            });
        }
    });
    return actions.sort(function (a, b) { return b.score - a.score; });
}
