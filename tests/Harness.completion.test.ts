/**
 * MODULE: Harness.completion
 * WHAT: Exercises harness completion and timeout reporting in isolated Node processes.
 * WHY: A pending spec must fail the process instead of leaving a partial green run.
 * DEPENDENCIES: Node child processes expose real exit behavior; the harness supplies the DSL.
 * EXPORTS: None; importing this module registers two regression tests.
 */
import assert from "node:assert/strict";
import { execFile, type ExecFileException } from "node:child_process";
import { registerTest } from "./harness.js";

// Resolve beside this emitted test so every output directory tests its own harness.
const harnessUrl = new URL("./harness.js", import.meta.url).href;

/** Captures a child's real exit failure and output for assertions in the parent suite. */
interface HarnessChildResult {
  error: ExecFileException | null;
  stdout: string;
  stderr: string;
}

/**
 * WHAT: Runs one ESM fixture through Node without a shell or a shared test registry.
 * WHY: Only a child process can reproduce premature process exit from a pending Promise.
 * @param source - Complete child module, including its top-level awaited harness call.
 * @returns Captured output and exit error, including launch failures or forced termination.
 */
function runHarnessChild(source: string): Promise<HarnessChildResult> {
  return new Promise((resolve) => {
    execFile(process.execPath, ["--input-type=module", "--eval", source], {
      encoding: "utf8",
      windowsHide: true,
      // This outer bound catches a broken watchdog; a killed child never counts as success.
      timeout: 5_000,
      maxBuffer: 1_048_576,
      // A focused parent run must still execute the child's independently named specs.
      env: { ...process.env, TEST_FILTER: "" }
    }, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
}

/**
 * WHAT: Requires a named timeout failure when a spec never settles and global timers are fake.
 * WHY: Neither Node's unsettled top-level await exit nor an external kill proves watchdog coverage.
 */
registerTest("HARNESS_COMPLETION_STALLED_SPEC_FAILS_WITH_NATIVE_TIMEOUT", async ({ Given, When, Then }) => {
  let source = "";
  let result: HarnessChildResult;

  await Given("a child spec that never settles after global setTimeout is replaced", () => {
    source = `
      globalThis.setTimeout = () => 0;
      const { registerTest, runAllTests } = await import(${JSON.stringify(harnessUrl)});
      registerTest("HARNESS_CHILD_STALLED_SPEC", async ({ When }) => {
        await When("the fixture leaves its Promise pending forever", () => {
          console.log("[CHILD STALLED SPEC STARTED]");
          return new Promise(() => {});
        });
      });
      await runAllTests({ testTimeoutMs: 25 });
    `;
  });

  await When("Node awaits the real harness with a 25ms spec timeout", async () => {
    result = await runHarnessChild(source);
  });

  await Then("the child exits nonzero for the named timeout without a pass or summary", () => {
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.stdout.trim(), "[CHILD STALLED SPEC STARTED]", output);
    assert.ok(result.error, `The stalled child falsely exited successfully.\n${output}`);
    assert.equal(result.error.killed, false, `The outer process timeout killed the child.\n${output}`);
    assert.equal(result.error.signal, null, output);
    assert.equal(typeof result.error.code, "number", output);
    assert.notEqual(result.error.code, 0, output);
    assert.match(result.stderr, /Error: \[TEST TIMEOUT\] HARNESS_CHILD_STALLED_SPEC exceeded 25ms\./, output);
    assert.doesNotMatch(output, /\[TEST PASS\]|\[TEST SUMMARY\]/);
  });
});

/**
 * WHAT: Requires two asynchronously completed specs and the exact final success summary.
 * WHY: A zero exit is valid only after all registered work finishes and is reported in order.
 */
registerTest("HARNESS_COMPLETION_REPORTS_ALL_ASYNC_SPECS_BEFORE_SUMMARY", async ({ Given, When, Then }) => {
  let source = "";
  let result: HarnessChildResult;

  await Given("a child with two specs that complete on later event-loop turns", () => {
    source = `
      import assert from "node:assert/strict";
      import { setTimeout as delay } from "node:timers/promises";
      const { registerTest, runAllTests } = await import(${JSON.stringify(harnessUrl)});
      const completed = [];
      registerTest("HARNESS_CHILD_ASYNC_FIRST", async ({ When }) => {
        await When("the first async operation finishes", async () => {
          await delay(5);
          completed.push("first");
          console.log("[CHILD COMPLETE] first");
        });
      });
      registerTest("HARNESS_CHILD_ASYNC_SECOND", async ({ When }) => {
        assert.deepEqual(completed, ["first"]);
        await When("the second async operation finishes", async () => {
          await delay(5);
          completed.push("second");
          console.log("[CHILD COMPLETE] second");
        });
      });
      await runAllTests();
      assert.deepEqual(completed, ["first", "second"]);
    `;
  });

  await When("Node awaits the complete registered suite", async () => {
    result = await runHarnessChild(source);
  });

  await Then("the child exits zero with exactly two passes and a final 2/2 summary", () => {
    const output = `${result.stdout}\n${result.stderr}`;
    assert.equal(result.error, null, output);
    assert.equal(result.stderr, "", output);
    const lines = result.stdout.trim().split(/\r?\n/);
    assert.deepEqual(lines.filter((line) => line.startsWith("[")), [
      "[CHILD COMPLETE] first",
      "[TEST PASS] HARNESS_CHILD_ASYNC_FIRST",
      "[CHILD COMPLETE] second",
      "[TEST PASS] HARNESS_CHILD_ASYNC_SECOND",
      "[TEST SUMMARY] 2/2 passed"
    ], output);
    assert.equal(lines[lines.length - 1], "[TEST SUMMARY] 2/2 passed", output);
  });
});
