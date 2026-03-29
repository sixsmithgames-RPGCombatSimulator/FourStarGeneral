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

registerTest("BATTLE_SCREEN_STACK_UNIT_SELECTOR_SWITCHES_THE_ACTIVE_UNIT_ON_A_SHARED_HEX", async ({ Then }) => {
  let refreshedHexKey: string | null = null;
  const fakeScreen = {
    selectedHexKey: "6,9",
    selectedPlayerUnitId: "engineer_1",
    getPlayerStackMembersAtHex: () => ([
      {
        unitId: "engineer_1",
        unit: { type: "Engineer", strength: 100 },
        isAutomated: false
      },
      {
        unitId: "infantry_2",
        unit: { type: "Infantry_42", strength: 76 },
        isAutomated: false
      }
    ]),
    updateSelectionFeedback: (hexKey: string | null) => {
      refreshedHexKey = hexKey;
    }
  };

  await (BattleScreen.prototype as unknown as {
    executeSelectionIntelAction: (this: typeof fakeScreen, actionId: string) => Promise<void>;
  }).executeSelectionIntelAction.call(fakeScreen, "selectUnit:infantry_2");

  await Then("the chosen stack member becomes the active unit and the overlay refreshes in place", async () => {
    if (fakeScreen.selectedPlayerUnitId !== "infantry_2") {
      throw new Error(`Expected stack selector to activate infantry_2, received ${fakeScreen.selectedPlayerUnitId}.`);
    }
    if (refreshedHexKey !== "6,9") {
      throw new Error(`Expected stack selector to refresh intel for 6,9, received ${refreshedHexKey}.`);
    }
  });
});
