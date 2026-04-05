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
exports.GameEngine = void 0;
exports.buildScenarioUnitsFromAllocation = buildScenarioUnitsFromAllocation;
var types_1 = require("../core/types");
var Combat_1 = require("../core/Combat");
var LOS_1 = require("../core/LOS");
var Supply_1 = require("../core/Supply");
var Hex_1 = require("../core/Hex");
var DeploymentState_1 = require("../state/DeploymentState");
var BotPlanner_1 = require("./bot/BotPlanner");
var airMissions_1 = require("../data/airMissions");
var transportModes_1 = require("../data/transportModes");
var reconIntelSnapshot_1 = require("../data/reconIntelSnapshot");
var balance_1 = require("../core/balance");
var SupplyState_1 = require("../core/SupplyState");
/**
 * Transforms UI deployment decisions into `ScenarioUnit` payloads that the engine understands.
 * We validate that each placement references a registered template and that the resulting unit type exists
 * so bad configuration fails fast before mutating any engine state.
 */
function buildScenarioUnitsFromAllocation(placements, templates, unitTypes) {
    var templateMap = new Map();
    templates.forEach(function (template) { return templateMap.set(template.key, template); });
    return placements.map(function (placement) {
        var template = templateMap.get(placement.unitKey);
        if (!template) {
            throw new Error("No deployment template registered for key '".concat(placement.unitKey, "'."));
        }
        if (!unitTypes[template.type]) {
            throw new Error("Unit type '".concat(template.type, "' is not defined in the unit dictionary."));
        }
        return {
            type: template.type,
            hex: structuredClone(placement.hex),
            strength: template.strength,
            experience: template.experience,
            ammo: template.ammo,
            fuel: template.fuel,
            entrench: template.entrench,
            facing: template.facing
        };
    });
}
/** Returns the scheduled mission entries providing direct escort for the specified protected unit. */
var missionIsProtectingUnit = function (mission, unitKey) {
    return mission.template.kind === "escort" && mission.escortTargetUnitKey === unitKey && mission.status === "inFlight";
};
/** Returns active air cover missions guarding the provided hex key.
 *  Supports base CAP: if no targetHex is set, the mission covers its originHexKey. */
var _missionIsCoveringHex = function (mission, hexKey) {
    if (mission.template.kind !== "airCover" || mission.status !== "inFlight") {
        return false;
    }
    // If a target hex is explicitly set, check against it.
    if (mission.targetHex !== undefined) {
        return (0, Hex_1.axialKey)(mission.targetHex) === hexKey;
    }
    // Base CAP: no target hex means the mission covers the squadron's origin hex.
    if (mission.originHexKey) {
        return mission.originHexKey === hexKey;
    }
    return false;
};
function normalizeUnitClass(value, key) {
    if (!value) {
        throw new Error("Unit '".concat(key, "' is missing a class designation."));
    }
    if (types_1.UNIT_CLASS_VALUES.includes(value)) {
        return value;
    }
    throw new Error("Unit '".concat(key, "' declares unsupported class '").concat(value, "'."));
}
function normalizeCombatClassification(value, key) {
    if (!value) {
        throw new Error("Unit '".concat(key, "' is missing combat classification metadata."));
    }
    if (!types_1.UNIT_CLASS_VALUES.includes(value.category)) {
        throw new Error("Unit '".concat(key, "' declares unsupported combat.category '").concat(String(value.category), "'."));
    }
    if (!types_1.COMBAT_WEIGHT_VALUES.includes(value.weight)) {
        throw new Error("Unit '".concat(key, "' declares unsupported combat.weight '").concat(String(value.weight), "'."));
    }
    if (!types_1.COMBAT_ROLE_VALUES.includes(value.role)) {
        throw new Error("Unit '".concat(key, "' declares unsupported combat.role '").concat(String(value.role), "'."));
    }
    if (!types_1.COMBAT_SIGNATURE_VALUES.includes(value.signature)) {
        throw new Error("Unit '".concat(key, "' declares unsupported combat.signature '").concat(String(value.signature), "'."));
    }
    return {
        category: value.category,
        weight: value.weight,
        role: value.role,
        signature: value.signature
    };
}
/**
 * Core engine class managing mutable battle state. It exposes a narrow API tailored to the existing UI
 * scaffolding so migration can proceed incrementally.
 */
var GameEngine = /** @class */ (function () {
    function GameEngine(config) {
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _v, _w, _x, _y, _z, _0;
        /** Optional per-hex capacity caps for airbase launch queues provided by config. */
        this.airbaseCapMap = null;
        /** Cache of deployed units on the battle map keyed by hex coordinate. */
        this.playerPlacements = new Map();
        this.botPlacements = new Map();
        this.allyPlacements = new Map();
        /** Hex modifications built by engineers (tank traps, fortifications, cleared paths). */
        this.hexModifications = new Map();
        /** Units not deployed at battle start; accessible via reserve UI. */
        this.reserves = [];
        /** Airborne infantry reserves for air transport missions; separate from ground reserves.
         *  These units are loaded at the airbase, not at the base camp. */
        this.airborneReserves = [];
        /** Combat engagement history for battle analysis and reporting. */
        this.combatReports = [];
        this.combatReportIdCounter = 0;
        /**
         * Support assets available to the commander. Stored as mutable records internally so cooldown math can
         * update them in place while the UI only receives defensive snapshots.
         */
        this.privateSupportAssets = [];
        /** Persistent casualty ledger feeding the roster casualty section. */
        this.casualtyLog = [];
        /** Cached roster snapshot so UI layers can render without recomputing on every frame. */
        this.cachedRosterSnapshot = null;
        /** Cached support snapshot mirroring readiness groups for the sidebar panel. */
        this.cachedSupportSnapshot = null;
        /** Latest recon & intelligence fusion snapshot surfaced to battle UI panels. */
        this.reconIntelSnapshot = null;
        this.counterIntelOperations = new Map();
        this.intelBriefStates = new Map();
        this.playerCounterIntelResources = {
            deceptionCharges: GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES,
            verificationCharges: GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES
        };
        this.counterIntelIdCounter = 0;
        /** Rolling supply ledger grouped by faction so consumption trends can be derived quickly. */
        this.supplyHistoryByFaction = {
            Player: [],
            Bot: [],
            Ally: []
        };
        /** Current supply mirror used between turns to track attrition. */
        this.playerSupply = [];
        this.botSupply = [];
        this.allySupply = [];
        /** Faction-level supply ledgers tracking stockpiles, shipments, and production history. */
        this.supplyStateByFaction = {
            Player: (0, SupplyState_1.createSupplyState)({ baseline: { ammo: 0, fuel: 0, rations: 0, parts: 0 } }),
            Bot: (0, SupplyState_1.createSupplyState)({ baseline: { ammo: 0, fuel: 0, rations: 0, parts: 0 } }),
            Ally: (0, SupplyState_1.createSupplyState)({ baseline: { ammo: 0, fuel: 0, rations: 0, parts: 0 } })
        };
        /** Convoy cargo and assignment state tracked independently from the truck unit's onboard fuel. */
        this.supplyTruckStateByFaction = {
            Player: new Map(),
            Bot: new Map(),
            Ally: new Map()
        };
        /** Tracks convoy-service recency so equal-priority units can rotate fairly across turns. */
        this.convoyServiceHistoryByFaction = {
            Player: new Map(),
            Bot: new Map(),
            Ally: new Map()
        };
        this.convoyServiceSequenceByFaction = {
            Player: 0,
            Bot: 0,
            Ally: 0
        };
        /** Optional player-configured resupply priorities keyed by the stable unit id. */
        this.supplyPriorityByUnitId = new Map();
        /** Player-facing contact picture for enemy formations. Contacts persist briefly after LOS is lost. */
        this.playerEnemyContactStates = new Map();
        /** Overflow stacks beyond the primary placement map entry, keyed by hex. */
        this.playerPlacementOverflow = new Map();
        this.botPlacementOverflow = new Map();
        this.allyPlacementOverflow = new Map();
        /** Per-turn action flags keyed by stable unit id so stacked formations track actions independently. */
        this.playerActionFlags = new Map();
        /** Hex keys for player-controlled units that still have full actions available this turn. */
        this.playerIdleUnitKeys = new Set();
        this.botActionFlags = new Map();
        /** Tracks remaining attack salvos for aircraft so we can require rearming after sustained operations. */
        this.playerAttackAmmo = new Map();
        this.botAttackAmmo = new Map();
        /** Static sortie definitions mirrored from data tables for quick lookup. */
        this.airMissionCatalog = airMissions_1.AIR_MISSION_TEMPLATES;
        /** Active air missions keyed by mission id plus quick reverse lookup by squadron id. */
        this.scheduledAirMissions = new Map();
        this.airMissionAssignmentsByUnit = new Map();
        this.airMissionReports = [];
        /** One-shot queue surfaced to the UI so arrivals can be animated at turn start. */
        this.pendingAirMissionArrivals = [];
        /** One-shot queue of air-to-air engagements so UI can animate fighter interceptions. */
        this.pendingAirEngagements = [];
        this.pendingSupportImpactEvents = [];
        this.airMissionIdCounter = 0;
        /** Refitting squadrons keyed by squadron id so planners know when they return to Ready status. */
        this.airMissionRefitTimers = new Map();
        /** Tracks which AA units have engaged aircraft this turn for rate limiting (one engagement per turn per unit). */
        this.aaEngagementsByUnitId = new Map();
        /** Counter for generating unique unit IDs within this engine session. */
        this.unitIdCounter = 0;
        /** Commander bonuses mirrored from the assigned general so UI panels can surface live modifiers. */
        this.playerCommanderStats = { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0 };
        /** Cached summary of the most recent bot turn so callers can announce actions exactly once. */
        this.pendingBotTurnSummary = null;
        /** Phase/turn tracking exposed to UI. */
        this._phase = "deployment";
        this._activeFaction = "Player";
        this._turnNumber = 1;
        /** Optional base camp chosen during deployment to anchor supply sources. */
        this._baseCamp = null;
        /** Units purchased during precombat awaiting conversion into engine reserves. */
        this.queuedAllocations = [];
        if (!config.botSide) {
            throw new Error("GameEngine initialization failed: botSide missing in config. Provide enemy forces in scenario before starting engine.");
        }
        this.scenario = config.scenario;
        this.unitTypes = config.unitTypes;
        this.terrain = config.terrain;
        this.playerSide = structuredClone(config.playerSide);
        this.botSide = structuredClone(config.botSide);
        this.allySide = config.allySide ? structuredClone(config.allySide) : null;
        this.initialPlayerDepotStock = {
            ammo: Math.max(0, Math.round((_b = (_a = config.initialPlayerDepotStock) === null || _a === void 0 ? void 0 : _a.ammo) !== null && _b !== void 0 ? _b : 0)),
            fuel: Math.max(0, Math.round((_d = (_c = config.initialPlayerDepotStock) === null || _c === void 0 ? void 0 : _c.fuel) !== null && _d !== void 0 ? _d : 0)),
            rations: Math.max(0, Math.round((_f = (_e = config.initialPlayerDepotStock) === null || _e === void 0 ? void 0 : _e.rations) !== null && _f !== void 0 ? _f : 0)),
            parts: Math.max(0, Math.round((_h = (_g = config.initialPlayerDepotStock) === null || _g === void 0 ? void 0 : _g.parts) !== null && _h !== void 0 ? _h : 0))
        };
        this.ensureBaselineSupplyConvoysForSide(this.botSide);
        if (this.allySide) {
            this.ensureBaselineSupplyConvoysForSide(this.allySide);
        }
        // Default to legacy Simple bot to avoid behavior changes unless explicitly enabled.
        this.botStrategyMode = (_j = config.botStrategyMode) !== null && _j !== void 0 ? _j : "Simple";
        // Default to Normal difficulty if not specified.
        this.botDifficulty = (_k = config.botDifficulty) !== null && _k !== void 0 ? _k : "Normal";
        var generalStats = (_l = this.playerSide.general) !== null && _l !== void 0 ? _l : { accBonus: 0, dmgBonus: 0, moveBonus: 0, supplyBonus: 0, moraleBonus: 0 };
        this.playerCommanderStats = structuredClone(generalStats);
        ((_m = this.playerSide.units) !== null && _m !== void 0 ? _m : []).forEach(function (unit) { return _this.ensureUnitId(unit); });
        ((_o = this.botSide.units) !== null && _o !== void 0 ? _o : []).forEach(function (unit) { return _this.ensureUnitId(unit); });
        ((_q = (_p = this.allySide) === null || _p === void 0 ? void 0 : _p.units) !== null && _q !== void 0 ? _q : []).forEach(function (unit) { return _this.ensureUnitId(unit); });
        this.playerSupply = (0, Supply_1.createSupplyUnits)((_r = this.playerSide.units) !== null && _r !== void 0 ? _r : []);
        this.botSupply = (0, Supply_1.createSupplyUnits)((_s = this.botSide.units) !== null && _s !== void 0 ? _s : []);
        this.allySupply = (0, Supply_1.createSupplyUnits)((_v = (_t = this.allySide) === null || _t === void 0 ? void 0 : _t.units) !== null && _v !== void 0 ? _v : []);
        this.rebuildSupplyStates();
        ((_w = this.botSide.units) !== null && _w !== void 0 ? _w : []).forEach(function (unit) {
            var clone = structuredClone(unit);
            // Assign a stable unique ID to each bot unit so air squadrons can be distinguished.
            _this.ensureUnitId(clone);
            _this.addUnitToFactionHex("Bot", clone);
        });
        // Seed ally placements if ally side is present. Ally units are always predeployed.
        if (this.allySide) {
            ((_x = this.allySide.units) !== null && _x !== void 0 ? _x : []).forEach(function (unit) {
                var clone = structuredClone(unit);
                _this.ensureUnitId(clone);
                _this.addUnitToFactionHex("Ally", clone);
            });
        }
        if (((_z = (_y = this.botSide.units) === null || _y === void 0 ? void 0 : _y.length) !== null && _z !== void 0 ? _z : 0) > 0 && this.botPlacements.size === 0) {
            // Fail fast so missing enemies are explicit instead of silently disappearing.
            throw new Error("GameEngine initialization failed: seeded 0 bot placements from ".concat(((_0 = this.botSide.units) !== null && _0 !== void 0 ? _0 : []).length, " bot units. Ensure scenario bot units are present and valid."));
        }
        this.seedSupportAssets();
        this.resetSupplyHistory();
        this.recordSupplySnapshot("Player");
        this.recordSupplySnapshot("Bot");
        if (this.allySide) {
            this.recordSupplySnapshot("Ally");
        }
        // Initialize optional airbase capacity map from configuration if present.
        if (config.airbaseCapacities && Object.keys(config.airbaseCapacities).length > 0) {
            this.airbaseCapMap = __assign({}, config.airbaseCapacities);
        }
    }
    /**
     * Clears the cached roster snapshot so subsequent requests rebuild from live engine state.
     * Keeping this helper centralized ensures every mutation path stays consistent.
     */
    GameEngine.prototype.invalidateRosterCache = function () {
        this.cachedRosterSnapshot = null;
    };
    /**
     * Clears the rolling supply history so fresh deployments do not retain stale trend lines.
     * Called whenever the engine is constructed or the scenario state is rehydrated from serialized data.
     */
    GameEngine.prototype.resetSupplyHistory = function () {
        var _this = this;
        Object.keys(this.supplyHistoryByFaction).forEach(function (faction) {
            _this.supplyHistoryByFaction[faction].length = 0;
        });
    };
    GameEngine.prototype.resetCounterIntelState = function () {
        this.counterIntelOperations.clear();
        this.intelBriefStates.clear();
        this.playerCounterIntelResources = {
            deceptionCharges: GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES,
            verificationCharges: GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES
        };
        this.counterIntelIdCounter = 0;
        this.reconIntelSnapshot = null;
    };
    /**
     * Recomputes faction supply ledgers from the current unit mirrors so stockpile math starts from a consistent baseline.
     */
    GameEngine.prototype.rebuildSupplyStates = function () {
        var _this = this;
        Object.keys(this.supplyStateByFaction).forEach(function (faction) {
            _this.supplyStateByFaction[faction] = _this.createFactionSupplyState(faction);
        });
    };
    /**
     * Builds a fresh supply state seeded from the faction's onboard ammo/fuel totals and the configured production rates.
     */
    GameEngine.prototype.createFactionSupplyState = function (faction) {
        var _a, _b;
        var totals = this.calculateUnitStockTotals(faction);
        var ammoTotal = (_a = totals === null || totals === void 0 ? void 0 : totals.ammo) !== null && _a !== void 0 ? _a : 0;
        var fuelTotal = (_b = totals === null || totals === void 0 ? void 0 : totals.fuel) !== null && _b !== void 0 ? _b : 0;
        var initialDepotStock = faction === "Player"
            ? this.initialPlayerDepotStock
            : { ammo: 0, fuel: 0, rations: 0, parts: 0 };
        // Defensive guard: malformed supply mirrors can leave totals undefined; treat as zero stock to keep engine alive.
        var baselineAmmo = Math.max(0, Math.round(ammoTotal * balance_1.supply.stockpileMultiplier.ammo) + initialDepotStock.ammo);
        var baselineFuel = Math.max(0, Math.round(fuelTotal * balance_1.supply.stockpileMultiplier.fuel) + initialDepotStock.fuel);
        return (0, SupplyState_1.createSupplyState)({
            baseline: {
                ammo: baselineAmmo,
                fuel: baselineFuel,
                rations: initialDepotStock.rations,
                parts: initialDepotStock.parts
            },
            productionRate: {
                ammo: balance_1.supply.production.ammo,
                fuel: balance_1.supply.production.fuel,
                rations: 0,
                parts: 0
            },
            lastUpdatedTurn: this._turnNumber
        });
    };
    /**
     * Sums current ammo and fuel values for all supply-mirrored units controlled by the requested faction.
     */
    GameEngine.prototype.calculateUnitStockTotals = function (faction) {
        var units = faction === "Player" ? this.playerSupply : faction === "Bot" ? this.botSupply : this.allySupply;
        return units.reduce(function (accumulator, unit, index) {
            var _a, _b;
            if (!unit) {
                console.warn("[GameEngine] calculateUnitStockTotals skipped null supply entry", { faction: faction, index: index });
                return accumulator;
            }
            // Treat missing ammo/fuel as zero so malformed mirrors cannot crash supply seeding.
            accumulator.ammo += (_a = unit.ammo) !== null && _a !== void 0 ? _a : 0;
            accumulator.fuel += (_b = unit.fuel) !== null && _b !== void 0 ? _b : 0;
            return accumulator;
        }, { ammo: 0, fuel: 0 });
    };
    /** Validates that the requested target lies within the squadron's combat radius. */
    GameEngine.prototype.assertAirMissionRange = function (profile, origin, target) {
        var distance = (0, Hex_1.hexDistance)(origin, target);
        var kilometers = distance * GameEngine.KILOMETERS_PER_HEX;
        if (kilometers > profile.combatRadiusKm + 1e-6) {
            throw new Error("Mission target lies beyond this squadron's combat radius.");
        }
    };
    /** Escorts must remain close enough to the package they are protecting to remain effective. */
    GameEngine.prototype.assertEscortDistance = function (profile, origin, escortTarget) {
        var distance = (0, Hex_1.hexDistance)(origin, escortTarget);
        var kilometers = distance * GameEngine.KILOMETERS_PER_HEX;
        if (kilometers > profile.combatRadiusKm + 1e-6) {
            throw new Error("Escort assignment exceeds the squadron's patrol radius.");
        }
    };
    /** Retrieve the mission template for the requested kind or throw so callers fail fast. */
    GameEngine.prototype.getAirMissionTemplate = function (kind) {
        var template = this.airMissionCatalog.find(function (entry) { return entry.kind === kind; });
        if (!template) {
            throw new Error("Unsupported air mission kind '".concat(kind, "'."));
        }
        return template;
    };
    /**
     * Derives a new mission id while keeping counters monotonic so restored saves do not collide with live ids.
     */
    GameEngine.prototype.nextAirMissionId = function () {
        this.airMissionIdCounter += 1;
        return "air-mission-".concat(this.airMissionIdCounter);
    };
    /** Serialize mission state into a lightweight snapshot safe for persistence and UI consumers. */
    GameEngine.prototype.serializeAirMission = function (mission) {
        return {
            id: mission.id,
            kind: mission.template.kind,
            faction: mission.faction,
            unitKey: mission.unitKey,
            originHexKey: mission.originHexKey,
            unitType: mission.unitType,
            status: mission.status,
            launchTurn: mission.launchTurn,
            turnsRemaining: mission.turnsRemaining,
            targetHex: mission.targetHex ? structuredClone(mission.targetHex) : undefined,
            targetUnitKey: mission.targetUnitKey,
            escortTargetUnitKey: mission.escortTargetUnitKey,
            interceptions: mission.interceptions,
            airCombatDamageInflicted: mission.airCombatDamageInflicted,
            airCombatDamageTaken: mission.airCombatDamageTaken,
            airCombatKills: mission.airCombatKills,
            outcome: mission.outcome ? structuredClone(mission.outcome) : undefined
        };
    };
    /** Restore scheduled sorties from serialized state so hydration preserves pending missions. */
    GameEngine.prototype.restoreAirMission = function (entry) {
        var _a, _b, _c, _d;
        var template = this.getAirMissionTemplate(entry.kind);
        var mission = {
            id: entry.id,
            template: template,
            faction: entry.faction,
            unitKey: entry.unitKey,
            originHexKey: entry.originHexKey,
            unitType: entry.unitType,
            status: entry.status,
            launchTurn: entry.launchTurn,
            turnsRemaining: entry.turnsRemaining,
            targetHex: entry.targetHex ? structuredClone(entry.targetHex) : undefined,
            targetUnitKey: entry.targetUnitKey,
            escortTargetUnitKey: entry.escortTargetUnitKey,
            interceptions: (_a = entry.interceptions) !== null && _a !== void 0 ? _a : 0,
            airCombatDamageInflicted: (_b = entry.airCombatDamageInflicted) !== null && _b !== void 0 ? _b : 0,
            airCombatDamageTaken: (_c = entry.airCombatDamageTaken) !== null && _c !== void 0 ? _c : 0,
            airCombatKills: (_d = entry.airCombatKills) !== null && _d !== void 0 ? _d : 0,
            outcome: entry.outcome ? structuredClone(entry.outcome) : undefined
        };
        this.scheduledAirMissions.set(mission.id, mission);
        // The unitKey is now the stable squadronId (unitId), so use it directly for assignment tracking.
        // For legacy saves where unitKey was a hex key, try to look up the unit and get its squadronId.
        var assignmentKey = mission.unitKey;
        if (mission.unitKey.includes(",") && !mission.unitKey.startsWith("u_")) {
            // Legacy format: unitKey is a hex coordinate like "0,0" - try to find the unit and get its squadronId.
            try {
                var origin_1 = GameEngine.parseAxialKey(mission.unitKey);
                var unit = this.lookupUnit(origin_1, mission.faction, true);
                if (unit) {
                    assignmentKey = this.getSquadronId(unit);
                }
            }
            catch (_e) {
                // Fall back to the stored unit key if lookups fail; scheduling guards remain defensive.
            }
        }
        this.airMissionAssignmentsByUnit.set(assignmentKey, mission.id);
        this.syncAirMissionCounterFromId(mission.id);
    };
    /** Keeps the autogenerated id counter aligned with any ids encountered during hydration. */
    GameEngine.prototype.syncAirMissionCounterFromId = function (missionId) {
        var match = /^(?:air-mission-)(\d+)$/.exec(missionId);
        if (!match) {
            return;
        }
        var value = Number.parseInt(match[1], 10);
        if (!Number.isNaN(value)) {
            this.airMissionIdCounter = Math.max(this.airMissionIdCounter, value);
        }
    };
    /** Clears the assignment lock for the squadron flying the specified mission, if present. */
    GameEngine.prototype.clearAirMissionAssignment = function (mission) {
        for (var _i = 0, _a = this.airMissionAssignmentsByUnit.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], squadronId = _b[0], missionId = _b[1];
            if (missionId === mission.id) {
                this.airMissionAssignmentsByUnit.delete(squadronId);
                break;
            }
        }
    };
    /**
     * Advances mission lifecycles for the specified faction, transitioning queued sorties into flight and
     * completing any packages that have finished their duration.
     */
    GameEngine.prototype.stepAirMissionsForFaction = function (faction) {
        var _a, _b, _c;
        if (this.scheduledAirMissions.size === 0) {
            return;
        }
        var active = [];
        var launchedThisStep = new Set();
        // Phase 1: Transition all queued missions to inFlight first so downstream resolution can see escorts/CAP
        // regardless of insertion order.
        for (var _i = 0, _d = this.scheduledAirMissions.values(); _i < _d.length; _i++) {
            var mission = _d[_i];
            if (mission.faction !== faction || mission.status === "completed") {
                continue;
            }
            if (mission.status === "queued") {
                this.refreshStrikeTargetHex(mission, 6);
                mission.status = "inFlight";
                mission.turnsRemaining = Math.max(0, mission.template.durationTurns);
                launchedThisStep.add(mission.id);
                var originHexKey = (_a = mission.originHexKey) !== null && _a !== void 0 ? _a : (_b = this.lookupUnitBySquadronId(mission.unitKey, mission.faction)) === null || _b === void 0 ? void 0 : _b.hexKey;
                this.pendingAirMissionArrivals.push({
                    missionId: mission.id,
                    faction: mission.faction,
                    unitKey: mission.unitKey,
                    originHexKey: originHexKey,
                    unitType: mission.unitType,
                    unitStrength: (_c = this.lookupUnitBySquadronId(mission.unitKey, mission.faction)) === null || _c === void 0 ? void 0 : _c.unit.strength,
                    kind: mission.template.kind,
                    targetHex: mission.targetHex ? structuredClone(mission.targetHex) : undefined,
                    targetUnitKey: mission.targetUnitKey,
                    escortTargetUnitKey: mission.escortTargetUnitKey
                });
            }
            active.push(mission);
        }
        // Phase 2: Tick down active inFlight missions.
        for (var _e = 0, active_1 = active; _e < active_1.length; _e++) {
            var mission = active_1[_e];
            if (mission.status !== "inFlight") {
                continue;
            }
            if (launchedThisStep.has(mission.id)) {
                continue;
            }
            if (mission.turnsRemaining > 0) {
                mission.turnsRemaining = Math.max(0, mission.turnsRemaining - 1);
            }
        }
        // Phase 3: Resolve missions in deterministic order so escort missions remain available while strikes resolve.
        var order = ["strike", "escort", "airTransport", "airCover"];
        for (var _f = 0, order_1 = order; _f < order_1.length; _f++) {
            var kind = order_1[_f];
            for (var _g = 0, active_2 = active; _g < active_2.length; _g++) {
                var mission = active_2[_g];
                if (mission.template.kind !== kind || mission.status === "completed") {
                    continue;
                }
                if (mission.status === "resolving") {
                    this.resolveAirMission(mission);
                    continue;
                }
                if (mission.status !== "inFlight") {
                    continue;
                }
                if (mission.turnsRemaining > 0) {
                    continue;
                }
                this.refreshStrikeTargetHex(mission, 6);
                mission.status = "resolving";
                this.resolveAirMission(mission);
            }
        }
    };
    /**
     * Decrements active refit timers (optionally scoped to a faction). Completed refits trigger automatic
     * rearming so the squadron is ready for future tasking.
     */
    GameEngine.prototype.advanceAirMissionRefits = function (faction) {
        var _this = this;
        if (this.airMissionRefitTimers.size === 0) {
            return;
        }
        var completed = [];
        for (var _i = 0, _a = this.airMissionRefitTimers.entries(); _i < _a.length; _i++) {
            var _b = _a[_i], unitKey = _b[0], timer = _b[1];
            if (faction && timer.faction !== faction) {
                continue;
            }
            var remaining = Math.max(0, timer.remaining - 1);
            if (remaining <= 0) {
                completed.push({ missionId: timer.missionId, unitKey: unitKey, faction: timer.faction });
                this.airMissionRefitTimers.delete(unitKey);
            }
            else {
                this.airMissionRefitTimers.set(unitKey, __assign(__assign({}, timer), { remaining: remaining }));
            }
        }
        completed.forEach(function (entry) { return _this.finishMissionRefit(entry.missionId, entry.unitKey, entry.faction); });
    };
    /** Dispatch entry point that advances a mission into its completed state and records the outcome. */
    GameEngine.prototype.resolveAirMission = function (mission) {
        if (mission.status === "completed") {
            return;
        }
        var outcome;
        if (mission.template.kind === "strike") {
            outcome = this.resolveAirStrikeMission(mission);
        }
        else if (mission.template.kind === "escort") {
            outcome = this.resolveEscortMission(mission);
        }
        else if (mission.template.kind === "airCover") {
            outcome = this.resolveAirCoverMission(mission);
        }
        else {
            outcome = this.resolveAirTransportMission(mission);
        }
        mission.outcome = structuredClone(outcome);
        mission.status = "completed";
        mission.turnsRemaining = 0;
        // Record a sortie report for HUD/log consumption. The reporter derives extra metrics from the outcome meta.
        this.recordAirMissionReport(mission, { outcome: outcome, event: "resolved" });
        if (outcome.refitRequired) {
            this.enqueueAirMissionRefit(mission);
        }
        else {
            this.clearAirMissionAssignment(mission);
        }
    };
    GameEngine.prototype.refreshStrikeTargetHex = function (mission, maxFollowDistanceHex) {
        if (mission.template.kind !== "strike") {
            return;
        }
        if (!mission.targetUnitKey || !mission.targetHex) {
            return;
        }
        var opponentFaction = mission.faction === "Player" ? "Bot" : "Player";
        var targetLookup = this.lookupUnitBySquadronId(mission.targetUnitKey, opponentFaction);
        if (!targetLookup) {
            return;
        }
        var candidateHex = targetLookup.unit.hex;
        if ((0, Hex_1.hexDistance)(mission.targetHex, candidateHex) > maxFollowDistanceHex) {
            return;
        }
        var attackerLookup = this.lookupUnitBySquadronId(mission.unitKey, mission.faction);
        var attackerUnit = attackerLookup === null || attackerLookup === void 0 ? void 0 : attackerLookup.unit;
        if (!attackerUnit) {
            return;
        }
        var attackerDefinition = this.getUnitDefinition(attackerUnit.type);
        var profile = attackerDefinition.airSupport;
        if (profile) {
            var originHex = mission.originHexKey ? GameEngine.parseAxialKey(mission.originHexKey) : attackerUnit.hex;
            try {
                this.assertAirMissionRange(profile, originHex, candidateHex);
            }
            catch (_a) {
                return;
            }
        }
        mission.targetHex = structuredClone(candidateHex);
    };
    /** Resolves a strike mission by running the standard combat math against the target hex. */
    GameEngine.prototype.resolveAirStrikeMission = function (mission) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j;
        if (!mission.targetHex) {
            return {
                type: "strike",
                result: "aborted",
                details: "Strike mission scrubbed because no target hex was supplied.",
                refitRequired: false
            };
        }
        var attackerPlacements = mission.faction === "Player" ? this.playerPlacements : this.botPlacements;
        var defenderPlacements = mission.faction === "Player" ? this.botPlacements : this.playerPlacements;
        // Look up the attacker by its stable squadronId (unitId) instead of hex key.
        // This allows multiple squadrons at the same base to each have active missions.
        var attackerLookup = this.lookupUnitBySquadronId(mission.unitKey, mission.faction);
        if (!attackerLookup) {
            return {
                type: "strike",
                result: "aborted",
                details: "Assigned squadron was not found when the strike resolved.",
                refitRequired: false
            };
        }
        var attacker = attackerLookup.unit, attackerHexKey = attackerLookup.hexKey;
        var attackerDefinition = this.getUnitDefinition(attacker.type);
        if (!this.isAircraft(attackerDefinition)) {
            return {
                type: "strike",
                result: "aborted",
                details: "Only aircraft can execute strike missions.",
                refitRequired: false
            };
        }
        this.refreshStrikeTargetHex(mission, 6);
        var defenderKey = (0, Hex_1.axialKey)(mission.targetHex);
        var defender = defenderPlacements.get(defenderKey);
        if (!defender) {
            return {
                type: "strike",
                result: "partial",
                details: "Strike package reached the objective but found no enemy forces to attack.",
                refitRequired: true
            };
        }
        var defenderDefinition = this.getUnitDefinition(defender.type);
        var attackerBefore = structuredClone(attacker);
        var defenderBefore = structuredClone(defender);
        var opponentFaction = mission.faction === "Player" ? "Bot" : "Player";
        // === FLAK ENGAGEMENT: Ground AA intercepts before CAP ===
        var flakUnits = this.findAllActiveFlakUnitsForHex(opponentFaction, mission.targetHex);
        var flakAttrition = 0;
        if (flakUnits.length > 0) {
            var flakInterceptorsForEvent = [];
            // Build event list for visual playback
            for (var _i = 0, flakUnits_1 = flakUnits; _i < flakUnits_1.length; _i++) {
                var flakEntry = flakUnits_1[_i];
                flakInterceptorsForEvent.push({
                    faction: opponentFaction,
                    unitKey: this.getSquadronId(flakEntry.unit),
                    unitType: flakEntry.unit.type,
                    hex: structuredClone(flakEntry.unit.hex)
                });
            }
            // Track bomber state as it takes sequential flak damage
            var bomberStrengthBeforeFlak = attackerBefore.strength;
            var currentBomber = (_a = attackerPlacements.get(attackerHexKey)) !== null && _a !== void 0 ? _a : attacker;
            var bomberDestroyedByFlak = false;
            for (var _k = 0, flakUnits_2 = flakUnits; _k < flakUnits_2.length; _k++) {
                var flakEntry = flakUnits_2[_k];
                if (currentBomber.strength <= 0)
                    break; // Already destroyed
                var flakReq = this.buildMissionAttackRequest(opponentFaction, flakEntry.unit, currentBomber);
                if (!flakReq)
                    continue;
                // Ground-based AA has severe accuracy penalty against fast-moving, distant aircraft
                var flakResult = (0, Combat_1.resolveAttack)(flakReq);
                var flakDef = this.getUnitDefinition(flakEntry.unit.type);
                if (this.hasAntiAirCapability(flakDef) && this.isAircraft(attackerDefinition)) {
                    // Apply 75% accuracy reduction for ground AA vs aircraft (small, fast, distant targets)
                    flakResult = __assign(__assign({}, flakResult), { accuracy: flakResult.accuracy * 0.25, expectedHits: flakResult.expectedHits * 0.25, expectedDamage: flakResult.expectedDamage * 0.25, expectedSuppression: flakResult.expectedSuppression * 0.25 });
                }
                var suffered = Math.max(0, Math.round(flakResult.expectedDamage));
                var updatedBomber = structuredClone(currentBomber);
                updatedBomber.strength = Math.max(0, updatedBomber.strength - suffered);
                // Record engagement and consume ammo
                this.recordFlakEngagement(opponentFaction, flakEntry.unit, flakEntry.hexKey);
                attackerPlacements.set(attackerHexKey, updatedBomber);
                if (mission.faction === "Player") {
                    this.syncPlayerStrength(updatedBomber.hex, updatedBomber.strength);
                }
                else {
                    this.syncBotStrength(updatedBomber.hex, updatedBomber.strength);
                }
                currentBomber = updatedBomber;
                flakAttrition += suffered;
                if (updatedBomber.strength <= 0) {
                    attackerPlacements.delete(attackerHexKey);
                    if (mission.faction === "Player") {
                        this.removeSupplyEntryFor(attacker.hex);
                    }
                    else {
                        this.removeBotSupplyEntryFor(attacker.hex);
                    }
                    this.invalidateRosterCache();
                    bomberDestroyedByFlak = true;
                    break;
                }
            }
            this.pendingAirEngagements.push({
                type: "flak",
                missionId: mission.id,
                location: structuredClone(mission.targetHex),
                bomber: {
                    faction: mission.faction,
                    unitKey: mission.unitKey,
                    unitType: mission.unitType,
                    strength: bomberStrengthBeforeFlak
                },
                interceptors: flakInterceptorsForEvent,
                escorts: [],
                flakDamage: flakAttrition,
                bomberStrengthBefore: bomberStrengthBeforeFlak,
                bomberStrengthAfter: Math.max(0, currentBomber.strength),
                bomberDestroyed: bomberDestroyedByFlak
            });
            if (bomberDestroyedByFlak) {
                return {
                    type: "strike",
                    result: "destroyed",
                    details: "Strike package was destroyed by ground-based anti-aircraft fire before reaching the target.",
                    refitRequired: true,
                    meta: {
                        flakAttrition: attackerBefore.strength,
                        capIntercepts: 0,
                        escortsEngaged: 0,
                        escortsWins: 0,
                        bomberAttrition: 0
                    }
                };
            }
        }
        // Interception: hostile air cover over the objective may engage the strike package before ordnance release.
        // Collect all eligible CAP flights covering the target hex (limit: 1 interception per CAP per resolution).
        var capMissions = this.findAllActiveAirCoverForHex(opponentFaction, defenderKey).filter(function (m) { return m.interceptions < 1; });
        // Collect all eligible friendly escorts protecting this bomber (limit: 1 engagement per escort per resolution).
        var escortMissions = this.findAllActiveEscortsForUnit(mission.faction, mission.unitKey).filter(function (m) { return m.interceptions < 1; });
        // Engagement metrics for reporting
        var escortsEngaged = 0;
        var escortsWins = 0;
        var capIntercepts = 0;
        var bomberAttrition = 0;
        var interceptorAttrition = 0;
        var escortAttrition = 0;
        var interceptorKills = 0;
        if (capMissions.length > 0) {
            var interceptorsForEvent = [];
            var escortsForEvent = [];
            // Build event lists using current unit types (omit missing units gracefully)
            for (var _l = 0, capMissions_1 = capMissions; _l < capMissions_1.length; _l++) {
                var cap = capMissions_1[_l];
                var capLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
                if (capLookup) {
                    interceptorsForEvent.push({
                        faction: opponentFaction,
                        unitKey: cap.unitKey,
                        unitType: capLookup.unit.type,
                        strength: capLookup.unit.strength
                    });
                }
            }
            for (var _m = 0, escortMissions_1 = escortMissions; _m < escortMissions_1.length; _m++) {
                var em = escortMissions_1[_m];
                var escortLookup = this.lookupUnitBySquadronId(em.unitKey, mission.faction);
                if (escortLookup) {
                    escortsForEvent.push({
                        faction: mission.faction,
                        unitKey: em.unitKey,
                        unitType: escortLookup.unit.type,
                        strength: escortLookup.unit.strength
                    });
                }
            }
            // Step 1: Escorts engage CAP first (one escort per CAP where available)
            for (var i = 0; i < capMissions.length; i++) {
                var cap = capMissions[i];
                var capLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
                if (!capLookup) {
                    continue;
                }
                var capUnit = capLookup.unit, capHexKey = capLookup.hexKey;
                var escort = escortMissions.find(function (e) { return e.interceptions < 1; });
                if (!escort) {
                    continue;
                }
                var escortLookup = this.lookupUnitBySquadronId(escort.unitKey, mission.faction);
                if (!escortLookup) {
                    continue;
                }
                var escortUnit = escortLookup.unit;
                var escortReq = this.buildMissionAttackRequest(mission.faction, escortUnit, capUnit);
                if (!escortReq) {
                    continue;
                }
                escortsEngaged += 1;
                var escortResult = (0, Combat_1.resolveAttack)(escortReq);
                var escortDef = this.getUnitDefinition(escortUnit.type);
                var capDef = this.getUnitDefinition(capUnit.type);
                var escortIsBomber = this.isBomber(escortDef);
                if (this.isAircraft(escortDef) && !escortIsBomber && this.isAircraft(capDef)) {
                    escortResult = __assign(__assign({}, escortResult), { damagePerHit: escortResult.damagePerHit * 4, expectedDamage: escortResult.expectedDamage * 4, expectedSuppression: escortResult.expectedSuppression * 4 });
                }
                var inflicted_1 = Math.max(0, Math.round(escortResult.expectedDamage));
                interceptorAttrition += inflicted_1;
                this.addMissionAirCombatInflicted(escort, inflicted_1);
                this.addMissionAirCombatTaken(cap, inflicted_1);
                var updatedCap = structuredClone(capUnit);
                updatedCap.strength = Math.max(0, updatedCap.strength - inflicted_1);
                // Spend fighter ammo and count the engagement for the escort.
                var escortUnitId = this.getSquadronId(escortUnit);
                this.spendAircraftAmmo(mission.faction, escortUnitId, true);
                escort.interceptions += 1;
                if (opponentFaction === "Player") {
                    this.playerPlacements.set(capHexKey, updatedCap);
                    this.syncPlayerStrength(updatedCap.hex, updatedCap.strength);
                }
                else {
                    this.botPlacements.set(capHexKey, updatedCap);
                    this.syncBotStrength(updatedCap.hex, updatedCap.strength);
                }
                if (updatedCap.strength <= 0) {
                    escortsWins += 1;
                    interceptorKills += 1;
                    this.addMissionAirCombatInflicted(escort, 0, 1);
                    if (opponentFaction === "Player") {
                        this.playerPlacements.delete(capHexKey);
                        this.removeSupplyEntryFor(capUnit.hex);
                    }
                    else {
                        this.botPlacements.delete(capHexKey);
                        this.removeBotSupplyEntryFor(capUnit.hex);
                    }
                    // Mark CAP as having consumed its interception opportunity even if destroyed.
                    cap.interceptions += 1;
                }
            }
            // Step 2: Any surviving CAP engages the bomber (sequentially)
            // Track bomber state as it may suffer multiple engagements.
            var bomberStrengthBeforeCap = (_c = (_b = attackerPlacements.get(attackerHexKey)) === null || _b === void 0 ? void 0 : _b.strength) !== null && _c !== void 0 ? _c : attackerBefore.strength;
            var currentBomber = (_d = attackerPlacements.get(attackerHexKey)) !== null && _d !== void 0 ? _d : attacker;
            var bomberDestroyedByCap = false;
            for (var _o = 0, capMissions_2 = capMissions; _o < capMissions_2.length; _o++) {
                var cap = capMissions_2[_o];
                if (cap.interceptions >= 1) {
                    continue; // this CAP already spent its interception
                }
                var liveCapUnit = (_e = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction)) === null || _e === void 0 ? void 0 : _e.unit;
                if (!liveCapUnit || currentBomber.strength <= 0) {
                    continue;
                }
                var capReq = this.buildMissionAttackRequest(opponentFaction, liveCapUnit, currentBomber);
                if (!capReq) {
                    continue;
                }
                var capResult = (0, Combat_1.resolveAttack)(capReq);
                var capDef = this.getUnitDefinition(liveCapUnit.type);
                if (this.isAircraft(capDef) && !this.isBomber(capDef) && this.isAircraft(attackerDefinition)) {
                    capResult = __assign(__assign({}, capResult), { damagePerHit: capResult.damagePerHit * 4, expectedDamage: capResult.expectedDamage * 4, expectedSuppression: capResult.expectedSuppression * 4 });
                }
                var suffered = Math.max(0, Math.round(capResult.expectedDamage));
                bomberAttrition += suffered;
                this.addMissionAirCombatInflicted(cap, suffered, 0);
                var updatedBomber = structuredClone(currentBomber);
                updatedBomber.strength = Math.max(0, updatedBomber.strength - suffered);
                // Spend fighter ammo for CAP and record interception.
                var capUnitId = this.getSquadronId(liveCapUnit);
                this.spendAircraftAmmo(opponentFaction, capUnitId, true);
                cap.interceptions += 1;
                capIntercepts += 1;
                attackerPlacements.set(attackerHexKey, updatedBomber);
                if (mission.faction === "Player") {
                    this.syncPlayerStrength(updatedBomber.hex, updatedBomber.strength);
                }
                else {
                    this.syncBotStrength(updatedBomber.hex, updatedBomber.strength);
                }
                currentBomber = updatedBomber;
                if (updatedBomber.strength <= 0) {
                    this.addMissionAirCombatInflicted(cap, 0, 1);
                    attackerPlacements.delete(attackerHexKey);
                    if (mission.faction === "Player") {
                        this.removeSupplyEntryFor(attacker.hex);
                    }
                    else {
                        this.removeBotSupplyEntryFor(attacker.hex);
                    }
                    this.invalidateRosterCache();
                    bomberDestroyedByCap = true;
                    break;
                }
            }
            // Reconcile with the post-engagement snapshot so aggregate reporting stays exact.
            bomberAttrition = Math.max(0, attackerBefore.strength - ((_g = (_f = attackerPlacements.get(attackerHexKey)) === null || _f === void 0 ? void 0 : _f.strength) !== null && _g !== void 0 ? _g : attackerBefore.strength));
            this.pendingAirEngagements.push({
                type: "airToAir",
                missionId: mission.id,
                location: structuredClone(mission.targetHex),
                bomber: {
                    faction: mission.faction,
                    unitKey: mission.unitKey,
                    unitType: mission.unitType,
                    strength: bomberStrengthBeforeCap
                },
                interceptors: interceptorsForEvent,
                escorts: escortsForEvent,
                bomberStrengthBefore: bomberStrengthBeforeCap,
                bomberStrengthAfter: (_j = (_h = attackerPlacements.get(attackerHexKey)) === null || _h === void 0 ? void 0 : _h.strength) !== null && _j !== void 0 ? _j : 0,
                bomberDestroyed: bomberDestroyedByCap,
                interceptorAttrition: interceptorAttrition,
                interceptorKills: interceptorKills,
                escortAttrition: escortAttrition
            });
            if (bomberDestroyedByCap) {
                return {
                    type: "strike",
                    result: "destroyed",
                    details: "Strike package was intercepted and destroyed before reaching the target.",
                    refitRequired: true,
                    meta: {
                        capIntercepts: capIntercepts,
                        capKills: 1,
                        escortsEngaged: escortsEngaged,
                        escortsWins: escortsWins,
                        bomberAttrition: attackerBefore.strength,
                        interceptorAttrition: interceptorAttrition,
                        interceptorKills: interceptorKills,
                        escortAttrition: escortAttrition
                    }
                };
            }
        }
        var request = this.buildAttackRequest(attacker, defender, mission.faction, opponentFaction, { allowBomberAirAttack: true });
        if (!request) {
            request = this.buildMissionAttackRequest(mission.faction, attacker, defender);
        }
        if (!request) {
            // Escort/CAP attrition may have already mutated placements (e.g., CAP destroyed), so ensure UI snapshots rebuild.
            this.invalidateRosterCache();
            return {
                type: "strike",
                result: "aborted",
                details: "Strike geometry could not be established, so ordnance was not released.",
                refitRequired: true
            };
        }
        var attackResult = (0, Combat_1.resolveAttack)(request);
        var attackerIsBomber = this.isBomber(attackerDefinition);
        var defenderIsAircraft = this.isAircraft(defenderDefinition);
        if (attackerIsBomber && !defenderIsAircraft) {
            var boostedDamage = attackResult.expectedDamage * 10;
            attackResult = __assign(__assign({}, attackResult), { damagePerHit: attackResult.damagePerHit * 10, expectedDamage: boostedDamage, expectedSuppression: attackResult.expectedSuppression * 10 });
        }
        else if (this.isAircraft(attackerDefinition) && !attackerIsBomber && defenderIsAircraft) {
            var dogfightDamage = attackResult.expectedDamage * 4;
            attackResult = __assign(__assign({}, attackResult), { damagePerHit: attackResult.damagePerHit * 4, expectedDamage: dogfightDamage, expectedSuppression: attackResult.expectedSuppression * 4 });
        }
        var inflicted = Math.max(0, attackerIsBomber && !defenderIsAircraft
            ? Math.ceil(attackResult.expectedDamage)
            : Math.round(attackResult.expectedDamage));
        var updatedDefender = structuredClone(defender);
        updatedDefender.strength = Math.max(0, updatedDefender.strength - inflicted);
        var defenderDestroyed = updatedDefender.strength <= 0;
        // Aircraft expend one ammo salvo per sortie. Hitting zero shifts them into the refit pipeline.
        // Use the stable squadronId (mission.unitKey) for ammo tracking, but hexKey for placement updates.
        this.spendAircraftAmmo(mission.faction, mission.unitKey, defenderIsAircraft);
        var updatedAttacker = structuredClone(attacker);
        if (typeof updatedAttacker.ammo === "number") {
            updatedAttacker.ammo = Math.max(0, updatedAttacker.ammo - 1);
        }
        attackerPlacements.set(attackerHexKey, updatedAttacker);
        if (mission.faction === "Player") {
            this.syncPlayerAmmo(updatedAttacker.hex, typeof updatedAttacker.ammo === "number" ? updatedAttacker.ammo : 0);
        }
        else {
            this.syncBotAmmo(updatedAttacker.hex, typeof updatedAttacker.ammo === "number" ? updatedAttacker.ammo : 0);
        }
        if (defenderDestroyed) {
            defenderPlacements.delete(defenderKey);
            if (mission.faction === "Player") {
                this.removeBotSupplyEntryFor(mission.targetHex);
            }
            else {
                this.removeSupplyEntryFor(mission.targetHex);
            }
        }
        else {
            defenderPlacements.set(defenderKey, updatedDefender);
            if (mission.faction === "Player") {
                this.syncBotStrength(mission.targetHex, updatedDefender.strength);
            }
            else {
                this.syncPlayerStrength(mission.targetHex, updatedDefender.strength);
            }
        }
        if (mission.faction === "Player") {
            this.recordCombatReport({
                attacker: {
                    unit: attackerBefore,
                    hex: attackerBefore.hex,
                    faction: "Player",
                    strengthBefore: attackerBefore.strength,
                    strengthAfter: updatedAttacker.strength
                },
                defender: {
                    unit: defenderBefore,
                    hex: defenderBefore.hex,
                    faction: "Bot",
                    strengthBefore: defenderBefore.strength,
                    strengthAfter: updatedDefender.strength,
                    destroyed: defenderDestroyed
                },
                attackResult: attackResult,
                retaliationResult: undefined
            });
        }
        else {
            this.recordCombatReport({
                attacker: {
                    unit: defenderBefore,
                    hex: defenderBefore.hex,
                    faction: "Bot",
                    strengthBefore: defenderBefore.strength,
                    strengthAfter: updatedDefender.strength
                },
                defender: {
                    unit: attackerBefore,
                    hex: attackerBefore.hex,
                    faction: "Player",
                    strengthBefore: attackerBefore.strength,
                    strengthAfter: updatedAttacker.strength,
                    destroyed: false
                },
                attackResult: attackResult,
                retaliationResult: undefined
            });
        }
        // Strike missions can resolve outside of direct player interactions; clear cached roster so UI reflects damage immediately.
        this.invalidateRosterCache();
        return {
            type: "strike",
            result: defenderDestroyed ? "success" : inflicted > 0 ? "partial" : "partial",
            details: defenderDestroyed
                ? "Strike destroyed the enemy ".concat(defender.type, " at ").concat(defenderKey, ".")
                : inflicted > 0
                    ? "Strike damaged the enemy ".concat(defender.type, " at ").concat(defenderKey, ", inflicting ").concat(inflicted, "% strength loss.")
                    : "Strike expended ordnance on the enemy ".concat(defender.type, ", but no significant damage was recorded."),
            refitRequired: true,
            meta: {
                flakAttrition: flakAttrition,
                capIntercepts: capIntercepts,
                escortsEngaged: escortsEngaged,
                escortsWins: escortsWins,
                bomberAttrition: bomberAttrition,
                interceptorAttrition: interceptorAttrition,
                interceptorKills: interceptorKills,
                escortAttrition: escortAttrition
            },
            damageInflicted: inflicted,
            defenderDestroyed: defenderDestroyed,
            defenderType: defender.type
        };
    };
    /** Resolves an escort mission by verifying the protected package and recording the sweep. */
    GameEngine.prototype.resolveEscortMission = function (mission) {
        var _a, _b;
        if (!mission.escortTargetUnitKey) {
            return {
                type: "escort",
                result: "aborted",
                details: "Escort flight was cancelled because no strike package was linked to the mission.",
                refitRequired: false
            };
        }
        // Look up the protected unit by its stable squadronId instead of hex key.
        var protectedLookup = this.lookupUnitBySquadronId(mission.escortTargetUnitKey, mission.faction);
        if (!protectedLookup) {
            if (((_a = mission.interceptions) !== null && _a !== void 0 ? _a : 0) > 0) {
                return {
                    type: "escort",
                    result: "success",
                    details: "Escort engaged hostile interceptors while covering the linked strike package.",
                    refitRequired: true,
                    interceptions: mission.interceptions,
                    protectedUnitKey: mission.escortTargetUnitKey,
                    meta: {
                        interceptorAttrition: mission.airCombatDamageInflicted,
                        interceptorKills: mission.airCombatKills,
                        escortAttrition: mission.airCombatDamageTaken
                    }
                };
            }
            return {
                type: "escort",
                result: "aborted",
                details: "Assigned strike package was no longer present, so the escort returned to base.",
                refitRequired: false
            };
        }
        var interceptions = (_b = mission.interceptions) !== null && _b !== void 0 ? _b : 0;
        return {
            type: "escort",
            result: "success",
            details: interceptions > 0
                ? "Escort engaged ".concat(interceptions, " hostile interception").concat(interceptions === 1 ? "" : "s", " while protecting ").concat(protectedLookup.unit.type, ".")
                : "Escort maintained air cover for ".concat(protectedLookup.unit.type, "; no enemy interceptors challenged the route."),
            refitRequired: true,
            interceptions: interceptions,
            protectedUnitKey: mission.escortTargetUnitKey,
            meta: {
                interceptorAttrition: mission.airCombatDamageInflicted,
                interceptorKills: mission.airCombatKills,
                escortAttrition: mission.airCombatDamageTaken
            }
        };
    };
    /** Resolves an air cover patrol by validating the zone and logging the sortie. */
    GameEngine.prototype.resolveAirCoverMission = function (mission) {
        // If no target hex was provided, use the squadron's origin hex (base CAP).
        // This allows interceptors to be assigned to air cover without selecting a specific hex.
        var patrolHex = mission.targetHex;
        if (!patrolHex && mission.originHexKey) {
            patrolHex = GameEngine.parseAxialKey(mission.originHexKey);
        }
        if (!patrolHex) {
            // Fall back to looking up the squadron's current hex if originHexKey is also missing.
            var squadronLookup = this.lookupUnitBySquadronId(mission.unitKey, mission.faction);
            if (squadronLookup) {
                patrolHex = squadronLookup.unit.hex;
            }
        }
        if (!patrolHex) {
            return {
                type: "airCover",
                result: "aborted",
                details: "Air cover patrol was cancelled because no patrol zone could be determined.",
                refitRequired: false
            };
        }
        // CAP is valid even if the patrol zone has no friendly units - it protects the airspace.
        return {
            type: "airCover",
            result: "success",
            details: "Combat air patrol completed over ".concat(this.formatAxial(patrolHex), "; no hostile bombers entered the area."),
            refitRequired: true,
            interceptions: mission.interceptions,
            protectedHex: structuredClone(patrolHex),
            meta: {
                bomberAttrition: mission.airCombatDamageInflicted,
                capKills: mission.airCombatKills,
                interceptorAttrition: mission.airCombatDamageTaken
            }
        };
    };
    /** Resolves an airborne transport mission by consuming an airborne reserve and deploying it at the target hex. */
    GameEngine.prototype.resolveAirTransportMission = function (mission) {
        if (!mission.targetHex) {
            return {
                type: "airTransport",
                result: "aborted",
                details: "Airborne drop was cancelled because no target hex was supplied.",
                refitRequired: false
            };
        }
        // For now, only the player fields modeled airborne reserves.
        if (mission.faction !== "Player") {
            return {
                type: "airTransport",
                result: "aborted",
                details: "Only the player currently fields airborne reserves for transport missions.",
                refitRequired: false
            };
        }
        // Try the target hex first; if occupied, scatter to nearby unoccupied hexes.
        var finalHex = mission.targetHex;
        var scattered = false;
        if (this.playerPlacements.has((0, Hex_1.axialKey)(finalHex)) || this.botPlacements.has((0, Hex_1.axialKey)(finalHex))) {
            // Scatter: find the nearest unoccupied hex within a small radius.
            var scatterHex = this.findNearestUnoccupiedHex(mission.targetHex, 3);
            if (scatterHex) {
                finalHex = scatterHex;
                scattered = true;
            }
            else {
                return {
                    type: "airTransport",
                    result: "aborted",
                    details: "Airborne drop zone and all nearby hexes are occupied; transport returned to base.",
                    refitRequired: false
                };
            }
        }
        var targetKey = (0, Hex_1.axialKey)(finalHex);
        // Locate an airborne detachment in the dedicated airborne reserves pool.
        // Airborne units are separate from ground reserves and loaded at the airbase.
        var reserveIndex = this.airborneReserves.findIndex(function (reserve) { return reserve.allocationKey === "airborneDetachment"; });
        if (reserveIndex < 0) {
            reserveIndex = this.airborneReserves.findIndex(function (reserve) { return reserve.unit.type === "Paratrooper"; });
        }
        var entry = reserveIndex >= 0 ? this.airborneReserves[reserveIndex] : undefined;
        if (!entry) {
            return {
                type: "airTransport",
                result: "aborted",
                details: "No airborne detachments remain in reserves to conduct the drop.",
                refitRequired: false
            };
        }
        var placement = structuredClone(entry.unit);
        placement.hex = structuredClone(mission.targetHex);
        this.playerPlacements.set(targetKey, placement);
        this.updateIdleRegistryFor(targetKey);
        this.playerSupply.push({
            hex: structuredClone(mission.targetHex),
            ammo: placement.ammo,
            fuel: placement.fuel,
            entrench: placement.entrench,
            strength: placement.strength
        });
        // Remove the deployed unit from the airborne reserves pool.
        this.airborneReserves.splice(reserveIndex, 1);
        this.resetPlayerHistoryCheckpoint();
        this.invalidateRosterCache();
        return {
            type: "airTransport",
            result: "success",
            details: scattered
                ? "Airborne detachment scattered to ".concat(targetKey, " (target was occupied).")
                : "Airborne detachment dropped at ".concat(targetKey, "."),
            refitRequired: true,
            droppedUnitType: placement.type,
            droppedHex: structuredClone(finalHex)
        };
    };
    /**
     * Finds the nearest unoccupied hex within a given radius of the target hex.
     * Used for scattering airborne drops when the target is occupied.
     */
    GameEngine.prototype.findNearestUnoccupiedHex = function (center, maxRadius) {
        // Spiral outward from the center to find the nearest unoccupied hex.
        for (var radius = 1; radius <= maxRadius; radius++) {
            var ring = this.getHexRing(center, radius);
            // Shuffle the ring to add some randomness to scattering.
            var shuffled = ring.sort(function () { return Math.random() - 0.5; });
            for (var _i = 0, shuffled_1 = shuffled; _i < shuffled_1.length; _i++) {
                var hex = shuffled_1[_i];
                var key = (0, Hex_1.axialKey)(hex);
                if (!this.playerPlacements.has(key) && !this.botPlacements.has(key)) {
                    // Check that the hex is within map bounds using the scenario dimensions.
                    if (this.isHexInBounds(hex)) {
                        return hex;
                    }
                }
            }
        }
        return null;
    };
    /** Returns the ring of hexes at a given radius from a center hex. */
    GameEngine.prototype.getHexRing = function (center, radius) {
        if (radius === 0)
            return [center];
        var ring = [];
        // Axial direction vectors for the six hex directions.
        var directions = [
            { q: 1, r: 0 }, { q: 0, r: 1 }, { q: -1, r: 1 },
            { q: -1, r: 0 }, { q: 0, r: -1 }, { q: 1, r: -1 }
        ];
        // Start at one corner and walk around the ring.
        var hex = { q: center.q + directions[4].q * radius, r: center.r + directions[4].r * radius };
        for (var i = 0; i < 6; i++) {
            for (var j = 0; j < radius; j++) {
                ring.push({ q: hex.q, r: hex.r });
                hex = { q: hex.q + directions[i].q, r: hex.r + directions[i].r };
            }
        }
        return ring;
    };
    /** Checks if a hex is within the map bounds defined by the scenario. */
    GameEngine.prototype.isHexInBounds = function (hex) {
        // Use the scenario size to determine bounds. Axial coordinates can be negative,
        // so we use a simple heuristic based on reasonable map bounds.
        var _a = this.scenario.size, cols = _a.cols, rows = _a.rows;
        // For odd-r offset hex grids, approximate bounds in axial space.
        // This is a conservative estimate that should work for most map sizes.
        var maxQ = cols;
        var maxR = rows;
        return hex.q >= -maxQ && hex.q <= maxQ && hex.r >= -maxR && hex.r <= maxR;
    };
    /** Builds a guaranteed attack request for mission resolution when LOS shortcuts are required. */
    GameEngine.prototype.buildMissionAttackRequest = function (faction, attacker, defender) {
        var _a;
        var attackerDefinition = this.getUnitDefinition(attacker.type);
        var defenderDefinition = this.getUnitDefinition(defender.type);
        if (!attackerDefinition || !defenderDefinition) {
            return null;
        }
        var attackerState = {
            unit: attackerDefinition,
            strength: attacker.strength,
            experience: attacker.experience,
            general: faction === "Player" ? this.playerSide.general : this.botSide.general
        };
        var defenderState = {
            unit: defenderDefinition,
            strength: defender.strength,
            experience: defender.experience,
            general: faction === "Player" ? this.botSide.general : this.playerSide.general
        };
        return {
            attacker: attackerState,
            defender: defenderState,
            attackerCtx: { hex: structuredClone(attacker.hex) },
            defenderCtx: {
                terrain: (_a = this.terrainAt(defender.hex)) !== null && _a !== void 0 ? _a : this.defaultTerrain(),
                class: defenderDefinition.class,
                facing: defender.facing,
                hex: structuredClone(defender.hex),
                isRushing: false,
                isSpottedOnly: false
            },
            targetFacing: defender.facing,
            isSoftTarget: defenderDefinition.class === "infantry" || defenderDefinition.class === "specialist"
        };
    };
    /** Locate an active escort mission protecting the specified friendly unit key for a faction. */
    GameEngine.prototype.findActiveEscortForUnit = function (faction, unitKey) {
        for (var _i = 0, _a = this.scheduledAirMissions.values(); _i < _a.length; _i++) {
            var mission = _a[_i];
            if (mission.faction !== faction) {
                continue;
            }
            if (missionIsProtectingUnit(mission, unitKey)) {
                return mission;
            }
        }
        return null;
    };
    /** Locate an active CAP mission covering the specified hex key for a faction. */
    GameEngine.prototype.findActiveAirCoverForHex = function (faction, hexKey) {
        var _a;
        return (_a = this.findAllActiveAirCoverForHex(faction, hexKey)[0]) !== null && _a !== void 0 ? _a : null;
    };
    /** Returns all active escort missions protecting the specified friendly unit key for a faction. */
    GameEngine.prototype.findAllActiveEscortsForUnit = function (faction, unitKey) {
        var results = [];
        for (var _i = 0, _a = this.scheduledAirMissions.values(); _i < _a.length; _i++) {
            var mission = _a[_i];
            if (mission.faction !== faction) {
                continue;
            }
            if (missionIsProtectingUnit(mission, unitKey)) {
                results.push(mission);
            }
        }
        return results;
    };
    /** Returns all active CAP missions covering the specified hex key for a faction. */
    GameEngine.prototype.findAllActiveAirCoverForHex = function (faction, hexKey) {
        var _a;
        var interceptHex;
        try {
            interceptHex = GameEngine.parseAxialKey(hexKey);
        }
        catch (_b) {
            return [];
        }
        var results = [];
        for (var _i = 0, _c = this.scheduledAirMissions.values(); _i < _c.length; _i++) {
            var mission = _c[_i];
            if (mission.faction !== faction) {
                continue;
            }
            if (mission.template.kind !== "airCover" || mission.status !== "inFlight") {
                continue;
            }
            var patrolCenter = mission.targetHex ? structuredClone(mission.targetHex) : null;
            if (!patrolCenter && mission.originHexKey) {
                try {
                    patrolCenter = GameEngine.parseAxialKey(mission.originHexKey);
                }
                catch (_d) {
                    patrolCenter = null;
                }
            }
            var capLookup = this.lookupUnitBySquadronId(mission.unitKey, faction);
            var capUnit = (_a = capLookup === null || capLookup === void 0 ? void 0 : capLookup.unit) !== null && _a !== void 0 ? _a : null;
            if (!patrolCenter && capUnit) {
                patrolCenter = structuredClone(capUnit.hex);
            }
            if (!patrolCenter) {
                continue;
            }
            if ((0, Hex_1.hexDistance)(patrolCenter, interceptHex) > GameEngine.AIR_COVER_PATROL_RADIUS_HEX) {
                continue;
            }
            if (!capUnit) {
                continue;
            }
            var capDef = this.getUnitDefinition(capUnit.type);
            if (!this.isAircraft(capDef) || !capDef.airSupport) {
                continue;
            }
            var originHex = null;
            if (mission.originHexKey) {
                try {
                    originHex = GameEngine.parseAxialKey(mission.originHexKey);
                }
                catch (_e) {
                    originHex = null;
                }
            }
            if (!originHex) {
                originHex = structuredClone(capUnit.hex);
            }
            try {
                this.assertAirMissionRange(capDef.airSupport, originHex, interceptHex);
            }
            catch (_f) {
                continue;
            }
            results.push(mission);
        }
        return results;
    };
    /**
     * Returns all sentry ground-based AA units within range of the target hex.
     * Only includes units with "intercept" trait that haven't exceeded engagement limits.
     */
    GameEngine.prototype.findAllActiveFlakUnitsForHex = function (faction, targetHex) {
        var _a, _b;
        var results = [];
        var allUnits = this.getAllUnitsForFaction(faction);
        for (var _i = 0, allUnits_1 = allUnits; _i < allUnits_1.length; _i++) {
            var unit = allUnits_1[_i];
            // Must be on sentry
            if (!unit.onSentry)
                continue;
            // Must have intercept trait
            var definition = this.getUnitDefinition(unit.type);
            if (!((_a = definition === null || definition === void 0 ? void 0 : definition.traits) === null || _a === void 0 ? void 0 : _a.includes("intercept")))
                continue;
            // Must not be aircraft (ground-based AA only)
            if (this.isAircraft(definition))
                continue;
            // Must have ammo
            if (unit.ammo <= 0)
                continue;
            // Must not have exceeded per-turn engagement limit
            var unitId = this.getSquadronId(unit);
            var engagements = (_b = this.aaEngagementsByUnitId.get(unitId)) !== null && _b !== void 0 ? _b : 0;
            if (engagements >= 1)
                continue; // One engagement per turn
            // Must be within range
            var distance = (0, Hex_1.hexDistance)(unit.hex, targetHex);
            if (distance > definition.rangeMax)
                continue;
            if (distance < definition.rangeMin)
                continue;
            results.push({ unit: unit, hexKey: (0, Hex_1.axialKey)(unit.hex) });
        }
        return results;
    };
    /**
     * Checks if a unit definition has anti-air capability (intercept trait, not aircraft).
     */
    GameEngine.prototype.hasAntiAirCapability = function (definition) {
        var _a;
        return ((_a = definition === null || definition === void 0 ? void 0 : definition.traits) === null || _a === void 0 ? void 0 : _a.includes("intercept")) === true &&
            this.isAircraft(definition) === false;
    };
    /** Resets AA engagement counters at turn start */
    GameEngine.prototype.clearFlakEngagementsFor = function (faction) {
        var _this = this;
        this.getAllUnitsForFaction(faction).forEach(function (unit) {
            var unitId = _this.getSquadronId(unit);
            _this.aaEngagementsByUnitId.delete(unitId);
        });
    };
    /** Increments engagement counter and breaks sentry for AA unit */
    GameEngine.prototype.recordFlakEngagement = function (faction, unit, hexKey) {
        var _a;
        var unitId = this.getSquadronId(unit);
        var current = (_a = this.aaEngagementsByUnitId.get(unitId)) !== null && _a !== void 0 ? _a : 0;
        this.aaEngagementsByUnitId.set(unitId, current + 1);
        // Break sentry immediately and consume ammo
        var updatedUnit = structuredClone(unit);
        updatedUnit.onSentry = false;
        updatedUnit.ammo = Math.max(0, updatedUnit.ammo - 1);
        if (faction === "Player") {
            this.playerPlacements.set(hexKey, updatedUnit);
            this.syncPlayerAmmo(updatedUnit.hex, updatedUnit.ammo);
        }
        else if (faction === "Bot") {
            this.botPlacements.set(hexKey, updatedUnit);
            this.syncBotAmmo(updatedUnit.hex, updatedUnit.ammo);
        }
        this.invalidateRosterCache();
    };
    /** Flags the assigned squadron for refit and schedules the timer based on its air support profile. */
    GameEngine.prototype.enqueueAirMissionRefit = function (mission) {
        var _a;
        var definition = this.getUnitDefinition(mission.unitType);
        var profile = definition.airSupport;
        var lookup = this.lookupUnitBySquadronId(mission.unitKey, mission.faction);
        var unit = (_a = lookup === null || lookup === void 0 ? void 0 : lookup.unit) !== null && _a !== void 0 ? _a : null;
        var squadronId = unit ? this.getSquadronId(unit) : mission.unitKey;
        if (unit) {
            this.getAircraftAmmoState(mission.faction, squadronId, definition);
        }
        this.markAircraftNeedsRearm(mission.faction, squadronId);
        if (!profile || profile.refitTurns <= 0) {
            this.finishMissionRefit(mission.id, squadronId, mission.faction);
            return;
        }
        // Log refit start event for sortie ledger so HUD/UX can reflect recovery windows.
        this.recordAirMissionReport(mission, { event: "refitStarted", notes: ["Squadron entered refit cycle"] });
        this.airMissionRefitTimers.set(squadronId, {
            missionId: mission.id,
            faction: mission.faction,
            remaining: profile.refitTurns
        });
    };
    /** Completes refit for a squadron, restoring ammo and clearing mission assignment locks. */
    GameEngine.prototype.finishMissionRefit = function (missionId, unitKey, faction) {
        var _a;
        var mission = this.scheduledAirMissions.get(missionId);
        if (!mission) {
            this.airMissionAssignmentsByUnit.delete(unitKey);
            return;
        }
        var registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
        var lookup = this.lookupUnitBySquadronId(unitKey, faction);
        var unit = (_a = lookup === null || lookup === void 0 ? void 0 : lookup.unit) !== null && _a !== void 0 ? _a : null;
        if (unit) {
            var definition = this.getUnitDefinition(unit.type);
            var refreshed = this.createInitialAircraftAmmo(definition);
            registry.set(unitKey, refreshed);
            this.applyAircraftRepair(faction, unitKey, unit);
        }
        else {
            registry.delete(unitKey);
        }
        this.airMissionAssignmentsByUnit.delete(unitKey);
        // Emit a refit-completed report so UI can surface a readiness ping.
        var finishedMission = this.scheduledAirMissions.get(missionId);
        if (finishedMission) {
            this.recordAirMissionReport(finishedMission, { event: "refitCompleted", notes: ["Squadron refit complete; ready for tasking"] });
        }
    };
    /**
     * Returns the current depot stockpile totals derived from the faction supply state inventory.
     */
    GameEngine.prototype.getFactionStockpileTotals = function (faction) {
        var state = this.supplyStateByFaction[faction];
        return {
            ammo: Math.max(0, Math.round(state.inventory.ammo.current)),
            fuel: Math.max(0, Math.round(state.inventory.fuel.current)),
            rations: Math.max(0, Math.round(state.inventory.rations.current)),
            parts: Math.max(0, Math.round(state.inventory.parts.current))
        };
    };
    /**
     * Applies production gains and delivers any pending shipments slated for the active turn before
     * any depot issues or convoy loading are evaluated.
     */
    GameEngine.prototype.advanceFactionSupplyState = function (faction) {
        var _this = this;
        var state = this.supplyStateByFaction[faction];
        var arrivals = (0, SupplyState_1.advanceShipments)(state, this._turnNumber);
        arrivals.forEach(function (shipment) { return (0, SupplyState_1.applyShipment)(state, shipment, _this._turnNumber); });
        var production = (0, SupplyState_1.accumulateProduction)(state, state.lastUpdatedTurn, this._turnNumber);
        production.forEach(function (shipment) { return (0, SupplyState_1.applyShipment)(state, shipment, _this._turnNumber); });
        state.lastUpdatedTurn = this._turnNumber;
    };
    GameEngine.prototype.isSupplyTruckType = function (unitType) {
        return unitType === "Supply_Truck";
    };
    GameEngine.prototype.isAutomatedPlayerUnit = function (unit) {
        return this.isSupplyTruckType(unit.type) || unit.controlledBy === "AI";
    };
    GameEngine.prototype.getPlacementMapForFaction = function (faction) {
        if (faction === "Player") {
            return this.playerPlacements;
        }
        if (faction === "Bot") {
            return this.botPlacements;
        }
        return this.allyPlacements;
    };
    GameEngine.prototype.getHostileFactionsFor = function (faction) {
        return faction === "Bot" ? ["Player", "Ally"] : ["Bot"];
    };
    GameEngine.prototype.forEachOccupiedHexKeyForFaction = function (faction, visitor) {
        this.getPlacementMapForFaction(faction).forEach(function (_unit, key) { return visitor(key); });
        this.getPlacementOverflowMapForFaction(faction).forEach(function (_units, key) { return visitor(key); });
    };
    GameEngine.prototype.buildConvoyBlockingOccupancySet = function (faction) {
        var _this = this;
        var blocked = new Set();
        this.getHostileFactionsFor(faction).forEach(function (hostileFaction) {
            _this.forEachOccupiedHexKeyForFaction(hostileFaction, function (key) { return blocked.add(key); });
        });
        return blocked;
    };
    GameEngine.prototype.isHexBlockedForConvoy = function (hex, faction) {
        var _this = this;
        return this.getHostileFactionsFor(faction)
            .some(function (hostileFaction) { return _this.getUnitsAtHexForFaction(hex, hostileFaction).length > 0; });
    };
    GameEngine.prototype.getSupplyMirrorForFaction = function (faction) {
        if (faction === "Player") {
            return this.playerSupply;
        }
        if (faction === "Bot") {
            return this.botSupply;
        }
        return this.allySupply;
    };
    GameEngine.prototype.getSupplyTruckStateMap = function (faction) {
        return this.supplyTruckStateByFaction[faction];
    };
    GameEngine.prototype.getSupplySourceHexes = function (faction) {
        var sources = [];
        if (faction === "Player" && this._baseCamp) {
            sources.push(structuredClone(this._baseCamp.hex));
        }
        var side = faction === "Player" ? this.playerSide : faction === "Bot" ? this.botSide : this.allySide;
        if (side === null || side === void 0 ? void 0 : side.hq) {
            sources.push(structuredClone(side.hq));
        }
        return sources;
    };
    GameEngine.prototype.isHexWithinSupplySourceRadius = function (hex, faction) {
        return this.getSupplySourceHexes(faction)
            .some(function (source) { return (0, Hex_1.hexDistance)(source, hex) <= balance_1.supply.convoy.sourceRadius; });
    };
    GameEngine.prototype.getSupplyStateForHex = function (faction, hex, unitId) {
        var _a;
        var mirror = this.getSupplyMirrorForFaction(faction);
        if (unitId) {
            var byUnitId = mirror.find(function (entry) { return entry.unitId === unitId; });
            if (byUnitId) {
                return byUnitId;
            }
        }
        var key = (0, Hex_1.axialKey)(hex);
        return (_a = mirror.find(function (entry) { return (0, Hex_1.axialKey)(entry.hex) === key; })) !== null && _a !== void 0 ? _a : null;
    };
    GameEngine.prototype.getDisplayUnitLabel = function (unit) {
        if (this.isSupplyTruckType(unit.type)) {
            return "Supply Convoy";
        }
        return String(unit.type).replace(/_/g, " ");
    };
    GameEngine.prototype.getDefaultSupplyPriority = function (definition) {
        if (definition.class === "tank" || definition.class === "artillery") {
            return "high";
        }
        if (definition.class === "recon") {
            return "low";
        }
        return "normal";
    };
    GameEngine.prototype.getSupplyPriorityForUnit = function (unit, definition) {
        if (unit.unitId && this.supplyPriorityByUnitId.has(unit.unitId)) {
            return this.supplyPriorityByUnitId.get(unit.unitId);
        }
        return this.getDefaultSupplyPriority(definition !== null && definition !== void 0 ? definition : this.getUnitDefinition(unit.type));
    };
    GameEngine.prototype.getSupplyPriorityWeight = function (priority) {
        switch (priority) {
            case "critical":
                return 400;
            case "high":
                return 240;
            case "normal":
                return 120;
            case "low":
            default:
                return 0;
        }
    };
    GameEngine.prototype.getSupplyDemandPriorityRank = function (entry) {
        switch (entry.priority) {
            case "critical":
                return 4;
            case "high":
                return 3;
            case "normal":
                return 2;
            case "low":
            default:
                return 1;
        }
    };
    GameEngine.prototype.getConvoyServiceHistoryMap = function (faction) {
        return this.convoyServiceHistoryByFaction[faction];
    };
    GameEngine.prototype.getConvoyServiceSequence = function (faction, unitId) {
        var _a;
        var normalized = this.normalizeUnitId(unitId);
        if (!normalized) {
            return 0;
        }
        return (_a = this.getConvoyServiceHistoryMap(faction).get(normalized)) !== null && _a !== void 0 ? _a : 0;
    };
    GameEngine.prototype.recordConvoyService = function (faction, unitId) {
        var _a;
        var normalized = this.normalizeUnitId(unitId);
        if (!normalized) {
            return;
        }
        var nextSequence = ((_a = this.convoyServiceSequenceByFaction[faction]) !== null && _a !== void 0 ? _a : 0) + 1;
        this.convoyServiceSequenceByFaction[faction] = nextSequence;
        this.getConvoyServiceHistoryMap(faction).set(normalized, nextSequence);
    };
    GameEngine.prototype.reserveConvoyAssignment = function (truckState, target, reservations, ammoToReserve, fuelToReserve) {
        var unitId = this.normalizeUnitId(target.unit.unitId);
        if (!unitId) {
            return false;
        }
        var reservation = reservations.get(unitId);
        if (!reservation) {
            reservation = {
                unitId: unitId,
                ammoReserved: 0,
                fuelReserved: 0,
                assignedTrucks: []
            };
            reservations.set(unitId, reservation);
        }
        reservation.ammoReserved += ammoToReserve;
        reservation.fuelReserved += fuelToReserve;
        if (!reservation.assignedTrucks.includes(truckState.unitId)) {
            reservation.assignedTrucks.push(truckState.unitId);
        }
        truckState.assignedUnitId = unitId;
        target.assignmentCount += 1;
        truckState.status = "delivering";
        return true;
    };
    GameEngine.prototype.compareConvoyReachableTargets = function (faction, left, right) {
        var _a, _b;
        var priorityDiff = this.getSupplyDemandPriorityRank(right.entry) - this.getSupplyDemandPriorityRank(left.entry);
        if (priorityDiff !== 0) {
            return priorityDiff;
        }
        var mismatchDiff = left.cargoMismatchPenalty - right.cargoMismatchPenalty;
        if (mismatchDiff !== 0) {
            return mismatchDiff;
        }
        var assignmentDiff = left.entry.assignmentCount - right.entry.assignmentCount;
        if (assignmentDiff !== 0) {
            return assignmentDiff;
        }
        var leftServiceSequence = this.getConvoyServiceSequence(faction, left.entry.unit.unitId);
        var rightServiceSequence = this.getConvoyServiceSequence(faction, right.entry.unit.unitId);
        if (leftServiceSequence !== rightServiceSequence) {
            return leftServiceSequence - rightServiceSequence;
        }
        var leftNeed = left.need.ammoNeed + left.need.fuelNeed;
        var rightNeed = right.need.ammoNeed + right.need.fuelNeed;
        if (leftNeed !== rightNeed) {
            return rightNeed - leftNeed;
        }
        var costDiff = left.plan.summary.cost - right.plan.summary.cost;
        if (costDiff !== 0) {
            return costDiff;
        }
        var leftUnitId = (_a = this.normalizeUnitId(left.entry.unit.unitId)) !== null && _a !== void 0 ? _a : "".concat(left.entry.unit.type, "@").concat((0, Hex_1.axialKey)(left.entry.unit.hex));
        var rightUnitId = (_b = this.normalizeUnitId(right.entry.unit.unitId)) !== null && _b !== void 0 ? _b : "".concat(right.entry.unit.type, "@").concat((0, Hex_1.axialKey)(right.entry.unit.hex));
        return leftUnitId.localeCompare(rightUnitId);
    };
    GameEngine.prototype.shouldRotateConvoyAssignment = function (faction, currentEntry, bestEntry) {
        if (!currentEntry || !bestEntry) {
            return false;
        }
        var currentUnitId = this.normalizeUnitId(currentEntry.unit.unitId);
        var bestUnitId = this.normalizeUnitId(bestEntry.unit.unitId);
        if (!currentUnitId || !bestUnitId || currentUnitId === bestUnitId) {
            return false;
        }
        var currentPriority = this.getSupplyDemandPriorityRank(currentEntry);
        var bestPriority = this.getSupplyDemandPriorityRank(bestEntry);
        if (bestPriority > currentPriority) {
            return true;
        }
        if (bestPriority < currentPriority) {
            return false;
        }
        return this.getConvoyServiceSequence(faction, currentUnitId) > 0;
    };
    GameEngine.prototype.ensureSupplyTruckStatesForFaction = function (faction) {
        var _this = this;
        var placements = this.getPlacementMapForFaction(faction);
        var stateMap = this.getSupplyTruckStateMap(faction);
        var liveIds = new Set();
        placements.forEach(function (unit) {
            if (!_this.isSupplyTruckType(unit.type)) {
                return;
            }
            var unitId = _this.ensureUnitId(unit);
            liveIds.add(unitId);
            if (!stateMap.has(unitId)) {
                stateMap.set(unitId, {
                    unitId: unitId,
                    ammoCargo: 0,
                    fuelCargo: 0,
                    status: "idle",
                    assignedUnitId: null
                });
            }
        });
        Array.from(stateMap.keys()).forEach(function (unitId) {
            if (!liveIds.has(unitId)) {
                stateMap.delete(unitId);
            }
        });
    };
    GameEngine.prototype.loadSupplyTruckFromDepot = function (faction, supplyState, truck, truckSupplyState, truckState) {
        var _a;
        var ammoNeed = Math.max(0, balance_1.supply.convoy.ammoCapacity - truckState.ammoCargo);
        var ammoLoad = Math.min(ammoNeed, Math.max(0, supplyState.inventory.ammo.current));
        if (ammoLoad > 0) {
            this.trackSupplyConsumption(faction, "ammo", ammoLoad, "Supply convoy loadout");
            truckState.ammoCargo = Number((truckState.ammoCargo + ammoLoad).toFixed(2));
        }
        var fuelNeed = Math.max(0, balance_1.supply.convoy.fuelCapacity - truckState.fuelCargo);
        var fuelLoad = Math.min(fuelNeed, Math.max(0, supplyState.inventory.fuel.current));
        if (fuelLoad > 0) {
            this.trackSupplyConsumption(faction, "fuel", fuelLoad, "Supply convoy loadout");
            truckState.fuelCargo = Number((truckState.fuelCargo + fuelLoad).toFixed(2));
        }
        var truckDefinition = this.getUnitDefinition(truck.type);
        var drivetrainFuelNeed = Math.max(0, ((_a = truckDefinition.fuel) !== null && _a !== void 0 ? _a : 0) - truckSupplyState.fuel);
        var drivetrainFuelLoad = Math.min(drivetrainFuelNeed, Math.max(0, supplyState.inventory.fuel.current));
        if (drivetrainFuelLoad > 0) {
            this.trackSupplyConsumption(faction, "fuel", drivetrainFuelLoad, "Supply convoy refuel");
            truckSupplyState.fuel = Number((truckSupplyState.fuel + drivetrainFuelLoad).toFixed(2));
            truck.fuel = truckSupplyState.fuel;
        }
        if (ammoLoad > 0 || fuelLoad > 0) {
            truckState.status = "loading";
        }
    };
    GameEngine.prototype.applyDirectDepotResupply = function (faction, supplyState, unit, state, definition) {
        var _a, _b;
        var ammoCapacity = Math.max(0, ((_a = definition.ammo) !== null && _a !== void 0 ? _a : 0) - state.ammo);
        var ammoTransfer = Math.min(ammoCapacity, Math.max(0, supplyState.inventory.ammo.current));
        if (ammoTransfer > 0) {
            this.trackSupplyConsumption(faction, "ammo", ammoTransfer, "".concat(unit.type, " depot issue"));
            state.ammo = Number((state.ammo + ammoTransfer).toFixed(2));
            unit.ammo = state.ammo;
        }
        if (!this.unitConsumesFuel(definition)) {
            return;
        }
        var fuelCapacity = Math.max(0, ((_b = definition.fuel) !== null && _b !== void 0 ? _b : 0) - state.fuel);
        var fuelTransfer = Math.min(fuelCapacity, Math.max(0, supplyState.inventory.fuel.current));
        if (fuelTransfer > 0) {
            this.trackSupplyConsumption(faction, "fuel", fuelTransfer, "".concat(unit.type, " depot issue"));
            state.fuel = Number((state.fuel + fuelTransfer).toFixed(2));
            unit.fuel = state.fuel;
        }
    };
    GameEngine.prototype.deliverConvoyCargoToUnit = function (_faction, truckState, unit, state, definition) {
        var _a, _b;
        var transferred = false;
        var ammoCapacity = Math.max(0, ((_a = definition.ammo) !== null && _a !== void 0 ? _a : 0) - state.ammo);
        var ammoTransfer = Math.min(ammoCapacity, balance_1.supply.convoy.unloadAmmoPerTurn, Math.max(0, truckState.ammoCargo));
        if (ammoTransfer > 0) {
            truckState.ammoCargo = Number((truckState.ammoCargo - ammoTransfer).toFixed(2));
            state.ammo = Number((state.ammo + ammoTransfer).toFixed(2));
            unit.ammo = state.ammo;
            transferred = true;
        }
        if (this.unitConsumesFuel(definition)) {
            var fuelCapacity = Math.max(0, ((_b = definition.fuel) !== null && _b !== void 0 ? _b : 0) - state.fuel);
            var fuelTransfer = Math.min(fuelCapacity, balance_1.supply.convoy.unloadFuelPerTurn, Math.max(0, truckState.fuelCargo));
            if (fuelTransfer > 0) {
                truckState.fuelCargo = Number((truckState.fuelCargo - fuelTransfer).toFixed(2));
                state.fuel = Number((state.fuel + fuelTransfer).toFixed(2));
                unit.fuel = state.fuel;
                transferred = true;
            }
        }
        if (transferred) {
            truckState.status = "delivering";
        }
        return transferred;
    };
    GameEngine.prototype.resolveSupplyDemandEntries = function (faction) {
        var _this = this;
        var placements = this.getAllUnitsForFaction(faction);
        var entries = [];
        var liveDemandUnitIds = new Set();
        placements
            .filter(function (unit) { return !_this.isSupplyTruckType(unit.type); })
            .forEach(function (unit) {
            var _a, _b;
            var unitId = _this.normalizeUnitId(_this.ensureUnitId(unit));
            if (unitId) {
                liveDemandUnitIds.add(unitId);
            }
            var definition = _this.getUnitDefinition(unit.type);
            var state = _this.getSupplyStateForHex(faction, unit.hex, unitId);
            if (!state || definition.moveType === "air") {
                return;
            }
            var ammoNeed = Math.max(0, ((_a = definition.ammo) !== null && _a !== void 0 ? _a : 0) - state.ammo);
            var fuelNeed = _this.unitConsumesFuel(definition) ? Math.max(0, ((_b = definition.fuel) !== null && _b !== void 0 ? _b : 0) - state.fuel) : 0;
            if (ammoNeed <= 0 && fuelNeed <= 0) {
                return;
            }
            entries.push({
                unit: unit,
                definition: definition,
                priority: _this.getSupplyPriorityForUnit(unit, definition),
                ammoNeed: ammoNeed,
                fuelNeed: fuelNeed,
                directEligible: _this.isHexWithinSupplySourceRadius(unit.hex, faction),
                assignmentCount: 0,
                status: "queued"
            });
        });
        var serviceHistory = this.getConvoyServiceHistoryMap(faction);
        Array.from(serviceHistory.keys()).forEach(function (unitId) {
            if (!liveDemandUnitIds.has(unitId)) {
                serviceHistory.delete(unitId);
            }
        });
        return entries;
    };
    GameEngine.prototype.applyDirectDepotIssues = function (faction, supplyState, demands) {
        var _this = this;
        demands.forEach(function (entry) {
            var _a, _b;
            if (!entry.directEligible) {
                return;
            }
            var state = _this.getSupplyStateForHex(faction, entry.unit.hex, entry.unit.unitId);
            if (!state) {
                return;
            }
            _this.applyDirectDepotResupply(faction, supplyState, entry.unit, state, entry.definition);
            entry.ammoNeed = Math.max(0, ((_a = entry.definition.ammo) !== null && _a !== void 0 ? _a : 0) - state.ammo);
            entry.fuelNeed = _this.unitConsumesFuel(entry.definition) ? Math.max(0, ((_b = entry.definition.fuel) !== null && _b !== void 0 ? _b : 0) - state.fuel) : 0;
            entry.status = entry.ammoNeed <= 0 && entry.fuelNeed <= 0 ? "direct" : "queued";
        });
    };
    GameEngine.prototype.scoreSupplyDemand = function (entry) {
        var urgency = (entry.ammoNeed * 12) + (entry.fuelNeed * 8);
        var emptyPenalty = (entry.unit.ammo <= 0 ? 60 : 0) + (entry.unit.fuel <= 0 && this.unitConsumesFuel(entry.definition) ? 60 : 0);
        return this.getSupplyPriorityWeight(entry.priority) + urgency + emptyPenalty - (entry.assignmentCount * 30);
    };
    GameEngine.prototype.chooseBestSupplyTarget = function (faction, truck, truckState, demands) {
        var _this = this;
        var _a, _b;
        var availableDemand = demands
            .filter(function (entry) { return entry.status !== "direct" && entry.status !== "resupplied"; })
            .filter(function (entry) { return entry.ammoNeed > 0 || entry.fuelNeed > 0; });
        if (availableDemand.length === 0) {
            return null;
        }
        var occupied = this.buildConvoyBlockingOccupancySet(faction);
        occupied.delete((0, Hex_1.axialKey)(truck.hex));
        var reachable = [];
        for (var _i = 0, availableDemand_1 = availableDemand; _i < availableDemand_1.length; _i++) {
            var entry = availableDemand_1[_i];
            var serviceHexes = this.collectServiceHexes(entry.unit.hex, truck.hex, faction);
            var plan = this.findCheapestPathToAny(truck.hex, serviceHexes, this.getUnitDefinition(truck.type).moveType, occupied);
            if (!plan) {
                continue;
            }
            reachable.push({
                entry: entry,
                need: { ammoNeed: entry.ammoNeed, fuelNeed: entry.fuelNeed },
                plan: plan,
                cargoMismatchPenalty: (entry.ammoNeed > 0 && truckState.ammoCargo <= 0 ? 45 : 0) +
                    (entry.fuelNeed > 0 && truckState.fuelCargo <= 0 ? 45 : 0)
            });
        }
        if (reachable.length === 0) {
            return null;
        }
        reachable.sort(function (left, right) { return _this.compareConvoyReachableTargets(faction, left, right); });
        return (_b = (_a = reachable[0]) === null || _a === void 0 ? void 0 : _a.entry) !== null && _b !== void 0 ? _b : null;
    };
    GameEngine.prototype.collectServiceHexes = function (targetHex, origin, faction) {
        var _this = this;
        var candidates = [];
        if (!this.isHexBlockedForConvoy(targetHex, faction) || (targetHex.q === origin.q && targetHex.r === origin.r)) {
            candidates.push(structuredClone(targetHex));
        }
        (0, Hex_1.neighbors)(targetHex).forEach(function (neighbor) {
            if (!_this.inBounds(neighbor)) {
                return;
            }
            var key = (0, Hex_1.axialKey)(neighbor);
            if (_this.isHexBlockedForConvoy(neighbor, faction) && key !== (0, Hex_1.axialKey)(origin)) {
                return;
            }
            candidates.push(structuredClone(neighbor));
        });
        return candidates;
    };
    GameEngine.prototype.collectSourceApproachHexes = function (faction, origin) {
        var _this = this;
        var candidates = [];
        this.getSupplySourceHexes(faction).forEach(function (source) {
            if (!_this.isHexBlockedForConvoy(source, faction) || (0, Hex_1.axialKey)(source) === (0, Hex_1.axialKey)(origin)) {
                candidates.push(structuredClone(source));
            }
            (0, Hex_1.neighbors)(source).forEach(function (neighbor) {
                if (!_this.inBounds(neighbor)) {
                    return;
                }
                var key = (0, Hex_1.axialKey)(neighbor);
                if (_this.isHexBlockedForConvoy(neighbor, faction) && key !== (0, Hex_1.axialKey)(origin)) {
                    return;
                }
                candidates.push(structuredClone(neighbor));
            });
        });
        return candidates;
    };
    /**
     * Normalizes and validates unit IDs. Rejects empty or missing IDs to prevent
     * poisoning assignment state with invalid keys.
     */
    GameEngine.prototype.normalizeUnitId = function (unitId) {
        if (!unitId || unitId.trim() === '') {
            return null;
        }
        return unitId.trim();
    };
    /**
     * Refreshes demand state for a unit, accounting for reservations already made
     * by other trucks. Returns unreserved remaining need.
     */
    GameEngine.prototype.refreshDemandWithReservations = function (faction, entry, reservations) {
        var _a, _b, _c, _d;
        if (entry.status === "direct") {
            return null;
        }
        var unitState = this.getSupplyStateForHex(faction, entry.unit.hex, entry.unit.unitId);
        if (!unitState) {
            return null;
        }
        var totalAmmoNeed = Math.max(0, ((_a = entry.definition.ammo) !== null && _a !== void 0 ? _a : 0) - unitState.ammo);
        var totalFuelNeed = this.unitConsumesFuel(entry.definition)
            ? Math.max(0, ((_b = entry.definition.fuel) !== null && _b !== void 0 ? _b : 0) - unitState.fuel)
            : 0;
        var unitId = this.normalizeUnitId(entry.unit.unitId);
        var reservation = unitId ? reservations.get(unitId) : null;
        var ammoReserved = (_c = reservation === null || reservation === void 0 ? void 0 : reservation.ammoReserved) !== null && _c !== void 0 ? _c : 0;
        var fuelReserved = (_d = reservation === null || reservation === void 0 ? void 0 : reservation.fuelReserved) !== null && _d !== void 0 ? _d : 0;
        var ammoNeed = Math.max(0, totalAmmoNeed - ammoReserved);
        var fuelNeed = Math.max(0, totalFuelNeed - fuelReserved);
        return ammoNeed > 0 || fuelNeed > 0 ? { ammoNeed: ammoNeed, fuelNeed: fuelNeed } : null;
    };
    /**
     * Selects the best reachable target for a truck, considering:
     * 1. Reachability (must have valid path)
     * 2. Player priority (among reachable targets only)
     * 3. Travel cost
     * 4. Remaining unreserved need
     */
    GameEngine.prototype.selectConvoyTarget = function (faction, truck, truckState, truckDefinition, demands, reservations, occupied, availableFuel, excludedUnitIds) {
        var _this = this;
        if (excludedUnitIds === void 0) { excludedUnitIds = new Set(); }
        var nullResult = {
            targetUnit: null,
            ammoToReserve: 0,
            fuelToReserve: 0
        };
        var buildPlanForEntry = function (entry) {
            var destinationOptions = _this.collectServiceHexes(entry.unit.hex, truck.hex, faction);
            if (destinationOptions.length === 0) {
                return null;
            }
            return _this.findCheapestPathToAny(truck.hex, destinationOptions, truckDefinition.moveType, occupied, Number.isFinite(availableFuel) ? availableFuel : undefined);
        };
        var reachable = [];
        for (var _i = 0, demands_1 = demands; _i < demands_1.length; _i++) {
            var demand = demands_1[_i];
            var unitId = this.normalizeUnitId(demand.unit.unitId);
            if (!unitId || excludedUnitIds.has(unitId)) {
                continue;
            }
            var need = this.refreshDemandWithReservations(faction, demand, reservations);
            if (!need) {
                continue;
            }
            var plan = buildPlanForEntry(demand);
            var alreadyWithinServiceRadius = (0, Hex_1.hexDistance)(truck.hex, demand.unit.hex) <= balance_1.supply.convoy.serviceRadius;
            if (!plan || (!alreadyWithinServiceRadius && plan.path.length <= 1)) {
                continue;
            }
            reachable.push({
                entry: demand,
                need: need,
                plan: plan,
                cargoMismatchPenalty: (need.ammoNeed > 0 && truckState.ammoCargo <= 0 ? 45 : 0) +
                    (need.fuelNeed > 0 && truckState.fuelCargo <= 0 ? 45 : 0)
            });
        }
        if (reachable.length === 0) {
            return nullResult;
        }
        reachable.sort(function (left, right) { return _this.compareConvoyReachableTargets(faction, left, right); });
        var chosen = reachable[0];
        // Reserve what this truck can deliver
        var ammoToReserve = Math.min(chosen.need.ammoNeed, truckState.ammoCargo);
        var fuelToReserve = Math.min(chosen.need.fuelNeed, truckState.fuelCargo);
        return {
            targetUnit: chosen.entry,
            ammoToReserve: ammoToReserve,
            fuelToReserve: fuelToReserve
        };
    };
    /**
     * Continuously retargets a truck after delivery, seeking new units while cargo remains
     * and reachable demand exists.
     */
    GameEngine.prototype.retargetConvoyAfterDelivery = function (faction, truck, truckState, truckDefinition, demands, reservations, occupied, availableFuel) {
        var _this = this;
        var hasCargo = function () { return truckState.ammoCargo > 0 || truckState.fuelCargo > 0; };
        var iterations = 0;
        var MAX_RETARGET_ITERATIONS = 10; // Safety limit
        while (hasCargo() && iterations < MAX_RETARGET_ITERATIONS) {
            iterations++;
            // Check if current assigned target is in range for delivery
            if (truckState.assignedUnitId) {
                var currentDemand = demands.find(function (entry) { return _this.normalizeUnitId(entry.unit.unitId) === truckState.assignedUnitId; });
                if (currentDemand) {
                    var need = this.refreshDemandWithReservations(faction, currentDemand, reservations);
                    if (need && (0, Hex_1.hexDistance)(truck.hex, currentDemand.unit.hex) <= balance_1.supply.convoy.serviceRadius) {
                        var unitState = this.getSupplyStateForHex(faction, currentDemand.unit.hex, currentDemand.unit.unitId);
                        if (unitState) {
                            var delivered = this.deliverConvoyCargoToUnit(faction, truckState, currentDemand.unit, unitState, currentDemand.definition);
                            if (delivered) {
                                // Update reservation after delivery
                                var unitId_1 = this.normalizeUnitId(currentDemand.unit.unitId);
                                if (unitId_1) {
                                    var newNeed = this.refreshDemandWithReservations(faction, currentDemand, reservations);
                                    if (!newNeed) {
                                        truckState.assignedUnitId = null;
                                        reservations.delete(unitId_1);
                                    }
                                }
                                if (!hasCargo()) {
                                    break;
                                }
                                // Continue to find next target
                            }
                        }
                    }
                }
            }
            // Select next target
            var excludedIds = new Set();
            var allocation = this.selectConvoyTarget(faction, truck, truckState, truckDefinition, demands, reservations, occupied, availableFuel, excludedIds);
            if (!allocation.targetUnit) {
                // No more reachable targets
                break;
            }
            // Make reservation
            var unitId = this.normalizeUnitId(allocation.targetUnit.unit.unitId);
            if (!unitId) {
                break;
            }
            var reservation = reservations.get(unitId);
            if (!reservation) {
                reservation = {
                    unitId: unitId,
                    ammoReserved: 0,
                    fuelReserved: 0,
                    assignedTrucks: []
                };
                reservations.set(unitId, reservation);
            }
            reservation.ammoReserved += allocation.ammoToReserve;
            reservation.fuelReserved += allocation.fuelToReserve;
            if (!reservation.assignedTrucks.includes(truckState.unitId)) {
                reservation.assignedTrucks.push(truckState.unitId);
            }
            truckState.assignedUnitId = unitId;
            allocation.targetUnit.assignmentCount += 1;
            // If in range, deliver immediately and loop
            if ((0, Hex_1.hexDistance)(truck.hex, allocation.targetUnit.unit.hex) <= balance_1.supply.convoy.serviceRadius) {
                var unitState = this.getSupplyStateForHex(faction, allocation.targetUnit.unit.hex, allocation.targetUnit.unit.unitId);
                if (unitState) {
                    this.deliverConvoyCargoToUnit(faction, truckState, allocation.targetUnit.unit, unitState, allocation.targetUnit.definition);
                    var newNeed = this.refreshDemandWithReservations(faction, allocation.targetUnit, reservations);
                    if (!newNeed) {
                        truckState.assignedUnitId = null;
                        reservations.delete(unitId);
                    }
                }
            }
            else {
                // Not in range, need to move towards target
                break;
            }
        }
    };
    /**
     * THREE-PHASE CONVOY AUTOMATION
     *
     * Phase 1: Refresh demand state - Update all demand entries based on current unit state
     * Phase 2: Allocate convoy work - Assign trucks to targets with reservation-based workload splitting
     * Phase 3: Execute movement and delivery - Move trucks towards targets and deliver cargo
     *
     * Key improvements:
     * - Continuous retargeting: Trucks seek new targets while cargo remains
     * - Reservation system: Prevents duplicate assignments, enables workload splitting
     * - Priority-aware: Reachable targets only, then player priority, then cost
     * - Opportunistic delivery: Service nearby units en-route
     */
    GameEngine.prototype.automateSupplyConvoys = function (faction, supplyState, demands) {
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g, _h;
        this.ensureSupplyTruckStatesForFaction(faction);
        var placements = this.getPlacementMapForFaction(faction);
        var mirror = this.getSupplyMirrorForFaction(faction);
        var stateMap = this.getSupplyTruckStateMap(faction);
        // Per-turn reservation state - rebuilt fresh each automation pass
        var reservations = new Map();
        // ======================
        // PHASE 1: REFRESH DEMAND STATE
        // ======================
        // Update all demand entries based on current unit state (no reservations yet)
        for (var _i = 0, demands_2 = demands; _i < demands_2.length; _i++) {
            var demand = demands_2[_i];
            if (demand.status === "direct") {
                continue;
            }
            var unitState = this.getSupplyStateForHex(faction, demand.unit.hex, demand.unit.unitId);
            if (!unitState) {
                continue;
            }
            demand.ammoNeed = Math.max(0, ((_a = demand.definition.ammo) !== null && _a !== void 0 ? _a : 0) - unitState.ammo);
            demand.fuelNeed = this.unitConsumesFuel(demand.definition)
                ? Math.max(0, ((_b = demand.definition.fuel) !== null && _b !== void 0 ? _b : 0) - unitState.fuel)
                : 0;
        }
        // ======================
        // PHASE 2: ALLOCATE CONVOY WORK
        // ======================
        // Assign trucks to targets with reservation-based workload splitting
        var trucks = this.getAllUnitsForFaction(faction).filter(function (unit) { return _this.isSupplyTruckType(unit.type); });
        var _loop_1 = function (truck) {
            var truckId = this_1.normalizeUnitId(this_1.ensureUnitId(truck));
            if (!truckId) {
                console.warn("[ConvoyAutomation] Skipping truck with invalid unitId", truck);
                return "continue";
            }
            var truckState = stateMap.get(truckId);
            if (!truckState) {
                return "continue";
            }
            var truckDefinition = this_1.getUnitDefinition(truck.type);
            var truckSupplyState = this_1.getSupplyStateForHex(faction, truck.hex, truckId);
            if (!truckSupplyState) {
                return "continue";
            }
            // Load at source
            var atSource = this_1.isHexWithinSupplySourceRadius(truck.hex, faction);
            if (atSource) {
                this_1.loadSupplyTruckFromDepot(faction, supplyState, truck, truckSupplyState, truckState);
            }
            var hasCargo = truckState.ammoCargo > 0 || truckState.fuelCargo > 0;
            if (!hasCargo) {
                truckState.assignedUnitId = null;
                truckState.status = atSource ? "idle" : "returning";
                return "continue";
            }
            var occupied = this_1.buildConvoyBlockingOccupancySet(faction);
            occupied.delete((0, Hex_1.axialKey)(truck.hex));
            var availableFuel = this_1.resolveFuelBudget(truck, truckDefinition);
            // Check if current assignment is still valid.
            var currentDemand = null;
            var currentNeed = null;
            var currentAssignmentValid = false;
            if (truckState.assignedUnitId) {
                currentDemand =
                    (_c = demands.find(function (entry) { return _this.normalizeUnitId(entry.unit.unitId) === truckState.assignedUnitId; })) !== null && _c !== void 0 ? _c : null;
                if (currentDemand) {
                    currentNeed = this_1.refreshDemandWithReservations(faction, currentDemand, reservations);
                    if (currentNeed) {
                        var destinationOptions = this_1.collectServiceHexes(currentDemand.unit.hex, truck.hex, faction);
                        var plan = destinationOptions.length > 0
                            ? this_1.findCheapestPathToAny(truck.hex, destinationOptions, truckDefinition.moveType, occupied, Number.isFinite(availableFuel) ? availableFuel : undefined)
                            : null;
                        var alreadyWithinServiceRadius = (0, Hex_1.hexDistance)(truck.hex, currentDemand.unit.hex) <= balance_1.supply.convoy.serviceRadius;
                        currentAssignmentValid = plan !== null && (alreadyWithinServiceRadius || plan.path.length > 1);
                    }
                }
                if (!currentAssignmentValid) {
                    truckState.assignedUnitId = null;
                    currentDemand = null;
                    currentNeed = null;
                }
            }
            var allocation = this_1.selectConvoyTarget(faction, truck, truckState, truckDefinition, demands, reservations, occupied, availableFuel);
            var keepCurrentAssignment = currentAssignmentValid &&
                currentDemand !== null &&
                currentNeed !== null &&
                (!allocation.targetUnit || !this_1.shouldRotateConvoyAssignment(faction, currentDemand, allocation.targetUnit));
            if (keepCurrentAssignment) {
                this_1.reserveConvoyAssignment(truckState, currentDemand, reservations, Math.min(currentNeed.ammoNeed, truckState.ammoCargo), Math.min(currentNeed.fuelNeed, truckState.fuelCargo));
            }
            else if (allocation.targetUnit) {
                this_1.reserveConvoyAssignment(truckState, allocation.targetUnit, reservations, allocation.ammoToReserve, allocation.fuelToReserve);
            }
            else {
                // No reachable targets with cargo - return to depot.
                truckState.assignedUnitId = null;
                truckState.status = atSource ? "idle" : "returning";
            }
        };
        var this_1 = this;
        for (var _j = 0, trucks_1 = trucks; _j < trucks_1.length; _j++) {
            var truck = trucks_1[_j];
            _loop_1(truck);
        }
        var _loop_2 = function (truck) {
            var truckId = this_2.normalizeUnitId(this_2.ensureUnitId(truck));
            if (!truckId) {
                return "continue";
            }
            var truckState = stateMap.get(truckId);
            if (!truckState) {
                return "continue";
            }
            var truckDefinition = this_2.getUnitDefinition(truck.type);
            var truckSupplyState = this_2.getSupplyStateForHex(faction, truck.hex, truckId);
            if (!truckSupplyState) {
                return "continue";
            }
            var atSource = this_2.isHexWithinSupplySourceRadius(truck.hex, faction);
            var hasCargo = function () { return truckState.ammoCargo > 0 || truckState.fuelCargo > 0; };
            var occupied = this_2.buildConvoyBlockingOccupancySet(faction);
            occupied.delete((0, Hex_1.axialKey)(truck.hex));
            var availableFuel = this_2.resolveFuelBudget(truck, truckDefinition);
            var refreshDemand = function (entry) {
                var _a, _b;
                if (!entry || entry.status === "direct") {
                    return null;
                }
                var unitState = _this.getSupplyStateForHex(faction, entry.unit.hex, entry.unit.unitId);
                if (!unitState) {
                    return null;
                }
                entry.ammoNeed = Math.max(0, ((_a = entry.definition.ammo) !== null && _a !== void 0 ? _a : 0) - unitState.ammo);
                entry.fuelNeed = _this.unitConsumesFuel(entry.definition)
                    ? Math.max(0, ((_b = entry.definition.fuel) !== null && _b !== void 0 ? _b : 0) - unitState.fuel)
                    : 0;
                return entry.ammoNeed > 0 || entry.fuelNeed > 0 ? entry : null;
            };
            var buildPlanForEntry = function (entry) {
                if (!entry || !hasCargo()) {
                    return null;
                }
                var destinationOptions = _this.collectServiceHexes(entry.unit.hex, truck.hex, faction);
                if (destinationOptions.length === 0) {
                    return null;
                }
                var plan = _this.findCheapestPathToAny(truck.hex, destinationOptions, truckDefinition.moveType, occupied, Number.isFinite(availableFuel) ? availableFuel : undefined);
                var alreadyWithinServiceRadius = (0, Hex_1.hexDistance)(truck.hex, entry.unit.hex) <= balance_1.supply.convoy.serviceRadius;
                if (!plan || (!alreadyWithinServiceRadius && plan.path.length <= 1)) {
                    return null;
                }
                return plan;
            };
            var selectReachableTarget = function (excludedUnitIds) {
                var _a, _b, _c;
                if (excludedUnitIds === void 0) { excludedUnitIds = new Set(); }
                var reachable = [];
                for (var _i = 0, demands_3 = demands; _i < demands_3.length; _i++) {
                    var demand = demands_3[_i];
                    var entry = refreshDemand(demand);
                    if (!entry || excludedUnitIds.has((_a = entry.unit.unitId) !== null && _a !== void 0 ? _a : '')) {
                        continue;
                    }
                    var plan_1 = buildPlanForEntry(entry);
                    if (!plan_1) {
                        continue;
                    }
                    reachable.push({ entry: entry, plan: plan_1 });
                }
                if (reachable.length === 0) {
                    return {
                        entry: null,
                        plan: null
                    };
                }
                var highestPriority = Math.max.apply(Math, reachable.map(function (_a) {
                    var entry = _a.entry;
                    return _this.getSupplyDemandPriorityRank(entry);
                }));
                var topPriority = reachable.filter(function (_a) {
                    var entry = _a.entry;
                    return _this.getSupplyDemandPriorityRank(entry) === highestPriority;
                });
                var chosenEntry = (_b = _this.chooseBestSupplyTarget(faction, truck, truckState, topPriority.map(function (_a) {
                    var entry = _a.entry;
                    return entry;
                }))) !== null && _b !== void 0 ? _b : topPriority[0].entry;
                var chosen = (_c = topPriority.find(function (_a) {
                    var entry = _a.entry;
                    return entry.unit.unitId === chosenEntry.unit.unitId;
                })) !== null && _c !== void 0 ? _c : topPriority[0];
                return {
                    entry: chosen.entry,
                    plan: chosen.plan
                };
            };
            var deliverToAssignedIfInRange = function (entry) {
                var _a, _b;
                if (!entry) {
                    return false;
                }
                if ((0, Hex_1.hexDistance)(truck.hex, entry.unit.hex) >
                    balance_1.supply.convoy.serviceRadius) {
                    return false;
                }
                var assignedState = _this.getSupplyStateForHex(faction, entry.unit.hex, entry.unit.unitId);
                if (!assignedState) {
                    return false;
                }
                var delivered = _this.deliverConvoyCargoToUnit(faction, truckState, entry.unit, assignedState, entry.definition);
                if (delivered) {
                    _this.recordConvoyService(faction, entry.unit.unitId);
                }
                entry.ammoNeed = Math.max(0, ((_a = entry.definition.ammo) !== null && _a !== void 0 ? _a : 0) - assignedState.ammo);
                entry.fuelNeed = _this.unitConsumesFuel(entry.definition)
                    ? Math.max(0, ((_b = entry.definition.fuel) !== null && _b !== void 0 ? _b : 0) - assignedState.fuel)
                    : 0;
                entry.status = delivered
                    ? entry.ammoNeed <= 0 && entry.fuelNeed <= 0
                        ? "resupplied"
                        : "delivering"
                    : entry.status;
                if (entry.ammoNeed <= 0 && entry.fuelNeed <= 0) {
                    truckState.assignedUnitId = null;
                }
                return delivered;
            };
            var advanceAlongPlan = function (plan) {
                var _a;
                var remainingMove = Math.max(1, (_a = truckDefinition.movement) !== null && _a !== void 0 ? _a : 1);
                var fuelSpent = 0;
                var current = structuredClone(truck.hex);
                var traveled = [structuredClone(truck.hex)];
                for (var index = 1; index < plan.path.length; index += 1) {
                    var step = plan.path[index];
                    var stepCost = _this.resolveMoveCost(truckDefinition.moveType, _this.terrainAt(step), step, current);
                    var stepFuel = _this.resolveMovementFuelStep(truckDefinition.moveType, step);
                    if (stepCost > remainingMove) {
                        break;
                    }
                    if (Number.isFinite(availableFuel) &&
                        fuelSpent + stepFuel > availableFuel + 1e-6) {
                        break;
                    }
                    if (_this.isHexBlockedForConvoy(step, faction)) {
                        break;
                    }
                    current = structuredClone(step);
                    remainingMove -= stepCost;
                    fuelSpent += stepFuel;
                    traveled.push(structuredClone(step));
                }
                return { current: current, traveled: traveled, fuelSpent: fuelSpent };
            };
            var assignedEntry = refreshDemand((_d = demands.find(function (entry) { return entry.unit.unitId === truckState.assignedUnitId; })) !== null && _d !== void 0 ? _d : null);
            if (!assignedEntry) {
                truckState.assignedUnitId = null;
            }
            var assignedPlan = buildPlanForEntry(assignedEntry);
            // Blocked first: if the current assignment is not reachable, drop it now.
            if (assignedEntry && !assignedPlan) {
                assignedEntry = null;
                truckState.assignedUnitId = null;
            }
            // Then priority: among reachable targets, prefer the highest priority.
            if (hasCargo()) {
                var bestReachable = selectReachableTarget();
                if (!assignedEntry) {
                    assignedEntry = bestReachable.entry;
                    assignedPlan = bestReachable.plan;
                    truckState.assignedUnitId = (_e = assignedEntry === null || assignedEntry === void 0 ? void 0 : assignedEntry.unit.unitId) !== null && _e !== void 0 ? _e : null;
                }
                else if (bestReachable.entry &&
                    this_2.shouldRotateConvoyAssignment(faction, assignedEntry, bestReachable.entry)) {
                    assignedEntry = bestReachable.entry;
                    assignedPlan = bestReachable.plan;
                    truckState.assignedUnitId = (_f = assignedEntry.unit.unitId) !== null && _f !== void 0 ? _f : null;
                }
            }
            if (assignedEntry) {
                assignedEntry.assignmentCount += 1;
            }
            if (assignedEntry && deliverToAssignedIfInRange(assignedEntry)) {
                return { value: void 0 };
            }
            var destinationOptions = [];
            var plan = null;
            if (assignedEntry && hasCargo()) {
                destinationOptions = this_2.collectServiceHexes(assignedEntry.unit.hex, truck.hex, faction);
                truckState.status = "delivering";
                plan = assignedPlan;
            }
            else {
                destinationOptions = this_2.collectSourceApproachHexes(faction, truck.hex);
                truckState.assignedUnitId = null;
                truckState.status = atSource ? "idle" : "returning";
                plan = this_2.findCheapestPathToAny(truck.hex, destinationOptions, truckDefinition.moveType, occupied, Number.isFinite(availableFuel) ? availableFuel : undefined);
            }
            if ((!plan || plan.path.length <= 1) && assignedEntry && hasCargo()) {
                var fallback = selectReachableTarget(assignedEntry.unit.unitId ? new Set([assignedEntry.unit.unitId]) : new Set());
                if (fallback.entry && fallback.plan) {
                    assignedEntry = fallback.entry;
                    plan = fallback.plan;
                    truckState.assignedUnitId = (_g = assignedEntry.unit.unitId) !== null && _g !== void 0 ? _g : null;
                    truckState.status = "delivering";
                }
            }
            if (!plan || plan.path.length <= 1) {
                if (!atSource && destinationOptions.length > 0) {
                    truckState.status = "blocked";
                }
                return { value: void 0 };
            }
            var movement = advanceAlongPlan(plan);
            // If the live board state blocks execution, immediately try another target.
            if (movement.traveled.length <= 1 && assignedEntry && hasCargo()) {
                var fallback = selectReachableTarget(assignedEntry.unit.unitId ? new Set([assignedEntry.unit.unitId]) : new Set());
                if (fallback.entry && fallback.plan) {
                    assignedEntry = fallback.entry;
                    truckState.assignedUnitId = (_h = assignedEntry.unit.unitId) !== null && _h !== void 0 ? _h : null;
                    truckState.status = "delivering";
                    movement = advanceAlongPlan(fallback.plan);
                }
            }
            if (movement.traveled.length <= 1) {
                if (assignedEntry) {
                    truckState.assignedUnitId = null;
                }
                if (!atSource) {
                    truckState.status = "blocked";
                }
                return { value: void 0 };
            }
            var fromHex = structuredClone(truck.hex);
            var movedTruck = structuredClone(truck);
            movedTruck.facing = this_2.resolveFacingToward(truck.hex, movement.current, truck.facing);
            movedTruck.hex = structuredClone(movement.current);
            if (Number.isFinite(availableFuel) && movement.fuelSpent > 0) {
                movedTruck.fuel = Math.max(0, Number((movedTruck.fuel - movement.fuelSpent).toFixed(2)));
            }
            movedTruck.entrench = 0;
            this_2.removeUnitFromFactionHex(faction, fromHex, truckId);
            this_2.addUnitToFactionHex(faction, movedTruck);
            truck.facing = movedTruck.facing;
            truck.hex = structuredClone(movedTruck.hex);
            truck.fuel = movedTruck.fuel;
            truck.entrench = movedTruck.entrench;
            this_2.updateSupplyPositionForFaction(faction, fromHex, movement.current, truckId);
            this_2.syncFuelForFaction(faction, movement.current, truck.fuel, truckId);
            this_2.syncEntrenchForFaction(faction, movement.current, truck.entrench, truckId);
            if (this_2.isHexWithinSupplySourceRadius(truck.hex, faction)) {
                this_2.loadSupplyTruckFromDepot(faction, supplyState, truck, truckSupplyState, truckState);
            }
            if (assignedEntry) {
                deliverToAssignedIfInRange(assignedEntry);
            }
        };
        var this_2 = this;
        // ======================
        // PHASE 3: EXECUTE MOVEMENT AND DELIVERY
        // ======================
        // Move trucks towards targets and deliver cargo
        for (var _k = 0, trucks_2 = trucks; _k < trucks_2.length; _k++) {
            var truck = trucks_2[_k];
            var state_1 = _loop_2(truck);
            if (typeof state_1 === "object")
                return state_1.value;
        }
    };
    /**
     * Appends a ledger entry for stockpile usage and reduces the corresponding inventory bucket.
     */
    GameEngine.prototype.trackSupplyConsumption = function (faction, key, amount, reason) {
        if (amount <= 0) {
            return;
        }
        var state = this.supplyStateByFaction[faction];
        (0, SupplyState_1.recordConsumption)(state, key, amount, this._turnNumber, reason);
    };
    /** Generates a new unique unit ID. Format: "u_<timestamp>_<counter>" for global uniqueness. */
    GameEngine.prototype.generateUnitId = function () {
        this.unitIdCounter += 1;
        return "u_".concat(Date.now(), "_").concat(this.unitIdCounter);
    };
    /** Ensures a ScenarioUnit has a stable unitId assigned. Mutates the unit in place if missing. */
    GameEngine.prototype.ensureUnitId = function (unit) {
        if (!unit.unitId) {
            unit.unitId = this.generateUnitId();
        }
        return unit.unitId;
    };
    /** Builds a stable id for a squadron so assignments remain distinct even when sharing a base hex.
     *  Uses the unit's persistent unitId if available; falls back to type@hex for legacy units. */
    GameEngine.prototype.getSquadronId = function (unit) {
        var _a;
        // Prefer the stable unitId if present; otherwise fall back to legacy type@hex format.
        return (_a = unit.unitId) !== null && _a !== void 0 ? _a : "".concat(unit.type, "@").concat((0, Hex_1.axialKey)(unit.hex));
    };
    /** Reusable factory for default per-turn action flags so new entries stay consistent. */
    GameEngine.prototype.createDefaultActionFlags = function () {
        return { movementPointsUsed: 0, attacksUsed: 0, retaliationsUsed: 0, isRushing: false };
    };
    GameEngine.prototype.shouldTrackAsPlayerIdle = function (unit) {
        return !this.isAutomatedPlayerUnit(unit);
    };
    GameEngine.prototype.isTowableUnit = function (unitOrType) {
        if (typeof unitOrType === "string") {
            return GameEngine.TOWABLE_UNIT_TYPES.has(unitOrType);
        }
        if ("type" in unitOrType) {
            return GameEngine.TOWABLE_UNIT_TYPES.has(unitOrType.type);
        }
        return false;
    };
    GameEngine.prototype.resolveTowState = function (unit) {
        if (!this.isTowableUnit(unit)) {
            return null;
        }
        return unit.towState === "towed" ? "towed" : "deployed";
    };
    GameEngine.prototype.resolveBaseMovementAllowance = function (definition, flags) {
        var _a;
        var moveScalar = this.commanderMoveScalar();
        var baseMovement = Math.max(1, Math.ceil(((_a = definition.movement) !== null && _a !== void 0 ? _a : 1) * moveScalar));
        var rushingBonus = flags.isRushing && definition.class === "infantry" ? 1 : 0;
        var adjustedMax = baseMovement + rushingBonus;
        if (flags.attacksUsed > 0) {
            if (definition.class === "artillery") {
                adjustedMax = 0;
            }
            else {
                adjustedMax = Math.floor(adjustedMax / 2);
            }
        }
        return Math.max(0, adjustedMax);
    };
    GameEngine.prototype.resolveTowHookupCost = function (definition, flags) {
        return Math.max(1, Math.ceil(this.resolveBaseMovementAllowance(definition, flags) / 2));
    };
    GameEngine.prototype.getPlacementOverflowMapForFaction = function (faction) {
        if (faction === "Player") {
            return this.playerPlacementOverflow;
        }
        if (faction === "Bot") {
            return this.botPlacementOverflow;
        }
        return this.allyPlacementOverflow;
    };
    GameEngine.prototype.getUnitsAtHexForFaction = function (hex, faction) {
        var _a;
        var key = (0, Hex_1.axialKey)(hex);
        var placements = this.getPlacementMapForFaction(faction);
        var overflow = (_a = this.getPlacementOverflowMapForFaction(faction).get(key)) !== null && _a !== void 0 ? _a : [];
        var primary = placements.get(key);
        return primary ? __spreadArray([primary], overflow, true) : __spreadArray([], overflow, true);
    };
    GameEngine.prototype.setUnitsAtHexForFaction = function (hex, faction, units) {
        var key = (0, Hex_1.axialKey)(hex);
        var placements = this.getPlacementMapForFaction(faction);
        var overflowMap = this.getPlacementOverflowMapForFaction(faction);
        placements.delete(key);
        overflowMap.delete(key);
        if (units.length <= 0) {
            return;
        }
        placements.set(key, units[0]);
        if (units.length > 1) {
            overflowMap.set(key, units.slice(1).map(function (unit) { return structuredClone(unit); }));
        }
    };
    GameEngine.prototype.addUnitToFactionHex = function (faction, unit) {
        var units = this.getUnitsAtHexForFaction(unit.hex, faction);
        units.push(unit);
        this.setUnitsAtHexForFaction(unit.hex, faction, units);
    };
    GameEngine.prototype.getAllUnitsForFaction = function (faction) {
        var placements = this.getPlacementMapForFaction(faction);
        var overflowMap = this.getPlacementOverflowMapForFaction(faction);
        var all = [];
        placements.forEach(function (unit, key) {
            var _a;
            all.push(unit);
            var overflow = (_a = overflowMap.get(key)) !== null && _a !== void 0 ? _a : [];
            overflow.forEach(function (entry) { return all.push(entry); });
        });
        overflowMap.forEach(function (units, key) {
            if (!placements.has(key)) {
                units.forEach(function (unit) { return all.push(unit); });
            }
        });
        return all;
    };
    GameEngine.prototype.getActionFlagKey = function (unit) {
        return this.getSquadronId(unit);
    };
    GameEngine.prototype.getUnitActionFlags = function (faction, unit) {
        var _a, _b;
        var key = this.getActionFlagKey(unit);
        if (faction === "Bot") {
            return (_a = this.botActionFlags.get(key)) !== null && _a !== void 0 ? _a : this.createDefaultActionFlags();
        }
        if (faction === "Player") {
            return (_b = this.playerActionFlags.get(key)) !== null && _b !== void 0 ? _b : this.createDefaultActionFlags();
        }
        return this.createDefaultActionFlags();
    };
    GameEngine.prototype.setUnitActionFlags = function (faction, unit, flags) {
        var key = this.getActionFlagKey(unit);
        if (faction === "Bot") {
            this.botActionFlags.set(key, flags);
            return;
        }
        if (faction === "Player") {
            this.playerActionFlags.set(key, flags);
        }
    };
    GameEngine.prototype.deleteUnitActionFlags = function (faction, unit) {
        var key = this.getActionFlagKey(unit);
        if (faction === "Bot") {
            this.botActionFlags.delete(key);
            return;
        }
        if (faction === "Player") {
            this.playerActionFlags.delete(key);
        }
    };
    GameEngine.prototype.buildCoalitionHexMembers = function (hex, faction) {
        var _this = this;
        var members = [];
        var pushFaction = function (candidateFaction) {
            _this.getUnitsAtHexForFaction(hex, candidateFaction).forEach(function (unit) {
                members.push({
                    unitId: _this.ensureUnitId(unit),
                    unit: unit,
                    faction: candidateFaction,
                    isAutomated: candidateFaction === "Player" && _this.isAutomatedPlayerUnit(unit)
                });
            });
        };
        if (faction === "Player" || faction === "Ally") {
            pushFaction("Player");
            pushFaction("Ally");
            return members;
        }
        pushFaction("Bot");
        return members;
    };
    GameEngine.prototype.getHostileUnitsAtHex = function (hex, attackerFaction) {
        var _this = this;
        if (attackerFaction === "Bot") {
            return __spreadArray(__spreadArray([], this.getUnitsAtHexForFaction(hex, "Player").map(function (unit) { return ({
                unitId: _this.ensureUnitId(unit),
                unit: unit,
                faction: "Player",
                isAutomated: false
            }); }), true), this.getUnitsAtHexForFaction(hex, "Ally").map(function (unit) { return ({
                unitId: _this.ensureUnitId(unit),
                unit: unit,
                faction: "Ally",
                isAutomated: false
            }); }), true);
        }
        return this.getUnitsAtHexForFaction(hex, "Bot").map(function (unit) { return ({
            unitId: _this.ensureUnitId(unit),
            unit: unit,
            faction: "Bot",
            isAutomated: false
        }); });
    };
    GameEngine.prototype.isStackCountedUnit = function (unit) {
        return !this.isSupplyTruckType(unit.type);
    };
    GameEngine.prototype.countStackedCombatUnitsAtHex = function (hex, faction) {
        var _this = this;
        return this.buildCoalitionHexMembers(hex, faction).filter(function (entry) { return _this.isStackCountedUnit(entry.unit); }).length;
    };
    GameEngine.prototype.canFactionEnterHex = function (unit, faction, hex) {
        var hostile = this.getHostileUnitsAtHex(hex, faction);
        if (hostile.length > 0) {
            return false;
        }
        if (!this.isStackCountedUnit(unit)) {
            return true;
        }
        return this.countStackedCombatUnitsAtHex(hex, faction) < 2;
    };
    GameEngine.prototype.findUnitInFactionAtHex = function (hex, faction, unitId) {
        var _this = this;
        var _a, _b;
        var units = this.getUnitsAtHexForFaction(hex, faction);
        if (units.length === 0) {
            return null;
        }
        if (unitId) {
            return (_a = units.find(function (candidate) { return _this.getSquadronId(candidate) === unitId; })) !== null && _a !== void 0 ? _a : null;
        }
        return (_b = units[0]) !== null && _b !== void 0 ? _b : null;
    };
    GameEngine.prototype.replaceUnitInFactionHex = function (faction, unit) {
        var _this = this;
        var unitId = this.getSquadronId(unit);
        var units = this.getUnitsAtHexForFaction(unit.hex, faction);
        var index = units.findIndex(function (candidate) { return _this.getSquadronId(candidate) === unitId; });
        if (index < 0) {
            return false;
        }
        units[index] = structuredClone(unit);
        this.setUnitsAtHexForFaction(unit.hex, faction, units);
        return true;
    };
    GameEngine.prototype.removeUnitFromFactionHex = function (faction, hex, unitId) {
        var _this = this;
        var units = this.getUnitsAtHexForFaction(hex, faction);
        if (units.length === 0) {
            return null;
        }
        var removalIndex = unitId
            ? units.findIndex(function (candidate) { return _this.getSquadronId(candidate) === unitId; })
            : 0;
        if (removalIndex < 0) {
            return null;
        }
        var removed = units.splice(removalIndex, 1)[0];
        this.setUnitsAtHexForFaction(hex, faction, units);
        return removed ? structuredClone(removed) : null;
    };
    GameEngine.prototype.updateIdleRegistryFor = function (hexKey) {
        var _this = this;
        var hex = this.parseAxialKey(hexKey);
        if (!hex) {
            this.playerIdleUnitKeys.delete(hexKey);
            return;
        }
        var units = this.getUnitsAtHexForFaction(hex, "Player").filter(function (unit) { return _this.shouldTrackAsPlayerIdle(unit); });
        if (units.some(function (unit) {
            var flags = _this.getUnitActionFlags("Player", unit);
            return flags.movementPointsUsed === 0 && flags.attacksUsed === 0 && !unit.onSentry;
        })) {
            this.playerIdleUnitKeys.add(hexKey);
        }
        else {
            this.playerIdleUnitKeys.delete(hexKey);
        }
    };
    GameEngine.prototype.rebuildPlayerIdleUnitSet = function () {
        var _this = this;
        this.playerIdleUnitKeys.clear();
        var visited = new Set();
        this.getAllUnitsForFaction("Player").forEach(function (unit) {
            var key = (0, Hex_1.axialKey)(unit.hex);
            if (visited.has(key)) {
                return;
            }
            visited.add(key);
            if (!_this.shouldTrackAsPlayerIdle(unit)) {
                _this.updateIdleRegistryFor(key);
                return;
            }
            _this.updateIdleRegistryFor(key);
        });
    };
    /** Clear suppression status for units of the given faction at the start of their turn. */
    GameEngine.prototype.clearSuppressionFor = function (faction) {
        var _this = this;
        var clearedCount = 0;
        this.getAllUnitsForFaction(faction).forEach(function (unit) {
            if (unit.suppressedBy && unit.suppressedBy.length > 0) {
                console.log("[GameEngine] Clearing suppression for ".concat(faction, " unit ").concat(unit.type, " at ").concat((0, Hex_1.axialKey)(unit.hex), ", was suppressed by:"), unit.suppressedBy);
                unit.suppressedBy = [];
                _this.replaceUnitInFactionHex(faction, unit);
                clearedCount++;
            }
        });
        if (clearedCount > 0) {
            console.log("[GameEngine] *** CLEARED SUPPRESSION *** for ".concat(clearedCount, " ").concat(faction, " units"));
        }
    };
    /** Clear sentry stance for units of the given faction at the start of their next activation. */
    GameEngine.prototype.clearSentryFor = function (faction) {
        var _this = this;
        this.getAllUnitsForFaction(faction).forEach(function (unit) {
            if (unit.onSentry) {
                unit.onSentry = false;
                _this.replaceUnitInFactionHex(faction, unit);
            }
        });
    };
    GameEngine.prototype.reconcilePlayerIdleUnitSet = function () {
        var _this = this;
        for (var _i = 0, _a = Array.from(this.playerIdleUnitKeys); _i < _a.length; _i++) {
            var key = _a[_i];
            var hex = this.parseAxialKey(key);
            if (!hex || this.getUnitsAtHexForFaction(hex, "Player").length === 0) {
                this.playerIdleUnitKeys.delete(key);
                continue;
            }
            var activeUnits = this.getUnitsAtHexForFaction(hex, "Player").filter(function (unit) { return _this.shouldTrackAsPlayerIdle(unit); });
            if (!activeUnits.some(function (unit) {
                var flags = _this.getUnitActionFlags("Player", unit);
                return flags.movementPointsUsed === 0 && flags.attacksUsed === 0 && !unit.onSentry;
            })) {
                this.playerIdleUnitKeys.delete(key);
            }
        }
    };
    GameEngine.prototype.getIdlePlayerUnitKeys = function () {
        this.reconcilePlayerIdleUnitSet();
        return Array.from(this.playerIdleUnitKeys);
    };
    /**
     * Translates the mobility bonus percentage into a scalar applied to unit movement allowances.
     */
    GameEngine.prototype.commanderMoveScalar = function () {
        var _a;
        var pct = (_a = this.playerCommanderStats.moveBonus) !== null && _a !== void 0 ? _a : 0;
        return Math.max(0, 1 + pct / 100);
    };
    /**
     * Converts the supply bonus into a consumption/attrition reduction multiplier.
     * Returns 1 for the bot faction to prevent cross-faction leakage.
     */
    GameEngine.prototype.commanderSupplyScalar = function (faction) {
        var _a, _b, _c, _d;
        if (faction === "Player") {
            var bonus = (_b = (_a = this.playerSide.general) === null || _a === void 0 ? void 0 : _a.supplyBonus) !== null && _b !== void 0 ? _b : 0;
            return 1 - bonus / 100;
        }
        if (faction === "Ally" && this.allySide) {
            var bonus = (_d = (_c = this.allySide.general) === null || _c === void 0 ? void 0 : _c.supplyBonus) !== null && _d !== void 0 ? _d : 0;
            return 1 - bonus / 100;
        }
        return 1;
    };
    /**
     * Rounds scaled supply costs to two decimals so ledgers remain readable while preserving gradual savings.
     */
    GameEngine.prototype.scaleSupplyAmount = function (amount, scalar) {
        if (amount <= 0) {
            return 0;
        }
        return Number((amount * scalar).toFixed(2));
    };
    /**
     * Placeholder helper seeding a tiny roster of support assets so UI scaffolding can render meaningful
     * cards until the real campaign data is wired. Intentional TODO marker keeps the follow-up visible.
     */
    GameEngine.prototype.seedSupportAssets = function () {
        if (this.privateSupportAssets.length > 0) {
            return;
        }
        this.privateSupportAssets.push({
            id: "support-artillery-alpha",
            label: "Heavy Artillery Battery",
            type: "artillery",
            status: "ready",
            charges: 2,
            maxCharges: 2,
            cooldown: 0,
            maxCooldown: 3,
            assignedHex: null,
            notes: "Off-map heavy artillery battery available for observer-directed fire missions.",
            queuedHex: null,
            queuedByHex: null
        }, {
            id: "support-airstrike-bravo",
            label: "Strike Wing Bravo",
            type: "air",
            status: "cooldown",
            charges: 1,
            maxCharges: 2,
            cooldown: 2,
            maxCooldown: 4,
            assignedHex: null,
            notes: "Fast attack squadron cycling through refuel/rearm",
            queuedHex: null,
            queuedByHex: null
        }, {
            id: "support-engineer-charlie",
            label: "Engineer Company Charlie",
            type: "engineering",
            status: "maintenance",
            charges: 0,
            maxCharges: 2,
            cooldown: 1,
            maxCooldown: 2,
            assignedHex: null,
            notes: "Bridging gear inspection scheduled",
            queuedHex: null,
            queuedByHex: null
        });
        this.invalidateSupportSnapshot();
    };
    /**
     * Finds the first reserve index whose scenario type matches the provided UI allocation key using DeploymentState aliasing.
     */
    GameEngine.prototype.findReserveIndexByUnitKey = function (unitKey) {
        var deploymentState = (0, DeploymentState_1.ensureDeploymentState)();
        var scenarioType = deploymentState.getScenarioTypeForUnitKey(unitKey);
        // Try to find a matching reserve
        var index = this.reserves.findIndex(function (reserve) {
            // First, try exact allocationKey match
            if (reserve.allocationKey === unitKey) {
                return true;
            }
            // Then try scenario type lookup
            if (scenarioType && reserve.unit.type === scenarioType) {
                return true;
            }
            // Finally, try reverse lookup - if the reserve's scenario type maps back to this unitKey
            var reserveUnitKey = deploymentState.getUnitKeyForScenarioType(reserve.unit.type);
            if (reserveUnitKey === unitKey) {
                return true;
            }
            return false;
        });
        // If not found, log details for debugging
        if (index < 0) {
            console.warn("[GameEngine] findReserveIndexByUnitKey failed", {
                unitKey: unitKey,
                scenarioType: scenarioType,
                availableReserves: this.reserves.map(function (r, i) { return ({
                    index: i,
                    allocationKey: r.allocationKey,
                    scenarioType: r.unit.type,
                    mappedKey: deploymentState.getUnitKeyForScenarioType(r.unit.type)
                }); })
            });
        }
        return index;
    };
    /**
     * Shared deployment write-path used by deployUnit() and deployUnitByKey() once the reserve entry has been resolved.
     */
    GameEngine.prototype.commitDeployment = function (hex, entry) {
        var _a, _b;
        var key = (0, Hex_1.axialKey)(hex);
        var clone = structuredClone(entry.unit);
        clone.hex = structuredClone(hex);
        this.ensureUnitId(clone);
        if (!this.canFactionEnterHex(clone, "Player", hex)) {
            throw new Error("Hex ".concat(this.formatAxial(hex), " cannot accept another deployed unit."));
        }
        var deploymentState = (0, DeploymentState_1.ensureDeploymentState)();
        var allocationKey = (_a = entry.allocationKey) !== null && _a !== void 0 ? _a : deploymentState.getUnitKeyForScenarioType(clone.type);
        if (allocationKey) {
            var sprite = (_b = entry.sprite) !== null && _b !== void 0 ? _b : deploymentState.getSpritePath(allocationKey);
            if (sprite) {
                deploymentState.registerSprite(allocationKey, sprite);
            }
        }
        this.addUnitToFactionHex("Player", clone);
        this.playerIdleUnitKeys.add(key);
        // Refresh cached roster data so battle panels reflect newly deployed units without a manual refresh.
        this.invalidateRosterCache();
    };
    /**
     * Converts an axial key string back into Axial coordinates; throws if malformed so callers fail fast during deployment orchestration.
     */
    GameEngine.parseAxialKey = function (hexKey) {
        var _a = hexKey.split(","), qPart = _a[0], rPart = _a[1];
        var q = Number.parseInt(qPart !== null && qPart !== void 0 ? qPart : "", 10);
        var r = Number.parseInt(rPart !== null && rPart !== void 0 ? rPart : "", 10);
        if (Number.isNaN(q) || Number.isNaN(r)) {
            throw new Error("Invalid axial key '".concat(hexKey, "'. Expected format 'q,r'."));
        }
        return { q: q, r: r };
    };
    /**
     * Builds a fully-initialized engine from a serialized battle snapshot. The helper instantiates a fresh
     * engine using the provided config and then hydrates placements, reserves, and turn metadata so callers
     * can resume previous sessions without touching private internals.
     */
    GameEngine.fromSerialized = function (config, state) {
        var engine = new GameEngine(config);
        engine.hydrateFromSerialized(state);
        return engine;
    };
    GameEngine.buildScenarioUnitsFromAllocation = function (allocations, unitTypes) {
        return allocations.map(function (allocation) {
            var _a, _b, _c, _d, _e;
            var definition = unitTypes[allocation.unitType];
            if (!definition) {
                throw new Error("Unknown unit type '".concat(allocation.unitType, "'."));
            }
            return {
                type: allocation.unitType,
                hex: structuredClone(allocation.hex),
                strength: (_a = allocation.strength) !== null && _a !== void 0 ? _a : 100,
                experience: (_b = allocation.experience) !== null && _b !== void 0 ? _b : 0,
                ammo: (_c = allocation.ammo) !== null && _c !== void 0 ? _c : definition.ammo,
                fuel: (_d = allocation.fuel) !== null && _d !== void 0 ? _d : definition.fuel,
                entrench: (_e = allocation.entrench) !== null && _e !== void 0 ? _e : 0,
                facing: (0, types_1.normalizeFacingDirection)(allocation.facing)
            };
        });
    };
    Object.defineProperty(GameEngine.prototype, "phase", {
        /** Current lifecycle phase (deployment, player turn, etc.). */
        get: function () {
            return this._phase;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(GameEngine.prototype, "turnNumber", {
        /** Numeric turn counter starting at 1. */
        get: function () {
            return this._turnNumber;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(GameEngine.prototype, "activeFaction", {
        /** Faction currently able to issue orders. */
        get: function () {
            return this._activeFaction;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(GameEngine.prototype, "baseCamp", {
        /** Base camp hex chosen by the player, or null if not yet selected. */
        get: function () {
            return this._baseCamp;
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(GameEngine.prototype, "playerUnits", {
        /**
         * Returns defensive copies of all player-controlled units currently on the map so UI lists can sync
         * without mutating the engine's internal state.
         */
        get: function () {
            return this.getAllUnitsForFaction("Player").map(function (unit) { return structuredClone(unit); });
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(GameEngine.prototype, "botUnits", {
        /**
         * Surfaces bot deployments with defensive copies for dashboards and debugging tools that render AI assets.
         */
        get: function () {
            return this.getAllUnitsForFaction("Bot").map(function (unit) { return structuredClone(unit); });
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(GameEngine.prototype, "allyUnits", {
        /**
         * Surfaces ally deployments with defensive copies. Ally units are AI-controlled but can be transferred to player control.
         */
        get: function () {
            return this.getAllUnitsForFaction("Ally").map(function (unit) { return structuredClone(unit); });
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(GameEngine.prototype, "reserveUnits", {
        /**
         * Supplies a snapshot of the reserve queue so UI panes can display upcoming reinforcements.
         */
        get: function () {
            return this.reserves.map(function (entry) { return ({ unit: structuredClone(entry.unit), definition: entry.definition }); });
        },
        enumerable: false,
        configurable: true
    });
    Object.defineProperty(GameEngine.prototype, "supportAssets", {
        /**
         * Returns defensive copies of support assets so UI consumers cannot mutate engine state directly.
         */
        get: function () {
            var _this = this;
            return this.privateSupportAssets.map(function (asset) { return _this.mapSupportAsset(asset); });
        },
        enumerable: false,
        configurable: true
    });
    /**
     * Provides an aggregated, readiness-grouped snapshot of all support assets for the Support sidebar.
     * The snapshot is cached and cloned so UI consumers can render without mutating engine state.
     */
    GameEngine.prototype.getSupportSnapshot = function () {
        if (this.cachedSupportSnapshot) {
            return structuredClone(this.cachedSupportSnapshot);
        }
        var snapshot = this.buildSupportSnapshot();
        this.cachedSupportSnapshot = snapshot;
        return structuredClone(snapshot);
    };
    /**
     * Returns the latest cached supply snapshot for the requested faction.
     * The snapshot is cloned to protect internal history arrays from mutation by UI layers.
     */
    GameEngine.prototype.getSupplySnapshot = function (faction) {
        if (faction === void 0) { faction = "Player"; }
        var history = this.supplyHistoryByFaction[faction];
        if (history.length === 0) {
            var snapshot = this.computeSupplySnapshot(faction);
            this.storeSupplySnapshot(faction, snapshot);
            return structuredClone(snapshot);
        }
        return structuredClone(history[history.length - 1]);
    };
    /**
     * Exposes a defensive copy of the rolling supply history so overlays can plot trendlines.
     */
    GameEngine.prototype.getSupplyHistory = function (faction) {
        if (faction === void 0) { faction = "Player"; }
        return this.supplyHistoryByFaction[faction].map(function (entry) { return structuredClone(entry); });
    };
    /**
     * Supplies a unified recon & intelligence snapshot so sidebar panels can render coordinated insights.
     * The engine lazily seeds a placeholder snapshot until live battlefield sensors are wired.
     */
    GameEngine.prototype.getReconIntelSnapshot = function () {
        var snapshot = this.ensureReconIntelSnapshot();
        return structuredClone(snapshot);
    };
    GameEngine.prototype.getEnemyContactSnapshot = function () {
        var _this = this;
        this.refreshPlayerEnemyContactStates();
        return Array.from(this.playerEnemyContactStates.values())
            .map(function (entry) { return _this.mapEnemyContactSnapshot(entry); })
            .filter(function (entry) { return entry !== null; })
            .sort(function (left, right) {
            var stateRank = _this.rankEnemyContactState(right.state) - _this.rankEnemyContactState(left.state);
            if (stateRank !== 0) {
                return stateRank;
            }
            return right.lastSeenTurn - left.lastSeenTurn;
        });
    };
    GameEngine.prototype.deployCounterIntel = function (targetHex) {
        if (this._phase !== "playerTurn" || this._activeFaction !== "Player") {
            return { ok: false, reason: "Counter-intelligence can only be deployed during your turn." };
        }
        if (!this.inBounds(targetHex)) {
            return { ok: false, reason: "Choose an in-bounds map hex for the deception screen." };
        }
        if (this.playerCounterIntelResources.deceptionCharges <= 0) {
            return { ok: false, reason: "No deception teams are available this turn." };
        }
        var duplicate = Array.from(this.counterIntelOperations.values()).find(function (entry) {
            return entry.faction === "Player" && (0, Hex_1.axialKey)(entry.targetHex) === (0, Hex_1.axialKey)(targetHex);
        });
        if (duplicate) {
            return { ok: false, reason: "A deception screen is already active on that axis." };
        }
        this.counterIntelIdCounter += 1;
        var operationId = "counter-intel-".concat(this.counterIntelIdCounter);
        this.counterIntelOperations.set(operationId, {
            id: operationId,
            faction: "Player",
            targetHex: structuredClone(targetHex),
            radius: GameEngine.COUNTER_INTEL_OPERATION_RADIUS,
            remainingTurns: GameEngine.COUNTER_INTEL_OPERATION_DURATION_TURNS,
            strength: GameEngine.COUNTER_INTEL_OPERATION_STRENGTH
        });
        this.playerCounterIntelResources.deceptionCharges = Math.max(0, this.playerCounterIntelResources.deceptionCharges - 1);
        this.ensureReconIntelSnapshot();
        return { ok: true, operationId: operationId };
    };
    GameEngine.prototype.verifyIntelBrief = function (briefId) {
        if (!briefId) {
            return { ok: false, reason: "Select an intelligence brief to verify." };
        }
        if (this._phase !== "playerTurn" || this._activeFaction !== "Player") {
            return { ok: false, reason: "Intel verification can only be ordered during your turn." };
        }
        var snapshot = this.ensureReconIntelSnapshot();
        var brief = snapshot.intelBriefs.find(function (entry) { return entry.id === briefId; });
        if (!brief) {
            return { ok: false, reason: "The selected intelligence brief is no longer available." };
        }
        var state = this.intelBriefStates.get(briefId);
        if (!state) {
            return { ok: false, reason: "The selected intelligence brief is not tracked by the current scenario." };
        }
        if (state.verificationStatus === "verified" || state.verificationStatus === "confirmed-false") {
            return { ok: false, reason: "That brief has already been resolved." };
        }
        if (this.playerCounterIntelResources.verificationCharges <= 0) {
            return { ok: false, reason: "No verification cells are available this turn." };
        }
        this.playerCounterIntelResources.verificationCharges = Math.max(0, this.playerCounterIntelResources.verificationCharges - 1);
        state.verificationStatus = state.isFalse ? "confirmed-false" : "verified";
        this.intelBriefStates.set(briefId, state);
        this.ensureReconIntelSnapshot();
        return { ok: true, status: state.verificationStatus };
    };
    /**
     * Allows upstream systems (e.g., recon pipeline) to push updated intel snapshots into the engine cache.
     * Downstream UI consumers will receive the refreshed data the next time they request it.
     */
    GameEngine.prototype.updateReconIntelSnapshot = function (nextSnapshot) {
        this.reconIntelSnapshot = structuredClone(nextSnapshot);
        this.ensureIntelBriefStatesForSnapshot(this.reconIntelSnapshot);
    };
    GameEngine.prototype.rankEnemyContactState = function (state) {
        switch (state) {
            case "visible":
                return 3;
            case "identified":
                return 2;
            case "spotted":
            default:
                return 1;
        }
    };
    GameEngine.prototype.mapEnemyContactSnapshot = function (entry) {
        var _a, _b, _c;
        var liveLookup = this.lookupUnitBySquadronId(entry.unitId, "Bot");
        var currentlyObserved = Boolean(liveLookup && entry.lastSeenTurn === this._turnNumber);
        var turnsSinceSeen = this._turnNumber - entry.lastSeenTurn;
        if (!currentlyObserved && turnsSinceSeen >= GameEngine.ENEMY_CONTACT_MEMORY_TURNS) {
            return null;
        }
        var contactHex = currentlyObserved && liveLookup ? liveLookup.unit.hex : entry.lastKnownHex;
        var contactHexKey = (0, Hex_1.axialKey)(contactHex);
        // Friendly occupation always outranks stale contact memory. If our troops now hold the hex, do not
        // surface a phantom enemy marker there or the UI will paint the contact over the player unit.
        if (this.playerPlacements.has(contactHexKey) || this.allyPlacements.has(contactHexKey)) {
            return null;
        }
        var state = currentlyObserved ? entry.state : "spotted";
        var strengthSource = currentlyObserved ? (_a = liveLookup === null || liveLookup === void 0 ? void 0 : liveLookup.unit.strength) !== null && _a !== void 0 ? _a : entry.lastKnownStrength : entry.lastKnownStrength;
        var strengthEstimate = this.resolveEnemyContactStrengthEstimate(state, strengthSource);
        return {
            unitId: entry.unitId,
            hex: structuredClone(contactHex),
            state: state,
            lastSeenTurn: entry.lastSeenTurn,
            source: entry.source,
            unitType: state === "spotted" ? undefined : (_c = (_b = liveLookup === null || liveLookup === void 0 ? void 0 : liveLookup.unit.type) !== null && _b !== void 0 ? _b : entry.knownUnitType) !== null && _c !== void 0 ? _c : undefined,
            strengthEstimate: strengthEstimate !== null && strengthEstimate !== void 0 ? strengthEstimate : undefined
        };
    };
    GameEngine.prototype.resolveEnemyContactStrengthEstimate = function (state, strength) {
        if (!Number.isFinite(strength)) {
            return null;
        }
        if (state === "visible") {
            return Math.max(0, Math.round(strength));
        }
        if (state === "identified") {
            return Math.min(100, Math.max(25, Math.round(strength / 25) * 25));
        }
        return null;
    };
    GameEngine.prototype.refreshPlayerEnemyContactStates = function () {
        var _this = this;
        var observers = this.listPlayerReconObservers();
        var liveBotIds = new Set();
        this.botPlacements.forEach(function (target) {
            var targetDefinition = _this.getUnitDefinition(target.type);
            if (targetDefinition.moveType === "air") {
                return;
            }
            var unitId = _this.ensureUnitId(target);
            liveBotIds.add(unitId);
            var observation = _this.evaluateEnemyObservationForPlayer(target, observers);
            var existing = _this.playerEnemyContactStates.get(unitId);
            if (observation) {
                _this.playerEnemyContactStates.set(unitId, {
                    unitId: unitId,
                    state: observation.state,
                    lastSeenTurn: _this._turnNumber,
                    lastKnownHex: structuredClone(target.hex),
                    lastKnownStrength: target.strength,
                    knownUnitType: target.type,
                    source: observation.source
                });
                return;
            }
            if (!existing) {
                return;
            }
            if (_this._turnNumber - existing.lastSeenTurn >= GameEngine.ENEMY_CONTACT_MEMORY_TURNS) {
                _this.playerEnemyContactStates.delete(unitId);
                return;
            }
            if (existing.state !== "spotted") {
                _this.playerEnemyContactStates.set(unitId, __assign(__assign({}, existing), { state: "spotted", lastKnownHex: structuredClone(existing.lastKnownHex) }));
            }
        });
        Array.from(this.playerEnemyContactStates.entries()).forEach(function (_a) {
            var unitId = _a[0], entry = _a[1];
            if (!liveBotIds.has(unitId) || _this._turnNumber - entry.lastSeenTurn >= GameEngine.ENEMY_CONTACT_MEMORY_TURNS) {
                _this.playerEnemyContactStates.delete(unitId);
            }
        });
    };
    GameEngine.prototype.listPlayerReconObservers = function () {
        var _this = this;
        return __spreadArray(__spreadArray([], Array.from(this.playerPlacements.values()), true), Array.from(this.allyPlacements.values()), true).filter(function (unit) {
            var definition = _this.getUnitDefinition(unit.type);
            return definition.moveType !== "air" || definition.class === "recon";
        });
    };
    GameEngine.prototype.evaluateEnemyObservationForPlayer = function (target, observers) {
        var lister = this.createLosLister();
        var bestContact = null;
        for (var _i = 0, observers_1 = observers; _i < observers_1.length; _i++) {
            var observer = observers_1[_i];
            var observerDef = this.getUnitDefinition(observer.type);
            var distance = (0, Hex_1.hexDistance)(observer.hex, target.hex);
            if (distance > this.resolveSpottingRange(observerDef)) {
                continue;
            }
            var hasLOS = (0, LOS_1.losClearAdvanced)({
                attackerClass: observerDef.class,
                attackerHex: observer.hex,
                targetHex: target.hex,
                isAttackerAir: observerDef.moveType === "air",
                lister: lister,
                purpose: "spotting"
            });
            if (!hasLOS) {
                continue;
            }
            var state = observerDef.class === "recon" || observerDef.moveType === "air" ? "identified" : "visible";
            var rank = this.rankEnemyContactState(state);
            if (!bestContact || rank > bestContact.rank) {
                bestContact = {
                    rank: rank,
                    state: state,
                    source: this.describeEnemyObservationSource(observerDef, observer)
                };
            }
        }
        if (!bestContact) {
            return null;
        }
        return { state: bestContact.state, source: bestContact.source };
    };
    /**
     * Auto-provisions a small convoy pool for AI-controlled factions when scenarios omit dedicated
     * logistics units. This keeps enemy supply lines targetable without requiring every mission author
     * to hand-place truck counters.
     */
    GameEngine.prototype.ensureBaselineSupplyConvoysForSide = function (side) {
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g;
        var units = (_a = side.units) !== null && _a !== void 0 ? _a : [];
        if (!side.units) {
            side.units = units;
        }
        if (units.some(function (unit) { return _this.isSupplyTruckType(unit.type); })) {
            return;
        }
        var frontlineUnits = units.filter(function (unit) {
            if (_this.isSupplyTruckType(unit.type)) {
                return false;
            }
            var definition = _this.getUnitDefinition(unit.type);
            return definition.moveType !== "air";
        });
        if (frontlineUnits.length === 0) {
            return;
        }
        var origin = (_b = side.hq) !== null && _b !== void 0 ? _b : (_c = frontlineUnits[0]) === null || _c === void 0 ? void 0 : _c.hex;
        if (!origin) {
            return;
        }
        var convoyTemplate = this.getUnitDefinition("Supply_Truck");
        var desiredConvoys = Math.max(1, Math.min(3, Math.ceil(frontlineUnits.length / 4)));
        var occupied = new Set();
        [(_d = this.playerSide.units) !== null && _d !== void 0 ? _d : [], (_e = this.botSide.units) !== null && _e !== void 0 ? _e : [], (_g = (_f = this.allySide) === null || _f === void 0 ? void 0 : _f.units) !== null && _g !== void 0 ? _g : []].forEach(function (group) {
            group.forEach(function (unit) { return occupied.add((0, Hex_1.axialKey)(unit.hex)); });
        });
        var stagingHexes = this.collectConvoyStagingHexes(origin, desiredConvoys, occupied);
        stagingHexes.forEach(function (hex) {
            var _a;
            units.push({
                type: "Supply_Truck",
                hex: structuredClone(hex),
                strength: 100,
                experience: 0,
                ammo: 0,
                fuel: (_a = convoyTemplate.fuel) !== null && _a !== void 0 ? _a : 70,
                entrench: 0,
                facing: "NW"
            });
            occupied.add((0, Hex_1.axialKey)(hex));
        });
    };
    /**
     * Finds a handful of open tiles around an HQ/source hex so auto-provisioned convoys spawn on-map
     * and remain immediately targetable.
     */
    GameEngine.prototype.collectConvoyStagingHexes = function (origin, limit, occupied) {
        var _this = this;
        var results = [];
        var queue = [structuredClone(origin)];
        var visited = new Set([(0, Hex_1.axialKey)(origin)]);
        while (queue.length > 0 && results.length < limit) {
            var hex = queue.shift();
            var key = (0, Hex_1.axialKey)(hex);
            if (this.inBounds(hex) && !occupied.has(key)) {
                results.push(structuredClone(hex));
            }
            (0, Hex_1.neighbors)(hex).forEach(function (neighbor) {
                var neighborKey = (0, Hex_1.axialKey)(neighbor);
                if (visited.has(neighborKey) || !_this.inBounds(neighbor)) {
                    return;
                }
                visited.add(neighborKey);
                queue.push(structuredClone(neighbor));
            });
        }
        return results;
    };
    GameEngine.prototype.describeEnemyObservationSource = function (definition, observer) {
        if (definition.moveType === "air") {
            return "Aerial Reconnaissance";
        }
        if (definition.class === "recon") {
            return "Recon Patrol";
        }
        if (observer.controlledBy === "AI") {
            return "Allied Forward Observer";
        }
        return "Frontline Observation";
    };
    GameEngine.prototype.resolveSpottingRange = function (definition) {
        var _a;
        var baseRange = Math.max(1, (_a = definition.vision) !== null && _a !== void 0 ? _a : 0);
        if (definition.moveType === "air") {
            return baseRange + GameEngine.AIR_SPOTTING_RANGE_BONUS;
        }
        if (definition.class === "recon") {
            return baseRange + GameEngine.RECON_SPOTTING_RANGE_BONUS;
        }
        return baseRange;
    };
    GameEngine.prototype.getPlayerEnemyContactStateAtHex = function (targetHex) {
        this.refreshPlayerEnemyContactStates();
        var targetKey = (0, Hex_1.axialKey)(targetHex);
        for (var _i = 0, _a = this.playerEnemyContactStates.values(); _i < _a.length; _i++) {
            var entry = _a[_i];
            var snapshot = this.mapEnemyContactSnapshot(entry);
            if (snapshot && (0, Hex_1.axialKey)(snapshot.hex) === targetKey) {
                return snapshot.state;
            }
        }
        return null;
    };
    GameEngine.prototype.mapSupportAsset = function (asset) {
        return {
            id: asset.id,
            label: asset.label,
            type: asset.type,
            status: asset.status,
            charges: asset.charges,
            maxCharges: asset.maxCharges,
            cooldown: asset.cooldown,
            maxCooldown: asset.maxCooldown,
            assignedHex: asset.assignedHex,
            notes: asset.notes,
            queuedHex: asset.queuedHex,
            queuedByHex: asset.queuedByHex
        };
    };
    /**
     * Clears the cached support snapshot so the next request recomputes readiness groupings.
     * Called whenever support asset state changes (e.g., queueing actions, cooldown ticks).
     */
    GameEngine.prototype.invalidateSupportSnapshot = function () {
        this.cachedSupportSnapshot = null;
    };
    /**
     * Queue a support asset for deployment to the selected hex. Marks the asset as queued and records the target.
     */
    GameEngine.prototype.queueSupportAction = function (assetId, targetHex) {
        var asset = this.getInternalSupportAsset(assetId);
        asset.queuedHex = (0, Hex_1.axialKey)(targetHex);
        asset.queuedByHex = null;
        asset.status = "queued";
        this.invalidateSupportSnapshot();
        this.invalidateRosterCache();
    };
    GameEngine.prototype.queueSupportActionFromUnit = function (callerHex, assetId, targetHex) {
        var _a;
        if (this._phase !== "playerTurn") {
            return false;
        }
        var caller = this.lookupUnit(callerHex, "Player");
        if (!caller || this.isAutomatedPlayerUnit(caller) || !this.getPlayerEnemyContactStateAtHex(targetHex)) {
            return false;
        }
        var callerDefinition = this.getUnitDefinition(caller.type);
        var canObserveSupport = callerDefinition.class === "infantry"
            || callerDefinition.class === "recon"
            || (callerDefinition.class === "specialist" && callerDefinition.moveType === "leg");
        if (!canObserveSupport) {
            return false;
        }
        var callerKey = (0, Hex_1.axialKey)(callerHex);
        var flags = (_a = this.playerActionFlags.get(callerKey)) !== null && _a !== void 0 ? _a : this.createDefaultActionFlags();
        var halfMovement = Math.floor(callerDefinition.movement / 2);
        if (flags.attacksUsed > 0 || flags.movementPointsUsed > halfMovement) {
            return false;
        }
        var asset = this.getInternalSupportAsset(assetId);
        if (asset.status !== "ready" || asset.charges <= 0) {
            return false;
        }
        asset.queuedHex = (0, Hex_1.axialKey)(targetHex);
        asset.queuedByHex = callerKey;
        asset.status = "queued";
        this.invalidateSupportSnapshot();
        this.invalidateRosterCache();
        return true;
    };
    /**
     * Exposes mission templates so UI layers can present identical copy without duplicating data lookups.
     * The catalog is read-only and sourced from `src/data/airMissions.ts`.
     */
    GameEngine.prototype.listAirMissionTemplates = function () {
        return this.airMissionCatalog;
    };
    /**
     * Returns lightweight counts used by HUD widgets to summarize Air Support activity for the active faction.
     */
    GameEngine.prototype.getAirSupportSummary = function () {
        var _this = this;
        var missions = Array.from(this.scheduledAirMissions.values()).filter(function (m) { return m.faction === _this._activeFaction; });
        var byStatus = missions.reduce(function (acc, m) {
            var _a;
            acc[m.status] = ((_a = acc[m.status]) !== null && _a !== void 0 ? _a : 0) + 1;
            return acc;
        }, { queued: 0, inFlight: 0, resolving: 0, completed: 0 });
        var refit = Array.from(this.airMissionRefitTimers.values()).filter(function (t) { return t.faction === _this._activeFaction; }).length;
        return {
            queued: byStatus.queued,
            inFlight: byStatus.inFlight,
            resolving: byStatus.resolving,
            completed: byStatus.completed,
            refit: refit
        };
    };
    /**
     * Returns the aircraft's combat radius in hexes at the provided origin for the active faction.
     * UI uses this to draw a range overlay when scheduling missions. Null when no friendly aircraft present.
     */
    GameEngine.prototype.getAircraftCombatRadiusHex = function (origin) {
        var unit = this.lookupUnit(origin, this._activeFaction);
        if (!unit) {
            return null;
        }
        var def = this.getUnitDefinition(unit.type);
        if (!this.isAircraft(def) || !def.airSupport) {
            return null;
        }
        var radiusKm = def.airSupport.combatRadiusKm;
        var radiusHex = Math.max(0, Math.floor(radiusKm / GameEngine.KILOMETERS_PER_HEX));
        return Number.isFinite(radiusHex) ? radiusHex : null;
    };
    /**
     * Returns refit turns for a friendly aircraft at the given origin, or null when not applicable.
     */
    GameEngine.prototype.getAircraftRefitTurns = function (origin) {
        var _a;
        var unit = this.lookupUnit(origin, this._activeFaction);
        if (!unit) {
            return null;
        }
        var def = this.getUnitDefinition(unit.type);
        if (!this.isAircraft(def) || !def.airSupport) {
            return null;
        }
        return (_a = def.airSupport.refitTurns) !== null && _a !== void 0 ? _a : null;
    };
    /** Returns serialized mission snapshots, optionally filtered to a specific faction for UI convenience. */
    GameEngine.prototype.getScheduledAirMissions = function (faction) {
        var _this = this;
        if (faction === void 0) { faction = this._activeFaction; }
        var missions = Array.from(this.scheduledAirMissions.values()).filter(function (mission) { return mission.faction === faction; });
        return missions.map(function (mission) { return _this.serializeAirMission(mission); });
    };
    /** Returns a snapshot of recorded sortie reports so UI/analytics can surface mission outcomes. */
    GameEngine.prototype.getAirMissionReports = function () {
        return this.airMissionReports.map(function (entry) { return structuredClone(entry); });
    };
    /** Returns and clears the queue of mission arrivals that transitioned to inFlight since last read. */
    GameEngine.prototype.consumeAirMissionArrivals = function () {
        if (this.pendingAirMissionArrivals.length === 0) {
            return [];
        }
        var copy = this.pendingAirMissionArrivals.map(function (e) { return (__assign(__assign({}, e), { targetHex: e.targetHex ? structuredClone(e.targetHex) : undefined })); });
        this.pendingAirMissionArrivals.length = 0;
        return copy;
    };
    /** Returns and clears any recorded air-to-air engagements since the last read. */
    GameEngine.prototype.consumeAirEngagements = function () {
        if (this.pendingAirEngagements.length === 0) {
            return [];
        }
        var copy = this.pendingAirEngagements.map(function (e) { return (__assign(__assign({}, e), { location: structuredClone(e.location), bomber: __assign({}, e.bomber), interceptors: e.interceptors.map(function (x) { return (__assign({}, x)); }), escorts: e.escorts.map(function (x) { return (__assign({}, x)); }) })); });
        this.pendingAirEngagements.length = 0;
        return copy;
    };
    GameEngine.prototype.consumeSupportImpactEvents = function () {
        if (this.pendingSupportImpactEvents.length === 0) {
            return [];
        }
        var copy = this.pendingSupportImpactEvents.map(function (event) { return (__assign(__assign({}, event), { targetHex: structuredClone(event.targetHex) })); });
        this.pendingSupportImpactEvents.length = 0;
        return copy;
    };
    /**
     * Register a new sortie for the active faction. Validation is intentionally strict to prevent partial state.
     * Future resolution phases will consume the queued missions at end-of-turn.
     */
    GameEngine.prototype.scheduleAirMission = function (request) {
        var result = this.tryScheduleAirMission(request);
        if (!result.ok) {
            throw new Error(result.reason);
        }
        return result.missionId;
    };
    /**
     * Structured scheduling entry point that returns error codes and reasons instead of throwing.
     * The method performs all validations and, on success, queues a mission identical to scheduleAirMission.
     */
    GameEngine.prototype.tryScheduleAirMission = function (request) {
        var _a, _b, _c;
        if (this._phase === "deployment" || this._phase === "completed") {
            return { ok: false, code: "PHASE_INVALID", reason: "Air missions can only be scheduled during an active battle." };
        }
        if (request.faction !== this._activeFaction) {
            return { ok: false, code: "WRONG_FACTION", reason: "Only the active faction may schedule missions during its turn." };
        }
        var template = this.getAirMissionTemplate(request.kind);
        // Resolve the squadron at the requested origin, preferring aircraft whose roles match the mission requirements.
        var originKey = (0, Hex_1.axialKey)(request.unitHex);
        var unit = null;
        // Collect candidate units at this origin: deployed first, then (for the player) matching reserves.
        var candidates = [];
        var placementMap = request.faction === "Player" ? this.playerPlacements : this.botPlacements;
        var deployed = (_a = placementMap.get(originKey)) !== null && _a !== void 0 ? _a : null;
        if (deployed) {
            candidates.push(deployed);
        }
        if (request.faction === "Player") {
            this.reserves.forEach(function (entry) {
                if ((0, Hex_1.axialKey)(entry.unit.hex) === originKey) {
                    candidates.push(entry.unit);
                }
            });
        }
        if (candidates.length === 0) {
            return { ok: false, code: "NO_UNIT_AT_HEX", reason: "No eligible squadron is stationed at the selected hex." };
        }
        // Prefer an aircraft with an Air Support profile whose roles intersect with the mission's allowed roles.
        var hasAircraft = false;
        var hasRoleEligibleAircraft = false;
        var sawAssigned = false;
        var sawNeedsRefit = false;
        var _loop_3 = function (candidate) {
            var def = this_3.getUnitDefinition(candidate.type);
            if (this_3.isAircraft(def)) {
                hasAircraft = true;
            }
            if (!this_3.isAircraft(def) || !def.airSupport) {
                return "continue";
            }
            var roles_1 = (_b = def.airSupport.roles) !== null && _b !== void 0 ? _b : [];
            if (!template.allowedRoles.some(function (role) { return roles_1.includes(role); })) {
                return "continue";
            }
            hasRoleEligibleAircraft = true;
            var candidateKey = this_3.getSquadronId(candidate);
            if (this_3.airMissionAssignmentsByUnit.has(candidateKey)) {
                sawAssigned = true;
                return "continue";
            }
            if (this_3.aircraftNeedsRearm(request.faction, candidateKey)) {
                sawNeedsRefit = true;
                return "continue";
            }
            unit = candidate;
            return "break";
        };
        var this_3 = this;
        for (var _i = 0, candidates_1 = candidates; _i < candidates_1.length; _i++) {
            var candidate = candidates_1[_i];
            var state_2 = _loop_3(candidate);
            if (state_2 === "break")
                break;
        }
        if (!unit) {
            if (!hasAircraft) {
                return {
                    ok: false,
                    code: "NOT_AIRCRAFT",
                    reason: "The selected squadron is not an aircraft and cannot fly air missions. Choose an air squadron in the Squadron list."
                };
            }
            if (hasRoleEligibleAircraft && (sawAssigned || sawNeedsRefit)) {
                if (sawNeedsRefit && !sawAssigned) {
                    return { ok: false, code: "NEEDS_REFIT", reason: "All eligible squadrons at this hex must rearm before another mission." };
                }
                if (sawAssigned && !sawNeedsRefit) {
                    return { ok: false, code: "ALREADY_ASSIGNED", reason: "All eligible squadrons at this hex already have missions queued." };
                }
                return { ok: false, code: "ALREADY_ASSIGNED", reason: "No eligible squadron at this hex is available to fly another mission." };
            }
            return { ok: false, code: "ROLE_NOT_ELIGIBLE", reason: "This aircraft is not suited to the requested mission." };
        }
        var unitDefinition = this.getUnitDefinition(unit.type);
        // Defensive guard: by construction, `unit` should already be an aircraft.
        if (!this.isAircraft(unitDefinition)) {
            return {
                ok: false,
                code: "NOT_AIRCRAFT",
                reason: "The selected squadron is not an aircraft and cannot fly air missions. Choose an air squadron in the Squadron list."
            };
        }
        if (!unitDefinition.airSupport) {
            return { ok: false, code: "NO_AIR_SUPPORT_PROFILE", reason: "This aircraft lacks an Air Support profile." };
        }
        // Enforce role eligibility against the template
        var roles = (_c = unitDefinition.airSupport.roles) !== null && _c !== void 0 ? _c : [];
        if (!template.allowedRoles.some(function (role) { return roles.includes(role); })) {
            return { ok: false, code: "ROLE_NOT_ELIGIBLE", reason: "This aircraft is not suited to the requested mission." };
        }
        // Use the stable squadronId (derived from unitId) as the mission's unit key so multiple
        // squadrons at the same base can each fly missions without collision.
        var squadronId = this.getSquadronId(unit);
        if (this.airMissionAssignmentsByUnit.has(squadronId)) {
            return { ok: false, code: "ALREADY_ASSIGNED", reason: "This squadron already has a mission queued." };
        }
        if (this.aircraftNeedsRearm(request.faction, squadronId)) {
            return { ok: false, code: "NEEDS_REFIT", reason: "This squadron must rearm before another mission." };
        }
        // Keep the hex-based key for airbase capacity checks (multiple squadrons can share a base).
        var originHexKey = (0, Hex_1.axialKey)(request.unitHex);
        if (template.requiresTarget && !request.targetHex) {
            return { ok: false, code: "TARGET_REQUIRED", reason: "This mission requires selecting a target hex." };
        }
        if (template.requiresFriendlyEscortTarget && !request.escortTargetHex) {
            return { ok: false, code: "ESCORT_TARGET_REQUIRED", reason: "Escort missions require pairing with a friendly unit." };
        }
        if (request.targetHex && unitDefinition.airSupport) {
            try {
                this.assertAirMissionRange(unitDefinition.airSupport, request.unitHex, request.targetHex);
            }
            catch (e) {
                return { ok: false, code: "OUT_OF_RANGE", reason: e.message };
            }
        }
        // Escort guardrails: target must exist and not already be in-flight.
        var escortTargetUnitKey;
        if (request.escortTargetHex) {
            var escortTargetUnit = this.lookupUnit(request.escortTargetHex, request.faction, true);
            if (!escortTargetUnit) {
                return { ok: false, code: "ESCORT_TARGET_MISSING", reason: "Escort target unit was not found at the selected hex." };
            }
            try {
                this.assertEscortDistance(unitDefinition.airSupport, request.unitHex, request.escortTargetHex);
            }
            catch (e) {
                return { ok: false, code: "OUT_OF_RANGE", reason: e.message };
            }
            // Use the stable squadronId of the escort target so we can find it later even if multiple units share a hex.
            escortTargetUnitKey = this.getSquadronId(escortTargetUnit);
            var existingStrike = Array.from(this.scheduledAirMissions.values()).find(function (m) { return m.faction === request.faction && m.template.kind === "strike" && m.unitKey === escortTargetUnitKey && (m.status === "inFlight" || m.status === "resolving"); });
            if (existingStrike) {
                return { ok: false, code: "ESCORT_TARGET_IN_FLIGHT", reason: "The protected strike package is already airborne." };
            }
        }
        // Airbase capacity: limit total queued departures from the origin hex when configured.
        // Note: capacity is checked per-hex, not per-squadron, so multiple squadrons at the same base share the limit.
        if (this.airbaseCapMap) {
            var cap = this.airbaseCapMap[originHexKey];
            if (typeof cap === "number" && cap >= 0) {
                var queuedFromBase = Array.from(this.scheduledAirMissions.values()).filter(function (m) { return m.status === "queued" && m.originHexKey === originHexKey; }).length;
                if (queuedFromBase >= cap) {
                    return { ok: false, code: "AIRBASE_CAPACITY_EXCEEDED", reason: "Airbase launch queue is at capacity for this hex." };
                }
            }
        }
        // Passed all validations: queue the mission.
        var missionId = this.nextAirMissionId();
        var targetUnitKey;
        if (template.kind === "strike" && request.targetHex) {
            var opponentPlacements = request.faction === "Player" ? this.botPlacements : this.playerPlacements;
            var defender = opponentPlacements.get((0, Hex_1.axialKey)(request.targetHex));
            if (defender) {
                this.ensureUnitId(defender);
                targetUnitKey = defender.unitId;
            }
        }
        var mission = {
            id: missionId,
            template: template,
            faction: request.faction,
            // Store the stable squadronId so resolution can find the unit even if it moves or shares a base.
            unitKey: squadronId,
            // Preserve the origin hex for airbase capacity tracking and animation starting positions.
            originHexKey: originHexKey,
            unitType: unit.type,
            status: "queued",
            launchTurn: this._turnNumber,
            turnsRemaining: 0,
            targetHex: request.targetHex ? structuredClone(request.targetHex) : undefined,
            targetUnitKey: targetUnitKey,
            escortTargetUnitKey: escortTargetUnitKey,
            interceptions: 0,
            airCombatDamageInflicted: 0,
            airCombatDamageTaken: 0,
            airCombatKills: 0
        };
        this.scheduledAirMissions.set(missionId, mission);
        this.airMissionAssignmentsByUnit.set(squadronId, missionId);
        return { ok: true, missionId: missionId };
    };
    /** Cancels a queued air mission for the active faction. Returns true when a mission was canceled. */
    GameEngine.prototype.cancelQueuedAirMission = function (missionId) {
        var mission = this.scheduledAirMissions.get(missionId);
        if (!mission) {
            return false;
        }
        if (mission.faction !== this._activeFaction) {
            return false;
        }
        if (mission.status !== "queued") {
            return false;
        }
        // Free the unit assignment lock and drop the mission.
        this.scheduledAirMissions.delete(missionId);
        this.clearAirMissionAssignment(mission);
        return true;
    };
    /**
     * Cancel any queued support orders so the asset returns to its previous readiness cycle.
     */
    GameEngine.prototype.cancelQueuedSupport = function (assetId) {
        var asset = this.getInternalSupportAsset(assetId);
        if (asset.status !== "queued") {
            return false;
        }
        asset.queuedHex = null;
        asset.queuedByHex = null;
        if (asset.cooldown > 0) {
            asset.status = "cooldown";
        }
        else if (asset.charges > 0) {
            asset.status = "ready";
        }
        else {
            asset.status = "maintenance";
        }
        this.invalidateSupportSnapshot();
        this.invalidateRosterCache();
        return true;
    };
    GameEngine.prototype.resolveQueuedSupportActions = function () {
        var _this = this;
        var queuedAssets = Array.from(this.privateSupportAssets.values()).filter(function (a) { return a.status === "queued" && a.queuedHex; });
        var mutated = false;
        this.privateSupportAssets.forEach(function (asset) {
            var _a;
            if (asset.status !== "queued" || !asset.queuedHex) {
                return;
            }
            var targetKey = asset.queuedHex;
            var targetHex = GameEngine.parseAxialKey(targetKey);
            var defender = (_a = _this.botPlacements.get(targetKey)) !== null && _a !== void 0 ? _a : null;
            var damage = 0;
            var destroyed = false;
            var targetUnitType;
            if (defender) {
                targetUnitType = defender.type;
                damage = Math.min(Math.max(0, Math.round(defender.strength)), 22);
                var updatedDefender = structuredClone(defender);
                updatedDefender.strength = Math.max(0, defender.strength - damage);
                if (updatedDefender.strength <= 0) {
                    destroyed = true;
                    _this.botPlacements.delete(targetKey);
                    _this.removeBotSupplyEntryFor(targetHex);
                    _this.botAttackAmmo.delete(targetKey);
                }
                else {
                    _this.botPlacements.set(targetKey, updatedDefender);
                    _this.syncBotStrength(targetHex, updatedDefender.strength);
                }
                mutated = true;
            }
            _this.pendingSupportImpactEvents.push({
                assetId: asset.id,
                label: asset.label,
                targetHex: structuredClone(targetHex),
                targetFaction: "Bot",
                hit: defender !== null,
                damage: damage,
                destroyed: destroyed,
                targetUnitType: targetUnitType
            });
            asset.assignedHex = targetKey;
            asset.queuedHex = null;
            asset.queuedByHex = null;
            asset.cooldown = 0;
            asset.charges = Math.max(0, asset.charges - 1);
            asset.status = asset.charges > 0 ? "ready" : "maintenance";
            mutated = true;
        });
        if (!mutated) {
            return;
        }
        this.invalidateSupportSnapshot();
        this.invalidateRosterCache();
    };
    GameEngine.prototype.ensureIntelBriefStatesForSnapshot = function (snapshot) {
        var _this = this;
        snapshot.intelBriefs.forEach(function (brief) {
            if (_this.intelBriefStates.has(brief.id)) {
                return;
            }
            var isFalse = _this.resolveFalseIntelFlag(brief);
            var verificationStatus = brief.id.startsWith("brief-recon-")
                ? "verified"
                : isFalse && brief.confidence === "low"
                    ? "suspected-false"
                    : "unverified";
            _this.intelBriefStates.set(brief.id, {
                briefId: brief.id,
                isFalse: isFalse,
                verificationStatus: verificationStatus
            });
        });
    };
    GameEngine.prototype.resolveFalseIntelFlag = function (brief) {
        if (GameEngine.DEFAULT_FALSE_INTEL_BRIEF_IDS.has(brief.id)) {
            return true;
        }
        var text = "".concat(brief.title, " ").concat(brief.assessment, " ").concat(brief.projectedImpact).toLowerCase();
        return brief.confidence === "low" && (text.includes("spoof") || text.includes("diversion") || text.includes("conflict"));
    };
    GameEngine.prototype.countActiveReconObservers = function () {
        var _this = this;
        return this.listPlayerReconObservers().filter(function (unit) {
            var definition = _this.getUnitDefinition(unit.type);
            return definition.class === "recon" || definition.moveType === "air";
        }).length;
    };
    GameEngine.prototype.summarizeEnemyContactAnchors = function (contacts) {
        var anchors = Array.from(new Set(contacts.slice(0, 3).map(function (contact) { return (0, Hex_1.axialKey)(contact.hex); })));
        return anchors.length > 0 ? anchors.join(" / ") : "Unknown axis";
    };
    GameEngine.prototype.countKnownEnemyArmorContacts = function (contacts) {
        var _this = this;
        return contacts.reduce(function (count, contact) {
            if (!contact.unitType) {
                return count;
            }
            var definition = _this.getUnitDefinition(contact.unitType);
            return definition.class === "tank" || definition.class === "vehicle" ? count + 1 : count;
        }, 0);
    };
    GameEngine.prototype.buildBattlefieldReconSectors = function (contacts) {
        var _this = this;
        var currentContacts = contacts.filter(function (entry) { return entry.lastSeenTurn === _this._turnNumber; });
        var staleContacts = contacts.filter(function (entry) { return entry.lastSeenTurn < _this._turnNumber; });
        var sectors = [];
        if (currentContacts.length > 0) {
            var visibleCount = currentContacts.filter(function (entry) { return entry.state === "visible"; }).length;
            var identifiedCount = currentContacts.filter(function (entry) { return entry.state === "identified"; }).length;
            var staleInPicture = currentContacts.filter(function (entry) { return entry.state === "spotted"; }).length;
            var confidence = visibleCount > 0 ? "high" : identifiedCount > 0 ? "medium" : "low";
            var coordinates = this.summarizeEnemyContactAnchors(currentContacts);
            var armorContacts = this.countKnownEnemyArmorContacts(currentContacts);
            sectors.push({
                id: "sector-recon-current",
                name: "Live Contact Picture",
                summary: armorContacts > 0
                    ? "".concat(currentContacts.length, " hostile contact").concat(currentContacts.length === 1 ? "" : "s", " plotted near ").concat(coordinates, ", including ").concat(armorContacts, " armored formation").concat(armorContacts === 1 ? "" : "s", ".")
                    : "".concat(currentContacts.length, " hostile contact").concat(currentContacts.length === 1 ? "" : "s", " plotted near ").concat(coordinates, "."),
                timeframe: "current",
                confidence: confidence,
                linkedBriefs: ["brief-recon-current"],
                coordinates: coordinates,
                activity: visibleCount > 0
                    ? "".concat(visibleCount, " formation").concat(visibleCount === 1 ? "" : "s", " under direct observation, ").concat(identifiedCount, " held by recon sensors, ").concat(staleInPicture, " carried as stale contact memory.")
                    : "".concat(identifiedCount, " formation").concat(identifiedCount === 1 ? "" : "s", " held by recon sensors; fires can be cued without exposing line battalions.")
            });
        }
        else {
            var reconAssets = this.countActiveReconObservers();
            sectors.push({
                id: "sector-recon-gap",
                name: "Recon Coverage Gap",
                summary: reconAssets > 0
                    ? "Recon screen has not confirmed enemy positions this turn."
                    : "No dedicated recon elements are feeding the operational picture.",
                timeframe: "current",
                confidence: reconAssets > 0 ? "medium" : "low",
                linkedBriefs: ["brief-recon-gap"],
                coordinates: "Front-wide",
                activity: reconAssets > 0
                    ? "Last known contacts have faded. Push scouts forward or re-task aircraft before committing reserves."
                    : "Deploy recon battalions or launch scout aircraft to rebuild the enemy picture."
            });
        }
        if (staleContacts.length > 0) {
            var coordinates = this.summarizeEnemyContactAnchors(staleContacts);
            sectors.push({
                id: "sector-recon-last",
                name: "Last Reliable Contact",
                summary: "".concat(staleContacts.length, " enemy contact").concat(staleContacts.length === 1 ? "" : "s", " remain on the board as last-known positions near ").concat(coordinates, "."),
                timeframe: "last",
                confidence: staleContacts.some(function (entry) { return entry.unitType; }) ? "medium" : "low",
                linkedBriefs: ["brief-recon-last"],
                coordinates: coordinates,
                activity: "These plots are aging. Reconfirm them before committing reserves or planning interdiction fires."
            });
        }
        return sectors;
    };
    GameEngine.prototype.buildBattlefieldIntelBriefs = function (contacts, sectors) {
        var _this = this;
        var currentContacts = contacts.filter(function (entry) { return entry.lastSeenTurn === _this._turnNumber; });
        var staleContacts = contacts.filter(function (entry) { return entry.lastSeenTurn < _this._turnNumber; });
        var briefs = [];
        if (currentContacts.length > 0) {
            var armorContacts = this.countKnownEnemyArmorContacts(currentContacts);
            var visibleCount = currentContacts.filter(function (entry) { return entry.state === "visible"; }).length;
            briefs.push({
                id: "brief-recon-current",
                title: armorContacts > 0 ? "Enemy armored elements fixed" : "Enemy contact picture refreshed",
                assessment: armorContacts > 0
                    ? "".concat(armorContacts, " armored formation").concat(armorContacts === 1 ? "" : "s", " are now plotted inside the live contact picture. Direct observation and recon hand-offs can cue counter-fire before the enemy closes.")
                    : "".concat(currentContacts.length, " enemy contact").concat(currentContacts.length === 1 ? "" : "s", " are tracked by the recon network. The contact picture is now good enough to shape fires and reserve posture."),
                timeframe: "current",
                confidence: visibleCount > 0 ? "high" : "medium",
                linkedSectors: sectors.filter(function (sector) { return sector.id === "sector-recon-current"; }).map(function (sector) { return sector.id; }),
                source: visibleCount > 0 ? "Frontline Observation" : "Recon Network",
                recommendedAction: armorContacts > 0
                    ? "Shift anti-armor fires and hold reserves on the tracked axis while recon keeps the enemy fixed."
                    : "Use the live contact picture to align fires, screen flanks, and protect convoy routes.",
                projectedImpact: armorContacts > 0
                    ? "Shift anti-armor assets and artillery onto the tracked axis while recon keeps the column fixed."
                    : "Exploit the refreshed picture to screen flanks and align supporting fires."
            });
        }
        else {
            var reconAssets = this.countActiveReconObservers();
            briefs.push({
                id: "brief-recon-gap",
                title: reconAssets > 0 ? "Enemy maneuver picture degraded" : "Recon net not established",
                assessment: reconAssets > 0
                    ? "Your recon elements are deployed, but they are not feeding any confirmed enemy contacts right now. The operational picture is degraded rather than empty."
                    : "No dedicated recon battalion or scout aircraft is currently building the contact picture, so enemy movement can develop without warning.",
                timeframe: "current",
                confidence: reconAssets > 0 ? "medium" : "low",
                linkedSectors: sectors.filter(function (sector) { return sector.id === "sector-recon-gap"; }).map(function (sector) { return sector.id; }),
                source: "Recon Network",
                recommendedAction: reconAssets > 0
                    ? "Push scouts onto likely avenues and re-establish contact before moving reserves."
                    : "Commit recon assets before you trust the frontage to remain quiet.",
                projectedImpact: reconAssets > 0
                    ? "Push scouts onto likely avenues and re-establish line-of-sight before reallocating reserves."
                    : "Commit recon assets before you trust the enemy frontage to stay quiet."
            });
        }
        if (staleContacts.length > 0) {
            briefs.push({
                id: "brief-recon-last",
                title: "Last-known enemy plots are aging",
                assessment: "Some enemy markers now represent last-known positions rather than live observation. They still show likely approach lanes, but they must be revalidated before you commit a major response.",
                timeframe: "last",
                confidence: staleContacts.some(function (entry) { return entry.unitType; }) ? "medium" : "low",
                linkedSectors: sectors.filter(function (sector) { return sector.id === "sector-recon-last"; }).map(function (sector) { return sector.id; }),
                source: "Recon Network",
                recommendedAction: "Re-run reconnaissance over the aging plots before you swing reserves or logistics away from the sector.",
                projectedImpact: "Re-run reconnaissance over the aging plots before shifting logistics or reserve battalions off the main line."
            });
        }
        return briefs;
    };
    GameEngine.prototype.buildBattlefieldIntelAlerts = function (contacts) {
        var _this = this;
        var currentContacts = contacts.filter(function (entry) { return entry.lastSeenTurn === _this._turnNumber; });
        var staleContacts = contacts.filter(function (entry) { return entry.lastSeenTurn < _this._turnNumber; });
        var alerts = [];
        if (currentContacts.length > 0) {
            var directSightContacts = currentContacts.filter(function (entry) { return entry.state === "visible"; }).length;
            var identifiedContacts = currentContacts.filter(function (entry) { return entry.state === "identified"; }).length;
            alerts.push({
                id: "alert-recon-current",
                severity: directSightContacts > 0 ? "critical" : "warning",
                timeframe: "current",
                message: directSightContacts > 0
                    ? "".concat(directSightContacts, " enemy formation").concat(directSightContacts === 1 ? "" : "s", " are under direct observation. The contact picture is firing-grade.")
                    : "".concat(identifiedContacts, " enemy formation").concat(identifiedContacts === 1 ? "" : "s", " are identified by recon but not yet held by direct LOS."),
                action: directSightContacts > 0
                    ? "Exploit the live picture with artillery, anti-armor fires, and reserve positioning."
                    : "Keep recon sensors on station so the contact does not fall back to last-known only."
            });
        }
        else if (this.countActiveReconObservers() === 0) {
            alerts.push({
                id: "alert-recon-gap",
                severity: "warning",
                timeframe: "current",
                message: "No dedicated recon elements are feeding the enemy picture. Surprise movement risk is elevated.",
                action: "Deploy recon battalions or launch scout aircraft before the next turn cycle."
            });
        }
        if (staleContacts.length > 0) {
            alerts.push({
                id: "alert-recon-stale",
                severity: "info",
                timeframe: "last",
                message: "".concat(staleContacts.length, " contact").concat(staleContacts.length === 1 ? "" : "s", " now sit on last-known plots rather than live observation."),
                action: "Verify the stale plots before you pivot reserves or convoy routes."
            });
        }
        return alerts;
    };
    GameEngine.prototype.buildVisibleReconIntelSnapshot = function (baseSnapshot) {
        var _this = this;
        var contacts = this.getEnemyContactSnapshot();
        var activeOperations = this.getActiveCounterIntelOperations("Player");
        var battlefieldSectors = this.buildBattlefieldReconSectors(contacts);
        var battlefieldBriefs = this.buildBattlefieldIntelBriefs(contacts, battlefieldSectors);
        this.ensureIntelBriefStatesForSnapshot(__assign(__assign({}, baseSnapshot), { intelBriefs: __spreadArray(__spreadArray([], battlefieldBriefs, true), baseSnapshot.intelBriefs.filter(function (brief) { return !brief.id.startsWith("brief-recon-"); }), true) }));
        var baseAlerts = baseSnapshot.alerts.filter(function (alert) {
            return !alert.id.startsWith("alert-counter-intel-") && !alert.id.startsWith("alert-suspected-false-") && !alert.id.startsWith("alert-recon-");
        });
        var baseSectors = baseSnapshot.sectors.filter(function (sector) { return !sector.id.startsWith("sector-recon-"); });
        var combinedBriefs = __spreadArray(__spreadArray([], battlefieldBriefs, true), baseSnapshot.intelBriefs.filter(function (brief) { return !brief.id.startsWith("brief-recon-"); }), true);
        var visibleBriefs = combinedBriefs.map(function (brief) {
            var _a, _b, _c;
            var state = _this.intelBriefStates.get(brief.id);
            var verificationStatus = (_a = state === null || state === void 0 ? void 0 : state.verificationStatus) !== null && _a !== void 0 ? _a : "unverified";
            return __assign(__assign({}, brief), { verificationStatus: verificationStatus, source: (_b = brief.source) !== null && _b !== void 0 ? _b : _this.describeIntelBriefSource(brief), recommendedAction: verificationStatus === "confirmed-false"
                    ? "Disregard the false report and keep reserves committed to the confirmed axis."
                    : (_c = brief.recommendedAction) !== null && _c !== void 0 ? _c : brief.projectedImpact });
        });
        var suspectedFalseBriefs = visibleBriefs.filter(function (brief) { return brief.verificationStatus === "suspected-false"; }).length;
        var confirmedFalseBriefs = visibleBriefs.filter(function (brief) { return brief.verificationStatus === "confirmed-false"; }).length;
        var verifiedBriefs = visibleBriefs.filter(function (brief) { return brief.verificationStatus === "verified"; }).length;
        return __assign(__assign({}, baseSnapshot), { generatedAt: new Date().toISOString(), sectors: __spreadArray(__spreadArray([], battlefieldSectors.map(function (sector) { return (__assign({}, sector)); }), true), baseSectors.map(function (sector) { return (__assign({}, sector)); }), true), intelBriefs: visibleBriefs, alerts: __spreadArray(__spreadArray(__spreadArray([], this.buildBattlefieldIntelAlerts(contacts).map(function (alert) { return (__assign({}, alert)); }), true), baseAlerts.map(function (alert) { return (__assign({}, alert)); }), true), this.buildDynamicReconIntelAlerts(activeOperations, suspectedFalseBriefs), true), counterIntel: {
                deceptionCharges: this.playerCounterIntelResources.deceptionCharges,
                deceptionMaxCharges: GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES,
                verificationCharges: this.playerCounterIntelResources.verificationCharges,
                verificationMaxCharges: GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES,
                suspectedFalseBriefs: suspectedFalseBriefs,
                confirmedFalseBriefs: confirmedFalseBriefs,
                verifiedBriefs: verifiedBriefs,
                doctrineSummary: "Deception screens create a false operational axis for three turns. Verification confirms whether a brief is true or enemy-fed noise before you redeploy reserves.",
                activeOperations: activeOperations.map(function (operation) { return _this.mapCounterIntelOperation(operation); })
            } });
    };
    GameEngine.prototype.buildDynamicReconIntelAlerts = function (operations, suspectedFalseBriefs) {
        var alerts = [];
        if (operations.length > 0) {
            var focus_1 = operations[0];
            alerts.push({
                id: "alert-counter-intel-".concat(focus_1.id),
                severity: "info",
                timeframe: "current",
                message: "Counter-intelligence screen active near ".concat(this.formatAxial(focus_1.targetHex), ". Enemy maneuver estimates are being pulled off-axis."),
                action: "Mask the real main effort while the decoy axis burns enemy time."
            });
        }
        if (suspectedFalseBriefs > 0) {
            alerts.push({
                id: "alert-suspected-false-".concat(suspectedFalseBriefs),
                severity: "warning",
                timeframe: "current",
                message: "".concat(suspectedFalseBriefs, " brief").concat(suspectedFalseBriefs === 1 ? "" : "s", " carry deception risk and should be verified before you shift reserves."),
                action: "Commit verification cells before reacting to low-confidence intercepts."
            });
        }
        return alerts;
    };
    GameEngine.prototype.describeIntelBriefSource = function (brief) {
        if (brief.linkedSectors.length > 0 && brief.confidence === "high") {
            return "Field Recon + Analyst Fusion";
        }
        if (brief.assessment.toLowerCase().includes("signals") || brief.assessment.toLowerCase().includes("intercept")) {
            return "Signals Intercept";
        }
        return "Analyst Estimate";
    };
    GameEngine.prototype.mapCounterIntelOperation = function (operation) {
        return {
            id: operation.id,
            label: "Deception Screen ".concat(this.formatAxial(operation.targetHex)),
            targetHex: this.formatAxial(operation.targetHex),
            radius: operation.radius,
            remainingTurns: operation.remainingTurns,
            effect: "Enemy planning is biased toward this false approach."
        };
    };
    GameEngine.prototype.getActiveCounterIntelOperations = function (faction) {
        return Array.from(this.counterIntelOperations.values())
            .filter(function (entry) { return entry.faction === faction && entry.remainingTurns > 0; })
            .map(function (entry) { return (__assign(__assign({}, entry), { targetHex: structuredClone(entry.targetHex) })); });
    };
    GameEngine.prototype.replenishPlayerCounterIntelResources = function () {
        this.playerCounterIntelResources = {
            deceptionCharges: Math.min(GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES, this.playerCounterIntelResources.deceptionCharges + 1),
            verificationCharges: Math.min(GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES, this.playerCounterIntelResources.verificationCharges + 1)
        };
    };
    GameEngine.prototype.advanceCounterIntelTurn = function () {
        var _this = this;
        var expiredIds = [];
        this.counterIntelOperations.forEach(function (operation, key) {
            if (operation.remainingTurns <= 0) {
                expiredIds.push(key);
                return;
            }
            operation.remainingTurns = Math.max(0, operation.remainingTurns - 1);
            if (operation.remainingTurns <= 0) {
                expiredIds.push(key);
            }
        });
        expiredIds.forEach(function (key) { return _this.counterIntelOperations.delete(key); });
        this.replenishPlayerCounterIntelResources();
        this.ensureReconIntelSnapshot();
    };
    /**
     * Lazily hydrates the recon/intel snapshot cache, layering verification state and active counter-intel.
     */
    GameEngine.prototype.ensureReconIntelSnapshot = function () {
        if (!this.reconIntelSnapshot) {
            this.reconIntelSnapshot = (0, reconIntelSnapshot_1.getReconIntelSnapshot)();
        }
        this.ensureIntelBriefStatesForSnapshot(this.reconIntelSnapshot);
        this.reconIntelSnapshot = this.buildVisibleReconIntelSnapshot(this.reconIntelSnapshot);
        return this.reconIntelSnapshot;
    };
    /**
     * Reset deployment state by clearing placements and reserves. Called before presenting the
     * deployment UI. Does not mutate the scenario blueprint.
     */
    GameEngine.prototype.beginDeployment = function () {
        var _a;
        var _this = this;
        var _b;
        this.assertPhase("deployment", "Deployment can only begin in the deployment phase.");
        this.playerPlacements.clear();
        this.playerPlacementOverflow.clear();
        this.reserves.length = 0;
        this.airborneReserves.length = 0; // Clear airborne reserves as well.
        this.airMissionReports.length = 0; // Fresh deployment wipes historical sortie logs so saves start clean.
        this.playerAttackAmmo.clear();
        this.botAttackAmmo.clear();
        this.scheduledAirMissions.clear();
        this.airMissionAssignmentsByUnit.clear();
        this.airMissionIdCounter = 0;
        this.airMissionRefitTimers.clear();
        this.resetCounterIntelState();
        this.playerEnemyContactStates.clear();
        var deploymentState = (0, DeploymentState_1.ensureDeploymentState)();
        var reserveBlueprints = deploymentState.toReserveBlueprints();
        // Capture scenario-authored units (including any preDeployed flags) before allocations overwrite the roster.
        var scenarioUnits = ((_b = this.playerSide.units) !== null && _b !== void 0 ? _b : []).map(function (unit) { return structuredClone(unit); });
        if (reserveBlueprints.length > 0) {
            // Mirror precombat-approved units into the engine roster so reserves reflect the latest allocation state.
            this.playerSide.units = reserveBlueprints.map(function (blueprint) { return structuredClone(blueprint.unit); });
            // Preserve any scenario-authored predeployed units even when precombat allocations are present.
            var scenarioPredeployed = scenarioUnits
                .filter(function (unit) { return unit.preDeployed === true; })
                .map(function (unit) { return structuredClone(unit); });
            if (scenarioPredeployed.length > 0) {
                scenarioPredeployed.forEach(function (unit) {
                    _this.ensureUnitId(unit);
                    _this.addUnitToFactionHex("Player", unit);
                });
                // Keep predeployed units in the playerSide roster so downstream snapshots stay consistent.
                (_a = this.playerSide.units).push.apply(_a, scenarioPredeployed);
                console.warn("[GameEngine] Preserved scenario predeployed units alongside precombat allocations", {
                    count: scenarioPredeployed.length,
                    hexes: scenarioPredeployed.map(function (u) { return (0, Hex_1.axialKey)(u.hex); })
                });
            }
            this.populateReservesFromBlueprints(reserveBlueprints);
        }
        else {
            // Default to whatever units the scenario already listed for the player side.
            this.populateReservesFromPlayerUnits();
        }
        this._baseCamp = null;
        this.resetSupplyHistory();
        // Deployment roster changed drastically; drop cached snapshot so UI reads the refreshed reserve list immediately.
        this.invalidateRosterCache();
    };
    /**
     * Caches precombat requisitions so beginDeployment() can hydrate a fresh reserve list.
     * Entries are copied defensively to avoid mutating UI-managed data structures.
     */
    GameEngine.prototype.setQueuedAllocations = function (entries) {
        this.queuedAllocations = entries
            .filter(function (entry) { return entry.count > 0; })
            .map(function (entry) { return (__assign({}, entry)); });
    };
    /**
     * Builds reserve entries from the current `playerSide.units`, cloning each so UI movements never mutate the engine source.
     */
    GameEngine.prototype.populateReservesFromPlayerUnits = function () {
        var _this = this;
        var _a;
        var deploymentState = (0, DeploymentState_1.ensureDeploymentState)();
        ((_a = this.playerSide.units) !== null && _a !== void 0 ? _a : []).forEach(function (unit) {
            var _a;
            var clone = structuredClone(unit);
            // Assign a stable unique ID to each unit if missing so air squadrons can be distinguished.
            _this.ensureUnitId(clone);
            var definition = _this.getUnitDefinition(clone.type);
            var scenarioType = clone.type;
            var allocationKey = (_a = deploymentState.getUnitKeyForScenarioType(scenarioType)) !== null && _a !== void 0 ? _a : scenarioType;
            // Maintain alias tables even when the engine falls back to scenario defaults so DeploymentState can aggregate counts reliably.
            deploymentState.registerScenarioAlias(allocationKey, scenarioType);
            var sprite = deploymentState.getSpritePath(allocationKey);
            var isPreDeployed = unit.preDeployed === true;
            if (isPreDeployed) {
                // Treat scenario-predeployed player units as placed on the map at deployment start.
                _this.addUnitToFactionHex("Player", clone);
            }
            else {
                // Route airborne units to the separate airborne reserves pool.
                // These units are loaded at the airbase for air transport missions, not at the base camp.
                var isAirborne = allocationKey === "airborneDetachment" || clone.type === "Paratrooper";
                if (isAirborne) {
                    _this.airborneReserves.push({ unit: clone, definition: definition, allocationKey: allocationKey, sprite: sprite });
                }
                else {
                    // Preserve the allocation key and sprite so reserve presenters can render consistent imagery.
                    _this.reserves.push({ unit: clone, definition: definition, allocationKey: allocationKey, sprite: sprite });
                }
            }
        });
    };
    /**
     * Populates reserves using blueprints emitted by `DeploymentState`, preserving unit-key associations for deploy-by-key flows.
     */
    GameEngine.prototype.populateReservesFromBlueprints = function (blueprints) {
        var _this = this;
        var deploymentState = (0, DeploymentState_1.ensureDeploymentState)();
        blueprints.forEach(function (blueprint) {
            var _a;
            var clone = structuredClone(blueprint.unit);
            // Assign a stable unique ID to each unit if missing so air squadrons can be distinguished.
            _this.ensureUnitId(clone);
            var definition = _this.getUnitDefinition(clone.type);
            var sprite = (_a = blueprint.sprite) !== null && _a !== void 0 ? _a : deploymentState.getSpritePath(blueprint.unitKey);
            var scenarioType = clone.type;
            // Sync alias mapping so the mirror logic can reconcile engine scenario types with UI allocation keys.
            deploymentState.registerScenarioAlias(blueprint.unitKey, scenarioType);
            // Route airborne units to the separate airborne reserves pool.
            // These units are loaded at the airbase for air transport missions, not at the base camp.
            var isAirborne = blueprint.unitKey === "airborneDetachment" || clone.type === "Paratrooper";
            if (isAirborne) {
                _this.airborneReserves.push({ unit: clone, definition: definition, allocationKey: blueprint.unitKey, sprite: sprite });
            }
            else {
                // Blueprint metadata links back to the allocation key so deploy-by-key flows stay accurate.
                _this.reserves.push({ unit: clone, definition: definition, allocationKey: blueprint.unitKey, sprite: sprite });
            }
        });
    };
    /** Assign the commander-selected base camp and update supply origins accordingly. */
    GameEngine.prototype.setBaseCamp = function (hex) {
        this.assertPhase("deployment", "Base camp selection is limited to deployment.");
        this._baseCamp = { hex: structuredClone(hex), key: (0, Hex_1.axialKey)(hex) };
        this.playerAttackAmmo.clear(); // Reset aircraft attack ammo counters
    };
    /**
     * Deploy a unit from the reserve pool to a specific hex during the deployment phase.
     * Units are addressed by reserve index so UI state does not need to carry references.
     */
    GameEngine.prototype.deployUnit = function (hex, reserveIndex) {
        this.assertPhase("deployment", "Units can only be deployed during the deployment phase.");
        var entry = this.reserves[reserveIndex];
        if (!entry) {
            throw new Error("Reserve index out of range.");
        }
        if (this.isAircraft(entry.definition)) {
            throw new Error("Air units are controlled via Air Support and cannot be deployed on the ground map.");
        }
        // Commit the deployment before mutating the reserve queue so failed placements do not discard the unit.
        this.commitDeployment(hex, entry);
        this.reserves.splice(reserveIndex, 1);
        this.playerAttackAmmo.delete((0, Hex_1.axialKey)(hex));
    };
    /**
     * Deploy a unit by referencing its allocation key instead of relying on reserve indexes.
     * UI flows prefer stable keys, so we scan the reserve queue, remove the first matching entry, and forward to commitDeployment().
     */
    GameEngine.prototype.deployUnitByKey = function (hex, unitKey) {
        this.assertPhase("deployment", "Units can only be deployed during the deployment phase.");
        var index = this.findReserveIndexByUnitKey(unitKey);
        if (index < 0) {
            console.error("[GameEngine] deployUnitByKey failed to locate reserve", {
                unitKey: unitKey,
                reserves: this.reserves.map(function (reserve, reserveIndex) { return ({
                    reserveIndex: reserveIndex,
                    allocationKey: reserve.allocationKey,
                    scenarioType: reserve.unit.type
                }); })
            });
            throw new Error("No reserve unit found for key '".concat(unitKey, "'."));
        }
        var entry = this.reserves[index];
        if (!entry) {
            throw new Error("Reserve queue returned undefined entry for key '".concat(unitKey, "'."));
        }
        if (this.isAircraft(entry.definition)) {
            throw new Error("Air units are controlled via Air Support and cannot be deployed on the ground map.");
        }
        // Commit placement first so errors (e.g., hex already occupied) do not permanently remove the reserve.
        this.commitDeployment(hex, entry);
        this.reserves.splice(index, 1);
        this.playerAttackAmmo.delete((0, Hex_1.axialKey)(hex));
    };
    /** Verify that deployment can be undone and return the unit to reserves. */
    GameEngine.prototype.recallUnit = function (hex) {
        var _a;
        this.assertPhase("deployment", "Recalling units is only possible during deployment.");
        var key = (0, Hex_1.axialKey)(hex);
        var unit = this.playerPlacements.get(key);
        if (!unit) {
            return;
        }
        this.playerPlacements.delete(key);
        this.removeSupplyEntryFor(hex);
        var definition = this.getUnitDefinition(unit.type);
        var deploymentState = (0, DeploymentState_1.ensureDeploymentState)();
        var allocationKey = (_a = deploymentState.getUnitKeyForScenarioType(unit.type)) !== null && _a !== void 0 ? _a : unit.type;
        var sprite = deploymentState.getSpritePath(allocationKey);
        this.reserves.push({ unit: structuredClone(unit), definition: definition, allocationKey: allocationKey, sprite: sprite });
        // Unit returns to reserve pool; clear roster cache so reserve counts rise immediately in the UI.
        this.invalidateRosterCache();
    };
    /**
     * Recall a unit using the precomputed axial key string so UI emitters do not need to reconstruct Axial coordinates.
     */
    GameEngine.prototype.recallUnitByHexKey = function (hexKey) {
        var axial = GameEngine.parseAxialKey(hexKey);
        this.recallUnit(axial);
    };
    GameEngine.prototype.initializeFromAllocations = function (units) {
        var _a;
        var _b;
        this.assertPhase("deployment", "Allocations can only be loaded during deployment.");
        // Capture any scenario-predeployed units BEFORE replacing playerSide.units with allocations.
        // This preserves predeployed units even when precombat flows provide a replacement roster.
        var scenarioPredeployed = ((_b = this.playerSide.units) !== null && _b !== void 0 ? _b : [])
            .filter(function (unit) { return unit.preDeployed === true; })
            .map(function (unit) { return structuredClone(unit); });
        this.playerSide.units = units.map(function (unit) { return structuredClone(unit); });
        // Append preserved predeployed units so beginDeployment can detect and place them.
        if (scenarioPredeployed.length > 0) {
            (_a = this.playerSide.units).push.apply(_a, scenarioPredeployed);
        }
        this.beginDeployment();
    };
    /**
     * Applies a serialized battle state to the current engine instance. We clear existing placements and
     * reserves, rebuild them from the snapshot, and refresh phase/turn metadata to match the saved session.
     */
    GameEngine.prototype.hydrateFromSerialized = function (state) {
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g;
        this.playerPlacements.clear();
        this.botPlacements.clear();
        this.hexModifications.clear();
        this.reserves.length = 0;
        this.airborneReserves.length = 0;
        this.scheduledAirMissions.clear();
        this.airMissionAssignmentsByUnit.clear();
        this.airMissionRefitTimers.clear();
        this.airMissionReports.length = 0;
        this.counterIntelOperations.clear();
        this.intelBriefStates.clear();
        this.playerEnemyContactStates.clear();
        this.playerPlacementOverflow.clear();
        this.botPlacementOverflow.clear();
        this.allyPlacementOverflow.clear();
        state.playerPlacements.forEach(function (unit) {
            var clone = structuredClone(unit);
            // Preserve existing unitId from saved state or assign a new one if missing (legacy saves).
            _this.ensureUnitId(clone);
            _this.addUnitToFactionHex("Player", clone);
        });
        state.botPlacements.forEach(function (unit) {
            var clone = structuredClone(unit);
            // Preserve existing unitId from saved state or assign a new one if missing (legacy saves).
            _this.ensureUnitId(clone);
            _this.addUnitToFactionHex("Bot", clone);
        });
        state.reserves.forEach(function (unit) {
            var clone = structuredClone(unit);
            // Preserve existing unitId from saved state or assign a new one if missing (legacy saves).
            _this.ensureUnitId(clone);
            _this.reserves.push({ unit: clone, definition: _this.getUnitDefinition(clone.type) });
        });
        // Restore airborne reserves if present in the snapshot.
        if (Array.isArray(state.airborneReserves)) {
            state.airborneReserves.forEach(function (unit) {
                var clone = structuredClone(unit);
                _this.ensureUnitId(clone);
                _this.airborneReserves.push({ unit: clone, definition: _this.getUnitDefinition(clone.type) });
            });
        }
        if (Array.isArray(state.enemyContactStates)) {
            state.enemyContactStates.forEach(function (entry) {
                _this.playerEnemyContactStates.set(entry.unitId, {
                    unitId: entry.unitId,
                    state: entry.state,
                    lastSeenTurn: entry.lastSeenTurn,
                    lastKnownHex: structuredClone(entry.lastKnownHex),
                    lastKnownStrength: entry.lastKnownStrength,
                    knownUnitType: entry.knownUnitType,
                    source: entry.source
                });
            });
        }
        if (Array.isArray(state.hexModifications)) {
            state.hexModifications.forEach(function (entry) {
                var _a;
                var clone = structuredClone(entry);
                var key = (0, Hex_1.axialKey)(clone.hex);
                var bucket = (_a = _this.hexModifications.get(key)) !== null && _a !== void 0 ? _a : [];
                bucket.push(clone);
                _this.hexModifications.set(key, bucket);
            });
        }
        this._phase = state.phase;
        this._activeFaction = state.activeFaction;
        this._turnNumber = state.turnNumber;
        this._baseCamp = state.baseCamp
            ? { hex: structuredClone(state.baseCamp.hex), key: state.baseCamp.key }
            : null;
        this.playerSupply = (0, Supply_1.createSupplyUnits)(this.getAllUnitsForFaction("Player"));
        this.botSupply = (0, Supply_1.createSupplyUnits)(this.getAllUnitsForFaction("Bot"));
        this.resetSupplyHistory();
        // Restore air mission state if present in the snapshot so live sorties persist across saves.
        if (Array.isArray(state.airMissions)) {
            state.airMissions.forEach(function (entry) { return _this.restoreAirMission(entry); });
        }
        if (Array.isArray(state.airMissionRefits)) {
            state.airMissionRefits.forEach(function (refit) {
                _this.airMissionRefitTimers.set(refit.unitKey, { missionId: refit.missionId, faction: refit.faction, remaining: refit.remaining });
            });
        }
        // Restore AA engagement counters
        if (Array.isArray(state.aaEngagements)) {
            state.aaEngagements.forEach(function (entry) {
                _this.aaEngagementsByUnitId.set(entry.unitKey, entry.count);
            });
        }
        if (Array.isArray(state.airMissionReports)) {
            state.airMissionReports.forEach(function (entry) { return _this.airMissionReports.push(structuredClone(entry)); });
        }
        this.reconIntelSnapshot = state.reconIntelSnapshot ? structuredClone(state.reconIntelSnapshot) : null;
        if (Array.isArray(state.counterIntelOperations)) {
            state.counterIntelOperations.forEach(function (entry) {
                _this.counterIntelOperations.set(entry.id, {
                    id: entry.id,
                    faction: entry.faction,
                    targetHex: structuredClone(entry.targetHex),
                    radius: entry.radius,
                    remainingTurns: entry.remainingTurns,
                    strength: entry.strength
                });
            });
        }
        if (Array.isArray(state.intelBriefStates)) {
            state.intelBriefStates.forEach(function (entry) {
                _this.intelBriefStates.set(entry.briefId, {
                    briefId: entry.briefId,
                    isFalse: entry.isFalse,
                    verificationStatus: entry.verificationStatus
                });
            });
        }
        this.playerCounterIntelResources = {
            deceptionCharges: Math.max(0, Math.min(GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES, Math.round((_b = (_a = state.counterIntelResources) === null || _a === void 0 ? void 0 : _a.deceptionCharges) !== null && _b !== void 0 ? _b : GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES))),
            verificationCharges: Math.max(0, Math.min(GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES, Math.round((_d = (_c = state.counterIntelResources) === null || _c === void 0 ? void 0 : _c.verificationCharges) !== null && _d !== void 0 ? _d : GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES)))
        };
        this.counterIntelIdCounter = Math.max(0, Math.round((_g = (_e = state.counterIntelIdCounter) !== null && _e !== void 0 ? _e : (_f = state.counterIntelOperations) === null || _f === void 0 ? void 0 : _f.length) !== null && _g !== void 0 ? _g : 0));
    };
    /** Move the unit occupying the given hex into the reserve pool without deleting its stats. */
    GameEngine.prototype.moveToReserves = function (hex) {
        var key = (0, Hex_1.axialKey)(hex);
        var unit = this.playerPlacements.get(key);
        if (!unit) {
            return;
        }
        this.playerPlacements.delete(key);
        this.playerIdleUnitKeys.delete(key);
        this.removeSupplyEntryFor(hex);
        this.reserves.push({ unit: structuredClone(unit), definition: this.getUnitDefinition(unit.type) });
        // Moving a unit back into reserves changes roster composition; clear cache so UI mirrors the new state.
        this.invalidateRosterCache();
    };
    /**
     * Transition from deployment to the main player turn. Returns the reserve list for UI display.
     * Throws if the base camp has not been selected.
     */
    GameEngine.prototype.finalizeDeployment = function () {
        this.assertPhase("deployment", "Deployment can only be finalized from the deployment phase.");
        if (!this._baseCamp) {
            throw new Error("Select a base camp before beginning the battle.");
        }
        // Ground units remain subject to normal deployment rules; air units stay off-map and operate solely via Air Support.
        // Previously, autoDeployAirReservesToBaseZone() would place aircraft into the base camp zone, which
        // caused them to appear as on-map units. That behavior is now disabled so squadrons are managed only
        // through the air mission system and not as standard ground deployments.
        this.playerSupply = (0, Supply_1.createSupplyUnits)(this.getAllUnitsForFaction("Player"));
        this.botSupply = (0, Supply_1.createSupplyUnits)(this.getAllUnitsForFaction("Bot"));
        this.recordSupplySnapshot("Player");
        return this.reserves.map(function (entry) { return ({ unit: structuredClone(entry.unit), definition: entry.definition }); });
    };
    /**
     * Switch the engine into the opening player turn once deployment is locked. Throws if deployment prerequisites are unmet.
     */
    GameEngine.prototype.startPlayerTurnPhase = function () {
        this.assertPhase("deployment", "Player turn can only begin immediately after deployment.");
        if (!this._baseCamp) {
            throw new Error("Select a base camp before beginning the battle.");
        }
        this._phase = "playerTurn";
        this._activeFaction = "Player";
        this._turnNumber = 1;
        this.playerActionFlags.clear();
        this.clearFlakEngagementsFor("Player");
        this.rebuildPlayerIdleUnitSet();
        this.refreshAircraftAmmoForFaction("Player");
    };
    /** Deploy a reserve unit mid-battle into an empty hex. */
    GameEngine.prototype.callUpReserve = function (reserveIndex, hex) {
        this.assertNotPhase("deployment", "Call-ups happen after deployment.");
        if (!this.baseCamp) {
            throw new Error("Assign a base camp before calling up reserves.");
        }
        var deploymentState = (0, DeploymentState_1.ensureDeploymentState)();
        var baseCampOffsetKey = this.toOffsetKey(this.baseCamp.hex);
        var targetOffsetKey = this.toOffsetKey(hex);
        var baseCampZoneKey = deploymentState.getZoneKeyForHex(baseCampOffsetKey);
        if (!baseCampZoneKey) {
            throw new Error("Base camp is not aligned with a deployment zone; reserves cannot deploy.");
        }
        if (!deploymentState.isHexWithinPlayerZone(targetOffsetKey)) {
            throw new Error("Reserves can only deploy within player-controlled deployment zones.");
        }
        if (deploymentState.getZoneKeyForHex(targetOffsetKey) !== baseCampZoneKey) {
            throw new Error("Reserves can only deploy within the base camp deployment zone.");
        }
        var entry = this.reserves[reserveIndex];
        if (!entry) {
            throw new Error("Reserve index out of range.");
        }
        if (this.isAircraft(entry.definition)) {
            throw new Error("Air units are controlled via Air Support and cannot be deployed as ground reserves.");
        }
        var key = (0, Hex_1.axialKey)(hex);
        var placement = structuredClone(entry.unit);
        placement.hex = structuredClone(hex);
        this.ensureUnitId(placement);
        if (!this.canFactionEnterHex(placement, "Player", hex)) {
            throw new Error("Target hex cannot accept another reserve unit.");
        }
        this.addUnitToFactionHex("Player", placement);
        this.updateIdleRegistryFor(key);
        this.playerSupply.push({
            hex: structuredClone(hex),
            unitId: placement.unitId,
            ammo: placement.ammo,
            fuel: placement.fuel,
            entrench: placement.entrench,
            strength: placement.strength
        });
        this.reserves.splice(reserveIndex, 1);
        this.resetPlayerHistoryCheckpoint();
        // Reserve queue shrank and frontline expanded; invalidate roster snapshot so roster popup updates instantly.
        this.invalidateRosterCache();
    };
    /** Deploy a reserve unit by its allocation key (or scenario alias) during player turns. */
    GameEngine.prototype.callUpReserveByKey = function (unitKey, hex) {
        this.assertNotPhase("deployment", "Call-ups happen after deployment.");
        var index = this.findReserveIndexByUnitKey(unitKey);
        if (index < 0) {
            throw new Error("No matching reserve found for the provided unit key.");
        }
        this.callUpReserve(index, hex);
    };
    /** Converts an axial coordinate into the offset-key format used by DeploymentState zone maps. */
    GameEngine.prototype.toOffsetKey = function (axial) {
        var col = axial.q;
        var row = axial.r + Math.floor(axial.q / 2);
        return "".concat(col, ",").concat(row);
    };
    GameEngine.prototype.parseOffsetKey = function (key) {
        var parts = key.split(",");
        if (parts.length !== 2) {
            throw new Error("Invalid offset key '".concat(key, "'"));
        }
        var col = Number(parts[0]);
        var row = Number(parts[1]);
        if (!Number.isFinite(col) || !Number.isFinite(row)) {
            throw new Error("Invalid offset key '".concat(key, "'"));
        }
        var q = col;
        var r = row - Math.floor(q / 2);
        return { q: q, r: r };
    };
    GameEngine.prototype.autoDeployAirReservesToBaseZone = function () {
        // Intentionally left inert: aircraft are no longer auto-deployed onto the map.
        // Kept for backward compatibility with saves and callers, but performs no work.
    };
    /**
     * End the current faction's turn, execute supply attrition, and advance to the opposing faction.
     * Returns a report of out-of-supply units so UI can surface warnings.
     */
    GameEngine.prototype.endTurn = function () {
        if (this._phase === "deployment" || this._phase === "completed") {
            return null;
        }
        this.stepAirMissionsForFaction(this._activeFaction);
        this.advanceAirMissionRefits(this._activeFaction);
        if (this._phase === "playerTurn") {
            // Player logistics resolve before the ally/bot acts so ledgers and alerts update immediately.
            var playerSupplyReport = this.applySupplyTickFor("Player");
            this.resolveQueuedSupportActions();
            // If allies are present, run their turn next.
            if (this.allySide && this.allyPlacements.size > 0) {
                this._phase = "allyTurn";
                this._activeFaction = "Ally";
                this.clearSuppressionFor("Ally");
                this.clearSentryFor("Ally");
                this.stepAirMissionsForFaction("Ally");
                this.advanceAirMissionRefits("Ally");
                this.applySupplyTickFor("Ally");
                this.executeHeuristicAllyTurn();
            }
            // Ally (if any) complete → Bot turn. Execute bot logic immediately before UI refresh.
            this._phase = "botTurn";
            this._activeFaction = "Bot";
            this.botActionFlags.clear();
            this.clearFlakEngagementsFor("Bot");
            this.clearSuppressionFor("Bot");
            this.clearSentryFor("Bot");
            var botSummary = this.executeBotTurn();
            this.pendingBotTurnSummary = botSummary;
            this.stepAirMissionsForFaction("Bot");
            this.advanceAirMissionRefits("Bot");
            // After the bot finishes, advance back to player turn to keep UI interactive.
            this._phase = "playerTurn";
            this._activeFaction = "Player";
            this._turnNumber += 1;
            this.advanceCounterIntelTurn();
            this.playerActionFlags.clear();
            this.clearFlakEngagementsFor("Player");
            this.clearSuppressionFor("Player");
            this.clearSentryFor("Player");
            this.rebuildPlayerIdleUnitSet();
            this.refreshAircraftAmmoForFaction("Player");
            return playerSupplyReport;
        }
        // Bot turn was already resolved, so simply advance to the player's next turn.
        if (this._phase === "botTurn" || this._phase === "allyTurn") {
            this._phase = "playerTurn";
            this._activeFaction = "Player";
            this._turnNumber += 1;
            this.advanceCounterIntelTurn();
            this.playerActionFlags.clear();
            this.clearSentryFor("Player");
            this.rebuildPlayerIdleUnitSet();
            this.refreshAircraftAmmoForFaction("Player");
            return this.applySupplyTickFor("Player");
        }
        return this.applySupplyTickFor(this._activeFaction);
    };
    /** Prepare combat preview by building the standardized request object and invoking `resolveAttack()`. */
    GameEngine.prototype.previewAttack = function (attackerHex, defenderHex, stance, attackerUnitId, defenderUnitId) {
        var _a, _b;
        var attacker = this.lookupUnit(attackerHex, "Player", false, attackerUnitId);
        var defenders = this.getHostileUnitsAtHex(defenderHex, "Player");
        var primaryDefenderMember = defenderUnitId
            ? (_a = defenders.find(function (entry) { return entry.unitId === defenderUnitId; })) !== null && _a !== void 0 ? _a : defenders[0]
            : defenders[0];
        var defender = (_b = primaryDefenderMember === null || primaryDefenderMember === void 0 ? void 0 : primaryDefenderMember.unit) !== null && _b !== void 0 ? _b : null;
        if (!attacker || !defender || !this.getPlayerEnemyContactStateAtHex(defenderHex)) {
            return null;
        }
        var attackerDef = this.getUnitDefinition(attacker.type);
        var effectiveStance = this.resolveCombatStanceForAttacker(attacker, attackerDef, stance);
        var defenderEntries = defenders.length > 0 ? defenders : [{ unitId: this.getSquadronId(defender), unit: defender, faction: "Bot", isAutomated: false }];
        var targetRichEntries = [];
        var aggregateAttackResult = null;
        var primaryRetaliationPreview = null;
        var totalExpectedDamage = 0;
        var totalExpectedSuppression = 0;
        var totalExpectedRetaliation = 0;
        for (var _i = 0, defenderEntries_1 = defenderEntries; _i < defenderEntries_1.length; _i++) {
            var entry = defenderEntries_1[_i];
            var request = this.buildAttackRequest(attacker, entry.unit, "Player", entry.faction, { stance: effectiveStance });
            if (!request) {
                continue;
            }
            var attackResult = (0, Combat_1.resolveAttack)(request);
            var entryDef = this.getUnitDefinition(entry.unit.type);
            var attackerIsAircraft_1 = this.isAircraft(attackerDef);
            var attackerIsBomber_1 = this.isBomber(attackerDef);
            var defenderIsAircraft_1 = this.isAircraft(entryDef);
            var damageMultiplier_1 = 1;
            var suppressionMultiplier_1 = 1;
            if (attackerIsBomber_1 && !defenderIsAircraft_1) {
                damageMultiplier_1 = 10;
                suppressionMultiplier_1 = 10;
            }
            else if (attackerIsAircraft_1 && !attackerIsBomber_1 && defenderIsAircraft_1) {
                damageMultiplier_1 = 4;
                suppressionMultiplier_1 = 4;
            }
            var finalExpectedDamage_1 = attackResult.expectedDamage * damageMultiplier_1;
            var finalExpectedSuppression_1 = attackResult.expectedSuppression * suppressionMultiplier_1;
            totalExpectedDamage += finalExpectedDamage_1;
            totalExpectedSuppression += finalExpectedSuppression_1;
            var projectedDefenderLoss_1 = Math.max(0, attackerIsBomber_1 && !defenderIsAircraft_1
                ? Math.ceil(finalExpectedDamage_1)
                : Math.round(finalExpectedDamage_1));
            var projectedDefender = structuredClone(entry.unit);
            projectedDefender.strength = Math.max(0, projectedDefender.strength - projectedDefenderLoss_1);
            var retaliationPreview = this.previewRetaliationForPlayerAttack(attacker, attackerHex, attackerDef, entry.unit, projectedDefender, defenderHex, entryDef, effectiveStance, entry.faction);
            totalExpectedRetaliation += retaliationPreview.expectedDamage;
            targetRichEntries.push({
                unitId: entry.unitId,
                unit: structuredClone(entry.unit),
                expectedDamage: finalExpectedDamage_1,
                expectedRetaliation: retaliationPreview.expectedDamage,
                retaliationPossible: retaliationPreview.possible,
                retaliationNote: retaliationPreview.note
            });
            if (entry.unitId === primaryDefenderMember.unitId) {
                aggregateAttackResult = __assign(__assign({}, attackResult), { expectedDamage: finalExpectedDamage_1, expectedSuppression: finalExpectedSuppression_1, damagePerHit: attackResult.damagePerHit * damageMultiplier_1 });
                primaryRetaliationPreview = retaliationPreview;
            }
        }
        if (!aggregateAttackResult || !primaryRetaliationPreview) {
            return null;
        }
        var defenderDef = this.getUnitDefinition(defender.type);
        var attackerIsAircraft = this.isAircraft(attackerDef);
        var attackerIsBomber = this.isBomber(attackerDef);
        var defenderIsAircraft = this.isAircraft(defenderDef);
        var damageMultiplier = 1;
        var suppressionMultiplier = 1;
        if (attackerIsBomber && !defenderIsAircraft) {
            damageMultiplier = 10;
            suppressionMultiplier = 10;
        }
        else if (attackerIsAircraft && !attackerIsBomber && defenderIsAircraft) {
            damageMultiplier = 4;
            suppressionMultiplier = 4;
        }
        var finalDamagePerHit = aggregateAttackResult.damagePerHit * damageMultiplier;
        var finalExpectedDamage = aggregateAttackResult.expectedDamage;
        var finalExpectedSuppression = totalExpectedSuppression;
        var projectedDefenderLoss = Math.max(0, attackerIsBomber && !defenderIsAircraft
            ? Math.ceil(finalExpectedDamage)
            : Math.round(finalExpectedDamage));
        console.log("[GameEngine] *** PREVIEW CALCULATION DEBUG ***", {
            attackerType: attacker.type,
            attackerStrength: attacker.strength,
            defenderType: defender.type,
            defenderStrength: defender.strength,
            attackResultExpectedDamage: aggregateAttackResult.expectedDamage,
            attackResultShots: aggregateAttackResult.shots,
            attackResultDamagePerHit: aggregateAttackResult.damagePerHit,
            attackResultExpectedHits: aggregateAttackResult.expectedHits,
            attackResultAccuracy: aggregateAttackResult.accuracy,
            damageMultiplier: damageMultiplier,
            finalExpectedDamage: finalExpectedDamage,
            projectedDefenderLoss: projectedDefenderLoss,
            isBomber: attackerIsBomber,
            isAircraft: attackerIsAircraft
        });
        return {
            attacker: structuredClone(attacker),
            defender: structuredClone(defender),
            result: aggregateAttackResult,
            commander: this.getCommanderBenefits(),
            damageMultiplier: damageMultiplier,
            suppressionMultiplier: suppressionMultiplier,
            finalDamagePerHit: finalDamagePerHit,
            finalExpectedDamage: finalExpectedDamage,
            finalExpectedSuppression: finalExpectedSuppression,
            expectedRetaliation: primaryRetaliationPreview.expectedDamage,
            retaliationPossible: primaryRetaliationPreview.possible,
            retaliationNote: primaryRetaliationPreview.note,
            targetRich: targetRichEntries.length > 1,
            targetRichDefenders: targetRichEntries,
            totalExpectedDamage: totalExpectedDamage,
            totalExpectedRetaliation: totalExpectedRetaliation
        };
    };
    /**
     * Mirrors the retaliation checks used by player-initiated combat so the confirmation modal can surface
     * expected return fire without reimplementing engine rules in the UI layer.
     */
    GameEngine.prototype.previewRetaliationForPlayerAttack = function (attacker, attackerHex, attackerDef, originalDefender, projectedDefender, defenderHex, defenderDef, effectiveStance, defenderFaction) {
        var _a, _b;
        if (defenderFaction === void 0) { defenderFaction = "Bot"; }
        var simultaneousFire = originalDefender.onSentry === true;
        var noteFor = function (message) {
            return simultaneousFire
                ? "Target is on sentry, but ".concat(message.charAt(0).toLowerCase()).concat(message.slice(1))
                : message;
        };
        var attackerIsAircraft = this.isAircraft(attackerDef);
        var defenderIsAircraft = this.isAircraft(defenderDef);
        var defenderIsBomber = this.isBomber(defenderDef);
        var defenderKey = (0, Hex_1.axialKey)(defenderHex);
        var defenderGroundAmmoCost = defenderIsAircraft ? 0 : this.resolveGroundAttackAmmoCost(defenderDef);
        var retaliationDefender = structuredClone(simultaneousFire ? originalDefender : projectedDefender);
        retaliationDefender.onSentry = false;
        if (retaliationDefender.strength <= 0) {
            return {
                expectedDamage: 0,
                possible: false,
                note: "Target is expected to be destroyed before it can return fire."
            };
        }
        if (attackerIsAircraft && !defenderIsAircraft) {
            return {
                expectedDamage: 0,
                possible: false,
                note: noteFor("Ground units cannot retaliate against fast-moving aircraft.")
            };
        }
        if (this.resolveUnitSuppressionState(retaliationDefender).state === "pinned") {
            return {
                expectedDamage: 0,
                possible: false,
                note: noteFor("Target is pinned and cannot return fire.")
            };
        }
        var distance = (0, Hex_1.hexDistance)(defenderHex, attackerHex);
        var defenderRangeMin = (_a = defenderDef.rangeMin) !== null && _a !== void 0 ? _a : 1;
        var defenderRangeMax = (_b = defenderDef.rangeMax) !== null && _b !== void 0 ? _b : 1;
        if (defenderIsBomber && attackerIsAircraft) {
            defenderRangeMax = Math.max(defenderRangeMax, 2);
        }
        if (distance < defenderRangeMin || distance > defenderRangeMax) {
            return {
                expectedDamage: 0,
                possible: false,
                note: noteFor("Target is out of return-fire range.")
            };
        }
        var defenderFlags = defenderFaction === "Bot"
            ? this.getUnitActionFlags("Bot", retaliationDefender)
            : this.getUnitActionFlags("Player", retaliationDefender);
        if (defenderFlags.retaliationsUsed >= balance_1.combat.counterfire.maxRetaliationsPerTurn) {
            return {
                expectedDamage: 0,
                possible: false,
                note: noteFor("Target has already used all available retaliations this turn.")
            };
        }
        if (defenderIsAircraft) {
            var defenderAmmoState = this.getAircraftAmmoState(defenderFaction, this.getSquadronId(retaliationDefender), defenderDef);
            if (this.aircraftNeedsRearm(defenderFaction, this.getSquadronId(retaliationDefender))) {
                return {
                    expectedDamage: 0,
                    possible: false,
                    note: noteFor("Enemy aircraft must rearm before it can retaliate.")
                };
            }
            if (defenderAmmoState.air <= 0) {
                return {
                    expectedDamage: 0,
                    possible: false,
                    note: noteFor("Enemy aircraft has no interception ammo remaining.")
                };
            }
        }
        else {
            var defenderAmmo = typeof retaliationDefender.ammo === "number" ? retaliationDefender.ammo : null;
            if (defenderAmmo !== null && defenderAmmo < defenderGroundAmmoCost) {
                return {
                    expectedDamage: 0,
                    possible: false,
                    note: noteFor(defenderGroundAmmoCost > 1
                        ? "Enemy unit lacks the ".concat(defenderGroundAmmoCost.toFixed(0), " ammo needed to return indirect fire.")
                        : "Enemy unit has no ammunition remaining to retaliate.")
                };
            }
        }
        var retaliationReq = this.buildAttackRequest(retaliationDefender, attacker, defenderFaction, "Player", {
            allowBomberAirAttack: true,
            stance: effectiveStance === "assault" ? "assault" : undefined
        });
        if (!retaliationReq) {
            return {
                expectedDamage: 0,
                possible: false,
                note: noteFor("Target lacks line of fire for retaliation.")
            };
        }
        var retaliation = (0, Combat_1.resolveAttack)(retaliationReq);
        if (defenderIsBomber && attackerIsAircraft) {
            retaliation = __assign(__assign({}, retaliation), { expectedDamage: retaliation.expectedDamage * 2, damagePerHit: retaliation.damagePerHit * 2, expectedSuppression: retaliation.expectedSuppression * 2 });
        }
        else if (defenderIsAircraft && !defenderIsBomber && attackerIsAircraft) {
            retaliation = __assign(__assign({}, retaliation), { expectedDamage: retaliation.expectedDamage * 4, damagePerHit: retaliation.damagePerHit * 4, expectedSuppression: retaliation.expectedSuppression * 4 });
        }
        return {
            expectedDamage: Math.max(0, retaliation.expectedDamage),
            possible: true,
            note: simultaneousFire ? "Target is on sentry and will return fire simultaneously." : undefined
        };
    };
    /**
     * Normalizes terrain move costs so the rest of the engine can treat air movement as a flat cost per hex.
     * Airframes ignore ground terrain entirely, while ground units fall back to terrain-specific tables.
     * Ford features override river impassability for ground units.
     * Road surfaces and engineer works then reshape the final price paid to cross that hex.
     */
    GameEngine.prototype.resolveMoveCost = function (moveType, terrain, hex, fromHex) {
        var _a;
        if (moveType === "air") {
            return 1;
        }
        var catalog = (_a = terrain === null || terrain === void 0 ? void 0 : terrain.moveCost) !== null && _a !== void 0 ? _a : null;
        if (!catalog) {
            return 1;
        }
        var cost = catalog[moveType];
        if (typeof cost !== "number") {
            cost = 1;
        }
        // Check for ford feature that makes rivers crossable
        if (cost >= 999 && hex) {
            var features = this.getTileFeaturesAt(hex);
            if (features.includes("ford")) {
                if (moveType === "leg") {
                    return 2; // Infantry can cross fords at normal speed
                }
                else if (moveType === "track") {
                    return 3;
                }
                else if (moveType === "wheel") {
                    return 3; // Wheeled vehicles can use prepared fords
                }
            }
            if (features.includes("shallow")) {
                if (moveType === "leg") {
                    return 2; // Infantry can cross shallow water at normal speed
                }
                else if (moveType === "track") {
                    return 3;
                }
                else if (moveType === "wheel") {
                    return 999; // Wheeled vehicles can't ford unprepared shallow crossings
                }
            }
        }
        if (hex) {
            var roadCost = this.resolveRoadMoveCost(moveType);
            if (roadCost !== null && this.isRoad(hex)) {
                cost = Math.min(cost, roadCost);
            }
            cost = this.resolveClearedPathMoveCost(moveType, cost, hex);
            // Edge tank traps penalize the specific boundary being crossed rather than the whole hex interior.
            if ((moveType === "track" || moveType === "wheel") && fromHex && this.hasTankTrapAcrossEdge(fromHex, hex)) {
                cost = Number((cost * 3).toFixed(2));
            }
        }
        return cost;
    };
    GameEngine.prototype.resolveRoadMoveCost = function (moveType) {
        var _a;
        if (moveType === "air") {
            return 1;
        }
        var roadDefinition = ((_a = this.terrain.road) !== null && _a !== void 0 ? _a : null);
        if (!roadDefinition) {
            return null;
        }
        var roadCost = roadDefinition.moveCost[moveType];
        return typeof roadCost === "number" ? roadCost : null;
    };
    GameEngine.prototype.resolveClearedPathMoveCost = function (moveType, baseCost, hex) {
        var clearPathLevel = this.getHexModificationLevel(hex, "clearedPath");
        if (clearPathLevel <= 0) {
            return baseCost;
        }
        var roadCost = this.resolveRoadMoveCost(moveType);
        if (roadCost === null) {
            return baseCost;
        }
        var normalizedBase = baseCost >= 999
            ? Math.max(roadCost + 4.5, 5)
            : baseCost;
        var stepShare = Math.max(0, Math.min(3, clearPathLevel)) / 3;
        var blended = normalizedBase + (roadCost - normalizedBase) * stepShare;
        return Math.max(roadCost, Number(blended.toFixed(2)));
    };
    GameEngine.prototype.getHexModificationLevel = function (hex, type) {
        return this.getHexModifications(hex).reduce(function (highest, modification) {
            var _a;
            if (modification.type !== type) {
                return highest;
            }
            return Math.max(highest, (_a = modification.level) !== null && _a !== void 0 ? _a : 1);
        }, 0);
    };
    GameEngine.prototype.resolveCrossedHexEdge = function (from, to) {
        return (0, types_1.normalizeFacingDirection)(this.resolveFacingToward(to, from), "NW");
    };
    GameEngine.prototype.hasEdgeModification = function (hex, type, facing) {
        var _this = this;
        return this.getHexModifications(hex).some(function (modification) { return (modification.type === type &&
            _this.normalizeHexEdgeFacing(modification.facing) === facing); });
    };
    GameEngine.prototype.hasTankTrapAcrossEdge = function (fromHex, toHex) {
        var enteringFacing = this.resolveCrossedHexEdge(fromHex, toHex);
        var exitingFacing = this.resolveCrossedHexEdge(toHex, fromHex);
        return (this.hasEdgeModification(toHex, "tankTraps", enteringFacing) ||
            this.hasEdgeModification(fromHex, "tankTraps", exitingFacing));
    };
    /**
     * Returns the features array for the tile at the given hex.
     */
    GameEngine.prototype.getTileFeaturesAt = function (hex) {
        var _a, _b;
        return (_b = (_a = this.lookupTileDetails(hex)) === null || _a === void 0 ? void 0 : _a.features) !== null && _b !== void 0 ? _b : [];
    };
    /**
     * Derives the effective movement budget for the unit stationed at the given origin.
     * The summary respects commander bonuses, rush mode, and attack penalties so UI layers
     * can show remaining steps without reimplementing engine math.
     */
    GameEngine.prototype.resolveMovementContext = function (origin, unitId) {
        var _a, _b;
        if (!this.inBounds(origin)) {
            return null;
        }
        var unit = this.lookupUnit(origin, "Player", false, unitId);
        if (!unit) {
            return null;
        }
        if (this.isAutomatedPlayerUnit(unit)) {
            return null;
        }
        var definition = this.getUnitDefinition(unit.type);
        var moveType = (_a = definition.moveType) !== null && _a !== void 0 ? _a : "track";
        var flags = this.getUnitActionFlags("Player", unit);
        var moveScalar = this.commanderMoveScalar();
        var baseMovement = Math.max(1, Math.ceil(((_b = definition.movement) !== null && _b !== void 0 ? _b : 1) * moveScalar));
        var rushingBonus = flags.isRushing && definition.class === "infantry" ? 1 : 0;
        var adjustedMax = baseMovement + rushingBonus;
        if (flags.attacksUsed > 0) {
            if (definition.class === "artillery") {
                adjustedMax = 0;
            }
            else {
                adjustedMax = Math.floor(adjustedMax / 2);
            }
        }
        var remaining = Math.max(0, adjustedMax - flags.movementPointsUsed);
        return {
            unit: unit,
            definition: definition,
            flags: flags,
            moveType: moveType,
            max: Math.max(0, adjustedMax),
            remaining: remaining
        };
    };
    /** Supplies remaining movement points so overlays can report accurate "moves" counts. */
    GameEngine.prototype.getMovementBudget = function (origin, unitId) {
        var context = this.resolveMovementContext(origin, unitId);
        if (!context) {
            return null;
        }
        return { max: context.max, remaining: context.remaining };
    };
    /** Returns true when the unit's movement profile burns fuel while traversing the map. */
    GameEngine.prototype.unitConsumesFuel = function (definition) {
        var _a, _b;
        var moveType = definition.moveType;
        return ((_a = balance_1.FUEL_COST[moveType]) !== null && _a !== void 0 ? _a : 0) > 0 && ((_b = definition.fuel) !== null && _b !== void 0 ? _b : 0) > 0;
    };
    /** Resolve the fuel burned for a single step, discounting ground movement when the hex is on a road. */
    GameEngine.prototype.resolveMovementFuelStep = function (moveType, hex) {
        if (moveType === "leg") {
            return 0;
        }
        if (moveType === "air") {
            return balance_1.combat.ammoFuel.fuelPerAirHex;
        }
        var baseFuel = balance_1.combat.ammoFuel.fuelPerGroundHex;
        return this.isRoad(hex) ? baseFuel * balance_1.combat.ammoFuel.fuelRoadMultiplier : baseFuel;
    };
    /** Pull the available fuel budget for a unit, using infinity for formations that do not consume fuel. */
    GameEngine.prototype.resolveFuelBudget = function (unit, definition) {
        var _a;
        if (!this.unitConsumesFuel(definition)) {
            return Number.POSITIVE_INFINITY;
        }
        return Math.max(0, Number((_a = unit.fuel) !== null && _a !== void 0 ? _a : 0));
    };
    /**
     * Calculates the cheapest reachable path summary between two hexes, tracking both movement cost and
     * fuel expenditure so movement validation and UI overlays share the same logistics math.
     */
    GameEngine.prototype.calculateMovementPathSummary = function (from, to, moveType) {
        if (from.q === to.q && from.r === to.r) {
            return { cost: 0, fuelCost: 0, steps: 0, roadSteps: 0, offroadSteps: 0 };
        }
        var visited = new Map();
        var queue = [
            { hex: from, cost: 0, fuelCost: 0, steps: 0, roadSteps: 0, offroadSteps: 0 }
        ];
        while (queue.length > 0) {
            queue.sort(function (left, right) { return left.cost - right.cost || left.fuelCost - right.fuelCost; });
            var current = queue.shift();
            var key = (0, Hex_1.axialKey)(current.hex);
            var existing = visited.get(key);
            if (existing && existing.cost <= current.cost && existing.fuelCost <= current.fuelCost) {
                continue;
            }
            visited.set(key, { cost: current.cost, fuelCost: current.fuelCost });
            if (current.hex.q === to.q && current.hex.r === to.r) {
                return {
                    cost: current.cost,
                    fuelCost: Number(current.fuelCost.toFixed(2)),
                    steps: current.steps,
                    roadSteps: current.roadSteps,
                    offroadSteps: current.offroadSteps
                };
            }
            for (var _i = 0, _a = (0, Hex_1.neighbors)(current.hex); _i < _a.length; _i++) {
                var neighbor = _a[_i];
                if (!this.inBounds(neighbor)) {
                    continue;
                }
                var terrain = this.terrainAt(neighbor);
                var moveCost = this.resolveMoveCost(moveType, terrain, neighbor, current.hex);
                if (moveCost >= 999) {
                    continue;
                }
                var onRoad = moveType !== "air" && this.isRoad(neighbor);
                queue.push({
                    hex: neighbor,
                    cost: current.cost + moveCost,
                    fuelCost: current.fuelCost + this.resolveMovementFuelStep(moveType, neighbor),
                    steps: current.steps + 1,
                    roadSteps: current.roadSteps + (onRoad ? 1 : 0),
                    offroadSteps: current.offroadSteps + (onRoad ? 0 : 1)
                });
            }
        }
        return null;
    };
    /** Retained as a small wrapper for any legacy call sites that only need movement points. */
    GameEngine.prototype.calculateMovementCost = function (from, to, moveType) {
        var _a, _b;
        return (_b = (_a = this.calculateMovementPathSummary(from, to, moveType)) === null || _a === void 0 ? void 0 : _a.cost) !== null && _b !== void 0 ? _b : 999;
    };
    GameEngine.prototype.findCheapestPathToAny = function (from, destinations, moveType, occupied, maxFuel) {
        var _a;
        if (destinations.length === 0) {
            return null;
        }
        var destinationKeys = new Set(destinations.map(function (hex) { return (0, Hex_1.axialKey)(hex); }));
        var originKey = (0, Hex_1.axialKey)(from);
        var queue = [
            { hex: from, cost: 0, fuelCost: 0, steps: 0, roadSteps: 0, offroadSteps: 0 }
        ];
        var visited = new Map();
        var bestKnown = new Map();
        var previous = new Map();
        var nodeSummaries = new Map();
        previous.set(originKey, null);
        bestKnown.set(originKey, { cost: 0, fuelCost: 0, steps: 0 });
        nodeSummaries.set(originKey, { cost: 0, fuelCost: 0, steps: 0, roadSteps: 0, offroadSteps: 0 });
        while (queue.length > 0) {
            queue.sort(function (left, right) { return left.cost - right.cost || left.fuelCost - right.fuelCost || left.steps - right.steps; });
            var current = queue.shift();
            var key = (0, Hex_1.axialKey)(current.hex);
            var frontierBest = bestKnown.get(key);
            if (frontierBest &&
                (current.cost > frontierBest.cost ||
                    (current.cost === frontierBest.cost &&
                        (current.fuelCost > frontierBest.fuelCost ||
                            (current.fuelCost === frontierBest.fuelCost && current.steps > frontierBest.steps))))) {
                continue;
            }
            var seen = visited.get(key);
            if (seen &&
                (seen.cost < current.cost ||
                    (seen.cost === current.cost &&
                        (seen.fuelCost < current.fuelCost ||
                            (seen.fuelCost === current.fuelCost && seen.steps <= current.steps))))) {
                continue;
            }
            visited.set(key, { cost: current.cost, fuelCost: current.fuelCost, steps: current.steps });
            nodeSummaries.set(key, {
                cost: current.cost,
                fuelCost: Number(current.fuelCost.toFixed(2)),
                steps: current.steps,
                roadSteps: current.roadSteps,
                offroadSteps: current.offroadSteps
            });
            if (destinationKeys.has(key)) {
                var path = [];
                var cursor = key;
                while (cursor) {
                    var parsed = this.parseAxialKey(cursor);
                    if (!parsed) {
                        break;
                    }
                    path.push(parsed);
                    cursor = (_a = previous.get(cursor)) !== null && _a !== void 0 ? _a : null;
                }
                path.reverse();
                return {
                    path: path,
                    summary: nodeSummaries.get(key)
                };
            }
            for (var _i = 0, _b = (0, Hex_1.neighbors)(current.hex); _i < _b.length; _i++) {
                var neighbor = _b[_i];
                if (!this.inBounds(neighbor)) {
                    continue;
                }
                var neighborKey = (0, Hex_1.axialKey)(neighbor);
                if (occupied.has(neighborKey) && !destinationKeys.has(neighborKey)) {
                    continue;
                }
                var terrain = this.terrainAt(neighbor);
                var moveCost = this.resolveMoveCost(moveType, terrain, neighbor, current.hex);
                if (moveCost >= 999) {
                    continue;
                }
                var fuelCost = current.fuelCost + this.resolveMovementFuelStep(moveType, neighbor);
                if (typeof maxFuel === "number" && fuelCost > maxFuel + 1e-6) {
                    continue;
                }
                var onRoad = moveType !== "air" && this.isRoad(neighbor);
                var nextCost = current.cost + moveCost;
                var nextSteps = current.steps + 1;
                var existing = bestKnown.get(neighborKey);
                if (existing &&
                    (existing.cost < nextCost ||
                        (existing.cost === nextCost &&
                            (existing.fuelCost < fuelCost ||
                                (existing.fuelCost === fuelCost && existing.steps <= nextSteps))))) {
                    continue;
                }
                bestKnown.set(neighborKey, { cost: nextCost, fuelCost: fuelCost, steps: nextSteps });
                previous.set(neighborKey, key);
                queue.push({
                    hex: neighbor,
                    cost: nextCost,
                    fuelCost: fuelCost,
                    steps: nextSteps,
                    roadSteps: current.roadSteps + (onRoad ? 1 : 0),
                    offroadSteps: current.offroadSteps + (onRoad ? 0 : 1)
                });
            }
        }
        return null;
    };
    /** Calculate reachable hexes using unit movement points and terrain costs. */
    GameEngine.prototype.getReachableHexes = function (origin, unitId) {
        var context = this.resolveMovementContext(origin, unitId);
        if (!context) {
            return [];
        }
        var unit = context.unit, definition = context.definition, moveType = context.moveType, remaining = context.remaining;
        if (this.resolveUnitSuppressionState(unit).state === "pinned") {
            return [];
        }
        if (remaining <= 0) {
            return [];
        }
        var availableFuel = this.resolveFuelBudget(unit, definition);
        if (Number.isFinite(availableFuel) && availableFuel <= 0) {
            return [];
        }
        // BFS to find all hexes reachable within both movement and fuel budgets.
        var visited = new Map();
        var queue = [{ hex: origin, cost: 0, fuelCost: 0 }];
        var reachable = [];
        var reachableKeys = new Set();
        var originKey = (0, Hex_1.axialKey)(origin);
        while (queue.length > 0) {
            var current = queue.shift();
            var key = (0, Hex_1.axialKey)(current.hex);
            var seen = visited.get(key);
            if (seen && seen.cost <= current.cost && seen.fuelCost <= current.fuelCost) {
                continue;
            }
            visited.set(key, { cost: current.cost, fuelCost: current.fuelCost });
            for (var _i = 0, _a = (0, Hex_1.neighbors)(current.hex); _i < _a.length; _i++) {
                var neighbor = _a[_i];
                if (!this.inBounds(neighbor))
                    continue;
                var nKey = (0, Hex_1.axialKey)(neighbor);
                var occupied = this.isOccupied(neighbor);
                var canEnterOccupiedHex = occupied && moveType !== "air" && this.canFactionEnterHex(unit, "Player", neighbor);
                if (occupied && moveType !== "air" && !canEnterOccupiedHex) {
                    continue;
                }
                var terrain = this.terrainAt(neighbor);
                var moveCost = this.resolveMoveCost(moveType, terrain, neighbor, current.hex);
                if (moveCost >= 999) {
                    continue;
                }
                var newCost = current.cost + moveCost;
                var newFuelCost = current.fuelCost + this.resolveMovementFuelStep(moveType, neighbor);
                if (newCost <= remaining && (!Number.isFinite(availableFuel) || newFuelCost <= availableFuel + 1e-6)) {
                    queue.push({ hex: neighbor, cost: newCost, fuelCost: newFuelCost });
                    if (nKey !== originKey && !reachableKeys.has(nKey) && (!occupied || canEnterOccupiedHex)) {
                        reachableKeys.add(nKey);
                        reachable.push(structuredClone(neighbor));
                    }
                    if (occupied && canEnterOccupiedHex) {
                        continue;
                    }
                }
            }
        }
        return reachable;
    };
    /** Attackable enemy hexes within unit range where LOS is clear. */
    GameEngine.prototype.getAttackableTargets = function (attackerHex, unitId) {
        var _a, _b;
        var unit = this.lookupUnit(attackerHex, "Player", false, unitId);
        if (!unit) {
            return [];
        }
        if (this.isAutomatedPlayerUnit(unit)) {
            return [];
        }
        var flags = this.getUnitActionFlags("Player", unit);
        var def = this.getUnitDefinition(unit.type);
        if (this.isTowableUnit(unit) && this.resolveTowState(unit) === "towed") {
            return [];
        }
        var halfMovement = Math.floor(def.movement / 2);
        // Determine if unit can attack based on movement and attacks used
        // Time scale halved: max 1 attack per turn regardless of movement
        var maxAttacks = 1;
        if (flags.movementPointsUsed > halfMovement) {
            return []; // Moved too far to attack
        }
        // Artillery cannot attack if they've moved
        if (def.class === "artillery" && flags.movementPointsUsed > 0) {
            return [];
        }
        if (flags.attacksUsed >= maxAttacks) {
            return []; // Used all attacks
        }
        var rangeMin = (_a = def.rangeMin) !== null && _a !== void 0 ? _a : 1;
        var rangeMax = (_b = def.rangeMax) !== null && _b !== void 0 ? _b : 1;
        var out = [];
        // Trace every hex within firing range using a bounded BFS. The queue carries both the axial
        // coordinate and the distance from the attacker so we can stop expanding once the max range is met.
        var visited = new Set();
        var queue = [{ hex: attackerHex, distance: 0 }];
        while (queue.length > 0) {
            var _c = queue.shift(), hex = _c.hex, distance = _c.distance;
            var key = (0, Hex_1.axialKey)(hex);
            if (visited.has(key)) {
                continue;
            }
            visited.add(key);
            if (distance >= rangeMin && distance <= rangeMax && distance !== 0) {
                var defenderEntry = this.getHostileUnitsAtHex(hex, "Player")[0];
                if (defenderEntry && this.getPlayerEnemyContactStateAtHex(hex)) {
                    var req = this.buildAttackRequest(unit, defenderEntry.unit, "Player", defenderEntry.faction);
                    if (req) {
                        out.push(structuredClone(hex));
                    }
                }
            }
            // Stop exploring beyond maximum range so artillery retains the correct firing envelope.
            if (distance >= rangeMax) {
                continue;
            }
            for (var _i = 0, _d = (0, Hex_1.neighbors)(hex); _i < _d.length; _i++) {
                var neighbor = _d[_i];
                if (!this.inBounds(neighbor)) {
                    continue;
                }
                var neighborKey = (0, Hex_1.axialKey)(neighbor);
                if (visited.has(neighborKey)) {
                    continue;
                }
                queue.push({ hex: neighbor, distance: distance + 1 });
            }
        }
        return out;
    };
    /** Ground attacks expend one salvo, with indirect fire formations burning an additional ammo point. */
    GameEngine.prototype.resolveGroundAttackAmmoCost = function (definition) {
        var cost = balance_1.combat.ammoFuel.attackAmmoCost;
        if (definition.class === "artillery" || definition.traits.includes("indirect")) {
            cost += balance_1.combat.ammoFuel.indirectExtraAmmo;
        }
        return Math.max(1, cost);
    };
    /** Clear player-facing copy explaining why a formation cannot fire. */
    GameEngine.prototype.buildGroundAmmoShortageMessage = function (definition, currentAmmo, requiredAmmo) {
        var roundedCurrent = Number(currentAmmo.toFixed(2));
        if (definition.class === "artillery" || definition.traits.includes("indirect")) {
            return "This battery needs ".concat(requiredAmmo.toFixed(0), " ammo to fire a mission but only has ").concat(roundedCurrent.toFixed(2), " remaining.");
        }
        return "This unit is out of ammunition and must be resupplied before it can attack.";
    };
    /** Toggle rush mode for infantry units (gives +1 movement but loses terrain cover) */
    GameEngine.prototype.toggleRushMode = function (hex) {
        if (this._phase !== "playerTurn") {
            throw new Error("Rush mode can only be toggled during player turn.");
        }
        var unit = this.lookupUnit(hex, "Player");
        if (!unit) {
            throw new Error("No unit at this hex.");
        }
        var def = this.getUnitDefinition(unit.type);
        if (def.class !== "infantry") {
            throw new Error("Only infantry units can use rush mode.");
        }
        var key = (0, Hex_1.axialKey)(hex);
        var flags = this.getUnitActionFlags("Player", unit);
        // Can't toggle rush after moving
        if (flags.movementPointsUsed > 0) {
            throw new Error("Cannot toggle rush mode after moving.");
        }
        // Toggle the rush state
        var newRushState = !flags.isRushing;
        this.playerActionFlags.set(key, __assign(__assign({}, flags), { isRushing: newRushState }));
        return newRushState;
    };
    /** Move the player's unit to any reachable hex within movement range. */
    GameEngine.prototype.moveUnit = function (from, to, unitId) {
        var _this = this;
        if (this._phase !== "playerTurn") {
            throw new Error("Movement is allowed only during the player turn.");
        }
        var fromKey = (0, Hex_1.axialKey)(from);
        var toKey = (0, Hex_1.axialKey)(to);
        var originUnit = this.lookupUnit(from, "Player", false, unitId);
        if (originUnit && this.isAutomatedPlayerUnit(originUnit)) {
            throw new Error("This logistics convoy is AI-controlled and will move automatically during the supply phase.");
        }
        var context = this.resolveMovementContext(from, unitId);
        if (!context) {
            throw new Error("No player unit at the origin hex.");
        }
        var unit = context.unit, definition = context.definition, flags = context.flags, moveType = context.moveType, max = context.max, remaining = context.remaining;
        var availableFuel = this.resolveFuelBudget(unit, definition);
        if (this.resolveUnitSuppressionState(unit).state === "pinned") {
            throw new Error("Pinned formations cannot move until the pin is broken.");
        }
        if (this.isTowableUnit(unit) && this.resolveTowState(unit) !== "towed") {
            throw new Error("This battery must choose Move Out before it can be towed.");
        }
        if (definition.class === "artillery" && flags.attacksUsed > 0) {
            throw new Error("Artillery cannot move after attacking.");
        }
        var moveSummary = this.calculateMovementPathSummary(from, to, moveType);
        if (!moveSummary || moveSummary.cost >= 999) {
            throw new Error("Destination is not reachable with available movement points.");
        }
        var moveCost = moveSummary.cost;
        if (moveCost > remaining) {
            throw new Error("Not enough movement points. Cost: ".concat(moveCost, ", Remaining: ").concat(Math.max(0, remaining).toFixed(1)));
        }
        if (Number.isFinite(availableFuel) && moveSummary.fuelCost > availableFuel + 1e-6) {
            throw new Error("Not enough fuel. Required: ".concat(moveSummary.fuelCost.toFixed(2), ", Available: ").concat(availableFuel.toFixed(2)));
        }
        var newTotalMovement = flags.movementPointsUsed + moveCost;
        if (newTotalMovement > max) {
            var leftover = Math.max(0, max - flags.movementPointsUsed);
            throw new Error("Not enough movement points. Cost: ".concat(moveCost, ", Remaining: ").concat(leftover.toFixed(1)));
        }
        if (!this.inBounds(to)) {
            throw new Error("Destination out of bounds.");
        }
        if (!this.canFactionEnterHex(unit, "Player", to)) {
            throw new Error("Destination hex is occupied.");
        }
        var movingUnitId = this.getSquadronId(unit);
        // Verify destination is reachable within movement budget
        var reachable = this.getReachableHexes(from, movingUnitId);
        var canReach = reachable.some(function (hex) { return hex.q === to.q && hex.r === to.r; });
        if (!canReach && (from.q !== to.q || from.r !== to.r)) {
            throw new Error("Destination is not reachable with available movement points.");
        }
        var originUnits = this.getUnitsAtHexForFaction(from, "Player");
        var originRemaining = originUnits.filter(function (candidate) { return _this.getSquadronId(candidate) !== movingUnitId; });
        this.setUnitsAtHexForFaction(from, "Player", originRemaining);
        this.playerIdleUnitKeys.delete(fromKey);
        var moved = structuredClone(unit);
        moved.facing = this.resolveFacingToward(from, to, unit.facing);
        moved.hex = structuredClone(to);
        moved.onSentry = false;
        if (Number.isFinite(availableFuel) && moveSummary.fuelCost > 0) {
            moved.fuel = Math.max(0, Number((moved.fuel - moveSummary.fuelCost).toFixed(2)));
        }
        moved.entrench = 0;
        var destinationUnits = this.getUnitsAtHexForFaction(to, "Player");
        destinationUnits.push(moved);
        this.setUnitsAtHexForFaction(to, "Player", destinationUnits);
        this.transferAircraftAmmoState(this.playerAttackAmmo, fromKey, toKey);
        this.updatePlayerSupplyPosition(from, to, movingUnitId);
        this.syncPlayerFuel(to, moved.fuel, moved.unitId);
        this.syncPlayerEntrench(to, moved.entrench, moved.unitId);
        this.syncPlayerAmmo(to, moved.ammo, moved.unitId);
        // Update action flags
        this.deleteUnitActionFlags("Player", unit);
        this.setUnitActionFlags("Player", moved, {
            movementPointsUsed: newTotalMovement,
            attacksUsed: flags.attacksUsed,
            retaliationsUsed: flags.retaliationsUsed,
            isRushing: flags.isRushing
        });
        this.playerIdleUnitKeys.delete(fromKey);
        this.updateIdleRegistryFor(fromKey);
        this.updateIdleRegistryFor(toKey);
        this.invalidateRosterCache();
        return { unit: structuredClone(moved), from: structuredClone(from), to: structuredClone(to) };
    };
    GameEngine.prototype.resolvePlayerAttack = function (attackerHex, defenderHex, stance, attackerUnitId, defenderUnitId) {
        var _this = this;
        var _a, _b, _c, _d, _e, _f;
        if (this._phase !== "playerTurn") {
            throw new Error("Attacks are allowed only during the player turn.");
        }
        var attacker = this.lookupUnit(attackerHex, "Player", false, attackerUnitId);
        var defenderEntries = this.getHostileUnitsAtHex(defenderHex, "Player");
        var primaryDefenderMember = defenderUnitId
            ? (_a = defenderEntries.find(function (entry) { return entry.unitId === defenderUnitId; })) !== null && _a !== void 0 ? _a : defenderEntries[0]
            : defenderEntries[0];
        var primaryDefender = (_b = primaryDefenderMember === null || primaryDefenderMember === void 0 ? void 0 : primaryDefenderMember.unit) !== null && _b !== void 0 ? _b : null;
        if (!attacker || !primaryDefender || !this.getPlayerEnemyContactStateAtHex(defenderHex)) {
            return null;
        }
        if (this.isAutomatedPlayerUnit(attacker)) {
            throw new Error("This logistics convoy is AI-controlled. Set resupply priorities from the Logistics panel instead of issuing manual orders.");
        }
        var attackerOriginKey = (0, Hex_1.axialKey)(attackerHex);
        var attackerKey = this.getSquadronId(attacker);
        var flags = this.getUnitActionFlags("Player", attacker);
        var unitDef = this.getUnitDefinition(attacker.type);
        if (this.isTowableUnit(attacker) && this.resolveTowState(attacker) === "towed") {
            throw new Error("This battery must deploy before it can fire.");
        }
        var primaryDefenderDef = this.getUnitDefinition(primaryDefender.type);
        var effectiveStance = this.resolveCombatStanceForAttacker(attacker, unitDef, stance);
        if (stance === "assault" && effectiveStance !== "assault") {
            throw new Error(this.buildAssaultUnavailableMessage(attacker, unitDef));
        }
        var attackerIsAircraft = this.isAircraft(unitDef);
        var attackerIsBomber = this.isBomber(unitDef);
        var primaryDefenderIsAircraft = this.isAircraft(primaryDefenderDef);
        var groundAttackAmmoCost = attackerIsAircraft ? 0 : this.resolveGroundAttackAmmoCost(unitDef);
        var attackManeuverCost = 0;
        var moveScalar = this.commanderMoveScalar();
        var boostedMovement = Math.max(1, Math.ceil(((_c = unitDef.movement) !== null && _c !== void 0 ? _c : 1) * moveScalar));
        var halfMovement = Math.floor(boostedMovement / 2);
        var maxAttacks = 1;
        var movedTooFar = flags.movementPointsUsed > halfMovement;
        if (!attackerIsAircraft && movedTooFar) {
            if (unitDef.class === "artillery") {
                throw new Error("Artillery cannot attack after moving.");
            }
            throw new Error("Unit moved too far to attack this turn.");
        }
        if (unitDef.class === "artillery" && flags.movementPointsUsed > 0) {
            throw new Error("Artillery cannot attack after moving.");
        }
        if (flags.attacksUsed >= maxAttacks) {
            throw new Error("This unit can only attack ".concat(maxAttacks, " time(s) this turn."));
        }
        if (!attackerIsAircraft && attacker.ammo < groundAttackAmmoCost) {
            throw new Error(this.buildGroundAmmoShortageMessage(unitDef, attacker.ammo, groundAttackAmmoCost));
        }
        var resolveAircraftRegistryKey = function (faction, unit) {
            var registry = faction === "Player" ? _this.playerAttackAmmo : _this.botAttackAmmo;
            var unitKey = _this.getSquadronId(unit);
            if (registry.has(unitKey)) {
                return unitKey;
            }
            var hexKey = (0, Hex_1.axialKey)(unit.hex);
            if (registry.has(hexKey)) {
                return hexKey;
            }
            return unitKey;
        };
        var clearAircraftRegistryFor = function (faction, unit) {
            var registry = faction === "Player" ? _this.playerAttackAmmo : _this.botAttackAmmo;
            registry.delete(_this.getSquadronId(unit));
            registry.delete((0, Hex_1.axialKey)(unit.hex));
        };
        var scaleAttackResult = function (result, attackingDefinition, defendingDefinition) {
            if (_this.isBomber(attackingDefinition) && !_this.isAircraft(defendingDefinition)) {
                return __assign(__assign({}, result), { damagePerHit: result.damagePerHit * 10, expectedDamage: result.expectedDamage * 10, expectedSuppression: result.expectedSuppression * 10 });
            }
            if (_this.isAircraft(attackingDefinition) && !_this.isBomber(attackingDefinition) && _this.isAircraft(defendingDefinition)) {
                return __assign(__assign({}, result), { damagePerHit: result.damagePerHit * 4, expectedDamage: result.expectedDamage * 4, expectedSuppression: result.expectedSuppression * 4 });
            }
            return result;
        };
        var roundAppliedDamage = function (expectedDamage, attackingDefinition, defendingDefinition) { return Math.max(0, _this.isBomber(attackingDefinition) && !_this.isAircraft(defendingDefinition)
            ? Math.ceil(expectedDamage)
            : Math.round(expectedDamage)); };
        var resolveRetaliationNote = function (wasOnSentry, message) {
            return wasOnSentry
                ? "Enemy unit was on sentry, but ".concat(message.charAt(0).toLowerCase()).concat(message.slice(1))
                : message;
        };
        if (attackerIsAircraft) {
            attackManeuverCost = primaryDefenderIsAircraft ? 2 : 1;
            var remainingAirMovement = boostedMovement - flags.movementPointsUsed;
            if (remainingAirMovement + 1e-6 < attackManeuverCost) {
                throw new Error(primaryDefenderIsAircraft
                    ? "This squadron expended its flight time and cannot execute another aerial dogfight this turn."
                    : "This squadron lacks the flight time to line up another ground strike this turn.");
            }
            var aircraftAmmoKey = resolveAircraftRegistryKey("Player", attacker);
            var ammoState = this.getAircraftAmmoState("Player", aircraftAmmoKey, unitDef);
            if (this.aircraftNeedsRearm("Player", aircraftAmmoKey)) {
                throw new Error("This squadron must return to base to rearm before flying another sortie.");
            }
            if (primaryDefenderIsAircraft) {
                if (ammoState.air <= 0) {
                    throw new Error("The fighter wing has exhausted its interception ammo and needs to rearm at base.");
                }
            }
            else if (ammoState.ground <= 0) {
                throw new Error("The squadron has expended its bomb load and must rearm at the base camp before attacking ground targets again.");
            }
        }
        var attackingSnapshot = structuredClone(attacker);
        // Aircraft attacking ground targets may be intercepted before ordnance release.
        if (attackerIsAircraft && !primaryDefenderIsAircraft) {
            var opponentFaction = "Bot";
            var defenderHexKey = (0, Hex_1.axialKey)(defenderHex);
            // === FLAK ENGAGEMENT: Ground AA intercepts before CAP ===
            var flakUnits = this.findAllActiveFlakUnitsForHex(opponentFaction, defenderHex);
            if (flakUnits.length > 0) {
                var flakInterceptorsForEvent = [];
                for (var _i = 0, flakUnits_3 = flakUnits; _i < flakUnits_3.length; _i++) {
                    var flakEntry = flakUnits_3[_i];
                    flakInterceptorsForEvent.push({
                        faction: opponentFaction,
                        unitKey: this.getSquadronId(flakEntry.unit),
                        unitType: flakEntry.unit.type,
                        hex: structuredClone(flakEntry.unit.hex)
                    });
                }
                // Process sequential flak damage
                var bomberStrengthBeforeFlak = attackingSnapshot.strength;
                var flakDamage = 0;
                var bomberDestroyedByFlak = false;
                for (var _g = 0, flakUnits_4 = flakUnits; _g < flakUnits_4.length; _g++) {
                    var flakEntry = flakUnits_4[_g];
                    if (attackingSnapshot.strength <= 0)
                        break;
                    var flakReq = this.buildMissionAttackRequest(opponentFaction, flakEntry.unit, attackingSnapshot);
                    if (!flakReq)
                        continue;
                    // Ground-based AA has severe accuracy penalty against fast-moving, distant aircraft
                    var flakResult = (0, Combat_1.resolveAttack)(flakReq);
                    var flakDef = this.getUnitDefinition(flakEntry.unit.type);
                    if (this.hasAntiAirCapability(flakDef) && this.isAircraft(unitDef)) {
                        // Apply 75% accuracy reduction for ground AA vs aircraft (small, fast, distant targets)
                        flakResult = __assign(__assign({}, flakResult), { accuracy: flakResult.accuracy * 0.25, expectedHits: flakResult.expectedHits * 0.25, expectedDamage: flakResult.expectedDamage * 0.25, expectedSuppression: flakResult.expectedSuppression * 0.25 });
                    }
                    var suffered = roundAppliedDamage(flakResult.expectedDamage, flakDef, unitDef);
                    attackingSnapshot = structuredClone(attackingSnapshot);
                    attackingSnapshot.strength = Math.max(0, attackingSnapshot.strength - suffered);
                    flakDamage += suffered;
                    this.recordFlakEngagement(opponentFaction, flakEntry.unit, flakEntry.hexKey);
                    if (attackingSnapshot.strength <= 0) {
                        this.removeUnitFromFactionHex("Player", attackerHex, attackerKey);
                        this.deleteUnitActionFlags("Player", attacker);
                        this.playerIdleUnitKeys.delete(attackerOriginKey);
                        this.removeSupplyEntryForFaction("Player", attackerHex, attackerKey);
                        clearAircraftRegistryFor("Player", attacker);
                        this.updateIdleRegistryFor(attackerOriginKey);
                        this.invalidateRosterCache();
                        bomberDestroyedByFlak = true;
                        break;
                    }
                }
                this.pendingAirEngagements.push({
                    type: "flak",
                    location: structuredClone(defenderHex),
                    bomber: {
                        faction: "Player",
                        unitKey: attackerKey,
                        unitType: attacker.type,
                        strength: bomberStrengthBeforeFlak
                    },
                    interceptors: flakInterceptorsForEvent,
                    escorts: [],
                    flakDamage: flakDamage,
                    bomberStrengthBefore: bomberStrengthBeforeFlak,
                    bomberStrengthAfter: attackingSnapshot.strength,
                    bomberDestroyed: bomberDestroyedByFlak
                });
                if (bomberDestroyedByFlak) {
                    return null; // Aircraft destroyed by flak before reaching target
                }
            }
            var capMissions = this.findAllActiveAirCoverForHex(opponentFaction, defenderHexKey).filter(function (mission) { return mission.interceptions < 1; });
            var escortMissions = this.findAllActiveEscortsForUnit("Player", attackerKey).filter(function (mission) { return mission.interceptions < 1; });
            if (capMissions.length > 0) {
                var bomberStrengthBeforeCap = attackingSnapshot.strength;
                var bomberDestroyedByCap = false;
                var interceptorAttrition = 0;
                var escortAttrition = 0;
                var interceptorKills = 0;
                var interceptorsForEvent = [];
                var escortsForEvent = [];
                for (var _h = 0, capMissions_3 = capMissions; _h < capMissions_3.length; _h++) {
                    var cap = capMissions_3[_h];
                    var capLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
                    if (capLookup) {
                        interceptorsForEvent.push({
                            faction: opponentFaction,
                            unitKey: cap.unitKey,
                            unitType: capLookup.unit.type,
                            strength: capLookup.unit.strength
                        });
                    }
                }
                for (var _j = 0, escortMissions_2 = escortMissions; _j < escortMissions_2.length; _j++) {
                    var escort = escortMissions_2[_j];
                    var escortLookup = this.lookupUnitBySquadronId(escort.unitKey, "Player");
                    if (escortLookup) {
                        escortsForEvent.push({
                            faction: "Player",
                            unitKey: escort.unitKey,
                            unitType: escortLookup.unit.type,
                            strength: escortLookup.unit.strength
                        });
                    }
                }
                for (var _k = 0, capMissions_4 = capMissions; _k < capMissions_4.length; _k++) {
                    var cap = capMissions_4[_k];
                    var capLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
                    if (!capLookup) {
                        continue;
                    }
                    var escort = escortMissions.find(function (mission) { return mission.interceptions < 1; });
                    if (!escort) {
                        continue;
                    }
                    var escortLookup = this.lookupUnitBySquadronId(escort.unitKey, "Player");
                    if (!escortLookup) {
                        continue;
                    }
                    var capUnit = capLookup.unit;
                    var escortUnit = escortLookup.unit;
                    var escortReq = this.buildMissionAttackRequest("Player", escortUnit, capUnit);
                    if (!escortReq) {
                        continue;
                    }
                    var capDef = this.getUnitDefinition(capUnit.type);
                    var escortDef = this.getUnitDefinition(escortUnit.type);
                    var escortResult = scaleAttackResult((0, Combat_1.resolveAttack)(escortReq), escortDef, capDef);
                    var inflicted = roundAppliedDamage(escortResult.expectedDamage, escortDef, capDef);
                    interceptorAttrition += inflicted;
                    var updatedCap = structuredClone(capUnit);
                    updatedCap.strength = Math.max(0, updatedCap.strength - inflicted);
                    this.spendAircraftAmmo("Player", resolveAircraftRegistryKey("Player", escortUnit), true);
                    escort.interceptions += 1;
                    if (updatedCap.strength <= 0) {
                        interceptorKills += 1;
                        this.removeUnitFromFactionHex("Bot", updatedCap.hex, cap.unitKey);
                        this.deleteUnitActionFlags("Bot", capUnit);
                        this.removeSupplyEntryForFaction("Bot", updatedCap.hex, cap.unitKey);
                        clearAircraftRegistryFor("Bot", capUnit);
                        cap.interceptions += 1;
                    }
                    else {
                        this.replaceUnitInFactionHex("Bot", updatedCap);
                        this.syncStrengthForFaction("Bot", updatedCap.hex, updatedCap.strength, cap.unitKey);
                    }
                }
                for (var _l = 0, capMissions_5 = capMissions; _l < capMissions_5.length; _l++) {
                    var cap = capMissions_5[_l];
                    if (cap.interceptions >= 1 || attackingSnapshot.strength <= 0) {
                        continue;
                    }
                    var liveCapLookup = this.lookupUnitBySquadronId(cap.unitKey, opponentFaction);
                    if (!liveCapLookup) {
                        continue;
                    }
                    var liveCap = liveCapLookup.unit;
                    var capReq = this.buildMissionAttackRequest("Bot", liveCap, attackingSnapshot);
                    if (!capReq) {
                        continue;
                    }
                    var capDef = this.getUnitDefinition(liveCap.type);
                    var capResult = scaleAttackResult((0, Combat_1.resolveAttack)(capReq), capDef, unitDef);
                    var suffered = roundAppliedDamage(capResult.expectedDamage, capDef, unitDef);
                    attackingSnapshot = structuredClone(attackingSnapshot);
                    attackingSnapshot.strength = Math.max(0, attackingSnapshot.strength - suffered);
                    this.spendAircraftAmmo("Bot", resolveAircraftRegistryKey("Bot", liveCap), true);
                    cap.interceptions += 1;
                    if (attackingSnapshot.strength <= 0) {
                        this.removeUnitFromFactionHex("Player", attackerHex, attackerKey);
                        this.deleteUnitActionFlags("Player", attacker);
                        this.playerIdleUnitKeys.delete(attackerOriginKey);
                        this.removeSupplyEntryForFaction("Player", attackerHex, attackerKey);
                        clearAircraftRegistryFor("Player", attacker);
                        this.updateIdleRegistryFor(attackerOriginKey);
                        this.invalidateRosterCache();
                        bomberDestroyedByCap = true;
                        break;
                    }
                    this.replaceUnitInFactionHex("Player", attackingSnapshot);
                    this.syncStrengthForFaction("Player", attackingSnapshot.hex, attackingSnapshot.strength, attackerKey);
                }
                this.pendingAirEngagements.push({
                    type: "airToAir",
                    location: structuredClone(defenderHex),
                    bomber: {
                        faction: "Player",
                        unitKey: attackerKey,
                        unitType: attacker.type,
                        strength: bomberStrengthBeforeCap
                    },
                    interceptors: interceptorsForEvent,
                    escorts: escortsForEvent,
                    bomberStrengthBefore: bomberStrengthBeforeCap,
                    bomberStrengthAfter: attackingSnapshot.strength,
                    bomberDestroyed: bomberDestroyedByCap,
                    interceptorAttrition: interceptorAttrition,
                    interceptorKills: interceptorKills,
                    escortAttrition: escortAttrition
                });
                if (bomberDestroyedByCap) {
                    return null;
                }
            }
        }
        var attackRequestSource = structuredClone(attackingSnapshot);
        attackRequestSource.facing = this.resolveFacingToward(attackerHex, defenderHex, attackingSnapshot.facing);
        attackRequestSource.onSentry = false;
        var updatedAttacker = structuredClone(attackRequestSource);
        updatedAttacker.ammo = attackerIsAircraft
            ? Math.max(0, updatedAttacker.ammo - 1)
            : Math.max(0, updatedAttacker.ammo - groundAttackAmmoCost);
        if (attackerIsAircraft) {
            this.spendAircraftAmmo("Player", resolveAircraftRegistryKey("Player", attacker), primaryDefenderIsAircraft);
        }
        var primaryAttackResult = null;
        var primaryDefenderRemainingStrength = primaryDefender.strength;
        var primaryDefenderDestroyed = false;
        var primaryRetaliationResult;
        var primaryRetaliationNote;
        var primaryRetaliationOccurred = false;
        var totalDefenderDamage = 0;
        var totalRetaliationDamage = 0;
        var anyRetaliationOccurred = false;
        var targetRichDefenders = [];
        for (var _m = 0, defenderEntries_2 = defenderEntries; _m < defenderEntries_2.length; _m++) {
            var entry = defenderEntries_2[_m];
            var liveDefender = (_d = this.findUnitInFactionAtHex(defenderHex, entry.faction, entry.unitId)) !== null && _d !== void 0 ? _d : structuredClone(entry.unit);
            var defenderBefore = structuredClone(liveDefender);
            var defenderDef = this.getUnitDefinition(defenderBefore.type);
            var request = this.buildAttackRequest(attackRequestSource, defenderBefore, "Player", entry.faction, { stance: effectiveStance });
            if (!request) {
                continue;
            }
            var scaledAttackResult = scaleAttackResult((0, Combat_1.resolveAttack)(request), unitDef, defenderDef);
            var inflictedDamage = roundAppliedDamage(scaledAttackResult.expectedDamage, unitDef, defenderDef);
            totalDefenderDamage += inflictedDamage;
            var defenderWasOnSentry = defenderBefore.onSentry === true;
            var updatedDefender = structuredClone(defenderBefore);
            updatedDefender.facing = this.resolveFacingToward(defenderHex, attackerHex, defenderBefore.facing);
            updatedDefender.onSentry = false;
            updatedDefender.strength = Math.max(0, updatedDefender.strength - inflictedDamage);
            if (effectiveStance === "suppressive" && updatedDefender.strength > 0) {
                var suppressors = Array.isArray(updatedDefender.suppressedBy) ? __spreadArray([], updatedDefender.suppressedBy, true) : [];
                if (!suppressors.includes(attackerKey)) {
                    suppressors.push(attackerKey);
                }
                updatedDefender.suppressedBy = suppressors;
            }
            if (updatedDefender.strength <= 0) {
                this.removeUnitFromFactionHex(entry.faction, defenderHex, entry.unitId);
                this.deleteUnitActionFlags(entry.faction, defenderBefore);
                this.removeSupplyEntryForFaction(entry.faction, defenderHex, entry.unitId);
                if (this.isAircraft(defenderDef)) {
                    clearAircraftRegistryFor(entry.faction, defenderBefore);
                }
            }
            else {
                this.replaceUnitInFactionHex(entry.faction, updatedDefender);
                this.syncStrengthForFaction(entry.faction, defenderHex, updatedDefender.strength, entry.unitId);
            }
            var retaliationResultForEntry = void 0;
            var retaliationDamage = 0;
            var retaliationOccurredForEntry = false;
            var retaliationNoteForEntry = void 0;
            var retaliationAllowed = (defenderWasOnSentry || updatedDefender.strength > 0) && updatedAttacker.strength > 0;
            if (retaliationAllowed && attackerIsAircraft && !this.isAircraft(defenderDef)) {
                retaliationAllowed = false;
                retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy unit cannot retaliate against fast-moving aircraft.");
            }
            var retaliationDefender = structuredClone(defenderWasOnSentry ? defenderBefore : updatedDefender);
            retaliationDefender.facing = this.resolveFacingToward(defenderHex, attackerHex, retaliationDefender.facing);
            retaliationDefender.onSentry = false;
            if (retaliationAllowed && this.resolveUnitSuppressionState(retaliationDefender).state === "pinned") {
                retaliationAllowed = false;
                retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy unit is pinned and cannot return fire.");
            }
            if (retaliationAllowed) {
                var retaliationDistance = (0, Hex_1.hexDistance)(defenderHex, attackerHex);
                var defenderRangeMin = (_e = defenderDef.rangeMin) !== null && _e !== void 0 ? _e : 1;
                var defenderRangeMax = (_f = defenderDef.rangeMax) !== null && _f !== void 0 ? _f : 1;
                if (this.isBomber(defenderDef) && attackerIsAircraft) {
                    defenderRangeMax = Math.max(defenderRangeMax, 2);
                }
                if (retaliationDistance < defenderRangeMin || retaliationDistance > defenderRangeMax) {
                    retaliationAllowed = false;
                    retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy unit is out of return-fire range.");
                }
            }
            if (retaliationAllowed) {
                var defenderFlags = this.getUnitActionFlags(entry.faction, retaliationDefender);
                if (defenderFlags.retaliationsUsed >= balance_1.combat.counterfire.maxRetaliationsPerTurn) {
                    retaliationAllowed = false;
                    retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy unit has already used all available retaliations this turn.");
                }
            }
            var defenderGroundAmmoCost = this.isAircraft(defenderDef) ? 0 : this.resolveGroundAttackAmmoCost(defenderDef);
            if (retaliationAllowed) {
                if (this.isAircraft(defenderDef)) {
                    var defenderAmmoKey = resolveAircraftRegistryKey(entry.faction, retaliationDefender);
                    var defenderAmmoState = this.getAircraftAmmoState(entry.faction, defenderAmmoKey, defenderDef);
                    if (this.aircraftNeedsRearm(entry.faction, defenderAmmoKey)) {
                        retaliationAllowed = false;
                        retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy aircraft must rearm before it can retaliate.");
                    }
                    else if (defenderAmmoState.air <= 0) {
                        retaliationAllowed = false;
                        retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy aircraft has no interception ammo remaining.");
                    }
                }
                else {
                    var defenderAmmo = typeof retaliationDefender.ammo === "number" ? retaliationDefender.ammo : null;
                    if (defenderAmmo !== null && defenderAmmo < defenderGroundAmmoCost) {
                        retaliationAllowed = false;
                        retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, defenderGroundAmmoCost > 1
                            ? "Enemy unit lacks the ".concat(defenderGroundAmmoCost.toFixed(0), " ammo needed to return indirect fire.")
                            : "Enemy unit has no ammunition remaining to retaliate.");
                    }
                }
            }
            var retaliationReq = retaliationAllowed
                ? this.buildAttackRequest(retaliationDefender, updatedAttacker, entry.faction, "Player", {
                    allowBomberAirAttack: true,
                    stance: effectiveStance === "assault" ? "assault" : undefined
                })
                : null;
            if (retaliationReq) {
                retaliationResultForEntry = scaleAttackResult((0, Combat_1.resolveAttack)(retaliationReq), defenderDef, unitDef);
                retaliationDamage = roundAppliedDamage(retaliationResultForEntry.expectedDamage, defenderDef, unitDef);
                retaliationOccurredForEntry = true;
                anyRetaliationOccurred = true;
                totalRetaliationDamage += retaliationDamage;
                updatedAttacker.strength = Math.max(0, updatedAttacker.strength - retaliationDamage);
                if (defenderWasOnSentry) {
                    retaliationNoteForEntry = "Enemy unit was on sentry and returned fire simultaneously.";
                }
                if (this.isAircraft(defenderDef)) {
                    this.spendAircraftAmmo(entry.faction, resolveAircraftRegistryKey(entry.faction, retaliationDefender), attackerIsAircraft);
                    if (typeof updatedDefender.ammo === "number") {
                        updatedDefender.ammo = Math.max(0, updatedDefender.ammo - 1);
                    }
                }
                else if (typeof updatedDefender.ammo === "number") {
                    updatedDefender.ammo = Math.max(0, updatedDefender.ammo - defenderGroundAmmoCost);
                }
                if (updatedDefender.strength > 0) {
                    this.replaceUnitInFactionHex(entry.faction, updatedDefender);
                    if (typeof updatedDefender.ammo === "number") {
                        this.syncAmmoForFaction(entry.faction, defenderHex, updatedDefender.ammo, entry.unitId);
                    }
                    var defenderFlags = this.getUnitActionFlags(entry.faction, updatedDefender);
                    this.setUnitActionFlags(entry.faction, updatedDefender, __assign(__assign({}, defenderFlags), { retaliationsUsed: defenderFlags.retaliationsUsed + 1 }));
                }
            }
            else if (!retaliationNoteForEntry && retaliationAllowed) {
                retaliationNoteForEntry = resolveRetaliationNote(defenderWasOnSentry, "Enemy unit lacked line of fire for retaliation.");
            }
            targetRichDefenders.push({
                unitId: entry.unitId,
                unitType: defenderBefore.type,
                remainingStrength: updatedDefender.strength,
                destroyed: updatedDefender.strength <= 0,
                expectedDamage: inflictedDamage,
                retaliationDamage: retaliationDamage,
                retaliationOccurred: retaliationOccurredForEntry
            });
            if (entry.unitId === primaryDefenderMember.unitId) {
                primaryAttackResult = scaledAttackResult;
                primaryDefenderRemainingStrength = updatedDefender.strength;
                primaryDefenderDestroyed = updatedDefender.strength <= 0;
                primaryRetaliationResult = retaliationResultForEntry;
                primaryRetaliationNote = retaliationNoteForEntry;
                primaryRetaliationOccurred = retaliationOccurredForEntry;
            }
        }
        if (!primaryAttackResult) {
            return null;
        }
        var attackerRemainingStrength = updatedAttacker.strength;
        var allDefendersDestroyed = defenderEntries.every(function (entry) { return !_this.findUnitInFactionAtHex(defenderHex, entry.faction, entry.unitId); });
        var canAssaultAdvance = effectiveStance === "assault" && allDefendersDestroyed && !attackerIsAircraft && !primaryDefenderIsAircraft;
        var attackerFinalHex = structuredClone(attackerHex);
        if (updatedAttacker.strength <= 0) {
            this.removeUnitFromFactionHex("Player", attackerHex, attackerKey);
            this.deleteUnitActionFlags("Player", attacker);
            this.playerIdleUnitKeys.delete(attackerOriginKey);
            this.removeSupplyEntryForFaction("Player", attackerHex, attackerKey);
            if (attackerIsAircraft) {
                clearAircraftRegistryFor("Player", attacker);
            }
        }
        else if (canAssaultAdvance) {
            var originRemainder = this.getUnitsAtHexForFaction(attackerHex, "Player").filter(function (candidate) { return _this.getSquadronId(candidate) !== attackerKey; });
            this.setUnitsAtHexForFaction(attackerHex, "Player", originRemainder);
            attackerFinalHex = structuredClone(defenderHex);
            updatedAttacker.hex = structuredClone(defenderHex);
            updatedAttacker.entrench = 0;
            this.addUnitToFactionHex("Player", updatedAttacker);
            this.updatePlayerSupplyPosition(attackerHex, defenderHex, attackerKey);
            this.syncPlayerEntrench(defenderHex, updatedAttacker.entrench, attackerKey);
        }
        else {
            this.replaceUnitInFactionHex("Player", updatedAttacker);
        }
        if (updatedAttacker.strength > 0) {
            attackerRemainingStrength = updatedAttacker.strength;
            this.syncPlayerAmmo(attackerFinalHex, updatedAttacker.ammo, attackerKey);
            this.syncPlayerStrength(attackerFinalHex, updatedAttacker.strength, attackerKey);
            this.setUnitActionFlags("Player", updatedAttacker, {
                movementPointsUsed: flags.movementPointsUsed + attackManeuverCost,
                attacksUsed: flags.attacksUsed + 1,
                retaliationsUsed: flags.retaliationsUsed,
                isRushing: flags.isRushing
            });
        }
        this.updateIdleRegistryFor(attackerOriginKey);
        if ((0, Hex_1.axialKey)(attackerFinalHex) !== attackerOriginKey) {
            this.updateIdleRegistryFor((0, Hex_1.axialKey)(attackerFinalHex));
        }
        this.recordCombatReport({
            attacker: {
                unit: attackRequestSource,
                hex: attackerHex,
                faction: "Player",
                strengthBefore: attackRequestSource.strength,
                strengthAfter: attackerRemainingStrength
            },
            defender: {
                unit: primaryDefender,
                hex: defenderHex,
                faction: primaryDefenderMember.faction,
                strengthBefore: primaryDefender.strength,
                strengthAfter: primaryDefenderRemainingStrength,
                destroyed: primaryDefenderDestroyed
            },
            attackResult: primaryAttackResult,
            retaliationResult: primaryRetaliationOccurred ? primaryRetaliationResult : undefined
        });
        this.invalidateRosterCache();
        return {
            result: primaryAttackResult,
            defenderRemainingStrength: primaryDefenderRemainingStrength,
            defenderDestroyed: primaryDefenderDestroyed,
            retaliationResult: primaryRetaliationResult,
            attackerRemainingStrength: attackerRemainingStrength,
            retaliationOccurred: anyRetaliationOccurred,
            retaliationNote: primaryRetaliationNote,
            targetRich: targetRichDefenders.length > 1,
            targetRichDefenders: targetRichDefenders,
            totalDefenderDamage: totalDefenderDamage,
            totalRetaliationDamage: totalRetaliationDamage
        };
    };
    /** Resolve a basic attack and update units in place. */
    GameEngine.prototype.attackUnit = function (attackerHex, defenderHex, stance, attackerUnitId, defenderUnitId) {
        return this.resolvePlayerAttack(attackerHex, defenderHex, stance, attackerUnitId, defenderUnitId);
    };
    /** Serialize core battle state, excluding transient caches, for persistence or debugging output. */
    GameEngine.prototype.serialize = function () {
        var _this = this;
        return {
            phase: this._phase,
            activeFaction: this._activeFaction,
            turnNumber: this._turnNumber,
            baseCamp: this._baseCamp ? { hex: structuredClone(this._baseCamp.hex), key: this._baseCamp.key } : null,
            playerPlacements: this.getAllUnitsForFaction("Player").map(function (unit) { return structuredClone(unit); }),
            botPlacements: this.getAllUnitsForFaction("Bot").map(function (unit) { return structuredClone(unit); }),
            reserves: this.reserves.map(function (entry) { return structuredClone(entry.unit); }),
            // Serialize airborne reserves separately from ground reserves.
            airborneReserves: this.airborneReserves.map(function (entry) { return structuredClone(entry.unit); }),
            airMissions: Array.from(this.scheduledAirMissions.values()).map(function (mission) { return _this.serializeAirMission(mission); }),
            airMissionRefits: Array.from(this.airMissionRefitTimers.entries()).map(function (_a) {
                var unitKey = _a[0], timer = _a[1];
                return ({
                    missionId: timer.missionId,
                    unitKey: unitKey,
                    faction: timer.faction,
                    remaining: timer.remaining
                });
            }),
            aaEngagements: Array.from(this.aaEngagementsByUnitId.entries()).map(function (_a) {
                var unitKey = _a[0], count = _a[1];
                return ({
                    unitKey: unitKey,
                    count: count
                });
            }),
            airMissionReports: this.airMissionReports.map(function (entry) { return structuredClone(entry); }),
            reconIntelSnapshot: structuredClone(this.ensureReconIntelSnapshot()),
            counterIntelOperations: Array.from(this.counterIntelOperations.values()).map(function (entry) { return ({
                id: entry.id,
                faction: entry.faction,
                targetHex: structuredClone(entry.targetHex),
                radius: entry.radius,
                remainingTurns: entry.remainingTurns,
                strength: entry.strength
            }); }),
            intelBriefStates: Array.from(this.intelBriefStates.values()).map(function (entry) { return ({
                briefId: entry.briefId,
                isFalse: entry.isFalse,
                verificationStatus: entry.verificationStatus
            }); }),
            counterIntelResources: {
                deceptionCharges: this.playerCounterIntelResources.deceptionCharges,
                verificationCharges: this.playerCounterIntelResources.verificationCharges
            },
            counterIntelIdCounter: this.counterIntelIdCounter,
            enemyContactStates: Array.from(this.playerEnemyContactStates.values()).map(function (entry) { return ({
                unitId: entry.unitId,
                state: entry.state,
                lastSeenTurn: entry.lastSeenTurn,
                lastKnownHex: structuredClone(entry.lastKnownHex),
                lastKnownStrength: entry.lastKnownStrength,
                knownUnitType: entry.knownUnitType,
                source: entry.source
            }); }),
            hexModifications: Array.from(this.hexModifications.values()).flatMap(function (entries) { return entries.map(function (entry) { return structuredClone(entry); }); })
        };
    };
    /**
     * Supplies a read-only snapshot of current player placements so UI layers can mirror the battlefield.
     * The payload is cloned to prevent accidental mutation of engine-managed unit state.
     */
    GameEngine.prototype.getPlayerPlacementsSnapshot = function () {
        return this.getAllUnitsForFaction("Player").map(function (unit) { return structuredClone(unit); });
    };
    GameEngine.prototype.getHexStackMembers = function (hex, faction) {
        return this.buildCoalitionHexMembers(hex, faction).map(function (entry) { return (__assign(__assign({}, entry), { unit: structuredClone(entry.unit) })); });
    };
    GameEngine.prototype.combinePlayerUnits = function (primaryUnitId, secondaryUnitId) {
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g, _h;
        if (this._phase !== "playerTurn") {
            return null;
        }
        var allPlayerUnits = this.getAllUnitsForFaction("Player");
        var primary = (_a = allPlayerUnits.find(function (unit) { return _this.getSquadronId(unit) === primaryUnitId; })) !== null && _a !== void 0 ? _a : null;
        var secondary = (_b = allPlayerUnits.find(function (unit) { return _this.getSquadronId(unit) === secondaryUnitId; })) !== null && _b !== void 0 ? _b : null;
        if (!primary || !secondary || primary === secondary) {
            return null;
        }
        if ((0, Hex_1.axialKey)(primary.hex) !== (0, Hex_1.axialKey)(secondary.hex)) {
            return null;
        }
        if (primary.type !== secondary.type) {
            return null;
        }
        if ((primary.strength + secondary.strength) > 100) {
            return null;
        }
        var primaryHexUnits = this.getUnitsAtHexForFaction(primary.hex, "Player");
        var secondaryIndex = primaryHexUnits.findIndex(function (unit) { return _this.getSquadronId(unit) === secondaryUnitId; });
        var primaryIndex = primaryHexUnits.findIndex(function (unit) { return _this.getSquadronId(unit) === primaryUnitId; });
        if (primaryIndex < 0 || secondaryIndex < 0) {
            return null;
        }
        var strongerIndex = primaryHexUnits[primaryIndex].strength >= primaryHexUnits[secondaryIndex].strength ? primaryIndex : secondaryIndex;
        var weakerIndex = strongerIndex === primaryIndex ? secondaryIndex : primaryIndex;
        var stronger = structuredClone(primaryHexUnits[strongerIndex]);
        var weaker = structuredClone(primaryHexUnits[weakerIndex]);
        stronger.strength = Math.min(100, stronger.strength + weaker.strength);
        stronger.ammo = Math.max(0, ((_c = stronger.ammo) !== null && _c !== void 0 ? _c : 0) + ((_d = weaker.ammo) !== null && _d !== void 0 ? _d : 0));
        stronger.fuel = Math.max(0, ((_e = stronger.fuel) !== null && _e !== void 0 ? _e : 0) + ((_f = weaker.fuel) !== null && _f !== void 0 ? _f : 0));
        stronger.entrench = Math.max((_g = stronger.entrench) !== null && _g !== void 0 ? _g : 0, (_h = weaker.entrench) !== null && _h !== void 0 ? _h : 0);
        var mergedUnits = primaryHexUnits.filter(function (unit) { return _this.getSquadronId(unit) !== _this.getSquadronId(weaker); });
        mergedUnits[mergedUnits.findIndex(function (unit) { return _this.getSquadronId(unit) === _this.getSquadronId(stronger); })] = stronger;
        this.setUnitsAtHexForFaction(primary.hex, "Player", mergedUnits);
        this.deleteUnitActionFlags("Player", weaker);
        this.setUnitActionFlags("Player", stronger, this.createDefaultActionFlags());
        this.removeSupplyEntryFor(primary.hex, this.getSquadronId(weaker));
        this.syncPlayerAmmo(primary.hex, stronger.ammo, this.getSquadronId(stronger));
        this.syncPlayerFuel(primary.hex, stronger.fuel, this.getSquadronId(stronger));
        this.syncPlayerEntrench(primary.hex, stronger.entrench, this.getSquadronId(stronger));
        this.syncPlayerStrength(primary.hex, stronger.strength, this.getSquadronId(stronger));
        this.updateIdleRegistryFor((0, Hex_1.axialKey)(primary.hex));
        this.invalidateRosterCache();
        return structuredClone(stronger);
    };
    GameEngine.prototype.getReserveSnapshot = function () {
        return this.reserves.map(function (entry) { return ({
            unit: structuredClone(entry.unit),
            definition: entry.definition,
            allocationKey: entry.allocationKey,
            sprite: entry.sprite
        }); });
    };
    /**
     * Returns a categorized roster snapshot covering frontline, support, reserve, and casualty groupings.
     * The snapshot is cached until underlying battle state mutates so UI layers can request it frequently
     * without forcing redundant aggregation work.
     */
    GameEngine.prototype.getRosterSnapshot = function () {
        if (this.cachedRosterSnapshot) {
            return structuredClone(this.cachedRosterSnapshot);
        }
        var snapshot = this.buildRosterSnapshot();
        this.cachedRosterSnapshot = snapshot;
        return structuredClone(snapshot);
    };
    GameEngine.prototype.getTurnSummary = function () {
        return {
            phase: this._phase,
            activeFaction: this._activeFaction,
            turnNumber: this._turnNumber
        };
    };
    /**
     * Consumes and returns the pending bot turn summary, clearing it so it can only be read once.
     * Returns null if no bot turn has been executed since the last consumption.
     */
    GameEngine.prototype.consumeBotTurnSummary = function () {
        var result = this.pendingBotTurnSummary;
        this.pendingBotTurnSummary = null;
        return result;
    };
    /** Transfers an ally unit at the specified hex to player control. Returns true if a unit was transferred. */
    GameEngine.prototype.transferAllyControl = function (hex) {
        var allyUnit = this.lookupUnit(hex, "Ally");
        if (!allyUnit) {
            return false;
        }
        var key = (0, Hex_1.axialKey)(hex);
        var unitId = this.getSquadronId(allyUnit);
        // Remove from ally placements and supply mirror.
        this.removeUnitFromFactionHex("Ally", hex, unitId);
        this.allySupply = this.allySupply.filter(function (s) { return !((0, Hex_1.axialKey)(s.hex) === key && s.unitId === unitId); });
        // Transfer to player placements and supply mirror.
        var clone = structuredClone(allyUnit);
        this.ensureUnitId(clone);
        this.addUnitToFactionHex("Player", clone);
        var supplyEntry = (0, Supply_1.createSupplyUnits)([clone])[0];
        if (supplyEntry) {
            this.playerSupply.push(supplyEntry);
        }
        // Reset action flags/idle state for the new player unit.
        this.setUnitActionFlags("Player", clone, this.createDefaultActionFlags());
        this.updateIdleRegistryFor(key);
        // Keep mirrors and caches consistent.
        this.invalidateRosterCache();
        this.recordSupplySnapshot("Player");
        return true;
    };
    /** Executes the ally turn. Placeholder: allies hold position until dedicated ally AI is implemented. */
    GameEngine.prototype.executeAllyTurn = function () {
        // Intentionally minimal: allies currently do not perform autonomous maneuvers.
        // Supply upkeep and air mission progression are still applied in endTurn sequencing.
    };
    GameEngine.prototype.setSupplyPriority = function (unitId, priority) {
        var _a;
        if (!unitId) {
            return false;
        }
        var validPriorities = ["critical", "high", "normal", "low"];
        if (!validPriorities.includes(priority)) {
            return false;
        }
        var unit = (_a = this.getAllUnitsForFaction("Player").find(function (candidate) { return candidate.unitId === unitId; })) !== null && _a !== void 0 ? _a : null;
        if (!unit || this.isSupplyTruckType(unit.type)) {
            return false;
        }
        this.supplyPriorityByUnitId.set(unitId, priority);
        this.recordSupplySnapshot("Player");
        return true;
    };
    GameEngine.prototype.getLogisticsSnapshot = function () {
        var _this = this;
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
        this.ensureSupplyTruckStatesForFaction("Player");
        var allPlacements = this.getAllUnitsForFaction("Player");
        var convoyUnits = allPlacements.filter(function (unit) { return _this.isSupplyTruckType(unit.type); });
        var placements = allPlacements.filter(function (unit) { return !_this.isSupplyTruckType(unit.type); });
        var totalUnits = placements.length;
        var network = this.buildSupplyNetwork("Player");
        var catalog = { terrain: this.terrain, unitTypes: this.unitTypes };
        var sources = [];
        if (this._baseCamp) {
            sources.push({ key: "baseCamp", label: "Base Camp", hex: this._baseCamp.hex });
        }
        if (this.playerSide.hq) {
            sources.push({ key: "hq", label: "Headquarters", hex: this.playerSide.hq });
        }
        var depotTotals = (0, SupplyState_1.getInventoryTotals)(this.supplyStateByFaction.Player, ["ammo", "fuel", "parts"]);
        var carriedAmmoTotal = this.playerSupply.reduce(function (sum, entry) { var _a; return sum + ((_a = entry.ammo) !== null && _a !== void 0 ? _a : 0); }, 0);
        var carriedFuelTotal = this.playerSupply.reduce(function (sum, entry) { var _a; return sum + ((_a = entry.fuel) !== null && _a !== void 0 ? _a : 0); }, 0);
        var maintenanceDemand = placements.reduce(function (sum, unit) { return sum + Math.max(0, 10 - unit.strength); }, 0);
        var convoyStateMap = this.getSupplyTruckStateMap("Player");
        var convoyCargo = Array.from(convoyStateMap.values()).reduce(function (totals, convoy) {
            totals.ammo += convoy.ammoCargo;
            totals.fuel += convoy.fuelCargo;
            return totals;
        }, { ammo: 0, fuel: 0 });
        var routesBySource = sources.map(function (source) { return ({
            source: source,
            routes: _this.computePlayerLogisticsRoutes(source.hex, catalog, network, placements)
        }); });
        var sourceAssignments = new Map();
        sources.forEach(function (source) { return sourceAssignments.set(source.key, []); });
        placements.forEach(function (unit) {
            var _a;
            var targetKey = (0, Hex_1.axialKey)(unit.hex);
            var bestRoute = null;
            for (var _i = 0, routesBySource_1 = routesBySource; _i < routesBySource_1.length; _i++) {
                var _b = routesBySource_1[_i], source = _b.source, routes = _b.routes;
                var summary = routes.get(targetKey);
                if (!summary) {
                    continue;
                }
                if (!bestRoute || summary.totalCost < bestRoute.summary.totalCost) {
                    bestRoute = { sourceKey: source.key, sourceLabel: source.label, summary: summary };
                }
            }
            if (!bestRoute) {
                return;
            }
            (_a = sourceAssignments.get(bestRoute.sourceKey)) === null || _a === void 0 ? void 0 : _a.push({
                sourceLabel: bestRoute.sourceLabel,
                targetKey: targetKey,
                unit: unit,
                summary: bestRoute.summary
            });
        });
        var connectedUnits = Array.from(sourceAssignments.values()).reduce(function (sum, entries) { return sum + entries.length; }, 0);
        var isolatedUnits = Math.max(0, totalUnits - connectedUnits);
        var nearestSourceForHex = function (hex) {
            var _a;
            if (sources.length === 0) {
                return null;
            }
            var best = null;
            for (var _i = 0, sources_1 = sources; _i < sources_1.length; _i++) {
                var source = sources_1[_i];
                var distance = (0, Hex_1.hexDistance)(source.hex, hex);
                if (!best || distance < best.distance) {
                    best = { key: source.key, distance: distance };
                }
            }
            return (_a = best === null || best === void 0 ? void 0 : best.key) !== null && _a !== void 0 ? _a : null;
        };
        var supplySources = sources.map(function (source) {
            var _a;
            var assignedRoutes = (_a = sourceAssignments.get(source.key)) !== null && _a !== void 0 ? _a : [];
            var routeValues = assignedRoutes.map(function (entry) { return entry.summary; });
            var sourceConnectedUnits = assignedRoutes.length;
            var sourceConvoys = convoyUnits.filter(function (unit) { return nearestSourceForHex(unit.hex) === source.key; });
            var operationalConvoys = sourceConvoys.filter(function (unit) {
                var convoyState = unit.unitId ? convoyStateMap.get(unit.unitId) : null;
                return (convoyState === null || convoyState === void 0 ? void 0 : convoyState.status) !== "blocked";
            });
            var throughput = operationalConvoys.length * (balance_1.supply.convoy.unloadAmmoPerTurn + balance_1.supply.convoy.unloadFuelPerTurn);
            var averageTravelHours = routeValues.length === 0
                ? 0
                : Number((routeValues.reduce(function (sum, summary) { return sum + summary.estimatedHours; }, 0) / routeValues.length).toFixed(2));
            var utilization = convoyUnits.length === 0 ? 0 : Number((sourceConvoys.length / convoyUnits.length).toFixed(2));
            var bottleneckSummary = _this.selectHighestCostRoute(routeValues);
            var bottleneck = sourceConnectedUnits > 0 && sourceConvoys.length === 0
                ? "No convoy coverage"
                : bottleneckSummary
                    ? _this.describeRouteBottleneck(bottleneckSummary)
                    : null;
            return {
                key: source.key,
                label: source.label,
                connectedUnits: sourceConnectedUnits,
                throughput: Number(throughput.toFixed(2)),
                utilization: utilization,
                averageTravelHours: averageTravelHours,
                bottleneck: bottleneck
            };
        });
        var stockpiles = [
            {
                resource: "ammo",
                total: (_a = depotTotals.ammo) !== null && _a !== void 0 ? _a : 0,
                averagePerUnit: totalUnits === 0 ? 0 : Number((carriedAmmoTotal / totalUnits).toFixed(2)),
                trend: ((_b = depotTotals.ammo) !== null && _b !== void 0 ? _b : 0) >= totalUnits * balance_1.supply.resupply.ammo ? "stable" : "falling"
            },
            {
                resource: "fuel",
                total: (_c = depotTotals.fuel) !== null && _c !== void 0 ? _c : 0,
                averagePerUnit: totalUnits === 0 ? 0 : Number((carriedFuelTotal / totalUnits).toFixed(2)),
                trend: ((_d = depotTotals.fuel) !== null && _d !== void 0 ? _d : 0) >= totalUnits * balance_1.supply.resupply.fuel ? "stable" : "falling"
            },
            {
                resource: "parts",
                total: (_e = depotTotals.parts) !== null && _e !== void 0 ? _e : 0,
                averagePerUnit: totalUnits === 0 ? 0 : Number((maintenanceDemand / Math.max(totalUnits, 1)).toFixed(2)),
                trend: ((_f = depotTotals.parts) !== null && _f !== void 0 ? _f : 0) > maintenanceDemand ? "rising" : "stable"
            }
        ];
        var delayNodesMap = new Map();
        var priorityTargets = this.resolveSupplyDemandEntries("Player")
            .map(function (entry) {
            var _a;
            var assignedConvoys = convoyUnits.reduce(function (count, convoy) {
                var _a;
                var convoyId = (_a = convoy.unitId) !== null && _a !== void 0 ? _a : "";
                var convoyState = convoyStateMap.get(convoyId);
                return (convoyState === null || convoyState === void 0 ? void 0 : convoyState.assignedUnitId) === entry.unit.unitId ? count + 1 : count;
            }, 0);
            var reachableFromNetwork = (0, Supply_1.hasSupplyPath)(entry.unit.hex, network);
            return {
                unitId: (_a = entry.unit.unitId) !== null && _a !== void 0 ? _a : "".concat(entry.unit.type, "@").concat((0, Hex_1.axialKey)(entry.unit.hex)),
                unitLabel: _this.getDisplayUnitLabel(entry.unit),
                hex: _this.formatAxial(entry.unit.hex),
                priority: entry.priority,
                ammoNeed: Number(entry.ammoNeed.toFixed(2)),
                fuelNeed: Number(entry.fuelNeed.toFixed(2)),
                assignedConvoys: assignedConvoys,
                status: entry.directEligible
                    ? "direct"
                    : assignedConvoys > 0
                        ? "delivering"
                        : reachableFromNetwork
                            ? "queued"
                            : "isolated"
            };
        })
            .sort(function (left, right) {
            return _this.getSupplyPriorityWeight(right.priority) - _this.getSupplyPriorityWeight(left.priority)
                || (right.ammoNeed + right.fuelNeed) - (left.ammoNeed + left.fuelNeed);
        });
        var convoyStatuses = convoyUnits.map(function (unit) {
            var _a, _b;
            var convoyId = (_a = unit.unitId) !== null && _a !== void 0 ? _a : _this.ensureUnitId(unit);
            var convoyState = convoyStateMap.get(convoyId);
            var assignedUnit = (_b = placements.find(function (candidate) { return candidate.unitId === convoyState.assignedUnitId; })) !== null && _b !== void 0 ? _b : null;
            var occupancy = _this.buildConvoyBlockingOccupancySet("Player");
            occupancy.delete((0, Hex_1.axialKey)(unit.hex));
            var routePlan = assignedUnit
                ? _this.findCheapestPathToAny(unit.hex, _this.collectServiceHexes(assignedUnit.hex, unit.hex, "Player"), _this.getUnitDefinition(unit.type).moveType, occupancy)
                : _this.isHexWithinSupplySourceRadius(unit.hex, "Player")
                    ? null
                    : _this.findCheapestPathToAny(unit.hex, _this.collectSourceApproachHexes("Player", unit.hex), _this.getUnitDefinition(unit.type).moveType, occupancy);
            if (routePlan) {
                var cumulativeCost_1 = 0;
                routePlan.path.slice(1).forEach(function (hex, index) {
                    var _a, _b;
                    var previous = (_a = routePlan.path[index]) !== null && _a !== void 0 ? _a : routePlan.path[0];
                    cumulativeCost_1 += _this.resolveMoveCost("wheel", _this.terrainAt(hex), hex, previous);
                    var nodeKey = _this.formatAxial(hex);
                    var seen = (_b = delayNodesMap.get(nodeKey)) !== null && _b !== void 0 ? _b : 0;
                    delayNodesMap.set(nodeKey, Math.max(seen, cumulativeCost_1));
                });
            }
            var etaHours = routePlan
                ? Number((((routePlan.path.length - 1) * 5) / 60).toFixed(2))
                : 0;
            var incident = unit.fuel <= 0
                ? "Out of fuel"
                : convoyState.status === "blocked" || (assignedUnit !== null && !routePlan)
                    ? "Route blocked"
                    : null;
            var routeLabel = assignedUnit
                ? "".concat(_this.getDisplayUnitLabel(unit), " \u2192 ").concat(_this.getDisplayUnitLabel(assignedUnit), " @ ").concat(_this.formatAxial(assignedUnit.hex))
                : _this.isHexWithinSupplySourceRadius(unit.hex, "Player")
                    ? "".concat(_this.getDisplayUnitLabel(unit), " rearming at depot")
                    : "".concat(_this.getDisplayUnitLabel(unit), " \u2192 Depot");
            return {
                unitId: convoyId,
                convoyLabel: "".concat(_this.getDisplayUnitLabel(unit), " @ ").concat(_this.formatAxial(unit.hex)),
                route: routeLabel,
                status: incident ? "blocked" : convoyState.status,
                etaHours: etaHours,
                cargoAmmo: Number(convoyState.ammoCargo.toFixed(2)),
                cargoFuel: Number(convoyState.fuelCargo.toFixed(2)),
                incident: incident
            };
        });
        var delayNodes = Array.from(delayNodesMap.entries())
            .sort(function (a, b) { return b[1] - a[1]; })
            .slice(0, 5)
            .map(function (_a) {
            var node = _a[0], cost = _a[1];
            return ({
                node: node,
                risk: _this.resolveDelayRisk(cost),
                reason: cost > 25 ? "Extended travel time" : "Moderate congestion"
            });
        });
        var maintenanceBacklog = [];
        var alerts = [];
        if (isolatedUnits > 0) {
            alerts.push({
                level: isolatedUnits === totalUnits ? "critical" : "warning",
                message: "".concat(isolatedUnits, " deployed unit").concat(isolatedUnits === 1 ? "" : "s", " ").concat(isolatedUnits === totalUnits ? "are" : "is", " outside the current supply network.")
            });
        }
        if (((_g = depotTotals.ammo) !== null && _g !== void 0 ? _g : 0) <= 0) {
            alerts.push({ level: "critical", message: "Depot ammunition has been exhausted." });
        }
        else if (((_h = stockpiles[0]) === null || _h === void 0 ? void 0 : _h.averagePerUnit) < 3) {
            alerts.push({ level: "warning", message: "Ammunition reserves are trending low." });
        }
        if (((_j = depotTotals.fuel) !== null && _j !== void 0 ? _j : 0) <= 0) {
            alerts.push({ level: "critical", message: "Depot fuel stock has been exhausted." });
        }
        else if (((_k = stockpiles[1]) === null || _k === void 0 ? void 0 : _k.averagePerUnit) < 3) {
            alerts.push({ level: "warning", message: "Fuel availability is below desired levels." });
        }
        var forwardUnitsNeedingConvoys = priorityTargets.filter(function (entry) { return entry.status !== "direct"; });
        if (forwardUnitsNeedingConvoys.length > 0 && convoyUnits.length === 0) {
            alerts.push({ level: "critical", message: "Forward units need resupply but no supply convoys are deployed." });
        }
        else if (forwardUnitsNeedingConvoys.length > convoyUnits.length && convoyUnits.length > 0) {
            alerts.push({ level: "warning", message: "Convoy coverage is thinner than the current resupply queue." });
        }
        if (sources.length === 0 && totalUnits > 0) {
            alerts.push({ level: "critical", message: "No active base camp or headquarters is feeding the logistics network." });
        }
        return {
            turn: this._turnNumber,
            deployedUnits: totalUnits,
            connectedUnits: connectedUnits,
            isolatedUnits: isolatedUnits,
            convoyUnits: convoyUnits.length,
            loadedConvoys: convoyStatuses.filter(function (entry) { return entry.cargoAmmo > 0 || entry.cargoFuel > 0; }).length,
            convoyCargo: {
                ammo: Number(convoyCargo.ammo.toFixed(2)),
                fuel: Number(convoyCargo.fuel.toFixed(2))
            },
            depotStock: {
                ammo: (_l = depotTotals.ammo) !== null && _l !== void 0 ? _l : 0,
                fuel: (_m = depotTotals.fuel) !== null && _m !== void 0 ? _m : 0,
                parts: (_o = depotTotals.parts) !== null && _o !== void 0 ? _o : 0
            },
            supplySources: supplySources,
            stockpiles: stockpiles,
            convoyStatuses: convoyStatuses,
            priorityTargets: priorityTargets,
            delayNodes: delayNodes,
            maintenanceBacklog: maintenanceBacklog,
            alerts: alerts
        };
    };
    /**
     * Returns a read-only copy of all combat reports for battle analysis.
     */
    GameEngine.prototype.getCombatReports = function () {
        return __spreadArray([], this.combatReports, true);
    };
    /**
     * Exposes the commander bonus package so UI overlays can mirror the exact modifiers applied in-engine.
     * Structured cloning guards the internal mutable copy from accidental downstream mutation.
     */
    GameEngine.prototype.getCommanderBenefits = function () {
        return structuredClone(this.playerCommanderStats);
    };
    /** Quick guard helpers keep aircraft logic consistent. */
    GameEngine.prototype.isAircraft = function (definition) {
        return definition.moveType === "air";
    };
    GameEngine.prototype.isBomber = function (definition) {
        var _a;
        return this.isAircraft(definition) && ((_a = definition.traits) !== null && _a !== void 0 ? _a : []).includes("carpet");
    };
    /** Dedicated reconnaissance aircraft provide spotting only and never conduct offensive sorties. */
    GameEngine.prototype.isScoutPlane = function (definition) {
        return this.isAircraft(definition) && definition.class === "recon";
    };
    /** Returns the baseline sortie ammunition for the provided airframe. */
    GameEngine.prototype.createInitialAircraftAmmo = function (definition) {
        if (!this.isAircraft(definition)) {
            return { air: 0, ground: 0, needsRearm: false };
        }
        if (this.isScoutPlane(definition)) {
            // Reconnaissance planes only provide spotting and never carry ordnance.
            return { air: 0, ground: 0, needsRearm: false };
        }
        return { air: 4, ground: 1, needsRearm: false };
    };
    /** Applies quick-repair strength restoration when an aircraft successfully rearms. */
    GameEngine.prototype.applyAircraftRepair = function (faction, unitKey, unit) {
        var _a;
        var currentStrength = (_a = unit.strength) !== null && _a !== void 0 ? _a : 0;
        var repairedStrength = Math.min(100, Math.round(currentStrength * 1.1));
        if (repairedStrength <= currentStrength) {
            return;
        }
        var updatedUnit = structuredClone(unit);
        updatedUnit.strength = repairedStrength;
        if (faction === "Player") {
            this.playerPlacements.set(unitKey, updatedUnit);
            this.syncPlayerStrength(updatedUnit.hex, repairedStrength);
        }
        else {
            this.botPlacements.set(unitKey, updatedUnit);
            this.syncBotStrength(updatedUnit.hex, repairedStrength);
        }
    };
    /** Ensures aircraft ammo trackers stay aligned when units move between hexes. */
    GameEngine.prototype.transferAircraftAmmoState = function (registry, fromKey, toKey) {
        if (!registry.has(fromKey)) {
            return;
        }
        var payload = registry.get(fromKey);
        registry.delete(fromKey);
        if (payload) {
            registry.set(toKey, payload);
        }
    };
    /** Fetch or initialize the aircraft ammo record for a given unit. */
    GameEngine.prototype.getAircraftAmmoState = function (faction, hexKey, definition) {
        var registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
        var existing = registry.get(hexKey);
        if (existing) {
            return existing;
        }
        var initialState = this.createInitialAircraftAmmo(definition);
        registry.set(hexKey, initialState);
        return initialState;
    };
    /** Reset aircraft sortie ammo after the unit spends a turn sitting on the base camp hex. */
    GameEngine.prototype.resetAircraftAmmoIfAtBase = function (unit, faction) {
        // Only the player currently has a modeled base camp rearming loop.
        var base = faction === "Player" ? this._baseCamp : null;
        if (!base) {
            return;
        }
        var unitKey = this.getSquadronId(unit);
        var registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
        var state = registry.get(unitKey);
        if (!state) {
            return;
        }
        var definition = this.getUnitDefinition(unit.type);
        if (!this.isAircraft(definition)) {
            return;
        }
        if ((0, Hex_1.axialKey)(base.hex) !== (0, Hex_1.axialKey)(unit.hex)) {
            return;
        }
        var flags = faction === "Player" ? this.playerActionFlags.get(unitKey) : undefined;
        // Require the squadron to finish the turn on the base hex (no fractional move points remaining).
        if (flags && flags.movementPointsUsed > 0) {
            return;
        }
        var baseline = this.createInitialAircraftAmmo(definition);
        var wasDepleted = state.needsRearm || state.air < baseline.air || state.ground < baseline.ground;
        registry.set(unitKey, baseline);
        if (wasDepleted) {
            this.applyAircraftRepair(faction, unitKey, unit);
        }
    };
    /** Determine if an aircraft is flagged for rearming and therefore cannot launch more attacks. */
    GameEngine.prototype.aircraftNeedsRearm = function (faction, hexKey) {
        var _a;
        var registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
        var state = registry.get(hexKey);
        return (_a = state === null || state === void 0 ? void 0 : state.needsRearm) !== null && _a !== void 0 ? _a : false;
    };
    /** Tag an aircraft as requiring rearm, preventing further attacks until it parks on the base. */
    GameEngine.prototype.markAircraftNeedsRearm = function (faction, hexKey) {
        var registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
        var snapshot = registry.get(hexKey);
        if (!snapshot) {
            return;
        }
        registry.set(hexKey, __assign(__assign({}, snapshot), { needsRearm: true }));
    };
    /** Consume one sortie from the appropriate ammo pool. Returns updated state for logging. */
    GameEngine.prototype.spendAircraftAmmo = function (faction, hexKey, targetIsAir) {
        var registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
        var snapshot = registry.get(hexKey);
        if (!snapshot) {
            return null;
        }
        var next = __assign({}, snapshot);
        if (targetIsAir) {
            next.air = Math.max(0, next.air - 1);
            if (next.air <= 0) {
                next.needsRearm = true;
            }
        }
        else {
            next.ground = Math.max(0, next.ground - 1);
            if (next.ground <= 0) {
                next.needsRearm = true;
            }
        }
        registry.set(hexKey, next);
        return next;
    };
    /** Re-arm aircraft for the specified faction at the start of a fresh turn. */
    GameEngine.prototype.refreshAircraftAmmoForFaction = function (faction) {
        var _this = this;
        var registry = faction === "Player" ? this.playerAttackAmmo : this.botAttackAmmo;
        var placements = faction === "Player" ? this.playerPlacements : this.botPlacements;
        // Drop stale entries for units that no longer exist on the board.
        for (var _i = 0, _a = Array.from(registry.keys()); _i < _a.length; _i++) {
            var key = _a[_i];
            if (!placements.has(key)) {
                registry.delete(key);
            }
        }
        placements.forEach(function (unit, key) {
            var definition = _this.getUnitDefinition(unit.type);
            if (!_this.isAircraft(definition)) {
                registry.delete(key);
                return;
            }
            var state = _this.getAircraftAmmoState(faction, key, definition);
            if (faction === "Player") {
                // Player squadrons only rearm once they actually spend a turn parked on the base hex.
                _this.resetAircraftAmmoIfAtBase(unit, faction);
            }
            else {
                // AI logistics are abstracted off-map, so bots rearm automatically between turns using baseline loadouts.
                var baseline = _this.createInitialAircraftAmmo(definition);
                var wasDepleted = state.needsRearm || state.air < baseline.air || state.ground < baseline.ground;
                registry.set(key, baseline);
                if (wasDepleted) {
                    _this.applyAircraftRepair(faction, key, unit);
                }
            }
        });
    };
    /** Guard helper ensuring a method is used in the correct phase. */
    GameEngine.prototype.assertPhase = function (expected, message) {
        if (this._phase !== expected) {
            throw new Error(message);
        }
    };
    /** Guard rejecting calls when still in deployment. */
    GameEngine.prototype.assertNotPhase = function (disallowed, message) {
        if (this._phase === disallowed) {
            throw new Error(message);
        }
    };
    /** Retrieve a unit at the specified hex for the given faction. Optionally includes reserves for air units. */
    GameEngine.prototype.lookupUnit = function (hex, faction, includeReserves, unitId) {
        var _this = this;
        var _a;
        if (includeReserves === void 0) { includeReserves = false; }
        var deployed = this.findUnitInFactionAtHex(hex, faction, unitId);
        if (deployed) {
            return deployed;
        }
        // Optionally check reserves for player faction (air units may fly missions without being deployed)
        if (includeReserves && faction === "Player") {
            var key_1 = (0, Hex_1.axialKey)(hex);
            var reserveEntry = this.reserves.find(function (r) {
                return (0, Hex_1.axialKey)(r.unit.hex) === key_1 && (!unitId || _this.getSquadronId(r.unit) === unitId);
            });
            return (_a = reserveEntry === null || reserveEntry === void 0 ? void 0 : reserveEntry.unit) !== null && _a !== void 0 ? _a : null;
        }
        return null;
    };
    /**
     * Finds a unit by its stable squadronId (unitId). Searches deployed placements and reserves.
     * Returns the unit and its current hex key if found, null otherwise.
     * This is critical for air mission resolution since squadrons may share a base hex.
     */
    GameEngine.prototype.lookupUnitBySquadronId = function (squadronId, faction) {
        var placements = this.getAllUnitsForFaction(faction);
        // Search deployed units first
        for (var _i = 0, placements_1 = placements; _i < placements_1.length; _i++) {
            var unit = placements_1[_i];
            if (this.getSquadronId(unit) === squadronId) {
                return { unit: unit, hexKey: (0, Hex_1.axialKey)(unit.hex) };
            }
        }
        // For player faction, also check reserves (air units may fly missions without being deployed)
        if (faction === "Player") {
            for (var _a = 0, _b = this.reserves; _a < _b.length; _a++) {
                var entry = _b[_a];
                if (this.getSquadronId(entry.unit) === squadronId) {
                    return { unit: entry.unit, hexKey: (0, Hex_1.axialKey)(entry.unit.hex) };
                }
            }
        }
        return null;
    };
    GameEngine.prototype.buildAttackRequest = function (attacker, defender, a3, a4, a5) {
        var _a, _b;
        var attackerFaction = "Player";
        var defenderFaction = "Bot";
        var options;
        if (a3 === "Player" || a3 === "Bot" || a3 === "Ally") {
            attackerFaction = a3;
            defenderFaction = (_a = a4) !== null && _a !== void 0 ? _a : (attackerFaction === "Player" ? "Bot" : "Player");
            options = a5;
        }
        else {
            options = a3;
        }
        var attackerType = this.getUnitDefinition(attacker.type);
        var defenderType = this.getUnitDefinition(defender.type);
        var lister = this.createLosLister();
        // Aircraft combat restrictions: Only aircraft and Flak 88 can attack aircraft
        var defenderIsAircraft = defenderType.moveType === "air";
        var attackerIsAircraft = attackerType.moveType === "air";
        var attackerIsFlak = attacker.type.toLowerCase().includes("flak");
        var attackerIsBomber = this.isBomber(attackerType);
        if (!attackerIsAircraft && attacker.ammo < this.resolveGroundAttackAmmoCost(attackerType)) {
            return null;
        }
        if (defenderIsAircraft && !attackerIsAircraft && !attackerIsFlak) {
            return null; // Ground units (except Flak) cannot target aircraft
        }
        if (!(options === null || options === void 0 ? void 0 : options.allowBomberAirAttack) && attackerIsBomber && defenderIsAircraft) {
            return null; // Bombers only engage aircraft defensively during retaliation.
        }
        // Check direct LOS using advanced system with unit-specific rules
        var hasDirectLOS = (0, LOS_1.losClearAdvanced)({
            attackerClass: attackerType.class,
            attackerHex: attacker.hex,
            targetHex: defender.hex,
            isAttackerAir: attackerType.moveType === "air",
            lister: lister,
            purpose: "direct-fire"
        });
        var canAttackWithoutDirectLOS = this.canAttackWithoutDirectLOS(attackerType);
        var isSpottedOnly = false;
        if (!hasDirectLOS) {
            if (!canAttackWithoutDirectLOS) {
                return null;
            }
            var hasSpotting = this.checkTargetSpotted(defender.hex, attackerFaction);
            if (!hasSpotting) {
                return null;
            }
            isSpottedOnly = true;
        }
        var attackerGeneral = attackerFaction === "Player" ? this.playerSide.general : this.botSide.general;
        var defenderGeneral = defenderFaction === "Player" ? this.playerSide.general : this.botSide.general;
        var attackerState = {
            unit: attackerType,
            strength: attacker.strength,
            experience: attacker.experience,
            general: attackerGeneral
        };
        var defenderState = {
            unit: defenderType,
            strength: defender.strength,
            experience: defender.experience,
            general: defenderGeneral
        };
        // Combat stance logic (infantry-type units only)
        var stance = options === null || options === void 0 ? void 0 : options.stance;
        var isAssault = stance === "assault";
        var attackerCtx = {
            hex: attacker.hex,
            stance: stance
        };
        // Check if defender is rushing (loses terrain cover) using the unit's stable action state.
        var isDefenderRushing = this.getUnitActionFlags(defenderFaction, defender).isRushing;
        // Check for fortifications on defender's hex
        var defenderMods = this.getHexModifications(defender.hex);
        var defenderFortificationFacings = defenderMods
            .filter(function (entry) { return entry.type === "fortifications"; })
            .map(function (entry) { return entry.facing; })
            .filter(function (edge) { return edge !== null && edge !== undefined; });
        var defenderFortified = defenderFortificationFacings.length > 0;
        var defenderCtx = {
            terrain: (_b = this.terrainAt(defender.hex)) !== null && _b !== void 0 ? _b : this.defaultTerrain(),
            class: defenderType.class,
            facing: defender.facing,
            hex: defender.hex,
            isRushing: isDefenderRushing || isAssault, // Attacker loses cover when assaulting
            isSpottedOnly: isSpottedOnly,
            stance: isAssault ? "assault" : undefined, // Defender also at close range if assaulted
            fortified: defenderFortified,
            fortificationFacings: defenderFortificationFacings
        };
        return {
            attacker: attackerState,
            defender: defenderState,
            attackerCtx: attackerCtx,
            defenderCtx: defenderCtx,
            targetFacing: defender.facing,
            isSoftTarget: defenderType.class === "infantry" || defenderType.class === "specialist"
        };
    };
    /** Check if target hex is spotted by any friendly unit that can plausibly see it. */
    GameEngine.prototype.checkTargetSpotted = function (targetHex, faction) {
        var placements = faction === "Player" ? this.playerPlacements : faction === "Bot" ? this.botPlacements : this.allyPlacements;
        var lister = this.createLosLister();
        // Check all friendly units for spotting capability
        for (var _i = 0, placements_2 = placements; _i < placements_2.length; _i++) {
            var _a = placements_2[_i], _ = _a[0], unit = _a[1];
            var unitDef = this.getUnitDefinition(unit.type);
            var distanceToTarget = (0, Hex_1.hexDistance)(unit.hex, targetHex);
            var spottingRange = this.resolveSpottingRange(unitDef);
            if (distanceToTarget > spottingRange) {
                continue;
            }
            // Check if this unit has LOS to the target
            var hasLOS = (0, LOS_1.losClearAdvanced)({
                attackerClass: unitDef.class,
                attackerHex: unit.hex,
                targetHex: targetHex,
                isAttackerAir: unitDef.moveType === "air",
                lister: lister,
                purpose: "spotting"
            });
            if (hasLOS) {
                // Ground units only spot when the target sits inside their vision bubble, maintaining the need for dedicated recon at long range.
                return true; // Target spotted!
            }
        }
        return false; // No friendly unit can see target
    };
    /**
     * Apply supply upkeep or attrition to whichever faction just finished its turn.
     */
    GameEngine.prototype.applySupplyTickFor = function (faction) {
        var _this = this;
        var units = faction === "Player" ? this.playerSupply : faction === "Bot" ? this.botSupply : this.allySupply;
        var supplyState = this.supplyStateByFaction[faction];
        // Credit baseline production and deliver any shipments slated for this turn before depot issue and convoy loading.
        this.advanceFactionSupplyState(faction);
        var network = this.buildSupplyNetwork(faction);
        var outOfSupply = [];
        var supplyScalar = this.commanderSupplyScalar(faction);
        var attritionProfile = {
            ammoLoss: this.scaleSupplyAmount(balance_1.supply.tick.ammoLoss, supplyScalar),
            fuelLoss: this.scaleSupplyAmount(balance_1.supply.tick.fuelLoss, supplyScalar),
            entrenchLoss: this.scaleSupplyAmount(balance_1.supply.tick.entrenchLoss, supplyScalar),
            strengthLossWhenEmpty: this.scaleSupplyAmount(balance_1.supply.tick.stepLossWhenEmpty, supplyScalar)
        };
        units.forEach(function (state) {
            var unit = _this.findUnitInFactionAtHex(state.hex, faction, state.unitId);
            if (!unit) {
                return;
            }
            var connectedToSupply = (0, Supply_1.hasSupplyPath)(state.hex, network);
            if (!connectedToSupply) {
                var previous = { ammo: state.ammo, fuel: state.fuel, entrench: state.entrench, strength: state.strength };
                (0, Supply_1.applyOutOfSupply)(state, attritionProfile);
                unit.ammo = state.ammo;
                unit.fuel = state.fuel;
                unit.entrench = state.entrench;
                unit.strength = state.strength;
                var sufferedAttrition = state.ammo !== previous.ammo ||
                    state.fuel !== previous.fuel ||
                    state.entrench !== previous.entrench ||
                    state.strength !== previous.strength;
                if (sufferedAttrition) {
                    outOfSupply.push(structuredClone(unit));
                }
            }
            // Keep the placement mirrored with the supply state so UI snapshots expose accurate onboard values.
            unit.ammo = state.ammo;
            unit.fuel = state.fuel;
            unit.entrench = state.entrench;
            unit.strength = state.strength;
        });
        var demandEntries = this.resolveSupplyDemandEntries(faction);
        this.applyDirectDepotIssues(faction, supplyState, demandEntries);
        this.automateSupplyConvoys(faction, supplyState, demandEntries);
        (0, SupplyState_1.enforceLedgerLimit)(supplyState, balance_1.supply.ledgerLimit);
        var snapshot = this.computeSupplySnapshot(faction);
        this.storeSupplySnapshot(faction, snapshot);
        return { faction: faction, outOfSupply: outOfSupply };
    };
    /** Adapter returning both terrain and LOS fields to the `losClear()` helper. */
    GameEngine.prototype.createLosLister = function () {
        var _this = this;
        return {
            terrainAt: function (hex) { return _this.terrainAt(hex); }
        };
    };
    GameEngine.prototype.canAttackWithoutDirectLOS = function (definition) {
        return definition.moveType === "air" || definition.class === "artillery" || definition.traits.includes("indirect");
    };
    /** Construct the supply network for the specified faction using the base camp as the primary source. */
    GameEngine.prototype.buildSupplyNetwork = function (faction) {
        var _this = this;
        var sources = [];
        if (faction === "Player" && this._baseCamp) {
            sources.push(this._baseCamp.hex);
        }
        var side = faction === "Player" ? this.playerSide : faction === "Bot" ? this.botSide : this.allySide;
        if (side === null || side === void 0 ? void 0 : side.hq) {
            sources.push(side.hq);
        }
        return {
            sources: sources,
            map: {
                terrainAt: function (hex) { return _this.terrainAt(hex); },
                isRoad: function (hex) { return _this.isRoad(hex); },
                isPassable: function () { return true; }
            }
        };
    };
    GameEngine.prototype.tileCanHostRoad = function (tile) {
        if (!tile) {
            return false;
        }
        return tile.terrain !== "sea" && tile.terrain !== "river" && tile.terrainType !== "water";
    };
    GameEngine.prototype.tileHasRoadSurface = function (tile) {
        if (!tile || !this.tileCanHostRoad(tile)) {
            return false;
        }
        var terrain = tile.terrain.toLowerCase();
        var terrainType = tile.terrainType.toLowerCase();
        var features = tile.features.map(function (feature) { return feature.toLowerCase(); });
        var isHamlet = terrain === "city" && terrainType === "urban" && tile.density.toLowerCase() === "sparse" && features.includes("buildings");
        return terrain === "road" || terrainType === "road" || features.includes("road") || isHamlet;
    };
    /** Treat any explicit road surface or authored road feature as part of the road network. */
    GameEngine.prototype.isRoad = function (hex) {
        return this.tileHasRoadSurface(this.lookupTileDetails(hex));
    };
    /** In-bounds check for axial coordinates. */
    GameEngine.prototype.inBounds = function (hex) {
        var rows = this.scenario.size.rows;
        var cols = this.scenario.size.cols;
        // Convert axial to offset for bounds checking since scenario.tiles uses offset coordinates
        var col = hex.q;
        var row = hex.r + Math.floor(hex.q / 2);
        return col >= 0 && row >= 0 && col < cols && row < rows;
    };
    /** True if any unit occupies the hex. */
    GameEngine.prototype.isOccupied = function (hex) {
        var key = (0, Hex_1.axialKey)(hex);
        return this.playerPlacements.has(key) || this.botPlacements.has(key) || this.allyPlacements.has(key);
    };
    GameEngine.prototype.findSupplyEntryIndex = function (entries, hex, unitId) {
        if (unitId) {
            var byUnitId = entries.findIndex(function (entry) { return entry.unitId === unitId; });
            if (byUnitId >= 0) {
                return byUnitId;
            }
        }
        var key = (0, Hex_1.axialKey)(hex);
        return entries.findIndex(function (entry) { return (0, Hex_1.axialKey)(entry.hex) === key; });
    };
    /** Update cached player supply entry position after a move. */
    GameEngine.prototype.updatePlayerSupplyPosition = function (from, to, unitId) {
        var idx = this.findSupplyEntryIndex(this.playerSupply, from, unitId);
        if (idx >= 0) {
            this.playerSupply[idx].hex = structuredClone(to);
        }
    };
    /** Sync attacker ammo to supply mirror. */
    GameEngine.prototype.syncPlayerAmmo = function (attackerHex, ammo, unitId) {
        var idx = this.findSupplyEntryIndex(this.playerSupply, attackerHex, unitId);
        if (idx >= 0) {
            this.playerSupply[idx].ammo = ammo;
        }
    };
    /** Sync movement fuel to the player-side supply mirror. */
    GameEngine.prototype.syncPlayerFuel = function (unitHex, fuel, unitId) {
        var idx = this.findSupplyEntryIndex(this.playerSupply, unitHex, unitId);
        if (idx >= 0) {
            this.playerSupply[idx].fuel = fuel;
        }
    };
    /** Mirror player strength after bot attacks to keep supply snapshots honest. */
    GameEngine.prototype.syncPlayerStrength = function (targetHex, strength, unitId) {
        var idx = this.findSupplyEntryIndex(this.playerSupply, targetHex, unitId);
        if (idx >= 0) {
            this.playerSupply[idx].strength = strength;
        }
    };
    /** Mirror entrenchment changes so the next supply tick does not overwrite freshly dug positions. */
    GameEngine.prototype.syncPlayerEntrench = function (unitHex, entrench, unitId) {
        var idx = this.findSupplyEntryIndex(this.playerSupply, unitHex, unitId);
        if (idx >= 0) {
            this.playerSupply[idx].entrench = entrench;
        }
    };
    GameEngine.prototype.syncBotEntrench = function (unitHex, entrench, unitId) {
        var idx = this.findSupplyEntryIndex(this.botSupply, unitHex, unitId);
        if (idx >= 0) {
            this.botSupply[idx].entrench = entrench;
        }
    };
    GameEngine.prototype.syncEntrenchForFaction = function (faction, hex, entrench, unitId) {
        if (faction === "Player") {
            this.syncPlayerEntrench(hex, entrench, unitId);
            return;
        }
        if (faction === "Bot") {
            this.syncBotEntrench(hex, entrench, unitId);
            return;
        }
        var idx = this.findSupplyEntryIndex(this.allySupply, hex, unitId);
        if (idx >= 0) {
            this.allySupply[idx].entrench = entrench;
        }
    };
    /** Sync bot ammo usage back into the supply mirror. */
    GameEngine.prototype.syncBotAmmo = function (attackerHex, ammo, unitId) {
        var idx = this.findSupplyEntryIndex(this.botSupply, attackerHex, unitId);
        if (idx >= 0) {
            this.botSupply[idx].ammo = ammo;
        }
    };
    /** Sync movement fuel to the bot-side supply mirror. */
    GameEngine.prototype.syncBotFuel = function (unitHex, fuel, unitId) {
        var idx = this.findSupplyEntryIndex(this.botSupply, unitHex, unitId);
        if (idx >= 0) {
            this.botSupply[idx].fuel = fuel;
        }
    };
    GameEngine.prototype.syncStrengthForFaction = function (faction, hex, strength, unitId) {
        if (faction === "Player") {
            this.syncPlayerStrength(hex, strength, unitId);
            return;
        }
        if (faction === "Bot") {
            this.syncBotStrength(hex, strength, unitId);
            return;
        }
        var idx = this.findSupplyEntryIndex(this.allySupply, hex, unitId);
        if (idx >= 0) {
            this.allySupply[idx].strength = strength;
        }
    };
    GameEngine.prototype.syncAmmoForFaction = function (faction, hex, ammo, unitId) {
        if (faction === "Player") {
            this.syncPlayerAmmo(hex, ammo, unitId);
            return;
        }
        if (faction === "Bot") {
            this.syncBotAmmo(hex, ammo, unitId);
            return;
        }
        var idx = this.findSupplyEntryIndex(this.allySupply, hex, unitId);
        if (idx >= 0) {
            this.allySupply[idx].ammo = ammo;
        }
    };
    GameEngine.prototype.updateSupplyPositionForFaction = function (faction, from, to, unitId) {
        if (faction === "Player") {
            this.updatePlayerSupplyPosition(from, to, unitId);
            return;
        }
        if (faction === "Bot") {
            this.updateBotSupplyPosition(from, to, unitId);
            return;
        }
        var idx = this.findSupplyEntryIndex(this.allySupply, from, unitId);
        if (idx >= 0) {
            this.allySupply[idx].hex = structuredClone(to);
        }
    };
    GameEngine.prototype.syncFuelForFaction = function (faction, hex, fuel, unitId) {
        if (faction === "Player") {
            this.syncPlayerFuel(hex, fuel, unitId);
            return;
        }
        if (faction === "Bot") {
            this.syncBotFuel(hex, fuel, unitId);
            return;
        }
        var idx = this.findSupplyEntryIndex(this.allySupply, hex, unitId);
        if (idx >= 0) {
            this.allySupply[idx].fuel = fuel;
        }
    };
    GameEngine.prototype.removeSupplyEntryForFaction = function (faction, hex, unitId) {
        if (faction === "Player") {
            this.removeSupplyEntryFor(hex, unitId);
            return;
        }
        if (faction === "Bot") {
            this.removeBotSupplyEntryFor(hex, unitId);
            return;
        }
        var index = this.findSupplyEntryIndex(this.allySupply, hex, unitId);
        if (index >= 0) {
            this.allySupply.splice(index, 1);
        }
    };
    /** Build occupancy map for planner: key -> owner */
    GameEngine.prototype.buildOccupancyMap = function () {
        var map = new Map();
        this.playerPlacements.forEach(function (_u, key) { return map.set(key, "player"); });
        this.botPlacements.forEach(function (_u, key) { return map.set(key, "bot"); });
        // Treat ally units as friendly to player for movement blocking purposes.
        this.allyPlacements.forEach(function (_u, key) { return map.set(key, "player"); });
        return map;
    };
    /** Build a unified occupancy set covering all factions for plan application. */
    GameEngine.prototype.buildUnifiedOccupancySet = function () {
        var keys = new Set();
        this.forEachOccupiedHexKeyForFaction("Player", function (key) { return keys.add(key); });
        this.forEachOccupiedHexKeyForFaction("Bot", function (key) { return keys.add(key); });
        this.forEachOccupiedHexKeyForFaction("Ally", function (key) { return keys.add(key); });
        return keys;
    };
    GameEngine.prototype.plannerMovementAllowance = function (snapshot) {
        var _a;
        var def = snapshot.definition;
        var baseMovement = (_a = def.movement) !== null && _a !== void 0 ? _a : 1;
        // Give bots sufficient movement allowance for multi-hex planning
        // This allows pathfinding to explore far enough to find river crossings and strategic positions
        // Infantry (movement=1) get 5 hexes, faster units get proportionally more
        return Math.max(5, baseMovement * 5);
    };
    GameEngine.prototype.plannerLOSAllows = function (attackerHex, targetHex, isAir) {
        return (0, LOS_1.losClear)(attackerHex, targetHex, isAir, this.createLosLister());
    };
    GameEngine.prototype.plannerAttackEstimate = function (attacker, attackerHex, defender, defenderHex) {
        var _a, _b;
        var atkUnit = structuredClone(attacker.unit);
        atkUnit.hex = structuredClone(attackerHex);
        var defUnit = structuredClone(defender.unit);
        defUnit.hex = structuredClone(defenderHex);
        var attackDistance = (0, Hex_1.hexDistance)(attackerHex, defenderHex);
        var preferredStance = attackDistance <= 1
            && this.resolveCombatStanceForAttacker(atkUnit, attacker.definition, "assault") === "assault"
            ? "assault"
            : undefined;
        var req = this.buildAttackRequest(atkUnit, defUnit, "Bot", "Player", preferredStance ? { stance: preferredStance } : undefined);
        if (!req) {
            return null;
        }
        var result = (0, Combat_1.resolveAttack)(req);
        var atkDef = attacker.definition;
        var defDef = defender.definition;
        var atkIsBomber = this.isBomber(atkDef);
        var atkIsAir = atkDef.moveType === "air";
        var defIsAir = defDef.moveType === "air";
        if (atkIsBomber && !defIsAir) {
            result = __assign(__assign({}, result), { damagePerHit: result.damagePerHit * 10, expectedDamage: result.expectedDamage * 10, expectedSuppression: result.expectedSuppression * 10 });
        }
        else if (atkIsAir && !atkIsBomber && defIsAir) {
            result = __assign(__assign({}, result), { damagePerHit: result.damagePerHit * 4, expectedDamage: result.expectedDamage * 4, expectedSuppression: result.expectedSuppression * 4 });
        }
        var expectedDamage = Math.max(0, Math.round(result.expectedDamage));
        var expectedRetaliation = 0;
        if (!(atkIsAir && !defIsAir)) {
            var distance = (0, Hex_1.hexDistance)(defenderHex, attackerHex);
            var rMin = (_a = defDef.rangeMin) !== null && _a !== void 0 ? _a : 1;
            var rMax = (_b = defDef.rangeMax) !== null && _b !== void 0 ? _b : 1;
            if (distance >= rMin && distance <= rMax) {
                var revReq = this.buildAttackRequest(defUnit, atkUnit, "Player", "Bot", {
                    allowBomberAirAttack: true,
                    stance: preferredStance === "assault" ? "assault" : undefined
                });
                if (revReq) {
                    var rev = (0, Combat_1.resolveAttack)(revReq);
                    var defIsBomber = this.isBomber(defDef);
                    var defIsAirUnit = defDef.moveType === "air";
                    var atkIsAirUnit = atkDef.moveType === "air";
                    if (defIsBomber && atkIsAirUnit) {
                        rev = __assign(__assign({}, rev), { damagePerHit: rev.damagePerHit * 2, expectedDamage: rev.expectedDamage * 2, expectedSuppression: rev.expectedSuppression * 2 });
                    }
                    else if (defIsAirUnit && !defIsBomber && atkIsAirUnit) {
                        rev = __assign(__assign({}, rev), { damagePerHit: rev.damagePerHit * 4, expectedDamage: rev.expectedDamage * 4, expectedSuppression: rev.expectedSuppression * 4 });
                    }
                    expectedRetaliation = Math.max(0, Math.round(rev.expectedDamage));
                }
            }
        }
        return { expectedDamage: expectedDamage, expectedRetaliation: expectedRetaliation };
    };
    GameEngine.prototype.buildPlannerCounterIntelDecoys = function (faction) {
        var _this = this;
        var operations = this.getActiveCounterIntelOperations(faction);
        if (operations.length === 0) {
            return [];
        }
        var sourcePlacements = faction === "Player"
            ? Array.from(this.playerPlacements.values())
            : Array.from(this.botPlacements.values());
        var decoyTemplates = sourcePlacements.filter(function (unit) {
            var definition = _this.getUnitDefinition(unit.type);
            return definition.moveType !== "air" && !_this.isSupplyTruckType(unit.type);
        });
        if (decoyTemplates.length === 0) {
            return [];
        }
        return operations.map(function (operation, index) {
            var template = structuredClone(decoyTemplates[index % decoyTemplates.length]);
            var definition = _this.getUnitDefinition(template.type);
            template.hex = structuredClone(operation.targetHex);
            template.strength = Math.max(4, Math.min(template.strength, 6 + operation.strength));
            template.entrench = 0;
            return { unit: template, definition: definition };
        });
    };
    GameEngine.prototype.buildBotPerceivedTargets = function () {
        var targets = Array.from(this.playerPlacements.values()).map(function (unit) {
            var _a;
            return ({
                hex: structuredClone(unit.hex),
                bias: 0,
                isDeception: false,
                id: (_a = unit.unitId) !== null && _a !== void 0 ? _a : (0, Hex_1.axialKey)(unit.hex)
            });
        });
        this.getActiveCounterIntelOperations("Player").forEach(function (operation) {
            targets.push({
                hex: structuredClone(operation.targetHex),
                bias: operation.strength,
                isDeception: true,
                id: operation.id
            });
        });
        return targets;
    };
    GameEngine.prototype.selectBotPerceivedTarget = function (origin, targets) {
        var best = null;
        var bestAdjustedDistance = Number.POSITIVE_INFINITY;
        var bestRawDistance = Number.POSITIVE_INFINITY;
        targets.forEach(function (candidate) {
            var rawDistance = (0, Hex_1.hexDistance)(origin, candidate.hex);
            var adjustedDistance = Math.max(0, rawDistance - candidate.bias);
            if (adjustedDistance < bestAdjustedDistance ||
                (adjustedDistance === bestAdjustedDistance && rawDistance < bestRawDistance)) {
                bestAdjustedDistance = adjustedDistance;
                bestRawDistance = rawDistance;
                best = __assign(__assign({}, candidate), { hex: structuredClone(candidate.hex) });
            }
        });
        return best;
    };
    GameEngine.prototype.buildPlannerInputFor = function (acting, opposing, difficulty, opposingExtras, syntheticOpposingUnits) {
        var _this = this;
        var _a;
        if (opposingExtras === void 0) { opposingExtras = []; }
        if (syntheticOpposingUnits === void 0) { syntheticOpposingUnits = []; }
        var actingUnits = [];
        var opposingUnits = [];
        acting.forEach(function (unit) {
            var def = _this.getUnitDefinition(unit.type);
            if (def.moveType === "air" || _this.isSupplyTruckType(unit.type)) {
                return;
            }
            actingUnits.push({ unit: structuredClone(unit), definition: def });
        });
        var opposingMaps = __spreadArray([opposing], opposingExtras, true);
        opposingMaps.forEach(function (map) {
            map.forEach(function (unit) {
                var def = _this.getUnitDefinition(unit.type);
                opposingUnits.push({ unit: structuredClone(unit), definition: def });
            });
        });
        syntheticOpposingUnits.forEach(function (entry) {
            opposingUnits.push({
                unit: structuredClone(entry.unit),
                definition: entry.definition
            });
        });
        var occupancy = this.buildOccupancyMap();
        return {
            botUnits: actingUnits,
            playerUnits: opposingUnits,
            objectives: (_a = this.scenario.objectives) !== null && _a !== void 0 ? _a : [],
            occupancy: occupancy,
            map: {
                inBounds: function (hex) { return _this.inBounds(hex); },
                terrainAt: function (hex) { return _this.terrainAt(hex); },
                movementCost: function (hex, moveType) { return _this.resolveMoveCost(moveType, _this.terrainAt(hex), hex); }
            },
            losAllows: function (a, b, isAir) { return _this.plannerLOSAllows(a, b, isAir); },
            movementAllowance: function (snap) { return _this.plannerMovementAllowance(snap); },
            attackEstimator: function (a, ah, d, dh) { return _this.plannerAttackEstimate(a, ah, d, dh); },
            difficulty: difficulty
        };
    };
    GameEngine.prototype.executeHeuristicBotTurn = function () {
        var _a;
        // Expanded air heuristic: attempt escort pairing for queued strikes, then strategic CAP over high-value areas.
        this.maybeScheduleHeuristicAirOps();
        var moves = [];
        var attacks = [];
        console.log("[Bot AI] Heuristic bot turn starting. Bot units: ".concat(this.botPlacements.size, ", Player units: ").concat(this.playerPlacements.size));
        if (this.playerPlacements.size === 0) {
            var supplyReport_1 = this.applySupplyTickFor("Bot");
            return { moves: moves, attacks: attacks, supplyReport: supplyReport_1 };
        }
        var input = this.buildPlannerInputFor(this.botPlacements, this.playerPlacements, this.botDifficulty, this.allyPlacements.size > 0 ? [this.allyPlacements] : [], this.buildPlannerCounterIntelDecoys("Player"));
        var plans = (0, BotPlanner_1.planHeuristicBotTurn)(input);
        console.log("[Bot AI] Planner generated ".concat(plans.length, " plans"));
        var occupancy = this.buildUnifiedOccupancySet();
        for (var _i = 0, plans_1 = plans; _i < plans_1.length; _i++) {
            var plan = plans_1[_i];
            var fromKey = (0, Hex_1.axialKey)(plan.origin);
            var toKey = (0, Hex_1.axialKey)(plan.destination);
            console.log("[Bot AI] Plan for ".concat(plan.unit.unit.type, " at ").concat(fromKey, ": ").concat(plan.rationale, " (score: ").concat(plan.score.toFixed(1), ", destination: ").concat(toKey, ", path length: ").concat(plan.path.length, ")"));
            var unit = this.botPlacements.get(fromKey);
            if (!unit) {
                console.log("[Bot AI] Unit not found at ".concat(fromKey, ", skipping plan"));
                continue;
            }
            if (toKey !== fromKey && occupancy.has(toKey)) {
                console.log("[Bot AI] Destination ".concat(toKey, " is occupied, skipping plan"));
                continue;
            }
            var current = structuredClone(plan.origin);
            var visited = [structuredClone(plan.origin)];
            if (toKey !== fromKey) {
                console.log("[Bot AI] Executing move for ".concat(unit.type, " from ").concat(fromKey, " to ").concat(toKey));
                var moved = structuredClone(unit);
                // Get unit's actual movement points for this turn
                var unitDef = this.getUnitDefinition(unit.type);
                var maxMovement = (_a = unitDef.movement) !== null && _a !== void 0 ? _a : 1;
                var availableFuel = this.resolveFuelBudget(unit, unitDef);
                var movementSpent = 0;
                var fuelSpent = 0;
                var hexesMoved = 0;
                for (var i = 1; i < plan.path.length; i += 1) {
                    var step = plan.path[i];
                    var stepKey = (0, Hex_1.axialKey)(step);
                    if (occupancy.has(stepKey)) {
                        console.log("[Bot AI] Path blocked at ".concat(stepKey, ", stopping movement"));
                        break;
                    }
                    // Calculate movement cost for this step
                    var terrain = this.terrainAt(step);
                    var stepCost = this.resolveMoveCost(unitDef.moveType, terrain, step, current);
                    var stepFuel = this.resolveMovementFuelStep(unitDef.moveType, step);
                    // Units can always move at least 1 hex per turn, even through difficult terrain
                    // After the first hex, check if we have movement points remaining
                    if (hexesMoved > 0 && movementSpent + stepCost > maxMovement) {
                        console.log("[Bot AI] Movement exhausted after ".concat(hexesMoved, " hex(es): spent ").concat(movementSpent, ", next step cost ").concat(stepCost, ", max ").concat(maxMovement));
                        break;
                    }
                    if (Number.isFinite(availableFuel) && fuelSpent + stepFuel > availableFuel + 1e-6) {
                        console.log("[Bot AI] Fuel exhausted after ".concat(hexesMoved, " hex(es): spent ").concat(fuelSpent.toFixed(2), ", next step costs ").concat(stepFuel.toFixed(2), ", available ").concat(availableFuel.toFixed(2)));
                        break;
                    }
                    moved.facing = this.resolveFacingToward(current, step, moved.facing);
                    moved.hex = structuredClone(step);
                    current = structuredClone(step);
                    visited.push(structuredClone(step));
                    movementSpent += stepCost;
                    fuelSpent += stepFuel;
                    hexesMoved += 1;
                }
                if (hexesMoved > 0) {
                    if (Number.isFinite(availableFuel) && fuelSpent > 0) {
                        moved.fuel = Math.max(0, Number((moved.fuel - fuelSpent).toFixed(2)));
                    }
                    moved.entrench = 0;
                    var finalKey = (0, Hex_1.axialKey)(current);
                    console.log("[Bot AI] ".concat(unit.type, " moved from ").concat(fromKey, " to ").concat(finalKey, " (").concat(visited.length - 1, " steps)"));
                    this.botPlacements.delete(fromKey);
                    this.botPlacements.set(finalKey, moved);
                    this.syncBotFuel(current, moved.fuel);
                    this.syncBotEntrench(current, moved.entrench);
                    occupancy.delete(fromKey);
                    occupancy.add(finalKey);
                    moves.push({
                        unitType: moved.type,
                        from: structuredClone(unit.hex),
                        to: structuredClone(current),
                        path: visited,
                        distance: visited.length - 1,
                        duration: Math.max(visited.length - 1, 1)
                    });
                }
                else {
                    console.log("[Bot AI] ".concat(unit.type, " could not progress along planned path from ").concat(fromKey, "; holding position"));
                }
            }
            if (plan.attackTarget) {
                var botUnit = this.botPlacements.get((0, Hex_1.axialKey)(current));
                var stance = this.chooseBotStance(botUnit, plan.attackTarget);
                var attack = this.resolveBotAttack(botUnit, current, plan.attackTarget, stance);
                if (attack) {
                    attacks.push(attack);
                    if (attack.defenderDestroyed) {
                        var deadKey = (0, Hex_1.axialKey)(plan.attackTarget);
                        occupancy.delete(deadKey);
                    }
                }
            }
        }
        var supplyReport = this.applySupplyTickFor("Bot");
        console.log("[Bot AI] Heuristic bot turn complete. Moves: ".concat(moves.length, ", Attacks: ").concat(attacks.length));
        return { moves: moves, attacks: attacks, supplyReport: supplyReport };
    };
    GameEngine.prototype.executeHeuristicAllyTurn = function () {
        if (this.botPlacements.size === 0 || this.allyPlacements.size === 0) {
            return;
        }
        var input = this.buildPlannerInputFor(this.allyPlacements, this.botPlacements, this.botDifficulty);
        var plans = (0, BotPlanner_1.planHeuristicBotTurn)(input);
        var occupancy = this.buildUnifiedOccupancySet();
        for (var _i = 0, plans_2 = plans; _i < plans_2.length; _i++) {
            var plan = plans_2[_i];
            var fromKey = (0, Hex_1.axialKey)(plan.origin);
            var toKey = (0, Hex_1.axialKey)(plan.destination);
            var unit = this.allyPlacements.get(fromKey);
            if (!unit) {
                continue;
            }
            if (toKey !== fromKey && occupancy.has(toKey)) {
                continue;
            }
            var current = structuredClone(plan.origin);
            var visited = [structuredClone(plan.origin)];
            if (toKey !== fromKey) {
                this.allyPlacements.delete(fromKey);
                var moved = structuredClone(unit);
                for (var i = 1; i < plan.path.length; i += 1) {
                    var step = plan.path[i];
                    var stepKey = (0, Hex_1.axialKey)(step);
                    if (occupancy.has(stepKey)) {
                        break;
                    }
                    moved.facing = this.resolveFacingToward(current, step, moved.facing);
                    moved.hex = structuredClone(step);
                    current = structuredClone(step);
                    visited.push(structuredClone(step));
                }
                moved.entrench = 0;
                this.allyPlacements.set((0, Hex_1.axialKey)(current), moved);
                this.syncEntrenchForFaction("Ally", current, moved.entrench);
                occupancy.delete(fromKey);
                occupancy.add((0, Hex_1.axialKey)(current));
            }
            if (plan.attackTarget) {
                var attacker = this.allyPlacements.get((0, Hex_1.axialKey)(current));
                var defender = this.botPlacements.get((0, Hex_1.axialKey)(plan.attackTarget));
                if (attacker && defender) {
                    attacker.facing = this.resolveFacingToward(current, plan.attackTarget, attacker.facing);
                    var request = this.buildAttackRequest(attacker, defender, "Ally", "Bot");
                    if (request) {
                        var result = (0, Combat_1.resolveAttack)(request);
                        var updatedDefender = structuredClone(defender);
                        updatedDefender.facing = this.resolveFacingToward(plan.attackTarget, current, defender.facing);
                        updatedDefender.strength = Math.max(0, defender.strength - Math.round(result.expectedDamage));
                        this.allyPlacements.set((0, Hex_1.axialKey)(current), structuredClone(attacker));
                        if (updatedDefender.strength <= 0) {
                            this.botPlacements.delete((0, Hex_1.axialKey)(plan.attackTarget));
                            occupancy.delete((0, Hex_1.axialKey)(plan.attackTarget));
                        }
                        else {
                            this.botPlacements.set((0, Hex_1.axialKey)(plan.attackTarget), updatedDefender);
                        }
                    }
                }
            }
        }
    };
    /** Sync defender strength to bot supply mirror after combat. */
    /** Runs the bot's tactical loop once, returning a summary of actions taken. */
    GameEngine.prototype.executeBotTurn = function () {
        var _this = this;
        if (this.botStrategyMode === "Heuristic") {
            return this.executeHeuristicBotTurn();
        }
        // Fallback mode also attempts heuristic air ops (escort first, then CAP) if possible.
        this.maybeScheduleHeuristicAirOps();
        var moves = [];
        var attacks = [];
        var playerUnits = Array.from(this.playerPlacements.values());
        var perceivedTargets = this.buildBotPerceivedTargets();
        if (playerUnits.length === 0 || perceivedTargets.length === 0) {
            // With no player opposition the bot cannot act; still advance the supply tick.
            var supplyReport_2 = this.applySupplyTickFor("Bot");
            return { moves: moves, attacks: attacks, supplyReport: supplyReport_2 };
        }
        // Track live player targets so successive bots react to casualties and deception decay.
        var liveTargets = perceivedTargets.map(function (target) { return (__assign(__assign({}, target), { hex: structuredClone(target.hex) })); });
        var botUnits = Array.from(this.botPlacements.entries());
        botUnits.forEach(function (_a) {
            var _key = _a[0], unit = _a[1];
            var def = _this.getUnitDefinition(unit.type);
            // Skip aircraft in the generic ground bot loop; they are handled via air mission heuristics.
            if (def.moveType === "air" || _this.isSupplyTruckType(unit.type)) {
                return;
            }
            var origin = structuredClone(unit.hex);
            console.log("[Bot AI] ".concat(unit.type, " at (").concat(origin.q, ",").concat(origin.r, ") evaluating movement"));
            var nearestTarget = _this.selectBotPerceivedTarget(origin, liveTargets);
            if (!nearestTarget) {
                console.log("[Bot AI] ".concat(unit.type, ": No player targets found"));
                return;
            }
            var nearest = nearestTarget.hex;
            var distance = (0, Hex_1.hexDistance)(origin, nearest);
            console.log("[Bot AI] ".concat(unit.type, ": Nearest player at (").concat(nearest.q, ",").concat(nearest.r, "), distance: ").concat(distance));
            var attemptAttack = function (attackingUnit, attackerHex, targetHex) {
                var stance = _this.chooseBotStance(attackingUnit, targetHex);
                var attack = _this.resolveBotAttack(attackingUnit, attackerHex, targetHex, stance);
                if (!attack) {
                    return;
                }
                attacks.push(attack);
                if (attack.defenderDestroyed) {
                    var destroyedKey_1 = (0, Hex_1.axialKey)(targetHex);
                    var index = liveTargets.findIndex(function (target) { return !target.isDeception && (0, Hex_1.axialKey)(target.hex) === destroyedKey_1; });
                    if (index >= 0) {
                        liveTargets.splice(index, 1);
                    }
                }
            };
            var engagementDistance = nearestTarget.isDeception ? 0 : 1;
            // Real contacts can be attacked adjacent; deception screens instead pull the bot onto the false axis.
            if ((0, Hex_1.hexDistance)(origin, nearest) <= engagementDistance) {
                console.log("[Bot AI] ".concat(unit.type, ": ").concat(nearestTarget.isDeception ? "Reached deception focus" : "Already adjacent, attempting attack"));
                if (!nearestTarget.isDeception) {
                    attemptAttack(unit, origin, nearest);
                }
                return;
            }
            var movementAllowance = _this.calculateBotMovementAllowance(unit);
            console.log("[Bot AI] ".concat(unit.type, ": Movement allowance: ").concat(movementAllowance));
            var plannedPath = _this.planBotPath(unit.hex, nearest, movementAllowance);
            if (!plannedPath) {
                console.log("[Bot AI] ".concat(unit.type, ": No valid path found to target"));
                return;
            }
            console.log("[Bot AI] ".concat(unit.type, ": Planned path with ").concat(plannedPath.length - 1, " steps"));
            // Execute each step in the planned path, animating them sequentially.
            var current = structuredClone(origin);
            var visited = [structuredClone(origin)];
            var moveBudget = plannedPath.length - 1;
            var lastMovedUnit = null;
            var unitDefinition = _this.getUnitDefinition(unit.type);
            var availableFuel = _this.resolveFuelBudget(unit, unitDefinition);
            var fuelSpent = 0;
            for (var index = 1; index < plannedPath.length; index += 1) {
                var step = plannedPath[index];
                if (_this.isOccupied(step)) {
                    break;
                }
                var stepFuel = _this.resolveMovementFuelStep(unitDefinition.moveType, step);
                if (Number.isFinite(availableFuel) && fuelSpent + stepFuel > availableFuel + 1e-6) {
                    break;
                }
                _this.botPlacements.delete((0, Hex_1.axialKey)(current));
                var moved = structuredClone(unit);
                moved.facing = _this.resolveFacingToward(current, step, moved.facing);
                moved.hex = structuredClone(step);
                moved.entrench = 0;
                current = structuredClone(step);
                fuelSpent += stepFuel;
                _this.botPlacements.set((0, Hex_1.axialKey)(step), moved);
                _this.updateBotSupplyPosition(visited[visited.length - 1], step);
                _this.syncBotEntrench(step, moved.entrench);
                visited.push(structuredClone(step));
                lastMovedUnit = moved;
                // If the unit becomes adjacent to its target after this step, resolve the attack and stop moving.
                if ((0, Hex_1.hexDistance)(step, nearest) <= engagementDistance) {
                    if (!nearestTarget.isDeception) {
                        attemptAttack(moved, step, nearest);
                    }
                    break;
                }
                // Limit to one full path per unit per turn to avoid infinite loops in degenerate cases.
                if (index >= moveBudget) {
                    break;
                }
            }
            if (visited.length > 1 && lastMovedUnit) {
                if (Number.isFinite(availableFuel) && fuelSpent > 0) {
                    lastMovedUnit.fuel = Math.max(0, Number((lastMovedUnit.fuel - fuelSpent).toFixed(2)));
                    _this.botPlacements.set((0, Hex_1.axialKey)(lastMovedUnit.hex), structuredClone(lastMovedUnit));
                }
                _this.syncBotFuel(lastMovedUnit.hex, lastMovedUnit.fuel);
                var distance_1 = visited.length - 1;
                moves.push({
                    unitType: lastMovedUnit.type,
                    from: structuredClone(origin),
                    to: structuredClone(lastMovedUnit.hex),
                    path: visited,
                    distance: distance_1,
                    duration: Math.max(distance_1, 1)
                });
            }
        });
        var supplyReport = this.applySupplyTickFor("Bot");
        return { moves: moves, attacks: attacks, supplyReport: supplyReport };
    };
    /**
     * Determines how many tiles the bot unit may traverse this turn using the same movement allowances as player units.
     */
    GameEngine.prototype.calculateBotMovementAllowance = function (unit) {
        var _a;
        var definition = this.getUnitDefinition(unit.type);
        var movePoints = (_a = definition.movement) !== null && _a !== void 0 ? _a : 1;
        var availableFuel = this.resolveFuelBudget(unit, definition);
        if (Number.isFinite(availableFuel) && availableFuel <= 0) {
            return 0;
        }
        return Math.max(1, movePoints);
    };
    /**
     * Plans a simple straight-line path for bot movement toward the target using axial neighbors.
     * Stops when the movement allowance is exhausted or the path reaches the target.
     */
    GameEngine.prototype.planBotPath = function (origin, target, allowance) {
        if (allowance <= 0) {
            return null;
        }
        var path = [structuredClone(origin)];
        var current = structuredClone(origin);
        for (var stepCount = 0; stepCount < allowance; stepCount += 1) {
            if ((0, Hex_1.hexDistance)(current, target) <= 1) {
                break;
            }
            var next = this.selectBotStepToward(current, target);
            if (!next) {
                break;
            }
            path.push(structuredClone(next));
            current = next;
            if ((0, Hex_1.hexDistance)(current, target) <= 1) {
                break;
            }
        }
        if (path.length <= 1) {
            return null;
        }
        return path;
    };
    /** Locate the nearest player hex to the provided origin using axial distance. */
    GameEngine.prototype.findNearestPlayerHex = function (origin, targets) {
        var best = null;
        var bestDistance = Number.POSITIVE_INFINITY;
        targets.forEach(function (candidate) {
            var distance = (0, Hex_1.hexDistance)(origin, candidate);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = candidate;
            }
        });
        return best ? structuredClone(best) : null;
    };
    /** Choose the single-step axial move that most reduces distance to the target. */
    GameEngine.prototype.selectBotStepToward = function (origin, target) {
        var _this = this;
        var originUnit = this.lookupUnit(origin, "Bot");
        if (!originUnit) {
            return null;
        }
        var unitDef = this.getUnitDefinition(originUnit.type);
        var moveType = unitDef.moveType;
        var best = null;
        var bestDistance = Number.POSITIVE_INFINITY;
        var impassableCount = 0;
        (0, Hex_1.neighbors)(origin).forEach(function (candidate) {
            if (!_this.inBounds(candidate)) {
                return;
            }
            // Check if the hex is occupied
            if (_this.isOccupied(candidate)) {
                return;
            }
            // Check if the terrain is passable for this unit type
            var terrain = _this.terrainAt(candidate);
            var moveCost = _this.resolveMoveCost(moveType, terrain, candidate, origin);
            if (moveCost >= 999) {
                impassableCount++;
                return; // Impassable terrain
            }
            var distance = (0, Hex_1.hexDistance)(candidate, target);
            if (distance < bestDistance) {
                bestDistance = distance;
                best = structuredClone(candidate);
            }
        });
        if (impassableCount > 0) {
            console.log("[Bot AI] selectBotStepToward: Skipped ".concat(impassableCount, " impassable neighbors"));
        }
        return best;
    };
    /** Collects aircraft candidates for air-role checks, including player reserves when relevant. */
    GameEngine.prototype.collectAirRoleCandidateUnits = function (faction, includeReserves) {
        if (includeReserves === void 0) { includeReserves = faction === "Player"; }
        var units = Array.from(this.getPlacementMapForFaction(faction).values());
        if (includeReserves && faction === "Player") {
            this.reserves.forEach(function (entry) { return units.push(entry.unit); });
        }
        return units;
    };
    /** Reports whether a faction currently fields aircraft that can perform the requested role. */
    GameEngine.prototype.hasFactionAirRoleCapability = function (faction, role, options) {
        var _a, _b;
        if (options === void 0) { options = {}; }
        var _c = options.requireAvailable, requireAvailable = _c === void 0 ? false : _c, _d = options.includeAssigned, includeAssigned = _d === void 0 ? false : _d, _e = options.includeReserves, includeReserves = _e === void 0 ? faction === "Player" : _e;
        for (var _i = 0, _f = this.collectAirRoleCandidateUnits(faction, includeReserves); _i < _f.length; _i++) {
            var unit = _f[_i];
            var definition = this.getUnitDefinition(unit.type);
            var roles = (_b = (_a = definition.airSupport) === null || _a === void 0 ? void 0 : _a.roles) !== null && _b !== void 0 ? _b : [];
            if (!this.isAircraft(definition) || !roles.includes(role)) {
                continue;
            }
            if (!requireAvailable) {
                return true;
            }
            var squadronId = this.getSquadronId(unit);
            if (!includeAssigned && this.airMissionAssignmentsByUnit.has(squadronId)) {
                continue;
            }
            if (this.aircraftNeedsRearm(faction, squadronId)) {
                continue;
            }
            return true;
        }
        return false;
    };
    /** CAP is only worthwhile if the player still has available strike aircraft to threaten bot positions. */
    GameEngine.prototype.playerHasAvailableStrikeAircraft = function () {
        return this.hasFactionAirRoleCapability("Player", "strike", {
            requireAvailable: true,
            includeAssigned: false,
            includeReserves: true
        });
    };
    /** Escorts matter whenever the player has active or available interception-capable fighters. */
    GameEngine.prototype.playerHasInterceptorPresence = function () {
        if (Array.from(this.scheduledAirMissions.values()).some(function (mission) {
            return mission.faction === "Player"
                && mission.template.kind === "airCover"
                && (mission.status === "queued" || mission.status === "inFlight" || mission.status === "resolving");
        })) {
            return true;
        }
        return this.hasFactionAirRoleCapability("Player", "cap", {
            requireAvailable: true,
            includeAssigned: false,
            includeReserves: true
        });
    };
    /**
     * Minimal bot air scheduling heuristic: launch a single CAP mission only when the player still has
     * available strike aircraft that could threaten bot positions next turn.
     */
    GameEngine.prototype.maybeScheduleBasicBotAirCover = function () {
        var _a;
        if (this._phase !== "botTurn") {
            return;
        }
        if (!this.playerHasAvailableStrikeAircraft()) {
            return;
        }
        for (var _i = 0, _b = this.botPlacements.entries(); _i < _b.length; _i++) {
            var _c = _b[_i], unitKey = _c[0], unit = _c[1];
            var def = this.getUnitDefinition(unit.type);
            if (!this.isAircraft(def))
                continue;
            var profile = def.airSupport;
            if (!profile || !((_a = profile.roles) === null || _a === void 0 ? void 0 : _a.includes("cap")))
                continue;
            var squadronId = this.getSquadronId(unit);
            if (this.airMissionAssignmentsByUnit.has(squadronId))
                continue;
            if (this.aircraftNeedsRearm("Bot", squadronId))
                continue;
            var origin_2 = this.parseAxialKey(unitKey);
            if (!origin_2)
                continue;
            void this.tryScheduleAirMission({ kind: "airCover", faction: "Bot", unitHex: origin_2, targetHex: origin_2 });
            return;
        }
    };
    /**
     * Heuristic air operations: queue every available strike package, pair escorts with queued strikes when
     * the player can intercept them, then attempt a CAP over a strategically valuable area only if the
     * player still fields available strike aircraft. Falls back to a local CAP if no better patrol zone is found.
     */
    GameEngine.prototype.maybeScheduleHeuristicAirOps = function () {
        if (this._phase !== "botTurn") {
            return;
        }
        // 1) Queue every available strike package against the best reachable player assets.
        this.maybeScheduleBotStrikesAgainstPlayer();
        // 2) Pair any free escorts with queued strike packages.
        this.maybeScheduleBotEscortsForQueuedStrikes();
        // 3) Seed a CAP over a high-value zone if a fighter is still free.
        if (!this.maybeScheduleStrategicBotAirCover()) {
            // 4) Fallback to local CAP heuristic.
            this.maybeScheduleBasicBotAirCover();
        }
    };
    /**
     * Strike aircraft should hunt battlefield assets that matter most: armored formations and artillery first,
     * then fall back to softer ground targets if nothing better is available.
     */
    GameEngine.prototype.isPriorityBotStrikeTarget = function (definition) {
        if (definition.moveType === "air") {
            return false;
        }
        if (definition.class === "artillery") {
            return true;
        }
        if (definition.class === "tank" || definition.class === "vehicle") {
            return true;
        }
        var heaviestArmor = Math.max(definition.armor.front, definition.armor.side, definition.armor.top);
        return heaviestArmor >= 6 && definition.combat.weight !== "light";
    };
    /**
     * Rates bot strike targets so both bomber classes prefer armor and artillery over convenience shots.
     */
    GameEngine.prototype.scoreBotStrikeTarget = function (attackerDef, origin, target) {
        var _a;
        var targetDef = this.getUnitDefinition(target.type);
        if (targetDef.moveType === "air") {
            return Number.NEGATIVE_INFINITY;
        }
        var distance = (0, Hex_1.hexDistance)(origin, target.hex);
        var score = Math.max(0, 18 - distance * 2);
        if (this.isPriorityBotStrikeTarget(targetDef)) {
            score += 34;
            if (targetDef.class === "artillery") {
                score += attackerDef.combat.role === "antiInfantry" ? 4 : 0;
            }
            else if (attackerDef.combat.role === "antiVehicle") {
                score += 4;
            }
        }
        else {
            score -= 10;
        }
        if (targetDef.combat.role === "antiTank") {
            score += 4;
        }
        score += Math.max(0, ((_a = target.strength) !== null && _a !== void 0 ? _a : 100) * 0.05);
        return score;
    };
    /** Collects unassigned, mission-ready bot aircraft for a specific sortie role. */
    GameEngine.prototype.collectAvailableBotAircraftForRole = function (role) {
        var _this = this;
        return Array.from(this.botPlacements.values()).filter(function (unit) {
            var _a;
            var def = _this.getUnitDefinition(unit.type);
            var profile = def.airSupport;
            if (!_this.isAircraft(def) || !profile || !((_a = profile.roles) === null || _a === void 0 ? void 0 : _a.includes(role))) {
                return false;
            }
            var squadronId = _this.getSquadronId(unit);
            if (_this.airMissionAssignmentsByUnit.has(squadronId)) {
                return false;
            }
            if (_this.aircraftNeedsRearm("Bot", squadronId)) {
                return false;
            }
            return true;
        });
    };
    /** Mirrors the strike-resolution damage scaling so scheduling decisions reflect the real attack profile. */
    GameEngine.prototype.scaleAirMissionAttackResult = function (result, attackingDefinition, defendingDefinition) {
        if (this.isBomber(attackingDefinition) && !this.isAircraft(defendingDefinition)) {
            return __assign(__assign({}, result), { damagePerHit: result.damagePerHit * 10, expectedDamage: result.expectedDamage * 10, expectedSuppression: result.expectedSuppression * 10 });
        }
        if (this.isAircraft(attackingDefinition) && !this.isBomber(attackingDefinition) && this.isAircraft(defendingDefinition)) {
            return __assign(__assign({}, result), { damagePerHit: result.damagePerHit * 4, expectedDamage: result.expectedDamage * 4, expectedSuppression: result.expectedSuppression * 4 });
        }
        return result;
    };
    /** Estimates how much damage a strike aircraft should inflict if it reaches the target. */
    GameEngine.prototype.estimateBotStrikeDamageAgainstTarget = function (attacker, target) {
        var req = this.buildMissionAttackRequest("Bot", attacker, target);
        if (!req) {
            return 0;
        }
        var attackerDef = this.getUnitDefinition(attacker.type);
        var targetDef = this.getUnitDefinition(target.type);
        var scaled = this.scaleAirMissionAttackResult((0, Combat_1.resolveAttack)(req), attackerDef, targetDef);
        return Math.max(0, Math.round(scaled.expectedDamage));
    };
    /**
     * Estimates expected bomber attrition from player flak/CAP for a prospective strike, while respecting any
     * defensive shots already likely to be consumed by earlier queued raids in the same turn.
     */
    GameEngine.prototype.estimateBotStrikeAttrition = function (attacker, targetHex, escort, reservedFlakIds, reservedCapMissionIds) {
        var _this = this;
        var _a;
        var attackerDef = this.getUnitDefinition(attacker.type);
        var currentBomber = structuredClone(attacker);
        var expectedAttrition = 0;
        var engagedFlakIds = [];
        var engagedCapMissionIds = [];
        var flakUnits = this.findAllActiveFlakUnitsForHex("Player", targetHex).filter(function (entry) {
            var flakId = _this.getSquadronId(entry.unit);
            return !reservedFlakIds.has(flakId);
        });
        for (var _i = 0, flakUnits_5 = flakUnits; _i < flakUnits_5.length; _i++) {
            var flakEntry = flakUnits_5[_i];
            if (currentBomber.strength <= 0) {
                break;
            }
            var flakReq = this.buildMissionAttackRequest("Player", flakEntry.unit, currentBomber);
            if (!flakReq) {
                continue;
            }
            var flakResult = (0, Combat_1.resolveAttack)(flakReq);
            var flakDef = this.getUnitDefinition(flakEntry.unit.type);
            if (this.hasAntiAirCapability(flakDef) && this.isAircraft(attackerDef)) {
                flakResult = __assign(__assign({}, flakResult), { accuracy: flakResult.accuracy * 0.25, expectedHits: flakResult.expectedHits * 0.25, expectedDamage: flakResult.expectedDamage * 0.25, expectedSuppression: flakResult.expectedSuppression * 0.25 });
            }
            var suffered = Math.max(0, Math.round(flakResult.expectedDamage));
            engagedFlakIds.push(this.getSquadronId(flakEntry.unit));
            expectedAttrition += suffered;
            currentBomber = __assign(__assign({}, currentBomber), { strength: Math.max(0, currentBomber.strength - suffered) });
        }
        if (currentBomber.strength <= 0) {
            return {
                expectedAttrition: expectedAttrition,
                bomberStrengthAfter: 0,
                bomberDestroyed: true,
                engagedFlakIds: engagedFlakIds,
                engagedCapMissionIds: engagedCapMissionIds
            };
        }
        var capOverrides = new Map();
        var availableCapMissions = this.findAllActiveAirCoverForHex("Player", (0, Hex_1.axialKey)(targetHex)).filter(function (mission) { return mission.interceptions < 1 && !reservedCapMissionIds.has(mission.id); });
        if (escort && availableCapMissions.length > 0) {
            var escortedCap = availableCapMissions[0];
            var capLookup = this.lookupUnitBySquadronId(escortedCap.unitKey, "Player");
            if (capLookup) {
                var capUnit = structuredClone(capLookup.unit);
                var escortReq = this.buildMissionAttackRequest("Bot", escort, capUnit);
                if (escortReq) {
                    var escortDef = this.getUnitDefinition(escort.type);
                    var capDef = this.getUnitDefinition(capUnit.type);
                    var escortResult = this.scaleAirMissionAttackResult((0, Combat_1.resolveAttack)(escortReq), escortDef, capDef);
                    var inflicted = Math.max(0, Math.round(escortResult.expectedDamage));
                    capUnit.strength = Math.max(0, capUnit.strength - inflicted);
                    if (capUnit.strength <= 0) {
                        engagedCapMissionIds.push(escortedCap.id);
                    }
                    else {
                        capOverrides.set(escortedCap.id, capUnit);
                    }
                }
            }
        }
        for (var _b = 0, availableCapMissions_1 = availableCapMissions; _b < availableCapMissions_1.length; _b++) {
            var capMission = availableCapMissions_1[_b];
            if (currentBomber.strength <= 0 || engagedCapMissionIds.includes(capMission.id)) {
                continue;
            }
            var capLookup = this.lookupUnitBySquadronId(capMission.unitKey, "Player");
            var capUnit = (_a = capOverrides.get(capMission.id)) !== null && _a !== void 0 ? _a : capLookup === null || capLookup === void 0 ? void 0 : capLookup.unit;
            if (!capUnit) {
                continue;
            }
            var capReq = this.buildMissionAttackRequest("Player", capUnit, currentBomber);
            if (!capReq) {
                continue;
            }
            var capDef = this.getUnitDefinition(capUnit.type);
            var capResult = this.scaleAirMissionAttackResult((0, Combat_1.resolveAttack)(capReq), capDef, attackerDef);
            var suffered = Math.max(0, Math.round(capResult.expectedDamage));
            engagedCapMissionIds.push(capMission.id);
            expectedAttrition += suffered;
            currentBomber = __assign(__assign({}, currentBomber), { strength: Math.max(0, currentBomber.strength - suffered) });
        }
        return {
            expectedAttrition: expectedAttrition,
            bomberStrengthAfter: currentBomber.strength,
            bomberDestroyed: currentBomber.strength <= 0,
            engagedFlakIds: engagedFlakIds,
            engagedCapMissionIds: engagedCapMissionIds
        };
    };
    /** Tracks strike saturation so multiple bombers spread across valuable targets before doubling up. */
    GameEngine.prototype.getBotStrikeTargetAssignmentKey = function (target) {
        var _a;
        this.ensureUnitId(target);
        return (_a = target.unitId) !== null && _a !== void 0 ? _a : (0, Hex_1.axialKey)(target.hex);
    };
    /** Attempts to schedule every available bot strike mission against high-value player ground units in range. */
    GameEngine.prototype.maybeScheduleBotStrikesAgainstPlayer = function () {
        var _this = this;
        var _a, _b, _c;
        if (this._phase !== "botTurn") {
            return 0;
        }
        var playerUnits = Array.from(this.playerPlacements.values()).filter(function (candidate) { return _this.getUnitDefinition(candidate.type).moveType !== "air"; });
        if (playerUnits.length === 0) {
            return 0;
        }
        var strikeAircraft = this.collectAvailableBotAircraftForRole("strike").sort(function (left, right) { var _a, _b; return ((_a = right.strength) !== null && _a !== void 0 ? _a : 100) - ((_b = left.strength) !== null && _b !== void 0 ? _b : 100); });
        if (strikeAircraft.length === 0) {
            return 0;
        }
        var escortPool = this.playerHasInterceptorPresence()
            ? this.collectAvailableBotAircraftForRole("escort").sort(function (left, right) { var _a, _b; return ((_a = right.strength) !== null && _a !== void 0 ? _a : 100) - ((_b = left.strength) !== null && _b !== void 0 ? _b : 100); })
            : [];
        var queuedStrikeLoadByTarget = new Map();
        for (var _i = 0, _d = this.scheduledAirMissions.values(); _i < _d.length; _i++) {
            var mission = _d[_i];
            if (mission.faction !== "Bot" || mission.template.kind !== "strike" || mission.status !== "queued") {
                continue;
            }
            var targetKey = (_a = mission.targetUnitKey) !== null && _a !== void 0 ? _a : (mission.targetHex ? (0, Hex_1.axialKey)(mission.targetHex) : null);
            if (!targetKey) {
                continue;
            }
            queuedStrikeLoadByTarget.set(targetKey, ((_b = queuedStrikeLoadByTarget.get(targetKey)) !== null && _b !== void 0 ? _b : 0) + 1);
        }
        var reservedFlakIds = new Set();
        var reservedCapMissionIds = new Set();
        var scheduled = 0;
        var reservedEscortCount = 0;
        var _loop_4 = function (unit) {
            var def = this_4.getUnitDefinition(unit.type);
            var escortCandidate = reservedEscortCount < escortPool.length ? escortPool[reservedEscortCount] : null;
            var remainingRaidMass = Math.max(1, strikeAircraft.length - scheduled);
            var waveSupportFactor = 1 + Math.max(0, remainingRaidMass - 1) * 0.35;
            var rankedTargets = playerUnits
                .map(function (candidate) {
                var _a;
                var strikeDamage = _this.estimateBotStrikeDamageAgainstTarget(unit, candidate);
                var attrition = _this.estimateBotStrikeAttrition(unit, candidate.hex, escortCandidate, reservedFlakIds, reservedCapMissionIds);
                var targetLoadPenalty = ((_a = queuedStrikeLoadByTarget.get(_this.getBotStrikeTargetAssignmentKey(candidate))) !== null && _a !== void 0 ? _a : 0) * 18;
                var destructionPenalty = attrition.bomberDestroyed ? 48 : 0;
                var riskPenalty = (attrition.expectedAttrition * 1.25 + destructionPenalty) / waveSupportFactor;
                var score = _this.scoreBotStrikeTarget(def, unit.hex, candidate)
                    + strikeDamage * 0.9
                    - riskPenalty
                    - targetLoadPenalty;
                if (escortCandidate) {
                    score += 8;
                }
                if (attrition.bomberDestroyed && !escortCandidate && remainingRaidMass <= 1) {
                    score -= 36;
                }
                if (attrition.expectedAttrition >= Math.max(18, strikeDamage * 0.9) && !_this.isPriorityBotStrikeTarget(_this.getUnitDefinition(candidate.type))) {
                    score -= 18;
                }
                return {
                    target: candidate,
                    score: score,
                    attrition: attrition,
                    shouldReserveEscort: escortCandidate !== null
                };
            })
                .sort(function (a, b) { return b.score - a.score; });
            if (rankedTargets.length === 0) {
                return "continue";
            }
            var origin_3 = structuredClone(unit.hex);
            for (var _f = 0, rankedTargets_1 = rankedTargets; _f < rankedTargets_1.length; _f++) {
                var rankedTarget = rankedTargets_1[_f];
                var target = rankedTarget.target, score = rankedTarget.score, attrition = rankedTarget.attrition, shouldReserveEscort = rankedTarget.shouldReserveEscort;
                if (score < 24) {
                    continue;
                }
                var targetHex = structuredClone(target.hex);
                var result = this_4.tryScheduleAirMission({ kind: "strike", faction: "Bot", unitHex: origin_3, targetHex: targetHex });
                if (result.ok) {
                    var targetKey = this_4.getBotStrikeTargetAssignmentKey(target);
                    queuedStrikeLoadByTarget.set(targetKey, ((_c = queuedStrikeLoadByTarget.get(targetKey)) !== null && _c !== void 0 ? _c : 0) + 1);
                    attrition.engagedFlakIds.forEach(function (flakId) { return reservedFlakIds.add(flakId); });
                    attrition.engagedCapMissionIds.forEach(function (missionId) { return reservedCapMissionIds.add(missionId); });
                    if (shouldReserveEscort) {
                        reservedEscortCount += 1;
                    }
                    scheduled += 1;
                    break;
                }
            }
        };
        var this_4 = this;
        for (var _e = 0, strikeAircraft_1 = strikeAircraft; _e < strikeAircraft_1.length; _e++) {
            var unit = strikeAircraft_1[_e];
            _loop_4(unit);
        }
        return scheduled;
    };
    /** Attempts to schedule escorts for queued bot strike packages while fighters remain available. */
    GameEngine.prototype.maybeScheduleBotEscortsForQueuedStrikes = function () {
        var _a, _b;
        if (!this.playerHasInterceptorPresence()) {
            return 0;
        }
        var queuedBotStrikes = Array.from(this.scheduledAirMissions.values()).filter(function (m) { return m.faction === "Bot" && m.template.kind === "strike" && m.status === "queued"; });
        if (queuedBotStrikes.length === 0) {
            return 0;
        }
        var scheduled = 0;
        var _loop_5 = function (queuedBotStrike) {
            var alreadyEscorted = Array.from(this_5.scheduledAirMissions.values()).some(function (mission) {
                return mission.faction === "Bot"
                    && mission.template.kind === "escort"
                    && mission.status === "queued"
                    && mission.escortTargetUnitKey === queuedBotStrike.unitKey;
            });
            if (alreadyEscorted) {
                return "continue";
            }
            var protectedLookup = this_5.lookupUnitBySquadronId(queuedBotStrike.unitKey, "Bot");
            var bomberHex = (_a = protectedLookup === null || protectedLookup === void 0 ? void 0 : protectedLookup.unit.hex) !== null && _a !== void 0 ? _a : (queuedBotStrike.originHexKey ? GameEngine.parseAxialKey(queuedBotStrike.originHexKey) : null);
            if (!bomberHex) {
                return "continue";
            }
            for (var _c = 0, _d = this_5.botPlacements.entries(); _c < _d.length; _c++) {
                var _e = _d[_c], unitKey = _e[0], unit = _e[1];
                var def = this_5.getUnitDefinition(unit.type);
                var profile = def.airSupport;
                if (!this_5.isAircraft(def) || !profile || !((_b = profile.roles) === null || _b === void 0 ? void 0 : _b.includes("escort")))
                    continue;
                var squadronId = this_5.getSquadronId(unit);
                if (this_5.airMissionAssignmentsByUnit.has(squadronId))
                    continue;
                if (this_5.aircraftNeedsRearm("Bot", squadronId))
                    continue;
                var origin_4 = this_5.parseAxialKey(unitKey);
                if (!origin_4)
                    continue;
                var result = this_5.tryScheduleAirMission({ kind: "escort", faction: "Bot", unitHex: origin_4, escortTargetHex: bomberHex });
                if (result.ok) {
                    scheduled += 1;
                    break;
                }
            }
        };
        var this_5 = this;
        for (var _i = 0, queuedBotStrikes_1 = queuedBotStrikes; _i < queuedBotStrikes_1.length; _i++) {
            var queuedBotStrike = queuedBotStrikes_1[_i];
            _loop_5(queuedBotStrike);
        }
        return scheduled;
    };
    /** Attempts to schedule CAP near the most relevant player-held objective by covering the nearest friendly unit. */
    GameEngine.prototype.maybeScheduleStrategicBotAirCover = function () {
        var _a, _b;
        if (!this.playerHasAvailableStrikeAircraft()) {
            return false;
        }
        // Identify a player-held objective; pick the one nearest to any bot unit.
        var objectives = ((_a = this.scenario.objectives) !== null && _a !== void 0 ? _a : []).filter(function (o) { return o.owner === "Player"; });
        if (objectives.length === 0) {
            return false;
        }
        var bestObjective = null;
        var bestDistance = Number.POSITIVE_INFINITY;
        for (var _i = 0, objectives_1 = objectives; _i < objectives_1.length; _i++) {
            var obj = objectives_1[_i];
            for (var _c = 0, _d = this.botPlacements.values(); _c < _d.length; _c++) {
                var unit = _d[_c];
                var d = (0, Hex_1.hexDistance)(unit.hex, obj.hex);
                if (d < bestDistance) {
                    bestDistance = d;
                    bestObjective = obj.hex;
                }
            }
        }
        if (!bestObjective) {
            return false;
        }
        // Choose a friendly unit nearest to that objective as the CAP center.
        var capCenter = null;
        var capCenterDistance = Number.POSITIVE_INFINITY;
        for (var _e = 0, _f = this.botPlacements.values(); _e < _f.length; _e++) {
            var u = _f[_e];
            var d = (0, Hex_1.hexDistance)(u.hex, bestObjective);
            if (d < capCenterDistance) {
                capCenterDistance = d;
                capCenter = u.hex;
            }
        }
        if (!capCenter) {
            return false;
        }
        // Find an available CAP-capable fighter to launch the mission.
        for (var _g = 0, _h = this.botPlacements.entries(); _g < _h.length; _g++) {
            var _j = _h[_g], unitKey = _j[0], unit = _j[1];
            var def = this.getUnitDefinition(unit.type);
            var profile = def.airSupport;
            if (!this.isAircraft(def) || !profile || !((_b = profile.roles) === null || _b === void 0 ? void 0 : _b.includes("cap")))
                continue;
            var squadronId = this.getSquadronId(unit);
            if (this.airMissionAssignmentsByUnit.has(squadronId))
                continue;
            if (this.aircraftNeedsRearm("Bot", squadronId))
                continue;
            var origin_5 = this.parseAxialKey(unitKey);
            if (!origin_5)
                continue;
            var result = this.tryScheduleAirMission({ kind: "airCover", faction: "Bot", unitHex: origin_5, targetHex: capCenter });
            if (result.ok) {
                return true;
            }
        }
        return false;
    };
    /** Parses an axial key (q,r) into an Axial object. */
    GameEngine.prototype.parseAxialKey = function (key) {
        var parts = key.split(",");
        if (parts.length !== 2)
            return null;
        var q = Number(parts[0]);
        var r = Number(parts[1]);
        if (!Number.isFinite(q) || !Number.isFinite(r))
            return null;
        return { q: q, r: r };
    };
    /**
     * Chooses the nearest hex-facing label for movement and combat presentation.
     */
    GameEngine.prototype.resolveFacingToward = function (from, to, fallback) {
        if (fallback === void 0) { fallback = "NW"; }
        var dq = to.q - from.q;
        var dr = to.r - from.r;
        if (dq === 0 && dr === 0) {
            return fallback;
        }
        var pixelVector = function (q, r) { return ({
            x: Math.sqrt(3) * (q + r / 2),
            y: 1.5 * r
        }); };
        var moveVector = pixelVector(dq, dr);
        var facingVectors = {
            E: pixelVector(1, 0),
            NE: pixelVector(1, -1),
            NW: pixelVector(0, -1),
            W: pixelVector(-1, 0),
            SW: pixelVector(-1, 1),
            SE: pixelVector(0, 1)
        };
        var bestFacing = fallback;
        var bestScore = -Infinity;
        Object.entries(facingVectors).forEach(function (_a) {
            var facing = _a[0], vector = _a[1];
            var score = moveVector.x * vector.x + moveVector.y * vector.y;
            if (score > bestScore) {
                bestScore = score;
                bestFacing = facing;
            }
        });
        return bestFacing;
    };
    GameEngine.prototype.normalizeHexEdgeFacing = function (facing) {
        if (facing === null || facing === undefined) {
            return null;
        }
        return (0, types_1.normalizeFacingDirection)(facing, "NW");
    };
    /** Resolves a bot attack against the nearest player unit when adjacency allows it. */
    /**
     * Chooses the appropriate combat stance for a bot unit based on tactical situation.
     * - Assault: When attacking objectives (aggressive push)
     * - Suppress: When on objective (hold position)
     * - Default: Suppressive fire (safe standard behavior)
     */
    GameEngine.prototype.chooseBotStance = function (botUnit, targetHex) {
        var _a, _b;
        // Only infantry-type units can use tactical stances
        var botDef = this.getUnitDefinition(botUnit.type);
        var canUseStances = this.canUseCombatStances(botUnit, botDef);
        if (!canUseStances) {
            return "suppressive";
        }
        // Check if bot is on an objective
        var botKey = (0, Hex_1.axialKey)(botUnit.hex);
        var isOnObjective = (_a = this.scenario.objectives) === null || _a === void 0 ? void 0 : _a.some(function (obj) { return (0, Hex_1.axialKey)(obj.hex) === botKey; });
        if (isOnObjective) {
            // When on objective, use suppressive fire to hold position
            return "suppressive";
        }
        // Check if target is an objective
        var targetKey = (0, Hex_1.axialKey)(targetHex);
        var targetIsObjective = (_b = this.scenario.objectives) === null || _b === void 0 ? void 0 : _b.some(function (obj) { return (0, Hex_1.axialKey)(obj.hex) === targetKey; });
        if (targetIsObjective) {
            // Assault to take objectives aggressively
            return "assault";
        }
        if ((0, Hex_1.hexDistance)(botUnit.hex, targetHex) <= 1
            && this.resolveCombatStanceForAttacker(botUnit, botDef, "assault") === "assault") {
            return "assault";
        }
        // Default to suppressive fire
        return "suppressive";
    };
    GameEngine.prototype.resolveBotAttack = function (attackingUnit, attackerHex, targetHex, stance) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
        if (stance === void 0) { stance = "suppressive"; }
        var defenderFaction = this.playerPlacements.has((0, Hex_1.axialKey)(targetHex)) ? "Player" : "Ally";
        var defender = this.lookupUnit(targetHex, defenderFaction);
        if (!defender) {
            return null;
        }
        var attackerDef = this.getUnitDefinition(attackingUnit.type);
        var defenderDef = this.getUnitDefinition(defender.type);
        var effectiveStance = this.resolveCombatStanceForAttacker(attackingUnit, attackerDef, stance);
        var attackerIsAircraft = attackerDef.moveType === "air";
        var attackerIsBomber = this.isBomber(attackerDef);
        var defenderIsAircraft = defenderDef.moveType === "air";
        var groundAttackAmmoCost = attackerIsAircraft ? 0 : this.resolveGroundAttackAmmoCost(attackerDef);
        var isAssault = effectiveStance === "assault";
        var attackerIsFlak = attackingUnit.type.toLowerCase().includes("flak");
        if (defenderIsAircraft && !attackerIsAircraft && !attackerIsFlak) {
            return null;
        }
        if (!attackerIsAircraft && attackingUnit.ammo < groundAttackAmmoCost) {
            return null;
        }
        if (attackerIsAircraft) {
            var botFlags = (_a = this.botActionFlags.get((0, Hex_1.axialKey)(attackerHex))) !== null && _a !== void 0 ? _a : {
                movementPointsUsed: 0,
                attacksUsed: 0,
                retaliationsUsed: 0,
                isRushing: false
            };
            var allowance = Math.max(1, (_b = attackerDef.movement) !== null && _b !== void 0 ? _b : 1);
            var maneuverCost = defenderIsAircraft ? 2 : 1;
            var remaining = allowance - botFlags.movementPointsUsed;
            if (remaining < maneuverCost) {
                return null;
            }
            this.botActionFlags.set((0, Hex_1.axialKey)(attackerHex), __assign(__assign({}, botFlags), { movementPointsUsed: botFlags.movementPointsUsed + maneuverCost, attacksUsed: botFlags.attacksUsed + 1 }));
            var botKey_1 = (0, Hex_1.axialKey)(attackerHex);
            var ammoState = this.getAircraftAmmoState("Bot", botKey_1, attackerDef);
            if (this.aircraftNeedsRearm("Bot", botKey_1)) {
                return null;
            }
            if (defenderIsAircraft) {
                if (ammoState.air <= 0) {
                    return null;
                }
            }
            else if (ammoState.ground <= 0) {
                return null;
            }
        }
        var lister = this.createLosLister();
        var hasDirectLOS = (0, LOS_1.losClearAdvanced)({
            attackerClass: attackerDef.class,
            attackerHex: attackerHex,
            targetHex: targetHex,
            isAttackerAir: attackerDef.moveType === "air",
            lister: lister,
            purpose: "direct-fire"
        });
        var isSpottedOnly = false;
        if (!hasDirectLOS) {
            if (!this.canAttackWithoutDirectLOS(attackerDef) || !this.checkTargetSpotted(targetHex, "Bot")) {
                return null;
            }
            isSpottedOnly = true;
        }
        var distance = (0, Hex_1.hexDistance)(attackerHex, targetHex);
        var minRange = (_c = attackerDef.rangeMin) !== null && _c !== void 0 ? _c : 1;
        var maxRange = (_d = attackerDef.rangeMax) !== null && _d !== void 0 ? _d : 1;
        if (distance < minRange || distance > maxRange) {
            return null;
        }
        if (attackerIsAircraft && !defenderIsAircraft) {
            var defHexKey = (0, Hex_1.axialKey)(targetHex);
            // === FLAK ENGAGEMENT: Player AA intercepts bot aircraft before CAP ===
            var flakUnits = this.findAllActiveFlakUnitsForHex("Player", targetHex);
            var atkKey = (0, Hex_1.axialKey)(attackerHex);
            if (flakUnits.length > 0) {
                var flakInterceptorsForEvent = [];
                for (var _i = 0, flakUnits_6 = flakUnits; _i < flakUnits_6.length; _i++) {
                    var flakEntry = flakUnits_6[_i];
                    flakInterceptorsForEvent.push({
                        faction: "Player",
                        unitKey: this.getSquadronId(flakEntry.unit),
                        unitType: flakEntry.unit.type,
                        hex: structuredClone(flakEntry.unit.hex)
                    });
                }
                // Track bot bomber as variable since it may be destroyed
                var bomberStrengthBeforeFlak = attackingUnit.strength;
                var currentAtk = attackingUnit;
                var flakDamage = 0;
                var bomberDestroyedByFlak = false;
                for (var _m = 0, flakUnits_7 = flakUnits; _m < flakUnits_7.length; _m++) {
                    var flakEntry = flakUnits_7[_m];
                    if (currentAtk.strength <= 0)
                        break;
                    var flakReq = this.buildMissionAttackRequest("Player", flakEntry.unit, currentAtk);
                    if (!flakReq)
                        continue;
                    // Ground-based AA has severe accuracy penalty against fast-moving, distant aircraft
                    var flakResult = (0, Combat_1.resolveAttack)(flakReq);
                    var flakDef = this.getUnitDefinition(flakEntry.unit.type);
                    if (this.hasAntiAirCapability(flakDef) && this.isAircraft(attackerDef)) {
                        // Apply 75% accuracy reduction for ground AA vs aircraft (small, fast, distant targets)
                        flakResult = __assign(__assign({}, flakResult), { accuracy: flakResult.accuracy * 0.25, expectedHits: flakResult.expectedHits * 0.25, expectedDamage: flakResult.expectedDamage * 0.25, expectedSuppression: flakResult.expectedSuppression * 0.25 });
                    }
                    var suffered = Math.max(0, Math.round(flakResult.expectedDamage));
                    var updatedAtk = structuredClone(currentAtk);
                    updatedAtk.strength = Math.max(0, updatedAtk.strength - suffered);
                    flakDamage += suffered;
                    this.recordFlakEngagement("Player", flakEntry.unit, flakEntry.hexKey);
                    if (updatedAtk.strength <= 0) {
                        this.botPlacements.delete(atkKey);
                        this.removeBotSupplyEntryFor(attackerHex);
                        this.invalidateRosterCache();
                        currentAtk = updatedAtk;
                        attackingUnit = updatedAtk;
                        bomberDestroyedByFlak = true;
                        break;
                    }
                    currentAtk = updatedAtk;
                    attackingUnit = updatedAtk; // Update for subsequent CAP checks
                }
                this.pendingAirEngagements.push({
                    type: "flak",
                    location: structuredClone(targetHex),
                    bomber: {
                        faction: "Bot",
                        unitKey: atkKey,
                        unitType: attackingUnit.type,
                        strength: bomberStrengthBeforeFlak
                    },
                    interceptors: flakInterceptorsForEvent,
                    escorts: [],
                    flakDamage: flakDamage,
                    bomberStrengthBefore: bomberStrengthBeforeFlak,
                    bomberStrengthAfter: currentAtk.strength,
                    bomberDestroyed: bomberDestroyedByFlak
                });
                if (bomberDestroyedByFlak) {
                    return null; // Bot attack aborted, aircraft destroyed
                }
            }
            var capMissions = this.findAllActiveAirCoverForHex("Player", defHexKey).filter(function (m) { return m.interceptions < 1; });
            var botAttackerSquadronId = this.getSquadronId(attackingUnit);
            var escortMissions = this.findAllActiveEscortsForUnit("Bot", botAttackerSquadronId).filter(function (m) { return m.interceptions < 1; });
            if (capMissions.length > 0) {
                var bomberStrengthBeforeCap = attackingUnit.strength;
                var bomberDestroyedByCap = false;
                var interceptorAttrition = 0;
                var escortAttrition = 0;
                var interceptorKills = 0;
                var interceptorsForEvent = [];
                var escortsForEvent = [];
                for (var _o = 0, capMissions_6 = capMissions; _o < capMissions_6.length; _o++) {
                    var cap = capMissions_6[_o];
                    var capLookup = this.lookupUnitBySquadronId(cap.unitKey, "Player");
                    if (capLookup) {
                        interceptorsForEvent.push({
                            faction: "Player",
                            unitKey: cap.unitKey,
                            unitType: capLookup.unit.type,
                            strength: capLookup.unit.strength
                        });
                    }
                }
                for (var _p = 0, escortMissions_3 = escortMissions; _p < escortMissions_3.length; _p++) {
                    var em = escortMissions_3[_p];
                    var escortLookup = this.lookupUnitBySquadronId(em.unitKey, "Bot");
                    if (escortLookup) {
                        escortsForEvent.push({
                            faction: "Bot",
                            unitKey: em.unitKey,
                            unitType: escortLookup.unit.type,
                            strength: escortLookup.unit.strength
                        });
                    }
                }
                for (var _q = 0, capMissions_7 = capMissions; _q < capMissions_7.length; _q++) {
                    var cap = capMissions_7[_q];
                    var capLookup = this.lookupUnitBySquadronId(cap.unitKey, "Player");
                    if (!capLookup)
                        continue;
                    var capUnit = capLookup.unit, capHexKey = capLookup.hexKey;
                    var escort = escortMissions.find(function (entry) { return entry.interceptions < 1; });
                    if (!escort)
                        continue;
                    var escortLookup = this.lookupUnitBySquadronId(escort.unitKey, "Bot");
                    if (!escortLookup)
                        continue;
                    var escortUnit = escortLookup.unit;
                    var escortReq = this.buildMissionAttackRequest("Bot", escortUnit, capUnit);
                    if (!escortReq)
                        continue;
                    var escortRes = (0, Combat_1.resolveAttack)(escortReq);
                    var escortDef = this.getUnitDefinition(escortUnit.type);
                    var capDef = this.getUnitDefinition(capUnit.type);
                    if (this.isAircraft(escortDef) && !this.isBomber(escortDef) && this.isAircraft(capDef)) {
                        escortRes = __assign(__assign({}, escortRes), { damagePerHit: escortRes.damagePerHit * 4, expectedDamage: escortRes.expectedDamage * 4, expectedSuppression: escortRes.expectedSuppression * 4 });
                    }
                    var inflicted = Math.max(0, Math.round(escortRes.expectedDamage));
                    interceptorAttrition += inflicted;
                    var updatedCap = structuredClone(capUnit);
                    updatedCap.strength = Math.max(0, updatedCap.strength - inflicted);
                    this.spendAircraftAmmo("Bot", escort.unitKey, true);
                    escort.interceptions += 1;
                    this.playerPlacements.set(capHexKey, updatedCap);
                    this.syncPlayerStrength(updatedCap.hex, updatedCap.strength);
                    if (updatedCap.strength <= 0) {
                        interceptorKills += 1;
                        this.playerPlacements.delete(capHexKey);
                        this.removeSupplyEntryFor(capUnit.hex);
                        cap.interceptions += 1;
                    }
                }
                var currentAtk = this.botPlacements.get(atkKey);
                for (var _r = 0, capMissions_8 = capMissions; _r < capMissions_8.length; _r++) {
                    var cap = capMissions_8[_r];
                    if (cap.interceptions >= 1)
                        continue;
                    var liveCapLookup = this.lookupUnitBySquadronId(cap.unitKey, "Player");
                    if (!liveCapLookup || currentAtk.strength <= 0)
                        continue;
                    var liveCap = liveCapLookup.unit;
                    var capReq = this.buildMissionAttackRequest("Player", liveCap, currentAtk);
                    if (!capReq)
                        continue;
                    var capRes = (0, Combat_1.resolveAttack)(capReq);
                    var capDef = this.getUnitDefinition(liveCap.type);
                    if (this.isAircraft(capDef) && !this.isBomber(capDef) && this.isAircraft(attackerDef)) {
                        capRes = __assign(__assign({}, capRes), { damagePerHit: capRes.damagePerHit * 4, expectedDamage: capRes.expectedDamage * 4, expectedSuppression: capRes.expectedSuppression * 4 });
                    }
                    var suffered = Math.max(0, Math.round(capRes.expectedDamage));
                    var updatedAtkBefore = structuredClone(currentAtk);
                    updatedAtkBefore.strength = Math.max(0, updatedAtkBefore.strength - suffered);
                    this.spendAircraftAmmo("Player", cap.unitKey, true);
                    cap.interceptions += 1;
                    this.botPlacements.set(atkKey, updatedAtkBefore);
                    this.syncBotStrength(attackerHex, updatedAtkBefore.strength);
                    currentAtk = updatedAtkBefore;
                    attackingUnit = updatedAtkBefore;
                    if (updatedAtkBefore.strength <= 0) {
                        this.botPlacements.delete(atkKey);
                        this.removeBotSupplyEntryFor(attackerHex);
                        this.invalidateRosterCache();
                        bomberDestroyedByCap = true;
                        break;
                    }
                }
                this.pendingAirEngagements.push({
                    type: "airToAir",
                    location: structuredClone(targetHex),
                    bomber: {
                        faction: "Bot",
                        unitKey: atkKey,
                        unitType: attackingUnit.type,
                        strength: bomberStrengthBeforeCap
                    },
                    interceptors: interceptorsForEvent,
                    escorts: escortsForEvent,
                    bomberStrengthBefore: bomberStrengthBeforeCap,
                    bomberStrengthAfter: currentAtk.strength,
                    bomberDestroyed: bomberDestroyedByCap,
                    interceptorAttrition: interceptorAttrition,
                    interceptorKills: interceptorKills,
                    escortAttrition: escortAttrition
                });
                if (bomberDestroyedByCap) {
                    return null;
                }
            }
        }
        var defenderMods = this.getHexModifications(defender.hex);
        var defenderFortificationFacings = defenderMods
            .filter(function (entry) { return entry.type === "fortifications"; })
            .map(function (entry) { return entry.facing; })
            .filter(function (edge) { return edge !== null && edge !== undefined; });
        var defenderFortified = defenderFortificationFacings.length > 0;
        var req = {
            attacker: {
                unit: attackerDef,
                strength: attackingUnit.strength,
                experience: attackingUnit.experience,
                general: this.botSide.general
            },
            defender: {
                unit: defenderDef,
                strength: defender.strength,
                experience: defender.experience,
                general: this.playerSide.general
            },
            attackerCtx: {
                hex: attackingUnit.hex,
                stance: effectiveStance
            },
            defenderCtx: {
                terrain: (_e = this.terrainAt(defender.hex)) !== null && _e !== void 0 ? _e : this.defaultTerrain(),
                class: defenderDef.class,
                facing: defender.facing,
                hex: defender.hex,
                isRushing: isAssault,
                isSpottedOnly: isSpottedOnly,
                stance: isAssault ? "assault" : undefined,
                fortified: defenderFortified,
                fortificationFacings: defenderFortificationFacings
            },
            targetFacing: defender.facing,
            isSoftTarget: defenderDef.class === "infantry" || defenderDef.class === "specialist"
        };
        var attackResult = (0, Combat_1.resolveAttack)(req);
        var diffMods = (0, BotPlanner_1.getDifficultyModifiers)(this.botDifficulty);
        var damageModifier = 1 + (diffMods.damageMod / 100);
        attackResult = __assign(__assign({}, attackResult), { expectedDamage: attackResult.expectedDamage * damageModifier, damagePerHit: attackResult.damagePerHit * damageModifier });
        if (attackerIsBomber && !defenderIsAircraft) {
            var boostedDamage = attackResult.expectedDamage * 10;
            attackResult = __assign(__assign({}, attackResult), { damagePerHit: attackResult.damagePerHit * 10, expectedDamage: boostedDamage, expectedSuppression: attackResult.expectedSuppression * 10 });
        }
        if (attackerIsAircraft && !attackerIsBomber && defenderIsAircraft) {
            var acceleratedAirDamage = attackResult.expectedDamage * 4;
            attackResult = __assign(__assign({}, attackResult), { damagePerHit: attackResult.damagePerHit * 4, expectedDamage: acceleratedAirDamage, expectedSuppression: attackResult.expectedSuppression * 4 });
        }
        var damage = Math.max(0, attackerIsBomber && !defenderIsAircraft
            ? Math.ceil(attackResult.expectedDamage)
            : Math.round(attackResult.expectedDamage));
        var playerKey = (0, Hex_1.axialKey)(targetHex);
        var defenderWasOnSentry = defender.onSentry === true;
        var updatedPlayer = structuredClone(defender);
        updatedPlayer.facing = this.resolveFacingToward(targetHex, attackerHex, defender.facing);
        updatedPlayer.onSentry = false;
        updatedPlayer.strength = Math.max(0, updatedPlayer.strength - damage);
        if (updatedPlayer.strength <= 0) {
            if (defenderFaction === "Player") {
                this.playerPlacements.delete(playerKey);
                this.removeSupplyEntryFor(targetHex);
            }
            else {
                this.allyPlacements.delete(playerKey);
            }
        }
        else {
            if (defenderFaction === "Player") {
                this.playerPlacements.set(playerKey, updatedPlayer);
                this.syncPlayerStrength(targetHex, updatedPlayer.strength);
                // Apply suppression ONLY if using suppressive fire (not assault)
                if (effectiveStance === "suppressive") {
                    var attackerUnitId = (_f = attackingUnit.unitId) !== null && _f !== void 0 ? _f : (0, Hex_1.axialKey)(attackerHex);
                    if (!updatedPlayer.suppressedBy) {
                        updatedPlayer.suppressedBy = [];
                    }
                    if (!updatedPlayer.suppressedBy.includes(attackerUnitId)) {
                        updatedPlayer.suppressedBy.push(attackerUnitId);
                        this.playerPlacements.set(playerKey, updatedPlayer);
                        console.log("[GameEngine] *** SUPPRESSION APPLIED *** Player unit ".concat(updatedPlayer.type, " at ").concat(playerKey, " suppressed by ").concat(attackerUnitId, ", suppressedBy array:"), updatedPlayer.suppressedBy);
                    }
                }
            }
            else {
                this.allyPlacements.set(playerKey, updatedPlayer);
                // Apply suppression ONLY if using suppressive fire (not assault)
                if (effectiveStance === "suppressive") {
                    var attackerUnitId = (_g = attackingUnit.unitId) !== null && _g !== void 0 ? _g : (0, Hex_1.axialKey)(attackerHex);
                    if (!updatedPlayer.suppressedBy) {
                        updatedPlayer.suppressedBy = [];
                    }
                    if (!updatedPlayer.suppressedBy.includes(attackerUnitId)) {
                        updatedPlayer.suppressedBy.push(attackerUnitId);
                        this.allyPlacements.set(playerKey, updatedPlayer);
                    }
                }
            }
        }
        var botKey = (0, Hex_1.axialKey)(attackerHex);
        var updatedBot = structuredClone(attackingUnit);
        updatedBot.facing = this.resolveFacingToward(attackerHex, targetHex, attackingUnit.facing);
        updatedBot.onSentry = false;
        if (attackerIsAircraft) {
            this.spendAircraftAmmo("Bot", botKey, defenderIsAircraft);
            updatedBot.ammo = Math.max(0, updatedBot.ammo - 1);
        }
        else {
            updatedBot.ammo = Math.max(0, updatedBot.ammo - groundAttackAmmoCost);
        }
        // If assault attack destroyed the defender and attacker is ground unit, move attacker to defender's hex
        var defenderDestroyed = updatedPlayer.strength <= 0;
        var isAssaultKill = effectiveStance === "assault" && defenderDestroyed && !attackerIsAircraft && !defenderIsAircraft;
        var attackerMovedToDefenderHex = false;
        if (isAssaultKill) {
            console.log("[GameEngine] Bot assault kill: moving ".concat(attackingUnit.type, " from ").concat(botKey, " to ").concat(playerKey));
            // Remove from old position
            this.botPlacements.delete(botKey);
            this.botActionFlags.delete(botKey);
            // Update hex position
            updatedBot.hex = targetHex;
            // Place at new position
            this.botPlacements.set(playerKey, updatedBot);
            attackerMovedToDefenderHex = true;
        }
        else {
            this.botPlacements.set(botKey, updatedBot);
        }
        var retaliationResult;
        var attackerStrengthAfter = updatedBot.strength;
        if (defenderFaction === "Player" && (defenderWasOnSentry || updatedPlayer.strength > 0) && !(attackerIsAircraft && !defenderIsAircraft)) {
            var retaliationAllowed = true;
            var retaliationDefender = structuredClone(defenderWasOnSentry ? defender : updatedPlayer);
            retaliationDefender.facing = this.resolveFacingToward(targetHex, attackerHex, retaliationDefender.facing);
            retaliationDefender.onSentry = false;
            if (this.resolveUnitSuppressionState(retaliationDefender).state === "pinned") {
                retaliationAllowed = false;
            }
            if (retaliationAllowed) {
                var retaliationDistance = (0, Hex_1.hexDistance)(targetHex, attackerHex);
                var defenderRangeMin = (_h = defenderDef.rangeMin) !== null && _h !== void 0 ? _h : 1;
                var defenderRangeMax = (_j = defenderDef.rangeMax) !== null && _j !== void 0 ? _j : 1;
                if (this.isBomber(defenderDef) && attackerIsAircraft) {
                    defenderRangeMax = Math.max(defenderRangeMax, 2);
                }
                if (retaliationDistance < defenderRangeMin || retaliationDistance > defenderRangeMax) {
                    retaliationAllowed = false;
                }
            }
            if (retaliationAllowed) {
                var defenderFlags = (_k = this.playerActionFlags.get(playerKey)) !== null && _k !== void 0 ? _k : this.createDefaultActionFlags();
                if (defenderFlags.retaliationsUsed >= balance_1.combat.counterfire.maxRetaliationsPerTurn) {
                    retaliationAllowed = false;
                }
            }
            var defenderGroundAmmoCost = defenderIsAircraft ? 0 : this.resolveGroundAttackAmmoCost(defenderDef);
            if (retaliationAllowed) {
                if (defenderIsAircraft) {
                    var defenderAmmoState = this.getAircraftAmmoState("Player", playerKey, defenderDef);
                    if (this.aircraftNeedsRearm("Player", playerKey) || defenderAmmoState.air <= 0) {
                        retaliationAllowed = false;
                    }
                }
                else {
                    var defenderAmmo = typeof retaliationDefender.ammo === "number" ? retaliationDefender.ammo : null;
                    if (defenderAmmo !== null && defenderAmmo < defenderGroundAmmoCost) {
                        retaliationAllowed = false;
                    }
                }
            }
            var retaliationReq = retaliationAllowed
                ? this.buildAttackRequest(retaliationDefender, updatedBot, "Player", "Bot", {
                    allowBomberAirAttack: true,
                    stance: effectiveStance === "assault" ? "assault" : undefined
                })
                : null;
            if (retaliationReq) {
                var defenderIsBomber = this.isBomber(defenderDef);
                var baseRetaliation = (0, Combat_1.resolveAttack)(retaliationReq);
                var appliedRetaliation = void 0;
                var retaliationDamage = void 0;
                if (defenderIsBomber && attackerIsAircraft) {
                    var doubledDamage = baseRetaliation.expectedDamage * 2;
                    appliedRetaliation = __assign(__assign({}, baseRetaliation), { expectedDamage: doubledDamage, damagePerHit: baseRetaliation.damagePerHit * 2, expectedSuppression: baseRetaliation.expectedSuppression * 2 });
                    retaliationDamage = Math.max(0, Math.round(doubledDamage));
                }
                else if (defenderIsAircraft && !defenderIsBomber && attackerIsAircraft) {
                    var acceleratedAirDamage = baseRetaliation.expectedDamage * 4;
                    appliedRetaliation = __assign(__assign({}, baseRetaliation), { expectedDamage: acceleratedAirDamage, damagePerHit: baseRetaliation.damagePerHit * 4, expectedSuppression: baseRetaliation.expectedSuppression * 4 });
                    retaliationDamage = Math.max(0, Math.round(acceleratedAirDamage));
                }
                else {
                    appliedRetaliation = baseRetaliation;
                    retaliationDamage = Math.max(0, Math.round(baseRetaliation.expectedDamage));
                }
                retaliationResult = appliedRetaliation;
                updatedBot.strength = Math.max(0, updatedBot.strength - retaliationDamage);
                attackerStrengthAfter = updatedBot.strength;
                if (defenderIsAircraft) {
                    this.spendAircraftAmmo("Player", playerKey, attackerIsAircraft);
                    if (typeof updatedPlayer.ammo === "number") {
                        updatedPlayer.ammo = Math.max(0, updatedPlayer.ammo - 1);
                        if (updatedPlayer.strength > 0) {
                            this.playerPlacements.set(playerKey, updatedPlayer);
                            this.syncPlayerAmmo(targetHex, updatedPlayer.ammo);
                        }
                    }
                }
                else if (typeof updatedPlayer.ammo === "number") {
                    updatedPlayer.ammo = Math.max(0, updatedPlayer.ammo - defenderGroundAmmoCost);
                    if (updatedPlayer.strength > 0) {
                        this.playerPlacements.set(playerKey, updatedPlayer);
                        this.syncPlayerAmmo(targetHex, updatedPlayer.ammo);
                    }
                }
                var defenderFlags = (_l = this.playerActionFlags.get(playerKey)) !== null && _l !== void 0 ? _l : this.createDefaultActionFlags();
                this.playerActionFlags.set(playerKey, __assign(__assign({}, defenderFlags), { retaliationsUsed: defenderFlags.retaliationsUsed + 1 }));
            }
        }
        if (updatedBot.strength <= 0) {
            this.botPlacements.delete(botKey);
            this.botAttackAmmo.delete(botKey);
            this.removeBotSupplyEntryFor(attackerHex);
        }
        else {
            this.botPlacements.set(botKey, updatedBot);
            this.syncBotAmmo(attackerHex, updatedBot.ammo);
            this.syncBotStrength(attackerHex, updatedBot.strength);
        }
        this.invalidateRosterCache();
        return {
            attackerType: attackingUnit.type,
            defenderType: defender.type,
            from: structuredClone(attackerHex),
            target: structuredClone(targetHex),
            inflictedDamage: damage,
            defenderDestroyed: updatedPlayer.strength <= 0,
            retaliation: retaliationResult
                ? {
                    damage: Math.max(0, Math.round(retaliationResult.expectedDamage)),
                    terrainDefense: 0,
                    accuracyMod: Math.round(retaliationResult.accuracy * 100),
                    attackerStrengthAfter: attackerStrengthAfter
                }
                : undefined
        };
    };
    /** Ensures bot supply mirror tracks unit relocation after movement. */
    GameEngine.prototype.updateBotSupplyPosition = function (from, to, unitId) {
        var idx = this.findSupplyEntryIndex(this.botSupply, from, unitId);
        if (idx >= 0) {
            this.botSupply[idx].hex = structuredClone(to);
        }
    };
    /** Sync defender strength to bot supply mirror after combat. */
    GameEngine.prototype.syncBotStrength = function (defenderHex, strength, unitId) {
        var idx = this.findSupplyEntryIndex(this.botSupply, defenderHex, unitId);
        if (idx >= 0) {
            this.botSupply[idx].strength = strength;
        }
    };
    /** Retrieve the fully-typed unit definition or throw if the key is unknown. */
    GameEngine.prototype.getUnitDefinition = function (key) {
        var definition = this.unitTypes[key];
        if (!definition) {
            throw new Error("Unit definition missing for key: ".concat(key));
        }
        var unitClass = normalizeUnitClass(definition.class, key);
        var combat = normalizeCombatClassification(definition.combat, key);
        return __assign(__assign({}, definition), { class: unitClass, combat: combat });
    };
    /** Lookup helper returning the tile entry (palette reference) for a given hex. */
    GameEngine.prototype.lookupTileEntry = function (hex) {
        // Convert axial to offset coordinates for tile array lookup
        var col = hex.q;
        var row = hex.r + Math.floor(hex.q / 2);
        var tileRow = this.scenario.tiles[row];
        if (!tileRow) {
            return null;
        }
        var entry = tileRow[col];
        return entry !== null && entry !== void 0 ? entry : null;
    };
    GameEngine.prototype.lookupTileDetails = function (hex) {
        var _a, _b, _c, _d;
        var entry = this.lookupTileEntry(hex);
        if (!entry) {
            return null;
        }
        var paletteEntry = this.scenario.tilePalette[entry.tile];
        if (!paletteEntry) {
            return null;
        }
        var mergedFeatures = ((_a = entry.features) !== null && _a !== void 0 ? _a : paletteEntry.features)
            ? __spreadArray([], ((_b = entry.features) !== null && _b !== void 0 ? _b : paletteEntry.features), true) : [];
        return __assign(__assign({}, paletteEntry), { density: (_c = entry.density) !== null && _c !== void 0 ? _c : paletteEntry.density, features: mergedFeatures, recon: (_d = entry.recon) !== null && _d !== void 0 ? _d : paletteEntry.recon });
    };
    /** Translate palette entry into the canonical terrain definition used by combat and supply logic. */
    GameEngine.prototype.terrainAt = function (hex) {
        var tile = this.lookupTileDetails(hex);
        if (!tile) {
            return null;
        }
        var terrainDefinition = this.terrain[tile.terrain];
        return (terrainDefinition !== null && terrainDefinition !== void 0 ? terrainDefinition : null);
    };
    /** Lightweight default terrain referenced when LOS requests fall outside the map bounds. */
    GameEngine.prototype.defaultTerrain = function () {
        return {
            moveCost: { leg: 1, wheel: 1, track: 1, air: 1 },
            defense: 0,
            accMod: 0,
            blocksLOS: false
        };
    };
    /** Remove any cached supply entry associated with the provided hex. */
    GameEngine.prototype.removeSupplyEntryFor = function (hex, unitId) {
        var index = this.findSupplyEntryIndex(this.playerSupply, hex, unitId);
        if (index >= 0) {
            this.playerSupply.splice(index, 1);
        }
    };
    /** Remove bot supply entry associated with the provided hex. */
    GameEngine.prototype.removeBotSupplyEntryFor = function (hex, unitId) {
        var index = this.findSupplyEntryIndex(this.botSupply, hex, unitId);
        if (index >= 0) {
            this.botSupply.splice(index, 1);
        }
    };
    GameEngine.prototype.computeSupplySnapshot = function (faction) {
        var _a, _b, _c, _d;
        var history = this.supplyHistoryByFaction[faction];
        var frontlineUnits = faction === "Player"
            ? Array.from(this.playerPlacements.values())
            : Array.from(this.botPlacements.values());
        var reserveUnits = faction === "Player"
            ? this.reserves.map(function (reserve) { return reserve.unit; })
            : [];
        var categories = this.buildSupplyCategories(faction, frontlineUnits, reserveUnits, history);
        var alerts = this.deriveSupplyAlerts(categories, faction);
        // Calculate total stockpile (depot reserves) from categories
        var depotTotals = (0, SupplyState_1.getInventoryTotals)(this.supplyStateByFaction[faction], ["ammo", "fuel", "rations", "parts"]);
        return {
            faction: faction,
            turn: this._turnNumber,
            phase: this._phase,
            updatedAt: new Date().toISOString(),
            categories: categories,
            alerts: alerts,
            stockpile: {
                ammo: (_a = depotTotals.ammo) !== null && _a !== void 0 ? _a : 0,
                fuel: (_b = depotTotals.fuel) !== null && _b !== void 0 ? _b : 0,
                rations: (_c = depotTotals.rations) !== null && _c !== void 0 ? _c : 0,
                parts: (_d = depotTotals.parts) !== null && _d !== void 0 ? _d : 0
            },
            ledger: this.supplyStateByFaction[faction].ledger.map(function (entry) { return (__assign({}, entry)); })
        };
    };
    GameEngine.prototype.recordSupplySnapshot = function (faction) {
        var snapshot = this.computeSupplySnapshot(faction);
        this.storeSupplySnapshot(faction, snapshot);
    };
    /**
     * Persists a defensive copy of the latest supply snapshot and enforces the history retention window.
     */
    GameEngine.prototype.storeSupplySnapshot = function (faction, snapshot) {
        var history = this.supplyHistoryByFaction[faction];
        history.push(structuredClone(snapshot));
        var overflow = history.length - GameEngine.SUPPLY_HISTORY_LIMIT;
        if (overflow > 0) {
            history.splice(0, overflow);
        }
    };
    GameEngine.prototype.buildSupplyCategories = function (faction, frontlineUnits, reserveUnits, history) {
        var totalUnits = frontlineUnits.length + reserveUnits.length;
        var stockpileTotals = this.getFactionStockpileTotals(faction);
        var ammoCategory = this.composeTrackedCategory("ammo", "Ammunition", frontlineUnits, reserveUnits, history, totalUnits, stockpileTotals.ammo);
        var fuelCategory = this.composeTrackedCategory("fuel", "Fuel", frontlineUnits, reserveUnits, history, totalUnits, stockpileTotals.fuel);
        var medicalCategory = {
            resource: "medical",
            label: "Field Medical",
            total: 0,
            frontlineTotal: 0,
            reserveTotal: 0,
            // No depot stockpile tracked yet; explicit zero keeps UI cards consistent and satisfies typing.
            stockpileTotal: 0,
            averagePerUnit: 0,
            consumptionPerTurn: 0,
            estimatedDepletionTurns: null,
            trend: history
                .slice(-(GameEngine.SUPPLY_TREND_WINDOW - 1))
                .map(function (entry) { var _a, _b; return (_b = (_a = entry.categories.find(function (category) { return category.resource === "medical"; })) === null || _a === void 0 ? void 0 : _a.total) !== null && _b !== void 0 ? _b : 0; })
                .concat(0),
            status: "unknown",
            notes: faction === "Player"
                ? "Medical logistics tracking is pending implementation."
                : "Enemy medical reserves unavailable without recon confirmation."
        };
        var emergencyCategory = {
            resource: "emergency",
            label: "Emergency Reserve",
            total: 0,
            frontlineTotal: 0,
            reserveTotal: 0,
            // Placeholder zero until logistics production populates emergency caches.
            stockpileTotal: 0,
            averagePerUnit: 0,
            consumptionPerTurn: 0,
            estimatedDepletionTurns: null,
            trend: history
                .slice(-(GameEngine.SUPPLY_TREND_WINDOW - 1))
                .map(function (entry) { var _a, _b; return (_b = (_a = entry.categories.find(function (category) { return category.resource === "emergency"; })) === null || _a === void 0 ? void 0 : _a.total) !== null && _b !== void 0 ? _b : 0; })
                .concat(0),
            status: "unknown",
            notes: faction === "Player"
                ? "Emergency caches are placeholders until logistics production is wired."
                : "Enemy emergency stores cannot be estimated with current intel."
        };
        return [ammoCategory, fuelCategory, medicalCategory, emergencyCategory];
    };
    GameEngine.prototype.composeTrackedCategory = function (resource, label, frontlineUnits, reserveUnits, history, totalUnits, stockpileDepot) {
        var frontlineTotal = frontlineUnits.reduce(function (sum, unit) { var _a; return sum + ((_a = unit[resource]) !== null && _a !== void 0 ? _a : 0); }, 0);
        var reserveTotal = reserveUnits.reduce(function (sum, unit) { var _a; return sum + ((_a = unit[resource]) !== null && _a !== void 0 ? _a : 0); }, 0);
        var total = frontlineTotal + reserveTotal;
        var previousSnapshot = history.length > 0 ? history[history.length - 1] : undefined;
        var previous = previousSnapshot === null || previousSnapshot === void 0 ? void 0 : previousSnapshot.categories.find(function (category) { return category.resource === resource; });
        var rawConsumption = previous ? previous.total - total : 0;
        var consumptionPerTurn = Number(rawConsumption.toFixed(2));
        var estimatedDepletionTurns = consumptionPerTurn > 0
            ? Number((total / consumptionPerTurn).toFixed(1))
            : null;
        var trendWindow = GameEngine.SUPPLY_TREND_WINDOW - 1;
        var trendHistory = trendWindow > 0 ? history.slice(-trendWindow) : [];
        var trend = trendHistory
            .map(function (entry) { var _a, _b; return (_b = (_a = entry.categories.find(function (category) { return category.resource === resource; })) === null || _a === void 0 ? void 0 : _a.total) !== null && _b !== void 0 ? _b : 0; })
            .concat(total);
        var averagePerUnit = totalUnits === 0 ? 0 : Number((total / totalUnits).toFixed(2));
        var status = "stable";
        if (totalUnits === 0) {
            status = "unknown";
        }
        else if (total <= totalUnits) {
            status = "critical";
        }
        else if (total <= totalUnits * 2) {
            status = "warning";
        }
        if (estimatedDepletionTurns !== null) {
            if (estimatedDepletionTurns <= 1) {
                status = "critical";
            }
            else if (estimatedDepletionTurns <= 3 && status !== "critical") {
                status = "warning";
            }
        }
        if (total > 0 && consumptionPerTurn <= 0) {
            status = "stable";
        }
        return {
            resource: resource,
            label: label,
            total: total,
            frontlineTotal: frontlineTotal,
            reserveTotal: reserveTotal,
            // Track depot reserves alongside unit-held stock so UI can reflect overall availability for this resource.
            stockpileTotal: stockpileDepot,
            averagePerUnit: averagePerUnit,
            consumptionPerTurn: consumptionPerTurn,
            estimatedDepletionTurns: estimatedDepletionTurns,
            trend: trend,
            status: status
        };
    };
    GameEngine.prototype.deriveSupplyAlerts = function (categories, faction) {
        var alerts = [];
        categories.forEach(function (category) {
            var _a, _b;
            if (category.resource === "medical" || category.resource === "emergency") {
                if (category.status === "unknown") {
                    alerts.push({
                        resource: category.resource,
                        level: "info",
                        message: (_a = category.notes) !== null && _a !== void 0 ? _a : (faction === "Player"
                            ? "Medical and emergency inventories are pending future integration."
                            : "Enemy emergency reserves require higher intel confidence.")
                    });
                }
                return;
            }
            if (category.status === "critical") {
                var turns = (_b = category.estimatedDepletionTurns) !== null && _b !== void 0 ? _b : 0;
                alerts.push({
                    resource: category.resource,
                    level: "critical",
                    message: "".concat(category.label, " projected to run dry in ").concat(turns <= 0 ? "under one" : turns, " turns.")
                });
            }
            else if (category.status === "warning") {
                alerts.push({
                    resource: category.resource,
                    level: "warning",
                    message: "".concat(category.label, " reserves trending low; resupply within the next few turns.")
                });
            }
            else if (category.consumptionPerTurn <= 0 && category.total > 0) {
                alerts.push({
                    resource: category.resource,
                    level: "info",
                    message: "".concat(category.label, " consumption stabilized after recent resupply.")
                });
            }
        });
        if (faction === "Bot") {
            alerts.push({
                resource: "ammo",
                level: "info",
                message: "Enemy supply estimates reflect known deployments; confidence varies with recon coverage."
            });
        }
        return alerts;
    };
    /**
     * Generates supply route summaries from a logistics source to every deployed player unit so the
     * dashboard can chart throughput, travel time, and emerging chokepoints.
     */
    GameEngine.prototype.computePlayerLogisticsRoutes = function (source, catalog, network, placements) {
        if (placements.length === 0) {
            return new Map();
        }
        var targets = placements.map(function (unit) { return ({ hex: unit.hex, unitKey: unit.type }); });
        return (0, Supply_1.computeSupplyRoutes)(source, targets, network, catalog);
    };
    /**
     * Identifies the most expensive route so the UI can flag the single largest logistics bottleneck.
     */
    GameEngine.prototype.selectHighestCostRoute = function (routes) {
        if (routes.length === 0) {
            return null;
        }
        return routes.reduce(function (highest, current) { return (current.totalCost > highest.totalCost ? current : highest); });
    };
    /**
     * Converts a route summary into a human-readable bottleneck description by pointing at the costliest node.
     */
    GameEngine.prototype.describeRouteBottleneck = function (summary) {
        if (summary.nodes.length === 0) {
            return "No route nodes recorded";
        }
        var worstNode = summary.nodes.reduce(function (highest, node) { return (node.cost > highest.cost ? node : highest); });
        return this.formatAxial(worstNode.hex);
    };
    /**
     * Rates convoy status using travel hours and cumulative cost so commanders see which routes are slipping schedule.
     */
    GameEngine.prototype.resolveConvoyStatus = function (summary) {
        if (summary.estimatedHours > 24 || summary.totalCost > 40) {
            return "blocked";
        }
        if (summary.estimatedHours > 12 || summary.totalCost > 25) {
            return "returning";
        }
        return "delivering";
    };
    /** Formats a battle hex into the offset coordinate display used by the UI. */
    GameEngine.prototype.formatAxial = function (hex) {
        return this.toOffsetKey(hex);
    };
    /**
     * Translates a route cost into a qualitative congestion risk so the UI can color-code hotspots.
     */
    GameEngine.prototype.resolveDelayRisk = function (cost) {
        if (cost > 40) {
            return "high";
        }
        if (cost > 20) {
            return "medium";
        }
        return "low";
    };
    /**
     * Summarizes the most pressing maintenance issue for a unit so the backlog list stays easy to parse.
     */
    GameEngine.prototype.resolveMaintenanceIssue = function (unit) {
        var definition = this.getUnitDefinition(unit.type);
        if (unit.strength < 6) {
            return "Combat damage";
        }
        if (this.unitConsumesFuel(definition) && unit.fuel < 2) {
            return "Refuel required";
        }
        return "Rearm required";
    };
    /**
     * Provides a coarse estimate of how many turns each maintenance action will consume to prioritize repairs.
     */
    GameEngine.prototype.estimateMaintenanceTurns = function (unit) {
        if (unit.strength < 4) {
            return 3;
        }
        if (unit.strength < 6) {
            return 2;
        }
        return 1;
    };
    /**
     * Rebuilds a categorized support snapshot capturing readiness groupings and aggregate metrics.
     */
    GameEngine.prototype.buildSupportSnapshot = function () {
        var ready = [];
        var queued = [];
        var cooldown = [];
        var maintenance = [];
        var totalCharges = 0;
        var queuedCount = 0;
        var cooldownSum = 0;
        var cooldownCount = 0;
        this.privateSupportAssets.forEach(function (asset) {
            var snapshot = {
                id: asset.id,
                label: asset.label,
                type: asset.type,
                status: asset.status,
                charges: asset.charges,
                maxCharges: asset.maxCharges,
                cooldown: asset.cooldown,
                maxCooldown: asset.maxCooldown,
                assignedHex: asset.assignedHex,
                notes: asset.notes,
                queuedHex: asset.queuedHex,
                queuedByHex: asset.queuedByHex
            };
            switch (asset.status) {
                case "ready":
                    ready.push(snapshot);
                    break;
                case "queued":
                    queued.push(snapshot);
                    queuedCount += 1;
                    break;
                case "cooldown":
                    cooldown.push(snapshot);
                    cooldownSum += asset.cooldown;
                    cooldownCount += 1;
                    break;
                case "maintenance":
                    maintenance.push(snapshot);
                    break;
                default:
                    ready.push(snapshot);
                    break;
            }
            totalCharges += Math.max(0, asset.charges);
        });
        var metrics = {
            totalAssets: this.privateSupportAssets.length,
            ready: ready.length,
            queued: queued.length,
            cooldown: cooldown.length,
            maintenance: maintenance.length,
            totalCharges: totalCharges,
            actionsQueued: queuedCount,
            averageCooldown: cooldownCount === 0 ? null : Number((cooldownSum / cooldownCount).toFixed(2))
        };
        return {
            updatedAt: new Date().toISOString(),
            ready: ready,
            queued: queued,
            cooldown: cooldown,
            maintenance: maintenance,
            metrics: metrics
        };
    };
    /**
     * Locates the mutable support asset record or throws when an unknown identifier is provided.
     */
    GameEngine.prototype.getInternalSupportAsset = function (assetId) {
        var asset = this.privateSupportAssets.find(function (entry) { return entry.id === assetId; });
        if (!asset) {
            throw new Error("Support asset '".concat(assetId, "' was not found."));
        }
        return asset;
    };
    /**
     * Refreshes player supply history immediately after new deployments land on the map.
     */
    GameEngine.prototype.resetPlayerHistoryCheckpoint = function () {
        this.recordSupplySnapshot("Player");
    };
    GameEngine.prototype.buildRosterSnapshot = function () {
        var _this = this;
        var deploymentState = (0, DeploymentState_1.ensureDeploymentState)();
        var updatedAt = new Date().toISOString();
        var frontline = Array.from(this.playerPlacements.values()).map(function (unit) {
            var definition = _this.getUnitDefinition(unit.type);
            var unitKey = deploymentState.getUnitKeyForScenarioType(unit.type);
            var label = unitKey ? deploymentState.getLabelForUnitKey(unitKey) : unit.type;
            var sprite = unitKey ? deploymentState.getSpritePath(unitKey) : undefined;
            var combatPower = Math.max(0, Math.round(((definition.hardAttack + definition.softAttack) * unit.strength) / 10));
            var fuel = _this.resolveRosterFuel(unit, definition);
            return {
                unitId: "".concat(unit.type, "_").concat((0, Hex_1.axialKey)(unit.hex)),
                unitKey: unitKey,
                label: label,
                unitType: unit.type,
                unitClass: definition.class,
                strength: unit.strength,
                experience: unit.experience,
                ammo: unit.ammo,
                fuel: fuel,
                morale: null,
                location: _this.formatAxial(unit.hex),
                status: "frontline",
                orders: [],
                attachments: [],
                tags: [],
                combatPower: combatPower,
                sprite: sprite
            };
        });
        var support = this.privateSupportAssets.map(function (asset) {
            var combatPower = Math.max(0, asset.charges * 5);
            var orders = asset.queuedHex ? ["Queued"] : [];
            return {
                unitId: asset.id,
                unitKey: null,
                label: asset.label,
                unitType: asset.type,
                unitClass: "specialist",
                strength: asset.charges,
                experience: 0,
                ammo: 0,
                fuel: null,
                morale: null,
                location: asset.assignedHex,
                status: "support",
                orders: orders,
                attachments: [],
                tags: [asset.status],
                combatPower: combatPower,
                sprite: undefined
            };
        });
        var reserves = this.reserves.map(function (reserve, index) {
            var _a, _b;
            var definition = _this.getUnitDefinition(reserve.unit.type);
            var unitKey = (_a = reserve.allocationKey) !== null && _a !== void 0 ? _a : deploymentState.getUnitKeyForScenarioType(reserve.unit.type);
            var label = unitKey ? deploymentState.getLabelForUnitKey(unitKey) : reserve.unit.type;
            var sprite = (_b = reserve.sprite) !== null && _b !== void 0 ? _b : (unitKey ? deploymentState.getSpritePath(unitKey) : undefined);
            var combatPower = Math.max(0, Math.round(((definition.hardAttack + definition.softAttack) * reserve.unit.strength) / 10));
            var fuel = _this.resolveRosterFuel(reserve.unit, definition);
            return {
                unitId: "reserve_".concat(index),
                unitKey: unitKey,
                label: label,
                unitType: reserve.unit.type,
                unitClass: definition.class,
                strength: reserve.unit.strength,
                experience: reserve.unit.experience,
                ammo: reserve.unit.ammo,
                fuel: fuel,
                morale: null,
                location: null,
                status: "reserve",
                orders: [],
                attachments: [],
                tags: ["reserve"],
                combatPower: combatPower,
                sprite: sprite
            };
        });
        var casualties = this.casualtyLog.map(function (casualty, index) {
            var definition = _this.getUnitDefinition(casualty.unit.type);
            var fuel = _this.resolveRosterFuel(casualty.unit, definition);
            return {
                unitId: "casualty_".concat(index),
                unitKey: casualty.unitKey,
                label: casualty.label,
                unitType: casualty.unit.type,
                unitClass: definition.class,
                strength: casualty.unit.strength,
                experience: casualty.unit.experience,
                ammo: casualty.unit.ammo,
                fuel: fuel,
                morale: null,
                location: _this.formatAxial(casualty.unit.hex),
                status: "casualty",
                orders: [],
                attachments: [],
                tags: ["destroyed"],
                combatPower: 0,
                sprite: undefined
            };
        });
        var frontlinePower = frontline.reduce(function (total, unit) { return total + unit.combatPower; }, 0);
        var supportPower = support.reduce(function (total, unit) { return total + unit.combatPower; }, 0);
        var reservePower = reserves.reduce(function (total, unit) { return total + unit.combatPower; }, 0);
        var metrics = {
            totalUnits: frontline.length + support.length + reserves.length + casualties.length,
            frontline: frontline.length,
            support: support.length,
            reserve: reserves.length,
            casualties: casualties.length,
            combatPowerTotal: frontlinePower + supportPower + reservePower,
            reserveDepth: reserves.length
        };
        return {
            updatedAt: updatedAt,
            frontline: frontline,
            support: support,
            reserves: reserves,
            casualties: casualties,
            metrics: metrics
        };
    };
    /**
     * Normalizes fuel readouts for roster snapshots, returning null for formations that do not track fuel (e.g., infantry).
     */
    GameEngine.prototype.resolveRosterFuel = function (unit, definition) {
        var usesFuel = ["vehicle", "tank", "air", "recon"].includes(definition.class);
        if (!usesFuel) {
            return null;
        }
        return Math.max(0, Math.round(unit.fuel));
    };
    /**
     * Records a detailed combat engagement for post-battle analysis and reporting.
     */
    GameEngine.prototype.recordCombatReport = function (engagement) {
        this.combatReportIdCounter += 1;
        var report = {
            id: "combat_".concat(this._turnNumber, "_").concat(this.combatReportIdCounter),
            turn: this._turnNumber,
            timestamp: new Date().toISOString(),
            attacker: {
                faction: engagement.attacker.faction,
                unitType: engagement.attacker.unit.type,
                position: structuredClone(engagement.attacker.hex),
                strengthBefore: engagement.attacker.strengthBefore,
                strengthAfter: engagement.attacker.strengthAfter
            },
            defender: {
                faction: engagement.defender.faction,
                unitType: engagement.defender.unit.type,
                position: structuredClone(engagement.defender.hex),
                strengthBefore: engagement.defender.strengthBefore,
                strengthAfter: engagement.defender.strengthAfter,
                destroyed: engagement.defender.destroyed
            },
            attackResult: {
                damage: Math.max(0, Math.round(engagement.attackResult.expectedDamage)),
                terrainDefense: 0, // Calculated inside attack resolution, not exposed
                accuracyMod: Math.round(engagement.attackResult.accuracy * 100),
                range: 0, // Not exposed in AttackResult
                los: true // Assume true if attack was allowed
            },
            retaliation: engagement.retaliationResult
                ? {
                    damage: Math.max(0, Math.round(engagement.retaliationResult.expectedDamage)),
                    terrainDefense: 0,
                    accuracyMod: Math.round(engagement.retaliationResult.accuracy * 100),
                    attackerStrengthAfter: engagement.attacker.strengthAfter
                }
                : undefined
        };
        this.combatReports.push(report);
        // Keep only last 50 reports to prevent unlimited growth
        if (this.combatReports.length > 50) {
            this.combatReports.shift();
        }
    };
    /**
     * Records a concise air mission report capped to the most recent 50 sorties so planners can track trends
     * without bloating save files.
     */
    GameEngine.prototype.recordAirMissionReport = function (mission, options) {
        var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
        if (options === void 0) { options = {}; }
        var outcome = options.outcome, event = options.event, kills = options.kills, bomberAttrition = options.bomberAttrition, interceptorAttrition = options.interceptorAttrition, escortAttrition = options.escortAttrition, notes = options.notes;
        // Derive metrics from outcome meta if not explicitly provided
        var derivedKills = kills !== null && kills !== void 0 ? kills : ((outcome === null || outcome === void 0 ? void 0 : outcome.meta)
            ? {
                escorts: (_b = (_a = outcome.meta.escortKills) !== null && _a !== void 0 ? _a : outcome.meta.escortsWins) !== null && _b !== void 0 ? _b : 0,
                cap: (_d = (_c = outcome.meta.interceptorKills) !== null && _c !== void 0 ? _c : outcome.meta.capKills) !== null && _d !== void 0 ? _d : 0
            }
            : undefined);
        var derivedAttrition = bomberAttrition !== null && bomberAttrition !== void 0 ? bomberAttrition : ((_f = (_e = outcome === null || outcome === void 0 ? void 0 : outcome.meta) === null || _e === void 0 ? void 0 : _e.bomberAttrition) !== null && _f !== void 0 ? _f : undefined);
        var derivedInterceptorAttrition = interceptorAttrition !== null && interceptorAttrition !== void 0 ? interceptorAttrition : ((_h = (_g = outcome === null || outcome === void 0 ? void 0 : outcome.meta) === null || _g === void 0 ? void 0 : _g.interceptorAttrition) !== null && _h !== void 0 ? _h : undefined);
        var derivedEscortAttrition = escortAttrition !== null && escortAttrition !== void 0 ? escortAttrition : ((_k = (_j = outcome === null || outcome === void 0 ? void 0 : outcome.meta) === null || _j === void 0 ? void 0 : _j.escortAttrition) !== null && _k !== void 0 ? _k : undefined);
        var entry = {
            id: "airMission_".concat(mission.id, "_").concat(this._turnNumber),
            missionId: mission.id,
            turnResolved: this._turnNumber,
            timestamp: new Date().toISOString(),
            faction: mission.faction,
            unitType: mission.unitType,
            unitKey: mission.unitKey,
            kind: mission.template.kind,
            outcome: outcome ? structuredClone(outcome) : undefined,
            targetHex: mission.targetHex ? structuredClone(mission.targetHex) : undefined,
            escortTargetUnitKey: mission.escortTargetUnitKey,
            interceptions: mission.interceptions,
            event: event !== null && event !== void 0 ? event : (outcome ? "resolved" : undefined),
            kills: derivedKills,
            bomberAttrition: derivedAttrition,
            interceptorAttrition: derivedInterceptorAttrition,
            escortAttrition: derivedEscortAttrition,
            notes: notes
        };
        this.airMissionReports.push(entry);
        if (this.airMissionReports.length > 50) {
            this.airMissionReports.shift();
        }
    };
    GameEngine.prototype.addMissionAirCombatInflicted = function (mission, damage, kills) {
        if (kills === void 0) { kills = 0; }
        if (!mission) {
            return;
        }
        mission.airCombatDamageInflicted += Math.max(0, Math.round(damage));
        mission.airCombatKills += Math.max(0, Math.round(kills));
    };
    GameEngine.prototype.addMissionAirCombatTaken = function (mission, damage) {
        if (!mission) {
            return;
        }
        mission.airCombatDamageTaken += Math.max(0, Math.round(damage));
    };
    /**
     * Classifies the unit's current suppression state for UI and rule queries.
     */
    GameEngine.prototype.resolveUnitSuppressionState = function (unit) {
        var _a, _b;
        var count = (_b = (_a = unit.suppressedBy) === null || _a === void 0 ? void 0 : _a.length) !== null && _b !== void 0 ? _b : 0;
        if (count >= 2) {
            return { state: "pinned", count: count };
        }
        if (count === 1) {
            return { state: "suppressed", count: count };
        }
        return { state: "clear", count: 0 };
    };
    GameEngine.prototype.canUseCombatStances = function (unit, definition) {
        if (definition.moveType === "leg" && ["infantry", "recon", "specialist"].includes(definition.class)) {
            return true;
        }
        return unit.type === "Recon_Bike";
    };
    GameEngine.prototype.resolveCombatStanceForAttacker = function (unit, definition, requested) {
        if (!requested || requested === "digIn") {
            return undefined;
        }
        if (!this.canUseCombatStances(unit, definition)) {
            return undefined;
        }
        if (requested === "assault") {
            return this.resolveUnitSuppressionState(unit).state === "clear" ? "assault" : undefined;
        }
        return "suppressive";
    };
    GameEngine.prototype.buildAssaultUnavailableMessage = function (unit, definition) {
        if (!this.canUseCombatStances(unit, definition)) {
            return "Only assault-capable infantry formations and recon bikes can initiate assault fire.";
        }
        var suppression = this.resolveUnitSuppressionState(unit).state;
        if (suppression === "pinned") {
            return "Pinned formations cannot move, retaliate, or initiate assault fire until the pin is broken.";
        }
        if (suppression === "suppressed") {
            return "Suppressed formations may still move and fire, but they cannot initiate assault fire this turn.";
        }
        return "This formation cannot initiate assault fire from its current posture.";
    };
    GameEngine.prototype.isEngineerUnit = function (unit, definition) {
        var _a;
        var def = definition !== null && definition !== void 0 ? definition : this.getUnitDefinition(unit.type);
        var traits = ((_a = def.traits) !== null && _a !== void 0 ? _a : []);
        return unit.type.toLowerCase().includes("engineer") || traits.includes("engineer");
    };
    GameEngine.prototype.describeHexModification = function (type) {
        switch (type) {
            case "tankTraps":
                return "tank traps";
            case "fortifications":
                return "fortifications";
            case "clearedPath":
                return "a cleared path";
            default:
                return "fieldworks";
        }
    };
    GameEngine.prototype.resolveActionCommitmentReason = function (flags) {
        if (flags.attacksUsed > 0 || flags.movementPointsUsed > 0) {
            return "Hold position and stay uncommitted this turn to use field actions.";
        }
        return null;
    };
    GameEngine.prototype.resolveSentryAvailability = function (hex, unit, flags) {
        if (this._phase !== "playerTurn") {
            return { available: false, reason: "Sentry orders are available only during the player turn." };
        }
        if (this.isAutomatedPlayerUnit(unit)) {
            return { available: false, reason: "Automated logistics convoys do not accept sentry orders." };
        }
        if (!this.playerPlacements.has((0, Hex_1.axialKey)(hex))) {
            return { available: false, reason: "No player formation occupies this hex." };
        }
        if (unit.onSentry) {
            return { available: false, reason: "This formation is already on sentry." };
        }
        if (this.resolveTowState(unit) === "towed") {
            return { available: false, reason: "Deploy the battery before placing it on sentry." };
        }
        if (this.resolveUnitSuppressionState(unit).state === "pinned") {
            return { available: false, reason: "Pinned formations cannot be placed on sentry." };
        }
        if (flags.attacksUsed > 0 || flags.movementPointsUsed > 0) {
            return { available: false, reason: "Hold position and stay uncommitted this turn to set sentry." };
        }
        return { available: true, reason: null };
    };
    GameEngine.prototype.resolveDigInAvailability = function (hex, unit, definition, flags) {
        if (this._phase !== "playerTurn") {
            return { available: false, reason: "Dig in commands are available only during the player turn." };
        }
        if (this.isAutomatedPlayerUnit(unit)) {
            return { available: false, reason: "Automated logistics convoys do not accept infantry action orders." };
        }
        if (!this.playerPlacements.has((0, Hex_1.axialKey)(hex))) {
            return { available: false, reason: "No player formation occupies this hex." };
        }
        if (definition.class !== "infantry") {
            return { available: false, reason: "Only infantry formations can dig in." };
        }
        if (this.isTowableUnit(unit)) {
            return { available: false, reason: "Towable artillery cannot entrench." };
        }
        if (unit.entrench >= 2) {
            return { available: false, reason: "Entrenchment is already at maximum depth." };
        }
        return {
            available: this.resolveActionCommitmentReason(flags) === null,
            reason: this.resolveActionCommitmentReason(flags)
        };
    };
    GameEngine.prototype.resolveBuildModificationAvailability = function (hex, unit, definition, flags) {
        var _a, _b, _c;
        var byType = {
            fortifications: this.resolveBuildModificationAvailabilityForType(hex, unit, definition, flags, "fortifications"),
            tankTraps: this.resolveBuildModificationAvailabilityForType(hex, unit, definition, flags, "tankTraps"),
            clearedPath: this.resolveBuildModificationAvailabilityForType(hex, unit, definition, flags, "clearedPath")
        };
        var available = Object.values(byType).some(function (entry) { return entry.available; });
        return {
            available: available,
            reason: available
                ? null
                : (_c = (_b = (_a = byType.fortifications.reason) !== null && _a !== void 0 ? _a : byType.tankTraps.reason) !== null && _b !== void 0 ? _b : byType.clearedPath.reason) !== null && _c !== void 0 ? _c : null,
            byType: byType
        };
    };
    GameEngine.prototype.resolveBuildModificationAvailabilityForType = function (hex, unit, definition, flags, type) {
        var _a;
        if (this._phase !== "playerTurn") {
            return { available: false, reason: "Engineer fieldworks can be ordered only during the player turn." };
        }
        if (this.isAutomatedPlayerUnit(unit)) {
            return { available: false, reason: "Automated logistics convoys do not accept engineering orders." };
        }
        if (!this.playerPlacements.has((0, Hex_1.axialKey)(hex))) {
            return { available: false, reason: "No player engineer occupies this hex." };
        }
        if (!this.isEngineerUnit(unit, definition)) {
            return { available: false, reason: "Only engineer battalions can build battlefield modifications." };
        }
        var commitmentReason = this.resolveActionCommitmentReason(flags);
        if (commitmentReason) {
            return { available: false, reason: commitmentReason };
        }
        var existingMods = (_a = this.hexModifications.get((0, Hex_1.axialKey)(hex))) !== null && _a !== void 0 ? _a : [];
        if (type === "fortifications" || type === "tankTraps") {
            var occupiedEdges = new Set(existingMods
                .filter(function (entry) { return entry.type === type; })
                .map(function (entry) { return entry.facing; })
                .filter(function (edge) { return edge !== null && edge !== undefined; }));
            if (occupiedEdges.size >= 6) {
                return {
                    available: false,
                    reason: "All six hex edges already contain ".concat(type === "fortifications" ? "fortifications" : "tank traps", ".")
                };
            }
            return { available: true, reason: null };
        }
        var tile = this.lookupTileDetails(hex);
        if (!this.tileCanHostRoad(tile)) {
            return {
                available: false,
                reason: "Cleared paths can be cut only across land hexes."
            };
        }
        if (this.tileHasRoadSurface(tile)) {
            return {
                available: false,
                reason: "This hex already has a road surface."
            };
        }
        var currentLevel = this.getHexModificationLevel(hex, "clearedPath");
        if (currentLevel >= 3) {
            return {
                available: false,
                reason: "This hex already has a fully developed cleared path."
            };
        }
        return { available: true, reason: null };
    };
    GameEngine.prototype.resolveMoveOutAvailability = function (hex, unit, definition, flags) {
        if (this._phase !== "playerTurn") {
            return { available: false, reason: "Move-out orders are available only during the player turn." };
        }
        if (!this.isTowableUnit(unit)) {
            return { available: false, reason: "This formation does not require towing drills." };
        }
        if (this.isAutomatedPlayerUnit(unit)) {
            return { available: false, reason: "Automated logistics convoys do not accept towing orders." };
        }
        if (!this.playerPlacements.has((0, Hex_1.axialKey)(hex))) {
            return { available: false, reason: "No player formation occupies this hex." };
        }
        if (this.resolveTowState(unit) === "towed") {
            return { available: false, reason: "This formation is already limbered and ready to tow." };
        }
        if (unit.onSentry) {
            return { available: false, reason: "Cancel sentry before limbering the guns." };
        }
        if (this.resolveUnitSuppressionState(unit).state === "pinned") {
            return { available: false, reason: "Pinned formations cannot hook up for towing." };
        }
        if (flags.attacksUsed > 0 || flags.movementPointsUsed > 0) {
            return { available: false, reason: "Hook-up drills require the battery to start the turn uncommitted." };
        }
        return { available: true, reason: null };
    };
    GameEngine.prototype.resolveTowDeployAvailability = function (hex, unit, definition, flags) {
        if (this._phase !== "playerTurn") {
            return { available: false, reason: "Deployment drills are available only during the player turn." };
        }
        if (!this.isTowableUnit(unit)) {
            return { available: false, reason: "This formation does not use tow deployment drills." };
        }
        if (this.isAutomatedPlayerUnit(unit)) {
            return { available: false, reason: "Automated logistics convoys do not accept tow deployment orders." };
        }
        if (!this.playerPlacements.has((0, Hex_1.axialKey)(hex))) {
            return { available: false, reason: "No player formation occupies this hex." };
        }
        if (this.resolveTowState(unit) !== "towed") {
            return { available: false, reason: "This formation is already deployed for fire." };
        }
        if (unit.onSentry) {
            return { available: false, reason: "Cancel sentry before deploying the guns." };
        }
        if (this.resolveUnitSuppressionState(unit).state === "pinned") {
            return { available: false, reason: "Pinned formations cannot deploy their guns." };
        }
        if (flags.attacksUsed > 0) {
            return { available: false, reason: "This formation has already attacked this turn." };
        }
        return { available: true, reason: null };
    };
    /**
     * Supplies a read-only action state for the selected unit so the command UI can stay in sync with engine rules.
     */
    GameEngine.prototype.getUnitCommandState = function (hex, unitId) {
        var _a;
        var unit = this.lookupUnit(hex, "Player", false, unitId);
        if (!unit) {
            return null;
        }
        var definition = this.getUnitDefinition(unit.type);
        var flags = this.getUnitActionFlags("Player", unit);
        var suppression = this.resolveUnitSuppressionState(unit);
        var towState = this.resolveTowState(unit);
        var moveOut = this.resolveMoveOutAvailability(hex, unit, definition, flags);
        var towDeploy = this.resolveTowDeployAvailability(hex, unit, definition, flags);
        var sentry = this.resolveSentryAvailability(hex, unit, flags);
        var digIn = this.resolveDigInAvailability(hex, unit, definition, flags);
        var build = this.resolveBuildModificationAvailability(hex, unit, definition, flags);
        var existingHexModifications = this.getHexModifications(hex);
        var existingHexModification = (_a = existingHexModifications[0]) !== null && _a !== void 0 ? _a : null;
        return {
            unitId: this.getSquadronId(unit),
            unitType: unit.type,
            isAutomated: this.isAutomatedPlayerUnit(unit),
            isEngineer: this.isEngineerUnit(unit, definition),
            entrenchment: unit.entrench,
            maxEntrenchment: 2,
            suppressionState: suppression.state,
            suppressorCount: suppression.count,
            isOnSentry: unit.onSentry === true,
            towState: towState,
            existingHexModification: existingHexModification ? structuredClone(existingHexModification) : null,
            existingHexModifications: existingHexModifications.map(function (entry) { return structuredClone(entry); }),
            canMoveOut: moveOut.available,
            moveOutReason: moveOut.reason,
            canDeployTow: towDeploy.available,
            deployTowReason: towDeploy.reason,
            canEnterSentry: sentry.available,
            sentryReason: sentry.reason,
            canDigIn: digIn.available,
            digInReason: digIn.reason,
            canBuildModification: build.available,
            buildReason: build.reason,
            buildModificationAvailability: structuredClone(build.byType)
        };
    };
    /**
     * Field actions consume the unit's operational tempo for the turn, so spend the
     * current movement allowance as well as the attack action.
     */
    GameEngine.prototype.resolveCommittedFieldActionFlags = function (hex, flags, unitId) {
        var movementContext = this.resolveMovementContext(hex, unitId);
        var committedMovement = movementContext ? movementContext.max : flags.movementPointsUsed;
        return __assign(__assign({}, flags), { movementPointsUsed: Math.max(flags.movementPointsUsed, committedMovement), attacksUsed: Math.max(flags.attacksUsed, 1) });
    };
    /**
     * Puts a unit on sentry duty. Unit will return simultaneous fire if attacked.
     * Unit cannot move or attack again this turn after entering sentry.
     */
    GameEngine.prototype.enterSentry = function (hex, unitId) {
        var key = (0, Hex_1.axialKey)(hex);
        var unit = this.lookupUnit(hex, "Player", false, unitId);
        if (!unit) {
            return false;
        }
        var flags = this.getUnitActionFlags("Player", unit);
        var sentry = this.resolveSentryAvailability(hex, unit, flags);
        if (!sentry.available) {
            return false;
        }
        unit.onSentry = true;
        this.replaceUnitInFactionHex("Player", unit);
        this.setUnitActionFlags("Player", unit, this.resolveCommittedFieldActionFlags(hex, flags, this.getSquadronId(unit)));
        this.updateIdleRegistryFor(key);
        this.invalidateRosterCache();
        return true;
    };
    /**
     * Removes a unit from sentry mode, restoring it to idle status if it hasn't acted.
     * Allows commanders to undo sentry before ending their turn.
     */
    GameEngine.prototype.exitSentry = function (hex, unitId) {
        var key = (0, Hex_1.axialKey)(hex);
        var unit = this.lookupUnit(hex, "Player", false, unitId);
        if (!unit || !unit.onSentry) {
            return false;
        }
        // Remove sentry flag
        unit.onSentry = false;
        this.replaceUnitInFactionHex("Player", unit);
        // Update idle registry - unit becomes idle again if it hasn't acted
        this.updateIdleRegistryFor(key);
        this.invalidateRosterCache();
        return true;
    };
    GameEngine.prototype.moveOutTowableUnit = function (hex, unitId) {
        var key = (0, Hex_1.axialKey)(hex);
        var unit = this.lookupUnit(hex, "Player", false, unitId);
        if (!unit) {
            return false;
        }
        var definition = this.getUnitDefinition(unit.type);
        var flags = this.getUnitActionFlags("Player", unit);
        var availability = this.resolveMoveOutAvailability(hex, unit, definition, flags);
        if (!availability.available) {
            return false;
        }
        unit.towState = "towed";
        unit.onSentry = false;
        unit.entrench = 0;
        this.replaceUnitInFactionHex("Player", unit);
        this.syncPlayerEntrench(hex, unit.entrench, this.getSquadronId(unit));
        this.setUnitActionFlags("Player", unit, __assign(__assign({}, flags), { movementPointsUsed: flags.movementPointsUsed + this.resolveTowHookupCost(definition, flags), isRushing: false }));
        this.updateIdleRegistryFor(key);
        this.invalidateRosterCache();
        return true;
    };
    GameEngine.prototype.deployTowableUnit = function (hex, unitId) {
        var key = (0, Hex_1.axialKey)(hex);
        var unit = this.lookupUnit(hex, "Player", false, unitId);
        if (!unit) {
            return false;
        }
        var definition = this.getUnitDefinition(unit.type);
        var flags = this.getUnitActionFlags("Player", unit);
        var availability = this.resolveTowDeployAvailability(hex, unit, definition, flags);
        if (!availability.available) {
            return false;
        }
        unit.towState = "deployed";
        unit.onSentry = false;
        this.replaceUnitInFactionHex("Player", unit);
        if (flags.movementPointsUsed > 0) {
            this.setUnitActionFlags("Player", unit, this.resolveCommittedFieldActionFlags(hex, flags, this.getSquadronId(unit)));
        }
        this.updateIdleRegistryFor(key);
        this.invalidateRosterCache();
        return true;
    };
    /**
     * Dig in action for infantry units. Increases entrenchment level (max 2).
     * Unit cannot move or attack again this turn after digging in.
     */
    GameEngine.prototype.digInUnit = function (hex, unitId) {
        var key = (0, Hex_1.axialKey)(hex);
        var unit = this.lookupUnit(hex, "Player", false, unitId);
        if (!unit) {
            return false;
        }
        var def = this.getUnitDefinition(unit.type);
        var flags = this.getUnitActionFlags("Player", unit);
        var digIn = this.resolveDigInAvailability(hex, unit, def, flags);
        if (!digIn.available) {
            return false;
        }
        // Increase entrenchment (max 2)
        unit.entrench = Math.min(2, unit.entrench + 1);
        this.replaceUnitInFactionHex("Player", unit);
        this.syncPlayerEntrench(hex, unit.entrench, this.getSquadronId(unit));
        // Digging in consumes the battalion's remaining operational time for the turn.
        this.setUnitActionFlags("Player", unit, this.resolveCommittedFieldActionFlags(hex, flags, this.getSquadronId(unit)));
        this.updateIdleRegistryFor(key);
        this.invalidateRosterCache();
        return true;
    };
    /**
     * Build a hex modification (tank traps, fortifications, cleared path).
     * Only engineers can build modifications.
     */
    GameEngine.prototype.buildHexModification = function (hex, type, facing, unitId) {
        var _this = this;
        var _a, _b, _c;
        var key = (0, Hex_1.axialKey)(hex);
        var unit = this.lookupUnit(hex, "Player", false, unitId);
        if (!unit) {
            return false;
        }
        var def = this.getUnitDefinition(unit.type);
        var flags = this.getUnitActionFlags("Player", unit);
        var build = this.resolveBuildModificationAvailabilityForType(hex, unit, def, flags, type);
        if (!build.available) {
            return false;
        }
        var usesFacing = type === "fortifications" || type === "tankTraps";
        var normalizedFacing = usesFacing
            ? this.normalizeHexEdgeFacing(facing)
            : null;
        if (usesFacing && !normalizedFacing) {
            return false;
        }
        var existingMods = (_a = this.hexModifications.get(key)) !== null && _a !== void 0 ? _a : [];
        if (usesFacing &&
            existingMods.some(function (entry) { return entry.type === type && _this.normalizeHexEdgeFacing(entry.facing) === normalizedFacing; })) {
            return false;
        }
        if (type === "clearedPath") {
            var existingPath = (_b = existingMods.find(function (entry) { return entry.type === "clearedPath"; })) !== null && _b !== void 0 ? _b : null;
            if (existingPath) {
                existingPath.level = Math.min(3, ((_c = existingPath.level) !== null && _c !== void 0 ? _c : 1) + 1);
                existingPath.builtOnTurn = this._turnNumber;
            }
            else {
                existingMods.push({
                    type: type,
                    hex: structuredClone(hex),
                    faction: "Player",
                    level: 1,
                    builtOnTurn: this._turnNumber
                });
            }
            this.hexModifications.set(key, existingMods);
        }
        else {
            existingMods.push({
                type: type,
                hex: structuredClone(hex),
                faction: "Player",
                facing: normalizedFacing !== null && normalizedFacing !== void 0 ? normalizedFacing : undefined,
                builtOnTurn: this._turnNumber
            });
            this.hexModifications.set(key, existingMods);
        }
        // These engineer actions abstract a short five-minute slice of work across a roughly 250m hex,
        // so even edge works and path clearing consume the battalion's remaining operational tempo.
        this.setUnitActionFlags("Player", unit, this.resolveCommittedFieldActionFlags(hex, flags, this.getSquadronId(unit)));
        this.updateIdleRegistryFor(key);
        this.invalidateRosterCache();
        return true;
    };
    /**
     * Get hex modification at a specific hex, if any.
     */
    GameEngine.prototype.getHexModification = function (hex) {
        var _a, _b;
        var key = (0, Hex_1.axialKey)(hex);
        return (_b = (_a = this.hexModifications.get(key)) === null || _a === void 0 ? void 0 : _a[0]) !== null && _b !== void 0 ? _b : null;
    };
    GameEngine.prototype.getHexModifications = function (hex) {
        var _a;
        var key = (0, Hex_1.axialKey)(hex);
        return ((_a = this.hexModifications.get(key)) !== null && _a !== void 0 ? _a : []).map(function (entry) { return structuredClone(entry); });
    };
    GameEngine.prototype.getHexModificationSnapshots = function () {
        return Array.from(this.hexModifications.values()).flatMap(function (entries) { return entries.map(function (entry) { return structuredClone(entry); }); });
    };
    /** Conversion factor mapping a single hex (250m) into kilometers for range validation. */
    GameEngine.KILOMETERS_PER_HEX = 0.25;
    GameEngine.TOWABLE_UNIT_TYPES = new Set(transportModes_1.TOWED_ARTILLERY_UNITS);
    GameEngine.AIR_COVER_PATROL_RADIUS_HEX = 12;
    GameEngine.ENEMY_CONTACT_MEMORY_TURNS = 2;
    GameEngine.RECON_SPOTTING_RANGE_BONUS = 2;
    GameEngine.AIR_SPOTTING_RANGE_BONUS = 2;
    GameEngine.COUNTER_INTEL_MAX_DECEPTION_CHARGES = 2;
    GameEngine.COUNTER_INTEL_MAX_VERIFICATION_CHARGES = 2;
    GameEngine.COUNTER_INTEL_OPERATION_DURATION_TURNS = 3;
    GameEngine.COUNTER_INTEL_OPERATION_RADIUS = 2;
    GameEngine.COUNTER_INTEL_OPERATION_STRENGTH = 3;
    GameEngine.DEFAULT_FALSE_INTEL_BRIEF_IDS = new Set(["brief-phantom"]);
    /** Maximum number of historical entries retained per faction for trend math. */
    GameEngine.SUPPLY_HISTORY_LIMIT = 12;
    /** Number of turns graphed in the mini trend sparkline shown in the supplies sidebar. */
    GameEngine.SUPPLY_TREND_WINDOW = 4;
    return GameEngine;
}());
exports.GameEngine = GameEngine;
