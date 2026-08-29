/** Small, pure adapters that keep runtime coordinate contracts out of campaign presentation components. */

import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import type { CampaignAfterActionDecisionTarget } from "../../game/campaign/aar/CampaignAfterActionReportTypes";

export interface CampaignAfterActionInfrastructureAuditView {
  readonly integrity: number;
  readonly maxIntegrity: number;
  readonly captureDisruptionUntilSegment: number | null;
}

export interface CampaignAfterActionInfrastructureEffectView {
  readonly roleLabel: string;
  readonly integrityBefore: number | null;
  readonly infrastructureAfter: CampaignAfterActionInfrastructureAuditView | null;
  readonly effectivenessAfter: number;
  readonly disruptionTimeLabel: string | null;
}

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

/**
 * Suppresses repair decisions written by the affected build only when the immutable battle audit
 * proves the installation was captured intact. Missing audit evidence preserves the decision.
 */
export function shouldPresentCampaignAfterActionDecision(
  targetKind: CampaignAfterActionDecisionTarget,
  title: string,
  infrastructureAfter: CampaignAfterActionInfrastructureAuditView | null
): boolean {
  const isReconstructionDecision = targetKind === "infrastructure"
    && (title === "Repair the battle area" || title === "Reconstruct the battle area");
  return !isReconstructionDecision
    || infrastructureAfter === null
    || infrastructureAfter.integrity < infrastructureAfter.maxIntegrity;
}

/** Distinguishes structural damage from the timed garrison reorganization applied after capture. */
export function projectCampaignAfterActionInfrastructureEffect(
  view: CampaignAfterActionInfrastructureEffectView
): string | null {
  const after = view.infrastructureAfter;
  if (!after) return null;
  const capacityPercent = Math.round(view.effectivenessAfter * 100);
  if (after.integrity >= after.maxIntegrity && after.captureDisruptionUntilSegment !== null) {
    const returnTime = view.disruptionTimeLabel ? ` · full capacity returns ${view.disruptionTimeLabel}` : "";
    return `${view.roleLabel}: captured intact · ${capacityPercent}% operational capacity while the new garrison reorganizes${returnTime}`;
  }
  const integrityBefore = view.integrityBefore ?? after.integrity;
  const reorganization = after.captureDisruptionUntilSegment !== null && view.disruptionTimeLabel
    ? ` · garrison reorganization continues until ${view.disruptionTimeLabel}`
    : "";
  return `${view.roleLabel}: ${integrityBefore} → ${after.integrity} integrity · ${capacityPercent}% operational capacity${reorganization}`;
}
