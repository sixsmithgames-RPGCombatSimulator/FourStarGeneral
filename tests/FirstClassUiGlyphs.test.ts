/** Guards the live campaign route against operating-system emoji replacing owned game art or plain language. */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { registerTest } from "./harness.js";

const LIVE_CAMPAIGN_UI_FILES = [
  "index.html",
  "src/ui/screens/LandingScreen.ts",
  "src/ui/screens/PrecombatScreen.ts",
  "src/ui/screens/BattleScreen.ts",
  "src/ui/components/EnhancedInitiativeTurnControls.ts",
  "src/ui/components/InitiativeQueueDisplay.ts",
  "src/ui/components/InitiativeTurnControls.ts"
] as const;

registerTest("FIRST_CLASS_CAMPAIGN_UI_USES_SPRITES_OR_LANGUAGE_INSTEAD_OF_EMOJI", async ({ Given, When, Then }) => {
  let violations: string[] = [];

  await Given("the source files used from campaign entry through tactical combat", () => {});
  await When("their player-facing markup and copy are scanned for pictographic emoji", () => {
    violations = LIVE_CAMPAIGN_UI_FILES.flatMap((relativePath) => {
      const source = readFileSync(join(process.cwd(), relativePath), "utf8");
      const matches = source.match(/\p{Extended_Pictographic}/gu) ?? [];
      return matches.length > 0 ? [`${relativePath}: ${[...new Set(matches)].join(" ")}`] : [];
    });
  });
  await Then("no operating-system emoji substitute for project-owned art or explicit status language", () => {
    if (violations.length > 0) {
      throw new Error(`Campaign UI still contains emoji: ${violations.join("; ")}.`);
    }
  });
});
