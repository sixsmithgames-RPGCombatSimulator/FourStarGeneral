"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SEGMENTS_PER_DAY = exports.CAMPAIGN_SEGMENT_HOURS = exports.CAMPAIGN_HEX_SCALE_KM = void 0;
/**
 * Campaign map tile scale constant so downstream modules can convert distances and ranges.
 * The campaign layer models each hex as ten kilometers.
 */
exports.CAMPAIGN_HEX_SCALE_KM = 10;
/**
 * Campaign time resolution: each turn represents 3 hours.
 * 8 segments = 1 day (24 hours).
 */
exports.CAMPAIGN_SEGMENT_HOURS = 3;
exports.SEGMENTS_PER_DAY = 8;
