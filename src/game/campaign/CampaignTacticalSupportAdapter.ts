import type { SupportAssetSnapshot } from "../GameEngine";
import { createOffMapSupportAsset } from "../support/SupportAssetFactory";
import { CAMPAIGN_NON_FORMATION_SUPPORT_KEYS } from "./campaignForceMapping";
import type { CampaignBattlePackage } from "./engagements/CampaignEngagementLedgerTypes";
import { createStableCampaignRecordId } from "./runtime/CampaignCanonical";

/** Stable identity shared by tactical initialization and campaign result extraction. */
export function campaignSupportAssetId(
  battlePackage: Pick<CampaignBattlePackage, "packageId">,
  allocationKey: string,
  ordinal: number
): string {
  return createStableCampaignRecordId(
    "campaign-support",
    battlePackage.packageId,
    allocationKey,
    ordinal
  );
}

/** Convert frozen non-formation commitments into real tactical support-board assets. */
export function buildCampaignTacticalSupportAssets(
  battlePackage: CampaignBattlePackage
): SupportAssetSnapshot[] {
  const supported = new Set<string>(CAMPAIGN_NON_FORMATION_SUPPORT_KEYS);
  return battlePackage.supportCommitments.flatMap((commitment) => {
    if (!supported.has(commitment.allocationKey)) return [];
    const assets: SupportAssetSnapshot[] = [];
    for (let ordinal = 0; ordinal < commitment.quantity; ordinal += 1) {
      const asset = createOffMapSupportAsset(
        commitment.allocationKey,
        campaignSupportAssetId(battlePackage, commitment.allocationKey, ordinal)
      );
      if (!asset) {
        throw new Error(`Campaign support ${commitment.allocationKey} has no tactical support definition.`);
      }
      assets.push(asset);
    }
    return assets;
  });
}
