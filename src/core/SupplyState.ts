/**
 * Supply state primitives isolate inventory math and persistence from the UI layer. The precombat
 * screen, battle sidebar, and future automation hooks can all rely on these helpers without
 * duplicating data-shaping logic.
 */
export type SupplyKey = "rations" | "fuel" | "ammo" | "parts";

/**
 * Tracks the live, baseline, and bonus portions of a single stock category.
 */
export type SupplyInventoryEntry = {
  /**
   * The current quantity of the supply item.
   */
  current: number;
  /**
   * The baseline quantity of the supply item, unaffected by bonuses.
   */
  baseline: number;
  /**
   * The bonus quantity of the supply item, added to the baseline.
   */
  bonus: number;
};

/**
 * A collection of supply inventory entries, keyed by supply type.
 */
export type SupplyInventory = Record<SupplyKey, SupplyInventoryEntry>;

/**
 * Pending shipments are queued with an ETA in battle turns and a simple provenance list for UI copy.
 */
export type SupplyShipment = {
  /**
   * A unique identifier for the shipment.
   */
  id: string;
  /**
   * The type of supply being shipped.
   */
  type: SupplyKey;
  /**
   * The turn number when the shipment is expected to arrive.
   */
  etaTurn: number;
  /**
   * The quantity of the supply being shipped.
   */
  amount: number;
  /**
   * A list of sources for the shipment, used for UI display.
   */
  source: readonly string[];
};

/**
 * Ledger entries allow commanders to audit inflow/outflow over recent turns.
 */
export type SupplyLedgerEntry = {
  /**
   * A unique identifier for the ledger entry.
   */
  id: string;
  /**
   * The turn number when the ledger entry was created.
   */
  turn: number;
  /**
   * The type of supply affected by the ledger entry.
   */
  type: SupplyKey;
  /**
   * The change in quantity of the supply, positive for additions and negative for subtractions.
   */
  delta: number;
  /**
   * A brief description of the reason for the ledger entry.
   */
  reason: string;
  /**
   * A timestamp for when the ledger entry was created.
   */
  timestamp: string;
};

/**
 * The core supply state object, containing inventory, pending shipments, production rates, and a ledger.
 */
export type SupplyState = {
  /**
   * The current inventory of supplies.
   */
  inventory: SupplyInventory;
  /**
   * A list of pending shipments, sorted by ETA.
   */
  pending: SupplyShipment[];
  /**
   * The production rates for each supply type.
   */
  productionRate: Record<SupplyKey, number>;
  /**
   * A list of recent ledger entries.
   */
  ledger: SupplyLedgerEntry[];
  /**
   * The last turn number when the supply state was updated.
   */
  lastUpdatedTurn: number;
};

/**
 * A snapshot of the supply state, used for serialization and deserialization.
 */
export type SupplyStateSnapshot = {
  /**
   * The current inventory of supplies.
   */
  inventory: Record<SupplyKey, SupplyInventoryEntry>;
  /**
   * A list of pending shipments, sorted by ETA.
   */
  pending: SupplyShipment[];
  /**
   * The production rates for each supply type.
   */
  productionRate: Record<SupplyKey, number>;
  /**
   * A list of recent ledger entries.
   */
  ledger: SupplyLedgerEntry[];
  /**
   * The last turn number when the supply state was updated.
   */
  lastUpdatedTurn: number;
};

/**
 * Creates a new inventory object with the given baseline and bonus values.
 */
