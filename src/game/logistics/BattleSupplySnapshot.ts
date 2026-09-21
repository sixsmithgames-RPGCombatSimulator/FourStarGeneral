import type { ScenarioUnit } from "../../core/types";
import {
  getInventoryTotals,
  type SupplyLedgerEntry,
  type SupplyState
} from "../../core/SupplyState";
import type { BattlePhase, TurnFaction } from "../battle/BattleRuntimeTypes";

/** Number of observations retained in the supplies-panel trend projection. */
const SUPPLY_TREND_WINDOW = 4;

/** Consumable resource pools surfaced in the battle supplies view. */
export type SupplyResourceKey = "ammo" | "fuel" | "medical" | "emergency";

/** Aggregated status of one supply category at a battle observation boundary. */
export interface SupplyCategorySnapshot {
  resource: SupplyResourceKey;
  label: string;
  total: number;
  frontlineTotal: number;
  reserveTotal: number;
  stockpileTotal: number;
  averagePerUnit: number;
  consumptionPerTurn: number;
  estimatedDepletionTurns: number | null;
  trend: number[];
  status: "stable" | "warning" | "critical" | "unknown";
  notes?: string;
}

/** Structured warning or informational message derived from supply posture. */
export interface SupplyAlert {
  resource: SupplyResourceKey;
  level: "info" | "warning" | "critical";
  message: string;
}

/** Read-only projection of a faction's supply posture at a specific turn. */
export interface SupplySnapshot {
  faction: TurnFaction;
  turn: number;
  phase: BattlePhase;
  updatedAt: string;
  categories: SupplyCategorySnapshot[];
  alerts: SupplyAlert[];
  stockpile: {
    ammo: number;
    fuel: number;
    rations: number;
    parts: number;
  };
  readonly ledger: readonly SupplyLedgerEntry[];
}

/** Complete immutable input required to project battle supply reporting. */
export interface BattleSupplySnapshotInput {
  readonly faction: TurnFaction;
  readonly turn: number;
  readonly phase: BattlePhase;
  readonly frontlineUnits: readonly ScenarioUnit[];
  readonly reserveUnits: readonly ScenarioUnit[];
  readonly history: readonly SupplySnapshot[];
  readonly supplyState: SupplyState;
}

type TrackedResource = Extract<SupplyResourceKey, "ammo" | "fuel">;

function composeTrackedCategory(
  resource: TrackedResource,
  label: string,
  frontlineUnits: readonly ScenarioUnit[],
  reserveUnits: readonly ScenarioUnit[],
  history: readonly SupplySnapshot[],
  totalUnits: number,
  stockpileDepot: number
): SupplyCategorySnapshot {
  const frontlineTotal = frontlineUnits.reduce<number>((sum, unit) => sum + (unit[resource] ?? 0), 0);
  const reserveTotal = reserveUnits.reduce<number>((sum, unit) => sum + (unit[resource] ?? 0), 0);
  const total = frontlineTotal + reserveTotal;
  const previousSnapshot = history.length > 0 ? history[history.length - 1] : undefined;
  const previous = previousSnapshot?.categories.find((category) => category.resource === resource);
  const rawConsumption = previous ? previous.total - total : 0;
  const consumptionPerTurn = Number(rawConsumption.toFixed(2));
  const estimatedDepletionTurns = consumptionPerTurn > 0
    ? Number((total / consumptionPerTurn).toFixed(1))
    : null;
  const priorTrendCount = SUPPLY_TREND_WINDOW - 1;
  const trendHistory = priorTrendCount > 0 ? history.slice(-priorTrendCount) : [];
  const trend = trendHistory
    .map((entry) => entry.categories.find((category) => category.resource === resource)?.total ?? 0)
    .concat(total);
  const averagePerUnit = totalUnits === 0 ? 0 : Number((total / totalUnits).toFixed(2));

  let status: SupplyCategorySnapshot["status"] = "stable";
  if (totalUnits === 0) {
    status = "unknown";
  } else if (total <= totalUnits) {
    status = "critical";
  } else if (total <= totalUnits * 2) {
    status = "warning";
  }
  if (estimatedDepletionTurns !== null) {
    if (estimatedDepletionTurns <= 1) {
      status = "critical";
    } else if (estimatedDepletionTurns <= 3 && status !== "critical") {
      status = "warning";
    }
  }
  // Preserve the established projection rule: a non-depleting stock is stable even when its absolute total is low.
  if (total > 0 && consumptionPerTurn <= 0) {
    status = "stable";
  }

  return {
    resource,
    label,
    total,
    frontlineTotal,
    reserveTotal,
    stockpileTotal: stockpileDepot,
    averagePerUnit,
    consumptionPerTurn,
    estimatedDepletionTurns,
    trend,
    status
  };
}

