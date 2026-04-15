/**
 * Air Show Diagnostics Runner
 *
 * Comprehensive test suite for validating North Star Spec compliance:
 * - Progress-based timing (bomber progress 0.0-1.0)
 * - Speed model (fighter V, bomber V/2, escort acceleration at 0.15)
 * - Scenario choreography (Scenarios 1-5)
 * - Recent bug fix regressions (bomber visibility, flak timing)
 */
import "./domEnvironment.js";
import { runAllTests } from "./harness.js";
// Core air show choreography and motion tests
import "./AirShow.fighterMotion.test.js";
// Scene building and formation spacing tests
import "./AirCombatSceneBuilder.test.js";
// North Star Spec progress-based timing validation
import "./AirShow.progressTiming.test.js";
// Speed model and role-based behavior tests
import "./AirShow.speedModel.test.js";
// Regression tests for recent bug fixes
import "./AirShow.regression.test.js";
(async () => {
    console.log("\n========================================");
    console.log("  AIR SHOW NORTH STAR SPEC VALIDATION");
    console.log("========================================\n");
    console.log("Test Categories:");
    console.log("  - Fighter Motion & Path Continuity");
    console.log("  - Scene Building & Formation Spacing");
    console.log("  - Progress-Based Timing (0.0-1.0)");
    console.log("  - Speed Model (V / V/2 / Accel at 0.15)");
    console.log("  - Bug Fix Regression Tests");
    console.log("  - Scenario Choreography (1-5)\n");
    const startTime = Date.now();
    await runAllTests();
    const duration = Date.now() - startTime;
    console.log("\n========================================");
    console.log(`  ALL TESTS COMPLETED in ${duration}ms`);
    console.log("========================================\n");
})();
