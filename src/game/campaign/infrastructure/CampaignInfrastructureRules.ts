/**
 * MODULE: CampaignInfrastructureRules
 * WHAT: Creates, normalizes, and evaluates persistent campaign installation condition and capacity.
 * WHY: Damage, capture, repair, logistics, tactical generation, AI, and UI must share one facility truth.
 */

import type {
  CampaignInfrastructureDamageState,
  CampaignInfrastructureState,
  CampaignTileRole
} from "../../../core/campaignTypes";
import type { CampaignRuntimeState, CampaignTileRuntime } from "../runtime/campaignRuntimeTypes";

const INFRASTRUCTURE_ROLES = new Set<CampaignTileRole>([
  "airbase",
  "navalBase",
  "taskForce",
  "logisticsHub",
  "supplyRoute",
  "intelNode",
  "fortificationHeavy",
  "fortificationLight"
]);

const DEFAULT_MAX_INTEGRITY: Readonly<Partial<Record<CampaignTileRole, number>>> = Object.freeze({
  airbase: 120,
  navalBase: 140,
  logisticsHub: 110,
  supplyRoute: 80,
  intelNode: 80,
  fortificationHeavy: 160,
  fortificationLight: 100
});

const DEFAULT_REPAIR_RATE: Readonly<Partial<Record<CampaignTileRole, number>>> = Object.freeze({
  airbase: 6,
  navalBase: 5,
  logisticsHub: 8,
  supplyRoute: 12,
  intelNode: 10,
  fortificationHeavy: 5,
  fortificationLight: 8
});

export const CAMPAIGN_INFRASTRUCTURE_CAPTURE_DISRUPTION_SEGMENTS = 8;
export const CAMPAIGN_INFRASTRUCTURE_CAPTURE_CAPACITY_CEILING = 0.5;

export interface CampaignInfrastructureDefinition {
  readonly role: CampaignTileRole;
  readonly infrastructureMaxIntegrity?: number;
  readonly infrastructureRepairRate?: number;
}

export function campaignRoleHasInfrastructure(role: CampaignTileRole): boolean {
  return INFRASTRUCTURE_ROLES.has(role);
}

export function campaignInfrastructureMaxIntegrity(definition: CampaignInfrastructureDefinition): number {
  const authored = definition.infrastructureMaxIntegrity;
  if (typeof authored === "number" && Number.isInteger(authored) && authored > 0) return authored;
  return DEFAULT_MAX_INTEGRITY[definition.role] ?? 100;
}

export function campaignInfrastructureRepairRate(definition: CampaignInfrastructureDefinition): number {
  const authored = definition.infrastructureRepairRate;
  if (typeof authored === "number" && Number.isInteger(authored) && authored > 0) return authored;
  return DEFAULT_REPAIR_RATE[definition.role] ?? 8;
}

export function deriveCampaignInfrastructureDamageState(
  integrity: number,
  maxIntegrity: number
): CampaignInfrastructureDamageState {
  if (integrity <= 0) return "destroyed";
  const ratio = integrity / Math.max(1, maxIntegrity);
  if (ratio >= 1) return "intact";
  if (ratio >= 0.7) return "damaged";
  if (ratio >= 0.4) return "breached";
  return "severelyDamaged";
}

export function computeCampaignInfrastructureEffectiveness(
  integrity: number,
  maxIntegrity: number,
  currentSegment: number,
  disruptionUntilSegment: number | null
): number {
  const structural = Math.max(0, Math.min(1, integrity / Math.max(1, maxIntegrity)));
  return disruptionUntilSegment !== null && currentSegment < disruptionUntilSegment
    ? Math.min(structural, CAMPAIGN_INFRASTRUCTURE_CAPTURE_CAPACITY_CEILING)
    : structural;
}

export function refreshCampaignInfrastructureState(
  infrastructure: CampaignInfrastructureState,
  currentSegment: number
): void {
  infrastructure.integrity = Math.max(0, Math.min(infrastructure.maxIntegrity, Math.round(infrastructure.integrity)));
  if (infrastructure.captureDisruptionUntilSegment !== null
    && currentSegment >= infrastructure.captureDisruptionUntilSegment) {
    infrastructure.captureDisruptionUntilSegment = null;
  }
  infrastructure.damageState = deriveCampaignInfrastructureDamageState(
    infrastructure.integrity,
    infrastructure.maxIntegrity
  );
  infrastructure.disabled = infrastructure.integrity <= 0;
  infrastructure.effectiveness = computeCampaignInfrastructureEffectiveness(
    infrastructure.integrity,
    infrastructure.maxIntegrity,
    currentSegment,
    infrastructure.captureDisruptionUntilSegment
  );
}

export function createCampaignInfrastructureState(
  definition: CampaignInfrastructureDefinition,
  currentSegment: number,
  seed?: CampaignInfrastructureState
): CampaignInfrastructureState | undefined {
  if (!campaignRoleHasInfrastructure(definition.role)) return undefined;
  const maxIntegrity = campaignInfrastructureMaxIntegrity(definition);
  const infrastructure: CampaignInfrastructureState = seed ? {
    ...structuredClone(seed),
    role: definition.role,
    maxIntegrity,
    integrity: Math.max(0, Math.min(maxIntegrity, Math.round(seed.integrity)))
  } : {
    role: definition.role,
    maxIntegrity,
    integrity: maxIntegrity,
    damageState: "intact",
    effectiveness: 1,
    disabled: false,
    lastDamageSegment: null,
    lastRepairSegment: null,
    lastCapturedSegment: null,
    capturedFrom: null,
    capturedBy: null,
    captureDisruptionUntilSegment: null,
    activeRepairOrderId: null
  };
  refreshCampaignInfrastructureState(infrastructure, currentSegment);
  return infrastructure;
}

/** Adds infrastructure to old development runtimes and normalizes all current records in stable tile order. */
export function reconcileCampaignInfrastructure(
  runtime: CampaignRuntimeState,
  tilePalette: Readonly<Record<string, CampaignInfrastructureDefinition>>
): void {
  runtime.tileOrder.forEach((hexKey) => {
    const tile = runtime.tiles[hexKey];
    const definition = tile ? tilePalette[tile.tileKey] : null;
    if (!tile || !definition) return;
    const infrastructure = createCampaignInfrastructureState(
      definition,
      runtime.currentSegment,
      tile.infrastructure
    );
    if (infrastructure) tile.infrastructure = infrastructure;
    else delete tile.infrastructure;
  });
}

export function campaignTileCapacityFactor(tile: CampaignTileRuntime): number {
  return tile.infrastructure?.effectiveness ?? 1;
}

export function campaignInfrastructureRepairCosts(points: number): { supplies: number; manpower: number } {
  const normalized = Math.max(0, Math.ceil(points));
  return {
    supplies: normalized * 2,
    manpower: normalized * 4
  };
}
