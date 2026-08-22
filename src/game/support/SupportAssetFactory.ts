import { getFormation } from "../../data/unitSystem/formations";
import type { SupportAssetSnapshot } from "../GameEngine";

/** Build one off-map tactical asset from the same definition used by precombat requisitions. */
export function createOffMapSupportAsset(
  allocationKey: string,
  id: string,
  labelOverride?: string
): SupportAssetSnapshot | null {
  const formation = getFormation(allocationKey);
  if (!formation || formation.requisition.category !== "support" || formation.tacticalUnitType) {
    return null;
  }

  const isArtillery = allocationKey === "corpsArtilleryGroup"
    || formation.purpose.includes("indirectFire");
  const maxCharges = allocationKey === "corpsArtilleryGroup"
    ? 3
    : allocationKey === "shoreFireControlParty" ? 2 : 1;
  const strikeDamageCap = allocationKey === "shoreFireControlParty"
    ? 30
    : allocationKey === "corpsArtilleryGroup" ? 24 : 22;

  return {
    id,
    label: labelOverride ?? formation.label,
    type: isArtillery ? "artillery" : "other",
    status: "ready",
    charges: maxCharges,
    maxCharges,
    cooldown: 0,
    maxCooldown: isArtillery ? 3 : 2,
    assignedHex: null,
    notes: isArtillery
      ? `${formation.gameplayDescription} Use an infantry, recon, or leg specialist observer to call fire on observed enemy hexes.`
      : formation.gameplayDescription,
    queuedHex: null,
    queuedByHex: null,
    strikeDamageCap
  };
}
