/**
 * MODULE: CampaignSegmentTime.test
 * WHAT: Certifies the single deterministic campaign calendar and clock projection.
 * WHY: CampaignState and the War Room must never drift into separate notions of campaign time.
 */

import { formatCampaignSegmentTime } from "../src/game/campaign/CampaignSegmentTime.js";
import { registerTest } from "./harness.js";

registerTest("CAMPAIGN_SEGMENT_TIME_PROJECTS_LEGACY_DAY_CLOCK", async ({ Given, Then }) => {
  let presentation!: ReturnType<typeof formatCampaignSegmentTime>;

  await Given("a campaign without a historical calendar at the start of day two", () => {
    presentation = formatCampaignSegmentTime(8);
  });

  await Then("the canonical projection preserves the legacy ASCII display label", () => {
    if (presentation.day !== 2
      || presentation.dayLabel !== "Day 2"
      || presentation.timeLabel !== "00:00–03:00"
      || presentation.displayLabel !== "Day 2, 00:00-03:00") {
      throw new Error(`Unexpected legacy campaign time ${JSON.stringify(presentation)}.`);
    }
    if (!Object.isFrozen(presentation)) {
      throw new Error("Campaign time presentation must be immutable once projected.");
    }
  });
});

registerTest("CAMPAIGN_SEGMENT_TIME_PROJECTS_HISTORICAL_OPERATION_DAY", async ({ Given, Then }) => {
  let presentation!: ReturnType<typeof formatCampaignSegmentTime>;

  await Given("the Normandy calendar at segment eleven", () => {
    presentation = formatCampaignSegmentTime(11, {
      startDateIso: "1944-06-06",
      operationDayOffset: 0
    });
  });

  await Then("the canonical projection reports D+1 and the exact UTC date and time", () => {
    if (presentation.day !== 2
      || presentation.dayLabel !== "D+1 · 7 June 1944"
      || presentation.timeLabel !== "09:00–12:00"
      || presentation.displayLabel !== "D+1 · 7 June 1944, 09:00–12:00") {
      throw new Error(`Unexpected historical campaign time ${JSON.stringify(presentation)}.`);
    }
  });
});

registerTest("CAMPAIGN_SEGMENT_TIME_REJECTS_INVALID_AUTHORITY_INPUT", async ({ Given, Then }) => {
  const errors: string[] = [];

  await Given("invalid segment and calendar inputs", () => {
    for (const invoke of [
      () => formatCampaignSegmentTime(-1),
      () => formatCampaignSegmentTime(1.5),
      () => formatCampaignSegmentTime(0, { startDateIso: "1944-02-30", operationDayOffset: 0 })
    ]) {
      try {
        invoke();
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }
  });

  await Then("the shared authority fails loudly rather than inventing a display", () => {
    if (errors.length !== 3
      || !errors[0]?.includes("non-negative safe integer")
      || !errors[1]?.includes("non-negative safe integer")
      || !errors[2]?.includes("does not exist")) {
      throw new Error(`Unexpected validation results ${JSON.stringify(errors)}.`);
    }
  });
});
