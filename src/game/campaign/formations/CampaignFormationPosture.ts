/**
 * MODULE: CampaignFormationPosture
 * WHAT: Projects one mutually exclusive operational posture from authoritative formation state.
 * WHY: Map, inspector, planner, and reports must not independently reinterpret presence as readiness.
 */

import type { CampaignFormationRecord } from "./campaignFormationTypes";

/** Player-facing operational groups. Each live formation belongs to exactly one. */
export type CampaignFormationOperationalPosture =
  | "scheduledArrival"
  | "ready"
  | "awaitingPlacement"
  | "assigned"
  | "committed"
  | "inTransit"
  | "isolated"
  | "refitting"
  | "shattered"
  | "retired";

export interface CampaignFormationPostureProjection {
  readonly posture: CampaignFormationOperationalPosture;
  readonly label: string;
  readonly presentAtLocation: boolean;
  readonly canReceiveOrders: boolean;
  readonly blockingReason: string | null;
  /** Numeric condition is deliberately labeled readiness, never shortened to the ambiguous word "ready". */
  readonly readinessLabel: string;
}

type PostureSource = Pick<
  CampaignFormationRecord,
  "status" | "locationHexKey" | "retiredSegment" | "currentOrderId" | "readiness"
>;

function projection(
  formation: PostureSource,
  posture: CampaignFormationOperationalPosture,
  label: string,
  presentAtLocation: boolean,
  canReceiveOrders: boolean,
  blockingReason: string | null
): CampaignFormationPostureProjection {
  return Object.freeze({
    posture,
    label,
    presentAtLocation,
    canReceiveOrders,
    blockingReason,
    readinessLabel: `Readiness ${Math.max(0, Math.min(100, Math.round(formation.readiness)))}%`
  });
}

/**
 * Returns the sole authoritative posture grouping for a persistent campaign formation.
 * Status owns lifecycle truth; an active order only distinguishes ready-but-assigned from orderable readiness.
 */
export function projectCampaignFormationPosture(
  formation: PostureSource
): CampaignFormationPostureProjection {
  const placed = formation.locationHexKey !== null && formation.retiredSegment === null;
  switch (formation.status) {
    case "unavailable":
      return projection(formation, "scheduledArrival", "Scheduled arrival", false, false,
        "This formation has not entered the operational order of battle.");
    case "ready":
      if (formation.currentOrderId) {
        return projection(formation, "assigned", "Assigned", placed, false,
          "This formation is already assigned to an order.");
      }
      if (!placed) {
        return projection(formation, "awaitingPlacement", "Awaiting placement", false, false,
          "This formation must receive an operational placement before it can receive orders.");
      }
      return projection(formation, "ready", "Ready now", true, true, null);
    case "committed":
      return projection(formation, "committed", "Committed", placed, false,
        "This formation is committed to an operation or engagement.");
    case "inTransit":
      return projection(formation, "inTransit", "In transit", false, false,
        "This formation is moving and is not present at its recorded destination.");
    case "isolated":
      return projection(formation, "isolated", "Isolated", placed, false,
        "This formation is isolated from a friendly supply path.");
    case "refitting":
      return projection(formation, "refitting", "Refitting", placed, false,
        "This formation is refitting and cannot receive a new order.");
    case "shattered":
      return projection(formation, "shattered", "Shattered", placed, false,
        "This formation must recover or reconstitute before receiving combat or redeployment orders.");
    case "destroyed":
      return projection(formation, "retired", "Destroyed", false, false,
        "This formation has been destroyed.");
    case "captured":
      return projection(formation, "retired", "Captured", false, false,
        "This formation is no longer available to command.");
  }
}

/** Stable grouping order for inspectors, summaries, and deterministic diagnostics. */
export const CAMPAIGN_FORMATION_POSTURE_ORDER: readonly CampaignFormationOperationalPosture[] = Object.freeze([
  "ready",
  "awaitingPlacement",
  "assigned",
  "committed",
  "inTransit",
  "isolated",
  "refitting",
  "shattered",
  "scheduledArrival",
  "retired"
]);

/** Builds exact posture counts without collapsing unavailable states into a misleading aggregate. */
export function summarizeCampaignFormationPostures(
  formations: readonly PostureSource[]
): Readonly<Record<CampaignFormationOperationalPosture, number>> {
  const counts: Record<CampaignFormationOperationalPosture, number> = {
    scheduledArrival: 0,
    ready: 0,
    awaitingPlacement: 0,
    assigned: 0,
    committed: 0,
    inTransit: 0,
    isolated: 0,
    refitting: 0,
    shattered: 0,
    retired: 0
  };
  formations.forEach((formation) => {
    counts[projectCampaignFormationPosture(formation).posture] += 1;
  });
  return Object.freeze(counts);
}
