/** Temporary presentation-only feature flags used during the first-class campaign UI migration. */

interface FourStarFeatureFlagHost {
  readonly __FSG_FEATURE_FLAGS__?: Readonly<Record<string, boolean>>;
}

const STORAGE_KEY = "four-star-general:campaignCommandUIV2";

/**
 * Resolves the V2 command-interface flag without affecting campaign state or saves.
 * Query string is useful for QA, local storage for staged rollout, and the global host for deployment configuration.
 */
export function isCampaignCommandUIV2Enabled(): boolean {
  if (typeof window === "undefined") return true;
  const queryValue = new URLSearchParams(window.location.search).get("campaign-ui");
  if (queryValue === "compat") return false;
  if (queryValue === "v2") return true;

  const hostValue = (globalThis as typeof globalThis & FourStarFeatureFlagHost)
    .__FSG_FEATURE_FLAGS__?.campaignCommandUIV2;
  if (typeof hostValue === "boolean") return hostValue;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "false") return false;
    if (stored === "true") return true;
  } catch {
    // Storage can be unavailable in privacy-restricted browsers; the safe default remains V2.
  }
  return true;
}
