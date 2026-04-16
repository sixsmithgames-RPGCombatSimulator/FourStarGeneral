/**
 * Creates a new inventory object with the given baseline and bonus values.
 */
export function createInventory(baseline, bonus) {
    const seed = {
        rations: { current: 0, baseline: 0, bonus: 0 },
        fuel: { current: 0, baseline: 0, bonus: 0 },
        ammo: { current: 0, baseline: 0, bonus: 0 },
        parts: { current: 0, baseline: 0, bonus: 0 }
    };
    Object.keys(seed).forEach((key) => {
        const base = baseline[key] ?? 0;
        const extra = bonus?.[key] ?? 0;
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
export function createSupplyState(params) {
    return {
        inventory: createInventory(params.baseline, params.bonus),
        pending: [...(params.pending ?? [])],
        productionRate: {
            rations: params.productionRate?.rations ?? 0,
            fuel: params.productionRate?.fuel ?? 0,
            ammo: params.productionRate?.ammo ?? 0,
            parts: params.productionRate?.parts ?? 0
        },
        ledger: [...(params.ledger ?? [])],
        lastUpdatedTurn: params.lastUpdatedTurn ?? 0
    };
}
export function applyShipment(state, shipment, turn) {
    const entry = state.inventory[shipment.type];
    entry.current += shipment.amount;
    state.ledger.unshift({
        id: shipment.id,
        turn,
        type: shipment.type,
        delta: shipment.amount,
        reason: shipment.source.join(", "),
        timestamp: new Date().toISOString()
    });
}
export function recordConsumption(state, type, amount, turn, reason) {
    const entry = state.inventory[type];
    entry.current = Math.max(0, entry.current - amount);
    state.ledger.unshift({
        id: `${type}-consumption-${turn}-${Date.now()}`,
        turn,
        type,
        delta: -Math.abs(amount),
        reason,
        timestamp: new Date().toISOString()
    });
}
export function normalizeLedger(entries, limit) {
    return entries
        .filter((item) => Number.isFinite(item.delta))
        .slice(0, limit)
        .map((item) => ({
        ...item,
        turn: Math.max(0, Math.trunc(item.turn)),
        delta: item.delta,
        timestamp: item.timestamp
    }));
}
export function serializeSupplyState(state) {
    return {
        inventory: state.inventory,
        pending: state.pending,
        productionRate: state.productionRate,
        ledger: state.ledger,
        lastUpdatedTurn: state.lastUpdatedTurn
    };
}
export function restoreSupplyState(snapshot, fallback) {
    if (!snapshot || !snapshot.inventory) {
        return createSupplyState({ baseline: fallback.baseline, bonus: fallback.bonus });
    }
    const inventory = createInventory(fallback.baseline, fallback.bonus);
    Object.keys(inventory).forEach((key) => {
        const source = snapshot.inventory[key];
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
        inventory,
        pending: Array.isArray(snapshot.pending) ? [...snapshot.pending] : [],
        productionRate: {
            rations: snapshot.productionRate?.rations ?? 0,
            fuel: snapshot.productionRate?.fuel ?? 0,
            ammo: snapshot.productionRate?.ammo ?? 0,
            parts: snapshot.productionRate?.parts ?? 0
        },
        ledger: Array.isArray(snapshot.ledger) ? normalizeLedger(snapshot.ledger, 50) : [],
        lastUpdatedTurn: Number.isFinite(snapshot.lastUpdatedTurn) ? Number(snapshot.lastUpdatedTurn) : 0
    };
}
export function updateBaselineBonus(state, baseline, bonus) {
    Object.keys(state.inventory).forEach((key) => {
        const entry = state.inventory[key];
        entry.baseline = baseline[key] ?? entry.baseline;
        entry.bonus = bonus[key] ?? entry.bonus;
    });
}
export function recalcCurrentFromBaseline(state) {
    Object.keys(state.inventory).forEach((key) => {
        const entry = state.inventory[key];
        entry.current = Math.max(0, entry.baseline + entry.bonus);
    });
}
export function setProductionRate(state, rates) {
    Object.keys(state.productionRate).forEach((key) => {
        if (typeof rates[key] === "number") {
            state.productionRate[key] = Number(rates[key]);
        }
    });
}
export function scheduleShipment(state, shipment) {
    state.pending.push(shipment);
    state.pending.sort((a, b) => a.etaTurn - b.etaTurn);
}
export function advanceShipments(state, currentTurn) {
    const ready = [];
    state.pending = state.pending.filter((shipment) => {
        if (shipment.etaTurn <= currentTurn) {
            ready.push(shipment);
            return false;
        }
        return true;
    });
    return ready;
}
export function accumulateProduction(state, fromTurn, toTurn) {
    if (toTurn <= fromTurn) {
        return [];
    }
    const shipments = [];
    const turnsElapsed = toTurn - fromTurn;
    Object.keys(state.productionRate).forEach((key) => {
        const rate = state.productionRate[key];
        if (rate <= 0) {
            return;
        }
        const amount = rate * turnsElapsed;
        if (amount <= 0) {
            return;
        }
        shipments.push({
            id: `${key}-production-${toTurn}-${Date.now()}`,
            type: key,
            etaTurn: toTurn,
            amount,
            source: ["base production"]
        });
    });
    return shipments;
}
export function enforceLedgerLimit(state, limit) {
    state.ledger = normalizeLedger(state.ledger, limit);
}
export function getInventoryTotals(state, keys) {
    return keys.reduce((totals, key) => {
        totals[key] = state.inventory[key]?.current ?? 0;
        return totals;
    }, Object.create(null));
}
