/**
 * Unlock metadata catalog for routing gated content purchases through the main site.
 * Core content remains accessible without purchase; unlock SKUs redirect to the primary checkout flow.
 */

export interface UnlockCatalog {
  /** Region keys that remain playable without purchase (aligns with REGION_OPTIONS). */
  readonly coreRegions: readonly string[];
  /** War college keys that remain playable without purchase (aligns with SCHOOL_OPTIONS). */
  readonly coreSchools: readonly string[];
  /** Region keys that require an unlock purchase. */
  readonly unlockRegions: readonly string[];
  /** War college keys that require an unlock purchase. */
  readonly unlockSchools: readonly string[];
  /** Unit allocation keys that require an unlock purchase (aligns with allocationOptions). */
  readonly unlockUnits: readonly string[];
  /** Subscription plans that unlock the full Four Star General roster. */
  readonly fullAccessPlanIds: readonly string[];
  /** Base URL for purchase redirects handled on the main site. */
  readonly purchaseBaseUrl: string;
}

/**
 * Regions (factions) that remain accessible without a purchase.
 * Keys align to REGION_OPTIONS entries in commissioningOptions.ts.
 */
export const CORE_REGION_KEYS: readonly string[] = [
  "western-protectorate",
  "atlantic-alliance"
] as const;

/**
 * Regions that remain gated until purchased or granted by a full-game entitlement.
 */
export const UNLOCK_REGION_KEYS: readonly string[] = [
  "northern-reach",
  "eastern-steppes",
  "southern-republics"
] as const;

/**
 * War colleges that remain accessible without a purchase.
 * Keys align to SCHOOL_OPTIONS entries in commissioningOptions.ts.
 */
export const CORE_SCHOOL_KEYS: readonly string[] = [
  "imperial-war-academy",
  "coastal-defense-college"
] as const;

/**
 * War colleges that remain gated until purchased or granted by a full-game entitlement.
 */
export const UNLOCK_SCHOOL_KEYS: readonly string[] = [
  "mountain-ranger-school",
  "armored-command-college",
  "strategic-logistics-institute"
] as const;

/**
 * Unit allocation keys that require an unlock routed through the main site checkout.
 * Keys align to allocationOptions in unitAllocation.ts.
 */
export const UNLOCK_UNIT_KEYS: readonly string[] = [
  "rocketArtilleryBattalion",
  "recon",
  "assaultGunBattalion",
  "spArtilleryGroup",
  "apcHalftrackCompany",
  "apcTruckColumn"
] as const;

export const FULL_GAME_PLAN_IDS: readonly string[] = [
  "fourstargeneral",
  "bundle"
] as const;

/**
 * Centralized purchase link so UI buttons can redirect to the main site checkout flow.
 * Append SKU or context as needed (e.g., `${PURCHASE_BASE_URL}?sku=${sku}`).
 */
export const PURCHASE_BASE_URL = "https://www.sixsmithgames.com/pricing";

/**
 * Full unlock catalog consumed by UI layers when gating or linking to checkout.
 */
export const UNLOCK_CATALOG: UnlockCatalog = {
  coreRegions: CORE_REGION_KEYS,
  coreSchools: CORE_SCHOOL_KEYS,
  unlockRegions: UNLOCK_REGION_KEYS,
  unlockSchools: UNLOCK_SCHOOL_KEYS,
  unlockUnits: UNLOCK_UNIT_KEYS,
  fullAccessPlanIds: FULL_GAME_PLAN_IDS,
  purchaseBaseUrl: PURCHASE_BASE_URL
};

/**
 * Returns true when a given region key is core (no purchase required).
 */
export function isCoreRegion(regionKey: string | null | undefined): boolean {
  if (!regionKey) return false;
  return CORE_REGION_KEYS.includes(regionKey);
}

/**
 * Returns true when a given region key requires a purchase unless the player owns full-game access.
 */
export function isRegionUnlock(regionKey: string | null | undefined): boolean {
  if (!regionKey) return false;
  return UNLOCK_REGION_KEYS.includes(regionKey);
}

/**
 * Returns true when a given war college key is core (no purchase required).
 */
export function isCoreSchool(schoolKey: string | null | undefined): boolean {
  if (!schoolKey) return false;
  return CORE_SCHOOL_KEYS.includes(schoolKey);
}

/**
 * Returns true when a given war college key requires a purchase unless the player owns full-game access.
 */
export function isSchoolUnlock(schoolKey: string | null | undefined): boolean {
  if (!schoolKey) return false;
  return UNLOCK_SCHOOL_KEYS.includes(schoolKey);
}

/**
 * Returns true when a unit allocation key requires an unlock purchase.
 */
export function isUnitUnlock(unitKey: string | null | undefined): boolean {
  if (!unitKey) return false;
  return UNLOCK_UNIT_KEYS.includes(unitKey);
}

/**
 * Returns true when a subscription plan unlocks the full Four Star General roster.
 */
export function isFullGamePlan(planId: string | null | undefined): boolean {
  if (!planId) return false;
  return FULL_GAME_PLAN_IDS.includes(planId);
}

/**
 * Builds the purchase URL for a specific SKU routed through the main site checkout flow.
 * The SKU string should match client-side identifiers (e.g., unit key or school key).
 */
export function buildPurchaseUrl(sku: string): string {
  const encodedSku = encodeURIComponent(sku);
  return `${PURCHASE_BASE_URL}?sku=${encodedSku}`;
}
