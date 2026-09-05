import type { SupportAssetSnapshot } from "../GameEngine";
import { createOffMapSupportAsset } from "../support/SupportAssetFactory";
import { CAMPAIGN_NON_FORMATION_SUPPORT_KEYS } from "./campaignForceMapping";
import type { CampaignBattlePackage } from "./engagements/CampaignEngagementLedgerTypes";
import { createStableCampaignRecordId } from "./runtime/CampaignCanonical";
import { campaignPackageNavalSources, CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY } from "./logistics/CampaignNavalSupportService";

/** Stable identity shared by tactical initialization and campaign result extraction. */
export function campaignSupportAssetId(
  battlePackage: CampaignBattlePackage,
  allocationKey: string,
  ordinal: number
): string {
  if (battlePackage.packageVersion >= 3 && allocationKey === CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY) {
    const source = campaignPackageNavalSources(battlePackage)[ordinal];
    if (!source) throw new Error("Campaign tactical support has no exact source for this asset. Reload the committed battle.");
    return createStableCampaignRecordId("campaign-support", battlePackage.packageId, allocationKey, source.sourceId);
  }
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
    const navalSources = battlePackage.packageVersion >= 3 && commitment.allocationKey === CAMPAIGN_NAVAL_SUPPORT_ALLOCATION_KEY
      ? campaignPackageNavalSources(battlePackage) : null;
    const assets: SupportAssetSnapshot[] = [];
    for (let ordinal = 0; ordinal < commitment.quantity; ordinal += 1) {
      const source = navalSources?.[ordinal];
      if (navalSources && !source) throw new Error("Campaign naval asset lacks its frozen fleet identity. Reload the committed battle.");
      const asset = createOffMapSupportAsset(
        commitment.allocationKey,
        campaignSupportAssetId(battlePackage, commitment.allocationKey, ordinal),
        source ? `${source.label} naval gunfire` : undefined
      );
      if (!asset) {
        throw new Error(`Campaign support ${commitment.allocationKey} has no tactical support definition.`);
      }
      assets.push(asset);
    }
    return assets;
  });
}
