/**
 * Supply pathfinding and starvation logic extracted into a focused module. All tunables come from
 * `balance.ts`, ensuring logistics tweaks remain centralized.
 */
import { supply as supplyBalance } from "./balance";
import { neighbors, axialKey } from "./Hex";
/**
 * Resolves the configured upkeep profile for the provided class, defaulting to zero draw when a class
 * lacks an explicit entry (e.g., prototypes or scenario-specific units).
 */
export function resolveUpkeepForClass(unitClass) {
    const upkeep = supplyBalance.upkeep[unitClass];
    if (upkeep) {
        return upkeep;
    }
    return { ammo: 0, fuel: 0 };
}
/**
 * Derive a logistics cost model for the given terrain and unit type. Roads inherit their favorable
 * weighting from `balance.ts`, while rough terrain uses the unit's move type to scale difficulty.
 */
export function deriveSupplyCost(terrain, isRoad, unitKey, catalog) {
    const unitDefinition = catalog.unitTypes[unitKey];
    const moveType = unitDefinition?.moveType ?? "leg";
    const moveCostTable = terrain.moveCost ?? {};
    const moveCost = moveCostTable[moveType] ?? 1;
    const roadModifier = isRoad ? supplyBalance.roadRange / Math.max(1, supplyBalance.roadRange - 5) : 1;
    return {
        terrain,
        isRoad,
        baseCost: isRoad ? moveCost * 0.5 * roadModifier : moveCost
    };
}
/**
 * Translate aggregated cost into a coarse travel time estimate. We assume each cost unit approximates
 * thirty minutes of convoy travel; road-heavy routes shave down the total by the configured road bias.
 */
export function estimateTravelHours(totalCost, roadSegments) {
    if (totalCost <= 0) {
        return 0;
    }
    const baseHours = totalCost * 0.5;
    const roadBonus = Math.min(roadSegments * 0.05, 0.3 * baseHours);
    return Number((baseHours - roadBonus).toFixed(2));
}
/**
 * Dijkstra-style pathfinder that respects road preference and returns the cheapest route between a
 * supply origin and target hex. Callers provide a catalog so movement costs reflect unit type profiles.
 */
export function findSupplyRoute(source, target, network, unitKey, catalog, roadPreference = 0.75) {
    const visited = new Map();
    const queue = [
        {
            key: axialKey(source),
            hex: source,
            cost: 0,
            roads: 0,
            offroad: 0,
            path: [{ hex: source, cost: 0, via: "road" }]
        }
    ];
    while (queue.length > 0) {
        queue.sort((a, b) => a.cost - b.cost);
        const current = queue.shift();
        const bestSeen = visited.get(current.key);
        if (bestSeen !== undefined && bestSeen <= current.cost) {
            continue;
        }
        visited.set(current.key, current.cost);
        if (current.key === axialKey(target)) {
            const totalCost = current.cost;
            return {
                nodes: current.path,
                totalCost,
                estimatedHours: estimateTravelHours(totalCost, current.roads),
                roads: current.roads,
                offroad: current.offroad
            };
        }
        for (const neighbor of neighbors(current.hex)) {
            const terrain = network.map.terrainAt(neighbor);
            if (!terrain) {
                continue;
            }
            if (network.map.isPassable && !network.map.isPassable(neighbor)) {
                continue;
            }
            const isRoad = network.map.isRoad(neighbor);
            const model = deriveSupplyCost(terrain, isRoad, unitKey, catalog);
            const weightedCost = model.baseCost + (isRoad ? -roadPreference : 1);
            const nextCost = current.cost + Math.max(weightedCost, 0.1);
            const neighborKey = axialKey(neighbor);
            const seenCost = visited.get(neighborKey);
            if (seenCost !== undefined && seenCost <= nextCost) {
                continue;
            }
            const via = isRoad ? "road" : terrain.blocksLOS ? "rough" : "rough";
            queue.push({
                key: neighborKey,
                hex: neighbor,
                cost: nextCost,
                roads: current.roads + (isRoad ? 1 : 0),
                offroad: current.offroad + (isRoad ? 0 : 1),
                path: [...current.path, { hex: neighbor, cost: nextCost, via }]
            });
        }
    }
    return null;
}
/**
 * Bulk route computation helper used by the logistics planner. We fan out from a single source to many
 * targets, returning both the raw node sequences and a summary that the UI can display immediately.
 */
