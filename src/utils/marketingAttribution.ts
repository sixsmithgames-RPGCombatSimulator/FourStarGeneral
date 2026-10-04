/**
 * MODULE: Four Star General marketing attribution
 * WHAT: Builds bounded campaign tags for main-site sign-in and purchase links.
 * WHY: The live itch.io listing opens the game first, so later conversion links
 * need to carry the original marketplace source into Sixsmith Games analytics.
 *
 * DEPENDENCIES: Browser URL and document referrer values only.
 * EXPORTS: Attribution resolution and website URL construction helpers.
 */

export interface FsgMarketingAttribution {
  readonly source: string;
  readonly medium: string;
  readonly campaign: string;
}

export interface FsgAttributionContext {
  readonly referrer: string;
  readonly search: string;
}

const SAFE_CAMPAIGN_VALUE = /^[a-z0-9._-]{1,80}$/;
const DEFAULT_ATTRIBUTION: FsgMarketingAttribution = {
  source: "four_star_general",
  medium: "product_app",
  campaign: "four_star_general_player"
};

/**
 * WHAT: Accepts one bounded lowercase campaign value.
 * WHY: Marketing links must never carry free-form or identity-like text.
 *
 * @param value - Raw URL parameter value.
 * @returns A safe campaign value or null when the input violates the contract.
 */
function safeCampaignValue(value: string | null): string | null {
  const normalized = (value ?? "").trim().toLowerCase();
  return SAFE_CAMPAIGN_VALUE.test(normalized) ? normalized : null;
}

/**
 * WHAT: Determines whether the game's incoming referrer is itch.io.
 * WHY: itch.io is the current marketplace source that otherwise disappears
 * after the player moves from the game to the main website.
 *
 * @param referrer - Browser referrer URL for the current game page.
 * @returns True only for itch.io or one of its subdomains.
 */
function isItchReferrer(referrer: string): boolean {
  if (!referrer) return false;
  try {
    const hostname = new URL(referrer).hostname.toLowerCase();
    return hostname === "itch.io" || hostname.endsWith(".itch.io");
  } catch {
    return false;
  }
}

/**
 * WHAT: Resolves stable source, medium, and campaign tags for an in-game exit.
 * WHY: Explicit safe campaign tags should survive, while an untagged itch.io
 * visit must still be recognizable in the Operations conversion report.
 *
 * @param context - Initial referrer and current game query string.
 * @returns A complete, non-identifying attribution record.
 */
export function resolveFsgMarketingAttribution(
  context: FsgAttributionContext
): FsgMarketingAttribution {
  const parameters = new URLSearchParams(context.search);
  const explicitSource = safeCampaignValue(parameters.get("utm_source"));
  const explicitMedium = safeCampaignValue(parameters.get("utm_medium"));
  const explicitCampaign = safeCampaignValue(parameters.get("utm_campaign"));

  if (explicitSource) {
    return {
      source: explicitSource === "itch.io" ? "itchio" : explicitSource,
      medium: explicitMedium ?? DEFAULT_ATTRIBUTION.medium,
      campaign: explicitCampaign ?? DEFAULT_ATTRIBUTION.campaign
    };
  }

  if (isItchReferrer(context.referrer)) {
    return {
      source: "itchio",
      medium: "game_listing",
      campaign: "four_star_general"
    };
  }

  return DEFAULT_ATTRIBUTION;
}

/**
 * WHAT: Appends Four Star General attribution and fixed destination parameters.
 * WHY: Sign-in and pricing use different parameters but must share identical
 * acquisition semantics without cookies or persistent browser storage.
 *
 * @param baseUrl - Absolute Sixsmith Games destination URL.
 * @param destinationParameters - Existing destination-specific query values.
 * @param context - Optional pure context for tests; the browser supplies it in production.
 * @returns The complete attributed URL.
 */
export function buildAttributedWebsiteUrl(
  baseUrl: string,
  destinationParameters: Readonly<Record<string, string>>,
  context?: FsgAttributionContext
): string {
  const browserContext: FsgAttributionContext = context ?? {
    referrer: typeof document === "undefined" ? "" : document.referrer,
    search: typeof window === "undefined" ? "" : window.location.search
  };
  const attribution = resolveFsgMarketingAttribution(browserContext);
  const url = new URL(baseUrl);

  Object.entries(destinationParameters).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  url.searchParams.set("utm_source", attribution.source);
  url.searchParams.set("utm_medium", attribution.medium);
  url.searchParams.set("utm_campaign", attribution.campaign);
  return url.toString();
}