export function createInventory(
  baseline: Record<SupplyKey, number>,
  bonus?: Record<SupplyKey, number>
): SupplyInventory {
  const seed: SupplyInventory = {
    rations: { current: 0, baseline: 0, bonus: 0 },
    fuel: { current: 0, baseline: 0, bonus: 0 },
    ammo: { current: 0, baseline: 0, bonus: 0 },
    parts: { current: 0, baseline: 0, bonus: 0 }
  };
  (Object.keys(seed) as SupplyKey[]).forEach((key) => {
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
export function createSupplyState(params: {
  baseline: Record<SupplyKey, number>;
  bonus?: Record<SupplyKey, number>;
  productionRate?: Record<SupplyKey, number>;
  lastUpdatedTurn?: number;
  pending?: SupplyShipment[];
  ledger?: SupplyLedgerEntry[];
}): SupplyState {
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

export function applyShipment(state: SupplyState, shipment: SupplyShipment, turn: number): void {
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

export function recordConsumption(
  state: SupplyState,
  type: SupplyKey,
  amount: number,
  turn: number,
  reason: string
): void {
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

export function normalizeLedger(entries: SupplyLedgerEntry[], limit: number): SupplyLedgerEntry[] {
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

export function serializeSupplyState(state: SupplyState): SupplyStateSnapshot {
  return {
    inventory: state.inventory,
    pending: state.pending,
    productionRate: state.productionRate,
    ledger: state.ledger,
    lastUpdatedTurn: state.lastUpdatedTurn
  };
}

export function restoreSupplyState(
  snapshot: SupplyStateSnapshot,
  fallback: { baseline: Record<SupplyKey, number>; bonus?: Record<SupplyKey, number> }
): SupplyState {
  if (!snapshot || !snapshot.inventory) {
    return createSupplyState({ baseline: fallback.baseline, bonus: fallback.bonus });
  }
  const inventory = createInventory(fallback.baseline, fallback.bonus);
  (Object.keys(inventory) as SupplyKey[]).forEach((key) => {
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

export function updateBaselineBonus(
  state: SupplyState,
  baseline: Record<SupplyKey, number>,
  bonus: Record<SupplyKey, number>
): void {
  (Object.keys(state.inventory) as SupplyKey[]).forEach((key) => {
    const entry = state.inventory[key];
    entry.baseline = baseline[key] ?? entry.baseline;
    entry.bonus = bonus[key] ?? entry.bonus;
  });
}

export function recalcCurrentFromBaseline(state: SupplyState): void {
  (Object.keys(state.inventory) as SupplyKey[]).forEach((key) => {
    const entry = state.inventory[key];
    entry.current = Math.max(0, entry.baseline + entry.bonus);
  });
}

export function setProductionRate(state: SupplyState, rates: Partial<Record<SupplyKey, number>>): void {
  (Object.keys(state.productionRate) as SupplyKey[]).forEach((key) => {
    if (typeof rates[key] === "number") {
      state.productionRate[key] = Number(rates[key]);
    }
  });
}

export function scheduleShipment(state: SupplyState, shipment: SupplyShipment): void {
  state.pending.push(shipment);
  state.pending.sort((a, b) => a.etaTurn - b.etaTurn);
}

export function advanceShipments(state: SupplyState, currentTurn: number): SupplyShipment[] {
  const ready: SupplyShipment[] = [];
  state.pending = state.pending.filter((shipment) => {
    if (shipment.etaTurn <= currentTurn) {
      ready.push(shipment);
      return false;
    }
    return true;
  });
  return ready;
}

export function accumulateProduction(state: SupplyState, fromTurn: number, toTurn: number): SupplyShipment[] {
  if (toTurn <= fromTurn) {
    return [];
  }
  const shipments: SupplyShipment[] = [];
  const turnsElapsed = toTurn - fromTurn;
  (Object.keys(state.productionRate) as SupplyKey[]).forEach((key) => {
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

export function enforceLedgerLimit(state: SupplyState, limit: number): void {
  state.ledger = normalizeLedger(state.ledger, limit);
}

export function getInventoryTotals(state: SupplyState, keys: SupplyKey[]): Record<SupplyKey, number> {
  return keys.reduce<Record<SupplyKey, number>>((totals, key) => {
    totals[key] = state.inventory[key]?.current ?? 0;
    return totals;
  }, Object.create(null));
}
