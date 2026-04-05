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
exports.createInventory = createInventory;
exports.createSupplyState = createSupplyState;
exports.applyShipment = applyShipment;
exports.recordConsumption = recordConsumption;
exports.normalizeLedger = normalizeLedger;
exports.serializeSupplyState = serializeSupplyState;
exports.restoreSupplyState = restoreSupplyState;
exports.updateBaselineBonus = updateBaselineBonus;
exports.recalcCurrentFromBaseline = recalcCurrentFromBaseline;
exports.setProductionRate = setProductionRate;
exports.scheduleShipment = scheduleShipment;
exports.advanceShipments = advanceShipments;
exports.accumulateProduction = accumulateProduction;
exports.enforceLedgerLimit = enforceLedgerLimit;
exports.getInventoryTotals = getInventoryTotals;
/**
 * Creates a new inventory object with the given baseline and bonus values.
 */
function createInventory(baseline, bonus) {
    var seed = {
        rations: { current: 0, baseline: 0, bonus: 0 },
        fuel: { current: 0, baseline: 0, bonus: 0 },
        ammo: { current: 0, baseline: 0, bonus: 0 },
        parts: { current: 0, baseline: 0, bonus: 0 }
    };
    Object.keys(seed).forEach(function (key) {
        var _a, _b;
        var base = (_a = baseline[key]) !== null && _a !== void 0 ? _a : 0;
        var extra = (_b = bonus === null || bonus === void 0 ? void 0 : bonus[key]) !== null && _b !== void 0 ? _b : 0;
        seed[key] = {
            current: base + extra,
            baseline: base,
            bonus: extra
        };
    });
    return seed;
}
/**
 * Creates a new supply state object with the given parameters.
 */
