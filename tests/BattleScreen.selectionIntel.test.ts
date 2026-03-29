import "./domEnvironment.js";
import { registerTest } from "./harness.js";
import { BattleScreen } from "../src/ui/screens/BattleScreen";

registerTest("BATTLE_SCREEN_SELECTION_INTEL_NOTES_SKIP_REDUNDANT_SENTRY_AND_FORTIFICATION_COPY", async ({ Then }) => {
  const fakeScreen = {
    canUnitDigIn: () => false,
    describeHexModification: () => "fortifications"
  };

  const notes = (BattleScreen.prototype as unknown as {
    buildBattleIntelNotes: (unit: unknown, commandState: unknown) => string[];
  }).buildBattleIntelNotes.call(
    fakeScreen,
    { type: "AT_Gun_50mm", entrench: 0 },
    {
      suppressionState: "none",
      suppressorCount: 0,
      isOnSentry: true,
      canEnterSentry: false,
      sentryReason: "Hold position and stay uncommitted this turn to set sentry.",
      existingHexModification: { type: "fortifications" },
      canDigIn: false,
      digInReason: null,
      isEngineer: false,
      canBuildModification: false,
      buildReason: null
    }
  );

  await Then("redundant sentry and fortification notes are excluded", async () => {
    if (notes.some((note) => note.includes("Sentry"))) {
      throw new Error(`Expected sentry note to be omitted because the action card already covers it, received ${JSON.stringify(notes)}.`);
    }
    if (notes.some((note) => note.includes("fortifications"))) {
      throw new Error(`Expected existing fortification note to be omitted because the chip already covers it, received ${JSON.stringify(notes)}.`);
    }
    if (!notes.includes("Use the movement and attack overlays on the map to issue this unit's next order.")) {
      throw new Error(`Expected the generic fallback guidance to remain after redundant notes are removed, received ${JSON.stringify(notes)}.`);
    }
  });
});
