import type { WarRoomDataKey } from "./warRoomTypes";

/**
 * Defines an interactive hotspot for the war room overlay.
 * Each hotspot represents a clickable area that displays specific war room data.
 */
export interface WarRoomHotspotDefinition {
  /** Unique identifier used for DOM data attributes and event handling. */
  id: string;
  /** Human-readable label displayed on the hotspot button. */
  label: string;
  /** Brief ARIA description for screen reader accessibility. */
  ariaDescription: string;
  /** Optional status message appended to screen-reader announcements. */
  statusAnnouncer?: string;
  /** Hotspot position and size expressed in percentage coordinates (0-100). */
  coords: {
    /** Left edge position as percentage of container width. */
    x: number;
    /** Top edge position as percentage of container height. */
    y: number;
    /** Width as percentage of container width. */
    width: number;
    /** Height as percentage of container height. */
    height: number;
  };
  /** Ordering hint for keyboard focus traversal (lower numbers focused first). */
  focusOrder: number;
  /** War room data key that this hotspot displays when clicked. */
  dataKey: WarRoomDataKey;
}

/**
 * War room hotspot definitions.
 * Each hotspot corresponds to a clickable area on the war room background image.
 * Coordinates are percentage-based to support responsive layouts.
 */
export const warRoomHotspotDefinitions: WarRoomHotspotDefinition[] = [
  {
    id: "intel-briefs",
    label: "Intelligence Briefs",
    ariaDescription: "Review current intelligence assessments and threat analysis",
    // Top-left photo board area on tent wall
    coords: { x: 6, y: 8, width: 22, height: 14 },
    focusOrder: 1,
    dataKey: "intelBriefs"
  },
  {
    id: "recon-reports",
    label: "Recon Reports",
    ariaDescription: "View reconnaissance findings from field operations",
    // Desk map spread at center-bottom
    coords: { x: 32, y: 58, width: 38, height: 20 },
    focusOrder: 2,
    dataKey: "reconReports"
  },
  {
    id: "supply-status",
    label: "Supply Status",
    ariaDescription: "Check current supply levels and resource availability",
    // Radio console at lower-right
    coords: { x: 78, y: 64, width: 16, height: 18 },
    focusOrder: 3,
    dataKey: "supplyStatus"
  },
  {
    id: "requisitions",
    label: "Requisitions",
    ariaDescription: "Review pending equipment and resource requests",
    // Folder stacks mid-left on desk
    coords: { x: 10, y: 38, width: 22, height: 14 },
    focusOrder: 4,
    dataKey: "requisitions"
  },
  {
    id: "casualty-ledger",
    label: "Casualty Ledger",
    ariaDescription: "Access casualty reports and loss statistics",
    // Ledger/books lower-left
    coords: { x: 6, y: 76, width: 24, height: 14 },
    focusOrder: 5,
    dataKey: "casualtyLedger"
  },
  {
    id: "engagement-log",
    label: "Engagement Log",
    ariaDescription: "Review recent combat engagements and outcomes",
    // Center desk documents above map
    coords: { x: 44, y: 42, width: 20, height: 12 },
    focusOrder: 6,
    dataKey: "engagementLog"
  },
  {
    id: "logistics-summary",
    label: "Logistics Summary",
    ariaDescription: "View comprehensive logistics and supply chain status",
    // Storage boxes near lamp area (mid-left)
    coords: { x: 28, y: 26, width: 24, height: 12 },
    focusOrder: 7,
    dataKey: "logisticsSummary"
  },
  {
    id: "command-orders",
    label: "Command Orders",
    ariaDescription: "Read current command directives and mission orders",
    // Orders paperwork on lower-right desk
    coords: { x: 62, y: 70, width: 22, height: 14 },
    focusOrder: 8,
    dataKey: "commandOrders"
  },
  {
    id: "readiness-state",
    label: "Readiness Status",
    ariaDescription: "Check overall force readiness and combat capability",
    // Lamp and central status area
    coords: { x: 44, y: 12, width: 16, height: 12 },
    focusOrder: 9,
    dataKey: "readinessState"
  },
  {
    id: "campaign-clock",
    label: "Campaign Timeline",
    ariaDescription: "View campaign progress and timing information",
    // Field telephone area mid-right (also stands in for ops timing)
    coords: { x: 74, y: 48, width: 16, height: 12 },
    focusOrder: 10,
    dataKey: "campaignClock"
  }
];

/**
 * Get all hotspots sorted by focus order.
 * Used by WarRoomOverlay to determine keyboard navigation sequence.
 * @returns Array of hotspot definitions sorted by focusOrder
 */
export function getHotspotsByFocusOrder(): WarRoomHotspotDefinition[] {
  return [...warRoomHotspotDefinitions].sort((a, b) => a.focusOrder - b.focusOrder);
}

/**
 * Find a hotspot definition by ID.
 * @param id - Hotspot identifier
 * @returns Hotspot definition or null if not found
 */
export function findHotspotById(id: string): WarRoomHotspotDefinition | null {
  return warRoomHotspotDefinitions.find(h => h.id === id) ?? null;
}

/**
 * Get all hotspot IDs.
 * Useful for validation and debugging.
 * @returns Array of hotspot IDs
 */
export function getAllHotspotIds(): string[] {
  return warRoomHotspotDefinitions.map(h => h.id);
}