function buildSupplyCategories(input: BattleSupplySnapshotInput): SupplyCategorySnapshot[] {
  const totalUnits = input.frontlineUnits.length + input.reserveUnits.length;
  const stockpileTotals = {
    ammo: Math.max(0, Math.round(input.supplyState.inventory.ammo.current)),
    fuel: Math.max(0, Math.round(input.supplyState.inventory.fuel.current))
  };
  const ammoCategory = composeTrackedCategory(
    "ammo",
    "Ammunition",
    input.frontlineUnits,
    input.reserveUnits,
    input.history,
    totalUnits,
    stockpileTotals.ammo
  );
  const fuelCategory = composeTrackedCategory(
    "fuel",
    "Fuel",
    input.frontlineUnits,
    input.reserveUnits,
    input.history,
    totalUnits,
    stockpileTotals.fuel
  );
  const priorTrendCount = SUPPLY_TREND_WINDOW - 1;

  const medicalCategory: SupplyCategorySnapshot = {
    resource: "medical",
    label: "Field Medical",
    total: 0,
    frontlineTotal: 0,
    reserveTotal: 0,
    stockpileTotal: 0,
    averagePerUnit: 0,
    consumptionPerTurn: 0,
    estimatedDepletionTurns: null,
    trend: input.history
      .slice(-priorTrendCount)
      .map((entry) => entry.categories.find((category) => category.resource === "medical")?.total ?? 0)
      .concat(0),
    status: "unknown",
    notes: input.faction === "Player"
      ? "Medical logistics tracking is pending implementation."
      : "Enemy medical reserves unavailable without recon confirmation."
  };

  const emergencyCategory: SupplyCategorySnapshot = {
    resource: "emergency",
    label: "Emergency Reserve",
    total: 0,
    frontlineTotal: 0,
    reserveTotal: 0,
    stockpileTotal: 0,
    averagePerUnit: 0,
    consumptionPerTurn: 0,
    estimatedDepletionTurns: null,
    trend: input.history
      .slice(-priorTrendCount)
      .map((entry) => entry.categories.find((category) => category.resource === "emergency")?.total ?? 0)
      .concat(0),
    status: "unknown",
    notes: input.faction === "Player"
      ? "Emergency caches are placeholders until logistics production is wired."
      : "Enemy emergency stores cannot be estimated with current intel."
  };

  return [ammoCategory, fuelCategory, medicalCategory, emergencyCategory];
}

function deriveSupplyAlerts(
  categories: readonly SupplyCategorySnapshot[],
  faction: TurnFaction
): SupplyAlert[] {
  const alerts: SupplyAlert[] = [];
  categories.forEach((category) => {
    if (category.resource === "medical" || category.resource === "emergency") {
      if (category.status === "unknown") {
        alerts.push({
          resource: category.resource,
          level: "info",
          message: category.notes
            ?? (faction === "Player"
              ? "Medical and emergency inventories are pending future integration."
              : "Enemy emergency reserves require higher intel confidence.")
        });
      }
      return;
    }

    if (category.status === "critical") {
      const turns = category.estimatedDepletionTurns ?? 0;
      alerts.push({
        resource: category.resource,
        level: "critical",
        message: `${category.label} projected to run dry in ${turns <= 0 ? "under one" : turns} turns.`
      });
    } else if (category.status === "warning") {
      alerts.push({
        resource: category.resource,
        level: "warning",
        message: `${category.label} reserves trending low; resupply within the next few turns.`
      });
    } else if (category.consumptionPerTurn <= 0 && category.total > 0) {
      alerts.push({
        resource: category.resource,
        level: "info",
        message: `${category.label} consumption stabilized after recent resupply.`
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
}

/**
 * Builds a deterministic supply read model without mutating units, history, or depot state.
 */
export function buildBattleSupplySnapshot(input: BattleSupplySnapshotInput): SupplySnapshot {
  const categories = buildSupplyCategories(input);
  const depotTotals = getInventoryTotals(input.supplyState, ["ammo", "fuel", "rations", "parts"]);

  return {
    faction: input.faction,
    turn: input.turn,
    phase: input.phase,
    updatedAt: new Date(Date.UTC(2000, 0, 1) + (Math.max(0, input.turn) * 1_000_000)).toISOString(),
    categories,
    alerts: deriveSupplyAlerts(categories, input.faction),
    stockpile: {
      ammo: depotTotals.ammo ?? 0,
      fuel: depotTotals.fuel ?? 0,
      rations: depotTotals.rations ?? 0,
      parts: depotTotals.parts ?? 0
    },
    ledger: input.supplyState.ledger.map((entry) => ({ ...entry }))
  };
}
