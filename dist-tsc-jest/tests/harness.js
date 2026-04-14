const tests = [];
export function registerTest(id, spec) {
    tests.push({ id, spec });
}
export async function runAllTests() {
    for (const test of tests) {
        if (typeof document !== "undefined") {
            document.body.innerHTML = "";
        }
        const log = [];
        const context = {
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