function createSupplyState(params) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l;
    return {
        inventory: createInventory(params.baseline, params.bonus),
        pending: __spreadArray([], ((_a = params.pending) !== null && _a !== void 0 ? _a : []), true),
        productionRate: {
            rations: (_c = (_b = params.productionRate) === null || _b === void 0 ? void 0 : _b.rations) !== null && _c !== void 0 ? _c : 0,
            fuel: (_e = (_d = params.productionRate) === null || _d === void 0 ? void 0 : _d.fuel) !== null && _e !== void 0 ? _e : 0,
            ammo: (_g = (_f = params.productionRate) === null || _f === void 0 ? void 0 : _f.ammo) !== null && _g !== void 0 ? _g : 0,
            parts: (_j = (_h = params.productionRate) === null || _h === void 0 ? void 0 : _h.parts) !== null && _j !== void 0 ? _j : 0
        },
        ledger: __spreadArray([], ((_k = params.ledger) !== null && _k !== void 0 ? _k : []), true),
        lastUpdatedTurn: (_l = params.lastUpdatedTurn) !== null && _l !== void 0 ? _l : 0
    };
}
function applyShipment(state, shipment, turn) {
    var entry = state.inventory[shipment.type];
    entry.current += shipment.amount;
    state.ledger.unshift({
        id: shipment.id,
        turn: turn,
        type: shipment.type,
        delta: shipment.amount,
        reason: shipment.source.join(", "),
        timestamp: new Date().toISOString()
    });
}
function recordConsumption(state, type, amount, turn, reason) {
    var entry = state.inventory[type];
    entry.current = Math.max(0, entry.current - amount);
    state.ledger.unshift({
        id: "".concat(type, "-consumption-").concat(turn, "-").concat(Date.now()),
        turn: turn,
        type: type,
        delta: -Math.abs(amount),
        reason: reason,
        timestamp: new Date().toISOString()
    });
}
function normalizeLedger(entries, limit) {
    return entries
        .filter(function (item) { return Number.isFinite(item.delta); })
        .slice(0, limit)
        .map(function (item) { return (__assign(__assign({}, item), { turn: Math.max(0, Math.trunc(item.turn)), delta: item.delta, timestamp: item.timestamp })); });
}
function serializeSupplyState(state) {
    return {
        inventory: state.inventory,
        pending: state.pending,
        productionRate: state.productionRate,
        ledger: state.ledger,
        lastUpdatedTurn: state.lastUpdatedTurn
    };
}
function restoreSupplyState(snapshot, fallback) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (!snapshot || !snapshot.inventory) {
        return createSupplyState({ baseline: fallback.baseline, bonus: fallback.bonus });
    }
    var inventory = createInventory(fallback.baseline, fallback.bonus);
    Object.keys(inventory).forEach(function (key) {
        var source = snapshot.inventory[key];
        if (!source) {
            return;
        }
        inventory[key] = {
            current: Number.isFinite(source.current) ? Number(source.current) : inventory[key].current,
            baseline: Number.isFinite(source.baseline) ? Number(source.baseline) : inventory[key].baseline,
            bonus: Number.isFinite(source.bonus) ? Number(source.bonus) : inventory[key].bonus
        };
    });
    return {
        inventory: inventory,
        pending: Array.isArray(snapshot.pending) ? __spreadArray([], snapshot.pending, true) : [],
        productionRate: {
            rations: (_b = (_a = snapshot.productionRate) === null || _a === void 0 ? void 0 : _a.rations) !== null && _b !== void 0 ? _b : 0,
            fuel: (_d = (_c = snapshot.productionRate) === null || _c === void 0 ? void 0 : _c.fuel) !== null && _d !== void 0 ? _d : 0,
            ammo: (_f = (_e = snapshot.productionRate) === null || _e === void 0 ? void 0 : _e.ammo) !== null && _f !== void 0 ? _f : 0,
            parts: (_h = (_g = snapshot.productionRate) === null || _g === void 0 ? void 0 : _g.parts) !== null && _h !== void 0 ? _h : 0
        },
        ledger: Array.isArray(snapshot.ledger) ? normalizeLedger(snapshot.ledger, 50) : [],
        lastUpdatedTurn: Number.isFinite(snapshot.lastUpdatedTurn) ? Number(snapshot.lastUpdatedTurn) : 0
    };
}
function updateBaselineBonus(state, baseline, bonus) {
    Object.keys(state.inventory).forEach(function (key) {
        var _a, _b;
        var entry = state.inventory[key];
        entry.baseline = (_a = baseline[key]) !== null && _a !== void 0 ? _a : entry.baseline;
        entry.bonus = (_b = bonus[key]) !== null && _b !== void 0 ? _b : entry.bonus;
    });
}
function recalcCurrentFromBaseline(state) {
    Object.keys(state.inventory).forEach(function (key) {
        var entry = state.inventory[key];
        entry.current = Math.max(0, entry.baseline + entry.bonus);
    });
}
function setProductionRate(state, rates) {
    Object.keys(state.productionRate).forEach(function (key) {
        if (typeof rates[key] === "number") {
            state.productionRate[key] = Number(rates[key]);
        }
    });
}
function scheduleShipment(state, shipment) {
    state.pending.push(shipment);
    state.pending.sort(function (a, b) { return a.etaTurn - b.etaTurn; });
}
function advanceShipments(state, currentTurn) {
    var ready = [];
    state.pending = state.pending.filter(function (shipment) {
        if (shipment.etaTurn <= currentTurn) {
            ready.push(shipment);
            return false;
        }
        return true;
    });
    return ready;
}
function accumulateProduction(state, fromTurn, toTurn) {
    if (toTurn <= fromTurn) {
        return [];
    }
    var shipments = [];
    var turnsElapsed = toTurn - fromTurn;
    Object.keys(state.productionRate).forEach(function (key) {
        var rate = state.productionRate[key];
        if (rate <= 0) {
            return;
        }
        var amount = rate * turnsElapsed;
        if (amount <= 0) {
            return;
        }
        shipments.push({
            id: "".concat(key, "-production-").concat(toTurn, "-").concat(Date.now()),
            type: key,
            etaTurn: toTurn,
            amount: amount,
            source: ["base production"]
        });
    });
    return shipments;
}
function enforceLedgerLimit(state, limit) {
    state.ledger = normalizeLedger(state.ledger, limit);
}
function getInventoryTotals(state, keys) {
    return keys.reduce(function (totals, key) {
        var _a, _b;
        totals[key] = (_b = (_a = state.inventory[key]) === null || _a === void 0 ? void 0 : _a.current) !== null && _b !== void 0 ? _b : 0;
        return totals;
    }, Object.create(null));
}
