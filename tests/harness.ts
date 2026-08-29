/**
 * Minimal Given/When/Then harness used to express deterministic scenario tests in the DSL style.
 * Tests are registered via `registerTest` and executed sequentially through `runAllTests`.
 */
export interface TestContext {
  Given(description: string, fn: () => void | Promise<void>): Promise<void>;
  When(description: string, fn: () => void | Promise<void>): Promise<void>;
  Then(description: string, fn: () => void | Promise<void>): Promise<void>;
}

export type TestFn = (ctx: TestContext) => Promise<void> | void;

interface TestEntry {
  id: string;
  spec: TestFn;
}

const tests: TestEntry[] = [];

export function registerTest(id: string, spec: TestFn): void {
  tests.push({ id, spec });
}

export async function runAllTests(): Promise<void> {
  const processLike = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  const requestedFilter = processLike?.env?.TEST_FILTER?.trim();
  const filter = requestedFilter ? new RegExp(requestedFilter, "i") : null;
  const selectedTests = filter ? tests.filter((test) => filter.test(test.id)) : tests;
  if (filter && selectedTests.length === 0) {
    throw new Error(`TEST_FILTER '${requestedFilter}' matched no registered test.`);
  }

  for (const test of selectedTests) {
    if (typeof document !== "undefined") {
      document.body.innerHTML = "";
    }

    const log: string[] = [];
    const context: TestContext = {
      async Given(description, fn) {
        log.push(`Given ${description}`);
        await fn();
      },
      async When(description, fn) {
        log.push(`When ${description}`);
        await fn();
      },
      async Then(description, fn) {
        log.push(`Then ${description}`);
        await fn();
      }
    };

    await test.spec(context);
    console.log(`[TEST PASS] ${test.id}`);
    log.forEach((line) => console.log(`  ${line}`));
  }
}
