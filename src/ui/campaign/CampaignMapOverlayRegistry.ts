/** Stable, presentation-only registry for campaign map modes and truthful feature gates. */

import type { CampaignOverlayId, CampaignWorkspaceId } from "./CampaignCommandUIState";

export interface CampaignMapLegendEntry {
  readonly key: string;
  readonly symbol: string;
  readonly label: string;
  readonly tone: "friendly" | "enemy" | "warning" | "objective" | "neutral";
}

export interface CampaignMapOverlayDefinition {
  readonly id: CampaignOverlayId;
  readonly label: string;
  readonly shortLabel: string;
  readonly description: string;
  readonly status: "available" | "featureGated";
  readonly unavailableReason?: string;
  readonly legend: readonly CampaignMapLegendEntry[];
}

const OVERLAYS: readonly CampaignMapOverlayDefinition[] = Object.freeze([
  {
    id: "operational",
    label: "Operational",
    shortLabel: "OPS",
    description: "Control, fronts, friendly forces, installations, and assessed contacts.",
    status: "available",
    legend: [
      { key: "friendly", symbol: "■", label: "Friendly control", tone: "friendly" },
      { key: "contact", symbol: "◇", label: "Assessed contact", tone: "enemy" },
      { key: "front", symbol: "━", label: "Front", tone: "warning" }
    ]
  },
  {
    id: "objectives",
    label: "Objectives",
    shortLabel: "OBJ",
    description: "Published campaign objectives and the ground associated with them.",
    status: "available",
    legend: [
      { key: "objective", symbol: "◎", label: "Objective ground", tone: "objective" },
      { key: "selected", symbol: "▣", label: "Selected", tone: "friendly" }
    ]
  },
  {
    id: "forces",
    label: "Forces",
    shortLabel: "FOR",
    description: "Player-controlled force locations and map strength markers.",
    status: "available",
    legend: [
      { key: "force", symbol: "◆", label: "Friendly force", tone: "friendly" },
      { key: "count", symbol: "#", label: "Projected strength count", tone: "neutral" }
    ]
  },
  {
    id: "intelligence",
    label: "Intelligence",
    shortLabel: "INT",
    description: "Faction-safe assessed contacts, confidence, age, and collection coverage.",
    status: "available",
    legend: [
      { key: "current", symbol: "◇", label: "Current contact", tone: "enemy" },
      { key: "stale", symbol: "◈", label: "Stale or disputed", tone: "warning" },
      { key: "coverage", symbol: "▧", label: "Collection coverage filter", tone: "friendly" }
    ]
  },
  {
    id: "orders",
    label: "Orders",
    shortLabel: "ORD",
    description: "Player order targets and committed routes from the typed order projection.",
    status: "available",
    legend: [
      { key: "target", symbol: "◎", label: "Order target", tone: "objective" },
      { key: "route", symbol: "→", label: "Origin / destination", tone: "friendly" },
      { key: "conflict", symbol: "!", label: "Conflict", tone: "warning" }
    ]
  },
  {
    id: "supply",
    label: "Supply",
    shortLabel: "SUP",
    description: "Supply reach, flow, bottlenecks, and forecast demand.",
    status: "featureGated",
    unavailableReason: "The campaign does not yet publish a route-level supply-network projection.",
    legend: []
  },
  {
    id: "airNaval",
    label: "Air & Naval",
    shortLabel: "A/N",
    description: "Support range, readiness, capacity, weather, and mission commitments.",
    status: "featureGated",
    unavailableReason: "Air and naval mission-area projections arrive with the support-planning workspace.",
    legend: []
  },
  {
    id: "environment",
    label: "Environment",
    shortLabel: "WX",
    description: "Observed conditions and projected weather zones.",
    status: "featureGated",
    unavailableReason: "The environment layer requires the projected weather-zone service.",
    legend: []
  }
]);

const BY_ID = new Map(OVERLAYS.map((overlay) => [overlay.id, overlay] as const));

export function getCampaignMapOverlays(): readonly CampaignMapOverlayDefinition[] {
  return OVERLAYS;
}

export function getCampaignMapOverlay(id: CampaignOverlayId): CampaignMapOverlayDefinition {
  return BY_ID.get(id) ?? BY_ID.get("operational")!;
}

export function getAvailableCampaignMapOverlays(): readonly CampaignMapOverlayDefinition[] {
  return OVERLAYS.filter((overlay) => overlay.status === "available");
}

/** Returns a truthful workspace default; gated projections fall back to the operational picture. */
export function getCampaignWorkspaceDefaultOverlay(workspace: CampaignWorkspaceId): CampaignOverlayId {
  if (workspace === "forces") return "forces";
  if (workspace === "intelligence") return "intelligence";
  return "operational";
}