export function computeSupplyRoutes(source, targets, network, catalog, roadPreference = 0.75) {
    const results = new Map();
    targets.forEach((target) => {
        const summary = findSupplyRoute(source, target.hex, network, target.unitKey, catalog, roadPreference);
        if (summary) {
            results.set(axialKey(target.hex), summary);
        }
    });
    return results;
}
/**
 * Determine if a given hex remains connected to any supply source within the configured ranges.
 */
export function hasSupplyPath(unitHex, network) {
    if (network.sources.some((source) => source.q === unitHex.q && source.r === unitHex.r)) {
        return true;
    }
    const { roadRange, offroadRange, offroadCostMultiplier } = supplyBalance;
    const { map } = network;
    const maxOffroadBudget = offroadRange * offroadCostMultiplier;
    const visited = new Map();
    const queue = [{ hex: unitHex, roadSteps: 0, offroadCost: 0 }];
    while (queue.length > 0) {
        const current = queue.shift();
        const key = `${current.hex.q},${current.hex.r}`;
        const seen = visited.get(key);
        if (seen && seen.roadSteps <= current.roadSteps && seen.offroadCost <= current.offroadCost) {
            continue;
        }
        visited.set(key, { roadSteps: current.roadSteps, offroadCost: current.offroadCost });
        if (network.sources.some((source) => source.q === current.hex.q && source.r === current.hex.r)) {
            return true;
        }
        if (current.roadSteps > roadRange || current.offroadCost > maxOffroadBudget) {
            continue;
        }
        for (const neighbor of neighbors(current.hex)) {
            if (map.isPassable && !map.isPassable(neighbor)) {
                continue;
            }
            const nextTerrain = map.terrainAt(neighbor);
            if (!nextTerrain) {
                continue;
            }
            const isNextRoad = map.isRoad(neighbor);
            const nextEntry = {
                hex: neighbor,
                roadSteps: current.roadSteps + 1,
                offroadCost: current.offroadCost + (isNextRoad ? 0 : offroadCostMultiplier)
            };
            if (nextEntry.roadSteps > roadRange || nextEntry.offroadCost > maxOffroadBudget) {
                continue;
            }
            queue.push(nextEntry);
        }
    }
    return false;
}
const DEFAULT_ATTRITION_PROFILE = {
    ammoLoss: supplyBalance.tick.ammoLoss,
    fuelLoss: supplyBalance.tick.fuelLoss,
    entrenchLoss: supplyBalance.tick.entrenchLoss,
    strengthLossWhenEmpty: supplyBalance.tick.stepLossWhenEmpty
};
/**
 * Applies attrition to an out-of-supply unit. Optional mitigation lets commander bonuses soften losses.
 */
export function applyOutOfSupply(unit, profile = DEFAULT_ATTRITION_PROFILE) {
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
export function supplyTick(units, network, supplyMitigation = 0) {
    const mitigatedProfile = {
        ammoLoss: Math.max(0, supplyBalance.tick.ammoLoss - supplyMitigation),
        fuelLoss: Math.max(0, supplyBalance.tick.fuelLoss - supplyMitigation),
        entrenchLoss: supplyBalance.tick.entrenchLoss,
        strengthLossWhenEmpty: supplyBalance.tick.stepLossWhenEmpty
    };
    units.forEach((unit) => {
        const inSupply = hasSupplyPath(unit.hex, network);
        if (!inSupply) {
            applyOutOfSupply(unit, mitigatedProfile);
        }
    });
}
/**
 * Convenience adapter so existing scenario data can be fed directly into the supply helper without
 * additional wrapping.
 */
export function createSupplyUnits(units) {
    return units
        .filter((unit, index) => {
        if (!unit) {
            console.warn("[Supply] createSupplyUnits skipped empty entry", { index });
            return false;
        }
        return true;
    })
        .map((unit) => ({
        hex: unit.hex,
        unitId: unit.unitId,
        ammo: unit.ammo,
        fuel: unit.fuel,
        entrench: unit.entrench,
        strength: unit.strength
    }));
}
