/**
 * Unlock metadata catalog for routing gated content purchases through the main site.
 * Core content remains accessible without purchase; unlock SKUs redirect to the primary checkout flow.
 */
/**
 * Regions (factions) that remain accessible without a purchase.
 * Keys align to REGION_OPTIONS entries in commissioningOptions.ts.
 */
export const CORE_REGION_KEYS = [
    "western-protectorate",
    "atlantic-alliance"
];
/**
 * Regions that remain gated until purchased or granted by a full-game entitlement.
 */
export const UNLOCK_REGION_KEYS = [
    "northern-reach",
    "eastern-steppes",
    "southern-republics"
];
/**
 * War colleges that remain accessible without a purchase.
 * Keys align to SCHOOL_OPTIONS entries in commissioningOptions.ts.
 */
export const CORE_SCHOOL_KEYS = [
    "imperial-war-academy",
    "coastal-defense-college"
];
/**
 * War colleges that remain gated until purchased or granted by a full-game entitlement.
 */
export const UNLOCK_SCHOOL_KEYS = [
    "mountain-ranger-school",
    "armored-command-college",
    "strategic-logistics-institute"
];
/**
 * Unit allocation keys that require an unlock routed through the main site checkout.
 * Keys align to allocationOptions in unitAllocation.ts.
 */
export const UNLOCK_UNIT_KEYS = [
    "rocketArtilleryBattalion",
    "recon",
    "assaultGunBattalion",
    "spArtilleryGroup",
    "apcHalftrackCompany"
];
/**
 * Campaign keys that require full-game access (no individual campaign purchase).
 * Campaign mode is gated behind subscription to fourstargeneral or bundle.
 */
export const UNLOCK_CAMPAIGN_KEYS = [
    "campaign"
];
export const FULL_GAME_PLAN_IDS = [
    "fourstargeneral",
    "bundle"
];
/**
 * Centralized purchase link so UI buttons can redirect to the main site checkout flow.
 * Append SKU or context as needed (e.g., `${PURCHASE_BASE_URL}?sku=${sku}`).
 */
export const PURCHASE_BASE_URL = "https://www.sixsmithgames.com/pricing";
/**
 * Full unlock catalog consumed by UI layers when gating or linking to checkout.
 */
export const UNLOCK_CATALOG = {
    coreRegions: CORE_REGION_KEYS,
    coreSchools: CORE_SCHOOL_KEYS,
    unlockRegions: UNLOCK_REGION_KEYS,
    unlockSchools: UNLOCK_SCHOOL_KEYS,
    unlockUnits: UNLOCK_UNIT_KEYS,
    unlockCampaigns: UNLOCK_CAMPAIGN_KEYS,
    fullAccessPlanIds: FULL_GAME_PLAN_IDS,
    purchaseBaseUrl: PURCHASE_BASE_URL
};
/**
 * Returns true when a given region key is core (no purchase required).
 */
export function isCoreRegion(regionKey) {
    if (!regionKey)
        return false;
    return CORE_REGION_KEYS.includes(regionKey);
}
/**
 * Returns true when a given region key requires a purchase unless the player owns full-game access.
 */
export function isRegionUnlock(regionKey) {
    if (!regionKey)
        return false;
    return UNLOCK_REGION_KEYS.includes(regionKey);
}
/**
 * Returns true when a given war college key is core (no purchase required).
 */
export function isCoreSchool(schoolKey) {
    if (!schoolKey)
        return false;
    return CORE_SCHOOL_KEYS.includes(schoolKey);
}
/**
 * Returns true when a given war college key requires a purchase unless the player owns full-game access.
 */
export function isSchoolUnlock(schoolKey) {
    if (!schoolKey)
        return false;
    return UNLOCK_SCHOOL_KEYS.includes(schoolKey);
}
/**
 * Returns true when a unit allocation key requires an unlock purchase.
 */
export function isUnitUnlock(unitKey) {
    if (!unitKey)
        return false;
    return UNLOCK_UNIT_KEYS.includes(unitKey);
}
/**
 * Returns true when a subscription plan unlocks the full Four Star General roster.
 */
export function isFullGamePlan(planId) {
    if (!planId)
        return false;
    return FULL_GAME_PLAN_IDS.includes(planId);
}
/**
 * Returns true when a campaign key requires full-game access (no individual campaign purchase).
 */
export function isCampaignUnlock(campaignKey) {
    if (!campaignKey)
        return false;
    return UNLOCK_CAMPAIGN_KEYS.includes(campaignKey);
}
/**
 * Builds the purchase URL for a specific SKU routed through the main site checkout flow.
 * The SKU string should match client-side identifiers (e.g., unit key or school key).
 */
export function buildPurchaseUrl(sku) {
    const encodedSku = encodeURIComponent(sku);
    return `${PURCHASE_BASE_URL}?sku=${encodedSku}`;
}
