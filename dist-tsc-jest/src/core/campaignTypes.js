/**
 * Campaign map tile scale constant so downstream modules can convert distances and ranges.
 * The campaign layer models each hex as ten kilometers.
 */
export const CAMPAIGN_HEX_SCALE_KM = 10;
/**
 * Campaign time resolution: each turn represents 3 hours.
 * 8 segments = 1 day (24 hours).
 */
export const CAMPAIGN_SEGMENT_HOURS = 3;
export const SEGMENTS_PER_DAY = 8;
