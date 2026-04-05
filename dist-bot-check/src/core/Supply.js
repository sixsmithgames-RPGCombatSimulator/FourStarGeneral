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
exports.resolveUpkeepForClass = resolveUpkeepForClass;
exports.deriveSupplyCost = deriveSupplyCost;
exports.estimateTravelHours = estimateTravelHours;
exports.findSupplyRoute = findSupplyRoute;
exports.computeSupplyRoutes = computeSupplyRoutes;
exports.hasSupplyPath = hasSupplyPath;
exports.applyOutOfSupply = applyOutOfSupply;
exports.supplyTick = supplyTick;
exports.createSupplyUnits = createSupplyUnits;
/**
 * Supply pathfinding and starvation logic extracted into a focused module. All tunables come from
 * `balance.ts`, ensuring logistics tweaks remain centralized.
 */
var balance_1 = require("./balance");
var Hex_1 = require("./Hex");
/**
 * Resolves the configured upkeep profile for the provided class, defaulting to zero draw when a class
 * lacks an explicit entry (e.g., prototypes or scenario-specific units).
 */
function resolveUpkeepForClass(unitClass) {
    var upkeep = balance_1.supply.upkeep[unitClass];
    if (upkeep) {
        return upkeep;
    }
    return { ammo: 0, fuel: 0 };
}
/**
 * Derive a logistics cost model for the given terrain and unit type. Roads inherit their favorable
 * weighting from `balance.ts`, while rough terrain uses the unit's move type to scale difficulty.
 */
function deriveSupplyCost(terrain, isRoad, unitKey, catalog) {
    var _a, _b, _c;
    var unitDefinition = catalog.unitTypes[unitKey];
    var moveType = (_a = unitDefinition === null || unitDefinition === void 0 ? void 0 : unitDefinition.moveType) !== null && _a !== void 0 ? _a : "leg";
    var moveCostTable = (_b = terrain.moveCost) !== null && _b !== void 0 ? _b : {};
    var moveCost = (_c = moveCostTable[moveType]) !== null && _c !== void 0 ? _c : 1;
    var roadModifier = isRoad ? balance_1.supply.roadRange / Math.max(1, balance_1.supply.roadRange - 5) : 1;
    return {
        terrain: terrain,
        isRoad: isRoad,
        baseCost: isRoad ? moveCost * 0.5 * roadModifier : moveCost
    };
}
/**
 * Translate aggregated cost into a coarse travel time estimate. We assume each cost unit approximates
 * thirty minutes of convoy travel; road-heavy routes shave down the total by the configured road bias.
 */
function estimateTravelHours(totalCost, roadSegments) {
    if (totalCost <= 0) {
        return 0;
    }
    var baseHours = totalCost * 0.5;
    var roadBonus = Math.min(roadSegments * 0.05, 0.3 * baseHours);
    return Number((baseHours - roadBonus).toFixed(2));
}
/**
 * Dijkstra-style pathfinder that respects road preference and returns the cheapest route between a
 * supply origin and target hex. Callers provide a catalog so movement costs reflect unit type profiles.
 */
function findSupplyRoute(source, target, network, unitKey, catalog, roadPreference) {
    if (roadPreference === void 0) { roadPreference = 0.75; }
    var visited = new Map();
    var queue = [
        {
            key: (0, Hex_1.axialKey)(source),
            hex: source,
            cost: 0,
            roads: 0,
            offroad: 0,
            path: [{ hex: source, cost: 0, via: "road" }]
        }
    ];
    while (queue.length > 0) {
        queue.sort(function (a, b) { return a.cost - b.cost; });
        var current = queue.shift();
        var bestSeen = visited.get(current.key);
        if (bestSeen !== undefined && bestSeen <= current.cost) {
            continue;
        }
        visited.set(current.key, current.cost);
        if (current.key === (0, Hex_1.axialKey)(target)) {
            var totalCost = current.cost;
            return {
                nodes: current.path,
                totalCost: totalCost,
                estimatedHours: estimateTravelHours(totalCost, current.roads),
                roads: current.roads,
                offroad: current.offroad
            };
        }
        for (var _i = 0, _a = (0, Hex_1.neighbors)(current.hex); _i < _a.length; _i++) {
            var neighbor = _a[_i];
            var terrain = network.map.terrainAt(neighbor);
            if (!terrain) {
                continue;
            }
            if (network.map.isPassable && !network.map.isPassable(neighbor)) {
                continue;
            }
            var isRoad = network.map.isRoad(neighbor);
            var model = deriveSupplyCost(terrain, isRoad, unitKey, catalog);
            var weightedCost = model.baseCost + (isRoad ? -roadPreference : 1);
            var nextCost = current.cost + Math.max(weightedCost, 0.1);
            var neighborKey = (0, Hex_1.axialKey)(neighbor);
            var seenCost = visited.get(neighborKey);
            if (seenCost !== undefined && seenCost <= nextCost) {
                continue;
            }
            var via = isRoad ? "road" : terrain.blocksLOS ? "rough" : "rough";
            queue.push({
                key: neighborKey,
                hex: neighbor,
                cost: nextCost,
                roads: current.roads + (isRoad ? 1 : 0),
                offroad: current.offroad + (isRoad ? 0 : 1),
                path: __spreadArray(__spreadArray([], current.path, true), [{ hex: neighbor, cost: nextCost, via: via }], false)
            });
        }
    }
    return null;
}
/**
 * Bulk route computation helper used by the logistics planner. We fan out from a single source to many
 * targets, returning both the raw node sequences and a summary that the UI can display immediately.
 */
