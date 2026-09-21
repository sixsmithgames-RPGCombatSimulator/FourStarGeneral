import { assessAirshowSampleCadence } from "./e2e/support/airshowTemporalAudit";
import { registerTest } from "./harness.js";

function requireCadence(
  label: string,
  intervals: ReadonlyArray<number>,
  expected: {
    readonly passed: boolean;
    readonly delayedSampleGapCount: number;
    readonly maximumSampleGapMs: number;
  }
): void {
  const result = assessAirshowSampleCadence(intervals, 100);
  if (
    result.passed !== expected.passed
    || result.delayedSampleGapCount !== expected.delayedSampleGapCount
    || result.maximumSampleGapMs !== expected.maximumSampleGapMs
  ) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(result)}.`);
  }
}

registerTest("AIRSHOW_TEMPORAL_CADENCE_ACCEPTS_STABLE_SAMPLING", async ({ Given, When, Then }) => {
  await Given("a long browser trace sampled at the canonical 100ms cadence", async () => {});
  await When("the temporal observer cadence is certified", async () => {});
  await Then("ordinary scheduling variation passes without delayed gaps", async () => {
    requireCadence("stable cadence", [98, 100, 101, 99, 103, 100, 97, 102, 100], {
      passed: true,
      delayedSampleGapCount: 0,
      maximumSampleGapMs: 103
    });
  });
});

registerTest("AIRSHOW_TEMPORAL_CADENCE_RECORDS_ONE_ISOLATED_SCHEDULER_DELAY", async ({ Given, When, Then }) => {
  await Given("an otherwise stable trace with one 317ms browser-scheduler delay", async () => {});
  await When("the temporal observer cadence is certified", async () => {});
  await Then("the isolated delay remains visible evidence without invalidating aircraft continuity", async () => {
    requireCadence("isolated scheduler delay", [...Array<number>(743).fill(100), 317], {
      passed: true,
      delayedSampleGapCount: 1,
      maximumSampleGapMs: 317
    });
  });
});

registerTest("AIRSHOW_TEMPORAL_CADENCE_REJECTS_REPEATED_OR_SEVERE_GAPS", async ({ Given, When, Then }) => {
  await Given("traces with repeated delayed callbacks or one half-second blind spot", async () => {});
  await When("the temporal observer cadence is certified", async () => {});
  await Then("both patterns fail the release certificate", async () => {
    requireCadence("repeated delays", [...Array<number>(743).fill(100), 317, 340], {
      passed: false,
      delayedSampleGapCount: 2,
      maximumSampleGapMs: 340
    });
    requireCadence("severe blind spot", [...Array<number>(743).fill(100), 500], {
      passed: false,
      delayedSampleGapCount: 1,
      maximumSampleGapMs: 500
    });
  });
});

registerTest("AIRSHOW_TEMPORAL_CADENCE_REJECTS_NON_ISOLATED_SHORT_TRACE_OUTLIER", async ({ Given, When, Then }) => {
  await Given("a short trace with one gap too large to be statistically isolated", async () => {});
  await When("the temporal observer cadence is certified", async () => {});
  await Then("the same 317ms gap rejected in a short run cannot hide behind a global allowance", async () => {
    requireCadence("short-trace outlier", [...Array<number>(99).fill(100), 317], {
      passed: false,
      delayedSampleGapCount: 1,
      maximumSampleGapMs: 317
    });
  });
});

registerTest("AIRSHOW_TEMPORAL_CADENCE_REJECTS_REPEATED_MODERATE_HITCHING", async ({ Given, When, Then }) => {
  await Given("a trace whose p99 contains repeated sub-300ms hitches", async () => {});
  await When("the temporal observer cadence is certified", async () => {});
  await Then("moderate hitching fails even though no interval crosses the severe-gap threshold", async () => {
    requireCadence("moderate p99 hitching", [...Array<number>(98).fill(100), 217, 250], {
      passed: false,
      delayedSampleGapCount: 0,
      maximumSampleGapMs: 250
    });
  });
});

registerTest("AIRSHOW_TEMPORAL_CADENCE_REQUIRES_VALID_EVIDENCE_AND_TARGET", async ({ Given, When, Then }) => {
  await Given("empty cadence evidence and an invalid target interval", async () => {});
  await When("the temporal observer cadence is certified", async () => {});
  await Then("empty evidence cannot pass and invalid configuration throws", async () => {
    requireCadence("empty evidence", [], {
      passed: false,
      delayedSampleGapCount: 0,
      maximumSampleGapMs: 0
    });
    let message = "";
    try {
      assessAirshowSampleCadence([100], 0);
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    if (!message.includes("positive finite target interval")) {
      throw new Error(`Expected invalid cadence target to throw, received: ${message || "no error"}.`);
    }
  });
});

registerTest("AIRSHOW_TEMPORAL_CADENCE_LOCKS_BOUNDARY_SEMANTICS", async ({ Given, When, Then }) => {
  await Given("intervals exactly on the moderate, delayed, and hard-gap boundaries", async () => {});
  await When("the temporal observer cadence is certified", async () => {});
  await Then("200ms and 300ms remain inclusive while 500ms is a hard failure", async () => {
    requireCadence("inclusive 300ms boundary", [...Array<number>(743).fill(100), 300], {
      passed: true,
      delayedSampleGapCount: 0,
      maximumSampleGapMs: 300
    });
    requireCadence("exclusive 500ms boundary", [...Array<number>(743).fill(100), 500], {
      passed: false,
      delayedSampleGapCount: 1,
      maximumSampleGapMs: 500
    });
  });
});

registerTest("AIRSHOW_TEMPORAL_CADENCE_REJECTS_SUSTAINED_DEGRADATION", async ({ Given, When, Then }) => {
  await Given("a trace whose typical interval is materially slower than its 100ms target", async () => {});
  await When("the temporal observer cadence is certified", async () => {});
  await Then("a degraded median fails even without a single extreme gap", async () => {
    requireCadence("degraded median", [161, 165, 170, 175, 180, 185, 190, 195, 200], {
      passed: false,
      delayedSampleGapCount: 0,
      maximumSampleGapMs: 200
    });
  });
});
