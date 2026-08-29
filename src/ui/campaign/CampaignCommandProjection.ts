/** Small, pure adapters that keep runtime coordinate contracts out of campaign presentation components. */

import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import type { CampaignAfterActionDecisionTarget } from "../../game/campaign/aar/CampaignAfterActionReportTypes";

/** Converts the runtime's axial `q,r` identity into the campaign UI/map's offset `col,row` identity. */
export function projectRuntimeHexKeyToCampaignOffset(runtimeHexKey: string | null): string | null {
  if (!runtimeHexKey) return null;
  const coordinates = runtimeHexKey.split(",").map(Number);
  if (coordinates.length !== 2 || !coordinates.every(Number.isInteger)) return null;
  const offset = CoordinateSystem.axialToOffset(coordinates[0], coordinates[1]);
  return CoordinateSystem.makeHexKey(offset.col, offset.row);
}

/**
 * Keeps an immutable AAR's runtime identity out of player-facing fallback copy.
 * Objective-titled reports retain their authored title; coordinate-titled reports use the operational map key.
 */
export function projectCampaignAfterActionTitle(
  storedTitle: string,
  objectiveLabel: string | null,
  runtimeBattleHexKey: string
): string {
  if (objectiveLabel) return storedTitle;
  const operationalHexKey = projectRuntimeHexKeyToCampaignOffset(runtimeBattleHexKey);
  return operationalHexKey ? `After action: ${operationalHexKey}` : storedTitle;
}

/** Infrastructure decisions navigate the operational offset map; all other decision IDs retain domain identity. */
export function projectCampaignAfterActionDecisionTargetId(
  targetKind: CampaignAfterActionDecisionTarget,
  targetId: string | null
): string | null {
  if (targetKind !== "infrastructure" || targetId === null) return targetId;
  return projectRuntimeHexKeyToCampaignOffset(targetId);
}