function computeSupplyRoutes(source, targets, network, catalog, roadPreference) {
    if (roadPreference === void 0) { roadPreference = 0.75; }
    var results = new Map();
    targets.forEach(function (target) {
        var summary = findSupplyRoute(source, target.hex, network, target.unitKey, catalog, roadPreference);
        if (summary) {
            results.set((0, Hex_1.axialKey)(target.hex), summary);
        }
    });
    return results;
}
/**
 * Determine if a given hex remains connected to any supply source within the configured ranges.
 */
function hasSupplyPath(unitHex, network) {
    if (network.sources.some(function (source) { return source.q === unitHex.q && source.r === unitHex.r; })) {
        return true;
    }
    var roadRange = balance_1.supply.roadRange, offroadRange = balance_1.supply.offroadRange, offroadCostMultiplier = balance_1.supply.offroadCostMultiplier;
    var map = network.map;
    var maxOffroadBudget = offroadRange * offroadCostMultiplier;
    var visited = new Map();
    var queue = [{ hex: unitHex, roadSteps: 0, offroadCost: 0 }];
    var _loop_1 = function () {
        var current = queue.shift();
        var key = "".concat(current.hex.q, ",").concat(current.hex.r);
        var seen = visited.get(key);
        if (seen && seen.roadSteps <= current.roadSteps && seen.offroadCost <= current.offroadCost) {
            return "continue";
        }
        visited.set(key, { roadSteps: current.roadSteps, offroadCost: current.offroadCost });
        if (network.sources.some(function (source) { return source.q === current.hex.q && source.r === current.hex.r; })) {
            return { value: true };
        }
        if (current.roadSteps > roadRange || current.offroadCost > maxOffroadBudget) {
            return "continue";
        }
        for (var _i = 0, _a = (0, Hex_1.neighbors)(current.hex); _i < _a.length; _i++) {
            var neighbor = _a[_i];
            if (map.isPassable && !map.isPassable(neighbor)) {
                continue;
            }
            var nextTerrain = map.terrainAt(neighbor);
            if (!nextTerrain) {
                continue;
            }
            var isNextRoad = map.isRoad(neighbor);
            var nextEntry = {
                hex: neighbor,
                roadSteps: current.roadSteps + 1,
                offroadCost: current.offroadCost + (isNextRoad ? 0 : offroadCostMultiplier)
            };
            if (nextEntry.roadSteps > roadRange || nextEntry.offroadCost > maxOffroadBudget) {
                continue;
            }
            queue.push(nextEntry);
        }
    };
    while (queue.length > 0) {
        var state_1 = _loop_1();
        if (typeof state_1 === "object")
            return state_1.value;
    }
    return false;
}
var DEFAULT_ATTRITION_PROFILE = {
    ammoLoss: balance_1.supply.tick.ammoLoss,
    fuelLoss: balance_1.supply.tick.fuelLoss,
    entrenchLoss: balance_1.supply.tick.entrenchLoss,
    strengthLossWhenEmpty: balance_1.supply.tick.stepLossWhenEmpty
};
/**
 * Applies attrition to an out-of-supply unit. Optional mitigation lets commander bonuses soften losses.
 */
function applyOutOfSupply(unit, profile) {
    if (profile === void 0) { profile = DEFAULT_ATTRITION_PROFILE; }
    unit.ammo = Math.max(0, unit.ammo - profile.ammoLoss);
    unit.fuel = Math.max(0, unit.fuel - profile.fuelLoss);
    unit.entrench = Math.max(0, unit.entrench - profile.entrenchLoss);
    if (unit.ammo === 0 || unit.fuel === 0) {
        unit.strength = Math.max(0, unit.strength - profile.strengthLossWhenEmpty);
    }
}
/**
 * Perform one supply tick over all units belonging to the side currently taking its phase.
 */
function supplyTick(units, network, supplyMitigation) {
    if (supplyMitigation === void 0) { supplyMitigation = 0; }
    var mitigatedProfile = {
        ammoLoss: Math.max(0, balance_1.supply.tick.ammoLoss - supplyMitigation),
        fuelLoss: Math.max(0, balance_1.supply.tick.fuelLoss - supplyMitigation),
        entrenchLoss: balance_1.supply.tick.entrenchLoss,
        strengthLossWhenEmpty: balance_1.supply.tick.stepLossWhenEmpty
    };
    units.forEach(function (unit) {
        var inSupply = hasSupplyPath(unit.hex, network);
        if (!inSupply) {
            applyOutOfSupply(unit, mitigatedProfile);
        }
    });
}
/**
 * Convenience adapter so existing scenario data can be fed directly into the supply helper without
 * additional wrapping.
 */
function createSupplyUnits(units) {
    return units
        .filter(function (unit, index) {
        if (!unit) {
            console.warn("[Supply] createSupplyUnits skipped empty entry", { index: index });
            return false;
        }
        return true;
    })
        .map(function (unit) { return ({
        hex: unit.hex,
        unitId: unit.unitId,
        ammo: unit.ammo,
        fuel: unit.fuel,
        entrench: unit.entrench,
        strength: unit.strength
    }); });
}
