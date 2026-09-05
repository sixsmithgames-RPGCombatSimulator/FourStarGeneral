/** Small, pure adapters that keep runtime coordinate contracts out of campaign presentation components. */

import { CoordinateSystem } from "../../rendering/CoordinateSystem";
import type { CampaignAfterActionDecisionTarget } from "../../game/campaign/aar/CampaignAfterActionReportTypes";
import { isCampaignGridReferenceLabel, type CampaignLocationPresentation } from "./CampaignLocationPresentation";

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

export interface CampaignInfrastructureRecoveryView {
  readonly integrity: number;
  readonly maxIntegrity: number;
  readonly captureDisruptionUntilSegment: number | null;
  readonly disruptionTimeLabel: string | null;
}

export interface CampaignInfrastructureConditionView {
  readonly roleLabel: string;
  readonly damageStateLabel: string;
  readonly integrity: number;
  readonly maxIntegrity: number;
  readonly effectiveness: number;
  readonly conciseBaseIdentity: boolean;
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
 * Keeps immutable report identities out of headings. Authored report titles remain
 * intact; legacy coordinate titles use supplied geography or a neutral sector label.
 */
export function projectCampaignAfterActionTitle(
  storedTitle: string,
  objectiveLabel: string | null,
  runtimeBattleHexKey: string,
  location?: CampaignLocationPresentation
): string {
  const operationalHexKey = projectRuntimeHexKeyToCampaignOffset(runtimeBattleHexKey);
  if (location && location.secondaryGridReference !== `Grid ${operationalHexKey}`) {
    throw new Error("Cannot present this after-action location: the supplied geography does not match the recorded battle grid. Resolve the report's campaign-map location before reopening it.");
  }
  const titleSubject = storedTitle.replace(/^After action:\s*/i, "").trim();
  if (titleSubject && !isCampaignGridReferenceLabel(titleSubject)) return storedTitle;
  const authoredObjective = objectiveLabel?.trim();
  const primaryLabel = authoredObjective && !isCampaignGridReferenceLabel(authoredObjective)
    ? authoredObjective
    : location?.primaryLabel ?? "Operational sector";
  return `After action: ${primaryLabel}`;
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

/** Projects timed capture recovery without confusing it with player-ordered structural reconstruction. */
export function projectCampaignInfrastructureRecoveryStatus(
  view: CampaignInfrastructureRecoveryView
): string | null {
  if (view.captureDisruptionUntilSegment === null || !view.disruptionTimeLabel) return null;
  return view.integrity < view.maxIntegrity
    ? `The new garrison is reorganizing the position until ${view.disruptionTimeLabel}. Structural reconstruction remains required.`
    : `The new garrison is reorganizing the position. Full capacity returns ${view.disruptionTimeLabel}; no reconstruction order is required.`;
}

/** Builds the one active-inspector condition fact from current infrastructure and timed recovery truth. */
export function projectCampaignInfrastructureCondition(
  view: CampaignInfrastructureConditionView
): string {
  const identity = view.conciseBaseIdentity
    ? view.damageStateLabel
    : `${view.roleLabel} · ${view.damageStateLabel} · ${view.integrity}/${view.maxIntegrity} integrity`;
  return `${identity} · ${Math.round(view.effectiveness * 100)}% operational capacity`;
}
