"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.DeploymentState = void 0;
exports.ensureDeploymentState = ensureDeploymentState;
exports.resetDeploymentState = resetDeploymentState;
var Hex_1 = require("../core/Hex");
var adapters_1 = require("../game/adapters");
var unitSpriteCatalog_1 = require("../data/unitSpriteCatalog");
var unitAllocation_1 = require("../data/unitAllocation");
var unitTypes_json_1 = require("../data/unitTypes.json");
function axialToOffsetKey(hex) {
    var col = hex.q;
    var row = hex.r + Math.floor(hex.q / 2);
    return "".concat(col, ",").concat(row);
}
/**
 * Manages the state of unit deployment including allocation pool, placement mirrors, and reserve tracking.
 * This state is synchronized with the GameEngine during deployment so UI components can render without
 * touching engine internals.
 */
var DeploymentState = /** @class */ (function () {
    function DeploymentState() {
        /** Units available for deployment including remaining counts. */
        this.pool = [];
        /** Snapshot of units already placed on the map keyed by hex ID. */
        this.placements = new Map();
        /** Reserves mirror grouped by unit key for simplified rendering. */
        this.reserves = [];
        this.initialized = false;
        this.baseCampKey = null;
        this.totalAllocationMap = new Map();
        this.spriteMap = new Map();
        this.reserveCountMap = new Map();
        this.committedEntries = [];
        this.zoneDefinitions = new Map();
        this.zoneOccupancy = new Map();
        this.hexToZoneKey = new Map();
        this.scenarioTypeAlias = new Map();
        this.unitKeyToScenarioType = new Map();
        // Pre-seed scenario → allocation aliases so player rosters derived directly from scenario data still resolve UI keys.
        this.primeSpriteCatalog();
    }
    /**
     * Initializes the deployment pool with available units.
     * @param entries - Array of deployment pool entries derived from precombat allocations.
     */
    DeploymentState.prototype.initialize = function (entries) {
        var _this = this;
        console.log("[DeploymentState] initialize called with entries", entries.map(function (e) { return ({ key: e.key, remaining: e.remaining }); }));
        this.pool = entries.map(function (entry) { return (__assign({}, entry)); });
        this.committedEntries = entries.map(function (entry) { return (__assign({}, entry)); });
        this.initialized = true;
        this.totalAllocationMap.clear();
        this.reserves = [];
        this.reserveCountMap.clear();
        this.pool.forEach(function (entry) {
            _this.totalAllocationMap.set(entry.key, entry.remaining);
            _this.reserveCountMap.set(entry.key, entry.remaining);
        });
        this.placements.clear();
        this.baseCampKey = null;
        // Seed the sprite cache so placement requests can reference icons without re-querying data modules.
        this.spriteMap.clear();
        this.primeSpriteCatalog();
        this.pool.forEach(function (entry) {
            var _a;
            var sprite = (_a = entry.sprite) !== null && _a !== void 0 ? _a : _this.spriteMap.get(entry.key);
            if (sprite) {
                _this.spriteMap.set(entry.key, sprite);
            }
            _this.syncReserveSnapshot(entry.key, entry.remaining);
        });
        // Reset zone occupancy so any registered zones start from a clean slate.
        this.zoneOccupancy.clear();
        this.zoneDefinitions.forEach(function (_, zoneKey) { return _this.zoneOccupancy.set(zoneKey, 0); });
    };
    /**
     * Stores the commander-approved deployment pool so the engine can rebuild reserves after screen swaps.
     * This helper preserves sprite keys and totals exactly as the precombat flow determined them.
     */
    DeploymentState.prototype.recordCommittedEntries = function (entries) {
        this.committedEntries = entries.map(function (entry) { return (__assign({}, entry)); });
        console.log("[DeploymentState] recordCommittedEntries", {
            count: this.committedEntries.length,
            keys: this.committedEntries.map(function (e) { return e.key; })
        });
    };
    /**
     * Indicates whether the commander has committed any deployment entries. Battle orchestration relies on
     * this flag to decide when a fresh engine needs to be reseeded after the precombat flow completes.
     */
    DeploymentState.prototype.hasCommittedEntries = function () {
        return this.committedEntries.length > 0;
    };
    /**
     * Supplies the list of committed entry keys so orchestration layers can log or assert expectations without mutating state.
     */
    DeploymentState.prototype.getCommittedEntryKeys = function () {
        return this.committedEntries.map(function (entry) { return entry.key; });
    };
    DeploymentState.prototype.primeSpriteCatalog = function () {
        var _this = this;
        adapters_1.deploymentTemplates.forEach(function (template) {
            var _a;
            var scenarioType = template.type;
            // Register only when missing so late overrides can update mappings without duplication.
            if (!_this.scenarioTypeAlias.has(scenarioType)) {
                _this.scenarioTypeAlias.set(scenarioType, template.key);
            }
            if (!_this.unitKeyToScenarioType.has(template.key)) {
                _this.unitKeyToScenarioType.set(template.key, scenarioType);
            }
            var sprite = (_a = (0, unitSpriteCatalog_1.getSpriteForAllocationKey)(template.key, "Player")) !== null && _a !== void 0 ? _a : (0, unitSpriteCatalog_1.getSpriteForScenarioType)(scenarioType, "Player");
            if (sprite && !_this.spriteMap.has(template.key)) {
                _this.spriteMap.set(template.key, sprite);
            }
        });
    };
    /**
     * Converts the committed deployment pool into `ScenarioUnit` payloads using allocation templates.
     * The generated units use placeholder hexes; the battle engine positions them during deployment.
     */
    DeploymentState.prototype.toScenarioUnits = function () {
        return this.toReserveBlueprints().map(function (blueprint) { return structuredClone(blueprint.unit); });
    };
    /**
     * Supplies a blueprint list that the engine can use to construct reserves with unit-key associations.
     */
    DeploymentState.prototype.toReserveBlueprints = function () {
        var source = this.committedEntries.length > 0 ? this.committedEntries : this.pool;
        var sourceKind = this.committedEntries.length > 0 ? "committed" : "pool";
        var blueprints = [];
        source.forEach(function (entry) {
            var template = (0, adapters_1.findTemplateForUnitKey)(entry.key);
            if (!template) {
                console.warn("Deployment template missing for key '".concat(entry.key, "'. Skipping committed entry."));
                return;
            }
            for (var index = 0; index < entry.remaining; index += 1) {
                var unit = (0, adapters_1.createScenarioUnitFromTemplate)(template, { q: 0, r: 0 });
                blueprints.push({
                    unitKey: entry.key,
                    label: entry.label,
                    unit: unit,
                    sprite: entry.sprite
                });
            }
        });
        console.log("[DeploymentState] toReserveBlueprints", { source: sourceKind, entries: source.map(function (e) { return ({ key: e.key, remaining: e.remaining }); }), blueprintCount: blueprints.length });
        return blueprints;
    };
    /**
     * Resets the deployment state to empty.
     */
    DeploymentState.prototype.reset = function () {
        this.pool = [];
        this.placements.clear();
        this.reserves = [];
        this.initialized = false;
        this.totalAllocationMap.clear();
        this.spriteMap.clear();
        this.reserveCountMap.clear();
        this.committedEntries = [];
        this.baseCampKey = null;
        this.zoneDefinitions.clear();
        this.zoneOccupancy.clear();
        this.hexToZoneKey.clear();
        this.primeSpriteCatalog();
    };
    /**
     * Checks if deployment state has been initialized.
     */
    DeploymentState.prototype.isInitialized = function () {
        return this.initialized;
    };
    /**
     * Finds a pool entry by its key.
     * @param key - The unit type key to search for
     * @returns The matching pool entry or undefined
     */
    DeploymentState.prototype.findEntry = function (key) {
        return this.pool.find(function (entry) { return entry.key === key; });
    };
    /**
     * Updates the remaining count for a specific unit type.
     * @param key - The unit type key
     * @param remaining - The new remaining count
     */
    DeploymentState.prototype.updateRemaining = function (key, remaining) {
        var entry = this.findEntry(key);
        if (entry) {
            entry.remaining = remaining;
        }
    };
    /**
     * Records a unit placement for the provided hex while keeping aggregate counters aligned.
     * @param hexKey - Offset string key identifying the rendered hex (e.g., "0,2").
     * @param unitKey - Allocation key used by the UI (e.g., "infantryBattalion").
     * @param faction - Owning faction, defaults to the player.
     */
    DeploymentState.prototype.setPlacement = function (hexKey, unitKey, faction) {
        if (faction === void 0) { faction = "Player"; }
        var sprite = this.spriteMap.get(unitKey);
        this.placements.set(hexKey, { hexKey: hexKey, unitKey: unitKey, faction: faction, sprite: sprite });
        this.adjustRemainingCount(unitKey, -1);
        this.decrementReserveCount(unitKey);
        this.incrementZoneOccupancy(hexKey);
    };
    /**
     * Removes any placement stored for the provided hex and restores counts.
     */
    DeploymentState.prototype.clearPlacement = function (hexKey) {
        var snapshot = this.placements.get(hexKey);
        if (!snapshot) {
            return;
        }
        this.placements.delete(hexKey);
        this.adjustRemainingCount(snapshot.unitKey, 1);
        this.incrementReserveCount(snapshot.unitKey);
        this.decrementZoneOccupancy(hexKey);
    };
    /**
     * Returns the total number of units deployed (allocated minus remaining).
     */
    DeploymentState.prototype.getTotalDeployed = function () {
        var _this = this;
        return this.pool.reduce(function (sum, entry) {
            return sum + (_this.getUnitCount(entry.key) - entry.remaining);
        }, 0);
    };
    /**
     * Registers the total allocation available for a unit type.
     * This value is used to compute deployed counts in the battle UI.
     */
    DeploymentState.prototype.setTotalAllocatedUnits = function (key, total) {
        this.totalAllocationMap.set(key, total);
    };
    /**
     * Retrieves the total allocation for a unit type.
     * Falls back to the remaining count if explicit totals were not set.
     */
    DeploymentState.prototype.getUnitCount = function (key) {
        var _a, _b, _c;
        if (this.totalAllocationMap.has(key)) {
            return this.totalAllocationMap.get(key);
        }
        return (_c = (_a = this.reserveCountMap.get(key)) !== null && _a !== void 0 ? _a : (_b = this.findEntry(key)) === null || _b === void 0 ? void 0 : _b.remaining) !== null && _c !== void 0 ? _c : 0;
    };
    /**
     * Reports the number of units currently deployed for the provided key.
     */
    DeploymentState.prototype.getDeployedCount = function (key) {
        var _a;
        return this.getUnitCount(key) - ((_a = this.reserveCountMap.get(key)) !== null && _a !== void 0 ? _a : 0);
    };
    /**
     * Reports the number of units remaining in reserve for the provided key.
     */
    DeploymentState.prototype.getReserveCount = function (key) {
        var _a;
        return (_a = this.reserveCountMap.get(key)) !== null && _a !== void 0 ? _a : 0;
    };
    /**
     * Converts internal pool state into roster entries summarizing deployed and reserve counts so UI layers
     * can present battle rosters without re-implementing allocation math.
     */
    DeploymentState.prototype.buildRosterEntries = function () {
        var _this = this;
        return this.pool.map(function (entry) {
            var total = _this.getUnitCount(entry.key);
            var reserve = _this.getReserveCount(entry.key);
            var deployed = Math.max(0, total - reserve);
            return {
                unitKey: entry.key,
                label: entry.label,
                deployed: deployed,
                reserve: reserve,
                total: total,
                sprite: _this.spriteMap.get(entry.key)
            };
        });
    };
    /**
     * Supplies a defensive copy of placement snapshots so UI layers cannot mutate internal state.
     */
    DeploymentState.prototype.getPlacements = function () {
        return Array.from(this.placements.values(), function (placement) { return (__assign({}, placement)); });
    };
    /**
     * Surfaces the sprite path registered for the provided unit key, if any.
     * UI consumers rely on this to render consistent icons across loadout and reserve lists.
     * The bridge only records paths that were explicitly registered (e.g., via allocation data),
     * so callers must handle the undefined case by showing a fallback glyph.
     */
    DeploymentState.prototype.getSpritePath = function (unitKey) {
        return this.spriteMap.get(unitKey);
    };
    DeploymentState.prototype.getUnitKeyForScenarioType = function (scenarioType) {
        return this.ensureScenarioAliasForType(scenarioType);
    };
    /**
     * Retrieves the placement snapshot assigned to a specific hex key, if present.
     */
    DeploymentState.prototype.getPlacement = function (hexKey) {
        var snapshot = this.placements.get(hexKey);
        return snapshot ? __assign({}, snapshot) : null;
    };
    /**
     * Exposes the mirrored base camp hex key reported by the engine, or null if unassigned.
     */
    DeploymentState.prototype.getBaseCampKey = function () {
        return this.baseCampKey;
    };
    /**
     * Registers zone capacity metadata so the deployment screen can surface remaining slot counts.
     * Call this once after loading scenario data before invoking mirrorEngineState().
     */
    DeploymentState.prototype.registerZones = function (definitions) {
        var _this = this;
        this.zoneDefinitions.clear();
        this.hexToZoneKey.clear();
        definitions.forEach(function (definition) {
            var hexKeySet = new Set(definition.hexKeys);
            _this.zoneDefinitions.set(definition.zoneKey, {
                capacity: definition.capacity,
                hexKeys: hexKeySet,
                name: definition.name,
                description: definition.description,
                faction: definition.faction
            });
            definition.hexKeys.forEach(function (hexKey) { return _this.hexToZoneKey.set(hexKey, definition.zoneKey); });
        });
        this.recalculateZoneOccupancy();
    };
    DeploymentState.prototype.getZoneHexes = function (zoneKey) {
        var definition = this.zoneDefinitions.get(zoneKey);
        if (!definition) {
            return [];
        }
        return Array.from(definition.hexKeys);
    };
    DeploymentState.prototype.getZoneDefinition = function (zoneKey) {
        var definition = this.zoneDefinitions.get(zoneKey);
        if (!definition) {
            return null;
        }
        return {
            capacity: definition.capacity,
            name: definition.name,
            description: definition.description,
            faction: definition.faction
        };
    };
    DeploymentState.prototype.getZoneKeyForHex = function (hexKey) {
        var _a;
        return (_a = this.hexToZoneKey.get(hexKey)) !== null && _a !== void 0 ? _a : null;
    };
    /**
     * Determines whether a hex belongs to one of the player's deployment zones.
     * Used post-deployment to restrict reserve call-ups to the base camp sector.
     */
    DeploymentState.prototype.isHexWithinPlayerZone = function (hexKey) {
        var zoneKey = this.hexToZoneKey.get(hexKey);
        if (!zoneKey) {
            return false;
        }
        var definition = this.zoneDefinitions.get(zoneKey);
        return (definition === null || definition === void 0 ? void 0 : definition.faction) !== "Bot";
    };
    DeploymentState.prototype.getScenarioTypeForUnitKey = function (unitKey) {
        var _a;
        return (_a = this.unitKeyToScenarioType.get(unitKey)) !== null && _a !== void 0 ? _a : null;
    };
    /**
     * Calculates remaining capacity for the provided zone.
     * Returns null when the zone definition has not been registered yet.
     */
    DeploymentState.prototype.getRemainingZoneCapacity = function (zoneKey) {
        var _a;
        var definition = this.zoneDefinitions.get(zoneKey);
        if (!definition) {
            return null;
        }
        var occupied = (_a = this.zoneOccupancy.get(zoneKey)) !== null && _a !== void 0 ? _a : 0;
        return Math.max(0, definition.capacity - occupied);
    };
    /**
     * Returns a summary of all registered zones including occupied and remaining slot counts.
     */
    DeploymentState.prototype.getZoneUsageSummaries = function () {
        var _this = this;
        return Array.from(this.zoneDefinitions.entries(), function (_a) {
            var _b;
            var zoneKey = _a[0], definition = _a[1];
            var occupied = (_b = _this.zoneOccupancy.get(zoneKey)) !== null && _b !== void 0 ? _b : 0;
            var remaining = Math.max(0, definition.capacity - occupied);
            return {
                zoneKey: zoneKey,
                capacity: definition.capacity,
                occupied: occupied,
                remaining: remaining,
                name: definition.name,
                description: definition.description,
                faction: definition.faction
            };
        });
    };
    /**
     * Mirrors the active GameEngine state into DeploymentState.
     * Call immediately after engine deployment actions (deploy, recall, finalize) so UI mirrors stay accurate.
     */
    DeploymentState.prototype.mirrorEngineState = function (engine, options) {
        var _this = this;
        if (options === void 0) { options = {}; }
        this.initialized = true;
        var previousPlacements = new Map(this.placements);
        this.placements.clear();
        var playerPlacements = engine.getPlayerPlacementsSnapshot();
        var placementCounts = new Map();
        playerPlacements.forEach(function (unit) {
            var _a, _b, _c, _d, _e, _f, _g;
            var axialHexKey = (0, Hex_1.axialKey)(unit.hex);
            var hexKey = axialToOffsetKey(unit.hex);
            var hint = (_e = (_d = (_b = (_a = options.placementHints) === null || _a === void 0 ? void 0 : _a.get(hexKey)) !== null && _b !== void 0 ? _b : (_c = options.placementHints) === null || _c === void 0 ? void 0 : _c.get(axialHexKey)) !== null && _d !== void 0 ? _d : previousPlacements.get(hexKey)) !== null && _e !== void 0 ? _e : previousPlacements.get(axialHexKey);
            var unitKey = _this.resolveUnitKeyFromScenario(unit, hint === null || hint === void 0 ? void 0 : hint.unitKey);
            var sprite = (_f = hint === null || hint === void 0 ? void 0 : hint.sprite) !== null && _f !== void 0 ? _f : _this.resolveSpriteForUnit(unitKey);
            _this.placements.set(hexKey, { hexKey: hexKey, unitKey: unitKey, faction: "Player", sprite: sprite });
            placementCounts.set(unitKey, ((_g = placementCounts.get(unitKey)) !== null && _g !== void 0 ? _g : 0) + 1);
        });
        this.baseCampKey = engine.baseCamp ? axialToOffsetKey(engine.baseCamp.hex) : null;
        var reserveSnapshot = engine.getReserveSnapshot();
        var aggregated = this.aggregateReserves(reserveSnapshot);
        // Adopt the engine's reserve counts as the authoritative source so deploy-by-key aligns with the queue.
        this.reserveCountMap.clear();
        aggregated.counts.forEach(function (value, key) { return _this.reserveCountMap.set(key, value); });
        console.log("[DeploymentState] mirrorEngineState", {
            poolSize: this.pool.length,
            committedEntries: this.committedEntries.map(function (entry) { return ({ key: entry.key, remaining: entry.remaining }); }),
            totalAllocationMap: Array.from(this.totalAllocationMap.entries()),
            reserveCounts: Array.from(this.reserveCountMap.entries()),
            engineReserves: reserveSnapshot.map(function (reserve, index) {
                var _a, _b;
                return ({
                    index: index,
                    allocationKey: (_a = reserve.allocationKey) !== null && _a !== void 0 ? _a : null,
                    scenarioType: reserve.unit.type,
                    inferredKey: (_b = reserve.allocationKey) !== null && _b !== void 0 ? _b : _this.resolveUnitKeyFromScenario(reserve.unit)
                });
            })
        });
        var previousPoolKeys = new Set(this.pool.map(function (entry) { return entry.key; }));
        var shouldRestoreCommittedPool = this.pool.length === 0
            || this.committedEntries.length > this.pool.length
            || this.committedEntries.some(function (entry) { return entry.remaining > 0 && !_this.pool.some(function (poolEntry) { return poolEntry.key === entry.key; }); });
        if (shouldRestoreCommittedPool && this.committedEntries.length > 0) {
            console.debug("[DeploymentState] Restoring committed pool", {
                reason: shouldRestoreCommittedPool,
                poolKeys: Array.from(previousPoolKeys.values()),
                committedKeys: this.committedEntries.map(function (entry) { return entry.key; })
            });
            // Reinstate the commander-approved roster whenever the pool drifts (e.g., engine snapshot omits a key still owed to the player).
            var restoredPool = this.committedEntries.map(function (entry) { return (__assign({}, entry)); });
            restoredPool.forEach(function (entry) { return _this.totalAllocationMap.set(entry.key, entry.remaining); });
            console.log("[DeploymentState] Restored pool from committed entries", {
                pool: restoredPool.map(function (entry) { return ({ key: entry.key, remaining: entry.remaining }); }),
                reason: {
                    poolLength: restoredPool.length,
                    committedLength: this.committedEntries.length,
                    previouslyMissingKeys: this.committedEntries
                        .filter(function (entry) { return !previousPoolKeys.has(entry.key); })
                        .map(function (entry) { return entry.key; })
                }
            });
            this.pool = restoredPool;
        }
        else if (this.pool.length === 0 && aggregated.snapshots.length > 0) {
            // No precombat data exists; blend engine reserves with already deployed counts so totals stay accurate for status copy.
            var aggregatedByKey_1 = new Map(aggregated.snapshots.map(function (snapshot) { return [snapshot.unitKey, snapshot]; }));
            var rosterKeys = new Set(__spreadArray(__spreadArray([], aggregatedByKey_1.keys(), true), placementCounts.keys(), true));
            console.debug("[DeploymentState] Synthesizing pool from engine snapshot", {
                aggregatedReserveKeys: Array.from(aggregatedByKey_1.keys()),
                placementKeys: Array.from(placementCounts.keys())
            });
            var synthesizedPool = Array.from(rosterKeys, function (unitKey) {
                var _a, _b, _c;
                var allocation = (0, unitAllocation_1.getAllocationOption)(unitKey);
                if (!allocation) {
                    throw new Error("No allocation metadata registered for engine reserve key '".concat(unitKey, "'."));
                }
                var reserveSnapshot = aggregatedByKey_1.get(unitKey);
                var remaining = (_a = reserveSnapshot === null || reserveSnapshot === void 0 ? void 0 : reserveSnapshot.remaining) !== null && _a !== void 0 ? _a : 0;
                var deployed = (_b = placementCounts.get(unitKey)) !== null && _b !== void 0 ? _b : 0;
                var total = remaining + deployed;
                _this.totalAllocationMap.set(unitKey, total);
                var sprite = (_c = reserveSnapshot === null || reserveSnapshot === void 0 ? void 0 : reserveSnapshot.sprite) !== null && _c !== void 0 ? _c : _this.resolveSpriteForUnit(unitKey);
                return {
                    key: unitKey,
                    label: allocation.label,
                    remaining: remaining,
                    sprite: sprite
                };
            });
            this.pool = synthesizedPool;
            if (this.committedEntries.length === 0) {
                console.debug("[DeploymentState] Capturing synthesized pool as committed entries", {
                    synthesizedKeys: synthesizedPool.map(function (entry) { return entry.key; })
                });
                this.committedEntries = synthesizedPool.map(function (entry) { return (__assign({}, entry)); });
            }
            console.log("[DeploymentState] Initialized pool from engine reserves and placements", {
                pool: synthesizedPool.map(function (entry) {
                    var _a, _b;
                    return ({
                        key: entry.key,
                        label: entry.label,
                        remaining: entry.remaining,
                        total: _this.getUnitCount(entry.key),
                        deployed: (_a = placementCounts.get(entry.key)) !== null && _a !== void 0 ? _a : 0,
                        scenarioType: (_b = _this.unitKeyToScenarioType.get(entry.key)) !== null && _b !== void 0 ? _b : null
                    });
                })
            });
        }
        // Update remaining counts using the authoritative reserve map so UI mirrors the engine queue exactly.
        // Normalize omitted keys: if the engine does not report reserves for a unit key and there are no
        // player placements for that key, drop it from the pool and zero its total so it does not count
        // as "deployed". If there ARE player placements, keep the entry but clamp the total to the placed count.
        var reserveSnapshots = new Map();
        var normalizedPool = [];
        this.pool.forEach(function (entry) {
            var _a;
            var engineRemaining = _this.reserveCountMap.get(entry.key);
            if (engineRemaining === undefined) {
                var deployedCount = (_a = placementCounts.get(entry.key)) !== null && _a !== void 0 ? _a : 0;
                console.warn("[DeploymentState] Engine snapshot omitted exhausted unit key; normalizing totals.", {
                    unitKey: entry.key,
                    totalBudget: _this.getUnitCount(entry.key),
                    deployedCount: deployedCount
                });
                if (deployedCount <= 0) {
                    // No reserves and no placements: remove from pool and ensure totals do not inflate deployed counts.
                    _this.totalAllocationMap.set(entry.key, 0);
                    return; // skip push to normalizedPool
                }
                // There are on-map units but no reserves to deploy. Reflect that as total = deployed, remaining = 0.
                engineRemaining = 0;
                _this.totalAllocationMap.set(entry.key, deployedCount);
            }
            entry.remaining = engineRemaining;
            _this.reserveCountMap.set(entry.key, engineRemaining);
            var sprite = _this.spriteMap.get(entry.key);
            var status = engineRemaining > 0 ? "ready" : "exhausted";
            reserveSnapshots.set(entry.key, {
                unitKey: entry.key,
                label: entry.label,
                remaining: engineRemaining,
                sprite: sprite,
                status: status
            });
            normalizedPool.push(entry);
        });
        this.pool = normalizedPool;
        // Merge any engine-only keys not represented in the committed pool (e.g., scenario defaults).
        aggregated.snapshots.forEach(function (snapshot) {
            if (reserveSnapshots.has(snapshot.unitKey)) {
                return;
            }
            reserveSnapshots.set(snapshot.unitKey, snapshot);
        });
        this.reserves = Array.from(reserveSnapshots.values());
        this.recalculateZoneOccupancy();
    };
    /**
     * Supplies a read-only view of current reserves to keep UI rendering code functional while avoiding accidental mutation.
     */
    DeploymentState.prototype.getReserves = function () {
        return this.reserves.map(function (reserve) { return (__assign({}, reserve)); });
    };
    DeploymentState.prototype.cacheFrozenReserves = function (reserveUnits) {
        var _this = this;
        var aggregated = this.aggregateReserves(reserveUnits);
        // Start from the aggregated engine snapshot so battle rescans overwrite any stale campaign allocations.
        this.reserveCountMap.clear();
        aggregated.counts.forEach(function (value, key) { return _this.reserveCountMap.set(key, value); });
        // Ensure every pool entry reflects the latest engine count, even when the unit disappeared from reserves.
        this.pool = this.pool.map(function (entry) {
            var _a;
            var remaining = (_a = _this.reserveCountMap.get(entry.key)) !== null && _a !== void 0 ? _a : 0;
            return __assign(__assign({}, entry), { remaining: remaining });
        });
        // Preserve the rendered reserve list in the same order as the pool for predictable UI updates.
        var poolOrder = new Map(this.pool.map(function (entry, index) { return [entry.key, index]; }));
        this.reserves = aggregated.snapshots.sort(function (a, b) {
            var indexA = poolOrder.get(a.unitKey);
            var indexB = poolOrder.get(b.unitKey);
            if (indexA === undefined && indexB === undefined) {
                return a.unitKey.localeCompare(b.unitKey);
            }
            if (indexA === undefined) {
                return 1;
            }
            if (indexB === undefined) {
                return -1;
            }
            return indexA - indexB;
        });
    };
    /**
     * Allows external wiring (e.g., precombat setup) to register sprite paths for a specific unit key.
     * This ensures the deployment panel and reserve list reuse consistent imagery.
     */
    DeploymentState.prototype.registerSprite = function (key, spritePath) {
        this.spriteMap.set(key, spritePath);
        var entry = this.findEntry(key);
        if (entry) {
            entry.sprite = spritePath;
        }
        this.updateReserveSprite(key, spritePath);
        this.updatePlacementSprites(key, spritePath);
    };
    /**
     * Records the mapping between UI allocation keys and scenario unit types returned by the engine.
     * Needed so mirrorEngineState() can translate ScenarioUnit.type back into UI-friendly keys.
     */
    DeploymentState.prototype.registerScenarioAlias = function (unitKey, scenarioType) {
        this.scenarioTypeAlias.set(scenarioType, unitKey);
        this.unitKeyToScenarioType.set(unitKey, scenarioType);
    };
    /**
     * Internal helper adjusting remaining counts while preventing negative totals.
     */
    DeploymentState.prototype.adjustRemainingCount = function (unitKey, delta) {
        var entry = this.findEntry(unitKey);
        if (!entry) {
            return;
        }
        entry.remaining = Math.max(0, entry.remaining + delta);
    };
    /**
     * Increases aggregated reserve count for a unit and refreshes derived snapshots.
     */
    DeploymentState.prototype.incrementReserveCount = function (unitKey) {
        var _a;
        var next = ((_a = this.reserveCountMap.get(unitKey)) !== null && _a !== void 0 ? _a : 0) + 1;
        this.reserveCountMap.set(unitKey, next);
        this.syncReserveSnapshot(unitKey, next);
    };
    /**
     * Decreases aggregated reserve count for a unit and refreshes derived snapshots.
     */
    DeploymentState.prototype.decrementReserveCount = function (unitKey) {
        var _a;
        if (!this.reserveCountMap.has(unitKey)) {
            return;
        }
        var next = Math.max(0, ((_a = this.reserveCountMap.get(unitKey)) !== null && _a !== void 0 ? _a : 0) - 1);
        if (next === 0) {
            this.reserveCountMap.delete(unitKey);
        }
        else {
            this.reserveCountMap.set(unitKey, next);
        }
        this.syncReserveSnapshot(unitKey, next);
    };
    /**
     * Ensures the reserve snapshot entry for the provided unit key reflects the latest remaining count.
     */
    DeploymentState.prototype.syncReserveSnapshot = function (unitKey, remaining) {
        var index = this.reserves.findIndex(function (reserve) { return reserve.unitKey === unitKey; });
        var status = remaining > 0 ? "ready" : "exhausted";
        if (index >= 0) {
            this.reserves[index] = __assign(__assign({}, this.reserves[index]), { remaining: remaining, status: status });
            return;
        }
        if (remaining <= 0) {
            return;
        }
        this.reserves.push({
            unitKey: unitKey,
            label: this.getLabelForUnitKey(unitKey),
            remaining: remaining,
            sprite: this.spriteMap.get(unitKey),
            status: status
        });
    };
    /**
     * Resolves a friendly label for a unit key falling back to the key when the pool has not been initialized yet.
     */
    DeploymentState.prototype.getLabelForUnitKey = function (unitKey) {
        var entry = this.findEntry(unitKey);
        if (entry) {
            return entry.label;
        }
        var allocation = (0, unitAllocation_1.getAllocationOption)(unitKey);
        if (allocation) {
            return allocation.label;
        }
        return unitKey;
    };
    /**
     * Populates sprite and alias caches using pre-known pool entries so mirror operations have defaults.
     * The caller should provide `scenarioType` when a specific engine template is known; otherwise
     * the deployment bridge will fall back to inference when mirroring engine snapshots.
     */
    DeploymentState.prototype.primeSpriteAndAliasCaches = function (entries) {
        var _this = this;
        entries.forEach(function (entry) {
            if (entry.sprite) {
                _this.spriteMap.set(entry.key, entry.sprite);
            }
            if (entry.scenarioType) {
                _this.scenarioTypeAlias.set(entry.scenarioType, entry.key);
            }
        });
    };
    /**
     * Recomputes zone occupancy counts using the current placement map.
     */
    DeploymentState.prototype.recalculateZoneOccupancy = function () {
        var _this = this;
        this.zoneOccupancy.clear();
        this.zoneDefinitions.forEach(function (definition, zoneKey) {
            _this.zoneOccupancy.set(zoneKey, 0);
            definition.hexKeys.forEach(function (hexKey) { return _this.hexToZoneKey.set(hexKey, zoneKey); });
        });
        this.placements.forEach(function (_, hexKey) { return _this.incrementZoneOccupancy(hexKey); });
    };
    /**
     * Applies a +1 occupancy delta for the zone containing the supplied hex key.
     */
    DeploymentState.prototype.incrementZoneOccupancy = function (hexKey) {
        var _a;
        var zoneKey = this.hexToZoneKey.get(hexKey);
        if (!zoneKey) {
            return;
        }
        this.zoneOccupancy.set(zoneKey, ((_a = this.zoneOccupancy.get(zoneKey)) !== null && _a !== void 0 ? _a : 0) + 1);
    };
    /**
     * Applies a -1 occupancy delta for the zone containing the supplied hex key.
     */
    DeploymentState.prototype.decrementZoneOccupancy = function (hexKey) {
        var _a;
        var zoneKey = this.hexToZoneKey.get(hexKey);
        if (!zoneKey) {
            return;
        }
        var next = Math.max(0, ((_a = this.zoneOccupancy.get(zoneKey)) !== null && _a !== void 0 ? _a : 0) - 1);
        this.zoneOccupancy.set(zoneKey, next);
    };
    /**
     * Looks up the allocation key associated with a ScenarioUnit.
     */
    DeploymentState.prototype.resolveUnitKeyFromScenario = function (unit, fallback) {
        var scenarioType = unit.type;
        var alias = this.ensureScenarioAliasForType(scenarioType);
        if (alias) {
            return alias;
        }
        if (fallback) {
            console.error("[DeploymentState] Falling back to provided unit key alias", {
                scenarioType: scenarioType,
                fallback: fallback
            });
            throw new Error("Scenario type '".concat(unit.type, "' is not registered. Refusing fallback alias '").concat(fallback, "'."));
        }
        throw new Error("Scenario type '".concat(unit.type, "' is not registered with DeploymentState."));
    };
    /**
     * Guarantees an allocation key mapping exists for the supplied scenario type, deriving it from deployment templates when needed.
     * Enables campaign scenarios without precombat preparation to surface player reserves while keeping bot units segregated.
     */
    DeploymentState.prototype.ensureScenarioAliasForType = function (scenarioType) {
        var _a;
        var existing = this.scenarioTypeAlias.get(scenarioType);
        if (existing) {
            return existing;
        }
        var template = adapters_1.deploymentTemplates.find(function (candidate) { return candidate.type === scenarioType; });
        if (!template) {
            return null;
        }
        this.registerScenarioAlias(template.key, scenarioType);
        var sprite = (_a = (0, unitSpriteCatalog_1.getSpriteForAllocationKey)(template.key, "Player")) !== null && _a !== void 0 ? _a : (0, unitSpriteCatalog_1.getSpriteForScenarioType)(scenarioType, "Player");
        if (sprite) {
            this.spriteMap.set(template.key, sprite);
        }
        return template.key;
    };
    /**
     * Aggregates engine reserve entries into counts and UI-friendly snapshots.
     */
    DeploymentState.prototype.aggregateReserves = function (reserveUnits) {
        var _this = this;
        var counts = new Map();
        var spriteOverrides = new Map();
        reserveUnits.forEach(function (entry) {
            var _a, _b, _c, _d, _e;
            // Exclude aircraft from ground reserve snapshots so squadrons are managed solely via Air Support.
            var def = entry.definition;
            var moveType = (_a = def === null || def === void 0 ? void 0 : def.moveType) !== null && _a !== void 0 ? _a : (_b = unitTypes_json_1.default[entry.unit.type]) === null || _b === void 0 ? void 0 : _b.moveType;
            if (moveType === "air") {
                return;
            }
            var unitKey = (_c = entry.allocationKey) !== null && _c !== void 0 ? _c : _this.resolveUnitKeyFromScenario(entry.unit);
            counts.set(unitKey, ((_d = counts.get(unitKey)) !== null && _d !== void 0 ? _d : 0) + 1);
            // Preserve the association between allocation key and scenario type so deploy-by-key lookups
            // succeed even when the commander bypasses precombat (engine defaults expose scenario types).
            var scenarioType = entry.unit.type;
            if (!_this.unitKeyToScenarioType.has(unitKey)) {
                _this.registerScenarioAlias(unitKey, scenarioType);
            }
            var sprite = (_e = entry.sprite) !== null && _e !== void 0 ? _e : _this.resolveSpriteForUnit(unitKey);
            if (sprite) {
                _this.spriteMap.set(unitKey, sprite);
            }
            if (!spriteOverrides.has(unitKey)) {
                spriteOverrides.set(unitKey, sprite);
            }
        });
        var snapshots = Array.from(counts.entries(), function (_a) {
            var unitKey = _a[0], remaining = _a[1];
            var status = remaining > 0 ? "ready" : "exhausted";
            return {
                unitKey: unitKey,
                label: _this.getLabelForUnitKey(unitKey),
                remaining: remaining,
                sprite: spriteOverrides.get(unitKey),
                status: status
            };
        });
        return { counts: counts, snapshots: snapshots };
    };
    /**
     * Normalizes sprite lookups using registered overrides or cached deployment pool sprites.
     */
    DeploymentState.prototype.resolveSpriteForUnit = function (unitKey) {
        var registered = this.spriteMap.get(unitKey);
        if (registered) {
            return registered;
        }
        // Attempt a late lookup using the scenario alias map so engine-provided units that were not part of
        // the initial allocation still use consistent iconography.
        var scenarioType = this.unitKeyToScenarioType.get(unitKey);
        if (scenarioType) {
            var catalogSprite = (0, unitSpriteCatalog_1.getSpriteForScenarioType)(scenarioType, "Player");
            if (catalogSprite) {
                this.spriteMap.set(unitKey, catalogSprite);
                return catalogSprite;
            }
        }
        var allocationSprite = (0, unitSpriteCatalog_1.getSpriteForAllocationKey)(unitKey, "Player");
        if (allocationSprite) {
            this.spriteMap.set(unitKey, allocationSprite);
            return allocationSprite;
        }
        return undefined;
    };
    /**
     * Updates reserve snapshots with a late-registered sprite path.
     */
    DeploymentState.prototype.updateReserveSprite = function (unitKey, spritePath) {
        var index = this.reserves.findIndex(function (reserve) { return reserve.unitKey === unitKey; });
        if (index >= 0) {
            this.reserves[index] = __assign(__assign({}, this.reserves[index]), { sprite: spritePath });
        }
    };
    /**
     * Updates placement snapshots with a late-registered sprite path.
     */
    DeploymentState.prototype.updatePlacementSprites = function (unitKey, spritePath) {
        var _this = this;
        this.placements.forEach(function (placement, hexKey) {
            if (placement.unitKey === unitKey) {
                _this.placements.set(hexKey, __assign(__assign({}, placement), { sprite: spritePath }));
            }
        });
    };
    return DeploymentState;
}());
exports.DeploymentState = DeploymentState;
/**
 * Singleton instance accessor for deployment state.
 * TODO: Consider dependency injection instead of singleton pattern.
 */
var deploymentStateInstance = null;
function ensureDeploymentState() {
    if (!deploymentStateInstance) {
        deploymentStateInstance = new DeploymentState();
    }
    return deploymentStateInstance;
}
function resetDeploymentState() {
    if (deploymentStateInstance) {
        deploymentStateInstance.reset();
    }
}
